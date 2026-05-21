const fs = require('fs');
const path = require('path');
const u = require('../lib/utils');

const DISPLAY_PROP_KEYS = [
  'hp',
  'atk',
  'def',
  'healHp',
  'mp',
  'healMp',
  'hitVal',
  'dodge',
  'crit',
  'tenacity',
  'lucky',
  'guardian',
  'break',
  'protect'
];

const STONE_ITEMS = {
  god: 8989998,
  devil: 8989999,
};

const STONE_REWARD_LINES = [
  {
    key: 'reward_plunder_blessing',
    camp: 'god',
    label: '神将祝福结算',
    thresholdLabel: '采矿%',
    description: '按全队采矿百分比档位结算神灵石。',
    itemId: STONE_ITEMS.god,
  },
  {
    key: 'reward_devil_blessing',
    camp: 'devil',
    label: '魔王祝福结算',
    thresholdLabel: '表现档位',
    description: '按魔王结算表现档位结算魔灵石。',
    itemId: STONE_ITEMS.devil,
  },
  {
    key: 'devil_Kill_blessing',
    camp: 'devil',
    label: '魔王击败神将数',
    thresholdLabel: '击杀数',
    description: '按魔王击败神将数量结算魔灵石。',
    itemId: STONE_ITEMS.devil,
  },
  {
    key: 'saveGodStoneReward',
    camp: 'god',
    label: '储灵珠补领',
    thresholdLabel: '采矿%',
    description: '按最高可参与阶层的采矿结果补领储灵珠中的神灵石。',
    itemId: STONE_ITEMS.god,
  },
];

function buildSkillNameMap() {
  return new Map(
    u.loadTable('skill').map((skill) => [skill.id, skill.name || `技能 ${skill.id}`])
  );
}

function buildEntityMap(tableName) {
  return new Map(
    u.loadTable(tableName).map((entry) => [entry.id, entry])
  );
}

function resolveEntityType(id, petById, rideById, monsterById) {
  if (petById.has(id)) return 'pet';
  if (rideById.has(id)) return 'ride';
  if (id < 100 && monsterById.has(id)) return 'role';
  if (monsterById.has(id)) return 'monster';
  return 'unknown';
}

function resolveEntityName(id, type, petById, rideById, monsterById) {
  if (type === 'pet') return petById.get(id)?.name || `灵宠 ${id}`;
  if (type === 'ride') return rideById.get(id)?.name || `坐骑 ${id}`;
  if (type === 'role' || type === 'monster') return monsterById.get(id)?.name || `神魔单位 ${id}`;
  return u.itemInfo(id).name;
}

function buildSkillEntries(skillIds, skillNameById) {
  if (!Array.isArray(skillIds)) return [];
  return skillIds
    .filter((id) => typeof id === 'number')
    .map((id) => ({
      id,
      name: skillNameById.get(id) || `技能 ${id}`
    }));
}

function buildGroupedMap(rows, key) {
  return rows.reduce((result, row) => {
    const groupKey = row[key];
    if (!result.has(groupKey)) {
      result.set(groupKey, []);
    }
    result.get(groupKey).push(row);
    return result;
  }, new Map());
}

function getItemsForDropId(dropId, dropById) {
  const dropRows = dropById.get(dropId) || [];
  return dropRows.flatMap((row) => Array.isArray(row.items) ? row.items : []);
}

function decodeStoneFromCode(code, targetItemId, dropGroupById, dropById) {
  if (!Number.isFinite(Number(code))) {
    return { count: 0, mode: 'unknown' };
  }

  const numericCode = Number(code);
  const matchingGroupRows = dropGroupById.get(numericCode) || [];
  if (matchingGroupRows.length > 0) {
    const count = matchingGroupRows.reduce((sum, groupRow) => {
      return sum + getItemsForDropId(groupRow.dropID, dropById).reduce((itemSum, item) => {
        if (!Array.isArray(item) || item[0] !== targetItemId) {
          return itemSum;
        }
        return itemSum + Number(item[1] || 0);
      }, 0);
    }, 0);

    return {
      count,
      mode: 'dropGroup',
      sourceCode: numericCode,
    };
  }

  const directDropItems = getItemsForDropId(numericCode, dropById);
  if (directDropItems.length > 0) {
    const count = directDropItems.reduce((sum, item) => {
      if (!Array.isArray(item) || item[0] !== targetItemId) {
        return sum;
      }
      return sum + Number(item[1] || 0);
    }, 0);

    return {
      count,
      mode: 'drop',
      sourceCode: numericCode,
    };
  }

  if (numericCode >= 0 && numericCode < 1000) {
    return {
      count: numericCode,
      mode: 'direct',
      sourceCode: numericCode,
    };
  }

  return {
    count: 0,
    mode: 'unknown',
    sourceCode: numericCode,
  };
}

function decodeRewardEntry(rawValue, targetItemId, dropGroupById, dropById) {
  if (Array.isArray(rawValue)) {
    const matchedSources = rawValue
      .map((code) => decodeStoneFromCode(code, targetItemId, dropGroupById, dropById))
      .filter((entry) => entry.count > 0);

    return {
      stoneCount: matchedSources.reduce((sum, entry) => sum + entry.count, 0),
      matchedSources,
      rawValue,
    };
  }

  const direct = decodeStoneFromCode(rawValue, targetItemId, dropGroupById, dropById);
  return {
    stoneCount: direct.count,
    matchedSources: direct.count > 0 ? [direct] : [],
    rawValue,
  };
}

function buildThresholdMap(entries) {
  const map = new Map();
  for (const entry of entries || []) {
    map.set(Number(entry.threshold), Number(entry.stoneCount || 0));
  }
  return map;
}

function buildGodTableRows(tiers, rewardKey, thresholds) {
  return tiers.map((tier) => {
    const valuesByThreshold = buildThresholdMap(tier.rewards[rewardKey] || []);
    return {
      rewardLv: tier.rewardLv,
      stageName: tier.stageName,
      battlefieldLv: tier.battlefieldLv,
      values: Object.fromEntries(
        thresholds.map((threshold) => [String(threshold), valuesByThreshold.get(threshold) ?? 0])
      ),
    };
  });
}

function buildDevilMatrixByTier(tiers) {
  const killThresholds = Array.from({ length: 11 }, (_, index) => index);
  const remainingMineThresholds = Array.from({ length: 11 }, (_, index) => index * 10);

  return Object.fromEntries(
    tiers.map((tier) => {
      const devilBlessingMap = buildThresholdMap(tier.rewards.reward_devil_blessing || []);
      const devilKillMap = buildThresholdMap(tier.rewards.devil_Kill_blessing || []);

      const rows = remainingMineThresholds.map((remainingMine) => {
        const performanceThreshold = 100 - remainingMine;
        const blessingStone = devilBlessingMap.get(performanceThreshold) ?? 0;

        return {
          remainingMine,
          values: Object.fromEntries(
            killThresholds.map((killCount) => [
              String(killCount),
              blessingStone + (devilKillMap.get(killCount) ?? 0),
            ])
          ),
        };
      });

      return [
        String(tier.rewardLv),
        {
          rewardLv: tier.rewardLv,
          stageName: tier.stageName,
          battlefieldLv: tier.battlefieldLv,
          killThresholds,
          remainingMineThresholds,
          rows,
        },
      ];
    })
  );
}

function formatBattlefieldStageName(rewardLv, fallbackName) {
  if (Number.isInteger(rewardLv) && rewardLv > 0) {
    return `神魔战场${rewardLv}阶`;
  }
  return fallbackName || '神魔战场';
}

function buildStoneRewardPayload() {
  const godWarFight = u.loadTable('godWarFight').filter((entry) => Number(entry.battlefield) === 2);
  const godWarReward = u.loadTable('godWarReward').filter((entry) => Number(entry.battlefield) === 2);
  const dropGroupById = buildGroupedMap(u.loadTable('dropGroup'), 'groupID');
  const dropById = buildGroupedMap(u.loadTable('drop'), 'dropID');

  const fightByRewardLevel = new Map(godWarFight.map((entry) => [Number(entry.rewardLv), entry]));
  const lineMetaByKey = new Map(STONE_REWARD_LINES.map((line) => [line.key, line]));

  const tiers = godWarReward
    .map((rewardRow) => {
      const rewardLv = Number(rewardRow.rewardLv);
      const fightRow = fightByRewardLevel.get(rewardLv);

      const rewards = Object.fromEntries(
        STONE_REWARD_LINES.map((line) => {
          const rows = Array.isArray(rewardRow[line.key]) ? rewardRow[line.key] : [];
          const decodedRows = rows.map((entry) => {
            const [threshold, rewardValue] = Array.isArray(entry) ? entry : [entry, null];
            const decoded = decodeRewardEntry(rewardValue, line.itemId, dropGroupById, dropById);
            return {
              threshold: Number(threshold),
              stoneCount: decoded.stoneCount,
              matchedSources: decoded.matchedSources,
              rawValue: decoded.rawValue,
            };
          });
          return [line.key, decodedRows];
        })
      );

      return {
        rewardLv,
        battlefieldLv: Number(fightRow?.battlefieldLv || 0),
        stageId: Number(fightRow?.id || rewardRow.id),
        stageName: formatBattlefieldStageName(rewardLv, fightRow?.name),
        rewards,
      };
    })
    .sort((left, right) => left.rewardLv - right.rewardLv);

  const godThresholds = Array.from({ length: 11 }, (_, index) => index * 10);
  const tables = {
    reward_plunder_blessing: {
      rewardKey: 'reward_plunder_blessing',
      thresholdLabel: '采矿%',
      thresholds: godThresholds,
      rows: buildGodTableRows(tiers, 'reward_plunder_blessing', godThresholds),
    },
    saveGodStoneReward: {
      rewardKey: 'saveGodStoneReward',
      thresholdLabel: '采矿%',
      thresholds: godThresholds,
      rows: buildGodTableRows(tiers, 'saveGodStoneReward', godThresholds),
    },
    devilStoneMatrixByTier: buildDevilMatrixByTier(tiers),
  };

  return {
    stones: {
      god: u.itemInfo(STONE_ITEMS.god),
      devil: u.itemInfo(STONE_ITEMS.devil),
    },
    rewardLines: STONE_REWARD_LINES.map((line) => ({
      ...line,
      stoneName: line.camp === 'god' ? u.itemInfo(STONE_ITEMS.god).name : u.itemInfo(STONE_ITEMS.devil).name,
    })),
    tiers,
    tables,
    lineMetaByKey: Object.fromEntries(
      STONE_REWARD_LINES.map((line) => [
        line.key,
        {
          label: line.label,
          thresholdLabel: line.thresholdLabel,
          camp: line.camp,
          description: line.description,
          stoneItemId: line.itemId,
        },
      ])
    ),
  };
}

function extractCallGod() {
  const callGodAttribute = u.loadTable('callGodAttribute');
  const callGodRatio = u.loadTable('callGodRatio');
  const petById = buildEntityMap('pet');
  const rideById = buildEntityMap('ride');
  const monsterById = buildEntityMap('monster');
  const skillNameById = buildSkillNameMap();

  const levelTemplates = callGodAttribute
    .map((entry) => ({
      level: entry.level,
      power: entry.power,
      ...Object.fromEntries(
        DISPLAY_PROP_KEYS.map((key) => [key, Number(entry[key] || 0)])
      )
    }))
    .sort((left, right) => left.level - right.level);

  const profiles = callGodRatio
    .map((entry) => {
      const entityType = resolveEntityType(entry.id, petById, rideById, monsterById);
      const entityName = resolveEntityName(entry.id, entityType, petById, rideById, monsterById);
      const monster = monsterById.get(entry.id);

      return {
        id: entry.id,
        type: entityType,
        name: entityName,
        ...Object.fromEntries(
          DISPLAY_PROP_KEYS.map((key) => [key, Number(entry[key] || 0)])
        ),
        awakenSkills: buildSkillEntries(
          [entry.skill1Awaken, entry.skill2Awaken, entry.skill3Awaken, entry.skill4Awaken, entry.trickAwaken],
          skillNameById
        ),
        passiveSkills: buildSkillEntries(entry.passiveSkill, skillNameById),
        baseSkills: buildSkillEntries(monster?.skillIds, skillNameById),
        awakenSkillNames: buildSkillEntries(
          [entry.skill1Awaken, entry.skill2Awaken, entry.skill3Awaken, entry.skill4Awaken, entry.trickAwaken],
          skillNameById
        ).map((item) => item.name),
        passiveSkillNames: buildSkillEntries(entry.passiveSkill, skillNameById).map((item) => item.name),
        baseSkillNames: buildSkillEntries(monster?.skillIds, skillNameById).map((item) => item.name)
      };
    })
    .sort((left, right) => {
      const typeOrder = ['role', 'pet', 'ride', 'monster', 'unknown'];
      const leftTypeIndex = typeOrder.indexOf(left.type);
      const rightTypeIndex = typeOrder.indexOf(right.type);
      if (leftTypeIndex !== rightTypeIndex) return leftTypeIndex - rightTypeIndex;
      return left.id - right.id;
    });

  u.saveOutput('call_god_attribute', levelTemplates, {
    system: 'call_god',
    source: 'callGodAttribute.*.json'
  });

  u.saveOutput('call_god_ratio', profiles, {
    system: 'call_god',
    source: 'callGodRatio.*.json + monster.*.json + pet.*.json + ride.*.json + skill.*.json',
    formula: 'ceil(template[prop] * ratio[prop])'
  });

  u.saveOutput('call_god_stone_rewards', buildStoneRewardPayload(), {
    system: 'call_god',
    source: 'godWarFight.*.json + godWarReward.*.json + dropGroup.*.json + drop.*.json + item.*.json',
    reportReference: 'temp/神魔战场神灵石与魔灵石获取详细分析.md',
  });

  const legacyOutput = path.join(u.OUTPUT_DIR, 'call_god.json');
  if (fs.existsSync(legacyOutput)) {
    fs.unlinkSync(legacyOutput);
    console.log('  🧹 已移除旧版 call_god.json');
  }
}

module.exports = extractCallGod;
