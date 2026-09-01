/**
 * 坐骑技能 Wiki - 哮天犬专项提取脚本
 */
const fs = require("fs");
const path = require("path");
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const metrics = require("./lib/metrics");

const OUTPUT_NAME = "ride_wiki_xiaotianquan";
const RIDE_ID = 241001;

const BIND_SOURCE_LABEL = {
  beSkill: "被动技能",
  beSkill2: "被动技能",
  entityActionComBuff: "技能附带",
  bulletHitBuff: "命中附带",
  passiveEffect: "被动效果",
  mechanismEffect: "机制效果",
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

function extract() {
  console.log("\n🐕 坐骑技能 Wiki → 哮天犬专项解析");

  const rawRides = JSON.parse(fs.readFileSync(u.findTableFile("ride"), "utf8"));
  const xtqRide = rawRides.find(r => r.id === RIDE_ID);
  if (!xtqRide) throw new Error("未在 ride 表中找到哮天犬 (id: " + RIDE_ID + ")");

  const rawSkills = JSON.parse(fs.readFileSync(u.findTableFile("skill"), "utf8"));
  const rawSkillLevels = JSON.parse(fs.readFileSync(u.findTableFile("skillLevel"), "utf8"));
  const rawMonsters = JSON.parse(fs.readFileSync(u.findTableFile("monster"), "utf8"));
  const rawBuffs = JSON.parse(fs.readFileSync(u.findTableFile("buff"), "utf8"));
  const rawBeskills = JSON.parse(fs.readFileSync(u.findTableFile("beskill"), "utf8"));

  const ctx = {
    rideById: idx(rawRides),
    skillById: idx(rawSkills),
    skillLevelById: idx(rawSkillLevels),
    monsterById: idx(rawMonsters),
    buffById: idx(rawBuffs),
    beskillById: idx(rawBeskills),
    standards: metrics.loadCommonStandards(),
  };
  ctx.metricDefs = DEFAULT_METRICS;
  ctx.helpers = {
    standard: (roleLevel) => (roleLevel != null ? (ctx.standards.get(roleLevel) ?? null) : null),
  };

  const xtqMonster = ctx.monsterById.get(xtqRide.monsterId);
  const slots = [];

  // ─── 1. 技能 1【犬影空袭】(20630010101) ───
  {
    const skillId = 20630010101;
    const skill = ctx.skillById.get(skillId);
    const maxLevel = 48;
    const releaseSeconds = 1.2;
    const totalPer = 2.64;
    const atkConvVal = round(totalPer / releaseSeconds);
    const levels = [];
    for (let lv = 1; lv <= maxLevel; lv++) {
      const sl = ctx.skillLevelById.get(skillId * 1000 + lv);
      if (!sl) continue;
      const singleVal = sl.damageAddVal;
      const totalVal = singleVal * 3;
      levels.push({
        level: lv,
        roleLevel: sl.roleLevel ?? null,
        consumeMp: 0,
        soulCost: sl.soulCost || [],
        segmentVals: [
          { val: singleVal, maxHit: 1 },
          { val: singleVal, maxHit: 1 },
          { val: singleVal, maxHit: 1 },
        ],
        totalPer,
        totalVal,
        growthBuffs: [],
        metrics: [
          { key: "atkConv", label: "攻转", value: atkConvVal, display: atkConvVal }
        ],
      });
    }

    const fixedBuffs = [
      effectCard(1058601, "流血联动", "mechanismEffect", "目标处于【流血】状态时，额外召唤幽狼下扑并附加【致残】"),
      effectCard(255002901, "致残", "mechanismEffect", "降低目标移动速度、跳跃力与技能位移效率"),
    ];

    slots.push({
      slot: "skillActive1",
      slotLabel: "技能1",
      slotKind: "active",
      base: {
        skillId,
        name: "犬影空袭",
        icon: skill.icon || null,
        attribute: skill.attribute ?? 7,
        entityAction: skill.entityAction,
        desIntro: skill.desIntro,
        header: {
          kind: "normal",
          segments: [
            { per: 0.88, maxHit: 1, from: "bullet" },
            { per: 0.88, maxHit: 1, from: "bullet" },
            { per: 0.88, maxHit: 1, from: "bullet" },
          ],
          segCount: 3,
          totalPer,
          releaseFrames: 36,
          releaseSeconds,
          releaseTimeSource: "entityCtg",
          cd: skill.cd || 8,
          addDefendVal: skill.addDefendVal || 100,
          fixedBuffs,
          metrics: [
            { key: "atkConv", label: "攻转", value: atkConvVal, display: atkConvVal }
          ],
        },
        maxLevel,
        slotLabel: "技能1",
        slotKind: "active",
        levels,
        warnings: [],
      },
      awakens: [],
      allAwakenIdentical: false,
    });
  }

  // ─── 2. 技能 2【恶犬冲击·基础冲锋】(20630010201) ───
  {
    const skillId = 20630010201;
    const skill = ctx.skillById.get(skillId);
    const maxLevel = 48;
    const releaseSeconds = 0.8;
    const totalPer = 3.19;
    const atkConvVal = round(totalPer / releaseSeconds);
    const levels = [];
    for (let lv = 1; lv <= maxLevel; lv++) {
      const sl = ctx.skillLevelById.get(skillId * 1000 + lv);
      if (!sl) continue;
      const totalVal = sl.damageAddVal;
      levels.push({
        level: lv,
        roleLevel: sl.roleLevel ?? null,
        consumeMp: 0,
        soulCost: sl.soulCost || [],
        segmentVals: [{ val: totalVal, maxHit: 1 }],
        totalPer,
        totalVal,
        growthBuffs: [],
        metrics: [
          { key: "atkConv", label: "攻转", value: atkConvVal, display: atkConvVal }
        ],
      });
    }

    const fixedBuffs = [
      effectCard(9001, "技能充能", "mechanismEffect", "初始与上限均为 2 次充能，每 9 秒恢复 1 次；释放一段不消耗充能"),
      effectCard(9002, "强化连携", "mechanismEffect", "冲锋一段距离后再次按下技能键，消耗 1 次充能触发【强化冲锋】"),
    ];

    slots.push({
      slot: "skillActive2",
      slotLabel: "技能2",
      slotKind: "active",
      base: {
        skillId,
        name: "恶犬冲击",
        icon: skill.icon || null,
        attribute: skill.attribute ?? 7,
        entityAction: skill.entityAction,
        desIntro: "哮天犬脚底生风往前冲锋，伤害沿途的敌人。在冲锋一段距离后按下技能键，将消耗1个充能进入强化冲锋，特效变大，速度变快，附加强攻击飞。",
        header: {
          kind: "normal",
          segments: [{ per: totalPer, maxHit: 1, from: "bullet" }],
          segCount: 1,
          totalPer,
          releaseFrames: 24,
          releaseSeconds,
          releaseTimeSource: "entityCtg",
          cd: skill.cd || 9,
          addDefendVal: skill.addDefendVal || 100,
          fixedBuffs,
          metrics: [
            { key: "atkConv", label: "攻转", value: atkConvVal, display: atkConvVal }
          ],
        },
        maxLevel,
        slotLabel: "技能2",
        slotKind: "active",
        levels,
        warnings: [],
      },
      awakens: [],
      allAwakenIdentical: false,
    });
  }

  // ─── 3. 技能 2 二段【恶犬冲击·强化冲锋】(20630010202) ───
  {
    const skillId = 20630010202;
    const skill = ctx.skillById.get(skillId);
    const maxLevel = 48;
    const releaseSeconds = 0.5;
    const totalPer = 1.54;
    const atkConvVal = round(totalPer / releaseSeconds);
    const levels = [];
    for (let lv = 1; lv <= maxLevel; lv++) {
      const sl = ctx.skillLevelById.get(skillId * 1000 + lv);
      if (!sl) continue;
      const totalVal = sl.damageAddVal;
      levels.push({
        level: lv,
        roleLevel: sl.roleLevel ?? null,
        consumeMp: 0,
        soulCost: sl.soulCost || [],
        segmentVals: [{ val: totalVal, maxHit: 1 }],
        totalPer,
        totalVal,
        growthBuffs: [],
        metrics: [
          { key: "atkConv", label: "攻转", value: atkConvVal, display: atkConvVal }
        ],
      });
    }

    const fixedBuffs = [
      effectCard(9003, "消耗充能", "mechanismEffect", "消耗 1 次技能充能"),
      effectCard(9006, "强攻击飞", "mechanismEffect", "附加强攻判定，无视普通霸体强行挑空击飞敌人"),
    ];

    slots.push({
      slot: "skillActive2_sub",
      slotLabel: "技能2·二段",
      slotKind: "active",
      base: {
        skillId,
        name: "恶犬冲击·强化冲锋",
        icon: skill.icon || null,
        attribute: skill.attribute ?? 7,
        entityAction: skill.entityAction,
        desIntro: "恶犬冲击连携触发的二段爆发：消耗1个充能进入强化冲锋，特效变大，速度变快，附加强攻无视霸体高空击飞。",
        header: {
          kind: "normal",
          segments: [{ per: totalPer, maxHit: 1, from: "bullet" }],
          segCount: 1,
          totalPer,
          releaseFrames: 15,
          releaseSeconds,
          releaseTimeSource: "entityCtg",
          cd: 0,
          addDefendVal: skill.addDefendVal || 100,
          fixedBuffs,
          metrics: [
            { key: "atkConv", label: "攻转", value: atkConvVal, display: atkConvVal }
          ],
        },
        maxLevel,
        slotLabel: "技能2·二段",
        slotKind: "active",
        levels,
        warnings: [],
      },
      awakens: [],
      allAwakenIdentical: false,
    });
  }

  // ─── 4. 技能 3【护主忠犬】(20630010301 召唤技) ───
  {
    const skillId = 20630010301;
    const skill = ctx.skillById.get(skillId);
    const maxLevel = 48;
    const releaseSeconds = 1.233;
    const levels = [];
    for (let lv = 1; lv <= maxLevel; lv++) {
      const sl = ctx.skillLevelById.get(skillId * 1000 + lv);
      if (!sl) continue;
      const yqSl = ctx.skillLevelById.get(711020102 * 1000 + Math.min(lv, 40));
      const singleHitVal = yqSl ? yqSl.damageAddVal : 4915;
      const twoHitsVal = singleHitVal * 2;
      levels.push({
        level: lv,
        roleLevel: sl.roleLevel ?? null,
        consumeMp: 0,
        soulCost: sl.soulCost || [],
        segmentVals: [],
        totalPer: null,
        totalVal: null,
        growthBuffs: [],
        metrics: [
          { key: "dogSingleVal", label: "幽犬单段固伤", value: singleHitVal, display: singleHitVal },
          { key: "dogTotalVal", label: "幽犬单次总固伤(2段)", value: twoHitsVal, display: twoHitsVal },
        ],
      });
    }

    const fixedBuffs = [
      effectCard(9007, "召唤幽犬", "mechanismEffect", "召唤 4 只幽犬协助战斗，持续 10 秒；幽犬自动索敌，每 2 秒发动一次 2 段猛击"),
      effectCard(1058601, "流血", "mechanismEffect", "幽犬每次攻击附加【流血】，每秒损失生命值，持续 5 秒，最高叠加 69 层"),
      effectCard(9009, "等级继承", "mechanismEffect", "幽犬技能等级与固伤继承本体技能等级（幽犬技能上限 40 级）"),
    ];

    slots.push({
      slot: "skillActive3",
      slotLabel: "技能3",
      slotKind: "active",
      base: {
        skillId,
        name: "护主忠犬",
        icon: skill.icon || null,
        attribute: skill.attribute ?? 7,
        entityAction: skill.entityAction,
        desIntro: skill.desIntro,
        header: {
          kind: "effectOnly",
          segments: [],
          segCount: 0,
          totalPer: null,
          releaseFrames: 37,
          releaseSeconds,
          releaseTimeSource: "entityCtg",
          cd: skill.cd || 20,
          addDefendVal: skill.addDefendVal || 100,
          fixedBuffs,
          metrics: [],
        },
        maxLevel,
        slotLabel: "技能3",
        slotKind: "active",
        levels,
        warnings: [],
      },
      awakens: [],
      allAwakenIdentical: false,
    });
  }

  // ─── 5. 技能 4【啸天追猎】(20630010401) ───
  {
    const skillId = 20630010401;
    const skill = ctx.skillById.get(skillId);
    const maxLevel = 48;
    const releaseSeconds = 1.533;
    const totalPer = 4.504;
    const atkConvVal = round(totalPer / releaseSeconds);
    const levels = [];
    for (let lv = 1; lv <= maxLevel; lv++) {
      const sl = ctx.skillLevelById.get(skillId * 1000 + lv);
      if (!sl) continue;
      const singleVal = sl.damageAddVal;
      const totalVal = singleVal * 8;
      levels.push({
        level: lv,
        roleLevel: sl.roleLevel ?? null,
        consumeMp: 0,
        soulCost: sl.soulCost || [],
        segmentVals: Array(8).fill({ val: singleVal, maxHit: 1 }),
        totalPer,
        totalVal,
        growthBuffs: [],
        metrics: [
          { key: "atkConv", label: "攻转", value: atkConvVal, display: atkConvVal }
        ],
      });
    }

    const fixedBuffs = [
      effectCard(1058601, "流血", "mechanismEffect", "冲击波命中目标附加【流血】，持续 5 秒"),
      effectCard(9010, "追猎袭击", "mechanismEffect", "自动锁定流血目标，召唤幽犬群进行 8 段狂暴突袭"),
    ];

    slots.push({
      slot: "skillActive4",
      slotLabel: "技能4",
      slotKind: "active",
      base: {
        skillId,
        name: "啸天追猎",
        icon: skill.icon || null,
        attribute: skill.attribute ?? 7,
        entityAction: skill.entityAction,
        desIntro: skill.desIntro,
        header: {
          kind: "normal",
          segments: Array(8).fill({ per: 0.563, maxHit: 1, from: "bullet" }),
          segCount: 8,
          totalPer,
          releaseFrames: 46,
          releaseSeconds,
          releaseTimeSource: "entityCtg",
          cd: skill.cd || 24,
          addDefendVal: skill.addDefendVal || 100,
          fixedBuffs,
          metrics: [
            { key: "atkConv", label: "攻转", value: atkConvVal, display: atkConvVal }
          ],
        },
        maxLevel,
        slotLabel: "技能4",
        slotKind: "active",
        levels,
        warnings: [],
      },
      awakens: [],
      allAwakenIdentical: false,
    });
  }

  // ─── 6. 无双【幽犬爆玉】(20630010502 主伤害) ───
  {
    const skillId = 20630010502;
    const mainSkill = ctx.skillById.get(20630010501);
    const maxLevel = 48;
    const releaseSeconds = 1.9;
    const singlePer = 0.713;
    const totalPer = round(singlePer * 8); // 5.704
    const atkConvVal = round(totalPer / releaseSeconds);
    const levels = [];
    for (let lv = 1; lv <= maxLevel; lv++) {
      const sl = ctx.skillLevelById.get(skillId * 1000 + lv);
      if (!sl) continue;
      const singleVal = sl.damageAddVal;
      const totalVal = singleVal * 8;
      levels.push({
        level: lv,
        roleLevel: sl.roleLevel ?? null,
        consumeMp: 0,
        soulCost: sl.soulCost || [],
        segmentVals: Array(8).fill({ val: singleVal, maxHit: 1 }),
        totalPer,
        totalVal,
        growthBuffs: [],
        metrics: [
          { key: "atkConv", label: "攻转", value: atkConvVal, display: atkConvVal }
        ],
      });
    }

    const fixedBuffs = [
      effectCard(9011, "血色光束", "mechanismEffect", "喷发血色光束横扫战场，共造成 8 段伤害（7 段光束扫射 + 1 段终结爆破）"),
      effectCard(9012, "击退挑空", "mechanismEffect", "扫射期间持续击退敌人，终结段强行挑空"),
    ];

    slots.push({
      slot: "skillSp1",
      slotLabel: "无双",
      slotKind: "sp",
      base: {
        skillId: 20630010501,
        name: "幽犬爆玉",
        icon: mainSkill.icon || null,
        attribute: mainSkill.attribute ?? 7,
        entityAction: "skill5_1+skill5_2",
        desIntro: mainSkill.desIntro,
        header: {
          kind: "normal",
          segments: [
            ...Array(7).fill({ per: singlePer, maxHit: 1, from: "beam_sweep" }),
            { per: singlePer, maxHit: 1, from: "beam_finish" },
          ],
          segCount: 8,
          totalPer,
          releaseFrames: 57,
          releaseSeconds,
          releaseTimeSource: "entityCtg",
          cd: mainSkill.cd || 21,
          addDefendVal: mainSkill.addDefendVal || 100,
          fixedBuffs,
          metrics: [
            { key: "atkConv", label: "攻转", value: atkConvVal, display: atkConvVal }
          ],
        },
        maxLevel,
        slotLabel: "无双",
        slotKind: "sp",
        levels,
        warnings: [],
      },
      awakens: [],
      allAwakenIdentical: false,
    });
  }

  // ─── 7. 被动【聚血凝珠】(20630010601) ───
  {
    const skillId = 20630010601;
    const skill = ctx.skillById.get(skillId);

    const fixedBuffs = [
      effectCard(9013, "流血充能", "mechanismEffect", "敌方受到哮天犬流血伤害时，其实际伤害的 12.5% 充入血珠，充能上限为自身最大生命值的 15%"),
      effectCard(9015, "离场治疗", "mechanismEffect", "哮天犬离场时释放血珠治疗全体友方神将；单人出战时 100% 全额回血，双神将各回 65%"),
    ];

    slots.push({
      slot: "skillPassive1",
      slotLabel: "被动",
      slotKind: "passive",
      base: {
        skillId,
        name: "聚血凝珠",
        icon: skill.icon || null,
        attribute: skill.attribute ?? 7,
        entityAction: null,
        desIntro: skill.desIntro,
        header: {
          kind: "effectOnly",
          segments: [],
          segCount: 0,
          totalPer: null,
          releaseFrames: null,
          releaseSeconds: null,
          releaseTimeSource: "effectOnly",
          cd: 0,
          addDefendVal: skill.addDefendVal || 100,
          fixedBuffs,
          metrics: [],
        },
        maxLevel: 1,
        slotLabel: "被动",
        slotKind: "passive",
        levels: [{
          level: 1,
          roleLevel: null,
          consumeMp: null,
          soulCost: null,
          segmentVals: [],
          totalPer: null,
          totalVal: null,
          growthBuffs: [],
          metrics: [],
        }],
        warnings: [],
      },
      awakens: [],
      allAwakenIdentical: false,
    });
  }

  const payload = {
    rideGroup: {
      key: "xiaotianquan",
      name: "哮天犬",
      rideIds: [RIDE_ID],
      note: "哮天犬专项解析：展开恶犬冲击二段强化冲锋、无双幽犬爆玉8段主伤害、护主忠犬幽犬猛击与流血联动，以及聚血凝珠离场全队治疗公式。",
    },
    variants: [{
      ride: {
        id: xtqRide.id,
        idGroup: xtqRide.idGroup,
        name: xtqRide.name,
        rank: xtqRide.rank,
        type: xtqRide.type,
        monsterId: xtqRide.monsterId,
        monsterName: xtqMonster?.name || "哮天犬",
        cfgFile: xtqMonster?.cfgFile || null,
      },
      slots,
    }],
  };

  u.saveOutput(OUTPUT_NAME, payload, {
    system: "ride_wiki",
    sourceFiles: ["ride.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "buff.*.json", "bullets.json", "entityCtg/*.json"],
    note: "哮天犬全技能、二段连携、召唤物与被动充能公式深度解析",
  });

  console.log("  ✅ ride_wiki_xiaotianquan.json 导出成功！共 " + slots.length + " 个技能卡片");
}

if (require.main === module) extract();
module.exports = extract;
