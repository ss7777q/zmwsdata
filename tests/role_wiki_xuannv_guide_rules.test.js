const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const outputFile = path.join(repoRoot, 'output', 'role_wiki_xuannv.json');
const extractXuannvRoleWiki = require(path.join(repoRoot, 'scripts', 'extract', 'role_wiki_xuannv.js'));

const EXPECTED_GUIDE_RULES = new Map([
  [9001039, { segCount: 7, totalPer: 1.25, releaseSeconds: 0.533, lv1Mp: 8.5, lv1Val: 203 }],
  [9001040, { segCount: 6, totalPer: 2.584, releaseSeconds: 1.067, lv1Mp: 21, lv1Val: 180 }],
  [9001041, { segCount: 11, totalPer: 2.841, releaseSeconds: 1.067, lv1Mp: 20, lv1Val: 0 }],
  [9001050, { segCount: 10, totalPer: 2.698, releaseSeconds: 1.267, lv1Mp: 25, lv1Val: 180 }],
  [9001051, { segCount: 20, totalPer: 2.962, releaseSeconds: 1.267, lv1Mp: 25, lv1Val: 200 }],
  [9001221, { segCount: 10, totalPer: 2.38, releaseSeconds: 0.833, lv1Mp: 17, lv1Val: 160 }],
  [9001231, { segCount: 8, totalPer: 4.375, releaseSeconds: 1.667, lv1Mp: 34, lv1Val: 305 }],
  [9001241, { segCount: 11, totalPer: 9.07, releaseSeconds: 2.4, lv1Mp: 48, lv1Val: 485 }],
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
  assert.fail(`缺少玄女技能 ${skillId}`);
}

function assertClose(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 0.001, `${label}: expected ${expected}, got ${actual}`);
}

extractXuannvRoleWiki();

const payload = readPayload();
assert.strictEqual(payload.role.id, 9, '玄女 roleId 应为 9');
assert.strictEqual(payload.role.makeupMonsterId, 190, '玄女无双形态应为 monster 190');
assert.ok(payload.role.mechanics?.qimenExpand, '应导出奇门阵内替换关系');

const qimen = findSkill(payload, 9001060);
assert.strictEqual(qimen.header.segCount, 0, '奇门遁阵不应展示 0.01 占位伤害段');
assert.strictEqual(qimen.header.totalPer, 0, '奇门遁阵不应展示 0.01 占位系数');
assert.strictEqual(qimen.levels[0].totalVal, 0, '奇门遁阵不应展示 1 点占位固伤');
assertClose(qimen.header.releaseSeconds, 1.533, '奇门遁阵释放用时应按攻略');

const slotLabels = payload.slots.map((slot) => slot.slotLabel);
const firstQimenIndex = slotLabels.findIndex((label) => label.includes('奇门衍生'));
const firstTransIndex = slotLabels.findIndex((label) => label.startsWith('无双'));
assert.ok(firstQimenIndex >= 0, '玄女应导出奇门衍生卡');
assert.ok(firstTransIndex > firstQimenIndex, '无双相关卡片应排在奇门衍生卡之后');
assert.deepStrictEqual(
  slotLabels.slice(firstTransIndex),
  ['无双技能1', '无双技能2', '无双技能2 · 二段', '无双技能3', '无双技能3 · 形态2', '无双技能4'],
  '无双相关卡片顺序应保持主技能后跟对应二段/形态卡'
);

for (const skillId of [9001070, 9001071, 9001076]) {
  const card = findSkill(payload, skillId);
  assert.strictEqual(card.header.releaseSeconds, null, `${card.name} 攻略未给释放用时，不应使用源码默认30帧`);
  assert.ok(!card.levels[0].metrics.some((metric) => metric.key === 'atkConv'), `${card.name} 缺释放用时不应展示攻转`);
}

for (const [skillId, expected] of EXPECTED_GUIDE_RULES) {
  const card = findSkill(payload, skillId);
  assert.strictEqual(card.header.segCount, expected.segCount, `${card.name} 段数应按攻略口径`);
  assertClose(card.header.totalPer, expected.totalPer, `${card.name} 总系数应按攻略口径`);
  assertClose(card.header.releaseSeconds, expected.releaseSeconds, `${card.name} 释放用时应按攻略口径`);
  const lv1 = card.levels.find((entry) => entry.level === 1);
  assert.ok(lv1, `${card.name} 缺少 Lv.1`);
  assertClose(lv1.consumeMp, expected.lv1Mp, `${card.name} Lv.1 耗蓝异常`);
  assert.strictEqual(lv1.totalVal, expected.lv1Val, `${card.name} Lv.1 总固伤异常`);
  assert.ok(card.header.note?.includes('攻略'), `${card.name} 应保留攻略说明`);
}

const windStrike = findSkill(payload, 9001039);
const windStrikeLv1 = windStrike.levels.find((entry) => entry.level === 1);
assert.strictEqual(windStrikeLv1.consumeMp, 8.5, '风袭 Lv.1 耗蓝应按奇门蓝转公式修正');
assert.ok(windStrike.levels[59].consumeMp > 30000, '风袭满级耗蓝应包含四技能阴阳玉折算成本');

for (const skillId of [9001052, 9001057]) {
  const card = findSkill(payload, skillId);
  const fixedText = JSON.stringify(card.header.fixedBuffs);
  for (const bad of ['136021201', '136021701', '295000801', '骑虎表现', '龙虎加速标记', '技能速度提升25%']) {
    assert.ok(!fixedText.includes(bad), `${card.name} 不应展示未实装固定效果 ${bad}`);
  }
}

const yunying = findSkill(payload, 9001037);
const yunyingText = JSON.stringify(yunying);
assert.ok(!yunyingText.includes('4066701'), '云影双遁不应把减速 buff id 当成成长数值展示');
assert.ok(yunying.header.fixedBuffs.some((buff) => buff.name === '双云映日·壹'
  && buff.displayText?.includes('10层减速')
  && buff.displayText?.includes('6.6%')
  && buff.displayText?.includes('每0.3s递减1层')
  && buff.displayText?.includes('双云映日·贰')), '云影双遁应把第一次伤害的减速链路展示为固定机制说明');
for (const [level, expectedCrit] of [[1, 506], [35, 15550], [46, 35936], [60, 80714]]) {
  const lv = yunying.levels.find((entry) => entry.level === level);
  const crit = lv?.growthBuffs.find((buff) => buff.name === '双云映日·贰');
  assert.strictEqual(crit?.value?.val, expectedCrit, `云影双遁 Lv.${level} 暴击值应来自 endBuff -> 暴击强化链路`);
  assert.ok(crit?.displayText?.includes('暴击值加成'), `云影双遁 Lv.${level} 应说明第二次伤害技能获得暴击值加成`);
}

const qicai = findSkill(payload, 9001041);
const qicaiLv1 = qicai.levels.find((entry) => entry.level === 1);
const qicaiLv35 = qicai.levels.find((entry) => entry.level === 35);
assert.strictEqual(qicaiLv1.totalVal, 0, '九彩神石攻略口径为无固伤，不应展示 damageAddVal=1 占位固伤');
assert.strictEqual(qicaiLv1.growthBuffs.find((buff) => buff.name === '九彩琉璃回复')?.value?.val, 12, '九彩神石 Lv.1 回复量应来自 beskill 12601202.healValues');
assert.strictEqual(qicaiLv35.growthBuffs.find((buff) => buff.name === '九彩琉璃回复')?.value?.val, 8552, '九彩神石 Lv.35 回复量应来自攻略表2.2/配置 healValues');
assert.ok(qicaiLv1.metrics.some((metric) => metric.key === 'healManaConv'), '九彩神石应展示蓝转血');
assert.ok(!qicaiLv1.metrics.some((metric) => metric.key === 'manaConv'), '九彩神石无固伤，不应展示伤害蓝转');

const tianyuan = findSkill(payload, 9001241);
assert.deepStrictEqual(tianyuan.header.segments.map((segment) => segment.maxHit), [10, 1], '天渊剑墟应为 10 段落剑 + 1 段下坠');
assert.strictEqual(tianyuan.levels[0].segmentVals[0].val, 0, '天渊剑墟落剑无固伤');
assert.strictEqual(tianyuan.levels[0].segmentVals[1].val, 485, '天渊剑墟下坠固伤应来自 skillLevel');

const longyin = findSkill(payload, 9001231);
for (const [level, expectedDefDown] of [[1, -1], [35, -1836], [60, -9377]]) {
  const lv = longyin.levels.find((entry) => entry.level === level);
  const buff = lv?.growthBuffs.find((entry) => entry.name === '龙吟·裂御');
  assert.strictEqual(buff?.bindLabel, '首次命中', `双刺龙吟 Lv.${level} 减防应来自 bullet.firstHitAddBuffs`);
  assert.strictEqual(buff?.value?.val, expectedDefDown, `双刺龙吟 Lv.${level} 应展示龙吟·裂御防御降低成长值`);
  assert.ok(buff?.displayText?.includes('降低防御'), `双刺龙吟 Lv.${level} 应说明降低防御效果`);
}

const huxiao = findSkill(payload, 9001233);
for (const [level, expectedAtkDown] of [[1, -3], [35, -4585], [60, -23418]]) {
  const lv = huxiao.levels.find((entry) => entry.level === level);
  const buff = lv?.growthBuffs.find((entry) => entry.name === '虎啸·战栗');
  assert.strictEqual(buff?.bindLabel, '首次命中', `玄锋虎啸 Lv.${level} 减攻应来自 bullet.firstHitAddBuffs`);
  assert.strictEqual(buff?.value?.val, expectedAtkDown, `玄锋虎啸 Lv.${level} 应展示虎啸·战栗攻击降低成长值`);
  assert.ok(buff?.displayText?.includes('降低攻击'), `玄锋虎啸 Lv.${level} 应说明降低攻击效果`);
}
