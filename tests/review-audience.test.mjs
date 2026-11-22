import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

function fixture() {
  let rows = null, reads = 0, writes = 0;
  const sheet = {
    getName: () => 'RELEVANCE_RULES',
    getMaxRows: () => 1000,
    getMaxColumns: () => 26,
    getLastRow: () => rows.length,
    getLastColumn: () => rows[0]?.length || 0,
    getRange: (start, _, count) => ({
      getValues: () => { reads++; return structuredClone(rows.slice(start - 1, start - 1 + count)); },
      setValues: values => { writes++; rows.splice(start - 1, values.length, ...structuredClone(values)); }
    })
  };
  const ss = {
    getSheetByName: name => name === 'RELEVANCE_RULES' && rows ? sheet : null,
    insertSheet: () => { assert.equal(rows, null); rows = []; return sheet; }
  };
  const api = vm.createContext({ ensureSheetCapacity_() {}, SpreadsheetApp: { flush() {} } });
  for (const file of ['40_Sheets', '52_ReviewInsights', '57_ReviewAudience', '58_Admin']) {
    vm.runInContext(fs.readFileSync(new URL('../src/' + file + '.gs', import.meta.url), 'utf8'), api);
  }
  api.marketsReviewDigest_ = value => createHash('sha256').update(JSON.stringify(value)).digest('base64url');
  api.requireMarketsAdministrator_ = () => ({ ss });
  const save = (key, group, phrase, enabled, expected = '') => api.saveMarketsBusinessCatalogEntry({
    section: 'relevance', key, value: { group, phrase, enabled }, expected
  });
  api.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
  return { api, ss, save, stats: () => [reads, writes], replace: values => { rows = values; } };
}

test('default audience decisions retain multilingual evidence and reasons, with no sheet write', () => {
  const { api, ss, stats } = fixture();
  const { rules, revision } = api.marketsAudienceCatalog_(ss);
  assert.equal(revision, '');
  const corpus = [
    'No soy empresa. No puedo acceder a mi cuenta personal.',
    'I cannot access my corporate account. But it works on my student card.',
    'Não recebo meu salário, mas uso a conta empresarial.',
    'Maaş müşterisiyim. Banka personel maaşı yatırılmadı.',
    'No puedo iniciar sesión ni enviar transferencias.',
    'Falla la gestión de tesorería. También falla el alquiler de mi casa.'
  ];
  for (const text of corpus) assert.deepEqual(api.classifyMarketsReviewAudience_(text, rules), api.classifyMarketsReviewAudience_(text));
  assert.deepEqual(stats(), [0, 0]);
});

test('first edit seeds atomically, subsequent edits preserve rows and toggle rules with optimistic concurrency', () => {
  const { api, ss, save, stats } = fixture();
  const phrase = 'Help with our merchant vault';
  const key = 'phrase-merchant-vault';
  save(key, 'direct', 'merchant vault', true);
  const first = api.marketsAudienceCatalog_(ss);
  assert.equal(api.classifyMarketsReviewAudience_(phrase, first.rules).relevance, 'BUSINESS');
  assert.equal(api.classifyMarketsReviewAudience_('Not for my business or merchant vault', first.rules).relevance, 'NONE');
  for (let i = 0; i < 3000; i++) {
    assert.equal(api.marketsAudienceCatalog_(ss).revision, first.revision);
    api.classifyMarketsReviewAudience_(phrase, first.rules);
  }
  assert.deepEqual(stats(), [1, 1]);
  const expected = JSON.stringify(first.rows.find(row => row[0] === key));
  assert.throws(() => save(key, 'direct', 'merchant vault', false), /cambió/);
  save(key, 'direct', 'merchant vault', false, expected);
  const second = api.marketsAudienceCatalog_(ss);
  assert.equal(second.revision, '');
  assert.equal(api.classifyMarketsReviewAudience_(phrase, second.rules).relevance, 'NONE');
  assert.deepEqual(second.rows.slice(0, -1), first.rows.slice(0, -1));
  assert.equal(second.rows.find(row => row[0] === key)[3], false);
  assert.equal(stats()[1], 2);
});

test('audience changes require admin access and reject unsafe, duplicate and corrupt configuration', () => {
  const { api, ss, save, replace, stats } = fixture();
  api.requireMarketsAdministrator_ = () => { throw new Error('Acceso denegado'); };
  assert.throws(() => save('phrase-one', 'direct', 'merchant vault', true), /Acceso denegado/);
  api.requireMarketsAdministrator_ = () => ({ ss });
  assert.throws(() => save('phrase-one', 'direct', '(a+)+$', true), /frase literal/);
  assert.throws(() => save('phrase-one', '__proto__', 'merchant vault', true), /inválida/);
  assert.deepEqual(stats(), [0, 0]);
  save('phrase-one', 'direct', 'merchant vault', true);
  assert.throws(() => save('phrase-two', 'direct', 'Merchant vault', false), /duplicada/);
  replace([]);
  assert.throws(() => api.marketsAudienceCatalog_(ss, true), /vacío/);
  replace([['x', 'y', 'z', 'w'], ['phrase-one', 'direct', 'merchant vault', true]]);
  assert.throws(() => api.marketsAudienceCatalog_(ss, true), /Contrato incompatible/);
});
