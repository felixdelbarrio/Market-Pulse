import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = ["../src/99_Core.gs", "../src/50_Alerts.gs", "../src/56_Newsletter.gs"]
  .map(file => fs.readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n");
const context = {
  console, Date, Math, Number, String, Boolean, Array, Object, JSON, RegExp, isFinite, isNaN,
  MARKETS_CONFIG: {
    timeZone: "Europe/Madrid", countryCodes: ["ES", "MX", "CO"],
    webAppUrl: "https://script.google.com/a/macros/bbva.com/s/example/exec"
  }
};
vm.createContext(context);
vm.runInContext(source, context);
const plain = value => JSON.parse(JSON.stringify(value));

function pref(countries = ["ALL"], platforms = ["ALL"]) {
  return {
    email: "director@bbva.com", active: true, countries, platforms,
    dailyDropEnabled: true, dailyWarningDrop: 0.1, dailyCriticalDrop: 0.15,
    mtdDropEnabled: true, mtdWarningDrop: 0.3, mtdCriticalDrop: 0.5,
    ytdDropEnabled: true, ytdWarningDrop: 0.3, ytdCriticalDrop: 0.5,
    repeatWhileBreached: false, crossoverEnabled: false, crossoverDirection: "BOTH"
  };
}

const catalog = [
  { appKey: "IOS|ES|BBVA", platform: "iOS", countryCode: "ES", country: "España",
    appId: "1", appName: "BBVA", isBbva: true, enabled: true, marketSegment: "BANK" },
  { appKey: "IOS|ES|RIVAL", platform: "iOS", countryCode: "ES", country: "España",
    appId: "2", appName: "Banco Rival", isBbva: false, enabled: true, marketSegment: "BANK" },
  { appKey: "ANDROID|MX|BBVA", platform: "Android", countryCode: "MX", country: "México",
    packageName: "com.bbva.empresas", appName: "BBVA", isBbva: true, enabled: true, marketSegment: "BANK" },
  { appKey: "ANDROID|MX|RIVAL", platform: "Android", countryCode: "MX", country: "México",
    packageName: "mx.rival", appName: "Banco Rival", isBbva: false, enabled: true, marketSegment: "BANK" },
  { appKey: "ANDROID|CO|BBVA", platform: "Android", countryCode: "CO", country: "Colombia",
    packageName: "com.bbva.empresas", appName: "BBVA", isBbva: true, enabled: true, marketSegment: "BANK" }
];

function row(appKey, platform, countryCode, country, day, rating, ratingCount, isBbva = true, appName = "BBVA") {
  return {
    appKey, platform, countryCode, country, observedDate: new Date(2026, day[0], day[1], 12),
    rating, ratingCount, isBbva, appName, marketSegment: "BANK"
  };
}

const ratings = [
  row("IOS|ES|BBVA", "iOS", "ES", "España", [0, 2], 4.01, 100),
  row("IOS|ES|BBVA", "iOS", "ES", "España", [5, 1], 4.11, 120),
  row("IOS|ES|BBVA", "iOS", "ES", "España", [5, 30], 4.21, 140),
  row("IOS|ES|RIVAL", "iOS", "ES", "España", [5, 30], 4.3, 90, false, "Banco Rival"),
  row("ANDROID|MX|BBVA", "Android", "MX", "México", [0, 2], 4.5, 1000),
  row("ANDROID|MX|BBVA", "Android", "MX", "México", [5, 1], 4.5, 1100),
  row("ANDROID|MX|BBVA", "Android", "MX", "México", [5, 30], 4.4, 1200),
  row("ANDROID|MX|RIVAL", "Android", "MX", "México", [5, 30], 4.2, 800, false, "Banco Rival")
];

test("single-country newsletter uses real closes, reliable review effect and complete position", () => {
  const model = context.buildMarketsNewsletterModel_(ratings, catalog, pref(["ES"], ["iOS"]), "2026-06", {});
  assert.equal(model.scope.type, "SINGLE");
  assert.equal(model.items.length, 1);
  assert.equal(model.items[0].monthStartRating, 4.11);
  assert.equal(model.items[0].endRating, 4.21);
  assert.equal(model.items[0].yearStartRating, 4.01);
  assert.equal(model.items[0].newReviews, 20);
  assert.equal(model.items[0].position.rank, 2);
  assert.equal(model.items[0].position.total, 2);
  assert.equal(model.items[0].effect.newReviewRating, 4.81);
  const html = context.renderMarketsNewsletterHtml_(model);
  assert.match(html, /España · Todas las plataformas|España · iOS/);
  assert.match(html, /EFECTO ESTIMADO DE LAS NUEVAS VALORACIONES/);
  assert.match(html, /2 de 2 frente a banca/);
  assert.doesNotMatch(html, /mock|simulad/i);
});

test("multi-market newsletter has a distinct executive scope and hides shared Android attribution", () => {
  const model = context.buildMarketsNewsletterModel_(ratings, catalog, pref(["ES", "MX"], ["ALL"]), "2026-06", {});
  assert.equal(model.scope.type, "MULTI");
  assert.deepEqual(plain(model.scope.countries), ["ES", "MX"]);
  const mexico = model.items.find(item => item.countryCode === "MX");
  assert.equal(mexico.volumeAvailable, false);
  assert.equal(mexico.newReviews, null);
  assert.equal(mexico.effect, null);
  const html = context.renderMarketsNewsletterHtml_(model);
  assert.match(html, /2 geografías seleccionadas/);
  assert.match(html, /No atribuible/);
  assert.match(html, /ficha compartida/);
});

test("global newsletter is deduplicated and only exposes defensible effects", () => {
  const model = context.buildMarketsNewsletterModel_(ratings, catalog, pref(), "2026-06", {});
  assert.equal(model.scope.type, "ALL");
  assert.equal(model.totals.newReviews, 120);
  assert.deepEqual(plain(model.totals.reviewsByPlatform), { Android: 100, iOS: 20 });
  assert.equal(model.totals.effects, 1);
  assert.deepEqual(plain(model.coverage), {
    observed: 2, expected: 3, complete: false,
    missing: [{ appKey: "ANDROID|CO|BBVA", country: "Colombia", countryCode: "CO", platform: "Android" }]
  });
  assert.match(context.marketsNewsletterExecutiveNarrative_(model), /visión global/i);
  assert.match(context.renderMarketsNewsletterHtml_(model), /Cobertura de cierre: 2 de 3/);
});

test("competitive position remains hidden when an expected bank is missing", () => {
  const incomplete = ratings.filter(item => item.appKey !== "IOS|ES|RIVAL").concat([
    row("IOS|ES|LEGACY", "iOS", "ES", "España", [5, 30], 4.9, 10, false, "Ficha obsoleta")
  ]);
  const position = context.marketsNewsletterPosition_(incomplete, catalog, catalog[0], "2026-06");
  assert.equal(position.available, false);
  assert.equal(position.observed, 1);
  assert.equal(position.expected, 2);
});

test("newsletter schedule targets the previous calendar month", () => {
  assert.equal(context.marketsPreviousMonthKey_(new Date(2026, 6, 1, 8)), "2026-06");
  assert.equal(context.marketsPreviousMonthKey_(new Date(2026, 0, 1, 8)), "2025-12");
});
