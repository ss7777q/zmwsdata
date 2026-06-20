import type { AttributePriority, CustomSelectionMap, ExtremeModule, StagePoint } from './core';
import {
  calcFightPower,
  defaultAffixFields,
  defaultNegativeAffixFields,
  defaultSelectedFields,
  equipmentNegativeAffixChoiceKey,
  affixSlotCount,
  negativeAffixSlotCount,
  normalizeEquipmentAffixFields,
  normalizeEquipmentNegativeAffixFields,
  normalizeAttributeChoiceFields,
  moduleStorageKey,
} from './core';
import { normalizeFeatherAttributeFields } from './attributeSelections';
import {
  buildFashionItem,
  equipmentCandidateGroupsByPart,
  equipmentStoneChoiceKey,
  equipmentStoneOptionsForEquip,
  fashionCandidatesByPart,
  heartLineOptions,
  matrixCoreGroupsByGroup,
} from './itemSelectionsA';
import {
  breathingAcupointOptions,
  breathingChoiceId,
  breathingChoiceKey,
  buildStarcoreOption,
  magicSoulOptionsForSlot,
  magicWeaponOptionsForGroup,
  magicWeaponChoiceKey,
  neidanDanqiChoiceKey,
  neidanDanqiOptions,
  smeltPartChoiceKey,
  smeltPartOptionsForPart,
  starcoreChoiceId,
  wingOptionsForWing,
  xianpoChoiceId,
  xianpoOptionsForType,
} from './itemSelectionsB';

interface PrioritizedOption {
  id?: string;
  stageKey?: string;
  label?: string;
  attrs?: Record<string, number>;
  fightPower?: number;
  [key: string]: any;
}

function attrValue(attrs: Record<string, number> | undefined, field: string) {
  const value = attrs?.[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function compareByAttributePriority(
  leftAttrs: Record<string, number> | undefined,
  leftFightPower: number | undefined,
  rightAttrs: Record<string, number> | undefined,
  rightFightPower: number | undefined,
  attributePriority: AttributePriority
) {
  for (const field of attributePriority) {
    const diff = attrValue(leftAttrs, field) - attrValue(rightAttrs, field);
    if (diff !== 0) return diff;
  }
  const fightPowerDiff = (leftFightPower || 0) - (rightFightPower || 0);
  if (fightPowerDiff !== 0) return fightPowerDiff;
  return 0;
}

export function maxByAttributePriority<T extends PrioritizedOption>(
  options: T[],
  attributePriority: AttributePriority
) {
  if (attributePriority.length === 0 || options.length === 0) return null;
  return options.reduce<T>((best, option) => {
    const diff = compareByAttributePriority(option.attrs, option.fightPower, best.attrs, best.fightPower, attributePriority);
    if (diff > 0) return option;
    if (diff < 0) return best;
    return String(option.label || option.id || option.stageKey).localeCompare(String(best.label || best.id || best.stageKey)) < 0 ? option : best;
  }, options[0]);
}

function optionAttrs(option: any) {
  if (option?.attrs && typeof option.attrs === 'object') return option.attrs as Record<string, number>;
  if (typeof option?.field === 'string' && typeof option?.value === 'number' && Number.isFinite(option.value)) {
    return { [option.field]: option.value };
  }
  return {};
}

function optionFightPower(option: any, activeWeights: Record<string, number>) {
  if (typeof option?.fightPower === 'number' && Number.isFinite(option.fightPower)) return option.fightPower;
  return calcFightPower(optionAttrs(option), activeWeights);
}

function bestOption<T extends Record<string, any>>(options: T[], attributePriority: AttributePriority, activeWeights: Record<string, number>) {
  const normalized = options.map(option => ({
    ...option,
    attrs: optionAttrs(option),
    fightPower: optionFightPower(option, activeWeights),
    id: String(option.id ?? option.field ?? option.itemId ?? option.titleId ?? option.equipId ?? option.danqiId),
  }));
  return maxByAttributePriority(normalized, attributePriority);
}

function selectUniqueOptions<T extends Record<string, any>>(
  options: T[],
  slotCount: number,
  attributePriority: AttributePriority,
  activeWeights: Record<string, number>
) {
  const selected: Array<T & PrioritizedOption> = [];
  const usedIds = new Set<string>();
  for (let slot = 0; slot < slotCount; slot += 1) {
    const candidate = bestOption(
      options.filter(option => !usedIds.has(String(option.id ?? option.field ?? option.danqiId ?? option.stoneId))),
      attributePriority,
      activeWeights
    );
    if (!candidate) break;
    selected.push(candidate as T & PrioritizedOption);
    usedIds.add(String(candidate.id ?? candidate.field ?? candidate.danqiId ?? candidate.stoneId));
  }
  return selected;
}

function selectAttributeFields(
  options: any[] | undefined,
  slotCount: number,
  defaultFields: string[],
  attributePriority: AttributePriority,
  activeWeights: Record<string, number>
) {
  const optionList = Array.isArray(options) ? options : [];
  if (attributePriority.length === 0 || optionList.length === 0 || slotCount <= 0) return defaultFields;
  const selected = selectUniqueOptions(optionList, slotCount, attributePriority, activeWeights)
    .map(option => option.field)
    .filter((field): field is string => typeof field === 'string' && field.length > 0);
  return normalizeAttributeChoiceFields(optionList, slotCount, defaultFields, selected);
}

function putAttributeChoice(target: CustomSelectionMap, moduleKey: string, stageKey: string, choiceKey: string, fields: string[]) {
  if (fields.length === 0) return;
  const storageKey = moduleStorageKey(moduleKey);
  target.attributeChoices = target.attributeChoices || {};
  target.attributeChoices[storageKey] = target.attributeChoices[storageKey] || {};
  target.attributeChoices[storageKey][stageKey] = target.attributeChoices[storageKey][stageKey] || {};
  target.attributeChoices[storageKey][stageKey][choiceKey] = fields;
}

function putItemChoice(target: CustomSelectionMap, moduleKey: string, stageKey: string, choiceKey: string, itemId: string) {
  if (!itemId) return;
  const storageKey = moduleStorageKey(moduleKey);
  target.itemChoices = target.itemChoices || {};
  target.itemChoices[storageKey] = target.itemChoices[storageKey] || {};
  target.itemChoices[storageKey][stageKey] = target.itemChoices[storageKey][stageKey] || {};
  target.itemChoices[storageKey][stageKey][choiceKey] = itemId;
}

function cloneNestedRecord<T>(value: T | undefined): T | undefined {
  if (!value) return undefined;
  return JSON.parse(JSON.stringify(value)) as T;
}

export function mergeCustomSelections(base: CustomSelectionMap, override: CustomSelectionMap): CustomSelectionMap {
  const result: CustomSelectionMap = {
    equipmentAffixes: cloneNestedRecord(base.equipmentAffixes),
    attributeChoices: cloneNestedRecord(base.attributeChoices),
    itemChoices: cloneNestedRecord(base.itemChoices),
  };
  const mergeRecord = (key: 'equipmentAffixes' | 'attributeChoices' | 'itemChoices') => {
    const source = override[key] as any;
    if (!source) return;
    const target = ((result as any)[key] = (result as any)[key] || {});
    for (const [moduleOrStageKey, moduleOrStageValue] of Object.entries(source)) {
      target[moduleOrStageKey] = target[moduleOrStageKey] || {};
      for (const [stageOrChoiceKey, stageOrChoiceValue] of Object.entries(moduleOrStageValue as Record<string, any>)) {
        if (Array.isArray(stageOrChoiceValue) || typeof stageOrChoiceValue === 'string') {
          target[moduleOrStageKey][stageOrChoiceKey] = stageOrChoiceValue;
          continue;
        }
        target[moduleOrStageKey][stageOrChoiceKey] = {
          ...(target[moduleOrStageKey][stageOrChoiceKey] || {}),
          ...(stageOrChoiceValue as Record<string, any>),
        };
      }
    }
  };
  mergeRecord('equipmentAffixes');
  mergeRecord('attributeChoices');
  mergeRecord('itemChoices');
  if (!result.equipmentAffixes || Object.keys(result.equipmentAffixes).length === 0) delete result.equipmentAffixes;
  if (!result.attributeChoices || Object.keys(result.attributeChoices).length === 0) delete result.attributeChoices;
  if (!result.itemChoices || Object.keys(result.itemChoices).length === 0) delete result.itemChoices;
  return result;
}

function buildAttributeChoicePrioritySelections(
  module: ExtremeModule,
  point: StagePoint,
  attributePriority: AttributePriority,
  activeWeights: Record<string, number>,
  target: CustomSelectionMap
) {
  if (module.key === 'equipment' || module.parentKey === 'equipment') {
    for (const equip of point.params?.selectedEquips || []) {
      if (Array.isArray(equip.affixOptions) && affixSlotCount(equip) > 0) {
        putAttributeChoice(
          target,
          module.key,
          point.stageKey,
          String(equip.equipId),
          selectAttributeFields(equip.affixOptions, affixSlotCount(equip), normalizeEquipmentAffixFields(equip, defaultAffixFields(equip)), attributePriority, activeWeights)
        );
      }
      if (Array.isArray(equip.negativeAffixOptions) && negativeAffixSlotCount(equip) > 0) {
        putAttributeChoice(
          target,
          module.key,
          point.stageKey,
          equipmentNegativeAffixChoiceKey(equip.equipId),
          selectAttributeFields(equip.negativeAffixOptions, negativeAffixSlotCount(equip), normalizeEquipmentNegativeAffixFields(equip, defaultNegativeAffixFields(equip)), attributePriority, activeWeights)
        );
      }
    }
  }
  if (module.key === 'feather') {
    const feather = point.params?.selectedFeather;
    if (feather && Array.isArray(feather.attributeOptions)) {
      const defaultFields = normalizeFeatherAttributeFields(feather, defaultSelectedFields(feather.selectedAttrs));
      putAttributeChoice(
        target,
        module.key,
        point.stageKey,
        String(feather.featherId),
        selectAttributeFields(feather.attributeOptions, defaultFields.length, defaultFields, attributePriority, activeWeights)
      );
    }
  }
}

function buildItemPrioritySelections(
  module: ExtremeModule,
  point: StagePoint,
  attributePriority: AttributePriority,
  activeWeights: Record<string, number>,
  target: CustomSelectionMap
) {
  const stageKey = point.stageKey;
  if (module.key === 'heart') {
    for (const line of point.params?.selectedLines || []) {
      const selected = bestOption(heartLineOptions(module, String(line.field)), attributePriority, activeWeights);
      if (selected) putItemChoice(target, module.key, stageKey, String(line.field), selected.id);
    }
  }
  if (module.key === 'equipment' || module.parentKey === 'equipment') {
    const candidatesByPart = equipmentCandidateGroupsByPart(point);
    for (const equip of point.params?.selectedEquips || []) {
      const part = String(equip.part);
      const equipOption = bestOption((candidatesByPart.get(part) || []).map(candidate => ({
        id: String(candidate.equipId),
        attrs: candidate.attrs,
        fightPower: candidate.fightPower,
        label: candidate.equipName,
      })), attributePriority, activeWeights);
      if (equipOption) putItemChoice(target, module.key, stageKey, part, equipOption.id);
      if (Array.isArray(equip.stoneSlots) && equip.stoneSlots.length > 0) {
        const usedStoneIds = new Set<string>();
        equip.stoneSlots.forEach((slot: any, index: number) => {
          const stoneOptions = equipmentStoneOptionsForEquip(point, equip, activeWeights, slot)
            .filter((option: any) => !usedStoneIds.has(String(option.stoneId)));
          const stone = bestOption(stoneOptions, attributePriority, activeWeights);
          if (!stone) return;
          usedStoneIds.add(String(stone.stoneId));
          const slotIndex = slot?.slotIndex ?? index + 1;
          putItemChoice(target, module.key, stageKey, equipmentStoneChoiceKey(equip.part, slotIndex), String(stone.stoneId));
        });
      }
    }
  }
  if (module.key === 'title') {
    for (const title of point.params?.selectedTitles || []) {
      const selected = bestOption((title.candidateOptions || []).map((option: any) => ({
        id: String(option.titleId),
        attrs: option.attrs,
        fightPower: option.fightPower,
        label: option.titleName,
      })), attributePriority, activeWeights);
      if (selected) putItemChoice(target, module.key, stageKey, String(title.selectionPoolKey), selected.id);
    }
  }
  if (module.key === 'fashion') {
    const candidatesByPart = fashionCandidatesByPart(module);
    for (const fashion of point.params?.selectedFashions || []) {
      const selected = bestOption((candidatesByPart.get(String(fashion.part)) || []).map(candidate => {
        const item = buildFashionItem(candidate, point.params?.ballRatios, activeWeights);
        return { id: String(item.fashionId), attrs: item.attrs, fightPower: item.fightPower, label: item.fashionName };
      }), attributePriority, activeWeights);
      if (selected) putItemChoice(target, module.key, stageKey, String(fashion.part), selected.id);
    }
  }
  if (module.key === 'wing') {
    for (const wing of point.params?.selectedWings || []) {
      const selected = bestOption(wingOptionsForWing(module, wing.wingId), attributePriority, activeWeights);
      if (selected) putItemChoice(target, module.key, stageKey, String(wing.wingId), selected.id);
    }
  }
  if (module.key === 'magic') {
    for (const weapon of point.params?.selectedWeapons || []) {
      const selectedWeapon = bestOption(magicWeaponOptionsForGroup(module, weapon.groupId, point.params?.level, point.params?.soulLevel), attributePriority, activeWeights);
      const nextWeapon = selectedWeapon || weapon;
      if (selectedWeapon) putItemChoice(target, module.key, stageKey, magicWeaponChoiceKey(weapon.groupId), selectedWeapon.id);
      if (nextWeapon.closeSoul || !Array.isArray(nextWeapon.selectedSouls)) continue;
      for (const soul of nextWeapon.selectedSouls) {
        const selectedSoul = bestOption(magicSoulOptionsForSlot(module, soul.slotType, nextWeapon.soulLevelLimit, nextWeapon.soulLevel, activeWeights), attributePriority, activeWeights);
        if (selectedSoul) putItemChoice(target, module.key, stageKey, `${nextWeapon.groupId}:${soul.slotType}`, selectedSoul.id);
      }
    }
  }
  if (module.key === 'matrix') {
    const candidatesByGroup = matrixCoreGroupsByGroup(module);
    for (const matrix of point.params?.selectedMatrices || []) {
      for (const core of matrix.selectedCores || []) {
        const selected = bestOption((candidatesByGroup.get(String(core.group)) || []).map(candidate => ({
          id: String(candidate.id),
          attrs: candidate.attrs,
          fightPower: candidate.fightPower,
          label: candidate.name,
        })), attributePriority, activeWeights);
        if (selected) putItemChoice(target, module.key, stageKey, `${matrix.matrixId}:${core.group}`, selected.id);
      }
    }
  }
  if (module.key === 'starcore') {
    const starsById = new Map<string, any>((module.stars || []).map((star: any) => [String(star.id), star]));
    for (const current of point.params?.selectedStars || []) {
      const star = starsById.get(String(current.starCoreId));
      if (!star) continue;
      const qualities = (star.mainQualitySummary || []).map((item: any) => item.quality);
      const maxSatelliteLevel = typeof star.satelliteMaxLevel === 'number' && Number.isFinite(star.satelliteMaxLevel)
        ? star.satelliteMaxLevel
        : current.satelliteLevel;
      const options = qualities.flatMap((quality: number) => (
        Array.from({ length: maxSatelliteLevel }, (_, index) => buildStarcoreOption(star, quality, index + 1, point.params?.worldAttrs, activeWeights))
      )).filter(Boolean) as any[];
      const selected = bestOption(options.map(option => ({ ...option, id: starcoreChoiceId(option.quality, option.satelliteLevel) })), attributePriority, activeWeights);
      if (selected) putItemChoice(target, module.key, stageKey, String(current.starCoreId), selected.id);
    }
  }
  if (module.key === 'xianpo') {
    const unlockedLayerCount = point.params?.unlockedLayerCount || 0;
    for (const xianpo of point.params?.selectedXianpos || []) {
      const selected = bestOption(xianpoOptionsForType(module, xianpo.type, unlockedLayerCount, activeWeights), attributePriority, activeWeights);
      if (selected) putItemChoice(target, module.key, stageKey, String(xianpo.type), xianpoChoiceId(selected.quality, selected.level));
    }
  }
  if (module.key === 'neidan') {
    const options = neidanDanqiOptions(module);
    const selectedDanqis = selectUniqueOptions(options, (point.params?.selectedDanqis || []).length, attributePriority, activeWeights);
    selectedDanqis.forEach((danqi, index) => {
      const current = point.params?.selectedDanqis?.[index];
      const slotIndex = current?.slotIndex ?? index + 1;
      putItemChoice(target, module.key, stageKey, neidanDanqiChoiceKey(slotIndex), String(danqi.id || ''));
    });
  }
  if (module.key === 'smelt') {
    for (const smelt of point.params?.selectedSmelts || []) {
      const selected = bestOption(smeltPartOptionsForPart(point, smelt.part), attributePriority, activeWeights);
      if (selected) putItemChoice(target, module.key, stageKey, smeltPartChoiceKey(smelt.part), selected.id);
    }
  }
  if (module.key === 'breathing') {
    for (const acupoint of point.params?.selectedAcupoints || []) {
      const selected = bestOption(breathingAcupointOptions(module, breathingChoiceKey(acupoint), activeWeights), attributePriority, activeWeights);
      if (selected) putItemChoice(target, module.key, stageKey, breathingChoiceKey(acupoint), breathingChoiceId(selected.quality, selected.level));
    }
  }
}

export function buildPriorityCustomSelectionsForPoint(
  module: ExtremeModule,
  point: StagePoint | null,
  attributePriority: AttributePriority,
  activeWeights: Record<string, number>
): CustomSelectionMap {
  const target: CustomSelectionMap = {};
  if (!point || attributePriority.length === 0) return target;
  buildItemPrioritySelections(module, point, attributePriority, activeWeights, target);
  buildAttributeChoicePrioritySelections(module, point, attributePriority, activeWeights, target);
  return target;
}
