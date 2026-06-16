/**
 * 宠物技能 Wiki - 麒麟提取脚本
 *
 * 宠物入口从 pet.skillActive/skillPassive/skillSp 和 pet.monsterId 取展示技能；
 * 普攻从宠物 monster.atkIds 取。伤害、释放时间、buff 成长继续走 skill ->
 * skillLevel -> entityCtg/bullets -> buff/beskill 的链路。
 *
 * 麒麟的主技能大量通过 entityCtg.skillLink 串联，skill 表本身没有
 * otherSkill/connectSkill。展示时显式列出链路，只把有真实伤害数值的
 * 子技能计入伤害，避免把蓄力/护盾阶段的占位 1 当成成长固伤。
 */
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");

const PET_OVERRIDE = "qilin";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const BATTLE_FRAMES_PER_SECOND = 30;
const GUIDE_PATH = null;
const PET_IDS = [190000183];

const PET_SKILL = {
  YOUNG_ATTACK: 20419010001,
  ATTACK: 20419020001,
  YOUNG_SKILL_1: 20419010101,
  YOUNG_SKILL_1_MID: 20419010102,
  YOUNG_SKILL_1_HIT: 20419010103,
  YOUNG_SKILL_2: 20419010201,
  SKILL_1: 20419020101,
  SKILL_1_MID: 20419020102,
  SKILL_1_HIT: 20419020103,
  SKILL_2: 20419020201,
  SKILL_3: 20419020301,
  SKILL_3_MID: 20419020302,
  SKILL_3_HIT: 20419020303,
  SKILL_4: 20419020401,
  SKILL_4_2: 20419020402,
  SKILL_4_3: 20419020403,
  SKILL_4_4: 20419020404,
  SKILL_4_HIT: 20419020405,
  SP: 20419020501,
  SP_2: 20419020502,
  SP_HIT: 20419020503,
  PASSIVE_FLY_GENERAL: 20419020601,
  PASSIVE_FLY_SAINT: 20419020602,
  PASSIVE_DODGE_ARMOR: 20419020701,
};

const PET_BUFF = {
  FLY_DAMAGE_TAKEN: 14017501,
  SHIELD: 13008201,
  STUN: 3011201,
  DODGE_UP: 8008101,
  SLOW: 4067301,
  CONTROL_IMMUNE: 146000401,
  MOVE_IMMUNE: 131000401,
  FLOAT_IMMUNE: 24000701,
  GRAB_IMMUNE: 221000201,
  DEBUFF_IMMUNE: 41001901,
  DODGE_FIELD: 127000801,
  ARMOR_FIELD: 127000901,
  FIELD_VALUE_BASE: 8008001,
  SUPER_ARMOR: 23005401,
  DISPLACE_DOWN: 255003001,
};

const PET_BESKILL = {
  FLY_GENERAL: 7080213,
  FLY_SAINT: 7080214,
  DODGE_UP_GENERAL: 7080302,
  DODGE_UP_SAINT: 7080402,
  ARMOR_DAMAGE_DOWN: 7080209,
  ARMOR_DOT_DOWN: 7080210,
  ARMOR_CONTROL_DOWN: 7080211,
  ARMOR_NO_DODGE: 7080403,
};

const SPECIAL_CONCRETE_SKILLS = new Map([
  [PET_SKILL.YOUNG_SKILL_1, [PET_SKILL.YOUNG_SKILL_1, PET_SKILL.YOUNG_SKILL_1_MID, PET_SKILL.YOUNG_SKILL_1_HIT]],
  [PET_SKILL.SKILL_1, [PET_SKILL.SKILL_1, PET_SKILL.SKILL_1_MID, PET_SKILL.SKILL_1_HIT]],
  [PET_SKILL.SKILL_3, [PET_SKILL.SKILL_3, PET_SKILL.SKILL_3_MID, PET_SKILL.SKILL_3_HIT]],
  [PET_SKILL.SKILL_4, [PET_SKILL.SKILL_4, PET_SKILL.SKILL_4_2, PET_SKILL.SKILL_4_3, PET_SKILL.SKILL_4_4, PET_SKILL.SKILL_4_HIT]],
  [PET_SKILL.SP, [PET_SKILL.SP, PET_SKILL.SP_2, PET_SKILL.SP_HIT]],
]);

const GUIDE_RELEASE_FRAMES = new Map();
const GUIDE_CD_SECONDS = new Map();
const GUIDE_DAMAGE_PATCHES = new Map();

const EFFECT_ONLY_SKILLS = new Set([
  PET_SKILL.YOUNG_SKILL_2,
  PET_SKILL.SKILL_2,
]);
const COEFFICIENT_ONLY_SKILLS = new Set([
  PET_SKILL.SKILL_4,
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

function defaultActiveActionCfg(actionCfg) {
  if (!actionCfg || !Array.isArray(actionCfg.com)) return actionCfg;
  return { ...actionCfg, com: actionCfg.com.filter((com) => com.notActive !== 1) };
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

function resolvePetReleaseTime(displaySkillId, cfg, skill, concreteIds, pet, ctx, warnings) {
  const guide = GUIDE_RELEASE_FRAMES.get(displaySkillId);
  if (guide) {
    return {
      releaseFrames: guide.frames,
      releaseSeconds: guide.frames / BATTLE_FRAMES_PER_SECOND,
      releaseTimeSource: guide.source,
    };
  }
  if (SPECIAL_CONCRETE_SKILLS.has(displaySkillId)) {
    let releaseFrames = 0;
    const sources = [];
    for (const id of concreteIds) {
      const concreteSkill = ctx.skillById.get(id);
      if (!concreteSkill) continue;
      const concreteCfg = resolvePetCfgFile(concreteSkill, pet, ctx, warnings);
      const rel = eng.resolveReleaseTime(concreteCfg.entityCfg, concreteSkill.entityAction, concreteCfg.hasActionCfg, warnings);
      if (typeof rel.releaseFrames === "number") {
        releaseFrames += rel.releaseFrames;
        sources.push(`${concreteSkill.entityAction}:${rel.releaseFrames}`);
      }
    }
    return {
      releaseFrames,
      releaseSeconds: releaseFrames / BATTLE_FRAMES_PER_SECOND,
      releaseTimeSource: `entityCtg.time chain ${sources.join("+")}`,
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

function damageSkillIdsFor(displaySkillId, concreteIds) {
  if (displaySkillId === PET_SKILL.YOUNG_SKILL_1) return [PET_SKILL.YOUNG_SKILL_1_MID, PET_SKILL.YOUNG_SKILL_1_HIT];
  if (displaySkillId === PET_SKILL.SKILL_1) return [PET_SKILL.SKILL_1_MID, PET_SKILL.SKILL_1_HIT];
  if (displaySkillId === PET_SKILL.SKILL_3) return [PET_SKILL.SKILL_3, PET_SKILL.SKILL_3_HIT];
  if (displaySkillId === PET_SKILL.SKILL_4) return [PET_SKILL.SKILL_4_HIT];
  if (displaySkillId === PET_SKILL.SP) return [PET_SKILL.SP_HIT];
  return concreteIds;
}

function mergeBuffForDisplay(displaySkillId, baseBuffId, rawBuff, engineBuff, ctx, warnings) {
  const override = ctx.overrides.resolveBuff(displaySkillId, baseBuffId) || ctx.overrides.resolveBuff(0, baseBuffId);
  if (!override) return engineBuff;
  const { merged, warnings: w } = ov.mergeBuff(engineBuff, override, rawBuff, `[qilin buff ${baseBuffId} ${engineBuff.name}] `);
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
    label: `[qilin buff ${baseBuffId} ${rawBuff1.name || ""}] `,
  });
  if (ctx.emitTemplate) ctx.overrides.recordBuff(displaySkillId, baseBuffId, rawBuff1, null);
}

function addManualGrowthBuffRef(growthBuffRefs, baseBuffId, name, text, bindSource, displayText) {
  growthBuffRefs.push({
    baseBuffId,
    name,
    text,
    time: 300,
    useRefTime: true,
    bindSource,
    bindLabel: BIND_SOURCE_LABEL[bindSource] || bindSource,
    levelMode: "growth",
    override: { name, displayText },
    label: `[qilin manual buff ${baseBuffId} ${name}] `,
  });
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

function pushTextEffect(out, baseBuffId, name, displayText) {
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

function collectFlyPassive(displaySkillId, fixedBuffs, ctx, warnings) {
  const beId = displaySkillId === PET_SKILL.PASSIVE_FLY_SAINT ? PET_BESKILL.FLY_SAINT : PET_BESKILL.FLY_GENERAL;
  const be = ctx.beskillById.get(beId);
  if (!be) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${beId} 缺失` });
  const attr = be?.attribute || {};
  const activeCount = asArray(attr.flySkillActive).length;
  const hasSpecialChain = asArray(attr.flySkillActiveWithBeskill?.[0]?.skillIds).length > 0;
  pushTextEffect(
    fixedBuffs,
    beId,
    be?.name || "凌虚踏",
    `PVE 可切换飞行姿态；飞行后会替换普攻和${activeCount}个主动/无双动作${hasSpecialChain ? "；踏星破岳可按命中与闪避差值进入强化链" : ""}`
  );
  for (const buffId of asArray(attr.buffs)) {
    pushFixedBuff(fixedBuffs, displaySkillId, buffId, ctx.buffById.get(buffId), "passiveEffect", ctx, warnings, null);
  }
}

function collectDodgeArmorPassive(displaySkillId, fixedBuffs, ctx, warnings) {
  for (const beId of [
    PET_BESKILL.DODGE_UP_GENERAL,
    PET_BESKILL.ARMOR_DAMAGE_DOWN,
    PET_BESKILL.ARMOR_DOT_DOWN,
    PET_BESKILL.ARMOR_CONTROL_DOWN,
    PET_BESKILL.ARMOR_NO_DODGE,
  ]) {
    const be = ctx.beskillById.get(beId);
    if (!be) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${beId} 缺失` });
  }
  pushFixedBuff(fixedBuffs, displaySkillId, PET_BUFF.DODGE_UP, ctx.buffById.get(PET_BUFF.DODGE_UP), "passiveEffect", ctx, warnings, null);
  pushTextEffect(
    fixedBuffs,
    PET_BESKILL.ARMOR_NO_DODGE,
    "凝甲",
    "战斗外可切换幻闪/凝甲。\n幻闪：保留普通闪避。\n凝甲：不再随机闪避，受到伤害时会把闪避能力按攻击者等级标准值折算成稳定免伤，并缩短持续伤害和异常/控制时间。\n凝甲状态下踏星破岳生成免伤阵：阵内友方不加面板减伤属性，而是先按成长表数值 / (受益友方数 + 1) * 1.3 得到免伤计算值，再用免伤计算值 / (免伤计算值 + 攻击者等级标准值) 折算成本次受伤使用的免伤率"
  );
}

function collectGuideEffects(displaySkillId, pet, ctx, warnings) {
  const out = [];

  if (displaySkillId === PET_SKILL.YOUNG_SKILL_1 || displaySkillId === PET_SKILL.SKILL_1) {
    pushTextEffect(out, displaySkillId, "蓄岩冲拳蓄力", "先短暂蓄力并前冲，后续勾拳段造成主要伤害；命中附加 1s 眩晕");
  }

  if (displaySkillId === PET_SKILL.YOUNG_SKILL_2 || displaySkillId === PET_SKILL.SKILL_2) {
    pushTextEffect(out, displaySkillId, "万壑成盾", "自身获得岩麟甲护盾；护盾持续期间被击碎时获得磐麟志。磐麟志会在下一次普攻开招时消耗1层，将常态三拳替换为判定更大、突进更远的强化三拳，段数和倍率不变");
    pushFixedBuff(out, displaySkillId, PET_BUFF.SHIELD, ctx.buffById.get(PET_BUFF.SHIELD), "guideEffect", ctx, warnings, null);
  }

  if (displaySkillId === PET_SKILL.SKILL_3) {
    pushTextEffect(out, displaySkillId, "千嶂横绝蓄力", "前段拳势连续攻击，短暂蓄力后以终段造成主要伤害并击飞面前敌人");
  }

  if (displaySkillId === PET_SKILL.SKILL_4) {
    pushTextEffect(out, displaySkillId, "踏星破岳落点", "锁定对本体造成伤害最高的单位，凌空冲向目标并击飞落点附近敌人；落地后生成帝麟阵");
    pushTextEffect(out, PET_BUFF.DODGE_FIELD, "帝麟阵·闪避", "默认生成闪避阵；阵内友方获得临时闪避值并免疫牵引，持续10s；具体数值见成长数值表");
  }

  if (displaySkillId === PET_SKILL.SP) {
    pushTextEffect(out, displaySkillId, "苍岩碎宇蓄力", "先重踏大地击飞附近敌人，再短暂蓄力挥出强力一击；终段造成主要伤害");
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
      for (const ref of refs) {
        if (displaySkillId === PET_SKILL.SKILL_4 && (ref.baseBuffId === PET_BUFF.DODGE_FIELD || ref.baseBuffId === PET_BUFF.ARMOR_FIELD)) {
          continue;
        }
        addBuffByGrowthMode(fixedBuffs, growthBuffRefs, seenBuffs, displaySkillId, ref.baseBuffId, ref.bindSource, ctx, warnings);
      }
    }
  }

  if (slotKind === "passive" && (displaySkillId === PET_SKILL.PASSIVE_FLY_GENERAL || displaySkillId === PET_SKILL.PASSIVE_FLY_SAINT)) {
    collectFlyPassive(displaySkillId, fixedBuffs, ctx, warnings);
  }
  if (slotKind === "passive" && displaySkillId === PET_SKILL.PASSIVE_DODGE_ARMOR) {
    collectDodgeArmorPassive(displaySkillId, fixedBuffs, ctx, warnings);
  }

  fixedBuffs.push(...collectGuideEffects(displaySkillId, pet, ctx, warnings));
  if (displaySkillId === PET_SKILL.SKILL_4) {
    addManualGrowthBuffRef(
      growthBuffRefs,
      PET_BUFF.FIELD_VALUE_BASE,
      "帝麟阵闪避值",
      "阵内友方闪避提升",
      "entityActionComBuff",
      "帝麟阵·闪避：阵内友方获得临时闪避值{value.1}，并免疫牵引，持续10s"
    );
  }
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

  for (const skillId of damageSkillIdsFor(displaySkillId, concreteIds)) {
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
    const actionCfg = displaySkillId === PET_SKILL.ATTACK || displaySkillId === PET_SKILL.YOUNG_ATTACK
      ? defaultActiveActionCfg(cfg.actionCfg)
      : cfg.actionCfg;
    const dmg = eng.computeDamageSegments(skill, row, actionCfg, warnings);
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
    totalVal: COEFFICIENT_ONLY_SKILLS.has(displaySkillId) ? null : (mergedSegments.length ? round(totalVal) : null),
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
    : resolvePetReleaseTime(displaySkillId, cfg, skill, concreteIds, pet, ctx, warnings);
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
        time: ref.useRefTime ? ref.time : (rawBuffG?.time ?? ref.time),
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
      segmentVals: l.segments.map((s) => ({ val: COEFFICIENT_ONLY_SKILLS.has(displaySkillId) ? null : s.val, maxHit: s.maxHit })),
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
  console.log("\n🦌 宠物技能 Wiki → 麒麟");

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
      key: "qilin",
      name: "麒麟",
      guidePath: GUIDE_PATH,
      petIds: PET_IDS,
      note: "宠物技能 Wiki 使用满级作为卡片表头参考值，逐级成长见下方成长数值表；麒麟只展示最高阶段麒麟圣尊，技能按 entityCtg.skillLink 串联阶段展示，只把真实伤害段计入总系数和固伤，护盾、飞行姿态、幻闪/凝甲作为机制效果单列。",
    },
    variants,
  };

  u.saveOutput("pet_wiki_qilin", payload, {
    system: "pet_wiki",
    sourceFiles: ["pet.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "beskill.*.json", "buff.*.json", "bullets.json", "entityCtg/*.json"].concat(GUIDE_PATH ? [GUIDE_PATH] : []),
    note: "麒麟宠物技能 Wiki，仅展示最高阶段麒麟圣尊，包含蓄岩冲拳、万壑成盾、千嶂横绝、踏星破岳、苍岩碎宇、凌虚踏、幻闪凝甲。",
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
