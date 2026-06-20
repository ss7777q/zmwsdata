import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { ScrollTableFrame } from './CallGodAttributeTab';
import type { StoneRewardPayload } from './callGodStatsShared';
import { formatNumber } from './callGodStatsShared';

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

export function StoneRewardsTab({ payload }: { payload: StoneRewardPayload | null }) {
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
