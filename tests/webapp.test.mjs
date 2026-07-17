import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { gzipSync, gunzipSync } from "node:zlib";

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
  assert.equal(context.normalizeDashboardTrendRequest_({ segment: "all" }).segment, "ALL");
});

test("bootstrap carries the initial chart without a second RPC", () => {
  context.readLatestCompetitionDateForWeb_ = () => "2026-07-17";
  context.readCompetitionSnapshotForWeb_ = () => [{ appKey: "ANDROID|ES|BBVA" }];
  context.buildMarketsWebMeta_ = () => ({ dataDate: "2026-07-17" });
  context.readConsolidatedSnapshotForWeb_ = () => ({ group: null, countries: {} });
  const allTrends = [
    { month: "2026-07", platform: "Android", countryCode: "ES", segment: "BANK", isBbva: true },
    { month: "2026-07", platform: "Android", countryCode: "ES", segment: "BANK", isBbva: false },
    { month: "2026-07", platform: "Android", countryCode: "ES", segment: "FINTECH", isBbva: false }
  ];
  const bootstrap = context.buildMarketsDashboardBootstrap_({}, allTrends);
  assert.equal(bootstrap.trends.length, 1);
  assert.equal(bootstrap.trends[0].isBbva, true);
});

test("warm trend cache avoids opening the spreadsheet", () => {
  let spreadsheetOpens = 0;
  context.openMarketsSpreadsheet_ = () => { spreadsheetOpens += 1; throw new Error("cache miss"); };
  context.CacheService = {
    getScriptCache() {
      return { get() { return "[]"; } };
    }
  };
  assert.deepEqual(Array.from(context.getMarketsDashboardTrends({ segment: "BANK", bbvaOnly: true })), []);
  assert.equal(spreadsheetOpens, 0);
});

test("persistent shared cache survives L1 expiry and swaps generations", () => {
  const values = new Map();
  const properties = {
    getProperty(key) { return values.get(key) ?? null; },
    setProperty(key, value) { values.set(key, String(value)); return this; },
    setProperties(entries) { Object.entries(entries).forEach(([key, value]) => values.set(key, String(value))); return this; },
    deleteProperty(key) { values.delete(key); return this; }
  };
  const asBlob = (buffer, contentType = null) => ({
    getBytes() { return Array.from(buffer); },
    getDataAsString() { return buffer.toString("utf8"); },
    getContentType() { return contentType; }
  });
  context.PropertiesService = { getScriptProperties() { return properties; } };
  context.Utilities.newBlob = (value, contentType) => asBlob(Buffer.isBuffer(value) ? value : Buffer.from(value), contentType);
  context.Utilities.gzip = blob => asBlob(gzipSync(Buffer.from(blob.getBytes())), "application/gzip");
  context.Utilities.ungzip = blob => {
    assert.equal(blob.getContentType(), "application/gzip");
    return asBlob(gunzipSync(Buffer.from(blob.getBytes())), "application/json");
  };
  context.Utilities.base64Encode = bytes => Buffer.from(bytes).toString("base64");
  context.Utilities.base64Decode = value => Array.from(Buffer.from(value, "base64"));
  let uuidCounter = 0;
  context.Utilities.getUuid = () => `${String(++uuidCounter).padStart(8, "0")}-1234-1234-1234-123456789abc`;

  const first = { revision: "run-1", rows: Array.from({ length: 250 }, (_, index) => ({ index, name: `México ${index}` })) };
  const firstMeta = context.writeMarketsPersistentCache_("bootstrap", first, "run-1");
  assert.deepEqual(JSON.parse(JSON.stringify(context.readMarketsPersistentCache_("bootstrap"))), first);
  const second = { revision: "run-2", rows: [{ index: 1, name: "España" }] };
  const secondMeta = context.writeMarketsPersistentCache_("bootstrap", second, "run-2");
  assert.deepEqual(JSON.parse(JSON.stringify(context.readMarketsPersistentCache_("bootstrap"))), second);
  assert.equal(secondMeta.revision, "run-2");
  assert.equal([...values.keys()].some(key => key.includes(firstMeta.generation)), false);
});

test("doGet builds an HtmlService response using supported metadata", () => {
  const calls = [];
  const output = {
    setTitle(value) { calls.push(["title", value]); return this; },
    addMetaTag(name, value) { calls.push(["meta", name, value]); return this; }
  };
  context.HtmlService = {
    createHtmlOutputFromFile(file) { calls.push(["file", file]); return output; }
  };
  assert.equal(context.doGet({ parameter: {} }), output);
  assert.deepEqual(calls, [
    ["file", "Index"],
    ["title", "Markets Ratings Intelligence"],
    ["meta", "viewport", "width=device-width, initial-scale=1, viewport-fit=cover"]
  ]);
});

test("latest snapshot bounds avoid scanning the full competition column", () => {
  const dates = ["2026-07-15", "2026-07-15", "2026-07-16", "2026-07-16", "2026-07-16", "2026-07-17", "2026-07-17"];
  const sheet = {
    getLastRow() { return dates.length + 1; },
    getRange(row, _column, rowCount = 1) {
      return {
        getValue() { return dates[row - 2]; },
        getValues() { return dates.slice(row - 2, row - 2 + rowCount).map(value => [value]); }
      };
    }
  };
  const plain = value => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(context.findLatestCompetitionBoundsForWeb_(sheet, "2026-07-17")), { firstRow: 7, lastRow: 8 });
  assert.equal(context.findLatestCompetitionBoundsForWeb_(sheet, "2026-07-14"), null);
});

test("competition rows map to a serializable dashboard contract", () => {
  const headers = [
    "OBSERVED_DATE", "PLATFORM", "COUNTRY_CODE", "COUNTRY", "MARKET_SEGMENT", "DASHBOARD_SECTION",
    "PRODUCT_SCOPE", "APP_KEY", "APP_NAME", "IS_BBVA", "DISPLAY_ORDER", "RATING", "RATING_COUNT",
    "RANKING", "RANKING_EXPECTED_APPS", "RANKING_OBSERVED_APPS", "RANKING_COVERAGE",
    "RANKING_IS_COMPLETE", "PREVIOUS_RATING_30D", "DELTA_30D", "IS_FRESH_THIS_RUN", "FETCH_STATUS", "RUN_ID",
    "PREVIOUS_RATING_COUNT_30D", "RATING_COUNT_DELTA_30D", "STORE_WEB_URL"
  ];
  const indexes = context.indexHeaders_(headers);
  const row = [
    new Date("2026-07-17T12:00:00Z"), "Android", "MX", "Mexico", "BANK", "COUNTRY_BANKS", "BUSINESS",
    "ANDROID|MX|BBVA", "BBVA", true, 0, 4.21, 1200, 2, 5, 5, 1, true, 4.25, -0.04, true, "OK", "run-1", 1130, 70,
    "https://play.google.com/store/apps/details?id=com.bbva.empresas&hl=es&gl=MX"
  ];
  const mapped = context.mapCompetitionRowForWeb_(row, indexes);
  assert.equal(mapped.date, "2026-07-17");
  assert.equal(mapped.rating, 4.21);
  assert.equal(mapped.delta30d, -0.04);
  assert.equal(mapped.rankingComplete, true);
  assert.equal(mapped.fresh, true);
  assert.equal(mapped.ratingCountDelta30d, 70);
  assert.equal(mapped.storeUrl, "https://play.google.com/store/apps/details?id=com.bbva.empresas&hl=es&gl=MX");
});

test("store URL sanitizer rejects native schemes and foreign domains", () => {
  assert.equal(context.sanitizeStoreWebUrl_("itms-apps://itunes.apple.com/app/id1", "iOS"), "");
  assert.equal(context.sanitizeStoreWebUrl_("https://example.com/store/apps/details?id=x", "Android"), "");
  assert.equal(context.sanitizeStoreWebUrl_("https://apps.apple.com/mx/app/id925436649", "iOS"), "https://apps.apple.com/mx/app/id925436649");
});

test("Index inline JavaScript compiles", () => {
  const html = fs.readFileSync(new URL("../src/Index.html", import.meta.url), "utf8");
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, "inline script not found");
  assert.doesNotThrow(() => new Function(match[1]));
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /(?:market|itms-apps|appmarket):\/\//);
});
