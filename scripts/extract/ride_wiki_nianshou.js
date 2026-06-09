/**
 * 坐骑技能 Wiki - 年兽/上古年兽/永冬年兽提取脚本
 *
 * 坐骑入口沿用现有 ride_wiki_* 结构：ride.skillActive/skillPassive/skillSp
 * 找到展示技能，尾部复用角色技能引擎解析动作、段数、释放时间、buff。
 * 年兽组的图鉴数据来自《造梦无双坐骑数值汇总》图2；其中多段技能必须按
 * 图鉴口径截断，不能把 battle cfg 中的 99 段上限或全屏落星采样点当成真实段数。
 */
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");

const RIDE_OVERRIDE = "nianshou";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const BATTLE_FRAMES_PER_SECOND = 30;
const GUIDE_PATH = "D:/zmws/保存网页资源/4399_Threads_Download/【结弦】造梦无双坐骑数值汇总_64056651/content.md";

const RIDE_IDS = [201071, 201072, 201076];
const NIANSHOU_SKILL = {
  ANCIENT_FREEZE: 20610010101,
  ANCIENT_HORN: 20610010201,
  ANCIENT_BITE: 20610010301,
  ANCIENT_ARMOR: 20610010402,
  ANCIENT_METEOR: 20610010403,
  ANCIENT_PASSIVE: 20610010701,
  WINTER_FREEZE: 20626010101,
  WINTER_HORN: 20626010201,
  WINTER_BITE: 20626010301,
  WINTER_ARMOR: 20626010401,
  WINTER_ARMOR_HIT: 20626010403,
  WINTER_METEOR: 20626010501,
  WINTER_PASSIVE: 20626010701,
  WINTER_HORN_PASSIVE: 20626010600,
};
const NIANSHOU_BUFF = {
  WINTER_ANGER: 136007601,
  WINTER_FORCE_ATTACK: 256000601,
  WINTER_ARMOR_DEFENSE: 6010401,
};

const EFFECT_ONLY_SKILLS = new Set([NIANSHOU_SKILL.ANCIENT_ARMOR]);
const PURE_ATK_ONLY_SKILLS = new Set([NIANSHOU_SKILL.ANCIENT_BITE, NIANSHOU_SKILL.WINTER_BITE]);
const DAMAGE_SOURCE_ONLY = new Map([
  [NIANSHOU_SKILL.WINTER_ARMOR, new Set([NIANSHOU_SKILL.WINTER_ARMOR_HIT])],
]);

const GUIDE_SEGMENT_RULES = new Map([
  [NIANSHOU_SKILL.ANCIENT_FREEZE, { kind: "maxHit", source: "actionBullet:1692", hits: 5, detail: "八荒俱灭攻略图鉴按5连击展示" }],
  [NIANSHOU_SKILL.WINTER_FREEZE, { kind: "maxHit", source: "actionBullet:4594", hits: 5, detail: "万里冰封攻略图鉴按5连击展示" }],
  [NIANSHOU_SKILL.ANCIENT_METEOR, { kind: "repeatSlice", source: "actionBullet:1666", hits: 4, detail: "凶星陨落攻略图鉴按4段伤害计算" }],
  [NIANSHOU_SKILL.WINTER_METEOR, { kind: "repeatSlice", source: "actionBullet:4598", hits: 4, detail: "寒星陨落攻略图鉴按4段伤害计算" }],
]);

function guideRelease(seconds, source) {
  return { frames: Math.round(seconds * BATTLE_FRAMES_PER_SECOND), source };
}

const GUIDE_RELEASE_FRAMES = new Map([
  [NIANSHOU_SKILL.WINTER_ARMOR, guideRelease(1.367, "guide:rideSummary:image8:万年冰甲释放1.367s")],
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

function pctText(n, fixed = null) {
  const value = Math.abs(n) * 100;
  return `${fixed == null ? round(value) : Number(value.toFixed(fixed))}%`;
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
    const { merged, warnings: w } = ov.mergeBuff(engineBuff, override, rawBuff, `[nianshou buff ${baseBuffId} ${engineBuff.name}] `);
    warnings.push(...w);
    out.push(merged);
  } else {
    out.push(engineBuff);
  }
}

function collectBeskillMechanisms(displaySkillId, ctx, warnings) {
  const skill = ctx.skillById.get(displaySkillId);
  const out = [];
  const beSkillIds = [].concat(skill?.beSkill || [], skill?.beSkill2 || []).filter(Boolean);

  for (const beSkillId of beSkillIds) {
    const be = ctx.beskillById.get(beSkillId);
    if (!be) {
      warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${beSkillId} 缺失` });
      continue;
    }

    if (be.label === "pressFrameAddSkillVal") {
      out.push({
        baseBuffId: beSkillId,
        name: "万年冰甲蓄力",
        text: "长按进入防御姿态，松开或到时后释放上挑",
        time: -1,
        bindSource: "mechanismEffect",
        bindLabel: BIND_SOURCE_LABEL.mechanismEffect,
        value: null,
        displayText: "长按进入防御姿态，松开或到时后释放上挑；当前配置不随蓄力额外增加伤害或保护分",
      });
      continue;
    }

    if (be.label === "yearMonsterHurtAddBuffPiles") {
      const energy = be.attribute?.energy;
      const chargedCd = be.chargedCd;
      const chargedNumber = be.chargedNumber;
      out.push({
        baseBuffId: beSkillId,
        name: be.name || "寒怒魔角",
        text: be.name || null,
        time: -1,
        bindSource: "mechanismEffect",
        bindLabel: BIND_SOURCE_LABEL.mechanismEffect,
        value: null,
        displayText: `受到伤害给年兽角充能${energy ?? "?"}点；充能满后下一次普攻上挑、寒霜之角或万年冰甲上挑获得强攻，每次乘骑最多${chargedNumber ?? "?"}次，充能冷却${chargedCd != null ? `${chargedCd / BATTLE_FRAMES_PER_SECOND}s` : "—"}`,
      });
      pushBuffCard(out, displaySkillId, NIANSHOU_BUFF.WINTER_ANGER, ctx.buffById.get(NIANSHOU_BUFF.WINTER_ANGER), "mechanismEffect", ctx, warnings, null);
      pushBuffCard(out, displaySkillId, NIANSHOU_BUFF.WINTER_FORCE_ATTACK, ctx.buffById.get(NIANSHOU_BUFF.WINTER_FORCE_ATTACK), "mechanismEffect", ctx, warnings, null);
    }
  }

  return out;
}

function collectPassiveEffects(skillId, ctx, warnings) {
  const skill = ctx.skillById.get(skillId);
  const out = [];
  const beSkillIds = [].concat(skill?.beSkill || [], skill?.beSkill2 || []).filter(Boolean);

  for (const beSkillId of beSkillIds) {
    const be = ctx.beskillById.get(beSkillId);
    if (!be) {
      warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `passive beskill ${beSkillId} 缺失` });
      continue;
    }

    if (be.label === "appearBuff1") {
      for (const buffId of asArray(be.attribute).filter(Boolean)) {
        pushBuffCard(out, skillId, buffId, ctx.buffById.get(buffId), "passiveEffect", ctx, warnings, null);
      }
      continue;
    }

    if (be.label === "toPlayerProp" && Array.isArray(be.attribute)) {
      const attrs = be.attribute
        .filter((x) => Array.isArray(x) && typeof x[1] === "number")
        .map((x) => `${propLabel(x[0])}${pctText(x[1])}`);
      out.push({
        baseBuffId: beSkillId,
        name: be.name || skill.desName || "被动效果",
        text: be.text || null,
        time: -1,
        bindSource: "passiveEffect",
        bindLabel: BIND_SOURCE_LABEL.passiveEffect,
        value: null,
        displayText: `待机主人继承坐骑${attrs.join("、")}`,
      });
    }
  }

  return out;
}

function collectGuideEffects(displaySkillId) {
  if (displaySkillId === NIANSHOU_SKILL.ANCIENT_ARMOR) {
    return [{
      baseBuffId: NIANSHOU_SKILL.ANCIENT_ARMOR,
      name: "千年兽甲增益",
      text: "攻略补充",
      time: -1,
      bindSource: "guideEffect",
      bindLabel: BIND_SOURCE_LABEL.guideEffect,
      value: null,
      displayText: "图鉴口径为无伤害增益技：提升自身攻击和防御，持续约12s；无实际伤害段",
    }];
  }
  return [];
}

function growthBuffDisplayText(ref, rawBuff) {
  const value = buffValueSummary(rawBuff);
  if (!value) return null;
  if (ref.baseBuffId === NIANSHOU_BUFF.WINTER_ARMOR_DEFENSE) {
    if (typeof value.val !== "number") return null;
    return `万年冰甲防御姿态：防御提升固定值${value.val}，持续随防御姿态存在`;
  }
  const parts = [];
  if (typeof value.per === "number" && value.per !== 0) parts.push(`比例${pctText(value.per)}`);
  if (typeof value.val === "number" && value.val !== 0) parts.push(`固定值${value.val}`);
  if (!parts.length) return null;
  return `${ref.name}：${parts.join(" + ")}`;
}

function propLabel(key) {
  const labels = { atk: "攻击", def: "防御", hp: "生命", hitVal: "命中", crit: "暴击", dodge: "闪避", tough: "韧性" };
  return labels[key] || key;
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
      const label = `[nianshou buff ${ref.baseBuffId} ${base.name}] `;

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

    fixedBuffs.push(...collectBeskillMechanisms(skillId, ctx, warnings));
  }

  if (slotKind === "passive") fixedBuffs.push(...collectPassiveEffects(displaySkillId, ctx, warnings));
  fixedBuffs.push(...collectGuideEffects(displaySkillId));
  return { fixedBuffs, growthBuffRefs };
}

function applyGuideSegmentRules(displaySkillId, segments) {
  const rule = GUIDE_SEGMENT_RULES.get(displaySkillId);
  if (!rule) return segments;

  if (rule.kind === "maxHit") {
    return segments.map((s) => s.from === rule.source ? { ...s, maxHit: rule.hits, capSource: rule.detail } : s);
  }

  if (rule.kind === "repeatSlice") {
    const matched = segments.filter((s) => s.from === rule.source).slice(0, rule.hits).map((s) => ({ ...s, capSource: rule.detail }));
    const rest = segments.filter((s) => s.from !== rule.source && (s.per || 0) > 0);
    return [...rest, ...matched];
  }

  return segments;
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
    addDefendVal: row?.addDefendVal ?? null,
  };
}

function computeRideLevel(displaySkillId, concreteIds, level, ride, slotKind, ctx, warnings) {
  if (slotKind === "passive") {
    const skill = ctx.skillById.get(concreteIds[0]);
    const row = skill ? ctx.skillLevelById.get(eng.skillLevelRowId(skill, 1)) : null;
    return {
      level: 1,
      roleLevel: row?.roleLevel ?? null,
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

  let mergedSegments = [];
  let mergedKind = null;
  let firstRow = null;
  const sourceOnly = DAMAGE_SOURCE_ONLY.get(displaySkillId);

  for (const skillId of concreteIds) {
    const skill = ctx.skillById.get(skillId);
    if (!skill) continue;
    if (sourceOnly && !sourceOnly.has(skillId)) continue;

    const row = ctx.skillLevelById.get(eng.skillLevelRowId(skill, level));
    if (!row) {
      warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `skill ${skill.id} lv${level} 缺失` });
      continue;
    }
    if (!firstRow) firstRow = row;

    const cfg = resolveRideCfgFile(skill, ride, ctx, warnings);
    const dmg = eng.computeDamageSegments(skill, row, cfg.actionCfg, warnings);
    if (dmg.segments && dmg.segments.length) {
      const segments = dmg.segments.map((s) => PURE_ATK_ONLY_SKILLS.has(skillId) ? { ...s, val: 0 } : s);
      mergedSegments.push(...segments);
      if (!mergedKind || mergedKind === "normal") mergedKind = dmg.kind;
    }
  }

  if (!firstRow) return null;
  mergedSegments = applyGuideSegmentRules(displaySkillId, mergedSegments);
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
    kind: mergedKind || "normal",
    segments: mergedSegments,
    totalPer: round(totalPer),
    totalVal: round(totalVal),
    addDefendVal: firstRow.addDefendVal ?? null,
  };
}

function resolveNianshouConcreteSkills(displaySkillId, ctx, warnings) {
  const ids = eng.resolveConcreteSkills(displaySkillId, ctx.skillById, warnings);
  if (displaySkillId === NIANSHOU_SKILL.WINTER_ARMOR && !ids.includes(NIANSHOU_SKILL.WINTER_ARMOR_HIT)) {
    ids.push(NIANSHOU_SKILL.WINTER_ARMOR_HIT);
  }
  return ids;
}

function detectDisplayMaxLevel(displaySkillId, concreteIds, slotKind, ctx) {
  if (slotKind === "passive") return 1;
  if (EFFECT_ONLY_SKILLS.has(displaySkillId)) {
    const skill = ctx.skillById.get(displaySkillId);
    return skill ? eng.detectMaxLevel(skill, ctx.skillLevelById) : 0;
  }
  const sourceOnly = DAMAGE_SOURCE_ONLY.get(displaySkillId);
  const ids = sourceOnly ? concreteIds.filter((id) => sourceOnly.has(id)) : concreteIds;
  let maxLevel = 0;
  for (const id of ids) {
    const skill = ctx.skillById.get(id);
    if (skill) maxLevel = Math.max(maxLevel, eng.detectMaxLevel(skill, ctx.skillLevelById));
  }
  return maxLevel;
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

function buildSkillCard(displaySkillId, ride, slotLabel, slotKind, ctx) {
  const warnings = [];
  const skill = ctx.skillById.get(displaySkillId);
  if (!skill) {
    return { skillId: displaySkillId, name: `技能${displaySkillId}`, error: "skill 不存在", warnings: [{ code: eng.WARN.MISSING_SKILL }] };
  }

  const concreteIds = slotKind === "passive"
    ? [displaySkillId]
    : resolveNianshouConcreteSkills(displaySkillId, ctx, warnings);
  const cfg = resolveRideCfgFile(skill, ride, ctx, warnings);
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
      const rawBuffG = resolveRawBuff(g.buff, ctx.buffById);
      const engBuff = {
        baseBuffId: ref.baseBuffId,
        effectiveBuffId: g.effectiveBuffId,
        name: rawBuffG?.name || ref.name,
        bindLabel: ref.bindLabel,
        time: rawBuffG?.time ?? ref.time,
        value: buffValueSummary(rawBuffG),
        displayText: rawBuffG ? growthBuffDisplayText(ref, rawBuffG) : null,
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
      addDefendVal: skill.addDefendVal ?? null,
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
        { skillId: displaySkillId, level: l.level, roleLevel: l.roleLevel, consumeMp: l.consumeMp, totalPer: l.totalPer, totalVal: l.totalVal, releaseSeconds: rel.releaseSeconds, segCount: l.segments.reduce((a, s) => a + (s.maxHit || 1), 0) },
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
  console.log("\n🐎 坐骑技能 Wiki → 年兽/上古年兽/永冬年兽");

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
      key: "nianshou",
      name: "年兽/上古年兽/永冬年兽",
      guidePath: GUIDE_PATH,
      rideIds: RIDE_IDS,
      note: "坐骑技能 Wiki 使用满级作为卡片表头参考值，逐级成长见下方成长数值表；八荒俱灭/万里冰封与凶星陨落/寒星陨落按攻略图鉴段数截断，千年兽甲仅展示机制效果。",
    },
    variants,
  };

  u.saveOutput("ride_wiki_nianshou", payload, {
    system: "ride_wiki",
    sourceFiles: ["ride.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "beskill.*.json", "buff.*.json", "bullets.json", "entityCtg/*.json", GUIDE_PATH],
    note: "年兽/上古年兽/永冬年兽坐骑技能 Wiki，包括主动技能、无双、护甲增益、创世冰藤与寒怒魔角被动。",
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
