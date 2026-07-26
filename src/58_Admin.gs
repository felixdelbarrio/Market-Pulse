/** Autorizacion y observabilidad privada para responsables de Markets Data Studio. */
function marketsAdministratorEmails_(control) {
  return uniqueStrings_(trimString_(control && control.ADMIN_EMAILS).split(/[;,\s]+/)
    .map(normalizeEmailForComparison_))
    .filter(function (email) { return /^[^\s@]+@bbva\.com$/.test(email); });
}

function isMarketsAdministrator_(email, control) {
  return marketsAdministratorEmails_(control).indexOf(normalizeEmailForComparison_(email)) >= 0;
}

function seedInitialMarketsAdministrator_(ss) {
  const control = readControl_(ss);
  if (marketsAdministratorEmails_(control).length) return control.ADMIN_EMAILS;
  const owner = normalizeEmailForComparison_(Session.getEffectiveUser().getEmail());
  if (!owner) throw new Error('No se ha podido identificar al propietario inicial para ADMIN_EMAILS.');
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.control);
  const rows = sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), 1).getValues();
  const index = rows.findIndex(function (row) { return trimString_(row[0]) === 'ADMIN_EMAILS'; });
  if (index < 0) throw new Error('Falta ADMIN_EMAILS en CONTROL. Ejecuta setupProject() con el contrato vigente.');
  sheet.getRange(index + 2, 2).setValue(owner);
  return owner;
}

function getMarketsUserContext() {
  const email = currentMarketsUserEmail_();
  const ss = openMarketsSpreadsheet_();
  requireCurrentSheetContract_(ss, MARKETS_CONFIG.sheets.control, MARKETS_CONFIG.headers.control);
  return { email: email, isAdmin: isMarketsAdministrator_(email, readControl_(ss)) };
}

function requireMarketsAdministrator_() {
  const email = currentMarketsUserEmail_();
  const ss = openMarketsSpreadsheet_();
  requireCurrentSheetContract_(ss, MARKETS_CONFIG.sheets.control, MARKETS_CONFIG.headers.control);
  const control = readControl_(ss);
  if (!isMarketsAdministrator_(email, control)) {
    throw new Error('Acceso denegado. Esta cuenta no esta autorizada como administradora.');
  }
  return { email: email, ss: ss, control: control };
}

function getMarketsAdminDashboard() {
  const access = requireMarketsAdministrator_();
  const ss = access.ss;
  [
    [MARKETS_CONFIG.sheets.runs, MARKETS_CONFIG.headers.runs],
    [MARKETS_CONFIG.sheets.fetchLog, MARKETS_CONFIG.headers.fetchLog],
    [MARKETS_CONFIG.sheets.alerts, MARKETS_CONFIG.headers.alerts],
    [MARKETS_CONFIG.sheets.alertPreferences, MARKETS_CONFIG.headers.alertPreferences]
  ].forEach(function (definition) {
    requireCurrentSheetContract_(ss, definition[0], definition[1]);
  });
  let sender = { available: false, address: trimString_(access.control.ALERT_SENDER_ALIAS), verificationStatus: 'UNKNOWN' };
  try { sender = marketsAlertSenderStatus_(ss); } catch (error) { sender.error = errorToString_(error); }
  const runs = readRecentMarketsAdminRuns_(ss, 14);
  const subscribers = readAllMarketsAlertPreferences_(ss);
  const issues = readRecentMarketsAdminFetchIssues_(ss, 40);
  const alerts = readRecentMarketsAdminAlertEvents_(ss, 30);
  return {
    generatedAt: new Date().toISOString(),
    administrator: access.email,
    system: {
      codeVersion: MARKETS_CONFIG.codeVersion,
      webVersion: MARKETS_WEB.version,
      webAppUrl: marketsWebAppUrl_(),
      timeZone: trimString_(access.control.TIME_ZONE) || MARKETS_CONFIG.timeZone,
      dailySchedule: String(MARKETS_CONFIG.runHour).padStart(2, '0') + ':' + String(MARKETS_CONFIG.runMinute).padStart(2, '0'),
      healthSchedule: String(MARKETS_CONFIG.healthCheckHour).padStart(2, '0') + ':' + String(MARKETS_CONFIG.healthCheckMinute).padStart(2, '0'),
      emailDeliveryEnabled: parseBoolean_(access.control.SEND_ALERT_EMAILS, false),
      healthMonitorEnabled: parseBoolean_(access.control.MONITOR_HEALTH_ENABLED, true),
      healthRecipient: trimString_(access.control.MONITOR_ADMIN_EMAIL),
      administratorEmails: marketsAdministratorEmails_(access.control),
      senderAddress: sender.address,
      senderAvailable: Boolean(sender.available),
      senderVerificationStatus: trimString_(sender.verificationStatus),
      senderError: trimString_(sender.error)
    },
    summary: {
      activeSubscribers: subscribers.filter(function (item) { return item.active; }).length,
      pausedSubscribers: subscribers.filter(function (item) { return !item.active; }).length,
      recentRuns: runs.length,
      recentIssues: issues.length,
      recentAlertEvents: alerts.length
    },
    recentRuns: runs,
    fetchIssues: issues,
    subscribers: subscribers.map(function (item) {
      const client = alertPreferencesForClient_(item);
      client.lastSeenAt = adminDateTime_(item.lastSeenAt);
      client.lastTestAt = adminDateTime_(item.lastTestAt);
      client.lastDeliveryAt = adminDateTime_(item.lastDeliveryAt);
      client.updatedAt = adminDateTime_(item.updatedAt);
      client.registeredAt = adminDateTime_(item.registeredAt);
      return client;
    }),
    recentAlerts: alerts
  };
}

/**
 * Alta y mantenimiento administrativo de suscriptores. La identidad que se
 * modifica procede del argumento separado, nunca de la sesion ni del payload.
 */
function saveMarketsAdminSubscriber(email, payload) {
  const access = requireMarketsAdministrator_();
  const targetEmail = normalizeMarketsAlertEmail_(email);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(MARKETS_CONFIG.lockTimeoutMs)) {
    throw new Error('Las suscripciones estan siendo actualizadas. Intentalo de nuevo.');
  }
  try {
    requireCurrentSheetContract_(access.ss, MARKETS_CONFIG.sheets.alertPreferences,
      MARKETS_CONFIG.headers.alertPreferences);
    const previous = readMarketsAlertPreferences_(access.ss, targetEmail);
    const source = Object.assign({}, payload || {}, {
      email: targetEmail,
      registeredAt: previous.registeredAt || new Date(),
      lastSeenAt: previous.lastSeenAt || '',
      lastTestAt: previous.lastTestAt || '',
      lastDeliveryAt: previous.lastDeliveryAt || ''
    });
    const saved = upsertMarketsAlertPreferences_(access.ss,
      normalizeMarketsAlertPreferences_(source, targetEmail), access.email);
    return alertPreferencesForClient_(saved);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Ejecuta una recuperacion completa bajo demanda. runDailyRatingMonitor deja
 * la auditoria en RUN_LOG y conserva el mismo bloqueo que la carga programada.
 */
function requestMarketsAdminRatingRecovery() {
  const access = requireMarketsAdministrator_();
  const result = runDailyRatingMonitor();
  return Object.assign({}, result, {
    requestedBy: access.email,
    requestedAt: new Date().toISOString(),
    mode: 'MANUAL_ADMIN_RECOVERY'
  });
}

function readRecentMarketsAdminRuns_(ss, limit) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.runs);
  if (sheet.getLastRow() <= 1) return [];
  const headers = MARKETS_CONFIG.headers.runs;
  const indexes = indexHeaders_(headers);
  const count = Math.min(limit, sheet.getLastRow() - 1);
  return sheet.getRange(sheet.getLastRow() - count + 1, 1, count, headers.length).getValues().reverse()
    .filter(function (row) { return trimString_(row[indexes.run_id]); })
    .map(function (row) {
      return {
        startedAt: adminDateTime_(row[indexes.started_at]), runId: trimString_(row[indexes.run_id]),
        status: trimString_(row[indexes.status]), appsTotal: adminNumber_(row[indexes.apps_total]),
        appsOk: adminNumber_(row[indexes.apps_ok]), appsNoRating: adminNumber_(row[indexes.apps_no_rating]),
        appsError: adminNumber_(row[indexes.apps_error]), rowsUpserted: adminNumber_(row[indexes.rows_upserted]),
        durationMs: adminNumber_(row[indexes.duration_ms]), subscribers: adminNumber_(row[indexes.alert_subscribers]),
        emailsSent: adminNumber_(row[indexes.emails_sent]), deliveryStatus: trimString_(row[indexes.alert_delivery_status]),
        detail: trimString_(row[indexes.detail]), deliveryDetail: trimString_(row[indexes.alert_delivery_detail])
      };
    });
}

function readRecentMarketsAdminFetchIssues_(ss, limit) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.fetchLog);
  if (sheet.getLastRow() <= 1) return [];
  const headers = MARKETS_CONFIG.headers.fetchLog;
  const indexes = indexHeaders_(headers);
  const count = Math.min(600, sheet.getLastRow() - 1);
  return sheet.getRange(sheet.getLastRow() - count + 1, 1, count, headers.length).getValues().reverse()
    .filter(function (row) { return trimString_(row[indexes.status]) !== 'OK'; })
    .slice(0, limit).map(function (row) {
      return {
        fetchedAt: adminDateTime_(row[indexes.fetched_at]), runId: trimString_(row[indexes.run_id]),
        appKey: trimString_(row[indexes.app_key]), platform: trimString_(row[indexes.platform]),
        countryCode: trimString_(row[indexes.country_code]), status: trimString_(row[indexes.status]),
        httpStatus: adminNumber_(row[indexes.http_status]), detail: trimString_(row[indexes.detail])
      };
    });
}

function readRecentMarketsAdminAlertEvents_(ss, limit) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.alerts);
  if (sheet.getLastRow() <= 1) return [];
  const headers = MARKETS_CONFIG.headers.alerts;
  const indexes = indexHeaders_(headers);
  const count = Math.min(limit, sheet.getLastRow() - 1);
  return sheet.getRange(sheet.getLastRow() - count + 1, 1, count, headers.length).getValues().reverse()
    .filter(function (row) { return trimString_(row[indexes.event_key]); })
    .map(function (row) {
      return {
        timestamp: adminDateTime_(row[indexes.timestamp]), type: trimString_(row[indexes.type]),
        severity: trimString_(row[indexes.severity]), platform: trimString_(row[indexes.platform]),
        countryCode: trimString_(row[indexes.country_code]), userEmail: normalizeEmailForComparison_(row[indexes.user_email] || row[indexes.recipients]),
        detail: trimString_(row[indexes.detail]), runId: trimString_(row[indexes.run_id])
      };
    });
}

function adminDateTime_(value) {
  return value instanceof Date ? value.toISOString() : trimString_(value);
}

function adminNumber_(value) {
  const parsed = toFiniteNumber_(value);
  return parsed === null ? null : parsed;
}
