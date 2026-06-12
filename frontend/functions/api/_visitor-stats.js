const VISITOR_ONLINE_WINDOW_MS = 5 * 60 * 1000;
const VISITOR_VISIT_SESSION_WINDOW_MS = 30 * 60 * 1000;
const VISITOR_REGISTER_RATE_WINDOW_MS = 60 * 1000;
const VISITOR_REGISTER_RATE_LIMIT = 120;
const VISITOR_STORE_MAX_DAYS = 60;
const DEFAULT_VISITOR_HISTORY_DAYS = 30;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const VISITOR_STATS_TIME_ZONE = 'Asia/Shanghai';
const VISITOR_ID_MAX_LENGTH = 120;
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
};

const visitorRegisterRateWindowByIp = new Map();
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: VISITOR_STATS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

class RequestError extends Error {
  constructor(status, code, message, extraHeaders = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extraHeaders = extraHeaders;
  }
}

export function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

export function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Visitor-Id',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function withRequestErrors(work) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof RequestError) {
      return jsonResponse({ error: error.message, code: error.code }, error.status, error.extraHeaders);
    }
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: `访问统计服务失败: ${message}` }, 500);
  }
}

function requireVisitorStatsDb(env) {
  const database = env?.VISITOR_STATS_DB;
  if (!database || typeof database.prepare !== 'function') {
    throw new RequestError(500, 'EMISSING_VISITOR_STATS_DB', '缺少 VISITOR_STATS_DB D1 绑定');
  }
  return database;
}

function getClientIp(request) {
  const cloudflareIp = request.headers.get('CF-Connecting-IP');
  if (cloudflareIp && cloudflareIp.trim()) return cloudflareIp.trim();
  const forwardedFor = request.headers.get('X-Forwarded-For');
  if (forwardedFor && forwardedFor.trim()) return forwardedFor.split(',')[0].trim();
  throw new RequestError(400, 'EMISSING_CLIENT_IP', '缺少客户端 IP 请求头');
}

function sanitizeVisitorId(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().slice(0, VISITOR_ID_MAX_LENGTH);
  return /^[a-zA-Z0-9_-]{8,120}$/.test(normalized) ? normalized : '';
}

function requireNonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new RequestError(500, 'EINVALID_VISITOR_STAT_VALUE', `${label} 不是非负整数`);
  }
  return number;
}

function getTodayKey(input = Date.now()) {
  const parts = dateFormatter.formatToParts(new Date(input));
  const partByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (!partByType.year || !partByType.month || !partByType.day) {
    throw new RequestError(500, 'EDATE_FORMAT', '无法生成访问统计日期');
  }
  return `${partByType.year}-${partByType.month}-${partByType.day}`;
}

function listRecentDateKeys(days, now = Date.now()) {
  const safeDays = Number.isInteger(days) && days > 0 ? days : DEFAULT_VISITOR_HISTORY_DAYS;
  const items = [];
  for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
    items.push(getTodayKey(now - offset * ONE_DAY_MS));
  }
  return items;
}

function pruneRateWindow(items, now, windowMs) {
  return items.filter((timestamp) => now - timestamp < windowMs);
}

function enforceVisitorRegisterRateLimit(request, now = Date.now()) {
  const ip = getClientIp(request);
  const existing = pruneRateWindow(visitorRegisterRateWindowByIp.get(ip) || [], now, VISITOR_REGISTER_RATE_WINDOW_MS);
  if (existing.length >= VISITOR_REGISTER_RATE_LIMIT) {
    const retryAfterMs = VISITOR_REGISTER_RATE_WINDOW_MS - (now - existing[0]);
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    throw new RequestError(429, 'ERATE_VISITOR_REGISTER', '访问统计请求过于频繁', {
      'Retry-After': String(retryAfterSeconds),
    });
  }
  existing.push(now);
  visitorRegisterRateWindowByIp.set(ip, existing);
  return ip;
}

async function getVisitorMeta(database, key) {
  const row = await database.prepare('SELECT value FROM visitor_meta WHERE key = ?').bind(key).first();
  return typeof row?.value === 'string' ? row.value : null;
}

async function pruneDailyVisitors(database, now = Date.now()) {
  const cutoffDate = getTodayKey(now - VISITOR_STORE_MAX_DAYS * ONE_DAY_MS);
  await database.prepare('DELETE FROM daily_visitors WHERE date < ?').bind(cutoffDate).run();
}

async function collectVisitorStatsFromDatabase(database, now = Date.now()) {
  await pruneDailyVisitors(database, now);
  const todayKey = getTodayKey(now);
  const onlineSince = new Date(now - VISITOR_ONLINE_WINDOW_MS).toISOString();
  const onlineRow = await database.prepare('SELECT COUNT(*) AS count FROM visitors WHERE last_seen_at > ?').bind(onlineSince).first();
  const todayExactRow = await database.prepare('SELECT COUNT(*) AS count FROM daily_visitors WHERE date = ?').bind(todayKey).first();
  const todayTotalRow = await database.prepare('SELECT visitors FROM daily_visitor_totals WHERE date = ?').bind(todayKey).first();
  const totalVisitorsRow = await database.prepare('SELECT COUNT(*) AS count FROM visitors').first();
  const totalVisitsRaw = await getVisitorMeta(database, 'total_visits');
  if (totalVisitsRaw == null) {
    throw new RequestError(500, 'EMISSING_TOTAL_VISITS_META', 'visitor_meta.total_visits 缺失，请先执行 D1 schema');
  }
  const totalVisits = requireNonNegativeInteger(totalVisitsRaw, 'visitor_meta.total_visits');

  const todayCount = Math.max(
    requireNonNegativeInteger(todayExactRow?.count || 0, 'daily_visitors.count'),
    requireNonNegativeInteger(todayTotalRow?.visitors || 0, 'daily_visitor_totals.visitors')
  );
  return {
    onlineVisitors: requireNonNegativeInteger(onlineRow?.count || 0, 'visitors.online_count'),
    todayVisitors: todayCount,
    totalVisitors: requireNonNegativeInteger(totalVisitorsRow?.count || 0, 'visitors.total_count'),
    totalVisits,
    updatedAt: new Date(now).toISOString(),
  };
}

export async function collectVisitorStats(env, now = Date.now()) {
  const database = requireVisitorStatsDb(env);
  return collectVisitorStatsFromDatabase(database, now);
}

export async function collectVisitorHistory(env, daysInput, now = Date.now()) {
  const database = requireVisitorStatsDb(env);
  const days = Number.isInteger(daysInput) && daysInput > 0
    ? Math.min(daysInput, VISITOR_STORE_MAX_DAYS)
    : DEFAULT_VISITOR_HISTORY_DAYS;
  await pruneDailyVisitors(database, now);

  const rows = await database.prepare(`
    WITH exact_daily AS (
      SELECT date, COUNT(*) AS visitors
      FROM daily_visitors
      GROUP BY date
    ), merged_daily AS (
      SELECT date, visitors FROM exact_daily
      UNION ALL
      SELECT date, visitors FROM daily_visitor_totals
    )
    SELECT date, MAX(visitors) AS visitors
    FROM merged_daily
    GROUP BY date
    ORDER BY date DESC
    LIMIT ?
  `).bind(days).all();
  const visitorsByDate = new Map((rows.results || []).map((item) => [
    item.date,
    requireNonNegativeInteger(item.visitors || 0, `visitors.${item.date}`),
  ]));
  const items = listRecentDateKeys(days, now).map((date) => ({
    date,
    visitors: visitorsByDate.get(date) || 0,
  }));

  return {
    days,
    items,
    totalVisitors: items.reduce((sum, item) => sum + item.visitors, 0),
    maxVisitors: items.reduce((max, item) => Math.max(max, item.visitors), 0),
    updatedAt: new Date(now).toISOString(),
  };
}

export async function registerVisitor(env, request, now = Date.now()) {
  const database = requireVisitorStatsDb(env);
  const visitorId = sanitizeVisitorId(request.headers.get('X-Visitor-Id'));
  if (!visitorId) {
    throw new RequestError(400, 'EINVAL_VISITOR_ID', 'Invalid visitor id');
  }

  const ip = enforceVisitorRegisterRateLimit(request, now);
  const nowIso = new Date(now).toISOString();
  const todayKey = getTodayKey(now);
  const existing = await database.prepare('SELECT visitor_id, last_visit_counted_at FROM visitors WHERE visitor_id = ?').bind(visitorId).first();
  const lastVisitCountedAt = existing?.last_visit_counted_at ? Date.parse(existing.last_visit_counted_at) : NaN;
  const shouldCountVisit = !Number.isFinite(lastVisitCountedAt) || now - lastVisitCountedAt >= VISITOR_VISIT_SESSION_WINDOW_MS;

  const statements = [];
  if (shouldCountVisit) {
    statements.push(database.prepare("UPDATE visitor_meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'total_visits'"));
  }
  if (existing) {
    statements.push(database.prepare(`
      UPDATE visitors
      SET last_seen_at = ?,
          last_visit_counted_at = CASE WHEN ? = 1 THEN ? ELSE last_visit_counted_at END,
          last_seen_date = ?,
          ip = ?
      WHERE visitor_id = ?
    `).bind(nowIso, shouldCountVisit ? 1 : 0, nowIso, todayKey, ip, visitorId));
  } else {
    statements.push(database.prepare(`
      INSERT INTO visitors(visitor_id, first_seen_at, last_seen_at, last_visit_counted_at, last_seen_date, ip)
      VALUES(?, ?, ?, ?, ?, ?)
    `).bind(visitorId, nowIso, nowIso, nowIso, todayKey, ip));
  }
  statements.push(database.prepare('INSERT OR IGNORE INTO daily_visitors(date, visitor_id) VALUES(?, ?)').bind(todayKey, visitorId));
  await database.batch(statements);

  return collectVisitorStatsFromDatabase(database, now);
}
