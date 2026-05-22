#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { URL } = require('url');
const { spawn } = require('child_process');
const { Worker } = require('worker_threads');
const { DatabaseSync } = require('node:sqlite');
const { DEFAULT_SETTINGS, loadAppSettings, persistAppSettings } = require('./app-config');
const { createBattlefieldService } = require('./battlefield-service');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'output');
const DATA_API_DIR = path.join(ROOT, 'dataApi');
const RUNTIME_DIR = path.join(ROOT, 'file', 'runtime');
const PLAYER_DB_PATH = path.join(ROOT, 'file', 'mini_data.db');
const VISITOR_DB_PATH = process.env.DATA_API_VISITOR_DB_PATH || path.join(RUNTIME_DIR, 'visitor-stats.db');
const STATUS_PATH = path.join(RUNTIME_DIR, 'update-status.json');
const FEEDBACK_PATH = path.join(RUNTIME_DIR, 'feedback-submissions.jsonl');
const VISITOR_STATS_PATH = path.join(RUNTIME_DIR, 'visitor-stats.json');
const WEB_DIST_DIR = process.env.DATA_API_WEB_DIST_DIR
  || (fs.existsSync(path.join(ROOT, 'web-dist')) ? path.join(ROOT, 'web-dist') : path.join(ROOT, 'frontend', 'dist'));
const OPS_ENABLED = ['1', 'true', 'on', 'yes'].includes(String(process.env.DATA_API_ENABLE_OPS || 'false').toLowerCase());
const PLAYER_NAME_SEARCH_ENABLED = ['1', 'true', 'on', 'yes'].includes(String(process.env.DATA_API_ENABLE_PLAYER_NAME_SEARCH || 'false').toLowerCase());
const MAX_LOG_LINES = 200;
const PLAYER_LOOKUP_PENDING_LIMIT = 24;
const PLAYER_LOOKUP_TIMEOUT_MS = 8000;
const PLAYER_SEARCH_PAGE_SIZE = 50;
const PLAYER_SEARCH_RATE_WINDOW_MS = 15000;
const PLAYER_SEARCH_RATE_LIMIT = 12;
const PLAYER_HISTORY_RATE_WINDOW_MS = 15000;
const PLAYER_HISTORY_RATE_LIMIT = 30;
const FEEDBACK_RATE_WINDOW_MS = 10 * 60 * 1000;
const FEEDBACK_RATE_LIMIT = 5;
const VISITOR_ONLINE_WINDOW_MS = 5 * 60 * 1000;
const VISITOR_VISIT_SESSION_WINDOW_MS = 30 * 60 * 1000;
const VISITOR_REGISTER_RATE_WINDOW_MS = 60 * 1000;
const VISITOR_REGISTER_RATE_LIMIT = 120;
const VISITOR_STORE_MAX_DAYS = 60;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FEEDBACK_TITLE_LIMIT = 60;
const FEEDBACK_MESSAGE_LIMIT = 500;
const FEEDBACK_CONTACT_LIMIT = 80;
const FEEDBACK_AREA_LIMIT = 30;
const FEEDBACK_URL_LIMIT = 200;
const FEEDBACK_CATEGORIES = new Set(['feature', 'data', 'ux', 'other']);

const TASK_SCRIPTS = {
  sync: path.join(ROOT, 'scripts', 'sync_data_api.js'),
  extract: path.join(ROOT, 'scripts', 'extract_all.js'),
  pipeline: path.join(ROOT, 'scripts', 'run_update_pipeline.js'),
};

const sseClients = new Set();
let outputWatcher = null;
let scheduleTimer = null;
let runningChild = null;
let appSettings = loadAppSettings();
let battlefieldService = null;
let playerLookupWorker = null;
let playerLookupRequestSeq = 0;
const playerLookupPending = new Map();
const playerLookupRateWindowByIp = new Map();
const feedbackRateWindowByIp = new Map();
const visitorRegisterRateWindowByIp = new Map();
let visitorStatsDb = null;

function createInitialSettings() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function getServerHost() {
  return typeof appSettings.server?.host === 'string' && appSettings.server.host.trim()
    ? appSettings.server.host.trim()
    : DEFAULT_SETTINGS.server.host;
}

function getServerPort() {
  const value = Number(appSettings.server?.port);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_SETTINGS.server.port;
}

function getAdminToken() {
  return typeof appSettings.server?.adminToken === 'string' ? appSettings.server.adminToken : DEFAULT_SETTINGS.server.adminToken;
}

function getConfiguredMaxLevel() {
  const value = Number(appSettings.data?.maxLevel);
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_SETTINGS.data.maxLevel;
}

function getAutoRefreshEnabled() {
  return typeof appSettings.autoRefresh?.enabled === 'boolean'
    ? appSettings.autoRefresh.enabled
    : DEFAULT_SETTINGS.autoRefresh.enabled;
}

function getAutoRefreshIntervalMinutes() {
  const value = Number(appSettings.autoRefresh?.intervalMinutes);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_SETTINGS.autoRefresh.intervalMinutes;
}

function getAutoRefreshOnStart() {
  return typeof appSettings.autoRefresh?.onStart === 'boolean'
    ? appSettings.autoRefresh.onStart
    : DEFAULT_SETTINGS.autoRefresh.onStart;
}

function persistSettings() {
  appSettings = persistAppSettings(appSettings);
}

function loadSettings() {
  appSettings = loadAppSettings();
}

function createInitialJobState() {
  return {
    running: false,
    task: null,
    trigger: null,
    startedAt: null,
    finishedAt: null,
    lastSucceededAt: null,
    lastFailedAt: null,
    lastDurationMs: null,
    lastExitCode: null,
    lastError: null,
    nextRunAt: null,
    logLines: [],
  };
}

let jobState = createInitialJobState();

function createInitialVisitorStats() {
  return {
    totalVisitors: 0,
    totalVisits: 0,
    visitorsById: {},
    dailyVisitors: {},
  };
}

function ensureDirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function appendLog(message) {
  const line = '[' + new Date().toISOString() + '] ' + message;
  jobState.logLines = [...jobState.logLines.slice(-(MAX_LOG_LINES - 1)), line];
  persistJobState();
}

function persistJobState() {
  ensureDirSync(RUNTIME_DIR);
  fs.writeFileSync(STATUS_PATH, JSON.stringify(jobState, null, 2), 'utf8');
}

function getTodayKey(input = Date.now()) {
  const date = new Date(input);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function listRecentDateKeys(days, now = Date.now()) {
  const safeDays = Number.isInteger(days) && days > 0 ? days : 1;
  const items = [];
  for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
    items.push(getTodayKey(now - offset * ONE_DAY_MS));
  }
  return items;
}

function sanitizeVisitorId(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().slice(0, 120);
  return /^[a-zA-Z0-9_-]{8,120}$/.test(normalized) ? normalized : '';
}

function createVisitorStatsDatabase(dbPath = VISITOR_DB_PATH) {
  ensureDirSync(path.dirname(dbPath));
  const database = new DatabaseSync(dbPath);
  database.exec('PRAGMA busy_timeout = 1500;');
  database.exec('PRAGMA journal_mode = WAL;');
  database.exec('PRAGMA synchronous = NORMAL;');
  initVisitorStatsDatabase(database);
  return database;
}

function initVisitorStatsDatabase(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS visitor_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS visitors (
      visitor_id TEXT PRIMARY KEY,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      last_visit_counted_at TEXT,
      last_seen_date TEXT NOT NULL,
      ip TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS daily_visitors (
      date TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      PRIMARY KEY (date, visitor_id)
    );
    CREATE TABLE IF NOT EXISTS daily_visitor_totals (
      date TEXT PRIMARY KEY,
      visitors INTEGER NOT NULL CHECK (visitors >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_visitors_last_seen_at ON visitors(last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_daily_visitors_date ON daily_visitors(date);
  `);
  const visitorColumns = database.prepare('PRAGMA table_info(visitors)').all().map((column) => column.name);
  if (!visitorColumns.includes('last_visit_counted_at')) {
    database.exec('ALTER TABLE visitors ADD COLUMN last_visit_counted_at TEXT;');
  }
  database.prepare("INSERT OR IGNORE INTO visitor_meta(key, value) VALUES('total_visits', '0')").run();
}

function getVisitorMeta(database, key) {
  const row = database.prepare('SELECT value FROM visitor_meta WHERE key = ?').get(key);
  return typeof row?.value === 'string' ? row.value : '';
}

function setVisitorMeta(database, key, value) {
  database.prepare('INSERT OR REPLACE INTO visitor_meta(key, value) VALUES(?, ?)').run(key, String(value));
}

function loadVisitorStats() {
  visitorStatsDb = createVisitorStatsDatabase();
  migrateJsonVisitorStats(visitorStatsDb, VISITOR_STATS_PATH);
  pruneDailyVisitors(visitorStatsDb);
}

function migrateJsonVisitorStats(database, statsPath) {
  if (getVisitorMeta(database, 'legacy_json_migrated') === '1' || !fs.existsSync(statsPath)) return;

  const content = fs.readFileSync(statsPath, 'utf8');
  const parsed = JSON.parse(content);
  const visitorsById = parsed?.visitorsById && typeof parsed.visitorsById === 'object' ? parsed.visitorsById : {};
  const dailyVisitors = parsed?.dailyVisitors && typeof parsed.dailyVisitors === 'object' ? parsed.dailyVisitors : {};
  const totalVisits = Number.isInteger(parsed?.totalVisits) && parsed.totalVisits >= 0 ? parsed.totalVisits : 0;

  database.exec('BEGIN IMMEDIATE;');
  try {
    const insertVisitor = database.prepare(`
      INSERT OR IGNORE INTO visitors(visitor_id, first_seen_at, last_seen_at, last_visit_counted_at, last_seen_date, ip)
      VALUES(?, ?, ?, ?, ?, ?)
    `);
    const insertDaily = database.prepare('INSERT OR IGNORE INTO daily_visitors(date, visitor_id) VALUES(?, ?)');

    for (const [visitorId, item] of Object.entries(visitorsById)) {
      const safeVisitorId = sanitizeVisitorId(visitorId);
      if (!safeVisitorId || !item || typeof item !== 'object') continue;
      const firstSeenAt = Number.isFinite(Date.parse(item.firstSeenAt)) ? item.firstSeenAt : item.lastSeenAt;
      const lastSeenAt = Number.isFinite(Date.parse(item.lastSeenAt)) ? item.lastSeenAt : firstSeenAt;
      const lastSeenDate = typeof item.lastSeenDate === 'string' && item.lastSeenDate ? item.lastSeenDate : getTodayKey(lastSeenAt);
      const ip = typeof item.ip === 'string' ? item.ip : '';
      if (!Number.isFinite(Date.parse(firstSeenAt)) || !Number.isFinite(Date.parse(lastSeenAt))) continue;
      insertVisitor.run(safeVisitorId, firstSeenAt, lastSeenAt, lastSeenAt, lastSeenDate, ip);
    }

    for (const [date, count] of Object.entries(dailyVisitors)) {
      const visitorCount = Number(count);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(visitorCount) || visitorCount < 0) continue;
      database.prepare('INSERT OR REPLACE INTO daily_visitor_totals(date, visitors) VALUES(?, ?)').run(date, visitorCount);
      for (const [visitorId, item] of Object.entries(visitorsById)) {
        if (item?.lastSeenDate === date) {
          const safeVisitorId = sanitizeVisitorId(visitorId);
          if (safeVisitorId) insertDaily.run(date, safeVisitorId);
        }
      }
    }

    setVisitorMeta(database, 'total_visits', totalVisits);
    setVisitorMeta(database, 'legacy_json_migrated', '1');
    database.exec('COMMIT;');
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }
}

function pruneDailyVisitors(database = visitorStatsDb, now = Date.now()) {
  const cutoffDate = getTodayKey(now - VISITOR_STORE_MAX_DAYS * 24 * 60 * 60 * 1000);
  database.prepare('DELETE FROM daily_visitors WHERE date < ?').run(cutoffDate);
}

function collectVisitorStats(now = Date.now()) {
  return collectVisitorStatsFromDatabase(visitorStatsDb, now);
}

function collectVisitorStatsFromDatabase(database, now = Date.now()) {
  pruneDailyVisitors(database, now);
  const todayKey = getTodayKey(now);
  const onlineSince = new Date(now - VISITOR_ONLINE_WINDOW_MS).toISOString();
  const onlineCount = database.prepare('SELECT COUNT(*) AS count FROM visitors WHERE last_seen_at > ?').get(onlineSince).count;
  const todayExactCount = database.prepare('SELECT COUNT(*) AS count FROM daily_visitors WHERE date = ?').get(todayKey).count;
  const todayTotalRow = database.prepare('SELECT visitors FROM daily_visitor_totals WHERE date = ?').get(todayKey);
  const todayCount = Math.max(todayExactCount, Number(todayTotalRow?.visitors || 0));
  const totalVisitors = database.prepare('SELECT COUNT(*) AS count FROM visitors').get().count;
  const totalVisits = Number(getVisitorMeta(database, 'total_visits'));

  return {
    onlineVisitors: onlineCount,
    todayVisitors: todayCount,
    totalVisitors,
    totalVisits: Number.isFinite(totalVisits) ? totalVisits : 0,
    updatedAt: new Date(now).toISOString(),
  };
}

function collectVisitorHistory(daysInput, now = Date.now()) {
  return collectVisitorHistoryFromDatabase(visitorStatsDb, daysInput, now);
}

function collectVisitorHistoryFromDatabase(database, daysInput, now = Date.now()) {
  const days = Number.isInteger(daysInput) && daysInput > 0
    ? Math.min(daysInput, VISITOR_STORE_MAX_DAYS)
    : 30;
  pruneDailyVisitors(database, now);

  const rows = database.prepare(`
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
  `).all(days)
    .map((item) => ({ date: item.date, visitors: Number(item.visitors || 0) }));

  const visitorsByDate = new Map(rows.map((item) => [item.date, item.visitors]));
  const items = listRecentDateKeys(days, now).map((date) => ({
    date,
    visitors: visitorsByDate.get(date) || 0,
  }));

  const totalVisitors = items.reduce((sum, item) => sum + item.visitors, 0);

  return {
    days,
    items,
    totalVisitors,
    maxVisitors: items.reduce((max, item) => Math.max(max, item.visitors), 0),
    updatedAt: new Date().toISOString(),
  };
}

function registerVisitor(req) {
  enforceVisitorRegisterRateLimit(req);
  return registerVisitorInDatabase(visitorStatsDb, req);
}

function registerVisitorInDatabase(database, req, now = Date.now()) {
  const visitorId = sanitizeVisitorId(req.headers['x-visitor-id']);
  if (!visitorId) {
    const err = new Error('Invalid visitor id');
    err.code = 'EINVAL_VISITOR_ID';
    throw err;
  }

  const nowIso = new Date(now).toISOString();
  const todayKey = getTodayKey(now);
  const ip = getClientIp(req);
  const existing = database.prepare('SELECT visitor_id, last_visit_counted_at FROM visitors WHERE visitor_id = ?').get(visitorId);
  const lastVisitCountedAt = existing?.last_visit_counted_at ? Date.parse(existing.last_visit_counted_at) : NaN;
  const shouldCountVisit = !Number.isFinite(lastVisitCountedAt) || now - lastVisitCountedAt >= VISITOR_VISIT_SESSION_WINDOW_MS;

  database.exec('BEGIN IMMEDIATE;');
  try {
    if (shouldCountVisit) {
      database.prepare("UPDATE visitor_meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'total_visits'").run();
    }
    if (existing) {
      database.prepare(`
        UPDATE visitors
        SET last_seen_at = ?,
            last_visit_counted_at = CASE WHEN ? THEN ? ELSE last_visit_counted_at END,
            last_seen_date = ?,
            ip = ?
        WHERE visitor_id = ?
      `).run(nowIso, shouldCountVisit ? 1 : 0, nowIso, todayKey, ip, visitorId);
    } else {
      database.prepare('INSERT INTO visitors(visitor_id, first_seen_at, last_seen_at, last_visit_counted_at, last_seen_date, ip) VALUES(?, ?, ?, ?, ?, ?)')
        .run(visitorId, nowIso, nowIso, nowIso, todayKey, ip);
    }
    database.prepare('INSERT OR IGNORE INTO daily_visitors(date, visitor_id) VALUES(?, ?)').run(todayKey, visitorId);
    database.exec('COMMIT;');
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }

  return collectVisitorStatsFromDatabase(database, now);
}

function loadJobState() {
  try {
    const content = fs.readFileSync(STATUS_PATH, 'utf8');
    const parsed = JSON.parse(content);
    jobState = {
      ...createInitialJobState(),
      ...parsed,
      running: false,
      task: null,
      trigger: null,
    };
  } catch {
    jobState = createInitialJobState();
  }
  persistJobState();
}

function json(res, statusCode, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token, X-Visitor-Id',
    ...extraHeaders,
  });
  res.end(payload);
}

function setCommonHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token, X-Visitor-Id');
}

function buildWeakEtag(parts) {
  return `W/"${parts.join(':')}"`;
}

function getIfModifiedSinceTime(req) {
  const headerValue = req.headers['if-modified-since'];
  if (typeof headerValue !== 'string' || !headerValue.trim()) return null;
  const time = Date.parse(headerValue);
  return Number.isFinite(time) ? time : null;
}

function isFresh(req, etag, lastModifiedMs) {
  const ifNoneMatch = req.headers['if-none-match'];
  if (typeof ifNoneMatch === 'string' && ifNoneMatch.trim()) {
    return ifNoneMatch.split(',').map((value) => value.trim()).includes(etag);
  }

  const ifModifiedSince = getIfModifiedSinceTime(req);
  if (ifModifiedSince == null || !Number.isFinite(lastModifiedMs)) return false;
  return Math.floor(lastModifiedMs) <= ifModifiedSince;
}

function sendNotModified(res, headers = {}) {
  res.writeHead(304, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token, X-Visitor-Id',
    ...headers,
  });
  res.end();
}

function createLookupError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function createRequestError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function pruneRateWindow(values, now, windowMs) {
  return values.filter((value) => now - value < windowMs);
}

function enforcePlayerLookupRateLimit(req, limit, windowMs) {
  const now = Date.now();
  const ip = getClientIp(req);
  const existing = pruneRateWindow(playerLookupRateWindowByIp.get(ip) || [], now, windowMs);

  if (existing.length >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - existing[0])) / 1000));
    const err = createLookupError('ERATE', '当前查询较多，请稍后再试');
    err.retryAfterSeconds = retryAfterSeconds;
    throw err;
  }

  existing.push(now);
  playerLookupRateWindowByIp.set(ip, existing);
}

function normalizeTextInput(value, maxLength, fieldName, options = {}) {
  const { required = false } = options;
  const normalized = typeof value === 'string'
    ? value.replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim()
    : '';

  if (!normalized) {
    if (required) {
      throw createRequestError('EINVAL_FEEDBACK', `请填写${fieldName}`);
    }
    return '';
  }

  if (normalized.length > maxLength) {
    throw createRequestError('EINVAL_FEEDBACK', `${fieldName}不能超过 ${maxLength} 个字`);
  }

  return normalized;
}

function enforceFeedbackRateLimit(req) {
  const now = Date.now();
  const ip = getClientIp(req);
  const existing = pruneRateWindow(feedbackRateWindowByIp.get(ip) || [], now, FEEDBACK_RATE_WINDOW_MS);

  if (existing.length >= FEEDBACK_RATE_LIMIT) {
    const retryAfterSeconds = Math.max(1, Math.ceil((FEEDBACK_RATE_WINDOW_MS - (now - existing[0])) / 1000));
    const err = createRequestError('ERATE_FEEDBACK', '提交过于频繁，请稍后再试');
    err.retryAfterSeconds = retryAfterSeconds;
    throw err;
  }

  existing.push(now);
  feedbackRateWindowByIp.set(ip, existing);
}

function enforceVisitorRegisterRateLimit(req) {
  const now = Date.now();
  const ip = getClientIp(req);
  const existing = pruneRateWindow(visitorRegisterRateWindowByIp.get(ip) || [], now, VISITOR_REGISTER_RATE_WINDOW_MS);

  if (existing.length >= VISITOR_REGISTER_RATE_LIMIT) {
    const retryAfterSeconds = Math.max(1, Math.ceil((VISITOR_REGISTER_RATE_WINDOW_MS - (now - existing[0])) / 1000));
    const err = createRequestError('ERATE_VISITOR_REGISTER', '访问统计请求过于频繁');
    err.retryAfterSeconds = retryAfterSeconds;
    throw err;
  }

  existing.push(now);
  visitorRegisterRateWindowByIp.set(ip, existing);
}

async function saveFeedback(body, req) {
  enforceFeedbackRateLimit(req);

  const category = typeof body.category === 'string' ? body.category.trim() : '';
  if (!FEEDBACK_CATEGORIES.has(category)) {
    throw createRequestError('EINVAL_FEEDBACK', '反馈类型不正确');
  }

  const area = normalizeTextInput(body.area, FEEDBACK_AREA_LIMIT, '相关模块');
  const title = normalizeTextInput(body.title, FEEDBACK_TITLE_LIMIT, '标题', { required: true });
  const message = normalizeTextInput(body.message, FEEDBACK_MESSAGE_LIMIT, '建议内容', { required: true });
  const contact = normalizeTextInput(body.contact, FEEDBACK_CONTACT_LIMIT, '联系方式');
  const pageUrl = normalizeTextInput(body.pageUrl, FEEDBACK_URL_LIMIT, '页面地址');

  if (title.length < 4) {
    throw createRequestError('EINVAL_FEEDBACK', '标题至少写 4 个字');
  }
  if (message.length < 10) {
    throw createRequestError('EINVAL_FEEDBACK', '建议内容至少写 10 个字');
  }

  ensureDirSync(RUNTIME_DIR);

  const entry = {
    createdAt: new Date().toISOString(),
    ip: getClientIp(req),
    userAgent: typeof req.headers['user-agent'] === 'string'
      ? req.headers['user-agent'].slice(0, 200)
      : '',
    category,
    area,
    title,
    message,
    contact,
    pageUrl,
  };

  await fsp.appendFile(FEEDBACK_PATH, JSON.stringify(entry) + '\n', 'utf8');
  return {
    ok: true,
    message: '建议已收到，感谢反馈。',
    receivedAt: entry.createdAt,
  };
}

function handlePlayerLookupWorkerMessage(message) {
  const pending = playerLookupPending.get(message?.id);
  if (!pending) {
    return;
  }

  playerLookupPending.delete(message.id);
  clearTimeout(pending.timeoutId);

  if (message.ok) {
    pending.resolve(message.result);
    return;
  }

  pending.reject(createLookupError(message.error?.code || 'EPLAYER_LOOKUP', message.error?.message || '玩家检索失败'));
}

function rejectAllPlayerLookupPending(error) {
  for (const pending of playerLookupPending.values()) {
    clearTimeout(pending.timeoutId);
    pending.reject(error);
  }
  playerLookupPending.clear();
}

function getPlayerLookupWorker() {
  if (playerLookupWorker) {
    return playerLookupWorker;
  }

  const worker = new Worker(path.join(__dirname, 'player-search-worker.js'), {
    workerData: {
      dbPath: PLAYER_DB_PATH,
    },
  });

  worker.on('message', handlePlayerLookupWorkerMessage);
  worker.on('error', (error) => {
    rejectAllPlayerLookupPending(createLookupError('EPLAYER_WORKER', '玩家检索服务异常: ' + (error.message || String(error))));
    playerLookupWorker = null;
  });
  worker.on('exit', (code) => {
    if (playerLookupWorker === worker) {
      playerLookupWorker = null;
    }
    if (code !== 0) {
      rejectAllPlayerLookupPending(createLookupError('EPLAYER_WORKER', '玩家检索服务已退出，稍后重试'));
    }
  });

  playerLookupWorker = worker;
  return worker;
}

function runPlayerLookup(command, payload) {
  if (playerLookupPending.size >= PLAYER_LOOKUP_PENDING_LIMIT) {
    throw createLookupError('EPLAYER_BUSY', '当前检索排队过多，请稍后再试');
  }

  if (!fs.existsSync(PLAYER_DB_PATH)) {
    throw createLookupError('EPLAYER_DB_MISSING', '未找到玩家数据库文件 mini_data.db');
  }

  const worker = getPlayerLookupWorker();
  const id = ++playerLookupRequestSeq;

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      playerLookupPending.delete(id);
      reject(createLookupError('EPLAYER_TIMEOUT', '玩家检索超时，请稍后重试'));
    }, PLAYER_LOOKUP_TIMEOUT_MS);

    playerLookupPending.set(id, { resolve, reject, timeoutId });
    worker.postMessage({ id, command, payload });
  });
}

function parsePlayerSearchQuery(searchParams) {
  return {
    keyword: searchParams.get('keyword') ?? searchParams.get('q') ?? '',
    mode: searchParams.get('mode') ?? 'phrase',
    separator: searchParams.get('separator') ?? ' ',
    page: searchParams.get('page') ?? '1',
    pageSize: searchParams.get('pageSize') ?? String(PLAYER_SEARCH_PAGE_SIZE),
  };
}

function parsePlayerHistoryQuery(searchParams) {
  return {
    uid: searchParams.get('uid') ?? '',
  };
}

function normalizeName(rawName) {
  const decoded = decodeURIComponent(rawName || '').split('\\').join('/');
  const normalized = path.basename(decoded).replace(/.json$/i, '');
  if (!normalized) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(normalized)) return null;
  return normalized;
}

function resolveOutputPath(name) {
  const fp = path.resolve(path.join(OUTPUT_DIR, name + '.json'));
  const outputRoot = path.resolve(OUTPUT_DIR) + path.sep;
  if (!fp.startsWith(outputRoot)) return null;
  return fp;
}

function parseConfiguredMaxLevel(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    const err = new Error('invalid maxLevel');
    err.code = 'EINVAL_LEVEL';
    throw err;
  }
  return parsed;
}

function parseConfiguredIntervalMinutes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    const err = new Error('invalid autoRefresh.intervalMinutes');
    err.code = 'EINVAL_INTERVAL';
    throw err;
  }
  return parsed;
}

function parseConfiguredBoolean(value, code, label) {
  if (typeof value !== 'boolean') {
    const err = new Error('invalid ' + label);
    err.code = code;
    throw err;
  }
  return value;
}

function hasOwnProperty(target, key) {
  return Boolean(target) && Object.prototype.hasOwnProperty.call(target, key);
}

function applySettingsPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    const err = new Error('invalid settings payload');
    err.code = 'EINVAL_SETTINGS';
    throw err;
  }

  const nextSettings = createInitialSettings();
  nextSettings.server = { ...appSettings.server };
  nextSettings.data = { ...appSettings.data };
  nextSettings.autoRefresh = { ...appSettings.autoRefresh };

  const autoRefreshInput = body.autoRefresh && typeof body.autoRefresh === 'object' && !Array.isArray(body.autoRefresh)
    ? body.autoRefresh
    : null;

  if (hasOwnProperty(body, 'maxLevel')) {
    nextSettings.data.maxLevel = parseConfiguredMaxLevel(body.maxLevel);
  }

  if (hasOwnProperty(body, 'autoRefreshEnabled')) {
    nextSettings.autoRefresh.enabled = parseConfiguredBoolean(body.autoRefreshEnabled, 'EINVAL_AUTO_REFRESH_ENABLED', 'autoRefresh.enabled');
  } else if (autoRefreshInput && hasOwnProperty(autoRefreshInput, 'enabled')) {
    nextSettings.autoRefresh.enabled = parseConfiguredBoolean(autoRefreshInput.enabled, 'EINVAL_AUTO_REFRESH_ENABLED', 'autoRefresh.enabled');
  }

  if (hasOwnProperty(body, 'autoRefreshIntervalMinutes')) {
    nextSettings.autoRefresh.intervalMinutes = parseConfiguredIntervalMinutes(body.autoRefreshIntervalMinutes);
  } else if (autoRefreshInput && hasOwnProperty(autoRefreshInput, 'intervalMinutes')) {
    nextSettings.autoRefresh.intervalMinutes = parseConfiguredIntervalMinutes(autoRefreshInput.intervalMinutes);
  }

  if (hasOwnProperty(body, 'autoRefreshOnStart')) {
    nextSettings.autoRefresh.onStart = parseConfiguredBoolean(body.autoRefreshOnStart, 'EINVAL_AUTO_REFRESH_ON_START', 'autoRefresh.onStart');
  } else if (autoRefreshInput && hasOwnProperty(autoRefreshInput, 'onStart')) {
    nextSettings.autoRefresh.onStart = parseConfiguredBoolean(autoRefreshInput.onStart, 'EINVAL_AUTO_REFRESH_ON_START', 'autoRefresh.onStart');
  }

  appSettings = nextSettings;
  persistSettings();
}

function parseMaxLevel(searchParams) {
  const raw = searchParams.get('maxLevel') ?? searchParams.get('level');
  if (raw == null || raw === '') return getConfiguredMaxLevel();
  return parseConfiguredMaxLevel(raw);
}

function collectLevelHints(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return [];

  const hints = [];
  const directKeys = [
    'roleLevelRequired',
    'roleLevel',
    'levelRequired',
    'needLevel',
    'openLevel',
    'upLevelLimits',
    'maxLevelRequired',
    'levelRequirement',
    'level',
    'lv',
    'wingLevel'
  ];

  for (const key of directKeys) {
    const value = node[key];
    if (typeof value === 'number' && Number.isFinite(value)) hints.push(value);
  }

  const upLimit = node.upLimit;
  if (Array.isArray(upLimit)) {
    if (upLimit.length === 2 && upLimit.every((value) => typeof value === 'number' && Number.isFinite(value))) {
      hints.push(upLimit[1]);
    }
    for (const entry of upLimit) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      if (Number(entry.type) !== 1 || !Array.isArray(entry.values)) continue;
      for (const value of entry.values) {
        if (typeof value === 'number' && Number.isFinite(value)) hints.push(value);
      }
    }
  }

  return hints;
}

function shouldDropByMaxLevel(node, maxLevel) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;

  if (typeof node.levelStart === 'number' && Number.isFinite(node.levelStart)) {
    return node.levelStart > maxLevel;
  }

  const hints = collectLevelHints(node);
  return hints.some((value) => value > maxLevel);
}

function applyMaxLevel(value, maxLevel) {
  if (maxLevel == null) return value;

  if (Array.isArray(value)) {
    return value
      .map((entry) => applyMaxLevel(entry, maxLevel))
      .filter((entry) => entry !== undefined);
  }

  if (!value || typeof value !== 'object') return value;
  if (shouldDropByMaxLevel(value, maxLevel)) return undefined;

  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    const filteredEntry = applyMaxLevel(entry, maxLevel);
    if (filteredEntry !== undefined) next[key] = filteredEntry;
  }

  if (Array.isArray(value.levels) && Array.isArray(next.levels) && next.levels.length === 0) {
    return undefined;
  }

  if (
    typeof next.levelStart === 'number' &&
    Number.isFinite(next.levelStart) &&
    typeof next.levelEnd === 'number' &&
    Number.isFinite(next.levelEnd) &&
    next.levelEnd > maxLevel
  ) {
    next.levelEnd = maxLevel;
  }

  return next;
}

function trimFashionBallByReachableRank(data, maxLevel) {
  if (!Array.isArray(data)) return data;

  const groups = [...data].sort((left, right) => Number(left.rank) - Number(right.rank));
  const trimmed = [];

  for (const group of groups) {
    if (!group || !Array.isArray(group.levels)) continue;

    const hasBlockedLevel = group.levels.some((level) => shouldDropByMaxLevel(level, maxLevel));
    if (hasBlockedLevel) break;

    trimmed.push(group);
  }

  return trimmed;
}

function toFiniteInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function pickBossDefaultLevel(availableLevels, preferredLevel) {
  if (!Array.isArray(availableLevels) || availableLevels.length === 0) return null;
  let selected = availableLevels[0];
  for (const level of availableLevels) {
    if (level > preferredLevel) break;
    selected = level;
  }
  return selected;
}

function recalculateBossCalculatedProps(boss, level, template) {
  const coefficients = boss?.calcFormula?.coefficients;
  if (!coefficients || !template || typeof template !== 'object') return boss;

  const calculatedProps = { ...(boss.calculatedProps || {}) };
  for (const [key, formula] of Object.entries(coefficients)) {
    if (!Array.isArray(formula) || formula.length < 2) continue;
    const multi = Number(formula[0]) || 0;
    const add = Number(formula[1]) || 0;
    const baseValue = Number(template[key] ?? 0);
    calculatedProps[key] = Math.ceil(baseValue * multi + add);
  }

  const hpRate = Number(boss?.calcFormula?.hpRate || 0);
  if (hpRate > 0 && calculatedProps.hp != null) {
    calculatedProps.hp = Math.ceil(Number(calculatedProps.hp) * hpRate);
  }

  return {
    ...boss,
    level,
    calculatedProps,
  };
}

function trimLeagueBossGroupByConfiguredMaxLevel(group, maxLevel) {
  if (!group || typeof group !== 'object' || Array.isArray(group)) return group;
  if (toFiniteInteger(group.type) !== 33) return group;
  if (!group.levelTemplates || typeof group.levelTemplates !== 'object' || Array.isArray(group.levelTemplates)) return group;

  const templateEntries = Object.entries(group.levelTemplates)
    .map(([level, template]) => [toFiniteInteger(level), template])
    .filter(([level]) => level != null)
    .sort((left, right) => left[0] - right[0]);

  if (templateEntries.length === 0 || !Array.isArray(group.stages)) {
    return group;
  }

  const availableLevels = templateEntries.map(([level]) => level);
  const filteredTemplates = Object.fromEntries(templateEntries.map(([level, template]) => [String(level), template]));
  const degreeWorldLv = group.degreeWorldLv && typeof group.degreeWorldLv === 'object' ? group.degreeWorldLv : {};

  const nextStages = group.stages.map((stage) => {
    if (!stage || typeof stage !== 'object' || Array.isArray(stage)) return stage;

    const levelKey = typeof stage.leagueLevelKey === 'string' ? stage.leagueLevelKey.trim() : '';
    if (!levelKey) {
      return stage;
    }

    const offset = toFiniteInteger(degreeWorldLv[levelKey]) ?? 0;
    const preferredLevel = Math.max(1, maxLevel - offset);
    const resolvedLevel = pickBossDefaultLevel(availableLevels, preferredLevel) ?? availableLevels[0];
    const template = filteredTemplates[String(resolvedLevel)];

    return {
      ...stage,
      stageLv: resolvedLevel,
      bossData: Array.isArray(stage.bossData)
        ? stage.bossData.map((boss) => recalculateBossCalculatedProps(boss, resolvedLevel, template))
        : stage.bossData,
    };
  });

  return {
    ...group,
    levelTemplates: filteredTemplates,
    levelRange: {
      min: availableLevels[0],
      max: availableLevels[availableLevels.length - 1],
    },
    stages: nextStages,
  };
}

function trimBossGroupLevelOverride(group, maxLevel) {
  if (!group || typeof group !== 'object' || Array.isArray(group)) return group;
  if (toFiniteInteger(group.type) === 33) {
    return trimLeagueBossGroupByConfiguredMaxLevel(group, maxLevel);
  }
  if (!group.supportsLevelOverride || !group.levelTemplates || typeof group.levelTemplates !== 'object' || Array.isArray(group.levelTemplates)) {
    return group;
  }

  const maxBossLevel = maxLevel + 30;
  const filteredTemplateEntries = Object.entries(group.levelTemplates).filter(([level]) => {
    const numericLevel = toFiniteInteger(level);
    return numericLevel != null && numericLevel <= maxBossLevel;
  });

  if (filteredTemplateEntries.length === 0) {
    return group;
  }

  const filteredTemplates = Object.fromEntries(filteredTemplateEntries);
  const availableLevels = filteredTemplateEntries
    .map(([level]) => toFiniteInteger(level))
    .filter((level) => level != null)
    .sort((left, right) => left - right);

  const defaultLevel = pickBossDefaultLevel(availableLevels, maxLevel);
  const nextGroup = {
    ...group,
    defaultLevel,
    levelTemplates: filteredTemplates,
    levelRange: {
      min: availableLevels[0],
      max: availableLevels[availableLevels.length - 1],
    },
  };

  if (Array.isArray(group.levelOptions)) {
    nextGroup.levelOptions = group.levelOptions.filter((level) => {
      const numericLevel = toFiniteInteger(level);
      return numericLevel != null && numericLevel <= maxBossLevel;
    });
  }

  if (Array.isArray(group.stages)) {
    nextGroup.stages = group.stages.map((stage) => {
      if (!stage || typeof stage !== 'object' || Array.isArray(stage) || !stage.levelOverride || typeof stage.levelOverride !== 'object') {
        return stage;
      }

      return {
        ...stage,
        levelOverride: {
          ...stage.levelOverride,
          defaultLevel,
          maxLevel: Math.min(toFiniteInteger(stage.levelOverride.maxLevel) ?? maxBossLevel, maxBossLevel),
        },
      };
    });
  }

  return nextGroup;
}

function applyBossLevelDisplayRules(name, content, maxLevel) {
  if (maxLevel == null || !shouldSkipMaxLevelFilter(name)) return content;
  if (!content || typeof content !== 'object') return content;

  if (name === 'boss_stage_stats' && Array.isArray(content.data)) {
    return {
      ...content,
      data: content.data.map((group) => trimBossGroupLevelOverride(group, maxLevel)),
    };
  }

  if (!content.data || typeof content.data !== 'object' || Array.isArray(content.data)) {
    return content;
  }

  return {
    ...content,
    data: trimBossGroupLevelOverride(content.data, maxLevel),
  };
}

function applySystemSpecificFilter(name, content, maxLevel) {
  const bossAdjustedContent = applyBossLevelDisplayRules(name, content, maxLevel);

  if (name !== 'role_fashion_ball') return bossAdjustedContent;
  if (!bossAdjustedContent || typeof bossAdjustedContent !== 'object' || !Array.isArray(bossAdjustedContent.data)) return bossAdjustedContent;
  return {
    ...bossAdjustedContent,
    data: trimFashionBallByReachableRank(bossAdjustedContent.data, maxLevel),
  };
}

async function listOutputFiles() {
  ensureDirSync(OUTPUT_DIR);
  const entries = await fsp.readdir(OUTPUT_DIR, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const name = entry.name.slice(0, -5);
    const fullPath = path.join(OUTPUT_DIR, entry.name);
    const stat = await fsp.stat(fullPath);
    files.push({ name, size: stat.size, mtimeMs: stat.mtimeMs });
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  return files;
}

function buildFilesCacheHeaders(files) {
  const latestMtimeMs = files.reduce((latest, file) => Math.max(latest, file.mtimeMs || 0), 0);
  const totalSize = files.reduce((total, file) => total + (file.size || 0), 0);
  return {
    etag: buildWeakEtag(['files', files.length, totalSize, Math.floor(latestMtimeMs)]),
    lastModified: latestMtimeMs ? new Date(latestMtimeMs).toUTCString() : new Date(0).toUTCString(),
    cacheControl: 'no-cache',
  };
}

async function getOutputFileCacheMetadata(name, searchParams) {
  const fp = resolveOutputPath(name);
  if (!fp) {
    const err = new Error('invalid path');
    err.code = 'EINVAL_PATH';
    throw err;
  }

  const stat = await fsp.stat(fp);
  const maxLevelKey = searchParams.get('maxLevel') || '';
  return {
    etag: buildWeakEtag(['output', name, stat.size, Math.floor(stat.mtimeMs), maxLevelKey]),
    lastModified: new Date(stat.mtimeMs).toUTCString(),
    cacheControl: 'no-cache',
  };
}

async function loadOutputFile(name) {
  const fp = resolveOutputPath(name);
  if (!fp) {
    const err = new Error('invalid path');
    err.code = 'EINVAL_PATH';
    throw err;
  }
  const content = await fsp.readFile(fp, 'utf-8');
  return JSON.parse(content);
}

function shouldSkipMaxLevelFilter(name) {
  return name === 'boss_stage_stats' || name.startsWith('boss_type_');
}

function withAppliedFilter(name, content, maxLevel) {
  if (maxLevel == null) return content;
  if (shouldSkipMaxLevelFilter(name)) return content;
  if (!content || typeof content !== 'object') return content;
  if (!('data' in content)) return applyMaxLevel(content, maxLevel);
  return { ...content, data: applyMaxLevel(content.data, maxLevel) };
}

function writeSse(res, event, data) {
  res.write('event: ' + event + '\n');
  res.write('data: ' + JSON.stringify(data) + '\n\n');
}

function broadcast(event, data) {
  for (const client of sseClients) writeSse(client, event, data);
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

function resolveWebPath(requestPath) {
  const decoded = decodeURIComponent(requestPath || '').split('\\').join('/');
  const safePath = decoded === '/' ? '/index.html' : decoded;
  const relativePath = safePath.replace(/^\/+/, '');
  const filePath = path.resolve(path.join(WEB_DIST_DIR, relativePath));
  const webRoot = path.resolve(WEB_DIST_DIR);
  const rootWithSep = webRoot + path.sep;
  if (filePath !== webRoot && !filePath.startsWith(rootWithSep)) return null;
  return filePath;
}

async function tryServeFrontend(pathname, res) {
  try {
    if (!fs.existsSync(WEB_DIST_DIR)) return false;

    const directPath = resolveWebPath(pathname);
    if (directPath && fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
      const ext = path.extname(directPath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
      });
      fs.createReadStream(directPath).pipe(res);
      return true;
    }

    const indexPath = path.join(WEB_DIST_DIR, 'index.html');
    if (!fs.existsSync(indexPath)) return false;
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(indexPath).pipe(res);
    return true;
  } catch (error) {
    console.error('[data-api] failed to serve frontend:', error.message);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Frontend unavailable');
    return true;
  }
}

async function emitFileChange(fileName, eventType) {
  if (!fileName || !fileName.endsWith('.json')) return;
  const name = fileName.slice(0, -5);
  const fp = path.join(OUTPUT_DIR, fileName);
  try {
    const stat = await fsp.stat(fp);
    broadcast('file-changed', { type: eventType, name, size: stat.size, mtimeMs: stat.mtimeMs });
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      broadcast('file-changed', { type: 'deleted', name });
      return;
    }
    console.error('[data-api] watch error:', err.message);
  }
}

function startOutputWatcher() {
  if (outputWatcher) return;
  ensureDirSync(OUTPUT_DIR);
  outputWatcher = fs.watch(OUTPUT_DIR, { persistent: true }, (eventType, fileName) => {
    emitFileChange(fileName, eventType).catch((err) => {
      console.error('[data-api] failed to emit file change:', err.message);
    });
  });
}

function stopOutputWatcher() {
  if (!outputWatcher) return;
  outputWatcher.close();
  outputWatcher = null;
}

function readAdminToken(req) {
  const headerToken = req.headers['x-admin-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) return headerToken.trim();
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return '';
}

function ensureAdmin(req, res) {
  if (!OPS_ENABLED) {
    json(res, 403, { error: '设置面板未启用，请使用专用启动命令开启。' });
    return false;
  }
  const adminToken = getAdminToken();
  if (!adminToken) return true;
  if (readAdminToken(req) === adminToken) return true;
  json(res, 401, { error: 'Admin token required' });
  return false;
}

function countJsonFilesSync(dir) {
  try {
    ensureDirSync(dir);
    return fs.readdirSync(dir).filter((name) => name.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

async function collectJobStatus() {
  let latestOutputAt = null;
  let latestDataApiAt = null;

  try {
    const outputFiles = await listOutputFiles();
    latestOutputAt = outputFiles.reduce((latest, file) => (!latest || file.mtimeMs > latest ? file.mtimeMs : latest), 0);
  } catch {
    latestOutputAt = null;
  }

  try {
    ensureDirSync(DATA_API_DIR);
    const entries = await fsp.readdir(DATA_API_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const stat = await fsp.stat(path.join(DATA_API_DIR, entry.name));
      if (!latestDataApiAt || stat.mtimeMs > latestDataApiAt) latestDataApiAt = stat.mtimeMs;
    }
  } catch {
    latestDataApiAt = null;
  }

  return {
    ...jobState,
    authRequired: Boolean(getAdminToken()),
    opsEnabled: OPS_ENABLED,
    autoRefreshEnabled: getAutoRefreshEnabled(),
    autoRefreshIntervalMinutes: getAutoRefreshIntervalMinutes(),
    autoRefreshOnStart: getAutoRefreshOnStart(),
    outputFileCount: countJsonFilesSync(OUTPUT_DIR),
    dataApiFileCount: countJsonFilesSync(DATA_API_DIR),
    latestOutputAt: latestOutputAt ? new Date(latestOutputAt).toISOString() : null,
    latestDataApiAt: latestDataApiAt ? new Date(latestDataApiAt).toISOString() : null,
    uptimeSeconds: Math.round(process.uptime()),
    serverTime: new Date().toISOString(),
    defaultMaxLevel: DEFAULT_SETTINGS.data.maxLevel,
    configuredMaxLevel: getConfiguredMaxLevel(),
  };
}

function scheduleNextRun() {
  if (scheduleTimer) {
    clearTimeout(scheduleTimer);
    scheduleTimer = null;
  }
  if (!getAutoRefreshEnabled()) {
    jobState.nextRunAt = null;
    persistJobState();
    return;
  }
  const delayMs = getAutoRefreshIntervalMinutes() * 60 * 1000;
  const nextRunAt = new Date(Date.now() + delayMs).toISOString();
  jobState.nextRunAt = nextRunAt;
  persistJobState();
  scheduleTimer = setTimeout(async () => {
    try {
      if (!jobState.running) {
        await runTask('pipeline', 'schedule');
      } else {
        appendLog('检测到上一次任务仍在运行，跳过本次定时更新。');
      }
    } catch (error) {
      appendLog('任务执行失败: ' + (error.message || String(error)));
    } finally {
      scheduleNextRun();
    }
  }, delayMs);
  scheduleTimer.unref();
}

async function runTask(task, trigger) {
  if (!TASK_SCRIPTS[task]) {
    const err = new Error('Unknown task: ' + task);
    err.code = 'EINVAL_TASK';
    throw err;
  }
  if (jobState.running) {
    const err = new Error('Task ' + jobState.task + ' is already running');
    err.code = 'EJOBRUNNING';
    throw err;
  }

  if (scheduleTimer) {
    clearTimeout(scheduleTimer);
    scheduleTimer = null;
  }

  const scriptPath = TASK_SCRIPTS[task];
  const startedAt = Date.now();

  jobState = {
    ...jobState,
    running: true,
    task,
    trigger,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: null,
    lastExitCode: null,
    lastError: null,
    nextRunAt: null,
    logLines: [...jobState.logLines.slice(-(MAX_LOG_LINES - 1)), '[' + new Date().toISOString() + '] 开始任务 ' + task + ' (' + trigger + ')'],
  };
  persistJobState();
  broadcast('job-status', await collectJobStatus());

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    runningChild = child;

    child.stdout.on('data', (chunk) => {
      const text = String(chunk).trim();
      if (!text) return;
      for (const line of text.split(/\r?\n/)) appendLog(line);
      void collectJobStatus().then((status) => broadcast('job-status', status));
    });

    child.stderr.on('data', (chunk) => {
      const text = String(chunk).trim();
      if (!text) return;
      for (const line of text.split(/\r?\n/)) appendLog('[stderr] ' + line);
      void collectJobStatus().then((status) => broadcast('job-status', status));
    });

    child.on('error', (error) => {
      runningChild = null;
      const finishedAt = Date.now();
      jobState = {
        ...jobState,
        running: false,
        task: null,
        trigger: null,
        finishedAt: new Date(finishedAt).toISOString(),
        lastFailedAt: new Date(finishedAt).toISOString(),
        lastDurationMs: finishedAt - startedAt,
        lastExitCode: -1,
        lastError: error.message,
      };
      persistJobState();
      scheduleNextRun();
      void collectJobStatus().then((status) => broadcast('job-status', status));
      reject(error);
    });

    child.on('close', (code) => {
      runningChild = null;
      const finishedAt = Date.now();
      const succeeded = code === 0;
      jobState = {
        ...jobState,
        running: false,
        task: null,
        trigger: null,
        finishedAt: new Date(finishedAt).toISOString(),
        lastDurationMs: finishedAt - startedAt,
        lastExitCode: code,
        lastError: succeeded ? null : 'Task exited with code ' + code,
        lastSucceededAt: succeeded ? new Date(finishedAt).toISOString() : jobState.lastSucceededAt,
        lastFailedAt: succeeded ? jobState.lastFailedAt : new Date(finishedAt).toISOString(),
      };
      appendLog(succeeded ? '任务完成: ' + task : '任务失败: ' + task + '，退出码 ' + code);
      persistJobState();
      scheduleNextRun();
      void collectJobStatus().then((status) => broadcast('job-status', status));
      if (succeeded) {
        resolve();
        return;
      }
      const error = new Error('Task ' + task + ' failed with exit code ' + code);
      error.code = 'ETASKFAILED';
      reject(error);
    });
  });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function getBattlefieldService() {
  if (!battlefieldService) {
    battlefieldService = createBattlefieldService({ dataApiDir: DATA_API_DIR });
  }
  return battlefieldService;
}

function parseBattlefieldQuery(searchParams) {
  const params = {};
  const battlefieldTier = searchParams.get('battlefieldTier');
  const battlefieldLevel = searchParams.get('battlefieldLevel') ?? searchParams.get('level');
  const starLevel = searchParams.get('starLevel') ?? searchParams.get('star');
  const bossStage = searchParams.get('bossStage');

  if (battlefieldTier != null && battlefieldTier !== '') params.battlefieldTier = Number(battlefieldTier);
  if (battlefieldLevel != null && battlefieldLevel !== '') params.battlefieldLevel = Number(battlefieldLevel);
  if (starLevel != null && starLevel !== '') params.starLevel = Number(starLevel);
  if (bossStage != null && bossStage !== '') params.bossStage = Number(bossStage);

  return params;
}

const server = http.createServer(async (req, res) => {
  setCommonHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pathname = parsedUrl.pathname;

  if (req.method === 'GET' && pathname === '/api/health') {
    json(res, 200, {
      ok: true,
      outputDir: OUTPUT_DIR,
      dataApiDir: DATA_API_DIR,
      opsEnabled: OPS_ENABLED,
      playerNameSearchEnabled: PLAYER_NAME_SEARCH_ENABLED,
      port: getServerPort(),
      maxLevel: getConfiguredMaxLevel(),
      defaultMaxLevel: DEFAULT_SETTINGS.data.maxLevel
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/visitor-stats') {
    json(res, 200, collectVisitorStats());
    return;
  }

  if (req.method === 'GET' && pathname === '/api/visitor-stats/history') {
    const days = Number(parsedUrl.searchParams.get('days') || 30);
    json(res, 200, collectVisitorHistory(Number.isInteger(days) ? days : 30));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/visitor-stats/register') {
    try {
      json(res, 200, registerVisitor(req));
    } catch (err) {
      if (err.code === 'EINVAL_VISITOR_ID') {
        json(res, 400, { error: 'Invalid visitor id' });
        return;
      }
      if (err.code === 'ERATE_VISITOR_REGISTER') {
        json(res, 429, { error: err.message }, { 'Retry-After': String(err.retryAfterSeconds) });
        return;
      }
      json(res, 500, { error: '访问统计记录失败: ' + (err.message || String(err)) });
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/files') {
    try {
      const files = await listOutputFiles();
      const cacheHeaders = buildFilesCacheHeaders(files);
      if (isFresh(req, cacheHeaders.etag, Date.parse(cacheHeaders.lastModified))) {
        sendNotModified(res, {
          'Cache-Control': cacheHeaders.cacheControl,
          ETag: cacheHeaders.etag,
          'Last-Modified': cacheHeaders.lastModified,
        });
        return;
      }
      json(res, 200, { files }, {
        'Cache-Control': cacheHeaders.cacheControl,
        ETag: cacheHeaders.etag,
        'Last-Modified': cacheHeaders.lastModified,
      });
    } catch (err) {
      json(res, 500, { error: 'Failed to list files: ' + err.message });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/feedback') {
    try {
      const body = await readRequestBody(req);
      json(res, 201, await saveFeedback(body, req));
    } catch (err) {
      if (err.code === 'ERATE_FEEDBACK') {
        res.setHeader('Retry-After', String(err.retryAfterSeconds || 60));
        json(res, 429, { error: err.message });
        return;
      }
      if (err.code === 'EINVAL_FEEDBACK') {
        json(res, 400, { error: err.message });
        return;
      }
      if (err.message === 'Request body too large') {
        json(res, 413, { error: '提交内容过大，请精简后重试' });
        return;
      }
      json(res, 500, { error: '保存反馈失败: ' + (err.message || String(err)) });
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/player-name/search') {
    if (!PLAYER_NAME_SEARCH_ENABLED) {
      json(res, 404, { error: '名字反查 UID 功能未启用' });
      return;
    }
    try {
      enforcePlayerLookupRateLimit(req, PLAYER_SEARCH_RATE_LIMIT, PLAYER_SEARCH_RATE_WINDOW_MS);
      json(res, 200, await runPlayerLookup('search', parsePlayerSearchQuery(parsedUrl.searchParams)));
    } catch (err) {
      if (err.code === 'ERATE') {
        res.setHeader('Retry-After', String(err.retryAfterSeconds || 1));
        json(res, 429, { error: err.message });
        return;
      }
      if (err.code === 'EINVAL_KEYWORD' || err.code === 'EINVAL_TOKENS') {
        json(res, 400, { error: err.message });
        return;
      }
      if (err.code === 'EPLAYER_BUSY') {
        json(res, 503, { error: err.message });
        return;
      }
      if (err.code === 'EPLAYER_TIMEOUT') {
        json(res, 504, { error: err.message });
        return;
      }
      if (err.code === 'EPLAYER_DB_MISSING' || err.code === 'EDBPATH' || err.code === 'ETABLE' || err.code === 'EPLAYER_WORKER') {
        json(res, 500, { error: err.message });
        return;
      }
      json(res, 500, { error: '玩家检索失败: ' + (err.message || String(err)) });
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/player-name/history') {
    try {
      enforcePlayerLookupRateLimit(req, PLAYER_HISTORY_RATE_LIMIT, PLAYER_HISTORY_RATE_WINDOW_MS);
      json(res, 200, await runPlayerLookup('history', parsePlayerHistoryQuery(parsedUrl.searchParams)));
    } catch (err) {
      if (err.code === 'ERATE') {
        res.setHeader('Retry-After', String(err.retryAfterSeconds || 1));
        json(res, 429, { error: err.message });
        return;
      }
      if (err.code === 'EINVAL_UID') {
        json(res, 400, { error: err.message });
        return;
      }
      if (err.code === 'EPLAYER_BUSY') {
        json(res, 503, { error: err.message });
        return;
      }
      if (err.code === 'EPLAYER_TIMEOUT') {
        json(res, 504, { error: err.message });
        return;
      }
      if (err.code === 'EPLAYER_DB_MISSING' || err.code === 'EDBPATH' || err.code === 'ETABLE' || err.code === 'EPLAYER_WORKER') {
        json(res, 500, { error: err.message });
        return;
      }
      json(res, 500, { error: '玩家历史查询失败: ' + (err.message || String(err)) });
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/battlefield/config') {
    try {
      json(res, 200, getBattlefieldService().getConfig());
    } catch (err) {
      battlefieldService = null;
      json(res, 500, { error: 'Failed to load battlefield config: ' + err.message });
    }
    return;
  }

  if ((req.method === 'GET' || req.method === 'POST') && pathname === '/api/battlefield') {
    try {
      const params = req.method === 'POST'
        ? await readRequestBody(req)
        : parseBattlefieldQuery(parsedUrl.searchParams);
      json(res, 200, getBattlefieldService().calculate(params));
    } catch (err) {
      if (err.message === 'Request body too large') {
        json(res, 413, { error: err.message });
        return;
      }
      if (/must be|lookup failed|at least|one of/.test(err.message || '')) {
        json(res, 400, { error: err.message });
        return;
      }
      battlefieldService = null;
      json(res, 500, { error: 'Failed to calculate battlefield data: ' + (err.message || String(err)) });
    }
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/data/')) {
    const rawName = pathname.slice('/api/data/'.length);
    const name = normalizeName(rawName);
    if (!name) {
      json(res, 400, { error: 'Invalid file name' });
      return;
    }
    try {
      const maxLevel = parseMaxLevel(parsedUrl.searchParams);
      const cacheHeaders = await getOutputFileCacheMetadata(name, parsedUrl.searchParams);
      if (isFresh(req, cacheHeaders.etag, Date.parse(cacheHeaders.lastModified))) {
        sendNotModified(res, {
          'Cache-Control': cacheHeaders.cacheControl,
          ETag: cacheHeaders.etag,
          'Last-Modified': cacheHeaders.lastModified,
        });
        return;
      }
      const content = await loadOutputFile(name);
      json(res, 200, withAppliedFilter(name, applySystemSpecificFilter(name, content, maxLevel), maxLevel), {
        'Cache-Control': cacheHeaders.cacheControl,
        ETag: cacheHeaders.etag,
        'Last-Modified': cacheHeaders.lastModified,
      });
    } catch (err) {
      if (err.code === 'EINVAL_LEVEL') {
        json(res, 400, { error: 'Invalid maxLevel, expected a non-negative integer' });
        return;
      }
      if (err.code === 'ENOENT') {
        json(res, 404, { error: name + '.json not found' });
        return;
      }
      json(res, 500, { error: 'Failed to read ' + name + '.json: ' + err.message });
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/admin/status') {
    if (!ensureAdmin(req, res)) return;
    json(res, 200, await collectJobStatus());
    return;
  }

  if (req.method === 'POST' && pathname === '/api/admin/settings') {
    if (!ensureAdmin(req, res)) return;
    try {
      const body = await readRequestBody(req);
      applySettingsPatch(body);
      scheduleNextRun();
      broadcast('job-status', await collectJobStatus());
      json(res, 200, await collectJobStatus());
    } catch (err) {
      if (err.code === 'EINVAL_LEVEL') {
        json(res, 400, { error: 'Invalid maxLevel, expected a non-negative integer' });
        return;
      }
      if (err.code === 'EINVAL_INTERVAL') {
        json(res, 400, { error: 'Invalid autoRefresh.intervalMinutes, expected a positive integer' });
        return;
      }
      if (err.code === 'EINVAL_AUTO_REFRESH_ENABLED') {
        json(res, 400, { error: 'Invalid autoRefresh.enabled, expected a boolean' });
        return;
      }
      if (err.code === 'EINVAL_AUTO_REFRESH_ON_START') {
        json(res, 400, { error: 'Invalid autoRefresh.onStart, expected a boolean' });
        return;
      }
      if (err.code === 'EINVAL_SETTINGS') {
        json(res, 400, { error: 'Invalid settings payload' });
        return;
      }
      if (err.message === 'Request body too large') {
        json(res, 413, { error: err.message });
        return;
      }
      json(res, 500, { error: err.message || String(err) });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/admin/run') {
    if (!ensureAdmin(req, res)) return;
    try {
      const body = await readRequestBody(req);
      const task = typeof body.task === 'string' ? body.task : 'pipeline';
      const pending = runTask(task, 'manual').catch((error) => {
        appendLog('任务执行失败: ' + (error.message || String(error)));
      });
      void pending;
      json(res, 202, await collectJobStatus());
    } catch (err) {
      if (err.code === 'EJOBRUNNING') {
        json(res, 409, { error: err.message, status: await collectJobStatus() });
        return;
      }
      if (err.code === 'EINVAL_TASK') {
        json(res, 400, { error: err.message });
        return;
      }
      if (err.message === 'Request body too large') {
        json(res, 413, { error: err.message });
        return;
      }
      json(res, 500, { error: err.message || String(err) });
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*'
    });

    res.write(': connected\n\n');
    sseClients.add(res);
    writeSse(res, 'ready', { connectedAt: new Date().toISOString() });
    writeSse(res, 'job-status', await collectJobStatus());

    const heartbeat = setInterval(() => {
      res.write(': ping\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
    return;
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && !pathname.startsWith('/api/')) {
    const served = await tryServeFrontend(pathname, res);
    if (served) return;
  }

  json(res, 404, { error: 'Not found' });
});

function shutdown() {
  if (scheduleTimer) clearTimeout(scheduleTimer);
  stopOutputWatcher();
  if (runningChild) runningChild.kill('SIGTERM');
  if (playerLookupWorker) {
    void playerLookupWorker.terminate();
    playerLookupWorker = null;
  }
  for (const client of sseClients) client.end();
  sseClients.clear();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

if (process.env.DATA_API_TEST_MODE === '1') {
  module.exports = {
    __test: {
      createInitialVisitorStats,
      createVisitorStatsDatabase,
      collectVisitorStatsFromDatabase,
      collectVisitorHistoryFromDatabase,
      registerVisitorInDatabase,
      migrateJsonVisitorStats,
    },
  };
} else {
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  ensureDirSync(OUTPUT_DIR);
  ensureDirSync(DATA_API_DIR);
  loadJobState();
  loadVisitorStats();
  loadSettings();
  startOutputWatcher();
  const LISTEN_PORT = getServerPort();
  const LISTEN_HOST = getServerHost();

  server.listen(LISTEN_PORT, LISTEN_HOST, () => {
    console.log('[data-api] listening on http://' + LISTEN_HOST + ':' + LISTEN_PORT);
    console.log('[data-api] reading output from ' + OUTPUT_DIR);
    console.log('[data-api] ops panel ' + (OPS_ENABLED ? 'enabled' : 'disabled'));
    if (getAutoRefreshEnabled()) {
      console.log('[data-api] auto refresh every ' + getAutoRefreshIntervalMinutes() + ' minutes');
    }
    if (getAutoRefreshOnStart()) {
      runTask('pipeline', 'startup')
        .catch((error) => {
          appendLog('任务执行失败: ' + (error.message || String(error)));
        })
        .finally(() => {
          scheduleNextRun();
        });
    } else {
      scheduleNextRun();
    }
  });
}
