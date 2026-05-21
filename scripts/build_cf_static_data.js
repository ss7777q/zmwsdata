#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { DEFAULT_SETTINGS, getConfiguredMaxLevel } = require('./lib/max-level-filter');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'output');
const PUBLIC_DATA_DIR = path.join(ROOT, 'frontend', 'public', 'data');
const MANIFEST_PATH = path.join(PUBLIC_DATA_DIR, 'manifest.json');
const EXCLUDED_OUTPUT_FILE_PATTERNS = [
  /^role_skill(?:_|$)/,
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyJsonFiles() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    throw new Error(`Missing output directory: ${OUTPUT_DIR}`);
  }

  const maxLevel = getConfiguredMaxLevel();

  ensureDir(PUBLIC_DATA_DIR);
  const existingFiles = fs.readdirSync(PUBLIC_DATA_DIR).filter((name) => name.endsWith('.json'));
  for (const fileName of existingFiles) {
    fs.rmSync(path.join(PUBLIC_DATA_DIR, fileName), { force: true });
  }

  const files = fs.readdirSync(OUTPUT_DIR)
    .filter((name) => name.endsWith('.json'))
    .filter((name) => !EXCLUDED_OUTPUT_FILE_PATTERNS.some((pattern) => pattern.test(name.slice(0, -5))))
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => {
      const sourcePath = path.join(OUTPUT_DIR, fileName);
      const targetPath = path.join(PUBLIC_DATA_DIR, fileName);
      fs.copyFileSync(sourcePath, targetPath);
      const stat = fs.statSync(sourcePath);
      return {
        name: fileName.slice(0, -5),
        size: stat.size,
        mtimeMs: Math.floor(stat.mtimeMs),
      };
    });

  const manifest = {
    generatedAt: new Date().toISOString(),
    maxLevel,
    defaultMaxLevel: DEFAULT_SETTINGS.data.maxLevel,
    files,
  };
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`[cf-static-data] copied ${files.length} JSON files to ${PUBLIC_DATA_DIR} (maxLevel=${maxLevel})`);
}

copyJsonFiles();
