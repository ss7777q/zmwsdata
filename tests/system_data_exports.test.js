const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { buildSystemData } = require('../scripts/build_system_data');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'output');

const result = buildSystemData();
assert.ok(result.fileCount > 1_000, 'expected system-oriented entity files');

const manifest = require(path.join(outputDir, 'system_data_manifest.json')).data;
assert.ok(manifest.replacedSources.includes('pet_wiki_huadiehubing'));
assert.ok(manifest.replacedSources.includes('role_danyuan_effect'));
assert.ok(manifest.frontendFiles.includes('pet/wiki/神霄花仙'));

const petIndex = require(path.join(outputDir, 'pet', 'wiki', 'index.json')).data;
const flowerEntries = petIndex.groups.find((group) => group.key === 'huadiehubing').entries;
assert.equal(flowerEntries.length, 5);
assert.equal(new Set(flowerEntries.map((entry) => entry.fileName)).size, 5);

const flower = require(path.join(outputDir, 'pet', 'wiki', '神霄花仙.json')).data;
assert.equal(flower.variants.length, 1);
assert.equal(flower.variants[0].pet.name, '神霄花仙');
assert.ok(flower.skillBaselines.length > 0);

const starstoneIndex = require(path.join(outputDir, 'role', 'starstone', 'index.json')).data;
assert.equal(starstoneIndex.entries.length, 66);
assert.ok(starstoneIndex.entries.every((entry) => fs.existsSync(path.join(outputDir, `${entry.fileName}.json`))));

const rogueIndex = require(path.join(outputDir, 'rogue-item', 'index.json')).data;
assert.equal(rogueIndex.items.length, 204);
assert.ok(rogueIndex.items.every((item) => Number.isInteger(item.stageCount) && item.stageCount >= 0));
assert.ok(rogueIndex.items.every((item) => fs.existsSync(path.join(outputDir, `${item.fileName}.json`))));
assert.ok(fs.statSync(path.join(outputDir, 'rogue-item', 'index.json')).size < 260 * 1024);

const marketIndex = require(path.join(outputDir, 'resource', 'acquisition', 'black-market', 'index.json')).data;
const marketStages = marketIndex.blackMarket.modes.flatMap((mode) => mode.stages);
assert.equal(marketStages.length, 32);
assert.ok(marketStages.every((stage) => fs.existsSync(path.join(outputDir, `${stage.fileName}.json`))));

console.log(`system data exports: ${result.fileCount} files`);
