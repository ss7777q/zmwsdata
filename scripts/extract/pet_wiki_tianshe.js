/**
 * 宠物技能 Wiki - 天蛇元君提取脚本
 *
 * 宠物入口从 pet.skillActive/skillPassive/skillSp 和 pet.monsterId 取展示技能；
 * 普攻从宠物 monster.atkIds 取。伤害、释放时间、buff 成长继续走 skill ->
 * skillLevel -> entityCtg/bullets -> buff/beskill 的链路。
 *
 * 天蛇元君的关键特殊口径：
 * - 普攻 action 有一个表现 bullet 和一个伤害 bullet，攻略按 1 段 3.6 展示；
 * - 玄霄雾隐表内 damageAddVal 为 1，攻略明确总固伤倍率为 0；
 * - 敕鳞神罚展示技本身 per=0，真实伤害在 vskill3_1，表内 per=0.36，攻略按 0.3 × 8 展示；
 * - 流云缚域 action 有多枚表现/区域 bullet，攻略按 1 段 5*atk + 17X 展示；
 * - 云螣啸渊只取 bullet 400025 的 3 连击伤害，其余 bullet 是牵引/表现段。
 */
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");

const PET_OVERRIDE = "tianshe";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const BATTLE_FRAMES_PER_SECOND = 30;
const GUIDE_PATH = "D:/zmws/保存网页资源/4399_Threads_Download/【结弦】神兽技能详解_64312445/content.md";
const PET_IDS = [190000173];

const PET_SKILL = {
  ATTACK: 20418020001,
  SKILL_1: 20418020101,
  SKILL_2: 20418020201,
  SKILL_3: 20418020301,
  SKILL_3_HIT: 20418020302,
  SKILL_4: 20418020401,
  SP: 20418020501,
  PASSIVE_FLY: 20418020602,
  PASSIVE_CLOUD_TOKEN: 20418020701,
};

const PET_BUFF = {
  FLY_DAMAGE_TAKEN: 14015301,
  FOG_DODGE: 8007101,
  FOG_PULL_IMMUNE: 25000501,
  CLOUD_FIELD_HIGH_SPEED_FORBID: 243001401,
  CLOUD_FIELD_BIND: 26005701,
  CLOUD_FIELD_SLOW: 4064011,
  SP_FEAR: 102001301,
  SP_FEAR_SLOW: 4068401,
  CLOUD_TOKEN_STACK: 125001001,
  CLOUD_TOKEN_READY: 125001101,
  CLOUD_TOKEN_DAMAGE_UP: 17005901,
  SKILL_3_LOWEST_HP_MARK: 62003601,
};

const PET_BESKILL = {
  FLY: 7075602,
  CLOUD_TOKEN_CHARGE: 7075701,
  CLOUD_TOKEN_READY: 7075801,
  CLOUD_TOKEN_SHIELD_DAMAGE: 7075901,
};

const SPECIAL_CONCRETE_SKILLS = new Map([
  [PET_SKILL.SKILL_3, [PET_SKILL.SKILL_3, PET_SKILL.SKILL_3_HIT]],
]);

const GUIDE_DAMAGE_PATCHES = new Map([
  [PET_SKILL.ATTACK, {
    sourceSkillId: PET_SKILL.ATTACK,
    hits: 1,
    kind: "guideSingleHit",
    source: "guide:shenshouWiki:天蛇普攻按1段3.6*atk展示",
  }],
  [PET_SKILL.SKILL_2, {
    sourceSkillId: PET_SKILL.SKILL_2,
    hits: 1,
    perOverride: 4.2,
    valOverride: 0,
    kind: "guideSingleHit",
    source: "guide:shenshouWiki:玄霄雾隐按4.2*atk且总固伤倍率0展示",
  }],
  [PET_SKILL.SKILL_3, {
    sourceSkillId: PET_SKILL.SKILL_3_HIT,
    hits: 8,
    perOverride: 0.3,
    kind: "guideVirtualHit",
    source: "guide:shenshouWiki:敕鳞神罚按vskill3_1的0.3*atk八连击展示",
  }],
  [PET_SKILL.SKILL_4, {
    sourceSkillId: PET_SKILL.SKILL_4,
    hits: 1,
    kind: "guideSingleHit",
    source: "guide:shenshouWiki:流云缚域按1段5*atk+17X展示",
  }],
  [PET_SKILL.SP, {
    sourceSkillId: PET_SKILL.SP,
    bulletIndex: 2,
    expectedBulletId: 400025,
    hits: 3,
    kind: "guideBulletMultiHit",
    source: "guide:shenshouWiki:云螣啸渊只按bullet400025的2.0667*atk三连击展示",
  }],
]);

function guideRelease(seconds, source) {
  return { frames: Math.round(seconds * BATTLE_FRAMES_PER_SECOND), source };
}

const GUIDE_RELEASE_FRAMES = new Map([
  [PET_SKILL.ATTACK, guideRelease(1.233, "guide:shenshouWiki:天蛇普攻释放1.233s")],
  [PET_SKILL.SKILL_1, guideRelease(1.633, "guide:shenshouWiki:云舞刃释放1.633s")],
  [PET_SKILL.SKILL_2, guideRelease(1.8, "guide:shenshouWiki:玄霄雾隐释放1.8s")],
  [PET_SKILL.SKILL_3, guideRelease(1.9, "guide:shenshouWiki:敕鳞神罚释放1.9s")],
  [PET_SKILL.SKILL_4, guideRelease(2.1, "guide:shenshouWiki:流云缚域释放2.1s")],
  [PET_SKILL.SP, guideRelease(2.1, "guide:shenshouWiki:云螣啸渊释放2.1s")],
]);

const GUIDE_CD_SECONDS = new Map([
  [PET_SKILL.SKILL_1, 14],
  [PET_SKILL.SKILL_2, 20],
  [PET_SKILL.SKILL_3, 16],
  [PET_SKILL.SKILL_4, 17],
  [PET_SKILL.SP, 30],
]);

const IGNORED_SCANNED_BUFFS = new Set([
  PET_BUFF.CLOUD_TOKEN_READY,
  PET_BUFF.SKILL_3_LOWEST_HP_MARK,
]);

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
  if (v && typeof v === "object") {
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
  const ids = patch ? [patch.sourceSkillId] : concreteIds;
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
  const { merged, warnings: w } = ov.mergeBuff(engineBuff, override, rawBuff, `[tianshe buff ${baseBuffId} ${engineBuff.name}] `);
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
    label: `[tianshe buff ${baseBuffId} ${rawBuff1.name || ""}] `,
  });
  if (ctx.emitTemplate) ctx.overrides.recordBuff(displaySkillId, baseBuffId, rawBuff1, null);
}

function addBuffByGrowthMode(fixedBuffs, growthBuffRefs, seenBuffs, displaySkillId, baseBuffId, bindSource, ctx, warnings) {
  if (seenBuffs.has(baseBuffId) || IGNORED_SCANNED_BUFFS.has(baseBuffId)) return;
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

function collectFlyPassive(displaySkillId, fixedBuffs, ctx, warnings) {
  const be = ctx.beskillById.get(PET_BESKILL.FLY);
  if (!be) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${PET_BESKILL.FLY} 缺失` });
  const attr = be?.attribute || {};
  const flyReplaceAction = attr.flyReplaceAction ?? null;
  if (flyReplaceAction == null) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${PET_BESKILL.FLY} 缺少 flyReplaceAction` });
  for (const buffId of asArray(attr.buffs)) {
    pushFixedBuff(fixedBuffs, displaySkillId, buffId, ctx.buffById.get(buffId), "passiveEffect", ctx, warnings, null);
  }
}

function collectCloudTokenPassive(displaySkillId, fixedBuffs, ctx, warnings) {
  const chargeBe = ctx.beskillById.get(PET_BESKILL.CLOUD_TOKEN_CHARGE);
  const readyBe = ctx.beskillById.get(PET_BESKILL.CLOUD_TOKEN_READY);
  const shieldBe = ctx.beskillById.get(PET_BESKILL.CLOUD_TOKEN_SHIELD_DAMAGE);
  if (!chargeBe) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${PET_BESKILL.CLOUD_TOKEN_CHARGE} 缺失` });
  if (!readyBe) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${PET_BESKILL.CLOUD_TOKEN_READY} 缺失` });
  if (!shieldBe) warnings.push({ code: eng.WARN.MISSING_BESKILL, detail: `beskill ${PET_BESKILL.CLOUD_TOKEN_SHIELD_DAMAGE} 缺失` });

  pushTextEffect(
    fixedBuffs,
    PET_BESKILL.CLOUD_TOKEN_CHARGE,
    chargeBe?.name || "行云成令",
    "passiveEffect",
    "攻略口径：每约14.5s获得1枚行云令，开局1枚；使用技能消耗1枚，可用令上限1个"
  );
  pushFixedBuff(fixedBuffs, displaySkillId, PET_BUFF.CLOUD_TOKEN_STACK, ctx.buffById.get(PET_BUFF.CLOUD_TOKEN_STACK), "passiveEffect", ctx, warnings, null);
  pushFixedBuff(fixedBuffs, displaySkillId, PET_BUFF.CLOUD_TOKEN_READY, ctx.buffById.get(PET_BUFF.CLOUD_TOKEN_READY), "passiveEffect", ctx, warnings, null);
  pushFixedBuff(fixedBuffs, displaySkillId, PET_BUFF.CLOUD_TOKEN_DAMAGE_UP, ctx.buffById.get(PET_BUFF.CLOUD_TOKEN_DAMAGE_UP), "passiveEffect", ctx, warnings, null);
  pushTextEffect(
    fixedBuffs,
    PET_BESKILL.CLOUD_TOKEN_SHIELD_DAMAGE,
    shieldBe?.name || "行云成令-破盾增益",
    "passiveEffect",
    "消耗行云令后，对拥有生命护盾的单位额外提高15%伤害"
  );
}

function collectGuideEffects(displaySkillId, fixedBuffs, ctx, warnings) {
  if (displaySkillId === PET_SKILL.SKILL_2) {
    pushTextEffect(
      fixedBuffs,
      PET_SKILL.SKILL_2,
      "玄霄雾隐额外效果",
      "guideEffect",
      "技能释放第1s后，周身友军获得雾隐：闪避提升约1.23X、免疫牵引，并概率抵抗中毒/灼烧/流血/流沙等持续伤害，持续6.2s"
    );
    pushFixedBuff(fixedBuffs, displaySkillId, PET_BUFF.FOG_PULL_IMMUNE, ctx.buffById.get(PET_BUFF.FOG_PULL_IMMUNE), "guideEffect", ctx, warnings, null);
  }

  if (displaySkillId === PET_SKILL.SKILL_3) {
    pushTextEffect(
      fixedBuffs,
      PET_SKILL.SKILL_3,
      "敕鳞神罚锁定",
      "guideEffect",
      "锁定敌方血量最少单位；伤害按8连击展示，攻略口径为每段0.3*atk"
    );
  }

  if (displaySkillId === PET_SKILL.SKILL_4) {
    pushTextEffect(
      fixedBuffs,
      PET_SKILL.SKILL_4,
      "流云区域",
      "guideEffect",
      "命中目标后生成流云区域，区域存在5.6s；进入区域的敌人减速50%并禁止高速位移1s，触发高速位移时禁足1s，可多次触发"
    );
    pushFixedBuff(fixedBuffs, displaySkillId, PET_BUFF.CLOUD_FIELD_BIND, ctx.buffById.get(PET_BUFF.CLOUD_FIELD_BIND), "guideEffect", ctx, warnings, null);
    pushFixedBuff(fixedBuffs, displaySkillId, PET_BUFF.CLOUD_FIELD_SLOW, ctx.buffById.get(PET_BUFF.CLOUD_FIELD_SLOW), "guideEffect", ctx, warnings, null);
  }

  if (displaySkillId === PET_SKILL.SP) {
    pushTextEffect(
      fixedBuffs,
      PET_SKILL.SP,
      "云螣啸渊状态",
      "guideEffect",
      "初始冷却28s；使用期间保持超级霸体；命中造成2.5s恐惧，使敌人无法控制自身并远离螣蛇移动"
    );
    pushFixedBuff(fixedBuffs, displaySkillId, PET_BUFF.SP_FEAR_SLOW, ctx.buffById.get(PET_BUFF.SP_FEAR_SLOW), "guideEffect", ctx, warnings, null);
  }
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

  if (slotKind === "passive" && displaySkillId === PET_SKILL.PASSIVE_FLY) collectFlyPassive(displaySkillId, fixedBuffs, ctx, warnings);
  if (slotKind === "passive" && displaySkillId === PET_SKILL.PASSIVE_CLOUD_TOKEN) collectCloudTokenPassive(displaySkillId, fixedBuffs, ctx, warnings);

  collectGuideEffects(displaySkillId, fixedBuffs, ctx, warnings);
  return { fixedBuffs, growthBuffRefs };
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

function firstNumber(value) {
  if (Array.isArray(value)) return firstNumber(value[0]);
  return typeof value === "number" ? value : null;
}

function countDamageHitsFromBullet(bulletId, warnings) {
  const bullet = eng.getBullet(bulletId, warnings);
  if (!bullet) return null;
  const coms = eng.damageComs(bullet);
  let hits = 0;
  for (const com of coms) hits += com.maxHit || 1;
  return hits || null;
}

function computeGuidePatchedLevel(displaySkillId, level, ctx, warnings) {
  const def = GUIDE_DAMAGE_PATCHES.get(displaySkillId);
  const skill = ctx.skillById.get(def.sourceSkillId);
  const row = skill ? ctx.skillLevelById.get(eng.skillLevelRowId(skill, level)) : null;
  if (!skill) warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `skill ${def.sourceSkillId} 不在 skill 表` });
  if (!row) {
    warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `skill ${def.sourceSkillId} lv${level} 缺失` });
    return null;
  }

  let per = row.damageAddPer ?? 0;
  let val = row.damageAddVal ?? 0;
  let hits = def.hits;
  let from = def.source;

  if (def.bulletIndex != null) {
    const bulletId = row.bullet?.[def.bulletIndex];
    if (bulletId == null) warnings.push({ code: eng.WARN.MISSING_BULLET, detail: `skill ${def.sourceSkillId} lv${level} 缺少 bullet[${def.bulletIndex}]` });
    if (def.expectedBulletId != null && bulletId !== def.expectedBulletId) {
      warnings.push({ code: eng.WARN.MISSING_BULLET, detail: `skill ${def.sourceSkillId} lv${level} bullet[${def.bulletIndex}]=${bulletId}, 预期 ${def.expectedBulletId}` });
    }
    if (bulletId != null) {
      const bulletHits = countDamageHitsFromBullet(bulletId, warnings);
      if (bulletHits != null && bulletHits !== def.hits) {
        warnings.push({ code: eng.WARN.MISSING_BULLET, detail: `bullet ${bulletId} 伤害段数=${bulletHits}, 攻略预期 ${def.hits}` });
      }
      from = `${def.source}; bullet:${bulletId}`;
    }
    per = firstNumber(row.bulletDamageAddPer?.[def.bulletIndex]) ?? 0;
    val = firstNumber(row.bulletDamageAddVal?.[def.bulletIndex]) ?? 0;
  }

  if (def.perOverride != null) per = def.perOverride;
  if (def.valOverride != null) val = def.valOverride;

  const segment = { per, val, maxHit: hits, from };
  return {
    level,
    roleLevel: row.roleLevel ?? null,
    consumeMp: row.consumeMp ?? null,
    soulCost: row.soulCost ?? null,
    kind: def.kind,
    segments: [segment],
    totalPer: round((segment.per || 0) * hits),
    totalVal: round((segment.val || 0) * hits),
    addDefendVal: row.addDefendVal ?? null,
  };
}

function computePetLevel(displaySkillId, concreteIds, level, pet, slotKind, ctx, warnings) {
  if (slotKind === "passive") return makePassiveLevel();
  if (GUIDE_DAMAGE_PATCHES.has(displaySkillId)) return computeGuidePatchedLevel(displaySkillId, level, ctx, warnings);

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
  console.log("\n🐍 宠物技能 Wiki → 天蛇元君");

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
      key: "tianshe",
      name: "天蛇元君",
      guidePath: GUIDE_PATH,
      petIds: PET_IDS,
      note: "宠物技能 Wiki 使用满级作为卡片表头参考值，逐级成长见下方成长数值表；普攻、玄霄雾隐、敕鳞神罚、流云缚域和云螣啸渊均按攻略口径修正展示。",
    },
    variants,
  };

  u.saveOutput("pet_wiki_tianshe", payload, {
    system: "pet_wiki",
    sourceFiles: ["pet.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "beskill.*.json", "buff.*.json", "bullets.json", "entityCtg/*.json", GUIDE_PATH],
    note: "天蛇元君宠物技能 Wiki，包括普攻、主动技能、无双、螣云驾雾、行云成令、雾隐抵抗、流云区域和恐惧效果。",
  });

  for (const v of variants) {
    console.log(`  ${v.pet.name}(${v.pet.id}) cfg=${v.pet.cfgFile}`);
    for (const s of v.slots) {
      const b = s.base;
      const atkConv = b.levels?.[b.levels.length - 1]?.metrics?.find((m) => m.key === "atkConv")?.display ?? "-";
      console.log(`    ${s.slotLabel} ${b.name}(${b.skillId}): ${b.header.kind} ${b.header.segCount}段 per=${b.header.totalPer ?? "-"} 帧=${b.header.releaseFrames ?? "-"} maxLv=${b.maxLevel} 攻转=${atkConv}${b.warnings.length ? " ⚠" + b.warnings.length : ""}`);
    }
  }
}

if (require.main === module) extract();
module.exports = extract;
