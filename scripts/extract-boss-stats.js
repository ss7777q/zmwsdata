#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const utils = require('./lib/utils');
const { loadAppSettings } = require('../server/app-config');

const ROOT = path.resolve(__dirname, '..');
const DOWNLOADER_PATH = path.join(__dirname, 'cocos_resource_downloader.mjs');
const DEFAULT_BASE_URL = 'https://client-zmxyol.3304399.net/client/';
const DEFAULT_MAP_CACHE_ROOT = path.join(ROOT, 'file', 'map-cache');
const DEFAULT_MAP_CACHE_DIR = path.join(DEFAULT_MAP_CACHE_ROOT, 'resources', 'map');
const DEFAULT_MANIFEST_PATH = path.join(ROOT, 'file', 'runtime', 'cocos-map-manifest.json');
const BATTLE_ENTITY_DIR = path.join(ROOT, 'file', 'battle-config', 'entityCtg');
const BOSS_OUTPUT_PREFIX = 'boss_type';
const BOSS_INDEX_OUTPUT_NAME = 'boss_index';

const PROP_KEYS = [
  'atk', 'def', 'hp', 'mp', 'hitVal', 'dodge', 'crit', 'tenacity', 'lucky', 'guardian',
  'break', 'protect', 'defP', 'defSubtractP', 'hitValP', 'dodgeP', 'critP', 'tenacityP',
  'luckyP', 'guardianP', 'defendVal', 'healHp'
];

const DEFAULT_CONFIG = {
  stageFile: utils.findTableFile('stage'),
  monsterFile: utils.findTableFile('monster'),
  attrFile: utils.findTableFile('monsterAttribute'),
  skillFile: utils.findTableFile('skill'),
  beskillFile: utils.findTableFile('beskill'),
  constsFile: utils.findTableFile('consts'),
  leagueBossCopyFile: utils.findTableFile('leagueBossCopy'),
  leagueBossReallyFile: utils.findTableFile('leagueBossReally'),
  kunlunWaveFile: utils.findTableFile('buildProtectKunLunWave'),
  roguelikeBaseFile: utils.findTableFile('roguelikeBase'),
  roguelikeFile: utils.findTableFile('roguelike'),
  starHavocAttrFile: utils.findTableFile('starHavocMonsterAttribute'),
  starHavocEventFile: utils.findTableFile('starHavocEvent'),
  starHavocRewardFile: utils.findTableFile('starHavocEventReward'),
  mapDir: findFirstExistingMapDir(),
  mapCacheRoot: DEFAULT_MAP_CACHE_ROOT,
  manifestPath: DEFAULT_MANIFEST_PATH,
  baseUrl: DEFAULT_BASE_URL,
  syncMaps: true,
};

const DISPLAY_PROP_KEYS = [
  'hp', 'atk', 'def', 'healHp',
  'hitVal', 'dodge', 'crit', 'tenacity',
  'lucky', 'guardian', 'break', 'protect'
];

const SPECIAL_STAGE_TYPE_CONFIG = {
  2: {
    noteText: '',
    levelOverrideMode: 'input',
  },
  33: {
    noteText: '联盟BOSS固定等级属性不变,噩梦与挑战属性会随世界等级改变,默认以当前版本满级展示',
    levelOverrideMode: 'preset',
  },
  44: {
    noteText: '秘海遗墟副本等级以队长等级为准,输入队长等级查看对应属性',
    levelOverrideMode: 'input',
  },
  45: {
    noteText: '七星战场使用固定等级档位计算属性',
    levelOverrideMode: 'preset',
  },
};

const STAGE_TYPE_RULES = {
  1: { label: '主线关卡', slug: 'mainline', exportable: true, filterMode: 'mainline' },
  2: { label: '幻境', slug: 'illusion', exportable: true, filterMode: 'illusion_base' },
  3: { label: '幻境', slug: 'illusion_b', exportable: false, skipReason: '属性算法不同，暂不导出' },
  4: { label: '罗汉堂', slug: 'arhat_hall', exportable: true },
  5: { label: '神兽森林', slug: 'divine_beast_forest', exportable: true },
  6: { label: '噩梦关卡', slug: 'nightmare', exportable: true },
  7: { label: '悬赏', slug: 'bounty', exportable: false, skipReason: '规则仍有问题，暂不导出' },
  8: { label: '斗宠相关', slug: 'pet_duel', exportable: false, skipReason: '非 BOSS 关卡，暂不导出' },
  9: { label: '藏灵洞', slug: 'hidden_cave', exportable: false, skipReason: 'BOSS 结构特殊，暂不导出' },
  10: { label: 'PVP关卡', slug: 'pvp_10', exportable: false, skipReason: 'PVP 关卡，暂不导出' },
  11: { label: 'PVP关卡', slug: 'pvp_11', exportable: false, skipReason: 'PVP 关卡，暂不导出' },
  12: { label: 'PVP关卡', slug: 'pvp_12', exportable: false, skipReason: 'PVP 关卡，暂不导出' },
  13: { label: 'PVP关卡', slug: 'pvp_13', exportable: false, skipReason: 'PVP 关卡，暂不导出' },
  14: { label: 'PVP关卡', slug: 'pvp_14', exportable: false, skipReason: 'PVP 关卡，暂不导出' },
  15: { label: 'PVP关卡', slug: 'pvp_15', exportable: false, skipReason: 'PVP 关卡，暂不导出' },
  16: { label: '联盟任务', slug: 'guild_task', exportable: false, skipReason: '存在特殊效果，暂不导出' },
  17: { label: '训练场', slug: 'training_ground', exportable: false, skipReason: '暂不导出' },
  18: { label: '七夕活动', slug: 'qixi_event', exportable: true },
  19: { label: '特殊关卡', slug: 'special_19', exportable: false, skipReason: '暂不导出' },
  20: { label: '特殊关卡', slug: 'special_20', exportable: false, skipReason: '暂不导出' },
  21: { label: '特殊关卡', slug: 'special_21', exportable: false, skipReason: '暂不导出' },
  22: { label: '特殊关卡', slug: 'special_22', exportable: false, skipReason: '暂不导出' },
  23: { label: '昆仑副本', slug: 'kunlun', exportable: true },
  24: { label: '特殊关卡', slug: 'special_24', exportable: false, skipReason: '暂不导出' },
  25: { label: '特殊关卡', slug: 'special_25', exportable: false, skipReason: '暂不导出' },
  26: { label: '特殊关卡', slug: 'special_26', exportable: false, skipReason: '暂不导出' },
  27: { label: '特殊关卡', slug: 'special_27', exportable: false, skipReason: '暂不导出' },
  28: { label: '特殊关卡', slug: 'special_28', exportable: false, skipReason: '暂不导出' },
  29: { label: '特殊关卡', slug: 'special_29', exportable: false, skipReason: '暂不导出' },
  30: { label: '特殊关卡', slug: 'special_30', exportable: false, skipReason: '暂不导出' },
  32: { label: '混沌之门', slug: 'chaos_gate', exportable: true },
  33: { label: '联盟BOSS', slug: 'guild_boss', exportable: true },
  34: { label: '特殊副本', slug: 'special_34', exportable: false, skipReason: '暂不导出' },
  35: { label: '特殊副本', slug: 'special_35', exportable: false, skipReason: '暂不导出' },
  36: { label: '特殊副本', slug: 'special_36', exportable: false, skipReason: '暂不导出' },
  37: { label: '精英副本', slug: 'elite_stage', exportable: true },
  38: { label: '特殊副本', slug: 'special_38', exportable: false, skipReason: '暂不导出' },
  39: { label: '特殊副本', slug: 'special_39', exportable: false, skipReason: '暂不导出' },
  40: { label: '福利秘境', slug: 'benefit_realm', exportable: true },
  41: { label: '特殊关卡', slug: 'special_41', exportable: false, skipReason: '暂不导出' },
  42: { label: '特殊关卡', slug: 'special_42', exportable: false, skipReason: '暂不导出' },
  43: { label: '招摇山', slug: 'zhaoyao_mountain', exportable: true },
  44: { label: '秘海遗墟', slug: 'secret_sea_ruins', exportable: true },
  45: { label: '七星战场', slug: 'seven_star_battlefield', exportable: true, filterMode: 'star_havoc' },
  46: { label: '特殊副本', slug: 'special_46', exportable: false, skipReason: '暂不导出' },
  47: { label: '特殊关卡', slug: 'special_47', exportable: false, skipReason: '暂不导出' },
  50: { label: '特殊关卡', slug: 'special_50', exportable: false, skipReason: '暂不导出' },
  51: { label: '特殊关卡', slug: 'special_51', exportable: false, skipReason: '暂不导出' },
  101: { label: '十绝阵-和平', slug: 'juezhen_peace', exportable: true },
  102: { label: '十绝阵-自由', slug: 'juezhen_free', exportable: true },
  103: { label: '十绝阵-势力', slug: 'juezhen_faction', exportable: true },
  104: { label: '十绝阵-噩梦', slug: 'juezhen_nightmare', exportable: true },
  105: { label: '混乱空间', slug: 'chaos_space', exportable: false, skipReason: '暂不导出' },
  201: { label: '玲珑宝塔', slug: 'linglong_tower', exportable: true },
  202: { label: '特殊关卡', slug: 'special_202', exportable: false, skipReason: '暂不导出' },
  203: { label: '特殊关卡', slug: 'special_203', exportable: false, skipReason: '暂不导出' },
  1002: { label: '兜率宫', slug: 'doushuai_palace', exportable: true },
};

class CommandParser {
  static parse() {
    const args = {
      types: [],
      out: null,
      stageFile: DEFAULT_CONFIG.stageFile,
      monsterFile: DEFAULT_CONFIG.monsterFile,
      attrFile: DEFAULT_CONFIG.attrFile,
      skillFile: DEFAULT_CONFIG.skillFile,
      beskillFile: DEFAULT_CONFIG.beskillFile,
      constsFile: DEFAULT_CONFIG.constsFile,
      leagueBossCopyFile: DEFAULT_CONFIG.leagueBossCopyFile,
      leagueBossReallyFile: DEFAULT_CONFIG.leagueBossReallyFile,
      kunlunWaveFile: DEFAULT_CONFIG.kunlunWaveFile,
      roguelikeBaseFile: DEFAULT_CONFIG.roguelikeBaseFile,
      roguelikeFile: DEFAULT_CONFIG.roguelikeFile,
      starHavocAttrFile: DEFAULT_CONFIG.starHavocAttrFile,
      starHavocEventFile: DEFAULT_CONFIG.starHavocEventFile,
      starHavocRewardFile: DEFAULT_CONFIG.starHavocRewardFile,
      mapDir: DEFAULT_CONFIG.mapDir,
      mapCacheRoot: DEFAULT_CONFIG.mapCacheRoot,
      manifestPath: DEFAULT_CONFIG.manifestPath,
      baseUrl: DEFAULT_CONFIG.baseUrl,
      syncMaps: DEFAULT_CONFIG.syncMaps,
      help: false,
    };

    for (let index = 2; index < process.argv.length; index += 1) {
      const arg = process.argv[index];
      if (arg === '--types') {
        args.types = String(process.argv[++index] || '')
          .split(',')
          .map((item) => Number(item.trim()))
          .filter((item) => Number.isFinite(item));
      } else if (arg === '--out') {
        args.out = process.argv[++index];
      } else if (arg === '--stage-file') {
        args.stageFile = process.argv[++index];
      } else if (arg === '--monster-file') {
        args.monsterFile = process.argv[++index];
      } else if (arg === '--attr-file') {
        args.attrFile = process.argv[++index];
      } else if (arg === '--skill-file') {
        args.skillFile = process.argv[++index];
      } else if (arg === '--beskill-file') {
        args.beskillFile = process.argv[++index];
      } else if (arg === '--consts-file') {
        args.constsFile = process.argv[++index];
      } else if (arg === '--league-boss-copy-file') {
        args.leagueBossCopyFile = process.argv[++index];
      } else if (arg === '--league-boss-really-file') {
        args.leagueBossReallyFile = process.argv[++index];
      } else if (arg === '--kunlun-wave-file') {
        args.kunlunWaveFile = process.argv[++index];
      } else if (arg === '--roguelike-base-file') {
        args.roguelikeBaseFile = process.argv[++index];
      } else if (arg === '--roguelike-file') {
        args.roguelikeFile = process.argv[++index];
      } else if (arg === '--star-havoc-attr-file') {
        args.starHavocAttrFile = process.argv[++index];
      } else if (arg === '--star-havoc-event-file') {
        args.starHavocEventFile = process.argv[++index];
      } else if (arg === '--star-havoc-reward-file') {
        args.starHavocRewardFile = process.argv[++index];
      } else if (arg === '--map-dir') {
        args.mapDir = process.argv[++index];
      } else if (arg === '--map-cache-root') {
        args.mapCacheRoot = process.argv[++index];
      } else if (arg === '--manifest') {
        args.manifestPath = process.argv[++index];
      } else if (arg === '--base-url') {
        args.baseUrl = process.argv[++index];
      } else if (arg === '--skip-map-sync') {
        args.syncMaps = false;
      } else if (arg === '--help' || arg === '-h') {
        args.help = true;
      }
    }

    return args;
  }
}

function flattenStageMapNames(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue.flatMap((item) => flattenStageMapNames(item));
  }
  if (typeof rawValue === 'string' && rawValue.trim() !== '') {
    return [rawValue.trim()];
  }
  return [];
}

function getStageTypeRule(stageType) {
  if (stageType != null && Object.prototype.hasOwnProperty.call(STAGE_TYPE_RULES, stageType)) {
    return STAGE_TYPE_RULES[stageType];
  }
  return {
    label: stageType == null ? '未知类型' : `Type ${stageType}`,
    slug: stageType == null ? 'unknown' : `type_${stageType}`,
    exportable: false,
    skipReason: '未配置导出规则',
  };
}

function isTestLikeStage(stage) {
  const samples = [stage?.name, ...flattenStageMapNames(stage?.map)]
    .filter(Boolean)
    .join(' ');
  return /(测试|test|tset|ceshi)/i.test(samples);
}

function isMainlineStage(stage) {
  const mapNames = flattenStageMapNames(stage?.map);
  return mapNames.some((mapName) => /^No_([1-9]\d*)(-|$)/.test(mapName));
}

function isIllusionBaseStage(stage) {
  if (toNumber(stage?.type) !== 2) {
    return false;
  }
  return flattenStageMapNames(stage?.map).length === 0;
}

function isStarHavocStage(stage) {
  return toNumber(stage?.type) === 45;
}

function getMaxLevel() {
  const settings = loadAppSettings();
  const maxLevel = settings?.data?.maxLevel;
  if (typeof maxLevel !== 'number') {
    throw new Error('settings.js 中未配置有效的 data.maxLevel');
  }
  return maxLevel;
}

function shouldExportStage(stage, options) {
  if (!stage || stage.id == null) {
    return false;
  }

  if (toNumber(stage.closeStage) === 1) {
    return false;
  }

  const maxLevel = getMaxLevel();
  const stageLv = toNumber(stage.lv, 0);
  const stageLvOpen = toNumber(stage.lvOpen, 0);
  if (stageLv > maxLevel && stageLvOpen > maxLevel) {
    return false;
  }

  const stageType = toNumber(stage.type);
  const rule = getStageTypeRule(stageType);

  if (options.types.length > 0 && !options.types.includes(stageType)) {
    return false;
  }

  if (!rule.exportable) {
    return false;
  }

  if (isTestLikeStage(stage)) {
    return false;
  }

  if (rule.filterMode === 'mainline') {
    return isMainlineStage(stage);
  }

  if (rule.filterMode === 'illusion_base') {
    return isIllusionBaseStage(stage);
  }

  if (rule.filterMode === 'star_havoc') {
    return isStarHavocStage(stage);
  }

  return true;
}

function collectStageMapNames(stages) {
  return Array.from(new Set(
    stages.flatMap((stage) => flattenStageMapNames(stage?.map)).filter(Boolean)
  ));
}

function buildBossTypeFileName(stageType, slug) {
  return `${BOSS_OUTPUT_PREFIX}_${String(stageType).padStart(4, '0')}_${slug}`;
}

class DataLoader {
  constructor(config) {
    this.config = config;
  }

  readJson(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  loadAll() {
    console.log(`正在加载 stage 配置: ${this.config.stageFile}`);
    const stages = this.readJson(this.config.stageFile) || [];

    console.log(`正在加载 monster 配置: ${this.config.monsterFile}`);
    const monsters = this.readJson(this.config.monsterFile) || [];

    console.log(`正在加载 monsterAttribute 配置: ${this.config.attrFile}`);
    const attrs = this.readJson(this.config.attrFile) || [];

    console.log(`正在加载 skill 配置: ${this.config.skillFile}`);
    const skills = this.readJson(this.config.skillFile) || [];

    console.log(`正在加载 beskill 配置: ${this.config.beskillFile}`);
    const beskills = this.readJson(this.config.beskillFile) || [];

    console.log(`正在加载 consts 配置: ${this.config.constsFile}`);
    const consts = this.readJson(this.config.constsFile) || [];

    console.log(`正在加载 leagueBossCopy 配置: ${this.config.leagueBossCopyFile}`);
    const leagueBossCopies = this.readJson(this.config.leagueBossCopyFile) || [];

    console.log(`正在加载 leagueBossReally 配置: ${this.config.leagueBossReallyFile}`);
    const leagueBossReallies = this.readJson(this.config.leagueBossReallyFile) || [];

    console.log(`正在加载 buildProtectKunLunWave 配置: ${this.config.kunlunWaveFile}`);
    const kunlunWaves = this.readJson(this.config.kunlunWaveFile) || [];

    console.log(`正在加载 roguelikeBase 配置: ${this.config.roguelikeBaseFile}`);
    const roguelikeBases = this.readJson(this.config.roguelikeBaseFile) || [];

    console.log(`正在加载 roguelike 配置: ${this.config.roguelikeFile}`);
    const roguelikes = this.readJson(this.config.roguelikeFile) || [];

    console.log(`正在加载 starHavocMonsterAttribute 配置: ${this.config.starHavocAttrFile}`);
    const starHavocAttrs = this.readJson(this.config.starHavocAttrFile) || [];

    console.log(`正在加载 starHavocEvent 配置: ${this.config.starHavocEventFile}`);
    const starHavocEvents = this.readJson(this.config.starHavocEventFile) || [];

    console.log(`正在加载 starHavocEventReward 配置: ${this.config.starHavocRewardFile}`);
    const starHavocRewards = this.readJson(this.config.starHavocRewardFile) || [];

    return {
      stages,
      monsters,
      attrs,
      skills,
      beskills,
      consts,
      leagueBossCopies,
      leagueBossReallies,
      kunlunWaves,
      roguelikeBases,
      roguelikes,
      starHavocAttrs,
      starHavocEvents,
      starHavocRewards,
    };
  }
}

class MapParser {
  constructor(mapDir) {
    this.mapDir = mapDir;
    this.cache = new Map();
  }

  findMapFile(mapName) {
    if (!mapName || !this.mapDir || !fs.existsSync(this.mapDir)) {
      return null;
    }

    const candidates = [
      path.join(this.mapDir, `${mapName}.cc.json`),
      path.join(this.mapDir, `${mapName}.json`),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  parseMapData(rawData) {
    if (!rawData) {
      return null;
    }

    if (rawData?.triggers?.manCreater || rawData?.triggers?.monsterTrigger) {
      return rawData;
    }

    const visited = new Set();
    const findPayload = (node) => {
      if (!node || typeof node !== 'object') {
        return null;
      }
      if (visited.has(node)) {
        return null;
      }
      visited.add(node);

      if (node?.triggers?.manCreater || node?.triggers?.monsterTrigger) {
        return node;
      }

      if (Array.isArray(node)) {
        for (const item of node) {
          const found = findPayload(item);
          if (found) {
            return found;
          }
        }
        return null;
      }

      for (const key of Object.keys(node)) {
        const found = findPayload(node[key]);
        if (found) {
          return found;
        }
      }

      return null;
    };

    return findPayload(rawData);
  }

  buildPointScreenMap(mapPayload) {
    const pointToScreen = new Map();
    const screens = mapPayload?.screen || {};

    for (const [screenId, screenCfg] of Object.entries(screens)) {
      const screenNumber = toNumber(screenId);
      const mustPoints = Array.isArray(screenCfg?.mustPoints) ? screenCfg.mustPoints : [];
      for (const pointId of mustPoints) {
        pointToScreen.set(String(pointId), screenNumber);
      }
    }

    const monsterTriggers = Array.isArray(mapPayload?.triggers?.monsterTrigger)
      ? mapPayload.triggers.monsterTrigger
      : [];

    for (const trigger of monsterTriggers) {
      const screenNumber = toNumber(trigger?.screen);
      const points = Array.isArray(trigger?.points) ? trigger.points : [];
      for (const pointId of points) {
        if (!pointToScreen.has(String(pointId))) {
          pointToScreen.set(String(pointId), screenNumber);
        }
      }
    }

    return pointToScreen;
  }

  extractBossEntries(mapPayload) {
    const creators = mapPayload?.triggers?.manCreater;
    if (!creators || typeof creators !== 'object') {
      return [];
    }

    const pointToScreen = this.buildPointScreenMap(mapPayload);
    const results = [];

    for (const [creatorKey, creatorCfg] of Object.entries(creators)) {
      if (!creatorCfg) {
        continue;
      }

      const isBoss = creatorCfg.isBoss === true
        || creatorCfg.BossAppearHint === true
        || creatorCfg.BossKillHint === true;

      if (!isBoss) {
        continue;
      }

      const screenKey = String(creatorCfg.id ?? creatorKey);
      // Some maps keep the actual boss candidates in RandomIds while mIds is only a spawn template.
      const randomIds = normalizeIds(creatorCfg.RandomIds);
      const sourceField = randomIds.length > 0 ? 'RandomIds' : 'mIds';
      const monsterIds = randomIds.length > 0 ? randomIds : normalizeIds(creatorCfg.mIds);
      for (const monsterId of monsterIds) {
        const rebirth = this.findRebirthConfig(mapPayload, screenKey);
        results.push({
          id: monsterId,
          creatorKey,
          creator: creatorCfg,
          screen: pointToScreen.get(screenKey) ?? null,
          source: 'map',
          sourceField,
          rebirth,
        });
      }
    }

    return results;
  }

  findRebirthConfig(mapPayload, pointId) {
    const mapFunctions = Array.isArray(mapPayload?.mapFunctions) ? mapPayload.mapFunctions : [];
    for (const mapFunction of mapFunctions) {
      if (toNumber(mapFunction?.type) !== 15) {
        continue;
      }
      const points = Array.isArray(mapFunction.points) ? mapFunction.points : [];
      const index = points.findIndex((value) => String(value) === String(pointId));
      if (index < 0) {
        continue;
      }
      return {
        type: 15,
        name: mapFunction.name || null,
        pointId: String(pointId),
        index,
        useHpCount: mapFunction.useHpCount ?? null,
        reburnDelayFram: mapFunction.reburnDelayFram ?? null,
        dieSkills: Array.isArray(mapFunction.dieSkills) ? mapFunction.dieSkills : [],
        reburnSkills: Array.isArray(mapFunction.reburnSkills) ? mapFunction.reburnSkills : [],
        reburnVskills: Array.isArray(mapFunction.reburnVskills) ? mapFunction.reburnVskills : [],
        switchAIs: Array.isArray(mapFunction.switchAIs) ? mapFunction.switchAIs : [],
        dieSkill: mapFunction.dieSkills?.[index] ?? null,
        reburnSkill: mapFunction.reburnSkills?.[index] ?? null,
        reburnVskill: mapFunction.reburnVskills?.[index] ?? null,
        switchAI: mapFunction.switchAIs?.[index] ?? null,
      };
    }
    return null;
  }

  getBossEntriesByMapName(mapName) {
    if (!mapName) {
      return [];
    }

    if (this.cache.has(mapName)) {
      return this.cache.get(mapName);
    }

    const mapPath = this.findMapFile(mapName);
    if (!mapPath) {
      this.cache.set(mapName, []);
      return [];
    }

    try {
      const rawData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
      const payload = this.parseMapData(rawData);
      const entries = this.extractBossEntries(payload);
      this.cache.set(mapName, entries);
      return entries;
    } catch (error) {
      console.warn(`[Warn] 读取地图文件出错 ${mapPath}: ${error.message}`);
      this.cache.set(mapName, []);
      return [];
    }
  }

  getBossEntriesByMapNames(mapValue) {
    const mapNames = flattenStageMapNames(mapValue);
    const merged = [];
    const seen = new Set();

    for (const mapName of mapNames) {
      const entries = this.getBossEntriesByMapName(mapName);
      for (const entry of entries) {
        const dedupeKey = [entry.id, entry.creatorKey ?? '', entry.screen ?? '', entry.source].join('|');
        if (seen.has(dedupeKey)) {
          const existing = merged.find((item) => item.dedupeKey === dedupeKey);
          if (existing && !existing.rebirth && entry.rebirth) {
            existing.rebirth = entry.rebirth;
            existing.mapName = mapName;
          }
          continue;
        }
        seen.add(dedupeKey);
        merged.push({ ...entry, mapName, dedupeKey });
      }
    }

    return merged.map(({ dedupeKey, ...entry }) => entry);
  }
}

class BattleRebirthResolver {
  constructor(monsters, skills, beskills, entityDir = BATTLE_ENTITY_DIR) {
    this.monsters = new Map(monsters.filter(Boolean).map((item) => [item.id, item]));
    this.skills = new Map(skills.filter(Boolean).map((item) => [item.id, item]));
    this.beskills = new Map(beskills.filter(Boolean).map((item) => [item.id, item]));
    this.entityDir = entityDir;
    this.cache = new Map();
  }

  loadEntityCfg(cfgFile) {
    if (!cfgFile) return null;
    if (this.cache.has(cfgFile)) return this.cache.get(cfgFile);
    const filePath = path.join(this.entityDir, `${cfgFile}.json`);
    const cfg = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null;
    this.cache.set(cfgFile, cfg);
    return cfg;
  }

  collectBeskillIds(actionCfg) {
    const ids = new Set();
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      const candidates = [
        node.beSkillId,
        node.id,
      ];
      for (const candidate of candidates) {
        const id = toNumber(candidate);
        const row = id == null ? null : this.beskills.get(id);
        if (row && row.label === 'allProp' && row.name === '狂暴') ids.add(id);
      }
      Object.values(node).forEach(visit);
    };
    visit(actionCfg);
    return [...ids];
  }

  resolve(monsterId, rebirth) {
    if (!rebirth) return null;
    const monster = this.monsters.get(monsterId);
    const skillIds = [rebirth.reburnSkill, rebirth.reburnVskill].filter((id) => id != null);
    const actions = [];
    const beskillIds = new Set();
    for (const skillId of skillIds) {
      const skill = this.skills.get(skillId);
      const cfg = this.loadEntityCfg(monster?.cfgFile);
      const action = skill?.entityAction || null;
      const actionCfg = cfg && action ? cfg[action] : null;
      if (action) actions.push(action);
      for (const id of this.collectBeskillIds(actionCfg)) beskillIds.add(id);
    }
    const beskills = [...beskillIds]
      .map((id) => this.beskills.get(id))
      .filter(Boolean)
      .map((row) => ({ id: row.id, name: row.name, label: row.label, attribute: row.attribute, text: row.text }));
    return {
      ...rebirth,
      actions: [...new Set(actions)],
      beskillIds: [...beskillIds],
      beskills,
    };
  }
}

class KunlunWaveResolver {
  constructor(waveList) {
    this.waveMap = new Map();
    for (const waveCfg of waveList) {
      const stageId = toNumber(waveCfg?.stageId);
      const waveId = toNumber(waveCfg?.waveId);
      if (stageId == null || waveId == null) {
        continue;
      }
      if (!this.waveMap.has(stageId)) {
        this.waveMap.set(stageId, new Map());
      }
      this.waveMap.get(stageId).set(waveId, waveCfg);
    }
  }

  getWave(stageId, waveId) {
    return this.waveMap.get(stageId)?.get(waveId) || null;
  }
}

class AttributeCalculator {
  constructor(monsterList, attrList) {
    this.monsters = new Map();
    for (const monster of monsterList) {
      if (monster && monster.id != null) {
        this.monsters.set(monster.id, monster);
      }
    }

    this.attrsByLevel = new Map();
    for (const attr of attrList) {
      if (attr && attr.lv != null) {
        this.attrsByLevel.set(attr.lv, attr);
      }
    }
  }

  resolveResistanceLabel(targetId) {
    const target = this.monsters.get(targetId);
    if (!target) {
      return null;
    }
    return target.name || target.remark || String(targetId);
  }

  resolveCoef(rawValue) {
    if (typeof rawValue === 'number') {
      return [rawValue, 0];
    }
    if (typeof rawValue === 'string' && rawValue.trim() !== '' && !Number.isNaN(Number(rawValue))) {
      return [Number(rawValue), 0];
    }
    if (Array.isArray(rawValue)) {
      return [toNumber(rawValue[0], 0), toNumber(rawValue[1], 0)];
    }
    if (rawValue && typeof rawValue === 'object') {
      const values = Object.values(rawValue).map((value) => toNumber(value, 0));
      return [values[0] || 0, values[1] || 0];
    }
    return [0, 0];
  }

  calculateBaseProps(monsterData, attrTpl) {
    const props = {};
    for (const prop of PROP_KEYS) {
      const baseValue = toNumber(attrTpl[prop], 0);
      const [multi, add] = this.resolveCoef(monsterData[prop]);
      props[prop] = Math.ceil(baseValue * multi + add);
    }
    props.maxHp = props.hp;
    props.maxMp = props.mp;
    return props;
  }

  buildDisplayFormula(monsterData) {
    const formula = {};
    for (const prop of DISPLAY_PROP_KEYS) {
      formula[prop] = this.resolveCoef(monsterData[prop]);
    }
    return formula;
  }

  cloneProps(props) {
    return JSON.parse(JSON.stringify(props));
  }

  applyHpMultiplier(props, ratio) {
    if (!(ratio > 0)) {
      return;
    }
    props.maxHp = Math.ceil(props.maxHp * ratio);
    props.hp = props.maxHp;
  }

  applyAtkMultiplier(props, ratio) {
    if (!(ratio > 0)) {
      return;
    }
    props.atk = Math.ceil(props.atk * ratio);
  }

  applyAllPropBeskills(props, beskills) {
    const result = this.cloneProps(props || {});
    let multiplier = 0;
    let addition = 0;
    for (const beskill of Array.isArray(beskills) ? beskills : []) {
      if (beskill?.label !== 'allProp') continue;
      const [multi, add] = this.resolveCoef(beskill.attribute);
      multiplier += multi;
      addition += add;
    }
    for (const prop of PROP_KEYS) {
      if (result[prop] == null) continue;
      result[prop] = Math.ceil(Number(result[prop]) * (1 + multiplier) + addition);
    }
    if (result.hp != null) result.maxHp = result.hp;
    if (result.mp != null) result.maxMp = result.mp;
    return result;
  }

  attachRebirthPhase(result, rebirth) {
    if (!rebirth) return result;
    const phaseTwo = {
      phase: 2,
      name: rebirth.beskills?.length > 0 ? '二阶段（复活·狂暴）' : '二阶段（复活）',
      calculatedProps: this.applyAllPropBeskills(result.calculatedProps, rebirth.beskills),
      hpCount: rebirth.useHpCount,
      reburnDelayFram: rebirth.reburnDelayFram,
      dieSkill: rebirth.dieSkill,
      reburnSkill: rebirth.reburnSkill,
      reburnVskill: rebirth.reburnVskill,
      switchAI: rebirth.switchAI,
      actions: rebirth.actions,
      beskillIds: rebirth.beskillIds,
      beskills: rebirth.beskills,
      source: 'mapFunctions.type=15 + battle-config/entityCtg',
    };
    if (result.calculatedPropsDouble) {
      phaseTwo.calculatedPropsDouble = this.applyAllPropBeskills(result.calculatedPropsDouble, rebirth.beskills);
    }
    result.phases = [
      {
        phase: 1,
        name: '一阶段',
        calculatedProps: this.cloneProps(result.calculatedProps),
        calculatedPropsDouble: result.calculatedPropsDouble
          ? this.cloneProps(result.calculatedPropsDouble)
          : undefined,
      },
      phaseTwo,
    ];
    return result;
  }

  calculateBoss(bossId, stageLevel, options = {}) {
    const monsterData = this.monsters.get(bossId);
    const attrTpl = this.attrsByLevel.get(stageLevel);

    if (!monsterData) {
      throw new Error(`找不到 ID 为 ${bossId} 的 monster 配置`);
    }
    if (!attrTpl) {
      throw new Error(`找不到 Level 为 ${stageLevel} 的 monsterAttribute 模板`);
    }

    const baseCalculatedProps = this.calculateBaseProps(monsterData, attrTpl);
    const calculatedProps = this.cloneProps(baseCalculatedProps);
    const hpRate = toNumber(options.hpRate, 0);

    if (hpRate > 0) {
      this.applyHpMultiplier(calculatedProps, hpRate);
    }

    const result = {
      id: bossId,
      bossId,
      name: monsterData.name || '',
      remark: monsterData.remark || '',
      level: stageLevel,
      resist: monsterData.resist ?? null,
      resistRole: monsterData.resistRole ?? null,
      resistRolePvp: monsterData.resistRolePvp ?? null,
      resistEntries: normalizeResistanceEntries(monsterData.resist),
      resistRoleEntries: normalizeResistanceEntries(monsterData.resistRole, (targetId) => this.resolveResistanceLabel(targetId)),
      resistRolePvpEntries: normalizeResistanceEntries(monsterData.resistRolePvp, (targetId) => this.resolveResistanceLabel(targetId)),
      baseCalculatedProps,
      calculatedProps,
    };

    if (options.includeFormula) {
      result.calcFormula = {
        coefficients: this.buildDisplayFormula(monsterData),
        hpRate,
      };
    }

    if (options.kunlunWave) {
      const wave = options.kunlunWave;
      const singleProps = this.cloneProps(baseCalculatedProps);
      const doubleProps = this.cloneProps(baseCalculatedProps);

      if (hpRate > 0) {
        this.applyHpMultiplier(singleProps, hpRate);
        this.applyHpMultiplier(doubleProps, hpRate);
      }

      this.applyHpMultiplier(singleProps, toNumber(wave.hp, 1));
      this.applyHpMultiplier(doubleProps, toNumber(wave.hpDouble, toNumber(wave.hp, 1)));
      this.applyAtkMultiplier(singleProps, toNumber(wave.atk, 1));
      this.applyAtkMultiplier(doubleProps, toNumber(wave.atk, 1));

      result.calculatedProps = singleProps;
      result.calculatedPropsDouble = doubleProps;
    }

    return result;
  }
}

function findFirstExistingMapDir() {
  const candidates = [
    path.join(ROOT, 'file', 'map'),
    path.join(ROOT, 'file', 'map', 'resources', 'map'),
    DEFAULT_MAP_CACHE_DIR,
    path.join(ROOT, 'data', 'map'),
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return DEFAULT_MAP_CACHE_DIR;
}

function toNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeIds(rawValue) {
  if (rawValue == null) {
    return [];
  }
  if (Array.isArray(rawValue)) {
    return rawValue.map((item) => toNumber(item)).filter((item) => item != null && item > 0);
  }
  if (typeof rawValue === 'number') {
    return rawValue > 0 ? [rawValue] : [];
  }
  if (typeof rawValue === 'string') {
    return rawValue.split(',').map((item) => toNumber(item.trim())).filter((item) => item != null && item > 0);
  }
  return [];
}

function normalizeResistanceEntries(rawValue, resolveLabel) {
  if (rawValue == null) {
    return [];
  }

  if (Array.isArray(rawValue)) {
    return rawValue
      .map((item) => {
        if (Array.isArray(item)) {
          const id = toNumber(item[0]);
          return {
            id,
            label: resolveLabel ? resolveLabel(id) : null,
            value: toNumber(item[1], 0),
          };
        }
        if (item && typeof item === 'object') {
          const id = toNumber(item.id ?? item[0]);
          return {
            id,
            label: resolveLabel ? resolveLabel(id) : null,
            value: toNumber(item.value ?? item[1], 0),
          };
        }
        return null;
      })
      .filter((item) => item && item.id != null);
  }

  if (typeof rawValue === 'object') {
    return Object.entries(rawValue)
      .map(([key, value]) => {
        const id = toNumber(key);
        return {
          id,
          label: resolveLabel ? resolveLabel(id) : null,
          value: toNumber(value, 0),
        };
      })
      .filter((item) => item.id != null);
  }

  return [];
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureBossMaps(stages, options) {
  const mapDir = options.mapDir;
  const mapNames = collectStageMapNames(stages);
  const missingMaps = mapNames.filter((mapName) => {
    if (!mapDir || !fs.existsSync(mapDir)) {
      return true;
    }
    return !fs.existsSync(path.join(mapDir, `${mapName}.json`))
      && !fs.existsSync(path.join(mapDir, `${mapName}.cc.json`));
  });

  if (missingMaps.length === 0) {
    return mapDir;
  }

  if (!options.syncMaps) {
    return mapDir;
  }

  if (mapNames.length === 0) {
    return mapDir;
  }

  console.log(`[boss] 地图缓存缺失 ${missingMaps.length}/${mapNames.length}，开始同步 map JsonAsset 到 ${options.mapCacheRoot}`);
  ensureDir(path.dirname(options.manifestPath));
  ensureDir(options.mapCacheRoot);

  const result = spawnSync(
    process.execPath,
    [
      DOWNLOADER_PATH,
      'download',
      '--manifest', options.manifestPath,
      '--targets', 'json-asset',
      '--bundles', 'resources',
      '--path-prefix', 'map/',
      '--out', options.mapCacheRoot,
      '--base', options.baseUrl,
    ],
    {
      cwd: ROOT,
      stdio: 'inherit',
    }
  );

  if (result.status !== 0) {
    throw new Error(`同步地图资源失败，退出码 ${result.status}`);
  }

  return DEFAULT_MAP_CACHE_DIR;
}

function createFallbackBossEntries(stage) {
  const ids = normalizeIds(stage?.showMonsterId);
  return ids.map((id) => ({
    id,
    creatorKey: null,
    creator: null,
    screen: null,
    source: 'showMonsterId',
  }));
}

function dedupeBossEntriesByBossId(entries) {
  const uniqueEntries = [];
  const seenBossIds = new Map();

  for (const entry of Array.isArray(entries) ? entries : []) {
    const rawBossId = entry?.bossId ?? entry?.id;
    const bossIdKey = rawBossId == null ? '' : String(rawBossId);
    if (!bossIdKey) {
      continue;
    }
    if (seenBossIds.has(bossIdKey)) {
      const existing = seenBossIds.get(bossIdKey);
      if (!existing.rebirth && entry.rebirth) existing.rebirth = entry.rebirth;
      continue;
    }

    seenBossIds.set(bossIdKey, entry);
    uniqueEntries.push(entry);
  }

  return uniqueEntries;
}

function dedupeStageReportBossData(stageReport) {
  if (!stageReport || !Array.isArray(stageReport.bossData)) {
    return stageReport;
  }

  stageReport.bossData = dedupeBossEntriesByBossId(stageReport.bossData);
  return stageReport;
}

function buildStageGroups(stageReports) {
  const groupMap = new Map();

  for (const stageReport of stageReports) {
    const typeKey = stageReport.type == null ? 'unknown' : String(stageReport.type);
    const stageType = toNumber(stageReport.type);
    const rule = getStageTypeRule(stageType);
    if (!groupMap.has(typeKey)) {
      groupMap.set(typeKey, {
        type: stageReport.type,
        label: rule.label,
        slug: rule.slug,
        fileName: buildBossTypeFileName(stageType ?? 0, rule.slug),
        stageCount: 0,
        bossCount: 0,
        subTypes: new Set(),
        stages: [],
      });
    }

    const group = groupMap.get(typeKey);
    group.stageCount += 1;
    group.bossCount += stageReport.bossData.length;
    if (stageReport.subType != null) {
      group.subTypes.add(stageReport.subType);
    }
    group.stages.push(stageReport);
  }

  return Array.from(groupMap.values())
    .map((group) => ({
      ...group,
      subTypes: Array.from(group.subTypes).sort((lhs, rhs) => Number(lhs) - Number(rhs)),
      stages: group.stages.sort((lhs, rhs) => {
        return Number(lhs.stageLv) - Number(rhs.stageLv)
          || String(lhs.stageName).localeCompare(String(rhs.stageName), 'zh-Hans-CN')
          || Number(lhs.stageId) - Number(rhs.stageId);
      }),
    }))
    .sort((lhs, rhs) => Number(lhs.type ?? Number.MAX_SAFE_INTEGER) - Number(rhs.type ?? Number.MAX_SAFE_INTEGER));
}

function buildLevelTemplateMap(attrList) {
  const levelTemplates = {};

  for (const attr of attrList) {
    const level = toNumber(attr?.lv);
    if (level == null) {
      continue;
    }

    levelTemplates[level] = DISPLAY_PROP_KEYS.reduce((accumulator, prop) => {
      accumulator[prop] = toNumber(attr?.[prop], 0);
      return accumulator;
    }, {});
  }

  return levelTemplates;
}

function buildConstsMap(constList) {
  const constMap = new Map();
  for (const item of constList) {
    if (!item || item.key == null) {
      continue;
    }
    constMap.set(String(item.key), item.value);
  }
  return constMap;
}

function resolveLeagueBossStageLevel(levelValue, context) {
  const numericLevel = toNumber(levelValue);
  if (numericLevel != null) {
    return numericLevel;
  }
  return Math.max(1, toNumber(context.fallbackLevel, 1));
}

function buildLeagueBossStageReports(stages, context) {
  const stageIdSet = new Set(stages.map((stage) => stage.id));
  const stageReports = [];
  const configEntries = [
    ...context.leagueBossCopies.map((cfg) => ({ ...cfg, leagueMode: 'copy' })),
    ...context.leagueBossReallies.map((cfg) => ({ ...cfg, leagueMode: 'really' })),
  ];

  for (const configEntry of configEntries) {
    const stageId = toNumber(configEntry?.stageId);
    if (stageId == null || !stageIdSet.has(stageId)) {
      continue;
    }

    const stage = context.stageById.get(stageId);
    if (!stage) {
      continue;
    }

    const stageLevel = resolveLeagueBossStageLevel(configEntry.level, context);
    const bossId = toNumber(configEntry?.bossId);
    if (bossId == null) {
      continue;
    }

    const stageReport = {
      stageId,
      stageName: configEntry.name || stage.name || '',
      stageLv: stageLevel,
      type: stage.type,
      subType: stage.subType,
      mapName: stage.map,
      source: configEntry.leagueMode === 'copy' ? 'leagueBossCopy' : 'leagueBossReally',
      status: 'success',
      description: stage.name || '',
      stageDesc: stage.remark || '',
      leagueMode: configEntry.leagueMode,
      leagueLevelKey: configEntry.level,
      unlockWorldLv: toNumber(configEntry.unlockWorldLv),
      power: toNumber(configEntry.power),
      minimum: toNumber(configEntry.minimum),
      bossData: [],
    };

    try {
      const calcResult = context.calculator.calculateBoss(bossId, stageLevel, {
        includeFormula: true,
      });
      calcResult.source = stageReport.source;
      calcResult.leagueMode = configEntry.leagueMode;
      calcResult.leagueLevelKey = configEntry.level;
      calcResult.unlockWorldLv = toNumber(configEntry.unlockWorldLv);
      calcResult.power = toNumber(configEntry.power);
      calcResult.minimum = toNumber(configEntry.minimum);
      calcResult.originalStageLevel = configEntry.level;
      stageReport.bossData.push(calcResult);
    } catch (error) {
      stageReport.bossData.push({
        id: bossId,
        bossId,
        source: stageReport.source,
        error: error.message,
      });
      stageReport.status = 'partial_error';
    }

    dedupeStageReportBossData(stageReport);
    if (stageReport.bossData.length > 0) {
      stageReports.push(stageReport);
    }
  }

  return stageReports;
}

function extractFixedLevels(rows) {
  return Array.from(new Set(
    rows
      .map((row) => toNumber(row?.value))
      .filter((value) => value != null)
  )).sort((lhs, rhs) => lhs - rhs);
}

function buildIllusionStageReport(stage, context) {
  const baseCfg = context.roguelikeBaseById.get(stage.id);
  if (!baseCfg) {
    return null;
  }

  const storeys = [1, 2, 3]
    .map((storeyIndex) => {
      const rogueIds = Array.isArray(baseCfg[`storey${storeyIndex}`]?.[0])
        ? baseCfg[`storey${storeyIndex}`][0].map((value) => toNumber(value)).filter((value) => value != null)
        : [];

      if (rogueIds.length === 0) {
        return null;
      }

      return {
        storey: storeyIndex,
        rogueIds,
        rogueNames: rogueIds.map((rogueId) => context.roguelikeById.get(rogueId)?.name || String(rogueId)),
        bossLevel: baseCfg[`levelBossStorey${storeyIndex}`] ?? null,
      };
    })
    .filter(Boolean);

  if (storeys.length === 0) {
    return null;
  }

  const finalStorey = storeys[storeys.length - 1];
  const finalRogueId = finalStorey.rogueIds[finalStorey.rogueIds.length - 1];
  const finalRogue = context.roguelikeById.get(finalRogueId);
  const finalBossStageId = Array.isArray(finalRogue?.bossStages) && finalRogue.bossStages.length > 0
    ? finalRogue.bossStages[finalRogue.bossStages.length - 1]
    : null;
  const finalBossStage = finalBossStageId != null ? context.stageById.get(finalBossStageId) : null;
  const stageLevel = toNumber(stage.lv, 1);
  const mapBossEntries = context.mapParser.getBossEntriesByMapNames(finalBossStage?.map);
  const bossEntries = dedupeBossEntriesByBossId(
    mapBossEntries.length > 0 ? mapBossEntries : createFallbackBossEntries(finalBossStage || stage)
  );

  if (bossEntries.length === 0) {
    return null;
  }

  const stageReport = {
    stageId: stage.id,
    stageName: stage.name || '',
    stageLv: stageLevel,
    type: stage.type,
    subType: stage.subType,
    mapName: finalBossStage?.map ?? null,
    source: mapBossEntries.length > 0 ? 'map' : 'showMonsterId',
    bossData: [],
    status: 'success',
    description: '',
    stageDesc: stage.dstageDesc || '',
    levelOverride: {
      supported: true,
      defaultLevel: stageLevel,
      minLevel: context.levelRange.min,
      maxLevel: context.levelRange.max,
    },
    illusion: {
      finalStorey: finalStorey.storey,
      finalRogueId,
      finalRogueName: finalRogue?.name || '',
      finalBossStageId,
      finalBossStageName: finalBossStage?.name || '',
      finalBossMap: finalBossStage?.map || null,
      storeys,
    },
  };

  for (const bossEntry of bossEntries) {
    try {
      const optionsForBoss = {
        includeFormula: true,
      };
      const creatorHpRate = toNumber(bossEntry.creator?.hpRate, 0);
      if (creatorHpRate > 0) {
        optionsForBoss.hpRate = creatorHpRate;
      }

      const calcResult = context.calculator.calculateBoss(bossEntry.id, stageLevel, optionsForBoss);
      calcResult.creatorId = bossEntry.creatorKey;
      calcResult.screen = bossEntry.screen;
      calcResult.source = bossEntry.source;
      calcResult.sourceField = bossEntry.sourceField;

      stageReport.bossData.push(calcResult);
    } catch (error) {
      stageReport.bossData.push({
        id: bossEntry.id,
        bossId: bossEntry.id,
        creatorId: bossEntry.creatorKey,
        source: bossEntry.source,
        sourceField: bossEntry.sourceField,
        error: error.message,
      });
      stageReport.status = 'partial_error';
    }
  }

  dedupeStageReportBossData(stageReport);
  return stageReport.bossData.length > 0 ? stageReport : null;
}

function buildStarHavocStageReport(stage, context) {
  const defaultLevel = context.defaultLevel;
  const bossEntriesFromMap = context.mapParser.getBossEntriesByMapNames(stage.map);
  const bossEntriesFromEvent = context.starHavocEventBossEntriesByStage.get(stage.id) || [];
  const bossEntries = dedupeBossEntriesByBossId(
    bossEntriesFromMap.length > 0
      ? bossEntriesFromMap
      : (bossEntriesFromEvent.length > 0 ? bossEntriesFromEvent : createFallbackBossEntries(stage))
  );

  if (bossEntries.length === 0) {
    return null;
  }

  const stageReport = {
    stageId: stage.id,
    stageName: stage.name || '',
    stageLv: defaultLevel,
    type: stage.type,
    subType: stage.subType,
    mapName: stage.map,
    source: bossEntriesFromMap.length > 0
      ? 'map'
      : (bossEntriesFromEvent.length > 0 ? 'starHavocEvent' : 'showMonsterId'),
    bossData: [],
    status: 'success',
    description: '',
    stageDesc: stage.remark || '',
    levelOverride: {
      supported: true,
      mode: 'preset',
      defaultLevel,
      options: context.levelOptions,
    },
  };

  for (const bossEntry of bossEntries) {
    try {
      const calcResult = context.calculator.calculateBoss(bossEntry.id, defaultLevel, {
        includeFormula: true,
      });
      calcResult.creatorId = bossEntry.creatorKey;
      calcResult.screen = bossEntry.screen;
      calcResult.source = bossEntry.source;
      calcResult.sourceField = bossEntry.sourceField;
      stageReport.bossData.push(calcResult);
    } catch (error) {
      stageReport.bossData.push({
        id: bossEntry.id,
        bossId: bossEntry.id,
        creatorId: bossEntry.creatorKey,
        source: bossEntry.source,
        sourceField: bossEntry.sourceField,
        error: error.message,
      });
      stageReport.status = 'partial_error';
    }
  }

  dedupeStageReportBossData(stageReport);
  return stageReport.bossData.length > 0 ? stageReport : null;
}

function buildStarHavocEventBossEntries(eventList) {
  const stageBossMap = new Map();

  for (const eventCfg of eventList) {
    const stageId = toNumber(eventCfg?.otherData?.stage);
    if (stageId == null) {
      continue;
    }

    const rawMonsterInfo = eventCfg?.otherData?.monster;
    const monsterIds = Array.isArray(rawMonsterInfo)
      ? normalizeIds(rawMonsterInfo[1])
      : [];

    if (monsterIds.length === 0) {
      continue;
    }

    if (!stageBossMap.has(stageId)) {
      stageBossMap.set(stageId, []);
    }

    const targetEntries = stageBossMap.get(stageId);
    const existingIds = new Set(targetEntries.map((entry) => entry.id));

    for (const monsterId of monsterIds) {
      if (existingIds.has(monsterId)) {
        continue;
      }
      existingIds.add(monsterId);
      targetEntries.push({
        id: monsterId,
        creatorKey: `starHavocEvent:${eventCfg.id}`,
        creator: null,
        screen: null,
        source: 'starHavocEvent',
      });
    }
  }

  return stageBossMap;
}

function writeBossOutput(groupedData, outPath, options = {}) {
  if (outPath) {
    ensureDir(path.dirname(outPath));
    fs.writeFileSync(outPath, JSON.stringify(groupedData, null, 2), 'utf8');
    console.log(`结果文件保存在 -> ${outPath}`);
    return;
  }

  if (fs.existsSync(utils.OUTPUT_DIR)) {
    const targetFileNames = new Set();

    if (Array.isArray(options.types) && options.types.length > 0) {
      for (const stageType of options.types) {
        const rule = getStageTypeRule(stageType);
        targetFileNames.add(`${buildBossTypeFileName(stageType, rule.slug)}.json`);
      }
    }

    for (const fileName of fs.readdirSync(utils.OUTPUT_DIR)) {
      const isBossFile = /^boss_(stage_stats|type_\d+_.*)\.json$/.test(fileName);
      if (!isBossFile) {
        continue;
      }

      const shouldDelete = targetFileNames.size === 0
        ? true
        : targetFileNames.has(fileName);

      if (shouldDelete) {
        fs.unlinkSync(path.join(utils.OUTPUT_DIR, fileName));
      }
    }
  }

  for (const group of groupedData) {
    utils.saveOutput(group.fileName, group, {
      system: 'BOSS 属性',
      source: 'stage.*.json + monster.*.json + monsterAttribute.*.json + skill.*.json + beskิลl.*.json + consts.*.json + leagueBossCopy.*.json + leagueBossReally.*.json + buildProtectKunLunWave.*.json + resources/map/*.json + battle-config/entityCtg/*.json',
      grouping: '拆分为单个 stage.type 文件，便于维护与增量更新',
      stageType: group.type,
      stageTypeLabel: group.label,
      note: '首次提取若本地无地图缓存，会自动下载 map JsonAsset 到 file/map-cache/resources/map；地图缺失时回退 stage.showMonsterId',
    });
  }

  writeBossIndex(groupedData, options);

  console.log(`[boss] 已拆分输出 ${groupedData.length} 个类型文件`);
}

function bossIndexTypeOf(group) {
  return {
    routeKey: group.slug,
    fileName: group.fileName,
    type: group.type,
    label: group.label || `Type ${group.type}`,
    slug: group.slug,
    stageCount: group.stageCount,
    bossCount: group.bossCount,
    subTypes: Array.isArray(group.subTypes) ? group.subTypes : [],
    supportsLevelOverride: Boolean(group.supportsLevelOverride),
    levelOverrideMode: group.levelOverrideMode || null,
    defaultLevel: group.defaultLevel ?? null,
    levelOptions: Array.isArray(group.levelOptions) ? group.levelOptions : [],
    levelRange: group.levelRange || null,
    noteText: group.noteText || '',
  };
}

function buildBossIndexPayload(types) {
  const sortedTypes = [...types].sort((left, right) => Number(left.type ?? Number.MAX_SAFE_INTEGER) - Number(right.type ?? Number.MAX_SAFE_INTEGER));
  return {
    summary: {
      typeCount: sortedTypes.length,
      stageCount: sortedTypes.reduce((sum, item) => sum + Number(item.stageCount || 0), 0),
      bossCount: sortedTypes.reduce((sum, item) => sum + Number(item.bossCount || 0), 0),
    },
    types: sortedTypes,
  };
}

function readExistingBossIndexTypes() {
  const indexPath = path.join(utils.OUTPUT_DIR, `${BOSS_INDEX_OUTPUT_NAME}.json`);
  if (!fs.existsSync(indexPath)) return [];
  const payload = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  return Array.isArray(payload.data?.types) ? payload.data.types : [];
}

function writeBossIndex(groupedData, options = {}) {
  const currentTypes = groupedData.map(bossIndexTypeOf);
  let types = currentTypes;
  if (Array.isArray(options.types) && options.types.length > 0) {
    const merged = new Map(readExistingBossIndexTypes().map((entry) => [String(entry.type), entry]));
    for (const entry of currentTypes) {
      merged.set(String(entry.type), entry);
    }
    types = [...merged.values()];
  }

  utils.saveOutput(BOSS_INDEX_OUTPUT_NAME, buildBossIndexPayload(types), {
    system: 'BOSS 属性',
    source: 'boss_type_*.json',
    grouping: '轻量索引，只记录分类入口与详情文件名；具体关卡和属性保留在 boss_type_* 文件',
  });
}

function extractBossStats(options = {}) {
  const resolvedOptions = {
    ...DEFAULT_CONFIG,
    types: [],
    out: null,
    ...options,
  };

  const loader = new DataLoader(resolvedOptions);
  const {
    stages,
    monsters,
    attrs,
    skills,
    beskills,
    consts,
    leagueBossCopies,
    leagueBossReallies,
    kunlunWaves,
    roguelikeBases,
    roguelikes,
    starHavocAttrs,
    starHavocEvents,
    starHavocRewards,
  } = loader.loadAll();

  const targetStages = stages.filter((stage) => shouldExportStage(stage, resolvedOptions));

  const resolvedMapDir = ensureBossMaps(targetStages, resolvedOptions);
  const mapParser = new MapParser(resolvedMapDir);
  const calculator = new AttributeCalculator(monsters, attrs);
  const rebirthResolver = new BattleRebirthResolver(monsters, skills, beskills);
  const starHavocCalculator = new AttributeCalculator(monsters, starHavocAttrs);
  const kunlunResolver = new KunlunWaveResolver(kunlunWaves);
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const roguelikeBaseById = new Map(roguelikeBases.map((item) => [item.id, item]));
  const roguelikeById = new Map(roguelikes.map((item) => [item.id, item]));
  const constsByKey = buildConstsMap(consts);
  const starHavocEventBossEntriesByStage = buildStarHavocEventBossEntries(starHavocEvents);
  const levelTemplates = buildLevelTemplateMap(attrs);
  const levelValues = Object.keys(levelTemplates).map((value) => Number(value)).filter((value) => Number.isFinite(value));
  const maxConfiguredLevel = levelValues.length > 0 ? Math.max(...levelValues) : 1;
  const leagueBossDeploy = constsByKey.get('leagueBossDeploy') || {};
  const leagueBossDegreeWorldLv = leagueBossDeploy?.degreeWorldLv || {};
  const starHavocLevelTemplates = buildLevelTemplateMap(starHavocAttrs);
  const starHavocLevelOptions = extractFixedLevels(starHavocRewards).filter((value) => starHavocLevelTemplates[String(value)]);
  const starHavocDefaultLevel = starHavocLevelOptions[0] || 150;
  const results = [];

  const leagueBossStages = targetStages.filter((stage) => toNumber(stage.type) === 33);
  if (leagueBossStages.length > 0) {
    results.push(...buildLeagueBossStageReports(leagueBossStages, {
      stageById,
      calculator,
      leagueBossCopies,
      leagueBossReallies,
      fallbackLevel: 1,
    }));
  }

  console.log(`开始处理 stage 列表 (总计: ${targetStages.length} / 原始 ${stages.length})`);

  for (const stage of targetStages) {
    const stageType = toNumber(stage.type);
    if (stageType === 33) {
      continue;
    }
    if (stageType === 2) {
      const illusionStageReport = buildIllusionStageReport(stage, {
        stageById,
        roguelikeBaseById,
        roguelikeById,
        mapParser,
        calculator,
        levelRange: {
          min: levelValues.length > 0 ? Math.min(...levelValues) : 1,
          max: levelValues.length > 0 ? Math.max(...levelValues) : 1,
        },
      });
      if (illusionStageReport) {
        results.push(illusionStageReport);
      }
      continue;
    }

    if (stageType === 45) {
      const starHavocStageReport = buildStarHavocStageReport(stage, {
        mapParser,
        calculator: starHavocCalculator,
        defaultLevel: starHavocDefaultLevel,
        levelOptions: starHavocLevelOptions,
        starHavocEventBossEntriesByStage,
      });
      if (starHavocStageReport) {
        results.push(starHavocStageReport);
      }
      continue;
    }

    const stageLevel = stageType === 44 && levelValues.length > 0
      ? maxConfiguredLevel
      : toNumber(stage.lv, 1);
    const mapBossEntries = mapParser.getBossEntriesByMapNames(stage.map);
    const bossEntries = dedupeBossEntriesByBossId(
      mapBossEntries.length > 0 ? mapBossEntries : createFallbackBossEntries(stage)
    );
    if (bossEntries.length === 0) {
      continue;
    }

    const stageReport = {
      stageId: stage.id,
      stageName: stage.name || '',
      stageLv: stageLevel,
      type: stage.type,
      subType: stage.subType,
      mapName: stage.map,
      source: mapBossEntries.length > 0 ? 'map' : 'showMonsterId',
      bossData: [],
      status: 'success',
    };

    if (stageType === 44) {
      stageReport.levelOverride = {
        supported: true,
        defaultLevel: stageLevel,
        minLevel: levelValues.length > 0 ? Math.min(...levelValues) : 1,
        maxLevel: levelValues.length > 0 ? Math.max(...levelValues) : 1,
      };
    }

    for (const bossEntry of bossEntries) {
      try {
        const optionsForBoss = {};
        if (stageType === 44) {
          optionsForBoss.includeFormula = true;
        }

        const creatorHpRate = toNumber(bossEntry.creator?.hpRate, 0);
        if (creatorHpRate > 0) {
          optionsForBoss.hpRate = creatorHpRate;
        }

        if (stageType === 23) {
          const kunlunWave = kunlunResolver.getWave(stage.id, bossEntry.screen);
          if (kunlunWave) {
            optionsForBoss.kunlunWave = kunlunWave;
          }
        }

        const calcResult = calculator.calculateBoss(bossEntry.id, stageLevel, optionsForBoss);
        calcResult.creatorId = bossEntry.creatorKey;
        calcResult.screen = bossEntry.screen;
        calcResult.source = bossEntry.source;
        calcResult.sourceField = bossEntry.sourceField;
        const rebirth = rebirthResolver.resolve(bossEntry.id, bossEntry.rebirth);
        calculator.attachRebirthPhase(calcResult, rebirth);

        if (stageType === 23) {
          calcResult.mode = stage.subType === 230002 ? 'speed' : 'normal';
          calcResult.kunlunWave = optionsForBoss.kunlunWave
            ? {
              waveId: optionsForBoss.kunlunWave.waveId,
              hp: optionsForBoss.kunlunWave.hp,
              hpDouble: optionsForBoss.kunlunWave.hpDouble,
              atk: optionsForBoss.kunlunWave.atk,
            }
            : null;
        }

        stageReport.bossData.push(calcResult);
      } catch (error) {
        stageReport.bossData.push({
          id: bossEntry.id,
          creatorId: bossEntry.creatorKey,
          source: bossEntry.source,
          sourceField: bossEntry.sourceField,
          error: error.message,
        });
        stageReport.status = 'partial_error';
      }
    }

    dedupeStageReportBossData(stageReport);
    if (stageReport.bossData.length > 0) {
      results.push(stageReport);
    }
  }

  const groupedData = buildStageGroups(results);
  const illusionGroup = groupedData.find((group) => toNumber(group.type) === 2);
  if (illusionGroup) {
    illusionGroup.supportsLevelOverride = true;
    illusionGroup.levelOverrideMode = SPECIAL_STAGE_TYPE_CONFIG[2].levelOverrideMode;
    illusionGroup.levelTemplates = levelTemplates;
    illusionGroup.levelRange = {
      min: levelValues.length > 0 ? Math.min(...levelValues) : 1,
      max: levelValues.length > 0 ? Math.max(...levelValues) : 1,
    };
    illusionGroup.noteText = SPECIAL_STAGE_TYPE_CONFIG[2].noteText;
  }

  const starHavocGroup = groupedData.find((group) => toNumber(group.type) === 45);
  if (starHavocGroup) {
    starHavocGroup.supportsLevelOverride = true;
    starHavocGroup.levelOverrideMode = SPECIAL_STAGE_TYPE_CONFIG[45].levelOverrideMode;
    starHavocGroup.defaultLevel = starHavocDefaultLevel;
    starHavocGroup.levelOptions = starHavocLevelOptions;
    starHavocGroup.levelTemplates = starHavocLevelTemplates;
    starHavocGroup.noteText = SPECIAL_STAGE_TYPE_CONFIG[45].noteText;
  }

  const secretSeaGroup = groupedData.find((group) => toNumber(group.type) === 44);
  if (secretSeaGroup) {
    secretSeaGroup.supportsLevelOverride = true;
    secretSeaGroup.levelOverrideMode = SPECIAL_STAGE_TYPE_CONFIG[44].levelOverrideMode;
    secretSeaGroup.levelTemplates = levelTemplates;
    secretSeaGroup.levelRange = {
      min: levelValues.length > 0 ? Math.min(...levelValues) : 1,
      max: levelValues.length > 0 ? Math.max(...levelValues) : 1,
    };
    secretSeaGroup.noteText = SPECIAL_STAGE_TYPE_CONFIG[44].noteText;
    secretSeaGroup.defaultLevel = maxConfiguredLevel;
  }

  const leagueBossGroup = groupedData.find((group) => toNumber(group.type) === 33);
  if (leagueBossGroup) {
    leagueBossGroup.noteText = SPECIAL_STAGE_TYPE_CONFIG[33].noteText;
    leagueBossGroup.levelTemplates = levelTemplates;
    leagueBossGroup.levelRange = {
      min: levelValues.length > 0 ? Math.min(...levelValues) : 1,
      max: maxConfiguredLevel,
    };
    leagueBossGroup.degreeWorldLv = leagueBossDegreeWorldLv;
  }

  return groupedData;
}

class AppRunner {
  static run() {
    const args = CommandParser.parse();

    if (args.help) {
      console.log('Usage: node extract-boss-stats.js [--types 1,2] [--out boss.json]');
      console.log('--types: 仅导出指定 stage.type，用逗号分隔');
      console.log('--out: 输出原始 JSON 文件；不传时写入 output/boss_stage_stats.json');
      console.log('--map-dir: 已存在地图目录，默认优先使用 file/map 或 file/map-cache/resources/map');
      console.log('--skip-map-sync: 不自动下载地图资源');
      return;
    }

    console.log('>>> 开始提取任务...');
    console.log(`目标关卡 Type 过滤: ${args.types.length ? args.types.join(',') : '无(全选)'}`);
    console.log(`地图目录: ${args.mapDir}`);

    const groupedData = extractBossStats(args);

    console.log('======================');
    console.log(`提取完成! 共输出 ${groupedData.length} 个 Type 分组。`);
    writeBossOutput(groupedData, args.out ? path.resolve(args.out) : null, args);
  }
}

if (require.main === module) {
  try {
    AppRunner.run();
  } catch (error) {
    console.error('[Fatal] 遇到致命错误:', error);
    process.exit(1);
  }
}

module.exports = extractBossStats;
module.exports.writeBossOutput = writeBossOutput;
