/** Índice derivado. La fila física acelera la lectura; la clave y la huella verifican identidad. */
const MARKETS_REVIEW_INDEX = 'MARKET_REVIEW_INDEX';
const MARKETS_REVIEW_INDEX_HEADERS = ['review_key', 'text_digest', 'classifier_version', 'topic_ids', 'audience', 'shared', 'reason', 'relevance', 'evidence'];
const MARKETS_REVIEW_INDEX_CURSOR = 'MARKETS_REVIEW_INDEX_CURSOR';
const MARKETS_REVIEW_INDEX_BATCH = 3000;
const MARKETS_REVIEW_INDEX_STATUS = 'MARKETS_REVIEW_INDEX_STATUS';
const MARKETS_FUNCTIONAL_MIGRATION_PREVIOUS = 'MARKETS_FUNCTIONAL_MIGRATION_PREVIOUS';

function marketsReviewIndexSheet_(ss, extend = false) {
  const active = marketsFunctionalEngine_(PropertiesService.getScriptProperties());
  const sheet = marketsFunctionalIndexSheet_(ss, active || { sheet: MARKETS_REVIEW_INDEX });
  return sheet && marketsAppendSheetHeaders_(sheet, MARKETS_REVIEW_INDEX_HEADERS, [7], extend)?.sheet;
}

function marketsFunctionalIndexSheet_(ss, target) {
  const workbook = target.indexSpreadsheetId ? SpreadsheetApp.openById(target.indexSpreadsheetId) : ss;
  return workbook.getSheetByName(target.sheet);
}

function initializeMarketsReviewIndex() {
  const { ss } = requireMarketsReviewOwner_();
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) throw new Error('Hay otra operación de reseñas en curso.');
  try {
    marketsReviewSheet_(ss);
    if (marketsReviewIndexSheet_(ss)) return { created: false };
    const sheet = ss.insertSheet(MARKETS_REVIEW_INDEX);
    sheet.getRange(1, 1, 1, MARKETS_REVIEW_INDEX_HEADERS.length).setValues([MARKETS_REVIEW_INDEX_HEADERS]);
    sheet.setFrozenRows(1);
    return { created: true };
  } finally {
    lock.releaseLock();
  }
}

function marketsReviewTextDigest_(row) {
  return marketsReviewDigest_([row[9], row[10]]);
}

function advanceMarketsReviewIndex_() {
  const migration = safeJsonParse_(PropertiesService.getScriptProperties().getProperty('MARKETS_FUNCTIONAL_MIGRATION') || 'null');
  if (migration && !migration.complete) return advanceMarketsFunctionalMigration_();
  const ss = openMarketsSpreadsheet_();
  const index = marketsReviewIndexSheet_(ss);
  if (!index) return { complete: true, done: 0, total: 0, updated: 0 };
  const active = marketsFunctionalEngine_(PropertiesService.getScriptProperties());
  if (active?.libraryVersion && active.libraryVersion !== MARKETS_REVIEW_LIBRARY_VERSION) return { deferred: true };
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return { deferred: true };
  const properties = PropertiesService.getScriptProperties();
  const status = safeJsonParse_(properties.getProperty(MARKETS_REVIEW_INDEX_STATUS)) || {};
  let checkpoint = status;
  const save = result => {
    const updatedAt = new Date().toISOString();
    checkpoint = { ...result, updatedAt, lastProgressAt: result.done > (checkpoint.done || 0) ? updatedAt : checkpoint.lastProgressAt || null };
    properties.setProperty(MARKETS_REVIEW_INDEX_STATUS, JSON.stringify(checkpoint));
    return checkpoint;
  };
  try {
    marketsReviewIndexSheet_(ss, true);
    const source = marketsReviewSheet_(ss);
    const { rules, version: functionalVersion, library } = marketsReviewClassification_(ss);
    const audience = marketsAudienceCatalog_(ss);
    const version = marketsAudienceIndexVersion_(functionalVersion, audience.revision);
    const previous = safeJsonParse_(properties.getProperty(MARKETS_REVIEW_INDEX_CURSOR));
    const last = source.getLastRow(), total = Math.max(0, last - 1);
    const start = previous?.version === version && Number.isInteger(previous.next) && previous.next >= 2 && previous.next <= last + 1 ? previous.next : 2;
    if (start > last) return status.complete && status.done === total && status.total === total && !status.error ? status :
      save({ complete: true, done: total, total, updated: 0 });
    save({ done: start - 2, total, updated: 0, complete: false, runningUntil: Date.now() + 6 * 60 * 1000 });
    const count = Math.min(MARKETS_REVIEW_INDEX_BATCH, last - start + 1);
    const width = MARKETS_REVIEW_INDEX_HEADERS.length;
    ensureSheetCapacity_(index, start + count - 1, width);
    const range = index.getRange(start, 1, count, width);
    const old = range.getValues();
    let updated = 0;
    const sourceRows = source.getRange(start, 1, count, 11).getValues();
    const sameFunctionalRow = (row, i, hash) => old[i][0] === row[0] && old[i][1] === hash &&
      marketsAudienceMatchesFunctionalVersion_(old[i][2], functionalVersion) && old[i][7];
    const missing = library ? sourceRows.filter((row, i) => row[0] &&
      !sameFunctionalRow(row, i, marketsReviewTextDigest_(row))) : [];
    const predictions = library && missing.length ? classifyMarketsFunctionalBatch_(missing, library.pins) : [];
    const idsByKey = new Map(missing.map((row, i) => [row[0], predictions[i]]));
    const values = sourceRows.map((row, i) => {
      if (!row[0]) return Array(width).fill('');
      const hash = marketsReviewTextDigest_(row);
      if (old[i][0] === row[0] && old[i][1] === hash && old[i][2] === version && old[i][7]) return old[i];
      const original = marketsReviewOriginalText_(row);
      const decision = classifyMarketsReviewAudience_(original, audience.rules);
      const topics = sameFunctionalRow(row, i, hash) ? old[i][3]
        : JSON.stringify(library ? idsByKey.get(row[0]) : classifyReviewEvidence_(original, rules));
      updated++;
      return [marketsReviewLiteral_(row[0]), hash, version, topics,
        decision.audience, decision.sharedOperation, decision.reason, decision.relevance, JSON.stringify(decision.evidence)];
    });
    if (updated || old.some((row, i) => row[0] && !values[i][0])) {
      range.setValues(values);
      SpreadsheetApp.flush();
    }
    const next = start + count;
    if (next > last) advanceMarketsReviewGeneration_(properties);
    properties.setProperty(MARKETS_REVIEW_INDEX_CURSOR, JSON.stringify({ version, next }));
    return save({ complete: next > last, done: next - 2, total, updated });
  } catch (error) {
    const current = safeJsonParse_(properties.getProperty(MARKETS_REVIEW_INDEX_STATUS)) || status;
    delete current.runningUntil;
    save({ ...current, error: errorToString_(error).slice(0, 180) });
    throw error;
  } finally {
    lock.releaseLock();
  }
}

/** Call on an in-place source edit while holding the ingestion lock. Appends need no reset. */
function invalidateMarketsReviewIndexFrom_(properties, rowNumber) {
  const cursor = safeJsonParse_(properties.getProperty(MARKETS_REVIEW_INDEX_CURSOR));
  if (cursor && rowNumber < cursor.next) {
    properties.setProperty(MARKETS_REVIEW_INDEX_CURSOR, JSON.stringify({ ...cursor, next: rowNumber }));
    const status = safeJsonParse_(properties.getProperty(MARKETS_REVIEW_INDEX_STATUS));
    if (status) properties.setProperty(MARKETS_REVIEW_INDEX_STATUS,
      JSON.stringify({ ...status, complete: false, done: rowNumber - 2, updatedAt: new Date().toISOString() }));
  }
}

/** Motor funcional compartido; la audiencia BEI conserva su contrato independiente. */
function classifyMarketsFunctionalBatch_(rows, pins) {
  if (!rows.length) return [];
  const records = rows.map(row => ({ id: String(row[0]), text: marketsReviewOriginalText_(row) }));
  const batch = EDCCatalogClassifier.classifyBatch(records, { ...pins, caller: 'MarketPulse',
    jobId: 'MP-' + marketsReviewDigest_([pins, records.map(row => row.id)]).slice(0, 60),
    requirePinnedRevisions: true, failOnRecordError: true });
  for (const [field, expected] of [['revision', pins.expectedRevision], ['algorithmVersion', pins.expectedAlgorithmVersion],
    ['rulesRevision', pins.expectedRulesRevision], ['translationsRevision', pins.expectedTranslationsRevision]]) {
    if (batch[field] !== expected) throw new Error('La biblioteca cambió de revisión: ' + field);
  }
  if (!Array.isArray(batch.results) || batch.results.length !== records.length) throw new Error('Lote funcional incompleto.');
  return batch.results.map((result, index) => {
    if (result.error || result.id !== records[index].id || !Array.isArray(result.assignments)) throw new Error('Respuesta funcional inválida.');
    const ids = result.assignments.map(item => item.id);
    if (ids.some(id => typeof id !== 'string' || !/^\d{2}\.(?:\d{2}|xx)$/.test(id))) throw new Error('ID funcional inválido.');
    return [...new Set(ids)];
  });
}

/** Preflight + backup de derivados. No modifica las reseñas ni activa el motor. */
function startMarketsFunctionalMigration() {
  const { ss } = requireMarketsReviewOwner_();
  const properties = PropertiesService.getScriptProperties(), lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) throw new Error('Hay otra operación de reseñas en curso.');
  try {
    const previousMigration = properties.getProperty('MARKETS_FUNCTIONAL_MIGRATION');
    const existing = safeJsonParse_(previousMigration || 'null');
    if (existing && (!existing.complete || (existing.libraryVersion || '1') === MARKETS_REVIEW_LIBRARY_VERSION)) return existing;
    const active = marketsFunctionalEngine_(properties);
    if (existing && active?.sheet !== existing.sheet) throw new Error('El índice activo no coincide con la migración anterior.');
    if (!EDCCatalogClassifier.fcPreflight()?.ok) throw new Error('La biblioteca no supera su preflight.');
    const pins = EDCCatalogClassifier.getClassifierRevisions();
    for (const field of ['expectedRevision', 'expectedAlgorithmVersion', 'expectedRulesRevision', 'expectedTranslationsRevision']) {
      if (!pins[field]) throw new Error('La biblioteca no permite fijar todas sus revisiones.');
    }
    const source = marketsReviewSheet_(ss), index = marketsReviewIndexSheet_(ss);
    if (!index) throw new Error('Falta el índice funcional que debe respaldarse.');
    const total = Math.max(0, source.getLastRow() - 1);
    const inventory = total ? source.getRange(2, 1, total, 8).getValues() : [];
    const keys = inventory.filter(row => row[0]).map(row => String(row[0]));
    if (new Set(keys).size !== keys.length) throw new Error('Hay claves duplicadas en la fuente; no se inicia la migración.');
    const representatives = new Map();
    inventory.forEach((row, offset) => {
      const key = row[2] + '|' + row[3];
      if (row[0] && !representatives.has(key) && representatives.size < 24) representatives.set(key, offset + 2);
    });
    const sample = [...representatives.values()].map(row => source.getRange(row, 1, 1, 11).getValues()[0]);
    const started = Date.now();
    classifyMarketsFunctionalBatch_(sample, pins);
    const sampleMs = Date.now() - started;
    const suffix = String(Date.now());
    const width = MARKETS_REVIEW_INDEX_HEADERS.length;
    const allocated = existing && ss.getSheets().reduce((cells, sheet) => cells + sheet.getMaxRows() * sheet.getMaxColumns(), 0);
    const separate = existing && allocated + (total + 1001) * width > 10000000;
    // El índice anterior queda inmóvil: el worker dirige la clasificación a la sombra.
    const backup = existing ? index : index.copyTo(ss).setName('REVIEW_INDEX_BACKUP_' + suffix);
    const backupDigest = marketsReviewDigest_(backup.getRange(1, 1, backup.getLastRow(), MARKETS_REVIEW_INDEX_HEADERS.length).getValues());
    if (backup.getLastRow() !== index.getLastRow() || backupDigest !==
        marketsReviewDigest_(index.getRange(1, 1, index.getLastRow(), MARKETS_REVIEW_INDEX_HEADERS.length).getValues())) {
      throw new Error('No se pudo verificar el respaldo del índice.');
    }
    const shadowName = 'REVIEW_INDEX_EDC_' + suffix;
    const isolated = separate ? SpreadsheetApp.create('Market Pulse · Índice funcional ' + suffix, 1000, width) : null;
    const shadow = isolated ? isolated.getSheets()[0].setName(shadowName) : ss.insertSheet(shadowName);
    if (existing && shadow.getMaxColumns() > width) {
      shadow.deleteColumns(width + 1, shadow.getMaxColumns() - width);
    }
    shadow.getRange(1, 1, 1, MARKETS_REVIEW_INDEX_HEADERS.length).setValues([MARKETS_REVIEW_INDEX_HEADERS]);
    shadow.setFrozenRows(1);
    const state = { pins, libraryVersion: MARKETS_REVIEW_LIBRARY_VERSION, sheet: shadow.getName(),
      ...(isolated ? { indexSpreadsheetId: isolated.getId() } : {}),
      ...(existing && active?.indexSpreadsheetId ? { backupSpreadsheetId: active.indexSpreadsheetId } : {}),
      backup: backup.getName(), backupDigest, next: 2,
      previousSnapshot: properties.getProperty(MARKETS_REVIEW_SNAPSHOT_POINTER), eligibleTotal: keys.length, processedEligible: 0,
      sourceGeneration: properties.getProperty('MARKETS_REVIEW_SOURCE_GENERATION') || '',
      total, done: 0, complete: false,
      before: {}, after: {}, errors: 0, sampleMs, sampleSize: sample.length, startedAt: new Date().toISOString() };
    if (existing) properties.setProperty(MARKETS_FUNCTIONAL_MIGRATION_PREVIOUS, previousMigration);
    properties.setProperty('MARKETS_FUNCTIONAL_MIGRATION', JSON.stringify(state));
    console.log(JSON.stringify({ operation: 'functional-migration-preflight', total, eligibleTotal: keys.length,
      backup: state.backup, sampleMs, sampleSize: sample.length, libraryVersion: MARKETS_REVIEW_LIBRARY_VERSION, pins }));
    return state;
  } finally { lock.releaseLock(); }
}

/** Lotes idempotentes bajo el worker existente; activación solo al verificar el 100 %. */
function advanceMarketsFunctionalMigration_() {
  const properties = PropertiesService.getScriptProperties(), lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return { deferred: true };
  try {
    const state = safeJsonParse_(properties.getProperty('MARKETS_FUNCTIONAL_MIGRATION') || 'null');
    if (!state || state.complete) return state || { complete: true };
    const ss = openMarketsSpreadsheet_(), source = marketsReviewSheet_(ss), shadow = marketsFunctionalIndexSheet_(ss, state);
    if (!shadow) throw new Error('No existe el índice de migración.');
    const generation = properties.getProperty('MARKETS_REVIEW_SOURCE_GENERATION') || '';
    const active = marketsFunctionalEngine_(properties);
    const version = marketsReviewDigest_([MARKETS_REVIEW_CLASSIFIER_SCHEMA, MARKETS_REVIEW_AUDIENCE_VERSION, state.pins]);
    if (active?.sheet === state.sheet) {
      const unchanged = generation === state.sourceGeneration;
      properties.setProperty(MARKETS_REVIEW_INDEX_CURSOR, JSON.stringify({ version, next: unchanged ? state.total + 2 : 2 }));
      properties.setProperty(MARKETS_REVIEW_INDEX_STATUS, JSON.stringify({ complete: unchanged, done: unchanged ? state.total : 0,
        total: source.getLastRow() - 1, updated: 0 }));
      state.complete = true;
      state.activatedAt = safeJsonParse_(properties.getProperty(MARKETS_REVIEW_SNAPSHOT_POINTER)).publishedAt;
      properties.setProperty('MARKETS_FUNCTIONAL_MIGRATION', JSON.stringify(state));
      return state;
    }
    if (generation !== state.sourceGeneration || source.getLastRow() - 1 !== state.total) {
      state.restarts = (state.restarts || 0) + 1;
      Object.assign(state, { sourceGeneration: generation, total: source.getLastRow() - 1, next: 2, done: 0, processedEligible: 0, before: {}, after: {} });
      const keys = state.total ? source.getRange(2, 1, state.total, 1).getValues().flat().filter(Boolean) : [];
      if (new Set(keys).size !== keys.length) throw new Error('Hay claves duplicadas en la fuente modificada.');
      state.eligibleTotal = keys.length;
      delete state.verifyNext;
      delete state.ready;
      properties.setProperty('MARKETS_FUNCTIONAL_MIGRATION', JSON.stringify(state));
      return { ...state, complete: false };
    }
    if (state.ready) return { ...state, complete: false };
    const remaining = state.total + 2 - state.next;
    if (remaining > 0) {
      // El tamaño se basa en el coste de la muestra, con margen para I/O y cuotas.
      const perRow = Math.max(1, state.sampleMs / Math.max(1, state.sampleSize));
      const count = Math.min(MARKETS_REVIEW_INDEX_BATCH, remaining, Math.max(1, Math.floor(120000 / perRow)));
      const rows = source.getRange(state.next, 1, count, 11).getValues();
      const eligible = rows.filter(row => row[0]);
      const width = MARKETS_REVIEW_INDEX_HEADERS.length;
      ensureSheetCapacity_(shadow, state.next + count - 1, width);
      const range = shadow.getRange(state.next, 1, count, width);
      const existingRows = range.getValues();
      const matches = (row, i) => existingRows[i][0] === row[0] && existingRows[i][2] === version &&
        existingRows[i][1] === marketsReviewTextDigest_(row) && existingRows[i][7];
      const missing = rows.filter((row, i) => row[0] && !matches(row, i));
      const predictions = classifyMarketsFunctionalBatch_(missing, state.pins);
      const byKey = new Map(missing.map((row, i) => [row[0], predictions[i]]));
      const values = rows.map((row, i) => {
        if (!row[0]) return Array(width).fill('');
        if (matches(row, i)) {
          byKey.set(row[0], safeJsonParse_(existingRows[i][3]));
          return existingRows[i];
        }
        const { audience, sharedOperation, reason, relevance, evidence } = classifyMarketsReviewAudience_(marketsReviewOriginalText_(row));
        return [marketsReviewLiteral_(row[0]), marketsReviewTextDigest_(row), version, JSON.stringify(byKey.get(row[0])),
          audience, sharedOperation, reason, relevance, JSON.stringify(evidence)];
      });
      if (JSON.stringify(existingRows) !== JSON.stringify(values)) {
        range.setValues(values);
        SpreadsheetApp.flush();
        const verified = range.getValues();
        if (JSON.stringify(verified) !== JSON.stringify(values)) throw new Error('No se pudo verificar el lote funcional.');
      }
      const original = marketsReviewIndexSheet_(ss), available = Math.max(0, Math.min(count, original.getLastRow() - state.next + 1));
      const old = available ? original.getRange(state.next, 1, available, MARKETS_REVIEW_INDEX_HEADERS.length).getValues() : [];
      for (const [index, row] of rows.entries()) {
        if (!row[0]) continue;
        const beforeIds = old[index]?.[0] === row[0] && old[index]?.[1] === marketsReviewTextDigest_(row)
          ? safeJsonParse_(old[index]?.[3] || '[]') || [] : null;
        for (const [distribution, ids] of [[state.before, beforeIds], [state.after, byKey.get(row[0])]]) {
          if (!ids) { distribution.unindexed = (distribution.unindexed || 0) + 1; continue; }
          const blocks = [...new Set(ids.map(id => id.slice(0, 2)))];
          for (const block of blocks.length ? blocks : ['general']) {
            distribution[block] = (distribution[block] || 0) + 1;
          }
        }
      }
      state.next += count;
      state.processedEligible += eligible.length;
      state.done = state.next - 2;
      state.updatedAt = new Date().toISOString();
      properties.setProperty('MARKETS_FUNCTIONAL_MIGRATION', JSON.stringify(state));
      properties.setProperty(MARKETS_REVIEW_INDEX_STATUS, JSON.stringify({ done: state.done, total: state.total,
        complete: false, updatedAt: state.updatedAt, engine: 'EDCCatalogClassifier' }));
      return { ...state, complete: false };
    }
    // Segunda pasada ligera y reanudable: claves, huellas, versiones y cardinalidad.
    const verify = state.verifyNext || 2;
    const count = Math.min(10000, state.total + 2 - verify);
    if (count > 0) {
      const rows = source.getRange(verify, 1, count, 11).getValues();
      const derived = shadow.getRange(verify, 1, count, 3).getValues();
      if (rows.some((row, i) => row[0] && (derived[i][0] !== row[0] || derived[i][1] !== marketsReviewTextDigest_(row) || derived[i][2] !== version))) {
        throw new Error('El índice reclasificado no coincide con la fuente.');
      }
      state.verifyNext = verify + count;
      properties.setProperty('MARKETS_FUNCTIONAL_MIGRATION', JSON.stringify(state));
      return { ...state, complete: false };
    }
    // El publicador construirá el snapshot con este índice, sin activarlo aún.
    if (state.processedEligible !== state.eligibleTotal) throw new Error('No se ha procesado el total de opiniones elegibles.');
    state.ready = true;
    properties.setProperty('MARKETS_FUNCTIONAL_MIGRATION', JSON.stringify(state));
    properties.setProperty('MARKETS_REVIEW_MANUAL:publish', String(Date.now()));
    return state;
  } catch (error) {
    const state = safeJsonParse_(properties.getProperty('MARKETS_FUNCTIONAL_MIGRATION') || 'null');
    if (state) properties.setProperty('MARKETS_FUNCTIONAL_MIGRATION', JSON.stringify({ ...state,
      errors: (state.errors || 0) + 1, lastError: errorToString_(error).slice(0, 180) }));
    throw error;
  } finally { lock.releaseLock(); }
}

function advanceMarketsFunctionalMigration() {
  requireMarketsReviewOwner_();
  const deadline = Date.now() + 235000;
  let result, longest = 0;
  for (let step = 0; step < 12 && Date.now() + 2 * longest < deadline; step++) {
    const started = Date.now();
    result = advanceMarketsFunctionalMigration_();
    longest = Math.max(longest, Date.now() - started);
    if (result.deferred || result.ready || result.complete) break;
  }
  console.log(JSON.stringify({ operation: 'functional-migration', done: result.done, total: result.total,
    verified: Math.max(0, (result.verifyNext || 2) - 2), complete: result.complete, errors: result.errors,
    ready: Boolean(result.ready), deferred: Boolean(result.deferred), before: result.before, after: result.after }));
  return result;
}

/** Owner-only rotation before retiring legacy migration metadata. */
function rotateMarketsFunctionalV5Snapshot() {
  requireMarketsReviewOwner_();
  const properties = PropertiesService.getScriptProperties();
  const state = safeJsonParse_(properties.getProperty('MARKETS_FUNCTIONAL_MIGRATION') || 'null');
  const engine = marketsFunctionalEngine_(properties);
  if (!state?.complete || state.rolledBackAt || state.libraryVersion !== '5' ||
      engine?.libraryVersion !== '5' || engine.sheet !== state.sheet || engine.indexSpreadsheetId !== state.indexSpreadsheetId) {
    throw new Error('El clasificador v5 no está activo y verificado.');
  }
  const result = publishMarketsReviewSnapshot_(true);
  console.log(JSON.stringify(result));
  return result;
}

/** Retira la reversión a v1 solo cuando ambos snapshots usan el índice v5. */
function retireMarketsFunctionalV1References() {
  const { ss } = requireMarketsReviewOwner_();
  const properties = PropertiesService.getScriptProperties(), lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) throw new Error('Hay otra operación de reseñas en curso.');
  try {
    const state = safeJsonParse_(properties.getProperty('MARKETS_FUNCTIONAL_MIGRATION') || 'null');
    const snapshots = [MARKETS_REVIEW_SNAPSHOT_POINTER, 'MARKETS_REVIEW_SNAPSHOT_PREVIOUS']
      .map(key => safeJsonParse_(properties.getProperty(key) || 'null'));
    if (!state?.complete || state.rolledBackAt || state.libraryVersion !== '5' || !state.indexSpreadsheetId ||
        snapshots.some(item => item?.engine?.libraryVersion !== '5' || item.engine.sheet !== state.sheet ||
          item.engine.indexSpreadsheetId !== state.indexSpreadsheetId || !Object.keys(item.files || {}).length) ||
        !marketsReviewIndexSheet_(ss)) {
      throw new Error('Los dos punteros y el índice activo deben estar verificados en v5.');
    }
    const old = safeJsonParse_(properties.getProperty(MARKETS_FUNCTIONAL_MIGRATION_PREVIOUS) || 'null');
    const retired = [state.backup, old?.sheet, old?.backup].filter(Boolean);
    for (const field of ['backup', 'backupDigest', 'backupSpreadsheetId', 'previousSnapshot']) delete state[field];
    state.retiredLegacyAt = new Date().toISOString();
    properties.setProperty('MARKETS_FUNCTIONAL_MIGRATION', JSON.stringify(state));
    properties.deleteProperty(MARKETS_FUNCTIONAL_MIGRATION_PREVIOUS);
    const result = { active: state.sheet, retired: [...new Set(retired)] };
    console.log(JSON.stringify(result));
    return result;
  } finally { lock.releaseLock(); }
}

/** Reversión de punteros y derivados: conserva fuente, backup e índice de sombra. */
function rollbackMarketsFunctionalMigration() {
  const { ss } = requireMarketsReviewOwner_();
  const properties = PropertiesService.getScriptProperties(), lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) throw new Error('Hay otra operación de reseñas en curso.');
  try {
    const state = safeJsonParse_(properties.getProperty('MARKETS_FUNCTIONAL_MIGRATION') || 'null');
    if (!state || state.retiredLegacyAt || marketsFunctionalEngine_(properties)?.sheet !== state.sheet || state.rolledBackAt) throw new Error('No hay una migración activada que revertir.');
    const backup = marketsFunctionalIndexSheet_(ss, { sheet: state.backup, indexSpreadsheetId: state.backupSpreadsheetId });
    if (!backup || marketsReviewDigest_(backup.getRange(1, 1, backup.getLastRow(), MARKETS_REVIEW_INDEX_HEADERS.length).getValues()) !== state.backupDigest) {
      throw new Error('El respaldo no coincide con el verificado antes de migrar.');
    }
    if (state.previousSnapshot) properties.setProperty(MARKETS_REVIEW_SNAPSHOT_POINTER, state.previousSnapshot);
    else properties.deleteProperty(MARKETS_REVIEW_SNAPSHOT_POINTER);
    properties.deleteProperty(MARKETS_REVIEW_INDEX_CURSOR);
    state.rolledBackAt = new Date().toISOString();
    state.complete = true;
    properties.setProperty('MARKETS_FUNCTIONAL_MIGRATION', JSON.stringify(state));
    properties.setProperty('MARKETS_REVIEW_MANUAL:publish', String(Date.now()));
    return { restored: true, backup: state.backup, rolledBackAt: state.rolledBackAt };
  } finally { lock.releaseLock(); }
}

const MARKETS_ANDROID_GEO_VERSION = 1;
const MARKETS_ANDROID_GEO_SHEET = 'MARKET_REVIEW_GEOGRAPHY';
const MARKETS_ANDROID_GEO_HEADERS = ['review_key', 'package_id', 'text_digest', 'country', 'rule_version', 'reviewed_at', 'reviewed_by', 'reason'];
const MARKETS_ANDROID_GEO_RAILS = [
  ['PE', /\b(?:plin|yape)\b/u], ['MX', /\b(?:spei|curp)\b/u],
  ['CO', /\bpse\b/u], ['ES', /\bbizum\b/u]
];

function marketsAndroidGeographyCandidate_(original, eligible) {
  const text = normalizeReviewEvidence_(original);
  const matches = MARKETS_ANDROID_GEO_RAILS.filter(([, pattern]) => pattern.test(text));
  if (matches.length > 1) return { status: 'CONFLICTO' };
  if (!matches.length) return { status: 'SIN_EVIDENCIA' };
  const [country, rail] = matches[0];
  if (!eligible.includes(country)) return { status: 'FUERA_DE_CATALOGO' };
  if (/\b(?:no (?:uso|utilizo|vivo)|nunca|mi amigo|mi familiar|de viaje|en otro pais)\b/u.test(text)) {
    return { status: 'CONTEXTO_NEGATIVO' };
  }
  const ownUse = /\b(?:mi|mis|no llega|no puedo|me cobr\w*|envi[eoa]|pagu[eoa])\b/u.test(text);
  return { status: ownUse ? 'VALIDAR' : 'SIN_CONTEXTO', candidate: country, evidence: rail.exec(text)[0] };
}

/** Publish only direct, first-person use of a unique local payment rail. */
function inferMarketsAndroidCountry_(original, eligible) {
  const result = marketsAndroidGeographyCandidate_(original, eligible);
  if (result.status !== 'VALIDAR' || result.evidence === 'curp') return null;
  const text = normalizeReviewEvidence_(original);
  if (/\b(?:si pudiera|si viviera|como en|a diferencia de|mi (?:amigo|familia|hermano)|desde (?:el extranjero|otro pais))\b/u.test(text)) return null;
  const rail = result.evidence;
  const use = new RegExp('\\b(?:mi ' + rail + '|no puedo (?:pagar|enviar|transferir) (?:con|por) ' +
    rail + '|no llega (?:el|mi) ' + rail + '|(?:pague|envie|transferi) (?:con|por) ' + rail + ')\\b', 'u');
  return use.test(text) ? result : null;
}

function readMarketsAndroidGeography_(ss) {
  const sheet = ss.getSheetByName(MARKETS_ANDROID_GEO_SHEET);
  const approved = new Map();
  if (!sheet) return approved;
  const width = MARKETS_ANDROID_GEO_HEADERS.length;
  assertCurrentSheetContract_(sheet, MARKETS_ANDROID_GEO_HEADERS,
    sheet.getRange(1, 1, 1, Math.max(width, sheet.getLastColumn())).getValues()[0]);
  if (sheet.getLastRow() < 2) return approved;
  const records = sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
  for (const [index, row] of records.entries()) {
    const [key, packageName, digest, country, version, reviewedAt, reviewer, reason] = row;
    if (!key) continue;
    // A duplicate is ambiguous, even if both approval rows agree.
    approved.set(key, !approved.has(key) && version === MARKETS_ANDROID_GEO_VERSION &&
      reviewedAt && reviewer && reason ? { packageName, digest, country, reason, rowNumber: index + 2, automatic: reviewer === 'automatic' } : null);
  }
  return approved;
}

function initializeMarketsReviewGeography() {
  const { ss } = requireMarketsReviewOwner_();
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) throw new Error('Hay otra operación de reseñas en curso.');
  try {
    marketsReviewSheet_(ss);
    if (ss.getSheetByName(MARKETS_ANDROID_GEO_SHEET)) {
      readMarketsAndroidGeography_(ss);
      return { created: false };
    }
    const sheet = ss.insertSheet(MARKETS_ANDROID_GEO_SHEET);
    sheet.getRange(1, 1, 1, MARKETS_ANDROID_GEO_HEADERS.length).setValues([MARKETS_ANDROID_GEO_HEADERS]);
    sheet.setFrozenRows(1);
    return { created: true };
  } finally {
    lock.releaseLock();
  }
}

function refreshMarketsReviewGeography() {
  const { ss } = requireMarketsReviewOwner_();
  const approved = readMarketsAndroidGeography_(ss);
  PropertiesService.getScriptProperties().setProperty('MARKETS_REVIEW_GEOGRAPHY_REVISION', Utilities.getUuid());
  return { reviewed: approved.size, valid: [...approved.values()].filter(record => record?.country).length };
}

const MARKETS_GEO_AUDIT_PROPERTY = 'MARKETS_ANDROID_GEO_AUDIT';
const MARKETS_GEO_ITERATION_23 = 'MARKETS_GEO_ITERATION_23_BACKUP';
const MARKETS_GEO_SPAIN_CONFIRMATIONS = 'MARKETS_GEO_SPAIN_CONFIRMATIONS';
const MARKETS_GEO_SPAIN_REASON = 'spain-owner-confirmed';

/** Apply only individually confirmed keys, preserving the original review and storefront. */
function applyMarketsSpainReviewApprovals() {
  const { ss, email } = requireMarketsReviewOwner_();
  const properties = PropertiesService.getScriptProperties();
  const approved = safeJsonParse_(properties.getProperty(MARKETS_GEO_SPAIN_CONFIRMATIONS));
  if (!Array.isArray(approved) || !approved.length || approved.length > 20 ||
      approved.some(item => typeof item?.key !== 'string' || item.key.length > 250 ||
        !/^[A-Za-z0-9_-]{43}=$/.test(item.digest)) ||
      new Set(approved.map(item => item.key)).size !== approved.length) {
    throw new Error('Indica las claves únicas y sus huellas verificadas en MARKETS_GEO_SPAIN_CONFIRMATIONS.');
  }
  const backup = safeJsonParse_(properties.getProperty(MARKETS_GEO_ITERATION_23));
  if (!backup?.backupId) throw new Error('Verifica primero la copia de geografía con enableMarketsIteration23Geography.');
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) throw new Error('Hay otra operación de reseñas en curso.');
  try {
    const source = marketsReviewSheet_(ss);
    const target = requireCurrentSheetContract_(ss, MARKETS_ANDROID_GEO_SHEET, MARKETS_ANDROID_GEO_HEADERS);
    const approvals = readMarketsAndroidGeography_(ss);
    const packages = new Map();
    for (const app of readAppCatalog_(ss)) {
      if (app.platform !== 'Android' || !app.packageName) continue;
      if (!packages.has(app.packageName)) packages.set(app.packageName, new Set());
      packages.get(app.packageName).add(app.countryCode);
    }
    const edits = [];
    const width = marketsReviewWidth_(source);
    if (source.getLastRow() < 2) throw new Error('No hay reseñas que verificar.');
    const keyColumn = source.getRange(2, 1, source.getLastRow() - 1, 1);
    let nextRow = target.getLastRow() + 1;
    for (const { key, digest } of approved) {
      const found = keyColumn.createTextFinder(key).matchEntireCell(true).findAll();
      if (found.length !== 1) throw new Error('Una clave confirmada falta o está duplicada.');
      const row = source.getRange(found[0].getRow(), 1, 1, width).getValues()[0];
      if (!marketsAndroidGeographyEligible_(row, packages) || !packages.get(row[4]).has('ES')) {
        throw new Error('Una reseña confirmada carece de una ficha Android compartida elegible para España.');
      }
      const previous = approvals.get(key);
      if ((approvals.has(key) && !previous) || (previous?.country && previous.country !== 'ES')) {
        throw new Error('Una aprobación existente es ambigua o asigna otra geografía.');
      }
      if (marketsAndroidGeographyDigest_(row, false) !== digest) throw new Error('El texto de una reseña confirmada cambió.');
      if (previous?.country === 'ES' && previous.reason === MARKETS_GEO_SPAIN_REASON && previous.digest === digest) continue;
      edits.push([previous?.rowNumber || nextRow++, [marketsReviewLiteral_(key), row[4], digest,
        'ES', MARKETS_ANDROID_GEO_VERSION, new Date(), email, MARKETS_GEO_SPAIN_REASON]]);
    }
    if (!edits.length) return { updated: 0, confirmed: approved.length };
    ensureSheetCapacity_(target, nextRow - 1, MARKETS_ANDROID_GEO_HEADERS.length);
    properties.setProperty('MARKETS_REVIEW_GEOGRAPHY_REVISION', Utilities.getUuid());
    for (const [position, values] of edits) target.getRange(position, 1, 1, values.length).setValues([values]);
    SpreadsheetApp.flush();
    properties.setProperty('MARKETS_REVIEW_GEOGRAPHY_REVISION', Utilities.getUuid());
    return { updated: edits.length, confirmed: approved.length };
  } finally {
    lock.releaseLock();
  }
}

/** Authorize the historic scan only after a fresh recoverable copy is verified. */
function enableMarketsIteration23Geography() {
  const { ss } = requireMarketsReviewOwner_();
  const properties = PropertiesService.getScriptProperties();
  const existing = safeJsonParse_(properties.getProperty(MARKETS_GEO_ITERATION_23));
  if (existing?.backupId) return existing;
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) throw new Error('Hay una operación de reseñas en curso.');
  try {
    const ready = safeJsonParse_(properties.getProperty(MARKETS_GEO_ITERATION_23));
    if (ready?.backupId) return ready;
    const geography = ss.getSheetByName(MARKETS_ANDROID_GEO_SHEET);
    if (!geography) throw new Error('Falta la hoja de geografía de reseñas.');
    requireCurrentSheetContract_(ss, MARKETS_ANDROID_GEO_SHEET, MARKETS_ANDROID_GEO_HEADERS);
    const source = marketsReviewSheet_(ss);
    const folder = DriveApp.getFolderById(marketsStorageFolders_(properties).backups);
    const name = 'EDC Market Pulse - Antes de inferencia Iteración 23';
    const previousName = 'Market Pulse - Antes de inferencia Iteración 23';
    const current = folder.getFilesByName(name);
    const candidates = current.hasNext() ? current : folder.getFilesByName(previousName);
    const copy = candidates.hasNext() ? candidates.next() : DriveApp.getFileById(ss.getId()).makeCopy(name, folder);
    if (candidates.hasNext()) throw new Error('Hay varias copias de la Iteración 23 y deben revisarse.');
    const backup = SpreadsheetApp.openById(copy.getId());
    const backupGeography = backup.getSheetByName(MARKETS_ANDROID_GEO_SHEET);
    const sameGeography = backupGeography &&
      marketsReviewDigest_(backupGeography.getDataRange().getValues()) === marketsReviewDigest_(geography.getDataRange().getValues());
    if (!sameGeography || backup.getSheetByName('MARKET_REVIEWS')?.getLastRow() !== source.getLastRow()) {
      throw new Error('La copia debe coincidir con las filas de origen y las aprobaciones geográficas vigentes.');
    }
    const result = { backupId: copy.getId(), enabledAt: new Date().toISOString(), geographyRows: geography.getLastRow() - 1 };
    properties.setProperty(MARKETS_GEO_ITERATION_23, JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function advanceMarketsAndroidGeography_(now = new Date()) {
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return null;
  try {
    return scanMarketsAndroidGeographyBatch_(now);
  } catch (error) {
    const properties = PropertiesService.getScriptProperties();
    const state = safeJsonParse_(properties.getProperty(MARKETS_GEO_AUDIT_PROPERTY)) || {};
    delete state.runningUntil;
    properties.setProperty(MARKETS_GEO_AUDIT_PROPERTY, JSON.stringify({ ...state,
      updatedAt: new Date().toISOString(), error: errorToString_(error).slice(0, 180) }));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function marketsAndroidReplyEvidence_(reply) {
  const value = String(reply || '').normalize('NFKC').toLowerCase().replace(/(?<=\d)[\s().-]+(?=\d)/g, '');
  const text = normalizeReviewEvidence_(reply);
  const matches = new Map();
  if (/\b(?:no (?:llames|uses|escribas)|no (?:es|corresponde a) (?:nuestra linea|nuestro telefono)|linea (?:anterior|de otro banco))\b/u.test(text)) return matches;
  const contact = /\b(?:atencion|llamanos|llamar|telefono|comunicate|contactanos|escribenos|puedes (?:llamar|escribir)|linea (?:empresarial|especializada))\b/u.test(text);
  if (contact && (/\bbbvaempresasresponde@bbva\.com(?![\w.-])/i.test(value.replace(/\.(?=\s|$)/g, '')) ||
      /(?:^|[^\d+])(?:(?:\+34|0034))?912249802(?!\d)/.test(value))) matches.set('ES', 'support-es');
  if (contact && /(?:^|[^\d+])(?:(?:\+57|0057))?601\d{7}(?!\d)/.test(value)) {
    matches.set('CO', 'support-co-local-format');
  }
  if (contact && /(?:^|[^\d+])(?:(?:\+57|0057)?601)?3078071(?!\d)/.test(value)) matches.set('CO', 'support-co');
  return matches;
}

function marketsAndroidGeographyEvidence_(row, eligible, iteration23 = true) {
  const original = marketsReviewOriginalText_(row);
  const text = normalizeReviewEvidence_(original);
  // A local reference inside a comparison, a trip or a third person's story
  // cannot establish the author's market, even alongside a support response.
  if (/\b(?:no (?:vivo|resido|uso|utilizo)|nunca (?:he usado|uso|vivi)|de viaje|de vacaciones|si (?:viviera|pudiera)|desde (?:el extranjero|otro pais)|(?:vivo|resido) en otro pais|como (?:en|yape|plin|pse|paygold|bizum|banco galicia)|a diferencia de|mi (?:amigo|amiga|familiar|hermano|hermana|padre|madre)|segun me (?:dicen|cuentan))\b/u.test(text)) return null;
  if ((iteration23 ? /\bcomparad[oa] con\b(?! otros bancos\b)/u : /\bcomparad[oa] con\b/u).test(text)) return null;

  const places = { espana: 'ES', madrid: 'ES', colombia: 'CO', bogota: 'CO', peru: 'PE',
    venezuela: 'VE', argentina: 'AR', mexico: 'MX' };
  const matches = new Map();
  const rail = inferMarketsAndroidCountry_(original, Object.values(places));
  if (rail) matches.set(rail.candidate, rail.evidence);
  for (const location of text.matchAll(/\b(?:vivo|resido|estoy viviendo|mi empresa opera) en (espana|madrid|colombia|bogota|peru|venezuela|argentina|mexico)\b/gu)) {
    matches.set(places[location[1]], 'personal-location');
  }
  for (const market of text.matchAll(/\b(?:esta|la|mi) (?:app|aplicacion) para (espana|colombia|peru|venezuela|argentina|mexico)\b/gu)) {
    if (/\b(?:me|nos|mi|mis|nuestra|no puedo|no podemos)\b/u.test(text)) matches.set(places[market[1]], 'local-app-use');
  }
  if (/\b(?:mi paygold|(?:pague|cobre|no puedo (?:pagar|cobrar)) (?:por|con) paygold)\b/u.test(text)) {
    matches.set('CO', 'own-paygold-use');
  }
  if (!/\byape (?:en )?bolivia\b/u.test(text) &&
      /\b(?:como (?:hago para|puedo) (?:tener|usar|activar)|necesito (?:usar|activar)|no puedo (?:usar|activar)) (?:plin|yape)\b/u.test(text)) {
    matches.set('PE', 'local-rail-request');
  }
  if (/\b(?:mi cuenta|tengo cuenta|uso) (?:en )?bcp (?:e|y) interbank\b/u.test(text)) matches.set('PE', 'local-bank-use');
  if (/\b(?:mi cuenta (?:de|en)|tengo cuenta en) banco galicia\b/u.test(text)) matches.set('AR', 'own-galicia-account');

  if (iteration23 && /\b(?:no me permite tener plin|no llega la notificacion del plin|cuentas? (?:juridicas?|de empresa) (?:puedan hacer|hagan) plin|transferencias? (?:por|con) plin|(?:me (?:hace|hizo|realiza|realizo|envia|envio)|recibi) un plin)\b/u.test(text)) {
    matches.set('PE', 'own-plin-operation');
  }
  if (iteration23 && /(?:^una de las mejores (?:apps|aplicaciones)(?: de banca)?|\bla peor (?:app|aplicacion) de banca que existe) en espana(?:$| y )/u.test(text) &&
      !/\b(?:uruguay|turquia|portugal|francia|alemania|italia|comparad[oa]|aunque|pero en|segun|me (?:dijo|dijeron)|dicen que)\b/u.test(text)) {
    matches.set('ES', 'explicit-spanish-app-market');
  }
  // En los escaparates actuales de GEMA, España es el único mercado con esta operativa.
  if (iteration23 && row[4] === 'com.bbva.GEMA.global' &&
      eligible.every(country => ['AR', 'CO', 'ES', 'PE', 'UY'].includes(country)) &&
      /\b(?:mis adeudos sepa|(?:usar|utilizar) la (?:app|aplicacion) para (?:los )?adeudos sepa)\b/u.test(text) &&
      !/\b(?:uruguay|portugal|francia|alemania|italia|otro pais)\b/u.test(text)) {
    matches.set('ES', 'gema-sepa-direct-use');
  }
  if (iteration23 && /\b(?:tratando de hacer pagos pse|(?:hacer|realizar|recibir|recib[oi]|hice) (?:los |mis )?pagos (?:por |con )?pse)\b/u.test(text)) {
    matches.set('CO', 'own-pse-payment');
  }
  if (iteration23 && /\b(?:(?:pagos?|cobros?) (?:por|con) (?:link )?paygold|(?:cre(?:ar|aba)|gener(?:ar|aba)|env(?:iar|iaba)) (?:un |el |mis )?enlaces? de paygold|pago por link paygold)\b/u.test(text)) {
    matches.set('CO', 'paygold-payment-operation');
  }
  const { reply } = marketsReviewMetadata_(row);
  const support = marketsAndroidReplyEvidence_(reply);
  const replyText = normalizeReviewEvidence_(reply);
  if (iteration23 && row[4] === 'com.bbva.GEMA.global' &&
      /\bpara nosotros tu opinion es muy importante seguiremos trabajando cada dia en el desarrollo de nuestra aplicacion para que asi cada vez se ajuste mas a las necesidades de gestion de tu empresa y tu operativa bancaria\b/u.test(replyText)) {
    if (!support.has('ES')) support.set('ES', 'gema-spain-developer-reply');
  }
  const mentionedInReply = [...new Set([...replyText.matchAll(/\b(?:espana|madrid|colombia|bogota|peru|venezuela|argentina|mexico)\b/gu)]
    .map(([place]) => places[place]))];
  if (mentionedInReply.length > 1 || (support.size && mentionedInReply.some(country => !support.has(country)))) {
    return { status: 'CONFLICTO' };
  }
  const strongMarkets = new Set([...matches.keys(), ...support.keys()]);
  if (strongMarkets.size > 1) return { status: 'CONFLICTO' };
  // Language is corroboration only; it cannot rebut direct evidence.
  if (!strongMarkets.size) {
    const colloquialisms = text.match(/\b(?:peta|chapuza|no sois nadie|todo facilidades|teniais|teneis|volvais|vuestra promo|habeis)\b/gu);
    if (new Set(colloquialisms).size >= 2 && /\b(?:mi cuenta|mi empresa|no puedo|me falla)\b/u.test(text) &&
        /\b(?:espana|madrid|adeudos sepa)\b/u.test(text)) matches.set('ES', 'contextual-es');
    if (/\bhasta las patas\b/u.test(text) && /\b(?:mi cuenta|mi empresa|no puedo|me falla)\b/u.test(text) &&
        /\b(?:plin|yape|bcp)\b/u.test(text) && !/\bbolivia\b/u.test(text)) matches.set('PE', 'contextual-pe');
  }
  for (const [country, rule] of support) matches.set(country, rule);
  if (matches.size !== 1) return null;
  const [country, evidence] = matches.entries().next().value;
  const mentions = [
    ['ES', /\b(?:espana|madrid|bizum|adeudos sepa)\b/u], ['MX', /\b(?:mexico|spei|curp)\b/u],
    ['PE', /\b(?:peru|plin|yape|bcp)\b/u], ['CO', /\b(?:colombia|bogota|pse|paygold)\b/u],
    ['AR', /\b(?:argentina|banco galicia)\b/u], ['VE', /\bvenezuela\b/u],
    ['UY', /\b(?:uruguay|montevideo)\b/u], ['BO', /\bbolivia\b/u]
  ];
  if (!eligible.includes(country) || mentions.some(([code, pattern]) => code !== country && pattern.test(text))) return null;
  return { status: 'VALIDAR', candidate: country, evidence };
}

function marketsAndroidGeographyApprovalEvidence_(row, eligible, approval, newRules) {
  if (approval?.automatic) return marketsAndroidGeographyEvidence_(row, eligible, newRules);
  if (approval?.country === 'ES' && approval.reason === MARKETS_GEO_SPAIN_REASON) {
    return eligible.includes('ES') ? { status: 'VALIDAR', candidate: 'ES', evidence: MARKETS_GEO_SPAIN_REASON } : null;
  }
  if (approval) return marketsAndroidGeographyCandidate_(marketsReviewOriginalText_(row), eligible);
  return marketsAndroidGeographyEvidence_(row, eligible, newRules);
}

function marketsAndroidGeographyDigest_(row, automatic) {
  return automatic ? marketsReviewDigest_([row[9], row[10], marketsReviewMetadata_(row).reply])
    : marketsReviewTextDigest_(row);
}

function marketsAndroidGeographyEligible_(row, packages) {
  const [key, , markets, platform, packageName] = row;
  if (!key || platform !== 'Android' || !(packages.get(packageName)?.size > 1)) return false;
  const storefronts = [...new Set(String(markets).split(',').map(code => code.trim()).filter(code => /^[A-Z]{2}$/.test(code)))];
  return !(storefronts.length === 1 && MARKETS_WEB.countryCodes.includes(storefronts[0]));
}

function scanMarketsAndroidGeographyBatch_(now) {
  const ss = openMarketsSpreadsheet_();
  const source = marketsReviewSheet_(ss);
  const target = ss.getSheetByName(MARKETS_ANDROID_GEO_SHEET);
  if (!target) return false;
  const properties = PropertiesService.getScriptProperties();
  const packages = new Map();
  for (const app of readAppCatalog_(ss)) {
    if (app.platform !== 'Android' || !app.packageName) continue;
    if (!packages.has(app.packageName)) packages.set(app.packageName, new Set());
    packages.get(app.packageName).add(app.countryCode);
  }
  const iteration23 = Boolean(properties.getProperty(MARKETS_GEO_ITERATION_23));
  const version = marketsReviewDigest_([iteration23 ? 'storefront-reply-v11' : 'storefront-reply-v6', [...packages].map(([id, countries]) => [id, [...countries].sort()])]);
  const revision = properties.getProperty('MARKETS_ANDROID_GEO_SOURCE_REVISION') || '';
  const last = Math.max(1, source.getLastRow());
  const previous = safeJsonParse_(properties.getProperty(MARKETS_GEO_AUDIT_PROPERTY));
  const state = previous?.schema === 2 && previous.version === version && previous.revision === revision && previous.last <= last
    ? previous : { schema: 2, version, revision, next: 2, counts: {}, processed: 0, scannedRows: 0, total: 0, last: 1 };
  if (state.complete && state.last === last && !state.error) return false;
  if (previous?.version !== version) properties.setProperty('MARKETS_REVIEW_GEOGRAPHY_REVISION', Utilities.getUuid());
  if (state.last !== last && (state.complete || state.next === 2)) {
    const added = last - state.last;
    const inventory = added > 0 ? source.getRange(state.last + 1, 1, added, 5).getValues() : [];
    state.total += inventory.filter(row => marketsAndroidGeographyEligible_(row, packages)).length;
    state.last = Math.max(1, last);
  }
  const width = marketsReviewWidth_(source);
  const scan = state.processed < state.total ? Math.max(0, Math.min(12000, state.last - state.next + 1)) : 0;
  let count = 0;
  const eligibleRows = [];
  if (scan) {
    const headers = source.getRange(state.next, 1, scan, 5).getValues();
    for (const row of headers) {
      if (marketsAndroidGeographyEligible_(row, packages)) eligibleRows.push({ row, rowNumber: state.next + count });
      count++;
      if (eligibleRows.length >= 1000) break;
    }
    if (eligibleRows.length && !hydrateMarketsReviewPage_(source, width, eligibleRows)) {
      throw new Error('El origen de reseñas cambió durante el recorrido geográfico.');
    }
  }
  delete state.error;
  state.runningUntil = Date.now() + 6 * 60 * 1000;
  state.complete = false;
  properties.setProperty(MARKETS_GEO_AUDIT_PROPERTY, JSON.stringify(state));

  const rows = eligibleRows.map(item => item.row);
  const existing = rows.length ? readMarketsAndroidGeography_(ss) : new Map();
  const seen = new Set();
  const output = [], replacements = [];
  for (const row of rows) {
    if (!marketsAndroidGeographyEligible_(row, packages)) continue;
    const [key, , , , packageName] = row;
    if (seen.has(key)) { state.processed++; continue; }
    seen.add(key);
    const approval = existing.get(key);
    const eligible = [...packages.get(packageName)];
    const result = marketsAndroidGeographyApprovalEvidence_(row, eligible, approval, iteration23);
    const valid = result?.status === 'VALIDAR';
    const digest = valid && marketsAndroidGeographyDigest_(row, !approval || approval.automatic);
    const verified = valid && approval?.packageName === packageName && approval.country === result?.candidate && approval.digest === digest &&
      (!approval.automatic || approval.reason === result.evidence);
    const canWrite = valid && (!existing.has(key) || approval?.automatic);
    const outcome = verified || canWrite ? 'INFERIDO' : 'NO_ATRIBUIBLE';
    if (result?.status === 'CONFLICTO') state.counts.CONFLICTO = (state.counts.CONFLICTO || 0) + 1;
    state.processed++;
    state.counts[outcome] = (state.counts[outcome] || 0) + 1;
    if (valid) {
      const bucket = result.candidate + ':' + result.evidence;
      state.counts[bucket] = (state.counts[bucket] || 0) + 1;
    }
    if (!valid && approval?.automatic && (approval.country || approval.reason === 'revoked')) {
      state.counts.REVOCADO = (state.counts.REVOCADO || 0) + 1;
    }
    if (!valid && approval?.automatic && approval.country) {
      replacements.push([approval.rowNumber, [marketsReviewLiteral_(key), packageName,
        marketsAndroidGeographyDigest_(row, true), '', MARKETS_ANDROID_GEO_VERSION, now, 'automatic', 'revoked']]);

    }
    if (!canWrite || verified) continue;
    const record = [marketsReviewLiteral_(key), packageName, digest,
      result.candidate, MARKETS_ANDROID_GEO_VERSION, now, 'automatic', result.evidence];
    if (approval) replacements.push([approval.rowNumber, record]);
    else output.push(record);
  }
  if (output.length || replacements.length) {
    const next = target.getLastRow() + 1;
    const size = MARKETS_ANDROID_GEO_HEADERS.length;
    properties.setProperty('MARKETS_REVIEW_GEOGRAPHY_REVISION', Utilities.getUuid());
    if (output.length) {
      ensureSheetCapacity_(target, next + output.length - 1, size);
      target.getRange(next, 1, output.length, size).setValues(output);
    }
    for (const [rowNumber, record] of replacements) target.getRange(rowNumber, 1, 1, size).setValues([record]);
    SpreadsheetApp.flush();
    properties.setProperty('MARKETS_REVIEW_GEOGRAPHY_REVISION', Utilities.getUuid());
  }
  if (count) state.lastProgressAt = now.toISOString();
  state.scannedRows += count;
  state.next = state.processed >= state.total ? state.last + 1 : state.next + count;
  state.complete = state.next > state.last;
  state.updatedAt = now.toISOString();
  delete state.runningUntil;
  properties.setProperty(MARKETS_GEO_AUDIT_PROPERTY, JSON.stringify(state));
  return true;
}
