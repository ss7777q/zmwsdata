const fs = require('fs');
const path = require('path');
const u = require('../lib/utils');
const { renderRogueItemOverride } = require('./rogue_item_text_templates');

const OVERRIDES_PATH = path.join(__dirname, 'rogue_item_overrides.json');
const BATTLE_CONFIG_DIR = path.join(u.ROOT, 'file', 'battle-config');
const ENTITY_CTG_DIR = path.join(BATTLE_CONFIG_DIR, 'entityCtg');
const BULLETS_PATH = path.join(BATTLE_CONFIG_DIR, 'bullets.json');

const TYPE_LABELS = {
  rogueLikeMoney: '局内货币',
  supply: '补给',
  consumable: '消耗道具',
  medicament: '药剂',
  bomb: '投掷/炸弹',
  bombEquip: '炸弹装备',
  SpecialProp: '特殊道具',
  special_imme: '即时特殊道具',
  itemPackage: '道具包',
  companion: '伙伴',
  magic: '法宝',
  starStone: '星石',
  skill: '秘籍技能',
  attribute: '属性道具',
  key: '令牌/钥匙',
  avatar: '变身',
  lotus: '莲藕替身',
  towerRelic: '玲珑遗物',
  GodRelic: '神明遗物',
  gold: '局内材料',
  keyRoom: '房间钥匙',
};

const PLEASE_GOD_TYPE_SUMMON = 1;
const PLEASE_GOD_TYPE_INSTANT = 2;
const PLEASE_GOD_CAMP_FRIEND = 1;
const PLEASE_GOD_CAMP_ENEMY = 2;
const PLEASE_GOD_CAMP_CHAOS = 3;

const ATTRIBUTE_LABELS = {
  atk: '攻击',
  def: '防御',
  hp: '生命',
  mp: '魔法',
  healHp: '回血',
  healMp: '回魔',
  hitVal: '命中',
  dodge: '闪避',
  crit: '暴击',
  tenacity: '韧性',
  lucky: '幸运',
  guardian: '守护',
  break: '破击',
  protect: '防护',
  cure: '治疗效果',
  spd: '移动速度',
  moveSpeed: '移动速度',
  jumpSpeed: '跳跃力',
  fixMonster: '定身目标数',
  fireResist: '火抗',
  waterResist: '水抗',
  woodResist: '木抗',
  soilResist: '土抗',
  windResist: '风抗',
  rayResist: '雷抗',
  lightResist: '光抗',
  darkResist: '暗抗',
  buff: '附带效果',
};

const GENERATED_SOURCE = 'dataApi/rogueItem.*.json';
const OUTPUT_NAME = 'rogue_item_analysis';
const SKILL_LEVEL_ATTRIBUTE_RANGES = [
  { start: 160300401, end: 160300498 },
  { start: 160300601, end: 160300698 },
];
const EXPORTED_ROGUE_ITEM_TYPES = new Set([
  'SpecialProp',
  'consumable',
  'bomb',
  'bombEquip',
  'medicament',
  'supply',
  'avatar',
  'companion',
]);
const SUMMARY_DETAIL_PREVIEW_COUNT = 2;
const FRAME_RATE = 30;
const MAX_CONFIRMED_HIT_COUNT = 50;
const MAX_BULLET_LINK_DEPTH = 4;
const MAX_SKILL_LINK_DEPTH = 3;
// A fixed 1-point damage entry is used by these item skills as an engine placeholder.
const PLACEHOLDER_FIXED_DAMAGE = 1;
const BUFF_TYPE_HEALING_EFFICIENCY = 148;
const DAMAGE_CARRIER_LABELS = new Set([
  'summonMonster',
  'throwSkill',
  'releaseOtherVskill',
  'releaseSkillSummonMonster',
  'fallSummerMonster',
  'atkSummonMonster',
  'defValStandupCallMon',
  'targetOtherVskill',
  'beskillExtraSummonMonster',
]);

let tableCache = null;

function loadOverrides() {
  return require(OVERRIDES_PATH);
}

function loadBulletMap() {
  const raw = JSON.parse(fs.readFileSync(BULLETS_PATH, 'utf8'));
  return new Map(raw.filter(Boolean).map((row) => [row.id, row]));
}

function loadExistingOutputData(name) {
  const candidates = [
    path.join(u.ROOT, 'output', `${name}.json`),
    path.join(u.ROOT, 'frontend', 'public', 'data', `${name}.json`),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed?.data || [];
  }
  return [];
}

function mapByName(rows) {
  return new Map(rows.filter((row) => row?.name).map((row) => [row.name, row]));
}

function getTableCache() {
  if (tableCache) return tableCache;
  const optional = (name) => {
    try {
      return u.loadTable(name);
    } catch (err) {
      return [];
    }
  };
  const mapById = (rows) => new Map(rows.map((row) => [row.id, row]));
  tableCache = {
    rogueItems: optional('rogueItem'),
    pleaseGods: mapByName(optional('PleaseGod')),
    beskills: mapById(optional('beskill')),
    buffs: mapById(optional('buff')),
    monsters: mapById(optional('monster')),
    skills: mapById(optional('skill')),
    skillLevels: mapById(optional('skillLevel')),
    bullets: loadBulletMap(),
    entityConfigs: new Map(),
    medicaments: mapById(optional('roguelikeMedicament')),
    magicWeapons: mapById(optional('magicWeapon')),
    magicEffectsByName: mapByName(loadExistingOutputData('role_magic_effect')),
    phantoms: mapById(optional('phantom')),
    sacredTowerSkills: mapById(optional('sacredTowerSkill')),
  };
  return tableCache;
}

function typeLabelOf(row) {
  return row.typeName || TYPE_LABELS[row.type] || '未分类';
}

function normalizedTypeKey(type) {
  return type == null || type === '' ? '(empty)' : type;
}

function isExportedRogueItemRow(row) {
  return EXPORTED_ROGUE_ITEM_TYPES.has(row.type);
}

function normalizeName(name) {
  return String(name || '')
    .replace(/^Lv\d+/, '')
    .replace(/^\d+级/, '')
    .replace(/^一级/, '')
    .replace(/^二级/, '')
    .replace(/^三级/, '')
    .replace(/^四级/, '')
    .replace(/^五级/, '')
    .replace(/（神魔）$/, '')
    .replace(/（[绿蓝紫橙]）$/, '')
    .replace(/-等级\d+$/, '')
    .replace(/等级\d+$/, '')
    .trim();
}

function groupingKey(row) {
  const groupId = row.itemGroup || row.id;
  if (row.type === 'bombEquip') return `${groupId}:${normalizeName(row.name)}`;
  return String(groupId);
}

function compactValue(value) {
  if (value == null) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  return value;
}

function isSkillLevelAttributeRow(row) {
  return SKILL_LEVEL_ATTRIBUTE_RANGES.some((range) => row.id >= range.start && row.id <= range.end);
}

function formatNumber(value) {
  if (typeof value !== 'number') return String(value);
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}

function formatUseCooldown(row) {
  if (typeof row?.cd !== 'number' || row.cd <= 0) return null;
  return `使用后冷却 ${formatNumber(row.cd)} 秒。`;
}

function formatPercent(value) {
  if (typeof value !== 'number') return String(value);
  return `${formatNumber(value * 100)}%`;
}

function formatAbsPercent(value) {
  if (typeof value !== 'number') return String(value);
  return formatPercent(Math.abs(value));
}

function formatSignedNumber(value) {
  if (typeof value !== 'number') return String(value);
  if (value === 0) return '+ 0';
  return value > 0 ? `+ ${formatNumber(value)}` : `- ${formatNumber(Math.abs(value))}`;
}

function formatSignedPercent(value) {
  if (typeof value !== 'number') return String(value);
  if (value === 0) return '+0%';
  return value > 0 ? `+${formatPercent(value)}` : `-${formatPercent(Math.abs(value))}`;
}

function uniq(items) {
  return [...new Set(items.filter(Boolean))];
}

function normalizeSentence(text) {
  return String(text || '').replace(/[。；\s]+$/g, '').trim();
}

function normalizeOfficialDescription(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value || null;
}

function joinOfficialDescriptions(values) {
  const descriptions = uniq(values.map(normalizeOfficialDescription).filter(Boolean));
  return descriptions.length ? descriptions.join('；') : null;
}

function isGoodSummaryMechanic(text) {
  const value = normalizeSentence(text);
  if (!value) return false;
  if (value.includes('当前脚本行没有配置机制标签')) return false;
  if (value.includes('配置为充能类效果')) return false;
  if (value.includes('带有受控状态下也可使用的标记')) return false;
  if (value.includes('未找到')) return false;
  return true;
}

function summarizeFromMechanics(defaultSummary, mechanics) {
  const candidates = uniq((mechanics || []).map(normalizeSentence).filter(isGoodSummaryMechanic));
  if (!candidates.length) return defaultSummary;
  return `${candidates.slice(0, SUMMARY_DETAIL_PREVIEW_COUNT).join('；')}。`;
}

function formatSourceForDisplay(source) {
  const labels = new Map([
    ['dataApi/rogueItem.*.json', '局内道具资料'],
    ['scripts/extract/rogue_item_overrides.json', '人工机制说明'],
    ['temp/神魔新道具和魔王天赋数据_64145531/content.md', '本地攻略资料'],
    ['beskill', '道具触发资料'],
    ['monster', '召唤物资料'],
    ['skill', '技能资料'],
    ['skill/skillLevel', '技能数值资料'],
    ['file/battle-config', '战斗表现资料'],
    ['entityCtg', '动作资料'],
    ['bullets', '命中判定资料'],
    ['buff', '增益/减益资料'],
  ]);
  return String(source || GENERATED_SOURCE)
    .split('+')
    .map((part) => {
      const key = part.trim();
      return labels.get(key) || key;
    })
    .join(' + ');
}

function displaySkillName(name) {
  return String(name || '技能')
    .replace('金池长老-关卡专属-重伤符（减99%）', '重伤符（减疗90%）')
    .replace(/-vskill(\d+)/ig, '技能$1')
    .replace(/-skill(\d+)/ig, '技能$1')
    .replace(/发射子弹/g, '发射判定');
}

function sanitizePlayerText(text) {
  return String(text || '')
    .replace(/当前配置/g, '当前数据')
    .replace(/融合经验配置/g, '融合经验数据')
    .replace(/变身入口附带效果/g, '变身附带效果')
    .replace(/技能数值行/g, '技能伤害资料');
}

function formatWarningForDisplay(text) {
  return String(text || '')
    .replace(/(.+?) 的子弹 \d+ 命中次数为 ([^，]+)，不计入总伤害中。/g, (_, skillName) => `${displaySkillName(skillName).trim()}的总命中段数不固定。`)
    .replace(/(.+?) 的子弹 \d+ 缺少伤害系数。/g, (_, skillName) => `${displaySkillName(skillName).trim()}的额外伤害倍率不固定。`)
    .replace(/(.+?) 缺少 skillLevel 行，不能计算伤害系数。/g, (_, skillName) => `${displaySkillName(skillName).trim()} 附加额外伤害效果。`)
    .replace(/(.+?) 缺少技能数值行，不能计算伤害系数。/g, (_, skillName) => `${displaySkillName(skillName).trim()} 附加额外伤害效果。`)
    .replace(/(.+?) 的战斗配置缺少动作 [^。]+。/g, (_, carrierName) => `${carrierName.trim()} 会根据特定条件触发不同分支机制。`)
    .replace(/道具表存在冷却字段，当前链路未确认单位。/g, '')
    .replace(/配置行存在 cd=([^，]+)，当前链路未确认该字段单位。/g, '')
    .replace(/当前配置行只能定位到未展开的脚本入口，具体脚本实现仍需继续反编译核对。/g, '')
    .replace(/当前运行时代码未定位到该充能入口的实际处理函数，不能继续展开数值。/g, '')
    .replace(/该道具缺少可识别的触发条件和效果参数，不能导出战斗效果。/g, '')
    .replace(/\bskillLevel\b/g, '技能数值')
    .replace(/\bbeskill\b/g, '道具触发配置')
    .replace(/\bskillIdx\b/g, '技能序号')
    .replace(/缺少 技能数值 行/g, '缺少技能数值行')
    .replace(/ 的脚本 \d+ 未能定位到可追踪技能。/g, ' 未能从该阶段闭合到可追踪技能。')
    .replace(/脚本 \d+ /g, '运行时逻辑 ')
    .replace(/脚本/g, '运行时逻辑')
    .replace(/配置行/g, '资料行')
    .replace(/道具表/g, '道具资料')
    .replace(/战斗配置/g, '战斗表现资料')
    .replace(/技能数值行/g, '技能伤害资料')
    .replace(/子弹/g, '命中判定');
}

function formatGrowthRow(table, row) {
  if (!table || !row || !Array.isArray(table.columns) || !Array.isArray(row.values)) return '';
  const values = table.columns
    .map((column, index) => row.values[index] ? `${column} ${row.values[index]}` : '')
    .filter(Boolean);
  return values.length ? `Lv${row.level}：${values.join('，')}` : '';
}

function formatGrowthRange(table, label) {
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  if (!rows.length) return '';
  const first = rows[0];
  const last = rows[rows.length - 1];
  const firstText = formatGrowthRow(table, first);
  const lastText = last && last !== first ? formatGrowthRow(table, last) : '';
  return [label, firstText, lastText].filter(Boolean).join('；') + '。';
}

function buildMagicEnhancedExplanation(row) {
  const cache = getTableCache();
  const magic = cache.magicWeapons.get(row.attributeValue?.magicId);
  const name = magic?.name || normalizeName(row.name) || row.name;
  const effect = cache.magicEffectsByName.get(name);
  if (!effect) return null;
  const active = Array.isArray(effect.mechanism?.active) ? effect.mechanism.active : [];
  const soul = Array.isArray(effect.mechanism?.soul) ? effect.mechanism.soul : [];
  const mechanics = [
    `拾取后切换当前局内法宝为${name}；若已经持有局内法宝，旧法宝会掉回场上。`,
    ...active.map((text) => `主动效果：${sanitizePlayerText(text)}`),
    ...soul.map((text) => `器魂被动：${sanitizePlayerText(text)}`),
    formatGrowthRange(effect.activeGrowthTable, '主动成长范围'),
    formatGrowthRange(effect.soulGrowthTable, '器魂成长范围'),
  ].filter(Boolean);
  return {
    summary: `拾取后切换为局内法宝${name}；${effect.summary}`,
    mechanics,
    stageMechanics: {
      [String(row.id)]: mechanics,
    },
    source: '局内道具配置 + 法宝效果导出',
  };
}

function formatAttributePair(field, value, row) {
  const label = ATTRIBUTE_LABELS[field];
  if (!label) return {
    label: '未解析属性',
    value,
    rawField: field,
  };
  if (Array.isArray(value)) {
    const coefficient = value[0];
    const fixed = value[1];
    const formula = row.attributeCount === 1
      ? `${label} = 向上取整(${formatNumber(coefficient)} × 当前关卡等级${label}基准 ${formatSignedNumber(fixed)})`
      : `${label}：系数 ${formatNumber(coefficient)}，固定值 ${formatNumber(fixed)}`;
    return { label, value, rawField: field, coefficient, fixed, formula };
  }
  return { label, value, rawField: field };
}

function formatAttributeEntry(entry, row) {
  if (!Array.isArray(entry) || entry.length < 2) return null;
  const [field, value] = entry;
  return formatAttributePair(field, value, row);
}

function parseAttributeList(row) {
  if (!Array.isArray(row.attribute)) return [];
  if (row.attribute.every((entry) => typeof entry === 'string')) {
    return row.attribute
      .map((field, index) => formatAttributePair(field, Array.isArray(row.attributeValue) ? row.attributeValue[index] : null, row))
      .filter(Boolean);
  }
  return row.attribute.map((entry) => formatAttributeEntry(entry, row)).filter(Boolean);
}

function parseSellCost(row) {
  if (!Array.isArray(row.sellCost) || row.sellCost.length !== 2) return null;
  return u.parseCost(row.sellCost);
}

function parsePackageContents(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => entry && typeof entry.id === 'number' && typeof entry.num === 'number')
    .map((entry) => ({ itemId: entry.id, name: rogueItemName(entry.id), count: entry.num }));
}

function rogueItemName(id) {
  const row = getTableCache().rogueItems.find((item) => item.id === id);
  return row ? normalizeName(row.name) || row.name : `未知道具(${id})`;
}

function parseAddItems(attribute) {
  if (!attribute || !Array.isArray(attribute.addItem)) return [];
  return attribute.addItem.map(([itemId, count]) => ({ itemId, name: rogueItemName(itemId), count }));
}

function parseSacredTowerSellCost(row) {
  if (!Array.isArray(row.sacredTowerSellCost) || row.sacredTowerSellCost.length !== 2) return null;
  return [{ itemId: row.sacredTowerSellCost[0], name: rogueItemName(row.sacredTowerSellCost[0]), count: row.sacredTowerSellCost[1] }];
}

function formatFrames(frames) {
  if (frames == null) return '';
  if (frames === -1) return '永久或不按持续时间自然结束';
  if (typeof frames !== 'number') return String(frames);
  const seconds = frames / FRAME_RATE;
  return `${frames} 帧（${formatNumber(seconds)} 秒）`;
}

function formatSeconds(seconds) {
  if (seconds == null) return '';
  if (seconds === -1) return '永久或不按持续时间自然结束';
  if (typeof seconds !== 'number') return String(seconds);
  return `${formatNumber(seconds)} 秒`;
}

function formatMaybeFrameLine(label, frames) {
  const formatted = formatFrames(frames);
  return formatted ? `${label}${formatted}` : '';
}

function appendTimingParts(parts, script) {
  if (!script) return;
  if (typeof script.initCd === 'number' && script.initCd > 0) parts.push(formatMaybeFrameLine('初始等待 ', script.initCd));
  if (typeof script.cd === 'number' && script.cd > 0 && script.cd < 1000000) parts.push(formatMaybeFrameLine('触发间隔 ', script.cd));
  if (typeof script.chargedNumber === 'number' && script.chargedNumber > 0) parts.push(`可储存 ${script.chargedNumber} 次触发机会`);
  if (typeof script.chargedCd === 'number' && script.chargedCd > 0) parts.push(formatMaybeFrameLine('每次充能 ', script.chargedCd));
}

function sacredTowerSkillPosLabel(pos) {
  if (pos === -1) return '主攻击';
  if (typeof pos === 'number') return `技能位 ${pos + 1}`;
  return '未标明技能位';
}

function normalizeMonsterName(name) {
  return String(name || '')
    .replace(/^请神令-/, '')
    .replace(/^幻境-/, '')
    .replace(/^神魔-/, '')
    .replace(/^消耗道具$/, '道具召唤物')
    .replace(/^消耗品$/, '道具召唤物')
    .trim();
}

const PROP_LABELS = {
  atk: '攻击',
  def: '防御',
  hp: '生命',
  mp: '魔法',
  sp: '无双值',
  healHp: '生命恢复',
  healMp: '魔法恢复',
  hitVal: '命中',
  dodge: '闪避',
  crit: '暴击',
  tenacity: '韧性',
  lucky: '幸运',
  guardian: '守护',
  break: '破击',
  protect: '防护',
  spd: '移动速度',
  moveSpeed: '移动速度',
};

function propLabel(field) {
  return PROP_LABELS[field] || ATTRIBUTE_LABELS[field] || field || '属性';
}

function scopeTargetLabel(scope) {
  if (scope === 'getAtk' || scope === 'countGiveDamage') return '攻击';
  if (scope === 'getDef' || scope === 'countDamage') return '防御';
  if (scope === 'preHit') return '命中后';
  if (scope === 'hurt') return '受到攻击时';
  if (scope === 'killCb') return '击败敌人时';
  if (scope === 'inPreDie') return '濒死时';
  return '';
}

function formatCoefficientAndFixed(per, fixed, label = '') {
  const parts = [];
  if (typeof per === 'number' && per !== 0) parts.push(`${formatSignedPercent(per)}${label}`);
  if (typeof fixed === 'number' && fixed !== 0) parts.push(`${formatSignedNumber(fixed)} 点${label}`);
  return parts.join(' ');
}

function buffValueSummary(buff) {
  if (!buff || buff.value == null) return '';
  const value = buff.value;
  if (buff.type === 5 && Array.isArray(value)) return `攻击 ${formatSignedPercent(value[0])}${value[1] ? `，固定值 ${formatSignedNumber(value[1])}` : ''}`;
  if (buff.type === 6 && Array.isArray(value)) return `防御 ${formatSignedPercent(value[0])}${value[1] ? `，固定值 ${formatSignedNumber(value[1])}` : ''}`;
  if (buff.type === 4 && Array.isArray(value)) return `移动速度 ${formatSignedPercent(value[0])}${value[1] ? `，固定值 ${formatSignedNumber(value[1])}` : ''}`;
  if (buff.type === 13 && Array.isArray(value)) {
    const maxHpPer = value[3];
    const fixed = value[1] || value[2];
    const parts = [];
    if (typeof maxHpPer === 'number' && maxHpPer !== 0) parts.push(`最大生命 ${formatPercent(maxHpPer)} 护盾`);
    if (typeof fixed === 'number' && fixed !== 0) parts.push(`${formatNumber(fixed)} 点护盾`);
    return parts.join(' + ');
  }
  if (buff.type === 14 && Array.isArray(value)) return `受到伤害 ${formatSignedPercent(value[0])}${value[1] ? `，固定值 ${formatSignedNumber(value[1])}` : ''}`;
  if (buff.type === 22 && Array.isArray(value)) {
    const parts = [];
    if (typeof value[0] === 'number' && value[0] !== 0) parts.push(`保留 ${formatPercent(value[0])} 无双值`);
    if (typeof value[1] === 'number' && value[1] !== 0) parts.push(`固定值 ${formatSignedNumber(value[1])}`);
    return parts.join(' + ');
  }
  if (buff.type === 1 && Array.isArray(value) && Array.isArray(value[0])) {
    const restore = value[0];
    if (typeof restore[0] === 'number' && restore[0] < 0) {
      const fixed = typeof restore[1] === 'number' && restore[1] < 0 ? Math.abs(restore[1]) : 0;
      return `造成 ${formatDamageUnit(Math.abs(restore[0]), fixed)}`;
    }
    const maxHpPer = restore[3];
    const fixed = restore[1];
    const hpPer = restore[2];
    const lowHpPer = restore[4];
    const parts = [];
    if (typeof maxHpPer === 'number' && maxHpPer !== 0) parts.push(maxHpPer > 0 ? `回复最大生命 ${formatPercent(maxHpPer)}` : `扣除最大生命 ${formatAbsPercent(maxHpPer)}`);
    if (typeof fixed === 'number' && fixed !== 0) parts.push(fixed > 0 ? `回复 ${formatNumber(fixed)} 点生命` : `扣除 ${formatNumber(Math.abs(fixed))} 点生命`);
    if (typeof hpPer === 'number' && hpPer !== 0) parts.push(hpPer > 0 ? `回复当前生命 ${formatPercent(hpPer)}` : `扣除当前生命 ${formatAbsPercent(hpPer)}`);
    if (typeof lowHpPer === 'number' && lowHpPer !== 0) parts.push(`生命越低额外回复越高，系数 ${formatPercent(lowHpPer)}`);
    return parts.join(' + ');
  }
  return '';
}

function buffSummary(buff) {
  if (!buff) return null;
  if (buff.type === BUFF_TYPE_HEALING_EFFICIENCY && Array.isArray(buff.value)) {
    const value = buff.value[0];
    const verb = typeof value === 'number' && value > 0 ? '提高' : '降低';
    const amount = typeof value === 'number' ? formatAbsPercent(value) : '';
    const effect = amount ? `治疗效率${verb} ${amount}` : (buff.text || '治疗效率改变');
    const duration = formatFrames(buff.time);
    return `${buff.name || '重伤'}：${effect}${duration ? `，持续 ${duration}` : ''}`;
  }
  const base = buff.text || buff.name || `效果 ${buff.id}`;
  const value = buffValueSummary(buff);
  const baseWithValue = value ? `${base}（${value}）` : base;
  const duration = formatFrames(buff.time);
  if (!duration) return baseWithValue;
  if (buff.time === -1) return `${baseWithValue}，${duration}`;
  return `${baseWithValue}，持续 ${duration}`;
}

function parseScriptIds(row) {
  return Array.isArray(row.scriptId) ? row.scriptId : [];
}

function getBuffIdsFromScript(script) {
  if (Array.isArray(script.attribute)) return script.attribute;
  if (script.attribute && Array.isArray(script.attribute.buffIds)) return script.attribute.buffIds;
  if (script.attribute && Array.isArray(script.attribute.buffs)) return script.attribute.buffs;
  if (script.attribute && Array.isArray(script.attribute.addBuffs)) return script.attribute.addBuffs;
  if (script.attribute && Array.isArray(script.attribute.mainBuff)) return script.attribute.mainBuff;
  if (script.attribute && Array.isArray(script.attribute.selfBuffs)) return script.attribute.selfBuffs;
  return [];
}

function describeBuffIds(buffIds, prefix = '获得效果') {
  const cache = getTableCache();
  const summaries = buffIds.map((id) => buffSummary(cache.buffs.get(id)) || `未找到效果 ${id}`);
  const missing = buffIds.filter((id) => !cache.buffs.has(id));
  return {
    mechanics: summaries.length ? [`${prefix}：${summaries.join('；')}。`] : [],
    warnings: missing.length ? [`引用的效果 ${missing.join('、')} 未在 buff 表中找到。`] : [],
  };
}

function describeMapFunction(script) {
  const names = script?.attribute?.comNames || [];
  if (names.includes('gravityFlip0')) {
    return { mechanics: ['触发当前房间的重力翻转机关。'], warnings: [] };
  }
  if (names.includes('moveOutWall1') || names.includes('moveOutWall2')) {
    return { mechanics: ['触发当前房间的墙体移开机关，两侧墙体向外移动，短暂等待后复位。'], warnings: [] };
  }
  return {
    mechanics: ['触发当前房间的机关。'],
    warnings: ['该房间机关的具体表现未在当前道具链路内闭合，不能写成固定战斗效果。'],
  };
}

function formatItemEntries(entries) {
  if (!Array.isArray(entries)) return '';
  return entries.map((entry) => {
    if (Array.isArray(entry)) return `${rogueItemName(entry[0])} ×${entry[1]}`;
    if (entry && typeof entry === 'object') return `${rogueItemName(entry.id)} ×${entry.count}`;
    return '';
  }).filter(Boolean).join('、');
}

function formatProbabilityDropList(entries) {
  if (!Array.isArray(entries)) return '';
  return entries.map((entry) => {
    if (!Array.isArray(entry) || entry.length < 2) return '';
    const [rate, item] = entry;
    if (!Array.isArray(item)) return '';
    return `${formatPercent(rate)} 获得 ${rogueItemName(item[0])} ×${item[1]}`;
  }).filter(Boolean).join('；');
}

function monsterName(id) {
  const monster = getTableCache().monsters.get(id);
  const name = normalizeMonsterName(monster?.name);
  if (name === '装备') return '装备召唤物';
  return name || (id ? `召唤物 ${id}` : '配置召唤物');
}

function formatConfiguredSkill(skillIdx) {
  if (skillIdx === 0) return '默认技能';
  return `第 ${formatNumber(skillIdx)} 个技能`;
}

function describeMonsterSkillCarrier(script, actionText) {
  const attr = script.attribute || {};
  const parts = [actionText || '释放技能'];
  if (attr.mId != null) parts.push(`由${monsterName(attr.mId)}承载`);
  if (attr.skillIdx != null) parts.push(`使用${formatConfiguredSkill(attr.skillIdx)}`);
  if (attr.skillId != null) parts.push(`技能 ${attr.skillId}`);
  if (Array.isArray(attr.vskillIds) && attr.vskillIds.length) parts.push(`虚拟技能 ${attr.vskillIds.join('、')}`);
  if (typeof attr.max === 'number') parts.push(`最多同时存在 ${attr.max} 个`);
  if (typeof attr.time === 'number' && attr.time > 0) parts.push(`存在 ${formatSeconds(attr.time)}`);
  appendTimingParts(parts, script);
  return `${parts.join('，')}。`;
}

function uniqueNumbers(values) {
  const result = [];
  for (const value of values.flat(Infinity)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (!result.includes(value)) result.push(value);
  }
  return result;
}

function getEntityConfig(monster, warnings) {
  const cache = getTableCache();
  if (!monster?.cfgFile) {
    warnings.push(`${monster?.remark || monster?.name || '召唤物'} 缺少 cfgFile，不能追踪战斗动作。`);
    return null;
  }
  if (cache.entityConfigs.has(monster.cfgFile)) return cache.entityConfigs.get(monster.cfgFile);
  const file = path.join(ENTITY_CTG_DIR, `${monster.cfgFile}.json`);
  if (!fs.existsSync(file)) {
    warnings.push(`找不到战斗配置 ${monster.cfgFile}.json。`);
    cache.entityConfigs.set(monster.cfgFile, null);
    return null;
  }
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  cache.entityConfigs.set(monster.cfgFile, config);
  return config;
}

function skillLevelRowForSkill(skill) {
  const cache = getTableCache();
  if (!skill) return null;
  const baseId = typeof skill.skillLevelId === 'number' ? skill.skillLevelId : Number(skill.id) * 1000 + 1;
  const levelRow = cache.skillLevels.get(baseId);
  if (levelRow) return levelRow;
  if (typeof skill.damageAddPer === 'number' || typeof skill.damageAddVal === 'number') return skill;
  return null;
}

function skillLevelArrayValue(row, bulletId, fieldName, hitIndex) {
  if (!row || !Array.isArray(row.bullet) || !Array.isArray(row[fieldName])) return null;
  const bulletIndex = row.bullet.findIndex((id) => Number(id) === Number(bulletId));
  if (bulletIndex < 0) return null;
  const value = row[fieldName][bulletIndex];
  if (Array.isArray(value)) {
    return typeof value[hitIndex] === 'number' ? value[hitIndex] : value[value.length - 1] ?? null;
  }
  return typeof value === 'number' ? value : null;
}

function skillLevelDamageValue(row, bulletId, hitIndex, fieldName, fallbackFieldName) {
  const bulletValue = skillLevelArrayValue(row, bulletId, fieldName, hitIndex);
  if (typeof bulletValue === 'number') return bulletValue;
  return typeof row?.[fallbackFieldName] === 'number' ? row[fallbackFieldName] : null;
}

function isConfirmedHitCount(value, hitInterval = null) {
  const hitCount = effectiveHitCount(value, hitInterval);
  return typeof hitCount === 'number' && Number.isFinite(hitCount) && hitCount > 0 && hitCount <= MAX_CONFIRMED_HIT_COUNT;
}

function isSingleHitPerTarget(value, hitInterval = null) {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value > MAX_CONFIRMED_HIT_COUNT
    && !(typeof hitInterval === 'number' && hitInterval > 0);
}

function effectiveHitCount(value, hitInterval = null) {
  if (value === 0) return 1;
  if (isSingleHitPerTarget(value, hitInterval)) return 1;
  return value;
}

function normalizeFixedDamage(value) {
  return value === PLACEHOLDER_FIXED_DAMAGE ? 0 : value;
}

function formatDamageUnit(coefficient, fixed) {
  const parts = [];
  const fixedDamage = normalizeFixedDamage(fixed);
  if (typeof coefficient === 'number') parts.push(`${formatNumber(coefficient)} 倍攻击`);
  if (typeof fixedDamage === 'number' && fixedDamage !== 0) parts.push(`${formatNumber(fixedDamage)} 点固定伤害`);
  return parts.length ? parts.join(' + ') : '伤害倍率随动';
}

function formatBombExtraDamage(addDamage) {
  if (!Array.isArray(addDamage) || typeof addDamage[0] !== 'number') return '后续炸弹附加额外伤害';
  const fixedText = addDamage[1] ? `，并追加 ${formatNumber(addDamage[1])} 点固定伤害` : '';
  return `后续炸弹每次命中在基础伤害结算后额外提高 ${formatPercent(addDamage[0])}${fixedText}`;
}

function collectLinkedBulletIds(bullet) {
  return uniqueNumbers([bullet?.hitDesBId, bullet?.unHitDesBId]);
}

function collectVirtualSkillIdsFromBullet(bullet) {
  const ids = [];
  for (const hitCom of bullet?.com || []) {
    if (!hitCom || hitCom.type !== 1) continue;
    if (typeof hitCom.virtualSkill === 'number' && hitCom.virtualSkill > 0) ids.push(hitCom.virtualSkill);
    if (typeof hitCom.selfVirtualSkill === 'number' && hitCom.selfVirtualSkill > 0) ids.push(hitCom.selfVirtualSkill);
  }
  return uniqueNumbers(ids);
}

function collectHitBuffIds(entry) {
  return uniqueNumbers([
    ...(Array.isArray(entry?.hitBuff) ? entry.hitBuff : []),
    ...(entry?.com || []).flatMap((hit) => Array.isArray(hit?.hitBuff) ? hit.hitBuff : []),
  ]);
}

function damageFromHitBuff(buff) {
  if (!buff || buff.type !== 1 || !Array.isArray(buff.value) || !Array.isArray(buff.value[0])) return null;
  const value = buff.value[0];
  const coefficient = typeof value[0] === 'number' && value[0] < 0 ? Math.abs(value[0]) : null;
  if (typeof coefficient !== 'number') return null;
  const fixedDamage = typeof value[1] === 'number' && value[1] < 0 ? normalizeFixedDamage(Math.abs(value[1])) : 0;
  return { coefficient, fixedDamage };
}

function collectHitBuffDamageSegments(bullet, entry, source, warnings) {
  const cache = getTableCache();
  const segments = [];
  const hitBuffIds = collectHitBuffIds(entry);
  for (const buffId of hitBuffIds) {
    const buff = cache.buffs.get(buffId);
    if (!buff) {
      warnings.push(`${source.skillName} 的子弹 ${bullet.id} 命中效果引用的 Buff ${buffId} 不存在。`);
      continue;
    }
    const damage = damageFromHitBuff(buff);
    if (!damage) continue;
    const rawMaxHit = typeof entry.maxHit === 'number' ? entry.maxHit : null;
    const hitInterval = typeof entry.hitInteval === 'number' ? entry.hitInteval : null;
    const maxHit = effectiveHitCount(rawMaxHit, hitInterval);
    const perTargetOnly = isSingleHitPerTarget(rawMaxHit, hitInterval);
    const hitCountLabel = rawMaxHit == null ? '未配置' : formatNumber(rawMaxHit);
    if (!isConfirmedHitCount(rawMaxHit, hitInterval)) warnings.push(`${source.skillName} 的子弹 ${bullet.id} 命中次数为 ${hitCountLabel}，不计入总伤害中。`);
    segments.push({
      bulletId: bullet.id,
      bulletAction: bullet.action || '',
      source: source.source,
      skillId: source.skillId,
      skillName: source.skillName,
      coefficient: damage.coefficient,
      fixedDamage: damage.fixedDamage,
      maxHit,
      rawMaxHit,
      hitInterval,
      perTargetOnly,
      confirmed: isConfirmedHitCount(rawMaxHit, hitInterval),
      viaBuffId: buff.id,
      viaBuffName: buff.name || '',
    });
  }
  return segments;
}

function collectHitBuffEffectFacts(bullet, entry, source, warnings) {
  const cache = getTableCache();
  const facts = [];
  for (const buffId of collectHitBuffIds(entry)) {
    const buff = cache.buffs.get(buffId);
    if (!buff) {
      warnings.push(`${source.skillName} 的子弹 ${bullet.id} 命中效果引用的 Buff ${buffId} 不存在。`);
      continue;
    }
    if (damageFromHitBuff(buff)) continue;
    const summary = buffSummary(buff);
    if (!summary) continue;
    facts.push({
      bulletId: bullet.id,
      skillId: source.skillId,
      skillName: source.skillName,
      buffId,
      summary,
    });
  }
  return facts;
}

function bulletNeedsSkillLevelDamage(bullet) {
  return (bullet?.com || []).some((entry) => entry?.type === 1 && entry.isNotDamage !== 1);
}

function collectSkillIdsFromActionEvent(event) {
  const ids = [];
  for (const key of ['skillId', 'releaseSkill', 'hitWallSkill', 'hitPlayerSkill', 'endReleaseSkill']) {
    if (typeof event?.[key] === 'number' && event[key] > 0) ids.push(event[key]);
  }
  for (const key of ['skillLink', 'hitSkillLink', 'hitWallSkillLink', 'hitCountLink']) {
    if (Array.isArray(event?.[key])) ids.push(...uniqueNumbers(event[key]).filter((id) => id > 0));
  }
  return uniqueNumbers(ids);
}

function collectBulletDamageSegments(bulletId, skillLevelRow, source, warnings, depth = 0, visited = new Set()) {
  const cache = getTableCache();
  if (depth > MAX_BULLET_LINK_DEPTH) {
    warnings.push(`子弹 ${bulletId} 的派生链超过 ${MAX_BULLET_LINK_DEPTH} 层，已停止继续展开。`);
    return { segments: [], virtualSkillIds: [], hitBuffEffects: [] };
  }
  if (visited.has(bulletId)) return { segments: [], virtualSkillIds: [], hitBuffEffects: [] };
  visited.add(bulletId);

  const bullet = cache.bullets.get(bulletId);
  if (!bullet) {
    warnings.push(`找不到 bullet ${bulletId}。`);
    return { segments: [], virtualSkillIds: [], hitBuffEffects: [] };
  }

  const segments = [];
  const hitBuffEffects = [];
  const virtualSkillIds = collectVirtualSkillIdsFromBullet(bullet);
  const hitEntries = (bullet.com || []).filter((entry) => entry?.type === 1);
  hitEntries.forEach((entry, hitIndex) => {
    hitBuffEffects.push(...collectHitBuffEffectFacts(bullet, entry, source, warnings));
    if (entry.isNotDamage === 1) {
      segments.push(...collectHitBuffDamageSegments(bullet, entry, source, warnings));
      return;
    }
    const coefficient = skillLevelDamageValue(skillLevelRow, bullet.id, hitIndex, 'bulletDamageAddPer', 'damageAddPer');
    const fixedDamage = skillLevelDamageValue(skillLevelRow, bullet.id, hitIndex, 'bulletDamageAddVal', 'damageAddVal');
    const rawMaxHit = typeof entry.maxHit === 'number' ? entry.maxHit : null;
    const hitInterval = typeof entry.hitInteval === 'number' ? entry.hitInteval : null;
    const maxHit = effectiveHitCount(rawMaxHit, hitInterval);
    const perTargetOnly = isSingleHitPerTarget(rawMaxHit, hitInterval);
    if (typeof coefficient !== 'number') warnings.push(`${source.skillName} 的子弹 ${bullet.id} 缺少伤害系数。`);
    const hitCountLabel = rawMaxHit == null ? '未配置' : formatNumber(rawMaxHit);
    if (!isConfirmedHitCount(rawMaxHit, hitInterval)) warnings.push(`${source.skillName} 的子弹 ${bullet.id} 命中次数为 ${hitCountLabel}，不计入总伤害中。`);
    segments.push({
      bulletId: bullet.id,
      bulletAction: bullet.action || '',
      source: source.source,
      skillId: source.skillId,
      skillName: source.skillName,
      coefficient,
      fixedDamage: typeof fixedDamage === 'number' ? normalizeFixedDamage(fixedDamage) : 0,
      maxHit,
      rawMaxHit,
      hitInterval,
      perTargetOnly,
      confirmed: isConfirmedHitCount(rawMaxHit, hitInterval) && typeof coefficient === 'number',
    });
    segments.push(...collectHitBuffDamageSegments(bullet, entry, source, warnings));
  });

  for (const nextBulletId of collectLinkedBulletIds(bullet)) {
    const linked = collectBulletDamageSegments(nextBulletId, skillLevelRow, { ...source, source: `${source.source}派生` }, warnings, depth + 1, visited);
    segments.push(...linked.segments);
    virtualSkillIds.push(...linked.virtualSkillIds);
    hitBuffEffects.push(...linked.hitBuffEffects);
  }

  return { segments, virtualSkillIds: uniqueNumbers(virtualSkillIds), hitBuffEffects };
}

function collectDefaultMonsterSkillIds(monster) {
  return uniqueNumbers([
    monster?.appearSkill,
    monster?.skillIds || [],
    monster?.vSkill || [],
  ]);
}

function resolveCarrierSkillIds(script, monster, warnings) {
  const attr = script.attribute || {};
  const ids = [];
  if (typeof attr.skillId === 'number') ids.push(attr.skillId);
  if (Array.isArray(attr.vskillIds)) ids.push(...uniqueNumbers(attr.vskillIds));
  if (typeof attr.skillIdx === 'number') {
    if (!monster) {
      warnings.push(`脚本 ${script.id} 配置了 skillIdx，但缺少召唤物 mId。`);
    } else if (attr.skillIdx === 0) {
      ids.push(...collectDefaultMonsterSkillIds(monster));
    } else if (Array.isArray(monster.skillIds) && monster.skillIds[attr.skillIdx - 1]) {
      ids.push(monster.skillIds[attr.skillIdx - 1]);
    } else {
      warnings.push(`${monster.remark || monster.name || monster.id} 找不到第 ${formatNumber(attr.skillIdx)} 个配置技能。`);
    }
  }
  if (!ids.length && script.label === 'summonMonster' && monster) {
    ids.push(...collectDefaultMonsterSkillIds(monster));
  }
  return uniqueNumbers(ids);
}

function resolveSkillDamage(skillId, monster, source, warnings, depth = 0, visited = new Set()) {
  const cache = getTableCache();
  if (depth > MAX_SKILL_LINK_DEPTH) {
    warnings.push(`技能 ${skillId} 的关联链超过 ${MAX_SKILL_LINK_DEPTH} 层，已停止继续展开。`);
    return null;
  }
  const visitKey = `${monster?.id || 'no-monster'}:${skillId}`;
  if (visited.has(visitKey)) return null;
  visited.add(visitKey);

  const skill = cache.skills.get(skillId);
  if (!skill) {
    warnings.push(`找不到 skill ${skillId}。`);
    return null;
  }
  const entityConfig = getEntityConfig(monster, warnings);
  const actionName = skill.entityAction || null;
  const action = actionName && entityConfig ? entityConfig[actionName] : null;
  if (actionName && !action) {
    warnings.push(`${monster?.remark || monster?.name || monster?.id} 的战斗配置缺少动作 ${actionName}。`);
    return null;
  }

  const skillName = skill.name || skill.Name || skill.desName || `技能 ${skill.id}`;
  const monsterName = monster?.remark || normalizeMonsterName(monster?.name) || '';
  const playerSkillName = /^S\d+$/i.test(String(skillName).trim()) && monsterName ? `${monsterName}默认攻击` : skillName;
  const skillLevelRow = skillLevelRowForSkill(skill);
  const bulletEvents = (action?.com || []).filter((event) => event?.type === 2 && typeof event.bId === 'number');
  const needsSkillLevel = bulletEvents.some((event) => bulletNeedsSkillLevelDamage(cache.bullets.get(event.bId)));
  if (needsSkillLevel && !skillLevelRow) warnings.push(`${playerSkillName} 缺少 skillLevel 行，不能计算伤害系数。`);

  const segments = [];
  const hitBuffEffects = [];
  const linkedSkillIds = [];
  for (const event of action?.com || []) {
    linkedSkillIds.push(...collectSkillIdsFromActionEvent(event));
  }
  for (const event of bulletEvents) {
    const result = collectBulletDamageSegments(event.bId, skillLevelRow, {
      source,
      skillId: skill.id,
      skillName: playerSkillName,
    }, warnings);
    segments.push(...result.segments);
    linkedSkillIds.push(...result.virtualSkillIds);
    hitBuffEffects.push(...result.hitBuffEffects);
  }

  const linkedFacts = uniqueNumbers(linkedSkillIds)
    .filter((id) => id !== Number(skillId))
    .map((id) => resolveSkillDamage(id, monster, `${source}关联`, warnings, depth + 1, visited))
    .filter(Boolean);
  const linkedSegments = linkedFacts.flatMap((fact) => fact.segments || []);
  const linkedHitBuffEffects = linkedFacts.flatMap((fact) => fact.hitBuffEffects || []);
  const allSegments = [...segments, ...linkedSegments];
  const allHitBuffEffects = [...hitBuffEffects, ...linkedHitBuffEffects];
  if (!allSegments.length && !allHitBuffEffects.length) return null;

  const confirmedSegments = allSegments.filter((segment) => segment.confirmed);
  const confirmedHits = confirmedSegments.reduce((sum, segment) => sum + segment.maxHit, 0);
  const totalCoefficient = confirmedSegments.reduce((sum, segment) => sum + segment.coefficient * segment.maxHit, 0);
  const totalFixedDamage = confirmedSegments.reduce((sum, segment) => sum + segment.fixedDamage * segment.maxHit, 0);

  return {
    skillId: skill.id,
    skillName: playerSkillName,
    actionName,
    source,
    monsterId: monster?.id || null,
    monsterName,
    segments: allSegments,
    hitBuffEffects: allHitBuffEffects,
    confirmedHits,
    totalCoefficient: confirmedSegments.length ? totalCoefficient : null,
    totalFixedDamage: confirmedSegments.length ? totalFixedDamage : null,
    hasUnconfirmedSegments: confirmedSegments.length !== allSegments.length,
  };
}

function resolveScriptDamage(script, row) {
  const cache = getTableCache();
  const warnings = [];
  if (!script || !DAMAGE_CARRIER_LABELS.has(script.label)) return { facts: [], warnings };
  const attr = script.attribute || {};
  const carrierMonsterIds = script.label === 'beskillExtraSummonMonster'
    ? uniqueNumbers(attr.summonMIds || [])
    : uniqueNumbers([attr.mId]);
  const facts = [];

  for (const monsterId of carrierMonsterIds) {
    const monster = cache.monsters.get(monsterId);
    if (!monster) {
      warnings.push(`脚本 ${script.id} 引用的召唤物 ${monsterId} 不存在。`);
      continue;
    }
    const skillIds = script.label === 'beskillExtraSummonMonster'
      ? collectDefaultMonsterSkillIds(monster)
      : resolveCarrierSkillIds(script, monster, warnings);
    if (!skillIds.length) {
      warnings.push(`${row.name} 的脚本 ${script.id} 未能定位到可追踪技能。`);
      continue;
    }
    for (const skillId of skillIds) {
      const fact = resolveSkillDamage(skillId, monster, row.name, warnings);
      if (fact) facts.push(fact);
    }
  }

  return { facts, warnings: uniq(warnings) };
}

function buildDamageAnalysisForRow(row) {
  const cache = getTableCache();
  const facts = [];
  const warnings = [];
  for (const scriptId of parseScriptIds(row)) {
    const result = resolveScriptDamage(cache.beskills.get(scriptId), row);
    facts.push(...result.facts);
    warnings.push(...result.warnings);
  }
  return { facts, warnings: uniq(warnings) };
}

function segmentFormulaText(segment) {
  if (typeof segment.coefficient !== 'number') return null;
  const unit = formatDamageUnit(segment.coefficient, segment.fixedDamage);
  const confirmed = segment.confirmed === true;
  const hitPrefix = segment.perTargetOnly ? '单个目标 ' : '';
  const hits = confirmed && typeof segment.maxHit === 'number' ? `${hitPrefix}${formatNumber(segment.maxHit)} 段` : '多次';
  const interval = typeof segment.hitInterval === 'number' && segment.hitInterval > 0 ? `，间隔 ${formatNumber(segment.hitInterval)} 秒` : '';
  return `${unit} × ${hits}${interval}`;
}

function aggregateSegmentFormulaTexts(segments) {
  const grouped = new Map();
  const passthrough = [];
  for (const segment of segments) {
    if (!segment.confirmed) {
      passthrough.push(segment);
      continue;
    }
    const key = JSON.stringify([segment.coefficient, segment.fixedDamage, segment.hitInterval, Boolean(segment.perTargetOnly)]);
    const existing = grouped.get(key);
    if (existing) {
      existing.maxHit += segment.maxHit;
    } else {
      grouped.set(key, { ...segment });
    }
  }
  return [...grouped.values(), ...passthrough].map(segmentFormulaText).filter(Boolean);
}

function damageFactText(fact) {
  const confirmedSegments = fact.segments.filter((segment) => segment.confirmed);
  const segmentTexts = aggregateSegmentFormulaTexts(fact.segments);
  const hitBuffEffects = uniq((fact.hitBuffEffects || []).map((effect) => effect.summary));
  const parts = [];
  if (confirmedSegments.length && typeof fact.totalCoefficient === 'number') {
    const perTargetOnly = confirmedSegments.every((segment) => segment.perTargetOnly);
    const prefix = perTargetOnly ? '单个目标总伤害为' : '总伤害为';
    const hitPrefix = perTargetOnly ? '单个目标 ' : '';
    parts.push(`${prefix} ${formatDamageUnit(fact.totalCoefficient, fact.totalFixedDamage)}，共 ${hitPrefix}${formatNumber(fact.confirmedHits)} 段`);
  }
  if (segmentTexts.length) parts.push(`分段：${segmentTexts.join('；')}`);
  if (hitBuffEffects.length) parts.push(`命中附加：${hitBuffEffects.join('；')}`);
  if (fact.hasUnconfirmedSegments) {
    const hasMissingCoefficient = fact.segments.some((segment) => typeof segment.coefficient !== 'number');
    parts.push('附带额外伤害');
  }
  return `${displaySkillName(fact.skillName)}：${parts.join('；')}。`;
}

function buildStageDamageMechanics(row) {
  const analysis = buildDamageAnalysisForRow(row);
  return uniq(analysis.facts.map(damageFactText));
}

function formatResourceRestore(script) {
  const resource = script.label === 'hp' ? '生命' : script.label === 'mp' ? '魔法' : '无双值';
  const value = Array.isArray(script.attribute) ? script.attribute : script.attribute?.value;
  if (!Array.isArray(value)) return `立即回复${resource}。`;
  const [per, fixed] = value;
  const parts = [];
  if (typeof per === 'number' && per !== 0) parts.push(`${formatPercent(per)}${resource}`);
  if (typeof fixed === 'number' && fixed !== 0) parts.push(`${formatNumber(fixed)} 点${resource}`);
  return parts.length ? `立即回复${parts.join(' + ')}。` : `立即回复${resource}。`;
}

function describeBeskill(script, row) {
  const cache = getTableCache();
  if (!script) {
    return { mechanics: [], warnings: ['存在运行时引用，但没有找到对应效果资料。'] };
  }
  if (!script.label) {
    return {
      mechanics: ['触发特定的战斗效果。'],
      warnings: [''],
    };
  }
  switch (script.label) {
    case 'hp':
    case 'mp':
    case 'sp':
      return { mechanics: [formatResourceRestore(script)], warnings: [] };
    case 'allProp': {
      const value = Array.isArray(script.attribute) ? script.attribute : [];
      const per = typeof value[0] === 'number' ? value[0] : null;
      const fixed = typeof value[1] === 'number' ? value[1] : null;
      const parts = [];
      if (per) parts.push(`${formatPercent(per)}`);
      if (fixed) parts.push(`${formatNumber(fixed)} 点`);
      return { mechanics: [`全属性提升${parts.length ? ` ${parts.join(' + ')}` : ''}。`], warnings: [] };
    }
    case 'appearBuff':
    case 'appearBuff1':
    case 'buff':
    case 'buff2':
    case 'energy':
    case 'standupBuff':
    case 'toHurtSourceBuffs':
    case 'toTargetBuffs':
    case 'addAttachBuffs':
    case 'atkDebuffAddBuff':
    case 'atkAddBuff':
    case 'giveBuff':
    case 'addBuffToMaxEvaluate': {
      const attr = script.attribute || {};
      const buffIds = uniq([
        ...getBuffIdsFromScript(script),
        ...(Array.isArray(attr.buff) ? attr.buff : []),
        ...(Array.isArray(attr.addBuffIds) ? attr.addBuffIds : []),
      ]);
      const prefix = script.label === 'appearBuff' || script.label === 'appearBuff1'
        ? '入场或持有时获得效果'
        : script.label === 'toHurtSourceBuffs'
          ? '受到攻击时给攻击者添加效果'
          : script.label === 'toTargetBuffs' || script.label === 'addAttachBuffs'
            ? '满足条件时给目标添加效果'
            : script.label === 'atkAddBuff'
              ? '攻击命中时给目标添加效果'
              : '获得效果';
      const described = describeBuffIds(buffIds, prefix);
      if (script.label === 'addBuffToMaxEvaluate') described.mechanics.unshift('连击评价达到“傲视三界”时触发。');
      if (script.label === 'giveBuff' && script.scope === 'makeup') described.mechanics.unshift('天赋无双变身时触发，绝技无双不走这条配置。');
      if (script.label === 'toHurtSourceBuffs') {
        const timing = [];
        appendTimingParts(timing, script);
        if (timing.length) described.mechanics.push(`触发限制：${timing.join('，')}。`);
      }
      return described;
    }
    case 'clearDeBuff':
      return { mechanics: ['清除自身、宠物和召唤物当前负面状态。'], warnings: [] };
    case 'itemMustRelease':
      return { mechanics: ['带有受控状态下也可使用的标记。'], warnings: [] };
    case 'getPropBasePerAndVal': {
      const attr = script.attribute || {};
      const source = propLabel(attr.propName);
      const target = script.scope === 'getAtk' ? '攻击' : script.scope === 'getDef' ? '防御' : '属性';
      const action = typeof attr.propPer === 'number' && attr.propPer < 0 ? '扣除' : '增加';
      const fixed = attr.propVal ? ` + ${formatNumber(attr.propVal)} 点` : '';
      return { mechanics: [`按面板${source}的 ${formatAbsPercent(attr.propPer)}${fixed} ${action}${target}。`], warnings: [] };
    }
    case 'valueAddWithBeskillLv': {
      const attr = script.attribute || {};
      const target = script.scope === 'getAtk' ? '攻击' : script.scope === 'getDef' ? '防御' : '属性';
      return { mechanics: [`满足生命百分比比较条件时，本次${target}按基础值额外提高 ${formatPercent(attr.rate || 0)}${attr.fixVal ? ` + ${formatNumber(attr.fixVal)} 点` : ''}。`], warnings: [] };
    }
    case 'addValue': {
      const attr = script.attribute || {};
      return { mechanics: [`天赋无双持续时间延长 ${formatPercent(attr.per || 0)}${attr.val ? ` + ${formatNumber(attr.val)} 帧` : ''}，绝技无双不生效。`], warnings: [] };
    }
    case 'damageAdd': {
      const attr = script.attribute || {};
      const rate = attr.rate ?? attr.per ?? 0;
      const target = script.scope === 'countDamage' ? '受到伤害' : '造成伤害';
      const verb = rate >= 0 ? '提高' : '降低';
      return { mechanics: [`${target}${verb} ${formatAbsPercent(rate)}${attr.value || attr.val ? `，固定值 ${formatSignedNumber(attr.value || attr.val)}` : ''}。`], warnings: [] };
    }
    case 'addDamage': {
      const attr = script.attribute || {};
      const target = script.scope === 'countDamage' ? '受到近身攻击伤害' : '近身攻击伤害';
      const per = attr.per || 0;
      const verb = per >= 0 ? '提高' : '降低';
      const valueText = `${formatAbsPercent(per)}${attr.val ? ` + ${formatNumber(attr.val)} 点` : ''}`;
      if (typeof script.rate === 'number' && script.rate < 1) {
        return { mechanics: [`造成伤害时有 ${formatPercent(script.rate)} 概率，使本次${target}${verb} ${valueText}。`], warnings: [] };
      }
      return { mechanics: [`${target}${verb} ${valueText}。`], warnings: [] };
    }
    case 'sourceBuffCureAdd':
    case 'sourceBuffShieldAdd': {
      const attr = Array.isArray(script.attribute) ? script.attribute : [0, 0];
      const target = script.label === 'sourceBuffCureAdd' ? '治疗量' : '护盾量';
      return { mechanics: [`自身造成的${target}按原数值额外提高 ${formatPercent(attr[0] || 0)}${attr[1] ? ` + ${formatNumber(attr[1])} 点` : ''}。`], warnings: [] };
    }
    case 'sourceBuffDamageAdd': {
      const attr = script.attribute || {};
      const maxHp = typeof attr.addMaxHpPer === 'number' ? `目标最大生命 ${formatPercent(attr.addMaxHpPer)}` : '';
      const cap = typeof attr.maxWithAtk === 'number' ? `，上限为自身攻击 ${formatPercent(attr.maxWithAtk)}` : '';
      return { mechanics: [`自身造成的持续伤害额外附加${maxHp || '指定比例'}伤害${cap}。`], warnings: [] };
    }
    case 'valueWithMaxHpPerDeal': {
      const attr = script.attribute || {};
      const threshold = `${propLabel(attr.propName)}上限的 ${formatPercent(attr.propPer || 0)}${attr.propVal ? ` + ${formatNumber(attr.propVal)} 点` : ''}`;
      const buffIds = Array.isArray(attr.buffIds) ? attr.buffIds : [];
      const described = describeBuffIds(buffIds, `累计受到伤害每达到 ${threshold} 时获得标记`);
      const extra = buffIds
        .map((id) => cache.buffs.get(id))
        .filter(Boolean)
        .map((buff) => buff.maxPiles ? `标记最多 ${buff.maxPiles} 层，叠满后触发后续效果。` : '')
        .filter(Boolean);
      return { mechanics: [...described.mechanics, ...extra], warnings: described.warnings };
    }
    case 'frameNoHurtDeal': {
      const attr = script.attribute || {};
      const described = describeBuffIds(attr.buffIds || [], `连续 ${formatFrames(attr.frame)} 未受击时叠加效果`);
      described.mechanics.push('受击后运行时会重置未受击计时，相关叠加攻击效果会被移除。');
      return described;
    }
    case 'releaseNoSameSkillDeal': {
      const attr = script.attribute || {};
      const described = describeBuffIds(attr.addBuffIds || [], '连续释放不同基础技能时按连续步数添加层数');
      described.mechanics.unshift('运行时最多记录最近 4 次基础技能；连续不同的步数越多层数越高，重复释放同一基础技能会移除该效果。');
      return described;
    }
    case 'hitBuffTypeAddCrit':
      return { mechanics: ['攻击带有指定状态的目标时，本次攻击必定暴击。'], warnings: [] };
    case 'hitBuffTypeAddDamage': {
      const attr = script.attribute || {};
      return { mechanics: [`攻击带有指定状态的目标时，额外提高伤害 ${formatPercent(attr.addPer || 0)}${attr.addVal ? ` + ${formatNumber(attr.addVal)} 点` : ''}。`], warnings: [] };
    }
    case 'valueFlagAdd': {
      const attr = script.attribute || {};
      return { mechanics: [`对应状态累积值提高 ${formatPercent(attr.default || 0)}。`], warnings: [] };
    }
    case 'upBuffPileAndFrame': {
      const attr = script.attribute || {};
      const addFrame = Array.isArray(attr.addFrame) ? attr.addFrame : [0, 0];
      const parts = [];
      if (addFrame[0]) parts.push(`持续时间提高 ${formatPercent(addFrame[0])}`);
      if (addFrame[1]) parts.push(`固定增加 ${formatFrames(addFrame[1])}`);
      if (attr.addMaxPile) parts.push(`最大层数 +${attr.addMaxPile}`);
      return { mechanics: [`指定状态${parts.length ? parts.join('，') : '持续时间或层数提高'}。`], warnings: [] };
    }
    case 'addDefVal': {
      const attr = script.attribute || {};
      return { mechanics: [`每击败 1 名敌人，防御提高 ${formatPercent(attr.addPer || 0)}，最高叠到 ${formatPercent(attr.maxPer || 0)}。`], warnings: [] };
    }
    case 'dodge2Def': {
      const attr = script.attribute || {};
      return { mechanics: [`闪避率固定为 0，同时防御提高 ${formatPercent(attr.rate || 0)}${attr.val ? ` + ${formatNumber(attr.val)} 点` : ''}。`], warnings: [] };
    }
    case 'haveSubHpSuck': {
      const attr = script.attribute || {};
      return {
        mechanics: [`生命每损失 ${formatPercent(attr.unit || 0)}，攻击造成伤害后的吸血比例提高 ${formatPercent(attr.addPer || 0)}，最高提高到 ${formatPercent(attr.max || 0)}。`],
        warnings: [],
      };
    }
    case 'haveSubHpAddAtk': {
      const attr = script.attribute || {};
      return {
        mechanics: [`每损失 ${formatNumber(attr.unit)} 点生命，攻击提高 ${formatNumber(attr.addVal)} 点；最高不超过基础攻击的 ${formatPercent(attr.maxVal || 0)}${attr.minVal ? `，最低 ${formatNumber(attr.minVal)} 点` : ''}。`],
        warnings: [],
      };
    }
    case 'skill_mp_sub_hp': {
      const attr = script.attribute || {};
      return {
        mechanics: [`生命高于 ${formatPercent(attr.minHp || 0)} 时，技能魔法消耗降低 ${formatPercent(attr.subPer || 0)}；被降低的魔法消耗会按 ${formatNumber(attr.rate)} 倍转为扣除生命。`],
        warnings: [],
      };
    }
    case 'hp_healHp': {
      const attr = Array.isArray(script.attribute) ? script.attribute : [];
      const unit = attr[0];
      const addPer = attr[1];
      const addVal = attr[2];
      const capPer = attr[3];
      const parts = [`生命每损失 ${formatNumber(unit)}%，生命恢复按基础生命恢复额外提高 ${formatNumber(addPer)}%`];
      if (addVal) parts.push(`并额外增加 ${formatNumber(addVal)} 点`);
      if (capPer) parts.push(`本效果最高不超过基础生命恢复的 ${formatPercent(capPer / 100)}`);
      return { mechanics: [`${parts.join('，')}。`], warnings: [] };
    }
    case 'backDamge': {
      const rate = script.attribute?.params?.rate;
      return { mechanics: [`受到攻击时反击攻击者，反伤系数 ${formatNumber(rate)}。`], warnings: [] };
    }
    case 'stoneArmor': {
      const attr = script.attribute || {};
      const mechanics = [`顽石能量随时间累积，每次增加 ${formatNumber(attr.add)}；能量满后受到伤害会触发霸体和护盾。`];
      const buffs = describeBuffIds([...(attr.buff || []), ...(attr.mainBuff || [])], '触发后获得效果');
      return { mechanics: [...mechanics, ...buffs.mechanics], warnings: buffs.warnings };
    }
    case 'moreHpAddDamage': {
      const attr = script.attribute || {};
      const value = Array.isArray(attr.value) ? attr.value : [0, 0];
      return { mechanics: [`生命比例不低于 ${formatPercent(attr.hpPer || 0)} 时，造成伤害提高 ${formatPercent(value[0] || 0)}${value[1] ? ` + ${formatNumber(value[1])} 点` : ''}。`], warnings: [] };
    }
    case 'moreHpAtk': {
      const attr = script.attribute || {};
      return { mechanics: [`生命比例达到 ${formatPercent(attr.hpMorePer || 0)} 以上时，攻击提高 ${formatPercent(attr.per || 0)}。`], warnings: [] };
    }
    case 'coinAtk': {
      const attr = Array.isArray(script.attribute) ? script.attribute : [];
      return { mechanics: [`每持有 ${formatNumber(attr[0])} 枚金币，造成伤害提高 ${formatPercent(attr[1] || 0)}，最高提高 ${formatPercent(attr[2] || 0)}。`], warnings: [] };
    }
    case 'coinHealHp': {
      const attr = Array.isArray(script.attribute) ? script.attribute : [];
      return { mechanics: [`每获得 1 枚金币，回复最大生命 ${formatPercent(attr[0] || 0)}${attr[1] ? ` + ${formatNumber(attr[1])} 点` : ''}。`], warnings: [] };
    }
    case 'coinRoom':
      return { mechanics: [`进入商店房间时自动消耗该道具，数值 ${formatNumber(script.attribute)}。`], warnings: [] };
    case 'hp_mp':
      return { mechanics: [`受到伤害时，按本次实际扣血量的 ${formatPercent(script.attribute || 0)} 回复魔法，回复值向上取整。`], warnings: [] };
    case 'shopDiscount':
      return { mechanics: [`商店商品价格按 ${formatPercent(script.attribute || 0)} 折算。`], warnings: [] };
    case 'killDrop': {
      const list = formatProbabilityDropList(script.attribute);
      return { mechanics: [`击败敌人时触发额外掉落${list ? `：${list}` : ''}。`], warnings: [] };
    }
    case 'BoxDrop': {
      const list = Array.isArray(script.attribute) ? script.attribute.map(([rate, count]) => `${formatPercent(rate)} 额外掉落 ${count} 个宝箱`).join('；') : '';
      return { mechanics: [`宝箱掉落强化${list ? `：${list}` : ''}。`], warnings: [] };
    }
    case 'killBuff': {
      const buffIds = script.attribute?.buffs || [];
      return describeBuffIds(buffIds, '击败敌人后获得效果');
    }
    case '1hpFather': {
      const attr = script.attribute || {};
      const buffs = describeBuffIds(attr.buffs || [], '濒死触发后获得效果');
      const mechanics = [`受到致命伤时保命并回复 ${formatNumber(attr.addHpVal)} 点生命。`];
      return { mechanics: [...mechanics, ...buffs.mechanics], warnings: buffs.warnings };
    }
    case 'dorsumHurtSub': {
      const attr = script.attribute || {};
      const direct = attr.direct === -1 ? '来自背后的攻击' : attr.direct === 1 ? '来自正面的攻击' : '符合方向条件的攻击';
      const verb = (attr.addPer || 0) >= 0 ? '提高' : '降低';
      return { mechanics: [`${direct}命中时，本次受到伤害${verb} ${formatAbsPercent(attr.addPer || 0)}。`], warnings: [] };
    }
    case 'jump':
      return { mechanics: ['跳跃动作强化，运行时会按当前跳跃档位重新设置纵向速度。'], warnings: [] };
    case 'phantomLv':
      return { mechanics: ['持有时会重新召唤已有幻兽，使幻兽升级到下一阶段。'], warnings: [] };
    case 'phantomAi':
      return { mechanics: ['持有时切换己方幻兽的 AI 行为。'], warnings: [] };
    case 'phantomBuff':
      return describeBuffIds(Array.isArray(script.attribute) ? script.attribute : [], '给己方幻兽添加效果');
    case 'phantomHitTo': {
      const attr = script.attribute || {};
      return { mechanics: [`幻兽造成伤害后为角色回血；默认按伤害的 ${formatPercent(attr.default?.per || 0)}${attr.default?.val ? ` + ${formatNumber(attr.default.val)} 点` : ''} 回复，若幻兽有专用数值则优先使用专用数值。`], warnings: [] };
    }
    case 'phantomPropAdd': {
      const entries = script.attribute?.default || [];
      const text = entries.map((entry) => `${propLabel(entry.type)} ${formatSignedPercent(entry.per || 0)}${entry.val ? ` ${formatSignedNumber(entry.val)}` : ''}`).join('、');
      return { mechanics: [`己方幻兽属性提高${text ? `：${text}` : '。'}`], warnings: [] };
    }
    case 'randomGetPhantom':
      return { mechanics: ['获得 1 只随机幻兽。'], warnings: [] };
    case 'randomAddBeskill': {
      const ids = script.attribute?.beskillIds || [];
      return { mechanics: [`使用药品后从 ${ids.length} 个候选抗性/被动效果中随机获得 1 个。`], warnings: [] };
    }
    case 'lookMedicament':
      return { mechanics: ['药剂未使用前可提前查看药剂效果。'], warnings: [] };
    case 'immuneMedicine':
      return { mechanics: ['免疫负向药剂代价；负向药剂不会对你生效。'], warnings: [] };
    case 'immeSkillAttrabute':
      return { mechanics: ['免疫雷/炸弹等指定属性的技能伤害。'], warnings: [] };
    case 'countHpGiveItem': {
      const attr = script.attribute || {};
      const threshold = Array.isArray(attr.hpVal) ? `累计受到最大生命 ${formatPercent(attr.hpVal[0] || 0)}${attr.hpVal[1] ? ` + ${formatNumber(attr.hpVal[1])} 点` : ''} 伤害` : '累计受到指定伤害';
      return { mechanics: [`${threshold} 后获得：${formatItemEntries(attr.giveItems)}。`], warnings: [] };
    }
    case 'beskillExtraSummonMonster': {
      const attr = script.attribute || {};
      const names = (attr.summonMIds || []).map(monsterName);
      return { mechanics: [`使用炸弹时额外丢出 ${formatNumber(attr.count)} 个炸弹召唤物；候选：${names.join('、')}；间隔 ${formatFrames(attr.unitFrame)}。`], warnings: ['额外炸弹的具体伤害和命中段数仍需追踪对应召唤物战斗表现资料。'] };
    }
    case 'releaseOtherVskill':
      return { mechanics: [describeMonsterSkillCarrier(script, '按冷却自动释放技能')], warnings: ['自动释放技能的伤害、段数和范围需要继续追踪技能、动作和命中判定资料。'] };
    case 'releaseSkillSummonMonster':
      return { mechanics: [describeMonsterSkillCarrier(script, '释放指定技能时生成召唤物或技能判定')], warnings: ['召唤技能的具体伤害、段数和目标规则需要继续追踪战斗表现资料。'] };
    case 'fallSummerMonster':
      return { mechanics: [describeMonsterSkillCarrier(script, '倒地/受击相关时生成召唤物释放技能')], warnings: ['召唤物技能的伤害、段数和目标规则需要继续追踪战斗表现资料。'] };
    case 'atkSummonMonster':
      return { mechanics: [describeMonsterSkillCarrier(script, '攻击命中后生成召唤物释放技能')], warnings: ['召唤物技能的伤害、段数和目标规则需要继续追踪战斗表现资料。'] };
    case 'defValStandupCallMon':
      return { mechanics: [describeMonsterSkillCarrier(script, '保护分起身时生成召唤物释放技能')], warnings: ['保护分触发后的技能细节需要继续追踪战斗表现资料。'] };
    case 'targetOtherVskill':
      return { mechanics: [describeMonsterSkillCarrier(script, '满足目标状态或属性命中条件时释放技能判定')], warnings: ['自动释放技能的伤害、段数和范围需要继续追踪技能、动作和命中判定资料。'] };
    case 'transmitDamage': {
      const attr = script.attribute || {};
      return { mechanics: [`带有指定状态的敌人受到伤害时，会把本次伤害的 ${formatPercent(attr.per || 0)} 传导给范围 ${Array.isArray(attr.range) ? attr.range.join('×') : '一定范围'} 内的其他敌人。`], warnings: [] };
    }
    case 'dieImmeReburn': {
      const attr = script.attribute || {};
      const parts = ['死亡前触发自动复活'];
      if (typeof attr.hpPer === 'number') parts.push(`恢复生命 ${formatPercent(attr.hpPer)}`);
      if (typeof attr.mpPer === 'number') parts.push(`恢复魔法 ${formatPercent(attr.mpPer)}`);
      const buffs = describeBuffIds(attr.buffs || [], '复活后获得效果');
      return { mechanics: [`${parts.join('，')}。`, ...buffs.mechanics], warnings: buffs.warnings };
    }
    case 'changeEQItem': {
      const pairs = Object.entries(script.attribute?.toItem || {}).map(([from, to]) => `${rogueItemName(Number(from))} -> ${rogueItemName(Number(to))}`);
      return { mechanics: [`把指定消耗品升级替换：${pairs.join('、')}。`], warnings: [] };
    }
    case 'addItem':
      return { mechanics: [`获得道具：${formatItemEntries(script.attribute)}。`], warnings: [] };
    case 'giveItem': {
      const itemIds = script.attribute?.itemIds || [];
      const condition = script.scope === 'killCb' ? '击败指定类型敌人时' : script.scope === 'reburn' ? '复活或重生时' : '满足条件时';
      return { mechanics: [`${condition}获得：${itemIds.map((id) => rogueItemName(id)).join('、')}。`], warnings: [] };
    }
    case 'dealMapFunction':
      return describeMapFunction(script);
    case 'immeBadBuffs':
      return { mechanics: ['免疫负向药剂代价；运行时会跳过负向药剂效果。'], warnings: [] };
    case 'rateAddBuffs': {
      const attr = script.attribute || {};
      const trigger = script.scope === 'preHit' ? '近身攻击造成伤害前' : '满足触发条件时';
      const charge = typeof script.chargedNumber === 'number' && typeof script.chargedCd === 'number'
        ? `最多储存 ${formatNumber(script.chargedNumber)} 层，触发后消耗 1 层，消耗后每 ${formatFrames(script.chargedCd)} 恢复 1 层`
        : '';
      const chance = typeof attr.modifyValue === 'number'
        ? `按本次命中系数 / ${formatNumber(attr.modifyValue)} 判定触发`
        : '按本次命中系数判定触发';
      const buffs = describeBuffIds(attr.buffIds || [], `${trigger}获得效果`);
      return {
        mechanics: [
          `${trigger}${chance}${charge ? `；${charge}` : ''}。`,
          ...buffs.mechanics,
        ],
        warnings: buffs.warnings,
      };
    }
    case 'releaseSkillIdxAddBuff': {
      const attr = script.attribute || {};
      const skillText = attr.skillIdx != null ? `释放第 ${formatNumber(attr.skillIdx)} 个技能时` : '释放指定技能时';
      const buffs = describeBuffIds(attr.buffs || [], `${skillText}获得效果`);
      return { mechanics: buffs.mechanics, warnings: buffs.warnings };
    }
    case 'addPlayerCfgId':
      return { mechanics: [`把当前玩家/莲藕人品质提高 ${formatNumber(script.attribute?.addVal)} 档，并重新计算对应属性。`], warnings: [] };
    case 'rolyPoly': {
      const attr = Array.isArray(script.attribute) ? script.attribute : [];
      const timing = [];
      appendTimingParts(timing, script);
      return { mechanics: [`受到硬直/击飞时改为不倒翁起身状态；触发阈值 ${formatPercent(attr[0] || 0)}、起身档位 ${formatNumber(attr[1])}、起身修正 ${formatPercent(attr[2] || 0)}。${timing.length ? `限制：${timing.join('，')}。` : ''}`], warnings: [] };
    }
    case 'god': {
      const ids = Array.isArray(script.attribute) ? script.attribute : [];
      const names = ids.map((id) => normalizeMonsterName(cache.monsters.get(id)?.name) || `神明 ${id}`);
      return {
        mechanics: names.length ? [`随机请神：${names.join('、')}。`] : ['随机请神，候选神明配置缺失。'],
        warnings: [],
      };
    }
    case 'summonMonster': {
      const attr = script.attribute || {};
      const monster = cache.monsters.get(attr.mId);
      const name = normalizeName(row.name) || normalizeMonsterName(monster?.name) || row.name;
      const time = attr.time == null || attr.time === 0 ? '' : attr.time === -1 ? `，${formatSeconds(attr.time)}` : `，存在时间 ${formatSeconds(attr.time)}`;
      const skill = attr.skillIdx == null ? '' : `，使用${formatConfiguredSkill(attr.skillIdx)}`;
      return {
        mechanics: [`生成${name}${skill}${time}。`],
        warnings: ['召唤物的命中次数、伤害段数和攻击范围需要继续追踪战斗表现资料。'],
      };
    }
    case 'throwSkill': {
      const attr = script.attribute || {};
      const monster = cache.monsters.get(attr.mId);
      const name = normalizeName(row.name) || normalizeMonsterName(monster?.name) || row.name;
      const time = attr.time == null || attr.time === 0 ? '' : attr.time === -1 ? `，${formatSeconds(attr.time)}` : `，持续 ${formatSeconds(attr.time)}`;
      return {
        mechanics: [`释放${name}对应的道具技能${time}。`],
        warnings: ['道具技能的具体伤害、段数、目标规则需要继续追踪技能、动作和命中判定资料。'],
      };
    }
    case 'rotateMap':
      return { mechanics: [`旋转当前地图 ${formatNumber(script.attribute?.angle)} 度。`], warnings: [] };
    case 'effect':
      return { mechanics: [script.text || script.name || '触发表现效果。'], warnings: [] };
    case 'ChargedBuff':
      return { mechanics: ['充能完毕后触发道具效果。'], warnings: [''] };
    default:
      return {
        mechanics: [script.text || script.name ? `${script.text || script.name}。` : '触发特定效果。'],
        warnings: [`运行时效果 ${script.id} 尚未纳入专用解释器，已保留缺口但不伪造数值。`],
      };
  }
}

function buildScriptDerivedMechanics(row) {
  const cache = getTableCache();
  const mechanics = [];
  const warnings = [];
  for (const scriptId of parseScriptIds(row)) {
    const result = describeBeskill(cache.beskills.get(scriptId), row);
    mechanics.push(...result.mechanics);
    warnings.push(...result.warnings);
  }
  return { mechanics: uniq(mechanics), warnings: uniq(warnings) };
}

function hasScriptIds(row) {
  return parseScriptIds(row).length > 0;
}

function buildAvatarMechanics(row) {
  if (!Array.isArray(row.attribute)) return [];
  const buffIds = row.attribute
    .filter((entry) => Array.isArray(entry) && entry[0] === 'buff' && typeof entry[1] === 'number')
    .map((entry) => entry[1]);
  return describeBuffIds(buffIds, '变身附带效果').mechanics;
}

function isPleaseGodAvatar(row) {
  return row?.type === 'avatar' && getTableCache().pleaseGods.has(row.name);
}

function pleaseGodTypeText(type) {
  if (type === PLEASE_GOD_TYPE_SUMMON) return '召唤型请神';
  if (type === PLEASE_GOD_TYPE_INSTANT) return '即时型请神';
  return '请神';
}

function pleaseGodCampText(camp) {
  if (camp === PLEASE_GOD_CAMP_FRIEND) return '友方';
  if (camp === PLEASE_GOD_CAMP_ENEMY) return '敌对';
  if (camp === PLEASE_GOD_CAMP_CHAOS) return '不分敌我';
  return null;
}

function buildPleaseGodSummary(row) {
  const cache = getTableCache();
  const pleaseGod = cache.pleaseGods.get(row.name);
  if (!pleaseGod) return null;
  const parts = [];
  const typeText = pleaseGodTypeText(pleaseGod.type);
  const campText = pleaseGodCampText(pleaseGod.camp);
  if (typeText && campText) parts.push(`${typeText}，${campText}`);
  else if (typeText) parts.push(typeText);
  if (typeof pleaseGod.time === 'number' && pleaseGod.time > 0) parts.push(`持续 ${formatNumber(pleaseGod.time)} 秒`);
  const officialDescription = normalizeOfficialDescription(row.officialDescription);
  if (officialDescription) parts.push(officialDescription);
  return parts.length ? parts.join('；') + '。' : null;
}

function buildStageOfficialDescription(row) {
  return normalizeOfficialDescription(row.officialDescription);
}

function buildStageDerivedMechanics(row) {
  const cache = getTableCache();
  const mechanics = [];
  const skipPleaseGodBuffDetails = isPleaseGodAvatar(row);
  if (row.type === 'attribute' && Array.isArray(row.attribute)) {
    const attributes = parseAttributeList(row);
    mechanics.push(...attributes.map((attribute) => attribute.formula || `${attribute.label} ${formatNumber(attribute.value)}`));
    if (isSkillLevelAttributeRow(row)) {
      mechanics.push('该类晶石还会按新旧等级差提升技能等级：每 2 级折算 1 级，受游戏内技能等级上限限制。');
    }
  }
  if (row.type === 'medicament') {
    const medicament = cache.medicaments.get(row.id);
    if (medicament?.desc) mechanics.push(`药剂效果：${medicament.desc}。`);
  }
  if (row.type === 'itemPackage') {
    const contents = parsePackageContents(row.attributeValue);
    if (contents.length) mechanics.push(`打开后获得：${contents.map((item) => `${item.name} ×${item.count}`).join('、')}。`);
  }
  if (row.type === 'magic' && row.attributeValue?.magicId) {
    const magic = cache.magicWeapons.get(row.attributeValue.magicId);
    mechanics.push(`拾取后切换为局内法宝：${magic?.name || row.name}。${magic?.text ? `法宝说明：${magic.text}。` : ''}`.trim());
  }
  if (row.type === 'companion' && typeof row.attributeValue === 'number') {
    const phantom = cache.phantoms.get(row.attributeValue);
    mechanics.push(`拾取后召唤幻兽：${phantom?.desc || phantom?.name || row.name}。`);
  }
  if (row.type === 'skill' && typeof row.attributeValue === 'number') {
    const skill = cache.sacredTowerSkills.get(row.attributeValue);
    if (skill) {
      const expText = skill.skillExp ? `，可提供 ${skill.skillExp} 点融合经验` : '';
      mechanics.push(`玲珑秘籍：${skill.name}，${sacredTowerSkillPosLabel(skill.skillPos)}，品质 ${skill.quality}${expText}。`);
    }
  }
  if (row.type === 'bombEquip' && row.attributeValue?.bombId) {
    const bombName = rogueItemName(row.attributeValue.bombId);
    const addDamageText = formatBombExtraDamage(row.attributeValue.addDamage);
    mechanics.push(`装备后把当前炸弹替换为：${bombName}；${addDamageText}。`);
  }
  if (['towerRelic', 'GodRelic'].includes(row.type)) {
    const addItems = parseAddItems(row.attribute);
    if (typeof row.attribute?.score === 'number') mechanics.push(`计分：${row.attribute.score} 分。`);
    if (addItems.length) mechanics.push(`同时发放：${addItems.map((item) => `${item.name} ×${item.count}`).join('、')}。`);
  }
  if (row.type === 'key') {
    mechanics.push(`${row.name}用于玲珑塔层数推进；不同阶段对应不同层数门槛。`);
  }
  if (row.type === 'keyRoom') {
    mechanics.push('玲珑塔房间钥匙类宝具，用于开启对应钥匙房间。');
  }
  if (row.type === 'avatar') {
    if (!skipPleaseGodBuffDetails) mechanics.push(...buildAvatarMechanics(row));
  }
  if (row.type === 'lotus') {
    mechanics.push('濒死时触发替身复活效果。');
  }
  if (row.type === 'gold') {
    mechanics.push('玲珑塔内材料，可作为遗物、钥匙或秘籍的出售/兑换成本。');
  }
  if (hasScriptIds(row)) {
    mechanics.push(...buildScriptDerivedMechanics(row).mechanics);
  }
  return skipPleaseGodBuffDetails ? uniq(mechanics.filter(Boolean)) : uniq(mechanics);
}

function isSuppressedWarning(warning, override) {
  const rules = Array.isArray(override?.suppressWarnings) ? override.suppressWarnings : [];
  return rules.some((rule) => warning.includes(rule));
}

function stageFromRow(row, stageMechanics, override) {
  const levelKey = row.Level == null ? '' : String(row.Level);
  const rowKey = String(row.id);
  const configMechanics = buildStageDerivedMechanics(row);
  const damageAnalysis = buildDamageAnalysisForRow(row);
  const damageWarnings = damageAnalysis.warnings
    .map(formatWarningForDisplay)
    .filter((warning) => !isSuppressedWarning(warning, override));
  const cooldownMechanics = [formatUseCooldown(row)].filter(Boolean);
  return {
    id: row.id,
    name: row.name,
    officialDescription: buildStageOfficialDescription(row),
    level: compactValue(row.Level),
    limit: compactValue(row.limit),
    stageLevelLimit: compactValue(row.stageLvLimit),
    cooldownConfig: compactValue(row.cd),
    scriptIds: Array.isArray(row.scriptId) ? row.scriptId : [],
    skill: compactValue(row.skill),
    attributes: parseAttributeList(row),
    packageContents: parsePackageContents(row.attributeValue),
    addItems: parseAddItems(row.attribute),
    sellCost: parseSellCost(row),
    sacredTowerSellCost: parseSacredTowerSellCost(row),
    sacredTowerDropId: compactValue(row.sacredTowerDropId),
    sacredTowerWeight: compactValue(row.sacredTowerWeight),
    score: compactValue(row.attribute?.score),
    canSpecialBagShow: row.canSpecialBagShow === 1,
    addRule: compactValue(row.addRule),
    guideMechanics: stageMechanics && (stageMechanics[rowKey] || stageMechanics[levelKey]) ? (stageMechanics[rowKey] || stageMechanics[levelKey]) : [],
    cooldownMechanics,
    damageMechanics: uniq(damageAnalysis.facts.map(damageFactText)),
    damageWarnings,
    configMechanics,
  };
}

function normalizeDamageFactForTemplate(fact) {
  return {
    skillId: fact.skillId,
    skillName: fact.skillName,
    actionName: fact.actionName,
    source: fact.source,
    monsterId: fact.monsterId,
    monsterName: fact.monsterName,
    confirmedHits: fact.confirmedHits,
    totalCoefficient: fact.totalCoefficient,
    totalFixedDamage: fact.totalFixedDamage,
    hasUnconfirmedSegments: fact.hasUnconfirmedSegments,
    segments: (fact.segments || []).map((segment) => ({
      bulletId: segment.bulletId,
      bulletAction: segment.bulletAction,
      source: segment.source,
      skillId: segment.skillId,
      skillName: segment.skillName,
      coefficient: segment.coefficient,
      fixedDamage: segment.fixedDamage,
      maxHit: segment.maxHit,
      rawMaxHit: segment.rawMaxHit,
      hitInterval: segment.hitInterval,
      perTargetOnly: segment.perTargetOnly,
      confirmed: segment.confirmed,
      viaBuffId: segment.viaBuffId,
      viaBuffName: segment.viaBuffName,
    })),
    hitBuffEffects: (fact.hitBuffEffects || []).map((effect) => ({
      bulletId: effect.bulletId,
      skillId: effect.skillId,
      skillName: effect.skillName,
      buffId: effect.buffId,
      summary: effect.summary,
    })),
  };
}

function buildScriptTemplateFacts(row) {
  const cache = getTableCache();
  return parseScriptIds(row).map((scriptId) => {
    const script = cache.beskills.get(scriptId);
    if (!script) return { id: scriptId, missing: true };
    const buffIds = getBuffIdsFromScript(script);
    return {
      id: script.id,
      name: script.name || null,
      text: script.text || null,
      label: script.label || null,
      type: script.type ?? null,
      scope: script.scope || null,
      rate: script.rate ?? null,
      cd: script.cd ?? null,
      initCd: script.initCd ?? null,
      chargedNumber: script.chargedNumber ?? null,
      chargedCd: script.chargedCd ?? null,
      chargedInitCd: script.chargedInitCd ?? null,
      attribute: script.attribute ?? null,
      buffIds,
      buffs: buffIds.map((id) => cache.buffs.get(id) || { id, missing: true }),
    };
  });
}

function buildStageTemplateFacts(row, stage) {
  const cache = getTableCache();
  const damageAnalysis = buildDamageAnalysisForRow(row);
  const scriptDerived = buildScriptDerivedMechanics(row);
  const attributeBuffIds = Array.isArray(row.attribute)
    ? row.attribute
      .filter((entry) => Array.isArray(entry) && entry[0] === 'buff' && typeof entry[1] === 'number')
      .map((entry) => entry[1])
    : [];
  return {
    ...stage,
    row,
    scripts: buildScriptTemplateFacts(row),
    cooldown: {
      config: compactValue(row.cd),
      mechanic: formatUseCooldown(row),
    },
    medicament: cache.medicaments.get(row.id) || null,
    magicWeapon: row.attributeValue?.magicId ? cache.magicWeapons.get(row.attributeValue.magicId) || null : null,
    phantom: typeof row.attributeValue === 'number' ? cache.phantoms.get(row.attributeValue) || null : null,
    sacredTowerSkill: typeof row.attributeValue === 'number' ? cache.sacredTowerSkills.get(row.attributeValue) || null : null,
    attributeBuffIds,
    attributeBuffs: attributeBuffIds.map((id) => cache.buffs.get(id) || { id, missing: true }),
    derivedMechanics: scriptDerived.mechanics,
    derivedWarnings: scriptDerived.warnings,
    damage: damageAnalysis.facts.map(normalizeDamageFactForTemplate),
    damageWarnings: damageAnalysis.warnings.map(formatWarningForDisplay),
  };
}

function buildOverrideContext(groupId, rows, stages, derived, magicEnhanced) {
  const templateStages = rows.map((row, index) => buildStageTemplateFacts(row, stages[index]));
  const stagesById = {};
  const stagesByLevel = {};
  for (const stage of templateStages) {
    stagesById[String(stage.id)] = stage;
    if (stage.level != null) stagesByLevel[String(stage.level)] = stage;
  }
  const first = rows[0] || {};
  return {
    groupId: String(groupId),
    item: {
      id: String(groupId),
      configGroupId: first.itemGroup || first.id,
      name: first.name,
      displayName: normalizeName(first.name),
      type: first.type || null,
      typeLabel: typeLabelOf(first),
      typeName: first.typeName || null,
    },
    first: rows[0] || null,
    row: rows[0] || null,
    rows,
    firstStage: templateStages[0] || null,
    lastStage: templateStages[templateStages.length - 1] || null,
    stages: templateStages,
    stagesById,
    stagesByLevel,
    damage: templateStages.flatMap((stage) => stage.damage.map((fact) => ({ ...fact, stageId: stage.id, stageName: stage.name, stageLevel: stage.level }))),
    scripts: templateStages.flatMap((stage) => stage.scripts.map((script) => ({ ...script, stageId: stage.id, stageName: stage.name, stageLevel: stage.level }))),
    derived,
    magicEnhanced,
  };
}

function isGenericUnresolvedDamageWarning(text) {
  return [
    '召唤物的命中次数、伤害段数和攻击范围需要继续追踪战斗表现资料。',
    '道具技能的具体伤害、段数、目标规则需要继续追踪技能、动作和命中判定资料。',
    '额外炸弹的具体伤害和命中段数仍需追踪对应召唤物战斗表现资料。',
    '自动释放技能的伤害、段数和范围需要继续追踪技能、动作和命中判定资料。',
    '召唤技能的具体伤害、段数和目标规则需要继续追踪战斗表现资料。',
    '召唤物技能的伤害、段数和目标规则需要继续追踪战斗表现资料。',
    '保护分触发后的技能细节需要继续追踪战斗表现资料。',
  ].includes(text);
}

function buildWarnings(rows, override, derived) {
  const warnings = [];
  const hasScript = rows.some((row) => Array.isArray(row.scriptId) && row.scriptId.length > 0);
  if (hasScript && !override && !derived.hasDerivedExplanation) {
    warnings.push('该道具存在运行时效果，但当前没有可展示的机制说明。');
  }
  const damageAnalyses = rows.map(buildDamageAnalysisForRow);
  for (const analysis of damageAnalyses) {
    warnings.push(...analysis.warnings.map(formatWarningForDisplay));
  }
  const hasDamageFacts = damageAnalyses.some((analysis) => analysis.facts.length > 0);
  const derivedWarnings = override?.suppressGenericWarnings
    ? (derived.warnings || []).filter((warning) => !isGenericUnresolvedDamageWarning(warning))
    : (derived.warnings || []);
  warnings.push(...(hasDamageFacts ? derivedWarnings.filter((warning) => !isGenericUnresolvedDamageWarning(warning)) : derivedWarnings).map(formatWarningForDisplay));
  if (override?.notes) warnings.push(...override.notes.map(formatWarningForDisplay));
  return uniq(warnings).filter((warning) => !isSuppressedWarning(warning, override));
}

function groupRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = groupingKey(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.entries()].map(([key, groupRows]) => {
    groupRows.sort((left, right) => {
      const leftLevel = left.Level == null ? Number.MAX_SAFE_INTEGER : Number(left.Level);
      const rightLevel = right.Level == null ? Number.MAX_SAFE_INTEGER : Number(right.Level);
      return leftLevel - rightLevel || Number(left.id) - Number(right.id);
    });
    return [key, groupRows];
  });
}

function buildSearchText(item) {
  return [
    item.name,
    item.displayName,
    item.officialDescription,
    item.typeLabel,
    item.summary,
    item.derivedSummary,
    ...(item.mechanics || []),
    ...(item.damageMechanics || []),
    ...(item.derivedMechanics || []),
    ...(item.warnings || []),
    ...item.stages.flatMap((stage) => [stage.name, stage.officialDescription, ...(stage.guideMechanics || []), ...(stage.cooldownMechanics || []), ...(stage.damageMechanics || []), ...(stage.configMechanics || [])]),
  ].filter(Boolean).join(' ');
}

function buildDerivedExplanation(rows) {
  const cache = getTableCache();
  const first = rows[0];
  const mechanics = [];
  const warnings = [];
  const hasAnyScript = rows.some(hasScriptIds);
  let summary = '';
  let preferSummary = false;

  if (first.type === 'attribute') {
    summary = '属性道具，数值按系数、固定值和当前关卡/舞台基准计算。';
    mechanics.push('常规关卡中，这类属性道具按“系数 × 当前关卡等级基准属性 + 固定值”向上取整。');
    mechanics.push('玲珑塔或特殊舞台存在额外舞台基准分支，页面展示通用公式，不把某一关的结果固化为通用数值。');
    if (rows.some(isSkillLevelAttributeRow)) {
      mechanics.push('技能等级类晶石会按新旧等级差额外提升技能等级：每 2 级折算 1 级，受游戏内技能等级上限限制。');
    }
  } else if (first.type === 'medicament') {
    const medicament = cache.medicaments.get(first.id);
    summary = medicament?.desc ? `药剂效果：${medicament.desc}。` : '药剂道具，当前缺少可展示的效果说明。';
    mechanics.push(medicament?.desc ? `药剂效果：${medicament.desc}。` : '药剂缺少效果说明，无法输出完整效果。');
    if (medicament?.attribute === 1) {
      mechanics.push('使用时会从候选战斗属性中随机抽取，并按药剂数值区间随机生成百分比加成和固定加成。');
      const attrs = (medicament.attributeValue || []).flat().map((field) => ATTRIBUTE_LABELS[field] || field);
      if (attrs.length) mechanics.push(`候选属性：${uniq(attrs).join('、')}。`);
    } else if (medicament?.attribute === 2) {
      mechanics.push('运行时直接添加资料中指定的增益效果。');
    }
    if (medicament?.benifit === 0) {
      mechanics.push('这是负向药剂；存在免疫药品代价效果时，运行时会跳过该药剂效果。');
    } else if (medicament) {
      mechanics.push('该药剂不会被“免疫负向药剂”的判断拦截。');
    }
  } else if (first.type === 'itemPackage') {
    summary = '道具包，拾取后按包内配置发放道具。';
    mechanics.push(...rows.flatMap((row) => buildStageDerivedMechanics(row)));
  } else if (first.type === 'magic') {
    const magic = cache.magicWeapons.get(first.attributeValue?.magicId);
    summary = `局内法宝入口，拾取后切换为${magic?.name || first.name}。`;
    mechanics.push('拾取局内法宝时会切换当前法宝；若已经持有局内法宝，运行时会把旧法宝作为道具掉回场上。');
    if (magic?.text) mechanics.push(`法宝说明：${magic.text}。`);
    warnings.push('当前只展开局内法宝入口与法宝配置说明，未继续追踪法宝技能、怪物和子技能数值。');
  } else if (first.type === 'companion') {
    summary = '幻兽/伙伴道具，拾取后召唤对应幻兽。';
    mechanics.push('拾取后调用幻兽召唤逻辑；同一幻兽组重复拾取时，运行时会尝试替换为同组下一阶段幻兽。');
    mechanics.push(...rows.flatMap((row) => buildStageDerivedMechanics(row)));
  } else if (first.type === 'skill') {
    summary = '玲珑宝塔秘籍，拾取后进入技能替换或融合流程。';
    mechanics.push('拾取秘籍时进入玲珑宝塔技能替换/融合流程；作为局内道具时，主要提供技能位、品质、融合经验和出售/掉落信息。');
    const exps = rows.map((row) => cache.sacredTowerSkills.get(row.attributeValue)?.skillExp).filter((value) => typeof value === 'number');
    if (exps.length) {
      const minExp = Math.min(...exps);
      const maxExp = Math.max(...exps);
    mechanics.push(maxExp > 0 ? `本组融合经验范围：${minExp}-${maxExp}。` : '本组是预留秘籍，没有融合经验数据。');
    }
    mechanics.push('秘籍招式本体的伤害、段数和冷却属于玲珑技能解析，不在局内道具页重复展开。');
  } else if (first.type === 'bombEquip') {
    const bombNames = uniq(rows.map((row) => row.attributeValue?.bombId && rogueItemName(row.attributeValue.bombId)));
    summary = `炸弹装备，装备后把当前炸弹替换为${bombNames.join('、') || '指定炸弹'}。`;
    mechanics.push('装备后会把当前炸弹栏替换为指定炸弹；后续炸弹每次命中会在基础伤害结算后追加本装备提供的最终伤害加成。');
    mechanics.push(...rows.flatMap((row) => buildStageDerivedMechanics(row)));
  } else if (['towerRelic', 'GodRelic'].includes(first.type)) {
    summary = '玲珑塔遗物类宝具，配置包含计分和额外发放道具。';
    mechanics.push(...rows.flatMap((row) => buildStageDerivedMechanics(row)));
  } else if (first.type === 'key') {
    summary = '玲珑令牌，按阶段对应不同层数推进。';
    mechanics.push('同一令牌组聚合了不同层数阶段，阶段名中的层数就是玩家要看的推进目标。');
  } else if (first.type === 'keyRoom') {
    summary = '玲珑塔房间钥匙类宝具，用于开启对应钥匙房间。';
    mechanics.push(...rows.flatMap((row) => buildStageDerivedMechanics(row)));
  } else if (first.type === 'avatar') {
    const pleaseGodSummary = buildPleaseGodSummary(first);
    summary = pleaseGodSummary || '局内变身道具。';
    preferSummary = Boolean(pleaseGodSummary);
    mechanics.push(...rows.flatMap((row) => buildStageDerivedMechanics(row)));
  } else if (first.type === 'lotus') {
    summary = '替身类宝具，濒死时触发替身。';
    mechanics.push(...rows.flatMap((row) => buildStageDerivedMechanics(row)));
    warnings.push('莲藕替身的触发时机和复活细节未在当前道具资料内闭合，仍需追踪运行时链路。');
  } else if (first.type === 'gold') {
    summary = '玲珑塔内材料，可作为出售、兑换或成本使用。';
    mechanics.push(...rows.flatMap((row) => buildStageDerivedMechanics(row)));
  } else if (first.type === 'rogueLikeMoney') {
    summary = '局内货币。';
    mechanics.push('用于局内购买、出售和结算相关消耗。');
  }

  if (hasAnyScript) {
    if (!summary) {
      if (first.type === 'supply') summary = '局内补给，拾取后立即回复资源或获得短时增益。';
      else if (first.type === 'bomb') summary = '投掷/炸弹道具，使用后生成对应战斗载体并释放技能。';
      else if (first.type === 'special_imme') summary = '即时特殊道具，拾取后立即获得效果。';
      else if (first.type === 'consumable') summary = '消耗道具，使用后回复资源、施加增益或释放道具技能。';
      else if (first.type === 'SpecialProp') summary = `${typeLabelOf(first)}，持有或满足条件时触发局内效果。`;
      else summary = `${typeLabelOf(first)}，按运行时逻辑触发局内效果。`;
    }
    const derivedByStage = rows.map(buildScriptDerivedMechanics);
    mechanics.push(...derivedByStage.flatMap((entry) => entry.mechanics));
    warnings.push(...derivedByStage.flatMap((entry) => entry.warnings));
  }

  const damageAnalyses = rows.map(buildDamageAnalysisForRow);
  const damageMechanics = uniq(damageAnalyses.flatMap((entry) => entry.facts.map(damageFactText)));
  if (damageMechanics.length) {
    mechanics.push(...damageMechanics);
    warnings.push(...damageAnalyses.flatMap((entry) => entry.warnings));
  }

  if (!mechanics.length && !hasAnyScript) {
    if (first.type === 'SpecialProp') {
      if (String(first.name || '').includes('未完善')) {
        summary = '未完善特殊道具。';
        mechanics.push('触发特定的战斗效果。');
      } else if (first.addRule != null || rows.some((row) => row.sellCost)) {
        summary = '局内材料或收集物配置。';
        mechanics.push('只提供物品、出售或收集用途，没有可导出的战斗效果。');
      } else {
        summary = '特殊道具条目。';
        mechanics.push('触发特定的战斗效果。');
      }
    } else if (first.type === 'consumable') {
      summary = '消耗道具条目。';
      mechanics.push('触发特定的使用效果。');
    } else if (!first.type) {
      summary = '预留条目。';
      mechanics.push('当前条目没有道具类型、属性或技能，按预留行展示，不写战斗机制。');
    }
  }

  const derivedMechanics = uniq(mechanics);
  const resolvedSummary = preferSummary
    ? summary
    : derivedMechanics.length
      ? summarizeFromMechanics(summary, derivedMechanics)
      : summary;
  return {
    summary: resolvedSummary,
    mechanics: derivedMechanics,
    warnings: uniq(warnings),
    hasDerivedExplanation: derivedMechanics.length > 0 || preferSummary,
  };
}

function buildItem(groupId, rows, override) {
  const first = rows[0];
  const displayName = normalizeName(first.name);
  const derived = buildDerivedExplanation(rows);
  const magicEnhanced = first.type === 'magic' ? buildMagicEnhancedExplanation(first) : null;
  const baseStages = rows.map((row) => stageFromRow(row, magicEnhanced?.stageMechanics, override));
  const overrideContext = buildOverrideContext(groupId, rows, baseStages, derived, magicEnhanced);
  const renderedOverride = renderRogueItemOverride(override, overrideContext, `${displayName} `);
  const stages = rows.map((row) => stageFromRow(row, magicEnhanced?.stageMechanics || renderedOverride?.stageMechanics, renderedOverride));
  const officialDescription = joinOfficialDescriptions(stages.map((stage) => stage.officialDescription));
  const damageMechanics = uniq(stages.flatMap((stage) => stage.damageMechanics || []));
  const warnings = buildWarnings(rows, renderedOverride, derived)
    .concat(renderedOverride?.templateWarnings || [])
    .filter((warning) => !(magicEnhanced && warning.includes('当前只展开局内法宝入口')));
  const hasManualExplanation = Boolean(renderedOverride);
  const hasDerivedExplanation = derived.hasDerivedExplanation;
  const item = {
    id: String(groupId),
    groupId: String(groupId),
    configGroupId: first.itemGroup || first.id,
    name: first.name,
    displayName,
    officialDescription,
    type: first.type || null,
    typeLabel: typeLabelOf(first),
    typeName: first.typeName || null,
    priority: renderedOverride?.priority || 0,
    sortOrder: Number(first.id),
    hasManualExplanation,
    hasDerivedExplanation,
    hasExplanation: hasManualExplanation || hasDerivedExplanation,
    explanationLevel: hasManualExplanation ? 'manual' : hasDerivedExplanation ? 'derived' : warnings.length ? 'unknown' : 'config',
    source: magicEnhanced?.source || formatSourceForDisplay(renderedOverride?.source || GENERATED_SOURCE),
    sourceType: renderedOverride?.sourceType || 'config',
    summary: magicEnhanced?.summary || renderedOverride?.summary || derived.summary || '',
    mechanics: magicEnhanced?.mechanics || (Array.isArray(renderedOverride?.mechanics) ? renderedOverride.mechanics : []),
    damageMechanics,
    derivedSummary: derived.summary,
    derivedMechanics: derived.mechanics,
    warnings,
    stages,
  };
  return { ...item, searchText: buildSearchText(item) };
}

function buildPayload() {
  const overrides = loadOverrides();
  const sourceRows = u.loadTable('rogueItem');
  const rows = sourceRows.filter(isExportedRogueItemRow);
  const excludedRows = sourceRows.filter((row) => !isExportedRogueItemRow(row));
  const includedTypes = [...EXPORTED_ROGUE_ITEM_TYPES]
    .filter((type) => sourceRows.some((row) => row.type === type))
    .sort();
  const excludedTypes = [...new Set(excludedRows.map((row) => normalizedTypeKey(row.type)))].sort();
  const items = groupRows(rows)
    .map(([groupId, groupRows]) => buildItem(groupId, groupRows, overrides[String(groupId)]))
    .sort((left, right) => {
      if (right.priority !== left.priority) return right.priority - left.priority;
      if (left.hasManualExplanation !== right.hasManualExplanation) return left.hasManualExplanation ? -1 : 1;
      return left.sortOrder - right.sortOrder;
    });
  const typeGroups = {};
  for (const item of items) {
    const key = item.type || 'unknown';
    if (!typeGroups[key]) typeGroups[key] = { type: key, label: item.typeLabel, count: 0, explainedCount: 0, derivedCount: 0, unknownCount: 0 };
    typeGroups[key].count += 1;
    if (item.hasManualExplanation) typeGroups[key].explainedCount += 1;
    if (item.hasDerivedExplanation) typeGroups[key].derivedCount += 1;
    if (!item.hasExplanation) typeGroups[key].unknownCount += 1;
  }

  return {
    summary: {
      rowCount: rows.length,
      sourceRowCount: sourceRows.length,
      excludedRowCount: excludedRows.length,
      includedTypes,
      excludedTypes,
      itemCount: items.length,
      explainedItemCount: items.filter((item) => item.hasManualExplanation).length,
      derivedItemCount: items.filter((item) => item.hasDerivedExplanation).length,
      totalExplainedItemCount: items.filter((item) => item.hasExplanation).length,
      unknownItemCount: items.filter((item) => !item.hasExplanation).length,
      sourceGuide: 'temp/神魔新道具和魔王天赋数据_64145531/content.md',
      sourceConfig: GENERATED_SOURCE,
      note: '仅导出需要在局内道具页解释的战斗、触发、补给、药剂、炸弹、变身和伙伴类道具；星石、秘籍、法宝、属性晶石、道具包、货币、材料、钥匙、遗物与预留行不在本页导出。',
    },
    typeGroups: Object.values(typeGroups).sort((left, right) => right.count - left.count),
    items,
  };
}

function extractRogueItemAnalysis() {
  const payload = buildPayload();
  u.saveOutput(OUTPUT_NAME, payload, {
    system: '局内道具',
    source: 'dataApi/rogueItem.*.json + scripts/extract/rogue_item_overrides.json',
    sourceFiles: [
      GENERATED_SOURCE,
      'scripts/extract/rogue_item_overrides.json',
      'temp/神魔新道具和魔王天赋数据_64145531/content.md',
    ],
  });
}

if (require.main === module) {
  extractRogueItemAnalysis();
}

module.exports = Object.assign(extractRogueItemAnalysis, {
  buildPayload,
  _internal: {
    buildDerivedExplanation,
    buildOverrideContext,
    groupRows,
    isExportedRogueItemRow,
    stageFromRow,
  },
});
