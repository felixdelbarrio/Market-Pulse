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
  const existing = ScriptApp.getProjectTriggers().map(trigger => trigger.getHandlerFunction());
  [['collectMarketsReviews_', 8], ['translateMarketsReviews_', 9]].forEach(([handler, hour]) => {
    if (!existing.includes(handler)) {
      ScriptApp.newTrigger(handler).timeBased().everyDays(1).atHour(hour).nearMinute(5)
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
  const rows = (feed.entry || []).flatMap(entry => {
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
    const known = new Set(lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat() : []);
    const properties = PropertiesService.getScriptProperties(), cursorKey = 'MARKETS_REVIEWS_CURSOR';
    const [cursor, cursorPage] = JSON.parse(properties.getProperty(cursorKey) || '["",1]');
    const start = Math.max(0, apps.findIndex(app => app.appKey === cursor));
    const deadline = Date.now() + 240000;
    let added = 0, failures = 0, processed = 0;
    while (processed < apps.length && Date.now() < deadline) {
      const app = apps[(start + processed) % apps.length];
      try {
        for (let page = app.appKey === cursor ? cursorPage : 1; page <= 10; page++) {
          if (Date.now() >= deadline) {
            properties.setProperty(cursorKey, JSON.stringify([app.appKey, page]));
            return { added, failures, processed, eligible: apps.length, deferred: true };
          }
          const response = UrlFetchApp.fetch(marketsReviewFeedUrl_(app, page), {
            muteHttpExceptions: true, followRedirects: false
          });
          if (response.getResponseCode() !== 200) throw new Error('HTTP ' + response.getResponseCode());
          const result = parseMarketsReviewFeed_(app, page, response.getContentText());
          const pending = new Map(result.rows.filter(row => !known.has(row[0])).map(row => [row[0], row]));
          if (pending.size) {
            const nextRow = sheet.getLastRow() + 1;
            ensureSheetCapacity_(sheet, nextRow + pending.size - 1, MARKETS_REVIEW_HEADERS.length);
            sheet.getRange(nextRow, 1, pending.size, MARKETS_REVIEW_HEADERS.length)
              .setValues([...pending.values()].map(row => row.map(marketsReviewLiteral_)));
            SpreadsheetApp.flush();
            pending.forEach((row, key) => known.add(key));
            added += pending.size;
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
    const summary = { added, failures, processed, eligible: apps.length };
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
        translated++;
      }
      properties.setProperty(key, String(first + i + 1));
    }
    return { translated };
  } finally {
    lock.releaseLock();
  }
}

function getMarketsReviews(filters) {
  const access = requireMarketsAdministrator_();
  filters = filters || {};
  const catalog = new Map(readAppCatalog_(access.ss).map(app => [app.appKey, app]));
  const sheet = access.ss.getSheetByName('MARKET_REVIEWS');
  if (!sheet || sheet.getLastRow() < 2) return [];
  marketsReviewSheet_(access.ss);
  const languageColumn = { es: 11, en: 12, tr: 13 }[filters.language] || 11;
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, MARKETS_REVIEW_HEADERS.length).getValues()
    .filter(row => {
      const app = catalog.get(row[1]);
      return app && row[2] === app.countryCode && row[3] === app.platform && String(row[4]) === app.appId &&
        (filters.country === 'ALL' || row[2] === filters.country) &&
        (filters.platform === 'ALL' || row[3] === filters.platform) &&
        (!filters.app || (app.isBbva ? 'BBVA Empresas' : app.appName) === filters.app) &&
        (!filters.period || String(row[6]).startsWith(filters.period));
    })
    .sort((a, b) => Date.parse(b[6]) - Date.parse(a[6])).slice(0, 100)
    .map(row => ({
      app: catalog.get(row[1]).appName, country: row[2], platform: row[3], date: String(row[6]).slice(0, 10),
      rating: row[7], version: String(row[8]), title: row[9], original: row[10],
      text: row[languageColumn] || row[10], translated: Boolean(row[languageColumn] && row[languageColumn] !== row[10])
    }));
}
