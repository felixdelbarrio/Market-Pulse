import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { reviewSource } from './review-insights-source.mjs';
import { clientScript } from './client-script.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const SOURCE = 'MARKETS_REVIEW_ANALYTICS_SOURCE_POINTER';
const PREVIOUS = 'MARKETS_REVIEW_ANALYTICS_SOURCE_PREVIOUS';
const BASE = 'MARKETS_REVIEW_SNAPSHOT_POINTER';
const topics = { general:'Generalista', '03':'Pagos' };
const mk = (key,date,rating,country='ES',extra={}) => ({key,date,rating,countries:[country],platform:'Android',entities:['BBVA Empresas'],blocks:['03'],original:'Reseña '+key,author:'Autor '+key,title:'',reply:'',helpful:0,volumeKey:'test',relevance:'BUSINESS',...extra});
const rows = [mk('old','2025-11-15',5),mk('january','2026-01-05',5),mk('oct','2026-10-12',1),mk('nov1','2026-11-01',1),mk('nov2','2026-11-02',4,'ES',{relevance:'NONE'}),mk('nov3','2026-11-03',5,'ES',{platform:'iOS',helpful:8}),mk('peer','2026-11-04',5,'ES',{entities:['Banco Rival']}),mk('mx','2026-11-05',5,'MX'),mk('unknown','2026-11-06',3,'UNKNOWN')];

function fixture() {
  let now=Date.parse('2026-11-25T10:00:00Z'), enabled=false, seq=0, fail=()=>false, reads=0;
  const store=new Map([['MARKETS_REVIEWS_GENERATION','g1'],['MARKETS_FUNCTIONAL_REVISION','f1']]), files=new Map(), cache=new Map();
  const props={getProperty:k=>store.get(k)??null,getProperties:()=>Object.fromEntries(store),setProperty:(k,v)=>store.set(k,String(v)),deleteProperty:k=>store.delete(k)};
  const blob=(value,name='')=>{const b=Buffer.from(value);return {name,getBytes:()=>Array.from(b),getDataAsString:()=>b.toString('utf8'),buffer:b};};
  const lock=()=>({tryLock:()=>true,releaseLock(){}});
  const api=vm.createContext({Date:class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}},console:{log(){},warn(){}},
    MARKETS_CONFIG:{timeZone:'Europe/Madrid'},MARKETS_WEB:{countryCodes:['ES','MX','TR']},
    PropertiesService:{getScriptProperties:()=>props},LockService:{getUserLock:lock,getScriptLock:lock},
    Utilities:{formatDate:value=>value.toISOString().slice(0,10),DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,v)=>createHash('sha256').update(v).digest(),base64EncodeWebSafe:v=>Buffer.from(v).toString('base64url'),newBlob:blob,gzip:(b,name)=>blob(gzipSync(b.buffer),name),ungzip:b=>blob(gunzipSync(b.buffer))},
    DriveApp:{createFile:b=>{if(fail(b.name))throw Error('quota');const id='f'+(++seq);files.set(id,b);return {getId:()=>id};},getFileById:id=>({getBlob:()=>{reads++;if(!files.has(id))throw Error('missing');return files.get(id);},setTrashed:()=>files.delete(id)})},
    safeJsonParse_:s=>{try{return JSON.parse(s)}catch{return null;}},trimString_:s=>String(s??'').trim(),errorToString_:String});
  for(const file of ['54_Reviews.gs','52_ReviewInsights.gs','51_ReviewOperations.gs'])vm.runInContext(reviewSource(file),api);
  const ss={getId:()=> 'ss',getSheetByName:name=>name==='MARKET_REVIEWS'?{getLastRow:()=>113751,getRange:()=>assert.fail('full sheet scan')}:null};
  Object.assign(api,{openMarketsSpreadsheet_:()=>ss,currentMarketsUserEmail_:()=> 'reader@example.invalid',readAppCatalog_:()=>[],marketsReviewCatalogVersion_:()=> 'catalog',marketsAudienceCatalog_:()=>({revision:'aud'}),readMarketsReviewNpsEnabled_:()=>enabled,queryMarketsReviews_:()=>assert.fail('live full scan'),
    readMarketsWebCache_:(key,build)=>{if(cache.has(key))return cache.get(key);const result=build();if(result!==undefined)cache.set(key,result);return result;}});
  const versions=()=>api.marketsReviewVersions_(props.getProperties(),'catalog',undefined,'aud');
  return {api,props,store,files,cache,ss,versions,reads:()=>reads,mode:value=>{enabled=value;},clock:value=>{now=Date.parse(value);},fail:value=>{fail=value;},manifest:key=>JSON.parse(store.get(key??SOURCE)||'null'),publish:(data=rows,start='2025-01-01',end=new Date(now).toISOString().slice(0,10))=>api.publishMarketsReviewSources_(props,data,topics,start,end,versions(),enabled,now+100000,()=>true)};
}
const monthly = {country:'ES',analysisMonth:'2026-11',entity:'BBVA Empresas'};
const annual = {country:'ES',year:'2026',entity:'BBVA Empresas',segment:'DETRACTOR'};

test('independent analytical model serves an unmaterialized monthly scope without a core snapshot or Sheets scan',()=>{
  const f=fixture();assert.equal(f.publish(),true);assert.equal(f.store.has(BASE),false);assert.equal(f.manifest().analyticsSources.complete,true);
  const before=f.reads();assert.equal(f.api.getMarketsReviewAnalytics(monthly,true),null);assert.equal(f.reads(),before);
  const data=f.api.getMarketsReviewAnalytics(monthly);assert.equal(data.reviewNpsEnabled,false);assert.equal(data.recentTotal,3);assert.equal(data.annual,null);assert.equal(data.nps,undefined);assert.equal(data.timing.cacheSource,'analytic-source');assert.equal(data.timing.input,4);assert.equal(data.timing.sourceParts,1);
  const reads=f.reads();assert.equal(f.api.getMarketsReviewAnalytics(monthly).timing.cacheSource,'L1');assert.equal(f.reads(),reads);
  assert.equal(f.api.getMarketsReviewAnalytics({...monthly,audience:'BEI'}).recentTotal,2);
  assert.equal(f.api.getMarketsReviewAnalytics({...monthly,entity:'Banco Rival'}).recentTotal,1);
  assert.equal(f.api.getMarketsReviewAnalytics({...monthly,country:'ALL'}).recentTotal,5);
});

test('annual independent calculation preserves prior-year counts and the same source serves both NPS modes',()=>{
  const f=fixture();f.publish();const before=f.store.get(SOURCE);const a=f.api.getMarketsReviewAnalytics(annual);
  assert.equal(a.annual.total,5);assert.equal(a.annual.previousTotal,1);assert.deepEqual([a.annual.promoters,a.annual.neutral,a.annual.detractors],[2,1,2]);
  f.mode(true);const b=f.api.getMarketsReviewAnalytics(annual);assert.deepEqual(plain(b.annual),plain(a.annual));
  const month=f.api.getMarketsReviewAnalytics(monthly);assert.equal(month.reviewNpsEnabled,true);assert.equal(month.annual,null);assert.equal(month.nps.current,0);assert.equal(month.nps.previous,-100);
  const nps=f.api.getMarketsReviewNps({country:'ES',year:'2026'});assert.ok(nps.monthly.length);assert.equal(nps.monthly.find(p=>p.month==='2026-11'&&p.entity==='BBVA Empresas').balance,0);
  const ranking=f.api.getMarketsReviewRanking({country:'ES',analysisMonth:'2026-11'});assert.equal(ranking.rows.find(p=>p.entity==='BBVA Empresas').total,3);assert.equal(f.store.get(SOURCE),before);
  f.mode(false);assert.deepEqual(plain(f.api.getMarketsReviewNps({year:'2026'})),{reviewNpsEnabled:false,monthly:[]});
});

test('compatible prior-day data is shown with its actual cutoff, never as a new calendar month or strict data',()=>{
  const f=fixture();f.publish();f.clock('2026-11-26T09:00:00Z');
  const a=f.api.getMarketsReviewAnalytics(monthly);assert.equal(a.window.end,'2026-11-25');assert.equal(a.timing.asOf,'2026-11-25');assert.equal(a.timing.freshness,'stale');assert.equal(a.timing.refreshQueued,true);assert.ok(f.store.has('MARKETS_REVIEW_MANUAL:publish'));
  assert.throws(()=>f.api.getMarketsReviewAnalytics({...monthly,strictFreshness:true}),/se está publicando/);
  f.clock('2026-12-01T01:00:00Z');assert.equal(f.api.getMarketsReviewAnalytics({...monthly,analysisMonth:'2026-12'}).reviewPending,true);
});

test('incompatible revisions and expired sources fail closed as retryable pending, not zero reviews',()=>{
  const f=fixture();f.publish();f.store.set('MARKETS_FUNCTIONAL_REVISION','f2');let p=f.api.getMarketsReviewAnalytics(monthly);assert.equal(p.reviewPending,true);assert.equal(p.recentTotal,undefined);assert.equal(p.retryAfterMs,30000);
  f.store.set('MARKETS_FUNCTIONAL_REVISION','f1');f.clock('2026-11-28T10:00:00Z');p=f.api.getMarketsReviewAnalytics(monthly);assert.equal(p.reviewPending,true);
  f.store.set('MARKETS_REVIEW_STALE_MAX_SECONDS','604800');assert.equal(f.api.getMarketsReviewAnalytics(monthly).timing.freshness,'stale');
});

test('partial publication resumes verified partitions and retains the last complete independent generation',()=>{
  const f=fixture();f.publish();const old=f.store.get(SOURCE);f.store.set('MARKETS_REVIEWS_GENERATION','g2');f.clock('2026-11-26T10:00:00Z');f.fail(name=>name.includes('source-ES-2026'));
  assert.equal(f.publish(rows.concat(mk('new','2026-11-26',5))),false);const partial=f.manifest();assert.equal(partial.analyticsSources.complete,false);assert.equal(f.store.get(PREVIOUS),old);
  const a=f.api.getMarketsReviewAnalytics(monthly);assert.equal(a.timing.freshness,'stale');assert.equal(a.recentTotal,3);assert.equal(a.window.end,'2026-11-25');
  const mx=f.api.getMarketsReviewAnalytics({...monthly,country:'MX'});assert.equal(mx.timing.freshness,'fresh');
  f.fail(()=>false);assert.equal(f.publish(rows.concat(mk('new','2026-11-26',5))),true);const complete=f.manifest();assert.equal(complete.analyticsSources.complete,true);for(const [key,id] of Object.entries(partial.files))assert.equal(complete.files[key],id);
  assert.equal(f.api.getMarketsReviewAnalytics(monthly).recentTotal,4);assert.equal(f.store.get(PREVIOUS),old);
});

test('corrupt source shard falls back to previous generation and schedules repair without replacing the core pointer',()=>{
  const f=fixture();f.publish();f.store.set(BASE,'{"sentinel":true}');f.store.set('MARKETS_REVIEWS_GENERATION','g2');f.clock('2026-11-26T10:00:00Z');f.publish(rows.concat(mk('new','2026-11-26',5)));
  const broken=f.manifest();f.files.delete(broken.files['source-ES-2026-0']);const result=f.api.getMarketsReviewAnalytics(monthly);
  assert.equal(result.recentTotal,3);assert.equal(result.timing.freshness,'stale');assert.equal(f.store.get('MARKETS_REVIEW_ANALYTICS_SOURCE_REPAIR'),broken.publishedAt);assert.equal(f.store.get(BASE),'{"sentinel":true}');
});

test('empty verified partition is real zero; absent partition and older unmaterialized year are pending',()=>{
  const f=fixture();f.publish();const empty=f.api.getMarketsReviewAnalytics({...monthly,country:'TR'});assert.equal(empty.recentTotal,0);assert.equal(empty.timing.sourceParts,0);
  assert.equal(f.api.getMarketsReviewAnalytics({...annual,year:'2023'}).reviewPending,true);
  const source=f.manifest();delete source.analyticsSources.partitions['TR:2026'];source.analyticsSources.complete=false;f.store.set(SOURCE,JSON.stringify(source));f.cache.clear();assert.equal(f.api.getMarketsReviewAnalytics({...monthly,country:'TR'}).reviewPending,true);
});

test('browser pending state keeps the loading line, backs off past two attempts, pauses hidden tabs and cancels after navigation',async()=>{
  const app=clientScript(fs.readFileSync(new URL('../src/App.html',import.meta.url),'utf8'));
  const predicates=app.slice(app.indexOf('    const isReviewPublicationPending='),app.indexOf('    // The mode and epoch'));
  const code=app.slice(app.indexOf('    const reviewRetryBudgets='),app.indexOf('    function renderReviewBalance('));
  const timers=new Map();let next=0,attempts=0,current=true;
  const target={isConnected:true,children:[],replaceChildren(...nodes){this.children=nodes;},contains(node){return this.children.includes(node);},prepend(node){this.children.unshift(node);}};
  const doc={visibilityState:'visible',createElement:tag=>({tag,setAttribute(){}})};
  const math=Object.create(Math);math.random=()=>0;
  const sandbox={target,Math:math,activeRpc:0,window:{setTimeout:(fn,ms)=>{timers.set(++next,{fn,ms});return next},clearTimeout:id=>timers.delete(id)},document:doc,U:{loading:(label,copy)=>`<div class="loading-state">${label}${copy}</div>`},translate:String,dateLabel:String,dateTimeLabel:String,context:{key:'a',loading:'Cargando indicadores de reseñas',current:()=>current},retry:()=>{attempts++;sandbox.render();}};
  vm.runInNewContext(predicates+code+'\n globalThis.render=(error={reviewPending:true})=>renderReviewRetry(target,error,retry,context);globalThis.fresh=()=>appendReviewFreshness(target,{freshness:"stale",asOf:"2026-11-25",publishedAt:"2026-11-25T10:00:00Z"});globalThis.cancel=cancelReviewRetries;',sandbox);
  const fire=async ms=>{assert.equal(timers.size,1);const [id,timer]=timers.entries().next().value;assert.equal(timer.ms,ms);timers.delete(id);timer.fn();await Promise.resolve();await Promise.resolve()};
  sandbox.render();assert.equal(target.children.length,1);assert.match(target.children[0].innerHTML,/loading-state.*Cargando indicadores/);assert.doesNotMatch(target.children[0].innerHTML,/Reintentar/);
  await fire(30000);assert.equal(attempts,1);await fire(60000);assert.equal(attempts,2);
  doc.visibilityState='hidden';await fire(120000);assert.equal(attempts,2);doc.visibilityState='visible';await fire(15000);assert.equal(attempts,3);
  sandbox.activeRpc=2;await fire(120000);assert.equal(attempts,3);sandbox.activeRpc=0;await fire(15000);assert.equal(attempts,4);
  current=false;await fire(120000);assert.equal(attempts,4);assert.equal(timers.size,0);
  current=true;sandbox.render({reviewPending:true,retryAfterMs:250000});assert.equal([...timers.values()][0].ms,250000);sandbox.cancel();assert.equal(timers.size,0);
  sandbox.render(new Error('Acceso no autorizado'));assert.equal(timers.size,0);assert.equal(target.children[0],'Acceso no autorizado');assert.equal(target.children[1].tag,'button');
  sandbox.fresh();assert.match(target.children[0].textContent,/Datos hasta.*2026-11-25/);
});

test('geographic inference is reversible without double counting and global ranking retains the known-country scope',()=>{
  const f=fixture();f.publish(rows.concat(mk('inferred','2026-11-07',5,'ES',{attributionMethod:'review_evidence_inferred'})));
  assert.equal(f.api.getMarketsReviewAnalytics(monthly).recentTotal,4);
  assert.equal(f.api.getMarketsReviewAnalytics({...monthly,inferGeography:'NO'}).recentTotal,3);
  assert.equal(f.api.getMarketsReviewAnalytics({...monthly,country:'UNKNOWN',inferGeography:'NO'}).recentTotal,2);
  assert.equal(f.api.getMarketsReviewAnalytics({...monthly,country:'ALL',inferGeography:'NO'}).recentTotal,6);
  f.mode(true);const r=f.api.getMarketsReviewRanking({country:'ALL',analysisMonth:'2026-11'});assert.ok(r.rows.every(row=>row.country!=='UNKNOWN'));
});

test('a failed refresh enqueue never suppresses a compatible stale result or turns a cold miss into a fatal error',()=>{
  const f=fixture();f.publish();f.clock('2026-11-26T09:00:00Z');f.api.queueMarketsReviewSnapshotRefresh_=()=>{throw Error('quota');};
  const a=f.api.getMarketsReviewAnalytics(monthly);assert.equal(a.recentTotal,3);assert.equal(a.timing.freshness,'stale');assert.equal(a.timing.refreshQueued,false);
  f.store.delete(SOURCE);f.cache.clear();const p=f.api.getMarketsReviewAnalytics(monthly);assert.equal(p.reviewPending,true);assert.equal(p.timing.refreshQueued,false);
});

test('annual indicators, useful reviews and repeat authors ignore heatmap sentiment in both NPS modes',()=>{
  const f=fixture();f.publish(rows.concat(mk('helpful-detractor','2026-11-09',1,'ES',{helpful:16,author:'Repeat'}),mk('helpful-promoter','2026-11-10',5,'ES',{helpful:12,author:'Repeat'}),mk('helpful-neutral','2026-11-11',4,'ES',{helpful:10})));
  for(const enabled of [false,true]){
    f.mode(enabled);
    const results=['DETRACTOR','PROMOTER','NEUTRAL'].map(segment=>f.api.getMarketsReviewAnalytics({...annual,segment}));
    assert.ok(results.every(data=>!data.reviewPending));
    const [d,p,n]=results;assert.notDeepEqual(plain(d.entities),plain(p.entities));assert.notDeepEqual(plain(d.entities),plain(n.entities));
    assert.deepEqual(plain(d.annual),plain(p.annual));assert.deepEqual(plain(d.annual),plain(n.annual));
    assert.deepEqual(plain(d.annual.topHelpful.map(row=>row.rating)),[1,5,4]);assert.equal(d.annual.topAuthors[0].count,2);
  }
});

test('pending analytical requests prioritize their reusable country and prior-year partitions; partial progress resumes sooner',()=>{
  const f=fixture(), selected={country:'TR',year:'2026',entity:'BBVA Empresas',segment:'DETRACTOR',platform:'ALL'};
  const window=f.api.marketsReviewAnalyticsWindow_(selected,'2026-11-25');
  assert.equal(f.api.queueMarketsReviewSnapshotRefresh_(selected,window,'analytics',false,false),true);
  const payload=rows.concat(mk('tr-old','2025-05-01',4,'TR'),mk('tr-new','2026-11-07',5,'TR'));
  const writes=[];f.fail(name=>{writes.push(name);return name.includes('source-ES-2026')});
  const now=Date.parse('2026-11-25T10:00:00Z');
  const advance=()=>f.api.advanceMarketsReviewSources_(f.props,payload,topics,'2025-01-01','2026-11-25',f.versions(),false,now+100000,()=>true);
  assert.equal(advance(),false);assert.match(writes[0],/source-TR-2026/);assert.match(writes[1],/source-TR-2025/);
  assert.equal(f.api.getMarketsReviewAnalytics(selected).annual.total,1);assert.equal(f.api.getMarketsReviewAnalytics(selected).annual.previousTotal,1);
  const key='MARKETS_REVIEW_ANALYTICS_SOURCE_RETRY';assert.equal(f.manifest(key).failures,0);assert.equal(f.manifest(key).next,now+60000);
  assert.equal(advance(),false);assert.equal(f.manifest(key).failures,1);assert.equal(f.manifest(key).next,now+15*60000);
  f.fail(()=>false);assert.equal(advance(),true);assert.equal(f.store.has(key),false);
});

test('pending responses communicate supervisor backoff without delaying compatible data',()=>{
  const f=fixture(), now=Date.parse('2026-11-25T10:00:00Z');
  f.store.set('MARKETS_REVIEW_AUX_RETRY:publish',JSON.stringify({next:now+360000}));
  const first=f.api.getMarketsReviewAnalytics(monthly);assert.equal(first.reviewPending,true);assert.equal(first.retryAfterMs,300000);
  f.publish();assert.equal(f.api.getMarketsReviewAnalytics(monthly).recentTotal,3);
});

test('explicit pending scope is shared and cooled down; successful data, prefetch and other scopes remain independent',async()=>{
  const app=clientScript(fs.readFileSync(new URL('../src/App.html',import.meta.url),'utf8'));
  const helper=app.slice(app.indexOf('    const reviewRequests='),app.indexOf('    function trackReady('));
  let now=0;const calls=[];
  const sandbox={Date:class extends Date{static now(){return now}},state:{view:'analytics'},trackUsage(){},callServer:(method,scope,prefetch)=>new Promise(resolve=>calls.push({method,scope,prefetch,resolve}))};
  vm.runInNewContext(helper+'\nthis.api={fetchReviewData,hasReviewResponse};',sandbox);
  const {fetchReviewData,hasReviewResponse}=sandbox.api,scope={country:'ES',year:'2026'},other={...scope,country:'MX'};
  const one=fetchReviewData('review:analytics',scope),two=fetchReviewData('review:analytics',{year:'2026',country:'ES'});
  assert.equal(calls.length,1);calls[0].resolve({reviewPending:true,retryAfterMs:45000});
  for(const result of await Promise.allSettled([one,two])){assert.equal(result.status,'rejected');assert.equal(result.reason.retryAfterMs,45000)}
  assert.equal(hasReviewResponse('review:analytics',scope),false);now=10000;
  await assert.rejects(fetchReviewData('review:analytics',scope),error=>error.reviewPending&&error.retryAfterMs===35000);
  assert.equal(await fetchReviewData('review:analytics',scope,true),null);assert.equal(calls.length,1);
  const separate=fetchReviewData('review:analytics',other);calls[1].resolve({annual:{total:4}});assert.equal((await separate).annual.total,4);
  now=45000;const recovered=fetchReviewData('review:analytics',scope);assert.equal(calls.length,3);calls[2].resolve({annual:{total:7}});assert.equal((await recovered).annual.total,7);
  assert.equal(hasReviewResponse('review:analytics',scope),true);assert.equal((await fetchReviewData('review:analytics',scope)).annual.total,7);assert.equal(calls.length,3);
});
