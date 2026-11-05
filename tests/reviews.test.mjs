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
