import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const file = "/Users/u517055/Documents/01.Development/01.Commercial/01.GenAi/markets/Markets/outputs/019f6ac2/MARKETS_RATINGS_MASTER.xlsx";
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const expected = {
  CONTROL: ["PARAMETER", "VALUE", "DESCRIPTION"],
  APP_CATALOG: ["APP_KEY", "PLATFORM", "STORE", "COUNTRY_CODE", "COUNTRY", "APP_NAME", "APP_ID", "PACKAGE_NAME", "IS_BBVA", "ENABLED", "LOCALE", "ALERT_RECIPIENTS", "WARNING_DROP", "CRITICAL_DROP", "MIN_OBSERVATIONS_7D", "COMPETITOR_ALERTS"],
  RATINGS: ["RECORD_KEY", "OBSERVED_DATE", "YEAR", "YEAR_MONTH", "PLATFORM", "STORE", "COUNTRY_CODE", "COUNTRY", "APP_KEY", "APP_NAME", "APP_ID", "IS_BBVA", "RATING", "RATING_COUNT", "RANKING", "PREVIOUS_RATING_30D", "DELTA_30D", "IS_LATEST", "SOURCE", "INGESTED_AT"],
  REVIEWS: ["REVIEW_KEY", "REVIEW_ID", "REVIEW_DATE", "YEAR_MONTH", "PLATFORM", "STORE", "COUNTRY_CODE", "COUNTRY", "APP_KEY", "APP_NAME", "APP_VERSION", "STAR_RATING", "TITLE", "REVIEW_TEXT", "USER_NAME", "THUMBS_UP_COUNT", "REPLY_TEXT", "REPLY_DATE", "TOPICS", "SOURCE"],
  ALERT_LOG: ["TIMESTAMP", "EVENT_KEY", "REFERENCE_DATE", "PLATFORM", "COUNTRY_CODE", "TYPE", "SEVERITY", "DETAIL", "RECIPIENTS", "RUN_ID", "SOURCE"],
  RUN_LOG: ["STARTED_AT", "RUN_ID", "STATUS", "APPS_TOTAL", "APPS_OK", "APPS_NO_RATING", "APPS_ERROR", "ROWS_UPSERTED", "ALERTS_CREATED", "DURATION_MS", "DETAIL"]
};
const report = { sheets: {}, failures: [] };
for (const [name, headers] of Object.entries(expected)) {
  const sheet = wb.worksheets.items.find(item => item.name === name);
  if (!sheet) { report.failures.push(`Missing sheet ${name}`); continue; }
  const values = sheet.getUsedRange(true)?.values ?? [];
  const actualHeaders = (values[0] ?? []).slice(0, headers.length);
  if (JSON.stringify(actualHeaders) !== JSON.stringify(headers)) report.failures.push(`Header mismatch ${name}`);
  report.sheets[name] = { rows: Math.max(0, values.length - 1), columns: actualHeaders.length };
  if (name === "RATINGS") {
    const keys = values.slice(1).map(row => String(row[0] ?? ""));
    const invalidRatings = values.slice(1).filter(row => !(Number(row[12]) >= 1 && Number(row[12]) <= 5)).length;
    const invalidRanks = values.slice(1).filter(row => !(Number(row[14]) >= 1)).length;
    const duplicates = keys.length - new Set(keys).size;
    const latest = values.slice(1).filter(row => row[17] === true).length;
    Object.assign(report.sheets[name], { duplicates, invalidRatings, invalidRanks, latest });
    if (duplicates || invalidRatings || invalidRanks || latest === 0) report.failures.push("RATINGS integrity failure");
  }
  if (name === "REVIEWS") {
    const keys = values.slice(1).map(row => String(row[0] ?? ""));
    const duplicates = keys.length - new Set(keys).size;
    const invalidStars = values.slice(1).filter(row => !(Number(row[11]) >= 1 && Number(row[11]) <= 5)).length;
    Object.assign(report.sheets[name], { duplicates, invalidStars });
    if (duplicates || invalidStars) report.failures.push("REVIEWS integrity failure");
  }
}
console.log(JSON.stringify(report, null, 2));
if (report.failures.length) process.exitCode = 1;

