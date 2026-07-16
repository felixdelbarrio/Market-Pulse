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
    countryPlatformWeight: weight, groupUserWeight: groupWeight
  };
}

function rating(appKey, platform, countryCode, value, delta, date = new Date(2026, 6, 16, 12)) {
  return {
    appKey, platform, countryCode, country: countryCode, appName: "BBVA", isBbva: true,
    observedDate: date, yearMonth: "2026-07", rating: value, ratingCount: 100,
    ranking: 2, previousRating30d: value - delta, delta30d: delta
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
});
