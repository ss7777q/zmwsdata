const { DEFAULT_SETTINGS, loadAppSettings } = require('../../server/app-config');

function getConfiguredMaxLevel() {
  const settings = loadAppSettings();
  const value = Number(settings.data?.maxLevel);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid settings.data.maxLevel: ${settings.data?.maxLevel}`);
  }
  return value;
}

function collectLevelHints(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return [];

  const hints = [];
  const directKeys = [
    'roleLevelRequired',
    'roleLevel',
    'levelRequired',
    'needLevel',
    'openLevel',
    'upLevelLimits',
    'maxLevelRequired',
    'levelRequirement',
    'level',
    'lv',
    'wingLevel',
  ];

  for (const key of directKeys) {
    const value = node[key];
    if (typeof value === 'number' && Number.isFinite(value)) hints.push(value);
  }

  const upLimit = node.upLimit;
  if (Array.isArray(upLimit)) {
    if (upLimit.length === 2 && upLimit.every((value) => typeof value === 'number' && Number.isFinite(value))) {
      hints.push(upLimit[1]);
    }
    for (const entry of upLimit) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      if (Number(entry.type) !== 1 || !Array.isArray(entry.values)) continue;
      for (const value of entry.values) {
        if (typeof value === 'number' && Number.isFinite(value)) hints.push(value);
      }
    }
  }

  return hints;
}

function shouldDropByMaxLevel(node, maxLevel) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;

  if (typeof node.levelStart === 'number' && Number.isFinite(node.levelStart)) {
    return node.levelStart > maxLevel;
  }

  return collectLevelHints(node).some((value) => value > maxLevel);
}

function applyMaxLevel(value, maxLevel) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => applyMaxLevel(entry, maxLevel))
      .filter((entry) => entry !== undefined);
  }

  if (!value || typeof value !== 'object') return value;
  if (shouldDropByMaxLevel(value, maxLevel)) return undefined;

  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    const filteredEntry = applyMaxLevel(entry, maxLevel);
    if (filteredEntry !== undefined) next[key] = filteredEntry;
  }

  if (Array.isArray(value.levels) && Array.isArray(next.levels) && next.levels.length === 0) {
    return undefined;
  }

  if (
    typeof next.levelStart === 'number' &&
    Number.isFinite(next.levelStart) &&
    typeof next.levelEnd === 'number' &&
    Number.isFinite(next.levelEnd) &&
    next.levelEnd > maxLevel
  ) {
    next.levelEnd = maxLevel;
  }

  return next;
}

function trimFashionBallByReachableRank(data, maxLevel) {
  if (!Array.isArray(data)) return data;

  const groups = [...data].sort((left, right) => Number(left.rank) - Number(right.rank));
  const trimmed = [];

  for (const group of groups) {
    if (!group || !Array.isArray(group.levels)) continue;

    const hasBlockedLevel = group.levels.some((level) => shouldDropByMaxLevel(level, maxLevel));
    if (hasBlockedLevel) break;

    trimmed.push(group);
  }

  return trimmed;
}

function toFiniteInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function pickBossDefaultLevel(availableLevels, preferredLevel) {
  if (!Array.isArray(availableLevels) || availableLevels.length === 0) return null;
  let selected = availableLevels[0];
  for (const level of availableLevels) {
    if (level > preferredLevel) break;
    selected = level;
  }
  return selected;
}

function recalculateBossCalculatedProps(boss, level, template) {
  const coefficients = boss?.calcFormula?.coefficients;
  if (!coefficients || !template || typeof template !== 'object') return boss;

  const calculatedProps = { ...(boss.calculatedProps || {}) };
  for (const [key, formula] of Object.entries(coefficients)) {
    if (!Array.isArray(formula) || formula.length < 2) continue;
    const multi = Number(formula[0]) || 0;
    const add = Number(formula[1]) || 0;
    const baseValue = Number(template[key] ?? 0);
    calculatedProps[key] = Math.ceil(baseValue * multi + add);
  }

  const hpRate = Number(boss?.calcFormula?.hpRate || 0);
  if (hpRate > 0 && calculatedProps.hp != null) {
    calculatedProps.hp = Math.ceil(Number(calculatedProps.hp) * hpRate);
  }

  return {
    ...boss,
    level,
    calculatedProps,
  };
}

function trimLeagueBossGroupByConfiguredMaxLevel(group, maxLevel) {
  if (!group || typeof group !== 'object' || Array.isArray(group)) return group;
  if (toFiniteInteger(group.type) !== 33) return group;
  if (!group.levelTemplates || typeof group.levelTemplates !== 'object' || Array.isArray(group.levelTemplates)) return group;

  const templateEntries = Object.entries(group.levelTemplates)
    .map(([level, template]) => [toFiniteInteger(level), template])
    .filter(([level]) => level != null)
    .sort((left, right) => left[0] - right[0]);

  if (templateEntries.length === 0 || !Array.isArray(group.stages)) return group;

  const availableLevels = templateEntries.map(([level]) => level);
  const filteredTemplates = Object.fromEntries(templateEntries.map(([level, template]) => [String(level), template]));
  const degreeWorldLv = group.degreeWorldLv && typeof group.degreeWorldLv === 'object' ? group.degreeWorldLv : {};

  const nextStages = group.stages.map((stage) => {
    if (!stage || typeof stage !== 'object' || Array.isArray(stage)) return stage;

    const levelKey = typeof stage.leagueLevelKey === 'string' ? stage.leagueLevelKey.trim() : '';
    if (!levelKey) return stage;

    const offset = toFiniteInteger(degreeWorldLv[levelKey]) ?? 0;
    const preferredLevel = Math.max(1, maxLevel - offset);
    const resolvedLevel = pickBossDefaultLevel(availableLevels, preferredLevel) ?? availableLevels[0];
    const template = filteredTemplates[String(resolvedLevel)];

    return {
      ...stage,
      stageLv: resolvedLevel,
      bossData: Array.isArray(stage.bossData)
        ? stage.bossData.map((boss) => recalculateBossCalculatedProps(boss, resolvedLevel, template))
        : stage.bossData,
    };
  });

  return {
    ...group,
    levelTemplates: filteredTemplates,
    levelRange: {
      min: availableLevels[0],
      max: availableLevels[availableLevels.length - 1],
    },
    stages: nextStages,
  };
}

function trimBossGroupLevelOverride(group, maxLevel) {
  if (!group || typeof group !== 'object' || Array.isArray(group)) return group;
  if (toFiniteInteger(group.type) === 33) return trimLeagueBossGroupByConfiguredMaxLevel(group, maxLevel);
  if (!group.supportsLevelOverride || !group.levelTemplates || typeof group.levelTemplates !== 'object' || Array.isArray(group.levelTemplates)) {
    return group;
  }

  const maxBossLevel = maxLevel + 30;
  const filteredTemplateEntries = Object.entries(group.levelTemplates).filter(([level]) => {
    const numericLevel = toFiniteInteger(level);
    return numericLevel != null && numericLevel <= maxBossLevel;
  });

  if (filteredTemplateEntries.length === 0) return group;

  const filteredTemplates = Object.fromEntries(filteredTemplateEntries);
  const availableLevels = filteredTemplateEntries
    .map(([level]) => toFiniteInteger(level))
    .filter((level) => level != null)
    .sort((left, right) => left - right);

  const defaultLevel = pickBossDefaultLevel(availableLevels, maxLevel);
  const nextGroup = {
    ...group,
    defaultLevel,
    levelTemplates: filteredTemplates,
    levelRange: {
      min: availableLevels[0],
      max: availableLevels[availableLevels.length - 1],
    },
  };

  if (Array.isArray(group.levelOptions)) {
    nextGroup.levelOptions = group.levelOptions.filter((level) => {
      const numericLevel = toFiniteInteger(level);
      return numericLevel != null && numericLevel <= maxBossLevel;
    });
  }

  if (Array.isArray(group.stages)) {
    nextGroup.stages = group.stages.map((stage) => {
      if (!stage || typeof stage !== 'object' || Array.isArray(stage) || !stage.levelOverride || typeof stage.levelOverride !== 'object') {
        return stage;
      }

      return {
        ...stage,
        levelOverride: {
          ...stage.levelOverride,
          defaultLevel,
          maxLevel: Math.min(toFiniteInteger(stage.levelOverride.maxLevel) ?? maxBossLevel, maxBossLevel),
        },
      };
    });
  }

  return nextGroup;
}

function shouldSkipGenericMaxLevelFilter(name) {
  return name === 'boss_stage_stats' || name.startsWith('boss_type_');
}

function applyBossLevelDisplayRules(name, content, maxLevel) {
  if (!shouldSkipGenericMaxLevelFilter(name)) return content;
  if (!content || typeof content !== 'object') return content;

  if (name === 'boss_stage_stats' && Array.isArray(content.data)) {
    return {
      ...content,
      data: content.data.map((group) => trimBossGroupLevelOverride(group, maxLevel)),
    };
  }

  if (!content.data || typeof content.data !== 'object' || Array.isArray(content.data)) return content;

  return {
    ...content,
    data: trimBossGroupLevelOverride(content.data, maxLevel),
  };
}

function applySystemSpecificFilter(name, content, maxLevel) {
  const bossAdjustedContent = applyBossLevelDisplayRules(name, content, maxLevel);

  if (name !== 'role_fashion_ball') return bossAdjustedContent;
  if (!bossAdjustedContent || typeof bossAdjustedContent !== 'object' || !Array.isArray(bossAdjustedContent.data)) return bossAdjustedContent;
  return {
    ...bossAdjustedContent,
    data: trimFashionBallByReachableRank(bossAdjustedContent.data, maxLevel),
  };
}

function applyOutputMaxLevel(name, content, maxLevel = getConfiguredMaxLevel()) {
  const systemFilteredContent = applySystemSpecificFilter(name, content, maxLevel);
  if (shouldSkipGenericMaxLevelFilter(name)) return systemFilteredContent;
  if (!systemFilteredContent || typeof systemFilteredContent !== 'object') return systemFilteredContent;
  if (!('data' in systemFilteredContent)) return applyMaxLevel(systemFilteredContent, maxLevel);
  return { ...systemFilteredContent, data: applyMaxLevel(systemFilteredContent.data, maxLevel) };
}

module.exports = {
  DEFAULT_SETTINGS,
  getConfiguredMaxLevel,
  applyOutputMaxLevel,
};
