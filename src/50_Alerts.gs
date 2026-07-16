function buildAndProcessAlerts_(ss, referenceDate, catalog, runId, control) {
  const ratings = readRatingObjects_(ss);
  const catalogByKey = catalog.reduce(function (out, app) { out[app.appKey] = app; return out; }, {});
  const byApp = {};
  ratings.forEach(function (item) {
    if (!item.isBbva) return;
    (byApp[item.appKey] || (byApp[item.appKey] = [])).push(item);
  });
  const existing = readExistingAlertKeys_(ss);
  const events = [];
  Object.keys(byApp).forEach(function (appKey) {
    const series = byApp[appKey].sort(function (a, b) { return a.observedDate - b.observedDate; });
    if (series.length < 2) return;
    const latest = series[series.length - 1];
    const previous = series[series.length - 2];
    if (dateKey_(latest.observedDate) !== dateKey_(referenceDate)) return;
    const config = catalogByKey[appKey];
    if (!config) return;
    const delta = round2_(latest.rating - previous.rating);
    let severity = '';
    if (delta <= -config.criticalDrop) severity = 'CRITICAL';
    else if (delta <= -config.warningDrop) severity = 'WARNING';
    if (!severity) return;
    const eventKey = ['RATING_DROP', dateKey_(referenceDate), appKey, severity].join('|');
    if (existing[eventKey]) return;
    events.push({
      timestamp: new Date(), eventKey: eventKey, referenceDate: referenceDate,
      platform: latest.platform, countryCode: latest.countryCode, type: 'RATING_DROP',
      severity: severity,
      detail: config.appName + ': ' + previous.rating.toFixed(2) + ' -> ' + latest.rating.toFixed(2) + ' (' + delta.toFixed(2) + ')',
      recipients: config.recipients, runId: runId, source: 'AUTOMATED_MONITOR'
    });
  });
  appendAlertEvents_(ss, events);
  if (parseBoolean_(control.SEND_ALERT_EMAILS, false)) sendAlertEmails_(events);
  return events;
}

function readExistingAlertKeys_(ss) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.alerts);
  if (sheet.getLastRow() <= 1) return {};
  return sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues().reduce(function (out, row) {
    const key = trimString_(row[0]);
    if (key) out[key] = true;
    return out;
  }, {});
}

function appendAlertEvents_(ss, events) {
  if (!events.length) return;
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.alerts);
  const rows = events.map(function (event) {
    return [event.timestamp, event.eventKey, event.referenceDate, event.platform, event.countryCode,
      event.type, event.severity, event.detail, event.recipients, event.runId, event.source];
  });
  ensureSheetCapacity_(sheet, sheet.getLastRow() + rows.length, MARKETS_CONFIG.headers.alerts.length);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function sendAlertEmails_(events) {
  const grouped = {};
  events.forEach(function (event) {
    uniqueStrings_(event.recipients.split(/[;,]/)).forEach(function (recipient) {
      (grouped[recipient] || (grouped[recipient] = [])).push(event);
    });
  });
  Object.keys(grouped).forEach(function (recipient) {
    const lines = grouped[recipient].map(function (event) {
      return '[' + event.severity + '] ' + event.platform + ' ' + event.countryCode + ' - ' + event.detail;
    });
    MailApp.sendEmail({
      to: recipient,
      subject: '[Markets Ratings] ' + grouped[recipient].length + ' alerta(s)',
      body: lines.join('\n') + '\n\nRun: ' + grouped[recipient][0].runId
    });
  });
}

