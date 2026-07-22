/** Evalua alertas personalizadas y envia un unico resumen BBVA por usuario. */
var MARKETS_ALERT_EMAIL = Object.freeze({
  senderName: 'BBVA VoC Commercial',
  senderAddress: 'voc-commercial.group@bbva.com',
  senderMode: 'GROUP_ALIAS'
});

function buildAndProcessAlerts_(ss, referenceDate, catalog, runId, control, ratingObjects) {
  const ratings = ratingObjects || readRatingObjects_(ss);
  migrateLegacyAlertRecipients_(ss, catalog);
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
  const plainText = renderMarketsAlertPlainText_(events);
  const html = renderMarketsAlertEmail_(events);
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
  const tests = (events || []).filter(function (event) { return event.type === 'TEST'; });
  if (tests.length === (events || []).length && tests.length) {
    return '[PRUEBA] COMMERCIAL · Canal de alertas · ' + trimString_(tests[0].ruleId || 'verificación');
  }
  return '[VoC] Comunicación de alertas personalizadas - ' + events.length + ' cambio' +
    (events.length === 1 ? '' : 's') + ' en ratings';
}

function renderMarketsAlertPlainText_(events) {
  const isTest = marketsAlertIsTest_(events);
  const lines = (events || []).map(function (event) {
    if (event.type === 'TEST') {
      return 'PRUEBA DE ENTREGA — NO ES UNA ALERTA REAL\nIdentificador: ' + trimString_(event.ruleId) +
        '\nDestino: ' + trimString_(event.recipients) +
        '\nResultado: el canal ha aceptado correctamente una prueba de correo.\n' +
        'Las alertas reales incluirán aplicación, mercado, plataforma, periodo, rating anterior, rating actual, variación y umbral.';
    }
    return '[' + marketsAlertSeverityLabel_(event.severity).toUpperCase() + '] ' +
      marketsAlertCardTitle_(event) + '\nMercado y plataforma: ' +
      [event.country || event.countryCode, event.platform].filter(Boolean).join(' · ') + '\nQué ha cambiado: ' +
      trimString_(event.detail) + '\nUmbral configurado: ' + marketsAlertNumberLabel_(event.threshold) + ' puntos\n' +
      'Recomendación: ' + marketsAlertRecommendation_(event);
  });
  return 'BBVA COMMERCIAL\nAlerta por cambios en ratings\n' +
    (isTest ? 'Esta es una prueba; no se ha detectado ningún cambio real.\n\n' : '\n') +
    lines.join('\n\n') + '\n\nDatos obtenidos: ' + marketsAlertDataDateLabel_(events) +
    '\nGestiona tus alertas desde COMMERCIAL.';
}

function renderMarketsAlertEmail_(events) {
  const isTest = marketsAlertIsTest_(events);
  const critical = (events || []).filter(function (event) { return event.severity === 'CRITICAL'; }).length;
  const warning = (events || []).filter(function (event) { return event.severity === 'WARNING'; }).length;
  const positive = (events || []).filter(function (event) { return event.severity === 'POSITIVE'; }).length;
  const cards = (events || []).map(renderMarketsAlertEmailCard_).join('');
  const appUrl = trimString_(ScriptApp.getService().getUrl());
  const cta = appUrl ? '<a href="' + escapeMarketsAlertHtml_(appUrl) + '" style="display:inline-block;padding:13px 22px;border-radius:8px;background:#1464A5;color:#FFFFFF;text-decoration:none;font-weight:700;">Abrir VoC Commercial</a>' : '';
  const subtitle = isTest ? 'Esta es una prueba de entrega. No se ha detectado ningún cambio real en los ratings.' :
    events.length + ' cambio' + (events.length === 1 ? ' ha' : 's han') + ' superado tus condiciones personalizadas. Aquí tienes el contexto completo para que puedas profundizar en la situación.';
  const summary = isTest ? renderMarketsAlertTestSummary_() :
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>' +
    marketsAlertSummaryCell_('Críticas', critical, '#B92A45', '#F9E9ED') +
    marketsAlertSummaryCell_('Advertencias', warning, '#946200', '#FFF4CC') +
    marketsAlertSummaryCell_('Positivas', positive, '#277A49', '#E6F4EA') + '</tr></table>';
  return '<!doctype html><html><body style="margin:0;background:#F4F5F6;font-family:\'Benton Sans BBVA\',Arial,Helvetica,sans-serif;color:#121212;">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F5F6;"><tr><td align="center" style="padding:28px 12px;">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background:#FFFFFF;border-radius:16px;overflow:hidden;">' +
    '<tr><td width="100%" style="padding:24px 28px;background:#072146;"><img src="cid:bbvaLogo" width="92" alt="BBVA" style="display:block;width:92px;height:auto;"><div style="margin-top:22px;color:#5AC4C4;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">COMMERCIAL · ' + (isTest ? 'PRUEBA DE CANAL' : 'ALERTAS DE RATINGS') + '</div><h1 style="margin:8px 0 0;color:#FFFFFF;font-size:28px;line-height:34px;">Alerta por cambios en ratings</h1><p style="margin:10px 0 0;color:#B6D5F5;font-size:15px;line-height:22px;">' + escapeMarketsAlertHtml_(subtitle) + '</p></td></tr>' +
    '<tr><td width="100%" style="padding:22px 28px 8px;">' + summary + '</td></tr>' +
    '<tr><td width="100%" style="padding:14px 28px 8px;">' + cards + '</td></tr>' +
    '<tr><td width="100%" style="padding:18px 28px 30px;">' + cta + '<p style="margin:18px 0 0;color:#5B6670;font-size:12px;line-height:18px;">Este correo es privado y contiene únicamente señales configuradas para tu cuenta. Las preferencias de otros usuarios nunca son visibles.</p><p style="margin:7px 0 0;color:#7C8893;font-size:10px;line-height:15px;">Datos obtenidos el ' + escapeMarketsAlertHtml_(marketsAlertDataDateLabel_(events)) + '.</p></td></tr>' +
    '<tr><td width="100%" style="padding:16px 28px;background:#061B36;color:#B6D5F5;font-size:11px;line-height:17px;"><strong style="color:#FFFFFF;">BBVA COMMERCIAL</strong><br>Ratings y valoraciones públicas de las stores · Android, iOS y Huawei.</td></tr>' +
    '</table></td></tr></table></body></html>';
}

function marketsAlertIsTest_(events) {
  return Boolean((events || []).length) && (events || []).every(function (event) { return event.type === 'TEST'; });
}

function renderMarketsAlertTestSummary_() {
  return '<div style="padding:16px 18px;border-radius:8px;background:#E6F4EA;color:#277A49;">' +
    '<strong style="display:block;font-size:17px;line-height:23px;">✓ Canal de alertas verificado</strong>' +
    '<span style="display:block;margin-top:4px;color:#3D5A48;font-size:13px;line-height:19px;">El correo de prueba ha salido correctamente. Debajo puedes ver cómo llegará el contexto de una alerta real.</span></div>';
}

function marketsAlertSummaryCell_(label, value, color, background) {
  return '<td width="33.33%" style="padding:0 5px;"><div style="padding:14px;border-radius:8px;background:' + background + ';color:' + color + ';text-align:center;"><strong style="display:block;font-size:22px;line-height:26px;">' + value + '</strong><span style="font-size:11px;font-weight:700;text-transform:uppercase;">' + label + '</span></div></td>';
}

function renderMarketsAlertEmailCard_(event) {
  if (event.type === 'TEST') return renderMarketsAlertTestCard_(event);
  const palette = event.severity === 'CRITICAL' ? ['#B92A45', '#F9E9ED', 'Crítico'] :
    event.severity === 'WARNING' ? ['#946200', '#FFF4CC', 'Advertencia'] : ['#277A49', '#E6F4EA', 'Movimiento positivo'];
  const market = [event.country || event.countryCode, event.platform].filter(Boolean).join(' · ');
  const title = marketsAlertCardTitle_(event);
  const metrics = marketsAlertMetricsHtml_(event, palette);
  return '<div style="width:100%;box-sizing:border-box;margin:0 0 12px;padding:18px;border-left:5px solid ' + palette[0] + ';border-radius:8px;background:' + palette[1] + ';">' +
    '<div style="font-size:11px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:' + palette[0] + ';">' + palette[2] + ' · ' + escapeMarketsAlertHtml_(marketsAlertRuleLabel_(event.type)) + '</div>' +
    '<div style="margin-top:7px;color:#072146;font-size:18px;font-weight:700;line-height:24px;">' + escapeMarketsAlertHtml_(title) + '</div>' +
    '<div style="margin-top:3px;color:#5B6670;font-size:13px;line-height:19px;">' + escapeMarketsAlertHtml_(market) + '</div>' + metrics +
    '<div style="margin-top:12px;padding-top:11px;border-top:1px solid rgba(7,33,70,.12);color:#343A40;font-size:13px;line-height:19px;"><strong style="color:#072146;">Qué significa:</strong> ' + escapeMarketsAlertHtml_(marketsAlertReason_(event)) + '<br><strong style="color:#072146;">Siguiente paso:</strong> ' + escapeMarketsAlertHtml_(marketsAlertRecommendation_(event)) + '</div></div>';
}

function renderMarketsAlertTestCard_(event) {
  const identifier = trimString_(event.ruleId || event.runId || 'PRUEBA');
  const destination = trimString_(event.recipients);
  return '<div style="width:100%;box-sizing:border-box;margin:0 0 12px;padding:18px;border-left:5px solid #277A49;border-radius:8px;background:#F3FAF5;">' +
    '<div style="font-size:11px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:#277A49;">PRUEBA DE ENTREGA · NO ES UNA ALERTA REAL</div>' +
    '<div style="margin-top:7px;color:#072146;font-size:18px;font-weight:700;line-height:24px;">Tu canal privado está listo</div>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px;background:#FFFFFF;border-radius:8px;">' +
    marketsAlertDiagnosticRow_('Identificador', identifier) + marketsAlertDiagnosticRow_('Destino', destination) + '</table>' +
    '<div style="margin-top:16px;padding:15px;border:1px dashed #1973B8;border-radius:8px;background:#FFFFFF;">' +
    '<div style="color:#1464A5;font-size:11px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;">EJEMPLO DE DETALLE · SIMULADO</div>' +
    '<div style="margin-top:6px;color:#072146;font-size:16px;font-weight:700;">BBVA Colombia cae 0,40 puntos</div>' +
    '<div style="margin-top:10px;color:#343A40;font-size:13px;line-height:20px;"><strong>Mercado y plataforma:</strong> Colombia · iOS<br><strong>Periodo:</strong> desde inicio de año<br><strong>Rating:</strong> 4,82 → 4,42 &nbsp; <strong>Caída:</strong> 0,40 pts<br><strong>Límite amarillo:</strong> 0,30 pts &nbsp; <strong>Estado:</strong> advertencia</div>' +
    '<div style="margin-top:10px;color:#5B6670;font-size:12px;line-height:18px;">Las alertas reales mostrarán estos datos con los valores exactos que hayan activado tu regla.</div></div></div>';
}

function marketsAlertDiagnosticRow_(label, value) {
  return '<tr><td style="padding:10px 12px;border-bottom:1px solid #E9E9E9;"><span style="display:block;color:#5B6670;font-size:10px;text-transform:uppercase;">' + escapeMarketsAlertHtml_(label) + '</span><strong style="display:block;margin-top:3px;color:#072146;font-size:12px;line-height:17px;overflow-wrap:anywhere;">' + escapeMarketsAlertHtml_(value) + '</strong></td></tr>';
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
  return '<td width="33.33%" style="padding:12px 9px;text-align:center;"><span style="display:block;color:#5B6670;font-size:10px;text-transform:uppercase;">' + escapeMarketsAlertHtml_(label) + '</span><strong style="display:block;margin-top:3px;color:#072146;font-size:18px;line-height:22px;">' + escapeMarketsAlertHtml_(value) + '</strong><small style="display:block;margin-top:2px;color:#5B6670;font-size:10px;line-height:14px;">' + escapeMarketsAlertHtml_(note) + '</small></td>';
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
    ' puntos supera el límite que has configurado para el nivel ' + limit +
    ' (' + marketsAlertNumberLabel_(event.threshold) + ' puntos).';
}

function marketsAlertRecommendation_(event) {
  if (event.type === 'COMPETITIVE_CROSSOVER') return 'Abre la Visión del VoC por geografías y compara la evolución de BBVA con el competidor en ese mercado.';
  return 'Abre la Visión del VoC por geografías, revisa la evolución de la aplicación y contrasta el movimiento con las valoraciones recientes.';
}

function marketsAlertNumberLabel_(value) {
  const number = Number(value);
  return isFinite(number) ? number.toFixed(2).replace('.', ',') : '—';
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
  const html = HtmlService.createHtmlOutputFromFile('BrandAssets').getContent();
  const match = html.match(/--asset-bbva-logo:url\("data:image\/png;base64,([^"\)]+)"\)/);
  if (!match) throw new Error('No se ha encontrado el logotipo oficial de BBVA para el correo.');
  return { bbvaLogo: Utilities.newBlob(Utilities.base64Decode(match[1]), 'image/png', 'bbva.png') };
}

function escapeMarketsAlertHtml_(value) {
  return trimString_(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
