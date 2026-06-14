/**
 * 角色技能 Wiki - 敖烈（白龙）提取脚本
 *
 * 按 docs/角色wiki开发.md 的链路导出敖烈全技能。白龙的充电觉醒会在充满电后
 * 转成另一个真实 skill.id，本脚本按 beskill 指向的真实技能计算数值。
 */
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");
const passiveCards = require("./lib/role-passive-cards");

const DEFAULT_METRICS = [
  { key: "manaConv", label: "蓝转", scope: "level", expr: "totalVal / consumeMp", when: "totalVal * consumeMp", fixed: 2 },
  { key: "atkConv", label: "攻转", scope: "level", expr: "totalPer / releaseSeconds", when: "totalPer * releaseSeconds", fixed: 3 },
];

const ROLE_OVERRIDE = "aolie";
const GUIDE_PATH = "D:/zmws/保存网页资源/4399_Threads_Download/【结弦】白龙数值侧百科_64023162/content.md";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const ROLE_ID = 6;
const TRANS_MONSTER_ID = 106;
const NO_DAMAGE_SKILLS = new Set([6001230]);
const FORCE_DISTINCT_AWAKENS = new Set([6001076]);

const SLOTS = [
  { key: "skill1", label: "技能1" },
  { key: "skill2", label: "技能2" },
  { key: "skill3", label: "技能3" },
  { key: "skill4", label: "技能4" },
  { key: "trick", label: "绝技" },
  { key: "transSkill1", label: "无双技能1" },
  { key: "transSkill2", label: "无双技能2" },
  { key: "transSkill3", label: "无双技能3" },
  { key: "transSkill4", label: "无双技能4" },
];

const BIND_SOURCE_LABEL = {
  beSkill: "被动技能",
  beSkill2: "被动技能",
  entityActionComBuff: "技能附带",
  bulletHitBuff: "命中附带",
};

function idx(arr) {
  const m = new Map();
  for (const r of arr) m.set(r.id, r);
  return m;
}

function pushIds(out, value) {
  if (value == null) return;
  if (Array.isArray(value)) value.forEach((v) => pushIds(out, v));
  else if (typeof value === "number") out.push(value);
}

function chargedSkillId(skill, ctx) {
  const beIds = [];
  pushIds(beIds, skill.beSkill);
  pushIds(beIds, skill.beSkill2);
  for (const beId of beIds) {
    const be = ctx.beskillById.get(beId);
    const next = be && be.attribute && be.attribute.skillId;
    if (typeof next === "number" && ctx.skillById.has(next)) return next;
  }
  return null;
}

function resolveAolieConcreteSkills(displaySkillId, ctx, warnings) {
  const skill = ctx.skillById.get(displaySkillId);
  if (!skill) return eng.resolveConcreteSkills(displaySkillId, ctx.skillById, warnings);

  const charged = chargedSkillId(skill, ctx);
  if (charged) return [charged];

  return eng.resolveConcreteSkills(displaySkillId, ctx.skillById, warnings);
}

function resolveAolieCfgFile(skill, slot, roleId, monsterById, warnings) {
  const isTrans = /^transSkill/.test(slot || "") || [6001230, 6001240, 6001250, 6001260].includes(skill.id);
  const action = skill.entityAction;

  const tryCfg = (cfgFile) => {
    if (!cfgFile) return null;
    const cfg = eng.loadEntityCfg(cfgFile);
    if (cfg && action && cfg[action]) return cfg;
    return null;
  };

  const ownerMonsters = [];
  for (const m of monsterById.values()) {
    const all = [].concat(m.skillIds || [], m.skyskillIds || [], m.vSkill || [], m.atkIds || [], m.skyAtkIds || []);
    if (all.includes(skill.id)) ownerMonsters.push(m);
  }

  const selfMonster = monsterById.get(roleId);
  const transMonster = monsterById.get(TRANS_MONSTER_ID);
  const order = isTrans ? [transMonster, ...ownerMonsters, selfMonster] : [selfMonster, ...ownerMonsters, transMonster];

  for (const m of order) {
    if (!m) continue;
    const cfg = tryCfg(m.cfgFile);
    if (cfg) {
      return {
        cfgFileResolved: m.cfgFile,
        cfgResolveSource: m.id === TRANS_MONSTER_ID ? "transForm" : (m.id === roleId ? "self" : "ownerMonster"),
        cfgMonsterId: m.id,
        cfgMonsterName: m.name,
        hasActionCfg: true,
        actionCfg: cfg[action],
        entityCfg: cfg,
      };
    }
  }

  const fallback = selfMonster && selfMonster.cfgFile ? selfMonster.cfgFile : (transMonster && transMonster.cfgFile ? transMonster.cfgFile : null);
  if (fallback && action) {
    const fallbackCfg = eng.loadEntityCfg(fallback);
    if (fallbackCfg && fallbackCfg[action]) {
      return {
        cfgFileResolved: fallback,
        cfgResolveSource: "fallback",
        cfgMonsterId: selfMonster ? selfMonster.id : null,
        cfgMonsterName: selfMonster ? selfMonster.name : null,
        hasActionCfg: true,
        actionCfg: fallbackCfg[action],
        entityCfg: fallbackCfg,
      };
    }
  }

  return {
    cfgFileResolved: fallback,
    cfgResolveSource: "fallback",
    cfgMonsterId: selfMonster ? selfMonster.id : null,
    cfgMonsterName: selfMonster ? selfMonster.name : null,
    hasActionCfg: false,
    actionCfg: null,
    entityCfg: fallback ? eng.loadEntityCfg(fallback) : null,
  };
}

function buffValueSummary(buff) {
  if (!buff) return null;
  let v = buff.value;
  if (Array.isArray(v) && Array.isArray(v[0])) v = v[0];
  if (Array.isArray(v)) {
    return { per: typeof v[0] === "number" ? v[0] : null, val: typeof v[1] === "number" ? v[1] : null };
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

function engineBuffText(buff) {
  const v = buffValueSummary(buff);
  if (!v) return null;
  const parts = [];
  if (typeof v.per === "number" && v.per !== 0) parts.push(`${(v.per * 100).toFixed(1)}%`);
  if (typeof v.val === "number" && v.val !== 0) parts.push(String(v.val));
  return parts.length ? parts.join(" + ") : null;
}

function collectAolieBuffs(displaySkillId, concreteIds, slot, ctx, warnings) {
  const fixedBuffs = [];
  const growthBuffRefs = [];
  const seenBuffs = new Set();

  for (const skillId of concreteIds) {
    const skill = ctx.skillById.get(skillId);
    if (!skill) continue;
    const cfg = resolveAolieCfgFile(skill, slot, ROLE_ID, ctx.monsterById, warnings);
    const refs = eng.scanBuffs(skill, cfg.actionCfg, ctx.beskillById, warnings);

    for (const ref of refs) {
      const seenKey = `${ref.baseBuffId}:${ref.bindSource}`;
      if (seenBuffs.has(seenKey)) continue;
      seenBuffs.add(seenKey);

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
      const label = `[buff ${ref.baseBuffId} ${base.name}] `;
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
      if (ctx.emitTemplate) {
        ctx.overrides.recordBuff(displaySkillId, ref.baseBuffId, rawBuff1, engineBuffText(rawBuff1));
      }
    }
  }

  return { fixedBuffs, growthBuffRefs };
}

function maxLevelForConcrete(displaySkill, concreteIds, ctx) {
  const levels = [];
  for (const skillId of concreteIds) {
    const skill = ctx.skillById.get(skillId);
    if (skill) levels.push(eng.detectMaxLevel(skill, ctx.skillLevelById));
  }
  const max = Math.max(...levels.filter((n) => n > 0));
  if (Number.isFinite(max) && max > 0) return max;
  return eng.detectMaxLevel(displaySkill, ctx.skillLevelById);
}

function computeAolieLevel(concreteIds, level, slot, ctx, warnings) {
  let mergedSegments = [];
  let mergedKind = null;
  let firstRow = null;

  for (const skillId of concreteIds) {
    const skill = ctx.skillById.get(skillId);
    if (!skill) continue;
    const row = eng.querySkillLevel(skill, level, ctx.skillLevelById, warnings);
    if (!row) continue;
    if (!firstRow) firstRow = row;

    if (NO_DAMAGE_SKILLS.has(skillId)) continue;

    const cfg = resolveAolieCfgFile(skill, slot, ROLE_ID, ctx.monsterById, warnings);
    const dmg = eng.computeDamageSegments(skill, row, cfg.actionCfg, warnings);
    if (dmg.segments && dmg.segments.length) {
      const realSegments = dmg.segments.filter((s) => (s.per || 0) !== 0 || (s.val || 0) !== 0);
      mergedSegments.push(...realSegments);
      if (!mergedKind || mergedKind === "normal") mergedKind = dmg.kind;
    }
  }

  if (!firstRow) return null;

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
    totalPer: Math.round(totalPer * 1000) / 1000,
    totalVal: Math.round(totalVal * 1000) / 1000,
    addDefendVal: firstRow.addDefendVal ?? null,
  };
}

function buildSkillCard(displaySkillId, slot, ctx) {
  const warnings = [];
  const displaySkill = ctx.skillById.get(displaySkillId);
  if (!displaySkill) {
    return { skillId: displaySkillId, error: "skill 不存在", warnings: [{ code: eng.WARN.MISSING_SKILL }] };
  }

  const concreteIds = resolveAolieConcreteSkills(displaySkillId, ctx, warnings);
  const actionSkill = ctx.skillById.get(concreteIds[0]) || displaySkill;
  const cfg = resolveAolieCfgFile(actionSkill, slot, ROLE_ID, ctx.monsterById, warnings);
  const maxLevel = maxLevelForConcrete(displaySkill, concreteIds, ctx);
  const rel = eng.resolveReleaseTime(cfg.entityCfg, actionSkill.entityAction, cfg.hasActionCfg, warnings);
  const { fixedBuffs, growthBuffRefs } = collectAolieBuffs(displaySkillId, concreteIds, slot, ctx, warnings);

  const levels = [];
  for (let lv = 1; lv <= maxLevel; lv++) {
    const l = computeAolieLevel(concreteIds, lv, slot, ctx, warnings);
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

  const lv1 = levels[0] || null;
  const card = {
    skillId: displaySkillId,
    name: displaySkill.desName || displaySkill.Name || `技能${displaySkillId}`,
    icon: displaySkill.icon || null,
    attribute: displaySkill.attribute ?? null,
    entityAction: actionSkill.entityAction || null,
    concreteSkillIds: concreteIds,
    desIntro: displaySkill.desIntro || null,
    header: {
      kind: lv1 ? lv1.kind : null,
      segments: lv1 ? lv1.segments.map((s) => ({ per: s.per, maxHit: s.maxHit, from: s.from })) : [],
      segCount: lv1 ? lv1.segments.reduce((a, s) => a + s.maxHit, 0) : 0,
      totalPer: lv1 ? lv1.totalPer : null,
      releaseFrames: rel.releaseFrames,
      releaseSeconds: rel.releaseSeconds,
      releaseTimeSource: rel.releaseTimeSource,
      cd: displaySkill.cd ?? null,
      addDefendVal: lv1 ? lv1.addDefendVal : null,
      cfgFileResolved: cfg.cfgFileResolved,
      cfgResolveSource: cfg.cfgResolveSource,
      fixedBuffs,
      metrics: metrics.computeMetrics(
        ctx.metricDefs, "header",
        { skillId: displaySkillId, totalPer: lv1 ? lv1.totalPer : null, releaseSeconds: rel.releaseSeconds, segCount: lv1 ? lv1.segments.reduce((a, s) => a + s.maxHit, 0) : 0 },
        ctx.helpers, warnings,
      ),
    },
    maxLevel,
    levels: levels.map((l) => ({
      level: l.level,
      roleLevel: l.roleLevel,
      consumeMp: l.consumeMp,
      segmentVals: l.segments.map((s) => ({ val: s.val, maxHit: s.maxHit })),
      totalPer: l.totalPer,
      totalVal: l.totalVal,
      growthBuffs: l.growthBuffs || [],
      metrics: metrics.computeMetrics(
        ctx.metricDefs, "level",
        { skillId: displaySkillId, level: l.level, roleLevel: l.roleLevel, consumeMp: l.consumeMp, totalPer: l.totalPer, totalVal: l.totalVal, releaseSeconds: rel.releaseSeconds, segCount: l.segments.reduce((a, s) => a + s.maxHit, 0) },
        ctx.helpers, l.level === 1 ? warnings : [],
      ),
    })),
    warnings,
  };

  const skillOv = ctx.overrides.resolveSkill(displaySkillId);
  if (skillOv) {
    for (const [k, v] of Object.entries(skillOv)) {
      if (k.startsWith("_")) continue;
      if (k.startsWith("header.")) card.header[k.slice(7)] = v;
      else card[k] = v;
    }
  }

  return card;
}

function sameValues(a, b) {
  if (!a || !b || a.error || b.error) return false;
  if (FORCE_DISTINCT_AWAKENS.has(b.skillId)) return false;
  if (a.maxLevel !== b.maxLevel) return false;
  if (a.header.totalPer !== b.header.totalPer) return false;
  if (a.header.segCount !== b.header.segCount) return false;
  for (let i = 0; i < a.levels.length; i++) {
    const la = a.levels[i], lb = b.levels[i];
    if (!lb) return false;
    if (la.totalPer !== lb.totalPer || la.totalVal !== lb.totalVal) return false;
  }
  return true;
}

function extract() {
  console.log("\n🐉 角色 Wiki → 敖烈（白龙）");

  const roleInitial = u.loadTable("roleInitial").find((r) => r.roleId === ROLE_ID);
  const role = u.loadTable("role").find((r) => r.id === ROLE_ID);
  const ctx = {
    skillById: idx(u.loadTable("skill")),
    skillLevelById: idx(u.loadTable("skillLevel")),
    monsterById: idx(u.loadTable("monster")),
    buffById: idx(u.loadTable("buff")),
    beskillById: idx(u.loadTable("beskill")),
    overrides: ov.loadOverrides(ROLE_OVERRIDE),
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

  const slots = [];
  for (const slot of SLOTS) {
    const v = roleInitial[slot.key];
    const baseId = Array.isArray(v) ? v[0] : v;
    if (baseId == null) continue;

    const baseCard = buildSkillCard(baseId, slot.key, ctx);
    const awakenIds = roleInitial[slot.key + "Awaken"] || [];
    const awakenCards = [];
    for (const awId of Array.isArray(awakenIds) ? awakenIds : []) {
      const card = buildSkillCard(awId, slot.key, ctx);
      card.identicalToBase = sameValues(baseCard, card);
      awakenCards.push(card);
    }

    slots.push({
      slot: slot.key,
      slotLabel: slot.label,
      isTrans: /^transSkill/.test(slot.key),
      base: baseCard,
      awakens: awakenCards,
      allAwakenIdentical: awakenCards.length > 0 && awakenCards.every((c) => c.identicalToBase),
    });
  }

  if (EMIT_TEMPLATE) {
    const target = ctx.overrides.writeTemplate(FORCE);
    console.log(`  📝 模板已生成 → ${target}`);
    return;
  }

  const unused = ctx.overrides.finalizeWarnings();
  if (unused.length && slots[0]) slots[0].base.warnings.push(...unused);

  const passiveSlots = passiveCards.buildRolePassiveSlots(ROLE_ID, ctx);

  const payload = {
    role: {
      id: role.id,
      name: role.name,
      makeupMonsterId: role.makeupMonsterId,
      text: role.text,
      atkMultiplier: role.atk,
      guidePath: GUIDE_PATH,
    },
    slots,
    passiveSlots,
  };

  u.saveOutput("role_wiki_aolie", payload, {
    system: "role_wiki",
    sourceFiles: ["roleInitial.*.json", "role.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "beskill.*.json", "bullets.json", "entityCtg/*.json", GUIDE_PATH],
    note: "敖烈全技能 Wiki，包括充电觉醒真实技能映射与无双形态动作 Cfg 解析。",
  });

  for (const s of slots) {
    const b = s.base;
    const top = b.levels && b.levels[b.levels.length - 1];
    const mv = (k) => { const m = top && top.metrics && top.metrics.find((x) => x.key === k); return m && m.display != null ? m.display : "—"; };
    console.log(`  ${s.slotLabel} ${b.name}(${b.skillId}): ${b.header.kind} ${b.header.segCount}段 per=${b.header.totalPer} 帧=${b.header.releaseFrames} maxLv=${b.maxLevel} | 满级蓝转=${mv("manaConv")} 攻转=${mv("atkConv")}${b.warnings.length ? " ⚠" + b.warnings.length : ""}`);
    for (const a of s.awakens) {
      console.log(`     觉醒 ${a.name}(${a.skillId}): concrete=${a.concreteSkillIds.join("+")} per=${a.header.totalPer}${a.identicalToBase ? " [与基础相同·可合并]" : " [不同·独立展示]"}${a.warnings.length ? " ⚠" + a.warnings.length : ""}`);
    }
  }
}

if (require.main === module) extract();
module.exports = extract;
