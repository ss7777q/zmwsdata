/**
 * 宠物技能 Wiki - 暗夜鼠王/冥甲鼠王提取脚本
 *
 * 宠物入口从 pet.skillActive/skillPassive/skillSp 和 pet.monsterId 取展示技能；
 * 普攻从宠物 monster.atkIds 取。伤害、释放时间、buff 成长继续走 skill ->
 * skillLevel -> entityCtg/bullets -> buff/beskill 的链路。
 */
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");

const PET_OVERRIDE = "laoshu";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const BATTLE_FRAMES_PER_SECOND = 30;
const CLONE_DAMAGE_FACTOR = 0.25;
const GUIDE_PATH = "D:/zmws/保存网页资源/4399_Threads_Download/暗夜与暗流~老鼠异化前后数据一览_64113907/content.md";

const PET_IDS = [190000003, 190000143];

const PET_SKILL = {
  DARK_ATTACK: 20401020001,
  DARK_SKILL_1: 20401020101,
  DARK_SKILL_1_HIT: 20401020103,
  DARK_SKILL_2: 20401020201,
  DARK_SKILL_3: 20401020301,
  DARK_SP: 20401020401,
  DARK_PASSIVE: 20401020501,
  MING_ATTACK: 20415020001,
  MING_SKILL_1: 20415020101,
  MING_SKILL_1_HIT: 20415020103,
  MING_SKILL_2: 20415020201,
  MING_SKILL_2_HIT: 20415020204,
  MING_SKILL_3: 20415020301,
  MING_SKILL_3_HIT: 20415020302,
  MING_SP: 20415020401,
  MING_PASSIVE: 20415020501,
  MING_PASSIVE_VSKILL: 20415020502,
};

const PET_BUFF = {
  DARK_CRIT_UP: 9000401,
  DARK_STEALTH: 116000201,
  DARK_SP_DAMAGE: 1014901,
  DARK_SP_PET_BONUS: 160000401,
  MING_LIFE_STEAL: 195000201,
};

const PET_BESKILL = {
  DARK_STEAL_PROP: 7011701,
  MING_VALUE_FLAG: 7062701,
};

const SPECIAL_CONCRETE_SKILLS = new Map([
  [PET_SKILL.DARK_SKILL_1, [PET_SKILL.DARK_SKILL_1_HIT]],
  [PET_SKILL.MING_SKILL_1, [PET_SKILL.MING_SKILL_1_HIT]],
  [PET_SKILL.MING_SKILL_2, [PET_SKILL.MING_SKILL_2_HIT]],
  [PET_SKILL.MING_SKILL_3, [PET_SKILL.MING_SKILL_3_HIT]],
]);

const GUIDE_DAMAGE_PATCHES = new Map([
  [PET_SKILL.DARK_SKILL_3, {
    kind: "guideActionBulletCap",
    bulletId: 316,
    maxHit: 9,
    source: "actionBullet:316 guide:laoshuWiki:死亡之刺按9连击展示，battle bullet maxHit=99 不作为伤害段数",
  }],
  [PET_SKILL.DARK_SP, {
    kind: "guideBuffDamage",
    buffId: PET_BUFF.DARK_SP_DAMAGE,
    source: "bullet:2098 hitBuff:1014901 guide:laoshuWiki:心魂终结伤害来自命中成长 buff，不采用 skillLevel 的0系数占位",
  }],
  [PET_SKILL.MING_SP, {
    kind: "guideCloneContribution",
    source: "guide:laoshuWiki:暗流分身按2次1技能、1次2技能、1次3技能、3次普攻，分身伤害按25%折算",
  }],
]);

function guideRelease(seconds, source) {
  return { frames: Math.round(seconds * BATTLE_FRAMES_PER_SECOND), source };
}

const GUIDE_RELEASE_FRAMES = new Map([
  [PET_SKILL.DARK_ATTACK, guideRelease(1.5, "guide:laoshuWiki:暗夜鼠王普攻释放1.5s")],
  [PET_SKILL.DARK_SKILL_1, guideRelease(3.33, "guide:laoshuWiki:潜地突袭释放用时3.33s")],
  [PET_SKILL.DARK_SKILL_2, { frames: 38, source: "entityCtg.time:skill2=38 frames; guide:laoshuWiki:潜行无直接伤害" }],
  [PET_SKILL.DARK_SKILL_3, guideRelease(2.9, "guide:laoshuWiki:死亡之刺释放用时2.9s")],
  [PET_SKILL.DARK_SP, guideRelease(1.83, "guide:laoshuWiki:心魂终结释放用时1.83s")],
  [PET_SKILL.MING_ATTACK, guideRelease(1.5, "guide:laoshuWiki:冥甲鼠王普攻释放1.5s")],
  [PET_SKILL.MING_SKILL_1, { frames: 98, source: "guide:laoshuWiki:潜地喷流释放约3.26s/3.27s" }],
  [PET_SKILL.MING_SKILL_2, guideRelease(0.97, "guide:laoshuWiki:嗜血利爪释放用时0.97s")],
  [PET_SKILL.MING_SKILL_3, guideRelease(3.73, "guide:laoshuWiki:水涡旋击释放用时3.73s")],
  [PET_SKILL.MING_SP, guideRelease(0.8, "guide:laoshuWiki:暗流分身释放用时0.8s")],
]);

const GUIDE_CD_SECONDS = new Map([
  [PET_SKILL.DARK_SKILL_1, 10],
  [PET_SKILL.DARK_SKILL_2, 20],
  [PET_SKILL.DARK_SKILL_3, 20],
  [PET_SKILL.DARK_SP, 30],
  [PET_SKILL.MING_SKILL_1, 12],
  [PET_SKILL.MING_SKILL_2, 24],
  [PET_SKILL.MING_SKILL_3, 24],
  [PET_SKILL.MING_SP, 30],
]);

const EFFECT_ONLY_SKILLS = new Set([PET_SKILL.DARK_SKILL_2]);

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
  mechanismEffect: "机制效果",
  guideEffect: "攻略效果",
  passiveEffect: "被动效果",
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
  return Math.round(n * 10000) / 10000;
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function requiredNumber(value, label) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${label} 缺少必需数值`);
  }
  return value;
}

function buffValueSummary(buff) {
  if (!buff) return null;
  let v = buff.value;
  if (Array.isArray(v) && Array.isArray(v[0])) v = v[0];
  if (Array.isArray(v)) {
    return { per: typeof v[0] === "number" ? v[0] : null, val: typeof v[1] === "number" ? v[1] : null };
  }
  if (v && typeof v === "object") {
    if (typeof v.atkPer === "number" || typeof v.atkVal === "number") {
      return { per: typeof v.atkPer === "number" ? v.atkPer : null, val: typeof v.atkVal === "number" ? v.atkVal : null };
    }
    if (typeof v.max === "number") {
      return { per: typeof v.per === "number" ? v.per : null, val: v.max };
    }
    return { per: typeof v.per === "number" ? v.per : null, val: typeof v.val === "number" ? v.val : null };
  }
  return null;
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
      if (!ctx.skillById.has(id)) warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `子技能 ${id} 不在 skill 表` });
    }
    return special.filter((id) => ctx.skillById.has(id));
  }
  return eng.resolveConcreteSkills(displaySkillId, ctx.skillById, warnings);
}

function resolvePetReleaseTime(displaySkillId, cfg, skill, warnings) {
  const guide = GUIDE_RELEASE_FRAMES.get(displaySkillId);
  if (guide) {
    return {
      releaseFrames: guide.frames,
      releaseSeconds: guide.frames / BATTLE_FRAMES_PER_SECOND,
      releaseTimeSource: guide.source,
    };
  }
  return eng.resolveReleaseTime(cfg.entityCfg, skill.entityAction, cfg.hasActionCfg, warnings);
}

function detectDisplayMaxLevel(displaySkillId, concreteIds, slotKind, ctx) {
  if (slotKind === "passive" || slotKind === "attack") return 1;
  const patch = GUIDE_DAMAGE_PATCHES.get(displaySkillId);
  const ids = patch?.kind === "guideCloneContribution"
    ? [PET_SKILL.MING_SP, PET_SKILL.MING_SKILL_1_HIT, PET_SKILL.MING_SKILL_2_HIT, PET_SKILL.MING_SKILL_3_HIT]
    : concreteIds;
  let maxLevel = 0;
  for (const id of ids) {
    const skill = ctx.skillById.get(id);
    if (!skill) continue;
    maxLevel = Math.max(maxLevel, eng.detectMaxLevel(skill, ctx.skillLevelById));
  }
  return maxLevel;
}

function mergeBuffForDisplay(displaySkillId, baseBuffId, rawBuff, engineBuff, ctx, warnings) {
  const override = ctx.overrides.resolveBuff(displaySkillId, baseBuffId) || ctx.overrides.resolveBuff(0, baseBuffId);
  if (!override) return engineBuff;
  const { merged, warnings: w } = ov.mergeBuff(engineBuff, override, rawBuff, `[laoshu buff ${baseBuffId} ${engineBuff.name}] `);
  warnings.push(...w);
  return merged;
}

function pushFixedBuff(out, displaySkillId, baseBuffId, rawBuff, bindSource, ctx, warnings, fallbackText = null) {
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
  out.push(mergeBuffForDisplay(displaySkillId, baseBuffId, rawBuff, engineBuff, ctx, warnings));
}

function addGrowthBuffRef(growthBuffRefs, seenBuffs, displaySkillId, baseBuffId, bindSource, ctx, warnings) {
  if (seenBuffs.has(baseBuffId)) return;
  seenBuffs.add(baseBuffId);
  const g1 = eng.resolveBuffGrowth(baseBuffId, 1, ctx.buffById, warnings);
  if (!g1.buff) return;
  const rawBuff1 = g1.buff;
  const override = ctx.overrides.resolveBuff(displaySkillId, baseBuffId) || ctx.overrides.resolveBuff(0, baseBuffId);
  growthBuffRefs.push({
    baseBuffId,
    name: rawBuff1.name || `buff${baseBuffId}`,
    text: rawBuff1.text || null,
    time: rawBuff1.time ?? null,
    bindSource,
    bindLabel: BIND_SOURCE_LABEL[bindSource] || bindSource,
    levelMode: g1.levelMode,
    override,
    label: `[laoshu buff ${baseBuffId} ${rawBuff1.name || ""}] `,
  });
  if (ctx.emitTemplate) ctx.overrides.recordBuff(displaySkillId, baseBuffId, rawBuff1, null);
}

function addBuffByGrowthMode(fixedBuffs, growthBuffRefs, seenBuffs, displaySkillId, baseBuffId, bindSource, ctx, warnings) {
  if (seenBuffs.has(baseBuffId)) return;
  const g1 = eng.resolveBuffGrowth(baseBuffId, 1, ctx.buffById, warnings);
  if (!g1.buff) return;
  if (g1.levelMode === "growth") {
    addGrowthBuffRef(growthBuffRefs, seenBuffs, displaySkillId, baseBuffId, bindSource, ctx, warnings);
  } else {
    seenBuffs.add(baseBuffId);
    pushFixedBuff(fixedBuffs, displaySkillId, baseBuffId, g1.buff, bindSource, ctx, warnings, null);
    if (ctx.emitTemplate) ctx.overrides.recordBuff(displaySkillId, baseBuffId, g1.buff, null);
  }
}

function pushTextEffect(out, baseBuffId, name, bindSource, displayText) {
  out.push({
    baseBuffId,
    name,
    text: null,
    time: -1,
    bindSource,
    bindLabel: BIND_SOURCE_LABEL[bindSource] || bindSource,
    value: null,
    displayText,
  });
}

function collectDarkPassive(displaySkillId, fixedBuffs, ctx, warnings) {
  const be = ctx.beskillById.get(PET_BESKILL.DARK_STEAL_PROP);
  if (!be) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${PET_BESKILL.DARK_STEAL_PROP} 缺失` });
  const attr = be?.attribute || {};
  const rate = typeof attr.rate === "number" ? `${round(attr.rate * 100)}%` : "—";
  const val = typeof attr.val === "number" ? `${round(attr.val * 100)}%` : "—";
  const leftSeconds = typeof attr.leftFrame === "number" ? `${round(attr.leftFrame / BATTLE_FRAMES_PER_SECOND)}s` : "—";
  const maxPiles = typeof attr.maxPiles === "number" ? attr.maxPiles : "—";
  pushTextEffect(
    fixedBuffs,
    PET_BESKILL.DARK_STEAL_PROP,
    be?.name || "窃取精通",
    "passiveEffect",
    `每次命中以${rate}概率窃取目标暴击/韧性并转为自身幸运；每层${val}，持续${leftSeconds}，最多${maxPiles}层。攻略文字写最高2层，当前数据为4层。`
  );
}

function collectMingPassive(displaySkillId, fixedBuffs, ctx, warnings) {
  const be = ctx.beskillById.get(PET_BESKILL.MING_VALUE_FLAG);
  if (!be) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${PET_BESKILL.MING_VALUE_FLAG} 缺失` });
  pushTextEffect(
    fixedBuffs,
    PET_BESKILL.MING_VALUE_FLAG,
    be?.name || "冥水战甲",
    "passiveEffect",
    "解锁冥水值：攻击命中会叠冥水值，攻略口径约每秒3%，约34s叠满。"
  );

  const vSkill = ctx.skillById.get(PET_SKILL.MING_PASSIVE_VSKILL);
  if (!vSkill) throw new Error(`skill ${PET_SKILL.MING_PASSIVE_VSKILL} 不存在，无法展示冥水冲击系数`);
  const row = ctx.skillLevelById.get(eng.skillLevelRowId(vSkill, 1));
  if (!row) throw new Error(`skill ${PET_SKILL.MING_PASSIVE_VSKILL} lv1 缺失，无法展示冥水冲击系数`);
  const per = requiredNumber(row.damageAddPer, `skill ${PET_SKILL.MING_PASSIVE_VSKILL} lv1 damageAddPer`);
  pushTextEffect(
    fixedBuffs,
    PET_SKILL.MING_PASSIVE_VSKILL,
    vSkill.desName || vSkill.Name || "冥水冲击",
    "passiveEffect",
    `冥水值满后瞬发冥水冲击；强攻，1段，系数 ${per} * atk。`
  );
}

function cloneMonsterIdsFromSp(pet, ctx, warnings) {
  const skill = ctx.skillById.get(PET_SKILL.MING_SP);
  if (!skill) return [];
  const ids = [];
  for (const monsterId of petMonsterIds(pet)) {
    const monster = ctx.monsterById.get(monsterId);
    const entityCfg = monster ? eng.loadEntityCfg(monster.cfgFile) : null;
    const actionCfg = entityCfg?.[skill.entityAction];
    if (!actionCfg) continue;
    for (const summon of (actionCfg.com || []).filter((com) => com.type === 13)) {
      for (const id of asArray(summon.mIds).filter(Boolean)) {
        if (!ids.includes(id)) ids.push(id);
      }
    }
  }
  if (!ids.length) warnings.push({ code: eng.WARN.MISSING_ACTION_CFG, detail: `skill ${PET_SKILL.MING_SP} 未解析到分身 monsterId` });
  return ids;
}

function skillListText(monster, ctx) {
  const ids = [].concat(monster?.atkIds || [], monster?.skillIds || []);
  return ids.map((id) => ctx.skillById.get(id)?.desName || ctx.skillById.get(id)?.Name || "技能").join("/") || "—";
}

function collectGuideEffects(displaySkillId, pet, ctx, warnings) {
  const out = [];

  if (displaySkillId === PET_SKILL.DARK_SKILL_1) {
    pushTextEffect(out, PET_SKILL.DARK_SKILL_1, "潜地突袭阶段", "guideEffect", "潜地位移后命中造成实际伤害，伤害按当前版本命中段统计。");
  }

  if (displaySkillId === PET_SKILL.DARK_SP) {
    pushTextEffect(out, PET_BUFF.DARK_SP_DAMAGE, "心魂终结命中成长", "guideEffect", "心魂终结的伤害来自命中后的成长效果，按命中成长数值展示。");
  }

  if (displaySkillId === PET_SKILL.MING_SKILL_1) {
    pushTextEffect(out, PET_SKILL.MING_SKILL_1, "潜地喷流阶段", "guideEffect", "潜地与位移本身不计入伤害，伤害按喷流命中段展示。");
  }

  if (displaySkillId === PET_SKILL.MING_SKILL_2) {
    pushTextEffect(out, PET_SKILL.MING_SKILL_2, "嗜血利爪阶段", "guideEffect", "嗜血利爪伤害按命中段展示，吸血上限按对应成长数值展示。");
  }

  if (displaySkillId === PET_SKILL.MING_SKILL_3) {
    pushTextEffect(out, PET_SKILL.MING_SKILL_3, "水涡旋击阶段", "guideEffect", "水涡旋击按12段命中展示。");
  }

  if (displaySkillId === PET_SKILL.MING_SP) {
    const cloneIds = cloneMonsterIdsFromSp(pet, ctx, warnings);
    const cloneRows = cloneIds.map((id) => ctx.monsterById.get(id)).filter(Boolean);
    const cloneSkills = cloneRows.map((m) => skillListText(m, ctx)).join("；") || "—";
    pushTextEffect(
      out,
      PET_SKILL.MING_SP,
      "暗流分身机制",
      "guideEffect",
      `召唤分身；分身存在15s，无敌且不会成为索敌目标；技能继承无双等级；可释放2次1技能、1次2技能、1次3技能、3次普攻；分身伤害降低75%，按25%收益展示。分身技能：${cloneSkills}`
    );
  }

  return out;
}

function collectBuffs(displaySkillId, concreteIds, pet, slotKind, ctx, warnings) {
  const fixedBuffs = [];
  const growthBuffRefs = [];
  const seenBuffs = new Set();

  if (slotKind !== "passive") {
    for (const skillId of concreteIds) {
      const skill = ctx.skillById.get(skillId);
      if (!skill || !skill.entityAction) continue;
      const cfg = resolvePetCfgFile(skill, pet, ctx, warnings);
      const refs = eng.scanBuffs(skill, cfg.actionCfg, ctx.beskillById, warnings);
      for (const ref of refs) addBuffByGrowthMode(fixedBuffs, growthBuffRefs, seenBuffs, displaySkillId, ref.baseBuffId, ref.bindSource, ctx, warnings);
    }
  }

  if (displaySkillId === PET_SKILL.DARK_SP) {
    addBuffByGrowthMode(fixedBuffs, growthBuffRefs, seenBuffs, displaySkillId, PET_BUFF.DARK_SP_DAMAGE, "bulletHitBuff", ctx, warnings);
    addBuffByGrowthMode(fixedBuffs, growthBuffRefs, seenBuffs, displaySkillId, PET_BUFF.DARK_SP_PET_BONUS, "mechanismEffect", ctx, warnings);
  }

  if (slotKind === "passive" && displaySkillId === PET_SKILL.DARK_PASSIVE) collectDarkPassive(displaySkillId, fixedBuffs, ctx, warnings);
  if (slotKind === "passive" && displaySkillId === PET_SKILL.MING_PASSIVE) collectMingPassive(displaySkillId, fixedBuffs, ctx, warnings);

  fixedBuffs.push(...collectGuideEffects(displaySkillId, pet, ctx, warnings));
  return { fixedBuffs, growthBuffRefs };
}

function makeEffectOnlyLevel(displaySkillId, level, ctx, warnings) {
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
    addDefendVal: row?.addDefendVal ?? null,
  };
}

function makePassiveLevel() {
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

function sourceDamageSummary(skillId, level, pet, ctx, warnings) {
  const skill = ctx.skillById.get(skillId);
  if (!skill) {
    warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `skill ${skillId} 不在 skill 表` });
    return null;
  }
  const row = ctx.skillLevelById.get(eng.skillLevelRowId(skill, level));
  if (!row) {
    warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `skill ${skillId} lv${level} 缺失` });
    return null;
  }
  const cfg = resolvePetCfgFile(skill, pet, ctx, warnings);
  return { skill, row, dmg: eng.computeDamageSegments(skill, row, cfg.actionCfg, warnings) };
}

function computeGuidePatchedLevel(displaySkillId, level, pet, ctx, warnings) {
  const def = GUIDE_DAMAGE_PATCHES.get(displaySkillId);
  const skill = ctx.skillById.get(displaySkillId);
  const row = skill ? ctx.skillLevelById.get(eng.skillLevelRowId(skill, level)) : null;
  if (!row) warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `skill ${displaySkillId} lv${level} 缺失` });

  if (def.kind === "guideActionBulletCap") {
    if (!eng.getBullet(def.bulletId, warnings)) throw new Error(`skill ${displaySkillId} 修正引用的 bullet ${def.bulletId} 不存在`);
    if (!row) return null;
    const segment = {
      per: requiredNumber(row.damageAddPer, `skill ${displaySkillId} lv${level} damageAddPer`),
      val: requiredNumber(row.damageAddVal, `skill ${displaySkillId} lv${level} damageAddVal`),
      maxHit: def.maxHit,
      from: def.source,
    };
    return {
      level,
      roleLevel: row.roleLevel ?? null,
      consumeMp: row.consumeMp ?? null,
      soulCost: row.soulCost ?? null,
      kind: def.kind,
      segments: [segment],
      totalPer: round(segment.per * segment.maxHit),
      totalVal: round(segment.val * segment.maxHit),
      addDefendVal: row.addDefendVal ?? null,
    };
  }

  if (def.kind === "guideBuffDamage") {
    if (!row) return null;
    const g = eng.resolveBuffGrowth(def.buffId, level, ctx.buffById, warnings);
    if (!g.buff) return null;
    const v = g.buff.value || {};
    const segment = {
      per: requiredNumber(v.atkPer, `buff ${g.effectiveBuffId} value.atkPer`),
      val: requiredNumber(v.atkVal, `buff ${g.effectiveBuffId} value.atkVal`),
      maxHit: 1,
      from: def.source,
    };
    return {
      level,
      roleLevel: row.roleLevel ?? null,
      consumeMp: row.consumeMp ?? null,
      soulCost: row.soulCost ?? null,
      kind: def.kind,
      segments: [segment],
      totalPer: segment.per,
      totalVal: segment.val,
      addDefendVal: row.addDefendVal ?? null,
    };
  }

  if (def.kind === "guideCloneContribution") {
    if (!row) return null;
    const attack = sourceDamageSummary(PET_SKILL.MING_ATTACK, 1, pet, ctx, warnings);
    const s1 = sourceDamageSummary(PET_SKILL.MING_SKILL_1_HIT, level, pet, ctx, warnings);
    const s2 = sourceDamageSummary(PET_SKILL.MING_SKILL_2_HIT, level, pet, ctx, warnings);
    const s3 = sourceDamageSummary(PET_SKILL.MING_SKILL_3_HIT, level, pet, ctx, warnings);
    if (!attack || !s1 || !s2 || !s3) return null;
    const totalPer = round((s1.dmg.totalPer * 2 + s2.dmg.totalPer + s3.dmg.totalPer + attack.dmg.totalPer * 3) * CLONE_DAMAGE_FACTOR);
    const totalVal = round((s1.dmg.totalVal * 2 + s2.dmg.totalVal + s3.dmg.totalVal) * CLONE_DAMAGE_FACTOR);
    return {
      level,
      roleLevel: row.roleLevel ?? null,
      consumeMp: row.consumeMp ?? null,
      soulCost: row.soulCost ?? null,
      kind: def.kind,
      segments: [{ per: totalPer, val: totalVal, maxHit: 1, from: def.source }],
      totalPer,
      totalVal,
      addDefendVal: row.addDefendVal ?? null,
    };
  }

  throw new Error(`skill ${displaySkillId} 未知伤害修正类型 ${def.kind}`);
}

function computePetLevel(displaySkillId, concreteIds, level, pet, slotKind, ctx, warnings) {
  if (slotKind === "passive") return makePassiveLevel();
  if (GUIDE_DAMAGE_PATCHES.has(displaySkillId)) return computeGuidePatchedLevel(displaySkillId, level, pet, ctx, warnings);
  if (EFFECT_ONLY_SKILLS.has(displaySkillId)) return makeEffectOnlyLevel(displaySkillId, level, ctx, warnings);

  let mergedSegments = [];
  let mergedKind = null;
  let firstRow = null;

  for (const skillId of concreteIds) {
    const skill = ctx.skillById.get(skillId);
    if (!skill) {
      warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `伤害技能 ${skillId} 不在 skill 表` });
      continue;
    }
    const row = ctx.skillLevelById.get(eng.skillLevelRowId(skill, level));
    if (!row) {
      warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `skill ${skill.id} lv${level} 缺失` });
      continue;
    }
    if (!firstRow) firstRow = row;

    const cfg = resolvePetCfgFile(skill, pet, ctx, warnings);
    const dmg = eng.computeDamageSegments(skill, row, cfg.actionCfg, warnings);
    if (dmg.segments && dmg.segments.length) {
      mergedSegments.push(...dmg.segments);
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

function cloneNode(label, source, per, uses) {
  return { label, source, per, hits: uses, totalPer: round(per * uses) };
}

function cloneChainViz(pet, ctx, warnings, level) {
  const attack = sourceDamageSummary(PET_SKILL.MING_ATTACK, 1, pet, ctx, warnings);
  const s1 = sourceDamageSummary(PET_SKILL.MING_SKILL_1_HIT, level, pet, ctx, warnings);
  const s2 = sourceDamageSummary(PET_SKILL.MING_SKILL_2_HIT, level, pet, ctx, warnings);
  const s3 = sourceDamageSummary(PET_SKILL.MING_SKILL_3_HIT, level, pet, ctx, warnings);
  if (!attack || !s1 || !s2 || !s3) return null;
  const rawNodes = [
    cloneNode("潜地喷流×2", String(PET_SKILL.MING_SKILL_1_HIT), s1.dmg.totalPer, 2),
    cloneNode("嗜血利爪×1", String(PET_SKILL.MING_SKILL_2_HIT), s2.dmg.totalPer, 1),
    cloneNode("水涡旋击×1", String(PET_SKILL.MING_SKILL_3_HIT), s3.dmg.totalPer, 1),
    cloneNode("普攻×3", String(PET_SKILL.MING_ATTACK), attack.dmg.totalPer, 3),
  ];
  const rawTotal = round(rawNodes.reduce((sum, node) => sum + node.totalPer, 0));
  const totalUses = rawNodes.reduce((sum, node) => sum + node.hits, 0);
  const finalTotal = round(rawTotal * CLONE_DAMAGE_FACTOR);
  return {
    kind: "cloneContribution",
    title: "暗流分身收益拆解",
    source: "guide:laoshuWiki:分身输出组合乘25%",
    lanes: [
      {
        label: "分身原始组合",
        role: "rawClone",
        totalHits: totalUses,
        totalPer: rawTotal,
        nodes: rawNodes,
      },
      {
        label: "25%折算收益",
        role: "finalClone",
        totalHits: 1,
        totalPer: finalTotal,
        nodes: [
          { label: "伤害降低75%", source: "攻略折算25%收益", per: finalTotal, hits: 1, totalPer: finalTotal },
        ],
      },
    ],
  };
}

function buildSkillCard(displaySkillId, pet, slotLabel, slotKind, ctx) {
  const warnings = [];
  const skill = ctx.skillById.get(displaySkillId);
  if (!skill) {
    return { skillId: displaySkillId, name: `技能${displaySkillId}`, error: "skill 不存在", warnings: [{ code: eng.WARN.MISSING_SKILL }] };
  }

  const concreteIds = resolvePetConcreteSkills(displaySkillId, ctx, warnings);
  const cfg = slotKind === "passive"
    ? { cfgFileResolved: null, cfgResolveSource: "passive", hasActionCfg: false, actionCfg: null, entityCfg: null }
    : resolvePetCfgFile(skill, pet, ctx, warnings);
  const maxLevel = detectDisplayMaxLevel(displaySkillId, concreteIds, slotKind, ctx);
  const rel = slotKind === "passive"
    ? { releaseFrames: null, releaseSeconds: null, releaseTimeSource: "effectOnly" }
    : resolvePetReleaseTime(displaySkillId, cfg, skill, warnings);
  const { fixedBuffs, growthBuffRefs } = collectBuffs(displaySkillId, concreteIds, pet, slotKind, ctx, warnings);

  const levels = [];
  for (let lv = 1; lv <= maxLevel; lv++) {
    const l = computePetLevel(displaySkillId, concreteIds, lv, pet, slotKind, ctx, warnings);
    if (!l) continue;
    l.growthBuffs = growthBuffRefs.map((ref) => {
      const g = eng.resolveBuffGrowth(ref.baseBuffId, lv, ctx.buffById, warnings);
      const rawBuffG = g.buff;
      const engBuff = {
        baseBuffId: ref.baseBuffId,
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
      addDefendVal: reference?.addDefendVal ?? skill.addDefendVal ?? null,
      cfgFileResolved: cfg.cfgFileResolved,
      cfgResolveSource: cfg.cfgResolveSource,
      referenceLevel: reference?.level ?? null,
      fixedBuffs,
      chainViz: displaySkillId === PET_SKILL.MING_SP ? cloneChainViz(pet, ctx, warnings, reference?.level || maxLevel) : null,
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
  console.log("\n🐭 宠物技能 Wiki → 暗夜鼠王/冥甲鼠王");

  const ctx = {
    petById: idx(u.loadTable("pet")),
    skillById: idx(u.loadTable("skill")),
    skillLevelById: idx(u.loadTable("skillLevel")),
    monsterById: idx(u.loadTable("monster")),
    buffById: idx(u.loadTable("buff")),
    beskillById: idx(u.loadTable("beskill")),
    overrides: ov.loadOverrides(PET_OVERRIDE),
    emitTemplate: EMIT_TEMPLATE,
  };
  ctx.metricDefs = [...DEFAULT_METRICS, ...ctx.overrides.getMetrics()];
  ctx.helpers = {
    buffValue: (baseBuffId, valuePath, level) => {
      const g = eng.resolveBuffGrowth(Number(baseBuffId), level, ctx.buffById, []);
      if (!g.buff) return null;
      const v = ov.getPath(g.buff, valuePath);
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
      key: "laoshu",
      name: "暗夜鼠王/冥甲鼠王",
      guidePath: GUIDE_PATH,
      petIds: PET_IDS,
      note: "宠物技能 Wiki 使用满级作为卡片表头参考值，逐级成长见下方成长数值表；潜地、嗜血、水涡等技能按实际命中阶段展示，心魂终结按命中成长展示，暗流分身按攻略组合收益展示。",
    },
    variants,
  };

  u.saveOutput("pet_wiki_laoshu", payload, {
    system: "pet_wiki",
    sourceFiles: ["pet.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "beskill.*.json", "buff.*.json", "bullets.json", "entityCtg/*.json", GUIDE_PATH],
    note: "暗夜鼠王/冥甲鼠王宠物技能 Wiki，包括普攻、主动技能、无双、被动、潜行暴击、心魂终结命中 buff、嗜血吸血、暗流分身与冥水战甲机制。",
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
