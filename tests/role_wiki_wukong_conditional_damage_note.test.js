const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const outputFile = path.join(repoRoot, 'output', 'role_wiki_wukong.json');
const extractWukongRoleWiki = require(path.join(repoRoot, 'scripts', 'extract', 'role_wiki_wukong.js'));

const RISING_DRAGON_BASE_SKILL_ID = 1001160;
const RISING_DRAGON_BLOOD_SKILL_ID = 1001161;
const FIRE_SLASH_BLOOD_SKILL_ID = 1001181;
const BLOOD_RAGE_NOTE = '攻略：若当前生命值不低于 25%，可燃烧自身血量来使升龙斩获得 20% 的伤害增幅；基础面板属性仍按照常规升龙斩的 4 段总系数 2.8 进行展示。';
const FIRE_SLASH_BLOOD_NOTE = '攻略：每下降5%血量，火魔斩伤害提高1.5%，最高22.5%；若目标带有烈焰风暴灼烧，嗜血狂暴吸血效果提高50%。';
const FORBIDDEN_CONDITION_NOTE_PHRASES = [
  '条件型增伤',
  '不参与实际计算',
  '固定总系数',
  '单独展示说明',
  '卡片按基础升龙斩数值',
];

function readPayload() {
  return JSON.parse(fs.readFileSync(outputFile, 'utf8')).data;
}

function findSkill(payload, skillId) {
  for (const slot of payload.slots) {
    if (slot.base.skillId === skillId) return slot.base;
    const awaken = slot.awakens.find((entry) => entry.skillId === skillId);
    if (awaken) return awaken;
  }
  assert.fail(`缺少孙悟空技能 ${skillId}`);
}

function assertCleanConditionNote(card) {
  for (const phrase of FORBIDDEN_CONDITION_NOTE_PHRASES) {
    assert.ok(!card.header.note.includes(phrase), `${card.name} 不应展示额外解释文案: ${phrase}`);
  }
}

extractWukongRoleWiki();

const payload = readPayload();
const risingDragonBase = findSkill(payload, RISING_DRAGON_BASE_SKILL_ID);
const risingDragonBlood = findSkill(payload, RISING_DRAGON_BLOOD_SKILL_ID);
const fireSlashBlood = findSkill(payload, FIRE_SLASH_BLOOD_SKILL_ID);

assert.strictEqual(risingDragonBlood.header.totalPer, risingDragonBase.header.totalPer, '升龙斩·血怒卡片应展示基础总系数');
assert.strictEqual(risingDragonBlood.header.totalPer, 2.8, '升龙斩·血怒不应写入触发后的20%增伤');
assert.strictEqual(risingDragonBlood.identicalToBase, true, '升龙斩·血怒数值应与基础升龙斩合并');
assert.strictEqual(risingDragonBlood.header.note, BLOOD_RAGE_NOTE, '升龙斩·血怒说明只保留攻略原句');
assert.strictEqual(fireSlashBlood.header.note, FIRE_SLASH_BLOOD_NOTE, '火魔斩·血爆说明只保留攻略原句');
assertCleanConditionNote(risingDragonBlood);
assertCleanConditionNote(fireSlashBlood);
