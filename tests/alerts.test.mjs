import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = ["../src/99_Core.gs", "../src/00_Config.gs", "../src/55_AlertPreferences.gs", "../src/50_Alerts.gs", "../src/56_Newsletter.gs"]
  .map(file => fs.readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n");
const context = {
  console, Date, Math, Number, String, Boolean, Array, Object, JSON, RegExp, isFinite, isNaN,
  Utilities: {
    formatDate(value, _zone, pattern) {
      if (pattern === "dd/MM/yyyy") return `${String(value.getDate()).padStart(2, "0")}/${String(value.getMonth() + 1).padStart(2, "0")}/${value.getFullYear()}`;
      return value.toISOString();
    }
  },
  ScriptApp: { getService() { return { getUrl() { return "https://script.google.com/macros/s/example/exec"; } }; } }
};
vm.createContext(context);
vm.runInContext(source, context);
const plain = value => JSON.parse(JSON.stringify(value));

function preferences(overrides = {}) {
  return context.normalizeMarketsAlertPreferences_({
    ...context.defaultMarketsAlertPreferences_("felix.delbarrio@bbva.com"),
    active: true,
    ...overrides
  }, "felix.delbarrio@bbva.com");
}

function rating(day, ratingValue, overrides = {}) {
  return {
    observedDate: new Date(2026, 6, day, 12),
    platform: "iOS", countryCode: "CO", country: "Colombia",
    appKey: "IOS|CO|BBVA", appName: "BBVA Empresas Colombia", isBbva: true,
    rating: ratingValue,
    ...overrides
  };
}

test("alert defaults and personalized thresholds are normalized", () => {
  const defaults = context.defaultMarketsAlertPreferences_("FELIX.DELBARRIO@BBVA.COM");
  assert.equal(defaults.email, "felix.delbarrio@bbva.com");
  assert.equal(defaults.reviewWarningPct, 15);
  assert.equal(defaults.reviewCriticalPct, 30);
  assert.equal(defaults.dailyDropEnabled, true);
  assert.equal(defaults.dailyWarningDrop, 0.1);
  assert.equal(defaults.dailyCriticalDrop, 0.15);
  assert.equal(defaults.mtdDropEnabled, true);
  assert.equal(defaults.mtdWarningDrop, 0.3);
  assert.equal(defaults.mtdCriticalDrop, 0.5);
  assert.equal(defaults.ytdDropEnabled, true);
  assert.equal(defaults.repeatWhileBreached, false);
  assert.equal(defaults.ytdWarningDrop, 0.3);
  assert.equal(defaults.ytdCriticalDrop, 0.5);
  assert.equal(defaults.crossoverDirection, "BOTH");
  const custom = preferences({ countries: ["CO", "MX"], platforms: ["iOS"], dailyDropEnabled: true, dailyWarningDrop: "0,25", dailyCriticalDrop: 0.45 });
  assert.deepEqual(plain(custom.countries), ["CO", "MX"]);
  assert.deepEqual(plain(custom.platforms), ["iOS"]);
  assert.equal(custom.dailyDropEnabled, true);
  assert.equal(custom.dailyWarningDrop, 0.25);
  assert.equal(custom.dailyCriticalDrop, 0.45);
});

test("alert preferences reject invalid identities and threshold order", () => {
  assert.throws(() => context.normalizeMarketsAlertEmail_("person@example.com"), /@bbva\.com/);
  assert.throws(() => preferences({ ytdWarningDrop: 0.6, ytdCriticalDrop: 0.5 }), /critico.*mayor/i);
  assert.throws(() => preferences({ reviewWarningPct: 30, reviewCriticalPct: 15 }), /critico.*mayor/i);
});

test("the server derives the account and ignores an email injected by the client", () => {
  let written = null;
  context.currentMarketsUserEmail_ = () => "felix.delbarrio@bbva.com";
  context.LockService = { getScriptLock() { return { tryLock() { return true; }, releaseLock() {} }; } };
  context.openMarketsSpreadsheet_ = () => ({});
  context.requireCurrentSheetContract_ = () => {};
  context.upsertMarketsAlertPreferences_ = (_ss, value) => { written = value; return value; };
  const saved = context.saveMarketsAlertPreferences({
    email: "another.user@bbva.com", active: true,
    countries: ["ALL"], platforms: ["ALL"],
    reviewWarningPct: 15, reviewCriticalPct: 30,
    dailyWarningDrop: 0.3, dailyCriticalDrop: 0.5,
    mtdWarningDrop: 0.3, mtdCriticalDrop: 0.5,
    ytdWarningDrop: 0.3, ytdCriticalDrop: 0.5,
    crossoverDirection: "BOTH"
  });
  assert.equal(saved.email, "felix.delbarrio@bbva.com");
  assert.equal(written.email, "felix.delbarrio@bbva.com");
});

test("a user can edit the same preferences previously created by an administrator", () => {
  const original = {
    currentUser: context.currentMarketsUserEmail_, open: context.openMarketsSpreadsheet_,
    requireContract: context.requireCurrentSheetContract_, readControl: context.readControl_,
    register: context.registerOrTouchMarketsAlertUser_, recent: context.readRecentMarketsAlertEventsForUser_,
    upsert: context.upsertMarketsAlertPreferences_, LockService: context.LockService
  };
  let written = null;
  const adminCreated = preferences({
    email: "director@bbva.com", active: true, countries: ["MX"], platforms: ["iOS"],
    persisted: true, updatedBy: "admin@bbva.com"
  });
  context.currentMarketsUserEmail_ = () => "director@bbva.com";
  context.openMarketsSpreadsheet_ = () => ({ id: "sheet" });
  context.requireCurrentSheetContract_ = () => {};
  context.readControl_ = () => ({ SEND_ALERT_EMAILS: true });
  context.registerOrTouchMarketsAlertUser_ = () => adminCreated;
  context.readRecentMarketsAlertEventsForUser_ = () => [];
  context.LockService = { getScriptLock() { return { tryLock() { return true; }, releaseLock() {} }; } };
  context.upsertMarketsAlertPreferences_ = (_ss, value, updatedBy) => {
    written = Object.assign({}, value, { persisted: true, updatedBy });
    return written;
  };

  const loaded = context.getMarketsAlertPreferences();
  assert.deepEqual(plain(loaded.preferences.countries), ["MX"]);
  assert.deepEqual(plain(loaded.preferences.platforms), ["iOS"]);
  assert.match(loaded.system.privacy, /aunque el alta la haya realizado un administrador/i);

  const saved = context.saveMarketsAlertPreferences(Object.assign({}, loaded.preferences, {
    countries: ["MX", "ES"], platforms: ["Android", "iOS"]
  }));
  assert.equal(written.email, "director@bbva.com");
  assert.equal(written.updatedBy, "director@bbva.com");
  assert.deepEqual(plain(saved.countries), ["MX", "ES"]);
  assert.deepEqual(plain(saved.platforms), ["Android", "iOS"]);
  Object.assign(context, original);
});

test("a test email returns traceable acceptance diagnostics and is audited", () => {
  const original = {
    currentUser: context.currentMarketsUserEmail_, open: context.openMarketsSpreadsheet_,
    requireContract: context.requireCurrentSheetContract_, readControl: context.readControl_, send: context.sendAlertEmails_,
    append: context.appendAlertEvents_, touch: context.touchMarketsAlertTimestamp_,
    readPreferences: context.readMarketsAlertPreferences_, readRatings: context.readRatingObjects_,
    readCatalog: context.readAppCatalog_, buildPreview: context.buildMarketsRealAlertPreviewEvents_,
    Utilities: context.Utilities, Session: context.Session, MARKETS_WEB: context.MARKETS_WEB
  };
  let sentEvents = null;
  let auditedEvents = null;
  context.currentMarketsUserEmail_ = () => "felix.delbarrio@bbva.com";
  context.openMarketsSpreadsheet_ = () => ({ id: "sheet" });
  context.requireCurrentSheetContract_ = () => {};
  context.readControl_ = () => ({ SEND_ALERT_EMAILS: true });
  context.Utilities = {
    formatDate: () => "20260720-141500",
    getUuid: () => "abcd1234-0000-0000-0000-000000000000"
  };
  context.Session = { getEffectiveUser: () => ({ getEmail: () => "automation.owner@bbva.com" }) };
  context.MARKETS_WEB = { version: "test-web" };
  context.readMarketsAlertPreferences_ = () => preferences();
  context.readRatingObjects_ = () => [rating(20, 4.2)];
  context.readAppCatalog_ = () => [];
  context.buildMarketsRealAlertPreviewEvents_ = (_ratings, _catalog, pref, deliveryId) => [{
    timestamp: new Date(), referenceDate: new Date(2026, 6, 20), currentDate: new Date(2026, 6, 20),
    platform: "iOS", countryCode: "CO", country: "Colombia", type: "RATING_DROP_YTD",
    severity: "WARNING", recipients: pref.email, userEmail: pref.email, isTest: true,
    testId: deliveryId, metricValue: 0.4, threshold: 0.3, baselineRating: 4.8,
    currentRating: 4.4, appKey: "IOS|CO|BBVA", appName: "BBVA", source: "SELF_SERVICE_TEST_REAL_DATA"
  }];
  context.sendAlertEmails_ = events => {
    sentEvents = events;
    events.deliveryResults = [{
      senderName: "BBVA Market Pulse", senderAddress: "voc-commercial.group@bbva.com",
      verificationStatus: "accepted", messageId: "gmail-message-1", threadId: "gmail-thread-1"
    }];
    return 1;
  };
  context.appendAlertEvents_ = (_ss, events) => { auditedEvents = events; };
  context.touchMarketsAlertTimestamp_ = () => {};

  const result = context.sendMarketsAlertTestEmail();
  assert.equal(result.sent, true);
  assert.equal(result.accepted, true);
  assert.equal(result.deliveryId, "COM-20260720-141500-ABCD1234");
  assert.equal(result.effectiveSender, "automation.owner@bbva.com");
  assert.equal(result.senderName, "BBVA Market Pulse");
  assert.equal(result.senderAddress, "voc-commercial.group@bbva.com");
  assert.equal(result.senderMode, "GROUP_ALIAS");
  assert.equal(result.senderVerificationStatus, "accepted");
  assert.equal(result.messageId, "gmail-message-1");
  assert.equal(result.auditLogged, true);
  assert.equal(sentEvents[0].isTest, true);
  assert.equal(auditedEvents[0].type, "TEST");
  assert.equal(result.realData, true);
  assert.equal(context.marketsAlertEmailSubject_(sentEvents), "[PRUEBA] Market Pulse · Datos reales · COM-20260720-141500-ABCD1234");

  context.currentMarketsUserEmail_ = original.currentUser;
  context.openMarketsSpreadsheet_ = original.open;
  context.requireCurrentSheetContract_ = original.requireContract;
  context.readControl_ = original.readControl;
  context.sendAlertEmails_ = original.send;
  context.appendAlertEvents_ = original.append;
  context.touchMarketsAlertTimestamp_ = original.touch;
  context.readMarketsAlertPreferences_ = original.readPreferences;
  context.readRatingObjects_ = original.readRatings;
  context.readAppCatalog_ = original.readCatalog;
  context.buildMarketsRealAlertPreviewEvents_ = original.buildPreview;
  context.Utilities = original.Utilities;
  context.Session = original.Session;
  context.MARKETS_WEB = original.MARKETS_WEB;
});

test("real alert previews reject Global, generic platforms and data outside the saved scope", () => {
  const mexico = preferences({ countries: ["MX"], platforms: ["Android"] });
  const event = {
    referenceDate: new Date(2026, 6, 20), currentDate: new Date(2026, 6, 20),
    platform: "Android", countryCode: "MX", country: "México",
    type: "TEST_SNAPSHOT", appKey: "ANDROID|MX|BBVA", currentRating: 4.2
  };
  assert.equal(context.validateMarketsRealAlertPreviewEvents_([event], mexico)[0].countryCode, "MX");
  assert.throws(() => context.validateMarketsRealAlertPreviewEvents_([
    { ...event, countryCode: "GLOBAL", platform: "Todas" }
  ], mexico), /geografía y plataforma reales/);
  assert.throws(() => context.validateMarketsRealAlertPreviewEvents_([
    { ...event, countryCode: "CO" }
  ], mexico), /ámbito guardado/);
  assert.throws(() => context.validateMarketsRealAlertPreviewEvents_([
    { ...event, currentRating: null }
  ], mexico), /rating real/);
});

test("a no-signal preview reports every real series in the saved multi-country scope", () => {
  const pref = preferences({ countries: ["MX", "CO"], platforms: ["ALL"] });
  const rows = [
    rating(20, 4.2, { countryCode: "MX", country: "México", platform: "Android",
      appKey: "ANDROID|MX|BBVA", ratingCount: 56090 }),
    rating(20, 4.82, { countryCode: "MX", country: "México", platform: "iOS",
      appKey: "IOS|MX|BBVA", ratingCount: 76819 }),
    rating(20, 4.9, { countryCode: "CO", country: "Colombia", platform: "Android",
      appKey: "ANDROID|CO|BBVA", ratingCount: 1500 }),
    rating(20, 4.88, { countryCode: "CO", country: "Colombia", platform: "iOS",
      appKey: "IOS|CO|BBVA", ratingCount: 1200 })
  ];
  const events = context.buildMarketsRealAlertPreviewEvents_(rows, [], pref, "COM-NO-SIGNALS");
  assert.equal(events.length, 4);
  assert.deepEqual(plain([...new Set(events.map(event => event.countryCode))].sort()), ["CO", "MX"]);
  assert.ok(events.every(event => event.type === "TEST_SNAPSHOT"));
  assert.equal(context.marketsAlertEmailSubject_(events),
    "[PRUEBA] Market Pulse · Sin alertas activas · COM-NO-SIGNALS");
  const html = context.renderMarketsAlertEmail_(events, pref.email);
  assert.match(html, /Sin alertas activas/);
  assert.match(html, /Se han evaluado 4 series reales/);
  assert.match(html, /México · Android/);
  assert.match(html, /Colombia · iOS/);
  assert.doesNotMatch(html, /BBVA GLOBAL|GLOBAL · Todas/);
});

test("daily, month-to-date and year-to-date drops are independent", () => {
  const rows = [
    rating(2, 4.8, { observedDate: new Date(2026, 0, 2, 12) }),
    rating(1, 4.6), rating(13, 4.5), rating(14, 4.1)
  ];
  const events = context.buildRatingDropAlerts_(rows, new Date(2026, 6, 14, 12), preferences({
    dailyDropEnabled: true, mtdDropEnabled: true, ytdDropEnabled: true
  }), {});
  assert.deepEqual(plain(events.map(event => event.type)), ["RATING_DROP_DAILY", "RATING_DROP_MTD", "RATING_DROP_YTD"]);
  assert.deepEqual(plain(events.map(event => event.metricValue)), [0.4, 0.5, 0.7]);
  assert.deepEqual(plain(events.map(event => event.severity)), ["CRITICAL", "CRITICAL", "CRITICAL"]);
});

test("default drop windows do not repeat unless requested", () => {
  const rows = [
    rating(2, 4.8, { observedDate: new Date(2026, 0, 2, 12) }),
    rating(14, 4.1), rating(15, 4.1)
  ];
  const first = context.buildRatingDropAlerts_(rows, new Date(2026, 6, 14, 12), preferences(), {});
  assert.equal(first.length, 2);
  assert.deepEqual(plain(first.map(event => event.type)), ["RATING_DROP_DAILY", "RATING_DROP_YTD"]);
  const existing = Object.fromEntries(first.map(event => [event.eventKey, true]));
  const suppressed = context.buildRatingDropAlerts_(rows, new Date(2026, 6, 15, 12), preferences(), existing);
  assert.equal(suppressed.length, 0);
  const reminder = context.buildRatingDropAlerts_(rows, new Date(2026, 6, 15, 12), preferences({ repeatWhileBreached: true }), existing);
  assert.equal(reminder.length, 1);
  assert.match(reminder[0].eventKey, /2026-07-15$/);
});

test("a new non-admin enrollment acknowledges existing YTD warning and critical levels without sending", () => {
  const rows = [
    rating(2, 4.8, { observedDate: new Date(2026, 0, 2, 12) }),
    rating(20, 4.1)
  ];
  const pref = preferences({ repeatWhileBreached: false });
  const events = context.buildMarketsEnrollmentYtdAcknowledgements_(rows, new Date(2026, 6, 20, 12), pref);
  assert.deepEqual(plain(events.map(event => event.severity)), ["WARNING", "CRITICAL"]);
  assert.ok(events.every(event => event.source === "ADMIN_ENROLLMENT_BASELINE"));
  assert.ok(events.every(event => /Reconocida en el alta sin notificación/.test(event.detail)));
  assert.match(events[0].eventKey, /\|WARNING$/);
  assert.match(events[1].eventKey, /\|CRITICAL$/);
});

test("enrollment with reminders only acknowledges the first dated occurrence", () => {
  const rows = [
    rating(2, 4.8, { observedDate: new Date(2026, 0, 2, 12) }),
    rating(20, 4.4)
  ];
  const pref = preferences({ repeatWhileBreached: true });
  const events = context.buildMarketsEnrollmentYtdAcknowledgements_(rows, new Date(2026, 6, 20, 12), pref);
  assert.equal(events.length, 1);
  assert.match(events[0].eventKey, /\|2026-07-20$/);
  const next = context.buildRatingDropAlerts_(rows.concat(rating(21, 4.4)), new Date(2026, 6, 21, 12), pref,
    Object.fromEntries(events.map(event => [event.eventKey, true])));
  assert.equal(next.filter(event => event.type === "RATING_DROP_YTD").length, 1);
});

test("competitive crossovers distinguish lost and regained positions", () => {
  const peer = (day, value) => rating(day, value, {
    appKey: "IOS|CO|PEER", appName: "Banco Rival", isBbva: false
  });
  const lost = context.buildCompetitiveCrossoverAlerts_([
    rating(13, 4.5), peer(13, 4.4), rating(14, 4.4), peer(14, 4.6)
  ], new Date(2026, 6, 14, 12), preferences(), {}, {});
  assert.equal(lost.length, 1);
  assert.equal(lost[0].direction, "LOST");
  assert.equal(lost[0].severity, "WARNING");

  const gained = context.buildCompetitiveCrossoverAlerts_([
    rating(13, 4.4), peer(13, 4.5), rating(14, 4.7), peer(14, 4.6)
  ], new Date(2026, 6, 14, 12), preferences({ crossoverDirection: "GAINED" }), {}, {});
  assert.equal(gained.length, 1);
  assert.equal(gained[0].direction, "GAINED");
  assert.equal(gained[0].severity, "POSITIVE");
});

test("BBVA alert email uses the official image slot, brand system and safe content", () => {
  const events = [
    {
      severity: "WARNING", type: "RATING_DROP_YTD", platform: "iOS", countryCode: "ES",
      country: "España", appName: "BBVA", metricValue: 0.33, threshold: 0.3,
      baselineRating: 4.54, currentRating: 4.21, baselineDate: "2026-01-01", currentDate: "2026-07-21",
      detail: "Caída desde inicio de año"
    },
    {
      severity: "CRITICAL", type: "RATING_DROP_YTD", platform: "Android <script>alert('x')</script>", countryCode: "MX",
      country: "México", appName: "BBVA", metricValue: 0.66, threshold: 0.5,
      baselineRating: 3.23, currentRating: 2.57, baselineDate: "2026-01-01", currentDate: "2026-07-21",
      detail: "Caída crítica <script>alert('x')</script>"
    }
  ];
  const html = context.renderMarketsAlertEmail_(events, "felix.delbarrio@bbva.com");
  assert.match(html, /cid:bbvaLogo/);
  assert.match(html, /Benton Sans BBVA/);
  assert.match(html, /background:#001391/);
  assert.match(html, /border-radius:16px/);
  assert.match(html, /border-radius:8px/);
  assert.match(html, /MARKET PULSE · ALERTAS DE RATINGS/);
  assert.match(html, /Alerta por cambios en ratings/);
  assert.match(html, /Contexto ejecutivo para valorar la situación/);
  assert.match(html, /BBVA España cae 0,33 puntos/);
  assert.match(html, /BBVA México cae 0,66 puntos/);
  assert.match(html, /Rating anterior/);
  assert.match(html, /Rating actual/);
  assert.match(html, /el límite configurado para el nivel amarillo \(0,30 puntos\)/);
  assert.match(html, /el límite configurado para el nivel rojo \(0,50 puntos\)/);
  assert.match(html, /Abre Market Pulse/);
  assert.match(html, />Ir a Market Pulse</);
  assert.match(html, /acceso directo a Market Pulse/);
  assert.match(html, /https:\/\/accounts\.google\.com\/AccountChooser\?/);
  assert.ok(html.includes(`href="${context.MARKETS_CONFIG.webAppUrl}"`));
  assert.match(html, /Siguiente paso/);
  assert.match(html, /Datos obtenidos el 21\/07\/2026/);
  assert.doesNotMatch(html, /Markets Data Studio/i);
  assert.doesNotMatch(html, /Tu pulso de mercado requiere atención/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Android &lt;script&gt;/);
  assert.equal(context.marketsAlertEmailSubject_(events), "[Market Pulse] Alertas personalizadas · 2 cambios en ratings");
  const plainText = context.renderMarketsAlertPlainText_(events, "felix.delbarrio@bbva.com");
  assert.match(plainText, /Datos obtenidos: 21\/07\/2026/);
  assert.ok(plainText.includes(context.MARKETS_CONFIG.webAppUrl));
});

test("web app links use the single mobile-safe BBVA deployment URL", () => {
  assert.equal(context.marketsWebAppUrl_(), context.MARKETS_CONFIG.webAppUrl);
  assert.match(context.marketsWebAppUrl_(), /^https:\/\/script\.google\.com\/a\/macros\/bbva\.com\/s\/[A-Za-z0-9_-]+\/exec$/);
  const loginUrl = new URL(context.marketsWebAppLoginUrl_("FELIX.DELBARRIO@BBVA.COM"));
  assert.equal(loginUrl.origin + loginUrl.pathname, "https://accounts.google.com/AccountChooser");
  assert.equal(loginUrl.searchParams.get("Email"), "felix.delbarrio@bbva.com");
  assert.equal(loginUrl.searchParams.get("continue"), context.MARKETS_CONFIG.webAppUrl);
});

test("alert delivery uses the verified Google Group alias and preserves individual recipients", () => {
  const original = {
    Gmail: context.Gmail, Utilities: context.Utilities, readControl: context.readControl_,
    images: context.buildMarketsAlertInlineImages_, touch: context.touchMarketsAlertTimestamp_
  };
  const events = [{
    severity: "POSITIVE", type: "TEST_SNAPSHOT", platform: "Android", countryCode: "MX",
    country: "México", currentRating: 4.2, ratingCount: 56090,
    currentDate: new Date(2026, 6, 20), referenceDate: new Date(2026, 6, 20),
    appKey: "ANDROID|MX|BBVA", recipients: "felix.delbarrio@bbva.com",
    isTest: true, testId: "COM-SENDER-CHECK"
  }];
  let sentPayload = null;
  context.Utilities = {
    Charset: { UTF_8: "UTF-8" },
    getUuid: () => "12345678-1234-1234-1234-1234567890ab",
    base64Encode(value) { return Buffer.from(typeof value === "string" ? value : Uint8Array.from(value)).toString("base64"); },
    base64EncodeWebSafe(value) { return Buffer.from(value).toString("base64url"); }
  };
  context.readControl_ = () => ({ ALERT_SENDER_ALIAS: "voc-commercial.group@bbva.com" });
  context.buildMarketsAlertInlineImages_ = () => ({ bbvaLogo: { getBytes: () => [137, 80, 78, 71] } });
  context.touchMarketsAlertTimestamp_ = () => {};
  context.Gmail = { Users: {
    Settings: { SendAs: { list: () => ({ sendAs: [{
      sendAsEmail: "voc-commercial.group@bbva.com", verificationStatus: "accepted",
      isDefault: false, treatAsAlias: false
    }] }) } },
    Messages: { send(payload, userId) { sentPayload = { payload, userId }; return { id: "gmail-1", threadId: "thread-1" }; } }
  } };

  assert.equal(context.sendAlertEmails_(events, {}), 1);
  assert.equal(sentPayload.userId, "me");
  assert.equal(events.deliveryResults[0].recipient, "felix.delbarrio@bbva.com");
  assert.equal(events.deliveryResults[0].senderAddress, "voc-commercial.group@bbva.com");
  assert.equal(events.deliveryResults[0].messageId, "gmail-1");
  const mime = Buffer.from(sentPayload.payload.raw, "base64url").toString("utf8");
  assert.match(mime, /From: =\?UTF-8\?B\?.+\?= <voc-commercial\.group@bbva\.com>/);
  assert.match(mime, /To: felix\.delbarrio@bbva\.com/);
  assert.match(mime, /Content-Type: multipart\/related/);
  assert.match(mime, /Content-ID: <bbvaLogo>/);
  assert.doesNotMatch(mime, /To: voc-commercial\.group@bbva\.com/);

  Object.assign(context, {
    Gmail: original.Gmail, Utilities: original.Utilities, readControl_: original.readControl,
    buildMarketsAlertInlineImages_: original.images, touchMarketsAlertTimestamp_: original.touch
  });
});

test("group delivery fails closed when the sender alias is missing or pending", () => {
  const original = { Gmail: context.Gmail, readControl: context.readControl_ };
  context.readControl_ = () => ({ ALERT_SENDER_ALIAS: "voc-commercial.group@bbva.com" });
  context.Gmail = { Users: { Settings: { SendAs: { list: () => ({ sendAs: [] }) } } } };
  assert.throws(() => context.requireMarketsAlertSender_({}), /no esta autorizado.*Enviar como/i);
  context.Gmail.Users.Settings.SendAs.list = () => ({ sendAs: [{
    sendAsEmail: "voc-commercial.group@bbva.com", verificationStatus: "pending"
  }] });
  assert.throws(() => context.requireMarketsAlertSender_({}), /pendiente de verificacion/i);
  context.Gmail = original.Gmail;
  context.readControl_ = original.readControl;
});

test("events from a failed legacy run remain eligible for retry", () => {
  const original = context.readFailedAlertRunIds_;
  context.readFailedAlertRunIds_ = () => ({ "failed-run": true });
  const rows = [
    ["retry-me", null, null, null, null, null, null, null, "failed-run"],
    ["already-delivered", null, null, null, null, null, null, null, "healthy-run"]
  ];
  const sheet = {
    getLastRow: () => 3,
    getRange: () => ({ getValues: () => rows })
  };
  const existing = context.readExistingAlertKeys_({
    getSheetByName: name => name === "ALERT_LOG" ? sheet : null
  });
  assert.equal(existing["retry-me"], undefined);
  assert.equal(existing["already-delivered"], true);
  context.readFailedAlertRunIds_ = original;
});

test("test email is explicit and previews real configured data without mocked content", () => {
  const events = [{
    severity: "WARNING", type: "RATING_DROP_YTD", platform: "iOS", countryCode: "CO",
    country: "Colombia", recipients: "felix.delbarrio@bbva.com", isTest: true,
    testId: "COM-20260720-141500-ABCD1234", metricValue: 0.4, threshold: 0.3,
    baselineRating: 4.82, currentRating: 4.42, baselineDate: "2026-01-02",
    currentDate: "2026-07-20", appName: "BBVA", detail: "Caída real"
  }];
  const html = context.renderMarketsAlertEmail_(events, "felix.delbarrio@bbva.com");
  assert.match(html, /PRUEBA DE CANAL/);
  assert.match(html, /Vista previa · datos reales/);
  assert.match(html, /BBVA Colombia cae 0,40 puntos/);
  assert.match(html, /Rating anterior/);
  assert.match(html, /4,82/);
  assert.match(html, /4,42/);
  assert.doesNotMatch(html, /SIMULADO|BBVA Colombia cae 0,40 puntos.*EJEMPLO/s);
  assert.doesNotMatch(html, /Markets Data Studio/i);
  const text = context.renderMarketsAlertPlainText_(events, "felix.delbarrio@bbva.com");
  assert.match(text, /MARKET PULSE/);
  assert.match(text, /BBVA Banca de Empresas e Instituciones/);
  assert.match(text, /último cierre real/i);
  assert.match(text, /BBVA Colombia cae 0,40 puntos/);
});

test("the scheduled engine processes every active subscriber without a connected Session", () => {
  const original = {
    readAll: context.readAllMarketsAlertPreferences_,
    readExisting: context.readExistingAlertKeys_, drops: context.buildRatingDropAlerts_,
    crossovers: context.buildCompetitiveCrossoverAlerts_, append: context.appendAlertEvents_,
    send: context.sendAlertEmails_
  };
  const users = [preferences(), preferences({ email: "ana.ejemplo@bbva.com" })];
  users[1].email = "ana.ejemplo@bbva.com";
  context.readAllMarketsAlertPreferences_ = () => users;
  context.readExistingAlertKeys_ = () => ({});
  context.buildRatingDropAlerts_ = (_ratings, referenceDate, pref) => [{
    timestamp: new Date(), eventKey: `YTD|${pref.email}`, referenceDate,
    platform: "iOS", countryCode: "CO", type: "RATING_DROP_YTD", severity: "WARNING",
    detail: "test", recipients: pref.email, userEmail: pref.email, ruleId: "YTD_DROP",
    metricValue: 0.4, threshold: 0.3, appKey: "IOS|CO|BBVA", direction: "DOWN", source: "TEST"
  }];
  context.buildCompetitiveCrossoverAlerts_ = () => [];
  context.appendAlertEvents_ = () => {};
  context.sendAlertEmails_ = events => {
    events.deliveredRecipients = [...new Set(events.map(event => event.recipients))];
    return events.deliveredRecipients.length;
  };
  const result = context.buildAndProcessAlerts_({}, new Date(2026, 6, 20, 12), [], "run", { SEND_ALERT_EMAILS: true }, []);
  assert.equal(result.length, 2);
  assert.equal(result.subscriberCount, 2);
  assert.equal(result.deliveryCount, 2);
  assert.equal(result.deliveryStatus, "DELIVERED");
  Object.assign(context, {
    readAllMarketsAlertPreferences_: original.readAll,
    readExistingAlertKeys_: original.readExisting, buildRatingDropAlerts_: original.drops,
    buildCompetitiveCrossoverAlerts_: original.crossovers, appendAlertEvents_: original.append,
    sendAlertEmails_: original.send
  });
});

test("a Gmail authorization failure does not audit undelivered events or abort the data run", () => {
  const original = {
    readAll: context.readAllMarketsAlertPreferences_,
    readExisting: context.readExistingAlertKeys_, drops: context.buildRatingDropAlerts_,
    crossovers: context.buildCompetitiveCrossoverAlerts_, append: context.appendAlertEvents_,
    send: context.sendAlertEmails_
  };
  let appended = null;
  context.readAllMarketsAlertPreferences_ = () => [preferences()];
  context.readExistingAlertKeys_ = () => ({});
  context.buildRatingDropAlerts_ = (_ratings, referenceDate, pref) => [{
    timestamp: new Date(), eventKey: "YTD|pending", referenceDate,
    platform: "iOS", countryCode: "CO", type: "RATING_DROP_YTD", severity: "WARNING",
    detail: "test", recipients: pref.email, userEmail: pref.email, ruleId: "YTD_DROP",
    metricValue: 0.4, threshold: 0.3, appKey: "IOS|CO|BBVA", direction: "DOWN", source: "TEST"
  }];
  context.buildCompetitiveCrossoverAlerts_ = () => [];
  context.appendAlertEvents_ = (_ss, events) => { appended = events; };
  context.sendAlertEmails_ = () => { throw new Error("gmail.settings.basic no autorizado"); };

  const result = context.buildAndProcessAlerts_({}, new Date(2026, 6, 22, 12), [], "run", { SEND_ALERT_EMAILS: true }, []);
  assert.equal(result.length, 1);
  assert.equal(result.deliveryCount, 0);
  assert.equal(result.deliveryStatus, "ERROR");
  assert.match(result.deliveryDetail, /gmail\.settings\.basic/);
  assert.equal(appended, null);

  Object.assign(context, {
    readAllMarketsAlertPreferences_: original.readAll,
    readExistingAlertKeys_: original.readExisting, buildRatingDropAlerts_: original.drops,
    buildCompetitiveCrossoverAlerts_: original.crossovers, appendAlertEvents_: original.append,
    sendAlertEmails_: original.send
  });
});

test("the alert center validates only the sheets it consumes", () => {
  const checked = [];
  context.currentMarketsUserEmail_ = () => "felix.delbarrio@bbva.com";
  context.openMarketsSpreadsheet_ = () => ({ id: "sheet" });
  context.requireCurrentSheetContract_ = (_ss, name) => { checked.push(name); };
  context.readControl_ = () => ({ SEND_ALERT_EMAILS: true });
  context.registerOrTouchMarketsAlertUser_ = (_ss, email) => preferences({ email });
  context.readRecentMarketsAlertEventsForUser_ = () => [];
  const result = context.getMarketsAlertPreferences();
  assert.equal(result.user.email, "felix.delbarrio@bbva.com");
  assert.deepEqual(checked, ["CONTROL", "ALERT_SUBSCRIPTIONS", "ALERT_LOG"]);
  assert.equal(checked.includes("RUN_LOG"), false);
});
