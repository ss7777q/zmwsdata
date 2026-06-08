export type BossProps = Record<string, number | null | undefined>;

export type ResistanceEntry = {
  id: number;
  value: number;
  label?: string | null;
};

export type BossFormula = {
  coefficients?: Record<string, [number, number]>;
  hpRate?: number;
};

export interface BossEntry {
  id: number | string;
  bossId?: number | string;
  name?: string;
  remark?: string;
  level?: number;
  resistEntries?: ResistanceEntry[];
  resistRoleEntries?: ResistanceEntry[];
  resistRolePvpEntries?: ResistanceEntry[];
  calculatedProps?: BossProps;
  calculatedPropsDouble?: BossProps;
  creatorId?: string | null;
  screen?: number | null;
  source?: string;
  sourceField?: string;
  error?: string;
  calcFormula?: BossFormula;
}

export interface StageReport {
  stageId: number | string;
  stageName: string;
  stageLv?: number;
  type?: number | string | null;
  subType?: number | string | null;
  mapName?: string | string[];
  source?: string;
  status?: string;
  description?: string;
  stageDesc?: string;
  levelOverride?: {
    supported?: boolean;
    defaultLevel?: number;
    minLevel?: number;
    maxLevel?: number;
  };
  illusion?: {
    finalStorey?: number;
    finalRogueId?: number;
    finalRogueName?: string;
    finalBossStageId?: number;
    finalBossStageName?: string;
    finalBossMap?: string | null;
    storeys?: Array<{
      storey: number;
      rogueIds: number[];
      rogueNames: string[];
      bossLevel?: number[] | null;
    }>;
  };
  bossData: BossEntry[];
}

export interface BossTypeGroup {
  type?: number | string | null;
  label?: string;
  slug?: string;
  stageCount: number;
  bossCount: number;
  subTypes: Array<number | string>;
  stages: StageReport[];
  supportsLevelOverride?: boolean;
  levelOverrideMode?: 'input' | 'preset';
  defaultLevel?: number;
  levelOptions?: number[];
  levelTemplates?: Record<string, BossProps>;
  levelRange?: {
    min?: number;
    max?: number;
  };
  noteText?: string;
}

export interface FlattenedBoss extends BossEntry {
  stageId: number | string;
  stageName: string;
  stageLv?: number;
  mapName?: string | string[];
  type?: number | string | null;
  typeLabel?: string;
}

export const PAGE_SIZE = 50;

export const METRIC_LABELS: Record<string, string> = {
  hp: '生命',
  atk: '攻击',
  def: '防御',
  healHp: '回血',
  hitVal: '命中',
  dodge: '闪避',
  crit: '暴击',
  tenacity: '韧性',
  lucky: '幸运',
  guardian: '守护',
  break: '穿透',
  protect: '减伤',
};

export const METRIC_COLORS: Record<string, string> = {
  hp: 'text-red-500',
  atk: 'text-yellow-500',
  def: 'text-stone-400',
  healHp: 'text-orange-400',
  hitVal: 'text-cyan-400',
  dodge: 'text-slate-500',
  crit: 'text-fuchsia-500',
  tenacity: 'text-rose-400',
  lucky: 'text-pink-500',
  guardian: 'text-green-500',
  break: 'text-indigo-400',
  protect: 'text-teal-400',
};

export const METRIC_KEYS = [
  'hp', 'atk', 'def', 'healHp',
  'hitVal', 'dodge', 'crit', 'tenacity',
  'lucky', 'guardian', 'break', 'protect',
];

export const RESIST_LABELS: Record<number, string> = {
  1: '光抗',
  2: '暗抗',
  3: '水抗',
  4: '火抗',
  5: '木抗',
  6: '风抗',
  7: '土抗',
  8: '雷抗',
  9: '金抗',
};

export const RESIST_COLORS: Record<number, string> = {
  1: 'text-amber-300',
  2: 'text-violet-500',
  3: 'text-blue-400',
  4: 'text-orange-600',
  5: 'text-emerald-500',
  6: 'text-sky-300',
  7: 'text-yellow-800',
  8: 'text-purple-400',
  9: 'text-zinc-400',
};

const numberFormatter = new Intl.NumberFormat('zh-CN');

export function formatNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) {
    return '-';
  }
  return numberFormatter.format(Number(value));
}

export function formatSignedNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) {
    return '-';
  }
  return Number(value) > 0 ? `+${numberFormatter.format(Number(value))}` : numberFormatter.format(Number(value));
}

export function getResistanceLabel(entry: ResistanceEntry) {
  return entry.label || RESIST_LABELS[entry.id] || `ID ${entry.id}`;
}

export function formatResistanceEntries(entries?: ResistanceEntry[]) {
  if (!entries || entries.length === 0) {
    return '-';
  }
  return entries
    .map((entry) => `${getResistanceLabel(entry)} ${formatSignedNumber(entry.value)}`)
    .join('、');
}

export function getTypeKey(value: BossTypeGroup['type']) {
  return value == null ? 'unknown' : String(value);
}

function getPrimaryMapName(mapName?: string | string[]) {
  if (Array.isArray(mapName)) {
    return mapName[0] || '';
  }
  return mapName || '';
}

function extractNumericTokens(value: string) {
  const matches = value.match(/\d+/g);
  return matches ? matches.map((item) => Number(item)) : [];
}

function compareNumberArraysDesc(lhs: number[], rhs: number[]) {
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

function toSortableNumber(value: number | string | null | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function compareBossDesc(lhs: FlattenedBoss, rhs: FlattenedBoss) {
  const leftType = toSortableNumber(lhs.type);
  const rightType = toSortableNumber(rhs.type);
  if (leftType != null && rightType != null && leftType !== rightType) {
    return rightType - leftType;
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

  return String(rhs.stageName).localeCompare(String(lhs.stageName), 'zh-Hans-CN');
}

export function recalculateBossProps(boss: FlattenedBoss, level: number, template: BossProps) {
  const coefficients = boss.calcFormula?.coefficients;
  if (!coefficients) {
    return boss;
  }

  const calculatedProps: BossProps = { ...(boss.calculatedProps || {}) };
  for (const key of METRIC_KEYS) {
    const formula = coefficients[key];
    if (!formula) {
      continue;
    }
    const [multi, add] = formula;
    const baseValue = Number(template[key] ?? 0);
    calculatedProps[key] = Math.ceil(baseValue * multi + add);
  }

  if ((boss.calcFormula?.hpRate ?? 0) > 0 && calculatedProps.hp != null) {
    calculatedProps.hp = Math.ceil(Number(calculatedProps.hp) * Number(boss.calcFormula?.hpRate));
  }

  return {
    ...boss,
    level,
    calculatedProps,
  };
}

function isBossTypeGroup(value: unknown): value is BossTypeGroup {
  return Boolean(value) && typeof value === 'object' && Array.isArray((value as BossTypeGroup).stages);
}

export function collectBossGroups(dataSources: Record<string, any>) {
  const groupMap = new Map<string, BossTypeGroup>();

  const appendGroup = (group: unknown) => {
    if (!isBossTypeGroup(group)) {
      return;
    }
    const key = group.type == null ? `${group.label || 'unknown'}-${groupMap.size}` : String(group.type);
    groupMap.set(key, group);
  };

  const splitEntries = Object.entries(dataSources).filter(([name]) => name.startsWith('boss_type_'));
  if (splitEntries.length > 0) {
    for (const [, payload] of splitEntries) {
      appendGroup(payload?.data);
    }
  }

  if (groupMap.size === 0) {
    const legacyPayload = dataSources.boss_stage_stats as { data?: BossTypeGroup[] } | undefined;
    if (Array.isArray(legacyPayload?.data)) {
      for (const group of legacyPayload.data) {
        appendGroup(group);
      }
    }
  }

  return Array.from(groupMap.values()).sort((lhs, rhs) => Number(lhs.type ?? Number.MAX_SAFE_INTEGER) - Number(rhs.type ?? Number.MAX_SAFE_INTEGER));
}

export function flattenBossGroups(groups: BossTypeGroup[]) {
  const flatList: FlattenedBoss[] = [];
  for (const group of groups) {
    for (const stage of group.stages) {
      for (const boss of stage.bossData) {
        flatList.push({
          ...boss,
          stageId: stage.stageId,
          stageName: stage.stageName || `关卡 ${stage.stageId}`,
          stageLv: stage.stageLv,
          mapName: stage.mapName,
          type: group.type,
          typeLabel: group.label,
        });
      }
    }
  }
  return flatList.sort(compareBossDesc);
}
