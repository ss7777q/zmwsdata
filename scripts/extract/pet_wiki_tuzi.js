/**
 * 宠物技能 Wiki - 皓月兔皇/暗月兔皇提取脚本
 *
 * 宠物入口从 pet.skillActive/skillPassive/skillSp 和 pet.monsterId 取展示技能；
 * 普攻从宠物 monster.atkIds 取。伤害、释放时间、buff 成长继续走 skill ->
 * skillLevel -> entityCtg/bullets -> buff/beskill 的链路。
 */
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");

const PET_OVERRIDE = "tuzi";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const BATTLE_FRAMES_PER_SECOND = 30;
const INSTANT_RELEASE_FRAMES = 1;
const GUIDE_PATH = "D:/zmws/保存网页资源/4399_Threads_Download/暗月比皓月~兔子异化前后数据一览_64110588/content.md";

const PET_IDS = [190000043, 190000153];

const TUZI_SKILL = {
  MOON_ATTACK: 20405020001,
  MOON_SKILL_1: 20405020101,
  MOON_SKILL_2: 20405020201,
  MOON_SKILL_3: 20405020301,
  MOON_SP: 20405020401,
  MOON_PASSIVE: 20405020501,
  MOON_PASSIVE_VSKILL: 20405020502,
  DARK_ATTACK: 20416020001,
  DARK_SKILL_1: 20416020101,
  DARK_SKILL_2: 20416020201,
  DARK_SKILL_3: 20416020301,
  DARK_SP: 20416020401,
  DARK_PASSIVE: 20416020501,
};

const TUZI_BUFF = {
  MOON_HIT_DOWN: 7000501,
  DARK_JUMP: 8005701,
  DARK_ALERT: 289000101,
  DARK_CRIT_UP: 9005101,
  DARK_JUMP_DISPEL_ROOT: 139002301,
  DARK_JUMP_IMMUNE_ROOT: 56000601,
  DARK_SP_DODGE_UP: 8005801,
  DARK_WEAKNESS: 283000101,
};

const TUZI_BESKILL = {
  MOON_TRIPLE_ARROW: 7018001,
  DARK_WEAKNESS_PROGRESS: 7067301,
};

function guideRelease(seconds, source) {
  return { frames: Math.round(seconds * BATTLE_FRAMES_PER_SECOND), source };
}

const GUIDE_RELEASE_FRAMES = new Map([
  [TUZI_SKILL.MOON_ATTACK, guideRelease(0.9, "guide:tuziWiki:皓月兔皇普攻释放0.9s")],
  [TUZI_SKILL.MOON_SKILL_1, guideRelease(2.1, "guide:tuziWiki:流星连射释放用时2.1s")],
  [TUZI_SKILL.MOON_SKILL_2, guideRelease(1.87, "guide:tuziWiki:幻月牢笼释放用时1.87s")],
  [TUZI_SKILL.MOON_SKILL_3, guideRelease(1.36, "guide:tuziWiki:月光降临释放用时1.36s")],
  [TUZI_SKILL.MOON_SP, guideRelease(1.83, "guide:tuziWiki:皓月神箭释放用时1.83s")],
  [TUZI_SKILL.DARK_ATTACK, guideRelease(1.7, "guide:tuziWiki:暗月兔皇普攻释放1.7s")],
  [TUZI_SKILL.DARK_SKILL_1, guideRelease(2, "guide:tuziWiki:回旋月刃释放用时2s")],
  [TUZI_SKILL.DARK_SKILL_2, { frames: INSTANT_RELEASE_FRAMES, source: "entityCtg.time:skill2=1 frame; guide:tuziWiki:狡兔之跃瞬发" }],
  [TUZI_SKILL.DARK_SKILL_3, guideRelease(1, "guide:tuziWiki:影月巨轮释放用时1s")],
  [TUZI_SKILL.DARK_SP, guideRelease(2.5, "guide:tuziWiki:十二环月释放用时2.5s")],
]);

const GUIDE_CD_SECONDS = new Map([
  [TUZI_SKILL.MOON_SKILL_1, 10],
  [TUZI_SKILL.MOON_SKILL_2, 15],
  [TUZI_SKILL.MOON_SKILL_3, 20],
  [TUZI_SKILL.MOON_SP, 30],
  [TUZI_SKILL.DARK_SKILL_1, 9],
  [TUZI_SKILL.DARK_SKILL_2, 15],
  [TUZI_SKILL.DARK_SKILL_3, 15],
  [TUZI_SKILL.DARK_SP, 30],
]);

const EFFECT_ONLY_SKILLS = new Set([TUZI_SKILL.DARK_SKILL_2]);

const GUIDE_DAMAGE_PATCHES = new Map([
  [TUZI_SKILL.MOON_SKILL_3, {
    kind: "guideActionBulletCap",
    bulletId: 1210,
    maxHit: 5,
    source: "actionBullet:1210 guide:tuziWiki:月光降临按5连击展示，battle bullet maxHit=99 不作为伤害段数",
  }],
  [TUZI_SKILL.DARK_ATTACK, {
    kind: "guideActionBulletCap",
    bulletId: 102436,
    maxHit: 3,
    source: "actionBullet:102436 guide:tuziWiki:飞轮普攻按3段展示",
  }],
  [TUZI_SKILL.DARK_SP, {
    kind: "guideBulletSplit",
    bullets: [
      { id: 102447, index: 0, maxHit: 4, source: "bullet:102447 guide:tuziWiki:十二环月小月刃4连击" },
      { id: 102473, index: 1, maxHit: 1, source: "bullet:102473 guide:tuziWiki:十二环月大月刃1连击" },
    ],
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
  guideEffect: "攻略效果",
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

function requiredNumber(value, label) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${label} 缺少必需数值`);
  }
  return value;
}

function firstNumber(arr, label) {
  if (!Array.isArray(arr) || typeof arr[0] !== "number" || Number.isNaN(arr[0])) {
    throw new Error(`${label} 缺少必需数组数值`);
  }
  return arr[0];
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
  const { merged, warnings: w } = ov.mergeBuff(engineBuff, override, rawBuff, `[tuzi buff ${baseBuffId} ${engineBuff.name}] `);
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
    label: `[tuzi buff ${baseBuffId} ${rawBuff1.name || ""}] `,
  });
  if (ctx.emitTemplate) ctx.overrides.recordBuff(displaySkillId, baseBuffId, rawBuff1, null);
}

function collectPassiveEffects(displaySkillId, ctx, warnings) {
  const out = [];

  if (displaySkillId === TUZI_SKILL.MOON_PASSIVE) {
    const be = ctx.beskillById.get(TUZI_BESKILL.MOON_TRIPLE_ARROW);
    if (!be) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${TUZI_BESKILL.MOON_TRIPLE_ARROW} 缺失` });
    const rate = typeof be?.rate === "number" ? `${round(be.rate * 100)}%` : "20%";
    out.push({
      baseBuffId: TUZI_BESKILL.MOON_TRIPLE_ARROW,
      name: be?.name || "三箭齐射",
      text: be?.text || null,
      time: -1,
      bindSource: "passiveEffect",
      bindLabel: BIND_SOURCE_LABEL.passiveEffect,
      value: null,
      displayText: `普攻有${rate}概率触发三箭齐射，一次射出3支箭；每支箭沿用普攻2.6系数。`,
    });
    return out;
  }

  if (displaySkillId === TUZI_SKILL.DARK_PASSIVE) {
    const be = ctx.beskillById.get(TUZI_BESKILL.DARK_WEAKNESS_PROGRESS);
    if (!be) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${TUZI_BESKILL.DARK_WEAKNESS_PROGRESS} 缺失` });
    pushFixedBuff(out, displaySkillId, TUZI_BUFF.DARK_WEAKNESS, ctx.buffById.get(TUZI_BUFF.DARK_WEAKNESS), "passiveEffect", ctx, warnings, null);
    out.push({
      baseBuffId: TUZI_BESKILL.DARK_WEAKNESS_PROGRESS,
      name: be?.name || "弱点进度",
      text: be?.text || null,
      time: -1,
      bindSource: "guideEffect",
      bindLabel: BIND_SOURCE_LABEL.guideEffect,
      value: null,
      displayText: "弱点进度：普攻每下34%，3段叠1层；回旋月刃每下54%，2段叠1层；影月巨轮每下约12%，9段叠1层；十二环月每下约56%，5段叠2层并余56%，刚好叠满时多余进度不计入下一条。",
    });
  }

  return out;
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

  if (displaySkillId === TUZI_SKILL.DARK_SKILL_2) {
    addBuff(TUZI_BUFF.DARK_CRIT_UP, "mechanismEffect");
    addBuff(TUZI_BUFF.DARK_ALERT, "guideEffect");
    addBuff(TUZI_BUFF.DARK_JUMP_DISPEL_ROOT, "mechanismEffect");
    addBuff(TUZI_BUFF.DARK_JUMP_IMMUNE_ROOT, "mechanismEffect");
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

function computeGuidePatchedLevel(displaySkillId, level, ctx, warnings) {
  const def = GUIDE_DAMAGE_PATCHES.get(displaySkillId);
  const skill = ctx.skillById.get(displaySkillId);
  const row = skill ? ctx.skillLevelById.get(eng.skillLevelRowId(skill, level)) : null;
  if (!row) {
    warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `skill ${displaySkillId} lv${level} 缺失` });
    return null;
  }

  let segments;
  if (def.kind === "guideActionBulletCap") {
    if (!eng.getBullet(def.bulletId, warnings)) throw new Error(`skill ${displaySkillId} 修正引用的 bullet ${def.bulletId} 不存在`);
    segments = [{
      per: requiredNumber(row.damageAddPer, `skill ${displaySkillId} lv${level} damageAddPer`),
      val: requiredNumber(row.damageAddVal, `skill ${displaySkillId} lv${level} damageAddVal`),
      maxHit: def.maxHit,
      from: def.source,
    }];
  } else if (def.kind === "guideBulletSplit") {
    segments = def.bullets.map((b) => ({
      per: firstNumber(row.bulletDamageAddPer?.[b.index], `skill ${displaySkillId} lv${level} bulletDamageAddPer[${b.index}]`),
      val: firstNumber(row.bulletDamageAddVal?.[b.index], `skill ${displaySkillId} lv${level} bulletDamageAddVal[${b.index}]`),
      maxHit: b.maxHit,
      from: b.source,
    })).map((segment, i) => {
      const b = def.bullets[i];
      if (row.bullet?.[b.index] !== b.id) throw new Error(`skill ${displaySkillId} lv${level} 预期 bullet[${b.index}]=${b.id}，实际 ${row.bullet?.[b.index]}`);
      if (!eng.getBullet(b.id, warnings)) throw new Error(`skill ${displaySkillId} 修正引用的 bullet ${b.id} 不存在`);
      return segment;
    });
  } else {
    throw new Error(`skill ${displaySkillId} 未知伤害修正类型 ${def.kind}`);
  }

  return {
    level,
    roleLevel: row.roleLevel ?? null,
    consumeMp: row.consumeMp ?? null,
    soulCost: row.soulCost ?? null,
    kind: def.kind,
    segments,
    totalPer: round(segments.reduce((sum, s) => sum + s.per * s.maxHit, 0)),
    totalVal: round(segments.reduce((sum, s) => sum + s.val * s.maxHit, 0)),
    addDefendVal: row.addDefendVal ?? null,
  };
}

function computePetLevel(displaySkillId, concreteIds, level, pet, slotKind, ctx, warnings) {
  if (slotKind === "passive") return makePassiveLevel();
  if (EFFECT_ONLY_SKILLS.has(displaySkillId)) return makeEffectOnlyLevel(displaySkillId, level, ctx, warnings);
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
  console.log("\n🐇 宠物技能 Wiki → 皓月兔皇/暗月兔皇");

  const ctx = {
    petById: idx(u.loadTable("pet")),
    skillById: idx(u.loadTable("skill")),
    skillLevelById: idx(u.loadTable("skillLevel")),
    monsterById: idx(u.loadTable("monster")),
    buffById: idx(u.loadTable("buff")),
    beskillById: idx(u.loadTable("beskill")),
    overrides: ov.loadOverrides(PET_OVERRIDE),
    emitTemplate: EMIT_TEMPLATE,
    standards: metrics.loadCommonStandards(),
  };
  ctx.metricDefs = [...DEFAULT_METRICS, ...ctx.overrides.getMetrics()];
  ctx.helpers = {
    standard: (roleLevel) => (roleLevel != null ? (ctx.standards.get(roleLevel) ?? null) : null),
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
      key: "tuzi",
      name: "皓月兔皇/暗月兔皇",
      guidePath: GUIDE_PATH,
      petIds: PET_IDS,
      note: "宠物技能 Wiki 使用满级作为卡片表头参考值，逐级成长见下方成长数值表；月光降临、飞轮、十二环月按攻略图鉴段数修正，狡兔之跃仅展示机制效果。",
    },
    variants,
  };

  u.saveOutput("pet_wiki_tuzi", payload, {
    system: "pet_wiki",
    sourceFiles: ["pet.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "beskill.*.json", "buff.*.json", "bullets.json", "entityCtg/*.json", GUIDE_PATH],
    note: "皓月兔皇/暗月兔皇宠物技能 Wiki，包括普攻、主动技能、无双、被动、命中降低、狡兔之跃与弱点叠层效果。",
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
