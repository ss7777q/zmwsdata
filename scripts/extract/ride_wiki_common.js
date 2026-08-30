/**
 * 坐骑技能 Wiki - 未专项解析坐骑通用导出
 *
 * 专项脚本负责手写机制说明；本脚本兜住还没有专项脚本的坐骑组，
 * 只导出配置可验证的技能卡、等级成长、固定/成长 buff 与数据提示。
 */
const fs = require("fs");
const path = require("path");
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const metrics = require("./lib/metrics");

const OUTPUT_NAME = "ride_wiki_common";
const RIDE_WIKI_FILE_RE = /^ride_wiki_(?!common\.json$|index\.json$).*\.json$/;
const SLOT_DEFS = [
  { key: "skillActive", labelPrefix: "技能", kind: "active" },
  { key: "skillSp", labelPrefix: "无双", kind: "sp" },
  { key: "skillPassive", labelPrefix: "被动", kind: "passive" },
];

const BIND_SOURCE_LABEL = {
  beSkill: "被动技能",
  beSkill2: "被动技能",
  entityActionComBuff: "技能附带",
  bulletFirstHitBuff: "首次命中附带",
  bulletHitBuff: "命中附带",
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

function hasSkills(ride) {
  return SLOT_DEFS.some((def) => asArray(ride[def.key]).some(Boolean));
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

function outputRideWikiFiles() {
  if (!fs.existsSync(u.OUTPUT_DIR)) return [];
  return fs.readdirSync(u.OUTPUT_DIR).filter((file) => RIDE_WIKI_FILE_RE.test(file)).sort();
}

function collectCoveredIdGroups() {
  const covered = new Set();
  for (const file of outputRideWikiFiles()) {
    const fullPath = path.join(u.OUTPUT_DIR, file);
    const json = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    const variants = Array.isArray(json.data?.variants) ? json.data.variants : [];
    for (const variant of variants) {
      const ride = variant.ride || {};
      const idGroup = ride.idGroup ?? ride.id;
      if (Number.isInteger(idGroup)) covered.add(idGroup);
    }
  }
  return covered;
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

  const firstMonster = order[0] || null;
  const firstCfg = firstMonster ? eng.loadEntityCfg(firstMonster.cfgFile) : null;
  if (action) {
    if (!firstCfg) warnings.push({ code: eng.WARN.MISSING_ENTITY_CFG, detail: `ride ${ride.id} skill ${skill.id} 找不到 entityCtg` });
    else warnings.push({ code: eng.WARN.MISSING_ACTION_CFG, detail: `ride ${ride.id} skill ${skill.id} action=${action} 在 cfg ${firstMonster.cfgFile} 中不存在` });
  }

  return {
    cfgFileResolved: firstMonster?.cfgFile || null,
    cfgResolveSource: firstMonster ? "rideMonster" : null,
    cfgMonsterId: firstMonster?.id ?? null,
    cfgMonsterName: firstMonster?.name ?? null,
    hasActionCfg: false,
    actionCfg: null,
    entityCfg: firstCfg,
  };
}

function collectBuffs(concreteIds, ride, ctx, warnings) {
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

      if (g1.levelMode === "growth") growthBuffRefs.push(base);
      else fixedBuffs.push({ ...base, value: buffValueSummary(rawBuff1) });
    }
  }

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

  const { fixedBuffs, growthBuffRefs } = collectBuffs(concreteIds, ride, ctx, warnings);
  const levels = [];
  for (let lv = 1; lv <= maxLevel; lv++) {
    const l = computeRideLevel(concreteIds, lv, ride, slotKind, ctx, warnings);
    if (!l) continue;
    l.growthBuffs = growthBuffRefs.map((ref) => {
      const g = eng.resolveBuffGrowth(ref.baseBuffId, lv, ctx.buffById, warnings);
      const rawBuffG = resolveRawBuff(g.buff, ctx.buffById);
      return { name: ref.name, bindLabel: ref.bindLabel, time: ref.time, value: buffValueSummary(rawBuffG) };
    });
    levels.push(l);
  }

  const reference = levels[levels.length - 1] || levels[0] || null;
  const referenceSegCount = reference ? reference.segments.reduce((a, s) => a + (s.maxHit || 1), 0) : 0;
  return {
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
      segCount: referenceSegCount,
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
        ctx.metricDefs,
        "header",
        { skillId: displaySkillId, totalPer: reference ? reference.totalPer : null, releaseSeconds: rel.releaseSeconds, segCount: referenceSegCount },
        ctx.helpers,
        warnings,
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
        ctx.metricDefs,
        "level",
        { skillId: displaySkillId, level: l.level, roleLevel: l.roleLevel, consumeMp: l.consumeMp, totalPer: l.totalPer, totalVal: l.totalVal, growthBuffs: l.growthBuffs || [], releaseSeconds: rel.releaseSeconds, segCount: l.segments.reduce((a, s) => a + (s.maxHit || 1), 0) },
        ctx.helpers,
        l.level === 1 ? warnings : [],
      ),
    })),
    warnings,
  };
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
  console.log("\n🐎 坐骑技能 Wiki → 未专项解析坐骑");

  const ctx = {
    rideById: idx(u.loadTable("ride")),
    skillById: idx(u.loadTable("skill")),
    skillLevelById: idx(u.loadTable("skillLevel")),
    monsterById: idx(u.loadTable("monster")),
    buffById: idx(u.loadTable("buff")),
    beskillById: idx(u.loadTable("beskill")),
    standards: metrics.loadCommonStandards(),
  };
  ctx.metricDefs = DEFAULT_METRICS;
  ctx.helpers = {
    standard: (roleLevel) => (roleLevel != null ? (ctx.standards.get(roleLevel) ?? null) : null),
    buffValue: (baseBuffId, valuePath, level) => {
      const g = eng.resolveBuffGrowth(Number(baseBuffId), level, ctx.buffById, []);
      const raw = resolveRawBuff(g.buff, ctx.buffById);
      if (!raw) return null;
      const parts = String(valuePath).split(".");
      let current = raw;
      for (const part of parts) current = current == null ? undefined : current[part];
      return typeof current === "number" ? current : null;
    },
  };

  const coveredIdGroups = collectCoveredIdGroups();
  const rides = [...ctx.rideById.values()]
    .filter(hasSkills)
    .filter((ride) => !coveredIdGroups.has(ride.idGroup ?? ride.id))
    .filter((ride) => !(Array.isArray(ride.megaEvolutionId) && ride.megaEvolutionId.length > 0))
    .filter((ride) => !ride.name?.includes("(废弃)"))
    .sort((a, b) => (a.idGroup ?? a.id) - (b.idGroup ?? b.id) || a.id - b.id);

  const variants = rides.map((ride) => {
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

  u.saveOutput(OUTPUT_NAME, {
    rideGroup: {
      key: "common",
      name: "未专项解析坐骑",
      rideIds: rides.map((ride) => ride.id),
      note: "本组为未编写专项机制说明的坐骑，先按配置直读导出技能数值、冷却、释放时间和可追踪 buff；复杂机制仍以数据提示为准，不补写猜测值。",
    },
    variants,
  }, {
    system: "ride_wiki",
    sourceFiles: ["ride.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "beskill.*.json", "buff.*.json", "bullets.json", "entityCtg/*.json"],
    note: "补齐没有专项 ride_wiki 脚本的坐骑组，避免整只坐骑缺席 Wiki 列表。",
  });

  for (const v of variants) {
    console.log(`  ${v.ride.name}(${v.ride.id}) cfg=${v.ride.cfgFile}`);
  }
}

if (require.main === module) extract();
module.exports = extract;
