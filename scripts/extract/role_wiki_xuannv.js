/**
 * 角色技能 Wiki - 玄女提取脚本
 *
 * 玄女的攻略口径和配置段数差异较大：大量技能存在多连击减伤、奇门衍生、变身形态、
 * 二段/双形态技能。这里按《【结弦】玄女角色解析【数值+机制+玩法点评】——ver3》
 * 的“正常伤害段数”和释放用时修正输出；固伤成长仍取当前 dataApi skillLevel。
 */
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");
const passiveCards = require("./lib/role-passive-cards");

const GAME_FPS = 30;
const QICAI_STONE_SKILL_ID = 9001041;
const QICAI_HEAL_BESKILL_ID = 12601202;
const YUNYING_SKILL_ID = 9001037;
const YUNYING_FIRST_BUFF_ID = 161000201;
const YUNYING_SLOW_BUFF_ID = 4066701;
const UNIMPLEMENTED_FIXED_BUFF_IDS = new Set([
  136021201, // 肃杀之虎骑虎表现/聚怪位移标记,无实际效果
  136021701, // 龙虎加速标记,未实装
  295000801, // 龙虎后续奇门遁阵加速,未实装
]);

const DEFAULT_METRICS = [
  { key: "manaConv", label: "蓝转", scope: "level", expr: "totalVal / consumeMp", when: "totalVal * consumeMp", fixed: 2 },
  { key: "healManaConv", label: "蓝转血", scope: "level", skill: QICAI_STONE_SKILL_ID, expr: "healVal / consumeMp", when: "healVal * consumeMp", fixed: 2 },
  { key: "atkConv", label: "攻转", scope: "level", expr: "totalPer / releaseSeconds", when: "totalPer * releaseSeconds", fixed: 3 },
];

const ROLE_OVERRIDE = "xuannv";
const GUIDE_PATH = "D:/zmws/保存网页资源/4399_Threads_Download/【结弦】玄女角色解析【数值+机制+玩法点评】——ver3_51982611/content_with_images.md";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const ROLE_ID = 9;
const TRANS_MONSTER_ID = 190;
const BASE_FIELD_SKILL_ID = 9001060;
const GUIDE_SOURCE = "guide:xuannvWiki:ver3";

const SLOTS = [
  { key: "skill1", label: "技能1" },
  { key: "skill2", label: "技能2" },
  { key: "skill3", label: "技能3" },
  { key: "skill4", label: "技能4" },
  { key: "trick", label: "绝技" },
  { key: "transSkill1", label: "无双技能1" },
  { key: "transSkill2", label: "无双技能2" },
  { key: "transSkill3", label: "无双技能3" },
  { key: "transSkill4", label: "无双技能4" },
];

const EXTRA_SLOTS = [
  { slot: "qimen-skill1", label: "技能1 · 奇门衍生", skillId: 9001039 },
  { slot: "qimen-skill1-awaken1", label: "技能1觉醒1 · 奇门衍生", skillId: 9001032 },
  { slot: "qimen-skill1-awaken2", label: "技能1觉醒2 · 奇门衍生", skillId: 9001037 },
  { slot: "qimen-skill2", label: "技能2 · 奇门衍生", skillId: 9001049 },
  { slot: "qimen-skill2-awaken1", label: "技能2觉醒1 · 奇门衍生", skillId: 9001042 },
  { slot: "qimen-skill2-awaken2", label: "技能2觉醒2 · 奇门衍生", skillId: 9001047 },
  { slot: "qimen-skill3", label: "技能3 · 奇门衍生", skillId: 9001058 },
  { slot: "qimen-skill3-awaken1", label: "技能3觉醒1 · 奇门衍生", skillId: 9001052 },
  { slot: "qimen-skill3-awaken2", label: "技能3觉醒2 · 奇门衍生", skillId: 9001057 },
];

const TRANS_EXTRA_AFTER_SLOT = new Map([
  ["transSkill2", [{ slot: "transSkill2-second", label: "无双技能2 · 二段", skillId: 9001223, isTrans: true }]],
  ["transSkill3", [{ slot: "transSkill3-alt", label: "无双技能3 · 形态2", skillId: 9001233, isTrans: true }]],
]);

const SLOT_EXPORT_ORDER = [
  ...SLOTS.filter((slot) => !/^transSkill/.test(slot.key)),
  ...EXTRA_SLOTS,
  ...SLOTS.filter((slot) => /^transSkill/.test(slot.key)),
];

const FORCE_DISTINCT_AWAKENS = new Set([
  9001061, // 九天: 阴阳玉数量/上限不同
  9001066, // 九地: 阵内友方防御提升
  9001071, // 兵魂天书: 召唤兵魂
  9001076, // 两仪宝伞: 护盾机制
]);

const NO_DAMAGE_SKILLS = new Set([
  9001030, // 风翎遁本体为位移,伤害来自奇门风袭
  9001037, // 云影双遁为位移/分身/标记机制
  9001060,
  9001061,
  9001066,
]);

const QIMEN_JADE_COST = new Map([
  [9001039, 1],
  [9001032, 1],
  [9001037, 1],
  [9001049, 1],
  [9001042, 2],
  [9001047, 1],
  [9001058, 3],
  [9001052, 3],
  [9001057, 3],
]);

const GUIDE_RELEASE_SECONDS = new Map([
  [9001030, 0.467],
  [9001039, 0.533],
  [9001031, 0.467],
  [9001032, 0.533],
  [9001060, 1.533],
  [9001061, 1.533],
  [9001066, 1.533],
  [9001040, 1.067],
  [9001049, 0.867],
  [9001041, 1.067],
  [9001042, 0.867],
  [9001046, 1.067],
  [9001047, 0.867],
  [9001050, 1.267],
  [9001058, 1.7],
  [9001051, 1.267],
  [9001052, 1.7],
  [9001056, 1.267],
  [9001057, 1.367],
  [9001211, 0.633],
  [9001221, 0.833],
  [9001223, 1.033],
  [9001231, 1.667],
  [9001233, 1.667],
  [9001241, 2.4],
]);

const UNKNOWN_RELEASE_SKILLS = new Set([
  9001070,
  9001071,
  9001076,
]);

const GUIDE_NOTES = new Map([
  [9001030, "说明:风翎遁本体按位移技能处理；造成伤害的风袭作为独立“奇门衍生”卡展示。"],
  [9001039, "说明:风袭为奇门衍生技，消耗1颗阴阳玉；蓝转按“本技能蓝耗 + 四技能蓝耗×1/4”修正。"],
  [9001031, "说明:巽风遁为位移+旋风；直接伤害按9段展示，不耗蓝。"],
  [9001032, "说明:玄风遁合为奇门衍生技，消耗1颗阴阳玉；按正常伤害3段展示，后续命中有大幅减伤。"],
  [9001036, "说明:坤云遁为防守位移，云雾期间减伤99%；受到攻击时触发6段反击并致盲/暂停AI。"],
  [9001037, "说明:云影双遁为奇门衍生位移，消耗1颗阴阳玉；生成化身并给后续两次伤害技能附加减速/暴击效果。"],
  [9001040, "说明:玄空斩可取消后摇，攻转标记为净攻转；空中最多释放一次。"],
  [9001049, "说明:天岚疾斩为奇门衍生技，消耗1颗阴阳玉；蓝转按“本技能蓝耗 + 四技能蓝耗×1/4”修正。"],
  [9001041, "说明:九彩神石以11段直伤展示，无固伤；升级项为蓝耗和回复量，九彩琉璃回复量按实际成长数据展示。"],
  [9001042, "说明:愈生之雀为奇门衍生技，消耗2颗阴阳玉；伤害范围为1段主伤 + 0~6段幼雀追击，按满6段追击展示。"],
  [9001046, "说明:天机葫芦持续打击11段，并叠加断魂宝光；累积层数后扣除目标保护分。"],
  [9001047, "说明:虚诈之蛇为奇门衍生技，消耗1颗阴阳玉；额外暗伤按目标伤势触发，小怪低血量可斩杀。"],
  [9001050, "说明:灵剑千锋共13段，对同一目标第11~13段伤害大幅下降，因此按正常伤害10段展示。"],
  [9001058, "说明:玄剑齐射为奇门衍生技，消耗3颗阴阳玉；第11段起大幅减伤，因此按10段展示。"],
  [9001051, "说明:桃木剑势共26段，对同一目标第21段起大幅减伤，因此按正常伤害20段展示。"],
  [9001052, "说明:肃杀之虎为奇门衍生技，消耗3颗阴阳玉；按猛扑1段 + 龙卷9段展示。"],
  [9001056, "说明:照妖神镜按8段展示；定位为站桩输出，对不动目标收益较高。"],
  [9001057, "说明:威悍之龙为奇门衍生技，消耗3颗阴阳玉；对免疫控制目标额外增伤10%。"],
  [9001060, "说明:奇门遁阵开启阵法并凝聚4颗阴阳玉，上限7颗；阵内自身增伤10%，阵内敌人受玄女伤害+10%，持续90s。"],
  [9001061, "说明:九天阵法范围扩大，凝聚5颗阴阳玉且上限+1，蓝耗+16.7%。"],
  [9001066, "说明:九地阵法范围扩大，阵内友方防御力提升，蓝耗不变。"],
  [9001070, "说明:化身元君变身后全程霸体，造成伤害+30%，受到伤害-30%；开启打击按4×atk强攻展示。"],
  [9001071, "说明:兵魂天书在变身后召唤2位兵魂战将；兵魂血量继承玄女60%，其他属性100%。"],
  [9001076, "说明:两仪宝伞在变身后附加10s护盾，自身护盾值=19%最大生命，友方按人数分摊。"],
  [9001211, "说明:凌风诛邪不耗蓝，位移期间闪避大幅提升；只对处于攻击中的敌人触发3段风刃反击。"],
  [9001221, "说明:灵雀缚罡同一目标第11段起大幅减伤，因此按10段展示；2s内可再次按键释放剑势化蛇。"],
  [9001223, "说明:剑势化蛇为无双技能2二段；按1段展示，额外暗伤按目标伤势触发，小怪低血量可斩杀。"],
  [9001231, "说明:双刺龙吟为无双技能3形态1，按7段戳刺 + 1段龙吟重击展示，并附加降低防御效果。"],
  [9001233, "说明:玄锋虎啸为无双技能3形态2，二次按键触发；按7段戳刺 + 1段虎啸重击展示，并附加降低攻击效果。"],
  [9001241, "说明:天渊剑墟按10段落剑 + 1段下坠展示；落剑无固伤，1.2s后可快速下坠收招。"],
]);

const GUIDE_DAMAGE = new Map([
  [9001030, { segments: [] }],
  [9001039, { segments: [{ skillId: 9001039, per: 0.1786, val: "damageAddVal", maxHit: 7, from: "guide:风袭7连击" }] }],
  [9001031, { segments: [{ skillId: 9001031, per: "damageAddPer", val: "damageAddVal", maxHit: 9, from: "guide:巽风遁9连击" }] }],
  [9001032, { segments: [{ skillId: 9001032, per: 0.1786, val: "damageAddVal", maxHit: 3, from: "guide:玄风遁合正常3段" }] }],
  [9001036, { segments: [{ skillId: 9001036, per: 0.2083, val: 0, maxHit: 6, from: "guide:坤云遁受击反击6段" }] }],
  [9001037, { segments: [] }],
  [9001040, { segments: [{ skillId: 9001040, per: "damageAddPer", val: "damageAddVal", maxHit: 6, from: "guide:玄空斩6连击" }] }],
  [9001049, { segments: [{ skillId: 9001049, per: "damageAddPer", val: "damageAddVal", maxHit: 4, from: "guide:天岚疾斩4连击" }] }],
  [9001041, { segments: [{ skillId: 9001041, per: "damageAddPer", val: 0, maxHit: 11, from: "guide:九彩神石11连击无固伤" }] }],
  [9001042, { segments: [{ skillId: 9001042, per: 1.7417, val: 0, maxHit: 1, from: "guide:愈生之雀主击" }, { skillId: 9001042, per: 0.1264, val: 0, maxHit: 6, from: "guide:愈生之雀幼雀追击上限" }] }],
  [9001046, { segments: [{ skillId: 9001046, per: "damageAddPer", val: "damageAddVal", maxHit: 11, from: "guide:天机葫芦11连击" }] }],
  [9001047, { segments: [{ skillId: 9001047, per: "damageAddPer", val: "damageAddVal", maxHit: 1, from: "guide:虚诈之蛇1段" }] }],
  [9001050, { segments: [{ skillId: 9001050, per: "damageAddPer", val: "damageAddVal", maxHit: 10, from: "guide:灵剑千锋正常10段" }] }],
  [9001058, { segments: [{ skillId: 9001058, per: "damageAddPer", val: "damageAddVal", maxHit: 10, from: "guide:玄剑齐射正常10段" }] }],
  [9001051, { segments: [{ skillId: 9001051, per: "damageAddPer", val: "damageAddVal", maxHit: 20, from: "guide:桃木剑势正常20段" }] }],
  [9001052, { segments: [{ skillId: 9001052, per: 3.975, val: { bulletId: 6719 }, maxHit: 1, from: "guide:肃杀之虎猛扑" }, { skillId: 9001052, per: 0.0456, val: { bulletId: 6728 }, maxHit: 9, from: "guide:肃杀之虎龙卷9段" }] }],
  [9001056, { segments: [{ skillId: 9001056, per: "damageAddPer", val: "damageAddVal", maxHit: 8, from: "guide:照妖神镜8连击" }] }],
  [9001057, { segments: [{ skillId: 9001057, per: "damageAddPer", val: "damageAddVal", maxHit: 1, from: "guide:威悍之龙1段" }] }],
  [9001060, { segments: [] }],
  [9001061, { segments: [] }],
  [9001066, { segments: [] }],
  [9001070, { segments: [{ skillId: 9001070, per: 4, val: 0, maxHit: 1, from: "guide:化身元君开启强攻" }] }],
  [9001071, { segments: [{ skillId: 9001071, per: 4, val: 0, maxHit: 1, from: "guide:化身元君开启强攻" }] }],
  [9001076, { segments: [{ skillId: 9001076, per: 4, val: 0, maxHit: 1, from: "guide:化身元君开启强攻" }] }],
  [9001211, { segments: [{ skillId: 9001212, per: 0.6, val: 0, maxHit: 3, from: "guide:凌风诛邪风刃反击3段" }] }],
  [9001221, { segments: [{ skillId: 9001221, per: 0.238, val: "damageAddVal", maxHit: 10, from: "guide:灵雀缚罡正常10段" }] }],
  [9001223, { segments: [{ skillId: 9001223, per: 1.706, val: "damageAddVal", maxHit: 1, from: "guide:剑势化蛇1段" }] }],
  [9001231, { segments: [{ skillId: 9001231, per: "damageAddPer", val: "damageAddVal", maxHit: 7, from: "guide:双刺龙吟戳刺7段" }, { skillId: 9001232, per: "damageAddPer", val: "damageAddVal", maxHit: 1, from: "guide:双刺龙吟重击" }] }],
  [9001233, { segments: [{ skillId: 9001231, per: "damageAddPer", val: "damageAddVal", maxHit: 7, from: "guide:玄锋虎啸戳刺7段" }, { skillId: 9001233, per: "damageAddPer", val: "damageAddVal", maxHit: 1, from: "guide:玄锋虎啸重击" }] }],
  [9001241, { segments: [{ skillId: 9001242, per: "damageAddPer", val: 0, maxHit: 10, from: "guide:天渊剑墟落剑10段无固伤" }, { skillId: 9001243, per: "damageAddPer", val: "damageAddVal", maxHit: 1, from: "guide:天渊剑墟下坠" }] }],
]);

const BIND_SOURCE_LABEL = {
  beSkill: "被动技能",
  beSkill2: "被动技能",
  entityActionComBuff: "技能附带",
  bulletHitBuff: "命中附带",
  bulletFirstHitBuff: "首次命中",
};

function idx(arr) {
  const m = new Map();
  for (const r of arr) m.set(r.id, r);
  return m;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function resolveRawBuff(buff, buffById) {
  if (!buff) return buff;
  if ((buff.value === null || buff.value === undefined) && Array.isArray(buff.attachBuff) && buff.attachBuff.length > 0) {
    const attached = buffById.get(buff.attachBuff[0]);
    if (attached) return { ...buff, value: attached.value };
  }
  return buff;
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

function loadQicaiHealValues(ctx) {
  if (ctx.qicaiHealValues) return ctx.qicaiHealValues;
  const beskill = ctx.beskillById.get(QICAI_HEAL_BESKILL_ID);
  const values = beskill?.attribute?.healValues;
  if (!Array.isArray(values) || values.some((v) => typeof v !== "number")) {
    throw new Error(`九彩神石回复量缺少 ${QICAI_HEAL_BESKILL_ID}.attribute.healValues`);
  }
  ctx.qicaiHealValues = values;
  return values;
}

function qicaiHealValue(ctx, level) {
  const values = loadQicaiHealValues(ctx);
  const value = values[level - 1];
  if (typeof value !== "number") {
    throw new Error(`九彩神石回复量缺少 Lv.${level}: ${QICAI_HEAL_BESKILL_ID}.attribute.healValues`);
  }
  return value;
}

function qicaiHealGrowthRef(ctx) {
  loadQicaiHealValues(ctx);
  return {
    manual: "qicaiHeal",
    name: "九彩琉璃回复",
    bindLabel: "命中附带",
    time: GAME_FPS,
  };
}

function requireBuff(ctx, buffId, label) {
  const buff = ctx.buffById.get(buffId);
  if (!buff) throw new Error(`${label} 缺少 buff ${buffId}`);
  return buff;
}

function requireSingleBuffId(value, label) {
  if (!Array.isArray(value) || value.length !== 1 || typeof value[0] !== "number") {
    throw new Error(`${label} 需要唯一 buff id, 当前值=${JSON.stringify(value)}`);
  }
  return value[0];
}

function yunyingFirstEffect(ctx, firstBuff) {
  const slowBuff = requireBuff(ctx, YUNYING_SLOW_BUFF_ID, "云影双遁减速");
  if (!Array.isArray(firstBuff.value) || firstBuff.value.length === 0 || firstBuff.value.some((id) => id !== YUNYING_SLOW_BUFF_ID)) {
    throw new Error(`云影双遁 ${YUNYING_FIRST_BUFF_ID}.value 应全部指向减速 buff ${YUNYING_SLOW_BUFF_ID}, 当前值=${JSON.stringify(firstBuff.value)}`);
  }
  if (slowBuff.maxPiles !== firstBuff.value.length) {
    throw new Error(`云影双遁减速层数不一致: ${YUNYING_FIRST_BUFF_ID}.value=${firstBuff.value.length}, ${YUNYING_SLOW_BUFF_ID}.maxPiles=${slowBuff.maxPiles}`);
  }
  const slowValue = buffValueSummary(slowBuff);
  if (typeof slowValue?.per !== "number" || typeof slowBuff.time !== "number") {
    throw new Error(`云影双遁减速 buff ${YUNYING_SLOW_BUFF_ID} 缺少比例或持续帧: value=${JSON.stringify(slowBuff.value)}, time=${slowBuff.time}`);
  }
  return {
    baseBuffId: YUNYING_FIRST_BUFF_ID,
    name: firstBuff.name || "双云映日·壹",
    text: firstBuff.text || null,
    time: firstBuff.time ?? null,
    bindSource: "entityActionComBuff",
    bindLabel: "技能附带",
    levelMode: "fixed",
    value: null,
    displayText: `第一次伤害技能附加${slowBuff.maxPiles}层减速，每层${(Math.abs(slowValue.per) * 100).toFixed(1)}%，每${round3(slowBuff.time / GAME_FPS)}s递减1层；触发后进入双云映日·贰。`,
  };
}

function yunyingCritValue(ctx, level) {
  const first = eng.resolveBuffGrowth(YUNYING_FIRST_BUFF_ID, level, ctx.buffById, []);
  const firstBuff = first.buff;
  if (!firstBuff) throw new Error(`云影双遁 Lv.${level} 缺少 ${YUNYING_FIRST_BUFF_ID} 成长 buff`);
  const secondBuffId = requireSingleBuffId(firstBuff.endBuff, `云影双遁 Lv.${level} ${first.effectiveBuffId}.endBuff`);
  const secondBuff = requireBuff(ctx, secondBuffId, `云影双遁 Lv.${level} 双云映日·贰`);
  const critBuffId = requireSingleBuffId(secondBuff.value, `云影双遁 Lv.${level} ${secondBuffId}.value`);
  const critBuff = requireBuff(ctx, critBuffId, `云影双遁 Lv.${level} 暴击强化`);
  const critValue = buffValueSummary(critBuff);
  if (typeof critValue?.val !== "number") {
    throw new Error(`云影双遁 Lv.${level} 暴击强化 ${critBuffId} 缺少固定值: value=${JSON.stringify(critBuff.value)}`);
  }
  return {
    value: critValue.val,
    secondBuff,
  };
}

function yunyingCritGrowthRef(ctx) {
  yunyingCritValue(ctx, 1);
  return {
    manual: "yunyingCrit",
    name: "双云映日·贰",
    bindLabel: "技能附带",
    time: -1,
  };
}

function engineBuffText(buff) {
  const v = buffValueSummary(buff);
  if (!v) return null;
  const parts = [];
  if (typeof v.per === "number" && v.per !== 0) parts.push(`${(v.per * 100).toFixed(1)}%`);
  if (typeof v.val === "number" && v.val !== 0) parts.push(String(v.val));
  return parts.length ? parts.join(" + ") : null;
}

function resolveXuannvCfgFile(skill, slot, roleId, monsterById, warnings) {
  const isTrans = /^transSkill/.test(slot || "") || skill.id >= 9001200;
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

  const selfMonster = monsterById.get(roleId);
  const transMonster = monsterById.get(TRANS_MONSTER_ID);
  const order = isTrans ? [transMonster, ...ownerMonsters, selfMonster] : [selfMonster, ...ownerMonsters, transMonster];

  for (const m of order) {
    if (!m) continue;
    const cfg = tryCfg(m.cfgFile);
    if (cfg) {
      return {
        cfgFileResolved: m.cfgFile,
        cfgResolveSource: m.id === TRANS_MONSTER_ID ? "transForm" : (m.id === roleId ? "self" : "ownerMonster"),
        cfgMonsterId: m.id,
        cfgMonsterName: m.name,
        hasActionCfg: true,
        actionCfg: cfg[action],
        entityCfg: cfg,
      };
    }
  }

  const fallback = (isTrans && transMonster?.cfgFile) || selfMonster?.cfgFile || null;
  if (fallback && action) {
    const fallbackCfg = eng.loadEntityCfg(fallback);
    if (fallbackCfg && fallbackCfg[action]) {
      return {
        cfgFileResolved: fallback,
        cfgResolveSource: "fallback",
        cfgMonsterId: isTrans ? transMonster?.id ?? null : selfMonster?.id ?? null,
        cfgMonsterName: isTrans ? transMonster?.name ?? null : selfMonster?.name ?? null,
        hasActionCfg: true,
        actionCfg: fallbackCfg[action],
        entityCfg: fallbackCfg,
      };
    }
  }

  if (action) warnings.push({ code: eng.WARN.MISSING_ACTION_CFG, detail: `skill ${skill.id} action=${action} 找不到动作配置` });
  return {
    cfgFileResolved: fallback,
    cfgResolveSource: "fallback",
    cfgMonsterId: selfMonster ? selfMonster.id : null,
    cfgMonsterName: selfMonster ? selfMonster.name : null,
    hasActionCfg: false,
    actionCfg: null,
    entityCfg: fallback ? eng.loadEntityCfg(fallback) : null,
  };
}

function guideRelease(displaySkillId, cfg, actionSkill, warnings) {
  const seconds = GUIDE_RELEASE_SECONDS.get(displaySkillId);
  if (typeof seconds === "number") {
    return {
      releaseFrames: Math.round(seconds * GAME_FPS),
      releaseSeconds: seconds,
      releaseTimeSource: `${GUIDE_SOURCE}:释放用时`,
    };
  }
  if (UNKNOWN_RELEASE_SKILLS.has(displaySkillId)) {
    return {
      releaseFrames: null,
      releaseSeconds: null,
      releaseTimeSource: `${GUIDE_SOURCE}:攻略未给出释放用时`,
    };
  }
  return eng.resolveReleaseTime(cfg.entityCfg, actionSkill.entityAction, cfg.hasActionCfg, warnings);
}

function maxLevelForDisplay(displaySkillId, displaySkill, ctx) {
  const levels = [eng.detectMaxLevel(displaySkill, ctx.skillLevelById)];
  const rule = GUIDE_DAMAGE.get(displaySkillId);
  for (const seg of rule?.segments || []) {
    const skill = ctx.skillById.get(seg.skillId);
    if (skill) levels.push(eng.detectMaxLevel(skill, ctx.skillLevelById));
  }
  const max = Math.max(...levels.filter((n) => n > 0));
  return Number.isFinite(max) && max > 0 ? max : 0;
}

function queryRow(skill, level, ctx, warnings) {
  return eng.querySkillLevel(skill, level, ctx.skillLevelById, warnings);
}

function firstBulletVal(row, bulletId, skillId) {
  if (!row || !Array.isArray(row.bullet)) {
    throw new Error(`玄女攻略段 skill ${skillId} 需要 bullet ${bulletId}, 但 skillLevel 未导出 bullet 分支`);
  }
  const index = row.bullet.indexOf(bulletId);
  if (index < 0) {
    throw new Error(`玄女攻略段 skill ${skillId} 需要 bullet ${bulletId}, 当前 skillLevel.bullet=${JSON.stringify(row.bullet)}`);
  }
  const arr = row.bulletDamageAddVal && row.bulletDamageAddVal[index];
  if (Array.isArray(arr) && typeof arr[0] === "number") return arr[0];
  if (typeof arr === "number") return arr;
  throw new Error(`玄女攻略段 skill ${skillId} bullet ${bulletId} 缺少 bulletDamageAddVal`);
}

function resolveSegmentValue(spec, row, skillId) {
  if (typeof spec === "number") return spec;
  if (spec === "damageAddVal") return row?.damageAddVal ?? 0;
  if (spec && typeof spec === "object" && typeof spec.bulletId === "number") return firstBulletVal(row, spec.bulletId, skillId);
  return 0;
}

function resolveSegmentPer(spec, row) {
  if (typeof spec === "number") return spec;
  if (spec === "damageAddPer") return row?.damageAddPer ?? 0;
  return 0;
}

function resolveConsumeMp(displaySkillId, displayRow, level, ctx, warnings) {
  const rawMp = displayRow?.consumeMp ?? null;
  const jadeCost = QIMEN_JADE_COST.get(displaySkillId);
  if (!jadeCost) return rawMp;

  const fieldSkill = ctx.skillById.get(BASE_FIELD_SKILL_ID);
  if (!fieldSkill) {
    warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `奇门蓝转修正缺少四技能 ${BASE_FIELD_SKILL_ID}` });
    return rawMp;
  }
  const fieldRow = queryRow(fieldSkill, level, ctx, warnings);
  if (!fieldRow || typeof fieldRow.consumeMp !== "number" || typeof rawMp !== "number") return rawMp;
  return round3(rawMp + fieldRow.consumeMp * jadeCost / 4);
}

function collectConcreteIds(displaySkillId) {
  const rule = GUIDE_DAMAGE.get(displaySkillId);
  if (!rule) return [displaySkillId];
  const ids = [displaySkillId];
  for (const seg of rule.segments || []) {
    if (!ids.includes(seg.skillId)) ids.push(seg.skillId);
  }
  return ids;
}

function computeXuannvLevel(displaySkillId, displaySkill, level, ctx, warnings) {
  const displayRow = queryRow(displaySkill, level, ctx, warnings);
  if (!displayRow) return null;

  const rule = GUIDE_DAMAGE.get(displaySkillId);
  let segments = [];
  if (rule) {
    for (const seg of rule.segments || []) {
      const skill = ctx.skillById.get(seg.skillId);
      if (!skill) {
        warnings.push({ code: eng.WARN.MISSING_SKILL, detail: `玄女攻略段缺少 skill ${seg.skillId}` });
        continue;
      }
      const row = queryRow(skill, level, ctx, warnings);
      if (!row) continue;
      segments.push({
        per: resolveSegmentPer(seg.per, row),
        val: resolveSegmentValue(seg.val, row, seg.skillId),
        maxHit: seg.maxHit,
        from: seg.from,
      });
    }
  } else if (!NO_DAMAGE_SKILLS.has(displaySkillId)) {
    const cfg = resolveXuannvCfgFile(displaySkill, "", ROLE_ID, ctx.monsterById, warnings);
    const dmg = eng.computeDamageSegments(displaySkill, displayRow, cfg.actionCfg, warnings);
    segments = dmg.segments || [];
  }

  const totalPer = round3(segments.reduce((sum, seg) => sum + (seg.per || 0) * (seg.maxHit || 1), 0));
  const totalVal = round3(segments.reduce((sum, seg) => sum + (seg.val || 0) * (seg.maxHit || 1), 0));

  return {
    level,
    roleLevel: displayRow.roleLevel ?? null,
    consumeMp: resolveConsumeMp(displaySkillId, displayRow, level, ctx, warnings),
    soulCost: displayRow.soulCost ?? null,
    kind: rule ? "guide" : "normal",
    segments,
    totalPer,
    totalVal,
    addDefendVal: displayRow.addDefendVal ?? null,
  };
}

function collectXuannvBuffs(displaySkillId, concreteIds, slot, ctx, warnings) {
  const fixedBuffs = [];
  const growthBuffRefs = [];
  const seenBuffs = new Set();

  for (const skillId of concreteIds) {
    const skill = ctx.skillById.get(skillId);
    if (!skill) continue;
    const cfg = resolveXuannvCfgFile(skill, slot, ROLE_ID, ctx.monsterById, warnings);
    const refs = eng.scanBuffs(skill, cfg.actionCfg, ctx.beskillById, warnings);

    for (const ref of refs) {
      if (UNIMPLEMENTED_FIXED_BUFF_IDS.has(ref.baseBuffId)) continue;

      const seenKey = `${ref.baseBuffId}:${ref.bindSource}`;
      if (seenBuffs.has(seenKey)) continue;
      seenBuffs.add(seenKey);

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
      const label = `[buff ${ref.baseBuffId} ${base.name}] `;

      if (displaySkillId === YUNYING_SKILL_ID && ref.baseBuffId === YUNYING_FIRST_BUFF_ID) {
        fixedBuffs.push(yunyingFirstEffect(ctx, rawBuff1));
        growthBuffRefs.push(yunyingCritGrowthRef(ctx));
        if (ctx.emitTemplate) ctx.overrides.recordBuff(displaySkillId, ref.baseBuffId, rawBuff1, engineBuffText(rawBuff1));
        continue;
      }

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
        ctx.overrides.recordBuff(displaySkillId, ref.baseBuffId, rawBuff1, engineBuffText(rawBuff1));
      }
    }
  }

  return { fixedBuffs, growthBuffRefs };
}

function buildSkillCard(displaySkillId, slot, ctx) {
  const warnings = [];
  const displaySkill = ctx.skillById.get(displaySkillId);
  if (!displaySkill) {
    return { skillId: displaySkillId, error: "skill 不存在", warnings: [{ code: eng.WARN.MISSING_SKILL }] };
  }

  const concreteIds = collectConcreteIds(displaySkillId);
  const actionSkill = ctx.skillById.get(concreteIds.find((id) => id !== displaySkillId) || displaySkillId) || displaySkill;
  const cfg = resolveXuannvCfgFile(actionSkill, slot, ROLE_ID, ctx.monsterById, warnings);
  const maxLevel = maxLevelForDisplay(displaySkillId, displaySkill, ctx);
  const rel = guideRelease(displaySkillId, cfg, actionSkill, warnings);
  const { fixedBuffs, growthBuffRefs } = collectXuannvBuffs(displaySkillId, concreteIds, slot, ctx, warnings);
  if (displaySkillId === QICAI_STONE_SKILL_ID) growthBuffRefs.push(qicaiHealGrowthRef(ctx));

  const levels = [];
  for (let lv = 1; lv <= maxLevel; lv++) {
    const l = computeXuannvLevel(displaySkillId, displaySkill, lv, ctx, warnings);
    if (!l) continue;
    l.growthBuffs = growthBuffRefs.map((ref) => {
      if (ref.manual === "qicaiHeal" || ref.manual === true) {
        const heal = qicaiHealValue(ctx, lv);
        return {
          name: ref.name,
          bindLabel: ref.bindLabel,
          time: ref.time,
          value: { per: null, val: heal },
          displayText: `九彩琉璃：攻击该目标可回复${heal}生命值，持续1s`,
        };
      }
      if (ref.manual === "yunyingCrit") {
        const crit = yunyingCritValue(ctx, lv);
        return {
          name: ref.name,
          bindLabel: ref.bindLabel,
          time: crit.secondBuff.time ?? ref.time,
          value: { per: null, val: crit.value },
          displayText: `双云映日·贰：第二次伤害技能获得${crit.value}暴击值加成`,
        };
      }
      const g = eng.resolveBuffGrowth(ref.baseBuffId, lv, ctx.buffById, warnings);
      const rawBuffG = resolveRawBuff(g.buff, ctx.buffById);
      const engBuff = { name: ref.name, bindLabel: ref.bindLabel, time: ref.time, value: buffValueSummary(rawBuffG) };
      if (ref.override && rawBuffG) {
        const { merged, warnings: w } = ov.mergeBuff(engBuff, ref.override, rawBuffG, ref.label);
        if (lv === 1) warnings.push(...w);
        return merged;
      }
      return engBuff;
    });
    levels.push(l);
  }

  const lv1 = levels[0] || null;
  const card = {
    skillId: displaySkillId,
    name: displaySkill.desName || displaySkill.Name || `技能${displaySkillId}`,
    icon: displaySkill.icon || null,
    attribute: displaySkill.attribute ?? null,
    entityAction: actionSkill.entityAction || null,
    concreteSkillIds: concreteIds,
    desIntro: displaySkill.desIntro || null,
    header: {
      kind: lv1 ? lv1.kind : null,
      segments: lv1 ? lv1.segments.map((s) => ({ per: s.per, maxHit: s.maxHit, from: s.from })) : [],
      segCount: lv1 ? lv1.segments.reduce((a, s) => a + s.maxHit, 0) : 0,
      totalPer: lv1 ? lv1.totalPer : null,
      releaseFrames: rel.releaseFrames,
      releaseSeconds: rel.releaseSeconds,
      releaseTimeSource: rel.releaseTimeSource,
      cd: displaySkill.cd ?? null,
      addDefendVal: lv1 ? lv1.addDefendVal : null,
      cfgFileResolved: cfg.cfgFileResolved,
      cfgResolveSource: cfg.cfgResolveSource,
      fixedBuffs,
      metrics: metrics.computeMetrics(
        ctx.metricDefs, "header",
        { skillId: displaySkillId, totalPer: lv1 ? lv1.totalPer : null, releaseSeconds: rel.releaseSeconds, segCount: lv1 ? lv1.segments.reduce((a, s) => a + s.maxHit, 0) : 0 },
        ctx.helpers, warnings,
      ),
      note: GUIDE_NOTES.get(displaySkillId) || null,
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
          totalVal: l.totalVal,
          healVal: displaySkillId === QICAI_STONE_SKILL_ID ? qicaiHealValue(ctx, l.level) : null,
          releaseSeconds: rel.releaseSeconds,
          segCount: l.segments.reduce((a, s) => a + s.maxHit, 0),
          yunyingCritVal: displaySkillId === YUNYING_SKILL_ID ? yunyingCritValue(ctx, l.level).value : null,
          std: ctx.helpers.standard(l.roleLevel),
        },
        ctx.helpers, l.level === 1 ? warnings : [],
      ),
    })),
    warnings,
  };

  const skillOv = ctx.overrides.resolveSkill(displaySkillId);
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
  console.log("\n🪽 角色 Wiki → 玄女");

  const roleInitial = u.loadTable("roleInitial").find((r) => r.roleId === ROLE_ID);
  const role = u.loadTable("role").find((r) => r.id === ROLE_ID);
  const ctx = {
    skillById: idx(u.loadTable("skill")),
    skillLevelById: idx(u.loadTable("skillLevel")),
    monsterById: idx(u.loadTable("monster")),
    buffById: idx(u.loadTable("buff")),
    beskillById: idx(u.loadTable("beskill")),
    overrides: ov.loadOverrides(ROLE_OVERRIDE),
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

  const slots = [];
  const pushStandaloneCard = (extra) => {
    slots.push({
      slot: extra.slot,
      slotLabel: extra.label,
      isTrans: Boolean(extra.isTrans),
      base: buildSkillCard(extra.skillId, extra.slot, ctx),
      awakens: [],
      allAwakenIdentical: false,
    });
  };

  for (const slot of SLOT_EXPORT_ORDER) {
    if (slot.skillId != null) {
      pushStandaloneCard(slot);
      continue;
    }

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

    for (const extra of TRANS_EXTRA_AFTER_SLOT.get(slot.key) || []) pushStandaloneCard(extra);
  }

  if (EMIT_TEMPLATE) {
    const target = ctx.overrides.writeTemplate(FORCE);
    console.log(`  📝 模板已生成 → ${target}`);
    return;
  }

  const unused = ctx.overrides.finalizeWarnings();
  if (unused.length && slots[0]) slots[0].base.warnings.push(...unused);

  const fieldSlot = slots.find((slot) => slot.base?.skillId === BASE_FIELD_SKILL_ID);
  const passiveSlots = passiveCards.buildRolePassiveSlots(ROLE_ID, {
    ...ctx,
    xuannvFieldReleaseFrames: fieldSlot?.base?.header?.releaseFrames,
  });

  const payload = {
    role: {
      id: role.id,
      name: role.name,
      makeupMonsterId: role.makeupMonsterId,
      text: role.text,
      atkMultiplier: role.atk,
      guidePath: GUIDE_PATH,
      mechanics: {
        qimenExpand: roleInitial.otherData && roleInitial.otherData.expand ? roleInitial.otherData.expand : null,
        qimenManaFormula: "奇门技蓝耗 + 奇门遁阵蓝耗 × 阴阳玉消耗 / 4",
      },
    },
    slots,
    passiveSlots,
  };

  u.saveOutput("role_wiki_xuannv", payload, {
    system: "role_wiki",
    sourceFiles: ["roleInitial.*.json", "role.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "buff.*.json", "beskill.*.json", "bullets.json", "entityCtg/*.json", GUIDE_PATH],
    note: "玄女全技能 Wiki，按攻略 ver3 修正常态、奇门衍生和无双多阶段的正常伤害段数与释放用时。",
  });

  for (const s of slots) {
    const b = s.base;
    const top = b.levels && b.levels[b.levels.length - 1];
    const mv = (k) => { const m = top && top.metrics && top.metrics.find((x) => x.key === k); return m && m.display != null ? m.display : "—"; };
    console.log(`  ${s.slotLabel} ${b.name}(${b.skillId}): ${b.header.segCount}段 per=${b.header.totalPer} 帧=${b.header.releaseFrames} maxLv=${b.maxLevel} | 满级蓝转=${mv("manaConv")} 攻转=${mv("atkConv")}${b.warnings.length ? " ⚠" + b.warnings.length : ""}`);
    for (const a of s.awakens) {
      console.log(`     觉醒 ${a.name}(${a.skillId}): per=${a.header.totalPer}${a.identicalToBase ? " [与基础相同·可合并]" : " [不同·独立展示]"}${a.warnings.length ? " ⚠" + a.warnings.length : ""}`);
    }
  }
}

if (require.main === module) extract();
module.exports = extract;
