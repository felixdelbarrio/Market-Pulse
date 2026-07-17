import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const sources = ["../src/99_Core.gs", "../src/60_WebApp.gs"]
  .map(file => fs.readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n");
const Utilities = {
  formatDate(value, _zone, pattern) {
    const iso = value.toISOString();
    if (pattern === "yyyy-MM-dd") return iso.slice(0, 10);
    return iso;
  }
};
const context = {
  console, Date, Math, Number, String, Boolean, Array, Object, JSON, RegExp, isFinite, isNaN, Utilities,
  MARKETS_CONFIG: { timeZone: "Europe/Madrid", codeVersion: "test" }
};
vm.createContext(context);
vm.runInContext(sources, context);

test("web trend request is bounded and normalized", () => {
  const request = context.normalizeDashboardTrendRequest_({
    countryCode: "mx", platform: "Android", segment: "bank", months: 999, bbvaOnly: "true"
  });
  assert.equal(request.countryCode, "MX");
  assert.equal(request.platform, "Android");
  assert.equal(request.segment, "BANK");
  assert.equal(request.months, 36);
  assert.equal(request.bbvaOnly, true);
});

test("web date request rejects dates without observations", () => {
  assert.equal(context.normalizeDashboardDateRequest_("", ["2026-07-16", "2026-07-17"]), "2026-07-17");
  assert.throws(() => context.normalizeDashboardDateRequest_("2026-07-15", ["2026-07-17"]), /No hay observaciones/);
});

test("competition rows map to a serializable dashboard contract", () => {
  const headers = [
    "OBSERVED_DATE", "PLATFORM", "COUNTRY_CODE", "COUNTRY", "MARKET_SEGMENT", "DASHBOARD_SECTION",
    "PRODUCT_SCOPE", "APP_KEY", "APP_NAME", "IS_BBVA", "DISPLAY_ORDER", "RATING", "RATING_COUNT",
    "RANKING", "RANKING_EXPECTED_APPS", "RANKING_OBSERVED_APPS", "RANKING_COVERAGE",
    "RANKING_IS_COMPLETE", "PREVIOUS_RATING_30D", "DELTA_30D", "IS_FRESH_THIS_RUN", "FETCH_STATUS", "RUN_ID"
  ];
  const indexes = context.indexHeaders_(headers);
  const row = [
    new Date("2026-07-17T12:00:00Z"), "Android", "MX", "Mexico", "BANK", "COUNTRY_BANKS", "BUSINESS",
    "ANDROID|MX|BBVA", "BBVA", true, 0, 4.21, 1200, 2, 5, 5, 1, true, 4.25, -0.04, true, "OK", "run-1"
  ];
  const mapped = context.mapCompetitionRowForWeb_(row, indexes);
  assert.equal(mapped.date, "2026-07-17");
  assert.equal(mapped.rating, 4.21);
  assert.equal(mapped.delta30d, -0.04);
  assert.equal(mapped.rankingComplete, true);
  assert.equal(mapped.fresh, true);
});

test("Index inline JavaScript compiles", () => {
  const html = fs.readFileSync(new URL("../src/Index.html", import.meta.url), "utf8");
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, "inline script not found");
  assert.doesNotThrow(() => new Function(match[1]));
});
