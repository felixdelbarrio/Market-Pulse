/** Web app y API de lectura para el dashboard de ratings. */
var MARKETS_WEB = Object.freeze({
  version: '2026.07.17.3',
  cacheSeconds: 21600,
  maxCacheCharacters: 95000,
  defaultTrendMonths: 18,
  maxTrendMonths: 36,
  latestSnapshotTailRows: 500,
  persistentChunkCharacters: 7500,
  persistentMaxCharacters: 300000,
  countryCodes: Object.freeze(['AR', 'CO', 'ES', 'MX', 'PE', 'TR', 'UY', 'VE'])
});

/**
 * Publica el dashboard HTML o una respuesta JSON bajo el mismo control de acceso
 * del despliegue de Apps Script.
 *
 * Rutas JSON:
 *   ?api=bootstrap
 *   ?api=trends&country=MX&platform=Android&segment=BANK&months=18
 */
function doGet(event) {
  const parameters = event && event.parameter || {};
  if (parameters.api) return serveMarketsApi_(parameters);
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Markets Ratings Intelligence')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function serveMarketsApi_(parameters) {
  try {
    let data;
    const resource = trimString_(parameters.api).toLowerCase();
    if (resource === 'bootstrap') data = getMarketsDashboardBootstrap();
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
  const cacheKey = marketsBootstrapCacheKey_();
  return readMarketsWebCache_(cacheKey, function () {
    const persistent = readMarketsPersistentCache_('bootstrap');
    if (persistent) return persistent;
    const bootstrap = buildMarketsDashboardBootstrap_(openMarketsSpreadsheet_());
    writeMarketsPersistentCache_('bootstrap', bootstrap, bootstrap.meta.latestRun && bootstrap.meta.latestRun.runId);
    return bootstrap;
  });
}

/** La respuesta inicial excluye tendencias para pintar la pagina cuanto antes. */
function buildMarketsDashboardBootstrap_(ss) {
  const latestDate = readLatestCompetitionDateForWeb_(ss);
  if (!latestDate) throw new Error('DASHBOARD_COMPETITION no contiene fechas publicables.');
  const snapshot = readCompetitionSnapshotForWeb_(ss, latestDate);
  return {
    meta: buildMarketsWebMeta_(ss, snapshot, latestDate),
    snapshot: snapshot,
    trends: [],
    consolidated: readConsolidatedSnapshotForWeb_(ss, latestDate)
  };
}

/** RPC para series mensuales filtradas. */
function getMarketsDashboardTrends(request) {
  const normalized = normalizeDashboardTrendRequest_(request);
  const cacheKey = marketsTrendCacheKey_(normalized);
  return readMarketsWebCache_(cacheKey, function () {
    let allTrends = readMarketsPersistentCache_('trends');
    if (!allTrends) {
      const ss = openMarketsSpreadsheet_();
      allTrends = buildAllDashboardTrendsForWeb_(ss, MARKETS_WEB.maxTrendMonths);
      const run = readLatestRunForWeb_(ss);
      writeMarketsPersistentCache_('trends', allTrends, run && run.runId);
    }
    return filterDashboardTrendsForWeb_(allTrends, normalized);
  });
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
  if (['BANK', 'FINTECH', 'ALL'].indexOf(segment) < 0) throw new Error('Segmento no valido: ' + segment);
  return {
    countryCode: countryCode,
    platform: platform,
    segment: segment,
    months: months,
    bbvaOnly: parseBoolean_(source.bbvaOnly, false)
  };
}

function readLatestCompetitionDateForWeb_(ss) {
  let sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.scorecards);
  if (!sheet || sheet.getLastRow() <= 1) sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.competition);
  return !sheet || sheet.getLastRow() <= 1 ? '' : webDateKey_(sheet.getRange(sheet.getLastRow(), 1).getValue());
}

function readCompetitionSnapshotForWeb_(ss, dateKey) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.competition);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const bounds = findLatestCompetitionBoundsForWeb_(sheet, dateKey);
  if (!bounds) return [];
  const width = MARKETS_CONFIG.headers.competition.length;
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0];
  const indexes = indexHeaders_(headers);
  const rows = sheet.getRange(bounds.firstRow, 1, bounds.lastRow - bounds.firstRow + 1, width).getValues();
  return rows.filter(function (row) {
    return trimString_(row[indexes.app_key]) && webDateKey_(row[indexes.observed_date]) === dateKey;
  }).map(function (row) { return mapCompetitionRowForWeb_(row, indexes); });
}

/** La fecha mas reciente se resuelve con una sola lectura del final de la tabla. */
function findLatestCompetitionBoundsForWeb_(sheet, dateKey) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;
  const count = Math.min(MARKETS_WEB.latestSnapshotTailRows, lastRow - 1);
  const firstTailRow = lastRow - count + 1;
  const dates = sheet.getRange(firstTailRow, 1, count, 1).getValues().map(function (row) {
    return webDateKey_(row[0]);
  });
  const first = dates.indexOf(dateKey);
  const last = dates.lastIndexOf(dateKey);
  if (first > 0 || firstTailRow === 2) {
    return first < 0 ? null : { firstRow: firstTailRow + first, lastRow: firstTailRow + last };
  }
  return binarySearchCompetitionDateBoundsForWeb_(sheet, dateKey, lastRow);
}

/** Fallback O(log n) si la ultima foto supera la ventana de lectura rapida. */
function binarySearchCompetitionDateBoundsForWeb_(sheet, dateKey, lastRow) {
  let low = 2;
  let high = lastRow + 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const middleKey = webDateKey_(sheet.getRange(middle, 1).getValue());
    if (middleKey < dateKey) low = middle + 1;
    else high = middle;
  }
  const firstRow = low;
  if (firstRow > lastRow || webDateKey_(sheet.getRange(firstRow, 1).getValue()) !== dateKey) return null;
  low = firstRow;
  high = lastRow + 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const middleKey = webDateKey_(sheet.getRange(middle, 1).getValue());
    if (middleKey <= dateKey) low = middle + 1;
    else high = middle;
  }
  return { firstRow: firstRow, lastRow: low - 1 };
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
    runId: trimString_(row[indexes.run_id]),
    previousRatingCount30d: webNumber_(row[indexes.previous_rating_count_30d]),
    ratingCountDelta30d: webNumber_(row[indexes.rating_count_delta_30d])
  };
}

function buildAllDashboardTrendsForWeb_(ss, months) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.trends);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const width = MARKETS_CONFIG.headers.trends.length;
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0];
  const indexes = indexHeaders_(headers);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
  const monthKeys = uniqueStrings_(rows.map(function (row) { return webMonthKey_(row[indexes.period_month]); }))
    .sort();
  const cutoff = monthKeys[Math.max(0, monthKeys.length - months)] || '';
  return rows.filter(function (row) {
    const month = webMonthKey_(row[indexes.period_month]);
    return month && month >= cutoff && trimString_(row[indexes.app_key]);
  }).map(function (row) { return mapTrendRowForWeb_(row, indexes); });
}

function filterDashboardTrendsForWeb_(allTrends, normalized) {
  const monthKeys = uniqueStrings_((allTrends || []).map(function (row) { return row.month; })).sort();
  const cutoff = monthKeys[Math.max(0, monthKeys.length - normalized.months)] || '';
  return (allTrends || []).filter(function (row) {
    return row.month >= cutoff &&
      (!normalized.countryCode || row.countryCode === normalized.countryCode) &&
      (!normalized.platform || row.platform === normalized.platform) &&
      matchesMarketsSegment_(row, normalized.segment) &&
      (!normalized.bbvaOnly || row.isBbva);
  });
}

function matchesMarketsSegment_(row, segment) {
  return segment === 'ALL' || row.segment === segment || (segment === 'FINTECH' && row.isBbva);
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
    rankingComplete: parseBoolean_(row[indexes.ranking_is_complete_eom], false),
    ratingCount: webNumber_(row[indexes.rating_count_eom]),
    ratingCountDelta30d: webNumber_(row[indexes.rating_count_delta_30d_eom])
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

function buildMarketsWebMeta_(ss, snapshot, latestDate) {
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
    countries: countries,
    platforms: ['Android', 'iOS', 'Huawei'].filter(function (platform) {
      return (snapshot || []).some(function (row) { return row.platform === platform; });
    }),
    segments: uniqueStrings_((snapshot || []).map(function (row) { return row.segment; })),
    logos: readMarketsPersistentCache_('logos') || {},
    latestRun: readLatestRunForWeb_(ss)
  };
}

/** Conserva iconos oficiales obtenidos en las mismas respuestas de las stores. */
function updateMarketsLogoCache_(results) {
  const logos = readMarketsPersistentCache_('logos') || {};
  let changed = false;
  (results || []).forEach(function (result) {
    const appKey = trimString_(result && result.app && result.app.appKey);
    const logoUrl = trimString_(result && result.logoUrl);
    if (!appKey || !/^https:\/\//i.test(logoUrl) || logos[appKey] === logoUrl) return;
    logos[appKey] = logoUrl;
    changed = true;
  });
  if (changed) writeMarketsPersistentCache_('logos', logos, new Date().toISOString());
  return logos;
}

function readLatestRunForWeb_(ss) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.runs);
  if (!sheet || sheet.getLastRow() <= 1) return null;
  const width = Math.min(sheet.getLastColumn(), MARKETS_CONFIG.headers.runs.length);
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0];
  const indexes = indexHeaders_(headers);
  const row = sheet.getRange(sheet.getLastRow(), 1, 1, width).getValues()[0];
  const latestRun = {
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
  latestRun.incidents = readRunIncidentsForWeb_(ss, latestRun.runId, latestRun.appsTotal);
  return latestRun;
}

function readRunIncidentsForWeb_(ss, runId, appsTotal) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.fetchLog);
  if (!runId || !sheet || sheet.getLastRow() <= 1) return [];
  const count = Math.min(Math.max(1, appsTotal || 1), sheet.getLastRow() - 1);
  const headers = MARKETS_CONFIG.headers.fetchLog;
  const indexes = indexHeaders_(headers);
  const rows = sheet.getRange(sheet.getLastRow() - count + 1, 1, count, headers.length).getValues();
  return rows.filter(function (item) {
    return trimString_(item[indexes.run_id]) === runId && trimString_(item[indexes.status]) !== 'OK';
  }).map(function (item) {
    return {
      appKey: trimString_(item[indexes.app_key]),
      countryCode: trimString_(item[indexes.country_code]),
      platform: trimString_(item[indexes.platform]),
      segment: trimString_(item[indexes.market_segment]),
      status: trimString_(item[indexes.status]),
      detail: trimString_(item[indexes.detail])
    };
  });
}

function readMarketsWebCache_(key, builder) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch (ignored) {}
  }
  const value = builder();
  writeMarketsWebCache_(cache, key, value);
  return value;
}

function writeMarketsWebCache_(cache, key, value) {
  const serialized = JSON.stringify(value);
  if (serialized.length <= MARKETS_WEB.maxCacheCharacters) {
    try { cache.put(key, serialized, MARKETS_WEB.cacheSeconds); } catch (ignored) {}
  }
}

function marketsBootstrapCacheKey_() {
  return 'markets-web:bootstrap:' + MARKETS_WEB.version;
}

function marketsTrendCacheKey_(request) {
  const normalized = normalizeDashboardTrendRequest_(request);
  const keyParts = [normalized.countryCode || 'ALL', normalized.platform || 'ALL', normalized.segment,
    normalized.bbvaOnly ? 'BBVA' : 'ALL', normalized.months];
  return 'markets-web:trends:' + MARKETS_WEB.version + ':' + keyParts.join(':');
}

function defaultMarketsTrendRequest_() {
  return { segment: 'BANK', bbvaOnly: true, months: MARKETS_WEB.defaultTrendMonths };
}

function marketsPersistentMetaKey_(name) {
  return 'MARKETS_WEB_CACHE_' + trimString_(name).toUpperCase() + '_META';
}

function marketsPersistentChunkKey_(name, generation, index) {
  return 'MARKETS_WEB_CACHE_' + trimString_(name).toUpperCase() + '_' + generation + '_' + index;
}

/** Nivel L2 sin caducidad: JSON comprimido y dividido para respetar 9 KB por property. */
function writeMarketsPersistentCache_(name, value, revision) {
  const serialized = JSON.stringify(value);
  const compressed = Utilities.gzip(Utilities.newBlob(serialized, 'application/json')).getBytes();
  const encoded = Utilities.base64Encode(compressed);
  if (encoded.length > MARKETS_WEB.persistentMaxCharacters) {
    throw new Error('Cache persistente demasiado grande para ' + name + ': ' + encoded.length + ' caracteres.');
  }
  const properties = PropertiesService.getScriptProperties();
  const metaKey = marketsPersistentMetaKey_(name);
  const oldMeta = safeJsonParse_(properties.getProperty(metaKey));
  const generation = new Date().getTime().toString(36) + '-' + Utilities.getUuid().slice(0, 8);
  const parts = Math.max(1, Math.ceil(encoded.length / MARKETS_WEB.persistentChunkCharacters));
  const chunks = {};
  for (let index = 0; index < parts; index += 1) {
    chunks[marketsPersistentChunkKey_(name, generation, index)] = encoded.slice(
      index * MARKETS_WEB.persistentChunkCharacters, (index + 1) * MARKETS_WEB.persistentChunkCharacters);
  }
  properties.setProperties(chunks, false);
  const meta = {
    version: MARKETS_WEB.version,
    generation: generation,
    parts: parts,
    revision: trimString_(revision),
    createdAt: new Date().toISOString(),
    jsonCharacters: serialized.length,
    encodedCharacters: encoded.length
  };
  properties.setProperty(metaKey, JSON.stringify(meta));
  deleteMarketsPersistentGeneration_(properties, name, oldMeta);
  return meta;
}

function readMarketsPersistentCache_(name) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const meta = safeJsonParse_(properties.getProperty(marketsPersistentMetaKey_(name)));
    if (!meta || (name !== 'logos' && meta.version !== MARKETS_WEB.version) || !meta.generation || !meta.parts) return null;
    let encoded = '';
    for (let index = 0; index < meta.parts; index += 1) {
      const chunk = properties.getProperty(marketsPersistentChunkKey_(name, meta.generation, index));
      if (!chunk) return null;
      encoded += chunk;
    }
    const blob = Utilities.newBlob(Utilities.base64Decode(encoded));
    return JSON.parse(Utilities.ungzip(blob).getDataAsString('UTF-8'));
  } catch (error) {
    console.warn('No se pudo leer la cache persistente ' + name + ': ' + errorToString_(error));
    return null;
  }
}

function deleteMarketsPersistentGeneration_(properties, name, meta) {
  if (!meta || !meta.generation || !meta.parts) return;
  const keys = [];
  for (let index = 0; index < meta.parts; index += 1) {
    keys.push(marketsPersistentChunkKey_(name, meta.generation, index));
  }
  keys.forEach(function(key) {
    properties.deleteProperty(key);
  });
}

function deleteMarketsPersistentCache_(name) {
  const properties = PropertiesService.getScriptProperties();
  const metaKey = marketsPersistentMetaKey_(name);
  const meta = safeJsonParse_(properties.getProperty(metaKey));
  deleteMarketsPersistentGeneration_(properties, name, meta);
  properties.deleteProperty(metaKey);
}

/**
 * Invalida y precalienta las dos respuestas del primer render. Se invoca al
 * terminar el RUN diario y tambien puede ejecutarse manualmente tras desplegar.
 */
function refreshMarketsDashboardCache_(ss) {
  const latestDate = readLatestCompetitionDateForWeb_(ss);
  const cache = CacheService.getScriptCache();
  try { cache.remove(marketsBootstrapCacheKey_()); } catch (ignored) {}
  const bootstrap = buildMarketsDashboardBootstrap_(ss);
  const allTrends = buildAllDashboardTrendsForWeb_(ss, MARKETS_WEB.maxTrendMonths);
  const revision = bootstrap.meta.latestRun && bootstrap.meta.latestRun.runId;
  writeMarketsPersistentCache_('bootstrap', bootstrap, revision);
  writeMarketsPersistentCache_('trends', allTrends, revision);
  try { cache.removeAll(marketsInteractiveTrendCacheKeys_(bootstrap.snapshot)); } catch (ignored) {}
  writeMarketsWebCache_(cache, marketsBootstrapCacheKey_(), bootstrap);
  const trends = filterDashboardTrendsForWeb_(allTrends,
    normalizeDashboardTrendRequest_(defaultMarketsTrendRequest_()));
  writeMarketsWebCache_(cache, marketsTrendCacheKey_(defaultMarketsTrendRequest_()), trends);
  return {
    date: latestDate,
    snapshotRows: bootstrap.snapshot.length,
    trendRows: trends.length,
    persistedTrendRows: allTrends.length,
    revision: trimString_(revision),
    cacheSeconds: MARKETS_WEB.cacheSeconds
  };
}

function marketsInteractiveTrendCacheKeys_(snapshot) {
  const snapshotCountries = uniqueStrings_((snapshot || []).map(function (row) { return row.countryCode; }));
  const countries = [''].concat(snapshotCountries.length ? snapshotCountries : MARKETS_WEB.countryCodes);
  const platforms = ['', 'Android', 'iOS', 'Huawei'];
  const segments = ['BANK', 'FINTECH', 'ALL'];
  const keys = [];
  countries.forEach(function (countryCode) {
    platforms.forEach(function (platform) {
      segments.forEach(function (segment) {
        keys.push(marketsTrendCacheKey_({
          countryCode: countryCode,
          platform: platform,
          segment: segment,
          months: MARKETS_WEB.defaultTrendMonths,
          bbvaOnly: !countryCode && segment === 'BANK'
        }));
      });
    });
  });
  return uniqueStrings_(keys);
}

/** Fuerza fallback a Sheets si el RUN no pudo materializar una revision nueva. */
function invalidateMarketsDashboardCache_() {
  const keys = [marketsBootstrapCacheKey_()].concat(marketsInteractiveTrendCacheKeys_([]));
  try { CacheService.getScriptCache().removeAll(uniqueStrings_(keys)); } catch (ignored) {}
  deleteMarketsPersistentCache_('bootstrap');
  deleteMarketsPersistentCache_('trends');
}

function warmMarketsDashboardCache() {
  return refreshMarketsDashboardCache_(openMarketsSpreadsheet_());
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
