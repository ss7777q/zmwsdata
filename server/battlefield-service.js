const fs = require('fs');
const path = require('path');

const DATA_API_DIR = path.resolve(__dirname, '..', 'dataApi');

const HEROES = [
  { name: '孙悟空', baseId: '1' },
  { name: '唐三藏', baseId: '2' },
  { name: '猪八戒', baseId: '3' },
  { name: '沙悟净', baseId: '4' },
  { name: '敖雪', baseId: '5' },
  { name: '敖烈', baseId: '6' },
  { name: '萧嫣', baseId: '7' },
  { name: '杨戬', baseId: '8' },
  { name: '玄女', baseId: '9' },

];

const MOUNTS = [
  { name: '哮天犬', baseId: '241001' },
  { name: '年兽', baseId: '201071' },
  { name: '汪汪', baseId: '201091' },
  { name: '海马', baseId: '201011' },
  { name: '地狱马', baseId: '201021' },
  { name: '避水金睛兽', baseId: '201031' },
  { name: '胖呆', baseId: '201051' },
  { name: '极寒天马', baseId: '201061' },
  { name: '梼杌', baseId: '201101' },
  { name: '辟邪', baseId: '201701' },
  { name: '神鸟系列', baseId: '201201' },
  { name: '谛听', baseId: '201301' },
  { name: '烈焰天马', baseId: '201401' },
  { name: '混沌', baseId: '201501' },
  { name: '金毛犼', baseId: '201602'},
  { name: '青狮', baseId: '201801'}
];

const DEMON_KINGS = [
  { name: '山鬼', baseId: '213010' },
  { name: '刑天', baseId: '213020' },
  { name: '夸父', baseId: '213030' },
  { name: '后羿', baseId: '213040' },
  { name: '虐鬼·季禺', baseId: '213160' },
  { name: '太子长琴', baseId: '213180' },
  { name: '逄蒙', baseId: '213200' },
  { name: '鲧', baseId: '213220' },
  { name: '骄虫', baseId: '213300' },
  { name: '精卫', baseId: '213340' },
  {name: '蚩尤', baseId:'213390'},
];

const SPECIALS = {
  nuBa: { name: '中立', baseId: '21312' },
  crystal: { name: '水晶' },
};

const FULL_STAT_FIELDS = [
  'hp',
  'atk',
  'def',
  'healHp',
  'mp',
  'healMp',
  'hitVal',
  'dodge',
  'crit',
  'tenacity',
  'lucky',
  'guardian',
  'break',
  'protect',
];

const REDUCED_STAT_FIELDS = [
  'hp',
  'atk',
  'def',
  'healHp',
  'hitVal',
  'dodge',
  'crit',
  'tenacity',
  'lucky',
  'guardian',
  'break',
  'protect',
];

const EMPTY_STATS = Object.freeze({
  hp: null,
  atk: null,
  def: null,
  healHp: null,
  mp: null,
  healMp: null,
  hitVal: null,
  dodge: null,
  crit: null,
  tenacity: null,
  lucky: null,
  guardian: null,
  break: null,
  protect: null,
});

const GOD_WAR_SCALE_FIELD_BY_STAT = {
  hp: 'hpGod',
  atk: 'atkGod',
  def: 'defGod',
  healHp: 'healHpGod',
  hitVal: 'hitValGod',
  dodge: 'dodgeGod',
  crit: 'critGod',
  tenacity: 'tenacityGod',
  lucky: 'luckyGod',
  guardian: 'guardianGod',
  break: 'breakGod',
  protect: 'protectGod',
};

const BATTLEFIELD_TIER_MIN = 1;
const BATTLEFIELD_LEVEL_MIN = 70;
const DEFAULT_STAR_LEVEL = 8;
const DEFAULT_BOSS_STAGE = 6;

function findJsonFile(directoryPath, prefix) {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exactTableFilePattern = new RegExp(`^${escapedPrefix}(?:\\.[^.]+)?\\.json$`, 'i');
  const matchedFileNames = fs.readdirSync(directoryPath).filter((fileName) => {
    const lowerFileName = fileName.toLowerCase();
    return lowerFileName.endsWith('.json') && exactTableFilePattern.test(fileName);
  });

  if (matchedFileNames.length === 0) {
    throw new Error(`Cannot find dataApi JSON for prefix ${prefix} under ${directoryPath}`);
  }

  if (matchedFileNames.length > 1) {
    throw new Error(`Multiple dataApi JSON files found for prefix ${prefix} under ${directoryPath}: ${matchedFileNames.join(', ')}`);
  }

  return path.join(directoryPath, matchedFileNames[0]);
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function indexById(rows) {
  return rows.reduce((result, row) => {
    result.set(String(row.id), row);
    return result;
  }, new Map());
}

function loadBattlefieldDataApi(dataApiDir = DATA_API_DIR) {
  const monsterFilePath = findJsonFile(dataApiDir, 'monster');
  const monsterAttributeFilePath = findJsonFile(dataApiDir, 'monsterAttribute');
  const godWarAttributeFilePath = findJsonFile(dataApiDir, 'godWarAttribute');
  const godWarCrystalFilePath = findJsonFile(dataApiDir, 'godWarCrystal');

  const monsterRows = loadJson(monsterFilePath);
  const monsterAttributeRows = loadJson(monsterAttributeFilePath);
  const godWarAttributeRows = loadJson(godWarAttributeFilePath);
  const godWarCrystalRows = loadJson(godWarCrystalFilePath);

  return {
    dataApiDir,
    files: {
      monster: monsterFilePath,
      monsterAttribute: monsterAttributeFilePath,
      godWarAttribute: godWarAttributeFilePath,
      godWarCrystal: godWarCrystalFilePath,
    },
    monsterById: indexById(monsterRows),
    monsterAttributeById: indexById(monsterAttributeRows),
    godWarAttributeById: indexById(godWarAttributeRows),
    godWarCrystalById: indexById(godWarCrystalRows),
  };
}

function toInteger(value, fieldName) {
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue)) {
    throw new Error(`${fieldName} must be an integer, received ${value}`);
  }
  return parsedValue;
}

function excelRound(value) {
  return roundFraction(parseDecimal(value), 'halfUp');
}

function excelRoundUp(value) {
  return roundFraction(parseDecimal(value), 'up');
}

function parseDecimal(value) {
  if (value && typeof value === 'object' && 'numerator' in value && 'scale' in value) {
    return value;
  }

  const raw = typeof value === 'string' ? value.trim() : String(value);
  if (!raw) {
    return { numerator: 0n, scale: 0 };
  }

  let sign = 1n;
  let normalized = raw;
  if (normalized.startsWith('-')) {
    sign = -1n;
    normalized = normalized.slice(1);
  } else if (normalized.startsWith('+')) {
    normalized = normalized.slice(1);
  }

  let exponent = 0;
  if (/[eE]/.test(normalized)) {
    const parts = normalized.split(/[eE]/);
    normalized = parts[0];
    exponent = Number(parts[1] || 0);
  }

  const pieces = normalized.split('.');
  const integerPart = pieces[0] || '0';
  const decimalPart = pieces[1] || '';
  const digits = `${integerPart}${decimalPart}`.replace(/^0+(?=\d)/, '') || '0';
  const scale = Math.max(decimalPart.length - exponent, 0);
  const numerator = BigInt(digits + '0'.repeat(Math.max(exponent - decimalPart.length, 0)));
  return { numerator: numerator * sign, scale };
}

function multiplyDecimals(left, right) {
  const leftDecimal = parseDecimal(left);
  const rightDecimal = parseDecimal(right);
  return {
    numerator: leftDecimal.numerator * rightDecimal.numerator,
    scale: leftDecimal.scale + rightDecimal.scale,
  };
}

function fractionToNumber(decimal) {
  return Number(decimal.numerator) / (10 ** decimal.scale);
}

function roundFraction(decimal, mode) {
  if (decimal.scale === 0) {
    return Number(decimal.numerator);
  }

  const divisor = 10n ** BigInt(decimal.scale);
  const negative = decimal.numerator < 0n;
  const absolute = negative ? -decimal.numerator : decimal.numerator;
  let quotient = absolute / divisor;
  const remainder = absolute % divisor;

  if (mode === 'up' && remainder > 0n) {
    quotient += 1n;
  }
  if (mode === 'halfUp' && remainder * 2n >= divisor) {
    quotient += 1n;
  }

  return Number(negative ? -quotient : quotient);
}

function mergeStats(partialStats) {
  return {
    ...EMPTY_STATS,
    ...partialStats,
  };
}

function buildAvailableBossStages(monsterById) {
  const stageGroups = DEMON_KINGS.map(({ baseId }) => {
    const stages = new Set();

    for (const monsterId of monsterById.keys()) {
      if (monsterId.startsWith(baseId) && monsterId.length === baseId.length + 1) {
        stages.add(Number(monsterId.slice(baseId.length)));
      }
    }

    return stages;
  });

  return [...stageGroups[0]]
    .filter((stage) => stageGroups.every((currentStages) => currentStages.has(stage)))
    .sort((left, right) => left - right);
}

function buildAvailableBattlefieldTiers(data) {
  const monsterAttributeLevels = [...data.monsterAttributeById.keys()].map(Number);
  const godWarAttributeLevels = [...data.godWarAttributeById.keys()].map(Number);
  const godWarCrystalLevels = [...data.godWarCrystalById.keys()].map(Number);
  const maxSupportedLevel = Math.min(
    Math.max(...monsterAttributeLevels),
    Math.max(...godWarAttributeLevels),
    Math.max(...godWarCrystalLevels)
  );
  const candidateTierMax = Math.max(BATTLEFIELD_TIER_MIN, Math.floor(maxSupportedLevel / 10) - 6);

  return Array.from(
    { length: candidateTierMax - BATTLEFIELD_TIER_MIN + 1 },
    (_, index) => index + BATTLEFIELD_TIER_MIN
  ).filter((tier) => {
    const battlefieldLevel = (tier + 6) * 10;
    const battlefieldSuffix = String(tier + 6).padStart(2, '0');
    const hasAttributeRows =
      data.monsterAttributeById.has(String(battlefieldLevel)) &&
      data.godWarAttributeById.has(String(battlefieldLevel)) &&
      data.godWarCrystalById.has(String(battlefieldLevel));
    const hasHeroRows = HEROES.every(({ baseId }) => data.monsterById.has(`1${baseId}${battlefieldSuffix}`));
    const hasMountRows = MOUNTS.every(({ baseId }) => data.monsterById.has(`${baseId}${battlefieldSuffix}`));
    const hasNuBaRow = data.monsterById.has(`${SPECIALS.nuBa.baseId}${battlefieldSuffix}`);

    return hasAttributeRows && hasHeroRows && hasMountRows && hasNuBaRow;
  });
}

function normaliseInput(params = {}, availableBossStages, availableBattlefieldTiers) {
  const defaultBattlefieldTier = availableBattlefieldTiers[availableBattlefieldTiers.length - 1];
  const resolvedTier = params.battlefieldTier == null
    ? params.battlefieldLevel == null
      ? defaultBattlefieldTier
      : toInteger(Number(params.battlefieldLevel) / 10 - 6, 'battlefieldLevel')
    : toInteger(params.battlefieldTier, 'battlefieldTier');

  if (!availableBattlefieldTiers.includes(resolvedTier)) {
    throw new Error(`battlefieldTier must be one of: ${availableBattlefieldTiers.join(', ')}`);
  }

  const battlefieldLevel = (resolvedTier + 6) * 10;
  if (battlefieldLevel < BATTLEFIELD_LEVEL_MIN) {
    throw new Error(`battlefieldLevel must be at least ${BATTLEFIELD_LEVEL_MIN}`);
  }

  const starLevel = params.starLevel == null ? DEFAULT_STAR_LEVEL : toInteger(params.starLevel, 'starLevel');
  if (starLevel < 0) {
    throw new Error('starLevel must be at least 0');
  }

  const bossStage = params.bossStage == null ? DEFAULT_BOSS_STAGE : toInteger(params.bossStage, 'bossStage');
  if (!availableBossStages.includes(bossStage)) {
    throw new Error(`bossStage must be one of: ${availableBossStages.join(', ')}`);
  }

  return {
    battlefieldTier: resolvedTier,
    battlefieldLevel,
    battlefieldSuffix: String(resolvedTier + 6).padStart(2, '0'),
    battlefieldLabel: `${resolvedTier}阶战场`,
    starLevel,
    starMultiplier: 1 + (starLevel - 1) * 0.05,
    bossStage,
  };
}

function readRequiredRow(index, id, label) {
  const row = index.get(String(id));
  if (!row) {
    throw new Error(`${label} lookup failed for id ${id}`);
  }
  return row;
}

function calculateScaledStats({ monsterRow, scaleRow, fields, starMultiplier, scaleFieldByStat = {} }) {
  return fields.reduce((result, field) => {
    const scaleField = scaleFieldByStat[field] || field;
    const baseValue = multiplyDecimals(monsterRow[field], scaleRow[scaleField]);
    const roundedBaseValue = excelRound(baseValue);
    result[field] = starMultiplier == null
      ? roundedBaseValue
      : excelRoundUp(multiplyDecimals(roundedBaseValue, starMultiplier));
    return result;
  }, {});
}

function calculateGodWarStats({ monsterRow, scaleRow }) {
  return REDUCED_STAT_FIELDS.reduce((result, field) => {
    const scaleField = GOD_WAR_SCALE_FIELD_BY_STAT[field];
    const baseValue = multiplyDecimals(monsterRow[field], scaleRow[scaleField]);
    result[field] = excelRound(baseValue);
    return result;
  }, {});
}

function calculateCrystalStats(scaleRow) {
  return REDUCED_STAT_FIELDS.reduce((result, field) => {
    result[field] = Number(scaleRow[field]);
    return result;
  }, {});
}

function createPower(stats, options) {
  const output = options.includeMagic
    ? stats.atk * 10 + stats.mp * 2 + stats.healMp * 36 + stats.hitVal * 5 + stats.crit * 5 + stats.lucky * 5 + stats.break * 10
    : stats.atk * 10 + stats.hitVal * 5 + stats.crit * 5 + stats.lucky * 5 + stats.break * 10;

  const defense =
    (options.includeHp ? stats.hp : 0) +
    stats.def * 30 +
    stats.healHp * 18 +
    stats.dodge * 5 +
    stats.tenacity * 5 +
    stats.guardian * 5 +
    stats.protect * 10;

  return {
    output: excelRound(output),
    defense: excelRound(defense),
    total: excelRound(output + defense),
  };
}

function buildUnit({ category, camp, name, baseId, entityId, speed, stats, power }) {
  return {
    category,
    camp,
    name,
    baseId,
    entityId,
    speed,
    stats: mergeStats(stats),
    power: power || null,
  };
}

function calculateHero(service, input, hero) {
  const entityId = `1${hero.baseId}${input.battlefieldSuffix}`;
  const monsterRow = readRequiredRow(service.data.monsterById, entityId, 'monster');
  const attributeRow = readRequiredRow(service.data.monsterAttributeById, input.battlefieldLevel, 'monsterAttribute');
  const stats = calculateScaledStats({
    monsterRow,
    scaleRow: attributeRow,
    fields: FULL_STAT_FIELDS,
    starMultiplier: input.starMultiplier,
  });

  return buildUnit({
    category: 'hero',
    camp: '神将',
    name: hero.name,
    baseId: hero.baseId,
    entityId,
    speed: Number(monsterRow.spd),
    stats,
    power: createPower(stats, { includeMagic: true, includeHp: true }),
  });
}

function calculateMount(service, input, mount) {
  const entityId = `${mount.baseId}${input.battlefieldSuffix}`;
  const monsterRow = readRequiredRow(service.data.monsterById, entityId, 'monster');
  const attributeRow = readRequiredRow(service.data.monsterAttributeById, input.battlefieldLevel, 'monsterAttribute');
  const stats = calculateScaledStats({
    monsterRow,
    scaleRow: attributeRow,
    fields: REDUCED_STAT_FIELDS,
    starMultiplier: input.starMultiplier,
  });

  return buildUnit({
    category: 'mount',
    camp: '坐骑',
    name: mount.name,
    baseId: mount.baseId,
    entityId,
    speed: Number(monsterRow.spd),
    stats,
    power: createPower(stats, { includeMagic: false, includeHp: true }),
  });
}

function calculateDemonKing(service, input, demonKing) {
  const entityId = `${demonKing.baseId}${input.bossStage}`;
  const monsterRow = readRequiredRow(service.data.monsterById, entityId, 'monster');
  const attributeRow = readRequiredRow(service.data.godWarAttributeById, input.battlefieldLevel, 'godWarAttribute');
  const stats = calculateGodWarStats({ monsterRow, scaleRow: attributeRow });

  return buildUnit({
    category: 'demonKing',
    camp: '魔王',
    name: demonKing.name,
    baseId: demonKing.baseId,
    entityId,
    speed: Number(monsterRow.spd),
    stats,
    power: createPower(stats, { includeMagic: false, includeHp: false }),
  });
}

function calculateNuBa(service, input) {
  const entityId = `${SPECIALS.nuBa.baseId}${input.battlefieldSuffix}`;
  const monsterRow = readRequiredRow(service.data.monsterById, entityId, 'monster');
  const attributeRow = readRequiredRow(service.data.monsterAttributeById, input.battlefieldLevel, 'monsterAttribute');
  const stats = calculateScaledStats({
    monsterRow,
    scaleRow: attributeRow,
    fields: REDUCED_STAT_FIELDS,
    starMultiplier: null,
  });

  return buildUnit({
    category: 'special',
    camp: '特殊',
    name: SPECIALS.nuBa.name,
    baseId: SPECIALS.nuBa.baseId,
    entityId,
    speed: '不会动',
    stats,
    power: null,
  });
}

function calculateCrystal(service, input) {
  const crystalRow = readRequiredRow(service.data.godWarCrystalById, input.battlefieldLevel, 'godWarCrystal');
  const stats = calculateCrystalStats(crystalRow);

  return buildUnit({
    category: 'special',
    camp: '特殊',
    name: SPECIALS.crystal.name,
    baseId: null,
    entityId: null,
    speed: null,
    stats,
    power: null,
  });
}

function createBattlefieldService(options = {}) {
  const data = loadBattlefieldDataApi(options.dataApiDir);
  const availableBossStages = buildAvailableBossStages(data.monsterById);
  const availableBattlefieldTiers = buildAvailableBattlefieldTiers(data);

  return {
    data,
    availableBossStages,
    availableBattlefieldTiers,
    getConfig() {
      return {
        source: {
          type: 'dataApi',
          dataApiDir: data.dataApiDir,
          files: data.files,
        },
        selectors: {
          battlefieldTier: {
            min: availableBattlefieldTiers[0],
            max: availableBattlefieldTiers[availableBattlefieldTiers.length - 1],
            values: availableBattlefieldTiers,
            default: availableBattlefieldTiers[availableBattlefieldTiers.length - 1],
          },
          starLevel: {
            min: 0,
            default: DEFAULT_STAR_LEVEL,
          },
          bossStage: {
            values: availableBossStages,
            default: DEFAULT_BOSS_STAGE,
          },
        },
        rosters: {
          heroes: HEROES,
          mounts: MOUNTS,
          demonKings: DEMON_KINGS,
          specials: SPECIALS,
        },
      };
    },
    calculate(params = {}) {
      const input = normaliseInput(params, availableBossStages, availableBattlefieldTiers);
      const heroes = HEROES.map((hero) => calculateHero(this, input, hero));
      const mounts = MOUNTS.map((mount) => calculateMount(this, input, mount));
      const demonKings = DEMON_KINGS.map((demonKing) => calculateDemonKing(this, input, demonKing));
      const specials = {
        nuBa: calculateNuBa(this, input),
        crystal: calculateCrystal(this, input),
      };

      return {
        meta: {
          source: 'dataApi',
          battlefieldTier: input.battlefieldTier,
          battlefieldLevel: input.battlefieldLevel,
          battlefieldLabel: input.battlefieldLabel,
          battlefieldSuffix: input.battlefieldSuffix,
          starLevel: input.starLevel,
          starMultiplier: input.starMultiplier,
          bossStage: input.bossStage,
          availableBossStages,
          availableBattlefieldTiers,
          sourceFiles: data.files,
        },
        heroes,
        mounts,
        demonKings,
        specials,
        allUnits: [...heroes, ...mounts, ...demonKings, specials.nuBa, specials.crystal],
      };
    },
  };
}

module.exports = {
  FULL_STAT_FIELDS,
  REDUCED_STAT_FIELDS,
  createBattlefieldService,
};
