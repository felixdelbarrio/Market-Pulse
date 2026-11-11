/** Supervisor de reseñas. Cada ejecución avanza una etapa, con cursores y resultados persistentes. */
const MARKETS_REVIEW_SUPERVISOR = 'superviseMarketsReviews_';
const MARKETS_REVIEW_PIPELINE_KEY = 'MARKETS_REVIEW_PIPELINE';
const MARKETS_REVIEW_PIPELINE_STAGES = Object.freeze([
  { id: 'ios', label: 'Captura de App Store' },
  { id: 'android', label: 'Captura de Google Play' },
  { id: 'translate', label: 'Traducción de reseñas' },
  { id: 'publish', label: 'Publicación de vistas de reseñas' },
  { id: 'alerts', label: 'Alertas de reseñas' }
]);

function installMarketsReviewSupervisor_() {
  const triggers = ScriptApp.getProjectTriggers();
  if (!triggers.some(trigger => trigger.getHandlerFunction() === MARKETS_REVIEW_SUPERVISOR)) {
    ScriptApp.newTrigger(MARKETS_REVIEW_SUPERVISOR).timeBased().everyMinutes(15).create();
  }
  const handlers = [collectMarketsReviews_.name, collectMarketsPlayReviews_.name, translateMarketsReviews_.name];
  triggers.filter(trigger => handlers.includes(trigger.getHandlerFunction()))
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
}

function newMarketsReviewPipeline_(day) {
  return { day, stage: 0, jobs: MARKETS_REVIEW_PIPELINE_STAGES.map(({ id, label }, index) => ({
    id, label, priority: index + 1, status: 'Pendiente', done: 0, total: 0, added: 0, updated: 0, failures: 0, retries: 0
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
    if (pipeline && pipeline.stage < pipeline.jobs.length && pipeline.jobs[pipeline.stage].status !== 'Revisar') {
      return { queued: false };
    }
    const day = Utilities.formatDate(new Date(), MARKETS_CONFIG.timeZone, 'yyyy-MM-dd');
    properties.setProperty(MARKETS_REVIEW_PIPELINE_KEY, JSON.stringify(newMarketsReviewPipeline_(day)));
    return { queued: true };
  } finally {
    lock.releaseLock();
  }
}

function superviseMarketsReviews_() {
  const properties = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  let pipeline, job;
  try {
    const now = new Date();
    const day = Utilities.formatDate(now, MARKETS_CONFIG.timeZone, 'yyyy-MM-dd');
    pipeline = readMarketsReviewPipeline_(properties);
    const previousFinished = !pipeline || pipeline.stage >= pipeline.jobs.length || pipeline.jobs[pipeline.stage].status === 'Revisar';
    if (pipeline?.day !== day && previousFinished) {
      if (Utilities.formatDate(now, MARKETS_CONFIG.timeZone, 'HHmm') < '0800') return;
      pipeline = newMarketsReviewPipeline_(day);
    }
    job = pipeline.jobs[pipeline.stage];
    if (!job || job.status === 'Revisar' || pipeline.leaseUntil > now.getTime()) return;
    if (pipeline.leaseUntil) {
      job.retries++;
      job.error = 'La ejecución anterior agotó el tiempo disponible.';
      if (job.retries >= 3) {
        job.status = 'Revisar';
        if (job.id === 'translate' || job.id === 'publish') pipeline.stage++;
        delete pipeline.leaseUntil;
        properties.setProperty(MARKETS_REVIEW_PIPELINE_KEY, JSON.stringify(pipeline));
        return;
      }
    }
    // Una ejecución de Apps Script no puede superar los seis minutos.
    pipeline.leaseUntil = now.getTime() + 7 * 60 * 1000;
    job.status = 'En curso';
    if (!job.startedAt) job.startedAt = now.toISOString();
    properties.setProperty(MARKETS_REVIEW_PIPELINE_KEY, JSON.stringify(pipeline));
  } finally {
    lock.releaseLock();
  }
  try {
    const complete = advanceMarketsReviewJob_(job, pipeline);
    job.retries = 0;
    delete job.error;
    if (complete) {
      job.status = job.failures || job.pending ? 'Parcial' : 'Completado';
      job.finishedAt = new Date().toISOString();
      pipeline.stage++;
    }
  } catch (error) {
    job.retries++;
    job.status = job.retries >= 3 ? 'Revisar' : 'Reintento pendiente';
    job.error = errorToString_(error).slice(0, 250);
    console.warn(job.label + ': ' + job.error);
    if (job.status === 'Revisar' && (job.id === 'translate' || job.id === 'publish')) pipeline.stage++;
  }
  delete pipeline.leaseUntil;
  properties.setProperty(MARKETS_REVIEW_PIPELINE_KEY, JSON.stringify(pipeline));
}

function advanceMarketsReviewJob_(job, pipeline) {
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
      if (result.deferred) return false;
      job.batches = (job.batches || 0) + 1;
      job.done = result.checked;
      job.total = result.eligible;
      job.updated += result.translated;
      job.failures += result.failed || 0;
      if (result.complete) return true;
      if (job.batches < 4) return false;
      job.pending = Math.max(job.total - job.done, result.pending || 0);
      return true;
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
      if (pipeline.jobs.slice(0, 2).some(stage => stage.failures)) {
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
  const month = scope?.month;
  if (typeof month !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month) ||
      month > Utilities.formatDate(new Date(), MARKETS_CONFIG.timeZone, 'yyyy-MM')) {
    throw new Error('Selecciona un mes válido.');
  }
  const app = marketsReviewRecoveryListings_(ss).find(listing => listing.appKey === scope?.appKey);
  if (!app) throw new Error('El escaparate no es válido o no se puede identificar de forma unívoca.');
  return { app, month };
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
  const { app, month } = marketsReviewRecoveryScope_(ss, scope);
  const properties = PropertiesService.getScriptProperties();
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return { deferred: true };
  try {
    const android = app.platform === 'Android';
    const pageLimit = MARKETS_REVIEW_RECOVERY_LIMITS[app.platform];
    const previous = safeJsonParse_(properties.getProperty(MARKETS_REVIEW_RECOVERY_KEY));
    const sameScope = previous?.appKey === app.appKey && previous.month === month;
    if (!sameScope && previous && !previous.complete) {
      throw new Error('Termina la recuperación abierta o ciérrala antes de seleccionar otro periodo.');
    }
    const state = sameScope ? previous : { appKey: app.appKey, month, pages: 0, added: 0, updated: 0,
      unchanged: 0, failures: 0, cursor: android ? '' : 1, seen: [], complete: false, pageLimit };
    if (state.complete || state.retryAt > Date.now()) return marketsReviewRecoveryState_(properties);
    const pausedUntil = android ? Number(properties.getProperty('MARKETS_PLAY_REVIEW_PAUSE')) : 0;
    if (pausedUntil > Date.now()) return { deferred: true, retryAt: pausedUntil };
    try {
      const page = android ? fetchPlayReviewPage_(app, state.cursor) : fetchMarketsIosReviewPage_(app, state.cursor);
      const selected = page.rows.filter(row => marketsReviewRecoveryMonth_(android ? row.date : row[6]) === month);
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
