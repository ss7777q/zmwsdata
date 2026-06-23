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

function indexById(rows) {
  return rows.reduce((result, row) => {
    result.set(String(row.id), row);
    return result;
  }, new Map());
}

function toInteger(value, fieldName) {
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue)) {
    throw new Error(`${fieldName} must be an integer, received ${value}`);
  }
  return parsedValue;
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

function excelRound(value) {
  return roundFraction(parseDecimal(value), 'halfUp');
}

function excelRoundUp(value) {
  return roundFraction(parseDecimal(value), 'up');
}

function mergeStats(partialStats) {
  return {
    ...EMPTY_STATS,
    ...partialStats,
  };
}

function buildAvailableBossStages(monsterById, demonKings) {
  const stageGroups = demonKings.map(({ baseId }) => {
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

function buildAvailableBattlefieldTiers(data, rosters) {
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
    const hasHeroRows = rosters.heroes.every(({ baseId }) => data.monsterById.has(`1${baseId}${battlefieldSuffix}`));
    const hasMountRows = rosters.mounts.every(({ baseId }) => data.monsterById.has(`${baseId}${battlefieldSuffix}`));
    const hasNuBaRow = data.monsterById.has(`${rosters.specials.nuBa.baseId}${battlefieldSuffix}`);

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
  const entityId = `${service.rosters.specials.nuBa.baseId}${input.battlefieldSuffix}`;
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
    name: service.rosters.specials.nuBa.name,
    baseId: service.rosters.specials.nuBa.baseId,
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
    name: service.rosters.specials.crystal.name,
    baseId: null,
    entityId: null,
    speed: null,
    stats,
    power: null,
  });
}

export function createBattlefieldService(source) {
  const rosters = source.data.rosters;
  const data = {
    sourceFiles: source._meta.sourceFiles,
    monsterById: indexById(source.data.monsterRows),
    monsterAttributeById: indexById(source.data.monsterAttributeRows),
    godWarAttributeById: indexById(source.data.godWarAttributeRows),
    godWarCrystalById: indexById(source.data.godWarCrystalRows),
  };
  const availableBossStages = buildAvailableBossStages(data.monsterById, rosters.demonKings);
  const availableBattlefieldTiers = buildAvailableBattlefieldTiers(data, rosters);

  return {
    data,
    rosters,
    availableBossStages,
    availableBattlefieldTiers,
    getConfig() {
      return {
        source: {
          type: 'cloudflare-pages-function',
          files: data.sourceFiles,
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
        rosters,
      };
    },
    calculate(params = {}) {
      const input = normaliseInput(params, availableBossStages, availableBattlefieldTiers);
      const heroes = rosters.heroes.map((hero) => calculateHero(this, input, hero));
      const mounts = rosters.mounts.map((mount) => calculateMount(this, input, mount));
      const demonKings = rosters.demonKings.map((demonKing) => calculateDemonKing(this, input, demonKing));
      const specials = {
        nuBa: calculateNuBa(this, input),
        crystal: calculateCrystal(this, input),
      };

      return {
        meta: {
          source: 'cloudflare-pages-function',
          battlefieldTier: input.battlefieldTier,
          battlefieldLevel: input.battlefieldLevel,
          battlefieldLabel: input.battlefieldLabel,
          battlefieldSuffix: input.battlefieldSuffix,
          starLevel: input.starLevel,
          starMultiplier: input.starMultiplier,
          bossStage: input.bossStage,
          availableBossStages,
          availableBattlefieldTiers,
          sourceFiles: data.sourceFiles,
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
