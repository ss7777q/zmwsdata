/**
 * 角色技能 Wiki -> 绝技无双
 *
 * skillExtra 是入口列表；真正的技能数值在 skillExtraLevel.skillId 对应的
 * skill / skillLevel / bullet / entityCtg 链路里。这里按角色技能卡同口径计算：
 * 上方只展示总系数，成长区展示每级技能固伤。
 */
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");

const OUTPUT_KEY = "role_wiki_skill_extra";
const MODULE_LABEL = "绝技无双";

// skillExtra 的先天进阶沿用原绝技名，但当前入口表仍保留了未更新的占位名。
const PRESENTATION_BY_SKILL_ID = new Map([
  [21801010101, { slotLabel: "传说绝技", order: 10 }],
  [21804010101, { name: "至尊幻装·剑神无我", slotLabel: "先天绝技", order: 11 }],
  [21802010101, { slotLabel: "传说绝技", order: 20 }],
  [21803010101, { slotLabel: "传说绝技", order: 30 }],
]);

function idx(arr) {
  const m = new Map();
  for (const r of arr) m.set(r.id, r);
  return m;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function pickDamageValue(values, originalIndex, damageIndex, rawComs) {
  if (!Array.isArray(values)) return values ?? null;
  if (!values.length) return null;
  if (values.length === rawComs.length) return values[originalIndex] ?? null;
  return values[Math.min(damageIndex, values.length - 1)] ?? null;
}

function finalizeSegments(kind, segments) {
  let totalPer = 0;
  let totalVal = 0;
  for (const seg of segments) {
    totalPer += (seg.per || 0) * (seg.maxHit || 1);
    totalVal += (seg.val || 0) * (seg.maxHit || 1);
  }
  return {
    kind,
    segments,
    totalPer: round3(totalPer),
    totalVal: round3(totalVal),
  };
}

function computeSkillExtraDamage(skill, levelRow, actionCfg, warnings) {
  const segments = [];

  if (Array.isArray(levelRow.bullet) && levelRow.bullet.length) {
    levelRow.bullet.forEach((bulletId, bulletIndex) => {
      const bullet = eng.getBullet(bulletId, warnings);
      const rawComs = Array.isArray(bullet?.com) ? bullet.com : [];
      const perValues = levelRow.bulletDamageAddPer?.[bulletIndex] ?? null;
      const valValues = levelRow.bulletDamageAddVal?.[bulletIndex] ?? null;
      let damageIndex = 0;
      rawComs.forEach((com, originalIndex) => {
        if (com?.isNotDamage === 1) return;
        segments.push({
          per: pickDamageValue(perValues, originalIndex, damageIndex, rawComs) ?? 0,
          val: pickDamageValue(valValues, originalIndex, damageIndex, rawComs) ?? 0,
          maxHit: com?.maxHit || 1,
          from: `bullet:${bulletId}#${originalIndex}`,
        });
        damageIndex += 1;
      });
    });
    return finalizeSegments("bullet", segments);
  }

  if (actionCfg && Array.isArray(actionCfg.com)) {
    const bulletIds = actionCfg.com.filter((com) => com.type === 2 && com.bId != null).map((com) => com.bId);
    for (const bulletId of bulletIds) {
      const bullet = eng.getBullet(bulletId, warnings);
      for (const com of eng.damageComs(bullet)) {
        segments.push({
          per: levelRow.damageAddPer ?? 0,
          val: levelRow.damageAddVal ?? 0,
          maxHit: com.maxHit || 1,
          from: `actionBullet:${bulletId}`,
        });
      }
    }
    if (segments.length) return finalizeSegments("normalActionBullet", segments);
  }

  segments.push({
    per: levelRow.damageAddPer ?? 0,
    val: levelRow.damageAddVal ?? 0,
    maxHit: 1,
    from: "normal",
  });
  return finalizeSegments("normal", segments);
}

function buildSkillExtraCard(group, ctx) {
  const skill = ctx.skillById.get(group.skillId);
  const warnings = [];
  if (!skill) {
    return {
      skillId: group.skillId,
      name: group.name,
      extraKind: "skillExtra",
      error: "skill 不存在",
      warnings: [{ code: eng.WARN.MISSING_SKILL, detail: `skill ${group.skillId} 不存在` }],
    };
  }

  const cfg = eng.resolveCfgFile(skill, "skillExtra", 0, ctx.monsterById, warnings);
  const maxLevel = eng.detectMaxLevel(skill, ctx.skillLevelById);
  const levels = [];

  for (let level = 1; level <= maxLevel; level++) {
    const row = eng.querySkillLevel(skill, level, ctx.skillLevelById, warnings);
    if (!row) continue;
    const damage = computeSkillExtraDamage(skill, row, cfg.actionCfg, warnings);
    levels.push({
      level,
      roleLevel: row.roleLevel ?? null,
      consumeMp: null,
      segmentVals: damage.segments.map((seg) => ({ val: seg.val, maxHit: seg.maxHit })),
      totalPer: damage.totalPer,
      totalVal: damage.totalVal,
      growthBuffs: [],
      metrics: [],
    });
  }

  const firstLevel = levels[0] ?? null;
  return {
    skillId: group.skillId,
    name: group.name,
    extraKind: "skillExtra",
    icon: skill.icon || null,
    attribute: skill.attribute ?? null,
    entityAction: skill.entityAction || null,
    desIntro: null,
    header: {
      kind: "skillExtra",
      segments: [],
      segCount: 0,
      totalPer: firstLevel?.totalPer ?? null,
      releaseFrames: null,
      releaseSeconds: null,
      releaseTimeSource: "skillExtra",
      cd: null,
      addDefendVal: null,
      cfgFileResolved: null,
      cfgResolveSource: null,
      fixedBuffs: [],
      metrics: [],
      mechanics: [],
      note: null,
    },
    maxLevel,
    levels,
    warnings,
  };
}

function extract() {
  console.log("\n✨ 角色 Wiki -> 绝技无双");

  const extras = u.loadTable("skillExtra");
  const skillExtraLevels = u.loadTable("skillExtraLevel");
  const rowsByExtraId = new Map();
  for (const row of skillExtraLevels) {
    if (!rowsByExtraId.has(row.skillExtraId)) rowsByExtraId.set(row.skillExtraId, []);
    rowsByExtraId.get(row.skillExtraId).push(row);
  }
  for (const rows of rowsByExtraId.values()) rows.sort((a, b) => a.level - b.level);

  const groupsByKey = new Map();
  for (const extra of extras) {
    const rows = rowsByExtraId.get(extra.id) || [];
    const skillId = rows[0]?.skillId ?? null;
    if (skillId == null) continue;
    const key = `${extra.name}::${skillId}`;
    if (!groupsByKey.has(key)) groupsByKey.set(key, { name: extra.name, skillId, extraIds: [] });
    groupsByKey.get(key).extraIds.push(extra.id);
  }

  const ctx = {
    skillById: idx(u.loadTable("skill")),
    skillLevelById: idx(u.loadTable("skillLevel")),
    monsterById: idx(u.loadTable("monster")),
  };

  const groups = [...groupsByKey.values()]
    .map((group, sourceOrder) => ({
      ...group,
      sourceOrder,
      presentation: PRESENTATION_BY_SKILL_ID.get(group.skillId) || {},
    }))
    .sort((a, b) => (a.presentation.order ?? 1000 + a.sourceOrder) - (b.presentation.order ?? 1000 + b.sourceOrder));

  const slots = groups.map((group) => {
    const card = buildSkillExtraCard({
      ...group,
      name: group.presentation.name || group.name,
    }, ctx);
    return {
      slot: `skillExtra-${group.skillId}`,
      slotLabel: group.presentation.slotLabel || MODULE_LABEL,
      isTrans: false,
      base: card,
      awakens: [],
      allAwakenIdentical: true,
    };
  });

  const payload = {
    kind: "skillExtra",
    role: {
      id: 0,
      name: MODULE_LABEL,
      text: "特殊无双技能独立展示，不按角色名归类。",
    },
    slots,
  };

  u.saveOutput(OUTPUT_KEY, payload, {
    system: "role_wiki",
    sourceFiles: [
      "skillExtra.*.json",
      "skillExtraLevel.*.json",
      "skill.*.json",
      "skillLevel.*.json",
      "monster.*.json",
      "bullets.json",
      "entityCtg/*.json",
    ],
    note: "绝技无双独立模块；入口来自 skillExtra，数值来自 skillExtraLevel.skillId 对应的 skill/skillLevel 战斗链路；先天绝技按进阶关系沿用对应传说绝技的展示名。",
  });

  for (const slot of slots) {
    const card = slot.base;
    const max = card.levels?.[card.levels.length - 1];
    console.log(`  ${card.name}: totalPer=${card.header?.totalPer ?? "—"} Lv1固伤=${card.levels?.[0]?.totalVal ?? "—"} Lv${card.maxLevel}固伤=${max?.totalVal ?? "—"}${card.warnings?.length ? ` ⚠${card.warnings.length}` : ""}`);
  }
}

if (require.main === module) extract();
module.exports = extract;
