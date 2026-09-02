const u = require('../../lib/utils');
const { DANYUAN_QUALITY_NAMES } = require('./constants');
const { requireDanyuanOverride } = require('./overrides');
const {
  applyFamilyGrowthEffectValues,
  buildDanyuanEffectValues,
  isDanyuanPlaceholderLevel,
  normalizeDanyuanName,
  normalizeLimit,
  summarizeBeskill
} = require('./mechanics');

const DANYUAN_SKILL_COLOR_QUALITY = {
  '绿': 2,
  '蓝': 3,
  '紫': 4,
  '橙': 5,
  '红': 6
};

function parseDanyuanSkillColor(row, ctx) {
  const skillIds = Array.isArray(row.skillId) ? row.skillId : [];
  for (const id of skillIds) {
    const be = ctx.beskillById.get(id);
    const match = String(be?.name || '').match(/[\-（(](绿|蓝|紫|橙|红)[）)]?$/);
    if (match) return match[1];
  }
  return null;
}

function shouldSkipUnsupportedDanyuanQuality(row, quality, ctx, warnings) {
  const color = parseDanyuanSkillColor(row, ctx);
  if (!color) return false;
  const expectedQuality = DANYUAN_SKILL_COLOR_QUALITY[color];
  if (expectedQuality === quality) return false;

  warnings.push({
    code: 'DANYUAN_SKILL_COLOR_QUALITY_SKIPPED',
    detail: `${normalizeDanyuanName(row.name)} Lv.${row.level} id=${row.id} 使用技能颜色${color}，当前丹元效果页只导出蓝/紫/橙/红四档，已跳过该行`
  });
  return true;
}

function ensureDanyuanFamily(families, row) {
  const familyId = Math.floor(row.displayType / 10);
  if (!familyId) {
    throw new Error(`丹元 displayType 无法解析: id=${row.id}, displayType=${row.displayType}`);
  }

  if (!families.has(familyId)) {
    families.set(familyId, {
      familyId,
      displayType: row.displayType,
      name: normalizeDanyuanName(row.name),
      group: row.group,
      innerType: null,
      innerTypeName: null,
      qualities: new Set(),
      skillIds: new Set(),
      comboSkills: new Set(),
      levels: new Map(),
      warnings: []
    });
  }
  return families.get(familyId);
}

function addDanyuanLevelRow(family, row, quality, ctx) {
  family.qualities.add(quality);
  if (Array.isArray(row.skillId)) row.skillId.forEach((id) => family.skillIds.add(id));
  if (Array.isArray(row.comboSkill)) row.comboSkill.forEach((id) => family.comboSkills.add(id));

  const limit = normalizeLimit(row.limit);
  if (limit?.innerType && !family.innerType) {
    family.innerType = limit.innerType;
    family.innerTypeName = limit.innerTypeName;
  }
  if (limit?.invalid) {
    family.warnings.push({
      code: 'DANYUAN_INVALID_LIMIT',
      detail: `${family.name} Lv.${row.level} 品质${quality} 的 limit 不是标准数组，原值已保留`
    });
  }

  if (!family.levels.has(row.level)) {
    family.levels.set(row.level, { level: row.level, qualities: {} });
  }
  const levelNode = family.levels.get(row.level);
  if (levelNode.qualities[String(quality)]) {
    throw new Error(`丹元效果重复等级: ${family.name} Lv.${row.level} 品质${quality}`);
  }

  const rowCtx = { ...ctx, familyId: family.familyId, danyuanLevel: row.level };
  const skillIds = Array.isArray(row.skillId) ? row.skillId : [];
  const mechanics = skillIds.map((id) => {
    const be = ctx.beskillById.get(id);
    if (!be) throw new Error(`丹元 ${family.name} Lv.${row.level} 引用的 beskill 不存在: ${id}`);
    return summarizeBeskill(be, rowCtx, family.warnings, `${family.name} Lv.${row.level} 品质${quality}`);
  });

  const effectValueCandidates = buildDanyuanEffectValues(row.skillDesc, mechanics, rowCtx, family.warnings, `${family.name} Lv.${row.level} 品质${quality}`);

  levelNode.qualities[String(quality)] = {
    id: row.id,
    type: row.type,
    quality,
    qualityName: DANYUAN_QUALITY_NAMES[quality],
    name: row.name,
    skillDesc: row.skillDesc,
    _effectValueCandidates: effectValueCandidates,
    limit,
    levelUpNeed: row.levelUpNeed ?? null,
    provideExp: row.provideExp ?? null,
    decompose: row.decompose ?? null,
    upQualityCost: u.parseCost(row.upQualityCost),
    nextQualityID: row.nextQualityID ?? null,
    isClose: row.isClose ?? null,
    skillIds,
    comboSkill: Array.isArray(row.comboSkill) ? row.comboSkill : [],
    mechanics
  };
}

function buildRawDanyuanFamilies(raw, ctx, warnings) {
  const families = new Map();

  for (const row of raw.filter((item) => item.type > 1)) {
    const quality = row.type % 10;
    if (!DANYUAN_QUALITY_NAMES[quality]) {
      throw new Error(`未知丹元品质: id=${row.id}, type=${row.type}`);
    }

    if (shouldSkipUnsupportedDanyuanQuality(row, quality, ctx, warnings)) {
      continue;
    }

    if (isDanyuanPlaceholderLevel(row)) {
      warnings.push({
        code: 'DANYUAN_PLACEHOLDER_LEVEL_SKIPPED',
        detail: `${normalizeDanyuanName(row.name)} Lv.${row.level} 品质${quality} 缺少升级/吞噬/分解与有效限制数据，已跳过占位等级`
      });
      continue;
    }

    const family = ensureDanyuanFamily(families, row);
    addDanyuanLevelRow(family, row, quality, ctx);
  }

  return families;
}

function buildLevelValueColumns(levels) {
  const columnsByKey = new Map();
  for (const level of levels) {
    for (const payload of Object.values(level.qualities)) {
      for (const value of payload?.effectValues || []) {
        const key = value.label;
        if (!columnsByKey.has(key)) {
          columnsByKey.set(key, {
            key,
            label: value.label
          });
        }
      }
    }
  }
  return [...columnsByKey.values()];
}

const REQUIRED_LEVEL_VALUE_COLUMNS_BY_FAMILY = {
  26: ['韧性弱化 · 韧性下降', '闪避弱化 · 闪避下降'],
  31: ['狂暴 · 攻击提升', '防御降低 · 防御值']
};

function validateRequiredLevelValues(family, levels) {
  const requiredLabels = REQUIRED_LEVEL_VALUE_COLUMNS_BY_FAMILY[family.familyId];
  if (!requiredLabels) return;

  for (const level of levels) {
    for (const [quality, payload] of Object.entries(level.qualities)) {
      for (const label of requiredLabels) {
        const value = (payload?.effectValues || []).find((item) => item.label === label);
        if (!value) {
          throw new Error(`丹元效果 ${family.name} Lv.${level.level} 品质${quality} 缺少等级成长项: ${label}`);
        }
        if (!/^-?\d+(?:\.\d+)?%\s*\+\s*-?\d+(?:\.\d+)?$/.test(String(value.value))) {
          throw new Error(`丹元效果 ${family.name} Lv.${level.level} 品质${quality} ${label} 不是“百分比 + 固定值”格式: ${value.value}`);
        }
      }
    }
  }
}

function exportSingleDanyuanFamily(family, override, usedOverrideKeys) {
  usedOverrideKeys.add(String(family.familyId));
  const levels = [...family.levels.values()].sort((a, b) => a.level - b.level);
  const levelsWithGrowthValues = applyFamilyGrowthEffectValues(levels, family.familyId);
  validateRequiredLevelValues(family, levelsWithGrowthValues);
  const sampleDescriptions = [...new Set(levels.flatMap((level) => (
    Object.values(level.qualities).map((quality) => quality.skillDesc).filter(Boolean)
  )))].slice(0, 8);

  return {
    familyId: family.familyId,
    displayType: family.displayType,
    name: override.name || family.name,
    sourceName: family.name,
    group: family.group,
    innerType: family.innerType,
    innerTypeName: family.innerTypeName,
    tags: Array.isArray(override.tags) ? override.tags : [],
    summary: override.summary,
    detail: override.detail,
    clarification: override.clarification,
    levelGrowth: override.levelGrowth,
    qualityGrowth: override.qualityGrowth,
    qualityDifference: override.qualityDifference,
    focus: Array.isArray(override.focus) ? override.focus : [],
    qualityTable: override.qualityTable || null,
    customNote: override.note || null,
    qualities: [...family.qualities].sort((a, b) => a - b).map((quality) => ({
      quality,
      name: DANYUAN_QUALITY_NAMES[quality]
    })),
    maxLevel: levels.at(-1)?.level ?? null,
    skillIds: [...family.skillIds].sort((a, b) => a - b),
    comboSkills: [...family.comboSkills].sort((a, b) => a - b),
    sampleDescriptions,
    levelValueColumns: buildLevelValueColumns(levelsWithGrowthValues),
    levels: levelsWithGrowthValues,
    warnings: family.warnings
  };
}

function exportDanyuanFamilies(raw, ctx, overrides, warnings) {
  const families = buildRawDanyuanFamilies(raw, ctx, warnings);
  const usedOverrideKeys = new Set();
  const resultFamilies = [...families.values()]
    .sort((a, b) => a.familyId - b.familyId)
    .map((family) => exportSingleDanyuanFamily(
      family,
      requireDanyuanOverride(overrides, family.familyId, family.name),
      usedOverrideKeys
    ));

  return { families: resultFamilies, usedOverrideKeys };
}

module.exports = {
  exportDanyuanFamilies,
  exportSingleDanyuanFamily
};
