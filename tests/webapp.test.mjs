import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { gzipSync, gunzipSync } from "node:zlib";

const sources = ["../src/99_Core.gs", "../src/35_Dashboard.gs", "../src/60_WebApp.gs"]
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
  const allTrends = [
    { month: "2026-07", platform: "Android", countryCode: "ES", segment: "BANK", isBbva: true },
    { month: "2026-07", platform: "Android", countryCode: "ES", segment: "BANK", isBbva: false },
    { month: "2026-07", platform: "Android", countryCode: "ES", segment: "FINTECH", isBbva: false }
  ];
  const bootstrap = context.buildMarketsDashboardBootstrap_({}, allTrends, []);
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
  assert.equal(mapped.rating, 4.21);
  assert.equal(mapped.delta30d, -0.04);
  assert.equal(mapped.rankingComplete, true);
  assert.equal(mapped.fresh, true);
  assert.equal(mapped.ratingCountDelta30d, 70);
  assert.equal(mapped.storeUrl, "https://play.google.com/store/apps/details?id=com.bbva.empresas&hl=es&gl=MX");
});

test("compact competition and trend rows map to the web contract", () => {
  const competitionHeaders = ["OBSERVED_DATE", "PLATFORM", "COUNTRY_CODE", "COUNTRY", "MARKET_SEGMENT", "APP_KEY", "APP_NAME", "IS_BBVA", "DISPLAY_ORDER", "RATING", "RATING_COUNT", "RANKING_IS_COMPLETE", "DELTA_30D", "IS_FRESH_THIS_RUN", "RATING_COUNT_DELTA_30D", "STORE_WEB_URL"];
  const competition = context.mapCompetitionRowForWeb_([
    new Date("2026-07-17T12:00:00Z"), "iOS", "ES", "España", "BANK", "IOS|ES|BBVA", "BBVA", true, 0, 4.8, 500, true, 0.02, true, 20, "https://apps.apple.com/es/app/id1590189082"
  ], context.indexHeaders_(competitionHeaders));
  assert.equal(competition.appKey, "IOS|ES|BBVA");
  assert.equal(competition.ratingCountDelta30d, 20);
  assert.equal(competition.storeUrl, "https://apps.apple.com/es/app/id1590189082");

  const trendHeaders = ["PERIOD_MONTH", "PLATFORM", "COUNTRY_CODE", "COUNTRY", "APP_KEY", "APP_NAME", "IS_BBVA", "RATING_EOM", "MARKET_SEGMENT"];
  const trend = context.mapTrendRowForWeb_([
    new Date("2026-07-01T12:00:00Z"), "iOS", "ES", "España", "IOS|ES|BBVA", "BBVA", true, 4.8, "BANK"
  ], context.indexHeaders_(trendHeaders));
  assert.equal(trend.month, "2026-07");
  assert.equal(trend.ratingEom, 4.8);
});

test("catalog URL supplies links when the materialized column is absent", () => {
  const headers = ["OBSERVED_DATE", "PLATFORM", "APP_KEY"];
  const indexes = context.indexHeaders_(headers);
  const row = [new Date("2026-07-17T12:00:00Z"), "iOS", "IOS|MX|BBVA"];
  const url = "https://apps.apple.com/mx/app/id925436649";
  assert.equal(context.mapCompetitionRowForWeb_(row, indexes, url).storeUrl, url);
});

test("catalog builds canonical store links without another spreadsheet read", () => {
  const apps = [
    { appKey: "ANDROID|MX|BBVA", platform: "Android", countryCode: "MX", packageName: "com.bbva.empresas", locale: "es" },
    { appKey: "IOS|MX|BBVA", platform: "iOS", countryCode: "MX", appId: "925436649", locale: "es" }
  ];
  const metadata = context.buildStoreMetadataByAppKeyForWeb_(apps);
  assert.equal(metadata["ANDROID|MX|BBVA"].storeUrl, "https://play.google.com/store/apps/details?id=com.bbva.empresas&hl=es&gl=MX");
  assert.equal(metadata["IOS|MX|BBVA"].storeUrl, "https://apps.apple.com/mx/app/id925436649");
  assert.equal(metadata["ANDROID|MX|BBVA"].volumeScope, "MARKET");
});

test("Android shared packages are one volume while territorial stores remain independent", () => {
  const apps = [
    { appKey: "ANDROID|AR|BBVA", platform: "Android", countryCode: "AR", packageName: "com.bbva.empresas", locale: "es" },
    { appKey: "ANDROID|CO|BBVA", platform: "Android", countryCode: "CO", packageName: "com.bbva.empresas", locale: "es" },
    { appKey: "ANDROID|MX|BBVA", platform: "Android", countryCode: "MX", packageName: "com.bbva.netcash", locale: "es" },
    { appKey: "IOS|AR|BBVA", platform: "iOS", countryCode: "AR", appId: "1590189082", locale: "es" },
    { appKey: "IOS|CO|BBVA", platform: "iOS", countryCode: "CO", appId: "1590189082", locale: "es" }
  ];
  const metadata = JSON.parse(JSON.stringify(context.buildStoreMetadataByAppKeyForWeb_(apps)));
  assert.equal(metadata["ANDROID|AR|BBVA"].volumeKey, metadata["ANDROID|CO|BBVA"].volumeKey);
  assert.equal(metadata["ANDROID|AR|BBVA"].volumeScope, "SHARED_LISTING");
  assert.equal(metadata["ANDROID|AR|BBVA"].volumeMarkets, 2);
  assert.equal(metadata["ANDROID|MX|BBVA"].volumeScope, "MARKET");
  assert.notEqual(metadata["IOS|AR|BBVA"].volumeKey, metadata["IOS|CO|BBVA"].volumeKey);
  assert.equal(metadata["IOS|AR|BBVA"].volumeScope, "MARKET");
});

test("snapshot includes missing catalog apps so coverage has a real denominator", () => {
  const catalog = [
    { appKey: "ANDROID|AR|BBVA", platform: "Android", countryCode: "AR", country: "Argentina", appName: "BBVA", isBbva: true, displayOrder: 0, marketSegment: "BANK" },
    { appKey: "IOS|AR|BBVA", platform: "iOS", countryCode: "AR", country: "Argentina", appName: "BBVA", isBbva: true, displayOrder: 0, marketSegment: "BANK" }
  ];
  const observed = [{ appKey: "ANDROID|AR|BBVA", platform: "Android", countryCode: "AR", rating: 4.5 }];
  const metadata = {
    "ANDROID|AR|BBVA": { storeUrl: "https://play.google.com/store/apps/details?id=x", volumeKey: "ANDROID|x", volumeScope: "MARKET", volumeMarkets: 1 },
    "IOS|AR|BBVA": { storeUrl: "https://apps.apple.com/ar/app/id1", volumeKey: "IOS|AR|1", volumeScope: "MARKET", volumeMarkets: 1 }
  };
  const snapshot = JSON.parse(JSON.stringify(context.completeCompetitionSnapshotForWeb_(observed, catalog, metadata)));
  assert.equal(snapshot.length, 2);
  assert.equal(snapshot[0].rating, 4.5);
  assert.equal(snapshot[1].rating, null);
  assert.equal(snapshot[1].fresh, false);
  assert.equal(snapshot[1].volumeKey, "IOS|AR|1");
});

test("web consolidated metrics are computed directly from the snapshot", () => {
  const catalog = [
    { appKey: "ANDROID|VE|BBVA", countryCode: "VE", isBbva: true, marketSegment: "BANK", countryPlatformWeight: 0.6, groupUserWeight: 0.75, weightSource: "users", weightEffectiveDate: new Date() },
    { appKey: "IOS|VE|BBVA", countryCode: "VE", isBbva: true, marketSegment: "BANK", countryPlatformWeight: 0.4, groupUserWeight: 0.25, weightSource: "users", weightEffectiveDate: new Date() }
  ];
  const snapshot = [
    { appKey: "ANDROID|VE|BBVA", isBbva: true, segment: "BANK", rating: 4, delta30d: 0.2 },
    { appKey: "IOS|VE|BBVA", isBbva: true, segment: "BANK", rating: 5, delta30d: 0.1 }
  ];
  const result = JSON.parse(JSON.stringify(context.buildConsolidatedSnapshotForWeb_(snapshot, catalog)));
  assert.deepEqual(result.group, { rating: 4.25, delta30d: 0.18, coverage: 1 });
  assert.deepEqual(result.countries.VE, { rating: 4.4, delta30d: 0.16, coverage: 1 });
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
  assert.match(html, /function renderRankRow/);
  assert.match(html, /function uniqueStoreRows/);
  assert.match(html, /item\.volumeScope!=="SHARED_LISTING"/);
  assert.match(html, /id="benchmark-control" class="control hidden"/);
  assert.match(html, /segment:"BANK"/);
  assert.match(html, /class="rank-open"/);
  assert.doesNotMatch(html, /(?:market|itms-apps|appmarket):\/\//);
});

test("client KPIs deduplicate shared Android volumes", () => {
  const html = fs.readFileSync(new URL("../src/Index.html", import.meta.url), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(
    /\}\)\(\);\s*$/,
    "globalThis.__kpiTest={state,trendRequest,snapshotForSelection,uniqueStoreRows,volumeSummary,countBbvaLeaders,renderMarketRow,renderRankRow};})();"
  );
  const browser = { document: { addEventListener() {} } };
  vm.createContext(browser);
  vm.runInContext(script, browser);
  const rows = [
    { appKey: "ANDROID|AR|BBVA", volumeKey: "ANDROID|shared", volumeScope: "SHARED_LISTING", rating: 4.2, ratingCount: 1000, ratingCountDelta30d: 100, fresh: true },
    { appKey: "ANDROID|CO|BBVA", volumeKey: "ANDROID|shared", volumeScope: "SHARED_LISTING", rating: 4.2, ratingCount: 999, ratingCountDelta30d: 99, fresh: true },
    { appKey: "ANDROID|MX|BBVA", volumeKey: "ANDROID|mexico", volumeScope: "MARKET", rating: 4.7, ratingCount: 200, ratingCountDelta30d: 20, fresh: true }
  ];
  const unique = browser.__kpiTest.uniqueStoreRows(rows);
  const summary = browser.__kpiTest.volumeSummary(unique);
  assert.equal(unique.length, 2);
  assert.equal(summary.accumulated, 1200);
  assert.equal(summary.period, 120);
  assert.equal(summary.shared, 1);
  assert.doesNotMatch(browser.__kpiTest.renderMarketRow("AR", "Android", rows[0]), /valoraciones/);
  assert.match(browser.__kpiTest.renderMarketRow("MX", "Android", rows[2]), /200 valoraciones/);
  const incomplete = [
    { appKey: "BBVA", countryCode: "MX", platform: "Android", appName: "BBVA", isBbva: true, rating: 4.8, rankingComplete: false },
    { appKey: "PEER", countryCode: "MX", platform: "Android", appName: "Peer", isBbva: false, rating: 4.5, rankingComplete: false }
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(browser.__kpiTest.countBbvaLeaders(incomplete))), { value: 0, comparable: 0 });
  incomplete.forEach(row => { row.rankingComplete = true; });
  assert.deepEqual(JSON.parse(JSON.stringify(browser.__kpiTest.countBbvaLeaders(incomplete))), { value: 1, comparable: 1 });
});

test("overview and evolution stay on BBVA banking while benchmark changes scope", () => {
  const html = fs.readFileSync(new URL("../src/Index.html", import.meta.url), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(
    /\}\)\(\);\s*$/,
    "globalThis.__navTest={state,trendRequest,snapshotForSelection,renderRankRow};})();"
  );
  const browser = { document: { addEventListener() {} } };
  vm.createContext(browser);
  vm.runInContext(script, browser);
  const { state, trendRequest, snapshotForSelection, renderRankRow } = browser.__navTest;
  state.meta = { countries: [], logos: {} };
  state.snapshot = [
    { appKey: "BBVA", platform: "Android", countryCode: "MX", segment: "BANK", isBbva: true },
    { appKey: "BANK", platform: "Android", countryCode: "MX", segment: "BANK", isBbva: false },
    { appKey: "MP", platform: "Android", countryCode: "MX", segment: "FINTECH", isBbva: false }
  ];
  state.benchmarkSegment = "FINTECH";
  assert.equal(trendRequest().segment, "BANK");
  assert.deepEqual(Array.from(snapshotForSelection("BANK"), row => row.appKey), ["BBVA", "BANK"]);
  assert.deepEqual(Array.from(snapshotForSelection(state.benchmarkSegment, true), row => row.appKey), ["BBVA", "MP"]);
  state.benchmarkSegment = "ALL";
  assert.deepEqual(Array.from(snapshotForSelection(state.benchmarkSegment, true), row => row.appKey), ["BBVA", "BANK", "MP"]);

  const market = renderRankRow({
    appKey: "MP", appName: "Mercado Pago Negocios", platform: "Android", countryCode: "MX",
    segment: "FINTECH", isBbva: false, computedRank: 1, rating: 4.8, delta30d: 0.02,
    storeUrl: "https://play.google.com/store/apps/details?id=com.mercadopago.wallet&hl=es&gl=MX"
  });
  assert.match(market, /<a class="rank-row market-link"/);
  assert.match(market, /href="https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.mercadopago\.wallet/);
  assert.match(market, /target="_blank"/);
  assert.match(market, />Market<\/span> ↗/);
});
