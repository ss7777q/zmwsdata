const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const outputFile = path.join(repoRoot, 'output', 'role_wiki_skill_extra.json');
const extractSkillExtraWiki = require(path.join(repoRoot, 'scripts', 'extract', 'role_wiki_skill_extra.js'));

const LEGENDARY_SKILL_ID = 21801010101;
const INNATE_SKILL_ID = 21804010101;
const DISPLAY_NAME = '至尊幻装·剑神无我';

extractSkillExtraWiki();

const payload = JSON.parse(fs.readFileSync(outputFile, 'utf8')).data;
const legendaryIndex = payload.slots.findIndex((slot) => slot.base.skillId === LEGENDARY_SKILL_ID);
const innateIndex = payload.slots.findIndex((slot) => slot.base.skillId === INNATE_SKILL_ID);
const legendary = payload.slots[legendaryIndex];
const innate = payload.slots[innateIndex];

assert.strictEqual(payload.slots.length, 4, '绝技无双应包含三张传说绝技和一张先天绝技');
assert.ok(legendary, '缺少至尊幻装传说绝技');
assert.ok(innate, '缺少至尊幻装先天绝技');
assert.strictEqual(legendary.slotLabel, '传说绝技');
assert.strictEqual(innate.slotLabel, '先天绝技');
assert.strictEqual(legendary.base.name, DISPLAY_NAME);
assert.strictEqual(innate.base.name, DISPLAY_NAME, '先天进阶应沿用至尊幻装绝技名');
assert.strictEqual(innateIndex, legendaryIndex + 1, '先天进阶应紧跟对应传说绝技展示');
assert.strictEqual(innate.base.header.totalPer, 15.526);
assert.strictEqual(innate.base.levels[0].totalVal, 31100);
assert.strictEqual(innate.base.levels.at(-1).totalVal, 1098938);
