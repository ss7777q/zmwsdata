const assert = require('assert');
const path = require('path');

const extractBossStats = require(path.join(__dirname, '..', 'scripts', 'extract-boss-stats.js'));
const root = path.resolve(__dirname, '..');
const mapDir = path.join(root, 'file', 'map-cache', 'resources', 'map');

function stageWithBoss(group, bossId, mapToken) {
  return group.stages.find((stage) => {
    const mapName = Array.isArray(stage.mapName) ? stage.mapName.join(' ') : String(stage.mapName || '');
    return mapName.includes(mapToken) && stage.bossData.some((boss) => Number(boss.id) === bossId);
  });
}

const nightmare = extractBossStats({ types: [6], syncMaps: false, mapDir });
const nightmareGroup = nightmare.find((group) => Number(group.type) === 6);
assert(nightmareGroup, '缺少噩梦关卡分组');

for (const [bossId, beskillId, mapToken] of [
  [161791, 1004801, 'Nightmare_16-'],
  [171791, 1004802, 'Nightmare_17-'],
  [181991, 1004803, 'Nightmare_18-'],
  [191691, 1004804, 'Nightmare_19-'],
  [201711, 1004805, 'Nightmare_20-'],
  [231591, 1004807, 'Nightmare_23-'],
]) {
  const stage = stageWithBoss(nightmareGroup, bossId, mapToken);
  assert(stage, `找不到噩梦 Boss ${bossId}`);
  const boss = stage.bossData.find((item) => Number(item.id) === bossId);
  assert.strictEqual(boss.phases?.length, 2, `Boss ${bossId} 应有二阶段`);
  assert.deepStrictEqual(boss.phases[1].beskillIds, [beskillId], `Boss ${bossId} 狂暴 beskill 不正确`);
  assert(boss.phases[1].calculatedProps.atk > boss.phases[0].calculatedProps.atk, `Boss ${bossId} 二阶段攻击应提升`);
}

const nightmareRain = stageWithBoss(nightmareGroup, 221791, 'Nightmare_22-');
assert(nightmareRain, '找不到噩梦雨巫');
assert.strictEqual(nightmareRain.bossData.find((boss) => Number(boss.id) === 221791).phases, undefined, '噩梦雨巫不应有二阶段');

const mainline = extractBossStats({ types: [1], syncMaps: false, mapDir });
const mainlineRain = mainline
  .flatMap((group) => group.stages)
  .find((stage) => String(stage.mapName || '').includes('No_22-5') && stage.bossData.some((boss) => Number(boss.id) === 221701));
assert(mainlineRain, '找不到主线雨巫');
assert.strictEqual(mainlineRain.bossData.find((boss) => Number(boss.id) === 221701).phases?.length, 2, '主线雨巫应有二阶段');

const gold = stageWithBoss(nightmareGroup, 161791, 'Nightmare_16-');
assert(gold.bossData.some((boss) => Number(boss.id) === 161792 && boss.phases?.length === 2), '金巫左龙头应有独立二阶段');
assert(gold.bossData.some((boss) => Number(boss.id) === 161793 && boss.phases?.length === 2), '金巫右龙头应有独立二阶段');
