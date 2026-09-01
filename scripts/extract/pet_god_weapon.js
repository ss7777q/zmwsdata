/**
 * 宠物神器系统数据提取脚本
 * 严格遵循 maxLevel 限制与 close 限制
 * 来源: data/runtime/main-index.js (内嵌表) + dataApi (item, consts, beskill, buff, vip)
 * 输出: output/pet_god_weapon.json
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const u = require('../lib/utils');

const ROOT = path.resolve(__dirname, '..', '..');
const RUNTIME_MAIN = path.join(ROOT, 'data', 'runtime', 'main-index.js');

function getConfiguredMaxLevel() {
  try {
    const { DEFAULT_SETTINGS, loadAppSettings } = require('../../server/app-config');
    const settings = loadAppSettings();
    const value = Number(settings.data?.maxLevel);
    return Number.isInteger(value) && value >= 0 ? value : (DEFAULT_SETTINGS?.data?.maxLevel ?? 235);
  } catch (e) {
    return 235;
  }
}

function extractBracketLiteral(text, startIndex, label) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const ch = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '[') depth += 1;
    if (ch === ']') {
      depth -= 1;
      if (depth === 0) return text.slice(startIndex, index + 1);
    }
  }
  throw new Error(`${label} 数组字面量未闭合`);
}

function extractEmbeddedTable(runtimeCode, tableName) {
  const moduleRe = new RegExp(`(?:^|[,{])\\s*${tableName}\\s*:\\s*\\[function\\s*\\([^)]*\\)\\s*\\{`, 'g');
  const moduleMatch = moduleRe.exec(runtimeCode);
  if (!moduleMatch) return null;

  const moduleStart = moduleMatch.index;
  const varRe = /\bvar\s+([A-Za-z_$][\w$]*)\s*=\s*\[/g;
  varRe.lastIndex = moduleStart;
  const varMatch = varRe.exec(runtimeCode);
  if (!varMatch) return null;

  const arrayStart = varRe.lastIndex - 1;
  const literal = extractBracketLiteral(runtimeCode, arrayStart, tableName);
  const matrix = vm.runInNewContext(literal, Object.create(null), { timeout: 5000 });
  if (!Array.isArray(matrix) || !Array.isArray(matrix[0])) return null;

  const headers = matrix[0];
  return matrix.slice(1).map(row => {
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      if (headers[i]) obj[headers[i]] = row[i];
    }
    return obj;
  });
}

function extract() {
  if (!fs.existsSync(RUNTIME_MAIN)) {
    throw new Error(`找不到运行时主程序文件: ${RUNTIME_MAIN}`);
  }
  const runtimeCode = fs.readFileSync(RUNTIME_MAIN, 'utf8');
  const maxLevel = getConfiguredMaxLevel();

  // 1. 加载内嵌表
  const rawWeapons = extractEmbeddedTable(runtimeCode, 'petGodWeapon') || [];
  const rawLevels = extractEmbeddedTable(runtimeCode, 'petGodWeaponLevel') || [];
  const rawStars = extractEmbeddedTable(runtimeCode, 'petGodWeaponStar') || [];
  const rawForges = extractEmbeddedTable(runtimeCode, 'petGodWeaponForge') || [];
  const rawEnchants = extractEmbeddedTable(runtimeCode, 'petGodWeaponEnchant') || [];
  const rawFights = extractEmbeddedTable(runtimeCode, 'PetQingQiuFight') || [];

  // 2. 加载普通 dataApi 表
  const beskillTable = u.loadTable('beskill');
  const beskillMap = new Map(beskillTable.map(r => [r.id, r]));
  const constsTable = u.loadTable('consts');
  const petTable = u.loadTable('pet');
  const vipTable = u.loadTable('vip');
  const itemTable = u.loadTable('item');
  const itemMap = new Map(itemTable.map(r => [r.id, r]));

  // 宠物品系名称映射 (idGroup)
  const petGroupNameMap = new Map();
  for (const p of petTable) {
    if (p.idGroup && !petGroupNameMap.has(p.idGroup)) {
      const groupPets = petTable.filter(x => x.idGroup === p.idGroup).map(x => x.name);
      petGroupNameMap.set(p.idGroup, groupPets);
    }
  }

  // ━━━━━━━━ 1. 神器图鉴与基础定义（受 closeShow / close 限制） ━━━━━━━━
  const qualityNames = { 0: '负面', 1: '普通', 2: '优秀', 3: '精良', 4: '史诗', 5: '传说', 6: '先天专属' };
  const restrictTypeLabels = {
    1: '全宠物通用',
    2: '仅仙兽/神兽/圣兽穿戴',
    3: '专属品级限定',
  };

  const weapons = rawWeapons.map(w => {
    const petIdGroup = Array.isArray(w.restrictPet) ? w.restrictPet[0] : w.restrictPet;
    const groupPets = petIdGroup ? petGroupNameMap.get(petIdGroup) || [] : [];
    const isClosed = w.close === 1 || w.closeShow === 1;
    const isOnline = !isClosed && (w.quality || 1) <= 3;
    const exclusiveLabel = groupPets.length > 0 ? `限定【${groupPets.join(' / ')}】穿戴` : '全宠物通用';

    return {
      id: w.id,
      name: w.name,
      quality: w.quality,
      qualityLabel: qualityNames[w.quality] || `品质${w.quality}`,
      power: w.power || 0,
      close: w.close === 1 ? 1 : 0,
      closeShow: w.closeShow === 1,
      isOnline,
      restrictType: w.restrictType,
      restrictLabel: w.restrictPet ? exclusiveLabel : (restrictTypeLabels[w.restrictType] || '全宠物通用'),
      restrictPet: w.restrictPet || null,
      exclusivePetChain: groupPets,
      enchantMax: w.enchantMax || 0,
      enchantGroup: Array.isArray(w.enchantGroup) ? w.enchantGroup : [],
      resultantCost: u.parseCost(w.resultantCost),
      note: isOnline ? '当前正式服已开放' : '受到 closeShow 限制（暂未开放）'
    };
  });

  // ━━━━━━━━ 2. 属性转换规则与公式 ━━━━━━━━
  const attrConversion = {
    description: '宠物神器的四维资质（力量、敏捷、体质、幸运）乘以固定换算系数与成长乘数，直接转化为宠物的 10 大战斗属性（向上取整）。',
    growthFactorFormula: '成长乘数 = 成长值 / 10000',
    primaryAttributes: [
      { attr: 'atk', name: '攻击', sourceAptitude: '力量资质 (strVal)', factor: 0.63, formula: '⌈力量资质 × 0.63 × (成长值 / 10000)⌉' },
      { attr: 'def', name: '防御', sourceAptitude: '敏捷资质 (dexVal)', factor: 0.21, formula: '⌈敏捷资质 × 0.21 × (成长值 / 10000)⌉' },
      { attr: 'hp', name: '生命', sourceAptitude: '体质资质 (vitVal)', factor: 12.6, formula: '⌈体质资质 × 12.6 × (成长值 / 10000)⌉' },
      { attr: 'healHp', name: '治疗/回血', sourceAptitude: '幸运资质 (luckVal)', factor: 0.70, formula: '⌈幸运资质 × 0.70 × (成长值 / 10000)⌉' },
    ],
    compositeAttributes: [
      { attr: 'hitVal', name: '命中', sourceAptitudes: ['力量', '敏捷'], factor: 0.495, formula: '⌈(力量 + 敏捷) × 0.495 × (成长值 / 10000)⌉' },
      { attr: 'crit', name: '暴击', sourceAptitudes: ['力量', '敏捷'], factor: 0.495, formula: '⌈(力量 + 敏捷) × 0.495 × (成长值 / 10000)⌉' },
      { attr: 'lucky', name: '幸运', sourceAptitudes: ['力量', '幸运'], factor: 0.495, formula: '⌈(力量 + 幸运) × 0.495 × (成长值 / 10000)⌉' },
      { attr: 'dodge', name: '闪避', sourceAptitudes: ['体质', '敏捷'], factor: 0.495, formula: '⌈(体质 + 敏捷) × 0.495 × (成长值 / 10000)⌉' },
      { attr: 'tenacity', name: '韧性', sourceAptitudes: ['体质', '幸运'], factor: 0.495, formula: '⌈(体质 + 幸运) × 0.495 × (成长值 / 10000)⌉' },
      { attr: 'guardian', name: '守护', sourceAptitudes: ['体质', '幸运'], factor: 0.495, formula: '⌈(体质 + 幸运) × 0.495 × (成长值 / 10000)⌉' },
    ]
  };

  // ━━━━━━━━ 3. 等级强化养成（受 close 与 maxLevel 严格限制） ━━━━━━━━
  // 过滤 close === 1 以及等级超过 maxLevel 的行
  const validLevels = rawLevels.filter(r => r.close !== 1 && r.id <= maxLevel);
  const levelTiers = [];
  let curTier = null;
  for (const r of validLevels) {
    const costKey = JSON.stringify(r.cost || []);
    if (!curTier || curTier._costKey !== costKey) {
      curTier = {
        _costKey: costKey,
        levelStart: r.id,
        levelEnd: r.id,
        singleCost: u.parseCost(r.cost),
        strAdd: r.strAdd || 0,
        vitAdd: r.vitAdd || 0,
        luckAdd: r.luckAdd || 0,
        dexAdd: r.dexAdd || 0,
      };
      levelTiers.push(curTier);
    } else {
      curTier.levelEnd = r.id;
    }
  }
  levelTiers.forEach(t => delete t._costKey);

  const levelSummary = {
    configuredMaxLevel: maxLevel,
    firstClosedLevel: rawLevels.find(r => r.close === 1)?.id ?? null,
    actualEffectiveMaxLevel: validLevels.length > 0 ? validLevels[validLevels.length - 1].id : 0,
    totalTiers: levelTiers.length,
    tiers: levelTiers,
    note: `受 close=1（120级起关闭）及系统最高等级 maxLevel=${maxLevel} 限制，当前实际开放强化上限为 ${validLevels.length > 0 ? validLevels[validLevels.length - 1].id : 0} 级。可消耗【青丘符箓】（ID: 80011）无损重置等级并全额返还灵晶。`
  };

  // ━━━━━━━━ 4. 升星进阶养成 (0~4星，受 close 限制) ━━━━━━━━
  const validStars = rawStars.filter(s => s.close !== 1);
  let accumCost = 0;
  const stars = validStars.map((s, idx) => {
    const nextCost = s.starUpCost1 || (idx < validStars.length - 1 ? 1 : 0);
    const costItemCount = idx < validStars.length - 1 ? nextCost : 0;
    const prevAccum = accumCost;
    if (idx < validStars.length - 1) accumCost += nextCost;

    return {
      star: s.id,
      growthMinPer: (s.starGrowth[0] / 100).toFixed(1) + '%',
      growthMaxPer: (s.starGrowth[1] / 100).toFixed(1) + '%',
      starGrowthRaw: s.starGrowth,
      upgradeCostSameGodWeapon: costItemCount,
      accumCostToReach: prevAccum,
      close: s.close === 1 ? 1 : 0,
      note: idx === validStars.length - 1 ? '当前正式服最高星级上限' : `升星消耗同名0星神器 ×${nextCost}`
    };
  });

  // ━━━━━━━━ 5. 打造池与保底灵池（受 close 限制） ━━━━━━━━
  const forgePools = rawForges.map(f => {
    const isClosed = f.close === 1;
    const isOnline = !isClosed;
    const rawCost = f.forgeCost || [];
    const costParsed = u.parseCost(rawCost);
    const freeTiers = (f.freeValue || []).map((val, idx) => {
      const freeInfo = (f.freeForgeId && f.freeForgeId[idx]) || null;
      if (!freeInfo || !freeInfo.forgeId) return null;
      const targetW = weapons.find(w => w.id === freeInfo.forgeId);
      return {
        thresholdEnergy: val,
        rewardGodWeaponId: freeInfo.forgeId,
        rewardGodWeaponName: targetW ? targetW.name : u.itemName(freeInfo.forgeId),
        minQualityPercent: freeInfo.minQuality || 0,
        minGrowthPercent: freeInfo.minGrowth || 0,
        minEnchantCount: Array.isArray(freeInfo.enchantNum) ? freeInfo.enchantNum[0] : (freeInfo.enchantNum || 0)
      };
    }).filter(Boolean);

    return {
      id: f.id,
      name: f.name,
      close: f.close === 1 ? 1 : 0,
      isOnline,
      cost: costParsed,
      freeEnergyTiers: freeTiers,
      forgeReturn: f.forgeReturn ? u.parseCost(f.forgeReturn) : null,
      note: isOnline ? '当前正式服已开放' : '受到 close=1 限制（暂未开放）'
    };
  });

  // ━━━━━━━━ 6. 附魔词条池（受 close / 未实装限制） ━━━━━━━━
  const validEnchants = rawEnchants
    .filter(e => e.close !== 1 && e.skillId && e.skillId.length > 0)
    .map(e => {
      const skillRec = beskillMap.get(e.skillId[0]) || null;
      const computedQuality = e.quality != null ? e.quality : 1;

      return {
        id: e.id,
        name: e.name,
        quality: computedQuality,
        qualityLabel: qualityNames[computedQuality] || `品质${computedQuality}`,
        group: e.group != null ? e.group : 1,
        repelGroup: e.repelGroup || 0,
        skillId: e.skillId || [],
        skillName: skillRec ? skillRec.name : e.name,
        skillText: skillRec ? skillRec.text : '',
      };
    });

  const enchantRules = {
    officialReplaceRates: [
      { currentCount: 1, replaceRate: '80%', addRate: '20%', resultDesc: '80% 概率顶替旧词条；20% 概率共存并开启第 2 条' },
      { currentCount: 2, replaceRate: '90%', addRate: '10%', resultDesc: '90% 概率顶替 1 个旧词条；10% 概率共存并开启第 3 条' },
      { currentCount: '≥ 3', replaceRate: '100%', addRate: '0%', resultDesc: '100% 随机顶替 1 个已有的旧词条' }
    ],
    repelRule: '若打入的新附魔与已有附魔属于同一互斥组（repelGroup），则旧冲突词条必定直接被移除。',
    capacityRule: '【大荒石】承载上限 1 条，【天渊玉】承载上限 2 条，【清流泪】承载上限 3 条。'
  };

  // ━━━━━━━━ 7. 神器灵炼遗传机制 ━━━━━━━━
  const const205 = constsTable.find(c => c.id === 205)?.value || {};
  const resultantValue = const205.resultantValue || {};
  const synthesisRules = {
    costItemName: '青丘金水（根据神器品质消耗对应阶次金水，例如清流泪消耗【青丘金水·精良】×1）',
    baseRequirement: '两件同名 0 星神器进行灵炼。灵炼后原两件神器转为锁灵状态（不可再次灵炼，不可仙坊交易）。',
    aptitudeInheritance: {
      minRate: '70%',
      maxRate: '110%',
      desc: '新神器四维资质取双亲对应资质平均值的 70% ~ 110% 浮动。'
    },
    growthInheritance: {
      minRate: '96%',
      maxRate: '102%',
      desc: '新神器成长值取双亲成长平均值的 96% ~ 102% 浮动。'
    },
    enchantInheritance: {
      independentRate: '35%',
      desc: '取出灵炼双亲的所有附魔词条，逐一以 35% 独立概率判定是否继承；若继承词条存在互斥组冲突，随机剔除 1 条；若总数超过新神器承载上限，随机缩减至上限。'
    }
  };

  // ━━━━━━━━ 8. 青丘奇旅关卡与产出（受 maxLevel 与 close 限制） ━━━━━━━━
  const const206 = constsTable.find(c => c.id === 206)?.value || {};
  const vipFasts = vipTable.map(v => ({
    vipLevel: v.id,
    weeklyFastCount: v.fastQingQiu || 0
  }));

  const validFights = rawFights.filter(f => f.close !== 1 && (f.bossLevel || 0) <= maxLevel);
  const qingqiuStages = validFights.map(f => {
    const dropShowParsed = (f.dropShow || []).map(entry => {
      const itemId = entry[0];
      const min = entry[1];
      const max = entry[2] != null ? entry[2] : entry[1];
      const itemRec = itemMap.get(itemId);
      return {
        itemId,
        name: itemRec ? itemRec.name : `道具${itemId}`,
        min,
        max,
        rangeText: min === max ? `${min}` : `${min}~${max}`
      };
    });

    return {
      stageId: f.id,
      floor: f.floor,
      sort: f.sort,
      level: f.bossLevel || 0,
      rewardBoss: u.parseCost(f.rewardBoss),
      rewardFast: u.parseCost(f.rewardFast),
      dropShow: dropShowParsed
    };
  });

  const qingqiuInfo = {
    configuredMaxLevel: maxLevel,
    maxIdleTimeSeconds: const206.maxTime || 86400,
    maxIdleHours: (const206.maxTime || 86400) / 3600,
    rewardIntervalMinutes: (const206.rewardTime || 300) / 60,
    fastQingQiuCostYuanbao: const206.fastQingQiuMoney || 600,
    vipWeeklyFastCounts: vipFasts,
    stages: qingqiuStages,
    note: `青丘奇旅最高累积 24 小时挂机收益，每 5 分钟结算一次收益；关卡受 maxLevel=${maxLevel} 限制，当前开放 ${qingqiuStages.length} 个关卡。`
  };

  // ━━━━━━━━ 整合输出 ━━━━━━━━
  const payload = {
    weapons,
    attrConversion,
    levelSummary,
    stars,
    forgePools,
    enchants: validEnchants,
    enchantRules,
    synthesisRules,
    qingqiuInfo
  };

  u.saveOutput('pet_god_weapon', payload, {
    system: '宠物 → 宠物神器',
    source: 'data/runtime/main-index.js + dataApi',
    costType: '原石, 青丘灵玉, 青丘灵晶, 青丘金水',
    dedup: `打造池${forgePools.length}个, 等级强化受close=1与maxLevel=${maxLevel}限制保留${levelSummary.actualEffectiveMaxLevel}级, 附魔有效词条${validEnchants.length}条, 灵炼遗传与青丘奇旅开放${qingqiuStages.length}关`
  });
}

if (require.main === module) extract();
module.exports = extract;
