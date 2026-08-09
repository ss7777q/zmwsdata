import assert from 'node:assert/strict';

import { handleQaRequest } from '../frontend/functions/api/_shared/qa-service.js';

const originalFetch = globalThis.fetch;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function ask(env) {
  const request = new Request('https://qa.test/api/qa/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: '宠物技能升级到满级需要多少宠技要诀？' }),
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
