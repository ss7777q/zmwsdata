/**
 * 角色 → 极限属性模块 source map
 *
 * 第一阶段先做证据盘点和战力权重确认。
 * 第二阶段逐步输出已严格确认公式的模块阶段曲线。
 * 缺少关键配置时输出 warning，避免用空值或默认值冒充真实数据。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const u = require('../lib/utils');
const { CONFIG_PATH, loadAppSettings } = require('../../server/app-config');

const RUNTIME_CONFIRMED_POWER_ATTRIBUTE_ID = 1;
const GAME_RUNTIME_INDEX = process.env.GAME_ANALYSIS_INDEX || 'D:\\zmws\\GameAnalysis\\data\\index.js';
const RUNTIME_EMBEDDED_TABLES = new Set(['breathing', 'breathingAcupoint']);
const SYS_BREATHING_ID = 65;
const RESIST_FIELD_BY_ID = {
  1: 'lightResist',
  2: 'darkResist',
  3: 'waterResist',
  4: 'fireResist',
  5: 'woodResist',
  6: 'windResist',
  7: 'soilResist',
  8: 'rayResist',
};
const MAGIC_BLESSING_GROWTH_BONUS_RATIO = 0.5;
const MAGIC_BLESSING_FIELD_BY_ID = {
  1: 'atk',
  3: 'mp',
  4: 'hp',
  5: 'def',
};
const MAGIC_SOUL_SLOT_TYPES = [
  { type: 1, label: '太阳' },
  { type: 2, label: '太阴' },
  { type: 3, label: '混元' },
];
const EQUIPMENT_PARTS = [
  { part: 'head', label: '头盔' },
  { part: 'armor', label: '护甲' },
  { part: 'foot', label: '鞋子' },
  { part: 'weapon', label: '武器' },
  { part: 'hand', label: '手部' },
  { part: 'jewelry', label: '饰品' },
];
// StrongerManager.getBestEquip 使用 1003e3 + getCanSynMaxStoneLv() 生成满配宝石 id。
const EQUIPMENT_BEST_STONE_ID_BASE = 1003000;
const EQUIPMENT_REGULAR_STONE_ID_MIN = 1000000;
const EQUIPMENT_REFINED_STONE_ID_MIN = 1100000;
const MAGIC_UNOBTAINABLE_PHASES = new Set([2]);
const SMELT_EQUIP_QUALITY_CHANGE = {
  5: 6,
  9: 26,
};
const SMELT_QUALITY_LABELS = {
  5: { smeltKind: 'shenhua', smeltKindLabel: '神化' },
  9: { smeltKind: 'mohua', smeltKindLabel: '魔化' },
};
// StrongerManager.getPowerByTypeMax(danqi) 对单槽丹气战力乘以 8。
const NEIDAN_DANQI_SLOT_COUNT = 8;
const TITLE_EXCLUSIVE_PROGRESS_TYPE_LABELS = {
  6: 'VIP',
  7: '仙位',
  8: '斗宠',
};
const TITLE_EXCLUSIVE_PROGRESS_TYPES = new Set(
  Object.keys(TITLE_EXCLUSIVE_PROGRESS_TYPE_LABELS).map(Number)
);
const MATRIX_CORE_TYPE = 'matrixCore';
const CONFIG_RANGE_MAX_INDEX = 1;
const PERCENT_DENOMINATOR = 100;

const PLAYER_ATTRIBUTE_ORDER = [
  { field: 'atk', label: '攻击' },
  { field: 'hp', label: '生命' },
  { field: 'def', label: '防御' },
  { field: 'mp', label: '魔法' },
  { field: 'healHp', label: '回血' },
  { field: 'healMp', label: '回魔' },
  { field: 'hitVal', label: '命中' },
  { field: 'dodge', label: '闪避' },
  { field: 'crit', label: '暴击' },
  { field: 'tenacity', label: '韧性' },
  { field: 'lucky', label: '幸运' },
  { field: 'guardian', label: '守护' },
  { field: 'break', label: '穿透' },
  { field: 'protect', label: '减伤' },
];
const SMELT_ATTR_FIELDS = PLAYER_ATTRIBUTE_ORDER.map(item => item.field);

const MODULE_DEFS = [
  {
    key: 'role_base',
    label: '角色等级基础',
    runtime: ['UserInfoManager.calAttribute_lv'],
    tables: ['monster', 'exp'],
    note: '按角色怪物模板属性乘等级成长表，另加元素抗性。',
  },
  {
    key: 'heart',
    label: '修炼/心法',
    runtime: ['UserInfoManager.calAttribute_xf'],
    tables: ['heart'],
    note: '从 fixHeartList 按属性等级读取 heart 表。',
  },
  {
    key: 'equipment',
    label: '装备基础/词条/强化/宝石/套装',
    runtime: ['UserInfoManager.calAttribute_equipment', 'UserInfoManager.calAttribute_suit'],
    tables: ['equip', 'equipAffix', 'equipUpgrade', 'equipUpgradeValue', 'stone', 'compose', 'equipSuitAttribute'],
    note: '读取 hero.equipments，叠加基础、附加词条、强化、宝石和套装。',
  },
  {
    key: 'fashion',
    label: '时装与时装宝珠',
    runtime: ['UserInfoManager.calAttribute_fashion', 'UserInfoManager.calAttribute_fashion_baozhu'],
    tables: ['equipFashion', 'equipFashionBall'],
    note: '时装宝珠按百分比放大已穿时装属性。',
  },
  {
    key: 'neidan',
    label: '内丹/丹气/丹元',
    runtime: ['UserInfoManager.getAttriByNeiDan_attr', 'UserInfoManager.calAttribute_neidan'],
    tables: ['danqi', 'danyuan'],
    note: '运行时读取存档页内 danqi.attr，候选生成逻辑需要继续追配置链。',
    requiresGenerationTrace: true,
  },
  {
    key: 'title',
    label: '称号',
    runtime: ['UserInfoManager.getAttriByTitles', 'UserInfoManager.getTitileAddZhanLiById', 'UserInfoManager.getTitleAttrByButeId'],
    tables: ['title', 'titleAttribute'],
    note: '按玩家等级选择 titleAttribute 档位。',
  },
  {
    key: 'magic',
    label: '法宝与器魂',
    runtime: ['UserInfoManager.getAttriByMaigc', 'UserInfoManager.calMagicWeaponSoul'],
    tables: ['magicWeapon', 'magicWeaponSoul', 'magicWeaponSoulLv'],
    note: '法宝基础值加成长值；祝福会放大主四维成长，器魂常驻属性另算。',
  },
  {
    key: 'wing',
    label: '翅膀',
    runtime: ['UserInfoManager.getWingAttr', 'UserInfoManager.getUserAllWingsAttrsAndPower'],
    tables: ['wing', 'wingAttribute'],
    note: '出战角色有 wingId 时汇总 wingBag 中所有翅膀属性。',
  },
  {
    key: 'feather',
    label: '羽毛',
    runtime: ['UserInfoManager.getUserAllFeatherAttrsAndPower'],
    tables: ['feather', 'featherAttribute', 'consts'],
    note: '运行时读取 hero.feathers[*].attr，候选洗练逻辑需要继续追配置链。',
    requiresGenerationTrace: true,
  },
  {
    key: 'xianpo',
    label: '仙魄/炼体',
    runtime: ['UserInfoManager.calAttribute_xianpo'],
    tables: ['xianpo', 'consts'],
    note: '遍历 trainingList，按 xianpoId 和 level 读取属性。',
  },
  {
    key: 'matrix',
    label: '阵法',
    runtime: ['UserInfoManager.calAllMatrixFightPower', 'UserInfoManager.calMatrixFightPower'],
    tables: ['matrix', 'matrixCore', 'matrixSuit'],
    note: '阵核属性加满核心套装属性。',
  },
  {
    key: 'starcore',
    label: '雁行/星核',
    runtime: ['UserInfoManager.calAllYanXingProperty', 'UserInfoManager.calYanXingProperty', 'UserInfoManager.calSatelliteProperty'],
    tables: ['starCore', 'expWorld'],
    note: '主星和卫星属性按世界等级计算。',
  },
  {
    key: 'meridians',
    label: '经脉',
    runtime: ['UserInfoManager.calAllMeridiansightPower', 'UserInfoManager.calMeridiansFightPower'],
    tables: ['meridians', 'meridiansAttribute', 'meridiansSpecial', 'meridiansSpecialPill', 'meridiansTemperatureQuality'],
    note: '累计每阶已开放属性，再按 inlayPill 属性加成放大。',
  },
  {
    key: 'smelt',
    label: '装备熔炼',
    runtime: ['UserInfoManager.getEquipSmeltAttr'],
    tables: ['item', 'equipSmelt', 'equipSmeltGrow'],
    note: '按装备品质映射、部位、熔炼等级和品质槽累加。',
  },
  {
    key: 'breathing',
    label: '奇穴',
    runtime: ['UserInfoManager.calBreathingPower'],
    tables: ['breathing', 'breathingAcupoint', 'sysUnlock', 'stage'],
    note: '官方系统名为奇穴；运行时记录和配置表名仍为 breathing。按精纯等级和品质倍率计算属性战力。',
    requiredForCompleteCharacterTotal: true,
  },
];

const BLOCKED_EXTREME_MODULE_DETAILS = {
  equipment: {
    status: 'blocked_needs_equipment_generation_trace',
    formula: '运行时从 hero.equipments 读取已生成装备实例，叠加基础属性、固定属性、随机词条、强化、宝石和套装；当前缺少可证明的极限装备实例生成链，不能从单表推出满配属性。',
    stageDimensions: ['equipPart', 'equipLevel', 'equipQuality', 'affixPool', 'stoneLevel'],
    sourceRules: [
      { label: '基础装备', detail: '装备实例 id 先关联 equip 基础行，按装备部位、等级、品质提供基础属性。' },
      { label: '固定/随机属性', detail: '运行时读取装备实例上的 attr、affixNum 等最终字段，并关联 equipFixed/equipAffix；随机词条候选池和取值上限需要继续追生成链。' },
      { label: '强化/宝石', detail: '强化来自 equipUpgrade/equipUpgradeValue；宝石来自装备孔位内 stone 配置。' },
      { label: '套装', detail: 'UserInfoManager.calAttribute_suit 按当前穿戴件数触发 equipSuitAttribute。' },
    ],
    blockers: [
      '缺少完整的极限装备实例生成闭环，不能确定每个部位最终装备 id、品质、随机词条数量、词条类型和词条取值。',
      '宝石孔位、套装件数和装备品质之间存在联动，必须等装备候选池闭合后一起计算。',
    ],
  },
  neidan: {
    status: 'blocked_needs_saved_attr_generation_trace',
    formula: '运行时 getAttriByNeiDan_attr 直接累加 hero.danqi[*].attr；这些 attr 是存档内最终属性，不是 danqi/danyuan 单表可直接推出的固定满配值。',
    stageDimensions: ['danqiSlot', 'danqiQuality', 'danyuanQuality', 'generatedAttr'],
    sourceRules: [
      { label: '运行时入口', detail: 'UserInfoManager.getAttriByNeiDan_attr 遍历 danqi 列表，把每个丹气对象 attr 中的最终属性累加。' },
      { label: '配置来源', detail: 'danqi、danqiFixed、danyuan 表能说明类型、品质、材料或部分固定项，但不能单独还原存档内最终 attr。' },
      { label: '战力计算', detail: '最终 attr 会通过 UserInfoManager.calAttribute_neidan 合入角色属性，再按 powerAttribute[1] 计算战力。' },
    ],
    blockers: [
      '需要追丹气/丹元生成、洗练、继承或品质成长链，确认每个槽的可选属性池和最大值。',
      '不能把配置表中的单段描述当成最终 attr，也不能用 0 代表未闭合部分。',
    ],
  },
  feather: {
    status: 'blocked_needs_feather_generation_trace',
    formula: '运行时 FashionManager.getUserAllFeatherAttrsAndPower 读取 hero.feathers[*].attr 并汇总；羽毛最终属性来自镶嵌对象，不是 feather/featherAttribute 表单独可闭合。',
    stageDimensions: ['featherHole', 'featherQuality', 'baptizeAttr'],
    sourceRules: [
      { label: '运行时入口', detail: 'FashionManager.getFeathersHole 取角色羽毛槽，UserInfoManager.getUserAllFeatherAttrsAndPower 汇总每个羽毛对象 attr。' },
      { label: '配置来源', detail: 'feather 与 featherAttribute 表能定位羽毛类型和属性字段，但洗练/生成后的最终 attr 仍需追服务端或生成链。' },
      { label: '战力计算', detail: '羽毛 attr 合入后按 powerAttribute[1] 权重计入角色战力。' },
    ],
    blockers: [
      '需要闭合羽毛生成/洗练的属性池、品质上限、孔位开放和同类限制。',
      '当前不能从 featherAttribute 推断每个已镶嵌羽毛的最终满配 attr。',
    ],
  },
  smelt: {
    status: 'blocked_depends_on_equipment_generation',
    formula: '装备熔炼由 StarHavocManager.getEquipSmeltAttr 按当前穿戴装备部位、装备品质、熔炼等级、品质槽和星石效果计算；装备候选池未闭合前不能单独给最终满配。',
    stageDimensions: ['equipPart', 'equipQuality', 'smeltLevel', 'qualityType', 'starStone'],
    sourceRules: [
      { label: '熔炼等级', detail: 'equipSmelt 按 part、quality、smeltLv 提供基础熔炼属性。' },
      { label: '成长/品质槽', detail: 'equipSmeltGrow 与存档 smeltData[part].qualityType 共同决定额外成长。' },
      { label: '装备依赖', detail: '运行时会读取当前穿戴装备品质并做品质映射，未确定最终装备时无法确定熔炼适用档。' },
    ],
    blockers: [
      '熔炼强依赖装备最终品质和部位，必须在装备模块闭合后一起计算。',
      '星石效果与品质槽需要继续追配置和运行时字段，不能先给孤立数值。',
    ],
  },
};

const tableCache = new Map();
const tableFileCache = new Map();
let runtimeIndexText = null;

function normalizeFileRef(file) {
  return String(file).replace(/\\/g, '/');
}

function loadRuntimeIndexText() {
  if (runtimeIndexText != null) return runtimeIndexText;
  if (!fs.existsSync(GAME_RUNTIME_INDEX)) {
    throw new Error(`找不到运行时代码文件: ${GAME_RUNTIME_INDEX}`);
  }
  runtimeIndexText = fs.readFileSync(GAME_RUNTIME_INDEX, 'utf8');
  return runtimeIndexText;
}

function extractBracketLiteral(text, startIndex, label) {
  let depth = 0;
  let inString = false;
  let quote = '';
  let escape = false;
  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }
    if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) return text.slice(startIndex, index + 1);
    }
  }
  throw new Error(`${label} 数组字面量未闭合。`);
}

function loadRuntimeEmbeddedTable(tableName) {
  const text = loadRuntimeIndexText();
  const moduleMarker = `${tableName}: [function(e, t)`;
  const moduleStart = text.indexOf(moduleMarker);
  if (moduleStart < 0) {
    throw new Error(`运行时 index.js 未找到内嵌表模块: ${tableName}`);
  }
  const varStart = text.indexOf('var i = ', moduleStart);
  if (varStart < 0) {
    throw new Error(`运行时内嵌表 ${tableName} 未找到 var i = 表数据。`);
  }
  const arrayStart = text.indexOf('[', varStart);
  if (arrayStart < 0) {
    throw new Error(`运行时内嵌表 ${tableName} 未找到数组起点。`);
  }
  const literal = extractBracketLiteral(text, arrayStart, `runtime.${tableName}`);
  const matrix = vm.runInNewContext(literal, Object.create(null), { timeout: 5000 });
  if (!Array.isArray(matrix) || !Array.isArray(matrix[0])) {
    throw new Error(`运行时内嵌表 ${tableName} 不是表头数组格式。`);
  }
  const headers = matrix[0];
  return matrix.slice(1).map((values, rowIndex) => {
    if (!Array.isArray(values)) {
      throw new Error(`运行时内嵌表 ${tableName} 第 ${rowIndex + 1} 行不是数组。`);
    }
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index];
    });
    return row;
  });
}

function loadDataTable(tableName) {
  if (tableCache.has(tableName)) return tableCache.get(tableName);
  let rows;
  if (RUNTIME_EMBEDDED_TABLES.has(tableName)) {
    let exists = false;
    try {
      u.findTableFile(tableName);
      exists = true;
    } catch (error) {
      // 找不到则进行提取
    }

    if (exists) {
      rows = u.loadTable(tableName);
    } else {
      rows = loadRuntimeEmbeddedTable(tableName);
      const filePath = path.join(u.DATA_DIR, `${tableName}.json`);
      fs.writeFileSync(filePath, JSON.stringify(rows, null, 2) + '\n', 'utf8');
      console.log(`  💾 已从运行时提取并保存外置配置表: dataApi/${tableName}.json`);
    }
  } else {
    rows = u.loadTable(tableName);
  }
  tableCache.set(tableName, rows);
  return rows;
}

function findDataTableFile(tableName) {
  if (tableFileCache.has(tableName)) return tableFileCache.get(tableName);
  let file;
  if (RUNTIME_EMBEDDED_TABLES.has(tableName)) {
    try {
      file = u.findTableFile(tableName);
    } catch (error) {
      file = `${GAME_RUNTIME_INDEX}#${tableName}`;
    }
  } else {
    file = u.findTableFile(tableName);
  }
  tableFileCache.set(tableName, file);
  return file;
}

function runtimeEvidence() {
  const warnings = [];
  if (!fs.existsSync(GAME_RUNTIME_INDEX)) {
    return {
      source: GAME_RUNTIME_INDEX,
      available: false,
      markers: {},
      warnings: [`找不到运行时代码文件: ${GAME_RUNTIME_INDEX}`],
    };
  }

  const text = loadRuntimeIndexText();
  const lines = text.split(/\r?\n/);
  const markers = {};

  const markerNames = new Set([
    'ModelManager.calFightPower',
    'ModelManager.getUserFightPower',
    'UserInfoManager.getUserFightPower',
    'UserInfoManager.calFightPower',
    ...MODULE_DEFS.flatMap(module => module.runtime),
  ]);

  for (const marker of markerNames) {
    const needle = `${marker} = function`;
    const lineIndex = lines.findIndex(line => line.includes(needle));
    markers[marker] = lineIndex >= 0
      ? { found: true, line: lineIndex + 1 }
      : { found: false };
    if (lineIndex < 0) warnings.push(`运行时代码未找到入口: ${marker}`);
  }

  return {
    source: GAME_RUNTIME_INDEX,
    available: true,
    markers,
    warnings,
  };
}

function loadTableStatus(tableName) {
  try {
    return {
      table: tableName,
      available: true,
      file: tableFileRef(tableName),
      sourceType: RUNTIME_EMBEDDED_TABLES.has(tableName) ? 'runtime_embedded' : 'dataApi',
      rows: Array.isArray(loadDataTable(tableName)) ? loadDataTable(tableName).length : null,
    };
  } catch (error) {
    return {
      table: tableName,
      available: false,
      warning: error.message,
    };
  }
}

function buildFightPowerInfo(tableStatusByName, warnings) {
  const powerStatus = tableStatusByName.powerAttribute;
  if (!powerStatus || !powerStatus.available) {
    throw new Error('缺少 powerAttribute 表，无法确认战力权重。');
  }

  const rows = loadDataTable('powerAttribute');
  const row = rows.find(item => item.id === RUNTIME_CONFIRMED_POWER_ATTRIBUTE_ID);
  if (!row) {
    throw new Error(`powerAttribute 缺少运行时确认的 id=${RUNTIME_CONFIRMED_POWER_ATTRIBUTE_ID} 权重。`);
  }

  const weights = {};
  const activeWeights = {};
  for (const [field, weight] of Object.entries(row)) {
    if (field === 'id') continue;
    if (typeof weight !== 'number') {
      warnings.push(`powerAttribute.${field} 不是数字权重，已跳过。`);
      continue;
    }
    weights[field] = weight;
    if (weight !== 0) activeWeights[field] = weight;
  }

  return {
    formula: 'floor(sum(attr[field] * powerAttribute[1][field]))',
    powerAttributeId: RUNTIME_CONFIRMED_POWER_ATTRIBUTE_ID,
    source: powerStatus.file,
    weights,
    activeWeights,
    zeroWeightFields: Object.keys(weights).filter(field => weights[field] === 0),
  };
}

function tableFileRef(tableName) {
  const file = findDataTableFile(tableName);
  if (file.includes('#')) return normalizeFileRef(file);
  return path.relative(u.ROOT, file).replace(/\\/g, '/');
}

function finiteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} 不是有效数字: ${value}`);
  }
  return value;
}

function finiteInteger(value, label) {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} 不是有效整数: ${value}`);
  }
  return value;
}

function loadConfiguredMaxLevel() {
  delete require.cache[require.resolve(CONFIG_PATH)];
  const rawSettings = require(CONFIG_PATH);
  const rawMaxLevel = rawSettings?.data?.maxLevel;
  finiteInteger(rawMaxLevel, 'settings.js data.maxLevel');

  const normalized = loadAppSettings();
  const configuredMaxLevel = normalized?.data?.maxLevel;
  finiteInteger(configuredMaxLevel, 'loadAppSettings().data.maxLevel');
  if (configuredMaxLevel !== rawMaxLevel) {
    throw new Error(`settings.js data.maxLevel=${rawMaxLevel} 与 loadAppSettings()=${configuredMaxLevel} 不一致。`);
  }
  return {
    maxLevel: configuredMaxLevel,
    source: path.relative(u.ROOT, CONFIG_PATH).replace(/\\/g, '/'),
  };
}

function loadConstValue(key) {
  const rows = loadDataTable('consts');
  const row = rows.find(item => item.key === key);
  if (!row) {
    throw new Error(`consts 表缺少 key=${key}。`);
  }
  return {
    id: row.id,
    key: row.key,
    value: row.value,
    file: tableFileRef('consts'),
  };
}

function countUnlockedByThresholds(value, thresholds, label) {
  finiteNumber(value, `${label}.value`);
  if (!Array.isArray(thresholds) || !thresholds.length) {
    throw new Error(`${label}.thresholds 不是非空数组。`);
  }
  for (let index = thresholds.length - 1; index >= 0; index -= 1) {
    const threshold = finiteNumber(thresholds[index], `${label}.thresholds.${index}`);
    if (value >= threshold) return index + 1;
  }
  return 0;
}

function addAttr(attrs, field, value, label) {
  finiteNumber(value, label);
  attrs[field] = (attrs[field] || 0) + value;
}

function addAttrList(attrs, fields, values, label) {
  if (!Array.isArray(fields) || !Array.isArray(values)) {
    throw new Error(`${label} 属性字段或数值不是数组。`);
  }
  if (fields.length !== values.length) {
    throw new Error(`${label} 属性字段数量(${fields.length})与数值数量(${values.length})不一致。`);
  }
  for (let index = 0; index < fields.length; index += 1) {
    addAttr(attrs, fields[index], values[index], `${label}.${fields[index]}`);
  }
}

function mergeAttrs(target, source, label) {
  for (const [field, value] of Object.entries(source || {})) {
    addAttr(target, field, value, `${label}.${field}`);
  }
  return target;
}

function mergeAttrsTimes(target, source, multiplier, label) {
  finiteInteger(multiplier, `${label}.multiplier`);
  for (const [field, value] of Object.entries(source || {})) {
    addAttr(target, field, finiteNumber(value, `${label}.${field}`) * multiplier, `${label}.${field}`);
  }
  return target;
}

function scaledAttrs(source, multiplier, label) {
  return mergeAttrsTimes({}, source, multiplier, label);
}

function roundAttrs(attrs) {
  const rounded = {};
  for (const [field, value] of Object.entries(attrs || {})) {
    rounded[field] = Math.round(finiteNumber(value, `round.${field}`));
  }
  return rounded;
}

function calcFightPower(attrs, activeWeights) {
  let total = 0;
  for (const [field, weight] of Object.entries(activeWeights)) {
    finiteNumber(weight, `powerAttribute.${field}`);
    if (Object.prototype.hasOwnProperty.call(attrs, field)) {
      total += finiteNumber(attrs[field], `attrs.${field}`) * weight;
    }
  }
  return Math.floor(total);
}

function makePoint({ moduleKey, stageKey, label, params, attrs, fightPower, evidence, warnings = [] }) {
  return {
    moduleKey,
    stageKey,
    label,
    params,
    attrs,
    fightPower,
    evidence,
    warnings,
  };
}

function contributionAttrsFromItems(items, attrKeys, label) {
  const attrs = {};
  for (const item of items || []) {
    for (const key of attrKeys) {
      mergeAttrs(attrs, item?.[key], `${label}.${key}`);
    }
  }
  return attrs;
}

function makeSystemContributionRow(key, label, attrs, activeWeights, source = 'role_extreme_stats') {
  const normalizedAttrs = roundAttrs(attrs || {});
  return {
    key,
    label,
    source,
    attrs: normalizedAttrs,
    fightPower: calcFightPower(normalizedAttrs, activeWeights),
  };
}

function buildSystemContributionRows(point, activeWeights) {
  const params = point.params || {};
  if (point.moduleKey === 'role_base') {
    return [makeSystemContributionRow('level', '基础属性', point.attrs, activeWeights)];
  }
  if (point.moduleKey === 'heart') {
    return [makeSystemContributionRow('heartMethod', '修心属性', point.attrs, activeWeights)];
  }
  if (point.moduleKey === 'equipment') {
    return [
      makeSystemContributionRow(
        'equipmentBaseUpgrade',
        '装备基础属性',
        contributionAttrsFromItems(params.selectedEquips, ['baseAttrs', 'upgradeAttrs'], 'equipment.baseUpgrade'),
        activeWeights
      ),
      makeSystemContributionRow(
        'equipmentAffix',
        '装备附加属性',
        contributionAttrsFromItems(params.selectedEquips, ['affixAttrs'], 'equipment.affix'),
        activeWeights
      ),
      makeSystemContributionRow(
        'equipmentGemstone',
        '宝石属性',
        contributionAttrsFromItems(params.selectedEquips, ['stoneAttrs'], 'equipment.gemstone'),
        activeWeights
      ),
      makeSystemContributionRow(
        'equipmentSet',
        '装备套装',
        contributionAttrsFromItems(params.selectedSuits, ['attrs'], 'equipment.set'),
        activeWeights
      ),
    ];
  }
  if (point.moduleKey === 'title') {
    return [makeSystemContributionRow('titles', '称号属性', point.attrs, activeWeights)];
  }
  if (point.moduleKey === 'fashion') {
    return [makeSystemContributionRow('fashion', '时装属性', point.attrs, activeWeights)];
  }
  if (point.moduleKey === 'magic') {
    return [makeSystemContributionRow('magics', '法宝属性', point.attrs, activeWeights)];
  }
  if (point.moduleKey === 'wing') {
    return [makeSystemContributionRow('wings', '翅膀属性', point.attrs, activeWeights)];
  }
  if (point.moduleKey === 'feather') {
    return [makeSystemContributionRow('feathers', '羽毛属性', point.attrs, activeWeights)];
  }
  if (point.moduleKey === 'xianpo') {
    return [makeSystemContributionRow('training', '炼体属性', point.attrs, activeWeights)];
  }
  if (point.moduleKey === 'matrix') {
    return [makeSystemContributionRow('matrix', '阵法属性', point.attrs, activeWeights)];
  }
  if (point.moduleKey === 'starcore') {
    return [makeSystemContributionRow('galaxy', '星核属性', point.attrs, activeWeights)];
  }
  if (point.moduleKey === 'meridians') {
    return [makeSystemContributionRow('meridians', '外丹属性', point.attrs, activeWeights)];
  }
  if (point.moduleKey === 'neidan') {
    return [makeSystemContributionRow('neidan', '内丹属性', point.attrs, activeWeights)];
  }
  if (point.moduleKey === 'smelt') {
    return [makeSystemContributionRow('smelting', '熔炼属性', point.attrs, activeWeights)];
  }
  if (point.moduleKey === 'breathing') {
    return [makeSystemContributionRow('breathing', '奇穴属性', point.attrs, activeWeights)];
  }
  return [makeSystemContributionRow(point.moduleKey, point.label, point.attrs, activeWeights)];
}

function isStagePoint(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof value.moduleKey === 'string' &&
    typeof value.stageKey === 'string' &&
    value.attrs &&
    typeof value.attrs === 'object' &&
    typeof value.fightPower === 'number'
  );
}

function attachSystemContributionRows(root, activeWeights) {
  const visited = new Set();
  const visit = value => {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (isStagePoint(value)) {
      const rows = buildSystemContributionRows(value, activeWeights);
      value.params = {
        ...(value.params || {}),
        systemContributionRows: rows,
        systemBreakdown: {
          source: 'role_extreme_stats',
          compatibleWith: 'pure-attribute-core.getOtherUserInfoBySystem',
          rows,
        },
      };
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    for (const item of Object.values(value)) visit(item);
  };
  visit(root);
}

function maxBy(items, getValue) {
  if (!items.length) return null;
  return items.reduce((best, item) => (getValue(item) >= getValue(best) ? item : best), items[0]);
}

function filterRowsByMaxLevel(rows, getLevel, maxLevel, label) {
  return rows.filter(row => {
    const level = getLevel(row);
    finiteInteger(level, `${label}.${row.id ?? row.level ?? row.levelWorld}.requiredLevel`);
    return level <= maxLevel;
  });
}

function collectActiveRoles() {
  const roleRows = loadDataTable('role');
  const monsterById = new Map(loadDataTable('monster').map(row => [row.id, row]));
  return roleRows.map(role => {
    const monster = monsterById.get(role.id);
    if (!monster) {
      throw new Error(`角色 ${role.id} ${role.name} 缺少同 id 的 monster 模板。`);
    }
    return { role, monster };
  });
}

function calcRoleBaseAttrs(monster, expRow, activeFields) {
  const attrs = {};
  for (const field of activeFields) {
    if (!Object.prototype.hasOwnProperty.call(monster, field)) continue;
    if (!Object.prototype.hasOwnProperty.call(expRow, field)) continue;
    addAttr(attrs, field, monster[field] * expRow[field], `role_base.${monster.id}.${expRow.level}.${field}`);
  }
  const resistRows = Array.isArray(monster.resist) ? monster.resist : [];
  for (const row of resistRows) {
    if (!Array.isArray(row) || row.length < 2) {
      throw new Error(`monster ${monster.id} resist 配置异常: ${JSON.stringify(row)}`);
    }
    const field = RESIST_FIELD_BY_ID[row[0]];
    if (!field) {
      throw new Error(`monster ${monster.id} resist id=${row[0]} 未在运行时映射表中确认。`);
    }
    addAttr(attrs, field, row[1], `role_base.${monster.id}.resist.${field}`);
  }
  return attrs;
}

function buildRoleBaseDetails(monster, expRow, activeFields, activeWeights) {
  const details = [];
  for (const field of activeFields) {
    if (!Object.prototype.hasOwnProperty.call(monster, field)) continue;
    if (!Object.prototype.hasOwnProperty.call(expRow, field)) continue;
    const templateValue = finiteNumber(monster[field], `monster.${monster.id}.${field}`);
    const growthValue = finiteNumber(expRow[field], `exp.${expRow.level}.${field}`);
    const finalValue = Math.round(templateValue * growthValue);
    details.push({
      type: 'level_growth',
      field,
      templateValue,
      growthValue,
      finalValue,
      fightPower: calcFightPower({ [field]: finalValue }, activeWeights),
    });
  }
  const resistRows = Array.isArray(monster.resist) ? monster.resist : [];
  for (const row of resistRows) {
    if (!Array.isArray(row) || row.length < 2) {
      throw new Error(`monster ${monster.id} resist 配置异常: ${JSON.stringify(row)}`);
    }
    const field = RESIST_FIELD_BY_ID[row[0]];
    if (!field) {
      throw new Error(`monster ${monster.id} resist id=${row[0]} 未在运行时映射表中确认。`);
    }
    const finalValue = finiteNumber(row[1], `monster.${monster.id}.resist.${field}`);
    details.push({
      type: 'resist',
      field,
      resistId: row[0],
      finalValue,
      fightPower: calcFightPower({ [field]: finalValue }, activeWeights),
    });
  }
  return details;
}

function buildRoleBaseCurves(activeWeights, configuredMaxLevel) {
  const expRows = filterRowsByMaxLevel(
    loadDataTable('exp').sort((left, right) => left.level - right.level),
    row => row.level,
    configuredMaxLevel,
    'exp'
  );
  if (!expRows.length) throw new Error(`exp 表没有 level <= ${configuredMaxLevel} 的行。`);
  const activeFields = Object.keys(activeWeights);
  const roles = collectActiveRoles().map(({ role, monster }) => {
    const levels = expRows.map(expRow => {
      const attrs = roundAttrs(calcRoleBaseAttrs(monster, expRow, activeFields));
      const attributeDetails = buildRoleBaseDetails(monster, expRow, activeFields, activeWeights);
      const fightPower = calcFightPower(attrs, activeWeights);
      return makePoint({
        moduleKey: 'role_base',
        stageKey: `role_base:hero=${role.id}:level=${expRow.level}`,
        label: `${role.name} Lv.${expRow.level}`,
        params: {
          heroId: role.id,
          heroName: role.name,
          monsterId: monster.id,
          roleLevel: expRow.level,
          attributeDetails,
        },
        attrs,
        fightPower,
        evidence: [
          { table: 'role', id: role.id, file: tableFileRef('role') },
          { table: 'monster', id: monster.id, file: tableFileRef('monster') },
          { table: 'exp', id: expRow.id, level: expRow.level, file: tableFileRef('exp') },
        ],
      });
    });
    return {
      heroId: role.id,
      heroName: role.name,
      monsterId: monster.id,
      maxFightPowerPoint: maxBy(levels, point => point.fightPower),
      levels,
    };
  });

  return {
    key: 'role_base',
    label: '角色等级基础',
    status: 'ready',
    formula: `attr[field] = monster[heroId][field] * exp[level][field]；抗性来自 monster.resist；当前版本只取 level <= ${configuredMaxLevel}。`,
    stageDimensions: ['heroId', 'roleLevel'],
    configuredMaxLevel,
    rows: roles,
    maxFightPowerPoint: maxBy(roles.flatMap(role => role.levels), point => point.fightPower),
  };
}

function buildHeartCurves(activeWeights, configuredMaxLevel) {
  const rawRows = loadDataTable('heart').sort((left, right) => left.level - right.level);
  // 玩家当前等级为 configuredMaxLevel 时，能升级到的最高心法等级限制其实是上一级 (level - 1) 的 limit 限制
  const heartRows = rawRows.filter(row => {
    if (row.level === 0) return true;
    const prevRow = rawRows.find(r => r.level === row.level - 1);
    const limit = prevRow ? prevRow.limit : 0;
    finiteInteger(limit, `heart.${row.level - 1}.limit`);
    return limit <= configuredMaxLevel;
  });
  const firstRow = heartRows[0];
  if (!firstRow) throw new Error(`heart 表没有 limit <= ${configuredMaxLevel} 的有效行。`);
  const fields = Object.keys(activeWeights).filter(field =>
    Object.prototype.hasOwnProperty.call(firstRow, field)
  );
  const levels = heartRows.map(row => {
    const attrs = {};
    const selectedLines = [];
    for (const field of fields) {
      const value = finiteNumber(row[field], `heart.${row.level}.${field}`);
      addAttr(attrs, field, value, `heart.${row.level}.${field}`);
      selectedLines.push({
        field,
        value,
        fightPower: calcFightPower({ [field]: value }, activeWeights),
        heartLevel: row.level,
        roleLevelRequired: row.limit,
        tableId: row.id,
      });
    }
    const fightPower = calcFightPower(attrs, activeWeights);
    return makePoint({
      moduleKey: 'heart',
      stageKey: `heart:all-lines-level=${row.level}`,
      label: `心法全属性 Lv.${row.level}`,
      params: {
        heartLevel: row.level,
        roleLevelRequired: row.limit,
        lines: fields,
        selectedLines,
      },
      attrs,
      fightPower,
      evidence: [{ table: 'heart', id: row.id, level: row.level, file: tableFileRef('heart') }],
    });
  });

  const attributeCurves = {};
  for (const field of fields) {
    attributeCurves[field] = heartRows.map(row => makePoint({
      moduleKey: 'heart',
      stageKey: `heart:${field}=level=${row.level}`,
      label: `${field} 心法 Lv.${row.level}`,
      params: { heartLine: field, heartLevel: row.level, roleLevelRequired: row.limit },
      attrs: { [field]: row[field] },
      fightPower: calcFightPower({ [field]: row[field] }, activeWeights),
      evidence: [{ table: 'heart', id: row.id, level: row.level, file: tableFileRef('heart') }],
    }));
  }

  return {
    key: 'heart',
    label: '修炼/心法',
    status: 'ready',
    formula: `每条心法按 heart[level][属性] 提供属性；全满阶段按六条心法同等级汇总；升级到当前等级需要前一级的 heart.limit <= ${configuredMaxLevel}。`,
    stageDimensions: ['heartLevel', 'heartLine'],
    configuredMaxLevel,
    fields,
    maxFightPowerPoint: maxBy(levels, point => point.fightPower),
    levels,
    attributeCurves,
    warnings: rawRows.length === heartRows.length
      ? []
      : [`已按 settings.js data.maxLevel=${configuredMaxLevel} 过滤 heart.limit，剔除 ${rawRows.length - heartRows.length} 个未达等级上限的心法阶段。`],
  };
}

function calcWingAttrs(row) {
  const attrs = {};
  addAttrList(attrs, row.attribute || [], row.attributeValue || [], `wingAttribute.${row.id}`);
  return attrs;
}

function extractRoleLevelRequired(upLimit) {
  if (!Array.isArray(upLimit)) return null;
  for (const item of upLimit) {
    if (Array.isArray(item) && item[0] === 1 && Array.isArray(item[1]) && typeof item[1][0] === 'number') {
      return item[1][0];
    }
  }
  return null;
}

function requireRoleLevelRequired(upLimit, label) {
  const level = extractRoleLevelRequired(upLimit);
  finiteInteger(level, `${label}.roleLevelRequired`);
  return level;
}

function buildWingCurves(activeWeights, configuredMaxLevel) {
  const wingRows = loadDataTable('wing').sort((left, right) => left.id - right.id);
  const rawWingAttrRows = loadDataTable('wingAttribute').sort((left, right) =>
    left.buteId - right.buteId || left.wingLevel - right.wingLevel
  );
  const accessibleRowsByKey = new Map();
  for (const wing of wingRows) {
    const rows = rawWingAttrRows
      .filter(row => row.buteId === wing.buteId)
      .sort((left, right) => left.wingLevel - right.wingLevel);
    rows.forEach((row, index) => {
      const previousRow = rows[index - 1];
      const isAccessible = index === 0
        || requireRoleLevelRequired(previousRow.upLimit, `wingAttribute.${previousRow.id}`) <= configuredMaxLevel;
      if (isAccessible) accessibleRowsByKey.set(`${row.buteId}:${row.wingLevel}`, row);
    });
  }
  const wingAttrRows = [...accessibleRowsByKey.values()].sort((left, right) =>
    left.buteId - right.buteId || left.wingLevel - right.wingLevel
  );
  if (!wingAttrRows.length) {
    throw new Error(`wingAttribute 表没有角色等级 <= ${configuredMaxLevel} 的有效翅膀阶段。`);
  }
  const wingNameByButeId = new Map(wingRows.map(row => [row.buteId, row.name]));
  const attrsByButeIdLevel = new Map();
  for (const row of wingAttrRows) {
    attrsByButeIdLevel.set(`${row.buteId}:${row.wingLevel}`, row);
  }

  const wings = wingRows.map(wing => {
    const rows = wingAttrRows.filter(row => row.buteId === wing.buteId);
    if (!rows.length) {
      throw new Error(`翅膀 ${wing.id} ${wing.name} 在 ${configuredMaxLevel} 级内没有可达 wingAttribute(buteId=${wing.buteId})。`);
    }
    const levels = rows.map(row => {
      const attrs = calcWingAttrs(row);
      return makePoint({
        moduleKey: 'wing',
        stageKey: `wing:${wing.id}:level=${row.wingLevel}`,
        label: `${wing.name} Lv.${row.wingLevel}`,
        params: {
          wingId: wing.id,
          wingName: wing.name,
          buteId: wing.buteId,
          wingLevel: row.wingLevel,
          quality: row.quality,
          nextLevelRoleLevelRequired: requireRoleLevelRequired(row.upLimit, `wingAttribute.${row.id}`),
        },
        attrs,
        fightPower: calcFightPower(attrs, activeWeights),
        evidence: [
          { table: 'wing', id: wing.id, file: tableFileRef('wing') },
          { table: 'wingAttribute', id: row.id, file: tableFileRef('wingAttribute') },
        ],
      });
    });
    return {
      wingId: wing.id,
      wingName: wing.name,
      buteId: wing.buteId,
      maxFightPowerPoint: maxBy(levels, point => point.fightPower),
      levels,
    };
  });

  const levelSet = new Set(wingAttrRows.map(row => row.wingLevel));
  const allWingsByLevel = [...levelSet].sort((left, right) => left - right).map(level => {
    const attrs = {};
    const evidence = [];
    const selectedWings = [];
    let nextLevelRoleLevelRequired = 0;
    for (const wing of wingRows) {
      const row = attrsByButeIdLevel.get(`${wing.buteId}:${level}`);
      if (!row) {
        throw new Error(`翅膀全满阶段 Lv.${level} 缺少 ${wing.name} 的当前等级可达 wingAttribute。`);
      }
      nextLevelRoleLevelRequired = Math.max(nextLevelRoleLevelRequired, requireRoleLevelRequired(row.upLimit, `wingAttribute.${row.id}`));
      const wingAttrs = calcWingAttrs(row);
      mergeAttrs(attrs, wingAttrs, `wing.${wing.id}.level.${level}`);
      selectedWings.push({
        wingId: wing.id,
        wingName: wing.name,
        buteId: wing.buteId,
        wingAttributeId: row.id,
        wingLevel: row.wingLevel,
        quality: row.quality,
        nextLevelRoleLevelRequired: requireRoleLevelRequired(row.upLimit, `wingAttribute.${row.id}`),
        attrs: wingAttrs,
        fightPower: calcFightPower(wingAttrs, activeWeights),
      });
      evidence.push({ table: 'wingAttribute', id: row.id, wingId: wing.id, wingName: wing.name, file: tableFileRef('wingAttribute') });
    }
    return makePoint({
      moduleKey: 'wing',
      stageKey: `wing:all-active-wings:level=${level}`,
      label: `全部翅膀 Lv.${level}`,
      params: {
        wingLevel: level,
        wingCount: wingRows.length,
        nextLevelRoleLevelRequired,
        wingNames: wingRows.map(wing => wingNameByButeId.get(wing.buteId)),
        selectedWings,
      },
      attrs,
      fightPower: calcFightPower(attrs, activeWeights),
      evidence,
    });
  });

  return {
    key: 'wing',
    label: '翅膀',
    status: 'ready',
    formula: `wing.buteId + wingLevel -> wingAttribute.attribute/attributeValue；全翅膀阶段为当前有效 wing 表全部翅膀同等级汇总；wingAttribute.upLimit 是从当前等级升到下一等级的门槛，因此 Lv.N 是否可达取 Lv.N-1 的 upLimit，当前版本角色等级 ${configuredMaxLevel} 可达 Lv.23。`,
    stageDimensions: ['wingId', 'wingLevel'],
    configuredMaxLevel,
    wings,
    allWingsByLevel,
    maxFightPowerPoint: maxBy(allWingsByLevel, point => point.fightPower),
    warnings: rawWingAttrRows.length === wingAttrRows.length
      ? []
      : [`已按 settings.js data.maxLevel=${configuredMaxLevel} 和“当前等级行 upLimit 用于升下一等级”的规则过滤 wingAttribute，剔除 ${rawWingAttrRows.length - wingAttrRows.length} 个未达等级上限的翅膀阶段。`],
  };
}

function getCanSynMaxStoneInfo(configuredMaxLevel, activeWeights) {
  const stoneRows = loadDataTable('stone');
  const composeById = new Map(loadDataTable('compose').map(row => [row.id, row]));
  const synthSourceStones = stoneRows
    .filter(row => row.group === 1)
    .filter(row => composeById.get(row.id)?.type !== 101)
    .sort((left, right) => left.level - right.level);
  let maxStoneLevel = 0;
  for (let index = 1; index < synthSourceStones.length; index += 1) {
    const compose = composeById.get(synthSourceStones[index].id);
    if (!compose || compose.unlockData > configuredMaxLevel) break;
    maxStoneLevel = synthSourceStones[index].level;
  }
  const stoneId = EQUIPMENT_BEST_STONE_ID_BASE + maxStoneLevel;
  const stoneRow = stoneRows.find(row => row.id === stoneId);
  if (!stoneRow) {
    throw new Error(`stone 表缺少运行时满配宝石 id=${stoneId}。`);
  }
  const options = stoneRows
    .filter(row => !row.close && !row.isClose)
    .filter(row => row.id >= EQUIPMENT_REGULAR_STONE_ID_MIN && row.id < EQUIPMENT_REFINED_STONE_ID_MIN)
    .filter(row => row.level === maxStoneLevel)
    .map(row => {
      const attrs = attrsFromAttributeArrays(row.attribute, row.attributeValue, `stone.${row.id}`);
      return {
        stoneId: row.id,
        stoneName: row.name,
        group: row.group,
        level: row.level,
        attrs,
        fightPower: calcFightPower(attrs, activeWeights),
      };
    })
    .sort((left, right) => right.fightPower - left.fightPower || left.stoneId - right.stoneId);
  if (!options.length) {
    throw new Error(`stone 表缺少 level=${maxStoneLevel} 的普通宝石候选。`);
  }
  return {
    maxStoneLevel,
    stoneId,
    stoneName: stoneRow.name,
    attrs: attrsFromAttributeArrays(stoneRow.attribute, stoneRow.attributeValue, `stone.${stoneId}`),
    options,
    source: tableFileRef('stone'),
  };
}

function getAllowedStoneOptionsForEquip(stoneInfo, equipRow, label) {
  if (!Array.isArray(equipRow.stoneGroup) || !equipRow.stoneGroup.length) {
    throw new Error(`${label} 缺少 stoneGroup 宝石限制配置，不能按任意宝石计算。`);
  }
  const allowedStoneGroups = equipRow.stoneGroup.map((group, index) =>
    finiteInteger(group, `${label}.stoneGroup.${index}`)
  );
  const allowedSet = new Set(allowedStoneGroups);
  const options = stoneInfo.options.filter(stone => allowedSet.has(stone.group));
  if (!options.length) {
    throw new Error(`${label} 的 stoneGroup=${allowedStoneGroups.join(',')} 在 stone 表中没有当前最高等级宝石候选。`);
  }
  return { allowedStoneGroups, options };
}

function buildDistinctStoneSlots(stoneOptions, holeCount, activeWeights, label, allowedStoneGroups) {
  if (holeCount <= 0) return { stoneSlots: [], stoneAttrs: {} };
  if (!Array.isArray(stoneOptions) || stoneOptions.length < holeCount) {
    throw new Error(`${label} 需要 ${holeCount} 个不可重复宝石，但当前装备 stoneGroup 只允许 ${stoneOptions?.length || 0} 个同等级普通宝石候选。`);
  }
  const candidateOptions = stoneOptions.map(stone => ({
    stoneId: stone.stoneId,
    stoneName: stone.stoneName,
    group: stone.group,
    level: stone.level,
    attrs: stone.attrs,
    fightPower: stone.fightPower,
  }));
  const stoneSlots = stoneOptions.slice(0, holeCount).map((stone, index) => ({
    slotIndex: index + 1,
    stoneId: stone.stoneId,
    stoneName: stone.stoneName,
    stoneLevel: stone.level,
    group: stone.group,
    allowedStoneGroups,
    candidateOptions,
    attrs: stone.attrs,
    fightPower: calcFightPower(stone.attrs, activeWeights),
  }));
  const stoneAttrs = {};
  for (const slot of stoneSlots) mergeAttrs(stoneAttrs, slot.attrs, `${label}.stone.${slot.slotIndex}`);
  return { stoneSlots, stoneAttrs };
}

function attrsFromAttributeArrays(fields, values, label) {
  const attrs = {};
  addAttrList(attrs, fields || [], values || [], label);
  return attrs;
}

function calcRandomAttrPowerMax(config, activeWeights) {
  const type = config.type;
  const valueTableName = type === 'feather' ? 'featherAttribute' : 'equipAffix';
  const valueRow = loadDataTable(valueTableName).find(row => row.id === config.attributeValueId);
  if (!valueRow) {
    throw new Error(`${valueTableName} 缺少 id=${config.attributeValueId}。`);
  }
  const injectRow = config.injectId
    ? loadDataTable('equipAffix').find(row => row.id === config.injectId)
    : null;
  if (config.injectId && !injectRow) {
    throw new Error(`equipAffix 缺少注灵 id=${config.injectId}。`);
  }

  const candidates = (config.attributeAttrs || []).map(field => {
    const range = injectRow?.[field] || valueRow[field];
    if (!Array.isArray(range) || range.length < 2) {
      throw new Error(`${valueTableName}.${config.attributeValueId}.${field} 缺少词条范围。`);
    }
    const value = finiteNumber(range[1], `${valueTableName}.${config.attributeValueId}.${field}.max`);
    return {
      field,
      value,
      fightPower: Math.floor(value * (activeWeights[field] || 0)),
      power: value * (activeWeights[field] || 0),
    };
  }).sort((left, right) => right.power - left.power);

  const attrs = {};
  const positiveAttrs = {};
  const selected = [];
  let addPower = 0;
  for (const item of candidates.slice(0, config.attrNum || 0)) {
    addAttr(attrs, item.field, item.value, `randomAttr.${item.field}`);
    addAttr(positiveAttrs, item.field, item.value, `randomAttr.positive.${item.field}`);
    addPower += item.power;
    selected.push({
      field: item.field,
      value: item.value,
      fightPower: Math.floor(item.value * (activeWeights[item.field] || 0)),
    });
  }

  const negativeAttrs = {};
  const selectedNegative = [];
  if ((config.attrNegativeNum || 0) > 0) {
    const negativeRow = loadDataTable('equipAffix').find(row => row.id === config.attrNegativeValueId);
    if (!negativeRow) {
      throw new Error(`equipAffix 缺少负词条 id=${config.attrNegativeValueId}。`);
    }
    const negativeCandidates = (config.attrNegativeAttrs || []).map(field => {
      const range = negativeRow[field];
      if (!Array.isArray(range) || !range.length) {
        throw new Error(`equipAffix.${config.attrNegativeValueId}.${field} 缺少负词条范围。`);
      }
      const value = -finiteNumber(range[0], `equipAffix.${config.attrNegativeValueId}.${field}.min`);
      return {
        field,
        value,
        fightPower: Math.floor(value * (activeWeights[field] || 0)),
        power: value * (activeWeights[field] || 0),
      };
    }).sort((left, right) => left.power - right.power);

    for (const item of negativeCandidates.slice(0, config.attrNegativeNum || 0)) {
      addAttr(attrs, item.field, item.value, `randomAttr.negative.${item.field}`);
      addAttr(negativeAttrs, item.field, item.value, `randomAttr.negative.${item.field}`);
      addPower += item.power;
      selectedNegative.push({
        field: item.field,
        value: item.value,
        fightPower: Math.floor(item.value * (activeWeights[item.field] || 0)),
      });
    }
  }

  return {
    attrs,
    positiveAttrs,
    negativeAttrs,
    addPower,
    attrNum: config.attrNum || 0,
    attrNegativeNum: config.attrNegativeNum || 0,
    options: candidates.map(({ field, value, fightPower }) => ({ field, value, fightPower })),
    selected,
    selectedNegative,
    negativeOptions: (config.attrNegativeNum || 0) > 0
      ? (config.attrNegativeAttrs || []).map(field => {
        const negativeRow = loadDataTable('equipAffix').find(row => row.id === config.attrNegativeValueId);
        if (!negativeRow) {
          throw new Error(`equipAffix 缺少负词条 id=${config.attrNegativeValueId}。`);
        }
        const range = negativeRow[field];
        if (!Array.isArray(range) || !range.length) {
          throw new Error(`equipAffix.${config.attrNegativeValueId}.${field} 缺少负词条范围。`);
        }
        const value = -finiteNumber(range[0], `equipAffix.${config.attrNegativeValueId}.${field}.min`);
        return {
          field,
          value,
          fightPower: Math.floor(value * (activeWeights[field] || 0)),
        };
      })
      : [],
  };
}

function normalizeUpgradeModulus(modulus) {
  finiteInteger(modulus, 'equip.upgradeModulus');
  if (modulus >= 210) return 189;
  if (modulus >= 206) return 188;
  if (modulus >= 203) return 187;
  if (modulus >= 200) return 186;
  if (modulus >= 196) return 185;
  if (modulus >= 193) return 184;
  if (modulus >= 190) return 183;
  if (modulus >= 186) return 182;
  if (modulus >= 183) return 181;
  return modulus;
}

function findRowById(tableName, id, label) {
  const row = loadDataTable(tableName).find(item => item.id === id);
  if (!row) {
    throw new Error(`${tableName} 缺少 ${label || 'id'}=${id}。`);
  }
  return row;
}

function calcEquipUpgradeValue(equipData, upgradeLevel, equipRow) {
  const result = {};
  if (upgradeLevel <= 0) return result;
  const upgradeRow = findRowById('equipUpgrade', upgradeLevel, 'level');
  const upgradeModulus = equipRow.upgradeModulus == null ? 1 : equipRow.upgradeModulus;
  const lowUpgradeRow = findRowById('equipUpgrade', upgradeModulus - 1, 'upgradeModulus-1');
  const highUpgradeRow = findRowById('equipUpgrade', upgradeModulus, 'upgradeModulus');
  const normalizedModulus = normalizeUpgradeModulus(upgradeModulus);
  const lowRoleRow = findRowById('equipUpgrade', normalizedModulus - 1, 'normalizedUpgradeModulus-1');
  const highRoleRow = findRowById('equipUpgrade', normalizedModulus, 'normalizedUpgradeModulus');
  const monsterRow = equipRow.type > 0 ? findRowById('monster', equipRow.type, 'roleMonster') : null;
  const upgradeValueRow = equipRow.type > 0
    ? (loadDataTable('equipUpgradeValue').find(row => row.id === equipRow.type) || monsterRow)
    : null;

  for (const [field, currentValue] of Object.entries(equipData.attr || {})) {
    const attrIndex = (equipRow.attribute || []).indexOf(field);
    if (attrIndex < 0) {
      throw new Error(`equip.${equipRow.id}.${field} 不在基础属性列表中，无法计算强化。`);
    }
    const range = equipRow.attributeValue[attrIndex];
    if (!Array.isArray(range) || range.length < 2) {
      throw new Error(`equip.${equipRow.id}.${field} 基础属性范围异常。`);
    }
    const minValue = finiteNumber(range[0], `equip.${equipRow.id}.${field}.min`);
    const maxValue = finiteNumber(range[1], `equip.${equipRow.id}.${field}.max`);
    const ratio = maxValue === minValue
      ? 1
      : (finiteNumber(currentValue, `equip.${equipRow.id}.${field}.current`) - minValue) / (maxValue - minValue);
    const weightedBase = ratio * (highUpgradeRow[field] - lowUpgradeRow[field]) + lowUpgradeRow[field];
    const roleBase = ratio * (highRoleRow[field] - lowRoleRow[field]) + lowRoleRow[field];
    const roleWeight = upgradeValueRow ? finiteNumber(upgradeValueRow[field], `equipUpgradeValue.${equipRow.type}.${field}`) : 1;
    const monsterWeight = monsterRow ? finiteNumber(monsterRow[field], `monster.${equipRow.type}.${field}`) : 1;
    const weightedValue = Math.round(weightedBase * upgradeLevel * roleWeight);
    const monsterValue = Math.round(roleBase * upgradeLevel * monsterWeight);
    result[field] = Math.max(weightedValue, monsterValue);
    finiteNumber(upgradeRow[field], `equipUpgrade.${upgradeLevel}.${field}`);
  }
  return result;
}

function calcEquipmentInstance(equipRow, activeWeights, configuredMaxLevel, stoneInfo) {
  const baseAttrs = {};
  for (let index = 0; index < (equipRow.attribute || []).length; index += 1) {
    const field = equipRow.attribute[index];
    const range = equipRow.attributeValue[index];
    if (!Array.isArray(range) || range.length < 2) {
      throw new Error(`equip.${equipRow.id}.${field} 基础属性范围异常。`);
    }
    addAttr(baseAttrs, field, range[1], `equip.${equipRow.id}.${field}.max`);
  }
  const injectId = Array.isArray(equipRow.affixInjectCost) && equipRow.affixInjectCost.length
    ? equipRow.affixInjectCost[equipRow.affixInjectCost.length - 1][0]
    : null;
  const randomAttrs = calcRandomAttrPowerMax({
    type: 'equip',
    attributeValueId: equipRow.affixLevel,
    attributeAttrs: equipRow.affixRandom || [],
    attrNum: equipRow.affixNum || 0,
    attrNegativeNum: equipRow.affixNumMinus || 0,
    attrNegativeValueId: equipRow.affixLevel,
    attrNegativeAttrs: equipRow.affixRandomMinus || [],
    injectId,
  }, activeWeights);
  const upgradeAttrs = calcEquipUpgradeValue(
    {
      id: equipRow.id,
      itemType: 'equip',
      attr: baseAttrs,
    },
    configuredMaxLevel,
    equipRow
  );
  const holeCount = Array.isArray(equipRow.hole) ? finiteInteger(equipRow.hole[1], `equip.${equipRow.id}.hole.max`) : 0;
  const { allowedStoneGroups, options: allowedStoneOptions } = getAllowedStoneOptionsForEquip(
    stoneInfo,
    equipRow,
    `equip.${equipRow.id}`
  );
  const { stoneSlots, stoneAttrs } = buildDistinctStoneSlots(
    allowedStoneOptions,
    holeCount,
    activeWeights,
    `equip.${equipRow.id}`,
    allowedStoneGroups
  );
  const attrs = {};
  mergeAttrs(attrs, baseAttrs, `equip.${equipRow.id}.base`);
  mergeAttrs(attrs, randomAttrs.attrs, `equip.${equipRow.id}.affix`);
  mergeAttrs(attrs, upgradeAttrs, `equip.${equipRow.id}.upgrade`);
  mergeAttrs(attrs, stoneAttrs, `equip.${equipRow.id}.stone`);
  return {
    equipId: equipRow.id,
    equipName: equipRow.name,
    part: equipRow.part,
    equipLv: equipRow.equipLv,
    quality: equipRow.quality,
    group: equipRow.group,
    suitAttribute: equipRow.suitAttribute,
    baseAttrs,
    affixAttrs: randomAttrs.attrs,
    positiveAffixAttrs: randomAttrs.positiveAttrs,
    negativeAffixAttrs: randomAttrs.negativeAttrs,
    affixSlotCount: randomAttrs.attrNum,
    affixOptions: randomAttrs.options,
    selectedAffixes: randomAttrs.selected,
    negativeAffixSlotCount: randomAttrs.attrNegativeNum,
    negativeAffixOptions: randomAttrs.negativeOptions,
    selectedNegativeAffixes: randomAttrs.selectedNegative,
    upgradeAttrs,
    stoneId: stoneSlots[0]?.stoneId ?? null,
    stoneName: stoneSlots[0]?.stoneName ?? null,
    stoneIds: stoneSlots.map(slot => slot.stoneId),
    stoneNames: stoneSlots.map(slot => slot.stoneName),
    stoneLevel: stoneInfo.maxStoneLevel,
    allowedStoneGroups,
    stoneCandidateOptions: allowedStoneOptions,
    holeCount,
    stoneSlots,
    stoneAttrs,
    attrs,
    fightPower: calcFightPower(attrs, activeWeights),
  };
}

function getEquipCandidatesForRolePart(roleId, part, configuredMaxLevel) {
  const candidates = loadDataTable('equip')
    .filter(row => !row.close)
    .filter(row => row.type !== 99)
    .filter(row => row.equipLv || row.equipLv === 0)
    .filter(row => row.part === part)
    .filter(row => row.type === roleId || row.type === 0)
    .filter(row => row.equipLv <= configuredMaxLevel);
  if (!candidates.length) {
    throw new Error(`角色 ${roleId} 部位 ${part} 没有 equipLv <= ${configuredMaxLevel} 的装备候选。`);
  }
  const maxEquipLv = Math.max(...candidates.map(row => row.equipLv));
  return candidates.filter(row => row.equipLv === maxEquipLv);
}

function pickBestEquipment(roleId, part, activeWeights, configuredMaxLevel, stoneInfo) {
  const candidates = getEquipCandidatesForRolePart(roleId, part, configuredMaxLevel);
  const evaluated = candidates.map(row => calcEquipmentInstance(row, activeWeights, configuredMaxLevel, stoneInfo));
  return maxBy(evaluated, item => item.fightPower);
}

function calcEquipmentSuitAttrs(selectedEquips, roleId) {
  const suitCounts = {};
  for (const equip of selectedEquips) {
    if (!Array.isArray(equip.suitAttribute) || !equip.suitAttribute.length) continue;
    const suitId = equip.suitAttribute.length > 1 ? equip.suitAttribute[roleId - 1] : equip.suitAttribute[0];
    if (!suitId) continue;
    suitCounts[suitId] = (suitCounts[suitId] || 0) + 1;
  }
  const attrs = {};
  const selectedSuits = [];
  for (const [rawSuitId, count] of Object.entries(suitCounts)) {
    const suitId = Number(rawSuitId);
    const suitRow = findRowById('equipSuitAttribute', suitId, 'suitAttribute');
    for (let index = suitRow.number.length - 1; index >= 0; index -= 1) {
      if (suitRow.number[index] <= count) {
        const suitAttrs = attrsFromAttributeArrays(
          suitRow.attribute[index],
          suitRow.attributeValue[index],
          `equipSuitAttribute.${suitId}.${index}`
        );
        mergeAttrs(attrs, suitAttrs, `equipSuitAttribute.${suitId}`);
        selectedSuits.push({
          suitId,
          count,
          threshold: suitRow.number[index],
          attrs: suitAttrs,
        });
        break;
      }
    }
  }
  return { attrs, selectedSuits };
}

function evaluateEquipmentCombination(selectedEquips, roleId, activeWeights) {
  const baseAttrs = {};
  for (const equip of selectedEquips) {
    mergeAttrs(baseAttrs, equip.attrs, `equipment.${roleId}.${equip.part}`);
  }
  const suitResult = calcEquipmentSuitAttrs(selectedEquips, roleId);
  const attrs = {};
  mergeAttrs(attrs, baseAttrs, `equipment.${roleId}.base`);
  mergeAttrs(attrs, suitResult.attrs, `equipment.${roleId}.suit`);
  return {
    selectedEquips: selectedEquips.slice(),
    selectedSuits: suitResult.selectedSuits,
    baseAttrs,
    suitAttrs: suitResult.attrs,
    attrs,
    baseFightPower: calcFightPower(baseAttrs, activeWeights),
    suitFightPower: calcFightPower(suitResult.attrs, activeWeights),
    fightPower: calcFightPower(attrs, activeWeights),
  };
}

function buildEquipmentSuitOptions(activeWeights) {
  return loadDataTable('equipSuitAttribute').map(row => {
    if (!Array.isArray(row.number) || !Array.isArray(row.attribute) || !Array.isArray(row.attributeValue)) {
      throw new Error(`equipSuitAttribute.${row.id} 套装阈值或属性配置异常。`);
    }
    return {
      suitId: row.id,
      tiers: row.number.map((threshold, index) => {
        const attrs = attrsFromAttributeArrays(
          row.attribute[index],
          row.attributeValue[index],
          `equipSuitAttribute.${row.id}.${index}`
        );
        return {
          threshold,
          attrs,
          fightPower: calcFightPower(attrs, activeWeights),
        };
      }),
    };
  });
}

function pickBestEquipmentCombination(candidateGroups, roleId, activeWeights) {
  let best = null;
  let combinationCount = 0;
  const selected = [];
  const visit = index => {
    if (index >= candidateGroups.length) {
      combinationCount += 1;
      const evaluated = evaluateEquipmentCombination(selected, roleId, activeWeights);
      if (!best || evaluated.fightPower >= best.fightPower) best = evaluated;
      return;
    }
    for (const candidate of candidateGroups[index].candidates) {
      selected.push(candidate);
      visit(index + 1);
      selected.pop();
    }
  };
  visit(0);
  if (!best) throw new Error(`角色 ${roleId} 没有可枚举的装备组合。`);
  return {
    ...best,
    combinationCount,
  };
}

function buildEquipmentCurves(activeWeights, configuredMaxLevel) {
  const stoneInfo = getCanSynMaxStoneInfo(configuredMaxLevel, activeWeights);
  const roles = loadDataTable('role').map(role => {
    const candidateGroups = EQUIPMENT_PARTS.map(partInfo => ({
      part: partInfo.part,
      partLabel: partInfo.label,
      candidates: getEquipCandidatesForRolePart(role.id, partInfo.part, configuredMaxLevel)
        .map(row => ({
          ...calcEquipmentInstance(row, activeWeights, configuredMaxLevel, stoneInfo),
          partLabel: partInfo.label,
        })),
    }));
    const bestCombination = pickBestEquipmentCombination(candidateGroups, role.id, activeWeights);
    const candidateStats = candidateGroups.map(group => ({
      part: group.part,
      partLabel: group.partLabel,
      candidateCount: group.candidates.length,
      maxEquipLv: Math.max(...group.candidates.map(item => item.equipLv)),
      equipIds: group.candidates.map(item => item.equipId),
    }));
    const point = makePoint({
      moduleKey: 'equipment',
      stageKey: `equipment:hero=${role.id}:level=${configuredMaxLevel}`,
      label: `${role.name} 装备满配`,
      params: {
        heroId: role.id,
        heroName: role.name,
        roleLevel: configuredMaxLevel,
        partCount: EQUIPMENT_PARTS.length,
        stoneInfo,
        candidateStats,
        candidateGroups: candidateGroups.map(group => ({
          part: group.part,
          partLabel: group.partLabel,
          candidates: group.candidates,
        })),
        evaluatedCombinationCount: bestCombination.combinationCount,
        baseFightPower: bestCombination.baseFightPower,
        suitFightPower: bestCombination.suitFightPower,
        selectedEquips: bestCombination.selectedEquips,
        selectedSuits: bestCombination.selectedSuits,
      },
      attrs: bestCombination.attrs,
      fightPower: bestCombination.fightPower,
      evidence: [
        { table: 'role', id: role.id, file: tableFileRef('role') },
        { table: 'equip', file: tableFileRef('equip') },
        { table: 'equipAffix', file: tableFileRef('equipAffix') },
        { table: 'equipUpgrade', id: configuredMaxLevel, file: tableFileRef('equipUpgrade') },
        { table: 'stone', id: stoneInfo.stoneId, file: tableFileRef('stone') },
        { table: 'equipSuitAttribute', file: tableFileRef('equipSuitAttribute') },
      ],
    });
    return {
      heroId: role.id,
      heroName: role.name,
      point,
    };
  });

  return {
    key: 'equipment',
    label: '装备基础/词条/强化/宝石/套装',
    status: 'ready',
    formula: `复现 StrongerManager.getBestEquip：每个角色和部位先保留 equipLv <= ${configuredMaxLevel} 的最高档候选，基础属性取区间上限，正/负随机词条按 powerAttribute[1] 默认选最高战力，强化到角色等级 ${configuredMaxLevel}；宝石按当前可合成最高等级的普通宝石候选逐孔选择，同一件装备内不重复，并严格按 equip.stoneGroup 限制可镶嵌宝石类型；默认枚举 6 部位候选组合并把 equipSuitAttribute 套装属性纳入总战力后选择全局最高组合，前端可按部位、宝石孔和正/负词条改选并重算。`,
    stageDimensions: ['heroId', 'equipPart', 'equipLv', 'affix', 'upgradeLevel', 'stoneLevel', 'suit'],
    configuredMaxLevel,
    stoneInfo,
    partCount: EQUIPMENT_PARTS.length,
    suitOptions: buildEquipmentSuitOptions(activeWeights),
    roles,
    maxFightPowerPoint: maxBy(roles.map(role => role.point), point => point.fightPower),
    warnings: [],
  };
}

function roundSmeltAttrs(attrs) {
  const rounded = {};
  for (const field of SMELT_ATTR_FIELDS) {
    const value = attrs[field] || 0;
    rounded[field] = value >= 0 ? Math.floor(value) : Math.ceil(value);
  }
  return Object.fromEntries(Object.entries(rounded).filter(([, value]) => value !== 0));
}

function calcSmeltPartAttrs(mappedQuality, part, configuredMaxLevel) {
  const rows = loadDataTable('equipSmelt')
    .filter(row => !row.close)
    .filter(row => row.quality === mappedQuality)
    .filter(row => row.part === part)
    .filter(row => row.unlockLv <= configuredMaxLevel)
    .sort((left, right) => left.smeltLv - right.smeltLv);
  if (!rows.length) {
    throw new Error(`equipSmelt 缺少 quality=${mappedQuality} part=${part} unlockLv<=${configuredMaxLevel} 的熔炼配置。`);
  }
  const maxSmeltLv = Math.max(...rows.map(row => row.smeltLv));
  const attrs = {};
  const levelDetails = [];
  const levels = [];
  for (let level = 1; level <= maxSmeltLv; level += 1) {
    const row = rows.find(item => item.smeltLv === level);
    if (!row) {
      throw new Error(`equipSmelt 缺少 quality=${mappedQuality} part=${part} smeltLv=${level}。`);
    }
    const levelAttrs = {};
    const qualityTypes = row.qualityType || [];
    const qualityValues = row.qualityVaule || [];
    if (qualityTypes.length !== qualityValues.length) {
      throw new Error(`equipSmelt.${row.id} qualityType 与 qualityVaule 数量不一致。`);
    }
    for (let index = 0; index < qualityValues.length; index += 1) {
      const growRow = findRowById('equipSmeltGrow', qualityTypes[index], 'qualityType');
      const qualityValue = finiteNumber(qualityValues[index], `equipSmelt.${row.id}.qualityVaule.${index}`);
      for (const field of SMELT_ATTR_FIELDS) {
        const growValue = finiteNumber(growRow[field] || 0, `equipSmeltGrow.${growRow.id}.${field}`);
        const addValue = growValue * qualityValue;
        if (addValue) {
          addAttr(attrs, field, addValue, `equipSmelt.${row.id}.${growRow.id}.${field}`);
          addAttr(levelAttrs, field, addValue, `equipSmelt.${row.id}.${growRow.id}.${field}`);
        }
      }
    }
    if (row.attribute) {
      const fixedAttrs = attrsFromAttributeArrays(
        row.attribute[0],
        row.attribute[1],
        `equipSmelt.${row.id}.attribute`
      );
      mergeAttrs(attrs, fixedAttrs, `equipSmelt.${row.id}.fixed`);
      mergeAttrs(levelAttrs, fixedAttrs, `equipSmelt.${row.id}.fixed`);
    }
    const cumulativeRawAttrs = { ...attrs };
    const cumulativeAttrs = roundSmeltAttrs(cumulativeRawAttrs);
    levelDetails.push({
      smeltLv: level,
      equipSmeltId: row.id,
      qualityType: qualityTypes,
      qualityVaule: qualityValues,
      attrs: roundSmeltAttrs(levelAttrs),
      cumulativeAttrs,
    });
    levels.push({
      smeltLv: level,
      rawAttrs: cumulativeRawAttrs,
      attrs: cumulativeAttrs,
    });
  }
  return {
    maxSmeltLv,
    attrs,
    roundedAttrs: roundSmeltAttrs(attrs),
    levelDetails,
    levels,
  };
}

function buildSmeltQualityVariants() {
  return Object.entries(SMELT_EQUIP_QUALITY_CHANGE).map(([itemQualityText, mappedQuality]) => {
    const itemQuality = Number(itemQualityText);
    const labels = SMELT_QUALITY_LABELS[itemQuality];
    if (!labels) {
      throw new Error(`装备熔炼品质 ${itemQuality} 缺少普通/魔化展示分类。`);
    }
    return {
      ...labels,
      itemQuality,
      mappedQuality,
    };
  });
}

function buildSmeltVariantPoints(variant, activeWeights, configuredMaxLevel) {
  const partProgressions = EQUIPMENT_PARTS.map(partInfo => ({
    part: partInfo.part,
    partLabel: partInfo.label,
    smeltKind: variant.smeltKind,
    smeltKindLabel: variant.smeltKindLabel,
    itemQuality: variant.itemQuality,
    itemQualities: [variant.itemQuality],
    mappedQuality: variant.mappedQuality,
    ...calcSmeltPartAttrs(variant.mappedQuality, partInfo.part, configuredMaxLevel),
  }));
  const maxSmeltLevels = [...new Set(partProgressions.map(part => part.maxSmeltLv))];
  if (maxSmeltLevels.length !== 1) {
    throw new Error(`${variant.smeltKindLabel}熔炼各部位最高阶段不一致：${maxSmeltLevels.join(', ')}。`);
  }
  const maxSmeltLv = maxSmeltLevels[0];

  const points = [];
  for (let level = 1; level <= maxSmeltLv; level += 1) {
    const totalRawAttrs = {};
    const selectedSmelts = [];
    for (const partResult of partProgressions) {
      const levelResult = partResult.levels.find(item => item.smeltLv === level);
      if (!levelResult) {
        throw new Error(`${variant.smeltKindLabel}熔炼 ${partResult.partLabel} 缺少 Lv.${level} 累计阶段。`);
      }
      mergeAttrs(totalRawAttrs, levelResult.rawAttrs, `smelt.${variant.smeltKind}.${partResult.part}.level.${level}`);
      selectedSmelts.push({
        part: partResult.part,
        partLabel: partResult.partLabel,
        smeltKind: variant.smeltKind,
        smeltKindLabel: variant.smeltKindLabel,
        itemQuality: variant.itemQuality,
        itemQualities: partResult.itemQualities,
        mappedQuality: partResult.mappedQuality,
        smeltLv: level,
        maxSmeltLv,
        attrs: levelResult.attrs,
        fightPower: calcFightPower(levelResult.attrs, activeWeights),
        levelDetails: partResult.levelDetails.filter(item => item.smeltLv <= level),
      });
    }
    const attrs = roundSmeltAttrs(totalRawAttrs);
    points.push(makePoint({
      moduleKey: 'smelt',
      stageKey: `smelt:kind=${variant.smeltKind}:level=${level}`,
      label: `${variant.smeltKindLabel}装备熔炼 Lv.${level}`,
      params: {
        smeltKind: variant.smeltKind,
        smeltKindLabel: variant.smeltKindLabel,
        itemQuality: variant.itemQuality,
        itemQualities: [variant.itemQuality],
        mappedQuality: variant.mappedQuality,
        smeltLv: level,
        maxSmeltLv,
        roleLevel: configuredMaxLevel,
        partCount: partProgressions.length,
        selectedSmelts,
        qualityMapping: SMELT_EQUIP_QUALITY_CHANGE,
        rule: '角色不影响熔炼数值；熔炼属性只按部位、普通/魔化装备品质映射和熔炼阶段计算。',
      },
      attrs,
      fightPower: calcFightPower(attrs, activeWeights),
      evidence: [
        { table: 'equipSmelt', quality: variant.mappedQuality, file: tableFileRef('equipSmelt') },
        { table: 'equipSmeltGrow', file: tableFileRef('equipSmeltGrow') },
        { runtime: 'SMELT_EQUIP_QUALITY_CHANGE', itemQuality: variant.itemQuality, mappedQuality: variant.mappedQuality },
      ],
    }));
  }
  return {
    ...variant,
    maxSmeltLv,
    partCount: partProgressions.length,
    partProgressions,
    points,
  };
}

function buildSmeltPartOption(partResult, level, activeWeights) {
  const levelResult = partResult.levels.find(item => item.smeltLv === level);
  if (!levelResult) return null;
  return {
    id: `${partResult.smeltKind}:level=${level}`,
    part: partResult.part,
    partLabel: partResult.partLabel,
    smeltKind: partResult.smeltKind,
    smeltKindLabel: partResult.smeltKindLabel,
    itemQuality: partResult.itemQuality,
    itemQualities: partResult.itemQualities,
    mappedQuality: partResult.mappedQuality,
    smeltLv: level,
    maxSmeltLv: partResult.maxSmeltLv,
    attrs: levelResult.attrs,
    rawAttrs: levelResult.rawAttrs,
    fightPower: calcFightPower(levelResult.attrs, activeWeights),
    levelDetails: partResult.levelDetails.filter(item => item.smeltLv <= level),
  };
}

function buildMixedSmeltPoints(variantCurves, activeWeights, configuredMaxLevel) {
  const partProgressions = variantCurves.flatMap(variant => variant.partProgressions || []);
  const maxSmeltLv = Math.max(...partProgressions.map(part => part.maxSmeltLv));
  const points = [];
  for (let level = 1; level <= maxSmeltLv; level += 1) {
    const totalRawAttrs = {};
    const selectedSmelts = [];
    const evidence = [];
    for (const partInfo of EQUIPMENT_PARTS) {
      const options = partProgressions
        .filter(part => part.part === partInfo.part)
        .map(part => buildSmeltPartOption(part, level, activeWeights))
        .filter(Boolean)
        .sort((left, right) =>
          right.fightPower - left.fightPower ||
          right.mappedQuality - left.mappedQuality ||
          left.smeltKind.localeCompare(right.smeltKind)
        );
      if (!options.length) {
        throw new Error(`装备熔炼 ${partInfo.label} 缺少 Lv.${level} 的神化/魔化候选。`);
      }
      const selected = options[0];
      mergeAttrs(totalRawAttrs, selected.rawAttrs, `smelt.mixed.${partInfo.part}.level.${level}`);
      selectedSmelts.push({
        ...selected,
        candidateOptions: options,
      });
      evidence.push({ table: 'equipSmelt', quality: selected.mappedQuality, part: selected.part, smeltLv: level, file: tableFileRef('equipSmelt') });
    }
    const attrs = roundSmeltAttrs(totalRawAttrs);
    points.push(makePoint({
      moduleKey: 'smelt',
      stageKey: `smelt:mixed-by-part:level=${level}`,
      label: `装备熔炼自选构成 Lv.${level}`,
      params: {
        smeltKind: 'mixed',
        smeltKindLabel: '自选',
        smeltLv: level,
        maxSmeltLv,
        roleLevel: configuredMaxLevel,
        partCount: EQUIPMENT_PARTS.length,
        selectedSmelts,
        qualityMapping: SMELT_EQUIP_QUALITY_CHANGE,
        rule: '每个装备部位独立选择神化或魔化装备参与熔炼；角色本身不影响熔炼数值。',
      },
      attrs,
      fightPower: calcFightPower(attrs, activeWeights),
      evidence: [
        ...evidence,
        { table: 'equipSmeltGrow', file: tableFileRef('equipSmeltGrow') },
        { runtime: 'SMELT_EQUIP_QUALITY_CHANGE', mapping: SMELT_EQUIP_QUALITY_CHANGE },
      ],
    }));
  }
  return points;
}

function buildSmeltCurves(activeWeights, configuredMaxLevel) {
  const qualityVariants = buildSmeltQualityVariants();
  const qualityMappingText = qualityVariants
    .map(variant => `${variant.smeltKindLabel}装备品质 ${variant.itemQuality} 映射熔炼品质 ${variant.mappedQuality}`)
    .join('，');
  const variantCurves = qualityVariants.map(variant => buildSmeltVariantPoints(variant, activeWeights, configuredMaxLevel));
  const fullBySmeltLevel = buildMixedSmeltPoints(variantCurves, activeWeights, configuredMaxLevel);
  return {
    key: 'smelt',
    label: '装备熔炼',
    status: 'ready',
    formula: `复现 UserInfoManager.getEquipSmeltAttr：按装备品质映射熔炼品质；${qualityMappingText}。每个部位可独立选择神化或魔化装备参与熔炼，并按同一熔炼等级逐级累计 equipSmelt.qualityType 指向的 equipSmeltGrow，按 qualityVaule 取满，最后对属性向下/向上取整。`,
    stageDimensions: ['smeltKind', 'smeltLevel', 'equipPart', 'equipQuality', 'qualityType'],
    configuredMaxLevel,
    qualityMapping: SMELT_EQUIP_QUALITY_CHANGE,
    qualityVariants,
    variantCurves,
    fullBySmeltLevel,
    rows: fullBySmeltLevel,
    maxFightPowerPoint: maxBy(fullBySmeltLevel, point => point.fightPower),
    warnings: [],
  };
}

function findMaxFeatherByLevel(configuredMaxLevel) {
  const featherRows = loadDataTable('feather');
  let current = findRowById('feather', 502001, 'baseFeather');
  const chain = [];
  const warnings = [];
  while (current) {
    chain.push({
      id: current.id,
      name: current.name,
      nextId: current.nextId,
      nextLimit: current.nextLimit,
      close: current.close,
    });
    if (current.close) break;
    if (Array.isArray(current.nextLimit) && current.nextLimit[0] === 1 && configuredMaxLevel < current.nextLimit[1]) {
      break;
    }
    const next = featherRows.find(row => row.id === current.nextId);
    if (!next) {
      warnings.push(`feather.${current.id} 指向 nextId=${current.nextId}，但当前 feather 表缺少该行；羽毛满配停在 ${current.id} ${current.name}。`);
      break;
    }
    if (next.close) break;
    current = next;
  }
  return { feather: current, chain, warnings };
}

function buildFeatherCurves(activeWeights, configuredMaxLevel) {
  const featherNumber = loadConstValue('featherNumber');
  if (!Array.isArray(featherNumber.value) || !featherNumber.value.length) {
    throw new Error('consts.featherNumber 不是非空数组，无法确认羽毛孔位数。');
  }
  const holeCount = featherNumber.value.length;
  const { feather, chain, warnings } = findMaxFeatherByLevel(configuredMaxLevel);
  if (!feather) throw new Error('无法确认当前等级可达最高羽毛。');
  const random = calcRandomAttrPowerMax({
    type: 'feather',
    attributeValueId: feather.attributeValue?.[1],
    attributeAttrs: feather.attributeType || [],
    attrNum: feather.attributeAmount || 0,
  }, activeWeights);
  const attrs = scaledAttrs(random.attrs, holeCount, `feather.${feather.id}.holes`);
  const selectedFeather = {
    featherId: feather.id,
    featherName: feather.name,
    quality: feather.quality,
    attributeValueId: feather.attributeValue?.[1],
    attributeAmount: feather.attributeAmount,
    attributeSlotCount: random.attrNum,
    attributeOptions: random.options,
    holeCount,
    perFeatherAttrs: random.attrs,
    perFeatherFightPower: calcFightPower(random.attrs, activeWeights),
    totalAttrs: attrs,
    fightPower: calcFightPower(attrs, activeWeights),
    selectedAttrs: random.selected,
  };
  const point = makePoint({
    moduleKey: 'feather',
    stageKey: `feather:id=${feather.id}:holes=${holeCount}`,
    label: `${feather.name} × ${holeCount}孔`,
    params: {
      roleLevel: configuredMaxLevel,
      holeCount,
      selectedFeather,
      chain,
      featherNumber: featherNumber.value,
    },
    attrs,
    fightPower: selectedFeather.fightPower,
    evidence: [
      { table: 'feather', id: feather.id, file: tableFileRef('feather') },
      { table: 'featherAttribute', id: feather.attributeValue?.[1], file: tableFileRef('featherAttribute') },
      { table: 'consts', id: featherNumber.id, key: featherNumber.key, file: featherNumber.file },
    ],
    warnings,
  });
  return {
    key: 'feather',
    label: '羽毛',
    status: 'ready',
    formula: `复现 FashionManager.getUserAllFeatherAttrsAndPower 与 StrongerManager.calFeatherPowerMax：从 502001 沿 feather.nextId 追到 ${configuredMaxLevel} 级可达最高羽毛，按 featherAttribute 取战力最高的 ${feather.attributeAmount} 条洗练属性，再按 consts.featherNumber 的 ${holeCount} 个孔位累加。`,
    stageDimensions: ['featherId', 'holeCount', 'attributeAmount', 'attributeValueId'],
    configuredMaxLevel,
    holeCount,
    chain,
    points: [point],
    maxFightPowerPoint: point,
    warnings,
  };
}

function buildDanqiCandidate(danqiRow, activeWeights) {
  const perSlotAttrs = {};
  if ((danqiRow.attribute || []).length !== (danqiRow.attributeValue || []).length) {
    throw new Error(`danqi.${danqiRow.id} attribute 与 attributeValue 数量不一致。`);
  }
  for (let index = 0; index < danqiRow.attribute.length; index += 1) {
    const field = danqiRow.attribute[index];
    const range = danqiRow.attributeValue[index];
    if (!Array.isArray(range) || range.length < 2) {
      throw new Error(`danqi.${danqiRow.id}.${field} 属性范围异常。`);
    }
    addAttr(perSlotAttrs, field, range[1], `danqi.${danqiRow.id}.${field}.max`);
  }
  return {
    danqiId: danqiRow.id,
    danqiName: danqiRow.name,
    level: danqiRow.level,
    attribute: danqiRow.attribute,
    attributeValue: danqiRow.attributeValue,
    perSlotAttrs,
    perSlotFightPower: calcFightPower(perSlotAttrs, activeWeights),
    attrs: perSlotAttrs,
    fightPower: calcFightPower(perSlotAttrs, activeWeights),
  };
}

function buildDanqiPoint(selectedDanqis, allCandidates, activeWeights, configuredMaxLevel, levelByRole, openMaxLevel, selectedLevel, slotCount) {
  if (selectedDanqis.length !== slotCount) {
    throw new Error(`丹气不可重复计算需要 ${slotCount} 个槽位，当前只选择到 ${selectedDanqis.length} 个。`);
  }
  const attrs = {};
  const slottedDanqis = selectedDanqis.map((candidate, index) => {
    mergeAttrs(attrs, candidate.perSlotAttrs, `danqi.${candidate.danqiId}.slot.${index + 1}`);
    return {
      ...candidate,
      slotIndex: index + 1,
    };
  });
  return makePoint({
    moduleKey: 'neidan',
    stageKey: `neidan:unique-danqi:level=${selectedLevel}:slots=${slotCount}`,
    label: `丹气不可重复满配 Lv.${selectedLevel} · ${slotCount}槽`,
    params: {
      roleLevel: configuredMaxLevel,
      levelByRole,
      openMaxLevel,
      selectedLevel,
      slotCount,
      selectedDanqis: slottedDanqis,
      selectedDanqi: slottedDanqis[0],
      candidateDanqis: allCandidates,
      danyuanDirectAttributePower: 0,
      danyuanNote: '丹元提供技能效果和阴阳门槛；当前运行时属性战力入口 getAttriByNeiDan_attr 只汇总 danqi[*].attr。',
    },
    attrs,
    fightPower: calcFightPower(attrs, activeWeights),
    evidence: [
      ...slottedDanqis.map(item => ({ table: 'danqi', id: item.danqiId, slotIndex: item.slotIndex, file: tableFileRef('danqi') })),
      { table: 'danyuan', file: tableFileRef('danyuan') },
    ],
  });
}

function buildNeidanCurves(activeWeights, configuredMaxLevel) {
  const danqiRows = loadDataTable('danqi');
  let openMaxLevel = 1;
  for (let nextLevel = openMaxLevel + 1; ; nextLevel += 1) {
    const nextRow = danqiRows.find(row => row.id === 182002000 + nextLevel);
    if (!nextRow || nextRow.isClose) break;
    openMaxLevel = nextLevel;
  }
  const levelByRole = Math.ceil(configuredMaxLevel / 10);
  const selectedLevel = Math.min(openMaxLevel, levelByRole);
  const slotCount = NEIDAN_DANQI_SLOT_COUNT;
  const danqiCandidates = danqiRows
    .filter(row => !row.isClose)
    .filter(row => row.level === selectedLevel)
    .sort((left, right) => left.id - right.id);
  if (!danqiCandidates.length) {
    throw new Error(`danqi 表缺少 level=${selectedLevel} 的可用丹气。`);
  }
  const candidateOptions = danqiCandidates
    .map(danqiRow => buildDanqiCandidate(danqiRow, activeWeights))
    .sort((left, right) => right.fightPower - left.fightPower || left.danqiId - right.danqiId);
  if (candidateOptions.length < slotCount) {
    throw new Error(`丹气不可重复计算需要 ${slotCount} 个槽位，但 danqi 表 level=${selectedLevel} 只有 ${candidateOptions.length} 个可用候选。`);
  }
  const rows = [
    buildDanqiPoint(
      candidateOptions.slice(0, slotCount),
      candidateOptions,
      activeWeights,
      configuredMaxLevel,
      levelByRole,
      openMaxLevel,
      selectedLevel,
      slotCount
    ),
  ];
  return {
    key: 'neidan',
    label: '内丹/丹气/丹元',
    status: 'ready',
    formula: `丹气开放等级取未关闭最高档与 ceil(角色等级/10) 的较小值；当前 ${configuredMaxLevel} 级取 Lv.${selectedLevel}。每种丹气单槽属性取 danqi.attributeValue 上限，8 个槽位按不可重复丹气候选分别选择，不把同一个丹气重复乘槽数。丹元只提供技能效果/阴阳门槛，不在该属性战力入口直接加点。`,
    stageDimensions: ['danqiLevel', 'danqiType', 'danqiSlot', 'danyuanEffect'],
    configuredMaxLevel,
    selectedLevel,
    slotCount,
    candidateDanqiCount: candidateOptions.length,
    danqiOptions: candidateOptions,
    rows,
    maxFightPowerPoint: maxBy(rows, point => point.fightPower),
    warnings: [],
  };
}

function buildXianpoCurves(activeWeights, configuredMaxLevel, heartModule) {
  const rawRows = loadDataTable('xianpo').sort((left, right) =>
    left.type - right.type || left.xianpoId - right.xianpoId || left.level - right.level
  );
  const rows = filterRowsByMaxLevel(rawRows, row => row.roleLevel, configuredMaxLevel, 'xianpo.roleLevel');
  if (!rows.length) throw new Error(`xianpo 表没有 roleLevel <= ${configuredMaxLevel} 的有效行。`);
  const trainingLayerConst = loadConstValue('trainingLayer');
  const trainingLayerThresholds = trainingLayerConst.value;
  const heartFightPowerForUnlock = heartModule?.maxFightPowerPoint?.fightPower;
  finiteNumber(heartFightPowerForUnlock, 'xianpo.heartFightPowerForUnlock');
  const unlockedLayerCount = countUnlockedByThresholds(
    heartFightPowerForUnlock,
    trainingLayerThresholds,
    'consts.trainingLayer'
  );
  const byType = new Map();
  const byQualityLevel = new Map();
  const qualityNames = new Map();

  for (const row of rows) {
    const quality = row.xianpoId % 10;
    qualityNames.set(quality, (row.name || '').split('·').pop() || `品质${quality}`);
    const attrs = {};
    addAttrList(attrs, row.attribute || [], row.attributeValue || [], `xianpo.${row.id}`);
    const point = makePoint({
      moduleKey: 'xianpo',
      stageKey: `xianpo:type=${row.type}:quality=${quality}:level=${row.level}`,
      label: `${row.name} Lv.${row.level}`,
      params: {
        xianpoId: row.xianpoId,
        type: row.type,
        quality,
        level: row.level,
        roleLevelRequired: row.roleLevel,
      },
      attrs,
      fightPower: calcFightPower(attrs, activeWeights),
      evidence: [{ table: 'xianpo', id: row.id, file: tableFileRef('xianpo') }],
    });

    if (!byType.has(row.type)) byType.set(row.type, { type: row.type, typeName: (row.name || '').split('仙魄')[0], qualityLevels: new Map() });
    const typeNode = byType.get(row.type);
    if (!typeNode.qualityLevels.has(quality)) {
      typeNode.qualityLevels.set(quality, { quality, qualityName: qualityNames.get(quality), xianpoId: row.xianpoId, levels: [] });
    }
    typeNode.qualityLevels.get(quality).levels.push(point);

    const fullKey = `${quality}:${row.level}`;
    if (!byQualityLevel.has(fullKey)) byQualityLevel.set(fullKey, []);
    byQualityLevel.get(fullKey).push({ row, point });
  }

  const types = [...byType.values()].map(typeNode => ({
    ...typeNode,
    qualityLevels: [...typeNode.qualityLevels.values()].map(node => ({
      ...node,
      maxFightPowerPoint: maxBy(node.levels, point => point.fightPower),
    })),
  }));

  const typeCount = byType.size;
  if (!typeCount) throw new Error('xianpo 表没有有效 type，无法确认每层槽位数。');
  const slotPerLayer = typeCount;
  const totalSlotCount = unlockedLayerCount * slotPerLayer;
  const fullByQualityLevel = [...byQualityLevel.entries()].map(([key, items]) => {
    if (items.length !== typeCount) return null;
    const [qualityRaw, levelRaw] = key.split(':');
    const quality = Number(qualityRaw);
    const level = Number(levelRaw);
    const attrs = {};
    const evidence = [];
    const selectedXianpos = [];
    let roleLevelRequired = 0;
    for (const item of items) {
      const totalAttrs = scaledAttrs(
        item.point.attrs,
        unlockedLayerCount,
        `xianpo.type.${item.row.type}.layers`
      );
      mergeAttrs(attrs, totalAttrs, `xianpo.type.${item.row.type}.total`);
      roleLevelRequired = Math.max(roleLevelRequired, item.row.roleLevel || 0);
      evidence.push({ table: 'xianpo', id: item.row.id, type: item.row.type, file: tableFileRef('xianpo') });
      selectedXianpos.push({
        type: item.row.type,
        typeName: (item.row.name || '').split('仙魄')[0],
        xianpoId: item.row.xianpoId,
        xianpoName: item.row.name,
        quality,
        qualityName: qualityNames.get(quality),
        level,
        roleLevelRequired: item.row.roleLevel,
        slotCount: unlockedLayerCount,
        perSlotAttrs: item.point.attrs,
        totalAttrs,
        perSlotFightPower: item.point.fightPower,
        fightPower: calcFightPower(totalAttrs, activeWeights),
        tableId: item.row.id,
      });
    }
    return makePoint({
      moduleKey: 'xianpo',
      stageKey: `xianpo:all-types:quality=${quality}:level=${level}`,
      label: `全部仙魄 ${qualityNames.get(quality)} Lv.${level}`,
      params: {
        quality,
        qualityName: qualityNames.get(quality),
        level,
        typeCount,
        roleLevelRequired,
        unlockedLayerCount,
        slotPerLayer,
        totalSlotCount,
        trainingLayerThresholds,
        heartFightPowerForUnlock,
        selectedXianpos,
      },
      attrs,
      fightPower: calcFightPower(attrs, activeWeights),
      evidence: [
        ...evidence,
        {
          table: 'consts',
          id: trainingLayerConst.id,
          key: trainingLayerConst.key,
          file: trainingLayerConst.file,
        },
      ],
    });
  }).filter(Boolean).sort((left, right) =>
    left.params.quality - right.params.quality || left.params.level - right.params.level
  );

  return {
    key: 'xianpo',
    label: '仙魄/炼体',
    status: 'ready',
    formula: `xianpoId + level -> xianpo.attribute/attributeValue；consts.trainingLayer 按心法满配战力解锁炼体层数；每层包含当前 xianpo.type 全部部位槽；当前版本只取 roleLevel <= ${configuredMaxLevel}。`,
    stageDimensions: ['trainingLayer', 'slotPerLayer', 'type', 'quality', 'level'],
    configuredMaxLevel,
    unlockRule: {
      source: trainingLayerConst.file,
      constId: trainingLayerConst.id,
      key: trainingLayerConst.key,
      thresholds: trainingLayerThresholds,
      heartFightPowerForUnlock,
      unlockedLayerCount,
      slotPerLayer,
      totalSlotCount,
    },
    types,
    fullByQualityLevel,
    maxFightPowerPoint: maxBy(fullByQualityLevel, point => point.fightPower),
    warnings: rawRows.length === rows.length
      ? []
      : [`已按 settings.js data.maxLevel=${configuredMaxLevel} 过滤 xianpo.roleLevel，剔除 ${rawRows.length - rows.length} 个未达等级上限的仙魄阶段。`],
  };
}

function calcStarMainAttrs(starCoreRow, quality, expWorldRow) {
  const config = starCoreRow.starCore?.[quality];
  if (!Array.isArray(config) || config.length < 3) {
    throw new Error(`星核 ${starCoreRow.id} ${starCoreRow.name} 缺少品质 ${quality} 的主星配置。`);
  }
  const attrs = {};
  const fields = config[1];
  const ratio = finiteNumber(config[2], `starCore.${starCoreRow.id}.${quality}.ratio`);
  if (!Array.isArray(fields)) throw new Error(`星核 ${starCoreRow.id} 品质 ${quality} 主星属性不是数组。`);
  for (const field of fields) {
    addAttr(attrs, field, Math.round(finiteNumber(expWorldRow[field], `expWorld.${expWorldRow.levelWorld}.${field}`) * ratio), `starCore.${starCoreRow.id}.${quality}.${field}`);
  }
  return attrs;
}

function calcStarSatelliteAttrs(starCoreRow, satelliteLevel, expWorldRow) {
  const attrs = {};
  const fields = starCoreRow.satelliteAttribute?.[0];
  const ratio = finiteNumber(starCoreRow.satelliteAttribute?.[1], `starCore.${starCoreRow.id}.satelliteRatio`);
  const maxLevel = finiteNumber(starCoreRow.satelliteLv, `starCore.${starCoreRow.id}.satelliteLv`);
  const levelRatio = Math.min(satelliteLevel / maxLevel, 1);
  if (!Array.isArray(fields)) throw new Error(`星核 ${starCoreRow.id} 伴星属性不是数组。`);
  for (const field of fields) {
    addAttr(attrs, field, Math.round(finiteNumber(expWorldRow[field], `expWorld.${expWorldRow.levelWorld}.${field}`) * ratio * levelRatio), `starCore.${starCoreRow.id}.satellite.${field}`);
  }
  return attrs;
}

function buildStarcoreCurves(activeWeights, configuredMaxLevel) {
  const starRows = loadDataTable('starCore').sort((left, right) => left.id - right.id);
  const rawExpWorldRows = loadDataTable('expWorld').sort((left, right) => left.levelWorld - right.levelWorld);
  const expWorldRows = filterRowsByMaxLevel(rawExpWorldRows, row => row.levelWorld, configuredMaxLevel, 'expWorld.levelWorld');
  if (!expWorldRows.length) throw new Error(`expWorld 表没有 levelWorld <= ${configuredMaxLevel} 的有效行。`);
  const stars = starRows.map(star => {
    const qualities = Object.keys(star.starCore || {}).map(Number).sort((left, right) => left - right);
    if (!qualities.length) throw new Error(`星核 ${star.id} ${star.name} 缺少主星品质配置。`);
    const maxQuality = Math.max(...qualities);
    return {
      id: star.id,
      name: star.name,
      qualities,
      maxQuality,
      satelliteMaxLevel: star.satelliteLv,
      mainQualitySummary: qualities.map(quality => {
        const config = star.starCore[String(quality)];
        return {
          quality,
          attributes: config[1],
          ratio: config[2],
          score: config[3],
        };
      }),
      satellite: {
        attributes: star.satelliteAttribute?.[0] || [],
        ratio: star.satelliteAttribute?.[1],
      },
    };
  });

  const fullByWorldLevel = expWorldRows.map(expWorldRow => {
    const attrs = {};
    const evidence = [];
    const selectedStars = [];
    const worldAttrs = {};
    for (const field of Object.keys(activeWeights)) {
      if (Object.prototype.hasOwnProperty.call(expWorldRow, field)) {
        worldAttrs[field] = finiteNumber(expWorldRow[field], `expWorld.${expWorldRow.levelWorld}.${field}`);
      }
    }
    for (const star of starRows) {
      const qualities = Object.keys(star.starCore || {}).map(Number);
      const maxQuality = Math.max(...qualities);
      const mainAttrs = calcStarMainAttrs(star, maxQuality, expWorldRow);
      const satelliteAttrs = calcStarSatelliteAttrs(star, star.satelliteLv, expWorldRow);
      const totalAttrs = {};
      mergeAttrs(totalAttrs, mainAttrs, `starCore.${star.id}.main.total`);
      mergeAttrs(totalAttrs, satelliteAttrs, `starCore.${star.id}.satellite.total`);
      mergeAttrs(attrs, mainAttrs, `starCore.${star.id}.main`);
      mergeAttrs(attrs, satelliteAttrs, `starCore.${star.id}.satellite`);
      const qualityConfig = star.starCore[String(maxQuality)];
      selectedStars.push({
        starCoreId: star.id,
        starCoreName: star.name,
        quality: maxQuality,
        qualityRatio: qualityConfig[2],
        satelliteLevel: star.satelliteLv,
        satelliteRatio: star.satelliteAttribute?.[1],
        mainAttrs,
        satelliteAttrs,
        attrs: totalAttrs,
        mainFightPower: calcFightPower(mainAttrs, activeWeights),
        satelliteFightPower: calcFightPower(satelliteAttrs, activeWeights),
        fightPower: calcFightPower(totalAttrs, activeWeights),
      });
      evidence.push({ table: 'starCore', id: star.id, quality: maxQuality, satelliteLevel: star.satelliteLv, file: tableFileRef('starCore') });
    }
    return makePoint({
      moduleKey: 'starcore',
      stageKey: `starcore:all-stars:max-quality:max-satellite:world=${expWorldRow.levelWorld}`,
      label: `全部星核满配 世界等级 ${expWorldRow.levelWorld}`,
      params: {
        worldLevel: expWorldRow.levelWorld,
        worldAttrs,
        starCount: starRows.length,
        selectedStars,
        rule: '每颗星取最高品质主星 + 满级伴星。',
      },
      attrs,
      fightPower: calcFightPower(attrs, activeWeights),
      evidence: [
        { table: 'expWorld', id: expWorldRow.id, levelWorld: expWorldRow.levelWorld, file: tableFileRef('expWorld') },
        ...evidence,
      ],
    });
  });

  return {
    key: 'starcore',
    label: '雁行/星核',
    status: 'ready',
    formula: `主星 round(expWorld[field] * qualityRatio)；伴星 round(expWorld[field] * satelliteRatio * min(satelliteLv / maxSatelliteLv, 1))；默认每颗星取最高品质与满伴星等级，前端可逐星改品质和伴星等级；当前版本只取 expWorld.levelWorld <= ${configuredMaxLevel}。`,
    stageDimensions: ['starCoreId', 'quality', 'satelliteLevel', 'worldLevel'],
    note: '明细保留品质、伴星比例和公式；任意单星阶段可由这些配置与 expWorld 精确计算。fullByWorldLevel 给出全星核满配随世界等级曲线。',
    configuredMaxLevel,
    stars,
    fullByWorldLevel,
    maxFightPowerPoint: maxBy(fullByWorldLevel, point => point.fightPower),
    warnings: rawExpWorldRows.length === expWorldRows.length
      ? []
      : [`已按 settings.js data.maxLevel=${configuredMaxLevel} 过滤 expWorld.levelWorld，剔除 ${rawExpWorldRows.length - expWorldRows.length} 个超过当前等级上限的世界等级阶段。`],
  };
}

function buildTitleAttrRowsByButeId() {
  const rowsByButeId = new Map();
  for (const row of loadDataTable('titleAttribute')) {
    if (!rowsByButeId.has(row.buteId)) rowsByButeId.set(row.buteId, []);
    rowsByButeId.get(row.buteId).push(row);
  }
  for (const rows of rowsByButeId.values()) {
    rows.sort((left, right) => left.level - right.level || left.id - right.id);
  }
  return rowsByButeId;
}

function calcTitleAttrsAtPlayerLevel(title, playerLevel, attrRowsByButeId) {
  if (title.buteId == null) return null;
  const rows = attrRowsByButeId.get(title.buteId) || [];
  const row = rows.find(item => item.level >= playerLevel);
  if (!row) return null;
  const attrs = {};
  addAttrList(attrs, row.attribute || [], row.attributeValue || [], `titleAttribute.${row.id}`);
  return {
    title,
    titleAttribute: row,
    point: makePoint({
      moduleKey: 'title',
      stageKey: `title:type=${title.type}:id=${title.id}:playerLevel=${playerLevel}`,
      label: `${title.name} 玩家等级 ${playerLevel}`,
      params: {
        titleId: title.id,
        titleName: title.name,
        titleType: title.type,
        titleGroup: title.group,
        buteId: title.buteId,
        playerLevel,
        titleAttributeLevel: row.level,
      },
      attrs,
      fightPower: calcFightPower(attrs, attrRowsByButeId.activeWeights),
      evidence: [
        { table: 'title', id: title.id, file: tableFileRef('title') },
        { table: 'titleAttribute', id: row.id, file: tableFileRef('titleAttribute') },
      ],
    }),
  };
}

function buildTitleCurves(activeWeights, configuredMaxLevel) {
  const attrRowsByButeId = buildTitleAttrRowsByButeId();
  attrRowsByButeId.activeWeights = activeWeights;
  const titleRows = loadDataTable('title').sort((left, right) =>
    (left.type ?? 0) - (right.type ?? 0) ||
    (left.group ?? left.id) - (right.group ?? right.id) ||
    (left.level ?? 0) - (right.level ?? 0) ||
    left.id - right.id
  );
  const playerLevels = loadDataTable('exp')
    .map(row => row.level)
    .filter(level => {
      finiteInteger(level, 'exp.level');
      return level <= configuredMaxLevel;
    })
    .sort((left, right) => left - right);
  if (!playerLevels.length) throw new Error(`exp 表没有 level <= ${configuredMaxLevel} 的玩家等级阶段。`);
  const titleGroups = new Map();
  const exclusiveProgressTypes = new Map();
  const rawTypes = new Map();
  const skippedNoAttribute = [];

  for (const title of titleRows) {
    if (title.buteId == null || !attrRowsByButeId.has(title.buteId)) {
      skippedNoAttribute.push({ id: title.id, name: title.name, type: title.type, buteId: title.buteId });
      continue;
    }
    if (!rawTypes.has(title.type)) rawTypes.set(title.type, []);
    rawTypes.get(title.type).push(title);
    if (TITLE_EXCLUSIVE_PROGRESS_TYPES.has(title.type)) {
      if (!exclusiveProgressTypes.has(title.type)) exclusiveProgressTypes.set(title.type, []);
      exclusiveProgressTypes.get(title.type).push(title);
      continue;
    }
    const group = title.group ?? title.id;
    if (!titleGroups.has(group)) titleGroups.set(group, []);
    titleGroups.get(group).push(title);
  }

  const makeTitleCandidateOption = candidate => ({
    id: String(candidate.title.id),
    titleType: candidate.title.type,
    titleId: candidate.title.id,
    titleName: candidate.title.name,
    titleGroup: candidate.title.group,
    titleLevel: candidate.title.level,
    buteId: candidate.title.buteId,
    titleAttributeId: candidate.titleAttribute.id,
    titleAttributeLevel: candidate.titleAttribute.level,
    fightPower: candidate.point.fightPower,
    attrs: candidate.point.attrs,
  });

  const makeSelectedTitle = (selection, best, candidates) => ({
    selectionKind: selection.kind,
    selectionPoolKey: selection.key,
    selectionLabel: selection.label,
    candidateCount: selection.titles.length,
    titleType: best.title.type,
    titleId: best.title.id,
    titleName: best.title.name,
    titleGroup: best.title.group,
    titleLevel: best.title.level,
    buteId: best.title.buteId,
    titleAttributeId: best.titleAttribute.id,
    titleAttributeLevel: best.titleAttribute.level,
    fightPower: best.point.fightPower,
    attrs: best.point.attrs,
    candidateOptions: candidates.map(makeTitleCandidateOption),
  });

  const normalSelections = [...titleGroups.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([group, titles]) => ({
      kind: 'title_group',
      key: `group:${group}`,
      group,
      label: `${titles[0]?.name || `称号组 ${group}`} 系列`,
      rule: '同一称号系列只记录一个等级；当前阶段取该系列战力最高的一档。',
      titles: titles.slice().sort((left, right) =>
        (left.level ?? 0) - (right.level ?? 0) || left.id - right.id
      ),
    }));
  const specialSelections = [...exclusiveProgressTypes.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([titleType, titles]) => ({
      kind: 'exclusive_progress_type',
      key: `specialType:${titleType}`,
      titleType,
      label: TITLE_EXCLUSIVE_PROGRESS_TYPE_LABELS[titleType] || `类型 ${titleType}`,
      rule: `${TITLE_EXCLUSIVE_PROGRESS_TYPE_LABELS[titleType] || `类型 ${titleType}`}进阶称号只记录当前最高档；不会把本类型所有档位叠加。`,
      titles: titles.slice().sort((left, right) => left.id - right.id),
    }));
  const selections = [...normalSelections, ...specialSelections];

  const levels = playerLevels.map(playerLevel => {
    const attrs = {};
    const selectedTitles = [];
    const evidence = [];
    for (const selection of selections) {
      const candidates = selection.titles
        .map(title => calcTitleAttrsAtPlayerLevel(title, playerLevel, attrRowsByButeId))
        .filter(Boolean);
      const best = maxBy(candidates, item => item.point.fightPower);
      if (!best) continue;
      mergeAttrs(attrs, best.point.attrs, `title.${selection.key}`);
      selectedTitles.push(makeSelectedTitle(selection, best, candidates));
      evidence.push(...best.point.evidence);
    }
    return makePoint({
      moduleKey: 'title',
      stageKey: `title:group-dedup-with-special-progress:playerLevel=${playerLevel}`,
      label: `称号系列去重满配 玩家等级 ${playerLevel}`,
      params: {
        playerLevel,
        normalTitleGroupCount: normalSelections.length,
        specialProgressTypeCount: specialSelections.length,
        selectedTitleCount: selectedTitles.length,
        rule: '普通称号按 title.group 同系列只取一个等级；VIP、仙位、斗宠按进阶类型只取当前最高档。',
        selectedTitles,
      },
      attrs,
      fightPower: calcFightPower(attrs, activeWeights),
      evidence,
      warnings: ['称号已按同系列去重计算；VIP、仙位、斗宠按特殊进阶类只计当前最高档；无属性或缺 titleAttribute 的称号未计入属性。'],
    });
  });

  const selectionPools = selections.map(selection => ({
    key: selection.key,
    kind: selection.kind,
    label: selection.label,
    rule: selection.rule,
    group: selection.group,
    titleType: selection.titleType,
    titleCount: selection.titles.length,
    titles: selection.titles.map(title => ({
      id: title.id,
      name: title.name,
      level: title.level,
      type: title.type,
      group: title.group,
      buteId: title.buteId,
      showName: title.showName,
    })),
  }));
  const types = [...rawTypes.entries()].sort((left, right) => left[0] - right[0]).map(([titleType, titles]) => ({
    titleType,
    titleCount: titles.length,
    titles: titles.map(title => ({
      id: title.id,
      name: title.name,
      level: title.level,
      group: title.group,
      buteId: title.buteId,
      showName: title.showName,
    })),
  }));
  const attributedTitleCount = titleRows.length - skippedNoAttribute.length;

  return {
    key: 'title',
    label: '称号',
    status: 'ready',
    formula: `普通称号按 title.group 同系列只取一个等级；VIP、仙位、斗宠按进阶类型只取一档；每个玩家等级阶段按 titleAttribute 中第一条 level >= 玩家等级的属性档计算；默认选当前阶段最高战力档，前端可在同池候选中改选；当前版本只取玩家等级 <= ${configuredMaxLevel}。`,
    stageDimensions: ['titleGroup', 'specialProgressType', 'playerLevel'],
    configuredMaxLevel,
    types,
    selectionPools,
    candidateStats: {
      titleCount: titleRows.length,
      attributedTitleCount,
      skippedNoAttributeCount: skippedNoAttribute.length,
      normalTitleGroupCount: normalSelections.length,
      normalTitleRowCount: normalSelections.reduce((sum, selection) => sum + selection.titles.length, 0),
      specialProgressTypeCount: specialSelections.length,
      specialTitleRowCount: specialSelections.reduce((sum, selection) => sum + selection.titles.length, 0),
      rawAttributedTypeCount: rawTypes.size,
    },
    levels,
    skippedNoAttribute,
    maxFightPowerPoint: maxBy(levels, point => point.fightPower),
    warnings: [
      '普通称号已按 title.group 同系列去重，避免把同一称号多个等级重复叠加。',
      'VIP、仙位、斗宠称号已按特殊进阶类处理，每类只计当前阶段最高档。',
      `已按 settings.js data.maxLevel=${configuredMaxLevel} 过滤玩家等级阶段。`,
    ],
  };
}

function calcMatrixEyeAttrs(row) {
  const attrs = {};
  if (!Array.isArray(row.attribute) || !Array.isArray(row.attributeBase) || !Array.isArray(row.attributeGrowthRatio)) {
    throw new Error(`matrixCore.${row.id} 属性、基础值或成长比例不是数组。`);
  }
  if (row.attribute.length !== row.attributeBase.length || row.attribute.length !== row.attributeGrowthRatio.length) {
    throw new Error(`matrixCore.${row.id} 属性数组长度不一致。`);
  }
  finiteNumber(row.attributeBaseRatio, `matrixCore.${row.id}.attributeBaseRatio`);
  finiteInteger(row.levelLimit, `matrixCore.${row.id}.levelLimit`);
  for (let index = 0; index < row.attribute.length; index += 1) {
    const field = row.attribute[index];
    const base = finiteNumber(row.attributeBase[index] || 0, `matrixCore.${row.id}.attributeBase.${field}`);
    const growthPair = row.growth?.[index];
    if (!Array.isArray(growthPair) || growthPair.length < 2) {
      throw new Error(`matrixCore.${row.id}.growth.${field} 缺少满成长上限。`);
    }
    const maxGrowth = finiteNumber(growthPair[1], `matrixCore.${row.id}.growth.${field}.max`);
    if (maxGrowth === 0) throw new Error(`matrixCore.${row.id}.growth.${field}.max 为 0，无法按运行时满成长公式计算。`);
    const growthRollRatio = maxGrowth / maxGrowth;
    const growth = finiteNumber(row.attributeGrowthRatio[index], `matrixCore.${row.id}.attributeGrowthRatio.${field}`);
    const value = Math.floor(
      base * row.attributeBaseRatio +
      base * growthRollRatio * (1 - row.attributeBaseRatio) +
      growth * growthRollRatio * row.levelLimit
    );
    addAttr(attrs, field, value, `matrixCore.${row.id}.${field}`);
  }
  return attrs;
}

function buildMatrixCoreIndex(activeWeights) {
  const byGroup = new Map();
  for (const row of loadDataTable('matrixCore')) {
    if (row.isClose) continue;
    if (!byGroup.has(row.group)) byGroup.set(row.group, []);
    byGroup.get(row.group).push(row);
  }
  const indexedCandidates = new Map();
  const coreGroups = [];
  for (const [group, rows] of [...byGroup.entries()].sort((left, right) => left[0] - right[0])) {
    const candidates = rows
      .filter(row => row.type === MATRIX_CORE_TYPE)
      .map(row => {
        const attrs = calcMatrixEyeAttrs(row);
        return { row, attrs, fightPower: calcFightPower(attrs, activeWeights) };
      })
      .sort((left, right) =>
        right.row.quality - left.row.quality ||
        right.fightPower - left.fightPower ||
        left.row.id - right.row.id
      );
    if (!candidates.length) continue;
    indexedCandidates.set(`${group}:${MATRIX_CORE_TYPE}`, candidates);
    coreGroups.push({
      group,
      type: MATRIX_CORE_TYPE,
      candidates: candidates.map(candidate => ({
        id: candidate.row.id,
        name: candidate.row.name,
        group: candidate.row.group,
        quality: candidate.row.quality,
        levelLimit: candidate.row.levelLimit,
        attrs: candidate.attrs,
        fightPower: candidate.fightPower,
      })),
    });
  }
  const pick = (group, expectedType) => {
    const candidates = indexedCandidates.get(`${group}:${expectedType}`) || [];
    if (!candidates.length) throw new Error(`matrixCore 缺少 group=${group} type=${expectedType} 的有效行。`);
    const maxQuality = Math.max(...candidates.map(candidate => finiteInteger(candidate.row.quality, `matrixCore.${candidate.row.id}.quality`)));
    return maxBy(candidates.filter(candidate => candidate.row.quality === maxQuality), candidate => candidate.fightPower);
  };
  return { pick, coreGroups };
}

function buildMatrixSuitOptions(activeWeights) {
  return loadDataTable('matrixSuit').map(row => {
    const attrs = attrsFromAttributeArrays(row.attribute || [], row.attributeValue || [], `matrixSuit.${row.id}`);
    return {
      id: row.id,
      suit: row.suit,
      quality: row.quality,
      attrs,
      fightPower: calcFightPower(attrs, activeWeights),
    };
  });
}

function addMatrixSuitAttrs(attrs, evidence, matrixRow, selectedCores) {
  if (!selectedCores.length) return null;
  const suitQuality = selectedCores.reduce((quality, item) => Math.min(quality, item.row.quality), Infinity);
  if (!Number.isFinite(suitQuality)) return null;
  const suitRows = loadDataTable('matrixSuit').filter(row => row.suit === matrixRow.matrixCoreSuit);
  const suitRow = suitRows.find(row => row.quality === suitQuality);
  if (!suitRow) {
    throw new Error(`matrixSuit 缺少 suit=${matrixRow.matrixCoreSuit} quality=${suitQuality} 的核心套装行。`);
  }
  addAttrList(attrs, suitRow.attribute || [], suitRow.attributeValue || [], `matrixSuit.${suitRow.id}`);
  evidence.push({ table: 'matrixSuit', id: suitRow.id, suit: suitRow.suit, quality: suitRow.quality, file: tableFileRef('matrixSuit') });
  return suitRow;
}

function calcMatrixPoint(matrixRows, roleLevel, activeWeights, coreIndex, configuredMaxLevel) {
  const attrs = {};
  const selectedMatrices = [];
  const evidence = [];
  for (const matrixRow of matrixRows.filter(row => row.limitLv <= roleLevel)) {
    const matrixAttrs = {};
    const selectedCores = [];
    for (const group of matrixRow.matrixCore || []) {
      const selected = coreIndex.pick(group, MATRIX_CORE_TYPE);
      mergeAttrs(matrixAttrs, selected.attrs, `matrix.${matrixRow.id}.core.${group}`);
      selectedCores.push(selected);
      evidence.push({ table: 'matrixCore', id: selected.row.id, group, quality: selected.row.quality, file: tableFileRef('matrixCore') });
    }
    const matrixEvidence = [{ table: 'matrix', id: matrixRow.id, limitLv: matrixRow.limitLv, file: tableFileRef('matrix') }];
    const suitRow = addMatrixSuitAttrs(matrixAttrs, matrixEvidence, matrixRow, selectedCores);
    mergeAttrs(attrs, matrixAttrs, `matrix.${matrixRow.id}`);
    evidence.push(...matrixEvidence);
    selectedMatrices.push({
      matrixId: matrixRow.id,
      matrixName: matrixRow.name,
      roleLevelRequired: matrixRow.limitLv,
      coreCount: selectedCores.length,
      soulCount: Array.isArray(matrixRow.matrixSoul) ? matrixRow.matrixSoul.length : 0,
      coreSuitId: matrixRow.matrixCoreSuit,
      coreSuitQuality: suitRow?.quality ?? null,
      fightPower: calcFightPower(matrixAttrs, activeWeights),
      attrs: matrixAttrs,
      selectedCores: selectedCores.map(item => ({
        id: item.row.id,
        name: item.row.name,
        group: item.row.group,
        quality: item.row.quality,
        levelLimit: item.row.levelLimit,
        attrs: item.attrs,
        fightPower: item.fightPower,
      })),
    });
  }
  return makePoint({
    moduleKey: 'matrix',
    stageKey: `matrix:full-by-role-level=${roleLevel}`,
    label: `阵法满核心 角色等级 ${roleLevel}`,
    params: {
      roleLevel,
      configuredMaxLevel,
      matrixCount: selectedMatrices.length,
      selectedMatrices,
      rule: '按角色等级解锁阵法；每个阵法装满最高品质、满等级、满成长阵眼核心，并加入最低核心品质对应的核心套装属性。',
    },
    attrs,
    fightPower: calcFightPower(attrs, activeWeights),
    evidence,
    warnings: ['觉魂提供的是 powerAttribute[1] 权重为 0 的百分比属性，且同品质刚/柔分支不能由战力唯一确定；当前阵法战力曲线按运行时最高战力核心链路计算。'],
  });
}

function buildMatrixCurves(activeWeights, configuredMaxLevel) {
  const rawRows = loadDataTable('matrix').sort((left, right) => left.limitLv - right.limitLv || left.id - right.id);
  const matrixRows = rawRows.filter(row => row.close !== 1 && row.limitLv <= configuredMaxLevel);
  if (!matrixRows.length) throw new Error(`matrix 表没有 limitLv <= ${configuredMaxLevel} 的有效阵法。`);
  const coreIndex = buildMatrixCoreIndex(activeWeights);
  const stageLevels = Array.from(new Set([
    ...matrixRows.map(row => row.limitLv),
    configuredMaxLevel,
  ])).filter(level => level >= matrixRows[0].limitLv).sort((left, right) => left - right);
  const fullByRoleLevel = stageLevels.map(roleLevel =>
    calcMatrixPoint(matrixRows, roleLevel, activeWeights, coreIndex, configuredMaxLevel)
  );
  return {
    key: 'matrix',
    label: '阵法',
    status: 'ready',
    formula: '按 matrix.limitLv 解锁阵法；每个 matrixCore 孔位默认选最高品质、最高战力核心，按 floor(base * ratio + base * 满成长 * (1 - ratio) + growthRatio * 满成长 * levelLimit) 计算属性，再加入 matrixCoreSuit 最低核心品质套装属性；前端可按孔位改选核心并重算套装品质。',
    stageDimensions: ['roleLevel', 'matrixId', 'matrixCoreQuality'],
    configuredMaxLevel,
    coreGroups: coreIndex.coreGroups,
    suitOptions: buildMatrixSuitOptions(activeWeights),
    fullByRoleLevel,
    maxFightPowerPoint: maxBy(fullByRoleLevel, point => point.fightPower),
    warnings: [
      '阵法战力按 UserInfoManager.calAllMatrixFightPower / calMatrixFightPower 的核心属性与核心套装链路计算。',
      'matrixSoul 觉魂百分比属性在 powerAttribute[1] 中权重为 0，不影响战力；本模块战力曲线不伪造刚/柔觉魂分支。',
      rawRows.length === matrixRows.length
        ? null
        : `已按 settings.js data.maxLevel=${configuredMaxLevel} 过滤 matrix.limitLv，剔除 ${rawRows.length - matrixRows.length} 个超过当前等级上限的阵法。`,
    ].filter(Boolean),
  };
}

function meridiansUnlockSatisfied(unLock, roleLevel) {
  if (!Array.isArray(unLock)) return false;
  return unLock.every(condition => {
    if (!Array.isArray(condition) || condition.length < 2) {
      throw new Error(`meridiansSpecial.unLock 配置异常: ${JSON.stringify(condition)}`);
    }
    if (condition[0] !== 1) {
      throw new Error(`meridiansSpecial.unLock 出现未确认条件类型 ${condition[0]}。`);
    }
    const requiredLevel = condition[1]?.[0];
    finiteInteger(requiredLevel, `meridiansSpecial.unLock.${JSON.stringify(condition)}`);
    return roleLevel >= requiredLevel;
  });
}

function buildMeridiansTypeBase(type, roleLevel, rowsByTypeRank) {
  const meridianRows = (rowsByTypeRank.meridians.get(type) || []).sort((left, right) => left.rank - right.rank);
  const attrs = {};
  const evidence = [];
  let field = null;
  let highestOpenedRank = -1;
  let currentRank = null;
  let currentLevel = null;
  for (const row of meridianRows) {
    if (!row.openLv || roleLevel < row.upLevelLv) continue;
    highestOpenedRank = Math.max(highestOpenedRank, row.rank);
    currentRank = row.rank;
    currentLevel = row.upRankLv;
    const attrRows = rowsByTypeRank.attrs.get(`${type}:${row.rank}`) || [];
    for (const attrRow of attrRows) {
      if (attrRow.level > row.upRankLv) continue;
      const attrField = attrRow.attribute?.[0];
      if (!attrField) throw new Error(`meridiansAttribute.${attrRow.id} 缺少属性字段。`);
      if (field && field !== attrField) {
        throw new Error(`经脉 type=${type} 出现多个属性字段: ${field}, ${attrField}`);
      }
      field = attrField;
      addAttr(attrs, attrField, attrRow.attributeValue?.[0] || 0, `meridiansAttribute.${attrRow.id}.${attrField}`);
      evidence.push({ table: 'meridiansAttribute', id: attrRow.id, type, rank: row.rank, level: attrRow.level, file: tableFileRef('meridiansAttribute') });
    }
  }
  const nextRank = highestOpenedRank + 1;
  const nextRow = (rowsByTypeRank.attrs.get(`${type}:${nextRank}`) || []).find(row => row.level === 0);
  if (nextRow) {
    const attrField = nextRow.attribute?.[0];
    if (!attrField) throw new Error(`meridiansAttribute.${nextRow.id} 缺少属性字段。`);
    if (field && field !== attrField) {
      throw new Error(`经脉 type=${type} 出现多个属性字段: ${field}, ${attrField}`);
    }
    field = attrField;
    currentRank = nextRank;
    currentLevel = 0;
    addAttr(attrs, attrField, nextRow.attributeValue?.[0] || 0, `meridiansAttribute.${nextRow.id}.${attrField}`);
    evidence.push({ table: 'meridiansAttribute', id: nextRow.id, type, rank: nextRank, level: 0, file: tableFileRef('meridiansAttribute') });
  }
  return {
    type,
    field,
    rank: currentRank,
    level: currentLevel,
    attrs,
    baseAttrVal: field ? attrs[field] || 0 : 0,
    evidence,
  };
}

function buildMeridiansRowsIndex() {
  const meridiansByType = new Map();
  for (const row of loadDataTable('meridians')) {
    if (!meridiansByType.has(row.type)) meridiansByType.set(row.type, []);
    meridiansByType.get(row.type).push(row);
  }
  const attrsByTypeRank = new Map();
  for (const row of loadDataTable('meridiansAttribute')) {
    const key = `${row.type}:${row.rank}`;
    if (!attrsByTypeRank.has(key)) attrsByTypeRank.set(key, []);
    attrsByTypeRank.get(key).push(row);
  }
  for (const rows of attrsByTypeRank.values()) {
    rows.sort((left, right) => left.level - right.level || left.id - right.id);
  }
  return { meridians: meridiansByType, attrs: attrsByTypeRank };
}

function buildMeridiansPillCandidateIndex() {
  const pillRows = loadDataTable('meridiansSpecialPill').filter(row => !row.close);
  if (!pillRows.length) throw new Error('meridiansSpecialPill 表没有可用丹魂行。');
  const temperatureRows = loadDataTable('meridiansTemperatureQuality').filter(row => !row.close);
  if (!temperatureRows.length) throw new Error('meridiansTemperatureQuality 表没有可用丹魂温度品质行。');
  const temperatureByGroup = new Map(temperatureRows.map(row => [row.group, row]));
  const maxQuality = Math.max(...pillRows.map(row => finiteInteger(row.quality, `meridiansSpecialPill.${row.id}.quality`)));
  const candidatesByType = new Map();
  for (const row of pillRows.filter(item => item.quality === maxQuality)) {
    if (!Array.isArray(row.attribute) || !row.attribute.length) {
      throw new Error(`meridiansSpecialPill.${row.id}.attribute 缺少丹魂固定属性。`);
    }
    if (!Array.isArray(row.qualityValue) || row.qualityValue.length <= CONFIG_RANGE_MAX_INDEX) {
      throw new Error(`meridiansSpecialPill.${row.id}.qualityValue 缺少上限值。`);
    }
    const qualityMax = finiteNumber(row.qualityValue[CONFIG_RANGE_MAX_INDEX], `meridiansSpecialPill.${row.id}.qualityValueMax`);
    const temperature = temperatureByGroup.get(row.group);
    if (!temperature) throw new Error(`meridiansSpecialPill.${row.id}.group=${row.group} 找不到 meridiansTemperatureQuality。`);
    if (!Array.isArray(temperature.energy) || !Array.isArray(temperature.energyValue)) {
      throw new Error(`meridiansTemperatureQuality.${temperature.id}.energy/energyValue 缺失。`);
    }
    const fixedAttrs = row.attribute.map(field => {
      const energyIndex = temperature.energy.indexOf(field);
      if (energyIndex < 0) {
        throw new Error(`meridiansSpecialPill.${row.id}.${field} 不在 meridiansTemperatureQuality.${temperature.id}.energy 中。`);
      }
      const energyPercent = finiteNumber(
        temperature.energyValue[energyIndex],
        `meridiansTemperatureQuality.${temperature.id}.energyValue.${field}`
      );
      return {
        field,
        energyPercent,
        ratio: qualityMax * energyPercent / PERCENT_DENOMINATOR,
      };
    });
    const candidate = {
      pillId: row.id,
      pillType: row.type,
      group: row.group,
      quality: row.quality,
      priority: finiteNumber(temperature.priority, `meridiansTemperatureQuality.${temperature.id}.priority`),
      qualityValue: [...row.qualityValue],
      fixedAttrs,
      attributeSlotCount: fixedAttrs.length,
    };
    if (!candidatesByType.has(row.type)) candidatesByType.set(row.type, []);
    candidatesByType.get(row.type).push(candidate);
  }
  for (const [type, candidates] of candidatesByType.entries()) {
    candidates.sort((left, right) =>
      right.priority - left.priority
      || right.attributeSlotCount - left.attributeSlotCount
      || left.pillId - right.pillId
    );
    if (!candidates.length) throw new Error(`丹魂 type=${type} 没有金色固定属性候选。`);
  }
  return {
    maxQuality,
    candidatesByType,
    candidateTypeCount: candidatesByType.size,
  };
}

function selectMeridiansPillsForStage(unlockedSlots, lines, activeWeights, pillIndex) {
  const sortedSlots = [...unlockedSlots].sort((left, right) => left.id - right.id);
  const lineByField = new Map(lines.map(line => [line.field, line]));
  const selectedPills = [];
  const pillAttrs = {};
  const ratioByField = {};
  const availableTypes = [...pillIndex.candidatesByType.keys()].sort((left, right) => left - right);
  if (sortedSlots.length > availableTypes.length) {
    throw new Error(`经脉丹魂槽 ${sortedSlots.length} 个，但 meridiansSpecialPill 只有 ${availableTypes.length} 个可用 type。`);
  }
  for (let index = 0; index < sortedSlots.length; index += 1) {
    const slot = sortedSlots[index];
    const pillType = availableTypes[index];
    const candidates = pillIndex.candidatesByType.get(pillType) || [];
    if (!candidates.length) {
      throw new Error(`丹魂 type=${pillType} 没有能加成当前经脉属性的金色固定属性候选。`);
    }
    const candidate = candidates[0];
    const fixedAttrs = candidate.fixedAttrs.map(attr => {
      const line = lineByField.get(attr.field);
      if (!line) {
        throw new Error(`丹魂 type=${pillType} 的固定属性 ${attr.field} 找不到对应外丹基础属性。`);
      }
      ratioByField[attr.field] = (ratioByField[attr.field] || 0) + attr.ratio;
      return {
        field: attr.field,
        energyPercent: attr.energyPercent,
        ratio: attr.ratio,
        baseAttrVal: line.baseAttrVal,
      };
    });
    selectedPills.push({
      slotId: slot.id,
      pillType,
      pillId: candidate.pillId,
      group: candidate.group,
      quality: candidate.quality,
      priority: candidate.priority,
      qualityValue: candidate.qualityValue,
      fixedAttrs,
      attributeSlotCount: candidate.attributeSlotCount,
    });
  }
  for (const [field, ratio] of Object.entries(ratioByField)) {
    const line = lineByField.get(field);
    if (!line) throw new Error(`丹魂累计属性 ${field} 找不到对应外丹基础属性。`);
    const addAttrVal = Math.ceil(line.baseAttrVal * ratio);
    addAttr(pillAttrs, field, addAttrVal, `meridiansSpecialPill.totalRatio.${field}`);
  }
  return {
    selectedPills,
    pillAttrs,
    ratioByField,
    fightPower: calcFightPower(pillAttrs, activeWeights),
  };
}

function calcMeridiansPoint(roleLevel, activeWeights, rowsByTypeRank, specialRows, pillIndex, configuredMaxLevel) {
  const types = [...rowsByTypeRank.meridians.keys()].sort((left, right) => left - right);
  const baseAttrs = {};
  const lines = [];
  const evidence = [];
  for (const type of types) {
    const line = buildMeridiansTypeBase(type, roleLevel, rowsByTypeRank);
    mergeAttrs(baseAttrs, line.attrs, `meridians.type.${type}`);
    evidence.push(...line.evidence);
    lines.push({
      type,
      field: line.field,
      rank: line.rank,
      level: line.level,
      baseAttrVal: line.baseAttrVal,
      baseFightPower: calcFightPower(line.attrs, activeWeights),
      attrs: line.attrs,
    });
  }
  const unlockedSlots = specialRows.filter(row => !row.close && meridiansUnlockSatisfied(row.unLock, roleLevel));
  const pillSelection = selectMeridiansPillsForStage(unlockedSlots, lines, activeWeights, pillIndex);
  const attrs = { ...baseAttrs };
  mergeAttrs(attrs, pillSelection.pillAttrs, 'meridians.selectedPills');
  const fullLines = lines.map(line => {
    const pillRatio = pillSelection.ratioByField[line.field] || 0;
    const pillAddAttrVal = Math.ceil(line.baseAttrVal * pillRatio);
    const totalAttrVal = (line.attrs[line.field] || 0) + pillAddAttrVal;
    return {
      ...line,
      pillRatio,
      pillAddAttrVal,
      totalAttrVal,
      totalFightPower: Math.floor(totalAttrVal * activeWeights[line.field]),
    };
  });
  const firstLine = lines[0];
  const unitField = firstLine?.field;
  const runtimeWeight = unitField ? activeWeights[unitField] : null;
  const sameBaseValue = lines.every(line => line.baseAttrVal === firstLine?.baseAttrVal);
  const runtimeMaxFightPower = sameBaseValue && typeof runtimeWeight === 'number'
    ? runtimeWeight * (lines.length + unlockedSlots.length) * firstLine.baseAttrVal
    : null;
  return makePoint({
    moduleKey: 'meridians',
    stageKey: `meridians:base-by-role-level=${roleLevel}`,
    label: `经脉基础满配 角色等级 ${roleLevel}`,
    params: {
      roleLevel,
      configuredMaxLevel,
      typeCount: lines.length,
      unlockedSpecialSlotCount: unlockedSlots.length,
      selectedPillCount: pillSelection.selectedPills.length,
      selectedPills: pillSelection.selectedPills,
      pillFightPower: pillSelection.fightPower,
      runtimeMaxFightPower,
      runtimeMaxPowerFormula: 'MeridiansManager.celMaxPower: powerWeight * (经脉条数 + 已解锁丹魂槽数) * 单条经脉满基础值',
      lines: fullLines,
      baseAttrs,
      pillAttrs: pillSelection.pillAttrs,
      rule: '基础经脉按角色等级可达阶数累计；丹魂来自存档已镶嵌丹魂，固定属性由 meridiansSpecialPill.group 对应的 meridiansTemperatureQuality.energy/energyValue 决定，不存在按槽位自由选择属性的入口。当前构成只展示金色满 roll 的固定丹方属性。',
    },
    attrs,
    fightPower: calcFightPower(attrs, activeWeights),
    evidence: [
      ...evidence,
      ...unlockedSlots.map(row => ({ table: 'meridiansSpecial', id: row.id, file: tableFileRef('meridiansSpecial') })),
      ...pillSelection.selectedPills.map(row => ({ table: 'meridiansSpecialPill', id: row.pillId, type: row.pillType, group: row.group, quality: row.quality, file: tableFileRef('meridiansSpecialPill') })),
    ],
  });
}

function buildMeridiansCurves(activeWeights, configuredMaxLevel) {
  const rowsByTypeRank = buildMeridiansRowsIndex();
  const meridianRows = loadDataTable('meridians');
  const specialRows = loadDataTable('meridiansSpecial');
  const pillIndex = buildMeridiansPillCandidateIndex();
  const stageLevels = Array.from(new Set([
    ...meridianRows
      .filter(row => row.openLv && row.upLevelLv <= configuredMaxLevel)
      .map(row => row.upLevelLv),
    configuredMaxLevel,
  ])).sort((left, right) => left - right);
  if (!stageLevels.length) throw new Error(`meridians 表没有 upLevelLv <= ${configuredMaxLevel} 的基础经脉阶段。`);
  const fullByRoleLevel = stageLevels.map(roleLevel =>
    calcMeridiansPoint(roleLevel, activeWeights, rowsByTypeRank, specialRows, pillIndex, configuredMaxLevel)
  );
  const runtimeMaxPowerDifferences = fullByRoleLevel
    .filter(point => typeof point.params.runtimeMaxFightPower === 'number' && point.fightPower !== point.params.runtimeMaxFightPower)
    .map(point => ({
      roleLevel: point.params.roleLevel,
      fightPower: point.fightPower,
      runtimeMaxFightPower: point.params.runtimeMaxFightPower,
      delta: point.fightPower - point.params.runtimeMaxFightPower,
    }));
  const maxRuntimePoint = maxBy(
    fullByRoleLevel.filter(point => typeof point.params.runtimeMaxFightPower === 'number'),
    point => point.params.runtimeMaxFightPower
  );
  return {
    key: 'meridians',
    label: '经脉',
    status: 'ready',
    formula: '基础经脉按 meridians.upLevelLv 解锁；每条经脉累计已开放阶级 meridiansAttribute.attributeValue。丹魂固定属性由丹魂 group 对应的 energy/energyValue 决定，三属性丹魂按 50%/30%/20% 分配；运行时先汇总同属性比例，再对外丹基础值执行 Math.ceil(base * ratio)。',
    stageDimensions: ['roleLevel', 'meridiansType', 'rank', 'level', 'specialSlot', 'pillType', 'pillQuality'],
    configuredMaxLevel,
    sourceRules: [
      { label: '基础经脉', detail: `只取 meridians.upLevelLv <= ${configuredMaxLevel} 的可达阶级；每条经脉累计 meridiansAttribute.attributeValue。` },
      { label: '丹魂槽位', detail: 'meridiansSpecial.unLock 按角色等级解锁；当前表内 12 个槽位，230 级全部可开。' },
      { label: '同类限制', detail: 'MeridiansManager.netInlayPill 会收集已镶嵌丹魂 type；新丹魂 type 已存在时必须先摧毁旧丹魂，因此同 type 只生效一个。' },
      { label: '丹魂属性', detail: 'meridiansSpecialPill 的金色 quality=5，qualityValue 上限为 1；属性由 meridiansSpecialPill.group 关联 meridiansTemperatureQuality.energy/energyValue 固定决定，三属性丹魂满 roll 为 50%/30%/20%，游戏内没有按槽位手动改属性的入口。' },
      { label: '战力计算', detail: 'UserInfoManager.calMeridiansFightPower 对每条经脉先算基础值，再把同属性丹魂比例求和并执行 Math.ceil(base * ratio)，最后按 powerAttribute[1] 权重计入。' },
      { label: '上限显示', detail: 'MeridiansManager.celMaxPower 使用 5 * (6 + 已解锁丹魂槽) * 单条基础值，是界面上限估算；固定 50%/30%/20% 丹魂实际计算会受 Math.ceil 影响，导出以 calMeridiansFightPower 口径为准。' },
    ],
    pillCandidateStats: {
      maxQuality: pillIndex.maxQuality,
      candidateTypeCount: pillIndex.candidateTypeCount,
    },
    fullByRoleLevel,
    runtimeMaxPowerDifferences,
    runtimeMaxFightPowerPoint: maxRuntimePoint
      ? {
          roleLevel: maxRuntimePoint.params.roleLevel,
          fightPower: maxRuntimePoint.params.runtimeMaxFightPower,
          unlockedSpecialSlotCount: maxRuntimePoint.params.unlockedSpecialSlotCount,
          formula: maxRuntimePoint.params.runtimeMaxPowerFormula,
        }
      : null,
    maxFightPowerPoint: maxBy(fullByRoleLevel, point => point.fightPower),
    warnings: runtimeMaxPowerDifferences.length
      ? [`${runtimeMaxPowerDifferences.length} 个经脉阶段与 MeridiansManager.celMaxPower 界面估算存在取整差值，已按 UserInfoManager.calMeridiansFightPower 实际口径导出。`]
      : [],
  };
}

function buildFashionBallRatios(configuredMaxLevel) {
  const ratios = {};
  const rows = loadDataTable('equipFashionBall').sort((left, right) =>
    left.id - right.id
  );

  const stages = [];
  let previousRow = null;
  let maxLevelRequired = null;
  for (const row of rows) {
    if (previousRow == null && row.id !== 0) {
      throw new Error(`equipFashionBall 首个节点应为 id=0，实际为 id=${row.id}。`);
    }
    if (previousRow != null) {
      if (row.id !== previousRow.id + 1) {
        throw new Error(`equipFashionBall 节点不连续：id=${previousRow.id} 后接 id=${row.id}。`);
      }
      if (previousRow.upLevelLimits != null) {
        const required = finiteInteger(previousRow.upLevelLimits, `equipFashionBall.${previousRow.id}.upLevelLimits`);
        if (required > configuredMaxLevel) break;
        maxLevelRequired = maxLevelRequired == null ? required : Math.max(maxLevelRequired, required);
      }
    }

    for (const [field, value] of Object.entries(row.attributeValue || {})) {
      addAttr(ratios, field, value, `equipFashionBall.${row.id}.${field}`);
    }
    stages.push({
      row,
      ratios: { ...ratios },
      maxLevelRequired,
      rank: row.rank,
    });
    previousRow = row;
  }

  if (!stages.length) {
    throw new Error(`equipFashionBall 表没有 settings.js data.maxLevel=${configuredMaxLevel} 内可达的宝珠阶段。`);
  }
  return stages;
}

function applyFashionBallRatio(attrs, ratios) {
  const result = {};
  for (const [field, value] of Object.entries(attrs)) {
    addAttr(result, field, value * (1 + (ratios[field] || 0)), `fashion.ratio.${field}`);
  }
  return result;
}

function buildFashionCurves(activeWeights, configuredMaxLevel) {
  const fashionRows = loadDataTable('equipFashion')
    .filter(row => Array.isArray(row.attribute) && Array.isArray(row.attributeValue))
    .sort((left, right) => String(left.part).localeCompare(String(right.part)) || left.id - right.id);
  const rawBallRows = loadDataTable('equipFashionBall');
  const ballStages = buildFashionBallRatios(configuredMaxLevel);
  const fashionsByPart = new Map();
  for (const row of fashionRows) {
    const baseAttrs = {};
    addAttrList(baseAttrs, row.attribute, row.attributeValue, `equipFashion.${row.id}`);
    const roundedBaseAttrs = roundAttrs(baseAttrs);
    const prepared = {
      row,
      baseAttrs,
      roundedBaseAttrs,
      baseFightPower: calcFightPower(roundedBaseAttrs, activeWeights),
    };
    if (!fashionsByPart.has(row.part)) fashionsByPart.set(row.part, []);
    fashionsByPart.get(row.part).push(prepared);
  }

  const parts = [...fashionsByPart.entries()].sort((left, right) => String(left[0]).localeCompare(String(right[0]))).map(([part, rows]) => ({
    part,
    fashionCount: rows.length,
    candidates: rows.map(item => ({
      part,
      fashionId: item.row.id,
      fashionName: item.row.name,
      fashionType: item.row.type,
      baseAttrs: item.roundedBaseAttrs,
      baseFightPower: item.baseFightPower,
    })),
    maxBaseFightPowerPoint: maxBy(rows.map(item => {
      const row = item.row;
      const attrs = item.roundedBaseAttrs;
      return makePoint({
        moduleKey: 'fashion',
        stageKey: `fashion:part=${part}:id=${row.id}:ball=0`,
        label: `${part} ${row.name}`,
        params: { part, fashionId: row.id, fashionName: row.name, fashionType: row.type, ballId: 0 },
        attrs,
        fightPower: calcFightPower(attrs, activeWeights),
        evidence: [{ table: 'equipFashion', id: row.id, file: tableFileRef('equipFashion') }],
      });
    }), point => point.fightPower),
  }));

  const fullByBall = ballStages.map(({ row: ballRow, ratios, maxLevelRequired }) => {
    const attrs = {};
    const selectedFashions = [];
    const evidence = [{ table: 'equipFashionBall', id: ballRow.id, file: tableFileRef('equipFashionBall') }];
    for (const [part, rows] of [...fashionsByPart.entries()].sort((left, right) => String(left[0]).localeCompare(String(right[0])))) {
      let best = null;
      for (const item of rows) {
        const roundedAttrs = roundAttrs(applyFashionBallRatio(item.baseAttrs, ratios));
        const fightPower = calcFightPower(roundedAttrs, activeWeights);
        if (!best || fightPower > best.fightPower) {
          best = {
            row: item.row,
            attrs: roundedAttrs,
            fightPower,
          };
        }
      }
      if (!best) continue;
      mergeAttrs(attrs, best.attrs, `fashion.part.${part}`);
      selectedFashions.push({
        part,
        fashionId: best.row.id,
        fashionName: best.row.name,
        fightPower: best.fightPower,
        attrs: best.attrs,
      });
      evidence.push({ table: 'equipFashion', id: best.row.id, file: tableFileRef('equipFashion') });
    }
    return makePoint({
      moduleKey: 'fashion',
      stageKey: `fashion:best-per-part:ball=${ballRow.id}`,
      label: `时装各部位最优 宝珠 ${ballRow.rank}阶${ballRow.level}级`,
      params: {
        ballId: ballRow.id,
        ballRank: ballRow.rank,
        ballLevel: ballRow.level,
        ballMaxLevelRequired: maxLevelRequired,
        ballRatios: ratios,
        partCount: fashionsByPart.size,
        selectedFashions,
        rule: '每个穿戴部位只取一件时装，宝珠按运行时从 0 累加到当前 id 后放大时装属性。',
      },
      attrs,
      fightPower: calcFightPower(attrs, activeWeights),
      evidence,
    });
  });

  return {
    key: 'fashion',
    label: '时装与时装宝珠',
    status: 'ready',
    formula: `每个 part 选择一件穿戴时装；先汇总该件 attribute/attributeValue，再按 equipFashionBall[0..id] 累计百分比放大，合入后按运行时 round；宝珠按运行时从当前节点进到下一节点的 upLevelLimits 裁剪到 ${configuredMaxLevel} 级。`,
    stageDimensions: ['fashionPart', 'fashionBallId'],
    configuredMaxLevel,
    parts,
    fullByBall,
    maxFightPowerPoint: maxBy(fullByBall, point => point.fightPower),
    warnings: rawBallRows.length === ballStages.length
      ? []
      : [`已按 settings.js data.maxLevel=${configuredMaxLevel} 和时装宝珠进阶门槛过滤，剔除 ${rawBallRows.length - ballStages.length} 个未达等级上限的宝珠节点。`],
  };
}

function maxMagicGrowth(row) {
  if (!Array.isArray(row.growth) || !row.growth.length) {
    throw new Error(`法宝 ${row.id} ${row.name} 缺少 growth 范围。`);
  }
  return Math.max(...row.growth.map(value => finiteNumber(value, `magicWeapon.${row.id}.growth`)));
}

function calcMagicWeaponAttrs(row, level, growth, blessings) {
  const attrs = {};
  const blessingSet = new Set(blessings || []);
  for (const field of ['hp', 'mp', 'atk', 'def', 'healHp', 'healMp']) {
    const base = finiteNumber(row[field], `magicWeapon.${row.id}.${field}`);
    const add = finiteNumber(row[`${field}Add`], `magicWeapon.${row.id}.${field}Add`);
    const blessingId = Object.entries(MAGIC_BLESSING_FIELD_BY_ID).find(([, mappedField]) => mappedField === field)?.[0];
    const bonusRatio = blessingId != null && blessingSet.has(Number(blessingId)) ? MAGIC_BLESSING_GROWTH_BONUS_RATIO : 0;
    addAttr(attrs, field, Math.floor(0.5 + base + growth * (1 + bonusRatio) * add * level), `magicWeapon.${row.id}.${field}`);
  }
  return attrs;
}

function calcMagicSoulRowAttrs(row, multiplier = 1) {
  const attrs = {};
  addAttrList(
    attrs,
    row.attribute,
    row.attributeValue.map(value => finiteNumber(value, `magicWeaponSoul.${row.id}.attributeValue`) * multiplier),
    `magicWeaponSoul.${row.id}`
  );
  return attrs;
}

function buildMagicSoulCandidates(soulRows, activeWeights) {
  return soulRows
    .map(row => {
      const baseAttrs = calcMagicSoulRowAttrs(row);
      return {
        slotType: row.type,
        soulId: row.id,
        soulName: row.name,
        quality: row.quality,
        level: row.level,
        strength: row.strength,
        baseAttrs,
        baseFightPower: calcFightPower(baseAttrs, activeWeights),
      };
    })
    .sort((left, right) =>
      left.slotType - right.slotType ||
      left.level - right.level ||
      left.quality - right.quality ||
      left.soulId - right.soulId
    );
}

function compareMagicSoulCandidate(left, right, activeWeights) {
  if (!right) return left;
  const leftFightPower = calcFightPower(calcMagicSoulRowAttrs(left), activeWeights);
  const rightFightPower = calcFightPower(calcMagicSoulRowAttrs(right), activeWeights);
  if (leftFightPower !== rightFightPower) return leftFightPower > rightFightPower ? left : right;

  const leftLevel = finiteInteger(left.level, `magicWeaponSoul.${left.id}.level`);
  const rightLevel = finiteInteger(right.level, `magicWeaponSoul.${right.id}.level`);
  if (leftLevel !== rightLevel) return leftLevel > rightLevel ? left : right;

  const leftQuality = finiteInteger(left.quality, `magicWeaponSoul.${left.id}.quality`);
  const rightQuality = finiteInteger(right.quality, `magicWeaponSoul.${right.id}.quality`);
  if (leftQuality !== rightQuality) return leftQuality > rightQuality ? left : right;

  const leftStrength = finiteNumber(left.strength, `magicWeaponSoul.${left.id}.strength`);
  const rightStrength = finiteNumber(right.strength, `magicWeaponSoul.${right.id}.strength`);
  if (leftStrength !== rightStrength) return leftStrength > rightStrength ? left : right;

  return left.id > right.id ? left : right;
}

function bestMagicSoulForSlot(soulRows, slot, soulLevelLimit, activeWeights) {
  const candidates = soulRows.filter(row =>
    row.type === slot.type && finiteInteger(row.level, `magicWeaponSoul.${row.id}.level`) <= soulLevelLimit
  );
  if (!candidates.length) {
    throw new Error(`magicWeaponSoul 表缺少 ${slot.label} 槽位 <= ${soulLevelLimit} 阶的可镶嵌灵玉。`);
  }
  const row = candidates.reduce((best, item) => compareMagicSoulCandidate(item, best, activeWeights), null);
  const attrs = calcMagicSoulRowAttrs(row);
  return {
    slotType: slot.type,
    slotLabel: slot.label,
    soulId: row.id,
    soulName: row.name,
    quality: row.quality,
    level: row.level,
    strength: row.strength,
    baseAttrs: attrs,
    baseFightPower: calcFightPower(attrs, activeWeights),
  };
}

function maxMagicSoulLevelForWeapon(row, soulLevelRows) {
  if (row.closeSoul) return 0;
  const rows = soulLevelRows.filter(item => item.groupId === row.groupId);
  if (!rows.length) {
    throw new Error(`法宝 ${row.id} ${row.name} 已开放器魂，但 magicWeaponSoulLv 缺少 groupId=${row.groupId} 的等级链。`);
  }
  return Math.max(...rows.map(item => finiteInteger(item.level, `magicWeaponSoulLv.${item.id}.level`)));
}

function calcMagicSoulAttrs(row, soulRows, soulLevelRows, soulLevel, activeWeights) {
  const requestedSoulLevel = finiteInteger(soulLevel, `magicWeapon.${row.id}.soulLevel`);
  if (row.closeSoul || requestedSoulLevel <= 0) {
    return {
      attrs: {},
      fightPower: 0,
      selectedSouls: [],
      soulLevel: 0,
      maxSoulLevel: 0,
      soulLevelLimit: row.slouLevelLimit || 0,
      closeSoul: Boolean(row.closeSoul),
    };
  }

  const maxSoulLevel = maxMagicSoulLevelForWeapon(row, soulLevelRows);
  const actualSoulLevel = Math.min(requestedSoulLevel, maxSoulLevel);
  const soulLevelLimit = finiteInteger(row.slouLevelLimit, `magicWeapon.${row.id}.slouLevelLimit`);
  const attrs = {};
  const selectedSouls = MAGIC_SOUL_SLOT_TYPES.map(slot => {
    const soul = bestMagicSoulForSlot(soulRows, slot, soulLevelLimit, activeWeights);
    const scaledAttrs = calcMagicSoulRowAttrs(
      { id: soul.soulId, attribute: Object.keys(soul.baseAttrs), attributeValue: Object.values(soul.baseAttrs) },
      actualSoulLevel
    );
    mergeAttrs(attrs, scaledAttrs, `magicWeapon.${row.id}.soul.${slot.label}`);
    return {
      ...soul,
      attrs: scaledAttrs,
      fightPower: calcFightPower(scaledAttrs, activeWeights),
    };
  });

  return {
    attrs,
    fightPower: calcFightPower(attrs, activeWeights),
    selectedSouls,
    soulLevel: actualSoulLevel,
    maxSoulLevel,
    soulLevelLimit,
    closeSoul: false,
  };
}

function extractShowLimitRoleLevelRequired(showLimit, label) {
  if (!Array.isArray(showLimit)) return null;
  const levels = [];
  for (const item of showLimit) {
    if (Array.isArray(item) && item[0] === 1 && Array.isArray(item[1])) {
      for (const value of item[1]) {
        levels.push(finiteInteger(value, `${label}.showLimit.roleLevel`));
      }
    }
  }
  return levels.length ? Math.max(...levels) : null;
}

function buildMagicWeaponLevelNode(row, groupId, soulRows, soulLevelRows, activeWeights) {
  const maxGrowth = maxMagicGrowth(row);
  const blessings = Array.isArray(row.blessing) ? row.blessing : [];
  const lvLimit = finiteInteger(row.lvLimit, `magicWeapon.${row.id}.lvLimit`);
  const roleLevelRequired = extractShowLimitRoleLevelRequired(row.showLimit, `magicWeapon.${row.id}`);
  const maxSoulLevel = maxMagicSoulLevelForWeapon(row, soulLevelRows);
  const soulLevels = maxSoulLevel > 0
    ? Array.from({ length: maxSoulLevel }, (_, index) => index + 1)
    : [0];
  const levels = [];
  for (let level = 1; level <= lvLimit; level += 1) {
    for (const soulLevel of soulLevels) {
      const baseAttrs = calcMagicWeaponAttrs(row, level, maxGrowth, blessings);
      const soulResult = calcMagicSoulAttrs(row, soulRows, soulLevelRows, soulLevel, activeWeights);
      const attrs = { ...baseAttrs };
      mergeAttrs(attrs, soulResult.attrs, `magicWeapon.${row.id}.soul`);
      const evidence = [{ table: 'magicWeapon', id: row.id, file: tableFileRef('magicWeapon') }];
      for (const soul of soulResult.selectedSouls) {
        evidence.push({ table: 'magicWeaponSoul', id: soul.soulId, file: tableFileRef('magicWeaponSoul') });
      }
      if (soulResult.soulLevel > 0) {
        const soulLevelRow = soulLevelRows.find(item =>
          item.groupId === row.groupId && item.level === soulResult.soulLevel
        );
        if (!soulLevelRow) {
          throw new Error(`法宝 ${row.id} ${row.name} 缺少器魂等级 ${soulResult.soulLevel} 的 magicWeaponSoulLv 行。`);
        }
        evidence.push({ table: 'magicWeaponSoulLv', id: soulLevelRow.id, file: tableFileRef('magicWeaponSoulLv') });
      }
      const baseFightPower = calcFightPower(baseAttrs, activeWeights);
      const soulFightPower = soulResult.fightPower;
      levels.push(makePoint({
        moduleKey: 'magic',
        stageKey: `magic:group=${groupId}:weapon=${row.id}:level=${level}:soul=${soulResult.soulLevel}:max-growth:full-blessing`,
        label: `${row.name} Lv.${level}${soulResult.soulLevel > 0 ? ` / 器魂 Lv.${soulResult.soulLevel}` : ' / 未开放器魂'} 满成长满祝福`,
        params: {
          groupId,
          magicWeaponId: row.id,
          magicWeaponName: row.name,
          phase: row.phases,
          level,
          growth: maxGrowth,
          blessings,
          roleLevelRequired,
          baseAttrs,
          soulAttrs: soulResult.attrs,
          baseFightPower,
          soulFightPower,
          soulLevel: soulResult.soulLevel,
          maxSoulLevel: soulResult.maxSoulLevel,
          soulLevelLimit: soulResult.soulLevelLimit,
          closeSoul: soulResult.closeSoul,
          selectedSouls: soulResult.selectedSouls,
        },
        attrs,
        fightPower: calcFightPower(attrs, activeWeights),
        evidence,
      }));
    }
  }
  return {
    groupId,
    magicWeaponId: row.id,
    magicWeaponName: row.name,
    phase: row.phases,
    roleLevelRequired,
    closeSoul: Boolean(row.closeSoul),
    soulLevelLimit: row.slouLevelLimit || 0,
    maxSoulLevel,
    levels,
    maxFightPowerPoint: maxBy(levels, point => point.fightPower),
  };
}

function buildMagicCurves(activeWeights, configuredMaxLevel) {
  const allRows = loadDataTable('magicWeapon').sort((left, right) =>
    left.groupId - right.groupId || left.phases - right.phases || left.id - right.id
  );
  const unobtainableRows = allRows.filter(row => MAGIC_UNOBTAINABLE_PHASES.has(row.phases));
  const rows = allRows.filter(row => !MAGIC_UNOBTAINABLE_PHASES.has(row.phases));
  const soulRows = loadDataTable('magicWeaponSoul');
  const soulLevelRows = loadDataTable('magicWeaponSoulLv');
  const byGroup = new Map();
  for (const row of rows) {
    if (!byGroup.has(row.groupId)) byGroup.set(row.groupId, []);
    byGroup.get(row.groupId).push(row);
  }

  const skippedGroups = [];
  const groups = [...byGroup.entries()].sort((left, right) => left[0] - right[0]).map(([groupId, groupRows]) => {
    const reachableRows = groupRows.filter(row => {
      const requiredLevel = extractShowLimitRoleLevelRequired(row.showLimit, `magicWeapon.${row.id}`);
      return requiredLevel == null || requiredLevel <= configuredMaxLevel;
    });
    if (!reachableRows.length) {
      skippedGroups.push({
        groupId,
        weaponIds: groupRows.map(row => row.id),
        reason: `showLimit 角色等级要求超过 ${configuredMaxLevel}`,
      });
      return null;
    }

    const weaponOptions = reachableRows.map(row => buildMagicWeaponLevelNode(row, groupId, soulRows, soulLevelRows, activeWeights));
    const selected = maxBy(weaponOptions, option => option.phase);
    return {
      groupId,
      weaponIds: reachableRows.map(row => row.id),
      selectedWeaponId: selected.magicWeaponId,
      selectedWeaponName: selected.magicWeaponName,
      selectedPhase: selected.phase,
      roleLevelRequired: selected.roleLevelRequired,
      closeSoul: selected.closeSoul,
      soulLevelLimit: selected.soulLevelLimit,
      maxSoulLevel: selected.maxSoulLevel,
      weaponOptions,
      levels: selected.levels,
      maxFightPowerPoint: selected.maxFightPowerPoint,
    };
  }).filter(Boolean);
  if (!groups.length) {
    throw new Error(`magicWeapon 表没有 settings.js data.maxLevel=${configuredMaxLevel} 内可达的法宝组。`);
  }

  const maxLevel = Math.max(...groups.flatMap(group => group.levels.map(point => point.params.level)));
  const maxSoulLevel = Math.max(...groups.map(group => group.maxSoulLevel));
  const fullByLevelAndSoul = [];
  for (let level = 1; level <= maxLevel; level += 1) {
    for (let soulLevel = 1; soulLevel <= maxSoulLevel; soulLevel += 1) {
      const attrs = {};
      const selectedWeapons = [];
      const evidence = [];
      for (const group of groups) {
        const pointLevel = Math.min(level, Math.max(...group.levels.map(item => item.params.level)));
        const pointSoulLevel = group.maxSoulLevel > 0 ? Math.min(soulLevel, group.maxSoulLevel) : 0;
        const point = group.levels.find(item =>
          item.params.level === pointLevel && item.params.soulLevel === pointSoulLevel
        );
        if (!point) {
          throw new Error(`法宝组 ${group.groupId} 缺少 level=${pointLevel}, soulLevel=${pointSoulLevel} 的阶段点。`);
        }
        mergeAttrs(attrs, point.attrs, `magic.group.${group.groupId}`);
        selectedWeapons.push({
          groupId: group.groupId,
          magicWeaponId: point.params.magicWeaponId,
          magicWeaponName: point.params.magicWeaponName,
          phase: point.params.phase,
          level: point.params.level,
          growth: point.params.growth,
          soulLevel: point.params.soulLevel,
          maxSoulLevel: point.params.maxSoulLevel,
          soulLevelLimit: point.params.soulLevelLimit,
          closeSoul: point.params.closeSoul,
          roleLevelRequired: point.params.roleLevelRequired,
          baseFightPower: point.params.baseFightPower,
          baseAttrs: point.params.baseAttrs,
          soulFightPower: point.params.soulFightPower,
          soulAttrs: point.params.soulAttrs,
          fightPower: point.fightPower,
          attrs: point.attrs,
          selectedSouls: point.params.selectedSouls,
        });
        evidence.push(...point.evidence);
      }
      fullByLevelAndSoul.push(makePoint({
        moduleKey: 'magic',
        stageKey: `magic:all-groups:level=${level}:soul=${soulLevel}:max-growth:full-blessing`,
        label: `全部法宝组最高阶段 Lv.${level} / 器魂 Lv.${soulLevel} 满成长满祝福`,
        params: {
          level,
          soulLevel,
          groupCount: groups.length,
          selectedWeapons,
          rule: '同 groupId 只在可获取法宝候选内取最高阶段；基础属性按满成长、满祝福、指定等级计算；开放器魂的法宝三槽各取可镶嵌最高战力灵玉，并乘器魂等级。',
        },
        attrs,
        fightPower: calcFightPower(attrs, activeWeights),
        evidence,
      }));
    }
  }

  const fullByLevel = Array.from({ length: maxLevel }, (_, index) => {
    const level = index + 1;
    const point = fullByLevelAndSoul.find(item =>
      item.params.level === level && item.params.soulLevel === maxSoulLevel
    );
    if (!point) {
      throw new Error(`法宝全满曲线缺少 level=${level}, soulLevel=${maxSoulLevel} 的阶段点。`);
    }
    return point;
  });
  const closedSoulGroups = groups.filter(group => group.closeSoul);

  return {
    key: 'magic',
    label: '法宝与器魂',
    status: 'ready',
    formula: `基础属性 floor(0.5 + base + growth * blessingMultiplier * add * level)；祝福 1/3/4/5 分别放大攻击/魔法/生命/防御成长 50%；器魂太阳/太阴/混元三槽默认各取 slouLevelLimit 内最高战力灵玉，灵玉属性乘 soulData.lv，前端可按槽改选；当前版本先剔除无获取方式的二阶法宝，再按 showLimit 中角色等级 <= ${configuredMaxLevel} 过滤。`,
    stageDimensions: ['magicGroupId', 'magicWeaponLevel', 'magicSoulLevel'],
    configuredMaxLevel,
    soulCandidates: buildMagicSoulCandidates(soulRows, activeWeights),
    groups,
    skippedGroups,
    closedSoulGroups: closedSoulGroups.map(group => ({
      groupId: group.groupId,
      magicWeaponId: group.selectedWeaponId,
      magicWeaponName: group.selectedWeaponName,
    })),
    unobtainableWeapons: unobtainableRows.map(row => ({
      magicWeaponId: row.id,
      magicWeaponName: row.name,
      groupId: row.groupId,
      phase: row.phases,
      reason: '二阶法宝当前游戏内无获取方式',
    })),
    fullByLevelAndSoul,
    fullByLevel,
    maxFightPowerPoint: maxBy(fullByLevelAndSoul, point => point.fightPower),
    warnings: [
      ...(closedSoulGroups.length
        ? [`${closedSoulGroups.length} 个可达法宝组配置 closeSoul=1，运行时关闭器魂页，当前只计这些法宝的基础属性。`]
        : []),
      ...(skippedGroups.length
        ? [`已按 settings.js data.maxLevel=${configuredMaxLevel} 过滤 ${skippedGroups.length} 个未达等级上限的法宝组。`]
        : []),
      ...(unobtainableRows.length
        ? [`已剔除 ${unobtainableRows.length} 个 magicWeapon.phases=2 的二阶法宝候选；当前游戏内无获取方式，不纳入极限属性。`]
        : []),
    ],
  };
}

function resolveStageUnlockConditions(conditions, configuredMaxLevel, label) {
  if (!conditions) {
    return { unlocked: true, requiredLevel: 0, stageConditions: [] };
  }
  if (!Array.isArray(conditions)) {
    throw new Error(`${label} 解锁条件不是数组。`);
  }
  const stageConditions = [];
  let requiredLevel = 0;
  for (const condition of conditions) {
    if (
      !Array.isArray(condition) ||
      condition[0] !== 4 ||
      !Array.isArray(condition[1]) ||
      condition[1].length !== 1
    ) {
      throw new Error(`${label} 包含当前脚本未确认的解锁条件: ${JSON.stringify(condition)}`);
    }
    const stageId = finiteInteger(condition[1][0], `${label}.stageId`);
    const stageRow = findRowById('stage', stageId, 'unlockStage');
    const level = stageRow.lvOpen == null
      ? finiteInteger(stageRow.lv, `stage.${stageId}.lv`)
      : finiteInteger(stageRow.lvOpen, `stage.${stageId}.lvOpen`);
    requiredLevel = Math.max(requiredLevel, level);
    stageConditions.push({
      type: 4,
      stageId,
      stageName: stageRow.name,
      lv: stageRow.lv,
      lvOpen: stageRow.lvOpen,
      requiredLevel: level,
      unlocked: level <= configuredMaxLevel,
    });
  }
  return {
    unlocked: stageConditions.every(item => item.unlocked),
    requiredLevel,
    stageConditions,
  };
}

function getBreathingQualityEntries(row) {
  if (!Array.isArray(row.breakItemQuality) || row.breakItemQuality.length < 3) {
    throw new Error(`breathing.${row.id}.breakItemQuality 缺少品质倍率配置。`);
  }
  const qualities = row.breakItemQuality[0];
  const ratios = row.breakItemQuality[2];
  if (!Array.isArray(qualities) || !Array.isArray(ratios) || qualities.length !== ratios.length) {
    throw new Error(`breathing.${row.id}.breakItemQuality 品质和倍率数量不一致。`);
  }
  return qualities.map((quality, index) => ({
    quality: finiteInteger(quality, `breathing.${row.id}.quality.${index}`),
    ratio: finiteNumber(ratios[index], `breathing.${row.id}.qualityRatio.${index}`),
  }));
}

function buildBreathingAcupointIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    finiteInteger(row.breathingId, `breathingAcupoint.${row.id}.breathingId`);
    finiteInteger(row.type, `breathingAcupoint.${row.id}.type`);
    finiteInteger(row.level, `breathingAcupoint.${row.id}.level`);
    finiteNumber(row.attributeValue, `breathingAcupoint.${row.id}.attributeValue`);
    const key = `${row.breathingId}:${row.type}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
  }
  for (const rowsInGroup of index.values()) {
    rowsInGroup.sort((left, right) => left.level - right.level || left.id - right.id);
  }
  return index;
}

function getBreathingAcupointGroup(index, breathingId, type) {
  const rows = index.get(`${breathingId}:${type}`) || [];
  if (!rows.length) {
    throw new Error(`breathingAcupoint 缺少 breathingId=${breathingId}, type=${type} 的穴位等级。`);
  }
  const attributes = new Set(rows.map(row => row.attribute));
  if (attributes.size !== 1) {
    throw new Error(`breathingAcupoint breathingId=${breathingId}, type=${type} 混用了多个属性字段。`);
  }
  return {
    rows,
    attribute: rows[0].attribute,
    maxLevel: Math.max(...rows.map(row => row.level)),
  };
}

function buildBreathingCurves(activeWeights, configuredMaxLevel) {
  const sysUnlockRow = findRowById('sysUnlock', SYS_BREATHING_ID, 'sysUnlock');
  const sysUnlockInfo = resolveStageUnlockConditions(
    sysUnlockRow.limitType || [],
    configuredMaxLevel,
    `sysUnlock.${SYS_BREATHING_ID}`
  );
  if (!sysUnlockInfo.unlocked) {
    throw new Error(`奇穴系统在 ${configuredMaxLevel} 级未解锁，不能生成满配阶段。`);
  }

  const breathingRows = loadDataTable('breathing').sort((left, right) => left.id - right.id);
  const openRows = breathingRows.filter(row => row.close !== 1);
  if (!openRows.length) throw new Error('breathing 运行时内嵌表没有未关闭奇穴。');
  const acupointIndex = buildBreathingAcupointIndex(loadDataTable('breathingAcupoint'));
  const unlockedBreathings = openRows.map(row => {
    const unlockInfo = resolveStageUnlockConditions(
      row.unlock || [],
      configuredMaxLevel,
      `breathing.${row.id}.unlock`
    );
    return { row, unlockInfo };
  }).filter(item => item.unlockInfo.unlocked);
  if (!unlockedBreathings.length) {
    throw new Error(`breathing 表有未关闭奇穴，但没有 roleLevel <= ${configuredMaxLevel} 的可解锁项。`);
  }

  const qualityEntries = getBreathingQualityEntries(unlockedBreathings[0].row);
  const qualitySignature = JSON.stringify(qualityEntries);
  for (const item of unlockedBreathings.slice(1)) {
    if (JSON.stringify(getBreathingQualityEntries(item.row)) !== qualitySignature) {
      throw new Error('当前开放奇穴的品质倍率表不一致，需要先确认运行时是否允许不同奇穴不同品质满配。');
    }
  }

  const acupointGroups = [];
  for (const item of unlockedBreathings) {
    if (!Array.isArray(item.row.breathingAcupointType) || !item.row.breathingAcupointType.length) {
      throw new Error(`breathing.${item.row.id}.breathingAcupointType 缺少穴位类型。`);
    }
    for (const type of item.row.breathingAcupointType) {
      const group = getBreathingAcupointGroup(acupointIndex, item.row.id, type);
      acupointGroups.push({
        breathing: item.row,
        unlockInfo: item.unlockInfo,
        type,
        ...group,
      });
    }
  }

  const maxAcupointLevel = Math.max(...acupointGroups.map(group => group.maxLevel));
  const levels = Array.from({ length: maxAcupointLevel + 1 }, (_, index) => index);
  const allStageConditions = [
    ...sysUnlockInfo.stageConditions,
    ...unlockedBreathings.flatMap(item => item.unlockInfo.stageConditions),
  ];
  const uniqueStageConditions = Array.from(new Map(
    allStageConditions.map(item => [item.stageId, item])
  ).values()).sort((left, right) => left.stageId - right.stageId);

  const fullByQualityLevel = [];
  for (const qualityEntry of qualityEntries) {
    for (const level of levels) {
      const attrs = {};
      const selectedAcupoints = [];
      for (const group of acupointGroups) {
        const selectedLevel = Math.min(level, group.maxLevel);
        const baseValue = group.rows
          .filter(row => row.level <= selectedLevel)
          .reduce((sum, row) => sum + row.attributeValue, 0);
        const finalValue = baseValue + Math.floor(baseValue * qualityEntry.ratio);
        addAttr(attrs, group.attribute, finalValue, `breathing.${group.breathing.id}.${group.type}.${level}`);
        selectedAcupoints.push({
          breathingId: group.breathing.id,
          breathingName: group.breathing.name,
          type: group.type,
          attribute: group.attribute,
          requestedLevel: level,
          level: selectedLevel,
          maxLevel: group.maxLevel,
          quality: qualityEntry.quality,
          qualityRatio: qualityEntry.ratio,
          baseValue,
          finalValue,
          fightPower: Math.floor(finalValue * (activeWeights[group.attribute] || 0)),
          rowCount: group.rows.length,
          firstRowId: group.rows[0].id,
          lastRowId: group.rows[group.rows.length - 1].id,
        });
      }
      fullByQualityLevel.push(makePoint({
        moduleKey: 'breathing',
        stageKey: `breathing:quality=${qualityEntry.quality}:level=${level}`,
        label: `奇穴精纯 Lv.${level} / 品质 ${qualityEntry.quality}`,
        params: {
          roleLevel: configuredMaxLevel,
          level,
          quality: qualityEntry.quality,
          qualityRatio: qualityEntry.ratio,
          breathingCount: unlockedBreathings.length,
          acupointCount: acupointGroups.length,
          maxAcupointLevel,
          sysUnlock: {
            id: SYS_BREATHING_ID,
            name: sysUnlockRow.name,
            requiredLevel: sysUnlockInfo.requiredLevel,
            stageConditions: sysUnlockInfo.stageConditions,
          },
          unlockStageConditions: uniqueStageConditions,
          selectedAcupoints,
        },
        attrs,
        fightPower: calcFightPower(attrs, activeWeights),
        evidence: [
          { table: 'sysUnlock', id: SYS_BREATHING_ID, file: tableFileRef('sysUnlock') },
          ...uniqueStageConditions.map(stage => ({ table: 'stage', id: stage.stageId, name: stage.stageName, file: tableFileRef('stage') })),
          ...unlockedBreathings.map(item => ({ table: 'breathing', id: item.row.id, file: tableFileRef('breathing') })),
          { table: 'breathingAcupoint', file: tableFileRef('breathingAcupoint') },
        ],
      }));
    }
  }

  const maxFightPowerPoint = maxBy(fullByQualityLevel, point => point.fightPower);
  const skippedLocked = openRows.length - unlockedBreathings.length;
  return {
    key: 'breathing',
    label: '奇穴',
    status: 'ready',
    formula: `官方系统名为奇穴，运行时记录名为 breathing。每个穴位累计 breathingAcupoint 中 level <= 当前精纯等级的 attributeValue，再按品质倍率 final = base + floor(base * ratio) 得到属性；当前只取 sysUnlock.id=${SYS_BREATHING_ID} 和 breathing.unlock 中关卡解锁等级 <= ${configuredMaxLevel} 的未关闭奇穴。`,
    stageDimensions: ['breathingId', 'acupointType', 'level', 'quality'],
    configuredMaxLevel,
    sysUnlock: {
      id: SYS_BREATHING_ID,
      name: sysUnlockRow.name,
      requiredLevel: sysUnlockInfo.requiredLevel,
      stageConditions: sysUnlockInfo.stageConditions,
    },
    openBreathingCount: openRows.length,
    unlockedBreathingCount: unlockedBreathings.length,
    closedBreathingCount: breathingRows.length - openRows.length,
    acupointCount: acupointGroups.length,
    maxAcupointLevel,
    qualityEntries,
    breathings: unlockedBreathings.map(item => ({
      breathingId: item.row.id,
      breathingName: item.row.name,
      requiredLevel: item.unlockInfo.requiredLevel,
      stageConditions: item.unlockInfo.stageConditions,
      acupointTypes: item.row.breathingAcupointType,
    })),
    fullByQualityLevel,
    maxFightPowerPoint,
    sourceRules: [
      { label: '官方命名', detail: `sysUnlock.id=${SYS_BREATHING_ID} 名称为“${sysUnlockRow.name}”；运行时 SysId.breathing.name 也是“奇穴”，但存档字段和配置模块名仍为 breathing。` },
      { label: '表来源', detail: `breathing 与 breathingAcupoint 来自 ${tableFileRef('breathing')} / ${tableFileRef('breathingAcupoint')} 的 Browserify 内嵌配置。` },
      { label: '解锁条件', detail: uniqueStageConditions.map(stage => `${stage.stageName}(stage.id=${stage.stageId}, lvOpen=${stage.lvOpen ?? stage.lv})`).join('；') },
      { label: '等级属性', detail: '每个穴位按 breathingId + type 读取 breathingAcupoint，累计 level <= 当前精纯等级的 attributeValue。' },
      { label: '品质倍率', detail: '品质来自记录 quality；倍率读取 breathing.breakItemQuality[2]，最终属性为 base + floor(base * qualityRatio)。' },
      { label: '关闭项处理', detail: `当前 breathing 表 ${breathingRows.length} 行，未关闭 ${openRows.length} 行，关闭 ${breathingRows.length - openRows.length} 行；close=1 与运行时一致不计入。` },
    ],
    warnings: skippedLocked > 0
      ? [`${skippedLocked} 个未关闭奇穴因解锁等级超过 ${configuredMaxLevel} 未计入。`]
      : [],
  };
}

function buildBlockedExtremeModule(key, configuredMaxLevel) {
  const definition = MODULE_DEFS.find(module => module.key === key);
  const detail = BLOCKED_EXTREME_MODULE_DETAILS[key];
  if (!definition || !detail) {
    throw new Error(`缺少 blocked 极限模块定义: ${key}`);
  }
  const tables = definition.tables.map(tableName => loadTableStatus(tableName));
  const missingTables = tables.filter(table => !table.available).map(table => table.table);
  const warnings = [
    ...detail.blockers,
    ...missingTables.map(table => `缺少配置表: ${table}`),
  ];
  return {
    key,
    label: definition.label,
    status: detail.status,
    formula: detail.formula,
    stageDimensions: detail.stageDimensions,
    configuredMaxLevel,
    runtime: definition.runtime,
    tables,
    sourceRules: detail.sourceRules,
    blockers: detail.blockers,
    maxFightPowerPoint: null,
    warnings: Array.from(new Set(warnings)),
  };
}

function buildStageCurves(fightPowerInfo, settingsScope) {
  const activeWeights = fightPowerInfo.activeWeights;
  const configuredMaxLevel = settingsScope.maxLevel;
  const heartModule = buildHeartCurves(activeWeights, configuredMaxLevel);
  const equipmentModule = buildEquipmentCurves(activeWeights, configuredMaxLevel);
  const smeltModule = buildSmeltCurves(activeWeights, configuredMaxLevel);
  const featherModule = buildFeatherCurves(activeWeights, configuredMaxLevel);
  const neidanModule = buildNeidanCurves(activeWeights, configuredMaxLevel);
  const modules = [
    buildRoleBaseCurves(activeWeights, configuredMaxLevel),
    heartModule,
    equipmentModule,
    buildTitleCurves(activeWeights, configuredMaxLevel),
    buildFashionCurves(activeWeights, configuredMaxLevel),
    buildMagicCurves(activeWeights, configuredMaxLevel),
    buildWingCurves(activeWeights, configuredMaxLevel),
    featherModule,
    buildXianpoCurves(activeWeights, configuredMaxLevel, heartModule),
    buildMatrixCurves(activeWeights, configuredMaxLevel),
    buildStarcoreCurves(activeWeights, configuredMaxLevel),
    buildMeridiansCurves(activeWeights, configuredMaxLevel),
    neidanModule,
    smeltModule,
    buildBreathingCurves(activeWeights, configuredMaxLevel),
  ];
  attachSystemContributionRows(modules, activeWeights);
  const completedModuleKeys = modules.filter(module => module.status === 'ready').map(module => module.key);
  const partialModuleKeys = modules
    .filter(module => module.status !== 'ready' && !module.status.startsWith('blocked'))
    .map(module => module.key);
  return {
    powerAttribute: {
      id: fightPowerInfo.powerAttributeId,
      source: fightPowerInfo.source,
      activeWeights,
    },
    extractionScope: {
      status: 'partial_expanding_ready_modules',
      configuredMaxLevel,
      configurationSource: settingsScope.source,
      levelRule: `当前版本阶段只允许角色等级、玩家等级、世界等级或解锁等级 <= ${configuredMaxLevel}。`,
      completedModuleKeys,
      partialModuleKeys,
      blockedOrPendingModuleKeys: [],
      note: '本文件持续输出公式已确认的模块阶段曲线；奇穴已从 GameAnalysis/data/index.js 运行时内嵌配置接入，缺关键配置的后续模块仍会保留 blocked，不用空值或猜测值补齐。',
    },
    modules,
  };
}

function cloneCompact(value, dropKeys = new Set()) {
  if (Array.isArray(value)) return value.map(item => cloneCompact(item, dropKeys));
  if (!value || typeof value !== 'object') return value;
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    if (dropKeys.has(key)) continue;
    next[key] = cloneCompact(entry, dropKeys);
  }
  return next;
}

function compactStagePoint(point, module, extraDropKeys = []) {
  if (!point) return point;
  const compact = cloneCompact(point, new Set(extraDropKeys));
  if (module?.key === 'equipment') {
    compact.params = {
      ...(compact.params || {}),
      stoneInfo: module.stoneInfo,
    };
  }
  return compact;
}

function compactMagicGroups(groups) {
  return (groups || []).map(group => ({
    groupId: group.groupId,
    weaponIds: group.weaponIds,
    selectedWeaponId: group.selectedWeaponId,
    selectedWeaponName: group.selectedWeaponName,
    selectedPhase: group.selectedPhase,
    roleLevelRequired: group.roleLevelRequired,
    closeSoul: group.closeSoul,
    soulLevelLimit: group.soulLevelLimit,
    maxSoulLevel: group.maxSoulLevel,
    maxFightPowerPoint: group.maxFightPowerPoint,
    weaponOptions: (group.weaponOptions || []).map(weapon => ({
      groupId: weapon.groupId,
      magicWeaponId: weapon.magicWeaponId,
      magicWeaponName: weapon.magicWeaponName,
      phase: weapon.phase,
      roleLevelRequired: weapon.roleLevelRequired,
      closeSoul: weapon.closeSoul,
      soulLevelLimit: weapon.soulLevelLimit,
      maxSoulLevel: weapon.maxSoulLevel,
      maxFightPowerPoint: weapon.maxFightPowerPoint,
    })),
  }));
}

function compactRoleExtremeModule(module) {
  const base = {
    key: module.key,
    label: module.label,
    status: module.status,
    formula: module.formula,
    stageDimensions: module.stageDimensions,
    configuredMaxLevel: module.configuredMaxLevel,
    runtime: module.runtime,
    tables: module.tables,
    sourceRules: module.sourceRules,
    blockers: module.blockers,
    warnings: module.warnings,
    maxFightPowerPoint: compactStagePoint(
      module.maxFightPowerPoint,
      module,
      module.key === 'equipment' ? ['candidateOptions', 'stoneCandidateOptions'] : []
    ),
  };

  if (module.candidateStats) base.candidateStats = module.candidateStats;
  if (module.skippedNoAttribute) base.skippedNoAttribute = module.skippedNoAttribute;
  if (module.selectionPools) base.selectionPools = module.selectionPools;
  if (module.soulCandidates) base.soulCandidates = module.soulCandidates;
  if (module.suitOptions) base.suitOptions = module.suitOptions;
  if (module.stoneInfo) base.stoneInfo = module.stoneInfo;
  if (module.qualityVariants) base.qualityVariants = module.qualityVariants;

  if (module.key === 'role_base') {
    base.rows = (module.rows || []).map(role => ({
      heroId: role.heroId,
      heroName: role.heroName,
      point: compactStagePoint(role.maxFightPowerPoint, module),
    }));
  } else if (module.key === 'heart') {
    base.attributeCurves = module.attributeCurves;
  } else if (module.key === 'equipment') {
    base.roles = (module.roles || []).map(role => ({
      heroId: role.heroId,
      heroName: role.heroName,
      point: compactStagePoint(role.point, module, [
        'candidateOptions',
        'stoneCandidateOptions',
      ]),
    }));
  } else if (module.key === 'magic') {
    base.groups = compactMagicGroups(module.groups);
    base.closedSoulGroups = module.closedSoulGroups;
  } else if (module.key === 'wing') {
    base.wings = (module.wings || []).map(wing => ({
      wingId: wing.wingId,
      wingName: wing.wingName,
      maxFightPowerPoint: wing.maxFightPowerPoint,
    }));
  } else if (module.key === 'fashion') {
    base.parts = module.parts;
  } else if (module.key === 'matrix') {
    base.coreGroups = module.coreGroups;
    base.suitOptions = module.suitOptions;
  } else if (module.key === 'starcore') {
    base.stars = module.stars;
  } else if (module.key === 'neidan') {
    base.danqiOptions = module.danqiOptions;
    base.candidateDanqiCount = module.candidateDanqiCount;
  } else if (module.key === 'smelt') {
    base.partOptions = module.partOptions;
  } else if (module.key === 'breathing') {
    base.breathings = module.breathings;
    base.qualityEntries = module.qualityEntries;
    base.unlockedBreathingCount = module.unlockedBreathingCount;
    base.acupointCount = module.acupointCount;
    base.sysUnlock = module.sysUnlock;
  }

  return Object.fromEntries(Object.entries(base).filter(([, value]) => value !== undefined));
}

function compactRoleExtremeStageCurves(stageCurves) {
  return {
    ...stageCurves,
    modules: stageCurves.modules.map(compactRoleExtremeModule),
  };
}

function extract() {
  console.log('\n📦 角色 → 极限属性 source map');

  const warnings = [];
  const settingsScope = loadConfiguredMaxLevel();
  const tableNames = new Set([
    'powerAttribute',
    ...MODULE_DEFS.flatMap(module => module.tables),
  ]);
  const tableStatusByName = {};
  for (const tableName of tableNames) {
    tableStatusByName[tableName] = loadTableStatus(tableName);
  }

  const runtime = runtimeEvidence();
  warnings.push(...runtime.warnings);

  const fightPower = buildFightPowerInfo(tableStatusByName, warnings);

  const modules = MODULE_DEFS.map(module => {
    const tables = module.tables.map(table => tableStatusByName[table]);
    const missingTables = tables.filter(table => !table.available).map(table => table.table);
    const missingRuntime = module.runtime.filter(marker => !runtime.markers[marker]?.found);
    const moduleWarnings = [];

    if (missingTables.length > 0) {
      moduleWarnings.push(`缺少配置表: ${missingTables.join(', ')}`);
    }
    if (missingRuntime.length > 0) {
      moduleWarnings.push(`缺少运行时入口: ${missingRuntime.join(', ')}`);
    }
    if (module.requiresGenerationTrace) {
      moduleWarnings.push('运行时读取存档内最终属性，极限候选池还需要继续追生成/洗练链路。');
    }

    return {
      key: module.key,
      label: module.label,
      status: moduleWarnings.length > 0 ? 'needs_trace_or_data' : 'source_mapped',
      runtime: module.runtime.map(marker => ({
        marker,
        ...runtime.markers[marker],
      })),
      tables,
      note: module.note,
      requiredForCompleteCharacterTotal: module.requiredForCompleteCharacterTotal === true,
      separateFromWeightedAttributes: module.separateFromWeightedAttributes === true,
      warnings: moduleWarnings,
    };
  });

  for (const module of modules) {
    warnings.push(...module.warnings.map(warning => `${module.label}: ${warning}`));
  }

  const data = {
    configuredMaxLevel: settingsScope.maxLevel,
    configurationSource: settingsScope.source,
    runtimeSource: runtime.source,
    runtimeAvailable: runtime.available,
    fightPower,
    playerAttributeOrder: {
      source: '攻略帖《极限战力与极限属性》玩家口径；仅用于同收益候选排序，不替代 powerAttribute 权重。',
      fields: PLAYER_ATTRIBUTE_ORDER,
    },
    modes: [
      {
        key: 'restoreCharacterTotal',
        label: '角色总属性还原',
        rule: '严格按 UserInfoManager.calUserInfo 的模块顺序合并属性。',
      },
      {
        key: 'maxFightPower',
        label: '极限战力方案',
        rule: '用 powerAttribute[1] 计算候选战力，不硬编码权重。',
      },
      {
        key: 'singleAttribute',
        label: '单项极限属性方案',
        rule: '逐目标属性独立优化，不等同于最高战力方案。',
      },
    ],
    modules,
    warnings: Array.from(new Set(warnings)),
  };

  u.saveOutput('role_extreme_stats_source_map', data, {
    system: '角色 → 极限属性模块 source map',
    source: 'GameAnalysis/data/index.js + dataApi/*.json',
    configuredMaxLevel: settingsScope.maxLevel,
    warningCount: data.warnings.length,
    completeCharacterTotalBlocked: modules.some(module =>
      module.requiredForCompleteCharacterTotal && module.warnings.length > 0
    ),
  });

  const stageCurves = compactRoleExtremeStageCurves(buildStageCurves(fightPower, settingsScope));
  u.saveOutput('role_extreme_stats_stage_curves', stageCurves, {
    system: '角色 → 极限属性模块 → 阶段曲线',
    source: 'GameAnalysis/data/index.js runtime formulas + dataApi/*.json',
    configuredMaxLevel: settingsScope.maxLevel,
    status: stageCurves.extractionScope.status,
    completedModuleCount: stageCurves.extractionScope.completedModuleKeys.length,
    completedModuleKeys: stageCurves.extractionScope.completedModuleKeys,
  });
}

if (require.main === module) extract();
module.exports = extract;
