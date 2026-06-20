import { useMemo } from 'react';
import { Layers3, Trophy } from 'lucide-react';
import { clsx } from 'clsx';
import { AttributeChoicePanel, ItemChoicePanel } from './RoleExtremeStatsChoices';
import { PointSummary, StatusPill } from './RoleExtremeStatsDetails';
import type { ExtremeModule, CustomSelectionMap, AttributePriority } from '../../lib/roleExtremeStats';
import { MODULE_TONE, MODULE_NAME_MAP, formatNumber, applyItemSelections, applyAttributeSelections, customFlagEnabled, maxByFightPower, pointsForHero, stageLabel, buildPriorityCustomSelectionsForPoint, mergeCustomSelections, pointForDisplayModule, moduleStorageKey } from '../../lib/roleExtremeStats';

export function ModulePage({
  module,
  activeWeights,
  selectedStageKey,
  customSelections,
  selectedHeroId,
  attributePriority,
  onSelectStageKey,
  onSetAttributeChoice,
  onSetItemChoice,
  onResetModuleCustomChoices,
}: {
  module: ExtremeModule;
  activeWeights: Record<string, number>;
  selectedStageKey?: string;
  customSelections: CustomSelectionMap;
  selectedHeroId?: number | null;
  attributePriority: AttributePriority;
  onSelectStageKey: (moduleKey: string, stageKey: string) => void;
  onSetAttributeChoice: (moduleKey: string, stageKey: string, choiceKey: string, fields: string[], defaultFields: string[]) => void;
  onSetItemChoice: (moduleKey: string, stageKey: string, choiceKey: string, itemId: string, defaultItemId: string) => void;
  onResetModuleCustomChoices: (moduleKey: string) => void;
}) {
  const storageKey = moduleStorageKey(module.key);
  const points = useMemo(() => pointsForHero(module, selectedHeroId), [module, selectedHeroId]);
  const maxPoint = useMemo(() => maxByFightPower(points), [points]);
  const baseSelectedPoint = (selectedStageKey ? points.find(point => point.stageKey === selectedStageKey) : null) || maxPoint || points[0] || null;
  const effectiveCustomSelections = useMemo(
    () => mergeCustomSelections(
      buildPriorityCustomSelectionsForPoint(module, baseSelectedPoint, attributePriority, activeWeights),
      customSelections
    ),
    [module, baseSelectedPoint, attributePriority, activeWeights, customSelections]
  );
  const itemAdjustedPoint = applyItemSelections(module, baseSelectedPoint, effectiveCustomSelections, activeWeights);
  const resolvedPoint = applyAttributeSelections(itemAdjustedPoint, effectiveCustomSelections, activeWeights);
  const selectedPoint = useMemo(() => pointForDisplayModule(module, resolvedPoint, activeWeights), [module, resolvedPoint, activeWeights]);
  const isCustomized = customFlagEnabled(resolvedPoint);
  const isPersonalized = isCustomized || (resolvedPoint && maxPoint && resolvedPoint.stageKey !== maxPoint.stageKey);
  const rememberedSelected = Boolean(selectedStageKey && baseSelectedPoint?.stageKey === selectedStageKey);

  return (
    <div className="space-y-6">
      <div className={clsx('rounded-lg border p-5', MODULE_TONE[module.key] || 'border-border bg-card')}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <Layers3 className="h-5 w-5" />
              <h2 className="text-2xl font-bold text-textMain">{MODULE_NAME_MAP[module.key] || module.label}</h2>
            </div>
          </div>
          <StatusPill status={module.status} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="rounded-lg border border-border bg-card p-5">
          <label className="text-xs font-bold text-textSub">阶段选择</label>
          {points.length > 0 ? (
            <select
              className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-textMain outline-none focus:border-primary"
              value={baseSelectedPoint?.stageKey || ''}
              onChange={(event) => onSelectStageKey(storageKey, event.target.value)}
            >
              {points.map(point => (
                <option key={point.stageKey} value={point.stageKey}>
                  {stageLabel(module, point)} - {formatNumber(point.fightPower)}
                </option>
              ))}
            </select>
          ) : (
            <div className="mt-2 rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-sm text-textSub">
              当前模块缺少可严格计算的阶段点。
            </div>
          )}
          <div className="mt-2 text-xs text-textSub">
            {selectedPoint ? `${rememberedSelected ? '当前选择已记忆' : '默认使用'}：${selectedPoint.label}` : '当前模块没有可记忆阶段。'}
          </div>
        </div>
        <button
          onClick={() => {
            if (maxPoint) onSelectStageKey(storageKey, maxPoint.stageKey);
            if (isCustomized) onResetModuleCustomChoices(storageKey);
          }}
          disabled={!maxPoint}
          className="flex items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-4 text-sm font-bold text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:border-border disabled:bg-surface disabled:text-textSub"
        >
          <Trophy className="h-4 w-4" />
          {isPersonalized ? '恢复最高战力阶段' : '当前为最高战力阶段'}
        </button>
      </div>

      <PointSummary point={selectedPoint} />

      <AttributeChoicePanel
        module={module}
        point={itemAdjustedPoint}
        customSelections={effectiveCustomSelections}
        onSetAttributeChoice={onSetAttributeChoice}
        onResetModuleCustomChoices={onResetModuleCustomChoices}
      />

      <ItemChoicePanel
        module={module}
        point={baseSelectedPoint}
        activeWeights={activeWeights}
        customSelections={effectiveCustomSelections}
        onSetItemChoice={onSetItemChoice}
        onResetModuleCustomChoices={onResetModuleCustomChoices}
      />
    </div>
  );
}
