const fs = require('fs');
const path = require('path');
const u = require('../lib/utils');

const BATTLE_CONFIG_DIR = path.join(u.ROOT, 'file', 'battle-config');
const ENTITY_CTG_DIR = path.join(BATTLE_CONFIG_DIR, 'entityCtg');
const BULLETS_PATH = path.join(BATTLE_CONFIG_DIR, 'bullets.json');
const OVERRIDES_PATH = path.join(__dirname, 'call_god_boss_overrides.json');
const JIAOCHONG_POISON_BUFF_ID = 1042401;
const FRAMES_PER_SECOND = 30;

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

function formatSecondsFromFrames(frames) {
  if (typeof frames !== 'number' || !Number.isFinite(frames)) return null;
  const seconds = frames / FRAMES_PER_SECOND;
  return Number.isInteger(seconds) ? String(seconds) : String(Number(seconds.toFixed(3)));
}

function formatFramesWithSeconds(frames) {
  const seconds = formatSecondsFromFrames(frames);
  return seconds ? `${frames}帧（${seconds}秒）` : `${frames}帧`;
}

function formatPercentFromRatio(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const percent = Math.abs(value) * 100;
  return Number.isInteger(percent) ? String(percent) : String(Number(percent.toFixed(3)));
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

function buffValuePercent(buff) {
  return Array.isArray(buff?.value) && typeof buff.value[0] === 'number'
    ? formatPercentFromRatio(buff.value[0])
    : null;
}

function attachedBuffs(buff, buffById) {
  return uniqueNumbers(buff?.attachBuff || []).map((id) => buffById?.get(id)).filter(Boolean);
}

function buildBuffAssembleEffectText(buff, buffById) {
  const text = cleanText(buff?.text) || cleanText(buff?.name);
  const parts = [];
  const attach = attachedBuffs(buff, buffById);

  if (typeof buff?.time === 'number' && buff.time > 0) parts.push(`持续${formatFramesWithSeconds(buff.time)}`);
  if (typeof buff?.interval === 'number' && buff.interval > 0) parts.push(`每${formatFramesWithSeconds(buff.interval)}触发1次`);
  if (typeof buff?.maxPiles === 'number' && buff.maxPiles > 0) parts.push(`最高${buff.maxPiles}层`);

  if (buff?.type === 114 && /僵直/.test(text)) {
    parts.push('触发身体僵直');
  } else if (buff?.type === 35 || /冻结/.test(buff?.name || '')) {
    parts.push('期间无法移动、无法攻击和使用技能、禁止使用法宝');
  } else if (buff?.type === 155 && typeof buff?.value?.atkPer === 'number') {
    parts.push(`每次触发造成${coefficientNumber(buff.value.atkPer)}系数生命损失`);
    if (buff.value.unShield === 1) parts.push('无视护盾');
    if (attach.some((item) => /治疗|回血|恢复生命/.test(`${item.name || ''}${item.text || ''}`))) {
      parts.push('期间治疗无效并无法恢复生命值');
    }
  } else if (buff?.type === 16 && typeof buff?.value?.param?.[3] === 'number') {
    parts.push(`每次触发扣除${coefficientNumber(Math.abs(buff.value.param[3]))}系数魔法值`);
    if (attach.some((item) => /回魔|回蓝|魔法/.test(`${item.name || ''}${item.text || ''}`))) {
      parts.push('期间无法恢复魔法值');
    }
  } else if (buff?.type === 4 && buffValuePercent(buff)) {
    parts.push(`移速降低${buffValuePercent(buff)}%`);
    const jumpBuff = attach.find((item) => /跳跃/.test(`${item.name || ''}${item.text || ''}`));
    const jumpPercent = jumpBuff ? buffValuePercent(jumpBuff) : null;
    if (jumpPercent) parts.push(`跳跃力降低${jumpPercent}%`);
    if (attach.some((item) => /禁止召唤坐骑/.test(`${item.name || ''}${item.text || ''}`))) parts.push('禁止召唤坐骑');
  } else if (buff?.type === 7 && buffValuePercent(buff)) {
    parts.push(`命中率降低${buffValuePercent(buff)}%`);
    if (attach.some((item) => /能见度|小地图/.test(`${item.name || ''}${item.text || ''}`))) {
      parts.push('能见度下降，且无法在小地图看到魔王和队友');
    }
  } else if (text) {
    parts.push(text);
  }

  return parts.join('，');
}

function formatBuffAssembleListeners(ids, buffById) {
  const counts = new Map();
  for (const id of ids || []) {
    if (typeof id !== 'number' || !Number.isFinite(id)) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts.entries()].map(([id, count]) => {
    const name = cleanText(buffById.get(id)?.name) || `BUFF ${id}`;
    return count > 1 ? `${count}个${name}` : name;
  }).join(' + ');
}

function buildBuffAssembleText(row, buffById) {
  if (row?.label !== 'buffAssemble' || !buffById) return '';
  const rawLsnBuffs = Array.isArray(row.attribute?.lsnBuffs) ? row.attribute.lsnBuffs : [];
  const lsnBuffs = uniqueNumbers(rawLsnBuffs);
  const detBuffs = uniqueNumbers(row.attribute?.detBuffs || []);
  if (!lsnBuffs.length || !detBuffs.length) return '';

  const rowName = cleanText(row.name);
  const comboText = rowName.match(/：(.+?)=/)?.[1] || lsnBuffs
    .map((id) => cleanText(buffById.get(id)?.name) || `BUFF ${id}`)
    .join('+');
  const listenerText = formatBuffAssembleListeners(rawLsnBuffs, buffById);
  const effectNameHints = rowName.match(/=(.+)$/)?.[1]?.split(/[+、，,]/).map((item) => cleanText(item)).filter(Boolean) || [];
  const effectTexts = detBuffs.map((id, index) => {
    const buff = buffById.get(id);
    if (!buff) return `缺少组合效果 BUFF ${id}`;
    const detail = buildBuffAssembleEffectText(buff, buffById);
    return `【${effectNameHints[index] || cleanText(buff.name) || id}】${detail ? `：${detail}` : ''}`;
  });

  return `${comboText} 元素组合触发${effectTexts.join('；')}。目标身上凑齐 ${listenerText} 时触发。`;
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
      const hitBuffCounts = {};
      const impactTags = [];
      for (const subEntry of entry.com || []) {
        if (Array.isArray(subEntry.hitBuff)) {
          hitBuffIds.push(...uniqueNumbers(subEntry.hitBuff));
          for (const buffId of subEntry.hitBuff) {
            if (typeof buffId !== 'number') continue;
            hitBuffCounts[buffId] = (hitBuffCounts[buffId] || 0) + 1;
          }
        }
        if (subEntry.causeState === 2) impactTags.push('击飞');
        if (subEntry.forceAtk === 1) impactTags.push('强制受击');
        if (Number(subEntry.stiff || 0) > 0 || Number(subEntry.stiffFm || 0) > 0) impactTags.push('僵直');
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
        hitBuffCounts,
        impactTags: [...new Set(impactTags)],
      };
    });
}

function buildJiaochongPoisonMechanism(skillName, damageSegments, buffById, warnings) {
  const poisonBuff = buffById.get(JIAOCHONG_POISON_BUFF_ID);
  const poisonSegments = (damageSegments || [])
    .filter((segment) => segment.damage && segment.hitBuffCounts?.[JIAOCHONG_POISON_BUFF_ID])
    .map((segment, index) => ({
      index,
      stacksPerHit: segment.hitBuffCounts[JIAOCHONG_POISON_BUFF_ID],
      hitCount: isConfirmedHitCount(segment.maxHit) ? segment.maxHit : null,
    }));
  if (!poisonSegments.length) return null;
  if (!poisonBuff) {
    warnings.push(`${skillName} 命中会附加毒素 buff ${JIAOCHONG_POISON_BUFF_ID}，但找不到 buff 配置`);
    return null;
  }

  const perTick = Math.abs(Number(poisonBuff.value?.[0]?.[0]));
  const durationFrames = typeof poisonBuff.time === 'number' ? poisonBuff.time : null;
  const intervalFrames = typeof poisonBuff.interval === 'number' ? poisonBuff.interval : null;
  const tickCount = durationFrames && intervalFrames ? Math.floor(durationFrames / intervalFrames) : null;
  const totalPerLayer = typeof perTick === 'number' && Number.isFinite(perTick) && tickCount ? perTick * tickCount : null;
  const maxStacks = typeof poisonBuff.maxPiles === 'number' ? poisonBuff.maxPiles : null;

  const parts = poisonSegments.map((segment) => {
    const base = poisonSegments.length > 1 ? `第${segment.index + 1}段` : '命中';
    const stackText = segment.hitCount && segment.hitCount > 1
      ? `${segment.stacksPerHit}层×${segment.hitCount}次`
      : `${segment.stacksPerHit}层`;
    return `${base}${stackText}`;
  });
  const confirmedTotalStacks = poisonSegments.every((segment) => segment.hitCount != null)
    ? poisonSegments.reduce((sum, segment) => sum + segment.stacksPerHit * segment.hitCount, 0)
    : null;

  const timingText = durationFrames && intervalFrames
    ? `每层持续${durationFrames}帧（${formatSecondsFromFrames(durationFrames)}秒），每${intervalFrames}帧（${formatSecondsFromFrames(intervalFrames)}秒）触发1次`
    : '毒素持续和触发间隔未完整解析';
  const damageText = Number.isFinite(perTick)
    ? `每层每次触发造成${coefficientNumber(perTick)}系数持续伤害${totalPerLayer != null ? `；单层完整持续共${coefficientNumber(totalPerLayer)}系数` : ''}`
    : '毒素单跳伤害未解析';
  const stackText = confirmedTotalStacks != null
    ? `本技能完整命中叠${confirmedTotalStacks}层毒素（${parts.join('，')}）`
    : `本技能命中会叠毒素（${parts.join('，')}，存在未确认命中次数）`;
  const maxText = maxStacks ? `，最高${maxStacks}层` : '';

  return mechanismEntry(
    '毒素机制',
    `${stackText}。${timingText}${maxText}；${damageText}。目标处于【疯幻】状态时，骄虫常驻被动会让毒素伤害额外扣除魔法值。`,
    {
      id: poisonBuff.id,
      name: poisonBuff.name,
      durationFrames,
      intervalFrames,
      maxStacks,
      value: poisonBuff.value,
      stacksPerFullHit: confirmedTotalStacks,
    }
  );
}

function isConfirmedHitCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 50;
}

function coefficientText(value) {
  return coefficientNumber(value) || '未配置系数';
}

function hitCountText(value) {
  return isConfirmedHitCount(value) ? String(value) : '未确认';
}

function damageSegmentText(segment) {
  return `${coefficientText(segment?.damage?.coefficient)}×${hitCountText(segment?.maxHit)}连击`;
}

function groupDamageSegments(segments) {
  const groups = [];
  for (const segment of (segments || []).filter((item) => item.damage)) {
    const coefficient = typeof segment.damage?.coefficient === 'number' ? segment.damage.coefficient : null;
    const group = groups.find((item) => item.coefficient === coefficient) || { coefficient, hits: 0, unknownHits: false };
    if (isConfirmedHitCount(segment.maxHit)) group.hits += segment.maxHit;
    else group.unknownHits = true;
    if (!groups.includes(group)) groups.push(group);
  }
  return groups;
}

function damageGroupText(group) {
  const hitText = group.unknownHits ? (group.hits > 0 ? `${group.hits}+未确认` : '未确认') : String(group.hits);
  return `${coefficientText(group.coefficient)}×${hitText}连击`;
}

function buildConfigDamageDisplay(skill) {
  const groups = groupDamageSegments(skill.damageSegments || []);
  return {
    formula: groups.length ? groups.map(damageGroupText).join(' + ') : '无直接伤害',
    total: groups.length && typeof skill.totalCoefficient === 'number' && Number.isFinite(skill.totalCoefficient)
      ? coefficientText(skill.totalCoefficient)
      : '—',
  };
}

function applyDamageDisplayHints(skill, override, warnings) {
  const base = buildConfigDamageDisplay(skill);
  const displayOverride = override?.damageDisplay && typeof override.damageDisplay === 'object' ? override.damageDisplay : null;
  if (!displayOverride) return { display: base, ignoredFields: [] };

  const result = { ...base };
  const ignoredFields = [];
  const label = `${skill.name || skill.id} damageDisplay`;
  for (const key of ['formula', 'total']) {
    if (Object.prototype.hasOwnProperty.call(displayOverride, key)) {
      ignoredFields.push(`damageDisplay.${key}`);
    }
  }
  if (typeof displayOverride.timing === 'string') result.timing = displayOverride.timing;
  if (typeof displayOverride.hideAutoBreakdown === 'boolean') result.hideAutoBreakdown = displayOverride.hideAutoBreakdown;

  if (Array.isArray(displayOverride.breakdown)) {
    const sourceSegments = (skill.damageSegments || []).filter((item) => item.damage);
    result.breakdown = displayOverride.breakdown.map((item, index) => {
      if (item && Object.prototype.hasOwnProperty.call(item, 'text')) {
        ignoredFields.push(`damageDisplay.breakdown[${index}].text`);
      }
      const sourceSegment = sourceSegments[index];
      if (!sourceSegment) warnings.push(`${label}.breakdown[${index}] 没有匹配到配置伤害段`);
      return {
        label: cleanText(item?.label) || `第${index + 1}段`,
        text: sourceSegment ? damageSegmentText(sourceSegment) : '配置未解析',
        ...(cleanText(item?.detail) ? { detail: cleanText(item.detail) } : {}),
      };
    });
  }
  return { display: result, ignoredFields };
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

function resolveBeSkillBrief(ids, beSkillById, buffById) {
  return uniqueNumbers(ids).map((id) => {
    const row = beSkillById.get(id);
    const assembledDescription = buildBuffAssembleText(row, buffById);
    return {
      id,
      name: row?.text || row?.name || '',
      description: assembledDescription || buildBeSkillPlayerText(row),
      cooldownFrames: typeof row?.cd === 'number' ? row.cd : null,
      initialCooldownFrames: typeof row?.initCd === 'number' ? row.initCd : null,
      chargeCount: typeof row?.chargedNumber === 'number' ? row.chargedNumber : null,
      chargeCooldownFrames: typeof row?.chargedCd === 'number' ? row.chargedCd : null,
      ...(assembledDescription ? {
        assembledBuffs: {
          listenBuffs: uniqueNumbers(row?.attribute?.lsnBuffs || []),
          effectBuffs: uniqueNumbers(row?.attribute?.detBuffs || []),
        },
      } : {}),
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
  for (const item of resolveBeSkillBrief([...(skill.beSkill || []), ...(skill.beSkill2 || [])], context.beSkillById, context.buffById)) {
    mechanics.push(mechanismEntry('被动效果', item.description, item));
  }
  const poisonMechanism = buildJiaochongPoisonMechanism(skill.desName || skill.Name || skill.id, allSegments, context.buffById, warnings);
  for (const item of resolveBuffBrief([...actionBuffIds, ...hitBuffIds], context.buffById)) {
    if (poisonMechanism && item.id === JIAOCHONG_POISON_BUFF_ID) continue;
    mechanics.push(mechanismEntry('附带效果', item.text, item));
  }
  if (poisonMechanism) mechanics.push(poisonMechanism);

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
    damageDisplay: buildConfigDamageDisplay({ damageSegments: allSegments, totalCoefficient: totalCoefficient || null }),
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

function buildFashionByBossGroup(fashionRows, bossGroupByRowId, beSkillById, buffById) {
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
      effects: resolveBeSkillBrief([...(fashion.beskill || []), ...(fashion.beskillLimit || []).map((item) => item?.[0])], beSkillById, buffById)
        .filter((item) => item.description),
    });
  }
  return map;
}

function buildTalents(talentRows, talentGroupRows, beSkillById, buffById) {
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
      effects: resolveBeSkillBrief(first.beskillId || [], beSkillById, buffById).filter((item) => item.description),
      levels: sorted.map((row) => ({
        level: row.talentLevel,
        cost: row.talentCost,
        text: cleanText(row.talentText),
        stages: row.godWarStage || [],
      })),
    };
  }).sort((left, right) => Number(left.talentGroup) - Number(right.talentGroup));
}

function secondsTextFromFrames(frames) {
  const seconds = formatSecondsFromFrames(frames);
  return seconds ? `${seconds}秒` : null;
}

function formatPercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const percent = Math.abs(value) * 100;
  return Number.isInteger(percent) ? String(percent) : String(Number(percent.toFixed(3)));
}

function formatDuration(buff, options = {}) {
  if (typeof buff?.time !== 'number') return '';
  if (buff.time === -1) return options.untilSourceDies ? `，持续到${options.sourceName || '来源'}消失` : '';
  const seconds = secondsTextFromFrames(buff.time);
  return seconds ? `，持续${seconds}` : '';
}

function buildBuffEffectText(buff, buffById, options = {}) {
  if (!buff) return '';
  const duration = formatDuration(buff, options);
  const value = Array.isArray(buff.value) && typeof buff.value[0] === 'number' ? buff.value[0] : null;
  const percent = formatPercent(value);

  if (buff.type === 4 && percent) {
    return `移速${value >= 0 ? '提升' : '降低'}${percent}%${duration}`;
  }

  if (buff.type === 143 && percent) {
    return `跳跃力提升${percent}%${duration}`;
  }

  if (buff.type === 14 && percent) {
    return `受到伤害降低${percent}%${duration}`;
  }

  if (buff.type === 114) {
    const timeText = secondsTextFromFrames(buff.time);
    const intervalText = secondsTextFromFrames(buff.interval);
    const triggerCount = buff.time > 0 && buff.interval > 0 ? Math.floor(buff.time / buff.interval) : null;
    const parts = [];
    if (timeText) parts.push(`持续${timeText}`);
    if (intervalText) parts.push(`每${intervalText}触发1次身体僵直`);
    if (triggerCount) parts.push(`共${triggerCount}次`);
    return `附加麻木${parts.length ? `，${parts.join('，')}` : ''}`;
  }

  if (buff.type === 147) {
    const attachedBuffs = attachedBuffsFromIds(buff.attachBuff, buffById);
    const speedBuff = attachedBuffs.find((item) => item.type === 4 && Array.isArray(item.value) && item.value[0] > 0);
    const speedPercent = formatPercent(speedBuff?.value?.[0]);
    const immunities = attachedBuffs
      .map((item) => cleanText(item.name))
      .filter((name) => /^免疫/.test(name))
      .map((name) => name.replace(/^免疫/, ''))
      .filter(Boolean);
    const parts = ['获得超级霸体', '解除控制'];
    if (immunities.length) parts.push(`免疫${immunities.join('、')}`);
    if (speedPercent) parts.push(`移速提升${speedPercent}%`);
    const timeText = secondsTextFromFrames(buff.time);
    return `${parts.join('，')}${timeText ? `，持续${timeText}` : ''}`;
  }

  if (buff.type === 2 && /无敌|虚无/.test(`${buff.name || ''}${buff.text || ''}`)) {
    return `身体虚无，不受任何攻击${duration}`;
  }

  const text = cleanText(buff.text) || cleanText(buff.name);
  return text ? `${text}${duration}` : '';
}

function attachedBuffsFromIds(ids, buffById) {
  return uniqueNumbers(ids || []).map((id) => buffById.get(id)).filter(Boolean);
}

function commonDamageFormula(segments) {
  const groups = groupDamageSegments(segments || []);
  if (!groups.length) return null;
  return groups.map((group) => {
    const hitText = group.unknownHits ? (group.hits > 0 ? `${group.hits}+未确认` : '未确认') : String(group.hits);
    return `${formatCoefficient(group.coefficient)}×${hitText}连击`;
  }).join(' + ');
}

function commonDamageTotal(segments) {
  const total = (segments || []).reduce((sum, segment) => {
    if (!segment.damage || typeof segment.damage.coefficient !== 'number') return sum;
    if (!isConfirmedHitCount(segment.maxHit)) return sum;
    return sum + segment.damage.coefficient * segment.maxHit;
  }, 0);
  return total > 0 ? coefficientNumber(total) : null;
}

function cleanCommonSkillName(value) {
  return cleanText(value).replace(/^魔王技-/, '');
}

function commonImpactText(tags) {
  const uniqueTags = [...new Set(tags || [])];
  if (!uniqueTags.length) return '';
  const hasLaunch = uniqueTags.includes('击飞');
  const others = uniqueTags.filter((tag) => tag !== '击飞');
  if (hasLaunch && others.length) return `命中会击飞目标，并造成${others.join('、')}`;
  if (hasLaunch) return '命中会击飞目标';
  return `命中会造成${uniqueTags.join('、')}`;
}

function commonDamageEntry(skill) {
  const segments = (skill.damageSegments || []).filter((segment) => segment.damage);
  const formula = commonDamageFormula(segments);
  if (!formula) return null;
  const total = commonDamageTotal(segments);
  const hitBuffIds = uniqueNumbers(segments.flatMap((segment) => segment.hitBuffIds || []));
  return {
    skillId: skill.id,
    skillName: cleanCommonSkillName(skill.name),
    formula,
    total: total ? `${total}系数` : null,
    hitBuffIds,
    impactTags: [...new Set(segments.flatMap((segment) => segment.impactTags || []))],
  };
}

function buildSkillContextForMonster(monster, source) {
  const cfgFile = monster?.cfgFile || null;
  const entityConfig = cfgFile ? loadJsonIfExists(path.join(ENTITY_CTG_DIR, `${cfgFile}.json`)) : null;
  return {
    skillById: source.skillById,
    skillLevelById: source.skillLevelById,
    beSkillById: source.beSkillById,
    buffById: source.buffById,
    bulletById: source.bulletById,
    entityConfig,
    cfgFile,
  };
}

function resolveMonsterSkillAnalyses(monster, source, fields = ['skillIds']) {
  if (!monster) return [];
  const context = buildSkillContextForMonster(monster, source);
  const group = { key: 'commonSkill', label: '通用技能', showAsSkillCard: false };
  return collectMonsterSkillIds(monster, fields).map((skillId) => resolveSkill(skillId, context, group));
}

function collectActionEventsForSkill(skill, monster, source) {
  const context = buildSkillContextForMonster(monster, source);
  const actionConfig = getActionConfig(context.entityConfig, skill?.entityAction);
  return Array.isArray(actionConfig?.com) ? actionConfig.com : [];
}

function buildActionBuffEffects(skill, monster, source) {
  const buffIds = collectActionEventsForSkill(skill, monster, source).flatMap(collectBuffIdsFromEvent);
  return uniqueNumbers(buffIds)
    .map((id) => buildBuffEffectText(source.buffById.get(id), source.buffById))
    .filter(Boolean);
}

function buildCrystalBuffEffects(skill, monster, source) {
  return collectActionEventsForSkill(skill, monster, source)
    .filter((event) => event?.type === 18 && event.crystal && Array.isArray(event.buff))
    .flatMap((event) => uniqueNumbers(event.buff).map((buffId) => {
      const buff = source.buffById.get(buffId);
      const effect = buildBuffEffectText(buff, source.buffById, {
        untilSourceDies: event.dieRemove === 1,
        sourceName: monster?.name || '召唤物',
      });
      return effect ? `随机一个存活水晶${effect}` : '';
    }))
    .filter(Boolean);
}

function buildInitBeSkillEffects(monster, source) {
  return uniqueNumbers(monster?.initBeSkill || []).map((id) => {
    const row = source.beSkillById.get(id);
    const rate = typeof row?.attribute?.rate === 'number' ? formatPercent(row.attribute.rate) : null;
    if (!rate) return buildBeSkillPlayerText(row);
    if (row.label === 'toHorseDamageAdd') return `对坐骑造成的伤害提高${rate}%`;
    if (row.label === 'toNeutraDamageAdd') return `对中立怪物造成的伤害提高${rate}%`;
    if (row.label === 'toStageObjDamageAdd') return `对土堡等场景物件造成的伤害提高${rate}%`;
    return buildBeSkillPlayerText(row);
  }).filter(Boolean);
}

function buildTeleportEffects(monster, source) {
  const skills = resolveMonsterSkillAnalyses(monster, source, ['vSkill']);
  const teleportEffects = [];
  const buffEffects = [];
  for (const skill of skills) {
    const events = collectActionEventsForSkill(source.skillById.get(skill.id), monster, source);
    for (const event of events) {
      if (event?.type === 22 && event.posType === 99) {
        const delay = secondsTextFromFrames(event.t || 0);
        teleportEffects.push(`${delay ? `引导${delay}后` : ''}传送到已选择的存活水晶位置`);
      }
      for (const buffId of collectBuffIdsFromEvent(event)) {
        const buff = source.buffById.get(buffId);
        if (!buff || !/无敌|虚无/.test(`${buff.name || ''}${buff.text || ''}`)) continue;
        const text = buildBuffEffectText(buff, source.buffById);
        if (text) buffEffects.push(text);
      }
    }
  }
  return [...new Set([...teleportEffects, ...buffEffects])];
}

function buildSummonEvents(skill, monster, source) {
  return collectActionEventsForSkill(skill, monster, source)
    .filter((event) => event?.type === 13 && Array.isArray(event.mIds))
    .map((event) => ({
      monsterIds: uniqueNumbers(event.mIds),
      maxCount: typeof event.maxCount === 'number' ? event.maxCount : null,
      lifetimeSeconds: typeof event.time === 'number' && event.time >= 0 ? event.time : null,
    }));
}

function buildSummonAnalysis(monster, source) {
  const skillAnalyses = resolveMonsterSkillAnalyses(monster, source, ['skillIds', 'appearSkill', 'dieSkill']);
  const damage = skillAnalyses.map(commonDamageEntry).filter(Boolean);
  const effects = [];
  for (const skillAnalysis of skillAnalyses) {
    const skill = source.skillById.get(skillAnalysis.id);
    effects.push(...buildCrystalBuffEffects(skill, monster, source));
    for (const damageEntry of [commonDamageEntry(skillAnalysis)].filter(Boolean)) {
      effects.push(`${damageEntry.skillName}造成${damageEntry.formula}${damageEntry.total ? `，总系数${damageEntry.total.replace(/系数$/, '')}` : ''}`);
      const impactText = commonImpactText(damageEntry.impactTags);
      if (impactText) effects.push(impactText);
      for (const buffId of damageEntry.hitBuffIds || []) {
        const buffText = buildBuffEffectText(source.buffById.get(buffId), source.buffById);
        if (buffText) effects.push(buffText);
      }
    }
  }
  effects.push(...buildInitBeSkillEffects(monster, source));
  const damagingSkills = skillAnalyses.filter((skill) => (skill.damageSegments || []).some((segment) => segment.damage));
  return {
    id: monster.id,
    name: monster.name,
    effects: [...new Set(effects)],
    damage,
    warnings: damagingSkills.flatMap((skill) => skill.warnings || []),
  };
}

function buildUnlockText(row) {
  if (Array.isArray(row.unlockLimit) && row.unlockLimit[0] === 1 && typeof row.unlockLimit[1] === 'number') {
    return `达到${row.unlockLimit[1]}级后可解锁`;
  }
  return '默认开放';
}

function buildChargeText(row, skill) {
  if (row.cdNotRecovery === 1) {
    const parts = ['不自动恢复'];
    if (typeof row.cdRate === 'number' && row.cdRate > 0) parts.push(`水晶进度每1%充能${coefficientNumber(row.cdRate)}%`);
    return parts.join('，');
  }
  if (typeof skill?.cd === 'number') return `${coefficientNumber(skill.cd)}秒`;
  return '';
}

function buildCommonSkillPlayerText({ row, mainSkill, actionEffects, summonEvents, summons, teleportEffects }) {
  if (teleportEffects.length) {
    return `打开小地图选择存活水晶，${teleportEffects.join('；')}。冷却${buildChargeText(row, mainSkill)}。`;
  }
  if (summons.length) {
    const summonNames = summons.map((item) => item.name).join('、');
    const summonText = summonEvents.length
      ? `召唤${summonEvents[0].maxCount || 1}个${summonNames}`
      : `召唤${summonNames}`;
    const effects = summons.flatMap((item) => item.effects);
    const chargeText = buildChargeText(row, mainSkill);
    const cooldownText = chargeText ? (row.cdNotRecovery === 1 ? chargeText : `冷却${chargeText}`) : '';
    return `${summonText}。${effects.join('；')}。${cooldownText ? `${cooldownText}。` : ''}`.replace(/。+/g, '。');
  }
  if (actionEffects.length) {
    const chargeText = buildChargeText(row, mainSkill);
    return `${actionEffects.join('；')}。${chargeText ? `冷却${chargeText}。` : ''}`;
  }
  return cleanText(row.text);
}

function buildCommonSkillFacts(row, mainSkill) {
  const facts = [
    { label: '解锁', value: buildUnlockText(row) },
  ];
  const chargeText = buildChargeText(row, mainSkill);
  if (chargeText) facts.push({ label: row.cdNotRecovery === 1 ? '充能' : '冷却', value: chargeText });
  if (typeof row.releaseCount === 'number') facts.push({ label: '最多储存', value: `${row.releaseCount}次` });
  if (Array.isArray(row.godWarStage) && row.godWarStage.length) facts.push({ label: '适用战场', value: row.godWarStage.join('、') });
  return facts;
}

function buildCommonSkill(row, source) {
  const warnings = [];
  const mainMonster = source.monsterById.get(Number(row.monsterId));
  if (!mainMonster) warnings.push(`${row.name} 找不到 monster ${row.monsterId}`);
  const mainSkillId = collectMonsterSkillIds(mainMonster, ['skillIds'])[0];
  const mainSkill = source.skillById.get(Number(mainSkillId));
  if (!mainSkill) warnings.push(`${row.name} 找不到入口 skill ${mainSkillId}`);

  const actionEffects = buildActionBuffEffects(mainSkill, mainMonster, source);
  const summonEvents = buildSummonEvents(mainSkill, mainMonster, source);
  const summonIds = uniqueNumbers([
    ...(mainMonster?.linkMonster || []),
    ...summonEvents.flatMap((event) => event.monsterIds),
  ]);
  const summons = summonIds
    .map((id) => source.monsterById.get(id))
    .filter(Boolean)
    .map((monster) => buildSummonAnalysis(monster, source));
  const teleportEffects = buildTeleportEffects(mainMonster, source);
  for (const summon of summons) warnings.push(...(summon.warnings || []));

  const playerText = buildCommonSkillPlayerText({
    row,
    mainSkill,
    actionEffects,
    summonEvents,
    summons,
    teleportEffects,
  });

  return {
    id: row.id,
    sort: row.sort,
    group: row.group,
    name: row.name,
    icon: row.icon,
    officialText: cleanText(row.text),
    playerText,
    facts: buildCommonSkillFacts(row, mainSkill),
    actionEffects,
    summonEvents,
    summons,
    teleportEffects,
    source: {
      monsterId: row.monsterId ?? null,
      skillId: mainSkill?.id ?? null,
    },
    warnings: [...new Set(warnings)],
  };
}

function buildBossCommonSkillPayload() {
  const source = {
    monsterById: indexById(u.loadTable('monster')),
    skillById: indexById(u.loadTable('skill')),
    skillLevelById: indexById(u.loadTable('skillLevel')),
    beSkillById: indexById(u.loadTable('beskill')),
    buffById: indexById(u.loadTable('buff')),
    bulletById: indexById(loadJsonIfExists(BULLETS_PATH) || []),
  };
  return u.loadTable('bossMagicWeapon')
    .slice()
    .sort((left, right) => Number(left.sort || 0) - Number(right.sort || 0) || Number(left.id || 0) - Number(right.id || 0))
    .map((row) => buildCommonSkill(row, source));
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
      baseMechanisms: entry.baseMechanisms || [],
      skills: (entry.skills || []).map((skill) => ({ ...skill, damageDisplay: buildConfigDamageDisplay(skill) })),
      internalSkills: (entry.internalSkills || []).map((skill) => ({ ...skill, damageDisplay: buildConfigDamageDisplay(skill) })),
      mechanismOverride: { covered: false },
    };
  }

  const applySkillOverride = (skill) => {
    const override = skillOverrideFor(skill, bossOverride);
    if (!override) return { ...skill, damageDisplay: buildConfigDamageDisplay(skill) };
    const warnings = [...(skill.warnings || [])];
    const damageDisplayHints = applyDamageDisplayHints(skill, override, warnings);
    return {
      ...skill,
      damageDisplay: damageDisplayHints.display,
      mechanics: compactMechanisms([
        ...(skill.mechanics || []),
        ...(Array.isArray(override.mechanics) ? override.mechanics : []),
      ]),
      warnings,
      mechanismOverride: { covered: true, ignoredDamageDisplayFields: damageDisplayHints.ignoredFields },
    };
  };

  return {
    ...entry,
    baseMechanisms: compactMechanisms([
      ...(entry.baseMechanisms || []),
      ...(Array.isArray(bossOverride.baseMechanisms) ? bossOverride.baseMechanisms : []),
    ]),
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
  const fashionByBossGroup = buildFashionByBossGroup(fashionRows, bossGroupByRowId, beSkillById, buffById);

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
      const initBeSkills = resolveBeSkillBrief(primaryMonster?.initBeSkill || [], beSkillById, buffById);
      const bossRowBeSkills = resolveBeSkillBrief(rows.flatMap((row) => row.beSkill || []), beSkillById, buffById);
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
  const buffById = indexById(u.loadTable('buff'));
  return buildTalents(talentRows, talentGroupRows, beSkillById, buffById);
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
  u.saveOutput('call_god_boss_common_skills', buildBossCommonSkillPayload(), {
    system: 'call_god',
    source: 'bossMagicWeapon.*.json + monster.*.json + skill.*.json + skillLevel.*.json + beskills/buffs + file/battle-config',
    wordingPolicy: '玩家文案按 .agents/AGENTS.md 清洗：时间显示秒，机制说明不透出开发字段。',
  });
}

module.exports = extractCallGodBossAnalysis;
