import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = ["../src/99_Core.gs", "../src/55_AlertPreferences.gs", "../src/58_Admin.gs"]
  .map(file => fs.readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n");
const context = {
  console, Date, Math, Number, String, Boolean, Array, Object, JSON, RegExp, isFinite, isNaN,
  CacheService: {
    getScriptCache() {
      return { get() { return null; }, put() {} };
    }
  },
  MARKETS_CONFIG: {
    codeVersion: "test", timeZone: "Europe/Madrid", runHour: 7, runMinute: 5,
    healthCheckHour: 9, healthCheckMinute: 15,
    sheets: { control: "CONTROL", runs: "RUN_LOG", fetchLog: "FETCH_LOG", alerts: "ALERT_LOG", alertPreferences: "ALERT_SUBSCRIPTIONS", usage: "USAGE_LOG" },
    headers: { control: ["PARAMETER", "VALUE", "DESCRIPTION"] }
  },
  MARKETS_WEB: { version: "test" }
};
vm.createContext(context);
vm.runInContext(source, context);

test("administrator allowlist is normalized, unique and BBVA-only", () => {
  assert.deepEqual(Array.from(context.marketsAdministratorEmails_({ ADMIN_EMAILS: " ADMIN@BBVA.COM,admin@bbva.com; other@example.com " })), ["admin@bbva.com"]);
});

test("private dashboard authorization fails closed on the server", () => {
  context.currentMarketsUserEmail_ = () => "reader@bbva.com";
  context.openMarketsSpreadsheet_ = () => ({ id: "sheet" });
  context.requireCurrentSheetContract_ = () => true;
  context.readControl_ = () => ({ ADMIN_EMAILS: "admin@bbva.com" });
  assert.throws(() => context.requireMarketsAdministrator_(), /Acceso denegado/);
  assert.equal(context.getMarketsUserContext().isAdmin, false);
  context.currentMarketsUserEmail_ = () => "ADMIN@BBVA.COM";
  assert.equal(context.getMarketsUserContext().isAdmin, true);
  assert.equal(context.requireMarketsAdministrator_().email, "ADMIN@BBVA.COM");
});

test("admin endpoint always performs server-side authorization", () => {
  const admin = fs.readFileSync(new URL("../src/58_Admin.gs", import.meta.url), "utf8");
  assert.match(admin, /function getMarketsAdminDashboard\(includeUsage = true\) \{\s*const access = requireMarketsAdministrator_\(\)/);
  assert.match(admin, /function saveMarketsAdminSubscriber\(email, payload\) \{\s*const access = requireMarketsAdministrator_\(\)/);
  assert.match(admin, /function requestMarketsAdminRatingRecovery\(\) \{\s*const access = requireMarketsAdministrator_\(\)/);
  assert.match(admin, /normalizeMarketsAlertEmail_\(email\)/);
  assert.match(admin, /runDailyRatingMonitor\(\)/);
  assert.match(admin, /requireCurrentSheetContract_/);
  assert.match(admin, /webAppUrl:\s*marketsWebAppUrl_\(\)/);
  assert.match(admin, /readMarketsUsageAnalytics_/);
});

test("admin client exposes subscriber maintenance and manual rating recovery", () => {
  const app = fs.readFileSync(new URL("../src/App.html", import.meta.url), "utf8");
  const index = fs.readFileSync(new URL("../src/Index.html", import.meta.url), "utf8");
  assert.match(app, /saveMarketsAdminSubscriber\(argument\.email,argument\.preferences\)/);
  assert.match(app, /requestMarketsAdminRatingRecovery\(\)/);
  assert.match(app, /function openAdminSubscriber/);
  assert.match(index, /id="admin-add-subscriber"/);
  assert.match(app, /id="admin-recovery"/);
  assert.match(index, /id="admin-subscription-editor" class="panel subscription-editor" hidden/);
  assert.match(index, /class="panel newsletter-delivery"[\s\S]*id="newsletter-test-form"[\s\S]*Suscripciones del equipo/);
  assert.match(app, /class="subscriber-table"/);
  assert.match(app, /class="process-card"/);
  assert.match(app, /preferences:\{\.\.\.row,newsletterEnabled:false\}/);
  assert.match(index, /id="admin-country-pills"/);
  assert.match(index, /id="admin-platform-pills"/);
  assert.match(index, /id="admin-country-scope-summary"/);
  assert.match(index, /id="admin-platform-scope-summary"/);
  assert.doesNotMatch(index, /id="admin-subscriber-countries"|id="admin-subscriber-platforms"/);
  assert.match(app, /function adminScopeOptions/);
  assert.match(app, /function normalizeAdminScope/);
  assert.match(app, /function handleAdminScopeClick/);
  assert.match(app, /aria-pressed=/);
  assert.doesNotMatch(app, /function adminScopeValue|split\(\/\[;,\]\//);
  assert.match(index, /id="admin-subscriber-search"/);
  assert.match(index, /id="admin-subscriber-status"/);
  assert.match(index, /id="admin-filter-countries"[^>]*multiple/);
  assert.match(index, /id="admin-filter-platforms"[^>]*multiple/);
  assert.match(index, /id="admin-subscriber-results"[^>]*aria-live="polite"/);
  assert.match(index, /id="admin-newsletter-enabled"/);
  assert.match(index, /id="admin-panel-usage"/);
  assert.match(app, /function renderAdminUsage/);
  assert.match(app, /recordMarketsUsageEvents\(batch\)/);
});

test("review operations expose current progress and only the owner can relaunch", () => {
  vm.runInContext(fs.readFileSync(new URL("../src/51_ReviewOperations.gs", import.meta.url), "utf8"), context);
  const pipeline = context.newMarketsReviewPipeline_("2026-11-11");
  pipeline.jobs[0].done = 12;
  pipeline.jobs[0].total = 20;
  context.PropertiesService = { getScriptProperties: () => ({ getProperty: () => JSON.stringify(pipeline) }) };
  context.Session = { getEffectiveUser: () => ({ getEmail: () => "owner@bbva.com" }) };
  context.ScriptApp = { getProjectTriggers: () => [
    { getHandlerFunction: () => "superviseMarketsReviews_" }
  ] };
  const owner = context.marketsAdminReviewPipeline_("owner@bbva.com");
  assert.equal(owner.installed, true);
  assert.equal(owner.canRestart, true);
  assert.equal(owner.jobs[0].priority, 0);
  assert.equal(owner.jobs[1].done, 12);
  assert.equal(owner.jobs[1].total, 20);
  const other = context.marketsAdminReviewPipeline_("other@bbva.com");
  assert.equal(other.installed, null);
  assert.equal(other.canRestart, false);
});

test("review collection resumes the remaining listings before moving to translation", () => {
  const pipeline = context.newMarketsReviewPipeline_("2026-11-11");
  const job = pipeline.jobs[0];
  const limits = [];
  context.collectMarketsReviews_ = limit => {
    limits.push(limit);
    return { eligible: 9, processed: Math.min(limit, 5), failures: 0, added: 3 };
  };
  context.collectMarketsPlayReviews_ = () => { throw Error("Unexpected Android collection"); };
  assert.equal(context.advanceMarketsReviewJob_(job, pipeline), false);
  assert.equal(context.advanceMarketsReviewJob_(job, pipeline), true);
  assert.deepEqual(limits, [Infinity, 4]);
  assert.equal(job.done, 9);
  assert.equal(job.added, 6);
});

test("selective recovery is owner-only, resumes one page and only stores the requested month", () => {
  const local = vm.createContext({ console: { warn() {} }, safeJsonParse_: JSON.parse,
    MARKETS_CONFIG: { timeZone: "Europe/Madrid" }, Utilities: { formatDate: () => "2026-11" } });
  vm.runInContext(fs.readFileSync(new URL("../src/51_ReviewOperations.gs", import.meta.url), "utf8"), local);
  const scope = { appKey: "bbva-es", month: "2026-10" };
  const app = { appKey: scope.appKey, appName: "BBVA", countryCode: "ES", platform: "Android", packageName: "com.test.app" };
  const props = new Map([["MARKETS_PLAY_REVIEW|com.test.app|ES", "regular"]]);
  const writes = [], requests = [];
  const sheet = { getLastRow: () => 1 };
  let isOwner = false;
  Object.assign(local, {
    requireMarketsReviewOwner_: () => { if (!isOwner) throw Error("Acceso denegado"); return { ss: {} }; },
    readAppCatalog_: () => [app], marketsIosReviewListings_: () => [],
    marketsReviewSheet_: () => sheet, marketsReviewWidth_: () => 16,
    marketsReviewDigest_: value => value,
    LockService: { getUserLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => props.get(key) ?? null, setProperty: (key, value) => props.set(key, value),
      deleteProperty: key => props.delete(key)
    }) },
    fetchPlayReviewPage_: (_app, cursor) => {
      requests.push(cursor);
      return { next: "next", rows: [{ id: "wanted-" + cursor, date: "2026-10-31" }, { id: "out", date: "2026-11-01" }] };
    },
    storePlayReviews_: (_sheet, _props, _known, _app, rows, summary) => {
      writes.push(...rows.map(row => row.id));
      summary.added = rows.length;
    }
  });
  assert.throws(() => local.getMarketsReviewRecoveryOptions(), /denegado/);
  assert.throws(() => local.runMarketsReviewRecovery(scope), /denegado/);
  isOwner = true;
  const first = local.runMarketsReviewRecovery(scope);
  assert.equal(first.pages, 1);
  assert.equal(first.added, 1);
  assert.equal(first.cursor, undefined);
  assert.equal(local.getMarketsReviewRecoveryOptions().state.month, scope.month);
  assert.throws(() => local.runMarketsReviewRecovery({ ...scope, month: "2026-09" }), /Termina/);
  const second = local.runMarketsReviewRecovery(scope);
  assert.equal(second.reason, "invalid_cursor");
  assert.equal(second.complete, true);
  assert.equal(second.pages, 2);
  assert.equal(second.added, 2);
  assert.equal(local.runMarketsReviewRecovery(scope).pages, 2);
  assert.deepEqual(requests, ["", "next"]);
  assert.deepEqual(writes, ["wanted-", "wanted-next"]);
  assert.equal(local.closeMarketsReviewRecovery().closed, true);
  assert.equal(props.get("MARKETS_PLAY_REVIEW|com.test.app|ES"), "regular");
});

test("coverage counts unique reviews observed in the selected storefront and does not confirm gaps from zero counts", () => {
  const local = vm.createContext({ MARKETS_CONFIG: {}, Utilities: { formatDate: () => "2026-11" } });
  vm.runInContext(fs.readFileSync(new URL("../src/51_ReviewOperations.gs", import.meta.url), "utf8"), local);
  const rows = [
    ["ES,MX", "Android", "com.test.app", "a", "2026-09-15"],
    ["ES", "Android", "com.test.app", "a", "2026-09-15"],
    ["MX", "Android", "com.test.app", "b", "2026-10-15"],
    ["ES", "iOS", "com.test.app", "c", "2026-10-15"],
    ["ES", "Android", "com.test.app", "d", "2026-11-05"]
  ];
  Object.assign(local, {
    requireMarketsReviewOwner_: () => ({ ss: {} }),
    marketsReviewRecoveryListings_: () => [{ appKey: "es", countryCode: "ES", packageName: "com.test.app", platform: "Android" }],
    marketsReviewSheet_: () => ({ getLastRow: () => rows.length + 1, getRange: (_row, col, _height, width) => {
      assert.equal(col, 3);
      assert.equal(width, 5);
      return { getValues: () => rows };
    } })
  });
  const result = local.getMarketsReviewCoverage({ appKey: "es", month: "2026-10" });
  assert.equal(result.status, "Posible hueco");
  assert.deepEqual(Array.from(result.values, item => item.count), [1, 0, 1]);
});

test("supervisor resumes pending translations after quota and publishes without rerunning collection or alerts", () => {
  const key = "MARKETS_REVIEW_PIPELINE", quota = "MARKETS_TRANSLATION_QUOTA_RETRY_AT";
  const props = new Map(), calls = [];
  const local = vm.createContext({
    MARKETS_TRANSLATION_QUOTA_RETRY_KEY: quota, MARKETS_CONFIG:{timeZone:"Europe/Madrid"}, safeJsonParse_:JSON.parse,
    Utilities:{formatDate:(_date,_tz,format)=>format==="HHmm"?"1500":"2026-11-12"},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>props.get(key),setProperty:(key,value)=>props.set(key,value)})},
    translateMarketsReviews_:()=>{calls.push("translate");return {eligible:10,checked:10,translated:1,failed:0,pending:0,complete:true}},
    publishMarketsReviewSnapshot_:()=>{calls.push("publish");return {complete:true,published:1}},
    advanceMarketsAndroidGeography_:()=>false,
    advanceMarketsFunctionalCatalog_:({sync})=>sync&&calls.push("catalog")
  });
  vm.runInContext(fs.readFileSync(new URL("../src/51_ReviewOperations.gs",import.meta.url),"utf8"),local);
  const pipeline=local.newMarketsReviewPipeline_("2026-11-12");
  pipeline.stage=pipeline.jobs.length;pipeline.jobs[2].pending=1;
  props.set(key,JSON.stringify(pipeline));props.set(quota,String(Date.now()+60000));
  local.advanceMarketsReviewPipeline_();
  assert.deepEqual(calls,["catalog"]);
  props.set(quota,"0");
  for(let i=0;i<3;i++)local.advanceMarketsReviewPipeline_();
  assert.deepEqual(calls,["catalog","translate","publish","catalog"]);
  assert.equal(JSON.parse(props.get(key)).stage,pipeline.jobs.length);
});

test("the supervisor schedules one worker and skips a live lease", () => {
  const properties = new Map(), triggers = [];
  const local = vm.createContext({
    safeJsonParse_: value=>JSON.parse(value||"null"),
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties.get(key),setProperty:(key,value)=>properties.set(key,value)})},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
    ScriptApp:{getProjectTriggers:()=>triggers,newTrigger:handler=>({timeBased:()=>({after:()=>({create:()=>
      triggers.push({getHandlerFunction:()=>handler})})})})}
  });
  vm.runInContext(fs.readFileSync(new URL("../src/51_ReviewOperations.gs",import.meta.url),"utf8"),local);
  properties.set("MARKETS_REVIEW_PIPELINE",JSON.stringify({leaseUntil:Date.now()+60000}));
  local.superviseMarketsReviews_();
  assert.equal(triggers.length,0);
  properties.delete("MARKETS_REVIEW_PIPELINE");
  local.superviseMarketsReviews_();
  local.superviseMarketsReviews_();
  assert.deepEqual(triggers.map(trigger=>trigger.getHandlerFunction()),["runMarketsReviewWorker_"]);
});

test("unified supervisor waits for the migration day, then dispatches each scheduled job once", () => {
  const values = new Map([["MARKETS_UNIFIED_OPERATIONS","2026-11-14"]]), calls = [];
  const properties = {getProperty:key=>values.get(key),setProperty:(key,value)=>values.set(key,value)};
  const runtime = vm.createContext({
    advanceMarketsAndroidGeography_:()=>false,
    safeJsonParse_:value=>JSON.parse(value||"null"),
    PropertiesService:{getScriptProperties:()=>properties},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
    Utilities:{formatDate:(date,_,format)=>format==="HHmm"?"1015":date.toISOString().slice(0,10)},
    MARKETS_CONFIG:{timeZone:"Europe/Madrid",runHour:7,runMinute:5,newsletterHour:8,newsletterMinute:15,healthCheckHour:9,healthCheckMinute:15},
    runDailyRatingMonitor:()=>calls.push("ratings"),
    runMarketsMonthlyNewsletter:()=>calls.push("newsletter"),
    checkDailyRatingMonitorHealth:()=>calls.push("health")
  });
  vm.runInContext(fs.readFileSync(new URL("../src/51_ReviewOperations.gs",import.meta.url),"utf8"),runtime);
  assert.equal(runtime.advanceMarketsScheduledOperations_(new Date("2026-11-14")),false);
  const first = new Date("2026-12-01");
  for(let i=0;i<4;i++)runtime.advanceMarketsScheduledOperations_(first);
  assert.deepEqual(calls,["ratings","newsletter","health"]);
});

test("log archive verifies complete rows and refuses deletion if the sheet changes", () => {
  const entries = new Map(), files = new Map(), books = new Map();
  let nextId=0, changed=false, deleted=0;
  const iterator=values=>({hasNext:()=>values.length>0,next:()=>values.shift()});
  const folder={getId:()=>"folder",getFilesByName:name=>iterator([...files.values()].filter(item=>item.name===name&&item.parent===folder))};
  const tab=()=>{
    let rows=[];
    const range=(row,_col,size)=>({
      setNumberFormat:()=>range(row,_col,size),
      setValues:data=>{rows=structuredClone(data).map(values=>values.map(value=>typeof value==="string"?value.replace(/^'/,""):value));},
      getValues:()=>structuredClone(rows.slice(row-1,row-1+size))
    });
    return {setName(){return this},getRange:range,getLastRow:()=>rows.length,
      getDataRange:()=>range(1,1,rows.length),setFrozenRows(){}};
  };
  const create=name=>{
    const id=String(++nextId),metadata=tab(),data=tab(),book={getId:()=>id,getSheets:()=>[metadata],
      getSheetByName:name=>name==="Archivo"?metadata:data};
    const file={name,getName(){return this.name},getId:()=>id,getMimeType:()=>"google",moveTo(parent){this.parent=parent;},
      getParents(){return iterator(this.parent?[this.parent]:[]);}};
    files.set(id,file);books.set(id,book);return book;
  };
  const runtime=vm.createContext({
    safeJsonParse_:value=>JSON.parse(value||"null"), marketsReviewDigest_:s=>s,
    MARKETS_CONFIG:{timeZone:"Europe/Madrid"},Utilities:{formatDate:()=>"2026-11-14"},
    MimeType:{GOOGLE_SHEETS:"google"},SpreadsheetApp:{flush(){},create,openById:id=>books.get(id)},
    DriveApp:{getFileById:id=>files.get(id),getFolderById:()=>folder},
    ensureSheetCapacity_(){}, marketsReviewLiteral_:value=>typeof value==="string"&&/^[=+@'-]/.test(value)?"'"+value:value
  });
  vm.runInContext(fs.readFileSync(new URL("../src/55_ReviewMaintenance.gs",import.meta.url),"utf8"),runtime);
  const props={getProperty:k=>entries.get(k),setProperty:(k,v)=>{entries.set(k,v);if(changed&&k.startsWith("MARKETS_FULL_LOG_ARCHIVE:"))rows[0][2]="changed"},deleteProperty:k=>entries.delete(k)};
  const rows=[["2026-10-01","run-1","=full detail"],["2026-11-13","run-2","recent"]];
  const sheet={getName:()=>"RUN_LOG",getLastRow:()=>rows.length+1,getRange:(row,_col,count)=>({getValues:()=>rows.slice(row-2,row-2+count).map(r=>r.slice())}),deleteRows:(_,count)=>{deleted+=count;rows.splice(0,count)}};
  const run=()=>runtime.archiveMarketsLogPrefix_({getId:()=>"source"},sheet,["DATE","ID","DETAIL"],"folder",Date.parse("2026-11-01"),props,new Date("2026-11-14"));
  changed=true;
  assert.throws(run,/origen cambió/);
  assert.equal(deleted,0);
  rows[0][2]="=full detail";changed=false;
  assert.equal(run(),1);
  assert.equal(deleted,1);
  assert.equal(rows[0][1],"run-2");
  assert.equal(files.get("1").getMimeType(),"google");
  assert.equal(files.size,1);
  assert.equal(JSON.parse(runtime.readMarketsLogArchive_(files.get("1"))).rows[0][2],"=full detail");
});


test("review alert progress reads actual sent and total counts from the audit", () => {
  const indexes = {timestamp:0,metric_value:1,threshold:2,detail:3};
  const row = [new Date("2026-11-15T07:00:00Z"), 5, 8,
    JSON.stringify({status:"PARTIAL",deliveredAt:"2026-11-15T07:00:06Z"})];
  const audit = context.parseMarketsReviewAlertRun_(row,indexes);
  assert.equal(audit.startedAt,"2026-11-15T07:00:00.000Z");
  assert.equal(audit.sent,5);
  assert.equal(audit.total,8);
  assert.equal(audit.status,"PARTIAL");
  assert.equal(context.parseMarketsReviewAlertRun_([row[0],9,8,row[3]],indexes),null);
});

test("historic newsletter recipients prove a minimum per edition but never supply the latest run denominator", () => {
  const runtime = vm.createContext({ Date, console, MARKETS_REVIEW_ALERTS_RUN: "REVIEW_ALERTS_RUN",
    normalizeEmailForComparison_: value => String(value || "").toLowerCase(),
    MARKETS_CONFIG: { sheets: { alerts: "ALERT_LOG" }, headers: {
      alerts: ["timestamp", "user_email", "recipients", "type", "run_id", "source"]
    } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === "MARKETS_JOB_TIMING:newsletter"
      ? JSON.stringify({ startedAt: "2026-11-02T07:00:00.000Z", status: "ERROR" }) : null }) }
  });
  vm.runInContext(source, runtime);
  const rows = [
    ["2026-10-01T07:00:00.000Z", "old@bbva.com", "", "NEWSLETTER_MONTHLY", "NEWS-2026-09", "MONTHLY_NEWSLETTER"],
    ["2026-11-01T07:00:00.000Z", "new@bbva.com", "", "NEWSLETTER_MONTHLY", "NEWS-2026-10", "MONTHLY_NEWSLETTER"],
    ["2026-11-01T07:05:00.000Z", "new@bbva.com", "", "NEWSLETTER_MONTHLY", "NEWS-2026-10", "MONTHLY_NEWSLETTER"],
    ["2026-11-01T07:07:00.000Z", "test@bbva.com", "", "NEWSLETTER_TEST", "NEWS-TEST-2026-10", "NEWSLETTER_TEST"]
  ];
  const sheet = {
    getLastRow: () => rows.length + 1,
    getRange: (start, _column, count) => ({
      getValues: () => rows.slice(start - 2, start - 2 + count),
      createTextFinder: source => ({ matchEntireCell: () => ({
        findAll: () => rows.flatMap((row, index) => row[5] === source ? [{ getRow: () => index + 2 }] : [])
      }) })
    })
  };
  const { newsletter } = runtime.readMarketsAdminDeliveries_({ getSheetByName: () => sheet });
  assert.equal(newsletter.status, "ERROR");
  assert.equal(newsletter.lastDeliveryAt, "2026-11-01T07:05:00.000Z");
  assert.equal(newsletter.sent, undefined);
  assert.equal(newsletter.total, undefined);
  assert.equal(newsletter.lastAuditedEdition.period, "2026-10");
  assert.equal(newsletter.lastAuditedEdition.minimumConfirmed, 1);
});

test("manual request persists without taking the worker lock and P3 advances before translation", () => {
  const properties = new Map(), calls = [], key = "MARKETS_REVIEW_PIPELINE";
  const props = { getProperty: key => properties.get(key), setProperty: (key, value) => properties.set(key, value),
    deleteProperty: key => properties.delete(key) };
  const local = vm.createContext({
    MARKETS_CONFIG: { timeZone: "Europe/Madrid" },
    Utilities: { formatDate: (_date, _tz, fmt) => fmt === "yyyy-MM-dd" ? "2026-11-16" : "18:30" },
    safeJsonParse_: value => JSON.parse(value || "null"), requireMarketsReviewOwner_: () => ({}),
    PropertiesService: { getScriptProperties: () => props },
    LockService: { getScriptLock: () => { throw new Error("manual requests need no worker lock"); } },
    advanceMarketsReviewIndex_: () => { calls.push("index"); return { complete: false }; },
    advanceMarketsAndroidGeography_: () => { calls.push("geography"); return true; }
  });
  vm.runInContext(fs.readFileSync(new URL("../src/51_ReviewOperations.gs", import.meta.url), "utf8"), local);
  const pipeline = local.newMarketsReviewPipeline_("2026-11-16");
  pipeline.stage = pipeline.jobs.findIndex(job => job.id === "translate");
  pipeline.jobs.find(job => job.id === "alerts").status = "Revisar";
  properties.set(key, JSON.stringify(pipeline));
  assert.equal(local.runMarketsPanelJob("index").queued, true);
  assert.match(local.runMarketsPanelJob("index").message, /ya está en cola/);
  local.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
  local.advanceMarketsReviewPipeline_();
  local.advanceMarketsReviewPipeline_();
  assert.deepEqual(calls, ["index", "geography"]);
  assert.equal(properties.has("MARKETS_REVIEW_MANUAL:index"), false);
  assert.equal(JSON.parse(properties.get(key)).stage, pipeline.stage);
});
