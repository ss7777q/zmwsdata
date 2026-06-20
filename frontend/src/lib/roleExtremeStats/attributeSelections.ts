import type { StagePoint, CustomSelectionMap } from './core';
import { calcFightPower, scaledAttrs, defaultSelectedFields, normalizeAttributeChoiceFields, selectedOptionRows, sameFieldList, getStoredAttributeChoiceFields } from './core';

export function normalizeFeatherAttributeFields(feather: any, fields?: string[]) {
  const slotCount = typeof feather?.attributeSlotCount === 'number' && Number.isFinite(feather.attributeSlotCount)
    ? feather.attributeSlotCount
    : (typeof feather?.attributeAmount === 'number' && Number.isFinite(feather.attributeAmount) ? feather.attributeAmount : defaultSelectedFields(feather?.selectedAttrs).length);
  return normalizeAttributeChoiceFields(feather?.attributeOptions, slotCount, defaultSelectedFields(feather?.selectedAttrs), fields);
}

export function applyFeatherAttributeSelections(point: StagePoint, customSelections: CustomSelectionMap, activeWeights: Record<string, number>) {
  const feather = point.params?.selectedFeather;
  if (point.moduleKey !== 'feather' || !feather) return point;
  const choiceKey = String(feather.featherId);
  const storedFields = getStoredAttributeChoiceFields(customSelections, 'feather', point.stageKey, choiceKey);
  if (!storedFields) return point;
  const fields = normalizeFeatherAttributeFields(feather, storedFields);
  const defaults = normalizeFeatherAttributeFields(feather, defaultSelectedFields(feather.selectedAttrs));
  if (sameFieldList(fields, defaults)) return point;

  const selectedAttrs = selectedOptionRows(feather.attributeOptions, fields);
  const perFeatherAttrs: Record<string, number> = {};
  for (const item of selectedAttrs) {
    if (typeof item.value === 'number' && Number.isFinite(item.value)) {
      perFeatherAttrs[item.field] = (perFeatherAttrs[item.field] || 0) + item.value;
    }
  }
  const holeCount = typeof feather.holeCount === 'number' && Number.isFinite(feather.holeCount)
    ? feather.holeCount
    : (typeof point.params?.holeCount === 'number' ? point.params.holeCount : 0);
  const attrs = scaledAttrs(perFeatherAttrs, holeCount);
  const selectedFeather = {
    ...feather,
    perFeatherAttrs,
    perFeatherFightPower: calcFightPower(perFeatherAttrs, activeWeights),
    totalAttrs: attrs,
    fightPower: calcFightPower(attrs, activeWeights),
    selectedAttrs,
  };
  return {
    ...point,
    label: `${point.label}（自选洗练）`,
    params: {
      ...point.params,
      selectedFeather,
      customAttributeEnabled: true,
      customAttributeSelectionCount: 1,
    },
    attrs,
    fightPower: selectedFeather.fightPower,
  };
}
