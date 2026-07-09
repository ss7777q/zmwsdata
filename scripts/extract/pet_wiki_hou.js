/**
 * 宠物技能 Wiki - 炽焰猴王/极光猴王提取脚本
 *
 * 宠物入口从 pet.skillActive/skillPassive/skillSp 和 pet.monsterId 取展示技能，
 * 普攻从宠物 monster.atkIds 取；尾部复用角色 Wiki 的 skill-engine 解析 skillLevel、
 * entityCtg、bullet、buff/beskill。
 *
 * 猴组有多个连续阶段技能。展示技能仍用玩家看见的技能，
 * 伤害段只从实际命中阶段读取，避免把前摇衔接当成伤害。
 */
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");

const PET_OVERRIDE = "hou";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const BATTLE_FRAMES_PER_SECOND = 30;
const GUIDE_PATH = "D:/zmws/保存网页资源/4399_Threads_Download/【结弦】炽焰与极光 宠物猴数值百科_64341885/content.md";

const PET_IDS = [190000013, 190000123];
const HOU_SKILL = {
  FIRE_ATTACK: 20402020001,
  FIRE_SKILL_1: 20402020101,
  FIRE_SKILL_1_HIT: 20402020103,
  FIRE_SKILL_2: 20402020201,
  FIRE_SKILL_3: 20402020301,
  FIRE_SP: 20402020401,
  FIRE_SP_MOVE: 20402020402,
  FIRE_SP_HIT: 20402020403,
  FIRE_PASSIVE: 20402020501,
  LIGHT_ATTACK: 20413020001,
  LIGHT_SKILL_1: 20413020101,
  LIGHT_SKILL_1_MOVE: 20413020102,
  LIGHT_SKILL_1_CONTACT: 20413020103,
  LIGHT_SKILL_1_HIT: 20413020104,
  LIGHT_SKILL_2: 20413020201,
  LIGHT_SKILL_3: 20413020301,
  LIGHT_SP: 20413020401,
  LIGHT_PASSIVE: 20413020501,
};

const HOU_BUFF = {
  FIRE_ARMOR_FEEDBACK: 1014701,
  FIRE_ARMOR_REDUCE: 14004901,
  FIRE_RAGE_ENCHANT: 123000101,
  FIRE_RAGE_BURN: 1005101,
  LIGHT_PIERCE: 70000701,
  LIGHT_BLIND: 7003801,
};

const SPECIAL_CONCRETE_SKILLS = new Map([
  [HOU_SKILL.FIRE_SKILL_1, [HOU_SKILL.FIRE_SKILL_1, HOU_SKILL.FIRE_SKILL_1_HIT]],
  [HOU_SKILL.FIRE_SP, [HOU_SKILL.FIRE_SP, HOU_SKILL.FIRE_SP_MOVE, HOU_SKILL.FIRE_SP_HIT]],
  [HOU_SKILL.LIGHT_SKILL_1, [HOU_SKILL.LIGHT_SKILL_1, HOU_SKILL.LIGHT_SKILL_1_MOVE, HOU_SKILL.LIGHT_SKILL_1_CONTACT, HOU_SKILL.LIGHT_SKILL_1_HIT]],
]);

const DAMAGE_SKILL_IDS = new Map([
  [HOU_SKILL.FIRE_SKILL_1, [HOU_SKILL.FIRE_SKILL_1_HIT]],
  [HOU_SKILL.FIRE_SP, [HOU_SKILL.FIRE_SP_HIT]],
  [HOU_SKILL.LIGHT_SKILL_1, [HOU_SKILL.LIGHT_SKILL_1_HIT]],
  [HOU_SKILL.LIGHT_SKILL_2, []],
]);

const LINKED_RELEASE_ACTIONS = new Map([
  [HOU_SKILL.FIRE_SKILL_1, ["skill1_1", "skill1_2"]],
  [HOU_SKILL.FIRE_SP, ["skill4_1", "skill4_2", "skill4_3"]],
]);

function guideRelease(seconds, source) {
  return { frames: Math.round(seconds * BATTLE_FRAMES_PER_SECOND), source };
}

const GUIDE_RELEASE_FRAMES = new Map([
  [HOU_SKILL.LIGHT_SKILL_1, guideRelease(1.2, "guide:houWiki:瞬光击释放用时1.2s")],
]);

const GUIDE_CD_SECONDS = new Map([
  [HOU_SKILL.FIRE_SKILL_1, 10],
  [HOU_SKILL.FIRE_SKILL_2, 15],
  [HOU_SKILL.FIRE_SKILL_3, 20],
  [HOU_SKILL.FIRE_SP, 30],
  [HOU_SKILL.LIGHT_SKILL_1, 10],
  [HOU_SKILL.LIGHT_SKILL_2, 10],
  [HOU_SKILL.LIGHT_SKILL_3, 18],
  [HOU_SKILL.LIGHT_SP, 30],
]);

const EFFECT_ONLY_SKILLS = new Set([HOU_SKILL.LIGHT_SKILL_2]);
const SLOT_DEFS = [
  { key: "attack", labelPrefix: "普攻", kind: "attack" },
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

const BUFF_TYPE_LABEL = {
  4: "移动速度",
  7: "命中",
  8: "闪避",
  14: "承伤",
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

function pctText(n) {
  return `${round(Math.abs(n) * 100)}%`;
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

function skillName(skillId, ctx) {
  const skill = ctx.skillById.get(Number(skillId));
  return skill?.desName || skill?.Name || `技能${skillId}`;
}

function petMonsterIds(pet) {
  return asArray(pet.monsterId).filter((id) => id != null);
}

function ownerMonstersForSkill(skillId, ctx) {
  const out = [];
  for (const m of ctx.monsterById.values()) {
    const all = [].concat(m.skillIds || [], m.skyskillIds || [], m.vSkill || [], m.atkIds || [], m.skyAtkIds || []);
    if (all.includes(skillId)) out.push(m);
  }
  return out;
}

function resolvePetCfgFile(skill, pet, ctx, warnings) {
  const action = skill.entityAction;
  const monsterIds = petMonsterIds(pet);
  const order = [];

  for (const id of monsterIds) {
    const monster = ctx.monsterById.get(id);
    if (monster) order.push(monster);
  }
  for (const monster of ownerMonstersForSkill(skill.id, ctx)) {
    if (!order.some((m) => m.id === monster.id)) order.push(monster);
  }

  for (const monster of order) {
    const entityCfg = eng.loadEntityCfg(monster.cfgFile);
    if (entityCfg && action && entityCfg[action]) {
      return {
        cfgFileResolved: monster.cfgFile,
        cfgResolveSource: monsterIds.includes(monster.id) ? "petMonster" : "ownerMonster",
        cfgMonsterId: monster.id,
        cfgMonsterName: monster.name,
        hasActionCfg: true,
        actionCfg: entityCfg[action],
        entityCfg,
      };
    }
  }

  const fallback = order[0] || null;
  const fallbackCfg = fallback ? eng.loadEntityCfg(fallback.cfgFile) : null;
  if (action) {
    if (!fallbackCfg) warnings.push({ code: eng.WARN.MISSING_ENTITY_CFG, detail: `pet ${pet.id} skill ${skill.id} 找不到 entityCtg` });
    else warnings.push({ code: eng.WARN.MISSING_ACTION_CFG, detail: `pet ${pet.id} skill ${skill.id} action=${action} 在 cfg ${fallback.cfgFile} 中不存在` });
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

function resolvePetConcreteSkills(displaySkillId, ctx, warnings) {
  const special = SPECIAL_CONCRETE_SKILLS.get(displaySkillId);
  if (special) {
    for (const id of special) {
      if (!ctx.skillById.has(id)) warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `连段子技能 ${id} 缺少技能数据` });
    }
    return special.filter((id) => ctx.skillById.has(id));
  }
  return eng.resolveConcreteSkills(displaySkillId, ctx.skillById, warnings);
}

function damageSkillIdsFor(displaySkillId, concreteIds) {
  if (DAMAGE_SKILL_IDS.has(displaySkillId)) return DAMAGE_SKILL_IDS.get(displaySkillId);
  return concreteIds;
}

function detectDisplayMaxLevel(displaySkillId, concreteIds, slotKind, ctx) {
  if (slotKind === "passive" || slotKind === "attack") return 1;
  const sourceIds = damageSkillIdsFor(displaySkillId, concreteIds);
  const ids = sourceIds.length ? sourceIds : [displaySkillId];
  let maxLevel = 0;
  for (const id of ids) {
    const skill = ctx.skillById.get(id);
    if (!skill) continue;
    maxLevel = Math.max(maxLevel, eng.detectMaxLevel(skill, ctx.skillLevelById));
  }
  return maxLevel;
}

function actionBulletIds(actionCfg) {
  if (!actionCfg || !Array.isArray(actionCfg.com)) return [];
  return actionCfg.com.filter((c) => c.type === 2 && c.bId != null).map((c) => c.bId);
}

function capSegmentsByActionTime(segments, skill, cfg, warnings) {
  const actionFrames = cfg.entityCfg?.time?.[skill.entityAction];
  if (typeof actionFrames !== "number" || actionFrames <= 0) return segments;

  return segments.map((segment) => {
    const match = /^actionBullet:(\d+)$/.exec(segment.from || "");
    if (!match || !segment.maxHit || segment.maxHit <= 1) return segment;

    const bullet = eng.getBullet(Number(match[1]), warnings);
    const damageCom = eng.damageComs(bullet).find((com) => (com.maxHit || 1) === segment.maxHit);
    const hitInterval = damageCom?.hitInteval;
    if (typeof hitInterval !== "number" || hitInterval <= 0) return segment;

    const intervalFrames = hitInterval * BATTLE_FRAMES_PER_SECOND;
    const cappedHits = Math.ceil(actionFrames / intervalFrames);
    if (cappedHits > 0 && cappedHits < segment.maxHit) {
      return { ...segment, maxHit: cappedHits, capSource: "actionTime" };
    }
    return segment;
  });
}

function resolveLinkedReleaseTime(displaySkillId, pet, ctx, warnings) {
  const guide = GUIDE_RELEASE_FRAMES.get(displaySkillId);
  if (guide) {
    return {
      releaseFrames: guide.frames,
      releaseSeconds: guide.frames / BATTLE_FRAMES_PER_SECOND,
      releaseTimeSource: guide.source,
    };
  }

  const actions = LINKED_RELEASE_ACTIONS.get(displaySkillId);
  if (!actions) return null;

  const skill = ctx.skillById.get(displaySkillId);
  if (!skill) return null;
  const cfg = resolvePetCfgFile(skill, pet, ctx, warnings);
  if (!cfg.entityCfg?.time) return null;

  let frames = 0;
  for (const action of actions) {
    const t = cfg.entityCfg.time[action];
    if (typeof t !== "number") {
      warnings.push({ code: eng.WARN.SOURCE_DEFAULT_30_FRAMES, detail: `skill ${displaySkillId} 链接动作 ${action} 缺少 time,无法合并释放时间` });
      return null;
    }
    frames += t;
  }

  return {
    releaseFrames: frames,
    releaseSeconds: frames / BATTLE_FRAMES_PER_SECOND,
    releaseTimeSource: `entityCtg.time linked:${actions.join("+")}`,
  };
}

function resolvePetReleaseTime(displaySkillId, cfg, skill, pet, ctx, warnings) {
  return resolveLinkedReleaseTime(displaySkillId, pet, ctx, warnings)
    || eng.resolveReleaseTime(cfg.entityCfg, skill.entityAction, cfg.hasActionCfg, warnings);
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
    const { merged, warnings: w } = ov.mergeBuff(engineBuff, override, rawBuff, `[hou buff ${baseBuffId} ${engineBuff.name}] `);
    warnings.push(...w);
    out.push(merged);
  } else {
    out.push(engineBuff);
  }
}

function nestedBuffIdsFromBuff(rawBuff) {
  if (!rawBuff || !Array.isArray(rawBuff.value)) return [];
  const nested = rawBuff.value[1];
  return asArray(nested).filter((id) => typeof id === "number" && id > 1000);
}

function collectPassiveEffects(displaySkillId, ctx, warnings) {
  const skill = ctx.skillById.get(displaySkillId);
  const out = [];
  const beSkillIds = [].concat(skill?.beSkill || [], skill?.beSkill2 || []).filter(Boolean);

  for (const beSkillId of beSkillIds) {
    const be = ctx.beskillById.get(beSkillId);
    if (!be) {
      warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `passive beskill ${beSkillId} 缺失` });
      continue;
    }

    if (be.label === "appearBuff1" && Array.isArray(be.attribute)) {
      for (const buffId of be.attribute) {
        const rawBuff = ctx.buffById.get(buffId);
        if (!rawBuff) {
          warnings.push({ code: eng.WARN.MISSING_BUFF, detail: `passive buff ${buffId} 缺失` });
          continue;
        }

        const nestedIds = nestedBuffIdsFromBuff(rawBuff);
        if (nestedIds.length) {
          for (const nestedId of nestedIds) {
            pushBuffCard(out, displaySkillId, nestedId, ctx.buffById.get(nestedId), "passiveEffect", ctx, warnings, null);
          }
          continue;
        }

        const value = buffValueSummary(rawBuff);
        pushBuffCard(
          out,
          displaySkillId,
          buffId,
          rawBuff,
          "passiveEffect",
          ctx,
          warnings,
          value?.per != null ? `自身${BUFF_TYPE_LABEL[rawBuff.type] || rawBuff.text || rawBuff.name || "属性"}提升${pctText(value.per)}` : null,
        );
      }
      continue;
    }

    out.push({
      baseBuffId: beSkillId,
      name: be.name || skill.desName || "被动效果",
      text: be.text || null,
      time: -1,
      bindSource: "passiveEffect",
      bindLabel: BIND_SOURCE_LABEL.passiveEffect,
      value: null,
      displayText: be.text || `beskill ${beSkillId}`,
    });
  }

  return out;
}

function collectGuideEffects(displaySkillId) {
  if (displaySkillId === HOU_SKILL.LIGHT_SKILL_1) {
    return [{
      baseBuffId: displaySkillId,
      name: "瞬光击阶段效果",
      text: "攻略补充",
      time: -1,
      bindSource: "guideEffect",
      bindLabel: BIND_SOURCE_LABEL.guideEffect,
      value: null,
      displayText: "分为前摇、冲刺、命中三个阶段；前摇和命中阶段免疫减益，三个阶段均保持超级霸体；最远冲至前方550码",
    }];
  }

  if (displaySkillId === HOU_SKILL.LIGHT_SP) {
    return [{
      baseBuffId: displaySkillId,
      name: "凝光一击控制",
      text: "攻略补充",
      time: -1,
      bindSource: "guideEffect",
      bindLabel: BIND_SOURCE_LABEL.guideEffect,
      value: null,
      displayText: "可击退霸体单位；若击退霸体单位，叠加1层抓取标记，累计3层标记转为抓取抗性",
    }];
  }

  return [];
}

function collectBuffs(displaySkillId, concreteIds, pet, slotKind, ctx, warnings) {
  const fixedBuffs = [];
  const growthBuffRefs = [];
  const seenBuffs = new Set();

  const addGrowthBuffRef = (baseBuffId, bindSource) => {
    if (seenBuffs.has(baseBuffId)) return;
    seenBuffs.add(baseBuffId);
    const g1 = eng.resolveBuffGrowth(baseBuffId, 1, ctx.buffById, warnings);
    if (!g1.buff) return;
    const rawBuff1 = resolveRawBuff(g1.buff, ctx.buffById);
    const override = ctx.overrides.resolveBuff(displaySkillId, baseBuffId);
    growthBuffRefs.push({
      baseBuffId,
      name: rawBuff1.name || `buff${baseBuffId}`,
      text: rawBuff1.text || null,
      time: rawBuff1.time ?? null,
      bindSource,
      bindLabel: BIND_SOURCE_LABEL[bindSource] || bindSource,
      levelMode: g1.levelMode,
      override,
      label: `[hou buff ${baseBuffId} ${rawBuff1.name || ""}] `,
    });
    if (ctx.emitTemplate) ctx.overrides.recordBuff(displaySkillId, baseBuffId, rawBuff1, null);
  };

  for (const skillId of concreteIds) {
    const skill = ctx.skillById.get(skillId);
    if (!skill) continue;
    const cfg = resolvePetCfgFile(skill, pet, ctx, warnings);
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
      const label = `[hou buff ${ref.baseBuffId} ${base.name}] `;
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

  if (displaySkillId === HOU_SKILL.FIRE_SKILL_2) {
    addGrowthBuffRef(HOU_BUFF.FIRE_RAGE_BURN, "mechanismEffect");
  }

  if (slotKind === "passive") fixedBuffs.push(...collectPassiveEffects(displaySkillId, ctx, warnings));
  fixedBuffs.push(...collectGuideEffects(displaySkillId));
  return { fixedBuffs, growthBuffRefs };
}

function computePetLevel(displaySkillId, concreteIds, level, pet, slotKind, ctx, warnings) {
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

  if (EFFECT_ONLY_SKILLS.has(displaySkillId)) {
    const skill = ctx.skillById.get(displaySkillId);
    const row = skill ? ctx.skillLevelById.get(eng.skillLevelRowId(skill, level)) : null;
    if (!row) warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `skill ${displaySkillId} lv${level} 缺失` });
    return {
      level,
      roleLevel: row?.roleLevel ?? null,
      consumeMp: row?.consumeMp ?? null,
      soulCost: row?.soulCost ?? null,
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
  const sourceIds = damageSkillIdsFor(displaySkillId, concreteIds);

  for (const skillId of sourceIds) {
    const skill = ctx.skillById.get(skillId);
    if (!skill) continue;
    const row = ctx.skillLevelById.get(eng.skillLevelRowId(skill, level));
    if (!row) {
      warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `skill ${skill.id} lv${level} 缺失` });
      continue;
    }
    if (!firstRow) firstRow = row;

    const cfg = resolvePetCfgFile(skill, pet, ctx, warnings);
    const dmg = eng.computeDamageSegments(skill, row, cfg.actionCfg, warnings);
    if (dmg.segments && dmg.segments.length) {
      const capped = capSegmentsByActionTime(dmg.segments, skill, cfg, warnings);
      mergedSegments.push(...capped);
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
    kind: mergedSegments.length ? (mergedKind || "normal") : "effectOnly",
    segments: mergedSegments,
    totalPer: mergedSegments.length ? round(totalPer) : null,
    totalVal: mergedSegments.length ? round(totalVal) : null,
    addDefendVal: firstRow.addDefendVal ?? null,
  };
}

function buildSkillCard(displaySkillId, pet, slotLabel, slotKind, ctx) {
  const warnings = [];
  const skill = ctx.skillById.get(displaySkillId);
  if (!skill) {
    return { skillId: displaySkillId, name: `技能${displaySkillId}`, error: "skill 不存在", warnings: [{ code: eng.WARN.MISSING_SKILL }] };
  }

  const concreteIds = resolvePetConcreteSkills(displaySkillId, ctx, warnings);
  const cfg = resolvePetCfgFile(skill, pet, ctx, warnings);
  const maxLevel = detectDisplayMaxLevel(displaySkillId, concreteIds, slotKind, ctx);
  const rel = slotKind === "passive"
    ? { releaseFrames: null, releaseSeconds: null, releaseTimeSource: "effectOnly" }
    : resolvePetReleaseTime(displaySkillId, cfg, skill, pet, ctx, warnings);
  const { fixedBuffs, growthBuffRefs } = collectBuffs(displaySkillId, concreteIds, pet, slotKind, ctx, warnings);

  const levels = [];
  for (let lv = 1; lv <= maxLevel; lv++) {
    const l = computePetLevel(displaySkillId, concreteIds, lv, pet, slotKind, ctx, warnings);
    if (!l) continue;
    l.growthBuffs = growthBuffRefs.map((ref) => {
      const g = eng.resolveBuffGrowth(ref.baseBuffId, lv, ctx.buffById, warnings);
      const rawBuffG = resolveRawBuff(g.buff, ctx.buffById);
      const engBuff = {
        name: ref.name,
        bindLabel: ref.bindLabel,
        time: rawBuffG?.time ?? ref.time,
        value: buffValueSummary(rawBuffG),
      };
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
  const segCount = reference ? reference.segments.reduce((sum, s) => sum + (s.maxHit || 1), 0) : 0;
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
      kind: reference ? reference.kind : null,
      segments: reference ? reference.segments.map((s) => ({ per: s.per, maxHit: s.maxHit, from: s.from, capSource: s.capSource || null })) : [],
      segCount,
      totalPer: reference ? reference.totalPer : null,
      releaseFrames: rel.releaseFrames,
      releaseSeconds: rel.releaseSeconds,
      releaseTimeSource: rel.releaseTimeSource,
      cd: GUIDE_CD_SECONDS.has(displaySkillId) ? GUIDE_CD_SECONDS.get(displaySkillId) : (skill.cd ?? null),
      addDefendVal: skill.addDefendVal ?? null,
      cfgFileResolved: cfg.cfgFileResolved,
      cfgResolveSource: cfg.cfgResolveSource,
      referenceLevel: reference?.level ?? null,
      fixedBuffs,
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
      metrics: metrics.computeMetrics(
        ctx.metricDefs, "level",
        { skillId: displaySkillId, level: l.level, roleLevel: l.roleLevel, consumeMp: l.consumeMp, totalPer: l.totalPer, totalVal: l.totalVal, growthBuffs: l.growthBuffs || [], releaseSeconds: rel.releaseSeconds, segCount: l.segments.reduce((sum, s) => sum + (s.maxHit || 1), 0) },
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

function petAttackSkillIds(pet, ctx) {
  const ids = [];
  for (const monsterId of petMonsterIds(pet)) {
    const monster = ctx.monsterById.get(monsterId);
    for (const skillId of asArray(monster?.atkIds).filter(Boolean)) {
      if (!ids.includes(skillId)) ids.push(skillId);
    }
  }
  return ids;
}

function skillIdsForSlot(pet, def, ctx) {
  if (def.kind === "attack") return petAttackSkillIds(pet, ctx);
  return asArray(pet[def.key]).filter(Boolean);
}

function buildSlots(pet, ctx) {
  const slots = [];
  for (const def of SLOT_DEFS) {
    const ids = skillIdsForSlot(pet, def, ctx);
    ids.forEach((skillId, index) => {
      const slotLabel = def.kind === "attack" || def.kind === "sp" || def.kind === "passive" ? def.labelPrefix : `${def.labelPrefix}${index + 1}`;
      slots.push({
        slot: def.kind === "attack" ? `attack${index + 1}` : `${def.key}${index + 1}`,
        slotLabel,
        slotKind: def.kind,
        base: buildSkillCard(skillId, pet, slotLabel, def.kind, ctx),
        awakens: [],
        allAwakenIdentical: false,
      });
    });
  }
  return slots;
}

function extract() {
  console.log("\n🐒 宠物技能 Wiki → 炽焰猴王/极光猴王");

  const ctx = {
    petById: idx(u.loadTable("pet")),
    skillById: idx(u.loadTable("skill")),
    skillLevelById: idx(u.loadTable("skillLevel")),
    monsterById: idx(u.loadTable("monster")),
    buffById: idx(u.loadTable("buff")),
    beskillById: idx(u.loadTable("beskill")),
    overrides: ov.loadOverrides(PET_OVERRIDE),
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

  const variants = PET_IDS.map((petId) => {
    const pet = ctx.petById.get(petId);
    if (!pet) throw new Error(`pet ${petId} 不存在`);
    const monster = ctx.monsterById.get(petMonsterIds(pet)[0]);
    return {
      pet: {
        id: pet.id,
        idGroup: pet.idGroup,
        name: pet.name,
        rank: pet.rank,
        type: pet.type,
        monsterId: pet.monsterId,
        monsterName: monster?.name || null,
        cfgFile: monster?.cfgFile || null,
      },
      slots: buildSlots(pet, ctx),
    };
  });

  const unused = ctx.overrides.finalizeWarnings();
  if (unused.length && variants[0]?.slots[0]?.base) variants[0].slots[0].base.warnings.push(...unused);

  const payload = {
    petGroup: {
      key: "hou",
      name: "炽焰猴王/极光猴王",
      guidePath: GUIDE_PATH,
      petIds: PET_IDS,
      note: "宠物技能 Wiki 使用满级作为卡片表头参考值，逐级成长见下方成长数值表；多阶段技能按实际命中阶段合并，极光闪耀仅展示成长效果。",
    },
    variants,
  };

  u.saveOutput("pet_wiki_hou", payload, {
    system: "pet_wiki",
    sourceFiles: ["pet.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "beskill.*.json", "buff.*.json", "bullets.json", "entityCtg/*.json", GUIDE_PATH],
    note: "炽焰猴王/极光猴王宠物技能 Wiki，包括普攻、主动技能、无双、被动与极光闪耀成长效果。",
  });

  for (const v of variants) {
    console.log(`  ${v.pet.name}(${v.pet.id}) cfg=${v.pet.cfgFile}`);
    for (const s of v.slots) {
      const b = s.base;
      const atkConv = b.levels?.[b.levels.length - 1]?.metrics?.find((m) => m.key === "atkConv")?.display ?? "—";
      console.log(`    ${s.slotLabel} ${b.name}(${b.skillId}): ${b.header.kind} ${b.header.segCount}段 per=${b.header.totalPer ?? "—"} 帧=${b.header.releaseFrames ?? "—"} maxLv=${b.maxLevel} 攻转=${atkConv}${b.warnings.length ? " ⚠" + b.warnings.length : ""}`);
    }
  }
}

if (require.main === module) extract();
module.exports = extract;
