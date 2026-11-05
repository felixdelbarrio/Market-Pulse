import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const api = vm.createContext({ trimString_: value => String(value ?? "").trim() });
vm.runInContext(fs.readFileSync(new URL("../src/54_Reviews.gs", import.meta.url), "utf8"), api);

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
