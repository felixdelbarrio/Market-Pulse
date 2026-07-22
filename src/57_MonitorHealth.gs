/** Verifica que el proceso diario termino con datos utilizables y un canal de alertas operativo. */
function checkDailyRatingMonitorHealth() {
  const ss = openMarketsSpreadsheet_();
  ensureWorkbookSchema_(ss);
  const control = readControl_(ss);
  if (!parseBoolean_(control.MONITOR_HEALTH_ENABLED, true)) {
    return { healthy: true, status: 'DISABLED', notified: false };
  }
  const now = new Date();
  const dateKey = Utilities.formatDate(now, trimString_(control.TIME_ZONE) || MARKETS_CONFIG.timeZone, 'yyyy-MM-dd');
  const latest = readLatestRunForHealth_(ss, dateKey);
  const health = evaluateMarketsMonitorHealth_(latest, dateKey);
  health.notified = false;
  if (health.healthy) return health;
  const properties = PropertiesService.getScriptProperties();
  const notificationKey = 'MARKETS_MONITOR_HEALTH_ALERT_' + dateKey;
  if (properties.getProperty(notificationKey)) {
    health.notificationStatus = 'ALREADY_SENT';
    return health;
  }
  const recipient = normalizeMarketsAlertEmail_(trimString_(control.MONITOR_ADMIN_EMAIL) || MARKETS_ALERT_EMAIL.senderAddress);
  const delivery = sendMarketsMonitorHealthEmail_(recipient, health, now);
  properties.setProperty(notificationKey, JSON.stringify({
    sentAt: now.toISOString(), messageId: delivery.messageId, status: health.status
  }));
  health.notified = true;
  health.notificationStatus = 'SENT';
  health.recipient = recipient;
  health.messageId = delivery.messageId;
  return health;
}

function readLatestRunForHealth_(ss, expectedDateKey) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.runs);
  if (!sheet || sheet.getLastRow() <= 1) return null;
  const width = Math.min(sheet.getLastColumn(), MARKETS_CONFIG.headers.runs.length);
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0];
  const indexes = indexHeaders_(headers);
  const count = Math.min(20, sheet.getLastRow() - 1);
  const rows = sheet.getRange(sheet.getLastRow() - count + 1, 1, count, width).getValues();
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    const startedAt = row[indexes.started_at];
    if (!(startedAt instanceof Date)) continue;
    const dateKey = Utilities.formatDate(startedAt, MARKETS_CONFIG.timeZone, 'yyyy-MM-dd');
    if (dateKey !== expectedDateKey) continue;
    return {
      startedAt: startedAt,
      runId: trimString_(row[indexes.run_id]),
      status: trimString_(row[indexes.status]).toUpperCase(),
      appsTotal: toNonNegativeInteger_(row[indexes.apps_total]) || 0,
      appsOk: toNonNegativeInteger_(row[indexes.apps_ok]) || 0,
      rowsUpserted: toNonNegativeInteger_(row[indexes.rows_upserted]) || 0,
      detail: trimString_(row[indexes.detail]),
      alertDeliveryStatus: indexes.alert_delivery_status === undefined ? '' :
        trimString_(row[indexes.alert_delivery_status]).toUpperCase(),
      alertDeliveryDetail: indexes.alert_delivery_detail === undefined ? '' :
        trimString_(row[indexes.alert_delivery_detail])
    };
  }
  return null;
}

function evaluateMarketsMonitorHealth_(run, expectedDateKey) {
  if (!run) {
    return {
      healthy: false, status: 'MISSING', dateKey: expectedDateKey, runId: '',
      reason: 'No existe ninguna ejecucion registrada para la fecha esperada.'
    };
  }
  const dataHealthy = ['OK', 'PARTIAL'].indexOf(run.status) >= 0 &&
    run.appsTotal > 0 && run.appsOk > 0 && run.rowsUpserted > 0;
  const deliveryFailed = ['ERROR', 'PARTIAL'].indexOf(run.alertDeliveryStatus) >= 0;
  if (dataHealthy && !deliveryFailed) {
    return {
      healthy: true, status: 'HEALTHY', dateKey: expectedDateKey, runId: run.runId,
      runStatus: run.status, alertDeliveryStatus: run.alertDeliveryStatus || 'LEGACY'
    };
  }
  const reasons = [];
  if (!dataHealthy) {
    reasons.push('El proceso termino en ' + (run.status || 'estado desconocido') +
      ' con ' + run.appsOk + '/' + run.appsTotal + ' aplicaciones correctas y ' +
      run.rowsUpserted + ' filas actualizadas.');
  }
  if (deliveryFailed) {
    reasons.push('El canal de alertas termino en ' + run.alertDeliveryStatus +
      (run.alertDeliveryDetail ? ': ' + run.alertDeliveryDetail : '.'));
  }
  return {
    healthy: false, status: dataHealthy ? 'ALERT_DELIVERY_FAILED' : 'RUN_FAILED',
    dateKey: expectedDateKey, runId: run.runId, runStatus: run.status,
    alertDeliveryStatus: run.alertDeliveryStatus || 'UNKNOWN', reason: reasons.join(' '),
    detail: run.detail
  };
}

function sendMarketsMonitorHealthEmail_(recipient, health, sentAt) {
  const executor = normalizeEmailForComparison_(Session.getEffectiveUser().getEmail());
  if (!executor) throw new Error('No se puede identificar la cuenta propietaria del trigger de vigilancia.');
  const subject = '[ACCION REQUERIDA] COMMERCIAL · Proceso diario · ' + health.dateKey;
  const reason = trimString_(health.reason || 'La ejecucion diaria necesita revision.');
  const detail = trimString_(health.detail);
  const runId = trimString_(health.runId) || 'sin ejecucion';
  const appUrl = marketsWebAppUrl_();
  const plain = 'BBVA COMMERCIAL - MONITOR TECNICO\n\n' + reason + '\n\nFecha esperada: ' +
    health.dateKey + '\nRun: ' + runId + (detail ? '\nDetalle: ' + detail : '') +
    '\n\nEjecuta runNow() manualmente y revisa RUN_LOG.\n' + appUrl;
  const html = '<!doctype html><html><body style="margin:0;background:#F4F5F6;font-family:Arial,Helvetica,sans-serif;color:#121212;">' +
    '<div style="max-width:620px;margin:24px auto;background:#FFFFFF;border-radius:12px;overflow:hidden;">' +
    '<div style="padding:22px 26px;background:#072146;color:#FFFFFF;"><div style="color:#5AC4C4;font-size:11px;font-weight:700;letter-spacing:.8px;">COMMERCIAL · MONITOR TECNICO</div><h1 style="margin:8px 0 0;font-size:24px;line-height:30px;">El proceso diario necesita revisión</h1></div>' +
    '<div style="padding:24px 26px;"><p style="margin:0 0 18px;line-height:22px;">' + escapeMarketsAlertHtml_(reason) + '</p>' +
    '<div style="padding:14px 16px;border-left:4px solid #B92A45;background:#F9E9ED;font-size:13px;line-height:20px;"><strong>Fecha esperada:</strong> ' + escapeMarketsAlertHtml_(health.dateKey) + '<br><strong>Run:</strong> ' + escapeMarketsAlertHtml_(runId) + (detail ? '<br><strong>Detalle:</strong> ' + escapeMarketsAlertHtml_(detail) : '') + '</div>' +
    '<p style="margin:20px 0 0;font-size:14px;line-height:21px;">Ejecuta <strong>runNow()</strong> manualmente y revisa <strong>RUN_LOG</strong>.</p>' +
    '<p style="margin:18px 0 0;"><a href="' + escapeMarketsAlertHtml_(appUrl) + '" style="color:#1464A5;font-weight:700;">Ir a la aplicación</a></p>' +
    '<p style="margin:18px 0 0;color:#7C8893;font-size:10px;line-height:15px;">Comprobación automática ' + escapeMarketsAlertHtml_(marketsAlertDateLabel_(sentAt)) + ' · aviso único por día.</p></div></div></body></html>';
  const token = Utilities.getUuid().replace(/-/g, '');
  const boundary = 'bbva_health_' + token;
  const crlf = '\r\n';
  const mime = [
    'From: ' + marketsAlertEncodedHeader_('BBVA VoC Commercial · Monitor técnico') + ' <' + executor + '>',
    'To: ' + recipient,
    'Reply-To: ' + recipient,
    'Subject: ' + marketsAlertEncodedHeader_(subject),
    'Date: ' + sentAt.toUTCString(),
    'Message-ID: <' + token + '@voc-commercial.bbva.com>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + boundary + '"', '',
    '--' + boundary, 'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64', '', marketsAlertMimeText_(plain),
    '--' + boundary, 'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64', '', marketsAlertMimeText_(html),
    '--' + boundary + '--', ''
  ].join(crlf);
  const accepted = Gmail.Users.Messages.send({
    raw: Utilities.base64EncodeWebSafe(mime, Utilities.Charset.UTF_8).replace(/=+$/g, '')
  }, 'me');
  if (!accepted || !trimString_(accepted.id)) {
    throw new Error('Gmail no ha aceptado el aviso operativo dirigido a ' + recipient + '.');
  }
  return { recipient: recipient, messageId: trimString_(accepted.id), threadId: trimString_(accepted.threadId) };
}

function sendMarketsMonitorHealthTestEmail() {
  const ss = openMarketsSpreadsheet_();
  ensureWorkbookSchema_(ss);
  const control = readControl_(ss);
  const now = new Date();
  const dateKey = Utilities.formatDate(now, MARKETS_CONFIG.timeZone, 'yyyy-MM-dd');
  const recipient = normalizeMarketsAlertEmail_(trimString_(control.MONITOR_ADMIN_EMAIL) || MARKETS_ALERT_EMAIL.senderAddress);
  const health = {
    healthy: false, status: 'TEST', dateKey: dateKey, runId: 'PRUEBA-MONITOR',
    reason: 'Prueba del canal de vigilancia. No existe una incidencia real.', detail: ''
  };
  return sendMarketsMonitorHealthEmail_(recipient, health, now);
}
