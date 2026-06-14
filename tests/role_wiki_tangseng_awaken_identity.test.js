const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const outputFile = path.join(repoRoot, 'output', 'role_wiki_tangseng.json');
const extractTangsengRoleWiki = require(path.join(repoRoot, 'scripts', 'extract', 'role_wiki_tangseng.js'));

const TANGSENG_HEAL_SKILL_ID = 2001050;
const HEAL_SHIELD_AWAKEN_ID = 2001052;
const HEAL_RAIN_AWAKEN_ID = 2001051;
const HEAL_PUDU_AWAKEN_ID = 2001054;
const LOW_LEVEL = 1;
const HIGH_LEVEL = 45;
const RAIN_TICK_COUNT = 5;

function readPayload() {
  return JSON.parse(fs.readFileSync(outputFile, 'utf8')).data;
}

function findHealSlot(payload) {
  const slot = payload.slots.find((entry) => entry.base.skillId === TANGSENG_HEAL_SKILL_ID);
  assert.ok(slot, '缺少唐僧天降甘露技能槽');
  return slot;
}

function findAwaken(slot, skillId) {
  const awaken = slot.awakens.find((entry) => entry.skillId === skillId);
  assert.ok(awaken, `缺少天降甘露觉醒 ${skillId}`);
  return awaken;
}

function growthBuffVal(card, level) {
  const row = card.levels.find((entry) => entry.level === level);
  assert.ok(row, `${card.name} 缺少 Lv.${level} 成长行`);
  assert.strictEqual(row.growthBuffs.length, 1, `${card.name} Lv.${level} 成长 buff 数量异常`);
  const value = row.growthBuffs[0].value;
  assert.ok(value, `${card.name} Lv.${level} 成长 buff 缺少数值`);
  assert.strictEqual(typeof value.val, 'number', `${card.name} Lv.${level} 成长 buff 固定值不是数字`);
  return value.val;
}

function metricDisplay(card, level, key) {
  const row = card.levels.find((entry) => entry.level === level);
  assert.ok(row, `${card.name} 缺少 Lv.${level} 成长行`);
  const metric = row.metrics.find((entry) => entry.key === key);
  assert.ok(metric, `${card.name} Lv.${level} 缺少指标 ${key}`);
  return metric.display;
}

extractTangsengRoleWiki();

const payload = readPayload();
const healSlot = findHealSlot(payload);
assert.strictEqual(healSlot.allAwakenIdentical, false, '天降甘露不应被识别为全部同数值觉醒');

const shield = findAwaken(healSlot, HEAL_SHIELD_AWAKEN_ID);
const rain = findAwaken(healSlot, HEAL_RAIN_AWAKEN_ID);
const pudu = findAwaken(healSlot, HEAL_PUDU_AWAKEN_ID);

assert.strictEqual(shield.identicalToBase, false, '天降甘露·冰盾护盾值不同，不应与基础天降甘露合并');
assert.strictEqual(rain.identicalToBase, false, '天降甘露·霖雨总回血不同，不应与基础天降甘露合并');
assert.strictEqual(pudu.identicalToBase, true, '天降甘露·普渡与基础天降甘露成长数值相同，应合并');

for (const level of [LOW_LEVEL, HIGH_LEVEL]) {
  const baseVal = growthBuffVal(healSlot.base, level);
  assert.notStrictEqual(growthBuffVal(shield, level), baseVal, `Lv.${level} 冰盾护盾值不应等于基础回血值`);
  assert.notStrictEqual(growthBuffVal(rain, level), baseVal, `Lv.${level} 霖雨总回血不应等于基础回血值`);
  assert.strictEqual(growthBuffVal(pudu, level), baseVal, `Lv.${level} 普渡回血值应等于基础回血值`);
  assert.strictEqual(metricDisplay(pudu, level, 'healPerMp'), metricDisplay(healSlot.base, level, 'healPerMp'), `Lv.${level} 普渡血蓝比应等于基础血蓝比`);
}

assert.strictEqual(growthBuffVal(rain, LOW_LEVEL), 7 * RAIN_TICK_COUNT, '霖雨 Lv.1 应按5次回血汇总');
assert.strictEqual(growthBuffVal(rain, HIGH_LEVEL), 29102 * RAIN_TICK_COUNT, '霖雨 Lv.45 应按5次回血汇总');
assert.strictEqual(metricDisplay(shield, LOW_LEVEL, 'shieldPerMp'), 3.07, '冰盾 Lv.1 缺少蓝盾比');
assert.strictEqual(metricDisplay(rain, LOW_LEVEL, 'healPerMp'), 2.33, '霖雨 Lv.1 血蓝比应按总回血计算');
