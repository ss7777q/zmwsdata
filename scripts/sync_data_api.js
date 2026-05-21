#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'dataApi');
const CLIENT_URL = process.argv[2] || 'https://client-zmxyol.3304399.net/client/';
const CONCURRENCY = 8;

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

function tableToObjects(table) {
  const headers = table[0];
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
      const json = tableToObjects(table);
      const jsonPath = path.join(DATA_DIR, item.filename.replace(/\.js$/, '.json'));
      fs.writeFileSync(jsonPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    }

    downloaded += 1;
    if (downloaded % 25 === 0 || downloaded === downloads.length) {
      console.log(`已完成 ${downloaded}/${downloads.length}`);
    }
  }, CONCURRENCY);

  console.log(`同步完成: ${DATA_DIR}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
