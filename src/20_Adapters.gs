function fetchCatalogRatings_(catalog) {
  const grouped = { Android: [], iOS: [], Huawei: [] };
  catalog.forEach(function (app) { grouped[app.platform].push(app); });
  return []
    .concat(fetchAndroidRatings_(grouped.Android))
    .concat(fetchIosRatings_(grouped.iOS))
    .concat(fetchHuaweiRatings_(grouped.Huawei));
}

function fetchAndroidRatings_(apps) {
  if (!apps.length) return [];
  const requests = apps.map(function (app) {
    return {
      url: 'https://play.google.com/store/apps/details?id=' + encodeURIComponent(app.packageName) +
        '&hl=' + encodeURIComponent(app.locale || 'en') + '&gl=' + encodeURIComponent(app.countryCode),
      method: 'get', followRedirects: true, muteHttpExceptions: true,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': (app.locale || 'en') + ',en;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; BBVA-Markets-Monitor/' + MARKETS_CONFIG.codeVersion + ')'
      }
    };
  });
  return parseBatchWithRetry_(apps, requests, parseAndroidResponse_);
}

function parseAndroidResponse_(app, response) {
  const status = responseCode_(response);
  if (status < 200 || status >= 300) return fetchFailure_(app, 'HTTP ' + status, retryableStatus_(status), status);
  const parsed = parsePlayRatingHtml_(response.getContentText());
  if (parsed.rating === null) return fetchFailure_(app, 'No se encontro un rating publico valido.', false, status, true);
  return fetchSuccess_(app, parsed.rating, parsed.ratingCount, status);
}

function parsePlayRatingHtml_(html) {
  const source = String(html || '');
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(source)) !== null) {
    const json = safeJsonParse_(match[1]);
    const found = findAggregateRating_(json);
    if (found.rating !== null) return found;
  }
  const valueMatch = source.match(/["']ratingValue["']\s*:\s*["']?([0-5](?:[.,]\d+)?)/i);
  const countMatch = source.match(/["'](?:ratingCount|ratingReviewCount|reviewCount)["']\s*:\s*["']?([\d.,\s]+)/i);
  return {
    rating: valueMatch ? normalizeRating_(valueMatch[1]) : null,
    ratingCount: countMatch ? parseStoreInteger_(countMatch[1]) : null
  };
}

function findAggregateRating_(node) {
  if (!node || typeof node !== 'object') return { rating: null, ratingCount: null };
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      const found = findAggregateRating_(node[i]);
      if (found.rating !== null) return found;
    }
    return { rating: null, ratingCount: null };
  }
  if (node.aggregateRating) {
    const rating = normalizeRating_(node.aggregateRating.ratingValue);
    if (rating !== null) {
      return { rating: rating, ratingCount: parseStoreInteger_(node.aggregateRating.ratingCount || node.aggregateRating.reviewCount) };
    }
  }
  if (node['@graph']) return findAggregateRating_(node['@graph']);
  return { rating: null, ratingCount: null };
}

function parseStoreInteger_(value) {
  const raw = trimString_(value).replace(/\s/g, '');
  if (!raw) return null;
  const separators = (raw.match(/[.,]/g) || []).length;
  if (separators > 1 || /[.,]\d{3}$/.test(raw)) return toNonNegativeInteger_(raw.replace(/[.,]/g, ''));
  return toNonNegativeInteger_(raw.replace(',', '.'));
}

function fetchIosRatings_(apps) {
  if (!apps.length) return [];
  const requests = apps.map(function (app) {
    return {
      url: 'https://itunes.apple.com/lookup?id=' + encodeURIComponent(app.appId) +
        '&country=' + encodeURIComponent(app.countryCode.toLowerCase()),
      method: 'get', followRedirects: true, muteHttpExceptions: true,
      headers: { Accept: 'application/json' }
    };
  });
  return parseBatchWithRetry_(apps, requests, parseIosResponse_);
}

function parseIosResponse_(app, response) {
  const status = responseCode_(response);
  if (status < 200 || status >= 300) return fetchFailure_(app, 'HTTP ' + status, retryableStatus_(status), status);
  const data = safeJsonParse_(response.getContentText());
  if (!data || !Array.isArray(data.results) || !data.results.length) {
    return fetchFailure_(app, 'App no disponible en la App Store del pais.', false, status);
  }
  const item = data.results[0];
  const count = toNonNegativeInteger_(item.userRatingCount);
  const rating = count > 0 ? normalizeRating_(item.averageUserRating) : null;
  if (rating === null) return fetchFailure_(app, 'Sin rating publico.', false, status, true);
  return fetchSuccess_(app, rating, count, status);
}

function fetchHuaweiRatings_(apps) {
  if (!apps.length) return [];
  const interfaceResult = getHuaweiInterfaceCode_();
  if (!interfaceResult.ok) {
    return apps.map(function (app) {
      return fetchFailure_(app, interfaceResult.error, interfaceResult.retryable, interfaceResult.status);
    });
  }
  const identityId = Utilities.getUuid();
  const infoRequests = apps.map(function (app) { return buildHuaweiInfoRequest_(app, interfaceResult.code, identityId); });
  const infoResponses = fetchInChunks_(infoRequests);
  const infoResults = apps.map(function (app, index) {
    return retryParsedRequest_(app, infoRequests[index], infoResponses[index], parseHuaweiInfoResponse_);
  });
  const validApps = infoResults.filter(function (result) { return result.ok; });
  if (!validApps.length) return infoResults;
  const ratingRequests = validApps.map(buildHuaweiRatingRequest_);
  const ratingResponses = fetchInChunks_(ratingRequests);
  const ratingsByKey = {};
  validApps.forEach(function (appResult, index) {
    ratingsByKey[appResult.app.appKey] = retryParsedRequest_(appResult.app, ratingRequests[index], ratingResponses[index], function (app, response) {
      return parseHuaweiRatingResponse_(appResult, response);
    });
  });
  return infoResults.map(function (result) {
    return result.ok ? ratingsByKey[result.app.appKey] : result;
  });
}

function getHuaweiInterfaceCode_() {
  const request = {
    url: 'https://web-dre.hispace.dbankcloud.com/edge/webedge/getInterfaceCode',
    method: 'post', muteHttpExceptions: true, headers: huaweiOriginHeaders_()
  };
  let response;
  try { response = fetchRequestWithRetry_(request); } catch (error) {
    return { ok: false, code: '', status: 0, retryable: true, error: errorToString_(error) };
  }
  const status = responseCode_(response);
  if (status < 200 || status >= 300) return { ok: false, code: '', status: status, retryable: retryableStatus_(status), error: 'HTTP ' + status + ' obteniendo Interface-Code.' };
  let code = safeJsonParse_(response.getContentText());
  if (code === null) code = response.getContentText();
  code = trimString_(code).replace(/^"|"$/g, '');
  return code
    ? { ok: true, code: code, status: status, retryable: false, error: '' }
    : { ok: false, code: '', status: status, retryable: false, error: 'Interface-Code vacio.' };
}

function buildHuaweiInfoRequest_(app, interfaceCode, identityId) {
  const headers = huaweiOriginHeaders_();
  headers['Interface-Code'] = interfaceCode + '_' + Date.now();
  headers['Identity-Id'] = identityId;
  return {
    url: 'https://web-dre.hispace.dbankcloud.com/edge/webedge/appinfo',
    method: 'post', contentType: 'application/x-www-form-urlencoded;charset=UTF-8',
    payload: 'pkgName=' + encodeURIComponent(app.packageName), followRedirects: true,
    muteHttpExceptions: true, headers: headers
  };
}

function parseHuaweiInfoResponse_(app, response) {
  const status = responseCode_(response);
  if (status < 200 || status >= 300) return fetchFailure_(app, 'HTTP ' + status + ' consultando ficha Huawei.', retryableStatus_(status), status);
  const item = safeJsonParse_(response.getContentText());
  if (!item || !trimString_(item.appId)) return fetchFailure_(app, trimString_(item && item.message) || 'Ficha Huawei no disponible.', false, status);
  if (trimString_(item.appId) !== app.appId) {
    return fetchFailure_(app, 'APP_ID Huawei inesperado. Esperado ' + app.appId + ', obtenido ' + trimString_(item.appId) + '.', false, status);
  }
  return { ok: true, retryable: false, status: status, app: app, huaweiAppId: trimString_(item.appId), error: '' };
}

function buildHuaweiRatingRequest_(infoResult) {
  const app = infoResult.app;
  return {
    url: 'https://web-dre.hispace.dbankcloud.com/edge/index/commentlist3',
    method: 'post', contentType: 'application/json;charset=UTF-8',
    payload: JSON.stringify({
      method: 'internal.user.commenList3', serviceType: 20, reqPageNum: 1,
      maxResults: 25, appid: infoResult.huaweiAppId, version: '10.0.0',
      zone: app.countryCode, locale: app.locale || huaweiLocale_(app.countryCode)
    }),
    followRedirects: true, muteHttpExceptions: true, headers: huaweiOriginHeaders_()
  };
}

function parseHuaweiRatingResponse_(infoResult, response) {
  const app = infoResult.app;
  const status = responseCode_(response);
  if (status < 200 || status >= 300) return fetchFailure_(app, 'HTTP ' + status + ' consultando ratings Huawei.', retryableStatus_(status), status);
  const summary = safeJsonParse_(response.getContentText());
  if (!summary || Number(summary.rtnCode) !== 0) return fetchFailure_(app, trimString_(summary && summary.rtnDesc) || 'Huawei rechazo la consulta de ratings.', false, status);
  if (!Object.prototype.hasOwnProperty.call(summary, 'count') || !Object.prototype.hasOwnProperty.call(summary, 'score')) {
    return fetchFailure_(app, 'Respuesta Huawei incompleta.', true, status);
  }
  const count = toNonNegativeInteger_(summary.count);
  const rating = count > 0 ? normalizeRating_(summary.score) : null;
  if (rating === null) return fetchFailure_(app, 'Sin rating publico.', false, status, true);
  return fetchSuccess_(app, rating, count, status);
}

function huaweiOriginHeaders_() {
  return { Origin: 'https://appgallery.huawei.com', Referer: 'https://appgallery.huawei.com/' };
}

function huaweiLocale_(countryCode) {
  const locales = { ES: 'es_ES', AR: 'es_AR', PE: 'es_PE', CO: 'es_CO', UY: 'es_UY', MX: 'es_MX', TR: 'tr_TR' };
  return locales[countryCode] || 'en';
}

function parseBatchWithRetry_(apps, requests, parser) {
  const responses = safeFetchAll_(requests);
  return apps.map(function (app, index) {
    return retryParsedRequest_(app, requests[index], responses[index], parser);
  });
}

function safeFetchAll_(requests) {
  try { return UrlFetchApp.fetchAll(requests); } catch (batchError) {
    console.warn('fetchAll fallo: ' + errorToString_(batchError));
    return requests.map(function (request) {
      try { return UrlFetchApp.fetch(request.url, request); } catch (error) { return error; }
    });
  }
}

function fetchInChunks_(requests) {
  const output = [];
  for (let offset = 0; offset < requests.length; offset += MARKETS_CONFIG.huaweiBatchSize) {
    if (offset > 0) Utilities.sleep(MARKETS_CONFIG.huaweiBatchDelayMs);
    Array.prototype.push.apply(output, safeFetchAll_(requests.slice(offset, offset + MARKETS_CONFIG.huaweiBatchSize)));
  }
  return output;
}

function retryParsedRequest_(app, request, initialResponse, parser) {
  let result = parser(app, initialResponse);
  for (let attempt = 1; attempt <= MARKETS_CONFIG.requestRetries && result.retryable; attempt += 1) {
    Utilities.sleep(MARKETS_CONFIG.retryBaseDelayMs * Math.pow(2, attempt - 1));
    let response;
    try { response = UrlFetchApp.fetch(request.url, request); } catch (error) { response = error; }
    result = parser(app, response);
  }
  return result;
}

function fetchRequestWithRetry_(request) {
  let response;
  for (let attempt = 0; attempt <= MARKETS_CONFIG.requestRetries; attempt += 1) {
    if (attempt > 0) Utilities.sleep(MARKETS_CONFIG.retryBaseDelayMs * Math.pow(2, attempt - 1));
    response = UrlFetchApp.fetch(request.url, request);
    const status = responseCode_(response);
    if (!retryableStatus_(status)) return response;
  }
  return response;
}

function responseCode_(response) {
  return response && typeof response.getResponseCode === 'function' ? response.getResponseCode() : 0;
}

function fetchSuccess_(app, rating, ratingCount, status) {
  return { ok: true, noRating: false, retryable: false, status: status, app: app, rating: rating, ratingCount: ratingCount, error: '' };
}

function fetchFailure_(app, message, retryable, status, noRating) {
  return { ok: false, noRating: Boolean(noRating), retryable: Boolean(retryable), status: status || 0, app: app, rating: null, ratingCount: null, error: message };
}

