import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpRight, Gauge, Plus, Target, Trophy, X } from 'lucide-react';
import { clsx } from 'clsx';
import type { AttributePriority, ExtremeModule, ExtractionScope, StageSelectionMap, CustomSelectionMap } from '../../lib/roleExtremeStats';
import { ATTR_LABELS, MODULE_TONE, MODULE_NAME_MAP, PASSIVE_RESIST_ATTR_FIELDS, attrEntries, formatNumber, mergeAttrs, resolveAllModuleSelections } from '../../lib/roleExtremeStats';

const ATTRIBUTE_CONTRIBUTION_ORDER = [
  'hp',
  'mp',
  'atk',
  'def',
  'healHp',
  'healMp',
  'hitVal',
  'dodge',
  'crit',
  'tenacity',
  'lucky',
  'guardian',
  'break',
  'protect',
];

function visibleAttrEntries(attrs: Record<string, number> = {}) {
  return attrEntries(attrs).filter(([field]) => !PASSIVE_RESIST_ATTR_FIELDS.has(field));
}

function visibleAttrsEqual(left: Record<string, number> = {}, right: Record<string, number> = {}) {
  const fields = new Set([
    ...visibleAttrEntries(left).map(([field]) => field),
    ...visibleAttrEntries(right).map(([field]) => field),
  ]);
  for (const field of fields) {
    if (Math.round(left[field] || 0) !== Math.round(right[field] || 0)) return false;
  }
  return true;
}

function normalizedContributionRows(item: any) {
  const point = item.selectedPoint;
  if (!point) return [];
  const exportedRows = Array.isArray(point.params?.systemContributionRows)
    ? point.params.systemContributionRows
    : [];
  if (exportedRows.length > 0) {
    const exportedAttrs: Record<string, number> = {};
    for (const row of exportedRows) mergeAttrs(exportedAttrs, row.attrs);
    if (visibleAttrsEqual(exportedAttrs, point.attrs)) {
      return exportedRows
        .filter((row: any) => visibleAttrEntries(row?.attrs || {}).length > 0)
        .map((row: any) => ({
          rowKey: `${item.module.key}:${row.key}`,
          moduleKey: item.module.key,
          moduleLabel: row.label || MODULE_NAME_MAP[item.module.key] || item.module.label,
          stageLabel: point.label,
          attrs: row.attrs || {},
          fightPower: typeof row.fightPower === 'number' ? row.fightPower : 0,
          fixedPowerOnly: false,
        }));
    }
  }
  if (visibleAttrEntries(point.attrs).length === 0) return [];
  return [{
    rowKey: item.module.key,
    moduleKey: item.module.key,
    moduleLabel: MODULE_NAME_MAP[item.module.key] || item.module.label,
    stageLabel: point.label,
    attrs: point.attrs || {},
    fightPower: point.fightPower || 0,
    fixedPowerOnly: false,
  }];
}

export function Overview({
  modules,
  extractionScope,
  stageSelections,
  customSelections,
  activeWeights,
  roleOptions,
  selectedHeroId,
  attributePriority,
  onSelectHeroId,
  onSetAttributePriority,
  onApplyAttributePriority,
  onSelectAllMax,
}: {
  modules: ExtremeModule[];
  extractionScope?: ExtractionScope;
  stageSelections: StageSelectionMap;
  customSelections: CustomSelectionMap;
  activeWeights: Record<string, number>;
  roleOptions: Array<{ heroId: number; heroName: string }>;
  selectedHeroId: number | null;
  attributePriority: AttributePriority;
  onSelectHeroId: (heroId: number | null) => void;
  onSetAttributePriority: (fields: AttributePriority) => void;
  onApplyAttributePriority: (fields?: AttributePriority) => void;
  onSelectAllMax: () => void;
}) {
  const readyModules = modules.filter(module => module.status === 'ready');
  const partialModules = modules.filter(module => module.status !== 'ready' && !module.status.startsWith('blocked'));
  const moduleSelections = useMemo(
    () => resolveAllModuleSelections(modules, stageSelections, customSelections, activeWeights, selectedHeroId, attributePriority),
    [modules, stageSelections, customSelections, activeWeights, selectedHeroId, attributePriority]
  );
  const selectedTotalPower = moduleSelections.reduce((sum, item) => sum + (item.selectedPoint?.fightPower || 0), 0);
  const selectedTotalAttrs = useMemo(() => {
    const attrs: Record<string, number> = {};
    for (const item of moduleSelections) mergeAttrs(attrs, item.selectedPoint?.attrs);
    return attrs;
  }, [moduleSelections]);
  const totalAttrEntries = visibleAttrEntries(selectedTotalAttrs);
  const contributionFields = useMemo(() => {
    const fields = new Set<string>();
    for (const field of attributePriority) {
      if (!PASSIVE_RESIST_ATTR_FIELDS.has(field)) fields.add(field);
    }
    for (const [field] of totalAttrEntries) fields.add(field);
    return Array.from(fields).sort((left, right) => {
      const leftIndex = ATTRIBUTE_CONTRIBUTION_ORDER.indexOf(left);
      const rightIndex = ATTRIBUTE_CONTRIBUTION_ORDER.indexOf(right);
      const leftKnown = leftIndex >= 0 ? leftIndex : ATTRIBUTE_CONTRIBUTION_ORDER.length;
      const rightKnown = rightIndex >= 0 ? rightIndex : ATTRIBUTE_CONTRIBUTION_ORDER.length;
      return leftKnown - rightKnown || left.localeCompare(right);
    });
  }, [attributePriority, totalAttrEntries]);
  const contributionRows = useMemo(() => moduleSelections.flatMap(normalizedContributionRows), [moduleSelections]);
  const rememberedCount = moduleSelections.filter(item => item.remembered).length;
  const customizedCount = moduleSelections.filter(item => item.customized).length;
  const personalizedCount = moduleSelections.filter(item => (
    item.customized || (item.selectedPoint && item.maxPoint && item.selectedPoint.stageKey !== item.maxPoint.stageKey)
  )).length;
  const configuredMaxLevel = extractionScope?.configuredMaxLevel;
  const blockedCount = extractionScope?.blockedOrPendingModuleKeys?.length || 0;
  const navigate = useNavigate();
  const availableAttributes = Object.entries(ATTR_LABELS)
    .filter(([field]) => !PASSIVE_RESIST_ATTR_FIELDS.has(field) && !attributePriority.includes(field));
  const presetFields = ['hp', 'mp', 'atk', 'def', 'crit', 'hitVal', 'dodge', 'tenacity', 'lucky', 'guardian'];
  const addPriorityField = (field: string) => {
    if (!field || attributePriority.includes(field)) return;
    onSetAttributePriority([...attributePriority, field]);
  };
  const removePriorityField = (field: string) => {
    onSetAttributePriority(attributePriority.filter(item => item !== field));
  };
  const movePriorityField = (index: number, direction: number) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= attributePriority.length) return;
    const next = attributePriority.slice();
    const current = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = current;
    onSetAttributePriority(next);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Gauge className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-textSub">个性化选择总战力</div>
              <div className="font-mono text-4xl font-bold text-textMain">{formatNumber(selectedTotalPower)}</div>
              <div className="mt-1 text-xs text-textSub">
                {configuredMaxLevel != null ? `${configuredMaxLevel}级口径` : '当前配置口径'}，已记忆阶段 {rememberedCount}/{moduleSelections.length} 个，自选构成 {customizedCount} 个。
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md bg-surface/70 px-4 py-3">
              <div className="text-xs text-textSub">严格完成</div>
              <div className="mt-1 font-mono text-2xl font-bold">{readyModules.length}</div>
            </div>
            <div className="rounded-md bg-surface/70 px-4 py-3">
              <div className="text-xs text-textSub">局部完成</div>
              <div className="mt-1 font-mono text-2xl font-bold">{partialModules.length}</div>
            </div>
            <div className="rounded-md bg-surface/70 px-4 py-3">
              <div className="text-xs text-textSub">个性化模块</div>
              <div className="mt-1 font-mono text-2xl font-bold">{personalizedCount}</div>
            </div>
          </div>
          <div className="mt-5 w-full min-w-0 sm:w-80">
            <label className="block whitespace-nowrap text-xs font-bold text-textSub">当前角色</label>
            <select
              className="mt-1 block w-full min-w-0 rounded-md border border-border bg-surface px-3 py-2 text-sm font-semibold text-textMain outline-none focus:border-primary"
              value={selectedHeroId ?? ''}
              onChange={(event) => onSelectHeroId(Number(event.target.value))}
            >
              {roleOptions.map(role => (
                <option key={role.heroId} value={role.heroId}>{role.heroName}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-bold text-textMain">
            <Target className="h-4 w-4 text-primary" />
            自定义优先属性
          </div>
          <div className="flex flex-wrap gap-2">
            {presetFields.map(field => (
              <button
                key={field}
                type="button"
                onClick={() => onApplyAttributePriority([field])}
                className="rounded-md border border-border bg-surface px-3 py-2 text-xs font-bold text-textSub transition hover:border-primary/50 hover:text-primary"
              >
                极限{ATTR_LABELS[field]}
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {attributePriority.length > 0 ? attributePriority.map((field, index) => (
              <div key={field} className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
                <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary">{index + 1}</div>
                <div className="min-w-0 flex-1 text-sm font-bold text-textMain">{ATTR_LABELS[field] || field}</div>
                <button
                  type="button"
                  onClick={() => movePriorityField(index, -1)}
                  disabled={index === 0}
                  className="rounded p-1 text-textSub transition hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => movePriorityField(index, 1)}
                  disabled={index === attributePriority.length - 1}
                  className="rounded p-1 text-textSub transition hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => removePriorityField(field)}
                  className="rounded p-1 text-textSub transition hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )) : (
              <div className="rounded-md border border-dashed border-border bg-surface px-3 py-3 text-xs text-textSub">
                当前按最高战力口径计算。
              </div>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <select
              className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-textMain outline-none focus:border-primary"
              value=""
              onChange={(event) => addPriorityField(event.target.value)}
            >
              <option value="">添加属性</option>
              {availableAttributes.map(([field, label]) => (
                <option key={field} value={field}>{label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onApplyAttributePriority(attributePriority)}
              disabled={attributePriority.length === 0}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-surface disabled:text-textSub"
            >
              <Plus className="h-4 w-4" />
              重算
            </button>
          </div>
          <button
            type="button"
            onClick={onSelectAllMax}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs font-bold text-textSub transition hover:border-primary/50 hover:text-primary"
          >
            <Trophy className="h-4 w-4" />
            全部设为最高战力阶段
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-bold text-textMain">各属性总值</div>
          <div className="inline-flex items-center gap-2 rounded-md border border-amber-300/50 bg-amber-500/[0.06] px-3 py-2 text-xs font-semibold leading-5 text-amber-900 dark:text-amber-100">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>当前仍有 {blockedCount} 个待追链路模块，不用 0 或猜测值补齐。</span>
          </div>
        </div>
        {totalAttrEntries.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            {totalAttrEntries.map(([field, value]) => (
              <div key={field} className={clsx('rounded-md border px-4 py-3', attributePriority.includes(field) ? 'border-primary/40 bg-primary/5' : 'border-border bg-surface/60')}>
                <div className="text-xs font-semibold text-textSub">{ATTR_LABELS[field] || field}</div>
                <div className="mt-1 font-mono text-xl font-bold text-textMain">{formatNumber(value)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border bg-surface px-4 py-6 text-sm text-textSub">
            当前选择没有可展示属性。
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 text-sm font-bold text-textMain">各系统属性贡献</div>
        {contributionRows.length > 0 && contributionFields.length > 0 ? (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-36 border-b border-border bg-card px-3 py-2 text-left text-xs font-bold text-textSub">系统</th>
                  <th className="min-w-28 border-b border-border px-3 py-2 text-right text-xs font-bold text-textSub">战力</th>
                  {contributionFields.map(field => (
                    <th key={field} className={clsx('min-w-24 border-b border-border px-3 py-2 text-right text-xs font-bold text-textSub', attributePriority.includes(field) && 'text-primary')}>
                      {ATTR_LABELS[field] || field}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contributionRows.map(row => (
                  <tr key={row.rowKey} className="group">
                    <td className="sticky left-0 z-10 border-b border-border/70 bg-card px-3 py-2">
                      <div className="font-bold text-textMain">{row.moduleLabel}</div>
                      <div className="mt-0.5 max-w-48 truncate text-xs text-textSub">{row.stageLabel}</div>
                    </td>
                    <td className="border-b border-border/70 px-3 py-2 text-right font-mono text-sm font-bold text-textMain">{formatNumber(row.fightPower)}</td>
                    {contributionFields.map(field => {
                      const value = row.attrs[field] || 0;
                      return (
                        <td key={field} className={clsx('border-b border-border/70 px-3 py-2 text-right font-mono text-sm', value ? 'text-textMain' : 'text-textSub/40', attributePriority.includes(field) && value && 'bg-primary/5 text-primary')}>
                          {value ? formatNumber(value) : '-'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td className="sticky left-0 z-10 bg-surface px-3 py-2 font-bold text-textMain">合计</td>
                  <td className="bg-surface px-3 py-2 text-right font-mono text-sm font-bold text-textMain">{formatNumber(selectedTotalPower)}</td>
                  {contributionFields.map(field => (
                    <td key={field} className={clsx('bg-surface px-3 py-2 text-right font-mono text-sm font-bold text-textMain', attributePriority.includes(field) && 'text-primary')}>
                      {selectedTotalAttrs[field] ? formatNumber(selectedTotalAttrs[field]) : '-'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border bg-surface px-4 py-6 text-sm text-textSub">
            当前选择没有可拆分的系统属性贡献。
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {moduleSelections.map(({ module, selectedPoint, maxPoint, customized }) => {
          const tone = MODULE_TONE[module.key] || 'border-border bg-card text-textMain';
          const isPersonalized = customized || (selectedPoint && maxPoint && selectedPoint.stageKey !== maxPoint.stageKey);
          return (
            <button
              key={module.key}
              onClick={() => navigate(`/extreme_stats/${module.key}`)}
              className={clsx('rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md', tone, isPersonalized && 'ring-2 ring-primary/30')}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-bold">{MODULE_NAME_MAP[module.key] || module.label}</div>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 opacity-70" />
              </div>
              <div className="mt-5 font-mono text-2xl font-bold text-textMain">{formatNumber(selectedPoint?.fightPower)}</div>
                <div className="mt-1 truncate text-xs text-textSub">{selectedPoint?.label || '暂无阶段点'}</div>
              {isPersonalized ? (
                <div className="mt-2 text-xs font-semibold text-primary">{customized ? '已使用自选构成' : '已偏离最高阶段'}</div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
