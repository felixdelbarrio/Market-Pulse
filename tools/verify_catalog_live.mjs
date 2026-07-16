import fs from "node:fs/promises";
import vm from "node:vm";

const source = await fs.readFile(new URL("../src/00_Config.gs", import.meta.url), "utf8");
const context = { Object, Boolean };
vm.createContext(context); vm.runInContext(source, context);
const headers = Array.from(context.MARKETS_CONFIG.headers.catalog);
const index = Object.fromEntries(headers.map((header, position) => [header, position]));
const rows = Array.from(context.MARKETS_CATALOG_SEEDS, row => Array.from(row))
  .filter(row => row[index.MARKET_SEGMENT] === "FINTECH");

async function check(row) {
  const platform = row[index.PLATFORM];
  const country = row[index.COUNTRY_CODE].toLowerCase();
  const appId = String(row[index.APP_ID]);
  const storeUrl = row[index.STORE_EVIDENCE_URL];
  const evidenceUrl = row[index.COMMERCIAL_EVIDENCE_URL];
  try {
    const evidence = await fetch(evidenceUrl, { redirect: "follow", headers: { "user-agent": "BBVA-Markets-Catalog-Verifier/1.0" } });
    if (evidence.status === 404 || evidence.status >= 500) throw new Error(`${row[0]} commercial evidence HTTP ${evidence.status}`);
  } catch (error) {
    if (!String(error).includes("fetch failed")) throw error;
  }
  if (platform === "iOS") {
    const lookup = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(appId)}&country=${country}`);
    const data = await lookup.json();
    if (!lookup.ok || data.resultCount !== 1 || String(data.results[0].trackId) !== appId)
      throw new Error(`${row[0]} invalid iTunes lookup`);
  } else {
    const store = await fetch(storeUrl, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0" } });
    const html = await store.text();
    if (!store.ok || !html.includes(row[index.PACKAGE_NAME])) throw new Error(`${row[0]} invalid Google Play listing`);
  }
  return row[0];
}

const verified = [];
for (let offset = 0; offset < rows.length; offset += 6) {
  verified.push(...await Promise.all(rows.slice(offset, offset + 6).map(check)));
}
console.log(JSON.stringify({ ok: true, verifiedAt: new Date().toISOString(), verifiedApps: verified.length, appKeys: verified }, null, 2));
