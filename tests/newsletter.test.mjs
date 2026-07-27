import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const newsletterSource = fs.readFileSync(new URL("../src/56_Newsletter.gs", import.meta.url), "utf8");
const source = ["../src/99_Core.gs", "../src/50_Alerts.gs"]
  .map(file => fs.readFileSync(new URL(file, import.meta.url), "utf8"))
  .concat(newsletterSource)
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

test("monthly newsletter delivery is independent from alert activation", () => {
  const deliveryBody = newsletterSource.match(
    /function sendMarketsMonthlyNewsletter_[\s\S]*?function sendMarketsAdminNewsletterTestEmail/)[0];
  assert.match(deliveryBody, /return item\.newsletterEnabled/);
  assert.doesNotMatch(deliveryBody, /return item\.active/);
});

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
  row("IOS|ES|BBVA", "iOS", "ES", "España", [4, 31], 4.11, 120),
  row("IOS|ES|BBVA", "iOS", "ES", "España", [5, 1], 4.13, 123),
  row("IOS|ES|BBVA", "iOS", "ES", "España", [5, 30], 4.21, 140),
  row("IOS|ES|RIVAL", "iOS", "ES", "España", [5, 30], 4.3, 90, false, "Banco Rival"),
  row("ANDROID|MX|BBVA", "Android", "MX", "México", [0, 2], 4.5, 1000),
  row("ANDROID|MX|BBVA", "Android", "MX", "México", [4, 31], 4.5, 1100),
  row("ANDROID|MX|BBVA", "Android", "MX", "México", [5, 1], 4.49, 1111),
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
  assert.equal(model.items[0].effect.gapToPreviousRating, 0.7);
  assert.equal(model.items[0].effect.accumulatedRatingChange, 0.1);
  const brief = context.marketsNewsletterExecutiveBrief_(model);
  assert.equal(brief.headline, "iOS cierra el mes al alza en España.");
  assert.match(brief.summary,
    /Las nuevas valoraciones se sitúan por encima del rating previo y refuerzan el cierre/);
  assert.doesNotMatch(brief.summary, /4,11|4,21|4,81|20 nuevas valoraciones/);
  const html = context.renderMarketsNewsletterHtml_(model);
  assert.match(html, /España · Todas las plataformas|España · iOS/);
  assert.match(html, /Cierre anterior[\s\S]*4,11[\s\S]*Voz nueva[\s\S]*4,81\/5/);
  assert.match(html, /Cierre[\s\S]*4,21[\s\S]*\+0,10 en el mes/);
  assert.match(html, /La voz nueva queda \+0,70 frente al rating acumulado anterior/);
  assert.doesNotMatch(html, /Valoraciones por plataforma/);
  assert.match(html, /Ratings y volúmenes de Android, iOS y Huawei nunca se combinan/);
  assert.match(html, /2\.ª posición entre 2 bancos/);
  assert.doesNotMatch(html, /mock|simulad/i);
  assert.match(html, /LECTURA EJECUTIVA/);
  assert.match(html, /exclusivamente a partir de las cifras mostradas/);
});

test("newsletter does not invent a monthly movement without the previous monthly close", () => {
  const currentOnly = ratings.filter(item =>
    item.appKey === "IOS|ES|BBVA" && item.observedDate.getMonth() === 5);
  const model = context.buildMarketsNewsletterModel_(
    currentOnly, catalog, pref(["ES"], ["iOS"]), "2026-06", {});
  assert.equal(model.items[0].monthStartRating, null);
  assert.equal(model.items[0].monthDelta, null);
  assert.equal(model.items[0].newReviews, null);
  assert.equal(model.items[0].effect, null);
  assert.equal(model.totals.series, 0);
  assert.equal(model.totals.effects, 0);
  assert.match(context.marketsNewsletterExecutiveNarrative_(model),
    /no dispone de un cierre anterior comparable/);
  assert.doesNotMatch(context.renderMarketsNewsletterHtml_(model),
    /VOZ NUEVA DEL MES · MISMA FICHA Y PLATAFORMA/);
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
  assert.match(html, /Cierre anterior[\s\S]*4,24[\s\S]*Actividad del mes[\s\S]*397[\s\S]*Cierre[\s\S]*4,20/);
  assert.match(html, /-0,04 en el mes/);
  assert.match(html, /Desde inicio de año: -0,34 \(partía de 4,54\)/);
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
      reviewsByPlatform: { Android: 442, iOS: 327 } },
    strongest: items[1], weakest: items[0]
  };
  const brief = context.marketsNewsletterExecutiveBrief_(model);
  assert.equal(brief.headline, "México cierra el mes con presión en todas las plataformas.");
  assert.match(brief.summary, /^El principal foco de atención está en Android \(-0,04\)/);
  assert.doesNotMatch(brief.headline + brief.summary, /0 series|México · Android/);
  assert.match(context.marketsNewsletterVolumeContext_(model),
    /Android registra 442 nuevas valoraciones y iOS registra 327 nuevas valoraciones/);
  assert.doesNotMatch(context.marketsNewsletterVolumeContext_(model), /769/);
});

test("voice-new executive summary uses platforms for one geography and listings for wider scopes", () => {
  const effect = (country, platform, gap, change) => ({
    country, platform, shared: false,
    effect: { newReviewRating: 4.5, gapToPreviousRating: gap,
      accumulatedRatingChange: change }
  });
  const effects = [
    effect("México", "Android", -0.1, -0.04),
    effect("México", "iOS", 0.2, 0.01)
  ];
  const single = context.marketsNewsletterVoiceContext_({
    scope: { type: "SINGLE" }, reviewEffects: effects
  });
  assert.match(single,
    /La voz del cliente presenta señales mixtas en las dos plataformas donde puede medirse/);
  assert.match(single, /corresponde a Android \(-0,04\)/);
  assert.doesNotMatch(single, /México · Android/);
  const multi = context.marketsNewsletterVoiceContext_({
    scope: { type: "MULTI" }, reviewEffects: effects
  });
  assert.match(multi, /en los dos casos donde es posible medir su efecto/);
  assert.match(multi, /México · Android \(-0,04\)/);
});

test("global opening translates counts into an executive business reading", () => {
  const weakest = {
    country: "España", platform: "Android", monthDelta: -0.13, yearDelta: 0,
    position: { available: false }
  };
  const strongest = {
    country: "Colombia", platform: "iOS", monthDelta: 0.11, yearDelta: 0,
    position: { available: false }
  };
  const effect = (country, platform, change) => ({
    country, platform, shared: false,
    effect: { newReviewRating: 4.7, gapToPreviousRating: 0.2,
      accumulatedRatingChange: change }
  });
  const model = {
    scope: { type: "ALL" },
    items: [weakest, strongest],
    totals: { series: 15, improving: 5, declining: 4, stable: 6,
      reviewsByPlatform: {} },
    strongest,
    weakest,
    reviewEffects: [
      effect("Argentina", "iOS", 0.09),
      effect("Colombia", "iOS", 0.02),
      effect("España", "iOS", 0.01),
      effect("México", "iOS", 0.01)
    ]
  };
  const brief = context.marketsNewsletterExecutiveBrief_(model);
  assert.equal(brief.headline,
    "La estabilidad marca el tono del mes, con un ligero sesgo positivo.");
  assert.equal(brief.summary,
    "El principal foco de atención está en España · Android (-0,13). " +
    "Las nuevas valoraciones aportan una señal favorable en los cuatro casos donde es posible medir su efecto. " +
    "El mayor efecto en el cierre corresponde a Argentina · iOS (+0,09).");
  assert.doesNotMatch(brief.headline + brief.summary,
    /\bseries\b|4 impulsan|fichas calculables|concentra el ajuste|mayor reflejo/);
});

test("executive narrative adapts to generalized, stable and mixed closes", () => {
  const item = (country, platform, delta) => ({
    country, platform, monthStartRating: 4.5, endRating: 4.5 + delta,
    monthDelta: delta, yearDelta: delta, position: { available: false }, newReviews: null
  });
  const cases = [
    {
      model: { scope: { type: "MULTI" }, items: [item("España", "iOS", 0.1), item("México", "Android", 0.05)],
        totals: { series: 2, improving: 2, declining: 0, stable: 0, reviewsByPlatform: {} },
        strongest: item("España", "iOS", 0.1), weakest: item("México", "Android", 0.05) },
      expected: /avances en todo el perímetro/
    },
    {
      model: { scope: { type: "ALL" }, items: [item("España", "iOS", 0), item("México", "Android", 0)],
        totals: { series: 2, improving: 0, declining: 0, stable: 2, reviewsByPlatform: {} },
        strongest: item("España", "iOS", 0), weakest: item("México", "Android", 0) },
      expected: /sin movimientos/
    },
    {
      model: { scope: { type: "ALL" }, items: [item("España", "iOS", 0.1), item("México", "Android", -0.04)],
        totals: { series: 2, improving: 1, declining: 1, stable: 0, reviewsByPlatform: {} },
        strongest: item("España", "iOS", 0.1), weakest: item("México", "Android", -0.04) },
      expected: /balance equilibrado/
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
  assert.match(context.marketsNewsletterExecutiveBrief_(model).summary,
    /En España · iOS, las nuevas valoraciones/);
  assert.doesNotMatch(context.marketsNewsletterExecutiveBrief_(model).summary,
    /Voz nueva en iOS:/);
});

test("global newsletter is deduplicated and only exposes defensible effects", () => {
  const model = context.buildMarketsNewsletterModel_(ratings, catalog, pref(), "2026-06", {});
  assert.equal(model.scope.type, "ALL");
  assert.deepEqual(plain(model.totals.reviewsByPlatform), { Android: 100, iOS: 20 });
  assert.equal(model.totals.effects, 1);
  assert.deepEqual(plain(model.coverage), {
    observed: 2, expected: 3, complete: false,
    missing: [{ appKey: "ANDROID|CO|BBVA", country: "Colombia", countryCode: "CO", platform: "Android" }]
  });
  assert.match(context.marketsNewsletterExecutiveNarrative_(model), /balance equilibrado/i);
  assert.match(context.marketsNewsletterExecutiveBrief_(model).summary,
    /En España · iOS, las nuevas valoraciones/);
  assert.match(context.renderMarketsNewsletterHtml_(model), /Cobertura de cierre: 2 de 3/);
});

test("newsletter calculates a shared Android listing once and never attributes it to a country", () => {
  const shared = [
    {
      appKey: "ANDROID|ES|BBVA", country: "España", platform: "Android",
      volumeKey: "ANDROID|com.bbva.empresas", volumeAvailable: false,
      sharedMarkets: 2,
      monthStartRating: 4.2, startCount: 100, endRating: 4.25, endCount: 120
    },
    {
      appKey: "ANDROID|CO|BBVA", country: "Colombia", platform: "Android",
      volumeKey: "ANDROID|com.bbva.empresas", volumeAvailable: false,
      sharedMarkets: 2,
      monthStartRating: 4.2, startCount: 100, endRating: 4.25, endCount: 120
    }
  ];
  const global = context.marketsNewsletterReviewEffects_(shared, "ALL");
  assert.equal(global.length, 1);
  assert.equal(global[0].country, "Ficha Android compartida");
  assert.equal(global[0].shared, true);
  assert.equal(global[0].effect.newReviewRating, 4.5);
  assert.deepEqual(plain(global[0].markets), ["Colombia", "España"]);
  assert.equal(context.marketsNewsletterReviewEffects_(shared, "MULTI").length, 1);
  assert.deepEqual(plain(context.marketsNewsletterReviewEffects_(shared.slice(0, 1), "MULTI")), []);
  assert.deepEqual(plain(context.marketsNewsletterTotals_(shared, "MULTI").reviewsByPlatform),
    { Android: 20 });
  assert.deepEqual(plain(context.marketsNewsletterTotals_(shared.slice(0, 1), "MULTI").reviewsByPlatform),
    {});
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

test("every geography renders Android, iOS and then Huawei only when data exists", () => {
  const item = platform => ({
    country: "España", countryCode: "ES", platform,
    yearStartRating: 4.4, monthStartRating: 4.5, endRating: 4.6,
    yearDelta: 0.2, monthDelta: 0.1, newReviews: 10, volumeAvailable: true,
    position: { available: false }
  });
  const complete = context.marketsNewsletterGroups_([
    item("Huawei"), item("iOS"), item("Android")
  ])[0];
  assert.deepEqual(plain(complete.items.map(entry => entry.platform)), ["Android", "iOS", "Huawei"]);
  const essential = context.marketsNewsletterGroups_([
    item("iOS"), item("Android")
  ])[0];
  assert.deepEqual(plain(essential.items.map(entry => entry.platform)), ["Android", "iOS"]);

  const model = {
    isTest: true, configuredFor: "director@bbva.com", periodLabel: "julio 2026",
    scope: { type: "ALL", countries: ["ES"], countryLabel: "", platformLabel: "Todas las plataformas" },
    items: [item("Huawei"), item("iOS"), item("Android")],
    totals: {
      series: 3, improving: 3, declining: 0, stable: 0, effects: 0,
      reviewsByPlatform: { Huawei: 10, iOS: 10, Android: 10 }
    },
    coverage: { complete: true },
    strongest: item("Android"), weakest: item("Huawei")
  };
  const html = context.renderMarketsNewsletterHtml_(model);
  const volumeStart = html.indexOf("Valoraciones por plataforma");
  const groupStart = html.indexOf(">España</strong>", volumeStart);
  const volumes = html.slice(volumeStart, groupStart);
  assert.ok(volumes.indexOf("<strong>Android</strong>") < volumes.indexOf("<strong>iOS</strong>"));
  assert.ok(volumes.indexOf("<strong>iOS</strong>") < volumes.indexOf("<strong>Huawei</strong>"));
  const geography = html.slice(groupStart);
  assert.ok(geography.indexOf(">Android</strong>") < geography.indexOf(">iOS</strong>"));
  assert.ok(geography.indexOf(">iOS</strong>") < geography.indexOf(">Huawei</strong>"));
  assert.equal(context.marketsNewsletterGeographyBrief_([
    { platform: "Android", monthDelta: 0.1 },
    { platform: "iOS", monthDelta: -0.05 },
    { platform: "Huawei", monthDelta: 0 }
  ]), "1 mejora, 1 retrocede y 1 estable · 3 plataformas");
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
  assert.equal(context.marketsPeriodBefore_("2026-06"), "2026-05");
  assert.equal(context.marketsPeriodBefore_("2026-01"), "2025-12");
});

test("an accepted admin newsletter retry is idempotent and does not rebuild or resend", () => {
  const previous = {
    readExisting: context.readExistingAlertKeys_,
    readRatings: context.readRatingObjects_,
    web: context.MARKETS_WEB
  };
  const recipient = "administrator@bbva.com";
  const requestId = "NEWS-REQ-12345678";
  const deliveryId = "NEWS-12345678";
  context.MARKETS_CONFIG.codeVersion = "test-code";
  context.MARKETS_WEB = { version: "test-web" };
  context.readExistingAlertKeys_ = () => ({
    [`NEWSLETTER_TEST|${deliveryId}|${recipient}`]: true
  });
  context.readRatingObjects_ = () => {
    throw new Error("A completed retry must not read or send again.");
  };
  const result = context.sendMarketsNewsletterPreview_(
    {}, recipient, pref(["MX"], ["Android"]), "director@bbva.com", requestId);
  assert.equal(result.accepted, true);
  assert.equal(result.alreadyAccepted, true);
  assert.equal(result.deliveryId, deliveryId);
  assert.equal(result.configuredFor, "director@bbva.com");

  context.readExistingAlertKeys_ = previous.readExisting;
  context.readRatingObjects_ = previous.readRatings;
  context.MARKETS_WEB = previous.web;
});
