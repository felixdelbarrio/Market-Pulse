import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { clientScript } from './client-script.mjs';

const read = name => fs.readFileSync(new URL(`../src/${name}.html`, import.meta.url), 'utf8');

function filterBindings({ crypto, sessionStorage, browserCountry = "ES" } = {}) {
  const bindings = {}, calls = [], controls = new Map(), handlers = new Map();
  const context = vm.createContext({
    navigator: { language: 'es' },
    sessionStorage,
    document: {
      addEventListener() {},
      getElementById(id) {
        if (!controls.has(id)) controls.set(id, { id, addEventListener(type, callback) { handlers.set(id + ":" + type, callback); } });
        return controls.get(id);
      }
    },
    window: {
      crypto,
      matchMedia() {},
      MarketsUI: { option() { return ''; } },
      MarketsDomain: { browserMarket: () => browserCountry, config: { countries: { ES: 'España', MX: 'México' }, platforms: ['iOS', 'Android'] } },
      MarketRadarFilters: {
        searchable() { return {}; },
        create(root, binding) {
          bindings[root.id] = binding;
          return { render() {} };
        }
      }
    },
    calls
  });
  const script = clientScript(read('App')).replace(/\}\)\(\);\s*$/, `
    renderEvolution = () => calls.push({...monthlyFilters});
    loadReviews = () => calls.push({ page: 0, ...reviewScope() });
    loadAnalytics = (localOnly=false) => calls.push({ ...annualScope(), entity: analyticsEntity, localOnly });
    renderAdminSubscribers = rows => calls.push(adminSubscriberFilterRows(rows).map(row => row.email));
    globalThis.setup = ({scope, cohort, rows}) => {
      Object.assign(state,scope);
      if (cohort) reviewDrilldown={scope:cohort,label:"Detalle"};
      if (rows) state.adminCenter={subscribers:rows};
      bindRadarFilters();
      bindEvolutionFilters();
    };
    activateView = view => { if (view === "reviews") loadReviews(); };
    globalThis.openCohort = openReviewCohort;
    globalThis.sessionId = usageSessionId;
  })();`);
  vm.runInContext(script, context);
  return { bindings, calls, handlers, setup: context.setup, openCohort: context.openCohort, sessionId: context.sessionId };
}

const copy = value => JSON.parse(JSON.stringify(value));

test('review chips preserve drill-down context and restore and show all reset the scope', () => {
  const { bindings, calls, setup } = filterBindings();
  const dates = {start:'2026-08-01',end:'2026-09-01'};
  setup({scope:{country:'MX',platform:'Android',meta:{countries:[{code:'ES'},{code:'MX'}]}},cohort:{...dates,country:'ES',platform:'iOS',segment:'NEUTRAL',topic:'01',reviewKey:'a'}});
  const reviews = bindings['review-filters'];
  const initial = reviews.initial(), all = reviews.all();
  reviews.commit({...reviews.applied(),topic:''});
  reviews.commit(initial,'restore');
  reviews.commit(all,'all');
  const [year,month]=initial.end.split('-').map(Number);
  assert.equal((Date.parse(initial.end)-Date.parse(initial.start))/86400000+1,new Date(Date.UTC(year,month,0)).getUTCDate());
  assert.deepEqual(copy(reviews.fixedChips),['start','end']);
  assert.deepEqual(copy(calls), [
    {page:0,...dates,country:'ES',platform:'iOS',segment:'NEUTRAL',topic:'',reviewKey:'a'},
    {page:0,...initial,reviewKey:''},
    {page:0,...all,reviewKey:''}
  ]);
  assert.equal(initial.country,'ES');
  assert.equal(initial.platform,'ALL');
  assert.equal(initial.app,'BBVA Empresas');
  assert.equal(all.country,'ES');
  assert.deepEqual(copy(reviews.omitChips),['country']);
  assert.ok(reviews.alwaysChips.includes('platform'));
  assert.equal(all.segment,'');
});

test('comments resolve an unsupported browser market and global drill-downs to one geography', () => {
  const { bindings, calls, setup, openCohort } = filterBindings({browserCountry:'ALL'});
  setup({scope:{meta:{countries:[{code:'ES'},{code:'MX'}]}}});
  const reviews = bindings['review-filters'];
  assert.equal(reviews.initial().country,'ES');
  reviews.commit({...reviews.applied(),country:'MX'},'apply');
  openCohort({country:'ALL',app:'BBVA Empresas',topic:'01',reviewKey:'aggregate'},'Global');
  assert.deepEqual(copy(calls.at(-1)),{page:0,country:'MX',app:'BBVA Empresas',topic:'01',reviewKey:''});
  openCohort({country:'ES',app:'BBVA Empresas',topic:'01'},'España');
  assert.equal(calls.at(-1).country,'ES');
});

test('annual filters use the browser country and reset the KPI app on year changes', () => {
  const { bindings, calls, handlers, setup } = filterBindings();
  setup({scope:{country:'MX',platform:'Android'}});
  const analytics = bindings['analytics-filters'], initial = analytics.initial();
  assert.equal(initial.country,'ES');
  assert.match(initial.year,/^\d{4}$/);
  assert.deepEqual(copy(analytics.alwaysChips),['country','year','audience','inferGeography']);
  handlers.get('analytics-entity:change')({target:{value:'Banco Central'}});
  const year=String(Number(initial.year)-1);
  analytics.commit({...analytics.applied(),year});
  assert.deepEqual(copy(calls), [
    {...initial,entity:'Banco Central',localOnly:true},
    {...initial,year,entity:'BBVA Empresas',localOnly:false}
  ]);
});

test('subscriber filters distinguish no restriction, exact all and any selected market', () => {
  const { bindings, calls, setup } = filterBindings();
  setup({rows:[
    {email:'all',active:true,countries:['ALL'],platforms:['ALL']},
    {email:'es',active:true,countries:['ES'],platforms:['iOS']},
    {email:'mx',active:false,countries:['MX'],platforms:['Android']}
  ]});
  const admin = bindings['subscriber-filters'];
  const defaults = admin.initial();
  const markets = admin.choose('countries',admin.choose('countries',defaults.countries,'ES'),'MX');
  admin.commit({...defaults,countries:markets});
  admin.commit({...defaults,countries:markets,status:'PAUSED'});
  admin.commit({...defaults,countries:admin.choose('countries',markets,'ALL')});
  admin.commit(admin.all());
  assert.deepEqual(copy(calls), [['es','mx'],['mx'],['all'],['all','es','mx']]);
});

test('market controls follow the review filters and the old return control is absent', () => {
  const index = read('Index');
  assert.match(index,/id="review-filters"[\s\S]+id="review-markets"[\s\S]+id="review-results"/);
  assert.doesNotMatch(index,/review-return|Volver a Analítica/);
});

test('telemetry replaces legacy insecure identifiers and reuses the secure identifier for the tab', () => {
  let stored = '1699999999999-legacy';
  let generated = 0;
  const { sessionId } = filterBindings({
    crypto: { getRandomValues(bytes) { generated++; return bytes.fill(0xa5); } },
    sessionStorage: { getItem: () => stored, setItem: (_, value) => { stored = value; } }
  });
  assert.equal(sessionId(), 'a5'.repeat(16));
  assert.equal(sessionId(), stored);
  assert.equal(generated, 1);
  assert.equal(filterBindings().sessionId(), '');
});

test('monthly balance does not bridge missing months and the legend matches the series color', () => {
  const window = { MarketsUI: { esc: String } };
  vm.runInNewContext(clientScript(read('Charts')), { window });
  const { reviewBalance, reviewBalanceLegend } = window.MarketsCharts;
  const chart = reviewBalance(['2026-07','2026-08','2026-09'], [{entity:'Banco Central',values:[0,null,40]}],
    {monthLabel:String,fmt:String,width:400});
  const [, path, color] = chart.match(/<path d="([^"]+)" stroke="([^"]+)" class="chart-line"/);
  assert.equal(path.split('M').length - 1,2);
  assert.doesNotMatch(path,/L/);
  assert.match(chart,/2026-08 · Sin datos/);
  const legend = reviewBalanceLegend([{entity:'Banco Central',total:19}],String);
  assert.ok(legend.includes('background:' + color));
  assert.doesNotMatch(legend,/<button/);
});

test('comments keep filters editable and ignore out-of-order results and errors after navigation', async () => {
  const nodes = new Map(), pending = [];
  const getNode = id => {
    if (!nodes.has(id)) nodes.set(id, {
      options:[{}], innerHTML:'', busy:'false', replaceChildren(){ this.innerHTML=''; },
      setAttribute(name,value){ if (name==='aria-busy') this.busy=value; }
    });
    return nodes.get(id);
  };
  const context = vm.createContext({
    navigator:{language:'es'}, performance, pending,
    document:{addEventListener(){},getElementById:getNode},
    window:{matchMedia(){}, MarketsDomain:{}, MarketsUI:{loading:()=> 'loading',empty:()=> 'empty'}}
  });
  const script = clientScript(read('App')).replace(/\}\)\(\);\s*$/, `
    renderReviewMarkets=()=>{};
    renderReviewCard=row=>row.key;
    trackReady=()=>{};
    radarFilters.reviews={render(){}};
    fetchReviewData=(_method,scope)=>new Promise((resolve,reject)=>pending.push({scope,resolve,reject}));
    globalThis.select=(country,audience="")=>{
      state.view="reviews";
      reviewSelection={country,audience};
      return loadReviews();
    };
    globalThis.navigate=()=>{state.view="analytics"};
  })();`);
  vm.runInContext(script, context);
  const a=context.select('ES'), b=context.select('MX','BEI_ONLY'), c=context.select('TR','BEI_EXTENDED');
  await Promise.resolve();
  assert.equal(pending.length,1);
  assert.equal(pending[0].scope.country,'TR');
  assert.equal(pending[0].scope.audience,'BEI_EXTENDED');
  const d=context.select('CO');
  await Promise.resolve();
  assert.equal(getNode('review-results').busy,'true');
  pending[1].resolve({topics:{},counts:{CO:1},rows:[{key:'new'}],total:1,size:25});
  await d;
  pending[0].resolve({topics:{},counts:{TR:1},rows:[{key:'old'}],total:1,size:25});
  await Promise.all([a,b,c]);
  assert.equal(getNode('review-results').innerHTML,'new');
  assert.equal(getNode('review-results').busy,'false');
  const e=context.select('ES');
  await Promise.resolve();
  context.navigate();
  pending[2].reject(new Error('late'));
  await e;
  assert.equal(getNode('review-results').innerHTML,'loading');
  assert.equal(getNode('review-results').busy,'false');
});

test('monthly audience and inference are applied and reset independently of annual and comments', () => {
  const {bindings, calls, setup} = filterBindings();
  setup({scope:{evolutionApp:'BBVA Empresas',periodYear:'2026',periodMonth:'11'}});
  const monthly = bindings['evolution-filters'], annual = bindings['analytics-filters'], comments = bindings['review-filters'];
  for (const view of [monthly, annual, comments]) {
    assert.ok(view.alwaysChips.includes('audience'));
    assert.ok(view.alwaysChips.includes('inferGeography'));
  }
  monthly.commit({...monthly.applied(), audience:'BEI_ONLY', inferGeography:'NO'});
  assert.deepEqual(copy(calls.at(-1)), {audience:'BEI_ONLY',inferGeography:'NO',segment:'DETRACTOR'});
  assert.equal(annual.applied().inferGeography, undefined);
  assert.equal(comments.applied().inferGeography, undefined);
  monthly.commit(monthly.all());
  assert.equal(monthly.applied().inferGeography,'');
  assert.equal(monthly.applied().audience,'');
});
