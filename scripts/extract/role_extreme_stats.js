/**
 * 角色 → 极限属性模块 source map
 *
 * 第一阶段先做证据盘点和战力权重确认。
 * 第二阶段逐步输出已严格确认公式的模块阶段曲线。
 * 缺少关键配置时输出 warning，避免用空值或默认值冒充真实数据。
 */
const fs = require('fs');
const path = require('path');
const u = require('../lib/utils');

const RUNTIME_CONFIRMED_POWER_ATTRIBUTE_ID = 1;
const GAME_RUNTIME_INDEX = process.env.GAME_ANALYSIS_INDEX || 'D:\\zmws\\GameAnalysis\\data\\index.js';
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
    tables: ['equip', 'equipUpgradeValue', 'stone', 'equipSuitAttribute'],
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
    tables: ['feather', 'featherAttribute'],
    note: '运行时读取 hero.feathers[*].attr，候选洗练逻辑需要继续追配置链。',
    requiresGenerationTrace: true,
  },
  {
    key: 'xianpo',
    label: '仙魄/炼体',
    runtime: ['UserInfoManager.calAttribute_xianpo'],
    tables: ['xianpo'],
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
    tables: ['meridians', 'meridiansAttribute', 'meridiansSpecialPill'],
    note: '累计每阶已开放属性，再按 inlayPill 属性加成放大。',
    requiresGenerationTrace: true,
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
    label: '吐纳',
    runtime: ['UserInfoManager.calBreathingPower'],
    tables: ['breathing', 'breathingAcupoint'],
    note: '运行时代码已计入角色属性，但当前数据表可能未同步到 deployable-app。',
    requiredForCompleteCharacterTotal: true,
  },
  {
    key: 'fix_power',
    label: '固定战力修正',
    runtime: ['UserInfoManager.calFightPower_fixPoint', 'UserInfoManager.calAttribute_equipment2'],
    tables: ['role', 'equip', 'equipUpgradeValue'],
    note: '属性面板修正值，只按非首饰装备战力映射 role.firePoint。',
    separateFromWeightedAttributes: true,
  },
];

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

  const text = fs.readFileSync(GAME_RUNTIME_INDEX, 'utf8');
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
    const file = u.findTableFile(tableName);
    const rows = u.loadTable(tableName);
    return {
      table: tableName,
      available: true,
      file: path.relative(u.ROOT, file).replace(/\\/g, '/'),
      rows: Array.isArray(rows) ? rows.length : null,
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

  const rows = u.loadTable('powerAttribute');
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
  return path.relative(u.ROOT, u.findTableFile(tableName)).replace(/\\/g, '/');
}

function finiteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} 不是有效数字: ${value}`);
  }
  return value;
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

function maxBy(items, getValue) {
  if (!items.length) return null;
  return items.reduce((best, item) => (getValue(item) > getValue(best) ? item : best), items[0]);
}

function collectActiveRoles() {
  const roleRows = u.loadTable('role');
  const monsterById = new Map(u.loadTable('monster').map(row => [row.id, row]));
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

function buildRoleBaseCurves(activeWeights) {
  const expRows = u.loadTable('exp').sort((left, right) => left.level - right.level);
  const activeFields = Object.keys(activeWeights);
  const roles = collectActiveRoles().map(({ role, monster }) => {
    const levels = expRows.map(expRow => {
      const attrs = roundAttrs(calcRoleBaseAttrs(monster, expRow, activeFields));
      const fightPower = calcFightPower(attrs, activeWeights);
      return makePoint({
        moduleKey: 'role_base',
        stageKey: `role_base:hero=${role.id}:level=${expRow.level}`,
        label: `${role.name} Lv.${expRow.level}`,
        params: { heroId: role.id, heroName: role.name, monsterId: monster.id, roleLevel: expRow.level },
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
    formula: 'attr[field] = monster[heroId][field] * exp[level][field]；抗性来自 monster.resist。',
    stageDimensions: ['heroId', 'roleLevel'],
    rows: roles,
    maxFightPowerPoint: maxBy(roles.flatMap(role => role.levels), point => point.fightPower),
  };
}

function buildHeartCurves(activeWeights) {
  const heartRows = u.loadTable('heart').sort((left, right) => left.level - right.level);
  const firstRow = heartRows[0];
  if (!firstRow) throw new Error('heart 表没有有效行。');
  const fields = Object.keys(activeWeights).filter(field =>
    Object.prototype.hasOwnProperty.call(firstRow, field)
  );
  const levels = heartRows.map(row => {
    const attrs = {};
    for (const field of fields) {
      addAttr(attrs, field, row[field], `heart.${row.level}.${field}`);
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
    formula: '每条心法按 heart[level][属性] 提供属性；全满阶段按六条心法同等级汇总。',
    stageDimensions: ['heartLevel', 'heartLine'],
    fields,
    maxFightPowerPoint: maxBy(levels, point => point.fightPower),
    levels,
    attributeCurves,
  };
}

function calcWingAttrs(row) {
  const attrs = {};
  addAttrList(attrs, row.attribute || [], row.attributeValue || [], `wingAttribute.${row.id}`);
  return attrs;
}

function buildWingCurves(activeWeights) {
  const wingRows = u.loadTable('wing').sort((left, right) => left.id - right.id);
  const wingAttrRows = u.loadTable('wingAttribute').sort((left, right) =>
    left.buteId - right.buteId || left.wingLevel - right.wingLevel
  );
  const wingNameByButeId = new Map(wingRows.map(row => [row.buteId, row.name]));
  const attrsByButeIdLevel = new Map();
  for (const row of wingAttrRows) {
    attrsByButeIdLevel.set(`${row.buteId}:${row.wingLevel}`, row);
  }

  const wings = wingRows.map(wing => {
    const rows = wingAttrRows.filter(row => row.buteId === wing.buteId);
    if (!rows.length) {
      throw new Error(`翅膀 ${wing.id} ${wing.name} 缺少 wingAttribute(buteId=${wing.buteId})。`);
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
          roleLevelRequired: extractRoleLevelRequired(row.upLimit),
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
    for (const wing of wingRows) {
      const row = attrsByButeIdLevel.get(`${wing.buteId}:${level}`);
      if (!row) {
        throw new Error(`翅膀全满阶段 Lv.${level} 缺少 ${wing.name} 的 wingAttribute。`);
      }
      mergeAttrs(attrs, calcWingAttrs(row), `wing.${wing.id}.level.${level}`);
      evidence.push({ table: 'wingAttribute', id: row.id, wingId: wing.id, wingName: wing.name, file: tableFileRef('wingAttribute') });
    }
    return makePoint({
      moduleKey: 'wing',
      stageKey: `wing:all-active-wings:level=${level}`,
      label: `全部翅膀 Lv.${level}`,
      params: {
        wingLevel: level,
        wingCount: wingRows.length,
        wingNames: wingRows.map(wing => wingNameByButeId.get(wing.buteId)),
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
    formula: 'wing.buteId + wingLevel -> wingAttribute.attribute/attributeValue；全翅膀阶段为当前有效 wing 表全部翅膀同等级汇总。',
    stageDimensions: ['wingId', 'wingLevel'],
    wings,
    allWingsByLevel,
    maxFightPowerPoint: maxBy(allWingsByLevel, point => point.fightPower),
  };
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

function buildXianpoCurves(activeWeights) {
  const rows = u.loadTable('xianpo').sort((left, right) =>
    left.type - right.type || left.xianpoId - right.xianpoId || left.level - right.level
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
  const fullByQualityLevel = [...byQualityLevel.entries()].map(([key, items]) => {
    if (items.length !== typeCount) return null;
    const [qualityRaw, levelRaw] = key.split(':');
    const quality = Number(qualityRaw);
    const level = Number(levelRaw);
    const attrs = {};
    const evidence = [];
    let roleLevelRequired = 0;
    for (const item of items) {
      mergeAttrs(attrs, item.point.attrs, `xianpo.type.${item.row.type}`);
      roleLevelRequired = Math.max(roleLevelRequired, item.row.roleLevel || 0);
      evidence.push({ table: 'xianpo', id: item.row.id, type: item.row.type, file: tableFileRef('xianpo') });
    }
    return makePoint({
      moduleKey: 'xianpo',
      stageKey: `xianpo:all-types:quality=${quality}:level=${level}`,
      label: `全部仙魄 ${qualityNames.get(quality)} Lv.${level}`,
      params: { quality, qualityName: qualityNames.get(quality), level, typeCount, roleLevelRequired },
      attrs,
      fightPower: calcFightPower(attrs, activeWeights),
      evidence,
    });
  }).filter(Boolean).sort((left, right) =>
    left.params.quality - right.params.quality || left.params.level - right.params.level
  );

  return {
    key: 'xianpo',
    label: '仙魄/炼体',
    status: 'ready',
    formula: 'xianpoId + level -> xianpo.attribute/attributeValue；全满阶段为同品质同等级下所有 type 汇总。',
    stageDimensions: ['type', 'quality', 'level'],
    types,
    fullByQualityLevel,
    maxFightPowerPoint: maxBy(fullByQualityLevel, point => point.fightPower),
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

function buildStarcoreCurves(activeWeights) {
  const starRows = u.loadTable('starCore').sort((left, right) => left.id - right.id);
  const expWorldRows = u.loadTable('expWorld').sort((left, right) => left.levelWorld - right.levelWorld);
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
    for (const star of starRows) {
      const qualities = Object.keys(star.starCore || {}).map(Number);
      const maxQuality = Math.max(...qualities);
      mergeAttrs(attrs, calcStarMainAttrs(star, maxQuality, expWorldRow), `starCore.${star.id}.main`);
      mergeAttrs(attrs, calcStarSatelliteAttrs(star, star.satelliteLv, expWorldRow), `starCore.${star.id}.satellite`);
      evidence.push({ table: 'starCore', id: star.id, quality: maxQuality, satelliteLevel: star.satelliteLv, file: tableFileRef('starCore') });
    }
    return makePoint({
      moduleKey: 'starcore',
      stageKey: `starcore:all-stars:max-quality:max-satellite:world=${expWorldRow.levelWorld}`,
      label: `全部星核满配 世界等级 ${expWorldRow.levelWorld}`,
      params: {
        worldLevel: expWorldRow.levelWorld,
        starCount: starRows.length,
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
    formula: '主星 round(expWorld[field] * qualityRatio)；伴星 round(expWorld[field] * satelliteRatio * min(satelliteLv / maxSatelliteLv, 1))。',
    stageDimensions: ['starCoreId', 'quality', 'satelliteLevel', 'worldLevel'],
    note: '明细保留品质、伴星比例和公式；任意单星阶段可由这些配置与 expWorld 精确计算。fullByWorldLevel 给出全星核满配随世界等级曲线。',
    stars,
    fullByWorldLevel,
    maxFightPowerPoint: maxBy(fullByWorldLevel, point => point.fightPower),
  };
}

function buildStageCurves(fightPowerInfo) {
  const activeWeights = fightPowerInfo.activeWeights;
  const modules = [
    buildRoleBaseCurves(activeWeights),
    buildHeartCurves(activeWeights),
    buildWingCurves(activeWeights),
    buildXianpoCurves(activeWeights),
    buildStarcoreCurves(activeWeights),
  ];
  return {
    powerAttribute: {
      id: fightPowerInfo.powerAttributeId,
      source: fightPowerInfo.source,
      activeWeights,
    },
    extractionScope: {
      status: 'partial_first_ready_modules',
      completedModuleKeys: modules.map(module => module.key),
      blockedOrPendingModuleKeys: [
        'equipment',
        'fashion',
        'neidan',
        'title',
        'magic',
        'feather',
        'matrix',
        'meridians',
        'smelt',
        'breathing',
        'fix_power',
      ],
      note: '本文件先输出公式已确认且无需随机生成链的第一批模块阶段曲线；后续模块逐个补齐。',
    },
    modules,
  };
}

function extract() {
  console.log('\n📦 角色 → 极限属性 source map');

  const warnings = [];
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
    warningCount: data.warnings.length,
    completeCharacterTotalBlocked: modules.some(module =>
      module.requiredForCompleteCharacterTotal && module.warnings.length > 0
    ),
  });

  const stageCurves = buildStageCurves(fightPower);
  u.saveOutput('role_extreme_stats_stage_curves', stageCurves, {
    system: '角色 → 极限属性模块 → 阶段曲线',
    source: 'GameAnalysis/data/index.js runtime formulas + dataApi/*.json',
    status: stageCurves.extractionScope.status,
    completedModuleCount: stageCurves.modules.length,
    completedModuleKeys: stageCurves.extractionScope.completedModuleKeys,
  });
}

if (require.main === module) extract();
module.exports = extract;
