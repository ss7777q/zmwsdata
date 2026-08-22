const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const outputFile = path.join(repoRoot, 'output', 'role_wiki_xiaoyan.json');
const extractXiaoyanRoleWiki = require(path.join(repoRoot, 'scripts', 'extract', 'role_wiki_xiaoyan.js'));

const WATER_SHIELD_COMMAND_SKILL_ID = 7001250;
const WATER_SHIELD_RIDE_SKILL_ID = 7001451;
const WIND_SPIRIT_SKILL_ID = 7001040;
const WIND_SPIRIT_AWAKEN_SKILL_ID = 7001046;
const WATER_SPIRIT_SKILL_ID = 7001050;
const LEAF_SPIRIT_SKILL_ID = 7001030;
const LEAF_SPIRIT_FIRM_SKILL_ID = 7001031;
const LEAF_SPIRIT_QUAKE_SKILL_ID = 7001036;
const GU_LING_SKILL_ID = 7001070;
const GU_LING_COMMAND_SKILL_ID = 7001071;
const GU_LING_RIDE_SKILL_ID = 7001076;
const STONE_SPIRIT_SKILL_ID = 7001060;
const STONE_SPIRIT_GANGSHI_SKILL_ID = 7001061;
const STONE_SPIRIT_YUNYAN_SKILL_ID = 7001066;
const CONSUME_MP_WARNING = 'XIAOYAN_CONSUME_MP_SOURCE_ZERO_OR_NULL';
const CHECK_LEVELS = [1, 15, 30, 45];
const EXPECTED_MANA_BY_LEVEL = new Map([
  [1, 51],
  [15, 1760],
  [30, 13001],
  [45, 65609],
]);
const EXPECTED_WIND_MANA_BY_LEVEL = new Map([
  [1, 46],
  [15, 1530],
  [30, 11255],
  [45, 57400],
]);
const EXPECTED_WIND_AWAKEN_MANA_BY_LEVEL = new Map([
  [1, 56],
  [15, 1874],
  [30, 13787],
  [45, 70315],
]);
const EXPECTED_WATER_SPIRIT_MANA_BY_LEVEL = new Map([
  [1, 17],
  [15, 1760],
  [30, 13001],
  [45, 65609],
]);
const EXPECTED_SHIELD_BY_LEVEL = new Map([
  [1, 41],
  [15, 5281],
  [30, 30768],
  [45, 118665],
]);

function readPayload() {
  return JSON.parse(fs.readFileSync(outputFile, 'utf8')).data;
}

function findSkill(payload, skillId) {
  for (const slot of payload.slots) {
    if (slot.base.skillId === skillId) return slot.base;
    const awaken = slot.awakens.find((entry) => entry.skillId === skillId);
    if (awaken) return awaken;
  }
  assert.fail(`缺少萧嫣技能 ${skillId}`);
}

function findLevel(card, level) {
  const row = card.levels.find((entry) => entry.level === level);
  assert.ok(row, `${card.name} 缺少 Lv.${level}`);
  return row;
}

function shieldValueAt(card, level) {
  const row = findLevel(card, level);
  assert.strictEqual(row.growthBuffs.length, 1, `${card.name} Lv.${level} 成长效果数量异常`);
  const value = row.growthBuffs[0].value;
  assert.ok(value, `${card.name} Lv.${level} 缺少护盾值`);
  return value.val;
}

function mechanicValue(card, label) {
  const entry = card.header.mechanics?.find((item) => item.label === label);
  assert.ok(entry, `${card.name} 缺少机制说明：${label}`);
  return entry.value;
}

function assertManaByLevel(card, expectedByLevel) {
  for (const [level, expectedMana] of expectedByLevel) {
    const row = findLevel(card, level);
    assert.strictEqual(row.consumeMp, expectedMana, `${card.name} Lv.${level} 耗蓝异常`);
  }
  assert.ok(!card.warnings.some((warning) => warning.code === CONSUME_MP_WARNING), `${card.name} 不应带源表蓝耗异常提示`);
}

function assertNoConsumeMpWarning(card) {
  assert.ok(!card.warnings.some((warning) => warning.code === CONSUME_MP_WARNING), `${card.name} 不应带源表蓝耗异常提示`);
}

extractXiaoyanRoleWiki();

const payload = readPayload();
const commandShield = findSkill(payload, WATER_SHIELD_COMMAND_SKILL_ID);
const rideShield = findSkill(payload, WATER_SHIELD_RIDE_SKILL_ID);
const windSpirit = findSkill(payload, WIND_SPIRIT_SKILL_ID);
const windSpiritAwaken = findSkill(payload, WIND_SPIRIT_AWAKEN_SKILL_ID);
const waterSpirit = findSkill(payload, WATER_SPIRIT_SKILL_ID);
const leafSpirit = findSkill(payload, LEAF_SPIRIT_SKILL_ID);
const leafSpiritFirm = findSkill(payload, LEAF_SPIRIT_FIRM_SKILL_ID);
const leafSpiritQuake = findSkill(payload, LEAF_SPIRIT_QUAKE_SKILL_ID);
const guLing = findSkill(payload, GU_LING_SKILL_ID);
const guLingCommand = findSkill(payload, GU_LING_COMMAND_SKILL_ID);
const guLingRide = findSkill(payload, GU_LING_RIDE_SKILL_ID);
const stoneSpirit = findSkill(payload, STONE_SPIRIT_SKILL_ID);
const stoneSpiritGangshi = findSkill(payload, STONE_SPIRIT_GANGSHI_SKILL_ID);
const stoneSpiritYunyan = findSkill(payload, STONE_SPIRIT_YUNYAN_SKILL_ID);

assertManaByLevel(windSpirit, EXPECTED_WIND_MANA_BY_LEVEL);
assertManaByLevel(windSpiritAwaken, EXPECTED_WIND_AWAKEN_MANA_BY_LEVEL);
assertManaByLevel(waterSpirit, EXPECTED_WATER_SPIRIT_MANA_BY_LEVEL);
for (const card of [leafSpirit, leafSpiritFirm, leafSpiritQuake, guLing, guLingCommand, guLingRide]) {
  assertNoConsumeMpWarning(card);
}

assert.strictEqual(commandShield.header.segCount, 0, '水之护盾指令版不应展示施法占位段');
assert.strictEqual(commandShield.header.totalPer, 0, '水之护盾指令版不应展示0.01占位总系数');
assert.deepStrictEqual(commandShield.header.segments, [], '水之护盾指令版表头不应保留占位伤害段');
assert.strictEqual(commandShield.identicalToBase, undefined, '基础卡不应设置 identicalToBase');
assert.strictEqual(rideShield.identicalToBase, false, '水之护盾乘御版释放用时和模式不同，应独立展示');
assert.strictEqual(leafSpiritFirm.identicalToBase, false, '叶佑之灵·坚毅护盾机制不同，应独立展示');
assert.strictEqual(leafSpiritQuake.identicalToBase, false, '叶佑之灵·震颤护盾机制不同，应独立展示');
assert.strictEqual(guLing.header.totalPer, 0.01, '仙山古灵强攻应按攻略0.01*atk展示');
assert.strictEqual(guLing.header.segments[0].per, 0.01, '仙山古灵表头段系数应按攻略0.01');
assert.strictEqual(guLing.header.segments[0].maxHit, 1, '仙山古灵强攻应为1段');
assert.strictEqual(guLingCommand.identicalToBase, false, '仙山古灵·令御增伤机制不同，应独立展示');
assert.strictEqual(guLingRide.identicalToBase, false, '仙山古灵·乘御技能组和增伤机制不同，应独立展示');
assert.deepStrictEqual(stoneSpirit.header.segments.map((segment) => segment.maxHit), [9], '山岩之灵应按滚动9段展示');
assert.strictEqual(stoneSpirit.header.segCount, 9, '山岩之灵段数应为9段');
assert.strictEqual(stoneSpirit.header.totalPer, 4.5, '山岩之灵总系数应为滚动4.5');
assert.strictEqual(findLevel(stoneSpirit, 12).totalVal, 8514, '山岩之灵 Lv.12 总固伤应按滚动9段计算');
assert.strictEqual(findLevel(stoneSpiritGangshi, 12).totalVal, 8514, '山岩之灵·刚石 Lv.12 总固伤应按滚动9段计算');
assert.strictEqual(findLevel(stoneSpiritYunyan, 12).totalVal, 8514, '山岩之灵·云岩 Lv.12 总固伤应按滚动9段计算');
assert.ok(mechanicValue(stoneSpirit, '耗蓝机制').includes('改为召回滚动'), '山岩之灵说明应解释场上已有石灵时的召回蓝耗');
assert.ok(mechanicValue(stoneSpirit, '总固伤口径').includes('本体伤害只统计召唤或召回时必定触发的滚动'), '山岩之灵说明应解释石灵伤害口径');

for (const level of CHECK_LEVELS) {
  const commandRow = findLevel(commandShield, level);
  const rideRow = findLevel(rideShield, level);
  assert.strictEqual(commandRow.consumeMp, EXPECTED_MANA_BY_LEVEL.get(level), `水之护盾指令版 Lv.${level} 耗蓝异常`);
  assert.strictEqual(rideRow.consumeMp, EXPECTED_MANA_BY_LEVEL.get(level), `水之护盾乘御版 Lv.${level} 耗蓝异常`);
  assert.strictEqual(commandRow.totalPer, 0, `水之护盾指令版 Lv.${level} 不应保留占位系数`);
  assert.strictEqual(commandRow.totalVal, 0, `水之护盾指令版 Lv.${level} 不应保留占位固伤`);
  assert.strictEqual(shieldValueAt(commandShield, level), EXPECTED_SHIELD_BY_LEVEL.get(level), `水之护盾指令版 Lv.${level} 护盾值异常`);
  assert.strictEqual(shieldValueAt(rideShield, level), EXPECTED_SHIELD_BY_LEVEL.get(level), `水之护盾乘御版 Lv.${level} 护盾值异常`);
  assert.ok(!commandRow.metrics.some((metric) => metric.key === 'atkConv'), `水之护盾指令版 Lv.${level} 不应展示占位攻转`);
}
