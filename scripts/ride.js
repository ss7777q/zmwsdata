/**
 * 坐骑系统
 * 提取叶子: 升星, 坐骑技能升级, 驾驭升级, 装备强化, 装备打造, 骑术, 变异/超进化
 */
const u = require('../lib/utils');
const fs = require('fs');
const path = require('path');

// ━━━ 坐骑升星 ━━━ ride.*.json ━━━━━━━━━━━━━━━━━━━━━
function extractRideStar() {
  const raw = u.loadTable('ride');

  function parsePromoteStarCost(costMap) {
    if (!costMap) return null;
    return Object.entries(costMap)
      .map(([star, cost]) => ({
        star: Number(star),
        cost: u.parseCost(cost)
      }))
      .sort((a, b) => a.star - b.star);
  }

  function getCategory(ride) {
    const firstStarCost = ride.promoteStarCost && ride.promoteStarCost['2'];
    return firstStarCost && firstStarCost[0] === 201171 ? '凶兽' : '普通';
  }

  const grouped = new Map();
  for (const ride of raw) {
    if (!ride.promoteStarCost) continue;

    const category = getCategory(ride);
    if (!grouped.has(category)) {
      grouped.set(category, {
        category,
        promoteStarCost: parsePromoteStarCost(ride.promoteStarCost),
        rides: []
      });
    }

    grouped.get(category).rides.push({
      id: ride.id,
      idGroup: ride.idGroup,
      name: ride.name,
      rank: ride.rank,
      type: ride.type,
      nextId: ride.nextId
    });
  }

  const order = { '普通': 1, '凶兽': 2 };
  const result = {
    groups: [...grouped.values()]
      .map(group => ({
        category: group.category,
        rideCount: group.rides.length,
        promoteStarCost: group.promoteStarCost,
        rides: group.rides.sort((a, b) => a.idGroup - b.idGroup || a.id - b.id)
      }))
      .sort((a, b) => (order[a.category] || 99) - (order[b.category] || 99))
  };

  u.saveOutput('ride_star', result, {
    system: '坐骑 → 升星',
    source: 'ride.*.json',
    costType: '仅保留升星 promoteStarCost（普通 / 凶兽 两类）',
    dedup: '所有有升星消耗的坐骑只按 普通 / 凶兽 两类聚合；同类共享同一套升星数量'
  });
}

function extractRideMastery() {

  const raw = u.loadTable('rideSkill');
  // 所有坐骑共享同一消耗表, 按级去重
  const tiers = [];
  let prev = null;
  for (const r of raw) {
    if (!r.upgradeCost) continue;
    const key = JSON.stringify(r.upgradeCost);
    if (!prev || prev._key !== key) {
      prev = {
        _key: key,
        levelStart: r.levelLimit || r.level, // 实际使用可能是 levelLimit，保留容错
        levelEnd: r.levelLimit || r.level,
        rideLimit: r.rideLimit, // 对应游戏内的 rideSkill.findById(lv).rideLimit
        upgradeCost: u.parseCost(r.upgradeCost)
      };
      tiers.push(prev);
    } else {
      prev.levelEnd = r.levelLimit || r.level;
    }
  }
  tiers.forEach(t => delete t._key);
  u.saveOutput('ride_mastery', tiers, {
    system: '坐骑 → 驾驭升级(而非技能)',
    source: 'rideSkill.*.json，rideSkillAttr.*.json',
    costType: '灵魂 upgradeCost:[[3, count]]',
    dedup: '所有坐骑共享, 表现为驾驭等级'
  });
}

// ━━━ 坐骑技能升级 ━━━ ride.*.json + skillLevel.*.json ━
// 来源链路:
//  - ride.*.json: skillActive/skillPassive/skillSp
//  - skillLevel.*.json: soulCost (字段名叫 soulCost, 实际是技能升级道具消耗)
function extractRideSkill() {
  const rideRaw = u.loadTable('ride');
  const skillLevelRaw = u.loadTable('skillLevel');

  const rideSkillIds = new Set();
  for (const r of rideRaw) {
    for (const k of ['skillActive', 'skillPassive', 'skillSp']) {
      const arr = r[k] || [];
      for (const sid of arr) {
        if (sid) rideSkillIds.add(Number(sid));
      }
    }
  }

  // 拉平坐骑技能的每级消耗记录
  const rows = [];
  for (const rec of skillLevelRaw) {
    const skillId = Math.floor(rec.id / 1000);
    if (!rideSkillIds.has(skillId) || !rec.soulCost) continue;
    const level = rec.id % 1000;
    const roleLevel = rec.roleLevel ?? null;
    const costs = Array.isArray(rec.soulCost) ? rec.soulCost : [rec.soulCost];
    for (const c of costs) {
      if (!Array.isArray(c) || c.length < 2) continue;
      rows.push({
        skillId,
        level,
        roleLevel,
        itemId: Number(c[0]),
        count: Number(c[1])
      });
    }
  }

  // 每个(等级, 道具)取众数作为主消耗，异常值进入 specialCases
  const grouped = new Map();
  for (const r of rows) {
    const key = `${r.level}|${r.itemId}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        level: r.level,
        itemId: r.itemId,
        records: []
      });
    }
    grouped.get(key).records.push(r);
  }

  const byItemMap = new Map();
  const specialCases = [];

  for (const g of grouped.values()) {
    const countFreq = new Map();
    const roleLevelFreq = new Map();
    const skillSet = new Set();

    for (const r of g.records) {
      countFreq.set(r.count, (countFreq.get(r.count) || 0) + 1);
      roleLevelFreq.set(r.roleLevel, (roleLevelFreq.get(r.roleLevel) || 0) + 1);
      skillSet.add(r.skillId);
    }

    const modeCount = [...countFreq.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    const modeRoleLevel = [...roleLevelFreq.entries()]
      .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0][0];

    const outliers = g.records.filter(r => r.count !== modeCount);
    for (const o of outliers) {
      specialCases.push({
        skillId: o.skillId,
        level: o.level,
        itemId: o.itemId,
        count: o.count,
        expectedCount: modeCount
      });
    }

    if (!byItemMap.has(g.itemId)) {
      const info = u.itemInfo(g.itemId);
      byItemMap.set(g.itemId, {
        itemId: g.itemId,
        name: info.name,
        type: info.type,
        levels: [],
        skillIds: new Set()
      });
    }

    byItemMap.get(g.itemId).levels.push({
      level: g.level,
      roleLevel: modeRoleLevel,
      count: modeCount,
      sampleCount: g.records.length
    });
    for (const sid of skillSet) byItemMap.get(g.itemId).skillIds.add(sid);
  }

  const byItem = [...byItemMap.values()]
    .map(it => ({
      itemId: it.itemId,
      name: it.name,
      type: it.type,
      skillCount: it.skillIds.size,
      levels: it.levels.sort((a, b) => a.level - b.level)
    }))
    .sort((a, b) => a.itemId - b.itemId);

  specialCases.sort((a, b) =>
    a.level - b.level || a.itemId - b.itemId || a.skillId - b.skillId
  );

  u.saveOutput('ride_skill', {
    byItem,
    specialCases
  }, {
    system: '坐骑 → 技能升级',
    source: 'ride.*.json + skillLevel.*.json',
    costType: 'skillLevel.soulCost（实际主要为骑技要诀/骑技残篇）',
    dedup: '按(等级,道具)取众数；异常值单列 specialCases',
    note: `技能来源 ride.skillActive/skillPassive/skillSp，共${rideSkillIds.size}个技能`
  });
}

// ━━━ 坐骑装备强化 ━━━ rideEquipUpgrade.*.json ━━━━━━
function extractRideEquipUpgrade() {
  const raw = u.loadTable('rideEquipUpgrade');
  const tiers = [];
  let prev = null;
  for (const r of raw) {
    if (!r.cost) continue;
    const key = JSON.stringify(r.cost);
    if (!prev || prev._key !== key) {
      prev = {
        _key: key,
        levelStart: r.level,
        levelEnd: r.level,
        exp: r.exp,
        cost: u.parseCost(r.cost),
        shiftCost: u.parseCost(r.shiftCost)
      };
      tiers.push(prev);
    } else {
      prev.levelEnd = r.level;
      prev.exp = r.exp;
    }
  }
  tiers.forEach(t => delete t._key);
  u.saveOutput('ride_equip_upgrade', tiers, {
    system: '坐骑 → 装备 → 强化',
    source: 'rideEquipUpgrade.*.json',
    costType: '经验条(exp) + 灵魂(cost:[[3, count]])',
    dedup: '同角色装备模式, 按级共享'
  });
}

// ━━━ 坐骑装备打造 ━━━ rideEquipMake.*.json ━━━━━━━━
function extractRideEquipMake() {
  let raw;
  try {
    raw = u.loadTable('rideEquipMake');
  } catch (e) {
    console.log('  ⚠️  rideEquipMake 表未找到, 跳过');
    return;
  }
  const result = raw.filter(r => r.cost && !(r.recast && r.recast.reduction)).map(r => ({
    id: r.id, name: r.name, role: r.role, group: r.group,
    cost: u.parseCost(r.cost),
    costN1: u.parseCost(r.costN1),
    recastReductionId: r.recast && r.recast.reduction ? r.recast.reduction : null,
    recastTargetIds: r.recast && Array.isArray(r.recast.recast) ? r.recast.recast : []
  }));
  u.saveOutput('ride_equip_make', result, {
    system: '坐骑 → 装备 → 打造',
    source: 'rideEquipMake.*.json',
    costType: '道具消耗 cost:[[itemId,count],...] + recast 引用'
  });
}

// ━━━ 坐骑装备神化/重铸 ━━━ rideEquipMake.*.json + rideEquip.*.json ━━━━━━━━
function extractRideEquipRecast() {
  const makeRaw = u.loadTable('rideEquipMake');
  const equipRaw = u.loadTable('rideEquip');
  const equipById = new Map(equipRaw.map(v => [v.id, v]));
  const makeById = new Map(makeRaw.map(v => [v.id, v]));

  const recastRows = makeRaw.filter(r => r.recast && Array.isArray(r.recast.recast) && r.recast.recast.length > 0);
  const grouped = new Map();

  for (const row of recastRows) {
    const sourceEquip = equipById.get(row.id) || {};
    const targetId = row.recast.recast[0];
    const targetEquip = equipById.get(targetId) || {};
    const targetMake = makeById.get(targetId) || {};
    const key = JSON.stringify({
      level: sourceEquip.level ?? null,
      cost: targetMake.cost ?? null,
      targetLevel: targetEquip.level ?? null
    });

    if (!grouped.has(key)) {
      grouped.set(key, {
        sourceLevel: sourceEquip.level ?? null,
        targetLevel: targetEquip.level ?? null,
        cost: u.parseCost((makeRaw.find(v => v.id === targetId) || {}).cost),
        entries: []
      });
    }

    grouped.get(key).entries.push({
      part: sourceEquip.part || null,
      sourceId: row.id,
      sourceName: row.name,
      targetId,
      targetName: targetEquip.name || `未知装备(${targetId})`
    });
  }

  const result = [...grouped.values()]
    .map(group => ({
      sourceLevel: group.sourceLevel,
      targetLevel: group.targetLevel,
      cost: group.cost,
      parts: group.entries.sort((a, b) => String(a.part).localeCompare(String(b.part)))
    }))
    .sort((a, b) => (a.sourceLevel ?? 0) - (b.sourceLevel ?? 0));

  u.saveOutput('ride_equip_recast', result, {
    system: '坐骑 → 装备 → 神化/重铸',
    source: 'rideEquipMake.*.json + rideEquip.*.json',
    costType: 'rideEquipMake.recast.recast + cost',
    dedup: '按源装备等级 + 神化消耗去重，合并四个部位'
  });
}

// ━━━ 骑术升级 ━━━ riding.*.json ━━━━━━━━━━━━━━━━━━━
function extractRiding() {
  const raw = u.loadTable('riding');
  // 按 ridingGroup 分组
  const groups = {};
  for (const r of raw) {
    const g = r.ridingGroup;
    if (!groups[g]) groups[g] = {
      ridingGroup: g, ridingName: r.ridingName, adapt: r.adapt, levels: []
    };
    groups[g].levels.push({
      id: r.id, ridingLevel: r.ridingLevel,
      ridingCost: u.parseCost(r.ridingCost),
      changeCost: u.parseCost(r.changeCost),
      skills: r.skills,
      beskillId: r.beskillId
    });
  }
  for (const g of Object.values(groups)) {
    g.levels.sort((a, b) => a.ridingLevel - b.ridingLevel);
  }
  u.saveOutput('ride_riding', Object.values(groups), {
    system: '坐骑 → 骑术升级',
    source: 'riding.*.json',
    costType: '专属骑术道具 ridingCost:[[710011~, count]] (每级不同道具, 各1个)',
    dedup: '按 ridingGroup 分组'
  });
}

// ━━━ 坐骑装备洗练 ━━━ luckBaptism (type相关) ━━━━━━━
function extractRideBaptism() {
  const raw = u.loadTable('luckBaptism');
  const rideTypes = raw.filter(r =>
    r.type && (r.type.includes('ride') || r.type === 'rideEquip')
  );
  if (rideTypes.length > 0) {
    const result = rideTypes.map(r => ({
      id: r.id, type: r.type, typeGroup: r.typeGroup,
      typeValue: r.typeValue, lockNum: r.lockNum,
      luckCoin: u.parseCost(r.luckCoin)
    }));
    u.saveOutput('ride_equip_baptism', result, {
      system: '坐骑 → 装备 → 洗练',
      source: 'luckBaptism.*.json (type含ride)',
      costType: '强运币 luckCoin'
    });
  } else {
    console.log('  ⚠️  luckBaptism 中无坐骑装备类型, 跳过');
  }
}

function removeObsoleteRideOutputs() {
  for (const name of ['ride_mastery.json', 'ride_riding.json']) {
    const fp = path.join(u.OUTPUT_DIR, name);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
}

function extract() {
  console.log('\n📦 坐骑系统');
  extractRideStar();
  extractRideSkill();
  extractRideEquipUpgrade();
  extractRideEquipMake();
  extractRideEquipRecast();
  extractRideBaptism();
  removeObsoleteRideOutputs();
}

if (require.main === module) extract();
module.exports = extract;
