const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(ROOT, 'file', 'runtime', 'update-change-report.json');

const EXPORT_JSON_STAGE = {
  key: 'output',
  label: 'exported JSON',
  fileExtensions: ['.json'],
  watchedPaths: [
    'output',
  ],
};

function toPortablePath(absolutePath) {
  return path.relative(ROOT, absolutePath).split(path.sep).join('/');
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function collectFiles(targetPath) {
  if (!fs.existsSync(targetPath)) return [];

  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return [targetPath];
  if (!stat.isDirectory()) return [];

  const files = [];
  const entries = fs.readdirSync(targetPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath));
      continue;
    }
    if (entry.isFile()) files.push(entryPath);
  }

  return files;
}

function takeSnapshot(watchedPaths, fileExtensions = null) {
  const snapshot = new Map();
  const allowedExtensions = fileExtensions ? new Set(fileExtensions) : null;

  for (const watchedPath of watchedPaths) {
    const absolutePath = path.join(ROOT, watchedPath);
    for (const filePath of collectFiles(absolutePath)) {
      if (allowedExtensions && !allowedExtensions.has(path.extname(filePath))) continue;
      snapshot.set(toPortablePath(filePath), hashFile(filePath));
    }
  }

  return snapshot;
}

function compareSnapshots(before, after) {
  const added = [];
  const modified = [];
  const deleted = [];

  for (const [filePath, afterHash] of after.entries()) {
    if (!before.has(filePath)) {
      added.push(filePath);
      continue;
    }
    if (before.get(filePath) !== afterHash) modified.push(filePath);
  }

  for (const filePath of before.keys()) {
    if (!after.has(filePath)) deleted.push(filePath);
  }

  return {
    added: added.sort((left, right) => left.localeCompare(right)),
    modified: modified.sort((left, right) => left.localeCompare(right)),
    deleted: deleted.sort((left, right) => left.localeCompare(right)),
  };
}

function countChanges(changes) {
  return changes.added.length + changes.modified.length + changes.deleted.length;
}

function printFileList(title, files) {
  if (files.length === 0) return;
  console.log(`    ${title}:`);
  for (const filePath of files) console.log(`      ${filePath}`);
}

function printStageReport(stage, changes) {
  const total = countChanges(changes);
  console.log(`[pipeline] ${stage.label} changes: ${total}`);
  if (total === 0) return;

  printFileList('added', changes.added);
  printFileList('modified', changes.modified);
  printFileList('deleted', changes.deleted);
}

function summarizeStage(stage, changes) {
  return {
    key: stage.key,
    label: stage.label,
    watchedPaths: stage.watchedPaths,
    counts: {
      added: changes.added.length,
      modified: changes.modified.length,
      deleted: changes.deleted.length,
      total: countChanges(changes),
    },
    changes,
  };
}

function writeReport(stages) {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  const totals = stages.reduce((acc, stage) => {
    acc.added += stage.counts.added;
    acc.modified += stage.counts.modified;
    acc.deleted += stage.counts.deleted;
    acc.total += stage.counts.total;
    return acc;
  }, { added: 0, modified: 0, deleted: 0, total: 0 });

  fs.writeFileSync(REPORT_PATH, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    totals,
    stages,
  }, null, 2)}\n`, 'utf8');
}

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
  await runScript('scripts/sync_battle_config.js', ['--refresh-manifest']);

  console.log('[pipeline] sync dataApi from upstream');
  await runScript('scripts/sync_data_api.js');

  console.log('[pipeline] extract resource summaries into output');
  const beforeExport = takeSnapshot(EXPORT_JSON_STAGE.watchedPaths, EXPORT_JSON_STAGE.fileExtensions);
  await runScript('scripts/extract_all.js');
  const exportChanges = compareSnapshots(
    beforeExport,
    takeSnapshot(EXPORT_JSON_STAGE.watchedPaths, EXPORT_JSON_STAGE.fileExtensions),
  );
  printStageReport(EXPORT_JSON_STAGE, exportChanges);

  writeReport([summarizeStage(EXPORT_JSON_STAGE, exportChanges)]);
  console.log(`[pipeline] change report: ${REPORT_PATH}`);

  console.log('[pipeline] done');
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
