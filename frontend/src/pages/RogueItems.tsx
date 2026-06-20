import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Search, SlidersHorizontal } from 'lucide-react';
import { clsx } from 'clsx';
import CostBadge from '../components/ui/CostBadge';

type CostItem = { itemId: number; name: string; count: number };
type RogueAttribute = { label: string; value: unknown; rawField?: string };
type RogueStage = {
  id: number;
  name: string;
  officialDescription: string | null;
  level: number | null;
  limit: number | null;
  stageLevelLimit: number | null;
  cooldownConfig: number | null;
  scriptIds: number[];
  skill: unknown;
  attributes: RogueAttribute[];
  packageContents: CostItem[];
  addItems: CostItem[];
  sellCost: CostItem[] | null;
  sacredTowerSellCost: CostItem[] | null;
  sacredTowerDropId: number | null;
  sacredTowerWeight: number | null;
  score: number | null;
  canSpecialBagShow: boolean;
  addRule: unknown;
  guideMechanics: string[];
  cooldownMechanics: string[];
  damageMechanics: string[];
  damageWarnings: string[];
  configMechanics: string[];
};

type RogueItem = {
  id: string;
  groupId: string;
  configGroupId: number;
  name: string;
  displayName: string;
  officialDescription: string | null;
  type: string | null;
  typeLabel: string;
  priority: number;
  hasManualExplanation: boolean;
  hasDerivedExplanation: boolean;
  hasExplanation: boolean;
  explanationLevel: 'manual' | 'derived' | 'config' | 'unknown';
  source: string;
  sourceType: string;
  summary: string;
  mechanics: string[];
  damageMechanics: string[];
  derivedSummary: string;
  derivedMechanics: string[];
  warnings: string[];
  stages: RogueStage[];
  searchText: string;
};

type RogueTypeGroup = {
  type: string;
  label: string;
  count: number;
  explainedCount: number;
  derivedCount: number;
  unknownCount: number;
};

type RoguePayload = {
  summary?: {
    rowCount: number;
    itemCount: number;
    explainedItemCount: number;
    derivedItemCount: number;
    totalExplainedItemCount: number;
    unknownItemCount: number;
    sourceGuide: string;
    sourceConfig: string;
    note: string;
  };
  typeGroups?: RogueTypeGroup[];
  items?: RogueItem[];
};

interface Props {
  dataSources: Record<string, any>;
}

const ALL_TYPES = '全部类型';
function asPayload(value: unknown): RoguePayload {
  if (!value || typeof value !== 'object') return {};
  const payload = value as RoguePayload;
  return {
    summary: payload.summary,
    typeGroups: Array.isArray(payload.typeGroups) ? payload.typeGroups : [],
    items: Array.isArray(payload.items) ? payload.items : [],
  };
}

function sanitizeVisibleText(text: string) {
  return text
    .replace(/\bID\s*\d+\b/gi, '')
    .replace(/附带效果\s*\d{3,}/g, '附带效果')
    .replace(/引用的效果\s*\d{3,}/g, '引用的效果')
    .replace(/未找到效果\s*\d{3,}/g, '未找到对应效果')
    .replace(/虚拟技能\s*\d{3,}/g, '虚拟技能')
    .replace(/技能\s*\d{3,}/g, '技能')
    .replace(/召唤物\s*\d{3,}/g, '召唤物')
    .replace(/Buff\s*\d{3,}/gi, '效果')
    .replace(/掉落组\s*\d+/g, '掉落配置')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function formatValue(value: unknown) {
  if (value == null || value === '') return '-';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString('zh-Hans-CN') : String(value);
  if (typeof value === 'string') return sanitizeVisibleText(value);
  return sanitizeVisibleText(JSON.stringify(value));
}

function normalizeForSearch(value: string) {
  return value.trim().toLowerCase();
}

function CostList({ cost }: { cost: CostItem[] | null }) {
  if (!cost || cost.length === 0) return <span className="text-xs text-textSub">无出售价格</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {cost.map((item) => (
        <CostBadge key={`${item.itemId}-${item.count}`} itemId={item.itemId} name={item.name || '未知道具'} count={item.count} />
      ))}
    </div>
  );
}

function MechanicList({ items, tone = 'normal' }: { items: string[]; tone?: 'normal' | 'warn' }) {
  if (items.length === 0) return null;
  const dot = tone === 'warn' ? 'bg-amber-500' : 'bg-primary';
  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <p key={item} className="flex gap-3 text-sm leading-7 text-textSub">
          <span className={clsx('mt-2 h-2 w-2 shrink-0 rounded-full', dot)} />
          <span className="break-words">{sanitizeVisibleText(item)}</span>
        </p>
      ))}
    </div>
  );
}

function StageTable({ stages, showConfigMechanics }: { stages: RogueStage[]; showConfigMechanics: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-slate-500/[0.04] text-xs text-textSub">
            <tr>
              <th className="min-w-[160px] px-4 py-3 text-left font-semibold">阶段</th>
              <th className="w-24 px-4 py-3 text-center font-semibold">等级</th>
              <th className="w-24 px-4 py-3 text-center font-semibold">上限</th>
              <th className="min-w-[220px] px-4 py-3 text-left font-semibold">官方描述</th>
              <th className="min-w-[280px] px-4 py-3 text-left font-semibold">阶段说明</th>
              <th className="min-w-[190px] px-4 py-3 text-left font-semibold">出售/掉落</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {stages.map((stage) => (
              <tr key={stage.id} className="align-top">
                <td className="px-4 py-3">
                  <div className="font-semibold text-textMain">{sanitizeVisibleText(stage.name)}</div>
                </td>
                <td className="px-4 py-3 text-center font-mono text-xs text-textSub">{formatValue(stage.level)}</td>
                <td className="px-4 py-3 text-center font-mono text-xs text-textSub">{formatValue(stage.limit)}</td>
                <td className="px-4 py-3 text-sm leading-7 text-textSub">{stage.officialDescription ? sanitizeVisibleText(stage.officialDescription) : <span className="text-xs text-textSub">无</span>}</td>
                <td className="px-4 py-3">
                  <div className="space-y-3">
                    {(stage.guideMechanics || []).length ? (
                      <div>
                        <MechanicList items={stage.guideMechanics || []} />
                      </div>
                    ) : null}
                    {(stage.cooldownMechanics || []).length ? (
                      <div>
                        <div className="mb-1 text-[11px] font-semibold text-primary">冷却</div>
                        <MechanicList items={stage.cooldownMechanics || []} />
                      </div>
                    ) : null}
                    {(stage.damageMechanics || []).length ? (
                      <div>
                        <MechanicList items={stage.damageMechanics || []} />
                      </div>
                    ) : null}
                    {showConfigMechanics && (stage.configMechanics || []).length ? (
                      <div>
                        <div className="mb-1 text-[11px] font-semibold text-primary">可确认机制</div>
                        <MechanicList items={stage.configMechanics || []} />
                      </div>
                    ) : null}
                    {!(stage.guideMechanics || []).length && !(stage.cooldownMechanics || []).length && !(stage.damageMechanics || []).length && (!showConfigMechanics || !(stage.configMechanics || []).length) ? <span className="text-xs text-textSub">无单独阶段说明</span> : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="space-y-2">
                    <CostList cost={stage.sellCost} />
                    {stage.sacredTowerSellCost ? (
                      <div>
                        <div className="mb-1 text-[11px] text-textSub">玲珑出售</div>
                        <CostList cost={stage.sacredTowerSellCost} />
                      </div>
                    ) : null}
                    {stage.sacredTowerWeight != null ? <div className="text-xs text-textSub">玲珑掉落权重 {formatValue(stage.sacredTowerWeight)}</div> : null}
                    {stage.score != null ? <div className="text-xs text-textSub">计分 {formatValue(stage.score)}</div> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AttributeBlock({ stages }: { stages: RogueStage[] }) {
  const rows = stages.flatMap((stage) => stage.attributes
    .filter((attribute) => attribute.rawField !== 'buff')
    .map((attribute) => ({ stage, attribute })));
  if (rows.length === 0) return null;
  return (
    <section className="border-t border-border pt-5">
      <h3 className="mb-3 text-sm font-semibold text-textMain">属性数值</h3>
      <div className="flex flex-wrap gap-2">
        {rows.map(({ stage, attribute }) => (
          <span key={`${stage.id}-${attribute.label}-${attribute.rawField || ''}`} className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-textSub">
            {sanitizeVisibleText(stage.name)}：{sanitizeVisibleText(attribute.label)} {formatValue(attribute.value)}
          </span>
        ))}
      </div>
    </section>
  );
}

export default function RogueItems({ dataSources }: Props) {
  const payload = asPayload(dataSources.rogue_item_analysis?.data);
  const items = payload.items || [];
  const typeGroups = payload.typeGroups || [];
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState(ALL_TYPES);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const keyword = normalizeForSearch(query);
    return items.filter((item) => {
      if (typeFilter !== ALL_TYPES && item.type !== typeFilter) return false;
      if (!keyword) return true;
      return normalizeForSearch(item.searchText).includes(keyword);
    });
  }, [items, query, typeFilter]);

  const activeItem = filteredItems.find((item) => item.id === selectedId) || filteredItems[0] || items[0] || null;
  const activeDamageMechanics = activeItem?.damageMechanics || [];
  const visibleDerivedMechanics = activeItem
    ? activeItem.derivedMechanics.filter((item) => !activeDamageMechanics.includes(item))
    : [];

  return (
    <div className="space-y-6 pb-16">
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm lg:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px] md:items-end">
          <label className="text-sm text-textSub">
            <span className="mb-2 flex items-center gap-2 font-medium"><Search className="h-4 w-4" />搜索</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="input w-full" placeholder="道具、机制、阶段名" />
          </label>
          <label className="text-sm text-textSub">
            <span className="mb-2 flex items-center gap-2 font-medium"><SlidersHorizontal className="h-4 w-4" />类型</span>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="input w-full">
              <option value={ALL_TYPES}>{ALL_TYPES}</option>
              {typeGroups.map((group) => <option key={group.type} value={group.type}>{group.label}（{group.count}）</option>)}
            </select>
          </label>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-border bg-card p-3 shadow-sm xl:sticky xl:top-6 xl:max-h-[calc(100vh-8rem)] xl:overflow-auto">
          <div className="mb-2 px-2 py-2 text-sm font-semibold text-textMain">道具列表</div>
          <div className="space-y-2">
            {filteredItems.map((item) => {
              const selected = item.id === activeItem?.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={clsx('w-full rounded-lg border px-4 py-3 text-left transition-colors', selected ? 'border-primary bg-primary/10' : 'border-border bg-surface/45 hover:border-primary/40 hover:bg-surface')}
                >
                  <div className="flex items-center justify-between gap-3 text-xs text-textSub">
                    <span>{item.typeLabel}</span>
                    <span>{item.stages.length} 阶段</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {item.hasExplanation ? <CheckCircle2 className={clsx('h-4 w-4 shrink-0', item.hasManualExplanation ? 'text-emerald-500' : 'text-primary')} /> : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />}
                    <span className="text-sm font-semibold leading-6 text-textMain">{item.displayName || item.name}</span>
                  </div>
                  <div className="mt-2 line-clamp-2 text-xs leading-5 text-textSub">{item.summary || item.derivedSummary || item.warnings[0] || '阶段已聚合，机制说明待补充。'}</div>
                </button>
              );
            })}
            {filteredItems.length === 0 ? <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-textSub">没有匹配的局内道具</div> : null}
          </div>
        </aside>

        <article className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-sm lg:p-6">
          {!activeItem ? (
            <div className="py-20 text-center text-sm text-textSub">局内道具数据尚未生成</div>
          ) : (
            <div className="space-y-6">
              <header>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-textSub">
                  <span className="rounded-md border border-border bg-surface px-2.5 py-1">{activeItem.typeLabel}</span>
                  <span className={clsx('rounded-md border px-2.5 py-1', activeItem.hasManualExplanation ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' : activeItem.hasDerivedExplanation ? 'border-primary/30 bg-primary/10 text-primary' : 'border-amber-500/30 bg-amber-500/10 text-amber-600')}>
                    {activeItem.hasManualExplanation ? '机制说明' : activeItem.hasDerivedExplanation ? '自动解析' : '待核对'}
                  </span>
                </div>
                <h2 className="mt-4 text-2xl font-bold leading-tight text-textMain lg:text-3xl">{sanitizeVisibleText(activeItem.displayName || activeItem.name)}</h2>
                {activeItem.officialDescription ? (
                  <p className="mt-3 text-sm leading-7 text-textSub">
                    <span className="font-semibold text-textMain">官方描述：</span>
                    {sanitizeVisibleText(activeItem.officialDescription)}
                  </p>
                ) : null}
                {activeItem.summary ? <p className="mt-3 text-sm leading-7 text-textSub">{sanitizeVisibleText(activeItem.summary)}</p> : null}
                {!activeItem.summary && !activeItem.hasManualExplanation && activeItem.derivedSummary ? <p className="mt-3 text-sm leading-7 text-textSub">{sanitizeVisibleText(activeItem.derivedSummary)}</p> : null}
              </header>

              {activeItem.mechanics.length ? (
                <section className="border-t border-border pt-5">
                  <h3 className="mb-3 text-sm font-semibold text-textMain">机制说明</h3>
                  <MechanicList items={activeItem.mechanics} />
                </section>
              ) : null}

              {activeDamageMechanics.length ? (
                <section className="border-t border-border pt-5">
                  <h3 className="mb-3 text-sm font-semibold text-textMain">伤害明细</h3>
                  <MechanicList items={activeDamageMechanics} />
                </section>
              ) : null}

              {!activeItem.hasManualExplanation && visibleDerivedMechanics.length ? (
                <section className="border-t border-border pt-5">
                  <h3 className="mb-3 text-sm font-semibold text-textMain">可确认机制</h3>
                  <MechanicList items={visibleDerivedMechanics} />
                </section>
              ) : null}

              <section className="border-t border-border pt-5">
                <h3 className="mb-3 text-sm font-semibold text-textMain">阶段聚合</h3>
                <StageTable stages={activeItem.stages} showConfigMechanics={!activeItem.hasManualExplanation} />
              </section>

              <AttributeBlock stages={activeItem.stages} />

              {activeItem.warnings.length ? (
                <section className="border-t border-border pt-5">
                  <h3 className="mb-3 text-sm font-semibold text-textMain">仍待核对</h3>
                  <MechanicList items={activeItem.warnings} tone="warn" />
                </section>
              ) : null}
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
