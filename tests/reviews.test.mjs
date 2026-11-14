import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const api = vm.createContext({ trimString_: value => String(value ?? "").trim() });
vm.runInContext(fs.readFileSync(new URL("../src/54_Reviews.gs", import.meta.url), "utf8"), api);

vm.runInContext(fs.readFileSync(new URL("../src/52_ReviewInsights.gs", import.meta.url), "utf8"), api);
test("App Store reviews require the requested storefront and listing and follow its pagination", () => {
  const app = { platform: "iOS", countryCode: "TR", appId: "123", appKey: "IOS|TR|BANK" };
  const entry = {
    id: { label: "456" }, content: { label: "Yorum" }, updated: { label: "2026-10-01T12:00:00Z" },
    "im:rating": { label: "4" }, author: { name: { label: "Autora" } }
  };
  const url = page => api.marketsReviewFeedUrl_(app, page);
  const link = (rel, href) => ({ attributes: { rel, href } });
  const payload = JSON.stringify({ feed: { entry: [entry], link: [
    link("self", url(1)), link("next", url(2).replace("/json", "/xml") + "?urlDesc=feed")
  ] } });
  const result = api.parseMarketsReviewFeed_(app, 1, payload);
  assert.equal(result.rows[0][0], '["iOS","TR","123","456"]');
  assert.equal(result.more, true);
  assert.equal(JSON.parse(result.rows[0][15]).author, "Autora");
  assert.throws(() => api.parseMarketsReviewFeed_({ ...app, countryCode: "ES" }, 1, payload), /escaparate/);
  assert.throws(() => api.parseMarketsReviewFeed_({ ...app, appId: "124" }, 1, payload), /escaparate/);
  assert.equal(api.marketsReviewLiteral_("=1+1"), "'=1+1");
});

test("an edited review updates its existing row and requeues translation", () => {
  const app = { platform: "iOS", countryCode: "TR", appId: "123", appKey: "IOS|TR|BANK" };
  const id = '["iOS","TR","123","456"]';
  const previous = [id, app.appKey, "TR", "iOS", "123", "456", "2026-10-01T12:00:00Z", 4, "", "", "Old"];
  const properties = new Map();
  const writes = [];
  const sheet = { getLastRow: () => 2, getLastColumn: () => 15, getRange: (row, column, height, width) => ({
    getValues: () => [previous], setValues: values => writes.push({ row, column, width, values })
  }) };
  Object.assign(api, {
    marketsReviewSheet_: () => sheet, openMarketsSpreadsheet_: () => ({}), readAppCatalog_: () => [app],
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties.get(key), setProperty: (key, value) => properties.set(key, value)
    }) },
    SpreadsheetApp: { flush() {} },
    LockService: { getUserLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    UrlFetchApp: { fetch: url => ({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ feed: {
        link: [{ attributes: { rel: "self", href: url } }],
        entry: {
          id: { label: "456" }, content: { label: "Edited" },
          updated: { label: "2026-10-02T12:00:00Z" }, "im:rating": { label: "3" }
        }
      } })
    }) }
  });
  const result = api.collectMarketsReviews_();
  assert.equal(result.added, 0);
  assert.equal(result.updated, 1);
  assert.equal(writes[0].row, 2);
  assert.equal(writes[0].column, 7);
  assert.deepEqual(Array.from(writes[0].values[0].slice(4, 8)), ["Edited", "", "", ""]);
});

test("App Store retries the failed page without blocking the next listing", () => {
  const runtime = vm.createContext({});
  vm.runInContext(fs.readFileSync(new URL("../src/54_Reviews.gs", import.meta.url), "utf8"), runtime);
  const apps = ["123", "456"].map(appId=>({ appId, appKey:appId, countryCode:"TR", platform:"iOS" }));
  const props = new Map(), calls = [];
  const retryKey = "MARKETS_IOS_REVIEW_RETRY|123";
  let fail = true;
  Object.assign(runtime, {
    LockService: { getUserLock: () => ({tryLock:()=>true, releaseLock(){}}) },
    openMarketsSpreadsheet_: () => ({}), marketsReviewSheet_: () => ({getLastRow:()=>1}), marketsReviewWidth_: () => 16,
    readAppCatalog_: () => apps,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => props.get(key), setProperty: (key,value) => props.set(key,value), deleteProperty: key => props.delete(key)
    }) },
    marketsReviewFeedUrl_: (app,page) => app.appId+":"+page,
    UrlFetchApp: { fetch: key => {
      calls.push(key);
      return {getResponseCode:()=>fail && key==="123:3" ? 503 : 200, getContentText:()=>""};
    } },
    parseMarketsReviewFeed_: (app,page) => ({rows:[],more:app.appId==="123" && page<3})
  });
  assert.equal(runtime.collectMarketsReviews_().failures,1);
  assert.deepEqual(calls,["123:1","123:2","123:3","456:1"]);
  const retry = JSON.parse(props.get(retryKey));
  assert.equal(retry.page,3);
  props.set(retryKey,JSON.stringify({...retry,after:0}));
  fail = false;
  assert.equal(runtime.collectMarketsReviews_().failures,0);
  assert.deepEqual(calls.slice(-2),["123:3","456:1"]);
  assert.equal(props.has(retryKey),false);
});

test("Google Play pagination preserves provenance and deduplicates across storefronts", () => {
  vm.runInContext(fs.readFileSync(new URL("../src/53_PlayReviews.gs", import.meta.url), "utf8"), api);
  const item = ["review-123", ["Autora"], 4, null, "Review", [1760000000, 1000000], 0,
    ["Entidad", "Respuesta", [1760001000, 0]]];
  const frame = [["wrb.fr", "oCPfdb", JSON.stringify([[item], [null, "continuation"]])]];
  const page = api.parsePlayReviewPage_(")]}'\n\n" + JSON.stringify(frame));
  assert.equal(page.next, "continuation");
  assert.equal(page.rows[0].date, "2025-10-09T08:53:20.001Z");
  assert.deepEqual(JSON.parse(JSON.stringify(page.rows[0].metadata)), {
    author: "Autora", helpful: 0, replyAuthor: "Entidad", reply: "Respuesta", replyDate: "2025-10-09T09:10:00.000Z"
  });
  assert.throws(() => api.parsePlayReviewPage_("<html>"), /inesperada/);
  const writes = [];
  const sheet = {
    getLastRow: () => writes.length ? 2 : 1,
    getRange: (row, column, height, width) => ({ setValues: rows => writes.push({ row, rows }) })
  };
  Object.assign(api, { ensureSheetCapacity_: () => {}, SpreadsheetApp: { flush() {} } });
  const properties = { getProperty: () => null, setProperty() {} };
  const known = new Map(), summary = { added: 0, updated: 0 };
  const listing = { packageName: "com.example.app", appKey: "ANDROID|ES|APP", countryCode: "ES" };
  api.storePlayReviews_(sheet, properties, known, listing, page.rows, summary, 16);
  api.storePlayReviews_(sheet, properties, known, { ...listing, countryCode: "TR" }, page.rows, summary, 16);
  assert.equal(summary.added, 1);
  assert.equal(summary.updated, 1);
  assert.equal(writes[1].row, 2);
  assert.equal(writes[1].rows[0][2], "ES,TR");
  const changed = [{ ...page.rows[0], metadata: { ...page.rows[0].metadata, helpful: 4 } }];
  api.storePlayReviews_(sheet, properties, known, listing, changed, summary, 16);
  assert.equal(JSON.parse(writes[2].rows[0][15]).helpful, 4);
  assert.equal(writes[2].rows[0][6], page.rows[0].date);
});

test("Play recent scans resume after the page budget and preserve the historical cursor on a rate limit", () => {
  const runtime = vm.createContext({});
  vm.runInContext(fs.readFileSync(new URL("../src/53_PlayReviews.gs", import.meta.url), "utf8"), runtime);
  const listing = { platform: "Android", countryCode: "ES", packageName: "com.example.app" };
  const history = "MARKETS_PLAY_REVIEW|com.example.app|ES";
  const recent = "MARKETS_PLAY_REFRESH|com.example.app|ES";
  const props = new Map([[history, "history"]]);
  const sheet = { getLastRow: () => 1 };
  const calls = [];
  let limited = false;
  Object.assign(runtime, {
    LockService: { getUserLock: () => ({tryLock:()=>true, releaseLock(){}}) },
    openMarketsSpreadsheet_: () => ({}), marketsReviewSheet_: () => sheet, marketsReviewWidth_: () => 16,
    readAppCatalog_: () => [listing],
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => props.get(key) ?? null, setProperty: (key,value) => props.set(key,value),
      deleteProperty: key => props.delete(key)
    }) },
    storePlayReviews_: (_sheet, _properties, _known, _listing, rows, summary) => { summary.added += rows.length; },
    fetchPlayReviewPage_: (_listing, token) => {
      calls.push(token);
      if (limited) throw Object.assign(new Error("Google Play HTTP 429"), {rateLimited:true});
      if (token === "history") return {rows:[],next:"older"};
      if (token === "older") return {rows:[],next:""};
      return {rows:Array.from({length:150},(_,i)=>({id:token+i})),next:token === "3" ? "3" : String(Number(token)+1)};
    }
  });
  const round = runtime.collectMarketsPlayReviews_();
  assert.equal(round.added,450);
  assert.deepEqual(calls,["","1","2","history"]);
  assert.equal(props.get(recent),"3");
  assert.equal(props.get(history),"older");
  limited = true;
  assert.equal(runtime.collectMarketsPlayReviews_().rateLimited,true);
  assert.equal(calls.at(-1),"3");
  assert.equal(props.get(history),"older");
  assert.equal(props.get(recent),"3");
  props.delete("MARKETS_PLAY_REVIEW_PAUSE");
  limited = false;
  assert.equal(runtime.collectMarketsPlayReviews_().failures,1);
  assert.equal(props.has(recent),false);
  assert.equal(props.get(history),"DONE");
});

test("functional review evidence uses catalog IDs, context and exclusions", () => {
  const rules = api.compileReviewRules_([["01.01", "Home", "Posición global"]]);
  const classify = value => Array.from(api.classifyReviewEvidence_(value, rules));
  assert.deepEqual(classify("No se actualiza la posición global"), ["01.01"]);
  assert.deepEqual(classify("The workforce dashboard crashed"), []);
  assert.deepEqual(classify("No puedo iniciar sesión"), ["16.xx"]);
  assert.deepEqual(classify("No funciona"), []);
});

test("analytics applies sentiment and entity to gaps and examples, while monthly balance uses all stars", () => {
  const review = (key, date, rating, blocks, entities = ["BBVA Empresas"]) => ({
    key, date, rating, blocks, entities, title: "Transferencia bancaria", original: key
  });
  const rows = [
    review("prior", "2026-10-11", 1, ["03"]),
    review("new", "2026-10-12", 5, ["03"]),
    review("generic", "2026-10-12", 1, []),
    review("shared", "2026-10-13", 3, ["03"], ["BBVA Empresas", "Otro"]),
    review("other", "2026-10-14", 2, [], ["Otro"]),
    review("general", "2026-10-15", 1, [])
  ];
  const result = api.summarizeMarketsReviewAnalytics_(rows, { "03": "Transferencias", general: "Generalista" },
    { segment: "DETRACTOR", entity: "BBVA Empresas" }, { start: "2025-11-12", recent: "2026-10-12", end: "2026-11-10" });
  assert.equal(result.total, 5);
  assert.equal(result.entities[0].counts["03"], 2);
  assert.equal(result.entities[0].counts.general, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(result.leadingBlock)), { id: "03", count: 2 });
  assert.equal(result.monthly[0].total, 5);
  assert.equal(result.monthly[0].balance, 100 * (1 - 4) / 5);
  assert.equal(result.baseline.total, 1);
  assert.equal(result.baseline.balance, -100);
  assert.equal(result.baseline.end, "2026-10-11");
  assert.deepEqual(JSON.parse(JSON.stringify(result.deltas)), [
    {id:"general",label:"Generalista",total:2,promoters:0,detractors:2,weight:200/3,balance:-100,gap:0},
    {id:"03",label:"Transferencias",total:1,promoters:0,detractors:1,weight:100/3,balance:-100,gap:0}
  ]);
  assert.equal(result.examples[1].review.key, "shared");
  assert.ok(result.examples.every(({review}) => review.rating <= 3 && review.entities.includes("BBVA Empresas")));
});

test("annual reviews keep all star ratings, use the selected entity and rank votes and named authors", () => {
  const rows = [
    ["old", "2025-11-11", 5, 100, "Ana", "", "BBVA Empresas"],
    ["edge", "2025-11-12", 4, 4, " Ana ", "", "BBVA Empresas"],
    ["a", "2026-10-01", 1, 5, "Ana", "Gracias", "BBVA Empresas"],
    ["b", "2026-10-02", 3, 6, "Luis", " ", "BBVA Empresas"],
    ["c", "2026-10-03", 5, 10, "", "", "BBVA Empresas"],
    ["d", "2026-10-04", 2, 5, "Ana", "", "BBVA Empresas"],
    ["other", "2026-10-04", 5, 90, "Otro", "", "Otro"]
  ].map(([key,date,rating,helpful,author,reply,entity]) => ({
    key,date,rating,helpful,author,reply,entities:[entity],blocks:[],title:key,original:key
  }));
  const annual = { start: "2025-11-12", end: "2026-11-11" };
  const result = api.summarizeMarketsReviewAnalytics_(rows, { general:"Generalista" },
    { entity:"BBVA Empresas", segment:"DETRACTOR" }, {start:"2026-11-01",recent:"2026-11-01",end:annual.end}, annual);
  assert.equal(result.total, 0);
  assert.equal(result.leadingBlock, null);
  assert.deepEqual(Array.from(result.annual.topHelpful, row => row.key), ["c", "b", "d"]);
  assert.deepEqual(Array.from(result.annual.topAuthors, row => [row.author,row.count]), [["Ana",3],["Luis",1]]);
  assert.deepEqual(["total","promoters","detractors","neutral","helpful","answered"].map(key => result.annual[key]), [5,1,3,1,4,1]);
});

test("recent block statistics do not invent a historical baseline or sum duplicated reviews into the denominator", () => {
  const rows = [{date:"2026-10-12",rating:3,entities:["Entidad"],blocks:["01","02"],title:"Una reseña",original:"Detalle"}];
  const result = api.summarizeMarketsReviewAnalytics_(rows, {"01":"Uno","02":"Dos"}, {entity:"Entidad"},
    {start:"2026-10-12",recent:"2026-10-12",end:"2026-11-10"});
  assert.equal(result.baseline,null);
  assert.equal(result.recentTotal,1);
  assert.deepEqual(Array.from(result.deltas,row=>[row.weight,row.gap]),[[100,null],[100,null]]);
});

test("country pages and snapshots partition each review by its own storefront evidence", () => {
  const runtime = vm.createContext({ trimString_: value => String(value ?? "").trim() });
  for (const file of ["54_Reviews.gs", "52_ReviewInsights.gs"]) {
    vm.runInContext(fs.readFileSync(new URL("../src/" + file, import.meta.url), "utf8"), runtime);
  }
  const android = (packageName,countryCode) => ({
    platform:"Android",appKey:packageName+"|"+countryCode,packageName,countryCode,appName:"BBVA",isBbva:true
  });
  const es = android("com.example.shared","ES"), co = android(es.packageName,"CO");
  const historical = android("com.example.historical","ES"), tr = android("com.example.local","TR");
  const ios = {platform:"iOS",appKey:"ios|CO",countryCode:"CO",appId:"100",appName:"BBVA iOS",isBbva:true};
  const catalog = [es,co,historical,tr,ios];
  const review = (key,app,markets,date="2026-11-01") => [
    key,app.appKey,markets,app.platform,app.packageName||app.appId,key,date,1,"","","Same text"
  ];
  const rows = [
    review("multipais",es,"CO,ES"),
    review("solo-observada-es",es,"ES"),
    review("compartida-historica",historical,"ES"),
    review("evidencia-antigua",historical,"ES,MX","2024-01-01"),
    review("local-tr",tr,"TR"),
    review("local-co",ios,"CO")
  ];
  const sheet = {getLastRow:()=>rows.length+1,getRange:(start, _col, length, width)=>({
    getValues:()=>rows.slice(start-2,start-2+length).map(row=>row.slice(0,width))
  })};
  const ss = {getSheetByName:name=>name==="MARKET_REVIEWS"?sheet:null,getId:()=>"test"};
  let snapshot;
  const cache = new Map();
  Object.assign(runtime,{
    MARKETS_CONFIG:{timeZone:"Europe/Madrid"},
    MARKETS_WEB:{countryCodes:["ES","CO","TR"]},
    Utilities:{
      formatDate:()=>"2026-11-11",DigestAlgorithm:{SHA_256:"SHA_256"},
      computeDigest:(_,value)=>value,base64EncodeWebSafe:value=>value
    },
    PropertiesService:{getScriptProperties:()=>({getProperties:()=>({})})},
    currentMarketsUserEmail_:()=>"reader@bbva.com",
    openMarketsSpreadsheet_:()=>ss,readAppCatalog_:()=>catalog,marketsReviewSheet_:()=>sheet,marketsReviewWidth_:()=>15,
    CacheService:{getScriptCache:()=>cache},
    writeMarketsWebCache_:(cache,key,value)=>cache.set(key,value),
    readMarketsWebCache_:(key,build)=>cache.get(key)??build(),readMarketsPersistentCache_:()=>snapshot,
    tryWriteMarketsPersistentCache_:(_name,value)=>{snapshot=value;return {ok:true}}
  });
  const window = {start:"2026-10-13",end:"2026-11-11"};
  const aggregate = runtime.queryMarketsReviews_(ss,{country:"ALL",platform:"ALL"},window);
  const shared = aggregate.filter(row=>row.sharedListing);
  assert.deepEqual(Array.from(shared,row=>row.key),["multipais"]);
  assert.ok(shared.every(row=>row.countries[0]==="UNKNOWN"&&row.attributionMethod==="multi_storefront_ambiguous"));
  assert.equal(aggregate.length,5);
  const filters = {platform:"ALL",app:"BBVA Empresas"};
  const live = runtime.getMarketsReviewPage({...filters,country:"CO",page:4});
  assert.deepEqual({...live.counts},{CO:1,TR:1,ES:2,UNKNOWN:1});
  assert.equal(live.page,0);
  assert.equal(live.total,1);
  assert.equal(live.rows[0].key,"local-co");
  assert.equal(live.rows[0].app,"BBVA iOS");
  const spain = runtime.getMarketsReviewPage({...filters,country:"ES"});
  assert.equal(spain.total,2);
  assert.deepEqual(runtime.getMarketsReviewExport({...filters,country:"ES",start:spain.window.start}).rows.map(row=>row.key),
    spain.rows.map(row=>row.key));
  assert.throws(()=>runtime.getMarketsReviewExport({...filters,country:"ALL"}),/Selecciona una geografía/);
  assert.equal(runtime.getMarketsReviewAnalytics({country:"ES",year:"2026"}).annual.total,2);
  assert.equal(runtime.getMarketsReviewAnalytics({country:"ALL",year:"2026"}).annual.total,5);
  assert.throws(()=>runtime.getMarketsReviewPage({...filters,country:"ALL"}),/Selecciona una geografía/);
  const monthly = { country:"ES", analysisMonth:"2026-11", segment:"DETRACTOR", entity:"BBVA Empresas" };
  const annual = { country:"ES", year:"2026", segment:"DETRACTOR", entity:"BBVA Empresas" };
  const expected = [runtime.getMarketsReviewAnalytics(monthly),runtime.getMarketsReviewAnalytics(annual)];
  runtime.publishMarketsReviewSnapshot_();
  const query = runtime.queryMarketsReviews_;
  runtime.queryMarketsReviews_ = () => { throw new Error("unexpected Sheets read"); };
  const withoutTiming = ({ timing, ...data }) => data;
  assert.deepEqual([runtime.getMarketsReviewAnalytics(monthly),runtime.getMarketsReviewAnalytics(annual)].map(withoutTiming),expected.map(withoutTiming));
  runtime.queryMarketsReviews_ = query;
  assert.deepEqual({...snapshot.values["page:CO:es"].counts},{CO:1,TR:1,ES:2,UNKNOWN:1});
  assert.equal(snapshot.values["page:CO:es"].rows[0].key,"local-co");
  assert.equal(snapshot.values["analytics:ES"].total,2);
  assert.equal(snapshot.values["analytics:TR"].total,1);
  assert.equal(snapshot.values["analytics:ALL"].total,5);
  assert.equal(snapshot.values["analytics:UNKNOWN"].total,1);
  // Same source, no translation required. A translation alone cannot create BEI evidence.
  const taxonomy = [["02.03","Cuentas","Estado de cuenta"],["03.13","Pagos","Transferencias internacionales"]];
  ss.getSheetByName = name => name === "MARKET_REVIEWS" ? sheet : name === "FUNCTIONAL_CATALOG"
    ? {getLastRow:()=>taxonomy.length+1,getRange:()=>({getDisplayValues:()=>taxonomy})} : null;
  rows[1][10] = "Mi cuenta de nómina cobra comisión";
  rows[2][10] = "No puedo hacer una transferencia";
  rows[2][12] = "My company has a problem";
  rows[4][10] = "Şirket hesabım açılmıyor";
  const extended = {...filters,country:"ES",audience:"BEI_EXTENDED",start:"2026-10-01",language:"en"};
  const strict = {...extended,audience:"BEI_ONLY"};
  const scopedPage = runtime.getMarketsReviewPage({...extended,page:12});
  assert.equal(scopedPage.page,0);
  assert.equal(scopedPage.total,1);
  assert.equal(scopedPage.counts.TR,1);
  assert.equal(scopedPage.rows[0].key,"compartida-historica");
  assert.equal(runtime.getMarketsReviewPage(strict).total,0);
  assert.equal(runtime.getMarketsReviewPage({...strict,country:"TR"}).total,1);
  assert.deepEqual(runtime.getMarketsReviewExport(extended).rows.map(row=>row.key),scopedPage.rows.map(row=>row.key));
  const npsScope = {...extended,analysisMonth:"2026-11"};
  assert.equal(runtime.getMarketsReviewAnalytics(npsScope).nps.current,-100);
  assert.equal(runtime.getMarketsReviewAnalytics({...npsScope,audience:"BEI_ONLY"}).nps.current,null);
  assert.equal(runtime.getMarketsReviewAnalytics({...npsScope,audience:"ALL"}).total,2);
  assert.throws(()=>runtime.getMarketsReviewPage({...extended,audience:"UNKNOWN"}),/Audiencia/);
  const many = Array.from({length:100}, (_, index) => {
    const row = review("page-" + String(index).padStart(3,"0"), tr, "TR");
    row[10] = [4, 53, 95].includes(index) ? "No puedo hacer transferencias a mis proveedores. Caso buscado" : "Caso buscado";
    return row;
  });
  rows.push(...many);
  const pageScope = {country:"TR",platform:"ALL",audience:"BEI_ONLY",topic:"03",
    search:"caso buscado",rating:"1",start:"2026-11-01",end:"2026-11-01"};
  const filtered = runtime.getMarketsReviewPage({...pageScope,page:2});
  assert.equal(filtered.total,3);
  assert.equal(filtered.counts.TR,3);
  assert.equal(filtered.page,0);
  assert.deepEqual(Array.from(filtered.rows,row=>row.key),["page-004","page-053","page-095"]);
  rows.splice(-many.length);
  const provisional=rows.find(row=>row[0]==="solo-observada-es");
  provisional[2]="ES,CO";
  const changed=runtime.queryMarketsReviews_(ss,{country:"ALL",platform:"ALL"},window);
  assert.equal(changed.length,aggregate.length);
  assert.equal(changed.find(row=>row.key===provisional[0]).countries[0],"UNKNOWN");
  const duplicate = review("local-co-es", ios, "ES", "2026-11-02");
  duplicate[5] = "local-co"; // Same Apple review ID under a second storefront key.
  rows.push(duplicate);
  const byAlias = runtime.queryMarketsReviews_(ss,{country:"UNKNOWN",platform:"ALL",reviewKey:duplicate[0]},window);
  assert.equal(byAlias.length,1);
  assert.equal(byAlias[0].key,"local-co");
  assert.equal(byAlias[0].date,"2026-11-02");
  assert.equal(runtime.queryMarketsReviews_(ss,{country:"ALL",platform:"ALL"},window).length,aggregate.length);
  assert.throws(() => runtime.normalizeMarketsReviewFilters_({ start: "2026-02-30" }), /Fecha no válida/);
});

test("translation repair reaches historical gaps and preserves successful cells after a partial failure", () => {
  const runtime = vm.createContext({});
  vm.runInContext(fs.readFileSync(new URL("../src/54_Reviews.gs", import.meta.url), "utf8"), runtime);
  const row = ["key","APP","TR","iOS","123","456","2026-10-01",4,"","","Merhaba","Hola","",""];
  const properties = new Map();
  const calls = [];
  let fail = true, generations = 0;
  const sheet = { getLastRow: () => 2, getRange: (_row, column) => ({
    getValues: () => [row.slice(column - 1)], setValues: ([values]) => row.splice(column - 1, values.length, ...values)
  }) };
  Object.assign(runtime, {
    marketsReviewRecoveryMonth_: value => value.slice(0,7), errorToString_: error => error.message,
    requireMarketsReviewOwner_: () => ({ss:{}}), marketsReviewSheet_: () => sheet, openMarketsSpreadsheet_: () => ({}),
    LockService: { getUserLock: () => ({tryLock:()=>true, releaseLock(){}}) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties.get(key), setProperty: (key,value) => properties.set(key,value)
    }) },
    SpreadsheetApp: { flush(){} }, advanceMarketsReviewGeneration_: () => generations++,
    LanguageApp: { translate: (original, _source, target) => {
      calls.push(target);
      if (target === "en" && fail) throw new Error("Temporary failure");
      return target === "tr" ? original : "Hello";
    } }
  });
  const audit = runtime.auditMarketsReviewTranslations();
  assert.equal(audit.pending,1);
  assert.deepEqual(Array.from(audit.groups[0].missing),[0,1,1]);
  const partial = runtime.repairMarketsReviewTranslations();
  assert.equal(partial.failed,1);
  assert.equal(partial.complete,false);
  assert.deepEqual(row.slice(10),["Merhaba","Hola","","Merhaba"]);
  fail = false;
  assert.equal(runtime.repairMarketsReviewTranslations().complete,true);
  assert.deepEqual(row.slice(10),["Merhaba","Hola","Hello","Merhaba"]);
  assert.deepEqual(calls,["en","tr","en"]);
  assert.equal(generations,2);
});

test("translation prioritizes review date and probes again after quota exhaustion", () => {
  let now = 1000;
  const runtime = vm.createContext({
    Date: class extends Date { static now() { return now; } },
    errorToString_: error => error.message
  });
  vm.runInContext(fs.readFileSync(new URL("../src/54_Reviews.gs", import.meta.url), "utf8"), runtime);
  const rows = [["2026-11-10",4,"","","new","","",""],["2025-11-12",4,"","","old","","",""],
    ["2026-11-11",4,"","","newest","","",""]];
  const calls = [], properties = new Map();
  let quota = true;
  Object.assign(runtime, {
    openMarketsSpreadsheet_:()=>({}), marketsReviewSheet_:()=>({
      getLastRow:()=>rows.length+1,
      getRange:(row,col)=>col===7?{getValues:()=>rows}:{setValues:([values])=>rows[row-2].splice(5,3,...values)}
    }),
    LockService:{getUserLock:()=>({tryLock:()=>true,releaseLock(){}})},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties.get(key),setProperty:(key,value)=>properties.set(key,value)})},
    SpreadsheetApp:{flush(){}}, advanceMarketsReviewGeneration_(){},
    LanguageApp:{translate:(text,_source,lang)=>{
      calls.push([text,lang]);
      if(quota&&lang==="en")throw Error("Service invoked too many times for one day: translate");
      return text+lang;
    }}
  });
  const first=runtime.translateMarketsReviews_();
  assert.equal(first.quotaLimited,true);
  assert.equal(first.pending,3);
  assert.deepEqual(calls,[["newest","es"],["newest","en"]]);
  assert.equal(rows[2][5],"newestes");
  runtime.translateMarketsReviews_();
  assert.equal(calls.length,2);
  now=first.retryAt;quota=false;
  assert.equal(runtime.translateMarketsReviews_().complete,true);
  assert.deepEqual(calls.slice(2).map(([text])=>text),["newest","newest","new","new","new","old","old","old"]);
});

test("review cache isolates scopes and invalidates when the data or catalog changes", () => {
  const properties = {};
  const entries = new Map(), catalog = [];
  Object.assign(api, {
    readAppCatalog_:()=>catalog,
    PropertiesService: { getScriptProperties: () => ({ getProperties: () => properties }) },
    Utilities: { DigestAlgorithm: { SHA_256: "SHA_256" }, computeDigest: (_, value) => value, base64EncodeWebSafe: value => value },
    readMarketsWebCache_: (key, build) => {
      if (!entries.has(key)) entries.set(key, build());
      return entries.get(key);
    }
  });
  let builds = 0;
  const get = scope => api.readMarketsReviewCache_({ getId: () => "test" }, "page", scope,
    { end: "2026-11-11" }, () => ++builds);
  assert.equal(get({ country: "ES", page: 0 }), 1);
  assert.equal(get({ page: 0, country: "ES" }), 1);
  assert.equal(get({ page: 0, country: "TR" }), 2);
  properties.MARKETS_REVIEWS_GENERATION = "new";
  assert.equal(get({ country: "ES", page: 0 }), 3);
  catalog.push({platform:"Android",appKey:"app|ES",packageName:"com.example.app",countryCode:"ES"});
  assert.equal(get({ country: "ES", page: 0 }), 4);
});

test("review endpoints accept corporate readers and reject anonymous users before reading data", () => {
  const opened = [];
  const sheet = { getSheetByName: () => null, getId: () => "test" };
  Object.assign(api, {
    MARKETS_CONFIG: { timeZone: "Europe/Madrid" },
    openMarketsSpreadsheet_: () => { opened.push(1); return sheet; },
    currentMarketsUserEmail_: () => { throw new Error("Acceso denegado"); }
  });
  api.Utilities.formatDate = () => "2026-11-11";
  assert.throws(() => api.getMarketsReviewAnalytics({ country: "ALL" }), /Acceso denegado/);
  assert.throws(() => api.getMarketsReviewPage({ country: "ALL", page: 0 }), /Acceso denegado/);
  assert.equal(opened.length, 0);
  api.currentMarketsUserEmail_ = () => "reader@bbva.com";
  assert.equal(api.getMarketsReviewAnalytics({ country: "ES" }).total, 0);
  const page = api.getMarketsReviewPage({ country: "ES", page: 0 });
  assert.equal(page.total, 0);
  assert.equal(page.window.start, "2026-10-13");
});

test("the persistent snapshot requires the matching schema and generations", () => {
  const window = { start: "2026-10-13", end: "2026-11-11" };
  const filters = { country: "ES", platform: "ALL", app: "BBVA Empresas", language: "es" };
  const staticPage = { total: 10 };
  const ss = { getId: () => "test" };
  let generation = "1";
  api.PropertiesService = { getScriptProperties: () => ({
    getProperties: () => ({ MARKETS_REVIEWS_GENERATION: generation })
  }) };
  const catalogVersion = api.marketsReviewCatalogVersion_(api.readAppCatalog_());
  let schema = 6;
  api.readMarketsWebCache_ = (_key,build)=>build();
  api.readMarketsPersistentCache_ = () => ({ schema, end: window.end, versions: ["1", "", catalogVersion], values: { "page:ES:es": staticPage } });
  assert.equal(api.readMarketsReviewCache_(ss, "page", filters, window, () => null), null);
  schema = 9;
  assert.equal(api.readMarketsReviewCache_(ss, "page", filters, window, () => null), staticPage);
  generation = "2";
  assert.equal(api.readMarketsReviewCache_(ss, "page", filters, window, () => null), null);
});

test("calendar analytics reads a closed year and its predecessor independently of the heatmap sentiment", () => {
  const observed = [], cache = new Map();
  const review = (key,date,rating) => ({
    key,date,rating,entities:["BBVA Empresas"],blocks:["01"],original:key
  });
  const rows = [review("prior","2024-12-31",4),review("start","2025-01-01",2),
    review("end","2025-12-31",5),review("after","2026-01-01",1)];
  Object.assign(api,{
    currentMarketsUserEmail_:()=> "reader@bbva.com",
    openMarketsSpreadsheet_:()=>({getId:()=>"calendar"}),
    marketsReviewTopics_:()=>({"01":"Transferencias"}),
    readMarketsReviewCache_:(_ss,_op,_filters,_window,build)=>build(),
    readMarketsWebCache_:(key,build)=>{
      if (!cache.has(key)) cache.set(key,build());
      return cache.get(key);
    },
    queryMarketsReviews_:(_ss,filters,window)=>{
      observed.push([filters.start,window.end]);
      return rows.filter(row=>row.date>=filters.start && row.date<=window.end);
    }
  });
  api.Utilities.formatDate=()=> "2026-11-11";
  const result=api.getMarketsReviewAnalytics({country:"ES",year:"2025",segment:"DETRACTOR"});
  const promoters=api.getMarketsReviewAnalytics({country:"ES",year:"2025",segment:"PROMOTER"});
  assert.equal(promoters.entities[0].total,1);
  assert.deepEqual(observed,[["2024-01-01","2025-12-31"]]);
  assert.equal(result.annual.start,"2025-01-01");
  assert.equal(result.annual.end,"2025-12-31");
  assert.equal(result.annual.previousTotal,1);
  assert.equal(result.annual.total,2);
  assert.equal(result.annual.promoters,1);
  assert.equal(result.entities[0].total,1);
});

test("monthly sentiment filters gaps and examples while balance and baseline keep all stars for the selected app", () => {
  const review = (key, date, rating, entity = "BBVA Empresas") => ({
    key, date, rating, entities:[entity], blocks:["01"], title:key, original:key
  });
  const rows = [
    review("prior promoter","2026-10-10",5), review("prior detractor","2026-10-11",1),
    review("recent promoter","2026-11-01",5), review("recent detractor","2026-11-02",1),
    review("recent neutral","2026-11-02",4), review("other bank","2026-11-02",5,"Banco")
  ];
  const window = { start:"2026-10-01", recent:"2026-11-01", end:"2026-11-11" };
  for (const [segment,key,balance] of [["DETRACTOR","recent detractor",-100],["PROMOTER","recent promoter",100],["NEUTRAL","recent neutral",0]]) {
    const result = api.summarizeMarketsReviewAnalytics_(rows, {"01":"Pagos"}, {analysisMonth:"2026-11",segment,entity:"BBVA Empresas"}, window);
    assert.deepEqual(Array.from(result.monthlyEntityOptions),["BBVA Empresas"]);
    assert.equal(result.monthly.find(point=>point.month==="2026-11").total,3);
    assert.equal(result.baseline.total,2);
    assert.equal(result.deltas[0].gap,balance);
    assert.deepEqual(Array.from(result.examples, item=>item.review.key),[key]);
  }
});


test("compact review source keeps counts, repeat authors and full records eligible for cards", () => {
  const common = { entities: ["BBVA Empresas"], blocks: ["01"], author:"Ana", reply: "Gracias", original: "Transferencia pendiente" };
  const rows = [
    { ...common, author: "Otra persona", key: "old", date: "2026-01-03", rating: 2, helpful: 0 },
    { ...common, key: "helpful", date: "2026-01-04", rating: 2, helpful: 10 },
    { ...common, key: "recent", date: "2026-11-01", rating: 2, helpful: 0 }
  ];
  const window = { start: "2026-01-01", recent: "2026-11-01", end: "2026-11-11" };
  const filters = { analysisMonth: "2026-11", segment: "DETRACTOR", entity: "BBVA Empresas" };
  const compact = api.compactMarketsReviewAnalyticsRows_(rows, window.end);
  assert.equal(compact[0].original, undefined);
  assert.equal(compact[1], rows[1]);
  assert.equal(compact[2], rows[2]);
  const summarize = data => api.summarizeMarketsReviewAnalytics_(data, { "01": "Transferencias" }, filters, window);
  assert.deepEqual(summarize(compact), summarize(rows));
});

test("country-wide annual analytics counts each review once and retains the leading authors' latest cards", () => {
  const rows = [
    ["previous", "2025-12-01", "Ana", ["Banco B"]],
    ["first", "2026-01-01", "Ana", ["Banco A"]],
    ["second", "2026-01-02", "Ana", ["Banco A", "Banco B"]],
    ["third", "2026-01-03", "Ana", ["Banco B"]],
    ["fourth", "2026-01-04", " Ana ", ["Banco B"]],
    ["other", "2026-02-01", "Luis", ["Banco A"]]
  ].map(([key, date, author, entities]) => ({ key, date, author, entities, original: key, rating: 5, blocks: [] }));
  const window = { start: "2026-01-01", recent: "2026-01-01", end: "2026-11-12" };
  const compact = api.compactMarketsReviewAnalyticsRows_(rows, window.end);
  const summarize = entity => api.buildMarketsReviewAnalytics_(compact, {}, { entity, year: "2026", segment: "DETRACTOR" }, window).annual;
  const all = summarize("ALL");
  assert.equal(all.total, 5);
  assert.equal(all.previousTotal, 1);
  assert.equal(all.promoters, 5);
  assert.equal(all.topAuthors[0].count, 4);
  assert.deepEqual(Array.from(all.topAuthors[0].reviews, row => row.original), ["fourth", "third", "second"]);
  assert.deepEqual(Array.from(summarize("Banco A").topAuthors[0].reviews, row => row.original), ["second", "first"]);
  assert.equal(summarize("Banco B").total, 3);
  assert.equal(compact.at(-1).original, undefined);
});

test("audience requires evidence in the original and keeps salary accounts separate from employer payroll", () => {
  const rules = api.compileReviewRules_([["16.05", "Seguridad", "Firma electrónica"]]);
  const cases = [
    ["No puedo abrir mi cuenta nómina", "RETAIL", false, "02"],
    ["Me cobran comisión en mi cuenta de nomina por una transferencia SPEI", "RETAIL", false, "02"],
    ["Mi cuenta sueldo no me deja transferir", "RETAIL", false, "02"],
    ["Maaş hesabı açarken avantajları olduğunu söylediler. EFT çok pahalı", "RETAIL", false, "02"],
    ["El Pago de Nóminas falla", "BEI_CONFIRMED", true, "04"],
    ["Genial para los Pagos de nomina", "BEI_CONFIRMED", true, "04"],
    ["Pago la nómina de mis empleados", "BEI_CONFIRMED", true, "04"],
    ["Transferencias de nóminas de mi empresa", "BEI_CONFIRMED", true, "04"],
    ["Çalışanlarımın maaş ödemesi başarısız", "BEI_CONFIRMED", true, "04"],
    ["No he recibido el pago de la nómina", "RETAIL", false],
    ["Mi nómina no llega a mi cuenta", "RETAIL", false, "02"],
    ["No puedo hacer una transferencia", "UNDETERMINED", true, "03"],
    ["Havale yapamıyorum", "UNDETERMINED", true, "03"],
    ["No funciona mi cuenta", "UNDETERMINED", true, "02"],
    ["Mi préstamo personal", "RETAIL", false, "08"],
    ["Netflix me cobra la suscripción", "RETAIL", false],
    ["No puedo entrar en la app", "UNDETERMINED", false],
    ["No llega el OTP para aprobar pagos", "UNDETERMINED", true, "16"],
    ["Mi tarjeta de empresa no funciona", "BEI_CONFIRMED", true, "09"],
    ["Mi tarjeta no funciona", "UNDETERMINED", true, "09"],
    ["Mi tarjeta de estudiante no funciona", "RETAIL", false, "09"],
    ["El seguro de mi comercio", "BEI_CONFIRMED", true, "14"],
    ["Mi seguro de hogar", "RETAIL", false, "14"],
    ["No puedo pagar el IVA de mi negocio", "BEI_CONFIRMED", true, "05"],
    ["No puedo pagar mis impuestos", "UNDETERMINED", true, "05"],
    ["Suscripción de software de mi empresa", "BEI_CONFIRMED", true],
    ["No puedo pagar el alquiler de mi vivienda", "RETAIL", false, "06"],
    ["Pago el alquiler del local de mi negocio", "BEI_CONFIRMED", true, "06"],
    ["No soy empresa, quiero hacer una transferencia", "UNDETERMINED", true, "03"],
    ["No abre mi cuenta nómina y falla el pago de nóminas de mi empresa", "BEI_CONFIRMED", true, "04"],
    ["Emekli olmama rağmen EFT ücreti kesiliyor", "RETAIL", false],
    ["Emekli maaşım için havale ücreti kesiliyor", "RETAIL", false],
    ["KOBİ kredisine başvuramıyorum", "BEI_CONFIRMED", true],
    ["Esnaf kredisi başvurusu başarısız", "BEI_CONFIRMED", true],
    ["Ticari kredilerimi Halkbank’tan çektim", "BEI_CONFIRMED", true],
    ["Personel maaşları ödenmiyor", "BEI_CONFIRMED", true],
    ["Ben emekliyim. Şirket hesabımdan tedarikçime ödeme yapamıyorum", "BEI_CONFIRMED", true],
    ["Ticari değil, EFT ücreti alıyorsunuz", "UNDETERMINED", true],
    ["La empresa del banco cobra una comisión por transferir dinero a mi hija", "RETAIL", false],
    ["My paycheck was deposited but the bank charged transfer fees", "RETAIL", false],
    ["Minha aposentadoria caiu e cobraram uma taxa no PIX", "RETAIL", false],
    ["Não consigo pagar meus fornecedores", "BEI_CONFIRMED", true],
    ["POS", "UNDETERMINED", false],
    ["La app es mala", "UNDETERMINED", false]
  ];
  for (const [text, audience, extended, block] of cases) {
    const normalized = api.normalizeReviewEvidence_(text);
    const ids = api.classifyNormalizedReviewEvidence_(normalized, rules);
    const decision = api.classifyMarketsReviewAudience_(text);
    assert.equal(decision.audience, audience, text);
    assert.equal(api.matchesMarketsReviewAudience_("BEI_ONLY", decision), audience === "BEI_CONFIRMED", text);
    assert.equal(api.matchesMarketsReviewAudience_("BEI_EXTENDED", decision), extended, text);
    assert.equal(api.matchesMarketsReviewAudience_("ALL", decision), true, text);
    if (block) assert.ok(ids.some(id => id.startsWith(block)), text);
    if (audience === "RETAIL") assert.ok(!ids.some(id => id.startsWith("04.")), text);
  }
  const unconfigured = api.classifyMarketsReviewAudience_("mi cuenta");
  assert.equal(api.matchesMarketsReviewAudience_("BEI_EXTENDED", unconfigured), false);
});

test("ambiguous functional alias does not assign multiple unrelated blocks", () => {
  const rules = api.compileReviewRules_([["03.01","Pagos","Dashboard de pagos"], ["06.01","Servicios","Pago de servicios"]]);
  assert.deepEqual(Array.from(api.classifyReviewEvidence_("aggregate payments",rules)), []);
  assert.deepEqual(Array.from(api.classifyReviewEvidence_("dashboard de pagos",rules)), ["03.01"]);
});

test("monthly review NPS compares calendar months across years, cuts today and returns null without a denominator", () => {
  const row = (date, rating) => ({date,rating,entities:["BBVA Empresas"],blocks:[],original:date});
  const filters = {analysisMonth:"2026-01",segment:"DETRACTOR"};
  const window = api.marketsReviewAnalyticsWindow_(filters,"2026-01-13");
  const result = api.summarizeMarketsReviewAnalytics_([
    row("2025-11-30",5),row("2025-12-01",1),row("2025-12-31",4),
    row("2026-01-01",5),row("2026-01-13",4),row("2026-01-14",1)
  ],{general:"Generalista"},filters,window);
  assert.deepEqual({...result.nps}, {start:"2026-01-01",end:"2026-01-13",current:50,
    previousStart:"2025-12-01",previousEnd:"2025-12-31",previous:-50,delta:100});
  const historical = {analysisMonth:"2024-03"};
  const march = api.marketsReviewAnalyticsWindow_(historical,"2026-01-13");
  const empty = api.summarizeMarketsReviewAnalytics_([],{},historical,march);
  assert.deepEqual({...empty.nps},{start:"2024-03-01",end:"2024-03-31",current:null,
    previousStart:"2024-02-01",previousEnd:"2024-02-29",previous:null,delta:null});
});

test("catalogue TF-IDF assigns rare descriptive evidence, abstains on ties and respects exclusions", () => {
  const classify = (text, catalog) => Array.from(api.classifyReviewEvidence_(text, api.compileReviewRules_(catalog)));
  const settlement = ["11.01", "Adquirencia", "Panel del comercio", "liquidación conciliación ventas"];
  const other = ["12.02", "Inversiones", "Consulta de inversiones", "patrimonio rentabilidad cartera"];
  assert.deepEqual(classify("La conciliación de ventas y liquidación fallan", [settlement, other]), ["11.01"]);
  assert.deepEqual(classify("Conciliación y ventas", [settlement, other]), []);
  const rival = ["13.01", "Finanzas", "Panel financiero", "liquidación conciliación ventas"];
  assert.deepEqual(classify("conciliación ventas liquidación liquidación", [settlement, rival]), []);
  const excluded = ["10.01", "Financiación exterior", "Carta de crédito", "documentaria embarque aduanas"];
  assert.deepEqual(classify("documentaria embarque aduanas", [excluded]), ["10.01"]);
  const contextRequired = ["01.01","Inicio","Posición global","documentaria embarque aduanas"];
  assert.deepEqual(classify("documentaria embarque aduanas", [contextRequired]), []);
});

test("Android geography only proposes a local rail for human review", () => {
  const runtime = vm.createContext({});
  for (const file of ["52_ReviewInsights.gs", "55_ReviewIndex.gs"]) {
    vm.runInContext(fs.readFileSync(new URL("../src/" + file, import.meta.url), "utf8"), runtime);
  }
  const eligible = ["AR","CO","ES","MX","PE","UY"];
  for (const [text, status, country] of [
    ["No llega el Plin de mi empresa", "VALIDAR", "PE"],
    ["No puedo pagar con PSE", "VALIDAR", "CO"],
    ["Mi SPEI se quedó pendiente", "VALIDAR", "MX"],
    ["Mi Yape y mi SPEI fallan", "CONFLICTO"],
    ["No uso Bizum", "CONTEXTO_NEGATIVO"],
    ["Mi amigo paga con PSE", "CONTEXTO_NEGATIVO"],
    ["La app no funciona en mi móvil, tenés que arreglarla", "SIN_EVIDENCIA"],
    ["CURP", "SIN_CONTEXTO", "MX"]
  ]) {
    const result = runtime.marketsAndroidGeographyCandidate_(text, eligible);
    assert.equal(result.status, status, text);
    assert.equal(result.candidate, country, text);
  }
  assert.equal(runtime.marketsAndroidGeographyCandidate_("Mi Yape falla", ["ES","MX"]).status, "FUERA_DE_CATALOGO");
});

test("edited developer replies only invalidate their own translations", () => {
  const before = { author:"reviewer", reply:"old", replyDate:"2026-11-10", replyTranslations:{ es:"vieja" } };
  const unchanged = JSON.parse(api.mergeMarketsReviewMetadata_(before, { reply:"old", replyDate:"2026-11-10" }));
  assert.deepEqual(unchanged.replyTranslations, before.replyTranslations);
  const updated = JSON.parse(api.mergeMarketsReviewMetadata_(before, { reply:"new", replyDate:"2026-11-12" }));
  assert.equal(updated.reply, "new");
  assert.equal(updated.author, "reviewer");
  assert.equal(updated.replyTranslations, undefined);
});
