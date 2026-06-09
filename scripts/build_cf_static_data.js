#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'output');
const PUBLIC_DATA_DIR = path.join(ROOT, 'frontend', 'public', 'data');
const MANIFEST_PATH = path.join(PUBLIC_DATA_DIR, 'manifest.json');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

if (!fs.existsSync(OUTPUT_DIR)) {
  throw new Error(`Missing output directory: ${OUTPUT_DIR}`);
}

ensureDir(PUBLIC_DATA_DIR);
for (const fileName of fs.readdirSync(PUBLIC_DATA_DIR).filter((name) => name.endsWith('.json'))) {
  fs.rmSync(path.join(PUBLIC_DATA_DIR, fileName), { force: true });
}

const files = fs.readdirSync(OUTPUT_DIR)
  .filter((name) => name.endsWith('.json'))
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

fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify({ generatedAt: new Date().toISOString(), files }, null, 2)}\n`, 'utf8');
console.log(`[cf-static-data] copied ${files.length} JSON files to ${PUBLIC_DATA_DIR}`);
