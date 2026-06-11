import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Line, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { apiUrl, type BeastDetailResponse, type BeastLineupAnalysisResponse, type BeastLineupCatalogItem, type BeastLineupDataset, type BeastPlayerAnalysisResponse } from '../lib/api';

type BeastTab = 'detail' | 'lineup' | 'players';
type DetailNameMode = 'species_then_winner' | 'nickname_then_current';
type DetailAnomalyFilter = 'all' | 'normal' | 'anomaly';
type DatasetMode = 'cleaned' | 'raw';
type MatrixSortKey = 'pet' | 'total' | `season:${number}`;
type MatrixSortDirection = 'asc' | 'desc';

const DETAIL_PAGE_SIZE = 20;
const MOBILE_CHART_MIN_WIDTH = 720;
const CHART_WIDTH_PER_SEASON = 44;
const FIXED_CHART_HEIGHT = 360;

interface BeastStatsProps {
  detailSource?: BeastDetailResponse;
  lineupSource?: BeastLineupAnalysisResponse;
  playerSource?: BeastPlayerAnalysisResponse;
  loading?: boolean;
}

const CHART_COLORS = ['#2563eb', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];

interface SortedTooltipEntry {
  label: string;
  color: string;
  value: number;
}

interface RawTooltipEntry {
  dataKey?: unknown;
  name?: unknown;
  color?: string;
  value?: unknown;
}

function formatNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '-';
  return value.toLocaleString('zh-CN');
}

function formatSeasonLabel(season: number) {
  if (season >= 1 && season <= 3) {
    return `测试${season}赛季`;
  }

  return `${season - 3}赛季`;
}

async function fetchDataFile<T>(name: string): Promise<T> {
  const response = await fetch(apiUrl(`/api/data/${name}`), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`加载 ${name} 失败: ${response.status}`);
  }

  const payload = await response.json() as { data?: T };
  if (!payload || typeof payload !== 'object' || !('data' in payload)) {
    throw new Error(`${name} 返回格式不正确`);
  }

  return payload.data as T;
}

function buildPetLabelMap(petCatalog: BeastLineupCatalogItem[]) {
  return new Map(petCatalog.map((item) => [item.petId, item.petSpeciesName]));
}

function getPetSpeciesName(petSpeciesNameById: Record<string, string>, petId: number) {
  return petSpeciesNameById[String(petId)] || '未知宠物(' + petId + ')';
}

function buildChartRows(dataset: BeastLineupDataset, selectedPetIds: number[], source: Record<string, Record<string, number>>) {
  const petLabelMap = buildPetLabelMap(dataset.petCatalog);
  return dataset.seasonList.map((season) => {
    const row: Record<string, string | number> = { season: `S${season}` };
    for (const petId of selectedPetIds) {
      row[String(petId)] = source[String(petId)]?.[String(season)] ?? 0;
      row[`label-${petId}`] = petLabelMap.get(petId) || String(petId);
    }
    return row;
  });
}

function getCountHeatStyle(value: number, maxValue: number) {
  if (value <= 0 || maxValue <= 0) {
    return undefined;
  }

  const ratio = value / maxValue;
  const alpha = 0.08 + ratio * 0.32;
  return {
    backgroundColor: `rgba(37, 99, 235, ${alpha.toFixed(3)})`,
  };
}

function getScrollableChartWidth(seasonCount: number) {
  return Math.max(MOBILE_CHART_MIN_WIDTH, seasonCount * CHART_WIDTH_PER_SEASON);
}

function normalizeAliasList(value: unknown, fallback?: string) {
  const rawList = Array.isArray(value) ? value : [];
  const list = rawList.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  if (fallback && fallback.trim().length > 0 && !list.includes(fallback)) {
    list.push(fallback);
  }
  return list;
}

function renderSortedTooltip(
  payload: readonly RawTooltipEntry[] | undefined,
  formatter: (value: number) => string,
) {
  if (!payload || payload.length === 0) {
    return null;
  }

  const items: SortedTooltipEntry[] = payload
    .filter((entry: RawTooltipEntry) => Boolean(entry) && typeof entry.dataKey === 'string' && !String(entry.dataKey).startsWith('label-'))
    .map((entry: RawTooltipEntry) => ({
      label: typeof entry.name === 'string' && entry.name.trim().length > 0 ? entry.name : String(entry.dataKey),
      color: typeof entry.color === 'string' && entry.color ? entry.color : '#334155',
      value: Number(entry.value || 0),
    }))
    .sort((left: SortedTooltipEntry, right: SortedTooltipEntry) => right.value - left.value || left.label.localeCompare(right.label, 'zh-CN'));

  return items.map((item: SortedTooltipEntry) => (
    <div key={item.label} style={{ color: item.color }} className="text-sm">
      {item.label}：{formatter(item.value)}
    </div>
  ));
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center text-textSub">
      {message}
    </div>
  );
}

function DetailTab({ source }: { source: BeastDetailResponse }) {
  const petSpeciesNameById = source.summary.petSpeciesNameById;
  const [selectedSeason, setSelectedSeason] = useState<string>('all');
  const [selectedServer, setSelectedServer] = useState<string>('all');
  const [anomalyFilter, setAnomalyFilter] = useState<DetailAnomalyFilter>('all');
  const [nameMode, setNameMode] = useState<DetailNameMode>('species_then_winner');
  const [page, setPage] = useState(1);

  const filteredRows = useMemo(() => {
    return source.rows.filter((row) => {
      if (selectedSeason !== 'all' && row.season !== Number(selectedSeason)) return false;
      if (selectedServer !== 'all' && row.sid !== Number(selectedServer)) return false;
      if (anomalyFilter === 'normal' && row.isAnomalyBySeasonAvg80) return false;
      if (anomalyFilter === 'anomaly' && !row.isAnomalyBySeasonAvg80) return false;
      return true;
    }).sort((left, right) => right.season - left.season || left.sid - right.sid || left.group - right.group);
  }, [anomalyFilter, selectedSeason, selectedServer, source.rows]);

  useEffect(() => {
    setPage(1);
  }, [selectedSeason, selectedServer, anomalyFilter, nameMode]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / DETAIL_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * DETAIL_PAGE_SIZE;
    return filteredRows.slice(start, start + DETAIL_PAGE_SIZE);
  }, [filteredRows, safePage]);

  const pageStart = filteredRows.length === 0 ? 0 : (safePage - 1) * DETAIL_PAGE_SIZE + 1;
  const pageEnd = filteredRows.length === 0 ? 0 : Math.min(filteredRows.length, safePage * DETAIL_PAGE_SIZE);

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm text-textSub">
            <div className="mb-2 font-medium">赛季</div>
            <select value={selectedSeason} onChange={(event) => setSelectedSeason(event.target.value)} className="input w-full">
              <option value="all">全部赛季</option>
              {source.summary.seasonList.map((season) => (
                <option key={season} value={season}>{formatSeasonLabel(season)}</option>
              ))}
            </select>
          </label>

          <label className="text-sm text-textSub">
            <div className="mb-2 font-medium">区服</div>
            <select value={selectedServer} onChange={(event) => setSelectedServer(event.target.value)} className="input w-full">
              <option value="all">全部区服</option>
              {source.summary.serverList.map((serverId) => (
                <option key={serverId} value={serverId}>{serverId} 服</option>
              ))}
            </select>
          </label>

          <label className="text-sm text-textSub">
            <div className="mb-2 font-medium">异常状态</div>
            <select value={anomalyFilter} onChange={(event) => setAnomalyFilter(event.target.value as DetailAnomalyFilter)} className="input w-full">
              <option value="all">全部</option>
              <option value="normal">仅正常</option>
              <option value="anomaly">仅异常</option>
            </select>
          </label>

          <label className="text-sm text-textSub sm:col-span-2 xl:col-span-1">
            <div className="mb-2 font-medium">名字模式</div>
            <select value={nameMode} onChange={(event) => setNameMode(event.target.value as DetailNameMode)} className="input w-full">
              <option value="species_then_winner">种类名 + 当时名字</option>
              <option value="nickname_then_current">昵称 + 当前名字</option>
            </select>
          </label>
        </div>
      </section>

      {filteredRows.length === 0 ? <EmptyState message="没有符合条件的冠军记录" /> : null}

      {filteredRows.length > 0 ? (
        <section className="rounded-3xl border border-border bg-card p-0 shadow-sm overflow-hidden">
          <div className="overflow-auto">
            <table className="min-w-[1180px] w-full text-sm">
              <thead className="bg-surface text-textSub shadow-sm">
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold">赛季</th>
                  <th className="px-4 py-3 text-left font-semibold">区服</th>
                  <th className="px-4 py-3 text-left font-semibold">UID / 主人</th>
                  <th className="px-4 py-3 text-left font-semibold">1号位</th>
                  <th className="px-4 py-3 text-left font-semibold">2号位</th>
                  <th className="px-4 py-3 text-left font-semibold">3号位</th>
                  <th className="px-4 py-3 text-left font-semibold">总战力</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-textMain">
                {pageRows.map((row) => {
          const showSpecies = nameMode === 'species_then_winner';
          const sortedPets = [...row.pets].sort((left, right) => left.slotIndex - right.slotIndex);
          const primaryOwnerName = showSpecies ? row.winnerNameAtThatTime : row.currentName;
          const secondaryOwnerLabel = showSpecies ? '当前' : '当时';
          const secondaryOwnerName = showSpecies ? row.currentName : row.winnerNameAtThatTime;
          return (
            <tr key={`${row.season}-${row.sid}-${row.uid}-${row.group}`} className="hover:bg-surface/40 align-top">
              <td className="px-4 py-4 font-semibold">{formatSeasonLabel(row.season)}</td>
              <td className="px-4 py-4">{row.sid} 服</td>
              <td className="px-4 py-4 min-w-[220px]">
                <div className="font-semibold text-textMain">{primaryOwnerName}</div>
                <div className="mt-1 font-mono text-xs text-textSub break-all">{row.uid}</div>
                <div className="mt-1 text-xs text-textSub">{secondaryOwnerLabel}：{secondaryOwnerName}</div>
              </td>
              {sortedPets.map((pet) => (
                <td key={`${row.uid}-${row.season}-${pet.slotIndex}-${pet.petId}`} className="px-4 py-4 min-w-[180px]">
                  <div className="font-semibold text-textMain break-words">{showSpecies ? getPetSpeciesName(petSpeciesNameById, pet.petId) : (pet.petNickname || getPetSpeciesName(petSpeciesNameById, pet.petId))}</div>
                  <div className="mt-1 text-xs text-textSub">{showSpecies ? '昵称' : '种类'}：{showSpecies ? (pet.petNickname || '-') : getPetSpeciesName(petSpeciesNameById, pet.petId)}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-textSub">
                    <span className="rounded-full border border-border bg-card px-2 py-1">Lv.{pet.petLevel}</span>
                    <span className="rounded-full border border-border bg-card px-2 py-1">战力 {formatNumber(pet.petPower)}</span>
                  </div>
                </td>
              ))}
              <td className="px-4 py-4 font-mono font-semibold text-primary">{formatNumber(row.petPowerSum)}</td>
            </tr>
          );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-textSub">显示第 {pageStart}-{pageEnd} 条，共 {filteredRows.length} 条</div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage(1)} disabled={safePage === 1} className="rounded-lg border border-border px-3 py-2 text-sm text-textSub disabled:opacity-40">首页</button>
              <button type="button" onClick={() => setPage((previous) => Math.max(1, previous - 1))} disabled={safePage === 1} className="rounded-lg border border-border px-3 py-2 text-sm text-textSub disabled:opacity-40">上一页</button>
              <div className="px-2 text-sm text-textMain">{safePage} / {totalPages}</div>
              <button type="button" onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))} disabled={safePage === totalPages} className="rounded-lg border border-border px-3 py-2 text-sm text-textSub disabled:opacity-40">下一页</button>
              <button type="button" onClick={() => setPage(totalPages)} disabled={safePage === totalPages} className="rounded-lg border border-border px-3 py-2 text-sm text-textSub disabled:opacity-40">末页</button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function LineupTab({ source }: { source: BeastLineupAnalysisResponse }) {
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

function PlayerTab({ source, detailSource }: { source: BeastPlayerAnalysisResponse; detailSource: BeastDetailResponse }) {
  const petSpeciesNameById = detailSource.summary.petSpeciesNameById;
  const [selectedSeason, setSelectedSeason] = useState<string>('all');
  const [selectedServer, setSelectedServer] = useState<string>('all');
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const championLineupMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of detailSource.rows) {
      const speciesList = [...row.pets]
        .sort((left, right) => left.slotIndex - right.slotIndex)
        .map((pet) => getPetSpeciesName(petSpeciesNameById, pet.petId))
        .join(' / ');
      map.set(`${row.uid}-${row.season}`, speciesList);
    }

    return map;
  }, [detailSource.rows, petSpeciesNameById]);

  const aliasMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of detailSource.rows) {
      const list = normalizeAliasList(map.get(row.uid), row.winnerNameAtThatTime);
      map.set(row.uid, list);
    }
    return map;
  }, [detailSource.rows]);

  useEffect(() => {
    setPage(1);
    setExpandedUid(null);
  }, [selectedSeason, selectedServer]);

  const rows = useMemo(() => {
    const filteredRecords = detailSource.rows.filter((row) => {
      if (selectedSeason !== 'all' && row.season !== Number(selectedSeason)) return false;
      if (selectedServer !== 'all' && row.sid !== Number(selectedServer)) return false;
      return true;
    });

    const playerMap = new Map<string, {
      uid: string;
      currentName: string;
      winnerAliasList: string[];
      championCount: number;
      seasonWins: Array<{ season: number; sid: number; winnerNameAtThatTime: string }>;
      sidCoverage: number[];
      firstChampionSeason: number | null;
      latestChampionSeason: number | null;
    }>();

    for (const record of filteredRecords) {
      const existing = playerMap.get(record.uid);
      if (!existing) {
        playerMap.set(record.uid, {
          uid: record.uid,
          currentName: record.currentName,
          winnerAliasList: normalizeAliasList(aliasMap.get(record.uid), record.winnerNameAtThatTime),
          championCount: 1,
          seasonWins: [{ season: record.season, sid: record.sid, winnerNameAtThatTime: record.winnerNameAtThatTime }],
          sidCoverage: [record.sid],
          firstChampionSeason: record.season,
          latestChampionSeason: record.season,
        });
        continue;
      }

      existing.currentName = record.currentName;
      existing.championCount += 1;
      existing.seasonWins.push({ season: record.season, sid: record.sid, winnerNameAtThatTime: record.winnerNameAtThatTime });
      if (!existing.sidCoverage.includes(record.sid)) {
        existing.sidCoverage.push(record.sid);
        existing.sidCoverage.sort((left, right) => left - right);
      }
      for (const alias of normalizeAliasList(aliasMap.get(record.uid), record.winnerNameAtThatTime)) {
        if (!existing.winnerAliasList.includes(alias)) {
          existing.winnerAliasList.push(alias);
        }
      }
      existing.firstChampionSeason = existing.seasonWins[0]?.season ?? null;
      existing.latestChampionSeason = existing.seasonWins[existing.seasonWins.length - 1]?.season ?? null;
    }

    return [...playerMap.values()]
      .sort((left, right) => right.championCount - left.championCount || (right.latestChampionSeason ?? 0) - (left.latestChampionSeason ?? 0) || left.uid.localeCompare(right.uid))
      .map((row, index) => ({
        ...row,
        winnerAliasList: normalizeAliasList(row.winnerAliasList),
        rank: index + 1,
      }));
  }, [aliasMap, detailSource.rows, selectedSeason, selectedServer]);

  const totalPages = Math.max(1, Math.ceil(rows.length / DETAIL_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * DETAIL_PAGE_SIZE;
    return rows.slice(start, start + DETAIL_PAGE_SIZE);
  }, [rows, safePage]);
  const pageStart = rows.length === 0 ? 0 : (safePage - 1) * DETAIL_PAGE_SIZE + 1;
  const pageEnd = rows.length === 0 ? 0 : Math.min(rows.length, safePage * DETAIL_PAGE_SIZE);

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="grid w-full max-w-[760px] grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block min-w-0 text-sm text-textSub">
            <div className="mb-2 font-medium">赛季</div>
            <select value={selectedSeason} onChange={(event) => setSelectedSeason(event.target.value)} className="input w-full">
              <option value="all">全部赛季</option>
              {source.summary.seasonList.map((season) => (
                <option key={season} value={season}>{formatSeasonLabel(season)}</option>
              ))}
            </select>
          </label>

          <label className="block min-w-0 text-sm text-textSub">
            <div className="mb-2 font-medium">区服</div>
            <select value={selectedServer} onChange={(event) => setSelectedServer(event.target.value)} className="input w-full">
              <option value="all">全部区服</option>
              {source.summary.serverList.map((serverId) => (
                <option key={serverId} value={serverId}>{serverId} 服</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {rows.length === 0 ? <EmptyState message="没有符合条件的兽王玩家数据" /> : null}

      {rows.length > 0 ? (
        <section className="rounded-3xl border border-border bg-card p-0 shadow-sm overflow-hidden">
          <div className="divide-y divide-border md:hidden">
            {pageRows.map((row) => {
              const expanded = expandedUid === row.uid;
              return (
                <div key={row.uid} className="p-4">
                  <button
                    type="button"
                    onClick={() => setExpandedUid((previous) => previous === row.uid ? null : row.uid)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3">
                          <div className="text-lg font-semibold text-textMain">#{row.rank}</div>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-primary">{row.currentName}</div>
                            <div className="mt-1 break-all font-mono text-xs text-textSub">{row.uid}</div>
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-xs text-textSub">兽王次数</div>
                        <div className="mt-1 font-mono text-lg font-semibold text-textMain">{row.championCount}</div>
                      </div>
                    </div>
                  </button>

                  {expanded ? (
                    <div className="mt-4 space-y-4 border-t border-border pt-4">
                      <div className="rounded-2xl border border-border bg-surface p-3">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <div className="text-xs text-textSub">区服覆盖</div>
                            <div className="mt-1 font-semibold text-textMain">{row.sidCoverage.join('、')} 服</div>
                          </div>
                          <div>
                            <div className="text-xs text-textSub">兽王获得次数</div>
                            <div className="mt-1 font-semibold text-textMain">{row.championCount}</div>
                          </div>
                          <div>
                            <div className="text-xs text-textSub">首次夺冠</div>
                            <div className="mt-1 font-semibold text-textMain">{row.firstChampionSeason == null ? '-' : formatSeasonLabel(row.firstChampionSeason)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-textSub">最近夺冠</div>
                            <div className="mt-1 font-semibold text-textMain">{row.latestChampionSeason == null ? '-' : formatSeasonLabel(row.latestChampionSeason)}</div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-card p-3">
                        <div className="text-sm font-semibold text-textMain">曾用名</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {normalizeAliasList(row.winnerAliasList).map((alias) => (
                            <span key={`${row.uid}-${alias}`} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-textSub">{alias}</span>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-card p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-textMain">夺冠赛季记录</div>
                          <div className="text-xs text-textSub">共 {row.seasonWins.length} 次</div>
                        </div>
                        <div className="mt-3 overflow-auto rounded-xl border border-border">
                          <table className="min-w-[520px] w-full text-sm">
                            <thead className="bg-surface text-textSub">
                              <tr className="border-b border-border">
                                <th className="px-3 py-3 text-left font-semibold">赛季</th>
                                <th className="px-3 py-3 text-left font-semibold">当时昵称</th>
                                <th className="px-3 py-3 text-left font-semibold">宠物配置</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border text-textMain">
                              {row.seasonWins.map((item) => (
                                <tr key={`${row.uid}-${item.season}-${item.sid}-${item.winnerNameAtThatTime}`} className="hover:bg-surface/60">
                                  <td className="px-3 py-3 font-semibold">{formatSeasonLabel(item.season)}</td>
                                  <td className="px-3 py-3 text-textSub">{item.winnerNameAtThatTime}</td>
                                  <td className="px-3 py-3 text-textSub">{championLineupMap.get(`${row.uid}-${item.season}`) || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-auto md:block">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="bg-surface text-textSub shadow-sm">
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold">名次</th>
                  <th className="px-4 py-3 text-left font-semibold">UID</th>
                  <th className="px-4 py-3 text-left font-semibold">名字</th>
                  <th className="px-4 py-3 text-left font-semibold">兽王获得次数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-textMain">
                {pageRows.map((row) => {
                  const expanded = expandedUid === row.uid;
                  return (
                    <>
                      <tr key={row.uid} className="hover:bg-surface/60">
                        <td className="px-4 py-3 font-semibold">{row.rank}</td>
                        <td className="px-4 py-3 font-mono text-textSub">{row.uid}</td>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => setExpandedUid((previous) => previous === row.uid ? null : row.uid)} className="text-left font-semibold text-primary">
                            {row.currentName}
                          </button>
                        </td>
                        <td className="px-4 py-3 font-mono">{row.championCount}</td>
                      </tr>

                      {expanded ? (
                        <tr key={`${row.uid}-expanded`} className="bg-surface/40">
                          <td colSpan={4} className="px-4 py-4">
                            <div className="space-y-4">
                              <div className="rounded-2xl border border-border bg-card p-4">
                                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                  <div>
                                    <div className="text-lg font-semibold text-textMain">{row.currentName}</div>
                                    <div className="mt-1 font-mono text-xs text-textSub break-all">{row.uid}</div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:min-w-[560px] xl:max-w-[720px]">
                                    <div className="rounded-xl border border-border bg-surface px-3 py-3">
                                      <div className="text-xs text-textSub">兽王获得次数</div>
                                      <div className="mt-1 font-semibold text-textMain">{row.championCount}</div>
                                    </div>
                                    <div className="rounded-xl border border-border bg-surface px-3 py-3">
                                      <div className="text-xs text-textSub">区服覆盖</div>
                                      <div className="mt-1 font-semibold text-textMain">{row.sidCoverage.join('、')} 服</div>
                                    </div>
                                    <div className="rounded-xl border border-border bg-surface px-3 py-3">
                                      <div className="text-xs text-textSub">首次夺冠</div>
                                      <div className="mt-1 font-semibold text-textMain">{row.firstChampionSeason == null ? '-' : formatSeasonLabel(row.firstChampionSeason)}</div>
                                    </div>
                                    <div className="rounded-xl border border-border bg-surface px-3 py-3">
                                      <div className="text-xs text-textSub">最近夺冠</div>
                                      <div className="mt-1 font-semibold text-textMain">{row.latestChampionSeason == null ? '-' : formatSeasonLabel(row.latestChampionSeason)}</div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-2xl border border-border bg-card p-4">
                                <div className="text-sm font-semibold text-textMain">曾用名</div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {normalizeAliasList(row.winnerAliasList).map((alias) => (
                                    <span key={`${row.uid}-${alias}`} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-textSub">{alias}</span>
                                  ))}
                                </div>
                              </div>

                              <div className="rounded-2xl border border-border bg-card p-4">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm font-semibold text-textMain">夺冠赛季记录</div>
                                  <div className="text-xs text-textSub">共 {row.seasonWins.length} 次</div>
                                </div>
                                <div className="mt-3 overflow-auto rounded-xl border border-border">
                                  <table className="min-w-[680px] w-full text-sm">
                                    <thead className="bg-surface text-textSub">
                                      <tr className="border-b border-border">
                                        <th className="px-3 py-3 text-left font-semibold">赛季</th>
                                        <th className="px-3 py-3 text-left font-semibold">当时昵称</th>
                                        <th className="px-3 py-3 text-left font-semibold">宠物配置</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border text-textMain">
                                      {row.seasonWins.map((item) => (
                                        <tr key={`${row.uid}-${item.season}-${item.sid}-${item.winnerNameAtThatTime}`} className="hover:bg-surface/60">
                                          <td className="px-3 py-3 font-semibold">{formatSeasonLabel(item.season)}</td>
                                          <td className="px-3 py-3 text-textSub">{item.winnerNameAtThatTime}</td>
                                          <td className="px-3 py-3 text-textSub">{championLineupMap.get(`${row.uid}-${item.season}`) || '-'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-textSub">显示第 {pageStart}-{pageEnd} 条，共 {rows.length} 条</div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage(1)} disabled={safePage === 1} className="rounded-lg border border-border px-3 py-2 text-sm text-textSub disabled:opacity-40">首页</button>
              <button type="button" onClick={() => setPage((previous) => Math.max(1, previous - 1))} disabled={safePage === 1} className="rounded-lg border border-border px-3 py-2 text-sm text-textSub disabled:opacity-40">上一页</button>
              <div className="px-2 text-sm text-textMain">{safePage} / {totalPages}</div>
              <button type="button" onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))} disabled={safePage === totalPages} className="rounded-lg border border-border px-3 py-2 text-sm text-textSub disabled:opacity-40">下一页</button>
              <button type="button" onClick={() => setPage(totalPages)} disabled={safePage === totalPages} className="rounded-lg border border-border px-3 py-2 text-sm text-textSub disabled:opacity-40">末页</button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default function BeastStats({ detailSource, lineupSource, playerSource, loading = false }: BeastStatsProps) {
  const [activeTab, setActiveTab] = useState<BeastTab>('detail');
  const [detailData, setDetailData] = useState<BeastDetailResponse | undefined>(detailSource);
  const [lineupData, setLineupData] = useState<BeastLineupAnalysisResponse | undefined>(lineupSource);
  const [playerData, setPlayerData] = useState<BeastPlayerAnalysisResponse | undefined>(playerSource);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setDetailData(detailSource);
  }, [detailSource]);

  useEffect(() => {
    setLineupData(lineupSource);
  }, [lineupSource]);

  useEffect(() => {
    setPlayerData(playerSource);
  }, [playerSource]);

  useEffect(() => {
    let cancelled = false;

    async function loadMissing() {
      try {
        const tasks: Promise<void>[] = [];

        if (!detailSource) {
          tasks.push(fetchDataFile<BeastDetailResponse>('beast_detail').then((data) => {
            if (!cancelled) setDetailData(data);
          }));
        }

        if (!lineupSource) {
          tasks.push(fetchDataFile<BeastLineupAnalysisResponse>('beast_lineup_analysis').then((data) => {
            if (!cancelled) setLineupData(data);
          }));
        }

        if (!playerSource) {
          tasks.push(fetchDataFile<BeastPlayerAnalysisResponse>('beast_player_analysis').then((data) => {
            if (!cancelled) setPlayerData(data);
          }));
        }

        if (tasks.length === 0) return;
        await Promise.all(tasks);
        if (!cancelled) setErrorMessage(null);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : '万兽统计数据加载失败');
        }
      }
    }

    void loadMissing();

    return () => {
      cancelled = true;
    };
  }, [detailSource, lineupSource, playerSource]);

  if (loading && (!detailData || !lineupData || !playerData)) {
    return <EmptyState message="正在加载万兽统计数据..." />;
  }

  if (errorMessage) {
    return <EmptyState message={errorMessage} />;
  }

  if (!detailData || !lineupData || !playerData) {
    return <EmptyState message="万兽统计数据暂未准备完成" />;
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="flex gap-2 p-1 bg-surface border border-border rounded-xl w-max max-w-[calc(100vw-2rem)] overflow-x-auto custom-scrollbar relative z-10">
        {[
          { id: 'detail', label: '详情' },
          { id: 'lineup', label: '阵容分析' },
          { id: 'players', label: '兽王玩家分析' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as BeastTab)}
            className={clsx(
              'px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 flex items-center gap-2 relative overflow-hidden',
              activeTab === tab.id
                ? 'text-white shadow-lg shadow-primary/20 bg-primary/20 border border-primary/50'
                : 'text-textSub hover:text-textMain hover:bg-white/5 border border-transparent'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'detail' ? <DetailTab source={detailData} /> : null}
      {activeTab === 'lineup' ? <LineupTab source={lineupData} /> : null}
      {activeTab === 'players' ? <PlayerTab source={playerData} detailSource={detailData} /> : null}
    </div>
  );
}
