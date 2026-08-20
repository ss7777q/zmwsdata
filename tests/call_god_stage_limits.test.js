const assert = require('assert');

const { buildCallGodStageLimits } = require('../scripts/extract/call_god_stage_limits');

const payload = buildCallGodStageLimits({
  godWarFight: [
    {
      id: 2016,
      battlefield: 2,
      name: '神魔战场15阶',
      rewardLv: 16,
      battlefieldLv: 220,
      skillLimit: 44,
      rideSkillLimit: 44,
      danyuanLimit: 22,
      wingSkillLimit: 12,
      equipFashionSkillLimit: 19,
      devilLimit: { 1: 6, 102001: 5 },
    },
  ],
  godWarBoss: [
    { id: 1, group: 1, name: '刑天', level: 1 },
    { id: 102001, group: 102001, name: '夸父', level: 1 },
  ],
  stage: [
    { id: 10, name: '神魔比赛·巨鹿', subType: 130004 },
    { id: 11, name: '神魔战场·异变', type: 42, subType: 420001, otherData: { danyuanLimit: 14 } },
    { id: 12, name: '已关闭关卡', close: 1, otherData: { danyuanLimit: 99 } },
  ],
  tenjinArenaData: [
    { id: 1, name: '孙悟空', type: 'role', stageSubType: [130004], otherData: { skillLvLimit: 33 } },
    { id: 2, name: '无覆盖值', type: 'role', stageSubType: [130004] },
  ],
});

assert.strictEqual(payload.battlefieldTiers.length, 1);
assert.strictEqual(payload.battlefieldTiers[0].name, '神魔战场16阶');
assert.deepStrictEqual(
  payload.battlefieldTiers[0].limits.map((entry) => [entry.label, entry.value]),
  [
    ['角色技能等级', 44],
    ['坐骑技能等级', 44],
    ['丹元等级', 22],
    ['翅膀技能等级', 12],
    ['装备时装技能等级', 19],
  ],
);
assert.deepStrictEqual(
  payload.battlefieldTiers[0].devilLimits.map((entry) => [entry.name, entry.value]),
  [['刑天', 6], ['夸父', 5]],
);
assert.deepStrictEqual(payload.specialStages.map((stage) => stage.name), ['神魔战场·异变']);
assert.deepStrictEqual(payload.entityOverrides[0].stageNames, ['神魔比赛·巨鹿']);
assert.strictEqual(payload.entityOverrides[0].limits[0].value, 33);

console.log('call god stage limits: ok');
