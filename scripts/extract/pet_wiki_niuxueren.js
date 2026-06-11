/**
 * 宠物技能 Wiki - 圣力神牛/圣雪圆圆提取脚本
 *
 * 宠物入口从 pet.skillActive/skillPassive/skillSp 和 pet.monsterId 取展示技能；
 * 普攻从宠物 monster.atkIds 取。伤害、释放时间、buff 成长继续走 skill ->
 * skillLevel -> entityCtg/bullets -> buff/beskill 的链路。
 *
 * 本组有两个特殊链路：圣力神牛“翻天覆地”的真实伤害在后续触发阶段
 * 20407020302；圣雪圆圆“化雪成冰”的真实伤害在第二阶段 20406020403。
 */
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");

const PET_OVERRIDE = "niuxueren";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const BATTLE_FRAMES_PER_SECOND = 30;
const GUIDE_PATH = "D:/zmws/保存网页资源/4399_Threads_Download/【结弦】圣力神牛与圣雪圆圆~数值百科_64189129/content.md";

const PET_IDS = [190000063, 190000053];

const PET_SKILL = {
  NIU_ATTACK: 20407020001,
  NIU_SKILL_1: 20407020101,
  NIU_SKILL_2: 20407020201,
  NIU_SKILL_3: 20407020301,
  NIU_SKILL_3_HIT: 20407020302,
  NIU_SP: 20407020401,
  NIU_PASSIVE: 20407020501,
  SNOW_ATTACK: 20406020001,
  SNOW_SKILL_1: 20406020101,
  SNOW_SKILL_1_ROLL: 20406020102,
  SNOW_SKILL_1_END: 20406020103,
  SNOW_SKILL_2: 20406020201,
  SNOW_SKILL_3: 20406020301,
  SNOW_SP: 20406020401,
  SNOW_SP_WAIT: 20406020402,
  SNOW_SP_HIT: 20406020403,
  SNOW_PASSIVE: 20406020501,
  SNOW_PASSIVE_AURA: 20406020502,
};

const PET_BUFF = {
  NIU_STUN: 3003601,
  NIU_ROCK_CALLBACK: 136000601,
  NIU_TENACITY_DOWN: 10000701,
  NIU_GUARD_DOWN: 12000601,
  NIU_TENACITY_UP: 10000601,
  NIU_GUARD_UP: 12000501,
  SNOW_DEF_UP: 6002201,
  SNOW_FROST_FLAG: 150000101,
  SNOW_SLOW_20: 4009001,
  SNOW_IMMUNE_PULL: 25000201,
  SNOW_IMMUNE_DEBUFF: 41001001,
  SNOW_SHIELD: 13002601,
  SNOW_ATK_DOWN: 188000101,
  SNOW_SLOW_15: 4032801,
};

const PET_BESKILL = {
  NIU_GUARD_AURA: 7012701,
  SNOW_AURA_SKILL: 7033001,
};

const SPECIAL_CONCRETE_SKILLS = new Map([
  [PET_SKILL.NIU_SKILL_3, [PET_SKILL.NIU_SKILL_3, PET_SKILL.NIU_SKILL_3_HIT]],
  [PET_SKILL.SNOW_SKILL_1, [PET_SKILL.SNOW_SKILL_1, PET_SKILL.SNOW_SKILL_1_ROLL, PET_SKILL.SNOW_SKILL_1_END]],
  [PET_SKILL.SNOW_SP, [PET_SKILL.SNOW_SP, PET_SKILL.SNOW_SP_WAIT, PET_SKILL.SNOW_SP_HIT]],
]);

const DAMAGE_SKILL_IDS = new Map([
  [PET_SKILL.NIU_SKILL_3, [PET_SKILL.NIU_SKILL_3_HIT]],
  [PET_SKILL.SNOW_SKILL_1, [PET_SKILL.SNOW_SKILL_1, PET_SKILL.SNOW_SKILL_1_ROLL]],
  [PET_SKILL.SNOW_SKILL_2, []],
  [PET_SKILL.SNOW_SP, [PET_SKILL.SNOW_SP_HIT]],
]);

function guideRelease(seconds, source) {
  return { frames: Math.round(seconds * BATTLE_FRAMES_PER_SECOND), source };
}

const GUIDE_RELEASE_FRAMES = new Map([
  [PET_SKILL.NIU_ATTACK, guideRelease(3.033, "guide:niuxuerenWiki:圣力神牛普攻释放3.033s")],
  [PET_SKILL.NIU_SKILL_1, guideRelease(1.5, "guide:niuxuerenWiki:蛮牛冲撞释放用时1.5s")],
  [PET_SKILL.NIU_SKILL_2, guideRelease(1, "guide:niuxuerenWiki:裂地猛踏释放用时1s")],
  [PET_SKILL.NIU_SKILL_3, guideRelease(1.8, "guide:niuxuerenWiki:翻天覆地释放用时1.8s")],
  [PET_SKILL.NIU_SP, guideRelease(2.167, "guide:niuxuerenWiki:开天辟地释放用时2.167s")],
  [PET_SKILL.SNOW_ATTACK, guideRelease(1.567, "guide:niuxuerenWiki:圣雪圆圆普攻释放1.567s")],
  [PET_SKILL.SNOW_SKILL_1, guideRelease(3.233, "guide:niuxuerenWiki:雪球滚滚释放用时3.233s")],
  [PET_SKILL.SNOW_SKILL_2, guideRelease(1.367, "guide:niuxuerenWiki:冰雪铠甲释放用时1.367s")],
  [PET_SKILL.SNOW_SKILL_3, guideRelease(1.367, "guide:niuxuerenWiki:风号雪舞释放用时1.367s")],
  [PET_SKILL.SNOW_SP, guideRelease(0.967, "guide:niuxuerenWiki:化雪成冰第二阶段爆裂用时0.967s")],
]);

const GUIDE_CD_SECONDS = new Map([
  [PET_SKILL.NIU_SKILL_1, 18],
  [PET_SKILL.NIU_SKILL_2, 33],
  [PET_SKILL.NIU_SKILL_3, 12],
  [PET_SKILL.NIU_SP, 30],
  [PET_SKILL.SNOW_SKILL_1, 20],
  [PET_SKILL.SNOW_SKILL_2, 20],
  [PET_SKILL.SNOW_SKILL_3, 10],
  [PET_SKILL.SNOW_SP, 30],
]);

const EFFECT_ONLY_SKILLS = new Set([PET_SKILL.SNOW_SKILL_2]);

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
  mechanismEffect: "机制效果",
  passiveEffect: "被动效果",
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

function damageSkillIdsFor(displaySkillId, concreteIds) {
  if (DAMAGE_SKILL_IDS.has(displaySkillId)) return DAMAGE_SKILL_IDS.get(displaySkillId);
  return concreteIds;
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
  const sourceIds = damageSkillIdsFor(displaySkillId, concreteIds);
  const ids = sourceIds.length ? sourceIds : [displaySkillId];
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
  const { merged, warnings: w } = ov.mergeBuff(engineBuff, override, rawBuff, `[niuxueren buff ${baseBuffId} ${engineBuff.name}] `);
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
    label: `[niuxueren buff ${baseBuffId} ${rawBuff1.name || ""}] `,
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

function collectNiuPassive(displaySkillId, fixedBuffs, ctx, warnings) {
  const be = ctx.beskillById.get(PET_BESKILL.NIU_GUARD_AURA);
  if (!be) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${PET_BESKILL.NIU_GUARD_AURA} 缺失` });
  fixedBuffs.push({
    baseBuffId: PET_BESKILL.NIU_GUARD_AURA,
    name: be?.name || "石之守护",
    text: be?.text || null,
    time: -1,
    bindSource: "passiveEffect",
    bindLabel: BIND_SOURCE_LABEL.passiveEffect,
    value: null,
    displayText: be?.cd == null
      ? "光环类被动，向同阵营施加韧性/守护强化"
      : `光环类被动，每${be.cd}s向同阵营施加韧性/守护强化`,
  });
  pushFixedBuff(fixedBuffs, displaySkillId, PET_BUFF.NIU_TENACITY_UP, ctx.buffById.get(PET_BUFF.NIU_TENACITY_UP), "passiveEffect", ctx, warnings, null);
  pushFixedBuff(fixedBuffs, displaySkillId, PET_BUFF.NIU_GUARD_UP, ctx.buffById.get(PET_BUFF.NIU_GUARD_UP), "passiveEffect", ctx, warnings, null);
}

function collectSnowPassive(displaySkillId, pet, fixedBuffs, ctx, warnings) {
  const be = ctx.beskillById.get(PET_BESKILL.SNOW_AURA_SKILL);
  if (!be) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${PET_BESKILL.SNOW_AURA_SKILL} 缺失` });
  fixedBuffs.push({
    baseBuffId: PET_BESKILL.SNOW_AURA_SKILL,
    name: be?.name || "寒气弥漫",
    text: be?.text || null,
    time: -1,
    bindSource: "passiveEffect",
    bindLabel: BIND_SOURCE_LABEL.passiveEffect,
    value: null,
    displayText: be?.cd == null
      ? "光环类被动，触发寒气弥漫效果"
      : `光环类被动，每${be.cd}s触发寒气弥漫效果`,
  });

  const aura = ctx.skillById.get(PET_SKILL.SNOW_PASSIVE_AURA);
  if (!aura) {
    warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `skill ${PET_SKILL.SNOW_PASSIVE_AURA} 不在 skill 表` });
    return;
  }
  const cfg = resolvePetCfgFile(aura, pet, ctx, warnings);
  const refs = eng.scanBuffs(aura, cfg.actionCfg, ctx.beskillById, warnings);
  for (const ref of refs) {
    const g1 = eng.resolveBuffGrowth(ref.baseBuffId, 1, ctx.buffById, warnings);
    if (g1.buff) pushFixedBuff(fixedBuffs, displaySkillId, ref.baseBuffId, g1.buff, "passiveEffect", ctx, warnings, null);
  }
}

function collectBuffs(displaySkillId, concreteIds, pet, slotKind, ctx, warnings) {
  const fixedBuffs = [];
  const growthBuffRefs = [];
  const seenBuffs = new Set();

  for (const skillId of concreteIds) {
    const skill = ctx.skillById.get(skillId);
    if (!skill) continue;
    const cfg = resolvePetCfgFile(skill, pet, ctx, warnings);
    const refs = eng.scanBuffs(skill, cfg.actionCfg, ctx.beskillById, warnings);
    for (const ref of refs) addBuffByGrowthMode(fixedBuffs, growthBuffRefs, seenBuffs, displaySkillId, ref.baseBuffId, ref.bindSource, ctx, warnings);
  }

  if (displaySkillId === PET_SKILL.SNOW_SKILL_2) {
    addBuffByGrowthMode(fixedBuffs, growthBuffRefs, seenBuffs, displaySkillId, PET_BUFF.SNOW_FROST_FLAG, "mechanismEffect", ctx, warnings);
  }

  if (slotKind === "passive" && displaySkillId === PET_SKILL.NIU_PASSIVE) collectNiuPassive(displaySkillId, fixedBuffs, ctx, warnings);
  if (slotKind === "passive" && displaySkillId === PET_SKILL.SNOW_PASSIVE) collectSnowPassive(displaySkillId, pet, fixedBuffs, ctx, warnings);

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

function computePetLevel(displaySkillId, concreteIds, level, pet, slotKind, ctx, warnings) {
  if (slotKind === "passive") return makePassiveLevel();
  if (EFFECT_ONLY_SKILLS.has(displaySkillId)) return makeEffectOnlyLevel(displaySkillId, level, ctx, warnings);

  let mergedSegments = [];
  let mergedKind = null;
  let firstRow = null;
  const sourceIds = damageSkillIdsFor(displaySkillId, concreteIds);

  for (const skillId of sourceIds) {
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
  const cfg = resolvePetCfgFile(skill, pet, ctx, warnings);
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
        { skillId: displaySkillId, level: l.level, roleLevel: l.roleLevel, consumeMp: l.consumeMp, totalPer: l.totalPer, totalVal: l.totalVal, releaseSeconds: rel.releaseSeconds, segCount: l.segments.reduce((sum, s) => sum + (s.maxHit || 1), 0) },
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
  console.log("\n🐂 宠物技能 Wiki → 圣力神牛/圣雪圆圆");

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
      key: "niuxueren",
      name: "圣力神牛/圣雪圆圆",
      guidePath: GUIDE_PATH,
      petIds: PET_IDS,
      note: "宠物技能 Wiki 使用满级作为卡片表头参考值，逐级成长见下方成长数值表；翻天覆地、雪球滚滚、化雪成冰按实际命中阶段合并，冰雪铠甲仅展示机制效果、防御成长与霜冻反馈。",
    },
    variants,
  };

  u.saveOutput("pet_wiki_niuxueren", payload, {
    system: "pet_wiki",
    sourceFiles: ["pet.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "beskill.*.json", "buff.*.json", "bullets.json", "entityCtg/*.json", GUIDE_PATH],
    note: "圣力神牛/圣雪圆圆宠物技能 Wiki，包括普攻、主动技能、无双、被动、护盾与光环效果。",
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
