import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const api = vm.createContext({ trimString_: value => String(value ?? "").trim() });
vm.runInContext(fs.readFileSync(new URL("../src/54_Reviews.gs", import.meta.url), "utf8"), api);

vm.runInContext(fs.readFileSync(new URL("../src/52_ReviewInsights.gs", import.meta.url), "utf8"), api);
test("App Store reviews require the requested storefront and listing and follow its pagination", () => {
  const app = { platform: "iOS", countryCode: "TR", appId: "123", appKey: "IOS|TR|BANK" };
  const entry = {
    id: { label: "456" }, content: { label: "Yorum" }, updated: { label: "2026-10-01T12:00:00Z" },
    "im:rating": { label: "4" }
  };
  const url = page => api.marketsReviewFeedUrl_(app, page);
  const link = (rel, href) => ({ attributes: { rel, href } });
  const payload = JSON.stringify({ feed: { entry: [entry], link: [
    link("self", url(1)), link("next", url(2).replace("/json", "/xml") + "?urlDesc=feed")
  ] } });
  const result = api.parseMarketsReviewFeed_(app, 1, payload);
  assert.equal(result.rows[0][0], '["iOS","TR","123","456"]');
  assert.equal(result.more, true);
  assert.throws(() => api.parseMarketsReviewFeed_({ ...app, countryCode: "ES" }, 1, payload), /escaparate/);
  assert.throws(() => api.parseMarketsReviewFeed_({ ...app, appId: "124" }, 1, payload), /escaparate/);
  assert.equal(api.marketsReviewLiteral_("=1+1"), "'=1+1");
});

test("an edited review updates its existing row and requeues translation", () => {
  const app = { platform: "iOS", countryCode: "TR", appId: "123", appKey: "IOS|TR|BANK" };
  const id = '["iOS","TR","123","456"]';
  const previous = [id, app.appKey, "TR", "iOS", "123", "456", "2026-10-01T12:00:00Z", 4, "", "", "Old"];
  const properties = new Map([["MARKETS_REVIEWS_TRANSLATION_ROW", "18"]]);
  const writes = [];
  const sheet = { getLastRow: () => 2, getRange: (row, column, height, width) => ({
    getValues: () => [previous], setValues: values => writes.push({ row, column, width, values })
  }) };
  Object.assign(api, {
    marketsReviewSheet_: () => sheet, openMarketsSpreadsheet_: () => ({}), readAppCatalog_: () => [app],
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties.get(key), setProperty: (key, value) => properties.set(key, value)
    }) },
    SpreadsheetApp: { flush() {} },
    LockService: { getUserLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    UrlFetchApp: { fetch: url => ({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ feed: {
        link: [{ attributes: { rel: "self", href: url } }],
        entry: {
          id: { label: "456" }, content: { label: "Edited" },
          updated: { label: "2026-10-02T12:00:00Z" }, "im:rating": { label: "3" }
        }
      } })
    }) }
  });
  const result = api.collectMarketsReviews_();
  assert.equal(result.added, 0);
  assert.equal(result.updated, 1);
  assert.equal(writes[0].row, 2);
  assert.equal(writes[0].column, 7);
  assert.deepEqual(Array.from(writes[0].values[0].slice(-4)), ["Edited", "", "", ""]);
  assert.equal(properties.get("MARKETS_REVIEWS_TRANSLATION_ROW"), "2");
});

test("Google Play pagination preserves provenance and deduplicates across storefronts", () => {
  vm.runInContext(fs.readFileSync(new URL("../src/53_PlayReviews.gs", import.meta.url), "utf8"), api);
  const item = ["review-123", null, 4, null, "Review", [1760000000, 1000000]];
  const frame = [["wrb.fr", "oCPfdb", JSON.stringify([[item], [null, "continuation"]])]];
  const page = api.parsePlayReviewPage_(")]}'\n\n" + JSON.stringify(frame));
  assert.equal(page.next, "continuation");
  assert.equal(page.rows[0].date, "2025-10-09T08:53:20.001Z");
  assert.throws(() => api.parsePlayReviewPage_("<html>"), /inesperada/);
  const writes = [];
  const sheet = {
    getLastRow: () => writes.length ? 2 : 1,
    getRange: (row, column, height, width) => ({ setValues: rows => writes.push({ row, rows }) })
  };
  Object.assign(api, { ensureSheetCapacity_: () => {}, SpreadsheetApp: { flush() {} } });
  const properties = { getProperty: () => null, setProperty() {} };
  const known = new Map(), summary = { added: 0, updated: 0 };
  const listing = { packageName: "com.example.app", appKey: "ANDROID|ES|APP", countryCode: "ES" };
  api.storePlayReviews_(sheet, properties, known, listing, page.rows, summary);
  api.storePlayReviews_(sheet, properties, known, { ...listing, countryCode: "TR" }, page.rows, summary);
  assert.equal(summary.added, 1);
  assert.equal(summary.updated, 1);
  assert.equal(writes[1].row, 2);
  assert.equal(writes[1].rows[0][2], "ES,TR");
});

test("functional review evidence uses catalog IDs, context and exclusions", () => {
  const rules = api.compileReviewRules_([["01.01", "Home", "Posición global"]]);
  const classify = value => Array.from(api.classifyReviewEvidence_(value, rules));
  assert.deepEqual(classify("No se actualiza la posición global"), ["01.01"]);
  assert.deepEqual(classify("The workforce dashboard crashed"), []);
  assert.deepEqual(classify("No puedo iniciar sesión"), ["16.xx"]);
  assert.deepEqual(classify("No funciona"), []);
});

test("analytics shares the selected sentiment and separates the cumulative delta cohort", () => {
  const review = (key, date, rating, blocks) => ({
    key, date, rating, blocks, entities: ["BBVA Empresas"], title: "Transferencia bancaria", original: key
  });
  const rows = [
    ...Array.from({ length: 5 }, (_, index) => review(String(index), "2026-10-11", 1, ["03"])),
    review("new", "2026-10-12", 5, ["03"]),
    review("generic", "2026-10-12", 1, [])
  ];
  const result = api.summarizeMarketsReviewAnalytics_(rows, { "03": "Transferencias", general: "Generalista" },
    { segment: "DETRACTOR" }, { start: "2025-11-12", recent: "2026-10-12", end: "2026-11-10" });
  assert.equal(result.total, 6);
  assert.equal(result.entities[0].counts["03"], 5);
  assert.equal(result.entities[0].counts.general, 1);
  assert.equal(result.monthly[0].total, 7);
  assert.equal(result.deltas[0].earlyTotal, 5);
  assert.equal(result.deltas[0].total, 6);
  assert.ok(Math.abs(result.deltas[0].delta - 100 / 3) < 1e-8);
  assert.equal(result.examples[0].review.key, "generic");
  assert.equal(result.examples[1].review.key, "new");
});

test("market facets count shared reviews once per market and keep the exact listing", () => {
  const row = { key: "one", app: "Spain app", countries: ["ES", "TR"], listings: [
    { country: "ES", app: "Spain app", entity: "BBVA Empresas" },
    { country: "TR", app: "Turkey app", entity: "BBVA Empresas" }
  ] };
  const result = api.paginateMarketsReviews_([row], { country: "TR", page: 4 }, {});
  assert.equal(result.allMarkets, 1);
  assert.equal(result.counts.ES, 1);
  assert.equal(result.counts.TR, 1);
  assert.equal(result.total, 1);
  assert.equal(result.page, 0);
  assert.equal(result.rows[0].app, "Turkey app");
  assert.throws(() => api.normalizeMarketsReviewFilters_({ start: "2026-02-30" }), /Fecha no válida/);
});

test("review cache isolates scopes and invalidates when the data generation changes", () => {
  const properties = {};
  const entries = new Map();
  Object.assign(api, {
    PropertiesService: { getScriptProperties: () => ({ getProperties: () => properties }) },
    Utilities: { DigestAlgorithm: { SHA_256: "SHA_256" }, computeDigest: (_, value) => value, base64EncodeWebSafe: value => value },
    readMarketsWebCache_: (key, build) => {
      if (!entries.has(key)) entries.set(key, build());
      return entries.get(key);
    }
  });
  let builds = 0;
  const get = scope => api.readMarketsReviewCache_({ getId: () => "test" }, "page", scope,
    { end: "2026-11-11" }, () => ++builds);
  assert.equal(get({ country: "ES", page: 0 }), 1);
  assert.equal(get({ page: 0, country: "ES" }), 1);
  assert.equal(get({ page: 0, country: "TR" }), 2);
  properties.MARKETS_REVIEWS_GENERATION = "new";
  assert.equal(get({ country: "ES", page: 0 }), 3);
});
