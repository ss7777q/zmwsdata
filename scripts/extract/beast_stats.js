const fs = require('fs');
const path = require('path');
const u = require('../lib/utils');

const HISTORY_DIR = path.join(u.ROOT, 'data', 'pet-arena-history-raw');
const FILE_NAME_PATTERN = /^season-(\d+)-group-(\d+)\.json$/;
const WINNER_CODE = 200;
const EXPECTED_PET_TEAM_SIZE = 3;
const CLEAN_RATIO = 0.8;
const LAST_SERVER_EXCEPTION_POWER = 1000000;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildPetSpeciesMap() {
  const rows = u.loadTable('pet');
  assert(Array.isArray(rows), 'pet table is not an array');

  const petSpeciesNameById = new Map();
  for (const row of rows) {
    assert(row && typeof row === 'object', 'pet table contains an invalid row');
    const petId = Number(row.id);
    assert(Number.isFinite(petId), 'pet table row is missing numeric id');
    petSpeciesNameById.set(petId, typeof row.name === 'string' && row.name.trim() ? row.name.trim() : `未知宠物(${petId})`);
  }

  return petSpeciesNameById;
}

function buildSortedHistoryFiles() {
  assert(fs.existsSync(HISTORY_DIR), `history directory does not exist: ${HISTORY_DIR}`);

  return fs.readdirSync(HISTORY_DIR)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort((left, right) => {
      const leftMatch = left.match(FILE_NAME_PATTERN);
      const rightMatch = right.match(FILE_NAME_PATTERN);
      assert(leftMatch, `unexpected history file name: ${left}`);
      assert(rightMatch, `unexpected history file name: ${right}`);

      return Number(leftMatch[1]) - Number(rightMatch[1]) || Number(leftMatch[2]) - Number(rightMatch[2]);
    });
}

function parsePetEntry(fileName, petEntry, petSpeciesNameById, slotIndex) {
  assert(Array.isArray(petEntry), `pet entry must be an array in ${fileName}, index ${slotIndex}`);
  assert(petEntry.length >= 7, `pet entry is missing required fields in ${fileName}, index ${slotIndex}`);

  const petId = Number(petEntry[0]);
  const petLevel = Number(petEntry[1]);
  const petPower = Number(petEntry[2]);
  const petNickname = typeof petEntry[6] === 'string' && petEntry[6].trim() ? petEntry[6].trim() : petSpeciesNameById.get(petId);

  assert(Number.isFinite(petId), `invalid pet id in ${fileName}, index ${slotIndex}`);
  assert(Number.isFinite(petLevel), `invalid pet level in ${fileName}, index ${slotIndex}`);
  assert(Number.isFinite(petPower), `invalid pet power in ${fileName}, index ${slotIndex}`);
  assert(petPower > 0, `pet power must be positive in ${fileName}, index ${slotIndex}`);

  return {
    petId,
    petSpeciesName: petSpeciesNameById.get(petId) || `未知宠物(${petId})`,
    petNickname,
    petPower,
    petLevel,
    slotIndex,
  };
}

function parseWinnerRecord(fileName, petSpeciesNameById) {
  const match = fileName.match(FILE_NAME_PATTERN);
  assert(match, `unexpected history file name: ${fileName}`);

  const season = Number(match[1]);
  const group = Number(match[2]);
  const payload = loadJson(path.join(HISTORY_DIR, fileName));

  if (payload.code !== WINNER_CODE) {
    return {
      skipped: true,
      season,
      group,
      file: fileName,
      code: payload.code,
      error: payload.error || null,
    };
  }

  assert(payload.winner && typeof payload.winner === 'object', `missing winner payload in ${fileName}`);
  assert(Array.isArray(payload.winner.pets), `winner.pets must be an array in ${fileName}`);
  assert(payload.winner.pets.length === EXPECTED_PET_TEAM_SIZE, `winner.pets size must be ${EXPECTED_PET_TEAM_SIZE} in ${fileName}`);
  assert(payload.winner.baseInfo && typeof payload.winner.baseInfo === 'object', `winner.baseInfo must exist in ${fileName}`);

  const pets = payload.winner.pets.map((petEntry, index) => parsePetEntry(fileName, petEntry, petSpeciesNameById, index + 1));
  const petPowerSum = pets.reduce((sum, pet) => sum + pet.petPower, 0);

  return {
    skipped: false,
    season,
    group,
    file: fileName,
    sid: Number(payload.winner.sid),
    uid: String(payload.winner.uid),
    winnerNameAtThatTime: String(payload.winner.name || '').trim(),
    currentName: String(payload.winner.baseInfo.name || '').trim(),
    petPowerSum,
    pets,
  };
}

function buildSeasonAverageMap(records) {
  const seasonBuckets = new Map();

  for (const record of records) {
    if (!seasonBuckets.has(record.season)) {
      seasonBuckets.set(record.season, []);
    }
    seasonBuckets.get(record.season).push(record.petPowerSum);
  }

  const seasonAverageMap = new Map();
  for (const [season, values] of seasonBuckets.entries()) {
    const total = values.reduce((sum, value) => sum + value, 0);
    assert(values.length > 0, `season ${season} has no values`);
    seasonAverageMap.set(season, total / values.length);
  }

  return seasonAverageMap;
}

function buildAliasMap(records) {
  const aliasMap = new Map();

  for (const record of records) {
    if (!aliasMap.has(record.uid)) {
      aliasMap.set(record.uid, []);
    }

    const list = aliasMap.get(record.uid);
    if (!list.includes(record.winnerNameAtThatTime)) {
      list.push(record.winnerNameAtThatTime);
    }
  }

  return aliasMap;
}

function buildSeasonLastGroupMap(records) {
  const map = new Map();

  for (const record of records) {
    const previous = map.get(record.season);
    if (!previous || record.group > previous) {
      map.set(record.season, record.group);
    }
  }

  return map;
}

function enrichWinnerRecords(records, seasonAverageMap, aliasMap, seasonLastGroupMap) {
  return records.map((record) => {
    const seasonAvgPetPowerSum = seasonAverageMap.get(record.season);
    assert(Number.isFinite(seasonAvgPetPowerSum), `missing season average for season ${record.season}`);

    const seasonLastGroup = seasonLastGroupMap.get(record.season);
    assert(Number.isFinite(seasonLastGroup), `missing season last group for season ${record.season}`);

    const isBelowSeasonAvgRule = record.petPowerSum < seasonAvgPetPowerSum * CLEAN_RATIO;
    const isSeasonLastGroup = record.group === seasonLastGroup;
    const isAnomalyBySeasonAvg80 = isSeasonLastGroup
      ? record.petPowerSum < LAST_SERVER_EXCEPTION_POWER
      : isBelowSeasonAvgRule;

    return {
      ...record,
      seasonAvgPetPowerSum: Number(seasonAvgPetPowerSum.toFixed(6)),
      isAnomalyBySeasonAvg80,
      winnerAliasList: aliasMap.get(record.uid) || [record.winnerNameAtThatTime],
    };
  });
}

function buildSeasonOptionList(records) {
  return [...new Set(records.map((record) => record.season))].sort((left, right) => left - right);
}

function buildServerOptionList(records) {
  return [...new Set(records.map((record) => record.sid))].sort((left, right) => left - right);
}

function createPetSeasonAccumulator() {
  return {
    countBySeason: {},
    rateBySeason: {},
    totalCount: 0,
  };
}

function buildLineupAnalysisPayload(records, seasonList) {
  const petSummaryMap = new Map();
  const winnerCountBySeason = Object.fromEntries(seasonList.map((season) => [String(season), 0]));

  for (const record of records) {
    const seasonKey = String(record.season);
    winnerCountBySeason[seasonKey] += 1;

    for (const pet of record.pets) {
      if (!petSummaryMap.has(pet.petId)) {
        petSummaryMap.set(pet.petId, {
          petId: pet.petId,
          petSpeciesName: pet.petSpeciesName,
          ...createPetSeasonAccumulator(),
        });
      }

      const summary = petSummaryMap.get(pet.petId);
      summary.countBySeason[seasonKey] = (summary.countBySeason[seasonKey] || 0) + 1;
      summary.totalCount += 1;
    }
  }

  const petCatalog = [...petSummaryMap.values()]
    .map((summary) => {
      const countBySeason = {};
      const rateBySeason = {};

      for (const season of seasonList) {
        const seasonKey = String(season);
        const count = summary.countBySeason[seasonKey] || 0;
        const winnerCount = winnerCountBySeason[seasonKey];
        countBySeason[seasonKey] = count;
        rateBySeason[seasonKey] = winnerCount > 0 ? Number((count / winnerCount).toFixed(6)) : 0;
      }

      return {
        petId: summary.petId,
        petSpeciesName: summary.petSpeciesName,
        totalCount: summary.totalCount,
        countBySeason,
        rateBySeason,
      };
    })
    .sort((left, right) => right.totalCount - left.totalCount || left.petId - right.petId);

  const appearanceCountBySeason = {};
  const appearanceRateBySeason = {};
  for (const pet of petCatalog) {
    appearanceCountBySeason[String(pet.petId)] = pet.countBySeason;
    appearanceRateBySeason[String(pet.petId)] = pet.rateBySeason;
  }

  return {
    seasonList,
    petCatalog: petCatalog.map((pet) => ({
      petId: pet.petId,
      petSpeciesName: pet.petSpeciesName,
      totalCount: pet.totalCount,
    })),
    appearanceCountBySeason,
    appearanceRateBySeason,
    topPetsDefault: petCatalog.slice(0, 10).map((pet) => pet.petId),
  };
}

function buildPlayerAnalysisPayload(records) {
  const playerMap = new Map();

  for (const record of records) {
    if (!playerMap.has(record.uid)) {
      playerMap.set(record.uid, {
        uid: record.uid,
        currentName: record.currentName,
        winnerAliasList: [...record.winnerAliasList],
        championCount: 0,
        seasonWins: [],
        sidCoverage: [],
      });
    }

    const player = playerMap.get(record.uid);
    player.currentName = record.currentName;
    player.championCount += 1;
    player.seasonWins.push({ season: record.season, sid: record.sid, winnerNameAtThatTime: record.winnerNameAtThatTime });

    if (!player.sidCoverage.includes(record.sid)) {
      player.sidCoverage.push(record.sid);
      player.sidCoverage.sort((left, right) => left - right);
    }

    for (const alias of record.winnerAliasList) {
      if (!player.winnerAliasList.includes(alias)) {
        player.winnerAliasList.push(alias);
      }
    }
  }

  const rows = [...playerMap.values()]
    .sort((left, right) => {
      const leftLatestSeason = left.seasonWins[left.seasonWins.length - 1]?.season || 0;
      const rightLatestSeason = right.seasonWins[right.seasonWins.length - 1]?.season || 0;
      return right.championCount - left.championCount
        || rightLatestSeason - leftLatestSeason
        || left.uid.localeCompare(right.uid);
    })
    .map((player, index) => ({
      rank: index + 1,
      ...player,
      firstChampionSeason: player.seasonWins[0]?.season || null,
      latestChampionSeason: player.seasonWins[player.seasonWins.length - 1]?.season || null,
    }));

  return rows;
}

function buildAnomalyPayload(records) {
  return buildCompactDetailRows(
    records
      .filter((record) => record.isAnomalyBySeasonAvg80)
      .sort((left, right) => left.season - right.season || left.sid - right.sid || left.petPowerSum - right.petPowerSum)
  );
}

function buildPetSpeciesNameDictionary(records) {
  const petSpeciesNameById = {};

  for (const record of records) {
    for (const pet of record.pets) {
      petSpeciesNameById[String(pet.petId)] = pet.petSpeciesName;
    }
  }

  return petSpeciesNameById;
}

function buildCompactDetailRows(records) {
  return records.map((record) => ({
    season: record.season,
    group: record.group,
    sid: record.sid,
    uid: record.uid,
    winnerNameAtThatTime: record.winnerNameAtThatTime,
    currentName: record.currentName,
    petPowerSum: record.petPowerSum,
    isAnomalyBySeasonAvg80: record.isAnomalyBySeasonAvg80,
    pets: record.pets.map((pet) => ({
      petId: pet.petId,
      petNickname: pet.petNickname,
      petPower: pet.petPower,
      petLevel: pet.petLevel,
      slotIndex: pet.slotIndex,
    })),
  }));
}

function buildDetailPayload(records, seasonList, serverList) {
  const rows = [...records].sort((left, right) => right.season - left.season || left.sid - right.sid || left.group - right.group);

  return {
    summary: {
      totalChampions: rows.length,
      anomalyCount: rows.filter((record) => record.isAnomalyBySeasonAvg80).length,
      seasonList,
      serverList,
      petSpeciesNameById: buildPetSpeciesNameDictionary(rows),
    },
    rows: buildCompactDetailRows(rows),
  };
}

function extract() {
  console.log('\n🐲 万兽统计');

  const petSpeciesNameById = buildPetSpeciesMap();
  const files = buildSortedHistoryFiles();
  const parsed = files.map((fileName) => parseWinnerRecord(fileName, petSpeciesNameById));
  const skippedRows = parsed.filter((record) => record.skipped);
  const winnerRows = parsed.filter((record) => !record.skipped);

  assert(winnerRows.length > 0, 'no winner rows found in pet arena history');

  const seasonAverageMap = buildSeasonAverageMap(winnerRows);
  const aliasMap = buildAliasMap(winnerRows);
  const seasonLastGroupMap = buildSeasonLastGroupMap(winnerRows);
  const enrichedRows = enrichWinnerRecords(winnerRows, seasonAverageMap, aliasMap, seasonLastGroupMap);
  const seasonList = buildSeasonOptionList(enrichedRows);
  const serverList = buildServerOptionList(enrichedRows);
  const rawLineup = buildLineupAnalysisPayload(enrichedRows, seasonList);
  const cleanedLineup = buildLineupAnalysisPayload(enrichedRows.filter((record) => !record.isAnomalyBySeasonAvg80), seasonList);
  const anomalies = buildAnomalyPayload(enrichedRows);

  u.saveOutput('beast_detail', buildDetailPayload(enrichedRows, seasonList, serverList), {
    system: '万兽统计 → 详情',
    source: 'data/pet-arena-history-raw/*.json + dataApi/pet.*.json',
    metric: 'pet_power_sum = sum(winner.pets[*][2])',
    cleanRule: '非每赛季最后一个group时：pet_power_sum < season_avg * 0.8；每赛季最后一个group时：pet_power_sum < 1000000',
  });

  u.saveOutput('beast_lineup_analysis', {
    summary: {
      totalChampionRows: enrichedRows.length,
      cleanedChampionRows: enrichedRows.filter((record) => !record.isAnomalyBySeasonAvg80).length,
      anomalyRows: anomalies.length,
      seasonList,
    },
    raw: rawLineup,
    cleaned: cleanedLineup,
  }, {
    system: '万兽统计 → 阵容分析',
    source: 'data/pet-arena-history-raw/*.json + dataApi/pet.*.json',
    metric: 'appearance count / appearance rate by season',
    cleanRule: '非每赛季最后一个group时：pet_power_sum < season_avg * 0.8；每赛季最后一个group时：pet_power_sum < 1000000',
  });

  u.saveOutput('beast_player_analysis', {
    summary: {
      totalPlayers: new Set(enrichedRows.map((record) => record.uid)).size,
      totalChampionRows: enrichedRows.length,
      seasonList,
      serverList,
    },
    rows: buildPlayerAnalysisPayload(enrichedRows),
  }, {
    system: '万兽统计 → 兽王玩家分析',
    source: 'data/pet-arena-history-raw/*.json + dataApi/pet.*.json',
  });

  u.saveOutput('beast_anomalies', {
    summary: {
      totalAnomalies: anomalies.length,
      totalSkippedRows: skippedRows.length,
      seasonList,
      serverList,
    },
    skippedRows,
    rows: anomalies,
  }, {
    system: '万兽统计 → 异常明细',
    source: 'data/pet-arena-history-raw/*.json + dataApi/pet.*.json',
    cleanRule: '非每赛季最后一个group时：pet_power_sum < season_avg * 0.8；每赛季最后一个group时：pet_power_sum < 1000000',
  });
}

if (require.main === module) {
  extract();
}

module.exports = extract;
