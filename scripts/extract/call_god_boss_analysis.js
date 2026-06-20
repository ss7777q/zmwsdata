const fs = require('fs');
const path = require('path');
const u = require('../lib/utils');

const BATTLE_CONFIG_DIR = path.join(u.ROOT, 'file', 'battle-config');
const ENTITY_CTG_DIR = path.join(BATTLE_CONFIG_DIR, 'entityCtg');
const BULLETS_PATH = path.join(BATTLE_CONFIG_DIR, 'bullets.json');
const OVERRIDES_PATH = path.join(__dirname, 'call_god_boss_overrides.json');
const JIAOCHONG_POISON_BUFF_ID = 1042401;

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
  const seconds = frames / 30;
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
      for (const subEntry of entry.com || []) {
        if (Array.isArray(subEntry.hitBuff)) {
          hitBuffIds.push(...uniqueNumbers(subEntry.hitBuff));
          for (const buffId of subEntry.hitBuff) {
            if (typeof buffId !== 'number') continue;
            hitBuffCounts[buffId] = (hitBuffCounts[buffId] || 0) + 1;
          }
        }
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
}

module.exports = extractCallGodBossAnalysis;
