/** Web app y API de lectura para el dashboard de ratings. */
var MARKETS_WEB = Object.freeze({
  version: '2026.07.17.1',
  cacheSeconds: 300,
  maxCacheCharacters: 90000,
  defaultTrendMonths: 18,
  maxTrendMonths: 36,
  maxDateOptions: 400
});

/**
 * Publica el dashboard HTML o una respuesta JSON bajo el mismo control de acceso
 * del despliegue de Apps Script.
 *
 * Rutas JSON:
 *   ?api=bootstrap
 *   ?api=snapshot&date=2026-07-17
 *   ?api=trends&country=MX&platform=Android&segment=BANK&months=18
 */
function doGet(event) {
  const parameters = event && event.parameter || {};
  if (parameters.api) return serveMarketsApi_(parameters);
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Markets Ratings Intelligence')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.SAMEORIGIN);
}

function serveMarketsApi_(parameters) {
  try {
    let data;
    const resource = trimString_(parameters.api).toLowerCase();
    if (resource === 'bootstrap') data = getMarketsDashboardBootstrap();
    else if (resource === 'snapshot') data = getMarketsDashboardSnapshot(parameters.date);
    else if (resource === 'trends') {
      data = getMarketsDashboardTrends({
        countryCode: parameters.country,
        platform: parameters.platform,
        segment: parameters.segment,
        months: parameters.months,
        bbvaOnly: parameters.bbvaOnly
      });
    } else {
      throw new Error('Recurso API no soportado: ' + resource);
    }
    return marketsJsonResponse_({ ok: true, data: data });
  } catch (error) {
    return marketsJsonResponse_({ ok: false, error: errorToString_(error) });
  }
}

function marketsJsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/** RPC inicial consumido por Index.html. */
function getMarketsDashboardBootstrap() {
  const ss = openMarketsSpreadsheet_();
  const dateIndex = readCompetitionDateIndexForWeb_(ss);
  if (!dateIndex.availableDates.length) throw new Error('DASHBOARD_COMPETITION no contiene fechas publicables.');
  const latestDate = dateIndex.availableDates[dateIndex.availableDates.length - 1];
  const snapshot = readCompetitionSnapshotForWeb_(ss, dateIndex, latestDate);
  const trends = readDashboardTrendsForWeb_(ss, {
    segment: 'BANK', bbvaOnly: true, months: MARKETS_WEB.defaultTrendMonths
  });
  return {
    meta: buildMarketsWebMeta_(ss, dateIndex, snapshot, latestDate),
    snapshot: snapshot,
    trends: trends,
    consolidated: readConsolidatedSnapshotForWeb_(ss, latestDate)
  };
}

/** RPC para navegar a una fecha historica sin descargar las 32k filas. */
function getMarketsDashboardSnapshot(dateKey) {
  const ss = openMarketsSpreadsheet_();
  const dateIndex = readCompetitionDateIndexForWeb_(ss);
  const requested = normalizeDashboardDateRequest_(dateKey, dateIndex.availableDates);
  return {
    date: requested,
    snapshot: readCompetitionSnapshotForWeb_(ss, dateIndex, requested),
    consolidated: readConsolidatedSnapshotForWeb_(ss, requested)
  };
}

/** RPC para series mensuales filtradas. */
function getMarketsDashboardTrends(request) {
  const normalized = normalizeDashboardTrendRequest_(request);
  return readDashboardTrendsForWeb_(openMarketsSpreadsheet_(), normalized);
}

function normalizeDashboardDateRequest_(dateKey, availableDates) {
  const dates = availableDates || [];
  if (!dates.length) throw new Error('No hay fechas disponibles.');
  const requested = trimString_(dateKey);
  if (!requested) return dates[dates.length - 1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requested)) throw new Error('Fecha no valida: ' + requested);
  if (dates.indexOf(requested) < 0) throw new Error('No hay observaciones para ' + requested + '.');
  return requested;
}

function normalizeDashboardTrendRequest_(request) {
  const source = request || {};
  const countryCode = trimString_(source.countryCode).toUpperCase();
  const platform = trimString_(source.platform);
  const segment = trimString_(source.segment).toUpperCase() || 'BANK';
  const months = Math.min(MARKETS_WEB.maxTrendMonths,
    Math.max(1, toNonNegativeInteger_(source.months) || MARKETS_WEB.defaultTrendMonths));
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) throw new Error('Pais no valido: ' + countryCode);
  if (platform && ['Android', 'iOS', 'Huawei'].indexOf(platform) < 0) {
    throw new Error('Plataforma no valida: ' + platform);
  }
  if (['BANK', 'FINTECH'].indexOf(segment) < 0) throw new Error('Segmento no valido: ' + segment);
  return {
    countryCode: countryCode,
    platform: platform,
    segment: segment,
    months: months,
    bbvaOnly: parseBoolean_(source.bbvaOnly, false)
  };
}

function readCompetitionDateIndexForWeb_(ss) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.competition);
  if (!sheet || sheet.getLastRow() <= 1) return { rowDates: [], availableDates: [] };
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  const available = [];
  const seen = {};
  const rowDates = values.map(function (row) {
    const key = webDateKey_(row[0]);
    if (key && !seen[key]) { seen[key] = true; available.push(key); }
    return key;
  });
  available.sort();
  return { rowDates: rowDates, availableDates: available };
}

function readCompetitionSnapshotForWeb_(ss, dateIndex, dateKey) {
  const cacheKey = 'markets-web:snapshot:' + MARKETS_WEB.version + ':' + dateKey;
  return readMarketsWebCache_(cacheKey, function () {
    const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.competition);
    const rowDates = dateIndex.rowDates || [];
    const first = rowDates.indexOf(dateKey);
    const last = rowDates.lastIndexOf(dateKey);
    if (!sheet || first < 0 || last < first) return [];
    const width = MARKETS_CONFIG.headers.competition.length;
    const headers = sheet.getRange(1, 1, 1, width).getValues()[0];
    const indexes = indexHeaders_(headers);
    const rows = sheet.getRange(first + 2, 1, last - first + 1, width).getValues();
    return rows.filter(function (row) {
      return trimString_(row[indexes.app_key]) && webDateKey_(row[indexes.observed_date]) === dateKey;
    })
      .map(function (row) { return mapCompetitionRowForWeb_(row, indexes); });
  });
}

function mapCompetitionRowForWeb_(row, indexes) {
  return {
    date: webDateKey_(row[indexes.observed_date]),
    platform: trimString_(row[indexes.platform]),
    countryCode: trimString_(row[indexes.country_code]),
    country: trimString_(row[indexes.country]),
    segment: trimString_(row[indexes.market_segment]) || 'BANK',
    section: trimString_(row[indexes.dashboard_section]),
    scope: trimString_(row[indexes.product_scope]),
    appKey: trimString_(row[indexes.app_key]),
    appName: trimString_(row[indexes.app_name]),
    isBbva: parseBoolean_(row[indexes.is_bbva], false),
    displayOrder: webNumber_(row[indexes.display_order]),
    rating: webNumber_(row[indexes.rating]),
    ratingCount: webNumber_(row[indexes.rating_count]),
    ranking: webNumber_(row[indexes.ranking]),
    expectedApps: webNumber_(row[indexes.ranking_expected_apps]),
    observedApps: webNumber_(row[indexes.ranking_observed_apps]),
    rankingCoverage: webNumber_(row[indexes.ranking_coverage]),
    rankingComplete: parseBoolean_(row[indexes.ranking_is_complete], false),
    previousRating30d: webNumber_(row[indexes.previous_rating_30d]),
    delta30d: webNumber_(row[indexes.delta_30d]),
    fresh: parseBoolean_(row[indexes.is_fresh_this_run], false),
    fetchStatus: trimString_(row[indexes.fetch_status]),
    runId: trimString_(row[indexes.run_id])
  };
}

function readDashboardTrendsForWeb_(ss, request) {
  const normalized = normalizeDashboardTrendRequest_(request);
  const keyParts = [normalized.countryCode || 'ALL', normalized.platform || 'ALL', normalized.segment,
    normalized.bbvaOnly ? 'BBVA' : 'ALL', normalized.months];
  const cacheKey = 'markets-web:trends:' + MARKETS_WEB.version + ':' + keyParts.join(':');
  return readMarketsWebCache_(cacheKey, function () {
    const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.trends);
    if (!sheet || sheet.getLastRow() <= 1) return [];
    const width = MARKETS_CONFIG.headers.trends.length;
    const headers = sheet.getRange(1, 1, 1, width).getValues()[0];
    const indexes = indexHeaders_(headers);
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
    const monthKeys = uniqueStrings_(rows.map(function (row) { return webMonthKey_(row[indexes.period_month]); }))
      .sort();
    const cutoff = monthKeys[Math.max(0, monthKeys.length - normalized.months)] || '';
    return rows.filter(function (row) {
      const month = webMonthKey_(row[indexes.period_month]);
      return month && month >= cutoff && trimString_(row[indexes.app_key]) &&
        (!normalized.countryCode || trimString_(row[indexes.country_code]) === normalized.countryCode) &&
        (!normalized.platform || trimString_(row[indexes.platform]) === normalized.platform) &&
        (trimString_(row[indexes.market_segment]) || 'BANK') === normalized.segment &&
        (!normalized.bbvaOnly || parseBoolean_(row[indexes.is_bbva], false));
    }).map(function (row) { return mapTrendRowForWeb_(row, indexes); });
  });
}

function mapTrendRowForWeb_(row, indexes) {
  return {
    month: webMonthKey_(row[indexes.period_month]),
    platform: trimString_(row[indexes.platform]),
    countryCode: trimString_(row[indexes.country_code]),
    country: trimString_(row[indexes.country]),
    appKey: trimString_(row[indexes.app_key]),
    appName: trimString_(row[indexes.app_name]),
    isBbva: parseBoolean_(row[indexes.is_bbva], false),
    displayOrder: webNumber_(row[indexes.display_order]),
    ratingAverage: webNumber_(row[indexes.rating_avg]),
    ratingEom: webNumber_(row[indexes.rating_eom]),
    ratingMin: webNumber_(row[indexes.rating_min]),
    ratingMax: webNumber_(row[indexes.rating_max]),
    observations: webNumber_(row[indexes.observations]),
    rankingEom: webNumber_(row[indexes.ranking_eom]),
    delta30dEom: webNumber_(row[indexes.delta_30d_eom]),
    segment: trimString_(row[indexes.market_segment]) || 'BANK',
    rankingComplete: parseBoolean_(row[indexes.ranking_is_complete_eom], false)
  };
}

function readConsolidatedSnapshotForWeb_(ss, dateKey) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.scorecards);
  if (!sheet || sheet.getLastRow() <= 1 || sheet.getLastColumn() < 6) return { group: null, countries: {} };
  const dates = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map(function (row) {
    return webDateKey_(row[0]);
  });
  const rowIndex = dates.indexOf(dateKey);
  if (rowIndex < 0) return { group: null, countries: {} };
  const width = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0];
  const row = sheet.getRange(rowIndex + 2, 1, 1, width).getValues()[0];
  const byHeader = headers.reduce(function (out, header, index) { out[trimString_(header)] = row[index]; return out; }, {});
  const countries = {};
  Object.keys(byHeader).forEach(function (header) {
    const match = header.match(/^BBVA_([A-Z]{2})_CONSOLIDATED_RATING$/);
    if (!match) return;
    const prefix = 'BBVA_' + match[1];
    countries[match[1]] = {
      rating: webNumber_(byHeader[prefix + '_CONSOLIDATED_RATING']),
      delta30d: webNumber_(byHeader[prefix + '_CONSOLIDATED_DELTA_30D']),
      coverage: webNumber_(byHeader[prefix + '_WEIGHT_COVERAGE'])
    };
  });
  const groupRating = webNumber_(byHeader.BBVA_GROUP_RATING);
  const groupDelta = webNumber_(byHeader.BBVA_GROUP_DELTA_30D);
  const groupCoverage = webNumber_(byHeader.BBVA_GROUP_WEIGHT_COVERAGE);
  return {
    group: groupRating === null && groupDelta === null && groupCoverage === null ? null : {
      rating: groupRating, delta30d: groupDelta, coverage: groupCoverage
    },
    countries: countries
  };
}

function buildMarketsWebMeta_(ss, dateIndex, snapshot, latestDate) {
  const countriesByCode = {};
  (snapshot || []).forEach(function (row) {
    if (row.countryCode) countriesByCode[row.countryCode] = row.country || row.countryCode;
  });
  const countries = Object.keys(countriesByCode).sort().map(function (code) {
    return { code: code, name: countriesByCode[code] };
  });
  return {
    codeVersion: MARKETS_CONFIG.codeVersion,
    webVersion: MARKETS_WEB.version,
    generatedAt: Utilities.formatDate(new Date(), MARKETS_CONFIG.timeZone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    dataDate: latestDate,
    availableDates: dateIndex.availableDates.slice(-MARKETS_WEB.maxDateOptions),
    countries: countries,
    platforms: uniqueStrings_((snapshot || []).map(function (row) { return row.platform; })),
    segments: uniqueStrings_((snapshot || []).map(function (row) { return row.segment; })),
    latestRun: readLatestRunForWeb_(ss)
  };
}

function readLatestRunForWeb_(ss) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.runs);
  if (!sheet || sheet.getLastRow() <= 1) return null;
  const width = Math.min(sheet.getLastColumn(), MARKETS_CONFIG.headers.runs.length);
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0];
  const indexes = indexHeaders_(headers);
  const row = sheet.getRange(sheet.getLastRow(), 1, 1, width).getValues()[0];
  return {
    startedAt: webDateTime_(row[indexes.started_at]),
    runId: trimString_(row[indexes.run_id]),
    status: trimString_(row[indexes.status]),
    appsTotal: webNumber_(row[indexes.apps_total]),
    appsOk: webNumber_(row[indexes.apps_ok]),
    appsNoRating: webNumber_(row[indexes.apps_no_rating]),
    appsError: webNumber_(row[indexes.apps_error]),
    freshApps: webNumber_(row[indexes.fresh_apps]),
    weightStatus: trimString_(row[indexes.weight_config_status])
  };
}

function readMarketsWebCache_(key, builder) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch (ignored) {}
  }
  const value = builder();
  const serialized = JSON.stringify(value);
  if (serialized.length <= MARKETS_WEB.maxCacheCharacters) {
    try { cache.put(key, serialized, MARKETS_WEB.cacheSeconds); } catch (ignored) {}
  }
  return value;
}

function webNumber_(value) {
  if (value === '' || value === null || value === undefined) return null;
  return toFiniteNumber_(value);
}

function webDateKey_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, MARKETS_CONFIG.timeZone, 'yyyy-MM-dd');
  }
  const text = trimString_(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : '';
}

function webMonthKey_(value) {
  const key = webDateKey_(value);
  return key ? key.slice(0, 7) : '';
}

function webDateTime_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, MARKETS_CONFIG.timeZone, "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  return trimString_(value);
}
