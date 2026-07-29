import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { ModulePage, Overview } from '../components/roleExtremeStats/RoleExtremeStatsViews';
import type { Props, ExtremeModule, StageSelectionMap, ModuleAttributeChoiceSelections, ModuleItemChoiceSelections, CustomSelectionMap, AttributePriority } from '../lib/roleExtremeStats';
import { MODULE_ORDER, MODULE_NAME_MAP, sameFieldList, maxByFightPower, readStageSelections, writeStageSelections, readCustomSelections, writeCustomSelections, readSelectedHeroId, writeSelectedHeroId, readAttributePriority, writeAttributePriority, normalizeAttributePriority, bestPointForPriority, pointsForHero, EQUIPMENT_SUBSYSTEM_KEYS, EQUIPMENT_SUBSYSTEM_NAME_MAP, moduleStorageKey } from '../lib/roleExtremeStats';

function expandDisplayModules(rawModules: ExtremeModule[]) {
  return rawModules.flatMap((module) => {
    if (module.key !== 'equipment') return [module];
    return EQUIPMENT_SUBSYSTEM_KEYS.map((subKey) => ({
      ...module,
      key: subKey,
      label: EQUIPMENT_SUBSYSTEM_NAME_MAP[subKey],
      parentKey: 'equipment',
      displayKey: subKey,
      equipmentSubsystem: subKey,
    } satisfies ExtremeModule));
  });
}

export default function RoleExtremeStats({ dataSources }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const payload = dataSources.role_extreme_stats_stage_curves?.data;
  const [stageSelections, setStageSelections] = useState<StageSelectionMap>(() => readStageSelections());
  const [customSelections, setCustomSelections] = useState<CustomSelectionMap>(() => readCustomSelections());
  const [selectedHeroId, setSelectedHeroId] = useState<number | null>(() => readSelectedHeroId());
  const [attributePriority, setAttributePriority] = useState<AttributePriority>(() => readAttributePriority());
  const rawModules = useMemo(() => {
    const raw = Array.isArray(payload?.modules) ? payload.modules as ExtremeModule[] : [];
    return raw.slice().sort((left, right) => MODULE_ORDER.indexOf(left.key) - MODULE_ORDER.indexOf(right.key));
  }, [payload]);
  const modules = useMemo(() => expandDisplayModules(rawModules), [rawModules]);
  const roleOptions = useMemo<Array<{ heroId: number; heroName: string }>>(() => {
    const roleBase = rawModules.find(module => module.key === 'role_base');
    return (roleBase?.rows || []).map((row: any) => ({
      heroId: row.heroId,
      heroName: row.heroName,
    })).filter((row: any) => typeof row.heroId === 'number' && row.heroName);
  }, [rawModules]);
  const effectiveHeroId = useMemo(() => {
    if (roleOptions.some((role: { heroId: number; heroName: string }) => role.heroId === selectedHeroId)) return selectedHeroId;
    const roleBase = rawModules.find(module => module.key === 'role_base');
    const maxHeroId = roleBase?.maxFightPowerPoint?.params?.heroId;
    if (roleOptions.some((role: { heroId: number; heroName: string }) => role.heroId === maxHeroId)) return maxHeroId;
    return roleOptions[0]?.heroId ?? null;
  }, [rawModules, roleOptions, selectedHeroId]);
  const activeKey = location.pathname.split('/').filter(Boolean)[1] || 'overview';
  const activeModule = modules.find(module => module.key === activeKey);
  const activeWeights = payload?.powerAttribute?.activeWeights || {};

  useEffect(() => {
    writeStageSelections(stageSelections);
  }, [stageSelections]);

  useEffect(() => {
    writeCustomSelections(customSelections);
  }, [customSelections]);

  useEffect(() => {
    writeSelectedHeroId(effectiveHeroId);
  }, [effectiveHeroId]);

  useEffect(() => {
    writeAttributePriority(attributePriority);
  }, [attributePriority]);

  useEffect(() => {
    if (modules.length === 0) return;
    setStageSelections(previous => {
      const next: StageSelectionMap = {};
      let changed = false;
      for (const module of rawModules) {
        const selectedKey = previous[module.key];
        if (!selectedKey) continue;
        const points = pointsForHero(module, effectiveHeroId);
        if (points.some(point => point.stageKey === selectedKey)) {
          next[module.key] = selectedKey;
        } else {
          changed = true;
        }
      }
      if (Object.keys(next).length !== Object.keys(previous).length) changed = true;
      return changed ? next : previous;
    });
  }, [rawModules, effectiveHeroId]);

  const previousPriorityRef = useRef<AttributePriority | null>(null);

  useEffect(() => {
    if (rawModules.length === 0 || attributePriority.length === 0) return;
    const next = buildPriorityStageSelections(rawModules, attributePriority, effectiveHeroId);
    setStageSelections(previous => (sameStageSelections(previous, next) ? previous : next));
    // 只有优先级本身发生变化时才清空用户的自定义选择；
    // 挂载/数据加载时（previousPriorityRef 为 null）不清，避免每次进页面丢配置。
    const previousPriority = previousPriorityRef.current;
    if (previousPriority !== null && !sameFieldList(previousPriority, attributePriority)) {
      setCustomSelections({});
    }
    previousPriorityRef.current = attributePriority;
  }, [rawModules, effectiveHeroId, attributePriority]);

  const handleSelectStageKey = (moduleKey: string, stageKey: string) => {
    setStageSelections(previous => (
      previous[moduleKey] === stageKey ? previous : { ...previous, [moduleKey]: stageKey }
    ));
  };

  const handleSelectAllMax = () => {
    const next: StageSelectionMap = {};
    for (const module of rawModules) {
      const maxPoint = maxByFightPower(pointsForHero(module, effectiveHeroId));
      if (maxPoint) next[module.key] = maxPoint.stageKey;
    }
    setAttributePriority([]);
    setStageSelections(next);
    setCustomSelections({});
  };

  const handleSetAttributePriority = (fields: AttributePriority) => {
    setAttributePriority(normalizeAttributePriority(fields));
  };

  const handleApplyAttributePriority = (fields: AttributePriority = attributePriority) => {
    const normalized = normalizeAttributePriority(fields);
    setAttributePriority(normalized);
    setStageSelections(buildPriorityStageSelections(rawModules, normalized, effectiveHeroId));
    setCustomSelections({});
  };

  const handleSetAttributeChoice = (moduleKey: string, stageKey: string, choiceKey: string, fields: string[], defaultFields: string[]) => {
    const storageKey = moduleStorageKey(moduleKey);
    setCustomSelections(previous => {
      const nextAttributeChoices: ModuleAttributeChoiceSelections = {
        ...(previous.attributeChoices || {}),
      };
      const moduleChoices = {
        ...(nextAttributeChoices[storageKey] || {}),
      };
      const stageChoices = {
        ...(moduleChoices[stageKey] || {}),
      };
      const normalizedFields = fields.filter((field, index) => typeof field === 'string' && field.length > 0 && fields.indexOf(field) === index);
      if (sameFieldList(normalizedFields, defaultFields)) {
        delete stageChoices[choiceKey];
      } else {
        stageChoices[choiceKey] = normalizedFields;
      }
      if (Object.keys(stageChoices).length > 0) {
        moduleChoices[stageKey] = stageChoices;
      } else {
        delete moduleChoices[stageKey];
      }
      if (Object.keys(moduleChoices).length > 0) {
        nextAttributeChoices[storageKey] = moduleChoices;
      } else {
        delete nextAttributeChoices[storageKey];
      }
      const next: CustomSelectionMap = {
        ...previous,
        attributeChoices: nextAttributeChoices,
      };
      if (storageKey === 'equipment' && next.equipmentAffixes?.[stageKey]?.[choiceKey]) {
        const equipmentAffixes = { ...next.equipmentAffixes };
        const equipmentStage = { ...(equipmentAffixes[stageKey] || {}) };
        delete equipmentStage[choiceKey];
        if (Object.keys(equipmentStage).length > 0) equipmentAffixes[stageKey] = equipmentStage;
        else delete equipmentAffixes[stageKey];
        next.equipmentAffixes = Object.keys(equipmentAffixes).length > 0 ? equipmentAffixes : undefined;
      }
      if (Object.keys(nextAttributeChoices).length === 0) delete next.attributeChoices;
      return next;
    });
  };

  const handleSetItemChoice = (moduleKey: string, stageKey: string, choiceKey: string, itemId: string, defaultItemId: string) => {
    const storageKey = moduleStorageKey(moduleKey);
    setCustomSelections(previous => {
      const nextItemChoices: ModuleItemChoiceSelections = {
        ...(previous.itemChoices || {}),
      };
      const moduleChoices = {
        ...(nextItemChoices[storageKey] || {}),
      };
      const stageChoices = {
        ...(moduleChoices[stageKey] || {}),
      };
      if (itemId === defaultItemId) {
        delete stageChoices[choiceKey];
      } else {
        stageChoices[choiceKey] = itemId;
      }
      if (Object.keys(stageChoices).length > 0) {
        moduleChoices[stageKey] = stageChoices;
      } else {
        delete moduleChoices[stageKey];
      }
      if (Object.keys(moduleChoices).length > 0) {
        nextItemChoices[storageKey] = moduleChoices;
      } else {
        delete nextItemChoices[storageKey];
      }
      const next: CustomSelectionMap = {
        ...previous,
        itemChoices: Object.keys(nextItemChoices).length > 0 ? nextItemChoices : undefined,
      };
      return next;
    });
  };

  const handleResetModuleCustomChoices = (moduleKey: string) => {
    const storageKey = moduleStorageKey(moduleKey);
    setCustomSelections(previous => {
      const nextAttributeChoices = { ...(previous.attributeChoices || {}) };
      const nextItemChoices = { ...(previous.itemChoices || {}) };
      delete nextAttributeChoices[storageKey];
      delete nextItemChoices[storageKey];
      const next: CustomSelectionMap = {
        ...previous,
        attributeChoices: Object.keys(nextAttributeChoices).length > 0 ? nextAttributeChoices : undefined,
        itemChoices: Object.keys(nextItemChoices).length > 0 ? nextItemChoices : undefined,
      };
      if (storageKey === 'equipment') delete next.equipmentAffixes;
      return next;
    });
  };

  if (!payload || modules.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-sm text-textSub">
        未加载到 role_extreme_stats_stage_curves.json。先运行 `node scripts/extract/role_extreme_stats.js` 生成数据。
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex gap-2 overflow-x-auto rounded-lg border border-border bg-card p-2 custom-scrollbar">
        <button
          onClick={() => navigate('/extreme_stats')}
          className={clsx('shrink-0 rounded-md px-4 py-2 text-sm font-bold transition', activeKey === 'overview' ? 'bg-primary text-white' : 'text-textSub hover:bg-surface hover:text-textMain')}
        >
          总览
        </button>
        {modules.map(module => (
          <button
            key={module.key}
            onClick={() => navigate(`/extreme_stats/${module.key}`)}
            className={clsx('shrink-0 rounded-md px-4 py-2 text-sm font-bold transition', activeKey === module.key ? 'bg-primary text-white' : 'text-textSub hover:bg-surface hover:text-textMain')}
          >
            {MODULE_NAME_MAP[module.key] || module.label}
          </button>
        ))}
      </div>

      {activeModule ? (
        <ModulePage
          key={activeModule.key}
          module={activeModule}
          activeWeights={activeWeights}
          selectedStageKey={stageSelections[moduleStorageKey(activeModule.key)]}
          customSelections={customSelections}
          selectedHeroId={effectiveHeroId}
          attributePriority={attributePriority}
          onSelectStageKey={handleSelectStageKey}
          onSetAttributeChoice={handleSetAttributeChoice}
          onSetItemChoice={handleSetItemChoice}
          onResetModuleCustomChoices={handleResetModuleCustomChoices}
        />
      ) : (
        <Overview
          modules={rawModules}
          extractionScope={payload.extractionScope}
          stageSelections={stageSelections}
          customSelections={customSelections}
          activeWeights={activeWeights}
          roleOptions={roleOptions}
          selectedHeroId={effectiveHeroId}
          attributePriority={attributePriority}
          onSelectHeroId={setSelectedHeroId}
          onSetAttributePriority={handleSetAttributePriority}
          onApplyAttributePriority={handleApplyAttributePriority}
          onSelectAllMax={handleSelectAllMax}
        />
      )}
    </div>
  );
}

function buildPriorityStageSelections(modules: ExtremeModule[], attributePriority: AttributePriority, selectedHeroId: number | null) {
  const next: StageSelectionMap = {};
  if (attributePriority.length === 0) return next;
  for (const module of modules) {
    const point = bestPointForPriority(pointsForHero(module, selectedHeroId), attributePriority);
    if (point) next[module.key] = point.stageKey;
  }
  return next;
}

function sameStageSelections(left: StageSelectionMap, right: StageSelectionMap) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every(key => left[key] === right[key]);
}
