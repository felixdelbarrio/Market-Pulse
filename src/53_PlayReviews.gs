/** Public Google Play web results. The requested storefront does not establish reviewer location. */
function fetchPlayReviewPage_(listing, token) {
  const locale = /^[a-z]{2}(?:-[a-z]{2})?$/i.test(listing.locale) ? listing.locale : 'en';
  const url = 'https://play.google.com/_/PlayStoreUi/data/batchexecute?rpcids=oCPfdb&hl=' +
    encodeURIComponent(locale) + '&gl=' + listing.countryCode.toLowerCase();
  const paging = token ? [150, null, token] : [150];
  const body = [null, [2, 2, paging, null, Array(9).fill(null)], [listing.packageName, 7]];
  const response = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/x-www-form-urlencoded;charset=UTF-8',
    payload: 'f.req=' + encodeURIComponent(JSON.stringify([[['oCPfdb', JSON.stringify(body), null, 'generic']]])),
    muteHttpExceptions: true, followRedirects: false
  });
  const status = response.getResponseCode();
  if (status !== 200) {
    const error = new Error('Google Play HTTP ' + status);
    error.rateLimited = status === 429 || status === 503;
    throw error;
  }
  return parsePlayReviewPage_(response.getContentText());
}

function parsePlayReviewPage_(body) {
  if (!body.startsWith(")]}'")) throw new Error('Respuesta inesperada de Google Play.');
  const envelope = JSON.parse(body.slice(4));
  const frame = envelope.find(item => item[0] === 'wrb.fr' && item[1] === 'oCPfdb');
  if (!frame || typeof frame[2] !== 'string') throw new Error('Google Play no devolvió un bloque de reseñas.');
  const data = JSON.parse(frame[2]);
  if (!Array.isArray(data) || (data[0] != null && !Array.isArray(data[0]))) {
    throw new Error('El formato de reseñas de Google Play ha cambiado.');
  }
  const rows = (data[0] || []).flatMap(item => {
    const id = trimString_(item[0]), text = trimString_(item[4]), rating = item[2];
    const seconds = item[5]?.[0], nanos = item[5]?.[1] || 0;
    if (!/^[a-z0-9_-]{8,128}$/i.test(id) || !text || !Number.isInteger(rating) ||
        rating < 1 || rating > 5 || !Number.isFinite(seconds) || seconds <= 0) return [];
    const date = new Date(seconds * 1000 + nanos / 1000000);
    if (!Number.isFinite(date.getTime())) return [];
    return [{ id, text, rating, date: date.toISOString(), version: trimString_(item[10]) }];
  });
  if (data[0]?.length && !rows.length) throw new Error('Google Play devolvió reseñas sin los campos esperados.');
  const next = data[1]?.[1];
  return { rows, next: typeof next === 'string' && next.length <= 8000 ? next : '' };
}

function runMarketsPlayReviewBackfill() {
  requireMarketsReviewOwner_();
  return collectMarketsPlayReviews_();
}

function collectMarketsPlayReviews_() {
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return { deferred: true };
  try {
    const ss = openMarketsSpreadsheet_(), sheet = marketsReviewSheet_(ss);
    const properties = PropertiesService.getScriptProperties();
    const indexKey = 'MARKETS_PLAY_REVIEW_INDEX';
    const pauseKey = 'MARKETS_PLAY_REVIEW_PAUSE';
    if (Number(properties.getProperty(pauseKey)) > Date.now()) return { deferred: true };
    const listings = new Map();
    readAppCatalog_(ss).forEach(app => {
      if (app.platform === 'Android' && /^[A-Z]{2}$/.test(app.countryCode) &&
          /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i.test(app.packageName)) {
        listings.set(app.packageName + '|' + app.countryCode, app);
      }
    });
    const keys = [...listings.keys()].sort();
    if (!keys.length) return { added: 0, eligible: 0 };
    const last = sheet.getLastRow();
    const stored = last > 1 ? sheet.getRange(2, 1, last - 1, 15).getValues() : [];
    const known = new Map();
    stored.forEach((row, index) => {
      if (row[3] === 'Android') known.set(row[0], { row, index: index + 2 });
    });
    const deadline = Date.now() + 235000;
    const start = Math.max(0, keys.indexOf(properties.getProperty(indexKey)));
    const summary = { added: 0, updated: 0, failures: 0, pages: 0, eligible: keys.length };
    // One latest page and one historical page per storefront per round.
    for (let step = 0; step < keys.length && Date.now() < deadline && summary.pages < 100; step++) {
      const index = (start + step) % keys.length, key = keys[index], listing = listings.get(key);
      const stateKey = 'MARKETS_PLAY_REVIEW|' + key;
      const history = properties.getProperty(stateKey);
      try {
        const latest = fetchPlayReviewPage_(listing, '');
        storePlayReviews_(sheet, properties, known, listing, latest.rows, summary);
        if (history === null) properties.setProperty(stateKey, latest.next || 'DONE');
        summary.pages++;
        if (history && history !== 'DONE' && Date.now() < deadline) {
          const page = fetchPlayReviewPage_(listing, history);
          storePlayReviews_(sheet, properties, known, listing, page.rows, summary);
          properties.setProperty(stateKey, page.next && page.next !== history ? page.next : 'DONE');
          summary.pages++;
        }
      } catch (error) {
        summary.failures++;
        console.warn(key + ': ' + error.message);
        if (error.rateLimited) {
          properties.setProperty(pauseKey, String(Date.now() + 60 * 60 * 1000));
          break;
        }
        if (history && /HTTP (400|404)$/.test(error.message)) properties.deleteProperty(stateKey);
      }
      properties.setProperty(indexKey, keys[(index + 1) % keys.length]);
    }
    console.log(JSON.stringify(summary));
    return summary;
  } finally {
    lock.releaseLock();
  }
}

function storePlayReviews_(sheet, properties, known, listing, reviews, summary) {
  const changes = new Map();
  const captured = new Date().toISOString();
  let nextIndex = sheet.getLastRow() + 1;
  let rewind = Number(properties.getProperty('MARKETS_REVIEWS_TRANSLATION_ROW')) || 2;
  for (const review of reviews) {
    const key = JSON.stringify(['Android', listing.packageName, review.id]);
    const previous = changes.get(key) || known.get(key);
    const markets = new Set(previous ? String(previous.row[2]).split(',') : []);
    const newMarket = !markets.has(listing.countryCode);
    markets.add(listing.countryCode);
    const newer = !previous || Date.parse(review.date) > Date.parse(previous.row[6]);
    if (!newer && !newMarket) continue;
    const row = newer ? [key, listing.appKey, '', 'Android', listing.packageName, review.id, review.date,
      review.rating, review.version, '', review.text, '', '', '', captured] : previous.row.slice();
    const index = previous ? previous.index : nextIndex++;
    if (previous && newer) {
      if (previous.row[10] === review.text) row.splice(11, 3, ...previous.row.slice(11, 14));
      else rewind = Math.min(rewind, index);
    }
    row[2] = [...markets].sort().join(',');
    row[14] = captured;
    changes.set(key, { row, index });
  }
  if (!changes.size) return;
  ensureSheetCapacity_(sheet, nextIndex - 1, 15);
  properties.setProperty('MARKETS_REVIEWS_TRANSLATION_ROW', String(rewind));
  const ordered = [...changes.values()].sort((a, b) => a.index - b.index);
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && ordered[end].index === ordered[end - 1].index + 1) end++;
    const rows = ordered.slice(start, end).map(item => item.row.map(marketsReviewLiteral_));
    sheet.getRange(ordered[start].index, 1, rows.length, 15).setValues(rows);
    start = end;
  }
  SpreadsheetApp.flush();
  changes.forEach((item, key) => {
    if (known.has(key)) summary.updated++;
    else summary.added++;
    known.set(key, item);
  });
}
