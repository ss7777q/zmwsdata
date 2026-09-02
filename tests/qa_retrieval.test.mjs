import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { handleQaRequest } from '../frontend/functions/api/_shared/qa-service.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(testDir, '..', 'frontend', 'public', 'data');
const originalFetch = globalThis.fetch;

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  const file = decodeURIComponent(url.pathname.split('/').pop()).replace(/\.json$/, '');
  const target = path.join(dataDir, `${file}.json`);
  if (!fs.existsSync(target)) return new Response('not found', { status: 404 });
  const data = fs.readFileSync(target);
  return new Response(data, {
    status: 200,
    headers: { 'Content-Length': String(data.length) },
  });
};

async function ask(question) {
  const request = new Request('https://qa.test/api/qa/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  const response = await handleQaRequest({ request, env: { QA_MODE: 'mock' } });
  assert.equal(response.status, 200);
  return response.json();
}

try {
  const danyuan = await ask('大鹏丹元的详细机制与数值是啥样的,在哪里可以找到');
  assert.ok(danyuan.files.includes('role_danyuan_effect_family_29'));
  assert.ok(!danyuan.files.includes('role_danyuan_effect_family_1'));
  assert.deepEqual(danyuan.citations.map((citation) => citation.title), [
    '大鹏丹元 · 机制与品质数值',
    '大鹏丹元 · 等级成长数值',
    '大鹏丹元 丹元族系索引',
  ]);

  const fashion = await ask('胧月时装续费需要多少');
  assert.equal(fashion.citations.length, 1);
  assert.equal(fashion.citations[0].source, 'role_fashion_renew.json / wing/第7类');

  const matrix = await ask('红水阵法回血是怎么回的');
  assert.equal(matrix.citations.length, 1);
  assert.equal(matrix.citations[0].source, 'role_matrix_skill.json / matrixSkill:10009');

  const multiplayer = await ask('主线里面双人会翻几倍属性');
  assert.equal(multiplayer.citations.length, 1);
  assert.equal(multiplayer.citations[0].source, 'cold_knowledge.json / multiplayer-dungeon-boost');

  const pet = await ask('玄武的技能是什么');
  assert.ok(pet.files.includes('pet_wiki_xuanwu'));
  assert.ok(pet.citations.some((c) => c.title.includes('玄武大帝')));

  const petEquip = await ask('只查140级灭蒙护盔：打造、0重升1重、4重升5重分别要多少灵魂和神灵晶？');
  assert.ok(petEquip.files.includes('pet_equip_make'));

  const petHelmet = await ask('灭蒙护盔怎么打造');
  assert.ok(petHelmet.files.includes('pet_equip_make'));

  const roleAlias = await ask('小白龙把突刺觉醒成力龙以后，普通霸体目标会不会被带着走？这招合计倍率是多少？');
  assert.ok(roleAlias.files.includes('role_wiki_aolie'));

  const godWar = await ask('神魔战场每场祝福最多获取多少神灵石和魔灵石');
  assert.ok(godWar.files.includes('call_god_stone_rewards'));
  assert.ok(godWar.citations.some((c) => c.title.includes('神灵石与魔灵石')));
} finally {
  globalThis.fetch = originalFetch;
}
