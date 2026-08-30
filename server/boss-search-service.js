'use strict';

const fs = require('fs');
const path = require('path');

function getPrimaryMapName(mapName) {
  if (Array.isArray(mapName)) {
    return mapName[0] || '';
  }
  return mapName || '';
}

function getMainlineStageKey(mapName) {
  return getPrimaryMapName(mapName).split(/-Lv/i)[0];
}

function getMainlineBossKey(boss) {
  if (Number(boss.type) !== 1) {
    return null;
  }
  const bossId = boss.bossId ?? boss.id;
  const stageKey = getMainlineStageKey(boss.mapName);
  if (bossId == null || bossId === '' || !stageKey) {
    return null;
  }
  return [
    String(boss.type),
    stageKey,
    String(bossId),
    String(boss.displayPhase ?? ''),
  ].join('|');
}

function extractNumericTokens(value) {
  const matches = String(value || '').match(/\d+/g);
  return matches ? matches.map((item) => Number(item)) : [];
}

function compareNumberArraysDesc(lhs, rhs) {
  const maxLength = Math.max(lhs.length, rhs.length);
  for (let index = 0; index < maxLength; index += 1) {
    const left = lhs[index] ?? -1;
    const right = rhs[index] ?? -1;
    if (left !== right) {
      return right - left;
    }
  }
  return 0;
}

function toSortableNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function compareLeagueBoss(lhs, rhs) {
  const modeRank = (boss) => (boss.leagueMode === 'really' ? 1 : 0);
  const modeCompare = modeRank(rhs) - modeRank(lhs);
  if (modeCompare !== 0) {
    return modeCompare;
  }

  const difficultyRank = (boss) => {
    if (boss.leagueLevelKey === 'tiaozhan') return 2;
    if (boss.leagueLevelKey === 'emeng') return 1;
    return 0;
  };
  const difficultyCompare = difficultyRank(rhs) - difficultyRank(lhs);
  if (difficultyCompare !== 0) {
    return difficultyCompare;
  }

  const leftLevel = toSortableNumber(lhs.stageLv ?? lhs.level);
  const rightLevel = toSortableNumber(rhs.stageLv ?? rhs.level);
  if (leftLevel != null && rightLevel != null && leftLevel !== rightLevel) {
    return rightLevel - leftLevel;
  }

  return 0;
}

function compareBossDesc(lhs, rhs) {
  const normalizeType = (value) => (value === 9999 ? -1 : value);
  const leftType = normalizeType(toSortableNumber(lhs.type));
  const rightType = normalizeType(toSortableNumber(rhs.type));
  if (leftType != null && rightType != null && leftType !== rightType) {
    return rightType - leftType;
  }

  if (leftType === 33 && rightType === 33) {
    const leagueBossCompare = compareLeagueBoss(lhs, rhs);
    if (leagueBossCompare !== 0) {
      return leagueBossCompare;
    }
  }

  const mapCompare = compareNumberArraysDesc(
    extractNumericTokens(getPrimaryMapName(lhs.mapName)),
    extractNumericTokens(getPrimaryMapName(rhs.mapName))
  );
  if (mapCompare !== 0) {
    return mapCompare;
  }

  const leftStageLevel = toSortableNumber(lhs.stageLv ?? lhs.level);
  const rightStageLevel = toSortableNumber(rhs.stageLv ?? rhs.level);
  if (leftStageLevel != null && rightStageLevel != null && leftStageLevel !== rightStageLevel) {
    return rightStageLevel - leftStageLevel;
  }

  const leftStageId = toSortableNumber(lhs.stageId);
  const rightStageId = toSortableNumber(rhs.stageId);
  if (leftStageId != null && rightStageId != null && leftStageId !== rightStageId) {
    return rightStageId - leftStageId;
  }

  const leftBossId = toSortableNumber(lhs.id);
  const rightBossId = toSortableNumber(rhs.id);
  if (leftBossId != null && rightBossId != null && leftBossId !== rightBossId) {
    return rightBossId - leftBossId;
  }

  return String(rhs.stageName || '').localeCompare(String(lhs.stageName || ''), 'zh-Hans-CN');
}

function loadBossDataSources(outputDir) {
  const dataSources = {};
  if (!fs.existsSync(outputDir)) {
    return dataSources;
  }

  const files = fs.readdirSync(outputDir).filter((file) => file.startsWith('boss_type_') && file.endsWith('.json'));
  for (const file of files) {
    try {
      const fullPath = path.join(outputDir, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      const key = file.replace(/\.json$/i, '');
      dataSources[key] = JSON.parse(content);
    } catch (err) {
      console.error(`[boss-search-service] Failed to read ${file}:`, err.message);
    }
  }

  return dataSources;
}

function collectBossGroups(dataSources) {
  const groupMap = new Map();

  const splitEntries = Object.entries(dataSources).filter(([name]) => name.startsWith('boss_type_'));
  for (const [, payload] of splitEntries) {
    const group = payload?.data;
    if (group && typeof group === 'object' && Array.isArray(group.stages)) {
      const key = group.type == null ? `${group.label || 'unknown'}-${groupMap.size}` : String(group.type);
      groupMap.set(key, group);
    }
  }

  return Array.from(groupMap.values()).sort(
    (lhs, rhs) => Number(lhs.type ?? Number.MAX_SAFE_INTEGER) - Number(rhs.type ?? Number.MAX_SAFE_INTEGER)
  );
}

function flattenBossGroups(groups) {
  const flatList = [];
  for (const group of groups) {
    for (const stage of group.stages || []) {
      for (const boss of stage.bossData || []) {
        const flattenedBoss = {
          ...boss,
          stageId: stage.stageId,
          stageName: stage.stageName,
          stageLv: stage.stageLv,
          mapName: stage.mapName,
          type: group.type,
          typeLabel: group.label,
        };

        const phases = boss.phases?.filter((phase) => phase.calculatedProps) || [];
        if (phases.length < 2) {
          flatList.push(flattenedBoss);
          continue;
        }

        for (const phase of phases) {
          const phaseLabel = phase.phase === 1 ? '一阶段' : '二阶段·狂暴';
          flatList.push({
            ...flattenedBoss,
            name: `${boss.name}（${phaseLabel}）`,
            baseBossName: boss.name,
            displayPhase: phase.phase,
            displayPhaseName: phaseLabel,
            calculatedProps: phase.calculatedProps,
            calculatedPropsDouble: phase.calculatedPropsDouble,
          });
        }
      }
    }
  }

  const seenMainlineBosses = new Set();
  const dedupedList = flatList.filter((boss) => {
    const key = getMainlineBossKey(boss);
    if (!key) {
      return true;
    }
    if (seenMainlineBosses.has(key)) {
      return false;
    }
    seenMainlineBosses.add(key);
    return true;
  });

  return dedupedList.sort(compareBossDesc);
}

function scoreBoss(boss, query, tokens) {
  const name = (boss.name || '').toLowerCase();
  const baseName = (boss.baseBossName || '').toLowerCase();
  const remark = (boss.remark || '').toLowerCase();
  const stageName = (boss.stageName || '').toLowerCase();
  const idStr = String(boss.id ?? '');
  const bossIdStr = String(boss.bossId ?? '');

  // 完全匹配
  if (name === query || baseName === query || idStr === query || bossIdStr === query) {
    return 1000;
  }
  // 名称前缀匹配
  if (name.startsWith(query) || baseName.startsWith(query)) {
    return 800;
  }
  // 名称包含
  if (name.includes(query) || baseName.includes(query)) {
    return 500;
  }
  // 备注完全匹配
  if (remark === query) {
    return 400;
  }
  // 备注包含
  if (remark.includes(query)) {
    return 300;
  }
  // 关卡名完全匹配
  if (stageName === query) {
    return 200;
  }
  // 关卡名包含
  if (stageName.includes(query)) {
    return 100;
  }

  // 多词匹配 (例如: '火焰山 牛魔王')
  if (tokens.length > 1) {
    const allMatch = tokens.every((token) => {
      return name.includes(token) || remark.includes(token) || stageName.includes(token);
    });
    if (allMatch) {
      return 350;
    }
  }

  return 0;
}

function formatBossResponse(boss) {
  const props = boss.calculatedProps || {};
  return {
    id: boss.id,
    bossId: boss.bossId ?? boss.id,
    name: boss.name,
    remark: boss.remark || '',
    lv: boss.level ?? boss.stageLv,
    level: boss.level ?? boss.stageLv,
    stageId: boss.stageId,
    stageName: boss.stageName,
    stageType: boss.type,
    typeLabel: boss.typeLabel,
    atk: props.atk ?? 0,
    def: props.def ?? 0,
    hp: props.hp ?? props.maxHp ?? 0,
    mp: props.mp ?? props.maxMp ?? 0,
    hitVal: props.hitVal ?? 0,
    dodge: props.dodge ?? 0,
    crit: props.crit ?? 0,
    tenacity: props.tenacity ?? 0,
    lucky: props.lucky ?? 0,
    guardian: props.guardian ?? 0,
    break: props.break ?? 0,
    protect: props.protect ?? 0,
    healHp: props.healHp ?? 0,
    healMp: props.healMp ?? 0,
    displayPhase: boss.displayPhase ?? null,
    displayPhaseName: boss.displayPhaseName ?? null,
    resistEntries: boss.resistEntries || [],
  };
}

function createBossSearchService(options = {}) {
  const outputDir = options.outputDir || path.resolve(__dirname, '..', 'output');
  let bosses = [];
  let groups = [];
  let indexedAt = null;

  function reload() {
    const dataSources = loadBossDataSources(outputDir);
    groups = collectBossGroups(dataSources);
    bosses = flattenBossGroups(groups);
    indexedAt = new Date().toISOString();
    return {
      bossCount: bosses.length,
      groupCount: groups.length,
      indexedAt,
    };
  }

  // 初始构建索引
  reload();

  function searchBosses(keywords, searchOptions = {}) {
    const rawQuery = String(keywords || '').trim();
    if (!rawQuery) {
      return [];
    }

    const query = rawQuery.toLowerCase();
    const tokens = query.split(/\s+/).filter(Boolean);
    const limit = Math.min(Math.max(1, Number(searchOptions.limit) || 50), 200);
    const stageType = searchOptions.type !== undefined && searchOptions.type !== null && searchOptions.type !== ''
      ? Number(searchOptions.type)
      : null;
    const includeMobs = searchOptions.includeMobs !== false && searchOptions.includeMobs !== 'false';

    const scored = [];
    for (const boss of bosses) {
      if (!includeMobs && Number(boss.type) === 9999) {
        continue;
      }
      if (stageType !== null && !Number.isNaN(stageType) && Number(boss.type) !== stageType) {
        continue;
      }

      const score = scoreBoss(boss, query, tokens);
      if (score > 0) {
        scored.push({ boss, score });
      }
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // 同分时优先非小怪
      const aIsMob = Number(a.boss.type) === 9999 ? 1 : 0;
      const bIsMob = Number(b.boss.type) === 9999 ? 1 : 0;
      if (aIsMob !== bIsMob) {
        return aIsMob - bIsMob;
      }
      // 等级降序
      const aLevel = a.boss.level ?? a.boss.stageLv ?? 0;
      const bLevel = b.boss.level ?? b.boss.stageLv ?? 0;
      if (bLevel !== aLevel) {
        return bLevel - aLevel;
      }
      return String(a.boss.name || '').localeCompare(String(b.boss.name || ''), 'zh-Hans-CN');
    });

    return scored.slice(0, limit).map((item) => formatBossResponse(item.boss));
  }

  function getStats() {
    return {
      bossCount: bosses.length,
      groupCount: groups.length,
      indexedAt,
    };
  }

  function getAllFormattedBosses() {
    return bosses.map((b) => formatBossResponse(b));
  }

  return {
    searchBosses,
    getAllFormattedBosses,
    reload,
    getStats,
  };
}

module.exports = {
  createBossSearchService,
  formatBossResponse,
};
