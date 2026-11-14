/** Autorizacion y observabilidad privada para responsables de Market Pulse. */
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
  const email = normalizeEmailForComparison_(currentMarketsUserEmail_());
  const cache = CacheService.getScriptCache();
  const cacheKey = 'markets-web:administrator-emails:' + MARKETS_CONFIG.codeVersion;
  let administrators = null;
  try {
    const cached = cache.get(cacheKey);
    administrators = cached ? JSON.parse(cached) : null;
  } catch (ignored) {}
  if (!Array.isArray(administrators)) {
    const ss = openMarketsSpreadsheet_();
    requireCurrentSheetContract_(ss, MARKETS_CONFIG.sheets.control, MARKETS_CONFIG.headers.control);
    administrators = marketsAdministratorEmails_(readControl_(ss));
    try { cache.put(cacheKey, JSON.stringify(administrators), 300); } catch (ignored) {}
  }
  return { email: email, isAdmin: administrators.indexOf(email) >= 0 };
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

function getMarketsAdminDashboard(includeUsage = true) {
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
  const usage = includeUsage ? readMarketsUsageAnalytics_(ss,
    trimString_(access.control.TIME_ZONE) || MARKETS_CONFIG.timeZone) : null;
  return {
    generatedAt: new Date().toISOString(),
    administrator: access.email,
    system: {
      codeVersion: MARKETS_CONFIG.codeVersion,
      webVersion: MARKETS_WEB.version,
      webAppUrl: marketsWebAppUrl_(),
      timeZone: trimString_(access.control.TIME_ZONE) || MARKETS_CONFIG.timeZone,
      reviewPipeline: marketsAdminReviewPipeline_(access.email),
      functionalJobs: typeof marketsFunctionalJobStatus_ === 'function' ? marketsFunctionalJobStatus_() : [],
      dailySchedule: String(MARKETS_CONFIG.runHour).padStart(2, '0') + ':' + String(MARKETS_CONFIG.runMinute).padStart(2, '0'),
      healthSchedule: String(MARKETS_CONFIG.healthCheckHour).padStart(2, '0') + ':' + String(MARKETS_CONFIG.healthCheckMinute).padStart(2, '0'),
      newsletterSchedule: 'Día 1 · ' + String(MARKETS_CONFIG.newsletterHour).padStart(2, '0') + ':' +
        String(MARKETS_CONFIG.newsletterMinute).padStart(2, '0'),
      emailDeliveryEnabled: parseBoolean_(access.control.SEND_ALERT_EMAILS, false),
      newsletterDeliveryEnabled: marketsNewsletterDeliveryEnabled_(access.control),
      healthMonitorEnabled: parseBoolean_(access.control.MONITOR_HEALTH_ENABLED, true),
      healthRecipient: trimString_(access.control.MONITOR_ADMIN_EMAIL),
      administratorEmails: marketsAdministratorEmails_(access.control),
      senderAddress: sender.address,
      senderAvailable: Boolean(sender.available),
      senderVerificationStatus: trimString_(sender.verificationStatus),
      senderError: trimString_(sender.error)
    },
    summary: {
      activeSubscribers: subscribers.filter(function (item) {
        return item.active || item.newsletterEnabled;
      }).length,
      pausedSubscribers: subscribers.filter(function (item) {
        return !item.active && !item.newsletterEnabled;
      }).length,
      recentRuns: runs.length,
      recentIssues: issues.length,
      recentAlertEvents: alerts.length,
      usersThisMonth: usage?.kpis.usersMonth ?? null
    },
    recentRuns: runs,
    fetchIssues: issues,
    subscribers: subscribers.map(function (item) {
      const client = alertPreferencesForClient_(item);
      client.newsletterLanguage = marketsNewsletterLanguageFor_(item.email);
      client.lastSeenAt = adminDateTime_(item.lastSeenAt);
      client.lastTestAt = adminDateTime_(item.lastTestAt);
      client.lastDeliveryAt = adminDateTime_(item.lastDeliveryAt);
      client.updatedAt = adminDateTime_(item.updatedAt);
      client.registeredAt = adminDateTime_(item.registeredAt);
      return client;
    }),
    recentAlerts: alerts,
    usage: usage
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
    [
      [MARKETS_CONFIG.sheets.alertPreferences, MARKETS_CONFIG.headers.alertPreferences],
      [MARKETS_CONFIG.sheets.ratings, MARKETS_CONFIG.headers.ratings],
      [MARKETS_CONFIG.sheets.alerts, MARKETS_CONFIG.headers.alerts]
    ].forEach(function (definition) {
      requireCurrentSheetContract_(access.ss, definition[0], definition[1]);
    });
    const language = payload?.newsletterLanguage;
    if (language !== undefined && !['es', 'en', 'tr'].includes(language)) {
      throw new Error('Idioma de newsletter no válido.');
    }
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
    let acknowledgements = [];
    if (!previous.persisted && saved.active && saved.ytdDropEnabled &&
        !isMarketsAdministrator_(targetEmail, access.control)) {
      const ratings = readRatingObjects_(access.ss);
      const referenceDate = latestMarketsRatingDate_(ratings, saved);
      if (referenceDate) {
        acknowledgements = buildMarketsEnrollmentYtdAcknowledgements_(ratings, referenceDate, saved);
        appendAlertEvents_(access.ss, acknowledgements);
      }
    }
    if (language !== undefined) {
      PropertiesService.getScriptProperties().setProperty(marketsNewsletterLanguageKey_(targetEmail), language);
    }
    const client = alertPreferencesForClient_(saved);
    client.newsletterLanguage = marketsNewsletterLanguageFor_(targetEmail);
    client.enrollmentYtdAcknowledged = acknowledgements.length;
    return client;
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

function marketsAdminReviewPipeline_(email) {
  const owner = email === normalizeEmailForComparison_(Session.getEffectiveUser().getEmail());
  let installed = null;
  if (owner) {
    try {
      installed = ScriptApp.getProjectTriggers()
        .some(trigger => trigger.getHandlerFunction() === MARKETS_REVIEW_SUPERVISOR);
    } catch (error) {
      console.warn('No se pudo consultar la programación de reseñas. ' + error.message);
    }
  }
  const state = readMarketsReviewPipeline_(PropertiesService.getScriptProperties());
  const jobs = state?.jobs || newMarketsReviewPipeline_('').jobs;
  return { day: state?.day || '', installed, canRestart: owner && installed === true,
    jobs: [{ id: 'supervisor', label: 'Supervisor de reseñas', priority: 0,
      status: installed === null ? 'Activador sin verificar' : installed ? 'Activo' : 'Sin activador instalado' }, ...jobs] };
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
    .filter(function (row) {
      return isMarketsCriticalPlatform_(row[indexes.platform]) && trimString_(row[indexes.status]) !== 'OK';
    })
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

function getMarketsAdminUsage() {
  const { ss, control } = requireMarketsAdministrator_();
  return readMarketsUsageAnalytics_(ss, trimString_(control.TIME_ZONE) || MARKETS_CONFIG.timeZone);
}

const MARKETS_BUSINESS_CONTROL = ['RATING_LOOKBACK_DAYS', 'MONITOR_HEALTH_ENABLED'];

function getMarketsBusinessCatalog(section, language) {
  const { ss, control } = requireMarketsAdministrator_();
  const config = MARKETS_CONFIG;
  const table = (columns, rows, edit = '') => ({ columns, rows, edit });
  switch (section) {
    case 'operation':
      return table(['Parámetro', 'Valor', 'Descripción'], config.controlDefaults
        .filter(([key]) => MARKETS_BUSINESS_CONTROL.includes(key))
        .map(([key, value, description]) => [key, control[key] ?? value, description]), 'operation');
    case 'functional': {
      const names = marketsFunctionalTranslations_(ss, ['en', 'tr'].includes(language) ? language : 'es');
      const sheet = ss.getSheetByName('FUNCTIONAL_CATALOG');
      return table(['ID', 'Bloque', 'Funcionalidad', 'Descripción'], sheet?.getLastRow() > 1
        ? requireCurrentSheetContract_(ss, 'FUNCTIONAL_CATALOG', MARKETS_FUNCTIONAL_HEADERS)
          .getRange(2, 1, sheet.getLastRow() - 1, 4).getDisplayValues()
          .map(([id, block, feature, description]) => [id, names.get(block) || block, names.get(feature) || feature, description]) : []);
    }
    case 'aliases': {
      const overrides = marketsBusinessAliases_(ss);
      return table(['ID funcional', 'Equivalencias adicionales (una por línea)', 'Equivalencias de base'],
        [...new Set([...Object.keys(MARKETS_REVIEW_RULES), ...Object.keys(overrides)])].sort()
          .map(id => [id, (overrides[id] || []).join('\n'), (MARKETS_REVIEW_RULES[id]?.[0] || []).join(' · ')]), 'aliases');
    }
    case 'markets':
      return table(['Clave', 'Orden', 'Geografía', 'Tienda', 'Aplicación', 'Activa'], readAppCatalog_(ss, true)
        .map(app => [app.appKey, app.displayOrder, app.countryCode, app.store, app.appName, app.enabled]), 'markets');
    case 'geography':
      return table(['Código', 'Geografía'], [...new Map(readAppCatalog_(ss, true).map(app => [app.countryCode, app.country])).entries()].sort());
    case 'relevance':
      return table(['Criterio', 'Regla'], [
        ['Todos', 'Audiencia inicial de Comentarios'],
        ['Solo BEI', 'Evidencia empresarial directa en el original'],
        ['BEI extendido', 'Evidencia directa, contextual u operativa compartida sin señal retail explícita'],
        ['Operativa compartida', [...MARKETS_SHARED_REVIEW_OPERATIONS].join(', ')],
        ['NPS de opiniones', MARKETS_DEFAULT_REVIEW_SEGMENTS.map(group => group.label + ': ' + group.stars.join(', ')).join(' · ')]
      ]);
    case 'storage':
      return table(['Conjunto', 'Hoja'], [...Object.entries(config.sheets),
        ['Reseñas', 'MARKET_REVIEWS'], ['Catálogo funcional', 'FUNCTIONAL_CATALOG'],
        ['Equivalencias', MARKETS_FUNCTIONAL_ALIASES], ['Traducciones del catálogo', MARKETS_FUNCTIONAL_TRANSLATIONS],
        ['Interacciones newsletter', MARKETS_NEWSLETTER_INTERACTIONS]]);
    case 'schedule': {
      const clock = (hour, minute) => [hour, minute].map(value => String(value).padStart(2, '0')).join(':');
      return table(['Proceso', 'Programación', 'Zona horaria'], [
        ['Ratings', clock(config.runHour, config.runMinute), config.timeZone],
        ['Salud', clock(config.healthCheckHour, config.healthCheckMinute), config.timeZone],
        ['Newsletter', 'Día 1 · ' + clock(config.newsletterHour, config.newsletterMinute), config.timeZone]
      ]);
    }
    case 'retention':
      return table(['Conjunto', 'Política'], [['Ratings y reseñas', 'Histórico conservado'],
        ['Acceso y voto de newsletter', 'Enlaces válidos durante 30 días'], ['Registros de Administración', 'Ventanas de consulta limitadas; sin borrado desde esta pantalla']]);
    case 'languages':
      return table(['Idioma', 'Uso'], ['es', 'en', 'tr'].map(lang => [lang, 'Interfaz, traducciones de reseñas y newsletter']));
    default: throw new Error('Catálogo desconocido.');
  }
}

function saveMarketsBusinessCatalogEntry(input) {
  const { ss } = requireMarketsAdministrator_();
  const { section, key, value, expected } = input || {};
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Configuración ocupada. Inténtalo de nuevo.');
  try {
    if (section === 'operation' && MARKETS_BUSINESS_CONTROL.includes(key)) {
      const raw = String(value).trim();
      const valid = key === 'RATING_LOOKBACK_DAYS' ? /^\d{1,3}$/.test(raw) && Number(raw) >= 1 && Number(raw) <= 365
        : /^(true|false)$/i.test(raw);
      if (!valid) throw new Error(key === 'RATING_LOOKBACK_DAYS' ? 'Introduce un número de 1 a 365.' : 'Introduce true o false.');
      const sheet = requireCurrentSheetContract_(ss, MARKETS_CONFIG.sheets.control, MARKETS_CONFIG.headers.control);
      const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
      const index = rows.findIndex(row => row[0] === key);
      if (index < 0 || String(rows[index][1]) !== String(expected) || rows.filter(row => row[0] === key).length !== 1) {
        throw new Error('El parámetro cambió o no está configurado. Actualiza el catálogo.');
      }
      sheet.getRange(index + 2, 2).setValue(key === 'RATING_LOOKBACK_DAYS' ? Number(raw) : raw.toLowerCase() === 'true');
      SpreadsheetApp.flush();
    } else if (section === 'markets' && typeof key === 'string' && /^\d{1,4}$/.test(String(value).trim())) {
      const {catalog} = MARKETS_CONFIG.sheets, headers = MARKETS_CONFIG.headers.catalog;
      const sheet = requireCurrentSheetContract_(ss, catalog, headers);
      const column = headers.indexOf('DISPLAY_ORDER') + 1;
      const found = sheet.getLastRow() > 1
        ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(key).matchEntireCell(true).findNext() : null;
      const cell = found && sheet.getRange(found.getRow(), column);
      if (!cell || String(toNonNegativeInteger_(cell.getValue())) !== String(expected)) throw new Error('La aplicación cambió. Actualiza el catálogo.');
      cell.setValue(Number(value));
      SpreadsheetApp.flush();
    } else if (section === 'aliases' && /^\d{2}\.\d{2}$/.test(key) && typeof value === 'string' && value.length <= 1500) {
      const sheet = requireCurrentSheetContract_(ss, 'FUNCTIONAL_CATALOG', MARKETS_FUNCTIONAL_HEADERS);
      if (sheet.getLastRow() < 2 || !sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(key).matchEntireCell(true).findNext()) {
        throw new Error('La funcionalidad no existe en el catálogo global.');
      }
      const aliases = marketsBusinessAliases_(ss);
      if ((aliases[key] || []).join('\n') !== expected) throw new Error('Las equivalencias cambiaron. Actualiza el catálogo.');
      const terms = [...new Set(value.split('\n').map(normalizeReviewEvidence_).filter(Boolean))];
      if (terms.length > 20 || terms.some(term => !term.includes(' ') || term.length > 100)) throw new Error('Introduce hasta 20 expresiones de varias palabras, una por línea.');
      const existing = ss.getSheetByName(MARKETS_FUNCTIONAL_ALIASES);
      const target = existing || ss.insertSheet(MARKETS_FUNCTIONAL_ALIASES);
      if (!existing) target.getRange(1, 1, 1, 2).setValues([MARKETS_FUNCTIONAL_ALIAS_HEADERS]);
      const last = target.getLastRow();
      const found = last > 1 ? target.getRange(2, 1, last - 1, 1).createTextFinder(key).matchEntireCell(true).findNext() : null;
      const row = found ? found.getRow() : last + 1;
      ensureSheetCapacity_(target, row, 2);
      target.getRange(row, 1, 1, 2).setNumberFormat('@').setValues([[key, terms.join('\n')]]);
      SpreadsheetApp.flush();
      PropertiesService.getScriptProperties().setProperty('MARKETS_FUNCTIONAL_ALIASES_REVISION', Utilities.getUuid());
    } else throw new Error('Este catálogo no admite la edición solicitada.');
    return { saved: true };
  } finally {
    lock.releaseLock();
  }
}

function refreshMarketsAdminFunctionalCatalog() {
  return setupMarketsReviewInsights();
}
