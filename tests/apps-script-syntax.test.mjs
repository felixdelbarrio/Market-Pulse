import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Node's parser accepts logical assignment, but the Apps Script editor rejected
// it in release .95. Keep this conservative source guard dependency-free in CI.
test('Apps Script server files compile and avoid logical assignment operators rejected by the editor', () => {
  const dir = new URL('../src/', import.meta.url);
  const files = fs.readdirSync(dir).filter(name => name.endsWith('.gs')).sort();
  assert.ok(files.includes('52_ReviewInsights.gs'), 'server sources must be present');
  for (const name of files) {
    const source = fs.readFileSync(new URL(name, dir), 'utf8');
    const unsupported = source.match(/\|\|=|&&=|\?\?=/);
    assert.equal(unsupported, null, unsupported
      ? `${name}:${source.slice(0, unsupported.index).split('\n').length}: unsupported logical assignment ${unsupported[0]}`
      : name);
    assert.doesNotThrow(() => new vm.Script(source, { filename: name }), name);
  }
});
