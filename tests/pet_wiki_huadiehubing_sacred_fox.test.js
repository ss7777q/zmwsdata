const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const outputFile = path.join(repoRoot, 'output', 'pet_wiki_huadiehubing.json');
const indexFile = path.join(repoRoot, 'output', 'pet_wiki_index.json');
const battleDir = path.join(repoRoot, 'file', 'battle-config');
const extractPetWiki = require(path.join(repoRoot, 'scripts', 'extract', 'pet_wiki_huadiehubing.js'));
const extractPetBaseline = require(path.join(repoRoot, 'scripts', 'extract', 'pet_skill_baseline.js'));
const utils = require(path.join(repoRoot, 'scripts', 'lib', 'utils.js'));

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

const ROCK_BULLET = {
  CREATE: 104119,
  HELD: 104120,
  THROWN: 104124,
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

function metricDisplay(card, level, key) {
  const row = card.levels.find((entry) => entry.level === level);
  assert.ok(row, `${card.name} 缺少 Lv.${level}`);
  const entry = row.metrics.find((item) => item.key === key);
  assert.ok(entry, `${card.name} Lv.${level} 缺少指标 ${key}`);
  return entry.display;
}

extractPetWiki();
extractPetBaseline();

const behaviors = JSON.parse(fs.readFileSync(utils.findTableFile('behavior'), 'utf8'));
const noRockBehavior = behaviors.find((entry) => entry.id === 428001);
assert.ok(noRockBehavior, '行为表缺少凝冰掷岳的场上巨岩检查');
assert.strictEqual(noRockBehavior.name, 'IsNoHaveBullet');
assert.deepStrictEqual(noRockBehavior.value.bIds, [ROCK_BULLET.CREATE, ROCK_BULLET.HELD]);

const bullets = JSON.parse(fs.readFileSync(path.join(battleDir, 'bullets.json'), 'utf8'));
const heldRock = bullets.find((entry) => entry?.id === ROCK_BULLET.HELD);
assert.ok(heldRock, '战斗配置缺少凝冰掷岳持有态巨岩');
assert.ok(heldRock.maxTime >= 30, '持有态巨岩应能持续到30秒超时投出');

const sacredFoxEntity = JSON.parse(fs.readFileSync(path.join(battleDir, 'entityCtg', '2042004-monster_cfg_shenghuabinghu.json'), 'utf8'));
const createdRockIds = sacredFoxEntity.skill4_1.com.filter((entry) => entry.type === 2).map((entry) => entry.bId);
assert.ok(createdRockIds.includes(ROCK_BULLET.CREATE));
assert.ok(createdRockIds.includes(ROCK_BULLET.HELD));
for (const action of ['vskill4_1', 'vskill4_2']) {
  const release = sacredFoxEntity[action].com.find((entry) => entry.type === 2 && entry.bId === ROCK_BULLET.THROWN);
  assert.ok(release, `${action} 应生成投出态巨岩`);
  assert.strictEqual(release.replaceBId, ROCK_BULLET.HELD, `${action} 应替换并移除持有态巨岩`);
}

const mainIndex = fs.readFileSync(path.join(repoRoot, 'data', 'runtime', 'main-index.js'), 'utf8');
assert.match(mainIndex, /IsNoHaveBullet=function\(e\)\{return!this\.IsHaveBullet\(e\)\}/, '主程序应将 IsNoHaveBullet 实现为场上子弹不存在检查');
assert.ok(mainIndex.includes('this.mBuffMgr.clearQualifiedBuffs()'), '主程序应在技能结束时清除技能限定 buff');

const buffs = JSON.parse(fs.readFileSync(utils.findTableFile('buff'), 'utf8'));
const summonShieldBuff = buffs.find((entry) => entry.id === 13010001);
const summonArmorBuff = buffs.find((entry) => entry.id === 23005801);
assert.deepStrictEqual(summonShieldBuff?.attachBuff, [23005801]);
assert.strictEqual(summonArmorBuff?.type, 23);
assert.strictEqual(summonArmorBuff?.qualified, 1, '冰狐战士霸体应在护盾技能结束时被清除');

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
assert.ok(!summon.header.fixedBuffs.some((entry) => entry.name === '冰狐战士属性继承'), '属性继承不应继续放在固定效果区');
assert.ok(mechanic(summon, '属性继承').includes('技能等级5倍'));
assert.ok(mechanic(summon, '属性继承').includes('最终结果向上取整'));
assert.ok(mechanic(summon, '属性继承').includes('成长数值'));
assert.ok(mechanic(summon, '寒冰盾与霸体').includes('登场护盾技能结束时清除'));
assert.ok(mechanic(summon, '寒冰盾与霸体').includes('护盾存在期间不具备霸体'));
assert.ok(fixedEffect(summon, '冰狐战士普攻').includes('共3段'));
assert.ok(fixedEffect(summon, '冰狐战士普攻').includes('每段系数0.5463'));
assert.ok(fixedEffect(summon, '冰狐战士普攻').includes('总系数1.6389'));
assert.ok(fixedEffect(summon, '冰狐战士普攻').includes('1.9秒'));
assert.ok(fixedEffect(summon, '冰狐战士寒冰盾').includes('自身最大生命80%'));
assert.ok(fixedEffect(summon, '冰狐战士寒冰盾').includes('自身最大生命180%'));
assert.ok(fixedEffect(summon, '冰狐战士寒冰盾').includes('不会自行恢复'));
assert.ok(fixedEffect(summon, '冰狐战士寒冰盾').includes('寒冰盾不提供霸体'));
assert.ok(!summon.header.note.includes('护盾存在期间处于霸体状态'));
assert.strictEqual(summon.levels[0].metrics.find((entry) => entry.key === 'summonBreak')?.label, '战士穿透');
assert.strictEqual(summon.levels[0].metrics.find((entry) => entry.key === 'summonProtect')?.label, '战士减伤');
assert.strictEqual(metricDisplay(summon, 1, 'summonHp'), '⌈33.33%本体+353.351⌉');
assert.strictEqual(metricDisplay(summon, 1, 'summonAtk'), '⌈33.33%本体+53⌉');
assert.strictEqual(metricDisplay(summon, 1, 'summonHealHp'), '⌈33.33%本体+19.3343⌉');
assert.strictEqual(metricDisplay(summon, 1, 'summonBreak'), '⌈33.33%本体+0⌉');
assert.strictEqual(metricDisplay(summon, 1, 'summonProtect'), '⌈33.33%本体+0⌉');
assert.strictEqual(metricDisplay(summon, 60, 'summonHp'), '⌈33.33%本体+840300.0129⌉');
assert.strictEqual(metricDisplay(summon, 60, 'summonAtk'), '⌈33.33%本体+126039⌉');
assert.strictEqual(metricDisplay(summon, 60, 'summonHealHp'), '⌈33.33%本体+39765.9882⌉');
assert.strictEqual(metricDisplay(summon, 60, 'summonBreak'), '⌈33.33%本体+10949⌉');
assert.strictEqual(metricDisplay(summon, 60, 'summonProtect'), '⌈33.33%本体+10949⌉');

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
assert.ok(mechanic(rock, '投出条件').includes('30秒后按当时尺寸'));
assert.ok(mechanic(rock, '投出条件').includes('不会继续等待尺寸上限'));
assert.ok(mechanic(rock, '再释放限制').includes('场上还有正在生成或持有的巨岩'));
assert.ok(mechanic(rock, '再释放限制').includes('冷却和本轮巨岩持有时间中的较长者'));
assert.ok(mechanic(rock, '再释放限制').includes('间隔约为30秒，而不是15秒'));
assert.ok(mechanic(rock, '尺寸倍率').includes('充能只放大技能等级固伤'));
assert.ok(mechanic(rock, '尺寸倍率').includes('2.1倍攻击系数始终不变'));
assert.ok(mechanic(rock, '尺寸倍率').includes('4尺寸=100%固伤'));
assert.ok(mechanic(rock, '尺寸倍率').includes('7尺寸=175%固伤'));
assert.ok(mechanic(rock, '破冰').includes('最终主伤害40%'));
assert.ok(mechanic(rock, '破冰').includes('攻击系数未计霜冻强化时为2.94'));
assert.ok(mechanic(rock, '破冰').includes('计入后为3.675'));
assert.ok(mechanic(rock, '15秒静态修正').includes('1尺寸=100%'));
assert.ok(mechanic(rock, '15秒静态修正').includes('7尺寸=175%'));
assert.ok(mechanic(rock, '15秒静态修正').includes('并非无条件实战值'));
assert.ok(mechanic(rock, '15秒静态修正').includes('尺寸4分别为100%、140%、175%'));
assert.ok(mechanic(rock, '15秒静态修正').includes('尺寸7分别为175%、245%、306.25%'));
assert.ok(mechanic(rock, '15秒静态修正').includes('总修正200%'));
assert.ok(mechanic(rock, '15秒静态修正').includes('需要尺寸8'));
assert.ok(mechanic(rock, '30秒超时修正').includes('1尺寸=50%'));
assert.ok(mechanic(rock, '30秒超时修正').includes('4尺寸=50%'));
assert.ok(mechanic(rock, '30秒超时修正').includes('5尺寸=62.5%'));
assert.ok(mechanic(rock, '30秒超时修正').includes('6尺寸=75%'));
assert.ok(mechanic(rock, '30秒超时修正').includes('7尺寸=87.5%'));
assert.ok(mechanic(rock, '30秒超时修正').includes('1尺寸=15秒'));
assert.ok(mechanic(rock, '30秒超时修正').includes('4尺寸=15秒'));
assert.ok(mechanic(rock, '30秒超时修正').includes('5尺寸=18.75秒'));
assert.ok(mechanic(rock, '30秒超时修正').includes('6尺寸=22.5秒'));
assert.ok(mechanic(rock, '30秒超时修正').includes('7尺寸=26.25秒'));
assert.ok(mechanic(rock, '战斗统计').includes('20420040402'));
assert.ok(mechanic(rock, '战斗统计').includes('一次投掷通常记为2次'));
assert.ok(mechanic(rock, '战斗统计').includes('20420040403'));
assert.ok(mechanic(rock, '战斗统计').includes('前者通常要除以2'));
assert.ok(mechanic(rock, '实战口径').includes('不等于战斗统计占比'));
assert.ok(mechanic(rock, '实战口径').includes('完整释放次数'));
assert.ok(rock.header.note.includes('30秒超时投出'));
assert.ok(rock.header.note.includes('87.5%'));
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
