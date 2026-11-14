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
    for (const [table, folderKind] of [['runs', 'executions'], ['usage', 'telemetry']]) {
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
  let checkpoint = previous, material, file;
  if (checkpoint) {
    file = DriveApp.getFileById(checkpoint.fileId);
    material = file.getBlob().getDataAsString();
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
    const filename = date + '-' + name + '-' + digest.slice(0, 18) + '.json';
    const folder = DriveApp.getFolderById(folderId);
    const matches = folder.getFilesByName(filename);
    file = matches.hasNext() ? matches.next() : folder.createFile(filename, material, MimeType.PLAIN_TEXT);
    if (matches.hasNext() || file.getBlob().getDataAsString() !== material) throw new Error('Archivo no verificable: ' + name);
    checkpoint = { fileId: file.getId(), digest, count: eligible.length, total, nextRow };
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
