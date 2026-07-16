import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import fs from "node:fs/promises";
import path from "node:path";

const file = process.argv[2];
if (!file) throw new Error("Usage: node tools/verify_wow.mjs <xlsx>");
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const read = name => {
  const sheet = wb.worksheets.items.find(s => s.name === name);
  if (!sheet) throw new Error(`Missing sheet ${name}`);
  const values = sheet.getUsedRange(true)?.values || [];
  return { headers: values[0].map(String), rows: values.slice(1) };
};
const idx = headers => Object.fromEntries(headers.map((h, i) => [String(h).toLowerCase(), i]));
const asDate = value => value instanceof Date ? value : typeof value === "number" && value > 20000
  ? new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000)) : null;
const catalog = read("APP_CATALOG");
const ci = idx(catalog.headers);
const enabledBank = catalog.rows.filter(r => r[ci.enabled] === true && r[ci.market_segment] === "BANK");
const countries = [...new Set(enabledBank.map(r => r[ci.country_code]))].sort();
if (countries.join(",") !== "AR,CO,ES,MX,PE,TR,UY,VE") throw new Error(`Geographies mismatch: ${countries}`);
for (const country of countries) for (const platform of ["Android", "iOS", "Huawei"]) {
  const count = enabledBank.filter(r => r[ci.country_code] === country && r[ci.platform] === platform).length;
  if (count !== 5) throw new Error(`Expected 5 BANK apps: ${platform}/${country}; got ${count}`);
}
const digital = catalog.rows.filter(r => r[ci.enabled] === true && r[ci.market_segment] === "FINTECH");
if (digital.some(r => r[ci.product_scope] !== "COMMERCIAL" || r[ci.commercial_eligible] !== true ||
    !String(r[ci.commercial_evidence_url]).startsWith("https://") || !String(r[ci.store_evidence_url]).startsWith("https://")))
  throw new Error("Digital competitor without commercial/store evidence");
if (catalog.rows.some(r => ["IT", "DE"].includes(r[ci.country_code]))) throw new Error("IT/DE still present");
const forbidden = /\|(NU|KLAR|STORI|BRUBANK|NARANJA_X|IMAGIN|OPENBANK|LULO)$/;
if (digital.some(r => forbidden.test(r[ci.app_key]))) throw new Error("Retail-only competitor still present");
if (wb.worksheets.items.some(s => s.name === "REVIEWS")) throw new Error("Unsupported REVIEWS sheet still present");
const trends = read("DASHBOARD_TRENDS");
const ti = idx(trends.headers);
const invalidMonths = trends.rows.filter(r => {
  const period = asDate(r[ti.period_month]);
  const yearMonth = r[ti.year_month];
  if (!(period instanceof Date)) return true;
  const expected = period.toISOString().slice(0, 7);
  const actual = yearMonth instanceof Date ? yearMonth.toISOString().slice(0, 7) : String(yearMonth);
  return actual !== expected;
});
if (invalidMonths.length) throw new Error(`Invalid trend months: ${invalidMonths.length}`);
const competition = read("DASHBOARD_COMPETITION");
const xi = idx(competition.headers);
const invalidRanks = competition.rows.filter(r => r[xi.ranking] !== "" && r[xi.ranking] !== null && r[xi.ranking_is_complete] !== true);
if (invalidRanks.length) throw new Error(`Ranks published without complete coverage: ${invalidRanks.length}`);
const kpis = read("DASHBOARD_KPIS");
if (kpis.rows.length !== 562) throw new Error(`Unexpected KPI rows: ${kpis.rows.length}`);
const errors = await wb.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, maxChars: 4000 });
if ((errors.ndjson || "").includes('"kind":"match"')) throw new Error(`Spreadsheet errors found: ${errors.ndjson}`);
const previewDir = path.resolve(".work/verify-commercial-strict");
await fs.mkdir(previewDir, { recursive: true });
for (const [sheetName, range] of [["WOW_README", "A1:H12"], ["CONTROL", "A1:C13"],
  ["APP_CATALOG", "A1:AC12"], ["DASHBOARD_KPIS", "A1:Z10"],
  ["DASHBOARD_COMPETITION", "A1:AE12"], ["DASHBOARD_TRENDS", "A1:W12"],
  ["FETCH_LOG", "A1:N12"]]) {
  const preview = await wb.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, `${sheetName}.png`), new Uint8Array(await preview.arrayBuffer()));
}
console.log(JSON.stringify({ ok: true, sheets: wb.worksheets.items.map(s => s.name), countries,
  enabledBankApps: enabledBank.length, commercialDigitalApps: digital.length, catalogRows: catalog.rows.length, kpiRows: kpis.rows.length,
  competitionRows: competition.rows.length, trendRows: trends.rows.length, invalidMonths: 0,
  invalidRanks: 0, formulaErrors: 0, previewDir }, null, 2));
