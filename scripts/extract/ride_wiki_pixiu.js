/**
 * 坐骑技能 Wiki - 天禄/辟邪提取脚本
 *
 * 入口沿用谛听坐骑 Wiki:从 ride.skillActive/skillPassive/skillSp 和 ride.monsterId
 * 找到技能与实体配置,再复用 role wiki 的 skill-engine 计算段数、释放时间、buff。
 * 3 技能是护盾技能,不把 skillLevel 里的 0/0 当成假伤害段展示。
 */
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");

const RIDE_OVERRIDE = "pixiu";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const GUIDE_PATH = "D:/zmws/保存网页资源/4399_Threads_Download/【结弦】谛听与貔貅~蟠桃坐骑数值侧百科_64120240/content.md";

const RIDE_IDS = [201701, 201702, 201703, 201704];
const SLOT_DEFS = [
  { key: "skillActive", labelPrefix: "技能", kind: "active" },
  { key: "skillSp", labelPrefix: "无双", kind: "sp" },
  { key: "skillPassive", labelPrefix: "被动", kind: "passive" },
];

const SHIELD_SKILLS = new Set([20629020301, 20629030301]);
const FORCE_FIXED_BUFFS = new Set([35003101, 35003102]);

const BIND_SOURCE_LABEL = {
  beSkill: "被动技能",
  beSkill2: "被动技能",
  entityActionComBuff: "技能附带",
  bulletHitBuff: "命中附带",
  passiveEffect: "被动效果",
  beskillEffect: "机制效果",
};

const ATTR_LABEL = {
  crit: "暴击",
  lucky: "幸运",
  tenacity: "韧性",
  guardian: "守护",
};
const BUFF_TYPE_LABEL = {
  9: "暴击",
  10: "韧性",
  11: "幸运",
  12: "守护",
  13: "护盾",
};
const EXTRA_DAMAGE_TARGET = {
  toBossDamageAdd: "妖王",
  toTreasureBossDamageAdd: "魔王",
  toCallMonsterDamageAdd: "召唤物",
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

function pctText(n) {
  return `${round(Math.abs(n) * 100)}%`;
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
    const { merged, warnings: w } = ov.mergeBuff(engineBuff, override, rawBuff, `[ride buff ${baseBuffId} ${engineBuff.name}] `);
    warnings.push(...w);
    out.push(merged);
  } else {
    out.push(engineBuff);
  }
}

function collectBeskillEffects(displaySkillId, ctx, warnings) {
  const skill = ctx.skillById.get(displaySkillId);
  const fixedBuffs = [];
  const growthBuffRefs = [];
  const beSkillIds = [].concat(skill?.beSkill || [], skill?.beSkill2 || []).filter(Boolean);

  for (const beSkillId of beSkillIds) {
    const be = ctx.beskillById.get(beSkillId);
    if (!be) {
      warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${beSkillId} 缺失` });
      continue;
    }

    if (be.label === "pixieHitAddBuffs") {
      const buffIds = asArray(be.attribute?.buffs).filter(Boolean);
      for (const buffId of buffIds) {
        const g1 = FORCE_FIXED_BUFFS.has(buffId)
          ? { levelMode: "fixed", effectiveBuffId: buffId, buff: ctx.buffById.get(buffId) || null }
          : eng.resolveBuffGrowth(buffId, 1, ctx.buffById, warnings);
        if (!g1.buff) continue;
        const rawBuff1 = resolveRawBuff(g1.buff, ctx.buffById);
        const base = {
          baseBuffId: buffId,
          name: rawBuff1.name || `buff${buffId}`,
          text: rawBuff1.text || null,
          time: rawBuff1.time ?? null,
          bindSource: "beskillEffect",
          bindLabel: BIND_SOURCE_LABEL.beskillEffect,
          levelMode: g1.levelMode,
        };
        const override = ctx.overrides.resolveBuff(displaySkillId, buffId);
        const label = `[ride beskill buff ${buffId} ${base.name}] `;
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
        if (ctx.emitTemplate) ctx.overrides.recordBuff(displaySkillId, buffId, rawBuff1, null);
      }
      continue;
    }

    const target = EXTRA_DAMAGE_TARGET[be.label];
    if (target) {
      const rate = be.attribute?.rate;
      fixedBuffs.push({
        baseBuffId: beSkillId,
        name: be.name || "额外伤害",
        text: be.text || null,
        time: -1,
        bindSource: "beskillEffect",
        bindLabel: BIND_SOURCE_LABEL.beskillEffect,
        value: { per: typeof rate === "number" ? rate : null, val: typeof be.attribute?.value === "number" ? be.attribute.value : null },
        displayText: typeof rate === "number" ? `对${target}额外造成${pctText(rate)}伤害` : be.text,
      });
    }
  }

  return { fixedBuffs, growthBuffRefs };
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

      const g1 = FORCE_FIXED_BUFFS.has(ref.baseBuffId)
        ? { levelMode: "fixed", effectiveBuffId: ref.baseBuffId, buff: ctx.buffById.get(ref.baseBuffId) || null }
        : eng.resolveBuffGrowth(ref.baseBuffId, 1, ctx.buffById, warnings);
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
      const label = `[ride buff ${ref.baseBuffId} ${base.name}] `;

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

    const beRes = collectBeskillEffects(skillId, ctx, warnings);
    fixedBuffs.push(...beRes.fixedBuffs);
    growthBuffRefs.push(...beRes.growthBuffRefs);
  }

  if (slotKind === "passive") fixedBuffs.push(...collectPassiveEffects(displaySkillId, ctx, warnings));
  return { fixedBuffs, growthBuffRefs };
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

    if (be.label === "toPlayerProp" && Array.isArray(be.attribute)) {
      const attrs = be.attribute
        .filter((x) => Array.isArray(x) && typeof x[1] === "number")
        .map((x) => `${ATTR_LABEL[x[0]] || x[0]} ${pctText(x[1])}`);
      if (attrs.length) {
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
      continue;
    }

    if (be.label === "appearBuff1" && Array.isArray(be.attribute)) {
      for (const buffId of be.attribute) {
        const buff = ctx.buffById.get(buffId);
        if (!buff) {
          warnings.push({ code: eng.WARN.MISSING_BUFF, detail: `passive buff ${buffId} 缺失` });
          continue;
        }
        const value = buffValueSummary(buff);
        out.push({
          baseBuffId: buffId,
          name: buff.name || be.name || "被动效果",
          text: buff.text || be.text || null,
          time: buff.time ?? -1,
          bindSource: "passiveEffect",
          bindLabel: BIND_SOURCE_LABEL.passiveEffect,
          value,
          displayText: `自身${BUFF_TYPE_LABEL[buff.type] || buff.text || buff.name || "属性"}提升${value?.per != null ? pctText(value.per) : ""}`,
        });
      }
      continue;
    }

    out.push({
      baseBuffId: beSkillId,
      name: be.name || skill.desName || "被动效果",
      text: be.text || null,
      time: -1,
      bindSource: "passiveEffect",
      bindLabel: BIND_SOURCE_LABEL.passiveEffect,
      value: null,
      displayText: be.text || `beskill ${beSkillId}`,
    });
  }

  return out;
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
      mergedSegments.push(...dmg.segments);
      if (!mergedKind || mergedKind === "normal") mergedKind = dmg.kind;
    }
  }

  if (!firstRow) return null;

  const shieldOnly = concreteIds.some((id) => SHIELD_SKILLS.has(id));
  const hasPositiveDamage = mergedSegments.some((s) => (s.per || 0) > 0 || (s.val || 0) > 0);
  if (shieldOnly && !hasPositiveDamage) {
    return {
      level,
      roleLevel: firstRow.roleLevel ?? null,
      consumeMp: firstRow.consumeMp ?? null,
      soulCost: firstRow.soulCost ?? null,
      kind: "effectOnly",
      segments: [],
      totalPer: 0,
      totalVal: 0,
      addDefendVal: firstRow.addDefendVal ?? null,
    };
  }

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
  console.log("\n🐎 坐骑技能 Wiki → 天禄/辟邪");

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
      key: "pixiu",
      name: "天禄/辟邪",
      guidePath: GUIDE_PATH,
      rideIds: RIDE_IDS,
      note: "坐骑技能 Wiki 使用满级作为卡片表头参考值，逐级成长见下方成长数值表；护盾技能仅展示机制效果。",
    },
    variants,
  };

  u.saveOutput("ride_wiki_pixiu", payload, {
    system: "ride_wiki",
    sourceFiles: ["ride.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "beskill.*.json", "buff.*.json", "bullets.json", "entityCtg/*.json", GUIDE_PATH],
    note: "天禄/辟邪坐骑技能 Wiki，包括异化前后技能、护盾、玉纹、被动与无双额外伤害。",
  });

  for (const v of variants) {
    console.log(`  ${v.ride.name}(${v.ride.id}) cfg=${v.ride.cfgFile}`);
    for (const s of v.slots) {
      const b = s.base;
      const top = b.levels && b.levels[b.levels.length - 1];
      console.log(`    ${s.slotLabel} ${b.name}(${b.skillId}): ${b.header.kind} ${b.header.segCount}段 per=${b.header.totalPer} 帧=${b.header.releaseFrames} maxLv=${b.maxLevel}${b.warnings.length ? " ⚠" + b.warnings.length : ""}`);
      if (top && top.totalPer !== b.header.totalPer) console.log(`      满级 per=${top.totalPer}`);
    }
  }
}

if (require.main === module) extract();
module.exports = extract;
