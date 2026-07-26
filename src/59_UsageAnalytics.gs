/** Telemetria funcional minima para adopcion y experiencia de usuario. */
var MARKETS_USAGE = Object.freeze({
  maxEventsPerBatch: 25,
  maxAnalyticsRows: 200000,
  views: Object.freeze(['overview', 'benchmark', 'evolution', 'alerts', 'admin']),
  eventTypes: Object.freeze(['SESSION_START', 'VIEW', 'FILTER', 'ACTION', 'ERROR']),
  devices: Object.freeze(['DESKTOP', 'MOBILE', 'TABLET', 'UNKNOWN'])
});

function ensureMarketsUsageSheet_(ss) {
  let sheet = ss.getSheetByName(MARKETS_CONFIG.sheets.usage);
  const created = !sheet;
  sheet = sheet || ss.insertSheet(MARKETS_CONFIG.sheets.usage);
  ensureCurrentSheetContract_(sheet, MARKETS_CONFIG.headers.usage);
  if (created) applyTableStyle_(sheet, MARKETS_CONFIG.headers.usage.length);
  return sheet;
}

function recordMarketsUsageEvents(events) {
  const email = currentMarketsUserEmail_();
  const source = Array.isArray(events) ? events.slice(0, MARKETS_USAGE.maxEventsPerBatch) : [];
  const rows = source.map(function (event) {
    return normalizeMarketsUsageEvent_(event, email);
  }).filter(Boolean);
  if (!rows.length) return { recorded: 0 };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(MARKETS_CONFIG.lockTimeoutMs)) return { recorded: 0, deferred: true };
  try {
    const ss = openMarketsSpreadsheet_();
    const sheet = ensureMarketsUsageSheet_(ss);
    const start = sheet.getLastRow() + 1;
    ensureSheetCapacity_(sheet, start + rows.length - 1, MARKETS_CONFIG.headers.usage.length);
    sheet.getRange(start, 1, rows.length, MARKETS_CONFIG.headers.usage.length).setValues(rows);
    CacheService.getScriptCache().remove(usageAnalyticsCacheKey_(MARKETS_CONFIG.timeZone));
    return { recorded: rows.length };
  } finally {
    lock.releaseLock();
  }
}

function normalizeMarketsUsageEvent_(event, email) {
  const input = event || {};
  const eventType = usageToken_(input.eventType, 32);
  if (MARKETS_USAGE.eventTypes.indexOf(eventType) < 0) return null;
  const view = trimString_(input.view).toLowerCase();
  const safeView = MARKETS_USAGE.views.indexOf(view) >= 0 ? view : '';
  const sessionId = usageToken_(input.sessionId, 80);
  if (!sessionId) return null;
  const device = usageToken_(input.device, 16);
  return [
    new Date(), normalizeMarketsAlertEmail_(email), sessionId, eventType, safeView,
    usageToken_(input.action, 64), usageDetail_(input.detail, 240),
    usageDetail_(input.webVersion, 32),
    MARKETS_USAGE.devices.indexOf(device) >= 0 ? device : 'UNKNOWN'
  ];
}

function usageToken_(value, maximum) {
  return trimString_(value).toUpperCase().replace(/[^A-Z0-9_:\-|]/g, '').slice(0, maximum);
}

function usageDetail_(value, maximum) {
  return trimString_(value).replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, maximum);
}

function readMarketsUsageAnalytics_(ss, timeZone, now) {
  const zone = timeZone || MARKETS_CONFIG.timeZone;
  const cache = !now ? CacheService.getScriptCache() : null;
  const cacheKey = usageAnalyticsCacheKey_(zone);
  if (cache) {
    const cached = cache.get(cacheKey);
    if (cached) {
      try { return JSON.parse(cached); } catch (ignored) {}
    }
  }
  const sheet = ensureMarketsUsageSheet_(ss);
  const totalRows = Math.max(0, sheet.getLastRow() - 1);
  const rowCount = Math.min(MARKETS_USAGE.maxAnalyticsRows, totalRows);
  const truncated = totalRows > rowCount;
  const rows = rowCount ? sheet.getRange(sheet.getLastRow() - rowCount + 1, 1, rowCount,
    MARKETS_CONFIG.headers.usage.length).getValues() : [];
  const analytics = buildMarketsUsageAnalytics_(rows, zone, now || new Date(), {
    totalRows: totalRows, rowsAnalyzed: rowCount, truncated: truncated
  });
  if (cache) cache.put(cacheKey, JSON.stringify(analytics), 300);
  return analytics;
}

function usageAnalyticsCacheKey_(timeZone) {
  return 'markets:usage:analytics:' + MARKETS_CONFIG.codeVersion + ':' + trimString_(timeZone);
}

function buildMarketsUsageAnalytics_(rows, timeZone, now, tracking) {
  const indexes = indexHeaders_(MARKETS_CONFIG.headers.usage);
  const today = usageDateKey_(now, timeZone);
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const currentWeek = usageWeekKey_(today);
  const previousWeek = usageOffsetDateKey_(currentWeek, -7);
  const previousComparableEnd = usageOffsetDateKey_(today, -7);
  const daily = {};
  const users = {};
  const views = {};
  const actions = {};
  const devices = {};
  const unique = { day: {}, month: {}, year: {}, week: {}, previousWeek: {} };
  const sessions = { day: {}, month: {}, year: {}, week: {}, previousWeek: {} };
  const incidents = [];
  let eventsToday = 0;
  let errorsMonth = 0;

  (rows || []).forEach(function (row) {
    const timestamp = row[indexes.timestamp];
    if (!(timestamp instanceof Date) || isNaN(timestamp.getTime())) return;
    const dateKey = usageDateKey_(timestamp, timeZone);
    const email = normalizeEmailForComparison_(row[indexes.user_email]);
    if (!email) return;
    const sessionId = trimString_(row[indexes.session_id]);
    if (!sessionId) return;
    if (dateKey >= currentWeek && dateKey <= today) {
      unique.week[email] = true; sessions.week[sessionId] = true;
    } else if (dateKey >= previousWeek && dateKey <= previousComparableEnd) {
      unique.previousWeek[email] = true; sessions.previousWeek[sessionId] = true;
    }
    if (dateKey.slice(0, 4) !== year) return;
    const type = trimString_(row[indexes.event_type]);
    const view = trimString_(row[indexes.view]).toLowerCase();
    const action = trimString_(row[indexes.action]);
    const device = trimString_(row[indexes.device]) || 'UNKNOWN';
    const item = users[email] || (users[email] = {
      email: email, sessions: {}, activeDays: {}, views: 0, actions: 0, errors: 0,
      firstSeenAt: timestamp, lastSeenAt: timestamp
    });
    item.sessions[sessionId] = true;
    item.activeDays[dateKey] = true;
    item.firstSeenAt = timestamp < item.firstSeenAt ? timestamp : item.firstSeenAt;
    item.lastSeenAt = timestamp > item.lastSeenAt ? timestamp : item.lastSeenAt;
    unique.year[email] = true;
    sessions.year[sessionId] = true;
    if (dateKey === today) {
      unique.day[email] = true; sessions.day[sessionId] = true; eventsToday += 1;
    }
    if (dateKey.slice(0, 7) === month) {
      unique.month[email] = true; sessions.month[sessionId] = true;
    }
    const day = daily[dateKey] || (daily[dateKey] = { users: {}, sessions: {}, events: 0, errors: 0 });
    day.users[email] = true; day.sessions[sessionId] = true; day.events += 1;
    if (type === 'VIEW' && view) {
      item.views += 1;
      views[view] = (views[view] || 0) + 1;
    } else if (type === 'ACTION' || type === 'FILTER') {
      item.actions += 1;
      if (action) actions[action] = (actions[action] || 0) + 1;
    } else if (type === 'ERROR') {
      item.errors += 1; day.errors += 1;
      if (dateKey.slice(0, 7) === month) errorsMonth += 1;
      incidents.push({
        timestamp: timestamp.toISOString(), email: email, view: view,
        action: action, detail: usageDetail_(row[indexes.detail], 240)
      });
    }
    devices[device] = (devices[device] || 0) + 1;
  });

  const ranking = Object.keys(users).map(function (email) {
    const item = users[email];
    return {
      email: email, sessions: Object.keys(item.sessions).length,
      activeDays: Object.keys(item.activeDays).length, views: item.views,
      actions: item.actions, errors: item.errors,
      firstSeenAt: item.firstSeenAt.toISOString(), lastSeenAt: item.lastSeenAt.toISOString()
    };
  }).sort(function (a, b) {
    return b.activeDays - a.activeDays || b.sessions - a.sessions || b.views - a.views ||
      a.email.localeCompare(b.email);
  });
  const leastActive = ranking.slice().sort(function (a, b) {
    return a.activeDays - b.activeDays || a.sessions - b.sessions || a.views - b.views ||
      a.lastSeenAt.localeCompare(b.lastSeenAt);
  });
  const dailyTrend = [];
  for (let offset = -13; offset <= 0; offset += 1) {
    const key = usageOffsetDateKey_(today, offset);
    const item = daily[key] || { users: {}, sessions: {}, events: 0, errors: 0 };
    dailyTrend.push({
      date: key, users: Object.keys(item.users).length, sessions: Object.keys(item.sessions).length,
      events: item.events, errors: item.errors
    });
  }
  const currentWeekUsers = Object.keys(unique.week).length;
  const previousWeekUsers = Object.keys(unique.previousWeek).length;
  const currentWeekSessions = Object.keys(sessions.week).length;
  const previousWeekSessions = Object.keys(sessions.previousWeek).length;
  return {
    generatedAt: now.toISOString(),
    kpis: {
      usersToday: Object.keys(unique.day).length,
      usersMonth: Object.keys(unique.month).length,
      usersYear: Object.keys(unique.year).length,
      sessionsToday: Object.keys(sessions.day).length,
      sessionsMonth: Object.keys(sessions.month).length,
      sessionsYear: Object.keys(sessions.year).length,
      eventsToday: eventsToday,
      errorsMonth: errorsMonth
    },
    weekOverWeek: {
      users: currentWeekUsers, previousUsers: previousWeekUsers,
      usersChangePct: usageChangePct_(currentWeekUsers, previousWeekUsers),
      sessions: currentWeekSessions, previousSessions: previousWeekSessions,
      sessionsChangePct: usageChangePct_(currentWeekSessions, previousWeekSessions)
    },
    dailyTrend: dailyTrend,
    topViews: usageCountRanking_(views),
    topActions: usageCountRanking_(actions),
    devices: usageCountRanking_(devices),
    mostActive: ranking.slice(0, 10),
    leastActive: leastActive.slice(0, 10),
    recentIncidents: incidents.sort(function (a, b) {
      return b.timestamp.localeCompare(a.timestamp);
    }).slice(0, 20),
    tracking: Object.assign({}, tracking || {}, {
      coverageStart: rows && rows.length && rows[0][indexes.timestamp] instanceof Date ?
        rows[0][indexes.timestamp].toISOString() : ''
    })
  };
}

function usageCountRanking_(counts) {
  return Object.keys(counts || {}).map(function (key) {
    return { key: key, count: counts[key] };
  }).sort(function (a, b) { return b.count - a.count || a.key.localeCompare(b.key); });
}

function usageChangePct_(current, previous) {
  if (!previous) return current ? null : 0;
  return Math.round((current - previous) / previous * 1000) / 10;
}

function usageDateKey_(value, timeZone) {
  return Utilities.formatDate(value, timeZone, 'yyyy-MM-dd');
}

function usageOffsetDateKey_(dateKey, offset) {
  const date = dateFromKey_(dateKey);
  date.setDate(date.getDate() + offset);
  return dateKey_(date);
}

function usageWeekKey_(dateKey) {
  const date = dateFromKey_(dateKey);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return dateKey_(date);
}
