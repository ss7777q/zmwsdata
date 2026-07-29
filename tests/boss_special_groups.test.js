const assert = require('assert');
const path = require('path');

const extractBossStats = require(path.join(__dirname, '..', 'scripts', 'extract-boss-stats.js'));
const root = path.resolve(__dirname, '..');
const mapDir = path.join(root, 'file', 'map-cache', 'resources', 'map');

// ─── 葬灵洞（type 9）：petHole 逐行伪关卡，BOSS/守卫等级不同 ───
const hiddenCave = extractBossStats({ types: [9], syncMaps: false, mapDir });
const caveGroup = hiddenCave.find((group) => Number(group.type) === 9);
assert(caveGroup, '缺少葬灵洞分组');
assert.strictEqual(caveGroup.slug, 'hidden_cave');
assert.strictEqual(caveGroup.stageCount, 24, '葬灵洞应有 24 关');
assert(caveGroup.noteText, '葬灵洞应有说明文案');

const cave2 = caveGroup.stages.find((stage) => stage.stageId === '999050101-2');
assert(cave2, '找不到葬灵洞第 2 关');
assert.strictEqual(cave2.petHole.bossLevel, 21);
assert.strictEqual(cave2.petHole.guardLevel, 11);
const cave2Boss = cave2.bossData.find((boss) => boss.petHoleRole === 'boss');
const cave2Guard = cave2.bossData.find((boss) => boss.petHoleRole === 'guard');
assert.strictEqual(cave2Boss.level, 21, 'BOSS 应按 bossLevel 计算');
assert.strictEqual(cave2Guard.level, 11, '守卫应按 guardLevel 计算');
assert(cave2Boss.calculatedProps.hp > 0 && cave2Guard.calculatedProps.hp > 0);
for (const stage of caveGroup.stages) {
  assert(stage.bossData.every((boss) => !boss.error), `葬灵洞 ${stage.stageName} 存在计算错误`);
}

// ─── 灵宠天梯（type 8）：petChampionTower 守卫灵宠基础属性 ───
const petLadder = extractBossStats({ types: [8], syncMaps: false, mapDir });
const ladderGroup = petLadder.find((group) => Number(group.type) === 8);
assert(ladderGroup, '缺少灵宠天梯分组');
assert.strictEqual(ladderGroup.slug, 'pet_ladder');
assert(ladderGroup.stageCount >= 15, '灵宠天梯层数不足');
assert(ladderGroup.noteText.includes('基础'), '灵宠天梯说明应注明为基础属性');

const floor1 = ladderGroup.stages.find((stage) => stage.petLadder?.floor === 1);
assert(floor1, '找不到天梯第 1 层');
assert.strictEqual(floor1.bossData.length, 3, '第 1 层应有 3 只守卫灵宠');
// 吱吱鼠 190000001: base atk 82 + strQuality[0] 314 × quality 0.5 × atkModulus[0] 0.04 × lv 10 = 145
const mouse = floor1.bossData.find((boss) => Number(boss.id) === 190000001);
assert(mouse, '第 1 层应包含吱吱鼠');
assert.strictEqual(mouse.calculatedProps.atk, 145, '吱吱鼠攻击计算不符');
assert.strictEqual(mouse.calculatedProps.hp, 2586, '吱吱鼠生命计算不符');
for (const stage of ladderGroup.stages) {
  assert(stage.bossData.every((boss) => !boss.error), `天梯 ${stage.stageName} 存在计算错误`);
}

// ─── 关卡小怪（虚拟 type 9999）───
const mobs = extractBossStats({ types: [9999], syncMaps: false, mapDir });
const mobGroup = mobs.find((group) => Number(group.type) === 9999);
assert(mobGroup, '缺少关卡小怪分组');
assert.strictEqual(mobGroup.slug, 'mobs');
assert(mobGroup.stageCount > 300, '小怪关卡数不足');
assert(mobGroup.bossCount > 1000, '小怪总数不足');

const huaguoshan = mobGroup.stages.find((stage) => stage.stageName === '花果山');
assert(huaguoshan, '找不到花果山小怪');
assert(huaguoshan.bossData.some((mob) => mob.name === '武棍猴兵'), '花果山应包含武棍猴兵');
for (const mob of huaguoshan.bossData) {
  assert(!mob.calcFormula, '小怪不应输出 calcFormula');
  assert(!mob.baseCalculatedProps, '小怪不应输出 baseCalculatedProps');
}
// 小怪分组不应包含 BOSS 刷怪点（花果山 BOSS 猴王 11101 不应出现在小怪列表）
assert(!huaguoshan.bossData.some((mob) => Number(mob.id) === 11101), '小怪分组不应包含 BOSS');
const mobErrors = mobGroup.stages.flatMap((stage) => stage.bossData.filter((mob) => mob.error));
assert.strictEqual(mobErrors.length, 0, `小怪存在计算错误: ${mobErrors.length} 条`);

console.log('✅ boss_special_groups 全部断言通过');
