/**
 * 角色 → 法宝系统
 * 提取叶子: 升级, 器魂, 强运洗练, 法宝效果
 */
const fs = require('fs');
const path = require('path');
const u = require('../lib/utils');

const FRAME_RATE = 30;
const ACTIVE_NO_GROWTH_TEXT = '当前配置没有随法宝等级成长的主动技能数值。';
const SOUL_NO_GROWTH_TEXT = '当前配置没有可展示的器魂被动成长项。';
const PLAGUE_ACTIVE_BASE_BUFF_ID = 178000401;
const PLAGUE_SOUL_BASE_BUFF_ID = 178000801;
const LINGAO_SHIELD_MONSTER_BASE_ID = 2031911;

function fail(message) {
  throw new Error(`[role_magic_effect] ${message}`);
}

function trimNumber(value, digits = 4) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`非法数值: ${value}`);
  const fixed = Number(value.toFixed(digits));
  return String(fixed).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function pct(value, digits = 2) {
  return `${trimNumber(value * 100, digits)}%`;
}

function signedPct(value, digits = 2) {
  return `${value < 0 ? '-' : ''}${pct(Math.abs(value), digits)}`;
}

function explicitSignedPct(value, digits = 2) {
  return `${value >= 0 ? '+' : '-'}${pct(Math.abs(value), digits)}`;
}

function secondsFromFrames(frames) {
  return `${trimNumber(frames / FRAME_RATE, 3)}秒`;
}

function formatSeconds(seconds) {
  return `${trimNumber(seconds, 3)}秒`;
}

function cooldownText(baseCd) {
  return `冷却时间 ${formatSeconds(baseCd)}；带木属性时冷却为 ${formatSeconds(baseCd * 2 / 3)}。`;
}

function formatDamage(per, val) {
  const parts = [];
  if (typeof per === 'number' && per !== 0) parts.push(`${pct(per)}攻击`);
  if (typeof val === 'number' && val !== 0 && val !== 1) parts.push(String(val));
  if (!parts.length) return null;
  return parts.join(' + ');
}

function formatBuffPair(value) {
  if (!Array.isArray(value) || value.length < 2) fail(`buff 数值不是 [比例, 固定值]: ${JSON.stringify(value)}`);
  const [per, val] = value;
  const parts = [];
  if (typeof per === 'number' && per !== 0) parts.push(`${signedPct(per)}`);
  if (typeof val === 'number' && val !== 0) parts.push(`${val > 0 ? '+ ' : '- '}${Math.abs(val)}`);
  return parts.length ? parts.join(' ') : '0';
}

function formatReductionPair(value) {
  if (!Array.isArray(value) || value.length < 2) fail(`减益数值不是 [比例, 固定值]: ${JSON.stringify(value)}`);
  const [per, val] = value;
  const parts = [];
  if (typeof per === 'number' && per !== 0) parts.push(pct(Math.abs(per)));
  if (typeof val === 'number' && val !== 0) parts.push(String(Math.abs(val)));
  return parts.length ? parts.join(' + ') : '0';
}

function table(title, fields, rows, emptyText) {
  if (!rows.length) return { title, columns: [], rows: [], emptyText };
  const columns = fields.filter(field => {
    const values = rows.map(row => field.value(row));
    return new Set(values).size > 1;
  });
  if (!columns.length) return { title, columns: [], rows: [], emptyText };
  return {
    title,
    columns: columns.map(field => field.label),
    rows: rows.map(row => ({ level: row.level, values: columns.map(field => field.value(row)) })),
    emptyText
  };
}

function skillLevelRows(skillLevelRows, skillId) {
  return skillLevelRows
    .filter(row => Math.floor(row.id / 1000) === skillId)
    .sort((a, b) => a.id - b.id)
    .map(row => ({ ...row, level: row.id % 1000 }));
}

function cachedSkillLevelRows(skillId) {
  const rows = skillLevelRows(Array.from(skillLevelRowsCache.values()), skillId);
  if (!rows.length) fail(`技能 ${skillId} 缺少等级数据`);
  return rows;
}

function buffById(buffMap, id) {
  const row = buffMap.get(id);
  if (!row) fail(`缺少 buff ${id}`);
  return row;
}

function buffSeries(buffMap, baseId, count = 10) {
  return Array.from({ length: count }, (_, index) => {
    const level = index + 1;
    return { level, buff: buffById(buffMap, baseId + index) };
  });
}

function monsterById(monsterMap, id) {
  const row = monsterMap.get(id);
  if (!row) fail(`缺少 monster ${id}`);
  return row;
}

function monsterSeries(monsterMap, baseId, count = 10) {
  return Array.from({ length: count }, (_, index) => {
    const level = index + 1;
    return { level, monster: monsterById(monsterMap, baseId + index) };
  });
}

function skillDamageTable(title, rows, emptyText) {
  return table(title, [
    { label: '伤害倍率', value: row => `${pct(row.damageAddPer)}攻击` },
    { label: '固定伤害', value: row => String(row.damageAddVal) }
  ], rows.filter(row => row.damageAddVal !== 1 || row.damageAddPer !== 1), emptyText);
}

function skillDamageColumnTable(title, rows, label, emptyText) {
  return table(title, [
    { label, value: row => formatDamage(row.damageAddPer, row.damageAddVal) || '无' }
  ], rows.filter(row => row.damageAddVal !== 1 || row.damageAddPer !== 1), emptyText);
}

function buffDamagePer(buff) {
  const value = Array.isArray(buff.value?.[0]) ? buff.value[0][0] : buff.value?.[0];
  if (typeof value !== 'number') fail(`buff ${buff.id} 缺少伤害比例`);
  return Math.abs(value);
}

function buffDamageTable(title, series, emptyText) {
  return table(title, [
    { label: '每次伤害', value: row => formatDamage(buffDamagePer(row.buff), Math.abs(row.buff.value?.[0]?.[1] ?? 0)) || '无' },
    { label: '持续合计', value: row => row.buff.interval > 0 ? formatDamage(buffDamagePer(row.buff) * buffTickCount(row.buff), Math.abs(row.buff.value?.[0]?.[1] ?? 0) * buffTickCount(row.buff)) || '无' : '无' }
  ], series, emptyText);
}

function simpleBuffPairTable(title, series, label, emptyText) {
  return table(title, [
    { label, value: row => formatBuffPair(row.buff.value) }
  ], series, emptyText);
}

function shieldRatioTable(title, series, label, emptyText) {
  return table(title, [
    { label, value: row => {
      const ratio = row.buff.value?.[3];
      if (typeof ratio !== 'number') fail(`buff ${row.buff.id} 缺少护盾比例`);
      return pct(ratio, 3);
    } }
  ], series, emptyText);
}

function buffDurationSeconds(buff) {
  if (typeof buff.time !== 'number') fail(`buff ${buff.id} 缺少持续帧数`);
  return buff.time / FRAME_RATE;
}

function buffTickCount(buff) {
  if (typeof buff.time !== 'number' || typeof buff.interval !== 'number' || buff.interval <= 0) {
    fail(`buff ${buff.id} 缺少有效持续/间隔配置`);
  }
  return buff.time / buff.interval;
}

function continuousRecoveryTable(baseId, targetName, buffMap) {
  return table('主动技能成长表', [
    { label: `每秒恢复${targetName}`, value: row => pct(row.perTick, 3) },
    { label: `总恢复${targetName}`, value: row => pct(row.perTick * row.tickCount, 3) }
  ], buffSeries(buffMap, baseId).map(row => {
    const raw = Array.isArray(row.buff.value) ? row.buff.value[0]?.[3] : row.buff.value?.param?.[2];
    if (typeof raw !== 'number') fail(`buff ${row.buff.id} 缺少恢复比例`);
    return { level: row.level, perTick: raw, tickCount: buffTickCount(row.buff) };
  }), ACTIVE_NO_GROWTH_TEXT);
}

function noActiveGrowthTable() {
  return table('主动技能成长表', [], [], ACTIVE_NO_GROWTH_TEXT);
}

function backHurtRowsFromBuffSeries(series, beskillMap) {
  return series.map(row => {
    const [beskillId, level] = row.buff.value || [];
    if (!Number.isInteger(beskillId) || !Number.isInteger(level)) fail(`buff ${row.buff.id} 缺少反噬被动引用`);
    const be = beskillMap.get(beskillId);
    if (!be) fail(`缺少反噬被动 ${beskillId}`);
    const atkRate = be.attribute?.atkRate?.[level - 1];
    const backHurtRate = be.attribute?.backHurtRate;
    if (typeof atkRate !== 'number' || typeof backHurtRate !== 'number') fail(`反噬被动 ${beskillId} Lv.${level} 参数不完整`);
    return { level: row.level, atkRate, backHurtRate };
  });
}

function backHurtGrowthTable(title, rows, extraFields, emptyText) {
  return table(title, [
    { label: '反噬上限基础系数', value: row => `${trimNumber(row.atkRate, 3)}倍攻击` },
    ...extraFields
  ], rows, emptyText);
}

function plagueConfig(buffMap, baseId) {
  const buff = buffById(buffMap, baseId);
  const goodRate = buff.value?.goodRate;
  const maxHpScale = buff.value?.maxHp?.[0];
  const extraCdBuffId = buff.value?.extraCdBuff;
  if (typeof goodRate !== 'number') fail(`瘟疫 buff ${buff.id} 缺少康复概率`);
  if (typeof maxHpScale !== 'number') fail(`瘟疫 buff ${buff.id} 缺少生命上限扣除系数`);
  if (!Number.isInteger(extraCdBuffId)) fail(`瘟疫 buff ${buff.id} 缺少康复免疫 buff`);
  if (typeof buff.interval !== 'number' || buff.interval <= 0) fail(`瘟疫 buff ${buff.id} 缺少结算间隔`);
  if (typeof buff.time !== 'number' || buff.time <= 0) fail(`瘟疫 buff ${buff.id} 缺少持续时间`);
  if (typeof buff.maxPiles !== 'number' || buff.maxPiles <= 0) fail(`瘟疫 buff ${buff.id} 缺少最大叠层`);
  return { buff, goodRate, maxHpScale, recoverImmune: buffById(buffMap, extraCdBuffId) };
}

function plagueAttackScaleText(buff) {
  const maxHpScale = buff.value?.maxHp?.[0];
  if (typeof maxHpScale !== 'number') fail(`瘟疫 buff ${buff.id} 缺少生命上限扣除系数`);
  return `${pct(Math.abs(maxHpScale))}释放瘟疫者攻击`;
}

function plagueProcessText(buffMap, baseId, growthTableName) {
  const { buff, goodRate, recoverImmune } = plagueConfig(buffMap, baseId);
  const worsenRate = 1 - goodRate;
  return `瘟疫持续 ${secondsFromFrames(buff.time)}，最多叠 ${buff.maxPiles}层，每 ${secondsFromFrames(buff.interval)}结算一次；每层每次结算会按释放瘟疫者攻击造成真伤，并扣除目标生命上限，层数越高结算越重。随后 ${pct(goodRate)} 概率康复并免疫同种瘟疫 ${secondsFromFrames(recoverImmune.time)}，${pct(worsenRate)} 概率恶化并叠层。每层结算系数随等级成长，详见${growthTableName}。`;
}

const ACTIVE_GUIDES = {
  1001: {
    summary: '召唤圣莲持续为自己恢复生命。',
    tags: ['持续回血', '30秒冷却'],
    active: ['召唤圣莲后持续 10秒治疗自己，每秒恢复 1次；恢复量随法宝等级成长，详细数值见主动技能成长表。']
  },
  2001: {
    summary: '把前方怪物牵引到身前，可用于宠物捕捉。',
    tags: ['牵引', '捕捉辅助'],
    active: ['向前方牵引怪物；若目标是可捕捉宠物，可借此拉近并打开捕捉流程。']
  },
  3001: {
    summary: '短时间持续恢复魔法值。',
    tags: ['持续回魔', '30秒冷却'],
    active: ['使用后持续 4秒恢复魔法，每秒恢复 1次；恢复量随法宝等级成长，详细数值见主动技能成长表。']
  },
  4001: {
    summary: '向前射出古剑，再次按键可瞬移到古剑上飞行。',
    tags: ['位移', '光属性伤害'],
    active: ['古剑向前飞出并攻击前方敌人，命中造成受防御影响的光属性伤害；同一发剑体最多可命中 3次。古剑飞行期间的命中伤害随法宝等级成长，详细数值见主动技能成长表。古剑消失前再次按键，可以瞬移到古剑上并随古剑一起飞行。']
  },
  5001: {
    summary: '镜子自动追击敌人，连续命中后冰冻目标。',
    tags: ['自动追击', '冰冻'],
    active: ['白霜镜持续 10秒自动追击附近敌人；每次命中会造成受防御影响的伤害，并给目标叠加 1层标记。单个目标叠到 5层时会清除标记，触发一次冰爆伤害，并冰冻 3秒；冰冻期间不能移动、攻击或使用技能。追击伤害随法宝等级成长，冰爆伤害当前配置不随等级成长。']
  },
  6001: {
    summary: '发出毒针，命中后叠加持续中毒。',
    tags: ['持续毒伤', '可叠加'],
    active: ['妖伞飞起并发出多枚毒针；毒针命中会造成受防御影响的小额伤害，并附加毒伞中毒。毒伞中毒持续 10秒，每秒造成 1次木属性真伤，最多可叠加 3层。毒针命中伤害和每层毒伤都随法宝等级成长，详细数值见主动技能成长表。']
  },
  7001: {
    summary: '发射鬼爪，迫使目标在攻击或放技能时吃反噬。',
    tags: ['反噬', '持续5秒'],
    active: ['向前发射鬼爪，命中后附加 5秒鬼爪反噬；目标在反噬期间攻击或使用技能时，会受到真伤反噬。反噬会先按自身攻击、暴击、幸运和目标韧性、守护计算一个伤害上限；目标行动时按动作帧数 × 1.47%逐步结算，累计不会超过上限。表中展示的是随法宝等级成长的基础攻击系数，实际上限还会受暴击、幸运、韧性、守护影响。']
  },
  8001: {
    summary: '召唤宣花锤攻击并混乱敌人。',
    tags: ['混乱', '光属性伤害'],
    active: ['召唤宣花锤砸向敌人，命中造成受防御影响的光属性伤害；命中后使目标混乱 5秒，混乱期间方向键相反，且可能攻击友方。']
  },
  9001: {
    summary: '给自己套护盾，护盾存在时获得霸体。',
    tags: ['护盾', '霸体'],
    active: ['使用后获得最多持续 5秒的生命护盾，护盾值按自身生命上限计算并随法宝等级成长；护盾存在期间拥有普通霸体。']
  },
  10001: {
    summary: '强化当前宠物，让宠物变大并提高输出。',
    tags: ['宠物强化', '霸体'],
    active: ['强化自己的宠物 10秒：宠物获得普通霸体，体型变大，并提升造成的伤害；体型和伤害提升幅度随法宝等级成长。']
  },
  11001: {
    summary: '召唤火龙环绕自身，燃烧周围敌人并处理自身灼烧。',
    tags: ['灼烧', '免疫灼烧'],
    active: ['召唤火龙环绕自身 10秒，持续燃烧周围敌人；使用时会驱散自身灼烧，并在持续期间免疫灼烧。命中的敌人会进入灼烧，持续 15秒，每秒造成 1次火属性真伤；灼烧伤害随法宝等级成长。']
  },
  14001: {
    summary: '驱散并免疫瘟疫，攻击时给敌人附加可传播的瘟疫。',
    tags: ['瘟疫', '传播'],
    active: buffMap => [`使用后立即驱散并免疫瘟疫 10秒；持续期间攻击会给敌人附加瘟疫。${plagueProcessText(buffMap, PLAGUE_ACTIVE_BASE_BUFF_ID, '主动技能成长表')}`]
  },
  15001: {
    summary: '催眠周围敌人，并在睡眠期间降低防御。',
    tags: ['睡眠', '削防'],
    active: ['发出镇魂之音催眠周围敌人 10秒；目标在睡眠期间不能行动，闪避降低 100%，并降低防御。防御降低量按自身防御计算，但最多不超过目标防御的 50%；目标受到攻击或持续结束后会苏醒，防御在苏醒 2秒后恢复。']
  },
  16001: {
    summary: '进入隐身，前段时间更安全，后续攻击或受击会显形。',
    tags: ['隐身', '闪避提升'],
    active: ['使用后进入 5秒隐身；前 1.5秒不会因攻击或受击显形，并获得更高闪避。1.5秒后，攻击或受击会解除隐身，后段闪避提升较低；两段闪避提升都随法宝等级成长。']
  },
  17001: {
    summary: '生成可破坏盾甲，阻挡敌人和弹道。',
    tags: ['阻挡', '召唤物'],
    active: ['在身前生成一道盾甲，持续 5秒；盾甲可以阻挡敌人和弹道技能，也可以被破坏。盾甲生命上限按自身最大生命值继承，继承比例随法宝等级成长；其他属性按自身 100% 继承。']
  },
  18001: {
    summary: '向前方斩出弧形刀气，对召唤物等目标额外增伤。',
    tags: ['高倍率伤害', '额外增伤'],
    active: ['向前方斩出弧形斩击，造成受防御影响的伤害；对召唤物额外增加 150% 伤害，对宠物额外增加 200% 伤害，对坐骑和中立怪物额外增加 100% 伤害。基础斩击伤害随法宝等级成长。']
  },
  19001: {
    summary: '展开剑域，持续降低区域内敌人的移速和韧性。',
    tags: ['区域减速', '降低韧性'],
    active: ['古剑闪现到身前后扩展为剑域；剑域约持续 1秒，处于剑域内的敌人会被降低移动速度和韧性。减速幅度、按自身暴击折算的韧性降低、按敌方韧性折算的韧性降低都随法宝等级成长。']
  },
  20001: {
    summary: '射出 8颗可弹射佛珠，最后按标记层数结算额外效果。',
    tags: ['弹射', '度化控制'],
    active: ['射出 8颗佛珠，佛珠命中地形后可多次弹射；单颗佛珠存在 5秒或命中 3次后消失。佛珠命中伤害随法宝等级成长。全部佛珠消失时，会按佛珠标记层数结算额外真伤和度化控制；佛珠标记最多 24层，4/8/12/16/20/24层的额外真伤系数分别约为 2.497/4.112/5.387/6.322/6.917/7.14倍攻击，超过 8/12/16/20层时分别度化 0.5/1/1.5/2秒，度化期间不能移动、攻击或使用技能。']
  },
  21001: {
    summary: '驱散最近获得的一个负面异常，并短时间免疫同类异常。',
    tags: ['驱散', '回魔提升'],
    active: ['驱散自身最近获得的 1个负面异常，并在后续 7.5秒内免疫同类异常；同时获得约 30秒回魔属性提升，提升幅度随法宝等级成长。']
  },
  22001: {
    summary: '移动时留下火焰轨迹，叠满灼烧点后触发爆燃。',
    tags: ['火焰轨迹', '爆燃'],
    active: ['使用后 6秒内在脚底形成火焰轨迹；敌人处于轨迹中会受到火属性真伤并叠加灼烧点，灼烧点达到 8层后触发爆燃。爆燃会造成一次高额火属性真伤，并附加 9秒持续火伤；处于爆燃状态时，不能再累加来自同一玩家的灼烧点。']
  },
  23001: {
    summary: '按携带时间切换石莲阶段，获得不同强度的防御提升。',
    tags: ['防御提升', '阶段切换'],
    active: ['多智石莲在未进入冷却时会按携带时间切换阶段；基础为三阶段，冷却依次为 30秒、15秒、15秒，带木属性时依次为 20秒、10秒、10秒。使用后获得 7秒防御提升，第三阶段附带普通霸体；激活器魂后可开启第四阶段，第四阶段也附带普通霸体。前三阶段防御提升随法宝等级成长，第四阶段为器魂开启后的法宝等级成长值。']
  },
  24001: {
    summary: '召唤龙卷风造成伤害，并在区域内吸附、减速、削防。',
    tags: ['龙卷风', '区域削防'],
    active: ['在前方召唤龙卷风攻击敌人，龙卷风每 0.5秒可命中 1次；生成时会短时间吸附周围敌人。龙卷风区域持续约 5.4秒，区域内敌人会持续降低防御和移动速度；削防数值、减速幅度和命中伤害都随法宝等级成长。']
  },
  25001: {
    summary: '一段时间内免疫减益，并提升回血属性。',
    tags: ['免疫减益', '回血提升'],
    active: ['使用后进入减益免疫状态并提升回血属性；首次免疫不缩短持续时间，之后每次免疫与之前不同类型的减益，会按比例压缩剩余免疫时长，最少保留 1秒；同类型减益不会重复扣时长。免疫时长、扣时后保留比例和回血提升都随法宝等级成长。']
  },
  26001: {
    summary: '敲出雷音攻击范围敌人并造成晕眩。',
    tags: ['范围伤害', '晕眩'],
    active: ['天锤敲击空气发出雷音；第 18帧释放实际命中范围，命中敌人后造成伤害并晕眩。晕眩期间不能移动、攻击或使用技能；伤害和晕眩持续时间都随法宝等级成长。']
  }
};

function activeGrowthTable(weaponId, skillRows, buffMap, beskillMap, monsterMap) {
  switch (weaponId) {
    case 1001:
      return continuousRecoveryTable(1001501, '生命', buffMap);
    case 3001:
      return continuousRecoveryTable(16000501, '魔法', buffMap);
    case 4001:
      return table('主动技能成长表', [
        { label: '古剑飞行命中伤害', value: row => formatDamage(row.damageAddPer, row.damageAddVal) || '无' }
      ], cachedSkillLevelRows(20304010201), ACTIVE_NO_GROWTH_TEXT);
    case 5001:
      return skillDamageColumnTable('主动技能成长表', cachedSkillLevelRows(20305010102), '每次追击伤害', ACTIVE_NO_GROWTH_TEXT);
    case 6001: {
      const poisonRows = buffSeries(buffMap, 1006201);
      const needleRows = cachedSkillLevelRows(20306010103);
      if (needleRows.length !== poisonRows.length) fail('罗刹妖伞毒针伤害等级数与毒伤等级数不一致');
      const poisonDuration = secondsFromFrames(poisonRows[0].buff.time);
      return table('主动技能成长表', [
        { label: '毒针命中伤害', value: row => formatDamage(row.needle.damageAddPer, row.needle.damageAddVal) || '无' },
        { label: '每层每秒毒伤', value: row => formatDamage(buffDamagePer(row.poison.buff), 0) || '无' },
        { label: `每层${poisonDuration}总毒伤`, value: row => formatDamage(buffDamagePer(row.poison.buff) * buffTickCount(row.poison.buff), 0) || '无' }
      ], poisonRows.map((row, idx) => ({
        level: row.level,
        poison: row,
        needle: needleRows[idx]
      })), ACTIVE_NO_GROWTH_TEXT);
    }
    case 7001:
      return backHurtGrowthTable('主动技能成长表', backHurtRowsFromBuffSeries(buffSeries(buffMap, 134000101), beskillMap), [], ACTIVE_NO_GROWTH_TEXT);
    case 8001:
      return skillDamageColumnTable('主动技能成长表', cachedSkillLevelRows(20308010102), '宣花锤伤害', ACTIVE_NO_GROWTH_TEXT);
    case 9001:
      return shieldRatioTable('主动技能成长表', buffSeries(buffMap, 13002101), '生命护盾值', ACTIVE_NO_GROWTH_TEXT);
    case 10001:
      return table('主动技能成长表', [
        { label: '宠物体型提升', value: row => pct(row.size.buff.value[1]) },
        { label: '宠物伤害提升', value: row => pct(row.damage.buff.value[0]) }
      ], buffSeries(buffMap, 31001401).map((row, idx) => ({ level: row.level, size: row, damage: buffSeries(buffMap, 5002201)[idx] })), ACTIVE_NO_GROWTH_TEXT);
    case 11001:
      return table('主动技能成长表', [
        { label: '每秒灼烧伤害', value: row => formatDamage(buffDamagePer(row.buff), 0) || '无' },
        { label: '15秒总灼烧伤害', value: row => formatDamage(buffDamagePer(row.buff) * buffTickCount(row.buff), 0) || '无' }
      ], buffSeries(buffMap, 1016201), ACTIVE_NO_GROWTH_TEXT);
    case 14001:
      return table('主动技能成长表', [
        { label: '每层每次结算扣生命和生命上限', value: row => plagueAttackScaleText(row.buff) }
      ], buffSeries(buffMap, PLAGUE_ACTIVE_BASE_BUFF_ID), ACTIVE_NO_GROWTH_TEXT);
    case 15001:
      return table('主动技能成长表', [
        { label: '防御降低上限', value: row => pct(row.buff.value.maxPer) },
        { label: '按自身防御降低', value: row => pct(Math.abs(row.buff.value.source[0])) }
      ], buffSeries(buffMap, 202000101), ACTIVE_NO_GROWTH_TEXT);
    case 16001:
      return table('主动技能成长表', [
        { label: '隐身前1.5秒闪避提升', value: row => pct(row.early.buff.value[0]) },
        { label: '隐身后段闪避提升', value: row => pct(row.late.buff.value[0]) }
      ], buffSeries(buffMap, 60001101).map((row, idx) => ({ level: row.level, early: row, late: buffSeries(buffMap, 8001901)[idx] })), ACTIVE_NO_GROWTH_TEXT);
    case 17001:
      return table('主动技能成长表', [
        { label: '盾甲生命上限', value: row => {
          const hp = row.monster.hp;
          if (typeof hp !== 'number') fail(`灵鳌盾甲 Lv.${row.level} 属性怪缺少生命继承比例`);
          return `${pct(hp, 3)} 自身最大生命`;
        } }
      ], monsterSeries(monsterMap, LINGAO_SHIELD_MONSTER_BASE_ID), ACTIVE_NO_GROWTH_TEXT);
    case 18001:
    case 20001:
      return skillDamageTable('主动技能成长表', skillRows, ACTIVE_NO_GROWTH_TEXT);
    case 24001:
      return table('主动技能成长表', [
        { label: '龙卷风命中伤害', value: row => formatDamage(row.skill.damageAddPer, row.skill.damageAddVal) || '无' },
        { label: '区域防御降低', value: row => formatReductionPair(row.debuff.buff.value) },
        { label: '区域移速降低', value: row => pct(Math.abs(buffById(buffMap, row.debuff.buff.attachBuff[0]).value[0])) }
      ], buffSeries(buffMap, 6013901).map((row, idx) => {
        const skill = skillRows[idx];
        if (!skill) fail(`风廉羽扇缺少 Lv.${row.level} 主动伤害`);
        return { level: row.level, skill, debuff: row };
      }), ACTIVE_NO_GROWTH_TEXT);
    case 19001:
      return table('主动技能成长表', [
        { label: '剑域减速', value: row => signedPct(row.slow.buff.value[0]) },
        { label: '按自身暴击降低韧性', value: row => signedPct(row.tenacity.buff.value.sourceProps[0][1]) },
        { label: '按敌方韧性降低韧性', value: row => signedPct(row.tenacity.buff.value.targetProps[0][1]) }
      ], buffSeries(buffMap, 4045001).map((row, idx) => ({ level: row.level, slow: row, tenacity: buffSeries(buffMap, 245000101)[idx] })), ACTIVE_NO_GROWTH_TEXT);
    case 21001:
      return simpleBuffPairTable('主动技能成长表', buffSeries(buffMap, 279000101), '回魔属性提升', ACTIVE_NO_GROWTH_TEXT);
    case 22001:
      return table('主动技能成长表', [
        { label: '轨迹单次伤害', value: row => formatDamage(Math.abs(row.track.buff.value[0][0]), Math.abs(row.track.buff.value[0][1])) },
        { label: '爆燃触发伤害', value: row => formatDamage(Math.abs(row.burst.buff.value[0][0]), Math.abs(row.burst.buff.value[0][1])) },
        { label: '爆燃每秒持续伤害', value: row => formatDamage(Math.abs(row.dot.buff.value[0][0]), Math.abs(row.dot.buff.value[0][1])) },
        { label: '爆燃9秒总持续伤害', value: row => formatDamage(Math.abs(row.dot.buff.value[0][0]) * buffTickCount(row.dot.buff), Math.abs(row.dot.buff.value[0][1]) * buffTickCount(row.dot.buff)) }
      ], buffSeries(buffMap, 1055401).map((row, idx) => ({ level: row.level, track: row, burst: buffSeries(buffMap, 1055501)[idx], dot: buffSeries(buffMap, 1055801)[idx] })), ACTIVE_NO_GROWTH_TEXT);
    case 23001:
      return table('主动技能成长表', [
        { label: '一阶段防御提升', value: row => formatBuffPair(row.stage1.buff.value) },
        { label: '二阶段防御提升', value: row => formatBuffPair(row.stage2.buff.value) },
        { label: '三阶段防御提升', value: row => formatBuffPair(row.stage3.buff.value) },
        { label: '四阶段防御提升（器魂开启）', value: row => formatBuffPair(row.stage4.buff.value) }
      ], Array.from({ length: 10 }, (_, idx) => ({
        level: idx + 1,
        stage1: { buff: buffById(buffMap, 6012501 + idx) },
        stage2: { buff: buffById(buffMap, 6012601 + idx) },
        stage3: { buff: buffById(buffMap, 6012701 + idx) },
        stage4: { buff: buffById(buffMap, 6012801 + idx) }
      })), ACTIVE_NO_GROWTH_TEXT);
    case 25001:
      return table('主动技能成长表', [
        { label: '减益免疫初始时长', value: row => secondsFromFrames(row.immune.buff.time) },
        { label: '不同减益后保留剩余时长', value: row => pct(row.immune.buff.custom.useSubFrame.per, 4) },
        { label: '回血属性提升', value: row => formatBuffPair(row.heal.buff.value) }
      ], buffSeries(buffMap, 41003001).map((row, idx) => ({ level: row.level, immune: row, heal: buffSeries(buffMap, 297000101)[idx] })), ACTIVE_NO_GROWTH_TEXT);
    case 26001:
      return table('主动技能成长表', [
        { label: '雷音伤害', value: row => formatDamage(row.skill.damageAddPer, row.skill.damageAddVal) || '无' },
        { label: '晕眩持续时间', value: row => secondsFromFrames(row.stun.buff.time) }
      ], buffSeries(buffMap, 3011401).map((row, idx) => {
        const skill = skillRows[idx];
        if (!skill) fail(`震雷天锤缺少 Lv.${row.level} 主动伤害`);
        return { level: row.level, skill, stun: row };
      }), ACTIVE_NO_GROWTH_TEXT);
    default:
      return table('主动技能成长表', [], [], ACTIVE_NO_GROWTH_TEXT);
  }
}

const SOUL_GUIDES = {
  1: { text: '器魂被动为常驻效果：携带法宝出战时提升自身回血属性。', kind: 'attribute', label: '回血属性提升', get: b => pct(b.attribute[0]) },
  2: { text: '器魂被动为常驻效果：提升宠物捕捉成功率。', kind: 'plain', label: '捕捉成功率提升', get: b => pct(b.attribute) },
  3: { text: '器魂被动为常驻效果：携带法宝出战时提升自身回魔属性。', kind: 'attribute', label: '回魔属性提升', get: b => pct(b.attribute[0]) },
  4: { text: '器魂被动为常驻效果：携带法宝出战时提升自身闪避属性。', kind: 'attribute', label: '闪避属性提升', get: b => pct(b.attribute[0]) },
  5: { text: '器魂被动在自己被攻击命中后判定：触发成功会冰冻攻击者 3秒，冰冻期间不能移动、攻击或使用技能。最多存 1次触发机会；触发成功后有 1秒内部间隔，触发概率和机会恢复时间随器魂等级成长，详细数值见器魂被动成长表。', kind: 'chance', label: '触发概率' },
  6: { text: '器魂被动在攻击命中后判定：有 2.22% 概率附加中毒，持续 5秒，每秒造成 1次无属性毒伤。最多存 1次触发机会，每 30秒恢复 1次；触发成功后有 1秒内部间隔，毒伤随器魂等级成长，详细数值见器魂被动成长表。', kind: 'buffDamage', label: '每秒毒伤' },
  7: { text: '器魂被动在自己被攻击命中后判定：触发成功会让攻击者进入 5秒鬼爪反噬，反噬计算方式与主动技能一致：先计算上限，再按动作帧数 × 1.47%逐步结算。最多存 1次触发机会；触发成功后有 1秒内部间隔，触发概率、反噬基础系数和机会恢复时间随器魂等级成长，详细数值见器魂被动成长表。', kind: 'backHurt' },
  8: { text: '器魂被动在自己被攻击命中后判定：触发成功会让攻击者混乱 5秒。最多存 1次触发机会；触发成功后有 1秒内部间隔，触发概率和机会恢复时间随器魂等级成长，详细数值见器魂被动成长表。', kind: 'chance', label: '触发概率' },
  9: { text: '器魂被动为常驻效果：携带法宝出战时提升自身防御属性。', kind: 'attribute', label: '防御属性提升', get: b => pct(b.attribute[0]) },
  10: { text: '器魂被动为常驻效果：提升自己场上宠物的攻击属性。', kind: 'petAttack' },
  11: { text: '器魂被动在攻击命中后判定：有 1.11% 概率附加灼烧，持续 15秒，每秒造成 1次火属性真伤。最多存 1次触发机会，每 60秒恢复 1次；灼烧伤害随器魂等级成长，详细数值见器魂被动成长表。', kind: 'buffDamage', label: '每秒灼烧伤害' },
  12: { text: buffMap => `器魂被动在攻击命中后判定：有 1.11% 概率附加瘟疫。最多存 1次触发机会，每 60秒恢复 1次；${plagueProcessText(buffMap, PLAGUE_SOUL_BASE_BUFF_ID, '器魂被动成长表')}`, kind: 'plague' },
  13: { text: '器魂被动在自己被攻击命中后判定：触发成功会催眠攻击者 10秒，睡眠、降闪避和削防机制同主动技能。最多存 1次触发机会；触发成功后有 1秒内部间隔，触发概率、削防幅度和机会恢复时间随器魂等级成长。', kind: 'sleep' },
  14: { text: '器魂被动在自己被攻击命中后判定：触发成功会让自己进入 5秒隐身，隐身前 1.5秒不会显形，之后攻击或受击会显形。最多存 1次触发机会；触发成功后有 1秒内部间隔，触发概率、两段闪避提升和机会恢复时间随器魂等级成长。', kind: 'invisible' },
  15: { text: '器魂被动在自己被攻击命中前判定：有 4% 概率获得最多持续 5秒的生命护盾。最多存 1次触发机会，每 50秒恢复 1次；触发成功后有 5秒内部间隔，护盾值随器魂等级成长。', kind: 'shield' },
  16: { text: '器魂被动在攻击命中后判定：有 1.11% 概率召唤金仙斩魔刀攻击敌人，额外增伤规则与主动技能一致。最多存 1次触发机会，每 60秒恢复 1次；召唤斩击伤害随器魂等级成长。', kind: 'summonSword' },
  17: { text: '器魂被动在攻击命中后判定：有 1.09% 概率降低敌人韧性，持续 5秒。最多存 1次触发机会，每 61秒恢复 1次；降低韧性的数值随器魂等级成长。', kind: 'tenacity' },
  18: { text: '器魂被动在攻击命中后判定：有 13.33% 概率发射 1颗佛珠攻击敌人，最多可存 8次触发机会，每 30秒恢复 1次；佛珠伤害随器魂等级成长。', kind: 'bead' },
  19: { text: '器魂被动在使用罗悲净瓶时触发：立即回复魔法；如果这次没有驱散到异常状态，会额外缩短本次法宝冷却。', kind: 'bottle' },
  20: { text: '器魂被动在使用浮行如意期间生效：提升移动速度，并提高浮行如意轨迹灼烧和爆燃造成的伤害。', kind: 'ruyi' },
  21: { text: '器魂被动强化多智石莲：把阶段切换扩展到第四阶段；使用多智石莲时还会额外获得 7秒防御提升。额外防御提升随器魂等级成长，详细数值见器魂被动成长表。', kind: 'lotus' },
  22: { text: '器魂被动在攻击命中后判定：有 1.11% 概率降低敌人防御，持续 5秒；同时放大风廉羽扇生成的龙卷风范围。最多存 1次触发机会，后续每 30秒恢复 1次；触发成功后有 2秒内部间隔。削防数值和龙卷风范围随器魂等级成长，详细数值见器魂被动成长表。', kind: 'fan' }
};

function nestedBuffFromBesSkill(beskill, buffMap) {
  if (!Array.isArray(beskill.attribute) || !Number.isInteger(beskill.attribute[0])) fail(`器魂 ${beskill.id} 缺少 buff 引用`);
  const first = buffById(buffMap, beskill.attribute[0]);
  if (Array.isArray(first.value) && Number.isInteger(first.value[0])) return buffById(buffMap, first.value[0]);
  return first;
}

function chargeRecoveryText(beskill) {
  if (!beskill.chargedNumber || beskill.chargedNumber <= 0) return '无';
  if (typeof beskill.chargedCd !== 'number') fail(`器魂 ${beskill.id} 缺少充能恢复帧数`);
  return secondsFromFrames(beskill.chargedCd);
}

function soulGrowthTable(groupId, soulRows, beskillMap, buffMap) {
  const guide = SOUL_GUIDES[groupId];
  if (!guide) fail(`缺少器魂组 ${groupId} 的展示规则`);
  const rows = soulRows.map(row => ({ level: row.level, beskills: row.beSkill.map(id => {
    const be = beskillMap.get(id);
    if (!be) fail(`缺少 beskill ${id}`);
    return be;
  }) }));

  function firstBe(row, predicate = () => true) {
    const be = row.beskills.find(predicate);
    if (!be) fail(`器魂组 ${groupId} Lv.${row.level} 缺少匹配被动`);
    return be;
  }

  switch (guide.kind) {
    case 'attribute':
    case 'plain':
      return table('器魂被动成长表', [{ label: guide.label, value: row => guide.get(firstBe(row)) }], rows, '当前配置没有可展示的器魂被动成长项。');
    case 'chance':
      return table('器魂被动成长表', [
        { label: guide.label, value: row => pct(firstBe(row).rate) },
        { label: '触发机会恢复时间', value: row => chargeRecoveryText(firstBe(row)) }
      ], rows, SOUL_NO_GROWTH_TEXT);
    case 'petAttack':
      return table('器魂被动成长表', [{ label: '宠物攻击提升', value: row => pct(buffById(buffMap, firstBe(row).attribute[0]).value[0]) }], rows, '当前配置没有可展示的器魂被动成长项。');
    case 'buffDamage':
      return table('器魂被动成长表', [
        { label: guide.label, value: row => formatDamage(buffDamagePer(nestedBuffFromBesSkill(firstBe(row), buffMap)), 0) },
        { label: '持续合计', value: row => {
          const buff = nestedBuffFromBesSkill(firstBe(row), buffMap);
          return formatDamage(buffDamagePer(buff) * buffTickCount(buff), 0) || '无';
        } }
      ], rows, SOUL_NO_GROWTH_TEXT);
    case 'backHurt':
      return backHurtGrowthTable('器魂被动成长表', rows.map(row => {
        const be = firstBe(row);
        const buff = buffById(buffMap, be.attribute[0]);
        return {
          ...backHurtRowsFromBuffSeries([{ level: row.level, buff }], beskillMap)[0],
          rate: be.rate,
          chargeRecovery: chargeRecoveryText(be)
        };
      }), [
        { label: '触发概率', value: row => pct(row.rate) },
        { label: '触发机会恢复时间', value: row => row.chargeRecovery }
      ], SOUL_NO_GROWTH_TEXT);
    case 'plague':
      return table('器魂被动成长表', [{ label: '每层每次瘟疫扣生命和生命上限', value: row => plagueAttackScaleText(nestedBuffFromBesSkill(firstBe(row), buffMap)) }], rows, '当前配置没有可展示的器魂被动成长项。');
    case 'sleep':
      return table('器魂被动成长表', [
        { label: '触发概率', value: row => pct(firstBe(row).rate) },
        { label: '按自身防御降低', value: row => {
          const sleepBuff = buffById(buffMap, firstBe(row).attribute[0]);
          const defBuff = buffById(buffMap, sleepBuff.attachBuff[1]);
          return pct(Math.abs(defBuff.value.source[0]));
        } },
        { label: '触发机会恢复时间', value: row => chargeRecoveryText(firstBe(row)) }
      ], rows, '当前配置没有可展示的器魂被动成长项。');
    case 'invisible':
      return table('器魂被动成长表', [
        { label: '触发概率', value: row => pct(firstBe(row).rate) },
        { label: '隐身前1.5秒闪避提升', value: row => pct(buffById(buffMap, buffById(buffMap, firstBe(row).attribute[0]).attachBuff[0]).value[0]) },
        { label: '隐身后段闪避提升', value: row => pct(buffById(buffMap, buffById(buffMap, firstBe(row).attribute[0]).attachBuff[1]).value[0]) },
        { label: '触发机会恢复时间', value: row => chargeRecoveryText(firstBe(row)) }
      ], rows, '当前配置没有可展示的器魂被动成长项。');
    case 'shield':
      return table('器魂被动成长表', [{ label: '生命护盾值', value: row => pct(buffById(buffMap, firstBe(row).attribute[0]).value[3]) }], rows, '当前配置没有可展示的器魂被动成长项。');
    case 'summonSword':
      return table('器魂被动成长表', [{ label: '召唤斩击伤害倍率', value: row => {
        const skillId = firstBe(row).attribute.mainSkillId;
        const skillRows = skillLevelRows(Array.from(skillLevelRowsCache.values()), skillId);
        if (skillRows.length !== 1) fail(`金仙斩魔刀器魂技能 ${skillId} 等级数据异常`);
        return `${pct(skillRows[0].damageAddPer)}攻击`;
      }}], rows, '当前配置没有可展示的器魂被动成长项。');
    case 'tenacity':
      return table('器魂被动成长表', [{ label: '降低韧性', value: row => signedPct(nestedBuffFromBesSkill(firstBe(row), buffMap).value[0]) }], rows, '当前配置没有可展示的器魂被动成长项。');
    case 'bead':
      return table('器魂被动成长表', [{ label: '佛珠伤害倍率', value: row => {
        const be = firstBe(row);
        const skillId = be.attribute.vskillIds[0];
        const skillRows = skillLevelRows(Array.from(skillLevelRowsCache.values()), skillId);
        const skillRow = skillRows.find(item => item.level === be.attribute.useLv);
        if (!skillRow) fail(`摩愿佛珠器魂技能 ${skillId} 缺少 Lv.${be.attribute.useLv}`);
        return `${pct(skillRow.damageAddPer)}攻击`;
      }}], rows, '当前配置没有可展示的器魂被动成长项。');
    case 'bottle':
      return table('器魂被动成长表', [
        { label: '立即回复魔法', value: row => pct(buffById(buffMap, firstBe(row, be => be.scope === 'thumbMagic').attribute[0]).value.param[2]) },
        { label: '未驱散时减少冷却', value: row => secondsFromFrames(Math.abs(buffById(buffMap, firstBe(row, be => be.scope === 'beskillDealFail').attribute[0]).value[1])) }
      ], rows, '当前配置没有可展示的器魂被动成长项。');
    case 'ruyi':
      return table('器魂被动成长表', [
        { label: '移速提升', value: row => pct(buffById(buffMap, firstBe(row, be => be.label === 'buff').attribute[0]).value[0]) },
        { label: '灼烧/爆燃伤害提升', value: row => explicitSignedPct(firstBe(row, be => be.label === 'paramPer').attribute[0] - 1, 2) }
      ], rows, '当前配置没有可展示的器魂被动成长项。');
    case 'lotus':
      return table('器魂被动成长表', [{ label: '额外阶段防御提升', value: row => formatBuffPair(buffById(buffMap, firstBe(row, be => be.label === 'buff').attribute[0]).value) }], rows, '当前配置没有可展示的器魂被动成长项。');
    case 'fan':
      return table('器魂被动成长表', [
        { label: '命中防御降低', value: row => formatReductionPair(nestedBuffFromBesSkill(firstBe(row, be => be.label === 'buff'), buffMap).value) },
        { label: '龙卷风范围变为', value: row => `${trimNumber(firstBe(row, be => be.label === 'magicSkillScale').attribute.scale, 4)}倍` }
      ], rows, '当前配置没有可展示的器魂被动成长项。');
    default:
      fail(`未知器魂展示类型: ${guide.kind}`);
  }
}

let skillLevelRowsCache = new Map();

function extractEffect() {
  const magicRows = u.loadTable('magicWeapon').filter(row => row.phases !== 2 && !String(row.name).includes('二阶'));
  const monsterMap = new Map(u.loadTable('monster').map(row => [row.id, row]));
  const skillMap = new Map(u.loadTable('skill').map(row => [row.id, row]));
  const skillLevels = u.loadTable('skillLevel');
  skillLevelRowsCache = new Map(skillLevels.map(row => [row.id, row]));
  const soulRows = u.loadTable('magicWeaponSoulLv');
  const beskillMap = new Map(u.loadTable('beskill').map(row => [row.id, row]));
  const buffMap = new Map(u.loadTable('buff').map(row => [row.id, row]));

  const effects = magicRows.map(weapon => {
    const guide = ACTIVE_GUIDES[weapon.id];
    if (!guide) fail(`缺少法宝 ${weapon.id} ${weapon.name} 的主动说明`);
    const monster = monsterMap.get(weapon.monsterId);
    if (!monster) fail(`${weapon.name} 缺少召唤怪物 ${weapon.monsterId}`);
    const skillIds = monster.skillIds || [];
    if (!skillIds.length) fail(`${weapon.name} 缺少主动技能`);
    const skills = skillIds.map(id => {
      const row = skillMap.get(id);
      if (!row) fail(`${weapon.name} 缺少技能 ${id}`);
      return row;
    });
    const baseCd = skills[0].cd;
    if (typeof baseCd !== 'number') fail(`${weapon.name} 主动技能缺少冷却`);
    const primarySkillRows = skillLevelRows(skillLevels, skills[0].id);
    const activeTable = activeGrowthTable(weapon.id, primarySkillRows, buffMap, beskillMap, monsterMap);
    const activeTexts = typeof guide.active === 'function' ? guide.active(buffMap, weapon) : guide.active;
    if (!Array.isArray(activeTexts)) fail(`法宝 ${weapon.name} 的主动说明必须是数组`);
    const activeDescription = [...activeTexts, cooldownText(baseCd)];

    const soulGroupRows = soulRows.filter(row => row.groupId === weapon.groupId).sort((a, b) => a.level - b.level);
    const hasSoul = !weapon.closeSoul && soulGroupRows.length > 0;
    let soulDescription;
    let soulTable = null;
    if (hasSoul) {
      const soulGuide = SOUL_GUIDES[weapon.groupId];
      if (!soulGuide) fail(`缺少法宝 ${weapon.name} 的器魂说明`);
      const soulText = typeof soulGuide.text === 'function' ? soulGuide.text(buffMap, weapon) : soulGuide.text;
      if (typeof soulText !== 'string') fail(`法宝 ${weapon.name} 的器魂说明必须是文本`);
      soulDescription = [soulText];
      soulTable = soulGrowthTable(weapon.groupId, soulGroupRows, beskillMap, buffMap);
    } else {
      soulDescription = ['当前配置没有可用的器魂被动数据。'];
    }

    const suffix = String(monster.file).replace(`${monster.id}-`, '');
    const battleConfig = path.join('file', 'battle-config', 'entityCtg', `${monster.id}-monster_cfg_${suffix}.json`);
    if (!fs.existsSync(path.join(u.ROOT, battleConfig))) fail(`${weapon.name} 缺少战斗配置 ${battleConfig}`);

    return {
      id: weapon.id,
      name: weapon.name,
      phases: weapon.phases,
      groupId: weapon.groupId,
      monsterId: weapon.monsterId,
      summary: guide.summary,
      tags: guide.tags,
      cooldown: { base: baseCd, wood: baseCd * 2 / 3, display: `${formatSeconds(baseCd)} / 木属性 ${formatSeconds(baseCd * 2 / 3)}` },
      mechanism: { active: activeDescription, soul: soulDescription },
      activeGrowthTable: activeTable,
      soulGrowthTable: soulTable,
      evidence: { skillIds, battleConfig }
    };
  });

  u.saveOutput('role_magic_effect', effects, {
    system: '角色 → 法宝系统 → 法宝效果',
    source: 'magicWeapon / monster / skill / skillLevel / magicWeaponSoulLv / beskill / buff / battle-config',
    note: '玩家向法宝主动技能与器魂被动说明；表格仅展示随等级成长的数值，固定机制写在说明区。'
  });
}

// ━━━ 法宝升级 ━━━ magicWeaponLev.*.json ━━━━━━━━━━━━━
function extractLev() {
  const raw = u.loadTable('magicWeaponLev');
  const magic = u.loadTable('magicWeapon');
  const magicNameById = new Map(magic.map(m => [m.id, m.name]));
  const zhPhase = { 1: '一', 2: '二' };

  function resolveWeaponName(weaponGroup) {
    const direct = magicNameById.get(weaponGroup);
    if (direct) return direct;

    const phase = weaponGroup % 10;
    const baseId = weaponGroup - (phase - 1);
    const baseName = magicNameById.get(baseId);
    if (!baseName) return `未知法宝(${weaponGroup})`;

    if (phase <= 1) return baseName;
    const pure = baseName.replace(/^[一二三四五六七八九十]+阶/, '');
    const phaseName = zhPhase[phase] || String(phase);
    return `${phaseName}阶${pure}`;
  }

  // id编码: 前4位=法宝种类, 后2位=等级
  const weapons = {};
  for (const r of raw) {
    const wpnKey = Math.floor(r.id / 100);
    if (!weapons[wpnKey]) {
      weapons[wpnKey] = {
        weaponGroup: wpnKey,
        weaponName: resolveWeaponName(wpnKey),
        levels: []
      };
    }
    weapons[wpnKey].levels.push({
      lv: r.lv,
      lvDeduct: u.parseCost(r.lvDeduct),
      consumeDeduct: u.parseCost(r.consumeDeduct)
    });
  }
  u.saveOutput('role_magic_lev', Object.values(weapons), {
    system: '角色 → 法宝系统 → 升级',
    source: 'magicWeaponLev.*.json',
    costType: '道具(lvDeduct) + 点券(consumeDeduct)',
    dedup: '46种法宝×10级=460条, 不同法宝用不同专属道具'
  });
}

// ━━━ 器魂 ━━━ magicWeaponSoulLv.*.json ━━━━━━━━━━━━━━
function extractSoul() {
  const raw = u.loadTable('magicWeaponSoulLv');
  const groups = {};
  for (const r of raw) {
    if (!groups[r.groupId]) {
      groups[r.groupId] = {
        groupId: r.groupId, desName: r.desName,
        name: r.name, levels: []
      };
    }
    groups[r.groupId].levels.push({
      level: r.level,
      upCost: u.parseCost(r.upCost)
    });
  }
  u.saveOutput('role_magic_soul', Object.values(groups), {
    system: '角色 → 法宝系统 → 器魂',
    source: 'magicWeaponSoulLv.*.json',
    costType: '灵镔铁(141000000)',
    dedup: '同系器魂各级消耗固定为1个灵镔铁'
  });
}

// ━━━ 强运洗练 ━━━ magicWeapon.*.json ━━
function extractLuck() {
  const raw = u.loadTable('magicWeapon');
  const soulRows = u.loadTable('magicWeaponSoulLv');
  const soulGroupIdByName = new Map();

  for (const row of soulRows) {
    if (!row.name) continue;
    if (!soulGroupIdByName.has(row.name)) {
      soulGroupIdByName.set(row.name, row.groupId);
    } else if (soulGroupIdByName.get(row.name) !== row.groupId) {
      throw new Error(`Duplicate magic soul groupId for ${row.name}`);
    }
  }

  const magic = raw.map(r => ({
    id: r.id,
    name: r.name,
    phases: r.phases, // 几阶法宝
    soulGroupId: soulGroupIdByName.get(r.name) || null,
    baptizeLuck: u.parseCost(r.baptizeLuck),           // 普通强运洗练消耗
    blessingCostLuck: u.parseCost(r.blessingCostLuck), // 祝福洗练消耗(必出紫以上等)
    baptizeGrowLuck: u.parseCost(r.baptizeGrowLuck)    // 强运培养消耗
  }));

  u.saveOutput('role_magic_luck', magic, {
    system: '角色 → 法宝系统 → 强运洗练',
    source: 'magicWeapon.*.json',
    costType: '强运币(luckCoin) 等',
    note: '提取各阶法宝的普通洗练、祝福洗练及洗练培养强运消耗'
  });
}

function extract() {
  console.log('\n📦 角色 → 法宝系统');
  extractLev();
  extractSoul();
  extractLuck();
  extractEffect();
}

if (require.main === module) extract();
module.exports = extract;
