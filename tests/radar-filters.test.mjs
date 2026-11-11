import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL(`../src/${name}.html`, import.meta.url), 'utf8');

function filterBindings() {
  const bindings = {}, calls = [], controls = new Map();
  const context = vm.createContext({
    navigator: { language: 'es' },
    document: {
      addEventListener() {},
      getElementById(id) {
        if (!controls.has(id)) controls.set(id, { id });
        return controls.get(id);
      }
    },
    window: {
      matchMedia() {},
      MarketsUI: { option() { return ''; } },
      MarketsDomain: { config: { flags: {}, countries: { ES: 'España', MX: 'México' }, platforms: ['iOS', 'Android'] } },
      MarketRadarFilters: {
        create(root, binding) {
          bindings[root.id] = binding;
          return { render() {} };
        }
      }
    },
    calls
  });
  const script = read('App').replace(/<\/?script>/g, '').replace(/\}\)\(\);\s*$/, `
    loadReviews = () => calls.push({ page: 0, ...reviewScope() });
    loadAnalytics = () => calls.push({ ...selection(), ...analyticsSelection });
    renderAdminSubscribers = rows => calls.push(adminSubscriberFilterRows(rows).map(row => row.email));
    globalThis.setup = ({scope, cohort, rows}) => {
      Object.assign(state,scope);
      if (cohort) reviewDrilldown={scope:cohort,label:"Detalle"};
      if (rows) state.adminCenter={subscribers:rows};
      bindRadarFilters();
    };
    globalThis.setBalanceRender = () => renderBalanceEntity = () => calls.push("balance-only");
  })();`);
  vm.runInContext(script, context);
  return { bindings, calls, setup: context.setup, setBalanceRender: context.setBalanceRender };
}

const copy = value => JSON.parse(JSON.stringify(value));

test('review chips, restore and show all restart pagination within the current market and platform', () => {
  const { bindings, calls, setup } = filterBindings();
  setup({scope:{country:'ALL',platform:'ALL'},cohort:{country:'ES',platform:'iOS',segment:'NEUTRAL',topic:'01',reviewKey:'a'}});
  const reviews = bindings['review-filters'];
  reviews.commit({...reviews.applied(),topic:''});
  reviews.commit(reviews.initial(),'restore');
  reviews.commit(reviews.all(),'all');
  assert.deepEqual(copy(calls), [
    {page:0,country:'ES',platform:'iOS',segment:'NEUTRAL',topic:'',reviewKey:'a'},
    {page:0,country:'ES',platform:'iOS',segment:'DETRACTOR',reviewKey:''},
    {page:0,country:'ES',platform:'iOS',segment:'',reviewKey:''}
  ]);
});

test('the balance entity stays local and the analytics query keeps the selected context', () => {
  const { bindings, calls, setup, setBalanceRender } = filterBindings();
  setup({scope:{country:'MX',platform:'Android'}});
  setBalanceRender();
  const analytics = bindings['analytics-filters'];
  analytics.commit({...analytics.applied(),balanceEntity:'Banco Central'});
  analytics.commit({...analytics.applied(),period:'2026-10'});
  assert.deepEqual(copy(calls), [
    'balance-only',
    {country:'MX',platform:'Android',segment:'DETRACTOR',balanceEntity:'Banco Central',period:'2026-10'}
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
