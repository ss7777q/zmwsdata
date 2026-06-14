/**
 * 角色 → 神器系统
 * 提取叶子: 解锁, 升级/进阶, 神器效果
 */
const fs = require('fs');
const path = require('path');
const u = require('../lib/utils');

const FRAME_RATE = 30;
const ACTIVE_NO_GROWTH_TEXT = '当前配置没有随神器等级成长的主动技能数值。';
const EXTRA_NO_GROWTH_TEXT = '当前配置没有可展示的神器附加成长项。';
const ENABLED_EFFECT_GROUP_IDS = new Set([1, 2, 3, 4, 5, 6]);

const GODWEAPON_EFFECT_CONFIG = {
  liuxie: {
    groupId: 1,
    baseBuffIdsByRank: {
      1: 5002701,
      2: 5004301,
      3: 5007801
    },
    summary: '牺牲生命换取短时间爆发，进阶后追加暴击率与幸运提升。',
    tags: ['自身强化', '生命流失', '爆发增益'],
    active: [
      '使用后在第 42帧给自身附加强化，持续 10秒；强化期间每秒流失 1次生命，每次为自身最大生命的 1%。',
      '一阶主要提升攻击力；二阶保持攻击力提升并追加暴击率；三阶保持攻击力与暴击率，并追加幸运提升。随神器等级成长的数值见主动技能成长表。'
    ]
  },
  yanxinglu: {
    groupId: 2,
    starfallBuffBaseId: 1051501,
    summary: '召落星辰攻击敌人，高阶会追加持续星陨伤害。',
    tags: ['受防御影响伤害', '星陨追伤', '远程打击'],
    active: [
      '使用后召落星辰攻击敌人，直接命中伤害会受敌方防御类属性影响；不同等阶拥有不同的基础伤害段，随神器等级成长。',
      '四阶命中后还会附加星陨，星陨每 3秒造成 1次伤害，每次为 46%攻击；持续时间随神器等级成长，详细数值见主动技能成长表。'
    ]
  },
  huayan: {
    groupId: 3,
    healBuffBaseId: 6004201,
    sleepBuffId: 199000401,
    summary: '解除自身催眠并回复生命，同时用镇魂之音催眠周围敌人。',
    tags: ['解除催眠', '生命恢复', '范围催眠'],
    active: [
      '使用后第 20帧解除自身催眠并回复生命，同时获得 1秒睡眠免疫；回复量按自身最大生命计算，随神器等级成长。',
      '第 40帧发出镇魂之音，命中周围敌人后使其睡眠 10秒；睡眠期间敌人闪避率降低 100%，并按配置系数降低防御，防御降低最多不超过目标防御的 50%。'
    ]
  },
  cuju: {
    groupId: 4,
    damageSkillIds: [20318010101, 20318010301],
    summary: '踢出蹴球追击敌人，命中后原地旋转造成多段伤害；可按住释放蓄力踢。',
    tags: ['追击弹体', '多段命中', '蓄力技能'],
    active: [
      '普通释放会把蹴球踢向最近的敌人，命中后在原地旋转；旋转段最多命中 4次，每 0.5秒可命中 1次。',
      '按住按键可释放蓄力技能；当前配置中普通旋转段与蓄力旋转段使用同一套伤害成长，详细数值见主动技能成长表。'
    ]
  },
  qiqiu: {
    groupId: 5,
    liftBuffIdsByRank: {
      1: 233000001,
      2: 233000101,
      3: 233000201
    },
    dodgeValueBuffIdsByRank: {
      1: 8003201,
      2: 8003301,
      3: 8003401
    },
    dodgeRateBuffIdsByRank: {
      1: 60001601,
      2: 60001701,
      3: 60001801
    },
    summary: '进入上浮状态躲避威胁，并在上浮期间提升闪避。',
    tags: ['上浮位移', '闪避提升', '再次释放结束'],
    active: [
      '使用后进入上浮状态；上浮状态约持续 3.167秒，期间再次按神器技能会结束上浮。',
      '上浮期间会短暂限制普攻、跳跃和普通技能，并获得闪避率提升与闪避值提升；闪避率固定为 15%，闪避值提升随神器等级成长，详细数值见主动技能成长表。'
    ]
  },
  xuanhuaHonghulu: {
    groupId: 6,
    summary: '生成灵力旋涡吸附目标，用于捕捉宠物。',
    tags: ['吸附', '宠物捕捉', '长冷却'],
    active(ctx, weapons) {
      const weapon = weapons[0];
      const skillRows = godWeaponSkillRows(ctx.godWeaponSkillLevels, weapon);
      const beSkillId = skillRows[0]?.beskillId;
      if (typeof beSkillId !== 'number') fail('宣花红葫芦缺少捕捉成功率 beskill');
      const beSkill = beSkillById(ctx.beskillMap, beSkillId);
      if (typeof beSkill.attribute !== 'number') fail(`beskill ${beSkill.id} 缺少捕捉成功率提升值`);
      return [
        '使用后产生灵力旋涡，将命中的敌人吸附到身前；命中宠物时，如果该宠物是第一次被宣花红葫芦吸附，当前技能文本记录为 100%捕捉成功。',
        `配置还记录了捕捉成功率提升值 ${trimNumber(beSkill.attribute, 3)}；当前仓库没有可验证的百分比换算规则，因此不把它改写成额外概率。使用其他葫芦捕捉宠物会干扰宣花红葫芦的捕捉概率。`
      ];
    }
  }
};

function fail(message) {
  throw new Error(`[role_godweapon_effect] ${message}`);
}

function trimNumber(value, digits = 4) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`非法数值: ${value}`);
  const fixed = Number(value.toFixed(digits));
  return String(fixed).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function pct(value, digits = 2) {
  return `${trimNumber(value * 100, digits)}%`;
}

function secondsFromFrames(frames) {
  if (typeof frames !== 'number' || !Number.isFinite(frames)) fail(`非法帧数: ${frames}`);
  return `${trimNumber(frames / FRAME_RATE, 3)}秒`;
}

function formatSeconds(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) fail(`非法秒数: ${seconds}`);
  return `${trimNumber(seconds, 3)}秒`;
}

function formatDamage(per, val) {
  const parts = [];
  if (typeof per === 'number' && per !== 0) parts.push(`${pct(per)}攻击`);
  if (typeof val === 'number' && val !== 0 && val !== 1) parts.push(String(val));
  if (!parts.length) return null;
  return parts.join(' + ');
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
    rows: rows.map(row => ({
      level: row.level,
      levelLabel: row.levelLabel,
      values: columns.map(field => field.value(row))
    })),
    emptyText
  };
}

function buffById(buffMap, id) {
  const row = buffMap.get(id);
  if (!row) fail(`缺少 buff ${id}`);
  return row;
}

function beSkillById(beskillMap, id) {
  const row = beskillMap.get(id);
  if (!row) fail(`缺少 beskill ${id}`);
  return row;
}

function skillLevelRows(skillLevels, skillId) {
  return skillLevels
    .filter(row => Math.floor(row.id / 1000) === skillId)
    .sort((a, b) => a.id - b.id)
    .map(row => ({ ...row, level: row.id % 1000 }));
}

function godWeaponSkillRows(godWeaponSkillLevels, weapon) {
  const rows = godWeaponSkillLevels
    .filter(row => Math.floor(row.id / 100) === weapon.id)
    .sort((a, b) => a.lv - b.lv)
    .slice(0, weapon.lvLimit);
  if (rows.length !== weapon.lvLimit) {
    fail(`${weapon.name} ${weapon.rank}阶技能等级数据数量异常: ${rows.length}/${weapon.lvLimit}`);
  }
  return rows.map(row => ({ ...row, level: row.lv, levelLabel: `${weapon.rank}阶 Lv.${row.lv}` }));
}

function getPrimarySkill(weapon, monsterMap, skillMap) {
  const monster = monsterMap.get(weapon.monsterId);
  if (!monster) fail(`${weapon.name} 缺少召唤怪物 ${weapon.monsterId}`);
  const skillIds = monster.skillIds || [];
  if (!skillIds.length) fail(`${weapon.name} 缺少主动技能`);
  const skill = skillMap.get(skillIds[0]);
  if (!skill) fail(`${weapon.name} 缺少技能 ${skillIds[0]}`);
  if (typeof skill.cd !== 'number') fail(`${weapon.name} 主动技能缺少冷却`);
  return { monster, skill, skillIds };
}

function findBattleConfig(monsterId) {
  const dir = path.join(u.ROOT, 'file', 'battle-config', 'entityCtg');
  const matches = fs.readdirSync(dir).filter(file => file.startsWith(`${monsterId}-monster_cfg_`) && file.endsWith('.json'));
  if (matches.length !== 1) fail(`monster ${monsterId} 战斗配置数量异常: ${matches.join(', ') || '无'}`);
  return path.join('file', 'battle-config', 'entityCtg', matches[0]);
}

function energyText(weapon) {
  if (!Array.isArray(weapon.energyConsume) || !weapon.energyConsume.length) {
    fail(`${weapon.name} 缺少神器能量消耗`);
  }
  if (typeof weapon.energyName !== 'string' || !weapon.energyName) {
    fail(`${weapon.name} 缺少神器能量名称`);
  }
  if (weapon.energyConsume.length === 1) {
    return `使用消耗 ${weapon.energyConsume[0]}点${weapon.energyName}。`;
  }
  if (weapon.energyConsume.length === 2) {
    return `普通消耗 ${weapon.energyConsume[0]}点${weapon.energyName}，蓄力消耗 ${weapon.energyConsume[1]}点${weapon.energyName}。`;
  }
  fail(`${weapon.name} 神器能量消耗数量异常: ${JSON.stringify(weapon.energyConsume)}`);
}

function cooldownText(baseCd) {
  return `冷却时间 ${formatSeconds(baseCd)}。`;
}

function buildLiuxieTable(weapons, godWeaponSkillLevels, buffMap) {
  const rows = [];
  const config = GODWEAPON_EFFECT_CONFIG.liuxie;
  for (const weapon of weapons) {
    const baseBuffId = config.baseBuffIdsByRank[weapon.rank];
    if (!baseBuffId) fail(`${weapon.name} ${weapon.rank}阶缺少流邪 buff 配置`);
    for (const skillRow of godWeaponSkillRows(godWeaponSkillLevels, weapon)) {
      const buff = buffById(buffMap, baseBuffId + skillRow.lv - 1);
      const attackPer = buff.value?.[0];
      if (typeof attackPer !== 'number') fail(`buff ${buff.id} 缺少攻击提升`);
      const attached = new Map((buff.attachBuff || []).map(id => [id, buffById(buffMap, id)]));
      const critBuff = [...attached.values()].find(row => row.type === 61);
      const luckBuff = [...attached.values()].find(row => row.type === 11);
      const lifeBuff = [...attached.values()].find(row => row.type === 1);
      if (!lifeBuff) fail(`buff ${buff.id} 缺少生命流失附加 buff`);
      rows.push({
        rank: weapon.rank,
        level: skillRow.level,
        levelLabel: `${weapon.name} ${weapon.rank}阶 Lv.${skillRow.level}`,
        attackPer,
        critPer: critBuff?.value?.[0] ?? null,
        luckPer: luckBuff?.value?.[0] ?? null
      });
    }
  }
  return table('主动技能成长表', [
    { label: '攻击提升', value: row => pct(row.attackPer) },
    { label: '暴击率提升', value: row => row.critPer == null ? '无' : pct(row.critPer, 3) },
    { label: '幸运提升', value: row => row.luckPer == null ? '无' : pct(row.luckPer, 3) }
  ], rows, ACTIVE_NO_GROWTH_TEXT);
}

function buildYanxingluTable(weapons, godWeaponSkillLevels, skillLevels, monsterMap, skillMap, buffMap) {
  const rows = [];
  const config = GODWEAPON_EFFECT_CONFIG.yanxinglu;
  for (const weapon of weapons) {
    const { skill } = getPrimarySkill(weapon, monsterMap, skillMap);
    const damageRows = skillLevelRows(skillLevels, skill.id);
    if (damageRows.length !== weapon.lvLimit) {
      fail(`${weapon.name} ${weapon.rank}阶伤害等级数据数量异常: ${damageRows.length}/${weapon.lvLimit}`);
    }
    for (const damageRow of damageRows) {
      let starfall = null;
      if (weapon.rank === 4) {
        const buff = buffById(buffMap, config.starfallBuffBaseId + damageRow.level - 1);
        const per = Math.abs(buff.value?.[0]?.[0]);
        if (typeof per !== 'number') fail(`buff ${buff.id} 缺少星陨伤害倍率`);
        if (typeof buff.time !== 'number' || typeof buff.interval !== 'number' || buff.interval <= 0) {
          fail(`buff ${buff.id} 缺少有效星陨持续/间隔`);
        }
        const ticks = buff.time / buff.interval;
        if (!Number.isInteger(ticks)) fail(`buff ${buff.id} 星陨跳数不是整数: ${ticks}`);
        starfall = { duration: buff.time, perHit: per, total: per * ticks, ticks };
      }
      rows.push({
        rank: weapon.rank,
        level: damageRow.level,
        levelLabel: `${weapon.name} ${weapon.rank}阶 Lv.${damageRow.level}`,
        directDamage: formatDamage(damageRow.damageAddPer, damageRow.damageAddVal),
        starfall
      });
    }
  }
  return table('主动技能成长表', [
    { label: '直接命中伤害', value: row => row.directDamage || '无' },
    { label: '星陨持续时间', value: row => row.starfall ? secondsFromFrames(row.starfall.duration) : '无' },
    { label: '星陨跳数', value: row => row.starfall ? `${row.starfall.ticks}次` : '无' },
    { label: '星陨累计伤害', value: row => row.starfall ? `${pct(row.starfall.total)}攻击` : '无' }
  ], rows, ACTIVE_NO_GROWTH_TEXT);
}

function buildHuayanTable(weapons, godWeaponSkillLevels, buffMap) {
  const config = GODWEAPON_EFFECT_CONFIG.huayan;
  if (weapons.length !== 1) fail(`花宴神器等阶数量异常: ${weapons.length}`);
  const weapon = weapons[0];
  const rows = godWeaponSkillRows(godWeaponSkillLevels, weapon).map(skillRow => {
    const buff = buffById(buffMap, config.healBuffBaseId + skillRow.level - 1);
    const healPer = buff.value?.[0]?.[3];
    if (typeof healPer !== 'number') fail(`buff ${buff.id} 缺少生命恢复比例`);
    return {
      level: skillRow.level,
      levelLabel: `${weapon.name} ${weapon.rank}阶 Lv.${skillRow.level}`,
      healPer
    };
  });
  const sleepBuff = buffById(buffMap, config.sleepBuffId);
  if (!Array.isArray(sleepBuff.attachBuff) || !sleepBuff.attachBuff.length) {
    fail(`花宴睡眠 buff ${sleepBuff.id} 缺少附加效果`);
  }
  return table('主动技能成长表', [
    { label: '立即恢复生命', value: row => `${pct(row.healPer)}最大生命` }
  ], rows, ACTIVE_NO_GROWTH_TEXT);
}

function buildCujuTable(weapons, godWeaponSkillLevels, skillLevels) {
  const config = GODWEAPON_EFFECT_CONFIG.cuju;
  if (weapons.length !== 1) fail(`蹴球神器等阶数量异常: ${weapons.length}`);
  const weapon = weapons[0];
  const [normalSkillId, chargedSkillId] = config.damageSkillIds;
  const normalRows = skillLevelRows(skillLevels, normalSkillId);
  const chargedRows = skillLevelRows(skillLevels, chargedSkillId);
  if (normalRows.length !== weapon.lvLimit) {
    fail(`蹴球普通旋转伤害等级数据数量异常: ${normalRows.length}/${weapon.lvLimit}`);
  }
  if (chargedRows.length !== weapon.lvLimit) {
    fail(`蹴球蓄力旋转伤害等级数据数量异常: ${chargedRows.length}/${weapon.lvLimit}`);
  }
  const labels = godWeaponSkillRows(godWeaponSkillLevels, weapon);
  const rows = normalRows.map((row, index) => {
    const charged = chargedRows[index];
    if (row.level !== charged.level) fail(`蹴球普通/蓄力等级不一致: ${row.level}/${charged.level}`);
    if (row.damageAddPer !== charged.damageAddPer || row.damageAddVal !== charged.damageAddVal) {
      fail(`蹴球 Lv.${row.level} 普通/蓄力伤害不一致`);
    }
    return {
      level: row.level,
      levelLabel: `${weapon.name} ${weapon.rank}阶 Lv.${labels[index].level}`,
      damage: formatDamage(row.damageAddPer, row.damageAddVal)
    };
  });
  return table('主动技能成长表', [
    { label: '旋转命中伤害', value: row => row.damage || '无' }
  ], rows, ACTIVE_NO_GROWTH_TEXT);
}

function buildQiqiuTable(weapons, godWeaponSkillLevels, buffMap) {
  const config = GODWEAPON_EFFECT_CONFIG.qiqiu;
  const rows = [];
  for (const weapon of weapons) {
    const liftBuffId = config.liftBuffIdsByRank[weapon.rank];
    const dodgeValueBuffId = config.dodgeValueBuffIdsByRank[weapon.rank];
    const dodgeRateBuffId = config.dodgeRateBuffIdsByRank[weapon.rank];
    if (!liftBuffId || !dodgeValueBuffId || !dodgeRateBuffId) fail(`${weapon.name} ${weapon.rank}阶缺少气球 buff 配置`);
    const liftBuff = buffById(buffMap, liftBuffId);
    const dodgeRateBuff = buffById(buffMap, dodgeRateBuffId);
    const liftSpeed = liftBuff.value?.spdY;
    const dodgeRate = dodgeRateBuff.value?.[0];
    if (typeof liftSpeed !== 'number') fail(`buff ${liftBuff.id} 缺少上浮速度`);
    if (typeof dodgeRate !== 'number') fail(`buff ${dodgeRateBuff.id} 缺少闪避率提升`);
    for (const skillRow of godWeaponSkillRows(godWeaponSkillLevels, weapon)) {
      const dodgeValueBuff = buffById(buffMap, dodgeValueBuffId + skillRow.level - 1);
      const dodgeValue = dodgeValueBuff.value?.[0];
      if (typeof dodgeValue !== 'number') fail(`buff ${dodgeValueBuff.id} 缺少闪避值提升`);
      rows.push({
        level: skillRow.level,
        levelLabel: `${weapon.name} ${weapon.rank}阶 Lv.${skillRow.level}`,
        liftSpeed,
        dodgeRate,
        dodgeValue
      });
    }
  }
  return table('主动技能成长表', [
    { label: '上浮速度', value: row => String(row.liftSpeed) },
    { label: '闪避值提升', value: row => pct(row.dodgeValue) }
  ], rows, ACTIVE_NO_GROWTH_TEXT);
}

function buildXuanhuaHonghuluTable(weapons, godWeaponSkillLevels, beskillMap) {
  if (weapons.length !== 1) fail(`宣花红葫芦神器等阶数量异常: ${weapons.length}`);
  const weapon = weapons[0];
  const rows = godWeaponSkillRows(godWeaponSkillLevels, weapon).map(skillRow => {
    if (typeof skillRow.beskillId !== 'number') fail(`宣花红葫芦 Lv.${skillRow.level} 缺少 beskill`);
    const beSkill = beSkillById(beskillMap, skillRow.beskillId);
    if (typeof beSkill.attribute !== 'number') fail(`beskill ${beSkill.id} 缺少捕捉成功率提升值`);
    return {
      level: skillRow.level,
      levelLabel: `${weapon.name} ${weapon.rank}阶 Lv.${skillRow.level}`,
      captureValue: trimNumber(beSkill.attribute, 3)
    };
  });
  return table('主动技能成长表', [
    { label: '捕捉成功率提升值', value: row => row.captureValue }
  ], rows, ACTIVE_NO_GROWTH_TEXT);
}

function buildActiveGrowthTable(groupId, weapons, ctx) {
  switch (groupId) {
    case 1:
      return buildLiuxieTable(weapons, ctx.godWeaponSkillLevels, ctx.buffMap);
    case 2:
      return buildYanxingluTable(weapons, ctx.godWeaponSkillLevels, ctx.skillLevels, ctx.monsterMap, ctx.skillMap, ctx.buffMap);
    case 3:
      return buildHuayanTable(weapons, ctx.godWeaponSkillLevels, ctx.buffMap);
    case 4:
      return buildCujuTable(weapons, ctx.godWeaponSkillLevels, ctx.skillLevels);
    case 5:
      return buildQiqiuTable(weapons, ctx.godWeaponSkillLevels, ctx.buffMap);
    case 6:
      return buildXuanhuaHonghuluTable(weapons, ctx.godWeaponSkillLevels, ctx.beskillMap);
    default:
      fail(`未知神器效果组: ${groupId}`);
  }
}

function extractGodWeaponEffect() {
  const godRows = u.loadTable('godWeapon');
  const skillRows = u.loadTable('godWeaponSkillLev');
  const skillLevels = u.loadTable('skillLevel');
  const monsterMap = new Map(u.loadTable('monster').map(row => [row.id, row]));
  const skillMap = new Map(u.loadTable('skill').map(row => [row.id, row]));
  const buffMap = new Map(u.loadTable('buff').map(row => [row.id, row]));
  const beskillMap = new Map(u.loadTable('beskill').map(row => [row.id, row]));
  const guideByGroupId = new Map(Object.values(GODWEAPON_EFFECT_CONFIG).map(guide => [guide.groupId, guide]));

  const groups = new Map();
  for (const weapon of godRows) {
    if (!ENABLED_EFFECT_GROUP_IDS.has(weapon.groupId)) continue;
    if (!groups.has(weapon.groupId)) groups.set(weapon.groupId, []);
    groups.get(weapon.groupId).push(weapon);
  }

  const ctx = { godWeaponSkillLevels: skillRows, skillLevels, monsterMap, skillMap, buffMap, beskillMap };
  const effects = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([groupId, weapons]) => {
    weapons.sort((a, b) => a.rank - b.rank);
    const guide = guideByGroupId.get(groupId);
    if (!guide) fail(`缺少神器组 ${groupId} 的效果说明`);
    const baseWeapon = weapons[0];
    const { skill, skillIds } = getPrimarySkill(baseWeapon, monsterMap, skillMap);
    const battleConfigs = weapons.map(weapon => {
      const { monster } = getPrimarySkill(weapon, monsterMap, skillMap);
      return findBattleConfig(monster.id);
    });
    const activeTexts = typeof guide.active === 'function' ? guide.active(ctx, weapons) : guide.active;
    if (!Array.isArray(activeTexts)) fail(`神器组 ${groupId} 主动说明必须是数组`);
    const activeDescription = [...activeTexts, cooldownText(skill.cd), energyText(baseWeapon)];
    return {
      id: baseWeapon.id,
      name: baseWeapon.name,
      groupId,
      rankCount: weapons.length,
      ranks: weapons.map(weapon => ({ id: weapon.id, name: weapon.name, rank: weapon.rank, lvLimit: weapon.lvLimit })),
      monsterId: baseWeapon.monsterId,
      summary: guide.summary,
      tags: guide.tags,
      cooldown: { base: skill.cd, display: formatSeconds(skill.cd) },
      mechanism: {
        active: activeDescription,
        soul: ['当前配置没有神器器魂被动数据。']
      },
      activeGrowthTable: buildActiveGrowthTable(groupId, weapons, ctx),
      soulGrowthTable: { title: '神器附加成长表', columns: [], rows: [], emptyText: EXTRA_NO_GROWTH_TEXT },
      evidence: { skillIds, battleConfigs }
    };
  });

  u.saveOutput('role_godweapon_effect', effects, {
    system: '角色 → 神器系统 → 神器效果',
    source: 'godWeapon / godWeaponSkillLev / monster / skill / skillLevel / buff / battle-config',
    note: '玩家向神器主动技能说明；表格仅展示随神器等级或等阶成长的数值，固定机制写在说明区。'
  });
}

// ━━━ 神器解锁 ━━━ godWeapon.*.json ━━━━━━━━━━━━━━━━
function extractGodWeaponUnlock() {
  const raw = u.loadTable('godWeapon');
  const result = raw.filter(r => r.activationValue).map(r => ({
    id: r.id, name: r.name,
    activationValue: u.parseCost(r.activationValue),
    rankCost: u.parseCost(r.rankCost),
    rank: r.rank
  }));
  u.saveOutput('role_godweapon_unlock', result, {
    system: '角色 → 神器系统 → 解锁',
    source: 'godWeapon.*.json',
    costType: '核心道具 activationValue:[[itemId,count],...] + 进阶 rankCost',
    dedup: '每种神器一条记录'
  });
}

// ━━━ 神器升级/进阶 ━━━ godWeaponLev.*.json ━━━━━━━━
function extractGodWeaponLev() {
  const raw = u.loadTable('godWeaponLev');
  // 从 godWeapon 表建立 typeId -> {name, rank} 的映射
  const gwMap = {};
  for (const gw of u.loadTable('godWeapon')) gwMap[gw.id] = { name: gw.name, rank: gw.rank };

  // 按神器种类分组 (id前缀区分)
  const groups = {};
  for (const r of raw) {
    // id 格式: 前几位=typeId (神器id), 后2位=等级
    const typeId = Math.floor(r.id / 100);
    if (!groups[typeId]) {
      const meta = gwMap[typeId] || { name: `未知(${typeId})`, rank: null };
      groups[typeId] = { typeId, name: meta.name, rank: meta.rank, levels: [] };
    }
    groups[typeId].levels.push({
      lv: r.lv,
      lvDeduct: u.parseCost(r.lvDeduct),
      consumeDeduct: u.parseCost(r.consumeDeduct)
    });
  }
  u.saveOutput('role_godweapon_lev', Object.values(groups), {
    system: '角色 → 神器系统 → 升级/进阶',
    source: 'godWeaponLev.*.json',
    costType: '专属核心(lvDeduct:[[601001,count]]) + 点券(consumeDeduct:[[1,count]])',
    dedup: '按神器种类分组, 每种10级'
  });
}

function extract() {
  console.log('\n📦 角色 → 神器系统');
  extractGodWeaponUnlock();
  extractGodWeaponLev();
  extractGodWeaponEffect();
}

if (require.main === module) extract();
module.exports = extract;
