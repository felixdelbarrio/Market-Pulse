function openMarketsSpreadsheet_() {
  return SpreadsheetApp.openById(MARKETS_CONFIG.spreadsheetId);
}

function ensureWorkbookSchema_(ss) {
  const definitions = [
    [MARKETS_CONFIG.sheets.control, MARKETS_CONFIG.headers.control],
    [MARKETS_CONFIG.sheets.catalog, MARKETS_CONFIG.headers.catalog],
    [MARKETS_CONFIG.sheets.ratings, MARKETS_CONFIG.headers.ratings],
    [MARKETS_CONFIG.sheets.reviews, MARKETS_CONFIG.headers.reviews],
    [MARKETS_CONFIG.sheets.alerts, MARKETS_CONFIG.headers.alerts],
    [MARKETS_CONFIG.sheets.runs, MARKETS_CONFIG.headers.runs]
  ];
  definitions.forEach(function (definition) {
    const sheet = getOrCreateSheet_(ss, definition[0]);
    ensureExactHeader_(sheet, definition[1]);
    applyTableStyle_(sheet, definition[1].length);
  });
  seedControl_(ss.getSheetByName(MARKETS_CONFIG.sheets.control));
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function ensureExactHeader_(sheet, expected) {
  ensureSheetCapacity_(sheet, 2, expected.length);
  const currentWidth = Math.max(sheet.getLastColumn(), expected.length);
  const current = sheet.getRange(1, 1, 1, currentWidth).getValues()[0]
    .slice(0, expected.length).map(trimString_);
  const hasContent = current.some(function (value) { return Boolean(value); });
  if (!hasContent) {
    sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
    return;
  }
  const mismatch = expected.some(function (header, index) { return current[index] !== header; });
  if (mismatch) {
    throw new Error('Contrato incompatible en ' + sheet.getName() + '. Esperado: ' + expected.join(', '));
  }
}

function seedControl_(sheet) {
  if (sheet.getLastRow() > 1) return;
  sheet.getRange(2, 1, MARKETS_CONFIG.controlDefaults.length, 3)
    .setValues(MARKETS_CONFIG.controlDefaults.map(function (row) { return row.slice(); }));
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
    sheet.getRange('M:Q').setNumberFormat('0.00');
    sheet.getRange('T:T').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  } else if (sheet.getName() === MARKETS_CONFIG.sheets.reviews) {
    sheet.getRange('C:C').setNumberFormat('yyyy-mm-dd hh:mm:ss');
    sheet.getRange('R:R').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  } else if (sheet.getName() === MARKETS_CONFIG.sheets.alerts) {
    sheet.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm:ss');
    sheet.getRange('C:C').setNumberFormat('yyyy-mm-dd');
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
  return rows.reduce(function (out, row) {
    const key = trimString_(row[0]);
    if (key) out[key] = row[1];
    return out;
  }, {});
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
      recipients: trimString_(row[indexes.alert_recipients]),
      warningDrop: Math.abs(toFiniteNumber_(row[indexes.warning_drop]) || 0.30),
      criticalDrop: Math.abs(toFiniteNumber_(row[indexes.critical_drop]) || 0.50),
      minObservations7d: toNonNegativeInteger_(row[indexes.min_observations_7d]) || 5,
      competitorAlerts: parseBoolean_(row[indexes.competitor_alerts], true)
    };
    if (seen[app.appKey]) throw new Error('APP_KEY duplicada: ' + app.appKey);
    seen[app.appKey] = true;
    validateCatalogApp_(app);
    return app;
  });
  return catalog.filter(function (app) { return app.enabled; });
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
  if (app.platform === 'Huawei' && !app.appId) throw new Error('APP_ID Huawei verificado vacio en ' + app.appKey);
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
