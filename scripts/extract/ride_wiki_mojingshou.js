/**
 * 坐骑技能 Wiki - 避火魔睛兽/至尊魔睛兽/避水金睛兽/至尊金睛兽提取脚本
 *
 * 魔睛兽/金睛兽组的四技能与无双会把表现弹幕和真实命中弹幕混在同一个 action 里。
 * 导出阶段按图鉴图5收口段数,同时保留 entityCtg/bullets 中可反查的真实命中来源。
 */
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");

const RIDE_OVERRIDE = "mojingshou";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const BATTLE_FRAMES_PER_SECOND = 30;
const GUIDE_PATH = "D:/zmws/保存网页资源/4399_Threads_Download/【结弦】造梦无双坐骑数值汇总_64056651/content.md";
const GUIDE_IMAGE = "D:/zmws/保存网页资源/4399_Threads_Download/【结弦】造梦无双坐骑数值汇总_64056651/images/11.png";

const RIDE_IDS = [201031, 201034, 201041, 201044];

const RIDE_SKILL = {
  FIRE_ATTACK_1: 20606010101,
  FIRE_ATTACK_2: 20606010102,
  FIRE_ATTACK_3: 20606010103,
  FIRE_S1: 20606010201,
  FIRE_S2: 20606010301,
  FIRE_S3: 20606010401,
  FIRE_S3_CHARGED: 20606010402,
  FIRE_BLESS: 20606010501,
  FIRE_BLESS_RIDE: 20606010511,
  FIRE_S4: 20606010601,
  FIRE_SP: 20606010701,
  FIRE_SKY: 20606010801,
  FIRE_SKY_JUMP_1: 20606010802,
  FIRE_SKY_JUMP_2: 20606010803,
  WATER_ATTACK_1: 20607010101,
  WATER_ATTACK_2: 20607010102,
  WATER_ATTACK_3: 20607010103,
  WATER_S1: 20607010201,
  WATER_S2: 20607010301,
  WATER_S3: 20607010401,
  WATER_S3_CHARGED: 20607010402,
  WATER_BLESS: 20607010501,
  WATER_BLESS_RIDE: 20607010511,
  WATER_S4: 20607010601,
  WATER_SP: 20607010701,
  WATER_SKY: 20607010801,
  WATER_SKY_JUMP_1: 20607010802,
  WATER_SKY_JUMP_2: 20607010803,
};

const RIDE_BUFF = {
  FIRE_RESIST: 90000101,
  WATER_RESIST: 91000101,
  FIRE_RIDE_RESIST: 90000102,
  FIRE_RIDE_AURA_DOWN: 90000103,
  WATER_RIDE_RESIST: 91000102,
  WATER_RIDE_AURA_DOWN: 91000103,
  FIRE_TOUGHNESS_DOWN: 10000301,
  FIRE_DEFENSE_DOWN: 6000501,
  WATER_ATTACK_DOWN: 5000801,
  WATER_HIT_DOWN: 7000301,
  FIRE_STRONG_BLIND: 7005601,
  WATER_STRONG_BLIND: 7005701,
};

const RIDE_BESKILL = {
  FIRE_SKY_JUMP: 7071101,
  WATER_SKY_JUMP: 7071201,
  FIRE_CHARGE: 7071102,
  WATER_CHARGE: 7071202,
  FIRE_BLESS: 7001301,
  WATER_BLESS: 7001401,
  FIRE_RIDE_BLESS: 7001302,
  FIRE_RIDE_AURA: 7001303,
  WATER_RIDE_BLESS: 7001402,
  WATER_RIDE_AURA: 7001403,
};

const GUIDE_DAMAGE_PATCHES = new Map([
  [RIDE_SKILL.FIRE_S4, {
    kind: "guideSingleHit",
    bulletId: 3609,
    maxHit: 1,
    source: "actionBullet:3609 guide:image11:冥焰震荡按真实命中弹幕1段展示,忽略表现弹幕1780的10次循环",
  }],
  [RIDE_SKILL.WATER_S4, {
    kind: "guideSingleHit",
    bulletId: 3610,
    maxHit: 1,
    source: "actionBullet:3610 guide:image11:裂水震荡按真实命中弹幕1段展示",
  }],
  [RIDE_SKILL.FIRE_SP, {
    kind: "guideFiveLandings",
    bulletId: 1783,
    maxHit: 5,
    source: "actionBullet:1783 guide:image11:魔炎殒灭图鉴按5个落点展示,每个落点使用skillLevel单段系数",
  }],
  [RIDE_SKILL.WATER_SP, {
    kind: "guideFiveLandings",
    bulletId: 1789,
    maxHit: 5,
    source: "actionBullet:1789 guide:image11:凝水殒灭图鉴按5个落点展示,每个落点使用skillLevel单段系数",
  }],
]);

function guideRelease(seconds, source) {
  return { frames: Math.round(seconds * BATTLE_FRAMES_PER_SECOND), source };
}

const GUIDE_RELEASE_FRAMES = new Map([
  [RIDE_SKILL.FIRE_S2, guideRelease(1, "guide:image11:踏火熔山释放1s; bullet:825 maxTime=1s")],
  [RIDE_SKILL.WATER_S2, guideRelease(1, "guide:image11:翻江倒海释放1s; bullet:832 maxTime=1s")],
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
  mechanismEffect: "机制效果",
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

function requiredNumber(value, label) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${label} 缺少必需数值`);
  }
  return value;
}

function skillName(skillId, ctx) {
  const skill = ctx.skillById.get(Number(skillId));
  return skill?.desName || skill?.Name || skill?.name || `技能${skillId}`;
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

function rideMonsterIds(ride) {
  return asArray(ride.monsterId).filter((id) => id != null);
}

function ownerMonstersForSkill(skillId, ctx) {
  const out = [];
  for (const monster of ctx.monsterById.values()) {
    const all = [].concat(monster.skillIds || [], monster.skyskillIds || [], monster.vSkill || [], monster.atkIds || [], monster.skyAtkIds || []);
    if (all.includes(skillId)) out.push(monster);
  }
  return out;
}

function resolveRideCfgFile(skill, ride, ctx, warnings) {
  const action = skill.entityAction;
  const monsterIds = rideMonsterIds(ride);
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
        cfgResolveSource: monsterIds.includes(monster.id) ? "rideMonster" : "ownerMonster",
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
    if (!fallbackCfg) warnings.push({ code: eng.WARN.MISSING_ENTITY_CFG, detail: `ride ${ride.id} skill ${skill.id} 找不到 entityCtg` });
    else warnings.push({ code: eng.WARN.MISSING_ACTION_CFG, detail: `ride ${ride.id} skill ${skill.id} action=${action} 在 cfg ${fallback.cfgFile} 中不存在` });
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

function effectCard(baseBuffId, name, bindSource, displayText, value = null, time = -1) {
  return {
    baseBuffId,
    name,
    text: null,
    time,
    bindSource,
    bindLabel: BIND_SOURCE_LABEL[bindSource] || bindSource,
    value,
    displayText,
  };
}

function pushBuffCard(out, displaySkillId, baseBuffId, rawBuff, bindSource, ctx, warnings, fallbackText = null) {
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
  const override = ctx.overrides.resolveBuff(displaySkillId, baseBuffId) || ctx.overrides.resolveBuff(0, baseBuffId);
  if (override) {
    const { merged, warnings: w } = ov.mergeBuff(engineBuff, override, rawBuff, `[mojingshou buff ${baseBuffId} ${engineBuff.name}] `);
    warnings.push(...w);
    out.push(merged);
  } else {
    out.push(engineBuff);
  }
}

function makeGrowthBuffRef(displaySkillId, baseBuffId, bindSource, ctx, warnings) {
  const g1 = eng.resolveBuffGrowth(baseBuffId, 1, ctx.buffById, warnings);
  if (!g1.buff) return null;
  const rawBuff1 = g1.buff;
  const base = {
    baseBuffId,
    name: rawBuff1.name || `buff${baseBuffId}`,
    text: rawBuff1.text || null,
    time: rawBuff1.time ?? null,
    bindSource,
    bindLabel: BIND_SOURCE_LABEL[bindSource] || bindSource,
    levelMode: g1.levelMode,
  };
  const override = ctx.overrides.resolveBuff(displaySkillId, baseBuffId) || ctx.overrides.resolveBuff(0, baseBuffId);
  return { ...base, override, label: `[mojingshou buff ${baseBuffId} ${base.name}] ` };
}

function addGrowthBuffRef(out, displaySkillId, baseBuffId, bindSource, ctx, warnings, seenBuffs) {
  if (seenBuffs.has(baseBuffId)) return;
  seenBuffs.add(baseBuffId);
  const ref = makeGrowthBuffRef(displaySkillId, baseBuffId, bindSource, ctx, warnings);
  if (ref) out.push(ref);
}

function chargeEffect(displaySkillId, chargedSkillId, beskillId, blindBuffId, ctx, warnings) {
  const be = ctx.beskillById.get(beskillId);
  if (!be) {
    warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `charge beskill ${beskillId} 缺失` });
    return [];
  }
  const max = requiredNumber(be.attribute?.max, `beskill ${beskillId} attribute.max`);
  const frameAdd = requiredNumber(be.attribute?.frameAdd, `beskill ${beskillId} attribute.frameAdd`);
  const actualSkillId = requiredNumber(be.attribute?.skillId, `beskill ${beskillId} attribute.skillId`);
  if (actualSkillId !== chargedSkillId) {
    throw new Error(`beskill ${beskillId} skillId=${actualSkillId} 与预期 ${chargedSkillId} 不一致`);
  }
  const skill = ctx.skillById.get(chargedSkillId);
  const row = skill ? ctx.skillLevelById.get(eng.skillLevelRowId(skill, 1)) : null;
  if (!skill) warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `charged skill ${chargedSkillId} 缺失` });
  if (!row) warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `charged skill ${chargedSkillId} lv1 缺失` });
  const buff = ctx.buffById.get(blindBuffId);
  if (!buff) warnings.push({ code: eng.WARN.MISSING_BUFF, detail: `blind buff ${blindBuffId} 缺失` });

  const chargeFrames = max / frameAdd;
  const parts = [`每帧充能${frameAdd},充能上限${max},约${round(chargeFrames / BATTLE_FRAMES_PER_SECOND)}s蓄满`];
  if (row) parts.push(`蓄满后触发${skillName(chargedSkillId, ctx)}:${row.damageAddPer} * atk + ${row.damageAddVal}`);
  if (buff) parts.push(`并附带${buff.name || "强致盲"}`);
  return [effectCard(beskillId, be.name || "充能机制", "mechanismEffect", parts.join("；"))];
}

function beskillAppearBuffs(displaySkillId, beskillId, bindSource, ctx, warnings, out) {
  const be = ctx.beskillById.get(beskillId);
  if (!be) {
    warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${beskillId} 缺失` });
    return;
  }
  if (be.label !== "appearBuff1") {
    warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${beskillId} label=${be.label} 不是 appearBuff1` });
    return;
  }
  for (const buffId of asArray(be.attribute).filter(Boolean)) {
    pushBuffCard(out, displaySkillId, buffId, ctx.buffById.get(buffId), bindSource, ctx, warnings, null);
  }
}

function beskillRangeBuff(displaySkillId, beskillId, bindSource, ctx, warnings, out, label) {
  const be = ctx.beskillById.get(beskillId);
  if (!be) {
    warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `range beskill ${beskillId} 缺失` });
    return;
  }
  if (be.label !== "rangeAddBuffs") {
    warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${beskillId} label=${be.label} 不是 rangeAddBuffs` });
    return;
  }
  const attr = be.attribute || {};
  for (const buffId of asArray(attr.buff).filter(Boolean)) {
    const buff = ctx.buffById.get(buffId);
    const v = buffValueSummary(buff);
    const valText = v?.val == null ? "" : Math.abs(v.val);
    const rangeText = `范围${requiredNumber(attr.width, `beskill ${beskillId} width`)}x${requiredNumber(attr.height, `beskill ${beskillId} height`)},Y偏移${requiredNumber(attr.offsetY, `beskill ${beskillId} offsetY`)}`;
    pushBuffCard(out, displaySkillId, buffId, buff, bindSource, ctx, warnings, `${label}每${be.cd}s对周围敌方附加抗性降低${valText},${rangeText},持续${buff?.time === -1 ? "永久" : round((buff?.time ?? 0) / BATTLE_FRAMES_PER_SECOND) + "s"}`);
  }
}

function collectPassiveEffects(displaySkillId, ride, ctx, warnings) {
  const out = [];
  if (displaySkillId === RIDE_SKILL.FIRE_BLESS) {
    beskillAppearBuffs(displaySkillId, RIDE_BESKILL.FIRE_BLESS, "passiveEffect", ctx, warnings, out);
    if (ride.id === 201034) {
      out.push(effectCard(RIDE_SKILL.FIRE_BLESS_RIDE, "至尊魔睛兽骑术", "guideEffect", "激活避火骑术后继承主人8%生命、攻击、命中、暴击"));
      beskillAppearBuffs(displaySkillId, RIDE_BESKILL.FIRE_RIDE_BLESS, "passiveEffect", ctx, warnings, out);
      beskillRangeBuff(displaySkillId, RIDE_BESKILL.FIRE_RIDE_AURA, "passiveEffect", ctx, warnings, out, "避火骑术光环");
    }
  } else if (displaySkillId === RIDE_SKILL.WATER_BLESS) {
    beskillAppearBuffs(displaySkillId, RIDE_BESKILL.WATER_BLESS, "passiveEffect", ctx, warnings, out);
    if (ride.id === 201044) {
      out.push(effectCard(RIDE_SKILL.WATER_BLESS_RIDE, "至尊金睛兽骑术", "guideEffect", "激活避水骑术后继承主人8%生命、攻击、防御、闪避"));
      beskillAppearBuffs(displaySkillId, RIDE_BESKILL.WATER_RIDE_BLESS, "passiveEffect", ctx, warnings, out);
      beskillRangeBuff(displaySkillId, RIDE_BESKILL.WATER_RIDE_AURA, "passiveEffect", ctx, warnings, out, "避水骑术光环");
    }
  } else if (displaySkillId === RIDE_SKILL.FIRE_SKY || displaySkillId === RIDE_SKILL.WATER_SKY) {
    const beskillId = displaySkillId === RIDE_SKILL.FIRE_SKY ? RIDE_BESKILL.FIRE_SKY_JUMP : RIDE_BESKILL.WATER_SKY_JUMP;
    const be = ctx.beskillById.get(beskillId);
    if (!be) {
      warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `sky beskill ${beskillId} 缺失` });
    } else {
      const skillIds = asArray(be.attribute?.skillId).filter(Boolean);
      const energyAdd = asArray(be.attribute?.energyAdd);
      out.push(effectCard(
        beskillId,
        be.name || "腾云驾雾",
        "passiveEffect",
        `二段跳后再次按跳跃键进入飞行姿态,疲劳消耗倍率${energyAdd[0]},触发动作${skillIds.map((id) => skillName(id, ctx)).join("/")}`,
      ));
    }
  }
  return out;
}

function collectGuideEffects(displaySkillId, ctx, warnings) {
  if (displaySkillId === RIDE_SKILL.FIRE_S3) {
    return chargeEffect(displaySkillId, RIDE_SKILL.FIRE_S3_CHARGED, RIDE_BESKILL.FIRE_CHARGE, RIDE_BUFF.FIRE_STRONG_BLIND, ctx, warnings);
  }
  if (displaySkillId === RIDE_SKILL.WATER_S3) {
    return chargeEffect(displaySkillId, RIDE_SKILL.WATER_S3_CHARGED, RIDE_BESKILL.WATER_CHARGE, RIDE_BUFF.WATER_STRONG_BLIND, ctx, warnings);
  }
  return [];
}

function collectBuffs(displaySkillId, concreteIds, ride, slotKind, ctx, warnings) {
  const fixedBuffs = [];
  const growthBuffRefs = [];
  const seenBuffs = new Set();

  if (slotKind !== "passive") {
    for (const skillId of concreteIds) {
      const skill = ctx.skillById.get(skillId);
      if (!skill) continue;
      const cfg = resolveRideCfgFile(skill, ride, ctx, warnings);
      const refs = eng.scanBuffs(skill, cfg.actionCfg, ctx.beskillById, warnings);

      for (const ref of refs) {
        if (seenBuffs.has(ref.baseBuffId)) continue;
        seenBuffs.add(ref.baseBuffId);

        const g1 = eng.resolveBuffGrowth(ref.baseBuffId, 1, ctx.buffById, warnings);
        if (!g1.buff) continue;
        const rawBuff1 = g1.buff;
        const base = {
          baseBuffId: ref.baseBuffId,
          name: rawBuff1.name || `buff${ref.baseBuffId}`,
          text: rawBuff1.text || null,
          time: rawBuff1.time ?? null,
          bindSource: ref.bindSource,
          bindLabel: BIND_SOURCE_LABEL[ref.bindSource] || ref.bindSource,
          levelMode: g1.levelMode,
        };

        const override = ctx.overrides.resolveBuff(displaySkillId, ref.baseBuffId) || ctx.overrides.resolveBuff(skillId, ref.baseBuffId) || ctx.overrides.resolveBuff(0, ref.baseBuffId);
        const label = `[mojingshou buff ${ref.baseBuffId} ${base.name}] `;
        if (g1.levelMode === "growth") {
          growthBuffRefs.push({ ...base, override, label });
        } else {
          const engBuff = { ...base, value: buffValueSummary(rawBuff1) };
          if (override) {
            const { merged, warnings: w } = ov.mergeBuff(engBuff, override, rawBuff1, label);
            warnings.push(...w);
            fixedBuffs.push(merged);
          } else {
            fixedBuffs.push(engBuff);
          }
        }
        if (ctx.emitTemplate) ctx.overrides.recordBuff(displaySkillId, ref.baseBuffId, rawBuff1, null);
      }
    }
  }

  if (displaySkillId === RIDE_SKILL.FIRE_S3) {
    addGrowthBuffRef(growthBuffRefs, displaySkillId, RIDE_BUFF.FIRE_DEFENSE_DOWN, "mechanismEffect", ctx, warnings, seenBuffs);
    addGrowthBuffRef(growthBuffRefs, displaySkillId, RIDE_BUFF.FIRE_STRONG_BLIND, "mechanismEffect", ctx, warnings, seenBuffs);
  } else if (displaySkillId === RIDE_SKILL.WATER_S3) {
    addGrowthBuffRef(growthBuffRefs, displaySkillId, RIDE_BUFF.WATER_HIT_DOWN, "mechanismEffect", ctx, warnings, seenBuffs);
    addGrowthBuffRef(growthBuffRefs, displaySkillId, RIDE_BUFF.WATER_STRONG_BLIND, "mechanismEffect", ctx, warnings, seenBuffs);
  }

  if (slotKind === "passive") fixedBuffs.push(...collectPassiveEffects(displaySkillId, ride, ctx, warnings));
  fixedBuffs.push(...collectGuideEffects(displaySkillId, ctx, warnings));
  return { fixedBuffs, growthBuffRefs };
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

function finalizeLevel(level, row, kind, segments) {
  let totalPer = 0;
  let totalVal = 0;
  for (const s of segments) {
    totalPer += (s.per || 0) * (s.maxHit || 1);
    totalVal += (s.val || 0) * (s.maxHit || 1);
  }
  return {
    level,
    roleLevel: row.roleLevel ?? null,
    consumeMp: row.consumeMp ?? null,
    soulCost: row.soulCost ?? null,
    kind,
    segments,
    totalPer: round(totalPer),
    totalVal: round(totalVal),
    addDefendVal: row.addDefendVal ?? null,
  };
}

function computeGuidePatchedLevel(displaySkillId, level, ctx, warnings) {
  const def = GUIDE_DAMAGE_PATCHES.get(displaySkillId);
  const skill = ctx.skillById.get(displaySkillId);
  const row = skill ? ctx.skillLevelById.get(eng.skillLevelRowId(skill, level)) : null;
  if (!skill) warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `skill ${displaySkillId} 缺失` });
  if (!row) {
    warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `skill ${displaySkillId} lv${level} 缺失` });
    return null;
  }
  if (!eng.getBullet(def.bulletId, warnings)) throw new Error(`skill ${displaySkillId} 修正引用的 bullet ${def.bulletId} 不存在`);
  const segment = {
    per: requiredNumber(row.damageAddPer, `skill ${displaySkillId} lv${level} damageAddPer`),
    val: requiredNumber(row.damageAddVal, `skill ${displaySkillId} lv${level} damageAddVal`),
    maxHit: def.maxHit,
    from: def.source,
  };
  return finalizeLevel(level, row, def.kind, [segment]);
}

function computeRideLevel(displaySkillId, concreteIds, level, ride, slotKind, ctx, warnings) {
  if (slotKind === "passive") return makePassiveLevel();
  if (GUIDE_DAMAGE_PATCHES.has(displaySkillId)) return computeGuidePatchedLevel(displaySkillId, level, ctx, warnings);

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

    const cfg = resolveRideCfgFile(skill, ride, ctx, warnings);
    const dmg = eng.computeDamageSegments(skill, row, cfg.actionCfg, warnings);
    if (dmg.segments && dmg.segments.length) {
      mergedSegments.push(...dmg.segments);
      if (!mergedKind || mergedKind === "normal") mergedKind = dmg.kind;
    }
  }

  if (!firstRow) return null;
  if (mergedSegments.some((s) => s.per > 0)) mergedSegments = mergedSegments.filter((s) => s.per > 0);
  return finalizeLevel(level, firstRow, mergedSegments.length ? (mergedKind || "normal") : "effectOnly", mergedSegments);
}

function resolveRideReleaseTime(displaySkillId, cfg, skill, warnings) {
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
  let maxLevel = 0;
  for (const id of [displaySkillId, ...concreteIds]) {
    const skill = ctx.skillById.get(id);
    if (skill) maxLevel = Math.max(maxLevel, eng.detectMaxLevel(skill, ctx.skillLevelById));
  }
  return maxLevel;
}

function buildSkillCard(displaySkillId, ride, slotLabel, slotKind, ctx) {
  const warnings = [];
  const skill = ctx.skillById.get(displaySkillId);
  if (!skill) {
    return { skillId: displaySkillId, name: `技能${displaySkillId}`, error: "skill 不存在", warnings: [{ code: eng.WARN.MISSING_SKILL }] };
  }

  const concreteIds = [displaySkillId];
  const cfg = slotKind === "passive"
    ? { cfgFileResolved: null, cfgResolveSource: "passive", hasActionCfg: false, actionCfg: null, entityCfg: null }
    : resolveRideCfgFile(skill, ride, ctx, warnings);
  const maxLevel = detectDisplayMaxLevel(displaySkillId, concreteIds, slotKind, ctx);
  const rel = slotKind === "passive"
    ? { releaseFrames: null, releaseSeconds: null, releaseTimeSource: "effectOnly" }
    : resolveRideReleaseTime(displaySkillId, cfg, skill, warnings);
  const { fixedBuffs, growthBuffRefs } = collectBuffs(displaySkillId, concreteIds, ride, slotKind, ctx, warnings);

  const levels = [];
  for (let lv = 1; lv <= maxLevel; lv++) {
    const l = computeRideLevel(displaySkillId, concreteIds, lv, ride, slotKind, ctx, warnings);
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
      cd: skill.cd ?? null,
      addDefendVal: reference?.addDefendVal ?? null,
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

function rideAttackSkillIds(ride, ctx) {
  const ids = [];
  for (const monsterId of rideMonsterIds(ride)) {
    const monster = ctx.monsterById.get(monsterId);
    for (const skillId of asArray(monster?.atkIds).filter(Boolean)) {
      if (!ids.includes(skillId)) ids.push(skillId);
    }
  }
  return ids;
}

function skillIdsForSlot(ride, def, ctx) {
  if (def.kind === "attack") return rideAttackSkillIds(ride, ctx);
  return asArray(ride[def.key]).filter(Boolean);
}

function buildSlots(ride, ctx) {
  const slots = [];
  for (const def of SLOT_DEFS) {
    const ids = skillIdsForSlot(ride, def, ctx);
    ids.forEach((skillId, index) => {
      const slotLabel = def.kind === "attack" || def.kind === "sp" || def.kind === "passive" ? def.labelPrefix : `${def.labelPrefix}${index + 1}`;
      slots.push({
        slot: def.kind === "attack" ? `attack${index + 1}` : `${def.key}${index + 1}`,
        slotLabel,
        slotKind: def.kind,
        base: buildSkillCard(skillId, ride, slotLabel, def.kind, ctx),
        awakens: [],
        allAwakenIdentical: false,
      });
    });
  }
  return slots;
}

function extract() {
  console.log("\n🐎 坐骑技能 Wiki → 魔睛兽/金睛兽");

  const ctx = {
    rideById: idx(u.loadTable("ride")),
    skillById: idx(u.loadTable("skill")),
    skillLevelById: idx(u.loadTable("skillLevel")),
    monsterById: idx(u.loadTable("monster")),
    buffById: idx(u.loadTable("buff")),
    beskillById: idx(u.loadTable("beskill")),
    overrides: ov.loadOverrides(RIDE_OVERRIDE),
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

  const variants = RIDE_IDS.map((rideId) => {
    const ride = ctx.rideById.get(rideId);
    if (!ride) throw new Error(`ride ${rideId} 不存在`);
    const monster = ctx.monsterById.get(rideMonsterIds(ride)[0]);
    return {
      ride: {
        id: ride.id,
        idGroup: ride.idGroup,
        name: ride.name,
        rank: ride.rank,
        type: ride.type,
        monsterId: ride.monsterId,
        monsterName: monster?.name || null,
        cfgFile: monster?.cfgFile || null,
      },
      slots: buildSlots(ride, ctx),
    };
  });

  const unused = ctx.overrides.finalizeWarnings();
  if (unused.length && variants[0]?.slots[0]?.base) variants[0].slots[0].base.warnings.push(...unused);

  const payload = {
    rideGroup: {
      key: "mojingshou",
      name: "避火魔睛兽/至尊魔睛兽/避水金睛兽/至尊金睛兽",
      guidePath: GUIDE_PATH,
      guideImage: GUIDE_IMAGE,
      rideIds: RIDE_IDS,
      note: "坐骑技能 Wiki 使用满级作为卡片表头参考值，逐级成长见下方成长数值表；冥焰/裂水震荡与魔炎/凝水殒灭按图鉴图5收口段数，避免表现弹幕被计入伤害。",
    },
    variants,
  };

  u.saveOutput("ride_wiki_mojingshou", payload, {
    system: "ride_wiki",
    sourceFiles: ["ride.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "beskill.*.json", "buff.*.json", "bullets.json", "entityCtg/*.json", GUIDE_PATH, GUIDE_IMAGE],
    note: "魔睛兽/金睛兽坐骑技能 Wiki，包括普攻、辟地/辟海、踏火/翻江、怒眼普通与充能、避火/避水祝福、腾云驾雾、四技能与无双。",
  });

  for (const v of variants) {
    console.log(`  ${v.ride.name}(${v.ride.id}) cfg=${v.ride.cfgFile}`);
    for (const s of v.slots) {
      const b = s.base;
      const atkConv = b.levels?.[b.levels.length - 1]?.metrics?.find((m) => m.key === "atkConv")?.display ?? "—";
      console.log(`    ${s.slotLabel} ${b.name}(${b.skillId}): ${b.header.kind} ${b.header.segCount}段 per=${b.header.totalPer ?? "—"} 帧=${b.header.releaseFrames ?? "—"} maxLv=${b.maxLevel} 攻转=${atkConv}${b.warnings.length ? " ⚠" + b.warnings.length : ""}`);
    }
  }
}

if (require.main === module) extract();
module.exports = extract;
