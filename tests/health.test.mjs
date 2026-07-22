import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = ["../src/99_Core.gs", "../src/00_Config.gs", "../src/57_MonitorHealth.gs", "../src/90_Setup.gs"]
  .map(file => fs.readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n");
const context = {
  console, Date, Math, Number, String, Boolean, Array, Object, JSON, isFinite, isNaN,
  ScriptApp: { AuthMode: { FULL: "FULL" } }
};
vm.createContext(context);
vm.runInContext(source, context);
const plain = value => JSON.parse(JSON.stringify(value));

test("health monitor accepts a useful partial run with successful delivery", () => {
  const result = context.evaluateMarketsMonitorHealth_({
    runId: "run-1", status: "PARTIAL", appsTotal: 150, appsOk: 116, rowsUpserted: 116,
    alertDeliveryStatus: "DELIVERED", alertDeliveryDetail: "", detail: "34 apps without public rating"
  }, "2026-07-22");
  assert.deepEqual(plain(result), {
    healthy: true, status: "HEALTHY", dateKey: "2026-07-22", runId: "run-1",
    runStatus: "PARTIAL", alertDeliveryStatus: "DELIVERED"
  });
});

test("health monitor distinguishes a missing run, data failure and email failure", () => {
  assert.equal(context.evaluateMarketsMonitorHealth_(null, "2026-07-22").status, "MISSING");
  const dataFailure = context.evaluateMarketsMonitorHealth_({
    runId: "run-2", status: "ERROR", appsTotal: 0, appsOk: 0, rowsUpserted: 0,
    alertDeliveryStatus: "NOT_RUN", alertDeliveryDetail: "", detail: "authorization"
  }, "2026-07-22");
  assert.equal(dataFailure.status, "RUN_FAILED");
  assert.match(dataFailure.reason, /0\/0 aplicaciones/);
  const emailFailure = context.evaluateMarketsMonitorHealth_({
    runId: "run-3", status: "PARTIAL", appsTotal: 150, appsOk: 116, rowsUpserted: 116,
    alertDeliveryStatus: "ERROR", alertDeliveryDetail: "alias no autorizado", detail: ""
  }, "2026-07-22");
  assert.equal(emailFailure.status, "ALERT_DELIVERY_FAILED");
  assert.match(emailFailure.reason, /alias no autorizado/);
});

test("trigger installation replaces both managed schedules and preserves unrelated triggers", () => {
  const deleted = [];
  const created = [];
  const triggers = [
    { getHandlerFunction: () => "runDailyRatingMonitor" },
    { getHandlerFunction: () => "checkDailyRatingMonitorHealth" },
    { getHandlerFunction: () => "unrelatedFunction" }
  ];
  const makeBuilder = handler => ({
    timeBased() { return this; }, atHour(value) { this.hour = value; return this; },
    nearMinute(value) { this.minute = value; return this; }, everyDays(value) { this.days = value; return this; },
    inTimezone(value) { this.zone = value; return this; },
    create() { created.push({ handler, hour: this.hour, minute: this.minute, days: this.days, zone: this.zone }); }
  });
  context.ScriptApp = {
    getProjectTriggers: () => triggers,
    deleteTrigger: trigger => deleted.push(trigger.getHandlerFunction()),
    newTrigger: makeBuilder
  };
  context.installDailyTrigger_();
  assert.deepEqual(deleted, ["runDailyRatingMonitor", "checkDailyRatingMonitorHealth"]);
  assert.deepEqual(created, [
    { handler: "runDailyRatingMonitor", hour: 7, minute: 5, days: 1, zone: "Europe/Madrid" },
    { handler: "checkDailyRatingMonitorHealth", hour: 9, minute: 15, days: 1, zone: "Europe/Madrid" }
  ]);
});
