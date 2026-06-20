import type { StagePoint, ExtremeModule, CustomSelectionMap } from './core';
import { mergeAttrs, calcFightPower, scaledAttrs } from './core';
import { levelChoiceId, getStageItemChoices } from './itemSelectionsA';

export function starcoreChoiceId(quality: number, satelliteLevel: number) {
  return `quality=${quality}:satellite=${satelliteLevel}`;
}

export function parseStarcoreChoiceId(choiceId: string | undefined) {
  const match = typeof choiceId === 'string' ? /^quality=(\d+):satellite=(\d+)$/.exec(choiceId) : null;
  if (!match) return null;
  return { quality: Number(match[1]), satelliteLevel: Number(match[2]) };
}

export function calcStarcoreAttrs(fields: string[] | undefined, ratio: number | undefined, worldAttrs: Record<string, number> | undefined, levelRatio = 1) {
  const attrs: Record<string, number> = {};
  if (!Array.isArray(fields) || typeof ratio !== 'number' || !Number.isFinite(ratio)) return attrs;
  for (const field of fields) {
    const value = worldAttrs?.[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    attrs[field] = Math.round(value * ratio * levelRatio);
  }
  return attrs;
}

export function buildStarcoreOption(star: any, quality: number, satelliteLevel: number, worldAttrs: Record<string, number> | undefined, activeWeights: Record<string, number>) {
  const qualityConfig = (star.mainQualitySummary || []).find((item: any) => item.quality === quality);
  if (!qualityConfig) return null;
  const satelliteMaxLevel = typeof star.satelliteMaxLevel === 'number' && Number.isFinite(star.satelliteMaxLevel)
    ? star.satelliteMaxLevel
    : satelliteLevel;
  const satelliteRatio = satelliteMaxLevel > 0 ? Math.min(satelliteLevel / satelliteMaxLevel, 1) : 0;
  const mainAttrs = calcStarcoreAttrs(qualityConfig.attributes, qualityConfig.ratio, worldAttrs);
  const satelliteAttrs = calcStarcoreAttrs(star.satellite?.attributes, star.satellite?.ratio, worldAttrs, satelliteRatio);
  const attrs: Record<string, number> = {};
  mergeAttrs(attrs, mainAttrs);
  mergeAttrs(attrs, satelliteAttrs);
  return {
    id: starcoreChoiceId(quality, satelliteLevel),
    label: `品质 ${quality} / 伴星 Lv.${satelliteLevel}`,
    starCoreId: star.id,
    starCoreName: star.name,
    quality,
    qualityRatio: qualityConfig.ratio,
    satelliteLevel,
    satelliteRatio: star.satellite?.ratio,
    mainAttrs,
    satelliteAttrs,
    attrs,
    mainFightPower: calcFightPower(mainAttrs, activeWeights),
    satelliteFightPower: calcFightPower(satelliteAttrs, activeWeights),
    fightPower: calcFightPower(attrs, activeWeights),
  };
}

export function applyStarcoreSelections(module: ExtremeModule, point: StagePoint, customSelections: CustomSelectionMap, activeWeights: Record<string, number>) {
  if (point.moduleKey !== 'starcore' || !Array.isArray(point.params?.selectedStars)) return point;
  const stageChoices = getStageItemChoices(customSelections, 'starcore', point.stageKey);
  if (Object.keys(stageChoices).length === 0) return point;
  const starsById = new Map((module.stars || []).map((star: any) => [String(star.id), star]));
  let customItemSelectionCount = 0;
  const selectedStars = point.params.selectedStars.map((current: any) => {
    const star = starsById.get(String(current.starCoreId));
    const parsed = parseStarcoreChoiceId(stageChoices[String(current.starCoreId)]);
    if (!star || !parsed) return current;
    const selected = buildStarcoreOption(star, parsed.quality, parsed.satelliteLevel, point.params?.worldAttrs, activeWeights);
    if (!selected || (selected.quality === current.quality && selected.satelliteLevel === current.satelliteLevel)) return current;
    customItemSelectionCount += 1;
    return selected;
  });
  if (customItemSelectionCount === 0) return point;
  const attrs: Record<string, number> = {};
  for (const star of selectedStars) mergeAttrs(attrs, star.attrs);
  return {
    ...point,
    label: `${point.label}（自选星核）`,
    params: {
      ...point.params,
      selectedStars,
      customItemEnabled: true,
      customItemSelectionCount,
    },
    attrs,
    fightPower: calcFightPower(attrs, activeWeights),
  };
}

export function buildMagicSoulOption(candidate: any, soulLevel: number, activeWeights: Record<string, number>) {
  const attrs = scaledAttrs(candidate.baseAttrs, soulLevel);
  return {
    id: String(candidate.soulId),
    label: `${candidate.soulName} · ${candidate.level}阶`,
    slotType: candidate.slotType,
    slotLabel: candidate.slotLabel,
    soulId: candidate.soulId,
    soulName: candidate.soulName,
    quality: candidate.quality,
    level: candidate.level,
    strength: candidate.strength,
    baseAttrs: candidate.baseAttrs,
    baseFightPower: candidate.baseFightPower,
    attrs,
    fightPower: calcFightPower(attrs, activeWeights),
  };
}

export function magicSoulOptionsForSlot(module: ExtremeModule, slotType: number, soulLevelLimit: number, soulLevel: number, activeWeights: Record<string, number>) {
  return (module.soulCandidates || [])
    .filter((candidate: any) => candidate.slotType === slotType && candidate.level <= soulLevelLimit)
    .map((candidate: any) => buildMagicSoulOption(candidate, soulLevel, activeWeights))
    .sort((left: any, right: any) => right.fightPower - left.fightPower || right.level - left.level || right.quality - left.quality || left.soulId - right.soulId);
}

export function magicWeaponChoiceKey(groupId: number | string) {
  return `${groupId}:weapon`;
}

export function magicWeaponOptionsForGroup(module: ExtremeModule, groupId: number | string, level: number, soulLevel: number) {
  const group = (module.groups || []).find((item: any) => String(item.groupId) === String(groupId));
  return (group?.weaponOptions || []).map((weapon: any) => {
    const levels = weapon.levels || [];
    const maxLevel = levels.length > 0
      ? Math.max(...levels.map((item: StagePoint) => item.params?.level || 0))
      : weapon.maxFightPowerPoint?.params?.level || level;
    const pointLevel = Math.min(level, maxLevel);
    const pointSoulLevel = weapon.maxSoulLevel > 0 ? Math.min(soulLevel, weapon.maxSoulLevel) : 0;
    const point = levels.find((item: StagePoint) =>
      item.params?.level === pointLevel && item.params?.soulLevel === pointSoulLevel
    ) || weapon.maxFightPowerPoint;
    if (!point) return null;
    return {
      id: String(weapon.magicWeaponId),
      label: `${weapon.magicWeaponName} · ${weapon.phase}阶`,
      groupId: weapon.groupId,
      magicWeaponId: weapon.magicWeaponId,
      magicWeaponName: weapon.magicWeaponName,
      phase: weapon.phase,
      roleLevelRequired: point.params?.roleLevelRequired,
      level: point.params?.level,
      growth: point.params?.growth,
      soulLevel: point.params?.soulLevel,
      maxSoulLevel: point.params?.maxSoulLevel,
      soulLevelLimit: point.params?.soulLevelLimit,
      closeSoul: point.params?.closeSoul,
      baseFightPower: point.params?.baseFightPower,
      baseAttrs: point.params?.baseAttrs,
      soulFightPower: point.params?.soulFightPower,
      soulAttrs: point.params?.soulAttrs,
      selectedSouls: point.params?.selectedSouls || [],
      attrs: point.attrs,
      fightPower: point.fightPower,
    };
  }).filter(Boolean).sort((left: any, right: any) => right.phase - left.phase || right.fightPower - left.fightPower || left.magicWeaponId - right.magicWeaponId);
}

export function applyMagicSoulSelections(module: ExtremeModule, point: StagePoint, customSelections: CustomSelectionMap, activeWeights: Record<string, number>) {
  if (point.moduleKey !== 'magic' || !Array.isArray(point.params?.selectedWeapons)) return point;
  const stageChoices = getStageItemChoices(customSelections, 'magic', point.stageKey);
  if (Object.keys(stageChoices).length === 0) return point;
  let customItemSelectionCount = 0;
  const selectedWeapons = point.params.selectedWeapons.map((weapon: any) => {
    const selectedWeaponId = stageChoices[magicWeaponChoiceKey(weapon.groupId)];
    let nextWeapon = weapon;
    if (selectedWeaponId) {
      const selectedWeapon = magicWeaponOptionsForGroup(module, weapon.groupId, point.params?.level, point.params?.soulLevel)
        .find((option: any) => option.id === selectedWeaponId);
      if (selectedWeapon && selectedWeapon.magicWeaponId !== weapon.magicWeaponId) {
        customItemSelectionCount += 1;
        nextWeapon = selectedWeapon;
      }
    }
    if (nextWeapon.closeSoul || !Array.isArray(nextWeapon.selectedSouls)) return nextWeapon;
    const selectedSouls = nextWeapon.selectedSouls.map((soul: any) => {
      const choiceKey = `${nextWeapon.groupId}:${soul.slotType}`;
      const selectedId = stageChoices[choiceKey];
      if (!selectedId) return soul;
      const selected = magicSoulOptionsForSlot(module, soul.slotType, nextWeapon.soulLevelLimit, nextWeapon.soulLevel, activeWeights)
        .find((option: any) => option.id === selectedId);
      if (!selected || selected.soulId === soul.soulId) return soul;
      customItemSelectionCount += 1;
      return {
        ...soul,
        soulId: selected.soulId,
        soulName: selected.soulName,
        quality: selected.quality,
        level: selected.level,
        strength: selected.strength,
        baseAttrs: selected.baseAttrs,
        baseFightPower: selected.baseFightPower,
        attrs: selected.attrs,
        fightPower: selected.fightPower,
      };
    });
    const soulAttrs: Record<string, number> = {};
    for (const soul of selectedSouls) mergeAttrs(soulAttrs, soul.attrs);
    const attrs: Record<string, number> = {};
    mergeAttrs(attrs, nextWeapon.baseAttrs);
    mergeAttrs(attrs, soulAttrs);
    return {
      ...nextWeapon,
      selectedSouls,
      soulAttrs,
      soulFightPower: calcFightPower(soulAttrs, activeWeights),
      attrs,
      fightPower: calcFightPower(attrs, activeWeights),
    };
  });
  if (customItemSelectionCount === 0) return point;
  const attrs: Record<string, number> = {};
  for (const weapon of selectedWeapons) mergeAttrs(attrs, weapon.attrs);
  return {
    ...point,
    label: `${point.label}（自选法宝/器魂）`,
    params: {
      ...point.params,
      selectedWeapons,
      customItemEnabled: true,
      customItemSelectionCount,
    },
    attrs,
    fightPower: calcFightPower(attrs, activeWeights),
  };
}

export function wingOptionsForWing(module: ExtremeModule, wingId: number | string) {
  const wing = (module.wings || []).find((item: any) => String(item.wingId) === String(wingId));
  const points = wing?.levels || (wing?.maxFightPowerPoint ? [wing.maxFightPowerPoint] : []);
  return points.map((point: StagePoint) => ({
    id: levelChoiceId(point.params?.wingLevel),
    label: `Lv.${point.params?.wingLevel} / 品质 ${point.params?.quality}`,
    wingId: point.params?.wingId,
    wingName: point.params?.wingName,
    buteId: point.params?.buteId,
    wingAttributeId: point.evidence?.find(row => row.table === 'wingAttribute')?.id,
    wingLevel: point.params?.wingLevel,
    quality: point.params?.quality,
    roleLevelRequired: point.params?.roleLevelRequired,
    attrs: point.attrs,
    fightPower: point.fightPower,
  })).sort((left: any, right: any) => right.wingLevel - left.wingLevel);
}

export function applyWingSelections(module: ExtremeModule, point: StagePoint, customSelections: CustomSelectionMap, activeWeights: Record<string, number>) {
  if (point.moduleKey !== 'wing' || !Array.isArray(point.params?.selectedWings)) return point;
  const stageChoices = getStageItemChoices(customSelections, 'wing', point.stageKey);
  if (Object.keys(stageChoices).length === 0) return point;
  let customItemSelectionCount = 0;
  let roleLevelRequired = 0;
  const selectedWings = point.params.selectedWings.map((wing: any) => {
    const choiceKey = String(wing.wingId);
    const selectedId = stageChoices[choiceKey];
    const selected = selectedId
      ? wingOptionsForWing(module, wing.wingId).find((option: any) => option.id === selectedId)
      : null;
    const nextWing = selected && selected.wingLevel !== wing.wingLevel
      ? selected
      : wing;
    if (nextWing !== wing) customItemSelectionCount += 1;
    roleLevelRequired = Math.max(roleLevelRequired, nextWing.roleLevelRequired || 0);
    return nextWing;
  });
  if (customItemSelectionCount === 0) return point;
  const attrs: Record<string, number> = {};
  for (const wing of selectedWings) mergeAttrs(attrs, wing.attrs);
  return {
    ...point,
    label: `${point.label}（自选翅膀等级）`,
    params: {
      ...point.params,
      selectedWings,
      roleLevelRequired,
      customItemEnabled: true,
      customItemSelectionCount,
    },
    attrs,
    fightPower: calcFightPower(attrs, activeWeights),
  };
}

export function xianpoChoiceId(quality: number, level: number) {
  return `quality=${quality}:level=${level}`;
}

export function xianpoOptionsForType(module: ExtremeModule, type: number | string, unlockedLayerCount: number, activeWeights: Record<string, number>) {
  const typeNode = (module.types || []).find((item: any) => String(item.type) === String(type));
  return (typeNode?.qualityLevels || []).flatMap((qualityNode: any) => (
    (qualityNode.levels || []).map((levelPoint: StagePoint) => {
      const totalAttrs = scaledAttrs(levelPoint.attrs, unlockedLayerCount);
      return {
        id: xianpoChoiceId(levelPoint.params?.quality, levelPoint.params?.level),
        label: `${qualityNode.qualityName || `品质 ${qualityNode.quality}`} Lv.${levelPoint.params?.level}`,
        type: levelPoint.params?.type,
        typeName: typeNode.typeName,
        xianpoId: levelPoint.params?.xianpoId,
        xianpoName: levelPoint.label.replace(` Lv.${levelPoint.params?.level}`, ''),
        quality: levelPoint.params?.quality,
        qualityName: qualityNode.qualityName,
        level: levelPoint.params?.level,
        roleLevelRequired: levelPoint.params?.roleLevelRequired,
        slotCount: unlockedLayerCount,
        perSlotAttrs: levelPoint.attrs,
        totalAttrs,
        perSlotFightPower: levelPoint.fightPower,
        fightPower: calcFightPower(totalAttrs, activeWeights),
        tableId: levelPoint.evidence?.[0]?.id,
      };
    })
  )).sort((left: any, right: any) =>
    right.fightPower - left.fightPower ||
    right.quality - left.quality ||
    right.level - left.level
  );
}

export function applyXianpoSelections(module: ExtremeModule, point: StagePoint, customSelections: CustomSelectionMap, activeWeights: Record<string, number>) {
  if (point.moduleKey !== 'xianpo' || !Array.isArray(point.params?.selectedXianpos)) return point;
  const stageChoices = getStageItemChoices(customSelections, 'xianpo', point.stageKey);
  if (Object.keys(stageChoices).length === 0) return point;
  const unlockedLayerCount = point.params?.unlockedLayerCount || 0;
  let customItemSelectionCount = 0;
  let roleLevelRequired = 0;
  const selectedXianpos = point.params.selectedXianpos.map((xianpo: any) => {
    const choiceKey = String(xianpo.type);
    const selectedId = stageChoices[choiceKey];
    const selected = selectedId
      ? xianpoOptionsForType(module, xianpo.type, unlockedLayerCount, activeWeights).find((option: any) => option.id === selectedId)
      : null;
    const nextXianpo = selected && (selected.quality !== xianpo.quality || selected.level !== xianpo.level)
      ? selected
      : xianpo;
    if (nextXianpo !== xianpo) customItemSelectionCount += 1;
    roleLevelRequired = Math.max(roleLevelRequired, nextXianpo.roleLevelRequired || 0);
    return nextXianpo;
  });
  if (customItemSelectionCount === 0) return point;
  const attrs: Record<string, number> = {};
  for (const xianpo of selectedXianpos) mergeAttrs(attrs, xianpo.totalAttrs);
  return {
    ...point,
    label: `${point.label}（自选仙魄）`,
    params: {
      ...point.params,
      selectedXianpos,
      roleLevelRequired,
      customItemEnabled: true,
      customItemSelectionCount,
    },
    attrs,
    fightPower: calcFightPower(attrs, activeWeights),
  };
}

export const NEIDAN_DANQI_CHOICE_KEY = 'danqi';

export function neidanDanqiChoiceKey(slotIndex: string | number) {
  return `${NEIDAN_DANQI_CHOICE_KEY}:${slotIndex}`;
}

export function neidanDanqiOptions(module: ExtremeModule) {
  const options = Array.isArray(module.danqiOptions) && module.danqiOptions.length > 0
    ? module.danqiOptions
    : (module.rows || []).flatMap((row: StagePoint) => row.params?.candidateDanqis || []);
  return options.map((option: any) => ({
    id: String(option.danqiId),
    label: option.danqiName || `丹气 ${option.danqiId}`,
    selectedDanqi: option,
    attrs: option.perSlotAttrs || option.attrs,
    fightPower: option.perSlotFightPower ?? option.fightPower,
  })).filter((option: any) => option.id && option.id !== 'undefined')
    .sort((left: any, right: any) => right.fightPower - left.fightPower || left.label.localeCompare(right.label));
}

export function applyNeidanDanqiSelection(module: ExtremeModule, point: StagePoint, customSelections: CustomSelectionMap, activeWeights: Record<string, number>) {
  if (point.moduleKey !== 'neidan') return point;
  const stageChoices = getStageItemChoices(customSelections, 'neidan', point.stageKey);
  if (Object.keys(stageChoices).length === 0) return point;
  const options: any[] = neidanDanqiOptions(module);
  const optionById = new Map<string, any>(options.map((option: any) => [option.id, option]));
  const currentSlots = point.params?.selectedDanqis || [];
  const used = new Set<string>();
  let customItemSelectionCount = 0;
  const selectedDanqis = currentSlots.map((current: any, index: number) => {
    const slotIndex = current.slotIndex ?? index + 1;
    const requestedId = stageChoices[neidanDanqiChoiceKey(slotIndex)] || String(current.danqiId);
    let selected: any = optionById.get(requestedId);
    if (!selected || used.has(selected.id)) selected = optionById.get(String(current.danqiId));
    if (!selected || used.has(selected.id)) selected = options.find((option: any) => !used.has(option.id));
    if (!selected) return current;
    used.add(selected.id);
    if (selected.id !== String(current.danqiId)) customItemSelectionCount += 1;
    return {
      ...selected.selectedDanqi,
      slotIndex,
      attrs: selected.attrs,
      fightPower: selected.fightPower,
      perSlotAttrs: selected.attrs,
      perSlotFightPower: selected.fightPower,
    };
  });
  if (customItemSelectionCount === 0) return point;
  const attrs: Record<string, number> = {};
  for (const danqi of selectedDanqis) mergeAttrs(attrs, danqi.perSlotAttrs || danqi.attrs);
  return {
    ...point,
    label: `${point.label}（自选丹气）`,
    params: {
      ...point.params,
      selectedDanqis,
      selectedDanqi: selectedDanqis[0],
      customItemEnabled: true,
      customItemSelectionCount,
    },
    attrs,
    fightPower: calcFightPower(attrs, activeWeights),
  };
}

export function smeltPartChoiceKey(part: string | number) {
  return `part:${part}`;
}

export function smeltPartOptionsForPart(point: StagePoint, part: string | number) {
  const selected = (point.params?.selectedSmelts || []).find((item: any) => String(item.part) === String(part));
  return (selected?.candidateOptions || []).map((option: any) => ({
    id: option.id,
    label: `${option.partLabel || option.part} · ${option.smeltKindLabel} Lv.${option.smeltLv}`,
    ...option,
  }));
}

export function applySmeltSelections(point: StagePoint, customSelections: CustomSelectionMap, activeWeights: Record<string, number>) {
  if (point.moduleKey !== 'smelt' || !Array.isArray(point.params?.selectedSmelts)) return point;
  const stageChoices = getStageItemChoices(customSelections, 'smelt', point.stageKey);
  if (Object.keys(stageChoices).length === 0) return point;
  let customItemSelectionCount = 0;
  const selectedSmelts = point.params.selectedSmelts.map((current: any) => {
    const selectedId = stageChoices[smeltPartChoiceKey(current.part)];
    const selected = selectedId
      ? smeltPartOptionsForPart(point, current.part).find((option: any) => option.id === selectedId)
      : null;
    if (!selected || selected.id === current.id) return current;
    customItemSelectionCount += 1;
    return {
      ...selected,
      candidateOptions: current.candidateOptions,
    };
  });
  if (customItemSelectionCount === 0) return point;
  const rawAttrs: Record<string, number> = {};
  for (const item of selectedSmelts) mergeAttrs(rawAttrs, item.rawAttrs || item.attrs);
  const attrs = Object.fromEntries(
    Object.entries(rawAttrs).map(([field, value]) => [field, value >= 0 ? Math.floor(value) : Math.ceil(value)])
  );
  return {
    ...point,
    label: `${point.label}（自选熔炼装备）`,
    params: {
      ...point.params,
      selectedSmelts,
      customItemEnabled: true,
      customItemSelectionCount,
    },
    attrs,
    fightPower: calcFightPower(attrs, activeWeights),
  };
}

export function breathingChoiceKey(acupoint: any) {
  return `${acupoint.breathingId}:${acupoint.type}`;
}

export function breathingChoiceId(quality: number, level: number) {
  return `quality=${quality}:level=${level}`;
}

export function breathingAcupointOptions(module: ExtremeModule, choiceKey: string, activeWeights: Record<string, number>) {
  const options = [];
  const seen = new Set<string>();
  const points = module.fullByQualityLevel || (module.maxFightPowerPoint ? [module.maxFightPowerPoint] : []);
  for (const point of points) {
    const acupoint = (point.params?.selectedAcupoints || []).find((item: any) => breathingChoiceKey(item) === choiceKey);
    if (!acupoint) continue;
    const id = breathingChoiceId(acupoint.quality, acupoint.level);
    if (seen.has(id)) continue;
    seen.add(id);
    const attrs = { [acupoint.attribute]: acupoint.finalValue };
    options.push({
      id,
      label: `品质 ${acupoint.quality} / 精纯 Lv.${acupoint.level}`,
      breathingId: acupoint.breathingId,
      breathingName: acupoint.breathingName,
      type: acupoint.type,
      attribute: acupoint.attribute,
      requestedLevel: acupoint.requestedLevel,
      level: acupoint.level,
      maxLevel: acupoint.maxLevel,
      quality: acupoint.quality,
      qualityRatio: acupoint.qualityRatio,
      baseValue: acupoint.baseValue,
      finalValue: acupoint.finalValue,
      fightPower: calcFightPower(attrs, activeWeights),
      attrs,
      rowCount: acupoint.rowCount,
      firstRowId: acupoint.firstRowId,
      lastRowId: acupoint.lastRowId,
    });
  }
  return options.sort((left, right) =>
    right.fightPower - left.fightPower ||
    right.quality - left.quality ||
    right.level - left.level
  );
}

export function applyBreathingAcupointSelections(module: ExtremeModule, point: StagePoint, customSelections: CustomSelectionMap, activeWeights: Record<string, number>) {
  if (point.moduleKey !== 'breathing' || !Array.isArray(point.params?.selectedAcupoints)) return point;
  const stageChoices = getStageItemChoices(customSelections, 'breathing', point.stageKey);
  if (Object.keys(stageChoices).length === 0) return point;

  let customItemSelectionCount = 0;
  const selectedAcupoints = point.params.selectedAcupoints.map((acupoint: any) => {
    const choiceKey = breathingChoiceKey(acupoint);
    const selectedId = stageChoices[choiceKey];
    if (!selectedId) return acupoint;
    const selected = breathingAcupointOptions(module, choiceKey, activeWeights).find((option: any) => option.id === selectedId);
    if (!selected || (selected.quality === acupoint.quality && selected.level === acupoint.level)) return acupoint;
    customItemSelectionCount += 1;
    return {
      ...acupoint,
      requestedLevel: selected.requestedLevel,
      level: selected.level,
      quality: selected.quality,
      qualityRatio: selected.qualityRatio,
      baseValue: selected.baseValue,
      finalValue: selected.finalValue,
      fightPower: selected.fightPower,
      attrs: selected.attrs,
    };
  });

  if (customItemSelectionCount === 0) return point;

  const attrs: Record<string, number> = {};
  for (const acupoint of selectedAcupoints) {
    mergeAttrs(attrs, acupoint.attrs || { [acupoint.attribute]: acupoint.finalValue });
  }
  return {
    ...point,
    label: `${point.label}（自选穴位）`,
    params: {
      ...point.params,
      selectedAcupoints,
      customItemEnabled: true,
      customItemSelectionCount,
    },
    attrs,
    fightPower: calcFightPower(attrs, activeWeights),
  };
}
