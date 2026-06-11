/**
 * 角色技能 Wiki - 萧嫣提取脚本
 *
 * 用 lib/skill-engine 按 docs/角色wiki开发.md 链路算出萧嫣全技能的
 * 段数/伤害/释放时间/等级成长, 组织成"表头区(不成长)+成长区(随等级)"的卡片结构。
 *
 * 支持召唤物（风灵、水灵、浊灵、石灵）和双无双形态（乘御版与指令版）的路由与计算合并。
 */
const path = require("path");
const fs = require("fs");
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");

// 通用派生指标(同所有角色);角色特有指标写 overrides/xiaoyan.json 的 metrics 段。
const DEFAULT_METRICS = [
  { key: "manaConv", label: "蓝转", scope: "level", expr: "totalVal / consumeMp", when: "totalVal * consumeMp", fixed: 2 },
  { key: "atkConv", label: "攻转", scope: "level", expr: "totalPer / releaseSeconds", when: "totalPer * releaseSeconds", fixed: 3 },
];

const ROLE_OVERRIDE = "xiaoyan";
const GUIDE_PATH = "D:/zmws/保存网页资源/4399_Threads_Download/【结弦】萧嫣数值侧百科_64027340/content.md";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const ROLE_ID = 7;
const BATTLE_FRAMES_PER_SECOND = 30;
const PLACEHOLDER_DAMAGE_PER = 0.01;
const PLACEHOLDER_DAMAGE_VAL = 1;
const GUIDE_DAMAGE_OVERRIDES = new Map([
  [7001070, { per: 0.01, val: 0, source: "guide:xiaoyanWiki:仙山古灵强攻0.01*atk" }],
  [7001071, { per: 0.01, val: 0, source: "guide:xiaoyanWiki:仙山古灵令御强攻0.01*atk" }],
  [7001076, { per: 0.01, val: 0, source: "guide:xiaoyanWiki:仙山古灵乘御强攻0.01*atk" }],
]);
const FORCE_DISTINCT_AWAKENS = new Set([
  7001031, // 叶佑之灵·坚毅: 护盾值/分担比例/剩余盾转血机制不同
  7001036, // 叶佑之灵·震颤: 超级霸体护盾与护盾爆炸机制不同
  7001041, // 御风之灵·逆风: 直伤同基础,但附加逆风减速降伤
  7001061, // 山岩之灵·刚石: 直伤同基础口径,但石灵被动机制不同
  7001071, // 仙山古灵·令御: 强攻同基础,但古灵增伤机制不同
  7001076, // 仙山古灵·乘御: 强攻同基础,但切换乘御技能组与增伤/减伤不同
  7001451, // 水之护盾(乘御版): 护盾值同指令版,但释放用时和模式不同
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

// 来源: 4399《萧嫣数值侧百科》正文释放用时。
const GUIDE_RELEASE_FRAMES = new Map([
  [7001461, guideRelease(3.033, "guide:xiaoyanWiki:飞砂走石乘御版释放用时3.033s")],
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
 * 定制萧嫣子技能展开器：
 * 萧嫣本体技能无直接伤害或治疗，需显式展开为对应的召唤物/治疗/变身动作技能。
 */
function resolveXiaoyanConcreteSkills(displaySkillId, skillById, warnings) {
  // S2 御风之灵
  if (displaySkillId === 7001040) return [7171010];
  if (displaySkillId === 7001041) return [7172010];
  if (displaySkillId === 7001046) return [7173010, 7173020];

  // S3 溪泉之灵
  if (displaySkillId === 7001050) return [7174011];
  if (displaySkillId === 7001051) return [7175011];
  if (displaySkillId === 7001056) return [7176011];

  // S4 山岩之灵
  if (displaySkillId === 7001060) return [7177000, 7177010];
  if (displaySkillId === 7001061) return [7178000, 7178010];
  if (displaySkillId === 7001066) return [7179000, 7179010, 7179020];

  // transSkill 1~4 Base (指令版)
  if (displaySkillId === 7001230) return [7001331];
  if (displaySkillId === 7001240) return [7001341];
  if (displaySkillId === 7001250) return [7001351];
  if (displaySkillId === 7001260) return [7001361, 7001362];

  // transSkill 1~4 Awaken (乘御版)
  if (displaySkillId === 7001431) return [7001431];
  if (displaySkillId === 7001441) return [7001441];
  if (displaySkillId === 7001451) return [7001451];
  if (displaySkillId === 7001461) return [7001461];

  return eng.resolveConcreteSkills(displaySkillId, skillById, warnings);
}

/**
 * 定制萧嫣配置定位解析器：
 * 召唤物动作以及无双骑乘/指令动作所在的 cfgFile 具有特殊的路由映射。
 */
function resolveXiaoyanCfgFile(skill, slot, roleId, monsterById, warnings) {
  const action = skill.entityAction;

  const tryCfg = (cfgFile) => {
    if (!cfgFile) return null;
    const cfg = eng.loadEntityCfg(cfgFile);
    if (cfg && action && cfg[action]) return cfg;
    return null;
  };

  let targetMonsterId = null;
  const id = skill.id;

  if (id === 7171010) targetMonsterId = 171;
  else if (id === 7172010) targetMonsterId = 172;
  else if ([7173010, 7173020].includes(id)) targetMonsterId = 173;
  else if (id === 7174011) targetMonsterId = 174;
  else if (id === 7175011) targetMonsterId = 175;
  else if (id === 7176011) targetMonsterId = 176;
  else if ([7177000, 7177010].includes(id)) targetMonsterId = 177;
  else if ([7178000, 7178010, 7178020].includes(id)) targetMonsterId = 178;
  else if ([7179000, 7179010, 7179020].includes(id)) targetMonsterId = 179;
  else if ([7001230, 7001240, 7001250, 7001260].includes(id)) targetMonsterId = 107;
  else if ([7001331, 7001341, 7001351, 7001361, 7001362].includes(id)) targetMonsterId = 108;
  else if ([7001431, 7001441, 7001451, 7001461].includes(id)) targetMonsterId = 109;

  let order = [];
  if (targetMonsterId !== null) {
    const m = monsterById.get(targetMonsterId);
    if (m) order.push(m);
  }

  // 兜底路由
  const ownerMonsters = [];
  for (const m of monsterById.values()) {
    const all = [].concat(m.skillIds || [], m.skyskillIds || [], m.vSkill || [], m.atkIds || [], m.skyAtkIds || []);
    if (all.includes(skill.id)) ownerMonsters.push(m);
  }
  const selfMonster = monsterById.get(roleId);

  order = [...order, ...ownerMonsters, selfMonster];

  for (const m of order) {
    if (!m) continue;
    const cfg = tryCfg(m.cfgFile);
    if (cfg) {
      return {
        cfgFileResolved: m.cfgFile,
        cfgResolveSource: m.id === roleId ? "self" : "ownerMonster",
        cfgMonsterId: m.id,
        cfgMonsterName: m.name,
        hasActionCfg: true,
        actionCfg: cfg[action],
        entityCfg: cfg,
      };
    }
  }

  const fallback = selfMonster?.cfgFile || "07-monster_cfg_xiaoyan";
  if (action) {
    const fallbackCfg = eng.loadEntityCfg(fallback);
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
    entityCfg: eng.loadEntityCfg(fallback),
  };
}

/** 提取 buff.value 的关键百分比和固定数值 */
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

function resolveXiaoyanBuffGrowth(baseBuffId, level, buffById, warnings) {
  if (baseBuffId >= 257000101 && baseBuffId <= 257000204) {
    const buff = buffById.get(baseBuffId);
    return { levelMode: "fixed", effectiveBuffId: baseBuffId, buff: buff || null };
  }
  return eng.resolveBuffGrowth(baseBuffId, level, buffById, warnings);
}

/** 收集并去重所有关联 buff */
function collectXiaoyanBuffs(concreteIds, slot, ctx, maxLevel, warnings) {
  const fixedBuffs = [];
  const growthBuffRefs = [];
  const seenBuffs = new Set();

  for (const skillId of concreteIds) {
    const skill = ctx.skillById.get(skillId);
    if (!skill) continue;
    const cfg = resolveXiaoyanCfgFile(skill, slot, ROLE_ID, ctx.monsterById, warnings);
    const refs = eng.scanBuffs(skill, cfg.actionCfg, ctx.beskillById, warnings);

    for (const ref of refs) {
      if ((ref.baseBuffId >= 257000101 && ref.baseBuffId <= 257000204) ||
          (ref.baseBuffId >= 14009801 && ref.baseBuffId <= 14009804)) {
        continue;
      }
      if (seenBuffs.has(ref.baseBuffId)) continue;
      seenBuffs.add(ref.baseBuffId);

      const g1 = resolveXiaoyanBuffGrowth(ref.baseBuffId, 1, ctx.buffById, warnings);
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

function resolveXiaoyanReleaseTime(displaySkillId, cfg, skill, warnings) {
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

function queryXiaoyanLevelRow(skill, level, ctx, warnings) {
  let row = ctx.skillLevelById.get(eng.skillLevelRowId(skill, level));
  if (!row) {
    row = ctx.skillLevelById.get(eng.skillLevelRowId(skill, 1));
    if (!row) {
      warnings.push({
        code: eng.WARN.MISSING_SKILL_LEVEL,
        detail: `skill ${skill.id} lv${level} and lv1 both missing`
      });
      return null;
    }
  }
  return row;
}

function isXiaoyanPlaceholderDamageSegment(segment) {
  return !String(segment.from || "").startsWith("healingBuff:") &&
    (segment.per || 0) === PLACEHOLDER_DAMAGE_PER &&
    (segment.val || 0) === PLACEHOLDER_DAMAGE_VAL &&
    (segment.maxHit || 1) === 1;
}

function applyXiaoyanGuideDamageOverride(skillId, segments) {
  const override = GUIDE_DAMAGE_OVERRIDES.get(skillId);
  if (!override) return;
  for (const seg of segments) {
    seg.per = override.per;
    seg.val = override.val;
    seg.source = override.source;
  }
}

/** 拦截具体技能并重新映射段数与治疗值 */
function computeXiaoyanLevel(displaySkillId, concreteIds, level, slot, ctx, hasAssociatedEffects, warnings) {
  let mergedSegments = [];
  let mergedKind = null;
  let firstRow = null;
  const displaySkill = ctx.skillById.get(displaySkillId);
  const displayRow = displaySkill ? queryXiaoyanLevelRow(displaySkill, level, ctx, warnings) : null;

  for (const skillId of concreteIds) {
    const skill = ctx.skillById.get(skillId);
    if (!skill) continue;

    // S3 溪泉之灵持续治疗拦截
    if ([7174011, 7175011].includes(skillId)) {
      const baseBuffId = skillId === 7174011 ? 1045901 : 1046001;
      const effBuffId = baseBuffId + level - 1;
      const b = ctx.buffById.get(effBuffId);
      let healVal = 0;
      if (b && Array.isArray(b.value) && Array.isArray(b.value[0])) {
        healVal = b.value[0][1] || 0;
      } else {
        warnings.push({ code: eng.WARN.MISSING_BUFF, detail: `治疗 buff ${effBuffId} 缺失` });
      }

      const row = queryXiaoyanLevelRow(skill, level, ctx, warnings);
      if (row && !firstRow) firstRow = row;

      mergedSegments.push({
        per: 0,
        val: healVal,
        maxHit: 10,
        from: `healingBuff:${effBuffId}`
      });
      mergedKind = "heal";
      continue;
    }

    const row = queryXiaoyanLevelRow(skill, level, ctx, warnings);
    if (!row) continue;
    if (!firstRow) firstRow = row;

    const cfg = resolveXiaoyanCfgFile(skill, slot, ROLE_ID, ctx.monsterById, warnings);
    const dmg = eng.computeDamageSegments(skill, row, cfg.actionCfg, warnings);

    if (dmg.segments && dmg.segments.length) {
      applyXiaoyanGuideDamageOverride(skillId, dmg.segments);

      for (const seg of dmg.segments) {
        // S2 风刃连击
        if ([7171010, 7172010, 7173010].includes(skillId)) {
          seg.maxHit = 10;
        }
        // S4 石灵滚动连击
        else if ([7177000, 7178000, 7179000].includes(skillId)) {
          seg.maxHit = 9;
        }
        // S4 爪击连击
        else if ([7177010, 7178010, 7179010].includes(skillId)) {
          seg.maxHit = 3;
        }
        // transSkill4 (飞砂走石指令版切割)
        else if (skillId === 7001361) {
          seg.maxHit = 8;
        }
      }

      // 重新对这组 segments 计算 totalPer 与 totalVal
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

  // 过滤萧嫣施法占位伤害段。真实效果在 buff / healingBuff / 真实伤害段里体现。
  const hasRealDmgOrHeal = mergedSegments.some(s => !isXiaoyanPlaceholderDamageSegment(s));
  if (hasRealDmgOrHeal || hasAssociatedEffects) {
    mergedSegments = mergedSegments.filter(s => !isXiaoyanPlaceholderDamageSegment(s));
  }

  // 重新计算总系数
  let totalPer = 0, totalVal = 0;
  for (const s of mergedSegments) {
    totalPer += (s.per || 0) * (s.maxHit || 1);
    totalVal += (s.val || 0) * (s.maxHit || 1);
  }

  const publicRow = displayRow || firstRow;

  return {
    level,
    roleLevel: publicRow.roleLevel ?? null,
    consumeMp: publicRow.consumeMp ?? null,
    soulCost: publicRow.soulCost ?? null,
    kind: mergedKind || "normal",
    segments: mergedSegments,
    totalPer: Math.round(totalPer * 1000) / 1000,
    totalVal: Math.round(totalVal * 1000) / 1000,
    addDefendVal: firstRow.addDefendVal ?? null,
  };
}

/** 构造萧嫣技能 Wiki 卡片的数据 */
function buildSkillCard(displaySkillId, slot, ctx) {
  const warnings = [];
  const skill = ctx.skillById.get(displaySkillId);
  if (!skill) {
    return { skillId: displaySkillId, error: "skill 不存在", warnings: [{ code: eng.WARN.MISSING_SKILL }] };
  }

  const concreteIds = resolveXiaoyanConcreteSkills(displaySkillId, ctx.skillById, warnings);
  const cfg = resolveXiaoyanCfgFile(skill, slot, ROLE_ID, ctx.monsterById, warnings);

  const maxLevel = eng.detectMaxLevel(skill, ctx.skillLevelById);
  const rel = resolveXiaoyanReleaseTime(displaySkillId, cfg, skill, warnings);

  const { fixedBuffs, growthBuffRefs } = collectXiaoyanBuffs(concreteIds, slot, ctx, maxLevel, warnings);
  const hasAssociatedEffects = fixedBuffs.length > 0 || growthBuffRefs.length > 0;

  const levels = [];
  for (let lv = 1; lv <= maxLevel; lv++) {
    const l = computeXiaoyanLevel(displaySkillId, concreteIds, lv, slot, ctx, hasAssociatedEffects, warnings);
    if (!l) continue;

    l.growthBuffs = growthBuffRefs.map((ref) => {
      const g = resolveXiaoyanBuffGrowth(ref.baseBuffId, lv, ctx.buffById, warnings);
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
  console.log("\n🪈 角色 Wiki → 萧嫣");

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
    let awakenIds = roleInitial[slot.key + "Awaken"] || [];
    if (slot.key === "transSkill1") awakenIds = [7001431];
    else if (slot.key === "transSkill2") awakenIds = [7001441];
    else if (slot.key === "transSkill3") awakenIds = [7001451];
    else if (slot.key === "transSkill4") awakenIds = [7001461];

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

  u.saveOutput("role_wiki_xiaoyan", payload, {
    system: "role_wiki",
    sourceFiles: ["roleInitial.*.json", "role.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "bullets.json", "entityCtg/*.json", GUIDE_PATH],
    note: "萧嫣全技能 Wiki，包括多形态召唤物及无双形态合并输出。",
  });

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
