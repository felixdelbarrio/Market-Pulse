function buildRatingRows_(fetchResults, observedDate, ingestedAt) {
  const monthDate = dateFromKey_(dateKey_(observedDate).slice(0, 7) + '-01');
  return fetchResults.filter(function (result) {
    return result.ok && normalizeRating_(result.rating) !== null;
  }).map(function (result) {
    const app = result.app;
    const rating = normalizeRating_(result.rating);
    return [
      makeRatingKey_(observedDate, app.appKey), observedDate, observedDate.getFullYear(), monthDate,
      app.platform, app.store, app.countryCode, app.country, app.appKey, app.appName,
      app.appId || app.packageName, app.isBbva, rating,
      result.ratingCount === null ? '' : result.ratingCount,
      '', '', '', false, app.store + ' API', ingestedAt,
      app.marketSegment || 'BANK', app.displayOrder === null ? '' : app.displayOrder,
      '', '', '', false, '', ''
    ];
  });
}

/**
 * Recalcula meses, delta y ranking. El ranking solo se publica cuando todos los
 * miembros habilitados del benchmark plataforma/pais/segmento tienen rating.
 */
function rebuildRatingMetrics_(ss, lookbackDays, catalog) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.ratings);
  if (sheet.getLastRow() <= 1) return;
  const width = MARKETS_CONFIG.headers.ratings.length;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
  const indexes = indexHeaders_(MARKETS_CONFIG.headers.ratings);
  const catalogByKey = {};
  const expectedByGroup = {};
  (catalog || []).forEach(function (app) {
    catalogByKey[app.appKey] = app;
    const groupKey = [app.platform, app.countryCode, app.marketSegment || 'BANK'].join('|');
    expectedByGroup[groupKey] = (expectedByGroup[groupKey] || 0) + 1;
  });
  const snapshotGroups = {};
  const seriesByApp = {};
  const maxDateByApp = {};
  const monthValues = values.map(function () { return ['']; });
  const catalogValues = values.map(function () { return ['', '', '', '', '', false]; });

  values.forEach(function (row, rowIndex) {
    const date = row[indexes.observed_date];
    const rating = normalizeRating_(row[indexes.rating]);
    const appKey = trimString_(row[indexes.app_key]);
    if (!(date instanceof Date) || !appKey || rating === null) return;
    monthValues[rowIndex][0] = dateFromKey_(dateKey_(date).slice(0, 7) + '-01');
    const app = catalogByKey[appKey];
    const segment = app ? app.marketSegment : (trimString_(row[indexes.market_segment]) || 'BANK');
    const displayOrder = app && app.displayOrder !== null ? app.displayOrder : toNonNegativeInteger_(row[indexes.display_order]);
    catalogValues[rowIndex][0] = segment;
    catalogValues[rowIndex][1] = displayOrder === null ? '' : displayOrder;
    if (app) {
      const groupKey = [app.platform, app.countryCode, segment].join('|');
      const snapshotKey = groupKey + '|' + dateKey_(date);
      (snapshotGroups[snapshotKey] || (snapshotGroups[snapshotKey] = {
        expected: expectedByGroup[groupKey] || 0, items: []
      })).items.push({ rowIndex: rowIndex, rating: rating });
    }
    const dateMillis = date.getTime();
    (seriesByApp[appKey] || (seriesByApp[appKey] = [])).push({
      rowIndex: rowIndex,
      dateMillis: dateMillis,
      rating: rating,
      ratingCount: toNonNegativeInteger_(row[indexes.rating_count])
    });
    maxDateByApp[appKey] = Math.max(maxDateByApp[appKey] || 0, dateMillis);
  });

  const metrics = values.map(function () { return ['', '', '', false]; });
  const countMetrics = values.map(function () { return ['', '']; });
  Object.keys(snapshotGroups).forEach(function (key) {
    const group = snapshotGroups[key];
    const observed = group.items.length;
    const expected = group.expected;
    const complete = expected > 0 && observed === expected;
    const coverage = expected > 0 ? round2_(observed / expected) : 0;
    const ranks = rankSnapshot_(group.items);
    group.items.forEach(function (item, index) {
      metrics[item.rowIndex][0] = complete ? ranks[index] : '';
      catalogValues[item.rowIndex][2] = expected;
      catalogValues[item.rowIndex][3] = observed;
      catalogValues[item.rowIndex][4] = coverage;
      catalogValues[item.rowIndex][5] = complete;
    });
  });
  Object.keys(seriesByApp).forEach(function (appKey) {
    const series = seriesByApp[appKey].sort(function (a, b) { return a.dateMillis - b.dateMillis; });
    series.forEach(function (item) {
      const target = item.dateMillis - lookbackDays * 86400000;
      const previous = findPreviousRating_(series, target);
      const previousCount = findPreviousValue_(series, target, 'ratingCount');
      metrics[item.rowIndex][1] = previous === null ? '' : previous;
      metrics[item.rowIndex][2] = previous === null ? '' : round2_(item.rating - previous);
      metrics[item.rowIndex][3] = item.dateMillis === maxDateByApp[appKey];
      countMetrics[item.rowIndex][0] = previousCount === null ? '' : previousCount;
      countMetrics[item.rowIndex][1] = previousCount === null || item.ratingCount === null
        ? '' : item.ratingCount - previousCount;
    });
  });
  sheet.getRange(2, indexes.year_month + 1, monthValues.length, 1).setValues(monthValues).setNumberFormat('yyyy-mm');
  sheet.getRange(2, indexes.ranking + 1, metrics.length, 4).setValues(metrics);
  sheet.getRange(2, indexes.market_segment + 1, catalogValues.length, 6).setValues(catalogValues);
  sheet.getRange(2, indexes.previous_rating_count_30d + 1, countMetrics.length, 2).setValues(countMetrics);
}

function readRatingObjects_(ss) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.ratings);
  if (sheet.getLastRow() <= 1) return [];
  const headers = MARKETS_CONFIG.headers.ratings;
  const indexes = indexHeaders_(headers);
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().map(function (row) {
    const observedDate = row[indexes.observed_date];
    return {
      recordKey: trimString_(row[indexes.record_key]), observedDate: observedDate,
      yearMonth: observedDate instanceof Date ? dateKey_(observedDate).slice(0, 7) : '',
      platform: trimString_(row[indexes.platform]), countryCode: trimString_(row[indexes.country_code]),
      country: trimString_(row[indexes.country]), appKey: trimString_(row[indexes.app_key]),
      appName: trimString_(row[indexes.app_name]), isBbva: parseBoolean_(row[indexes.is_bbva], false),
      rating: normalizeRating_(row[indexes.rating]), ratingCount: toNonNegativeInteger_(row[indexes.rating_count]),
      ranking: toNonNegativeInteger_(row[indexes.ranking]), previousRating30d: normalizeRating_(row[indexes.previous_rating_30d]),
      delta30d: toFiniteNumber_(row[indexes.delta_30d]), isLatest: parseBoolean_(row[indexes.is_latest], false),
      ingestedAt: row[indexes.ingested_at], marketSegment: trimString_(row[indexes.market_segment]) || 'BANK',
      displayOrder: toNonNegativeInteger_(row[indexes.display_order]),
      rankingExpectedApps: toNonNegativeInteger_(row[indexes.ranking_expected_apps]),
      rankingObservedApps: toNonNegativeInteger_(row[indexes.ranking_observed_apps]),
      rankingCoverage: toFiniteNumber_(row[indexes.ranking_coverage]),
      rankingIsComplete: parseBoolean_(row[indexes.ranking_is_complete], false),
      previousRatingCount30d: toNonNegativeInteger_(row[indexes.previous_rating_count_30d]),
      ratingCountDelta30d: toFiniteNumber_(row[indexes.rating_count_delta_30d])
    };
  }).filter(function (item) { return item.recordKey && item.rating !== null; });
}
