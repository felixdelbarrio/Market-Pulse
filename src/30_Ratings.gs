function buildRatingRows_(fetchResults, observedDate, ingestedAt) {
  return fetchResults.filter(function (result) {
    return result.ok && normalizeRating_(result.rating) !== null;
  }).map(function (result) {
    const app = result.app;
    const rating = normalizeRating_(result.rating);
    return [
      makeRatingKey_(observedDate, app.appKey),
      observedDate,
      observedDate.getFullYear(),
      String(observedDate.getFullYear()) + '-' + String(observedDate.getMonth() + 1).padStart(2, '0'),
      app.platform,
      app.store,
      app.countryCode,
      app.country,
      app.appKey,
      app.appName,
      app.appId || app.packageName,
      app.isBbva,
      rating,
      result.ratingCount === null ? '' : result.ratingCount,
      '', '', '', false,
      app.store + ' API',
      ingestedAt
    ];
  });
}

function rebuildRatingMetrics_(ss, lookbackDays) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.ratings);
  if (sheet.getLastRow() <= 1) return;
  const width = MARKETS_CONFIG.headers.ratings.length;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
  const indexes = indexHeaders_(MARKETS_CONFIG.headers.ratings);
  const snapshotGroups = {};
  const seriesByApp = {};
  const maxDateByApp = {};

  values.forEach(function (row, rowIndex) {
    const date = row[indexes.observed_date];
    const rating = normalizeRating_(row[indexes.rating]);
    const appKey = trimString_(row[indexes.app_key]);
    if (!(date instanceof Date) || !appKey || rating === null) return;
    const dateMillis = date.getTime();
    const snapshotKey = [row[indexes.platform], row[indexes.country_code], dateKey_(date)].join('|');
    (snapshotGroups[snapshotKey] || (snapshotGroups[snapshotKey] = [])).push({ rowIndex: rowIndex, rating: rating });
    (seriesByApp[appKey] || (seriesByApp[appKey] = [])).push({ rowIndex: rowIndex, dateMillis: dateMillis, rating: rating });
    maxDateByApp[appKey] = Math.max(maxDateByApp[appKey] || 0, dateMillis);
  });

  const metrics = values.map(function () { return ['', '', '', false]; });
  Object.keys(snapshotGroups).forEach(function (key) {
    const group = snapshotGroups[key];
    const ranks = rankSnapshot_(group);
    group.forEach(function (item, index) { metrics[item.rowIndex][0] = ranks[index]; });
  });
  Object.keys(seriesByApp).forEach(function (appKey) {
    const series = seriesByApp[appKey].sort(function (a, b) { return a.dateMillis - b.dateMillis; });
    series.forEach(function (item) {
      const previous = findPreviousRating_(series, item.dateMillis - lookbackDays * 86400000);
      metrics[item.rowIndex][1] = previous === null ? '' : previous;
      metrics[item.rowIndex][2] = previous === null ? '' : round2_(item.rating - previous);
      metrics[item.rowIndex][3] = item.dateMillis === maxDateByApp[appKey];
    });
  });
  sheet.getRange(2, indexes.ranking + 1, metrics.length, 4).setValues(metrics);
}

function readRatingObjects_(ss) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.ratings);
  if (sheet.getLastRow() <= 1) return [];
  const headers = MARKETS_CONFIG.headers.ratings;
  const indexes = indexHeaders_(headers);
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().map(function (row) {
    return {
      recordKey: trimString_(row[indexes.record_key]),
      observedDate: row[indexes.observed_date],
      platform: trimString_(row[indexes.platform]),
      countryCode: trimString_(row[indexes.country_code]),
      appKey: trimString_(row[indexes.app_key]),
      appName: trimString_(row[indexes.app_name]),
      isBbva: parseBoolean_(row[indexes.is_bbva], false),
      rating: normalizeRating_(row[indexes.rating]),
      ranking: toNonNegativeInteger_(row[indexes.ranking]),
      isLatest: parseBoolean_(row[indexes.is_latest], false)
    };
  }).filter(function (item) { return item.recordKey && item.rating !== null; });
}

