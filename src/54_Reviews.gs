/** Reseñas de escaparates de App Store, con almacenamiento y activadores propios. */
var MARKETS_REVIEW_HEADERS = Object.freeze([
  'review_key', 'app_key', 'country_code', 'platform', 'store_id', 'review_id',
  'updated_at', 'rating', 'version', 'title', 'original', 'es', 'en', 'tr'
]);

const MARKETS_REVIEW_METADATA_COLUMN = 16;
const MARKETS_REVIEW_METADATA_HEADER = 'store_metadata';

function setupMarketsReviews() {
  const access = requireMarketsReviewOwner_();
  if (!access.ss.getSheetByName('MARKET_REVIEWS')) {
    const sheet = access.ss.insertSheet('MARKET_REVIEWS');
    const headers = [...MARKETS_REVIEW_HEADERS, 'captured_at', MARKETS_REVIEW_METADATA_HEADER];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  const sheet = marketsReviewSheet_(access.ss);
  ensureSheetCapacity_(sheet, 2, 15);
  const captured = sheet.getRange(1, 15);
  if (!captured.getValue()) captured.setValue('captured_at');
  installMarketsReviewSupervisor_();
}

function requireMarketsReviewOwner_() {
  const access = requireMarketsAdministrator_();
  if (access.email !== normalizeEmailForComparison_(Session.getEffectiveUser().getEmail())) {
    throw new Error('Esta operación está reservada al propietario de los activadores.');
  }
  return access;
}

/** Migración explícita y aditiva para instalaciones con el contrato anterior. */
function migrateMarketsReviewMetadata() {
  const { ss } = requireMarketsReviewOwner_();
  const lock = LockService.getUserLock();
  lock.waitLock(5000);
  try {
    const sheet = marketsReviewSheet_(ss);
    if (sheet.getRange(1, 15).getValue() !== 'captured_at') {
      throw new Error('MARKET_REVIEWS no tiene la cabecera esperada captured_at.');
    }
    if (marketsReviewWidth_(sheet) === MARKETS_REVIEW_METADATA_COLUMN) return { changed: false };
    if (sheet.getLastColumn() >= MARKETS_REVIEW_METADATA_COLUMN) {
      throw new Error('La columna de metadatos ya contiene datos con otro contrato.');
    }
    ensureSheetCapacity_(sheet, 2, MARKETS_REVIEW_METADATA_COLUMN);
    sheet.getRange(1, MARKETS_REVIEW_METADATA_COLUMN).setValue(MARKETS_REVIEW_METADATA_HEADER);
    SpreadsheetApp.flush();
    return { changed: true };
  } finally {
    lock.releaseLock();
  }
}

function marketsReviewWidth_(sheet) {
  return sheet.getLastColumn() >= MARKETS_REVIEW_METADATA_COLUMN &&
    sheet.getRange(1, MARKETS_REVIEW_METADATA_COLUMN).getValue() === MARKETS_REVIEW_METADATA_HEADER
    ? MARKETS_REVIEW_METADATA_COLUMN : 15;
}

function marketsReviewMetadata_(row) {
  try { return JSON.parse(row[MARKETS_REVIEW_METADATA_COLUMN - 1]) || {}; }
  catch (ignored) { return {}; }
}

function mergeMarketsReviewMetadata_(previous, source) {
  const out = { ...previous };
  if (source.author) out.author = source.author;
  if (Number.isInteger(source.helpful) && source.helpful >= 0) out.helpful = source.helpful;
  if (source.reply && (!out.replyDate || (source.replyDate && source.replyDate >= out.replyDate))) {
    out.reply = source.reply;
    if (source.replyDate) out.replyDate = source.replyDate;
    if (source.replyAuthor) out.replyAuthor = source.replyAuthor;
  }
  return Object.keys(out).length ? JSON.stringify(out) : '';
}

function runMarketsReviewBackfill() {
  requireMarketsReviewOwner_();
  return collectMarketsReviews_();
}

function runMarketsReviewTranslation() {
  requireMarketsReviewOwner_();
  const result = translateMarketsReviews_();
  console.log(JSON.stringify(result));
  return result;
}

function marketsReviewSheet_(ss) {
  const sheet = ss.getSheetByName('MARKET_REVIEWS');
  if (!sheet) throw new Error('La colección de reseñas todavía no está configurada.');
  assertCurrentSheetContract_(sheet, MARKETS_REVIEW_HEADERS,
    sheet.getRange(1, 1, 1, MARKETS_REVIEW_HEADERS.length).getValues()[0]);
  return sheet;
}

function marketsReviewFeedUrl_(app, page) {
  return 'https://itunes.apple.com/' + app.countryCode.toLowerCase() + '/rss/customerreviews/page=' +
    page + '/id=' + app.appId + '/sortby=mostrecent/json';
}

function parseMarketsReviewFeed_(app, page, payload) {
  const feed = JSON.parse(payload).feed;
  const links = feed && Array.isArray(feed.link) ? feed.link.map(link => link.attributes || {}) : [];
  if (!links.some(link => link.rel === 'self' && link.href === marketsReviewFeedUrl_(app, page))) {
    throw new Error('El escaparate devuelto no coincide con el solicitado.');
  }
  const entries = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];
  const rows = entries.flatMap(entry => {
    const id = trimString_(entry.id?.label), original = trimString_(entry.content?.label);
    const rating = Number(entry['im:rating']?.label), updatedAt = trimString_(entry.updated?.label);
    if (!/^\d+$/.test(id) || !original || !Number.isInteger(rating) || rating < 1 || rating > 5 ||
        !Number.isFinite(Date.parse(updatedAt))) return [];
    const metadata = mergeMarketsReviewMetadata_({}, { author: trimString_(entry.author?.name?.label) });
    return [[JSON.stringify([app.platform, app.countryCode, app.appId, id]), app.appKey, app.countryCode,
      app.platform, app.appId, id, updatedAt, rating, trimString_(entry['im:version']?.label),
      trimString_(entry.title?.label), original, '', '', '', '', metadata]];
  });
  return { rows, more: links.some(link => link.rel === 'next' && String(link.href).split('?')[0].replace(/\/xml$/, '/json') === marketsReviewFeedUrl_(app, page + 1)) };
}

function marketsReviewLiteral_(value) {
  return typeof value === 'string' && /^[=+\-@']/.test(value) ? "'" + value : value;
}

function collectMarketsReviews_(limit = Infinity) {
  // User lock keeps ingestion and translation mutually exclusive for the trigger owner.
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return { deferred: true };
  try {
    const ss = openMarketsSpreadsheet_(), sheet = marketsReviewSheet_(ss);
    const width = marketsReviewWidth_(sheet);
    const apps = marketsIosReviewListings_(readAppCatalog_(ss));
    const lastRow = sheet.getLastRow();
    const stored = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, width).getValues() : [];
    const known = new Map(stored.map((row, index) => [row[0], {
      index: index + 2, row
    }]));
    const properties = PropertiesService.getScriptProperties(), cursorKey = 'MARKETS_REVIEWS_CURSOR';
    const [cursor, cursorPage] = JSON.parse(properties.getProperty(cursorKey) || '["",1]');
    const start = Math.max(0, apps.findIndex(app => app.appKey === cursor));
    const deadline = Date.now() + 240000;
    let added = 0, updated = 0, failures = 0, processed = 0;
    while (processed < Math.min(apps.length, limit) && Date.now() < deadline) {
      const app = apps[(start + processed) % apps.length];
      const retryKey = 'MARKETS_IOS_REVIEW_RETRY|' + app.appKey;
      const retry = JSON.parse(properties.getProperty(retryKey) || 'null');
      let page = retry?.page || (app.appKey === cursor ? cursorPage : 1);
      try {
        for (; page <= 10 && !(retry?.after > Date.now()); page++) {
          if (Date.now() >= deadline) {
            if (retry) properties.setProperty(retryKey, JSON.stringify({ ...retry, page }));
            properties.setProperty(cursorKey, JSON.stringify([app.appKey, page]));
            const summary = { added, updated, failures, processed, eligible: apps.length, deferred: true };
            console.log(JSON.stringify(summary));
            return summary;
          }
          const result = fetchMarketsIosReviewPage_(app, page);
          const summary = { added: 0, updated: 0 };
          storeMarketsIosReviews_(sheet, properties, known, result.rows, summary, width);
          added += summary.added;
          updated += summary.updated;
          if (!result.more) break;
        }
        if (retry && !(retry.after > Date.now())) properties.deleteProperty(retryKey);
      } catch (error) {
        const attempts = Math.min((retry?.attempts || 0) + 1, 6);
        properties.setProperty(retryKey, JSON.stringify({ page, attempts, after: Date.now() + 60000 * 2 ** attempts }));
        failures++;
        console.warn(app.appKey + ': ' + error.message);
      }
      processed++;
      properties.setProperty(cursorKey, JSON.stringify([apps[(start + processed) % apps.length].appKey, 1]));
    }
    const summary = { added, updated, failures, processed, eligible: apps.length };
    console.log(JSON.stringify(summary));
    return summary;
  } finally {
    lock.releaseLock();
  }
}

function marketsIosReviewListings_(catalog) {
  const listings = new Map();
  catalog.filter(app => app.platform === 'iOS' && /^[A-Z]{2}$/.test(app.countryCode) &&
    /^\d+$/.test(app.appId)).forEach(app => {
    const listing = app.countryCode + '|' + app.appId;
    if (!listings.has(listing)) listings.set(listing, []);
    listings.get(listing).push(app);
  });
  const ambiguous = [...listings.values()].filter(group => group.length > 1).length;
  if (ambiguous) console.warn('Escaparates iOS ambiguos excluidos: ' + ambiguous);
  return [...listings.values()].filter(group => group.length === 1).map(group => group[0])
    .sort((a, b) => a.appKey.localeCompare(b.appKey));
}

function fetchMarketsIosReviewPage_(app, page) {
  const response = UrlFetchApp.fetch(marketsReviewFeedUrl_(app, page), {
    muteHttpExceptions: true, followRedirects: false
  });
  if (response.getResponseCode() !== 200) throw new Error('HTTP ' + response.getResponseCode());
  return parseMarketsReviewFeed_(app, page, response.getContentText());
}

function storeMarketsIosReviews_(sheet, properties, known, reviews, summary, width) {
  const translationKey = 'MARKETS_REVIEWS_TRANSLATION_ROW';
  const previousUpdates = summary.updated;
  const pending = new Map();
  const captured = new Date().toISOString();
  for (const row of reviews) {
    row[14] = captured;
    const previous = known.get(row[0]);
    if (!previous) {
      if (!pending.has(row[0]) || Date.parse(row[6]) > Date.parse(pending.get(row[0])[6])) {
        pending.set(row[0], row.slice(0, width));
      }
      continue;
    }
    const newer = Date.parse(row[6]) > Date.parse(previous.row[6]);
    const textChanged = newer && row[10] !== previous.row[10];
    const merged = width === MARKETS_REVIEW_METADATA_COLUMN ? mergeMarketsReviewMetadata_(
      marketsReviewMetadata_(previous.row), marketsReviewMetadata_(row)) : '';
    if (!newer && (!merged || merged === previous.row[15])) continue;
    if (textChanged) {
      const nextTranslation = Number(properties.getProperty(translationKey)) || 2;
      properties.setProperty(translationKey, String(Math.min(nextTranslation, previous.index)));
    }
    const updatedRow = newer ? row.slice(0, width) : previous.row.slice();
    if (newer && !textChanged) updatedRow.splice(11, 3, ...previous.row.slice(11, 14));
    updatedRow[14] = captured;
    if (width === MARKETS_REVIEW_METADATA_COLUMN) updatedRow[15] = merged;
    const update = updatedRow.slice(6);
    sheet.getRange(previous.index, 7, 1, update.length).setValues([update.map(marketsReviewLiteral_)]);
    known.set(row[0], { index: previous.index, row: updatedRow });
    summary.updated++;
  }
  if (pending.size) {
    const nextRow = sheet.getLastRow() + 1;
    const rows = [...pending.values()];
    ensureSheetCapacity_(sheet, nextRow + rows.length - 1, width);
    sheet.getRange(nextRow, 1, rows.length, width)
      .setValues(rows.map(row => row.map(marketsReviewLiteral_)));
    rows.forEach((row, i) => known.set(row[0], { index: nextRow + i, row }));
    summary.added += rows.length;
  }
  if (pending.size || summary.updated > previousUpdates) {
    SpreadsheetApp.flush();
    advanceMarketsReviewGeneration_(properties);
  }
}

/** Auditoría de sólo lectura: devuelve recuentos, nunca textos ni autores. */
function auditMarketsReviewTranslations() {
  const { ss } = requireMarketsReviewOwner_();
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return { deferred: true };
  try {
    const sheet = marketsReviewSheet_(ss), height = sheet.getLastRow() - 1;
    const rows = height > 0 ? sheet.getRange(2, 2, height, 13).getValues() : [];
    const groups = new Map(), totals = new Map();
    const increment = (map, scope, original, values) => {
      const key = JSON.stringify(scope);
      if (!map.has(key)) map.set(key, { scope, total: 0, emptyOriginal: 0, pending: 0, missing: [0,0,0], identical: [0,0,0] });
      const group = map.get(key);
      group.total++;
      group.emptyOriginal += Number(!original);
      group.pending += Number(Boolean(original) && values.some(value => !value));
      values.forEach((value, i) => { group.missing[i] += Number(!value); group.identical[i] += Number(Boolean(original) && value === original); });
    };
    for (const row of rows) {
      const [app, markets, platform, , , date, , , , original, ...values] = row;
      const turkey = String(markets).split(',').includes('TR');
      increment(totals, [turkey ? 'TR' : 'otros', platform], original, values);
      if (turkey) increment(groups, ['TR', platform, marketsReviewRecoveryMonth_(date), app], original, values);
    }
    const summary = [...totals.values()];
    const result = { checked: rows.length, pending: summary.reduce((sum, group) => sum + group.pending, 0),
      languages: ['es', 'en', 'tr'], totals: summary, groups: [...groups.values()] };
    console.log(JSON.stringify({ checked: result.checked, pending: result.pending, languages: result.languages, totals: summary }));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function repairMarketsReviewTranslations() {
  const result = processMarketsReviewTranslations_(true);
  console.log(JSON.stringify(result));
  return result;
}

function translateMarketsReviews_() {
  return processMarketsReviewTranslations_(false);
}

function processMarketsReviewTranslations_(historical) {
  const ss = historical ? requireMarketsReviewOwner_().ss : openMarketsSpreadsheet_();
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return { deferred: true };
  try {
    const sheet = marketsReviewSheet_(ss), last = sheet.getLastRow();
    const properties = PropertiesService.getScriptProperties();
    const key = historical ? 'MARKETS_TRANSLATION_HISTORY_CURSOR' : 'MARKETS_REVIEWS_TRANSLATION_ROW';
    const cursor = historical ? JSON.parse(properties.getProperty(key) || '{"row":2,"turkey":true}') :
      { row: Number(properties.getProperty(key)) || 2, turkey: false };
    const first = cursor.row;
    // Historical scans can skip healthy rows faster without spending additional translation calls.
    const scanLimit = historical ? 1500 : 100;
    const rows = last >= first ? sheet.getRange(first, 1, Math.min(scanLimit, last - first + 1), 14).getValues() : [];
    const deadline = Date.now() + 235000;
    const languages = ['es', 'en', 'tr'];
    let translated = 0, failed = 0, pending = 0, checked = first - 2, attempted = 0, failedRow = null;
    try {
      for (const row of rows) {
        if (Date.now() >= deadline || attempted >= 100) break;
        const index = checked + 2;
        checked++;
        const turkey = String(row[2]).split(',').includes('TR');
        const [original, ...values] = row.slice(10, 14);
        if (!original || values.every(Boolean) || (cursor.turkey && !turkey)) continue;
        pending++;
        attempted++;
        let rowFailed = false;
        const result = values.map((value,i) => {
          if (value) return value;
          try { return LanguageApp.translate(String(original), '', languages[i]) || ''; }
          catch (error) { rowFailed = true; return ''; }
        });
        if (result.some((value,i) => value !== values[i])) {
          sheet.getRange(index, 12, 1, 3).setValues([result.map(marketsReviewLiteral_)]);
          translated++;
        }
        if (rowFailed || result.some(value => !value)) {
          failed++;
          if (failedRow === null) failedRow = index;
        } else pending--;
      }
    } finally {
      if (translated) {
        SpreadsheetApp.flush();
        advanceMarketsReviewGeneration_(properties);
      }
    }
    const end = checked >= last - 1;
    if (historical) properties.setProperty(key, JSON.stringify({
      row: end ? 2 : checked + 2, turkey: end ? !cursor.turkey : cursor.turkey,
      hadFailures: !end && (Boolean(cursor.hadFailures) || pending > 0)
    }));
    else {
      const retryKey = 'MARKETS_TRANSLATION_RETRY';
      const retry = JSON.parse(properties.getProperty(retryKey) || 'null');
      const attempts = failedRow === null ? 0 : (retry?.row === failedRow ? retry.attempts : 0) + 1;
      if (failedRow !== null && attempts < 3) {
        properties.setProperty(retryKey, JSON.stringify({row: failedRow, attempts}));
        properties.setProperty(key, String(failedRow));
      } else {
        if (retry) properties.deleteProperty(retryKey);
        properties.setProperty(key, String(checked + 2));
      }
    }
    if (failed) console.warn('Filas de traducción pendientes de reintento: ' + failed);
    return { translated, checked, eligible: Math.max(0, last - 1), failed, pending,
      complete: end && !cursor.turkey && !cursor.hadFailures && pending === 0 };
  } finally {
    lock.releaseLock();
  }
}

const MARKETS_DEFAULT_REVIEW_SEGMENTS = [
  { id: 'DETRACTOR', label: 'Detractores', stars: [1, 2] },
  { id: 'NEUTRAL', label: 'Neutros', stars: [3] },
  { id: 'PROMOTER', label: 'Promotores', stars: [4, 5] }
];

function getMarketsReviewSegments() {
  currentMarketsUserEmail_();
  return MARKETS_DEFAULT_REVIEW_SEGMENTS;
}

function readMarketsReviewsForWeb_(filters) {
  currentMarketsUserEmail_();
  return queryMarketsReviews_(openMarketsSpreadsheet_(), filters).slice(0, 100);
}

function marketsReviewClassification_(ss) {
  const taxonomy = ss.getSheetByName('FUNCTIONAL_CATALOG');
  const entries = taxonomy && taxonomy.getLastRow() > 1
    ? taxonomy.getRange(2, 1, taxonomy.getLastRow() - 1, 3).getDisplayValues() : [];
  const knownBlocks = new Set(entries.filter(([id, label]) => /^\d{2}\./.test(id) && label).map(([id]) => id.slice(0, 2)));
  return { rules: compileReviewRules_(entries), knownBlocks };
}

function marketsReviewBlocks_(ids, knownBlocks) {
  return [...new Set(ids.map(id => id.slice(0, 2)).filter(id => !knownBlocks || knownBlocks.has(id)))];
}

function queryMarketsReviews_(ss, filters, window, includeTranslations = false, apps = readAppCatalog_(ss)) {
  filters = filters || {};
  const segment = MARKETS_DEFAULT_REVIEW_SEGMENTS.find(group => group.id === filters.segment);
  if (filters.segment && !segment) throw new Error('Segmento de comentarios desconocido.');
  const catalog = new Map(apps.map(app => [app.appKey, app]));
  const sheet = ss.getSheetByName('MARKET_REVIEWS');
  if (!sheet || sheet.getLastRow() < 2) return [];
  marketsReviewSheet_(ss);
  const topic = /^(?:\d{2})(?:\.(?:\d{2}|xx))?$/.test(filters.topic) ? filters.topic : "";
  const classification = (window && !filters.deferBlocks) || filters.includeTopics ? marketsReviewClassification_(ss) : null;
  const rules = classification?.rules || (topic ? reviewTopicRules_(ss) : null);
  const knownBlocks = window ? classification?.knownBlocks : null;
  const languageColumn = { es: 11, en: 12, tr: 13 }[filters.language] || 11;
  const androidListings = new Map(apps.filter(app => app.platform === 'Android')
    .map(app => [app.packageName + '|' + app.countryCode, app]));
  const iosListings = new Map();
  for (const app of apps.filter(item => item.platform === 'iOS')) {
    const key = app.appId + '|' + app.countryCode;
    iosListings.set(key, iosListings.has(key) ? null : app);
  }
  const readStarted = Date.now();
  const stored = sheet.getRange(2, 1, sheet.getLastRow() - 1, marketsReviewWidth_(sheet)).getValues();
  const readMs = Date.now() - readStarted;
  const byPackage = new Map();
  for (const app of androidListings.values()) {
    if (!byPackage.has(app.packageName)) byPackage.set(app.packageName, []);
    byPackage.get(app.packageName).push(app);
  }
  let classified = 0;
  const started = Date.now();
  const identities = new Map();
  for (const row of stored) {
    if (!row[0]) continue;
    const identity = row[4] && row[5] ? JSON.stringify([row[3], row[4], row[5]]) : String(row[0]);
    const previous = identities.get(identity);
    if (!previous) {
      identities.set(identity, { row, markets: String(row[2]), key: row[0], matches: row[0] === filters.reviewKey });
    } else {
      previous.markets += ',' + row[2];
      previous.matches = previous.matches || row[0] === filters.reviewKey;
      if (String(row[0]) < String(previous.key)) previous.key = row[0];
      if (Date.parse(row[6]) > Date.parse(previous.row[6])) previous.row = row;
    }
  }
  const search = normalizeReviewEvidence_(String(filters.search || "").slice(0, 200));
  const results = Array.from(identities.values())
    .flatMap(({ row, markets, key, matches }) => {
      if (filters.reviewKey && !matches) return [];
      const date = row[6] instanceof Date
        ? Utilities.formatDate(row[6], MARKETS_CONFIG.timeZone, 'yyyy-MM-dd')
        : String(row[6]).slice(0, 10);
      if (!Number.isInteger(row[7]) || row[7] < 1 || row[7] > 5) return [];
      if (window && ((filters.start && date < filters.start) || (filters.end && date > filters.end) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < window.start || date > window.end)) return [];
      if (window && filters.rating !== undefined && filters.rating !== '' && row[7] !== Number(filters.rating)) return [];
      if (segment && (typeof row[7] !== 'number' || !segment.stars.includes(row[7]))) return [];
      const android = row[3] === 'Android';
      if (filters.platform !== 'ALL' && row[3] !== filters.platform) return [];
      if (filters.period && !date.startsWith(filters.period)) return [];
      if (filters.maxRating && row[7] > filters.maxRating) return [];
      const storefronts = [...new Set(markets.split(',').map(code => code.trim()).filter(code => /^[A-Z]{2}$/.test(code)))].sort();
      const country = storefronts.length === 1 && MARKETS_WEB.countryCodes.includes(storefronts[0]) ? storefronts[0] : 'UNKNOWN';
      if (filters.country !== 'ALL' && filters.country !== country) return [];
      const attributionMethod = country !== 'UNKNOWN' ? 'single_storefront' :
        storefronts.length > 1 ? 'multi_storefront_ambiguous' : 'no_evidence';
      const sharedListing = android && storefronts.length > 1;
      const direct = catalog.get(row[1]);
      const candidates = storefronts.map(code => (android ? androidListings : iosListings).get(row[4] + '|' + code)).filter(Boolean);
      if (!android && !storefronts.length && direct?.platform === 'iOS' && String(row[4]) === direct.appId) candidates.push(direct);
      if (android && !candidates.length) {
        if (direct?.platform === 'Android' && direct.packageName === row[4]) candidates.push(direct);
        else if (byPackage.get(row[4])?.length === 1) candidates.push(byPackage.get(row[4])[0]);
      }
      const apps = candidates.filter(app => !filters.app || (app.isBbva ? 'BBVA Empresas' : app.appName) === filters.app);
      if (!apps.length && (filters.app || candidates.length || !['Android', 'iOS'].includes(row[3]) || !row[4])) return [];
      const original = [row[9], row[10]].join(' ');
      if (search && !normalizeReviewEvidence_(original).includes(search)) return [];
      if (rules) classified++;
      const ids = rules ? classifyReviewEvidence_(original, rules) : [];
      if (window && filters.topic === "general" && marketsReviewBlocks_(ids, knownBlocks).length) return [];
      if (topic && ((!window && !(row[7] >= 1 && row[7] <= 3)) ||
          !ids.some(id => id === topic || id.slice(0, 2) === topic))) return [];
      const url = android ? 'https://play.google.com/store/apps/details?id=' + encodeURIComponent(row[4]) +
        '&reviewId=' + encodeURIComponent(row[5]) : row[3] === 'iOS' && storefronts.length === 1 && /^\d+$/.test(row[4])
          ? 'https://apps.apple.com/' + storefronts[0].toLowerCase() + '/app/' + row[4] + '?see-all=reviews&platform=iphone' : '';
      const { author, helpful, reply, replyDate, replyAuthor } = marketsReviewMetadata_(row);
      return [{ key, listings: apps.map(app => ({ country: app.countryCode, app: app.appName, entity: app.isBbva ? 'BBVA Empresas' : app.appName })),
        entities: apps.length ? [...new Set(apps.map(app => app.isBbva ? 'BBVA Empresas' : app.appName))] : [String(row[4])],
        blocks: marketsReviewBlocks_(ids, knownBlocks), app: apps[0]?.appName || String(row[4]), countries: [country], storefronts,
        attributionMethod, confidence: country === 'UNKNOWN' ? 'unknown' : 'inferred',
        platform: row[3], date, rating: row[7], version: String(row[8]),
        title: row[9], original: row[10], text: row[languageColumn] || row[10], url,
        author, helpful, reply, replyDate, replyAuthor,
        sharedListing,
        ...(filters.includeTopics ? { topicIds: ids } : {}),
        updatedAt: row[6] instanceof Date ? row[6].toISOString() : String(row[6]),
        ...(includeTranslations ? { translations: { es: row[11], en: row[12], tr: row[13] } } : {}),
        capturedAt: row[14] ? String(row[14]).slice(0, 10) : '',
        translated: Boolean(row[languageColumn] && row[languageColumn] !== row[10]) }];
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
  console.log(JSON.stringify({ operation: 'review-query', readMs, durationMs: Date.now() - started + readMs,
    read: stored.length, classified, returned: results.length }));
  return results;
}
