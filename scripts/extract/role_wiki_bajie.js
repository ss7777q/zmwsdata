/**
 * 角色技能 Wiki - 猪八戒提取脚本
 *
 * 用 lib/skill-engine 按 docs/角色wiki开发.md 链路算出猪八戒全技能的
 * 段数/伤害/释放时间/等级成长, 组织成"表头区(不成长)+成长区(随等级)"的卡片结构。
 */
const path = require("path");
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");
const passiveCards = require("./lib/role-passive-cards");

// 通用派生指标(同所有角色);角色特有指标写 overrides/bajie.json 的 metrics 段。
const DEFAULT_METRICS = [
  { key: "manaConv", label: "蓝转", scope: "level", expr: "totalVal / consumeMp", when: "totalVal * consumeMp", fixed: 2 },
  { key: "atkConv", label: "攻转", scope: "level", expr: "totalPer / releaseSeconds", when: "totalPer * releaseSeconds", fixed: 3 },
];

const ROLE_OVERRIDE = "bajie";
const GUIDE_PATH = "D:/zmws/保存网页资源/4399_Threads_Download/【结弦】八戒数值侧百科_64035343/content.md";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const ROLE_ID = 3;
const BATTLE_FRAMES_PER_SECOND = 30;
const FORCE_DISTINCT_AWAKENS = new Set([
  3001067, // 天罡盾·磐石: 直伤同基础,但能量上限与回收机制不同
  3001042, // 开天辟地·透劲: 直伤同基础,但命中附加减伤下降
  3001072, // 化身天蓬·破甲: 直伤同基础,但全场非己方易伤
  3001073, // 化身天蓬·重生: 直伤同基础,但额外获得回血效果
]);
const SLOTS = [
  { key: "skill1", label: "技能1" },
  { key: "skill2", label: "技能2" },
  { key: "skill3", label: "技能3" },
  { key: "skill4", label: "技能4" },
  { key: "trick", label: "绝技" },
  { key: "transSkill1", label: "转职技能1" },
  { key: "transSkill2", label: "转职技能2" },
  { key: "transSkill3", label: "转职技能3" },
  { key: "transSkill4", label: "转职技能4" },
];

const BAJIE_SHIELD_ENERGY_BESKILL = new Map([
  [3001060, 8000101], // 天罡盾
  [3001067, 8000201], // 天罡盾·磐石
]);

function guideRelease(seconds, source) {
  return { frames: Math.round(seconds * BATTLE_FRAMES_PER_SECOND), source };
}

// 来源: 4399《八戒数值侧百科》正文释放用时。只覆盖动作首段无法代表完整连段的技能。
const GUIDE_RELEASE_FRAMES = new Map([
  [3001050, guideRelease(1.567, "guide:bajieWiki:土魔刺贴脸释放用时1.567s")],
  [3001081, guideRelease(1.567, "guide:bajieWiki:土魔刺沙刃贴脸释放用时1.567s")],
  [3001085, guideRelease(1.567, "guide:bajieWiki:土魔刺锥刺贴脸释放用时1.567s")],
  [3001260, guideRelease(3.7, "guide:bajieWiki:泰山压顶第二阶段和第三阶段释放用时3.7s")],
]);

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

/**
 * 定制八戒子技能展开器：
 * - 土魔刺·沙刃（3001081）触发独立沙刃技能（3001080）
 * - 天罡盾·反戈（3001062）触发后续二阶段蓝盾（3001063）和反击（3001064）
 * - 泰山压顶（3001260）合并起跳（3001260）、落刺（3001263）、落地（3001262）
 */
function resolveBajieConcreteSkills(displaySkillId, skillById, warnings) {
  if (displaySkillId === 3001062) {
    return [3001062, 3001063, 3001064];
  }
  if (displaySkillId === 3001081) {
    return [3001081, 3001080];
  }
  if (displaySkillId === 3001260) {
    return [3001260, 3001263, 3001262];
  }
  return eng.resolveConcreteSkills(displaySkillId, skillById, warnings);
}

/**
 * 定制八戒配置定位解析器：
 * 无双技能及子技能实际上属于无双形态「天蓬元帅」（Monster 103），优先使用 103-monster_cfg_bjbs 进行解析。
 */
function resolveBajieCfgFile(skill, slot, roleId, monsterById, warnings) {
  const isTrans = /^transSkill/.test(slot || "") || [3001230, 3001250, 3001240, 3001260, 3001261, 3001262, 3001263].includes(skill.id);
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

  const transMonster = monsterById.get(103);
  const selfMonster = monsterById.get(roleId);

  let order = [];
  if (isTrans) {
    order = [transMonster, ...ownerMonsters, selfMonster];
  } else {
    order = [selfMonster, ...ownerMonsters, transMonster];
  }

  for (const m of order) {
    if (!m) continue;
    const cfg = tryCfg(m.cfgFile);
    if (cfg) {
      return {
        cfgFileResolved: m.cfgFile,
        cfgResolveSource: m.id === 103 ? "transForm" : (m.id === roleId ? "self" : "ownerMonster"),
        cfgMonsterId: m.id,
        cfgMonsterName: m.name,
        hasActionCfg: true,
        actionCfg: cfg[action],
        entityCfg: cfg,
      };
    }
  }

  const fallback = selfMonster?.cfgFile || transMonster?.cfgFile || null;
  if (action) {
    const fallbackCfg = fallback ? eng.loadEntityCfg(fallback) : null;
    if (fallbackCfg && fallbackCfg[action]) {
      return {
        cfgFileResolved: fallback,
        cfgResolveSource: "fallback",
        cfgMonsterId: selfMonster?.id ?? null,
        cfgMonsterName: selfMonster?.name ?? null,
        hasActionCfg: true,
        actionCfg: fallbackCfg[action],
        entityCfg: fallbackCfg,
      };
    }
  }

  return {
    cfgFileResolved: fallback,
    cfgResolveSource: "fallback",
    cfgMonsterId: selfMonster?.id ?? null,
    cfgMonsterName: selfMonster?.name ?? null,
    hasActionCfg: false,
    actionCfg: null,
    entityCfg: fallback ? eng.loadEntityCfg(fallback) : null,
  };
}

/** 提取 buff.value 的 [percent, fixedVal] 结构 */
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
    if (attached) {
      return { ...buff, value: attached.value };
    }
  }
  return buff;
}

/** 收集八戒的所有 buff，包含对连段子技能 buff 的扫描去重 */
function collectBajieBuffs(concreteIds, slot, ctx, maxLevel, warnings) {
  const fixedBuffs = [];
  const growthBuffRefs = [];
  const seenBuffs = new Set();

  for (const skillId of concreteIds) {
    const skill = ctx.skillById.get(skillId);
    if (!skill) continue;
    const cfg = resolveBajieCfgFile(skill, slot, ROLE_ID, ctx.monsterById, warnings);
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

      const override = ctx.overrides.resolveBuff(concreteIds[0], ref.baseBuffId) || ctx.overrides.resolveBuff(skillId, ref.baseBuffId);
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
        ctx.overrides.recordBuff(concreteIds[0], ref.baseBuffId, rawBuff1, engineBuffText(rawBuff1));
      }
    }
  }

  return { fixedBuffs, growthBuffRefs };
}

function engineBuffText(buff) {
  const v = buffValueSummary(buff);
  if (!v) return null;
  const parts = [];
  if (typeof v.per === "number" && v.per !== 0) parts.push(`${(v.per * 100).toFixed(1)}%`);
  if (typeof v.val === "number" && v.val !== 0) parts.push(String(v.val));
  return parts.length ? parts.join(" + ") : null;
}

function resolveBajieReleaseTime(displaySkillId, cfg, skill, warnings) {
  const guide = GUIDE_RELEASE_FRAMES.get(displaySkillId);
  if (!guide) {
    return eng.resolveReleaseTime(cfg.entityCfg, skill.entityAction, cfg.hasActionCfg, warnings);
  }
  return {
    releaseFrames: guide.frames,
    releaseSeconds: guide.frames / BATTLE_FRAMES_PER_SECOND,
    releaseTimeSource: guide.source,
  };
}

function resolveBajieShieldEnergyMetric(displaySkillId, level, ctx) {
  const baseBeskillId = BAJIE_SHIELD_ENERGY_BESKILL.get(displaySkillId);
  if (!baseBeskillId) return null;

  const beskillId = baseBeskillId + level - 1;
  const be = ctx.beskillById.get(beskillId);
  if (!be) {
    throw new Error(`天罡盾能量上限缺少 beskill ${beskillId}`);
  }
  if (be.label !== "skillEnergy") {
    throw new Error(`天罡盾能量上限 beskill ${beskillId} label 异常: ${be.label}`);
  }

  const max = Number(be.attribute?.max);
  const rate = Number(be.attribute?.rate);
  if (!Number.isFinite(max) || !Number.isFinite(rate)) {
    throw new Error(`天罡盾能量上限 beskill ${beskillId} 缺少有效 attribute.max/rate`);
  }

  const value = Math.round(max * rate);
  return {
    key: "shieldEnergy",
    label: "能量上限",
    value,
    display: value,
  };
}

function appendMetric(metricsList, metric) {
  if (!metric) return metricsList;
  if (metricsList.some((entry) => entry.key === metric.key)) return metricsList;
  return [...metricsList, metric];
}

/** 合并计算所有派生子技能的某一等级数据 */
function computeBajieLevel(concreteIds, level, slot, ctx, warnings) {
  let mergedSegments = [];
  let mergedKind = null;
  let firstRow = null;

  for (const skillId of concreteIds) {
    const skill = ctx.skillById.get(skillId);
    if (!skill) continue;

    let row = ctx.skillLevelById.get(eng.skillLevelRowId(skill, level));
    if (!row) {
      row = ctx.skillLevelById.get(eng.skillLevelRowId(skill, 1));
      if (!row) {
        warnings.push({
          code: eng.WARN.MISSING_SKILL_LEVEL,
          detail: `skill ${skill.id} lv${level} and lv1 both missing`
        });
        continue;
      }
    }
    if (!firstRow) firstRow = row;

    // 猪八戒纯防御/辅助技能（无伤害），过滤掉占位的 dummy 伤害段数以保持伤害计算为 0
    if ([3001060, 3001062, 3001063, 3001067, 3001230].includes(skillId)) {
      continue;
    }

    const cfg = resolveBajieCfgFile(skill, slot, ROLE_ID, ctx.monsterById, warnings);
    const dmg = eng.computeDamageSegments(skill, row, cfg.actionCfg, warnings);

    // 八戒的土魔刺段数修正拦截
    if (skillId === 3001050 || skillId === 3001081) {
      if (dmg.segments && dmg.segments.length) {
        for (const s of dmg.segments) {
          if (s.maxHit === 3) s.maxHit = 10; // 土魔刺/沙刃主体段数修正为 10
        }
      }
    }
    if (skillId === 3001085) {
      if (dmg.segments && dmg.segments.length) {
        for (const s of dmg.segments) {
          if (s.maxHit === 3) s.maxHit = 9; // 土魔刺·锥刺段数修正为 9
        }
      }
    }

    if (dmg.segments && dmg.segments.length) {
      mergedSegments.push(...dmg.segments);
      if (!mergedKind || mergedKind === "normal") {
        mergedKind = dmg.kind;
      }
    }
  }

  if (!firstRow) return null;

  // 过滤多段伤害中的 0 系数占位段数
  const hasRealDmg = mergedSegments.some(s => s.per > 0);
  if (hasRealDmg) {
    mergedSegments = mergedSegments.filter(s => s.per > 0);
  }

  // 重新计算总伤害系数与固伤
  let totalPer = 0, totalVal = 0;
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

/** 构造单个技能 Wiki 卡片的数据 */
function buildSkillCard(displaySkillId, slot, ctx) {
  const warnings = [];
  const skill = ctx.skillById.get(displaySkillId);
  if (!skill) {
    return { skillId: displaySkillId, error: "skill 不存在", warnings: [{ code: eng.WARN.MISSING_SKILL }] };
  }

  const concreteIds = resolveBajieConcreteSkills(displaySkillId, ctx.skillById, warnings);
  const cfg = resolveBajieCfgFile(skill, slot, ROLE_ID, ctx.monsterById, warnings);

  const maxLevel = eng.detectMaxLevel(skill, ctx.skillLevelById);
  const rel = resolveBajieReleaseTime(displaySkillId, cfg, skill, warnings);

  const { fixedBuffs, growthBuffRefs } = collectBajieBuffs(concreteIds, slot, ctx, maxLevel, warnings);

  const levels = [];
  for (let lv = 1; lv <= maxLevel; lv++) {
    const l = computeBajieLevel(concreteIds, lv, slot, ctx, warnings);
    if (!l) continue;

    // 逐级渲染成长 buff 的当前数据
    l.growthBuffs = growthBuffRefs.map((ref) => {
      const g = eng.resolveBuffGrowth(ref.baseBuffId, lv, ctx.buffById, warnings);
      const rawBuffG = resolveRawBuff(g.buff, ctx.buffById);
      const engBuff = { name: ref.name, bindLabel: ref.bindLabel, time: ref.time, value: buffValueSummary(rawBuffG) };
      if (ref.override && rawBuffG) {
        const { merged, warnings: w } = ov.mergeBuff(engBuff, ref.override, rawBuffG, ref.label);
        if (lv === 1) warnings.push(...w); // 警告只报一次
        return merged;
      }
      return engBuff;
    });
    levels.push(l);
  }

  const lv1 = levels[0] || null;

  // 技能级覆写
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
      kind: lv1 ? lv1.kind : null,
      segments: lv1 ? lv1.segments.map((s) => ({ per: s.per, maxHit: s.maxHit, from: s.from })) : [],
      segCount: lv1 ? lv1.segments.reduce((a, s) => a + s.maxHit, 0) : 0,
      totalPer: lv1 ? lv1.totalPer : null,
      releaseFrames: rel.releaseFrames,
      releaseSeconds: rel.releaseSeconds,
      releaseTimeSource: rel.releaseTimeSource,
      cd: skill.cd ?? null,
      addDefendVal: skill.addDefendVal ?? null,
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
      metrics: appendMetric(metrics.computeMetrics(
        ctx.metricDefs, "level",
        { skillId: displaySkillId, level: l.level, roleLevel: l.roleLevel, consumeMp: l.consumeMp, totalPer: l.totalPer, totalVal: l.totalVal, growthBuffs: l.growthBuffs || [], releaseSeconds: rel.releaseSeconds, segCount: l.segments.reduce((a, s) => a + s.maxHit, 0) },
        ctx.helpers, l.level === 1 ? warnings : [],
      ), resolveBajieShieldEnergyMetric(displaySkillId, l.level, ctx)),
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

/** 比较两个技能卡片的属性及数值，判定是否全等合并 */
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
  console.log("\n🐷 角色 Wiki → 猪八戒");

  const roleInitial = u.loadTable("roleInitial").find((r) => r.roleId === ROLE_ID);
  const role = u.loadTable("role").find((r) => r.id === ROLE_ID);

  const ctx = {
    skillById: idx(u.loadTable("skill")),
    skillLevelById: idx(u.loadTable("skillLevel")),
    monsterById: idx(u.loadTable("monster")),
    buffById: idx(u.loadTable("buff")),
    beskillById: idx(u.loadTable("beskill")),
    cfg: null,
    overrides: ov.loadOverrides(ROLE_OVERRIDE),
    emitTemplate: EMIT_TEMPLATE,
    standards: metrics.loadCommonStandards(),
  };
  ctx.metricDefs = [...DEFAULT_METRICS, ...ctx.overrides.getMetrics()];
  ctx.helpers = {
    standard: (roleLevel) => (roleLevel != null ? (ctx.standards.get(roleLevel) ?? null) : null),
    buffValue: (baseBuffId, valuePath, level) => {
      const g = eng.resolveBuffGrowth(Number(baseBuffId), level, ctx.buffById, []);
      let raw = g.buff;
      if (raw && raw.value == null && Array.isArray(raw.attachBuff) && raw.attachBuff.length) {
        const at = ctx.buffById.get(raw.attachBuff[0]); if (at) raw = { ...raw, value: at.value };
      }
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

  // 写脚手架
  if (EMIT_TEMPLATE) {
    const target = ctx.overrides.writeTemplate(FORCE);
    console.log(`  📝 模板已生成 → ${target}`);
    return;
  }

  // 覆写未用到的键告警
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

  u.saveOutput("role_wiki_bajie", payload, {
    system: "role_wiki",
    sourceFiles: ["roleInitial.*.json", "role.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "passiveSkill.*.json", "buff.*.json", "beskill.*.json", "bullets.json", "entityCtg/*.json", GUIDE_PATH],
    note: "猪八戒全技能 Wiki，包括多段技能、无双技能动作 Cfg 解析与 passiveSkill 角色被动。",
  });

  // 打印最终提取概要
  for (const s of slots) {
    const b = s.base;
    const top = b.levels && b.levels[b.levels.length - 1];
    const mv = (k) => { const m = top && top.metrics && top.metrics.find((x) => x.key === k); return m && m.display != null ? m.display : "—"; };
    console.log(`  ${s.slotLabel} ${b.name}(${b.skillId}): ${b.header.kind} ${b.header.segCount}段 per=${b.header.totalPer} 帧=${b.header.releaseFrames} maxLv=${b.maxLevel} | 满级蓝转=${mv("manaConv")} 攻转=${mv("atkConv")}${b.warnings.length ? " ⚠" + b.warnings.length : ""}`);
    for (const a of s.awakens) {
      console.log(`     觉醒 ${a.name}(${a.skillId}): per=${a.header.totalPer}${a.identicalToBase ? " [与基础相同·可合并]" : " [不同·独立展示]"}`);
    }
  }
}

if (require.main === module) extract();
module.exports = extract;
