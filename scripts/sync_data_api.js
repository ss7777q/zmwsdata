#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'dataApi');
const RUNTIME_DIR = path.join(ROOT, 'data', 'runtime');
const RUNTIME_MAIN_INDEX_PATH = path.join(RUNTIME_DIR, 'main-index.js');
const RUNTIME_MAIN_META_PATH = path.join(RUNTIME_DIR, 'main-index.meta.json');
const CLIENT_URL = process.argv[2] || 'https://client-zmxyol.3304399.net/client/';
const CONCURRENCY = 8;
const ROGUE_ITEM_FILENAME_RE = /^rogueItem\./;
const ROGUE_ITEM_OFFICIAL_DESCRIPTION_COLUMN_INDEX = 4;
const RUNTIME_EMBEDDED_TABLES = ['breathing', 'breathingAcupoint'];

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`请求失败 ${res.status} ${res.statusText}: ${url}`);
  }
  return res.text();
}

function resolveUrl(base, relative) {
  return new URL(relative, base).toString();
}

function parseSettingsScriptPath(html) {
  const match = html.match(/<script\s+src=["'](src\/settings\.[^"']+\.js)["']/i);
  if (!match) {
    throw new Error('未在页面 HTML 中找到 settings 脚本');
  }
  return match[1];
}

function loadCcSettings(settingsCode) {
  const sandbox = { window: {} };
  vm.runInNewContext(settingsCode, sandbox, { timeout: 5000, filename: 'settings.js' });
  const settings = sandbox.window && sandbox.window._CCSettings;
  if (!settings || !Array.isArray(settings.jsList)) {
    throw new Error('未在 settings 脚本中解析到 window._CCSettings.jsList');
  }
  return settings;
}

function pickDownloadEntries(jsList) {
  return jsList.filter((entry) => {
    return entry.startsWith('assets/script/config/') || entry.startsWith('assets/script/lib/zlib.min.');
  });
}

function resolveMainBundleEntry(settings) {
  const mainVersion = settings && settings.bundleVers && settings.bundleVers.main;
  return mainVersion ? `assets/main/index.${mainVersion}.js` : null;
}

function cleanDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    return;
  }
  for (const name of fs.readdirSync(DATA_DIR)) {
    fs.rmSync(path.join(DATA_DIR, name), { recursive: true, force: true });
  }
}

function extractTable(jsCode, filename) {
  const sandbox = {
    module: { exports: undefined },
    exports: {},
    window: { __IS_SERVER__: true },
    __IS_SERVER__: true,
  };
  vm.runInNewContext(jsCode, sandbox, { timeout: 5000, filename });
  const table = sandbox.module.exports;
  if (!Array.isArray(table) || table.length === 0 || !Array.isArray(table[0])) {
    throw new Error(`无法从 ${filename} 提取表数据`);
  }
  return table;
}

function normalizeHeaders(headers, filename) {
  const normalized = [...headers];
  if (ROGUE_ITEM_FILENAME_RE.test(filename) && !normalized[ROGUE_ITEM_OFFICIAL_DESCRIPTION_COLUMN_INDEX]) {
    normalized[ROGUE_ITEM_OFFICIAL_DESCRIPTION_COLUMN_INDEX] = 'officialDescription';
  }
  return normalized;
}

function extractBracketLiteral(text, startIndex, label) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const ch = text[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '[') depth += 1;
    if (ch === ']') {
      depth -= 1;
      if (depth === 0) return text.slice(startIndex, index + 1);
    }
  }

  throw new Error(`${label} 数组字面量未闭合`);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractRuntimeEmbeddedTable(runtimeCode, tableName) {
  const moduleRe = new RegExp(`(?:^|[,{])\\s*${escapeRegExp(tableName)}\\s*:\\s*\\[function\\s*\\([^)]*\\)\\s*\\{`, 'g');
  const moduleMatch = moduleRe.exec(runtimeCode);
  if (!moduleMatch) {
    throw new Error(`运行时主程序未找到内嵌表模块: ${tableName}`);
  }

  const moduleStart = moduleMatch.index;
  const varRe = /\bvar\s+([A-Za-z_$][\w$]*)\s*=\s*\[/g;
  varRe.lastIndex = moduleStart;
  const varMatch = varRe.exec(runtimeCode);
  if (!varMatch) {
    throw new Error(`运行时内嵌表 ${tableName} 未找到数组变量`);
  }

  const arrayStart = varRe.lastIndex - 1;
  const literal = extractBracketLiteral(runtimeCode, arrayStart, `runtime.${tableName}`);
  const matrix = vm.runInNewContext(literal, Object.create(null), { timeout: 5000, filename: `runtime.${tableName}.js` });
  if (!Array.isArray(matrix) || !Array.isArray(matrix[0])) {
    throw new Error(`运行时内嵌表 ${tableName} 不是表头数组格式`);
  }
  return matrix;
}

function tableToObjects(table, filename) {
  const headers = normalizeHeaders(table[0], filename);
  const rows = table.slice(1);
  return rows.map((row) => {
    const record = {};
    for (let index = 0; index < headers.length; index += 1) {
      const key = headers[index];
      if (!key) continue;
      record[key] = row[index] === undefined ? null : row[index];
    }
    return record;
  });
}

async function runPool(items, worker, concurrency) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(workers);
}

async function syncRuntimeEmbeddedTables(settingsUrl, settings) {
  const mainBundleEntry = resolveMainBundleEntry(settings);
  if (!mainBundleEntry) {
    console.warn('未在 settings.bundleVers 中找到 main bundle 版本，跳过运行时内嵌表同步');
    return;
  }

  const mainBundleUrl = resolveUrl(settingsUrl, `../${mainBundleEntry}`);
  let runtimeCode;
  try {
    runtimeCode = await fetchText(mainBundleUrl);
  } catch (error) {
    console.warn(`无法下载运行时主程序，跳过内嵌表同步: ${error.message}`);
    return;
  }

  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(RUNTIME_MAIN_INDEX_PATH, runtimeCode, 'utf8');
  fs.writeFileSync(RUNTIME_MAIN_META_PATH, `${JSON.stringify({
    sourceUrl: mainBundleUrl,
    bundleVersion: settings.bundleVers.main,
    syncedAt: new Date().toISOString(),
    embeddedTables: RUNTIME_EMBEDDED_TABLES,
  }, null, 2)}\n`, 'utf8');

  for (const tableName of RUNTIME_EMBEDDED_TABLES) {
    const table = extractRuntimeEmbeddedTable(runtimeCode, tableName);
    const json = tableToObjects(table, `${tableName}.runtime.js`);
    const jsonPath = path.join(DATA_DIR, `${tableName}.runtime.json`);
    fs.writeFileSync(jsonPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    console.log(`已从运行时提取 ${tableName}: ${json.length} 行`);
  }
}

async function main() {
  console.log(`网页入口: ${CLIENT_URL}`);

  const html = await fetchText(CLIENT_URL);
  const settingsPath = parseSettingsScriptPath(html);
  const settingsUrl = resolveUrl(CLIENT_URL, settingsPath);
  console.log(`settings: ${settingsUrl}`);

  const settingsCode = await fetchText(settingsUrl);
  const settings = loadCcSettings(settingsCode);
  const downloads = pickDownloadEntries(settings.jsList).map((entry) => ({
    entry,
    url: resolveUrl(settingsUrl, entry.startsWith('assets/') ? `./${entry}` : entry),
    filename: path.basename(entry),
    isConfig: entry.startsWith('assets/script/config/'),
  }));

  const configCount = downloads.filter((item) => item.isConfig).length;
  console.log(`配置表: ${configCount} 个, 附加文件: ${downloads.length - configCount} 个`);

  cleanDataDir();

  let downloaded = 0;
  await runPool(downloads, async (item) => {
    const jsCode = await fetchText(item.url);
    const jsPath = path.join(DATA_DIR, item.filename);
    fs.writeFileSync(jsPath, jsCode, 'utf8');

    if (item.isConfig) {
      const table = extractTable(jsCode, item.filename);
      const json = tableToObjects(table, item.filename);
      const jsonPath = path.join(DATA_DIR, item.filename.replace(/\.js$/, '.json'));
      fs.writeFileSync(jsonPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    }

    downloaded += 1;
    if (downloaded % 25 === 0 || downloaded === downloads.length) {
      console.log(`已完成 ${downloaded}/${downloads.length}`);
    }
  }, CONCURRENCY);

  await syncRuntimeEmbeddedTables(settingsUrl, settings);

  console.log(`同步完成: ${DATA_DIR}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
