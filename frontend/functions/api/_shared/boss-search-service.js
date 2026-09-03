import bossList from './boss-search-source.js';

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
  // 句子包含Boss名称（例如用户提问 "打玥伶会出闪避吗"）
  if (name.length >= 2 && query.includes(name)) {
    let score = 600 + name.length * 10;
    if (stageName.length >= 2 && query.includes(stageName)) score += 200;
    return score;
  }
  // 关卡名完全匹配
  if (stageName === query) {
    return 200;
  }
  // 关卡名包含
  if (stageName.includes(query)) {
    return 100;
  }
  // 句子包含关卡名（例如用户提问 "打琉璃宫的boss"）
  if (stageName.length >= 2 && query.includes(stageName)) {
    return 150 + stageName.length * 10;
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

export function searchBosses(keywords, searchOptions = {}) {
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
  for (const boss of bossList) {
    if (!includeMobs && Number(boss.stageType) === 9999) {
      continue;
    }
    if (stageType !== null && !Number.isNaN(stageType) && Number(boss.stageType) !== stageType) {
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
    const aIsMob = Number(a.boss.stageType) === 9999 ? 1 : 0;
    const bIsMob = Number(b.boss.stageType) === 9999 ? 1 : 0;
    if (aIsMob !== bIsMob) {
      return aIsMob - bIsMob;
    }
    // 等级降序
    const aLevel = a.boss.level ?? a.boss.lv ?? 0;
    const bLevel = b.boss.level ?? b.boss.lv ?? 0;
    if (bLevel !== aLevel) {
      return bLevel - aLevel;
    }
    return String(a.boss.name || '').localeCompare(String(b.boss.name || ''), 'zh-Hans-CN');
  });

  return scored.slice(0, limit).map((item) => item.boss);
}
