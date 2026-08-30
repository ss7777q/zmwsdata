const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createBossSearchService } = require('../server/boss-search-service');

const OUTPUT_DIR = path.resolve(__dirname, '..', 'output');

test('boss search service loads and builds index', () => {
  const service = createBossSearchService({ outputDir: OUTPUT_DIR });
  const stats = service.getStats();
  assert.ok(stats.bossCount > 2000, `Expected > 2000 bosses, got ${stats.bossCount}`);
  assert.ok(stats.groupCount >= 20, `Expected >= 20 groups, got ${stats.groupCount}`);
});

test('searchBosses finds exact match for 牛魔王', () => {
  const service = createBossSearchService({ outputDir: OUTPUT_DIR });
  const results = service.searchBosses('牛魔王');
  assert.ok(results.length >= 2, 'Should find instances of 牛魔王');
  assert.equal(results[0].name, '牛魔王');
  assert.ok(results[0].hp > 0, 'HP should be positive');
  assert.ok(results[0].atk > 0, 'ATK should be positive');
  assert.ok(results[0].def > 0, 'DEF should be positive');
  assert.ok(results[0].lv > 0, 'LV should be positive');
});

test('searchBosses finds exact match for 东海龙王', () => {
  const service = createBossSearchService({ outputDir: OUTPUT_DIR });
  const results = service.searchBosses('东海龙王');
  assert.ok(results.length >= 3, 'Should find all instances of 东海龙王');
  assert.equal(results[0].name, '东海龙王');
  assert.ok(results[0].lv > 0, 'LV should be positive');
});

test('searchBosses handles empty or whitespace queries cleanly', () => {
  const service = createBossSearchService({ outputDir: OUTPUT_DIR });
  assert.deepEqual(service.searchBosses(''), []);
  assert.deepEqual(service.searchBosses('   '), []);
  assert.deepEqual(service.searchBosses(null), []);
});

test('searchBosses supports limit and mob filtering', () => {
  const service = createBossSearchService({ outputDir: OUTPUT_DIR });
  const limited = service.searchBosses('王', { limit: 5 });
  assert.equal(limited.length, 5);

  const noMobs = service.searchBosses('魔', { includeMobs: false });
  for (const b of noMobs) {
    assert.notEqual(b.stageType, 9999, 'Should not contain mob stageType 9999');
  }
});

test('searchBosses finds boss by stage name', () => {
  const service = createBossSearchService({ outputDir: OUTPUT_DIR });
  const results = service.searchBosses('黄泉路');
  assert.ok(results.length > 0, 'Should find bosses in 黄泉路');
  assert.ok(results.some((b) => b.stageName === '黄泉路'));
});

function httpRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
            json: () => JSON.parse(data),
          });
        });
      }
    );
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

test('HTTP endpoint /api/boss/search and /api/getMonster integration', async () => {
  const testPort = 18799;
  const child = spawn(process.execPath, [path.resolve(__dirname, '..', 'server', 'data-api.js')], {
    env: {
      ...process.env,
      PORT: String(testPort),
      DATA_API_ENABLE_OPS: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    // Wait for server to start
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server start timed out')), 8000);
      child.stdout.on('data', (buf) => {
        const text = buf.toString();
        if (text.includes('listening on http://')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      child.stderr.on('data', (buf) => {
        const text = buf.toString();
        if (text.includes('listening on http://')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Test 1: GET /api/boss/search?keywords=牛魔王
    const res1 = await httpRequest(`http://127.0.0.1:${testPort}/api/boss/search?keywords=${encodeURIComponent('牛魔王')}`);
    assert.equal(res1.statusCode, 200);
    const json1 = res1.json();
    assert.equal(json1.code, 200);
    assert.ok(json1.data.count > 0);
    assert.equal(json1.data.data[0].name, '牛魔王');
    assert.ok(json1.data.data[0].atk > 0);
    assert.ok(json1.data.data[0].def > 0);

    // Test 2: GET /api/getMonster?keywords=东海龙王 (118qq compatible endpoint)
    const res2 = await httpRequest(`http://127.0.0.1:${testPort}/api/getMonster?keywords=${encodeURIComponent('东海龙王')}`);
    assert.equal(res2.statusCode, 200);
    const json2 = res2.json();
    assert.equal(json2.code, 200);
    assert.ok(json2.data.count >= 1);
    assert.equal(json2.data.data[0].name, '东海龙王');
    assert.ok(json2.data.data[0].lv > 0);

    // Test 3: POST /api/boss/search with JSON body
    const res3 = await httpRequest(
      `http://127.0.0.1:${testPort}/api/boss/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { keywords: '孟婆', limit: 10 }
    );
    assert.equal(res3.statusCode, 200);
    const json3 = res3.json();
    assert.equal(json3.code, 200);
    assert.ok(json3.data.count > 0);
    assert.equal(json3.data.data[0].name, '孟婆');
  } finally {
    child.kill('SIGTERM');
  }
});
