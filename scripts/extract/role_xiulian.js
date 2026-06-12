/**
 * 角色 → 修炼系统
 * 提取叶子: 修心(经脉), 修心(六维), 丹气气力, 丹元升级, 炼体(仙魄), 外丹(心脉+丹魂)
 */
const u = require('../lib/utils');
const extractDanyuanEffect = require('./role_danyuan_effect');

// ━━━ 修心(经脉) ━━━ meridians.*.json ━━━━━━━━━━━━━━━━
function extractMeridians() {
  const raw = u.loadTable('meridians');
  const result = raw.map(r => ({
    id: r.id, type: r.type, rank: r.rank,
    openLv: r.openLv, upRankLv: r.upRankLv, upLevelLv: r.upLevelLv,
    // impactMeridians[0]=冲击道具id列表, [1]=消耗数量范围
    impactMeridians: r.impactMeridians ? {
      items: r.impactMeridians[0],
      costRanges: r.impactMeridians[1]
    } : null,
    activateMeridians: r.activateMeridians ? {
      items: r.activateMeridians[0],
      probabilities: r.activateMeridians[1]
    } : null
  }));
  u.saveOutput('role_meridians', result, {
    system: '角色 → 修炼系统 → 修心(经脉)',
    source: 'meridians.*.json + meridiansAttribute.*.json',
    costType: '经验条机制, 概率冲击升级, 消耗在 impactMeridians 字段',
    dedup: '按 type(经脉种类) × rank(阶) 分组'
  });
}

// ━━━ 修心(六维) ━━━ heart.*.json ━━━━━━━━━━━━━━━━━━━━
function extractHeart() {
  const raw = u.loadTable('heart');
  const result = raw.map(r => ({
    id: r.id,
    level: r.level,
    roleLevelRequired: r.limit,
    soulCost: u.parseCost([3, r.soulCost]),
    hp: r.hp,
    mp: r.mp,
    atk: r.atk,
    def: r.def,
    healHp: r.healHp,
    healMp: r.healMp
  }));
  u.saveOutput('role_heart', result, {
    system: '角色 → 修炼系统 → 修心(热血/智慧/勇武/坚韧/恒心/禅定)',
    source: 'heart.*.json',
    costType: '每级消耗 soulCost(灵魂) + 角色等级限制 limit',
    dedup: '统一等级曲线, 六项属性同级同步提升'
  });
}

// ━━━ 丹气 ━━━ danqi.*.json ━━━━━━━━━━━━━━━━━━━━━━━━━━
function extractDanqi() {
  const raw = u.loadTable('danqi');
  const groups = {};
  for (const r of raw) {
    const key = `${r.group}_${r.type}`;
    if (!groups[key]) {
      groups[key] = { group: r.group, type: r.type, levels: [] };
    }
    groups[key].levels.push({
      level: r.level, name: r.name,
      attribute: r.attribute,
      attributeValue: r.attributeValue,
      refineCost: u.parseCost(r.refineCost),
      refineUp: r.refineUp,
      refineUpBase: r.refineUpBase
    });
  }
  u.saveOutput('role_danqi', Object.values(groups), {
    system: '角色 → 修炼系统 → 内丹 → 丹气气力',
    source: 'danqi.*.json',
    costType: '精炼消耗 refineCost:[[3, 灵魂数]]',
    dedup: '按 group(种类) × type(yin/yang) 分组'
  });
}

// ━━━ 丹元 ━━━ danyuan.*.json ━━━━━━━━━━━━━━━━━━━━━━━━
function extractDanyuan() {
  const raw = u.loadTable('danyuan');
  // 按品质汇总材料曲线（忽略丹元种类）
  const qualitySummary = {};
  const core = raw.filter(r => r.type > 1);
  for (const r of core) {
    const quality = r.type % 10; // 3/4/5/6
    if (!qualitySummary[quality]) {
      qualitySummary[quality] = {
        quality,
        sampleTypes: new Set(),
        sampleGroups: new Set(),
        levelCurveMap: new Map()
      };
    }
    const g = qualitySummary[quality];
    g.sampleTypes.add(r.type);
    g.sampleGroups.add(r.group);

    if (!g.levelCurveMap.has(r.level)) {
      g.levelCurveMap.set(r.level, {
        level: r.level,
        levelUpNeed: r.levelUpNeed,
        provideExp: r.provideExp,
        upQualityCost: u.parseCost(r.upQualityCost)
      });
    }
  }

  const costByQuality = Object.values(qualitySummary)
    .map(g => ({
      quality: g.quality,
      sampleTypes: [...g.sampleTypes].sort((a, b) => a - b).slice(0, 10),
      sampleGroups: [...g.sampleGroups].sort((a, b) => a - b),
      levels: [...g.levelCurveMap.values()]
        .sort((a, b) => a.level - b.level)
        .filter(l => !(l.levelUpNeed == null && l.provideExp == null && l.upQualityCost == null))
    }))
    .sort((a, b) => a.quality - b.quality);

  u.saveOutput('role_danyuan', costByQuality, {
    system: '角色 → 修炼系统 → 内丹 → 丹元升级(按品质汇总)',
    source: 'danyuan.*.json',
    costType: '按品质汇总 levelUpNeed/provideExp/upQualityCost',
    dedup: '忽略丹元种类(type前缀)与阵营(group), 仅保留品质曲线(type%10)'
  });

  extractDanyuanEffect(raw);
}

// ━━━ 炼体(仙魄) ━━━ xianpo.*.json ━━━━━━━━━━━━━━━━━━━
function extractXianpo() {
  const raw = u.loadTable('xianpo');
  const qualityNames = {
    1: '绿',
    2: '蓝',
    3: '紫',
    4: '金',
    5: '红'
  };

  const roleLevelCurve = [];
  const roleLevelMap = new Map();
  for (const row of raw) {
    if (!roleLevelMap.has(row.level)) {
      roleLevelMap.set(row.level, row.roleLevel);
      roleLevelCurve.push({ level: row.level, roleLevel: row.roleLevel });
    }
  }
  roleLevelCurve.sort((a, b) => a.level - b.level);

  const qualities = [];
  const qualityMap = new Map();
  for (const row of raw) {
    const quality = row.xianpoId % 10;
    if (!qualityMap.has(quality)) {
      qualityMap.set(quality, row.upLevelExp);
      qualities.push({
        quality,
        qualityName: qualityNames[quality] || `品质${quality}`,
        upLevelExp: row.upLevelExp
      });
    }
  }
  qualities.sort((a, b) => a.quality - b.quality);

  const typeMap = new Map();
  for (const row of raw) {
    const quality = row.xianpoId % 10;
    const qualityKey = `${row.type}_${quality}`;
    const baseName = row.name.split('仙魄')[0];
    const attribute = Array.isArray(row.attribute) ? row.attribute[0] : row.attribute;
    const attributeValue = Array.isArray(row.attributeValue) ? row.attributeValue[0] : row.attributeValue;

    if (!typeMap.has(row.type)) {
      typeMap.set(row.type, {
        type: row.type,
        typeName: baseName,
        attribute,
        qualityLevelsMap: new Map()
      });
    }

    const typeNode = typeMap.get(row.type);
    if (!typeNode.qualityLevelsMap.has(qualityKey)) {
      typeNode.qualityLevelsMap.set(qualityKey, {
        quality,
        xianpoId: row.xianpoId,
        name: row.name,
        levels: []
      });
    }

    typeNode.qualityLevelsMap.get(qualityKey).levels.push({
      level: row.level,
      attributeValue,
      provideExp: row.provideExp
    });
  }

  const types = [...typeMap.values()]
    .map(typeNode => ({
      type: typeNode.type,
      typeName: typeNode.typeName,
      attribute: typeNode.attribute,
      qualityLevels: [...typeNode.qualityLevelsMap.values()]
        .map(qualityNode => ({
          ...qualityNode,
          levels: qualityNode.levels.sort((a, b) => a.level - b.level)
        }))
        .sort((a, b) => a.quality - b.quality)
    }))
    .sort((a, b) => a.type - b.type);

  u.saveOutput('role_xianpo', {
    roleLevelCurve,
    qualities,
    types
  }, {
    system: '角色 → 修炼系统 → 炼体(仙魄)',
    source: 'xianpo.*.json',
    costType: '品质固定升级经验 upLevelExp + 等级提供经验 provideExp',
    dedup: '按 type(6属性位) × quality(5品质) 分组, 公共 roleLevel 曲线单独抽取'
  });
}

// ━━━ 炼体 ━━━ meridiansSpecialPlant/Pill.*.json ━━━━━
function extractLianti() {
  let plants = [], pills = [];
  try { plants = u.loadTable('meridiansSpecialPlant'); } catch (e) {}
  try { pills = u.loadTable('meridiansSpecialPill'); } catch (e) {}
  u.saveOutput('role_lianti', { plants, pills }, {
    system: '角色 → 修炼系统 → 炼体(期望瓶子数)',
    source: 'meridiansSpecialPlant.*.json + meridiansSpecialPill.*.json',
    costType: '概率提升机制, 使用瓶子道具',
    note: '原始数据直出, 概率计算需结合客户端逻辑'
  });
}

// ━━━ 外丹(心脉+丹魂) ━━━ meridiansSpecial.*.json ━━━━
function extractWaidan() {
  const raw = u.loadTable('meridiansSpecial');
  const result = raw.map(r => ({
    id: r.id,
    unLock: r.unLock,
    close: r.close
  }));
  u.saveOutput('role_waidan', result, {
    system: '角色 → 修炼系统 → 外丹(心脉/丹魂)',
    source: 'meridiansSpecial.*.json',
    costType: '按等级解锁条件 unLock',
    dedup: '每条记录一个解锁等级'
  });
}

function extract() {
  console.log('\n📦 角色 → 修炼系统');
  extractMeridians();
  extractHeart();
  extractDanqi();
  extractDanyuan();
  extractXianpo();
  extractLianti();
  extractWaidan();
}

if (require.main === module) extract();
module.exports = extract;
