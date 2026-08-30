/**
 * 坐骑技能 Wiki - 青狮/青鬃狮王提取脚本
 *
 * 坐骑入口沿用现有 ride_wiki_* 结构：ride.skillActive/skillPassive/skillSp
 * 找到展示技能，尾部复用角色技能引擎解析动作、段数、释放时间、buff。
 * 青狮的斩杀、威压补伤、法相取消、愈战愈勇叠层属于机制效果，
 * 在导出阶段按攻略和表数据成文输出，前端只负责渲染。
 */
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");

const RIDE_OVERRIDE = "qingshi";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const GUIDE_PATH = "D:/zmws/保存网页资源/4399_Threads_Download/【结弦】青鬃狮王详解：数值+机制+养成玩法分析_64295072/content.md";

const RIDE_IDS = [201802];
const QINGSHI_SKILL = {
  ROAR: 20632010101,
  POUNCE: 20632010201,
  DEVOUR: 20632010301,
  PRESSURE: 20632010401,
  AVATAR: 20632010501,
  AVATAR_CANCEL: 20632010502,
  PASSIVE: 20632010601,
};
const QINGSHI_BUFF = {
  PASSIVE_ATK: 5016401,
  PASSIVE_DEF: 6013501,
  STAMINA_RECOVER: 163001801,
};
const PURE_ATK_ONLY_SKILLS = new Set([QINGSHI_SKILL.AVATAR]);

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
const BUFF_TYPE_LABEL = {
  5: "攻击",
  6: "防御",
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
  if (!skill) return `技能${skillId}`;
  const rawName = skill.Name || skill.name || "";
  if (skill.desName === "普攻") {
    const m = /普攻(\d+)/.exec(rawName);
    if (m) return `普攻第${m[1]}段`;
  }
  return skill.desName || rawName || `技能${skillId}`;
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
    const { merged, warnings: w } = ov.mergeBuff(engineBuff, override, rawBuff, `[qingshi buff ${baseBuffId} ${engineBuff.name}] `);
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

    if (be.label === "dead") {
      const leftHpPer = be.scopeParam?.judgeHurtEnityCondition?.[0]?.param?.leftHpPer;
      const beforeHpPer = typeof leftHpPer === "number" ? leftHpPer / (1 + leftHpPer) : null;
      out.push({
        baseBuffId: beSkillId,
        name: "吞噬斩杀",
        text: be.name || null,
        time: -1,
        bindSource: "mechanismEffect",
        bindLabel: BIND_SOURCE_LABEL.mechanismEffect,
        value: null,
        displayText: typeof leftHpPer === "number"
          ? `造成伤害超过伤害后敌人剩余生命的${pctText(leftHpPer, 2)}时直接吞噬；等价于超过伤害前当前生命约${pctText(beforeHpPer, 1)}`
          : "造成伤害满足配置条件时直接吞噬目标",
      });
      continue;
    }

    if (be.label === "addDamageWithOtherSkill") {
      const linkedSkillId = be.attribute?.skillId;
      const linkedSkill = ctx.skillById.get(linkedSkillId);
      const row = linkedSkill ? ctx.skillLevelById.get(eng.baseSkillLevelId(linkedSkill)) : null;
      if (!linkedSkill || !row) {
        warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `威压补伤 skill ${linkedSkillId} 缺少基础等级行` });
        continue;
      }
      out.push({
        baseBuffId: beSkillId,
        name: "威压补伤",
        text: be.name || null,
        time: -1,
        bindSource: "mechanismEffect",
        bindLabel: BIND_SOURCE_LABEL.mechanismEffect,
        value: { per: row.damageAddPer ?? null, val: row.damageAddVal ?? null },
        displayText: `目标带【狮王威压】减速时，吞天噬地追加${row.damageAddPer} * atk + 狮王威压当前等级固伤；该段独立结算暴击/格挡，不受增减伤效果影响`,
      });
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

    if (be.label === "addBuffWithSkillId" && be.attribute && typeof be.attribute === "object") {
      const trigger = be.scope === "hitCb" ? "命中" : be.scope === "killCb" ? "击杀" : be.scope || "触发";
      const items = Object.entries(be.attribute).map(([triggerSkillId, entries]) => {
        const piles = Array.isArray(entries) ? entries.map((x) => x.piles).filter((n) => typeof n === "number") : [];
        return `${skillName(triggerSkillId, ctx)} +${piles.join("/") || "?"}层`;
      });
      const atkBuff = ctx.buffById.get(QINGSHI_BUFF.PASSIVE_ATK);
      const defBuff = ctx.buffById.get(QINGSHI_BUFF.PASSIVE_DEF);
      const atk = buffValueSummary(atkBuff)?.per;
      const def = buffValueSummary(defBuff)?.per;
      const maxPiles = Math.max(atkBuff?.maxPiles || 0, defBuff?.maxPiles || 0);
      out.push({
        baseBuffId: beSkillId,
        name: be.name || "愈战愈勇叠层",
        text: be.text || null,
        time: -1,
        bindSource: "passiveEffect",
        bindLabel: BIND_SOURCE_LABEL.passiveEffect,
        value: null,
        displayText: `${trigger}叠层：${items.join("；")}。每层攻击+${pctText(atk)}、防御+${pctText(def)}，上限${maxPiles}层`,
      });
    }
  }

  out.push({
    baseBuffId: QINGSHI_SKILL.PASSIVE,
    name: "青狮·骑术强化",
    text: "攻略补充",
    time: -1,
    bindSource: "guideEffect",
    bindLabel: BIND_SOURCE_LABEL.guideEffect,
    value: null,
    displayText: "携带【青狮·骑术】时，每层改为攻击+0.15%、防御+0.2%；吞天噬地击杀回复提升为5.66% + 840体力",
  });

  return out;
}

function collectGuideEffects(displaySkillId) {
  if (displaySkillId === QINGSHI_SKILL.AVATAR) {
    return [{
      baseBuffId: QINGSHI_SKILL.AVATAR_CANCEL,
      name: "取消法相",
      text: "攻略补充",
      time: -1,
      bindSource: "guideEffect",
      bindLabel: BIND_SOURCE_LABEL.guideEffect,
      value: null,
      displayText: "法相释放2s后可再次使用取消法相；按法相已用时间与期间技能使用比例返还无双冷却和怒气进度",
    }];
  }
  return [];
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
      const label = `[qingshi buff ${ref.baseBuffId} ${base.name}] `;

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

function computeRideLevel(concreteIds, level, ride, slotKind, ctx, warnings) {
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
      const segments = dmg.segments.map((s) => PURE_ATK_ONLY_SKILLS.has(skillId) ? { ...s, val: 0 } : s);
      mergedSegments.push(...segments);
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
    kind: mergedKind || "normal",
    segments: mergedSegments,
    totalPer: round(totalPer),
    totalVal: round(totalVal),
    addDefendVal: firstRow.addDefendVal ?? null,
  };
}

function buildSkillCard(displaySkillId, ride, slotLabel, slotKind, ctx) {
  const warnings = [];
  const skill = ctx.skillById.get(displaySkillId);
  if (!skill) {
    return { skillId: displaySkillId, name: `技能${displaySkillId}`, error: "skill 不存在", warnings: [{ code: eng.WARN.MISSING_SKILL }] };
  }

  const concreteIds = slotKind === "passive"
    ? [displaySkillId]
    : eng.resolveConcreteSkills(displaySkillId, ctx.skillById, warnings);
  const cfg = resolveRideCfgFile(skill, ride, ctx, warnings);
  const maxLevel = slotKind === "passive" ? 1 : eng.detectMaxLevel(skill, ctx.skillLevelById);
  const rel = slotKind === "passive"
    ? { releaseFrames: null, releaseSeconds: null, releaseTimeSource: "effectOnly" }
    : eng.resolveReleaseTime(cfg.entityCfg, skill.entityAction, cfg.hasActionCfg, warnings);

  const { fixedBuffs, growthBuffRefs } = collectBuffs(displaySkillId, concreteIds, ride, slotKind, ctx, warnings);
  const levels = [];
  for (let lv = 1; lv <= maxLevel; lv++) {
    const l = computeRideLevel(concreteIds, lv, ride, slotKind, ctx, warnings);
    if (!l) continue;
    l.growthBuffs = growthBuffRefs.map((ref) => {
      const g = eng.resolveBuffGrowth(ref.baseBuffId, lv, ctx.buffById, warnings);
      const rawBuffG = resolveRawBuff(g.buff, ctx.buffById);
      const engBuff = { name: ref.name, bindLabel: ref.bindLabel, time: ref.time, value: buffValueSummary(rawBuffG) };
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
      segments: reference ? reference.segments.map((s) => ({ per: s.per, maxHit: s.maxHit, from: s.from })) : [],
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
  console.log("\n🐎 坐骑技能 Wiki → 青狮/青鬃狮王");

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
      key: "qingshi",
      name: "青狮/青鬃狮王",
      guidePath: GUIDE_PATH,
      rideIds: RIDE_IDS,
      note: "坐骑技能 Wiki 使用满级作为卡片表头参考值，逐级成长见下方成长数值表；斩杀、威压补伤、法相取消和被动叠层按攻略机制成文展示。",
    },
    variants,
  };

  u.saveOutput("ride_wiki_qingshi", payload, {
    system: "ride_wiki",
    sourceFiles: ["ride.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "beskill.*.json", "buff.*.json", "bullets.json", "entityCtg/*.json", GUIDE_PATH],
    note: "青狮/青鬃狮王坐骑技能 Wiki，包括主动技能、威压补伤、巨狮法相、取消法相与愈战愈勇被动。",
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
