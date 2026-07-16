import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const ROOT = "/Users/u517055/Documents/01.Development/01.Commercial/01.GenAi/markets";
const PROJECT = path.join(ROOT, "Markets");
const OUTPUT_DIR = path.join(PROJECT, "outputs", "019f6ac2");
const PREVIEW_DIR = path.join(PROJECT, ".work", "final_previews");
const OUTPUT = path.join(OUTPUT_DIR, "MARKETS_RATINGS_MASTER.xlsx");
const NOW = new Date("2026-07-16T12:00:00+02:00");
const COUNTRIES = { ES: "Spain", AR: "Argentina", PE: "Peru", CO: "Colombia", UY: "Uruguay", MX: "Mexico", TR: "Turkey" };
const COUNTRY_ALIASES = {
  es: "ES", spain: "ES", españa: "ES", mx: "MX", mexico: "MX", méxico: "MX",
  ar: "AR", argentina: "AR", pe: "PE", peru: "PE", perú: "PE", co: "CO", colombia: "CO",
  uy: "UY", uruguay: "UY", tr: "TR", turkey: "TR", turquia: "TR", türkiye: "TR"
};

const android = {
  ES: { BBVA: "com.bbva.GEMA.global", "Santander Empresas": "es.bancosantander.empresas", "CaixaBank (Now)": "es.lacaixa.mobile.android.newwapicon", Sabadell: "net.inverline.bancosabadell.officelocator.android", "Bankinter Empresas": "com.bankinter.empresas" },
  AR: { BBVA: "com.bbva.GEMA.global", "Santander Argentina Empresas": "com.mobilenik.bsre", "Galicia Office - Empresas": "com.galicia.otp", "Macro Empresas": "ar.macro.companies", "BNA+ Empresas (Banco Nación)": "ar.com.bna.digital" },
  PE: { BBVA: "com.bbva.GEMA.global", "BCP Telecrédito Móvil (Empresas)": "com.bcp.bank.tlc", "Interbank Empresas": "pe.interbank.bie", "Scotiabank Telebanking móvil": "com.scotiabank.telebankingapp", "BanBif Empresas": "com.banbifbancaempresasapp" },
  CO: { BBVA: "com.bbva.GEMA.global", "Bancolombia Empresas": "com.todo1.mobile.bancolombiaempresas", "Banco de Bogotá App Negocios": "co.com.ath.bbog.icbs", "Davivienda Móvil Empresas": "com.davivienda.nuevaappemp", "Banco de Occidente Empresas": "co.com.ath.bocc.qa.icbs" },
  UY: { BBVA: "com.bbva.GEMA.global", "Santander Empresas Uruguay": "uy.bancosantander.empresas", "Itaú Empresas Uruguay": "com.uy.itau.appile", "BROU (eBROU)": "uy.brou", "Scotiabank Uruguay (Scotia Móvil)": "com.ingsw.scotiabankapp" },
  MX: { BBVA: "com.bbva.GEMA", "Santander México": "es.bancosantander.empresas", "Banorte Móvil": "com.banorte.debitoempresarial", Citibanamex: "com.citibanamex.bnemobile", "HSBC México": "com.htsu.hsbcpersonalbanking", Banbajio: "mx.com.bb.b2" },
  TR: { BBVA: "com.garanti.cepsubesi", "Isbank Commercial": "com.pozitron.iscep", "Akbank Kurumsal": "com.akbank.android.apps.akbank_direkt", "Yapi Kredi Kurumsal": "com.ykb.android", "Halkbank Kobi": "com.tmobtech.halkbank" }
};
const ios = {
  ES: { BBVA: "1590189082", "Santander Empresas": "976662821", "CaixaBank (Now)": "318806094", Sabadell: "347887638", "Bankinter Empresas": "1209986220" },
  AR: { BBVA: "1590189082", "Santander Argentina Empresas": "1379032757", "Galicia Office - Empresas": "1101862517", "Macro Empresas": "1465765093", "BNA+ Empresas (Banco Nación)": "6446181557" },
  PE: { BBVA: "1590189082", "BCP Telecrédito Móvil (Empresas)": "1128014919", "Interbank Empresas": "1460901367", "Scotiabank Telebanking móvil": "1349348943", "BanBif Empresas": "1270782715" },
  CO: { BBVA: "1590189082", "Bancolombia Empresas": "1110912115", "Banco de Bogotá App Negocios": "6447528295", "Davivienda Móvil Empresas": "1609083736", "Banco de Occidente Empresas": "1669513149" },
  UY: { BBVA: "1590189082", "Santander Empresas Uruguay": "6444013090", "Itaú Empresas Uruguay": "1593750012", "BROU (eBROU)": "841015703", "Scotiabank Uruguay (Scotia Móvil)": "920063972" },
  MX: { BBVA: "1459550683", "Santander México": "976662821", "Banorte Móvil": "374817863", Citibanamex: "498483038", "HSBC México": "1453854471" },
  TR: { BBVA: "521117624", "Isbank Commercial": "308261752", "Akbank Kurumsal": "560516360", "Yapi Kredi Kurumsal": "458627086", "Halkbank Kobi": "1068841746" }
};
const huaweiPackages = structuredClone(android);
huaweiPackages.MX = { BBVA: "com.bbva.GEMA", "Santander Enlace Móvil": "com.santander.enlace.BET", "Banorte BEM Móvil": "com.banorte.bem.movil", Citibanamex: "com.citibanamex.bnemobile", "HSBCnet Mobile": "com.hsbc.hsbcnet" };
const huaweiIds = {
  ES: { BBVA: "C107096081", "Santander Empresas": "C1776910280123540416", "CaixaBank (Now)": "C1883609377047316224", Sabadell: "C101724415", "Bankinter Empresas": "C1763035834187020992" },
  AR: { BBVA: "C107096081", "Santander Argentina Empresas": "C1747172361632750976", "Galicia Office - Empresas": "C1747857351202839936", "Macro Empresas": "C1765423965733419712", "BNA+ Empresas (Banco Nación)": "C1765425502081809088" },
  PE: { BBVA: "C107096081", "BCP Telecrédito Móvil (Empresas)": "C1747250251728690560", "Interbank Empresas": "C108909667", "Scotiabank Telebanking móvil": "C1757371865711574080", "BanBif Empresas": "C104319915" },
  CO: { BBVA: "C107096081", "Bancolombia Empresas": "C101776669", "Banco de Bogotá App Negocios": "C1742746109459057472", "Davivienda Móvil Empresas": "C1742815584673876800", "Banco de Occidente Empresas": "C1744932457712470848" },
  UY: { BBVA: "C107096081", "Santander Empresas Uruguay": "C1752237776025165184", "Itaú Empresas Uruguay": "C1756474807509122112", "BROU (eBROU)": "C1742179781857790784", "Scotiabank Uruguay (Scotia Móvil)": "C1752174904272231808" },
  MX: { BBVA: "C104612895", "Santander Enlace Móvil": "C1776908260733889152", "Banorte BEM Móvil": "C1752158983549885824", Citibanamex: "C1742139806072195904", "HSBCnet Mobile": "C1742764754658675520" },
  TR: { BBVA: "C102941853", "Isbank Commercial": "C101265343", "Akbank Kurumsal": "C101317445", "Yapi Kredi Kurumsal": "C101430581", "Halkbank Kobi": "C101617173" }
};

function cleanKey(value) { return String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
function appKey(platform, country, name) { return [platform, country, name].map(v => String(v).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "")).join("|"); }
function ratingKey(date, key) { return `${date.toISOString().slice(0, 10)}|${key}`; }
function excelDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value) && value > 20000) return new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000));
  if (typeof value === "string" && value && value !== "NaT") { const parsed = new Date(value); if (!Number.isNaN(parsed.getTime())) return parsed; }
  return null;
}
function rating(value) { const n = Number(value); return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n * 100) / 100 : null; }
function count(value) { if (value === null || value === undefined || String(value).trim() === "") return null; const n = Number(value); return Number.isFinite(n) && n >= 0 ? Math.round(n) : null; }
function versionString(value) { if (value === null || value === undefined) return ""; if (typeof value === "number" && value > 20000) return ""; return String(value).trim(); }
function countryCode(value) { const normalized = String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); return COUNTRY_ALIASES[normalized] ?? normalized.toUpperCase(); }
function localeFor(country) { return country === "TR" ? "tr_TR" : `es_${country}`; }
function huaweiLegacyName(country, name) {
  if (country !== "MX") return name;
  return ({ "Santander México": "Santander Enlace Móvil", "Banorte Móvil": "Banorte BEM Móvil", "HSBC México": "HSBCnet Mobile" })[name] ?? name;
}

function buildCatalog() {
  const rows = [];
  const add = (platform, store, country, name, id, pkg) => rows.push({
    appKey: appKey(platform, country, name), platform, store, countryCode: country, country: COUNTRIES[country], appName: name,
    appId: id ?? "", packageName: pkg ?? "", isBbva: name === "BBVA", enabled: true,
    locale: platform === "Huawei" ? localeFor(country) : (country === "TR" ? "tr" : "es"),
    recipients: "felix.delbarrio@bbva.com", warningDrop: 0.3, criticalDrop: 0.5, minObservations: 5, competitorAlerts: true
  });
  for (const [country, apps] of Object.entries(android)) for (const [name, pkg] of Object.entries(apps)) add("Android", "Google Play", country, name, pkg, pkg);
  for (const [country, apps] of Object.entries(ios)) for (const [name, id] of Object.entries(apps)) add("iOS", "App Store", country, name, id, "");
  for (const [country, apps] of Object.entries(huaweiPackages)) for (const [name, pkg] of Object.entries(apps)) add("Huawei", "Huawei AppGallery", country, name, huaweiIds[country][name], pkg);
  return rows;
}

const catalog = buildCatalog();
const catalogLookup = new Map(catalog.map(row => [`${row.platform}|${row.countryCode}|${cleanKey(row.appName)}`, row]));
const sources = {
  Android: path.join(ROOT, "Android Market", "ANDROID_RATINGS_COMMERCIAL.xlsx"),
  Huawei: path.join(ROOT, "Huawei Market", "Huawei_RATINGS_COMMERCIAL.xlsx"),
  iOS: path.join(ROOT, "iOS Market", "iOS_RATINGS_COMMERCIAL.xlsx")
};
const workbooks = {};
for (const [platform, file] of Object.entries(sources)) workbooks[platform] = await SpreadsheetFile.importXlsx(await FileBlob.load(file));

function extractRatings(platform, wb) {
  const out = [];
  for (const country of Object.keys(COUNTRIES)) {
    const sheet = wb.worksheets.items.find(item => item.name === country);
    if (!sheet) continue;
    const values = sheet.getUsedRange(true)?.values ?? [];
    if (values.length < 2) continue;
    const headers = values[0].map(value => String(value ?? "").trim());
    const indexes = new Map(headers.map((header, index) => [cleanKey(header), index]));
    const dateIndex = indexes.get("fecha") ?? 0;
    const countIndex = indexes.get("bbva_num_ratings");
    const idIndex = indexes.get("bbva_app_id") ?? indexes.get("bbva_package");
    for (const row of values.slice(1)) {
      const date = excelDate(row[dateIndex]);
      if (!date) continue;
      for (let col = 0; col < headers.length; col += 1) {
        const normalized = cleanKey(headers[col]);
        if (col === dateIndex || normalized.includes("package") || normalized.includes("app_id") || normalized.includes("num_ratings")) continue;
        const observedRating = rating(row[col]);
        if (observedRating === null) continue;
        let name = headers[col];
        if (platform === "Huawei") name = huaweiLegacyName(country, name);
        const app = catalogLookup.get(`${platform}|${country}|${cleanKey(name)}`);
        if (!app) throw new Error(`Catalog mapping missing: ${platform}/${country}/${name}`);
        const observedId = name === "BBVA" && idIndex !== undefined && row[idIndex] ? String(row[idIndex]) : app.appId;
        out.push({
          recordKey: ratingKey(date, app.appKey), observedDate: date, year: date.getUTCFullYear(), yearMonth: date.toISOString().slice(0, 7),
          platform, store: app.store, countryCode: country, country: COUNTRIES[country], appKey: app.appKey, appName: name,
          appId: observedId || app.packageName, isBbva: name === "BBVA", rating: observedRating,
          ratingCount: name === "BBVA" && countIndex !== undefined ? count(row[countIndex]) : null,
          ranking: null, previous30: null, delta30: null, isLatest: false,
          source: `${path.basename(sources[platform])}:${country}`, ingestedAt: NOW
        });
      }
    }
  }
  return out;
}

function enrichRatings(rows) {
  const snapshots = new Map();
  const series = new Map();
  for (const row of rows) {
    const snapshotKey = `${row.platform}|${row.countryCode}|${row.observedDate.toISOString().slice(0, 10)}`;
    if (!snapshots.has(snapshotKey)) snapshots.set(snapshotKey, []);
    snapshots.get(snapshotKey).push(row);
    if (!series.has(row.appKey)) series.set(row.appKey, []);
    series.get(row.appKey).push(row);
  }
  for (const group of snapshots.values()) for (const row of group) row.ranking = 1 + group.filter(other => other.rating > row.rating).length;
  for (const appRows of series.values()) {
    appRows.sort((a, b) => a.observedDate - b.observedDate);
    const maxDate = appRows.at(-1).observedDate.getTime();
    for (const row of appRows) {
      const target = row.observedDate.getTime() - 30 * 86400000;
      let previous = null;
      let low = 0, high = appRows.length - 1;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (appRows[middle].observedDate.getTime() <= target) { previous = appRows[middle].rating; low = middle + 1; } else high = middle - 1;
      }
      row.previous30 = previous;
      row.delta30 = previous === null ? null : Math.round((row.rating - previous) * 100) / 100;
      row.isLatest = row.observedDate.getTime() === maxDate;
    }
  }
  return rows.sort((a, b) => a.observedDate - b.observedDate || a.platform.localeCompare(b.platform) || a.countryCode.localeCompare(b.countryCode) || a.appName.localeCompare(b.appName));
}

function extractReviews(platform, wb) {
  const selectedSheets = platform === "Android" ? ["REVIEWS", "GET_OPINION"] : platform === "iOS" ? ["GET_OPINION"] : [];
  const byId = new Map();
  for (const sheetName of selectedSheets) {
    const sheet = wb.worksheets.items.find(item => item.name === sheetName);
    if (!sheet) continue;
    const values = sheet.getUsedRange(true)?.values ?? [];
    if (values.length < 2) continue;
    const headers = values[0].map(cleanKey);
    const idx = Object.fromEntries(headers.map((header, index) => [header, index]));
    for (const row of values.slice(1)) {
      const reviewId = String(row[idx.reviewid] ?? "").trim();
      if (!reviewId) continue;
      const reviewDate = excelDate(row[idx.at]);
      const code = countryCode(row[idx.country]);
      if (!COUNTRIES[code]) continue;
      const app = catalog.find(item => item.platform === platform && item.countryCode === code && item.isBbva);
      if (!app) continue;
      const star = rating(row[idx.score]);
      if (!reviewDate || star === null) continue;
      const review = {
        reviewKey: `${platform}|${reviewId}`, reviewId, reviewDate, yearMonth: reviewDate.toISOString().slice(0, 7),
        platform, store: app.store, countryCode: code, country: COUNTRIES[code], appKey: app.appKey, appName: "BBVA",
        appVersion: versionString(row[idx.appversion] ?? row[idx.reviewcreatedversion]), starRating: star,
        title: String(row[idx.title] ?? "").trim(), reviewText: String(row[idx.content] ?? "").trim(),
        userName: String(row[idx.username] ?? "").trim(), thumbsUp: count(row[idx.thumbsupcount]),
        replyText: String(row[idx.replycontent] ?? "").trim(), replyDate: excelDate(row[idx.repliedat]), topics: "",
        source: `${path.basename(sources[platform])}:${sheetName}`
      };
      byId.set(review.reviewKey, review);
    }
  }
  return [...byId.values()];
}

function extractLegacyAlerts(platform, wb) {
  const sheet = wb.worksheets.items.find(item => item.name === "Alert Log");
  const values = sheet?.getUsedRange(true)?.values ?? [];
  if (values.length < 2) return [];
  const idx = Object.fromEntries(values[0].map((header, index) => [cleanKey(header), index]));
  return values.slice(1).map((row, index) => {
    const timestamp = excelDate(row[idx.timestamp]);
    const referenceDate = excelDate(row[idx.fecha_row]);
    const delta = Number(row[idx.delta]);
    const code = countryCode(row[idx.pais]);
    if (!timestamp || !referenceDate || !COUNTRIES[code]) return null;
    return [timestamp, `LEGACY|${platform}|${index + 2}|${timestamp.toISOString()}`, referenceDate, platform, code,
      "LEGACY_RATING_CHANGE", Math.abs(delta) >= 0.5 ? "CRITICAL" : Math.abs(delta) >= 0.3 ? "WARNING" : "INFO",
      `BBVA ${row[idx.rating_anterior]} -> ${row[idx.rating_nuevo]} (${delta})`, "", "LEGACY_MIGRATION", `${path.basename(sources[platform])}:Alert Log`];
  }).filter(Boolean);
}

const ratingMap = new Map();
for (const [platform, wb] of Object.entries(workbooks)) for (const row of extractRatings(platform, wb)) ratingMap.set(row.recordKey, row);
const ratings = enrichRatings([...ratingMap.values()]);
const reviewMap = new Map();
for (const platform of ["Android", "iOS"]) for (const row of extractReviews(platform, workbooks[platform])) reviewMap.set(row.reviewKey, row);
const reviews = [...reviewMap.values()].sort((a, b) => a.reviewDate - b.reviewDate || a.reviewKey.localeCompare(b.reviewKey));
const alerts = [...extractLegacyAlerts("Android", workbooks.Android), ...extractLegacyAlerts("iOS", workbooks.iOS)].sort((a, b) => a[0] - b[0]);

const wb = Workbook.create();
const controlSheet = wb.worksheets.add("CONTROL");
const catalogSheet = wb.worksheets.add("APP_CATALOG");
const ratingsSheet = wb.worksheets.add("RATINGS");
const reviewsSheet = wb.worksheets.add("REVIEWS");
const alertsSheet = wb.worksheets.add("ALERT_LOG");
const runsSheet = wb.worksheets.add("RUN_LOG");

const headers = {
  CONTROL: ["PARAMETER", "VALUE", "DESCRIPTION"],
  APP_CATALOG: ["APP_KEY", "PLATFORM", "STORE", "COUNTRY_CODE", "COUNTRY", "APP_NAME", "APP_ID", "PACKAGE_NAME", "IS_BBVA", "ENABLED", "LOCALE", "ALERT_RECIPIENTS", "WARNING_DROP", "CRITICAL_DROP", "MIN_OBSERVATIONS_7D", "COMPETITOR_ALERTS"],
  RATINGS: ["RECORD_KEY", "OBSERVED_DATE", "YEAR", "YEAR_MONTH", "PLATFORM", "STORE", "COUNTRY_CODE", "COUNTRY", "APP_KEY", "APP_NAME", "APP_ID", "IS_BBVA", "RATING", "RATING_COUNT", "RANKING", "PREVIOUS_RATING_30D", "DELTA_30D", "IS_LATEST", "SOURCE", "INGESTED_AT"],
  REVIEWS: ["REVIEW_KEY", "REVIEW_ID", "REVIEW_DATE", "YEAR_MONTH", "PLATFORM", "STORE", "COUNTRY_CODE", "COUNTRY", "APP_KEY", "APP_NAME", "APP_VERSION", "STAR_RATING", "TITLE", "REVIEW_TEXT", "USER_NAME", "THUMBS_UP_COUNT", "REPLY_TEXT", "REPLY_DATE", "TOPICS", "SOURCE"],
  ALERT_LOG: ["TIMESTAMP", "EVENT_KEY", "REFERENCE_DATE", "PLATFORM", "COUNTRY_CODE", "TYPE", "SEVERITY", "DETAIL", "RECIPIENTS", "RUN_ID", "SOURCE"],
  RUN_LOG: ["STARTED_AT", "RUN_ID", "STATUS", "APPS_TOTAL", "APPS_OK", "APPS_NO_RATING", "APPS_ERROR", "ROWS_UPSERTED", "ALERTS_CREATED", "DURATION_MS", "DETAIL"]
};

const controlRows = [
  ["CODE_VERSION", "2026.07.16.1", "Version del contrato de datos y del Apps Script"],
  ["TIME_ZONE", "Europe/Madrid", "Zona horaria de ejecucion y fechas"],
  ["RUN_HOUR", 7, "Hora local del trigger diario"], ["RUN_MINUTE", 5, "Minuto aproximado del trigger diario"],
  ["SEND_ALERT_EMAILS", false, "Mantener FALSE durante la validacion inicial"], ["RATING_LOOKBACK_DAYS", 30, "Ventana para DELTA_30D"],
  ["TARGET_SPREADSHEET_ID", "1IkJgvM2imxm3r1x092q5dqpThrlnDoZ-5QvH8n2h2oQ", "Google Sheet maestro"],
  ["MIGRATED_RATING_ROWS", ratings.length, "Filas historicas unicas migradas"], ["MIGRATED_REVIEW_ROWS", reviews.length, "Resenas historicas unicas migradas"],
  ["MIGRATION_DATE", NOW, "Fecha de construccion del libro maestro"]
];
const catalogRows = catalog.map(r => [r.appKey, r.platform, r.store, r.countryCode, r.country, r.appName, r.appId, r.packageName, r.isBbva, r.enabled, r.locale, r.recipients, r.warningDrop, r.criticalDrop, r.minObservations, r.competitorAlerts]);
const ratingRows = ratings.map(r => [r.recordKey, r.observedDate, r.year, r.yearMonth, r.platform, r.store, r.countryCode, r.country, r.appKey, r.appName, r.appId, r.isBbva, r.rating, r.ratingCount ?? "", r.ranking, r.previous30 ?? "", r.delta30 ?? "", r.isLatest, r.source, r.ingestedAt]);
const reviewRows = reviews.map(r => [r.reviewKey, r.reviewId, r.reviewDate, r.yearMonth, r.platform, r.store, r.countryCode, r.country, r.appKey, r.appName, r.appVersion, r.starRating, r.title, r.reviewText, r.userName, r.thumbsUp ?? "", r.replyText, r.replyDate ?? "", r.topics, r.source]);
const runRows = [[NOW, "MIGRATION-20260716", "MIGRATED", catalog.length, "", "", "", ratings.length, alerts.length, "", `Android+iOS+Huawei; ${reviews.length} resenas`]];

function writeSheet(sheet, header, rows) {
  sheet.getRangeByIndexes(0, 0, 1, header.length).values = [header];
  if (rows.length) sheet.getRangeByIndexes(1, 0, rows.length, header.length).values = rows;
  sheet.freezePanes.freezeRows(1);
  sheet.showGridLines = false;
  sheet.getRangeByIndexes(0, 0, 1, header.length).format = {
    fill: "#004481", font: { bold: true, color: "#FFFFFF", size: 10 },
    horizontalAlignment: "center", verticalAlignment: "center", wrapText: true,
    borders: { preset: "outside", style: "thin", color: "#004481" }
  };
  sheet.getRangeByIndexes(0, 0, Math.max(2, rows.length + 1), header.length).format.font = { name: "Arial", size: 9, color: "#121212" };
  sheet.getRangeByIndexes(0, 0, 1, header.length).format.font = { name: "Arial", bold: true, size: 10, color: "#FFFFFF" };
  sheet.getRangeByIndexes(0, 0, 1, header.length).format.rowHeightPx = 34;
}
writeSheet(controlSheet, headers.CONTROL, controlRows);
writeSheet(catalogSheet, headers.APP_CATALOG, catalogRows);
writeSheet(ratingsSheet, headers.RATINGS, ratingRows);
writeSheet(reviewsSheet, headers.REVIEWS, reviewRows);
writeSheet(alertsSheet, headers.ALERT_LOG, alerts);
writeSheet(runsSheet, headers.RUN_LOG, runRows);

controlSheet.getRange("B2:B11").format.wrapText = true;
controlSheet.getRange("C2:C11").format.wrapText = true;
controlSheet.getRange("A1:A11").format.columnWidthPx = 190; controlSheet.getRange("B1:B11").format.columnWidthPx = 210; controlSheet.getRange("C1:C11").format.columnWidthPx = 420;
catalogSheet.getRange("A1:P120").format.wrapText = false;
for (const [range, width] of [["A:A",250],["B:C",130],["D:E",95],["F:F",230],["G:H",210],["I:J",80],["K:K",90],["L:L",230],["M:N",125],["O:O",170],["P:P",150]]) catalogSheet.getRange(range).format.columnWidthPx = width;
ratingsSheet.getRange("B2:B50000").format.numberFormat = "yyyy-mm-dd"; ratingsSheet.getRange("M2:Q50000").format.numberFormat = "0.00"; ratingsSheet.getRange("T2:T50000").format.numberFormat = "yyyy-mm-dd hh:mm:ss";
for (const [range, width] of [["A:A",300],["B:D",105],["E:H",105],["I:I",280],["J:K",210],["L:L",75],["M:Q",95],["R:R",75],["S:S",270],["T:T",150]]) ratingsSheet.getRange(range).format.columnWidthPx = width;
reviewsSheet.getRange("C2:C10000").format.numberFormat = "yyyy-mm-dd hh:mm:ss"; reviewsSheet.getRange("R2:R10000").format.numberFormat = "yyyy-mm-dd hh:mm:ss";
for (const [range, width] of [["A:B",240],["C:D",135],["E:J",115],["K:L",95],["M:M",180],["N:N",520],["O:O",190],["P:P",90],["Q:Q",420],["R:R",150],["S:S",150],["T:T",250]]) reviewsSheet.getRange(range).format.columnWidthPx = width;
reviewsSheet.getRange(`M2:Q${reviews.length + 1}`).format.wrapText = true;
alertsSheet.getRange("A2:A1000").format.numberFormat = "yyyy-mm-dd hh:mm:ss"; alertsSheet.getRange("C2:C1000").format.numberFormat = "yyyy-mm-dd";
for (const [range, width] of [["A:A",150],["B:B",320],["C:C",110],["D:G",110],["H:H",430],["I:I",210],["J:K",180]]) alertsSheet.getRange(range).format.columnWidthPx = width;
runsSheet.getRange("A2:A1000").format.numberFormat = "yyyy-mm-dd hh:mm:ss";
for (const [range, width] of [["A:A",150],["B:B",170],["C:C",100],["D:J",100],["K:K",420]]) runsSheet.getRange(range).format.columnWidthPx = width;

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.mkdir(PREVIEW_DIR, { recursive: true });
for (const [sheetName, range] of [["CONTROL","A1:C11"],["APP_CATALOG","A1:P35"],["RATINGS","A1:T30"],["REVIEWS","A1:T24"],["ALERT_LOG","A1:K28"],["RUN_LOG","A1:K3"]]) {
  const preview = await wb.render({ sheetName, range, scale: 1.2, format: "png" });
  await fs.writeFile(path.join(PREVIEW_DIR, `${sheetName}.png`), new Uint8Array(await preview.arrayBuffer()));
}
const inspected = await wb.inspect({ kind: "table", range: "RATINGS!A1:T8", include: "values,formulas", tableMaxRows: 8, tableMaxCols: 20, maxChars: 12000 });
const errors = await wb.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 300 }, summary: "final formula error scan" });
const output = await SpreadsheetFile.exportXlsx(wb);
await output.save(OUTPUT);
const report = {
  output: OUTPUT, catalogRows: catalog.length, ratingRows: ratings.length, reviewRows: reviews.length,
  alerts: alerts.length, ratingRowsByPlatform: Object.fromEntries(["Android","iOS","Huawei"].map(p => [p, ratings.filter(r => r.platform === p).length])),
  ratingDateRange: [ratings[0]?.observedDate.toISOString(), ratings.at(-1)?.observedDate.toISOString()],
  reviewDateRange: [reviews[0]?.reviewDate.toISOString(), reviews.at(-1)?.reviewDate.toISOString()],
  inspection: inspected.ndjson, formulaErrors: errors.ndjson
};
await fs.writeFile(path.join(PROJECT, ".work", "migration_report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
