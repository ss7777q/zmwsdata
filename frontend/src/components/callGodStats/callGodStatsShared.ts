import { METRIC_COLORS } from '../../lib/boss-stats';

export const STAT_COLORS: Record<string, string> = {
  ...METRIC_COLORS,
  mp: 'text-blue-500',
  healMp: 'text-indigo-400',
  speed: 'text-amber-400',
};

export const FRAMES_PER_SECOND = 30;

export interface Props {
  dataSources: Record<string, unknown>;
}

export type NullableNumber = number | null;

export interface BattlefieldUnitStats {
  hp: NullableNumber;
  atk: NullableNumber;
  def: NullableNumber;
  healHp: NullableNumber;
  mp: NullableNumber;
  healMp: NullableNumber;
  hitVal: NullableNumber;
  dodge: NullableNumber;
  crit: NullableNumber;
  tenacity: NullableNumber;
  lucky: NullableNumber;
  guardian: NullableNumber;
  break: NullableNumber;
  protect: NullableNumber;
}

export interface BattlefieldPower {
  output: number;
  defense: number;
  total: number;
}

export interface BattlefieldUnit {
  category: string;
  camp: string;
  name: string;
  baseId: string | null;
  entityId: string | null;
  speed: number | string | null;
  stats: BattlefieldUnitStats;
  power: BattlefieldPower | null;
}

export interface BattlefieldConfig {
  source: {
    files: Record<string, string>;
  };
  selectors: {
    battlefieldTier: {
      values: number[];
      default?: number;
    };
    starLevel: {
      min: number;
      default: number;
    };
    bossStage: {
      values: number[];
      default: number;
    };
  };
}

export interface BattlefieldResult {
  meta: {
    battlefieldTier: number;
    battlefieldLevel: number;
    battlefieldLabel: string;
    starLevel: number;
    bossStage: number;
    sourceFiles: Record<string, string>;
  };
  heroes: BattlefieldUnit[];
  mounts: BattlefieldUnit[];
  demonKings: BattlefieldUnit[];
  specials: {
    nuBa: BattlefieldUnit;
    crystal: BattlefieldUnit;
  };
  allUnits: BattlefieldUnit[];
}

export interface StoneRewardMatchedSource {
  count: number;
  mode: 'dropGroup' | 'drop' | 'direct' | 'unknown';
  sourceCode: number;
}

export interface StoneRewardEntry {
  threshold: number;
  stoneCount: number;
  matchedSources: StoneRewardMatchedSource[];
  rawValue: unknown;
}

export interface StoneRewardTier {
  rewardLv: number;
  battlefieldLv: number;
  stageId: number;
  stageName: string;
  rewards: Record<string, StoneRewardEntry[]>;
}

export interface StoneRewardLine {
  key: string;
  camp: 'god' | 'devil';
  label: string;
  thresholdLabel: string;
  description: string;
  itemId: number;
  stoneName: string;
}

export interface StoneRewardPayload {
  stones: {
    god: { id: number; name: string };
    devil: { id: number; name: string };
  };
  rewardLines: StoneRewardLine[];
  tiers: StoneRewardTier[];
  lineMetaByKey: Record<string, {
    label: string;
    thresholdLabel: string;
    camp: 'god' | 'devil';
    description: string;
    stoneItemId: number;
  }>;
  tables: {
    reward_plunder_blessing: {
      rewardKey: string;
      thresholdLabel: string;
      thresholds: number[];
      rows: Array<{
        rewardLv: number;
        stageName: string;
        battlefieldLv: number;
        values: Record<string, number>;
      }>;
    };
    saveGodStoneReward: {
      rewardKey: string;
      thresholdLabel: string;
      thresholds: number[];
      rows: Array<{
        rewardLv: number;
        stageName: string;
        battlefieldLv: number;
        values: Record<string, number>;
      }>;
    };
    devilStoneMatrixByTier: Record<string, {
      rewardLv: number;
      stageName: string;
      battlefieldLv: number;
      killThresholds: number[];
      remainingMineThresholds: number[];
      rows: Array<{
        remainingMine: number;
        values: Record<string, number>;
      }>;
    }>;
  };
}

export interface StageLimitValue {
  key: string;
  label: string;
  value: number;
}

export interface StageLimitPayload {
  sources: {
    battlefieldTiers: string;
    specialStages: string;
    entityOverrides: string;
    demonKings: string;
  };
  battlefieldTiers: Array<{
    id: number;
    battlefield: number;
    rewardLv: number;
    name: string;
    battlefieldLevel: number;
    limits: StageLimitValue[];
    devilLimits: Array<{
      groupId: number;
      name: string;
      value: number;
    }>;
  }>;
  specialStages: Array<{
    id: number;
    name: string;
    type: number;
    subType: number;
    limits: StageLimitValue[];
  }>;
  entityOverrides: Array<{
    id: number;
    name: string;
    type: string;
    subTypes: number[];
    stageNames: string[];
    limits: StageLimitValue[];
  }>;
}

export interface BossMechanismSource {
  id?: number;
  name?: string;
  text?: string;
  durationFrames?: number | null;
  intervalFrames?: number | null;
  maxStacks?: number | null;
}

export interface BossMechanismEntry {
  type: string;
  text: string;
  source?: BossMechanismSource;
}

export interface BossDamageSegment {
  bulletId: number;
  bulletAction: string;
  frame: number | null;
  maxHit: number | null;
  interval: number | null;
  damage: {
    atkper?: number | null;
    coefficient: number | null;
    coefficientText: string;
    fixedDamage: 0;
  } | null;
}

export interface BossSkillAnalysis {
  id: number;
  missing?: boolean;
  category: string;
  showAsSkillCard?: boolean;
  name: string;
  actionName: string | null;
  cooldownSeconds?: number | null;
  cooldownFrames?: number | null;
  loopTimeFrames: number | null;
  actionFrames: number | null;
  atkper?: number | null;
  coefficientPerHit: number | null;
  coefficientPerHitText: string;
  fixedDamage: 0;
  confirmedHits: number;
  totalCoefficient: number | null;
  totalCoefficientText: string;
  damageDisplay?: {
    formula?: string;
    total?: string;
    timing?: string;
    breakdown?: Array<{ label: string; text: string; detail?: string }>;
    hideAutoBreakdown?: boolean;
  };
  damageSegments: BossDamageSegment[];
  mechanics: BossMechanismEntry[];
  linkedSkills: BossSkillAnalysis[];
  warnings: string[];
  mechanismOverride?: { covered: boolean };
}

export interface BossFashionAnalysis {
  id: number;
  name: string;
  description: string;
  permanentOptions: boolean;
  effects: BossEffectBrief[];
}

export interface BossEffectBrief {
  id: number;
  name: string;
  description: string;
  text?: string;
}

export interface BossTalentAnalysis {
  talentGroup: number;
  name: string;
  unlockStageRange: number[] | null;
  maxLevel: number;
  effects: BossEffectBrief[];
  levels: Array<{
    level: number;
    cost: number;
    text: string;
    stages: number[];
  }>;
}

export interface BossAnalysisEntry {
  groupId: number | string;
  name: string;
  description?: string;
  primaryBossRowId?: number | null;
  primaryMonsterId?: number | null;
  cfgFile?: string | null;
  damageRule?: string;
  levelRows?: Array<{
    id: number;
    level: number;
    hard: number;
    monsterIds: number[];
    mateCorrect: number | null;
    rankCost: unknown;
  }>;
  baseMechanisms?: BossMechanismEntry[];
  skills?: BossSkillAnalysis[];
  internalSkills?: BossSkillAnalysis[];
  fashions?: BossFashionAnalysis[];
  warnings?: string[];
  mechanismOverride?: { covered: boolean };
}

export interface BossCommonSkillFact {
  label: string;
  value: string;
}

export interface BossCommonSkillDamage {
  skillId: number;
  skillName: string;
  formula: string;
  total: string | null;
  hitBuffIds?: number[];
  impactTags?: string[];
}

export interface BossCommonSkillSummon {
  id: number;
  name: string;
  effects: string[];
  damage: BossCommonSkillDamage[];
  warnings?: string[];
}

export interface BossCommonSkillAnalysis {
  id: number;
  sort: number;
  group: number;
  name: string;
  icon: number;
  officialText: string;
  playerText: string;
  facts: BossCommonSkillFact[];
  actionEffects: string[];
  summonEvents: Array<{
    monsterIds: number[];
    maxCount: number | null;
    lifetimeSeconds: number | null;
  }>;
  summons: BossCommonSkillSummon[];
  teleportEffects: string[];
  source?: {
    monsterId: number | null;
    skillId: number | null;
  };
  warnings?: string[];
}

export interface OutputDataFile<T> {
  data?: T;
}

export const TABLE_COLUMNS = [
  { key: 'name', label: '名称' },
  { key: 'camp', label: '阵营' },
  { key: 'hp', label: '生命', stat: true },
  { key: 'atk', label: '攻击', stat: true },
  { key: 'def', label: '防御', stat: true },
  { key: 'healHp', label: '回血', stat: true },
  { key: 'mp', label: '魔法', stat: true },
  { key: 'healMp', label: '回魔', stat: true },
  { key: 'hitVal', label: '命中', stat: true },
  { key: 'dodge', label: '闪避', stat: true },
  { key: 'crit', label: '暴击', stat: true },
  { key: 'tenacity', label: '韧性', stat: true },
  { key: 'lucky', label: '幸运', stat: true },
  { key: 'guardian', label: '守护', stat: true },
  { key: 'break', label: '穿透', stat: true },
  { key: 'protect', label: '减伤', stat: true },
  { key: 'speed', label: '移速' },
  { key: 'output', label: '输出总战', power: 'output' as const },
  { key: 'defense', label: '防御总战', power: 'defense' as const },
  { key: 'total', label: '总战力', power: 'total' as const },
];

export function formatNumber(value: number | string | null | undefined) {
  if (value == null || value === '') return '-';
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return String(value);
  return numberValue.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}
