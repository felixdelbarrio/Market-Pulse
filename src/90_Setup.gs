function setupProject() {
  const ss = openMarketsSpreadsheet_();
  ensureWorkbookSchema_(ss);
  readAppCatalog_(ss);
  installDailyTrigger_();
  return validateProject();
}

function validateProject() {
  const ss = openMarketsSpreadsheet_();
  ensureWorkbookSchema_(ss);
  const catalog = readAppCatalog_(ss);
  const counts = catalog.reduce(function (out, app) {
    out[app.platform] = (out[app.platform] || 0) + 1;
    return out;
  }, {});
  return {
    spreadsheetId: ss.getId(),
    codeVersion: MARKETS_CONFIG.codeVersion,
    enabledApps: catalog.length,
    platforms: counts,
    sheets: Object.keys(MARKETS_CONFIG.sheets).map(function (key) { return MARKETS_CONFIG.sheets[key]; })
  };
}

function rebuildAllMetrics() {
  const ss = openMarketsSpreadsheet_();
  ensureWorkbookSchema_(ss);
  const control = readControl_(ss);
  const catalog = readAppCatalog_(ss);
  rebuildRatingMetrics_(ss, toNonNegativeInteger_(control.RATING_LOOKBACK_DAYS) || 30);
  return rebuildDashboardDatasets_(ss, catalog, readRatingObjects_(ss));
}

function installDailyTrigger_() {
  removeManagedTriggers_();
  ScriptApp.newTrigger('runDailyRatingMonitor')
    .timeBased()
    .atHour(MARKETS_CONFIG.runHour)
    .nearMinute(MARKETS_CONFIG.runMinute)
    .everyDays(1)
    .inTimezone(MARKETS_CONFIG.timeZone)
    .create();
}

function removeManagedTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'runDailyRatingMonitor') ScriptApp.deleteTrigger(trigger);
  });
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Markets Ratings')
    .addItem('Validar proyecto', 'validateProject')
    .addItem('Ejecutar ahora', 'runNow')
    .addItem('Recalcular metricas', 'rebuildAllMetrics')
    .addSeparator()
    .addItem('Instalar trigger diario', 'installDailyTrigger_')
    .addToUi();
}
