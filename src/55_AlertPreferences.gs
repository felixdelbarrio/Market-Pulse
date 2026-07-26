/** Preferencias privadas y autoservicio de alertas. */
var MARKETS_ALERT_DEFAULTS = Object.freeze({
  active: false,
  countries: Object.freeze(['ALL']),
  platforms: Object.freeze(['ALL']),
  reviewShareEnabled: false,
  reviewWarningPct: 15,
  reviewCriticalPct: 30,
  dailyDropEnabled: true,
  dailyWarningDrop: 0.10,
  dailyCriticalDrop: 0.15,
  mtdDropEnabled: true,
  mtdWarningDrop: 0.30,
  mtdCriticalDrop: 0.50,
  ytdDropEnabled: true,
  ytdWarningDrop: 0.30,
  ytdCriticalDrop: 0.50,
  repeatWhileBreached: false,
  crossoverEnabled: true,
  crossoverDirection: 'BOTH',
  deliveryMode: 'DAILY_DIGEST',
  configVersion: '3'
});

function defaultMarketsAlertPreferences_(email) {
  return {
    email: normalizeMarketsAlertEmail_(email),
    active: MARKETS_ALERT_DEFAULTS.active,
    countries: MARKETS_ALERT_DEFAULTS.countries.slice(),
    platforms: MARKETS_ALERT_DEFAULTS.platforms.slice(),
    reviewShareEnabled: MARKETS_ALERT_DEFAULTS.reviewShareEnabled,
    reviewWarningPct: MARKETS_ALERT_DEFAULTS.reviewWarningPct,
    reviewCriticalPct: MARKETS_ALERT_DEFAULTS.reviewCriticalPct,
    dailyDropEnabled: MARKETS_ALERT_DEFAULTS.dailyDropEnabled,
    dailyWarningDrop: MARKETS_ALERT_DEFAULTS.dailyWarningDrop,
    dailyCriticalDrop: MARKETS_ALERT_DEFAULTS.dailyCriticalDrop,
    mtdDropEnabled: MARKETS_ALERT_DEFAULTS.mtdDropEnabled,
    mtdWarningDrop: MARKETS_ALERT_DEFAULTS.mtdWarningDrop,
    mtdCriticalDrop: MARKETS_ALERT_DEFAULTS.mtdCriticalDrop,
    ytdDropEnabled: MARKETS_ALERT_DEFAULTS.ytdDropEnabled,
    ytdWarningDrop: MARKETS_ALERT_DEFAULTS.ytdWarningDrop,
    ytdCriticalDrop: MARKETS_ALERT_DEFAULTS.ytdCriticalDrop,
    repeatWhileBreached: MARKETS_ALERT_DEFAULTS.repeatWhileBreached,
    crossoverEnabled: MARKETS_ALERT_DEFAULTS.crossoverEnabled,
    crossoverDirection: MARKETS_ALERT_DEFAULTS.crossoverDirection,
    deliveryMode: MARKETS_ALERT_DEFAULTS.deliveryMode,
    configVersion: MARKETS_ALERT_DEFAULTS.configVersion,
    updatedAt: '', updatedBy: '', registeredAt: '', lastSeenAt: '', lastTestAt: '',
    lastDeliveryAt: '', status: 'NOT_CONFIGURED', persisted: false
  };
}

function normalizeMarketsAlertPreferences_(source, email) {
  const input = source || {};
  const defaults = defaultMarketsAlertPreferences_(email || input.email);
  const countries = normalizeMarketsAlertScope_(input.countries, MARKETS_CONFIG.countryCodes);
  const platforms = normalizeMarketsAlertScope_(input.platforms, ['Android', 'iOS', 'Huawei']);
  const reviewWarning = marketsAlertNumber_(input.reviewWarningPct, defaults.reviewWarningPct, 0, 100);
  const reviewCritical = marketsAlertNumber_(input.reviewCriticalPct, defaults.reviewCriticalPct, 0, 100);
  const dailyWarning = marketsAlertNumber_(input.dailyWarningDrop, defaults.dailyWarningDrop, 0.01, 5);
  const dailyCritical = marketsAlertNumber_(input.dailyCriticalDrop, defaults.dailyCriticalDrop, 0.01, 5);
  const mtdWarning = marketsAlertNumber_(input.mtdWarningDrop, defaults.mtdWarningDrop, 0.01, 5);
  const mtdCritical = marketsAlertNumber_(input.mtdCriticalDrop, defaults.mtdCriticalDrop, 0.01, 5);
  const ytdWarning = marketsAlertNumber_(input.ytdWarningDrop, defaults.ytdWarningDrop, 0.01, 5);
  const ytdCritical = marketsAlertNumber_(input.ytdCriticalDrop, defaults.ytdCriticalDrop, 0.01, 5);
  if (reviewCritical <= reviewWarning) throw new Error('El umbral critico de resenas debe ser mayor que el de advertencia.');
  validateMarketsAlertThresholds_('diaria', dailyWarning, dailyCritical);
  validateMarketsAlertThresholds_('mensual', mtdWarning, mtdCritical);
  validateMarketsAlertThresholds_('anual', ytdWarning, ytdCritical);
  const direction = trimString_(input.crossoverDirection || defaults.crossoverDirection).toUpperCase();
  if (['BOTH', 'LOST', 'GAINED'].indexOf(direction) < 0) throw new Error('Direccion de cruce competitivo no valida.');
  const normalized = {
    email: defaults.email,
    active: parseBoolean_(input.active, defaults.active),
    countries: countries,
    platforms: platforms,
    reviewShareEnabled: parseBoolean_(input.reviewShareEnabled, defaults.reviewShareEnabled),
    reviewWarningPct: reviewWarning,
    reviewCriticalPct: reviewCritical,
    dailyDropEnabled: parseBoolean_(input.dailyDropEnabled, defaults.dailyDropEnabled),
    dailyWarningDrop: dailyWarning,
    dailyCriticalDrop: dailyCritical,
    mtdDropEnabled: parseBoolean_(input.mtdDropEnabled, defaults.mtdDropEnabled),
    mtdWarningDrop: mtdWarning,
    mtdCriticalDrop: mtdCritical,
    ytdDropEnabled: parseBoolean_(input.ytdDropEnabled, defaults.ytdDropEnabled),
    ytdWarningDrop: ytdWarning,
    ytdCriticalDrop: ytdCritical,
    repeatWhileBreached: parseBoolean_(input.repeatWhileBreached, defaults.repeatWhileBreached),
    crossoverEnabled: parseBoolean_(input.crossoverEnabled, defaults.crossoverEnabled),
    crossoverDirection: direction,
    deliveryMode: 'DAILY_DIGEST',
    configVersion: MARKETS_ALERT_DEFAULTS.configVersion,
    updatedAt: input.updatedAt || '',
    updatedBy: trimString_(input.updatedBy),
    registeredAt: input.registeredAt || '',
    lastSeenAt: input.lastSeenAt || '',
    lastTestAt: input.lastTestAt || '',
    lastDeliveryAt: input.lastDeliveryAt || '',
    persisted: Boolean(input.persisted)
  };
  normalized.status = normalized.active ?
    (normalized.reviewShareEnabled ? 'ACTIVE_WITH_PENDING_REVIEW_SOURCE' : 'ACTIVE') : 'PAUSED';
  return normalized;
}

function validateMarketsAlertThresholds_(label, warning, critical) {
  if (critical <= warning) throw new Error('El umbral critico de caida ' + label + ' debe ser mayor que el de advertencia.');
}

function normalizeMarketsAlertScope_(value, allowed) {
  const items = Array.isArray(value) ? value : trimString_(value).split(/[;,]/);
  const normalized = uniqueStrings_(items.map(function (item) { return trimString_(item); }));
  if (!normalized.length || normalized.indexOf('ALL') >= 0) return ['ALL'];
  const invalid = normalized.filter(function (item) { return allowed.indexOf(item) < 0; });
  if (invalid.length) throw new Error('Ambito de alerta no valido: ' + invalid.join(', '));
  return normalized;
}

function marketsAlertNumber_(value, fallback, minimum, maximum) {
  const parsed = toFiniteNumber_(value);
  const normalized = parsed === null ? fallback : Math.round(parsed * 100) / 100;
  if (normalized < minimum || normalized > maximum) {
    throw new Error('Umbral fuera de rango: ' + normalized);
  }
  return normalized;
}

function normalizeMarketsAlertEmail_(email) {
  const normalized = trimString_(email).toLowerCase();
  if (!/^[^\s@]+@bbva\.com$/.test(normalized)) throw new Error('Las alertas requieren una cuenta corporativa @bbva.com.');
  return normalized;
}

function currentMarketsUserEmail_() {
  const email = Session.getActiveUser().getEmail();
  if (!trimString_(email)) {
    throw new Error('No se ha podido identificar al usuario conectado. Revisa el modo de despliegue de la aplicacion web.');
  }
  return normalizeMarketsAlertEmail_(email);
}

function readMarketsAlertPreferences_(ss, email) {
  const normalizedEmail = normalizeMarketsAlertEmail_(email);
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.alertPreferences);
  if (!sheet || sheet.getLastRow() <= 1) return defaultMarketsAlertPreferences_(normalizedEmail);
  const headers = MARKETS_CONFIG.headers.alertPreferences;
  const indexes = indexHeaders_(headers);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  const row = rows.find(function (item) { return normalizeEmailForComparison_(item[indexes.user_email]) === normalizedEmail; });
  return row ? alertPreferencesFromRow_(row, indexes) : defaultMarketsAlertPreferences_(normalizedEmail);
}

function readAllMarketsAlertPreferences_(ss) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.alertPreferences);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const headers = MARKETS_CONFIG.headers.alertPreferences;
  const indexes = indexHeaders_(headers);
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues()
    .filter(function (row) { return trimString_(row[indexes.user_email]); })
    .map(function (row) { return alertPreferencesFromRow_(row, indexes); });
}

function alertPreferencesFromRow_(row, indexes) {
  return normalizeMarketsAlertPreferences_({
    email: row[indexes.user_email], active: row[indexes.active],
    countries: row[indexes.countries], platforms: row[indexes.platforms],
    reviewShareEnabled: row[indexes.review_share_enabled],
    reviewWarningPct: row[indexes.review_warning_pct], reviewCriticalPct: row[indexes.review_critical_pct],
    dailyDropEnabled: row[indexes.daily_drop_enabled],
    dailyWarningDrop: row[indexes.daily_warning_drop], dailyCriticalDrop: row[indexes.daily_critical_drop],
    mtdDropEnabled: row[indexes.mtd_drop_enabled],
    mtdWarningDrop: row[indexes.mtd_warning_drop], mtdCriticalDrop: row[indexes.mtd_critical_drop],
    ytdDropEnabled: row[indexes.ytd_drop_enabled],
    ytdWarningDrop: row[indexes.ytd_warning_drop], ytdCriticalDrop: row[indexes.ytd_critical_drop],
    repeatWhileBreached: row[indexes.repeat_while_breached],
    crossoverEnabled: row[indexes.crossover_enabled], crossoverDirection: row[indexes.crossover_direction],
    deliveryMode: row[indexes.delivery_mode], updatedAt: row[indexes.updated_at],
    updatedBy: row[indexes.updated_by], registeredAt: row[indexes.registered_at],
    lastSeenAt: row[indexes.last_seen_at], lastTestAt: row[indexes.last_test_at],
    lastDeliveryAt: row[indexes.last_delivery_at], persisted: true
  }, row[indexes.user_email]);
}

function marketsAlertPreferencesRow_(preferences, updatedBy) {
  const now = preferences.updatedAt instanceof Date ? preferences.updatedAt : new Date();
  return [
    preferences.email, preferences.active, preferences.countries.join(','), preferences.platforms.join(','),
    preferences.reviewShareEnabled, preferences.reviewWarningPct, preferences.reviewCriticalPct,
    false, 0.30, 0.50,
    preferences.crossoverEnabled, preferences.crossoverDirection, preferences.deliveryMode,
    now, updatedBy || preferences.email, preferences.configVersion, preferences.status,
    preferences.dailyDropEnabled, preferences.dailyWarningDrop, preferences.dailyCriticalDrop,
    preferences.mtdDropEnabled, preferences.mtdWarningDrop, preferences.mtdCriticalDrop,
    preferences.ytdDropEnabled, preferences.ytdWarningDrop, preferences.ytdCriticalDrop,
    preferences.repeatWhileBreached, preferences.registeredAt || now, preferences.lastSeenAt || '',
    preferences.lastTestAt || '', preferences.lastDeliveryAt || ''
  ];
}

function upsertMarketsAlertPreferences_(ss, preferences, updatedBy) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.alertPreferences);
  const previous = readMarketsAlertPreferences_(ss, preferences.email);
  const normalized = normalizeMarketsAlertPreferences_(preferences, preferences.email);
  normalized.updatedAt = new Date();
  normalized.updatedBy = updatedBy || normalized.email;
  normalized.registeredAt = preferences.registeredAt || previous.registeredAt || normalized.updatedAt;
  normalized.lastSeenAt = preferences.lastSeenAt || previous.lastSeenAt || '';
  normalized.lastTestAt = preferences.lastTestAt || previous.lastTestAt || '';
  normalized.lastDeliveryAt = preferences.lastDeliveryAt || previous.lastDeliveryAt || '';
  normalized.persisted = true;
  const existing = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues() : [];
  const index = existing.findIndex(function (row) { return normalizeEmailForComparison_(row[0]) === normalized.email; });
  const row = marketsAlertPreferencesRow_(normalized, normalized.updatedBy);
  ensureSheetCapacity_(sheet, Math.max(2, sheet.getLastRow() + (index < 0 ? 1 : 0)), row.length);
  sheet.getRange(index < 0 ? sheet.getLastRow() + 1 : index + 2, 1, 1, row.length).setValues([row]);
  refreshFilter_(sheet, row.length);
  return normalized;
}

function registerOrTouchMarketsAlertUser_(ss, email) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(MARKETS_CONFIG.lockTimeoutMs)) {
    throw new Error('El registro de alertas esta siendo actualizado. Intentalo de nuevo.');
  }
  try {
    const preferences = readMarketsAlertPreferences_(ss, email);
    const now = new Date();
    if (!preferences.persisted) {
      preferences.registeredAt = now;
      preferences.lastSeenAt = now;
      return upsertMarketsAlertPreferences_(ss, preferences, 'SELF_SERVICE_REGISTRATION');
    }
    touchMarketsAlertTimestamp_(ss, email, 'LAST_SEEN_AT', now);
    preferences.lastSeenAt = now;
    return preferences;
  } finally {
    lock.releaseLock();
  }
}

function touchMarketsAlertTimestamp_(ss, email, header, value) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.alertPreferences);
  if (!sheet || sheet.getLastRow() <= 1) return;
  const emailColumn = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  const index = emailColumn.findIndex(function (row) {
    return normalizeEmailForComparison_(row[0]) === normalizeEmailForComparison_(email);
  });
  const column = indexHeaders_(MARKETS_CONFIG.headers.alertPreferences)[normalizeHeader_(header)];
  if (index >= 0 && column !== undefined) sheet.getRange(index + 2, column + 1).setValue(value || new Date());
}

function normalizeEmailForComparison_(email) {
  return trimString_(email).toLowerCase();
}

function getMarketsAlertPreferences() {
  const email = currentMarketsUserEmail_();
  const ss = openMarketsSpreadsheet_();
  requireCurrentSheetContract_(ss, MARKETS_CONFIG.sheets.control, MARKETS_CONFIG.headers.control);
  requireCurrentSheetContract_(ss, MARKETS_CONFIG.sheets.alertPreferences, MARKETS_CONFIG.headers.alertPreferences);
  requireCurrentSheetContract_(ss, MARKETS_CONFIG.sheets.alerts, MARKETS_CONFIG.headers.alerts);
  const control = readControl_(ss);
  const preferences = registerOrTouchMarketsAlertUser_(ss, email);
  return {
    user: { email: email }, preferences: alertPreferencesForClient_(preferences),
    defaults: alertPreferencesForClient_(defaultMarketsAlertPreferences_(email)),
    system: {
      emailDeliveryEnabled: parseBoolean_(control.SEND_ALERT_EMAILS, false),
      reviewDataAvailable: false,
      reviewDataMessage: 'La fuente actual publica rating y volumen agregados, no el reparto de estrellas 1 y 2 en las últimas 24 horas.',
      configWarning: trimString_(control.ALERT_CONFIG_WARNING),
      schedule: 'Resumen diario tras la actualización de las 07:05',
      privacy: 'Puedes modificar esta configuración desde Alertas aunque el alta la haya realizado un administrador. Administración conserva la gestión y la auditoría.',
      deliveryScope: 'Todos los usuarios activos · sin sesión',
      adminVisibility: 'Los administradores auditan altas y actividad en ALERT_SUBSCRIPTIONS.'
    },
    recentEvents: readRecentMarketsAlertEventsForUser_(ss, email, 6)
  };
}

function saveMarketsAlertPreferences(payload) {
  const email = currentMarketsUserEmail_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(MARKETS_CONFIG.lockTimeoutMs)) throw new Error('La configuracion de alertas esta siendo actualizada. Intentalo de nuevo.');
  try {
    const ss = openMarketsSpreadsheet_();
    requireCurrentSheetContract_(ss, MARKETS_CONFIG.sheets.alertPreferences, MARKETS_CONFIG.headers.alertPreferences);
    return alertPreferencesForClient_(upsertMarketsAlertPreferences_(ss,
      normalizeMarketsAlertPreferences_(payload, email), email));
  } finally {
    lock.releaseLock();
  }
}

function resetMarketsAlertPreferences() {
  return saveMarketsAlertPreferences(defaultMarketsAlertPreferences_(currentMarketsUserEmail_()));
}

function sendMarketsAlertTestEmail() {
  const email = currentMarketsUserEmail_();
  const ss = openMarketsSpreadsheet_();
  requireCurrentSheetContract_(ss, MARKETS_CONFIG.sheets.control, MARKETS_CONFIG.headers.control);
  requireCurrentSheetContract_(ss, MARKETS_CONFIG.sheets.alertPreferences, MARKETS_CONFIG.headers.alertPreferences);
  requireCurrentSheetContract_(ss, MARKETS_CONFIG.sheets.alerts, MARKETS_CONFIG.headers.alerts);
  const control = readControl_(ss);
  if (!parseBoolean_(control.SEND_ALERT_EMAILS, false)) {
    throw new Error('El envio global esta desactivado. Activa SEND_ALERT_EMAILS en CONTROL antes de probar.');
  }
  const sentAt = new Date();
  const deliveryId = 'COM-' + Utilities.formatDate(sentAt, MARKETS_CONFIG.timeZone, 'yyyyMMdd-HHmmss') + '-' +
    Utilities.getUuid().slice(0, 8).toUpperCase();
  const preferences = readMarketsAlertPreferences_(ss, email);
  const ratings = readRatingObjects_(ss);
  const catalog = readAppCatalog_(ss);
  const events = validateMarketsRealAlertPreviewEvents_(
    buildMarketsRealAlertPreviewEvents_(ratings, catalog, preferences, deliveryId), preferences);
  const delivered = sendAlertEmails_(events, ss);
  if (delivered !== 1) throw new Error('Google no ha aceptado la prueba para el destinatario esperado.');
  let auditLogged = true;
  try {
    appendAlertEvents_(ss, [{
      timestamp: sentAt, eventKey: 'TEST|' + deliveryId + '|' + email,
      referenceDate: events[0].referenceDate || sentAt, platform: 'Configurada',
      countryCode: preferences.countries.join(','), type: 'TEST', severity: 'POSITIVE',
      detail: 'Vista previa con ' + events.length + ' señal(es) o cierre(s) reales según la configuración vigente.',
      recipients: email, userEmail: email, ruleId: deliveryId, metricValue: events.length,
      threshold: '', appKey: '', direction: 'TEST', runId: deliveryId,
      source: 'SELF_SERVICE_TEST_REAL_DATA'
    }]);
    touchMarketsAlertTimestamp_(ss, email, 'LAST_TEST_AT', sentAt);
  } catch (auditError) {
    auditLogged = false;
    console.error('Correo aceptado, pero no se pudo completar la auditoria ' + deliveryId + ': ' + errorToString_(auditError));
  }
  let effectiveSender = '';
  try { effectiveSender = normalizeEmailForComparison_(Session.getEffectiveUser().getEmail()); } catch (ignored) {}
  const delivery = events.deliveryResults && events.deliveryResults[0] || {};
  return {
    sent: true, accepted: true, recipient: email, sentAt: sentAt.toISOString(), deliveryId: deliveryId,
    effectiveSender: effectiveSender, senderName: delivery.senderName || MARKETS_ALERT_EMAIL.senderName,
    senderAddress: delivery.senderAddress || MARKETS_ALERT_EMAIL.senderAddress,
    senderMode: MARKETS_ALERT_EMAIL.senderMode,
    senderVerificationStatus: delivery.verificationStatus || '',
    messageId: delivery.messageId || '', threadId: delivery.threadId || '', auditLogged: auditLogged,
    realData: true, previewItems: events.length,
    scopeCountries: preferences.countries.slice(), scopePlatforms: preferences.platforms.slice(),
    previewCountries: uniqueStrings_(events.map(function (event) { return event.countryCode; })),
    codeVersion: MARKETS_CONFIG.codeVersion, webVersion: MARKETS_WEB.version
  };
}

function alertPreferencesForClient_(preferences) {
  const output = Object.assign({}, preferences);
  ['updatedAt', 'registeredAt', 'lastSeenAt', 'lastTestAt', 'lastDeliveryAt'].forEach(function (field) {
    if (output[field] instanceof Date) output[field] = output[field].toISOString();
  });
  return output;
}

function readRecentMarketsAlertEventsForUser_(ss, email, limit) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.alerts);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const headers = MARKETS_CONFIG.headers.alerts;
  const indexes = indexHeaders_(headers);
  const count = Math.min(500, sheet.getLastRow() - 1);
  const rows = sheet.getRange(sheet.getLastRow() - count + 1, 1, count, headers.length).getValues();
  return rows.reverse().filter(function (row) {
    return normalizeEmailForComparison_(row[indexes.user_email] || row[indexes.recipients]) === email;
  }).slice(0, limit).map(function (row) {
    const timestamp = row[indexes.timestamp];
    return {
      timestamp: timestamp instanceof Date ? timestamp.toISOString() : trimString_(timestamp),
      type: trimString_(row[indexes.type]), severity: trimString_(row[indexes.severity]),
      platform: trimString_(row[indexes.platform]), countryCode: trimString_(row[indexes.country_code]),
      detail: trimString_(row[indexes.detail]), direction: trimString_(row[indexes.direction])
    };
  });
}
