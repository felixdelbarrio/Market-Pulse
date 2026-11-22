import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function runtime(extra = {}) {
  const context = vm.createContext({ console: { log() {}, warn() {} }, ...extra });
  for (const file of ['54_Reviews.gs', '52_ReviewInsights.gs']) {
    vm.runInContext(fs.readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'), context);
  }
  return context;
}

test('snapshot freshness follows publication and compatible revisions with a bounded clock', () => {
  const api = runtime({ marketsReviewWindow_: () => ({ end: '2026-11-21' }) });
  // Override the real clock/window dependency after loading the implementation.
  api.marketsReviewWindow_ = () => ({ end: '2026-11-21' });
  const now = Date.parse('2026-11-21T10:00:00Z');
  const snapshot = { schema: 15, end: '2026-11-21', publishedAt: '2026-11-21T09:30:00Z',
    hasNpsAttribution: true, hasAnnualNps: true, hasAllSentimentGaps: true, audienceVersion: 2, versions: ['10', 'rules', 'catalog'], npsVersions: ['5', 'geo', 'catalog'] };
  const check = (versions, changes = {}, properties = {}) => api.marketsReviewSnapshotState_(
    { ...snapshot, ...changes }, 'analytics', { analysisMonth: '2026-11' }, {}, versions, properties, now);
  assert.equal(check(snapshot.versions).freshness, 'fresh');
  assert.equal(check(['11', 'rules', 'catalog']).freshness, 'stale');
  assert.equal(check(['11', 'changed-rules', 'catalog']), null);
  assert.equal(check(['11', 'rules', 'changed-catalog']), null);
  assert.equal(check(['11', 'rules', 'catalog'], { schema: 16 }), null);
  assert.equal(check(['11', 'rules', 'catalog'], { publishedAt: undefined }), null);
  assert.equal(check(['11', 'rules', 'catalog'], {}, { MARKETS_REVIEW_STALE_MAX_SECONDS: '1799' }), null);
  assert.equal(check(['11', 'rules', 'catalog'], { end: '2026-11-20' }), null);
  assert.equal(api.marketsReviewSnapshotState_(snapshot, 'nps', {}, {}, snapshot.npsVersions, {}, now).freshness, 'fresh');
});

function publication({ failShard = false, changed = false, competing = false, corrupt = false } = {}) {
  const data = new Map([['MARKETS_REVIEW_SNAPSHOT_POINTER', JSON.stringify({ files: { ES: 'previous' } })]]);
  const files = new Map(), trashed = [], released = [];
  const props = { getProperty: key => data.get(key) ?? null, setProperty: (key, value) => data.set(key, value) };
  const api = runtime({
    safeJsonParse_: JSON.parse, errorToString_: String,
    LockService: { getUserLock: () => ({ tryLock: () => true, releaseLock: () => released.push(true) }) },
    Utilities: { newBlob: text => text, gzip: text => text,
      ungzip: blob => ({ getDataAsString: () => corrupt ? '{}' : blob }) },
    DriveApp: {
      createFile: blob => {
        if (failShard && files.size) throw Error('quota');
        const id = 'file-' + files.size;
        files.set(id, blob);
        if (competing) data.set('MARKETS_REVIEW_SNAPSHOT_POINTER', 'competing');
        return { getId: () => id };
      },
      getFileById: id => ({ getBlob: () => files.get(id), setTrashed: () => trashed.push(id) })
    }
  });
  return { api, props, data, trashed, released, current: () => !changed };
}

test('snapshot validates all shards, commits once and retains the previous publication', () => {
  const p = publication();
  assert.equal(p.api.writeMarketsReviewSnapshot_(p.props, { end: '2026-11-21' },
    { 'analytics:ES': { total: 2 }, 'analytics:TR': { total: 3 } }, p.current), true);
  const pointer = JSON.parse(p.data.get('MARKETS_REVIEW_SNAPSHOT_POINTER'));
  assert.equal(Object.keys(pointer.files).length, 2);
  assert.ok(Number.isFinite(Date.parse(pointer.publishedAt)));
  assert.ok(p.data.has('MARKETS_REVIEW_SNAPSHOT_PREVIOUS'));
  assert.deepEqual(p.trashed, []);
  assert.equal(p.released.length, 1);
});

test('quota, corrupt shard, changed generation and competing commit preserve the pointer', () => {
  for (const options of [{ failShard: true }, { corrupt: true }, { changed: true }, { competing: true }]) {
    const p = publication(options), original = p.data.get('MARKETS_REVIEW_SNAPSHOT_POINTER');
    const run = () => p.api.writeMarketsReviewSnapshot_(p.props, {},
      { 'analytics:ES': { total: 1 }, 'analytics:TR': { total: 2 } }, p.current);
    if (options.failShard || options.corrupt) assert.throws(run);
    else assert.equal(run(), false);
    assert.equal(p.data.get('MARKETS_REVIEW_SNAPSHOT_POINTER'), options.competing ? 'competing' : original);
    assert.ok(p.trashed.length);
    assert.ok(!p.trashed.includes('previous'));
  }
});

test('helpful ordering is numeric and stable across page boundaries, zero and absent votes', () => {
  const api = runtime();
  const rows = Array.from({ length: 30 }, (_, index) => ({ key: String(index).padStart(2, '0'),
    date: '2026-11-21', countries: ['ES'], helpful: index === 29 ? 100 : index === 28 ? 9 : index === 27 ? undefined : 0 }));
  rows.sort(api.compareMarketsHelpfulReviews_);
  assert.equal(api.paginateMarketsReviews_(rows, { country: 'ES', page: 0 }).rows[0].key, '29');
  assert.equal(api.paginateMarketsReviews_(rows, { country: 'ES', page: 0 }).rows[1].key, '28');
  const pages = [0, 1].flatMap(page => Array.from(api.paginateMarketsReviews_(rows, { country: 'ES', page }).rows));
  assert.equal(new Set(pages.map(row => row.key)).size, 30);
  assert.deepEqual(pages.slice(2).map(row => row.key), rows.slice(2).map(row => row.key));
  assert.throws(() => api.normalizeMarketsReviewFilters_({ sort: 'bogus' }), /Orden/);
});

test('an L1 eviction falls back to the same compatible snapshot without reading Sheets', () => {
  const properties = { MARKETS_REVIEWS_GENERATION: '2', MARKETS_FUNCTIONAL_REVISION: 'rules' };
  const manifest = { schema: 15, end: '2026-11-21', publishedAt: new Date().toISOString(),
    hasNpsAttribution: true, hasAnnualNps: true, hasAllSentimentGaps: true, audienceVersion: 2, versions: ['1', 'rules', 'catalog'] };
  properties.MARKETS_REVIEW_SNAPSHOT_POINTER = JSON.stringify(manifest);
  const cache = new Map();
  let reads = 0;
  const api = runtime({ safeJsonParse_: JSON.parse,
    PropertiesService: { getScriptProperties: () => ({ getProperties: () => properties }) } });
  Object.assign(api, {
    marketsReviewWindow_: () => ({ end: '2026-11-21' }), readAppCatalog_: () => [],
    marketsReviewCatalogVersion_: () => 'catalog', marketsReviewDigest_: JSON.stringify, queueMarketsReviewSnapshotRefresh_: () => true,
    marketsReviewCacheKey_: (_ss, operation, filters, window, versions) => JSON.stringify([operation, filters, window, versions]),
    readMarketsWebCache_: (key, builder) => { if (!cache.has(key)) cache.set(key, builder()); return cache.get(key); },
    readMarketsReviewSnapshotShard_: () => { reads++; return {
      'analytics:ES:2026-11:2026-10-01:2026-11-21': { total: 7, window: { start: '2026-10-01', end: '2026-11-21' } }
    }; }
  });
  const ss = { getSheetByName: () => ({ getLastRow: () => 98920 }) };
  const filters = { country: 'ES', platform: 'ALL', analysisMonth: '2026-11', segment: 'DETRACTOR', entity: 'BBVA Empresas' };
  const window = { start: '2026-10-01', end: '2026-11-21' };
  const read = timing => api.readMarketsReviewCache_(ss, 'analytics', filters, window, () => {
    throw new Error('Unexpected global scan');
  }, timing);
  let timing = {};
  assert.equal(read(timing).total, 7);
  assert.equal(timing.freshness, 'stale');
  timing = {};
  assert.equal(read(timing).total, 7);
  assert.equal(timing.cacheSource, 'L1');
  cache.clear();
  assert.equal(read({}).total, 7);
  assert.equal(reads, 2);
  properties.MARKETS_REVIEW_SNAPSHOT_PREVIOUS = JSON.stringify(manifest);
  properties.MARKETS_REVIEW_SNAPSHOT_POINTER = JSON.stringify({ ...manifest, files: { ES: 'missing' } });
  const readShard = api.readMarketsReviewSnapshotShard_;
  api.readMarketsReviewSnapshotShard_ = (snapshot, country) => snapshot.files ? null : readShard(snapshot, country);
  const queued = [];
  api.queueMarketsReviewSnapshotRefresh_ = (...args) => queued.push(args);
  timing = {};
  assert.equal(read(timing).total, 7);
  assert.equal(timing.freshness, 'stale');
  assert.equal(queued.at(-1)[3], true);
  assert.throws(() => api.readMarketsReviewCache_(ss, 'analytics', { ...filters, strictFreshness: true }, window,
    () => assert.fail('Strict queries cannot scan the dataset')), /se está publicando/);
  properties.MARKETS_FUNCTIONAL_REVISION = 'incompatible';
  assert.throws(() => read({}), /se está publicando/);
});

test('library adapter pins all revisions, preserves Generalista and refuses partial or reordered batches', () => {
  const pins = { expectedRevision: 'catalog', expectedAlgorithmVersion: 'algorithm',
    expectedRulesRevision: 'rules', expectedTranslationsRevision: 'translations' };
  let response;
  const api = runtime({ EDCCatalogClassifier: { classifyBatch(records, options) {
    assert.equal(options.requirePinnedRevisions, true);
    assert.equal(options.failOnRecordError, true);
    assert.equal(options.expectedTranslationsRevision, 'translations');
    return response;
  } } });
  vm.runInContext(fs.readFileSync(new URL('../src/55_ReviewIndex.gs', import.meta.url), 'utf8'), api);
  api.marketsReviewDigest_ = JSON.stringify;
  const rows = [['a'], ['b']];
  response = { revision: 'catalog', algorithmVersion: 'algorithm', rulesRevision: 'rules', translationsRevision: 'translations',
    results: [{ id: 'a', assignments: [] }, { id: 'b', assignments: [{ id: '03.13' }, { id: '03.13' }] }] };
  assert.deepEqual(JSON.parse(JSON.stringify(api.classifyMarketsFunctionalBatch_(rows, pins))), [[], ['03.13']]);
  response.results.reverse();
  assert.throws(() => api.classifyMarketsFunctionalBatch_(rows, pins), /inválida/);
  response.results = response.results.slice(0, 1);
  assert.throws(() => api.classifyMarketsFunctionalBatch_(rows, pins), /incompleto/);
  response.translationsRevision = 'new';
  assert.throws(() => api.classifyMarketsFunctionalBatch_(rows, pins), /cambió/);
});

test('featured newsletter reviews share exact scopes, deduplicate keys and escape replies', () => {
  const api = runtime({ trimString_: value => String(value ?? '').trim(), escapeMarketsAlertHtml_: value =>
    String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    marketsAlertScopeMatches_: (preferences, row) => preferences.countries.includes(row.countryCode) && preferences.platforms.includes(row.platform) });
  vm.runInContext(fs.readFileSync(new URL('../src/56_Newsletter.gs', import.meta.url), 'utf8'), api);
  const row = (key, helpful, country = 'ES') => ({ key, helpful, countries: [country], platform: 'Android',
    date: '2026-10-12', rating: 4, app: 'BBVA Empresas', original: '<script>unsafe</script>', reply: '<reply>', replyAuthor: 'BBVA' });
  const preferences = { countries: ['ES'], platforms: ['Android'] };
  assert.deepEqual(Object.keys(api.selectMarketsNewsletterFeatured_([row('zero', 0), row('missing', undefined)], preferences)), []);
  const selected = api.selectMarketsNewsletterFeatured_([row('a', 4), row('b', 9), row('c', 9), row('d', 2), row('b', 9), row('co', 100, 'CO')], preferences);
  assert.deepEqual(Array.from(selected.ES, row => row.key), ['b', 'c', 'a']);
  const html = api.renderMarketsNewsletterFeatured_({ featuredReviews: selected, language: 'es', featuredHistorical: true }, 'ES');
  assert.ok(html.includes('Ejemplos históricos'));
  assert.ok(html.includes('2026-10-12'));
  assert.ok(html.includes('cid:reviewAndroid'));
  assert.ok(html.includes('&lt;reply&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.equal(api.renderMarketsNewsletterFeatured_({ featuredReviews: selected }, 'CO'), '');
});

test('NPS ranking keeps zero and negative scores, deterministic ties and absent samples', () => {
  const window = {};
  const html = fs.readFileSync(new URL('../src/Domain.html', import.meta.url), 'utf8');
  const source = html.match(/^<script>([\s\S]*)<\/script>\s*$/i)[1];
  vm.runInNewContext(source, { window });
  const rows = [
    { appName: 'Missing', rating: 0, total: 0 }, { appName: 'Negative', rating: -60, total: 5 },
    { appName: 'Zero', rating: 0, total: 8 }, { appName: 'Positive B', rating: 40, total: 5 },
    { appName: 'Positive A', rating: 40, total: 10 }
  ];
  const ranked = window.MarketsDomain.rankReviewNpsRows(rows);
  assert.deepEqual(Array.from(ranked, row => row.appName), ['Positive A', 'Positive B', 'Zero', 'Negative', 'Missing']);
  assert.deepEqual(Array.from(ranked, row => row.computedRank), [1, 1, 3, 4, null]);
  assert.equal(ranked.at(-1).rating, null);
  assert.equal(window.MarketsDomain.rankReviewNpsRows(rows.filter(row => row.total === 8))[0].computedRank, 1);
});

function migrationFixture() {
  const properties = new Map([['MARKETS_REVIEW_SOURCE_GENERATION', 'source-1']]);
  const props = { getProperty: key => properties.get(key) ?? null, setProperty: (key, value) => properties.set(key, value) };
  const sheets = new Map();
  function sheet(name, rows) {
    const value = { rows, getName: () => name, getLastRow: () => rows.length,
      getRange: (start, column, height, width) => ({
        getValues: () => Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => rows[start - 1 + i]?.[column - 1 + j] ?? '')),
        setValues: values => values.forEach((row, i) => { rows[start - 1 + i] = [...row]; })
      }),
      setName: next => { sheets.delete(name); name = next; sheets.set(name, value); return value; },
      copyTo: () => sheet('copy', JSON.parse(JSON.stringify(rows))), setFrozenRows() {},
      getMaxRows: () => rows.length, getMaxColumns: () => 9
    };
    sheets.set(name, value);
    return value;
  }
  const source = sheet('MARKET_REVIEWS', [Array(11).fill('header'), ...['a', 'b'].map((key, i) =>
    [key, 'app', 'ES', 'iOS', '123', key, '2026-10-01', i + 1, '', '', 'original ' + key])]);
  sheet('MARKET_REVIEW_INDEX', [Array(9).fill('header'), ['a', 'old', 'old', '[]'], ['b', 'old', 'old', '[]']]);
  const ss = { getSheetByName: name => sheets.get(name), insertSheet: name => sheet(name, []), getSheets: () => [...sheets.values()] };
  let failFlush = false, locked = true, classifyCalls = 0;
  const pins = { expectedRevision: 'catalog', expectedAlgorithmVersion: 'algorithm',
    expectedRulesRevision: 'rules', expectedTranslationsRevision: 'translations' };
  const api = runtime({ safeJsonParse_: JSON.parse, errorToString_: String,
    PropertiesService: { getScriptProperties: () => props },
    LockService: { getUserLock: () => ({ tryLock: () => locked, releaseLock() {} }) },
    SpreadsheetApp: { flush: () => { if (failFlush) throw Error('transient'); } },
    EDCCatalogClassifier: { fcPreflight: () => ({ ok: true }), getClassifierRevisions: () => pins,
      classifyBatch: records => {
        classifyCalls++;
        return { revision: 'catalog', algorithmVersion: 'algorithm', rulesRevision: 'rules', translationsRevision: 'translations',
          results: records.map(row => ({ id: row.id, assignments: row.id === 'a' ? [] : [{ id: '03.13' }] })) };
      } }
  });
  vm.runInContext(fs.readFileSync(new URL('../src/55_ReviewIndex.gs', import.meta.url), 'utf8'), api);
  Object.assign(api, { requireMarketsReviewOwner_: () => ({ ss }), openMarketsSpreadsheet_: () => ss,
    marketsReviewSheet_: () => source, marketsAppendSheetHeaders_: sheet => ({ sheet }),
    marketsReviewDigest_: JSON.stringify, marketsReviewClassification_: () => ({ rules: {}, version: 'old' }),
    marketsReviewLiteral_: String, ensureSheetCapacity_() {},
    classifyMarketsReviewAudience_: () => ({ audience: 'BUSINESS', sharedOperation: false, relevance: 'BUSINESS', reason: 'evidence', evidence: [] })
  });
  return { api, properties, source, sheets, classifyCalls: () => classifyCalls, setFail: value => { failFlush = value; }, setLock: value => { locked = value; } };
}

test('historical migration retries a failed chunk and activates only after complete verification', () => {
  const f = migrationFixture(), original = JSON.stringify(f.source.rows);
  const started = f.api.startMarketsFunctionalMigration();
  assert.ok(f.sheets.has(started.backup));
  assert.ok(started.backupDigest);
  f.setLock(false);
  assert.equal(f.api.advanceMarketsFunctionalMigration_().deferred, true);
  f.setLock(true);
  f.setFail(true);
  assert.throws(() => f.api.advanceMarketsFunctionalMigration_(), /transient/);
  assert.equal(JSON.parse(f.properties.get('MARKETS_FUNCTIONAL_MIGRATION')).next, 2);
  f.setFail(false);
  const built = f.api.advanceMarketsFunctionalMigration_();
  assert.equal(built.processedEligible, 2);
  assert.equal(f.api.marketsFunctionalEngine_({}), null);
  assert.equal(f.api.advanceMarketsFunctionalMigration_().complete, false);
  const ready = f.api.advanceMarketsFunctionalMigration_();
  assert.equal(ready.ready, true);
  assert.equal(ready.complete, false);
  assert.ok(!f.properties.has('MARKETS_REVIEW_SNAPSHOT_POINTER'));
  f.properties.set('MARKETS_REVIEW_SNAPSHOT_POINTER', JSON.stringify({ publishedAt: new Date().toISOString(),
    engine: { engine: 'EDCCatalogClassifier', sheet: started.sheet, pins: started.pins, libraryVersion: started.libraryVersion } }));
  const done = f.api.advanceMarketsFunctionalMigration_();
  assert.equal(done.complete, true);
  assert.equal(done.after.general, 1);
  assert.equal(done.after['03'], 1);
  assert.equal(f.api.marketsFunctionalEngine_({ MARKETS_REVIEW_SNAPSHOT_POINTER: f.properties.get('MARKETS_REVIEW_SNAPSHOT_POINTER') }).sheet, started.sheet);
  assert.equal(JSON.stringify(f.source.rows), original);
  assert.equal(f.properties.get('MARKETS_REVIEW_SOURCE_GENERATION'), 'source-1');
});

test('a numbered upgrade stages a new index, retains rollback and reuses verified classifications', () => {
  const f = migrationFixture();
  const old = { complete: true, sheet: 'MARKET_REVIEW_INDEX', libraryVersion: '1' };
  const pointer = JSON.stringify({ engine: { sheet: old.sheet, libraryVersion: old.libraryVersion } });
  f.properties.set('MARKETS_FUNCTIONAL_MIGRATION', JSON.stringify(old));
  f.properties.set('MARKETS_REVIEW_SNAPSHOT_POINTER', pointer);
  const started = f.api.startMarketsFunctionalMigration();
  assert.equal(started.libraryVersion, '5');
  assert.equal(started.backup, old.sheet);
  assert.notEqual(started.sheet, old.sheet);
  assert.equal(f.properties.get('MARKETS_FUNCTIONAL_MIGRATION_PREVIOUS'), JSON.stringify(old));
  assert.equal(f.properties.get('MARKETS_REVIEW_SNAPSHOT_POINTER'), pointer);
  assert.equal(f.api.startMarketsFunctionalMigration().sheet, started.sheet);
  assert.equal(f.api.advanceMarketsFunctionalMigration_().processedEligible, 2);
  const calls = f.classifyCalls();
  f.properties.set('MARKETS_REVIEW_SOURCE_GENERATION', 'source-2');
  assert.equal(f.api.advanceMarketsFunctionalMigration_().next, 2);
  assert.equal(f.api.advanceMarketsFunctionalMigration_().processedEligible, 2);
  assert.equal(f.classifyCalls(), calls);
  assert.equal(f.properties.get('MARKETS_REVIEW_SNAPSHOT_POINTER'), pointer);
});

test('monthly windows contain exactly six calendar months across years and leap days', () => {
  const api = runtime({ Utilities: { formatDate: () => '2026-11-21' }, MARKETS_CONFIG: { timeZone: 'Europe/Madrid' } });
  for (const [month, start, end] of [['2026-11', '2026-06-01', '2026-11-21'],
    ['2025-01', '2024-08-01', '2025-01-31'], ['2024-02', '2023-09-01', '2024-02-29']]) {
    const window = api.marketsReviewAnalyticsWindow_({ analysisMonth: month }, '2026-11-21');
    assert.equal(window.start, start);
    assert.equal(window.end, end);
    assert.equal(window.recent, month + '-01');
  }
});

test('requested scopes are deduplicated, bounded and never persist free text', () => {
  const values = new Map();
  const api = runtime({ safeJsonParse_: JSON.parse, PropertiesService: { getScriptProperties: () => ({
    getProperty: key => values.get(key), setProperty: (key, value) => values.set(key, value)
  }) }, LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) } });
  api.marketsReviewDigest_ = JSON.stringify;
  const filters = { country: 'ES', platform: 'ALL', year: '2026', audience: 'BEI' };
  const window = { start: '2026-01-01', end: '2026-11-21', recent: '2026-01-01' };
  api.queueMarketsReviewSnapshotRefresh_(filters, window, 'nps');
  api.queueMarketsReviewSnapshotRefresh_({ ...filters }, window, 'nps');
  assert.equal(JSON.parse(values.get('MARKETS_REVIEW_REQUESTED_SCOPES')).length, 1);
  for (let year = 2025; year > 2013; year--) api.queueMarketsReviewSnapshotRefresh_({ ...filters, year: String(year) }, window, 'nps');
  assert.equal(JSON.parse(values.get('MARKETS_REVIEW_REQUESTED_SCOPES')).length, 8);
  api.queueMarketsReviewSnapshotRefresh_({ ...filters, search: 'private text' }, window);
  assert.ok(!values.get('MARKETS_REVIEW_REQUESTED_SCOPES').includes('private text'));
  assert.ok(values.has('MARKETS_REVIEW_MANUAL:publish'));
});

test('a published library engine decouples local label translations from analytical generations', () => {
  const api = runtime({ safeJsonParse_: JSON.parse });
  const properties = { MARKETS_REVIEWS_GENERATION: 'derived', MARKETS_REVIEW_SOURCE_GENERATION: 'source',
    MARKETS_FUNCTIONAL_REVISION: 'catalog', MARKETS_FUNCTIONAL_TRANSLATIONS_REVISION: 'labels-1' };
  const legacy = api.marketsReviewVersions_(properties, 'apps');
  const nps = api.marketsReviewNpsVersions_(properties, 'apps');
  properties.MARKETS_FUNCTIONAL_TRANSLATIONS_REVISION = 'labels-2';
  assert.notEqual(JSON.stringify(api.marketsReviewVersions_(properties, 'apps')), JSON.stringify(legacy));
  properties.MARKETS_REVIEW_SNAPSHOT_POINTER = JSON.stringify({ engine: { engine: 'EDCCatalogClassifier', pins: { expectedRulesRevision: 'pinned' } } });
  const active = api.marketsReviewVersions_(properties, 'apps');
  properties.MARKETS_FUNCTIONAL_TRANSLATIONS_REVISION = 'labels-3';
  assert.equal(JSON.stringify(api.marketsReviewVersions_(properties, 'apps')), JSON.stringify(active));
  assert.equal(JSON.stringify(api.marketsReviewNpsVersions_(properties, 'apps')), JSON.stringify(nps));
});

test('a failed metadata write invalidates the in-flight build without invalidating source NPS', () => {
  const api = runtime({ safeJsonParse_: JSON.parse, trimString_: value => String(value ?? '').trim() });
  vm.runInContext(fs.readFileSync(new URL('../src/53_PlayReviews.gs', import.meta.url), 'utf8'), api);
  const row = [JSON.stringify(['Android', 'package', 'review']), '', 'ES', 'Android', 'package', 'review',
    '2026-11-21', 4, '', '', 'Text', '', '', '', '', JSON.stringify({ helpful: 0 })];
  const sheet = { getLastRow: () => 2, getRange: (_start, column, _count, width) => ({
    getValues: () => [row.slice(column - 1, column - 1 + width)],
    setValues: () => { throw new Error('partial write'); }
  }) };
  const invalidations = [];
  api.advanceMarketsReviewGeneration_ = (_properties, sourceChanged = false) => invalidations.push(sourceChanged);
  assert.throws(() => api.refreshMarketsAndroidMetadataPage_(sheet, {}, 'package', [{ id: 'review', metadata: { helpful: 8 } }]), /partial write/);
  assert.deepEqual(invalidations, [false, false]);
});

test('manual email acceptance survives a later failure and retries do not send again', () => {
  const values = new Map();
  const api = runtime({ safeJsonParse_: JSON.parse, MARKETS_CONFIG: { lockTimeoutMs: 1000 },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => values.get(key), setProperty: (key, value) => values.set(key, value) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) }
  });
  vm.runInContext(fs.readFileSync(new URL('../src/56_Newsletter.gs', import.meta.url), 'utf8'), api);
  let sends = 0;
  api.sendMarketsNewsletterPreview_ = (_ss, recipient, _preferences, _configuredFor, _requestId, options) => {
    sends++;
    options.onAccepted({ accepted: true, recipient, messageId: 'provider-accepted', auditLogged: false });
    throw new Error('later audit failure');
  };
  const run = id => api.withMarketsNewsletterPreviewLock_({}, 'admin@bbva.com', {}, 'admin@bbva.com', id, { edition: 'featured' });
  assert.throws(() => run('request-1'), /later audit/);
  assert.equal(run('request-1').alreadyAccepted, true);
  assert.equal(sends, 1);
  assert.throws(() => run('request-2'), /un minuto/);
  assert.equal(sends, 1);
});

test('library metadata uses the numbered version pinned in the manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../src/appsscript.json', import.meta.url), 'utf8'));
  const library = manifest.dependencies.libraries.find(entry => entry.userSymbol === 'EDCCatalogClassifier');
  assert.equal(vm.runInContext('MARKETS_REVIEW_LIBRARY_VERSION', runtime()), library.version);
  assert.equal(library.developmentMode, false);
});
