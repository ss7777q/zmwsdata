/**
 * 角色技能 Wiki - 孙悟空提取脚本
 *
 * 用 lib/skill-engine 按 docs/角色wiki开发.md 链路算出孙悟空全技能的
 * 段数/伤害/释放时间/等级成长,组织成"表头区(不成长)+成长区(随等级)"的卡片结构。
 *
 * 不动旧 scripts/extract/role_wukong.js。输出 output/role_wiki_wukong.json。
 * 必须用 PowerShell+node 跑(战斗配置在 D 盘,WSL 访问不了)。
 */
const path = require("path");
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");

// 通用派生指标(所有角色默认产出);角色特有指标(闪避率/血蓝比等需 buff 标注)写在
// overrides/<role>.json 的 "metrics" 段,会与这里合并。攻略口径见 lib/metrics.js。
// when 用"分子*分母"守卫:任一为 0/缺失即跳过,不报错(避免无释放时间的技能刷 warning)。
const DEFAULT_METRICS = [
  { key: "manaConv", label: "蓝转", scope: "level", expr: "totalVal / consumeMp", when: "totalVal * consumeMp", fixed: 2 },
  { key: "atkConv", label: "攻转", scope: "level", expr: "totalPer / releaseSeconds", when: "totalPer * releaseSeconds", fixed: 3 },
];

const ROLE_OVERRIDE = "wukong";
const GUIDE_PATH = "D:/zmws/保存网页资源/4399_Threads_Download/【结弦】悟空数值侧百科_64031169/content.md";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const ROLE_ID = 1;
const WUKONG_SKILL = {
  FLAME_DASH_SHADOW: 1001154,
  RISING_DRAGON_SHADOW: 1001162,
  RISING_DRAGON_BLOOD: 1001161,
  FLAME_STORM_SHADOW: 1001172,
  FLAME_STORM_BLOOD: 1001171,
  FIRE_SLASH_BLOOD: 1001181,
  BRAVE_CHARGE: 1002250,
};
const FORCE_DISTINCT_AWAKENS = new Set([
  WUKONG_SKILL.FIRE_SLASH_BLOOD,
]);
const GUIDE_SEGMENT_RULES = new Map([
  [WUKONG_SKILL.FLAME_DASH_SHADOW, {
    kind: "appendFixed",
    per: 0.17,
    val: 0,
    maxHit: 1,
    source: "guide:wukongWiki:烈焰闪幻袭分身下劈0.17atk",
  }],
  [WUKONG_SKILL.RISING_DRAGON_SHADOW, {
    kind: "appendPerHitScale",
    per: 0.105,
    valScaleFromDamageAddVal: 0.15,
    maxHit: 4,
    source: "guide:wukongWiki:升龙斩幻空分身四连击为本体15%",
  }],
  [WUKONG_SKILL.FLAME_STORM_SHADOW, {
    kind: "appendTotalScale",
    per: 0.51,
    valScaleFromTotalVal: 0.15,
    maxHit: 1,
    source: "guide:wukongWiki:烈焰风暴幻落落地伤害为本体15%",
  }],
]);
const GUIDE_HIT_CAPS = new Map([
  [WUKONG_SKILL.FLAME_STORM_BLOOD, {
    maxHit: 5,
    source: "guide:wukongWiki:烈焰风暴血燃沿用基础5连击,额外效果为燃血与灼烧",
  }],
  [WUKONG_SKILL.BRAVE_CHARGE, {
    maxHit: 4,
    source: "guide:wukongWiki:勇猛冲撞4连击",
  }],
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

function idx(arr) {
  const m = new Map();
  for (const r of arr) m.set(r.id, r);
  return m;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function finalizeSegments(kind, segments) {
  let totalPer = 0;
  let totalVal = 0;
  for (const s of segments) {
    totalPer += (s.per || 0) * (s.maxHit || 1);
    totalVal += (s.val || 0) * (s.maxHit || 1);
  }
  return {
    kind,
    segments,
    totalPer: round3(totalPer),
    totalVal: round3(totalVal),
  };
}

function capSegmentsByHitCount(segments, maxHit, source) {
  let remain = maxHit;
  const out = [];
  for (const seg of segments) {
    if (remain <= 0) break;
    const hit = seg.maxHit || 1;
    const keptHit = Math.min(hit, remain);
    out.push({
      ...seg,
      maxHit: keptHit,
      from: `${seg.from}|${source}`,
    });
    remain -= keptHit;
  }
  return out;
}

function applyWukongGuideDamage(skillId, row, dmg) {
  let segments = dmg.segments.map((s) => ({ ...s }));
  const cap = GUIDE_HIT_CAPS.get(skillId);
  if (cap) {
    segments = capSegmentsByHitCount(segments, cap.maxHit, cap.source);
  }

  const rule = GUIDE_SEGMENT_RULES.get(skillId);
  if (rule) {
    if (rule.kind === "appendFixed") {
      segments.push({ per: rule.per, val: rule.val, maxHit: rule.maxHit, from: rule.source });
    } else if (rule.kind === "appendPerHitScale") {
      segments.push({
        per: rule.per,
        val: round3((row.damageAddVal || 0) * rule.valScaleFromDamageAddVal),
        maxHit: rule.maxHit,
        from: rule.source,
      });
    } else if (rule.kind === "appendTotalScale") {
      segments.push({
        per: rule.per,
        val: round3((dmg.totalVal || 0) * rule.valScaleFromTotalVal),
        maxHit: rule.maxHit,
        from: rule.source,
      });
    }
  }

  return finalizeSegments(dmg.kind, segments);
}

/** 算一个具体技能某一级的完整数据 */
function computeLevel(skill, level, ctx, warnings) {
  const row = eng.querySkillLevel(skill, level, ctx.skillLevelById, warnings);
  if (!row) return null;
  const dmg = applyWukongGuideDamage(
    skill.id,
    row,
    eng.computeDamageSegments(skill, row, ctx.cfg.actionCfg, warnings),
  );
  return {
    level,
    roleLevel: row.roleLevel ?? null,
    consumeMp: row.consumeMp ?? null,
    soulCost: row.soulCost ?? null,
    kind: dmg.kind,
    segments: dmg.segments,
    totalPer: dmg.totalPer,
    totalVal: dmg.totalVal,
    addDefendVal: row.addDefendVal ?? null,
  };
}

/** 把 buff.value 提取成可读的关键数值(value 常见 [percent, fixedVal] 或 [[per,val,..]]) */
function buffValueSummary(buff) {
  if (!buff) return null;
  let v = buff.value;
  if (Array.isArray(v) && Array.isArray(v[0])) v = v[0]; // [[..]] 取首组
  if (Array.isArray(v)) {
    return { per: typeof v[0] === "number" ? v[0] : null, val: typeof v[1] === "number" ? v[1] : null };
  }
  return null;
}

const BIND_SOURCE_LABEL = {
  beSkill: "被动技能",
  beSkill2: "被动技能",
  entityActionComBuff: "技能附带",
  bulletHitBuff: "命中附带",
};

/**
 * 扫描技能 buff,分成固定 buff(不成长,进表头)和成长 buff(随等级,进 levels)。
 * 接入覆盖机制:固定 buff 直接渲染 displayText;成长 buff 把原始行+覆盖项带给逐级循环。
 * 返回 { fixedBuffs:[{...}], growthBuffRefs:[{baseBuffId,bindSource,name,text,time,override}] }
 */
function collectBuffs(skill, cfg, ctx, maxLevel, warnings) {
  const refs = eng.scanBuffs(skill, cfg.actionCfg, ctx.beskillById, warnings);
  const fixedBuffs = [];
  const growthBuffRefs = [];
  for (const ref of refs) {
    const g1 = eng.resolveBuffGrowth(ref.baseBuffId, 1, ctx.buffById, warnings);
    if (!g1.buff) continue;
    const base = {
      baseBuffId: ref.baseBuffId,
      name: g1.buff.name || `buff${ref.baseBuffId}`,
      text: g1.buff.text || null,
      time: g1.buff.time ?? null,
      bindSource: ref.bindSource,
      bindLabel: BIND_SOURCE_LABEL[ref.bindSource] || ref.bindSource,
      levelMode: g1.levelMode,
    };
    const override = ctx.overrides.resolveBuff(skill.id, ref.baseBuffId);
    const label = `[buff ${ref.baseBuffId} ${base.name}] `;

    if (g1.levelMode === "growth") {
      // 成长 buff:覆盖项与原始行带给逐级循环(每级数值不同,需重渲)
      growthBuffRefs.push({ ...base, override, label });
    } else {
      // 固定 buff:此处即可渲染
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
      ctx.overrides.recordBuff(skill.id, ref.baseBuffId, g1.buff, engineBuffText(g1.buff));
    }
  }
  return { fixedBuffs, growthBuffRefs };
}

/** 引擎默认会渲染成的字符串(供脚手架 _engineDisplayText 对比) */
function engineBuffText(buff) {
  const v = buffValueSummary(buff);
  if (!v) return null;
  const parts = [];
  if (typeof v.per === "number" && v.per !== 0) parts.push(`${(v.per * 100).toFixed(1)}%`);
  if (typeof v.val === "number" && v.val !== 0) parts.push(String(v.val));
  return parts.length ? parts.join(" + ") : null;
}

/** 算一个展示技能(含派生具体技能合并)的完整卡片数据 */
function buildSkillCard(displaySkillId, slot, ctx) {
  const warnings = [];
  const skill = ctx.skillById.get(displaySkillId);
  if (!skill) {
    return { skillId: displaySkillId, error: "skill 不存在", warnings: [{ code: eng.WARN.MISSING_SKILL }] };
  }

  // 具体技能(派生),目前主伤害用展示技能本身;派生记录供深化
  const concreteIds = eng.resolveConcreteSkills(displaySkillId, ctx.skillById, warnings);
  const cfg = eng.resolveCfgFile(skill, slot, ROLE_ID, ctx.monsterById, warnings);
  ctx.cfg = cfg;

  const maxLevel = eng.detectMaxLevel(skill, ctx.skillLevelById);
  const rel = eng.resolveReleaseTime(cfg.entityCfg, skill.entityAction, cfg.hasActionCfg, warnings);

  // buff:固定进表头,成长进每级
  const { fixedBuffs, growthBuffRefs } = collectBuffs(skill, cfg, ctx, maxLevel, warnings);

  const levels = [];
  for (let lv = 1; lv <= maxLevel; lv++) {
    const l = computeLevel(skill, lv, ctx, warnings);
    if (!l) continue;
    // 成长 buff 当前级数值(覆盖项级别无关,但每级数值不同 -> 重渲 displayText)
    l.growthBuffs = growthBuffRefs.map((ref) => {
      const g = eng.resolveBuffGrowth(ref.baseBuffId, lv, ctx.buffById, warnings);
      const engBuff = { name: ref.name, bindLabel: ref.bindLabel, time: ref.time, value: buffValueSummary(g.buff) };
      if (ref.override && g.buff) {
        const { merged, warnings: w } = ov.mergeBuff(engBuff, ref.override, g.buff, ref.label);
        if (lv === 1) warnings.push(...w); // 模板坏路径只报一次,避免每级刷屏
        return merged;
      }
      return engBuff;
    });
    levels.push(l);
  }

  const lv1 = levels[0] || null;

  // 技能级覆盖(name / header.* 字段)
  const skillOv = ctx.overrides.resolveSkill(displaySkillId);
  const card = {
    skillId: displaySkillId,
    name: skill.desName || skill.Name || `技能${displaySkillId}`,
    icon: skill.icon || null,
    attribute: skill.attribute ?? null,
    entityAction: skill.entityAction || null,
    concreteSkillIds: concreteIds,
    desIntro: skill.desIntro || null,
    // 表头区(不随等级变)
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
    // 成长区(随等级变)
    maxLevel,
    levels: levels.map((l) => ({
      level: l.level,
      roleLevel: l.roleLevel,
      consumeMp: l.consumeMp,
      segmentVals: l.segments.map((s) => ({ val: s.val, maxHit: s.maxHit })),
      totalPer: l.totalPer,
      totalVal: l.totalVal,
      growthBuffs: l.growthBuffs || [],
      // 派生指标(随等级):换算型 warning 只在 lv1 记一次,避免每级刷屏
      metrics: metrics.computeMetrics(
        ctx.metricDefs, "level",
        { skillId: displaySkillId, level: l.level, roleLevel: l.roleLevel, consumeMp: l.consumeMp, totalPer: l.totalPer, totalVal: l.totalVal, releaseSeconds: rel.releaseSeconds, segCount: l.segments.reduce((a, s) => a + s.maxHit, 0) },
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

/** 比较两个卡片在所有等级的数值是否完全相同(用于觉醒合并判定) */
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
  console.log("\n🐵 角色 Wiki → 孙悟空");

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
  // 派生指标:通用默认 + 角色覆盖文件 metrics 段
  ctx.metricDefs = [...DEFAULT_METRICS, ...ctx.overrides.getMetrics()];
  // 指标取值辅助:抗值按"学习等级"(roleLevel)查;buff 值按 valuePath 精确取(复用 overrides 点路径)
  ctx.helpers = {
    standard: (roleLevel) => (roleLevel != null ? (ctx.standards.get(roleLevel) ?? null) : null),
    buffValue: (baseBuffId, valuePath, level) => {
      const g = eng.resolveBuffGrowth(Number(baseBuffId), level, ctx.buffById, []);
      if (!g.buff) return null;
      const v = ov.getPath(g.buff, valuePath);
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
      // 与基础数值全等 -> 标记可合并(解决烈焰闪类问题)
      card.identicalToBase = sameValues(baseCard, card);
      awakenCards.push(card);
    }

    slots.push({
      slot: slot.key,
      slotLabel: slot.label,
      isTrans: /^transSkill/.test(slot.key),
      base: baseCard,
      awakens: awakenCards,
      // 觉醒里有任何与基础不同的,则需要分别展示
      allAwakenIdentical: awakenCards.length > 0 && awakenCards.every((c) => c.identicalToBase),
    });
  }

  // 模板脚手架:dump 每个 buff 的原始值+便利值供用户编辑,然后退出(不写正式 output)
  if (EMIT_TEMPLATE) {
    const target = ctx.overrides.writeTemplate(FORCE);
    console.log(`  📝 模板已生成 → ${target}`);
    return;
  }

  // 未用到的覆盖键告警(笔误)汇入基础卡 warnings
  const unused = ctx.overrides.finalizeWarnings();
  if (unused.length && slots[0]) slots[0].base.warnings.push(...unused);

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
  };

  u.saveOutput("role_wiki_wukong", payload, {
    system: "role_wiki",
    sourceFiles: ["roleInitial.*.json", "role.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "bullets.json", "entityCtg/*.json", GUIDE_PATH],
    note: "孙悟空全技能 Wiki,按段数/释放时间/等级成长精确计算。觉醒与基础数值全等者标 identicalToBase。",
  });

  // 控制台摘要
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
