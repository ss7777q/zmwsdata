/**
 * 角色 → 翅膀系统
 * 提取叶子: 翅膀升级, 羽毛洗练, 羽毛进阶, 羽毛强运
 */
const u = require('../lib/utils');

function loadActiveFeathers() {
  return u.loadTable('feather').filter((row) => !row.cancel);
}

// ━━━ 翅膀升级 ━━━ wingAttribute.*.json ━━━━━━━━━━━━━━
function extractWingUpgrade() {
  const raw = u.loadTable('wingAttribute');
  const allWingRows = JSON.parse(require('fs').readFileSync(u.findTableFile('wing'), 'utf-8'));
  const activeWingNameByButeId = new Map();
  const inactiveWingButeIds = new Set();
  const allWingButeIds = new Set();
  const wings = {};

  for (const row of allWingRows) {
    if (typeof row.buteId !== 'number') {
      throw new Error(`Invalid wing buteId for ${row.name || row.id}`);
    }
    if (allWingButeIds.has(row.buteId)) {
      throw new Error(`Duplicate wing buteId ${row.buteId}`);
    }
    allWingButeIds.add(row.buteId);
    if (u.isInactiveDataApiRow(row)) {
      inactiveWingButeIds.add(row.buteId);
    } else {
      activeWingNameByButeId.set(row.buteId, row.name);
    }
  }

  function parseUpLimit(limit) {
    if (!Array.isArray(limit)) return null;
    return limit.map(it => ({
      type: it[0],
      values: Array.isArray(it[1]) ? it[1] : [it[1]]
    }));
  }

  function roleLevelRequired(limit) {
    if (!Array.isArray(limit)) return null;
    for (const it of limit) {
      if (it[0] === 1 && Array.isArray(it[1]) && typeof it[1][0] === 'number') {
        return it[1][0];
      }
    }
    return null;
  }

  for (const r of raw) {
    if (inactiveWingButeIds.has(r.buteId)) continue;
    const wingName = activeWingNameByButeId.get(r.buteId);
    if (!wingName) {
      throw new Error(`wingAttribute references missing active wing buteId ${r.buteId}`);
    }
    if (!wings[r.buteId]) {
      wings[r.buteId] = { buteId: r.buteId, wingName, levels: [] };
    }
    wings[r.buteId].levels.push({
      wingLevel: r.wingLevel, quality: r.quality,
      consume: r.consume ? {
        itemId: r.consume[0],
        name: u.itemName(r.consume[0]),
        count: r.consume[1]
      } : null,
      roleLevelRequired: roleLevelRequired(r.upLimit),
      upLimit: parseUpLimit(r.upLimit),
      attribute: r.attribute,
      attributeValue: r.attributeValue
    });
  }
  u.saveOutput('role_wing_upgrade', Object.values(wings), {
    system: '角色 → 翅膀系统 → 翅膀 → 升级',
    source: 'wingAttribute.*.json',
    costType: '专属翅膀道具 consume:[itemId, count]',
    dedup: '有效翅膀主表对应的升级配置, 不导出 close/cancel 翅膀',
    note: 'roleLevelRequired 来自 upLimit 中 type=1 条件'
  });
}
// ━━━ 羽毛洗练 ━━━ feather.*.json (baptize字段) ━━━━━━
function extractFeatherBaptize() {
  const raw = loadActiveFeathers();
  const result = raw.map(r => ({
    id: r.id, name: r.name, quality: r.quality,
    allBaptizeCost: u.parseCost(r.allBaptizeCost),
    valueBaptizeCost: u.parseCost(r.valueBaptizeCost),
    fixedCost: u.parseCost(r.fixedCost),
    valuefixedCost: u.parseCost(r.valuefixedCost),
    typeBaptizeCost: u.parseCost(r.typeBaptizeCost),
    typefixedCost: u.parseCost(r.typefixedCost)
  }));
  u.saveOutput('role_feather_baptize', result, {
    system: '角色 → 翅膀系统 → 羽毛 → 洗练',
    source: 'feather.*.json',
    costType: '羽枝(501000) — allBaptizeCost/valueBaptizeCost等',
    dedup: '按品质(quality)递增'
  });
}

// ━━━ 羽毛进阶 ━━━ feather.*.json (nextCost字段) ━━━━━
function extractFeatherAdvance() {
  const raw = loadActiveFeathers();
  const result = raw.filter(r => r.nextCost).map(r => ({
    id: r.id, name: r.name, quality: r.quality,
    nextId: r.nextId,
    nextLimit: r.nextLimit,
    nextCost: u.parseCost(r.nextCost),
    moneyCost: u.parseCost(r.moneyCost)
  }));
  u.saveOutput('role_feather_advance', result, {
    system: '角色 → 翅膀系统 → 羽毛 → 进阶',
    source: 'feather.*.json',
    costType: '进阶消耗(nextCost:羽丝) + 羽魂(moneyCost)',
    dedup: '按品质等级递增'
  });
}

// ━━━ 羽毛强运 ━━━ feather.*.json (*Luck字段) ━━━━━━━━
function extractFeatherLuck() {
  const raw = loadActiveFeathers();
  const result = raw.filter(r =>
    r.allBaptizeCostLuck || r.valueBaptizeCostLuck ||
    r.fixedCostLuck || r.valuefixedCostLuck
  ).map(r => ({
    id: r.id, name: r.name, quality: r.quality,
    allBaptizeCostLuck: u.parseCost(r.allBaptizeCostLuck),
    valueBaptizeCostLuck: u.parseCost(r.valueBaptizeCostLuck),
    fixedCostLuck: u.parseCost(r.fixedCostLuck),
    valuefixedCostLuck: u.parseCost(r.valuefixedCostLuck),
    pointChangeCost: u.parseCost(r.pointChangeCost)
  }));
  u.saveOutput('role_feather_luck', result, {
    system: '角色 → 翅膀系统 → 羽毛 → 强运',
    source: 'feather.*.json',
    costType: '强运洗练 *Luck字段 + pointChangeCost(属性变更)',
    dedup: '按品质递增'
  });
}

function extract() {
  console.log('\n📦 角色 → 翅膀系统');
  extractWingUpgrade();
  extractFeatherBaptize();
  extractFeatherAdvance();
  extractFeatherLuck();
}

if (require.main === module) extract();
module.exports = extract;

