#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SYNC_DATA_API_SCRIPT = path.join(__dirname, 'sync_data_api.js');
const RUNTIME_DIR = path.join(ROOT, 'data', 'runtime');
const MAIN_INDEX_PATH = path.join(RUNTIME_DIR, 'main-index.js');
const MAIN_META_PATH = path.join(RUNTIME_DIR, 'main-index.meta.json');

function printUsage() {
  console.log(`用法:
  node scripts/update_main_data_api.js [client-url]

功能:
  1. 下载上游 dataApi 配置并转换为 JSON
  2. 下载上游 assets/main/index.<md5>.js
  3. 将主程序保存为 data/runtime/index.<md5>.js

默认上游地址:
  https://client-zmxyol.3304399.net/client/`);
}

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    return null;
  }

  const positional = argv.filter((arg) => !arg.startsWith('--'));
  if (positional.length > 1) {
    throw new Error('只允许传入一个上游客户端地址');
  }

  const unsupported = argv.filter((arg) => arg.startsWith('--'));
  if (unsupported.length > 0) {
    throw new Error(`不支持的参数: ${unsupported.join(', ')}`);
  }

  return positional[0] || null;
}

function readMainMetadata() {
  if (!fs.existsSync(MAIN_META_PATH)) {
    throw new Error(`同步完成后未找到主程序元数据: ${MAIN_META_PATH}`);
  }

  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(MAIN_META_PATH, 'utf8'));
  } catch (error) {
    throw new Error(`主程序元数据不是有效 JSON: ${error.message}`);
  }

  const version = String(metadata.bundleVersion || '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(version)) {
    throw new Error(`主程序 MD5/版本号不安全或为空: ${version || '(empty)'}`);
  }

  if (!metadata.sourceUrl || !/\/index\.[^/]+\.js(?:\?.*)?$/i.test(metadata.sourceUrl)) {
    throw new Error(`主程序来源不是 index.<md5>.js: ${metadata.sourceUrl || '(empty)'}`);
  }

  if (!fs.existsSync(MAIN_INDEX_PATH)) {
    throw new Error(`同步完成后未找到主程序内容: ${MAIN_INDEX_PATH}`);
  }

  const stat = fs.statSync(MAIN_INDEX_PATH);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`主程序文件为空: ${MAIN_INDEX_PATH}`);
  }

  return { metadata, version };
}

function saveVersionedMainFile(version) {
  const fileName = `index.${version}.js`;
  const targetPath = path.join(RUNTIME_DIR, fileName);
  const temporaryPath = `${targetPath}.tmp-${process.pid}`;

  fs.copyFileSync(MAIN_INDEX_PATH, temporaryPath);
  try {
    fs.renameSync(temporaryPath, targetPath);
  } catch (error) {
    if (error.code !== 'EEXIST' && error.code !== 'EPERM') {
      throw error;
    }
    fs.rmSync(targetPath, { force: true });
    fs.renameSync(temporaryPath, targetPath);
  }

  return { fileName, targetPath, size: fs.statSync(targetPath).size };
}

function runSyncDataApi(clientUrl) {
  const args = [SYNC_DATA_API_SCRIPT];
  if (clientUrl) args.push(clientUrl);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
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
      reject(new Error(`sync_data_api.js 执行失败，退出码: ${code}`));
    });
  });
}

async function main() {
  const clientUrl = parseArgs(process.argv.slice(2));
  if (clientUrl === null && process.argv.slice(2).some((arg) => arg === '--help' || arg === '-h')) {
    return;
  }

  const startedAt = Date.now();
  console.log('[update_main_data_api] 开始更新主程序和 dataApi');
  await runSyncDataApi(clientUrl);

  const { metadata, version } = readMainMetadata();
  const syncedAt = Date.parse(metadata.syncedAt || '');
  if (Number.isFinite(syncedAt) && syncedAt < startedAt - 5000) {
    throw new Error('主程序元数据时间没有更新，可能仍然是上一次同步结果');
  }

  const versionedMain = saveVersionedMainFile(version);
  console.log(`[update_main_data_api] 主程序: ${versionedMain.fileName} (${versionedMain.size} bytes)`);
  console.log(`[update_main_data_api] 主程序兼容副本: ${path.relative(ROOT, MAIN_INDEX_PATH)}`);
  console.log(`[update_main_data_api] dataApi: ${path.relative(ROOT, path.join(ROOT, 'dataApi'))}`);
  console.log('[update_main_data_api] 更新完成');
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
