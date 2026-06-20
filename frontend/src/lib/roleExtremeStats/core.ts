export interface Props {
  dataSources: Record<string, any>;
}

export interface StagePoint {
  moduleKey: string;
  stageKey: string;
  label: string;
  params: Record<string, any>;
  attrs: Record<string, number>;
  fightPower: number;
  evidence?: Array<Record<string, any>>;
  warnings?: string[];
}

export interface ExtremeModule {
  key: string;
  label: string;
  status: string;
  formula?: string;
  stageDimensions?: string[];
  maxFightPowerPoint?: StagePoint;
  warnings?: string[];
  parentKey?: string;
  displayKey?: string;
  equipmentSubsystem?: EquipmentSubsystemKey;
  [key: string]: any;
}

export type EquipmentSubsystemKey = 'equipment_base' | 'equipment_affix' | 'equipment_gemstone' | 'equipment_set';

export const EQUIPMENT_SUBSYSTEM_KEYS: EquipmentSubsystemKey[] = [
  'equipment_base',
  'equipment_affix',
  'equipment_gemstone',
  'equipment_set',
];

export const EQUIPMENT_SUBSYSTEM_NAME_MAP: Record<EquipmentSubsystemKey, string> = {
  equipment_base: '装备基础属性',
  equipment_affix: '装备附加属性',
  equipment_gemstone: '宝石属性',
  equipment_set: '装备套装',
};

export const EQUIPMENT_SUBSYSTEM_ROW_KEYS: Record<EquipmentSubsystemKey, string[]> = {
  equipment_base: ['equipmentBaseUpgrade'],
  equipment_affix: ['equipmentAffix'],
  equipment_gemstone: ['equipmentGemstone'],
  equipment_set: ['equipmentSet'],
};

export function moduleStorageKey(moduleKey: string) {
  return EQUIPMENT_SUBSYSTEM_KEYS.includes(moduleKey as EquipmentSubsystemKey) ? 'equipment' : moduleKey;
}

export interface ExtractionScope {
  configuredMaxLevel?: number;
  configurationSource?: string;
  blockedOrPendingModuleKeys?: string[];
  partialModuleKeys?: string[];
  levelRule?: string;
}

export type StageSelectionMap = Record<string, string>;
export type AttributePriority = string[];
export type EquipmentAffixSelections = Record<string, Record<string, string[]>>;
export type ModuleAttributeChoiceSelections = Record<string, Record<string, Record<string, string[]>>>;
export type ModuleItemChoiceSelections = Record<string, Record<string, Record<string, string>>>;

export interface CustomSelectionMap {
  equipmentAffixes?: EquipmentAffixSelections;
  attributeChoices?: ModuleAttributeChoiceSelections;
  itemChoices?: ModuleItemChoiceSelections;
}

export interface ResolvedModuleSelection {
  module: ExtremeModule;
  points: StagePoint[];
  maxPoint: StagePoint | null;
  selectedPoint: StagePoint | null;
  remembered: boolean;
  customized: boolean;
}

export const STAGE_SELECTION_STORAGE_KEY = 'roleExtremeStats.stageSelections.v1';
export const CUSTOM_SELECTION_STORAGE_KEY = 'roleExtremeStats.customSelections.v1';
export const HERO_SELECTION_STORAGE_KEY = 'roleExtremeStats.heroSelection.v1';
export const ATTRIBUTE_PRIORITY_STORAGE_KEY = 'roleExtremeStats.attributePriority.v1';

export const ATTR_LABELS: Record<string, string> = {
  hp: '生命',
  mp: '魔法',
  atk: '攻击',
  def: '防御',
  hitVal: '命中',
  dodge: '闪避',
  crit: '暴击',
  tenacity: '韧性',
  lucky: '幸运',
  guardian: '守护',
  break: '穿透',
  protect: '减伤',
  healHp: '回血',
  healMp: '回魔',
  lightResist: '光抗',
  darkResist: '暗抗',
  waterResist: '水抗',
  fireResist: '火抗',
  woodResist: '木抗',
  windResist: '风抗',
  soilResist: '土抗',
  rayResist: '雷抗',
};

export const PASSIVE_RESIST_ATTR_FIELDS = new Set([
  'lightResist',
  'darkResist',
  'waterResist',
  'fireResist',
  'woodResist',
  'windResist',
  'soilResist',
  'rayResist',
]);

export const MODULE_ORDER = [
  'role_base',
  'heart',
  'equipment',
  'equipment_base',
  'equipment_affix',
  'equipment_gemstone',
  'equipment_set',
  'title',
  'fashion',
  'magic',
  'wing',
  'feather',
  'xianpo',
  'matrix',
  'starcore',
  'meridians',
  'neidan',
  'smelt',
  'breathing',
];

export const MODULE_NAME_MAP: Record<string, string> = {
  role_base: '基础属性',
  heart: '修心属性',
  equipment: '装备基础属性',
  equipment_base: '装备基础属性',
  equipment_affix: '装备附加属性',
  equipment_gemstone: '宝石属性',
  equipment_set: '装备套装',
  title: '称号属性',
  fashion: '时装属性',
  magic: '法宝属性',
  wing: '翅膀属性',
  feather: '羽毛属性',
  xianpo: '炼体属性',
  matrix: '阵法属性',
  starcore: '星核属性',
  meridians: '外丹属性',
  neidan: '内丹属性',
  smelt: '熔炼属性',
  breathing: '奇穴属性',
};
export const MODULE_TONE: Record<string, string> = {
  role_base: 'border-sky-300/50 bg-sky-500/[0.04] text-sky-700 dark:text-sky-300',
  heart: 'border-emerald-300/50 bg-emerald-500/[0.04] text-emerald-700 dark:text-emerald-300',
  equipment: 'border-stone-300/50 bg-stone-500/[0.04] text-stone-700 dark:text-stone-300',
  equipment_base: 'border-stone-300/50 bg-stone-500/[0.04] text-stone-700 dark:text-stone-300',
  equipment_affix: 'border-stone-300/50 bg-stone-500/[0.04] text-stone-700 dark:text-stone-300',
  equipment_gemstone: 'border-stone-300/50 bg-stone-500/[0.04] text-stone-700 dark:text-stone-300',
  equipment_set: 'border-stone-300/50 bg-stone-500/[0.04] text-stone-700 dark:text-stone-300',
  title: 'border-amber-300/50 bg-amber-500/[0.05] text-amber-700 dark:text-amber-300',
  fashion: 'border-rose-300/50 bg-rose-500/[0.04] text-rose-700 dark:text-rose-300',
  magic: 'border-violet-300/50 bg-violet-500/[0.04] text-violet-700 dark:text-violet-300',
  wing: 'border-cyan-300/50 bg-cyan-500/[0.04] text-cyan-700 dark:text-cyan-300',
  feather: 'border-pink-300/50 bg-pink-500/[0.04] text-pink-700 dark:text-pink-300',
  xianpo: 'border-lime-300/50 bg-lime-500/[0.04] text-lime-700 dark:text-lime-300',
  matrix: 'border-teal-300/50 bg-teal-500/[0.04] text-teal-700 dark:text-teal-300',
  starcore: 'border-indigo-300/50 bg-indigo-500/[0.04] text-indigo-700 dark:text-indigo-300',
  meridians: 'border-orange-300/50 bg-orange-500/[0.04] text-orange-700 dark:text-orange-300',
  neidan: 'border-lime-300/50 bg-lime-500/[0.04] text-lime-700 dark:text-lime-300',
  smelt: 'border-zinc-300/50 bg-zinc-500/[0.04] text-zinc-700 dark:text-zinc-300',
  breathing: 'border-blue-300/50 bg-blue-500/[0.04] text-blue-700 dark:text-blue-300',
};

export interface DetailRow {
  label: string;
  detail: string;
}

export function formatNumber(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return Math.round(value).toLocaleString('zh-CN');
}

export function formatDecimal(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

export function attrEntries(attrs: Record<string, number> = {}) {
  return Object.entries(attrs)
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value) && value !== 0)
    .sort((left, right) => {
      const leftKnown = Object.prototype.hasOwnProperty.call(ATTR_LABELS, left[0]) ? 0 : 1;
      const rightKnown = Object.prototype.hasOwnProperty.call(ATTR_LABELS, right[0]) ? 0 : 1;
      return leftKnown - rightKnown || left[0].localeCompare(right[0]);
    });
}

export function formatAttrsInline(attrs: Record<string, number> | undefined, limit = 6) {
  const entries = attrEntries(attrs || {}).slice(0, limit);
  if (entries.length === 0) return '无可展示属性';
  const text = entries.map(([field, value]) => `${ATTR_LABELS[field] || field} ${formatNumber(value)}`).join(' / ');
  const total = attrEntries(attrs || {}).length;
  return total > entries.length ? `${text} / 另 ${total - entries.length} 项` : text;
}

export function mergeAttrs(target: Record<string, number>, attrs: Record<string, number> | undefined) {
  for (const [field, value] of Object.entries(attrs || {})) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) continue;
    target[field] = (target[field] || 0) + value;
  }
}

function equipmentContributionAttrsFromItems(selectedEquips: any[], attrKeys: string[]) {
  const attrs: Record<string, number> = {};
  for (const equip of selectedEquips || []) {
    for (const key of attrKeys) {
      mergeAttrs(attrs, equip?.[key]);
    }
  }
  return attrs;
}

function equipmentContributionAttrsFromSuits(selectedSuits: any[]) {
  const attrs: Record<string, number> = {};
  for (const suit of selectedSuits || []) {
    mergeAttrs(attrs, suit?.attrs);
  }
  return attrs;
}

export function buildEquipmentSystemContributionRows(selectedEquips: any[], selectedSuits: any[], activeWeights: Record<string, number>) {
  const rows = [
    {
      key: 'equipmentBaseUpgrade',
      label: '装备基础属性',
      attrs: equipmentContributionAttrsFromItems(selectedEquips, ['baseAttrs', 'upgradeAttrs']),
    },
    {
      key: 'equipmentAffix',
      label: '装备附加属性',
      attrs: equipmentContributionAttrsFromItems(selectedEquips, ['affixAttrs']),
    },
    {
      key: 'equipmentGemstone',
      label: '宝石属性',
      attrs: equipmentContributionAttrsFromItems(selectedEquips, ['stoneAttrs']),
    },
    {
      key: 'equipmentSet',
      label: '装备套装',
      attrs: equipmentContributionAttrsFromSuits(selectedSuits),
    },
  ];
  return rows.map((row) => ({
    ...row,
    fightPower: calcFightPower(row.attrs, activeWeights),
  }));
}

export function calcFightPower(attrs: Record<string, number>, activeWeights: Record<string, number>) {
  let total = 0;
  for (const [field, value] of Object.entries(attrs || {})) {
    const weight = activeWeights[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || typeof weight !== 'number' || !Number.isFinite(weight)) continue;
    total += value * weight;
  }
  return Math.floor(total);
}

export function roundAttrs(attrs: Record<string, number> | undefined) {
  const rounded: Record<string, number> = {};
  for (const [field, value] of Object.entries(attrs || {})) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    rounded[field] = Math.round(value);
  }
  return rounded;
}

export function scaledAttrs(attrs: Record<string, number> | undefined, count: number) {
  const result: Record<string, number> = {};
  if (!Number.isFinite(count) || count <= 0) return result;
  for (const [field, value] of Object.entries(attrs || {})) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) continue;
    result[field] = value * count;
  }
  return result;
}

export function applyFashionBallRatio(attrs: Record<string, number> | undefined, ratios: Record<string, number> | undefined) {
  const result: Record<string, number> = {};
  for (const [field, value] of Object.entries(attrs || {})) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const ratio = ratios?.[field];
    result[field] = value * (1 + (typeof ratio === 'number' && Number.isFinite(ratio) ? ratio : 0));
  }
  return result;
}

export function defaultSelectedFields(selectedRows: any[] | undefined) {
  return Array.isArray(selectedRows)
    ? selectedRows.map((item: any) => item?.field).filter((field: any): field is string => typeof field === 'string' && field.length > 0)
    : [];
}

export function normalizeAttributeChoiceFields(options: any[] | undefined, slotCount: number, defaultFields: string[], fields?: string[]) {
  const optionList = Array.isArray(options) ? options : [];
  const optionFields = new Set(optionList.map((item: any) => item?.field).filter((field: any): field is string => typeof field === 'string' && field.length > 0));
  const selected: string[] = [];
  const addField = (field: unknown) => {
    if (typeof field !== 'string' || !optionFields.has(field) || selected.includes(field) || selected.length >= slotCount) return;
    selected.push(field);
  };
  (fields || []).forEach(addField);
  defaultFields.forEach(addField);
  optionList.forEach((item: any) => addField(item?.field));
  return selected.slice(0, slotCount);
}

export function selectedOptionRows(options: any[] | undefined, fields: string[]) {
  const byField = new Map<string, any>(
    (Array.isArray(options) ? options : [])
      .filter((item: any) => typeof item?.field === 'string')
      .map((item: any) => [item.field, item])
  );
  return fields
    .map(field => byField.get(field))
    .filter(Boolean)
    .map((item: any) => ({
      field: item.field,
      value: item.value,
      fightPower: item.fightPower,
      ratio: item.ratio,
      pillId: item.pillId,
      pillType: item.pillType,
      group: item.group,
      quality: item.quality,
      baseAttrVal: item.baseAttrVal,
      qualityValue: item.qualityValue,
    }));
}

export function defaultAffixFields(equip: any) {
  return defaultSelectedFields(equip?.selectedAffixes);
}

export function defaultNegativeAffixFields(equip: any) {
  return defaultSelectedFields(equip?.selectedNegativeAffixes);
}

export function affixSlotCount(equip: any) {
  return typeof equip?.affixSlotCount === 'number' && Number.isFinite(equip.affixSlotCount)
    ? equip.affixSlotCount
    : defaultAffixFields(equip).length;
}

export function negativeAffixSlotCount(equip: any) {
  return typeof equip?.negativeAffixSlotCount === 'number' && Number.isFinite(equip.negativeAffixSlotCount)
    ? equip.negativeAffixSlotCount
    : defaultNegativeAffixFields(equip).length;
}

export function equipmentNegativeAffixChoiceKey(equipId: number | string) {
  return `${equipId}:negative`;
}

export function normalizeEquipmentAffixFields(equip: any, fields?: string[]) {
  return normalizeAttributeChoiceFields(equip?.affixOptions, affixSlotCount(equip), defaultAffixFields(equip), fields);
}

export function normalizeEquipmentNegativeAffixFields(equip: any, fields?: string[]) {
  return normalizeAttributeChoiceFields(equip?.negativeAffixOptions, negativeAffixSlotCount(equip), defaultNegativeAffixFields(equip), fields);
}

export function sameFieldList(left: string[], right: string[]) {
  return left.length === right.length && left.every((field, index) => field === right[index]);
}

export function selectedAffixRows(equip: any, fields: string[]) {
  return selectedOptionRows(equip?.affixOptions, fields);
}

export function selectedNegativeAffixRows(equip: any, fields: string[]) {
  return selectedOptionRows(equip?.negativeAffixOptions, fields);
}

export function getStoredEquipmentAffixFields(customSelections: CustomSelectionMap, stageKey: string, equipId: number | string) {
  return customSelections.attributeChoices?.equipment?.[stageKey]?.[String(equipId)]
    || customSelections.equipmentAffixes?.[stageKey]?.[String(equipId)];
}

export function getStoredAttributeChoiceFields(customSelections: CustomSelectionMap, moduleKey: string, stageKey: string, choiceKey: number | string) {
  const storageKey = moduleStorageKey(moduleKey);
  if (storageKey === 'equipment') return getStoredEquipmentAffixFields(customSelections, stageKey, choiceKey);
  return customSelections.attributeChoices?.[storageKey]?.[stageKey]?.[String(choiceKey)];
}

export function rebuildEquipmentWithAffixSets(equip: any, fields: string[], negativeFields: string[], activeWeights: Record<string, number>) {
  const selectedAffixes = selectedAffixRows(equip, fields);
  const selectedNegativeAffixes = selectedNegativeAffixRows(equip, negativeFields);
  const positiveAffixAttrs: Record<string, number> = {};
  const negativeAffixAttrs: Record<string, number> = {};
  const affixAttrs: Record<string, number> = {};
  for (const affix of selectedAffixes) {
    if (typeof affix.value !== 'number' || !Number.isFinite(affix.value)) continue;
    positiveAffixAttrs[affix.field] = (positiveAffixAttrs[affix.field] || 0) + affix.value;
    affixAttrs[affix.field] = (affixAttrs[affix.field] || 0) + affix.value;
  }
  for (const affix of selectedNegativeAffixes) {
    if (typeof affix.value !== 'number' || !Number.isFinite(affix.value)) continue;
    negativeAffixAttrs[affix.field] = (negativeAffixAttrs[affix.field] || 0) + affix.value;
    affixAttrs[affix.field] = (affixAttrs[affix.field] || 0) + affix.value;
  }
  const attrs: Record<string, number> = {};
  mergeAttrs(attrs, equip.baseAttrs);
  mergeAttrs(attrs, affixAttrs);
  mergeAttrs(attrs, equip.upgradeAttrs);
  mergeAttrs(attrs, equip.stoneAttrs);
  return {
    ...equip,
    positiveAffixAttrs,
    negativeAffixAttrs,
    affixAttrs,
    selectedAffixes,
    selectedNegativeAffixes,
    attrs,
    fightPower: calcFightPower(attrs, activeWeights),
  };
}

export function applyEquipmentAffixSelections(point: StagePoint, customSelections: CustomSelectionMap, activeWeights: Record<string, number>) {
  if (point.moduleKey !== 'equipment' || !Array.isArray(point.params?.selectedEquips)) return point;
  const stageSelections = customSelections.attributeChoices?.equipment?.[point.stageKey] || customSelections.equipmentAffixes?.[point.stageKey];
  if (!stageSelections || Object.keys(stageSelections).length === 0) return point;

  let customAffixSelectionCount = 0;
  const selectedEquips = point.params.selectedEquips.map((equip: any) => {
    const storedFields = stageSelections[String(equip.equipId)];
    const storedNegativeFields = stageSelections[equipmentNegativeAffixChoiceKey(equip.equipId)];
    if (!storedFields && !storedNegativeFields) return equip;
    const fields = normalizeEquipmentAffixFields(equip, storedFields);
    const defaults = normalizeEquipmentAffixFields(equip, defaultAffixFields(equip));
    const negativeFields = normalizeEquipmentNegativeAffixFields(equip, storedNegativeFields);
    const negativeDefaults = normalizeEquipmentNegativeAffixFields(equip, defaultNegativeAffixFields(equip));
    if (sameFieldList(fields, defaults) && sameFieldList(negativeFields, negativeDefaults)) return equip;
    customAffixSelectionCount += 1;
    return rebuildEquipmentWithAffixSets(equip, fields, negativeFields, activeWeights);
  });

  if (customAffixSelectionCount === 0) return point;

  const baseAttrs: Record<string, number> = {};
  for (const equip of selectedEquips) mergeAttrs(baseAttrs, equip.attrs);
  const suitAttrs: Record<string, number> = {};
  for (const suit of point.params?.selectedSuits || []) mergeAttrs(suitAttrs, suit.attrs);
  const attrs: Record<string, number> = {};
  mergeAttrs(attrs, baseAttrs);
  mergeAttrs(attrs, suitAttrs);
  const systemContributionRows = buildEquipmentSystemContributionRows(selectedEquips, point.params?.selectedSuits || [], activeWeights);

  return {
    ...point,
    label: `${point.label}（自选词条）`,
    params: {
      ...point.params,
      selectedEquips,
      baseFightPower: calcFightPower(baseAttrs, activeWeights),
      suitAttrs,
      suitFightPower: calcFightPower(suitAttrs, activeWeights),
      systemContributionRows,
      customAffixEnabled: true,
      customAffixSelectionCount,
    },
    attrs,
    fightPower: calcFightPower(attrs, activeWeights),
  };
}

export function readSelectedHeroId() {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(HERO_SELECTION_STORAGE_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

export function writeSelectedHeroId(heroId: number | null | undefined) {
  if (typeof window === 'undefined') return;
  if (typeof heroId !== 'number' || !Number.isInteger(heroId)) {
    window.localStorage.removeItem(HERO_SELECTION_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(HERO_SELECTION_STORAGE_KEY, String(heroId));
}

export function normalizeAttributePriority(fields: unknown): AttributePriority {
  if (!Array.isArray(fields)) return [];
  const knownFields = new Set(Object.keys(ATTR_LABELS));
  const selected: string[] = [];
  for (const field of fields) {
    if (
      typeof field !== 'string' ||
      !knownFields.has(field) ||
      PASSIVE_RESIST_ATTR_FIELDS.has(field) ||
      selected.includes(field)
    ) continue;
    selected.push(field);
  }
  return selected;
}

export function readAttributePriority(): AttributePriority {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(ATTRIBUTE_PRIORITY_STORAGE_KEY);
  if (!raw) return [];
  try {
    return normalizeAttributePriority(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeAttributePriority(fields: AttributePriority) {
  if (typeof window === 'undefined') return;
  const normalized = normalizeAttributePriority(fields);
  if (normalized.length === 0) {
    window.localStorage.removeItem(ATTRIBUTE_PRIORITY_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(ATTRIBUTE_PRIORITY_STORAGE_KEY, JSON.stringify(normalized));
}
