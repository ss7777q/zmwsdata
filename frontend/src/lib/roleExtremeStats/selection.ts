import type { StagePoint, ExtremeModule, StageSelectionMap, EquipmentAffixSelections, ModuleAttributeChoiceSelections, ModuleItemChoiceSelections, CustomSelectionMap, AttributePriority } from './core';
import { STAGE_SELECTION_STORAGE_KEY, CUSTOM_SELECTION_STORAGE_KEY, applyEquipmentAffixSelections } from './core';
import { applyFeatherAttributeSelections } from './attributeSelections';
import { applyFashionItemSelections, applyHeartLineSelections, applyEquipmentItemSelections, applyTitleItemSelections, applyMatrixCoreSelections } from './itemSelectionsA';
import { applyMagicSoulSelections, applyWingSelections, applyXianpoSelections, applyNeidanDanqiSelection, applyBreathingAcupointSelections, applyStarcoreSelections, applySmeltSelections } from './itemSelectionsB';
import { resolveModuleSelection } from './rows';
import { buildPriorityCustomSelectionsForPoint, maxByAttributePriority, mergeCustomSelections } from './priority';

export function applyItemSelections(module: ExtremeModule, point: StagePoint | null, customSelections: CustomSelectionMap, activeWeights: Record<string, number>) {
  if (!point) return null;
  if (point.moduleKey === 'heart') return applyHeartLineSelections(module, point, customSelections, activeWeights);
  if (point.moduleKey === 'equipment') return applyEquipmentItemSelections(module, point, customSelections, activeWeights);
  if (point.moduleKey === 'fashion') return applyFashionItemSelections(module, point, customSelections, activeWeights);
  if (point.moduleKey === 'title') return applyTitleItemSelections(point, customSelections, activeWeights);
  if (point.moduleKey === 'magic') return applyMagicSoulSelections(module, point, customSelections, activeWeights);
  if (point.moduleKey === 'wing') return applyWingSelections(module, point, customSelections, activeWeights);
  if (point.moduleKey === 'xianpo') return applyXianpoSelections(module, point, customSelections, activeWeights);
  if (point.moduleKey === 'matrix') return applyMatrixCoreSelections(module, point, customSelections, activeWeights);
  if (point.moduleKey === 'starcore') return applyStarcoreSelections(module, point, customSelections, activeWeights);
  if (point.moduleKey === 'breathing') return applyBreathingAcupointSelections(module, point, customSelections, activeWeights);
  if (point.moduleKey === 'neidan') return applyNeidanDanqiSelection(module, point, customSelections, activeWeights);
  if (point.moduleKey === 'smelt') return applySmeltSelections(point, customSelections, activeWeights);
  return point;
}

export function applyAttributeSelections(point: StagePoint | null, customSelections: CustomSelectionMap, activeWeights: Record<string, number>) {
  if (!point) return null;
  if (point.moduleKey === 'equipment') return applyEquipmentAffixSelections(point, customSelections, activeWeights);
  if (point.moduleKey === 'feather') return applyFeatherAttributeSelections(point, customSelections, activeWeights);
  return point;
}

export function applyCustomSelections(module: ExtremeModule, point: StagePoint | null, customSelections: CustomSelectionMap, activeWeights: Record<string, number>) {
  return applyAttributeSelections(
    applyItemSelections(module, point, customSelections, activeWeights),
    customSelections,
    activeWeights
  );
}

export function applyResolvedSelections(
  module: ExtremeModule,
  point: StagePoint | null,
  customSelections: CustomSelectionMap,
  activeWeights: Record<string, number>,
  attributePriority: AttributePriority = []
) {
  const prioritySelections = buildPriorityCustomSelectionsForPoint(module, point, attributePriority, activeWeights);
  const mergedSelections = mergeCustomSelections(prioritySelections, customSelections);
  return applyCustomSelections(module, point, mergedSelections, activeWeights);
}

export function customFlagEnabled(point: StagePoint | null) {
  const params = point?.params as Record<string, any> | undefined;
  return Boolean(params?.customAffixEnabled || params?.customAttributeEnabled || params?.customItemEnabled || params?.linkedEquipmentEnabled);
}

export function resolveAllModuleSelections(
  modules: ExtremeModule[],
  stageSelections: StageSelectionMap,
  customSelections: CustomSelectionMap,
  activeWeights: Record<string, number>,
  selectedHeroId?: number | null,
  attributePriority: AttributePriority = []
) {
  const selections = modules.map(module =>
    resolveModuleSelection(module, stageSelections[module.key], customSelections, activeWeights, selectedHeroId, attributePriority)
  );
  return selections;
}

export function maxByFightPower(points: StagePoint[]) {
  return points.reduce<StagePoint | null>((best, point) => (
    !best || point.fightPower >= best.fightPower ? point : best
  ), null);
}

export function bestPointForPriority(points: StagePoint[], attributePriority: AttributePriority) {
  return maxByAttributePriority(points, attributePriority);
}

export function readStageSelections(): StageSelectionMap {
  if (typeof window === 'undefined') return {};
  const raw = window.localStorage.getItem(STAGE_SELECTION_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => (
        typeof entry[0] === 'string' && typeof entry[1] === 'string'
      ))
    );
  } catch {
    return {};
  }
}

export function writeStageSelections(stageSelections: StageSelectionMap) {
  if (typeof window === 'undefined') return;
  if (Object.keys(stageSelections).length === 0) {
    window.localStorage.removeItem(STAGE_SELECTION_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STAGE_SELECTION_STORAGE_KEY, JSON.stringify(stageSelections));
}

export function readCustomSelections(): CustomSelectionMap {
  if (typeof window === 'undefined') return {};
  const raw = window.localStorage.getItem(CUSTOM_SELECTION_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const equipmentAffixes: EquipmentAffixSelections = {};
    const attributeChoices: ModuleAttributeChoiceSelections = {};
    const itemChoices: ModuleItemChoiceSelections = {};
    const rawEquipmentAffixes = (parsed as CustomSelectionMap).equipmentAffixes;
    if (rawEquipmentAffixes && typeof rawEquipmentAffixes === 'object' && !Array.isArray(rawEquipmentAffixes)) {
      for (const [stageKey, stageValue] of Object.entries(rawEquipmentAffixes)) {
        if (!stageKey || !stageValue || typeof stageValue !== 'object' || Array.isArray(stageValue)) continue;
        const stageSelections: Record<string, string[]> = {};
        for (const [equipId, fields] of Object.entries(stageValue)) {
          if (!Array.isArray(fields)) continue;
          const validFields = fields.filter((field): field is string => typeof field === 'string' && field.length > 0);
          if (validFields.length > 0) stageSelections[equipId] = validFields;
        }
        if (Object.keys(stageSelections).length > 0) equipmentAffixes[stageKey] = stageSelections;
      }
    }
    const rawAttributeChoices = (parsed as CustomSelectionMap).attributeChoices;
    if (rawAttributeChoices && typeof rawAttributeChoices === 'object' && !Array.isArray(rawAttributeChoices)) {
      for (const [moduleKey, moduleValue] of Object.entries(rawAttributeChoices)) {
        if (!moduleKey || !moduleValue || typeof moduleValue !== 'object' || Array.isArray(moduleValue)) continue;
        const moduleSelections: Record<string, Record<string, string[]>> = {};
        for (const [stageKey, stageValue] of Object.entries(moduleValue)) {
          if (!stageKey || !stageValue || typeof stageValue !== 'object' || Array.isArray(stageValue)) continue;
          const stageSelections: Record<string, string[]> = {};
          for (const [choiceKey, fields] of Object.entries(stageValue)) {
            if (!Array.isArray(fields)) continue;
            const validFields = fields.filter((field): field is string => typeof field === 'string' && field.length > 0);
            if (validFields.length > 0) stageSelections[choiceKey] = validFields;
          }
          if (Object.keys(stageSelections).length > 0) moduleSelections[stageKey] = stageSelections;
        }
        if (Object.keys(moduleSelections).length > 0) attributeChoices[moduleKey] = moduleSelections;
      }
    }
    const rawItemChoices = (parsed as CustomSelectionMap).itemChoices;
    if (rawItemChoices && typeof rawItemChoices === 'object' && !Array.isArray(rawItemChoices)) {
      for (const [moduleKey, moduleValue] of Object.entries(rawItemChoices)) {
        if (!moduleKey || !moduleValue || typeof moduleValue !== 'object' || Array.isArray(moduleValue)) continue;
        const moduleSelections: Record<string, Record<string, string>> = {};
        for (const [stageKey, stageValue] of Object.entries(moduleValue)) {
          if (!stageKey || !stageValue || typeof stageValue !== 'object' || Array.isArray(stageValue)) continue;
          const stageSelections: Record<string, string> = {};
          for (const [choiceKey, itemId] of Object.entries(stageValue)) {
            if (typeof itemId === 'string' && itemId.length > 0) stageSelections[choiceKey] = itemId;
          }
          if (Object.keys(stageSelections).length > 0) moduleSelections[stageKey] = stageSelections;
        }
        if (Object.keys(moduleSelections).length > 0) itemChoices[moduleKey] = moduleSelections;
      }
    }
    return {
      ...(Object.keys(equipmentAffixes).length > 0 ? { equipmentAffixes } : {}),
      ...(Object.keys(attributeChoices).length > 0 ? { attributeChoices } : {}),
      ...(Object.keys(itemChoices).length > 0 ? { itemChoices } : {}),
    };
  } catch {
    return {};
  }
}

export function writeCustomSelections(customSelections: CustomSelectionMap) {
  if (typeof window === 'undefined') return;
  const hasEquipmentAffixes = Boolean(customSelections.equipmentAffixes && Object.keys(customSelections.equipmentAffixes).length > 0);
  const hasAttributeChoices = Boolean(customSelections.attributeChoices && Object.keys(customSelections.attributeChoices).length > 0);
  const hasItemChoices = Boolean(customSelections.itemChoices && Object.keys(customSelections.itemChoices).length > 0);
  if (!hasEquipmentAffixes && !hasAttributeChoices && !hasItemChoices) {
    window.localStorage.removeItem(CUSTOM_SELECTION_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(CUSTOM_SELECTION_STORAGE_KEY, JSON.stringify(customSelections));
}
