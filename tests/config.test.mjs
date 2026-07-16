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
  assert.equal(headers.length, 25);
  assert.equal(seeds.length, 93);
  assert.ok(seeds.every(row => row.length === headers.length));
  assert.equal(new Set(seeds.map(row => row[0])).size, seeds.length);
  assert.deepEqual(
    Object.fromEntries(["Android", "iOS", "Huawei"].map(platform => [platform, seeds.filter(row => row[1] === platform && row[3] === "VE").length])),
    { Android: 5, iOS: 5, Huawei: 5 }
  );
  for (const country of ["IT", "DE"]) for (const platform of ["Android", "iOS", "Huawei"])
    assert.equal(seeds.filter(row => row[1] === platform && row[3] === country && row[19] === "BANK").length, 5);
  for (const country of ["MX", "AR", "ES", "IT", "DE"])
    for (const platform of ["Android", "iOS"])
      assert.equal(seeds.filter(row => row[1] === platform && row[3] === country && row[19] === "FINTECH").length, 4);
  for (const platform of ["Android", "iOS"])
    assert.equal(seeds.filter(row => row[1] === platform && row[3] === "CO" && row[19] === "NEOBANK").length, 4);
});
