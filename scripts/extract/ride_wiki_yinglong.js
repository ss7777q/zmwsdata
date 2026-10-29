/**
 * 坐骑技能 Wiki - 应龙提取脚本（黄龙由 ride_wiki_huanglong.js 独立解析）
 *
 * 覆盖形态：
 * - 201901 应龙 (一阶)
 * - 201902 神天应龙 (二阶/超进化)
 */
const fs = require("fs");
const path = require("path");
const u = require("../lib/utils");
const eng = require("./lib/ride-skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");

const RIDE_OVERRIDE = "yinglong";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const RIDE_IDS = [
  201902, // 神天应龙 (二阶/超进化)
];
const SLOT_DEFS = [
  { key: "attack", labelPrefix: "普攻", kind: "attack" },
  { key: "skillActive", labelPrefix: "技能", kind: "active" },
  { key: "skillSp", labelPrefix: "无双", kind: "sp" },
  { key: "skillPassive", labelPrefix: "被动", kind: "passive" },
  { key: "riding", labelPrefix: "骑术", kind: "passive" },
];

const YINGLONG_MECHANICS = {
  // 普攻: 普攻1
  20635010001: [
    {
      label: "水刃攻击",
      value: "向前释放水流刃波，地面与飞行姿态均可释放，对前方目标造成 1 段 220% 水属性伤害与击退硬直。"
    },
    {
      label: "消耗蓄雨施加【雨湿】",
      value: "水属性攻击。命中目标消耗 8 点【蓄雨】值，施加 4 层【雨湿】状态（转化比例为每 2 点蓄雨转化 1 层【雨湿】；骑术形态下消耗 10 点施加 5 层）。"
    },
    {
      label: "水钻头追击联动",
      value: "在【澜汐凝珠】水球跟随期间发动普攻或无双，5 颗水球转化为水钻头追击目标，追加 5 段共 450% 伤害，并消耗 14 点蓄雨施加 35 层【雨湿】（每颗 7 层；骑术形态消耗 18 点施加 45 层/每颗 9 层）。"
    }
  ],

  // 技能1: 电寰玄霆
  20635010101: [
    {
      label: "环身雷电打击",
      value: "释放雷电环绕自身，对周围目标造成 5 段伤害（每段 74.8%，总倍率 374.0%）与受击硬直。"
    },
    {
      label: "引爆【水络电涌】",
      value: "雷属性攻击。目标带有【雨湿】状态时，命中按 6.7% 基础攻击力/层引爆雨湿层数触发【水络电涌】追加伤害。基础形态单次引爆上限为 65 层（最高追加 435.5% 基础攻击力伤害；骑术形态上限提升至 183 层，最高追加 1,226.1% 基础攻击力伤害）。"
    }
  ],

  // 技能2: 雷翼奔矢
  20635010201: [
    {
      label: "长按冲刺机制",
      value: "独立能量上限 9000，初始 6000，启动扣除 6000；每帧回复 23（每秒 690），施放期间暂停回复。第 16 帧起长按位移每次扣除 300，最多触发 9 次（额外消耗 2700）；松手或能量不足提前进入收招。完整长按第 26 帧自动切入 13 帧收招，共 39 帧。"
    },
    {
      label: "多段打击与充能联动",
      value: "冲刺过程造成 6 段打击（每段 42.5%，总倍率 255.0%）。受【蓄雨】系统联动，蓄雨值比例越高，充能效率提升最高 +4.29%（骑术形态下最高 +6%）。"
    },
    {
      label: "引爆【水络电涌】",
      value: "雷属性攻击。命中【雨湿】目标时引爆其雨湿层数，按 6.7% 基础攻击力/层结算追加伤害。基础形态单次最多引爆 10 层（最高追加 67.0% 基础攻击力伤害；骑术形态上限提升至 29 层，最高追加 194.3% 基础攻击力伤害）。"
    }
  ],

  // 技能3: 澜汐凝珠
  20635010301: [
    {
      label: "水球跟随",
      value: "施放后生成 5 颗跟随水球，跟随弹体寿命为 375 帧，即 12.5 秒。按键连接窗口 300 秒不等于水球寿命。"
    },
    {
      label: "二段激活·索敌治疗与同目标衰减",
      value: "水球生成 1.5 秒后激活二段按键（持续 300 秒，不消耗能量）。再次按下技能键，5 颗水球锁定生命百分比最低的友方目标（包含自身）发射；友方不足 5 人时可重复选定单目标连续恢复。\n受内置被动（7084008 同技能连续命中衰减：[-40%, -90%, -90%, -90%, -90%]）影响：\n① 首颗水球命中同一目标触发 -40% 衰减，实际生效 60% 满额治疗：【施法者 3.57% 最大生命值 + 0.6×对应等级固值】；\n② 后续水球连续命中同一目标触发 -90% 衰减，单颗实际生效 10% 满额治疗：【施法者 0.595% 最大生命值 + 0.1×对应等级固值】（恰好为首颗治疗量的 1/6）；\n③ 单目标 5 颗全中累计恢复总量严格等于 100% 满额基准（60% + 10%×4 = 100%，即【施法者 5.95% 最大生命值 + 1.0×对应等级固值】）；\n④ 若 5 颗水球分别命中 5 个不同友方目标，则全员均按首颗 60% 结算，全队最高累计恢复 300% 满额治疗（施法者 17.85% 最大生命值 + 3.0×对应等级固值）。"
    },
    {
      label: "追击切换",
      value: "若不主动触发治疗，水球保持待命，发动普通攻击或无双时转化为水钻头追击目标（详见【技能3·追击】）。"
    }
  ],

  // 技能3·追击: 澜汐凝珠·水钻头
  20635010303: [
    {
      label: "追击联动触发",
      value: "水球跟随状态下发动普通攻击或无双时，5 颗水球转化为水钻头（飞行速度 60）攻击目标。"
    },
    {
      label: "5段打击伤害",
      value: "每颗水钻头独立判定 1 段打击（单颗 90% 攻击力 + 对应等级固伤），5 颗全中造成 5 段共计 450% 攻击力伤害。"
    },
    {
      label: "施加【雨湿】印记",
      value: "创建本次攻击的命中附加状态时一次扣除 14 点蓄雨；5 球每颗附加 7 层雨湿，全中 35 层。骑术一次扣除 18 点、每颗附加 9 层，全中 45 层，不按球数重复扣费。雨湿基础与骑术的目标上限均为 185 层，按 10 帧（约 0.333 秒）逐层衰减。蓄雨槽骑术扩容至 260 与目标雨湿上限是不同参数。"
    }
  ],

  // 技能4: 神雷破空
  20635010401: [
    {
      label: "长按蓄力与低速移动",
      value: "长按进入飞行蓄力，可低速移动（速度 200），蓄满前耗体与地面一致。动作配置共有 6 个释放区间，上限 90 帧 / 3 秒；UI 标记数不等于释放区间数。每层蓄力标记增加雷柱缩放 0.02，最多 6 层。"
    },
    {
      label: "逐帧增伤累积与加算机制",
      value: "蓄力期间每帧增加 1.25% 攻击力倍率，蓄满 90 帧累计增加 112.5% 攻击力倍率。增伤直接累加在攻击力倍率项（i.atkPer + 1.125），技能固伤部分不受增伤影响。"
    },
    {
      label: "雷柱伤害与增伤结算",
      value: "雷柱对每个目标首次命中时额外造成一段 497.7% 伤害，并按技能等级附加固定伤害；另有 7 段各 18.9% 的雷柱伤害。全部命中共 630%；满蓄时每段额外增加 112.5%，合计 1530%。首次命中附加伤害与雷柱判定分别结算。"
    },
    {
      label: "坐骑强韧",
      value: "坐骑体力按当前动作及状态规则结算；不能将【坐骑强韧】解读为固定减耗 1125 点或绝对免疫受击硬直。"
    },
    {
      label: "引爆【水络电涌】",
      value: "命中雨湿目标，消耗层数并按 6.7% 基础攻击力/层追加伤害。未解锁骑术上限 68 层（455.6%）；骑术配置上限 187 层，但应龙目标雨湿最多 185 层，实际单次理论上限受限为 1239.5%。条件伤害不按伤害段数重复倍乘。"
    }
  ],

  // 无双: 尾画成江
  20635010501: [
    {
      label: "9段打击与抓取控制",
      value: "对配置范围内目标造成 9 段共 600% 伤害。抓取及终段使用弱控标记 136020301，评分 1350、标记时长 6 帧（0.2 秒）；标记时长不等于完整抓取时间，也不保证破霸体成功。技能配置 CD 为 21 秒。"
    },
    {
      label: "施加【雨湿】印记（每段独立附加）",
      value: "创建命中附加状态时一次扣除 10 点蓄雨，9 段每段附加 5 层雨湿，全中 45 层；骑术一次扣除 12 点、每段 6 层，全中 54 层，不按命中段数重复扣费。目标雨湿基础与骑术上限均为 185 层。"
    }
  ],

  // 被动1: 羽嘉之翼
  20635010601: [
    {
      label: "双形态飞行姿态",
      value: "二段跳跃后再次按下跳跃键进入飞行姿态，角色移动与攻击切换为飞行姿态。"
    },
    {
      label: "体力消耗",
      value: "飞行体力额外消耗配置为 energyAdd=[2.5,0]，与黄龙相同；触碰地面或体力耗尽时切回地面。"
    }
  ],

  // 被动2: 蓄雨
  20635010602: [
    {
      label: "专属蓄雨槽",
      value: "骑乘时激活独立【蓄雨】能量槽，上限 185 点，初始满值 185 点，骑乘过程中每帧自动回复 0.18722 点（每秒约 5.62 点）。"
    },
    {
      label: "属性增益",
      value: "根据当前【蓄雨】槽充盈比例提供增益：① 骑乘回血属性提升最高 +4.29%；② 全技能冷却缩减最高 -4.29%；③ 技能2充能效率提升最高 +4.29%；④ 提升角色本体属性：回血 +0.92%、回魔 +0.46%。"
    },
    {
      label: "水属性消耗蓄雨施加【雨湿】",
      value: "创建水属性攻击的命中附加状态时扣费，不能按段重复扣费。普攻扣 8 点、附 4 层；5 球追击一次扣 14 点、全中 35 层；9 段无双一次扣 10 点、全中 45 层。雨湿上限 185 层，按 10 帧逐层衰减；蓄雨不足则不附加雨湿，原攻击伤害仍可结算。骑术数值另列。"
    },
    {
      label: "雷属性引爆【水络电涌】",
      value: "雷属性攻击命中【雨湿】目标时引爆其雨湿层数，按 6.7% 基础攻击力/层结算追加伤害：技能2引爆上限 10 层（追加 67.0% 基础攻击力伤害）；技能1引爆上限 65 层（追加 435.5% 基础攻击力伤害）；技能4引爆上限 68 层（追加 455.6% 基础攻击力伤害）。"
    }
  ],

  // 骑术: 蓄雨·骑 (应龙·骑术)
  20635010603: [
    {
      label: "角色属性继承",
      value: "解锁专属骑术后，额外继承角色 8% 的生命、回血、攻击、暴击。"
    },
    {
      label: "蓄雨槽扩容与回复",
      value: "独立【蓄雨】能量槽上限由 185 提升至 260（提升 40.5%），初始满值 260；骑乘过程中每帧自动回复由 0.18722 点提升至 0.26211 点（每秒约 7.86 点，提升 40.0%）。"
    },
    {
      label: "属性增益强化",
      value: "根据当前【蓄雨】槽充盈比例提供的增益上限调整：① 骑乘回血属性提升上限由 +4.29% 调整为 +6%；② 全技能冷却缩减上限由 -4.29% 调整为 -6%；③ 技能2冲刺充能效率提升上限由 +4.29% 调整为 +6%。"
    },
    {
      label: "角色本体加成",
      value: "提升角色本体属性：回血 +1.29%、回魔 +0.645%。"
    },
    {
      label: "水属性施加【雨湿】调整",
      value: "普通攻击一次扣除 10 点蓄雨、附 5 层雨湿；5 球追击一次扣除 18 点、全中 45 层；9 段无双一次扣除 12 点、全中 54 层。各段均可附加，但不重复扣费。目标雨湿上限仍为 185 层，260 是骑术蓄雨槽容量。"
    },
    {
      label: "雷属性引爆【水络电涌】上限调整",
      value: "每层追加 6.7% 基础攻击力伤害。骑术技能1/2/4的配置引爆上限为 183/29/187 层；目标雨湿实际最多 185 层，因此技能4实际单次理论上限为 185 层、1239.5%，不能直接按 187 层算。引爆消耗对应层数，实际收益取决于命中前的雨湿。"
    }
  ],

};

const CFG_FALLBACK = {
  2063503: "2063501-monster_cfg_yinglong",
  2063504: "2063504-monster_cfg_huanglong_max",
};

function getFallbackSkillId(skillId) {
  const str = String(skillId);
  if (str.startsWith("2063503")) {
    return Number(str.replace("2063503", "2063501"));
  }
  return skillId;
}

const BIND_SOURCE_LABEL = {
  beSkill: "被动技能",
  beSkill2: "被动技能",
  entityActionComBuff: "技能附带",
  bulletHitBuff: "命中附带",
  bulletFirstHitBuff: "首次命中附带",
  passiveEffect: "被动效果",
  beskillEffect: "机制效果",
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

function loadAllRides() {
  const file = u.findTableFile("ride");
  const all = JSON.parse(fs.readFileSync(file, "utf8"));
  const map = new Map();
  for (const r of all) {
    if (r && typeof r === "object" && !Array.isArray(r) && r.cancel !== 1) {
      map.set(r.id, r);
    }
  }
  return map;
}

function resolveRideCfgFile(skill, ride, ctx, warnings) {
  const action = skill.entityAction;
  const rideMonsterIds = asArray(ride.monsterId).filter((id) => id != null);

  const order = [];
  for (const id of rideMonsterIds) {
    const m = ctx.monsterById.get(id);
    if (m) order.push(m);
  }

  for (const m of order) {
    let cfgFile = m.cfgFile;
    let cfg = eng.loadEntityCfg(cfgFile);
    if ((!cfg || Object.keys(cfg).length === 0) && CFG_FALLBACK[m.id]) {
      cfgFile = CFG_FALLBACK[m.id];
      cfg = eng.loadEntityCfg(cfgFile);
    }

    if (cfg && action && cfg[action]) {
      return {
        cfgFileResolved: cfgFile,
        cfgResolveSource: "rideMonster",
        cfgMonsterId: m.id,
        cfgMonsterName: m.name,
        hasActionCfg: true,
        actionCfg: cfg[action],
        entityCfg: cfg,
      };
    }
  }

  const firstMonster = order[0] || null;
  let firstCfgFile = firstMonster?.cfgFile;
  let firstCfg = firstMonster ? eng.loadEntityCfg(firstCfgFile) : null;
  if ((!firstCfg || Object.keys(firstCfg).length === 0) && firstMonster && CFG_FALLBACK[firstMonster.id]) {
    firstCfgFile = CFG_FALLBACK[firstMonster.id];
    firstCfg = eng.loadEntityCfg(firstCfgFile);
  }

  return {
    cfgFileResolved: firstCfgFile || null,
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
        type: rawBuff1.type ?? null,
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

  // 技能3【澜汐凝珠】为纯召唤/智能治疗机制入口，注入随等级成长的回血固值
  if (displaySkillId === 20635010301 || displaySkillId === 20635030301) {
    const skill = ctx.skillById.get(displaySkillId);
    const fbSkill = ctx.skillById.get(getFallbackSkillId(displaySkillId));
    const row = ctx.skillLevelById.get(eng.skillLevelRowId(skill, level)) || (fbSkill ? ctx.skillLevelById.get(eng.skillLevelRowId(fbSkill, level)) : null);
    const baseBuffId = displaySkillId === 20635030301 ? 1071701 : 1071401;
    const healBuff = ctx.buffById.get(baseBuffId + level - 1);
    const singleVal = healBuff?.value?.[0]?.[1] ?? 0;
    return {
      level,
      roleLevel: row?.roleLevel ?? null,
      consumeMp: row?.consumeMp ?? null,
      soulCost: row?.soulCost ?? null,
      kind: "effectOnly",
      segments: [{ per: 0.0595, val: singleVal, maxHit: 1 }],
      totalPer: null,
      totalVal: singleVal,
      addDefendVal: row?.addDefendVal ?? null,
    };
  }

  // 普攻【普攻1】(20635010001 / 20635030001): 扇形水刃斩击，单体受击1段 220%
  if (displaySkillId === 20635010001 || displaySkillId === 20635030001) {
    const skill = ctx.skillById.get(displaySkillId);
    const fbSkill = ctx.skillById.get(getFallbackSkillId(displaySkillId));
    const row = ctx.skillLevelById.get(eng.skillLevelRowId(skill, level)) || (fbSkill ? ctx.skillLevelById.get(eng.skillLevelRowId(fbSkill, level)) : null);
    return {
      level: 1,
      roleLevel: row?.roleLevel ?? 1,
      consumeMp: 0,
      soulCost: null,
      kind: "normalActionBullet",
      segments: [{ per: 2.2, val: 1, maxHit: 1, from: "水刃斩击" }],
      totalPer: 2.2,
      totalVal: 1,
      addDefendVal: row?.addDefendVal ?? 220,
    };
  }

  let mergedSegments = [];
  let mergedKind = null;
  let firstRow = null;

  for (const skillId of concreteIds) {
    const skill = ctx.skillById.get(skillId);
    if (!skill) continue;

    let row = ctx.skillLevelById.get(eng.skillLevelRowId(skill, level));
    if (!row) {
      const fbSkill = ctx.skillById.get(getFallbackSkillId(skill.id));
      if (fbSkill) {
        row = ctx.skillLevelById.get(eng.skillLevelRowId(fbSkill, level));
      }
    }
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

  // 技能4【神雷破空】：弹幕组件与伤害数组按时间轴触发
  if (displaySkillId === 20635010401 || displaySkillId === 20635030401) {
    const s4Skill = ctx.skillById.get(20635010403);
    const row = ctx.skillLevelById.get(eng.skillLevelRowId(s4Skill, level));
    if (row && Array.isArray(row.bulletDamageAddPer) && row.bulletDamageAddPer[0]) {
      const bullet = eng.getBullet(row.bullet[0], warnings);
      mergedSegments = eng.computeFirstHitBulletSegments(row, bullet, ctx.buffById, level);
      mergedKind = "bullet";
    }
  }

  // 技能3·追击【澜汐凝珠·水钻头】：5颗跟随水球全中造成5段打击
  if (displaySkillId === 20635010303 || displaySkillId === 20635030303) {
    for (const s of mergedSegments) {
      s.maxHit = 5;
    }
  }

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
    totalVal: mergedSegments.some((s) => s.val > 1) ? round(totalVal) : null,
    addDefendVal: firstRow.addDefendVal ?? null,
  };
}

function buildSkillCard(displaySkillId, ride, slotLabel, slotKind, ctx) {
  const warnings = [];
  const skill = ctx.skillById.get(displaySkillId);
  if (!skill) {
    return { skillId: displaySkillId, name: `技能${displaySkillId}`, error: "skill 不存在", warnings: [{ code: eng.WARN.MISSING_SKILL }] };
  }

  // 技能4使用skill4_3直接读取雷柱伤害，避免skill4_2(仅lv1蓄力动作)报缺失
  const concreteIds = (slotKind === "passive" || slotKind === "attack")
    ? [displaySkillId]
    : (displaySkillId === 20635010401 || displaySkillId === 20635030401)
      ? [displaySkillId === 20635030401 ? 20635030403 : 20635010403]
      : (displaySkillId === 20635010301 || displaySkillId === 20635030301)
        ? [displaySkillId]
        : (displaySkillId === 20635010303 || displaySkillId === 20635030303)
          ? [displaySkillId]
          : eng.resolveConcreteSkills(displaySkillId, ctx.skillById, warnings);
  const cfg = resolveRideCfgFile(skill, ride, ctx, warnings);
  const fbSkill = ctx.skillById.get(getFallbackSkillId(skill.id));
  const maxLevel = (slotKind === "passive" || slotKind === "attack")
    ? 1
    : (eng.detectMaxLevel(skill, ctx.skillLevelById) || (fbSkill ? eng.detectMaxLevel(fbSkill, ctx.skillLevelById) : 1));
  let rel = slotKind === "passive"
    ? { releaseFrames: null, releaseSeconds: null, releaseTimeSource: "effectOnly" }
    : (displaySkillId === 20635010303 || displaySkillId === 20635030303)
      ? { releaseFrames: 0, releaseSeconds: 0, releaseTimeSource: "instantChase" }
      : eng.resolveReleaseTime(cfg.entityCfg, skill.entityAction, cfg.hasActionCfg, warnings, skill);
  if (displaySkillId === 20635010401) {
    const frames = cfg.entityCfg?.time?.skill4_1 + cfg.entityCfg?.time?.skill4_3;
    if (Number.isFinite(frames) && frames > 0) {
      rel = { releaseFrames: frames, releaseSeconds: frames / 30, releaseTimeSource: 'sequence:skill4_1+skill4_3' };
    }
  }
  if (displaySkillId === 20635010201) {
    // type134 到末帧直接切换收招，不能只算原动画或把原动画剩余帧再计入。
    const charge = cfg.entityCfg.skill2_1.com.find((com) => com.type === 134 && !com.notActive);
    const ends = Object.keys(charge).filter((key) => /^frames\d+$/.test(key)).map((key) => charge[key][1]);
    const frames = Math.max(...ends) + cfg.entityCfg.time.skill2_3;
    rel = { releaseFrames: frames, releaseSeconds: frames / 30, releaseTimeSource: 'sequence:skill2_1+skill2_3' };
  }

  const { fixedBuffs, growthBuffRefs } = collectBuffs(concreteIds, ride, ctx, warnings);
  const levels = [];
  for (let lv = 1; lv <= maxLevel; lv++) {
    const l = computeRideLevel(displaySkillId, concreteIds, lv, ride, slotKind, ctx, warnings);
    if (!l) continue;
    l.growthBuffs = growthBuffRefs.filter((ref) => !(displaySkillId === 20635010401 && ref.bindSource === 'firstHitAddBuffs' && ref.type === 155)).map((ref) => {
      const g = eng.resolveBuffGrowth(ref.baseBuffId, lv, ctx.buffById, warnings);
      const rawBuffG = resolveRawBuff(g.buff, ctx.buffById);
      return { name: ref.name, bindLabel: ref.bindLabel, time: ref.time, value: buffValueSummary(rawBuffG) };
    });
    levels.push(l);
  }

  const reference = levels[levels.length - 1] || levels[0] || null;
  const isS3Summon = displaySkillId === 20635010301 || displaySkillId === 20635030301;
  const isS3Chase = displaySkillId === 20635010303 || displaySkillId === 20635030303;
  const isAttack = displaySkillId === 20635010001 || displaySkillId === 20635030001;
  const isHuanglong = String(displaySkillId).startsWith("2063503");

  const desIntro = isAttack
    ? (isHuanglong
      ? "向前释放水流刃波，地面与飞行姿态均可释放，造成 1 段 220% 水属性伤害。命中目标消耗 14 点【蓄雨】值，施加 7 层【雨湿】状态。若处于【澜汐凝珠】跟随状态，普攻联动 5 颗水球转化为水钻头攻击目标。"
      : "向前释放水刃，地面与飞行姿态均可释放，造成 1 段 220% 水属性伤害。命中目标消耗 8 点【蓄雨】值，施加 4 层【雨湿】状态（转化比例为每 2 点蓄雨提供 1 层雨湿）。若处于【澜汐凝珠】跟随状态，普攻联动 5 颗水球转化为水钻头攻击目标。")
    : (isS3Chase
      ? (isHuanglong
        ? "水球跟随状态下，发动任意普通攻击（地面普攻或空中跳攻）将消耗 26 点蓄雨值，将 5 颗跟随水球转化为水钻头攻击目标，造成 5 段共 450% 水属性伤害，每颗独立施加 13 层【雨湿】状态（全中累计 65 层）。"
        : "水球跟随状态下，发动普通攻击或无双将消耗 14 点蓄雨值，将 5 颗跟随水球转化为水钻头攻击目标，造成 5 段共 450% 水属性伤害，每颗独立施加 7 层【雨湿】状态（全中累计 35 层，2:1转化）。")
      : (skill.desIntro || null));

  const healBuff = isS3Summon ? [{
    baseBuffId: isHuanglong ? 1071701 : 1071401,
    type: 1,
    name: "回血",
    text: "恢复生命：配置满额基准为施法者 5.95% 最大生命值 + 对应等级固值。受内置衰减被动影响，单目标首球生效 60%（3.57% HP + 0.6×固值）；后续命中同目标生效 10%（0.595% HP + 0.1×固值，为首球的 1/6）；单目标 5 颗全中累计恢复 100% 满额基准（5.95% HP + 1.0×固值）；分散 5 目标全中最高恢复 300%（17.85% HP + 3.0×固值）。",
    displayText: "恢复生命：配置满额基准为施法者 5.95% 最大生命值 + 对应等级固值。受内置衰减被动影响，单目标首球生效 60%（3.57% HP + 0.6×固值）；后续命中同目标生效 10%（0.595% HP + 0.1×固值，为首球的 1/6）；单目标 5 颗全中累计恢复 100% 满额基准（5.95% HP + 1.0×固值）；分散 5 目标全中最高恢复 300%（17.85% HP + 3.0×固值）。",
    time: 20,
    bindSource: "vskillHitBuff",
    bindLabel: "水球命中友方附带",
    levelMode: "growth",
    value: { per: 0.0595, val: null },
  }] : [];

  const card = {
    skillId: displaySkillId,
    name: isAttack ? "普攻" : (isS3Chase ? "澜汐凝珠·水钻头" : (skill.desName || skill.Name || `技能${displaySkillId}`)),
    icon: skill.icon || null,
    attribute: skill.attribute ?? null,
    entityAction: skill.entityAction || null,
    concreteSkillIds: concreteIds,
    desIntro,
    header: {
      kind: isS3Summon ? "effectOnly" : (reference ? reference.kind : null),
      totalValLabel: isS3Summon ? "单体全中总固值(100%)" : null,
      segments: isS3Summon ? [] : (reference ? reference.segments.map((s) => ({ per: s.per, maxHit: s.maxHit, from: s.from })) : []),
      segCount: isS3Summon ? 0 : (reference ? reference.segments.reduce((a, s) => a + (s.maxHit || 1), 0) : 0),
      totalPer: isS3Summon ? null : (reference ? reference.totalPer : null),
      releaseFrames: rel.releaseFrames,
      releaseSeconds: rel.releaseSeconds,
      releaseTimeSource: rel.releaseTimeSource,
      cd: (displaySkillId === 20635010501 || displaySkillId === 20635030501) ? 21 : (isS3Chase ? 25 : (isAttack ? 0 : (skill.cd ?? null))),
      addDefendVal: skill.addDefendVal ?? null,
      cfgFileResolved: cfg.cfgFileResolved,
      cfgResolveSource: cfg.cfgResolveSource,
      referenceLevel: reference?.level ?? null,
      fixedBuffs: [...healBuff, ...fixedBuffs],
      mechanics: YINGLONG_MECHANICS[displaySkillId] || [],
      note: YINGLONG_MECHANICS[displaySkillId]?.map((m) => `${m.label}：${m.value}`).join('\n') || null,
      metrics: isS3Summon ? [
        { key: "healFirstOrbRatio", label: "首球治疗比例(60%)", value: 0.0357, display: "3.57% HP" },
        { key: "healDecayedOrbRatio", label: "后续衰减比例(10%)", value: 0.00595, display: "0.595% HP (1/6)" },
        { key: "healTotalRatio", label: "5球单体总比例(100%)", value: 0.0595, display: "5.95% HP" },
      ] : metrics.computeMetrics(
        ctx.metricDefs, "header",
        { skillId: displaySkillId, totalPer: reference ? reference.totalPer : null, releaseSeconds: rel.releaseSeconds, segCount: reference ? reference.segments.reduce((a, s) => a + (s.maxHit || 1), 0) : 0 },
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
      metrics: isS3Summon ? [
        {
          key: "healFirstVal",
          label: "首球生效固值(60%)",
          value: Math.round((l.totalVal || 0) * 0.6),
          display: Math.round((l.totalVal || 0) * 0.6).toLocaleString(),
        },
        {
          key: "healDecayedVal",
          label: "后续单球固值(10%)",
          value: Math.round((l.totalVal || 0) * 0.1),
          display: Math.round((l.totalVal || 0) * 0.1).toLocaleString(),
        },
      ] : metrics.computeMetrics(
        ctx.metricDefs, "level",
        { skillId: displaySkillId, level: l.level, roleLevel: l.roleLevel, consumeMp: l.consumeMp, totalPer: l.totalPer, totalVal: l.totalVal, growthBuffs: l.growthBuffs || [], releaseSeconds: rel.releaseSeconds, segCount: l.segments.reduce((a, s) => a + (s.maxHit || 1), 0) },
        ctx.helpers, l.level === 1 ? warnings : [],
      ),
    })),
    warnings,
  };

  return card;
}

function buildSlots(ride, ctx) {

  const slots = [];
  for (const def of SLOT_DEFS) {
    let ids = [];
    if (def.kind === "attack") {
      ids = asArray(ctx.monsterById.get(ride.monsterId)?.atkIds).filter(Boolean);
    } else if (def.key === "riding") {
      const ridingItem = ctx.ridingList?.find((r) => r.rideGroupId === ride.idGroup);
      if (ridingItem && ridingItem.skills) {
        // 排除已被普通被动收录的羽嘉之翼 (20635010601)
        ids = ridingItem.skills.filter((sId) => sId !== 20635010601);
      }
    } else {
      ids = asArray(ride[def.key]).filter(Boolean);
    }
    ids.forEach((skillId, index) => {
      const slotLabel = def.kind === "attack" || def.kind === "sp" || def.kind === "passive" || def.key === "riding" ? def.labelPrefix : `${def.labelPrefix}${index + 1}`;
      slots.push({
        slot: def.kind === "attack" ? `attack${index + 1}` : `${def.key}${index + 1}`,
        slotLabel,
        slotKind: def.kind,
        base: buildSkillCard(skillId, ride, slotLabel, def.kind, ctx),
      });

      // 针对技能3: 澜汐凝珠 (20635010301) 追加【技能3·追击】水钻头卡片
      if (skillId === 20635010301) {
        const chaseSkillId = 20635010303;
        const chaseLabel = "技能3·追击";
        slots.push({
          slot: `${def.key}${index + 1}_chase`,
          slotLabel: chaseLabel,
          slotKind: "active",
          base: buildSkillCard(chaseSkillId, ride, chaseLabel, "active", ctx),
        });
      }
    });
  }
  return slots;
}

function extract() {
  console.log("\n🐲 坐骑技能 Wiki → 应龙");

  const ctx = {
    rideById: loadAllRides(),
    skillById: idx(u.loadTable("skill")),
    skillLevelById: idx(u.loadTable("skillLevel")),
    monsterById: idx(u.loadTable("monster")),
    buffById: idx(u.loadTable("buff")),
    beskillById: idx(u.loadTable("beskill")),
    ridingList: Object.values(u.loadTable("riding")),
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

  const payload = {
    rideGroup: {
      key: "yinglong",
      name: "应龙",
      rideIds: RIDE_IDS,
      note: "神天应龙坐骑技能 Wiki，包含蓄雨、飞行姿态、充能蓄力及 1~60 级成长数值。",
    },
    variants,
  };

  u.saveOutput("ride_wiki_yinglong", payload, {
    system: "ride_wiki",
    sourceFiles: ["ride.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "beskill.*.json", "buff.*.json", "bullets.json", "entityCtg/*.json"],
    note: "神天应龙超进化形态坐骑技能 Wiki。",
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
