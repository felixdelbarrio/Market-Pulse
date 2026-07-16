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
});
