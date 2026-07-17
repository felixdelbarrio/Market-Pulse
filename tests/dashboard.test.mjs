import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const sources = ["../src/99_Core.gs", "../src/35_Dashboard.gs"]
  .map(file => fs.readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n");
const context = { console, Date, Math, Number, String, Boolean, Array, Object, JSON, isFinite, isNaN };
vm.createContext(context);
vm.runInContext(sources, context);

function app(appKey, platform, countryCode, weight, groupWeight = weight) {
  return {
    appKey, platform, countryCode, country: countryCode, isBbva: true,
    appId: platform === "iOS" ? "1590189082" : platform === "Huawei" ? "C1751602113005231488" : "com.bbva.empresas",
    packageName: platform === "iOS" ? "" : "com.bbva.empresas", locale: "es",
    countryPlatformWeight: weight, groupUserWeight: groupWeight,
    marketSegment: "BANK", weightSource: "Internal users 2026Q2", weightEffectiveDate: new Date(2026, 5, 30)
  };
}

function rating(appKey, platform, countryCode, value, delta, date = new Date(2026, 6, 16, 12)) {
  return {
    appKey, platform, countryCode, country: countryCode, appName: "BBVA", isBbva: true,
    observedDate: date, yearMonth: "2026-07", rating: value, ratingCount: 100,
    ranking: 2, previousRating30d: value - delta, delta30d: delta,
    previousRatingCount30d: 90, ratingCountDelta30d: 10,
    marketSegment: "BANK", rankingExpectedApps: 5, rankingObservedApps: 5,
    rankingCoverage: 1, rankingIsComplete: true
  };
}

test("scorecard dataset exposes direct fields without chart filters", () => {
  const catalog = [
    app("ANDROID|VE|BBVA", "Android", "VE", 0.6, 0.75),
    app("IOS|VE|BBVA", "iOS", "VE", 0.4, 0.25)
  ];
  const ratings = [
    rating("ANDROID|VE|BBVA", "Android", "VE", 4, 0.2),
    rating("IOS|VE|BBVA", "iOS", "VE", 5, 0.1)
  ];
  const dataset = context.buildScorecardDataset_(ratings, catalog);
  const headerIndex = Object.fromEntries(Array.from(dataset.headers).map((header, index) => [header, index]));
  const row = Array.from(dataset.rows[0]);
  assert.equal(row[headerIndex.ANDROID_VE_BBVA_RATING], 4);
  assert.equal(row[headerIndex.IOS_VE_BBVA_RATING], 5);
  assert.equal(row[headerIndex.BBVA_VE_CONSOLIDATED_RATING], 4.4);
  assert.equal(row[headerIndex.BBVA_GROUP_RATING], 4.25);
  assert.equal(row[headerIndex.BBVA_GROUP_WEIGHT_COVERAGE], 1);
});

test("weighted score remains blank when a configured platform is missing", () => {
  const catalog = [
    app("ANDROID|VE|BBVA", "Android", "VE", 0.6),
    app("IOS|VE|BBVA", "iOS", "VE", 0.4)
  ];
  const dataset = context.buildScorecardDataset_([
    rating("ANDROID|VE|BBVA", "Android", "VE", 4, 0.2)
  ], catalog);
  const headerIndex = Object.fromEntries(Array.from(dataset.headers).map((header, index) => [header, index]));
  const row = Array.from(dataset.rows[0]);
  assert.equal(row[headerIndex.BBVA_VE_CONSOLIDATED_RATING], "");
  assert.equal(row[headerIndex.BBVA_VE_WEIGHT_COVERAGE], 0.6);
});

test("monthly trend uses average and end-of-month observation", () => {
  const first = rating("ANDROID|VE|BBVA", "Android", "VE", 4, 0.1, new Date(2026, 6, 1, 12));
  const last = rating("ANDROID|VE|BBVA", "Android", "VE", 5, 0.2, new Date(2026, 6, 31, 12));
  last.ranking = 1;
  const rows = context.buildMonthlyTrendRows_([first, last]);
  const row = Array.from(rows[0]);
  assert.equal(row[9], 4.5);
  assert.equal(row[10], 5);
  assert.equal(row[13], 2);
  assert.equal(row[14], 1);
  assert.equal(row[15], 0.2);
  assert.equal(row[23], 100);
  assert.equal(row[24], 10);
});

test("monthly trend ignores a malformed YEAR_MONTH cell and derives period from date", () => {
  const item = rating("ANDROID|VE|BBVA", "Android", "VE", 4.3, 0.1, new Date(2026, 6, 16, 12));
  item.yearMonth = new Date(2026, 6, 1, 12);
  const row = Array.from(context.buildMonthlyTrendRows_([item])[0]);
  assert.equal(row[1], "2026-07");
  assert.ok(row[0] instanceof Date);
});

test("incomplete coverage suppresses rank in materialized competition source", () => {
  const item = rating("ANDROID|VE|BBVA", "Android", "VE", 4.3, 0.1);
  item.ranking = 1; item.rankingExpectedApps = 5; item.rankingObservedApps = 4;
  item.rankingCoverage = 0.8; item.rankingIsComplete = false;
  const catalog = [{ ...app("ANDROID|VE|BBVA", "Android", "VE", 0), dashboardSection: "COUNTRY_BANKS", productScope: "BUSINESS", competitorSetVersion: "2026Q3", displayOrder: 0 }];
  const row = Array.from(context.buildCompetitionRows_([item], catalog)[0]);
  assert.equal(row[15], "");
  assert.equal(row[18], 0.8);
  assert.equal(row[19], false);
  assert.equal(row[31], 90);
  assert.equal(row[32], 10);
  assert.equal(row[33], "https://play.google.com/store/apps/details?id=com.bbva.empresas&hl=es&gl=VE");
});

test("store links are canonical HTTPS pages with an explicit geography", () => {
  assert.equal(context.buildStoreWebUrl_(app("IOS|VE|BBVA", "iOS", "VE", 0)), "https://apps.apple.com/ve/app/id1590189082");
  assert.equal(context.buildStoreWebUrl_(app("HUAWEI|VE|BBVA", "Huawei", "VE", 0)), "https://appgallery.huawei.com/app/C1751602113005231488?locale=es_VE");
  assert.ok(!/^(market|itms-apps|appmarket):/.test(context.buildStoreWebUrl_(app("ANDROID|VE|BBVA", "Android", "VE", 0))));
});
