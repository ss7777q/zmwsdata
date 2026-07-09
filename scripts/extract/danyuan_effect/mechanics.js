const fs = require('fs');
const path = require('path');
const {
  BATTLE_FRAMES_PER_SECOND,
  ENTITY_CTG_DIR,
  BULLETS_PATH,
  DANYUAN_INNER_TYPE_NAMES,
  DANYUAN_GROWTH_DISPLAY_RULES,
  DANYUAN_SUMMON_SKILL_LEVEL_FAMILIES,
  BULLET_BUFF_KEYS,
  BULLET_BESKILL_KEYS
} = require('./constants');

const MOUSE_DEMON_DANYUAN_FAMILY_ID = 32;

function roundNumber(value, digits = 3) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

function framesToSeconds(frames) {
  if (typeof frames !== 'number' || Number.isNaN(frames)) return null;
  if (frames < 0) return null;
  return roundNumber(frames / BATTLE_FRAMES_PER_SECOND, 3);
}

function framesText(frames) {
  if (frames == null) return null;
  if (typeof frames !== 'number' || Number.isNaN(frames)) return null;
  if (frames < 0) return '永久';
  const seconds = framesToSeconds(frames);
  return `${seconds}秒`;
}

function percentText(value, digits = 2) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return `${roundNumber(value * 100, digits)}%`;
}

function signedValueText(value, digits = 3) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return String(roundNumber(value, digits));
}

function rateText(rate) {
  if (typeof rate !== 'number' || Number.isNaN(rate)) return null;
  if (rate === 1) return '必定触发';
  return `${percentText(rate, 3)}概率`;
}

function cooldownText(be) {
  const parts = [];
  if (typeof be.initCd === 'number' && be.initCd > 0) parts.push(`初始${framesText(be.initCd)}`);
  if (typeof be.cd === 'number' && be.cd > 0) parts.push(`冷却${framesText(be.cd)}`);
  if (typeof be.chargedNumber === 'number' && be.chargedNumber > 0) {
    const hasChargeCd = typeof be.chargedCd === 'number' && be.chargedCd > 0;
    const hasDifferentInitCd = hasChargeCd
      && typeof be.chargedInitCd === 'number'
      && be.chargedInitCd > 0
      && be.chargedInitCd !== be.chargedCd;
    const charged = hasChargeCd
      ? hasDifferentInitCd
        ? `开局有${be.chargedNumber}次，先等${framesText(be.chargedInitCd)}，之后每${framesText(be.chargedCd)}把机会补回${be.chargedNumber}次`
        : `开局有${be.chargedNumber}次，每${framesText(be.chargedCd)}把机会补回${be.chargedNumber}次`
      : `开局有${be.chargedNumber}次`;
    parts.push(charged);
  }
  return parts.join('，') || null;
}

function valueText(value) {
  if (value == null) return null;
  if (typeof value === 'number') return signedValueText(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (Array.isArray(value[0])) {
      return value.map((row) => valueText(row)).filter(Boolean).join(' / ') || null;
    }
    const parts = [];
    if (typeof value[0] === 'number' && value[0] !== 0) parts.push(percentText(value[0]));
    if (typeof value[1] === 'number' && value[1] !== 0) parts.push(signedValueText(value[1]));
    if (typeof value[3] === 'number' && value[3] !== 0) parts.push(`${percentText(value[3])}最大值`);
    return parts.join(' + ') || JSON.stringify(value);
  }
  if (typeof value === 'object') {
    const parts = [];
    if (typeof value.atkPer === 'number' && value.atkPer !== 0) parts.push(`${percentText(value.atkPer)}攻击`);
    if (typeof value.atkVal === 'number' && value.atkVal !== 0) parts.push(`${signedValueText(value.atkVal)}固定值`);
    if (typeof value.toHpRate === 'number' && value.toHpRate !== 0) parts.push(`按${value.toHpRate}比例影响生命`);
    if (Array.isArray(value.param)) parts.push(`参数${JSON.stringify(value.param)}`);
    return parts.join('，') || JSON.stringify(value);
  }
  return String(value);
}

function pushWarning(warnings, code, detail) {
  warnings.push({ code, detail });
}

function getBuff(ctx, id, warnings, owner) {
  const buff = ctx.buffById.get(id);
  if (!buff) {
    pushWarning(warnings, 'DANYUAN_MISSING_BUFF', `${owner} 引用 buff ${id} 不存在`);
    return null;
  }
  return buff;
}

function getBeskill(ctx, id, warnings, owner) {
  const be = ctx.beskillById.get(id);
  if (!be) {
    pushWarning(warnings, 'DANYUAN_MISSING_BESKILL', `${owner} 引用 beskill ${id} 不存在`);
    return null;
  }
  return be;
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function uniqueNumbers(values) {
  return [...new Set(values.filter((value) => typeof value === 'number' && Number.isFinite(value)))];
}

function buffEffectText(buff) {
  if (!buff) return null;
  const parts = [];
  if (buff.type === 116 && /攻击或释放技能取消隐身状态/.test(String(buff.text || ''))) {
    parts.push('普攻和主动释放技能基本都会取消隐身；少数自动/持续型技能不走普通释放破隐链路');
  } else if (buff.text) {
    parts.push(buff.text);
  }
  const val = valueText(buff.value);
  if (val) parts.push(val);
  const duration = framesText(buff.time);
  if (duration) parts.push(`持续${duration}`);
  if (typeof buff.interval === 'number' && buff.interval > 0) parts.push(`间隔${framesText(buff.interval)}`);
  if (typeof buff.maxPiles === 'number' && buff.maxPiles > 0) parts.push(`最多${buff.maxPiles}层`);
  return parts.join('，');
}

function normalizeEffectLabelName(name) {
  return String(name || '')
    .replace(/[·\- ]*等级\d+/g, '')
    .replace(/（[^）]*）/g, '')
    .trim() || '效果';
}

function buffMetricName(buff) {
  const text = `${buff.name || ''}${buff.text || ''}`;
  if (buff.type === 16 && /魔力减少|魔法减少|扣.*魔/.test(text)) return '每秒扣魔';
  if (buff.type === 155 && /无视护盾|造成伤害/.test(text)) return '每秒生命伤害';
  if (buff.type === 31 && /体型/.test(text)) return '体型额外增大';
  if (buff.type === 17) {
    if (Array.isArray(buff.value) && buff.value[0] === 0 && typeof buff.value[1] === 'number') return '固定增伤';
    return '伤害提升';
  }
  if (/损失.*生命|流失.*生命|扣除.*生命|减少.*生命|灼烧/.test(text)) return '持续损失生命';
  if (/攻击/.test(text) && /防御/.test(text)) return '攻击提升';
  if (/回血|恢复生命|回复生命|生命值/.test(text) && !/生命上限|生命最大/.test(text)) return '回复值';
  if (/额外伤害|造成伤害/.test(text)) return '伤害值';
  if (/护盾|抵挡/.test(text)) return '护盾值';
  if (/心脏弱点/.test(text)) return '防御降低';
  if (/鹿力丹元/.test(text) && /防御/.test(text)) return '防御提升';
  if (/防御/.test(text)) return '防御值';
  if (/攻击/.test(text)) return '攻击值';
  if (/命中/.test(text)) return '命中值';
  if (/韧性/.test(text)) return /下降|弱化/.test(text) ? '韧性下降' : '韧性值';
  if (/闪避/.test(text)) return /下降|弱化/.test(text) ? '闪避下降' : '闪避值';
  if (/生命上限|生命最大/.test(text)) return '生命上限';
  if (/穿透/.test(text)) return '穿透值';
  if (/移速|移动速度/.test(text)) return '移速';
  if (/伤害/.test(text)) return '伤害值';
  if (/减伤/.test(text)) return '减伤值';
  return '数值';
}

function danyuanBuffValueLabel(buff, ctx, metric) {
  const name = normalizeEffectLabelName(buff.name || `Buff ${buff.id}`);
  const text = `${buff.name || ''}${buff.text || ''}`;

  if (ctx?.familyId === 27 && name === '青狮之力') {
    if (/微量/.test(text) || (typeof buff.maxPiles === 'number' && buff.maxPiles > 0)) return `常驻每层攻击 · ${metric}`;
    return `无双爆发攻击 · ${metric}`;
  }

  if (ctx?.familyId === 28 && name === '象形之力') {
    if (/微量/.test(text) || (typeof buff.maxPiles === 'number' && buff.maxPiles > 0)) return `常驻每层生命上限 · ${metric}`;
    return `无双爆发生命上限 · ${metric}`;
  }

  if (ctx?.familyId === 29 && name === '大鹏之力') {
    if (/微量/.test(text) || (typeof buff.maxPiles === 'number' && buff.maxPiles > 0)) return `常驻每层空中穿透 · ${metric}`;
    return `无双爆发空中穿透 · ${metric}`;
  }

  return `${name} · ${metric}`;
}

function formatStatParts(per, val, maxRate, options = {}) {
  const normalize = (value) => options.absolute && typeof value === 'number' ? Math.abs(value) : value;
  const parts = [];
  if (typeof per === 'number' && per !== 0) parts.push(percentText(normalize(per)));
  if (typeof val === 'number' && val !== 0) parts.push(signedValueText(normalize(val)));
  if (typeof maxRate === 'number' && maxRate !== 0) parts.push(`${percentText(normalize(maxRate))}最大生命`);
  return parts.join(' + ') || null;
}

function shouldDisplayAbsoluteBuffValue(buff) {
  const text = `${buff?.name || ''}${buff?.text || ''}`;
  return /损失.*生命|流失.*生命|扣除.*生命|减少.*生命|灼烧|降低|减少|下降|弱化/.test(text);
}

function formatBuffValue(value, buff = null) {
  const options = { absolute: shouldDisplayAbsoluteBuffValue(buff) };
  if (value == null) return null;
  if (typeof value === 'number') return signedValueText(options.absolute ? Math.abs(value) : value);
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (Array.isArray(value[0])) {
      return value.map((row) => formatBuffValue(row, buff)).filter(Boolean).join(' / ') || null;
    }
    if (buff?.type === 31 && typeof value[1] === 'number' && value[1] !== 0) {
      return percentText(value[1]);
    }
    return formatStatParts(value[0], value[1], value[3], options);
  }
  if (typeof value === 'object') {
    if (buff?.type === 16 && Array.isArray(value.param) && typeof value.param[0] === 'number' && value.param[0] !== 0) {
      return signedValueText(Math.abs(value.param[0]));
    }
    const parts = [];
    if (Array.isArray(value.sourceProps)) {
      for (const prop of value.sourceProps) {
        if (!Array.isArray(prop)) continue;
        const stat = formatStatParts(prop[1], prop[2], null, options);
        if (stat) parts.push(stat);
      }
    }
    const atk = formatStatParts(value.atkPer, value.atkVal, null, options);
    if (atk) parts.push(atk);
    if (typeof value.toHpRate === 'number' && value.toHpRate !== 0) parts.push(`生命影响比例 ${value.toHpRate}`);
    if (Array.isArray(value.param)) {
      const params = value.param.filter((item) => typeof item === 'number' && item !== 0);
      if (params.length) parts.push(`参数 ${params.join('/')}`);
    }
    return parts.join('，') || null;
  }
  return String(value);
}

function isBuffStatValueRow(value) {
  if (!Array.isArray(value) || value.length < 2) return false;
  if (Array.isArray(value[1])) return false;
  const first = value[0];
  const firstIsStat = typeof first === 'number'
    || Array.isArray(first)
    || (first && typeof first === 'object');
  if (!firstIsStat) return false;
  return value.slice(1).every((item) => item == null || typeof item === 'number');
}

function addReferencedBuffIds(value, ctx, out) {
  uniqueNumbers(asArray(value).flat(Infinity)).forEach((id) => {
    if (ctx.buffById.has(id)) out.add(id);
  });
}

function collectReferencedBuffIdsFromValue(value, ctx, out = new Set()) {
  if (typeof value === 'number') return out;
  if (Array.isArray(value)) {
    if (isBuffStatValueRow(value)) return out;
    if (typeof value[0] === 'number' && Array.isArray(value[1])) {
      addReferencedBuffIds(value[1], ctx, out);
      value.slice(2).forEach((item) => collectReferencedBuffIdsFromValue(item, ctx, out));
      return out;
    }
    value.forEach((item) => collectReferencedBuffIdsFromValue(item, ctx, out));
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (/buff/i.test(key)) {
        addReferencedBuffIds(item, ctx, out);
        continue;
      }
      collectReferencedBuffIdsFromValue(item, ctx, out);
    }
  }
  return out;
}

function collectBuffAttachIds(buff) {
  const ids = new Set();
  uniqueNumbers(asArray(buff?.attachBuff).flat(Infinity)).forEach((id) => ids.add(id));
  return ids;
}

function collectIdsByKeys(value, keys, out = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectIdsByKeys(item, keys, out));
    return out;
  }
  if (!value || typeof value !== 'object') return out;

  for (const [key, item] of Object.entries(value)) {
    if (keys.has(key)) {
      uniqueNumbers(asArray(item).flat(Infinity)).forEach((id) => out.add(id));
      continue;
    }
    collectIdsByKeys(item, keys, out);
  }
  return out;
}

function collectBulletBuffIds(bullet) {
  return collectIdsByKeys(bullet, BULLET_BUFF_KEYS);
}

function collectBulletBeskillIds(bullet) {
  return collectIdsByKeys(bullet, BULLET_BESKILL_KEYS);
}

function resolveLevelSequenceBuff(buff, ctx) {
  if (!buff?.id || !Number.isInteger(ctx?.danyuanLevel)) return buff;
  const sequence = ctx.buffSequenceById?.get(buff.id);
  if (!sequence || sequence.ids.length !== 20 || sequence.index !== 0) return buff;
  const targetId = sequence.ids[ctx.danyuanLevel - 1];
  if (!targetId || targetId === buff.id) return buff;
  const target = ctx.buffById.get(targetId);
  return target ? summarizeBuff(target) : buff;
}

function collectActionBuffIds(action) {
  const ids = new Set();
  for (const component of action?.buffComponents || []) {
    component.buffs.forEach((id) => ids.add(id));
  }
  for (const area of action?.areas || []) {
    uniqueNumbers(asArray(area.buffs).flat(Infinity)).forEach((id) => ids.add(id));
  }
  return ids;
}

function collectActionBulletIds(action) {
  return uniqueNumbers(asArray(action?.bullets).flat(Infinity));
}

function addRawBuffByIdEffectValues(out, seen, ctx, id, owner, warnings = null) {
  const buff = warnings ? getBuff(ctx, id, warnings, owner) : ctx.buffById.get(id);
  if (buff) addBuffEffectValues(out, seen, summarizeBuff(buff), ctx);
}

function addBeskillEffectValues(out, seen, ctx, be, warnings, depth) {
  const summary = summarizeBeskill(be, ctx, warnings, `beskill ${be.id}`);
  for (const effect of summary.effects || []) {
    if (effect.key && effect.raw) {
      addBuffEffectValues(out, seen, effect.raw, ctx);
      continue;
    }
    collectEffectRawReferences(out, seen, ctx, effect.raw, warnings, depth + 1);
    addStructuredMechanicEffectValues(out, seen, effect);
  }
}

function collectEffectRawReferences(out, seen, ctx, raw, warnings, depth = 0) {
  if (!raw || typeof raw !== 'object' || depth > 3) return;

  if (raw.action && typeof raw.action === 'object') {
    collectEffectRawReferences(out, seen, ctx, raw.action, warnings, depth + 1);
  }

  for (const id of collectActionBuffIds(raw)) {
    addRawBuffByIdEffectValues(out, seen, ctx, id, '动作组件', warnings);
  }

  for (const bulletId of collectActionBulletIds(raw)) {
    const bullet = ctx.bulletById.get(bulletId);
    if (!bullet) {
      if (warnings) pushWarning(warnings, 'DANYUAN_MISSING_BULLET', `动作引用 bullet ${bulletId} 不存在`);
      continue;
    }
    addBulletMetricEffectValues(out, seen, bullet);
    for (const buffId of collectBulletBuffIds(bullet)) {
      addRawBuffByIdEffectValues(out, seen, ctx, buffId, `bullet ${bulletId}`, warnings);
    }
    for (const beskillId of collectBulletBeskillIds(bullet)) {
      const be = warnings ? getBeskill(ctx, beskillId, warnings, `bullet ${bulletId}`) : ctx.beskillById.get(beskillId);
      if (be) addBeskillEffectValues(out, seen, ctx, be, warnings || [], depth + 1);
    }
  }

  for (const beskillId of collectIdsByKeys(raw, BULLET_BESKILL_KEYS)) {
    const be = warnings ? getBeskill(ctx, beskillId, warnings, `机制引用`) : ctx.beskillById.get(beskillId);
    if (be) addBeskillEffectValues(out, seen, ctx, be, warnings || [], depth + 1);
  }
}

function addBuffEffectValues(out, seen, buff, ctx, depth = 0) {
  const resolvedBuff = resolveLevelSequenceBuff(buff, ctx);
  const name = normalizeEffectLabelName(resolvedBuff.name || `Buff ${resolvedBuff.id}`);
  const metric = buffMetricName(resolvedBuff);
  const valueLabel = danyuanBuffValueLabel(resolvedBuff, ctx, metric);
  const valueReferencedBuffIds = collectReferencedBuffIdsFromValue(resolvedBuff.value, ctx);
  const referencedBuffIds = new Set(valueReferencedBuffIds);
  collectBuffAttachIds(resolvedBuff).forEach((id) => referencedBuffIds.add(id));
  if (
    resolvedBuff.type === 238
    && resolvedBuff.value
    && typeof resolvedBuff.value === 'object'
    && !Array.isArray(resolvedBuff.value)
  ) {
    if (typeof resolvedBuff.value.val === 'number') {
      addEffectValue(out, seen, `${name} · 单次异常值`, signedValueText(resolvedBuff.value.val), 'buff', resolvedBuff);
    }
    const valueFlag = typeof resolvedBuff.value.valueFlagId === 'number'
      ? ctx.valueFlagById?.get(resolvedBuff.value.valueFlagId)
      : null;
    if (valueFlag && typeof resolvedBuff.value.lv === 'number') {
      const valueFlagCtx = { ...ctx, danyuanLevel: resolvedBuff.value.lv };
      for (const buffId of uniqueNumbers(asArray(valueFlag.effectValue).flat(Infinity))) {
        const valueFlagBuff = ctx.buffById.get(buffId);
        if (valueFlagBuff) addBuffEffectValues(out, seen, summarizeBuff(valueFlagBuff), valueFlagCtx, depth + 1);
      }
    }
  }
  if (resolvedBuff.type === 253 && resolvedBuff.value && typeof resolvedBuff.value === 'object') {
    const { needPiles, addHp, cd } = resolvedBuff.value;
    if (typeof needPiles === 'number') addEffectValue(out, seen, `${name} · 蜕皮触发层数`, `${needPiles}层`, 'buff', resolvedBuff);
    if (Array.isArray(addHp) && typeof addHp[0] === 'number' && typeof addHp[1] === 'number') {
      addEffectValue(out, seen, `${name} · 单层回血`, `${percentText(addHp[0], 3)} + ${signedValueText(addHp[1])}`, 'buff', resolvedBuff);
    }
    if (typeof cd === 'number') addEffectValue(out, seen, `${name} · 蜕皮冷却`, framesText(cd), 'buff', resolvedBuff);
  }
  let value = formatBuffValue(resolvedBuff.value, resolvedBuff);
  if (
    ctx?.familyId === 29
    && resolvedBuff.type === 70
    && Array.isArray(resolvedBuff.value)
    && typeof resolvedBuff.value[0] === 'number'
    && resolvedBuff.value[0] !== 0
    && resolvedBuff.value[1] === 0
  ) {
    value = `${percentText(resolvedBuff.value[0])} + 0`;
  }
  if (
    ctx?.familyId === MOUSE_DEMON_DANYUAN_FAMILY_ID
    && name === '护盾'
    && Array.isArray(resolvedBuff.value)
  ) {
    if (typeof resolvedBuff.value[1] === 'number') value = signedValueText(resolvedBuff.value[1]);
    if (typeof resolvedBuff.value[3] === 'number' && resolvedBuff.value[3] !== 0) {
      addEffectValue(out, seen, `${name} · 最大生命系数`, `${percentText(resolvedBuff.value[3])}最大生命`, 'buff', resolvedBuff);
    }
  }
  if (value && valueReferencedBuffIds.size === 0) addEffectValue(out, seen, valueLabel, value, 'buff', resolvedBuff);
  if (typeof resolvedBuff.timeSeconds === 'number') addEffectValue(out, seen, `${name} · 持续时间`, `${resolvedBuff.timeSeconds}秒`, 'buff', resolvedBuff);
  if (typeof resolvedBuff.intervalSeconds === 'number' && resolvedBuff.intervalSeconds > 0) addEffectValue(out, seen, `${name} · 间隔`, `${resolvedBuff.intervalSeconds}秒`, 'buff', resolvedBuff);
  if (typeof resolvedBuff.maxPiles === 'number' && resolvedBuff.maxPiles > 0) addEffectValue(out, seen, `${name} · 层数上限`, `${resolvedBuff.maxPiles}层`, 'buff', resolvedBuff);
  if (depth >= 2) return;
  for (const id of referencedBuffIds) {
    if (id === resolvedBuff.id) continue;
    const child = ctx.buffById.get(id);
    if (child) addBuffEffectValues(out, seen, summarizeBuff(child), ctx, depth + 1);
  }
}

function addCooldownEffectValues(out, seen, raw) {
  if (!raw || typeof raw !== 'object') return;
  if (typeof raw.initCd === 'number' && raw.initCd > 0) addEffectValue(out, seen, '初始冷却', framesText(raw.initCd), 'mechanic', raw);
  if (typeof raw.cd === 'number' && raw.cd > 0) addEffectValue(out, seen, '冷却', framesText(raw.cd), 'mechanic', raw);
  if (typeof raw.chargedNumber === 'number' && raw.chargedNumber > 0) addEffectValue(out, seen, '最多可存机会', `${raw.chargedNumber}次`, 'mechanic', raw);
  if (typeof raw.chargedCd === 'number' && raw.chargedCd > 0) addEffectValue(out, seen, '机会恢复', framesText(raw.chargedCd), 'mechanic', raw);
}

function rectSizeText(rect) {
  if (!Array.isArray(rect) || rect.length < 4) return null;
  const width = rect[2];
  const height = rect[3];
  if (typeof width !== 'number' || typeof height !== 'number') return null;
  return `${width} × ${height}`;
}

function addActionMetricEffectValues(out, seen, action) {
  if (!action || typeof action !== 'object') return;
  const bulletCount = asArray(action.bullets).filter((id) => typeof id === 'number' && Number.isFinite(id)).length;
  if (bulletCount > 1) addEffectValue(out, seen, '子弹数量', `${bulletCount}个`, 'mechanic', action);
  if (Array.isArray(action.flySpeeds) && action.flySpeeds.length > 0) {
    addEffectValue(out, seen, '飞行速度', action.flySpeeds.join('/'), 'mechanic', action);
  }

  for (const area of action.areas || []) {
    if (typeof area.timeSeconds === 'number') addEffectValue(out, seen, '范围持续时间', `${area.timeSeconds}秒`, 'mechanic', area);
    const size = rectSizeText(area.attractSize || area.rect);
    if (size) addEffectValue(out, seen, '牵引范围', size, 'mechanic', area);
    if (typeof area.spd === 'number') addEffectValue(out, seen, '牵引速度', signedValueText(area.spd), 'mechanic', area);
  }
}

function addBulletMetricEffectValues(out, seen, bullet) {
  if (!bullet || typeof bullet !== 'object') return;
  if (typeof bullet.maxTime === 'number' && bullet.maxTime > 0) addEffectValue(out, seen, '子弹存在时间', `${bullet.maxTime}秒`, 'mechanic', bullet);
  const size = rectSizeText(bullet.defaultRect);
  if (size) addEffectValue(out, seen, '命中范围', size, 'mechanic', bullet);

  for (const com of bullet.com || []) {
    if (typeof com.maxHit === 'number' && com.maxHit > 1) addEffectValue(out, seen, '命中次数上限', `${com.maxHit}次`, 'mechanic', com);
    if (typeof com.hitInteval === 'number' && com.hitInteval > 0) addEffectValue(out, seen, '命中间隔', `${com.hitInteval}秒`, 'mechanic', com);
  }
}

function skillLevelRowId(skill, level) {
  if (!skill || typeof skill.id !== 'number' || !Number.isInteger(level)) return null;
  if (typeof skill.skillLevelId === 'number' && skill.skillLevelId > 0) return skill.skillLevelId + level - 1;
  return skill.id * 1000 + level;
}

function skillActionMatchesSummonAction(skill, action) {
  if (!action?.actionName) return true;
  if (!skill?.entityAction) return false;
  return actionNameVariants(skill.entityAction).includes(action.actionName);
}

function skillDisplayName(skill) {
  return normalizeEffectLabelName(skill.desName || skill.Name || `技能${skill.id}`);
}

function addSkillLevelDamageEffectValues(out, seen, ctx, skill, warnings, owner) {
  if (!ctx?.skillLevelById || !Number.isInteger(ctx.danyuanLevel)) return;
  const levelId = skillLevelRowId(skill, ctx.danyuanLevel);
  if (levelId == null) return;

  const baseLevelId = skillLevelRowId(skill, 1);
  if (baseLevelId == null || !ctx.skillLevelById.has(baseLevelId)) return;

  const row = ctx.skillLevelById.get(levelId);
  if (!row) {
    pushWarning(warnings, 'DANYUAN_MISSING_SKILL_LEVEL', `${owner} 引用技能 ${skill.id} Lv.${ctx.danyuanLevel} 的 skillLevel ${levelId} 不存在`);
    return;
  }

  const hasDamagePer = typeof row.damageAddPer === 'number' && row.damageAddPer !== 0;
  const hasDamageVal = typeof row.damageAddVal === 'number' && row.damageAddVal !== 0;
  if (!hasDamagePer && !hasDamageVal) return;

  const value = formatStatParts(row.damageAddPer, row.damageAddVal, null);
  if (value) addEffectValue(out, seen, `${skillDisplayName(skill)} · 单段伤害`, value, 'skillLevel', row);
}

function addSummonSkillLevelEffectValues(out, seen, raw, ctx, warnings, owner) {
  if (!DANYUAN_SUMMON_SKILL_LEVEL_FAMILIES.has(ctx?.familyId)) return;
  const skillIds = uniqueNumbers([
    ...asArray(raw?.skillIds),
    ...asArray(raw?.vskillIds),
    ...asArray(raw?.mIdVskills)
  ].flat(Infinity));
  for (const skillId of skillIds) {
    const skill = ctx.skillById.get(skillId);
    if (!skill) {
      pushWarning(warnings, 'DANYUAN_MISSING_SKILL', `${owner} 引用技能 ${skillId} 不存在`);
      continue;
    }
    if (!skillActionMatchesSummonAction(skill, raw?.action)) continue;
    addSkillLevelDamageEffectValues(out, seen, ctx, skill, warnings, owner);
  }
}

function addStructuredMechanicEffectValues(out, seen, effect) {
  const raw = effect.raw;
  if (!raw || typeof raw !== 'object') return;
  switch (effect.label) {
    case '触发率':
      if (typeof raw.rate === 'number') addEffectValue(out, seen, '触发率', rateText(raw.rate), 'mechanic', raw);
      break;
    case '冷却':
      addCooldownEffectValues(out, seen, raw);
      break;
    case '受伤累计':
      if (typeof raw.unitPer === 'number') addEffectValue(out, seen, '受伤触发阈值', `${percentText(raw.unitPer)}最大生命`, 'mechanic', raw);
      break;
    case '血量权重':
      if (typeof raw.hpPer === 'number' && Array.isArray(raw.weight)) addEffectValue(out, seen, `血量高于${percentText(raw.hpPer)}权重`, raw.weight.join('/'), 'mechanic', raw);
      break;
    case '缠绕上限':
      addEffectValue(out, seen, '缠绕上限', `${percentText(raw.maxValRate)}最大生命 + ${raw.maxValFixAdd}`, 'mechanic', raw);
      break;
    case '对护盾扣减':
      addEffectValue(out, seen, '对护盾扣减', `${percentText(raw.maxHpPer)}最大生命 + ${raw.val}`, 'mechanic', raw);
      break;
    case '缠绕解除':
      if (typeof raw.rate === 'number') addEffectValue(out, seen, '技能释放扣减缠绕', percentText(raw.rate), 'mechanic', raw);
      if (typeof raw.hitRate === 'number') addEffectValue(out, seen, '攻击命中扣减缠绕', percentText(raw.hitRate), 'mechanic', raw);
      break;
    case '无双值转层数':
      if (typeof raw.unit === 'number') addEffectValue(out, seen, '每层所需无双值', signedValueText(raw.unit, 4), 'mechanic', raw);
      break;
    case '未命中返还冷却':
      if (typeof raw.subPer === 'number') addEffectValue(out, seen, '未命中返还冷却', percentText(raw.subPer), 'mechanic', raw);
      break;
    case '低血阈值':
      if (typeof raw.hpPer === 'number') addEffectValue(out, seen, '生命触发阈值', percentText(raw.hpPer), 'mechanic', raw);
      break;
    case '移动距离':
      if (typeof raw.distance === 'number') addEffectValue(out, seen, '移动触发距离', signedValueText(raw.distance), 'mechanic', raw);
      break;
    case '友方死亡累计':
      if (typeof raw.maxVal === 'number') addEffectValue(out, seen, '狂暴值上限', signedValueText(raw.maxVal), 'mechanic', raw);
      if (typeof raw.unitMaxVal === 'number') addEffectValue(out, seen, '单位狂暴值上限', signedValueText(raw.unitMaxVal), 'mechanic', raw);
      if (typeof raw.rate === 'number') addEffectValue(out, seen, '狂暴倍率', signedValueText(raw.rate), 'mechanic', raw);
      break;
    case '咬住吸取':
      if (typeof raw.subMpVal === 'number') addEffectValue(out, seen, '每次吸魔', signedValueText(raw.subMpVal), 'mechanic', raw);
      if (typeof raw.subHpRate === 'number') addEffectValue(out, seen, '生命补给倍率', signedValueText(raw.subHpRate), 'mechanic', raw);
      break;
    case '分身迷惑':
      if (typeof raw.time === 'number') addEffectValue(out, seen, '分身存在时间', `${raw.time}秒`, 'mechanic', raw);
      break;
    case '火球蓄能':
      if (typeof raw.maxVal === 'number') addEffectValue(out, seen, '火球膨胀上限', signedValueText(raw.maxVal), 'mechanic', raw);
      if (typeof raw.unitAddVal === 'number') addEffectValue(out, seen, '每次自然膨胀', signedValueText(raw.unitAddVal), 'mechanic', raw);
      if (typeof raw.hurtAddVal === 'number') addEffectValue(out, seen, '受击加速膨胀', signedValueText(raw.hurtAddVal), 'mechanic', raw);
      if (typeof raw.hurtChargedCd === 'number') addEffectValue(out, seen, '受击加速间隔', framesText(raw.hurtChargedCd), 'mechanic', raw);
      if (typeof raw.hurtChargedNum === 'number') addEffectValue(out, seen, '受击加速次数', `${raw.hurtChargedNum}次`, 'mechanic', raw);
      break;
    default:
      break;
  }
}

function addMechanicEffectValues(out, seen, effect, ctx, warnings, owner, depth = 0) {
  if (effect.key && effect.raw) {
    addBuffEffectValues(out, seen, effect.raw, ctx);
    return;
  }

  addStructuredMechanicEffectValues(out, seen, effect);
  addActionMetricEffectValues(out, seen, effect.raw?.action);
  addSummonSkillLevelEffectValues(out, seen, effect.raw, ctx, warnings, `${owner} ${effect.label}`);
  collectEffectRawReferences(out, seen, ctx, effect.raw, warnings, depth);
}

function addEffectValue(out, seen, label, value, source, raw = null) {
  if (!label || value == null || value === '') return;
  const key = `${label}\u0000${value}\u0000${source}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ label, value, source, raw });
}

function parseDanyuanSkillDescValues(skillDesc) {
  const text = String(skillDesc || '').replace(/\s+/g, ' ').trim();
  const values = [];
  const seen = new Set();
  const add = (label, value, raw) => addEffectValue(values, seen, label, value, 'skillDesc', raw);
  const eachMatch = (regexp, handler) => {
    for (const match of text.matchAll(regexp)) handler(match);
  };

  eachMatch(/每秒造成(\d+(?:\.\d+)?)伤害/g, (m) => add('每秒伤害', m[1], m[0]));
  eachMatch(/恢复(\d+(?:\.\d+)?)生命值?/g, (m) => add('生命回复', m[1], m[0]));
  eachMatch(/提升(\d+(?:\.\d+)?)防御/g, (m) => add('防御提升', m[1], m[0]));
  eachMatch(/伤害提升(\d+(?:\.\d+)?)/g, (m) => add('伤害提升', m[1], m[0]));
  eachMatch(/增加(\d+(?:\.\d+)?)减伤/g, (m) => add('减伤', m[1], m[0]));
  eachMatch(/提升(\d+(?:\.\d+)?)回血/g, (m) => add('回血提升', m[1], m[0]));
  eachMatch(/提升(\d+(?:\.\d+)?)回魔/g, (m) => add('回魔提升', m[1], m[0]));
  eachMatch(/持续(\d+(?:\.\d+)?)秒/g, (m) => add('持续时间', `${m[1]}秒`, m[0]));
  eachMatch(/无敌(\d+(?:\.\d+)?)秒/g, (m) => add('无敌时间', `${m[1]}秒`, m[0]));
  eachMatch(/每损失(\d+(?:\.\d+)?)%生命/g, (m) => add('生命损失档位', `${m[1]}%`, m[0]));
  eachMatch(/每损失(\d+(?:\.\d+)?)%魔法/g, (m) => add('魔法损失档位', `${m[1]}%`, m[0]));
  eachMatch(/生命降低至(\d+(?:\.\d+)?)%以下/g, (m) => add('生命阈值', `${m[1]}%`, m[0]));
  eachMatch(/随机(\d+)个队友/g, (m) => add('队友数量', `${m[1]}个`, m[0]));
  eachMatch(/(\d+(?:\.\d+)?)秒最多触发(\d+)次/g, (m) => {
    add('触发周期', `${m[1]}秒`, m[0]);
    add('次数上限', `${m[2]}次`, m[0]);
  });

  return values;
}

function collectDanyuanMechanicValues(mechanics, ctx, warnings, owner) {
  const values = [];
  const seen = new Set();
  for (const mechanic of mechanics || []) {
    if (mechanic.label === 'effect') continue;
    for (const effect of mechanic.effects || []) {
      addMechanicEffectValues(values, seen, effect, ctx, warnings, `${owner} beskill ${mechanic.id}`);
    }
  }
  return values;
}

function buildDanyuanEffectValues(skillDesc, mechanics, ctx, warnings, owner) {
  const values = [];
  const seen = new Set();
  for (const value of parseDanyuanSkillDescValues(skillDesc)) {
    addEffectValue(values, seen, value.label, value.value, value.source, value.raw ?? null);
  }
  for (const value of collectDanyuanMechanicValues(mechanics, ctx, warnings, owner)) {
    addEffectValue(values, seen, value.label, value.value, value.source, value.raw ?? null);
  }
  return values;
}

function effectValueGroupKey(value) {
  return `${value.source || 'unknown'}\u0000${value.label}`;
}

function effectValueSignature(values) {
  return JSON.stringify([...new Set(values.map((item) => String(item.value)))].sort());
}

function collectPayloadEffectGroups(payload) {
  const grouped = new Map();
  for (const value of payload?._effectValueCandidates || []) {
    const key = effectValueGroupKey(value);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(value);
  }
  return grouped;
}

function computeFamilyEffectKeyClasses(levels) {
  const signaturesByKey = new Map();
  const signaturesByKeyAndQuality = new Map();
  for (const level of levels) {
    for (const [quality, payload] of Object.entries(level.qualities)) {
      if (!payload) continue;
      const grouped = collectPayloadEffectGroups(payload);

      for (const [key, values] of grouped.entries()) {
        const signature = effectValueSignature(values);
        if (!signaturesByKey.has(key)) signaturesByKey.set(key, new Set());
        signaturesByKey.get(key).add(signature);

        if (!signaturesByKeyAndQuality.has(key)) signaturesByKeyAndQuality.set(key, new Map());
        const byQuality = signaturesByKeyAndQuality.get(key);
        if (!byQuality.has(quality)) byQuality.set(quality, new Set());
        byQuality.get(quality).add(signature);
      }
    }
  }

  const levelGrowthKeys = new Set();
  const qualityOnlyKeys = new Set();
  for (const [key, signatures] of signaturesByKey.entries()) {
    if (signatures.size <= 1) continue;
    const byQuality = signaturesByKeyAndQuality.get(key) || new Map();
    const hasLevelGrowth = [...byQuality.values()].some((qualitySignatures) => qualitySignatures.size > 1);
    if (hasLevelGrowth) levelGrowthKeys.add(key);
    else qualityOnlyKeys.add(key);
  }

  return { levelGrowthKeys, qualityOnlyKeys };
}

function applyFamilyGrowthEffectValues(levels, familyId) {
  const { levelGrowthKeys, qualityOnlyKeys } = computeFamilyEffectKeyClasses(levels);
  const dropKeys = new Set(DANYUAN_GROWTH_DISPLAY_RULES[familyId]?.drop || []);
  return levels.map((level) => ({
    ...level,
    qualities: Object.fromEntries(Object.entries(level.qualities).map(([quality, payload]) => {
      if (!payload) return [quality, payload];
      const { _effectValueCandidates, ...publicPayload } = payload;
      publicPayload.effectValues = (_effectValueCandidates || [])
        .filter((value) => levelGrowthKeys.has(effectValueGroupKey(value)) && !dropKeys.has(effectValueGroupKey(value)));
      publicPayload.qualityEffectValues = (_effectValueCandidates || [])
        .filter((value) => qualityOnlyKeys.has(effectValueGroupKey(value)) && !dropKeys.has(effectValueGroupKey(value)));
      return [quality, publicPayload];
    }))
  }));
}

function readEntityCfg(cfgFile, warnings, owner) {
  if (!cfgFile) return null;
  const fp = path.join(ENTITY_CTG_DIR, `${cfgFile}.json`);
  if (!fs.existsSync(fp)) {
    pushWarning(warnings, 'DANYUAN_MISSING_ENTITY_CFG', `${owner} 找不到动作配置 ${cfgFile}.json`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (e) {
    pushWarning(warnings, 'DANYUAN_BAD_ENTITY_CFG', `${owner} 动作配置 ${cfgFile}.json 解析失败: ${e.message}`);
    return null;
  }
}

function summarizeActionCfg(cfg, actionName) {
  const action = cfg?.[actionName];
  if (!action) return null;
  const coms = Array.isArray(action.com) ? action.com : [];
  const bullets = coms.filter((com) => com.type === 2 && typeof com.bId === 'number').map((com) => com.bId);
  const buffComponents = coms
    .filter((com) => Array.isArray(com.buff) && com.buff.length > 0)
    .map((com) => ({
      type: com.type,
      timeFrame: typeof com.t === 'number' ? com.t : null,
      buffs: uniqueNumbers(com.buff)
    }));
  const areas = coms
    .filter((com) => com.type === 18 || com.type === 31)
    .map((com) => ({
      type: com.type,
      x: com.x ?? null,
      y: com.y ?? null,
      width: com.w ?? com.width ?? null,
      height: com.h ?? com.height ?? null,
      timeFrames: typeof com.time === 'number' ? com.time : null,
      timeSeconds: typeof com.time === 'number' ? framesToSeconds(com.time) : null,
      spd: typeof com.spd === 'number' ? com.spd : null,
      attractSize: Array.isArray(com.attractSize) ? com.attractSize : null,
      buffs: Array.isArray(com.buff) ? com.buff : []
    }));
  const flySpeeds = uniqueNumbers(coms.flatMap((com) => (
    Array.isArray(com.flyList) ? com.flyList.map((item) => item?.spd) : []
  )));
  return { actionName, bullets, buffComponents, areas, flySpeeds };
}

function actionNameVariants(name) {
  if (typeof name !== 'string' || name.trim() === '') return [];
  const value = name.trim();
  const variants = [value];
  const match = value.match(/^(v?skill)_?(\d+)$/);
  if (match) {
    variants.push(`${match[1]}_${match[2]}`);
    variants.push(`${match[1]}${match[2]}`);
  }
  return [...new Set(variants)];
}

function actionNameCandidates(attr, ctx, cfg) {
  const explicitCandidates = [];
  const fallbackCandidates = [];
  const addExplicit = (item) => actionNameVariants(item).forEach((name) => explicitCandidates.push(name));
  const addFallback = (item) => actionNameVariants(item).forEach((name) => fallbackCandidates.push(name));
  const skillIds = [
    ...asArray(attr.vskillIds),
    ...asArray(attr.mIdVskills)
  ].filter((id) => typeof id === 'number');

  for (const id of skillIds) {
    const skill = ctx.skillById.get(id);
    if (skill?.entityAction) addExplicit(skill.entityAction);
  }

  if (Array.isArray(cfg?.virtualActions) && cfg.virtualActions.length === 1) {
    addFallback(cfg.virtualActions[0]);
  }

  if (typeof attr.releaseSkillIdx === 'number') {
    addFallback(`vskill_${attr.releaseSkillIdx}`);
    addFallback(`vskill${attr.releaseSkillIdx}`);
  }

  if (typeof attr.skillIdx === 'number') {
    addFallback(`skill_${attr.skillIdx}`);
    addFallback(`skill${attr.skillIdx}`);
    addFallback(`vskill_${attr.skillIdx}`);
    addFallback(`vskill${attr.skillIdx}`);
  }

  return [...new Set([...explicitCandidates, ...fallbackCandidates])];
}

function summonInfo(be, ctx, warnings) {
  const attr = be.attribute && typeof be.attribute === 'object' && !Array.isArray(be.attribute) ? be.attribute : {};
  const mId = attr.mId;
  const monster = ctx.monsterById.get(mId);
  if (!monster) {
    pushWarning(warnings, 'DANYUAN_MISSING_MONSTER', `beskill ${be.id} 引用 monster ${mId} 不存在`);
    return { monsterId: mId ?? null, monsterName: null, cfgFile: null, action: null };
  }
  const cfgFile = monster.cfgFile || null;
  const cfg = readEntityCfg(cfgFile, warnings, `monster ${mId}`);
  const candidates = actionNameCandidates(attr, ctx, cfg);
  const actionName = candidates.find((name) => cfg?.[name]) || candidates[0] || null;
  const action = summarizeActionCfg(cfg, actionName);
  if (cfg && actionName && !action) pushWarning(warnings, 'DANYUAN_MISSING_SUMMON_ACTION', `${monster.name} 缺少动作 ${actionName}`);
  return {
    monsterId: mId,
    monsterName: monster.name || null,
    cfgFile,
    actionCandidates: candidates,
    action,
    durationSeconds: typeof attr.time === 'number' ? attr.time : null,
    maxCount: attr.max ?? null,
    beskillIds: uniqueNumbers(asArray(attr.beskillIds).flat(Infinity)),
    skillIds: Array.isArray(monster.skillIds) ? monster.skillIds : [],
    vskillIds: Array.isArray(attr.vskillIds) ? attr.vskillIds : Array.isArray(attr.mIdVskills) ? attr.mIdVskills : []
  };
}

function directBuffIdsForLabel(be) {
  const attr = be.attribute;
  switch (be.label) {
    case 'dis_hp':
      return Array.isArray(attr) ? uniqueNumbers(asArray(attr[1]).flat(Infinity)) : [];
    case 'supply_buff':
    case 'revive_buff':
    case 'appearBuff1':
    case 'buff':
      return Array.isArray(attr) ? uniqueNumbers(attr.flat(Infinity)) : [];
    case 'blockHit':
      return Array.isArray(attr) ? uniqueNumbers(asArray(attr[0]).flat(Infinity)) : [];
    case 'random_friend_buff':
    case '1hpFather':
    case 'lowhp_deal':
      return uniqueNumbers(asArray(attr?.buffs).flat(Infinity));
    case 'atkAddBuff':
      return uniqueNumbers(asArray(attr?.buff).flat(Infinity));
    case 'lsnPropAddMaxProp':
    case 'whiteFaceDanYuan':
      return uniqueNumbers(asArray(attr?.buffIds).flat(Infinity));
    case 'imitateEntity':
      return uniqueNumbers(asArray(attr?.selfBuffs).flat(Infinity));
    case 'buff2':
      return uniqueNumbers([
        ...asArray(attr?.addBuffs),
        ...asArray(attr?.buffIds)
      ].flat(Infinity));
    case 'targetSkillSubValueFlag':
      return uniqueNumbers([attr?.atkBuffId, attr?.hitBuffId, attr?.critBuffId]);
    case 'subHpAddBuffs': {
      const tiers = Array.isArray(attr?.weightAddBuffsWithHp) ? attr.weightAddBuffsWithHp : [];
      return uniqueNumbers(tiers.flatMap((tier) => tier.buffs || []).flat(Infinity));
    }
    default:
      return [];
  }
}

function describeBuffList(ids, ctx, warnings, owner) {
  return ids.map((id) => getBuff(ctx, id, warnings, owner)).filter(Boolean).map((buff) => ({
    key: `buff-${buff.id}`,
    label: buff.name || `Buff ${buff.id}`,
    value: buffEffectText(buff),
    raw: summarizeBuff(buff)
  }));
}

function describeDanyuanBeskill(be, ctx, warnings, depth = 0) {
  const effects = [];
  const add = (label, value, raw = null) => effects.push({ label, value, raw });
  const trigger = rateText(be.rate);
  const cooldown = cooldownText(be);
  if (trigger) add('触发率', trigger, { rate: be.rate });
  if (cooldown) add('冷却', cooldown, { initCd: be.initCd, cd: be.cd, chargedInitCd: be.chargedInitCd, chargedCd: be.chargedCd, chargedNumber: be.chargedNumber });

  switch (be.label) {
    case null: {
      const attr = be.attribute || {};
      if (typeof attr.maxVal === 'number' || typeof attr.unitAddVal === 'number' || typeof attr.hurtAddVal === 'number') {
        add('火球蓄能', `上限 ${attr.maxVal ?? '?'}，自然膨胀 ${attr.unitAddVal ?? '?'}，受击膨胀 ${attr.hurtAddVal ?? '?'}`, attr);
        break;
      }
      pushWarning(warnings, 'DANYUAN_UNHANDLED_LABEL', `beskill ${be.id} 未解析 label=null`);
      break;
    }
    case 'effect':
      if (be.text) add('机制说明', be.text);
      break;
    case 'atkSummonMonster':
    case 'atkSummonMonster2':
    case 'hurtReleaseOtherVskill':
    case 'makeupReleaseOtherVskill': {
      const info = summonInfo(be, ctx, warnings);
      const source = be.label === 'hurtReleaseOtherVskill' ? '受击触发' : be.label === 'makeupReleaseOtherVskill' ? '无双触发' : '攻击触发';
      add(source, info.monsterName ? `召唤【${info.monsterName}】${info.durationSeconds ? `，存在${info.durationSeconds}秒` : ''}` : '召唤物缺失', info);
      if (info.action?.areas?.length) add('动作组件', `包含${info.action.areas.length}个范围/牵引组件`, info.action);
      break;
    }
    case 'rangeHaveEnemyDeal': {
      const info = summonInfo(be, ctx, warnings);
      const attr = be.attribute || {};
      add('触发范围', `范围 ${attr.width ?? '?'} × ${attr.height ?? '?'}，偏移(${attr.x ?? 0}, ${attr.y ?? 0})`, attr);
      add('范围内有敌人', info.monsterName ? `召唤【${info.monsterName}】释放追击/场地效果` : '召唤物缺失', info);
      break;
    }
    case 'callMonsterReleaseSkill': {
      const info = summonInfo(be, ctx, warnings);
      add('召唤释放', info.monsterName ? `召唤【${info.monsterName}】释放虚拟技能${info.vskillIds.length ? ` ${info.vskillIds.join('、')}` : ''}` : '召唤物缺失', info);
      break;
    }
    case 'dis_hp': {
      const distance = Array.isArray(be.attribute) ? be.attribute[0] : null;
      add('移动距离', distance != null ? `每移动 ${distance} 距离触发一次` : '移动距离缺失', { distance });
      effects.push(...describeBuffList(directBuffIdsForLabel(be), ctx, warnings, `beskill ${be.id}`));
      break;
    }
    case 'supply_buff':
      add('补给触发', '拾取补给品时添加效果');
      effects.push(...describeBuffList(directBuffIdsForLabel(be), ctx, warnings, `beskill ${be.id}`));
      break;
    case 'revive_buff':
      add('复活触发', '使用还魂丹复活后添加效果');
      effects.push(...describeBuffList(directBuffIdsForLabel(be), ctx, warnings, `beskill ${be.id}`));
      break;
    case 'blockHit':
      add('受击触发', '受到伤害时添加防护效果');
      effects.push(...describeBuffList(directBuffIdsForLabel(be), ctx, warnings, `beskill ${be.id}`));
      break;
    case 'hp_healHp': {
      const [step, _unused, value] = Array.isArray(be.attribute) ? be.attribute : [];
      add('生命损失档位', `每损失${step}%生命，回血提升 ${value}`, be.attribute);
      break;
    }
    case 'mp_healMp': {
      const [step, _unused, value] = Array.isArray(be.attribute) ? be.attribute : [];
      add('魔法损失档位', `每损失${step}%魔法，回魔提升 ${value}`, be.attribute);
      break;
    }
    case 'random_friend_buff':
      add('队友辅助', '随机给 1 个队友添加一次性触发效果');
      effects.push(...describeBuffList(directBuffIdsForLabel(be), ctx, warnings, `beskill ${be.id}`));
      break;
    case '1hpFather': {
      const attr = be.attribute || {};
      add('致命保护', `受到致命伤害时保留 ${attr.addHpVal ?? 1} 点生命`, attr);
      effects.push(...describeBuffList(directBuffIdsForLabel(be), ctx, warnings, `beskill ${be.id}`));
      break;
    }
    case 'appearBuff1':
      add('常驻效果', '登场后立即添加');
      effects.push(...describeBuffList(directBuffIdsForLabel(be), ctx, warnings, `beskill ${be.id}`));
      break;
    case 'buff':
    case 'buff2':
      add('添加效果', be.label === 'buff2' ? '给自身或来源目标添加效果' : '添加 buff 效果');
      effects.push(...describeBuffList(directBuffIdsForLabel(be), ctx, warnings, `beskill ${be.id}`));
      break;
    case 'lowhp_deal': {
      const attr = be.attribute || {};
      add('低血阈值', `生命低于${percentText(attr.hpPer)}时触发`, attr);
      effects.push(...describeBuffList(directBuffIdsForLabel(be), ctx, warnings, `beskill ${be.id}`));
      break;
    }
    case 'atkAddBuff':
      add('攻击附加', '攻击命中后给目标添加异常效果');
      effects.push(...describeBuffList(directBuffIdsForLabel(be), ctx, warnings, `beskill ${be.id}`));
      break;
    case 'bulletNoHitBackBeskillCd': {
      const attr = be.attribute || {};
      add('未命中返还冷却', `子弹 ${attr.bulletId ?? '?'} 未命中时返还 ${percentText(attr.subPer)} 冷却`, attr);
      break;
    }
    case 'twine': {
      const attr = be.attribute || {};
      add('缠绕上限', `上限为目标生命 ${percentText(attr.maxValRate)} + ${attr.maxValFixAdd ?? 0}`, attr);
      break;
    }
    case 'hitSubShield': {
      const attr = be.attribute || {};
      add('对护盾扣减', `命中护盾时按生命 ${percentText(attr.maxHpPer)} + ${attr.val ?? 0} 计算`, attr);
      break;
    }
    case 'targetSkillSubValueFlag': {
      const attr = be.attribute || {};
      add('缠绕解除', `技能释放扣减 ${percentText(attr.rate)}，攻击命中扣减 ${percentText(attr.hitRate)}`, attr);
      effects.push(...describeBuffList([attr.atkBuffId, attr.hitBuffId, attr.critBuffId], ctx, warnings, `beskill ${be.id}`));
      break;
    }
    case 'lsnPropAddMaxProp': {
      const attr = be.attribute || {};
      add('无双值转层数', `按 ${attr.propName || '属性'} 积累，每 ${attr.unit ?? '?'} 转换一层`, attr);
      effects.push(...describeBuffList(directBuffIdsForLabel(be), ctx, warnings, `beskill ${be.id}`));
      break;
    }
    case 'addBeskill': {
      const ids = asArray(be.attribute?.beskillIds);
      add('追加被动', `触发后追加 ${ids.length} 个被动效果`, ids);
      if (depth < 2) {
        for (const id of ids) {
          const child = getBeskill(ctx, id, warnings, `beskill ${be.id}`);
          if (child) {
            const childSummary = describeDanyuanBeskill(child, ctx, warnings, depth + 1);
            effects.push(...childSummary.effects.map((effect) => ({ ...effect, label: `${child.name || child.id} · ${effect.label}` })));
          }
        }
      }
      break;
    }
    case 'subHpAddBuffs': {
      const attr = be.attribute || {};
      add('受伤累计', `累计受到最大生命 ${percentText(attr.unitPer)} 的伤害后触发`, attr);
      const tiers = Array.isArray(attr.weightAddBuffsWithHp) ? attr.weightAddBuffsWithHp : [];
      for (const tier of tiers) {
        const weights = Array.isArray(tier.weight) ? tier.weight.join('/') : '?';
        add('血量权重', `生命高于${percentText(tier.hpPer)}时，红/绿/金权重 ${weights}`, tier);
      }
      const buffIds = uniqueNumbers(tiers.flatMap((tier) => tier.buffs || []).flat(Infinity));
      effects.push(...describeBuffList(buffIds, ctx, warnings, `beskill ${be.id}`));
      break;
    }
    case 'whiteFaceDanYuan': {
      const attr = be.attribute || {};
      add('友方死亡累计', `友方死亡积累狂暴值，上限 ${attr.maxVal ?? '?'}，单位上限 ${attr.unitMaxVal ?? '?'}，倍率 ${attr.rate ?? '?'}`, attr);
      effects.push(...describeBuffList(directBuffIdsForLabel(be), ctx, warnings, `beskill ${be.id}`));
      break;
    }
    case 'imitateEntity': {
      const attr = be.attribute || {};
      add('分身迷惑', `保护分满时生成分身，本体获得自保效果${typeof attr.time === 'number' ? `，分身存在${attr.time}秒` : ''}`, attr);
      effects.push(...describeBuffList(directBuffIdsForLabel(be), ctx, warnings, `beskill ${be.id}`));
      break;
    }
    case 'yaoZhuSubHp': {
      const attr = be.attribute || {};
      add('咬住吸取', `每次吸取 ${attr.subMpVal ?? '?'} 魔法，生命补给倍率 ${attr.subHpRate ?? '?'}`, attr);
      break;
    }
    default:
      pushWarning(warnings, 'DANYUAN_UNHANDLED_LABEL', `beskill ${be.id} 未解析 label=${be.label}`);
      break;
  }

  return { effects };
}

function normalizeDanyuanName(name) {
  return String(name || '').replace(/^\d+级/, '').trim();
}

function normalizeLimit(limit) {
  if (Array.isArray(limit)) {
    const [innerType, value] = limit;
    return {
      innerType: typeof innerType === 'string' ? innerType : null,
      innerTypeName: DANYUAN_INNER_TYPE_NAMES[innerType] || innerType || null,
      value: typeof value === 'number' ? value : null,
      raw: limit,
      invalid: false
    };
  }
  if (limit == null) return null;
  return {
    innerType: null,
    innerTypeName: null,
    value: null,
    raw: limit,
    invalid: true
  };
}

function isDanyuanPlaceholderLevel(row) {
  return row.level > 20
    && row.isClose === 1
    && row.levelUpNeed == null
    && row.provideExp == null
    && row.decompose == null
    && row.nextQualityID == null;
}

function collectNumericIds(value, out = new Set()) {
  if (typeof value === 'number' && Number.isInteger(value)) {
    out.add(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectNumericIds(item, out));
    return out;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectNumericIds(item, out));
  }
  return out;
}

function summarizeBuff(buff) {
  return {
    id: buff.id,
    name: buff.name,
    text: buff.text,
    type: buff.type,
    timeFrames: buff.time ?? null,
    timeSeconds: framesToSeconds(buff.time),
    timeText: framesText(buff.time),
    intervalFrames: buff.interval ?? null,
    intervalSeconds: framesToSeconds(buff.interval),
    intervalText: framesText(buff.interval),
    value: buff.value ?? null,
    attribute: buff.attribute ?? null,
    maxPiles: buff.maxPiles ?? null,
    attachBuff: Array.isArray(buff.attachBuff) ? buff.attachBuff : null
  };
}

function buildBuffSequenceById(buffRows) {
  const byName = new Map();
  for (const buff of buffRows) {
    if (!buff?.name || typeof buff.id !== 'number') continue;
    const sequenceName = normalizeEffectLabelName(buff.name);
    if (!byName.has(sequenceName)) byName.set(sequenceName, []);
    byName.get(sequenceName).push(buff);
  }

  const sequenceById = new Map();
  for (const rows of byName.values()) {
    const sorted = rows.sort((a, b) => a.id - b.id);
    let cluster = [];
    const flush = () => {
      if (!cluster.length) return;
      const ids = cluster.map((buff) => buff.id);
      cluster.forEach((buff, index) => sequenceById.set(buff.id, { ids, index }));
    };

    for (const buff of sorted) {
      if (cluster.length && buff.id !== cluster[cluster.length - 1].id + 1) {
        flush();
        cluster = [];
      }
      cluster.push(buff);
    }
    flush();
  }

  return sequenceById;
}

function summarizeBeskill(be, ctx, warnings, owner) {
  const relatedBuffIds = directBuffIdsForLabel(be);
  const parsed = describeDanyuanBeskill(be, ctx, warnings);

  return {
    id: be.id,
    name: be.name,
    label: be.label,
    rate: be.rate ?? null,
    initCdFrames: be.initCd ?? null,
    initCdSeconds: framesToSeconds(be.initCd),
    cdFrames: be.cd ?? null,
    cdSeconds: framesToSeconds(be.cd),
    chargedInitCdFrames: be.chargedInitCd ?? null,
    chargedInitCdSeconds: framesToSeconds(be.chargedInitCd),
    chargedCdFrames: be.chargedCd ?? null,
    chargedCdSeconds: framesToSeconds(be.chargedCd),
    chargedNumber: be.chargedNumber ?? null,
    text: be.text ?? null,
    desc: be.desc ?? null,
    attribute: be.attribute ?? null,
    effects: parsed.effects,
    relatedBuffs: relatedBuffIds
      .map((id) => getBuff(ctx, id, warnings, `${owner} beskill ${be.id}`))
      .filter(Boolean)
      .map((buff) => summarizeBuff(buff))
  };
}

function loadBulletById() {
  if (!fs.existsSync(BULLETS_PATH)) {
    throw new Error(`丹元效果需要 battle-config bullets 数据，但文件缺失: ${BULLETS_PATH}`);
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(BULLETS_PATH, 'utf8'));
  } catch (e) {
    throw new Error(`丹元效果 bullets 数据解析失败: ${e.message}`);
  }
  const rows = (Array.isArray(raw) ? raw : Object.values(raw)).filter(Boolean);
  return new Map(rows.map((row) => {
    if (typeof row.id !== 'number') throw new Error(`丹元效果 bullets 数据存在缺失 id 的项: ${JSON.stringify(row).slice(0, 120)}`);
    return [row.id, row];
  }));
}

module.exports = {
  applyFamilyGrowthEffectValues,
  buildBuffSequenceById,
  buildDanyuanEffectValues,
  framesToSeconds,
  isDanyuanPlaceholderLevel,
  loadBulletById,
  normalizeDanyuanName,
  normalizeLimit,
  summarizeBeskill
};
