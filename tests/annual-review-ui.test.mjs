import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {clientScript} from './client-script.mjs';
const read=name=>fs.readFileSync(new URL(`../src/${name}.html`,import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const pending=()=>({reviewPending:true});
const response=(total=9)=>({annual:{total,topHelpful:[{key:'p',rating:5},{key:'d',rating:1}]},entityOptions:['BBVA Empresas','Banco Rival'],topics:{},window:{end:'2026-11-25'}});
function fixture(enabled,manualRatings=false){
  let now=0;
  const nodes=new Map(),calls=[],matrix=[],indicators=[],retries=[],ratings=[],nps=[],ratingCalls=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{id,innerHTML:'',textContent:'',options:[{}],setAttribute(){},querySelector(){return null},replaceChildren(){this.innerHTML=''}});return nodes.get(id)};
  const rpc=(method,scope)=>new Promise((resolve,reject)=>calls.push({method,scope:plain(scope),resolve,reject}));
  const trendRpc=()=>manualRatings?new Promise((resolve,reject)=>ratingCalls.push({resolve,reject})):Promise.resolve([]);
  const context=vm.createContext({trendRpc,Date:class extends Date{static now(){return now}},rpc,matrix,indicators,retries,ratings,nps,enabled,performance:{now:()=>1},navigator:{language:'es-ES',languages:['es-ES']},document:{getElementById:node,addEventListener(){},visibilityState:'visible'},window:{matchMedia:()=>({matches:false}),MarketsDomain:{finite:Number.isFinite},MarketsUI:{loading:String,option:String},MarketsCharts:{},MarketsTheme:{}}});
  const script=clientScript(read('App')).replace(/\}\)\(\);\s*$/,`
    callServer=rpc; trackUsage=()=>{}; trackReady=()=>{}; hideChartTooltip=()=>{};
    fetchTrends=trendRpc; cachedTrendRows=()=>[]; withPublishedRatings=rows=>rows;
    reviewDates=()=>({end:'2026-11-25'});
    renderAnnualChart=(scope,dates,app)=>ratings.push({scope,app});
    loadAnnualNps=(scope)=>nps.push(scope);
    renderAnnualReviews=(target,data,scope)=>{target.innerHTML='Indicadores '+data.annual.total; indicators.push({scope,data,entity:analyticsEntity}); exportSheets.analytics.set('Indicadores del periodo',data.annual);exportSheets.analytics.set('Reseñas más útiles',data.annual.topHelpful);};
    renderReviewMatrix=(target,data,scope)=>{target.innerHTML='Mapa '+scope.segment;matrix.push({scope,data});exportSheets.analytics.set('Mapa de calor',scope.segment);};
    renderReviewRetry=(target,error,retry,context)=>{target.innerHTML='Pendiente';retries.push({id:target.id,error,retry,context});};
    appendReviewFreshness=()=>{};
    radarFilters.analytics={render(){}}; annualAppControl={refresh(){},enable(){}};
    state.view='analytics'; reviewNpsEnabled=enabled; analyticsSelection={country:'ES',year:'2026',audience:'BEI',inferGeography:'NO'};
    globalThis.ui={load:loadAnalytics, sentiment:value=>{heatmapSegment=value;return loadAnalytics(false,true)},entity:value=>{analyticsEntity=value;return loadAnalytics(true)},scope:value=>{analyticsSelection=value;analyticsEntity=defaultAnalyticsEntity;return loadAnalytics()},sheets:exportSheets.analytics,busy:()=>[analyticsLoading,heatmapLoading],request:()=>annualIndicatorsRequest(annualScope())};
  })();`);
  vm.runInContext(script,context);
  return {ui:context.ui,node,calls,matrix,indicators,retries,ratings,nps,ratingCalls,advance:ms=>{now+=ms}};
}

test('heatmap pending or out-of-order response cannot invalidate the independent all-stars indicators request',async()=>{
  const f=fixture(false), initial=f.ui.load();
  assert.equal(f.calls.length,1,'Default matrix and indicators share the same actual RPC');
  const switched=f.ui.sentiment('PROMOTER');
  assert.equal(f.calls.length,2);assert.equal(f.calls[1].scope.segment,'PROMOTER');assert.equal(f.ui.request().segment,'DETRACTOR');
  assert.deepEqual(plain(f.ui.busy()),[true,true]);
  f.calls[1].resolve(pending());await switched;
  assert.equal(f.node('review-annual').innerHTML,'Cargando indicadores de reseñas');
  assert.deepEqual(f.retries.map(x=>x.id),['review-heatmap']);
  f.calls[0].resolve(response());await initial;await tick();
  assert.equal(f.node('review-annual').innerHTML,'Indicadores 9');
  assert.equal(f.node('review-heatmap').innerHTML,'Pendiente');
  assert.equal(f.indicators.length,1);assert.equal(f.matrix.length,0);
  const useful=f.ui.sheets.get('Reseñas más útiles');
  f.advance(30000);const retry=f.retries[0].retry();assert.equal(f.calls.length,3);assert.equal(f.calls[2].scope.segment,'PROMOTER');
  f.calls[2].resolve(response());await retry;
  assert.equal(f.ui.sheets.get('Mapa de calor'),'PROMOTER');
  assert.equal(f.ui.sheets.get('Reseñas más útiles'),useful);
  const neutral=f.ui.sentiment('NEUTRAL');f.calls[3].resolve(pending());await neutral;
  assert.equal(f.node('review-annual').innerHTML,'Indicadores 9');assert.equal(f.ui.sheets.get('Reseñas más útiles'),useful);assert.equal(f.ratings.length,1);assert.equal(f.nps.length,0);
});

test('annual indicators retain geography, year, audience, inference and entity; each panel rejects superseded responses',async()=>{
  const f=fixture(true), first=f.ui.load();f.calls[0].resolve(response());await first;await tick();
  assert.equal(f.indicators.length,1);assert.equal(f.matrix.length,1);
  const old=f.ui.entity('Banco Rival');assert.equal(f.calls.length,2);assert.equal(f.calls[1].scope.entity,'Banco Rival');assert.equal(f.calls[1].scope.segment,'DETRACTOR');
  const map=f.ui.sentiment('NEUTRAL');assert.equal(f.calls[2].scope.entity,'BBVA Empresas');
  const current=f.ui.scope({country:'MX',year:'2025',audience:'BEI_STRICT',inferGeography:'YES'});
  assert.equal(f.calls.length,5);assert.equal(f.calls[3].scope.segment,'NEUTRAL');
  assert.deepEqual(f.calls[4].scope,{country:'MX',year:'2025',audience:'BEI_STRICT',inferGeography:'YES',segment:'DETRACTOR',entity:'BBVA Empresas',language:'es'});
  f.calls[4].resolve(response(15));await current;assert.equal(f.node('review-annual').innerHTML,'Indicadores 15');
  f.calls[3].resolve(response(15));await tick();f.calls[1].resolve(pending());f.calls[2].resolve(response(2));await Promise.all([old,map]);
  assert.equal(f.indicators.length,2);assert.equal(f.indicators.at(-1).scope.country,'MX');assert.equal(f.matrix.at(-1).scope.country,'MX');assert.equal(f.retries.length,0);
  assert.equal(f.ui.sheets.get('Mapa de calor'),'NEUTRAL');assert.equal(f.ui.sheets.get('Indicadores del periodo').total,15);
});

test('OFF count chart diverges around one shared zero in desktop and mobile; source values are unchanged',()=>{
  const window={MarketsUI:{esc:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')}};
  vm.runInNewContext(clientScript(read('Charts')),{window});
  const rows=[{label:'Pagos <seguros>',total:10,promoters:6,detractors:3,neutral:1},{label:'Generalista',total:4,promoters:0,detractors:4,neutral:0},{label:'Otros',total:1,promoters:0,detractors:0,neutral:1}];
  const before=plain(rows),html=window.MarketsCharts.reviewBlockCounts(rows,String,String);
  const desktop=html.split('class="review-gap-plot"')[1],mobile=html.split('class="review-gap-plot"')[0];
  const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
  for(const [svg,expectedZero] of [[desktop,592.5],[mobile,160]]){
    const zero=Number(svg.match(/class="gap-zero" x1="([\d.]+)"/)[1]);close(zero,expectedZero);
    const negative=svg.match(/class="gap-negative" x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/),positive=svg.match(/class="gap-positive" x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/);
    assert.ok(Number(negative[1])<zero);close(Number(negative[1])+Number(negative[2]),zero);close(Number(positive[1]),zero);close(Number(positive[2]),2*Number(negative[2]));
    assert.doesNotMatch(svg,/gap-neutral|Neutros|Otros/);
  }
  assert.match(desktop,/<text x="252"[^>]*text-anchor="end"><tspan[^>]*>Pagos &lt;seguros>/);
  assert.match(desktop,/>-8<\/text>/);assert.match(desktop,/>8<\/text>/);
  assert.match(mobile,/<span>-8<\/span><span>0<\/span><span>8<\/span>/);
  assert.match(html,/Detractores \(−\)/);assert.match(html,/Detractores: 3/);assert.doesNotMatch(html,/Neutros|count-neutral/);
  assert.doesNotMatch(html,/width="-/);assert.deepEqual(rows,before);
  assert.match(desktop,/viewBox="0 0 960 116"/,'Two compact 28px rows, without a neutral-only row');
  assert.match(window.MarketsCharts.reviewBlockCounts([rows[2]],String,String),/No hay reseñas promotoras o detractoras/);
});

test('annual rating retry is independent and does not reload available indicators',async()=>{
  const f=fixture(false,true),initial=f.ui.load();assert.equal(f.calls.length,1);assert.equal(f.ratingCalls.length,1);
  f.calls[0].resolve(response());f.ratingCalls[0].reject(Object.assign(new Error('timeout'),{rpcOutcome:'TIMEOUT'}));await initial;await tick();
  assert.equal(f.indicators.length,1);assert.equal(f.retries[0].id,'annual-chart');const old=f.ui.sheets.get('Indicadores del periodo');
  const retry=f.retries[0].retry();assert.equal(f.ratingCalls.length,2);assert.equal(f.calls.length,1);f.ratingCalls[1].resolve([]);await retry;
  assert.equal(f.ratings.length,1);assert.equal(f.indicators.length,1);assert.equal(f.ui.sheets.get('Indicadores del periodo'),old);
});

test('annual rating uses a compact responsive coordinate system but keeps every monthly observation',()=>{
  const theme={width:1000,height:360,left:64,right:24,top:24,bottom:56,fontSize:12,pointRadius:4,pointStroke:2,lineWidth:2.5,focusLineWidth:4,palette:['#123'],grid:'#ccc',axis:'#222',surface:'#fff'};
  const window={MarketsUI:{esc:String},MarketsTheme:{chart:theme},MarketsDomain:{finite:Number.isFinite}};
  vm.runInNewContext(clientScript(read('Charts')),{window});
  const months=Array.from({length:12},(_,i)=>`2026-${String(i+1).padStart(2,'0')}`),series=[{label:'BBVA',points:months.map((month,i)=>({month,value:4+i/20}))}];
  const options={months,context:'ES',monthLabel:m=>m,format:v=>v.toFixed(1)};
  const desktop=window.MarketsCharts.lineChart(series,options).svg;assert.match(desktop,/viewBox="0 0 1000 360"/);assert.equal((desktop.match(/class="chart-point"/g)||[]).length,12);
  for(const width of [270,320,390,600,780]){
    const mobile=window.MarketsCharts.lineChart(series,{...options,compact:true,width}).svg;
    assert.match(mobile,new RegExp(`viewBox="0 0 ${width} 244"`));assert.equal((mobile.match(/class="chart-point"/g)||[]).length,12);
    assert.match(mobile,/>2026-01<\/text>/);assert.match(mobile,/>2026-12<\/text>/);assert.match(mobile,/font-size="11"/);
    const ticks=[...mobile.matchAll(/<text x="([\d.]+)" y="228"/g)].map(m=>Number(m[1]));assert.ok(ticks.length>=2&&ticks.every((x,i)=>i===0||x-ticks[i-1]>=48));
  }
  assert.match(read('ReviewChartStyles'),/#annual-chart svg\{[^}]*min-width:0/);
});

test('available review indicators render before a slow rating history and the rating does not reload the review cards',async()=>{
  const f=fixture(false,true),initial=f.ui.load();assert.equal(f.calls.length,1);assert.equal(f.ratingCalls.length,1);
  f.calls[0].resolve(response(19));await tick();
  assert.equal(f.indicators.length,1);assert.equal(f.node('review-annual').innerHTML,'Indicadores 19');assert.equal(f.ratings.length,0);
  const useful=f.ui.sheets.get('Reseñas más útiles');
  f.ratingCalls[0].resolve([]);await initial;
  assert.equal(f.ratings.length,1);assert.equal(f.calls.length,1);assert.equal(f.indicators.length,1);assert.equal(f.ui.sheets.get('Reseñas más útiles'),useful);
});
