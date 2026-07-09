#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const utils = require('./lib/utils');
const { loadAppSettings } = require('../server/app-config');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_MAP_DIR = path.join(ROOT, 'file', 'map-cache', 'resources', 'map');
const OUTPUT_NAME = 'stage_expected_drops';

const STAGE_TYPES = {
  1: { label: '主线关卡', slug: 'mainline', filterMode: 'mainline' },
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

function buildDropContext(options) {
  const dropGroupFile = options.dropGroupFile || utils.findTableFile('dropGroup');
  const dropFile = options.dropFile || utils.findTableFile('drop');
  const itemFile = options.itemFile || utils.findTableFile('item');
  const roleFile = options.roleFile || utils.findTableFile('role');
  const dropGroups = JSON.parse(fs.readFileSync(dropGroupFile, 'utf8'));
  const drops = JSON.parse(fs.readFileSync(dropFile, 'utf8'));
  const items = JSON.parse(fs.readFileSync(itemFile, 'utf8'));
  const roles = JSON.parse(fs.readFileSync(roleFile, 'utf8'));

  return {
    dropGroupByGroupId: toGroupedMap(dropGroups, 'groupID'),
    dropByDropId: toGroupedMap(drops, 'dropID'),
    itemById: toIdMap(items),
    roleById: toIdMap(roles),
  };
}

function clampDropProbability(value, warnings, sourceLabel) {
  const probability = toNumber(value);
  if (probability == null) {
    warnings.push(`${sourceLabel} 缺少 probability，未计入`);
    return null;
  }
  if (probability <= 0) return 0;
  return Math.min(probability, FULL_DROP_PROBABILITY);
}

function normalizeExtractNumber(value, warnings, sourceLabel) {
  const extractNumber = toNumber(value);
  if (extractNumber == null || extractNumber < 0) {
    warnings.push(`${sourceLabel} 缺少有效 extractNumber，未计入`);
    return null;
  }
  return Math.floor(extractNumber);
}

function normalizeDropItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => Array.isArray(item) && item.length > 0)
    .map((item) => ({
      itemId: toNumber(item[0]),
      count: toNumber(item[1]) ?? 1,
    }))
    .filter((item) => item.itemId != null && Number.isFinite(item.count));
}

function addDropRowItems(expectedItems, dropRow, chance) {
  for (const item of normalizeDropItems(dropRow?.items)) {
    addMapValue(expectedItems, item.itemId, chance * item.count);
  }
}

function scaleExpectedMap(source, scale) {
  const result = new Map();
  for (const [key, value] of source.entries()) {
    addMapValue(result, key, value * scale);
  }
  return result;
}

function mergeExpectedMap(target, source) {
  for (const [key, value] of source.entries()) {
    addMapValue(target, key, value);
  }
}

function calculateDropRowsExpected(dropRows, dropGroupRow, warnings) {
  const sourceLabel = `dropGroup ${dropGroupRow.groupID} / dropID ${dropGroupRow.dropID}`;
  const probability = clampDropProbability(dropGroupRow.probability, warnings, sourceLabel);
  const extractNumber = normalizeExtractNumber(dropGroupRow.extractNumber, warnings, sourceLabel);
  if (probability == null || extractNumber == null || probability === 0 || extractNumber === 0) return new Map();

  const positiveRows = dropRows.filter((row) => rewardCoefficient(row?.weight) > 0);
  if (positiveRows.length === 0) {
    warnings.push(`${sourceLabel} 没有正权重掉落明细`);
    return new Map();
  }

  const removeSelected = toNumber(dropGroupRow.independentExtract) === 0;
  const memo = new Map();

  const walk = (rowIndexes, attemptsLeft) => {
    if (attemptsLeft <= 0 || rowIndexes.length === 0) return new Map();

    const memoKey = `${attemptsLeft}|${rowIndexes.join(',')}`;
    if (memo.has(memoKey)) return memo.get(memoKey);

    const result = new Map();
    const missChance = FULL_DROP_PROBABILITY - probability;
    if (missChance > 0) {
      mergeExpectedMap(result, scaleExpectedMap(walk(rowIndexes, attemptsLeft - 1), missChance));
    }

    const totalWeight = rowIndexes.reduce((sum, rowIndex) => sum + rewardCoefficient(positiveRows[rowIndex].weight), 0);
    if (totalWeight <= 0) {
      memo.set(memoKey, result);
      return result;
    }

    for (const rowIndex of rowIndexes) {
      const dropRow = positiveRows[rowIndex];
      const chooseChance = probability * rewardCoefficient(dropRow.weight) / totalWeight;
      addDropRowItems(result, dropRow, chooseChance);

      const nextIndexes = removeSelected ? rowIndexes.filter((index) => index !== rowIndex) : rowIndexes;
      mergeExpectedMap(result, scaleExpectedMap(walk(nextIndexes, attemptsLeft - 1), chooseChance));
    }

    memo.set(memoKey, result);
    return result;
  };

  return walk(positiveRows.map((_, index) => index), extractNumber);
}

function getRoleName(context, heroType) {
  if (heroType === 0) return '公共';
  return context.roleById.get(heroType)?.name || `职业${heroType}`;
}

function addExpectedDropContribution(aggregate, contribution) {
  const key = `${contribution.scope}:${contribution.heroType}:${contribution.itemId}`;
  const current = aggregate.get(key) || {
    itemId: contribution.itemId,
    name: contribution.name,
    type: contribution.type,
    quality: contribution.quality,
    scope: contribution.scope,
    heroType: contribution.heroType,
    heroName: contribution.heroName,
    expectedCount: 0,
    sourceKinds: new Set(),
    groupIds: new Set(),
    dropIds: new Set(),
  };

  current.expectedCount += contribution.expectedCount;
  current.sourceKinds.add(contribution.sourceKind);
  current.groupIds.add(contribution.groupId);
  current.dropIds.add(contribution.dropId);
  aggregate.set(key, current);
}

function addDropGroupExpected(aggregate, context, groupId, sourceKind, killCount, warnings) {
  if (!Number.isFinite(killCount) || killCount <= 0) return;

  const rows = (context.dropGroupByGroupId.get(groupId) || [])
    .filter((row) => rewardCoefficient(row?.private) >= DEFAULT_DROP_PRIVATE_THRESHOLD);
  if (rows.length === 0) {
    warnings.push(`${sourceKind}掉落组 ${groupId} 缺少 dropGroup 配置`);
    return;
  }

  for (const dropGroupRow of rows) {
    const dropId = toNumber(dropGroupRow.dropID);
    if (dropId == null) {
      warnings.push(`${sourceKind}掉落组 ${groupId} 存在无效 dropID`);
      continue;
    }

    const dropRows = context.dropByDropId.get(dropId) || [];
    if (dropRows.length === 0) {
      warnings.push(`${sourceKind}掉落组 ${groupId} 的 dropID ${dropId} 缺少 drop 明细`);
      continue;
    }

    const expectedItems = calculateDropRowsExpected(dropRows, dropGroupRow, warnings);
    const heroType = toNumber(dropGroupRow.heroType) ?? 0;
    const scope = heroType === 0 ? 'public' : 'heroSpecific';
    const heroName = getRoleName(context, heroType);

    for (const [itemId, expectedCount] of expectedItems.entries()) {
      const item = context.itemById.get(itemId);
      if (!item) {
        warnings.push(`${sourceKind}掉落组 ${groupId} 的道具 ${itemId} 缺少 item 配置`);
      }
      addExpectedDropContribution(aggregate, {
        itemId,
        name: item?.name || `未知(${itemId})`,
        type: item?.type || 'unknown',
        quality: item?.quality ?? null,
        scope,
        heroType,
        heroName,
        expectedCount: expectedCount * killCount,
        sourceKind,
        groupId,
        dropId,
      });
    }
  }
}

function roundExpectedDropCount(value) {
  const nearestInteger = Math.round(value);
  if (Math.abs(value - nearestInteger) < EXPECTED_DROP_INTEGER_EPSILON) return nearestInteger;
  return Number(value.toFixed(EXPECTED_DROP_DECIMAL_PLACES));
}

function serializeExpectedDropItem(item) {
  return {
    itemId: item.itemId,
    name: item.name,
    type: item.type,
    quality: item.quality,
    scope: item.scope,
    heroType: item.scope === 'heroSpecific' ? item.heroType : null,
    heroName: item.scope === 'heroSpecific' ? item.heroName : null,
    expectedCount: roundExpectedDropCount(item.expectedCount),
    sourceKinds: Array.from(item.sourceKinds).sort(),
    groupIds: uniqueNumbers(Array.from(item.groupIds)),
    dropIds: uniqueNumbers(Array.from(item.dropIds)),
  };
}

function compareExpectedDropItems(left, right) {
  if (right.expectedCount !== left.expectedCount) return right.expectedCount - left.expectedCount;
  if (left.scope !== right.scope) return left.scope === 'public' ? -1 : 1;
  if ((left.quality ?? -1) !== (right.quality ?? -1)) return (right.quality ?? -1) - (left.quality ?? -1);
  return String(left.name).localeCompare(String(right.name), 'zh-Hans-CN', { numeric: true });
}

function buildHeroSpecificSummary(items) {
  const grouped = new Map();
  for (const item of items) {
    if (item.scope !== 'heroSpecific') continue;
    const heroType = toNumber(item.heroType);
    if (heroType == null) continue;
    const current = grouped.get(heroType) || {
      heroType,
      heroName: item.heroName,
      expectedCount: 0,
      itemCount: 0,
    };
    current.expectedCount += item.expectedCount;
    current.itemCount += 1;
    grouped.set(heroType, current);
  }

  return Array.from(grouped.values())
    .map((item) => ({ ...item, expectedCount: roundExpectedDropCount(item.expectedCount) }))
    .sort((left, right) => left.heroType - right.heroType);
}

function buildExpectedDrops(chainStages, segments, context) {
  const representativeStage = chainStages[chainStages.length - 1];
  if (toNumber(representativeStage?.type) !== MAINLINE_STAGE_TYPE) return null;

  const warnings = [];
  const aggregate = new Map();

  segments.forEach((segment, index) => {
    const sourceStage = chainStages[index];
    const normalGroups = normalizeNumberList(sourceStage?.dropsMonster);
    const bossGroups = normalizeNumberList(sourceStage?.dropsBoss);

    if (segment.counts.normal > 0 && normalGroups.length === 0) {
      warnings.push(`ID ${sourceStage.id}: 有 ${segment.counts.normal} 个有效小怪但 dropsMonster 为空`);
    }
    if (segment.counts.boss > 0 && bossGroups.length === 0) {
      warnings.push(`ID ${sourceStage.id}: 有 ${segment.counts.boss} 个 Boss 但 dropsBoss 为空`);
    }

    for (const groupId of normalGroups) {
      addDropGroupExpected(aggregate, context, groupId, '小怪', segment.counts.normal, warnings);
    }
    for (const groupId of bossGroups) {
      addDropGroupExpected(aggregate, context, groupId, 'Boss', segment.counts.boss, warnings);
    }
  });

  const items = Array.from(aggregate.values())
    .map(serializeExpectedDropItem)
    .filter((item) => item.expectedCount > 0)
    .sort(compareExpectedDropItems);
  const publicItems = items.filter((item) => item.scope === 'public');
  const heroSpecificItems = items.filter((item) => item.scope === 'heroSpecific');
  const publicExpectedCount = publicItems.reduce((sum, item) => sum + item.expectedCount, 0);

  return {
    itemCount: items.length,
    publicItemCount: publicItems.length,
    heroSpecificItemCount: heroSpecificItems.length,
    publicExpectedCount: roundExpectedDropCount(publicExpectedCount),
    heroSpecificByHero: buildHeroSpecificSummary(heroSpecificItems),
    items,
    warnings,
  };
}

function calculateStageRewardForMapNames(stage, monsterById, mapDir, mapNames) {
  const mapResult = collectMapMonsterSpawns(mapDir, mapNames);
  const missingMonsterIds = new Set();
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
    if (isBoss) bossCount += spawn.count;
    else normalCount += spawn.count;
  }

  const warnings = [...mapResult.warnings];
  if (missingMonsterIds.size > 0) {
    warnings.push(`monster 表缺失: ${Array.from(missingMonsterIds).sort((a, b) => a - b).join(',')}`);
  }

  return {
    stageId: stage.id,
    counts: {
      normal: normalCount,
      boss: bossCount,
      total: normalCount + bossCount,
    },
    warnings,
  };
}

function calculateStageReward(stage, monsterById, mapDir) {
  const variants = getMapVariantGroups(stage)
    .map((mapNames) => calculateStageRewardForMapNames(stage, monsterById, mapDir, mapNames));
  return variants[0];
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

function calculateStageChainDrops(stage, stageById, monsterById, mapDir, maxLevel, dropContext) {
  const chainResult = buildStageChain(stage, stageById, maxLevel);
  const segments = chainResult.chain.map((segmentStage, index) => ({
    ...calculateStageReward(segmentStage, monsterById, mapDir),
    segmentIndex: index + 1,
  }));
  const expectedDrops = buildExpectedDrops(chainResult.chain, segments, dropContext);

  return {
    stageId: stage.id,
    stageName: stage.name || '',
    expectedDrops,
  };
}

function extractStageDrops(options = {}) {
  const stageFile = options.stageFile || utils.findTableFile('stage');
  const monsterFile = options.monsterFile || utils.findTableFile('monster');
  const mapDir = options.mapDir || DEFAULT_MAP_DIR;
  const stages = JSON.parse(fs.readFileSync(stageFile, 'utf8'));
  const monsters = JSON.parse(fs.readFileSync(monsterFile, 'utf8'));
  const stageById = new Map(stages.map((stage) => [toNumber(stage.id), stage]).filter(([id]) => id != null));
  const monsterById = new Map(monsters.map((monster) => [toNumber(monster.id), monster]).filter(([id]) => id != null));
  const dropContext = buildDropContext(options);
  const maxLevel = getMaxLevel();
  const logicalSegmentStageIds = collectLogicalSegmentStageIds(stages, stageById, maxLevel);

  const analyzedStages = stages
    .filter((stage) => shouldAnalyzeStage(stage, maxLevel))
    .filter((stage) => !logicalSegmentStageIds.has(toNumber(stage.id)))
    .map((stage) => calculateStageChainDrops(stage, stageById, monsterById, mapDir, maxLevel, dropContext))
    .filter((stage) => stage.expectedDrops !== null);

  const payload = {
    summary: {
      stageCount: analyzedStages.length,
      extractedAt: new Date().toISOString(),
    },
    stages: analyzedStages,
  };

  utils.saveOutput(OUTPUT_NAME, payload, {
    system: '关卡期望道具掉落独立导出',
    source: 'stage.*.json + monster.*.json + dropGroup.*.json + drop.*.json + item.*.json + role.*.json + file/map-cache/resources/map/*.json',
  });
  return payload;
}

if (require.main === module) {
  extractStageDrops();
}

module.exports = {
  extractStageDrops,
};
