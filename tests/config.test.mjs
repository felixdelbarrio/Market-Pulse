import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../src/00_Config.gs", import.meta.url), "utf8");
const context = { Object };
vm.createContext(context);
vm.runInContext(source, context);

test("Venezuela seeds match the catalog contract and have unique keys", () => {
  const headers = Array.from(context.MARKETS_CONFIG.headers.catalog);
  const seeds = Array.from(context.MARKETS_CATALOG_SEEDS, row => Array.from(row));
  assert.equal(headers.length, 19);
  assert.equal(seeds.length, 15);
  assert.ok(seeds.every(row => row.length === headers.length));
  assert.equal(new Set(seeds.map(row => row[0])).size, seeds.length);
  assert.deepEqual(
    Object.fromEntries(["Android", "iOS", "Huawei"].map(platform => [platform, seeds.filter(row => row[1] === platform).length])),
    { Android: 5, iOS: 5, Huawei: 5 }
  );
});
