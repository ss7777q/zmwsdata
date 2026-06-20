import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Line, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import type { BeastLineupAnalysisResponse } from '../../lib/api';
import type { DatasetMode, MatrixSortDirection, MatrixSortKey } from './beastStatsShared';
import { CHART_COLORS, FIXED_CHART_HEIGHT, buildChartRows, buildPetLabelMap, formatNumber, getCountHeatStyle, getScrollableChartWidth, renderSortedTooltip } from './beastStatsShared';

export function LineupTab({ source }: { source: BeastLineupAnalysisResponse }) {
  const [datasetMode, setDatasetMode] = useState<DatasetMode>('cleaned');
  const [matrixSortKey, setMatrixSortKey] = useState<MatrixSortKey>('total');
  const [matrixSortDirection, setMatrixSortDirection] = useState<MatrixSortDirection>('desc');
  const dataset = datasetMode === 'cleaned' ? source.cleaned : source.raw;
  const petLabelMap = useMemo(() => buildPetLabelMap(dataset.petCatalog), [dataset.petCatalog]);
  const [selectedPetIds, setSelectedPetIds] = useState<number[]>(dataset.topPetsDefault.slice(0, 10));

  useEffect(() => {
    setSelectedPetIds(dataset.topPetsDefault.slice(0, 10));
  }, [dataset.topPetsDefault]);

  const chartPetIds = selectedPetIds;
  const chartWidth = useMemo(() => getScrollableChartWidth(dataset.seasonList.length), [dataset.seasonList.length]);
  const rateRows = useMemo(() => buildChartRows(dataset, chartPetIds, dataset.appearanceRateBySeason), [chartPetIds, dataset]);
  const countRows = useMemo(() => buildChartRows(dataset, chartPetIds, dataset.appearanceCountBySeason), [chartPetIds, dataset]);

  function togglePet(petId: number) {
    setSelectedPetIds((previous) => previous.includes(petId)
      ? previous.filter((value) => value !== petId)
      : [...previous, petId]
    );
  }

  const sortedCatalog = useMemo(() => {
    const items = [...dataset.petCatalog];
    items.sort((left, right) => {
      let comparison = 0;

      if (matrixSortKey === 'pet') {
        comparison = left.petSpeciesName.localeCompare(right.petSpeciesName, 'zh-CN');
      } else if (matrixSortKey === 'total') {
        comparison = left.totalCount - right.totalCount;
      } else if (matrixSortKey.startsWith('season:')) {
        const season = matrixSortKey.slice('season:'.length);
        const leftValue = dataset.appearanceCountBySeason[String(left.petId)]?.[season] ?? 0;
        const rightValue = dataset.appearanceCountBySeason[String(right.petId)]?.[season] ?? 0;
        comparison = leftValue - rightValue;
      }

      if (comparison === 0) {
        comparison = left.petId - right.petId;
      }

      return matrixSortDirection === 'asc' ? comparison : -comparison;
    });
    return items;
  }, [dataset, matrixSortDirection, matrixSortKey]);
  const seasonTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const season of dataset.seasonList) {
      totals[String(season)] = 0;
    }

    for (const pet of dataset.petCatalog) {
      const row = dataset.appearanceCountBySeason[String(pet.petId)] || {};
      for (const season of dataset.seasonList) {
        totals[String(season)] += row[String(season)] ?? 0;
      }
    }

    const grandTotal = dataset.petCatalog.reduce((sum, pet) => sum + pet.totalCount, 0);
    return {
      totals,
      grandTotal,
    };
  }, [dataset]);
  const maxMatrixCount = useMemo(() => {
    let maxValue = 0;
    for (const pet of dataset.petCatalog) {
      const row = dataset.appearanceCountBySeason[String(pet.petId)] || {};
      for (const season of dataset.seasonList) {
        const count = row[String(season)] ?? 0;
        if (count > maxValue) {
          maxValue = count;
        }
      }
    }
    return maxValue;
  }, [dataset]);

  function toggleMatrixSort(nextKey: MatrixSortKey) {
    if (matrixSortKey === nextKey) {
      setMatrixSortDirection((previous) => previous === 'desc' ? 'asc' : 'desc');
      return;
    }

    setMatrixSortKey(nextKey);
    setMatrixSortDirection(nextKey === 'pet' ? 'asc' : 'desc');
  }

  function renderSortMark(targetKey: MatrixSortKey) {
    if (matrixSortKey !== targetKey) {
      return <span className="text-textSub/50">↕</span>;
    }

    return <span className="text-primary">{matrixSortDirection === 'desc' ? '↓' : '↑'}</span>;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-sm text-textSub">
            总冠军记录 {source.summary.totalChampionRows} 条 / 清洗后 {source.summary.cleanedChampionRows} 条 / 异常 {source.summary.anomalyRows} 条
          </div>
          <div className="inline-flex rounded-2xl border border-border bg-surface p-1">
            <button type="button" onClick={() => setDatasetMode('cleaned')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${datasetMode === 'cleaned' ? 'bg-primary text-white' : 'text-textSub'}`}>清洗异常数据</button>
            <button type="button" onClick={() => setDatasetMode('raw')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${datasetMode === 'raw' ? 'bg-primary text-white' : 'text-textSub'}`}>不清洗</button>
          </div>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
          <button
            type="button"
            onClick={() => setSelectedPetIds(sortedCatalog.slice(0, 24).map((pet) => pet.petId))}
            className="whitespace-nowrap rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold text-textMain"
          >
            全选
          </button>
          <button
            type="button"
            onClick={() => setSelectedPetIds([])}
            className="whitespace-nowrap rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold text-textSub"
          >
            全不选
          </button>
          {sortedCatalog.slice(0, 24).map((pet) => {
            const active = selectedPetIds.includes(pet.petId);
            return (
              <button key={pet.petId} type="button" onClick={() => togglePet(pet.petId)} className={`whitespace-nowrap rounded-full border px-3 py-2 text-sm ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-textSub'}`}>
                {pet.petSpeciesName}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <h3 className="mb-4 text-lg font-semibold text-textMain">宠物出率变化</h3>
        <div className="overflow-x-auto pb-2">
          <div style={{ width: `${chartWidth}px` }}>
            <LineChart width={chartWidth} height={FIXED_CHART_HEIGHT} data={rateRows} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.18)" strokeDasharray="3 3" />
                <XAxis dataKey="season" stroke="#64748b" />
                <YAxis stroke="#64748b" tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} />
                <Tooltip
                  content={({ active, label, payload }) => active ? (
                    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
                      <div className="mb-2 font-semibold text-textMain">{label}</div>
                      <div className="space-y-1">
                        {renderSortedTooltip(payload, (value) => `${Math.round(value * 100)}%`)}
                      </div>
                    </div>
                  ) : null}
                />
                <Legend />
                {chartPetIds.map((petId, index) => (
                  <Line key={`rate-${petId}`} type="monotone" dataKey={String(petId)} stroke={CHART_COLORS[index % CHART_COLORS.length]} strokeWidth={2.5} dot={false} name={petLabelMap.get(petId) || String(petId)} />
                ))}
              </LineChart>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <h3 className="mb-4 text-lg font-semibold text-textMain">宠物出现次数</h3>
        <div className="overflow-x-auto pb-2">
          <div style={{ width: `${chartWidth}px` }}>
            <LineChart width={chartWidth} height={FIXED_CHART_HEIGHT} data={countRows} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.18)" strokeDasharray="3 3" />
                <XAxis dataKey="season" stroke="#64748b" />
                <YAxis stroke="#64748b" allowDecimals={false} />
                <Tooltip
                  content={({ active, label, payload }) => active ? (
                    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
                      <div className="mb-2 font-semibold text-textMain">{label}</div>
                      <div className="space-y-1">
                        {renderSortedTooltip(payload, (value) => formatNumber(value))}
                      </div>
                    </div>
                  ) : null}
                />
                <Legend />
                {chartPetIds.map((petId, index) => (
                  <Line key={`count-${petId}`} type="monotone" dataKey={String(petId)} stroke={CHART_COLORS[index % CHART_COLORS.length]} strokeWidth={2.5} dot={false} name={petLabelMap.get(petId) || String(petId)} />
                ))}
              </LineChart>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <h3 className="mb-4 text-lg font-semibold text-textMain">出现次数表</h3>
        <div className="overflow-auto rounded-2xl border border-border max-h-[70vh]">
          <table className="min-w-[1040px] w-full text-sm">
            <thead className="sticky top-0 z-20 bg-surface text-textSub shadow-sm">
              <tr className="border-b border-border">
                <th className="sticky left-0 z-30 bg-surface px-4 py-3 text-left font-semibold">
                  <button type="button" onClick={() => toggleMatrixSort('pet')} className="inline-flex items-center gap-2">
                    宠物
                    {renderSortMark('pet')}
                  </button>
                </th>
                {dataset.seasonList.map((season) => (
                  <th key={season} className="border-l border-border px-4 py-3 font-semibold">
                    <button type="button" onClick={() => toggleMatrixSort(`season:${season}`)} className="inline-flex items-center gap-2">
                      S{season}
                      {renderSortMark(`season:${season}`)}
                    </button>
                  </th>
                ))}
                <th className="sticky right-0 z-30 border-l border-border bg-surface px-4 py-3 font-semibold shadow-[-4px_0_12px_rgba(15,23,42,0.08)]">
                  <button type="button" onClick={() => toggleMatrixSort('total')} className="inline-flex items-center gap-2">
                    总计
                    {renderSortMark('total')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-textMain">
              {sortedCatalog.map((pet) => (
                <tr key={`matrix-${pet.petId}`}>
                  <td className="sticky left-0 z-10 bg-card px-4 py-3 font-semibold">{pet.petSpeciesName}</td>
                  {dataset.seasonList.map((season) => {
                    const count = dataset.appearanceCountBySeason[String(pet.petId)]?.[String(season)] ?? 0;
                    return (
                      <td
                        key={`${pet.petId}-${season}`}
                        className={clsx('border-l border-border px-4 py-3 text-center font-mono transition-colors', count > 0 ? 'font-semibold text-textMain' : 'text-textSub/60')}
                        style={getCountHeatStyle(count, maxMatrixCount)}
                      >
                        {count}
                      </td>
                    );
                  })}
                  <td className="sticky right-0 z-10 border-l border-border bg-card px-4 py-3 text-center font-mono font-semibold text-primary shadow-[-4px_0_12px_rgba(15,23,42,0.08)]">
                    {pet.totalCount}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-20 bg-surface text-textMain shadow-[0_-4px_12px_rgba(15,23,42,0.08)]">
              <tr className="border-t border-border">
                <td className="sticky left-0 z-30 bg-surface px-4 py-3 font-semibold">赛季总计</td>
                {dataset.seasonList.map((season) => {
                  const total = seasonTotals.totals[String(season)] ?? 0;
                  return (
                    <td
                      key={`total-${season}`}
                      className="border-l border-border px-4 py-3 text-center font-mono font-semibold text-textMain"
                      style={getCountHeatStyle(total, Math.max(maxMatrixCount, ...Object.values(seasonTotals.totals)))}
                    >
                      {total}
                    </td>
                  );
                })}
                <td className="sticky right-0 z-30 border-l border-border bg-surface px-4 py-3 text-center font-mono font-bold text-primary shadow-[-4px_0_12px_rgba(15,23,42,0.08)]">
                  {seasonTotals.grandTotal}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
