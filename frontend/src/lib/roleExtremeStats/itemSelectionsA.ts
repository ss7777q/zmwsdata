import type { StagePoint, ExtremeModule, CustomSelectionMap } from './core';
import { mergeAttrs, calcFightPower, roundAttrs, applyFashionBallRatio, moduleStorageKey, buildEquipmentSystemContributionRows } from './core';

export function fashionCandidatesByPart(module: ExtremeModule) {
  const map = new Map<string, any[]>();
  for (const part of module.parts || []) {
    if (part?.part && Array.isArray(part.candidates)) map.set(String(part.part), part.candidates);
  }
  return map;
}

export function buildFashionItem(candidate: any, ballRatios: Record<string, number> | undefined, activeWeights: Record<string, number>) {
  const attrs = roundAttrs(applyFashionBallRatio(candidate.baseAttrs, ballRatios));
  return {
    part: candidate.part,
    fashionId: candidate.fashionId,
    fashionName: candidate.fashionName,
    fashionType: candidate.fashionType,
    fightPower: calcFightPower(attrs, activeWeights),
    attrs,
  };
}

export function applyFashionItemSelections(module: ExtremeModule, point: StagePoint, customSelections: CustomSelectionMap, activeWeights: Record<string, number>) {
  if (point.moduleKey !== 'fashion' || !Array.isArray(point.params?.selectedFashions)) return point;
  const stageChoices = customSelections.itemChoices?.fashion?.[point.stageKey];
  if (!stageChoices || Object.keys(stageChoices).length === 0) return point;
  const candidatesByPart = fashionCandidatesByPart(module);
  const selectedFashions = [];
  let customItemSelectionCount = 0;

  for (const current of point.params.selectedFashions) {
    const part = String(current.part);
    const candidates = candidatesByPart.get(part) || [];
    const selectedId = stageChoices[part];
    const selectedCandidate = selectedId
      ? candidates.find(candidate => String(candidate.fashionId) === selectedId)
      : null;
    if (selectedCandidate && selectedCandidate.fashionId !== current.fashionId) {
      customItemSelectionCount += 1;
      selectedFashions.push(buildFashionItem(selectedCandidate, point.params.ballRatios, activeWeights));
    } else {
      selectedFashions.push(current);
    }
  }

  if (customItemSelectionCount === 0) return point;

  const attrs: Record<string, number> = {};
  for (const fashion of selectedFashions) mergeAttrs(attrs, fashion.attrs);
  return {
    ...point,
    label: `${point.label}（自选时装）`,
    params: {
      ...point.params,
      selectedFashions,
      customItemEnabled: true,
      customItemSelectionCount,
    },
    attrs,
    fightPower: calcFightPower(attrs, activeWeights),
  };
}

export function levelChoiceId(level: number) {
  return `level=${level}`;
}

export function heartLineOptions(module: ExtremeModule, field: string) {
  return (module.attributeCurves?.[field] || []).map((point: StagePoint) => {
    const value = point.attrs?.[field] || 0;
    return {
      id: levelChoiceId(point.params?.heartLevel),
      label: `Lv.${point.params?.heartLevel}`,
      field,
      heartLevel: point.params?.heartLevel,
      roleLevelRequired: point.params?.roleLevelRequired,
      tableId: point.evidence?.[0]?.id,
      value,
      attrs: { [field]: value },
      fightPower: point.fightPower,
    };
  }).sort((left: any, right: any) => right.heartLevel - left.heartLevel);
}

export function applyHeartLineSelections(module: ExtremeModule, point: StagePoint, customSelections: CustomSelectionMap, activeWeights: Record<string, number>) {
  if (point.moduleKey !== 'heart' || !Array.isArray(point.params?.selectedLines)) return point;
  const stageChoices = getStageItemChoices(customSelections, 'heart', point.stageKey);
  if (Object.keys(stageChoices).length === 0) return point;
  let customItemSelectionCount = 0;
  const selectedLines = point.params.selectedLines.map((line: any) => {
    const field = String(line.field);
    const selectedId = stageChoices[field];
    const selected = selectedId
      ? heartLineOptions(module, field).find((option: any) => option.id === selectedId)
      : null;
    if (!selected || selected.heartLevel === line.heartLevel) return line;
    customItemSelectionCount += 1;
    return {
      ...line,
      value: selected.value,
      fightPower: selected.fightPower,
      heartLevel: selected.heartLevel,
      roleLevelRequired: selected.roleLevelRequired,
      tableId: selected.tableId,
      attrs: selected.attrs,
    };
  });
  if (customItemSelectionCount === 0) return point;
  const attrs: Record<string, number> = {};
  for (const line of selectedLines) mergeAttrs(attrs, line.attrs || { [line.field]: line.value });
  return {
    ...point,
    label: `${point.label}（自选心法线）`,
    params: {
      ...point.params,
      selectedLines,
      customItemEnabled: true,
      customItemSelectionCount,
    },
    attrs,
    fightPower: calcFightPower(attrs, activeWeights),
  };
}

export function getStageItemChoices(customSelections: CustomSelectionMap, moduleKey: string, stageKey: string) {
  return customSelections.itemChoices?.[moduleStorageKey(moduleKey)]?.[stageKey] || {};
}

export function equipmentCandidateGroupsByPart(point: StagePoint | null) {
  const map = new Map<string, any[]>();
  for (const group of point?.params?.candidateGroups || []) {
    if (group?.part && Array.isArray(group.candidates)) map.set(String(group.part), group.candidates);
  }
  return map;
}

export function equipmentStoneChoiceKey(part: string | number, slotIndex: string | number) {
  return `${part}:stone:${slotIndex}`;
}

function stoneCandidateSourceForEquip(point: StagePoint, equip: any, slot?: any) {
  if (Array.isArray(slot?.candidateOptions) && slot.candidateOptions.length > 0) return slot.candidateOptions;
  if (Array.isArray(equip?.stoneCandidateOptions) && equip.stoneCandidateOptions.length > 0) return equip.stoneCandidateOptions;
  if (Array.isArray(equip?.allowedStoneGroups) && Array.isArray(point.params?.stoneInfo?.options)) {
    const allowed = new Set(equip.allowedStoneGroups.map((group: any) => Number(group)));
    return (point.params?.stoneInfo?.options || []).filter((stone: any) => allowed.has(Number(stone.group)));
  }
  return [];
}

export function equipmentStoneOptionsForEquip(point: StagePoint, equip: any, activeWeights: Record<string, number>, slot?: any) {
  return stoneCandidateSourceForEquip(point, equip, slot).map((stone: any) => {
    return {
      id: String(stone.stoneId),
      label: stone.stoneName || `宝石 ${stone.stoneId}`,
      stoneId: stone.stoneId,
      stoneName: stone.stoneName,
      stoneLevel: stone.level ?? stone.stoneLevel ?? point.params?.stoneInfo?.maxStoneLevel,
      group: stone.group,
      allowedStoneGroups: slot?.allowedStoneGroups || equip?.allowedStoneGroups,
      attrs: stone.attrs,
      perStoneAttrs: stone.attrs,
      fightPower: calcFightPower(stone.attrs, activeWeights),
    };
  }).sort((left: any, right: any) => right.fightPower - left.fightPower || left.label.localeCompare(right.label));
}

export function rebuildEquipmentWithStoneSlots(equip: any, stoneSlots: any[], activeWeights: Record<string, number>) {
  const stoneAttrs: Record<string, number> = {};
  for (const slot of stoneSlots) mergeAttrs(stoneAttrs, slot.attrs);
  const attrs: Record<string, number> = {};
  mergeAttrs(attrs, equip.baseAttrs);
  mergeAttrs(attrs, equip.affixAttrs);
  mergeAttrs(attrs, equip.upgradeAttrs);
  mergeAttrs(attrs, stoneAttrs);
  return {
    ...equip,
    stoneId: stoneSlots[0]?.stoneId ?? null,
    stoneName: stoneSlots[0]?.stoneName ?? null,
    stoneIds: stoneSlots.map(slot => slot.stoneId),
    stoneNames: stoneSlots.map(slot => slot.stoneName),
    stoneLevel: stoneSlots[0]?.stoneLevel ?? equip.stoneLevel,
    stoneSlots,
    stoneAttrs,
    attrs,
    fightPower: calcFightPower(attrs, activeWeights),
  };
}

export function normalizeEquipmentStoneSlots(point: StagePoint, equip: any, stageChoices: Record<string, string>, activeWeights: Record<string, number>) {
  const defaultSlots = Array.isArray(equip.stoneSlots) ? equip.stoneSlots : [];
  const used = new Set<string>();
  const stoneSlots = defaultSlots.map((slot: any, index: number) => {
    const options: any[] = equipmentStoneOptionsForEquip(point, equip, activeWeights, slot);
    const optionById = new Map<string, any>(options.map((option: any) => [String(option.stoneId), option]));
    const choiceKey = equipmentStoneChoiceKey(equip.part, slot.slotIndex ?? index + 1);
    const requestedId = stageChoices[choiceKey] || String(slot.stoneId);
    let selected: any = optionById.get(requestedId);
    if (!selected || used.has(String(selected.stoneId))) {
      selected = optionById.get(String(slot.stoneId));
    }
    if (!selected || used.has(String(selected.stoneId))) {
      selected = options.find((option: any) => !used.has(String(option.stoneId)));
    }
    if (!selected) return slot;
    used.add(String(selected.stoneId));
    return {
      ...selected,
      slotIndex: slot.slotIndex ?? index + 1,
    };
  });
  const changed = stoneSlots.some((slot: any, index: number) => String(slot.stoneId) !== String(defaultSlots[index]?.stoneId));
  return { stoneSlots, changed };
}

export function equipmentSuitOptionsById(module: ExtremeModule) {
  return new Map<string, any>(
    (module.suitOptions || []).map((item: any) => [String(item.suitId), item])
  );
}

export function calcEquipmentSuitAttrsForSelection(module: ExtremeModule, selectedEquips: any[], roleId: number | undefined, activeWeights: Record<string, number>) {
  const suitCounts: Record<string, number> = {};
  for (const equip of selectedEquips) {
    const suitAttribute = equip?.suitAttribute;
    if (!Array.isArray(suitAttribute) || suitAttribute.length === 0) continue;
    const suitId = suitAttribute.length > 1 && typeof roleId === 'number'
      ? suitAttribute[roleId - 1]
      : suitAttribute[0];
    if (!suitId) continue;
    const key = String(suitId);
    suitCounts[key] = (suitCounts[key] || 0) + 1;
  }

  const suitOptions = equipmentSuitOptionsById(module);
  const attrs: Record<string, number> = {};
  const selectedSuits = Object.entries(suitCounts).map(([suitId, count]) => {
    const option = suitOptions.get(suitId);
    const tiers = (option?.tiers || [])
      .filter((tier: any) => typeof tier?.threshold === 'number' && tier.threshold <= count)
      .sort((left: any, right: any) => right.threshold - left.threshold);
    const tier = tiers[0];
    if (!tier) return null;
    mergeAttrs(attrs, tier.attrs);
    return {
      suitId: Number(suitId),
      count,
      threshold: tier.threshold,
      attrs: tier.attrs,
      fightPower: typeof tier.fightPower === 'number' ? tier.fightPower : calcFightPower(tier.attrs, activeWeights),
    };
  }).filter(Boolean);
  return { attrs, selectedSuits };
}

export function calcEquipment2AttrsFromSelection(selectedEquips: any[]) {
  const attrs: Record<string, number> = {};
  for (const equip of selectedEquips) {
    if (equip.part === 'jewelry') continue;
    mergeAttrs(attrs, equip.baseAttrs);
    mergeAttrs(attrs, equip.upgradeAttrs);
  }
  return attrs;
}

export function rebuildEquipmentPointWithEquips(module: ExtremeModule, point: StagePoint, selectedEquips: any[], activeWeights: Record<string, number>, customItemSelectionCount: number) {
  const baseAttrs: Record<string, number> = {};
  for (const equip of selectedEquips) mergeAttrs(baseAttrs, equip.attrs);
  const suitResult = calcEquipmentSuitAttrsForSelection(module, selectedEquips, point.params?.heroId, activeWeights);
  const attrs: Record<string, number> = {};
  mergeAttrs(attrs, baseAttrs);
  mergeAttrs(attrs, suitResult.attrs);
  const systemContributionRows = buildEquipmentSystemContributionRows(selectedEquips, suitResult.selectedSuits, activeWeights);
  return {
    ...point,
    label: customItemSelectionCount > 0 ? `${point.label}（自选装备）` : point.label,
    params: {
      ...point.params,
      selectedEquips,
      selectedSuits: suitResult.selectedSuits,
      baseFightPower: calcFightPower(baseAttrs, activeWeights),
      suitAttrs: suitResult.attrs,
      suitFightPower: calcFightPower(suitResult.attrs, activeWeights),
      equipment2Attrs: calcEquipment2AttrsFromSelection(selectedEquips),
      systemContributionRows,
      ...(customItemSelectionCount > 0 ? { customItemEnabled: true, customItemSelectionCount } : {}),
    },
    attrs,
    fightPower: calcFightPower(attrs, activeWeights),
  };
}

export function applyEquipmentItemSelections(module: ExtremeModule, point: StagePoint, customSelections: CustomSelectionMap, activeWeights: Record<string, number>) {
  if (point.moduleKey !== 'equipment' || !Array.isArray(point.params?.selectedEquips)) return point;
  const stageChoices = getStageItemChoices(customSelections, 'equipment', point.stageKey);
  if (Object.keys(stageChoices).length === 0) return point;
  const candidatesByPart = equipmentCandidateGroupsByPart(point);
  let customItemSelectionCount = 0;
  const selectedEquips = point.params.selectedEquips.map((equip: any) => {
    const part = String(equip.part);
    const selectedId = stageChoices[part];
    let nextEquip = equip;
    if (selectedId) {
      const selected = (candidatesByPart.get(part) || []).find(candidate => String(candidate.equipId) === selectedId);
      if (selected && selected.equipId !== equip.equipId) {
        customItemSelectionCount += 1;
        nextEquip = selected;
      }
    }
    if (Array.isArray(nextEquip.stoneSlots) && nextEquip.stoneSlots.length > 0) {
      const normalized = normalizeEquipmentStoneSlots(point, nextEquip, stageChoices, activeWeights);
      if (normalized.changed) {
        customItemSelectionCount += 1;
        nextEquip = rebuildEquipmentWithStoneSlots(nextEquip, normalized.stoneSlots, activeWeights);
      }
    }
    return nextEquip;
  });
  if (customItemSelectionCount === 0) return point;
  return rebuildEquipmentPointWithEquips(module, point, selectedEquips, activeWeights, customItemSelectionCount);
}

export function applyTitleItemSelections(point: StagePoint, customSelections: CustomSelectionMap, activeWeights: Record<string, number>) {
  if (point.moduleKey !== 'title' || !Array.isArray(point.params?.selectedTitles)) return point;
  const stageChoices = getStageItemChoices(customSelections, 'title', point.stageKey);
  if (Object.keys(stageChoices).length === 0) return point;
  let customItemSelectionCount = 0;
  const selectedTitles = point.params.selectedTitles.map((title: any) => {
    const selectedId = stageChoices[String(title.selectionPoolKey)];
    const selected = selectedId
      ? (title.candidateOptions || []).find((option: any) => String(option.titleId) === selectedId)
      : null;
    if (!selected || selected.titleId === title.titleId) return title;
    customItemSelectionCount += 1;
    return {
      ...title,
      titleType: selected.titleType,
      titleId: selected.titleId,
      titleName: selected.titleName,
      titleGroup: selected.titleGroup,
      titleLevel: selected.titleLevel,
      buteId: selected.buteId,
      titleAttributeId: selected.titleAttributeId,
      titleAttributeLevel: selected.titleAttributeLevel,
      fightPower: selected.fightPower,
      attrs: selected.attrs,
    };
  });
  if (customItemSelectionCount === 0) return point;
  const attrs: Record<string, number> = {};
  for (const title of selectedTitles) mergeAttrs(attrs, title.attrs);
  return {
    ...point,
    label: `${point.label}（自选称号）`,
    params: {
      ...point.params,
      selectedTitles,
      customItemEnabled: true,
      customItemSelectionCount,
    },
    attrs,
    fightPower: calcFightPower(attrs, activeWeights),
  };
}

export function matrixCoreGroupsByGroup(module: ExtremeModule) {
  return new Map<string, any[]>(
    (module.coreGroups || []).map((group: any) => [String(group.group), group.candidates || []])
  );
}

export function findMatrixSuitOption(module: ExtremeModule, suitId: number | string | undefined, quality: number | undefined) {
  return (module.suitOptions || []).find((item: any) => (
    String(item.suit) === String(suitId) && item.quality === quality
  ));
}

export function applyMatrixCoreSelections(module: ExtremeModule, point: StagePoint, customSelections: CustomSelectionMap, activeWeights: Record<string, number>) {
  if (point.moduleKey !== 'matrix' || !Array.isArray(point.params?.selectedMatrices)) return point;
  const stageChoices = getStageItemChoices(customSelections, 'matrix', point.stageKey);
  if (Object.keys(stageChoices).length === 0) return point;
  const candidatesByGroup = matrixCoreGroupsByGroup(module);
  let customItemSelectionCount = 0;
  const selectedMatrices = point.params.selectedMatrices.map((matrix: any) => {
    const selectedCores = (matrix.selectedCores || []).map((core: any) => {
      const choiceKey = `${matrix.matrixId}:${core.group}`;
      const selectedId = stageChoices[choiceKey];
      const selected = selectedId
        ? (candidatesByGroup.get(String(core.group)) || []).find(candidate => String(candidate.id) === selectedId)
        : null;
      if (!selected || selected.id === core.id) return core;
      customItemSelectionCount += 1;
      return selected;
    });
    const coreAttrs: Record<string, number> = {};
    for (const core of selectedCores) mergeAttrs(coreAttrs, core.attrs);
    const suitQuality = selectedCores.length > 0
      ? selectedCores.reduce((quality: number, core: any) => Math.min(quality, core.quality), Infinity)
      : null;
    const suitOption = Number.isFinite(suitQuality as number)
      ? findMatrixSuitOption(module, matrix.coreSuitId, suitQuality as number)
      : null;
    const attrs: Record<string, number> = {};
    mergeAttrs(attrs, coreAttrs);
    if (suitOption) mergeAttrs(attrs, suitOption.attrs);
    return {
      ...matrix,
      coreSuitQuality: suitOption?.quality ?? null,
      coreAttrs,
      suitAttrs: suitOption?.attrs || {},
      selectedCores,
      attrs,
      fightPower: calcFightPower(attrs, activeWeights),
    };
  });
  if (customItemSelectionCount === 0) return point;
  const attrs: Record<string, number> = {};
  for (const matrix of selectedMatrices) mergeAttrs(attrs, matrix.attrs);
  return {
    ...point,
    label: `${point.label}（自选阵眼）`,
    params: {
      ...point.params,
      selectedMatrices,
      customItemEnabled: true,
      customItemSelectionCount,
    },
    attrs,
    fightPower: calcFightPower(attrs, activeWeights),
  };
}
