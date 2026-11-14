const MARKETS_STORAGE_DEFAULTS = Object.freeze({
  telemetry: '1FpYAwz5FjbFGDOxj_00npphfWXNFUryW',
  executions: '1KZAZKCJnDM8KhXlVd2RK7CsfHTBFcasc',
  backups: '1iU5uOmK5bR2RPodxbwCxDkzSkIbWJ-2d',
  captures: '1Pkd_EHftNWYBeb5ren_n-UQlJIG3LZTm',
  alerts: '17Efjh8-PLL1-TiilfRBLXpbZ3AO1L6jM'
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

function advanceMarketsMonthlyBackup_(now = new Date()) {
  const properties = PropertiesService.getScriptProperties();
  const job = marketsReviewJobSettings_(properties).backup;
  if (!job?.enabled || !marketsReviewJobReady_({ backup: job }, 'backup', now)) return;
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
const MARKETS_LOG_ARCHIVE_DAYS = 180;

function advanceMarketsReviewMaintenance_(now = new Date(), manual = false) {
  const properties = PropertiesService.getScriptProperties();
  const job = marketsReviewJobSettings_(properties).maintenance;
  if (!job?.enabled || (!manual && !marketsReviewJobReady_({ maintenance: job }, 'maintenance', now))) return false;
  const day = Utilities.formatDate(now, job.timeZone, 'yyyy-MM-dd');
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return false;
  try {
    const previous = safeJsonParse_(properties.getProperty(MARKETS_MAINTENANCE_PROPERTY)) || {};
    if (previous.day === day && (previous.status === 'Completado' || previous.retryAt > now.getTime())) return false;
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

/** Archive bounded, aggregate-only samples. Source logs remain available for existing reports. */
function archiveMarketsOperationalLogs_(ss, properties, now) {
  const cutoff = now.getTime() - MARKETS_LOG_ARCHIVE_DAYS * 86400000;
  const folders = marketsStorageFolders_(properties);
  const tables = [
    ['runs', 'executions', [0, 2, 3, 4, 5, 6, 7, 9]],
    ['usage', 'telemetry', [0, 3, 4, 5, 7, 8]]
  ];
  let archived = 0;
  for (const [table, folderKind, columns] of tables) {
    const name = MARKETS_CONFIG.sheets[table], headers = MARKETS_CONFIG.headers[table];
    const sheet = ss.getSheetByName(name);
    if (!sheet) continue;
    requireCurrentSheetContract_(ss, name, headers);
    const property = 'MARKETS_LOG_ARCHIVE:' + name;
    const next = Number(properties.getProperty(property)) || 2;
    const count = Math.min(100, sheet.getLastRow() - next + 1);
    if (count <= 0) continue;
    const rows = sheet.getRange(next, 1, count, headers.length).getDisplayValues();
    const firstCurrent = rows.findIndex(row => !(Date.parse(row[0]) < cutoff));
    const eligible = firstCurrent < 0 ? rows : rows.slice(0, firstCurrent);
    if (!eligible.length) continue;
    const material = JSON.stringify({ origin: ss.getId(), table: name, firstRow: next,
      headers: columns.map(column => headers[column]), rows: eligible.map(row => columns.map(column => row[column])) });
    const digest = marketsReviewDigest_(material).slice(0, 18);
    const filename = name + '-' + next + '-' + digest + '.json';
    const folder = DriveApp.getFolderById(folders[folderKind]);
    const matches = folder.getFilesByName(filename);
    const file = matches.hasNext() ? matches.next() : folder.createFile(filename, material, MimeType.PLAIN_TEXT);
    if (matches.hasNext() || file.getBlob().getDataAsString() !== material) throw new Error('Archivo operativo no verificable: ' + name);
    properties.setProperty(property, String(next + eligible.length));
    archived += eligible.length;
  }
  return archived;
}
