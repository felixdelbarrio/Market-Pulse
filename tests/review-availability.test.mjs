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

test('browser pending state provides bounded retries, cancels after navigation and displays the true cutoff',()=>{
  const app=clientScript(fs.readFileSync(new URL('../src/App.html',import.meta.url),'utf8'));
  const code=app.slice(app.indexOf('    const reviewRetryBudgets='),app.indexOf('    function renderReviewBalance('));
  const timers=[];let attempts=0,current=true;
  const target={isConnected:true,children:[],replaceChildren(...nodes){this.children=nodes;},contains(node){return this.children.includes(node);},prepend(node){this.children.unshift(node);}};
  const sandbox={target,window:{setTimeout:(fn,ms)=>timers.push({fn,ms})},document:{visibilityState:'visible',createElement:()=>({setAttribute(){}})},translate:String,dateLabel:String,dateTimeLabel:String,context:{key:'a',current:()=>current},retry:()=>{attempts++;}};
  vm.runInNewContext(code+'\n globalThis.render=()=>renderReviewRetry(target,{reviewPending:true},retry,context);globalThis.fresh=()=>appendReviewFreshness(target,{freshness:"stale",asOf:"2026-11-25",publishedAt:"2026-11-25T10:00:00Z"});',sandbox);
  sandbox.render();assert.equal(timers[0].ms,30000);timers[0].fn();assert.equal(attempts,1);sandbox.render();assert.equal(timers[1].ms,60000);current=false;timers[1].fn();assert.equal(attempts,1);sandbox.render();assert.equal(timers.length,2);sandbox.fresh();assert.match(target.children[0].textContent,/Datos hasta.*2026-11-25/);
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
