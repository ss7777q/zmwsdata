const path = require('path');
const u = require('../../lib/utils');

const BATTLE_FRAMES_PER_SECOND = 30;
const ENTITY_CTG_DIR = path.join(u.ROOT, 'file', 'battle-config', 'entityCtg');
const BULLETS_PATH = path.join(u.ROOT, 'file', 'battle-config', 'bullets.json');

const DANYUAN_QUALITY_NAMES = {
  3: '精良',
  4: '史诗',
  5: '传说',
  6: '先天'
};

const DANYUAN_INNER_TYPE_NAMES = {
  yin: '阴',
  yang: '阳'
};

const DANYUAN_GROWTH_DISPLAY_RULES = {
  2: { drop: ['buff\u0000苍狼内丹-生命回复 · 回复值'] },
  3: { drop: ['buff\u0000黑熊内丹-防御强化 · 防御值'] },
  5: { drop: ['buff\u0000黄袍内丹 - 减伤 · 减伤值'] },
  13: { drop: ['buff\u0000免疫减益 · 持续时间', 'buff\u0000虎魂护体 · 持续时间'] },
  20: { drop: ['mechanic\u0000子弹数量'] },
  22: { drop: ['mechanic\u0000触发率', 'mechanic\u0000充能恢复'] }
};

const DANYUAN_SUMMON_SKILL_LEVEL_FAMILIES = new Set([
  12,
  15,
  16,
  20,
  24
]);

const BULLET_BUFF_KEYS = new Set([
  'hitBuff',
  'hitBuffFlyMonster',
  'hitBuffNoFlyMonster',
  'hitBuffPet',
  'hitBuffRide',
  'friendBuff',
  'buff',
  'buffs',
  'buffId',
  'buffIds',
  'addBuffs',
  'firstHitAddBuffs',
  'firstHitAddTauntBuffs',
  'catchPlayerBuffs',
  'catchArmorPlayerBuffs',
  'armorBuffs',
  'notArmorBuffs',
  'noHitBuffs',
  'randomBuff'
]);

const BULLET_BESKILL_KEYS = new Set([
  'beSkillId',
  'beskillId',
  'beskillIds'
]);

module.exports = {
  BATTLE_FRAMES_PER_SECOND,
  ENTITY_CTG_DIR,
  BULLETS_PATH,
  DANYUAN_QUALITY_NAMES,
  DANYUAN_INNER_TYPE_NAMES,
  DANYUAN_GROWTH_DISPLAY_RULES,
  DANYUAN_SUMMON_SKILL_LEVEL_FAMILIES,
  BULLET_BUFF_KEYS,
  BULLET_BESKILL_KEYS
};
