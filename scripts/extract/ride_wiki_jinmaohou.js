/**
 * 坐骑技能 Wiki - 金毛犼/冲天神犼提取脚本
 *
 * 神犼组的几个动作会把机制弹幕和占位伤害混在一起。
 * 导出阶段按本地攻略图鉴图4上半区收口段数,再用战斗配置补全燃烧、灼天火环和紫金铃铛区域效果。
 */
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");

const RIDE_OVERRIDE = "jinmaohou";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const BATTLE_FRAMES_PER_SECOND = 30;
const GUIDE_PATH = "D:/zmws/保存网页资源/4399_Threads_Download/【结弦】造梦无双坐骑数值汇总_64056651/content.md";

const RIDE_IDS = [201602];
const JINMAOHOU_SKILL = {
  FIRE_BURST: 20628010101,
  BURN_RING: 20628010201,
  BURN_RING_JUMP: 20628010202,
  BURN_RING_LAND: 20628010203,
  METEOR: 20628010301,
  METEOR_STRONG: 20628010302,
  SKY_FLAME: 20628010401,
  BELL_PASSIVE: 20628010501,
  BELL_PASSIVE_RIDE: 20628010511,
  BELL_FIRE: 20628010601,
  BELL_SMOKE: 20628010602,
  BELL_SAND: 20628010603,
  BELL_FIRE_RIDE: 20628010611,
  BELL_SMOKE_RIDE: 20628010612,
  BELL_SAND_RIDE: 20628010613,
};
const JINMAOHOU_BUFF = {
  BURN: 1052501,
  FIRE_AREA: 1052601,
  FIRE_AREA_RIDE: 1052611,
  HEAL_DOWN: 148003501,
  HEAL_DOWN_RIDE: 148003511,
  SMOKE_AREA: 62003001,
  SMOKE_AREA_RIDE: 62003011,
  SAND_AREA: 4053701,
  SAND_AREA_RIDE: 4053711,
  JUMP_DOWN: 143004101,
  JUMP_DOWN_RIDE: 143004111,
  NO_FAST_MOVE: 243001001,
  NO_FAST_MOVE_RIDE: 243001011,
  DEF_UP: 6011301,
  STUN: 3008801,
};

const EFFECT_ONLY_SKILLS = new Set([JINMAOHOU_SKILL.BURN_RING]);
const CONCRETE_SKILLS = new Map([
  [JINMAOHOU_SKILL.BURN_RING, [JINMAOHOU_SKILL.BURN_RING, JINMAOHOU_SKILL.BURN_RING_JUMP, JINMAOHOU_SKILL.BURN_RING_LAND]],
]);
const COMPOSITE_RELEASE_SKILLS = new Map([
  [JINMAOHOU_SKILL.BURN_RING, [JINMAOHOU_SKILL.BURN_RING, JINMAOHOU_SKILL.BURN_RING_JUMP, JINMAOHOU_SKILL.BURN_RING_LAND]],
]);

const SLOT_DEFS = [
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

function pctText(n) {
  return `${round(Math.abs(n) * 100)}%`;
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
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

function resolveRawBuff(buff, buffById) {
  if (!buff) return buff;
  if ((buff.value === null || buff.value === undefined) && Array.isArray(buff.attachBuff) && buff.attachBuff.length > 0) {
    const attached = buffById.get(buff.attachBuff[0]);
    if (attached) return { ...buff, value: attached.value };
  }
  return buff;
}

function resolveRideCfgFile(skill, ride, ctx, warnings) {
  const action = skill.entityAction;
  const rideMonsterIds = asArray(ride.monsterId).filter((id) => id != null);

  const ownerMonsters = [];
  for (const m of ctx.monsterById.values()) {
    const all = [].concat(m.skillIds || [], m.skyskillIds || [], m.vSkill || [], m.atkIds || [], m.skyAtkIds || []);
    if (all.includes(skill.id)) ownerMonsters.push(m);
  }

  const order = [];
  for (const id of rideMonsterIds) {
    const m = ctx.monsterById.get(id);
    if (m) order.push(m);
  }
  for (const m of ownerMonsters) if (!order.some((x) => x.id === m.id)) order.push(m);

  for (const m of order) {
    const cfg = eng.loadEntityCfg(m.cfgFile);
    if (cfg && action && cfg[action]) {
      return {
        cfgFileResolved: m.cfgFile,
        cfgResolveSource: rideMonsterIds.includes(m.id) ? "rideMonster" : "ownerMonster",
        cfgMonsterId: m.id,
        cfgMonsterName: m.name,
        hasActionCfg: true,
        actionCfg: cfg[action],
        entityCfg: cfg,
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
  const override = ctx.overrides.resolveBuff(displaySkillId, baseBuffId);
  if (override) {
    const { merged, warnings: w } = ov.mergeBuff(engineBuff, override, rawBuff, `[jinmaohou buff ${baseBuffId} ${engineBuff.name}] `);
    warnings.push(...w);
    out.push(merged);
  } else {
    out.push(engineBuff);
  }
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

function skillLevelRow(skillId, level, ctx, warnings) {
  const skill = ctx.skillById.get(skillId);
  const row = skill ? ctx.skillLevelById.get(eng.skillLevelRowId(skill, level)) : null;
  if (!skill) warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `skill ${skillId} 不存在` });
  else if (!row) warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `skill ${skillId} lv${level} 缺失` });
  return { skill, row };
}

function requireBuff(buffId, ctx, warnings) {
  const buff = ctx.buffById.get(buffId);
  if (!buff) warnings.push({ code: eng.WARN.MISSING_BUFF, detail: `buff ${buffId} 缺失` });
  return buff || null;
}

function findAreaCom(skillId, buffId, ride, ctx, warnings) {
  const skill = ctx.skillById.get(skillId);
  if (!skill) {
    warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `area skill ${skillId} 缺失` });
    return null;
  }
  const cfg = resolveRideCfgFile(skill, ride, ctx, warnings);
  const area = cfg.actionCfg?.com?.find((c) => c.type === 18 && asArray(c.buff).includes(buffId));
  if (!area) warnings.push({ code: eng.WARN.MISSING_ACTION_CFG, detail: `skill ${skillId} 未找到区域 buff ${buffId}` });
  return area || null;
}

function passiveAreaCard({ skillId, buffId, name, kind }, ride, ctx, warnings) {
  const buff = requireBuff(buffId, ctx, warnings);
  if (!buff) return null;
  const area = findAreaCom(skillId, buffId, ride, ctx, warnings);
  const seconds = typeof area?.time === "number" ? area.time : null;
  if (seconds == null) return null;

  if (kind === "fire") {
    const healBuff = requireBuff(buff.attachBuff?.[0], ctx, warnings);
    const burn = Array.isArray(buff.value?.[0]) && typeof buff.value[0][0] === "number" ? Math.abs(buff.value[0][0]) : null;
    const healDown = Array.isArray(healBuff?.value) && typeof healBuff.value[0] === "number" ? pctText(healBuff.value[0]) : null;
    return effectCard(
      buffId,
      name,
      "passiveEffect",
      `区域持续${seconds}s；每秒造成${burn} * atk真伤，并使治疗效率降低${healDown}`,
      buffValueSummary(buff),
      seconds * BATTLE_FRAMES_PER_SECOND,
    );
  }

  if (kind === "smoke") {
    const hitDown = Array.isArray(buff.value) && typeof buff.value[0] === "number" ? pctText(buff.value[0]) : null;
    return effectCard(
      buffId,
      name,
      "passiveEffect",
      `区域持续${seconds}s；处于区域内视野丢失，命中降低${hitDown}`,
      buffValueSummary(buff),
      seconds * BATTLE_FRAMES_PER_SECOND,
    );
  }

  if (kind === "sand") {
    const jumpBuff = requireBuff(buff.attachBuff?.[0], ctx, warnings);
    const speedDown = Array.isArray(buff.value) && typeof buff.value[0] === "number" ? pctText(buff.value[0]) : null;
    const jumpDown = Array.isArray(jumpBuff?.value) && typeof jumpBuff.value[0] === "number" ? pctText(jumpBuff.value[0]) : null;
    return effectCard(
      buffId,
      name,
      "passiveEffect",
      `区域持续${seconds}s；移速降低${speedDown}，跳跃力降低${jumpDown}，并禁止高速移动`,
      buffValueSummary(buff),
      seconds * BATTLE_FRAMES_PER_SECOND,
    );
  }

  return null;
}

function collectPassiveEffects(displaySkillId, ride, ctx, warnings) {
  const out = [];
  const skill = ctx.skillById.get(displaySkillId);
  const beSkillIds = [].concat(skill?.beSkill || [], skill?.beSkill2 || []).filter(Boolean);
  for (const beSkillId of beSkillIds) {
    const be = ctx.beskillById.get(beSkillId);
    if (!be) {
      warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `passive beskill ${beSkillId} 缺失` });
      continue;
    }
    if (be.label === "addValueFlagValue") {
      out.push(effectCard(
        beSkillId,
        "紫金铃铛充能",
        "passiveEffect",
        "每充能8s后，攻击命中或被攻击会按顺序触发一晃生火、二晃生烟、三晃飞沙走石；触发后进入10s冷却，冷却结束后重新充能",
      ));
    }
  }

  const rideActive = ride.id === 201602;
  out.push(effectCard(
    rideActive ? JINMAOHOU_SKILL.BELL_PASSIVE_RIDE : JINMAOHOU_SKILL.BELL_PASSIVE,
    rideActive ? "冲天神犼骑术" : "坐骑继承",
    "guideEffect",
    rideActive
      ? "继承主人8%生命、攻击、防御、命中；骑术使紫金铃铛生成的燃烧、烟熏、黄沙区域持续时间延长至8s"
      : "继承主人8%生命、攻击、防御、命中；紫金铃铛生成的燃烧、烟熏、黄沙区域持续6s",
  ));

  const areaDefs = rideActive
    ? [
      { skillId: JINMAOHOU_SKILL.BELL_FIRE_RIDE, buffId: JINMAOHOU_BUFF.FIRE_AREA_RIDE, name: "一晃生火", kind: "fire" },
      { skillId: JINMAOHOU_SKILL.BELL_SMOKE_RIDE, buffId: JINMAOHOU_BUFF.SMOKE_AREA_RIDE, name: "二晃生烟", kind: "smoke" },
      { skillId: JINMAOHOU_SKILL.BELL_SAND_RIDE, buffId: JINMAOHOU_BUFF.SAND_AREA_RIDE, name: "三晃飞沙走石", kind: "sand" },
    ]
    : [
      { skillId: JINMAOHOU_SKILL.BELL_FIRE, buffId: JINMAOHOU_BUFF.FIRE_AREA, name: "一晃生火", kind: "fire" },
      { skillId: JINMAOHOU_SKILL.BELL_SMOKE, buffId: JINMAOHOU_BUFF.SMOKE_AREA, name: "二晃生烟", kind: "smoke" },
      { skillId: JINMAOHOU_SKILL.BELL_SAND, buffId: JINMAOHOU_BUFF.SAND_AREA, name: "三晃飞沙走石", kind: "sand" },
    ];
  for (const def of areaDefs) {
    const card = passiveAreaCard(def, ride, ctx, warnings);
    if (card) out.push(card);
  }

  return out;
}

function collectGuideEffects(displaySkillId, ctx) {
  const out = [];
  if (displaySkillId === JINMAOHOU_SKILL.BURN_RING) {
    out.push(effectCard(
      JINMAOHOU_SKILL.BURN_RING,
      "火环动作链",
      "mechanismEffect",
      `技能按${skillName(JINMAOHOU_SKILL.BURN_RING, ctx)}、${skillName(JINMAOHOU_SKILL.BURN_RING_JUMP, ctx)}、${skillName(JINMAOHOU_SKILL.BURN_RING_LAND, ctx)}三段动作衔接；前两段表现伤害不作为技能伤害展示`,
    ));
  }
  if (displaySkillId === JINMAOHOU_SKILL.METEOR) {
    out.push(effectCard(
      JINMAOHOU_SKILL.METEOR_STRONG,
      "燃烧引爆",
      "mechanismEffect",
      "优先锁定燃烧层数高的敌人并引爆剩余所有烧伤之和；目标燃烧不少于4层时，额外附带强攻击飞效果",
    ));
  }
  return out;
}

function collectBuffs(displaySkillId, concreteIds, ride, slotKind, ctx, warnings) {
  const fixedBuffs = [];
  const growthBuffRefs = [];
  const seenBuffs = new Set();

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
      const rawBuff1 = resolveRawBuff(g1.buff, ctx.buffById);
      const base = {
        baseBuffId: ref.baseBuffId,
        name: rawBuff1.name || `buff${ref.baseBuffId}`,
        text: rawBuff1.text || null,
        time: rawBuff1.time ?? null,
        bindSource: ref.bindSource,
        bindLabel: BIND_SOURCE_LABEL[ref.bindSource] || ref.bindSource,
        levelMode: g1.levelMode,
      };

      const override = ctx.overrides.resolveBuff(displaySkillId, ref.baseBuffId) || ctx.overrides.resolveBuff(skillId, ref.baseBuffId);
      const label = `[jinmaohou buff ${ref.baseBuffId} ${base.name}] `;

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

  if (slotKind === "passive") fixedBuffs.push(...collectPassiveEffects(displaySkillId, ride, ctx, warnings));
  fixedBuffs.push(...collectGuideEffects(displaySkillId, ctx));
  return { fixedBuffs, growthBuffRefs };
}

function makeEffectOnlyLevel(displaySkillId, level, ctx, warnings) {
  const skill = ctx.skillById.get(displaySkillId);
  const row = skill ? ctx.skillLevelById.get(eng.skillLevelRowId(skill, level)) : null;
  if (!row) warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `技能 ${displaySkillId} Lv.${level} 缺少等级数据，无法展示机制成长` });
  return {
    level,
    roleLevel: row?.roleLevel ?? null,
    consumeMp: row?.consumeMp ?? null,
    soulCost: row?.soulCost ?? null,
    kind: "effectOnly",
    segments: [],
    totalPer: null,
    totalVal: null,
    addDefendVal: null,
  };
}

function makeSegment(source, row, maxHit, capSource = null) {
  return {
    per: row.damageAddPer ?? 0,
    val: row.damageAddVal ?? 0,
    maxHit,
    from: source,
    capSource,
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

function computeCustomLevel(displaySkillId, level, ctx, warnings) {
  if (displaySkillId === JINMAOHOU_SKILL.FIRE_BURST) {
    const { row } = skillLevelRow(displaySkillId, level, ctx, warnings);
    if (!row) return null;
    eng.getBullet(102289, warnings);
    eng.getBullet(102303, warnings);
    const segments = [makeSegment("actionBullet:102289/102303", row, 5, "千刹火焰攻略图鉴按5连击展示")];
    return finalizeLevel(level, row, "normalActionBullet", segments);
  }

  if (displaySkillId === JINMAOHOU_SKILL.METEOR) {
    const { row } = skillLevelRow(displaySkillId, level, ctx, warnings);
    if (!row) return null;
    eng.getBullet(102272, warnings);
    const segments = [makeSegment("actionBullet:102272", row, 1, "天犼火石攻略图鉴按1连击展示，102273为引爆/表现分支")];
    return finalizeLevel(level, row, "normalActionBullet", segments);
  }

  return null;
}

function computeRideLevel(displaySkillId, concreteIds, level, ride, slotKind, ctx, warnings) {
  if (slotKind === "passive") {
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
  if (EFFECT_ONLY_SKILLS.has(displaySkillId)) return makeEffectOnlyLevel(displaySkillId, level, ctx, warnings);

  const custom = computeCustomLevel(displaySkillId, level, ctx, warnings);
  if (custom) return custom;

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

    const cfg = resolveRideCfgFile(skill, ride, ctx, warnings);
    const dmg = eng.computeDamageSegments(skill, row, cfg.actionCfg, warnings);
    if (dmg.segments && dmg.segments.length) {
      mergedSegments.push(...dmg.segments);
      if (!mergedKind || mergedKind === "normal") mergedKind = dmg.kind;
    }
  }

  if (!firstRow) return null;
  if (mergedSegments.some((s) => s.per > 0)) mergedSegments = mergedSegments.filter((s) => s.per > 0);
  return finalizeLevel(level, firstRow, mergedKind || "normal", mergedSegments);
}

function resolveJinmaohouConcreteSkills(displaySkillId, ctx, warnings) {
  const preset = CONCRETE_SKILLS.get(displaySkillId);
  if (preset) return preset;
  if (ctx.skillById.has(displaySkillId)) return [displaySkillId];
  warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `skill ${displaySkillId} 不在 skill 表` });
  return [];
}

function detectDisplayMaxLevel(displaySkillId, concreteIds, slotKind, ctx) {
  if (slotKind === "passive") return 1;
  if (EFFECT_ONLY_SKILLS.has(displaySkillId)) {
    const skill = ctx.skillById.get(displaySkillId);
    return skill ? eng.detectMaxLevel(skill, ctx.skillLevelById) : 0;
  }
  let maxLevel = 0;
  for (const id of [displaySkillId, ...concreteIds]) {
    const skill = ctx.skillById.get(id);
    if (skill) maxLevel = Math.max(maxLevel, eng.detectMaxLevel(skill, ctx.skillLevelById));
  }
  return maxLevel;
}

function resolveRideReleaseTime(displaySkillId, ride, displayCfg, skill, ctx, warnings) {
  const composite = COMPOSITE_RELEASE_SKILLS.get(displaySkillId);
  if (composite) {
    let frames = 0;
    const actions = [];
    for (const skillId of composite) {
      const s = ctx.skillById.get(skillId);
      if (!s) {
        warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `composite release skill ${skillId} 缺失` });
        continue;
      }
      const cfg = resolveRideCfgFile(s, ride, ctx, warnings);
      const t = cfg.entityCfg?.time?.[s.entityAction];
      if (typeof t !== "number") {
        warnings.push({ code: eng.WARN.SOURCE_DEFAULT_30_FRAMES, detail: `composite release skill ${skillId} action=${s.entityAction} 缺少 time` });
        continue;
      }
      frames += t;
      actions.push(s.entityAction);
    }
    return {
      releaseFrames: frames || null,
      releaseSeconds: frames ? frames / BATTLE_FRAMES_PER_SECOND : null,
      releaseTimeSource: frames ? `entityCtg.time:${actions.join("+")}` : "actionCfgMissing",
    };
  }
  return eng.resolveReleaseTime(displayCfg.entityCfg, skill.entityAction, displayCfg.hasActionCfg, warnings);
}

function buildSkillCard(displaySkillId, ride, slotLabel, slotKind, ctx) {
  const warnings = [];
  const skill = ctx.skillById.get(displaySkillId);
  if (!skill) {
    return { skillId: displaySkillId, name: `技能${displaySkillId}`, error: "skill 不存在", warnings: [{ code: eng.WARN.MISSING_SKILL }] };
  }

  const concreteIds = slotKind === "passive" ? [displaySkillId] : resolveJinmaohouConcreteSkills(displaySkillId, ctx, warnings);
  const cfg = resolveRideCfgFile(skill, ride, ctx, warnings);
  const maxLevel = detectDisplayMaxLevel(displaySkillId, concreteIds, slotKind, ctx);
  const rel = slotKind === "passive"
    ? { releaseFrames: null, releaseSeconds: null, releaseTimeSource: "effectOnly" }
    : resolveRideReleaseTime(displaySkillId, ride, cfg, skill, ctx, warnings);

  const { fixedBuffs, growthBuffRefs } = collectBuffs(displaySkillId, concreteIds, ride, slotKind, ctx, warnings);
  const levels = [];
  for (let lv = 1; lv <= maxLevel; lv++) {
    const l = computeRideLevel(displaySkillId, concreteIds, lv, ride, slotKind, ctx, warnings);
    if (!l) continue;
    l.growthBuffs = growthBuffRefs.map((ref) => {
      const g = eng.resolveBuffGrowth(ref.baseBuffId, lv, ctx.buffById, warnings);
      const rawBuffG = resolveRawBuff(g.buff, ctx.buffById);
      const engBuff = { name: ref.name, bindLabel: ref.bindLabel, time: rawBuffG?.time ?? ref.time, value: buffValueSummary(rawBuffG) };
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
  const skillOv = ctx.overrides.resolveSkill(displaySkillId);
  const segCount = reference ? reference.segments.reduce((a, s) => a + (s.maxHit || 1), 0) : 0;
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
        { skillId: displaySkillId, level: l.level, roleLevel: l.roleLevel, consumeMp: l.consumeMp, totalPer: l.totalPer, totalVal: l.totalVal, growthBuffs: l.growthBuffs || [], releaseSeconds: rel.releaseSeconds, segCount: l.segments.reduce((a, s) => a + (s.maxHit || 1), 0) },
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

function buildSlots(ride, ctx) {
  const slots = [];
  for (const def of SLOT_DEFS) {
    const ids = asArray(ride[def.key]).filter(Boolean);
    ids.forEach((skillId, index) => {
      const slotLabel = def.kind === "sp" || def.kind === "passive" ? def.labelPrefix : `${def.labelPrefix}${index + 1}`;
      slots.push({
        slot: `${def.key}${index + 1}`,
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
  console.log("\n🐎 坐骑技能 Wiki → 金毛犼/冲天神犼");

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
      const raw = resolveRawBuff(g.buff, ctx.buffById);
      if (!raw) return null;
      const v = ov.getPath(raw, valuePath);
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
    const monster = ctx.monsterById.get(Array.isArray(ride.monsterId) ? ride.monsterId[0] : ride.monsterId);
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
      key: "jinmaohou",
      name: "金毛犼/冲天神犼",
      guidePath: GUIDE_PATH,
      rideIds: RIDE_IDS,
      note: "坐骑技能 Wiki 使用满级作为卡片表头参考值，逐级成长见下方成长数值表；千刹火焰和天犼火石按攻略图鉴段数收口，灼天火环按机制效果与防御成长展示。",
    },
    variants,
  };

  u.saveOutput("ride_wiki_jinmaohou", payload, {
    system: "ride_wiki",
    sourceFiles: ["ride.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "beskill.*.json", "buff.*.json", "bullets.json", "entityCtg/*.json", GUIDE_PATH],
    note: "金毛犼/冲天神犼坐骑技能 Wiki，包括千刹火焰、灼天火环、天犼火石、踏焰冲天与紫金铃铛。",
  });

  for (const v of variants) {
    console.log(`  ${v.ride.name}(${v.ride.id}) cfg=${v.ride.cfgFile}`);
    for (const s of v.slots) {
      const b = s.base;
      console.log(`    ${s.slotLabel} ${b.name}(${b.skillId}): ${b.header.kind} ${b.header.segCount}段 per=${b.header.totalPer} 帧=${b.header.releaseFrames} maxLv=${b.maxLevel}${b.warnings.length ? " ⚠" + b.warnings.length : ""}`);
    }
  }
}

if (require.main === module) extract();
module.exports = extract;
