import { clsx } from 'clsx';
import { useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  formatNumber,
  formatResistanceEntries,
  formatSignedNumber,
  METRIC_COLORS,
  METRIC_KEYS,
  METRIC_LABELS,
  RESIST_COLORS,
  RESIST_LABELS,
  type FlattenedBoss,
} from '../../lib/boss-stats';

interface BossStatsTableProps {
  bosses: FlattenedBoss[];
  filteredBossesLength: number;
  resistIds: number[];
  showSourceColumn: boolean;
  showRoleResistColumn: boolean;
  showRoleResistPvpColumn: boolean;
  dynamicColumnCount: number;
}

export default function BossStatsTable({
  bosses,
  filteredBossesLength,
  resistIds,
  showSourceColumn,
  showRoleResistColumn,
  showRoleResistPvpColumn,
  dynamicColumnCount,
}: BossStatsTableProps) {
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

  const getPhaseRows = (boss: FlattenedBoss) => {
    if (boss.phases && boss.phases.length > 1) {
      return boss.phases.filter((phase) => phase.calculatedProps);
    }
    return [{ phase: 1, name: '一阶段', calculatedProps: boss.calculatedProps }];
  };

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-sm">
      <div
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        className={clsx(
          "w-full h-[65vh] min-h-[400px] overflow-auto custom-scrollbar relative",
          isDragging ? "cursor-grabbing select-none" : "cursor-auto"
        )}
      >
        <table className="w-full text-left border-collapse text-sm whitespace-nowrap">
          <thead className="sticky top-0 z-20 shadow-sm">
            <tr className="bg-surface border-b border-border text-textSub text-xs select-none">
              <th className="sticky left-0 bg-surface z-30 w-[1%] whitespace-nowrap md:w-auto md:whitespace-normal md:min-w-[180px] px-4 py-3 font-semibold border-r border-border shadow-[4px_0_12px_rgba(0,0,0,0.1)]">
                BOSS 名称
              </th>
              <th className="px-4 py-3 font-semibold border-r border-border min-w-[200px] bg-surface md:hidden">
                备注
              </th>
              <th className="px-4 py-3 font-semibold border-r border-border min-w-[160px] bg-surface">关卡</th>
              {showSourceColumn ? (
                <th className="px-4 py-3 font-semibold border-r border-border min-w-[140px] bg-surface">来源</th>
              ) : null}
              <th className="px-4 py-3 font-semibold border-r border-border bg-surface">等级</th>

              {METRIC_KEYS.map((key) => (
                <th key={key} className={clsx('px-4 py-3 font-semibold border-r border-border/50 bg-surface', METRIC_COLORS[key])}>
                  {METRIC_LABELS[key]}
                </th>
              ))}

              {resistIds.map((id) => (
                <th key={`resist-${id}`} className={clsx('px-4 py-3 font-semibold border-r border-border/50 bg-surface', RESIST_COLORS[id])}>
                  {RESIST_LABELS[id] || `抗性 ${id}`}
                </th>
              ))}

              {showRoleResistColumn ? (
                <th className="px-4 py-3 font-semibold border-r border-border min-w-[240px] bg-surface">对角色抗性</th>
              ) : null}
              {showRoleResistPvpColumn ? (
                <th className="px-4 py-3 font-semibold min-w-[240px] bg-surface">对 PVP 角色抗性</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50 text-textMain">
            {bosses.map((boss, index) => (
              <tr
                key={`${boss.stageId}-${boss.id}-${index}`}
                className="hover:bg-white/5 transition-colors group"
              >
                <td className="sticky left-0 bg-surface/95 backdrop-blur-md z-10 w-[1%] whitespace-nowrap md:w-auto md:whitespace-normal px-4 py-2 border-r border-border group-hover:bg-active/80 shadow-[4px_0_12px_rgba(0,0,0,0.1)] transition-colors align-top">
                  <div className="font-medium text-primary md:whitespace-normal md:break-words md:leading-5">
                    {boss.name || '未知 BOSS'}
                  </div>
                  {boss.phases && boss.phases.length > 1 ? (
                    <div className="mt-1 text-[10px] text-amber-300">含二阶段复活·狂暴</div>
                  ) : null}
                  {boss.remark ? (
                    <div className="mt-1 hidden md:block text-[10px] text-textSub whitespace-normal break-words leading-4">
                      {boss.remark}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-2 border-r border-border align-top md:hidden">
                  <div className="text-xs text-textSub whitespace-normal break-words leading-5">
                    {boss.remark || '-'}
                  </div>
                </td>
                <td className="px-4 py-2 border-r border-border align-top">
                  <div className="whitespace-normal break-words leading-5">
                    {boss.stageName}
                  </div>
                </td>
                {showSourceColumn ? (
                  <td className="px-4 py-2 border-r border-border align-top">
                    <div className="whitespace-normal break-words leading-5">
                      {boss.typeLabel || '未知来源'}
                    </div>
                    <div className="mt-1 text-[10px] text-textSub whitespace-normal break-words leading-4">
                    </div>
                  </td>
                ) : null}
                <td className="px-4 py-2 border-r border-border align-top">{boss.level ?? boss.stageLv ?? '-'}</td>

                {boss.error ? (
                  <td colSpan={dynamicColumnCount} className="px-4 py-2 text-red-500/80 text-xs text-center">
                    计算错误: {boss.error}
                  </td>
                ) : (
                  <>
                    {METRIC_KEYS.map((key) => (
                      <td key={key} className={clsx('px-4 py-2 border-r border-border/50 font-mono font-semibold text-right align-top', METRIC_COLORS[key])}>
                        <div className="space-y-1">
                          {getPhaseRows(boss).map((phase) => (
                            <div key={`${phase.phase}-${key}`} className="flex items-center justify-end gap-2">
                              {key === METRIC_KEYS[0] && boss.phases && boss.phases.length > 1 ? (
                                <span className="text-[10px] font-sans font-normal text-textSub">{phase.name || `${phase.phase} 阶段`}</span>
                              ) : null}
                              <span>{formatNumber(phase.calculatedProps?.[key])}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    ))}

                    {resistIds.map((id) => {
                      const resistEntry = boss.resistEntries?.find((entry) => entry.id === id);
                      return (
                        <td key={`resist-val-${id}`} className={clsx('px-4 py-2 border-r border-border/50 font-mono font-semibold text-right align-top', RESIST_COLORS[id])}>
                          {resistEntry ? formatSignedNumber(resistEntry.value) : '-'}
                        </td>
                      );
                    })}

                    {showRoleResistColumn ? (
                      <td className="px-4 py-2 border-r border-border text-[11px] leading-5 text-textSub whitespace-normal break-words min-w-[240px] max-w-[280px] align-top">
                        {formatResistanceEntries(boss.resistRoleEntries)}
                      </td>
                    ) : null}
                    {showRoleResistPvpColumn ? (
                      <td className="px-4 py-2 text-[11px] leading-5 text-textSub whitespace-normal break-words min-w-[240px] max-w-[280px] align-top">
                        {formatResistanceEntries(boss.resistRolePvpEntries)}
                      </td>
                    ) : null}
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {filteredBossesLength === 0 ? (
          <div className="py-12 text-center text-textSub text-sm">
            没有找到匹配的 BOSS
          </div>
        ) : null}
      </div>
    </div>
  );
}
