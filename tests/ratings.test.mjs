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
