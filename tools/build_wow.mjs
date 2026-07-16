import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const inputPath = process.argv[2] || "/Users/u517055/Downloads/Markets Commercial.xlsx";
const outputDir = process.argv[3] || path.join(root, "outputs", "wow-geography");
const workDir = path.join(root, ".work", "wow-geography");
const outputPath = path.join(outputDir, "Markets_Commercial_WOW.xlsx");
const previewPath = path.join(workDir, "Markets_Commercial_WOW_preview.png");

function normalizeKey(value) { return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
function headersIndex(headers) { return Object.fromEntries(headers.map((h, i) => [normalizeKey(h), i])); }
function dateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && value > 20000) return new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000));
  const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d;
}
function dateKey(value) { const d = dateValue(value); return d ? d.toISOString().slice(0, 10) : ""; }
function monthDate(value) { const key = dateKey(value); return key ? new Date(`${key.slice(0, 7)}-01T12:00:00Z`) : null; }
function numberOrNull(value) { if (value === "" || value === null || value === undefined) return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
function integerOrNull(value) { const n = numberOrNull(value); return n === null || n < 0 ? null : Math.round(n); }
function bool(value, fallback = false) { if (typeof value === "boolean") return value; const s = String(value ?? "").toLowerCase(); return s === "true" || s === "1" || s === "yes" ? true : s === "false" || s === "0" || s === "no" ? false : fallback; }
function cell(row, idx, key) { const i = idx[key]; return i === undefined ? "" : row[i]; }

const sourceFiles = ["src/00_Config.gs", "src/99_Core.gs", "src/35_Dashboard.gs"];
const sandbox = { console, Date, Math, Number, String, Boolean, Array, Object, JSON, isFinite, isNaN };
vm.createContext(sandbox);
vm.runInContext((await Promise.all(sourceFiles.map(f => fs.readFile(path.join(root, f), "utf8")))).join("\n"), sandbox);
const config = sandbox.MARKETS_CONFIG;

const cachePath = path.join(workDir, "source-values.json");
let sourceSheets;
try {
  sourceSheets = JSON.parse(await fs.readFile(cachePath, "utf8"));
  console.log("stage: cache", cachePath);
} catch {
  console.log("stage: import", inputPath);
  const imported = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
  console.log("stage: imported");
  sourceSheets = Object.fromEntries(imported.worksheets.items.map(sheet => [sheet.name, sheet.getUsedRange(true)?.values || []]));
  await fs.mkdir(workDir, { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(sourceSheets));
  console.log("stage: cached");
}
function readSheet(name) {
  const values = sourceSheets[name] || [];
  return { headers: (values[0] || []).map(v => String(v ?? "").trim()), rows: values.slice(1) };
}

const inputCatalog = readSheet("APP_CATALOG");
const inputCatalogIndex = headersIndex(inputCatalog.headers);
const catalogMap = new Map();
for (const row of inputCatalog.rows) {
  const key = String(cell(row, inputCatalogIndex, "app_key") || "").trim();
  if (!key) continue;
  const output = config.headers.catalog.map(header => cell(row, inputCatalogIndex, normalizeKey(header)));
  const idx = headersIndex(config.headers.catalog);
  output[idx.market_segment] ||= "BANK";
  output[idx.dashboard_section] ||= "COUNTRY_BANKS";
  output[idx.competitor_set_version] ||= "2026Q3";
  output[idx.product_scope] ||= "BUSINESS";
  if (key === "ANDROID|MX|BANBAJIO") output[idx.enabled] = false;
  catalogMap.set(key, output);
}
for (const seed of sandbox.MARKETS_CATALOG_SEEDS) if (!catalogMap.has(seed[0])) catalogMap.set(seed[0], Array.from(seed));
const catalogIndex = headersIndex(config.headers.catalog);
const catalogRows = [...catalogMap.values()];
const groupRows = new Map();
for (const row of catalogRows) {
  const group = [row[catalogIndex.platform], row[catalogIndex.country_code], row[catalogIndex.market_segment] || "BANK"].join("|");
  if (!groupRows.has(group)) groupRows.set(group, []);
  groupRows.get(group).push(row);
}
for (const rows of groupRows.values()) {
  rows.sort((a, b) => Number(bool(b[catalogIndex.is_bbva])) - Number(bool(a[catalogIndex.is_bbva])) || String(a[catalogIndex.app_name]).localeCompare(String(b[catalogIndex.app_name])));
  const used = new Set(rows.map(r => integerOrNull(r[catalogIndex.display_order])).filter(v => v !== null));
  let next = 0;
  for (const row of rows) {
    if (integerOrNull(row[catalogIndex.display_order]) !== null) continue;
    if (bool(row[catalogIndex.is_bbva]) && !used.has(0)) row[catalogIndex.display_order] = 0;
    else { while (used.has(next)) next += 1; row[catalogIndex.display_order] = next; }
    used.add(Number(row[catalogIndex.display_order]));
  }
}
catalogRows.sort((a, b) => String(a[catalogIndex.country_code]).localeCompare(String(b[catalogIndex.country_code])) || String(a[catalogIndex.market_segment]).localeCompare(String(b[catalogIndex.market_segment])) || String(a[catalogIndex.platform]).localeCompare(String(b[catalogIndex.platform])) || Number(a[catalogIndex.display_order]) - Number(b[catalogIndex.display_order]));

const catalogObjects = catalogRows.map(row => ({
  appKey: String(row[catalogIndex.app_key]), platform: String(row[catalogIndex.platform]), countryCode: String(row[catalogIndex.country_code]),
  country: String(row[catalogIndex.country]), appName: String(row[catalogIndex.app_name]), isBbva: bool(row[catalogIndex.is_bbva]),
  enabled: bool(row[catalogIndex.enabled], true), marketSegment: String(row[catalogIndex.market_segment] || "BANK"),
  dashboardSection: String(row[catalogIndex.dashboard_section]), competitorSetVersion: String(row[catalogIndex.competitor_set_version]),
  productScope: String(row[catalogIndex.product_scope]), displayOrder: integerOrNull(row[catalogIndex.display_order]),
  countryPlatformWeight: numberOrNull(row[catalogIndex.country_platform_weight]) || 0,
  groupUserWeight: numberOrNull(row[catalogIndex.group_user_weight]) || 0,
  weightSource: String(row[catalogIndex.weight_source] || ""), weightEffectiveDate: dateValue(row[catalogIndex.weight_effective_date])
}));
const enabledCatalog = catalogObjects.filter(a => a.enabled);
const catalogByKey = new Map(enabledCatalog.map(a => [a.appKey, a]));
const expected = new Map();
for (const app of enabledCatalog) {
  const key = `${app.platform}|${app.countryCode}|${app.marketSegment}`;
  expected.set(key, (expected.get(key) || 0) + 1);
}

const inputRatings = readSheet("RATINGS");
const ratingIndex = headersIndex(inputRatings.headers);
const ratingObjects = [];
for (const row of inputRatings.rows) {
  const observedDate = dateValue(cell(row, ratingIndex, "observed_date"));
  const appKey = String(cell(row, ratingIndex, "app_key") || "").trim();
  const rating = numberOrNull(cell(row, ratingIndex, "rating"));
  if (!observedDate || !appKey || rating === null) continue;
  const app = catalogByKey.get(appKey);
  ratingObjects.push({
    recordKey: String(cell(row, ratingIndex, "record_key")), observedDate, yearMonth: dateKey(observedDate).slice(0, 7),
    platform: String(cell(row, ratingIndex, "platform")), store: String(cell(row, ratingIndex, "store")),
    countryCode: String(cell(row, ratingIndex, "country_code")), country: String(cell(row, ratingIndex, "country")),
    appKey, appName: String(cell(row, ratingIndex, "app_name")), appId: String(cell(row, ratingIndex, "app_id")),
    isBbva: bool(cell(row, ratingIndex, "is_bbva")), rating, ratingCount: integerOrNull(cell(row, ratingIndex, "rating_count")),
    ranking: null, previousRating30d: numberOrNull(cell(row, ratingIndex, "previous_rating_30d")),
    delta30d: numberOrNull(cell(row, ratingIndex, "delta_30d")), isLatest: bool(cell(row, ratingIndex, "is_latest")),
    source: String(cell(row, ratingIndex, "source")), ingestedAt: dateValue(cell(row, ratingIndex, "ingested_at")),
    marketSegment: app?.marketSegment || "BANK", displayOrder: app?.displayOrder ?? null,
    rankingExpectedApps: null, rankingObservedApps: null, rankingCoverage: null, rankingIsComplete: false
  });
}
const snapshots = new Map();
for (const item of ratingObjects) {
  if (!catalogByKey.has(item.appKey)) continue;
  const group = `${item.platform}|${item.countryCode}|${item.marketSegment}`;
  const key = `${dateKey(item.observedDate)}|${group}`;
  if (!snapshots.has(key)) snapshots.set(key, { group, items: [] });
  snapshots.get(key).items.push(item);
}
for (const snapshot of snapshots.values()) {
  const expectedApps = expected.get(snapshot.group) || 0;
  const observedApps = snapshot.items.length;
  const complete = expectedApps > 0 && observedApps === expectedApps;
  for (const item of snapshot.items) {
    item.rankingExpectedApps = expectedApps; item.rankingObservedApps = observedApps;
    item.rankingCoverage = expectedApps ? Math.round(observedApps / expectedApps * 100) / 100 : 0;
    item.rankingIsComplete = complete;
    item.ranking = complete ? 1 + snapshot.items.filter(other => other.rating > item.rating).length : null;
  }
}
const ratingRows = ratingObjects.map(item => [item.recordKey, item.observedDate, item.observedDate.getUTCFullYear(), monthDate(item.observedDate),
  item.platform, item.store, item.countryCode, item.country, item.appKey, item.appName, item.appId, item.isBbva,
  item.rating, item.ratingCount ?? "", item.ranking ?? "", item.previousRating30d ?? "", item.delta30d ?? "", item.isLatest,
  item.source, item.ingestedAt || "", item.marketSegment, item.displayOrder ?? "", item.rankingExpectedApps ?? "",
  item.rankingObservedApps ?? "", item.rankingCoverage ?? "", item.rankingIsComplete]);
console.log("stage: ratings", ratingRows.length);

const latestDateKey = ratingObjects.reduce((max, r) => Math.max(max, r.observedDate.getTime()), 0);
const latestDate = new Date(latestDateKey);
const latestIngested = ratingObjects.filter(r => r.observedDate.getTime() === latestDateKey && r.ingestedAt)
  .reduce((max, r) => Math.max(max, r.ingestedAt.getTime()), 0);
const freshCutoff = latestIngested ? latestIngested - 15 * 60 * 1000 : 0;
const freshKeys = new Set(ratingObjects.filter(r => r.observedDate.getTime() === latestDateKey && r.ingestedAt && r.ingestedAt.getTime() >= freshCutoff).map(r => r.appKey));
const staleKeys = new Set(ratingObjects.filter(r => r.observedDate.getTime() === latestDateKey && !freshKeys.has(r.appKey)).map(r => r.appKey));
const legacyEnabled = enabledCatalog.filter(a => !["IT", "DE"].includes(a.countryCode) && !(a.marketSegment !== "BANK"));
const runId = "REFERENCE-WOW-20260716";
const execution = { runId, referenceDate: latestDate, results: legacyEnabled.map(app => ({ app, ok: freshKeys.has(app.appKey), noRating: !freshKeys.has(app.appKey), status: 0 })) };
const scorecards = sandbox.buildScorecardDataset_(ratingObjects, enabledCatalog, execution);
const trends = sandbox.buildMonthlyTrendRows_(ratingObjects, enabledCatalog).map(row => Array.from(row));
const competition = sandbox.buildCompetitionRows_(ratingObjects, enabledCatalog, execution).map(row => Array.from(row));
console.log("stage: materialized", scorecards.rows.length, trends.length, competition.length);
const latestCompetition = competition.filter(row => row[22] === true);
const fetchRows = legacyEnabled.map(app => [runId, latestDate, new Date(latestIngested || latestDateKey), app.appKey, app.platform,
  app.countryCode, app.marketSegment, freshKeys.has(app.appKey) ? "OK" : staleKeys.has(app.appKey) ? "NO_RATING_STALE_RETAINED" : "NO_RATING",
  "", freshKeys.has(app.appKey) ? ratingObjects.find(r => r.appKey === app.appKey && r.observedDate.getTime() === latestDateKey)?.rating ?? "" : "",
  "", false, freshKeys.has(app.appKey) ? "Reconstruido desde INGESTED_AT del ultimo RUN" : "Sin rating fresco en el ultimo RUN",
  "Workbook audit reconstruction"]);

const workbook = Workbook.create();
const summary = workbook.worksheets.add("WOW_README");
const allData = new Map([
  ["CONTROL", readSheet("CONTROL")], ["APP_CATALOG", { headers: Array.from(config.headers.catalog), rows: catalogRows }],
  ["DASHBOARD_KPIS", { headers: Array.from(scorecards.headers), rows: scorecards.rows.map(row => Array.from(row)) }],
  ["DASHBOARD_COMPETITION", { headers: Array.from(config.headers.competition), rows: latestCompetition }],
  ["DASHBOARD_TRENDS", { headers: Array.from(config.headers.trends), rows: trends }],
  ["FETCH_LOG", { headers: Array.from(config.headers.fetchLog), rows: fetchRows }]
]);
const control = allData.get("CONTROL");
const ci = headersIndex(control.headers);
for (const row of control.rows) if (String(cell(row, ci, "parameter")) === "CODE_VERSION") row[ci.value] = config.codeVersion;
for (const row of [["REQUIRE_COMPLETE_RANKING", true, "Ranking visible solo con cobertura completa"], ["REQUIRE_WEIGHT_SOURCE", true, "Consolidados solo con pesos trazables"]])
  if (!control.rows.some(r => r[ci.parameter] === row[0])) control.rows.push(row);

const writeTable = (sheet, headers, rows) => {
  if (!headers.length) return;
  sheet.showGridLines = false; sheet.freezePanes.freezeRows(1);
  sheet.getRangeByIndexes(0, 0, 1, headers.length).values = [headers];
  if (rows.length) sheet.getRangeByIndexes(1, 0, rows.length, headers.length).values = rows;
  const used = sheet.getRangeByIndexes(0, 0, Math.max(1, rows.length + 1), headers.length);
  sheet.getRangeByIndexes(0, 0, 1, headers.length).format = { fill: "#004481", font: { name: "Arial", size: 9, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true };
  sheet.getRangeByIndexes(0, 0, 1, headers.length).format.rowHeightPx = 34;
  for (let c = 0; c < headers.length; c += 1) {
    const px = Math.min(190, Math.max(76, String(headers[c]).length * 7 + 20));
    sheet.getRangeByIndexes(0, c, Math.max(1, rows.length + 1), 1).format.columnWidthPx = px;
  }
};
for (const [name, data] of allData) {
  console.log("stage: write", name, data.rows.length, data.headers.length);
  const sheet = workbook.worksheets.add(name);
  writeTable(sheet, data.headers, data.rows);
  const idx = headersIndex(data.headers);
  for (const [key, format] of [["observed_date", "yyyy-mm-dd"], ["reference_date", "yyyy-mm-dd"], ["period_month", "yyyy-mm-dd"], ["year_month", "yyyy-mm"], ["ingested_at", "yyyy-mm-dd hh:mm:ss"], ["fetched_at", "yyyy-mm-dd hh:mm:ss"], ["started_at", "yyyy-mm-dd hh:mm:ss"]])
    if (idx[key] !== undefined && data.rows.length) sheet.getRangeByIndexes(1, idx[key], data.rows.length, 1).format.numberFormat = format;
}

const countries = [...new Set(enabledCatalog.filter(a => a.marketSegment === "BANK").map(a => a.countryCode))].sort();
const incomplete = ratingObjects.filter(r => r.observedDate.getTime() === latestDateKey && !r.rankingIsComplete).length;
summary.showGridLines = false; summary.getRange("A1:H1").merge(); summary.getRange("A1").values = [["MARKETS COMMERCIAL · DATA PRODUCT WOW"]];
summary.getRange("A1:H1").format = { fill: "#004481", font: { name: "Arial", size: 18, bold: true, color: "#FFFFFF" }, verticalAlignment: "center" };
summary.getRange("A1:H1").format.rowHeightPx = 48;
summary.getRange("A3:B10").values = [
  ["Contrato", config.codeVersion], ["Geografias PDF", `${countries.length}/10 · ${countries.join(", ")}`],
  ["Apps habilitadas", enabledCatalog.length], ["Ratings historicos", ratingObjects.length],
  ["Tendencias mensuales", trends.length], ["Competencia actual", latestCompetition.length],
  ["Apps frescas ultimo RUN", freshKeys.size], ["Rankings suprimidos por cobertura", incomplete]
];
summary.getRange("A3:A10").format = { fill: "#E9F2FA", font: { bold: true, color: "#004481" } };
summary.getRange("D3:H3").merge(); summary.getRange("D3").values = [["LISTO PARA LOOKER STUDIO"]];
summary.getRange("D3:H3").format = { fill: "#2DCCCD", font: { bold: true, color: "#072146" }, horizontalAlignment: "center" };
summary.getRange("D5:H10").values = [
  ["✓", "DASHBOARD_KPIS", "Scorecards directos, sin filtros de chart", "", ""],
  ["✓", "DASHBOARD_COMPETITION", "Ranking, segmentos y cobertura", "", ""],
  ["✓", "DASHBOARD_TRENDS", "Mes normalizado desde OBSERVED_DATE", "", ""],
  ["✓", "FETCH_LOG", "Frescura y estado por app/RUN", "", ""],
  ["✓", "APP_CATALOG", "Italia, Alemania, fintechs y neobancos", "", ""],
  ["!", "Pesos consolidados", "En blanco hasta informar fuente y fecha efectiva", "", ""]
];
summary.getRange("D5:D9").format = { fill: "#D8F7F7", font: { bold: true, color: "#00847A" }, horizontalAlignment: "center" };
summary.getRange("D10").format = { fill: "#FFF4CC", font: { bold: true, color: "#B56B00" }, horizontalAlignment: "center" };
summary.getRange("A12:H12").merge(); summary.getRange("A12").values = [["Nota: FETCH_LOG se reconstruye para el ultimo RUN a partir de INGESTED_AT. Las apps nuevas se activan en el siguiente RUN real del Apps Script."]];
summary.getRange("A12:H12").format = { fill: "#F4F5F6", font: { italic: true, color: "#4B5563" }, wrapText: true };
summary.getRange("A:A").format.columnWidthPx = 255; summary.getRange("B:B").format.columnWidthPx = 300;
summary.getRange("C:C").format.columnWidthPx = 24; summary.getRange("D:D").format.columnWidthPx = 42;
summary.getRange("E:E").format.columnWidthPx = 200; summary.getRange("F:H").format.columnWidthPx = 130;
summary.freezePanes.freezeRows(1);

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(workDir, { recursive: true });
console.log("stage: render");
const preview = await workbook.render({ sheetName: "WOW_README", autoCrop: "all", scale: 1, format: "png" });
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
const file = await SpreadsheetFile.exportXlsx(workbook);
console.log("stage: export");
await file.save(outputPath);
console.log(JSON.stringify({ outputPath, previewPath, countries, enabledApps: enabledCatalog.length, ratings: ratingObjects.length,
  scorecardRows: scorecards.rows.length, competitionRows: latestCompetition.length, trendRows: trends.length,
  freshApps: freshKeys.size, sheets: workbook.worksheets.items.map(sheet => sheet.name) }, null, 2));
