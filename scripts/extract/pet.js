/**
 * 宠物系统
 * 提取叶子: 潜能升级, 技能升级, 装备强化, 装备重铸, 升星
 * 注: 天赋(petCharacter)和主动技能无直接消耗字段
 */
const u = require('../lib/utils');

// ━━━ 宠物潜能 ━━━ petPotential.*.json ━━━━━━━━━━━━━━
function extractPotential() {
  const raw = u.loadTable('petPotential');
  // 24种潜能, 所有种类同级消耗完全相同
  // 分离: 正常等级(1~23) vs 满级附加(level=null)
  const normalRecords = raw.filter(r => r.level !== null);
  const maxRecords = raw.filter(r => r.level === null);

  // 去重: 正常等级
  const byLevel = {};
  for (const r of normalRecords) {
    if (!byLevel[r.level]) {
      byLevel[r.level] = {
        level: r.level,
        upgradeCost: u.parseCost(r.upgradeCost),
        potentialCount: 0
      };
    }
    byLevel[r.level].potentialCount++;
  }
  const levels = Object.values(byLevel).sort((a, b) => a.level - b.level);

  // 满级附加记录 (level=null, 高属性值, 每种潜能7条)
  const maxLevelSample = maxRecords.length > 0 ? {
    count: maxRecords.length,
    costPerRecord: u.parseCost(maxRecords[0].upgradeCost),
    note: `每种潜能${maxRecords.length / 24}条满级附加记录`
  } : null;

  const potentialTypes = [...new Set(raw.map(r => r.potentialId))];

  u.saveOutput('pet_potential', {
    sharedCostByLevel: levels,
    maxLevelBonus: maxLevelSample,
    totalPotentialTypes: potentialTypes.length,
    note: '所有潜能种类同级消耗完全相同, 仅需展示1~23级消耗序列'
  }, {
    system: '宠物 → 技能 → 潜能升级',
    source: 'petPotential.*.json',
    costType: '潜能残页·宠 upgradeCost:[[11302, count]]',
    dedup: `24种潜能共享同一消耗序列, ${levels.length}个正常等级 + ${maxRecords.length}条满级附加`
  });
}

// ━━━ 宠物技能升级 ━━━ pet.*.json + skillLevel.*.json ━
// 来源链路:
//  - pet.*.json: skillActive/skillPassive/skillSp
//  - skillLevel.*.json: soulCost (实际为宠技要诀等升级道具)
function extractPetSkill() {
  const petRaw = u.loadTable('pet');
  const skillLevelRaw = u.loadTable('skillLevel');

  const petSkillIds = new Set();
  for (const p of petRaw) {
    for (const k of ['skillActive', 'skillPassive', 'skillSp']) {
      const arr = p[k] || [];
      for (const sid of arr) {
        if (sid) petSkillIds.add(Number(sid));
      }
    }
  }

  const rows = [];
  for (const rec of skillLevelRaw) {
    const skillId = Math.floor(rec.id / 1000);
    if (!petSkillIds.has(skillId) || !rec.soulCost) continue;
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

  const levelMap = new Map();
  const specialCases = [];
  const itemSkillIds = new Map();

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

    if (!levelMap.has(g.level)) {
      levelMap.set(g.level, {
        level: g.level,
        roleLevel: modeRoleLevel,
        upgradeCost: []
      });
    }

    levelMap.get(g.level).upgradeCost.push({
      itemId: g.itemId,
      name: u.itemName(g.itemId),
      count: modeCount,
      sampleCount: g.records.length
    });

    if (!itemSkillIds.has(g.itemId)) itemSkillIds.set(g.itemId, new Set());
    for (const sid of skillSet) itemSkillIds.get(g.itemId).add(sid);
  }

  const levels = [...levelMap.values()]
    .map(l => ({
      ...l,
      upgradeCost: l.upgradeCost.sort((a, b) => a.itemId - b.itemId)
    }))
    .sort((a, b) => a.level - b.level);

  const byItem = [...itemSkillIds.entries()]
    .map(([itemId, set]) => ({
      itemId: Number(itemId),
      name: u.itemName(Number(itemId)),
      skillCount: set.size
    }))
    .sort((a, b) => a.itemId - b.itemId);

  specialCases.sort((a, b) =>
    a.level - b.level || a.itemId - b.itemId || a.skillId - b.skillId
  );

  u.saveOutput('pet_skill', {
    levels,
    byItem,
    specialCases
  }, {
    system: '宠物 → 技能升级',
    source: 'pet.*.json + skillLevel.*.json',
    costType: 'skillLevel.soulCost（实际主要为宠技要诀）',
    dedup: '按(等级,道具)取众数；异常值单列 specialCases',
    note: `技能来源 pet.skillActive/skillPassive/skillSp，共${petSkillIds.size}个技能`
  });
}

// ━━━ 宠物装备强化 ━━━ petEquipUpgrade.*.json ━━━━━━━
function extractPetEquipUpgrade() {
  const raw = u.loadTable('petEquipUpgrade');
  // 与角色装备强化结构相同: exp + cost + shiftCost
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
      prev.exp = r.exp; // 用多数值
    }
  }
  tiers.forEach(t => delete t._key);
  u.saveOutput('pet_equip_upgrade', tiers, {
    system: '宠物 → 装备 → 强化',
    source: 'petEquipUpgrade.*.json',
    costType: '经验条(exp) + 灵魂(cost:[[3, count]])',
    dedup: '同角色装备模式, 按级共享, 每段cost相同'
  });
}

// ━━━ 宠物装备重铸/升重 ━━━ petEquipMake.*.json ━━━━━
function extractPetEquipMake() {
  let raw;
  let petEquip;
  try {
    raw = u.loadTable('petEquipMake');
  } catch (e) {
    console.log('  ⚠️  petEquipMake 表未找到, 跳过');
    return;
  }
  try {
    petEquip = u.loadTable('petEquip');
  } catch (e) {
    console.log('  ⚠️  petEquip 表未找到, 仅导出重铸消耗');
    petEquip = [];
  }

  const equipById = new Map(petEquip.map(e => [e.id, e]));
  function parseInjectCost(inject) {
    if (!Array.isArray(inject)) return null;
    return inject.map(it => ({
      toAffixLevel: it[0],
      cost: u.parseCost(it[1])
    }));
  }

  const result = raw.filter(r => r.cost).map(r => {
    const eq = equipById.get(r.id);
    const recastUpgrade = parseInjectCost(eq && eq.affixInjectCost);
    return {
      id: r.id,
      name: r.name,
      role: r.role,
      group: r.group,
      groupName: r.groupName,
      part: eq ? eq.part : null,
      level: eq ? eq.level : null,
      cost: u.parseCost(r.cost),
      costN1: u.parseCost(r.costN1),
      recastUpgrade,
      recast0To1Cost: recastUpgrade && recastUpgrade.length > 0 ? recastUpgrade[0].cost : null
    };
  });
  u.saveOutput('pet_equip_make', result, {
    system: '宠物 → 装备 → 重铸/升重',
    source: 'petEquipMake.*.json + petEquip.*.json(affixInjectCost)',
    costType: '道具消耗 cost/costN1 + 升重'
  });
}
function extractPetStar() {
  let raw;
  try {
    raw = u.loadTable('petStar');
  } catch (e) {
    try {
      raw = u.loadTable('pet');
    } catch (e2) {
      console.log('  ⚠️  宠物升星表未找到, 跳过');
      return;
    }
  }

  const groups = {};
  for (const p of raw) {
    if (!p.starCost && !p.rankCost) continue;

    let type = '未知';
    if (p.label === 'lingshou') type = '\u7075\u517d';
    else if (p.label === 'xianshou') type = '\u4ed9\u517d';
    else if (p.label === 'shenshou') type = '\u795e\u517d';
    if (type === '未知' && p.starCost) {
      const sCost = u.parseCost(p.starCost);
      if (sCost && sCost[0] && sCost[0].name) {
        if (sCost[0].name.includes('灵兽')) type = '灵兽';
        else if (sCost[0].name.includes('仙兽')) type = '仙兽';
        else if (sCost[0].name.includes('神兽')) type = '神兽';
      }
    }
    // 如果没有starCost，通过rankCost猜测
    if (type === '未知' && p.rankCost) {
      const rCost = u.parseCost(p.rankCost);
      if (rCost && rCost[0] && rCost[0].name) {
        if (rCost[0].name.includes('神兽') || rCost[0].name.includes('玄武') || rCost[0].name.includes('白虎') || rCost[0].name.includes('青龙') || rCost[0].name.includes('朱雀')) type = '神兽';
        else if (rCost[0].name.includes('仙兽') || rCost[0].name.includes('天马') || rCost[0].name.includes('玄猫') || rCost[0].name.includes('仙灵')) type = '仙兽';
        else type = '灵兽';
      }
    }

    if (type === '未知') continue;

    if (!groups[type]) {
      groups[type] = {
        type: type,
        pets: new Set(),
        starCost: null,
        rank0To1: null,
        rank1To2: null
      };
    }

    groups[type].pets.add(p.name);

    if (p.starCost && !groups[type].starCost) {
      groups[type].starCost = u.parseCost(p.starCost);
    }
    if (p.rank === 0 && p.rankCost && !groups[type].rank0To1) {
      groups[type].rank0To1 = u.parseCost(p.rankCost);
    }
    if (p.rank === 1 && p.rankCost && !groups[type].rank1To2) {
      groups[type].rank1To2 = { note: `各类专属幻心石 (示例: ${u.parseCost(p.rankCost)[0].name})`, count: 1 };
    }
  }

  const result = Object.values(groups).map(g => ({
    type: g.type,
    pets: [...g.pets],
    rankCost0To1: g.rank0To1,
    rankCost1To2: g.rank1To2,
    starCost: g.starCost
  }));

  if (result.length > 0) {
    u.saveOutput('pet_star', result, {
      system: '宠物 → 升星与进阶',
      source: 'pet.*.json',
      costType: '按灵/仙/神兽分组的消耗',
      dedup: '合并了同品质宠物的消耗数据，减少了大量重复'
    });
  } else {
    console.log('  ⚠️  宠物升星: 未找到有消耗字段的记录');
  }
}

// ━━━ 宠物配对/系统升星 ━━━ pet.*.json (matingCost/matingQuality) ━
function extractPetMating() {
  const raw = u.loadTable('pet');
  const petById = new Map(raw.map(p => [p.id, p]));
  const costItem = u.itemInfo(11503);

  const labelNameMap = {
    lingshou: '灵兽',
    xianshou: '仙兽',
    shenshou: '神兽'
  };

  const grouped = new Map();
  for (const p of raw) {
    if (!Array.isArray(p.matingCost) || !p.matingCost.some(v => Array.isArray(v) && v.length > 0)) continue;

    const partnerIds = (p.starPet || [])
      .map(v => Array.isArray(v) ? Number(v[0]) : Number(v))
      .filter(Boolean);

    const partnerPets = partnerIds.map(id => {
      const pet = petById.get(id);
      return { id, name: pet ? pet.name : `UnknownPet(${id})` };
    });

    const groupKey = p.label || 'unknown';
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        type: labelNameMap[groupKey] || groupKey,
        rawLabel: groupKey,
        petNames: [],
        partnerPets: [],
        configs: new Map()
      });
    }

    const group = grouped.get(groupKey);
    group.petNames.push(p.name);
    for (const partner of partnerPets) {
      if (!group.partnerPets.some(v => v.id === partner.id)) group.partnerPets.push(partner);
    }

    const configKey = JSON.stringify({
      matingCost: p.matingCost,
      matingQuality: p.matingQuality || null,
      matingTalent: p.matingTalent || null
    });

    if (!group.configs.has(configKey)) {
      group.configs.set(configKey, {
        petIds: [],
        petNames: [],
        systemOptions: p.matingCost.map((costByStar, index) => ({
          option: index + 1,
          qualityRate: Array.isArray(p.matingQuality) ? (p.matingQuality[index] ?? null) : null,
          talentRate: Array.isArray(p.matingTalent) ? (p.matingTalent[index] ?? null) : null,
          costItem,
          costByStar: (costByStar || []).map((count, starIndex) => ({
            star: starIndex + 1,
            count
          }))
        }))
      });
    }

    const config = group.configs.get(configKey);
    config.petIds.push(p.id);
    config.petNames.push(p.name);
  }

  const order = { lingshou: 1, xianshou: 2, shenshou: 3 };
  const result = [...grouped.values()]
    .map(group => ({
      type: group.type,
      rawLabel: group.rawLabel,
      petCount: group.petNames.length,
      petNames: group.petNames.sort((a, b) => a.localeCompare(b, 'zh-CN')),
      partnerPets: group.partnerPets.sort((a, b) => a.id - b.id),
      uniqueConfigCount: group.configs.size,
      configs: [...group.configs.values()].map(cfg => ({
        petCount: cfg.petNames.length,
        petIds: cfg.petIds.sort((a, b) => a - b),
        petNames: cfg.petNames.sort((a, b) => a.localeCompare(b, 'zh-CN')),
        systemOptions: cfg.systemOptions
      }))
    }))
    .sort((a, b) => (order[a.rawLabel] || 99) - (order[b.rawLabel] || 99));

  u.saveOutput('pet_mating', {
    costItem,
    groups: result
  }, {
    system: '宠物 → 配对升星（系统配对）',
    source: 'pet.*.json',
    costType: 'pet.matingCost（系统配对额外消耗道具）',
    dedup: '按灵兽 / 仙兽 / 神兽分组；组内按 matingCost + matingQuality + matingTalent 去重',
    note: '系统配对固定消耗 itemId=11503（公冶香包），具体数量按宠物配置的 matingCost[档位][星级] 读取'
  });
}

function extractPetBaptism() {
  const raw = u.loadTable('luckBaptism');
  const petTypes = raw.filter(r =>
    r.type && (r.type.includes('pet') || r.type === 'petEquip')
  );
  if (petTypes.length > 0) {
    const result = petTypes.map(r => ({
      id: r.id, type: r.type, typeGroup: r.typeGroup,
      typeValue: r.typeValue, lockNum: r.lockNum,
      luckCoin: u.parseCost(r.luckCoin)
    }));
    u.saveOutput('pet_equip_baptism', result, {
      system: '宠物 → 装备 → 洗练',
      source: 'luckBaptism.*.json (type含pet)',
      costType: '强运币 luckCoin'
    });
  } else {
    console.log('  ⚠️  luckBaptism 中无宠物装备类型, 跳过');
  }
}

function extract() {
  console.log('\n📦 宠物系统');
  extractPotential();
  extractPetSkill();
  extractPetEquipUpgrade();
  extractPetEquipMake();
  extractPetStar();
  extractPetMating();
  extractPetBaptism();
}

if (require.main === module) extract();
module.exports = extract;
