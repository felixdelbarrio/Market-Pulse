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
  const subscribers = readAllMarketsAlertPreferences_(ss).filter(function (item) {
    return item.newsletterEnabled;
  });
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

function sendMarketsAdminNewsletterTestEmail(request) {
  const access = requireMarketsAdministrator_();
  requireMarketsNewsletterContracts_(access.ss);
  const normalized = normalizeMarketsNewsletterPreviewRequest_(request);
  const target = normalizeMarketsAlertEmail_(normalized.targetEmail);
  if (!marketsNewsletterDeliveryEnabled_(access.control)) {
    throw new Error('El envío de newsletters está desactivado en CONTROL.');
  }
  const preferences = readMarketsAlertPreferences_(access.ss, target);
  if (!preferences.persisted) throw new Error('El destinatario seleccionado no está dado de alta.');
  return withMarketsNewsletterPreviewLock_(
    access.ss, access.email, preferences, target, normalized.requestId);
}

function normalizeMarketsNewsletterPreviewRequest_(request) {
  const input = typeof request === 'string' ? { targetEmail: request } : (request || {});
  const requestId = trimString_(input.requestId) ||
    ('NEWS-REQ-' + Utilities.getUuid());
  if (!/^[A-Za-z0-9_-]{8,96}$/.test(requestId)) {
    throw new Error('El identificador de la prueba no es válido.');
  }
  return { targetEmail: input.targetEmail, requestId: requestId };
}

function withMarketsNewsletterPreviewLock_(ss, recipient, preferences, configuredFor, requestId) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(MARKETS_CONFIG.lockTimeoutMs)) {
    throw new Error('Otra comunicación sigue preparándose. Reintenta: la misma solicitud no se duplicará.');
  }
  try {
    return sendMarketsNewsletterPreview_(ss, recipient, preferences, configuredFor, requestId);
  } finally {
    lock.releaseLock();
  }
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

function sendMarketsNewsletterPreview_(ss, recipient, preferences, configuredFor, requestId) {
  const deliveryId = 'NEWS-' + trimString_(requestId).replace(/^NEWS-REQ-/, '').slice(0, 72).toUpperCase();
  const eventKey = 'NEWSLETTER_TEST|' + deliveryId + '|' + recipient;
  if (readExistingAlertKeys_(ss)[eventKey]) {
    return {
      sent: true, accepted: true, alreadyAccepted: true, recipient: recipient,
      configuredFor: configuredFor, deliveryId: deliveryId, realData: true,
      auditLogged: true, codeVersion: MARKETS_CONFIG.codeVersion, webVersion: MARKETS_WEB.version
    };
  }
  const ratings = readRatingObjects_(ss);
  const catalog = readAppCatalog_(ss);
  const period = latestMarketsNewsletterPeriod_(ratings, preferences);
  if (!period) throw new Error('No hay cierres reales disponibles para el ámbito configurado.');
  const model = buildMarketsNewsletterModel_(ratings, catalog, preferences, period, {
    isTest: true, configuredFor: configuredFor
  });
  const sender = requireMarketsAlertSender_(ss);
  const message = marketsNewsletterEmailMessage_(recipient, model, buildMarketsAlertInlineImages_(), sender);
  const accepted = Gmail.Users.Messages.send({ raw: message.raw }, 'me');
  if (!accepted || !trimString_(accepted.id)) throw new Error('Gmail no ha devuelto un identificador de mensaje.');
  appendAlertEvents_(ss, [marketsNewsletterAuditEvent_(recipient, model,
    eventKey, 'NEWSLETTER_TEST')]);
  return {
    sent: true, accepted: true, alreadyAccepted: false, recipient: recipient, configuredFor: configuredFor,
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

function marketsPeriodBefore_(period) {
  const parts = String(period || '').split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return '';
  return month === 1 ? (year - 1) + '-12' :
    year + '-' + String(month - 1).padStart(2, '0');
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
  const previousPeriod = marketsPeriodBefore_(period);
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
    const previousRows = series.filter(function (item) {
      return dateKey_(item.observedDate).slice(0, 7) === previousPeriod;
    });
    const monthStart = previousRows.length ? previousRows[previousRows.length - 1] : null;
    const end = monthRows[monthRows.length - 1];
    const yearRows = series.filter(function (item) {
      const key = dateKey_(item.observedDate);
      return key.slice(0, 4) === year && key <= dateKey_(end.observedDate);
    });
    const yearStart = yearRows[0] || null;
    const metadata = volumeMetadata[app.appKey] || { key: app.appKey, shared: false, markets: 1 };
    const position = marketsNewsletterPosition_(scopedRatings, catalog, app, period);
    const newReviews = monthStart ? marketsNewsletterCountDelta_(monthStart, end) : null;
    const volumeAvailable = !metadata.shared;
    return {
      appKey: app.appKey, countryCode: app.countryCode, country: app.country,
      platform: app.platform, monthStartRating: monthStart ? monthStart.rating : null, endRating: end.rating,
      yearStartRating: yearStart ? yearStart.rating : null,
      monthDelta: monthStart ? round2_(end.rating - monthStart.rating) : null,
      yearDelta: yearStart ? round2_(end.rating - yearStart.rating) : null,
      newReviews: volumeAvailable ? newReviews : null,
      volumeAvailable: volumeAvailable, volumeKey: metadata.key,
      sharedMarkets: metadata.markets, startCount: monthStart ? monthStart.ratingCount : null,
      endCount: end.ratingCount, startDate: monthStart ? monthStart.observedDate : null,
      endDate: end.observedDate, position: position,
      effect: volumeAvailable && monthStart ? marketsNewsletterReviewEffect_(monthStart, end) : null
    };
  }).filter(Boolean);
  if (!items.length) throw new Error('No hay cierres BBVA reales para ' + period + ' en el ámbito configurado.');
  const criticalCatalog = marketsCriticalItems_(scopedCatalog);
  const observedKeys = items.reduce(function (out, item) { out[item.appKey] = true; return out; }, {});
  const missing = criticalCatalog.filter(function (app) { return !observedKeys[app.appKey]; })
    .map(function (app) {
      return { appKey: app.appKey, country: app.country, countryCode: app.countryCode, platform: app.platform };
    });
  const countries = uniqueStrings_(items.map(function (item) { return item.countryCode; }));
  const allCountries = preferences.countries.indexOf('ALL') >= 0;
  const scopeType = allCountries ? 'ALL' : preferences.countries.length === 1 ? 'SINGLE' : 'MULTI';
  const reviewEffects = marketsNewsletterReviewEffects_(items, scopeType);
  const totals = marketsNewsletterTotals_(items, scopeType);
  totals.effects = reviewEffects.length;
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
    items: items, reviewEffects: reviewEffects, totals: totals,
    coverage: {
      observed: criticalCatalog.filter(function (app) { return observedKeys[app.appKey]; }).length,
      expected: criticalCatalog.length,
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
  return {
    newReviewRating: Math.round(rating * 100) / 100,
    gapToPreviousRating: round2_(rating - startRating),
    accumulatedRatingChange: round2_(endRating - startRating),
    uncertainty: Math.round(uncertainty * 100) / 100
  };
}

function marketsNewsletterRatingHalfStep_(rating) {
  return Math.abs(rating * 10 - Math.round(rating * 10)) < 0.000001 ? 0.05 : 0.005;
}

function marketsNewsletterTotals_(items, scopeType) {
  const comparable = (items || []).filter(function (item) {
    return toFiniteNumber_(item.monthDelta) !== null;
  });
  const sharedGroups = (items || []).filter(function (item) {
    return !item.volumeAvailable;
  }).reduce(function (out, item) {
    (out[item.volumeKey] || (out[item.volumeKey] = [])).push(item);
    return out;
  }, {});
  const uniqueVolumes = {};
  (items || []).forEach(function (item) {
    let reviews = item.newReviews;
    if (!item.volumeAvailable) {
      const group = sharedGroups[item.volumeKey] || [];
      const expectedMarkets = group.reduce(function (maximum, candidate) {
        return Math.max(maximum, Number(candidate.sharedMarkets) || 1);
      }, 1);
      if (scopeType === 'ALL' || group.length >= expectedMarkets) {
        reviews = marketsNewsletterRawCountDelta_(item.startCount, item.endCount);
      }
    }
    reviews = toFiniteNumber_(reviews);
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
    series: comparable.length,
    improving: comparable.filter(function (item) { return item.monthDelta > 0; }).length,
    declining: comparable.filter(function (item) { return item.monthDelta < 0; }).length,
    stable: comparable.filter(function (item) { return item.monthDelta === 0; }).length,
    reviewsByPlatform: byPlatform
  };
}

function marketsNewsletterReviewEffects_(items, scopeType) {
  const effects = (items || []).filter(function (item) {
    return item.volumeAvailable && Boolean(item.effect);
  }).map(function (item) {
    return {
      appKey: item.appKey, country: item.country, platform: item.platform,
      volumeKey: item.volumeKey, effect: item.effect, shared: false
    };
  });
  const shared = (items || []).filter(function (item) {
    return !item.volumeAvailable && item.platform === 'Android';
  }).reduce(function (out, item) {
    (out[item.volumeKey] || (out[item.volumeKey] = [])).push(item);
    return out;
  }, {});
  Object.keys(shared).forEach(function (volumeKey) {
    const group = shared[volumeKey];
    const expectedMarkets = group.reduce(function (maximum, item) {
      return Math.max(maximum, Number(item.sharedMarkets) || 1);
    }, 1);
    if (scopeType !== 'ALL' && group.length < expectedMarkets) return;
    const signatures = uniqueStrings_(group.map(function (item) {
      return [item.monthStartRating, item.startCount, item.endRating, item.endCount].join('|');
    }));
    if (signatures.length !== 1) return;
    const first = group[0];
    const effect = marketsNewsletterReviewEffect_(
      { rating: first.monthStartRating, ratingCount: first.startCount },
      { rating: first.endRating, ratingCount: first.endCount });
    if (!effect) return;
    effects.push({
      appKey: volumeKey, country: 'Ficha Android compartida',
      platform: 'Android', volumeKey: volumeKey, effect: effect, shared: true,
      markets: uniqueStrings_(group.map(function (item) { return item.country; })).sort()
    });
  });
  return effects.sort(function (a, b) {
    return compareMarketsPlatforms_(a, b) || trimString_(a.country).localeCompare(trimString_(b.country));
  });
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
  const brief = marketsNewsletterExecutiveBrief_(model);
  const lines = model.items.map(function (item) {
    const volume = item.newReviews === null ? 'actividad N/D' :
      marketsAlertIntegerLabel_(item.newReviews) + ' nuevas valoraciones';
    const story = item.effect ?
      marketsNewsletterRatingLabel_(item.monthStartRating) + ' → voz nueva ' +
      marketsNewsletterRatingLabel_(item.effect.newReviewRating) + '/5 (' + volume +
      ') → cierre ' + marketsNewsletterRatingLabel_(item.endRating) + ' (' +
      marketsNewsletterSigned_(item.monthDelta) + ')' :
      marketsNewsletterRatingLabel_(item.monthStartRating) + ' → cierre ' +
      marketsNewsletterRatingLabel_(item.endRating) + ' (' +
      marketsNewsletterSigned_(item.monthDelta) + ') · ' + volume;
    return [item.country, item.platform].join(' · ') + ': ' + story +
      ' · año ' + marketsNewsletterSigned_(item.yearDelta) +
      ' · ' + marketsNewsletterPositionLabel_(item.position);
  });
  const effects = (model.reviewEffects || []).filter(function (item) {
    return item.shared;
  }).map(function (item) {
    return item.country + ' · ' + item.platform + ': ' +
      marketsNewsletterRatingLabel_(item.effect.newReviewRating) +
      '/5 en las nuevas valoraciones · ' +
      marketsNewsletterSigned_(item.effect.gapToPreviousRating) +
      ' frente al rating acumulado anterior · el acumulado se mueve ' +
      marketsNewsletterSigned_(item.effect.accumulatedRatingChange) + ' puntos' +
      (item.shared ? ' sobre la ficha completa, sin atribución geográfica' : '');
  });
  return 'MARKET PULSE\nBBVA Banca de Empresas e Instituciones\n\n' +
    (model.isTest ? 'VISTA PREVIA CON DATOS REALES — NO ES UN ENVÍO MENSUAL\n' : '') +
    'Cierre ejecutivo · ' + model.periodLabel + '\n' + marketsNewsletterScopeTitle_(model) + '\n\n' +
    brief.headline + '\n' + brief.summary +
    (model.coverage && !model.coverage.complete ? '\nCobertura de cierre: ' +
      model.coverage.observed + ' de ' + model.coverage.expected +
      ' series; se omiten las series sin dato real.' : '') +
    '\n\n' + lines.join('\n') +
    (effects.length ? '\n\nVOZ NUEVA DEL MES · POR FICHA Y PLATAFORMA\n' +
      effects.join('\n') : '') +
    '\n\n' + marketsWebAppUrl_();
}

function renderMarketsNewsletterHtml_(model) {
  const groups = marketsNewsletterGroups_(model.items);
  const scopeTitle = marketsNewsletterScopeTitle_(model);
  const brief = marketsNewsletterExecutiveBrief_(model);
  const preview = model.isTest ?
    '<tr><td style="padding:12px 24px;background:#FFE761;color:#070E46;font-size:12px;font-weight:700;text-align:center;">VISTA PREVIA · DATOS REALES · NO ES UN ENVÍO MENSUAL</td></tr>' : '';
  const groupHtml = groups.map(function (group) {
    const rows = group.items.map(marketsNewsletterRowHtml_).join('');
    const geographyBrief = model.scope.type === 'SINGLE' ? '' :
      '<span style="display:block;margin-top:4px;color:#85C8FF;font-size:10px;line-height:14px;">' +
      escapeMarketsAlertHtml_(marketsNewsletterGeographyBrief_(group.items)) + '</span>';
    return '<tr><td style="padding:8px 26px 20px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #CAD1D8;border-radius:10px;overflow:hidden;">' +
      '<tr><td colspan="2" style="padding:13px 16px;background:#070E46;color:#FFFFFF;">' +
      '<strong style="display:block;font-size:15px;">' + escapeMarketsAlertHtml_(group.country) +
      '</strong>' + geographyBrief + '</td></tr>' + rows + '</table></td></tr>';
  }).join('');
  const platformVolumes = Object.keys(model.totals.reviewsByPlatform || {})
    .sort(compareMarketsPlatforms_).map(function (platform) {
    return '<span style="display:inline-block;margin:0 6px 6px 0;padding:7px 10px;border-radius:999px;background:#EAFBFA;color:#070E46;font-size:11px;"><strong>' +
      escapeMarketsAlertHtml_(platform) + '</strong> · ' +
      escapeMarketsAlertHtml_(marketsAlertIntegerLabel_(model.totals.reviewsByPlatform[platform])) +
      '</span>';
  }).join('');
  const coverage = model.coverage && !model.coverage.complete ?
    '<tr><td style="padding:0 26px 18px;"><div style="padding:12px 14px;border-radius:8px;background:#FFF4CC;color:#6B4F00;font-size:12px;line-height:18px;"><strong>Cobertura de cierre: ' +
    escapeMarketsAlertHtml_(model.coverage.observed + ' de ' + model.coverage.expected) +
    ' series.</strong> Las series sin dato real se han omitido; no se han estimado.</div></td></tr>' : '';
  const effectItems = (model.reviewEffects || []).filter(function (item) { return item.shared; });
  const effects = effectItems.length ? '<tr><td style="padding:4px 26px 22px;"><div style="padding:18px;border-radius:10px;background:#EAFBFA;">' +
    '<div style="color:#001391;font-size:11px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;">FICHA ANDROID COMPARTIDA · SIN ATRIBUCIÓN GEOGRÁFICA</div>' +
    effectItems.slice(0, 5).map(function (item) {
      return '<div style="padding-top:11px;color:#46536D;font-size:13px;line-height:19px;"><strong style="color:#070E46;">' +
        escapeMarketsAlertHtml_(item.country + ' · ' + item.platform) + ':</strong> ' +
        marketsNewsletterRatingLabel_(item.effect.newReviewRating) + '/5 en las nuevas valoraciones · ' +
        escapeMarketsAlertHtml_(marketsNewsletterSigned_(item.effect.gapToPreviousRating)) +
        ' frente al rating acumulado anterior · el acumulado se mueve ' +
        escapeMarketsAlertHtml_(marketsNewsletterSigned_(item.effect.accumulatedRatingChange)) + ' puntos' +
        (item.shared ? ' sobre la ficha compartida completa, sin atribución geográfica.' : '.') + '</div>';
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
    '<tr><td style="padding:24px 30px 12px;"><div style="color:#001391;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;">LECTURA EJECUTIVA</div>' +
    '<div style="margin-top:7px;font-family:Georgia,serif;color:#070E46;font-size:24px;line-height:31px;">' +
    escapeMarketsAlertHtml_(brief.headline) + '</div><div style="margin-top:10px;color:#46536D;font-size:14px;line-height:21px;">' +
    escapeMarketsAlertHtml_(brief.summary) + '</div></td></tr>' +
    '<tr><td style="padding:10px 26px 22px;"><table role="presentation" width="100%" cellspacing="8" cellpadding="0"><tr>' +
    marketsNewsletterKpiHtml_('Mejoran', model.totals.improving, 'de ' + model.totals.series + ' series') +
    marketsNewsletterKpiHtml_('Retroceden', model.totals.declining, model.totals.stable + ' estables') +
    marketsNewsletterKpiHtml_('Voz nueva', model.totals.effects,
      'fichas con lectura') +
    '</tr></table>' + (model.scope.type !== 'SINGLE' && platformVolumes ? '<div style="padding:4px 8px 0;color:#46536D;font-size:10px;text-transform:uppercase;">Valoraciones por plataforma</div><div style="padding:8px 8px 0;">' +
      platformVolumes + '</div>' : '') + '</td></tr>' + coverage + groupHtml + effects +
    '<tr><td style="padding:4px 30px 28px;"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#001391" style="border-radius:8px;"><a href="' +
    appUrl + '" style="display:block;padding:13px 22px;color:#FFFFFF;text-decoration:none;font-weight:700;">Abrir Market Pulse</a></td></tr></table>' +
    '<p style="margin:16px 0 0;color:#ADB8C2;font-size:10px;line-height:15px;">La lectura ejecutiva se genera exclusivamente a partir de las cifras mostradas. Ratings y volúmenes de Android, iOS y Huawei nunca se combinan. Solo se publican posiciones con cobertura competitiva completa; los volúmenes no atribuibles y los efectos no fiables se presentan como N/D o se omiten.</p></td></tr>' +
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
    groups[key].items.sort(compareMarketsPlatforms_);
    return groups[key];
  });
}

function marketsNewsletterGeographyBrief_(items) {
  const comparable = (items || []).filter(function (item) {
    return toFiniteNumber_(item.monthDelta) !== null;
  });
  if (!comparable.length) return 'Sin cierre anterior comparable';
  if (comparable.length === 1) {
    return comparable[0].platform + ' · ' +
      marketsNewsletterSigned_(comparable[0].monthDelta) + ' en el mes';
  }
  const improving = comparable.filter(function (item) { return item.monthDelta > 0; }).length;
  const declining = comparable.filter(function (item) { return item.monthDelta < 0; }).length;
  const stable = comparable.length - improving - declining;
  const parts = [];
  if (improving) parts.push(improving + (improving === 1 ? ' mejora' : ' mejoran'));
  if (declining) parts.push(declining + (declining === 1 ? ' retrocede' : ' retroceden'));
  if (stable) parts.push(stable + (stable === 1 ? ' estable' : ' estables'));
  return marketsNewsletterJoinFacts_(parts) + ' · ' + comparable.length + ' plataformas';
}

function marketsNewsletterRowHtml_(item) {
  const movementColor = item.monthDelta > 0 ? '#277A3E' : item.monthDelta < 0 ? '#B92A45' : '#46536D';
  const volume = item.newReviews === null ? (item.volumeAvailable ? 'N/D' : 'No atribuible') :
    marketsAlertIntegerLabel_(item.newReviews);
  const voice = item.effect || null;
  const voiceColor = !voice ? '#001391' : voice.gapToPreviousRating > 0.005 ?
    '#277A3E' : voice.gapToPreviousRating < -0.005 ? '#B92A45' : '#46536D';
  const middleLabel = voice ? 'Voz nueva' : 'Actividad del mes';
  const middleValue = voice ? marketsNewsletterRatingLabel_(voice.newReviewRating) + '/5' : volume;
  const middleNote = voice ? volume + ' nuevas valoraciones' :
    item.volumeAvailable ? 'nuevas valoraciones' : 'ficha compartida';
  const annual = item.yearStartRating === null || item.yearDelta === null ? '' :
    'Desde inicio de año: ' + marketsNewsletterSigned_(item.yearDelta) +
    ' (partía de ' + marketsNewsletterRatingLabel_(item.yearStartRating) + ').';
  const voiceGap = voice ? ' La voz nueva queda ' +
    marketsNewsletterSigned_(voice.gapToPreviousRating) +
    ' frente al rating acumulado anterior.' : '';
  return '<tr><td style="width:27%;padding:16px;border-top:1px solid #E2E6EA;vertical-align:top;"><strong style="display:block;color:#070E46;font-size:15px;">' +
    escapeMarketsAlertHtml_(item.platform) + '</strong><span style="display:block;margin-top:10px;color:#46536D;font-size:9px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;">Posición competitiva</span>' +
    '<span style="display:block;margin-top:3px;color:#070E46;font-size:12px;line-height:17px;">' +
    escapeMarketsAlertHtml_(marketsNewsletterPositionLabel_(item.position)) + '</span></td>' +
    '<td style="padding:16px;border-top:1px solid #E2E6EA;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:8px;background:#F7F8F8;"><tr>' +
    marketsNewsletterStoryCell_('Cierre anterior',
      marketsNewsletterRatingLabel_(item.monthStartRating), 'punto de partida', '#46536D') +
    marketsNewsletterStoryCell_(middleLabel, middleValue, middleNote, voiceColor) +
    marketsNewsletterStoryCell_('Cierre',
      marketsNewsletterRatingLabel_(item.endRating),
      marketsNewsletterSigned_(item.monthDelta) + ' en el mes', movementColor) +
    '</tr></table><div style="padding:8px 4px 0;color:#46536D;font-size:9px;line-height:14px;">' +
    escapeMarketsAlertHtml_(annual + voiceGap) + '</div></td></tr>';
}

function marketsNewsletterStoryCell_(label, value, note, color) {
  return '<td style="width:33.33%;padding:11px 10px;vertical-align:top;">' +
    '<span style="display:block;color:#46536D;font-size:8px;font-weight:700;letter-spacing:.25px;text-transform:uppercase;">' +
    escapeMarketsAlertHtml_(label) + '</span><strong style="display:block;margin-top:4px;color:' +
    color + ';font-size:16px;">' + escapeMarketsAlertHtml_(value) +
    '</strong><small style="display:block;margin-top:2px;color:#6B7280;font-size:8px;line-height:11px;">' +
    escapeMarketsAlertHtml_(note) + '</small></td>';
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
  const brief = marketsNewsletterExecutiveBrief_(model);
  return [brief.headline, brief.summary].filter(Boolean).join(' ');
}

function marketsNewsletterExecutiveBrief_(model) {
  const totals = model.totals;
  const single = model.scope.type === 'SINGLE';
  const unit = single ? 'plataforma' : 'serie';
  const subject = single ? model.scope.countryLabel :
    model.scope.type === 'MULTI' ? 'El perímetro seleccionado' : 'La visión global de BBVA Empresas';
  if (!totals.series) {
    return {
      headline: subject + ' no dispone de un cierre anterior comparable.',
      summary: 'El cierre actual se muestra con datos reales, pero no se calculan variaciones ni la nota de las nuevas valoraciones sin dos cierres mensuales consecutivos.'
    };
  }
  let headline = '';
  if (totals.series === 1 && model.items.length === 1) {
    const only = model.items[0];
    headline = only.platform + (only.monthDelta > 0 ? ' cierra el mes al alza en ' :
      only.monthDelta < 0 ? ' cierra el mes a la baja en ' : ' cierra el mes sin cambios en ') +
      only.country + '.';
  } else if (totals.declining === totals.series && totals.series > 0) {
    headline = single ? subject + ' cierra el mes con presión en todas las plataformas.' :
      subject + ' cierra el mes con presión generalizada.';
  } else if (totals.improving === totals.series && totals.series > 0) {
    headline = single ? subject + ' avanza en todas las plataformas analizadas.' :
      subject + ' cierra el mes con avances generalizados.';
  } else if (totals.stable === totals.series && totals.series > 0) {
    headline = single ? subject + ' cierra sin movimientos en sus ratings.' :
      subject + ' mantiene sus ratings sin cambios.';
  } else if (totals.declining > totals.improving) {
    headline = single ? subject + ' cierra con un balance de cautela.' :
      subject + ' cierra con un balance de cautela.';
  } else if (totals.improving > totals.declining) {
    headline = single ? subject + ' cierra con un balance favorable.' :
      subject + ' cierra con un balance favorable.';
  } else {
    headline = single ? subject + ' presenta un cierre mixto.' : subject + ' presenta un cierre mixto.';
  }

  const facts = [];
  if (totals.series === 1 && model.items.length === 1) {
    // El titular ya resume la dirección; el detalle numérico vive una sola vez
    // en la secuencia Cierre anterior → Voz nueva → Cierre.
  } else {
    if (totals.improving === totals.series) {
      facts.push('Las ' + marketsNewsletterCountLabel_(totals.series) + ' ' + unit +
        's analizadas avanzan.');
    } else if (totals.declining === totals.series) {
      facts.push('Las ' + marketsNewsletterCountLabel_(totals.series) + ' ' + unit +
        's analizadas retroceden.');
    } else if (totals.stable === totals.series) {
      facts.push('Las ' + marketsNewsletterCountLabel_(totals.series) + ' ' + unit +
        's analizadas permanecen estables.');
    } else {
      const movementParts = [];
      if (totals.improving) movementParts.push(marketsNewsletterCountPhrase_(
        totals.improving, unit, totals.improving === 1 ? 'avanza' : 'avanzan'));
      if (totals.declining) movementParts.push(marketsNewsletterCountPhrase_(
        totals.declining, unit, totals.declining === 1 ? 'retrocede' : 'retroceden'));
      if (totals.stable) movementParts.push(marketsNewsletterCountPhrase_(
        totals.stable, unit, totals.stable === 1 ? 'permanece estable' : 'permanecen estables'));
      if (movementParts.length) facts.push(marketsNewsletterJoinFacts_(movementParts) + '.');
    }
    const strongest = model.strongest && model.strongest.monthDelta > 0 ? model.strongest : null;
    const weakest = model.weakest && model.weakest.monthDelta < 0 ? model.weakest : null;
    const principal = !strongest ? weakest : !weakest ? strongest :
      Math.abs(weakest.monthDelta) >= Math.abs(strongest.monthDelta) ? weakest : strongest;
    if (principal) {
      facts.push(marketsNewsletterItemLabel_(principal, model) +
        (principal.monthDelta < 0 ? ' concentra el ajuste más relevante (' :
          ' marca el avance más relevante (') +
        marketsNewsletterSigned_(principal.monthDelta) + ').');
    }
  }

  const voiceContext = marketsNewsletterVoiceContext_(model);
  if (voiceContext) facts.push(voiceContext);
  const yearContext = marketsNewsletterYearContext_(model);
  if (yearContext) facts.push(yearContext);
  const positionContext = marketsNewsletterPositionContext_(model);
  if (positionContext) facts.push(positionContext);
  const volumeContext = marketsNewsletterVolumeContext_(model);
  if (!single && volumeContext) facts.push(volumeContext);
  return { headline: headline, summary: facts.slice(0, 3).join(' ') };
}

function marketsNewsletterItemLabel_(item, model) {
  return model.scope.type === 'SINGLE' ? item.platform : item.country + ' · ' + item.platform;
}

function marketsNewsletterCountPhrase_(count, noun, verb) {
  return (count === 1 ? 'Una' : String(count)) + ' ' + noun + (count === 1 ? '' : 's') + ' ' + verb;
}

function marketsNewsletterCountLabel_(count) {
  return ({ 2: 'dos', 3: 'tres', 4: 'cuatro', 5: 'cinco', 6: 'seis',
    7: 'siete', 8: 'ocho', 9: 'nueve', 10: 'diez' })[count] || String(count);
}

function marketsNewsletterJoinFacts_(parts) {
  if (parts.length < 2) return parts[0] || '';
  if (parts.length === 2) return parts[0] + ' y ' + parts[1].toLowerCase();
  return parts.slice(0, -1).join(', ') + ' y ' + parts[parts.length - 1].toLowerCase();
}

function marketsNewsletterYearContext_(model) {
  const item = (model.items || []).find(function (candidate) {
    return candidate.monthDelta < 0 && candidate.yearDelta > 0;
  });
  if (item) {
    return 'Pese al ajuste mensual, ' + marketsNewsletterItemLabel_(item, model) +
      ' se mantiene ' + marketsNewsletterSigned_(item.yearDelta) + ' sobre el inicio de año.';
  }
  const rebound = (model.items || []).find(function (candidate) {
    return candidate.monthDelta > 0 && candidate.yearDelta < 0;
  });
  return rebound ? 'El avance mensual de ' + marketsNewsletterItemLabel_(rebound, model) +
    ' todavía deja el rating ' + marketsNewsletterSigned_(rebound.yearDelta) +
    ' frente al inicio de año.' : '';
}

function marketsNewsletterPositionContext_(model) {
  const comparable = (model.items || []).filter(function (item) {
    return item.position && item.position.available;
  });
  if (!comparable.length) return '';
  const leaders = comparable.filter(function (item) { return item.position.rank === 1; });
  if (leaders.length) {
    if (comparable.length === 1) {
      return 'BBVA mantiene el liderazgo frente a la banca comparable.';
    }
    return 'BBVA lidera en ' + leaders.length + ' de ' + comparable.length +
      ' ' + (model.scope.type === 'SINGLE' ? 'plataformas comparables.' : 'series comparables.');
  }
  const best = comparable.slice().sort(function (a, b) {
    return a.position.rank - b.position.rank || b.endRating - a.endRating;
  })[0];
  return 'En ' + marketsNewsletterItemLabel_(best, model) + ', BBVA ocupa la ' +
    best.position.rank + '.ª posición entre ' + best.position.total + ' bancos comparados.';
}

function marketsNewsletterVolumeContext_(model) {
  const byPlatform = model.totals && model.totals.reviewsByPlatform || {};
  const platforms = Object.keys(byPlatform).filter(function (platform) {
    return toFiniteNumber_(byPlatform[platform]) !== null && byPlatform[platform] > 0;
  }).sort(compareMarketsPlatforms_);
  if (!platforms.length) return '';
  const facts = platforms.map(function (platform) {
    return platform + ' registra ' + marketsAlertIntegerLabel_(byPlatform[platform]) +
      ' nuevas valoraciones';
  });
  const joined = facts.length < 2 ? facts[0] :
    facts.length === 2 ? facts[0] + ' y ' + facts[1] :
      facts.slice(0, -1).join(', ') + ' y ' + facts[facts.length - 1];
  return 'Volumen separado por plataforma: ' + joined + '.';
}

function marketsNewsletterVoiceContext_(model) {
  const effects = (model.reviewEffects || []).filter(function (item) {
    return item.effect && toFiniteNumber_(item.effect.newReviewRating) !== null;
  });
  if (!effects.length) return '';
  if (effects.length === 1) {
    const item = effects[0];
    const label = model.scope.type === 'SINGLE' && !item.shared ?
      item.platform : item.country + ' · ' + item.platform;
    const gap = item.effect.gapToPreviousRating;
    const change = item.effect.accumulatedRatingChange;
    const quality = gap > 0.005 ? 'se sitúa por encima del rating previo' :
      gap < -0.005 ? 'queda por debajo del rating previo' :
        'se mantiene alineada con el rating previo';
    const consequence = change > 0.005 ? 'refuerza el cierre' :
      change < -0.005 ? 'presiona el cierre' :
        'no altera de forma visible el acumulado';
    return (model.scope.type === 'SINGLE' ? 'La voz nueva ' :
      'En ' + label + ', la voz nueva ') + quality + ' y ' + consequence + '.';
  }
  const positive = effects.filter(function (item) {
    return item.effect.gapToPreviousRating > 0.005;
  }).length;
  const negative = effects.filter(function (item) {
    return item.effect.gapToPreviousRating < -0.005;
  }).length;
  const notable = effects.slice().sort(function (a, b) {
    return Math.abs(b.effect.accumulatedRatingChange) -
      Math.abs(a.effect.accumulatedRatingChange);
  })[0];
  const positivePhrase = positive + (positive === 1 ? ' impulsa' : ' impulsan');
  const negativePhrase = negative + (negative === 1 ? ' presiona' : ' presionan');
  const balance = positive && negative ?
    positivePhrase + ' y ' + negativePhrase :
    positive ? positivePhrase + ' el rating' :
      negative ? negativePhrase + ' el rating' :
        'sin diferencias relevantes frente al rating previo';
  const unit = model.scope.type === 'SINGLE' ? 'plataforma' : 'ficha';
  const notableLabel = model.scope.type === 'SINGLE' && !notable.shared ?
    notable.platform : notable.shared ? notable.country :
      notable.country + ' · ' + notable.platform;
  return 'Voz nueva: ' + balance + ' entre ' + effects.length +
    ' ' + unit + (effects.length === 1 ? '' : 's') +
    ' calculables. El mayor reflejo en el acumulado está en ' +
    notableLabel +
    ' (' + marketsNewsletterSigned_(notable.effect.accumulatedRatingChange) + ').';
}

function marketsNewsletterPositionLabel_(position) {
  if (!position || !position.available) return 'No disponible';
  if (position.rank === 1) return 'Líder entre ' + position.total +
    (position.total === 1 ? ' banco' : ' bancos');
  return position.rank + '.ª posición entre ' + position.total +
    (position.total === 1 ? ' banco' : ' bancos');
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
