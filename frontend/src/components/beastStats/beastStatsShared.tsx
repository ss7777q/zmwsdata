import type { BeastDetailResponse, BeastLineupAnalysisResponse, BeastLineupCatalogItem, BeastLineupDataset, BeastPlayerAnalysisResponse } from '../../lib/api';

export type BeastTab = 'detail' | 'lineup' | 'players';
export type DetailNameMode = 'species_then_winner' | 'nickname_then_current';
export type DetailAnomalyFilter = 'all' | 'normal' | 'anomaly';
export type DatasetMode = 'cleaned' | 'raw';
export type MatrixSortKey = 'pet' | 'total' | `season:${number}`;
export type MatrixSortDirection = 'asc' | 'desc';

export const DETAIL_PAGE_SIZE = 20;
export const MOBILE_CHART_MIN_WIDTH = 720;
export const CHART_WIDTH_PER_SEASON = 44;
export const FIXED_CHART_HEIGHT = 360;

export interface BeastStatsProps {
  detailSource?: BeastDetailResponse;
  lineupSource?: BeastLineupAnalysisResponse;
  playerSource?: BeastPlayerAnalysisResponse;
  loading?: boolean;
}

export const CHART_COLORS = ['#2563eb', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];

export interface SortedTooltipEntry {
  label: string;
  color: string;
  value: number;
}

export interface RawTooltipEntry {
  dataKey?: unknown;
  name?: unknown;
  color?: string;
  value?: unknown;
}

export function formatNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '-';
  return value.toLocaleString('zh-CN');
}

export function formatSeasonLabel(season: number) {
  if (season >= 1 && season <= 3) {
    return `测试${season}赛季`;
  }

  return `${season - 3}赛季`;
}

export function buildPetLabelMap(petCatalog: BeastLineupCatalogItem[]) {
  return new Map(petCatalog.map((item) => [item.petId, item.petSpeciesName]));
}

export function getPetSpeciesName(petSpeciesNameById: Record<string, string>, petId: number) {
  return petSpeciesNameById[String(petId)] || '未知宠物(' + petId + ')';
}

export function buildChartRows(dataset: BeastLineupDataset, selectedPetIds: number[], source: Record<string, Record<string, number>>) {
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

export function getCountHeatStyle(value: number, maxValue: number) {
  if (value <= 0 || maxValue <= 0) {
    return undefined;
  }

  const ratio = value / maxValue;
  const alpha = 0.08 + ratio * 0.32;
  return {
    backgroundColor: `rgba(37, 99, 235, ${alpha.toFixed(3)})`,
  };
}

export function getScrollableChartWidth(seasonCount: number) {
  return Math.max(MOBILE_CHART_MIN_WIDTH, seasonCount * CHART_WIDTH_PER_SEASON);
}

export function normalizeAliasList(value: unknown, fallback?: string) {
  const rawList = Array.isArray(value) ? value : [];
  const list = rawList.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  if (fallback && fallback.trim().length > 0 && !list.includes(fallback)) {
    list.push(fallback);
  }
  return list;
}

export function renderSortedTooltip(
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

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center text-textSub">
      {message}
    </div>
  );
}
