/** Índice derivado. La fila física acelera la lectura; la clave y la huella verifican identidad. */
const MARKETS_REVIEW_INDEX = 'MARKET_REVIEW_INDEX';
const MARKETS_REVIEW_INDEX_HEADERS = ['review_key', 'text_digest', 'classifier_version', 'topic_ids', 'audience', 'shared', 'reason', 'relevance', 'evidence'];
const MARKETS_REVIEW_INDEX_CURSOR = 'MARKETS_REVIEW_INDEX_CURSOR';
const MARKETS_REVIEW_INDEX_BATCH = 3000;
const MARKETS_REVIEW_INDEX_STATUS = 'MARKETS_REVIEW_INDEX_STATUS';

function marketsReviewIndexSheet_(ss, extend = false) {
  const sheet = ss.getSheetByName(MARKETS_REVIEW_INDEX);
  return sheet && marketsAppendSheetHeaders_(sheet, MARKETS_REVIEW_INDEX_HEADERS, [7], extend)?.sheet;
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
    const { rules, version } = marketsReviewClassification_(ss);
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
    const values = source.getRange(start, 1, count, 11).getValues().map((row, i) => {
      if (!row[0]) return Array(width).fill('');
      const hash = marketsReviewTextDigest_(row);
      if (old[i][0] === row[0] && old[i][1] === hash && old[i][2] === version && old[i][7]) return old[i];
      const original = marketsReviewOriginalText_(row);
      const { audience, sharedOperation, reason, relevance, evidence } = classifyMarketsReviewAudience_(original);
      updated++;
      return [marketsReviewLiteral_(row[0]), hash, version, JSON.stringify(classifyReviewEvidence_(original, rules)),
        audience, sharedOperation, reason, relevance, JSON.stringify(evidence)];
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
    const name = 'Market Pulse - Antes de inferencia Iteración 23';
    const candidates = folder.getFilesByName(name);
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
  if (/\b(?:mi paygold|(?:pague|cobre|no puedo (?:pagar|cobrar)) (?:por|con) paygold)\b/u.test(text)) matches.set('CO', 'own-paygold-use');
  if (!/\byape (?:en )?bolivia\b/u.test(text) &&
      /\b(?:como (?:hago para|puedo) (?:tener|usar|activar)|necesito (?:usar|activar)|no puedo (?:usar|activar)) (?:plin|yape)\b/u.test(text)) {
    matches.set('PE', 'local-rail-request');
  }
  if (/\b(?:mi cuenta|tengo cuenta|uso) (?:en )?bcp (?:e|y) interbank\b/u.test(text)) matches.set('PE', 'local-bank-use');
  if (/\b(?:mi cuenta (?:de|en)|tengo cuenta en) banco galicia\b/u.test(text)) matches.set('AR', 'own-galicia-account');

  if (iteration23 && /\b(?:no me permite tener plin|no llega la notificacion del plin)\b/u.test(text)) matches.set('PE', 'own-plin-operation');
  if (iteration23 && /\btratando de hacer pagos pse\b/u.test(text)) matches.set('CO', 'own-pse-payment');
  if (iteration23 && /\bno se pueden realizar pagos con paygold que antes se podian hacer\b/u.test(text)) matches.set('CO', 'regression-paygold-payment');
  const { reply } = marketsReviewMetadata_(row);
  const support = marketsAndroidReplyEvidence_(reply);
  const replyText = normalizeReviewEvidence_(reply);
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
    ['AR', /\b(?:argentina|banco galicia)\b/u], ['VE', /\bvenezuela\b/u]
  ];
  if (!eligible.includes(country) || mentions.some(([code, pattern]) => code !== country && pattern.test(text))) return null;
  return { status: 'VALIDAR', candidate: country, evidence };
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
  const version = marketsReviewDigest_([iteration23 ? 'storefront-reply-v7' : 'storefront-reply-v6', [...packages].map(([id, countries]) => [id, [...countries].sort()])]);
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
  const count = state.processed < state.total ? Math.max(0, Math.min(3000, state.last - state.next + 1)) : 0;
  delete state.error;
  state.runningUntil = Date.now() + 6 * 60 * 1000;
  state.complete = false;
  properties.setProperty(MARKETS_GEO_AUDIT_PROPERTY, JSON.stringify(state));

  const rows = count > 0 ? source.getRange(state.next, 1, count, width).getValues() : [];
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
    const result = approval && !approval.automatic ? marketsAndroidGeographyCandidate_(marketsReviewOriginalText_(row), eligible) : marketsAndroidGeographyEvidence_(row, eligible, iteration23);
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
