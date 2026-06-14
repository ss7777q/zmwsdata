const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const outputFile = path.join(repoRoot, 'output', 'role_wiki_bajie.json');
const extractBajieRoleWiki = require(path.join(repoRoot, 'scripts', 'extract', 'role_wiki_bajie.js'));

const BAJIE_SHIELD_SKILL_ID = 3001060;
const BAJIE_COUNTER_SHIELD_SKILL_ID = 3001062;
const BAJIE_ROCK_SHIELD_SKILL_ID = 3001067;

const EXPECTED_SHIELD_ENERGY = new Map([
  [1, 318],
  [2, 618],
  [3, 1248],
  [10, 18678],
  [20, 31350],
  [21, 35238],
  [30, 100260],
  [39, 235290],
  [40, 260880],
  [60, 947454],
]);

const EXPECTED_ROCK_SHIELD_ENERGY = new Map([
  [1, 348],
  [2, 678],
  [3, 1374],
  [10, 20544],
  [20, 34488],
  [21, 38760],
  [30, 110286],
  [39, 258822],
  [40, 286968],
  [60, 1042200],
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
  assert.fail(`缺少八戒技能 ${skillId}`);
}

function metricValueAt(card, level, key) {
  const row = card.levels.find((entry) => entry.level === level);
  assert.ok(row, `${card.name} 缺少 Lv.${level}`);
  const metric = row.metrics.find((entry) => entry.key === key);
  assert.ok(metric, `${card.name} Lv.${level} 缺少 ${key}`);
  return metric.value;
}

extractBajieRoleWiki();

const payload = readPayload();
const shield = findSkill(payload, BAJIE_SHIELD_SKILL_ID);
const counterShield = findSkill(payload, BAJIE_COUNTER_SHIELD_SKILL_ID);
const rockShield = findSkill(payload, BAJIE_ROCK_SHIELD_SKILL_ID);

assert.strictEqual(shield.header.addDefendVal, 100, '天罡盾保护分字段保留为原始配置');
assert.notStrictEqual(metricValueAt(shield, 1, 'shieldEnergy'), shield.header.addDefendVal, '天罡盾盾量不应误用 addDefendVal');
assert.ok(!counterShield.levels[0].metrics.some((metric) => metric.key === 'shieldEnergy'), '天罡盾·反戈不应重复展示基础盾量');
assert.strictEqual(rockShield.identicalToBase, false, '天罡盾·磐石能量上限不同，应独立展示');

for (const [level, expected] of EXPECTED_SHIELD_ENERGY) {
  assert.strictEqual(metricValueAt(shield, level, 'shieldEnergy'), expected, `天罡盾 Lv.${level} 能量上限异常`);
}

for (const [level, expected] of EXPECTED_ROCK_SHIELD_ENERGY) {
  assert.strictEqual(metricValueAt(rockShield, level, 'shieldEnergy'), expected, `天罡盾·磐石 Lv.${level} 能量上限异常`);
}
