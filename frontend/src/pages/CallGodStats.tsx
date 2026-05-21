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
  const [activeTab, setActiveTab] = useState<'stats' | 'stones'>('stats');
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
      ) : (
        <StoneRewardsTab payload={stoneRewardPayload} />
      )}
    </div>
  );
}
