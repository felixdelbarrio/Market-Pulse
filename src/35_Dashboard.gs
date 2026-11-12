/** Materializa las dos fuentes compactas consumidas por el Web App. */
function rebuildDashboardDatasets_(ss, catalog, ratings, execution) {
  const competitionRows = buildCompetitionRows_(ratings, catalog, execution);
  const competitionSheet = ss.getSheetByName(MARKETS_CONFIG.sheets.competition);
  replaceSheetData_(competitionSheet, MARKETS_CONFIG.headers.competition, competitionRows);

  const trendRows = buildMonthlyTrendRows_(ratings);
  const trendSheet = ss.getSheetByName(MARKETS_CONFIG.sheets.trends);
  replaceSheetData_(trendSheet, MARKETS_CONFIG.headers.trends, trendRows);

  return { trendRows: trendRows.length, competitionRows: competitionRows.length };
}

function buildExecutionStatus_(execution) {
  const out = {};
  (execution && execution.results || []).forEach(function (result) {
    out[result.app.appKey] = result.ok ? 'OK' : result.noRating ? 'NO_RATING' : 'ERROR';
  });
  return out;
}

/** Pondera observaciones disponibles por catálogo o volumen de tienda. */
function weightedMetric_(configs, itemsByAppKey, field, weightField) {
  const allConfigs = configs || [];
  if (!allConfigs.length) return { value: '', coverage: 0 };

  let totalCatalogWeight = 0;
  let availableCatalogWeight = 0;
  let catalogWeightedSum = 0;

  let availableVolumeWeight = 0;
  let volumeWeightedSum = 0;
  let observedCount = 0;
  const seenVolumeKeys = {};

  allConfigs.forEach(function (app) {
    const cWeight = nonNegativeNumberOrZero_(app[weightField]);
    if (cWeight > 0) totalCatalogWeight += cWeight;

    const item = itemsByAppKey[app.appKey];
    const value = item ? toFiniteNumber_(item[field]) : null;
    if (value === null) return;

    observedCount += 1;
    if (cWeight > 0) {
      availableCatalogWeight += cWeight;
      catalogWeightedSum += value * cWeight;
    }

    const vKey = (item && item.volumeKey) || app.appKey;
    const vCount = item ? toNonNegativeInteger_(item.ratingCount) : null;
    const isSharedMultiCountry = weightField === 'groupUserWeight' && item && item.volumeScope === 'SHARED_LISTING';
    if (vCount !== null && vCount > 0 && (!isSharedMultiCountry || !seenVolumeKeys[vKey])) {
      seenVolumeKeys[vKey] = true;
      availableVolumeWeight += vCount;
      volumeWeightedSum += value * vCount;
    }
  });

  if (availableCatalogWeight > 0) {
    return {
      value: round2_(catalogWeightedSum / availableCatalogWeight),
      coverage: totalCatalogWeight > 0 ? round2_(availableCatalogWeight / totalCatalogWeight) : round2_(observedCount / allConfigs.length)
    };
  }
  if (availableVolumeWeight > 0) {
    return {
      value: round2_(volumeWeightedSum / availableVolumeWeight),
      coverage: round2_(observedCount / allConfigs.length)
    };
  }
  return { value: '', coverage: 0 };
}

function validateWeightConfiguration_(catalog) {
  const bbva = marketsCriticalItems_((catalog || []).filter(function (app) {
    return app.isBbva && (app.marketSegment || 'BANK') === 'BANK';
  }));
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
      return a.observedDate.getTime() - b.observedDate.getTime() ||
        a.countryCode.localeCompare(b.countryCode) || compareMarketsPlatforms_(a, b) ||
        a.marketSegment.localeCompare(b.marketSegment) ||
        (a.displayOrder || 0) - (b.displayOrder || 0);
    }).map(function (item) {
      const app = catalogByKey[item.appKey];
      const date = dateKey_(item.observedDate);
      return [item.observedDate, item.platform, item.countryCode, item.country, app.marketSegment,
        item.appKey, item.appName, item.isBbva, app.displayOrder === null ? '' : app.displayOrder,
        item.rating, item.ratingCount === null ? '' : item.ratingCount, item.rankingIsComplete,
        item.delta30d === null ? '' : item.delta30d,
        Boolean(date === referenceKey && statusByApp[item.appKey] === 'OK'),
        item.ratingCountDelta30d == null ? '' : item.ratingCountDelta30d, buildStoreWebUrl_(app)];
    });
}

/** URL web oficial con storefront explicito; nunca usa esquemas de aplicaciones nativas. */
function buildStoreWebUrl_(app) {
  const country = trimString_(app.countryCode).toUpperCase();
  const locale = (trimString_(app.locale).split(/[-_]/)[0] || 'es').toLowerCase();
  if (app.platform === 'Android' && app.packageName) {
    return 'https://play.google.com/store/apps/details?id=' + encodeURIComponent(app.packageName) +
      '&hl=' + encodeURIComponent(locale) + '&gl=' + encodeURIComponent(country);
  }
  if (app.platform === 'iOS' && app.appId) {
    return 'https://apps.apple.com/' + country.toLowerCase() + '/app/id' + encodeURIComponent(app.appId);
  }
  if (app.platform === 'Huawei' && app.appId) {
    return 'https://appgallery.huawei.com/app/' + encodeURIComponent(app.appId) +
      '?locale=' + encodeURIComponent(locale + '_' + country);
  }
  return '';
}

/** Agregacion mensual compacta; el mes siempre deriva de OBSERVED_DATE. */
function buildMonthlyTrendRows_(ratings) {
  const groups = {};
  (ratings || []).filter(function (item) { return item.observedDate instanceof Date && item.rating !== null; })
    .forEach(function (item) {
      const yearMonth = dateKey_(item.observedDate).slice(0, 7);
      const key = [yearMonth, item.platform, item.countryCode, item.marketSegment || 'BANK', item.appKey].join('|');
      const group = groups[key] || (groups[key] = { yearMonth: yearMonth, latest: null });
      if (!group.latest || item.observedDate.getTime() >= group.latest.observedDate.getTime()) group.latest = item;
    });
  return Object.keys(groups).sort().map(function (key) {
    const group = groups[key];
    const latest = group.latest;
    return [dateFromKey_(group.yearMonth + '-01'), latest.platform, latest.countryCode, latest.country,
      latest.appKey, latest.appName, latest.isBbva, latest.rating, latest.marketSegment || 'BANK',
      latest.ratingCount == null ? '' : latest.ratingCount];
  });
}
