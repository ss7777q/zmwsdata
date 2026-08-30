/**
 * 坐骑技能 Wiki - 赤凤/赤炎凤凰/青鸾/寒冰凤凰提取脚本
 *
 * 凤凰组有多处展示技能只是动作入口,真实伤害在后续子技能里。
 * 导出阶段按战斗配置找到子技能,再按本地攻略图鉴图3的连击口径收口,
 * 避免把入口技能的 0/1 占位值或弹幕采样点当成技能数值。
 */
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");

const RIDE_OVERRIDE = "fenghuang";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const BATTLE_FRAMES_PER_SECOND = 30;
const GUIDE_PATH = "D:/zmws/保存网页资源/4399_Threads_Download/【结弦】造梦无双坐骑数值汇总_64056651/content.md";

const RIDE_IDS = [201202, 201212];
const FENGHUANG_SKILL = {
  FIRE_FEATHERS: 20613010101,
  FIRE_CONE: 20613010201,
  FIRE_CONE_DAMAGE: 20613010202,
  FIRE_WHEEL: 20613010301,
  FIRE_CHILD: 20613010401,
  FIRE_DESCENT: 20613010501,
  FIRE_DESCENT_STEP: 20613010503,
  FIRE_DESCENT_FINISH: 20613010504,
  FIRE_PASSIVE: 20613010601,
  FIRE_EXPLODE: 20613010602,
  FIRE_EXPLODE_RIDE: 20613010622,
  ICE_FREEZE: 20618010101,
  ICE_CONE: 20618010201,
  ICE_CONE_DAMAGE: 20618010202,
  ICE_WALL: 20618010301,
  ICE_CHILD: 20618010401,
  ICE_CRYSTAL: 20618010501,
  ICE_CRYSTAL_BROKEN: 20618010513,
  ICE_CRYSTAL_RELEASE: 20618010514,
  ICE_PASSIVE: 20618010601,
};
const FENGHUANG_BUFF = {
  FIRE_BREAK: 6004101,
  FIRE_BREAK_RIDE: 6004102,
  ICE_SLOW: 4041301,
};

// 召唤子嗣：父技能 skillLvInhert=1 时，召唤物 skillIds 全部继承当前技能等级
const FENGHUANG_CHILD = {
  [FENGHUANG_SKILL.FIRE_CHILD]: {
    monsterId: 2061300,
    name: "赤凤之子",
    durationSeconds: 30,
    maxCount: 1,
    inheritAttrs: "生命16.7%、回血16.7%，攻击/防御/命中/闪避/暴击/韧性/幸运/守护/穿透/减伤约100%；速度固定360",
    skills: [
      // attack1: 2012 有效；skill1: 2484 + 4×2015 有效 = 5 段
      { skillId: 20613000001, label: "普攻", kind: "attack", hits: 1, grows: false },
      { skillId: 20613000101, label: "烈火焚烧", kind: "active", hits: 5, grows: true, metricKey: "childSkillVal", metricLabel: "烈火焚烧固伤/段" },
    ],
  },
  [FENGHUANG_SKILL.ICE_CHILD]: {
    monsterId: 2061803,
    name: "青鸾之子",
    durationSeconds: 30,
    maxCount: 1,
    inheritAttrs: "生命51%、回血85%，攻击/防御/命中/闪避/暴击/韧性/幸运/守护/穿透/减伤约100%；速度固定300",
    skills: [
      // skill1: 2848 有效；skill2: 5×3662 有效（3667 notActive）
      { skillId: 20618030101, label: "普攻攻击", kind: "attack", hits: 1, grows: false },
      { skillId: 20618030201, label: "寒冰之球", kind: "active", hits: 5, grows: true, metricKey: "childSkillVal", metricLabel: "寒冰之球固伤/段" },
    ],
  },
};

const EFFECT_ONLY_SKILLS = new Set([
  FENGHUANG_SKILL.FIRE_CHILD,
  FENGHUANG_SKILL.ICE_CHILD,
  FENGHUANG_SKILL.ICE_CRYSTAL,
]);

const CONCRETE_SKILLS = new Map([
  [FENGHUANG_SKILL.FIRE_CONE, [FENGHUANG_SKILL.FIRE_CONE_DAMAGE]],
  [FENGHUANG_SKILL.FIRE_DESCENT, [FENGHUANG_SKILL.FIRE_DESCENT_STEP, FENGHUANG_SKILL.FIRE_DESCENT_FINISH]],
  [FENGHUANG_SKILL.ICE_CONE, [FENGHUANG_SKILL.ICE_CONE_DAMAGE]],
  [FENGHUANG_SKILL.ICE_CRYSTAL, [FENGHUANG_SKILL.ICE_CRYSTAL]],
]);

const GUIDE_SEGMENT_RULES = new Map([
  [FENGHUANG_SKILL.FIRE_FEATHERS, { source: "actionBullet:2897", hits: 7, detail: "烈火焚烧攻略图鉴按7连击展示" }],
  [FENGHUANG_SKILL.ICE_FREEZE, { source: "actionBullet:3763", hits: 7, detail: "寒冰冻结攻略图鉴按7连击展示" }],
]);

function guideRelease(seconds, source) {
  return { frames: Math.round(seconds * BATTLE_FRAMES_PER_SECOND), source };
}

const GUIDE_RELEASE_FRAMES = new Map([
  [FENGHUANG_SKILL.FIRE_CONE, guideRelease(1.27, "guide:rideSummary:image9:火锥冲击释放1.27s")],
  [FENGHUANG_SKILL.ICE_CONE, guideRelease(1.27, "guide:rideSummary:image9:冰锥冲击释放1.27s")],
]);

const COMPOSITE_RELEASE_SKILLS = new Map([
  [FENGHUANG_SKILL.FIRE_DESCENT, [20613010501, 20613010502, 20613010503, 20613010504]],
]);

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
  return skill?.desName || skill?.Name || skill?.name || `技能${skillId}`;
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
    const { merged, warnings: w } = ov.mergeBuff(engineBuff, override, rawBuff, `[fenghuang buff ${baseBuffId} ${engineBuff.name}] `);
    warnings.push(...w);
    out.push(merged);
  } else {
    out.push(engineBuff);
  }
}

function effectCard(baseBuffId, name, bindSource, displayText, value = null, time = -1) {
  return {
    baseBuffId,
    name,
    text: null,
    time,
    bindSource,
    bindLabel: BIND_SOURCE_LABEL[bindSource] || bindSource,
    value,
    displayText,
  };
}

function skillLevelRow(skillId, level, ctx, warnings) {
  const skill = ctx.skillById.get(skillId);
  const row = skill ? ctx.skillLevelById.get(eng.skillLevelRowId(skill, level)) : null;
  if (!skill) warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `skill ${skillId} 不存在` });
  else if (!row) warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `skill ${skillId} lv${level} 缺失` });
  return { skill, row };
}

function collectPassiveEffects(skillId, ctx, warnings) {
  const out = [];
  if (skillId === FENGHUANG_SKILL.FIRE_PASSIVE) {
    const normal = skillLevelRow(FENGHUANG_SKILL.FIRE_EXPLODE, 1, ctx, warnings).row;
    const riding = skillLevelRow(FENGHUANG_SKILL.FIRE_EXPLODE_RIDE, 1, ctx, warnings).row;
    out.push(effectCard(
      FENGHUANG_SKILL.FIRE_PASSIVE,
      "炎爆值累积",
      "guideEffect",
      "普通攻击每段累加1%炎爆值；烈火焚烧合计35%，火锥冲击合计42%，火焰之轮合计52%，赤凤降世合计85%",
    ));
    if (normal) {
      out.push(effectCard(
        FENGHUANG_SKILL.FIRE_EXPLODE,
        "炎爆触发",
        "mechanismEffect",
        `炎爆值满后触发一次${normal.damageAddPer} * atk伤害；激活赤凤骑术时改为${riding?.damageAddPer ?? "?"} * atk，并继承主人8%攻击、命中、暴击、幸运`,
        { per: normal.damageAddPer ?? null, val: normal.damageAddVal ?? null },
      ));
    }
    pushBuffCard(out, skillId, FENGHUANG_BUFF.FIRE_BREAK, ctx.buffById.get(FENGHUANG_BUFF.FIRE_BREAK), "mechanismEffect", ctx, warnings, null);
    if (ctx.buffById.has(FENGHUANG_BUFF.FIRE_BREAK_RIDE)) {
      pushBuffCard(out, skillId, FENGHUANG_BUFF.FIRE_BREAK_RIDE, ctx.buffById.get(FENGHUANG_BUFF.FIRE_BREAK_RIDE), "mechanismEffect", ctx, warnings, null);
    }
    return out;
  }

  if (skillId === FENGHUANG_SKILL.ICE_PASSIVE) {
    out.push(effectCard(
      FENGHUANG_SKILL.ICE_PASSIVE,
      "冰霜值累积",
      "guideEffect",
      "普通攻击每段累加1%冰霜值；寒冰冻结每段15%，冰锥冲击每段3%，冰封之墙60%，神圣冰晶100%",
    ));
    pushBuffCard(out, skillId, FENGHUANG_BUFF.ICE_SLOW, ctx.buffById.get(FENGHUANG_BUFF.ICE_SLOW), "passiveEffect", ctx, warnings, null);
    out.push(effectCard(
      7046904,
      "寒霜之气骑术",
      "guideEffect",
      "冰霜值满后触发冰冻；激活寒冰凤凰骑术时冰冻时间延长至5s，并继承主人8%生命、攻击、命中、闪避",
    ));
  }
  return out;
}

function formatNumber(n, fixed = 3) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "?";
  // 系数类常需保留 4 位（如 0.0374），整数固伤用 fixed=0
  const text = Number(n.toFixed(fixed)).toString();
  return text;
}

function formatPer(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "?";
  // 去掉尾零，但至少保留到能区分 0.0374 / 0.0335
  const fixed = Math.abs(n) > 0 && Math.abs(n) < 1 ? 4 : 3;
  return Number(n.toFixed(fixed)).toString();
}

function collectSummonEffect(displaySkillId, ride, ctx, warnings) {
  const skill = ctx.skillById.get(displaySkillId);
  if (!skill) return [];
  const cfg = resolveRideCfgFile(skill, ride, ctx, warnings);
  const summon = cfg.actionCfg?.com?.find((c) => c.type === 13);
  const child = FENGHUANG_CHILD[displaySkillId];
  if (!summon) {
    warnings.push({ code: eng.WARN.MISSING_ACTION_CFG, detail: `skill ${displaySkillId} 未找到召唤 com(type=13)` });
    return [];
  }
  const monsterId = asArray(summon.mIds)[0];
  const monster = ctx.monsterById.get(monsterId) || (child ? ctx.monsterById.get(child.monsterId) : null);
  const name = child?.name || monster?.name || `怪物${monsterId ?? "?"}`;
  const duration = typeof summon.time === "number"
    ? (summon.time === -1 ? "无持续时间限制" : `持续${formatNumber(summon.time, 0)}秒`)
    : (child ? `持续${child.durationSeconds}秒` : "持续时间未解析");
  const maxCount = summon.maxCount ?? child?.maxCount ?? "?";
  const skillLvInherit = summon.skillLvInhert === 1;

  const out = [
    effectCard(
      displaySkillId,
      name,
      "mechanismEffect",
      `召唤${name}协助战斗，最多同时存在${maxCount}只，${duration}。`,
    ),
  ];

  if (child) {
    for (const def of child.skills) {
      const childSkill = ctx.skillById.get(def.skillId);
      const row = childSkill ? ctx.skillLevelById.get(eng.skillLevelRowId(childSkill, 1)) : null;
      if (!childSkill) {
        warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `${child.name} 技能 ${def.skillId} 缺失` });
        continue;
      }
      if (!row) {
        warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `${child.name} 技能 ${def.skillId} Lv.1 缺失` });
      }
      const per = row?.damageAddPer ?? childSkill.damageAddPer ?? null;
      const totalPer = typeof per === "number" ? Number((per * (def.hits || 1)).toFixed(4)) : null;
      if (def.kind === "attack") {
        out.push(effectCard(
          def.skillId,
          `${child.name}${def.label}`,
          "mechanismEffect",
          `${def.label}系数${formatPer(per)}，约${def.hits}段，总系数${formatPer(totalPer)}；技能等级表仅1级，不随父技能升级成长。`,
        ));
      } else {
        out.push(effectCard(
          def.skillId,
          `${child.name}${def.label}`,
          "mechanismEffect",
          `${def.label}每段系数${formatPer(per)}，按动作约${def.hits}段，总系数${formatPer(totalPer)}；固伤随父技能等级成长，见成长数值。`,
        ));
      }
    }
  }

  if (!skillLvInherit) {
    warnings.push({ code: eng.WARN.MISSING_ACTION_CFG, detail: `skill ${displaySkillId} 召唤未配置 skillLvInhert` });
  }
  return out;
}

function collectSummonMechanics(displaySkillId, ride, ctx, warnings) {
  const child = FENGHUANG_CHILD[displaySkillId];
  if (!child) return [];
  const skill = ctx.skillById.get(displaySkillId);
  const cfg = skill ? resolveRideCfgFile(skill, ride, ctx, warnings) : null;
  const summon = cfg?.actionCfg?.com?.find((c) => c.type === 13);
  const skillLvInherit = summon?.skillLvInhert === 1;
  const growSkills = child.skills.filter((s) => s.grows).map((s) => s.label).join("、");
  const fixedSkills = child.skills.filter((s) => !s.grows).map((s) => s.label).join("、");
  return [
    {
      label: "技能等级继承",
      value: skillLvInherit
        ? `召唤配置 skillLvInhert=1：${child.name} 的 skillIds 技能等级等于父技能当前等级。${growSkills || "成长技能"}的固伤读对应 skillLevel 行；${fixedSkills || "普攻"}仅有1级表，不随升级变化。攻击系数不随等级变化。`
        : "召唤配置未开启技能等级继承，召唤物技能默认按1级结算。",
    },
    {
      label: "属性继承",
      value: `召唤物 source=1，创建时按怪物表系数从主人继承：${child.inheritAttrs}。升级父技能不直接改这些属性比例，主要提升召唤物技能固伤。`,
    },
  ];
}

function collectSummonLevelMetrics(displaySkillId, level, ctx, warnings) {
  const child = FENGHUANG_CHILD[displaySkillId];
  if (!child) return [];
  const metricsOut = [];
  for (const def of child.skills) {
    if (!def.grows || !def.metricKey) continue;
    const childSkill = ctx.skillById.get(def.skillId);
    const row = childSkill ? ctx.skillLevelById.get(eng.skillLevelRowId(childSkill, level)) : null;
    if (!childSkill) {
      if (level === 1) warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `${child.name} 成长技能 ${def.skillId} 缺失` });
      continue;
    }
    if (!row) {
      if (level === 1) warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `${child.name} 成长技能 ${def.skillId} Lv.${level} 缺失` });
      metricsOut.push({ key: def.metricKey, label: def.metricLabel, value: null, display: null });
      continue;
    }
    const per = row.damageAddPer ?? null;
    const val = row.damageAddVal ?? null;
    const hits = def.hits || 1;
    metricsOut.push({
      key: def.metricKey,
      label: def.metricLabel,
      value: val,
      display: typeof val === "number" ? formatNumber(val, 0) : null,
    });
    metricsOut.push({
      key: `${def.metricKey}Total`,
      label: `${def.label}总固伤`,
      value: typeof val === "number" ? val * hits : null,
      display: typeof val === "number" ? formatNumber(val * hits, 0) : null,
    });
    metricsOut.push({
      key: `${def.metricKey}Per`,
      label: `${def.label}段系数`,
      value: per,
      display: typeof per === "number" ? formatPer(per) : null,
    });
    metricsOut.push({
      key: `${def.metricKey}TotalPer`,
      label: `${def.label}总系数`,
      value: typeof per === "number" ? Number((per * hits).toFixed(4)) : null,
      display: typeof per === "number" ? formatPer(Number((per * hits).toFixed(4))) : null,
    });
  }
  return metricsOut;
}

function collectShieldEffects(ctx, warnings) {
  const broken = skillLevelRow(FENGHUANG_SKILL.ICE_CRYSTAL_BROKEN, 1, ctx, warnings).row;
  const release = skillLevelRow(FENGHUANG_SKILL.ICE_CRYSTAL_RELEASE, 1, ctx, warnings).row;
  const out = [];
  if (release) {
    out.push(effectCard(
      FENGHUANG_SKILL.ICE_CRYSTAL_RELEASE,
      "主动爆开",
      "mechanismEffect",
      `护盾存在时再次释放，造成${release.damageAddPer} * atk + 10 * 剩余护盾值，1段`,
      { per: release.damageAddPer ?? null, val: release.damageAddVal ?? null },
    ));
  }
  if (broken) {
    out.push(effectCard(
      FENGHUANG_SKILL.ICE_CRYSTAL_BROKEN,
      "被击碎爆开",
      "mechanismEffect",
      `护盾被击碎时按表触发${broken.damageAddPer} * atk，1段`,
      { per: broken.damageAddPer ?? null, val: broken.damageAddVal ?? null },
    ));
  }
  out.push(effectCard(
    FENGHUANG_SKILL.ICE_CRYSTAL,
    "冰晶吸收",
    "guideEffect",
    "10s后护盾未破且未主动爆开时，剩余护盾值按1.15倍转为生命值",
  ));
  return out;
}

function collectGuideEffects(displaySkillId, ride, ctx, warnings) {
  if (displaySkillId === FENGHUANG_SKILL.FIRE_CHILD || displaySkillId === FENGHUANG_SKILL.ICE_CHILD) {
    return collectSummonEffect(displaySkillId, ride, ctx, warnings);
  }
  if (displaySkillId === FENGHUANG_SKILL.ICE_CRYSTAL) return collectShieldEffects(ctx, warnings);
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
      const label = `[fenghuang buff ${ref.baseBuffId} ${base.name}] `;

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
  }

  if (slotKind === "passive") fixedBuffs.push(...collectPassiveEffects(displaySkillId, ctx, warnings));
  fixedBuffs.push(...collectGuideEffects(displaySkillId, ride, ctx, warnings));
  return { fixedBuffs, growthBuffRefs };
}

function applyGuideSegmentRules(displaySkillId, segments) {
  const rule = GUIDE_SEGMENT_RULES.get(displaySkillId);
  if (!rule) return segments;
  return segments.map((s) => s.from === rule.source ? { ...s, maxHit: rule.hits, capSource: rule.detail } : s);
}

function makeEffectOnlyLevel(displaySkillId, level, ctx, warnings) {
  const skill = ctx.skillById.get(displaySkillId);
  const row = skill ? ctx.skillLevelById.get(eng.skillLevelRowId(skill, level)) : null;
  if (!row) warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `技能 ${displaySkillId} Lv.${level} 缺少等级数据，无法展示机制成长` });
  const metrics = collectSummonLevelMetrics(displaySkillId, level, ctx, warnings);
  return {
    level,
    roleLevel: row?.roleLevel ?? null,
    consumeMp: row?.consumeMp ?? null,
    soulCost: row?.soulCost ?? null,
    kind: "effectOnly",
    segments: [],
    totalPer: null,
    totalVal: null,
    addDefendVal: row?.addDefendVal ?? null,
    metrics,
  };
}

function makeSegment(source, row, maxHit, capSource = null) {
  return {
    per: row.damageAddPer ?? 0,
    val: row.damageAddVal ?? 0,
    maxHit,
    from: source,
    capSource,
  };
}

function computeCustomLevel(displaySkillId, level, ride, ctx, warnings) {
  if (displaySkillId === FENGHUANG_SKILL.FIRE_CONE || displaySkillId === FENGHUANG_SKILL.ICE_CONE) {
    const damageSkillId = displaySkillId === FENGHUANG_SKILL.FIRE_CONE ? FENGHUANG_SKILL.FIRE_CONE_DAMAGE : FENGHUANG_SKILL.ICE_CONE_DAMAGE;
    const source = displaySkillId === FENGHUANG_SKILL.FIRE_CONE ? "actionBullet:2866" : "actionBullet:3664";
    const { row } = skillLevelRow(damageSkillId, level, ctx, warnings);
    const display = skillLevelRow(displaySkillId, level, ctx, warnings).row;
    if (!row) return null;
    const segments = [makeSegment(source, row, 7, `${skillName(displaySkillId, ctx)}攻略图鉴按7连击展示`)];
    return finalizeLevel(level, display || row, "normalActionBullet", segments);
  }

  if (displaySkillId === FENGHUANG_SKILL.FIRE_DESCENT) {
    const step = skillLevelRow(FENGHUANG_SKILL.FIRE_DESCENT_STEP, level, ctx, warnings).row;
    const finish = skillLevelRow(FENGHUANG_SKILL.FIRE_DESCENT_FINISH, level, ctx, warnings).row;
    const display = skillLevelRow(displaySkillId, level, ctx, warnings).row;
    if (!step || !finish) return null;
    const segments = [
      makeSegment("actionBullet:2876", step, 10, "赤凤降世攻略图鉴按火柱10连击展示"),
      makeSegment("actionBullet:2878", finish, 1, "赤凤降世攻略图鉴按终段1连击展示"),
    ];
    return finalizeLevel(level, display || step, "normalActionBullet", segments);
  }

  return null;
}

function finalizeLevel(level, row, kind, segments) {
  let totalPer = 0;
  let totalVal = 0;
  for (const s of segments) {
    totalPer += (s.per || 0) * (s.maxHit || 1);
    totalVal += (s.val || 0) * (s.maxHit || 1);
  }
  return {
    level,
    roleLevel: row.roleLevel ?? null,
    consumeMp: row.consumeMp ?? null,
    soulCost: row.soulCost ?? null,
    kind,
    segments,
    totalPer: round(totalPer),
    totalVal: round(totalVal),
    addDefendVal: row.addDefendVal ?? null,
  };
}

function computeRideLevel(displaySkillId, concreteIds, level, ride, slotKind, ctx, warnings) {
  if (slotKind === "passive") {
    return {
      level: 1,
      roleLevel: null,
      consumeMp: null,
      soulCost: null,
      kind: "effectOnly",
      segments: [],
      totalPer: null,
      totalVal: null,
      addDefendVal: null,
    };
  }
  if (EFFECT_ONLY_SKILLS.has(displaySkillId)) return makeEffectOnlyLevel(displaySkillId, level, ctx, warnings);

  const custom = computeCustomLevel(displaySkillId, level, ride, ctx, warnings);
  if (custom) return custom;

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
  mergedSegments = applyGuideSegmentRules(displaySkillId, mergedSegments);
  if (mergedSegments.some((s) => s.per > 0)) mergedSegments = mergedSegments.filter((s) => s.per > 0);
  return finalizeLevel(level, firstRow, mergedKind || "normal", mergedSegments);
}

function resolveFenghuangConcreteSkills(displaySkillId, ctx, warnings) {
  const preset = CONCRETE_SKILLS.get(displaySkillId);
  if (preset) return preset;
  if (ctx.skillById.has(displaySkillId)) return [displaySkillId];
  warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `skill ${displaySkillId} 不在 skill 表` });
  return [];
}

function detectDisplayMaxLevel(displaySkillId, concreteIds, slotKind, ctx) {
  if (slotKind === "passive") return 1;
  if (EFFECT_ONLY_SKILLS.has(displaySkillId)) {
    const skill = ctx.skillById.get(displaySkillId);
    return skill ? eng.detectMaxLevel(skill, ctx.skillLevelById) : 0;
  }
  let maxLevel = 0;
  for (const id of [displaySkillId, ...concreteIds]) {
    const skill = ctx.skillById.get(id);
    if (skill) maxLevel = Math.max(maxLevel, eng.detectMaxLevel(skill, ctx.skillLevelById));
  }
  return maxLevel;
}

function resolveRideReleaseTime(displaySkillId, ride, displayCfg, skill, ctx, warnings) {
  const guide = GUIDE_RELEASE_FRAMES.get(displaySkillId);
  if (guide) {
    return {
      releaseFrames: guide.frames,
      releaseSeconds: guide.frames / BATTLE_FRAMES_PER_SECOND,
      releaseTimeSource: guide.source,
    };
  }

  const composite = COMPOSITE_RELEASE_SKILLS.get(displaySkillId);
  if (composite) {
    let frames = 0;
    const actions = [];
    for (const skillId of composite) {
      const s = ctx.skillById.get(skillId);
      if (!s) {
        warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `composite release skill ${skillId} 缺失` });
        continue;
      }
      const cfg = resolveRideCfgFile(s, ride, ctx, warnings);
      const t = cfg.entityCfg?.time?.[s.entityAction];
      if (typeof t !== "number") {
        warnings.push({ code: eng.WARN.SOURCE_DEFAULT_30_FRAMES, detail: `composite release skill ${skillId} action=${s.entityAction} 缺少 time` });
        continue;
      }
      frames += t;
      actions.push(s.entityAction);
    }
    return {
      releaseFrames: frames || null,
      releaseSeconds: frames ? frames / BATTLE_FRAMES_PER_SECOND : null,
      releaseTimeSource: frames ? `entityCtg.time:${actions.join("+")}` : "actionCfgMissing",
    };
  }

  return eng.resolveReleaseTime(displayCfg.entityCfg, skill.entityAction, displayCfg.hasActionCfg, warnings);
}

function buildSkillCard(displaySkillId, ride, slotLabel, slotKind, ctx) {
  const warnings = [];
  const skill = ctx.skillById.get(displaySkillId);
  if (!skill) {
    return { skillId: displaySkillId, name: `技能${displaySkillId}`, error: "skill 不存在", warnings: [{ code: eng.WARN.MISSING_SKILL }] };
  }

  const concreteIds = slotKind === "passive" ? [displaySkillId] : resolveFenghuangConcreteSkills(displaySkillId, ctx, warnings);
  const cfg = resolveRideCfgFile(skill, ride, ctx, warnings);
  const maxLevel = detectDisplayMaxLevel(displaySkillId, concreteIds, slotKind, ctx);
  const rel = slotKind === "passive"
    ? { releaseFrames: null, releaseSeconds: null, releaseTimeSource: "effectOnly" }
    : resolveRideReleaseTime(displaySkillId, ride, cfg, skill, ctx, warnings);

  const { fixedBuffs, growthBuffRefs } = collectBuffs(displaySkillId, concreteIds, ride, slotKind, ctx, warnings);
  const mechanics = collectSummonMechanics(displaySkillId, ride, ctx, warnings);
  const levels = [];
  for (let lv = 1; lv <= maxLevel; lv++) {
    const l = computeRideLevel(displaySkillId, concreteIds, lv, ride, slotKind, ctx, warnings);
    if (!l) continue;
    l.growthBuffs = growthBuffRefs.map((ref) => {
      const g = eng.resolveBuffGrowth(ref.baseBuffId, lv, ctx.buffById, warnings);
      const rawBuffG = resolveRawBuff(g.buff, ctx.buffById);
      const engBuff = { name: ref.name, bindLabel: ref.bindLabel, time: rawBuffG?.time ?? ref.time, value: buffValueSummary(rawBuffG) };
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
      segments: reference ? reference.segments.map((s) => ({ per: s.per, maxHit: s.maxHit, from: s.from, capSource: s.capSource || null })) : [],
      segCount,
      totalPer: reference ? reference.totalPer : null,
      releaseFrames: rel.releaseFrames,
      releaseSeconds: rel.releaseSeconds,
      releaseTimeSource: rel.releaseTimeSource,
      cd: skill.cd ?? null,
      addDefendVal: reference?.addDefendVal ?? null,
      cfgFileResolved: cfg.cfgFileResolved,
      cfgResolveSource: cfg.cfgResolveSource,
      referenceLevel: reference?.level ?? null,
      fixedBuffs,
      mechanics: mechanics.length ? mechanics : undefined,
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
      metrics: [
        ...(l.metrics || []),
        ...metrics.computeMetrics(
          ctx.metricDefs, "level",
          { skillId: displaySkillId, level: l.level, roleLevel: l.roleLevel, consumeMp: l.consumeMp, totalPer: l.totalPer, totalVal: l.totalVal, growthBuffs: l.growthBuffs || [], releaseSeconds: rel.releaseSeconds, segCount: l.segments.reduce((a, s) => a + (s.maxHit || 1), 0) },
          ctx.helpers, l.level === 1 ? warnings : [],
        ),
      ],
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
  console.log("\n🐎 坐骑技能 Wiki → 赤凤/赤炎凤凰/青鸾/寒冰凤凰");

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
      key: "fenghuang",
      name: "赤凤/赤炎凤凰/青鸾/寒冰凤凰",
      guidePath: GUIDE_PATH,
      rideIds: RIDE_IDS,
      note: "坐骑技能 Wiki 使用满级作为卡片表头参考值，逐级成长见下方成长数值表；火锥/冰锥/赤凤降世按子技能实际伤害与攻略图鉴段数展示，神圣冰晶按护盾机制展示。",
    },
    variants,
  };

  u.saveOutput("ride_wiki_fenghuang", payload, {
    system: "ride_wiki",
    sourceFiles: ["ride.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "beskill.*.json", "buff.*.json", "bullets.json", "entityCtg/*.json", GUIDE_PATH],
    note: "赤凤/赤炎凤凰/青鸾/寒冰凤凰坐骑技能 Wiki，包括主动技能、无双、召唤子嗣、炎爆与寒霜被动。",
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
