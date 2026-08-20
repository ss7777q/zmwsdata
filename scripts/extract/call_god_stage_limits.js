const u = require('../lib/utils');

const LIMIT_FIELDS = {
  skillLimit: '角色技能等级',
  rideSkillLimit: '坐骑技能等级',
  danyuanLimit: '丹元等级',
  wingSkillLimit: '翅膀技能等级',
  equipFashionSkillLimit: '装备时装技能等级',
  zhenfaLimit: '阵法等级',
  rideSkillLevelLimit: '坐骑技能等级',
  skillLvLimit: '角色技能等级',
};

const BATTLEFIELD_LIMIT_FIELDS = [
  'skillLimit',
  'rideSkillLimit',
  'danyuanLimit',
  'wingSkillLimit',
  'equipFashionSkillLimit',
];

const STAGE_LIMIT_FIELDS = ['danyuanLimit', 'zhenfaLimit', 'rideSkillLevelLimit'];
const ENTITY_LIMIT_FIELDS = ['skillLvLimit', 'rideSkillLimit'];

function isActive(row) {
  return row && row.close !== 1 && row.cancel !== 1;
}

function collectLimits(source, fields) {
  return fields.flatMap((key) => {
    const value = Number(source?.[key]);
    return Number.isFinite(value)
      ? [{ key, label: LIMIT_FIELDS[key], value }]
      : [];
  });
}

function normalizedBattlefieldName(row) {
  const rewardLv = Number(row.rewardLv);
  if (Number(row.battlefield) === 2 && Number.isInteger(rewardLv) && rewardLv > 0) {
    return `神魔战场${rewardLv}阶`;
  }
  return row.name || `战场 ${row.id}`;
}

function buildCallGodStageLimits({ godWarFight, godWarBoss, stage, tenjinArenaData }) {
  const activeStages = (stage || []).filter(isActive);
  const stageNamesBySubType = new Map();
  for (const row of activeStages) {
    const subType = Number(row.subType);
    if (!Number.isFinite(subType)) continue;
    if (!stageNamesBySubType.has(subType)) stageNamesBySubType.set(subType, new Set());
    stageNamesBySubType.get(subType).add(row.name || `关卡 ${row.id}`);
  }

  const bossNamesByGroup = new Map();
  for (const row of (godWarBoss || []).filter(isActive)) {
    const groupId = Number(row.group ?? row.id);
    if (!Number.isFinite(groupId) || bossNamesByGroup.has(groupId)) continue;
    bossNamesByGroup.set(groupId, row.name || `魔王 ${groupId}`);
  }

  const battlefieldTiers = (godWarFight || [])
    .filter(isActive)
    .map((row) => ({
      id: Number(row.id),
      battlefield: Number(row.battlefield),
      rewardLv: Number(row.rewardLv),
      name: normalizedBattlefieldName(row),
      battlefieldLevel: Number(row.battlefieldLv),
      limits: collectLimits(row, BATTLEFIELD_LIMIT_FIELDS),
      devilLimits: Object.entries(row.devilLimit || {})
        .map(([groupId, value]) => ({
          groupId: Number(groupId),
          name: bossNamesByGroup.get(Number(groupId)) || `魔王 ${groupId}`,
          value: Number(value),
        }))
        .filter((entry) => Number.isFinite(entry.value))
        .sort((left, right) => left.groupId - right.groupId),
    }))
    .filter((row) => row.limits.length > 0 || row.devilLimits.length > 0)
    .sort((left, right) => left.battlefieldLevel - right.battlefieldLevel || left.id - right.id);

  const specialStages = activeStages
    .map((row) => ({
      id: Number(row.id),
      name: row.name || `关卡 ${row.id}`,
      type: Number(row.type),
      subType: Number(row.subType),
      limits: collectLimits(row.otherData, STAGE_LIMIT_FIELDS),
    }))
    .filter((row) => row.limits.length > 0)
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));

  const entityOverrides = (tenjinArenaData || [])
    .filter(isActive)
    .map((row) => {
      const subTypes = (Array.isArray(row.stageSubType) ? row.stageSubType : [row.stageSubType])
        .map(Number)
        .filter(Number.isFinite);
      const stageNames = [...new Set(subTypes.flatMap((subType) => [...(stageNamesBySubType.get(subType) || [])]))];
      return {
        id: Number(row.id),
        name: row.name || `配置 ${row.id}`,
        type: row.type || 'unknown',
        subTypes,
        stageNames,
        limits: collectLimits(row.otherData, ENTITY_LIMIT_FIELDS),
      };
    })
    .filter((row) => row.limits.length > 0)
    .sort((left, right) => {
      const stageCompare = (left.subTypes[0] || 0) - (right.subTypes[0] || 0);
      return stageCompare || left.type.localeCompare(right.type) || left.id - right.id;
    });

  return {
    sources: {
      battlefieldTiers: 'godWarFight.*.json',
      specialStages: 'stage.*.json → otherData',
      entityOverrides: 'tenjinArenaData.*.json → otherData',
      demonKings: 'godWarBoss.*.json',
    },
    battlefieldTiers,
    specialStages,
    entityOverrides,
  };
}

function extractCallGodStageLimits() {
  const payload = buildCallGodStageLimits({
    godWarFight: u.loadTable('godWarFight'),
    godWarBoss: u.loadTable('godWarBoss'),
    stage: u.loadTable('stage'),
    tenjinArenaData: u.loadTable('tenjinArenaData'),
  });

  u.saveOutput('call_god_stage_limits', payload, {
    system: 'call_god',
    source: Object.values(payload.sources).join(' + '),
    note: '仅收录配置表中明确声明的等级上限，不根据角色等级或关卡等级推算。',
  });
}

module.exports = extractCallGodStageLimits;
module.exports.buildCallGodStageLimits = buildCallGodStageLimits;

