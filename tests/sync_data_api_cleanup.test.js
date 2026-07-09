const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const EXPECTED_SUCCESS_STATUS = 0;

const fixtureHtml = '<!doctype html><script src="src/settings.test.js"></script>';
const settingsCode = 'window._CCSettings = { bundleVers: { main: "testmain" }, jsList: ["assets/script/config/newTable.123.js", "assets/script/lib/zlib.min.abc.js"] };';
const tableCode = 'module.exports = [["id","name"],[1,"新版"]];';
const libCode = 'window.zlibLoaded = true;';
const runtimeMainCode = 'window.__require={breathingAcupoint:[function(e,t){"use strict";var i=[["id","breathingId","type","level","attribute","attributeValue"],[10101000,1,1,0,"hitVal",0],[10101001,1,1,1,"hitVal",6]];t.exports=i},{}],breathing:[function(e,t){"use strict";var i=[["id","name","breathingAcupointType","impacCuriosity","curiosityQuality","breakItemQuality","breakItem","unlock","bigPicture","picture","close"],[1,"抱守归一",[1],[],[],[[1,2],[0,0],[0,.2]],[],[],"bre_big_1","bre_1",0]];t.exports=i},{}]};';
const staleTableCode = 'module.exports = [["id"],[999]];';
const staleJsonCode = '[{"id":999}]\n';
const staleNestedJsonCode = '[{"id":888}]\n';

function copyScript(sourceRoot, targetRoot) {
  const sourceScript = path.join(sourceRoot, 'scripts', 'sync_data_api.js');
  const targetScriptDir = path.join(targetRoot, 'scripts');
  fs.mkdirSync(targetScriptDir, { recursive: true });
  fs.copyFileSync(sourceScript, path.join(targetScriptDir, 'sync_data_api.js'));
}

function createClientFixture(clientRoot) {
  fs.mkdirSync(path.join(clientRoot, 'src'), { recursive: true });
  fs.mkdirSync(path.join(clientRoot, 'src', 'assets', 'script', 'config'), { recursive: true });
  fs.mkdirSync(path.join(clientRoot, 'src', 'assets', 'script', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(clientRoot, 'assets', 'main'), { recursive: true });

  fs.writeFileSync(path.join(clientRoot, 'index.html'), fixtureHtml, 'utf8');
  fs.writeFileSync(path.join(clientRoot, 'src', 'settings.test.js'), settingsCode, 'utf8');
  fs.writeFileSync(path.join(clientRoot, 'src', 'assets', 'script', 'config', 'newTable.123.js'), tableCode, 'utf8');
  fs.writeFileSync(path.join(clientRoot, 'src', 'assets', 'script', 'lib', 'zlib.min.abc.js'), libCode, 'utf8');
  fs.writeFileSync(path.join(clientRoot, 'assets', 'main', 'index.testmain.js'), runtimeMainCode, 'utf8');
}

function createStaleDataApi(dataApiRoot) {
  fs.mkdirSync(path.join(dataApiRoot, 'old-version'), { recursive: true });
  fs.writeFileSync(path.join(dataApiRoot, 'oldTable.001.js'), staleTableCode, 'utf8');
  fs.writeFileSync(path.join(dataApiRoot, 'oldTable.001.json'), staleJsonCode, 'utf8');
  fs.writeFileSync(path.join(dataApiRoot, 'old-version', 'nested.json'), staleNestedJsonCode, 'utf8');
}

function createFixtureServerScript(scriptPath) {
  const serverCode = `
const fs = require('fs');
const http = require('http');
const path = require('path');

const clientRoot = process.argv[2];
const HTTP_OK = ${HTTP_OK};
const HTTP_FORBIDDEN = ${HTTP_FORBIDDEN};
const HTTP_NOT_FOUND = ${HTTP_NOT_FOUND};

const server = http.createServer((request, response) => {
  const requestPath = new URL(request.url, 'http://127.0.0.1').pathname;
  const filePath = path.resolve(clientRoot, decodeURIComponent(requestPath === '/' ? 'index.html' : requestPath.slice(1)));
  if (!filePath.startsWith(clientRoot)) {
    response.writeHead(HTTP_FORBIDDEN);
    response.end('forbidden');
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(HTTP_NOT_FOUND);
    response.end('not found');
    return;
  }
  response.writeHead(HTTP_OK, { 'content-type': 'application/javascript; charset=utf-8' });
  response.end(fs.readFileSync(filePath));
});

server.listen(0, '127.0.0.1', () => {
  process.stdout.write(String(server.address().port));
});
`;
  fs.writeFileSync(scriptPath, serverCode, 'utf8');
}

function runNode(args, options) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, options);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function startFixtureServer(serverScript, clientRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverScript, clientRoot], { encoding: 'utf8' });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdout.once('data', (chunk) => {
      resolve({ child, port: String(chunk).trim() });
    });
    child.on('exit', (status) => {
      reject(new Error(`fixture server exited with ${status}: ${stderr}`));
    });
  });
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-data-api-'));
  const appRoot = path.join(tempRoot, 'app');
  const clientRoot = path.join(tempRoot, 'client');
  const serverScript = path.join(tempRoot, 'fixture-server.js');
  let serverProcess = null;

  try {
    copyScript(repoRoot, appRoot);
    createClientFixture(clientRoot);
    createStaleDataApi(path.join(appRoot, 'dataApi'));
    createFixtureServerScript(serverScript);

    const server = await startFixtureServer(serverScript, clientRoot);
    serverProcess = server.child;

    const result = await runNode([
      path.join(appRoot, 'scripts', 'sync_data_api.js'),
      `http://127.0.0.1:${server.port}/`,
    ], {
      cwd: appRoot,
      encoding: 'utf8',
    });

    assert.strictEqual(result.status, EXPECTED_SUCCESS_STATUS, `${result.stdout}\n${result.stderr}`);

    const dataApiEntries = fs.readdirSync(path.join(appRoot, 'dataApi')).sort();
    assert.deepStrictEqual(dataApiEntries, [
      'breathing.runtime.json',
      'breathingAcupoint.runtime.json',
      'newTable.123.js',
      'newTable.123.json',
      'zlib.min.abc.js',
    ]);

    const newJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'dataApi', 'newTable.123.json'), 'utf8'));
    assert.deepStrictEqual(newJson, [{ id: 1, name: '新版' }]);

    const breathingJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'dataApi', 'breathing.runtime.json'), 'utf8'));
    assert.deepStrictEqual(breathingJson, [{
      id: 1,
      name: '抱守归一',
      breathingAcupointType: [1],
      impacCuriosity: [],
      curiosityQuality: [],
      breakItemQuality: [[1, 2], [0, 0], [0, 0.2]],
      breakItem: [],
      unlock: [],
      bigPicture: 'bre_big_1',
      picture: 'bre_1',
      close: 0,
    }]);

    assert.ok(fs.existsSync(path.join(appRoot, 'data', 'runtime', 'main-index.js')));
  } finally {
    if (serverProcess) serverProcess.kill();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
