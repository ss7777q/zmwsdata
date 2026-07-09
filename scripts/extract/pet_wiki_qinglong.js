/**
 * 宠物技能 Wiki - 青龙妖圣提取脚本
 *
 * 宠物入口从 pet.skillActive/skillPassive/skillSp 和 pet.monsterId 取展示技能；
 * 普攻从宠物 monster.atkIds 取。伤害、释放时间、buff 成长继续走 skill ->
 * skillLevel -> entityCtg/bullets -> buff/beskill 的链路。
 *
 * 青龙妖圣有三个关键特殊口径：
 * - 幻影龙鳞是分身机制，无直接伤害，不能把占位 0.01 当真实系数；
 * - 雷龙天降第一段是跳空/串联，真实伤害在 20414020402；
 * - 雷霆万钧持续段 bullet 配置 maxHit=99，攻略明确按 11 连击展示。
 */
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");

const PET_OVERRIDE = "qinglong";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const BATTLE_FRAMES_PER_SECOND = 30;
const GUIDE_PATH = "D:/zmws/保存网页资源/4399_Threads_Download/【结弦】神兽技能详解_64312445/content.md";
const PET_IDS = [190000133];

const PET_SKILL = {
  ATTACK: 20414020001,
  SKILL_1: 20414020101,
  SKILL_2: 20414020201,
  SKILL_3: 20414020301,
  SKILL_4: 20414020401,
  SKILL_4_HIT: 20414020402,
  SP: 20414020501,
  SP_HIT: 20414020502,
  SP_END: 20414020503,
  PASSIVE_THUNDER: 20414020601,
  PASSIVE_CLOUD: 20414020702,
  THUNDER_VSKILL: 20414020602,
};

const PET_BUFF = {
  FLY_DAMAGE_TAKEN: 14010501,
  CLONE_DAMAGE_TAKEN: 14010901,
  CLONE_DAMAGE_DOWN: 17003801,
  CLONE_PROTECT_DOWN: 251000301,
  THUNDER_HURT_FLAG: 150000201,
  THUNDER_TRIGGER: 262000101,
  THUNDER_STUN: 3007501,
};

const PET_BESKILL = {
  ENABLE_THUNDER_FLAG: 7059701,
  HURT_THUNDER_FLAG: 7059702,
  FLY: 7059712,
  CLONE_FLY: 7059722,
};

const SPECIAL_CONCRETE_SKILLS = new Map([
  [PET_SKILL.SKILL_4, [PET_SKILL.SKILL_4, PET_SKILL.SKILL_4_HIT]],
  [PET_SKILL.SP, [PET_SKILL.SP, PET_SKILL.SP_HIT, PET_SKILL.SP_END]],
]);

const GUIDE_DAMAGE_PATCHES = new Map([
  [PET_SKILL.SKILL_4, {
    sourceSkillId: PET_SKILL.SKILL_4_HIT,
    hits: 1,
    kind: "guideLinkedHit",
    source: "guide:shenshouWiki:雷龙天降按第二段3.2*atk展示",
  }],
  [PET_SKILL.SP, {
    sourceSkillId: PET_SKILL.SP_HIT,
    hits: 11,
    kind: "guideMultiHit",
    source: "guide:shenshouWiki:雷霆万钧按0.909*atk十一连击展示",
  }],
]);

function guideRelease(seconds, source) {
  return { frames: Math.round(seconds * BATTLE_FRAMES_PER_SECOND), source };
}

const GUIDE_RELEASE_FRAMES = new Map([
  [PET_SKILL.ATTACK, guideRelease(1.833, "guide:shenshouWiki:青龙普攻释放1.833s")],
  [PET_SKILL.SKILL_1, guideRelease(1, "guide:shenshouWiki:雷腾云奔释放用时1s")],
  [PET_SKILL.SKILL_2, guideRelease(0.033, "guide:shenshouWiki:幻影龙鳞释放用时0.033s")],
  [PET_SKILL.SKILL_3, guideRelease(3, "guide:shenshouWiki:雷枪狂舞释放用时3s")],
  [PET_SKILL.SKILL_4, guideRelease(1.8, "guide:shenshouWiki:雷龙天降两段合计释放1.8s")],
  [PET_SKILL.SP, guideRelease(4.6, "guide:shenshouWiki:雷霆万钧释放用时4.6s")],
]);

const GUIDE_CD_SECONDS = new Map([
  [PET_SKILL.SKILL_1, 21],
  [PET_SKILL.SKILL_2, 30],
  [PET_SKILL.SKILL_3, 9],
  [PET_SKILL.SKILL_4, 18],
  [PET_SKILL.SP, 30],
]);

const EFFECT_ONLY_SKILLS = new Set([
  PET_SKILL.SKILL_2,
]);

const SLOT_DEFS = [
  { key: "attack", labelPrefix: "普攻", kind: "attack" },
  { key: "skillActive", labelPrefix: "技能", kind: "active" },
  { key: "skillSp", labelPrefix: "无双", kind: "sp" },
  { key: "skillPassive", labelPrefix: "被动", kind: "passive" },
];

const BIND_SOURCE_LABEL = {
  beSkill: "被动技能",
  beSkill2: "被动技能",
  entityActionComBuff: "技能附带",
  bulletHitBuff: "命中附带",
  passiveEffect: "被动效果",
  guideEffect: "攻略效果",
};

const DEFAULT_METRICS = [
  { key: "atkConv", label: "攻转", scope: "level", expr: "totalPer / releaseSeconds", when: "totalPer * releaseSeconds", fixed: 3 },
];

function idx(arr) {
  const m = new Map();
  for (const r of arr) m.set(r.id, r);
  return m;
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function buffValueSummary(buff) {
  if (!buff) return null;
  let v = buff.value;
  if (Array.isArray(v) && Array.isArray(v[0])) v = v[0];
  if (Array.isArray(v)) {
    return { per: typeof v[0] === "number" ? v[0] : null, val: typeof v[1] === "number" ? v[1] : null };
  }
  if (v && typeof v === "object") {
    return { per: typeof v.per === "number" ? v.per : null, val: typeof v.val === "number" ? v.val : null };
  }
  return null;
}

function petMonsterIds(pet) {
  return asArray(pet.monsterId).filter((id) => id != null);
}

function ownerMonstersForSkill(skillId, ctx) {
  const out = [];
  for (const m of ctx.monsterById.values()) {
    const all = [].concat(m.skillIds || [], m.skyskillIds || [], m.vSkill || [], m.atkIds || [], m.skyAtkIds || []);
    if (all.includes(skillId)) out.push(m);
  }
  return out;
}

function resolvePetCfgFile(skill, pet, ctx, warnings) {
  const action = skill.entityAction;
  const monsterIds = petMonsterIds(pet);
  const order = [];

  for (const id of monsterIds) {
    const monster = ctx.monsterById.get(id);
    if (monster) order.push(monster);
  }
  for (const monster of ownerMonstersForSkill(skill.id, ctx)) {
    if (!order.some((m) => m.id === monster.id)) order.push(monster);
  }

  for (const monster of order) {
    const entityCfg = eng.loadEntityCfg(monster.cfgFile);
    if (entityCfg && action && entityCfg[action]) {
      return {
        cfgFileResolved: monster.cfgFile,
        cfgResolveSource: monsterIds.includes(monster.id) ? "petMonster" : "ownerMonster",
        cfgMonsterId: monster.id,
        cfgMonsterName: monster.name,
        hasActionCfg: true,
        actionCfg: entityCfg[action],
        entityCfg,
      };
    }
  }

  const fallback = order[0] || null;
  const fallbackCfg = fallback ? eng.loadEntityCfg(fallback.cfgFile) : null;
  if (action) {
    if (!fallbackCfg) warnings.push({ code: eng.WARN.MISSING_ENTITY_CFG, detail: `pet ${pet.id} skill ${skill.id} 找不到 entityCtg` });
    else warnings.push({ code: eng.WARN.MISSING_ACTION_CFG, detail: `pet ${pet.id} skill ${skill.id} action=${action} 在 cfg ${fallback.cfgFile} 中不存在` });
  }

  return {
    cfgFileResolved: fallback?.cfgFile || null,
    cfgResolveSource: "fallback",
    cfgMonsterId: fallback?.id ?? null,
    cfgMonsterName: fallback?.name ?? null,
    hasActionCfg: false,
    actionCfg: null,
    entityCfg: fallbackCfg,
  };
}

function resolvePetConcreteSkills(displaySkillId, ctx, warnings) {
  const special = SPECIAL_CONCRETE_SKILLS.get(displaySkillId);
  if (special) {
    for (const id of special) {
      if (!ctx.skillById.has(id)) warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `子技能 ${id} 不在 skill 表` });
    }
    return special.filter((id) => ctx.skillById.has(id));
  }
  return eng.resolveConcreteSkills(displaySkillId, ctx.skillById, warnings);
}

function resolvePetReleaseTime(displaySkillId, cfg, skill, warnings) {
  const guide = GUIDE_RELEASE_FRAMES.get(displaySkillId);
  if (guide) {
    return {
      releaseFrames: guide.frames,
      releaseSeconds: guide.frames / BATTLE_FRAMES_PER_SECOND,
      releaseTimeSource: guide.source,
    };
  }
  return eng.resolveReleaseTime(cfg.entityCfg, skill.entityAction, cfg.hasActionCfg, warnings);
}

function detectDisplayMaxLevel(displaySkillId, concreteIds, slotKind, ctx) {
  if (slotKind === "passive" || slotKind === "attack") return 1;
  const patch = GUIDE_DAMAGE_PATCHES.get(displaySkillId);
  const ids = patch ? [patch.sourceSkillId] : concreteIds;
  let maxLevel = 0;
  for (const id of ids) {
    const skill = ctx.skillById.get(id);
    if (!skill) continue;
    maxLevel = Math.max(maxLevel, eng.detectMaxLevel(skill, ctx.skillLevelById));
  }
  return maxLevel;
}

function mergeBuffForDisplay(displaySkillId, baseBuffId, rawBuff, engineBuff, ctx, warnings) {
  const override = ctx.overrides.resolveBuff(displaySkillId, baseBuffId) || ctx.overrides.resolveBuff(0, baseBuffId);
  if (!override) return engineBuff;
  const { merged, warnings: w } = ov.mergeBuff(engineBuff, override, rawBuff, `[qinglong buff ${baseBuffId} ${engineBuff.name}] `);
  warnings.push(...w);
  return merged;
}

function pushFixedBuff(out, displaySkillId, baseBuffId, rawBuff, bindSource, ctx, warnings, fallbackText = null) {
  if (!rawBuff) {
    warnings.push({ code: eng.WARN.MISSING_BUFF, detail: `buff ${baseBuffId} 缺失` });
    return;
  }
  const engineBuff = {
    baseBuffId,
    name: rawBuff.name || `buff${baseBuffId}`,
    text: rawBuff.text || null,
    time: rawBuff.time ?? null,
    bindSource,
    bindLabel: BIND_SOURCE_LABEL[bindSource] || bindSource,
    value: buffValueSummary(rawBuff),
    displayText: fallbackText,
  };
  out.push(mergeBuffForDisplay(displaySkillId, baseBuffId, rawBuff, engineBuff, ctx, warnings));
}

function addGrowthBuffRef(growthBuffRefs, seenBuffs, displaySkillId, baseBuffId, bindSource, ctx, warnings) {
  if (seenBuffs.has(baseBuffId)) return;
  seenBuffs.add(baseBuffId);
  const g1 = eng.resolveBuffGrowth(baseBuffId, 1, ctx.buffById, warnings);
  if (!g1.buff) return;
  const rawBuff1 = g1.buff;
  const override = ctx.overrides.resolveBuff(displaySkillId, baseBuffId) || ctx.overrides.resolveBuff(0, baseBuffId);
  growthBuffRefs.push({
    baseBuffId,
    name: rawBuff1.name || `buff${baseBuffId}`,
    text: rawBuff1.text || null,
    time: rawBuff1.time ?? null,
    bindSource,
    bindLabel: BIND_SOURCE_LABEL[bindSource] || bindSource,
    levelMode: g1.levelMode,
    override,
    label: `[qinglong buff ${baseBuffId} ${rawBuff1.name || ""}] `,
  });
  if (ctx.emitTemplate) ctx.overrides.recordBuff(displaySkillId, baseBuffId, rawBuff1, null);
}

function addBuffByGrowthMode(fixedBuffs, growthBuffRefs, seenBuffs, displaySkillId, baseBuffId, bindSource, ctx, warnings) {
  if (seenBuffs.has(baseBuffId)) return;
  const g1 = eng.resolveBuffGrowth(baseBuffId, 1, ctx.buffById, warnings);
  if (!g1.buff) return;
  if (g1.levelMode === "growth") {
    addGrowthBuffRef(growthBuffRefs, seenBuffs, displaySkillId, baseBuffId, bindSource, ctx, warnings);
  } else {
    seenBuffs.add(baseBuffId);
    pushFixedBuff(fixedBuffs, displaySkillId, baseBuffId, g1.buff, bindSource, ctx, warnings, null);
    if (ctx.emitTemplate) ctx.overrides.recordBuff(displaySkillId, baseBuffId, g1.buff, null);
  }
}

function pushTextEffect(out, baseBuffId, name, bindSource, displayText) {
  out.push({
    baseBuffId,
    name,
    text: null,
    time: -1,
    bindSource,
    bindLabel: BIND_SOURCE_LABEL[bindSource] || bindSource,
    value: null,
    displayText,
  });
}

function collectFlyPassive(displaySkillId, fixedBuffs, ctx, warnings) {
  const be = ctx.beskillById.get(PET_BESKILL.FLY);
  if (!be) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${PET_BESKILL.FLY} 缺失` });
  const attr = be?.attribute || {};
  const callMonsterText = Object.entries(attr.callMonsters || {}).map(([monsterId, beSkillId]) => `${monsterId}->${beSkillId}`).join("/") || "—";
  const flyAttack = asArray(attr.flyAttack?.atkIds).join("/") || "—";
  const flySkills = asArray(attr.flySkillActive).join("/") || "—";
  const flyReplaceAction = attr.flyReplaceAction ?? null;
  if (flyReplaceAction == null) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${PET_BESKILL.FLY} 缺少 flyReplaceAction` });
  pushTextEffect(
    fixedBuffs,
    PET_BESKILL.FLY,
    be?.name || "游云惊龙",
    "passiveEffect",
    `PVE 可切换飞行/游云姿态；分身映射 ${callMonsterText}；动作后缀 ${flyReplaceAction ?? "—"}，飞行普攻 ${flyAttack}，飞行技能 ${flySkills}`
  );
  for (const buffId of asArray(attr.buffs)) {
    pushFixedBuff(fixedBuffs, displaySkillId, buffId, ctx.buffById.get(buffId), "passiveEffect", ctx, warnings, null);
  }
}

function collectThunderPassive(displaySkillId, fixedBuffs, ctx, warnings) {
  const enableBe = ctx.beskillById.get(PET_BESKILL.ENABLE_THUNDER_FLAG);
  const hurtBe = ctx.beskillById.get(PET_BESKILL.HURT_THUNDER_FLAG);
  if (!enableBe) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${PET_BESKILL.ENABLE_THUNDER_FLAG} 缺失` });
  if (!hurtBe) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${PET_BESKILL.HURT_THUNDER_FLAG} 缺失` });

  pushTextEffect(
    fixedBuffs,
    PET_BESKILL.ENABLE_THUNDER_FLAG,
    enableBe?.name || "亢龙引雷",
    "passiveEffect",
    "解锁青龙异常状态值；攻击或被攻击会给敌人叠引雷进度，100% 后敌人获得 2s 引雷"
  );
  for (const buffId of asArray(hurtBe?.attribute)) {
    pushFixedBuff(fixedBuffs, displaySkillId, buffId, ctx.buffById.get(buffId), "passiveEffect", ctx, warnings, null);
  }
  pushFixedBuff(fixedBuffs, displaySkillId, PET_BUFF.THUNDER_TRIGGER, ctx.buffById.get(PET_BUFF.THUNDER_TRIGGER), "passiveEffect", ctx, warnings, null);
  pushTextEffect(
    fixedBuffs,
    PET_SKILL.THUNDER_VSKILL,
    "亢龙引雷雷击",
    "passiveEffect",
    "触发引雷后造成一次雷击，雷击系数0.01；命中后进入麻木"
  );
  pushFixedBuff(fixedBuffs, displaySkillId, PET_BUFF.THUNDER_STUN, ctx.buffById.get(PET_BUFF.THUNDER_STUN), "passiveEffect", ctx, warnings, null);
}

function cloneMonsterIdsFromSkill2(pet, ctx, warnings) {
  const skill = ctx.skillById.get(PET_SKILL.SKILL_2);
  if (!skill) return [];
  const ids = [];
  for (const monsterId of petMonsterIds(pet)) {
    const monster = ctx.monsterById.get(monsterId);
    const entityCfg = monster ? eng.loadEntityCfg(monster.cfgFile) : null;
    const actionCfg = entityCfg?.[skill.entityAction];
    if (!actionCfg) continue;
    for (const summon of (actionCfg.com || []).filter((com) => com.type === 13)) {
      for (const id of asArray(summon.mIds).filter(Boolean)) {
        if (!ids.includes(id)) ids.push(id);
      }
    }
  }
  return ids;
}

function formatPercentValue(value) {
  return `${round(value * 100)}%`;
}

function collectGuideEffects(displaySkillId, pet, ctx, warnings) {
  const out = [];

  if (displaySkillId === PET_SKILL.SKILL_2) {
    const cloneIds = cloneMonsterIdsFromSkill2(pet, ctx, warnings);
    const cloneRows = cloneIds.map((id) => ctx.monsterById.get(id)).filter(Boolean);
    if (!cloneIds.length) warnings.push({ code: eng.WARN.MISSING_ACTION_CFG, detail: `skill ${PET_SKILL.SKILL_2} 未解析到分身 monsterId` });
    const hpValues = cloneRows.map((m) => m.hp).filter((v) => typeof v === "number");
    if (!hpValues.length) warnings.push({ code: eng.WARN.MISSING_ENTITY_CFG, detail: `skill ${PET_SKILL.SKILL_2} 分身 monster 未解析到 hp 继承值` });
    const hpText = hpValues.map(formatPercentValue).join("/") || "—";
    pushTextEffect(
      out,
      PET_SKILL.SKILL_2,
      "幻影龙鳞分身",
      "guideEffect",
      `召唤分身；最多存在12.5s，血量继承 ${hpText}，其他属性100%，出场1s后约11.5s输出，会使用雷枪狂舞，攻略估算总系数20.7`
    );
    for (const buffId of [PET_BUFF.CLONE_DAMAGE_TAKEN, PET_BUFF.CLONE_DAMAGE_DOWN, PET_BUFF.CLONE_PROTECT_DOWN]) {
      pushFixedBuff(out, displaySkillId, buffId, ctx.buffById.get(buffId), "guideEffect", ctx, warnings, null);
    }
  }

  if (displaySkillId === PET_SKILL.SKILL_4) {
    pushTextEffect(
      out,
      PET_SKILL.SKILL_4,
      "雷龙天降两段",
      "guideEffect",
      "第一段跳空0.7s可规避伤害；第二段锁定下刺1.1s造成实际伤害。完整释放按1.8s，伤害按第二段3.2系数展示"
    );
  }

  if (displaySkillId === PET_SKILL.SP) {
    pushTextEffect(
      out,
      PET_SKILL.SP,
      "雷霆万钧离体技",
      "guideEffect",
      "前摇完成后落雷会完整释放；攻略按0.909*atk十一连击展示，不按异常上限统计"
    );
  }

  return out;
}

function collectBuffs(displaySkillId, concreteIds, pet, slotKind, ctx, warnings) {
  const fixedBuffs = [];
  const growthBuffRefs = [];
  const seenBuffs = new Set();

  if (slotKind !== "passive") {
    for (const skillId of concreteIds) {
      const skill = ctx.skillById.get(skillId);
      if (!skill || !skill.entityAction) continue;
      const cfg = resolvePetCfgFile(skill, pet, ctx, warnings);
      const refs = eng.scanBuffs(skill, cfg.actionCfg, ctx.beskillById, warnings);
      for (const ref of refs) addBuffByGrowthMode(fixedBuffs, growthBuffRefs, seenBuffs, displaySkillId, ref.baseBuffId, ref.bindSource, ctx, warnings);
    }
  }

  if (slotKind === "passive" && displaySkillId === PET_SKILL.PASSIVE_CLOUD) collectFlyPassive(displaySkillId, fixedBuffs, ctx, warnings);
  if (slotKind === "passive" && displaySkillId === PET_SKILL.PASSIVE_THUNDER) collectThunderPassive(displaySkillId, fixedBuffs, ctx, warnings);

  fixedBuffs.push(...collectGuideEffects(displaySkillId, pet, ctx, warnings));
  return { fixedBuffs, growthBuffRefs };
}

function makeEffectOnlyLevel(displaySkillId, level, ctx, warnings) {
  const skill = ctx.skillById.get(displaySkillId);
  const row = skill ? ctx.skillLevelById.get(eng.skillLevelRowId(skill, level)) : null;
  if (!row) warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `skill ${displaySkillId} lv${level} 缺失` });
  return {
    level,
    roleLevel: row?.roleLevel ?? null,
    consumeMp: row?.consumeMp ?? null,
    soulCost: row?.soulCost ?? null,
    kind: "effectOnly",
    segments: [],
    totalPer: null,
    totalVal: null,
    addDefendVal: row?.addDefendVal ?? null,
  };
}

function makePassiveLevel() {
  return {
    level: 1,
    roleLevel: null,
    consumeMp: null,
    soulCost: null,
    kind: "effectOnly",
    segments: [],
    totalPer: null,
    totalVal: null,
    addDefendVal: null,
  };
}

function computeGuidePatchedLevel(displaySkillId, level, ctx, warnings) {
  const def = GUIDE_DAMAGE_PATCHES.get(displaySkillId);
  const skill = ctx.skillById.get(def.sourceSkillId);
  const row = skill ? ctx.skillLevelById.get(eng.skillLevelRowId(skill, level)) : null;
  if (!skill) warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `skill ${def.sourceSkillId} 不在 skill 表` });
  if (!row) {
    warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `skill ${def.sourceSkillId} lv${level} 缺失` });
    return null;
  }
  const segment = { per: row.damageAddPer ?? 0, val: row.damageAddVal ?? 0, maxHit: def.hits, from: def.source };
  return {
    level,
    roleLevel: row.roleLevel ?? null,
    consumeMp: row.consumeMp ?? null,
    soulCost: row.soulCost ?? null,
    kind: def.kind,
    segments: [segment],
    totalPer: round((segment.per || 0) * def.hits),
    totalVal: round((segment.val || 0) * def.hits),
    addDefendVal: row.addDefendVal ?? null,
  };
}

function computePetLevel(displaySkillId, concreteIds, level, pet, slotKind, ctx, warnings) {
  if (slotKind === "passive") return makePassiveLevel();
  if (GUIDE_DAMAGE_PATCHES.has(displaySkillId)) return computeGuidePatchedLevel(displaySkillId, level, ctx, warnings);
  if (EFFECT_ONLY_SKILLS.has(displaySkillId)) return makeEffectOnlyLevel(displaySkillId, level, ctx, warnings);

  let mergedSegments = [];
  let mergedKind = null;
  let firstRow = null;

  for (const skillId of concreteIds) {
    const skill = ctx.skillById.get(skillId);
    if (!skill) {
      warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `伤害技能 ${skillId} 不在 skill 表` });
      continue;
    }
    const row = ctx.skillLevelById.get(eng.skillLevelRowId(skill, level));
    if (!row) {
      warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `skill ${skill.id} lv${level} 缺失` });
      continue;
    }
    if (!firstRow) firstRow = row;

    const cfg = resolvePetCfgFile(skill, pet, ctx, warnings);
    const dmg = eng.computeDamageSegments(skill, row, cfg.actionCfg, warnings);
    if (dmg.segments && dmg.segments.length) {
      mergedSegments.push(...dmg.segments);
      if (!mergedKind || mergedKind === "normal") mergedKind = dmg.kind;
    }
  }

  if (!firstRow) return null;
  if (mergedSegments.some((s) => s.per > 0)) mergedSegments = mergedSegments.filter((s) => s.per > 0);

  let totalPer = 0;
  let totalVal = 0;
  for (const s of mergedSegments) {
    totalPer += (s.per || 0) * (s.maxHit || 1);
    totalVal += (s.val || 0) * (s.maxHit || 1);
  }

  return {
    level,
    roleLevel: firstRow.roleLevel ?? null,
    consumeMp: firstRow.consumeMp ?? null,
    soulCost: firstRow.soulCost ?? null,
    kind: mergedSegments.length ? (mergedKind || "normal") : "effectOnly",
    segments: mergedSegments,
    totalPer: mergedSegments.length ? round(totalPer) : null,
    totalVal: mergedSegments.length ? round(totalVal) : null,
    addDefendVal: firstRow.addDefendVal ?? null,
  };
}

function buildSkillCard(displaySkillId, pet, slotLabel, slotKind, ctx) {
  const warnings = [];
  const skill = ctx.skillById.get(displaySkillId);
  if (!skill) {
    return { skillId: displaySkillId, name: `技能${displaySkillId}`, error: "skill 不存在", warnings: [{ code: eng.WARN.MISSING_SKILL }] };
  }

  const concreteIds = resolvePetConcreteSkills(displaySkillId, ctx, warnings);
  const cfg = slotKind === "passive"
    ? { cfgFileResolved: null, cfgResolveSource: "passive", hasActionCfg: false, actionCfg: null, entityCfg: null }
    : resolvePetCfgFile(skill, pet, ctx, warnings);
  const maxLevel = detectDisplayMaxLevel(displaySkillId, concreteIds, slotKind, ctx);
  const rel = slotKind === "passive"
    ? { releaseFrames: null, releaseSeconds: null, releaseTimeSource: "effectOnly" }
    : resolvePetReleaseTime(displaySkillId, cfg, skill, warnings);
  const { fixedBuffs, growthBuffRefs } = collectBuffs(displaySkillId, concreteIds, pet, slotKind, ctx, warnings);

  const levels = [];
  for (let lv = 1; lv <= maxLevel; lv++) {
    const l = computePetLevel(displaySkillId, concreteIds, lv, pet, slotKind, ctx, warnings);
    if (!l) continue;
    l.growthBuffs = growthBuffRefs.map((ref) => {
      const g = eng.resolveBuffGrowth(ref.baseBuffId, lv, ctx.buffById, warnings);
      const rawBuffG = g.buff;
      const engBuff = {
        baseBuffId: ref.baseBuffId,
        name: ref.name,
        bindLabel: ref.bindLabel,
        time: rawBuffG?.time ?? ref.time,
        value: buffValueSummary(rawBuffG),
      };
      if (ref.override && rawBuffG) {
        const { merged, warnings: w } = ov.mergeBuff(engBuff, ref.override, rawBuffG, ref.label);
        if (lv === 1) warnings.push(...w);
        return merged;
      }
      return engBuff;
    });
    levels.push(l);
  }

  const reference = levels[levels.length - 1] || levels[0] || null;
  const segCount = reference ? reference.segments.reduce((sum, s) => sum + (s.maxHit || 1), 0) : 0;
  const skillOv = ctx.overrides.resolveSkill(displaySkillId);
  const card = {
    skillId: displaySkillId,
    name: skill.desName || skill.Name || `技能${displaySkillId}`,
    icon: skill.icon || null,
    attribute: skill.attribute ?? null,
    entityAction: skill.entityAction || null,
    concreteSkillIds: concreteIds,
    desIntro: skill.desIntro || null,
    header: {
      kind: reference ? reference.kind : null,
      segments: reference ? reference.segments.map((s) => ({ per: s.per, maxHit: s.maxHit, from: s.from, capSource: s.capSource || null })) : [],
      segCount,
      totalPer: reference ? reference.totalPer : null,
      releaseFrames: rel.releaseFrames,
      releaseSeconds: rel.releaseSeconds,
      releaseTimeSource: rel.releaseTimeSource,
      cd: GUIDE_CD_SECONDS.has(displaySkillId) ? GUIDE_CD_SECONDS.get(displaySkillId) : (skill.cd ?? null),
      addDefendVal: reference?.addDefendVal ?? skill.addDefendVal ?? null,
      cfgFileResolved: cfg.cfgFileResolved,
      cfgResolveSource: cfg.cfgResolveSource,
      referenceLevel: reference?.level ?? null,
      fixedBuffs,
      metrics: metrics.computeMetrics(
        ctx.metricDefs, "header",
        { skillId: displaySkillId, totalPer: reference ? reference.totalPer : null, releaseSeconds: rel.releaseSeconds, segCount },
        ctx.helpers, warnings,
      ),
    },
    maxLevel,
    slotLabel,
    slotKind,
    levels: levels.map((l) => ({
      level: l.level,
      roleLevel: l.roleLevel,
      consumeMp: l.consumeMp,
      soulCost: l.soulCost,
      segmentVals: l.segments.map((s) => ({ val: s.val, maxHit: s.maxHit })),
      totalPer: l.totalPer,
      totalVal: l.totalVal,
      growthBuffs: l.growthBuffs || [],
      metrics: metrics.computeMetrics(
        ctx.metricDefs, "level",
        { skillId: displaySkillId, level: l.level, roleLevel: l.roleLevel, consumeMp: l.consumeMp, totalPer: l.totalPer, totalVal: l.totalVal, growthBuffs: l.growthBuffs || [], releaseSeconds: rel.releaseSeconds, segCount: l.segments.reduce((sum, s) => sum + (s.maxHit || 1), 0) },
        ctx.helpers, l.level === 1 ? warnings : [],
      ),
    })),
    warnings,
  };

  if (skillOv) {
    for (const [k, v] of Object.entries(skillOv)) {
      if (k.startsWith("_")) continue;
      if (k.startsWith("header.")) card.header[k.slice(7)] = v;
      else card[k] = v;
    }
  }

  return card;
}

function petAttackSkillIds(pet, ctx) {
  const ids = [];
  for (const monsterId of petMonsterIds(pet)) {
    const monster = ctx.monsterById.get(monsterId);
    for (const skillId of asArray(monster?.atkIds).filter(Boolean)) {
      if (!ids.includes(skillId)) ids.push(skillId);
    }
  }
  return ids;
}

function skillIdsForSlot(pet, def, ctx) {
  if (def.kind === "attack") return petAttackSkillIds(pet, ctx);
  return asArray(pet[def.key]).filter(Boolean);
}

function buildSlots(pet, ctx) {
  const slots = [];
  for (const def of SLOT_DEFS) {
    const ids = skillIdsForSlot(pet, def, ctx);
    ids.forEach((skillId, index) => {
      const slotLabel = def.kind === "attack" || def.kind === "sp" || def.kind === "passive" ? def.labelPrefix : `${def.labelPrefix}${index + 1}`;
      slots.push({
        slot: def.kind === "attack" ? `attack${index + 1}` : `${def.key}${index + 1}`,
        slotLabel,
        slotKind: def.kind,
        base: buildSkillCard(skillId, pet, slotLabel, def.kind, ctx),
        awakens: [],
        allAwakenIdentical: false,
      });
    });
  }
  return slots;
}

function extract() {
  console.log("\n🐉 宠物技能 Wiki → 青龙妖圣");

  const ctx = {
    petById: idx(u.loadTable("pet")),
    skillById: idx(u.loadTable("skill")),
    skillLevelById: idx(u.loadTable("skillLevel")),
    monsterById: idx(u.loadTable("monster")),
    buffById: idx(u.loadTable("buff")),
    beskillById: idx(u.loadTable("beskill")),
    overrides: ov.loadOverrides(PET_OVERRIDE),
    emitTemplate: EMIT_TEMPLATE,
  };
  ctx.metricDefs = [...DEFAULT_METRICS, ...ctx.overrides.getMetrics()];
  ctx.helpers = {
    buffValue: (baseBuffId, valuePath, level) => {
      const g = eng.resolveBuffGrowth(Number(baseBuffId), level, ctx.buffById, []);
      if (!g.buff) return null;
      const v = ov.getPath(g.buff, valuePath);
      return typeof v === "number" ? v : null;
    },
  };

  if (EMIT_TEMPLATE) {
    const target = ctx.overrides.writeTemplate(FORCE);
    console.log(`  📝 模板已生成 → ${target}`);
    return;
  }

  const variants = PET_IDS.map((petId) => {
    const pet = ctx.petById.get(petId);
    if (!pet) throw new Error(`pet ${petId} 不存在`);
    const monster = ctx.monsterById.get(petMonsterIds(pet)[0]);
    return {
      pet: {
        id: pet.id,
        idGroup: pet.idGroup,
        name: pet.name,
        rank: pet.rank,
        type: pet.type,
        monsterId: pet.monsterId,
        monsterName: monster?.name || null,
        cfgFile: monster?.cfgFile || null,
      },
      slots: buildSlots(pet, ctx),
    };
  });

  const unused = ctx.overrides.finalizeWarnings();
  if (unused.length && variants[0]?.slots[0]?.base) variants[0].slots[0].base.warnings.push(...unused);

  const payload = {
    petGroup: {
      key: "qinglong",
      name: "青龙妖圣",
      guidePath: GUIDE_PATH,
      petIds: PET_IDS,
      note: "宠物技能 Wiki 使用满级作为卡片表头参考值，逐级成长见下方成长数值表；幻影龙鳞按分身机制展示，雷龙天降按第二段实际伤害展示，雷霆万钧按攻略11连击展示。",
    },
    variants,
  };

  u.saveOutput("pet_wiki_qinglong", payload, {
    system: "pet_wiki",
    sourceFiles: ["pet.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "beskill.*.json", "buff.*.json", "bullets.json", "entityCtg/*.json", GUIDE_PATH],
    note: "青龙妖圣宠物技能 Wiki，包括普攻、主动技能、无双、游云惊龙、亢龙引雷、幻影龙鳞分身、雷龙天降第二段和雷霆万钧11连击伤害。",
  });

  for (const v of variants) {
    console.log(`  ${v.pet.name}(${v.pet.id}) cfg=${v.pet.cfgFile}`);
    for (const s of v.slots) {
      const b = s.base;
      const atkConv = b.levels?.[b.levels.length - 1]?.metrics?.find((m) => m.key === "atkConv")?.display ?? "—";
      console.log(`    ${s.slotLabel} ${b.name}(${b.skillId}): ${b.header.kind} ${b.header.segCount}段 per=${b.header.totalPer ?? "—"} 帧=${b.header.releaseFrames ?? "—"} maxLv=${b.maxLevel} 攻转=${atkConv}${b.warnings.length ? " ⚠" + b.warnings.length : ""}`);
    }
  }
}

if (require.main === module) extract();
module.exports = extract;
