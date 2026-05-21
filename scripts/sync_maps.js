#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOWNLOADER = path.join(__dirname, 'cocos_resource_downloader.mjs');
const MANIFEST = path.join(ROOT, 'file', 'runtime', 'cocos-map-manifest.json');
const OUT_DIR = path.join(ROOT, 'file', 'map-cache');
const argv = process.argv.slice(2);
const overwrite = argv.includes('--overwrite');
const baseUrlArg = argv.find((arg) => !arg.startsWith('--'));
const BASE_URL = baseUrlArg || 'https://client-zmxyol.3304399.net/client/';

function runDownloader(args) {
  const result = spawnSync(process.execPath, [DOWNLOADER, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  if (result.status === 2 && args[0] === 'download') {
    console.warn('[sync_maps] map download completed with some missing upstream resources (HTTP 404), continuing');
    return;
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

if (fs.existsSync(MANIFEST)) {
  fs.unlinkSync(MANIFEST);
}

runDownloader([
  'scan',
  '--manifest', MANIFEST,
  '--base', BASE_URL,
]);

runDownloader([
  'download',
  '--manifest', MANIFEST,
  '--targets', 'json-asset',
  '--bundles', 'resources',
  '--path-prefix', 'map/',
  '--out', OUT_DIR,
  '--base', BASE_URL,
  ...(overwrite ? ['--overwrite'] : []),
]);
