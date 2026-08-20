import assert from 'node:assert/strict';

import { handleQaRequest } from '../frontend/functions/api/_shared/qa-service.js';

const originalFetch = globalThis.fetch;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function ask(env, question = '宠物技能升级到满级需要多少宠技要诀？') {
  const request = new Request('https://qa.test/api/qa/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  return handleQaRequest({ request, env });
}

try {
  let modelCall = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.href === 'https://catalog.test/api/qa/catalog/search') {
      return json({
        files: ['pet_skill'],
        documents: [{
          id: 101,
          file: 'pet_skill',
          pointer: '/',
          title: '宠物技能升级',
          source: 'pet_skill.json / $',
          text: 'skillLevel.soulCost（实际主要为宠技要诀）',
          score: 10,
        }],
      });
    }
    if (url.href === 'https://catalog.test/api/qa/catalog/query') {
      const body = JSON.parse(init.body);
      assert.equal(body.file, 'pet_skill');
      assert.equal(body.aggregate, 'sum');
      return json({
        file: 'pet_skill',
        source: 'pet_skill.json / $.data.levels',
        aggregate: 'sum',
        matchedItems: 59,
        value: 18637,
        groups: [{ key: 'all', value: 18637 }],
        samples: [],
      });
    }
    if (url.href === 'https://model.test/v1/chat/completions') {
      modelCall += 1;
      if (modelCall === 1) {
        return json({ choices: [{ message: { content: null, tool_calls: [{ id: 'search-1', function: { name: 'search_knowledge', arguments: '{"query":"宠技要诀 宠物技能"}' } }] } }] });
      }
      if (modelCall === 2) {
        return json({ choices: [{ message: { content: null, tool_calls: [{ id: 'query-1', function: { name: 'query_records', arguments: '{"file":"pet_skill","pointer":"/data/levels","aggregate":"sum","value_path":"/upgradeCost/*/count","filters":[{"path":"/level","min":2},{"path":"/upgradeCost/*/name","equals":"宠技要诀"}]}' } }] } }] });
      }
      return json({ choices: [{ message: { content: '已学会 Lv.1 的普通宠物技能升到 Lv.60 共需 18637 个宠技要诀。[1][2]', tool_calls: [] } }] });
    }
    throw new Error(`unexpected request: ${url.href}`);
  };

  const success = await ask({
    QA_BASE_URL: 'https://model.test',
    QA_API_KEY: 'test-key',
    QA_MODEL_ORDER: 'test-model',
    QA_CATALOG_BASE: 'https://catalog.test/api/qa/catalog',
  });
  assert.equal(success.status, 200);
  const successBody = await success.json();
  assert.match(successBody.answer, /18637/);
  assert.deepEqual(successBody.files, ['pet_skill']);
  assert.equal(successBody.citations.length, 2);

  let priorityModelCall = 0;
  const searchNoise = '目录噪声'.repeat(1_500);
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.href === 'https://catalog.test/api/qa/catalog/search') {
      return json({
        files: ['role/wiki/孙悟空/index'],
        documents: [1, 2, 3].map((id) => ({
          id,
          file: 'role/wiki/孙悟空/index',
          pointer: `$.noise[${id}]`,
          title: `目录结果 ${id}`,
          source: `role/wiki/孙悟空/index.json / $.noise[${id}]`,
          text: searchNoise,
          score: 10 - id,
        })),
      });
    }
    if (url.href === 'https://catalog.test/api/qa/catalog/read') {
      return json({
        records: [{
          file: 'role/wiki/孙悟空/烈焰闪',
          title: '烈焰闪精确记录',
          source: 'role/wiki/孙悟空/烈焰闪.json / $.data.slot.base.header',
          value: { name: '烈焰闪', totalPer: 1.7, hitCount: 1 },
        }],
      });
    }
    if (url.href === 'https://model.test/v1/chat/completions') {
      priorityModelCall += 1;
      if (priorityModelCall === 1) {
        return json({ choices: [{ message: { content: null, tool_calls: [{ id: 'search-priority', function: { name: 'search_knowledge', arguments: '{"query":"孙悟空 烈焰闪"}' } }] } }] });
      }
      if (priorityModelCall === 2) {
        return json({ choices: [{ message: { content: null, tool_calls: [{ id: 'read-priority', function: { name: 'read_records', arguments: '{"file":"role/wiki/孙悟空/烈焰闪","pointers":["$.data.slot.base.header"]}' } }] } }] });
      }
      if (priorityModelCall === 3) {
        return json({ choices: [{ message: { content: '资料读取完毕', tool_calls: [] } }] });
      }
      const body = JSON.parse(init.body);
      const systemContext = body.messages?.[0]?.content || '';
      assert.match(systemContext, /烈焰闪精确记录/);
      assert.match(systemContext, /"totalPer": 1\.7/);
      return json({ choices: [{ message: { content: '烈焰闪为 1 段，总倍率 1.7。[4]', tool_calls: [] } }] });
    }
    throw new Error(`unexpected request: ${url.href}`);
  };

  const prioritized = await ask({
    QA_BASE_URL: 'https://model.test',
    QA_API_KEY: 'test-key',
    QA_MODEL_ORDER: 'test-model',
    QA_CATALOG_BASE: 'https://catalog.test/api/qa/catalog',
  });
  assert.equal(prioritized.status, 200);
  assert.match((await prioritized.json()).answer, /1\.7/);

  let directRoleModelCall = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.href === 'https://catalog.test/api/qa/catalog/search') {
      return json({
        files: ['role/wiki/敖烈/index'],
        documents: [{
          id: 1,
          file: 'role/wiki/敖烈/index',
          pointer: '/',
          title: '敖烈',
          source: 'role/wiki/敖烈/index.json / $',
          text: '技能目录',
          score: 10,
        }],
      });
    }
    if (url.href === 'https://catalog.test/api/qa/catalog/read') {
      const body = JSON.parse(init.body);
      assert.equal(body.file, 'role/wiki/敖烈/突刺');
      return json({
        records: [{
          file: body.file,
          title: '突刺·力龙',
          source: 'role/wiki/敖烈/突刺.json / $.data.slot.awakens[1]',
          value: { name: '突刺·力龙', mechanics: '可推动普通霸体单位', totalPer: 2.952 },
        }],
      });
    }
    if (url.href === 'https://model.test/v1/chat/completions') {
      directRoleModelCall += 1;
      if (directRoleModelCall === 1) {
        return json({ choices: [{ message: { content: null, tool_calls: [{ id: 'search-role', function: { name: 'search_knowledge', arguments: '{"query":"敖烈 突刺 力龙"}' } }] } }] });
      }
      if (directRoleModelCall === 2) {
        return json({ choices: [{ message: { content: '资料读取完毕', tool_calls: [] } }] });
      }
      const body = JSON.parse(init.body);
      assert.match(body.messages?.[0]?.content || '', /可推动普通霸体单位/);
      return json({ choices: [{ message: { content: '突刺·力龙可推动普通霸体单位，总倍率 2.952。[2]', tool_calls: [] } }] });
    }
    throw new Error(`unexpected request: ${url.href}`);
  };

  const directRole = await ask({
    QA_BASE_URL: 'https://model.test',
    QA_API_KEY: 'test-key',
    QA_MODEL_ORDER: 'test-model',
    QA_CATALOG_BASE: 'https://catalog.test/api/qa/catalog',
  }, '小白龙的【突刺】如何切换？觉醒【突刺·力龙】有什么霸体判定？');
  assert.equal(directRole.status, 200);
  assert.match((await directRole.json()).answer, /2\.952/);

  let routedReadModelCall = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.href === 'https://catalog.test/api/qa/catalog/search') {
      return json({
        files: ['pet_equip_make'],
        documents: [{
          id: 1,
          file: 'pet_equip_make',
          pointer: '$.data[36]',
          title: '灭蒙护盔',
          source: 'pet_equip_make.json / $.data[36]',
          text: '140级灭蒙套装',
          score: 10,
        }],
      });
    }
    if (url.href === 'https://catalog.test/api/qa/catalog/read') {
      const body = JSON.parse(init.body);
      assert.equal(body.file, 'pet_equip_make');
      assert.deepEqual(body.pointers, ['/data/0', '/data/4', '/data/8', '/data/12', '/data/16', '/data/20', '/data/24', '/data/28', '/data/32', '/data/36']);
      assert.equal(body.limit, 10);
      return json({
        records: [
          {
            file: body.file,
            title: '旋龟护盔',
            source: 'pet_equip_make.json / $.data[0]',
            value: { name: '旋龟护盔', level: 50, cost: [{ name: '神灵晶', count: 16 }] },
          },
          {
            file: body.file,
            title: '祸斗护盔',
            source: 'pet_equip_make.json / $.data[20]',
            value: { name: '祸斗护盔', level: 100, cost: [{ name: '神灵晶', count: 169 }] },
          },
          {
            file: body.file,
            title: '灭蒙护盔',
            source: 'pet_equip_make.json / $.data[36]',
            value: { name: '灭蒙护盔', level: 140, cost: [{ name: '神灵晶', count: 369 }] },
          },
        ],
      });
    }
    if (url.href === 'https://model.test/v1/chat/completions') {
      routedReadModelCall += 1;
      if (routedReadModelCall === 1) {
        return json({ choices: [{ message: { content: null, tool_calls: [{ id: 'search-pet-equip', function: { name: 'search_knowledge', arguments: '{"query":"宠物装备 神灵晶"}' } }] } }] });
      }
      if (routedReadModelCall === 2) {
        return json({ choices: [{ message: { content: '资料读取完毕', tool_calls: [] } }] });
      }
      const body = JSON.parse(init.body);
      const systemContext = body.messages?.[0]?.content || '';
      assert.match(systemContext, /旋龟护盔/);
      assert.match(systemContext, /祸斗护盔/);
      assert.match(systemContext, /灭蒙护盔/);
      assert.match(systemContext, /"count": 369/);
      return json({ choices: [{ message: { content: '50、100、140级代表套装资料均已读取。[2][3][4]', tool_calls: [] } }] });
    }
    throw new Error(`unexpected request: ${url.href}`);
  };

  const routedRead = await ask({
    QA_BASE_URL: 'https://model.test',
    QA_API_KEY: 'test-key',
    QA_MODEL_ORDER: 'test-model',
    QA_CATALOG_BASE: 'https://catalog.test/api/qa/catalog',
  }, '宠物装备（50级旋龟到140级灭蒙套装）打造和升重需要多少神灵晶？');
  assert.equal(routedRead.status, 200);
  assert.match((await routedRead.json()).answer, /50、100、140/);

  let rideStarModelCall = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.href === 'https://catalog.test/api/qa/catalog/search') {
      return json({
        files: ['ride_star'],
        documents: [{
          id: 2,
          file: 'ride_star',
          pointer: '$.data.groups',
          title: '坐骑升星',
          source: 'ride_star.json / $.data.groups',
          text: '普通与凶兽坐骑升星消耗',
          score: 10,
        }],
      });
    }
    if (url.href === 'https://catalog.test/api/qa/catalog/read') {
      const body = JSON.parse(init.body);
      assert.equal(body.file, 'ride_star');
      assert.deepEqual(body.pointers, ['/data/groups/0/promoteStarCost', '/data/groups/1/promoteStarCost']);
      return json({
        records: [
          {
            file: body.file,
            title: '普通坐骑升星消耗',
            source: 'ride_star.json / $.data.groups[0].promoteStarCost',
            value: [{ star: 3, cost: [{ name: '舜星草', count: 2 }] }],
          },
          {
            file: body.file,
            title: '凶兽坐骑升星消耗',
            source: 'ride_star.json / $.data.groups[1].promoteStarCost',
            value: [{ star: 3, cost: [{ name: '凶星草', count: 120 }] }],
          },
        ],
      });
    }
    if (url.href === 'https://model.test/v1/chat/completions') {
      rideStarModelCall += 1;
      if (rideStarModelCall === 1) {
        return json({ choices: [{ message: { content: null, tool_calls: [{ id: 'search-ride-star', function: { name: 'search_knowledge', arguments: '{"query":"坐骑升星"}' } }] } }] });
      }
      const body = JSON.parse(init.body);
      assert.match(body.messages?.[0]?.content || '', /舜星草/);
      assert.match(body.messages?.[0]?.content || '', /凶星草/);
      return json({ choices: [{ message: { content: '普通坐骑用舜星草，凶兽用凶星草。[1][2]', tool_calls: [] } }] });
    }
    throw new Error(`unexpected request: ${url.href}`);
  };

  const rideStar = await ask({
    QA_BASE_URL: 'https://model.test',
    QA_API_KEY: 'test-key',
    QA_MODEL_ORDER: 'test-model',
    QA_CATALOG_BASE: 'https://catalog.test/api/qa/catalog',
  }, '坐骑升星需要哪些材料？');
  assert.equal(rideStar.status, 200);
  assert.match((await rideStar.json()).answer, /舜星草/);

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.startsWith('/data/')) return json({ data: [] });
    if (url.href === 'https://dsml.test/v1/chat/completions') {
      return json({ choices: [{ message: { content: '<｜｜DSML｜｜tool_calls><｜｜DSML｜｜invoke name="search_knowledge">', tool_calls: [] } }] });
    }
    throw new Error(`unexpected request: ${url.href}`);
  };

  const failed = await ask({
    QA_BASE_URL: 'https://dsml.test',
    QA_API_KEY: 'test-key',
    QA_MODEL_ORDER: 'dsml-test',
  });
  assert.equal(failed.status, 503);
  const failedBody = await failed.json();
  assert.equal(failedBody.code, 'EQA_ALL_MODELS_FAILED');
  assert.doesNotMatch(JSON.stringify(failedBody), /DSML|tool_calls/);
} finally {
  globalThis.fetch = originalFetch;
}
