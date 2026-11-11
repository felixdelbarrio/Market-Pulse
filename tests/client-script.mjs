import assert from "node:assert/strict";

// Apps Script partials in these tests contain a single standalone script block.
export function clientScript(html) {
  const lines = html.split("\n");
  const start = lines.findIndex(line => line.trim().toLowerCase() === "<script>");
  const end = lines.findIndex((line, index) => index > start && line.trim().toLowerCase() === "</script>");
  assert.ok(start >= 0 && end > start, "Expected a standalone script block");
  return lines.slice(start + 1, end).join("\n");
}
