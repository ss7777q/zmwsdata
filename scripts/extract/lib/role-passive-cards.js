const u = require("../../lib/utils");
const fs = require("fs");
const path = require("path");

const BIND_LABEL = "被动效果";
const BATTLE_FRAMES_PER_SECOND = 30;
const PI_MO_XUAN_ZHEN_SKILL_ID = 1001200;
const AOLIE_YIN_LIGHTNING_SKILL_ID = 6001081;
const AOLIE_YIN_LIGHTNING_DAMAGE_SKILL_ID = 6001082;
const XUANNV_BAMEN_CHARGE_BUFF_ID = 136020501;
const XUANNV_BAMEN_VSKILL_IDS = [9001067, 9001068, 9001069];
const XUANNV_LINGZHEN_BUFF_ID = 136021601;
const XUANNV_LINGZHEN_SPEED_BUFF_ID = 295000701;
const XUANNV_FIELD_SKILL_IDS = [9001060, 9001061, 9001066];
const XUANNV_ROLE_ID = 9;
const XUANNV_LINGZHEN_ACTION_SIGN = 11;
const BUFF_TYPE_BREAK = 70;
const BUFF_TYPE_BREAK_FROM_ATK = 298;
const BUFF_TYPE_SKILL_SPEED = 295;

function cloneSimple(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function idx(rows) {
  const map = new Map();
  for (const row of rows) map.set(row.id, row);
  return map;
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function cleanPassiveName(name) {
  return String(name || "").replace(/2$/, "").trim();
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function collectNumbers(value, out = []) {
  if (typeof value === "number" && Number.isInteger(value)) {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectNumbers(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectNumbers(item, out);
  }
  return out;
}

function summarizeValue(value) {
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return value;
  return cloneSimple(value);
}

function round(n, digits = 3) {
  const unit = 10 ** digits;
  return Math.round(n * unit) / unit;
}

function pct(n) {
  return `${round(n * 100, 3)}%`;
}

function pctValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? pct(value) : "配置缺失";
}

function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${value}` : "配置缺失";
}

function reciprocalValue(value) {
  return typeof value === "number" && Number.isFinite(value) && value !== 0 ? `${round(1 / value, 3)}` : "配置缺失";
}

function frames(n) {
  return `${n}帧`;
}

function secondsFromFrames(n) {
  return `${round(n / BATTLE_FRAMES_PER_SECOND, 3)}秒`;
}

function signedPct(n) {
  if (typeof n !== "number") return null;
  const text = pct(Math.abs(n));
  return n > 0 ? `+${text}` : `-${text}`;
}

function buffByLevel(ctx, baseId, level) {
  if (typeof baseId !== "number") return null;
  const offset = Math.max((level || 1) - 1, 0);
  return ctx.buffById.get(baseId + offset) || ctx.buffById.get(baseId) || null;
}

function readVirtualSkillAction(ctx, skillId, warnings) {
  const skill = ctx.skillById && ctx.skillById.get(skillId);
  if (!skill) {
    warnings.push({ code: "MISSING_VIRTUAL_SKILL", detail: `虚拟技 ${skillId} 缺失` });
    return null;
  }
  const monsters = ctx.monsterById ? [...ctx.monsterById.values()] : [];
  const owner = monsters.find((monster) => idList(monster.vSkill).includes(skillId));
  if (!owner?.cfgFile) {
    warnings.push({ code: "MISSING_VIRTUAL_SKILL_OWNER", detail: `虚拟技 ${skillId} 找不到所属实体配置` });
    return null;
  }
  const file = path.join(u.ROOT, "file", "battle-config", "entityCtg", `${owner.cfgFile}.json`);
  if (!fs.existsSync(file)) {
    warnings.push({ code: "MISSING_ENTITY_CTG", detail: `虚拟技 ${skillId} 的实体动作文件不存在: ${file}` });
    return null;
  }
  const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  const action = cfg[skill.entityAction];
  if (!action?.com) {
    warnings.push({ code: "MISSING_ENTITY_ACTION", detail: `虚拟技 ${skillId} 找不到动作 ${skill.entityAction}` });
    return null;
  }
  return { skill, owner, action, file };
}

function bulletById(ctx, id, warnings) {
  if (!ctx.bulletById) {
    const file = path.join(u.ROOT, "file", "battle-config", "bullets.json");
    if (!fs.existsSync(file)) {
      warnings.push({ code: "MISSING_BULLETS_JSON", detail: `战斗子弹配置不存在: ${file}` });
      ctx.bulletById = new Map();
    } else {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      const rows = Array.isArray(raw) ? raw : Object.values(raw);
      ctx.bulletById = idx(rows.filter(Boolean));
    }
  }
  const bullet = ctx.bulletById.get(id);
  if (!bullet) warnings.push({ code: "MISSING_BULLET", detail: `子弹 ${id} 缺失` });
  return bullet || null;
}

function actionBuffRows(ctx, action, level) {
  const rows = [];
  for (const com of action?.com || []) {
    if (com?.type !== 18) continue;
    for (const id of idList(com.buff)) {
      const buff = buffByLevel(ctx, id, level);
      if (buff) rows.push({ com, buff });
    }
  }
  return rows;
}

function uniqueNumbers(values) {
  return [...new Set(values.filter((value) => typeof value === "number").map((value) => round(value, 6)))];
}

function leveledActionBuffPer(rows, type, label, warnings, level) {
  const values = uniqueNumbers(rows.filter((row) => row.buff.type === type).map((row) => extractedBuffValue(row.buff).per));
  if (!values.length) {
    warnings.push({ code: "MISSING_BIMOXUANZHEN_BUFF_VALUE", detail: `辟魔玄阵 Lv.${level} 缺少${label}数值` });
    return null;
  }
  if (values.length > 1) {
    warnings.push({ code: "AMBIGUOUS_BIMOXUANZHEN_BUFF_VALUE", detail: `辟魔玄阵 Lv.${level} 的${label}数值不唯一: ${values.join(",")}` });
    return null;
  }
  return values[0];
}

function releaseTriggerName(be) {
  const name = `${be?.name || ""}`;
  if (/定海神针/.test(name)) return "定海神针";
  if (/火魔斩/.test(name)) return "火魔斩";
  return "火魔斩或定海神针";
}

function describeNuYanRelease(be, ctx, warnings) {
  const a = be.attribute || {};
  const read = ctx.beskillById && ctx.beskillById.get(a.readBeskillId);
  const triggerVal = read?.attribute?.triggerVal;
  if (typeof triggerVal !== "number") {
    warnings.push({ code: "MISSING_NUYAN_TRIGGER", detail: `passive beskill ${be.id} 缺少 readBeskillId=${a.readBeskillId} 的触发值` });
    return `消耗已积累的怒焰释放额外技能；每1点怒焰提供${pct(a.atkPer)}攻击伤害和${pct(a.breakPer)}穿透。`;
  }
  const atk = Math.floor(triggerVal * a.atkPer * 1e6) / 1e6;
  const brk = Math.floor(triggerVal * a.breakPer * 1e6) / 1e6;
  return `怒焰达到${triggerVal}后，${releaseTriggerName(be)}会触发【天降怒火】：造成攻击${pct(atk)}的额外伤害，并附带${pct(brk)}穿透。`;
}

function describeBiMoXuanZhen(ctx, level, warnings) {
  const resolved = readVirtualSkillAction(ctx, PI_MO_XUAN_ZHEN_SKILL_ID, warnings);
  if (!resolved) return [];
  const rows = actionBuffRows(ctx, resolved.action, level);
  const atkPer = leveledActionBuffPer(rows, 5, "攻击提升", warnings, level);
  const selfDefPer = leveledActionBuffPer(rows, 6, "阵主防御提升", warnings, level);
  const dodgePer = leveledActionBuffPer(rows, 60, "最终闪避提升", warnings, level);
  const hasInvisible = rows.some((row) => row.buff.type === 116);
  if (!hasInvisible) warnings.push({ code: "MISSING_BIMOXUANZHEN_INVISIBLE", detail: `辟魔玄阵 Lv.${level} 缺少隐身状态` });
  if ([atkPer, selfDefPer, dodgePer].some((value) => typeof value !== "number") || !hasInvisible) return [];
  return [
    metric("阵法加成", `阵内友军攻击提高${pct(atkPer)}；悟空本人额外获得防御提高${pct(selfDefPer)}。`),
    metric("隐身与闪避", `阵内友军处于非攻击、非施法状态时会进入隐身；隐身后最终闪避提高${pct(dodgePer)}。悟空本人不获得这条隐身和闪避效果。`),
    metric("中断规则", "友军开始攻击、释放技能或受到攻击时，隐身会被取消；继续留在阵内并再次满足非攻击状态后可重新进入隐身。"),
  ];
}

function findSkillLevel(ctx, skillId, level) {
  const levelId = skillId * 1000 + level;
  if (ctx.skillLevelById?.has(levelId)) return ctx.skillLevelById.get(levelId);
  return null;
}

function requireNumber(value, warnings, code, detail) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  warnings.push({ code, detail });
  return null;
}

function describeAolieYinLightning(be, ctx, warnings) {
  const a = be.attribute || {};
  const level = a.useLv || be.passiveLevel || 1;
  const skillLevel = findSkillLevel(ctx, AOLIE_YIN_LIGHTNING_DAMAGE_SKILL_ID, level);
  if (!skillLevel) {
    warnings.push({ code: "MISSING_AOLIE_YIN_LIGHTNING_LEVEL", detail: `敖烈阴电阳雷 Lv.${level} 缺少技能等级 ${AOLIE_YIN_LIGHTNING_DAMAGE_SKILL_ID}` });
    return [];
  }
  const rate = requireNumber(be.rate, warnings, "MISSING_AOLIE_YIN_LIGHTNING_RATE", `敖烈阴电阳雷 Lv.${level} 缺少触发概率 rate`);
  const damageAddPer = requireNumber(skillLevel.damageAddPer, warnings, "MISSING_AOLIE_YIN_LIGHTNING_DAMAGE", `敖烈阴电阳雷 Lv.${level} 缺少落雷伤害 damageAddPer`);
  const addDefendVal = requireNumber(skillLevel.addDefendVal, warnings, "MISSING_AOLIE_YIN_LIGHTNING_ADD_DEFEND_VAL", `敖烈阴电阳雷 Lv.${level} 缺少保护分 addDefendVal`);
  if ([rate, damageAddPer, addDefendVal].some((value) => value == null)) return [];
  const trigger = pct(rate);
  const cdText = typeof be.cd === "number" && be.cd > 0 ? `，触发后有${secondsFromFrames(be.cd)}间隔` : "";
  const chargeText = be.chargedNumber && be.chargedCd ? `；最多储存${be.chargedNumber}次触发机会，每${secondsFromFrames(be.chargedCd)}恢复1次` : "";
  return [
    metric("阴态落雷", `阴态下攻击命中时有${trigger}概率追加一次落雷${cdText}${chargeText}。`),
    metric("落雷伤害", `落雷命中造成攻击${pct(damageAddPer)}的雷属性伤害，并附带${addDefendVal}点保护分。`),
  ];
}

function describeAolieYangHeal(be, warnings) {
  const a = be.attribute || {};
  const level = be.passiveLevel || a.useLv || 1;
  const specs = [
    ["最大生命", "hpRate"],
    ["回血属性", "healHpRate"],
    ["防御", "defRate"],
    ["韧性", "tenacityRate"],
    ["守护", "guardianRate"],
    ["减伤", "protectRate"],
  ];
  const parts = [];
  for (const [label, key] of specs) {
    const value = requireNumber(a[key], warnings, "MISSING_AOLIE_YANG_HEAL_RATE", `敖烈阳态回血 Lv.${level} 缺少${key}`);
    if (value == null) return null;
    parts.push(`${label}${pct(value)}`);
  }
  return `阳态攻击命中时，每次技能只触发一次回血；回血按${parts.join("、")}合计，再按技能释放帧数折算。`;
}

function describeAolieYinYangLei(be, warnings) {
  const a = be.attribute || {};
  const level = be.passiveLevel || a.useLv || 1;
  const frameRate = requireNumber(a.frameRate, warnings, "MISSING_AOLIE_YINYANG_LEI_FRAME_RATE", `敖烈阴阳逆转 Lv.${level} 缺少阴雷积累倍率 frameRate`);
  const yangUnitHpPer = requireNumber(a.yangUnitHpPer, warnings, "MISSING_AOLIE_YINYANG_LEI_HP_PER", `敖烈阴阳逆转 Lv.${level} 缺少阳雷触发血量比例 yangUnitHpPer`);
  const yangUnitAddVal = requireNumber(a.yangUnitAddVal, warnings, "MISSING_AOLIE_YINYANG_LEI_ADD_VAL", `敖烈阴阳逆转 Lv.${level} 缺少阳雷每次叠层 yangUnitAddVal`);
  const range = Array.isArray(a.yangUnitRange) && a.yangUnitRange.length === 2 && a.yangUnitRange.every((value) => typeof value === "number" && Number.isFinite(value))
    ? a.yangUnitRange
    : null;
  if (!range) warnings.push({ code: "MISSING_AOLIE_YINYANG_LEI_RANGE", detail: `敖烈阴阳逆转 Lv.${level} 缺少阳雷范围 yangUnitRange` });
  if ([frameRate, yangUnitHpPer, yangUnitAddVal].some((value) => value == null) || !range) return [];

  const chargePerSecond = round(frameRate * BATTLE_FRAMES_PER_SECOND, 3);
  return [
    metric("阴雷叠加", `阴态下，技能命中目标时会按技能动作时长积累阴雷进度：每1秒动作约积累${chargePerSecond}层进度，进度满1层才给目标加1层【阴雷】；同一次技能对同一目标只结算一次。`),
    metric("阳雷叠加", `阳态下，受到的伤害会累计；每累计到自身最大生命的${pct(yangUnitHpPer)}，就给身边${range[0]}×${range[1]}范围内敌人叠${yangUnitAddVal}层【阳雷】。一次受击跨过多段门槛时，会按段数多次叠加。`),
    metric("阴阳转换", "给目标叠一种雷时，如果目标身上已有敖烈施加的另一种雷，会先按现有层数一层一层转换成当前雷，再叠加本次新层数；剩余持续时间按新状态时长等比例保留。"),
  ];
}

function isXuannvBamenChargeBeskill(be) {
  return be?.label === "buff" && idList(be.attribute).includes(XUANNV_BAMEN_CHARGE_BUFF_ID);
}

function isXuannvBamenVskillBeskill(be) {
  if (be?.label !== "vskillWithPos") return false;
  const ids = new Set(idList(be.attribute?.vskillIds));
  return XUANNV_BAMEN_VSKILL_IDS.every((id) => ids.has(id));
}

function isXuannvLingzhenBeskill(be) {
  return be?.label === "buff2" && idList(be.attribute?.buffIds).includes(XUANNV_LINGZHEN_BUFF_ID);
}

function readRoleSkillAction(ctx, roleId, skillId, warnings) {
  const skill = ctx.skillById?.get(skillId);
  if (!skill) {
    warnings.push({ code: "MISSING_ROLE_SKILL", detail: `角色技能 ${skillId} 缺失` });
    return null;
  }
  const monster = ctx.monsterById?.get(roleId);
  if (!monster?.cfgFile) {
    warnings.push({ code: "MISSING_ROLE_MONSTER_CFG", detail: `角色 ${roleId} 缺少实体动作配置` });
    return null;
  }
  const file = path.join(u.ROOT, "file", "battle-config", "entityCtg", `${monster.cfgFile}.json`);
  if (!fs.existsSync(file)) {
    warnings.push({ code: "MISSING_ENTITY_CTG", detail: `角色 ${roleId} 的实体动作文件不存在: ${file}` });
    return null;
  }
  const cacheKey = `entityCfg:${monster.cfgFile}`;
  ctx[cacheKey] = ctx[cacheKey] || JSON.parse(fs.readFileSync(file, "utf8"));
  const action = ctx[cacheKey][skill.entityAction];
  if (!action?.com) {
    warnings.push({ code: "MISSING_ENTITY_ACTION", detail: `角色技能 ${skillId} 找不到动作 ${skill.entityAction}` });
    return null;
  }
  return { skill, monster, action, file };
}

function describeXuannvLingzhen(be, ctx, warnings) {
  const a = be.attribute || {};
  const buff = ctx.buffById.get(XUANNV_LINGZHEN_BUFF_ID);
  const speedBuff = ctx.buffById.get(XUANNV_LINGZHEN_SPEED_BUFF_ID);
  const maxPiles = requireNumber(a.lsnMaxPile ?? buff?.maxPiles, warnings, "MISSING_LINGZHEN_MAX_PILES", "灵阵急启缺少最大层数");
  const cd = requireNumber(be.cd, warnings, "MISSING_LINGZHEN_CD", `灵阵急启 Lv.${be.passiveLevel || 1} 缺少叠层周期 cd`);
  const speedAdd = requireNumber(extractedBuffValue(speedBuff).per, warnings, "MISSING_LINGZHEN_SPEED_ADD", `灵阵急启速度状态 ${XUANNV_LINGZHEN_SPEED_BUFF_ID} 缺少加速数值`);
  const speedDuration = requireNumber(speedBuff?.time, warnings, "MISSING_LINGZHEN_SPEED_DURATION", `灵阵急启速度状态 ${XUANNV_LINGZHEN_SPEED_BUFF_ID} 缺少持续时间`);
  if ([maxPiles, cd, speedAdd, speedDuration].some((value) => value == null)) return [];

  const actionChecks = [];
  for (const skillId of XUANNV_FIELD_SKILL_IDS) {
    const resolved = readRoleSkillAction(ctx, XUANNV_ROLE_ID, skillId, warnings);
    if (!resolved) return [];
    const hasConsume = (resolved.action.com || []).some((com) => com?.type === 56 && com.sign === XUANNV_LINGZHEN_ACTION_SIGN && idList(com.buffId).includes(XUANNV_LINGZHEN_BUFF_ID) && com.removePiles === 1);
    const hasSpeed = (resolved.action.com || []).some((com) => com?.type === 1 && com.sign === XUANNV_LINGZHEN_ACTION_SIGN && idList(com.buff).includes(XUANNV_LINGZHEN_SPEED_BUFF_ID));
    const hasGate = (resolved.action.com || []).some((com) => com?.type === 128 && com.buffId === XUANNV_LINGZHEN_BUFF_ID && idList(com.skillComIds).includes(XUANNV_LINGZHEN_ACTION_SIGN));
    if (!hasGate || !hasConsume || !hasSpeed) {
      warnings.push({ code: "MISSING_LINGZHEN_FIELD_ACTION", detail: `灵阵急启在技能 ${skillId} 的开阵动作里缺少检测、消耗或加速组件` });
      return [];
    }
    actionChecks.push(skillId);
  }

  const speedRate = 1 + speedAdd;
  const baseFrames = requireNumber(ctx.xuannvFieldReleaseFrames, warnings, "MISSING_LINGZHEN_FIELD_RELEASE_FRAMES", "灵阵急启缺少奇门遁阵当前展示释放帧数");
  if (baseFrames == null) return [];
  const spedFrames = round(baseFrames / speedRate, 1);
  const speedText = `消耗后获得${secondsFromFrames(speedDuration)}的技能速度提升：技能播放速度变为${round(speedRate, 3)}倍；按当前展示的【奇门遁阵】${baseFrames}帧计算，实际约${spedFrames}帧（${secondsFromFrames(spedFrames)}）。`;

  return [
    metric("叠层周期", `每${frames(cd)}（${secondsFromFrames(cd)}）自动获得1层【灵阵急启】，最多${maxPiles}层；满层后不会继续叠。`),
    metric("开阵消耗", `释放【奇门遁阵】、【奇门遁阵·九天】或【奇门遁阵·九地】时，如果身上有【灵阵急启】，会消耗1层并触发加速。`),
    metric("释放加速", speedText, actionChecks),
  ];
}

function collectHitBuffIds(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectHitBuffIds(item, out);
    return out;
  }
  if (!value || typeof value !== "object") return out;
  for (const [key, item] of Object.entries(value)) {
    if (key === "hitBuff") out.push(...idList(item));
    else collectHitBuffIds(item, out);
  }
  return out;
}

function bulletDamageHits(ctx, bulletId, warnings) {
  const bullet = bulletById(ctx, bulletId, warnings);
  if (!bullet) return null;
  let hits = 0;
  for (const com of bullet.com || []) {
    if (com?.type !== 1 || com.isNotDamage === 1) continue;
    const maxHit = requireNumber(com.maxHit, warnings, "MISSING_BAMEN_BULLET_MAX_HIT", `八门破煞子弹 ${bulletId} 缺少命中次数 maxHit`);
    if (maxHit == null) return null;
    hits += maxHit;
  }
  return hits;
}

function bulletRangeText(ctx, bulletId, warnings) {
  const bullet = bulletById(ctx, bulletId, warnings);
  const rect = bullet?.defaultRect;
  if (!Array.isArray(rect) || rect.length < 4) return null;
  const width = rect[2];
  const height = rect[3];
  if (typeof width !== "number" || typeof height !== "number" || width <= 0 || height <= 0) return null;
  return `${width}×${height}`;
}

function bamenBuffValue(ctx, buffIds, type, label, warnings) {
  const values = uniqueNumbers(buffIds
    .map((id) => ctx.buffById.get(id))
    .filter((buff) => buff?.type === type)
    .map((buff) => extractedBuffValue(buff).per));
  if (!values.length) {
    warnings.push({ code: "MISSING_BAMEN_BUFF_VALUE", detail: `八门破煞缺少${label}数值` });
    return null;
  }
  if (values.length > 1) {
    warnings.push({ code: "AMBIGUOUS_BAMEN_BUFF_VALUE", detail: `八门破煞${label}数值不唯一: ${values.join(",")}` });
    return null;
  }
  return values[0];
}

function bamenBuffDuration(ctx, buffIds, warnings) {
  const durations = uniqueNumbers(buffIds
    .map((id) => ctx.buffById.get(id))
    .filter((buff) => buff?.type === BUFF_TYPE_BREAK || buff?.type === BUFF_TYPE_BREAK_FROM_ATK)
    .map((buff) => buff.time));
  if (!durations.length) {
    warnings.push({ code: "MISSING_BAMEN_BUFF_DURATION", detail: "八门破煞缺少穿透强化持续时间" });
    return null;
  }
  if (durations.length > 1) {
    warnings.push({ code: "AMBIGUOUS_BAMEN_BUFF_DURATION", detail: `八门破煞穿透强化持续时间不唯一: ${durations.join(",")}` });
    return null;
  }
  return durations[0];
}

function describeXuannvBamenCharge(be, ctx, warnings) {
  const buff = ctx.buffById.get(XUANNV_BAMEN_CHARGE_BUFF_ID);
  const maxPiles = requireNumber(buff?.maxPiles, warnings, "MISSING_BAMEN_MAX_PILES", "八门破煞缺少最大层数");
  if (maxPiles == null) return [];
  return [
    metric("充能规则", `阵法存在时，每在阵法内消耗1颗【阴阳玉】，玄女获得1层【八门破煞】充能，最多${maxPiles}层；阵法销毁结算后会清空这些层数。`),
    metric("档位总览", "1-2层只结算穿透强化；3-7层还会造成同层数的范围打击；8-10层会在范围打击中额外附加沉默。"),
  ];
}

function parseXuannvBamenAction(ctx, skillId, level, warnings) {
  const resolved = readVirtualSkillAction(ctx, skillId, warnings);
  if (!resolved) return null;
  const activation = (resolved.action.com || []).find((com) => com?.type === 128 && com.buffId === XUANNV_BAMEN_CHARGE_BUFF_ID);
  if (!activation) {
    warnings.push({ code: "MISSING_BAMEN_LAYER_COM", detail: `八门破煞虚拟技 ${skillId} 缺少层数结算组件` });
    return null;
  }
  if (activation.noSummation !== false) {
    warnings.push({ code: "UNEXPECTED_BAMEN_SUMMATION_MODE", detail: `八门破煞虚拟技 ${skillId} 层数结算不是逐段累加模式` });
    return null;
  }
  const skillComIds = idList(activation.skillComIds);
  const chargeBuff = ctx.buffById.get(XUANNV_BAMEN_CHARGE_BUFF_ID);
  const maxPiles = requireNumber(chargeBuff?.maxPiles, warnings, "MISSING_BAMEN_MAX_PILES", "八门破煞缺少最大层数");
  if (maxPiles == null) return null;
  if (skillComIds.length < maxPiles) {
    warnings.push({ code: "MISSING_BAMEN_SKILL_COM_IDS", detail: `八门破煞虚拟技 ${skillId} 可结算段数少于最大层数` });
    return null;
  }

  const skillLevel = findSkillLevel(ctx, skillId, level);
  if (!skillLevel) {
    warnings.push({ code: "MISSING_BAMEN_SKILL_LEVEL", detail: `八门破煞虚拟技 ${skillId} 缺少 Lv.${level} 数值` });
    return null;
  }
  const damageAddPer = requireNumber(skillLevel.damageAddPer, warnings, "MISSING_BAMEN_DAMAGE_PER", `八门破煞虚拟技 ${skillId} Lv.${level} 缺少 damageAddPer`);
  const damageAddVal = requireNumber(skillLevel.damageAddVal, warnings, "MISSING_BAMEN_DAMAGE_VAL", `八门破煞虚拟技 ${skillId} Lv.${level} 缺少 damageAddVal`);
  const addDefendVal = requireNumber(skillLevel.addDefendVal, warnings, "MISSING_BAMEN_DEFEND_VAL", `八门破煞虚拟技 ${skillId} Lv.${level} 缺少 addDefendVal`);
  if ([damageAddPer, damageAddVal, addDefendVal].some((value) => value == null)) return null;

  const allBuffIds = [];
  const signRows = new Map();
  for (const sign of skillComIds.slice(0, maxPiles)) {
    const activeComs = (resolved.action.com || []).filter((com) => com?.sign === sign);
    const buffIds = activeComs.filter((com) => com.type === 1).flatMap((com) => idList(com.buff));
    allBuffIds.push(...buffIds);
    let damageHits = 0;
    let hasDamage = false;
    const silenceBuffIds = [];
    const ranges = [];
    for (const com of activeComs.filter((row) => row.type === 2)) {
      const hits = bulletDamageHits(ctx, com.bId, warnings);
      if (hits == null) return null;
      if (hits > 0) {
        hasDamage = true;
        damageHits += hits;
        const range = bulletRangeText(ctx, com.bId, warnings);
        if (range) ranges.push(range);
      }
      for (const buffId of collectHitBuffIds(bulletById(ctx, com.bId, warnings))) {
        const buff = ctx.buffById.get(buffId);
        if (/沉默/.test(`${buff?.name || ""}${buff?.text || ""}`)) silenceBuffIds.push(buffId);
      }
    }
    signRows.set(sign, {
      buffLayers: buffIds.some((id) => {
        const buff = ctx.buffById.get(id);
        return buff?.type === BUFF_TYPE_BREAK || buff?.type === BUFF_TYPE_BREAK_FROM_ATK;
      }) ? 1 : 0,
      damageHits: hasDamage ? damageHits : 0,
      silenceBuffIds,
      ranges,
    });
  }

  const breakPer = bamenBuffValue(ctx, allBuffIds, BUFF_TYPE_BREAK, "穿透提高", warnings);
  const breakAtkPer = bamenBuffValue(ctx, allBuffIds, BUFF_TYPE_BREAK_FROM_ATK, "按攻击转化穿透", warnings);
  const durationFrames = bamenBuffDuration(ctx, allBuffIds, warnings);
  if ([breakPer, breakAtkPer, durationFrames].some((value) => value == null)) return null;

  const piles = [];
  for (let pile = 1; pile <= maxPiles; pile++) {
    const activeSigns = skillComIds.slice(0, pile);
    const rows = activeSigns.map((sign) => signRows.get(sign)).filter(Boolean);
    piles.push({
      pile,
      buffLayers: rows.reduce((sum, row) => sum + row.buffLayers, 0),
      damageHits: rows.reduce((sum, row) => sum + row.damageHits, 0),
      silenceBuffIds: [...new Set(rows.flatMap((row) => row.silenceBuffIds))],
      ranges: [...new Set(rows.flatMap((row) => row.ranges))],
    });
  }

  return {
    skillId,
    level,
    maxPiles,
    breakPer,
    breakAtkPer,
    durationFrames,
    damageAddPer,
    damageAddVal,
    addDefendVal,
    piles,
  };
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function describeXuannvBamenFinish(be, ctx, warnings) {
  const level = be.attribute?.useLv || be.passiveLevel || 1;
  const ids = idList(be.attribute?.vskillIds);
  const parsed = ids.map((skillId) => parseXuannvBamenAction(ctx, skillId, level, warnings));
  if (parsed.some((item) => !item)) return [];
  const first = parsed[0];
  for (const item of parsed.slice(1)) {
    if (
      item.maxPiles !== first.maxPiles ||
      item.breakPer !== first.breakPer ||
      item.breakAtkPer !== first.breakAtkPer ||
      item.durationFrames !== first.durationFrames ||
      item.damageAddPer !== first.damageAddPer ||
      item.damageAddVal !== first.damageAddVal ||
      item.addDefendVal !== first.addDefendVal ||
      !sameArray(item.piles.map((row) => row.damageHits), first.piles.map((row) => row.damageHits)) ||
      !sameArray(item.piles.map((row) => row.silenceBuffIds.length), first.piles.map((row) => row.silenceBuffIds.length))
    ) {
      warnings.push({ code: "AMBIGUOUS_BAMEN_VSKILL_VARIANTS", detail: "八门破煞不同阵法形态的结算数值不一致" });
      return [];
    }
  }

  const firstDamage = first.piles.find((row) => row.damageHits > 0);
  const firstSilence = first.piles.find((row) => row.silenceBuffIds.length > 0);
  const maxPile = first.piles[first.piles.length - 1];
  if (!firstDamage || !firstSilence || !maxPile) {
    warnings.push({ code: "MISSING_BAMEN_THRESHOLD", detail: "八门破煞缺少范围打击或沉默门槛" });
    return [];
  }
  const silenceBuff = ctx.buffById.get(firstSilence.silenceBuffIds[0]);
  const silenceDuration = buffDurationText(silenceBuff);
  if (!silenceBuff || !silenceDuration) {
    warnings.push({ code: "MISSING_BAMEN_SILENCE_BUFF", detail: "八门破煞缺少沉默状态或持续时间" });
    return [];
  }
  const rangeText = maxPile.ranges.length === 1 ? `，范围约${maxPile.ranges[0]}` : "";
  const maxBreakPer = first.breakPer * first.maxPiles;
  const maxBreakAtkPer = first.breakAtkPer * first.maxPiles;

  return [
    metric("层数结算", `阵法销毁时会消耗当前【八门破煞】层数，并按层数从低到高依次结算；例如5层会获得5层穿透强化，并触发5段范围打击。`),
    metric("穿透强化", `每层持续${secondsFromFrames(first.durationFrames)}，单层提供穿透${signedPct(first.breakPer)}，并把当前攻击的${pct(first.breakAtkPer)}加入穿透值；最多${first.maxPiles}层，满层为穿透${signedPct(maxBreakPer)}，并把当前攻击的${pct(maxBreakAtkPer)}加入穿透值。`),
    metric("范围打击", `${firstDamage.pile}层开始触发，当前几层就造成几段范围打击，满层为${maxPile.damageHits}段；Lv.${level}每段造成攻击${pct(first.damageAddPer)} + ${round(first.damageAddVal, 3)}点固定伤害，并附带${first.addDefendVal}点保护分${rangeText}。`),
    metric("沉默", `${firstSilence.pile}层及以上时，范围打击中会有1段附加【沉默】，禁止目标使用技能，持续${silenceDuration}。`),
  ];
}

function cleanBuffDisplayName(name) {
  return String(name || "")
    .replace(/等级\d+$/, "")
    .replace(/[·\-_—]+$/, "")
    .trim();
}

function normalizeText(text) {
  return String(text || "")
    .replace(/持续∞秒/g, "持续到状态结束")
    .replace(/消失所有/g, "消耗所有")
    .replace(/。+$/g, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/,/g, "，")
    .replace(/\s+/g, " ")
    .trim();
}

function valuePairText(value) {
  if (!Array.isArray(value)) return null;
  const parts = [];
  if (typeof value[0] === "number" && value[0] !== 0) parts.push(signedPct(value[0]) || pct(value[0]));
  if (typeof value[1] === "number" && value[1] !== 0) parts.push(`${value[1] > 0 ? "+" : ""}${value[1]}`);
  return parts.length ? parts.join("，") : null;
}

function buffValueText(buff) {
  if (!buff) return null;
  if (Array.isArray(buff.value)) return valuePairText(buff.value);
  if (buff.value && typeof buff.value === "object") {
    const parts = [];
    for (const [key, value] of Object.entries(buff.value)) {
      if (typeof value !== "number" || value === 0) continue;
      const label = {
        per: "比例",
        val: "固定值",
        max: "上限",
        rate: "倍率",
        atkPer: "攻击比例",
        atkVal: "固定伤害",
      }[key] || key;
      parts.push(`${label}${Math.abs(value) < 1 ? signedPct(value) : value}`);
    }
    return parts.length ? parts.join("，") : null;
  }
  return null;
}

function buffDurationText(buff) {
  if (!buff || typeof buff.time !== "number") return null;
  if (buff.time < 0) return "持续到被消耗或离场";
  if (buff.time === 0) return null;
  return secondsFromFrames(buff.time);
}

function buffIntervalText(buff) {
  if (!buff || typeof buff.interval !== "number" || buff.interval <= 0) return null;
  return secondsFromFrames(buff.interval);
}

function extractedBuffValue(buff) {
  const value = buff?.value;
  const out = {
    per: null,
    val: null,
    maxHpPer: null,
    atkPer: null,
    atkVal: null,
    rate: null,
    paramPer: null,
  };
  const setNum = (key, n) => {
    if (typeof n === "number" && n !== 0) out[key] = n;
  };
  if (Array.isArray(value)) {
    const row = Array.isArray(value[0]) ? value[0] : value;
    setNum("per", row[0]);
    setNum("val", row[1]);
    setNum("maxHpPer", row[3]);
  } else if (value && typeof value === "object") {
    setNum("per", value.per);
    setNum("val", value.val);
    setNum("atkPer", value.atkPer);
    setNum("atkVal", value.atkVal);
    setNum("rate", value.rate);
    if (Array.isArray(value.param)) {
      const lastMeaningful = [...value.param].reverse().find((n) => typeof n === "number" && n !== 0);
      setNum("paramPer", lastMeaningful);
    }
  }
  return out;
}

function changeText(label, per, val, options = {}) {
  const parts = [];
  const up = options.up || "提高";
  const down = options.down || "降低";
  if (typeof per === "number" && per !== 0) parts.push(`${label}${per > 0 ? up : down}${pct(Math.abs(per))}`);
  if (typeof val === "number" && val !== 0) parts.push(`${label}${val > 0 ? up : down}${round(Math.abs(val), 3)}点`);
  return parts.join("，");
}

function buffPropLabel(buff) {
  const hay = `${buff?.name || ""} ${buff?.text || ""}`;
  if (/最大魔法|魔法值|法力强化/.test(hay)) return "最大魔法";
  if (/最大生命|生命值|生命强化/.test(hay)) return "最大生命";
  if (/移速|移动速度/.test(hay)) return "移动速度";
  if (/命中/.test(hay)) return "命中";
  if (/闪避/.test(hay)) return "闪避";
  if (/暴击/.test(hay)) return /最终/.test(hay) ? "最终暴击率" : "暴击";
  if (/韧性/.test(hay)) return "韧性";
  if (/守护/.test(hay)) return "守护";
  if (/幸运/.test(hay)) return "幸运";
  if (/防御/.test(hay)) return "防御";
  if (/攻击/.test(hay)) return "攻击";
  if (/回蓝|魔法/.test(hay)) return "回蓝属性";
  if (/回血|恢复|治疗/.test(hay)) return "回血属性";
  return {
    19: "最大生命",
    4: "移动速度",
    5: "攻击",
    6: "防御",
    7: "命中",
    8: "闪避",
    9: "暴击",
    10: "韧性",
    11: "幸运",
    12: "守护",
    29: "回血属性",
    30: "回蓝属性",
    36: "治疗效果",
    61: "最终暴击率",
    144: "最大魔法",
  }[buff?.type] || "属性";
}

function buffLimitParts(buff, options = {}) {
  const parts = [];
  if (buff.maxPiles) parts.push(`最多${buff.maxPiles}层`);
  if (!options.hideDuration) {
    const duration = buffDurationText(buff);
    if (duration) {
      const text = options.indefiniteText && buff.time < 0 ? options.indefiniteText : duration;
      parts.push(text.startsWith("持续") ? text : `持续${text}`);
    }
  }
  return parts;
}

function buffSentence(buff, coreParts, options = {}) {
  const parts = coreParts.filter(Boolean);
  parts.push(...buffLimitParts(buff, options));
  const name = cleanBuffDisplayName(buff.name) || `状态${buff.id}`;
  return `${name}：${parts.join("，")}。`;
}

function buffText(buff, options = {}) {
  if (!buff) return null;
  const v = extractedBuffValue(buff);
  const text = normalizeText(buff.text);
  const prop = buffPropLabel(buff);
  const sourceLabel = options.beskill?.label;
  const durationOptions = {
    hideDuration: options.hideDuration || sourceLabel === "campBuff",
    indefiniteText: sourceLabel === "callMonsterAddBuff" ? "持续到召唤物离场" : null,
  };

  if (/冷却中/.test(text)) {
    const duration = buffDurationText(buff);
    return buffSentence(buff, [`触发后进入${duration || "一段时间"}冷却`], { hideDuration: true });
  }

  switch (buff.type) {
    case 1: {
      const interval = buffIntervalText(buff);
      const values = [];
      if (v.val != null) values.push(`固定回复${round(Math.abs(v.val), 3)}点`);
      if (v.maxHpPer != null) values.push(`按最大生命${pct(Math.abs(v.maxHpPer))}回复`);
      const base = interval ? `每${interval}恢复生命` : "恢复生命";
      return buffSentence(buff, [values.length ? `${base}（${values.join("，")}）` : text || base], durationOptions);
    }
    case 4:
    case 19:
    case 5:
    case 6:
    case 7:
    case 8:
    case 9:
    case 10:
    case 11:
    case 12:
    case 29:
    case 30:
    case 36:
    case 61:
    case 144:
      return buffSentence(buff, [changeText(prop, v.per, v.val) || text || `${prop}变化`], durationOptions);
    case 13: {
      const values = [];
      if (v.maxHpPer != null) values.push(`最大生命${pct(Math.abs(v.maxHpPer))}`);
      if (v.val != null) values.push(`${round(Math.abs(v.val), 3)}点`);
      return buffSentence(buff, [`获得${values.length ? values.join(" + ") : ""}护盾`.trim() || text || "获得护盾"], durationOptions);
    }
    case 14: {
      const phrase = changeText("受到的伤害", v.per, v.val, { up: "提高", down: "降低" });
      return buffSentence(buff, [phrase || text || "改变受到的伤害"], durationOptions);
    }
    case 16: {
      const parts = [];
      if (v.paramPer != null) parts.push(`回复系数${pct(Math.abs(v.paramPer))}`);
      return buffSentence(buff, [parts.length ? `恢复法力（${parts.join("，")}）` : text || "恢复法力"], durationOptions);
    }
    case 17: {
      const phrase = changeText("造成的伤害", v.per, v.val, { up: "提高", down: "降低" });
      return buffSentence(buff, [phrase || text || "改变造成的伤害"], durationOptions);
    }
    case 23:
      return buffSentence(buff, ["获得霸体，受击时不被打断，持续到状态结束"], { hideDuration: true });
    case 136:
      return buffSentence(buff, [text || "记录机制层数"], durationOptions);
    case 142:
      return buffSentence(buff, ["达到消耗门槛后，可免费释放一次叶灵技能"], durationOptions);
    case 155: {
      const interval = buffIntervalText(buff);
      const values = [];
      if (v.atkPer != null) values.push(`攻击${pct(Math.abs(v.atkPer))}的伤害`);
      if (v.atkVal != null) values.push(`${round(Math.abs(v.atkVal), 3)}点固定伤害`);
      const base = `${interval ? `每${interval}` : "持续"}造成${values.length ? values.join(" + ") : "持续伤害"}`;
      return buffSentence(buff, [base], durationOptions);
    }
    case 191: {
      const phrase = v.per != null ? `攻击霸体目标时吸血${pct(Math.abs(v.per))}` : text || "攻击霸体目标时吸血";
      return buffSentence(buff, [phrase], durationOptions);
    }
    case 650:
    case 655: {
      const rate = v.rate != null ? `每层使对应治疗或护盾提高${pct(Math.abs(v.rate))}` : null;
      return buffSentence(buff, [rate || text || "消耗层数强化天降甘露"], durationOptions);
    }
    default: {
      const value = buffValueText(buff);
      return buffSentence(buff, [text || (value ? `效果数值${value}` : "生效")], durationOptions);
    }
  }
}

function metric(label, value, raw = null) {
  return { label, value, raw };
}

function buffMetricLabel(be, buff) {
  switch (be?.label) {
    case "campBuff":
      return "全队加成";
    case "atkAddBuff":
      return "普攻附加";
    case "atkBuffGroupDamage":
    case "skillBuffGroupDamage":
    case "hitBuffTypeAddEnergy":
    case "hitBuffTypeAddCrit":
    case "sourceBuffDamageAdd":
    case "clearBuffAndDamageDo":
    case "upBuffPileAndFrame":
      return "判定状态";
    case "callMonsterAddBuff":
      return "召唤物状态";
    case "appearBuff1":
      return "出场状态";
    default:
      return buff?.source === "condition" ? "判定状态" : "状态效果";
  }
}

function shouldShowLinkedBuffMetric(be, buff) {
  if (!buff || buff.source !== "condition") return true;
  return new Set([
    "atkBuffGroupDamage",
    "skillBuffGroupDamage",
    "clearBuffAndDamageDo",
    "sourceBuffDamageAdd",
    "upBuffPileAndFrame",
  ]).has(be?.label);
}

function linkedBuffMetrics(buffLinks, be, ctx) {
  return buffLinks
    .filter((buff) => shouldShowLinkedBuffMetric(be, buff))
    .map((buff) => metric(buffMetricLabel(be, buff), buffText(buff, { beskill: be, ctx }), { buffId: buff.id, group: buff.group }))
    .filter((row) => row.value);
}

function pushBuffId(out, seen, ctx, id, source) {
  if (typeof id !== "number") return;
  const buff = ctx.buffById.get(id);
  if (!buff || seen.has(`${source}:${id}`)) return;
  seen.add(`${source}:${id}`);
  out.push({ source, ...simplifyBuff(buff) });
}

function pushBuffIds(out, seen, ctx, ids, source) {
  for (const id of idList(ids)) pushBuffId(out, seen, ctx, id, source);
}

function pushBuffGroups(out, seen, ctx, ids, source) {
  for (const id of idList(ids)) {
    const buff = ctx.buffById.get(id);
    if (buff) {
      pushBuffId(out, seen, ctx, id, source);
      continue;
    }
    for (const candidate of ctx.buffRows || []) {
      if (candidate.group === id) pushBuffId(out, seen, ctx, candidate.id, source);
    }
  }
}

function linkedBuffsFromBeskill(record, ctx) {
  const seen = new Set();
  const out = [];
  const a = record?.attribute;

  switch (record?.label) {
    case "campBuff":
    case "buff":
    case "appearBuff1":
    case "firBurnAddBuffs":
      pushBuffIds(out, seen, ctx, a, "effect");
      break;
    case "buff2":
      pushBuffIds(out, seen, ctx, a?.buffIds, "effect");
      break;
    case "suckCmonToDo":
      pushBuffIds(out, seen, ctx, a?.effectValue, "effect");
      break;
    case "atkAddBuff":
      pushBuffIds(out, seen, ctx, a?.buff, "effect");
      break;
    case "callMonsterAddBuff":
      pushBuffIds(out, seen, ctx, a?.buffs, "effect");
      break;
    case "stoneArmor":
      pushBuffIds(out, seen, ctx, a?.buff, "effect");
      pushBuffIds(out, seen, ctx, a?.mainBuff, "effect");
      break;
    case "battleArmor":
      pushBuffIds(out, seen, ctx, a?.buff, "effect");
      break;
    case "subFlagValueAddBuff":
      pushBuffIds(out, seen, ctx, a?.buffs, "effect");
      break;
    case "whiteDragonYinYangLei":
      pushBuffIds(out, seen, ctx, [a?.yinLeiBuff, a?.yangLeiBuff], "effect");
      break;
    case "skillConsumeMpAddBuffs":
      pushBuffIds(out, seen, ctx, a?.buffs, "effect");
      break;
    case "atkBuffGroupDamage":
    case "skillBuffGroupDamage":
    case "clearBuffAndDamageDo":
      pushBuffGroups(out, seen, ctx, [a?.buffGroup], "condition");
      break;
    case "sourceBuffDamageAdd":
      pushBuffGroups(out, seen, ctx, a?.buffGroups, "condition");
      break;
    case "upBuffPileAndFrame":
      pushBuffGroups(out, seen, ctx, a?.group, "condition");
      break;
    case "hitBuffTypeAddEnergy":
    case "hitBuffTypeAddCrit":
      pushBuffGroups(out, seen, ctx, a?.groupIds, "condition");
      break;
    case "aetialGliding":
      pushBuffIds(out, seen, ctx, a?.enterBuffs, "effect");
      break;
    default:
      break;
  }

  return out;
}

function listText(items) {
  return items.filter((item) => item != null && item !== "").join("、");
}

function idList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flat(Infinity).filter((id) => typeof id === "number");
  return typeof value === "number" ? [value] : [];
}

function skillName(ctx, id) {
  const skill = ctx.skillById && ctx.skillById.get(id);
  return skill && skill.name ? `${skill.name}` : "额外效果";
}

function monsterName(ctx, id) {
  const monster = ctx.monsterById && ctx.monsterById.get(id);
  return monster && monster.name ? `${monster.name}` : "指定单位";
}

function skillList(ctx, ids, limit = 6) {
  const arr = idList(ids).map((id) => skillName(ctx, id));
  if (arr.length > limit) return `${arr.slice(0, limit).join("、")}等${arr.length}个技能`;
  return arr.join("、");
}

function monsterList(ctx, ids, limit = 6) {
  const arr = idList(ids).map((id) => monsterName(ctx, id));
  if (arr.length > limit) return `${arr.slice(0, limit).join("、")}等${arr.length}类召唤物`;
  return arr.join("、");
}

function damageText(value) {
  if (!Array.isArray(value)) return null;
  const parts = [];
  if (typeof value[0] === "number" && value[0] !== 0) parts.push(signedPct(value[0]));
  if (typeof value[1] === "number" && value[1] !== 0) parts.push(`固定伤害${value[1] > 0 ? "+" : ""}${value[1]}`);
  return parts.join("，");
}

function addBuffSummary(ctx, ids) {
  const buffs = idList(ids)
    .map((id) => ctx.buffById && ctx.buffById.get(id))
    .filter(Boolean)
    .map(simplifyBuff)
    .map(buffText)
    .filter(Boolean);
  return buffs.length ? buffs.join("；") : null;
}

function describeBeskill(be, ctx, warnings) {
  const a = be.attribute;
  const out = [];
  const pushRaw = () => {
    out.push(metric("暂未解析", "这个被动机制暂时没有对应的人话解释，已保留解析告警等待补充。", { label: be.label, id: be.id, attribute: a }));
    warnings.push({ code: "UNPARSED_PASSIVE_LABEL", detail: `passive beskill ${be.id} label=${be.label} 暂未建立专用解释器` });
  };

  if (be.text && be.label !== "whiteDragonYinYangLei" && !isXuannvBamenChargeBeskill(be) && !isXuannvLingzhenBeskill(be)) out.push(metric("机制说明", be.text));

  switch (be.label) {
    case "campBuff":
      out.push(metric("作用范围", "进入关卡后，我方所有单位都会获得下面的加成。"));
      break;
    case "effect":
      if (!be.text) pushRaw();
      break;
    case "suckCmonToDo":
      out.push(metric("触发对象", `${monsterList(ctx, a?.ids) || "指定召唤物"}死亡时，会把效果飞回给本体。`));
      out.push(metric("触发效果", "本体获得下面的恢复状态。"));
      break;
    case "haveSubHpSuck":
      out.push(metric("吸血规则", `自身每损失${pct(a.unit)}最大生命，本次吸血提高${pct(a.addPer)}，最高提高${pct(a.max)}。`));
      break;
    case "skyAtkCHit":
      out.push(metric("空中攻击", "解锁空中连击，可以在空中继续攻击。"));
      break;
    case "skyAddDamage":
      out.push(metric("空中伤害", `角色不在地面时，造成的伤害额外提高${damageText(a) || "按配置提高"}。`));
      break;
    case "atkSummonMonster":
      out.push(metric("召唤机制", `攻击流程会召唤${monsterName(ctx, a.mId)}，场上最多${a.max}个，存在${a.time}秒。`));
      if (a.propAdd?.atk) out.push(metric("召唤物攻击", `攻击继承为角色攻击的${pct(a.propAdd.atk[0] || 0)}${a.propAdd.atk[1] ? ` + ${a.propAdd.atk[1]}` : ""}。`));
      break;
    case "callMonsterAI":
      out.push(metric("召唤物行为", "召唤物会使用被动专属行动方式。"));
      break;
    case "valueFlagAdd": {
      const values = Object.values(a || {}).filter((value) => typeof value === "number");
      const min = Math.min(...values);
      const max = Math.max(...values);
      out.push(metric("霜冻积累", `冰系技能命中或结算时积累霜冻值，本级单次增加${min === max ? min : `${min}-${max}`}点。`, a));
      break;
    }
    case "atkAddBuff":
      out.push(metric("普攻附加状态", `普通攻击命中时给目标附加状态${a?.limit != null ? `，最多触发${a.limit}次` : ""}。`));
      break;
    case "sameSkillSubCd":
      out.push(metric("连续命中奖励", `两段同组技能在${a?.time}秒内连续命中时，为第${a?.skillIdx}个技能回复/调整${Math.abs(a?.value ?? 0)}点充能。`));
      break;
    case "buff2":
      if (isXuannvLingzhenBeskill(be)) {
        const effects = describeXuannvLingzhen(be, ctx, warnings);
        out.push(...effects);
        if (!effects.length) out.push(metric("释放加速", "灵阵急启的释放加速数值解析失败，已保留解析告警等待补充。"));
      } else {
        out.push(metric("自身状态", `持续获得或监听下面的状态${a?.lsnMaxPile != null ? `，最多记录${a.lsnMaxPile}层` : ""}。`));
      }
      break;
    case "flagBuffDamage":
      out.push(metric("增伤条件", `目标处于霜冻/冰冻类状态时，本次伤害额外提高${damageText(a?.value) || "配置数值"}。`));
      break;
    case "atkBuffGroupDamage":
      out.push(metric("普攻增伤", `普通攻击命中带有下面状态的目标时，伤害额外提高${damageText(a?.value) || "配置数值"}。`));
      break;
    case "skillBuffGroupDamage":
      out.push(metric("技能增伤", `水系技能命中带有下面状态的目标时，伤害额外提高${damageText(a?.value) || "配置数值"}。`));
      break;
    case "callMonsterMore":
      out.push(metric("召唤上限", `同类召唤物场上数量上限 +${a}。`));
      break;
    case "callMonsterAddBuff":
      out.push(metric("召唤物强化", `${monsterList(ctx, a?.limitMIds) || "召唤物"}出场时获得下面的强化。`));
      break;
    case "replaceAtkIds":
      out.push(metric("攻击变化", listText([
        a?.atkIds ? `地面普攻切换为被动专用连段` : null,
        a?.skyAtkIds1 ? `空中普攻切换为被动专用连段` : null,
      ]) || "替换普通攻击动作。"));
      break;
    case "replaceOtherAction":
      out.push(metric("动作变化", "替换角色动作表现，让被动对应的新普攻/状态有专属表现。"));
      break;
    case "sameSkillAddDamage":
      if (!damageText(a?.addDmage)) out.push(metric("弓系增伤", "当前等级不额外提高弓系技能伤害。", a?.skillIds || null));
      else out.push(metric("弓系增伤", `弓系技能命中时，伤害额外提高${damageText(a?.addDmage)}。`, a?.skillIds || null));
      break;
    case "upBuffPileAndFrame":
      if ((a?.addMaxPile || 0) === 0 && (!Array.isArray(a?.addFrame) || a.addFrame.every((n) => n === 0))) {
        out.push(metric("持续状态强化", "当前等级不额外提高毒种层数或持续时间。"));
      } else {
        out.push(metric("持续状态强化", `剧毒种子的最大层数 +${a?.addMaxPile || 0}${Array.isArray(a?.addFrame) ? `，持续时间增加${a.addFrame.map((n) => `${frames(n)}（${secondsFromFrames(n)}）`).join("、")}` : ""}。`));
      }
      break;
    case "juduZhongziAddHp":
      out.push(metric("毒种回血", `剧毒种子每30帧（1秒）为沙僧回血一次：先统计场上所有角色、宠物、怪物身上由沙僧施加的剧毒种子总层数；每秒恢复 = 向上取整(min(总层数^${reciprocalValue(a?.sqrt)} × 沙僧攻击 × 攻击比例${pctValue(a?.hp)}, 沙僧回血属性 × 回血比例${pctValue(a?.max)}))。`));
      break;
    case "clearBuffAndDamageDo":
      out.push(metric("毒爆结算", `毒爆在技能结束时按本次清算的剧毒种子层数回血：回复 = 向上取整(min(清算层数^${reciprocalValue(a?.sqrt)} × 沙僧攻击 × 攻击比例${pctValue(a?.hp)}, 沙僧回血属性 × 回血比例${pctValue(a?.max)}) × ${numberValue(a?.rate)})${be.cd ? `；触发后有${frames(be.cd)}（${secondsFromFrames(be.cd)}）冷却` : ""}。`));
      break;
    case "hitBuffTypeAddEnergy":
      out.push(metric("命中奖励", `命中处于追猎/毒叶类状态的目标时，第${a?.skillIdx + 1}个技能的充能时间缩短${Math.abs(a?.addVal ?? 0)}秒。`));
      break;
    case "sourceBuffDamageAdd":
      out.push(metric("持续伤害强化", `自己施加的毒伤结算时，伤害额外提高${damageText(a?.damage) || "0%"}。`));
      break;
    case "hitBuffTypeAddCrit":
      out.push(metric("暴击提升", `攻击处于追猎/毒叶类状态的目标时，最终暴击率提高${pct(a?.addVal || 0)}。`));
      break;
    case "skill_mp_sub_hp":
      out.push(metric("消耗转换", `技能魔法消耗降低${pct(a?.subPer || 0)}，降低的魔法会按${a?.rate}倍转为生命消耗；生命低于${pct(a?.minHp || 0)}时不再生效。`));
      break;
    case "hp_healHp":
      if (Array.isArray(a)) {
        out.push(metric("回血属性提升", `每损失${a[0]}%生命，回血属性额外提高${a[1]}% + ${a[2]}，提升上限为基础回血属性的${a[3]}%。`));
      } else pushRaw();
      break;
    case "stoneArmor":
      out.push(metric("石甲充能", `受到伤害时积累石甲能量，每次 +${a?.add}；能量满后获得护甲状态，并附带下面的效果。`));
      break;
    case "haveSubHpAddAtk":
      out.push(metric("低血攻击", `已损失生命每达到${a?.unit}点，攻击力增加${a?.addVal}点；最高不超过当前攻击的${pct(a?.maxVal || 0)}。`));
      break;
    case "battleArmor":
      out.push(metric("战甲充能", `命中目标时按本次攻击系数积累战甲能量，能量满后获得护甲状态，并附带下面的效果。`));
      break;
    case "upSwordRate":
      if (Array.isArray(a)) {
        out.push(metric("剑气获取", `每次获得剑气时，本次剑气值额外增加${pct(a[0] || 0)}${a[1] ? ` + ${a[1]}` : ""}。`));
      } else pushRaw();
      break;
    case "upSwordMaxVal":
      if (Array.isArray(a)) out.push(metric("剑气上限", `剑气层数上限提高：当前上限的${pct(a[0] || 0)}${a[1] ? ` + ${a[1]}` : ""}。`));
      else pushRaw();
      break;
    case "hurtDealSameThing":
      out.push(metric("受击触发", `${a?.needFlag ? `受到伤害时消耗${a.needFlag[1]}层剑气` : "受到伤害时"}，触发一次被动反击/护主效果。`));
      break;
    case "subFlagValueAddBuff":
      out.push(metric("消耗转状态", `每消耗1层剑气，按${a?.countRate}倍次数给自己附加下面的状态。`));
      break;
    case "firBurnAddBuffs":
    case "buff":
      if (isXuannvBamenChargeBeskill(be)) {
        const effects = describeXuannvBamenCharge(be, ctx, warnings);
        out.push(...effects);
        if (!effects.length) out.push(metric("充能规则", "八门破煞的充能数值解析失败，已保留解析告警等待补充。"));
      } else {
        out.push(metric("自身状态", "触发后自己获得下面的状态效果。"));
      }
      break;
    case "appearBuff1":
      out.push(metric("出场状态", "进入关卡时立即获得下面的状态效果。"));
      break;
    case "RangeBuffAreanScaleTo":
      out.push(metric("范围变化", `辟魔玄阵的横向范围变为${a?.scaleX}倍${a?.frame != null ? `，变化用时${secondsFromFrames(a.frame)}` : ""}。`));
      break;
    case "vSkill":
    case "vskill": {
      const virtualSkillIds = [...idList(a?.skillIds), ...idList(a?.vskillIds)];
      if (virtualSkillIds.includes(PI_MO_XUAN_ZHEN_SKILL_ID)) {
        const effects = describeBiMoXuanZhen(ctx, a?.useLv || be.passiveLevel || 1, warnings);
        out.push(...effects);
        if (!effects.length) out.push(metric("阵法效果", "辟魔玄阵的阵法数值解析失败，已保留解析告警等待补充。"));
      } else if (virtualSkillIds.includes(AOLIE_YIN_LIGHTNING_SKILL_ID)) {
        const effects = describeAolieYinLightning(be, ctx, warnings);
        out.push(...effects);
        if (!effects.length) out.push(metric("阴态落雷", "阴电阳雷的阴态落雷数值解析失败，已保留解析告警等待补充。"));
      } else {
        out.push(metric("额外触发", `触发时释放被动专属效果${a?.useLv != null ? `，按Lv.${a.useLv}数值` : ""}。`));
      }
      break;
    }
    case "addWukongNuYan": {
      out.push(metric("怒焰积累", `悟空在空中造成伤害会积累怒焰，怒焰最多存到${a.maxVal}点；达到${a.triggerVal}点后，下一次火魔斩或定海神针会触发【天降怒火】，触发后怒焰清零。`, a.addVals || null));
      break;
    }
    case "releaseVSkillWithNuYan":
      out.push(metric("怒焰爆发", describeNuYanRelease(be, ctx, warnings)));
      break;
    case "addSkillPower":
      out.push(metric("充电效率", `攻击命中后提升技能充电效率：每次增加${pct(a?.per || 0)}${a?.val ? ` + ${a.val}` : ""}。`));
      break;
    case "whiteDragonYangAddHp": {
      const text = describeAolieYangHeal(be, warnings);
      if (text) out.push(metric("阳态回血", text));
      else out.push(metric("阳态回血", "阴电阳雷的阳态回血数值解析失败，已保留解析告警等待补充。"));
      break;
    }
    case "whiteDragonYinYangLei": {
      const effects = describeAolieYinYangLei(be, warnings);
      out.push(...effects);
      if (!effects.length) out.push(metric("阴阳雷", "阴阳逆转的叠雷数值解析失败，已保留解析告警等待补充。"));
      break;
    }
    case "backCallSkillMp":
      out.push(metric("魔法返还", `召唤物技能没有命中目标时，按该技能魔法消耗的${pct(a?.modifyVal || 0)}返还给萧嫣。`));
      break;
    case "backCallSkillMp1":
      out.push(metric("魔法返还", `石灵技能没有命中目标时，返还该技能魔法消耗的${[...new Set(Object.values(a?.modifyVals || {}).map((value) => pct(value)))].join("、")}。`));
      break;
    case "addMakeCmGreateCom":
      out.push(metric("吹奏切换", `场上存在石灵并待机${secondsFromFrames(a?.enterFrame || 0)}后，自动进入吹奏状态。`));
      break;
    case "lsnPlayerSkillAddSkillVal":
      out.push(metric("石灵强化", `吹奏状态下，石灵技能伤害提高；基础加成${pct(a?.addSkillPerBase || 0)}，距离超过${a?.unJudgeDis}后每${a?.unitDis}距离降低${pct(Math.abs(a?.unitDisAddPer || 0))}收益。`));
      break;
    case "flagDealComIds":
      out.push(metric("技能联动", "对应技能命中或治疗时，会启用被动追加的结算效果。"));
      break;
    case "skillConsumeMpAddBuffs":
      out.push(metric("生机层数", `消耗魔法时积累【生机盎然】：按本次魔法消耗 / 当前等级标准魔法 × ${pct(a?.standardPer || 0)}折算层数，每${pct(a?.perUnit || 0)}折算为1层。`));
      break;
    case "isBuffPileReleaseSkill":
      out.push(metric("免费释放", `【生机盎然】达到${a?.usePiles}层时，释放叶灵技能可消耗这些层数代替充能次数。`));
      break;
    case "playerRangeCountValue":
      out.push(metric("魔法节省", `萧嫣和附近召唤物释放技能时，魔法消耗${signedPct(a?.addPer || 0)}${a?.addVal ? `，固定变化${a.addVal}` : ""}。`));
      break;
    case "aetialGliding":
      out.push(metric("滑翔机制", `空中长按攻击可抓住风灵滑翔，初始能量${a?.maxEnergy}，滑翔时每帧消耗${a?.subEnergy}，落地每帧回复${a?.addEnergy}；游泳和腾云状态也可直接发动。`));
      break;
    case "addValDeal":
      out.push(metric("阴阳玉回复", `使用消耗阴阳玉的技能结束后积累回复进度，每次增加${a?.minAddVal === a?.maxAddVal ? a?.minAddVal : `${a?.minAddVal}-${a?.maxAddVal}`}点，达到${a?.maxVal}点回复1颗阴阳玉。`));
      break;
    case "countHpWithSkillMpDeal":
      out.push(metric("生命换玉", `释放阵法时，若当前生命不低于${pct(a?.maxValPer || 0)}，会额外支付“本次魔法消耗 × ${a?.rate}”的生命，获得${a?.backCount || 1}颗阴阳玉。`));
      break;
    case "xuannvBackEnergy":
      out.push(metric("阵法返还", `阵法结束时按剩余阴阳玉返还生命和魔法：每颗返还阵法魔法消耗的${pct(a?.backRate || 0)}，最高${pct(a?.maxBackRate || 0)}。`));
      break;
    case "addValue":
      out.push(metric("上限提升", `按“当前值 × ${pct(a?.per || 0)} + ${a?.val || 0}”提高对应资源上限。`));
      break;
    case "vskillWithPos":
      if (isXuannvBamenVskillBeskill(be)) {
        const effects = describeXuannvBamenFinish(be, ctx, warnings);
        out.push(...effects);
        if (!effects.length) out.push(metric("阵法结算", "八门破煞的阵法结算数值解析失败，已保留解析告警等待补充。"));
      } else {
        out.push(metric("阵法结算", `阵法销毁时按当前位置释放${idList(a?.vskillIds).length}段被动结算效果。`));
      }
      break;
    default:
      pushRaw();
      break;
  }

  if (!isXuannvBamenChargeBeskill(be) && !isXuannvLingzhenBeskill(be)) out.push(...linkedBuffMetrics(be.linkedBuffs || [], be, ctx));
  return out;
}

function simplifyBuff(buff) {
  if (!buff) return null;
  return {
    id: buff.id,
    group: buff.group,
    name: buff.name || `buff${buff.id}`,
    text: buff.text || null,
    type: buff.type ?? null,
    time: buff.time ?? null,
    interval: buff.interval ?? null,
    value: summarizeValue(buff.value),
    attribute: summarizeValue(buff.attribute),
    maxPiles: buff.maxPiles ?? null,
    attachBuff: cloneSimple(buff.attachBuff),
    endBuff: cloneSimple(buff.endBuff),
  };
}

function linkedBuffsFromRecord(record, ctx) {
  return linkedBuffsFromBeskill(record, ctx);
}

function simplifyBeskill(id, source, ctx, warnings, passiveLevel) {
  const be = ctx.beskillById.get(id);
  if (!be) {
    warnings.push({ code: "MISSING_BESKILL", detail: `passive beskill ${id} 缺失` });
    return null;
  }
  const simplified = {
    id: be.id,
    source,
    name: be.name || `beskill${id}`,
    label: be.label || null,
    type: be.type ?? null,
    scope: summarizeValue(be.scope),
    scopeParam: summarizeValue(be.scopeParam),
    inherit: be.inherit ?? null,
    rate: be.rate ?? null,
    initCd: be.initCd ?? null,
    cd: be.cd ?? null,
    chargedInitCd: be.chargedInitCd ?? null,
    chargedCd: be.chargedCd ?? null,
    chargedNumber: be.chargedNumber ?? null,
    attribute: summarizeValue(be.attribute),
    otherData: summarizeValue(be.otherData),
    effect: summarizeValue(be.effect),
    initEffect: summarizeValue(be.initEffect),
    text: be.text || null,
    desc: be.desc || null,
    passiveLevel: passiveLevel ?? null,
    linkedBuffs: linkedBuffsFromRecord(be, ctx),
  };
  simplified.effects = describeBeskill(simplified, ctx, warnings);
  return simplified;
}

function flattenMakeUpBeskillIds(makeUpBeskillId) {
  const out = [];
  if (!makeUpBeskillId) return out;
  for (const [trigger, ids] of Object.entries(makeUpBeskillId)) {
    for (const id of asArray(ids).flat(Infinity)) {
      if (typeof id === "number") out.push({ id, trigger });
    }
  }
  return out;
}

function levelToCardLevel(row, ctx, warnings) {
  const directBeskills = asArray(row.beskillId)
    .filter((id) => typeof id === "number")
    .map((id) => simplifyBeskill(id, "beskillId", ctx, warnings, row.level))
    .filter(Boolean);
  const makeUpBeskills = flattenMakeUpBeskillIds(row.makeUpBeskillId)
    .map(({ id, trigger }) => simplifyBeskill(id, `makeUpBeskillId:${trigger}`, ctx, warnings, row.level))
    .filter(Boolean);
  const initializeBeskills = asArray(row.initialize)
    .filter((id) => typeof id === "number")
    .map((id) => simplifyBeskill(id, "initialize", ctx, warnings, row.level))
    .filter(Boolean);

  return {
    level: row.level,
    roleLevel: row.roleLevel ?? null,
    consumeMp: null,
    segmentVals: [],
    totalPer: null,
    totalVal: null,
    growthBuffs: [],
    passive: {
      id: row.id,
      group: row.group,
      passiveName: row.passiveName,
      text: row.text || null,
      unlockType: row.unlockType ?? null,
      number: cloneSimple(row.number),
      rankCost: u.parseCost(row.rankCost),
      inherit: row.inherit ?? null,
      label: row.label ?? null,
      stageType: cloneSimple(row.stageType),
      stageTypeNo: cloneSimple(row.stageTypeNo),
      closeRankUp: cloneSimple(row.closeRankUp),
      directBeskills,
      makeUpBeskills,
      initializeBeskills,
    },
  };
}

function buildPassiveCard(group, rows, ctx) {
  const warnings = [];
  const sorted = [...rows].sort((left, right) => left.level - right.level || left.id - right.id);
  const first = sorted[0];
  const levels = sorted.map((row) => levelToCardLevel(row, ctx, warnings));

  return {
    skillId: first.group,
    name: cleanPassiveName(first.passiveName) || `被动${group}`,
    icon: first.icon ?? null,
    attribute: null,
    entityAction: null,
    concreteSkillIds: [],
    desIntro: first.text || null,
    header: {
      kind: "passive",
      segments: [],
      segCount: 0,
      totalPer: null,
      releaseFrames: null,
      releaseSeconds: null,
      releaseTimeSource: "passiveSkill",
      cd: null,
      addDefendVal: null,
      cfgFileResolved: null,
      cfgResolveSource: "passiveSkill",
      fixedBuffs: [],
      metrics: [],
      note: first.stringText || null,
    },
    maxLevel: Math.max(...levels.map((level) => level.level)),
    levels,
    warnings,
    passiveKind: true,
  };
}

function buildRolePassiveSlots(roleId, existingCtx = {}) {
  const passiveRows = u.loadTable("passiveSkill").filter((row) => row.roleType === roleId);
  const buffRows = u.loadTable("buff");
  const skillLevelRows = u.loadTable("skillLevel");
  const ctx = {
    buffRows: existingCtx.buffRows || buffRows,
    buffById: existingCtx.buffById || idx(buffRows),
    beskillById: existingCtx.beskillById || idx(u.loadTable("beskill")),
    skillById: existingCtx.skillById || idx(u.loadTable("skill")),
    skillLevelById: existingCtx.skillLevelById || idx(skillLevelRows),
    monsterById: existingCtx.monsterById || idx(u.loadTable("monster")),
    xuannvFieldReleaseFrames: existingCtx.xuannvFieldReleaseFrames,
  };
  return [...groupBy(passiveRows, (row) => row.group).entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([group, rows], index) => ({
      slot: `passive${index + 1}`,
      slotLabel: `角色被动${index + 1}`,
      isTrans: false,
      base: buildPassiveCard(group, rows, ctx),
      awakens: [],
      allAwakenIdentical: false,
    }));
}

module.exports = {
  buildRolePassiveSlots,
};
