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

async function ask(question, history = []) {
  const request = new Request('https://qa.test/api/qa/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history }),
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

  const expTest = await ask('升级经验需求');
  assert.ok(expTest.files.includes('exp'));
  assert.ok(expTest.citations.some((c) => c.title.includes('抗值标准')));

  const combatMech = await ask('伤害计算与抗性算法');
  assert.ok(combatMech.citations.some((c) => c.title.includes('伤害计算链路')));

  const clawEquip = await ask('天马爪刃怎么打造');
  assert.ok(clawEquip.files.includes('pet_equip_make'));

  const bossHit = await ask('235级52000命中打玥伶会出闪避吗');
  assert.ok(bossHit.citations.some((c) => c.title.includes('玥伶')));

  const followUp = await ask('那满级后伤害倍率是多少？', [
    { role: 'user', content: '悟空烈焰闪满级有多少段？' },
    { role: 'assistant', content: '烈焰闪满级为18段' },
  ]);
  assert.ok(followUp.files.includes('role_wiki_wukong'));

  // 新接入模块测试
  const starStone = await ask('摇光攻伐星石有哪些词条与极效');
  assert.ok(starStone.files.includes('role_starstone') || starStone.files.includes('role_starstone_effect'));

  const godWeapon = await ask('伏羲琴神器有什么效果');
  assert.ok(godWeapon.files.includes('role_godweapon_effect'));

  const rogueItem = await ask('震天雷局内道具有什么效果');
  assert.ok(rogueItem.files.includes('rogue_item_analysis'));
  assert.ok(rogueItem.citations.some((c) => c.title.includes('震天雷')));

  const magicSoul = await ask('救世圣莲附灵属性');
  assert.ok(magicSoul.files.includes('role_magic_soul'));

  const xiuxin = await ask('修心系统心境属性加成');
  assert.ok(xiuxin.files.includes('role_heart'));

  const waidan = await ask('外丹有什么属性加成');
  assert.ok(waidan.files.includes('role_waidan'));

  const petStar = await ask('宠物升星消耗什么材料');
  assert.ok(petStar.files.includes('pet_star'));

  const petGodWeapon = await ask('宠物神兵属性加成');
  assert.ok(petGodWeapon.files.includes('pet_god_weapon'));

  const callGodRatio = await ask('神魔属性倍率与继承规则');
  assert.ok(callGodRatio.files.includes('call_god_ratio') || callGodRatio.files.includes('call_god_attribute'));

  const stageDrops = await ask('桃花源关卡掉落什么物品');
  assert.ok(stageDrops.files.includes('stage_expected_drops'));

  const extremeStatsExcluded = await ask('极限属性满配最高战力');
  assert.ok(!extremeStatsExcluded.files.includes('role_extreme_stats_source_map'));
  assert.ok(!extremeStatsExcluded.files.includes('role_extreme_stats_stage_curves'));
} finally {
  globalThis.fetch = originalFetch;
}
