import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../src/99_Core.gs", import.meta.url), "utf8");
const context = { console, Date, Math, Number, String, Boolean, Array, Object, JSON, isFinite, isNaN };
vm.createContext(context);
vm.runInContext(source, context);

test("normalizeRating_ accepts only the public 1-5 scale", () => {
  assert.equal(context.normalizeRating_(4.87654321), 4.876543);
  assert.equal(context.normalizeRating_("4,7"), 4.7);
  assert.equal(context.normalizeRating_(0), null);
  assert.equal(context.normalizeRating_(5.1), null);
});

test("rankSnapshot_ applies competition ranking and preserves ties", () => {
  assert.deepEqual(Array.from(context.rankSnapshot_([{ rating: 5 }, { rating: 5 }, { rating: 4 }, { rating: 3 }])), [1, 1, 3, 4]);
});

test("findPreviousRating_ returns the latest point at or before the target", () => {
  const series = [
    { dateMillis: Date.UTC(2026, 0, 1), rating: 4.1 },
    { dateMillis: Date.UTC(2026, 0, 15), rating: 4.2 },
    { dateMillis: Date.UTC(2026, 1, 1), rating: 4.3 }
  ];
  assert.equal(context.findPreviousRating_(series, Date.UTC(2026, 0, 20)), 4.2);
  assert.equal(context.findPreviousRating_(series, Date.UTC(2025, 11, 31)), null);
  series[1].ratingCount = 120;
  assert.equal(context.findPreviousValue_(series, Date.UTC(2026, 0, 20), "ratingCount"), 120);
});

test("rating keys are deterministic", () => {
  const key = "ANDROID|ES|CAIXABANK_NOW";
  assert.equal(context.makeRatingKey_(new Date(2026, 6, 16, 12), key), "2026-07-16|ANDROID|ES|CAIXABANK_NOW");
});
