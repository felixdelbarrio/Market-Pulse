/** Evalua alertas personalizadas y envia un unico resumen BBVA por usuario. */
var MARKETS_ALERT_EMAIL = Object.freeze({
  senderName: 'BBVA Market Pulse',
  senderAddress: 'voc-commercial.group@bbva.com',
  senderMode: 'GROUP_ALIAS'
});

function buildAndProcessAlerts_(ss, referenceDate, catalog, runId, control, ratingObjects) {
  const ratings = ratingObjects || readRatingObjects_(ss);
  const subscribers = readAllMarketsAlertPreferences_(ss).filter(function (item) { return item.active; });
  const existing = readExistingAlertKeys_(ss);
  const catalogByKey = (catalog || []).reduce(function (out, app) { out[app.appKey] = app; return out; }, {});
  let events = [];
  subscribers.forEach(function (preferences) {
    events = events.concat(buildRatingDropAlerts_(ratings, referenceDate, preferences, existing));
    events = events.concat(buildCompetitiveCrossoverAlerts_(ratings, referenceDate, preferences, catalogByKey, existing));
  });
  events.forEach(function (event) { event.runId = runId; });
  events.subscriberCount = subscribers.length;
  events.deliveryCount = 0;
  events.deliveryStatus = events.length ? 'DISABLED' : 'NOT_REQUIRED';
  events.deliveryDetail = '';
  if (!events.length || !parseBoolean_(control.SEND_ALERT_EMAILS, false)) {
    appendAlertEvents_(ss, events);
    return events;
  }
  try {
    events.deliveryCount = sendAlertEmails_(events, ss);
    const delivered = events.deliveredRecipients || [];
    const acceptedEvents = events.filter(function (event) {
      return uniqueStrings_(trimString_(event.recipients).split(/[;,]/)).some(function (recipient) {
        return delivered.indexOf(normalizeEmailForComparison_(recipient)) >= 0;
      });
    });
    appendAlertEvents_(ss, acceptedEvents);
    const failed = events.deliveryFailures || [];
    events.deliveryStatus = failed.length ? (events.deliveryCount ? 'PARTIAL' : 'ERROR') : 'DELIVERED';
    events.deliveryDetail = failed.map(function (item) {
      return item.recipient + ': ' + item.error;
    }).join(' | ');
  } catch (error) {
    events.deliveryStatus = 'ERROR';
    events.deliveryDetail = errorToString_(error);
    console.error('Las alertas se conservaran para reintento porque Gmail no las ha aceptado: ' + events.deliveryDetail);
  }
  return events;
}

function buildRatingDropAlerts_(ratings, referenceDate, preferences, existing) {
  if (!preferences.active) return [];
  const definitions = [
    { period: 'DAILY', enabled: preferences.dailyDropEnabled,
      warning: preferences.dailyWarningDrop, critical: preferences.dailyCriticalDrop,
      type: 'RATING_DROP_DAILY', ruleId: 'DAILY_DROP' },
    { period: 'MTD', enabled: preferences.mtdDropEnabled,
      warning: preferences.mtdWarningDrop, critical: preferences.mtdCriticalDrop,
      type: 'RATING_DROP_MTD', ruleId: 'MTD_DROP' },
    { period: 'YTD', enabled: preferences.ytdDropEnabled,
      warning: preferences.ytdWarningDrop, critical: preferences.ytdCriticalDrop,
      type: 'RATING_DROP_YTD', ruleId: 'YTD_DROP' }
  ].filter(function (definition) { return definition.enabled; });
  if (!definitions.length) return [];
  const byApp = {};
  (ratings || []).forEach(function (item) {
    if (!item.isBbva || !(item.observedDate instanceof Date) || item.rating === null ||
        !marketsAlertScopeMatches_(preferences, item)) return;
    (byApp[item.appKey] || (byApp[item.appKey] = [])).push(item);
  });
  const referenceKey = dateKey_(referenceDate);
  return Object.keys(byApp).reduce(function (events, appKey) {
    const series = byApp[appKey].slice().sort(function (a, b) { return a.observedDate - b.observedDate; });
    const latest = series.find(function (item) { return dateKey_(item.observedDate) === referenceKey; });
    if (!latest) return events;
    definitions.forEach(function (definition) {
      const baseline = ratingDropBaseline_(series, referenceKey, definition.period);
      if (!baseline) return;
      const drop = round2_(baseline.rating - latest.rating);
      let severity = '';
      let threshold = null;
      if (drop >= definition.critical) {
        severity = 'CRITICAL'; threshold = definition.critical;
      } else if (drop >= definition.warning) {
        severity = 'WARNING'; threshold = definition.warning;
      }
      if (!severity) return;
      const periodKey = definition.period === 'DAILY' ? referenceKey :
        definition.period === 'MTD' ? referenceKey.slice(0, 7) : referenceKey.slice(0, 4);
      const eventParts = [definition.type, periodKey, appKey, preferences.email, severity];
      if (preferences.repeatWhileBreached) eventParts.push(referenceKey);
      const eventKey = eventParts.join('|');
      if (existing[eventKey]) return;
      existing[eventKey] = true;
      events.push({
        timestamp: new Date(), eventKey: eventKey, referenceDate: referenceDate,
        platform: latest.platform, countryCode: latest.countryCode, type: definition.type,
        severity: severity,
        detail: ratingDropDetail_(definition.period, baseline, latest, drop),
        recipients: preferences.email, userEmail: preferences.email, ruleId: definition.ruleId,
        metricValue: drop, threshold: threshold, appKey: appKey, direction: 'DOWN',
        runId: '', source: 'SELF_SERVICE_ALERTS', period: definition.period,
        appName: latest.appName || 'BBVA Empresas', country: latest.country || latest.countryCode,
        baselineRating: baseline.rating, currentRating: latest.rating,
        baselineDate: baseline.observedDate, currentDate: latest.observedDate
      });
    });
    return events;
  }, []);
}

/**
 * Al dar de alta a una cuenta no administradora reconoce las caídas YTD que
 * ya estaban activas. Se auditan, pero no se envían. Si la cuenta solicita
 * recordatorios, el siguiente día genera una clave nueva; una escalada
 * posterior de amarilla a roja también sigue siendo notificable.
 */
function buildMarketsEnrollmentYtdAcknowledgements_(ratings, referenceDate, preferences) {
  if (!preferences || !preferences.active || !preferences.ytdDropEnabled) return [];
  const baselinePreferences = Object.assign({}, preferences, {
    active: true,
    dailyDropEnabled: false,
    mtdDropEnabled: false,
    ytdDropEnabled: true
  });
  const events = buildRatingDropAlerts_(ratings, referenceDate, baselinePreferences, {});
  const acknowledged = [];
  events.forEach(function (event) {
    const levels = event.severity === 'CRITICAL' ? [
      { severity: 'WARNING', threshold: preferences.ytdWarningDrop },
      { severity: 'CRITICAL', threshold: preferences.ytdCriticalDrop }
    ] : [{ severity: event.severity, threshold: event.threshold }];
    levels.forEach(function (level) {
      const clone = Object.assign({}, event, level);
      const periodKey = dateKey_(referenceDate).slice(0, 4);
      const parts = ['RATING_DROP_YTD', periodKey, event.appKey, preferences.email, level.severity];
      if (preferences.repeatWhileBreached) parts.push(dateKey_(referenceDate));
      clone.eventKey = parts.join('|');
      clone.timestamp = new Date();
      clone.source = 'ADMIN_ENROLLMENT_BASELINE';
      clone.runId = 'ENROLL-' + Utilities.formatDate(clone.timestamp, MARKETS_CONFIG.timeZone, 'yyyyMMdd-HHmmss');
      clone.detail = 'Reconocida en el alta sin notificación. ' + event.detail;
      acknowledged.push(clone);
    });
  });
  return acknowledged;
}

function latestMarketsRatingDate_(ratings, preferences) {
  return (ratings || []).filter(function (item) {
    return item.isBbva && item.observedDate instanceof Date && item.rating !== null &&
      (!preferences || marketsAlertScopeMatches_(preferences, item));
  }).reduce(function (latest, item) {
    return !latest || item.observedDate.getTime() > latest.getTime() ? item.observedDate : latest;
  }, null);
}

function buildMarketsRealAlertPreviewEvents_(ratings, catalog, preferences, deliveryId) {
  const previewPreferences = Object.assign({}, preferences, { active: true, repeatWhileBreached: false });
  const referenceDate = latestMarketsRatingDate_(ratings, previewPreferences);
  if (!referenceDate) throw new Error('No hay ratings reales disponibles para el ámbito configurado.');
  const catalogByKey = (catalog || []).reduce(function (out, app) { out[app.appKey] = app; return out; }, {});
  let events = buildRatingDropAlerts_(ratings, referenceDate, previewPreferences, {});
  events = events.concat(buildCompetitiveCrossoverAlerts_(ratings, referenceDate, previewPreferences, catalogByKey, {}));
  const severityOrder = { CRITICAL: 0, WARNING: 1, POSITIVE: 2 };
  events.sort(function (a, b) {
    return (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9) ||
      trimString_(a.countryCode).localeCompare(trimString_(b.countryCode)) ||
      trimString_(a.platform).localeCompare(trimString_(b.platform));
  });
  if (!events.length) {
    const latest = (ratings || []).filter(function (item) {
      return item.isBbva && item.observedDate instanceof Date &&
        dateKey_(item.observedDate) === dateKey_(referenceDate) &&
        marketsAlertScopeMatches_(previewPreferences, item);
    }).sort(function (a, b) {
      return trimString_(a.countryCode).localeCompare(trimString_(b.countryCode)) ||
        trimString_(a.platform).localeCompare(trimString_(b.platform));
    })[0];
    if (!latest) throw new Error('No hay un cierre real utilizable para preparar la prueba.');
    events = [{
      timestamp: new Date(), referenceDate: referenceDate, currentDate: latest.observedDate,
      platform: latest.platform, countryCode: latest.countryCode, country: latest.country,
      type: 'TEST_SNAPSHOT', severity: 'POSITIVE', appKey: latest.appKey,
      appName: latest.appName || 'BBVA Empresas', currentRating: latest.rating,
      ratingCount: latest.ratingCount, metricValue: latest.rating, threshold: null,
      detail: 'Ninguna regla configurada está activada en el último cierre disponible.',
      direction: 'SNAPSHOT'
    }];
  }
  return events.slice(0, 8).map(function (event) {
    return Object.assign({}, event, {
      isTest: true, testId: deliveryId, recipients: preferences.email,
      userEmail: preferences.email, source: 'SELF_SERVICE_TEST_REAL_DATA',
      eventKey: 'TEST_PREVIEW|' + deliveryId + '|' + trimString_(event.eventKey || event.appKey)
    });
  });
}

function validateMarketsRealAlertPreviewEvents_(events, preferences) {
  if (!Array.isArray(events) || !events.length) {
    throw new Error('No hay datos reales utilizables para preparar la prueba.');
  }
  const hasNumber = function (value) { return toFiniteNumber_(value) !== null; };
  events.forEach(function (event) {
    const countryCode = trimString_(event && event.countryCode).toUpperCase();
    const platform = trimString_(event && event.platform);
    if (!countryCode || countryCode === 'GLOBAL' || !platform || platform.toUpperCase() === 'TODAS') {
      throw new Error('La prueba se ha cancelado: no existe una geografía y plataforma reales verificables.');
    }
    if (!marketsAlertScopeMatches_(preferences, { countryCode: countryCode, platform: platform })) {
      throw new Error('La prueba se ha cancelado: los datos no pertenecen al ámbito guardado.');
    }
    if (!(event.referenceDate instanceof Date) || !isFinite(event.referenceDate.getTime()) ||
        !trimString_(event.appKey)) {
      throw new Error('La prueba se ha cancelado: falta trazabilidad del cierre real.');
    }
    if (event.type === 'COMPETITIVE_CROSSOVER') {
      if (!hasNumber(event.bbvaRating) || !hasNumber(event.competitorRating)) {
        throw new Error('La prueba se ha cancelado: el cruce no contiene ratings reales comparables.');
      }
      return;
    }
    if (!hasNumber(event.currentRating)) {
      throw new Error('La prueba se ha cancelado: el cierre no contiene un rating real.');
    }
    if (event.type !== 'TEST_SNAPSHOT' &&
        (!hasNumber(event.baselineRating) || !hasNumber(event.metricValue) ||
         !hasNumber(event.threshold))) {
      throw new Error('La prueba se ha cancelado: la señal no puede justificarse con sus datos reales.');
    }
  });
  return events;
}

function ratingDropBaseline_(series, referenceKey, period) {
  const previous = (series || []).filter(function (item) { return dateKey_(item.observedDate) < referenceKey; });
  if (period === 'DAILY') return previous.slice().sort(function (a, b) { return b.observedDate - a.observedDate; })[0] || null;
  const start = period === 'MTD' ? referenceKey.slice(0, 7) + '-01' : referenceKey.slice(0, 4) + '-01-01';
  return previous.filter(function (item) { return dateKey_(item.observedDate) >= start; })[0] || null;
}

function ratingDropDetail_(period, baseline, latest, drop) {
  const label = period === 'DAILY' ? 'desde la observacion anterior' :
    period === 'MTD' ? 'desde inicio de mes' : 'desde inicio de ano';
  return 'BBVA Empresas: ' + label + ' ' + baseline.rating.toFixed(2) + ' -> ' +
    latest.rating.toFixed(2) + ' (caida ' + drop.toFixed(2) + ')';
}

function buildCompetitiveCrossoverAlerts_(ratings, referenceDate, preferences, catalogByKey, existing) {
  if (!preferences.active || !preferences.crossoverEnabled) return [];
  const referenceKey = dateKey_(referenceDate);
  const byMarket = {};
  (ratings || []).forEach(function (item) {
    if (!(item.observedDate instanceof Date) || item.rating === null || !marketsAlertScopeMatches_(preferences, item)) return;
    const config = catalogByKey[item.appKey];
    if (config && config.competitorAlerts === false) return;
    const key = item.countryCode + '|' + item.platform;
    (byMarket[key] || (byMarket[key] = [])).push(item);
  });
  return Object.keys(byMarket).reduce(function (events, marketKey) {
    const rows = byMarket[marketKey];
    const current = rows.filter(function (item) { return dateKey_(item.observedDate) === referenceKey; });
    const bbva = current.find(function (item) { return item.isBbva; });
    if (!bbva) return events;
    current.filter(function (item) { return !item.isBbva; }).forEach(function (peer) {
      const previousPair = previousCommonAlertPair_(rows, bbva.appKey, peer.appKey, referenceKey);
      if (!previousPair) return;
      const previousDifference = round2_(previousPair.bbva.rating - previousPair.peer.rating);
      const currentDifference = round2_(bbva.rating - peer.rating);
      let direction = '';
      if (previousDifference >= 0 && currentDifference < 0) direction = 'LOST';
      else if (previousDifference <= 0 && currentDifference > 0) direction = 'GAINED';
      if (!direction || (preferences.crossoverDirection !== 'BOTH' && preferences.crossoverDirection !== direction)) return;
      const eventKey = ['COMPETITIVE_CROSSOVER', referenceKey, bbva.appKey, peer.appKey,
        preferences.email, direction].join('|');
      if (existing[eventKey]) return;
      existing[eventKey] = true;
      const peerName = peer.appName || peer.appKey;
      events.push({
        timestamp: new Date(), eventKey: eventKey, referenceDate: referenceDate,
        platform: bbva.platform, countryCode: bbva.countryCode, type: 'COMPETITIVE_CROSSOVER',
        severity: direction === 'LOST' ? 'WARNING' : 'POSITIVE',
        detail: direction === 'LOST' ? peerName + ' ha superado a BBVA Empresas (' +
          peer.rating.toFixed(2) + ' vs ' + bbva.rating.toFixed(2) + ')' :
          'BBVA Empresas ha superado a ' + peerName + ' (' + bbva.rating.toFixed(2) +
          ' vs ' + peer.rating.toFixed(2) + ')',
        recipients: preferences.email, userEmail: preferences.email, ruleId: 'COMPETITIVE_CROSSOVER',
        metricValue: currentDifference, threshold: 0, appKey: peer.appKey, direction: direction,
        runId: '', source: 'SELF_SERVICE_ALERTS', appName: bbva.appName || 'BBVA Empresas',
        country: bbva.country || bbva.countryCode, bbvaRating: bbva.rating,
        competitorName: peerName, competitorRating: peer.rating,
        previousBbvaRating: previousPair.bbva.rating, previousCompetitorRating: previousPair.peer.rating,
        baselineDate: previousPair.bbva.observedDate, currentDate: bbva.observedDate
      });
    });
    return events;
  }, []);
}

function previousCommonAlertPair_(rows, bbvaKey, peerKey, referenceKey) {
  const byDate = {};
  (rows || []).filter(function (item) { return dateKey_(item.observedDate) < referenceKey; })
    .forEach(function (item) {
      const key = dateKey_(item.observedDate);
      const bucket = byDate[key] || (byDate[key] = {});
      if (item.appKey === bbvaKey) bucket.bbva = item;
      if (item.appKey === peerKey) bucket.peer = item;
    });
  const date = Object.keys(byDate).filter(function (key) { return byDate[key].bbva && byDate[key].peer; }).sort().pop();
  return date ? byDate[date] : null;
}

function marketsAlertScopeMatches_(preferences, item) {
  return (preferences.countries.indexOf('ALL') >= 0 || preferences.countries.indexOf(item.countryCode) >= 0) &&
    (preferences.platforms.indexOf('ALL') >= 0 || preferences.platforms.indexOf(item.platform) >= 0);
}

function readExistingAlertKeys_(ss) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.alerts);
  if (sheet.getLastRow() <= 1) return {};
  const failedRuns = readFailedAlertRunIds_(ss);
  return sheet.getRange(2, 2, sheet.getLastRow() - 1, 9).getValues().reduce(function (out, row) {
    const key = trimString_(row[0]);
    const runId = trimString_(row[8]);
    if (key && !failedRuns[runId]) out[key] = true;
    return out;
  }, {});
}

function readFailedAlertRunIds_(ss) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.runs);
  if (!sheet || sheet.getLastRow() <= 1) return {};
  const width = Math.min(sheet.getLastColumn(), MARKETS_CONFIG.headers.runs.length);
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0];
  const indexes = indexHeaders_(headers);
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues().reduce(function (out, row) {
    const runId = trimString_(row[indexes.run_id]);
    const status = trimString_(row[indexes.status]).toUpperCase();
    const delivery = indexes.alert_delivery_status === undefined ? '' :
      trimString_(row[indexes.alert_delivery_status]).toUpperCase();
    if (runId && (['ERROR', 'PARTIAL'].indexOf(delivery) >= 0 || (!delivery && status === 'ERROR'))) {
      out[runId] = true;
    }
    return out;
  }, {});
}

function appendAlertEvents_(ss, events) {
  if (!events.length) return;
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.alerts);
  const rows = events.map(function (event) {
    return [event.timestamp, event.eventKey, event.referenceDate, event.platform, event.countryCode,
      event.type, event.severity, event.detail, event.recipients, event.runId, event.source,
      event.userEmail, event.ruleId, event.metricValue, event.threshold, event.appKey, event.direction];
  });
  ensureSheetCapacity_(sheet, sheet.getLastRow() + rows.length, MARKETS_CONFIG.headers.alerts.length);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function sendAlertEmails_(events, ss) {
  const grouped = {};
  (events || []).forEach(function (event) {
    uniqueStrings_(trimString_(event.recipients).split(/[;,]/)).forEach(function (recipient) {
      (grouped[recipient] || (grouped[recipient] = [])).push(event);
    });
  });
  const recipients = Object.keys(grouped);
  if (!recipients.length) return 0;
  const sender = requireMarketsAlertSender_(ss);
  const inlineImages = buildMarketsAlertInlineImages_();
  const deliveries = [];
  const failures = [];
  recipients.forEach(function (recipient) {
    try {
      const recipientEvents = grouped[recipient];
      const message = marketsAlertEmailMessage_(recipient, recipientEvents, inlineImages, sender);
      const accepted = Gmail.Users.Messages.send({ raw: message.raw }, 'me');
      if (!accepted || !trimString_(accepted.id)) {
        throw new Error('Gmail no ha devuelto un identificador de mensaje.');
      }
      deliveries.push({
        recipient: recipient, messageId: trimString_(accepted.id), threadId: trimString_(accepted.threadId),
        senderAddress: sender.address, senderName: sender.name,
        verificationStatus: sender.verificationStatus
      });
      if (ss) {
        try { touchMarketsAlertTimestamp_(ss, recipient, 'LAST_DELIVERY_AT', new Date()); }
        catch (auditError) { console.error('Email aceptado para ' + recipient + ', pero fallo LAST_DELIVERY_AT: ' + errorToString_(auditError)); }
      }
    } catch (error) {
      failures.push({ recipient: normalizeEmailForComparison_(recipient), error: errorToString_(error) });
    }
  });
  events.deliveryResults = deliveries;
  events.deliveryFailures = failures;
  events.deliveredRecipients = deliveries.map(function (item) {
    return normalizeEmailForComparison_(item.recipient);
  });
  return deliveries.length;
}

function marketsAlertEmailMessage_(recipient, events, inlineImages, sender) {
  const normalizedRecipient = normalizeMarketsAlertEmail_(recipient);
  const subject = marketsAlertEmailSubject_(events);
  const plainText = renderMarketsAlertPlainText_(events, normalizedRecipient);
  const html = renderMarketsAlertEmail_(events, normalizedRecipient);
  const image = inlineImages && inlineImages.bbvaLogo;
  if (!image || typeof image.getBytes !== 'function') {
    throw new Error('No se ha podido incorporar el logotipo oficial de BBVA al correo.');
  }
  const token = Utilities.getUuid().replace(/-/g, '');
  const relatedBoundary = 'bbva_related_' + token;
  const alternativeBoundary = 'bbva_alternative_' + token;
  const crlf = '\r\n';
  const mime = [
    'From: ' + marketsAlertEncodedHeader_(sender.name) + ' <' + sender.address + '>',
    'To: ' + normalizedRecipient,
    'Subject: ' + marketsAlertEncodedHeader_(subject),
    'Date: ' + new Date().toUTCString(),
    'Message-ID: <' + token + '@voc-commercial.bbva.com>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/related; boundary="' + relatedBoundary + '"',
    '',
    '--' + relatedBoundary,
    'Content-Type: multipart/alternative; boundary="' + alternativeBoundary + '"',
    '',
    '--' + alternativeBoundary,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    marketsAlertMimeText_(plainText),
    '--' + alternativeBoundary,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    marketsAlertMimeText_(html),
    '--' + alternativeBoundary + '--',
    '',
    '--' + relatedBoundary,
    'Content-Type: image/png; name="bbva.png"',
    'Content-Transfer-Encoding: base64',
    'Content-ID: <bbvaLogo>',
    'Content-Disposition: inline; filename="bbva.png"',
    '',
    marketsAlertMimeBytes_(image.getBytes()),
    '--' + relatedBoundary + '--',
    ''
  ].join(crlf);
  return {
    raw: Utilities.base64EncodeWebSafe(mime, Utilities.Charset.UTF_8).replace(/=+$/g, ''),
    recipient: normalizedRecipient,
    subject: subject
  };
}

function marketsAlertEncodedHeader_(value) {
  return '=?UTF-8?B?' + Utilities.base64Encode(trimString_(value), Utilities.Charset.UTF_8) + '?=';
}

function marketsAlertMimeText_(value) {
  return marketsAlertWrapBase64_(Utilities.base64Encode(String(value || ''), Utilities.Charset.UTF_8));
}

function marketsAlertMimeBytes_(bytes) {
  return marketsAlertWrapBase64_(Utilities.base64Encode(bytes));
}

function marketsAlertWrapBase64_(value) {
  return (String(value || '').match(/.{1,76}/g) || ['']).join('\r\n');
}

function marketsAlertConfiguredSenderAddress_(ss) {
  let address = MARKETS_ALERT_EMAIL.senderAddress;
  if (ss) {
    const control = readControl_(ss);
    address = trimString_(control.ALERT_SENDER_ALIAS) || address;
  }
  return normalizeMarketsAlertEmail_(address);
}

function marketsAlertSenderStatus_(ss) {
  const address = marketsAlertConfiguredSenderAddress_(ss);
  let response;
  try {
    response = Gmail.Users.Settings.SendAs.list('me');
  } catch (error) {
    return {
      address: address, name: MARKETS_ALERT_EMAIL.senderName, mode: MARKETS_ALERT_EMAIL.senderMode,
      available: false, verificationStatus: 'unavailable', error: errorToString_(error)
    };
  }
  const sendAs = (response && response.sendAs || []).find(function (item) {
    return normalizeEmailForComparison_(item.sendAsEmail) === normalizeEmailForComparison_(address);
  });
  const verificationStatus = trimString_(sendAs && sendAs.verificationStatus).toLowerCase() || 'unknown';
  return {
    address: address, name: MARKETS_ALERT_EMAIL.senderName, mode: MARKETS_ALERT_EMAIL.senderMode,
    available: Boolean(sendAs) && verificationStatus === 'accepted',
    verificationStatus: verificationStatus, isDefault: Boolean(sendAs && sendAs.isDefault),
    treatAsAlias: Boolean(sendAs && sendAs.treatAsAlias), error: ''
  };
}

function requireMarketsAlertSender_(ss) {
  const status = marketsAlertSenderStatus_(ss);
  if (status.available) return status;
  if (status.verificationStatus === 'pending') {
    throw new Error('El remitente ' + status.address + ' sigue pendiente de verificacion en Gmail > Enviar como. Confirma el mensaje recibido por el grupo antes de probar.');
  }
  if (status.verificationStatus === 'unavailable') {
    throw new Error('No se ha podido validar el remitente de grupo ' + status.address + ': ' + status.error);
  }
  throw new Error('El remitente ' + status.address + ' no esta autorizado en Gmail > Enviar como para la cuenta que ejecuta el trigger. Añadelo, verifica el grupo y vuelve a probar.');
}

function validateMarketsAlertSender() {
  const ss = openMarketsSpreadsheet_();
  ensureWorkbookSchema_(ss);
  const status = marketsAlertSenderStatus_(ss);
  let executor = '';
  try { executor = normalizeEmailForComparison_(Session.getEffectiveUser().getEmail()); } catch (ignored) {}
  return Object.assign({ executor: executor }, status);
}

function marketsAlertEmailSubject_(events) {
  const tests = (events || []).filter(function (event) { return event.type === 'TEST' || event.isTest; });
  if (tests.length === (events || []).length && tests.length) {
    return '[PRUEBA] Market Pulse · Datos reales · ' +
      trimString_(tests[0].testId || tests[0].ruleId || 'verificación');
  }
  return '[Market Pulse] Alertas personalizadas · ' + events.length + ' cambio' +
    (events.length === 1 ? '' : 's') + ' en ratings';
}

function renderMarketsAlertPlainText_(events, recipient) {
  const isTest = marketsAlertIsTest_(events);
  const appUrl = marketsWebAppUrl_();
  const loginUrl = marketsWebAppLoginUrl_(recipient);
  const lines = (events || []).map(function (event) {
    if (event.type === 'TEST_SNAPSHOT') {
      return 'CIERRE REAL — NINGUNA REGLA ACTIVADA\n' +
        [event.country || event.countryCode, event.platform].filter(Boolean).join(' · ') +
        '\nRating actual: ' + marketsAlertNumberLabel_(event.currentRating) +
        (event.ratingCount === null || event.ratingCount === undefined ? '' :
          '\nValoraciones acumuladas: ' + Math.round(event.ratingCount)) +
        '\nLectura: ' + trimString_(event.detail);
    }
    return '[' + marketsAlertSeverityLabel_(event.severity).toUpperCase() + '] ' +
      marketsAlertCardTitle_(event) + '\nMercado y plataforma: ' +
      [event.country || event.countryCode, event.platform].filter(Boolean).join(' · ') + '\nQué ha cambiado: ' +
      trimString_(event.detail) + '\nUmbral configurado: ' + marketsAlertNumberLabel_(event.threshold) + ' puntos\n' +
      'Recomendación: ' + marketsAlertRecommendation_(event);
  });
  return 'MARKET PULSE\nBBVA Banca de Empresas e Instituciones\n\nAlerta por cambios en ratings\n' +
    (isTest ? 'Vista previa construida exclusivamente con el último cierre real y la configuración vigente. No genera una alerta operativa.\n\n' : '\n') +
    lines.join('\n\n') + '\n\nDatos obtenidos: ' + marketsAlertDataDateLabel_(events) +
    '\nGestiona tus alertas desde Market Pulse.\nAbrir con la cuenta corporativa: ' + loginUrl + '\nURL directa: ' + appUrl;
}

function renderMarketsAlertEmail_(events, recipient) {
  const isTest = marketsAlertIsTest_(events);
  const critical = (events || []).filter(function (event) { return event.severity === 'CRITICAL'; }).length;
  const warning = (events || []).filter(function (event) { return event.severity === 'WARNING'; }).length;
  const positive = (events || []).filter(function (event) { return event.severity === 'POSITIVE'; }).length;
  const cards = (events || []).map(renderMarketsAlertEmailCard_).join('');
  const appUrl = marketsWebAppUrl_();
  const loginUrl = marketsWebAppLoginUrl_(recipient);
  const safeAppUrl = escapeMarketsAlertHtml_(appUrl);
  const safeLoginUrl = escapeMarketsAlertHtml_(loginUrl);
  const cta = '<table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#001391" style="border-radius:8px;"><a href="' + safeLoginUrl + '" target="_blank" style="display:block;padding:13px 22px;border-radius:8px;color:#FFFFFF;text-decoration:none;font-weight:700;">Ir a Market Pulse</a></td></tr></table>' +
    '<p style="margin:12px 0 0;color:#46536D;font-size:11px;line-height:17px;">Si el botón no se abre, utiliza este <a href="' + safeAppUrl + '" target="_blank" style="color:#001391;font-weight:700;">acceso directo a Market Pulse</a>.</p>';
  const subtitle = isTest ? 'Vista previa con el último cierre real disponible y la configuración vigente. No genera una alerta operativa.' :
    events.length + ' cambio' + (events.length === 1 ? ' ha' : 's han') + ' superado las condiciones configuradas. Contexto ejecutivo para valorar la situación.';
  const summary = isTest ? renderMarketsAlertTestSummary_() :
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>' +
    marketsAlertSummaryCell_('Críticas', critical, '#B92A45', '#F9E9ED') +
    marketsAlertSummaryCell_('Advertencias', warning, '#946200', '#FFF4CC') +
    marketsAlertSummaryCell_('Positivas', positive, '#277A49', '#E6F4EA') + '</tr></table>';
  return '<!doctype html><html><body style="margin:0;background:#F7F8F8;font-family:\'BBVABentonSans\',\'Benton Sans BBVA\',Arial,Helvetica,sans-serif;color:#000519;">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F7F8F8;"><tr><td align="center" style="padding:28px 12px;">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background:#FFFFFF;border-radius:16px;overflow:hidden;">' +
    '<tr><td width="100%" style="padding:24px 28px;background:#001391;"><img src="cid:bbvaLogo" width="156" alt="BBVA Banca de Empresas e Instituciones" style="display:block;width:156px;height:auto;"><div style="margin-top:22px;color:#8BE1E9;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">MARKET PULSE · ' + (isTest ? 'PRUEBA DE CANAL' : 'ALERTAS DE RATINGS') + '</div><h1 style="margin:8px 0 0;color:#FFFFFF;font-size:28px;line-height:34px;">Alerta por cambios en ratings</h1><p style="margin:10px 0 0;color:#85C8FF;font-size:15px;line-height:22px;">' + escapeMarketsAlertHtml_(subtitle) + '</p></td></tr>' +
    '<tr><td width="100%" style="padding:22px 28px 8px;">' + summary + '</td></tr>' +
    '<tr><td width="100%" style="padding:14px 28px 8px;">' + cards + '</td></tr>' +
    '<tr><td width="100%" style="padding:18px 28px 30px;">' + cta + '<p style="margin:18px 0 0;color:#46536D;font-size:12px;line-height:18px;">Este correo es privado y contiene únicamente señales configuradas para tu cuenta. Las preferencias de otros usuarios nunca son visibles.</p><p style="margin:7px 0 0;color:#ADB8C2;font-size:10px;line-height:15px;">Datos obtenidos el ' + escapeMarketsAlertHtml_(marketsAlertDataDateLabel_(events)) + '.</p></td></tr>' +
    '<tr><td width="100%" style="padding:16px 28px;background:#070E46;color:#85C8FF;font-size:11px;line-height:17px;"><strong style="color:#FFFFFF;">Market Pulse</strong><br>BBVA Banca de Empresas e Instituciones · Ratings y valoraciones públicas.</td></tr>' +
    '</table></td></tr></table></body></html>';
}

function marketsAlertIsTest_(events) {
  return Boolean((events || []).length) && (events || []).every(function (event) {
    return event.type === 'TEST' || Boolean(event.isTest);
  });
}

function renderMarketsAlertTestSummary_() {
  return '<div style="padding:16px 18px;border-radius:8px;background:#EAFBFA;color:#070E46;">' +
    '<strong style="display:block;font-size:17px;line-height:23px;">Vista previa · datos reales</strong>' +
    '<span style="display:block;margin-top:4px;color:#46536D;font-size:13px;line-height:19px;">El contenido procede del último cierre disponible y aplica el ámbito y los umbrales guardados. Esta prueba no se registra como alerta operativa.</span></div>';
}

function marketsAlertSummaryCell_(label, value, color, background) {
  return '<td width="33.33%" style="padding:0 5px;"><div style="padding:14px;border-radius:8px;background:' + background + ';color:' + color + ';text-align:center;"><strong style="display:block;font-size:22px;line-height:26px;">' + value + '</strong><span style="font-size:11px;font-weight:700;text-transform:uppercase;">' + label + '</span></div></td>';
}

function renderMarketsAlertEmailCard_(event) {
  if (event.type === 'TEST_SNAPSHOT') return renderMarketsAlertSnapshotCard_(event);
  const palette = event.severity === 'CRITICAL' ? ['#B92A45', '#F9E9ED', 'Crítico'] :
    event.severity === 'WARNING' ? ['#946200', '#FFF4CC', 'Advertencia'] : ['#277A49', '#E6F4EA', 'Movimiento positivo'];
  const market = [event.country || event.countryCode, event.platform].filter(Boolean).join(' · ');
  const title = marketsAlertCardTitle_(event);
  const metrics = marketsAlertMetricsHtml_(event, palette);
  return '<div style="width:100%;box-sizing:border-box;margin:0 0 12px;padding:18px;border-left:5px solid ' + palette[0] + ';border-radius:8px;background:' + palette[1] + ';">' +
    '<div style="font-size:11px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:' + palette[0] + ';">' + palette[2] + ' · ' + escapeMarketsAlertHtml_(marketsAlertRuleLabel_(event.type)) + '</div>' +
    '<div style="margin-top:7px;color:#070E46;font-size:18px;font-weight:700;line-height:24px;">' + escapeMarketsAlertHtml_(title) + '</div>' +
    '<div style="margin-top:3px;color:#46536D;font-size:13px;line-height:19px;">' + escapeMarketsAlertHtml_(market) + '</div>' + metrics +
    '<div style="margin-top:12px;padding-top:11px;border-top:1px solid rgba(0,19,145,.12);color:#46536D;font-size:13px;line-height:19px;"><strong style="color:#070E46;">Qué significa:</strong> ' + escapeMarketsAlertHtml_(marketsAlertReason_(event)) + '<br><strong style="color:#070E46;">Siguiente paso:</strong> ' + escapeMarketsAlertHtml_(marketsAlertRecommendation_(event)) + '</div></div>';
}

function renderMarketsAlertSnapshotCard_(event) {
  const market = [event.country || event.countryCode, event.platform].filter(Boolean).join(' · ');
  const count = event.ratingCount === null || event.ratingCount === undefined ? 'No disponible' :
    marketsAlertIntegerLabel_(event.ratingCount);
  return '<div style="width:100%;box-sizing:border-box;margin:0 0 12px;padding:18px;border-left:5px solid #001391;border-radius:8px;background:#EAFBFA;">' +
    '<div style="color:#001391;font-size:11px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;">ÚLTIMO CIERRE REAL · SIN REGLAS ACTIVADAS</div>' +
    '<div style="margin-top:7px;color:#070E46;font-size:18px;font-weight:700;line-height:24px;">' +
    escapeMarketsAlertHtml_(market) + '</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:13px;background:#FFFFFF;border-radius:8px;"><tr>' +
    marketsAlertMetricCell_('Rating actual', marketsAlertNumberLabel_(event.currentRating), marketsAlertDateLabel_(event.currentDate)) +
    marketsAlertMetricCell_('Valoraciones', count, 'acumuladas') +
    marketsAlertMetricCell_('Estado', 'Sin señal', 'según la configuración') +
    '</tr></table><div style="margin-top:12px;color:#46536D;font-size:13px;line-height:19px;">' +
    escapeMarketsAlertHtml_(event.detail) + '</div></div>';
}

function marketsAlertCardTitle_(event) {
  const app = trimString_(event.appName || 'BBVA Empresas');
  if (event.type === 'COMPETITIVE_CROSSOVER') {
    return event.direction === 'LOST' ? trimString_(event.competitorName) + ' ha superado a ' + app :
      app + ' ha recuperado posición frente a ' + trimString_(event.competitorName);
  }
  return 'BBVA ' + marketsAlertGeographyLabel_(event) + ' cae ' + marketsAlertNumberLabel_(event.metricValue) + ' puntos';
}

function marketsAlertGeographyLabel_(event) {
  return trimString_(event.country || event.countryCode || 'mercado');
}

function marketsAlertMetricsHtml_(event, palette) {
  if (event.type === 'COMPETITIVE_CROSSOVER') {
    return '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:13px;background:#FFFFFF;border-radius:8px;"><tr>' +
      marketsAlertMetricCell_('BBVA', marketsAlertNumberLabel_(event.bbvaRating), 'rating') +
      marketsAlertMetricCell_(trimString_(event.competitorName || 'Competidor'), marketsAlertNumberLabel_(event.competitorRating), 'rating') +
      marketsAlertMetricCell_('Brecha', marketsAlertSignedNumberLabel_(event.metricValue), 'puntos') + '</tr></table>';
  }
  return '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:13px;background:#FFFFFF;border-radius:8px;"><tr>' +
    marketsAlertMetricCell_('Rating anterior', marketsAlertNumberLabel_(event.baselineRating), marketsAlertDateLabel_(event.baselineDate)) +
    marketsAlertMetricCell_('Rating actual', marketsAlertNumberLabel_(event.currentRating), marketsAlertDateLabel_(event.currentDate)) +
    marketsAlertMetricCell_('Caída / límite', marketsAlertNumberLabel_(event.metricValue), 'límite ' + marketsAlertNumberLabel_(event.threshold)) + '</tr></table>';
}

function marketsAlertMetricCell_(label, value, note) {
  return '<td width="33.33%" style="padding:12px 9px;text-align:center;"><span style="display:block;color:#46536D;font-size:10px;text-transform:uppercase;">' + escapeMarketsAlertHtml_(label) + '</span><strong style="display:block;margin-top:3px;color:#070E46;font-size:18px;line-height:22px;">' + escapeMarketsAlertHtml_(value) + '</strong><small style="display:block;margin-top:2px;color:#46536D;font-size:10px;line-height:14px;">' + escapeMarketsAlertHtml_(note) + '</small></td>';
}

function marketsAlertSeverityLabel_(severity) {
  return severity === 'CRITICAL' ? 'Crítica' : severity === 'WARNING' ? 'Advertencia' : 'Movimiento positivo';
}

function marketsAlertReason_(event) {
  if (event.type === 'COMPETITIVE_CROSSOVER') {
    return event.direction === 'LOST' ? 'El competidor ha pasado de estar por debajo o empatado a situarse por encima de BBVA.' :
      'BBVA ha pasado de estar por debajo o empatado a situarse por encima del competidor.';
  }
  const limit = event.severity === 'CRITICAL' ? 'rojo' : 'amarillo';
  return 'La caída de ' + marketsAlertNumberLabel_(event.metricValue) +
    ' puntos supera el límite configurado para el nivel ' + limit +
    ' (' + marketsAlertNumberLabel_(event.threshold) + ' puntos).';
}

function marketsAlertRecommendation_(event) {
  if (event.type === 'COMPETITIVE_CROSSOVER') return 'Abre Market Pulse y compara la evolución de BBVA con el competidor en ese mercado.';
  return 'Abre Market Pulse, revisa la evolución de la aplicación y contrasta el movimiento con las valoraciones recientes.';
}

function marketsAlertNumberLabel_(value) {
  const number = Number(value);
  return isFinite(number) ? number.toFixed(2).replace('.', ',') : '—';
}

function marketsAlertIntegerLabel_(value) {
  const number = toFiniteNumber_(value);
  if (number === null) return 'N/D';
  return Math.round(number).toLocaleString('es-ES');
}

function marketsAlertSignedNumberLabel_(value) {
  const number = Number(value);
  return isFinite(number) ? (number > 0 ? '+' : '') + number.toFixed(2).replace('.', ',') : '—';
}

function marketsAlertDateLabel_(value) {
  if (!value) return 'fecha base';
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return trimString_(value);
  try { return Utilities.formatDate(date, MARKETS_CONFIG.timeZone, 'dd/MM/yyyy'); }
  catch (ignored) { return date.toISOString().slice(0, 10); }
}

function marketsAlertDataDateLabel_(events) {
  const dates = (events || []).map(function (event) {
    return event.currentDate || event.referenceDate || null;
  }).map(function (value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }).filter(Boolean).sort(function (a, b) { return b.getTime() - a.getTime(); });
  return dates.length ? marketsAlertDateLabel_(dates[0]) : 'no disponible';
}

function marketsAlertRuleLabel_(type) {
  return type === 'RATING_DROP_DAILY' ? 'Caída diaria del rating' :
    type === 'RATING_DROP_MTD' ? 'Caída desde inicio de mes' :
    type === 'RATING_DROP_YTD' ? 'Caída desde inicio de año' :
    type === 'COMPETITIVE_CROSSOVER' ? 'Cruce de posición competitiva' :
    type === 'TEST' ? 'Verificación del canal' : type;
}

function buildMarketsAlertInlineImages_() {
  const html = HtmlService.createHtmlOutputFromFile('BrandIdentity').getContent();
  const match = html.match(/--asset-bbva-bei-logo:url\("data:image\/png;base64,([^"\)]+)"\)/);
  if (!match) throw new Error('No se ha encontrado el logotipo oficial de BBVA Banca de Empresas e Instituciones.');
  return { bbvaLogo: Utilities.newBlob(Utilities.base64Decode(match[1]), 'image/png', 'bbva-bei.png') };
}

function escapeMarketsAlertHtml_(value) {
  return trimString_(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
