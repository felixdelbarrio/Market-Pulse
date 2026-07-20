import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../src/00_Config.gs", import.meta.url), "utf8");
const context = { Object };
vm.createContext(context);
vm.runInContext(source, context);

test("geographic seeds match the catalog contract and have unique keys", () => {
  const headers = Array.from(context.MARKETS_CONFIG.headers.catalog);
  const seeds = Array.from(context.MARKETS_CATALOG_SEEDS, row => Array.from(row));
  assert.equal(headers.length, 29);
  assert.equal(seeds.length, 45);
  assert.ok(seeds.every(row => row.length === headers.length));
  assert.equal(new Set(seeds.map(row => row[0])).size, seeds.length);
  assert.deepEqual(
    Object.fromEntries(["Android", "iOS", "Huawei"].map(platform => [platform, seeds.filter(row => row[1] === platform && row[3] === "VE").length])),
    { Android: 5, iOS: 5, Huawei: 5 }
  );
  assert.equal(seeds.filter(row => ["IT", "DE"].includes(row[3])).length, 0);
  for (const country of ["MX", "ES", "CO"]) for (const platform of ["Android", "iOS"])
    assert.equal(seeds.filter(row => row[1] === platform && row[3] === country && row[19] === "FINTECH").length, 4);
  assert.equal(seeds.filter(row => row[1] === "Android" && row[3] === "AR" && row[19] === "FINTECH").length, 3);
  assert.equal(seeds.filter(row => row[1] === "iOS" && row[3] === "AR" && row[19] === "FINTECH").length, 3);
  const digital = seeds.filter(row => row[19] === "FINTECH");
  assert.ok(digital.every(row => row[22] === "COMMERCIAL" && row[25] === true));
  assert.ok(digital.every(row => /^https:\/\//.test(row[26]) && /^https:\/\//.test(row[27]) && row[28] === "2026-07-16"));
  assert.ok(!digital.some(row => /\|(NU|KLAR|STORI|BRUBANK|NARANJA_X|IMAGIN|OPENBANK|LULO)$/.test(row[0])));
  assert.equal(context.MARKETS_CONFIG.sheets.reviews, undefined);
  assert.equal(context.MARKETS_CONFIG.sheets.scorecards, undefined);
  assert.equal(context.MARKETS_CONFIG.sheets.alertPreferences, "ALERT_SUBSCRIPTIONS");
  assert.deepEqual(Array.from(context.MARKETS_CONFIG.countryCodes), ["AR", "CO", "ES", "MX", "PE", "TR", "UY", "VE"]);
});

test("persistent and compact web contracts expose only required fields", () => {
  const headers = context.MARKETS_CONFIG.headers;
  assert.deepEqual(Array.from(headers.ratings).slice(-2), ["PREVIOUS_RATING_COUNT_30D", "RATING_COUNT_DELTA_30D"]);
  assert.deepEqual(Array.from(headers.trends), ["PERIOD_MONTH", "PLATFORM", "COUNTRY_CODE", "COUNTRY", "APP_KEY", "APP_NAME", "IS_BBVA", "RATING_EOM", "MARKET_SEGMENT"]);
  assert.deepEqual(Array.from(headers.competition), ["OBSERVED_DATE", "PLATFORM", "COUNTRY_CODE", "COUNTRY", "MARKET_SEGMENT", "APP_KEY", "APP_NAME", "IS_BBVA", "DISPLAY_ORDER", "RATING", "RATING_COUNT", "RANKING_IS_COMPLETE", "DELTA_30D", "IS_FRESH_THIS_RUN", "RATING_COUNT_DELTA_30D", "STORE_WEB_URL"]);
  assert.deepEqual(Array.from(headers.alerts).slice(-6), ["USER_EMAIL", "RULE_ID", "METRIC_VALUE", "THRESHOLD", "APP_KEY", "DIRECTION"]);
  assert.equal(headers.alertPreferences.length, 31);
  assert.deepEqual(Array.from(headers.alertPreferences).slice(-4), ["REGISTERED_AT", "LAST_SEEN_AT", "LAST_TEST_AT", "LAST_DELIVERY_AT"]);
});
