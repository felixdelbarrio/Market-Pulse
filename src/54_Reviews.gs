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
    const listings = new Map();
    readAppCatalog_(ss).filter(app => app.platform === 'iOS' && /^[A-Z]{2}$/.test(app.countryCode) &&
      /^\d+$/.test(app.appId)).forEach(app => {
      const listing = app.countryCode + '|' + app.appId;
      if (!listings.has(listing)) listings.set(listing, []);
      listings.get(listing).push(app);
    });
    const apps = [...listings.values()].filter(group => group.length === 1).map(group => group[0])
      .sort((a, b) => a.appKey.localeCompare(b.appKey));
    const lastRow = sheet.getLastRow();
    const stored = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, width).getValues() : [];
    const known = new Map(stored.map((row, index) => [row[0], {
      index: index + 2, row
    }]));
    const translationKey = 'MARKETS_REVIEWS_TRANSLATION_ROW';
    const properties = PropertiesService.getScriptProperties(), cursorKey = 'MARKETS_REVIEWS_CURSOR';
    const [cursor, cursorPage] = JSON.parse(properties.getProperty(cursorKey) || '["",1]');
    const start = Math.max(0, apps.findIndex(app => app.appKey === cursor));
    const deadline = Date.now() + 240000;
    let added = 0, updated = 0, failures = 0, processed = 0;
    while (processed < Math.min(apps.length, limit) && Date.now() < deadline) {
      const app = apps[(start + processed) % apps.length];
      try {
        for (let page = app.appKey === cursor ? cursorPage : 1; page <= 10; page++) {
          if (Date.now() >= deadline) {
            properties.setProperty(cursorKey, JSON.stringify([app.appKey, page]));
            const summary = { added, updated, failures, processed, eligible: apps.length, deferred: true };
            console.log(JSON.stringify(summary));
            return summary;
          }
          const response = UrlFetchApp.fetch(marketsReviewFeedUrl_(app, page), {
            muteHttpExceptions: true, followRedirects: false
          });
          if (response.getResponseCode() !== 200) throw new Error('HTTP ' + response.getResponseCode());
          const result = parseMarketsReviewFeed_(app, page, response.getContentText());
          const pending = new Map();
          const previousUpdates = updated;
          const captured = new Date().toISOString();
          for (const row of result.rows) {
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
            updated++;
          }
          if (pending.size) {
            const nextRow = sheet.getLastRow() + 1;
            const rows = [...pending.values()];
            ensureSheetCapacity_(sheet, nextRow + rows.length - 1, width);
            sheet.getRange(nextRow, 1, rows.length, width)
              .setValues(rows.map(row => row.map(marketsReviewLiteral_)));
            rows.forEach((row, i) => known.set(row[0], { index: nextRow + i, row }));
            added += rows.length;
          }
          if (pending.size || updated > previousUpdates) {
            SpreadsheetApp.flush();
            advanceMarketsReviewGeneration_(properties);
          }
          if (!result.more) break;
        }
      } catch (error) {
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

function translateMarketsReviews_() {
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return { deferred: true };
  try {
    const sheet = marketsReviewSheet_(openMarketsSpreadsheet_()), last = sheet.getLastRow();
    const properties = PropertiesService.getScriptProperties(), key = 'MARKETS_REVIEWS_TRANSLATION_ROW';
    let first = Number(properties.getProperty(key)) || 2;
    if (last < first) return { translated: 0, checked: last - 1, eligible: last - 1, complete: true };
    const rows = sheet.getRange(first, 11, Math.min(100, last - first + 1), 4).getValues();
    const deadline = Date.now() + 240000;
    let translated = 0, checked = first - 2;
    try {
      for (let i = 0; i < rows.length && Date.now() < deadline; i++) {
        const [original, ...values] = rows[i];
        if (original && values.some(value => !value)) {
          const result = ['es', 'en', 'tr'].map((language, index) =>
            values[index] || LanguageApp.translate(String(original), '', language));
          sheet.getRange(first + i, 12, 1, 3).setValues([result.map(marketsReviewLiteral_)]);
          translated++;
        }
        checked++;
      }
    } finally {
      if (translated) {
        SpreadsheetApp.flush();
        advanceMarketsReviewGeneration_(properties);
      }
      properties.setProperty(key, String(checked + 2));
    }
    return { translated, checked, eligible: last - 1, complete: checked >= last - 1 };
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

function queryMarketsReviews_(ss, filters, window, includeTranslations = false) {
  filters = filters || {};
  const segment = MARKETS_DEFAULT_REVIEW_SEGMENTS.find(group => group.id === filters.segment);
  if (filters.segment && !segment) throw new Error('Segmento de comentarios desconocido.');
  const catalog = new Map(readAppCatalog_(ss).map(app => [app.appKey, app]));
  const sheet = ss.getSheetByName('MARKET_REVIEWS');
  if (!sheet || sheet.getLastRow() < 2) return [];
  marketsReviewSheet_(ss);
  const topic = /^(?:\d{2})(?:\.(?:\d{2}|xx))?$/.test(filters.topic) ? filters.topic : "";
  const taxonomy = window ? ss.getSheetByName('FUNCTIONAL_CATALOG') : null;
  const entries = taxonomy && taxonomy.getLastRow() > 1
    ? taxonomy.getRange(2, 1, taxonomy.getLastRow() - 1, 3).getDisplayValues() : [];
  const knownBlocks = new Set(entries.filter(([id, label]) => /^\d{2}\./.test(id) && label).map(([id]) => id.slice(0, 2)));
  const rules = window ? compileReviewRules_(entries) : topic ? reviewTopicRules_(ss) : null;
  const languageColumn = { es: 11, en: 12, tr: 13 }[filters.language] || 11;
  const androidListings = new Map([...catalog.values()].filter(app => app.platform === 'Android')
    .map(app => [app.packageName + '|' + app.countryCode, app]));
  const packageCountries = new Map();
  for (const app of androidListings.values()) {
    const countries = packageCountries.get(app.packageName) || new Set();
    countries.add(app.countryCode);
    packageCountries.set(app.packageName, countries);
  }
  const seen = new Set();
  const search = normalizeReviewEvidence_(String(filters.search || "").slice(0, 200));
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, marketsReviewWidth_(sheet)).getValues()
    .flatMap(row => {
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
      const countries = String(row[2]).split(',').filter(country => filters.country === 'ALL' || country === filters.country);
      const apps = countries.map(country => android ? androidListings.get(row[4] + '|' + country) : catalog.get(row[1]))
        .filter(app => app && (android || (app.countryCode === row[2] && app.platform === row[3] &&
          String(row[4]) === app.appId)) && (!filters.app || (app.isBbva ? 'BBVA Empresas' : app.appName) === filters.app));
      if (!apps.length) return [];
      const original = [row[9], row[10]].join(' ');
      if (search && !normalizeReviewEvidence_(original).includes(search)) return [];
      const ids = rules ? classifyReviewEvidence_(original, rules) : [];
      if (window && filters.topic === "general" && ids.some(id => knownBlocks.has(id.slice(0, 2)))) return [];
      if (topic && ((!window && !(row[7] >= 1 && row[7] <= 3)) ||
          !ids.some(id => id === topic || id.slice(0, 2) === topic))) return [];
      const key = String(row[0]);
      if (window && (!key || seen.has(key) || (filters.reviewKey && filters.reviewKey !== key))) return [];
      seen.add(key);
      const url = android ? 'https://play.google.com/store/apps/details?id=' + encodeURIComponent(row[4]) +
        '&reviewId=' + encodeURIComponent(row[5]) : row[3] === 'iOS' && /^\d+$/.test(row[4])
          ? 'https://apps.apple.com/' + apps[0].countryCode.toLowerCase() + '/app/' + row[4] + '?see-all=reviews&platform=iphone' : '';
      const { author, helpful, reply, replyDate, replyAuthor } = marketsReviewMetadata_(row);
      return [{ key, listings: apps.map(app => ({ country: app.countryCode, app: app.appName, entity: app.isBbva ? 'BBVA Empresas' : app.appName })),
        entities: [...new Set(apps.map(app => app.isBbva ? 'BBVA Empresas' : app.appName))],
        blocks: [...new Set(ids.map(id => id.slice(0, 2)).filter(id => !window || knownBlocks.has(id)))], app: apps[0].appName, countries: [...new Set(apps.map(app => app.countryCode))],
        platform: row[3], date, rating: row[7], version: String(row[8]),
        title: row[9], original: row[10], text: row[languageColumn] || row[10], url,
        author, helpful, reply, replyDate, replyAuthor,
        sharedListing: android && packageCountries.get(row[4])?.size > 1,
        updatedAt: row[6] instanceof Date ? row[6].toISOString() : String(row[6]),
        ...(includeTranslations ? { translations: { es: row[11], en: row[12], tr: row[13] } } : {}),
        capturedAt: row[14] ? String(row[14]).slice(0, 10) : '',
        translated: Boolean(row[languageColumn] && row[languageColumn] !== row[10]) }];
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
}
