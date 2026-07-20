import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = ["../src/99_Core.gs", "../src/00_Config.gs", "../src/55_AlertPreferences.gs", "../src/50_Alerts.gs"]
  .map(file => fs.readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n");
const context = {
  console, Date, Math, Number, String, Boolean, Array, Object, JSON, RegExp, isFinite, isNaN,
  ScriptApp: { getService() { return { getUrl() { return "https://script.google.com/macros/s/example/exec"; } }; } }
};
vm.createContext(context);
vm.runInContext(source, context);
const plain = value => JSON.parse(JSON.stringify(value));

function preferences(overrides = {}) {
  return context.normalizeMarketsAlertPreferences_({
    ...context.defaultMarketsAlertPreferences_("felix.delbarrio@bbva.com"),
    active: true,
    ...overrides
  }, "felix.delbarrio@bbva.com");
}

function rating(day, ratingValue, overrides = {}) {
  return {
    observedDate: new Date(2026, 6, day, 12),
    platform: "iOS", countryCode: "CO", country: "Colombia",
    appKey: "IOS|CO|BBVA", appName: "BBVA Empresas Colombia", isBbva: true,
    rating: ratingValue,
    ...overrides
  };
}

test("alert defaults and personalized thresholds are normalized", () => {
  const defaults = context.defaultMarketsAlertPreferences_("FELIX.DELBARRIO@BBVA.COM");
  assert.equal(defaults.email, "felix.delbarrio@bbva.com");
  assert.equal(defaults.reviewWarningPct, 15);
  assert.equal(defaults.reviewCriticalPct, 30);
  assert.equal(defaults.dailyDropEnabled, false);
  assert.equal(defaults.mtdDropEnabled, false);
  assert.equal(defaults.ytdDropEnabled, true);
  assert.equal(defaults.repeatWhileBreached, false);
  assert.equal(defaults.ytdWarningDrop, 0.3);
  assert.equal(defaults.ytdCriticalDrop, 0.5);
  assert.equal(defaults.crossoverDirection, "BOTH");
  const custom = preferences({ countries: ["CO", "MX"], platforms: ["iOS"], dailyDropEnabled: true, dailyWarningDrop: "0,25", dailyCriticalDrop: 0.45 });
  assert.deepEqual(plain(custom.countries), ["CO", "MX"]);
  assert.deepEqual(plain(custom.platforms), ["iOS"]);
  assert.equal(custom.dailyDropEnabled, true);
  assert.equal(custom.dailyWarningDrop, 0.25);
  assert.equal(custom.dailyCriticalDrop, 0.45);
});

test("alert preferences reject invalid identities and threshold order", () => {
  assert.throws(() => context.normalizeMarketsAlertEmail_("person@example.com"), /@bbva\.com/);
  assert.throws(() => preferences({ ytdWarningDrop: 0.6, ytdCriticalDrop: 0.5 }), /critico.*mayor/i);
  assert.throws(() => preferences({ reviewWarningPct: 30, reviewCriticalPct: 15 }), /critico.*mayor/i);
});

test("the server derives the account and ignores an email injected by the client", () => {
  let written = null;
  context.currentMarketsUserEmail_ = () => "felix.delbarrio@bbva.com";
  context.LockService = { getScriptLock() { return { tryLock() { return true; }, releaseLock() {} }; } };
  context.openMarketsSpreadsheet_ = () => ({});
  context.ensureWorkbookSchema_ = () => {};
  context.upsertMarketsAlertPreferences_ = (_ss, value) => { written = value; return value; };
  const saved = context.saveMarketsAlertPreferences({
    email: "another.user@bbva.com", active: true,
    countries: ["ALL"], platforms: ["ALL"],
    reviewWarningPct: 15, reviewCriticalPct: 30,
    dailyWarningDrop: 0.3, dailyCriticalDrop: 0.5,
    mtdWarningDrop: 0.3, mtdCriticalDrop: 0.5,
    ytdWarningDrop: 0.3, ytdCriticalDrop: 0.5,
    crossoverDirection: "BOTH"
  });
  assert.equal(saved.email, "felix.delbarrio@bbva.com");
  assert.equal(written.email, "felix.delbarrio@bbva.com");
});

test("daily, month-to-date and year-to-date drops are independent", () => {
  const rows = [
    rating(2, 4.8, { observedDate: new Date(2026, 0, 2, 12) }),
    rating(1, 4.6), rating(13, 4.5), rating(14, 4.1)
  ];
  const events = context.buildRatingDropAlerts_(rows, new Date(2026, 6, 14, 12), preferences({
    dailyDropEnabled: true, mtdDropEnabled: true, ytdDropEnabled: true
  }), {}, {});
  assert.deepEqual(plain(events.map(event => event.type)), ["RATING_DROP_DAILY", "RATING_DROP_MTD", "RATING_DROP_YTD"]);
  assert.deepEqual(plain(events.map(event => event.metricValue)), [0.4, 0.5, 0.7]);
  assert.deepEqual(plain(events.map(event => event.severity)), ["WARNING", "CRITICAL", "CRITICAL"]);
});

test("year-to-date is the only default drop rule and does not repeat unless requested", () => {
  const rows = [
    rating(2, 4.8, { observedDate: new Date(2026, 0, 2, 12) }),
    rating(14, 4.1), rating(15, 4.1)
  ];
  const first = context.buildRatingDropAlerts_(rows, new Date(2026, 6, 14, 12), preferences(), {}, {});
  assert.equal(first.length, 1);
  assert.equal(first[0].type, "RATING_DROP_YTD");
  const existing = { [first[0].eventKey]: true };
  const suppressed = context.buildRatingDropAlerts_(rows, new Date(2026, 6, 15, 12), preferences(), {}, existing);
  assert.equal(suppressed.length, 0);
  const reminder = context.buildRatingDropAlerts_(rows, new Date(2026, 6, 15, 12), preferences({ repeatWhileBreached: true }), {}, existing);
  assert.equal(reminder.length, 1);
  assert.match(reminder[0].eventKey, /2026-07-15$/);
});

test("competitive crossovers distinguish lost and regained positions", () => {
  const peer = (day, value) => rating(day, value, {
    appKey: "IOS|CO|PEER", appName: "Banco Rival", isBbva: false
  });
  const lost = context.buildCompetitiveCrossoverAlerts_([
    rating(13, 4.5), peer(13, 4.4), rating(14, 4.4), peer(14, 4.6)
  ], new Date(2026, 6, 14, 12), preferences(), {}, {});
  assert.equal(lost.length, 1);
  assert.equal(lost[0].direction, "LOST");
  assert.equal(lost[0].severity, "WARNING");

  const gained = context.buildCompetitiveCrossoverAlerts_([
    rating(13, 4.4), peer(13, 4.5), rating(14, 4.7), peer(14, 4.6)
  ], new Date(2026, 6, 14, 12), preferences({ crossoverDirection: "GAINED" }), {}, {});
  assert.equal(gained.length, 1);
  assert.equal(gained[0].direction, "GAINED");
  assert.equal(gained[0].severity, "POSITIVE");
});

test("BBVA alert email uses the official image slot, brand system and safe content", () => {
  const events = [{
    severity: "CRITICAL", type: "RATING_DROP_YTD", platform: "iOS", countryCode: "CO",
    detail: "Caída crítica <script>alert('x')</script>"
  }];
  const html = context.renderMarketsAlertEmail_(events);
  assert.match(html, /cid:bbvaLogo/);
  assert.match(html, /Benton Sans BBVA/);
  assert.match(html, /background:#072146/);
  assert.match(html, /border-radius:16px/);
  assert.match(html, /border-radius:8px/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.equal(context.marketsAlertEmailSubject_(events), "[CRÍTICO] Markets Data Studio - 1 movimiento");
});

test("the scheduled engine processes every active subscriber without a connected Session", () => {
  const original = {
    migrate: context.migrateLegacyAlertRecipients_, readAll: context.readAllMarketsAlertPreferences_,
    readExisting: context.readExistingAlertKeys_, drops: context.buildRatingDropAlerts_,
    crossovers: context.buildCompetitiveCrossoverAlerts_, append: context.appendAlertEvents_,
    send: context.sendAlertEmails_
  };
  const users = [preferences(), preferences({ email: "ana.ejemplo@bbva.com" })];
  users[1].email = "ana.ejemplo@bbva.com";
  context.migrateLegacyAlertRecipients_ = () => {};
  context.readAllMarketsAlertPreferences_ = () => users;
  context.readExistingAlertKeys_ = () => ({});
  context.buildRatingDropAlerts_ = (_ratings, referenceDate, pref) => [{
    timestamp: new Date(), eventKey: `YTD|${pref.email}`, referenceDate,
    platform: "iOS", countryCode: "CO", type: "RATING_DROP_YTD", severity: "WARNING",
    detail: "test", recipients: pref.email, userEmail: pref.email, ruleId: "YTD_DROP",
    metricValue: 0.4, threshold: 0.3, appKey: "IOS|CO|BBVA", direction: "DOWN", source: "TEST"
  }];
  context.buildCompetitiveCrossoverAlerts_ = () => [];
  context.appendAlertEvents_ = () => {};
  context.sendAlertEmails_ = events => new Set(events.map(event => event.recipients)).size;
  const result = context.buildAndProcessAlerts_({}, new Date(2026, 6, 20, 12), [], "run", { SEND_ALERT_EMAILS: true }, []);
  assert.equal(result.length, 2);
  assert.equal(result.subscriberCount, 2);
  assert.equal(result.deliveryCount, 2);
  Object.assign(context, {
    migrateLegacyAlertRecipients_: original.migrate, readAllMarketsAlertPreferences_: original.readAll,
    readExistingAlertKeys_: original.readExisting, buildRatingDropAlerts_: original.drops,
    buildCompetitiveCrossoverAlerts_: original.crossovers, appendAlertEvents_: original.append,
    sendAlertEmails_: original.send
  });
});
