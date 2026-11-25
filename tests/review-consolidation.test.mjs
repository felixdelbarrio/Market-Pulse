import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {clientScript} from './client-script.mjs';
const source=name=>fs.readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));

function server(){
  let now=1000000,seq=0,locked=false;
  const entries=new Map(), cache={get:k=>entries.get(k),getAll:keys=>Object.fromEntries(keys.map(key=>[key,entries.get(key)])),put:(key,value)=>entries.set(key,value),remove:key=>entries.delete(key)};
  const context=vm.createContext({MARKETS_CONFIG:{timeZone:'Europe/Madrid'},Date:class extends Date{static now(){return now}},CacheService:{getScriptCache:()=>cache},Utilities:{getUuid:()=>String(++seq)},LockService:{getScriptLock:()=>({tryLock:()=>{assert.equal(locked,false);locked=true;return true},releaseLock:()=>{assert.equal(locked,true);locked=false}})}});
  vm.runInContext(source('60_WebApp.gs'),context);
  return {context,cache,entries,locked:()=>locked,advance:ms=>{now+=ms}};
}
test('real shared cache admits three distinct cold review builds, deduplicates identical keys, releases locks before IO and publishes cache before releasing lease',()=>{
  const f=server(),read=f.context.readMarketsWebCache_,pending={},saturated={};let builds=0;
  assert.equal(read('A',()=>{
    builds++;assert.equal(f.locked(),false);
    assert.equal(read('A',()=>assert.fail('duplicate aggregation'),1,pending,true),undefined);
    assert.equal(read('B',()=>{builds++;return read('C',()=>{
      builds++;assert.equal(f.locked(),false);assert.equal(read('D',()=>assert.fail('capacity exceeded'),1,saturated,true),undefined);return 3;
    },1,{},true)},1,{},true),3);
    return 7;
  },1,{},true),7);
  assert.equal(pending.sharedBuildPending,true);assert.equal(saturated.sharedBuildPending,true);assert.equal(builds,3);
  assert.equal(read('A',()=>assert.fail('published value should be cached'),1,{},true),7);
  assert.equal(f.locked(),false);assert.equal([...f.entries.keys()].filter(k=>k.startsWith('markets-review-build:')).length,0);
  assert.equal(read('D',()=>11,1,{},true),11);
});
test('review lease survives failure, expires, and an old owner cannot release a replacement; cache failure remains fail-open',()=>{
  const f=server(),claim=f.context.claimMarketsReviewBuild_,release=f.context.releaseMarketsReviewBuild_,read=f.context.readMarketsWebCache_;
  assert.throws(()=>read('error',()=>{throw Error('Drive failed')},1,{},true),/Drive failed/);
  assert.equal([...f.entries.keys()].filter(k=>k.startsWith('markets-review-build:')).length,0);
  const old=claim(f.cache,'A');assert.equal(claim(f.cache,'A').busy,true);f.advance(360001);
  const next=claim(f.cache,'A');assert.equal(next.slot,old.slot);assert.notEqual(next.token,old.token);release(f.cache,old);assert.equal(claim(f.cache,'A').busy,true);release(f.cache,next);
  f.cache.getAll=()=>{throw Error('Cache temporarily unavailable')};assert.equal(read('fallback',()=>9,1,{},true),9);assert.equal(f.locked(),false);
});

function browser(){
  const app=clientScript(source('App.html')),cacheCode=app.slice(app.indexOf('    const reviewRequests='),app.indexOf('    function trackReady(')),retryCode=app.slice(app.indexOf('    const reviewRetryBudgets='),app.indexOf('    function renderReviewBalance('));
  let now=0,id=0;const calls=[],timers=new Map(),math=Object.create(Math);math.random=()=>0;
  const sandbox={Date:class extends Date{static now(){return now}},Math:math,state:{view:'analytics'},trackUsage(){},activeRpc:0,document:{visibilityState:'visible'},window:{setTimeout:(fn,ms)=>{timers.set(++id,{fn,due:now+ms});return id},clearTimeout:key=>timers.delete(key)},callServer:(method,scope,prefetch)=>new Promise((resolve,reject)=>calls.push({method,scope,prefetch,resolve,reject}))};
  vm.runInNewContext(cacheCode+retryCode+'\nglobalThis.ui={fetch:fetchReviewData,watch:watchReviewFreshness,has:hasReviewResponse,hasFresh:hasFreshReviewResponse,cancel:cancelReviewRetries};',sandbox);
  const scope={country:'ES',year:'2026'},method='review:analytics',tick=()=>new Promise(resolve=>setImmediate(resolve));
  const fire=()=>{const [key,item]=[...timers].sort((a,b)=>a[1].due-b[1].due)[0];now=Math.max(now,item.due);timers.delete(key);return item.fn()};
  const data=(total,freshness='stale',contract='same',age=10,max=3600)=>({annual:{total},timing:{freshness,asOf:freshness==='fresh'?'2026-11-26':'2026-11-25',publishedAt:freshness==='fresh'?'new':'old',reviewContract:contract,ageSeconds:age,staleMaxSeconds:max}});
  const prime=async value=>{const request=sandbox.ui.fetch(method,scope);calls.at(-1).resolve(value);return request};
  return {sandbox,ui:sandbox.ui,calls,timers,scope,method,tick,fire,data,prime,now:()=>now,advance:ms=>{now+=ms}};
}
test('stale panels quietly share revalidation, retain content while publishing, and both render the fresh cut without duplicate RPCs',async()=>{
  const f=browser(),old=await f.prime(f.data(3)),first={},second={};let renders=0;
  const refresh=async()=>{assert.equal((await f.ui.fetch(f.method,f.scope)).annual.total,4);renders++};
  for(const target of [first,second])f.ui.watch(target,f.method,f.scope,old,refresh,()=>true);
  assert.equal(f.timers.size,2);
  const p1=f.fire(),p2=f.fire();assert.equal(f.calls.length,2);f.calls[1].resolve({reviewPending:true,retryAfterMs:30000,timing:{reviewContract:'same'}});await Promise.all([p1,p2]);
  assert.equal(renders,0);assert.equal(f.timers.size,2);
  const p3=f.fire();assert.equal(f.calls.length,3);f.calls[2].resolve(f.data(4,'fresh'));await p3;await f.fire();
  assert.equal(renders,2);assert.equal(f.calls.length,3);assert.equal(f.timers.size,0);
});
test('stale observation stops on navigation and suspends hidden tabs; incompatible revisions discard the previous cache rather than keeping stale results',async()=>{
  const f=browser(),old=await f.prime(f.data(3)),target={};let current=true,refreshes=0;
  const refresh=async()=>{refreshes++;assert.equal(f.ui.has(f.method,f.scope),false);await assert.rejects(f.ui.fetch(f.method,f.scope),error=>error.reviewContract==='new-contract')};
  f.ui.watch(target,f.method,f.scope,old,refresh,()=>current);f.sandbox.document.visibilityState='hidden';await f.fire();assert.equal(f.calls.length,1);
  f.sandbox.document.visibilityState='visible';const pending=f.fire();assert.equal(f.calls.length,2);f.calls[1].resolve({reviewPending:true,retryAfterMs:30000,timing:{reviewContract:'new-contract'}});await pending;
  assert.equal(refreshes,1);assert.equal(f.timers.size,0);
  f.ui.watch(target,f.method,f.scope,old,refresh,()=>current);current=false;await f.fire();assert.equal(f.calls.length,2);assert.equal(f.timers.size,0);
});
test('stale display expires at the policy deadline and falls back to the normal loader instead of extending the previous cut',async()=>{
  const f=browser(),old=await f.prime(f.data(3,'stale','same',50,60));let expired=0;
  f.ui.watch({},f.method,f.scope,old,()=>{expired++;assert.equal(f.ui.has(f.method,f.scope),false)},()=>true);
  assert.equal([...f.timers.values()][0].due,10000);await f.fire();assert.equal(expired,1);assert.equal(f.calls.length,1);assert.equal(f.timers.size,0);
});

test('returning to a stale panel restarts observation without extending its original freshness deadline',async()=>{
  const f=browser(),old=await f.prime(f.data(3,'stale','same',50,60));
  assert.equal(f.ui.has(f.method,f.scope),true);assert.equal(f.ui.hasFresh(f.method,f.scope),false);
  f.ui.watch({},f.method,f.scope,old,()=>{},()=>true);f.ui.cancel();assert.equal(f.timers.size,0);
  f.advance(5000);assert.equal(await f.ui.fetch(f.method,f.scope),old);let expired=0;
  f.ui.watch({},f.method,f.scope,old,()=>{expired++},()=>true);
  assert.equal([...f.timers.values()][0].due,10000);await f.fire();assert.equal(expired,1);assert.equal(f.calls.length,1);
  const fresh=await f.prime(f.data(4,'fresh'));assert.equal(fresh.annual.total,4);assert.equal(f.ui.hasFresh(f.method,f.scope),true);
});
