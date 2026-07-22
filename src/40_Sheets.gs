function openMarketsSpreadsheet_() {
  return SpreadsheetApp.openById(MARKETS_CONFIG.spreadsheetId);
}

function workbookDefinitions_() {
  return [
    [MARKETS_CONFIG.sheets.control, MARKETS_CONFIG.headers.control],
    [MARKETS_CONFIG.sheets.catalog, MARKETS_CONFIG.headers.catalog],
    [MARKETS_CONFIG.sheets.ratings, MARKETS_CONFIG.headers.ratings],
    [MARKETS_CONFIG.sheets.competition, MARKETS_CONFIG.headers.competition],
    [MARKETS_CONFIG.sheets.trends, MARKETS_CONFIG.headers.trends],
    [MARKETS_CONFIG.sheets.fetchLog, MARKETS_CONFIG.headers.fetchLog],
    [MARKETS_CONFIG.sheets.alerts, MARKETS_CONFIG.headers.alerts],
    [MARKETS_CONFIG.sheets.alertPreferences, MARKETS_CONFIG.headers.alertPreferences],
    [MARKETS_CONFIG.sheets.runs, MARKETS_CONFIG.headers.runs]
  ];
}

function ensureWorkbookSchema_(ss) {
  workbookDefinitions_().forEach(function (definition) {
    const sheet = getOrCreateSheet_(ss, definition[0]);
    if ([MARKETS_CONFIG.sheets.competition, MARKETS_CONFIG.sheets.trends].indexOf(definition[0]) < 0) {
      ensureCurrentSheetContract_(sheet, definition[1]);
    }
  });
}

function initializeWorkbook_(ss) {
  ensureWorkbookSchema_(ss);
  seedControl_(ss.getSheetByName(MARKETS_CONFIG.sheets.control));
  seedCatalogDefaults_(ss.getSheetByName(MARKETS_CONFIG.sheets.catalog));
  workbookDefinitions_().forEach(function (definition) {
    if ([MARKETS_CONFIG.sheets.competition, MARKETS_CONFIG.sheets.trends].indexOf(definition[0]) < 0) {
      applyTableStyle_(ss.getSheetByName(definition[0]), definition[1].length);
    }
  });
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function ensureCurrentSheetContract_(sheet, expected) {
  ensureSheetCapacity_(sheet, 2, expected.length);
  const current = readSheetHeader_(sheet);
  const hasContent = current.some(function (value) { return Boolean(value); });
  if (!hasContent) {
    sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
    return;
  }
  assertCurrentSheetContract_(sheet, expected, current);
}

function requireCurrentSheetContract_(ss, name, expected) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Falta la hoja obligatoria ' + name + '. Ejecuta setupProject() con la version publicada.');
  assertCurrentSheetContract_(sheet, expected, readSheetHeader_(sheet));
  return sheet;
}

function readSheetHeader_(sheet) {
  const currentWidth = Math.max(1, sheet.getLastColumn());
  return sheet.getRange(1, 1, 1, currentWidth).getValues()[0].map(trimString_);
}

function assertCurrentSheetContract_(sheet, expected, current) {
  const populatedWidth = current.reduce(function (last, value, index) {
    return value ? index + 1 : last;
  }, 0);
  const mismatch = populatedWidth !== expected.length || current.slice(0, expected.length).some(function (header, index) {
    return header !== expected[index];
  });
  if (mismatch) {
    throw new Error('Contrato incompatible en ' + sheet.getName() + '. La version publicada requiere exactamente: ' + expected.join(', '));
  }
}

function seedControl_(sheet) {
  const existingRows = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues() : [];
  const rowByKey = existingRows.reduce(function (out, row, index) {
    const key = trimString_(row[0]);
    if (key) out[key] = index + 2;
    return out;
  }, {});
  const missing = [];
  MARKETS_CONFIG.controlDefaults.forEach(function (row) {
    if (rowByKey[row[0]]) {
      if (row[0] === 'CODE_VERSION') sheet.getRange(rowByKey[row[0]], 2).setValue(row[1]);
    } else {
      missing.push(row.slice());
    }
  });
  if (missing.length) {
    const start = sheet.getLastRow() + 1;
    ensureSheetCapacity_(sheet, start + missing.length - 1, 3);
    sheet.getRange(start, 1, missing.length, 3).setValues(missing);
  }
}

function seedCatalogDefaults_(sheet) {
  if (!MARKETS_CATALOG_SEEDS.length) return;
  const keyRows = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues() : [];
  const existing = keyRows.reduce(function (out, row) {
    const key = trimString_(row[0]);
    if (key) out[key] = true;
    return out;
  }, {});
  const missing = MARKETS_CATALOG_SEEDS.filter(function (row) { return !existing[row[0]]; })
    .map(function (row) { return row.slice(); });
  if (!missing.length) return;
  const start = sheet.getLastRow() + 1;
  ensureSheetCapacity_(sheet, start + missing.length - 1, MARKETS_CONFIG.headers.catalog.length);
  sheet.getRange(start, 1, missing.length, MARKETS_CONFIG.headers.catalog.length).setValues(missing);
  refreshFilter_(sheet, MARKETS_CONFIG.headers.catalog.length);
}

function applyTableStyle_(sheet, width) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, width)
    .setBackground('#004481')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setWrap(true);
  sheet.setRowHeight(1, 34);
  sheet.setHiddenGridlines(true);
  if (sheet.getFilter()) sheet.getFilter().remove();
  const rows = Math.max(2, sheet.getLastRow());
  sheet.getRange(1, 1, rows, width).createFilter();
  if (sheet.getName() === MARKETS_CONFIG.sheets.ratings) {
    sheet.getRange('B:B').setNumberFormat('yyyy-mm-dd');
    sheet.getRange('D:D').setNumberFormat('yyyy-mm');
    sheet.getRange('M:M').setNumberFormat('0.00');
    sheet.getRange('N:O').setNumberFormat('#,##0');
    sheet.getRange('P:Q').setNumberFormat('0.00');
    sheet.getRange('AA:AB').setNumberFormat('#,##0');
    sheet.getRange('T:T').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  } else if (sheet.getName() === MARKETS_CONFIG.sheets.trends) {
    sheet.getRange('A:A').setNumberFormat('yyyy-mm-dd');
    sheet.getRange('H:H').setNumberFormat('0.00');
  } else if (sheet.getName() === MARKETS_CONFIG.sheets.competition) {
    sheet.getRange('A:A').setNumberFormat('yyyy-mm-dd');
    sheet.getRange('J:J').setNumberFormat('0.00');
    sheet.getRange('K:K').setNumberFormat('#,##0');
    sheet.getRange('M:M').setNumberFormat('0.00');
    sheet.getRange('O:O').setNumberFormat('#,##0');
  } else if (sheet.getName() === MARKETS_CONFIG.sheets.fetchLog) {
    sheet.getRange('B:B').setNumberFormat('yyyy-mm-dd');
    sheet.getRange('C:C').setNumberFormat('yyyy-mm-dd hh:mm:ss');
    sheet.getRange('J:K').setNumberFormat('0.00');
  } else if (sheet.getName() === MARKETS_CONFIG.sheets.alerts) {
    sheet.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm:ss');
    sheet.getRange('C:C').setNumberFormat('yyyy-mm-dd');
    sheet.getRange('N:O').setNumberFormat('0.00');
  } else if (sheet.getName() === MARKETS_CONFIG.sheets.alertPreferences) {
    sheet.getRange('F:G').setNumberFormat('0.0');
    sheet.getRange('I:J').setNumberFormat('0.00');
    sheet.getRange('N:N').setNumberFormat('yyyy-mm-dd hh:mm:ss');
    sheet.getRange('S:T').setNumberFormat('0.00');
    sheet.getRange('V:W').setNumberFormat('0.00');
    sheet.getRange('Y:Z').setNumberFormat('0.00');
    sheet.getRange('AB:AE').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  } else if (sheet.getName() === MARKETS_CONFIG.sheets.runs) {
    sheet.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  }
}

function ensureSheetCapacity_(sheet, requiredRows, requiredColumns) {
  if (sheet.getMaxRows() < requiredRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), requiredRows - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < requiredColumns) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredColumns - sheet.getMaxColumns());
  }
}

function readControl_(ss) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.control);
  const rows = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues() : [];
  const control = rows.reduce(function (out, row) {
    const key = trimString_(row[0]);
    if (key) out[key] = row[1];
    return out;
  }, {});
  return control;
}

function readAppCatalog_(ss) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.catalog);
  if (sheet.getLastRow() <= 1) throw new Error('APP_CATALOG esta vacio. Importe el libro maestro antes de ejecutar.');
  const headers = sheet.getRange(1, 1, 1, MARKETS_CONFIG.headers.catalog.length).getValues()[0];
  const indexes = indexHeaders_(headers);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  const seen = {};
  const catalog = rows.filter(function (row) { return trimString_(row[indexes.app_key]); }).map(function (row) {
    const app = {
      appKey: trimString_(row[indexes.app_key]),
      platform: trimString_(row[indexes.platform]),
      store: trimString_(row[indexes.store]),
      countryCode: trimString_(row[indexes.country_code]).toUpperCase(),
      country: trimString_(row[indexes.country]),
      appName: trimString_(row[indexes.app_name]),
      appId: trimString_(row[indexes.app_id]),
      packageName: trimString_(row[indexes.package_name]),
      isBbva: parseBoolean_(row[indexes.is_bbva], false),
      enabled: parseBoolean_(row[indexes.enabled], true),
      locale: trimString_(row[indexes.locale]) || 'en',
      minObservations7d: toNonNegativeInteger_(row[indexes.min_observations_7d]) || 5,
      competitorAlerts: parseBoolean_(row[indexes.competitor_alerts], true),
      countryPlatformWeight: nonNegativeNumberOrZero_(row[indexes.country_platform_weight]),
      groupUserWeight: nonNegativeNumberOrZero_(row[indexes.group_user_weight]),
      displayOrder: toNonNegativeInteger_(row[indexes.display_order]),
      marketSegment: trimString_(row[indexes.market_segment]) || 'BANK',
      productScope: trimString_(row[indexes.product_scope]) || 'BUSINESS',
      weightSource: trimString_(row[indexes.weight_source]),
      weightEffectiveDate: row[indexes.weight_effective_date],
      commercialEligible: parseBoolean_(row[indexes.commercial_eligible], false),
      commercialEvidenceUrl: trimString_(row[indexes.commercial_evidence_url]),
      storeEvidenceUrl: trimString_(row[indexes.store_evidence_url]),
      verifiedAt: row[indexes.verified_at]
    };
    if (seen[app.appKey]) throw new Error('APP_KEY duplicada: ' + app.appKey);
    seen[app.appKey] = true;
    validateCatalogApp_(app);
    return app;
  });
  return catalog.filter(function (app) { return app.enabled; });
}

function replaceSheetData_(sheet, headers, rows) {
  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.clearContents();
  ensureSheetCapacity_(sheet, Math.max(2, rows.length + 1), headers.length);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  applyTableStyle_(sheet, headers.length);
}

function validateCatalogApp_(app) {
  if (['Android', 'iOS', 'Huawei'].indexOf(app.platform) < 0) {
    throw new Error('Plataforma no soportada en ' + app.appKey + ': ' + app.platform);
  }
  if (!app.countryCode || !app.appName) throw new Error('Pais o aplicacion vacios en ' + app.appKey);
  if (app.platform === 'iOS' && !app.appId) throw new Error('APP_ID iOS vacio en ' + app.appKey);
  if ((app.platform === 'Android' || app.platform === 'Huawei') && !app.packageName) {
    throw new Error('PACKAGE_NAME vacio en ' + app.appKey);
  }
  if (['BANK', 'FINTECH'].indexOf(app.marketSegment) < 0) {
    throw new Error('MARKET_SEGMENT no soportado en ' + app.appKey + ': ' + app.marketSegment);
  }
  if (app.marketSegment !== 'BANK' && (!app.commercialEligible || app.productScope !== 'COMMERCIAL' ||
      !app.commercialEvidenceUrl || !app.storeEvidenceUrl || !app.verifiedAt)) {
    throw new Error('Competidor digital sin evidencia commercial completa en ' + app.appKey);
  }
}

function upsertRowsByKey_(sheet, rows, width) {
  if (!rows.length) return 0;
  const lastRow = sheet.getLastRow();
  const existingKeys = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues() : [];
  const rowByKey = {};
  existingKeys.forEach(function (row, index) {
    const key = trimString_(row[0]);
    if (key) rowByKey[key] = index + 2;
  });
  const updates = [];
  const inserts = [];
  rows.forEach(function (row) {
    const existingRow = rowByKey[trimString_(row[0])];
    if (existingRow) updates.push({ rowNumber: existingRow, values: row });
    else inserts.push(row);
  });
  writeUpdatesInBlocks_(sheet, updates, width);
  if (inserts.length) {
    const start = sheet.getLastRow() + 1;
    ensureSheetCapacity_(sheet, start + inserts.length - 1, width);
    sheet.getRange(start, 1, inserts.length, width).setValues(inserts);
  }
  refreshFilter_(sheet, width);
  return updates.length + inserts.length;
}

function refreshFilter_(sheet, width) {
  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.getRange(1, 1, Math.max(2, sheet.getLastRow()), width).createFilter();
}

function writeUpdatesInBlocks_(sheet, updates, width) {
  if (!updates.length) return;
  updates.sort(function (a, b) { return a.rowNumber - b.rowNumber; });
  let block = [updates[0]];
  for (let i = 1; i < updates.length; i += 1) {
    if (updates[i].rowNumber === block[block.length - 1].rowNumber + 1) block.push(updates[i]);
    else {
      writeUpdateBlock_(sheet, block, width);
      block = [updates[i]];
    }
  }
  writeUpdateBlock_(sheet, block, width);
}

function writeUpdateBlock_(sheet, block, width) {
  sheet.getRange(block[0].rowNumber, 1, block.length, width)
    .setValues(block.map(function (item) { return item.values; }));
}

function appendRunLog_(ss, row) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.runs);
  ensureSheetCapacity_(sheet, sheet.getLastRow() + 1, MARKETS_CONFIG.headers.runs.length);
  sheet.appendRow(row);
}

function appendFetchLog_(ss, runId, referenceDate, fetchedAt, results) {
  const sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.fetchLog);
  const rows = (results || []).map(function (result) {
    const status = result.ok ? 'OK' : result.noRating ? 'NO_RATING' : 'ERROR';
    return [runId, referenceDate, fetchedAt, result.app.appKey, result.app.platform,
      result.app.countryCode, result.app.marketSegment, status, result.status || 0,
      result.ok ? result.rating : '', result.ok && result.ratingCount !== null ? result.ratingCount : '',
      Boolean(result.retryable), result.error || '', result.app.store + ' API'];
  });
  if (!rows.length) return 0;
  const start = sheet.getLastRow() + 1;
  ensureSheetCapacity_(sheet, start + rows.length - 1, MARKETS_CONFIG.headers.fetchLog.length);
  sheet.getRange(start, 1, rows.length, MARKETS_CONFIG.headers.fetchLog.length).setValues(rows);
  refreshFilter_(sheet, MARKETS_CONFIG.headers.fetchLog.length);
  return rows.length;
}
