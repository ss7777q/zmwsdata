import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildQaCatalog } = require('../scripts/build_qa_catalog.js');
const { createQaCatalog } = require('../server/qa-catalog.js');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zmws-qa-catalog-'));
const outputDir = path.join(tempRoot, 'output');
const dbPath = path.join(tempRoot, 'qa-catalog.db');
fs.mkdirSync(outputDir, { recursive: true });
fs.copyFileSync(
  path.resolve('output', 'pet_skill.json'),
  path.join(outputDir, 'pet_skill.json'),
);

try {
  const built = buildQaCatalog({ outputDir, dbPath });
  assert.equal(built.fileCount, 1);

  const catalog = createQaCatalog({ outputDir, dbPath });
  assert.equal(catalog.status().recordCount > 50, true);

  const search = catalog.search({
    query: '宠物技能升级 宠技要诀 满级',
    scope: 'pets',
    maxResults: 6,
  });
  assert.deepEqual(search.files, ['pet_skill']);
  assert.ok(search.documents.some((document) => document.pointer === '/'));

  const total = catalog.query({
    file: 'pet_skill',
    pointer: '/data/levels',
    filters: [{ path: '/upgradeCost/*/name', equals: '宠技要诀' }],
    value_path: '/upgradeCost/*/count',
    aggregate: 'sum',
  });
  assert.equal(total.value, 18638);
  assert.equal(total.matchedItems, 60);

  const count = catalog.query({
    file: 'pet_skill',
    pointer: '/data/levels',
    aggregate: 'count',
  });
  assert.equal(count.value, 60);

  const upgradeOnly = catalog.query({
    file: 'pet_skill',
    pointer: '/data/levels',
    filters: [
      { path: '/level', min: 2 },
      { path: '/upgradeCost/*/name', equals: '宠技要诀' },
    ],
    value_path: '/upgradeCost/*/count',
    aggregate: 'sum',
  });
  assert.equal(upgradeOnly.value, 18637);

  const level = catalog.read({ file: 'pet_skill', pointer: '/data/levels', offset: 59, limit: 1 });
  assert.equal(level.records[0].value.level, 60);
  assert.equal(level.records[0].value.upgradeCost[0].count, 545);
  catalog.close();
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
