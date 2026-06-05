const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefield-file-match-'));
const tempDataApiDir = path.join(tempRoot, 'dataApi');
const realReaddirSync = fs.readdirSync;

const heroes = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const mounts = [
  '241001',
  '201071',
  '201091',
  '201011',
  '201021',
  '201031',
  '201051',
  '201061',
  '201101',
  '201701',
  '201201',
  '201301',
  '201401',
  '201501',
  '201602',
  '201801',
];
const demonKings = ['213010', '213020', '213030', '213040', '213160', '213180', '213200', '213220', '213300', '213340', '213390'];

function writeJson(fileName, rows) {
  fs.writeFileSync(path.join(tempDataApiDir, fileName), JSON.stringify(rows, null, 2), 'utf8');
}

function buildMonsterRows() {
  return [
    ...heroes.map((baseId) => ({ id: `1${baseId}07` })),
    ...mounts.map((baseId) => ({ id: `${baseId}07` })),
    { id: '2131207' },
    ...demonKings.map((baseId) => ({ id: `${baseId}6` })),
  ];
}

try {
  fs.mkdirSync(tempDataApiDir, { recursive: true });
  writeJson('monsterAttribute.aaa.json', [{ id: 70 }]);
  writeJson('monster.bbb.json', buildMonsterRows());
  writeJson('godWarAttribute.ccc.json', [{ id: 70 }]);
  writeJson('godWarCrystal.ddd.json', [{ id: 70 }]);

  fs.readdirSync = function patchedReaddirSync(directoryPath, options) {
    if (path.resolve(directoryPath) === tempDataApiDir) {
      return [
        'monsterAttribute.aaa.json',
        'monster.bbb.json',
        'godWarAttribute.ccc.json',
        'godWarCrystal.ddd.json',
      ];
    }
    return realReaddirSync.call(fs, directoryPath, options);
  };

  const { createBattlefieldService } = require(path.join(repoRoot, 'server', 'battlefield-service.js'));
  const config = createBattlefieldService({ dataApiDir: tempDataApiDir }).getConfig();

  assert.strictEqual(path.basename(config.source.files.monster), 'monster.bbb.json');
  assert.deepStrictEqual(config.selectors.battlefieldTier.values, [1]);
  assert.deepStrictEqual(config.selectors.bossStage.values, [6]);
} finally {
  fs.readdirSync = realReaddirSync;
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
