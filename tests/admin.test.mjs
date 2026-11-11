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
  assert.match(admin, /function getMarketsAdminDashboard\(\) \{\s*const access = requireMarketsAdministrator_\(\)/);
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

test("review job cards report only clock triggers visible to their owner", () => {
  vm.runInContext(fs.readFileSync(new URL("../src/54_Reviews.gs", import.meta.url), "utf8"), context);
  context.Session = { getEffectiveUser: () => ({ getEmail: () => "owner@bbva.com" }) };
  context.ScriptApp = {
    EventType: { CLOCK: "clock" },
    getProjectTriggers: () => [
      { getEventType: () => "clock", getHandlerFunction: () => "collectMarketsReviews_" },
      { getEventType: () => "edit", getHandlerFunction: () => "translateMarketsReviews_" }
    ]
  };
  const jobs = context.marketsAdminReviewJobs_("owner@bbva.com");
  assert.deepEqual(Array.from(jobs, job => [job.schedule, job.installed]), [
    ["08:05", true], ["08:35", false], ["09:05", false]
  ]);
  assert.ok(context.marketsAdminReviewJobs_("other@bbva.com").every(job => job.installed === null));
});
