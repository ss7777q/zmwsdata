const assert = require('assert');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const extractBossStats = require(path.join(repoRoot, 'scripts', 'extract-boss-stats.js'));

const nightmareGroups = extractBossStats({
  types: [6],
  syncMaps: false,
  mapDir: path.join(repoRoot, 'file', 'map-cache', 'resources', 'map'),
});

const nightmareGroup = nightmareGroups.find((group) => Number(group.type) === 6);
assert(nightmareGroup, '缺少噩梦关卡 BOSS 导出分组');

function getStageBossIds(stageId) {
  const stage = nightmareGroup.stages.find((item) => Number(item.stageId) === stageId);
  assert(stage, `缺少噩梦关卡 ${stageId}`);
  return stage.bossData.map((boss) => Number(boss.bossId ?? boss.id));
}

function assertIncludesAll(actualIds, expectedIds, label) {
  for (const expectedId of expectedIds) {
    assert(
      actualIds.includes(expectedId),
      `${label} 缺少 RandomIds BOSS ${expectedId}, 实际为 ${actualIds.join(',')}`
    );
  }
}

const nightmareHuaguoshanIds = getStageBossIds(990101);
assertIncludesAll(nightmareHuaguoshanIds, [11191, 11291, 11391, 11491, 11591], '噩梦花果山');
assert(!nightmareHuaguoshanIds.includes(10101), '噩梦花果山不应把 mIds 占位小怪 10101 导出为 BOSS');

const nightmareHuolongdaoIds = getStageBossIds(991001);
assertIncludesAll(nightmareHuolongdaoIds, [101291, 101193, 101194, 101391, 101491, 101692, 101693], '噩梦火龙岛');
assert(!nightmareHuolongdaoIds.includes(10101), '噩梦火龙岛不应把 mIds 占位小怪 10101 导出为 BOSS');

const randomSourcedBosses = nightmareGroup.stages
  .flatMap((stage) => stage.bossData)
  .filter((boss) => boss.sourceField === 'RandomIds');
assert(randomSourcedBosses.length > 0, '噩梦关卡应保留 RandomIds 来源标记用于排查');
