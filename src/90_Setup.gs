function setupProject() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  const ss = openMarketsSpreadsheet_();
  initializeWorkbook_(ss);
  installDailyTrigger_();
  return validateProject();
}

function validateProject() {
  const ss = openMarketsSpreadsheet_();
  ensureWorkbookSchema_(ss);
  const control = readControl_(ss);
  const catalog = readAppCatalog_(ss);
  const alertUsers = readAllMarketsAlertPreferences_(ss);
  const alertSender = marketsAlertSenderStatus_(ss);
  const counts = catalog.reduce(function (out, app) {
    out[app.platform] = (out[app.platform] || 0) + 1;
    return out;
  }, {});
  const geography = catalog.reduce(function (out, app) {
    out[app.countryCode] = out[app.countryCode] || {};
    const key = app.platform + '|' + app.marketSegment;
    out[app.countryCode][key] = (out[app.countryCode][key] || 0) + 1;
    return out;
  }, {});
  return {
    spreadsheetId: ss.getId(),
    codeVersion: MARKETS_CONFIG.codeVersion,
    enabledApps: catalog.length,
    platforms: counts,
    geographies: geography,
    weightConfiguration: validateWeightConfiguration_(catalog),
    alerting: {
      emailDeliveryEnabled: parseBoolean_(control.SEND_ALERT_EMAILS, false),
      registeredUsers: alertUsers.length,
      subscribers: alertUsers.filter(function (item) { return item.active; }).length,
      pausedUsers: alertUsers.filter(function (item) { return !item.active; }).length,
      dailyDropSubscribers: alertUsers.filter(function (item) { return item.active && item.dailyDropEnabled; }).length,
      monthDropSubscribers: alertUsers.filter(function (item) { return item.active && item.mtdDropEnabled; }).length,
      yearDropSubscribers: alertUsers.filter(function (item) { return item.active && item.ytdDropEnabled; }).length,
      repeatingSubscribers: alertUsers.filter(function (item) { return item.active && item.repeatWhileBreached; }).length,
      senderAddress: alertSender.address,
      senderAvailable: alertSender.available,
      senderVerificationStatus: alertSender.verificationStatus,
      healthMonitorEnabled: parseBoolean_(control.MONITOR_HEALTH_ENABLED, true),
      healthMonitorRecipient: trimString_(control.MONITOR_ADMIN_EMAIL) || MARKETS_ALERT_EMAIL.senderAddress,
      adminSheet: MARKETS_CONFIG.sheets.alertPreferences,
      warning: trimString_(control.ALERT_CONFIG_WARNING)
    },
    sheets: Object.keys(MARKETS_CONFIG.sheets).map(function (key) { return MARKETS_CONFIG.sheets[key]; })
  };
}

function rebuildAllMetrics() {
  const ss = openMarketsSpreadsheet_();
  ensureWorkbookSchema_(ss);
  const control = readControl_(ss);
  const catalog = readAppCatalog_(ss);
  rebuildRatingMetrics_(ss, toNonNegativeInteger_(control.RATING_LOOKBACK_DAYS) || 30, catalog);
  const dashboard = rebuildDashboardDatasets_(ss, catalog, readRatingObjects_(ss));
  refreshMarketsDashboardCache_(ss, catalog);
  return dashboard;
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
  ScriptApp.newTrigger('checkDailyRatingMonitorHealth')
    .timeBased()
    .atHour(MARKETS_CONFIG.healthCheckHour)
    .nearMinute(MARKETS_CONFIG.healthCheckMinute)
    .everyDays(1)
    .inTimezone(MARKETS_CONFIG.timeZone)
    .create();
}

function removeManagedTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (['runDailyRatingMonitor', 'checkDailyRatingMonitorHealth'].indexOf(trigger.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function authorizeAndInstallMarketsAutomation() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  const ss = openMarketsSpreadsheet_();
  ensureWorkbookSchema_(ss);
  const sender = requireMarketsAlertSender_(ss);
  installDailyTrigger_();
  return {
    authorized: true, sender: sender.address, verificationStatus: sender.verificationStatus,
    dailySchedule: String(MARKETS_CONFIG.runHour).padStart(2, '0') + ':' +
      String(MARKETS_CONFIG.runMinute).padStart(2, '0') + ' ' + MARKETS_CONFIG.timeZone,
    healthSchedule: String(MARKETS_CONFIG.healthCheckHour).padStart(2, '0') + ':' +
      String(MARKETS_CONFIG.healthCheckMinute).padStart(2, '0') + ' ' + MARKETS_CONFIG.timeZone
  };
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Markets Ratings')
    .addItem('Validar proyecto', 'validateProject')
    .addItem('Ejecutar ahora', 'runNow')
    .addItem('Recalcular metricas', 'rebuildAllMetrics')
    .addSeparator()
    .addItem('Autorizar e instalar automatizacion', 'authorizeAndInstallMarketsAutomation')
    .addItem('Comprobar salud ahora', 'checkDailyRatingMonitorHealth')
    .addItem('Probar aviso tecnico', 'sendMarketsMonitorHealthTestEmail')
    .addToUi();
}
