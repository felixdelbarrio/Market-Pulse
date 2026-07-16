/** Materializa las fuentes pequenas que consume Looker Studio. */
function rebuildDashboardDatasets_(ss, catalog, ratings) {
  const scorecards = buildScorecardDataset_(ratings, catalog);
  const scorecardSheet = ss.getSheetByName(MARKETS_CONFIG.sheets.scorecards);
  replaceSheetData_(scorecardSheet, scorecards.headers, scorecards.rows);
  scorecardSheet.getRange('A:A').setNumberFormat('yyyy-mm-dd');
  if (scorecards.headers.length > 3) {
    scorecardSheet.getRange(2, 4, Math.max(1, scorecards.rows.length), scorecards.headers.length - 3)
      .setNumberFormat('0.00');
  }

  const trendRows = buildMonthlyTrendRows_(ratings, catalog);
  const trendSheet = ss.getSheetByName(MARKETS_CONFIG.sheets.trends);
  replaceSheetData_(trendSheet, MARKETS_CONFIG.headers.trends, trendRows);

  return { scorecardRows: scorecards.rows.length, trendRows: trendRows.length };
}

/**
 * Una fila por fecha y una columna por KPI. Cada scorecard usa un campo directo,
 * por ejemplo ANDROID_VE_BBVA_RATING, por lo que no necesita un filtro de chart.
 */
function buildScorecardDataset_(ratings, catalog) {
  const platformOrder = { Android: 0, iOS: 1, Huawei: 2 };
  const bbvaCatalog = (catalog || []).filter(function (app) { return app.isBbva; })
    .slice().sort(function (a, b) {
      return (platformOrder[a.platform] - platformOrder[b.platform]) ||
        a.countryCode.localeCompare(b.countryCode) || a.appKey.localeCompare(b.appKey);
    });
  const pairSeen = {};
  const pairs = bbvaCatalog.filter(function (app) {
    const key = app.platform + '|' + app.countryCode;
    if (pairSeen[key]) return false;
    pairSeen[key] = true;
    return true;
  });
  const countrySeen = {};
  const countries = bbvaCatalog.filter(function (app) {
    if (countrySeen[app.countryCode]) return false;
    countrySeen[app.countryCode] = true;
    return true;
  }).map(function (app) { return app.countryCode; }).sort();

  const byDate = {};
  (ratings || []).filter(function (item) {
    return item.isBbva && item.observedDate instanceof Date && item.rating !== null;
  }).forEach(function (item) {
    const key = dateKey_(item.observedDate);
    (byDate[key] || (byDate[key] = {}))[item.appKey] = item;
  });

  const headers = [
    'OBSERVED_DATE', 'YEAR', 'YEAR_MONTH',
    'BBVA_GROUP_RATING', 'BBVA_GROUP_DELTA_30D', 'BBVA_GROUP_WEIGHT_COVERAGE'
  ];
  countries.forEach(function (countryCode) {
    const prefix = 'BBVA_' + fieldSlug_(countryCode);
    headers.push(prefix + '_CONSOLIDATED_RATING');
    headers.push(prefix + '_CONSOLIDATED_DELTA_30D');
    headers.push(prefix + '_WEIGHT_COVERAGE');
  });
  pairs.forEach(function (app) {
    const prefix = fieldSlug_(app.platform) + '_' + fieldSlug_(app.countryCode) + '_BBVA';
    headers.push(prefix + '_RATING');
    headers.push(prefix + '_RATING_COUNT');
    headers.push(prefix + '_RANKING');
    headers.push(prefix + '_PREVIOUS_RATING_30D');
    headers.push(prefix + '_DELTA_30D');
    headers.push(prefix + '_IS_AVAILABLE');
  });

  const rows = Object.keys(byDate).sort().map(function (dateKey) {
    const date = dateFromKey_(dateKey);
    const items = byDate[dateKey];
    const groupRating = weightedMetric_(bbvaCatalog, items, 'rating', 'groupUserWeight');
    const groupDelta = weightedMetric_(bbvaCatalog, items, 'delta30d', 'groupUserWeight');
    const row = [
      date, date.getFullYear(), dateKey.slice(0, 7),
      groupRating.value, groupDelta.value, groupRating.coverage
    ];
    countries.forEach(function (countryCode) {
      const configs = bbvaCatalog.filter(function (app) { return app.countryCode === countryCode; });
      const rating = weightedMetric_(configs, items, 'rating', 'countryPlatformWeight');
      const delta = weightedMetric_(configs, items, 'delta30d', 'countryPlatformWeight');
      row.push(rating.value, delta.value, rating.coverage);
    });
    pairs.forEach(function (app) {
      const item = items[app.appKey];
      row.push(item ? item.rating : '');
      row.push(item && item.ratingCount !== null ? item.ratingCount : '');
      row.push(item && item.ranking !== null ? item.ranking : '');
      row.push(item && item.previousRating30d !== null ? item.previousRating30d : '');
      row.push(item && item.delta30d !== null ? item.delta30d : '');
      row.push(Boolean(item));
    });
    return row;
  });
  return { headers: headers, rows: rows };
}

/** Solo publica el consolidado cuando estan presentes todos los pesos configurados. */
function weightedMetric_(configs, itemsByAppKey, field, weightField) {
  const weightedConfigs = (configs || []).filter(function (app) {
    return nonNegativeNumberOrZero_(app[weightField]) > 0;
  });
  const totalWeight = weightedConfigs.reduce(function (sum, app) {
    return sum + nonNegativeNumberOrZero_(app[weightField]);
  }, 0);
  if (!totalWeight) return { value: '', coverage: 0 };
  let availableWeight = 0;
  let weightedValue = 0;
  weightedConfigs.forEach(function (app) {
    const item = itemsByAppKey[app.appKey];
    const value = item ? toFiniteNumber_(item[field]) : null;
    if (value === null) return;
    const weight = nonNegativeNumberOrZero_(app[weightField]);
    availableWeight += weight;
    weightedValue += value * weight;
  });
  const coverage = round2_(availableWeight / totalWeight);
  return {
    value: Math.abs(availableWeight - totalWeight) < 0.0000001
      ? round2_(weightedValue / totalWeight) : '',
    coverage: coverage
  };
}

/** Agregacion mensual compacta para las pantallas de evolucion. */
function buildMonthlyTrendRows_(ratings, catalog) {
  const displayOrderByApp = (catalog || []).reduce(function (out, app) {
    out[app.appKey] = app.displayOrder === null || app.displayOrder === undefined ? '' : app.displayOrder;
    return out;
  }, {});
  const groups = {};
  (ratings || []).filter(function (item) {
    return item.observedDate instanceof Date && item.rating !== null;
  }).forEach(function (item) {
    const yearMonth = item.yearMonth || dateKey_(item.observedDate).slice(0, 7);
    const key = [yearMonth, item.platform, item.countryCode, item.appKey].join('|');
    const group = groups[key] || (groups[key] = {
      yearMonth: yearMonth, platform: item.platform, countryCode: item.countryCode,
      country: item.country, appKey: item.appKey, appName: item.appName,
      isBbva: item.isBbva, sum: 0, count: 0, min: null, max: null, latest: null
    });
    group.sum += item.rating;
    group.count += 1;
    group.min = group.min === null ? item.rating : Math.min(group.min, item.rating);
    group.max = group.max === null ? item.rating : Math.max(group.max, item.rating);
    if (!group.latest || item.observedDate.getTime() >= group.latest.observedDate.getTime()) group.latest = item;
  });
  return Object.keys(groups).sort().map(function (key) {
    const group = groups[key];
    const period = dateFromKey_(group.yearMonth + '-01');
    return [
      period, group.yearMonth, group.platform, group.countryCode, group.country,
      group.appKey, group.appName, group.isBbva, displayOrderByApp[group.appKey] === undefined ? '' : displayOrderByApp[group.appKey],
      round2_(group.sum / group.count),
      group.latest.rating, group.min, group.max, group.count,
      group.latest.ranking === null ? '' : group.latest.ranking,
      group.latest.delta30d === null ? '' : group.latest.delta30d
    ];
  });
}
