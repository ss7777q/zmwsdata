import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import type { StagePoint, ExtremeModule, CustomSelectionMap } from '../../lib/roleExtremeStats';
import { ATTR_LABELS, formatNumber, formatAttrsInline, defaultSelectedFields, normalizeAttributeChoiceFields, defaultAffixFields, defaultNegativeAffixFields, affixSlotCount, negativeAffixSlotCount, equipmentNegativeAffixChoiceKey, normalizeEquipmentAffixFields, normalizeEquipmentNegativeAffixFields, sameFieldList, getStoredAttributeChoiceFields, normalizeFeatherAttributeFields, fashionCandidatesByPart, buildFashionItem, levelChoiceId, heartLineOptions, equipmentCandidateGroupsByPart, equipmentStoneChoiceKey, equipmentStoneOptionsForEquip, matrixCoreGroupsByGroup, starcoreChoiceId, buildStarcoreOption, magicSoulOptionsForSlot, magicWeaponChoiceKey, magicWeaponOptionsForGroup, wingOptionsForWing, xianpoChoiceId, xianpoOptionsForType, neidanDanqiChoiceKey, neidanDanqiOptions, smeltPartChoiceKey, smeltPartOptionsForPart, breathingChoiceKey, breathingChoiceId, breathingAcupointOptions, moduleStorageKey } from '../../lib/roleExtremeStats';

function isEquipmentAffixModule(module: ExtremeModule) {
  return module.parentKey === 'equipment' && module.equipmentSubsystem === 'equipment_affix';
}

function isEquipmentBaseModule(module: ExtremeModule) {
  return module.parentKey === 'equipment' && module.equipmentSubsystem === 'equipment_base';
}

function isEquipmentGemstoneModule(module: ExtremeModule) {
  return module.parentKey === 'equipment' && module.equipmentSubsystem === 'equipment_gemstone';
}

interface AttributeChoiceItem {
  choiceKey: string;
  label: string;
  slotCount: number;
  options: any[];
  defaultFields: string[];
}

function getAttributeChoiceItems(module: ExtremeModule, point: StagePoint | null): AttributeChoiceItem[] {
  if (!point) return [];
  if (module.key === 'equipment' || isEquipmentAffixModule(module)) {
    if (module.parentKey === 'equipment' && module.equipmentSubsystem !== 'equipment_affix') return [];
    const positiveChoices = (point.params?.selectedEquips || [])
      .filter((equip: any) => Array.isArray(equip.affixOptions) && equip.affixOptions.length > 0 && affixSlotCount(equip) > 0)
      .map((equip: any) => ({
        choiceKey: String(equip.equipId),
        label: `${equip.partLabel || equip.part} · ${equip.equipName} · 正词条`,
        slotCount: affixSlotCount(equip),
        options: equip.affixOptions,
        defaultFields: normalizeEquipmentAffixFields(equip, defaultAffixFields(equip)),
      }));
    const negativeChoices = (point.params?.selectedEquips || [])
      .filter((equip: any) => Array.isArray(equip.negativeAffixOptions) && equip.negativeAffixOptions.length > 0 && negativeAffixSlotCount(equip) > 0)
      .map((equip: any) => ({
        choiceKey: equipmentNegativeAffixChoiceKey(equip.equipId),
        label: `${equip.partLabel || equip.part} · ${equip.equipName} · 负词条`,
        slotCount: negativeAffixSlotCount(equip),
        options: equip.negativeAffixOptions,
        defaultFields: normalizeEquipmentNegativeAffixFields(equip, defaultNegativeAffixFields(equip)),
      }));
    return [...positiveChoices, ...negativeChoices];
  }
  if (module.key === 'feather') {
    const feather = point.params?.selectedFeather;
    if (!feather || !Array.isArray(feather.attributeOptions) || feather.attributeOptions.length === 0) return [];
    const defaultFields = normalizeFeatherAttributeFields(feather, defaultSelectedFields(feather.selectedAttrs));
    return [{
      choiceKey: String(feather.featherId),
      label: `${feather.featherName} · 洗练属性`,
      slotCount: defaultFields.length,
      options: feather.attributeOptions,
      defaultFields,
    }];
  }
  return [];
}

export function AttributeChoicePanel({
  module,
  point,
  customSelections,
  onSetAttributeChoice,
  onResetModuleCustomChoices,
}: {
  module: ExtremeModule;
  point: StagePoint | null;
  customSelections: CustomSelectionMap;
  onSetAttributeChoice: (moduleKey: string, stageKey: string, choiceKey: string, fields: string[], defaultFields: string[]) => void;
  onResetModuleCustomChoices: (moduleKey: string) => void;
}) {
  const choices = getAttributeChoiceItems(module, point);
  if (!point || choices.length === 0) return null;
  const customizedCount = choices.filter(choice => {
    const stored = getStoredAttributeChoiceFields(customSelections, module.key, point.stageKey, choice.choiceKey);
    const fields = normalizeAttributeChoiceFields(choice.options, choice.slotCount, choice.defaultFields, stored);
    return !sameFieldList(fields, choice.defaultFields);
  }).length;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-textMain">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          属性词条选择
        </div>
        <button
          type="button"
          onClick={() => onResetModuleCustomChoices(module.key)}
          disabled={customizedCount === 0}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs font-bold text-textSub transition hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          恢复本模块默认词条
        </button>
      </div>

      <div className="space-y-3">
        {choices.map(choice => {
          const stored = getStoredAttributeChoiceFields(customSelections, module.key, point.stageKey, choice.choiceKey);
          const fields = normalizeAttributeChoiceFields(choice.options, choice.slotCount, choice.defaultFields, stored);
          const isDefault = sameFieldList(fields, choice.defaultFields);
          return (
            <div key={choice.choiceKey} className="rounded-lg border border-border/70 bg-surface/40 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-textMain">{choice.label}</div>
                  <div className="mt-1 text-xs text-textSub">可选 {formatNumber(choice.options.length)} 项，当前生效 {formatNumber(choice.slotCount)} 条。</div>
                </div>
                <button
                  type="button"
                  onClick={() => onSetAttributeChoice(module.key, point.stageKey, choice.choiceKey, choice.defaultFields, choice.defaultFields)}
                  disabled={isDefault}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-bold text-textSub transition hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  默认
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {Array.from({ length: choice.slotCount }, (_, index) => {
                  const selectedField = fields[index] || '';
                  return (
                    <label key={`${choice.choiceKey}-${index}`} className="text-xs font-bold text-textSub">
                      词条 {index + 1}
                      <select
                        className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-textMain outline-none focus:border-primary"
                        value={selectedField}
                        onChange={(event) => {
                          const nextFields = fields.slice();
                          nextFields[index] = event.target.value;
                          onSetAttributeChoice(module.key, point.stageKey, choice.choiceKey, nextFields, choice.defaultFields);
                        }}
                      >
                        {choice.options.map((option: any) => (
                          <option key={option.field} value={option.field}>
                            {ATTR_LABELS[option.field] || option.field} {formatNumber(option.value)}，战力 {formatNumber(option.fightPower)}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ItemChoiceItem {
  choiceKey: string;
  label: string;
  options: Array<{ id: string; label: string; fightPower: number; attrs: Record<string, number> }>;
  defaultValue: string;
}

function getItemChoiceItems(module: ExtremeModule, point: StagePoint | null, activeWeights: Record<string, number>): ItemChoiceItem[] {
  if (!point) return [];
  if (module.key === 'heart') {
    return (point.params?.selectedLines || []).map((line: any) => {
      const field = String(line.field);
      const options = heartLineOptions(module, field).map((option: any) => ({
        id: option.id,
        label: option.label,
        fightPower: option.fightPower,
        attrs: option.attrs,
      }));
      return {
        choiceKey: field,
        label: `${ATTR_LABELS[field] || field} 心法等级`,
        options,
        defaultValue: levelChoiceId(line.heartLevel),
      };
    }).filter((item: ItemChoiceItem) => item.options.length > 0);
  }
  if (module.key === 'equipment' || module.parentKey === 'equipment') {
    if (module.parentKey === 'equipment' && !['equipment_base', 'equipment_gemstone'].includes(module.equipmentSubsystem || '')) return [];
    const candidatesByPart = equipmentCandidateGroupsByPart(point);
    const equipChoices = isEquipmentGemstoneModule(module) ? [] : (point.params?.selectedEquips || []).map((equip: any) => {
      const part = String(equip.part);
      const options = (candidatesByPart.get(part) || []).map((candidate: any) => ({
        id: String(candidate.equipId),
        label: `${candidate.equipName} · ${candidate.equipLv}级`,
        fightPower: candidate.fightPower,
        attrs: candidate.attrs,
      })).sort((left, right) => right.fightPower - left.fightPower || left.label.localeCompare(right.label));
      return {
        choiceKey: part,
        label: `${equip.partLabel || equip.part} 装备`,
        options,
        defaultValue: String(equip.equipId),
      };
    }).filter((item: ItemChoiceItem) => item.options.length > 0);
    const stoneChoices = isEquipmentBaseModule(module) ? [] : (point.params?.selectedEquips || []).flatMap((equip: any) => {
      const part = String(equip.part);
      return (equip.stoneSlots || []).map((slot: any) => {
        const options = equipmentStoneOptionsForEquip(point, equip, activeWeights, slot).map((option: any) => ({
          id: option.id,
          label: option.label,
          fightPower: option.fightPower,
          attrs: option.attrs,
        }));
        return {
          choiceKey: equipmentStoneChoiceKey(part, slot.slotIndex),
          label: `${equip.partLabel || equip.part} 宝石孔 ${slot.slotIndex}`,
          options,
          defaultValue: String(slot.stoneId),
        };
      });
    }).filter((item: ItemChoiceItem) => item.options.length > 0);
    return [...equipChoices, ...stoneChoices];
  }
  if (module.key === 'title') {
    return (point.params?.selectedTitles || []).map((title: any) => ({
      choiceKey: String(title.selectionPoolKey),
      label: title.selectionLabel || `称号池 ${title.selectionPoolKey}`,
      options: (title.candidateOptions || []).map((option: any) => ({
        id: String(option.titleId),
        label: `${option.titleName} Lv.${option.titleLevel ?? '-'}`,
        fightPower: option.fightPower,
        attrs: option.attrs,
      })).sort((left: any, right: any) => right.fightPower - left.fightPower || left.label.localeCompare(right.label)),
      defaultValue: String(title.titleId),
    })).filter((item: ItemChoiceItem) => item.options.length > 0);
  }
  if (module.key === 'fashion') {
    const candidatesByPart = fashionCandidatesByPart(module);
    return (point.params?.selectedFashions || []).map((fashion: any) => {
      const part = String(fashion.part);
      const options = (candidatesByPart.get(part) || []).map(candidate => {
        const item = buildFashionItem(candidate, point.params?.ballRatios, activeWeights);
        return {
          id: String(item.fashionId),
          label: item.fashionName,
          fightPower: item.fightPower,
          attrs: item.attrs,
        };
      }).sort((left, right) => right.fightPower - left.fightPower || left.label.localeCompare(right.label));
      return {
        choiceKey: part,
        label: `${part} 部位时装`,
        options,
        defaultValue: String(fashion.fashionId),
      };
    }).filter((item: ItemChoiceItem) => item.options.length > 0);
  }
  if (module.key === 'wing') {
    return (point.params?.selectedWings || []).map((wing: any) => {
      const options = wingOptionsForWing(module, wing.wingId).map((option: any) => ({
        id: option.id,
        label: option.label,
        fightPower: option.fightPower,
        attrs: option.attrs,
      }));
      return {
        choiceKey: String(wing.wingId),
        label: wing.wingName || `翅膀 ${wing.wingId}`,
        options,
        defaultValue: levelChoiceId(wing.wingLevel),
      };
    }).filter((item: ItemChoiceItem) => item.options.length > 0);
  }
  if (module.key === 'magic') {
    const weaponChoices = (point.params?.selectedWeapons || []).map((weapon: any) => ({
      choiceKey: magicWeaponChoiceKey(weapon.groupId),
      label: `组 ${weapon.groupId} · 法宝本体`,
      options: magicWeaponOptionsForGroup(module, weapon.groupId, point.params?.level, point.params?.soulLevel)
        .map((option: any) => ({
          id: option.id,
          label: option.label,
          fightPower: option.fightPower,
          attrs: option.attrs,
        })),
      defaultValue: String(weapon.magicWeaponId),
    })).filter((item: ItemChoiceItem) => item.options.length > 1);
    const soulChoices = (point.params?.selectedWeapons || []).flatMap((weapon: any) => (
      (weapon.selectedSouls || []).map((soul: any) => ({
        choiceKey: `${weapon.groupId}:${soul.slotType}`,
        label: `组 ${weapon.groupId} · ${weapon.magicWeaponName} · ${soul.slotLabel}`,
        options: magicSoulOptionsForSlot(module, soul.slotType, weapon.soulLevelLimit, weapon.soulLevel, activeWeights)
          .map((option: any) => ({
            id: option.id,
            label: option.label,
            fightPower: option.fightPower,
            attrs: option.attrs,
          })),
        defaultValue: String(soul.soulId),
      }))
    )).filter((item: ItemChoiceItem) => item.options.length > 0);
    return [...weaponChoices, ...soulChoices];
  }
  if (module.key === 'matrix') {
    const candidatesByGroup = matrixCoreGroupsByGroup(module);
    return (point.params?.selectedMatrices || []).flatMap((matrix: any) => (
      (matrix.selectedCores || []).map((core: any) => ({
        choiceKey: `${matrix.matrixId}:${core.group}`,
        label: `${matrix.matrixName} · ${core.name}`,
        options: (candidatesByGroup.get(String(core.group)) || []).map((candidate: any) => ({
          id: String(candidate.id),
          label: `${candidate.name} · 品质 ${candidate.quality}`,
          fightPower: candidate.fightPower,
          attrs: candidate.attrs,
        })).sort((left, right) => right.fightPower - left.fightPower || left.label.localeCompare(right.label)),
        defaultValue: String(core.id),
      }))
    )).filter((item: ItemChoiceItem) => item.options.length > 0);
  }
  if (module.key === 'starcore') {
    const starsById = new Map<string, any>((module.stars || []).map((star: any) => [String(star.id), star]));
    return (point.params?.selectedStars || []).map((current: any) => {
      const star = starsById.get(String(current.starCoreId));
      if (!star) return null;
      const qualities = (star.mainQualitySummary || []).map((item: any) => item.quality);
      const maxSatelliteLevel = typeof star.satelliteMaxLevel === 'number' && Number.isFinite(star.satelliteMaxLevel)
        ? star.satelliteMaxLevel
        : current.satelliteLevel;
      const satelliteLevels = Array.from({ length: Math.max(maxSatelliteLevel, 1) }, (_, index) => index + 1);
      const options = qualities.flatMap((quality: number) => (
        satelliteLevels.map(satelliteLevel => buildStarcoreOption(star, quality, satelliteLevel, point.params?.worldAttrs, activeWeights))
      )).filter(Boolean).map((option: any) => ({
        id: option.id,
        label: option.label,
        fightPower: option.fightPower,
        attrs: option.attrs,
      })).sort((left: any, right: any) => right.fightPower - left.fightPower || left.label.localeCompare(right.label));
      return {
        choiceKey: String(current.starCoreId),
        label: current.starCoreName,
        options,
        defaultValue: starcoreChoiceId(current.quality, current.satelliteLevel),
      };
    }).filter(Boolean) as ItemChoiceItem[];
  }
  if (module.key === 'xianpo') {
    const unlockedLayerCount = point.params?.unlockedLayerCount || 0;
    return (point.params?.selectedXianpos || []).map((xianpo: any) => {
      const options = xianpoOptionsForType(module, xianpo.type, unlockedLayerCount, activeWeights).map((option: any) => ({
        id: option.id,
        label: option.label,
        fightPower: option.fightPower,
        attrs: option.totalAttrs,
      }));
      return {
        choiceKey: String(xianpo.type),
        label: xianpo.typeName || `仙魄类型 ${xianpo.type}`,
        options,
        defaultValue: xianpoChoiceId(xianpo.quality, xianpo.level),
      };
    }).filter((item: ItemChoiceItem) => item.options.length > 0);
  }
  if (module.key === 'neidan') {
    const options = neidanDanqiOptions(module).map((option: any) => ({
      id: option.id,
      label: option.label,
      fightPower: option.fightPower,
      attrs: option.attrs,
    }));
    return (point.params?.selectedDanqis || []).map((danqi: any, index: number) => ({
      choiceKey: neidanDanqiChoiceKey(danqi.slotIndex ?? index + 1),
      label: `丹气槽 ${danqi.slotIndex ?? index + 1}`,
      options,
      defaultValue: String(danqi.danqiId),
    })).filter((item: ItemChoiceItem) => item.options.length > 0);
  }
  if (module.key === 'smelt') {
    return (point.params?.selectedSmelts || []).map((smelt: any) => {
      const options = smeltPartOptionsForPart(point, smelt.part).map((option: any) => ({
        id: option.id,
        label: option.label,
        fightPower: option.fightPower,
        attrs: option.attrs,
      }));
      return {
        choiceKey: smeltPartChoiceKey(smelt.part),
        label: `${smelt.partLabel || smelt.part} 熔炼装备`,
        options,
        defaultValue: smelt.id,
      };
    }).filter((item: ItemChoiceItem) => item.options.length > 0);
  }
  if (module.key === 'breathing') {
    return (point.params?.selectedAcupoints || []).map((acupoint: any) => {
      const choiceKey = breathingChoiceKey(acupoint);
      return {
        choiceKey,
        label: `${acupoint.breathingName} · 穴位 ${acupoint.type} · ${ATTR_LABELS[acupoint.attribute] || acupoint.attribute}`,
        options: breathingAcupointOptions(module, choiceKey, activeWeights).map((option: any) => ({
          id: option.id,
          label: option.label,
          fightPower: option.fightPower,
          attrs: option.attrs,
        })),
        defaultValue: breathingChoiceId(acupoint.quality, acupoint.level),
      };
    }).filter((item: ItemChoiceItem) => item.options.length > 0);
  }
  return [];
}

export function ItemChoicePanel({
  module,
  point,
  activeWeights,
  customSelections,
  onSetItemChoice,
  onResetModuleCustomChoices,
}: {
  module: ExtremeModule;
  point: StagePoint | null;
  activeWeights: Record<string, number>;
  customSelections: CustomSelectionMap;
  onSetItemChoice: (moduleKey: string, stageKey: string, choiceKey: string, itemId: string, defaultItemId: string) => void;
  onResetModuleCustomChoices: (moduleKey: string) => void;
}) {
  const choices = getItemChoiceItems(module, point, activeWeights);
  if (!point || choices.length === 0) return null;
  const storageKey = moduleStorageKey(module.key);
  const customizedCount = choices.filter(choice => {
    const selected = customSelections.itemChoices?.[storageKey]?.[point.stageKey]?.[choice.choiceKey] || choice.defaultValue;
    return selected !== choice.defaultValue;
  }).length;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-textMain">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          构成选择
        </div>
        <button
          type="button"
          onClick={() => onResetModuleCustomChoices(module.key)}
          disabled={customizedCount === 0}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs font-bold text-textSub transition hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          恢复本模块默认构成
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {choices.map(choice => {
          const selected = customSelections.itemChoices?.[storageKey]?.[point.stageKey]?.[choice.choiceKey] || choice.defaultValue;
          const selectedOption = choice.options.find(option => option.id === selected) || choice.options.find(option => option.id === choice.defaultValue) || choice.options[0];
          const isDefault = selectedOption.id === choice.defaultValue;
          return (
            <div key={choice.choiceKey} className="rounded-lg border border-border/70 bg-surface/40 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-textMain">{choice.label}</div>
                  <div className="mt-1 text-xs text-textSub">候选 {formatNumber(choice.options.length)} 件；当前战力 {formatNumber(selectedOption.fightPower)}。</div>
                </div>
                <button
                  type="button"
                  onClick={() => onSetItemChoice(module.key, point.stageKey, choice.choiceKey, choice.defaultValue, choice.defaultValue)}
                  disabled={isDefault}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-bold text-textSub transition hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  默认
                </button>
              </div>
              <select
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-textMain outline-none focus:border-primary"
                value={selectedOption.id}
                onChange={(event) => onSetItemChoice(module.key, point.stageKey, choice.choiceKey, event.target.value, choice.defaultValue)}
              >
                {choice.options.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.label}，战力 {formatNumber(option.fightPower)}
                  </option>
                ))}
              </select>
              <div className="mt-2 text-xs leading-5 text-textSub">{formatAttrsInline(selectedOption.attrs, 5)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
