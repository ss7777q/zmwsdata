const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_API_TEST_MODE = '1';
const {
  __test: {
    createVisitorStatsDatabase,
    collectVisitorStatsFromDatabase,
    registerVisitorInDatabase,
    migrateJsonVisitorStats,
  },
} = require(path.join(__dirname, '..', 'server', 'data-api.js'));

function createRequest(visitorId, ip = '127.0.0.1') {
  return {
    headers: {
      'x-visitor-id': visitorId,
      'x-forwarded-for': ip,
    },
    socket: { remoteAddress: ip },
  };
}

function createTempDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visitor-stats-'));
  return {
    tempDir,
    dbPath: path.join(tempDir, 'visitor-stats.db'),
  };
}

const { tempDir, dbPath } = createTempDb();
let database = null;

try {
  database = createVisitorStatsDatabase(dbPath);
  const firstVisitTime = new Date('2026-04-25T10:00:00+08:00').getTime();
  const heartbeatTime = firstVisitTime + 60 * 1000;
  const secondSessionTime = firstVisitTime + 31 * 60 * 1000;
  const nextDayVisitTime = new Date('2026-04-26T09:00:00+08:00').getTime();

  let stats = registerVisitorInDatabase(database, createRequest('visitor0001'), firstVisitTime);
  assert.strictEqual(stats.onlineVisitors, 1);
  assert.strictEqual(stats.todayVisitors, 1);
  assert.strictEqual(stats.totalVisitors, 1);
  assert.strictEqual(stats.totalVisits, 1);

  stats = registerVisitorInDatabase(database, createRequest('visitor0001'), heartbeatTime);
  assert.strictEqual(stats.todayVisitors, 1);
  assert.strictEqual(stats.totalVisitors, 1);
  assert.strictEqual(stats.totalVisits, 1);

  stats = registerVisitorInDatabase(database, createRequest('visitor0001'), secondSessionTime);
  assert.strictEqual(stats.todayVisitors, 1);
  assert.strictEqual(stats.totalVisitors, 1);
  assert.strictEqual(stats.totalVisits, 2);

  stats = registerVisitorInDatabase(database, createRequest('visitor0002'), secondSessionTime);
  assert.strictEqual(stats.todayVisitors, 2);
  assert.strictEqual(stats.totalVisitors, 2);
  assert.strictEqual(stats.totalVisits, 3);

  stats = registerVisitorInDatabase(database, createRequest('visitor0001'), nextDayVisitTime);
  assert.strictEqual(stats.todayVisitors, 1);
  assert.strictEqual(stats.totalVisitors, 2);
  assert.strictEqual(stats.totalVisits, 4);

  const laterStats = collectVisitorStatsFromDatabase(database, nextDayVisitTime + 5 * 60 * 1000);
  assert.strictEqual(laterStats.onlineVisitors, 0);
  assert.strictEqual(laterStats.totalVisits, 4);

  database.close();
  database = createVisitorStatsDatabase(dbPath);
  const persistedStats = collectVisitorStatsFromDatabase(database, nextDayVisitTime);
  assert.strictEqual(persistedStats.totalVisitors, 2);
  assert.strictEqual(persistedStats.totalVisits, 4);

  const legacyPath = path.join(tempDir, 'legacy-visitor-stats.json');
  fs.writeFileSync(legacyPath, JSON.stringify({
    totalVisitors: 1,
    totalVisits: 7,
    visitorsById: {
      visitor0003: {
        firstSeenAt: '2026-04-25T01:00:00.000Z',
        lastSeenAt: '2026-04-25T01:00:00.000Z',
        lastSeenDate: '2026-04-25',
        ip: '127.0.0.3',
      },
    },
    dailyVisitors: {
      '2026-04-25': 1,
    },
  }), 'utf8');

  const migratedDbPath = path.join(tempDir, 'migrated.db');
  const migratedDatabase = createVisitorStatsDatabase(migratedDbPath);
  migrateJsonVisitorStats(migratedDatabase, legacyPath);
  const migratedStats = collectVisitorStatsFromDatabase(migratedDatabase, new Date('2026-04-25T01:01:00.000Z').getTime());
  assert.strictEqual(migratedStats.totalVisitors, 1);
  assert.strictEqual(migratedStats.totalVisits, 7);
  assert.strictEqual(migratedStats.todayVisitors, 1);
  migratedDatabase.close();
} finally {
  if (database) database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
