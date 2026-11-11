/** Supervisor de reseñas. Cada ejecución avanza una etapa, con cursores y resultados persistentes. */
const MARKETS_REVIEW_SUPERVISOR = 'superviseMarketsReviews_';
const MARKETS_REVIEW_PIPELINE_KEY = 'MARKETS_REVIEW_PIPELINE';
const MARKETS_REVIEW_PIPELINE_STAGES = Object.freeze([
  { id: 'ios', label: 'Captura de App Store' },
  { id: 'android', label: 'Captura de Google Play' },
  { id: 'translate', label: 'Traducción de reseñas' },
  { id: 'publish', label: 'Publicación de vistas de reseñas' },
  { id: 'alerts', label: 'Alertas de reseñas · piloto' }
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
    job.startedAt ||= now.toISOString();
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
      if (result.complete) return true;
      if (job.batches < 4) return false;
      job.pending = job.total - job.done;
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
        job.added = processMarketsReviewPilot_(pipeline.day);
      }
      job.done = 1;
      return true;
    }
    default:
      throw new Error('Etapa de reseñas desconocida.');
  }
}
