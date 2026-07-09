#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const utils = require('./lib/utils');
const { loadAppSettings } = require('../server/app-config');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_MAP_DIR = path.join(ROOT, 'file', 'map-cache', 'resources', 'map');
const OUTPUT_NAME = 'stage_reward_exp_soul';

const STAGE_TYPES = {
  1: { label: '主线关卡', slug: 'mainline', filterMode: 'mainline' },
  4: { label: '罗汉堂', slug: 'arhat_hall' },
  6: { label: '噩梦关卡', slug: 'nightmare' },
};

const REPEAT_SPAWN_SENTINEL_COUNT = 999;
const MAINLINE_STAGE_TYPE = 1;
const DEFAULT_DROP_PRIVATE_THRESHOLD = 0;
const FULL_DROP_PROBABILITY = 1;
const EXPECTED_DROP_DECIMAL_PLACES = 6;
const EXPECTED_DROP_INTEGER_EPSILON = 0.00001;

function toNumber(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getMaxLevel() {
  const settings = loadAppSettings();
  const maxLevel = toNumber(settings?.data?.maxLevel);
  if (maxLevel == null) {
    throw new Error('settings.js 中未配置有效的 data.maxLevel');
  }
  return maxLevel;
}

function flattenMapNames(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue.flatMap((item) => flattenMapNames(item));
  }
  if (typeof rawValue === 'string' && rawValue.trim() !== '') {
    return [rawValue.trim()];
  }
  return [];
}

function getMapVariantGroups(stage) {
  const stageType = toNumber(stage?.type);
  if (stageType === 6 && Array.isArray(stage?.map)) {
    return stage.map
      .map((item) => flattenMapNames(item))
      .filter((mapNames) => mapNames.length > 0);
  }
  return [flattenMapNames(stage?.map)];
}

function isTestLikeStage(stage) {
  const samples = [stage?.name, ...flattenMapNames(stage?.map)].filter(Boolean).join(' ');
  return /(测试|test|tset|ceshi)/i.test(samples);
}

function isMainlineStage(stage) {
  return flattenMapNames(stage?.map).some((mapName) => /^No_([1-9]\d*)(-|$)/.test(mapName));
}

function shouldAnalyzeStage(stage, maxLevel) {
  if (!stage || stage.id == null) return false;
  if (toNumber(stage.closeStage) === 1) return false;

  const stageLv = toNumber(stage.lv) ?? 0;
  const stageLvOpen = toNumber(stage.lvOpen) ?? 0;
  if (stageLv > maxLevel && stageLvOpen > maxLevel) return false;

  const stageType = toNumber(stage.type);
  const rule = stageType == null ? null : STAGE_TYPES[stageType];
  if (!rule) return false;
  if (isTestLikeStage(stage)) return false;
  if (rule.filterMode === 'mainline' && !isMainlineStage(stage)) return false;

  return true;
}

function findMapFile(mapDir, mapName) {
  if (!mapName || !mapDir || !fs.existsSync(mapDir)) return null;
  const candidates = [
    path.join(mapDir, `${mapName}.cc.json`),
    path.join(mapDir, `${mapName}.json`),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function findMapPayload(rawData) {
  if (!rawData || typeof rawData !== 'object') return null;
  if (rawData?.triggers?.manCreater) return rawData;

  const visited = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return null;
    if (visited.has(node)) return null;
    visited.add(node);
    if (node?.triggers?.manCreater) return node;

    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item);
        if (found) return found;
      }
      return null;
    }

    for (const key of Object.keys(node)) {
      const found = walk(node[key]);
      if (found) return found;
    }
    return null;
  };

  return walk(rawData);
}

function normalizeNumberList(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeNumberList(item));
  }
  if (typeof value === 'number') return Number.isFinite(value) ? [value] : [];
  if (typeof value === 'string') {
    return value
      .split(/[|,;\s]+/)
      .map((item) => toNumber(item.trim()))
      .filter((item) => item != null);
  }
  return [];
}

function uniqueNumbers(values) {
  return Array.from(new Set(values.filter((value) => value != null))).sort((left, right) => left - right);
}

function addMapValue(target, key, value) {
  if (!Number.isFinite(value) || value === 0) return;
  target.set(key, (target.get(key) || 0) + value);
}

function toGroupedMap(rows, keyName) {
  const grouped = new Map();
  for (const row of rows) {
    const key = toNumber(row?.[keyName]);
    if (key == null) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return grouped;
}

function toIdMap(rows) {
  return new Map(rows.map((row) => [toNumber(row?.id), row]).filter(([id]) => id != null));
}

function firstStageLink(value) {
  return normalizeNumberList(value)[0] ?? null;
}

function includesStageId(value, stageId) {
  const targetId = toNumber(stageId);
  if (targetId == null) return false;
  return normalizeNumberList(value).includes(targetId);
}

function hasSharedStageId(left, right) {
  const rightIds = new Set(normalizeNumberList(right));
  return normalizeNumberList(left).some((stageId) => rightIds.has(stageId));
}

function isLogicalPreviousSegment(previousStage, currentStage) {
  const currentStageId = toNumber(currentStage?.id);
  if (currentStageId == null) return false;
  if (includesStageId(previousStage?.sweepPowerStage, currentStageId)) return true;

  const sharedLoading = hasSharedStageId(previousStage?.loading, currentStage?.loading);
  if (!sharedLoading) return false;

  const previousBossDeath = toNumber(previousStage?.bossDeath);
  const currentBossDeath = toNumber(currentStage?.bossDeath);
  if (previousBossDeath != null && previousBossDeath === currentBossDeath) return true;

  return previousStage?.name != null && previousStage.name === currentStage?.name;
}

function collectPositiveFlowPointIds(payload) {
  const pointIds = new Set();
  const screens = payload?.screen || {};

  for (const [screenKey, screen] of Object.entries(screens)) {
    const screenIndex = toNumber(screen?.screen) ?? toNumber(screenKey);
    if (screenIndex == null || screenIndex <= 0) continue;
    for (const pointId of normalizeNumberList(screen?.mustPoints)) {
      pointIds.add(pointId);
    }
  }

  const monsterTriggers = payload?.triggers?.monsterTrigger;
  if (Array.isArray(monsterTriggers)) {
    for (const trigger of monsterTriggers) {
      const screenIndex = toNumber(trigger?.screen);
      if (screenIndex == null || screenIndex <= 0) continue;
      for (const pointId of normalizeNumberList(trigger?.points)) {
        pointIds.add(pointId);
      }
    }
  }

  return pointIds;
}

function collectDeathClearedPointIds(creators) {
  const pointIds = new Set();
  for (const creator of Object.values(creators || {})) {
    for (const pointId of normalizeNumberList(creator?.dieClearPoint)) {
      pointIds.add(pointId);
    }
  }
  return pointIds;
}

function getCreatorMonsterChoice(creator) {
  const randomIds = normalizeNumberList(creator?.RandomIds);
  if (randomIds.length > 0) {
    return { monsterIds: uniqueNumbers(randomIds), isChoice: true, source: 'RandomIds' };
  }

  const monsterIds = normalizeNumberList(creator?.mIds);
  return {
    monsterIds: uniqueNumbers(monsterIds),
    isChoice: Array.isArray(creator?.mIds) && monsterIds.length > 1,
    source: 'mIds',
  };
}

function extractCreatorMonsters(creator, context) {
  const creatorPointId = toNumber(creator?.id ?? context.creatorPointId);
  if (context.flowPointIds.size > 0 && !context.flowPointIds.has(creatorPointId)) {
    return [];
  }
  if (context.deathClearedPointIds.has(creatorPointId)) {
    context.warnings.add(`生成器 ${context.creatorKey} 会被其他怪物死亡清除，未计入基础奖励`);
    return [];
  }
  if (creator?.needRecocery === true) {
    context.warnings.add(`生成器 ${context.creatorKey} 是恢复型刷怪点，未计入基础奖励`);
    return [];
  }

  const { monsterIds, isChoice, source } = getCreatorMonsterChoice(creator);
  if (monsterIds.length === 0) return [];

  const counts = normalizeNumberList(creator?.mNums);
  if (counts.length === 0) {
    context.warnings.add(`生成器 ${context.creatorKey} 有 mIds 但缺少 mNums`);
    return [];
  }
  if (counts.length !== monsterIds.length && counts.length !== 1) {
    context.warnings.add(`生成器 ${context.creatorKey} 的 mIds 与 mNums 数量不匹配`);
    return [];
  }

  const spawnCount = counts.length === 1 ? counts[0] : null;
  if (spawnCount != null && spawnCount >= REPEAT_SPAWN_SENTINEL_COUNT) {
    context.warnings.add(`生成器 ${context.creatorKey} 是高重复刷怪点，未计入基础奖励`);
    return [];
  }

  const isBossCreator = creator?.isBoss === true
    || creator?.BossAppearHint === true
    || creator?.BossKillHint === true;

  if (isChoice) {
    return [{
      monsterIds,
      count: spawnCount ?? counts[0],
      creatorKey: context.creatorKey,
      isBossCreator,
      isChoice: true,
      choiceSource: source,
    }];
  }

  return monsterIds.map((monsterId, index) => ({
    monsterIds: [monsterId],
    count: counts.length === 1 ? counts[0] : counts[index],
    creatorKey: context.creatorKey,
    isBossCreator,
    isChoice: false,
    choiceSource: source,
  }));
}

function collectMapMonsterSpawns(mapDir, mapNames) {
  const warnings = new Set();
  const spawns = [];
  const mapFiles = [];

  for (const mapName of mapNames) {
    const mapFile = findMapFile(mapDir, mapName);
    if (!mapFile) {
      warnings.add(`地图文件缺失: ${mapName}`);
      continue;
    }

    mapFiles.push(path.basename(mapFile));
    let payload;
    try {
      payload = findMapPayload(JSON.parse(fs.readFileSync(mapFile, 'utf8')));
    } catch (error) {
      warnings.add(`地图解析失败: ${mapName} (${error.message})`);
      continue;
    }

    const creators = payload?.triggers?.manCreater;
    if (!creators || typeof creators !== 'object') {
      warnings.add(`地图没有 manCreater: ${mapName}`);
      continue;
    }

    const flowPointIds = collectPositiveFlowPointIds(payload);
    const deathClearedPointIds = collectDeathClearedPointIds(creators);
    if (flowPointIds.size === 0) {
      warnings.add(`地图没有可识别的正向战斗流程点: ${mapName}`);
    }

    for (const [creatorKey, creator] of Object.entries(creators)) {
      const entries = extractCreatorMonsters(creator, {
        warnings,
        creatorKey: `${mapName}:${creatorKey}`,
        creatorPointId: creatorKey,
        flowPointIds,
        deathClearedPointIds,
      });
      for (const entry of entries) {
        spawns.push({ ...entry, mapName });
      }
    }
  }

  return { spawns, mapFiles, warnings: Array.from(warnings) };
}

function isRewardMonster(monster) {
  return toNumber(monster?.exp) === 1 || toNumber(monster?.isSpriteFly) === 1;
}

function isFinalBoss(monster) {
  return toNumber(monster?.isBossFinal) === 1;
}

function rewardCoefficient(value) {
  return toNumber(value) ?? 0;
}

function getMonsterName(monster, fallback) {
  return monster?.name || monster?.remark || String(fallback);
}

function buildMonsterItem(spawn, monsters) {
  if (spawn.isChoice) {
    const names = monsters.map((monster, index) => getMonsterName(monster, spawn.monsterIds[index]));
    return {
      id: `choice:${spawn.monsterIds.join('|')}`,
      ids: spawn.monsterIds,
      name: `候选：${names.join(' / ')}`,
      count: 0,
      isChoice: true,
    };
  }

  const monsterId = spawn.monsterIds[0];
  return {
    id: monsterId,
    ids: [monsterId],
    name: getMonsterName(monsters[0], monsterId),
    count: 0,
    isChoice: false,
  };
}

// (Removed expected drops calculation helper functions as they are no longer needed)



function allCoefficientsEqual(segments) {
  if (segments.length <= 1) return true;
  const first = JSON.stringify(segments[0].rewardCoefficients);
  return segments.every((segment) => JSON.stringify(segment.rewardCoefficients) === first);
}

function mergeMonsterLists(segments, kind) {
  const merged = new Map();
  for (const segment of segments) {
    for (const item of segment.monsters[kind]) {
      const key = String(item.id);
      const current = merged.get(key) || { ...item, count: 0 };
      current.count += item.count;
      merged.set(key, current);
    }
  }
  return Array.from(merged.values()).sort((left, right) => String(left.id).localeCompare(String(right.id), 'zh-Hans-CN', { numeric: true }));
}

function calculateStageRewardForMapNames(stage, monsterById, mapDir, mapNames) {
  const stageType = toNumber(stage.type);
  const mapResult = collectMapMonsterSpawns(mapDir, mapNames);
  const missingMonsterIds = new Set();
  const normalMonsters = new Map();
  const bossMonsters = new Map();
  let normalCount = 0;
  let bossCount = 0;

  for (const spawn of mapResult.spawns) {
    const monsters = spawn.monsterIds.map((monsterId) => monsterById.get(monsterId));
    monsters.forEach((monster, index) => {
      if (!monster) missingMonsterIds.add(spawn.monsterIds[index]);
    });
    if (monsters.some((monster) => !monster)) {
      continue;
    }

    const rewardFlags = monsters.map((monster) => isRewardMonster(monster));
    if (!rewardFlags.some(Boolean)) continue;
    if (rewardFlags.some((value) => value !== rewardFlags[0])) {
      mapResult.warnings.push(`生成器 ${spawn.creatorKey} 的随机候选奖励标记不一致，未计入基础奖励`);
      continue;
    }

    const isBoss = spawn.isBossCreator === true || monsters.every((monster) => isFinalBoss(monster));
    const targetMap = isBoss ? bossMonsters : normalMonsters;
    const item = buildMonsterItem(spawn, monsters);
    const current = targetMap.get(item.id) || item;
    current.count += spawn.count;
    targetMap.set(item.id, current);

    if (isBoss) bossCount += spawn.count;
    else normalCount += spawn.count;
  }

  const expMonster = rewardCoefficient(stage.expMonster);
  const expBoss = rewardCoefficient(stage.expBoss);
  const soulMonster = rewardCoefficient(stage.spriteMonster);
  const soulBoss = rewardCoefficient(stage.spriteBoss);
  const experience = normalCount * expMonster + bossCount * expBoss;
  const soul = normalCount * soulMonster + bossCount * soulBoss;

  const warnings = [...mapResult.warnings];
  if (missingMonsterIds.size > 0) {
    warnings.push(`monster 表缺失: ${Array.from(missingMonsterIds).sort((a, b) => a - b).join(',')}`);
  }

  return {
    stageId: stage.id,
    stageName: stage.name || '',
    type: stage.type,
    typeLabel: STAGE_TYPES[toNumber(stage.type)]?.label || `Type ${stage.type}`,
    slug: STAGE_TYPES[toNumber(stage.type)]?.slug || String(stage.type),
    subType: stage.subType ?? null,
    stageLv: stage.lv ?? null,
    lvOpen: stage.lvOpen ?? null,
    mapNames,
    mapFiles: mapResult.mapFiles,
    rewardCoefficients: {
      expMonster,
      expBoss,
      soulMonster,
      soulBoss,
    },
    counts: {
      normal: normalCount,
      boss: bossCount,
      total: normalCount + bossCount,
    },
    reward: {
      experience,
      soul,
    },
    monsters: {
      normal: Array.from(normalMonsters.values()).sort((left, right) => String(left.id).localeCompare(String(right.id), 'zh-Hans-CN', { numeric: true })),
      boss: Array.from(bossMonsters.values()).sort((left, right) => String(left.id).localeCompare(String(right.id), 'zh-Hans-CN', { numeric: true })),
    },
    warnings,
  };
}

function compareStageRewardValue(left, right) {
  if (left.reward.experience !== right.reward.experience) {
    return left.reward.experience - right.reward.experience;
  }
  if (left.reward.soul !== right.reward.soul) {
    return left.reward.soul - right.reward.soul;
  }
  return left.counts.total - right.counts.total;
}

function calculateStageReward(stage, monsterById, mapDir) {
  const variants = getMapVariantGroups(stage)
    .map((mapNames) => calculateStageRewardForMapNames(stage, monsterById, mapDir, mapNames));

  if (variants.length <= 1) return variants[0];

  const sorted = [...variants].sort(compareStageRewardValue);
  const selected = sorted[0];
  const variantSummary = variants
    .map((variant) => `${variant.mapNames.join('+')}: ${variant.reward.experience}/${variant.reward.soul}`)
    .join('; ');
  return {
    ...selected,
    mapVariants: variants.map((variant) => ({
      mapNames: variant.mapNames,
      counts: variant.counts,
      reward: variant.reward,
    })),
    warnings: [...selected.warnings, `地图为候选变体，已取保守基础奖励: ${variantSummary}`],
  };
}

function buildStageChain(stage, stageById, maxLevel) {
  const chain = [];
  const warnings = [];
  const seen = new Set();
  let current = stage;

  while (current) {
    const stageId = toNumber(current.id);
    if (stageId == null || seen.has(stageId)) {
      warnings.push(`lastStage 链路循环或无效，停在 ${current?.id ?? 'unknown'}`);
      break;
    }
    seen.add(stageId);
    chain.unshift(current);

    const previousStageId = firstStageLink(current.lastStage);
    if (previousStageId == null) break;
    const previousStage = stageById.get(previousStageId);
    if (!previousStage) {
      warnings.push(`lastStage 指向缺失关卡: ${previousStageId}`);
      break;
    }
    if (!shouldAnalyzeStage(previousStage, maxLevel)) {
      warnings.push(`lastStage 指向非本模块有效关卡: ${previousStageId}`);
      break;
    }
    if (!isLogicalPreviousSegment(previousStage, current)) {
      break;
    }
    current = previousStage;
  }

  return { chain, warnings };
}

function collectLogicalSegmentStageIds(stages, stageById, maxLevel) {
  const segmentStageIds = new Set();
  for (const stage of stages) {
    if (!shouldAnalyzeStage(stage, maxLevel)) continue;
    const chain = buildStageChain(stage, stageById, maxLevel).chain;
    if (chain.length <= 1) continue;
    for (let index = 0; index < chain.length - 1; index += 1) {
      const stageId = toNumber(chain[index].id);
      if (stageId != null) segmentStageIds.add(stageId);
    }
  }
  return segmentStageIds;
}

function calculateStageChainReward(stage, stageById, monsterById, mapDir, maxLevel) {
  const chainResult = buildStageChain(stage, stageById, maxLevel);
  const segments = chainResult.chain.map((segmentStage, index) => ({
    ...calculateStageReward(segmentStage, monsterById, mapDir),
    segmentIndex: index + 1,
  }));
  const representative = segments[segments.length - 1];
  const coefficientSetIsUniform = allCoefficientsEqual(segments);
  const warnings = [
    ...chainResult.warnings,
    ...segments.flatMap((segment) => segment.warnings.map((warning) => `ID ${segment.stageId}: ${warning}`)),
  ];

  const normalCount = segments.reduce((sum, segment) => sum + segment.counts.normal, 0);
  const bossCount = segments.reduce((sum, segment) => sum + segment.counts.boss, 0);
  const experience = segments.reduce((sum, segment) => sum + segment.reward.experience, 0);
  const soul = segments.reduce((sum, segment) => sum + segment.reward.soul, 0);

  return {
    stageId: stage.id,
    stageName: stage.name || '',
    type: stage.type,
    typeLabel: STAGE_TYPES[toNumber(stage.type)]?.label || `Type ${stage.type}`,
    slug: STAGE_TYPES[toNumber(stage.type)]?.slug || String(stage.type),
    subType: stage.subType ?? null,
    stageLv: stage.lv ?? null,
    lvOpen: stage.lvOpen ?? null,
    chainStageIds: segments.map((segment) => segment.stageId),
    mapNames: Array.from(new Set(segments.flatMap((segment) => segment.mapNames))),
    mapFiles: Array.from(new Set(segments.flatMap((segment) => segment.mapFiles))),
    rewardCoefficients: coefficientSetIsUniform ? representative.rewardCoefficients : null,
    coefficientSetIsUniform,
    counts: {
      normal: normalCount,
      boss: bossCount,
      total: normalCount + bossCount,
    },
    reward: {
      experience,
      soul,
    },
    monsters: {
      normal: mergeMonsterLists(segments, 'normal'),
      boss: mergeMonsterLists(segments, 'boss'),
    },
    segments,
    warnings,
  };
}

function compareStages(left, right) {
  const leftType = toNumber(left.type) ?? Number.MAX_SAFE_INTEGER;
  const rightType = toNumber(right.type) ?? Number.MAX_SAFE_INTEGER;
  if (leftType !== rightType) return leftType - rightType;

  const leftId = toNumber(left.stageId) ?? Number.MAX_SAFE_INTEGER;
  const rightId = toNumber(right.stageId) ?? Number.MAX_SAFE_INTEGER;
  return leftId - rightId;
}

function buildTypeGroups(stages) {
  const groups = new Map();
  for (const stage of stages) {
    const stageType = toNumber(stage.type);
    const rule = STAGE_TYPES[stageType];
    if (!groups.has(stageType)) {
      groups.set(stageType, {
        type: stageType,
        label: rule.label,
        slug: rule.slug,
        stageCount: 0,
        totalExperience: 0,
        totalSoul: 0,
        stages: [],
      });
    }
    const group = groups.get(stageType);
    group.stageCount += 1;
    group.totalExperience += stage.reward.experience;
    group.totalSoul += stage.reward.soul;
    group.stages.push(stage);
  }

  return Array.from(groups.values())
    .map((group) => ({ ...group, stages: group.stages.sort(compareStages) }))
    .sort((left, right) => left.type - right.type);
}

function extractStageRewards(options = {}) {
  const stageFile = options.stageFile || utils.findTableFile('stage');
  const monsterFile = options.monsterFile || utils.findTableFile('monster');
  const mapDir = options.mapDir || DEFAULT_MAP_DIR;
  const stages = JSON.parse(fs.readFileSync(stageFile, 'utf8'));
  const monsters = JSON.parse(fs.readFileSync(monsterFile, 'utf8'));
  const stageById = new Map(stages.map((stage) => [toNumber(stage.id), stage]).filter(([id]) => id != null));
  const monsterById = new Map(monsters.map((monster) => [toNumber(monster.id), monster]).filter(([id]) => id != null));
  const maxLevel = getMaxLevel();
  const logicalSegmentStageIds = collectLogicalSegmentStageIds(stages, stageById, maxLevel);

  const analyzedStages = stages
    .filter((stage) => shouldAnalyzeStage(stage, maxLevel))
    .filter((stage) => !logicalSegmentStageIds.has(toNumber(stage.id)))
    .map((stage) => calculateStageChainReward(stage, stageById, monsterById, mapDir, maxLevel))
    .filter((stage) => stage.reward.experience > 0 || stage.reward.soul > 0)
    .sort(compareStages);

  const groups = buildTypeGroups(analyzedStages);
  const payload = {
    summary: {
      stageCount: analyzedStages.length,
      typeCount: groups.length,
      totalExperience: analyzedStages.reduce((sum, stage) => sum + stage.reward.experience, 0),
      totalSoul: analyzedStages.reduce((sum, stage) => sum + stage.reward.soul, 0),
      includedTypes: Object.values(STAGE_TYPES).map((rule) => rule.label),
    },
    types: groups,
  };

  utils.saveOutput(OUTPUT_NAME, payload, {
    system: '关卡奖励',
    source: 'stage.*.json + monster.*.json + file/map-cache/resources/map/*.json',
    note: '仅导出主线关卡、罗汉堂、噩梦关卡的基础经验与灵魂；关卡级过滤复用 BOSS 导出规则；lastStage 链路按多地图流程合并展示并逐段计算；stage.map 数组按候选地图处理，不叠加；怪物级过滤使用 exp=1 或 isSpriteFly=1；Boss 使用 isBossFinal 与地图生成器 Boss 标记；RandomIds/mIds 随机候选按一次生成计数；隐藏触发点、死亡清除刷怪点和高重复刷怪点不计入基础奖励。',
  });
  return payload;
}

if (require.main === module) {
  extractStageRewards();
}

module.exports = {
  extractStageRewards,
  shouldAnalyzeStage,
  calculateStageReward,
  calculateStageChainReward,
};
