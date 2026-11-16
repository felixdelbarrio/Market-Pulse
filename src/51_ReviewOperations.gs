/** Supervisor de reseñas. Cada ejecución avanza una etapa, con cursores y resultados persistentes. */
const MARKETS_REVIEW_SUPERVISOR = 'superviseMarketsReviews_';
const MARKETS_REVIEW_PIPELINE_KEY = 'MARKETS_REVIEW_PIPELINE';
const MARKETS_REVIEW_PIPELINE_STAGES = Object.freeze([
  { id: 'ios', label: 'Captura de App Store', priority: 1 },
  { id: 'android', label: 'Captura de Google Play', priority: 1 },
  { id: 'translate', label: 'Traducción de reseñas y respuestas', priority: 4 },
  { id: 'publish', label: 'Publicación de vistas de reseñas', priority: 5 },
  { id: 'alerts', label: 'Alertas de reseñas', priority: 2 }
]);

function installMarketsReviewSupervisor_() {
  const triggers = ScriptApp.getProjectTriggers();
  if (!triggers.some(trigger => trigger.getHandlerFunction() === MARKETS_REVIEW_SUPERVISOR)) {
    ScriptApp.newTrigger(MARKETS_REVIEW_SUPERVISOR).timeBased().everyMinutes(5).create();
    PropertiesService.getScriptProperties().setProperty(MARKETS_REVIEW_INTERVAL, '5');
  }
  const handlers = [collectMarketsReviews_.name, collectMarketsPlayReviews_.name, translateMarketsReviews_.name];
  triggers.filter(trigger => handlers.includes(trigger.getHandlerFunction()))
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
}

function newMarketsReviewPipeline_(day) {
  return { day, stage: 0, jobs: MARKETS_REVIEW_PIPELINE_STAGES.map(({ id, label, priority }) => ({
    id, label, priority, status: 'Pendiente', done: 0, total: 0, added: 0, updated: 0, failures: 0, retries: 0
  })) };
}

function readMarketsReviewPipeline_(properties) {
  return safeJsonParse_(properties.getProperty(MARKETS_REVIEW_PIPELINE_KEY));
}

function requestMarketsReviewPipeline() {
  requireMarketsReviewOwner_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Hay una operación en curso. Vuelve a intentarlo.');
  try {
    if (!ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === MARKETS_REVIEW_SUPERVISOR)) {
      throw new Error('El propietario debe configurar el supervisor de reseñas desde setupMarketsReviews.');
    }
    const properties = PropertiesService.getScriptProperties();
    const pipeline = readMarketsReviewPipeline_(properties);
    if (pipeline && (pipeline.leaseUntil > Date.now() ||
        (pipeline.stage < pipeline.jobs.length && pipeline.jobs[pipeline.stage].status !== 'Revisar'))) {
      return { queued: false };
    }
    const day = Utilities.formatDate(new Date(), MARKETS_CONFIG.timeZone, 'yyyy-MM-dd');
    properties.setProperty(MARKETS_REVIEW_PIPELINE_KEY, JSON.stringify(newMarketsReviewPipeline_(day)));
    return { queued: true };
  } finally {
    lock.releaseLock();
  }
}

const MARKETS_REVIEW_WORKER = 'runMarketsReviewWorker_';
const MARKETS_REVIEW_INTERVAL = 'MARKETS_REVIEW_SUPERVISOR_INTERVAL';

function configureMarketsReviewSupervisor(minutes = 5) {
  requireMarketsReviewOwner_();
  if (![1, 5, 10, 15, 30].includes(minutes)) throw new Error('Intervalo de supervisor no válido.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Hay otra operación en curso.');
  try {
    const properties = PropertiesService.getScriptProperties();
    const existing = ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === MARKETS_REVIEW_SUPERVISOR);
    if (existing.length === 1 && Number(properties.getProperty(MARKETS_REVIEW_INTERVAL)) === minutes) return { minutes };
    ScriptApp.newTrigger(MARKETS_REVIEW_SUPERVISOR).timeBased().everyMinutes(minutes).create();
    existing.forEach(trigger => ScriptApp.deleteTrigger(trigger));
    properties.setProperty(MARKETS_REVIEW_INTERVAL, String(minutes));
    return { minutes };
  } finally {
    lock.releaseLock();
  }
}

function superviseMarketsReviews_() {
  const properties = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const now = Date.now();
    properties.setProperty('MARKETS_REVIEW_SUPERVISOR_LAST', new Date(now).toISOString());
    const workers = ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === MARKETS_REVIEW_WORKER);
    if (workers.length && Number(properties.getProperty('MARKETS_REVIEW_WORKER_AT')) > now - 420000) return;
    const pipeline = readMarketsReviewPipeline_(properties);
    if (pipeline?.leaseUntil > now) return;
    workers.forEach(trigger => ScriptApp.deleteTrigger(trigger));
    ScriptApp.newTrigger(MARKETS_REVIEW_WORKER).timeBased().after(60000).create();
    properties.setProperty('MARKETS_REVIEW_WORKER_AT', String(now));
  } finally {
    lock.releaseLock();
  }
}

function runMarketsReviewWorker_(event) {
  const worker = event?.triggerUid && ScriptApp.getProjectTriggers().find(trigger => trigger.getUniqueId() === event.triggerUid);
  try { if (!advanceMarketsScheduledOperations_()) advanceMarketsReviewPipeline_(); }
  finally { if (worker) ScriptApp.deleteTrigger(worker); }
}

const MARKETS_UNIFIED_OPERATIONS = 'MARKETS_UNIFIED_OPERATIONS';
const MARKETS_LEGACY_OPERATION_HANDLERS = ['runDailyRatingMonitor', 'checkDailyRatingMonitorHealth', 'runMarketsMonthlyNewsletter'];

/** Owner migration only. Start at the next local day to avoid replaying today's legacy triggers. */
function enableMarketsUnifiedSupervisor() {
  requireMarketsReviewOwner_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Hay otra operación en curso.');
  try {
    installMarketsReviewSupervisor_();
    const properties = PropertiesService.getScriptProperties();
    const existing = properties.getProperty(MARKETS_UNIFIED_OPERATIONS);
    const today = Utilities.formatDate(new Date(), MARKETS_CONFIG.timeZone, 'yyyy-MM-dd');
    // Delete only owned legacy schedules. Keep catalog onEdit and the one-shot worker.
    ScriptApp.getProjectTriggers().filter(trigger => MARKETS_LEGACY_OPERATION_HANDLERS.includes(trigger.getHandlerFunction()))
      .forEach(trigger => ScriptApp.deleteTrigger(trigger));
    if (!existing) properties.setProperty(MARKETS_UNIFIED_OPERATIONS, today);
    return { enabled: true, startsAfter: existing || today };
  } finally { lock.releaseLock(); }
}

function advanceMarketsScheduledOperations_(now = new Date(), healthOnly = false) {
  const properties = PropertiesService.getScriptProperties();
  const enabledAfter = properties.getProperty(MARKETS_UNIFIED_OPERATIONS);
  if (!enabledAfter) return false;
  const tz = MARKETS_CONFIG.timeZone;
  const day = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  if (day <= enabledAfter) return false;
  const time = Utilities.formatDate(now, tz, 'HHmm');
  const due = (hour, minute) => time >= String(hour).padStart(2, '0') + String(minute).padStart(2, '0');
  const operations = healthOnly
    ? [['health', due(MARKETS_CONFIG.healthCheckHour, MARKETS_CONFIG.healthCheckMinute), checkDailyRatingMonitorHealth]]
    : [
      ['ratings', due(MARKETS_CONFIG.runHour, MARKETS_CONFIG.runMinute), runDailyRatingMonitor],
      ['newsletter', day.endsWith('-01') && due(MARKETS_CONFIG.newsletterHour, MARKETS_CONFIG.newsletterMinute), runMarketsMonthlyNewsletter]
    ];
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return true;
  let selected;
  try {
    for (const [id, ready, run] of operations) {
      if (!ready) continue;
      const key = 'MARKETS_UNIFIED_RUN:' + id;
      const previous = safeJsonParse_(properties.getProperty(key));
      const manualKey = id === 'ratings' ? MARKETS_REVIEW_MANUAL + id : '';
      const request = manualKey && properties.getProperty(manualKey);
      const running = previous?.status === 'En curso' && now.getTime() - Date.parse(previous.startedAt) < 7 * 60000;
      if (running || (!request && previous?.day === day) || (request && previous?.request === request &&
          previous.retryAt > now.getTime())) continue;
      const attempts = request && previous?.request === request ? (previous.attempts || 0) + 1 : 1;
      if (attempts > 3) {
        properties.setProperty(key, JSON.stringify({ ...previous, status: 'ERROR', failure: 'Se agotaron los intentos de recuperación.' }));
        if (properties.getProperty(manualKey) === request) properties.deleteProperty(manualKey);
        continue;
      }
      properties.setProperty(key, JSON.stringify({ day, status: 'En curso', startedAt: now.toISOString(), request, attempts }));
      selected = { key, run, manualKey, request, attempts };
      break;
    }
  } finally { lock.releaseLock(); }
  if (!selected) return false;
  let status = 'ERROR', retryAt = 0, failure = '';
  try {
    const result = selected.run();
    status = result?.status || 'OK';
  } catch (error) {
    failure = errorToString_(error).slice(0, 180);
    if (selected.request && selected.attempts < 3) retryAt = Date.now() + selected.attempts * 5 * 60000;
    console.error('Supervisor: ' + failure);
  } finally {
    properties.setProperty(selected.key, JSON.stringify({ day, status, startedAt: now.toISOString(),
      finishedAt: new Date().toISOString(), request: selected.request, attempts: selected.attempts, retryAt, failure }));
    if (selected.request && !retryAt && properties.getProperty(selected.manualKey) === selected.request) {
      properties.deleteProperty(selected.manualKey);
    }
  }
  return true;
}

function advanceMarketsReviewPipeline_() {
  const properties = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  let pipeline, job, background, settings, auxiliary, catalogIdle = false;
  try {
    const now = new Date();
    const day = Utilities.formatDate(now, MARKETS_CONFIG.timeZone, 'yyyy-MM-dd');
    pipeline = readMarketsReviewPipeline_(properties);
    settings = marketsReviewJobSettings_(properties);
    const previousFinished = !pipeline || pipeline.stage >= pipeline.jobs.length;
    if (pipeline?.day !== day && previousFinished &&
        Utilities.formatDate(now, MARKETS_CONFIG.timeZone, 'HHmm') >= '0800' &&
        !(pipeline?.leaseUntil > now.getTime())) {
      pipeline = newMarketsReviewPipeline_(day);
      properties.setProperty(MARKETS_REVIEW_PIPELINE_KEY, JSON.stringify(pipeline));
    }
    if (!pipeline || pipeline.leaseUntil > now.getTime()) return;
    const pending = pipeline.jobs.slice(pipeline.stage);
    const capturesPending = pending.some(stage =>
      ['ios', 'android'].includes(stage.id) && settings[stage.id]?.enabled !== false && stage.status !== 'Revisar');
    if (!pipeline.leaseUntil && pending.length) {
      const ready = pending.filter(stage => stage.status !== 'Revisar' && marketsReviewJobReady_(settings, stage.id, now) &&
        !(stage.workerRetryAt > now.getTime()) && (!capturesPending || ['ios', 'android'].includes(stage.id)))
        .sort((a, b) => (settings[a.id]?.priority || a.priority) - (settings[b.id]?.priority || b.priority));
      if (ready.length) {
        const next = pipeline.jobs.indexOf(ready[0]);
        if (next !== pipeline.stage) {
          [pipeline.jobs[pipeline.stage], pipeline.jobs[next]] = [pipeline.jobs[next], pipeline.jobs[pipeline.stage]];
          properties.setProperty(MARKETS_REVIEW_PIPELINE_KEY, JSON.stringify(pipeline));
        }
        job = ready[0];
      } else if (pending.every(stage => stage.status === 'Revisar' || settings[stage.id]?.enabled === false)) {
        for (const stage of pending) if (settings[stage.id]?.enabled === false) stage.status = 'Pausado';
        pipeline.stage = pipeline.jobs.length;
        properties.setProperty(MARKETS_REVIEW_PIPELINE_KEY, JSON.stringify(pipeline));
      }
    } else {
      job = pipeline.jobs[pipeline.stage];
    }
    if (!job && pipeline.stage >= pipeline.jobs.length) {
      background = true;
      const translation = pipeline.jobs.find(item => item.id === 'translate');
      const retryAt = Number(properties.getProperty(MARKETS_TRANSLATION_QUOTA_RETRY_KEY)) || 0;
      const publication = pipeline.jobs.find(item => item.id === 'publish');
      job = pipeline.translationSnapshotPending && publication.status !== 'Revisar' ? publication
        : translation.pending && now.getTime() >= retryAt ? translation : null;
    }
    if (job && (!marketsReviewJobReady_(settings, job.id, now) || job.workerRetryAt > now.getTime())) {
      job.status = settings[job.id]?.enabled === false ? 'Pausado' : 'Programado';
      properties.setProperty(MARKETS_REVIEW_PIPELINE_KEY, JSON.stringify(pipeline));
      job = null;
    }
    if (!job || job.status === 'Revisar') {
      catalogIdle = true;
    }
    const priority = catalogIdle ? (capturesPending ? 2 : Infinity) : settings[job.id]?.priority || job.priority;
    auxiliary = marketsReviewAuxiliaryTasks_(properties, settings, now, priority);
    if (auxiliary.length && !pipeline.leaseUntil) catalogIdle = true;
    if (catalogIdle && pipeline.leaseUntil) {
      delete pipeline.leaseUntil;
      properties.setProperty(MARKETS_REVIEW_PIPELINE_KEY, JSON.stringify(pipeline));
    }
    if (!catalogIdle && pipeline.leaseUntil) {
      job.retries++;
      job.error = 'La ejecución anterior agotó el tiempo disponible.';
      job.status = job.retries >= 3 ? 'Revisar' : 'Reintento pendiente';
      job.workerRetryAt = now.getTime() + 5 * 60000 * Math.pow(2, job.retries - 1);
      delete pipeline.leaseUntil;
      properties.setProperty(MARKETS_REVIEW_PIPELINE_KEY, JSON.stringify(pipeline));
      return;
    }
    // Una ejecución de Apps Script no puede superar los seis minutos.
    if (!catalogIdle) {
      pipeline.leaseUntil = now.getTime() + 7 * 60 * 1000;
      job.status = 'En curso';
      job.lastAttemptAt = now.toISOString();
      if (!job.startedAt) job.startedAt = now.toISOString();
      properties.setProperty(MARKETS_REVIEW_PIPELINE_KEY, JSON.stringify(pipeline));
    }
  } finally {
    lock.releaseLock();
  }
  if (catalogIdle) {
    for (const task of auxiliary) {
      if (runMarketsAuxiliaryTask_(properties, task)) return;
    }
    if (!job || job.status === 'Revisar') return;
    // A completed auxiliary check does not delay the ready pipeline stage.
    if (!lock.tryLock(1000)) return;
    try {
      const latest = readMarketsReviewPipeline_(properties);
      if (!latest || latest.leaseUntil > Date.now() || latest.day !== pipeline.day || latest.stage !== pipeline.stage) return;
      pipeline.leaseUntil = Date.now() + 7 * 60 * 1000;
      job.status = 'En curso';
      if (!job.startedAt) job.startedAt = new Date().toISOString();
      properties.setProperty(MARKETS_REVIEW_PIPELINE_KEY, JSON.stringify(pipeline));
    } finally { lock.releaseLock(); }
  }
  const previousProgress = JSON.stringify([job.done, job.added, job.updated, job.pending]);
  const batchStarted = Date.now();
  job.lastAttemptAt = new Date(batchStarted).toISOString();
  try {
    const complete = advanceMarketsReviewJob_(job, pipeline, background);
    job.retries = 0;
    delete job.error;
    delete job.workerRetryAt;
    if (background && job.id === 'translate' && job.batchTranslated) pipeline.translationSnapshotPending = true;
    if (background && job.id === 'publish' && complete) delete pipeline.translationSnapshotPending;
    if (complete) {
      job.status = job.failures || job.pending ? 'Parcial' : 'Completado';
      job.finishedAt = new Date().toISOString();
      if (!job.failures && !job.pending) job.lastSuccessAt = job.finishedAt;
      if (!background) pipeline.stage++;
    }
  } catch (error) {
    job.retries++;
    job.status = job.retries >= 3 ? 'Revisar' : 'Reintento pendiente';
    job.error = errorToString_(error).slice(0, 250);
    console.warn(job.label + ': ' + job.error);
    job.workerRetryAt = Date.now() + 5 * 60000 * Math.pow(2, job.retries - 1);
  }
  if (JSON.stringify([job.done, job.added, job.updated, job.pending]) !== previousProgress) {
    job.lastProgressAt = new Date().toISOString();
  }
  job.lastBatchMs = Date.now() - batchStarted;
  job.totalBatchMs = (job.totalBatchMs || 0) + job.lastBatchMs;
  job.measuredBatches = (job.measuredBatches || 0) + 1;
  delete pipeline.leaseUntil;
  properties.setProperty(MARKETS_REVIEW_PIPELINE_KEY, JSON.stringify(pipeline));
}

function advanceMarketsReviewJob_(job, pipeline, background) {
  switch (job.id) {
    case 'ios':
    case 'android': {
      const collect = job.id === 'ios' ? collectMarketsReviews_ : collectMarketsPlayReviews_;
      const result = collect(job.total ? Math.max(0, job.total - job.done) : Infinity);
      job.total = result.eligible ?? job.total;
      job.done += result.processed || 0;
      job.added += result.added || 0;
      job.updated += result.updated || 0;
      job.failures += result.failures || 0;
      if (result.rateLimited) job.rateLimits = (job.rateLimits || 0) + 1;
      return job.rateLimits >= 3 || (!result.deferred && job.done >= job.total);
    }
    case 'translate': {
      const result = translateMarketsReviews_();
      job.batchTranslated = (result.translated || 0) + (result.translatedReplies || 0);
      job.translatedReplies = (job.translatedReplies || 0) + (result.translatedReplies || 0);
      job.replyPending = result.replyPending;
      job.retryAt = result.retryAt || 0;
      if (result.deferred) return false;
      if (result.eligible !== undefined) {
        job.done = result.checked;
        job.total = result.eligible;
        job.updated += result.translated;
        job.failures = result.failed;
        job.pending = result.pending;
      } else if (result.quotaLimited) {
        job.pending = Math.max(job.pending || 0, 1);
      }
      job.batches = (job.batches || 0) + 1;
      return result.complete || result.quotaLimited || background || job.batches >= 4;
    }
    case 'publish': {
      const result = publishMarketsReviewSnapshot_();
      job.total = 1;
      job.done = Number(result.complete);
      job.added = result.published;
      return result.complete;
    }
    case 'alerts': {
      job.total = 1;
      if (pipeline.jobs.some(stage => ['ios', 'android'].includes(stage.id) && (stage.failures || stage.status !== 'Completado'))) {
        job.failures = 1;
      } else {
        job.added = processMarketsReviewAlerts_(pipeline.day);
      }
      job.done = 1;
      return true;
    }
    default:
      throw new Error('Etapa de reseñas desconocida.');
  }
}

const MARKETS_REVIEW_RECOVERY_KEY = 'MARKETS_REVIEW_SELECTIVE_RECOVERY';
const MARKETS_REVIEW_RECOVERY_LIMITS = Object.freeze({ Android: 20, iOS: 10 });

function marketsReviewRecoveryListings_(ss) {
  const catalog = readAppCatalog_(ss);
  const android = new Map();
  for (const app of catalog) {
    if (app.platform !== 'Android' || !/^[A-Z]{2}$/.test(app.countryCode) ||
        !/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i.test(app.packageName)) continue;
    const listing = app.packageName + '|' + app.countryCode;
    android.set(listing, android.has(listing) ? null : app);
  }
  return [...marketsIosReviewListings_(catalog), ...[...android.values()].filter(Boolean)];
}

function marketsReviewRecoveryState_(properties) {
  const state = safeJsonParse_(properties.getProperty(MARKETS_REVIEW_RECOVERY_KEY));
  if (!state) return null;
  const { cursor, seen, ...visible } = state;
  return visible;
}

function getMarketsReviewRecoveryOptions() {
  const { ss } = requireMarketsReviewOwner_();
  return {
    listings: marketsReviewRecoveryListings_(ss).map(({ appKey, appName, countryCode, platform }) =>
      ({ appKey, appName, countryCode, platform })),
    state: marketsReviewRecoveryState_(PropertiesService.getScriptProperties())
  };
}

function marketsReviewRecoveryScope_(ss, scope) {
  const today = Utilities.formatDate(new Date(), MARKETS_CONFIG.timeZone, 'yyyy-MM-dd');
  const day = scope?.mode === 'today' ? today : '';
  const month = day ? day.slice(0, 7) : scope?.month;
  if (typeof month !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month) ||
      month > Utilities.formatDate(new Date(), MARKETS_CONFIG.timeZone, 'yyyy-MM')) {
    throw new Error('Selecciona un mes válido.');
  }
  const app = marketsReviewRecoveryListings_(ss).find(listing => listing.appKey === scope?.appKey);
  if (!app) throw new Error('El escaparate no es válido o no se puede identificar de forma unívoca.');
  return { app, month, day };
}

function marketsReviewRecoveryMonth_(value) {
  return value instanceof Date ? Utilities.formatDate(value, MARKETS_CONFIG.timeZone, 'yyyy-MM') : String(value).slice(0, 7);
}

function getMarketsReviewCoverage(scope) {
  const { ss } = requireMarketsReviewOwner_();
  const { app, month } = marketsReviewRecoveryScope_(ss, scope);
  const sheet = marketsReviewSheet_(ss);
  const listing = String(app.platform === 'Android' ? app.packageName : app.appId);
  const adjacent = offset => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + offset, 1)).toISOString().slice(0, 7);
  const months = [adjacent(-1), month, adjacent(1)];
  const counts = new Map(months.map(key => [key, new Set()]));
  const height = sheet.getLastRow() - 1;
  const rows = height > 0 ? sheet.getRange(2, 3, height, 5).getValues() : [];
  for (const [markets, platform, store, reviewId, date] of rows) {
    if (reviewId && platform === app.platform && String(store) === listing && String(markets).split(',').includes(app.countryCode)) {
      counts.get(marketsReviewRecoveryMonth_(date))?.add(String(reviewId));
    }
  }
  const values = months.map(key => ({ month: key, count: counts.get(key).size }));
  return { values, status: values[1].count ? 'Observadas' :
    values[0].count && values[2].count ? 'Posible hueco' : 'Sin reseñas observadas' };
}

/** Una página por acción: no toca los cursores del supervisor ni ejecuta alertas. */
function runMarketsReviewRecovery(scope) {
  const { ss } = requireMarketsReviewOwner_();
  const { app, month, day } = marketsReviewRecoveryScope_(ss, scope);
  const properties = PropertiesService.getScriptProperties();
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return { deferred: true };
  try {
    const android = app.platform === 'Android';
    const pageLimit = MARKETS_REVIEW_RECOVERY_LIMITS[app.platform];
    const previous = safeJsonParse_(properties.getProperty(MARKETS_REVIEW_RECOVERY_KEY));
    const sameScope = previous?.appKey === app.appKey && previous.month === month && (previous.day || '') === day;
    if (!sameScope && previous && !previous.complete) {
      throw new Error('Termina la recuperación abierta o ciérrala antes de seleccionar otro periodo.');
    }
    const state = sameScope ? previous : { appKey: app.appKey, month, day, pages: 0, added: 0, updated: 0,
      unchanged: 0, failures: 0, cursor: android ? '' : 1, seen: [], complete: false, pageLimit };
    if (state.complete || state.retryAt > Date.now()) return marketsReviewRecoveryState_(properties);
    const pausedUntil = android ? Number(properties.getProperty('MARKETS_PLAY_REVIEW_PAUSE')) : 0;
    if (pausedUntil > Date.now()) return { deferred: true, retryAt: pausedUntil };
    try {
      const page = android ? fetchPlayReviewPage_(app, state.cursor) : fetchMarketsIosReviewPage_(app, state.cursor);
      const selected = page.rows.filter(row => {
        const date = android ? row.date : row[6];
        return day ? (date instanceof Date ? Utilities.formatDate(date, MARKETS_CONFIG.timeZone, 'yyyy-MM-dd') : String(date).slice(0, 10)) === day
          : marketsReviewRecoveryMonth_(date) === month;
      });
      const result = { added: 0, updated: 0 };
      if (selected.length) {
        const sheet = marketsReviewSheet_(ss), width = marketsReviewWidth_(sheet), height = sheet.getLastRow() - 1;
        const rows = height > 0 ? sheet.getRange(2, 1, height, width).getValues() : [];
        const known = new Map(rows.map((row, index) => [row[0], { row, index: index + 2 }]));
        if (android) storePlayReviews_(sheet, properties, known, app, selected, result, width);
        else storeMarketsIosReviews_(sheet, properties, known, selected, result, width);
        const unique = new Set(selected.map(row => android ? row.id : row[0]));
        state.unchanged += Math.max(0, unique.size - result.added - result.updated);
      }
      state.added += result.added;
      state.updated += result.updated;
      state.pages++;
      state.retryAt = 0;
      const next = android ? page.next : page.more ? state.cursor + 1 : null;
      if (android && state.cursor) state.seen.push(marketsReviewDigest_(state.cursor).slice(0, 12));
      if (!next) state.reason = 'source_end';
      else if (state.pages >= pageLimit) state.reason = 'page_limit';
      else if (android && (!/^[\x21-\x7e]{1,7800}$/.test(next) ||
          state.seen.includes(marketsReviewDigest_(next).slice(0, 12)))) state.reason = 'invalid_cursor';
      else state.cursor = next;
      state.complete = Boolean(state.reason);
      if (state.complete) state.cursor = null;
    } catch (error) {
      state.failures++;
      state.retryAt = Date.now() + (error.rateLimited ? 3600000 : 60000 * 2 ** Math.min(state.failures, 5));
      if (error.rateLimited) properties.setProperty('MARKETS_PLAY_REVIEW_PAUSE', String(state.retryAt));
      if (android && state.cursor && /HTTP (400|404)$/.test(error.message)) {
        state.reason = 'invalid_cursor';
        state.complete = true;
        state.cursor = null;
      }
      console.warn('Recuperación selectiva: ' + error.message);
    }
    properties.setProperty(MARKETS_REVIEW_RECOVERY_KEY, JSON.stringify(state));
    return marketsReviewRecoveryState_(properties);
  } finally {
    lock.releaseLock();
  }
}

function closeMarketsReviewRecovery() {
  requireMarketsReviewOwner_();
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return { deferred: true };
  try {
    PropertiesService.getScriptProperties().deleteProperty(MARKETS_REVIEW_RECOVERY_KEY);
    return { closed: true };
  } finally {
    lock.releaseLock();
  }
}

const MARKETS_REVIEW_JOB_SETTINGS = 'MARKETS_REVIEW_JOB_SETTINGS';

function marketsReviewJobSettings_(properties) {
  const scheduled = { enabled: true, priority: 6, time: '08:00', timeZone: MARKETS_CONFIG.timeZone };
  return { maintenance: { ...scheduled }, backup: { ...scheduled }, androidMetadata: { ...scheduled, time: '18:00' },
    ...(safeJsonParse_(properties.getProperty(MARKETS_REVIEW_JOB_SETTINGS) || '{}') || {}) };
}

function saveMarketsReviewJobSettings(id, payload) {
  const { email } = requireMarketsReviewOwner_();
  const allowed = [...MARKETS_REVIEW_PIPELINE_STAGES.map(job => job.id), 'index', 'geography', 'taxonomy', 'taxonomyTranslation', 'backup', 'maintenance', 'androidMetadata'];
  if (!allowed.includes(id) || typeof payload?.enabled !== 'boolean' ||
      !Number.isInteger(payload.priority) || payload.priority < 1 || payload.priority > 6 ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(payload.time) ||
      typeof payload.timeZone !== 'string' || !/^[A-Za-z_]+(?:\/[A-Za-z_+-]+)+$/.test(payload.timeZone)) {
    throw new Error('Configuración de trabajo no válida.');
  }
  new Intl.DateTimeFormat('es', { timeZone: payload.timeZone });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Hay otra operación en curso.');
  try {
    const properties = PropertiesService.getScriptProperties();
    const settings = marketsReviewJobSettings_(properties);
    settings[id] = { enabled: payload.enabled, priority: payload.priority, time: payload.time,
      timeZone: payload.timeZone, updatedBy: email, updatedAt: new Date().toISOString() };
    properties.setProperty(MARKETS_REVIEW_JOB_SETTINGS, JSON.stringify(settings));
    return settings[id];
  } finally {
    lock.releaseLock();
  }
}

function marketsReviewJobReady_(settings, id, now) {
  const config = settings[id];
  return !config || (config.enabled &&
    Utilities.formatDate(now, config.timeZone, 'HH:mm') >= config.time);
}

function marketsAdminReviewOperations_(email) {
  const properties = PropertiesService.getScriptProperties();
  const owner = email === normalizeEmailForComparison_(Session.getEffectiveUser().getEmail());
  const config = marketsReviewJobSettings_(properties);
  const now = Date.now();
  const pipeline = readMarketsReviewPipeline_(properties);
  const activeReviewStage = pipeline?.leaseUntil > now ? pipeline.jobs[pipeline.stage]?.label || '' : '';
  const metadataState = safeJsonParse_(properties.getProperty('MARKETS_PLAY_METADATA_REFRESH') || 'null');
  const androidMetadata = metadataState && Object.fromEntries(
    ['done', 'total', 'pages', 'updated', 'updatedAt', 'complete', 'runningUntil'].map(field => [field, metadataState[field]]));
  const workerScheduledAt = Number(properties.getProperty('MARKETS_REVIEW_WORKER_AT')) || 0;
  const nextWorkerAt = workerScheduledAt + 60000;
  return {
    owner, config, activeReviewStage,
    nextWorkerAt: nextWorkerAt > now && !activeReviewStage ? nextWorkerAt : null,
    translationRetryAt: Number(properties.getProperty(MARKETS_TRANSLATION_QUOTA_RETRY_KEY)) || 0,
    unifiedAfter: properties.getProperty(MARKETS_UNIFIED_OPERATIONS) || '',
    newsletter: safeJsonParse_(properties.getProperty('MARKETS_JOB_TIMING:newsletter')),
    health: safeJsonParse_(properties.getProperty('MARKETS_JOB_TIMING:health')),
    interval: Number(properties.getProperty(MARKETS_REVIEW_INTERVAL)) || 15,
    supervisorLast: properties.getProperty('MARKETS_REVIEW_SUPERVISOR_LAST'),
    geography: typeof MARKETS_GEO_AUDIT_PROPERTY === 'string' ? safeJsonParse_(properties.getProperty(MARKETS_GEO_AUDIT_PROPERTY)) : null,
    androidMetadata,
    ratingSchedule: safeJsonParse_(properties.getProperty('MARKETS_UNIFIED_RUN:ratings') || 'null'),
    queuedJobs: ['ratings', ...MARKETS_REVIEW_MANUAL_IDS].filter(id => properties.getProperty(MARKETS_REVIEW_MANUAL + id)),
    jobRetries: Object.fromEntries(MARKETS_REVIEW_MANUAL_IDS.flatMap(id => {
      const retry = safeJsonParse_(properties.getProperty(MARKETS_REVIEW_AUX_RETRY + id) || 'null');
      return retry ? [[id, retry]] : [];
    })),
    index: safeJsonParse_(properties.getProperty('MARKETS_REVIEW_INDEX_STATUS')),
    backup: typeof MARKETS_BACKUP_PROPERTY === 'string' ? safeJsonParse_(properties.getProperty(MARKETS_BACKUP_PROPERTY)) : null,
    maintenance: typeof MARKETS_MAINTENANCE_PROPERTY === 'string' ? safeJsonParse_(properties.getProperty(MARKETS_MAINTENANCE_PROPERTY)) : null,
    folders: owner && typeof marketsStorageFolders_ === 'function' ? marketsStorageFolders_(properties) : null
  };
}

const MARKETS_REVIEW_MANUAL = 'MARKETS_REVIEW_MANUAL:';
const MARKETS_REVIEW_AUX_RETRY = 'MARKETS_REVIEW_AUX_RETRY:';
const MARKETS_REVIEW_MANUAL_IDS = ['index', 'geography', 'taxonomy', 'taxonomyTranslation', 'maintenance', 'backup', 'publish', 'androidMetadata'];

function marketsReviewSnapshotRefreshDue_(properties, now) {
  if (typeof MARKETS_REVIEW_SNAPSHOT_POINTER !== 'string') return false;
  const published = safeJsonParse_(properties.getProperty(MARKETS_REVIEW_SNAPSHOT_POINTER));
  if (!Array.isArray(published?.versions) || published.schema !== MARKETS_REVIEW_SNAPSHOT_SCHEMA ||
      published.end !== Utilities.formatDate(now, MARKETS_CONFIG.timeZone, 'yyyy-MM-dd')) return true;
  return published.versions[0] !== (properties.getProperty('MARKETS_REVIEWS_GENERATION') || '') ||
    (published.versions.find(value => Array.isArray(value) && value[0] === 'MARKETS_REVIEW_GEOGRAPHY_REVISION')?.[1] || '') !==
    (properties.getProperty('MARKETS_REVIEW_GEOGRAPHY_REVISION') || '');
}

function marketsReviewAuxiliaryTasks_(properties, settings, now, priority) {
  const tasks = [
    { id: 'index', priority: 3, run: () => {
      if (typeof advanceMarketsReviewIndex_ !== 'function') return false;
      const result = advanceMarketsReviewIndex_();
      return result.deferred ? null : !result.complete;
    }},
    { id: 'geography', priority: 3, run: () => advanceMarketsAndroidGeography_(now) },
    { id: 'taxonomyTranslation', priority: 4, run: () => advanceMarketsFunctionalCatalog_({ sync: false, translate: true }) },
    { id: 'publish', priority: 5, manualOnly: !marketsReviewSnapshotRefreshDue_(properties, now),
      run: () => publishMarketsReviewSnapshot_().complete },
    { id: 'health', priority: 6, run: () => advanceMarketsScheduledOperations_(now, true) },
    { id: 'androidMetadata', priority: 6, run: () => typeof advanceMarketsAndroidMetadata_ === 'function' && advanceMarketsAndroidMetadata_(now) },
    { id: 'taxonomy', priority: 6, run: () => advanceMarketsFunctionalCatalog_({ sync: true, translate: false }) },
    { id: 'maintenance', priority: 6, run: manual => typeof advanceMarketsReviewMaintenance_ === 'function' && advanceMarketsReviewMaintenance_(now, manual) },
    { id: 'backup', priority: 6, run: manual => typeof advanceMarketsMonthlyBackup_ === 'function' && advanceMarketsMonthlyBackup_(now, manual) }
  ];
  const previous = properties.getProperty('MARKETS_REVIEW_LAST_AUX');
  return tasks.map(task => ({
    ...task, priority: settings[task.id]?.priority || task.priority,
    request: properties.getProperty(MARKETS_REVIEW_MANUAL + task.id),
    retry: safeJsonParse_(properties.getProperty(MARKETS_REVIEW_AUX_RETRY + task.id) || 'null')
  })).filter(task => task.priority < priority && (!task.manualOnly || task.request) &&
    marketsReviewJobReady_(settings, task.id, now) && (!task.retry || task.retry.next <= now.getTime()))
    .sort((a, b) => a.priority - b.priority || Number(a.id === previous) - Number(b.id === previous));
}

function runMarketsAuxiliaryTask_(properties, task) {
  const key = MARKETS_REVIEW_MANUAL + task.id;
  const retryKey = MARKETS_REVIEW_AUX_RETRY + task.id;
  try {
    const advanced = task.run(Boolean(task.request));
    if (advanced === null || (task.id === 'publish' && !advanced)) return false;
    if (task.retry) properties.deleteProperty(retryKey);
    if (task.request && (task.id !== 'publish' || advanced) && properties.getProperty(key) === task.request) {
      properties.deleteProperty(key);
    }
    if (advanced || task.request) properties.setProperty('MARKETS_REVIEW_LAST_AUX', task.id);
    return advanced || Boolean(task.request);
  } catch (error) {
    const failures = (task.retry?.failures || 0) + 1;
    const next = Date.now() + (failures >= 3 ? 6 * 60 : 5 * Math.pow(2, failures - 1)) * 60000;
    properties.setProperty(retryKey, JSON.stringify({ failures: failures >= 3 ? 0 : failures, next,
      error: errorToString_(error).slice(0, 180) }));
    return false;
  }
}

function runMarketsPanelJob(id) {
  requireMarketsReviewOwner_();
  if (!MARKETS_REVIEW_MANUAL_IDS.includes(id)) throw new Error('Trabajo no disponible para ejecución manual.');
  const properties = PropertiesService.getScriptProperties();
  if (marketsReviewJobSettings_(properties)[id]?.enabled === false) throw new Error('El trabajo está desactivado.');
  return enqueueMarketsPanelJob_(properties, id);
}

function enqueueMarketsPanelJob_(properties, id) {
  const key = MARKETS_REVIEW_MANUAL + id;
  if (properties.getProperty(key)) return { queued: true, message: 'La solicitud ya está en cola.' };
  properties.setProperty(key, new Date().toISOString());
  return { queued: true, message: 'Solicitud en cola. Se ejecutará en su siguiente turno elegible.' };
}
