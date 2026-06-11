const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function runScript(scriptRelativePath, args = []) {
  const scriptPath = path.join(ROOT, scriptRelativePath);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: ROOT,
      env: process.env,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${path.basename(scriptRelativePath)} exited with code ${code}`));
    });
  });
}

async function main() {
  console.log('[pipeline] sync map resources from upstream');
  await runScript('scripts/sync_maps.js');

  console.log('[pipeline] sync battle config from upstream');
  await runScript('scripts/sync_battle_config.js');

  console.log('[pipeline] sync dataApi from upstream');
  await runScript('scripts/sync_data_api.js');

  console.log('[pipeline] extract resource summaries into output');
  await runScript('scripts/extract_all.js');

  console.log('[pipeline] done');
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
