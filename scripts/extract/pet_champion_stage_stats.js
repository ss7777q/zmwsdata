const fs = require('fs');
const path = require('path');
const u = require('../lib/utils');

const CHAMPION_DIR = path.join(u.ROOT, 'data', 'pet-champion-rank3');
const STAGE_KEYS = ['16', '8', '4', '2', 'winner'];
const STAGE_NAMES = {
  '16': '16强',
  '8': '8强',
  '4': '4强',
  '2': '决赛',
  'winner': '总冠军',
};

const STAGES_CONFIG = [
  { key: 'all', name: '全部赛程' },
  { key: '16', name: '16强 (Top 16)' },
  { key: '8', name: '8强 (Top 8)' },
  { key: '4', name: '4强 (Top 4)' },
  { key: '2', name: '决赛 (Top 2)' },
  { key: 'winner', name: '总冠军 (Winner)' },
];

function buildPetSpeciesMap() {
  const rows = u.loadTable('pet');
  const petSpeciesNameById = new Map();
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (row && typeof row === 'object') {
        const petId = Number(row.id);
        if (Number.isFinite(petId)) {
          petSpeciesNameById.set(
            petId,
            typeof row.name === 'string' && row.name.trim() ? row.name.trim() : `未知宠物(${petId})`
          );
        }
      }
    }
  }
  return petSpeciesNameById;
}

function scanSeasons() {
  if (!fs.existsSync(CHAMPION_DIR)) return [];
  const entries = fs.readdirSync(CHAMPION_DIR, { withFileTypes: true });
  const seasons = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const match = entry.name.match(/^season-(\d+)$/);
      if (match) {
        seasons.push({
          seasonId: Number(match[1]),
          dirName: entry.name,
          dirPath: path.join(CHAMPION_DIR, entry.name),
        });
      }
    }
  }
  return seasons.sort((a, b) => a.seasonId - b.seasonId);
}

function processFilesForSeason(seasonInfo) {
  const files = fs.readdirSync(seasonInfo.dirPath).filter(f => f.endsWith('.json'));
  const serverMap = new Map();

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(seasonInfo.dirPath, file), 'utf8');
      const payload = JSON.parse(content);
      if (payload && payload.rank && payload.rank.lInfo && payload.rank.rInfo && payload.rank.winner) {
        const sid = Number(payload.serverId);
        if (!Number.isFinite(sid)) continue;

        // 同一赛季同一 serverId 淘汰赛树去重，保留最新上传记录
        if (!serverMap.has(sid)) {
          serverMap.set(sid, payload);
        } else {
          const prev = serverMap.get(sid);
          const prevTime = Number(prev.submittedAt || prev.receivedAt || 0);
          const curTime = Number(payload.submittedAt || payload.receivedAt || 0);
          if (curTime >= prevTime) {
            serverMap.set(sid, payload);
          }
        }
      }
    } catch (err) {
      console.warn(`[WARN] 无法读取文件 ${file}:`, err.message);
    }
  }

  return [...serverMap.values()].sort((a, b) => Number(a.serverId) - Number(b.serverId));
}

function aggregateStageStats(records, petMap, seasonId, seasonName) {
  const serverCount = records.length;
  const serverList = [...new Set(records.map(r => Number(r.serverId)))].sort((a, b) => a - b);
  const totalTeamsByStage = {
    '16': serverCount * 16,
    '8': serverCount * 8,
    '4': serverCount * 4,
    '2': serverCount * 2,
    'winner': serverCount * 1,
  };

  const petAcc = new Map();

  function getOrInitPet(petId) {
    if (!petAcc.has(petId)) {
      petAcc.set(petId, {
        petId,
        petName: petMap.get(petId) || `未知宠物(${petId})`,
        counts: {
          '16': { appear: 0, wins: 0 },
          '8': { appear: 0, wins: 0 },
          '4': { appear: 0, wins: 0 },
          '2': { appear: 0, wins: 0 },
          'winner': { appear: 0, wins: 0 },
        },
      });
    }
    return petAcc.get(petId);
  }

  for (const record of records) {
    const rank = record.rank;
    const list8 = [...(rank.lInfo?.list8 || []), ...(rank.rInfo?.list8 || [])];
    const list4 = [...(rank.lInfo?.list4 || []), ...(rank.rInfo?.list4 || [])];
    const list2 = [...(rank.lInfo?.list2 || []), ...(rank.rInfo?.list2 || [])];
    const list1 = [...(rank.lInfo?.list1 || []), ...(rank.rInfo?.list1 || [])];
    const winner = rank.winner;

    const list4Uids = new Set(list4.map(p => p.uid));
    const list2Uids = new Set(list2.map(p => p.uid));
    const list1Uids = new Set(list1.map(p => p.uid));
    const winnerUid = winner?.uid;

    // 16强
    for (const player of list8) {
      const won = list4Uids.has(player.uid);
      for (const petEntry of player.pets || []) {
        const petId = Number(petEntry[0]);
        if (!Number.isFinite(petId)) continue;
        const pet = getOrInitPet(petId);
        pet.counts['16'].appear++;
        if (won) pet.counts['16'].wins++;
      }
    }

    // 8强
    for (const player of list4) {
      const won = list2Uids.has(player.uid);
      for (const petEntry of player.pets || []) {
        const petId = Number(petEntry[0]);
        if (!Number.isFinite(petId)) continue;
        const pet = getOrInitPet(petId);
        pet.counts['8'].appear++;
        if (won) pet.counts['8'].wins++;
      }
    }

    // 4强
    for (const player of list2) {
      const won = list1Uids.has(player.uid);
      for (const petEntry of player.pets || []) {
        const petId = Number(petEntry[0]);
        if (!Number.isFinite(petId)) continue;
        const pet = getOrInitPet(petId);
        pet.counts['4'].appear++;
        if (won) pet.counts['4'].wins++;
      }
    }

    // 决赛 (2强)
    for (const player of list1) {
      const won = player.uid === winnerUid;
      for (const petEntry of player.pets || []) {
        const petId = Number(petEntry[0]);
        if (!Number.isFinite(petId)) continue;
        const pet = getOrInitPet(petId);
        pet.counts['2'].appear++;
        if (won) pet.counts['2'].wins++;
      }
    }

    // 冠军
    if (winner && Array.isArray(winner.pets)) {
      for (const petEntry of winner.pets) {
        const petId = Number(petEntry[0]);
        if (!Number.isFinite(petId)) continue;
        const pet = getOrInitPet(petId);
        pet.counts['winner'].appear++;
        pet.counts['winner'].wins++;
      }
    }
  }

  const petCatalog = [];

  for (const pet of petAcc.values()) {
    const stages = {};
    const trend = [];

    let totalMatches = 0;
    let totalWins = 0;

    for (const key of STAGE_KEYS) {
      const countInfo = pet.counts[key];
      const stageTotalTeams = totalTeamsByStage[key] || 1;
      const pickRate = Number((countInfo.appear / stageTotalTeams).toFixed(4));
      
      let winRate = 0;
      if (key === 'winner') {
        winRate = 1.0;
      } else {
        winRate = countInfo.appear > 0 ? Number((countInfo.wins / countInfo.appear).toFixed(4)) : 0;
        totalMatches += countInfo.appear;
        totalWins += countInfo.wins;
      }

      const stageObj = {
        stageKey: key,
        stageName: STAGE_NAMES[key],
        totalTeams: stageTotalTeams,
        appearances: countInfo.appear,
        pickRate,
        wins: countInfo.wins,
        winRate,
      };

      stages[key] = stageObj;
      trend.push({
        stageKey: key,
        stageName: STAGE_NAMES[key],
        pickRate,
        winRate,
        appearances: countInfo.appear,
        wins: countInfo.wins,
      });
    }

    const overallWinRate = totalMatches > 0 ? Number((totalWins / totalMatches).toFixed(4)) : 0;
    const championCount = pet.counts['winner'].appear;
    const stage16Appearances = pet.counts['16'].appear;
    const championConversionRate = stage16Appearances > 0 ? Number((championCount / stage16Appearances).toFixed(4)) : 0;

    petCatalog.push({
      petId: pet.petId,
      petName: pet.petName,
      totalMatches,
      totalWins,
      overallWinRate,
      championCount,
      championConversionRate,
      stages,
      trend,
    });
  }

  petCatalog.sort((a, b) => b.stages['16'].appearances - a.stages['16'].appearances || b.championCount - a.championCount);
  const topPetsDefault = petCatalog.slice(0, 5).map(p => p.petId);

  return {
    seasonId,
    seasonName,
    serverCount,
    serverList,
    totalTeamsByStage,
    petCatalog,
    topPetsDefault,
  };
}

function extract() {
  console.log('\n🏆 宠物冠军赛（Rank3）赛程统计数据提取');
  const petMap = buildPetSpeciesMap();
  const seasonInfos = scanSeasons();

  if (seasonInfos.length === 0) {
    console.warn('⚠️ 未找到任何 pet-champion-rank3 赛季目录');
    return;
  }

  const allRecords = [];
  const seasonsOutput = {};
  const seasonIdList = [];

  for (const s of seasonInfos) {
    const records = processFilesForSeason(s);
    allRecords.push(...records);
    seasonIdList.push(s.seasonId);
    seasonsOutput[String(s.seasonId)] = aggregateStageStats(
      records,
      petMap,
      s.seasonId,
      `第${s.seasonId}赛季`
    );
  }

  seasonsOutput['all'] = aggregateStageStats(
    allRecords,
    petMap,
    'all',
    '全部赛季'
  );

  const payload = {
    seasons: seasonsOutput,
    seasonList: seasonIdList,
    stageList: STAGES_CONFIG,
    extractedTime: new Date().toISOString(),
  };

  u.saveOutput('pet_champion_stage_stats', payload, {
    system: 'pet_champion',
    seasonCount: seasonIdList.length,
    serverCountTotal: allRecords.length,
  });
}

if (require.main === module) {
  extract();
}

module.exports = extract;
