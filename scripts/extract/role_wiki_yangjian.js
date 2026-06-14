/**
 * 角色技能 Wiki - 杨戬提取脚本
 *
 * 杨戬当前数据缺少正式 roleInitial / passiveSkill 行,不能照普通角色路径假装完整。
 * 本导出器从 skill + monster.initBeSkill + battle-config 追真实动作与被动链路,
 * 并把长按、无充能、状态技能拆成玩家能直接读懂的卡片。
 */
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");

const ROLE_OVERRIDE = "yangjian";
const GUIDE_PATH = null;
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const ROLE_ID = 8;
const GAME_FPS = 30;

const SKILL = {
  JIFENGCI: 8001030,
  JIETIANJI: 8001040,
  JIETIANJI_SMASH: 8001041,
  HUANBU: 8001050,
  HENGSAO: 8001051,
  HUANBU_NO_ENERGY: 8001052,
  HENGSAO_NO_ENERGY: 8001053,
  FENGMOZHAN: 8001060,
  SHUNYINGSHA: 8001070,
  SANYAN: 8001080,
  PASSIVE_SKY: 8001091,
  PASSIVE_SUOREN: 8001092,
  PASSIVE_GELIE: 8001093,
};

const BESKILL = {
  SKY_TEXT: 12500200,
  SKY_COMBO: 12500201,
  SKY_ADD_DAMAGE: 12500202,
  GELIE_TEXT: 12500300,
  GELIE_GIVE_BUFF: 12500301,
  SUOREN_TEXT: 12500400,
  SUOREN_GIVE_BUFF: 12500401,
};

const BUFF = {
  JIFENGCI_DODGE: 8006501,
  ABSOLUTE_DODGE: 60003901,
  HUNCHEN_MARK: 136012901,
  HUNCHEN: 292000101,
  HUNCHEN_STUN: 3009601,
  HUNCHEN_RESIST_MARK: 136013201,
  HUNCHEN_RESIST: 136013301,
  ZHICAN_MARK: 136013001,
  ZHICAN: 255001301,
  HUANBU_CHARGE: 156001001,
  GELIE: 14014001,
  SUOREN: 293000101,
  SUOREN_ATK_DOWN: 5013101,
  SANYAN_DISPEL_INVISIBLE: 139002901,
  SANYAN_REVEAL: 194000701,
  SANYAN_BREAK_ARMOR: 14013901,
  SANYAN_STUN: 3009501,
  SANYAN_BLIND: 136013101,
  TRICK_NO_SP: 249000301,
  TRICK_WALL_PASS: 174000201,
};

const DEFAULT_METRICS = [
  { key: "manaConv", label: "蓝转", scope: "level", expr: "totalVal / consumeMp", when: "totalVal * consumeMp", fixed: 2 },
  { key: "atkConv", label: "攻转", scope: "level", expr: "totalPer / releaseSeconds", when: "totalPer * releaseSeconds", fixed: 3 },
];

const BIND_SOURCE_LABEL = {
  beSkill: "被动技能",
  beSkill2: "被动技能",
  entityActionComBuff: "技能附带",
  bulletHitBuff: "命中附带",
  bulletFirstHitBuff: "首次命中",
};

const SLOT_SPECS = [
  {
    slot: "skill1",
    slotLabel: "技能1",
    skillId: SKILL.JIFENGCI,
    mechanics: [
      "31帧完成释放,第7-15帧向前突进；动作开始给自己挂闪避强化。",
      "闪避强化会附加绝对闪避状态：最终闪避+100%,持续3帧。",
      "命中段来自子弹5644,共2段；每段都会附加割裂。",
    ],
  },
  {
    slot: "skill2",
    slotLabel: "技能2 · 短按上挑",
    skillId: SKILL.JIETIANJI,
    mechanics: [
      "12帧完成短按上挑,第4帧出伤害；动作内有长按窗口,可切到下砸分支。",
      "短按本身不叠昏沉标记；昏沉来自长按下砸命中。",
    ],
  },
  {
    slot: "skill2-hold",
    slotLabel: "技能2 · 长按下砸",
    skillId: SKILL.JIETIANJI_SMASH,
    consumeSkillId: SKILL.JIETIANJI,
    mechanics: [
      "19帧完成下砸,第5帧出伤害；耗蓝沿用截天击本体。",
      "命中叠1层昏沉标记,标记持续180帧(6秒),2层触发昏沉。",
      "昏沉持续120帧(4秒)：目标尝试释放技能会释放失败并触发60帧(2秒)晕眩。",
      "昏沉抵抗按3600帧(120秒)统计,同一目标累计2次后获得120秒昏沉抗性。",
    ],
  },
  {
    slot: "skill3",
    slotLabel: "技能3 · 短按位移",
    skillId: SKILL.HUANBU,
    mechanics: [
      "15帧完成短按位移,第2-7帧向前移动；该分支的子弹5656没有伤害组件,按0伤害展示。",
      "动作内有长按窗口,可切到横扫分支。",
    ],
  },
  {
    slot: "skill3-hold",
    slotLabel: "技能3 · 长按横扫",
    skillId: SKILL.HENGSAO,
    consumeSkillId: SKILL.HUANBU,
    mechanics: [
      "21帧完成横扫；耗蓝沿用幻步横扫本体。",
      "命中叠1层致残标记,标记持续180帧(6秒),2层触发致残。",
      "致残持续90帧(3秒),移动速度/技能移速降低80%,并附带跳跃弱化；同一目标90秒内最多受3次致残影响。",
      "横扫动作开始会为【幻步横扫】恢复1层充能。",
    ],
  },
  {
    slot: "skill3-no-energy",
    slotLabel: "技能3 · 无充能短位移",
    skillId: SKILL.HUANBU_NO_ENERGY,
    levelSkillId: null,
    mechanics: [
      "无充能时使用短位移动作,15帧完成；子弹5656没有伤害组件,按0伤害展示。",
      "该分支没有 skillLevel 行,因此不输出等级伤害和耗蓝。",
    ],
  },
  {
    slot: "skill3-no-energy-hold",
    slotLabel: "技能3 · 无充能横扫",
    skillId: SKILL.HENGSAO_NO_ENERGY,
    levelSkillId: null,
    mechanics: [
      "无充能长按会进入横扫动作,21帧完成。",
      "该分支没有 skillLevel 行,不能从配置确认伤害成长或耗蓝,因此只展示动作与状态机制。",
    ],
  },
  {
    slot: "skill4",
    slotLabel: "技能4",
    skillId: SKILL.FENGMOZHAN,
    mechanics: [
      "47帧完成释放；子弹5657共9段,前8段为旋转攻击,最后1段为下劈。",
      "最后1段命中附加割裂。",
    ],
  },
  {
    slot: "trick",
    slotLabel: "绝技",
    skillId: SKILL.SHUNYINGSHA,
    mechanics: [
      "51帧完成释放；前段位移/锁定表现不计伤害,最终子弹5662结算6段伤害。",
      "释放时会给自己挂禁止回复无双值状态,持续450帧(15秒),并进入穿墙表现状态。",
    ],
  },
  {
    slot: "transSkill1",
    slotLabel: "转职技能1",
    skillId: SKILL.SANYAN,
    mechanics: [
      "36帧完成释放,第11帧发出光线；子弹5663标记为非伤害,按0伤害展示。",
      "命中正面目标附加显形和破甲：显形持续150帧(5秒),破甲为受到伤害+20%,持续150帧(5秒)。",
      "若敌人与光线相向,额外附加晕眩60帧(2秒)和失明150帧(5秒)。",
    ],
  },
];

function idx(arr) {
  const m = new Map();
  for (const r of arr) m.set(r.id, r);
  return m;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function seconds(frames) {
  return round3(frames / GAME_FPS);
}

function pct(n) {
  return `${round3(n * 100)}%`;
}

function fixedBuffValue(buff) {
  if (!buff) return null;
  let v = buff.value;
  if (Array.isArray(v) && Array.isArray(v[0])) v = v[0];
  if (Array.isArray(v)) {
    return { per: typeof v[0] === "number" ? v[0] : null, val: typeof v[1] === "number" ? v[1] : null };
  }
  return null;
}

function engineBuffText(buff) {
  const v = fixedBuffValue(buff);
  if (!v) return null;
  const parts = [];
  if (typeof v.per === "number" && v.per !== 0) parts.push(`${(v.per * 100).toFixed(1)}%`);
  if (typeof v.val === "number" && v.val !== 0) parts.push(String(v.val));
  return parts.length ? parts.join(" + ") : null;
}

function frameText(frame) {
  if (typeof frame !== "number") return null;
  if (frame < 0) return "直到触发或状态结束";
  return `${frame}帧(${seconds(frame)}秒)`;
}

function pctText(n) {
  return typeof n === "number" ? pct(n) : null;
}

function fixedBuffDisplayText(buff, ctx) {
  const value = fixedBuffValue(buff);
  switch (buff?.id) {
    case BUFF.GELIE: {
      const per = pctText(value?.per);
      const time = frameText(buff.time);
      const cdTime = frameText(buff.cdTime);
      if (!per || buff.maxPiles == null || !time || !cdTime) return null;
      return `目标受到杨戬攻击的伤害额外提高${per},最多叠${buff.maxPiles}层；每层持续${time},同一目标触发间隔${cdTime}。`;
    }
    case BUFF.JIFENGCI_DODGE: {
      const attached = Array.isArray(buff.attachBuff) ? ctx.buffById.get(buff.attachBuff[0]) : null;
      const attachedValue = fixedBuffValue(attached);
      const per = pctText(attachedValue?.per);
      const time = frameText(attached?.time ?? buff.time);
      if (!time) return null;
      const dodgeText = per ? `最终闪避+${per}` : "最终闪避提升";
      return `释放时获得闪避强化,并附加${dodgeText},持续${time}。`;
    }
    case BUFF.HUNCHEN_MARK:
      if (buff.maxPiles == null || !frameText(buff.time)) return null;
      return `命中叠1层昏沉标记,标记持续${frameText(buff.time)},叠满${buff.maxPiles}层触发昏沉。`;
    case BUFF.ZHICAN_MARK:
      if (buff.maxPiles == null || !frameText(buff.time)) return null;
      return `命中叠1层致残标记,标记持续${frameText(buff.time)},叠满${buff.maxPiles}层触发致残。`;
    case BUFF.HUANBU_CHARGE:
      return `横扫动作开始为【幻步横扫】恢复1层充能。`;
    case BUFF.TRICK_NO_SP:
      if (!frameText(buff.time)) return null;
      return `释放后禁止自己回复无双值,持续${frameText(buff.time)}。`;
    case BUFF.TRICK_WALL_PASS:
      return "释放表现期间可以穿越墙壁。";
    case BUFF.SANYAN_DISPEL_INVISIBLE:
      if (!frameText(buff.time)) return null;
      return `驱散目标隐身效果,处理窗口${frameText(buff.time)}。`;
    case BUFF.SANYAN_REVEAL:
      if (!frameText(buff.time)) return null;
      return `目标行踪暴露,持续${frameText(buff.time)}。`;
    case BUFF.SANYAN_BREAK_ARMOR: {
      const per = pctText(value?.per);
      if (!per || !frameText(buff.time)) return null;
      return `目标受到伤害提高${per},持续${frameText(buff.time)}。`;
    }
    case BUFF.SANYAN_STUN:
      if (!frameText(buff.time)) return null;
      return `目标晕眩,无法移动、攻击和使用技能,持续${frameText(buff.time)}。`;
    case BUFF.SANYAN_BLIND:
      if (!frameText(buff.time)) return null;
      return `目标失明,视野丢失,持续${frameText(buff.time)}。`;
    default:
      return null;
  }
}

function withFixedBuffDisplay(buffInfo, rawBuff, ctx) {
  const displayText = fixedBuffDisplayText(rawBuff, ctx);
  return displayText ? { ...buffInfo, displayText } : buffInfo;
}

function finalize(kind, segments) {
  let totalPer = 0;
  let totalVal = 0;
  for (const s of segments) {
    totalPer += (s.per || 0) * (s.maxHit || 1);
    totalVal += (s.val || 0) * (s.maxHit || 1);
  }
  return { kind, segments, totalPer: round3(totalPer), totalVal: round3(totalVal) };
}

function damageComsFromBullet(bullet) {
  return eng.damageComs(bullet).filter((com) => com.type === 1);
}

function computeStrictDamage(skill, row, actionCfg, warnings) {
  if (!row) return finalize("missingLevel", []);

  if (Array.isArray(row.bullet) && row.bullet.length) {
    return eng.computeDamageSegments(skill, row, actionCfg, warnings);
  }

  if (actionCfg && Array.isArray(actionCfg.com)) {
    const actionBulletIds = actionCfg.com.filter((c) => c.type === 2 && c.bId != null).map((c) => c.bId);
    if (actionBulletIds.length) {
      const segments = [];
      for (const bId of actionBulletIds) {
        const bullet = eng.getBullet(bId, warnings);
        for (const com of damageComsFromBullet(bullet)) {
          segments.push({
            per: row.damageAddPer ?? 0,
            val: row.damageAddVal ?? 0,
            maxHit: com.maxHit || 1,
            from: `actionBullet:${bId}`,
          });
        }
      }
      return finalize(segments.length ? "normalActionBullet" : "noDamageAction", segments);
    }
  }

  return finalize("normal", [{ per: row.damageAddPer ?? 0, val: row.damageAddVal ?? 0, maxHit: 1, from: "normal" }]);
}

function queryLevel(skill, level, ctx, warnings) {
  return eng.querySkillLevel(skill, level, ctx.skillLevelById, warnings);
}

function queryOptionalLevel(skill, level, ctx) {
  return ctx.skillLevelById.get(eng.skillLevelRowId(skill, level)) || null;
}

function maxLevelFor(spec, skill, ctx) {
  if (spec.levelSkillId === null) return 0;
  const levelSkill = ctx.skillById.get(spec.levelSkillId || spec.skillId) || skill;
  return eng.detectMaxLevel(levelSkill, ctx.skillLevelById);
}

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

    if (g1.levelMode === "growth" && maxLevel > 0) {
      growthBuffRefs.push({ ...base, override, label });
    } else {
      const engBuff = { ...base, value: fixedBuffValue(g1.buff) };
      if (override) {
        const { merged, warnings: w } = ov.mergeBuff(engBuff, override, g1.buff, label);
        warnings.push(...w);
        fixedBuffs.push(withFixedBuffDisplay(merged, g1.buff, ctx));
      } else {
        fixedBuffs.push(withFixedBuffDisplay(engBuff, g1.buff, ctx));
      }
    }

    if (ctx.emitTemplate) ctx.overrides.recordBuff(skill.id, ref.baseBuffId, g1.buff, engineBuffText(g1.buff));
  }

  return { fixedBuffs, growthBuffRefs };
}

function metricRows(ctx, scope, values, warnings) {
  return metrics.computeMetrics(ctx.metricDefs, scope, values, ctx.helpers, warnings);
}

function buildSkillCard(spec, ctx) {
  const warnings = [];
  const skill = ctx.skillById.get(spec.skillId);
  if (!skill) {
    return { skillId: spec.skillId, name: `技能${spec.skillId}`, error: "skill 不存在", warnings: [{ code: eng.WARN.MISSING_SKILL }] };
  }

  const cfg = eng.resolveCfgFile(skill, spec.slot, ROLE_ID, ctx.monsterById, warnings);
  const maxLevel = maxLevelFor(spec, skill, ctx);
  const rel = eng.resolveReleaseTime(cfg.entityCfg, skill.entityAction, cfg.hasActionCfg, warnings);
  const { fixedBuffs, growthBuffRefs } = collectBuffs(skill, cfg, ctx, maxLevel, warnings);

  if (spec.levelSkillId === null) {
    warnings.push({ code: "YANGJIAN_BRANCH_NO_SKILL_LEVEL", detail: `分支 ${skill.id} 没有 skillLevel 行,不输出等级伤害或耗蓝` });
  }

  const levelSkill = spec.levelSkillId === null ? null : (ctx.skillById.get(spec.levelSkillId || spec.skillId) || skill);
  const consumeSkill = spec.consumeSkillId ? ctx.skillById.get(spec.consumeSkillId) : null;
  const levels = [];

  for (let lv = 1; lv <= maxLevel; lv++) {
    const row = queryLevel(levelSkill, lv, ctx, warnings);
    if (!row) continue;
    const consumeRow = consumeSkill ? queryOptionalLevel(consumeSkill, lv, ctx) : row;
    if (consumeSkill && !consumeRow) warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `耗蓝来源 skill ${consumeSkill.id} lv${lv} 缺失` });

    const dmg = computeStrictDamage(skill, row, cfg.actionCfg, warnings);
    const growthBuffs = growthBuffRefs.map((ref) => {
      const g = eng.resolveBuffGrowth(ref.baseBuffId, lv, ctx.buffById, warnings);
      const engBuff = { name: ref.name, bindLabel: ref.bindLabel, time: ref.time, value: fixedBuffValue(g.buff) };
      if (ref.override && g.buff) {
        const { merged, warnings: w } = ov.mergeBuff(engBuff, ref.override, g.buff, ref.label);
        if (lv === 1) warnings.push(...w);
        return merged;
      }
      return engBuff;
    });

    levels.push({
      level: lv,
      roleLevel: row.roleLevel ?? null,
      consumeMp: consumeRow ? (consumeRow.consumeMp ?? null) : null,
      soulCost: row.soulCost ?? null,
      kind: dmg.kind,
      segments: dmg.segments,
      totalPer: dmg.totalPer,
      totalVal: dmg.totalVal,
      growthBuffs,
    });
  }

  const lv1 = levels[0] || null;
  const mechanics = (spec.mechanics || []).map((text, index) => ({ label: `机制${index + 1}`, value: text }));
  const skillOv = ctx.overrides.resolveSkill(spec.skillId);
  const card = {
    skillId: spec.skillId,
    name: spec.name || skill.desName || skill.Name || `技能${spec.skillId}`,
    icon: skill.icon || null,
    attribute: skill.attribute ?? null,
    entityAction: skill.entityAction || null,
    concreteSkillIds: eng.resolveConcreteSkills(spec.skillId, ctx.skillById, warnings),
    desIntro: skill.desIntro || null,
    header: {
      kind: lv1 ? lv1.kind : (spec.levelSkillId === null ? "branchNoLevel" : null),
      segments: lv1 ? lv1.segments.map((s) => ({ per: s.per, maxHit: s.maxHit, from: s.from })) : [],
      segCount: lv1 ? lv1.segments.reduce((a, s) => a + s.maxHit, 0) : 0,
      totalPer: lv1 ? lv1.totalPer : null,
      releaseFrames: rel.releaseFrames,
      releaseSeconds: rel.releaseSeconds,
      releaseTimeSource: rel.releaseTimeSource,
      cd: skill.cd ?? null,
      addDefendVal: lv1 ? (queryOptionalLevel(levelSkill, 1, ctx)?.addDefendVal ?? skill.addDefendVal ?? null) : (skill.addDefendVal ?? null),
      cfgFileResolved: cfg.cfgFileResolved,
      cfgResolveSource: cfg.cfgResolveSource,
      fixedBuffs,
      metrics: metricRows(ctx, "header", {
        skillId: spec.skillId,
        totalPer: lv1 ? lv1.totalPer : null,
        releaseSeconds: rel.releaseSeconds,
        segCount: lv1 ? lv1.segments.reduce((a, s) => a + s.maxHit, 0) : 0,
      }, warnings),
      mechanics,
      note: spec.note || null,
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
      metrics: metricRows(ctx, "level", {
        skillId: spec.skillId,
        level: l.level,
        roleLevel: l.roleLevel,
        consumeMp: l.consumeMp,
        totalPer: l.totalPer,
        totalVal: l.totalVal,
        releaseSeconds: rel.releaseSeconds,
        segCount: l.segments.reduce((a, s) => a + s.maxHit, 0),
      }, l.level === 1 ? warnings : []),
    })),
    warnings,
  };

  if (ctx.missingRoleInitial && spec.slot === "skill1") {
    card.warnings.push({ code: "YANGJIAN_MISSING_ROLE_INITIAL", detail: "roleInitial 表没有 roleId=8,本导出器使用杨戬 skill/monster 配置显式列出技能槽" });
  }
  if (ctx.missingPassiveSkill && spec.slot === "skill1") {
    card.warnings.push({ code: "YANGJIAN_MISSING_PASSIVE_SKILL", detail: "passiveSkill 表没有 roleType=8,被动改从 skill.beSkill 与 monster.initBeSkill 解析" });
  }

  if (skillOv) {
    for (const [k, v] of Object.entries(skillOv)) {
      if (k.startsWith("_")) continue;
      if (k.startsWith("header.")) card.header[k.slice(7)] = v;
      else card[k] = v;
    }
  }
  return card;
}

function requireBeskill(ctx, id, warnings) {
  const row = ctx.beskillById.get(id);
  if (!row) warnings.push({ code: "MISSING_BESKILL", detail: `杨戬被动缺少 beskill ${id}` });
  return row || null;
}

function requireBuff(ctx, id, warnings) {
  const row = ctx.buffById.get(id);
  if (!row) warnings.push({ code: "MISSING_BUFF", detail: `杨戬机制缺少 buff ${id}` });
  return row || null;
}

function passiveCard({ skillId, name, icon, text, mechanics, warnings }) {
  return {
    skillId,
    name,
    icon,
    attribute: null,
    entityAction: null,
    concreteSkillIds: [],
    desIntro: text,
    header: {
      kind: "passive",
      segments: [],
      segCount: 0,
      totalPer: null,
      releaseFrames: null,
      releaseSeconds: null,
      releaseTimeSource: "skill.beSkill+monster.initBeSkill",
      cd: null,
      addDefendVal: null,
      cfgFileResolved: "08-monster_cfg_erlangshen",
      cfgResolveSource: "monster.initBeSkill",
      fixedBuffs: [],
      metrics: [],
      mechanics: mechanics.map(([label, value]) => ({ label, value })),
      note: null,
    },
    maxLevel: 1,
    levels: [],
    warnings,
    passiveKind: true,
  };
}

function warnIfMissingInitBeskill(monster, ids, warnings, name) {
  const init = new Set(Array.isArray(monster?.initBeSkill) ? monster.initBeSkill : []);
  for (const id of ids) {
    if (!init.has(id)) warnings.push({ code: "YANGJIAN_INIT_BESKILL_MISSING", detail: `${name} 需要的 initBeSkill ${id} 不在 monster.initBeSkill 中` });
  }
}

function buildYangjianPassiveSlots(ctx) {
  const monster = ctx.monsterById.get(ROLE_ID);
  const slots = [];

  {
    const warnings = [];
    const skill = ctx.skillById.get(SKILL.PASSIVE_SKY);
    const addDamage = requireBeskill(ctx, BESKILL.SKY_ADD_DAMAGE, warnings);
    requireBeskill(ctx, BESKILL.SKY_COMBO, warnings);
    warnIfMissingInitBeskill(monster, [BESKILL.SKY_TEXT, BESKILL.SKY_COMBO, BESKILL.SKY_ADD_DAMAGE], warnings, "空中连击");
    const add = Array.isArray(addDamage?.attribute) && typeof addDamage.attribute[0] === "number" ? addDamage.attribute[0] : null;
    if (add == null) warnings.push({ code: "YANGJIAN_SKY_DAMAGE_MISSING", detail: `空中连击缺少 ${BESKILL.SKY_ADD_DAMAGE}.attribute[0]` });
    slots.push({
      slot: "passive1",
      slotLabel: "角色被动1",
      isTrans: false,
      base: passiveCard({
        skillId: SKILL.PASSIVE_SKY,
        name: "空中连击",
        icon: skill?.icon ?? null,
        text: skill?.desIntro || null,
        mechanics: [
          ["空中连击", "解锁杨戬空中多段普攻。"],
          ["空中增伤", add != null ? `杨戬不在地面时,造成的伤害额外提高${pct(add)}。` : "空中增伤数值缺失,已保留告警。"],
        ],
        warnings,
      }),
      awakens: [],
      allAwakenIdentical: false,
    });
  }

  {
    const warnings = [];
    const skill = ctx.skillById.get(SKILL.PASSIVE_GELIE);
    const gelie = requireBuff(ctx, BUFF.GELIE, warnings);
    requireBeskill(ctx, BESKILL.GELIE_GIVE_BUFF, warnings);
    warnIfMissingInitBeskill(monster, [BESKILL.GELIE_TEXT, BESKILL.GELIE_GIVE_BUFF], warnings, "割裂击");
    if (skill?.beSkill?.includes(BESKILL.SUOREN_TEXT)) {
      warnings.push({ code: "YANGJIAN_PASSIVE_BESKILL_MISMATCH", detail: "skill 8001093 的 beSkill 指向 12500400(锁刃空壳),实际割裂链来自 monster.initBeSkill 12500300/12500301" });
    }
    const per = fixedBuffValue(gelie)?.per;
    const maxPiles = gelie?.maxPiles;
    const time = gelie?.time;
    const cdTime = gelie?.cdTime;
    slots.push({
      slot: "passive2",
      slotLabel: "角色被动2",
      isTrans: false,
      base: passiveCard({
        skillId: SKILL.PASSIVE_GELIE,
        name: "割裂击",
        icon: skill?.icon ?? null,
        text: skill?.desIntro || null,
        mechanics: [
          ["触发规则", "杨戬攻击、技能和无双命中时给目标附加【割裂】；技能动作中也能看到疾风刺两段和风魔斩最后一段直接带有割裂命中状态。"],
          ["割裂效果", per != null && maxPiles != null ? `每层使目标受到杨戬攻击的伤害额外提高${pct(per)},最多${maxPiles}层。` : "割裂增伤或层数缺失,已保留告警。"],
          ["持续与冷却", time != null && cdTime != null ? `每层持续${time}帧(${seconds(time)}秒),内置触发冷却${cdTime}帧(${seconds(cdTime)}秒)。` : "割裂持续或冷却缺失,已保留告警。"],
        ],
        warnings,
      }),
      awakens: [],
      allAwakenIdentical: false,
    });
  }

  {
    const warnings = [];
    const skill = ctx.skillById.get(SKILL.PASSIVE_SUOREN);
    const give = requireBeskill(ctx, BESKILL.SUOREN_GIVE_BUFF, warnings);
    const suoren = requireBuff(ctx, BUFF.SUOREN, warnings);
    const atkDown = requireBuff(ctx, BUFF.SUOREN_ATK_DOWN, warnings);
    warnIfMissingInitBeskill(monster, [BESKILL.SUOREN_TEXT, BESKILL.SUOREN_GIVE_BUFF], warnings, "锁刃");
    if (skill?.beSkill?.includes(BESKILL.GELIE_TEXT)) {
      warnings.push({ code: "YANGJIAN_PASSIVE_BESKILL_MISMATCH", detail: "skill 8001092 的 beSkill 指向 12500300(割裂),实际锁刃链来自 monster.initBeSkill 12500400/12500401" });
    }
    const down = fixedBuffValue(atkDown)?.per;
    slots.push({
      slot: "passive3",
      slotLabel: "角色被动3",
      isTrans: false,
      base: passiveCard({
        skillId: SKILL.PASSIVE_SUOREN,
        name: "锁刃",
        icon: skill?.icon ?? null,
        text: skill?.desIntro || null,
        mechanics: [
          ["触发规则", give?.cd != null ? `杨戬攻击、技能和无双命中目标后附加【锁刃】,触发间隔${give.cd}帧(${seconds(give.cd)}秒)。` : "锁刃触发冷却缺失,已保留告警。"],
          ["锁刃状态", suoren?.time === -1 ? "目标获得锁刃后,下一次成功命中任意目标时触发攻击弱化。" : "目标获得锁刃后,下一次成功命中任意目标时触发后续弱化。"],
          ["攻击弱化", down != null && atkDown?.time != null ? `触发后攻击力降低${pct(Math.abs(down))},持续${atkDown.time}帧(${seconds(atkDown.time)}秒)。` : "攻击弱化数值或持续时间缺失,已保留告警。"],
        ],
        warnings,
      }),
      awakens: [],
      allAwakenIdentical: false,
    });
  }

  return slots;
}

function extract() {
  console.log("\n⚔️ 角色 Wiki → 杨戬");

  const skillById = idx(u.loadTable("skill"));
  const skillLevelById = idx(u.loadTable("skillLevel"));
  const monsterById = idx(u.loadTable("monster"));
  const buffById = idx(u.loadTable("buff"));
  const beskillById = idx(u.loadTable("beskill"));
  const roleInitial = u.loadTable("roleInitial").find((r) => r.roleId === ROLE_ID);
  const role = u.loadTable("role").find((r) => r.id === ROLE_ID);
  const monster = monsterById.get(ROLE_ID);

  const ctx = {
    skillById,
    skillLevelById,
    monsterById,
    buffById,
    beskillById,
    overrides: ov.loadOverrides(ROLE_OVERRIDE),
    emitTemplate: EMIT_TEMPLATE,
    standards: metrics.loadCommonStandards(),
    missingRoleInitial: !roleInitial,
    missingPassiveSkill: !u.loadTable("passiveSkill").some((row) => row.roleType === ROLE_ID),
  };

  ctx.metricDefs = [...DEFAULT_METRICS, ...ctx.overrides.getMetrics()];
  ctx.helpers = {
    standard: (roleLevel) => (roleLevel != null ? (ctx.standards.get(roleLevel) ?? null) : null),
    buffValue: (baseBuffId, valuePath, level) => {
      const g = eng.resolveBuffGrowth(Number(baseBuffId), level, ctx.buffById, []);
      if (!g.buff) return null;
      const v = ov.getPath(g.buff, valuePath);
      return typeof v === "number" ? v : null;
    },
  };

  const slots = SLOT_SPECS.map((spec) => ({
    slot: spec.slot,
    slotLabel: spec.slotLabel,
    isTrans: /^transSkill/.test(spec.slot),
    base: buildSkillCard(spec, ctx),
    awakens: [],
    allAwakenIdentical: false,
  }));

  if (EMIT_TEMPLATE) {
    const target = ctx.overrides.writeTemplate(FORCE);
    console.log(`  📝 模板已生成 → ${target}`);
    return;
  }

  const unused = ctx.overrides.finalizeWarnings();
  if (unused.length && slots[0]) slots[0].base.warnings.push(...unused);

  const passiveSlots = buildYangjianPassiveSlots(ctx);

  const payload = {
    role: {
      id: ROLE_ID,
      name: role?.name || monster?.name || "杨戬",
      makeupMonsterId: role?.makeupMonsterId ?? ROLE_ID,
      text: role?.text || "天庭显圣二郎真君杨戬。",
      atkMultiplier: role?.atk ?? monster?.atk ?? null,
      guidePath: GUIDE_PATH,
    },
    slots,
    passiveSlots,
  };

  u.saveOutput("role_wiki_yangjian", payload, {
    system: "role_wiki",
    sourceFiles: ["skill.*.json", "skillLevel.*.json", "monster.*.json", "beskill.*.json", "buff.*.json", "bullets.json", "entityCtg/08-monster_cfg_erlangshen.json"],
    note: "杨戬技能 Wiki 数据。roleInitial/passiveSkill 当前无杨戬正式行,主动技能按 skill+entityCtg 显式拆分长按/无充能分支,被动按 skill.beSkill 与 monster.initBeSkill 追真实链路,不使用 mock。",
  });

  for (const s of slots) {
    const b = s.base;
    const top = b.levels && b.levels[b.levels.length - 1];
    const mv = (k) => {
      const m = top && top.metrics && top.metrics.find((x) => x.key === k);
      return m && m.display != null ? m.display : "—";
    };
    console.log(`  ${s.slotLabel} ${b.name}(${b.skillId}): ${b.header.kind} ${b.header.segCount}段 per=${b.header.totalPer ?? "—"} 帧=${b.header.releaseFrames ?? "—"} maxLv=${b.maxLevel} | 满级蓝转=${mv("manaConv")} 攻转=${mv("atkConv")}${b.warnings.length ? " ⚠" + b.warnings.length : ""}`);
  }
  for (const ps of passiveSlots) console.log(`  被动: ${ps.base.name} (${ps.base.skillId})${ps.base.warnings.length ? " ⚠" + ps.base.warnings.length : ""}`);
}

if (require.main === module) extract();
module.exports = extract;
