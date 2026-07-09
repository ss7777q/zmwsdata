/**
 * 角色技能 Wiki - 敖雪提取脚本
 *
 * 用 lib/skill-engine 按 docs/角色wiki开发.md 链路算出敖雪全技能的
 * 段数/伤害/释放时间/等级成长, 组织成"表头区(不成长)+成长区(随等级)"的卡片结构。
 */
const path = require("path");
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");
const passiveCards = require("./lib/role-passive-cards");

// 通用派生指标(同所有角色);角色特有指标写 overrides/aoxue.json 的 metrics 段。
const DEFAULT_METRICS = [
  { key: "manaConv", label: "蓝转", scope: "level", expr: "totalVal / consumeMp", when: "totalVal * consumeMp", fixed: 2 },
  { key: "atkConv", label: "攻转", scope: "level", expr: "totalPer / releaseSeconds", when: "totalPer * releaseSeconds", fixed: 3 },
];

const ROLE_OVERRIDE = "aoxue";
const GUIDE_PATH = "D:/zmws/保存网页资源/4399_Threads_Download/【结弦】龙女数值侧百科_64035767/content.md";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const ROLE_ID = 5;
const BATTLE_FRAMES_PER_SECOND = 30;
const FORCE_DISTINCT_AWAKENS = new Set([
  5001068, // 金魔剑·归一: 基础段同金魔剑,满剑气切换归一二段与无限剑气机制不同
  5001071, // 化身灵龙·剑神无我: 直伤同基础,但变身结束获得固定2重剑气
  5001075, // 化身灵龙·剑影留痕: 直伤同基础,但攻击命中追加飞剑
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

function guideRelease(seconds, source) {
  return { frames: Math.round(seconds * BATTLE_FRAMES_PER_SECOND), source };
}

// 来源: 4399《龙女数值侧百科》正文释放用时。覆盖动作首段不能代表完整连段的技能。
const GUIDE_RELEASE_FRAMES = new Map([
  [5001031, guideRelease(0.833, "guide:aoxueWiki:环剑阵逆鳞释放逆鳞剑用时0.833s")],
  [5001035, guideRelease(0.533, "guide:aoxueWiki:环剑阵龙闪瞬闪用时0.533s")],
  [5001050, guideRelease(1.3, "guide:aoxueWiki:踏剑行释放用时1.3s")],
  [5001052, guideRelease(1.3, "guide:aoxueWiki:踏剑行流星释放用时1.3s")],
  [5001055, guideRelease(1.3, "guide:aoxueWiki:踏剑行雨落释放用时1.3s")],
  [5001230, guideRelease(0.633, "guide:aoxueWiki:翔龙破空释放用时0.633s")],
  [5001260, guideRelease(2.2, "guide:aoxueWiki:龙啸剑舞第2至3步用时2.2s")],
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
 * 敖雪子技能展开器：
 * 手动合并多阶段技能的子技能段数与伤害。
 */
function resolveAoxueConcreteSkills(displaySkillId, skillById, warnings) {
  const customConcreteMap = {
    5001031: [5001031, 5001032], // 环剑阵·逆鳞
    5001035: [5001035, 5001036], // 环剑阵·龙闪
    5001045: [5001045, 5001047], // 破云剑·冲霄
    5001050: [5001050, 5001051], // 踏剑行
    5001052: [5001052, 5001053], // 踏剑行·流星
    5001055: [5001055, 5001056, 5001057], // 踏剑行·雨落
    5001068: [5001068, 5001065, 5001066, 5001069], // 金魔剑·归一 (合并扫描 buffs)
    5001230: [5001230, 5001231], // 翔龙破空
    5001260: [5001260, 5001261, 5001262], // 龙啸剑舞
  };
  if (customConcreteMap[displaySkillId]) {
    return customConcreteMap[displaySkillId];
  }
  return eng.resolveConcreteSkills(displaySkillId, skillById, warnings);
}

/**
 * 敖雪动作配置定位解析器：
 * 对于无双/转职技能，优先寻找“龙海剑姬” (Monster 105) 下的动作配置。
 */
function resolveAoxueCfgFile(skill, slot, roleId, monsterById, warnings) {
  const isTrans = /^transSkill/.test(slot || "") || [5001230, 5001231, 5001240, 5001251, 5001260, 5001261, 5001262].includes(skill.id);
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

  const transMonster = monsterById.get(105); // 龙海剑姬
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
        cfgResolveSource: m.id === 105 ? "transForm" : (m.id === roleId ? "self" : "ownerMonster"),
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
  // 特判对象形式的 value (例如吸血、吸蓝 buff: {per, val, max})
  if (v && typeof v === "object") {
    return {
      per: typeof v.per === "number" ? v.per : null,
      val: typeof v.val === "number" ? v.val : null,
      max: typeof v.max === "number" ? v.max : null,
    };
  }
  return null;
}

function buffSemanticKey(ref, buff, levelMode) {
  if (!buff) return `missing:${ref.baseBuffId}`;
  return [
    ref.bindSource,
    ref.targetKind,
    levelMode,
    buff.group ?? buff.id ?? ref.baseBuffId,
    buff.type ?? "",
    buff.replaceRule ?? "",
    buff.maxPiles ?? "",
    buff.time ?? "",
    buff.interval ?? "",
    buff.name || "",
    buff.text || "",
    JSON.stringify(buff.value ?? null),
  ].join("::");
}

/** 收集敖雪的所有 buff，并过滤去重 */
function collectAoxueBuffs(concreteIds, slot, ctx, maxLevel, warnings) {
  const fixedBuffs = [];
  const growthBuffRefs = [];
  const seenBaseBuffIds = new Set();
  const seenSemanticBuffs = new Set();

  for (const skillId of concreteIds) {
    const skill = ctx.skillById.get(skillId);
    if (!skill) continue;
    const cfg = resolveAoxueCfgFile(skill, slot, ROLE_ID, ctx.monsterById, warnings);
    const refs = eng.scanBuffs(skill, cfg.actionCfg, ctx.beskillById, warnings);

    // 特判迅龙击(11999902)被动中的 hpBuffs 和 mpBuffs
    for (const field of ["beSkill", "beSkill2"]) {
      const ids = [];
      const v = skill[field];
      if (v != null) {
        if (Array.isArray(v)) ids.push(...v);
        else ids.push(v);
      }
      for (const beId of ids) {
        const be = ctx.beskillById.get(beId);
        if (be && be.attribute) {
          const extraBuffs = [];
          if (be.attribute.hpBuffs) {
            if (Array.isArray(be.attribute.hpBuffs)) extraBuffs.push(...be.attribute.hpBuffs);
            else extraBuffs.push(be.attribute.hpBuffs);
          }
          if (be.attribute.mpBuffs) {
            if (Array.isArray(be.attribute.mpBuffs)) extraBuffs.push(...be.attribute.mpBuffs);
            else extraBuffs.push(be.attribute.mpBuffs);
          }
          for (const bId of extraBuffs) {
            if (typeof bId === "number" && bId > 1000) {
              refs.push({ baseBuffId: bId, bindSource: field, targetKind: "buff" });
            }
          }
        }
      }
    }

    for (const ref of refs) {
      if (seenBaseBuffIds.has(ref.baseBuffId)) continue;
      seenBaseBuffIds.add(ref.baseBuffId);

      const g1 = eng.resolveBuffGrowth(ref.baseBuffId, 1, ctx.buffById, warnings);
      if (!g1.buff) continue;

      const isWanjian = ref.baseBuffId >= 193000101 && ref.baseBuffId <= 193000106;
      const levelMode = isWanjian ? "fixed" : g1.levelMode;
      const semanticKey = buffSemanticKey(ref, g1.buff, levelMode);
      if (seenSemanticBuffs.has(semanticKey)) continue;
      seenSemanticBuffs.add(semanticKey);

      const base = {
        baseBuffId: ref.baseBuffId,
        name: g1.buff.name || `buff${ref.baseBuffId}`,
        text: g1.buff.text || null,
        time: g1.buff.time ?? null,
        bindSource: ref.bindSource,
        bindLabel: BIND_SOURCE_LABEL[ref.bindSource] || ref.bindSource,
        levelMode: levelMode,
      };

      const override = ctx.overrides.resolveBuff(concreteIds[0], ref.baseBuffId) || ctx.overrides.resolveBuff(skillId, ref.baseBuffId);
      const label = `[buff ${ref.baseBuffId} ${base.name}] `;

      if (levelMode === "growth") {
        growthBuffRefs.push({ ...base, override, label });
      } else {
        const engBuff = { ...base, value: buffValueSummary(g1.buff) };
        if (override) {
          const { merged, warnings: w } = ov.mergeBuff(engBuff, override, g1.buff, label);
          warnings.push(...w);
          fixedBuffs.push(merged);
        } else {
          fixedBuffs.push(engBuff);
        }
      }
      if (ctx.emitTemplate) {
        ctx.overrides.recordBuff(concreteIds[0], ref.baseBuffId, g1.buff, engineBuffText(g1.buff));
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

function resolveAoxueReleaseTime(displaySkillId, cfg, skill, warnings) {
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

/** 合并计算派生子技能某一等级的段数与伤害 */
function computeAoxueLevel(concreteIds, level, slot, ctx, warnings) {
  let mergedSegments = [];
  let mergedKind = null;
  let firstRow = null;

  for (const skillId of concreteIds) {
    // 5001068 (金魔剑·归一) 的子技能 5001065 / 5001066 / 5001069 仅用于提供 buffs 扫描，不计入伤害段合并
    if (concreteIds[0] === 5001068 && skillId !== 5001068) {
      continue;
    }

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

    const cfg = resolveAoxueCfgFile(skill, slot, ROLE_ID, ctx.monsterById, warnings);
    const dmg = eng.computeDamageSegments(skill, row, cfg.actionCfg, warnings);

    if (dmg.segments && dmg.segments.length) {
      // 后处理段数逻辑：
      // 龙啸剑舞的挥舞段数（bullet 2733）在数据库中 maxHit 为 8，但实战仅为 5，强制修改为 5。
      for (const seg of dmg.segments) {
        if (seg.from === "actionBullet:2733") {
          seg.maxHit = 5;
        }
      }

      // 重新计算当前具体技能的总伤
      let stepPer = 0, stepVal = 0;
      for (const s of dmg.segments) {
        stepPer += (s.per || 0) * (s.maxHit || 1);
        stepVal += (s.val || 0) * (s.maxHit || 1);
      }
      dmg.totalPer = Math.round(stepPer * 1000) / 1000;
      dmg.totalVal = Math.round(stepVal * 1000) / 1000;

      mergedSegments.push(...dmg.segments);
      if (!mergedKind || mergedKind === "normal") {
        mergedKind = dmg.kind;
      }
    }
  }

  if (!firstRow) return null;

  // 过滤多段占位的 Dummy 0 系数伤害段数
  const hasRealDmg = mergedSegments.some(s => s.per > 0);
  if (hasRealDmg) {
    mergedSegments = mergedSegments.filter(s => s.per > 0);
  }

  // 重新计算总系数与总固伤
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

/** 构造技能卡片数据 */
function buildSkillCard(displaySkillId, slot, ctx) {
  const warnings = [];
  const skill = ctx.skillById.get(displaySkillId);
  if (!skill) {
    return { skillId: displaySkillId, error: "skill 不存在", warnings: [{ code: eng.WARN.MISSING_SKILL }] };
  }

  const concreteIds = resolveAoxueConcreteSkills(displaySkillId, ctx.skillById, warnings);
  const cfg = resolveAoxueCfgFile(skill, slot, ROLE_ID, ctx.monsterById, warnings);

  const maxLevel = eng.detectMaxLevel(skill, ctx.skillLevelById);
  const rel = resolveAoxueReleaseTime(displaySkillId, cfg, skill, warnings);

  // 收集 buff 并去重
  const { fixedBuffs, growthBuffRefs } = collectAoxueBuffs(concreteIds, slot, ctx, maxLevel, warnings);

  const levels = [];
  for (let lv = 1; lv <= maxLevel; lv++) {
    const l = computeAoxueLevel(concreteIds, lv, slot, ctx, warnings);
    if (!l) continue;

    // 逐级渲染成长 buff 的当前数据
    l.growthBuffs = growthBuffRefs.map((ref) => {
      const g = eng.resolveBuffGrowth(ref.baseBuffId, lv, ctx.buffById, warnings);
      const engBuff = { name: ref.name, bindLabel: ref.bindLabel, time: ref.time, value: buffValueSummary(g.buff) };
      if (ref.override && g.buff) {
        const { merged, warnings: w } = ov.mergeBuff(engBuff, ref.override, g.buff, ref.label);
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
      metrics: metrics.computeMetrics(
        ctx.metricDefs, "level",
        { skillId: displaySkillId, level: l.level, roleLevel: l.roleLevel, consumeMp: l.consumeMp, totalPer: l.totalPer, totalVal: l.totalVal, growthBuffs: l.growthBuffs || [], releaseSeconds: rel.releaseSeconds, segCount: l.segments.reduce((a, s) => a + s.maxHit, 0) },
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

/** 比较卡片属性，判定合并 */
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
  console.log("\n🐉 角色 Wiki → 敖雪");

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

  u.saveOutput("role_wiki_aoxue", payload, {
    system: "role_wiki",
    sourceFiles: ["roleInitial.*.json", "role.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "bullets.json", "entityCtg/*.json", GUIDE_PATH],
    note: "敖雪全技能 Wiki，包含多阶段动作合并与剑气威力强化特殊段数处理。",
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
