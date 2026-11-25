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
function fixture(enabled){
  const nodes=new Map(),calls=[],matrix=[],indicators=[],retries=[],ratings=[],nps=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{id,innerHTML:'',textContent:'',options:[{}],setAttribute(){},querySelector(){return null},replaceChildren(){this.innerHTML=''}});return nodes.get(id)};
  const rpc=(method,scope)=>new Promise((resolve,reject)=>calls.push({method,scope:plain(scope),resolve,reject}));
  const context=vm.createContext({rpc,matrix,indicators,retries,ratings,nps,enabled,performance:{now:()=>1},navigator:{language:'es-ES',languages:['es-ES']},document:{getElementById:node,addEventListener(){},visibilityState:'visible'},window:{matchMedia:()=>({matches:false}),MarketsDomain:{finite:Number.isFinite},MarketsUI:{loading:String,option:String},MarketsCharts:{},MarketsTheme:{}}});
  const script=clientScript(read('App')).replace(/\}\)\(\);\s*$/,`
    callServer=rpc; trackUsage=()=>{}; trackReady=()=>{}; hideChartTooltip=()=>{};
    fetchTrends=()=>Promise.resolve([]); cachedTrendRows=()=>[]; withPublishedRatings=rows=>rows;
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
  return {ui:context.ui,node,calls,matrix,indicators,retries,ratings,nps};
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
  const retry=f.retries[0].retry();assert.equal(f.calls.length,3);assert.equal(f.calls[2].scope.segment,'PROMOTER');
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
    assert.match(svg,new RegExp(`class="gap-neutral" cx="${zero}"`));
  }
  assert.match(desktop,/<text x="252"[^>]*text-anchor="end"><tspan[^>]*>Pagos &lt;seguros>/);
  assert.match(desktop,/>-8<\/text>/);assert.match(desktop,/>8<\/text>/);
  assert.match(mobile,/<span>-8<\/span><span>0<\/span><span>8<\/span>/);
  assert.match(html,/Detractores \(−\)/);assert.match(html,/Detractores: 3/);assert.match(html,/Neutros: 1/);
  assert.doesNotMatch(html,/width="-/);assert.deepEqual(rows,before);
});
