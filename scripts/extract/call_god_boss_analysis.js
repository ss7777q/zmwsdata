const fs = require('fs');
const path = require('path');
const u = require('../lib/utils');

const BATTLE_CONFIG_DIR = path.join(u.ROOT, 'file', 'battle-config');
const ENTITY_CTG_DIR = path.join(BATTLE_CONFIG_DIR, 'entityCtg');
const BULLETS_PATH = path.join(BATTLE_CONFIG_DIR, 'bullets.json');
const OVERRIDES_PATH = path.join(__dirname, 'call_god_boss_overrides.json');

const SKILL_SOURCE_GROUPS = [
  { key: 'normal', label: '普攻', fields: ['atkIds'], showAsSkillCard: true },
  { key: 'air', label: '空中攻击', fields: ['skyAtkIds1', 'skyAtkIds', 'skyskillIds'], showAsSkillCard: true },
  { key: 'active', label: '主动技能', fields: ['skillIds'], showAsSkillCard: true },
  { key: 'special', label: '特殊/虚拟技能', fields: ['appearSkill', 'dieSkill', 'floorDeadSkill', 'reburnSkill', 'vSkill', 'initVskill'], showAsSkillCard: false },
];

const WUSHUANG_SKILL_GROUP = { key: 'wushuang', label: '无双/觉醒技能', showAsSkillCard: true };

function indexById(rows) {
  return rows.reduce((result, row) => {
    if (!row || typeof row !== 'object' || row.id == null) return result;
    result.set(Number(row.id), row);
    return result;
  }, new Map());
}

function uniqueNumbers(values) {
  const result = [];
  for (const value of values.flat(Infinity)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (!result.includes(value)) result.push(value);
  }
  return result;
}

function cleanText(value) {
  if (value == null) return '';
  return String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function coefficientNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function formatCoefficient(value) {
  const text = coefficientNumber(value);
  return text ? `${text}系数` : '未配置系数';
}

function buildBuffPlayerText(buff) {
  const text = cleanText(buff?.text) || cleanText(buff?.name);
  if (!text) return '';
  const parts = [];
  if (typeof buff?.time === 'number' && buff.time > 0) parts.push(`持续${buff.time}帧`);
  if (typeof buff?.interval === 'number' && buff.interval > 0 && !/每秒|每隔|间隔/.test(text)) parts.push(`间隔${buff.interval}帧`);
  if (typeof buff?.maxPiles === 'number' && buff.maxPiles > 0) parts.push(`最多${buff.maxPiles}层`);
  return parts.length ? `${text}（${parts.join('，')}）` : text;
}

function buildBeSkillPlayerText(row) {
  const desc = cleanText(row?.desc);
  const text = cleanText(row?.text) || cleanText(row?.name);
  const parts = [];
  if (desc && desc !== text) parts.push(desc);
  else if (text) parts.push(text);
  if (typeof row?.chargedNumber === 'number' && row.chargedNumber > 0) parts.push(`最多储存${row.chargedNumber}次`);
  if (typeof row?.chargedCd === 'number' && row.chargedCd > 0) parts.push(`每${row.chargedCd}帧恢复1次`);
  if (typeof row?.cd === 'number' && row.cd > 0) parts.push(`触发间隔${row.cd}帧`);
  return parts.join('，');
}

function mechanismEntry(type, text, source) {
  const clean = cleanText(text);
  return clean ? { type, text: clean, source } : null;
}

function compactMechanisms(items) {
  const result = [];
  const seen = new Set();
  for (const item of items) {
    if (!item?.text) continue;
    const key = `${item.type}::${item.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function loadJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getActionConfig(entityConfig, actionName) {
  if (!entityConfig || !actionName) return null;
  const action = entityConfig[actionName];
  return action && typeof action === 'object' ? action : null;
}

function getActionTime(entityConfig, actionName) {
  const value = entityConfig?.time?.[actionName];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function collectSkillIdsFromEvent(event) {
  const ids = [];
  for (const key of ['skillLink', 'hitSkillLink']) {
    if (Array.isArray(event[key])) ids.push(...uniqueNumbers(event[key]).filter((id) => id > 0));
  }
  for (const key of ['releaseSkill', 'hitWallSkill', 'hitPlayerSkill', 'endReleaseSkill']) {
    if (typeof event[key] === 'number' && event[key] > 0) ids.push(event[key]);
  }
  return [...new Set(ids)];
}

function collectBuffIdsFromEvent(event) {
  const ids = [];
  if (Array.isArray(event.buff)) ids.push(...uniqueNumbers(event.buff));
  if (typeof event.buffId === 'number') ids.push(event.buffId);
  return [...new Set(ids)];
}

function skillLevelRowForSkill(skill, skillLevelById) {
  const baseId = typeof skill.skillLevelId === 'number' ? skill.skillLevelId : Number(skill.id) * 1000 + 1;
  return skillLevelById.get(baseId) || skillLevelById.get(Number(skill.id) * 1000 + 1) || null;
}

function skillLevelCoefficient(skillLevelRow, bulletId, hitIndex) {
  if (!skillLevelRow) return null;
  if (Array.isArray(skillLevelRow.bullet) && Array.isArray(skillLevelRow.bulletDamageAddPer)) {
    const bulletIndex = skillLevelRow.bullet.findIndex((id) => Number(id) === Number(bulletId));
    if (bulletIndex >= 0) {
      const value = skillLevelRow.bulletDamageAddPer[bulletIndex];
      if (Array.isArray(value)) return typeof value[hitIndex] === 'number' ? value[hitIndex] : value[value.length - 1] ?? null;
      if (typeof value === 'number') return value;
    }
  }
  return typeof skillLevelRow.damageAddPer === 'number' ? skillLevelRow.damageAddPer : null;
}

function collectBulletHitFacts(bullet, spawnFrame, skillLevelRow) {
  if (!bullet || !Array.isArray(bullet.com)) return [];

  return bullet.com
    .filter((entry) => entry && entry.type === 1)
    .map((entry, hitIndex) => {
      const hitBuffIds = [];
      for (const subEntry of entry.com || []) {
        if (Array.isArray(subEntry.hitBuff)) hitBuffIds.push(...uniqueNumbers(subEntry.hitBuff));
      }
      const coefficient = skillLevelCoefficient(skillLevelRow, bullet.id, hitIndex);

      return {
        bulletId: bullet.id,
        bulletAction: bullet.action || '',
        frame: typeof entry.t === 'number' && typeof spawnFrame === 'number' ? spawnFrame + entry.t : null,
        maxHit: typeof entry.maxHit === 'number' ? entry.maxHit : null,
        interval: typeof entry.hitInteval === 'number' ? entry.hitInteval : null,
        damage: entry.isNotDamage === 1 ? null : {
          atkper: coefficient,
          coefficient,
          coefficientText: formatCoefficient(coefficient),
          fixedDamage: 0,
        },
        hitBuffIds: [...new Set(hitBuffIds)],
      };
    });
}

function resolveBuffBrief(buffIds, buffById) {
  return uniqueNumbers(buffIds).map((id) => {
    const buff = buffById.get(id);
    return {
      id,
      name: buff?.name || '',
      text: buildBuffPlayerText(buff),
      durationFrames: typeof buff?.time === 'number' ? buff.time : null,
      intervalFrames: typeof buff?.interval === 'number' ? buff.interval : null,
      maxStacks: typeof buff?.maxPiles === 'number' ? buff.maxPiles : null,
      value: Array.isArray(buff?.value) ? buff.value : null,
    };
  });
}

function resolveBeSkillBrief(ids, beSkillById) {
  return uniqueNumbers(ids).map((id) => {
    const row = beSkillById.get(id);
    return {
      id,
      name: row?.text || row?.name || '',
      description: buildBeSkillPlayerText(row),
      cooldownFrames: typeof row?.cd === 'number' ? row.cd : null,
      initialCooldownFrames: typeof row?.initCd === 'number' ? row.initCd : null,
      chargeCount: typeof row?.chargedNumber === 'number' ? row.chargedNumber : null,
      chargeCooldownFrames: typeof row?.chargedCd === 'number' ? row.chargedCd : null,
    };
  });
}

function resolveSkill(skillId, context, sourceGroup, depth = 0, visited = new Set()) {
  const category = typeof sourceGroup === 'string' ? sourceGroup : sourceGroup.label;
  const showAsSkillCard = typeof sourceGroup === 'string' ? false : sourceGroup.showAsSkillCard !== false;
  const skill = context.skillById.get(Number(skillId));
  const warnings = [];
  if (!skill) {
    return {
      id: skillId,
      category,
      showAsSkillCard,
      name: `技能 ${skillId}`,
      missing: true,
      warnings: [`找不到 skill ${skillId}`],
      damageSegments: [],
      mechanics: [],
      linkedSkills: [],
    };
  }

  const actionName = skill.entityAction || null;
  const actionConfig = getActionConfig(context.entityConfig, actionName);
  if (actionName && !actionConfig) warnings.push(`战斗配置 ${context.cfgFile || 'unknown'} 缺少动作 ${actionName}`);

  const directEvents = Array.isArray(actionConfig?.com) ? actionConfig.com : [];
  const bulletEvents = directEvents.filter((event) => event?.type === 2 && typeof event.bId === 'number');
  const skillLevelRow = skillLevelRowForSkill(skill, context.skillLevelById);
  const skillDamagePer = typeof skillLevelRow?.damageAddPer === 'number' ? skillLevelRow.damageAddPer : null;
  if (!skillLevelRow && bulletEvents.length) warnings.push(`${skill.desName || skill.Name || skill.id} 缺少 skillLevel 系数行`);
  const actionBuffIds = directEvents.flatMap(collectBuffIdsFromEvent);
  const linkedIds = [...new Set([
    ...directEvents.flatMap(collectSkillIdsFromEvent),
    ...uniqueNumbers(skill.connectSkill || []).filter((id) => id > 1000),
  ])].filter((id) => id !== Number(skillId));

  const damageSegments = [];
  const hitBuffIds = [];
  for (const event of bulletEvents) {
    const bullet = context.bulletById.get(event.bId);
    if (!bullet) {
      warnings.push(`找不到 bullet ${event.bId}`);
      continue;
    }
    for (const hitFact of collectBulletHitFacts(bullet, event.t, skillLevelRow)) {
      if (hitFact.damage) damageSegments.push(hitFact);
      if (hitFact.damage && typeof hitFact.damage.coefficient !== 'number') warnings.push(`${skill.desName || skill.Name || skill.id} 存在未解析到系数的伤害段`);
      if (hitFact.damage && (typeof hitFact.maxHit !== 'number' || !Number.isFinite(hitFact.maxHit) || hitFact.maxHit <= 0 || hitFact.maxHit > 50)) {
        warnings.push(`${skill.desName || skill.Name || skill.id} 存在未确认连击数的伤害段`);
      }
      hitBuffIds.push(...hitFact.hitBuffIds);
    }
  }

  const nextVisited = new Set(visited);
  nextVisited.add(Number(skillId));
  const linkedSkills = depth >= 2
    ? []
    : linkedIds
        .filter((id) => !nextVisited.has(id))
        .map((id) => resolveSkill(id, context, { key: 'linked', label: '关联技能', showAsSkillCard: false }, depth + 1, nextVisited));

  const linkedSegments = linkedSkills.flatMap((item) => item.damageSegments || []);
  const allSegments = [...damageSegments, ...linkedSegments];
  const confirmedHits = allSegments.reduce((sum, segment) => {
    if (!segment.damage) return sum;
    const maxHit = Number(segment.maxHit);
    if (!Number.isFinite(maxHit) || maxHit <= 0 || maxHit > 50) return sum;
    return sum + maxHit;
  }, 0);
  const totalCoefficient = allSegments.reduce((sum, segment) => {
    if (!segment.damage || typeof segment.damage.coefficient !== 'number') return sum;
    const maxHit = Number(segment.maxHit);
    if (!Number.isFinite(maxHit) || maxHit <= 0 || maxHit > 50) return sum;
    return sum + segment.damage.coefficient * maxHit;
  }, 0);

  const mechanics = [];
  const intro = cleanText(skill.desIntro);
  if (intro) mechanics.push(mechanismEntry('技能说明', intro));
  for (const item of resolveBeSkillBrief([...(skill.beSkill || []), ...(skill.beSkill2 || [])], context.beSkillById)) {
    mechanics.push(mechanismEntry('被动效果', item.description, item));
  }
  for (const item of resolveBuffBrief([...actionBuffIds, ...hitBuffIds], context.buffById)) {
    mechanics.push(mechanismEntry('附带效果', item.text, item));
  }

  return {
    id: skill.id,
    category,
    showAsSkillCard,
    name: skill.desName || skill.Name || `技能 ${skill.id}`,
    actionName,
    cooldownSeconds: typeof skill.cd === 'number' ? skill.cd : null,
    loopTimeFrames: typeof skill.loopTime === 'number' ? skill.loopTime : null,
    actionFrames: getActionTime(context.entityConfig, actionName),
    atkper: skillDamagePer,
    coefficientPerHit: skillDamagePer,
    coefficientPerHitText: formatCoefficient(skillDamagePer),
    fixedDamage: 0,
    confirmedHits,
    totalCoefficient: totalCoefficient || null,
    totalCoefficientText: totalCoefficient ? formatCoefficient(totalCoefficient) : '',
    damageSegments: allSegments,
    directDamageSegments: damageSegments,
    mechanics: compactMechanisms(mechanics),
    linkedSkills,
    warnings: [...warnings, ...linkedSkills.flatMap((item) => item.warnings || [])],
  };
}

function collectMonsterSkillIds(monster, fieldNames) {
  const ids = [];
  for (const fieldName of fieldNames) {
    const value = monster?.[fieldName];
    if (Array.isArray(value)) ids.push(...uniqueNumbers(value));
    if (typeof value === 'number') ids.push(value);
  }
  return [...new Set(ids)];
}

function choosePrimaryBossRow(rows) {
  const sorted = [...rows].sort((left, right) => {
    if (Number(left.level || 0) !== Number(right.level || 0)) return Number(right.level || 0) - Number(left.level || 0);
    const leftEvent = Number(left.id) >= 200000 ? 1 : 0;
    const rightEvent = Number(right.id) >= 200000 ? 1 : 0;
    if (leftEvent !== rightEvent) return leftEvent - rightEvent;
    return Number(right.id || 0) - Number(left.id || 0);
  });
  return sorted[0] || null;
}

function groupBossRows(rows) {
  const map = new Map();
  for (const row of rows) {
    if (row.group == null) continue;
    if (!map.has(row.group)) map.set(row.group, []);
    map.get(row.group).push(row);
  }
  return [...map.entries()].map(([groupId, groupRows]) => ({ groupId, rows: groupRows }));
}

function monsterIdsForBossRow(row) {
  return [...new Set(Object.values(row?.monsterId || {}).filter((id) => typeof id === 'number'))];
}

function buildFashionByBossGroup(fashionRows, bossGroupByRowId, beSkillById) {
  const map = new Map();
  for (const fashion of fashionRows) {
    const groupId = bossGroupByRowId.get(Number(fashion.godWarBossId));
    if (groupId == null) continue;
    if (!map.has(groupId)) map.set(groupId, []);
    map.get(groupId).push({
      id: fashion.id,
      name: fashion.name,
      description: cleanText(fashion.desc),
      permanentOptions: Array.isArray(fashion.time) ? fashion.time.includes(-1) : false,
      effects: resolveBeSkillBrief([...(fashion.beskill || []), ...(fashion.beskillLimit || []).map((item) => item?.[0])], beSkillById)
        .filter((item) => item.description),
    });
  }
  return map;
}

function buildTalents(talentRows, talentGroupRows, beSkillById) {
  const groupInfoByTalent = new Map();
  for (const row of talentGroupRows) {
    for (const talentGroup of row.talentGroups || []) {
      groupInfoByTalent.set(talentGroup, row);
    }
  }

  const grouped = new Map();
  for (const row of talentRows) {
    if (!grouped.has(row.talentGroup)) grouped.set(row.talentGroup, []);
    grouped.get(row.talentGroup).push(row);
  }

  return [...grouped.values()].map((rows) => {
    const sorted = [...rows].sort((left, right) => Number(left.talentLevel || 0) - Number(right.talentLevel || 0));
    const first = sorted[0];
    const groupInfo = groupInfoByTalent.get(first.talentGroup) || null;
    return {
      talentGroup: first.talentGroup,
      name: first.talentName,
      unlockStageRange: Array.isArray(groupInfo?.godWar) ? groupInfo.godWar : null,
      maxLevel: sorted[sorted.length - 1]?.talentLevel || sorted.length,
      effects: resolveBeSkillBrief(first.beskillId || [], beSkillById).filter((item) => item.description),
      levels: sorted.map((row) => ({
        level: row.talentLevel,
        cost: row.talentCost,
        text: cleanText(row.talentText),
        stages: row.godWarStage || [],
      })),
    };
  }).sort((left, right) => Number(left.talentGroup) - Number(right.talentGroup));
}

function skillOverrideFor(skill, bossOverride) {
  if (!bossOverride?.skills) return null;
  return bossOverride.skills[skill.name] || bossOverride.skills[String(skill.id)] || null;
}

function applyBossOverride(entry, overrides) {
  const bossOverride = overrides?.bosses?.[entry.name] || null;
  if (!bossOverride) {
    return {
      ...entry,
      baseMechanisms: [],
      skills: (entry.skills || []).map((skill) => ({ ...skill, mechanics: [] })),
      mechanismOverride: { covered: false },
    };
  }

  const applySkillOverride = (skill) => {
    const override = skillOverrideFor(skill, bossOverride);
    if (!override) return { ...skill, mechanics: [] };
    return {
      ...skill,
      damageDisplay: override.damageDisplay && typeof override.damageDisplay === 'object' ? override.damageDisplay : skill.damageDisplay,
      mechanics: Array.isArray(override.mechanics) ? override.mechanics : skill.mechanics,
      mechanismOverride: { covered: true },
    };
  };

  return {
    ...entry,
    baseMechanisms: Array.isArray(bossOverride.baseMechanisms) ? bossOverride.baseMechanisms : [],
    skills: (entry.skills || []).map(applySkillOverride),
    internalSkills: (entry.internalSkills || []).map(applySkillOverride),
    mechanismOverride: { covered: true },
  };
}

function uniqueSkills(skills) {
  const result = [];
  const seen = new Set();
  for (const skill of skills) {
    const key = String(skill.id);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(skill);
  }
  return result;
}

function buildBossAnalysisPayload() {
  const bossRows = u.loadTable('godWarBoss');
  const fashionRows = u.loadTable('godWarBossFashion');
  const monsterById = indexById(u.loadTable('monster'));
  const skillById = indexById(u.loadTable('skill'));
  const skillLevelById = indexById(u.loadTable('skillLevel'));
  const beSkillById = indexById(u.loadTable('beskill'));
  const buffById = indexById(u.loadTable('buff'));
  const bulletById = indexById(loadJsonIfExists(BULLETS_PATH) || []);
  const overrides = loadJsonIfExists(OVERRIDES_PATH) || {};

  const bossGroupByRowId = new Map();
  for (const row of bossRows) bossGroupByRowId.set(Number(row.id), row.group);
  const fashionByBossGroup = buildFashionByBossGroup(fashionRows, bossGroupByRowId, beSkillById);

  return groupBossRows(bossRows)
    .map(({ groupId, rows }) => {
      const primaryBossRow = choosePrimaryBossRow(rows);
      const primaryMonsterId = monsterIdsForBossRow(primaryBossRow)[0];
      const primaryMonster = monsterById.get(primaryMonsterId);
      const cfgFile = primaryMonster?.cfgFile || null;
      const entityConfig = cfgFile ? loadJsonIfExists(path.join(ENTITY_CTG_DIR, `${cfgFile}.json`)) : null;
      const context = { skillById, skillLevelById, beSkillById, buffById, bulletById, entityConfig, cfgFile };

      const warningSet = new Set();
      if (!primaryMonster) warningSet.add(`找不到主魔王 monster ${primaryMonsterId}`);
      if (cfgFile && !entityConfig) warningSet.add(`找不到战斗配置 ${cfgFile}.json`);

      const resolvedSkills = SKILL_SOURCE_GROUPS.flatMap((group) => {
        return collectMonsterSkillIds(primaryMonster, group.fields).map((skillId) => resolveSkill(skillId, context, group));
      });

      const initBuffs = resolveBuffBrief(primaryMonster?.initBuff || [], buffById);
      const initBeSkills = resolveBeSkillBrief(primaryMonster?.initBeSkill || [], beSkillById);
      const bossRowBeSkills = resolveBeSkillBrief(rows.flatMap((row) => row.beSkill || []), beSkillById);
      const bossRowWuShuangSkills = uniqueNumbers(rows.flatMap((row) => row.wsSkill || []))
        .map((skillId) => resolveSkill(skillId, context, WUSHUANG_SKILL_GROUP));
      const skills = uniqueSkills([...resolvedSkills.filter((skill) => skill.showAsSkillCard), ...bossRowWuShuangSkills]);
      const internalSkills = uniqueSkills(resolvedSkills.filter((skill) => !skill.showAsSkillCard));
      for (const skill of [...skills, ...internalSkills]) for (const warning of skill.warnings || []) warningSet.add(warning);

      const entry = {
        groupId,
        name: primaryBossRow?.name || primaryMonster?.name || `魔王 ${groupId}`,
        description: cleanText(primaryBossRow?.desc),
        primaryBossRowId: primaryBossRow?.id || null,
        primaryMonsterId: primaryMonsterId || null,
        cfgFile,
        damageRule: '魔王伤害只按攻击系数计算；本解析不展示固定伤害。',
        levelRows: rows
          .map((row) => ({
            id: row.id,
            level: row.level,
            hard: row.hard,
            monsterIds: monsterIdsForBossRow(row),
            mateCorrect: row.mateCorrect ?? null,
            unlock: row.unlock ?? null,
            rankCost: u.parseCost(row.rankCost),
          }))
          .sort((left, right) => Number(left.level || 0) - Number(right.level || 0) || Number(left.id || 0) - Number(right.id || 0)),
        baseMechanisms: compactMechanisms([
          ...initBuffs.map((item) => mechanismEntry('入场效果', item.text, item)),
          ...initBeSkills.map((item) => mechanismEntry('常驻被动', item.description, item)),
          ...bossRowBeSkills.map((item) => mechanismEntry('升星效果', item.description, item)),
        ]),
        skills,
        internalSkills,
        fashions: (fashionByBossGroup.get(groupId) || []).sort((left, right) => Number(left.id) - Number(right.id)),
        warnings: [...warningSet],
      };

      return applyBossOverride(entry, overrides);
    })
    .sort((left, right) => String(left.name).localeCompare(String(right.name), 'zh-CN'));
}

function buildBossTalentPayload() {
  const talentRows = u.loadTable('godWarBossTalent');
  const talentGroupRows = u.loadTable('godWarBossTalentGroup');
  const beSkillById = indexById(u.loadTable('beskill'));
  return buildTalents(talentRows, talentGroupRows, beSkillById);
}

function extractCallGodBossAnalysis() {
  u.saveOutput('call_god_boss_analysis', buildBossAnalysisPayload(), {
    system: 'call_god',
    source: 'godWarBoss.*.json + godWarBossFashion.*.json + monster.*.json + skill.*.json + beskills/buffs + file/battle-config',
    damagePolicy: '魔王只有系数伤害，damageAddVal 不作为伤害展示字段。',
  });
  u.saveOutput('call_god_boss_talents', buildBossTalentPayload(), {
    system: 'call_god',
    source: 'godWarBossTalent.*.json + godWarBossTalentGroup.*.json + beskills',
  });
}

module.exports = extractCallGodBossAnalysis;
