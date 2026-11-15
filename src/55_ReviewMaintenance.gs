const MARKETS_STORAGE_DEFAULTS = Object.freeze({
  telemetry: '1FpYAwz5FjbFGDOxj_00npphfWXNFUryW',
  executions: '1KZAZKCJnDM8KhXlVd2RK7CsfHTBFcasc',
  backups: '1iU5uOmK5bR2RPodxbwCxDkzSkIbWJ-2d',
  captures: '1Pkd_EHftNWYBeb5ren_n-UQlJIG3LZTm',
  alerts: '17Efjh8-PLL1-TiilfRBLXpbZ3AO1L6jM',
  experience: '1CHGxHEF4KBhiLI7PA0cGrorp7y0zUrfG'
});
const MARKETS_BACKUP_PROPERTY = 'MARKETS_MONTHLY_BACKUP';

function marketsStorageFolders_(properties) {
  return { ...MARKETS_STORAGE_DEFAULTS, ...(safeJsonParse_(properties.getProperty('MARKETS_STORAGE_FOLDERS')) || {}) };
}

function saveMarketsStorageFolder(kind, id) {
  requireMarketsReviewOwner_();
  if (!Object.hasOwn(MARKETS_STORAGE_DEFAULTS, kind) || typeof id !== 'string' || !/^[\w-]{15,100}$/.test(id)) {
    throw new Error('Destino Drive no válido.');
  }
  const name = DriveApp.getFolderById(id).getName();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Hay otra operación en curso.');
  try {
    const properties = PropertiesService.getScriptProperties();
    const folders = marketsStorageFolders_(properties);
    folders[kind] = id;
    properties.setProperty('MARKETS_STORAGE_FOLDERS', JSON.stringify(folders));
    return { id, name };
  } finally {
    lock.releaseLock();
  }
}

function advanceMarketsMonthlyBackup_(now = new Date(), manual = false) {
  const properties = PropertiesService.getScriptProperties();
  const job = marketsReviewJobSettings_(properties).backup;
  if (!job?.enabled || (!manual && !marketsReviewJobReady_({ backup: job }, 'backup', now))) return;
  const month = Utilities.formatDate(now, job.timeZone, 'yyyyMM');
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return;
  try {
    const previous = safeJsonParse_(properties.getProperty(MARKETS_BACKUP_PROPERTY)) || {};
    if (previous.month === month && (previous.id || previous.retryAt > now.getTime())) return;
    const ss = openMarketsSpreadsheet_();
    const name = previous.month === month ? previous.name : Utilities.formatDate(now, job.timeZone, 'yyyyMMdd') + '-Market-Pulse';
    const folderId = previous.month === month ? previous.folderId : marketsStorageFolders_(properties).backups;
    const state = { month, name, folderId, updatedAt: now.toISOString() };
    try {
      const folder = DriveApp.getFolderById(folderId);
      const candidates = folder.getFilesByName(name);
      // Después de un timeout no se puede saber si Drive aceptó makeCopy.
      // Se recupera solo una copia verificable por su nombre y estructura.
      let backup;
      if (candidates.hasNext()) {
        backup = candidates.next();
        if (candidates.hasNext()) throw new Error('Hay varias copias con el nombre previsto.');
        const sourceTabs = ss.getSheets().map(sheet => sheet.getName());
        const backupTabs = SpreadsheetApp.openById(backup.getId()).getSheets().map(sheet => sheet.getName());
        if (JSON.stringify(sourceTabs) !== JSON.stringify(backupTabs)) throw new Error('La copia existente requiere revisión.');
      } else {
        properties.setProperty(MARKETS_BACKUP_PROPERTY, JSON.stringify({ ...state, retryAt: now.getTime() + 3600000 }));
        backup = DriveApp.getFileById(ss.getId()).makeCopy(name, folder);
      }
      if (backup.getMimeType() !== MimeType.GOOGLE_SHEETS || backup.getName() !== name) {
        throw new Error('No se pudo verificar la copia del Google Sheet.');
      }
      state.id = backup.getId();
      state.sizeBytes = backup.getSize();
      state.status = 'Completado';
    } catch (error) {
      state.status = 'Reintento pendiente';
      state.retryAt = now.getTime() + 3600000;
      state.error = errorToString_(error).slice(0, 180);
    }
    properties.setProperty(MARKETS_BACKUP_PROPERTY, JSON.stringify(state));
  } finally {
    lock.releaseLock();
  }
}

const MARKETS_MAINTENANCE_PROPERTY = 'MARKETS_REVIEW_MAINTENANCE';
const MARKETS_LOG_RETENTION = 'MARKETS_LOG_RETENTION_DAYS';

function marketsLogRetentionDays_(properties) {
  return Number(properties.getProperty(MARKETS_LOG_RETENTION)) || 15;
}

function advanceMarketsReviewMaintenance_(now = new Date(), manual = false) {
  const properties = PropertiesService.getScriptProperties();
  const job = marketsReviewJobSettings_(properties).maintenance;
  if (!job?.enabled || (!manual && !marketsReviewJobReady_({ maintenance: job }, 'maintenance', now))) return false;
  const day = Utilities.formatDate(now, job.timeZone, 'yyyy-MM-dd');
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return false;
  try {
    const previous = safeJsonParse_(properties.getProperty(MARKETS_MAINTENANCE_PROPERTY)) || {};
    if (previous.day === day && ((!manual && previous.status === 'Completado') || previous.retryAt > now.getTime())) return false;
    const ss = openMarketsSpreadsheet_();
    const state = { day, updatedAt: now.toISOString(), status: 'Completado' };
    try {
      const sheet = marketsReviewSheet_(ss);
      const total = Math.max(0, sheet.getLastRow() - 1);
      const seen = new Set();
      state.total = total;
      state.invalid = 0;
      state.duplicates = 0;
      const rows = total ? sheet.getRange(2, 1, total, 8).getValues() : [];
      for (const [key, , , platform, store, review, date, rating] of rows) {
        if (!key || !store || !review || !['Android', 'iOS'].includes(platform) ||
            !Number.isFinite(Date.parse(date)) || !Number.isInteger(rating) || rating < 1 || rating > 5) state.invalid++;
        if (key && seen.has(key)) state.duplicates++;
        if (key) seen.add(key);
      }
      state.converted = convertMarketsLogArchives_(ss, properties);
      state.archived = archiveMarketsOperationalLogs_(ss, properties, now);
    } catch (error) {
      state.status = 'Reintento pendiente';
      state.retryAt = now.getTime() + 3600000;
      state.error = errorToString_(error).slice(0, 180);
    }
    properties.setProperty(MARKETS_MAINTENANCE_PROPERTY, JSON.stringify(state));
    return true;
  } finally {
    lock.releaseLock();
  }
}

/** Archive complete rows, verify Drive content, then remove the unchanged prefix. */
function archiveMarketsOperationalLogs_(ss, properties, now) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Los registros están en uso. Se reintentará el archivado.');
  try {
    const cutoff = now.getTime() - marketsLogRetentionDays_(properties) * 86400000;
    const folders = marketsStorageFolders_(properties);
    let archived = 0;
    for (const [table, folderKind] of [['runs', 'executions'], ['usage', 'telemetry'], ['fetchLog', 'captures']]) {
      const name = MARKETS_CONFIG.sheets[table], headers = MARKETS_CONFIG.headers[table];
      if (!ss.getSheetByName(name)) continue;
      const sheet = requireCurrentSheetContract_(ss, name, headers);
      archived += archiveMarketsLogPrefix_(ss, sheet, headers, folders[folderKind], cutoff, properties, now);
    }
    return archived;
  } finally { lock.releaseLock(); }
}

function archiveMarketsLogPrefix_(ss, sheet, headers, folderId, cutoff, properties, now) {
  const name = sheet.getName(), width = headers.length, key = 'MARKETS_FULL_LOG_ARCHIVE:' + name;
  const previous = safeJsonParse_(properties.getProperty(key));
  const total = sheet.getLastRow() - 1;
  const read = count => sheet.getRange(2, 1, count, width).getValues();
  let checkpoint = previous, material;
  if (checkpoint) {
    material = readMarketsLogArchive_(DriveApp.getFileById(checkpoint.fileId));
    if (marketsReviewDigest_(material) !== checkpoint.digest) throw new Error('El archivo previo cambió: ' + name);
    const before = JSON.stringify(JSON.parse(material).rows[0]);
    const current = total > 0 ? JSON.stringify(read(1)[0]) : 'null';
    if (total === checkpoint.total - checkpoint.count && current !== before && current === checkpoint.nextRow) {
      properties.deleteProperty(key);
      return 0;
    }
  } else {
    const rows = total > 0 ? read(Math.min(total, 101)) : [];
    const eligible = [];
    for (const row of rows.slice(0, 100)) {
      if (!(new Date(row[0]).getTime() < cutoff) || !row[0]) break;
      eligible.push(row);
    }
    if (!eligible.length) return 0;
    const nextRow = JSON.stringify(rows[eligible.length] || null);
    if (nextRow === JSON.stringify(eligible[0])) throw new Error('Límite de archivo ambiguo: ' + name);
    material = JSON.stringify({ origin: ss.getId(), table: name, headers, rows: eligible });
    const digest = marketsReviewDigest_(material);
    const date = Utilities.formatDate(now, MARKETS_CONFIG.timeZone, 'yyyy-MM-dd');
    const filename = date + '-' + name + '-' + digest.slice(0, 18);
    const fileId = writeMarketsLogArchive_(DriveApp.getFolderById(folderId), filename, material, properties);
    checkpoint = { fileId, digest, count: eligible.length, total, nextRow };
    properties.setProperty(key, JSON.stringify(checkpoint));
  }
  const payload = JSON.parse(material);
  if (payload.origin !== ss.getId() || payload.table !== name || JSON.stringify(payload.headers) !== JSON.stringify(headers) ||
      payload.rows.length !== checkpoint.count || total < checkpoint.count ||
      JSON.stringify(read(checkpoint.count)) !== JSON.stringify(payload.rows) ||
      JSON.stringify(total > checkpoint.count ? sheet.getRange(checkpoint.count + 2, 1, 1, width).getValues()[0] : null) !== checkpoint.nextRow) {
    throw new Error('El origen cambió durante el archivado: ' + name);
  }
  sheet.deleteRows(2, checkpoint.count);
  SpreadsheetApp.flush();
  const after = sheet.getLastRow() - 1;
  if (after !== total - checkpoint.count || (after > 0 ? JSON.stringify(read(1)[0]) : 'null') !== checkpoint.nextRow) {
    throw new Error('No se pudo confirmar el borrado: ' + name);
  }
  properties.deleteProperty(key);
  return checkpoint.count;
}


function readMarketsLogArchive_(file) {
  if (file.getMimeType() !== MimeType.GOOGLE_SHEETS) return file.getBlob().getDataAsString();
  const book = SpreadsheetApp.openById(file.getId());
  const [origin, table, count] = book.getSheetByName('Archivo').getRange(2, 1, 1, 3).getValues()[0];
  const data = book.getSheetByName('Datos');
  if (!Number.isInteger(count) || count < 1 || data.getLastRow() !== count + 1) throw new Error('Filas de archivo no verificables.');
  const [headers, ...rows] = data.getDataRange().getValues();
  return JSON.stringify({ origin, table, headers, rows });
}

function writeMarketsLogArchive_(folder, name, material, properties) {
  const digest = marketsReviewDigest_(material);
  const staging = 'MARKETS_LOG_ARCHIVE_STAGE:' + digest;
  const matches = folder.getFilesByName(name);
  if (matches.hasNext()) {
    const existing = matches.next();
    if (matches.hasNext() || existing.getMimeType() !== MimeType.GOOGLE_SHEETS ||
        readMarketsLogArchive_(existing) !== material) throw new Error('Archivo no verificable: ' + name);
    properties.deleteProperty(staging);
    return existing.getId();
  }
  const pending = properties.getProperty(staging);
  const book = pending ? SpreadsheetApp.openById(pending) : SpreadsheetApp.create(name);
  const id = book.getId();
  properties.setProperty(staging, id);
  const { origin, table, headers, rows } = JSON.parse(material);
  const info = book.getSheets()[0].setName('Archivo');
  info.getRange(1, 1, 2, 3).setValues([['Origen', 'Tabla', 'Filas'], [origin, table, rows.length]]);
  const data = book.getSheetByName('Datos') || book.insertSheet('Datos');
  ensureSheetCapacity_(data, rows.length + 1, headers.length);
  data.getRange(1, 1, rows.length + 1, headers.length).setNumberFormat('@')
    .setValues([headers, ...rows].map(row => row.map(marketsReviewLiteral_)));
  data.setFrozenRows(1);
  SpreadsheetApp.flush();
  const file = DriveApp.getFileById(id);
  if (readMarketsLogArchive_(file) !== material) throw new Error('Contenido de archivo no verificable: ' + name);
  file.moveTo(folder);
  const parents = file.getParents();
  if (!parents.hasNext() || parents.next().getId() !== folder.getId() || parents.hasNext()) {
    throw new Error('Carpeta de archivo no verificable: ' + name);
  }
  properties.deleteProperty(staging);
  return id;
}

/** Keep the JSON originals available for recovery after validating the native copies. */
function convertMarketsLogArchives_(ss, properties) {
  const folders = marketsStorageFolders_(properties);
  let count = 0;
  for (const [table, kind] of [['runs', 'executions'], ['usage', 'telemetry'], ['fetchLog', 'captures']]) {
    const folder = DriveApp.getFolderById(folders[kind]);
    const files = folder.getFilesByType(MimeType.PLAIN_TEXT);
    const name = MARKETS_CONFIG.sheets[table], headers = MARKETS_CONFIG.headers[table];
    while (files.hasNext() && count < 6) {
      const original = files.next();
      const filename = original.getName();
      if (!filename.endsWith('.json') || !filename.includes('-' + name + '-')) continue;
      const digestKey = 'MARKETS_CONVERTED_LOG:' + original.getId();
      if (properties.getProperty(digestKey)) continue;
      const payload = JSON.parse(original.getBlob().getDataAsString());
      if (payload.origin !== ss.getId() || payload.table !== name ||
          JSON.stringify(payload.headers) !== JSON.stringify(headers) || !Array.isArray(payload.rows) ||
          !payload.rows.length || payload.rows.some(row => !Array.isArray(row) || row.length !== headers.length)) {
        throw new Error('Archivo anterior fuera del contrato: ' + filename);
      }
      const id = writeMarketsLogArchive_(folder, filename.slice(0, -5), JSON.stringify(payload), properties);
      properties.setProperty(digestKey, id);
      count++;
    }
  }
  return count;
}
