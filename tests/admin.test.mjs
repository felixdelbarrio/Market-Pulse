import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = ["../src/99_Core.gs", "../src/55_AlertPreferences.gs", "../src/58_Admin.gs"]
  .map(file => fs.readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n");
const context = {
  console, Date, Math, Number, String, Boolean, Array, Object, JSON, RegExp, isFinite, isNaN,
  MARKETS_CONFIG: {
    codeVersion: "test", timeZone: "Europe/Madrid", runHour: 7, runMinute: 5,
    healthCheckHour: 9, healthCheckMinute: 15,
    sheets: { control: "CONTROL", runs: "RUN_LOG", fetchLog: "FETCH_LOG", alerts: "ALERT_LOG", alertPreferences: "ALERT_SUBSCRIPTIONS" },
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
  assert.match(admin, /requireCurrentSheetContract_/);
});
