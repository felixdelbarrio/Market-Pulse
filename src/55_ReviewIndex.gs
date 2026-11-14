/** Índice derivado. La fila física acelera la lectura; la clave y la huella verifican identidad. */
const MARKETS_REVIEW_INDEX = 'MARKET_REVIEW_INDEX';
const MARKETS_REVIEW_INDEX_HEADERS = ['review_key', 'text_digest', 'classifier_version', 'topic_ids', 'audience', 'shared', 'reason'];
const MARKETS_REVIEW_INDEX_CURSOR = 'MARKETS_REVIEW_INDEX_CURSOR';
const MARKETS_REVIEW_INDEX_BATCH = 1000;

function marketsReviewIndexSheet_(ss) {
  const sheet = ss.getSheetByName(MARKETS_REVIEW_INDEX);
  if (sheet) assertCurrentSheetContract_(sheet, MARKETS_REVIEW_INDEX_HEADERS,
    sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), MARKETS_REVIEW_INDEX_HEADERS.length)).getValues()[0]);
  return sheet;
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
  const ss = openMarketsSpreadsheet_();
  const index = marketsReviewIndexSheet_(ss);
  if (!index) return { complete: true, done: 0, total: 0, updated: 0 };
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return { complete: false };
  try {
    const source = marketsReviewSheet_(ss);
    const properties = PropertiesService.getScriptProperties();
    const { rules, version } = marketsReviewClassification_(ss);
    const generation = properties.getProperty('MARKETS_REVIEW_SOURCE_GENERATION') || '';
    const previous = safeJsonParse_(properties.getProperty(MARKETS_REVIEW_INDEX_CURSOR));
    const last = source.getLastRow(), total = Math.max(0, last - 1);
    let start = 2, passGeneration = generation;
    if (previous?.version === version && (previous.next <= last || previous.generation === generation)) {
      start = previous.next;
      passGeneration = previous.generation;
    }
    if (start > last) return { complete: true, done: total, total, updated: 0 };
    const count = Math.min(MARKETS_REVIEW_INDEX_BATCH, last - start + 1);
    const width = MARKETS_REVIEW_INDEX_HEADERS.length;
    ensureSheetCapacity_(index, start + count - 1, width);
    const range = index.getRange(start, 1, count, width);
    const old = range.getValues();
    let updated = 0;
    const values = source.getRange(start, 1, count, 11).getValues().map((row, i) => {
      if (!row[0]) return Array(width).fill('');
      const hash = marketsReviewTextDigest_(row);
      if (old[i][0] === row[0] && old[i][1] === hash && old[i][2] === version) return old[i];
      const original = [row[9], row[10]].join(' ');
      const { audience, sharedOperation, reason } = classifyMarketsReviewAudience_(original);
      updated++;
      return [marketsReviewLiteral_(row[0]), hash, version, JSON.stringify(classifyReviewEvidence_(original, rules)),
        audience, sharedOperation, reason];
    });
    if (updated || old.some((row, i) => row[0] && !values[i][0])) {
      range.setValues(values);
      SpreadsheetApp.flush();
    }
    const next = start + count;
    properties.setProperty(MARKETS_REVIEW_INDEX_CURSOR, JSON.stringify({ version, generation: passGeneration, next }));
    return { complete: next > last, done: next - 2, total, updated };
  } finally {
    lock.releaseLock();
  }
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
  const ownUse = /\b(?:mi|mis|no llega|no puedo|me cobr\w*|envi[eoa]|pag[uoe])\b/u.test(text);
  return { status: ownUse ? 'VALIDAR' : 'SIN_CONTEXTO', candidate: country, evidence: rail.exec(text)[0] };
}

function readMarketsAndroidGeography_(ss) {
  const sheet = ss.getSheetByName(MARKETS_ANDROID_GEO_SHEET);
  const approved = new Map();
  if (!sheet) return approved;
  const width = MARKETS_ANDROID_GEO_HEADERS.length;
  assertCurrentSheetContract_(sheet, MARKETS_ANDROID_GEO_HEADERS,
    sheet.getRange(1, 1, 1, Math.max(width, sheet.getLastColumn())).getValues()[0]);
  if (sheet.getLastRow() < 2) return approved;
  for (const row of sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues()) {
    const [key, packageName, digest, country, version, reviewedAt, reviewer, reason] = row;
    if (!key) continue;
    // A duplicate is ambiguous, even if both approval rows agree.
    approved.set(key, !approved.has(key) && version === MARKETS_ANDROID_GEO_VERSION &&
      reviewedAt && reviewer && reason ? { packageName, digest, country } : null);
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
  return { reviewed: approved.size, valid: [...approved.values()].filter(Boolean).length };
}

const MARKETS_GEO_AUDIT_PROPERTY = 'MARKETS_ANDROID_GEO_AUDIT';

function advanceMarketsAndroidGeography_(now = new Date()) {
  const ss = openMarketsSpreadsheet_();
  const source = marketsReviewSheet_(ss);
  const properties = PropertiesService.getScriptProperties();
  const packages = new Map();
  for (const app of readAppCatalog_(ss)) {
    if (app.platform !== 'Android' || !app.packageName) continue;
    if (!packages.has(app.packageName)) packages.set(app.packageName, new Set());
    packages.get(app.packageName).add(app.countryCode);
  }
  const version = marketsReviewDigest_([MARKETS_ANDROID_GEO_VERSION, [...packages].map(([id, countries]) => [id, [...countries].sort()])]);
  const generation = properties.getProperty('MARKETS_REVIEW_SOURCE_GENERATION') || '';
  const last = source.getLastRow(), previous = safeJsonParse_(properties.getProperty(MARKETS_GEO_AUDIT_PROPERTY));
  const state = previous?.version === version && (previous.next <= last || previous.generation === generation) ? previous
    : { version, generation, next: 2, counts: {}, processed: 0 };
  if (state.next > last) return false;
  const count = Math.min(1500, last - state.next + 1);
  const rows = source.getRange(state.next, 1, count, 11).getValues();
  for (const [key, , originalCountry, platform, packageName, , , , , , original] of rows) {
    const eligible = packages.get(packageName);
    if (!key || platform !== 'Android' || !eligible || eligible.size < 2 ||
        MARKETS_WEB.countryCodes.includes(String(originalCountry).trim())) continue;
    const result = marketsAndroidGeographyCandidate_(original, [...eligible]);
    state.processed++;
    state.counts[result.status] = (state.counts[result.status] || 0) + 1;
  }
  state.next += count;
  state.complete = state.next > last;
  state.updatedAt = now.toISOString();
  properties.setProperty(MARKETS_GEO_AUDIT_PROPERTY, JSON.stringify(state));
  return true;
}
