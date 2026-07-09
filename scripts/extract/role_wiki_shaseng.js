/**
 * 角色技能 Wiki - 沙悟净（沙僧）提取脚本
 *
 * 用 lib/skill-engine 按 docs/角色wiki开发.md 链路算出沙僧全技能的
 * 段数/伤害/释放时间/等级成长, 组织成"表头区(不成长)+成长区(随等级)"的卡片结构。
 *
 * 支持转职链接技能（4001240 / 4001260）的子技能伤害合并，并正确在无双形态（Monster 104）下寻找 Action 动作。
 */
const path = require("path");
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");
const passiveCards = require("./lib/role-passive-cards");

// 通用派生指标(同所有角色);角色特有指标(闪避率等需 buff 标注)写在
// overrides/shaseng.json 的 "metrics" 段,会与这里合并。攻略口径见 lib/metrics.js。
const DEFAULT_METRICS = [
  { key: "manaConv", label: "蓝转", scope: "level", expr: "totalVal / consumeMp", when: "totalVal * consumeMp", fixed: 2 },
  { key: "atkConv", label: "攻转", scope: "level", expr: "metricTotalPer / releaseSeconds", when: "metricTotalPer * releaseSeconds", fixed: 3 },
];

const ROLE_OVERRIDE = "shaseng";
const GUIDE_PATH = "D:/zmws/保存网页资源/4399_Threads_Download/【结弦】沙僧数值侧百科_64024476/content.md";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const ROLE_ID = 4;
const BULLET_DEAL_BESKILL_COM_TYPE = 7;
const BATTLE_FRAMES_PER_SECOND = 30;
const FORCE_DISTINCT_AWAKENS = new Set([
  4001044, // 腾空击·毒刃: 直伤同基础,但额外概率叠加剧毒种子
  4001071, // 化身卷帘·月牙: 直伤同基础,但普攻/技能概率叠加剧毒种子
  4001072, // 化身卷帘·翎羽: 直伤同基础,但普攻改弓箭并提升暴击率
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

// 来源: 4399《沙僧数值侧百科》正文释放用时。单位统一换算为战斗帧。
const GUIDE_RELEASE_FRAMES = new Map([
  [4001030, guideRelease(0.533, "guide:shasengWiki:巫毒娃娃释放用时0.533s")],
  [4001034, guideRelease(0.533, "guide:shasengWiki:巫毒娃娃毒花释放用时0.533s")],
  [4001037, guideRelease(0.5, "guide:shasengWiki:巫毒娃娃追猎释放用时0.5s")],
  [4001064, guideRelease(3, "guide:shasengWiki:木魔舞毒液持续切割3s")],
  [4001240, guideRelease(1.7, "guide:shasengWiki:半月旋释放用时1.7s")],
  [4001260, guideRelease(2.5, "guide:shasengWiki:流箭幻影释放用时2.5s")],
]);

// 木魔舞·毒液攻略的攻转只计算持续切割段: 0.409 * 22, 不把起手丢铲 5 段计入攻转。
const GUIDE_ATK_CONV_SEGMENT_FILTERS = new Map([
  [4001064, (segment) => segment.from === "bullet:2837#0"],
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
 * 定制沙僧子技能展开器：
 * 沙僧的转职技能2 (半月旋) 和 4 (流箭幻影) 是多段连段，
 * 依次通过 type 5 (skillLink) 链接了后面的子技能，需要在这里明确归纳进来。
 */
function resolveShasengConcreteSkills(displaySkillId, skillById, warnings) {
  if (displaySkillId === 4001240) {
    return [4001240, 4001241, 4001242];
  }
  if (displaySkillId === 4001260) {
    return [4001260, 4001261, 4001262];
  }
  return eng.resolveConcreteSkills(displaySkillId, skillById, warnings);
}

/**
 * 定制沙僧配置定位解析器：
 * 转职下的子技能（如 4001241、4001261 等）在普通的沙悟净 (Monster 4) 下无法找到对应的动作配置，
 * 它们实际上是无双形态“卷帘大将” (Monster 104) 的动作，需要优先使用 104-monster_cfg_ssbs 进行解析。
 */
function resolveShasengCfgFile(skill, slot, roleId, monsterById, warnings) {
  const isTrans = /^transSkill/.test(slot || "") || [4001240, 4001241, 4001242, 4001260, 4001261, 4001262].includes(skill.id);
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

  const transMonster = monsterById.get(104);
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
        cfgResolveSource: m.id === 104 ? "transForm" : (m.id === roleId ? "self" : "ownerMonster"),
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

/** 收集沙僧的所有 buff，包含对连段子技能 buff 的扫描去重 */
function collectShasengBuffs(concreteIds, slot, ctx, maxLevel, warnings) {
  const fixedBuffs = [];
  const growthBuffRefs = [];
  const seenBuffs = new Set();

  for (const skillId of concreteIds) {
    const skill = ctx.skillById.get(skillId);
    if (!skill) continue;
    const cfg = resolveShasengCfgFile(skill, slot, ROLE_ID, ctx.monsterById, warnings);
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

function resolveShasengReleaseTime(displaySkillId, cfg, skill, warnings) {
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

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function metricTotalPerFor(displaySkillId, segments, totalPer, warnings) {
  const filter = GUIDE_ATK_CONV_SEGMENT_FILTERS.get(displaySkillId);
  if (!filter) return totalPer;

  let sum = 0;
  let matched = false;
  for (const s of segments || []) {
    if (!filter(s)) continue;
    matched = true;
    sum += (s.per || 0) * (s.maxHit || 1);
  }
  if (matched) return round3(sum);

  warnings.push({
    code: "GUIDE_METRIC_SEGMENT_MISSING",
    detail: `skill ${displaySkillId} 攻转攻略口径段未命中,回退使用总系数`,
  });
  return totalPer;
}

function findSegmentOrThrow(skillId, segments, source) {
  const segment = (segments || []).find((s) => s.from === source);
  if (!segment) {
    throw new Error(`skill ${skillId} 缺少链路图段 ${source}，无法绘制技能链路`);
  }
  return segment;
}

function chainNode(label, segment) {
  const hits = segment.maxHit || 1;
  return {
    label,
    source: label,
    per: segment.per || 0,
    hits,
    totalPer: round3((segment.per || 0) * hits),
  };
}

function buildShasengChainViz(displaySkillId, segments) {
  if (displaySkillId !== 4001064) return null;

  const starterNodes = [
    chainNode("起手丢铲一段", findSegmentOrThrow(displaySkillId, segments, "bullet:1623#0")),
    chainNode("起手丢铲二段", findSegmentOrThrow(displaySkillId, segments, "bullet:1628#0")),
    chainNode("起手丢铲收束", findSegmentOrThrow(displaySkillId, segments, "bullet:2839#0")),
  ];
  const sustainNodes = [
    chainNode("毒液持续切割", findSegmentOrThrow(displaySkillId, segments, "bullet:2837#0")),
  ];

  return {
    kind: "sustain_chain",
    title: "木魔舞·毒液链路",
    source: "起手丢铲与持续切割分段统计",
    lanes: [
      {
        label: "起手丢铲",
        role: "starter",
        nodes: starterNodes,
        totalHits: starterNodes.reduce((sum, node) => sum + node.hits, 0),
        totalPer: round3(starterNodes.reduce((sum, node) => sum + node.totalPer, 0)),
      },
      {
        label: "持续毒液",
        role: "sustain",
        nodes: sustainNodes,
        totalHits: sustainNodes.reduce((sum, node) => sum + node.hits, 0),
        totalPer: round3(sustainNodes.reduce((sum, node) => sum + node.totalPer, 0)),
      },
    ],
  };
}

function resolveContinuousTotalConsumeMp(levelRow, level, ctx, warnings) {
  if (!levelRow || !Array.isArray(levelRow.bullet)) return null;
  let total = 0;
  let found = false;

  for (const bulletId of levelRow.bullet) {
    const bullet = eng.getBullet(bulletId, warnings);
    if (!bullet || !Array.isArray(bullet.dealComs)) continue;
    const hitCount = eng.damageComs(bullet).reduce((sum, com) => sum + (com.maxHit || 1), 0);

    for (const com of bullet.dealComs) {
      if (com.type !== BULLET_DEAL_BESKILL_COM_TYPE || !Array.isArray(com.beskillIds)) continue;
      if (hitCount <= 0) {
        warnings.push({ code: eng.WARN.MISSING_BULLET, detail: `bullet ${bulletId} 持续扣蓝无法映射到伤害段数` });
        continue;
      }

      for (const baseBeskillId of com.beskillIds) {
        const beskillId = baseBeskillId + level - 1;
        const beskill = ctx.beskillById.get(beskillId);
        if (!beskill) {
          warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${beskillId} 缺失` });
          continue;
        }
        if (beskill.label !== "mp") continue;

        const value = beskill.attribute?.value;
        if (!Array.isArray(value) || typeof value[0] !== "number" || typeof value[1] !== "number") {
          warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${beskillId} mp value 结构异常` });
          continue;
        }
        if (value[0] !== 0) {
          warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${beskillId} mp 按最大蓝比例扣除,不展开成固定每次耗蓝` });
          continue;
        }

        total += Math.abs(value[1]) * hitCount;
        found = true;
      }
    }
  }

  return found ? total : null;
}

/** 合并计算所有派生子技能的某一等级数据 */
function computeShasengLevel(concreteIds, level, slot, ctx, warnings) {
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

    const cfg = resolveShasengCfgFile(skill, slot, ROLE_ID, ctx.monsterById, warnings);
    const dmg = eng.computeDamageSegments(skill, row, cfg.actionCfg, warnings);

    if (dmg.segments && dmg.segments.length) {
      mergedSegments.push(...dmg.segments);
      if (!mergedKind || mergedKind === "normal") {
        mergedKind = dmg.kind;
      }
    }
  }

  if (!firstRow) return null;

  // 过滤合并后的多段伤害：如果存在伤害系数大于 0 的段数，则剔除用于占位的 Dummy 0 系数伤害段数
  const hasRealDmg = mergedSegments.some(s => s.per > 0);
  if (hasRealDmg) {
    mergedSegments = mergedSegments.filter(s => s.per > 0);
  }

  // 重新计算总系数
  let totalPer = 0, totalVal = 0;
  for (const s of mergedSegments) {
    totalPer += (s.per || 0) * (s.maxHit || 1);
    totalVal += (s.val || 0) * (s.maxHit || 1);
  }

  return {
    level,
    roleLevel: firstRow.roleLevel ?? null,
    consumeMp: resolveContinuousTotalConsumeMp(firstRow, level, ctx, warnings) ?? firstRow.consumeMp ?? null,
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

  const concreteIds = resolveShasengConcreteSkills(displaySkillId, ctx.skillById, warnings);
  const cfg = resolveShasengCfgFile(skill, slot, ROLE_ID, ctx.monsterById, warnings);

  const maxLevel = eng.detectMaxLevel(skill, ctx.skillLevelById);
  const rel = resolveShasengReleaseTime(displaySkillId, cfg, skill, warnings);

  // 收集 buff (包括子技能关联 buff 并进行去重)
  const { fixedBuffs, growthBuffRefs } = collectShasengBuffs(concreteIds, slot, ctx, maxLevel, warnings);

  const levels = [];
  for (let lv = 1; lv <= maxLevel; lv++) {
    const l = computeShasengLevel(concreteIds, lv, slot, ctx, warnings);
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

  // 技能级覆写（主要是名称及 header 配置自定义）
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
        {
          skillId: displaySkillId,
          totalPer: lv1 ? lv1.totalPer : null,
          metricTotalPer: lv1 ? metricTotalPerFor(displaySkillId, lv1.segments, lv1.totalPer, warnings) : null,
          releaseSeconds: rel.releaseSeconds,
          segCount: lv1 ? lv1.segments.reduce((a, s) => a + s.maxHit, 0) : 0,
        },
        ctx.helpers, warnings,
      ),
      chainViz: lv1 ? buildShasengChainViz(displaySkillId, lv1.segments) : null,
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
        {
          skillId: displaySkillId,
          level: l.level,
          roleLevel: l.roleLevel,
          consumeMp: l.consumeMp,
          totalPer: l.totalPer,
          metricTotalPer: metricTotalPerFor(displaySkillId, l.segments, l.totalPer, l.level === 1 ? warnings : []),
          totalVal: l.totalVal,
          growthBuffs: l.growthBuffs || [],
          releaseSeconds: rel.releaseSeconds,
          segCount: l.segments.reduce((a, s) => a + s.maxHit, 0),
        },
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
  console.log("\n👳 角色 Wiki → 沙悟净（沙僧）");

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

  u.saveOutput("role_wiki_shaseng", payload, {
    system: "role_wiki",
    sourceFiles: ["roleInitial.*.json", "role.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "passiveSkill.*.json", "beskill.*.json", "buff.*.json", "bullets.json", "entityCtg/*.json", GUIDE_PATH],
    note: "沙悟净全技能 Wiki，包括多段转职技能合并、无双形态 Cfg 解析与 passiveSkill 角色被动。",
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
