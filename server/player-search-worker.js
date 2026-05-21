const { parentPort, workerData } = require('worker_threads');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = workerData?.dbPath;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 50;
const MIN_PHRASE_LENGTH = 2;
const TIME_EXPR = "CASE WHEN time < 1000000000000 THEN CAST(ROUND(time * 1000) AS INTEGER) ELSE CAST(time AS INTEGER) END";

let db = null;

function ensureDb() {
  if (db) {
    return db;
  }

  if (!DB_PATH) {
    const err = new Error('数据库路径未配置');
    err.code = 'EDBPATH';
    throw err;
  }

  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA busy_timeout = 1500;');

  const tableRow = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'player_info'").get();
  if (!tableRow) {
    const err = new Error('数据库缺少 player_info 表');
    err.code = 'ETABLE';
    throw err;
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_player_info_uid_time ON player_info(uid, time DESC);');
  return db;
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

function normalizeSeparator(separator) {
  if (typeof separator !== 'string') {
    return ' ';
  }
  return separator.slice(0, 8);
}

function splitTokens(keyword, separator) {
  const normalizedSeparator = normalizeSeparator(separator);
  const parts = normalizedSeparator.trim()
    ? keyword.split(normalizedSeparator)
    : keyword.split(/\s+/);

  return Array.from(new Set(
    parts
      .map((part) => part.trim())
      .filter(Boolean)
  ));
}

function toPositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseSearchPayload(payload) {
  const keyword = typeof payload?.keyword === 'string' ? payload.keyword.trim() : '';
  const mode = payload?.mode === 'tokens' ? 'tokens' : 'phrase';
  const separator = normalizeSeparator(payload?.separator);
  const page = toPositiveInteger(payload?.page, 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, toPositiveInteger(payload?.pageSize, DEFAULT_PAGE_SIZE));

  if (!keyword) {
    const err = new Error('请输入要检索的名字');
    err.code = 'EINVAL_KEYWORD';
    throw err;
  }

  const tokens = mode === 'tokens' ? splitTokens(keyword, separator) : [];
  if (mode === 'phrase' && keyword.length < MIN_PHRASE_LENGTH) {
    const err = new Error('连续匹配至少输入 2 个字');
    err.code = 'EINVAL_KEYWORD';
    throw err;
  }
  if (mode === 'tokens' && tokens.length < 2) {
    const err = new Error('分词拼接模式至少输入两个片段');
    err.code = 'EINVAL_TOKENS';
    throw err;
  }

  return {
    keyword,
    mode,
    separator,
    page,
    pageSize,
    tokens,
  };
}

function buildWhereClause(search) {
  const clauses = [
    'name IS NOT NULL',
    "TRIM(name) <> ''",
  ];
  const params = [];

  if (search.mode === 'phrase') {
    clauses.push("name LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(search.keyword)}%`);
  } else {
    for (const token of search.tokens) {
      clauses.push("name LIKE ? ESCAPE '\\'");
      params.push(`%${escapeLike(token)}%`);
    }
  }

  return {
    whereClause: clauses.join(' AND '),
    params,
  };
}

function searchByName(payload) {
  const database = ensureDb();
  const search = parseSearchPayload(payload);
  const { whereClause, params } = buildWhereClause(search);
  const limit = search.pageSize + 1;
  const offset = (search.page - 1) * search.pageSize;

  const sql = `
    WITH matched AS (
      SELECT
        rowid,
        uid,
        name,
        ${TIME_EXPR} AS normalized_time
      FROM player_info
      WHERE ${whereClause}
    ),
    page_rows AS (
      SELECT
        uid,
        MAX(normalized_time) AS latest_match_time,
        COUNT(*) AS matched_records,
        COUNT(DISTINCT name) AS distinct_name_count
      FROM matched
      GROUP BY uid
      ORDER BY latest_match_time DESC, uid ASC
      LIMIT ? OFFSET ?
    )
    SELECT
      page_rows.uid AS uid,
      page_rows.latest_match_time AS latestMatchTime,
      page_rows.matched_records AS matchedRecords,
      page_rows.distinct_name_count AS distinctNameCount,
      (
        SELECT matched.name
        FROM matched
        WHERE matched.uid = page_rows.uid
        ORDER BY matched.normalized_time DESC, matched.rowid DESC
        LIMIT 1
      ) AS latestMatchedName,
      (
        SELECT player_info.name
        FROM player_info
        WHERE player_info.uid = page_rows.uid
          AND player_info.name IS NOT NULL
          AND TRIM(player_info.name) <> ''
        ORDER BY ${TIME_EXPR} DESC, player_info.rowid DESC
        LIMIT 1
      ) AS currentName,
      (
        SELECT ${TIME_EXPR}
        FROM player_info
        WHERE player_info.uid = page_rows.uid
          AND player_info.name IS NOT NULL
          AND TRIM(player_info.name) <> ''
        ORDER BY ${TIME_EXPR} DESC, player_info.rowid DESC
        LIMIT 1
      ) AS currentTime
    FROM page_rows
    ORDER BY latestMatchTime DESC, uid ASC
  `;

  const rows = database.prepare(sql).all(...params, limit, offset);
  const hasMore = rows.length > search.pageSize;
  const items = rows.slice(0, search.pageSize).map((row) => ({
    uid: row.uid,
    latestMatchTime: row.latestMatchTime,
    matchedRecords: row.matchedRecords,
    distinctNameCount: row.distinctNameCount,
    latestMatchedName: row.latestMatchedName || '',
    currentName: row.currentName || row.latestMatchedName || '',
    currentTime: row.currentTime ?? row.latestMatchTime,
  }));

  return {
    mode: search.mode,
    keyword: search.keyword,
    separator: search.separator,
    page: search.page,
    pageSize: search.pageSize,
    hasMore,
    items,
  };
}

function getUidHistory(payload) {
  const database = ensureDb();
  const uid = typeof payload?.uid === 'string' ? payload.uid.trim() : '';

  if (!uid) {
    const err = new Error('请输入 UID');
    err.code = 'EINVAL_UID';
    throw err;
  }

  const summarySql = `
    WITH named_rows AS (
      SELECT
        rowid,
        uid,
        name,
        ${TIME_EXPR} AS normalized_time
      FROM player_info
      WHERE uid = ?
        AND name IS NOT NULL
        AND TRIM(name) <> ''
    )
    SELECT
      COUNT(*) AS rawRecordCount,
      COUNT(DISTINCT name) AS distinctNameCount,
      (
        SELECT name
        FROM named_rows
        ORDER BY normalized_time DESC, rowid DESC
        LIMIT 1
      ) AS currentName,
      (
        SELECT normalized_time
        FROM named_rows
        ORDER BY normalized_time DESC, rowid DESC
        LIMIT 1
      ) AS currentTime
    FROM named_rows
  `;

  const itemsSql = `
    WITH named_rows AS (
      SELECT
        rowid,
        uid,
        name,
        ${TIME_EXPR} AS normalized_time
      FROM player_info
      WHERE uid = ?
        AND name IS NOT NULL
        AND TRIM(name) <> ''
    )
    SELECT
      name,
      MIN(normalized_time) AS firstSeenAt,
      MAX(normalized_time) AS lastSeenAt,
      COUNT(*) AS seenCount
    FROM named_rows
    GROUP BY name
    ORDER BY lastSeenAt DESC, name ASC
  `;

  const summary = database.prepare(summarySql).get(uid) || {
    rawRecordCount: 0,
    distinctNameCount: 0,
    currentName: '',
    currentTime: null,
  };

  const items = database.prepare(itemsSql).all(uid).map((row) => ({
    name: row.name,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    seenCount: row.seenCount,
    isCurrent: row.name === summary.currentName,
  }));

  return {
    uid,
    currentName: summary.currentName || '',
    currentTime: summary.currentTime,
    rawRecordCount: summary.rawRecordCount || 0,
    distinctNameCount: summary.distinctNameCount || 0,
    items,
  };
}

function handleMessage(message) {
  const id = message?.id;
  const command = message?.command;

  try {
    let result;
    if (command === 'search') {
      result = searchByName(message.payload);
    } else if (command === 'history') {
      result = getUidHistory(message.payload);
    } else {
      const err = new Error('不支持的玩家检索命令');
      err.code = 'EINVAL_COMMAND';
      throw err;
    }

    parentPort.postMessage({ id, ok: true, result });
  } catch (error) {
    parentPort.postMessage({
      id,
      ok: false,
      error: {
        message: error.message || String(error),
        code: error.code || 'EPLAYER_LOOKUP',
      },
    });
  }
}

parentPort.on('message', handleMessage);
