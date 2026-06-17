/**
 * 角色 → 装备系统
 * 提取叶子: 强化, 重铸+升重, 熔炼, 洗练, 宝石
 */
const u = require('../lib/utils');

// ━━━ 强化 ━━━ equipUpgrade.*.json ━━━━━━━━━━━━━━━━━━━
function extractUpgrade() {
  const raw = u.loadTable('equipUpgrade');
  const tiers = u.dedupByLevelTier(raw);
  u.saveOutput('role_equip_upgrade', tiers, {
    system: '角色 → 装备系统 → 强化',
    source: 'equipUpgrade.*.json',
    costType: '经验条(exp) + 道具(cost: 灵魂)',
    dedup: '每10级一段共30段, 8角色×6部位共享同一张表',
    note: '1级exp=100(特例), 其余同段内exp相同'
  });
}

// ━━━ 重铸+升重 ━━━ equipMake.*.json ━━━━━━━━━━━━━━━━━
function extractMake() {
  const raw = u.loadTable('equipMake');
  const equip = u.loadTable('equip');
  const equipById = new Map(equip.map(e => [e.id, e]));
  const roleSuffix = /(·悟空|·唐僧|·八戒|·沙僧|·敖烈|·白龙|·杨戬|·孟婆)$/;
  const rows = raw.filter(r => r.cost);
  const dedupMap = new Map();

  function parseInjectCost(inject) {
    if (!Array.isArray(inject)) return null;
    return inject.map((it, index) => {
      const toAffixLevel = it[0];
      const toWeight = Number.parseInt(String(toAffixLevel).slice(-1), 10);
      const targetWeight = Number.isFinite(toWeight) && toWeight > 0 ? toWeight : index + 1;
      const fromWeight = targetWeight - 1;
      return {
        fromWeight,
        toWeight: targetWeight,
        stageLabel: `${fromWeight}重 → ${targetWeight}重`,
        toAffixLevel,
        cost: u.parseCost(it[1])
      };
    });
  }

  for (const r of rows) {
    const eq = equipById.get(r.id);
    const isRecastSeries = !!(r.recast && r.recast.reduction);
    if (isRecastSeries && (!eq || eq.part !== 'jewelry')) continue;

    const finalCostRaw = (r.costN1 && r.costN1.length > 0) ? r.costN1 : r.cost;
    const key = [
      r.group,
      JSON.stringify(finalCostRaw),
      (r.recast ? '__has_recast__' : '__no_recast__')
    ].join('|');

    if (!dedupMap.has(key)) {
      const recastUpgrade = parseInjectCost(eq && eq.affixInjectCost);
      const recastUpgradeN1 = parseInjectCost(eq && eq.affixInjectCostN1);
      const finalUpgrade = (recastUpgradeN1 && recastUpgradeN1.length > 0) ? recastUpgradeN1 : recastUpgrade;

      dedupMap.set(key, {
        id: r.id,
        name: (r.name || '').replace(roleSuffix, ''),
        group: r.group,
        groupName: r.groupName,
        cost: u.parseCost(finalCostRaw),
        recast: r.recast ?? null,
        recastUpgrade: finalUpgrade,
        recast0To1Cost: finalUpgrade && finalUpgrade.length > 0 ? finalUpgrade[0].cost : null
      });
    }
  }

  const result = [...dedupMap.values()].sort((a, b) =>
    a.group - b.group || a.id - b.id
  );

  u.saveOutput('role_equip_make', result, {
    system: '角色 → 装备系统 → 重铸+升重',
    source: 'equipMake.*.json + equip.*.json(affixInjectCost)',
    costType: '道具消耗列表(取高品质costN1) + 升重',
    dedup: `按 group+最终cost 去重, 忽略角色差异; 神化/魔化仅保留戒指 (原始${rows.length}条→去重${result.length}条)`
  });
}

// ━━━ 熔炼 ━━━ equipSmelt.*.json ━━━━━━━━━━━━━━━━━━━━━
function extractSmelt() {
  const raw = u.loadTable('equipSmelt');
  const result = raw.map(r => ({
    id: r.id, quality: r.quality, part: r.part,
    smeltLv: r.smeltLv, unlockLv: r.unlockLv,
    cost: u.parseCost(r.cost)
  }));
  u.saveOutput('role_equip_smelt', result, {
    system: '角色 → 装备系统 → 熔炼',
    source: 'equipSmelt.*.json',
    costType: '道具消耗 cost:{"itemId":count}',
    dedup: '按 quality×part 组合, 同品质同部位一个消耗值'
  });
}

// ━━━ 洗练 ━━━ luckBaptism.*.json (type=equip) ━━━━━━━
function extractStone() {
  const raw = u.loadTable('stone');
  const groups = {};
  for (const r of raw) {
    if (!groups[r.group]) {
      groups[r.group] = {
        group: r.group,
        groupName: r.name.replace(/\d+级/, ''),
        levels: []
      };
    }
    groups[r.group].levels.push({
      id: r.id, name: r.name, level: r.level,
      attribute: r.attribute, attributeValue: r.attributeValue,
      sellCost: r.sellCost ? r.sellCost.map(c => ({
        itemId: c[0], name: u.itemName(c[0]),
        count: Array.isArray(c[1]) ? { min: c[1][0], max: c[1][1] } : c[1]
      })) : null
    });
  }
  u.saveOutput('role_equip_stone', Object.values(groups), {
    system: '角色 → 装备系统 → 宝石',
    source: 'stone.*.json',
    costType: '合成消耗 sellCost:[[itemId,[min,max]]]',
    dedup: '按 group(宝石类型) 分组, 每种~10级, 3个低级合1个高级'
  });
}

// ━━━ 主入口 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function extract() {
  console.log('\n📦 角色 → 装备系统');
  extractUpgrade();
  extractMake();
  extractSmelt();
  extractStone();
}

if (require.main === module) extract();
module.exports = extract;




