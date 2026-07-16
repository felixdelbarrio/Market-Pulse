/** Materializa fuentes pequenas y sin filtros de chart para Looker Studio. */
function rebuildDashboardDatasets_(ss, catalog, ratings, execution) {
  const scorecards = buildScorecardDataset_(ratings, catalog, execution);
  const scorecardSheet = ss.getSheetByName(MARKETS_CONFIG.sheets.scorecards);
  replaceSheetData_(scorecardSheet, scorecards.headers, scorecards.rows);
  scorecardSheet.getRange('A:A').setNumberFormat('yyyy-mm-dd');

  const competitionRows = buildCompetitionRows_(ratings, catalog, execution);
  const competitionSheet = ss.getSheetByName(MARKETS_CONFIG.sheets.competition);
  replaceSheetData_(competitionSheet, MARKETS_CONFIG.headers.competition, competitionRows);

  const trendRows = buildMonthlyTrendRows_(ratings, catalog);
  const trendSheet = ss.getSheetByName(MARKETS_CONFIG.sheets.trends);
  replaceSheetData_(trendSheet, MARKETS_CONFIG.headers.trends, trendRows);

  return { scorecardRows: scorecards.rows.length, trendRows: trendRows.length, competitionRows: competitionRows.length };
}

function buildExecutionStatus_(execution) {
  const out = {};
  (execution && execution.results || []).forEach(function (result) {
    out[result.app.appKey] = result.ok ? 'OK' : result.noRating ? 'NO_RATING' : 'ERROR';
  });
  return out;
}

/** Una fila por fecha; cada scorecard consume un campo directo y no un filtro. */
function buildScorecardDataset_(ratings, catalog, execution) {
  const platformOrder = { Android: 0, iOS: 1, Huawei: 2 };
  const bbvaCatalog = (catalog || []).filter(function (app) { return app.isBbva && (app.marketSegment || 'BANK') === 'BANK'; })
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
    return item.isBbva && (item.marketSegment || 'BANK') === 'BANK' && item.observedDate instanceof Date && item.rating !== null;
  }).forEach(function (item) {
    const key = dateKey_(item.observedDate);
    (byDate[key] || (byDate[key] = {}))[item.appKey] = item;
  });
  const statusByApp = buildExecutionStatus_(execution);
  const referenceKey = execution && execution.referenceDate instanceof Date ? dateKey_(execution.referenceDate) : '';

  const headers = ['OBSERVED_DATE', 'YEAR', 'YEAR_MONTH', 'BBVA_GROUP_RATING',
    'BBVA_GROUP_DELTA_30D', 'BBVA_GROUP_WEIGHT_COVERAGE'];
  countries.forEach(function (countryCode) {
    const prefix = 'BBVA_' + fieldSlug_(countryCode);
    headers.push(prefix + '_CONSOLIDATED_RATING', prefix + '_CONSOLIDATED_DELTA_30D', prefix + '_WEIGHT_COVERAGE');
  });
  pairs.forEach(function (app) {
    const prefix = fieldSlug_(app.platform) + '_' + fieldSlug_(app.countryCode) + '_BBVA';
    headers.push(prefix + '_RATING', prefix + '_RATING_COUNT', prefix + '_RANKING',
      prefix + '_PREVIOUS_RATING_30D', prefix + '_DELTA_30D', prefix + '_IS_AVAILABLE',
      prefix + '_RANKING_EXPECTED_APPS', prefix + '_RANKING_OBSERVED_APPS',
      prefix + '_RANKING_COVERAGE', prefix + '_RANKING_IS_COMPLETE',
      prefix + '_IS_FRESH_THIS_RUN', prefix + '_FETCH_STATUS');
  });

  const rows = Object.keys(byDate).sort().map(function (dateKey) {
    const date = dateFromKey_(dateKey);
    const items = byDate[dateKey];
    const groupRating = weightedMetric_(bbvaCatalog, items, 'rating', 'groupUserWeight');
    const groupDelta = weightedMetric_(bbvaCatalog, items, 'delta30d', 'groupUserWeight');
    const row = [date, date.getFullYear(), dateFromKey_(dateKey.slice(0, 7) + '-01'),
      groupRating.value, groupDelta.value, groupRating.coverage];
    countries.forEach(function (countryCode) {
      const configs = bbvaCatalog.filter(function (app) { return app.countryCode === countryCode; });
      const rating = weightedMetric_(configs, items, 'rating', 'countryPlatformWeight');
      const delta = weightedMetric_(configs, items, 'delta30d', 'countryPlatformWeight');
      row.push(rating.value, delta.value, rating.coverage);
    });
    pairs.forEach(function (app) {
      const item = items[app.appKey];
      const fresh = Boolean(item && dateKey === referenceKey && statusByApp[app.appKey] === 'OK');
      row.push(item ? item.rating : '', item && item.ratingCount !== null ? item.ratingCount : '',
        item && item.rankingIsComplete && item.ranking !== null ? item.ranking : '',
        item && item.previousRating30d !== null ? item.previousRating30d : '',
        item && item.delta30d !== null ? item.delta30d : '', Boolean(item),
        item && item.rankingExpectedApps !== null ? item.rankingExpectedApps : '',
        item && item.rankingObservedApps !== null ? item.rankingObservedApps : '',
        item && item.rankingCoverage !== null ? item.rankingCoverage : '',
        Boolean(item && item.rankingIsComplete), fresh,
        dateKey === referenceKey ? (statusByApp[app.appKey] || 'NOT_FETCHED') : 'HISTORICAL');
    });
    return row;
  });
  return { headers: headers, rows: rows };
}

/** Solo publica consolidados con pesos positivos, documentados y completos. */
function weightedMetric_(configs, itemsByAppKey, field, weightField) {
  const weightedConfigs = (configs || []).filter(function (app) {
    return nonNegativeNumberOrZero_(app[weightField]) > 0 && trimString_(app.weightSource) && app.weightEffectiveDate;
  });
  const totalWeight = weightedConfigs.reduce(function (sum, app) {
    return sum + nonNegativeNumberOrZero_(app[weightField]);
  }, 0);
  if (!totalWeight || weightedConfigs.length !== (configs || []).length) return { value: '', coverage: 0 };
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
  return { value: Math.abs(availableWeight - totalWeight) < 0.0000001 ? round2_(weightedValue / totalWeight) : '', coverage: coverage };
}

function validateWeightConfiguration_(catalog) {
  const bbva = (catalog || []).filter(function (app) { return app.isBbva && (app.marketSegment || 'BANK') === 'BANK'; });
  const configured = bbva.filter(function (app) {
    return (app.countryPlatformWeight > 0 || app.groupUserWeight > 0) && app.weightSource && app.weightEffectiveDate;
  }).length;
  if (!configured) return 'MISSING';
  return configured === bbva.length ? 'OK' : 'PARTIAL';
}

function buildCompetitionRows_(ratings, catalog, execution) {
  const catalogByKey = (catalog || []).reduce(function (out, app) { out[app.appKey] = app; return out; }, {});
  const statusByApp = buildExecutionStatus_(execution);
  const referenceKey = execution && execution.referenceDate instanceof Date ? dateKey_(execution.referenceDate) : '';
  return (ratings || []).filter(function (item) { return Boolean(catalogByKey[item.appKey]); })
    .slice().sort(function (a, b) {
      return a.observedDate.getTime() - b.observedDate.getTime() || a.platform.localeCompare(b.platform) ||
        a.countryCode.localeCompare(b.countryCode) || a.marketSegment.localeCompare(b.marketSegment) ||
        (a.displayOrder || 0) - (b.displayOrder || 0);
    }).map(function (item) {
      const app = catalogByKey[item.appKey];
      const date = dateKey_(item.observedDate);
      return [item.observedDate, dateFromKey_(date.slice(0, 7) + '-01'), item.platform,
        item.countryCode, item.country, app.marketSegment, app.dashboardSection, app.productScope,
        app.competitorSetVersion, item.appKey, item.appName, item.isBbva,
        app.displayOrder === null ? '' : app.displayOrder, item.rating,
        item.ratingCount === null ? '' : item.ratingCount,
        item.rankingIsComplete && item.ranking !== null ? item.ranking : '',
        item.rankingExpectedApps === null ? '' : item.rankingExpectedApps,
        item.rankingObservedApps === null ? '' : item.rankingObservedApps,
        item.rankingCoverage === null ? '' : item.rankingCoverage, item.rankingIsComplete,
        item.previousRating30d === null ? '' : item.previousRating30d,
        item.delta30d === null ? '' : item.delta30d, item.isLatest, item.ingestedAt || '',
        Boolean(date === referenceKey && statusByApp[item.appKey] === 'OK'),
        date === referenceKey ? (statusByApp[item.appKey] || 'NOT_FETCHED') : 'HISTORICAL',
        date === referenceKey && execution ? execution.runId : ''];
    });
}

/** Agregacion mensual compacta; el mes siempre deriva de OBSERVED_DATE. */
function buildMonthlyTrendRows_(ratings, catalog) {
  const catalogByKey = (catalog || []).reduce(function (out, app) { out[app.appKey] = app; return out; }, {});
  const groups = {};
  (ratings || []).filter(function (item) { return item.observedDate instanceof Date && item.rating !== null; })
    .forEach(function (item) {
      const yearMonth = dateKey_(item.observedDate).slice(0, 7);
      const key = [yearMonth, item.platform, item.countryCode, item.marketSegment || 'BANK', item.appKey].join('|');
      const group = groups[key] || (groups[key] = { yearMonth: yearMonth, platform: item.platform,
        countryCode: item.countryCode, country: item.country, appKey: item.appKey, appName: item.appName,
        isBbva: item.isBbva, sum: 0, count: 0, min: null, max: null, latest: null });
      group.sum += item.rating; group.count += 1;
      group.min = group.min === null ? item.rating : Math.min(group.min, item.rating);
      group.max = group.max === null ? item.rating : Math.max(group.max, item.rating);
      if (!group.latest || item.observedDate.getTime() >= group.latest.observedDate.getTime()) group.latest = item;
    });
  return Object.keys(groups).sort().map(function (key) {
    const group = groups[key];
    const app = catalogByKey[group.appKey] || {};
    return [dateFromKey_(group.yearMonth + '-01'), group.yearMonth, group.platform, group.countryCode,
      group.country, group.appKey, group.appName, group.isBbva,
      app.displayOrder === null || app.displayOrder === undefined ? '' : app.displayOrder,
      round2_(group.sum / group.count), group.latest.rating, group.min, group.max, group.count,
      group.latest.rankingIsComplete && group.latest.ranking !== null ? group.latest.ranking : '',
      group.latest.delta30d === null ? '' : group.latest.delta30d,
      app.marketSegment || group.latest.marketSegment || 'BANK', app.dashboardSection || 'COUNTRY_BANKS',
      app.productScope || 'BUSINESS',
      group.latest.rankingExpectedApps === null ? '' : group.latest.rankingExpectedApps,
      group.latest.rankingObservedApps === null ? '' : group.latest.rankingObservedApps,
      group.latest.rankingCoverage === null ? '' : group.latest.rankingCoverage,
      Boolean(group.latest.rankingIsComplete)];
  });
}
