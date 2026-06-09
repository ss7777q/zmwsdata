#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOWNLOADER = path.join(__dirname, 'cocos_resource_downloader.mjs');
const MANIFEST = path.join(ROOT, 'file', 'runtime', 'cocos-battle-config-manifest.json');
const OUT_DIR = path.join(ROOT, 'file', 'battle-config');
const STAGING_DIR = path.join(ROOT, 'file', 'runtime', 'battle-config-staging');
const STAGING_RESOURCES_DIR = path.join(STAGING_DIR, 'resources');
const BACKUP_DIR = path.join(ROOT, 'file', 'runtime', 'battle-config-backup');
const DEFAULT_BASE_URL = 'https://client-zmxyol.3304399.net/client/';
const SUCCESS_STATUS = 0;
const PARTIAL_FAILURE_STATUS = 2;
const DOWNLOAD_RETRY_COUNT = 5;
const DOWNLOAD_TIMEOUT_MS = 60000;
const DOWNLOAD_CONCURRENCY = 4;
const DOWNLOAD_PASS_COUNT = 3;
const DIRECT_REPLACE_ERROR_CODES = new Set(['EACCES', 'EPERM', 'EXDEV']);
const REQUIRED_BULLETS_FILE = 'bullets.json';
const REQUIRED_ENTITY_DIR = 'entityCtg';
const REQUIRED_ENTITY_FILE_EXTENSION = '.json';

const argv = process.argv.slice(2);
const options = parseArgs(argv);

function runDownloader(args, allowedStatuses = [SUCCESS_STATUS]) {
  const result = spawnSync(process.execPath, [DOWNLOADER, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  const status = result.status == null ? 1 : result.status;
  if (!allowedStatuses.includes(status)) {
    throw new Error(`cocos_resource_downloader.mjs exited with code ${result.status || 1}`);
  }

  return status;
}

function parseArgs(args) {
  const parsed = {
    baseUrl: DEFAULT_BASE_URL,
    dryRun: false,
    overwrite: false,
    refreshManifest: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (arg === '--overwrite') {
      parsed.overwrite = true;
      continue;
    }
    if (arg === '--refresh-manifest') {
      parsed.refreshManifest = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      parsed.baseUrl = arg;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  return parsed;
}

function downloaderNetworkArgs() {
  return [
    '--retry', String(DOWNLOAD_RETRY_COUNT),
    '--timeout-ms', String(DOWNLOAD_TIMEOUT_MS),
  ];
}

function downloaderDownloadArgs() {
  return [
    ...downloaderNetworkArgs(),
    '--concurrency', String(DOWNLOAD_CONCURRENCY),
  ];
}

function battleConfigDownloadArgs() {
  return [
    'download',
    '--manifest', MANIFEST,
    '--targets', 'json-asset',
    '--bundles', 'resources',
    '--path-prefix', 'entityCtg/,bullets',
    '--out', STAGING_DIR,
    '--base', options.baseUrl,
    ...downloaderDownloadArgs(),
    ...(options.overwrite ? ['--overwrite'] : []),
  ];
}

function runBattleConfigDownload() {
  let lastStatus = SUCCESS_STATUS;
  for (let pass = 1; pass <= DOWNLOAD_PASS_COUNT; pass += 1) {
    if (pass > 1) {
      console.log(`[sync_battle_config] retrying incomplete download pass ${pass}/${DOWNLOAD_PASS_COUNT}`);
    }

    lastStatus = runDownloader(
      battleConfigDownloadArgs(),
      [SUCCESS_STATUS, PARTIAL_FAILURE_STATUS],
    );

    if (lastStatus === SUCCESS_STATUS) {
      return true;
    }
  }

  return false;
}

function removeDirectory(targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
}

function ensureDirectory(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
}

function listEntityJsonFiles(entityDir) {
  if (!fs.existsSync(entityDir)) {
    return [];
  }
  return fs.readdirSync(entityDir).filter((name) => name.endsWith(REQUIRED_ENTITY_FILE_EXTENSION));
}

function validateBattleConfig(configDir) {
  const bulletsPath = path.join(configDir, REQUIRED_BULLETS_FILE);
  if (!fs.existsSync(bulletsPath)) {
    throw new Error(`missing required battle config: ${bulletsPath}`);
  }

  const entityDir = path.join(configDir, REQUIRED_ENTITY_DIR);
  const entityFiles = listEntityJsonFiles(entityDir);
  if (entityFiles.length === 0) {
    throw new Error(`missing required battle config directory or json files: ${entityDir}`);
  }

  return {
    bulletsPath,
    entityDir,
    entityCount: entityFiles.length,
  };
}

function replaceDirectory(sourceDir, targetDir) {
  removeDirectory(BACKUP_DIR);
  ensureDirectory(path.dirname(targetDir));

  let movedExistingToBackup = false;
  try {
    if (fs.existsSync(targetDir)) {
      try {
        fs.renameSync(targetDir, BACKUP_DIR);
        movedExistingToBackup = true;
      } catch (error) {
        if (!DIRECT_REPLACE_ERROR_CODES.has(error.code)) {
          throw error;
        }
        console.warn(`[sync_battle_config] backup rename failed (${error.code}); using direct cache replace`);
        replaceDirectoryDirect(sourceDir, targetDir);
        return;
      }
    }
    fs.renameSync(sourceDir, targetDir);
    removeDirectory(BACKUP_DIR);
  } catch (error) {
    if (movedExistingToBackup) {
      removeDirectory(targetDir);
    }
    if (movedExistingToBackup && fs.existsSync(BACKUP_DIR)) {
      fs.renameSync(BACKUP_DIR, targetDir);
    }
    throw error;
  }
}

function replaceDirectoryDirect(sourceDir, targetDir) {
  removeDirectory(targetDir);
  try {
    fs.renameSync(sourceDir, targetDir);
  } catch (renameError) {
    fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
    removeDirectory(sourceDir);
  }
}

function syncBattleConfig() {
  ensureDirectory(path.dirname(MANIFEST));
  const canRefreshStaleManifest = !options.refreshManifest && fs.existsSync(MANIFEST);
  if (options.refreshManifest && fs.existsSync(MANIFEST)) {
    fs.unlinkSync(MANIFEST);
  }

  if (options.refreshManifest || !fs.existsSync(MANIFEST)) {
    runDownloader([
      'scan',
      '--manifest', MANIFEST,
      '--base', options.baseUrl,
      ...downloaderNetworkArgs(),
    ]);
  } else {
    console.log(`[sync_battle_config] using cached manifest: ${MANIFEST}`);
  }

  if (options.dryRun) {
    runDownloader([
      'download',
      '--manifest', MANIFEST,
      '--targets', 'json-asset',
      '--bundles', 'resources',
      '--path-prefix', 'entityCtg/,bullets',
      '--out', STAGING_DIR,
      '--base', options.baseUrl,
      '--dry-run',
      ...downloaderDownloadArgs(),
      ...(options.overwrite ? ['--overwrite'] : []),
    ]);
    return;
  }

  removeDirectory(STAGING_DIR);
  ensureDirectory(STAGING_DIR);

  if (!runBattleConfigDownload()) {
    if (!canRefreshStaleManifest) {
      throw new Error(`battle config download incomplete after ${DOWNLOAD_PASS_COUNT} passes`);
    }

    console.log('[sync_battle_config] cached manifest download incomplete; refreshing manifest and retrying');
    removeDirectory(STAGING_DIR);
    ensureDirectory(STAGING_DIR);
    if (fs.existsSync(MANIFEST)) {
      fs.unlinkSync(MANIFEST);
    }
    runDownloader([
      'scan',
      '--manifest', MANIFEST,
      '--base', options.baseUrl,
      ...downloaderNetworkArgs(),
    ]);

    if (!runBattleConfigDownload()) {
      throw new Error(`battle config download incomplete after manifest refresh and ${DOWNLOAD_PASS_COUNT} passes`);
    }
  }

  const validation = validateBattleConfig(STAGING_RESOURCES_DIR);
  replaceDirectory(STAGING_RESOURCES_DIR, OUT_DIR);
  removeDirectory(STAGING_DIR);

  console.log(`[sync_battle_config] bullets: ${validation.bulletsPath}`);
  console.log(`[sync_battle_config] entityCtg json files: ${validation.entityCount}`);
  console.log(`[sync_battle_config] synced to: ${OUT_DIR}`);
}

try {
  syncBattleConfig();
} catch (error) {
  removeDirectory(STAGING_DIR);
  console.error(error.stack || error.message || String(error));
  process.exit(1);
}
