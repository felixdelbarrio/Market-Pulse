import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const sources = ["../src/99_Core.gs", "../src/20_Adapters.gs"]
  .map(file => fs.readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n");
const context = {
  console, Date, Math, Number, String, Boolean, Array, Object, JSON, RegExp, isFinite, isNaN,
  MARKETS_CONFIG: { codeVersion: "test", requestRetries: 0, retryBaseDelayMs: 1, huaweiBatchSize: 6, huaweiBatchDelayMs: 1 }
};
vm.createContext(context);
vm.runInContext(sources, context);

test("Play parser reuses the official store artwork", () => {
  const html = `<script type="application/ld+json">{"@type":"SoftwareApplication","image":"https://cdn.example/app.png","aggregateRating":{"ratingValue":"4.7","ratingCount":"1,234"}}</script>`;
  const parsed = context.parsePlayRatingHtml_(html);
  assert.equal(parsed.rating, 4.7);
  assert.equal(parsed.ratingCount, 1234);
  assert.equal(parsed.logoUrl, "https://cdn.example/app.png");
});

test("iOS parser returns rating volume and official artwork", () => {
  const response = {
    getResponseCode() { return 200; },
    getContentText() { return JSON.stringify({ results: [{ averageUserRating: 4.6, userRatingCount: 500, artworkUrl100: "https://cdn.example/ios.png" }] }); }
  };
  const result = context.parseIosResponse_({ appKey: "IOS|ES|BBVA" }, response);
  assert.equal(result.ratingCount, 500);
  assert.equal(result.logoUrl, "https://cdn.example/ios.png");
});
