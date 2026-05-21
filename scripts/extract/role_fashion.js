/**
 * 角色 → 时装系统
 * 提取叶子: 宝珠升级/进阶, 时装续费/传承
 */
const u = require('../lib/utils');
const fs = require('fs');
const path = require('path');

function removeOutput(name) {
  const fp = path.join(u.OUTPUT_DIR, `${name}.json`);
  if (!fs.existsSync(fp)) return;
  fs.unlinkSync(fp);
  console.log(`  🗑️  ${name}.json 已移除`);
}

const FASHION_PART_ORDER = {
  clothes: 1,
  face: 2,
  head: 3,
  weapon: 4,
  wing: 5,
  matrix: 6,
};

const FASHION_PART_NAME = {
  clothes: '衣服',
  face: '面部',
  head: '头部',
  weapon: '武器',
  wing: '翅膀',
  matrix: '阵法',
};

function normalizeFashionRenew(renew) {
  if (!renew || typeof renew !== 'object') return {};

  const entries = Object.entries(renew)
    .map(([days, cost]) => ({
      rawDays: Number(days),
      daysLabel: days === '-1' ? '永久' : `${days}天`,
      itemId: cost[0],
      name: u.itemName(cost[0]),
      count: cost[1],
    }))
    .sort((left, right) => {
      if (left.rawDays === -1) return 1;
      if (right.rawDays === -1) return -1;
      return left.rawDays - right.rawDays;
    });

  return entries.reduce((result, entry) => {
    result[entry.daysLabel] = {
      itemId: entry.itemId,
      name: entry.name,
      count: entry.count,
    };
    return result;
  }, {});
}

function getFashionRenewSortValue(renew) {
  if (!renew || typeof renew !== 'object') return Number.MAX_SAFE_INTEGER;
  const priorityKeys = ['永久', '365天', '60天', '40天', '30天', '20天'];
  for (const key of priorityKeys) {
    const count = renew[key] && Number(renew[key].count);
    if (Number.isFinite(count)) return count;
  }
  const counts = Object.values(renew)
    .map((entry) => Number(entry && entry.count))
    .filter((count) => Number.isFinite(count));
  return counts.length > 0 ? Math.max(...counts) : Number.MAX_SAFE_INTEGER;
}

function getFashionTransSortValue(transCost) {
  if (!Array.isArray(transCost) || transCost.length === 0) return 0;
  return transCost.reduce((total, entry) => total + Number(entry.count || 0), 0);
}

// ━━━ 宝珠升级/进阶 ━━━ equipFashionBall.*.json ━━━━━━
function extractFashionBall() {
  const raw = u.loadTable('equipFashionBall');
  const byRank = {};
  for (const r of raw) {
    if (!byRank[r.rank]) byRank[r.rank] = { rank: r.rank, levels: [] };
    byRank[r.rank].levels.push({
      id: r.id,
      level: r.level,
      upResources: r.upResources
        ? { itemId: r.upResources[0], name: u.itemName(r.upResources[0]), count: r.upResources[1] }
        : null,
      upLevelLimits: r.upLevelLimits,
      attributeValue: r.attributeValue,
      resourceId: r.resourceId,
    });
  }

  const sortedRanks = Object.values(byRank).sort((left, right) => Number(left.rank) - Number(right.rank));
  let inheritedMaxLevelRequired = null;
  for (const rankGroup of sortedRanks) {
    const ownMaxLevelRequired = rankGroup.levels.reduce((current, level) => {
      if (typeof level.upLevelLimits !== 'number' || !Number.isFinite(level.upLevelLimits)) return current;
      return current == null ? level.upLevelLimits : Math.max(current, level.upLevelLimits);
    }, null);

    const maxLevelRequired = ownMaxLevelRequired ?? inheritedMaxLevelRequired;
    if (maxLevelRequired != null) {
      rankGroup.maxLevelRequired = maxLevelRequired;
      inheritedMaxLevelRequired = maxLevelRequired;
    }
  }

  u.saveOutput('role_fashion_ball', sortedRanks, {
    system: '角色 → 时装系统 → 宝珠 → 升级/进阶',
    source: 'equipFashionBall.*.json',
    costType: '经验道具 upResources:[itemId=6(时装经验), count]',
    dedup: '按 rank(阶) 分组, 每阶内循环提升不同属性',
  });
}

// ━━━ 时装续费/传承 ━━━ equipFashion.*.json (renew/transCost字段) ━━━━
function extractFashionRenew() {
  const raw = u.loadTable('equipFashion');
  const withRenew = raw.filter((record) => (
    record.renew && (record.type === 1 || record.part === 'wing' || record.part === 'matrix')
  ));

  const partMap = new Map();

  for (const record of withRenew) {
    const part = record.part || 'unknown';
    if (!partMap.has(part)) {
      partMap.set(part, {
        part,
        partName: FASHION_PART_NAME[part] || part,
        groups: new Map(),
      });
    }

    const renew = normalizeFashionRenew(record.renew);
    const transCost = u.parseCost(record.transCost);
    const groupKey = JSON.stringify({ renew, transCost });

    if (!partMap.get(part).groups.has(groupKey)) {
      partMap.get(part).groups.set(groupKey, {
        renew,
        transCost,
        hasTransCost: Array.isArray(transCost) && transCost.length > 0,
        fashions: [],
      });
    }

    partMap.get(part).groups.get(groupKey).fashions.push(record.name);
  }

  const result = [...partMap.values()]
    .map((partGroup) => {
      const groups = [...partGroup.groups.values()]
        .sort((left, right) => {
          return getFashionRenewSortValue(left.renew) - getFashionRenewSortValue(right.renew)
            || getFashionTransSortValue(left.transCost) - getFashionTransSortValue(right.transCost)
            || right.fashions.length - left.fashions.length;
        })
        .map((group, index) => ({
          category: `第${index + 1}类`,
          fashionCount: group.fashions.length,
          renew: group.renew,
          transCost: group.transCost,
          hasTransCost: group.hasTransCost,
          fashions: group.fashions.slice().sort((left, right) => left.localeCompare(right, 'zh-Hans-CN')),
        }));

      return {
        part: partGroup.part,
        partName: partGroup.partName,
        groupCount: groups.length,
        fashionCount: groups.reduce((total, group) => total + group.fashionCount, 0),
        groups,
      };
    })
    .sort((left, right) => {
      return (FASHION_PART_ORDER[left.part] || 99) - (FASHION_PART_ORDER[right.part] || 99)
        || left.part.localeCompare(right.part, 'zh-Hans-CN');
    });

  u.saveOutput('role_fashion_renew', result, {
    system: '角色 → 时装系统 → 时装 → 各部位续费与传承',
    source: 'equipFashion.*.json (renew/transCost字段)',
    costType: '点券/道具续费 renew + 传承消耗 transCost',
    dedup: '参考宠物升星结构；以部位为主，每个部位内按“续费完全相同 + 传承完全相同（翅膀/阵法为空）”聚成一类，类内只保留 fashions 数组',
  });
}

function extract() {
  console.log('\n📦 角色 → 时装系统');
  extractFashionBall();
  extractFashionRenew();
  removeOutput('role_fashion_wardrobe');
}

if (require.main === module) extract();
module.exports = extract;
