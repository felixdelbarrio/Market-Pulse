import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = ["../src/99_Core.gs", "../src/59_UsageAnalytics.gs"]
  .map(file => fs.readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n");
const usageHeaders = ["TIMESTAMP", "USER_EMAIL", "SESSION_ID", "EVENT_TYPE", "VIEW", "ACTION", "DETAIL", "WEB_VERSION", "DEVICE"];
const formatDate = (value, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(value);
  const get = type => parts.find(part => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
};
const context = {
  console, Date, Math, Number, String, Boolean, Array, Object, JSON, RegExp, isFinite, isNaN,
  Utilities: { formatDate },
  MARKETS_CONFIG: {
    timeZone: "Europe/Madrid", lockTimeoutMs: 30000,
    sheets: { usage: "USAGE_LOG" }, headers: { usage: usageHeaders }
  },
  normalizeMarketsAlertEmail_: email => String(email || "").trim().toLowerCase(),
  normalizeEmailForComparison_: email => String(email || "").trim().toLowerCase()
};
vm.createContext(context);
vm.runInContext(source, context);

const row = ({ at, email, session, type, view = "", action = "", detail = "", device = "DESKTOP" }) =>
  [new Date(at), email, session, type, view, action, detail, "test", device];

test("usage events are allowlisted and sanitized before persistence", () => {
  const normalized = context.normalizeMarketsUsageEvent_({
    eventType: "action", view: "admin", action: "rating recovery<script>",
    detail: "ok\u0000 private", sessionId: "session-1", webVersion: "36", device: "mobile"
  }, "USER@BBVA.COM");
  assert.equal(normalized[1], "user@bbva.com");
  assert.equal(normalized[2], "SESSION-1");
  assert.equal(normalized[3], "ACTION");
  assert.equal(normalized[4], "admin");
  assert.equal(normalized[5], "RATINGRECOVERYSCRIPT");
  assert.equal(normalized[6], "ok  private");
  assert.equal(normalized[8], "MOBILE");
  assert.equal(context.normalizeMarketsUsageEvent_({ eventType: "PASSWORD", sessionId: "x" }, "user@bbva.com"), null);
});

test("admin analytics calculate comparable WoW, adoption rankings and incidents", () => {
  const rows = [
    row({ at: "2026-07-22T08:00:00Z", email: "alice@bbva.com", session: "A", type: "VIEW", view: "overview" }),
    row({ at: "2026-07-22T08:01:00Z", email: "alice@bbva.com", session: "A", type: "FILTER", view: "overview", action: "GLOBAL_SCOPE" }),
    row({ at: "2026-07-22T08:02:00Z", email: "alice@bbva.com", session: "A", type: "ERROR", view: "overview", action: "CLIENT_ERROR", detail: "Fallo visible" }),
    row({ at: "2026-07-21T10:00:00Z", email: "bob@bbva.com", session: "B", type: "VIEW", view: "benchmark", device: "MOBILE" }),
    row({ at: "2026-07-14T10:00:00Z", email: "carol@bbva.com", session: "C", type: "VIEW", view: "overview" }),
    row({ at: "2026-07-15T10:00:00Z", email: "dave@bbva.com", session: "D", type: "ACTION", view: "alerts", action: "ALERTS_SAVE" }),
    row({ at: "2026-07-18T10:00:00Z", email: "late@bbva.com", session: "E", type: "VIEW", view: "evolution" })
  ];
  const result = context.buildMarketsUsageAnalytics_(rows, "Europe/Madrid",
    new Date("2026-07-22T12:00:00Z"), { totalRows: rows.length, rowsAnalyzed: rows.length });
  assert.deepEqual(JSON.parse(JSON.stringify(result.kpis)), {
    usersToday: 1, usersMonth: 5, usersYear: 5,
    sessionsToday: 1, sessionsMonth: 5, sessionsYear: 5,
    eventsToday: 3, errorsMonth: 1
  });
  assert.equal(result.weekOverWeek.users, 2);
  assert.equal(result.weekOverWeek.previousUsers, 2);
  assert.equal(result.weekOverWeek.usersChangePct, 0);
  assert.equal(result.topViews[0].key, "overview");
  assert.equal(result.topViews[0].count, 2);
  assert.equal(result.topActions.some(item => item.key === "GLOBAL_SCOPE"), true);
  assert.equal(result.devices.find(item => item.key === "MOBILE").count, 1);
  assert.equal(result.mostActive[0].email, "alice@bbva.com");
  assert.equal(result.leastActive.length, 5);
  assert.equal(result.recentIncidents[0].detail, "Fallo visible");
  assert.equal(result.dailyTrend.length, 14);
});
