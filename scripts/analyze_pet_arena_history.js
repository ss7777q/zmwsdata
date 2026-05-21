#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { ROOT, findTableFile, saveOutput } = require('./lib/utils');

const HISTORY_DIR = path.join(ROOT, 'data', 'pet-arena-history-raw');
const PET_TABLE_FILE = findTableFile('pet');

const FILE_NAME_PATTERN = /^season-(\d+)-group-(\d+)\.json$/;
const WINNER_CODE = 200;
const EXPECTED_PET_TEAM_SIZE = 3;

const OUTLIER_IQR_MULTIPLIER = 1.5;
const EXCLUDE_RATIO_TO_SEASON_MEDIAN = 0.55;
const REVIEW_RATIO_TO_SEASON_MEDIAN = 0.8;
const REVIEW_QUANTILE = 0.1;
const SAME_PET_TRIPLET_SIZE = 1;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function quantile(values, q) {
  assert(Array.isArray(values) && values.length > 0, 'quantile requires a non-empty numeric array');
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const baseIndex = Math.floor(position);
  const fraction = position - baseIndex;

  if (baseIndex === sorted.length - 1) {
    return sorted[baseIndex];
  }

  return sorted[baseIndex] + fraction * (sorted[baseIndex + 1] - sorted[baseIndex]);
}

function median(values) {
  return quantile(values, 0.5);
}

function parseHistoryRow(fileName, filePath, petNameById) {
  const match = fileName.match(FILE_NAME_PATTERN);
  assert(match, `Unexpected history file name: ${fileName}`);

  const season = Number(match[1]);
  const group = Number(match[2]);
  const payload = loadJson(filePath);

  if (payload.code !== WINNER_CODE) {
    return {
      season,
      group,
      file: fileName,
      code: payload.code,
      skipped: true,
      error: payload.error || null,
    };
  }

  assert(payload.winner && typeof payload.winner === 'object', `Missing winner payload in ${fileName}`);
  assert(Array.isArray(payload.winner.pets), `winner.pets must be an array in ${fileName}`);
  assert(
    payload.winner.pets.length === EXPECTED_PET_TEAM_SIZE,
    `winner.pets size must be ${EXPECTED_PET_TEAM_SIZE} in ${fileName}`,
  );

  const pets = payload.winner.pets.map((petEntry, index) => {
    assert(Array.isArray(petEntry), `Pet entry must be an array in ${fileName}, index ${index}`);
    assert(petEntry.length >= 3, `Pet entry must contain id and power in ${fileName}, index ${index}`);

    const petId = Number(petEntry[0]);
    const petPower = Number(petEntry[2]);

    assert(Number.isFinite(petId), `Invalid pet id in ${fileName}, index ${index}`);
    assert(Number.isFinite(petPower), `Invalid pet power in ${fileName}, index ${index}`);
    assert(petPower > 0, `Pet power must be positive in ${fileName}, index ${index}`);

    return {
      petId,
      petName: petNameById.get(petId) || null,
      petPower,
    };
  });

  const petPowerSum = pets.reduce((sum, pet) => sum + pet.petPower, 0);
  const petIds = pets.map(pet => pet.petId);
  const uniquePetCount = new Set(petIds).size;

  return {
    season,
    group,
    file: fileName,
    code: payload.code,
    skipped: false,
    uid: payload.winner.uid,
    sid: payload.winner.sid,
    name: payload.winner.name,
    petPowerSum,
    petIds,
    pets,
    isSamePetTriplet: uniquePetCount === SAME_PET_TRIPLET_SIZE,
  };
}

function buildSeasonStats(rows) {
  const seasonMap = new Map();

  for (const row of rows) {
    if (!seasonMap.has(row.season)) {
      seasonMap.set(row.season, []);
    }
    seasonMap.get(row.season).push(row);
  }

  const statsBySeason = new Map();
  for (const [season, seasonRows] of [...seasonMap.entries()].sort((a, b) => a[0] - b[0])) {
    const values = seasonRows.map(row => row.petPowerSum);
    const q1 = quantile(values, 0.25);
    const q3 = quantile(values, 0.75);
    const medianValue = median(values);
    const p10 = quantile(values, REVIEW_QUANTILE);
    const iqr = q3 - q1;
    const lowFence = q1 - OUTLIER_IQR_MULTIPLIER * iqr;

    statsBySeason.set(season, {
      season,
      sampleSize: seasonRows.length,
      min: Math.min(...values),
      max: Math.max(...values),
      median: medianValue,
      q1,
      q3,
      iqr,
      p10,
      lowFence,
    });
  }

  return statsBySeason;
}

function tagRows(rows, statsBySeason) {
  return rows.map(row => {
    const stats = statsBySeason.get(row.season);
    assert(stats, `Missing season stats for season ${row.season}`);

    const ratioToMedian = row.petPowerSum / stats.median;
    const reasons = [];

    if (row.petPowerSum < stats.lowFence) {
      reasons.push('below_iqr_low_fence');
    }
    if (ratioToMedian < EXCLUDE_RATIO_TO_SEASON_MEDIAN) {
      reasons.push('below_exclude_ratio_to_season_median');
    }
    if (ratioToMedian < REVIEW_RATIO_TO_SEASON_MEDIAN) {
      reasons.push('below_review_ratio_to_season_median');
    }
    if (row.petPowerSum < stats.p10) {
      reasons.push('below_season_p10');
    }
    if (row.isSamePetTriplet) {
      reasons.push('same_pet_triplet');
    }

    let status = 'ok';
    if (reasons.includes('below_iqr_low_fence') || reasons.includes('below_exclude_ratio_to_season_median')) {
      status = 'exclude';
    } else if (reasons.length > 0) {
      status = 'review';
    }

    return {
      ...row,
      seasonMedianPetPower: stats.median,
      seasonP10PetPower: stats.p10,
      seasonLowFencePetPower: stats.lowFence,
      ratioToSeasonMedian: Number(ratioToMedian.toFixed(6)),
      status,
      reasons,
    };
  });
}

function buildSummary(taggedRows, skippedRows, statsBySeason) {
  const summaryByStatus = taggedRows.reduce((accumulator, row) => {
    accumulator[row.status] = (accumulator[row.status] || 0) + 1;
    return accumulator;
  }, {});

  return {
    totalFiles: taggedRows.length + skippedRows.length,
    winnerRows: taggedRows.length,
    skippedRows: skippedRows.length,
    seasonCount: statsBySeason.size,
    statusCount: {
      ok: summaryByStatus.ok || 0,
      review: summaryByStatus.review || 0,
      exclude: summaryByStatus.exclude || 0,
    },
    rules: {
      seasonScope: 'season_internal_only',
      metric: 'sum(winner.pets[*][2])',
      excludeRatioToSeasonMedian: EXCLUDE_RATIO_TO_SEASON_MEDIAN,
      reviewRatioToSeasonMedian: REVIEW_RATIO_TO_SEASON_MEDIAN,
      outlierIqrMultiplier: OUTLIER_IQR_MULTIPLIER,
      reviewQuantile: REVIEW_QUANTILE,
    },
  };
}

function main() {
  assert(fs.existsSync(HISTORY_DIR), `History directory does not exist: ${HISTORY_DIR}`);
  assert(fs.existsSync(PET_TABLE_FILE), `Pet table file does not exist: ${PET_TABLE_FILE}`);

  const petTable = loadJson(PET_TABLE_FILE);
  assert(Array.isArray(petTable), `Pet table is not an array: ${PET_TABLE_FILE}`);

  const petNameById = new Map();
  for (const pet of petTable) {
    assert(pet && typeof pet === 'object', 'Pet table contains an invalid row');
    assert(Number.isFinite(Number(pet.id)), 'Pet table row is missing numeric id');
    petNameById.set(Number(pet.id), pet.name || null);
  }

  const fileNames = fs.readdirSync(HISTORY_DIR)
    .filter(fileName => fileName.endsWith('.json'))
    .sort((left, right) => {
      const leftMatch = left.match(FILE_NAME_PATTERN);
      const rightMatch = right.match(FILE_NAME_PATTERN);
      assert(leftMatch, `Unexpected history file name: ${left}`);
      assert(rightMatch, `Unexpected history file name: ${right}`);
      return Number(leftMatch[1]) - Number(rightMatch[1]) || Number(leftMatch[2]) - Number(rightMatch[2]);
    });

  const parsedRows = fileNames.map(fileName => {
    const filePath = path.join(HISTORY_DIR, fileName);
    return parseHistoryRow(fileName, filePath, petNameById);
  });

  const skippedRows = parsedRows.filter(row => row.skipped);
  const winnerRows = parsedRows.filter(row => !row.skipped);
  assert(winnerRows.length > 0, 'No winner rows found in pet arena history');

  const statsBySeason = buildSeasonStats(winnerRows);
  const taggedRows = tagRows(winnerRows, statsBySeason);
  const seasonStats = [...statsBySeason.values()];

  const anomalyRows = taggedRows
    .filter(row => row.status !== 'ok')
    .sort((left, right) => {
      return left.season - right.season
        || left.status.localeCompare(right.status)
        || left.ratioToSeasonMedian - right.ratioToSeasonMedian
        || left.group - right.group;
    });

  const cleanedRows = taggedRows.filter(row => row.status !== 'exclude');

  saveOutput('pet_arena_history_pet_power_analysis', {
    summary: buildSummary(taggedRows, skippedRows, statsBySeason),
    seasonStats,
    anomalies: anomalyRows,
    skippedRows,
  }, {
    system: 'pet arena history',
    source: 'data/pet-arena-history-raw/*.json',
    metric: 'winner.pets[*][2] sum only',
    scope: 'season internal only',
  });

  saveOutput('pet_arena_history_pet_power_cleaned', {
    summary: {
      totalWinnerRows: taggedRows.length,
      keptRows: cleanedRows.length,
      excludedRows: taggedRows.length - cleanedRows.length,
    },
    rows: cleanedRows,
  }, {
    system: 'pet arena history',
    source: 'data/pet-arena-history-raw/*.json',
    metric: 'winner.pets[*][2] sum only',
    scope: 'season internal only',
  });
}

main();
