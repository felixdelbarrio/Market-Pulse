import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const sources = ["../src/00_Config.gs", "../src/99_Core.gs", "../src/30_Ratings.gs"]
  .map(file => fs.readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n");
const context = { console, Date, Math, Number, String, Boolean, Array, Object, JSON, isFinite, isNaN };
vm.createContext(context);
vm.runInContext(sources, context);

test("new ratings match the current exact contract", () => {
  const app = {
    appKey: "ANDROID|ES|BBVA", platform: "Android", store: "Google Play", countryCode: "ES",
    country: "España", appName: "BBVA", packageName: "com.bbva.empresas", appId: "", isBbva: true,
    marketSegment: "BANK", displayOrder: 0
  };
  const row = context.buildRatingRows_([
    { ok: true, app, rating: 4.5, ratingCount: 1234 }
  ], new Date(2026, 6, 17, 12), new Date(2026, 6, 17, 13))[0];
  assert.equal(row.length, context.MARKETS_CONFIG.headers.ratings.length);
  assert.equal(row[13], 1234);
  assert.deepEqual(Array.from(row).slice(-2), ["", ""]);
});

test("the daily job reuses ratings with the same metrics it wrote to Sheets", () => {
  const app = { appKey: "ANDROID|ES|BBVA", platform: "Android", store: "Google Play",
    countryCode: "ES", country: "España", appName: "BBVA", isBbva: true,
    marketSegment: "BANK", displayOrder: 0 };
  const rows = [[4, 100, 1], [4.5, 120, 15]].flatMap(([rating, ratingCount, day]) =>
    context.buildRatingRows_([{ ok: true, app, rating, ratingCount }],
      new Date(2026, 6, day, 12), new Date(2026, 6, day, 13)));
  let reads = 0;
  const sheet = {
    getLastRow: () => rows.length + 1,
    getRange(start, column) {
      return {
        getValues() { reads++; return rows.map(row => row.slice()); },
        setValues(values) {
          values.forEach((value, index) => rows[start - 2 + index].splice(column - 1, value.length, ...value));
          return this;
        },
        setNumberFormat() { return this; }
      };
    }
  };
  const ss = { getSheetByName: () => sheet };
  const updated = context.rebuildRatingMetrics_(ss, 7, [app]);
  assert.equal(reads, 1);
  assert.deepEqual(updated, context.readRatingObjects_(ss));
  assert.equal(updated[1].ratingCountDelta30d, 20);
  assert.equal(updated[1].rankingIsComplete, true);
});
