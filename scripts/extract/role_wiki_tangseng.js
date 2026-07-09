/**
 * 角色技能 Wiki - 唐三藏（唐僧）提取脚本
 *
 * 用 lib/skill-engine 按 docs/角色wiki开发.md 链路算出唐僧全技能的
 * 段数/伤害/释放时间/等级成长, 组织成"表头区(不成长)+成长区(随等级)"的卡片结构。
 *
 * 支持转职变身形态（金蝉子 Monster 102）下动作的路由查找。
 */
const path = require("path");
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");
const passiveCards = require("./lib/role-passive-cards");

// 通用派生指标(同所有角色);角色特有指标(闪避率/血蓝比等需 buff 标注)写在
// overrides/tangseng.json 的 "metrics" 段,会与这里合并。攻略口径见 lib/metrics.js。
const DEFAULT_METRICS = [
  { key: "manaConv", label: "蓝转", scope: "level", expr: "totalVal / consumeMp", when: "totalVal * consumeMp", fixed: 2 },
  { key: "atkConv", label: "攻转", scope: "level", expr: "metricTotalPer / releaseSeconds", when: "metricTotalPer * releaseSeconds", fixed: 3 },
];

const ROLE_OVERRIDE = "tangseng";
const GUIDE_PATH = "D:/zmws/保存网页资源/4399_Threads_Download/【结弦】唐僧数值侧百科_64032347/content.md";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const ROLE_ID = 2;
const BULLET_DEAL_BESKILL_COM_TYPE = 7;
const BATTLE_FRAMES_PER_SECOND = 30;
const FRAME_ZERO = 0;
const METRIC_FIXED_DIGITS = 2;
const TANGSENG_SKILL = {
  HEAL: 2001050,
  HEAL_RAIN: 2001051,
  HEAL_SHIELD: 2001052,
  HEAL_PUDU: 2001054,
  WATER_BURST: 2001060,
  WATER_BURST_HIT: 2001061,
  WATER_BURST_ICE: 2001062,
  WATER_BURST_ICE_HIT: 2001063,
  WATER_BURST_XUANMIE: 2001064,
  WATER_BURST_XUANMIE_HIT: 2001065,
  WATER_BURST_XUANMIE_SUSTAIN: 2001067,
  BANRUO: 2001230,
};
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

// 水魔爆·玄灭拆成两个展示阶段：一阶段水柱与长按持续水柱。
// 长按阶段的 7115/7114/7116 只是动作起收片段，单段系数一致，前端只展示汇总段数。
const XUANMIE_STARTER_CHAIN = [
  ["起手水柱", "actionBullet:101277"],
  ["水柱尾段", "actionBullet:101281"],
];

const GUIDE_HIT_CAPS = new Map([
  [TANGSENG_SKILL.BANRUO, {
    source: "actionBullet:96",
    maxHit: 12,
  }],
]);

const BIND_SOURCE_LABEL = {
  beSkill: "被动技能",
  beSkill2: "被动技能",
  entityActionComBuff: "技能附带",
  bulletHitBuff: "命中附带",
};

const TANGSENG_SKILL3_GROWTH_BUFF = new Map([
  [TANGSENG_SKILL.HEAL, 1000201],
  [TANGSENG_SKILL.HEAL_RAIN, 1001001],
  [TANGSENG_SKILL.HEAL_SHIELD, 13000101],
  [TANGSENG_SKILL.HEAL_PUDU, 1016901],
]);

const TANGSENG_SKILL3_METRIC = new Map([
  [TANGSENG_SKILL.HEAL, { key: "healPerMp", label: "血蓝比" }],
  [TANGSENG_SKILL.HEAL_RAIN, { key: "healPerMp", label: "血蓝比" }],
  [TANGSENG_SKILL.HEAL_SHIELD, { key: "shieldPerMp", label: "蓝盾比" }],
  [TANGSENG_SKILL.HEAL_PUDU, { key: "healPerMp", label: "血蓝比" }],
]);

function idx(arr) {
  const m = new Map();
  for (const r of arr) m.set(r.id, r);
  return m;
}

/**
 * 定制唐僧子技能展开器：
 * 保证水魔爆等技能与其派生子技能正确关联。
 */
function resolveTangsengConcreteSkills(displaySkillId, skillById, warnings) {
  if (displaySkillId === TANGSENG_SKILL.WATER_BURST) {
    return [TANGSENG_SKILL.WATER_BURST, TANGSENG_SKILL.WATER_BURST_HIT];
  }
  if (displaySkillId === TANGSENG_SKILL.WATER_BURST_ICE) {
    return [TANGSENG_SKILL.WATER_BURST_ICE, TANGSENG_SKILL.WATER_BURST_ICE_HIT];
  }
  if (displaySkillId === TANGSENG_SKILL.WATER_BURST_XUANMIE) {
    return [
      TANGSENG_SKILL.WATER_BURST_XUANMIE,
      TANGSENG_SKILL.WATER_BURST_XUANMIE_HIT,
    ];
  }
  return eng.resolveConcreteSkills(displaySkillId, skillById, warnings);
}

/**
 * 定制唐僧配置定位解析器：
 * 转职下的变身技能（如 2001240 紧箍咒、2001250 如来神掌等）在普通的唐三藏 (Monster 2) 下无法找到对应的动作配置，
 * 它们实际上是变身形态“金蝉子” (Monster 102) 的动作，需要优先使用 102-monster_cfg_tsbs 进行解析。
 */
function resolveTangsengCfgFile(skill, slot, roleId, monsterById, warnings) {
  const isTrans = /^transSkill/.test(slot || "") || [2001240, 2001230, 2001260, 2001250].includes(skill.id);
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

  const transMonster = monsterById.get(102);
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
        cfgResolveSource: m.id === 102 ? "transForm" : (m.id === roleId ? "self" : "ownerMonster"),
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

/** 收集唐僧的所有 buff，并过滤去重 */
function collectTangsengBuffs(concreteIds, slot, ctx, maxLevel, warnings) {
  const fixedBuffs = [];
  const growthBuffRefs = [];
  const seenBuffs = new Set();

  for (const skillId of concreteIds) {
    const skill = ctx.skillById.get(skillId);
    if (!skill) continue;
    const cfg = resolveTangsengCfgFile(skill, slot, ROLE_ID, ctx.monsterById, warnings);
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

function buffTickCountOrThrow(buff, skillId) {
  const time = Number(buff?.time);
  const interval = Number(buff?.interval);
  const count = countPeriodicTriggers(time, interval, FRAME_ZERO);
  if (count == null) {
    throw new Error(`skill ${skillId} buff ${buff?.id ?? "未知"} 缺少可计算的 time/interval,无法汇总持续回血次数`);
  }
  return count;
}

function multiplyBuffValue(value, multiplier) {
  if (!value) return value;
  return {
    per: typeof value.per === "number" ? round3(value.per * multiplier) : value.per,
    val: typeof value.val === "number" ? round3(value.val * multiplier) : value.val,
  };
}

function normalizeTangsengSkill3GrowthBuff(displaySkillId, baseBuffId, buff, rawBuff) {
  if (!TANGSENG_SKILL3_GROWTH_BUFF.has(displaySkillId)) return buff;
  const expectedBaseBuffId = TANGSENG_SKILL3_GROWTH_BUFF.get(displaySkillId);
  if (baseBuffId !== expectedBaseBuffId) {
    throw new Error(`skill ${displaySkillId} 技能3成长 buff 异常:期望 ${expectedBaseBuffId},实际 ${baseBuffId}`);
  }

  if (displaySkillId === TANGSENG_SKILL.HEAL_RAIN) {
    const tickCount = buffTickCountOrThrow(rawBuff, displaySkillId);
    const totalValue = multiplyBuffValue(buff.value, tickCount);
    if (typeof totalValue?.val !== "number" || Number.isNaN(totalValue.val)) {
      throw new Error(`skill ${displaySkillId} buff ${baseBuffId} 缺少可汇总的回血值`);
    }
    return {
      ...buff,
      value: totalValue,
      displayText: `每隔1秒恢复一次，共${tickCount}次，合计${totalValue.val}点生命值`,
    };
  }

  if (displaySkillId === TANGSENG_SKILL.HEAL_SHIELD) {
    if (typeof buff.value?.val !== "number" || Number.isNaN(buff.value.val)) {
      throw new Error(`skill ${displaySkillId} buff ${baseBuffId} 缺少可展示的护盾值`);
    }
    return {
      ...buff,
      displayText: `获得${buff.value.val}点护盾`,
    };
  }

  return buff;
}

function computeTangsengSkill3Metric(displaySkillId, levelRow) {
  const def = TANGSENG_SKILL3_METRIC.get(displaySkillId);
  if (!def) return null;
  const buff = (levelRow.growthBuffs || [])[0];
  const effectVal = buff?.value?.val;
  if (typeof effectVal !== "number" || Number.isNaN(effectVal)) {
    throw new Error(`skill ${displaySkillId} lv${levelRow.level} 缺少${def.label}所需成长数值`);
  }
  if (typeof levelRow.consumeMp !== "number" || levelRow.consumeMp <= 0) {
    throw new Error(`skill ${displaySkillId} lv${levelRow.level} 缺少${def.label}所需耗蓝`);
  }
  const value = effectVal / levelRow.consumeMp;
  return {
    key: def.key,
    label: def.label,
    value,
    display: metrics.formatMetric(value, { fixed: METRIC_FIXED_DIGITS }),
  };
}

function mergeMetricLists(baseMetrics, extraMetric) {
  if (!extraMetric) return baseMetrics;
  if (baseMetrics.some((metric) => metric.key === extraMetric.key)) return baseMetrics;
  return [...baseMetrics, extraMetric];
}

function resolveTangsengReleaseTime(displaySkillId, cfg, skill, ctx, warnings) {
  if (displaySkillId === TANGSENG_SKILL.WATER_BURST_XUANMIE) {
    const hitSkill = ctx.skillById.get(TANGSENG_SKILL.WATER_BURST_XUANMIE_HIT);
    if (!hitSkill) {
      warnings.push({
        code: eng.WARN.MISSING_SKILL,
        detail: `skill ${TANGSENG_SKILL.WATER_BURST_XUANMIE_HIT} 缺失,无法按玄灭一阶段水柱动作计算释放时间`,
      });
      return eng.resolveReleaseTime(cfg.entityCfg, skill.entityAction, cfg.hasActionCfg, warnings);
    }
    const hitCfg = resolveTangsengCfgFile(hitSkill, "skill4", ROLE_ID, ctx.monsterById, warnings);
    return eng.resolveReleaseTime(hitCfg.entityCfg, hitSkill.entityAction, hitCfg.hasActionCfg, warnings);
  }

  if (displaySkillId !== TANGSENG_SKILL.WATER_BURST_XUANMIE_SUSTAIN) {
    return eng.resolveReleaseTime(cfg.entityCfg, skill.entityAction, cfg.hasActionCfg, warnings);
  }

  if (typeof skill.loopTime !== "number" || !Number.isFinite(skill.loopTime)) {
    warnings.push({
      code: "XUANMIE_LOOP_TIME_MISSING",
      detail: `skill ${displaySkillId} 缺少 loopTime,无法按玄灭长按阶段计算释放时间`,
    });
    return eng.resolveReleaseTime(cfg.entityCfg, skill.entityAction, cfg.hasActionCfg, warnings);
  }

  const releaseFrames = Math.round(skill.loopTime * BATTLE_FRAMES_PER_SECOND);
  return {
    releaseFrames,
    releaseSeconds: releaseFrames / BATTLE_FRAMES_PER_SECOND,
    releaseTimeSource: `skill:${displaySkillId}.loopTime`,
  };
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
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

function buildTangsengChainViz(displaySkillId, segments) {
  if (displaySkillId !== TANGSENG_SKILL.WATER_BURST_XUANMIE) return null;

  const nodes = XUANMIE_STARTER_CHAIN
    .map(([label, source]) => chainNode(label, findSegmentOrThrow(displaySkillId, segments, source)));

  return {
    kind: "xuanmie_starter",
    title: "玄灭一阶段链路",
    source: "起手水柱与后续水柱分段统计",
    lanes: [
      {
        label: "玄灭一阶段水柱",
        role: "starter",
        nodes,
        totalHits: nodes.reduce((sum, node) => sum + node.hits, 0),
        totalPer: round3(nodes.reduce((sum, node) => sum + node.totalPer, 0)),
      },
    ],
  };
}

function actionBulletIds(actionCfg) {
  if (!actionCfg || !Array.isArray(actionCfg.com)) return [];
  return actionCfg.com.filter((c) => c.type === 2 && c.bId != null).map((c) => c.bId);
}

function xuanZhuiPrimaryActionBulletSources(actionCfg) {
  if (!actionCfg || !Array.isArray(actionCfg.com)) {
    throw new Error("skill 2001044 缺少动作配置,无法按玄锥单分支计算伤害");
  }

  const primary = actionCfg.com.filter((c) => (
    c.type === 2 &&
    c.bId != null &&
    c.cfgKeyBoard !== 1 &&
    c.downKey !== 1 &&
    !Array.isArray(c.startCom)
  ));

  if (primary.length !== 1) {
    throw new Error(`skill 2001044 玄锥主伤害分支数量异常:${primary.length}`);
  }

  return new Set(primary.map((c) => `actionBullet:${c.bId}`));
}

function countPeriodicTriggers(totalFrames, unitFrame, startFrame) {
  if (!Number.isInteger(totalFrames) || totalFrames <= FRAME_ZERO) return null;
  if (!Number.isInteger(unitFrame) || unitFrame <= FRAME_ZERO) return null;
  if (!Number.isInteger(startFrame) || startFrame < FRAME_ZERO) return null;
  if (startFrame >= totalFrames) return null;

  let count = 0;
  for (let frame = startFrame; frame < totalFrames; frame += unitFrame) count += 1;
  return count;
}

function resolveContinuousConsumeMpFromAction(skillId, level, skill, actionCfg, ctx, warnings) {
  if (typeof skill.loopTime !== "number" || !Number.isFinite(skill.loopTime)) {
    warnings.push({ code: "XUANMIE_LOOP_TIME_MISSING", detail: `skill ${skillId} 缺少 loopTime,持续扣蓝次数无法计算` });
    return null;
  }

  const loopFrames = Math.round(skill.loopTime * BATTLE_FRAMES_PER_SECOND);
  const seenTickers = new Set();
  let total = 0;
  let found = false;

  for (const bulletId of actionBulletIds(actionCfg)) {
    const bullet = eng.getBullet(bulletId, warnings);
    if (!bullet || !Array.isArray(bullet.dealComs)) continue;

    for (const com of bullet.dealComs) {
      if (Number(com.type) !== BULLET_DEAL_BESKILL_COM_TYPE || !Array.isArray(com.beskillIds)) continue;
      const unitFrame = Number(com.unitFrame);
      const startFrame = Number(com.t ?? FRAME_ZERO);
      const triggerCount = countPeriodicTriggers(loopFrames, unitFrame, startFrame);
      if (triggerCount == null) {
        warnings.push({ code: eng.WARN.MISSING_BULLET, detail: `skill ${skillId} bullet ${bulletId} 持续扣蓝 unitFrame/t 结构异常` });
        continue;
      }

      for (const baseBeskillId of com.beskillIds) {
        const tickerKey = `${baseBeskillId}:${unitFrame}:${startFrame}`;
        if (seenTickers.has(tickerKey)) continue;
        seenTickers.add(tickerKey);

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

        total += Math.abs(value[1]) * triggerCount;
        found = true;
      }
    }
  }

  return found ? total : null;
}

function resolveTangsengConsumeMp(displaySkillId, baseConsumeMp, continuousConsumeMp, warnings) {
  if (displaySkillId === TANGSENG_SKILL.WATER_BURST_XUANMIE_SUSTAIN) {
    if (continuousConsumeMp == null) {
      warnings.push({
        code: "XUANMIE_CONTINUOUS_MP_MISSING",
        detail: `skill ${displaySkillId} 未解析到持续扣蓝,玄灭长按阶段耗蓝无法计算`,
      });
      return null;
    }
    return continuousConsumeMp;
  }

  if (displaySkillId === TANGSENG_SKILL.WATER_BURST_XUANMIE && continuousConsumeMp != null) {
    warnings.push({
      code: "XUANMIE_PHASE_MP_UNEXPECTED",
      detail: `skill ${displaySkillId} 一阶段不应合并长按持续扣蓝`,
    });
  }
  return baseConsumeMp ?? null;
}

/** 合并计算所有派生子技能的某一等级数据 */
function computeTangsengLevel(concreteIds, level, slot, ctx, warnings) {
  // 特殊技能拦截 1: 玄冰破·冰结 (2001041)
  // 其等级表为 0，需拷贝 2001040 对应的数值并重置 coefficient 为 2.6
  if (concreteIds[0] === 2001041) {
    const baseSkill = ctx.skillById.get(2001040);
    const baseRow = ctx.skillLevelById.get(eng.skillLevelRowId(baseSkill, level));
    if (!baseRow) return null;
    const baseCfg = resolveTangsengCfgFile(baseSkill, slot, ROLE_ID, ctx.monsterById, warnings);
    const baseDmg = eng.computeDamageSegments(baseSkill, baseRow, baseCfg.actionCfg, warnings);

    const segments = baseDmg.segments.map(s => ({
      ...s,
      per: 2.6,
      from: "charge:" + s.from
    }));

    let totalPer = 0, totalVal = 0;
    for (const s of segments) {
      totalPer += s.per * s.maxHit;
      totalVal += s.val * s.maxHit;
    }

    return {
      level,
      roleLevel: baseRow.roleLevel ?? null,
      consumeMp: baseRow.consumeMp ?? null,
      soulCost: baseRow.soulCost ?? null,
      kind: "bullet",
      segments,
      totalPer: Math.round(totalPer * 1000) / 1000,
      totalVal: Math.round(totalVal * 1000) / 1000,
      addDefendVal: baseRow.addDefendVal ?? null
    };
  }

  let mergedSegments = [];
  let mergedKind = null;
  let firstRow = null;
  let continuousConsumeMp = null;

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

    const cfg = resolveTangsengCfgFile(skill, slot, ROLE_ID, ctx.monsterById, warnings);
    if (skillId === TANGSENG_SKILL.WATER_BURST_XUANMIE_SUSTAIN) {
      continuousConsumeMp = resolveContinuousConsumeMpFromAction(skillId, level, skill, cfg.actionCfg, ctx, warnings);
    }

    // 特殊技能拦截 2: 玄冰破·玄锥 (2001044)
    // actionCfg 同时挂了默认分支和 downKey/cfgKeyBoard 分支,展示口径只取实际主伤害分支。
    if (skillId === 2001044) {
      const baseDmg = eng.computeDamageSegments(skill, row, cfg.actionCfg, warnings);
      const sources = xuanZhuiPrimaryActionBulletSources(cfg.actionCfg);
      const segments = baseDmg.segments.filter((s) => sources.has(s.from));
      if (!segments.length) throw new Error(`skill ${skill.id} lv${level} 未命中玄锥主伤害分支`);

      let totalPer = 0, totalVal = 0;
      for (const s of segments) {
        totalPer += s.per * s.maxHit;
        totalVal += s.val * s.maxHit;
      }

      return {
        level,
        roleLevel: row.roleLevel ?? null,
        consumeMp: row.consumeMp ?? null,
        soulCost: row.soulCost ?? null,
        kind: "bullet",
        segments,
        totalPer: Math.round(totalPer * 1000) / 1000,
        totalVal: Math.round(totalVal * 1000) / 1000,
        addDefendVal: row.addDefendVal ?? null
      };
    }

    const dmg = eng.computeDamageSegments(skill, row, cfg.actionCfg, warnings);

    if (dmg.segments && dmg.segments.length) {
      // 伤害段数后处理逻辑：
      // 1. 水幻影·冰霜 (2001031) 中的 Bullet 524 最大击打数为 99，实战仅 1 次，强制截断为 1。
      // 2. 般若咒 (2001230) 攻略明确按 12 连击展示。
      // 3. 如来神掌 (2001250) 中的 Bullet 102 (小掌) 和 103 (大掌) 分别触发 11 次和 2 次。
      const guideHitCap = GUIDE_HIT_CAPS.get(skillId);
      for (const seg of dmg.segments) {
        if (seg.from === "actionBullet:524") {
          seg.maxHit = 1;
        }
        if (guideHitCap && seg.from === guideHitCap.source) {
          seg.maxHit = guideHitCap.maxHit;
        }
        if (seg.from === "bullet:102#0") {
          seg.maxHit = 11;
        }
        if (seg.from === "bullet:103#0") {
          seg.maxHit = 2;
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

  // 过滤多段占位的 Dummy 0 系数伤害段数
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
    consumeMp: resolveTangsengConsumeMp(concreteIds[0], firstRow.consumeMp, continuousConsumeMp, warnings),
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

  const concreteIds = resolveTangsengConcreteSkills(displaySkillId, ctx.skillById, warnings);
  const cfg = resolveTangsengCfgFile(skill, slot, ROLE_ID, ctx.monsterById, warnings);

  const maxLevel = eng.detectMaxLevel(skill, ctx.skillLevelById);
  const rel = resolveTangsengReleaseTime(displaySkillId, cfg, skill, ctx, warnings);

  // 收集 buff (包括子技能关联 buff 并进行去重)
  const { fixedBuffs, growthBuffRefs } = collectTangsengBuffs(concreteIds, slot, ctx, maxLevel, warnings);

  const levels = [];
  for (let lv = 1; lv <= maxLevel; lv++) {
    const l = computeTangsengLevel(concreteIds, lv, slot, ctx, warnings);
    if (!l) continue;

    // 逐级渲染成长 buff 的当前数据
    l.growthBuffs = growthBuffRefs.map((ref) => {
      const g = eng.resolveBuffGrowth(ref.baseBuffId, lv, ctx.buffById, warnings);
      const rawBuffG = resolveRawBuff(g.buff, ctx.buffById);
      const engBuff = { baseBuffId: ref.baseBuffId, name: ref.name, bindLabel: ref.bindLabel, time: ref.time, value: buffValueSummary(rawBuffG) };
      let mergedBuff = engBuff;
      if (ref.override && rawBuffG) {
        const { merged, warnings: w } = ov.mergeBuff(engBuff, ref.override, rawBuffG, ref.label);
        if (lv === 1) warnings.push(...w); // 警告只报一次
        mergedBuff = merged;
      }
      return normalizeTangsengSkill3GrowthBuff(displaySkillId, ref.baseBuffId, mergedBuff, rawBuffG);
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
          metricTotalPer: lv1 ? lv1.totalPer : null,
          releaseSeconds: rel.releaseSeconds,
          segCount: lv1 ? lv1.segments.reduce((a, s) => a + s.maxHit, 0) : 0,
        },
        ctx.helpers, warnings,
      ),
      chainViz: lv1 ? buildTangsengChainViz(displaySkillId, lv1.segments) : null,
    },
    maxLevel,
    levels: levels.map((l) => {
      const row = {
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
            metricTotalPer: l.totalPer,
            totalVal: l.totalVal,
            growthBuffs: l.growthBuffs || [],
            releaseSeconds: rel.releaseSeconds,
            segCount: l.segments.reduce((a, s) => a + s.maxHit, 0),
          },
          ctx.helpers, l.level === 1 ? warnings : [],
        ),
      };
      row.metrics = mergeMetricLists(row.metrics, computeTangsengSkill3Metric(displaySkillId, row));
      return row;
    }),
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

function compareByJson(a, b) {
  return JSON.stringify(a).localeCompare(JSON.stringify(b));
}

function comparableBuffValue(value) {
  if (!value) return null;
  return {
    per: value.per ?? null,
    val: value.val ?? null,
  };
}

function comparableBuff(buff) {
  if (!buff) return null;
  return {
    value: comparableBuffValue(buff.value),
  };
}

function comparableMetric(metric) {
  return {
    key: metric.key ?? null,
    label: metric.label ?? null,
    value: metric.value ?? null,
    display: metric.display ?? null,
  };
}

function comparableHeader(header) {
  return {
    kind: header.kind ?? null,
    segments: (header.segments || []).map((s) => ({ per: s.per ?? null, maxHit: s.maxHit ?? null })),
    segCount: header.segCount ?? null,
    totalPer: header.totalPer ?? null,
    addDefendVal: header.addDefendVal ?? null,
    fixedBuffs: (header.fixedBuffs || []).map(comparableBuff).sort(compareByJson),
  };
}

function comparableLevel(level) {
  return {
    level: level.level ?? null,
    roleLevel: level.roleLevel ?? null,
    consumeMp: level.consumeMp ?? null,
    segmentVals: (level.segmentVals || []).map((s) => ({ val: s.val ?? null, maxHit: s.maxHit ?? null })),
    totalPer: level.totalPer ?? null,
    totalVal: level.totalVal ?? null,
    growthBuffs: (level.growthBuffs || []).map(comparableBuff).sort(compareByJson),
    metrics: (level.metrics || []).map(comparableMetric).sort(compareByJson),
  };
}

function comparableValueSignature(card) {
  return {
    maxLevel: card.maxLevel ?? null,
    header: comparableHeader(card.header || {}),
    levels: (card.levels || []).map(comparableLevel),
  };
}

/** 比较两个技能卡片的最终展示数值，判定是否全等合并 */
function sameValues(a, b) {
  if (!a || !b || a.error || b.error) return false;
  return JSON.stringify(comparableValueSignature(a)) === JSON.stringify(comparableValueSignature(b));
}

function extract() {
  console.log("\n👳 角色 Wiki → 唐三藏（唐僧）");

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
  // 指标取值辅助:抗值按"学习等级"查;buff 值按 valuePath 取
  // (唐僧部分 buff 数值在 attachBuff 里,用脚本既有的 resolveRawBuff 解出再取)
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
    const expandedAwakenIds = [];
    const seenAwakenIds = new Set();
    for (const awId of Array.isArray(awakenIds) ? awakenIds : []) {
      if (!seenAwakenIds.has(awId)) {
        expandedAwakenIds.push(awId);
        seenAwakenIds.add(awId);
      }
      if (awId === TANGSENG_SKILL.WATER_BURST_XUANMIE && !seenAwakenIds.has(TANGSENG_SKILL.WATER_BURST_XUANMIE_SUSTAIN)) {
        expandedAwakenIds.push(TANGSENG_SKILL.WATER_BURST_XUANMIE_SUSTAIN);
        seenAwakenIds.add(TANGSENG_SKILL.WATER_BURST_XUANMIE_SUSTAIN);
      }
    }

    for (const awId of expandedAwakenIds) {
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

  u.saveOutput("role_wiki_tangseng", payload, {
    system: "role_wiki",
    sourceFiles: ["roleInitial.*.json", "role.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "passiveSkill.*.json", "beskill.*.json", "buff.*.json", "bullets.json", "entityCtg/*.json", GUIDE_PATH],
    note: "唐三藏全技能 Wiki，包括多段金蝉子变身技能合并、特殊多段伤害后处理与 passiveSkill 角色被动。",
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
