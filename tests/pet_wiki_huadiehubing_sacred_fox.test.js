const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const outputFile = path.join(repoRoot, 'output', 'pet_wiki_huadiehubing.json');
const indexFile = path.join(repoRoot, 'output', 'pet_wiki_index.json');
const extractPetWiki = require(path.join(repoRoot, 'scripts', 'extract', 'pet_wiki_huadiehubing.js'));
const extractPetBaseline = require(path.join(repoRoot, 'scripts', 'extract', 'pet_skill_baseline.js'));

const PET_ID = 190000034;
const SKILL = {
  ATTACK: 20420040001,
  DISC: 20420040101,
  SUMMON: 20420040201,
  STORM: 20420040301,
  ROCK: 20420040401,
  SP: 20420040501,
  FROST: 20420040601,
  FLY: 20420040701,
};

function readData(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8')).data;
}

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}：期望 ${expected}，实际 ${actual}`);
}

function findCard(variant, skillId) {
  const card = variant.slots.find((slot) => slot.base.skillId === skillId)?.base;
  assert.ok(card, `圣冰天狐缺少技能 ${skillId}`);
  return card;
}

function fixedEffect(card, name) {
  const effect = card.header.fixedBuffs.find((entry) => entry.name === name);
  assert.ok(effect, `${card.name} 缺少固定效果：${name}`);
  return effect.displayText;
}

function mechanic(card, label) {
  const entry = card.header.mechanics.find((item) => item.label === label);
  assert.ok(entry, `${card.name} 缺少机制说明：${label}`);
  return entry.value;
}

function metric(card, level, key) {
  const row = card.levels.find((entry) => entry.level === level);
  assert.ok(row, `${card.name} 缺少 Lv.${level}`);
  const entry = row.metrics.find((item) => item.key === key);
  assert.ok(entry, `${card.name} Lv.${level} 缺少指标 ${key}`);
  return entry.value;
}

extractPetWiki();
extractPetBaseline();

const payload = readData(outputFile);
const variant = payload.variants.find((entry) => entry.pet.id === PET_ID);
assert.ok(variant, '应导出圣冰天狐');
assert.strictEqual(variant.pet.name, '圣冰天狐');
assert.strictEqual(variant.pet.idGroup, 190000031);
assert.strictEqual(variant.pet.rank, 3);
assert.strictEqual(variant.slots.length, 8, '圣冰天狐应有普攻、4个主动、无双和2个被动，共8张技能卡');

const attack = findCard(variant, SKILL.ATTACK);
assert.strictEqual(attack.header.segCount, 2);
assert.strictEqual(attack.header.totalPer, 4.5);
close(attack.header.releaseSeconds, 1.5, '冰晶球释放用时异常');

const disc = findCard(variant, SKILL.DISC);
assert.strictEqual(disc.header.segCount, 7);
assert.strictEqual(disc.header.totalPer, 7.203);
close(disc.header.releaseSeconds, 73 / 30, '冰雪玉盘释放用时异常');
assert.strictEqual(disc.header.cd, 10);

const summon = findCard(variant, SKILL.SUMMON);
assert.strictEqual(summon.header.segCount, 0);
assert.strictEqual(summon.header.totalPer, null);
close(summon.header.releaseSeconds, 25 / 30, '冰心化灵释放用时异常');
assert.strictEqual(summon.header.cd, 90);
assert.ok(fixedEffect(summon, '冰狐战士召唤').includes('最多同时存在1只'));
assert.ok(fixedEffect(summon, '冰狐战士属性继承').includes('最大生命的33.33%'));
assert.ok(fixedEffect(summon, '冰狐战士属性继承').includes('召唤生命基准的66.67%'));
assert.ok(fixedEffect(summon, '冰狐战士属性继承').includes('技能等级的5倍'));
assert.ok(fixedEffect(summon, '冰狐战士普攻').includes('共3段'));
assert.ok(fixedEffect(summon, '冰狐战士普攻').includes('每段系数0.5463'));
assert.ok(fixedEffect(summon, '冰狐战士普攻').includes('总系数1.6389'));
assert.ok(fixedEffect(summon, '冰狐战士普攻').includes('1.9秒'));
assert.ok(fixedEffect(summon, '冰狐战士寒冰盾').includes('自身最大生命80%'));
assert.ok(fixedEffect(summon, '冰狐战士寒冰盾').includes('自身最大生命180%'));
assert.ok(fixedEffect(summon, '冰狐战士寒冰盾').includes('不会自行恢复'));
assert.ok(fixedEffect(summon, '冰狐战士寒冰盾').includes('霸体'));

const storm = findCard(variant, SKILL.STORM);
assert.strictEqual(storm.header.segCount, 15);
assert.strictEqual(storm.header.totalPer, 13.5);
close(storm.header.releaseSeconds, 136 / 30, '冰雪风暴完整动作链用时异常');
assert.strictEqual(storm.header.cd, 20);

const rock = findCard(variant, SKILL.ROCK);
assert.strictEqual(rock.header.segCount, 1);
assert.strictEqual(rock.header.totalPer, 2.1);
close(rock.header.releaseSeconds, 0.7, '凝冰掷岳释放用时异常');
assert.strictEqual(rock.header.cd, 15);
assert.ok(mechanic(rock, '充能规则').includes('巨岩尺寸上限为7'));
assert.ok(mechanic(rock, '投出条件').includes('30秒后自动投向最近敌人'));
assert.ok(mechanic(rock, '满充伤害').includes('总系数3.675'));
assert.ok(mechanic(rock, '破冰').includes('最终主伤害40%'));
assert.ok(mechanic(rock, '破冰').includes('合计总系数5.145'));
assert.ok(mechanic(rock, '破冰').includes('实际总系数6.43125'));
assert.ok(mechanic(rock, '固伤修正').includes('满充主伤害修正比为175%'));
assert.ok(mechanic(rock, '固伤修正').includes('未计霜冻强化时为245%'));
assert.ok(mechanic(rock, '固伤修正').includes('计入霜冻强化后为306.25%'));
close(metric(rock, 1, 'fullChargeVal'), 663 * 1.75, '凝冰掷岳 Lv.1 满充固伤异常');
close(metric(rock, 1, 'fullChargeBreakVal'), 663 * 2.45, '凝冰掷岳 Lv.1 满充破冰固伤异常');
close(metric(rock, 1, 'fullChargeFrozenBreakVal'), 663 * 3.0625, '凝冰掷岳 Lv.1 满充冰冻破冰固伤异常');
close(metric(rock, 60, 'fullChargeVal'), 2194423 * 1.75, '凝冰掷岳 Lv.60 满充固伤异常');
close(metric(rock, 60, 'fullChargeBreakVal'), 2194423 * 2.45, '凝冰掷岳 Lv.60 满充破冰固伤异常');
close(metric(rock, 60, 'fullChargeFrozenBreakVal'), 2194423 * 3.0625, '凝冰掷岳 Lv.60 满充冰冻破冰固伤异常');

const sp = findCard(variant, SKILL.SP);
assert.strictEqual(sp.header.segCount, 9);
assert.strictEqual(sp.header.totalPer, 9);
close(sp.header.releaseSeconds, 3, '极冰九刺释放用时异常');
assert.strictEqual(sp.header.cd, 30);

const frost = findCard(variant, SKILL.FROST);
assert.ok(fixedEffect(frost, '霜冻强化').includes('3秒延长至5秒'));
assert.ok(fixedEffect(frost, '冰冻目标增伤').includes('提升25%'));

const fly = findCard(variant, SKILL.FLY);
assert.ok(fixedEffect(fly, '踏雪凌虚').includes('仅PVE可开关'));
assert.ok(fixedEffect(fly, '踏雪凌虚').includes('冰狐战士切换为飞行姿态'));
assert.ok(fly.header.fixedBuffs.some((entry) => entry.baseBuffId === 14019001 && entry.displayText.includes('30%')));

for (const slot of variant.slots) {
  assert.deepStrictEqual(slot.base.warnings, [], `${slot.base.name} 不应存在解析警告`);
  const playerCopy = [
    slot.base.header.note,
    ...slot.base.header.mechanics.map((entry) => entry.value),
    ...slot.base.header.fixedBuffs.map((entry) => entry.displayText),
  ].filter(Boolean).join('\n');
  assert.ok(!playerCopy.includes('帧'), `${slot.base.name} 玩家文案不应显示帧数`);
}

const index = readData(indexFile);
const group = index.groups.find((entry) => entry.fileName === 'pet_wiki_huadiehubing');
assert.ok(group, '宠物技能索引缺少冰冰进化组');
const indexEntry = group.entries.find((entry) => entry.petId === PET_ID);
assert.ok(indexEntry, '宠物技能索引缺少圣冰天狐');
assert.strictEqual(indexEntry.type, '圣兽');
