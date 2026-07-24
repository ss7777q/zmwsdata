/**
 * 宠物技能 Wiki - 神霄花仙/玄蝶仙子/千年冰狐/圣冰天狐提取脚本
 *
 * 宠物入口从 pet.skillActive/skillPassive/skillSp 和 pet.monsterId 取展示技能；
 * 普攻从宠物 monster.atkIds 取。伤害、释放时间、buff 成长继续走 skill ->
 * skillLevel -> entityCtg/bullets -> buff/beskill 的链路。
 */
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");

const PET_OVERRIDE = "huadiehubing";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const BATTLE_FRAMES_PER_SECOND = 30;
const GUIDE_PATH = "D:/zmws/保存网页资源/4399_Threads_Download/【结弦】花花蝴蝶冰冰~数值百科_64189062/content.md";
const PET_IDS = [190000073, 190000103, 190000033, 190000034];

const SACRED_FOX_ROCK_AI = {
  noRockBehaviorId: 428001,
  expectedBlockingBulletIds: [104119, 104120],
  heldBulletId: 104120,
  baseSolidDamageX: 15,
};

const PET_SKILL = {
  FLOWER_ATTACK: 20408020001,
  FLOWER_SKILL_1: 20408020101,
  FLOWER_SKILL_2: 20408020201,
  FLOWER_SKILL_3: 20408020301,
  FLOWER_SP: 20408020401,
  FLOWER_PASSIVE_VSKILL: 20408020501,
  FLOWER_PASSIVE: 20408020601,
  BUTTERFLY_ATTACK: 20411020001,
  BUTTERFLY_SKILL_1: 20411020101,
  BUTTERFLY_SKILL_2: 20411020201,
  BUTTERFLY_SKILL_3: 20411020301,
  BUTTERFLY_SP: 20411020401,
  BUTTERFLY_PASSIVE_FLY: 20411020502,
  BUTTERFLY_PASSIVE_BAD_LUCK_VSKILL: 20411020506,
  BUTTERFLY_PASSIVE_BAD_LUCK: 20411020507,
  FOX_ATTACK: 20404010001,
  FOX_SKILL_1: 20404010101,
  FOX_SKILL_2: 20404010201,
  FOX_SKILL_3: 20404010301,
  FOX_SKILL_3_HIT: 20404010302,
  FOX_SKILL_3_END: 20404010303,
  FOX_SP: 20404010401,
  FOX_PASSIVE: 20404010501,
  SACRED_FOX_ATTACK: 20420040001,
  SACRED_FOX_SKILL_1: 20420040101,
  SACRED_FOX_SKILL_2: 20420040201,
  SACRED_FOX_SKILL_3: 20420040301,
  SACRED_FOX_SKILL_3_HIT: 20420040302,
  SACRED_FOX_SKILL_3_END: 20420040303,
  SACRED_FOX_SKILL_4: 20420040401,
  SACRED_FOX_SKILL_4_FROZEN: 20420040402,
  SACRED_FOX_SKILL_4_TIMEOUT: 20420040403,
  SACRED_FOX_SP: 20420040501,
  SACRED_FOX_PASSIVE_FROST: 20420040601,
  SACRED_FOX_PASSIVE_FLY: 20420040701,
  SACRED_FOX_SUMMON_ATTACK: 20420060001,
};

const PET_BUFF = {
  FLOWER_ROOT: 26001401,
  FLOWER_HEAL: 1013201,
  FLOWER_HIT_DOWN: 7001401,
  FLOWER_CRIT_DOWN: 9001301,
  FLOWER_GUARD: 180000101,
  FLOWER_HEAL_UP: 29001401,
  BUTTERFLY_POISON: 1033401,
  BUTTERFLY_ROOT: 26002201,
  BUTTERFLY_CURSE: 211000101,
  BUTTERFLY_DODGE_DOWN: 8001801,
  BUTTERFLY_TENACITY_DOWN: 10001701,
  BUTTERFLY_DEF_DOWN: 6005601,
  BUTTERFLY_FLY_DAMAGE_UP: 14006601,
  BUTTERFLY_BAD_LUCK: 180000201,
  FOX_FREEZE: 35000301,
  FOX_FREEZE_STRONG: 35001001,
  SACRED_FOX_FLY_DAMAGE_UP: 14019001,
  SACRED_FOX_SUMMON_SHIELD: 13010001,
};

const PET_BESKILL = {
  FLOWER_GUARD: 7032101,
  BUTTERFLY_FLY: 7038902,
  BUTTERFLY_BAD_LUCK: 7038801,
  FOX_REPLACE_FREEZE: 7011601,
  FOX_FREEZE_DAMAGE: 7011602,
  SACRED_FOX_REPLACE_FREEZE: 7083101,
  SACRED_FOX_FREEZE_DAMAGE: 7083102,
  SACRED_FOX_FLY: 7083103,
  SACRED_FOX_SUMMON_FLY: 7083104,
  SACRED_FOX_ROCK_CHARGE: 7083105,
  SACRED_FOX_ROCK_SCALE_DAMAGE: 7083106,
  SACRED_FOX_ROCK_FROZEN_RELEASE: 7083107,
  SACRED_FOX_ROCK_TIMEOUT_RELEASE: 7083108,
  SACRED_FOX_ROCK_BREAK: 7083109,
};

const SACRED_FOX_SUMMON_METRICS = [
  { key: "summonHp", label: "召唤生命固定值", influenceKey: "hpInfluenceRatio", standardKey: "hpStandardRatio", expKey: "hpSummonedStanderd" },
  { key: "summonAtk", label: "召唤攻击固定值", influenceKey: "atkInfluenceRatio", standardKey: "atkStandardRatio", expKey: "atkSummonedStanderd" },
  { key: "summonHealHp", label: "召唤回血固定值", influenceKey: "healHpInfluenceRatio", standardKey: "healHpStandardRatio", expKey: "healHpSummonedStanderd" },
  { key: "summonBreak", label: "召唤穿透固定值", influenceKey: "breakInfluenceRatio", standardKey: "breakStandardRatio", expKey: "breakSummonedStanderd" },
  { key: "summonProtect", label: "召唤减伤固定值", influenceKey: "protectInfluenceRatio", standardKey: "protectStandardRatio", expKey: "protectSummonedStanderd" },
];

const SPECIAL_CONCRETE_SKILLS = new Map([
  [PET_SKILL.FLOWER_PASSIVE, [PET_SKILL.FLOWER_PASSIVE, PET_SKILL.FLOWER_PASSIVE_VSKILL]],
  [PET_SKILL.BUTTERFLY_PASSIVE_BAD_LUCK, [PET_SKILL.BUTTERFLY_PASSIVE_BAD_LUCK, PET_SKILL.BUTTERFLY_PASSIVE_BAD_LUCK_VSKILL]],
  [PET_SKILL.FOX_SKILL_3, [PET_SKILL.FOX_SKILL_3, PET_SKILL.FOX_SKILL_3_HIT]],
  [PET_SKILL.SACRED_FOX_SKILL_3, [PET_SKILL.SACRED_FOX_SKILL_3, PET_SKILL.SACRED_FOX_SKILL_3_HIT]],
  [PET_SKILL.SACRED_FOX_SKILL_4, [PET_SKILL.SACRED_FOX_SKILL_4, PET_SKILL.SACRED_FOX_SKILL_4_FROZEN, PET_SKILL.SACRED_FOX_SKILL_4_TIMEOUT]],
]);

const DAMAGE_SKILL_IDS = new Map([
  [PET_SKILL.FLOWER_SKILL_3, []],
  [PET_SKILL.FLOWER_SP, []],
  [PET_SKILL.BUTTERFLY_SP, []],
  [PET_SKILL.FOX_SKILL_2, []],
  [PET_SKILL.FOX_SKILL_3, [PET_SKILL.FOX_SKILL_3_HIT]],
  [PET_SKILL.SACRED_FOX_SKILL_2, []],
  [PET_SKILL.SACRED_FOX_SKILL_3, [PET_SKILL.SACRED_FOX_SKILL_3_HIT]],
]);

const DAMAGE_PATCHES = new Map([
  [PET_SKILL.BUTTERFLY_SKILL_3, {
    sourceSkillId: PET_SKILL.BUTTERFLY_SKILL_3,
    hits: 12,
    kind: "buffTrigger",
    source: "buff:211000101 guide:huadiehubingWiki:恶咒缠身最多12次额外真伤",
  }],
  [PET_SKILL.FOX_SKILL_3, {
    sourceSkillId: PET_SKILL.FOX_SKILL_3_HIT,
    hits: 15,
    kind: "guideMultiHit",
    source: "guide:huadiehubingWiki:冰雪风暴15连击",
  }],
  [PET_SKILL.FOX_SP, {
    sourceSkillId: PET_SKILL.FOX_SP,
    hits: 9,
    kind: "guideMultiHit",
    source: "guide:huadiehubingWiki:极冰九刺9连击",
  }],
  [PET_SKILL.SACRED_FOX_SKILL_3, {
    sourceSkillId: PET_SKILL.SACRED_FOX_SKILL_3_HIT,
    hits: 15,
    kind: "entityLinkedMultiHit",
    source: "entityCtg:2042004-monster_cfg_shenghuabinghu skill3_2 五组、每组三发，共15段",
  }],
  [PET_SKILL.SACRED_FOX_SKILL_4, {
    sourceSkillId: PET_SKILL.SACRED_FOX_SKILL_4,
    hits: 1,
    kind: "chargedProjectile",
    source: "entityCtg:vskill4_1/vskill4_2 -> bullet:104124；此处记录未计充能与破冰的基础伤害",
  }],
  [PET_SKILL.SACRED_FOX_SP, {
    sourceSkillId: PET_SKILL.SACRED_FOX_SP,
    hits: 9,
    kind: "entityLinkedMultiHit",
    source: "entityCtg:2042004-monster_cfg_shenghuabinghu skill5_1 八枚冰刺加一枚巨型冰刺，共9段",
  }],
]);

function guideRelease(seconds, source) {
  return { frames: Math.round(seconds * BATTLE_FRAMES_PER_SECOND), source };
}

const GUIDE_RELEASE_FRAMES = new Map([
  [PET_SKILL.FLOWER_ATTACK, guideRelease(1.3, "guide:huadiehubingWiki:神霄花仙普攻释放1.3s")],
  [PET_SKILL.FLOWER_SKILL_1, guideRelease(3.433, "guide:huadiehubingWiki:藤鞭乱舞释放用时3.433s")],
  [PET_SKILL.FLOWER_SKILL_2, guideRelease(1.267, "guide:huadiehubingWiki:缠缚花蕾释放用时1.267s")],
  [PET_SKILL.FLOWER_SKILL_3, guideRelease(2.6, "guide:huadiehubingWiki:花舞纷飞释放用时2.6s")],
  [PET_SKILL.FLOWER_SP, guideRelease(2.433, "guide:huadiehubingWiki:厄运之花释放用时2.433s")],
  [PET_SKILL.BUTTERFLY_ATTACK, guideRelease(1.067, "guide:huadiehubingWiki:玄蝶仙子普攻释放1.067s")],
  [PET_SKILL.BUTTERFLY_SKILL_1, guideRelease(1.2, "guide:huadiehubingWiki:绵毒绒球释放用时1.2s")],
  [PET_SKILL.BUTTERFLY_SKILL_2, guideRelease(1.867, "guide:huadiehubingWiki:丝缚法球释放用时1.867s")],
  [PET_SKILL.BUTTERFLY_SKILL_3, guideRelease(2.2, "guide:huadiehubingWiki:恶咒缠身释放用时2.2s")],
  [PET_SKILL.BUTTERFLY_SP, guideRelease(2.7, "guide:huadiehubingWiki:厄运鳞粉释放用时2.7s")],
  [PET_SKILL.FOX_ATTACK, guideRelease(1.433, "guide:huadiehubingWiki:千年冰狐普攻释放1.433s")],
  [PET_SKILL.FOX_SKILL_1, guideRelease(2.433, "guide:huadiehubingWiki:冰雪玉盘释放用时2.433s")],
  [PET_SKILL.FOX_SKILL_2, guideRelease(1.867, "guide:huadiehubingWiki:冰心狐狸释放用时1.867s")],
  [PET_SKILL.FOX_SKILL_3, guideRelease(4.567, "guide:huadiehubingWiki:冰雪风暴释放用时4.567s")],
  [PET_SKILL.FOX_SP, guideRelease(3.033, "guide:huadiehubingWiki:极冰九刺释放用时3.033s")],
  [PET_SKILL.SACRED_FOX_SKILL_3, {
    frames: 136,
    source: "entityCtg.time chain:skill3_1(27)+skill3_2循环(84)+skill3_3(25)",
  }],
]);

const GUIDE_CD_SECONDS = new Map([
  [PET_SKILL.FLOWER_SKILL_1, 12],
  [PET_SKILL.FLOWER_SKILL_2, 15],
  [PET_SKILL.FLOWER_SKILL_3, 30],
  [PET_SKILL.FLOWER_SP, 30],
  [PET_SKILL.BUTTERFLY_SKILL_1, 12],
  [PET_SKILL.BUTTERFLY_SKILL_2, 15],
  [PET_SKILL.BUTTERFLY_SKILL_3, 24],
  [PET_SKILL.BUTTERFLY_SP, 30],
  [PET_SKILL.FOX_SKILL_1, 10],
  [PET_SKILL.FOX_SKILL_2, 15],
  [PET_SKILL.FOX_SKILL_3, 20],
  [PET_SKILL.FOX_SP, 30],
]);

const EFFECT_ONLY_SKILLS = new Set([
  PET_SKILL.FLOWER_SKILL_3,
  PET_SKILL.FLOWER_SP,
  PET_SKILL.BUTTERFLY_SP,
  PET_SKILL.FOX_SKILL_2,
  PET_SKILL.SACRED_FOX_SKILL_2,
]);

const SKIP_ZERO_BUFFS = new Set([
  `${PET_SKILL.BUTTERFLY_SP}:${PET_BUFF.BUTTERFLY_DODGE_DOWN}`,
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
  guideEffect: "攻略效果",
};

const DEFAULT_METRICS = [
  { key: "atkConv", label: "攻转", scope: "level", expr: "totalPer / releaseSeconds", when: "totalPer * releaseSeconds", fixed: 3 },
  { key: "fullChargeVal", label: "尺寸7单次主固伤", scope: "level", skill: PET_SKILL.SACRED_FOX_SKILL_4, expr: "totalVal * 1.75", when: "totalVal", fixed: 3 },
  { key: "fullChargeBreakVal", label: "尺寸7单次破冰固伤", scope: "level", skill: PET_SKILL.SACRED_FOX_SKILL_4, expr: "totalVal * 2.45", when: "totalVal", fixed: 3 },
  { key: "fullChargeFrozenBreakVal", label: "尺寸7单次冰冻破冰固伤", scope: "level", skill: PET_SKILL.SACRED_FOX_SKILL_4, expr: "totalVal * 3.0625", when: "totalVal", fixed: 3 },
];

function idx(arr) {
  const m = new Map();
  for (const r of arr) m.set(r.id, r);
  return m;
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}

function formatNumber(n, digits = 4) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "?";
  return String(Number(n.toFixed(digits)));
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
  const patch = DAMAGE_PATCHES.get(displaySkillId);
  const sourceIds = patch ? [patch.sourceSkillId] : damageSkillIdsFor(displaySkillId, concreteIds);
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
  const { merged, warnings: w } = ov.mergeBuff(engineBuff, override, rawBuff, `[huadiehubing buff ${baseBuffId} ${engineBuff.name}] `);
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
    label: `[huadiehubing buff ${baseBuffId} ${rawBuff1.name || ""}] `,
  });
  if (ctx.emitTemplate) ctx.overrides.recordBuff(displaySkillId, baseBuffId, rawBuff1, null);
}

function addBuffByGrowthMode(fixedBuffs, growthBuffRefs, seenBuffs, displaySkillId, baseBuffId, bindSource, ctx, warnings) {
  if (seenBuffs.has(baseBuffId)) return;
  if (SKIP_ZERO_BUFFS.has(`${displaySkillId}:${baseBuffId}`)) {
    seenBuffs.add(baseBuffId);
    return;
  }
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

function pushPassiveBeskill(out, baseBuffId, name, displayText) {
  out.push({
    baseBuffId,
    name,
    text: null,
    time: -1,
    bindSource: "passiveEffect",
    bindLabel: BIND_SOURCE_LABEL.passiveEffect,
    value: null,
    displayText,
  });
}

function collectFlowerPassive(displaySkillId, pet, fixedBuffs, ctx, warnings) {
  const be = ctx.beskillById.get(PET_BESKILL.FLOWER_GUARD);
  if (!be) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${PET_BESKILL.FLOWER_GUARD} 缺失` });
  pushPassiveBeskill(fixedBuffs, PET_BESKILL.FLOWER_GUARD, be?.name || "仙花守护", `登场触发仙花守护效果，后续冷却${be ? round(be.cd / BATTLE_FRAMES_PER_SECOND) : "?"}s`);

  const vskill = ctx.skillById.get(PET_SKILL.FLOWER_PASSIVE_VSKILL);
  if (!vskill) {
    warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `skill ${PET_SKILL.FLOWER_PASSIVE_VSKILL} 不在 skill 表` });
    return;
  }
  const cfg = resolvePetCfgFile(vskill, pet, ctx, warnings);
  const refs = eng.scanBuffs(vskill, cfg.actionCfg, ctx.beskillById, warnings);
  for (const ref of refs) {
    const g1 = eng.resolveBuffGrowth(ref.baseBuffId, 1, ctx.buffById, warnings);
    if (g1.buff) pushFixedBuff(fixedBuffs, displaySkillId, ref.baseBuffId, g1.buff, "passiveEffect", ctx, warnings, null);
  }
}

function collectButterflyFlyPassive(displaySkillId, fixedBuffs, ctx, warnings) {
  const be = ctx.beskillById.get(PET_BESKILL.BUTTERFLY_FLY);
  if (!be) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${PET_BESKILL.BUTTERFLY_FLY} 缺失` });
  pushPassiveBeskill(
    fixedBuffs,
    PET_BESKILL.BUTTERFLY_FLY,
    be?.name || "轻盈飞舞",
    "可切换飞行态：替换飞行动作、普攻与主动技能。",
  );
  pushFixedBuff(fixedBuffs, displaySkillId, PET_BUFF.BUTTERFLY_FLY_DAMAGE_UP, ctx.buffById.get(PET_BUFF.BUTTERFLY_FLY_DAMAGE_UP), "passiveEffect", ctx, warnings, null);
}

function collectButterflyBadLuckPassive(displaySkillId, pet, fixedBuffs, ctx, warnings) {
  const be = ctx.beskillById.get(PET_BESKILL.BUTTERFLY_BAD_LUCK);
  if (!be) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${PET_BESKILL.BUTTERFLY_BAD_LUCK} 缺失` });
  pushPassiveBeskill(fixedBuffs, PET_BESKILL.BUTTERFLY_BAD_LUCK, be?.name || "不吉诅咒", `登场后${be ? round(be.initCd / BATTLE_FRAMES_PER_SECOND) : "?"}s触发，后续冷却${be ? round(be.cd / BATTLE_FRAMES_PER_SECOND) : "?"}s`);

  const vskill = ctx.skillById.get(PET_SKILL.BUTTERFLY_PASSIVE_BAD_LUCK_VSKILL);
  if (!vskill) {
    warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `skill ${PET_SKILL.BUTTERFLY_PASSIVE_BAD_LUCK_VSKILL} 不在 skill 表` });
    return;
  }
  const cfg = resolvePetCfgFile(vskill, pet, ctx, warnings);
  const refs = eng.scanBuffs(vskill, cfg.actionCfg, ctx.beskillById, warnings);
  for (const ref of refs) {
    const g1 = eng.resolveBuffGrowth(ref.baseBuffId, 1, ctx.buffById, warnings);
    if (g1.buff) pushFixedBuff(fixedBuffs, displaySkillId, ref.baseBuffId, g1.buff, "passiveEffect", ctx, warnings, null);
  }
}

function collectFoxPassive(displaySkillId, fixedBuffs, ctx, warnings) {
  const replace = ctx.beskillById.get(PET_BESKILL.FOX_REPLACE_FREEZE);
  const damage = ctx.beskillById.get(PET_BESKILL.FOX_FREEZE_DAMAGE);
  if (!replace) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${PET_BESKILL.FOX_REPLACE_FREEZE} 缺失` });
  if (!damage) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${PET_BESKILL.FOX_FREEZE_DAMAGE} 缺失` });
  pushPassiveBeskill(fixedBuffs, PET_BESKILL.FOX_REPLACE_FREEZE, replace?.name || "霜冻强化", "普通冰冻替换为强化冰冻，控制时间从3s延长至5s。");
  pushPassiveBeskill(fixedBuffs, PET_BESKILL.FOX_FREEZE_DAMAGE, damage?.name || "冰冻目标增伤", "对冰冻类目标造成伤害提升25%。");
  pushFixedBuff(fixedBuffs, displaySkillId, PET_BUFF.FOX_FREEZE, ctx.buffById.get(PET_BUFF.FOX_FREEZE), "passiveEffect", ctx, warnings, null);
  pushFixedBuff(fixedBuffs, displaySkillId, PET_BUFF.FOX_FREEZE_STRONG, ctx.buffById.get(PET_BUFF.FOX_FREEZE_STRONG), "passiveEffect", ctx, warnings, null);
}

function collectSacredFoxFrostPassive(displaySkillId, fixedBuffs, ctx, warnings) {
  const replace = ctx.beskillById.get(PET_BESKILL.SACRED_FOX_REPLACE_FREEZE);
  const damage = ctx.beskillById.get(PET_BESKILL.SACRED_FOX_FREEZE_DAMAGE);
  if (!replace) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${PET_BESKILL.SACRED_FOX_REPLACE_FREEZE} 缺失` });
  if (!damage) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${PET_BESKILL.SACRED_FOX_FREEZE_DAMAGE} 缺失` });
  pushPassiveBeskill(fixedBuffs, PET_BESKILL.SACRED_FOX_REPLACE_FREEZE, "霜冻强化", "普通冰冻替换为强化冰冻，控制时间从3秒延长至5秒。");
  pushPassiveBeskill(fixedBuffs, PET_BESKILL.SACRED_FOX_FREEZE_DAMAGE, "冰冻目标增伤", "对冰冻目标造成的伤害提升25%。");
  pushFixedBuff(fixedBuffs, displaySkillId, PET_BUFF.FOX_FREEZE, ctx.buffById.get(PET_BUFF.FOX_FREEZE), "passiveEffect", ctx, warnings, null);
  pushFixedBuff(fixedBuffs, displaySkillId, PET_BUFF.FOX_FREEZE_STRONG, ctx.buffById.get(PET_BUFF.FOX_FREEZE_STRONG), "passiveEffect", ctx, warnings, null);
}

function collectSacredFoxFlyPassive(displaySkillId, fixedBuffs, ctx, warnings) {
  const fly = ctx.beskillById.get(PET_BESKILL.SACRED_FOX_FLY);
  const summonFly = ctx.beskillById.get(PET_BESKILL.SACRED_FOX_SUMMON_FLY);
  if (!fly) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${PET_BESKILL.SACRED_FOX_FLY} 缺失` });
  if (!summonFly) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${PET_BESKILL.SACRED_FOX_SUMMON_FLY} 缺失` });
  pushPassiveBeskill(
    fixedBuffs,
    PET_BESKILL.SACRED_FOX_FLY,
    "踏雪凌虚",
    "仅PVE可开关；开启后圣冰天狐与冰狐战士切换为飞行姿态。",
  );
  pushFixedBuff(fixedBuffs, displaySkillId, PET_BUFF.SACRED_FOX_FLY_DAMAGE_UP, ctx.buffById.get(PET_BUFF.SACRED_FOX_FLY_DAMAGE_UP), "passiveEffect", ctx, warnings, null);
}

function collectSacredFoxSummonEffects(displaySkillId, pet, ctx, warnings) {
  const out = [];
  const skill = ctx.skillById.get(displaySkillId);
  const cfg = skill ? resolvePetCfgFile(skill, pet, ctx, warnings) : null;
  const summon = cfg?.actionCfg?.com?.find((com) => com.type === 13);
  const monsterId = asArray(summon?.mIds)[0];
  const monster = ctx.monsterById.get(monsterId);
  const attackSkillId = asArray(monster?.atkIds)[0];
  const attackSkill = ctx.skillById.get(attackSkillId);
  const attackRow = attackSkill ? ctx.skillLevelById.get(eng.skillLevelRowId(attackSkill, 1)) : null;
  const attackCfg = monster ? eng.loadEntityCfg(monster.cfgFile) : null;
  const attackActionCfg = attackSkill?.entityAction ? attackCfg?.[attackSkill.entityAction] : null;
  const attackDamage = attackSkill && attackRow
    ? eng.computeDamageSegments(attackSkill, attackRow, attackActionCfg, warnings)
    : null;
  const attackHitCount = attackDamage?.segments?.reduce((sum, segment) => sum + (segment.maxHit || 1), 0) ?? null;
  const attackTotalPer = typeof attackRow?.damageAddPer === "number" && typeof attackHitCount === "number"
    ? attackRow.damageAddPer * attackHitCount
    : attackDamage?.totalPer;
  const attackRelease = attackSkill
    ? eng.resolveReleaseTime(attackCfg, attackSkill.entityAction, Boolean(attackActionCfg), warnings)
    : null;
  const shieldSkillId = asArray(monster?.initVskill)[0];
  const shieldSkill = ctx.skillById.get(shieldSkillId);
  const shieldActionCfg = shieldSkill?.entityAction ? attackCfg?.[shieldSkill.entityAction] : null;
  const shieldBuffId = asArray(shieldActionCfg?.com?.find((com) => com.type === 1)?.buff)[0];
  const shieldBuff = ctx.buffById.get(shieldBuffId);
  const armorBuff = ctx.buffById.get(asArray(shieldBuff?.attachBuff)[0]);
  const shieldPer = Array.isArray(shieldBuff?.value) && typeof shieldBuff.value[3] === "number"
    ? shieldBuff.value[3]
    : null;
  if (!summon) warnings.push({ code: eng.WARN.MISSING_ACTION_CFG, detail: `skill ${displaySkillId} 未解析到召唤动作` });
  if (!monster) warnings.push({ code: eng.WARN.MISSING_ENTITY_CFG, detail: `skill ${displaySkillId} 未解析到召唤物` });
  if (!attackSkill || !attackRow) warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `召唤物 ${monsterId ?? "?"} 未解析到普攻` });
  if (!shieldSkill) warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `召唤物 ${monsterId ?? "?"} 未解析到登场护盾技能` });
  if (shieldSkill && !shieldActionCfg) warnings.push({ code: eng.WARN.MISSING_ACTION_CFG, detail: `召唤物护盾技能 ${shieldSkillId} 未解析到动作配置` });
  if (shieldActionCfg && !shieldBuff) warnings.push({ code: eng.WARN.MISSING_BUFF, detail: `召唤物护盾技能 ${shieldSkillId} 未解析到护盾效果` });

  const durationText = summon?.time === -1
    ? "无持续时间限制"
    : (typeof summon?.time === "number" ? `持续${formatNumber(summon.time / BATTLE_FRAMES_PER_SECOND, 3)}秒` : "持续时间未解析");
  out.push({
    baseBuffId: displaySkillId,
    name: "冰狐战士召唤",
    text: null,
    time: summon?.time ?? null,
    bindSource: "mechanismEffect",
    bindLabel: BIND_SOURCE_LABEL.mechanismEffect,
    value: null,
    displayText: `召唤冰狐战士，最多同时存在${summon?.maxCount ?? "?"}只，${durationText}。`,
  });
  out.push({
    baseBuffId: attackSkillId || PET_SKILL.SACRED_FOX_SUMMON_ATTACK,
    name: "冰狐战士普攻",
    text: null,
    time: -1,
    bindSource: "mechanismEffect",
    bindLabel: BIND_SOURCE_LABEL.mechanismEffect,
    value: null,
    displayText: `爪击共${attackHitCount ?? "?"}段，每段系数${formatNumber(attackRow?.damageAddPer)}，总系数${formatNumber(attackTotalPer)}，释放用时${formatNumber(attackRelease?.releaseSeconds, 3)}秒。`,
  });
  if (shieldBuff) {
    const shieldPercent = typeof shieldPer === "number" ? formatNumber(shieldPer * 100, 1) : "?";
    const totalDurabilityPercent = typeof shieldPer === "number" ? formatNumber((1 + shieldPer) * 100, 1) : "?";
    out.push({
      baseBuffId: shieldBuffId || PET_BUFF.SACRED_FOX_SUMMON_SHIELD,
      name: "冰狐战士寒冰盾",
      text: shieldBuff.text || null,
      time: shieldBuff.time ?? null,
      bindSource: "mechanismEffect",
      bindLabel: BIND_SOURCE_LABEL.mechanismEffect,
      value: { maxHpPer: shieldPer },
      displayText: `冰狐战士登场时获得相当于自身最大生命${shieldPercent}%的寒冰盾，连同本体生命，未计防御时总承伤池相当于自身最大生命${totalDurabilityPercent}%；护盾无持续时间限制，只在登场时获得且不会自行恢复；${armorBuff?.type === 23 && armorBuff?.qualified === 1
        ? "该霸体仅在登场护盾技能期间生效，技能结束后清除。"
        : armorBuff?.type === 23
          ? "护盾存在期间附加霸体，护盾消失时霸体一并移除。"
          : "寒冰盾不提供霸体。"}`,
    });
  }
  return out;
}

function collectSacredFoxSummonMechanics(ctx, warnings) {
  const summonParams = ctx.constByKey.get("bingbingCallMonsterParams");
  const shieldBuff = ctx.buffById.get(PET_BUFF.SACRED_FOX_SUMMON_SHIELD);
  const armorBuffId = asArray(shieldBuff?.attachBuff)[0];
  const armorBuff = ctx.buffById.get(armorBuffId);
  if (!summonParams) warnings.push({ code: eng.WARN.MISSING_ENTITY_CFG, detail: "未解析到冰狐战士专属召唤属性公式" });
  if (shieldBuff?.attachBuff && !armorBuff) warnings.push({ code: eng.WARN.MISSING_BUFF, detail: `寒冰盾附加效果 ${armorBuffId ?? "?"} 缺失` });

  return [
    {
      label: "属性继承",
      value: "生命、攻击、回血、穿透和减伤分别取圣冰天狐对应属性的33.33%，再加上成长数值中的召唤固定值，最终整体向上取整。召唤固定值按冰心化灵技能等级的5倍读取基准：生命、回血取基准的66.67%，攻击、穿透、减伤取基准的100%；表中固定值已换算并四舍五入保留整数，实际结算仍使用未取整值。表格未列出的属性：防御、命中、闪避、暴击、韧性、幸运、守护按怪物表系数1从本体继承（约100%）；速度不继承本体，使用冰狐战士固定值264；mp与healMp为0。召唤创建时会先按怪物表source=2拷贝属性（生命表值0.18会先写成18%），再由hpType=7公式覆盖上述5项。",
    },
    {
      label: "寒冰盾与霸体",
      value: armorBuff?.type === 23 && armorBuff?.qualified === 1
        ? "数据层让寒冰盾附加霸体 Buff，但该 Buff 被标记为技能限定，会在召唤物的登场护盾技能结束时清除；护盾后续不会重新赋予霸体。"
        : armorBuff?.type === 23
          ? "数据层让寒冰盾附加霸体 Buff，附加效果绑定在护盾上；护盾存在期间冰狐战士处于霸体，护盾消失时霸体一并移除。"
          : "寒冰盾不提供霸体，实战中冰狐战士仍会受到攻击硬直。",
    },
  ];
}

function collectSacredFoxSummonLevelMetrics(displaySkillId, level, ctx, warnings) {
  if (displaySkillId !== PET_SKILL.SACRED_FOX_SKILL_2) return [];
  const summonParams = ctx.constByKey.get("bingbingCallMonsterParams");
  const standardLevel = level * 5;
  const standard = ctx.expByLevel.get(standardLevel);
  if (!summonParams || !standard) {
    const detail = !summonParams
      ? "未解析到冰狐战士专属召唤属性公式"
      : `exp ${standardLevel} 未解析到召唤属性基准`;
    if (!warnings.some((warning) => warning.code === "SACRED_FOX_SUMMON_STANDARD_MISSING" && warning.detail === detail)) {
      warnings.push({ code: "SACRED_FOX_SUMMON_STANDARD_MISSING", detail });
    }
    return [];
  }

  return SACRED_FOX_SUMMON_METRICS.map((def) => {
    const influenceRatio = summonParams[def.influenceKey];
    const standardRatio = summonParams[def.standardKey];
    const standardValue = standard[def.expKey];
    if (![influenceRatio, standardRatio, standardValue].every((value) => typeof value === "number" && Number.isFinite(value))) {
      return { key: def.key, label: def.label, value: null, display: null };
    }
    const fixedValue = Math.round(standardValue * standardRatio);
    return {
      key: def.key,
      label: def.label,
      value: fixedValue,
      display: formatNumber(fixedValue, 0),
    };
  });
}

function collectSacredFoxRockMechanics(ctx, warnings) {
  const charge = ctx.beskillById.get(PET_BESKILL.SACRED_FOX_ROCK_CHARGE);
  const scaleDamage = ctx.beskillById.get(PET_BESKILL.SACRED_FOX_ROCK_SCALE_DAMAGE);
  const frozenRelease = ctx.beskillById.get(PET_BESKILL.SACRED_FOX_ROCK_FROZEN_RELEASE);
  const timeoutRelease = ctx.beskillById.get(PET_BESKILL.SACRED_FOX_ROCK_TIMEOUT_RELEASE);
  const rockBreak = ctx.beskillById.get(PET_BESKILL.SACRED_FOX_ROCK_BREAK);
  const frozenDamage = ctx.beskillById.get(PET_BESKILL.SACRED_FOX_FREEZE_DAMAGE);
  for (const [id, row] of [
    [PET_BESKILL.SACRED_FOX_ROCK_CHARGE, charge],
    [PET_BESKILL.SACRED_FOX_ROCK_SCALE_DAMAGE, scaleDamage],
    [PET_BESKILL.SACRED_FOX_ROCK_FROZEN_RELEASE, frozenRelease],
    [PET_BESKILL.SACRED_FOX_ROCK_TIMEOUT_RELEASE, timeoutRelease],
    [PET_BESKILL.SACRED_FOX_ROCK_BREAK, rockBreak],
  ]) {
    if (!row) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${id} 缺失` });
  }

  const addScale = charge?.attribute?.addScale || {};
  const skillCaps = charge?.attribute?.skillIdMaxScale || {};
  const maxScale = charge?.attribute?.maxScale;
  const minScale = scaleDamage?.attribute?.minScale;
  const frozenScale = frozenRelease?.scopeParam?.judgeMeCondition?.find((item) => item.name === "bulletScaleMore")?.param?.scale;
  const timeout = timeoutRelease?.scopeParam?.judgeMeCondition?.find((item) => item.name === "bulletTimeMore")?.param?.time;
  const breakPer = rockBreak?.attribute?.per;
  const frozenPer = frozenDamage?.attribute?.value?.[0];
  const rockSkill = ctx.skillById.get(PET_SKILL.SACRED_FOX_SKILL_4);
  const rockRow = rockSkill ? ctx.skillLevelById.get(eng.skillLevelRowId(rockSkill, 1)) : null;
  const skillCd = rockSkill?.cd;
  const noRockBehavior = ctx.behaviorById.get(SACRED_FOX_ROCK_AI.noRockBehaviorId);
  const blockingBulletIds = asArray(noRockBehavior?.value?.bIds);
  const hasHoldingLock = noRockBehavior?.name === "IsNoHaveBullet"
    && SACRED_FOX_ROCK_AI.expectedBlockingBulletIds.every((id) => blockingBulletIds.includes(id));
  const heldBullet = eng.getBullet(SACRED_FOX_ROCK_AI.heldBulletId, warnings);
  const heldBulletLastsToTimeout = typeof heldBullet?.maxTime === "number"
    && typeof timeout === "number"
    && heldBullet.maxTime >= timeout;
  if (!hasHoldingLock) {
    warnings.push({
      code: "SACRED_FOX_ROCK_AI_LOCK_MISMATCH",
      detail: `behavior ${SACRED_FOX_ROCK_AI.noRockBehaviorId} 未匹配生成态/持有态巨岩限制`,
    });
  }
  if (!heldBulletLastsToTimeout) {
    warnings.push({
      code: "SACRED_FOX_ROCK_LIFETIME_MISMATCH",
      detail: `bullet ${SACRED_FOX_ROCK_AI.heldBulletId} 持续时间不足以覆盖 ${timeout ?? "?"} 秒超时条件`,
    });
  }
  const damageFactor = typeof maxScale === "number" && typeof minScale === "number" ? maxScale / minScale : null;
  const basePer = typeof rockRow?.damageAddPer === "number" ? rockRow.damageAddPer : null;
  const breakTotalPer = basePer != null && typeof breakPer === "number" ? basePer * (1 + breakPer) : null;
  const frozenBreakTotalPer = breakTotalPer != null && typeof frozenPer === "number" ? breakTotalPer * (1 + frozenPer) : null;
  const maxBonusFactor = damageFactor != null ? damageFactor - 1 : null;
  const unreachableFullBonusScale = typeof minScale === "number" ? minScale * 2 : null;
  const timeoutCycle = typeof skillCd === "number" && typeof timeout === "number"
    ? Math.max(skillCd, timeout)
    : null;
  const scaleMultiplier = (scale) => (typeof minScale === "number" ? Math.max(1, scale / minScale) : null);
  const correctionFor = (scale, cycle) => {
    const multiplier = scaleMultiplier(scale);
    if (multiplier == null || typeof cycle !== "number" || cycle <= 0) return null;
    return SACRED_FOX_ROCK_AI.baseSolidDamageX * multiplier / cycle * 100;
  };
  const scaleFactors = typeof maxScale === "number"
    ? Array.from({ length: Math.max(0, Math.floor(maxScale)) }, (_, index) => {
      const scale = index + 1;
      return `${formatNumber(scale)}尺寸=${formatNumber((scaleMultiplier(scale) ?? 0) * 100, 2)}%固伤`;
    }).join("、")
    : "";
  const staticCorrectionFactors = typeof maxScale === "number" && typeof skillCd === "number"
    ? Array.from({ length: Math.max(0, Math.floor(maxScale)) }, (_, index) => {
      const scale = index + 1;
      return `${formatNumber(scale)}尺寸=${formatNumber(correctionFor(scale, skillCd), 2)}%`;
    }).join("、")
    : "";
  const timeoutCorrectionFactors = typeof maxScale === "number" && timeoutCycle != null
    ? Array.from({ length: Math.max(0, Math.floor(maxScale)) }, (_, index) => {
      const scale = index + 1;
      return `${formatNumber(scale)}尺寸=${formatNumber(correctionFor(scale, timeoutCycle), 2)}%`;
    }).join("、")
    : "";
  const fullCorrectionCycleLimits = typeof maxScale === "number"
    ? Array.from({ length: Math.max(0, Math.floor(maxScale)) }, (_, index) => {
      const scale = index + 1;
      return `${formatNumber(scale)}尺寸=${formatNumber(SACRED_FOX_ROCK_AI.baseSolidDamageX * (scaleMultiplier(scale) ?? 0), 2)}秒`;
    }).join("、")
    : "";
  const frozenStaticCorrection = typeof frozenScale === "number" && typeof skillCd === "number"
    ? correctionFor(frozenScale, skillCd)
    : null;
  const maxStaticCorrection = typeof maxScale === "number" && typeof skillCd === "number"
    ? correctionFor(maxScale, skillCd)
    : null;

  const chargeText = [
    [PET_SKILL.SACRED_FOX_ATTACK, "冰晶球"],
    [PET_SKILL.SACRED_FOX_SKILL_1, "冰雪玉盘"],
    [PET_SKILL.SACRED_FOX_SKILL_3, "冰雪风暴"],
    [PET_SKILL.SACRED_FOX_SP, "极冰九刺"],
  ].map(([skillId, name]) => `${name}每段增加${formatNumber(addScale[skillId])}尺寸，单次最多增加${formatNumber(skillCaps[skillId])}`).join("；");

  return [
    { label: "充能规则", value: `巨岩初始尺寸为1。${chargeText}。巨岩尺寸上限为${formatNumber(maxScale)}。` },
    { label: "投出条件", value: `巨岩存在${formatNumber(timeout)}秒后按当时尺寸投向最近敌人；尺寸达到${formatNumber(frozenScale)}且附近存在冰冻敌人时，会立即提前投向该目标，不会继续等待尺寸上限。` },
    { label: "再释放限制", value: `技能表冷却为${formatNumber(skillCd)}秒，但场上还有正在生成或持有的巨岩时，本技能不会再次生成巨岩。持有态巨岩会一直存在到提前投出或${formatNumber(timeout)}秒超时投出，因此实际生成间隔至少取${formatNumber(skillCd)}秒冷却和本轮巨岩持有时间中的较长者；没有冰冻目标触发提前投出时，间隔约为${formatNumber(timeoutCycle)}秒，而不是${formatNumber(skillCd)}秒。` },
    { label: "尺寸倍率", value: `充能只放大技能等级固伤，基础${formatNumber(basePer)}倍攻击系数始终不变。尺寸低于${formatNumber(minScale)}时仍按基础固伤100%结算；达到后按“尺寸÷${formatNumber(minScale)}”结算，${scaleFactors}。` },
    { label: "破冰", value: `命中冰冻目标时，霜冻强化先将主伤害提高${formatNumber(typeof frozenPer === "number" ? frozenPer * 100 : null, 1)}%，再额外造成最终主伤害${formatNumber(typeof breakPer === "number" ? breakPer * 100 : null, 1)}%的破冰伤害并移除冰冻。攻击系数未计霜冻强化时为${formatNumber(breakTotalPer)}，计入后为${formatNumber(frozenBreakTotalPer)}；充能仍只改变固伤部分。` },
    { label: "15秒静态修正", value: `按技能表的${formatNumber(SACRED_FOX_ROCK_AI.baseSolidDamageX)}X基础固伤和${formatNumber(skillCd)}秒冷却计算，主固伤修正为${staticCorrectionFactors}。这只是配置静态值，只有巨岩最晚在${formatNumber(skillCd)}秒时投出、下一轮确实由冷却限制时才能兑现；并非无条件实战值。计入破冰、冰冻增伤加破冰后，尺寸${formatNumber(frozenScale)}分别为${formatNumber(frozenStaticCorrection, 2)}%、${formatNumber(frozenStaticCorrection != null && typeof breakPer === "number" ? frozenStaticCorrection * (1 + breakPer) : null, 2)}%、${formatNumber(frozenStaticCorrection != null && typeof breakPer === "number" && typeof frozenPer === "number" ? frozenStaticCorrection * (1 + breakPer) * (1 + frozenPer) : null, 2)}%；尺寸${formatNumber(maxScale)}分别为${formatNumber(maxStaticCorrection, 2)}%、${formatNumber(maxStaticCorrection != null && typeof breakPer === "number" ? maxStaticCorrection * (1 + breakPer) : null, 2)}%、${formatNumber(maxStaticCorrection != null && typeof breakPer === "number" && typeof frozenPer === "number" ? maxStaticCorrection * (1 + breakPer) * (1 + frozenPer) : null, 2)}%。尺寸${formatNumber(maxScale)}只比尺寸1至${formatNumber(frozenScale)}高${formatNumber(maxBonusFactor != null ? maxBonusFactor * 100 : null, 2)}个百分点；若把“满充”理解为额外增加100个百分点、总修正200%，则需要尺寸${formatNumber(unreachableFullBonusScale)}，超过配置上限。` },
    { label: "30秒超时修正", value: `没有冰冻目标触发提前投出时，巨岩持有到${formatNumber(timeout)}秒才投出，主固伤按约${formatNumber(timeoutCycle)}秒一轮计算：${timeoutCorrectionFactors}。所以尺寸${formatNumber(maxScale)}即使充满，主固伤实战修正也只有${formatNumber(correctionFor(maxScale, timeoutCycle), 2)}%，达不到100%。换算成达到100%主固伤实战修正的最晚投出时间，${fullCorrectionCycleLimits}；超过对应时间就低于100%。` },
    { label: "战斗统计", value: `伤害报告中的20420040402是冰冻条件提前投出；破冰额外伤害沿用同一技能编号，因此成功破冰时一次投掷通常记为2次。20420040403是${formatNumber(timeout)}秒超时投出，未触发破冰时一次投掷通常记为1次。报告里的“次”不能直接当作释放次数，前者通常要除以2后再与后者相加。` },
    { label: "实战口径", value: `任意持有时间下，实际主固伤修正等于15秒静态修正乘以“${formatNumber(skillCd)}÷实际生成间隔”；实际生成间隔不会短于${formatNumber(skillCd)}秒。固伤修正只比较技能等级固伤与周期，不代表整段最终伤害，也不等于战斗统计占比；比较实测时还需把多段技能的命中次数换算为完整释放次数，并计入攻击系数、实际投出次数、目标防御和增减伤。` },
  ];
}

function collectSkillMechanics(displaySkillId, ctx, warnings) {
  if (displaySkillId === PET_SKILL.SACRED_FOX_SKILL_2) return collectSacredFoxSummonMechanics(ctx, warnings);
  if (displaySkillId === PET_SKILL.SACRED_FOX_SKILL_4) return collectSacredFoxRockMechanics(ctx, warnings);
  return [];
}

function collectGuideEffects(displaySkillId, pet, ctx, warnings) {
  const out = [];
  if (displaySkillId === PET_SKILL.FOX_SKILL_2) {
    const skill = ctx.skillById.get(displaySkillId);
    const cfg = skill ? resolvePetCfgFile(skill, pet, ctx, warnings) : null;
    const summon = cfg?.actionCfg?.com?.find((com) => com.type === 13);
    out.push({
      baseBuffId: displaySkillId,
      name: "冰心狐狸召唤",
      text: "攻略补充",
      time: -1,
      bindSource: "guideEffect",
      bindLabel: BIND_SOURCE_LABEL.guideEffect,
      value: null,
      displayText: "召唤冰心狐狸；攻略说明普攻系数1.8，生命继承本体18%，其他属性100%继承",
    });
  }
  if (displaySkillId === PET_SKILL.FOX_SKILL_3) {
    out.push({
      baseBuffId: displaySkillId,
      name: "冰雪风暴无敌",
      text: "攻略补充",
      time: -1,
      bindSource: "guideEffect",
      bindLabel: BIND_SOURCE_LABEL.guideEffect,
      value: null,
      displayText: "释放期间保持无敌状态；后摇不包含在无敌内",
    });
  }
  if (displaySkillId === PET_SKILL.SACRED_FOX_SKILL_2) {
    out.push(...collectSacredFoxSummonEffects(displaySkillId, pet, ctx, warnings));
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

  if (slotKind === "passive" && displaySkillId === PET_SKILL.FLOWER_PASSIVE) collectFlowerPassive(displaySkillId, pet, fixedBuffs, ctx, warnings);
  if (slotKind === "passive" && displaySkillId === PET_SKILL.BUTTERFLY_PASSIVE_FLY) collectButterflyFlyPassive(displaySkillId, fixedBuffs, ctx, warnings);
  if (slotKind === "passive" && displaySkillId === PET_SKILL.BUTTERFLY_PASSIVE_BAD_LUCK) collectButterflyBadLuckPassive(displaySkillId, pet, fixedBuffs, ctx, warnings);
  if (slotKind === "passive" && displaySkillId === PET_SKILL.FOX_PASSIVE) collectFoxPassive(displaySkillId, fixedBuffs, ctx, warnings);
  if (slotKind === "passive" && displaySkillId === PET_SKILL.SACRED_FOX_PASSIVE_FROST) collectSacredFoxFrostPassive(displaySkillId, fixedBuffs, ctx, warnings);
  if (slotKind === "passive" && displaySkillId === PET_SKILL.SACRED_FOX_PASSIVE_FLY) collectSacredFoxFlyPassive(displaySkillId, fixedBuffs, ctx, warnings);

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

function computePatchedLevel(displaySkillId, level, ctx, warnings) {
  const def = DAMAGE_PATCHES.get(displaySkillId);
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
  if (DAMAGE_PATCHES.has(displaySkillId)) return computePatchedLevel(displaySkillId, level, ctx, warnings);
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
  const cfg = slotKind === "passive"
    ? { cfgFileResolved: null, cfgResolveSource: "passive", hasActionCfg: false, actionCfg: null, entityCfg: null }
    : resolvePetCfgFile(skill, pet, ctx, warnings);
  const maxLevel = detectDisplayMaxLevel(displaySkillId, concreteIds, slotKind, ctx);
  const rel = slotKind === "passive"
    ? { releaseFrames: null, releaseSeconds: null, releaseTimeSource: "effectOnly" }
    : resolvePetReleaseTime(displaySkillId, cfg, skill, warnings);
  const { fixedBuffs, growthBuffRefs } = collectBuffs(displaySkillId, concreteIds, pet, slotKind, ctx, warnings);
  const skillMechanics = collectSkillMechanics(displaySkillId, ctx, warnings);

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
      mechanics: skillMechanics,
      metrics: metrics.computeMetrics(
        ctx.metricDefs, "header",
        { skillId: displaySkillId, totalPer: reference ? reference.totalPer : null, releaseSeconds: rel.releaseSeconds, segCount },
        ctx.helpers, warnings,
      ),
    },
    maxLevel,
    slotLabel,
    slotKind,
    levels: levels.map((l) => {
      const levelMetrics = metrics.computeMetrics(
        ctx.metricDefs, "level",
        { skillId: displaySkillId, level: l.level, roleLevel: l.roleLevel, consumeMp: l.consumeMp, totalPer: l.totalPer, totalVal: l.totalVal, growthBuffs: l.growthBuffs || [], releaseSeconds: rel.releaseSeconds, segCount: l.segments.reduce((sum, s) => sum + (s.maxHit || 1), 0) },
        ctx.helpers, l.level === 1 ? warnings : [],
      );
      levelMetrics.push(...collectSacredFoxSummonLevelMetrics(displaySkillId, l.level, ctx, warnings));
      return {
        level: l.level,
        roleLevel: l.roleLevel,
        consumeMp: l.consumeMp,
        soulCost: l.soulCost,
        segmentVals: l.segments.map((s) => ({ val: s.val, maxHit: s.maxHit })),
        totalPer: l.totalPer,
        totalVal: l.totalVal,
        growthBuffs: l.growthBuffs || [],
        metrics: levelMetrics,
      };
    }),
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
  console.log("\n🌸 宠物技能 Wiki → 神霄花仙/玄蝶仙子/千年冰狐/圣冰天狐");

  const ctx = {
    petById: idx(u.loadTable("pet")),
    skillById: idx(u.loadTable("skill")),
    skillLevelById: idx(u.loadTable("skillLevel")),
    monsterById: idx(u.loadTable("monster")),
    buffById: idx(u.loadTable("buff")),
    beskillById: idx(u.loadTable("beskill")),
    behaviorById: idx(u.loadTable("behavior")),
    expByLevel: idx(u.loadTable("exp")),
    constByKey: new Map(u.loadTable("consts").map((row) => [row.key, row.value])),
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
      key: "huadiehubing",
      name: "神霄花仙/玄蝶仙子/千年冰狐/圣冰天狐",
      guidePath: GUIDE_PATH,
      petIds: PET_IDS,
      note: "宠物技能 Wiki 使用满级作为卡片表头参考值，逐级成长见下方成长数值表；花仙治疗、玄蝶恶咒、冰狐与圣冰天狐的多段技能按攻略或实际动作链重组，圣冰天狐额外展示召唤物寒冰盾、巨岩充能、破冰与飞行机制。",
    },
    variants,
  };

  u.saveOutput("pet_wiki_huadiehubing", payload, {
    system: "pet_wiki",
    sourceFiles: ["pet.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "beskill.*.json", "behavior.*.json", "buff.*.json", "consts.*.json", "exp.*.json", "bullets.json", "entityCtg/*.json", "data/runtime/main-index.js", "aiCfg:2042004", GUIDE_PATH],
    note: "神霄花仙/玄蝶仙子/千年冰狐/圣冰天狐宠物技能 Wiki，包括普攻、主动技能、无双、被动、治疗、召唤、护盾、充能、破冰和减益效果。",
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
