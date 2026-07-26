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
  const brief = context.marketsNewsletterExecutiveBrief_(model);
  assert.equal(brief.headline, "iOS cierra el mes al alza en España.");
  assert.match(brief.summary, /iOS avanza de 4,11 a 4,21 \(\+0,10\)/);
  assert.match(brief.summary, /El mes suma 20 nuevas valoraciones/);
  const html = context.renderMarketsNewsletterHtml_(model);
  assert.match(html, /España · Todas las plataformas|España · iOS/);
  assert.match(html, /EFECTO ESTIMADO DE LAS NUEVAS VALORACIONES/);
  assert.match(html, /2\.ª posición entre 2 bancos/);
  assert.doesNotMatch(html, /mock|simulad/i);
  assert.match(html, /LECTURA EJECUTIVA/);
  assert.match(html, /exclusivamente a partir de las cifras mostradas/);
});

test("competitive position and rating changes use explicit director-friendly labels", () => {
  assert.equal(context.marketsNewsletterPositionLabel_({ available: true, rank: 1, total: 5 }),
    "Líder entre 5 bancos");
  assert.equal(context.marketsNewsletterPositionLabel_({ available: true, rank: 2, total: 5 }),
    "2.ª posición entre 5 bancos");
  assert.equal(context.marketsNewsletterPositionLabel_({ available: false }),
    "No disponible");

  const html = context.marketsNewsletterRowHtml_({
    platform: "Android",
    yearStartRating: 4.54,
    monthStartRating: 4.24,
    endRating: 4.2,
    yearDelta: -0.34,
    monthDelta: -0.04,
    newReviews: 397,
    volumeAvailable: true,
    position: { available: true, rank: 2, total: 5 }
  });
  assert.match(html, /Posición competitiva/);
  assert.match(html, /2\.ª posición entre 5 bancos/);
  assert.match(html, /Inicio de año[\s\S]*4,54[\s\S]*Inicio de mes[\s\S]*4,24[\s\S]*Cierre[\s\S]*4,20/);
  assert.match(html, /Variación mensual[\s\S]*-0,04[\s\S]*vs\. inicio de mes/);
  assert.match(html, /Variación anual[\s\S]*-0,34[\s\S]*vs\. inicio de año/);
  assert.match(html, /Nuevas valoraciones[\s\S]*397[\s\S]*recibidas en el mes/);
  assert.doesNotMatch(html, /frente a banca/);
});

test("single-market pressure produces a concise executive narrative without zero-count wording", () => {
  const items = [
    { country: "México", countryCode: "MX", platform: "Android", monthStartRating: 4.24,
      endRating: 4.2, monthDelta: -0.04, yearDelta: -0.04,
      position: { available: true, rank: 2, total: 3 }, newReviews: 442 },
    { country: "México", countryCode: "MX", platform: "iOS", monthStartRating: 4.83,
      endRating: 4.82, monthDelta: -0.01, yearDelta: 0.02,
      position: { available: true, rank: 1, total: 3 }, newReviews: 327 }
  ];
  const model = {
    scope: { type: "SINGLE", countryLabel: "México" },
    items,
    totals: { series: 2, improving: 0, declining: 2, stable: 0,
      newReviews: 769, reviewsByPlatform: { Android: 442, iOS: 327 } },
    strongest: items[1], weakest: items[0]
  };
  const brief = context.marketsNewsletterExecutiveBrief_(model);
  assert.equal(brief.headline, "México cierra el mes con presión en todas las plataformas.");
  assert.match(brief.summary, /^Las dos plataformas analizadas retroceden\./);
  assert.match(brief.summary, /Android concentra el ajuste más relevante \(-0,04\)/);
  assert.doesNotMatch(brief.headline + brief.summary, /0 series|México · Android/);
});

test("executive narrative adapts to generalized, stable and mixed closes", () => {
  const item = (country, platform, delta) => ({
    country, platform, monthStartRating: 4.5, endRating: 4.5 + delta,
    monthDelta: delta, yearDelta: delta, position: { available: false }, newReviews: null
  });
  const cases = [
    {
      model: { scope: { type: "MULTI" }, items: [item("España", "iOS", 0.1), item("México", "Android", 0.05)],
        totals: { series: 2, improving: 2, declining: 0, stable: 0, newReviews: null, reviewsByPlatform: {} },
        strongest: item("España", "iOS", 0.1), weakest: item("México", "Android", 0.05) },
      expected: /avances generalizados/
    },
    {
      model: { scope: { type: "ALL" }, items: [item("España", "iOS", 0), item("México", "Android", 0)],
        totals: { series: 2, improving: 0, declining: 0, stable: 2, newReviews: null, reviewsByPlatform: {} },
        strongest: item("España", "iOS", 0), weakest: item("México", "Android", 0) },
      expected: /sin cambios/
    },
    {
      model: { scope: { type: "ALL" }, items: [item("España", "iOS", 0.1), item("México", "Android", -0.04)],
        totals: { series: 2, improving: 1, declining: 1, stable: 0, newReviews: null, reviewsByPlatform: {} },
        strongest: item("España", "iOS", 0.1), weakest: item("México", "Android", -0.04) },
      expected: /cierre mixto/
    }
  ];
  cases.forEach(({ model, expected }) => {
    const narrative = context.marketsNewsletterExecutiveNarrative_(model);
    assert.match(narrative, expected);
    assert.doesNotMatch(narrative, /\b0 (?:serie|plataforma)/);
    assert.doesNotMatch(narrative, /9,99|Turquía/);
  });
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

test("missing Huawei is omitted silently and does not reduce newsletter coverage", () => {
  const huawei = { appKey: "HUAWEI|ES|BBVA", platform: "Huawei", countryCode: "ES",
    country: "España", appId: "C1", appName: "BBVA", isBbva: true, enabled: true,
    marketSegment: "BANK" };
  const model = context.buildMarketsNewsletterModel_(ratings, catalog.concat(huawei),
    pref(["ES"], ["ALL"]), "2026-06", {});
  assert.equal(model.coverage.complete, true);
  assert.equal(model.coverage.observed, 1);
  assert.equal(model.coverage.expected, 1);
  assert.doesNotMatch(context.renderMarketsNewsletterHtml_(model), /Cobertura de cierre:/);
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
