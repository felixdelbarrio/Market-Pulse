/**
 * Newsletter mensual ejecutiva de Market Pulse.
 *
 * Se genera por destinatario y respeta sus mercados y plataformas. Solo usa
 * observaciones reales. Los volúmenes Android compartidos no se atribuyen a
 * una geografía y el efecto de nuevas valoraciones se oculta si el redondeo
 * impide una estimación defendible.
 */

function runMarketsMonthlyNewsletter() {
  const now = new Date();
  const day = Number(Utilities.formatDate(now, MARKETS_CONFIG.timeZone, 'd'));
  if (day !== 1) return { status: 'SKIPPED_NOT_MONTH_START', sent: 0 };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(MARKETS_CONFIG.lockTimeoutMs)) {
    throw new Error('Otra ejecución de comunicaciones sigue activa.');
  }
  try {
    const ss = openMarketsSpreadsheet_();
    ensureWorkbookSchema_(ss);
    const control = readControl_(ss);
    if (!marketsNewsletterDeliveryEnabled_(control)) {
      return { status: 'DISABLED', sent: 0 };
    }
    const period = marketsPreviousMonthKey_(now);
    return sendMarketsMonthlyNewsletter_(ss, period, false);
  } finally {
    lock.releaseLock();
  }
}

function sendMarketsMonthlyNewsletter_(ss, period, isTest) {
  const subscribers = readAllMarketsAlertPreferences_(ss).filter(function (item) { return item.active; });
  const ratings = readRatingObjects_(ss);
  const catalog = readAppCatalog_(ss);
  const existing = readExistingAlertKeys_(ss);
  const sender = requireMarketsAlertSender_(ss);
  const images = buildMarketsAlertInlineImages_();
  const result = { status: 'NOT_REQUIRED', period: period, subscribers: subscribers.length,
    sent: 0, skipped: 0, failures: [] };
  const acceptedEvents = [];
  subscribers.forEach(function (preferences) {
    const eventKey = ['NEWSLETTER_MONTHLY', period, preferences.email].join('|');
    if (!isTest && existing[eventKey]) {
      result.skipped += 1;
      return;
    }
    try {
      const model = buildMarketsNewsletterModel_(ratings, catalog, preferences, period, {
        isTest: Boolean(isTest)
      });
      const message = marketsNewsletterEmailMessage_(preferences.email, model, images, sender);
      const accepted = Gmail.Users.Messages.send({ raw: message.raw }, 'me');
      if (!accepted || !trimString_(accepted.id)) throw new Error('Gmail no ha devuelto un identificador de mensaje.');
      result.sent += 1;
      acceptedEvents.push(marketsNewsletterAuditEvent_(preferences.email, model, eventKey,
        isTest ? 'NEWSLETTER_TEST' : 'MONTHLY_NEWSLETTER'));
      try { touchMarketsAlertTimestamp_(ss, preferences.email, 'LAST_DELIVERY_AT', new Date()); }
      catch (auditError) {
        console.error('Newsletter aceptada para ' + preferences.email +
          ', pero falló LAST_DELIVERY_AT: ' + errorToString_(auditError));
      }
    } catch (error) {
      result.failures.push({ recipient: preferences.email, error: errorToString_(error) });
    }
  });
  appendAlertEvents_(ss, acceptedEvents);
  result.status = result.failures.length ? (result.sent ? 'PARTIAL' : 'ERROR') :
    (result.sent ? 'DELIVERED' : 'NOT_REQUIRED');
  return result;
}

function sendMarketsNewsletterTestEmail() {
  const email = currentMarketsUserEmail_();
  const ss = openMarketsSpreadsheet_();
  requireMarketsNewsletterContracts_(ss);
  const control = readControl_(ss);
  if (!marketsNewsletterDeliveryEnabled_(control)) {
    throw new Error('El envío de newsletters está desactivado en CONTROL.');
  }
  const preferences = readMarketsAlertPreferences_(ss, email);
  return sendMarketsNewsletterPreview_(ss, email, preferences, email);
}

function sendMarketsAdminNewsletterTestEmail(targetEmail) {
  const access = requireMarketsAdministrator_();
  requireMarketsNewsletterContracts_(access.ss);
  const target = normalizeMarketsAlertEmail_(targetEmail);
  if (!marketsNewsletterDeliveryEnabled_(access.control)) {
    throw new Error('El envío de newsletters está desactivado en CONTROL.');
  }
  const preferences = readMarketsAlertPreferences_(access.ss, target);
  if (!preferences.persisted) throw new Error('El destinatario seleccionado no está dado de alta.');
  return sendMarketsNewsletterPreview_(access.ss, access.email, preferences, target);
}

function requireMarketsNewsletterContracts_(ss) {
  [
    [MARKETS_CONFIG.sheets.control, MARKETS_CONFIG.headers.control],
    [MARKETS_CONFIG.sheets.catalog, MARKETS_CONFIG.headers.catalog],
    [MARKETS_CONFIG.sheets.ratings, MARKETS_CONFIG.headers.ratings],
    [MARKETS_CONFIG.sheets.alerts, MARKETS_CONFIG.headers.alerts],
    [MARKETS_CONFIG.sheets.alertPreferences, MARKETS_CONFIG.headers.alertPreferences]
  ].forEach(function (definition) {
    requireCurrentSheetContract_(ss, definition[0], definition[1]);
  });
}

function sendMarketsNewsletterPreview_(ss, recipient, preferences, configuredFor) {
  const ratings = readRatingObjects_(ss);
  const catalog = readAppCatalog_(ss);
  const period = latestMarketsNewsletterPeriod_(ratings, preferences);
  if (!period) throw new Error('No hay cierres reales disponibles para el ámbito configurado.');
  const model = buildMarketsNewsletterModel_(ratings, catalog, preferences, period, {
    isTest: true, configuredFor: recipient
  });
  const sender = requireMarketsAlertSender_(ss);
  const message = marketsNewsletterEmailMessage_(recipient, model, buildMarketsAlertInlineImages_(), sender);
  const accepted = Gmail.Users.Messages.send({ raw: message.raw }, 'me');
  if (!accepted || !trimString_(accepted.id)) throw new Error('Gmail no ha devuelto un identificador de mensaje.');
  const deliveryId = 'NEWS-' + Utilities.formatDate(new Date(), MARKETS_CONFIG.timeZone, 'yyyyMMdd-HHmmss') +
    '-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  appendAlertEvents_(ss, [marketsNewsletterAuditEvent_(recipient, model,
    'NEWSLETTER_TEST|' + deliveryId + '|' + recipient, 'NEWSLETTER_TEST')]);
  return {
    sent: true, accepted: true, recipient: recipient, configuredFor: configuredFor,
    period: period, deliveryId: deliveryId, messageId: trimString_(accepted.id),
    threadId: trimString_(accepted.threadId), realData: true,
    scopeType: model.scope.type, auditLogged: true, senderName: sender.name,
    senderAddress: sender.address, codeVersion: MARKETS_CONFIG.codeVersion, webVersion: MARKETS_WEB.version
  };
}

function marketsNewsletterDeliveryEnabled_(control) {
  const configured = control && control.SEND_NEWSLETTER_EMAILS;
  return configured === undefined || configured === '' ?
    parseBoolean_(control && control.SEND_ALERT_EMAILS, false) : parseBoolean_(configured, false);
}

function marketsPreviousMonthKey_(date) {
  const local = new Date(date.getTime());
  local.setDate(1);
  local.setMonth(local.getMonth() - 1);
  return dateKey_(local).slice(0, 7);
}

function latestMarketsNewsletterPeriod_(ratings, preferences) {
  return (ratings || []).filter(function (item) {
    return item.isBbva && item.observedDate instanceof Date && item.rating !== null &&
      marketsAlertScopeMatches_(preferences, item);
  }).map(function (item) {
    return dateKey_(item.observedDate).slice(0, 7);
  }).sort().pop() || '';
}

function buildMarketsNewsletterModel_(ratings, catalog, preferences, period, options) {
  if (!/^\d{4}-\d{2}$/.test(trimString_(period))) throw new Error('Periodo de newsletter no válido.');
  const scopedCatalog = (catalog || []).filter(function (app) {
    return app.isBbva && (app.marketSegment || 'BANK') === 'BANK' &&
      marketsAlertScopeMatches_(preferences, app);
  });
  const volumeMetadata = marketsNewsletterVolumeMetadata_(catalog);
  const year = period.slice(0, 4);
  const scopedRatings = (ratings || []).filter(function (item) {
    return item.observedDate instanceof Date && item.rating !== null &&
      marketsAlertScopeMatches_(preferences, item) &&
      (item.marketSegment || 'BANK') === 'BANK';
  });
  const byApp = scopedRatings.reduce(function (out, item) {
    (out[item.appKey] || (out[item.appKey] = [])).push(item);
    return out;
  }, {});
  const items = scopedCatalog.map(function (app) {
    const series = (byApp[app.appKey] || []).slice().sort(function (a, b) {
      return a.observedDate.getTime() - b.observedDate.getTime();
    });
    const monthRows = series.filter(function (item) {
      return dateKey_(item.observedDate).slice(0, 7) === period;
    });
    if (!monthRows.length) return null;
    const monthStart = monthRows[0];
    const end = monthRows[monthRows.length - 1];
    const yearRows = series.filter(function (item) {
      const key = dateKey_(item.observedDate);
      return key.slice(0, 4) === year && key <= dateKey_(end.observedDate);
    });
    const yearStart = yearRows[0] || null;
    const metadata = volumeMetadata[app.appKey] || { key: app.appKey, shared: false, markets: 1 };
    const position = marketsNewsletterPosition_(scopedRatings, catalog, app, period);
    const newReviews = marketsNewsletterCountDelta_(monthStart, end);
    const volumeAvailable = !metadata.shared;
    return {
      appKey: app.appKey, countryCode: app.countryCode, country: app.country,
      platform: app.platform, monthStartRating: monthStart.rating, endRating: end.rating,
      yearStartRating: yearStart ? yearStart.rating : null,
      monthDelta: round2_(end.rating - monthStart.rating),
      yearDelta: yearStart ? round2_(end.rating - yearStart.rating) : null,
      newReviews: volumeAvailable ? newReviews : null,
      volumeAvailable: volumeAvailable, volumeKey: metadata.key,
      sharedMarkets: metadata.markets, startCount: monthStart.ratingCount,
      endCount: end.ratingCount, startDate: monthStart.observedDate,
      endDate: end.observedDate, position: position,
      effect: volumeAvailable ? marketsNewsletterReviewEffect_(monthStart, end) : null
    };
  }).filter(Boolean);
  if (!items.length) throw new Error('No hay cierres BBVA reales para ' + period + ' en el ámbito configurado.');
  const observedKeys = items.reduce(function (out, item) { out[item.appKey] = true; return out; }, {});
  const missing = scopedCatalog.filter(function (app) { return !observedKeys[app.appKey]; })
    .map(function (app) {
      return { appKey: app.appKey, country: app.country, countryCode: app.countryCode, platform: app.platform };
    });
  const countries = uniqueStrings_(items.map(function (item) { return item.countryCode; }));
  const allCountries = preferences.countries.indexOf('ALL') >= 0;
  const scopeType = allCountries ? 'ALL' : preferences.countries.length === 1 ? 'SINGLE' : 'MULTI';
  const totals = marketsNewsletterTotals_(items, scopeType);
  const movements = items.filter(function (item) { return item.monthDelta !== null; })
    .sort(function (a, b) { return b.monthDelta - a.monthDelta; });
  return {
    period: period, periodLabel: marketsNewsletterPeriodLabel_(period),
    generatedAt: new Date(), isTest: Boolean(options && options.isTest),
    configuredFor: trimString_(options && options.configuredFor) || preferences.email,
    scope: {
      type: scopeType, countries: countries,
      countryLabel: countries.length === 1 ? items[0].country : '',
      platformLabel: preferences.platforms.indexOf('ALL') >= 0 ?
        'Todas las plataformas' : preferences.platforms.join(', ')
    },
    items: items, totals: totals,
    coverage: {
      observed: items.length, expected: scopedCatalog.length,
      complete: missing.length === 0, missing: missing
    },
    strongest: movements.length ? movements[0] : null,
    weakest: movements.length ? movements[movements.length - 1] : null
  };
}

function marketsNewsletterVolumeMetadata_(catalog) {
  const marketsByKey = {};
  (catalog || []).filter(function (app) { return app.platform === 'Android' && app.isBbva; })
    .forEach(function (app) {
      const key = 'ANDROID|' + (trimString_(app.packageName).toLowerCase() || app.appKey);
      (marketsByKey[key] || (marketsByKey[key] = {}))[app.countryCode] = true;
    });
  return (catalog || []).reduce(function (out, app) {
    const key = app.platform === 'Android' ?
      'ANDROID|' + (trimString_(app.packageName).toLowerCase() || app.appKey) :
      [app.platform.toUpperCase(), app.countryCode, app.appId || app.appKey].join('|');
    const markets = app.platform === 'Android' ? Object.keys(marketsByKey[key] || {}).length : 1;
    out[app.appKey] = { key: key, shared: app.platform === 'Android' && markets > 1, markets: Math.max(1, markets) };
    return out;
  }, {});
}

function marketsNewsletterPosition_(ratings, catalog, app, period) {
  const expected = (catalog || []).filter(function (candidate) {
    return candidate.enabled !== false && (candidate.marketSegment || 'BANK') === 'BANK' &&
      candidate.countryCode === app.countryCode && candidate.platform === app.platform;
  });
  const latestByApp = {};
  (ratings || []).filter(function (item) {
    return item.countryCode === app.countryCode && item.platform === app.platform &&
      (item.marketSegment || 'BANK') === 'BANK' &&
      dateKey_(item.observedDate).slice(0, 7) === period;
  }).forEach(function (item) {
    const current = latestByApp[item.appKey];
    if (!current || item.observedDate.getTime() > current.observedDate.getTime()) latestByApp[item.appKey] = item;
  });
  const rows = expected.map(function (candidate) { return latestByApp[candidate.appKey] || null; })
    .filter(function (item) { return item && item.rating !== null; });
  const bbva = latestByApp[app.appKey];
  if (!bbva || rows.length !== expected.length) {
    return { available: false, observed: rows.length, expected: expected.length };
  }
  const rank = 1 + rows.filter(function (item) { return item.rating > bbva.rating; }).length;
  const leader = rows.slice().sort(function (a, b) { return b.rating - a.rating; })[0];
  return {
    available: true, rank: rank, total: rows.length,
    leader: leader ? leader.appName : '', gapToLeader: leader ? round2_(bbva.rating - leader.rating) : null
  };
}

function marketsNewsletterCountDelta_(start, end) {
  const first = toFiniteNumber_(start && start.ratingCount);
  const last = toFiniteNumber_(end && end.ratingCount);
  if (first === null || last === null || last < first) return null;
  return Math.round(last - first);
}

function marketsNewsletterReviewEffect_(start, end) {
  const startRating = toFiniteNumber_(start && start.rating);
  const endRating = toFiniteNumber_(end && end.rating);
  const startCount = toFiniteNumber_(start && start.ratingCount);
  const endCount = toFiniteNumber_(end && end.ratingCount);
  if ([startRating, endRating, startCount, endCount].some(function (value) { return value === null; })) return null;
  const newReviews = endCount - startCount;
  if (newReviews <= 0) return null;
  const rating = (endCount * endRating - startCount * startRating) / newReviews;
  const uncertainty = (endCount * marketsNewsletterRatingHalfStep_(endRating) +
    startCount * marketsNewsletterRatingHalfStep_(startRating)) / newReviews;
  if (rating < 1 || rating > 5 || uncertainty > 0.5) return null;
  return { newReviewRating: Math.round(rating * 100) / 100,
    ratingImpact: round2_(endRating - startRating), uncertainty: Math.round(uncertainty * 100) / 100 };
}

function marketsNewsletterRatingHalfStep_(rating) {
  return Math.abs(rating * 10 - Math.round(rating * 10)) < 0.000001 ? 0.05 : 0.005;
}

function marketsNewsletterTotals_(items, scopeType) {
  const uniqueVolumes = {};
  (items || []).forEach(function (item) {
    let reviews = item.newReviews;
    if (!item.volumeAvailable && scopeType === 'ALL') {
      reviews = marketsNewsletterRawCountDelta_(item.startCount, item.endCount);
    }
    if (reviews === null) return;
    const current = uniqueVolumes[item.volumeKey];
    if (!current || reviews > current.value) {
      uniqueVolumes[item.volumeKey] = { value: reviews, platform: item.platform };
    }
  });
  const byPlatform = Object.keys(uniqueVolumes).reduce(function (out, key) {
    const item = uniqueVolumes[key];
    out[item.platform] = (out[item.platform] || 0) + item.value;
    return out;
  }, {});
  return {
    series: items.length,
    improving: items.filter(function (item) { return item.monthDelta > 0; }).length,
    declining: items.filter(function (item) { return item.monthDelta < 0; }).length,
    stable: items.filter(function (item) { return item.monthDelta === 0; }).length,
    newReviews: Object.keys(uniqueVolumes).length ?
      Object.keys(uniqueVolumes).reduce(function (sum, key) { return sum + uniqueVolumes[key].value; }, 0) : null,
    reviewsByPlatform: byPlatform,
    effects: items.filter(function (item) { return Boolean(item.effect); }).length,
    scopeType: scopeType
  };
}

function marketsNewsletterRawCountDelta_(startCount, endCount) {
  const first = toFiniteNumber_(startCount);
  const last = toFiniteNumber_(endCount);
  return first === null || last === null || last < first ? null : Math.round(last - first);
}

function marketsNewsletterEmailMessage_(recipient, model, inlineImages, sender) {
  const subject = (model.isTest ? '[PRUEBA] ' : '') + 'Market Pulse · Cierre ' +
    model.periodLabel + ' · ' + marketsNewsletterScopeTitle_(model);
  const plain = renderMarketsNewsletterPlainText_(model);
  const html = renderMarketsNewsletterHtml_(model);
  const image = inlineImages && inlineImages.bbvaLogo;
  if (!image || typeof image.getBytes !== 'function') throw new Error('No se ha podido incorporar el logotipo oficial.');
  const token = Utilities.getUuid().replace(/-/g, '');
  const related = 'market_pulse_news_related_' + token;
  const alternative = 'market_pulse_news_alt_' + token;
  const crlf = '\r\n';
  const mime = [
    'From: ' + marketsAlertEncodedHeader_(sender.name) + ' <' + sender.address + '>',
    'To: ' + normalizeMarketsAlertEmail_(recipient),
    'Subject: ' + marketsAlertEncodedHeader_(subject),
    'Date: ' + new Date().toUTCString(),
    'Message-ID: <' + token + '@voc-commercial.bbva.com>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/related; boundary="' + related + '"', '',
    '--' + related, 'Content-Type: multipart/alternative; boundary="' + alternative + '"', '',
    '--' + alternative, 'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64', '', marketsAlertMimeText_(plain),
    '--' + alternative, 'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64', '', marketsAlertMimeText_(html),
    '--' + alternative + '--', '',
    '--' + related, 'Content-Type: image/png; name="bbva-bei.png"',
    'Content-Transfer-Encoding: base64', 'Content-ID: <bbvaLogo>',
    'Content-Disposition: inline; filename="bbva-bei.png"', '',
    marketsAlertMimeBytes_(image.getBytes()), '--' + related + '--', ''
  ].join(crlf);
  return { raw: Utilities.base64EncodeWebSafe(mime, Utilities.Charset.UTF_8).replace(/=+$/g, ''),
    subject: subject, recipient: recipient };
}

function renderMarketsNewsletterPlainText_(model) {
  const lines = model.items.map(function (item) {
    return [item.country, item.platform].join(' · ') + ': ' +
      marketsNewsletterRatingLabel_(item.monthStartRating) + ' → ' +
      marketsNewsletterRatingLabel_(item.endRating) + ' (' +
      marketsNewsletterSigned_(item.monthDelta) + ' mes; ' +
      marketsNewsletterSigned_(item.yearDelta) + ' año) · ' +
      (item.newReviews === null ? 'valoraciones N/D' : marketsAlertIntegerLabel_(item.newReviews) + ' valoraciones') +
      ' · ' + marketsNewsletterPositionLabel_(item.position);
  });
  return 'MARKET PULSE\nBBVA Banca de Empresas e Instituciones\n\n' +
    (model.isTest ? 'VISTA PREVIA CON DATOS REALES — NO ES UN ENVÍO MENSUAL\n' : '') +
    'Cierre ejecutivo · ' + model.periodLabel + '\n' + marketsNewsletterScopeTitle_(model) + '\n\n' +
    marketsNewsletterExecutiveNarrative_(model) +
    (model.coverage && !model.coverage.complete ? '\nCobertura de cierre: ' +
      model.coverage.observed + ' de ' + model.coverage.expected +
      ' series; se omiten las series sin dato real.' : '') +
    '\n\n' + lines.join('\n') +
    '\n\n' + marketsWebAppUrl_();
}

function renderMarketsNewsletterHtml_(model) {
  const groups = marketsNewsletterGroups_(model.items);
  const scopeTitle = marketsNewsletterScopeTitle_(model);
  const preview = model.isTest ?
    '<tr><td style="padding:12px 24px;background:#FFE761;color:#070E46;font-size:12px;font-weight:700;text-align:center;">VISTA PREVIA · DATOS REALES · NO ES UN ENVÍO MENSUAL</td></tr>' : '';
  const groupHtml = groups.map(function (group) {
    const rows = group.items.map(marketsNewsletterRowHtml_).join('');
    return '<tr><td style="padding:8px 26px 20px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #CAD1D8;border-radius:10px;overflow:hidden;">' +
      '<tr><td colspan="2" style="padding:13px 16px;background:#070E46;color:#FFFFFF;font-size:15px;font-weight:700;">' +
      escapeMarketsAlertHtml_(group.country) + '</td></tr>' + rows + '</table></td></tr>';
  }).join('');
  const platformVolumes = Object.keys(model.totals.reviewsByPlatform || {}).sort().map(function (platform) {
    return '<span style="display:inline-block;margin:0 6px 6px 0;padding:7px 10px;border-radius:999px;background:#EAFBFA;color:#070E46;font-size:11px;"><strong>' +
      escapeMarketsAlertHtml_(platform) + '</strong> · ' +
      escapeMarketsAlertHtml_(marketsAlertIntegerLabel_(model.totals.reviewsByPlatform[platform])) +
      '</span>';
  }).join('');
  const coverage = model.coverage && !model.coverage.complete ?
    '<tr><td style="padding:0 26px 18px;"><div style="padding:12px 14px;border-radius:8px;background:#FFF4CC;color:#6B4F00;font-size:12px;line-height:18px;"><strong>Cobertura de cierre: ' +
    escapeMarketsAlertHtml_(model.coverage.observed + ' de ' + model.coverage.expected) +
    ' series.</strong> Las series sin dato real se han omitido; no se han estimado.</div></td></tr>' : '';
  const effectItems = model.items.filter(function (item) { return Boolean(item.effect); });
  const effects = effectItems.length ? '<tr><td style="padding:4px 26px 22px;"><div style="padding:18px;border-radius:10px;background:#EAFBFA;">' +
    '<div style="color:#001391;font-size:11px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;">EFECTO ESTIMADO DE LAS NUEVAS VALORACIONES</div>' +
    effectItems.slice(0, 5).map(function (item) {
      return '<div style="padding-top:11px;color:#46536D;font-size:13px;line-height:19px;"><strong style="color:#070E46;">' +
        escapeMarketsAlertHtml_(item.country + ' · ' + item.platform) + ':</strong> ' +
        marketsNewsletterRatingLabel_(item.effect.newReviewRating) + '/5 en las nuevas valoraciones · impacto ' +
        escapeMarketsAlertHtml_(marketsNewsletterSigned_(item.effect.ratingImpact)) + ' puntos.</div>';
    }).join('') + '</div></td></tr>' : '';
  const appUrl = escapeMarketsAlertHtml_(marketsWebAppLoginUrl_(model.configuredFor || ''));
  return '<!doctype html><html><body style="margin:0;background:#F7F8F8;font-family:\'BBVABentonSans\',\'Benton Sans BBVA\',Arial,Helvetica,sans-serif;color:#000519;">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F7F8F8;"><tr><td align="center" style="padding:28px 10px;">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:720px;background:#FFFFFF;border-radius:16px;overflow:hidden;">' +
    preview +
    '<tr><td style="padding:26px 30px;background:#001391;color:#FFFFFF;"><img src="cid:bbvaLogo" width="168" alt="BBVA Banca de Empresas e Instituciones" style="display:block;width:168px;height:auto;">' +
    '<div style="margin-top:24px;color:#8BE1E9;font-size:11px;font-weight:700;letter-spacing:1px;">MARKET PULSE · CIERRE MENSUAL</div>' +
    '<h1 style="margin:8px 0 0;font-family:Georgia,serif;font-size:31px;line-height:37px;">' +
    escapeMarketsAlertHtml_(model.periodLabel) + '</h1><p style="margin:9px 0 0;color:#85C8FF;font-size:15px;line-height:22px;">' +
    escapeMarketsAlertHtml_(scopeTitle) + '</p></td></tr>' +
    '<tr><td style="padding:24px 30px 12px;"><div style="font-family:Georgia,serif;color:#070E46;font-size:22px;line-height:29px;">' +
    escapeMarketsAlertHtml_(marketsNewsletterExecutiveNarrative_(model)) + '</div></td></tr>' +
    '<tr><td style="padding:10px 26px 22px;"><table role="presentation" width="100%" cellspacing="8" cellpadding="0"><tr>' +
    marketsNewsletterKpiHtml_('Mejoran', model.totals.improving, 'de ' + model.totals.series + ' series') +
    marketsNewsletterKpiHtml_('Retroceden', model.totals.declining, model.totals.stable + ' estables') +
    marketsNewsletterKpiHtml_('Valoraciones', model.totals.newReviews === null ? 'N/D' :
      marketsAlertIntegerLabel_(model.totals.newReviews),
      model.scope.type === 'ALL' ? 'volumen consolidado' : 'volumen atribuible') +
    '</tr></table>' + (platformVolumes ? '<div style="padding:4px 8px 0;color:#46536D;font-size:10px;text-transform:uppercase;">Valoraciones por plataforma</div><div style="padding:8px 8px 0;">' +
      platformVolumes + '</div>' : '') + '</td></tr>' + coverage + groupHtml + effects +
    '<tr><td style="padding:4px 30px 28px;"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#001391" style="border-radius:8px;"><a href="' +
    appUrl + '" style="display:block;padding:13px 22px;color:#FFFFFF;text-decoration:none;font-weight:700;">Abrir Market Pulse</a></td></tr></table>' +
    '<p style="margin:16px 0 0;color:#ADB8C2;font-size:10px;line-height:15px;">Solo se muestran posiciones con cobertura competitiva completa. Los volúmenes no atribuibles y los efectos no fiables se presentan como N/D o se omiten.</p></td></tr>' +
    '<tr><td style="padding:16px 30px;background:#070E46;color:#85C8FF;font-size:11px;line-height:17px;"><strong style="color:#FFFFFF;">Market Pulse</strong><br>BBVA Banca de Empresas e Instituciones · Uso interno.</td></tr>' +
    '</table></td></tr></table></body></html>';
}

function marketsNewsletterGroups_(items) {
  const groups = {};
  (items || []).forEach(function (item) {
    const group = groups[item.countryCode] || (groups[item.countryCode] = { country: item.country, items: [] });
    group.items.push(item);
  });
  return Object.keys(groups).sort().map(function (key) {
    groups[key].items.sort(function (a, b) { return a.platform.localeCompare(b.platform); });
    return groups[key];
  });
}

function marketsNewsletterRowHtml_(item) {
  const movementColor = item.monthDelta > 0 ? '#277A3E' : item.monthDelta < 0 ? '#B92A45' : '#46536D';
  const volume = item.newReviews === null ? (item.volumeAvailable ? 'N/D' : 'No atribuible') :
    marketsAlertIntegerLabel_(item.newReviews);
  return '<tr><td style="width:24%;padding:14px 16px;border-top:1px solid #E2E6EA;vertical-align:top;"><strong style="display:block;color:#070E46;font-size:14px;">' +
    escapeMarketsAlertHtml_(item.platform) + '</strong><span style="display:block;margin-top:4px;color:#46536D;font-size:11px;">' +
    escapeMarketsAlertHtml_(marketsNewsletterPositionLabel_(item.position)) + '</span></td>' +
    '<td style="padding:14px 16px;border-top:1px solid #E2E6EA;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>' +
    marketsNewsletterMiniCell_('Inicio año', marketsNewsletterRatingLabel_(item.yearStartRating), marketsNewsletterSigned_(item.yearDelta), '#46536D') +
    marketsNewsletterMiniCell_('Inicio mes', marketsNewsletterRatingLabel_(item.monthStartRating), '', '#46536D') +
    marketsNewsletterMiniCell_('Cierre', marketsNewsletterRatingLabel_(item.endRating), marketsNewsletterSigned_(item.monthDelta), movementColor) +
    marketsNewsletterMiniCell_('Nuevas valoraciones', volume, item.volumeAvailable ? '' : 'ficha compartida', '#001391') +
    '</tr></table></td></tr>';
}

function marketsNewsletterMiniCell_(label, value, note, color) {
  return '<td style="width:25%;padding:0 7px;vertical-align:top;"><span style="display:block;color:#46536D;font-size:9px;text-transform:uppercase;">' +
    escapeMarketsAlertHtml_(label) + '</span><strong style="display:block;margin-top:4px;color:' + color + ';font-size:15px;">' +
    escapeMarketsAlertHtml_(value) + '</strong>' + (note ? '<small style="display:block;margin-top:2px;color:' + color + ';font-size:10px;">' +
    escapeMarketsAlertHtml_(note) + '</small>' : '') + '</td>';
}

function marketsNewsletterKpiHtml_(label, value, note) {
  return '<td style="width:33.33%;padding:14px;border-radius:8px;background:#F7F8F8;text-align:center;"><span style="display:block;color:#46536D;font-size:10px;text-transform:uppercase;">' +
    escapeMarketsAlertHtml_(label) + '</span><strong style="display:block;margin-top:5px;color:#070E46;font-size:23px;">' +
    escapeMarketsAlertHtml_(value) + '</strong><small style="display:block;margin-top:3px;color:#46536D;font-size:10px;">' +
    escapeMarketsAlertHtml_(note) + '</small></td>';
}

function marketsNewsletterScopeTitle_(model) {
  if (model.scope.type === 'SINGLE') return model.scope.countryLabel + ' · ' + model.scope.platformLabel;
  if (model.scope.type === 'MULTI') return model.scope.countries.length + ' geografías seleccionadas · ' +
    model.scope.platformLabel;
  return 'Visión global · ' + model.scope.platformLabel;
}

function marketsNewsletterExecutiveNarrative_(model) {
  const totals = model.totals;
  let opening = model.scope.type === 'SINGLE' ? 'El mes en ' + model.scope.countryLabel :
    model.scope.type === 'MULTI' ? 'El perímetro seleccionado cierra el mes' :
      'La visión global de BBVA Empresas cierra el mes';
  opening += ' con ' + totals.improving + ' serie' + (totals.improving === 1 ? '' : 's') +
    ' al alza y ' + totals.declining + ' a la baja.';
  if (model.strongest && model.strongest.monthDelta > 0) {
    opening += ' El avance más relevante se produce en ' + model.strongest.country + ' · ' +
      model.strongest.platform + ' (' + marketsNewsletterSigned_(model.strongest.monthDelta) + ').';
  }
  if (model.weakest && model.weakest.monthDelta < 0) {
    opening += ' La principal señal de atención está en ' + model.weakest.country + ' · ' +
      model.weakest.platform + ' (' + marketsNewsletterSigned_(model.weakest.monthDelta) + ').';
  }
  return opening;
}

function marketsNewsletterPositionLabel_(position) {
  return position && position.available ? position.rank + ' de ' + position.total + ' frente a banca' :
    'Posición N/D';
}

function marketsNewsletterRatingLabel_(value) {
  const number = toFiniteNumber_(value);
  return number === null ? 'N/D' : number.toFixed(2).replace('.', ',');
}

function marketsNewsletterSigned_(value) {
  const number = toFiniteNumber_(value);
  if (number === null) return 'N/D';
  if (Math.abs(number) < 0.005) return '0,00';
  return (number > 0 ? '+' : '') + number.toFixed(2).replace('.', ',');
}

function marketsNewsletterPeriodLabel_(period) {
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const parts = period.split('-');
  return months[Number(parts[1]) - 1] + ' ' + parts[0];
}

function marketsNewsletterAuditEvent_(recipient, model, eventKey, source) {
  return {
    timestamp: new Date(), eventKey: eventKey,
    referenceDate: dateFromKey_(model.period + '-01'),
    platform: model.scope.platformLabel, countryCode: model.scope.countries.join(','),
    type: source === 'NEWSLETTER_TEST' ? 'NEWSLETTER_TEST' : 'NEWSLETTER_MONTHLY',
    severity: 'POSITIVE', detail: marketsNewsletterExecutiveNarrative_(model),
    recipients: recipient, runId: (source === 'NEWSLETTER_TEST' ? 'NEWS-TEST-' : 'NEWS-') + model.period,
    source: source, userEmail: recipient, ruleId: 'MONTHLY_NEWSLETTER',
    metricValue: model.totals.series, threshold: '', appKey: '', direction: 'SUMMARY'
  };
}
