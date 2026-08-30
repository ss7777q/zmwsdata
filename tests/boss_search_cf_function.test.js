const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('Cloudflare Pages Function: boss-search-service edge search', async () => {
  const { searchBosses } = await import('../frontend/functions/api/_shared/boss-search-service.js');
  
  // Test 1: exact match
  const results1 = searchBosses('牛魔王');
  assert.ok(results1.length >= 2, 'Should find 牛魔王');
  assert.equal(results1[0].name, '牛魔王');
  assert.ok(results1[0].atk > 0);
  assert.ok(results1[0].def > 0);
  assert.ok(results1[0].hp > 0);
  assert.ok(results1[0].lv > 0);

  // Test 2: 东海龙王
  const results2 = searchBosses('东海龙王');
  assert.ok(results2.length >= 3, 'Should find 东海龙王');
  assert.equal(results2[0].name, '东海龙王');

  // Test 3: empty search
  assert.deepEqual(searchBosses(''), []);
  assert.deepEqual(searchBosses('   '), []);

  // Test 4: limit
  const limited = searchBosses('王', { limit: 3 });
  assert.equal(limited.length, 3);

  // Test 5: mob filtering
  const noMobs = searchBosses('魔', { includeMobs: false });
  for (const b of noMobs) {
    assert.notEqual(b.stageType, 9999);
  }
});

test('Cloudflare Pages Function: onRequest handler simulation', async () => {
  const { onRequest, onRequestOptions } = await import('../frontend/functions/api/boss/search.js');

  // Test OPTIONS request
  const optRes = onRequestOptions();
  assert.equal(optRes.status, 204);
  assert.equal(optRes.headers.get('Access-Control-Allow-Origin'), '*');

  // Test GET request
  const getReq = new Request('https://datazmws.pages.dev/api/boss/search?keywords=' + encodeURIComponent('牛魔王'));
  const getRes = await onRequest({ request: getReq });
  assert.equal(getRes.status, 200);
  assert.equal(getRes.headers.get('Access-Control-Allow-Origin'), '*');
  const getJson = await getRes.json();
  assert.equal(getJson.code, 200);
  assert.ok(getJson.data.count > 0);
  assert.equal(getJson.data.data[0].name, '牛魔王');

  // Test POST request
  const postReq = new Request('https://datazmws.pages.dev/api/boss/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywords: '孟婆', limit: 5 }),
  });
  const postRes = await onRequest({ request: postReq });
  assert.equal(postRes.status, 200);
  const postJson = await postRes.json();
  assert.equal(postJson.code, 200);
  assert.ok(postJson.data.count > 0);
  assert.equal(postJson.data.data[0].name, '孟婆');
});
