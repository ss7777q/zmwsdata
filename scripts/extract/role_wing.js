/**
 * 角色 -> 翅膀系统
 * 提取叶子: 翅膀升级, 翅膀技能, 羽毛洗练, 羽毛进阶, 羽毛强运
 */
const fs = require('fs');
const path = require('path');
const u = require('../lib/utils');

const FRAME_RATE = 30;
const SKILL_LEVEL_COUNT = 10;
const REPRESENTATIVE_PLAYER_CFG = path.join(
  u.ROOT,
  'file',
  'battle-config',
  'entityCtg',
  '01-monster_cfg_wk.json'
);
const BULLETS_FILE = path.join(u.ROOT, 'file', 'battle-config', 'bullets.json');

function loadActiveFeathers() {
  return u.loadTable('feather').filter((row) => !row.cancel);
}

function loadJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function toMap(rows, tableName) {
  const map = new Map();
  for (const row of rows) {
    if (!row || typeof row.id !== 'number') continue;
    if (map.has(row.id)) continue;
    map.set(row.id, row);
  }
  return map;
}

function requireRow(map, id, label) {
  const row = map.get(id);
  if (!row) throw new Error(`${label} 缺少配置 id=${id}`);
  return row;
}

function requireNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} 缺少有效数值`);
  }
  return value;
}

function parseUpLimit(limit) {
  if (!Array.isArray(limit)) return null;
  return limit.map((it) => ({
    type: it[0],
    values: Array.isArray(it[1]) ? it[1] : [it[1]]
  }));
}

function roleLevelRequired(limit) {
  if (!Array.isArray(limit)) return null;
  for (const it of limit) {
    if (it[0] === 1 && Array.isArray(it[1]) && typeof it[1][0] === 'number') {
      return it[1][0];
    }
  }
  return null;
}

function sameValue(values) {
  if (!values.length) return true;
  const first = JSON.stringify(values[0]);
  return values.every((value) => JSON.stringify(value) === first);
}

function trimNumber(value, digits = 3) {
  const fixed = Number(value.toFixed(digits));
  return Number.isInteger(fixed) ? String(fixed) : String(fixed);
}

function formatFramesAsSeconds(frames) {
  requireNumber(frames, '帧数');
  const seconds = frames / FRAME_RATE;
  return `${trimNumber(seconds)}秒`;
}

function formatPercent(value) {
  requireNumber(value, '百分比');
  return `${trimNumber(Math.abs(value) * 100, 2)}%`;
}

function sumNumbers(values) {
  return values.reduce((acc, value) => acc + requireNumber(value, '数值'), 0);
}

function makeTable(title, columns, rows, emptyText = '该项没有随等级变化的数值。') {
  return { title, columns, rows, emptyText };
}

function levelRowsFromSkill(skillLevelById, skillId, label) {
  const rows = [];
  for (let level = 1; level <= SKILL_LEVEL_COUNT; level += 1) {
    rows.push(requireRow(skillLevelById, skillId * 1000 + level, `${label} Lv.${level}`));
  }
  return rows;
}

function buffSeries(buffById, startId, label) {
  const rows = [];
  for (let index = 0; index < SKILL_LEVEL_COUNT; index += 1) {
    rows.push(requireRow(buffById, startId + index, `${label} Lv.${index + 1}`));
  }
  return rows;
}

function collectHitBuffIds(bullet) {
  const ids = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.hitBuff)) ids.push(...node.hitBuff);
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    for (const value of Object.values(node)) walk(value);
  };
  walk(bullet.com);
  return [...new Set(ids)];
}

function getBulletHitProfile(bullet) {
  const hitComs = Array.isArray(bullet.com) ? bullet.com.filter((com) => com.type === 1) : [];
  if (!hitComs.length) {
    return { hitCount: 0, hitInterval: null, hitBuffIds: collectHitBuffIds(bullet) };
  }
  return {
    hitCount: hitComs.reduce((acc, com) => acc + (com.maxHit || 1), 0),
    hitInterval: hitComs.find((com) => typeof com.hitInteval === 'number')?.hitInteval ?? null,
    hitBuffIds: collectHitBuffIds(bullet)
  };
}

function buildContext() {
  const tables = {
    wing: u.loadTable('wing'),
    wingSkill: u.loadTable('wingSkill'),
    beskill: u.loadTable('beskill'),
    buff: u.loadTable('buff'),
    skill: u.loadTable('skill'),
    skillLevel: u.loadTable('skillLevel')
  };
  const bullets = loadJsonFile(BULLETS_FILE);
  return {
    ...tables,
    wingById: toMap(tables.wing, 'wing'),
    wingSkillById: toMap(tables.wingSkill, 'wingSkill'),
    beskillById: toMap(tables.beskill, 'beskill'),
    buffById: toMap(tables.buff, 'buff'),
    skillById: toMap(tables.skill, 'skill'),
    skillLevelById: toMap(tables.skillLevel, 'skillLevel'),
    bulletById: toMap(bullets, 'bullets'),
    playerCfg: loadJsonFile(REPRESENTATIVE_PLAYER_CFG)
  };
}

function wingSkillRowsFor(wing, context) {
  const wingSkillId = wing.wingSkill?.[0];
  if (typeof wingSkillId !== 'number') {
    throw new Error(`${wing.name} 缺少 wingSkill 配置`);
  }
  const rows = context.wingSkill
    .filter((row) => row.wingSkill === wingSkillId)
    .sort((left, right) => left.level - right.level);
  if (rows.length !== SKILL_LEVEL_COUNT) {
    throw new Error(`${wing.name} wingSkill=${wingSkillId} 等级配置不是 ${SKILL_LEVEL_COUNT} 条`);
  }
  return rows;
}

function firstBeSkill(rows, context, label) {
  const id = rows[0].beSkill?.[0];
  if (typeof id !== 'number') throw new Error(`${label} 缺少 beSkill`);
  return requireRow(context.beskillById, id, `${label} beSkill`);
}

function actionBullets(skill, context, label) {
  const action = context.playerCfg[skill.entityAction];
  if (!action || !Array.isArray(action.com)) {
    throw new Error(`${label} 缺少战斗动作 ${skill.entityAction}`);
  }
  return action.com
    .filter((entry) => entry.type === 2 && typeof entry.bId === 'number')
    .map((entry) => requireRow(context.bulletById, entry.bId, `${label} 子弹`));
}

function buildBaseLevels(rows) {
  return rows.map((row) => ({
    level: row.level,
    wingSkillRowId: row.id,
    beSkillIds: row.beSkill || [],
    nextCost: u.parseCost(row.nextCost),
    upLimit: parseUpLimit(row.upLimit)
  }));
}

function buildThreeJumpEffect(wing, rows, context, options) {
  const trigger = firstBeSkill(rows, context, options.skillName);
  if (trigger.label !== 'threeJumpSkill') {
    throw new Error(`${options.skillName} 预期为三段跳技能，实际 label=${trigger.label}`);
  }
  const skillId = trigger.attribute?.skillId;
  const skill = requireRow(context.skillById, skillId, `${options.skillName} skill`);
  const levelRows = levelRowsFromSkill(context.skillLevelById, skillId, options.skillName);
  const bullets = actionBullets(skill, context, options.skillName);
  const damageBullet = options.damageBulletId
    ? requireRow(context.bulletById, options.damageBulletId, `${options.skillName} 伤害子弹`)
    : bullets.find((bullet) => getBulletHitProfile(bullet).hitCount > 0);
  if (!damageBullet) throw new Error(`${options.skillName} 缺少命中子弹`);
  const hitProfile = getBulletHitProfile(damageBullet);
  if (hitProfile.hitCount <= 0) throw new Error(`${options.skillName} 子弹缺少命中次数`);

  const damagePers = levelRows.map((row) => requireNumber(row.damageAddPer, `${options.skillName} damageAddPer`));
  const addDefendVals = levelRows.map((row) => requireNumber(row.addDefendVal, `${options.skillName} addDefendVal`));
  if (!sameValue(damagePers)) throw new Error(`${options.skillName} 伤害系数出现等级变化，需要单独进表`);
  if (!sameValue(addDefendVals)) throw new Error(`${options.skillName} 保护分出现等级变化，需要单独进表`);

  const fixedMechanism = [
    { label: '触发方式', value: '二段跳后再次按跳跃键，触发翅膀技能' },
    { label: '冷却时间', value: formatFramesAsSeconds(trigger.cd) },
    { label: '命中次数', value: options.hitText || `${hitProfile.hitCount} 次` },
    { label: '伤害公式', value: `每次命中造成攻击 ${formatPercent(damagePers[0])} + 固定伤害` },
    { label: '保护分', value: `${addDefendVals[0]} 点` }
  ];
  if (options.extraFixed) fixedMechanism.push(...options.extraFixed({ skill, bullets, damageBullet, hitProfile }));

  const sections = [
    {
      title: '触发与命中',
      paragraphs: options.triggerParagraphs({ trigger, skill, bullets, damageBullet, hitProfile })
    },
    {
      title: '伤害与升级',
      paragraphs: options.damageParagraphs({ levelRows, trigger, skill, bullets, damageBullet, hitProfile })
    }
  ];

  const growthRows = levelRows.map((row, index) => ({
    level: index + 1,
    values: [String(row.damageAddVal)]
  }));
  const growthTables = [
    makeTable(`${options.skillName}等级成长属性表`, ['固定伤害'], growthRows)
  ];

  return {
    name: rows[0].desName,
    summary: options.summary({ trigger, skill, bullets, damageBullet, hitProfile }),
    tags: options.tags,
    cooldown: { display: `冷却 ${formatFramesAsSeconds(trigger.cd)}`, frames: trigger.cd, seconds: trigger.cd / FRAME_RATE },
    sections,
    fixedMechanism,
    growthTables,
    levels: buildBaseLevels(rows)
  };
}

function buildYanxingEffect(wing, rows, context) {
  const playerAction = context.playerCfg.jump4;
  const moveEntries = playerAction.com.filter((entry) => entry.type === 95);
  const totalMove = sumNumbers(moveEntries.map((entry) => entry.xDis));
  const totalFrames = sumNumbers(moveEntries.map((entry) => entry.time));
  return buildThreeJumpEffect(wing, rows, context, {
    skillName: '燕行',
    tags: ['三段跳', '前冲伤害', '固定伤害成长'],
    summary: ({ trigger }) => `二段跳后再次跳跃向前疾冲并造成 1 次伤害，冷却 ${formatFramesAsSeconds(trigger.cd)}。升级只提升固定伤害值。`,
    triggerParagraphs: ({ trigger }) => [
      `燕行在二段跳后再次按跳跃键触发，触发后进入 ${formatFramesAsSeconds(trigger.cd)} 冷却。`,
      `技能配置为三段前冲，共 ${totalFrames} 帧位移，横向配置距离合计 ${totalMove}。前冲期间生成 1 次命中判定。`
    ],
    damageParagraphs: ({ levelRows }) => [
      `命中造成攻击 ${formatPercent(levelRows[0].damageAddPer)} + 固定伤害，并附带 ${levelRows[0].addDefendVal} 点保护分。`,
      '升级只提高固定伤害值；伤害系数、保护分、触发方式和命中次数不随等级变化。'
    ],
    extraFixed: () => [
      { label: '前冲配置', value: `${totalFrames} 帧位移，横向配置距离 ${totalMove}` }
    ]
  });
}

function buildLunhuiEffect(wing, rows, context) {
  const beSkills = rows.map((row) => requireRow(context.beskillById, row.beSkill[0], `轮回 Lv.${row.level}`));
  for (const beSkill of beSkills) {
    if (beSkill.label !== 'releaseSkillBkHp1') {
      throw new Error(`轮回 beSkill=${beSkill.id} 预期 releaseSkillBkHp1，实际 ${beSkill.label}`);
    }
  }
  const baseId = beSkills[0].attribute?.[0];
  const baseValues = beSkills.map((beSkill, index) => {
    if (beSkill.attribute?.[0] !== baseId) throw new Error(`轮回 Lv.${index + 1} 回血基准 id 不一致`);
    return requireNumber(beSkill.attribute?.[1], `轮回 Lv.${index + 1} 回血基准值`);
  });

  return {
    name: rows[0].desName,
    summary: '释放技能后恢复生命；实际回血量会同时受到被释放技能等级、技能动作时长和轮回等级影响。',
    tags: ['技能回血', '无额外冷却', '动作时长换算'],
    cooldown: { display: '无额外冷却', frames: 0, seconds: 0 },
    sections: [
      {
        title: '触发与取档',
        paragraphs: [
          '轮回在角色成功释放技能后结算一次回血，本身没有额外冷却。',
          '回血先按“被释放技能等级 ÷ 2 向下取整”取档，最低按 1 档，最高不超过当前轮回等级。'
        ]
      },
      {
        title: '回血公式',
        paragraphs: [
          '最终回血量 = 向上取整（回血基准值 × 被释放技能动作时长 × 2.4）。技能动作时长来自实际释放技能的动作帧数，配置按每帧约 0.033 秒换算。',
          '升级提高当前轮回等级允许使用的最高回血基准值；同一个轮回等级下，释放技能等级较低时仍可能按更低档回血。'
        ]
      }
    ],
    fixedMechanism: [
      { label: '触发方式', value: '释放技能后恢复生命' },
      { label: '额外冷却', value: '无' },
      { label: '取档规则', value: 'floor(释放技能等级 / 2)，最低 1 档，最高不超过当前轮回等级' },
      { label: '回血公式', value: '向上取整（回血基准值 × 技能动作时长 × 2.4）' }
    ],
    growthTables: [
      makeTable('轮回等级成长属性表', ['回血基准值'], baseValues.map((value, index) => ({
        level: index + 1,
        values: [String(value)]
      })))
    ],
    levels: buildBaseLevels(rows)
  };
}

function buildGuwuEffect(wing, rows, context) {
  const effectBeSkill = requireRow(context.beskillById, rows[0].beSkill[0], '鼓舞常驻表现');
  const campBeSkills = rows.map((row) => requireRow(context.beskillById, row.beSkill[1], `鼓舞 Lv.${row.level}`));
  if (effectBeSkill.label !== 'effect') throw new Error('鼓舞缺少常驻表现 effect');
  for (const beSkill of campBeSkills) {
    if (beSkill.label !== 'campBuff') throw new Error(`鼓舞 ${beSkill.id} 预期 campBuff，实际 ${beSkill.label}`);
  }

  const moveBaseId = campBeSkills[0].attribute?.[0];
  const critBaseId = campBeSkills[0].attribute?.[1];
  const moveBuffs = rows.map((row) => context.buffById.get(moveBaseId + row.level - 1) || requireRow(context.buffById, moveBaseId, `鼓舞移速 Lv.${row.level}`));
  const critBuffs = buffSeries(context.buffById, critBaseId, '鼓舞暴击');
  const moveRates = moveBuffs.map((buff) => requireNumber(buff.value?.[0], `${buff.name} 移速`));
  const durations = moveBuffs.map((buff) => requireNumber(buff.time, `${buff.name} 持续时间`));
  const critDurations = critBuffs.map((buff) => requireNumber(buff.time, `${buff.name} 持续时间`));
  if (!sameValue(moveRates)) throw new Error('鼓舞移速出现等级变化，需要单独进表');
  if (!sameValue(durations) || !sameValue(critDurations) || durations[0] !== critDurations[0]) {
    throw new Error('鼓舞持续时间出现不一致，需要单独说明');
  }

  return {
    name: rows[0].desName,
    summary: `自己和友方单位获得移动速度与暴击提升；移速固定提升 ${formatPercent(moveRates[0])}，升级提高暴击值。`,
    tags: ['己方增益', '移动速度', '暴击成长'],
    cooldown: { display: '常驻刷新', frames: 0, seconds: 0 },
    sections: [
      {
        title: '影响目标',
        paragraphs: [
          '鼓舞会给自己、队友以及友方召唤物和宠物施加增益。',
          `增益持续 ${formatFramesAsSeconds(durations[0])}；配置为无冷却循环触发，战斗中会周期性补上该增益。`
        ]
      },
      {
        title: '升级变化',
        paragraphs: [
          `移动速度提升固定为 ${formatPercent(moveRates[0])}，不随等级变化。`,
          '升级只提高暴击值；暴击增益的持续时间、影响目标和刷新方式不随等级变化。'
        ]
      }
    ],
    fixedMechanism: [
      { label: '影响目标', value: '自己、队友、友方召唤物、友方宠物' },
      { label: '移动速度', value: `提升 ${formatPercent(moveRates[0])}` },
      { label: '持续时间', value: formatFramesAsSeconds(durations[0]) },
      { label: '刷新方式', value: '无冷却循环补增益' }
    ],
    growthTables: [
      makeTable('鼓舞等级成长属性表', ['暴击值提升'], critBuffs.map((buff, index) => ({
        level: index + 1,
        values: [String(requireNumber(buff.value?.[1], `${buff.name} 暴击值`))]
      })))
    ],
    levels: buildBaseLevels(rows)
  };
}

function buildHexingEffect(wing, rows, context) {
  const effect = buildThreeJumpEffect(wing, rows, context, {
    skillName: '鹤形',
    damageBulletId: 1738,
    tags: ['三段跳', '俯冲伤害', '减疗成长'],
    summary: ({ trigger }) => `二段跳后再次跳跃向斜下方俯冲，造成 1 次伤害并附加 10 秒减疗，冷却 ${formatFramesAsSeconds(trigger.cd)}。`,
    triggerParagraphs: ({ trigger, damageBullet }) => [
      `鹤形在二段跳后再次按跳跃键触发，触发后进入 ${formatFramesAsSeconds(trigger.cd)} 冷却。`,
      `俯冲会生成 1 次命中判定，命中范围来自 ${damageBullet.defaultRect ? '俯冲子弹配置' : '战斗配置'}。`
    ],
    damageParagraphs: ({ levelRows }) => [
      `直接命中造成攻击 ${formatPercent(levelRows[0].damageAddPer)} + 固定伤害，并附带 ${levelRows[0].addDefendVal} 点保护分。`,
      '命中目标后附加减疗，减疗幅度随技能等级成长；直接伤害的固定伤害也随等级成长。'
    ],
    extraFixed: () => [
      { label: '俯冲动作', value: '向斜下方俯冲，配置下冲时间 10 帧' }
    ]
  });
  const burnBuffIds = getBulletHitProfile(requireRow(context.bulletById, 1738, '鹤形子弹')).hitBuffIds;
  const healDebuffStart = burnBuffIds[0];
  if (typeof healDebuffStart !== 'number') throw new Error('鹤形缺少减疗 buff');
  const healDebuffs = buffSeries(context.buffById, healDebuffStart, '鹤形减疗');
  const duration = requireNumber(healDebuffs[0].time, '鹤形减疗持续时间');
  if (!sameValue(healDebuffs.map((buff) => buff.time))) throw new Error('鹤形减疗持续时间出现等级变化，需要单独进表');

  effect.sections[1].paragraphs.push(`减疗持续 ${formatFramesAsSeconds(duration)}，Lv.1 为 ${formatPercent(healDebuffs[0].value[0])}，Lv.10 为 ${formatPercent(healDebuffs[9].value[0])}。`);
  effect.fixedMechanism.push({ label: '减疗持续', value: formatFramesAsSeconds(duration) });
  effect.growthTables[0] = makeTable('鹤形等级成长属性表', ['固定伤害', '减疗幅度'], levelRowsFromSkill(context.skillLevelById, 103, '鹤形').map((row, index) => ({
    level: index + 1,
    values: [String(row.damageAddVal), formatPercent(healDebuffs[index].value[0])]
  })));
  return effect;
}

function buildLongyanEffect(wing, rows, context) {
  const effect = buildThreeJumpEffect(wing, rows, context, {
    skillName: '龙焰',
    damageBulletId: 1869,
    tags: ['三段跳', '多段火焰', '灼烧成长'],
    hitText: '同一目标最多 3 次',
    summary: ({ trigger }) => `二段跳后再次跳跃短暂滞空并向斜下方喷火，火焰最多命中 3 次并附加 10 秒灼烧，冷却 ${formatFramesAsSeconds(trigger.cd)}。`,
    triggerParagraphs: ({ trigger, hitProfile }) => [
      `龙焰在二段跳后再次按跳跃键触发，触发后进入 ${formatFramesAsSeconds(trigger.cd)} 冷却。`,
      `技能先短暂停留，再向斜下方喷出火焰；伤害子弹对同一目标最多命中 ${hitProfile.hitCount} 次，命中间隔 ${trimNumber(hitProfile.hitInterval)} 秒。`
    ],
    damageParagraphs: ({ levelRows, hitProfile }) => [
      `每次直接命中造成攻击 ${formatPercent(levelRows[0].damageAddPer)} + 固定伤害，并附带 ${levelRows[0].addDefendVal} 点保护分。`,
      `若同一目标吃满 ${hitProfile.hitCount} 次直接命中，直接伤害按 ${hitProfile.hitCount} 次分别结算。`
    ],
    extraFixed: ({ hitProfile }) => [
      { label: '滞空时间', value: '10 帧' },
      { label: '直接命中', value: `同一目标最多 ${hitProfile.hitCount} 次，间隔 ${trimNumber(hitProfile.hitInterval)} 秒` }
    ]
  });
  const hitBuffIds = getBulletHitProfile(requireRow(context.bulletById, 1869, '龙焰伤害子弹')).hitBuffIds;
  const burnStart = hitBuffIds[0];
  if (typeof burnStart !== 'number') throw new Error('龙焰缺少灼烧 buff');
  const burnBuffs = buffSeries(context.buffById, burnStart, '龙焰灼烧');
  const duration = requireNumber(burnBuffs[0].time, '龙焰灼烧持续时间');
  const interval = requireNumber(burnBuffs[0].interval, '龙焰灼烧间隔');
  const burnPers = burnBuffs.map((buff) => requireNumber(buff.value?.[0]?.[0], `${buff.name} 灼烧系数`));
  if (!sameValue(burnBuffs.map((buff) => buff.time))) throw new Error('龙焰灼烧持续时间出现等级变化，需要单独进表');
  if (!sameValue(burnBuffs.map((buff) => buff.interval))) throw new Error('龙焰灼烧间隔出现等级变化，需要单独进表');
  if (!sameValue(burnPers)) throw new Error('龙焰灼烧系数出现等级变化，需要单独进表');

  effect.sections[1].paragraphs.push(`灼烧持续 ${formatFramesAsSeconds(duration)}，每 ${formatFramesAsSeconds(interval)} 结算一次；每次灼烧造成攻击 ${formatPercent(burnPers[0])} + 灼烧固定伤害。`);
  effect.fixedMechanism.push(
    { label: '灼烧持续', value: formatFramesAsSeconds(duration) },
    { label: '灼烧间隔', value: formatFramesAsSeconds(interval) },
    { label: '灼烧系数', value: `每次攻击 ${formatPercent(burnPers[0])}` }
  );
  effect.growthTables[0] = makeTable('龙焰等级成长属性表', ['直接固定伤害/次', '灼烧固定伤害/秒'], levelRowsFromSkill(context.skillLevelById, 104, '龙焰').map((row, index) => ({
    level: index + 1,
    values: [
      String(row.damageAddVal),
      String(Math.abs(requireNumber(burnBuffs[index].value?.[0]?.[1], `${burnBuffs[index].name} 灼烧固定伤害`)))
    ]
  })));
  return effect;
}

function buildGuidunEffect(wing, rows, context) {
  const beSkills = rows.map((row) => requireRow(context.beskillById, row.beSkill[0], `龟盾 Lv.${row.level}`));
  const shieldBuffs = beSkills.map((beSkill, index) => {
    if (beSkill.label !== 'buff') throw new Error(`龟盾 Lv.${index + 1} 预期 buff，实际 ${beSkill.label}`);
    const buffId = beSkill.attribute?.[0];
    return requireRow(context.buffById, buffId, `龟盾 Lv.${index + 1} 护盾 buff`);
  });
  const cooldowns = beSkills.map((beSkill) => requireNumber(beSkill.cd, `${beSkill.name} 冷却`));
  const durations = shieldBuffs.map((buff) => requireNumber(buff.time, `${buff.name} 持续`));
  const hpPers = shieldBuffs.map((buff) => requireNumber(buff.value?.[3], `${buff.name} 最大生命比例`));
  if (!sameValue(cooldowns)) throw new Error('龟盾冷却出现等级变化，需要单独进表');
  if (!sameValue(durations)) throw new Error('龟盾持续时间出现等级变化，需要单独进表');
  if (!sameValue(hpPers)) throw new Error('龟盾最大生命比例出现等级变化，需要单独进表');

  return {
    name: rows[0].desName,
    summary: `背后防御专属护盾。角色入场后可立即获得，护盾被击碎或自然到期后，经过 ${formatFramesAsSeconds(cooldowns[0])} 冷却重新生成。`,
    tags: ['背后防卫', '循环生成', '单向护盾'],
    cooldown: {
      display: `冷却 ${formatFramesAsSeconds(cooldowns[0])} / 持续 ${formatFramesAsSeconds(durations[0])}`,
      frames: cooldowns[0],
      seconds: cooldowns[0] / FRAME_RATE
    },
    sections: [
      {
        title: '伤害抵挡与判定',
        paragraphs: [
          '龟盾只在攻击来源位于角色后方时生效。正面攻击不会消耗龟盾。',
          '背后攻击命中时先扣龟盾。护盾未被打穿时，本次剩余伤害为 0；护盾被打穿后，剩余伤害继续进入其他护盾与扣血结算。',
          `护盾值 = 向上取整（固定护盾值 + 最大生命 × ${formatPercent(hpPers[0])}）。`
        ]
      },
      {
        title: '生成与升级',
        paragraphs: [
          `龟盾为周期性自动生成，入场无初始冷却；已有龟盾时不会提前扣下一轮冷却。`,
          `龟盾持续 ${formatFramesAsSeconds(durations[0])}，破裂或自然消失后才开始计算 ${formatFramesAsSeconds(cooldowns[0])} 冷却。`,
          '升级只提高固定护盾值；最大生命比例、持续时间、冷却和背后判定规则不随等级变化。'
        ]
      }
    ],
    fixedMechanism: [
      { label: '触发方式', value: '周期性自动生成护盾' },
      { label: '初始触发', value: '入场立即生效（无初始冷却）' },
      { label: '冷却规则', value: `护盾破裂或消失后进入 ${formatFramesAsSeconds(cooldowns[0])}冷却` },
      { label: '持续时间', value: formatFramesAsSeconds(durations[0]) },
      { label: '生效方向', value: '仅抵挡来自背后的攻击' },
      { label: '护盾公式', value: `固定护盾值 + 最大生命 × ${formatPercent(hpPers[0])}（向上取整）` },
      { label: '叠加规则', value: '不叠加；护盾存在时不重复刷新且不计冷却' },
      { label: '阵亡处理', value: '角色死亡后护盾消失' }
    ],
    growthTables: [
      makeTable('龟盾等级成长属性表', ['固定护盾值'], shieldBuffs.map((buff, index) => ({
        level: index + 1,
        values: [String(requireNumber(buff.value?.[1], `${buff.name} 固定护盾值`))]
      })))
    ],
    levels: buildBaseLevels(rows)
  };
}

function buildWingSkillEffect(wing, rows, context) {
  const builders = {
    1: buildYanxingEffect,
    2: buildLunhuiEffect,
    3: buildGuwuEffect,
    4: buildHexingEffect,
    5: buildLongyanEffect,
    6: buildGuidunEffect
  };
  const wingSkillId = wing.wingSkill[0];
  const builder = builders[wingSkillId];
  if (!builder) throw new Error(`${wing.name} wingSkill=${wingSkillId} 尚未接入解析器`);
  const effect = builder(wing, rows, context);
  return {
    buteId: wing.buteId,
    wingId: wing.id,
    wingName: wing.name,
    wingSkill: wingSkillId,
    skillName: rows[0].desName,
    officialIntro: rows[0].desIntro,
    warnings: [],
    ...effect
  };
}

// ━━━ 翅膀升级 ━━━ wingAttribute.*.json ━━━━━━━━━━━━━━
function extractWingUpgrade() {
  const raw = u.loadTable('wingAttribute');
  const allWingRows = loadJsonFile(u.findTableFile('wing'));
  const activeWingNameByButeId = new Map();
  const inactiveWingButeIds = new Set();
  const allWingButeIds = new Set();
  const wings = {};

  for (const row of allWingRows) {
    if (typeof row.buteId !== 'number') {
      throw new Error(`Invalid wing buteId for ${row.name || row.id}`);
    }
    if (allWingButeIds.has(row.buteId)) {
      throw new Error(`Duplicate wing buteId ${row.buteId}`);
    }
    allWingButeIds.add(row.buteId);
    if (u.isInactiveDataApiRow(row)) {
      inactiveWingButeIds.add(row.buteId);
    } else {
      activeWingNameByButeId.set(row.buteId, row.name);
    }
  }

  for (const r of raw) {
    if (inactiveWingButeIds.has(r.buteId)) continue;
    const wingName = activeWingNameByButeId.get(r.buteId);
    if (!wingName) {
      throw new Error(`wingAttribute references missing active wing buteId ${r.buteId}`);
    }
    if (!wings[r.buteId]) {
      wings[r.buteId] = { buteId: r.buteId, wingName, levels: [] };
    }
    wings[r.buteId].levels.push({
      wingLevel: r.wingLevel,
      quality: r.quality,
      consume: r.consume ? {
        itemId: r.consume[0],
        name: u.itemName(r.consume[0]),
        count: r.consume[1]
      } : null,
      roleLevelRequired: roleLevelRequired(r.upLimit),
      upLimit: parseUpLimit(r.upLimit),
      attribute: r.attribute,
      attributeValue: r.attributeValue
    });
  }
  u.saveOutput('role_wing_upgrade', Object.values(wings), {
    system: '角色 -> 翅膀系统 -> 翅膀 -> 升级',
    source: 'wingAttribute.*.json',
    costType: '专属翅膀道具 consume:[itemId, count]',
    dedup: '有效翅膀主表对应的升级配置, 不导出 close/cancel 翅膀',
    note: 'roleLevelRequired 来自 upLimit 中 type=1 条件'
  });
}

// ━━━ 翅膀技能 ━━━ wingSkill.*.json + 运行时机制 ━━━━━━
function extractWingSkill() {
  const context = buildContext();
  const wings = context.wing
    .filter((wing) => Array.isArray(wing.wingSkill) && wing.wingSkill.length > 0)
    .sort((left, right) => left.id - right.id);
  const result = wings.map((wing) => buildWingSkillEffect(wing, wingSkillRowsFor(wing, context), context));
  u.saveOutput('role_wing_skill', result, {
    system: '角色 -> 翅膀系统 -> 翅膀 -> 技能解析',
    source: 'wing.*.json, wingSkill.*.json, beskill.*.json, buff.*.json, skill.*.json, skillLevel.*.json, file/battle-config',
    note: '面向玩家的翅膀技能机制说明；固定项写入描述，等级成长项写入 growthTables'
  });
}

// ━━━ 羽毛洗练 ━━━ feather.*.json (baptize字段) ━━━━━━
function extractFeatherBaptize() {
  const raw = loadActiveFeathers();
  const result = raw.map((r) => ({
    id: r.id,
    name: r.name,
    quality: r.quality,
    allBaptizeCost: u.parseCost(r.allBaptizeCost),
    valueBaptizeCost: u.parseCost(r.valueBaptizeCost),
    fixedCost: u.parseCost(r.fixedCost),
    valuefixedCost: u.parseCost(r.valuefixedCost),
    typeBaptizeCost: u.parseCost(r.typeBaptizeCost),
    typefixedCost: u.parseCost(r.typefixedCost)
  }));
  u.saveOutput('role_feather_baptize', result, {
    system: '角色 -> 翅膀系统 -> 羽毛 -> 洗练',
    source: 'feather.*.json',
    costType: '羽枝(501000) - allBaptizeCost/valueBaptizeCost等',
    dedup: '按品质(quality)递增'
  });
}

// ━━━ 羽毛进阶 ━━━ feather.*.json (nextCost字段) ━━━━━
function extractFeatherAdvance() {
  const raw = loadActiveFeathers();
  const result = raw.filter((r) => r.nextCost).map((r) => ({
    id: r.id,
    name: r.name,
    quality: r.quality,
    nextId: r.nextId,
    nextLimit: r.nextLimit,
    nextCost: u.parseCost(r.nextCost),
    moneyCost: u.parseCost(r.moneyCost)
  }));
  u.saveOutput('role_feather_advance', result, {
    system: '角色 -> 翅膀系统 -> 羽毛 -> 进阶',
    source: 'feather.*.json',
    costType: '进阶消耗(nextCost:羽丝) + 羽魂(moneyCost)',
    dedup: '按品质等级递增'
  });
}

// ━━━ 羽毛强运 ━━━ feather.*.json (*Luck字段) ━━━━━━━━
function extractFeatherLuck() {
  const raw = loadActiveFeathers();
  const result = raw.filter((r) =>
    r.allBaptizeCostLuck || r.valueBaptizeCostLuck ||
    r.fixedCostLuck || r.valuefixedCostLuck
  ).map((r) => ({
    id: r.id,
    name: r.name,
    quality: r.quality,
    allBaptizeCostLuck: u.parseCost(r.allBaptizeCostLuck),
    valueBaptizeCostLuck: u.parseCost(r.valueBaptizeCostLuck),
    fixedCostLuck: u.parseCost(r.fixedCostLuck),
    valuefixedCostLuck: u.parseCost(r.valuefixedCostLuck),
    pointChangeCost: u.parseCost(r.pointChangeCost)
  }));
  u.saveOutput('role_feather_luck', result, {
    system: '角色 -> 翅膀系统 -> 羽毛 -> 强运',
    source: 'feather.*.json',
    costType: '强运洗练 *Luck字段 + pointChangeCost(属性变更)',
    dedup: '按品质递增'
  });
}

function extract() {
  console.log('\n📦 角色 -> 翅膀系统');
  extractWingUpgrade();
  extractWingSkill();
  extractFeatherBaptize();
  extractFeatherAdvance();
  extractFeatherLuck();
}

if (require.main === module) extract();
module.exports = extract;
