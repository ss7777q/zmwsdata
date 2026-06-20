import type { StagePoint, ExtremeModule, CustomSelectionMap, ResolvedModuleSelection, DetailRow, AttributePriority, EquipmentSubsystemKey } from './core';
import { ATTR_LABELS, formatNumber, formatDecimal, attrEntries, formatAttrsInline, negativeAffixSlotCount, mergeAttrs, calcFightPower, EQUIPMENT_SUBSYSTEM_ROW_KEYS, EQUIPMENT_SUBSYSTEM_NAME_MAP } from './core';
import { applyResolvedSelections, customFlagEnabled, maxByFightPower } from './selection';
import { maxByAttributePriority } from './priority';

export function primaryPoints(module: ExtremeModule): StagePoint[] {
  if (module.key === 'role_base') {
    return (module.rows || []).flatMap((row: any) => row.levels || row.point || row.maxFightPowerPoint || []) as StagePoint[];
  }
  if (module.key === 'heart') return module.levels || (module.maxFightPowerPoint ? [module.maxFightPowerPoint] : []);
  if (module.key === 'equipment' || module.parentKey === 'equipment') return (module.roles || []).map((row: any) => row.point).filter(Boolean);
  if (module.key === 'title') return module.levels || (module.maxFightPowerPoint ? [module.maxFightPowerPoint] : []);
  if (module.key === 'fashion') return module.fullByBall || (module.maxFightPowerPoint ? [module.maxFightPowerPoint] : []);
  if (module.key === 'magic') return module.fullByLevelAndSoul || module.fullByLevel || (module.maxFightPowerPoint ? [module.maxFightPowerPoint] : []);
  if (module.key === 'wing') return module.allWingsByLevel || (module.maxFightPowerPoint ? [module.maxFightPowerPoint] : []);
  if (module.key === 'feather') return module.points || (module.maxFightPowerPoint ? [module.maxFightPowerPoint] : []);
  if (module.key === 'xianpo') return module.fullByQualityLevel || (module.maxFightPowerPoint ? [module.maxFightPowerPoint] : []);
  if (module.key === 'matrix') return module.fullByRoleLevel || (module.maxFightPowerPoint ? [module.maxFightPowerPoint] : []);
  if (module.key === 'starcore') return module.fullByWorldLevel || (module.maxFightPowerPoint ? [module.maxFightPowerPoint] : []);
  if (module.key === 'meridians') return module.fullByRoleLevel || (module.maxFightPowerPoint ? [module.maxFightPowerPoint] : []);
  if (module.key === 'neidan') return module.rows || (module.maxFightPowerPoint ? [module.maxFightPowerPoint] : []);
  if (module.key === 'smelt') return module.fullBySmeltLevel || module.rows || (module.maxFightPowerPoint ? [module.maxFightPowerPoint] : []);
  if (module.key === 'breathing') return module.fullByQualityLevel || (module.maxFightPowerPoint ? [module.maxFightPowerPoint] : []);
  return module.maxFightPowerPoint ? [module.maxFightPowerPoint] : [];
}

export function pointsForHero(module: ExtremeModule, selectedHeroId?: number | null): StagePoint[] {
  const points = primaryPoints(module);
  if (typeof selectedHeroId !== 'number' || !Number.isInteger(selectedHeroId)) return points;
  const scoped = points.filter(point => point.params?.heroId === selectedHeroId);
  return scoped.length > 0 ? scoped : points;
}

export function resolveModuleSelection(
  module: ExtremeModule,
  selectedStageKey: string | undefined,
  customSelections: CustomSelectionMap,
  activeWeights: Record<string, number>,
  selectedHeroId?: number | null,
  attributePriority: AttributePriority = []
): ResolvedModuleSelection {
  const points = pointsForHero(module, selectedHeroId);
  const maxPoint = maxByFightPower(points);
  const priorityPoint = maxByAttributePriority(points, attributePriority);
  const storedPoint = selectedStageKey
    ? points.find(point => point.stageKey === selectedStageKey) || null
    : null;
  const baseSelectedPoint = storedPoint || priorityPoint || maxPoint || points[0] || null;
  const selectedPoint = applyResolvedSelections(module, baseSelectedPoint, customSelections, activeWeights, attributePriority);
  return {
    module,
    points,
    maxPoint,
    selectedPoint,
    remembered: Boolean(storedPoint),
    customized: customFlagEnabled(selectedPoint),
  };
}

export function stageLabel(module: ExtremeModule, point: StagePoint) {
  if (module.key === 'role_base') return `${point.params?.heroName || '角色'} Lv.${point.params?.roleLevel}`;
  if (module.key === 'heart') return `心法 Lv.${point.params?.heartLevel}`;
  if (module.key === 'equipment' || module.parentKey === 'equipment') return `${point.params?.heroName} 装备`;
  if (module.key === 'title') return `玩家等级 ${point.params?.playerLevel}`;
  if (module.key === 'fashion') return `宝珠 ${point.params?.ballRank}阶${point.params?.ballLevel}级`;
  if (module.key === 'magic') return `法宝 Lv.${point.params?.level} / 器魂 Lv.${point.params?.soulLevel}`;
  if (module.key === 'wing') return `翅膀 Lv.${point.params?.wingLevel}`;
  if (module.key === 'feather') return `${point.params?.selectedFeather?.featherName || '羽毛'} × ${point.params?.holeCount}孔`;
  if (module.key === 'xianpo') return `${point.params?.qualityName || '品质'} Lv.${point.params?.level}`;
  if (module.key === 'matrix') return `角色等级 ${point.params?.roleLevel}`;
  if (module.key === 'starcore') return `世界等级 ${point.params?.worldLevel}`;
  if (module.key === 'meridians') return `角色等级 ${point.params?.roleLevel}`;
  if (module.key === 'neidan') return `丹气 Lv.${point.params?.selectedLevel} · ${point.params?.slotCount}槽不可重复`;
  if (module.key === 'smelt') {
    const smeltName = point.params?.smeltKindLabel ? `${point.params.smeltKindLabel}熔炼` : '熔炼';
    return `${smeltName} Lv.${point.params?.smeltLv}`;
  }
  if (module.key === 'breathing') return `精纯 Lv.${point.params?.level} / 品质 ${point.params?.quality}`;
  return point.label;
}

function equipmentSubsystemOf(module: ExtremeModule): EquipmentSubsystemKey | null {
  return module.parentKey === 'equipment' && module.equipmentSubsystem ? module.equipmentSubsystem : null;
}

function filteredEquipmentContributionRows(point: StagePoint | null, subsystem: EquipmentSubsystemKey | null) {
  const allRows = Array.isArray(point?.params?.systemContributionRows) ? point?.params?.systemContributionRows : [];
  if (!subsystem) return allRows;
  const allowedKeys = new Set(EQUIPMENT_SUBSYSTEM_ROW_KEYS[subsystem]);
  return allRows.filter((row: any) => allowedKeys.has(String(row?.key)));
}

export function pointForDisplayModule(module: ExtremeModule, point: StagePoint | null, activeWeights: Record<string, number>) {
  if (!point) return null;
  const subsystem = equipmentSubsystemOf(module);
  if (!subsystem) return point;
  const contributionRows = filteredEquipmentContributionRows(point, subsystem);
  const attrs: Record<string, number> = {};
  let fightPower = 0;
  for (const row of contributionRows) {
    mergeAttrs(attrs, row?.attrs);
    if (typeof row?.fightPower === 'number' && Number.isFinite(row.fightPower)) fightPower += row.fightPower;
  }
  if (contributionRows.length === 0) {
    fightPower = calcFightPower(attrs, activeWeights);
  }
  return {
    ...point,
    label: `${point.label} · ${EQUIPMENT_SUBSYSTEM_NAME_MAP[subsystem]}`,
    attrs,
    fightPower,
    params: {
      ...point.params,
      systemContributionRows: contributionRows,
    },
  };
}

export function sourceRowsForModule(module: ExtremeModule, point: StagePoint | null): DetailRow[] {
  const maxLevel = module.configuredMaxLevel;
  const titleStats = module.candidateStats || {};
  const attributedTitleCount = typeof titleStats.attributedTitleCount === 'number'
    ? titleStats.attributedTitleCount
    : Array.isArray(module.types)
    ? module.types.reduce((sum: number, type: any) => sum + (type.titleCount || 0), 0)
    : 0;
  const skippedTitleCount = typeof titleStats.skippedNoAttributeCount === 'number'
    ? titleStats.skippedNoAttributeCount
    : module.skippedNoAttribute?.length || 0;
  const equipmentSubsystem = equipmentSubsystemOf(module);
  if (equipmentSubsystem === 'equipment_base') {
    return [
      { label: '阶段范围', detail: `按角色等级 ${maxLevel} 口径，每个角色的 6 个装备部位分别保留当前可穿最高 equipLv 档候选。` },
      { label: '装备选择', detail: `默认枚举 ${formatNumber(point?.params?.evaluatedCombinationCount)} 种 6 部位组合并取最高；本页可按部位切换具体装备，保持原来的联动重算。` },
      { label: '基础与强化', detail: `基础属性来自 equip.attr；强化按 equipUpgrade 与 equipUpgradeValue 计算到 ${maxLevel} 级后叠加。` },
    ];
  }
  if (equipmentSubsystem === 'equipment_affix') {
    return [
      { label: '词条来源', detail: 'equip.affixLevel 关联 equipAffix；正词条默认按 powerAttribute[1] 选择最高收益，带 affixNumMinus 的装备额外带负词条。' },
      { label: '词条选择', detail: '本页保留原来的逐件装备词条自选能力；修改后仍参与总览和其他装备子系统联动重算。' },
      { label: '取值口径', detail: '这里只展示装备附加属性，不混入基础、强化、宝石和套装。' },
    ];
  }
  if (equipmentSubsystem === 'equipment_gemstone') {
    return [
      { label: '宝石来源', detail: '每件装备按孔位读取可镶嵌宝石；同一装备内默认按最高收益逐孔选石，且不重复。' },
      { label: '孔位选择', detail: '本页保留原来的逐孔宝石自选能力，改动后仍与装备本体和套装联动。' },
      { label: '取值口径', detail: '这里只展示宝石属性，不混入装备基础、词条、强化和套装。' },
    ];
  }
  if (equipmentSubsystem === 'equipment_set') {
    return [
      { label: '套装触发', detail: '按当前已选 6 件装备统计 equip.suitAttribute 件数，再触发 equipSuitAttribute 对应阈值属性。' },
      { label: '联动规则', detail: '套装页本身不新增单独配置项，仍然跟随装备本体选择自动重算。' },
      { label: '取值口径', detail: '这里只展示装备套装触发出来的属性，不混入单件装备与宝石。' },
    ];
  }
  if (Array.isArray(module.sourceRules) && module.sourceRules.length > 0) {
    return module.sourceRules;
  }
  switch (module.key) {
    case 'role_base':
      return [
        { label: '阶段范围', detail: `只取 exp.level <= ${maxLevel}；每个角色模板、每个等级都作为独立可选阶段，默认使用全候选中战力最高的角色等级点。` },
        { label: '基础属性', detail: 'monster[heroId] 的主属性乘 exp[level] 同字段成长值，得到等级基础属性。' },
        { label: '抗性属性', detail: 'monster.resist 里的元素抗性按运行时映射为光/暗/水/火/木/风/土/雷抗，直接加入阶段属性。' },
      ];
    case 'heart':
      return [
        { label: '阶段范围', detail: `只取 heart.limit <= ${maxLevel}；默认当前阶段为六条心法同等级汇总，也可在本页逐条心法线自选等级并参与总览重算。` },
        { label: '属性来源', detail: 'heart[level] 行内的 hp/mp/atk/def/healHp/healMp 直接作为对应心法属性值。' },
        { label: '角色等级要求', detail: `当前阶段要求角色等级 ${point?.params?.roleLevelRequired ?? '-'}，心法等级 ${point?.params?.heartLevel ?? '-'}。` },
      ];
    case 'equipment':
      return [
        { label: '阶段范围', detail: `按角色等级 ${maxLevel} 口径，每个角色的 6 个装备部位分别保留当前可穿最高 equipLv 档候选。` },
        { label: '装备构成', detail: `默认枚举 ${formatNumber(point?.params?.evaluatedCombinationCount)} 种 6 部位组合并取最高；本页也可按部位自选具体装备，套装属性会随选择重算。` },
        { label: '随机词条', detail: 'equip.affixLevel 关联 equipAffix；正词条默认按 powerAttribute[1] 选择战力最高的 affixNum 条，带 affixNumMinus 的装备会单独展示负词条选择；本页逐件装备自选后会记忆并参与总览重算。' },
        { label: '强化/宝石', detail: `强化按 equipUpgrade 与 equipUpgradeValue 计算到 ${maxLevel} 级；宝石按装备孔位逐孔选择，同一装备内不重复，也可按孔自选同等级宝石类型并参与总览重算。` },
        { label: '套装属性', detail: '每个组合按 equip.suitAttribute 统计件数，再触发 equipSuitAttribute 对应阈值属性，套装收益参与最终择优。' },
      ];
    case 'title':
      return [
        { label: '阶段范围', detail: `只取玩家等级 <= ${maxLevel}；当前阶段按玩家等级 ${point?.params?.playerLevel ?? '-'} 取称号属性档。` },
        { label: '候选池', detail: `title 表共 ${formatNumber(attributedTitleCount + skippedTitleCount)} 条；其中 ${formatNumber(attributedTitleCount)} 条有 titleAttribute 属性，${formatNumber(skippedTitleCount)} 条无属性或缺属性表不计战力。` },
        { label: '普通称号', detail: `普通有属性称号按 title.group 合并为 ${formatNumber(titleStats.normalTitleGroupCount)} 个称号系列；默认每系列取最高战力一档，也可在本页逐系列自选。` },
        { label: '特殊进阶称号', detail: `VIP、仙位、斗宠称号按进阶类单独处理，共 ${formatNumber(titleStats.specialProgressTypeCount)} 类、${formatNumber(titleStats.specialTitleRowCount)} 档；默认每类取最高档，也可在本页按类自选。` },
        { label: '属性档位', detail: '每个称号使用 title.buteId 找 titleAttribute，并取第一条 level >= 玩家等级的属性档。' },
      ];
    case 'fashion':
      return [
        { label: '阶段范围', detail: `宝珠按 role_fashion_ball 可达阶规则裁剪到 ${maxLevel} 级；当前阶段为 ${point?.params?.ballRank ?? '-'}阶${point?.params?.ballLevel ?? '-'}级。` },
        { label: '时装部位', detail: '每个 equipFashion.part 只选择一件穿戴时装；默认按当前宝珠倍率后的战力最高项入选，也可在本页按部位自选并参与总览重算。' },
        { label: '宝珠倍率', detail: 'equipFashionBall 从 id=0 累加到当前 ballId 的 attributeValue，再对时装属性乘 (1 + 累计倍率)，合入前按运行时 round。' },
      ];
    case 'magic':
      return [
        { label: '阶段范围', detail: `按 magicWeapon.showLimit 中角色等级 <= ${maxLevel} 过滤；同 groupId 取当前可达最高 phases 法宝。` },
        { label: '法宝本体', detail: '默认每个 groupId 取最高 phases 法宝；若同组存在多个可达法宝，本页可按 group 自选法宝本体并参与总览重算。' },
        { label: '基础属性', detail: '每件法宝按 floor(0.5 + base + growth * blessingMultiplier * add * level) 计算 hp/mp/atk/def/healHp/healMp。' },
        { label: '祝福加成', detail: '祝福 1/3/4/5 分别把攻击/魔法/生命/防御成长放大 50%；回血和回魔没有祝福放大。' },
        { label: '器魂槽位', detail: '开放器魂的法宝可镶太阳、太阴、混元三类灵玉各 1 个；默认每槽取不超过 slouLevelLimit 的最高战力灵玉，也可在本页按槽自选。' },
        { label: '器魂等级', detail: `当前阶段器魂 Lv.${point?.params?.soulLevel ?? '-'}；灵玉自身属性会乘器魂等级后计入战力。` },
        { label: '关闭器魂', detail: `${formatNumber(module.closedSoulGroups?.length || 0)} 个可达法宝组配置 closeSoul=1，运行时不开放器魂页，这些法宝只计基础属性。` },
      ];
    case 'wing':
      return [
        { label: '阶段范围', detail: `只取 wingAttribute.upLimit 角色等级 <= ${maxLevel}；默认当前阶段为全部翅膀 Lv.${point?.params?.wingLevel ?? '-'}，也可在本页逐只翅膀自选等级并参与总览重算。` },
        { label: '翅膀属性', detail: 'wing.buteId + wingLevel 定位 wingAttribute 行，再把 attribute/attributeValue 加入阶段属性。' },
        { label: '全翅膀汇总', detail: '全满阶段同时汇总 wing 表内所有有效翅膀，同等级缺任意一只翅膀属性行就不生成该阶段。' },
      ];
    case 'feather':
      return [
        { label: '孔位数量', detail: `consts.featherNumber 当前识别 ${formatNumber(point?.params?.holeCount)} 个羽毛孔位。` },
        { label: '可达羽毛', detail: `从 feather.id=502001 沿 nextId 和 nextLimit 追到 ${maxLevel} 级可达最高档；当前为 ${point?.params?.selectedFeather?.featherName ?? '-'}。` },
        { label: '洗练属性', detail: `feather.attributeValue[1] 指向 featherAttribute.id=${point?.params?.selectedFeather?.attributeValueId ?? '-'}，默认按战力最高选择 ${formatNumber(point?.params?.selectedFeather?.attributeAmount)} 条属性，也可在本页自选洗练属性并参与总览重算。` },
        { label: '全孔汇总', detail: '每个孔位镶同一满配羽毛，单羽毛属性按孔位数量重复计入。' },
      ];
    case 'xianpo':
      return [
        { label: '阶段范围', detail: `只取 xianpo.roleLevel <= ${maxLevel}；默认当前阶段为各 type 同品质同等级，也可在本页逐个 type 自选品质和等级并参与总览重算。` },
        { label: '槽位解锁', detail: `consts.trainingLayer 按心法满配战力解锁层数；当前心法战力 ${formatNumber(point?.params?.heartFightPowerForUnlock)}，已开 ${formatNumber(point?.params?.unlockedLayerCount)} 层。` },
        { label: '每层槽位', detail: `每层包含 ${formatNumber(point?.params?.slotPerLayer)} 个仙魄部位；当前总槽位 ${formatNumber(point?.params?.totalSlotCount)} 个。` },
        { label: '仙魄属性', detail: 'xianpoId + level 定位 xianpo 行，每层每个 type 镶 1 个，同 type 按已解锁层数重复计入。' },
      ];
    case 'matrix':
      return [
        { label: '阶段范围', detail: `只取 matrix.limitLv <= ${maxLevel}；当前阶段角色等级 ${point?.params?.roleLevel ?? '-'}，已解锁阵法 ${formatNumber(point?.params?.matrixCount)} 个。` },
        { label: '阵眼核心', detail: '每个 matrix.matrixCore 孔位默认选择最高品质、最高战力核心；本页可按孔位自选核心，并按所选核心重算属性。' },
        { label: '核心套装', detail: '装满阵眼核心后，按最低核心品质匹配 matrixCoreSuit，并加入 matrixSuit 对应属性。' },
        { label: '觉魂说明', detail: 'matrixSoul 觉魂提供 powerAttribute[1] 权重为 0 的百分比属性，且刚/柔分支不能由战力唯一确定；当前战力曲线不伪造觉魂分配。' },
      ];
    case 'starcore':
      return [
        { label: '阶段范围', detail: `只取 expWorld.levelWorld <= ${maxLevel}；当前阶段为世界等级 ${point?.params?.worldLevel ?? '-'}。` },
        { label: '主星属性', detail: '每颗星核默认取最高品质，按 round(expWorld[field] * starCore[quality].ratio) 生成主星属性；本页可逐星改品质。' },
        { label: '伴星属性', detail: '每颗星核默认取满伴星等级，按 round(expWorld[field] * satelliteRatio * min(satelliteLv / maxSatelliteLv, 1)) 生成伴星属性；本页可逐星改伴星等级。' },
      ];
    case 'meridians':
      return [
        { label: '阶段范围', detail: `只取 meridians.upLevelLv <= ${maxLevel}；当前阶段角色等级 ${point?.params?.roleLevel ?? '-'}，基础经脉 ${formatNumber(point?.params?.typeCount)} 条。` },
        { label: '基础经脉', detail: '每条经脉按可达阶数累计 meridiansAttribute.attributeValue；当前阶只计当前 level，已满阶按 openLv/upRankLv 计满。' },
        { label: '丹魂上限', detail: `MeridiansManager.celMaxPower 界面估算为 ${formatNumber(point?.params?.runtimeMaxFightPower)}；实际战力按 UserInfoManager.calMeridiansFightPower 的同属性比例汇总与取整口径计算。已解锁丹魂槽 ${formatNumber(point?.params?.unlockedSpecialSlotCount)} 个。` },
        { label: '丹魂属性', detail: '丹魂属性由丹魂 group 固定决定，三属性丹魂按 50%/30%/20% 分配；运行时先汇总同属性比例，再对外丹基础值向上取整。' },
      ];
    case 'neidan':
      return [
        { label: '丹气等级', detail: `运行时取 min(未关闭最高丹气等级 ${formatNumber(point?.params?.openMaxLevel)}, ceil(${maxLevel}/10)=${formatNumber(point?.params?.levelByRole)})，当前 Lv.${point?.params?.selectedLevel ?? '-'}。` },
        { label: '丹气槽位', detail: `当前 ${formatNumber(point?.params?.slotCount)} 个丹气槽按不可重复丹气分别计入，不把同一丹气乘槽数。` },
        { label: '丹气选择', detail: `同一丹气等级下候选 ${formatNumber(module.candidateDanqiCount)} 种，本页可逐槽自选，重复选择会按不可重复规则自动保留未重复候选。` },
        { label: '属性取值', detail: '每种丹气都取 danqi.attributeValue 上限作为单槽属性，选中的每个丹气只计入一次。' },
        { label: '丹元说明', detail: point?.params?.danyuanNote || '丹元提供技能效果和阴阳门槛，不在当前属性战力入口直接加点。' },
      ];
    case 'smelt': {
      const qualityVariantText = Array.isArray(module.qualityVariants) && module.qualityVariants.length > 0
        ? module.qualityVariants
          .map((item: any) => `${item.smeltKindLabel}装备品质 ${item.itemQuality} -> 熔炼品质 ${item.mappedQuality}`)
          .join('；')
        : '当前导出缺少品质映射明细。';
      return [
        { label: '阶段范围', detail: `按神化/魔化装备品质映射熔炼品质；当前 Lv.${point?.params?.smeltLv ?? '-'} / ${point?.params?.maxSmeltLv ?? '-'}，角色等级口径 ${maxLevel}。` },
        { label: '品质映射', detail: `运行时把装备品质映射为熔炼品质；${qualityVariantText}。` },
        { label: '熔炼等级', detail: '六个部位使用同一熔炼等级，但每个部位可独立选择神化或魔化装备来源，逐级累计 equipSmelt 与 equipSmeltGrow。' },
        { label: '属性取整', detail: '所有部位属性累计后，正数 floor、负数 ceil，再按 powerAttribute[1] 计算战力。' },
      ];
    }
    case 'breathing':
      return [
        { label: '系统命名', detail: `官方系统名为奇穴，运行时记录名仍为 breathing；当前开放 ${formatNumber(module.unlockedBreathingCount)} 个奇穴、${formatNumber(module.acupointCount)} 个穴位。` },
        { label: '等级属性', detail: '每个穴位按 breathingId + type 读取 breathingAcupoint，累计 level <= 当前精纯等级的 attributeValue。' },
        { label: '品质倍率', detail: '品质来自 breathing.breakItemQuality，最终属性为 base + floor(base * qualityRatio)。' },
        { label: '穴位选择', detail: '阶段选择仍可切换全体默认品质/精纯等级；本页也可逐个穴位自选品质和精纯等级，选择会记忆并参与总览重算。' },
      ];
    default:
      return module.formula ? [{ label: '模块公式', detail: module.formula }] : [];
  }
}

export function selectedRowsForPoint(module: ExtremeModule, point: StagePoint | null): DetailRow[] {
  if (!point) return [];
  const equipmentSubsystem = equipmentSubsystemOf(module);
  if (module.key === 'role_base') {
    return [
      {
        label: point.params?.heroName || '角色模板',
        detail: `role.id=${point.params?.heroId}；monster.id=${point.params?.monsterId}；exp.level=${point.params?.roleLevel}`,
      },
      ...(point.params?.attributeDetails || []).map((item: any) => ({
        label: ATTR_LABELS[item.field] || item.field,
        detail: item.type === 'resist'
          ? `抗性 id=${item.resistId}；最终值 ${formatNumber(item.finalValue)}；单项战力 ${formatNumber(item.fightPower)}`
          : `monster 模板值 ${formatNumber(item.templateValue)} × exp 成长 ${formatDecimal(item.growthValue)} = ${formatNumber(item.finalValue)}；单项战力 ${formatNumber(item.fightPower)}`,
      })),
    ];
  }
  if (module.key === 'heart') {
    return (point.params?.selectedLines || []).map((item: any) => ({
      label: `${ATTR_LABELS[item.field] || item.field} 心法`,
      detail: `heart.id=${item.tableId}；心法 Lv.${item.heartLevel}；角色等级要求 ${item.roleLevelRequired}；属性值 ${formatNumber(item.value)}；单线战力 ${formatNumber(item.fightPower)}`,
    }));
  }
  if (module.key === 'equipment' || module.parentKey === 'equipment') {
    if (equipmentSubsystem === 'equipment_set') {
      return (point.params?.selectedSuits || []).map((suit: any) => ({
        label: `套装 ${suit.suitId}`,
        detail: `命中 ${formatNumber(suit.count)} 件，触发 ${formatNumber(suit.threshold)} 件档；单套装战力 ${formatNumber(suit.fightPower)}；${formatAttrsInline(suit.attrs)}`,
      }));
    }
    const rows = (point.params?.selectedEquips || []).map((item: any) => ({
      label: `${item.partLabel || item.part} · ${item.equipName}`,
      detail: [
        `equip.id=${item.equipId}`,
        `equipLv=${item.equipLv}`,
        equipmentSubsystem !== 'equipment_affix' ? `孔位 ${formatNumber(item.holeCount)}` : null,
        equipmentSubsystem === 'equipment_gemstone'
          ? `宝石 ${Array.isArray(item.stoneSlots) ? item.stoneSlots.map((slot: any) => `${slot.slotIndex}:${slot.stoneName}`).join('/') : item.stoneName} Lv.${item.stoneLevel}：${formatAttrsInline(item.stoneAttrs, 3)}`
          : null,
        equipmentSubsystem == null ? `单件战力 ${formatNumber(item.fightPower)}` : null,
        equipmentSubsystem === 'equipment_base' || equipmentSubsystem == null ? `基础 ${formatAttrsInline(item.baseAttrs, 4)}` : null,
        equipmentSubsystem === 'equipment_affix' || equipmentSubsystem == null ? `正词条 ${formatAttrsInline(item.positiveAffixAttrs || item.affixAttrs, 4)}` : null,
        equipmentSubsystem === 'equipment_affix' && negativeAffixSlotCount(item) > 0 ? `负词条 ${formatAttrsInline(item.negativeAffixAttrs, 4)}` : null,
        equipmentSubsystem === 'equipment_base' || equipmentSubsystem == null ? `强化 ${formatAttrsInline(item.upgradeAttrs, 4)}` : null,
      ].filter(Boolean).join('；'),
    }));
    if (equipmentSubsystem) return rows.filter((row: DetailRow) => row.detail.length > 0);
    for (const suit of point.params?.selectedSuits || []) {
      rows.push({
        label: `套装 ${suit.suitId}`,
        detail: `命中 ${formatNumber(suit.count)} 件，触发 ${formatNumber(suit.threshold)} 件档；${formatAttrsInline(suit.attrs)}`,
      });
    }
    return rows;
  }
  if (module.key === 'title') {
    return (point.params?.selectedTitles || []).map((item: any) => ({
      label: `${item.selectionLabel || `类型 ${item.titleType}`} · ${item.titleName}`,
      detail: `候选 ${formatNumber(item.candidateCount)} 档，当前只计此 1 档；title.id=${item.titleId}；title.level=${item.titleLevel ?? '-'}；title.type=${item.titleType}；titleAttribute.id=${item.titleAttributeId}；属性档 ${item.titleAttributeLevel}；单项战力 ${formatNumber(item.fightPower)}；${formatAttrsInline(item.attrs)}`,
    }));
  }
  if (module.key === 'fashion') {
    return (point.params?.selectedFashions || []).map((item: any) => ({
      label: `${item.part} · ${item.fashionName}`,
      detail: `equipFashion.id=${item.fashionId}；单项战力 ${formatNumber(item.fightPower)}；${formatAttrsInline(item.attrs)}`,
    }));
  }
  if (module.key === 'magic') {
    return (point.params?.selectedWeapons || []).map((item: any) => ({
      label: `组 ${item.groupId} · ${item.magicWeaponName}`,
      detail: [
        `magicWeapon.id=${item.magicWeaponId}`,
        `法宝等级 ${item.level}`,
        `成长 ${item.growth}`,
        `基础战力 ${formatNumber(item.baseFightPower)}`,
        item.closeSoul
          ? '器魂关闭'
          : `器魂 Lv.${item.soulLevel}；灵玉阶数上限 ${item.soulLevelLimit}；器魂战力 ${formatNumber(item.soulFightPower)}`,
        `单项战力 ${formatNumber(item.fightPower)}`,
        ...(item.selectedSouls || []).map((soul: any) => `${soul.slotLabel}:${soul.soulName} Lv.${soul.level}(${formatAttrsInline(soul.attrs)})`),
      ].join('；'),
    }));
  }
  if (module.key === 'wing') {
    return (point.params?.selectedWings || []).map((item: any) => ({
      label: item.wingName,
      detail: [
        `wing.id=${item.wingId}`,
        `wingAttribute.id=${item.wingAttributeId}`,
        `wingLevel=${item.wingLevel}`,
        `品质 ${item.quality}`,
        `角色等级要求 ${item.roleLevelRequired}`,
        `单翅膀战力 ${formatNumber(item.fightPower)}`,
        formatAttrsInline(item.attrs),
      ].join('；'),
    }));
  }
  if (module.key === 'feather') {
    const item = point.params?.selectedFeather;
    if (!item) return [];
    return [
      {
        label: `${item.featherName} × ${formatNumber(item.holeCount)}孔`,
        detail: `feather.id=${item.featherId}；featherAttribute.id=${item.attributeValueId}；单羽毛战力 ${formatNumber(item.perFeatherFightPower)}；总战力 ${formatNumber(item.fightPower)}；${formatAttrsInline(item.totalAttrs)}`,
      },
      ...(item.selectedAttrs || []).map((attr: any) => ({
        label: ATTR_LABELS[attr.field] || attr.field,
        detail: `单孔 ${formatNumber(attr.value)}；单孔战力 ${formatNumber(attr.fightPower)}；${formatNumber(item.holeCount)}孔合计 ${formatNumber(attr.value * item.holeCount)}`,
      })),
    ];
  }
  if (module.key === 'xianpo') {
    const selected = point.params?.selectedXianpos || [];
    const header = {
      label: `${point.params?.qualityName}品质`,
      detail: `等级 ${point.params?.level}；已开 ${formatNumber(point.params?.unlockedLayerCount)} 层；每层 ${formatNumber(point.params?.slotPerLayer)} 槽；总槽位 ${formatNumber(point.params?.totalSlotCount)}；角色等级要求 ${point.params?.roleLevelRequired}`,
    };
    return [
      header,
      ...selected.map((item: any) => ({
        label: `${item.typeName || `类型 ${item.type}`} · ${item.xianpoName}`,
        detail: `xianpoId=${item.xianpoId}；Lv.${item.level}；每层 1 个，共 ${formatNumber(item.slotCount)} 个槽；单槽战力 ${formatNumber(item.perSlotFightPower)}；合计战力 ${formatNumber(item.fightPower)}；${formatAttrsInline(item.totalAttrs)}`,
      })),
    ];
  }
  if (module.key === 'matrix') {
    return (point.params?.selectedMatrices || []).flatMap((item: any) => [
      {
        label: `${item.matrixName}`,
        detail: `matrix.id=${item.matrixId}；解锁等级 ${item.roleLevelRequired}；阵眼核心 ${item.coreCount} 个；核心套装 ${item.coreSuitId} / 品质 ${item.coreSuitQuality ?? '-'}；单阵法战力 ${formatNumber(item.fightPower)}；${formatAttrsInline(item.attrs)}`,
      },
      ...(item.selectedCores || []).map((core: any) => ({
        label: `${item.matrixName} · ${core.name}`,
        detail: `matrixCore.id=${core.id}；group=${core.group}；品质 ${core.quality}；等级上限 ${core.levelLimit}；核心战力 ${formatNumber(core.fightPower)}；${formatAttrsInline(core.attrs)}`,
      })),
    ]);
  }
  if (module.key === 'starcore') {
    return [
      { label: '全星核', detail: `星核数量 ${point.params?.starCount}；世界等级 ${point.params?.worldLevel}；每颗星取最高品质主星和满级伴星。` },
      ...(point.params?.selectedStars || []).map((item: any) => ({
        label: item.starCoreName,
        detail: [
          `starCore.id=${item.starCoreId}`,
          `主星品质 ${item.quality}`,
          `主星倍率 ${formatDecimal(item.qualityRatio)}`,
          `伴星 Lv.${item.satelliteLevel}`,
          `伴星倍率 ${formatDecimal(item.satelliteRatio)}`,
          `主星战力 ${formatNumber(item.mainFightPower)}`,
          `伴星战力 ${formatNumber(item.satelliteFightPower)}`,
          `合计 ${formatNumber(item.fightPower)}`,
          `主星 ${formatAttrsInline(item.mainAttrs, 4)}`,
          `伴星 ${formatAttrsInline(item.satelliteAttrs, 4)}`,
        ].join('；'),
      })),
    ];
  }
  if (module.key === 'meridians') {
    const rows = (point.params?.lines || []).map((line: any) => ({
      label: `经脉 ${line.type} · ${ATTR_LABELS[line.field] || line.field}`,
      detail: `当前 ${line.rank}阶${line.level}级；基础值 ${formatNumber(line.baseAttrVal)}；基础战力 ${formatNumber(line.baseFightPower)}；丹魂比例 ${formatDecimal(line.pillRatio)}；丹魂加成 ${formatNumber(line.pillAddAttrVal)}；总值 ${formatNumber(line.totalAttrVal)}；总战力 ${formatNumber(line.totalFightPower)}`,
    }));
    rows.push({
      label: '丹魂槽位汇总',
      detail: `已解锁丹魂槽 ${formatNumber(point.params?.unlockedSpecialSlotCount)} 个；已选金色满 roll 丹魂 ${formatNumber(point.params?.selectedPillCount)} 个；丹魂战力 ${formatNumber(point.params?.pillFightPower)}；本阶段总战力 ${formatNumber(point.fightPower)}`,
    });
    rows.push(...(point.params?.selectedPills || []).map((pill: any) => ({
      label: `槽 ${pill.slotId} · 丹魂 type ${pill.pillType}`,
      detail: [
        `meridiansSpecialPill.id=${pill.pillId}`,
        `group=${pill.group}`,
        `quality=${pill.quality}`,
        `固定属性 ${(pill.fixedAttrs || []).map((attr: any) => `${ATTR_LABELS[attr.field] || attr.field} ${formatDecimal(attr.ratio)}（${formatNumber(attr.energyPercent)}%）`).join('，')}`,
      ].join('；'),
    })));
    return rows;
  }
  if (module.key === 'neidan') {
    const selectedDanqis = point.params?.selectedDanqis || [];
    return selectedDanqis.length ? [
      ...selectedDanqis.map((item: any) => ({
        label: `槽 ${item.slotIndex} · ${item.danqiName}`,
        detail: `danqi.id=${item.danqiId}；单槽战力 ${formatNumber(item.perSlotFightPower ?? item.fightPower)}；${formatAttrsInline(item.perSlotAttrs || item.attrs)}`,
      })),
      {
        label: '丹元直接属性',
        detail: point.params?.danyuanNote || '丹元不在当前属性战力入口直接加点。',
      },
    ] : [];
  }
  if (module.key === 'smelt') {
    return (point.params?.selectedSmelts || []).map((item: any) => {
      const smeltName = item.smeltKindLabel ? `${item.smeltKindLabel}熔炼` : '熔炼';
      return {
        label: `${item.partLabel || item.part} · ${smeltName} Lv.${item.smeltLv}`,
        detail: `装备品质 ${Array.isArray(item.itemQualities) ? item.itemQualities.join('/') : item.itemQuality} -> 熔炼品质 ${item.mappedQuality}；阶段 ${item.smeltLv}/${item.maxSmeltLv}；单部位战力 ${formatNumber(item.fightPower)}；${formatAttrsInline(item.attrs)}`,
      };
    });
  }
  if (module.key === 'breathing') {
    return (point.params?.selectedAcupoints || []).map((item: any) => ({
      label: `${item.breathingName} · 穴位 ${item.type} · ${ATTR_LABELS[item.attribute] || item.attribute}`,
      detail: [
        `精纯等级 ${item.level}/${item.maxLevel}`,
        `基础值 ${formatNumber(item.baseValue)}`,
        `品质 ${item.quality}`,
        `倍率 ${formatDecimal(item.qualityRatio)}`,
        `最终 ${formatNumber(item.finalValue)}`,
        `单穴战力 ${formatNumber(item.fightPower)}`,
        `breathingAcupoint ${item.firstRowId}-${item.lastRowId}`,
      ].join('；'),
    }));
  }
  return [];
}

export function candidateRowsForModule(module: ExtremeModule, point: StagePoint | null): DetailRow[] {
  if (!point || module.key !== 'title' || !Array.isArray(module.selectionPools)) return [];
  const selectedByPool = new Map<string, any>(
    (point.params?.selectedTitles || []).map((item: any) => [item.selectionPoolKey, item])
  );
  return module.selectionPools.map((pool: any) => {
    const selected = selectedByPool.get(pool.key);
    const titleNames = (pool.titles || [])
      .map((title: any) => `${title.name}Lv.${title.level ?? '-'}(${title.id})`)
      .join('、');
    return {
      label: `${pool.label} · 候选 ${formatNumber(pool.titleCount)} 档`,
      detail: `本阶段入账 ${selected?.titleName || '无'}；${pool.rule || '同池只计一档'} 候选：${titleNames}`,
    };
  });
}

export function formatEvidence(row: Record<string, any>) {
  const file = row.file ? `；${row.file}` : '';
  const parts = Object.entries(row)
    .filter(([key]) => key !== 'table' && key !== 'file')
    .map(([key, value]) => `${key}=${String(value)}`);
  return `${parts.join('；')}${file}`;
}

export function contributionRows(point: StagePoint | null, activeWeights: Record<string, number>) {
  if (!point) return [];
  return attrEntries(point.attrs)
    .map(([field, value]) => {
      const weight = activeWeights[field];
      const contribution = typeof weight === 'number' && Number.isFinite(weight) ? value * weight : null;
      return { field, value, weight, contribution };
    })
    .sort((left, right) => (right.contribution ?? -Infinity) - (left.contribution ?? -Infinity));
}
