import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { clsx } from 'clsx';
import { apiUrl } from '../lib/api';
import { METRIC_COLORS } from '../lib/boss-stats';

const STAT_COLORS: Record<string, string> = {
  ...METRIC_COLORS,
  mp: 'text-blue-500',
  healMp: 'text-indigo-400',
  speed: 'text-amber-400',
};

const FRAMES_PER_SECOND = 30;

interface Props {
  dataSources: Record<string, unknown>;
}

type NullableNumber = number | null;

interface BattlefieldUnitStats {
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

interface BattlefieldPower {
  output: number;
  defense: number;
  total: number;
}

interface BattlefieldUnit {
  category: string;
  camp: string;
  name: string;
  baseId: string | null;
  entityId: string | null;
  speed: number | string | null;
  stats: BattlefieldUnitStats;
  power: BattlefieldPower | null;
}

interface BattlefieldConfig {
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

interface BattlefieldResult {
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

interface StoneRewardMatchedSource {
  count: number;
  mode: 'dropGroup' | 'drop' | 'direct' | 'unknown';
  sourceCode: number;
}

interface StoneRewardEntry {
  threshold: number;
  stoneCount: number;
  matchedSources: StoneRewardMatchedSource[];
  rawValue: unknown;
}

interface StoneRewardTier {
  rewardLv: number;
  battlefieldLv: number;
  stageId: number;
  stageName: string;
  rewards: Record<string, StoneRewardEntry[]>;
}

interface StoneRewardLine {
  key: string;
  camp: 'god' | 'devil';
  label: string;
  thresholdLabel: string;
  description: string;
  itemId: number;
  stoneName: string;
}

interface StoneRewardPayload {
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

interface BossMechanismSource {
  id?: number;
  name?: string;
  text?: string;
  durationFrames?: number | null;
  intervalFrames?: number | null;
  maxStacks?: number | null;
}

interface BossMechanismEntry {
  type: string;
  text: string;
  source?: BossMechanismSource;
}

interface BossDamageSegment {
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

interface BossSkillAnalysis {
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

interface BossFashionAnalysis {
  id: number;
  name: string;
  description: string;
  permanentOptions: boolean;
  effects: BossEffectBrief[];
}

interface BossEffectBrief {
  id: number;
  name: string;
  description: string;
  text?: string;
}

interface BossTalentAnalysis {
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

interface BossAnalysisEntry {
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

interface OutputDataFile<T> {
  data?: T;
}

const TABLE_COLUMNS = [
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

function StatGrid({ count }: { count: number }) {
  const activeClass = "bg-[#438dec] border-[#296ac0]";
  const inactiveClass = "bg-[#b7bdc9] border-[#9ba3b1] dark:bg-slate-600 dark:border-slate-500";

  return (
    <div className="grid grid-cols-2 gap-[1.5px] w-[13px] h-[13px] shrink-0" title={`属性表现: ${count}/4`}>
      <div className={clsx("border", count >= 1 ? activeClass : inactiveClass)} />
      <div className={clsx("border", count >= 2 ? activeClass : inactiveClass)} />
      <div className={clsx("border", count >= 3 ? activeClass : inactiveClass)} />
      <div className={clsx("border", count >= 4 ? activeClass : inactiveClass)} />
    </div>
  );
}

function formatNumber(value: number | string | null | undefined) {
  if (value == null || value === '') {
    return '—';
  }

  if (typeof value === 'string') {
    return value;
  }

  return value.toLocaleString('zh-CN', {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  });
}

function getCellValue(unit: BattlefieldUnit, column: typeof TABLE_COLUMNS[number]) {
  if (column.stat) {
    return unit.stats[column.key as keyof BattlefieldUnitStats];
  }
  if (column.power) {
    return unit.power?.[column.power] ?? null;
  }
  return unit[column.key as keyof BattlefieldUnit];
}

function ScrollTableFrame({
  children,
  minWidthClassName = '',
}: {
  children: ReactNode;
  minWidthClassName?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  return (
    <div
      ref={scrollRef}
      onMouseDown={handleMouseDown}
      onMouseLeave={handleMouseLeave}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      className={clsx(
        'overflow-auto max-h-[70vh] custom-scrollbar relative bg-surface rounded-b-2xl',
        isDragging ? 'cursor-grabbing select-none' : 'cursor-auto',
        minWidthClassName
      )}
    >
      {children}
    </div>
  );
}

function WorksheetTable({
  title,
  units,
}: {
  title: string;
  units: BattlefieldUnit[];
}) {
  const columnStats = useMemo(() => {
    const stats: Record<string, { min: number; max: number }> = {};
    TABLE_COLUMNS.forEach(col => {
      if (col.stat || col.power || col.key === 'speed') {
        let min = Infinity;
        let max = -Infinity;
        units.forEach(unit => {
          const val = getCellValue(unit, col);
          if (typeof val === 'number' && !Number.isNaN(val)) {
            if (val < min) min = val;
            if (val > max) max = val;
          }
        });
        if (min !== Infinity && max !== -Infinity) {
          stats[col.key] = { min, max };
        }
      }
    });
    return stats;
  }, [units]);

  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);

  const sortedUnits = useMemo(() => {
    const list = [...units];
    if (sortConfig !== null) {
      list.sort((a, b) => {
        const column = TABLE_COLUMNS.find((c) => c.key === sortConfig.key);
        if (!column) return 0;

        let aValue = getCellValue(a, column);
        let bValue = getCellValue(b, column);

        if (aValue === null || aValue === undefined) aValue = '';
        if (bValue === null || bValue === undefined) bValue = '';

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return list;
  }, [units, sortConfig]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-lg font-semibold text-textMain">{title}</h2>
      </div>
      <ScrollTableFrame>
        <table className="w-full min-w-[1500px] text-left text-sm whitespace-nowrap">
          <thead className="sticky top-0 z-10 bg-surface text-xs uppercase tracking-wider text-textSub shadow-sm">
            <tr className="border-b border-border">
              {TABLE_COLUMNS.map((column, index) => (
                <th
                  key={column.key}
                  className={clsx(
                    'px-4 py-3 font-semibold border-r border-border/50 cursor-pointer select-none transition-colors hover:bg-surface/80',
                    index === 0 ? 'sticky left-0 z-20 bg-surface shadow-[4px_0_12px_rgba(0,0,0,0.1)]' : 'bg-surface',
                    STAT_COLORS[column.key]
                  )}
                  onClick={() => requestSort(column.key)}
                  title={`点击按 ${column.label} 排序`}
                >
                  <div className="flex items-center gap-1">
                    {column.label}
                    {sortConfig?.key === column.key && (
                      <span className="text-[10px] text-primary">
                        {sortConfig.direction === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50 text-textMain">
            {sortedUnits.map((unit) => (
              <tr
                key={`${unit.category}-${unit.name}`}
                className="transition-colors hover:bg-surface/80"
              >
                {TABLE_COLUMNS.map((column, index) => {
                  const isStat = column.stat || column.power || column.key === 'speed';
                  const rawVal = getCellValue(unit, column);
                  let gridCount = -1;

                  if (isStat && typeof rawVal === 'number' && columnStats[column.key]) {
                    const { min, max } = columnStats[column.key];
                    if (max > min) {
                      const ratio = (rawVal - min) / (max - min);
                      if (ratio < 0.2) gridCount = 0;
                      else if (ratio < 0.4) gridCount = 1;
                      else if (ratio < 0.6) gridCount = 2;
                      else if (ratio < 0.8) gridCount = 3;
                      else gridCount = 4;
                    } else {
                      gridCount = 4;
                    }
                  }

                  return (
                    <td
                      key={column.key}
                      className={clsx(
                        'px-4 py-2 border-r border-border/50',
                        index === 0 ? 'sticky left-0 z-10 bg-surface/95 backdrop-blur-md shadow-[4px_0_12px_rgba(0,0,0,0.1)]' : '',
                        isStat ? 'font-mono font-semibold text-right' : 'text-left font-medium',
                        STAT_COLORS[column.key] || (isStat ? '' : 'text-textMain')
                      )}
                    >
                      {isStat && gridCount >= 0 ? (
                        <div className="flex items-center justify-end gap-1.5 leading-none">
                          <StatGrid count={gridCount} />
                          <span>{formatNumber(rawVal as any)}</span>
                        </div>
                      ) : (
                        formatNumber(rawVal as any)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTableFrame>
    </section>
  );
}

function StoneThresholdTable({
  title,
  thresholdLabel,
  thresholds,
  rows,
  valueColorClass,
  hideZeroOnlyAxes = false,
}: {
  title: string;
  thresholdLabel: string;
  thresholds: number[];
  rows: Array<{
    rewardLv: number;
    stageName: string;
    battlefieldLv: number;
    values: Record<string, number>;
  }>;
  valueColorClass: string;
  hideZeroOnlyAxes?: boolean;
}) {
  const visibleRows = useMemo(() => {
    if (!hideZeroOnlyAxes) {
      return rows;
    }
    return rows.filter((row) => thresholds.some((threshold) => (row.values[String(threshold)] ?? 0) !== 0));
  }, [hideZeroOnlyAxes, rows, thresholds]);

  const visibleThresholds = useMemo(() => {
    if (!hideZeroOnlyAxes) {
      return thresholds;
    }
    return thresholds.filter((threshold) => visibleRows.some((row) => (row.values[String(threshold)] ?? 0) !== 0));
  }, [hideZeroOnlyAxes, thresholds, visibleRows]);

  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-lg font-semibold text-textMain">{title}</h3>
      </div>

      <ScrollTableFrame>
        <table className="w-full min-w-[980px] text-center text-sm whitespace-nowrap">
          <thead className="sticky top-0 z-10 bg-surface text-xs text-textSub shadow-sm">
            <tr className="border-b border-border">
              <th className="sticky left-0 z-20 w-[1%] whitespace-nowrap border-r border-border/50 bg-surface px-4 py-3 text-left font-semibold shadow-[4px_0_12px_rgba(0,0,0,0.1)]">
                阶数
              </th>
              {visibleThresholds.map((threshold) => (
                <th key={`${title}-${threshold}`} className="border-r border-border/50 bg-surface px-4 py-3 font-semibold last:border-r-0">
                  {thresholdLabel}{threshold}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50 text-textMain">
            {visibleRows.map((row) => {
              return (
                <tr key={`${title}-${row.rewardLv}`} className="transition-colors hover:bg-surface/60">
                  <td className="sticky left-0 z-10 w-[1%] whitespace-nowrap border-r border-border/50 bg-surface/95 px-4 py-3 text-left font-medium backdrop-blur-md shadow-[4px_0_12px_rgba(0,0,0,0.1)]">
                    <div>{row.stageName}</div>
                    <div className="mt-1 text-xs text-textSub">{row.battlefieldLv}级</div>
                  </td>
                  {visibleThresholds.map((threshold) => (
                    <td
                      key={`${title}-${row.rewardLv}-${threshold}`}
                      className={clsx('border-r border-border/50 px-4 py-3 font-mono font-semibold last:border-r-0', valueColorClass)}
                    >
                      {formatNumber(row.values[String(threshold)] ?? 0)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollTableFrame>
    </section>
  );
}

function DevilStoneMatrixTable({
  matrices,
}: {
  matrices: Record<string, StoneRewardPayload['tables']['devilStoneMatrixByTier'][string]>;
}) {
  const options = useMemo(
    () => Object.values(matrices).sort((left, right) => left.rewardLv - right.rewardLv),
    [matrices]
  );
  const [selectedRewardLv, setSelectedRewardLv] = useState<number>(options.at(-1)?.rewardLv ?? 1);

  useEffect(() => {
    if (options.length === 0) {
      return;
    }
    if (!options.some((option) => option.rewardLv === selectedRewardLv)) {
      setSelectedRewardLv(options.at(-1)?.rewardLv ?? options[0].rewardLv);
    }
  }, [options, selectedRewardLv]);

  const activeMatrix = options.find((option) => option.rewardLv === selectedRewardLv) || options[0] || null;

  if (!activeMatrix) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-textMain">魔王奖励获取详情</h3>
            <p className="mt-1 text-sm leading-6 text-textSub">
              行为剩余矿量，列为击杀神将数，单元格为该战场阶数下的总魔灵石奖励。剩余矿量向上取整,例如剩余90%~100%均计为100%
            </p>
          </div>
          <label className="flex items-center gap-3 text-sm text-textSub">
            <span>战场阶数</span>
            <select
              value={selectedRewardLv}
              onChange={(event) => setSelectedRewardLv(Number(event.target.value))}
              className="input min-w-[180px]"
            >
              {options.map((option) => (
                <option key={option.rewardLv} value={option.rewardLv}>
                  {option.stageName} / {option.battlefieldLv}级
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <ScrollTableFrame>
        <table className="w-full min-w-[1180px] text-center text-sm whitespace-nowrap">
          <thead className="sticky top-0 z-10 bg-surface text-xs text-textSub shadow-sm">
            <tr className="border-b border-border">
              <th className="sticky left-0 z-20 w-[1%] whitespace-nowrap border-r border-border/50 bg-surface px-4 py-3 font-semibold shadow-[4px_0_12px_rgba(0,0,0,0.1)]">
                剩余矿量
              </th>
              {activeMatrix.killThresholds.map((killCount) => (
                <th key={`kill-${killCount}`} className="border-r border-border/50 bg-surface px-4 py-3 font-semibold last:border-r-0">
                  击杀{killCount}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50 text-textMain">
            {activeMatrix.rows.map((row) => (
              <tr key={`remain-${row.remainingMine}`} className="transition-colors hover:bg-surface/60">
                <td className="sticky left-0 z-10 w-[1%] whitespace-nowrap border-r border-border/50 bg-surface/95 px-4 py-3 font-medium backdrop-blur-md shadow-[4px_0_12px_rgba(0,0,0,0.1)]">
                  {row.remainingMine}
                </td>
                {activeMatrix.killThresholds.map((killCount) => (
                  <td
                    key={`remain-${row.remainingMine}-kill-${killCount}`}
                    className="border-r border-border/50 px-4 py-3 font-mono font-semibold text-amber-600 dark:text-amber-400 last:border-r-0"
                  >
                    {formatNumber(row.values[String(killCount)] ?? 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTableFrame>
    </section>
  );
}

function formatCoefficientValue(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function frameText(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value}帧`;
}

function secondsText(frames: number | null | undefined) {
  if (typeof frames !== 'number' || !Number.isFinite(frames)) return '—';
  if (frames === 0) return '无冷却';
  const seconds = frames / FRAMES_PER_SECOND;
  return `${Number.isInteger(seconds) ? seconds : Number(seconds.toFixed(3))}s`;
}

function rawSecondsText(seconds: number | null | undefined) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '—';
  if (seconds === 0) return '无冷却';
  return `${Number.isInteger(seconds) ? seconds : Number(seconds.toFixed(3))}s`;
}

function attackRateText(totalCoefficient: number | null | undefined, frames: number | null | undefined) {
  if (typeof totalCoefficient !== 'number' || !Number.isFinite(totalCoefficient)) return null;
  if (typeof frames !== 'number' || !Number.isFinite(frames) || frames <= 0) return null;
  return formatCoefficientValue(totalCoefficient / (frames / FRAMES_PER_SECOND));
}

function groupDamageSegments(skill: BossSkillAnalysis) {
  const groups: Array<{ coefficient: number | null; hits: number; unknownHits: boolean; frames: number[]; intervals: number[] }> = [];
  for (const segment of (skill.damageSegments || []).filter((item) => item.damage)) {
    const coefficient = segment.damage?.coefficient ?? null;
    const hitCount = typeof segment.maxHit === 'number' && Number.isFinite(segment.maxHit) && segment.maxHit > 0 && segment.maxHit <= 50 ? segment.maxHit : null;
    const keyMatch = groups.find((group) => group.coefficient === coefficient);
    const group = keyMatch || { coefficient, hits: 0, unknownHits: false, frames: [], intervals: [] };
    if (hitCount == null) group.unknownHits = true;
    else group.hits += hitCount;
    if (typeof segment.frame === 'number' && Number.isFinite(segment.frame) && !group.frames.includes(segment.frame)) group.frames.push(segment.frame);
    if (typeof segment.interval === 'number' && segment.interval > 0 && !group.intervals.includes(segment.interval)) group.intervals.push(segment.interval);
    if (!keyMatch) groups.push(group);
  }
  return groups;
}

function damageFormulaText(skill: BossSkillAnalysis) {
  if (skill.damageDisplay?.formula) return skill.damageDisplay.formula;
  const groups = groupDamageSegments(skill);
  if (groups.length === 0) return '无直接伤害';
  return groups.map((group) => {
    const hitText = group.unknownHits ? (group.hits > 0 ? `${group.hits}+未确认` : '未确认') : String(group.hits);
    return `${formatCoefficientValue(group.coefficient)}×${hitText}连击`;
  }).join(' + ');
}

function hitTimingText(skill: BossSkillAnalysis) {
  if (skill.damageDisplay?.timing) return skill.damageDisplay.timing;
  const frames = [...new Set((skill.damageSegments || [])
    .map((segment) => segment.frame)
    .filter((frame): frame is number => typeof frame === 'number' && Number.isFinite(frame)))].sort((a, b) => a - b);
  if (!frames.length) return null;
  const shown = frames.slice(0, 8).map((frame) => `第${frame}帧`).join('、');
  return frames.length > 8 ? `${shown}等` : shown;
}

function MechanismList({ items, emptyText }: { items: BossMechanismEntry[] | undefined; emptyText: string }) {
  const visibleItems = (items || []).filter((item) => item.text || item.source?.name);
  if (visibleItems.length === 0) {
    return <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-textSub">{emptyText}</div>;
  }

  return (
    <div className="space-y-2">
      {visibleItems.map((item, index) => (
        <div key={`${item.type}-${item.source?.id || index}`} className="rounded-lg bg-surface px-3 py-2">
          <div className="text-[11px] font-semibold text-primary">{item.type}</div>
          <div className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-textMain">{item.text || item.source?.name}</div>
        </div>
      ))}
    </div>
  );
}

function SkillDamageTable({ skill }: { skill: BossSkillAnalysis }) {
  if (skill.damageDisplay?.breakdown?.length) {
    return (
      <div className="border-t border-border px-5 py-3">
        <div className="mb-2 text-[11px] text-textSub">伤害拆分</div>
        <div className="space-y-2">
          {skill.damageDisplay.breakdown.map((item, index) => (
            <div key={`${skill.id}-override-${index}`} className="rounded-lg bg-surface px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold text-textMain">{item.label}</span>
                <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">{item.text}</span>
              </div>
              {item.detail ? <div className="mt-1 break-words leading-5 text-textSub">{item.detail}</div> : null}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (skill.damageDisplay?.hideAutoBreakdown) {
    return null;
  }
  const groups = groupDamageSegments(skill);
  if (groups.length === 0) {
    return <div className="border-t border-border px-5 py-3 text-sm text-textSub">该技能不靠直接伤害吃饭，重点看下方附带效果。</div>;
  }

  return (
    <div className="border-t border-border px-5 py-3">
      <div className="mb-2 text-[11px] text-textSub">伤害拆分</div>
      <div className="space-y-2">
        {groups.map((group, index) => (
          <div key={`${skill.id}-${index}`} className="rounded-lg bg-surface px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold text-textMain">第{index + 1}段</span>
              <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                {formatCoefficientValue(group.coefficient)}×{group.unknownHits ? (group.hits > 0 ? `${group.hits}+未确认` : '未确认') : group.hits}连击
              </span>
            </div>
            <div className="mt-1 break-words font-mono leading-5 text-textSub">
              {group.frames.length ? group.frames.sort((a, b) => a - b).map((frame) => `第${frame}帧`).join('、') : '命中节奏未解析'}
              {group.intervals.length ? `；命中间隔${group.intervals.map(frameText).join('/')}` : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BossSkillCard({ skill }: { skill: BossSkillAnalysis }) {
  const attackRate = attackRateText(skill.totalCoefficient, skill.actionFrames);
  const timing = hitTimingText(skill);
  const mechanics = skill.mechanismOverride?.covered ? skill.mechanics : [];
  const totalText = skill.damageDisplay?.total || formatCoefficientValue(skill.totalCoefficient);
  return (
    <section className="flex flex-col overflow-hidden rounded-[20px] border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-slate-500/[0.02] px-5 py-3.5 dark:bg-white/[0.01]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="break-words text-base font-bold text-textMain">{skill.name}</span>
            </div>
            <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-textSub/85">{skill.category}</div>
          </div>
          {skill.warnings?.length ? <span className="shrink-0 rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-300">有提示</span> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-px bg-border/40 text-sm sm:grid-cols-2">
        <BossStat label="伤害系数" value={damageFormulaText(skill)} accent />
        <BossStat label="总系数" value={totalText} accent />
        <BossStat label="冷却" value={rawSecondsText(skill.cooldownSeconds ?? skill.cooldownFrames)} />
        <BossStat label="释放用时" value={secondsText(skill.actionFrames)} />
        {attackRate && <BossStat label="攻转" value={attackRate} accent />}
        {timing && <BossStat label="命中节奏" value={timing} />}
      </div>

      <SkillDamageTable skill={skill} />

      {mechanics?.length ? (
        <div className="border-t border-border px-5 py-3">
          <div className="mb-2 text-[11px] text-textSub">机制说明</div>
          <MechanismList items={mechanics} emptyText="该技能未解析到附加机制。" />
        </div>
      ) : null}

      {skill.warnings?.length ? (
        <details className="mt-auto border-t border-border px-5 py-2">
          <summary className="cursor-pointer text-xs text-amber-600 dark:text-amber-300">{skill.warnings.length} 条数据提示</summary>
          <ul className="mt-2 space-y-1 text-[11px] leading-5 text-textSub">
            {skill.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function BossAttackCard({ skills }: { skills: BossSkillAnalysis[] }) {
  if (!skills.length) return null;
  const total = skills.reduce((sum, skill) => typeof skill.totalCoefficient === 'number' ? sum + skill.totalCoefficient : sum, 0);
  const hasTotal = skills.some((skill) => typeof skill.totalCoefficient === 'number');
  return (
    <section className="flex flex-col overflow-hidden rounded-[20px] border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-slate-500/[0.02] px-5 py-3.5 dark:bg-white/[0.01]">
        <div className="text-base font-bold text-textMain">普攻 / 跳攻</div>
        <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-textSub/85">基础攻击合并展示</div>
      </div>
      <div className="grid grid-cols-1 gap-px bg-border/40 text-sm sm:grid-cols-2">
        <BossStat label="总系数合计" value={hasTotal ? formatCoefficientValue(total) : '—'} accent />
        <BossStat label="动作数量" value={`${skills.length} 个`} />
      </div>
      <div className="space-y-2 border-t border-border px-5 py-3">
        {skills.map((skill, index) => (
          <div key={`${skill.category}-${skill.id}-${index}`} className="rounded-lg bg-surface px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold text-textMain">{skill.name}</span>
              <span className="rounded bg-card px-1.5 py-0.5 text-[10px] text-textSub">{skill.category}</span>
            </div>
            <div className="mt-1 font-mono text-xs leading-5 text-rose-600 dark:text-rose-400">{damageFormulaText(skill)}；总系数 {formatCoefficientValue(skill.totalCoefficient)}</div>
            <div className="mt-1 text-xs leading-5 text-textSub">释放用时 {secondsText(skill.actionFrames)}{hitTimingText(skill) ? `；命中节奏 ${hitTimingText(skill)}` : ''}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BossStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-card px-4 py-2.5">
      <div className="text-[11px] text-textSub">{label}</div>
      <div className={clsx('mt-0.5 break-words font-mono text-sm font-semibold', accent ? 'text-rose-600 dark:text-rose-400' : 'text-textMain')}>{value}</div>
    </div>
  );
}

function BossTalentsTable({ talents }: { talents: BossTalentAnalysis[] }) {
  if (talents.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-textMain">通用魔王天赋</h3>
        <span className="text-xs text-textSub">{talents.length} 个天赋</span>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {talents.map((talent) => {
          const effectText = talent.effects.map((item) => item.description || item.text || item.name).filter(Boolean).join('；');
          return (
            <article key={talent.talentGroup} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-semibold text-textMain">{talent.name}</h4>
                  <span className="rounded bg-surface px-2 py-0.5 text-[11px] text-textSub">
                    {talent.unlockStageRange ? `${talent.unlockStageRange[0]}-${talent.unlockStageRange[1]}阶` : '解锁阶数未配置'}
                  </span>
                  <span className="rounded bg-surface px-2 py-0.5 text-[11px] text-textSub">最高 {talent.maxLevel} 级</span>
                </div>
                {effectText ? <p className="mt-2 text-xs leading-5 text-textSub">{effectText}</p> : null}
              </div>
              <div className="divide-y divide-border/60">
                {talent.levels.map((level) => (
                  <div key={`${talent.talentGroup}-${level.level}`} className="grid grid-cols-[3.75rem_1fr] gap-3 px-5 py-3 text-sm sm:grid-cols-[4.5rem_1fr]">
                    <div className="font-mono font-semibold text-primary">Lv.{level.level}</div>
                    <div className="min-w-0">
                      <div className="break-words leading-6 text-textMain">{level.text || '—'}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-textSub">
                        {typeof level.cost === 'number' ? <span>消耗 {level.cost}</span> : null}
                        {level.stages.length ? <span>适用战场：{level.stages.join('、')}</span> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function BossAnalysisTab({ payload }: { payload: BossAnalysisEntry[] }) {
  const bosses = useMemo(() => payload, [payload]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');

  useEffect(() => {
    if (bosses.length === 0) return;
    if (!bosses.some((boss) => String(boss.groupId) === selectedGroupId)) {
      setSelectedGroupId(String(bosses[0].groupId));
    }
  }, [bosses, selectedGroupId]);

  if (payload.length === 0 || bosses.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-20 text-center text-textSub">
        暂未生成魔王解析数据。执行神魔提取后会显示技能系数和机制解析。
      </div>
    );
  }

  const activeBoss = bosses.find((boss) => String(boss.groupId) === selectedGroupId) || bosses[0];
  const activeBossKey = String(activeBoss.groupId);
  const visibleSkills = (activeBoss.skills || []).filter((skill) => !skill.missing && skill.showAsSkillCard !== false);
  const attackSkills = visibleSkills.filter((skill) => skill.category === '普攻' || skill.category === '空中攻击');
  const activeSkills = visibleSkills.filter((skill) => skill.category !== '普攻' && skill.category !== '空中攻击');
  const passiveMechanisms = activeBoss.mechanismOverride?.covered ? activeBoss.baseMechanisms || [] : [];

  return (
    <div key={activeBossKey} className="space-y-5">
      <section className="flex flex-col gap-4 rounded-[24px] border border-border bg-card px-5 py-4 shadow-sm">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {bosses.map((boss) => {
            const active = activeBossKey === String(boss.groupId);
            return (
              <button
                key={String(boss.groupId)}
                onClick={() => setSelectedGroupId(String(boss.groupId))}
                className={clsx(
                  'min-h-11 shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-surface text-textSub hover:text-textMain'
                )}
              >
                {boss.name}
              </button>
            );
          })}
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-textMain">{activeBoss.name}</h2>
            <span className="rounded bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-300">只有系数伤害</span>
            {activeBoss.warnings?.length ? <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-300">{activeBoss.warnings.length} 条数据提示</span> : null}
          </div>
          {activeBoss.description ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-textSub">{activeBoss.description}</p> : null}
          <p className="mt-3 text-sm leading-6 text-textMain">魔王技能伤害不展示固伤；没有特别标注真伤时，默认按受防御影响的系数伤害理解。</p>
        </div>
      </section>

      {passiveMechanisms.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-textMain">本体机制</h3>
            <span className="text-xs text-textSub">{passiveMechanisms.length} 条</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {passiveMechanisms.map((item, index) => (
              <section key={`${item.type}-${item.source?.id || index}`} className="rounded-[20px] border border-border bg-card px-5 py-4 shadow-sm">
                <div className="text-[10px] font-medium uppercase tracking-wide text-textSub/85">{item.type}</div>
                <div className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-textMain">{item.text}</div>
              </section>
            ))}
          </div>
        </section>
      )}

      {activeSkills.length > 0 || attackSkills.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-textMain">技能解析</h3>
            <span className="text-xs text-textSub">{activeSkills.length + (attackSkills.length ? 1 : 0)} 张</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <BossAttackCard skills={attackSkills} />
            {activeSkills.map((skill) => <BossSkillCard key={`${activeBossKey}-${skill.category}-${skill.id}`} skill={skill} />)}
          </div>
        </section>
      ) : null}

      {activeBoss.fashions?.length ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-textMain">外观/皮肤机制</h3>
            <span className="text-xs text-textSub">{activeBoss.fashions.length} 件</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {activeBoss.fashions.map((fashion) => (
              <div key={fashion.id} className="rounded-[20px] border border-border bg-card p-5 shadow-sm">
                <div className="font-semibold text-textMain">{fashion.name}</div>
                <div className="mt-2 text-sm leading-6 text-textSub whitespace-pre-line">{fashion.description}</div>
                {fashion.effects.length ? (
                  <div className="mt-3 space-y-2 text-sm text-textMain">
                    {fashion.effects.map((effect) => <div key={effect.id} className="rounded-lg bg-surface px-3 py-2 leading-6">{effect.description || effect.text || effect.name}</div>)}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function BossTalentsTab({ talents }: { talents: BossTalentAnalysis[] }) {
  if (talents.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-20 text-center text-textSub">
        暂未生成通用魔王天赋数据。执行神魔提取后会显示天赋等级和效果。
      </div>
    );
  }

  return <BossTalentsTable talents={talents} />;
}

function AttributeTab({
  config,
  result,
  loading,
  calculating,
  error,
  battlefieldTier,
  starLevel,
  bossStage,
  setBattlefieldTier,
  setStarLevel,
  setBossStage,
}: {
  config: BattlefieldConfig | null;
  result: BattlefieldResult | null;
  loading: boolean;
  calculating: boolean;
  error: string;
  battlefieldTier: number;
  starLevel: number;
  bossStage: number;
  setBattlefieldTier: (value: number) => void;
  setStarLevel: (value: number) => void;
  setBossStage: (value: number) => void;
}) {
  const specialUnits = useMemo(() => {
    if (!result) return [];
    return [result.specials.nuBa, result.specials.crystal];
  }, [result]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card px-6 py-20 text-center text-textSub">
        正在加载神魔属性配置...
      </div>
    );
  }

  if (!config) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-20 text-center">
        <div className="text-lg font-medium text-textMain">未能加载神魔属性配置</div>
        {error && <div className="mt-3 text-sm text-red-500">{error}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-2">
            <div className="text-sm font-medium text-textSub">战场阶数</div>
            <select
              value={battlefieldTier}
              onChange={(event) => setBattlefieldTier(Number(event.target.value))}
              className="input w-full"
            >
              {config.selectors.battlefieldTier.values.map((value) => (
                <option key={value} value={value}>{value} 阶</option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <div className="text-sm font-medium text-textSub">星级</div>
            <select
              value={starLevel}
              onChange={(event) => setStarLevel(Number(event.target.value))}
              className="input w-full"
            >
              {Array.from({ length: 9 }, (_, index) => index).map((value) => (
                <option key={value} value={value}>{value} 星</option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <div className="text-sm font-medium text-textSub">魔王阶数</div>
            <select
              value={bossStage}
              onChange={(event) => setBossStage(Number(event.target.value))}
              className="input w-full"
            >
              {config.selectors.bossStage.values.map((value) => (
                <option key={value} value={value}>{value} 阶</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-textSub">
          <span>{calculating ? '正在按当前参数重新计算...' : '参数变更后自动刷新表格,可点击表头按照对应属性数值排序'}</span>
          {result && (
            <span className="font-mono">
              {result.meta.battlefieldLabel} / {result.meta.starLevel} 星 / 魔王 {result.meta.bossStage} 阶
            </span>
          )}
          {error && <span className="text-red-500">{error}</span>}
        </div>
      </section>

      {!result ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-20 text-center text-textSub">
          暂无可展示的神魔属性结果
        </div>
      ) : (
        <div className="space-y-6">
          <WorksheetTable title="神将" units={result.heroes} />
          <WorksheetTable title="坐骑" units={result.mounts} />
          <WorksheetTable title="魔王" units={result.demonKings} />
          <WorksheetTable title="特殊单位" units={specialUnits} />
        </div>
      )}
    </div>
  );
}

function StoneRewardsTab({ payload }: { payload: StoneRewardPayload | null }) {
  if (!payload) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-20 text-center text-textSub">
        暂未生成神/魔灵石获取详情数据。先跑一次后端提取后，这里会自动接入更新结果。
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StoneThresholdTable
        title="神将获取神灵石数量"
        thresholdLabel="采"
        thresholds={payload.tables.reward_plunder_blessing.thresholds}
        rows={payload.tables.reward_plunder_blessing.rows}
        valueColorClass="text-emerald-600 dark:text-emerald-400"
      />

      <DevilStoneMatrixTable matrices={payload.tables.devilStoneMatrixByTier} />

      <StoneThresholdTable
        title="储灵珠补领神灵石"
        thresholdLabel="采"
        thresholds={payload.tables.saveGodStoneReward.thresholds}
        rows={payload.tables.saveGodStoneReward.rows}
        valueColorClass="text-cyan-600 dark:text-cyan-400"
        hideZeroOnlyAxes
      />
    </div>
  );
}

export default function CallGodStats({ dataSources }: Props) {
  const [activeTab, setActiveTab] = useState<'stats' | 'stones' | 'boss' | 'talents'>('stats');
  const [config, setConfig] = useState<BattlefieldConfig | null>(null);
  const [result, setResult] = useState<BattlefieldResult | null>(null);
  const [battlefieldTier, setBattlefieldTier] = useState<number>(0);
  const [starLevel, setStarLevel] = useState<number>(8);
  const [bossStage, setBossStage] = useState<number>(6);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState('');

  const stoneRewardPayload = useMemo(() => {
    const source = dataSources.call_god_stone_rewards as OutputDataFile<StoneRewardPayload> | undefined;
    return source?.data || null;
  }, [dataSources]);

  const bossAnalysisPayload = useMemo(() => {
    const source = dataSources.call_god_boss_analysis as OutputDataFile<BossAnalysisEntry[]> | undefined;
    return Array.isArray(source?.data) ? source.data : [];
  }, [dataSources]);

  const bossTalentPayload = useMemo(() => {
    const source = dataSources.call_god_boss_talents as OutputDataFile<BossTalentAnalysis[]> | undefined;
    return Array.isArray(source?.data) ? source.data : [];
  }, [dataSources]);

  useEffect(() => {
    let disposed = false;

    async function loadConfig() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(apiUrl('/api/battlefield/config'), { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || '加载配置失败');
        }
        if (disposed) return;
        setConfig(payload);
        setBattlefieldTier(payload.selectors.battlefieldTier.default ?? payload.selectors.battlefieldTier.values.at(-1) ?? 1);
        setStarLevel(payload.selectors.starLevel.default ?? 8);
        setBossStage(payload.selectors.bossStage.default ?? payload.selectors.bossStage.values[0] ?? 1);
      } catch (err) {
        if (disposed) return;
        setError(err instanceof Error ? err.message : '加载配置失败');
      } finally {
        if (!disposed) setLoading(false);
      }
    }

    void loadConfig();
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!config || battlefieldTier <= 0 || starLevel < 0 || bossStage <= 0) {
      return;
    }

    let disposed = false;

    async function calculate() {
      setCalculating(true);
      setError('');
      try {
        const response = await fetch(apiUrl('/api/battlefield'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ battlefieldTier, starLevel, bossStage }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || '计算失败');
        }
        if (disposed) return;
        setResult(payload);
      } catch (err) {
        if (disposed) return;
        setError(err instanceof Error ? err.message : '计算失败');
      } finally {
        if (!disposed) setCalculating(false);
      }
    }

    void calculate();
    return () => {
      disposed = true;
    };
  }, [battlefieldTier, bossStage, config, starLevel]);

  return (
    <div className="space-y-6 pb-20">
      <section className="rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'stats' as const, label: '神魔属性' },
            { key: 'stones' as const, label: '神/魔灵石获取详情' },
            { key: 'boss' as const, label: '魔王解析' },
            { key: 'talents' as const, label: '通用魔王天赋' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={clsx(
                'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-surface/60 text-textSub hover:bg-surface hover:text-textMain'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'stats' ? (
        <AttributeTab
          config={config}
          result={result}
          loading={loading}
          calculating={calculating}
          error={error}
          battlefieldTier={battlefieldTier}
          starLevel={starLevel}
          bossStage={bossStage}
          setBattlefieldTier={setBattlefieldTier}
          setStarLevel={setStarLevel}
          setBossStage={setBossStage}
        />
      ) : activeTab === 'stones' ? (
        <StoneRewardsTab payload={stoneRewardPayload} />
      ) : activeTab === 'talents' ? (
        <BossTalentsTab talents={bossTalentPayload} />
      ) : (
        <BossAnalysisTab payload={bossAnalysisPayload} />
      )}
    </div>
  );
}
