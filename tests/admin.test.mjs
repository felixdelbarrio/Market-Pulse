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
  assert.match(index, /id="admin-recovery"/);
  assert.match(index, /id="admin-subscriber-dialog"/);
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
  assert.match(app, /function adminSubscriberScopeMarkup/);
  assert.match(app, /function ensureAdminSubscriberUi/);
  assert.match(app, /fieldset\.innerHTML=adminSubscriberScopeMarkup\(\)/);
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
    publishMarketsReviewSnapshot_:()=>{calls.push("publish");return {complete:true,published:1}}
  });
  vm.runInContext(fs.readFileSync(new URL("../src/51_ReviewOperations.gs",import.meta.url),"utf8"),local);
  const pipeline=local.newMarketsReviewPipeline_("2026-11-12");
  pipeline.stage=pipeline.jobs.length;pipeline.jobs[2].pending=1;
  props.set(key,JSON.stringify(pipeline));props.set(quota,String(Date.now()+60000));
  local.superviseMarketsReviews_();
  assert.deepEqual(calls,[]);
  props.set(quota,"0");
  for(let i=0;i<3;i++)local.superviseMarketsReviews_();
  assert.deepEqual(calls,["translate","publish"]);
  assert.equal(JSON.parse(props.get(key)).stage,pipeline.jobs.length);
});
