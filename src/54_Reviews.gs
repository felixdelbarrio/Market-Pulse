/** Reseñas de escaparates de App Store, con almacenamiento y activadores propios. */
var MARKETS_REVIEW_HEADERS = Object.freeze([
  'review_key', 'app_key', 'country_code', 'platform', 'store_id', 'review_id',
  'updated_at', 'rating', 'version', 'title', 'original', 'es', 'en', 'tr'
]);

function setupMarketsReviews() {
  const access = requireMarketsReviewOwner_();
  if (!access.ss.getSheetByName('MARKET_REVIEWS')) {
    const sheet = access.ss.insertSheet('MARKET_REVIEWS');
    sheet.getRange(1, 1, 1, MARKETS_REVIEW_HEADERS.length).setValues([MARKETS_REVIEW_HEADERS]);
    sheet.setFrozenRows(1);
  }
  const sheet = marketsReviewSheet_(access.ss);
  ensureSheetCapacity_(sheet, 2, 15);
  sheet.getRange(1, 15).setValue('captured_at');
  const existing = ScriptApp.getProjectTriggers().map(trigger => trigger.getHandlerFunction());
  [['collectMarketsReviews_', 8], ['collectMarketsPlayReviews_', 8], ['translateMarketsReviews_', 9]].forEach(([handler, hour]) => {
    if (!existing.includes(handler)) {
      ScriptApp.newTrigger(handler).timeBased().everyDays(1).atHour(hour).nearMinute(handler === 'collectMarketsPlayReviews_' ? 35 : 5)
        .inTimezone('Europe/Madrid').create();
    }
  });
}

function requireMarketsReviewOwner_() {
  const access = requireMarketsAdministrator_();
  if (access.email !== normalizeEmailForComparison_(Session.getEffectiveUser().getEmail())) {
    throw new Error('Esta operación está reservada al propietario de los activadores.');
  }
  return access;
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
    return [[JSON.stringify([app.platform, app.countryCode, app.appId, id]), app.appKey, app.countryCode,
      app.platform, app.appId, id, updatedAt, rating, trimString_(entry['im:version']?.label),
      trimString_(entry.title?.label), original, '', '', '']];
  });
  return { rows, more: links.some(link => link.rel === 'next' && String(link.href).split('?')[0].replace(/\/xml$/, '/json') === marketsReviewFeedUrl_(app, page + 1)) };
}

function marketsReviewLiteral_(value) {
  return typeof value === 'string' && /^[=+\-@']/.test(value) ? "'" + value : value;
}

function collectMarketsReviews_() {
  // User lock keeps ingestion and translation mutually exclusive for the trigger owner.
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return { deferred: true };
  try {
    const ss = openMarketsSpreadsheet_(), sheet = marketsReviewSheet_(ss);
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
    const stored = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 11).getValues() : [];
    const known = new Map(stored.map((row, index) => [row[0], {
      index: index + 2, updated: row[6], original: row[10]
    }]));
    const translationKey = 'MARKETS_REVIEWS_TRANSLATION_ROW';
    const properties = PropertiesService.getScriptProperties(), cursorKey = 'MARKETS_REVIEWS_CURSOR';
    const [cursor, cursorPage] = JSON.parse(properties.getProperty(cursorKey) || '["",1]');
    const start = Math.max(0, apps.findIndex(app => app.appKey === cursor));
    const deadline = Date.now() + 240000;
    let added = 0, updated = 0, failures = 0, processed = 0;
    while (processed < apps.length && Date.now() < deadline) {
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
          for (const row of result.rows) {
            const previous = known.get(row[0]);
            if (!previous) {
              if (!pending.has(row[0]) || Date.parse(row[6]) > Date.parse(pending.get(row[0])[6])) {
                pending.set(row[0], row);
              }
              continue;
            }
            if (Date.parse(row[6]) <= Date.parse(previous.updated)) continue;
            const textChanged = row[10] !== previous.original;
            if (textChanged) {
              const nextTranslation = Number(properties.getProperty(translationKey)) || 2;
              properties.setProperty(translationKey, String(Math.min(nextTranslation, previous.index)));
            }
            const update = row.slice(6, textChanged ? MARKETS_REVIEW_HEADERS.length : 11);
            sheet.getRange(previous.index, 7, 1, update.length).setValues([update.map(marketsReviewLiteral_)]);
            known.set(row[0], { index: previous.index, updated: row[6], original: row[10] });
            updated++;
          }
          if (pending.size) {
            const nextRow = sheet.getLastRow() + 1;
            const rows = [...pending.values()];
            ensureSheetCapacity_(sheet, nextRow + rows.length - 1, MARKETS_REVIEW_HEADERS.length);
            sheet.getRange(nextRow, 1, rows.length, MARKETS_REVIEW_HEADERS.length)
              .setValues(rows.map(row => row.map(marketsReviewLiteral_)));
            rows.forEach((row, i) => known.set(row[0], { index: nextRow + i, updated: row[6], original: row[10] }));
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
    if (first > last) first = 2;
    if (last < first) return { translated: 0 };
    const rows = sheet.getRange(first, 11, Math.min(100, last - first + 1), 4).getValues();
    const deadline = Date.now() + 240000;
    let translated = 0;
    for (let i = 0; i < rows.length && Date.now() < deadline; i++) {
      const [original, ...values] = rows[i];
      if (values.some(value => !value)) {
        const result = ['es', 'en', 'tr'].map((language, index) =>
          values[index] || LanguageApp.translate(String(original), '', language));
        sheet.getRange(first + i, 12, 1, 3).setValues([result.map(marketsReviewLiteral_)]);
        SpreadsheetApp.flush();
        advanceMarketsReviewGeneration_(properties);
        translated++;
      }
      properties.setProperty(key, String(first + i + 1));
    }
    return { translated };
  } finally {
    lock.releaseLock();
  }
}

const MARKETS_DEFAULT_REVIEW_SEGMENTS = [
  { id: 'DETRACTOR', label: 'Detractores', stars: [0, 1, 2] },
  { id: 'NEUTRAL', label: 'Neutros', stars: [3] },
  { id: 'PROMOTER', label: 'Promotores', stars: [4, 5] }
];

function getMarketsReviewSegments() {
  requireMarketsAdministrator_();
  return MARKETS_DEFAULT_REVIEW_SEGMENTS;
}

function readMarketsReviewsForWeb_(filters) {
  const access = requireMarketsAdministrator_();
  return queryMarketsReviews_(access.ss, filters).slice(0, 100);
}

function queryMarketsReviews_(ss, filters, window) {
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
  const seen = new Set();
  const search = normalizeReviewEvidence_(String(filters.search || "").slice(0, 200));
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 15).getValues()
    .flatMap(row => {
      const date = row[6] instanceof Date
        ? Utilities.formatDate(row[6], MARKETS_CONFIG.timeZone, 'yyyy-MM-dd')
        : String(row[6]).slice(0, 10);
      if (window && ((filters.start && date < filters.start) || (filters.end && date > filters.end) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < window.start || date > window.end ||
          !MARKETS_DEFAULT_REVIEW_SEGMENTS.some(group => group.stars.includes(row[7])))) return [];
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
        '&reviewId=' + encodeURIComponent(row[5]) : '';
      return [{ key, listings: apps.map(app => ({ country: app.countryCode, app: app.appName, entity: app.isBbva ? 'BBVA Empresas' : app.appName })),
        entities: [...new Set(apps.map(app => app.isBbva ? 'BBVA Empresas' : app.appName))],
        blocks: [...new Set(ids.map(id => id.slice(0, 2)).filter(id => !window || knownBlocks.has(id)))], app: apps[0].appName, countries: [...new Set(apps.map(app => app.countryCode))],
        platform: row[3], date, rating: row[7], version: String(row[8]),
        title: row[9], original: row[10], text: row[languageColumn] || row[10], url,
        capturedAt: row[14] ? String(row[14]).slice(0, 10) : '',
        translated: Boolean(row[languageColumn] && row[languageColumn] !== row[10]) }];
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
}
