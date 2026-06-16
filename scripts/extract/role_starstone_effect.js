/**
 * 角色 -> 星石系统 -> 通用词条效果
 */
const fs = require('fs');
const path = require('path');
const u = require('../lib/utils');

const SAMPLE_LEVELS = [1, 5, 10, 20, 30, 40];
const EXTREME_UNLOCK_LEVELS = [10, 20, 30, 40];
const FRAME_RATE = 30;

const TYPE_NAMES = new Map([
  [1, '攻伐'],
  [2, '守御']
]);

const OVERRIDES_FILENAMES = ['lianzhen.json', 'wuqu.json', 'common.json'];

function toMap(rows) {
  return new Map(rows.map((row) => [Number(row.id), row]));
}

function flattenIds(value) {
  const result = [];
  const walk = (entry) => {
    if (Array.isArray(entry)) {
      entry.forEach(walk);
      return;
    }
    const id = Number(entry);
    if (Number.isFinite(id)) result.push(id);
  };
  walk(value);
  return result;
}

function uniqueBy(rows, keyFn) {
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const key = keyFn(row);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

function trimNumber(value, digits = 4) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
  const fixed = Number(value.toFixed(digits));
  return Number.isInteger(fixed) ? String(fixed) : String(fixed);
}

function formatPercent(value) {
  return `${trimNumber(Math.abs(value) * 100, 2)}%`;
}

function formatSignedPercent(value) {
  const sign = value < 0 ? '-' : '';
  return `${sign}${formatPercent(value)}`;
}

const PERCENT_VALUE_BUFF_TYPES = new Set([
  6, // 防御变化
  17, // 伤害变化
  32, // 吸血
  70, // 穿透
  462 // 属性伤害强化
]);

function formatBuffNumber(buff, value) {
  if (PERCENT_VALUE_BUFF_TYPES.has(Number(buff?.type))) return formatPercent(value);
  return Math.abs(value) < 1 ? formatPercent(value) : String(Math.abs(value));
}

function propDisplayName(propName) {
  const names = {
    atk: '面板攻击力',
    def: '面板防御力',
    hp: '最大生命'
  };
  return names[propName] || propName;
}

function scopePropDisplayName(scope) {
  const names = {
    getAtk: '攻击',
    getDef: '防御',
    getHp: '生命'
  };
  return names[scope] || scope;
}

function propChangeLabel(scope, value) {
  const target = scopePropDisplayName(scope);
  return `${target}${value < 0 ? '扣减' : '增加'}`;
}

function formatFrames(frames) {
  if (typeof frames !== 'number' || !Number.isFinite(frames) || frames === 0) return null;
  if (frames < 0) return '随来源状态持续';
  return `${trimNumber(frames / FRAME_RATE, 2)}秒`;
}

function cleanMeasureLabel(label) {
  return String(label || '')
    .replace(/^额外/, '额外')
    .replace(/[：:]\s*$/, '')
    .trim();
}

function valueShape(value) {
  return String(value || '').replace(/[-+]?\d+(?:\.\d+)?\s*(?:%|秒|帧|层|次|点|倍)?/g, '#');
}

function sameShape(values) {
  const shapes = [...new Set(values.map(valueShape).filter(Boolean))];
  return shapes.length <= 1;
}

function extractNumbers(text) {
  return (String(text || '').match(/[-+]?\d+(?:\.\d+)?\s*(?:%|秒|帧|层|次|点|倍)?/g) || [])
    .map((token) => token.replace(/\s+/g, ''))
    .filter((token) => !/^\d{5,}$/.test(token));
}

function compactDisplayValue(text) {
  return String(text || '')
    .replace(/^\s*[:：]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function labelFromClause(clause, values, fallbackLabel) {
  const [beforeColon, afterColon] = String(clause).split(/[：:]/).map((part) => part.trim());
  const source = afterColon == null ? beforeColon : beforeColon;
  const value = values[0] || '';

  if (/触发率/.test(clause)) return '触发率';
  if (/最大法力|最大蓝量/.test(clause) && /回复|法力回复|回蓝/.test(clause)) return '最大法力回复';
  if (/返还最后一次技能耗蓝/.test(clause)) return '返还技能耗蓝';
  if (/上限为最大蓝量/.test(clause)) return '最大蓝量上限';
  if (/攻击力/.test(clause) && /伤害|额外伤害|每次命中/.test(clause)) return '攻击力比例';
  if (/防御力/.test(clause) && /伤害|额外伤害|每次命中/.test(clause)) return '防御力比例';
  if (/自身最大生命|最大生命/.test(clause) && /护盾|回复/.test(clause)) return '最大生命比例';
  if (/本次伤害/.test(clause)) return '本次伤害比例';
  if (/面板攻击力/.test(clause) && /防御/.test(clause)) return '防御增加（面板攻击力）';
  if (/面板攻击力/.test(clause) && /攻击扣减/.test(clause)) return '攻击扣减（面板攻击力）';
  if (/面板防御力/.test(clause) && /攻击/.test(clause)) return '攻击增加（面板防御力）';
  if (/面板防御力/.test(clause) && /防御扣减/.test(clause)) return '防御扣减（面板防御力）';
  if (/持续/.test(clause) && /秒/.test(value)) return `${source || fallbackLabel}持续时间`;
  if (source && source !== clause) return cleanMeasureLabel(source);

  const attr = clause.match(/([\u4e00-\u9fa5A-Za-z·]{1,16}(?:提高|提升|强化|增加|降低|扣减|减伤|伤害|回复|护盾|中毒|灼烧|流血|麻木|晕眩|冰冻|失明|穿透|韧性|暴击|幸运|闪避|命中|移速|跳跃|回魔))/);
  if (attr) return cleanMeasureLabel(attr[1]);
  return cleanMeasureLabel(fallbackLabel);
}

function extractDisplayMeasures(tier, fallbackLabel) {
  const value = String(tier?.value || '').trim();
  if (!value) return [];
  if (/^(未配置|缺少|undefined)$/.test(value)) return [];
  if (/无可验证战斗效果/.test(value)) {
    return [{ label: '效果状态', value: '无可验证战斗效果' }];
  }

  const clauses = value
    .split(/[，,；;]/)
    .map((clause) => clause.trim())
    .filter(Boolean)
    .filter((clause) => !/^\d{5,}$/.test(clause));

  const measures = [];
  for (const clause of clauses) {
    if (/冷却/.test(clause)) continue;
    if (/最多.*触发|最多成功触发/.test(clause)) continue;
    if (/最多.*层|一次添加.*层/.test(clause)) continue;
    if (/可命中|间隔/.test(clause)) continue;
    if (/每\d+(?:\.\d+)?秒最多/.test(clause)) continue;
    if (/^每损失/.test(clause)) continue;
    if (/随来源状态持续/.test(clause)) continue;

    let values = extractNumbers(clause);
    if (values.length === 0) continue;
    if (values.length > 1 && /秒$/.test(values[0]) && (/^\d+(?:\.\d+)?秒/.test(clause) || /内|跟随/.test(clause))) {
      values = values.slice(1);
    }
    const hasOnlyDuration = values.every((token) => /秒$/.test(token));
    const keepDuration = /持续/.test(clause) && hasOnlyDuration;
    if (hasOnlyDuration && !keepDuration) continue;

    const label = labelFromClause(clause, values, fallbackLabel);
    let displayValue = values.join(' / ');
    if (/攻击力/.test(clause) && /(?:\+|加)\s*\d/.test(clause)) {
      displayValue = values.join(' + ');
    } else if (/防御力/.test(clause) && /(?:\+|加)\s*\d/.test(clause)) {
      displayValue = values.join(' + ');
    }
    measures.push({
      label,
      value: compactDisplayValue(displayValue),
      source: clause
    });
  }

  return measures;
}

function normalizeFallbackLabel(label) {
  const text = cleanMeasureLabel(label);
  if (/天赋无双/.test(text) && /免伤时长/.test(text)) return '变身持续时间延长 / 免伤时长延长';
  return text;
}

function buildDisplayTable(tiers, fallbackLabel) {
  const normalizedFallbackLabel = normalizeFallbackLabel(fallbackLabel);
  const measuredRows = tiers.map((tier) => ({
    tier,
    measures: extractDisplayMeasures(tier, normalizedFallbackLabel)
  }));
  const labels = [...new Set(measuredRows.flatMap((row) => row.measures.map((measure) => measure.label)))];
  const labelValues = (label) => measuredRows.map((row) => {
    return row.measures
      .filter((measure) => measure.label === label)
      .map((measure) => measure.value)
      .join(' / ');
  });
  const varyingLabels = labels.filter((label) => {
    const values = labelValues(label);
    return new Set(values).size > 1 && !sameShape(values);
  });
  const comparableVaryingLabels = labels.filter((label) => {
    const values = labelValues(label);
    return new Set(values).size > 1;
  });
  let activeLabels = comparableVaryingLabels.length > 0 ? comparableVaryingLabels : labels;
  activeLabels = activeLabels.filter((label) => {
    const values = measuredRows.map((row) => {
      return row.measures
        .filter((measure) => measure.label === label)
        .map((measure) => measure.value)
        .join(' / ');
    });
    if (/持续时间/.test(label) && activeLabels.length > 1 && new Set(values).size <= 1) return false;
    return true;
  });

  return {
    valueHeader: activeLabels.length > 0 ? activeLabels.join(' / ') : normalizedFallbackLabel,
    tiers: tiers.map((tier, index) => {
      const measures = measuredRows[index].measures;
      const selected = activeLabels
        .flatMap((label) => measures.filter((measure) => measure.label === label).map((measure) => measure.value))
        .filter(Boolean);
      return {
        level: tier.level,
        unlockLevel: tier.unlockLevel,
        value: selected.length > 0 ? selected.join(' / ') : '—'
      };
    }),
    omittedHeaders: varyingLabels.length === 0 && comparableVaryingLabels.length > 0 ? [] : []
  };
}

function firstLine(text) {
  return String(text || '').split('\n').map((line) => line.trim()).find(Boolean) || '';
}

function officialLines(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function loadOverrides() {
  const overrides = {};
  for (const filename of OVERRIDES_FILENAMES) {
    const filePath = path.join(__dirname, 'starstone_effect', filename);
    if (fs.existsSync(filePath)) {
      Object.assign(overrides, JSON.parse(fs.readFileSync(filePath, 'utf8')));
    }
  }
  return overrides;
}

function applyOverride(record, overrides) {
  const override = overrides[String(record.group)];
  if (!override) return record;

  let warnings = [
    ...(record.warnings || []),
    ...(override.warnings || [])
  ];

  if (Array.isArray(override.ignoreWarnings)) {
    const ignoreSet = new Set(override.ignoreWarnings);
    warnings = warnings.filter(w => !ignoreSet.has(w) && ![...ignoreSet].some(pattern => w.includes(pattern)));
  }

  return {
    ...record,
    ...override,
    warnings,
    review: {
      ...(record.review || {}),
      ...(override.review || {})
    }
  };
}

function buildContext() {
  const tables = {
    starStoneAffix: u.loadTable('starStoneAffix'),
    starStone: u.loadTable('starStone'),
    starHavocPond: u.loadTable('starHavocPond'),
    dropGroup: u.loadTable('dropGroup'),
    drop: u.loadTable('drop'),
    item: u.loadTable('item'),
    beskill: u.loadTable('beskill'),
    buff: u.loadTable('buff')
  };

  return {
    ...tables,
    starStoneById: toMap(tables.starStone),
    itemById: toMap(tables.item),
    beskillById: toMap(tables.beskill),
    buffById: toMap(tables.buff)
  };
}

function buildRewardGroupUsage(context) {
  const usage = new Map();
  for (const pond of context.starHavocPond) {
    for (const rewardGroupId of flattenIds(pond.reward)) {
      const groupRows = context.dropGroup.filter((row) => Number(row.groupID) === rewardGroupId);
      let hasStarStoneDrop = false;
      for (const groupRow of groupRows) {
        const dropRows = context.drop.filter((row) => Number(row.dropID) === Number(groupRow.dropID));
        for (const dropRow of dropRows) {
          for (const itemPair of Array.isArray(dropRow.items) ? dropRow.items : []) {
            const itemId = Number(Array.isArray(itemPair) ? itemPair[0] : itemPair);
            if (context.itemById.get(itemId)?.type === 'starStone') hasStarStoneDrop = true;
          }
        }
      }
      if (!hasStarStoneDrop) continue;
      if (!usage.has(rewardGroupId)) usage.set(rewardGroupId, new Set());
      usage.get(rewardGroupId).add(Number(pond.id));
    }
  }
  return usage;
}

function collectPondMatches(group, context, rewardGroupUsage) {
  const matches = [];
  for (const pond of context.starHavocPond) {
    for (const rewardGroupId of flattenIds(pond.reward)) {
      const groupRows = context.dropGroup.filter((row) => Number(row.groupID) === rewardGroupId);
      for (const dropGroupRow of groupRows) {
        const dropRows = context.drop.filter((row) => Number(row.dropID) === Number(dropGroupRow.dropID));
        for (const dropRow of dropRows) {
          for (const itemPair of Array.isArray(dropRow.items) ? dropRow.items : []) {
            const itemId = Number(Array.isArray(itemPair) ? itemPair[0] : itemPair);
            const item = context.itemById.get(itemId);
            if (!item || item.type !== 'starStone') continue;
            const starStone = context.starStoneById.get(itemId);
            if (!starStone || !Array.isArray(starStone.affixRandom)) continue;
            if (!starStone.affixRandom.map(Number).includes(Number(group))) continue;
            matches.push({
              pondId: pond.id,
              pondName: pond.name,
              rewardGroupId,
              dropItemId: itemId,
              itemName: item.name,
              type: Number(starStone.type),
              typeName: TYPE_NAMES.get(Number(starStone.type)) || `未知类型${starStone.type}`,
              isCommonRewardGroup: (rewardGroupUsage.get(rewardGroupId)?.size || 0) > 1
            });
          }
        }
      }
    }
  }
  return matches;
}

function resolveOwnership(group, context, rewardGroupUsage, warnings) {
  const matches = collectPondMatches(group, context, rewardGroupUsage);
  const commonMatches = matches.filter((match) => match.isCommonRewardGroup);
  const exclusiveMatches = matches.filter((match) => !match.isCommonRewardGroup);
  const typeEntries = uniqueBy(matches.map((match) => ({
    type: match.type,
    name: match.typeName
  })), (entry) => entry.type).sort((a, b) => a.type - b.type);

  if (commonMatches.length > 0) {
    return {
      ownership: {
        kind: '通用',
        name: '通用',
        rewardGroupIds: [...new Set(commonMatches.map((match) => match.rewardGroupId))].sort((a, b) => a - b)
      },
      typeEntries,
      evidence: uniqueBy(commonMatches, (match) => `${match.pondId}:${match.rewardGroupId}:${match.dropItemId}`)
    };
  }

  const exclusivePonds = uniqueBy(exclusiveMatches.map((match) => ({
    id: match.pondId,
    name: match.pondName
  })), (entry) => entry.id);
  if (matches.length === 0) {
    warnings.push(`词条组 ${group} 未命中任何星石掉落链路`);
  }
  if (exclusivePonds.length > 1) {
    warnings.push(`词条组 ${group} 命中多个专属星池: ${exclusivePonds.map((pond) => pond.name).join(', ')}`);
  }

  return {
    ownership: {
      kind: exclusivePonds.length === 1 ? '专属' : '未知',
      name: exclusivePonds.length === 1 ? exclusivePonds[0].name : '未知'
    },
    typeEntries,
    evidence: exclusiveMatches
  };
}

function collectLinkedBuffIds(skill) {
  const ids = [];
  const attr = skill?.attribute;
  if (Array.isArray(attr)) ids.push(...attr.filter((value) => Number.isFinite(Number(value))).map(Number));
  if (attr && typeof attr === 'object' && !Array.isArray(attr)) {
    if (Array.isArray(attr.addBuffIds)) ids.push(...attr.addBuffIds.map(Number));
    if (Array.isArray(attr.addBuffs)) ids.push(...attr.addBuffs.map(Number));
    if (Array.isArray(attr.buffIds)) ids.push(...attr.buffIds.map(Number));
    if (Array.isArray(attr.buff)) ids.push(...attr.buff.map(Number));
    if (Array.isArray(attr.buffs)) ids.push(...attr.buffs.map(Number));
  }
  if (Array.isArray(skill?.addBuffIds)) ids.push(...skill.addBuffIds.map(Number));
  return [...new Set(ids)];
}

function formatDirectAttribute(skill) {
  const attr = skill?.attribute;
  if (attr == null) return [];
  const parts = [];

  if (typeof attr === 'number') {
    if (attr !== 1) parts.push(String(attr));
  } else if (Array.isArray(attr)) {
    if (attr.length === 2 && attr.every((value) => typeof value === 'number')) {
      if (attr[0] !== 0 && Math.abs(attr[0]) < 1) parts.push(formatPercent(attr[0]));
      if (attr[1] !== 0) parts.push(String(attr[1]));
    }
  } else if (typeof attr === 'object') {
    if (typeof attr.propPer === 'number' && attr.propPer !== 0 && attr.propName) {
      parts.push(`${propChangeLabel(skill.scope, attr.propPer)}：${propDisplayName(attr.propName)} ${formatPercent(attr.propPer)}`);
    }
    for (const key of ['per', 'rate']) {
      if (typeof attr[key] === 'number' && attr[key] !== 0) parts.push(formatPercent(attr[key]));
    }
    for (const key of ['val', 'value']) {
      if (typeof attr[key] === 'number' && attr[key] !== 0) parts.push(String(attr[key]));
    }
    if (attr.backMp && typeof attr.backMp === 'object') {
      const backMpParts = [];
      if (typeof attr.backMp.backMpPer === 'number') {
        backMpParts.push(`返还最后一次技能耗蓝${formatPercent(attr.backMp.backMpPer)}`);
      }
      if (typeof attr.backMp.cureMpPer === 'number') {
        backMpParts.push(`上限为最大蓝量${formatPercent(attr.backMp.cureMpPer)}`);
      }
      parts.push(backMpParts.join('，'));
    }
  }

  return [...new Set(parts)];
}

function formatBuffValue(buff) {
  const parts = [];
  if (!buff) return parts;

  if (Number(buff.type) === 16 && typeof buff.value?.param?.[2] === 'number' && buff.value.param[2] !== 0) {
    parts.push(`最大法力${formatPercent(buff.value.param[2])}`);
  }

  if (Array.isArray(buff.value)) {
    const first = buff.value[0];
    if (typeof first === 'number' && first !== 0) {
      parts.push(formatBuffNumber(buff, first));
    } else if (Array.isArray(first)) {
      const values = first.flat().filter((value) => typeof value === 'number' && value !== 0);
      if (values.length > 0) {
        parts.push(values.map((value) => formatBuffNumber(buff, value)).join(' / '));
      }
    }
    if (Number(buff.type) === 13 && typeof buff.value[3] === 'number' && buff.value[3] !== 0) {
      parts.push(`自身最大生命${formatPercent(buff.value[3])}`);
    }
  } else if (typeof buff.value === 'number' && buff.value !== 0) {
    parts.push(Math.abs(buff.value) < 1 ? formatPercent(buff.value) : String(buff.value));
  } else if (buff.value && typeof buff.value === 'object' && typeof buff.value.per === 'number') {
    parts.push(formatPercent(buff.value.per));
  }

  const duration = formatFrames(buff.time);
  if (duration) parts.push(duration.startsWith('随') ? duration : `持续${duration}`);
  return parts;
}

function summarizeSkill(skill, context) {
  if (!skill) return { text: '缺少技能配置', value: '缺少技能配置', raw: null, linkedBuffs: [] };

  const directValues = formatDirectAttribute(skill);
  const linkedBuffs = collectLinkedBuffIds(skill)
    .map((id) => context.buffById.get(id))
    .filter(Boolean)
    .map((buff) => ({
      id: buff.id,
      name: buff.name,
      text: buff.text,
      value: formatBuffValue(buff).join('，')
    }));

  const valueParts = [];
  valueParts.push(...directValues);
  for (const buff of linkedBuffs) {
    const text = [buff.name || buff.text, buff.value].filter(Boolean).join('：');
    if (text) valueParts.push(text);
  }
  if (skill.rate && skill.rate !== 1) valueParts.push(`触发率${formatPercent(skill.rate)}`);
  const cooldown = formatFrames(skill.cd);
  if (cooldown) valueParts.push(`冷却${cooldown}`);
  const chargedCooldown = formatFrames(skill.chargedCd);
  if (chargedCooldown) valueParts.push(`每${chargedCooldown}最多触发${skill.chargedNumber || 1}次`);

  return {
    text: firstLine(skill.text) || skill.name || `技能 ${skill.id}`,
    value: valueParts.length > 0 ? valueParts.join('，') : firstLine(skill.text) || '见机制说明',
    raw: {
      id: skill.id,
      label: skill.label,
      scope: skill.scope,
      attribute: skill.attribute,
      rate: skill.rate,
      cd: skill.cd,
      chargedCd: skill.chargedCd,
      chargedNumber: skill.chargedNumber
    },
    linkedBuffs
  };
}

function getAffixRows(group, context) {
  return context.starStoneAffix
    .filter((row) => Number(row.group) === Number(group))
    .sort((a, b) => Number(a.affixLv) - Number(b.affixLv));
}

function buildEffectRecord(group, rows, context, ownershipInfo, overrides = {}) {
  const warnings = [];
  const missingBaseSkillIds = [];
  const missingExtremeSkillIds = [];
  const unlockRows = EXTREME_UNLOCK_LEVELS.map((level) => rows.find((row) => Number(row.affixLv) === level)).filter(Boolean);
  const baseSkillCount = Math.max(1, Array.isArray(rows[0]?.skillId) ? rows[0].skillId.length : 1);

  if (ownershipInfo.ownership?.kind === '未知') {
    warnings.push(ownershipInfo.ownership.reason || '无法解析星石归属');
  }

  const baseRows = rows.map((row) => {
    const skillIds = Array.isArray(row.skillId) ? row.skillId.slice(0, baseSkillCount) : [];
    const summaries = skillIds.map((skillId) => summarizeSkill(context.beskillById.get(Number(skillId)), context));
    skillIds.forEach((skillId, index) => {
      if (!summaries[index]?.raw) missingBaseSkillIds.push(skillId);
    });
    return {
      level: row.affixLv,
      skillId: skillIds[0] || null,
      skillIds,
      effect: summaries.map((summary) => summary.text).join('；') || '缺少技能配置',
      value: summaries.map((summary) => summary.value).join('；') || '缺少技能配置',
      raw: summaries[0]?.raw || null,
      rawSkills: summaries.map((summary) => summary.raw).filter(Boolean),
      linkedBuffs: summaries.flatMap((summary) => summary.linkedBuffs)
    };
  });

  const extremeRows = unlockRows.map((row, index) => {
    const skillIds = Array.isArray(row.skillId) ? row.skillId.slice(baseSkillCount) : [];
    if (skillIds.length === 0) warnings.push(`Lv${row.affixLv} 未配置普通极效 skillId`);
    const summaries = skillIds.map((skillId) => summarizeSkill(context.beskillById.get(Number(skillId)), context));
    skillIds.forEach((skillId, skillIndex) => {
      if (!summaries[skillIndex]?.raw) missingExtremeSkillIds.push(skillId);
    });
    return {
      level: index + 1,
      unlockLevel: row.affixLv,
      skillIds,
      effect: summaries.map((summary) => summary.text).join('；') || '未配置',
      value: summaries.map((summary) => summary.value).join('；') || '未配置',
      raw: summaries.map((summary) => summary.raw).filter(Boolean),
      linkedBuffs: summaries.flatMap((summary) => summary.linkedBuffs)
    };
  });

  if (missingBaseSkillIds.length > 0) {
    warnings.push(`缺少普通技能配置: ${[...new Set(missingBaseSkillIds)].join(', ')}`);
  }
  if (missingExtremeSkillIds.length > 0) {
    warnings.push(`缺少极效技能配置: ${[...new Set(missingExtremeSkillIds)].join(', ')}`);
  }

  const officialDescription = [...new Set(rows.flatMap((row) => {
    const skillId = Array.isArray(row.skillId) ? row.skillId[0] : null;
    return officialLines(context.beskillById.get(Number(skillId))?.text);
  }))].join('\n');

  const mechanismExplanation = [
    baseRows[0]?.effect
      ? `普通效果按词条等级读取第一个技能，当前表格展示的是该等级单独生效的数值，不与其他等级累加。`
      : null,
    extremeRows.some((row) => row.skillIds.length > 0)
      ? `极效在词条 Lv.10、Lv.20、Lv.30、Lv.40 各解锁一级，来源是对应等级额外配置的技能；极效与普通效果分表展示。`
      : `当前词条没有配置普通极效。`,
    baseRows[0]?.effect && extremeRows.find((row) => row.skillIds.length > 0)?.effect
      ? `普通效果为“${baseRows[0].effect}”，极效为“${extremeRows.find((row) => row.skillIds.length > 0)?.effect}”。`
      : null
  ].filter(Boolean).join('');

  const record = {
    id: group,
    group,
    name: rows[0].name,
    type: ownershipInfo.typeEntries[0]?.type || null,
    typeName: ownershipInfo.typeEntries.map((entry) => entry.name).join(' / ') || '未知',
    ownership: ownershipInfo.ownership,
    officialDescription,
    mechanismExplanation,
    summary: [
      baseRows[0]?.effect ? `普通效果：${baseRows[0].effect}。` : null,
      extremeRows.some((row) => row.skillIds.length > 0) ? `极效：${extremeRows[0]?.effect || '见极效表'}。` : null
    ].filter(Boolean).join(''),
    baseEffectName: baseRows[0]?.effect || rows[0].name,
    extremeEffectName: extremeRows.find((row) => row.skillIds.length > 0)?.effect || '未配置极效',
    baseTiers: baseRows,
    extremeTiers: extremeRows,
    evidence: {
      rewardGroupIds: ownershipInfo.ownership.rewardGroupIds || [],
      pondDrops: ownershipInfo.evidence.map((entry) => ({
        pondId: entry.pondId,
        pondName: entry.pondName,
        rewardGroupId: entry.rewardGroupId,
        dropItemId: entry.dropItemId,
        itemName: entry.itemName
      }))
    },
    warnings
  };

  const overridden = applyOverride(record, overrides);
  return {
    ...overridden,
    baseDisplay: buildDisplayTable(overridden.baseTiers || [], overridden.baseEffectName || rows[0].name),
    extremeDisplay: buildDisplayTable(overridden.extremeTiers || [], overridden.extremeEffectName || '极效')
  };
}

function extractRoleStarstoneEffect(options = {}) {
  const {
    outputName = 'role_starstone_effect',
    includeOwnershipKinds = ['通用'],
    system = '角色 → 星石系统 → 通用词条效果',
    ownershipRule = '命中被多个星池复用的星石掉落组时归为通用；本文件仅导出通用词条。'
  } = options;
  const context = buildContext();
  const overrides = loadOverrides();
  const rewardGroupUsage = buildRewardGroupUsage(context);
  const groups = [...new Set(context.starStoneAffix.map((row) => Number(row.group)))].sort((a, b) => a - b);
  const data = [];
  const warnings = [];
  const allowedOwnershipKinds = new Set(includeOwnershipKinds);

  for (const group of groups) {
    const ownershipWarnings = [];
    const ownershipInfo = resolveOwnership(group, context, rewardGroupUsage, ownershipWarnings);
    warnings.push(...ownershipWarnings);
    if (!allowedOwnershipKinds.has(ownershipInfo.ownership.kind)) continue;
    const rows = getAffixRows(group, context);
    if (rows.length === 0) {
      warnings.push(`词条组 ${group} 缺少 starStoneAffix 数据`);
      continue;
    }
    data.push(buildEffectRecord(group, rows, context, ownershipInfo, overrides));
  }

  const ownershipStats = data.reduce((acc, row) => {
    const key = row.ownership?.kind || '未知';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  u.saveOutput(outputName, data, {
    system,
    source: 'starStoneAffix + starStone + starHavocPond/dropGroup/drop/item + beskill/buff',
    ownershipRule,
    includeOwnershipKinds,
    ownershipStats,
    defaultDisplayLevels: SAMPLE_LEVELS,
    extremeUnlockLevels: EXTREME_UNLOCK_LEVELS,
    warnings
  });
}

if (require.main === module) {
  extractRoleStarstoneEffect();
}

module.exports = extractRoleStarstoneEffect;
