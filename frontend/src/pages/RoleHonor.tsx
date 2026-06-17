import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { Award, Search, SlidersHorizontal, Tags } from 'lucide-react';
import CostBadge from '../components/ui/CostBadge';
import { METRIC_COLORS } from '../lib/boss-stats';

type CostItem = { itemId: number; name: string; count: number };
type HonorAttribute = { field: string; name: string; value: number };
type AttributeRow = { id: number; playerLevel: number; attributes: HonorAttribute[] };

type HonorRow = {
  id: number;
  name: string;
  level: number;
  type?: number | null;
  typeLabel?: string;
  getDesc?: string | null;
  resetText?: string | null;
  group?: number;
  attributeRows?: AttributeRow[];
  attributes?: HonorAttribute[];
  attributeText?: string;
  upgradeCost?: CostItem[] | null;
  rankCost?: CostItem[] | null;
  cumulativeCost?: CostItem[] | null;
};

type HonorGroup = {
  id: string;
  group?: number;
  kind: 'regular' | 'level_series' | 'mainline_series';
  category: 'with_attributes' | 'without_attributes';
  seriesKey: string;
  seriesName: string;
  name: string;
  showName?: string;
  showNameIndex?: number;
  type?: number | null;
  typeLabel?: string;
  levelLinked: boolean;
  hasAttributes: boolean;
  hasUpgradeCost: boolean;
  rankCount: number;
  maxRankLevel: number;
  rows: HonorRow[];
  searchText?: string;
};

type HonorPayload = {
  configuredMaxLevel?: number;
  stats?: {
    totalGroups: number;
    withAttributes: number;
    withoutAttributes: number;
    levelLinked: number;
    regularUpgradeChains: number;
  };
  groups: HonorGroup[];
};

interface Props {
  dataSources: Record<string, any>;
}

const L = {
  noAttributes: '\u65e0\u5c5e\u6027',
  noCost: '\u65e0\u6d88\u8017',
  rank: '\u9636\u6570',
  attributes: '\u5c5e\u6027',
  name: '\u540d\u79f0',
  costToRank: '\u5347\u5230\u6b64\u9636\u7684\u6d88\u8017',
  totalCost: '\u7d2f\u8ba1\u603b\u6d88\u8017',
  dataMissing: '\u65e0\u6570\u636e\u5c1a\u672a\u52a0\u8f7d\u3002',
  withAttributes: '\u5e26\u5c5e\u6027',
  withoutAttributes: '\u4e0d\u5e26\u5c5e\u6027',
  category: '\u79f0\u53f7\u5206\u7c7b',
  searchPlaceholder: '\u641c\u7d22\u79f0\u53f7\u3001\u5c5e\u6027\u3001\u6d88\u8017',
  honor: '\u79f0\u53f7',
  items: '\u9879',
  byLevel: '\u6309\u7b49\u7ea7',
  hasUpgrade: '\u6709\u5347\u9636',
  noMatches: '\u6ca1\u6709\u5339\u914d\u7684\u79f0\u53f7\u3002',
  seriesHonor: '\u7cfb\u5217\u79f0\u53f7',
  mainlineGroup: '\u4e3b\u7ebf\u805a\u5408',
  upgradeChain: '\u5347\u9636\u94fe',
  upgradeCost: '\u5347\u9636\u6d88\u8017',
  playerLevel: '\u4eba\u7269\u7b49\u7ea7',
  current: '\u5f53\u524d',
};

const HONOR_ATTRIBUTE_COLORS: Record<string, string> = {
  ...METRIC_COLORS,
  mp: 'text-blue-500',
  healMp: 'text-indigo-400',
};

function asPayload(value: unknown): HonorPayload {
  if (!value || typeof value !== 'object') return { groups: [] };
  const payload = value as Partial<HonorPayload>;
  return {
    configuredMaxLevel: typeof payload.configuredMaxLevel === 'number' ? payload.configuredMaxLevel : undefined,
    stats: payload.stats,
    groups: Array.isArray(payload.groups) ? payload.groups : [],
  };
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toLocaleString('zh-Hans-CN') : String(value);
}

function formatAttributes(attributes?: HonorAttribute[]) {
  if (!attributes || attributes.length === 0) return L.noAttributes;
  return attributes.map((attr) => attr.name + ' +' + formatNumber(attr.value)).join(' / ');
}

function pickAttributeAtLevel(rows: AttributeRow[] | undefined, level: number) {
  if (!rows || rows.length === 0) return null;
  let selected: AttributeRow | null = null;
  for (const row of rows) {
    if (row.playerLevel > level) break;
    selected = row;
  }
  return selected;
}

function costText(cost?: CostItem[] | null) {
  if (!cost || cost.length === 0) return L.noCost;
  return cost.map((item) => item.name + ' x' + formatNumber(item.count)).join(' / ');
}

function CostList({ cost, center }: { cost?: CostItem[] | null; center?: boolean }) {
  if (!cost || cost.length === 0) return <span className="text-xs text-textSub">{L.noCost}</span>;
  return (
    <div className={clsx("flex flex-wrap gap-1.5", center && "justify-center")}>
      {cost.map((item) => (
        <CostBadge key={item.itemId} itemId={item.itemId} name={item.name} count={item.count} />
      ))}
    </div>
  );
}

function AttributeList({ attributes, center }: { attributes?: HonorAttribute[]; center?: boolean }) {
  if (!attributes || attributes.length === 0) return <span className="text-textSub">{L.noAttributes}</span>;
  return (
    <div className={clsx("flex flex-wrap gap-x-3 gap-y-1.5", center && "justify-center")}>
      {attributes.map((attr) => (
        <span key={attr.field} className={clsx('inline-flex items-baseline gap-1 font-mono font-semibold whitespace-nowrap', HONOR_ATTRIBUTE_COLORS[attr.field] || 'text-textMain')}>
          <span className="font-sans">{attr.name}</span>
          <span>+{formatNumber(attr.value)}</span>
        </span>
      ))}
    </div>
  );
}

function DetailBadge({ children }: { children: ReactNode }) {
  return <span className="rounded-md border border-border/60 bg-slate-500/[0.04] px-2 py-0.5 text-[11px] font-medium text-textSub">{children}</span>;
}

function RegularTable({ group }: { group: HonorGroup }) {
  const withAttributes = group.hasAttributes;
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-slate-500/[0.04] text-xs text-textSub">
            <tr>
              <th className="w-24 px-4 py-3 text-center font-semibold">{L.rank}</th>
              <th className="min-w-[220px] px-4 py-3 text-center font-semibold">{withAttributes ? L.attributes : L.name}</th>
              <th className="min-w-[220px] px-4 py-3 text-center font-semibold">{L.costToRank}</th>
              <th className="min-w-[220px] px-4 py-3 text-center font-semibold">{L.totalCost}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {group.rows.map((row) => (
              <tr key={row.id} className="align-top">
                <td className="px-4 py-3 font-mono text-xs text-textSub text-center">{row.level ? 'Lv.' + row.level : '-'}</td>
                <td className="px-4 py-3 text-center">
                  <div className="font-semibold text-textMain">{withAttributes ? <AttributeList attributes={row.attributes} center /> : row.name}</div>
                </td>
                <td className="px-4 py-3 text-center"><CostList cost={row.upgradeCost} center /></td>
                <td className="px-4 py-3 text-center"><CostList cost={row.cumulativeCost} center /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NameAttributeTable({ group, playerLevel }: { group: HonorGroup; playerLevel: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-slate-500/[0.04] text-xs text-textSub">
            <tr>
              <th className="min-w-[180px] px-4 py-3 text-center font-semibold">{L.name}</th>
              <th className="min-w-[260px] px-4 py-3 text-center font-semibold">{L.attributes}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {group.rows.map((row) => {
              const picked = group.levelLinked ? pickAttributeAtLevel(row.attributeRows, playerLevel) : null;
              const attributes = group.levelLinked ? picked?.attributes : row.attributes;
              return (
                <tr key={row.id} className="align-top">
                  <td className="px-4 py-3 text-center">
                    <div className="font-semibold text-textMain">{row.name}</div>
                  </td>
                  <td className="px-4 py-3 text-center text-textMain"><AttributeList attributes={attributes} center /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function levelSearchText(group: HonorGroup, playerLevel: number) {
  return group.rows.map((row) => {
    const picked = group.levelLinked ? pickAttributeAtLevel(row.attributeRows, playerLevel) : null;
    return [row.name, row.getDesc, formatAttributes(group.levelLinked ? picked?.attributes : row.attributes), costText(row.upgradeCost), costText(row.cumulativeCost)].join(' ');
  }).join(' ');
}

export default function RoleHonor({ dataSources }: Props) {
  const payload = asPayload(dataSources.role_honor?.data);
  const groups = payload.groups;
  const configuredMaxLevel = payload.configuredMaxLevel ?? 1;
  const [category, setCategory] = useState<'with_attributes' | 'without_attributes'>('with_attributes');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playerLevelInput, setPlayerLevelInput] = useState(String(configuredMaxLevel));

  useEffect(() => {
    setPlayerLevelInput(String(configuredMaxLevel));
  }, [configuredMaxLevel]);

  const playerLevel = useMemo(() => {
    const parsed = Number(playerLevelInput);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : configuredMaxLevel;
  }, [configuredMaxLevel, playerLevelInput]);

  const levelLinkedGroups = useMemo(() => groups.filter((group) => group.levelLinked), [groups]);
  const maxAvailableLevel = useMemo(() => {
    const levels = levelLinkedGroups.flatMap((group) => group.rows.flatMap((row) => (row.attributeRows || []).map((item) => item.playerLevel)));
    return levels.length ? Math.max(...levels) : configuredMaxLevel;
  }, [configuredMaxLevel, levelLinkedGroups]);

  const filteredGroups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return groups.filter((group) => {
      if (group.category !== category) return false;
      if (!normalized) return true;
      const text = [group.name, group.seriesName, group.showName, group.typeLabel, group.searchText, levelSearchText(group, playerLevel)].filter(Boolean).join(' ').toLowerCase();
      return text.includes(normalized);
    });
  }, [category, groups, playerLevel, query]);

  useEffect(() => {
    if (filteredGroups.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) => current && filteredGroups.some((group) => group.id === current) ? current : filteredGroups[0].id);
  }, [filteredGroups]);

  const activeGroup = useMemo(() => filteredGroups.find((group) => group.id === selectedId) || filteredGroups[0] || null, [filteredGroups, selectedId]);

  if (!groups.length) {
    return <div className="rounded-lg border border-dashed border-border px-6 py-14 text-center text-sm text-textSub">{L.dataMissing}</div>;
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-500 pb-10">
      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-textMain">
              <Tags className="h-4 w-4 text-primary" />
              <span>{L.category}</span>
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-500/[0.06] p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setCategory('with_attributes')}
                className={clsx('rounded-md px-2 py-2 transition-colors', category === 'with_attributes' ? 'bg-card text-textMain shadow-sm' : 'text-textSub hover:text-textMain')}
              >
                {L.withAttributes}
              </button>
              <button
                type="button"
                onClick={() => setCategory('without_attributes')}
                className={clsx('rounded-md px-2 py-2 transition-colors', category === 'without_attributes' ? 'bg-card text-textMain shadow-sm' : 'text-textSub hover:text-textMain')}
              >
                {L.withoutAttributes}
              </button>
            </div>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-textSub" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={L.searchPlaceholder}
                className="h-10 w-full rounded-lg border border-border bg-slate-500/[0.04] pl-9 pr-3 text-sm text-textMain outline-none transition-colors focus:border-primary"
              />
            </label>
          </div>
          <div className="max-h-[70vh] space-y-2 overflow-auto p-3 custom-scrollbar">
            {filteredGroups.map((group) => {
              const selected = activeGroup?.id === group.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setSelectedId(group.id)}
                  className={clsx('w-full rounded-lg border p-3 text-left transition-colors', selected ? 'border-primary/35 bg-primary/10' : 'border-transparent bg-slate-500/[0.025] hover:border-border hover:bg-slate-500/[0.05]')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className={clsx('truncate text-sm font-bold', selected ? 'text-primary' : 'text-textMain')}>{group.name}</div>
                      <div className="mt-1 truncate text-xs text-textSub">{group.showName || group.typeLabel || L.honor}</div>
                    </div>
                    <Award className={clsx('mt-0.5 h-4 w-4 shrink-0', selected ? 'text-primary' : 'text-textSub/60')} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <DetailBadge>{group.rankCount} {L.items}</DetailBadge>
                    {group.levelLinked ? <DetailBadge>{L.byLevel}</DetailBadge> : null}
                    {group.hasUpgradeCost ? <DetailBadge>{L.hasUpgrade}</DetailBadge> : null}
                  </div>
                </button>
              );
            })}
            {filteredGroups.length === 0 ? <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-textSub">{L.noMatches}</div> : null}
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          {activeGroup ? (
            <>
              <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl font-bold text-textMain">{activeGroup.name}</h3>
                      <DetailBadge>{activeGroup.hasAttributes ? L.withAttributes : L.withoutAttributes}</DetailBadge>
                      <DetailBadge>{activeGroup.kind === 'level_series' ? L.seriesHonor : activeGroup.kind === 'mainline_series' ? L.mainlineGroup : L.upgradeChain}</DetailBadge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <DetailBadge>{activeGroup.rankCount} {L.items}</DetailBadge>
                      {activeGroup.typeLabel ? <DetailBadge>{activeGroup.typeLabel}</DetailBadge> : null}
                      {activeGroup.hasUpgradeCost ? <DetailBadge>{L.upgradeCost}</DetailBadge> : null}
                    </div>
                  </div>
                  {activeGroup.levelLinked ? (
                    <div className="w-full rounded-lg border border-border bg-slate-500/[0.025] p-3 lg:w-72">
                      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-textSub">
                        <SlidersHorizontal className="h-4 w-4 text-primary" />
                        <span>{L.playerLevel}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={maxAvailableLevel}
                          value={playerLevelInput}
                          onChange={(event) => setPlayerLevelInput(event.target.value)}
                          className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-textMain outline-none focus:border-primary"
                        />
                        <button
                          type="button"
                          onClick={() => setPlayerLevelInput(String(configuredMaxLevel))}
                          className="h-10 rounded-lg border border-border px-3 text-xs font-semibold text-textSub transition-colors hover:text-textMain"
                        >
                          {L.current}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              {activeGroup.kind === 'regular' ? (
                <RegularTable group={activeGroup} />
              ) : (
                <NameAttributeTable group={activeGroup} playerLevel={playerLevel} />
              )}
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-6 py-14 text-center text-sm text-textSub">{L.noMatches}</div>
          )}
        </section>
      </div>
    </div>
  );
}
