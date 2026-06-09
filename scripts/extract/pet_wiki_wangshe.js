/**
 * 宠物技能 Wiki - 圣木王蛇/圣砂王蛇提取脚本
 *
 * 宠物入口从 pet.skillActive/skillPassive/skillSp 和 pet.monsterId 取展示技能；
 * 普攻从宠物 monster.atkIds 取。伤害、释放时间、buff 成长继续走 skill ->
 * skillLevel -> entityCtg/bullets -> buff/beskill 的链路。
 */
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");

const PET_OVERRIDE = "wangshe";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const BATTLE_FRAMES_PER_SECOND = 30;
const GUIDE_PATH = "D:/zmws/保存网页资源/4399_Threads_Download/【结弦】圣木王蛇与圣砂王蛇~数值百科_64180550/content.md";

const PET_IDS = [190000023, 190000163];

const WANGSHE_SKILL = {
  WOOD_ATTACK: 20403020001,
  WOOD_SKILL_1: 20403020101,
  WOOD_SKILL_2: 20403020201,
  WOOD_SKILL_3: 20403020301,
  WOOD_SP: 20403020401,
  WOOD_PASSIVE: 20403020501,
  SAND_ATTACK: 20417020001,
  SAND_SKILL_1: 20417020101,
  SAND_SKILL_2: 20417020201,
  SAND_SKILL_3: 20417020301,
  SAND_SP: 20417020401,
  SAND_PASSIVE: 20417020501,
};

const WANGSHE_BUFF = {
  WOOD_SHIELD: 13000301,
  WOOD_POOL_POISON: 1001801,
  WOOD_POOL_SLOW: 4000701,
  WOOD_SP_POISON_BUGGED: 1014601,
  SAND_POOL_DAMAGE: 1058501,
};

const WANGSHE_BESKILL = {
  WOOD_REPLACE_POISON: 7011501,
  SAND_SHIELD_AMOUNT: 7070901,
  SAND_SHIELD_TIME: 7070902,
};

function guideRelease(seconds, source) {
  return { frames: Math.round(seconds * BATTLE_FRAMES_PER_SECOND), source };
}

const GUIDE_RELEASE_FRAMES = new Map([
  [WANGSHE_SKILL.WOOD_SKILL_3, guideRelease(2.367, "guide:wangsheWiki:剧毒沼泽释放用时2.367s")],
  [WANGSHE_SKILL.SAND_SKILL_1, guideRelease(1.233, "guide:wangsheWiki:魔沙龙卷释放用时1.233s")],
]);

const GUIDE_CD_SECONDS = new Map([
  [WANGSHE_SKILL.WOOD_SKILL_1, 10],
  [WANGSHE_SKILL.WOOD_SKILL_2, 15],
  [WANGSHE_SKILL.WOOD_SKILL_3, 20],
  [WANGSHE_SKILL.WOOD_SP, 30],
  [WANGSHE_SKILL.SAND_SKILL_1, 10],
  [WANGSHE_SKILL.SAND_SKILL_2, 15],
  [WANGSHE_SKILL.SAND_SKILL_3, 20],
  [WANGSHE_SKILL.SAND_SP, 30],
]);

const EFFECT_ONLY_SKILLS = new Set([
  WANGSHE_SKILL.WOOD_SKILL_2,
  WANGSHE_SKILL.SAND_SKILL_2,
]);

const DOT_DAMAGE_SOURCES = new Map([
  [WANGSHE_SKILL.WOOD_SKILL_3, {
    baseBuffId: WANGSHE_BUFF.WOOD_POOL_POISON,
    ticks: 10,
    source: "buff:1001801 guide:wangsheWiki:剧毒沼泽最多10跳",
  }],
  [WANGSHE_SKILL.SAND_SKILL_3, {
    baseBuffId: WANGSHE_BUFF.SAND_POOL_DAMAGE,
    ticks: 6,
    source: "buff:1058501 guide:wangsheWiki:流沙地带最多6跳",
  }],
]);

const GUIDE_DAMAGE_PATCHES = new Map([
  [WANGSHE_SKILL.WOOD_SP, {
    directHits: 2,
    directSource: "guide:wangsheWiki:毒液巨弹7.8*atk×2连击",
    poisonBuffId: WANGSHE_BUFF.WOOD_SP_POISON_BUGGED,
    poisonTicks: 5,
    poisonSource: "buff:1014601 guide:wangsheWiki:毒液巨弹中毒5跳",
  }],
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

function buffDamageValue(rawBuff, warnings, label) {
  const summary = buffValueSummary(rawBuff);
  if (!summary || (summary.per == null && summary.val == null)) {
    warnings.push({ code: "MISSING_BUFF_DAMAGE_VALUE", detail: `${label} 缺少可用伤害 value` });
    return null;
  }
  return {
    per: Math.abs(summary.per || 0),
    val: Math.abs(summary.val || 0),
  };
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
  const ids = concreteIds.length ? concreteIds : [displaySkillId];
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
  const { merged, warnings: w } = ov.mergeBuff(engineBuff, override, rawBuff, `[wangshe buff ${baseBuffId} ${engineBuff.name}] `);
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

function collectPassiveEffects(displaySkillId, ctx, warnings) {
  const out = [];

  if (displaySkillId === WANGSHE_SKILL.WOOD_PASSIVE) {
    const be = ctx.beskillById.get(WANGSHE_BESKILL.WOOD_REPLACE_POISON);
    if (!be) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${WANGSHE_BESKILL.WOOD_REPLACE_POISON} 缺失` });
    out.push({
      baseBuffId: WANGSHE_BESKILL.WOOD_REPLACE_POISON,
      name: be?.name || "毒液操纵",
      text: be?.text || null,
      time: -1,
      bindSource: "passiveEffect",
      bindLabel: BIND_SOURCE_LABEL.passiveEffect,
      value: null,
      displayText: "剧毒沼泽的持续毒伤提升约30%；毒液巨弹的中毒伤害提升约41.7%，攻略标注当前即使未激活被动也会按提升后毒伤生效",
    });
    return out;
  }

  if (displaySkillId === WANGSHE_SKILL.SAND_PASSIVE) {
    const amount = ctx.beskillById.get(WANGSHE_BESKILL.SAND_SHIELD_AMOUNT);
    const time = ctx.beskillById.get(WANGSHE_BESKILL.SAND_SHIELD_TIME);
    if (!amount) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${WANGSHE_BESKILL.SAND_SHIELD_AMOUNT} 缺失` });
    if (!time) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${WANGSHE_BESKILL.SAND_SHIELD_TIME} 缺失` });
    out.push({
      baseBuffId: WANGSHE_BESKILL.SAND_SHIELD_AMOUNT,
      name: amount?.name || "聚沙成盾",
      text: amount?.text || null,
      time: -1,
      bindSource: "passiveEffect",
      bindLabel: BIND_SOURCE_LABEL.passiveEffect,
      value: null,
      displayText: "沙鳞守护护盾量提升20%。",
    });
    out.push({
      baseBuffId: WANGSHE_BESKILL.SAND_SHIELD_TIME,
      name: time?.name || "聚沙成盾",
      text: time?.text || null,
      time: -1,
      bindSource: "passiveEffect",
      bindLabel: BIND_SOURCE_LABEL.passiveEffect,
      value: null,
      displayText: "沙鳞守护强化时间提升20%，由12.5s延长至15s。",
    });
  }

  return out;
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
    label: `[wangshe buff ${baseBuffId} ${rawBuff1.name || ""}] `,
  });
  if (ctx.emitTemplate) ctx.overrides.recordBuff(displaySkillId, baseBuffId, rawBuff1, null);
}

function collectBuffs(displaySkillId, concreteIds, pet, slotKind, ctx, warnings) {
  const fixedBuffs = [];
  const growthBuffRefs = [];
  const seenBuffs = new Set();

  const addBuff = (baseBuffId, bindSource) => {
    const g1 = eng.resolveBuffGrowth(baseBuffId, 1, ctx.buffById, warnings);
    if (!g1.buff) return;
    if (g1.levelMode === "growth") addGrowthBuffRef(growthBuffRefs, seenBuffs, displaySkillId, baseBuffId, bindSource, ctx, warnings);
    else {
      if (seenBuffs.has(baseBuffId)) return;
      seenBuffs.add(baseBuffId);
      pushFixedBuff(fixedBuffs, displaySkillId, baseBuffId, g1.buff, bindSource, ctx, warnings, null);
      if (ctx.emitTemplate) ctx.overrides.recordBuff(displaySkillId, baseBuffId, g1.buff, null);
    }
  };

  for (const skillId of concreteIds) {
    const skill = ctx.skillById.get(skillId);
    if (!skill) continue;
    const cfg = resolvePetCfgFile(skill, pet, ctx, warnings);
    const refs = eng.scanBuffs(skill, cfg.actionCfg, ctx.beskillById, warnings);
    for (const ref of refs) addBuff(ref.baseBuffId, ref.bindSource);
  }

  if (displaySkillId === WANGSHE_SKILL.WOOD_SKILL_3) {
    addBuff(WANGSHE_BUFF.WOOD_POOL_POISON, "mechanismEffect");
    addBuff(WANGSHE_BUFF.WOOD_POOL_SLOW, "mechanismEffect");
  }

  if (slotKind === "passive") fixedBuffs.push(...collectPassiveEffects(displaySkillId, ctx, warnings));
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

function computeDotLevel(displaySkillId, level, ctx, warnings) {
  const def = DOT_DAMAGE_SOURCES.get(displaySkillId);
  const skill = ctx.skillById.get(displaySkillId);
  const row = skill ? ctx.skillLevelById.get(eng.skillLevelRowId(skill, level)) : null;
  if (!row) {
    warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `skill ${displaySkillId} lv${level} 缺失` });
    return null;
  }

  const g = eng.resolveBuffGrowth(def.baseBuffId, level, ctx.buffById, warnings);
  const dmg = buffDamageValue(g.buff, warnings, `skill ${displaySkillId} buff ${def.baseBuffId} lv${level}`);
  if (!dmg) return makeEffectOnlyLevel(displaySkillId, level, ctx, warnings);

  const segments = [{ per: dmg.per, val: dmg.val, maxHit: def.ticks, from: def.source }];
  return {
    level,
    roleLevel: row.roleLevel ?? null,
    consumeMp: row.consumeMp ?? null,
    soulCost: row.soulCost ?? null,
    kind: "buffDot",
    segments,
    totalPer: round(dmg.per * def.ticks),
    totalVal: round(dmg.val * def.ticks),
    addDefendVal: row.addDefendVal ?? null,
  };
}

function computeGuidePatchedLevel(displaySkillId, level, ctx, warnings) {
  const def = GUIDE_DAMAGE_PATCHES.get(displaySkillId);
  const skill = ctx.skillById.get(displaySkillId);
  const row = skill ? ctx.skillLevelById.get(eng.skillLevelRowId(skill, level)) : null;
  if (!row) {
    warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `skill ${displaySkillId} lv${level} 缺失` });
    return null;
  }

  const poison = eng.resolveBuffGrowth(def.poisonBuffId, level, ctx.buffById, warnings);
  const poisonDmg = buffDamageValue(poison.buff, warnings, `skill ${displaySkillId} buff ${def.poisonBuffId} lv${level}`);
  if (!poisonDmg) return makeEffectOnlyLevel(displaySkillId, level, ctx, warnings);

  const segments = [{
    per: row.damageAddPer ?? 0,
    val: 0,
    maxHit: def.directHits,
    from: def.directSource,
  }];

  return {
    level,
    roleLevel: row.roleLevel ?? null,
    consumeMp: row.consumeMp ?? null,
    soulCost: row.soulCost ?? null,
    kind: "guideActionAndBuff",
    segments,
    totalPer: round((row.damageAddPer || 0) * def.directHits),
    totalVal: round((poisonDmg.val || 0) * def.poisonTicks),
    addDefendVal: row.addDefendVal ?? null,
    extraSegmentVals: [{ val: poisonDmg.val, maxHit: def.poisonTicks, from: def.poisonSource }],
  };
}

function computePetLevel(displaySkillId, concreteIds, level, pet, slotKind, ctx, warnings) {
  if (slotKind === "passive") return makePassiveLevel();
  if (EFFECT_ONLY_SKILLS.has(displaySkillId)) return makeEffectOnlyLevel(displaySkillId, level, ctx, warnings);
  if (DOT_DAMAGE_SOURCES.has(displaySkillId)) return computeDotLevel(displaySkillId, level, ctx, warnings);
  if (GUIDE_DAMAGE_PATCHES.has(displaySkillId)) return computeGuidePatchedLevel(displaySkillId, level, ctx, warnings);

  let mergedSegments = [];
  let mergedKind = null;
  let firstRow = null;

  for (const skillId of concreteIds) {
    const skill = ctx.skillById.get(skillId);
    if (!skill) continue;
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

  const concreteIds = eng.resolveConcreteSkills(displaySkillId, ctx.skillById, warnings);
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
      segmentVals: l.segments.map((s) => ({ val: s.val, maxHit: s.maxHit })).concat(l.extraSegmentVals || []),
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
  console.log("\n🐍 宠物技能 Wiki → 圣木王蛇/圣砂王蛇");

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
      key: "wangshe",
      name: "圣木王蛇/圣砂王蛇",
      guidePath: GUIDE_PATH,
      petIds: PET_IDS,
      note: "宠物技能 Wiki 使用满级作为卡片表头参考值，逐级成长见下方成长数值表；剧毒沼泽/流沙地带按实际中毒与流沙成长折算 DoT，护盾按实际护盾成长展示。",
    },
    variants,
  };

  u.saveOutput("pet_wiki_wangshe", payload, {
    system: "pet_wiki",
    sourceFiles: ["pet.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "beskill.*.json", "buff.*.json", "bullets.json", "entityCtg/*.json", GUIDE_PATH],
    note: "圣木王蛇/圣砂王蛇宠物技能 Wiki，包括普攻、主动技能、无双、被动、护盾与 DoT 成长效果。",
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
