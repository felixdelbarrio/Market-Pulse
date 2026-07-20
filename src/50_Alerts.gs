/** Evalua alertas personalizadas y envia un unico resumen BBVA por usuario. */
function buildAndProcessAlerts_(ss, referenceDate, catalog, runId, control, ratingObjects) {
  const ratings = ratingObjects || readRatingObjects_(ss);
  migrateLegacyAlertRecipients_(ss, catalog);
  const subscribers = readAllMarketsAlertPreferences_(ss).filter(function (item) { return item.active; });
  const existing = readExistingAlertKeys_(ss);
  const catalogByKey = (catalog || []).reduce(function (out, app) { out[app.appKey] = app; return out; }, {});
  let events = [];
  subscribers.forEach(function (preferences) {
    events = events.concat(buildRatingDropAlerts_(ratings, referenceDate, preferences, catalogByKey, existing));
    events = events.concat(buildCompetitiveCrossoverAlerts_(ratings, referenceDate, preferences, catalogByKey, existing));
  });
  events.forEach(function (event) { event.runId = runId; });
  appendAlertEvents_(ss, events);
  events.deliveryCount = parseBoolean_(control.SEND_ALERT_EMAILS, false) ? sendAlertEmails_(events, ss) : 0;
  events.subscriberCount = subscribers.length;
  return events;
}

function buildRatingDropAlerts_(ratings, referenceDate, preferences, catalogByKey, existing) {
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
        runId: '', source: 'SELF_SERVICE_ALERTS'
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
        runId: '', source: 'SELF_SERVICE_ALERTS'
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
  const inlineImages = buildMarketsAlertInlineImages_();
  Object.keys(grouped).forEach(function (recipient) {
    const recipientEvents = grouped[recipient];
    MailApp.sendEmail({
      to: recipient,
      subject: marketsAlertEmailSubject_(recipientEvents),
      body: renderMarketsAlertPlainText_(recipientEvents),
      htmlBody: renderMarketsAlertEmail_(recipientEvents),
      inlineImages: inlineImages,
      name: 'BBVA Markets Data Studio'
    });
    if (ss) touchMarketsAlertTimestamp_(ss, recipient, 'LAST_DELIVERY_AT', new Date());
  });
  return Object.keys(grouped).length;
}

function marketsAlertEmailSubject_(events) {
  const critical = (events || []).filter(function (event) { return event.severity === 'CRITICAL'; }).length;
  const prefix = critical ? '[CRÍTICO]' : '[ALERTA]';
  return prefix + ' Markets Data Studio - ' + events.length + ' movimiento' + (events.length === 1 ? '' : 's');
}

function renderMarketsAlertPlainText_(events) {
  const lines = (events || []).map(function (event) {
    return '[' + event.severity + '] ' + event.platform + ' ' + event.countryCode + ' - ' + event.detail;
  });
  return 'BBVA Markets Data Studio\n\n' + lines.join('\n') + '\n\nConfigura tus alertas desde la aplicación.';
}

function renderMarketsAlertEmail_(events) {
  const critical = (events || []).filter(function (event) { return event.severity === 'CRITICAL'; }).length;
  const warning = (events || []).filter(function (event) { return event.severity === 'WARNING'; }).length;
  const positive = (events || []).filter(function (event) { return event.severity === 'POSITIVE'; }).length;
  const cards = (events || []).map(renderMarketsAlertEmailCard_).join('');
  const appUrl = trimString_(ScriptApp.getService().getUrl());
  const cta = appUrl ? '<a href="' + escapeMarketsAlertHtml_(appUrl) + '" style="display:inline-block;padding:13px 22px;border-radius:8px;background:#1464A5;color:#FFFFFF;text-decoration:none;font-weight:700;">Revisar y configurar alertas</a>' : '';
  return '<!doctype html><html><body style="margin:0;background:#F4F5F6;font-family:\'Benton Sans BBVA\',Arial,Helvetica,sans-serif;color:#121212;">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F5F6;"><tr><td align="center" style="padding:28px 12px;">' +
    '<table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background:#FFFFFF;border-radius:16px;overflow:hidden;">' +
    '<tr><td style="padding:24px 28px;background:#072146;"><img src="cid:bbvaLogo" width="92" alt="BBVA" style="display:block;width:92px;height:auto;"><div style="margin-top:22px;color:#5AC4C4;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Markets Data Studio</div><h1 style="margin:8px 0 0;color:#FFFFFF;font-size:28px;line-height:34px;">Tu pulso de mercado requiere atención</h1><p style="margin:10px 0 0;color:#B6D5F5;font-size:15px;line-height:22px;">Resumen privado generado tras la última actualización de ratings.</p></td></tr>' +
    '<tr><td style="padding:22px 28px 8px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>' +
    marketsAlertSummaryCell_('Críticas', critical, '#B92A45', '#F9E9ED') +
    marketsAlertSummaryCell_('Advertencias', warning, '#946200', '#FFF4CC') +
    marketsAlertSummaryCell_('Positivas', positive, '#277A49', '#E6F4EA') +
    '</tr></table></td></tr>' +
    '<tr><td style="padding:14px 28px 8px;">' + cards + '</td></tr>' +
    '<tr><td style="padding:18px 28px 30px;">' + cta + '<p style="margin:18px 0 0;color:#5B6670;font-size:12px;line-height:18px;">Este correo contiene solo las alertas configuradas para tu cuenta. Las preferencias de otros usuarios no son visibles.</p></td></tr>' +
    '<tr><td style="padding:16px 28px;background:#061B36;color:#B6D5F5;font-size:11px;line-height:17px;"><strong style="color:#FFFFFF;">BBVA Markets Data Studio</strong><br>Ratings y valoraciones públicas de las stores.</td></tr>' +
    '</table></td></tr></table></body></html>';
}

function marketsAlertSummaryCell_(label, value, color, background) {
  return '<td width="33.33%" style="padding:0 5px;"><div style="padding:14px;border-radius:8px;background:' + background + ';color:' + color + ';text-align:center;"><strong style="display:block;font-size:22px;line-height:26px;">' + value + '</strong><span style="font-size:11px;font-weight:700;text-transform:uppercase;">' + label + '</span></div></td>';
}

function renderMarketsAlertEmailCard_(event) {
  const palette = event.severity === 'CRITICAL' ? ['#B92A45', '#F9E9ED', 'Critico'] :
    event.severity === 'WARNING' ? ['#946200', '#FFF4CC', 'Advertencia'] : ['#277A49', '#E6F4EA', 'Movimiento positivo'];
  const market = [event.countryCode, event.platform].filter(Boolean).join(' - ');
  return '<div style="margin:0 0 12px;padding:18px;border-left:5px solid ' + palette[0] + ';border-radius:8px;background:' + palette[1] + ';">' +
    '<div style="font-size:11px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:' + palette[0] + ';">' + palette[2] + ' - ' + escapeMarketsAlertHtml_(market) + '</div>' +
    '<div style="margin-top:7px;color:#072146;font-size:16px;font-weight:700;line-height:22px;">' + escapeMarketsAlertHtml_(marketsAlertRuleLabel_(event.type)) + '</div>' +
    '<div style="margin-top:5px;color:#343A40;font-size:14px;line-height:21px;">' + escapeMarketsAlertHtml_(event.detail) + '</div></div>';
}

function marketsAlertRuleLabel_(type) {
  return type === 'RATING_DROP_DAILY' ? 'Caída diaria del rating' :
    type === 'RATING_DROP_MTD' ? 'Caída desde inicio de mes' :
    type === 'RATING_DROP_YTD' ? 'Caída desde inicio de año' :
    type === 'COMPETITIVE_CROSSOVER' ? 'Cruce de posición competitiva' :
    type === 'TEST' ? 'Correo de prueba' : type;
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
