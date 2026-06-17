#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'output');
const PUBLIC_DATA_DIR = path.join(ROOT, 'frontend', 'public', 'data');
const MANIFEST_PATH = path.join(PUBLIC_DATA_DIR, 'manifest.json');
const { DEFAULT_SETTINGS, loadAppSettings } = require('../server/app-config');

function getConfiguredMaxLevel() {
  const settings = loadAppSettings();
  const value = Number(settings.data?.maxLevel);
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_SETTINGS.data.maxLevel;
}

function collectLevelHints(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return [];

  const hints = [];
  const directKeys = [
    'roleLevelRequired',
    'roleLevel',
    'levelRequired',
    'needLevel',
    'openLevel',
    'upLevelLimits',
    'maxLevelRequired',
    'levelRequirement',
    'level',
    'lv',
    'wingLevel'
  ];

  for (const key of directKeys) {
    const value = node[key];
    if (typeof value === 'number' && Number.isFinite(value)) hints.push(value);
  }

  const upLimit = node.upLimit;
  if (Array.isArray(upLimit)) {
    if (upLimit.length === 2 && upLimit.every((value) => typeof value === 'number' && Number.isFinite(value))) {
      hints.push(upLimit[1]);
    }
    for (const entry of upLimit) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      if (Number(entry.type) !== 1 || !Array.isArray(entry.values)) continue;
      for (const value of entry.values) {
        if (typeof value === 'number' && Number.isFinite(value)) hints.push(value);
      }
    }
  }

  return hints;
}

function shouldDropByMaxLevel(node, maxLevel) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  if (typeof node.levelStart === 'number' && Number.isFinite(node.levelStart)) return node.levelStart > maxLevel;
  return collectLevelHints(node).some((value) => value > maxLevel);
}

function applyMaxLevel(value, maxLevel) {
  if (maxLevel == null) return value;
  if (Array.isArray(value)) {
    return value
      .map((entry) => applyMaxLevel(entry, maxLevel))
      .filter((entry) => entry !== undefined);
  }
  if (!value || typeof value !== 'object') return value;
  if (shouldDropByMaxLevel(value, maxLevel)) return undefined;

  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    const filteredEntry = applyMaxLevel(entry, maxLevel);
    if (filteredEntry !== undefined) next[key] = filteredEntry;
  }

  if (Array.isArray(value.levels) && value.levels.length > 0 && Array.isArray(next.levels) && next.levels.length === 0) {
    return undefined;
  }
  if (Array.isArray(next.levels) && next.levels.length > 0 && typeof next.maxLevel === 'number') {
    const lastLevel = next.levels[next.levels.length - 1]?.level;
    if (typeof lastLevel === 'number' && Number.isFinite(lastLevel)) next.maxLevel = lastLevel;
  }
  if (
    typeof next.levelStart === 'number' &&
    Number.isFinite(next.levelStart) &&
    typeof next.levelEnd === 'number' &&
    Number.isFinite(next.levelEnd) &&
    next.levelEnd > maxLevel
  ) {
    next.levelEnd = maxLevel;
  }

  return next;
}

function shouldSkipMaxLevelFilter(name) {
  return name === 'role_honor' || name === 'boss_stage_stats' || name.startsWith('boss_type_');
}

function withAppliedFilter(name, content, maxLevel) {
  if (maxLevel == null || shouldSkipMaxLevelFilter(name) || !content || typeof content !== 'object') return content;
  if (!('data' in content)) return applyMaxLevel(content, maxLevel);
  return { ...content, data: applyMaxLevel(content.data, maxLevel) };
}

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

const configuredMaxLevel = getConfiguredMaxLevel();

const files = fs.readdirSync(OUTPUT_DIR)
  .filter((name) => name.endsWith('.json'))
  .sort((left, right) => left.localeCompare(right))
  .map((fileName) => {
    const sourcePath = path.join(OUTPUT_DIR, fileName);
    const targetPath = path.join(PUBLIC_DATA_DIR, fileName);
    const name = fileName.slice(0, -5);
    const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const filtered = withAppliedFilter(name, source, configuredMaxLevel);
    fs.writeFileSync(targetPath, `${JSON.stringify(filtered)}\n`, 'utf8');
    const stat = fs.statSync(targetPath);
    return {
      name,
      size: stat.size,
      mtimeMs: Math.floor(stat.mtimeMs),
    };
  });

fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify({ generatedAt: new Date().toISOString(), maxLevel: configuredMaxLevel, files }, null, 2)}\n`, 'utf8');
console.log(`[cf-static-data] copied ${files.length} JSON files to ${PUBLIC_DATA_DIR} with maxLevel=${configuredMaxLevel}`);
