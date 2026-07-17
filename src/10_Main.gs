/** Punto de entrada diario unico para Android, iOS y Huawei. */
function runDailyRatingMonitor() {
  const startedAt = new Date();
  const runId = Utilities.formatDate(startedAt, MARKETS_CONFIG.timeZone, 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0, 8);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(MARKETS_CONFIG.lockTimeoutMs)) throw new Error('Otra ejecucion del monitor sigue activa.');

  let ss;
  try {
    ss = openMarketsSpreadsheet_();
    ensureWorkbookSchema_(ss);
    const control = readControl_(ss);
    const catalog = readAppCatalog_(ss);
    const referenceKey = Utilities.formatDate(startedAt, trimString_(control.TIME_ZONE) || MARKETS_CONFIG.timeZone, 'yyyy-MM-dd');
    const referenceDate = dateFromKey_(referenceKey);
    const results = fetchCatalogRatings_(catalog);
    try { updateMarketsLogoCache_(results); } catch (logoError) {
      console.warn('No se pudieron actualizar los logos: ' + errorToString_(logoError));
    }
    appendFetchLog_(ss, runId, referenceDate, startedAt, results);
    const rows = buildRatingRows_(results, referenceDate, startedAt);
    const ratingSheet = ss.getSheetByName(MARKETS_CONFIG.sheets.ratings);
    const upserted = upsertRowsByKey_(ratingSheet, rows, MARKETS_CONFIG.headers.ratings.length);
    const lookback = toNonNegativeInteger_(control.RATING_LOOKBACK_DAYS) || 30;
    rebuildRatingMetrics_(ss, lookback, catalog);
    const ratings = readRatingObjects_(ss);
    const dashboard = rebuildDashboardDatasets_(ss, catalog, ratings, {
      runId: runId, referenceDate: referenceDate, startedAt: startedAt, results: results
    });
    const alerts = buildAndProcessAlerts_(ss, referenceDate, catalog, runId, control, ratings);
    const stats = summarizeFetchResults_(results);
    const status = stats.error === 0 ? (stats.noRating > 0 ? 'PARTIAL' : 'OK') : (stats.ok > 0 ? 'PARTIAL' : 'ERROR');
    appendRunLog_(ss, [
      startedAt, runId, status, results.length, stats.ok, stats.noRating, stats.error,
      upserted, alerts.length, new Date().getTime() - startedAt.getTime(), buildRunDetail_(results),
      dashboard.scorecardRows, dashboard.trendRows, dashboard.competitionRows,
      stats.ok, validateWeightConfiguration_(catalog)
    ]);
    try {
      refreshMarketsDashboardCache_(ss);
    } catch (cacheError) {
      try { invalidateMarketsDashboardCache_(); } catch (ignored) {}
      console.error('No se pudo actualizar la cache del dashboard: ' + errorToString_(cacheError));
    }
    return { runId: runId, status: status, apps: results.length, rowsUpserted: upserted, alerts: alerts.length };
  } catch (error) {
    if (ss) {
      try {
        appendRunLog_(ss, [startedAt, runId, 'ERROR', 0, 0, 0, 1, 0, 0,
          new Date().getTime() - startedAt.getTime(), errorToString_(error), 0, 0, 0, 0, 'UNKNOWN']);
      } catch (ignored) {}
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function summarizeFetchResults_(results) {
  return (results || []).reduce(function (out, result) {
    if (result.ok) out.ok += 1;
    else if (result.noRating) out.noRating += 1;
    else out.error += 1;
    return out;
  }, { ok: 0, noRating: 0, error: 0 });
}

function buildRunDetail_(results) {
  const errors = (results || []).filter(function (result) { return !result.ok; }).map(function (result) {
    return result.app.platform + '/' + result.app.countryCode + '/' + result.app.appName + ': ' + result.error;
  });
  return errors.slice(0, 20).join(' | ') + (errors.length > 20 ? ' | +' + (errors.length - 20) + ' errores' : '');
}

function runNow() {
  return runDailyRatingMonitor();
}
