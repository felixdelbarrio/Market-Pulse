/** Índice derivado. La fila física acelera la lectura; la clave y la huella verifican identidad. */
const MARKETS_REVIEW_INDEX = 'MARKET_REVIEW_INDEX';
const MARKETS_REVIEW_INDEX_HEADERS = ['review_key', 'text_digest', 'classifier_version', 'topic_ids', 'audience', 'shared', 'reason'];
const MARKETS_REVIEW_INDEX_CURSOR = 'MARKETS_REVIEW_INDEX_CURSOR';
const MARKETS_REVIEW_INDEX_BATCH = 3000;
const MARKETS_REVIEW_INDEX_STATUS = 'MARKETS_REVIEW_INDEX_STATUS';

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
  if (!lock.tryLock(1000)) return { deferred: true };
  const properties = PropertiesService.getScriptProperties();
  const status = safeJsonParse_(properties.getProperty(MARKETS_REVIEW_INDEX_STATUS)) || {};
  const save = result => {
    const updatedAt = new Date().toISOString();
    properties.setProperty(MARKETS_REVIEW_INDEX_STATUS, JSON.stringify({ ...result, updatedAt,
      lastProgressAt: result.done !== status.done ? updatedAt : status.lastProgressAt }));
    return result;
  };
  try {
    const source = marketsReviewSheet_(ss);
    const { rules, version } = marketsReviewClassification_(ss);
    const previous = safeJsonParse_(properties.getProperty(MARKETS_REVIEW_INDEX_CURSOR));
    const last = source.getLastRow(), total = Math.max(0, last - 1);
    const start = previous?.version === version && previous.next <= last + 1 ? previous.next : 2;
    if (start > last) return status.complete && status.total === total ? status : save({ complete: true, done: total, total });
    properties.setProperty(MARKETS_REVIEW_INDEX_STATUS, JSON.stringify({ ...status, done: start - 2, total,
      complete: false, runningUntil: Date.now() + 6 * 60 * 1000, updatedAt: new Date().toISOString() }));
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
    properties.setProperty(MARKETS_REVIEW_INDEX_CURSOR, JSON.stringify({ version, next }));
    return save({ complete: next > last, done: next - 2, total, updated });
  } catch (error) {
    const current = safeJsonParse_(properties.getProperty(MARKETS_REVIEW_INDEX_STATUS)) || status;
    delete current.runningUntil;
    properties.setProperty(MARKETS_REVIEW_INDEX_STATUS, JSON.stringify({ ...current, error: errorToString_(error).slice(0, 180) }));
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
  return { reviewed: approved.size, valid: [...approved.values()].filter(Boolean).length };
}

const MARKETS_GEO_AUDIT_PROPERTY = 'MARKETS_ANDROID_GEO_AUDIT';

function advanceMarketsAndroidGeography_(now = new Date()) {
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return false;
  try { return scanMarketsAndroidGeographyBatch_(now); }
  finally { lock.releaseLock(); }
}

function marketsAndroidReplyEvidence_(reply) {
  const value = String(reply || '').normalize('NFKC').toLowerCase().replace(/(?<=\d)[\s().-]+(?=\d)/g, '');
  const text = normalizeReviewEvidence_(reply || '');
  const matches = new Map();
  if (text.includes('necesidades de gestion de tu empresa') && text.includes('y tu operativa bancaria') &&
      text.includes('para nosotros tu opinion es muy importante')) matches.set('ES', 'support-es-template');
  if (text.includes('gracias por las 5 estrellas y por compartir tu experiencia') &&
      text.includes('nos alegra que disfrutes tu app bbva')) matches.set('CO', 'support-co-template');
  if (/\bbbvaempresasresponde@bbva\.com\b/i.test(reply) || /(?:^|[^\d])(?:\+34)?912249802(?!\d)/.test(value)) matches.set('ES', 'support-es');
  if (/\+57601\d{7}(?!\d)/.test(value)) matches.set('CO', 'support-co');
  return matches;
}

function marketsAndroidGeographyEvidence_(row, eligible) {
  const original = row[10];
  const text = normalizeReviewEvidence_(original);
  if (/\b(?:no (?:vivo|resido|uso)|solo de viaje|si viviera|desde el extranjero|vivo en otro pais)\b/u.test(text)) return null;
  const countries = { espana: 'ES', colombia: 'CO', peru: 'PE', venezuela: 'VE', argentina: 'AR', mexico: 'MX' };
  const matches = marketsAndroidReplyEvidence_(marketsReviewMetadata_(row).reply);
  const rail = inferMarketsAndroidCountry_(original, eligible);
  if (rail) matches.set(rail.candidate, rail.evidence);
  const local = /\b(?:vivo|resido|estoy viviendo|mi empresa opera) en (espana|colombia|peru|venezuela|argentina|mexico)\b/u.exec(text);
  if (local) matches.set(countries[local[1]], 'personal-location');
  const appMarket = /\b(?:esta|la|mi) (?:app|aplicacion) para (espana|colombia|peru|venezuela|argentina|mexico)\b/u.exec(text);
  if (appMarket && /\b(?:me|nos|mi|mis|nuestra|no puedo|no podemos)\b/u.test(text)) matches.set(countries[appMarket[1]], 'local-app-use');
  if (/\b(?:como (?:hago para|puedo) (?:tener|usar|activar)|permitan que .*? hagan|necesito (?:usar|activar)) (?:plin|yape)\b/u.test(text)) {
    matches.set('PE', 'local-rail-request');
  }
  if (/\b(?:mi cuenta|tengo cuenta|uso) (?:en )?bcp (?:e|y) interbank\b/u.test(text)) matches.set('PE', 'local-bank-use');
  if (matches.size !== 1) return null;
  const [country, evidence] = matches.entries().next().value;
  const mentions = [
    ['ES', /\b(?:espana|bizum)\b/u], ['MX', /\b(?:mexico|spei|curp)\b/u],
    ['PE', /\b(?:peru|plin|yape)\b/u], ['CO', /\b(?:colombia|bogota|pse)\b/u],
    ['AR', /\b(?:argentina|banco galicia)\b/u], ['VE', /\bvenezuela\b/u]
  ];
  if (!eligible.includes(country) || mentions.some(([code, pattern]) => code !== country && pattern.test(text))) return null;
  return { status: 'VALIDAR', candidate: country, evidence };
}

function marketsAndroidGeographyDigest_(row, evidence) {
  return String(evidence).startsWith('support-')
    ? marketsReviewDigest_([row[9], row[10], marketsReviewMetadata_(row).reply])
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
  const version = marketsReviewDigest_(['storefront-reply-v3', [...packages].map(([id, countries]) => [id, [...countries].sort()])]);
  const revision = properties.getProperty('MARKETS_ANDROID_GEO_SOURCE_REVISION') || '';
  const last = source.getLastRow(), previous = safeJsonParse_(properties.getProperty(MARKETS_GEO_AUDIT_PROPERTY));
  const state = previous?.version === version && previous.revision === revision && previous.last <= last ? previous
    : { version, revision, next: 2, counts: {}, processed: 0 };
  if (state.complete && state.last === last) return false;
  if (state.last !== last) {
    // Only the identity/storefront columns are needed for the denominator.
    const inventory = last > 1 ? source.getRange(2, 1, last - 1, 5).getValues() : [];
    state.total = inventory.filter(row => marketsAndroidGeographyEligible_(row, packages)).length;
    state.last = last;
  }
  const width = marketsReviewWidth_(source);
  const count = Math.min(3000, last - state.next + 1);
  state.runningUntil = Date.now() + 6 * 60 * 1000;
  state.complete = false;
  properties.setProperty(MARKETS_GEO_AUDIT_PROPERTY, JSON.stringify(state));

  const rows = count > 0 ? source.getRange(state.next, 1, count, width).getValues() : [];
  const existing = readMarketsAndroidGeography_(ss);
  const output = [], replacements = [];
  for (const row of rows) {
    if (!marketsAndroidGeographyEligible_(row, packages)) continue;
    const [key, , , , packageName] = row;
    const approval = existing.get(key);
    const eligible = [...packages.get(packageName)];
    const result = approval && !approval.automatic ? marketsAndroidGeographyCandidate_(row[10], eligible) : marketsAndroidGeographyEvidence_(row, eligible);
    const valid = result?.status === 'VALIDAR';
    const digest = valid && marketsAndroidGeographyDigest_(row, result.evidence);
    const verified = valid && approval?.packageName === packageName && approval.country === result?.candidate && approval.digest === digest;
    const canWrite = valid && (!existing.has(key) || approval?.automatic);
    const outcome = verified || canWrite ? 'INFERIDO' : 'NO_ATRIBUIBLE';
    state.processed++;
    state.counts[outcome] = (state.counts[outcome] || 0) + 1;
    if (!canWrite || verified) continue;
    const record = [marketsReviewLiteral_(key), packageName, digest,
      result.candidate, MARKETS_ANDROID_GEO_VERSION, now, 'automatic', result.evidence];
    if (approval) replacements.push([approval.rowNumber, record]);
    else output.push(record);
    existing.set(key, { packageName, digest, country: result.candidate });
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
  state.next = state.processed >= state.total ? last + 1 : state.next + Math.max(0, count);
  state.complete = state.next > last;
  state.updatedAt = now.toISOString();
  delete state.runningUntil;
  properties.setProperty(MARKETS_GEO_AUDIT_PROPERTY, JSON.stringify(state));
  return true;
}
