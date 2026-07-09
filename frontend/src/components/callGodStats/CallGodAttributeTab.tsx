import { useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { clsx } from 'clsx';
import type { BattlefieldUnit, BattlefieldConfig, BattlefieldResult, BattlefieldUnitStats } from './callGodStatsShared';
import { STAT_COLORS, TABLE_COLUMNS, formatNumber } from './callGodStatsShared';

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

function getCellValue(unit: BattlefieldUnit, column: typeof TABLE_COLUMNS[number]) {
  if (column.stat) {
    return unit.stats[column.key as keyof BattlefieldUnitStats];
  }
  if (column.power) {
    return unit.power?.[column.power] ?? null;
  }
  return unit[column.key as keyof BattlefieldUnit];
}

export function ScrollTableFrame({
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
        'overflow-auto custom-scrollbar relative bg-surface rounded-b-2xl',
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

export function AttributeTab({
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
