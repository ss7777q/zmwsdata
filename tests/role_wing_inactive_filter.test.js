const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const utils = require(path.join(repoRoot, 'scripts', 'lib', 'utils.js'));
const wingRows = JSON.parse(fs.readFileSync(utils.findTableFile('wing'), 'utf8'));
const inactiveWingButeIds = new Set(
  wingRows.filter((row) => utils.isInactiveDataApiRow(row)).map((row) => row.buteId)
);
const outputPath = path.join(repoRoot, 'output', 'role_wing_upgrade.json');
const parsed = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
const rows = Array.isArray(parsed) ? parsed : parsed.data;

assert.ok(inactiveWingButeIds.size > 0, '测试数据应包含停用翅膀');

for (const row of rows) {
  assert.ok(!inactiveWingButeIds.has(row.buteId), `停用翅膀不应导出: ${row.buteId}`);
  assert.ok(!/^翅膀\d+$/.test(row.wingName), `翅膀名称不应使用占位名: ${row.wingName}`);
}
