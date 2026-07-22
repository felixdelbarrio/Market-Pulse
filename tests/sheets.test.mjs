import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = ["../src/99_Core.gs", "../src/40_Sheets.gs"]
  .map(file => fs.readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n");
const context = { console, Math, Object, Array, String, Boolean, Number, Date, isFinite, isNaN };
vm.createContext(context);
vm.runInContext(source, context);

function sheetStub(name, header) {
  let values = header.slice();
  return {
    getName() { return name; },
    getLastColumn() { return values.length; },
    getMaxRows() { return 1000; },
    getMaxColumns() { return 26; },
    getRange(row, column, _rows, width) {
      assert.equal(row, 1);
      return {
        getValues() { return [values.slice(column - 1, column - 1 + width)]; },
        setValues(rows) {
          rows[0].forEach((value, index) => { values[column - 1 + index] = value; });
        }
      };
    },
    header() { return values; }
  };
}

test("current contracts initialize empty sheets but never extend old prefixes", () => {
  const expected = ["A", "B", "C"];
  const empty = sheetStub("EMPTY", []);
  context.ensureCurrentSheetContract_(empty, expected);
  assert.deepEqual(empty.header(), expected);
  assert.throws(
    () => context.ensureCurrentSheetContract_(sheetStub("OLD", ["A", "B"]), expected),
    /requiere exactamente/
  );
});

test("current contracts reject reordered and additional headers", () => {
  const expected = ["A", "B", "C"];
  assert.throws(
    () => context.ensureCurrentSheetContract_(sheetStub("REORDERED", ["A", "C", "B"]), expected),
    /Contrato incompatible/
  );
  assert.throws(
    () => context.ensureCurrentSheetContract_(sheetStub("EXTRA", ["A", "B", "C", "LEGACY"]), expected),
    /Contrato incompatible/
  );
});

test("a scoped contract check does not inspect unrelated sheets", () => {
  const target = sheetStub("ALERT_LOG", ["A", "B"]);
  const requested = [];
  const ss = {
    getSheetByName(name) {
      requested.push(name);
      return name === "ALERT_LOG" ? target : null;
    }
  };
  assert.equal(context.requireCurrentSheetContract_(ss, "ALERT_LOG", ["A", "B"]), target);
  assert.deepEqual(requested, ["ALERT_LOG"]);
});
