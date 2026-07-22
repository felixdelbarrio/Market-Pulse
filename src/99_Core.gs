function trimString_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

/** URL corporativa unica para web, correos y diagnostico. */
function marketsWebAppUrl_() {
  const source = trimString_(ScriptApp.getService().getUrl());
  const domain = trimString_(MARKETS_CONFIG.webAppDomain).toLowerCase();
  if (!source || !domain) return '';
  const match = source.match(/^https:\/\/script\.google\.com\/(?:a\/macros\/[^/]+\/|macros\/)s\/([^/?#]+)\/exec$/i);
  if (!match) return '';
  return 'https://script.google.com/a/macros/' + encodeURIComponent(domain) + '/s/' + match[1] + '/exec';
}

function normalizeHeader_(value) {
  return trimString_(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function indexHeaders_(headers) {
  return (headers || []).reduce(function (out, header, index) {
    out[normalizeHeader_(header)] = index;
    return out;
  }, {});
}

function parseBoolean_(value, defaultValue) {
  if (typeof value === 'boolean') return value;
  const normalized = trimString_(value).toLowerCase();
  if (['true', '1', 'si', 'sí', 'yes'].indexOf(normalized) >= 0) return true;
  if (['false', '0', 'no'].indexOf(normalized) >= 0) return false;
  return Boolean(defaultValue);
}

function toFiniteNumber_(value) {
  if (typeof value === 'number') return isFinite(value) ? value : null;
  const normalized = trimString_(value).replace(/\s/g, '').replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return isFinite(parsed) ? parsed : null;
}

function toNonNegativeInteger_(value) {
  const parsed = toFiniteNumber_(value);
  return parsed !== null && parsed >= 0 ? Math.round(parsed) : null;
}

function nonNegativeNumberOrZero_(value) {
  const parsed = toFiniteNumber_(value);
  return parsed !== null && parsed >= 0 ? parsed : 0;
}

function normalizeRating_(value) {
  const parsed = toFiniteNumber_(value);
  return parsed !== null && parsed >= 1 && parsed <= 5 ? Math.round(parsed * 100) / 100 : null;
}

function dateKey_(value) {
  if (!(value instanceof Date) || isNaN(value.getTime())) return '';
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function dateFromKey_(key) {
  const parts = trimString_(key).split('-').map(Number);
  if (parts.length !== 3 || parts.some(function (part) { return !isFinite(part); })) return null;
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
}

function round2_(value) {
  return Math.round(Number(value) * 100) / 100;
}

function makeRatingKey_(date, appKey) {
  return dateKey_(date) + '|' + trimString_(appKey);
}

/** Ranking de competicion: 5, 5, 4 produce 1, 1, 3. */
function rankSnapshot_(items) {
  const ratings = (items || []).map(function (item) { return normalizeRating_(item.rating); });
  return ratings.map(function (rating) {
    if (rating === null) return null;
    return 1 + ratings.filter(function (other) { return other !== null && other > rating; }).length;
  });
}

/** Devuelve el valor de la ultima observacion anterior al corte. */
function findPreviousValue_(series, targetMillis, field) {
  let low = 0;
  let high = (series || []).length - 1;
  let found = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (series[middle].dateMillis <= targetMillis) {
      found = series[middle][field];
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

function findPreviousRating_(series, targetMillis) {
  return findPreviousValue_(series, targetMillis, 'rating');
}

function retryableStatus_(status) {
  return status === 408 || status === 429 || status >= 500;
}

function errorToString_(error) {
  if (!error) return 'Error desconocido';
  return trimString_(error.message || error.stack || error);
}

function safeJsonParse_(text) {
  try { return JSON.parse(text); } catch (ignored) { return null; }
}

function uniqueStrings_(values) {
  const seen = {};
  return (values || []).map(trimString_).filter(function (value) {
    if (!value || seen[value]) return false;
    seen[value] = true;
    return true;
  });
}
