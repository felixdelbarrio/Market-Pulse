import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
// Resolve exactly the repository's Apps Script source directory, like the
// pre-existing tests. No alternate source copies or generated VM shims.
const dir = fileURLToPath(new URL('../src/', import.meta.url));
const clone = value => JSON.parse(JSON.stringify(value));
function makeContext(source = dir) {
  let setting = true;
  const prop = {};
  const properties = { getProperty: key => prop[key] ?? null, getProperties: () => ({ ...prop }), setProperty: (key, value) => { prop[key] = String(value); }, deleteProperty: key => { delete prop[key]; } };
  const logs = [];
  const sandbox = {
    console: { log: value => logs.push(value), warn: () => {} },
    MARKETS_DEFAULT_REVIEW_SEGMENTS: [{id:'DETRACTOR',label:'Detractores',stars:[1,2,3]},{id:'NEUTRAL',label:'Neutros',stars:[4]},{id:'PROMOTER',label:'Promotores',stars:[5]}],
    MARKETS_REVIEW_AUDIENCE_VERSION: 'fixture-audience', MARKETS_AUDIENCE_SHEET: 'FIXTURE_AUDIENCE',
    Utilities: { formatDate: () => '2026-11-25', DigestAlgorithm:{SHA_256:'sha256'}, computeDigest: (_,value)=>crypto.createHash('sha256').update(value).digest(), base64EncodeWebSafe: value=>Buffer.from(value).toString('base64url') },
    PropertiesService: {getScriptProperties:()=>properties},
    LockService: {getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    SpreadsheetApp:{flush:()=>{}},
    safeJsonParse_: text=>{try{return JSON.parse(text)}catch{return null}}, trimString_: value=>String(value??'').trim()
  };
  const context = vm.createContext(sandbox);
  for (const name of ['00_Config.gs','40_Sheets.gs','51_ReviewOperations.gs','52_ReviewInsights.gs','58_Admin.gs','60_WebApp.gs']) vm.runInContext(fs.readFileSync(path.join(source,name),'utf8'), context, {filename:name});
  const run = code => vm.runInContext(code,context);
  const controlRows = () => setting === undefined ? [] : [['REVIEW_NPS_ENABLED', setting]];
  const controlSheet = {
    getLastRow: () => controlRows().length + 1,
    getRange: (row, col, height, width) => {
      assert.equal(row, 2); assert.equal(col, 1); assert.equal(width, 2);
      assert.equal(height, controlRows().length);
      return { getValues: controlRows };
    }
  };
  const mockSheet = { getSheetByName: name => name === 'CONTROL' ? controlSheet : null };
  Object.assign(sandbox, {openMarketsSpreadsheet_:()=>mockSheet, currentMarketsUserEmail_:()=> 'tester@example.invalid'});
  return {sandbox,run,prop,properties,logs,setting:value=>{setting=value},context,mockSheet};
}
const mk = (key,rating,date,blocks,extra={}) => ({key,rating,date,blocks,entities:['BBVA Empresas'],countries:['ES'],platform:'Android',volumeKey:'shared',translations:{},replyTranslations:{},title:'',original:'texto operativo '+key,author:'Autor '+key,reply:'',helpful:0,...extra});
const rows = [mk('prev',5,'2026-10-10',['03']),mk('d1',1,'2026-11-01',['03']),mk('d2',2,'2026-11-02',['03','02'],{attributionMethod:'review_evidence_inferred'}),mk('d3',3,'2026-11-03',['02']),mk('n',4,'2026-11-04',['03']),mk('p',5,'2026-11-05',['03'],{helpful:6,reply:'respuesta'}),mk('general',5,'2026-11-06',[])];
const topics={general:'Generalista','02':'Cuentas','03':'Pagos'};
const window={start:'2026-06-01',recent:'2026-11-01',end:'2026-11-25'};
const annual={start:'2026-01-01',end:'2026-11-25'};
function aggregate(env, segment, enabled, year=false) {
  return clone(env.sandbox.summarizeMarketsReviewAnalytics_(rows,topics,{country:'ES',entity:'BBVA Empresas',...(year?{year:'2026'}:{analysisMonth:'2026-11'}),segment},year?{...annual,recent:annual.start}:window,annual,enabled));
}
test('CONTROL booleano, ausencia compatible y valor por defecto',()=>{
  const e=makeContext(); const fn=e.sandbox.marketsReviewNpsEnabled_;
  assert.equal(fn({}),true); assert.equal(fn({REVIEW_NPS_ENABLED:false}),false); assert.equal(fn({REVIEW_NPS_ENABLED:' FALSE '}),false); assert.equal(fn({REVIEW_NPS_ENABLED:true}),true);
  assert.equal(e.run("MARKETS_CONFIG.controlDefaults.find(row=>row[0]==='REVIEW_NPS_ENABLED')[1]"),true);
  assert.equal(e.run("MARKETS_BUSINESS_CONTROL.includes('REVIEW_NPS_ENABLED')"),true);
});
test('TRUE conserva balance, brecha, series y ejemplos',()=>{
  const e=makeContext(); const v=aggregate(e,'',true);
  assert.equal(v.nps.current,100*(2-3)/6);assert.equal(v.nps.previous,100);assert.equal(v.monthlyByGeography.length,2);assert.equal(v.annual.promoters,3);
  assert.equal(v.deltas.find(r=>r.id==='03').balance,-25);assert.ok(v.examples.length);
  if(process.env.MARKET_PULSE_BASE){const old=aggregate(makeContext(process.env.MARKET_PULSE_BASE),'',true);delete v.reviewNpsEnabled;assert.deepEqual(v,old);}
});
test('FALSE no ejecuta ninguna agregacion NPS y conserva sentimiento/ejemplos',()=>{
  const e=makeContext(); e.sandbox.countMarketsReviewNps_=()=>{throw Error('NPS counter called')};e.sandbox.reviewBalancePoints_=()=>{throw Error('NPS formula called')};
  for(const [segment,total] of [['',6],['DETRACTOR',3],['NEUTRAL',1],['PROMOTER',2]]){
    const v=aggregate(e,segment,false);assert.equal(v.reviewNpsEnabled,false);assert.equal(v.nps,undefined);assert.equal(v.monthlyByGeography,undefined);assert.deepEqual(v.monthly,[]);assert.equal(v.baseline,null);assert.equal(v.recentTotal,total);assert.ok(v.examples.length);
    for(const r of v.deltas){assert.equal(r.balance,undefined);assert.equal(r.gap,undefined);assert.equal(r.total,r.promoters+r.neutral+r.detractors);}
    for(const {review} of v.examples){assert.ok(segment===''||e.sandbox.MARKETS_DEFAULT_REVIEW_SEGMENTS.find(s=>s.id===segment).stars.includes(review.rating));assert.ok(v.deltas.some(r=>r.id=== (review.blocks.length?review.blocks[0]:'general'))||review.blocks.some(b=>v.deltas.some(r=>r.id===b)));}
    assert.equal(v.annual.promoters,3);assert.equal(v.annual.detractors,3);assert.equal(v.annual.neutral,1);
  }
});
test('Mapa de calor y distribucion anual identicos en ambos modos',()=>{
  const e=makeContext();for(const segment of ['DETRACTOR','PROMOTER','NEUTRAL']){const on=aggregate(e,segment,true,true),off=aggregate(e,segment,false,true);for(const key of ['annual','entities','entityOptions','leadingBlock','total'])assert.deepEqual(off[key],on[key]);}
});
test('RPC NPS y ranking desactivados antes de consultar cache o datos',()=>{
  const e=makeContext();e.setting(false);e.sandbox.readMarketsReviewCache_=()=>{throw Error('cache consulted')};assert.deepEqual(clone(e.sandbox.getMarketsReviewNps({year:'2026'})),{reviewNpsEnabled:false,monthly:[]});assert.deepEqual(clone(e.sandbox.getMarketsReviewRanking({})),{reviewNpsEnabled:false,rows:[]});assert.equal(e.sandbox.queueMarketsReviewSnapshotRefresh_({},window,'nps',false,false),false);assert.deepEqual(e.prop,{});
});
function fixtureManifest(e,enabled){return {schema:15,analyticsSourceVersion:1,end:'2026-11-25',publishedAt:new Date().toISOString(),versions:['g','f','c'],npsVersions:['s','','c'],audienceVersion:'fixture-audience',reviewNpsEnabled:enabled,hasFeaturedReviews:true,hasNpsAttribution:true,hasAllSentimentGaps:enabled,hasAnnualNps:enabled,hasReviewRanking:enabled,hasMonthlyBlockCounts:!enabled,requestedScopes:[]};}
test('Manifiesto y lector distinguen modos; paginas independientes compatibles',()=>{
  const e=makeContext(),off=fixtureManifest(e,false),on=fixtureManifest(e,true);const match=e.sandbox.marketsReviewSnapshotCapabilitiesMatch_;
  assert.equal(match(off,false),true);assert.equal(match(on,true),true);assert.equal(match(off,true),false);assert.equal(match(on,false),false);const legacy={...on};delete legacy.reviewNpsEnabled;assert.equal(match(legacy,true),true);
  const now=Date.now(),filters={country:'ES',analysisMonth:'2026-11'},read=e.sandbox.marketsReviewSnapshotState_;assert.equal(read(off,'analytics',filters,window,off.versions,{},now,{},false,false).freshness,'fresh');assert.equal(read(on,'analytics',filters,window,on.versions,{},now,{},false,false),null);assert.equal(read(off,'analytics',filters,window,off.versions,{},now,{},true,true),null);assert.equal(read(off,'nps',{year:'2026'},window,off.npsVersions,{},now,{},false,false),null);assert.equal(read(off,'page',{},window,off.versions,{},now,{},false,true).freshness,'fresh');
});
test('Supervisor acepta snapshot OFF completo y solicita publicar al reactivar',()=>{
  const e=makeContext();e.setting(false);const off=fixtureManifest(e,false);e.prop.MARKETS_REVIEW_SNAPSHOT_POINTER=JSON.stringify(off);e.prop.MARKETS_REVIEW_ANALYTICS_SOURCE_POINTER=JSON.stringify({...off,analyticsSources:{schema:1,complete:true,start:'2025-01-01'}});e.sandbox.readAppCatalog_=()=>[];e.sandbox.marketsReviewCatalogVersion_=()=> 'c';e.sandbox.marketsAudienceCatalog_=()=>({revision:''});e.sandbox.marketsReviewVersions_=()=>off.versions;
  assert.equal(e.sandbox.marketsReviewSnapshotRefreshDue_(e.properties,new Date()),false);e.setting(true);assert.equal(e.sandbox.marketsReviewSnapshotRefreshDue_(e.properties,new Date()),true);
});
test('Publicacion OFF omite scopes NPS y ranking, mantiene pages y featured; ON reversible',()=>{
  const e=makeContext();let captured;
  Object.assign(e.sandbox,{readAppCatalog_:()=>[],marketsReviewCatalogVersion_:()=> 'c',marketsAudienceCatalog_:()=>({revision:''}),marketsReviewTopics_:()=>topics,queryMarketsReviews_:()=>rows,compareMarketsHelpfulReviews_:(a,b)=>b.helpful-a.helpful,compareMarketsReviewRows_:(a,b)=>b.date.localeCompare(a.date),writeMarketsReviewSnapshot_:(_p,manifest,values,valid)=>{assert.equal(valid(),true);captured={manifest:clone(manifest),values:clone(values)};e.prop.MARKETS_REVIEW_SNAPSHOT_POINTER=JSON.stringify(manifest);return true;}});
  e.setting(false);const original=e.sandbox.summarizeMarketsReviewNps_;e.sandbox.summarizeMarketsReviewNps_=()=>{throw Error('NPS aggregator called')};e.prop.MARKETS_REVIEW_REQUESTED_SCOPES=JSON.stringify([{id:'ignored',scope:'nps:ES:requested:ignored',operation:'nps',requestedAt:Date.now(),filters:{country:'ES'},window}]);assert.equal(e.sandbox.publishMarketsReviewSnapshot_().complete,true);assert.equal(captured.manifest.reviewNpsEnabled,false);assert.ok(!Object.keys(captured.values).some(k=>/^(nps|ranking):/.test(k)));assert.ok(Object.keys(captured.values).some(k=>k.startsWith('page:ES:')));assert.ok(Object.keys(captured.values).some(k=>k.startsWith('featured:')));const monthlyAllStars='analytics:ES:2026-11:2026-06-01:2026-11-25:all-stars';
  const assertAllStars=()=>{const data=captured.values[monthlyAllStars];assert.ok(data,'La publicación debe incluir el ámbito mensual de todas las reseñas');assert.equal(data.recentTotal,6);assert.equal(data.deltas.find(row=>row.id==='03').total,4);assert.equal(data.deltas.find(row=>row.id==='03').promoters,1);assert.equal(data.deltas.find(row=>row.id==='03').detractors,2);assert.equal(data.deltas.find(row=>row.id==='03').total-data.deltas.find(row=>row.id==='03').promoters-data.deltas.find(row=>row.id==='03').detractors,1);};
  assertAllStars();const offCount=captured.manifest.count;assert.equal(e.sandbox.publishMarketsReviewSnapshot_().complete,true);e.setting(true);e.sandbox.summarizeMarketsReviewNps_=original;delete e.prop.MARKETS_REVIEW_REQUESTED_SCOPES;assert.equal(e.sandbox.publishMarketsReviewSnapshot_().complete,true);assert.ok(captured.manifest.count>offCount);assert.ok(Object.keys(captured.values).some(k=>k.startsWith('nps:')));assert.ok(Object.keys(captured.values).some(k=>k.startsWith('ranking:')));assertAllStars();
});
test('Charts mensual OFF no contiene NPS; grafico de recuentos usa ambas barras y neutro',()=>{
  const ui={esc:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),empty:()=>''};const w={MarketsUI:ui,MarketsDomain:{finite:Number.isFinite}};const c=vm.createContext({window:w});vm.runInContext(fs.readFileSync(path.join(dir,'Charts.html'),'utf8').replace(/^<script>\s*|\s*<\/script>\s*$/g,''),c);
  const model={periods:['2026-11'],rows:[{country:'ES',cells:[{rating:4.6,platforms:[{platform:'iOS',value:1}],nps:50}]}]};const opts={format:String,integer:String,compactInteger:String,monthLabel:String,signed:String,npsReady:true};assert.match(w.MarketsCharts.monthlyMatrix(model,opts),/monthly-nps/);assert.doesNotMatch(w.MarketsCharts.monthlyMatrix(model,{...opts,reviewNpsEnabled:false}),/monthly-nps|NPS/);const html=w.MarketsCharts.reviewBlockCounts([{label:'Pagos',promoters:2,detractors:3,neutral:1,total:6}],String,String);assert.match(html,/gap-positive/);assert.match(html,/gap-negative/);assert.match(html,/gap-neutral/);assert.match(html,/Promotores: 2/);assert.doesNotMatch(html,/\bNPS\b|\bpp\b/);
});
test('Guardado administrativo migra la fila ausente y respeta compare-and-set',()=>{
  const e=makeContext(), rows=[['ADMIN_EMAILS','admin@example.invalid','']];let lock=0;
  const sheet={getLastRow:()=>rows.length+1,getRange:(r,c,n=1,m=1)=>({getValues:()=>rows.slice(r-2,r-2+n).map(row=>row.slice(c-1,c-1+m)),setValue:v=>{rows[r-2][c-1]=v},setValues:vv=>{for(const [i,v] of vv.entries())rows[r-2+i]=v;}})};
  Object.assign(e.sandbox,{requireMarketsAdministrator_:()=>({ss:e.mockSheet,control:{}}),requireCurrentSheetContract_:()=>sheet,ensureSheetCapacity_:()=>{},LockService:{getScriptLock:()=>({tryLock:()=>{assert.equal(lock,0);lock++;return true},releaseLock:()=>{lock--}})}});
  const save=(value,expected)=>clone(e.sandbox.saveMarketsBusinessCatalogEntry({section:'operation',key:'REVIEW_NPS_ENABLED',value,expected}));
  e.prop.MARKETS_REVIEW_REQUESTED_SCOPES=JSON.stringify([{id:'nps',operation:'nps',requestedAt:Date.now()},{id:'analytics',operation:'analytics',requestedAt:Date.now()}]);
  assert.deepEqual(save('false','true'),{saved:true,reviewNpsEnabled:false});assert.equal(rows[1][1],false);assert.equal(rows[1][0],'REVIEW_NPS_ENABLED');assert.deepEqual(JSON.parse(e.prop.MARKETS_REVIEW_REQUESTED_SCOPES).map(r=>r.id),['analytics']);assert.ok(e.prop['MARKETS_REVIEW_MANUAL:publish']);assert.equal(lock,0);
  assert.throws(()=>save('true','true'),/cambió/);assert.throws(()=>save('foo','false'),/true o false/);assert.deepEqual(save('true','false'),{saved:true,reviewNpsEnabled:true});assert.equal(rows.length,2);assert.equal(rows[1][1],true);
  e.sandbox.requireMarketsAdministrator_=()=>{throw Error('No autorizado')};assert.throws(()=>save('false','true'),/No autorizado/);
});
test('El cambio de modo durante la publicacion impide confirmar el manifiesto antiguo',()=>{
  const e=makeContext();let rejected=false;e.setting(false);
  Object.assign(e.sandbox,{readAppCatalog_:()=>[],marketsReviewCatalogVersion_:()=> 'c',marketsAudienceCatalog_:()=>({revision:''}),marketsReviewTopics_:()=>topics,queryMarketsReviews_:()=>rows,compareMarketsHelpfulReviews_:(a,b)=>b.helpful-a.helpful,compareMarketsReviewRows_:(a,b)=>b.date.localeCompare(a.date),writeMarketsReviewSnapshot_:(_p,_manifest,_values,valid)=>{e.setting(true);rejected=!valid();return !rejected;}});
  assert.equal(e.sandbox.publishMarketsReviewSnapshot_().complete,false);assert.equal(rejected,true);assert.equal(e.prop.MARKETS_REVIEW_SNAPSHOT_POINTER,undefined);
});
test('Frontend conmuta paneles, ranking, columnas y peticiones sin recargar el navegador',async()=>{
  const nodes=new Map(); const node=id=>{if(!nodes.has(id)){const flags=new Set();nodes.set(id,{id,flags,value:'MARKET',options:[],classList:{add:name=>flags.add(name),remove:name=>flags.delete(name),toggle:(name,active)=>{if(active)flags.add(name);else flags.delete(name)}},setAttribute:()=>{},replaceChildren:()=>{},querySelector:()=>null,add(option){this.options.push(option)}})}return nodes.get(id)};
  const ranking=node('ranking-filter');ranking.options=[{value:'MARKET'},{value:'WEIGHTED'},{value:'NPS'}];ranking.querySelector=()=>{const option=ranking.options.find(item=>item.value==='NPS');if(option)option.remove=()=>{ranking.options=ranking.options.filter(item=>item!==option)};return option};
  const w={matchMedia:()=>({matches:false}),MarketsDomain:{},MarketsUI:{},MarketsCharts:{},MarketsTheme:{},setInterval:()=>0};const doc={getElementById:node,addEventListener:()=>{}};
  const app=fs.readFileSync(path.join(dir,'App.html'),'utf8').replace(/^<script>\s*|\s*<\/script>\s*$/g,'').replace(/\}\)\(\);\s*$/, 'window.__test={applyReviewNpsMode,activeReviewGapColumns,fetchReviewData,reviewResponseKey,exportSheets,state,setBenchmarkNps:()=>{benchmarkNps=true},getBenchmarkNps:()=>benchmarkNps};})();');
  vm.runInContext(app,vm.createContext({window:w,document:doc,navigator:{languages:['es-ES']},Option:class{constructor(text,value){this.textContent=text;this.value=value}},queueMicrotask}));
  const t=w.__test;t.setBenchmarkNps();t.exportSheets.analytics.set('Evolución del NPS de reseñas',{});t.exportSheets.evolution.set('Comparativa NPS',{});const key=t.reviewResponseKey('review:analytics',{});t.applyReviewNpsMode(false,false);
  assert.equal(t.getBenchmarkNps(),false);assert.equal(ranking.options.some(x=>x.value==='NPS'),false);assert.equal(node('review-balance-panel').flags.has('hidden'),true);assert.equal(node('monthly-nps-note').flags.has('hidden'),true);assert.equal(node('review-gap-title').textContent,'Deltas de bloques funcionales en el periodo');assert.equal(t.activeReviewGapColumns().length,5);assert.equal(t.exportSheets.analytics.has('Evolución del NPS de reseñas'),false);assert.equal(t.exportSheets.evolution.has('Comparativa NPS'),false);assert.notEqual(t.reviewResponseKey('review:analytics',{}),key);assert.equal(await t.fetchReviewData('review:nps',{}),null);assert.equal(await t.fetchReviewData('review:ranking',{}),null);
  t.applyReviewNpsMode(true,false);assert.equal(ranking.options.some(x=>x.value==='NPS'),true);assert.equal(node('review-balance-panel').flags.has('hidden'),false);assert.equal(t.activeReviewGapColumns().length,9);
});

test('La cola aislada conserva el contrato anterior sin depender de Sheets y descarta NPS OFF',()=>{
  const prop={};let locks=0;
  const properties={getProperty:key=>prop[key]??null,setProperty:(key,value)=>{prop[key]=String(value)}};
  const sandbox={PropertiesService:{getScriptProperties:()=>properties},LockService:{getScriptLock:()=>({tryLock:()=>{locks++;return true},releaseLock:()=>{}})},safeJsonParse_:JSON.parse,
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,value)=>crypto.createHash('sha256').update(value).digest(),base64EncodeWebSafe:value=>Buffer.from(value).toString('base64url')}};
  vm.runInNewContext(fs.readFileSync(path.join(dir,'52_ReviewInsights.gs'),'utf8'),sandbox);
  assert.equal(typeof sandbox.readMarketsReviewNpsEnabled_,'undefined');
  const queue=sandbox.queueMarketsReviewSnapshotRefresh_,scope={country:'ES',platform:'ALL',year:'2026',audience:'BEI'};
  assert.equal(queue(scope,annual,'nps'),true);assert.equal(queue(scope,annual,'nps'),true);
  assert.equal(JSON.parse(prop.MARKETS_REVIEW_REQUESTED_SCOPES).length,1);
  const before=locks;assert.equal(queue(scope,annual,'nps',false,false),false);assert.equal(locks,before);
  assert.equal(queue({...scope,search:'private text'},annual,'analytics',false,false),true);
  assert.ok(!prop.MARKETS_REVIEW_REQUESTED_SCOPES.includes('private text'));
  for(let i=0;i<10;i++)queue({...scope,year:String(2010+i)},annual,'analytics',false,false);
  const requests=JSON.parse(prop.MARKETS_REVIEW_REQUESTED_SCOPES);
  assert.equal(requests.length,8);assert.ok(requests.every(item=>item.operation==='analytics'));
});

test('RPC analytics resuelve el modo real de CONTROL, autoriza primero y rechaza un cambio concurrente',()=>{
  const e=makeContext();let reads=0,cacheCalls=0;
  const readControl=e.sandbox.readControl_;
  e.sandbox.readControl_=(ss)=>{reads++;return readControl(ss)};
  e.sandbox.localizeMarketsReviewTopics_=(_ss,data)=>data;
  e.sandbox.readMarketsReviewCache_=(_ss,operation,filters,dates,_builder,_timing,_prefetch,enabled)=>{
    cacheCalls++;assert.equal(operation,'analytics');assert.equal(enabled,e.prop.setting!==false);
    return e.sandbox.summarizeMarketsReviewAnalytics_(rows,topics,filters,dates,annual,enabled);
  };
  const request={country:'ES',year:'2026',segment:'DETRACTOR'};
  const on=clone(e.sandbox.getMarketsReviewAnalytics(request));assert.equal(on.reviewNpsEnabled,true);
  e.prop.setting=false;e.setting(false);const off=clone(e.sandbox.getMarketsReviewAnalytics(request));assert.equal(off.reviewNpsEnabled,false);assert.deepEqual(off.annual,on.annual);assert.deepEqual(off.entities,on.entities);
  assert.equal(reads,4);assert.equal(cacheCalls,2);
  e.sandbox.currentMarketsUserEmail_=()=>{throw Error('No autorizado')};assert.throws(()=>e.sandbox.getMarketsReviewAnalytics(request),/No autorizado/);assert.equal(reads,4);
  e.sandbox.currentMarketsUserEmail_=()=> 'tester@example.invalid';
  const old=e.sandbox.readMarketsReviewCache_;e.sandbox.readMarketsReviewCache_=(...args)=>{const data=old(...args);e.prop.setting=true;e.setting(true);return data};
  assert.throws(()=>e.sandbox.getMarketsReviewAnalytics(request),/configuración del NPS cambió/);
});

test('El bloque aislado de prefetch comparte una petición, reintenta sólo tras miss y no solicita NPS OFF',async()=>{
  const app=fs.readFileSync(path.join(dir,'App.html'),'utf8');
  const start=app.indexOf('    const reviewRequests=new Map()'),end=app.indexOf('    function trackReady',start);assert.ok(start>=0&&end>start);
  let resolvePrefetch;const calls=[];
  const sandbox={state:{view:'reviews'},trackUsage:()=>{},callServer:(method,scope,prefetch)=>{calls.push({method,prefetch});return prefetch?new Promise(resolve=>{resolvePrefetch=resolve}):Promise.resolve({rows:['live']})}};
  vm.runInNewContext(app.slice(start,end)+'\nthis.testAPI={fetchReviewData,reviewResponseKey,hasReviewResponse,setMode:enabled=>{reviewNpsEnabled=enabled;reviewModeEpoch++}};',sandbox);
  const t=sandbox.testAPI,scope={country:'ES',year:'2026'};
  assert.equal(t.reviewResponseKey('review:page',scope),t.reviewResponseKey('review:page',{year:'2026',country:'ES'}));
  const p=t.fetchReviewData('review:page',scope,true),q=t.fetchReviewData('review:page',scope,false);assert.equal(calls.length,1);resolvePrefetch({rows:['snapshot']});assert.deepEqual(clone(await p),{rows:['snapshot']});assert.deepEqual(clone(await q),{rows:['snapshot']});assert.equal(calls.length,1);
  const another={country:'MX'};const miss=t.fetchReviewData('review:page',another,true),retry=t.fetchReviewData('review:page',another);resolvePrefetch(null);assert.equal(await miss,null);assert.deepEqual(clone(await retry),{rows:['live']});assert.equal(calls.length,3);assert.equal(t.hasReviewResponse('review:page',another),true);
  const before=t.reviewResponseKey('review:analytics',scope),old=t.fetchReviewData('review:analytics',scope,true);t.setMode(false);resolvePrefetch({reviewNpsEnabled:true});assert.equal(await old,null);assert.notEqual(t.reviewResponseKey('review:analytics',scope),before);
  const count=calls.length;assert.equal(await t.fetchReviewData('review:nps',scope),null);assert.equal(await t.fetchReviewData('review:ranking',scope),null);assert.equal(calls.length,count);
});

test('Tabla, gráfico, ejemplos, detalle y Excel mensuales usan todas las reseñas: 9 columnas ON y 5 OFF',async()=>{
  const app=fs.readFileSync(path.join(dir,'App.html'),'utf8');
  const a=app.indexOf('    async function loadMonthlyReviews('),b=app.indexOf('    function renderAnnualReviews',a),c=app.indexOf('    const reviewGapPercent='),d=app.indexOf('    const reviewNpsSample=',c);
  const e=app.indexOf('    function monthlyReviewScope('),f=app.indexOf('    function renderMonthlyMatrix(',e);
  assert.ok(a>=0&&b>a&&c>=0&&d>c&&e>=0&&f>e);
  const headers=[],notes=[],cohorts=[],requests=[],charts=[];
  const node=()=>({classList:{add(){},remove(){},toggle(){}},setAttribute(){},replaceChildren(){},append(item){if(item.innerHTML?.startsWith('<table'))headers.push(item.innerHTML);if(item.textContent)notes.push(item.textContent)},insertAdjacentHTML(){},querySelectorAll(){return this.innerHTML?.startsWith('<table')?[node()]:[]}});
  const nodes=new Map(),$=id=>{assert.notEqual(id,'monthly-review-segment','El selector eliminado no puede consultarse');if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)};
  const scope={country:'ES',platform:'ALL',analysisMonth:'2026-11',audience:'BEI_ONLY',inferGeography:'NO',entity:'BBVA Empresas',language:'es',segment:''};
  const deltas=[{id:'03',label:'Pagos',weight:50,total:4,assignedGeography:2,detractors:2,promoters:1,neutral:1,balance:-25,gap:-10}];
  const sheets={evolution:new Map()},data={window:{start:'2026-06-01',end:'2026-11-25',recent:'2026-11-01'},deltas,recentTotal:8,baseline:null,examples:[{review:{key:'promoter',rating:5}}],topics:{}};
  const sandbox={reviewNpsEnabled:true,monthlyReviewKey:'',monthlyBalanceKey:JSON.stringify(scope),monthlyReviewsLoading:false,monthlyReviewLoadedAt:0,reviewResponseTtl:120000,monthlyRequest:0,
    performance:{now:()=>0},reviewDates:()=>({end:'2026-11-25'}),selection:()=>({country:'ES',platform:'ALL'}),monthlyFilters:{audience:'BEI_ONLY',inferGeography:'NO'},state:{evolutionApp:'BBVA Empresas'},appLanguage:'es',
    $,exportSheets:sheets,hasReviewResponse:(_method,request)=>{assert.deepEqual(clone(request),scope);return true},fetchReviewData:async(method,request)=>{requests.push([method,clone(request)]);return data},
    fmt:String,integer:String,signed:String,dateLabel:String,translate:(s,values={})=>s.replace(/\{([^}]+)\}/g,(_match,key)=>values[key]),reviewFilterLabel:(key,value)=>key==='segment'&&!value?'Todas las reseñas':value,appendReviewCohort:(_target,_label,request)=>cohorts.push(clone(request)),appendReviewFreshness(){},exportDates:()=>[],reviewExportHeader:['Clave'],reviewExportRow:row=>[row.key],renderReviewCard:row=>row.key,trackReady(){},
    document:{createElement:()=>node()},U:{esc:String,empty:(title,body)=>title+' '+body,loading:()=>''},C:{reviewGaps:rows=>{charts.push(['ON',clone(rows)]);return ''},reviewBlockCounts:rows=>{charts.push(['OFF',clone(rows)]);return ''}},setExportSheet:(view,name,_country,filters,header,rows)=>sheets[view].set(name,{filters:clone(filters),header:clone(header),rows:clone(rows)}),renderReviewRetry:(_target,error)=>{throw error}};
  vm.runInNewContext(app.slice(e,f)+app.slice(a,b)+app.slice(c,d),sandbox);
  for(const enabled of [true,false]){
    sandbox.reviewNpsEnabled=enabled;sandbox.monthlyReviewKey='';sandbox.monthlyBalanceKey=JSON.stringify(scope);
    await sandbox.loadMonthlyReviews('2026-11');
    assert.deepEqual(requests.at(-1),['review:analytics',scope]);
    assert.deepEqual(charts.at(-1),[enabled?'ON':'OFF',deltas]);
    assert.match(notes.at(-1),/Todas las reseñas/);
    assert.equal(cohorts.at(-1).segment,'');assert.equal(cohorts.at(-1).topic,'03');assert.equal(cohorts.at(-1).audience,'BEI_ONLY');assert.equal(cohorts.at(-1).inferGeography,'NO');
    const tableHeader=[...headers.at(-1).matchAll(/<th scope="col">([^<]+)<\/th>/g)].map(match=>match[1]);
    const sheet=sheets.evolution.get(enabled?'Brechas':'Deltas bloques funcionales');assert.deepEqual(tableHeader,sheet.header);assert.equal(sheet.header.length,enabled?9:5);assert.equal(sheet.rows[0].length,sheet.header.length);
    assert.deepEqual(sheet.filters.at(-1),['Sentimiento','Todas las reseñas']);
    const examples=sheets.evolution.get('Ejemplos del mes');assert.deepEqual(examples.filters,sheet.filters);assert.deepEqual(examples.rows,[['promoter']]);assert.equal($('review-examples').innerHTML,'promoter');
    assert.equal(sheet.rows[0][4],2);if(enabled)assert.deepEqual(sheet.rows[0].slice(5),[25,50,-25,-10]);else assert.ok(!sheet.header.some(label=>/NPS|% Promotoras|% Detractoras/.test(label)));
  }
  // No hay un selector alternativo al que dirigir al usuario si no hay datos.
  data.deltas=[];data.examples=[];
  for(const enabled of [true,false]){
    sandbox.reviewNpsEnabled=enabled;sandbox.monthlyReviewKey='';sandbox.monthlyBalanceKey=JSON.stringify(scope);
    await sandbox.loadMonthlyReviews('2026-11');
    assert.match($('review-deltas').innerHTML,/Sin reseñas en el periodo reciente/);
    assert.doesNotMatch($('review-deltas').innerHTML,/Elige otro sentimiento/);
  }
});

test('Prefetch mensual y carga interactiva comparten ámbito sin sentimiento; Analítica conserva el suyo',async()=>{
  const app=fs.readFileSync(path.join(dir,'App.html'),'utf8');
  const section=(start,end)=>{const a=app.indexOf(start),b=app.indexOf(end,a);assert.ok(a>=0&&b>a);return app.slice(a,b)};
  for(const enabled of [true,false]){
    const timers=[],calls=[];
    const sandbox={reviewNpsEnabled:enabled,navigator:{},document:{visibilityState:'visible'},activeRpc:0,window:{setTimeout:fn=>timers.push(fn)},
      state:{evolutionApp:'BBVA Empresas',periodYear:'2026',periodMonth:'11'},appLanguage:'tr',monthlyFilters:{audience:'BEI',inferGeography:'NO'},selection:()=>({country:'MX',platform:'ALL',segment:'NEUTRAL'}),
      $:()=>assert.fail('El prefetch no depende de ningún selector de sentimiento'),
      fetchTrends:()=>Promise.resolve([]),trendRequest:()=>({}),cachedTrendRows:()=>[{}],withPublishedRatings:rows=>rows,D:{trendRows:rows=>rows,periodModel:()=>({period:'2026-11'})},
      reviewDates:()=>({end:'2026-11-25'}),reviewScope:()=>({country:'MX',segment:'PROMOTER'}),reviewPage:0,annualScope:()=>({country:'ES',year:'2026'}),analyticsEntity:'BBVA Empresas',heatmapSegment:'DETRACTOR',annualNpsScope:scope=>scope,
      fetchReviewData:(method,scope,prefetch)=>{calls.push([method,clone(scope),prefetch]);return Promise.resolve(null)}};
    vm.runInNewContext(section('    function monthlyReviewScope(','    function renderMonthlyMatrix(')+section('    function warmViewsAfterBootstrap(','    function validateReviewDates(')+app.match(/    const annualReviewRequest=.*?;\n/)[0]+'\nwarmViewsAfterBootstrap();',sandbox);
    for(let i=0;timers.length&&i<10;i++){timers.shift()();await new Promise(resolve=>setImmediate(resolve));}
    assert.equal(timers.length,0);
    const monthly=calls.find(([method,scope])=>method==='review:analytics'&&scope.analysisMonth);
    const interactive=clone(sandbox.monthlyReviewScope('2026-11'));
    assert.deepEqual(monthly,['review:analytics',interactive,true]);
    assert.deepEqual(interactive,{country:'MX',platform:'ALL',segment:'',analysisMonth:'2026-11',audience:'BEI',inferGeography:'NO',entity:'BBVA Empresas',language:'tr'});
    assert.equal(calls.find(([method])=>method==='review:page')[1].segment,'PROMOTER');
    assert.equal(calls.find(([method,scope])=>method==='review:analytics'&&scope.year)[1].segment,'DETRACTOR');
    assert.equal(calls.some(([method])=>method==='review:nps'),enabled);
  }
});

test('Lectura real de CONTROL: valores booleanos, texto, ausencia de fila y error de lectura',()=>{
  const e=makeContext();
  const read=e.sandbox.readMarketsReviewNpsEnabled_;
  for (const [value, expected] of [[undefined,true],[true,true],[false,false],[' FALSE ',false],['TRUE',true]]) {
    e.setting(value);
    assert.equal(read(e.mockSheet),expected);
  }
  // An inaccessible workbook must not silently enable NPS.
  assert.throws(()=>read({getSheetByName(){throw Error('CONTROL no disponible')}}),/CONTROL no disponible/);
});

test('Contrato CI anterior de las columnas: conserva la declaracion original y el mapeo comun',()=>{
  const app=fs.readFileSync(path.join(dir,'App.html'),'utf8');
  assert.match(app,/const reviewGapColumns=\[/);
  assert.match(app,/reviewGapColumns\.map\(column=>column\.label\),data\.deltas\.map\(row=>reviewGapColumns\.map\(column=>column\.value\(row\)\)\)/);
  assert.equal((app.match(/const reviewGapColumns=activeReviewGapColumns\(\);/g)||[]).length,2);
});
