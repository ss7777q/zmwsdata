const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const utilsPath = path.join(repoRoot, 'scripts', 'lib', 'utils.js');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'load-table-filter-'));
const tempAppRoot = path.join(tempRoot, 'app');
const tempUtilsDir = path.join(tempAppRoot, 'scripts', 'lib');
const tempDataApiDir = path.join(tempAppRoot, 'dataApi');

try {
  fs.mkdirSync(tempUtilsDir, { recursive: true });
  fs.mkdirSync(tempDataApiDir, { recursive: true });
  fs.copyFileSync(utilsPath, path.join(tempUtilsDir, 'utils.js'));

  fs.writeFileSync(path.join(tempDataApiDir, 'sample.abc.json'), JSON.stringify([
    { id: 1, name: '正常配置' },
    { id: 2, name: '取消配置', cancel: 1 },
    { id: 3, name: '关闭配置', close: 1 },
    { id: 4, name: '显式开启配置', cancel: 0, close: 0 },
  ], null, 2), 'utf8');

  const utils = require(path.join(tempUtilsDir, 'utils.js'));
  const rows = utils.loadTable('sample');

  assert.deepStrictEqual(rows.map((row) => row.id), [1, 4]);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
