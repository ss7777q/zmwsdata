#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const DEFAULT_BASE_URL = 'https://client-zmxyol.3304399.net/client/';
const DEFAULT_TARGETS = ['entry', 'js-config', 'bundle-config', 'json-asset', 'native'];
const DEFAULT_CONCURRENCY = 8;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_SCHEMA_VERSION = 2;

const TEXTURE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.ico', '.tiff', '.pvr', '.pkm'];
const AUDIO_EXTENSIONS = ['.mp3', '.ogg', '.wav', '.m4a'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov'];

const PROBE_EXTENSIONS_BY_TYPE = {
  'cc.Texture2D': TEXTURE_EXTENSIONS,
  'cc.AudioClip': AUDIO_EXTENSIONS,
  'cc.VideoClip': VIDEO_EXTENSIONS,
};

const TEXT_DECODER = new TextDecoder('utf-8');

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const manifest = await getManifest(options);

  if (command === 'scan') {
    await writeJson(options.manifest, manifest);
    printManifestSummary(manifest, options);
    return;
  }

  if (command !== 'download') {
    printUsage(`Unsupported command: ${command}`);
    process.exitCode = 1;
    return;
  }

  await writeJson(options.manifest, manifest);

  const downloadPlan = buildDownloadPlan(manifest, options);
  printPlanSummary(downloadPlan, options);

  if (options.dryRun) {
    return;
  }

  await fs.mkdir(options.outDir, { recursive: true });
  const context = {
    options,
    importTextCache: new Map(),
    staticUrlCache: new Map(),
  };

  const results = await runWithConcurrency(downloadPlan.tasks, options.concurrency, (task, index) =>
    executeTask(task, index, downloadPlan.tasks.length, context),
  );

  const summary = summarizeResults(results);
  console.log(`Done. ok=${summary.ok} skipped=${summary.skipped} failed=${summary.failed}`);
  if (summary.failed > 0) {
    process.exitCode = 2;
  }
}

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const command = argv[0];
  const args = argv.slice(1);

  const options = {
    baseUrl: DEFAULT_BASE_URL,
    outDir: path.join(SCRIPT_DIR, 'download'),
    manifest: path.join(SCRIPT_DIR, 'manifest.json'),
    saveMode: 'path',
    targets: [...DEFAULT_TARGETS],
    bundles: [],
    pathPrefixes: [],
    types: [],
    uuids: [],
    limit: null,
    concurrency: DEFAULT_CONCURRENCY,
    overwrite: false,
    dryRun: false,
    jsonMode: 'unwrap',
    includePackedJson: false,
    includeImportMetadata: false,
    noNativeProbe: false,
    nativeExts: [],
    retry: 2,
    timeoutMs: 30000,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      printUsage(`Unexpected argument: ${arg}`);
      process.exit(1);
    }

    const key = arg.slice(2);
    const read = () => {
      index += 1;
      if (index >= args.length) {
        printUsage(`Missing value for --${key}`);
        process.exit(1);
      }
      return args[index];
    };

    switch (key) {
      case 'base':
        options.baseUrl = read();
        break;
      case 'out':
        options.outDir = path.resolve(read());
        break;
      case 'manifest':
        options.manifest = path.resolve(read());
        break;
      case 'save-mode':
        options.saveMode = read();
        break;
      case 'targets':
        options.targets = splitList(read());
        break;
      case 'bundles':
        options.bundles = splitList(read());
        break;
      case 'path-prefix':
        options.pathPrefixes = splitList(read());
        break;
      case 'types':
        options.types = splitList(read());
        break;
      case 'uuid':
        options.uuids = splitList(read()).map(normalizeUuid);
        break;
      case 'limit':
        options.limit = Number(read());
        break;
      case 'concurrency':
        options.concurrency = Number(read());
        break;
      case 'json-mode':
        options.jsonMode = read();
        break;
      case 'native-exts':
        options.nativeExts = splitList(read());
        break;
      case 'retry':
        options.retry = Number(read());
        break;
      case 'timeout-ms':
        options.timeoutMs = Number(read());
        break;
      case 'overwrite':
        options.overwrite = true;
        break;
      case 'dry-run':
        options.dryRun = true;
        break;
      case 'include-packed-json':
        options.includePackedJson = true;
        break;
      case 'include-import-metadata':
        options.includeImportMetadata = true;
        break;
      case 'no-native-probe':
        options.noNativeProbe = true;
        break;
      default:
        printUsage(`Unknown option: --${key}`);
        process.exit(1);
    }
  }

  if (!['path', 'uuid', 'remote'].includes(options.saveMode)) {
    printUsage(`Unsupported --save-mode: ${options.saveMode}`);
    process.exit(1);
  }

  if (!['unwrap', 'raw'].includes(options.jsonMode)) {
    printUsage(`Unsupported --json-mode: ${options.jsonMode}`);
    process.exit(1);
  }

  options.baseUrl = ensureTrailingSlash(options.baseUrl);
  return { command, options };
}

function printUsage(error) {
  if (error) {
    console.error(error);
    console.error('');
  }

  console.log(`Usage:
  node cocos_resource_downloader.mjs scan [options]
  node cocos_resource_downloader.mjs download [options]

Common options:
  --base <url>             Client root URL
  --out <dir>              Output directory
  --manifest <file>        Manifest JSON path
  --save-mode <mode>       path | uuid | remote
  --bundles <csv>          Bundle filter, e.g. resources,main
  --path-prefix <csv>      Logical path prefix filter
  --types <csv>            Asset type filter, e.g. cc.JsonAsset,cc.Texture2D
  --uuid <csv>             UUID filter, short or full
  --limit <n>              Limit selected assets/tasks
  --concurrency <n>        Download concurrency
  --dry-run                Print plan only
  --overwrite              Overwrite existing files

Download options:
  --targets <csv>          entry,js-config,bundle-config,json-asset,native,import-metadata,all
  --json-mode <mode>       unwrap | raw
  --include-packed-json    Also download raw pack JSON for packed JsonAsset entries
  --include-import-metadata  Download unique import/pack metadata files
  --no-native-probe        Skip extension probing for native files
  --native-exts <csv>      Extra candidate extensions for native probe

Examples:
  node cocos_resource_downloader.mjs scan
  node cocos_resource_downloader.mjs download --targets json-asset --path-prefix map/,entityCtg/
  node cocos_resource_downloader.mjs download --targets native --types cc.Texture2D,cc.AudioClip --save-mode path
  node cocos_resource_downloader.mjs download --targets json-asset,native --uuid 47/gR4MchKAq0TlOQsjgE7,01PPcze9pB5rZPcbt8+Jme`);
}

async function getManifest(options) {
  try {
    const existing = JSON.parse(await fs.readFile(options.manifest, 'utf8'));
    if (
      existing?.schemaVersion === MANIFEST_SCHEMA_VERSION
      && existing?.baseUrl === options.baseUrl
      && existing?.assets?.length
    ) {
      return existing;
    }
  } catch {
  }
  return buildManifest(options.baseUrl, options.timeoutMs, options.retry);
}

async function buildManifest(baseUrl, timeoutMs, retry) {
  const entryUrl = new URL('index.html', baseUrl).href;
  const entryHtml = await fetchText(entryUrl, { timeoutMs, retry });
  const settingsPath = matchRequired(entryHtml, /<script\s+src="([^"]*src\/settings\.[^"]+\.js)"/i, 'settings.js');
  const mainScriptPath = matchOptional(entryHtml, /<script\s+src="([^"]*main\.[^"]+\.js)"/i);
  const engineScriptPath = matchOptional(entryHtml, /<script\s+src="([^"]*cocos2d-js[^"\s]+)"/i);

  const settingsUrl = new URL(settingsPath, baseUrl).href;
  const settingsCode = await fetchText(settingsUrl, { timeoutMs, retry });
  const settings = evaluateSettings(settingsCode);
  const bundleNames = Object.keys(settings.bundleVers || {});

  const bundleConfigs = [];
  for (const bundleName of bundleNames) {
    const version = settings.bundleVers[bundleName];
    const configPath = `assets/${bundleName}/config.${version}.json`;
    const configUrl = new URL(configPath, baseUrl).href;
    const config = JSON.parse(await fetchText(configUrl, { timeoutMs, retry }));
    bundleConfigs.push({ bundleName, version, configPath, configUrl, config });
  }

  const jsConfigs = (settings.jsList || []).map((relativePath) => ({
    kind: 'js-config',
    relativePath,
    remoteUrl: new URL(resolveJsConfigRemotePath(relativePath), baseUrl).href,
  }));

  const entryAssets = [
    { kind: 'entry', name: 'index.html', relativePath: 'index.html', remoteUrl: entryUrl },
    { kind: 'entry', name: path.posix.basename(settingsPath), relativePath: settingsPath, remoteUrl: settingsUrl },
  ];
  if (engineScriptPath) {
    entryAssets.push({
      kind: 'entry',
      name: path.posix.basename(engineScriptPath),
      relativePath: engineScriptPath,
      remoteUrl: new URL(engineScriptPath, baseUrl).href,
    });
  }
  if (mainScriptPath) {
    entryAssets.push({
      kind: 'entry',
      name: path.posix.basename(mainScriptPath),
      relativePath: mainScriptPath,
      remoteUrl: new URL(mainScriptPath, baseUrl).href,
    });
  }

  const bundleConfigEntries = bundleConfigs.map(({ bundleName, version, configPath, configUrl }) => ({
    kind: 'bundle-config',
    bundle: bundleName,
    version,
    relativePath: configPath,
    remoteUrl: configUrl,
  }));

  const assets = [];
  for (const bundleInfo of bundleConfigs) {
    const entries = buildAssetEntries(baseUrl, bundleInfo);
    assets.push(...entries);
  }

  const stats = buildStats(bundleConfigs, assets, jsConfigs);

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    baseUrl,
    entry: {
      entryUrl,
      settingsUrl,
      mainScriptUrl: mainScriptPath ? new URL(mainScriptPath, baseUrl).href : null,
      engineScriptUrl: engineScriptPath ? new URL(engineScriptPath, baseUrl).href : null,
    },
    settings: {
      launchScene: settings.launchScene,
      bundleVers: settings.bundleVers,
      hasResourcesBundle: settings.hasResourcesBundle,
      hasStartSceneBundle: settings.hasStartSceneBundle,
      remoteBundles: settings.remoteBundles,
      subpackages: settings.subpackages,
      jsListCount: (settings.jsList || []).length,
    },
    entryAssets,
    jsConfigs,
    bundleConfigs: bundleConfigEntries,
    assets,
    stats,
  };
}

function resolveJsConfigRemotePath(relativePath) {
  const normalized = String(relativePath).replace(/^\/+/, '');
  if (normalized.startsWith('src/')) {
    return normalized;
  }
  return `src/${normalized}`;
}

function evaluateSettings(settingsCode) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(settingsCode, sandbox);
  if (!sandbox.window._CCSettings) {
    throw new Error('Unable to evaluate window._CCSettings from settings.js');
  }
  return sandbox.window._CCSettings;
}

function buildAssetEntries(baseUrl, bundleInfo) {
  const { bundleName, version, config } = bundleInfo;
  const typeNames = config.types || [];
  const importVersionMap = pairsToObject(config.versions?.import || []);
  const nativeVersionMap = pairsToObject(config.versions?.native || []);
  const packMembership = createPackMembership(config.packs || {}, importVersionMap);

  const entries = [];
  for (const [assetIndex, pathInfo] of Object.entries(config.paths || {})) {
    entries.push(
      buildAssetEntry({
        baseUrl,
        bundleName,
        version,
        config,
        typeNames,
        importVersionMap,
        nativeVersionMap,
        packMembership,
        assetIndex,
        logicalPath: String(pathInfo[0]),
        typeIndex: Number(pathInfo[1]),
        source: 'path',
      }),
    );
  }

  for (const [scenePath, assetIndex] of Object.entries(config.scenes || {})) {
    entries.push(
      buildAssetEntry({
        baseUrl,
        bundleName,
        version,
        config,
        typeNames,
        importVersionMap,
        nativeVersionMap,
        packMembership,
        assetIndex: String(assetIndex),
        logicalPath: normalizeScenePath(scenePath),
        typeIndex: -1,
        source: 'scene',
        scenePath,
      }),
    );
  }

  return entries;
}

function buildAssetEntry({
  baseUrl,
  bundleName,
  version,
  config,
  typeNames,
  importVersionMap,
  nativeVersionMap,
  packMembership,
  assetIndex,
  logicalPath,
  typeIndex,
  source,
  scenePath = null,
}) {
  const shortUuid = config.uuids[Number(assetIndex)];
  const uuid = decodeUuid(shortUuid);
  const type = source === 'scene' ? 'cc.SceneAsset' : typeNames[typeIndex] || 'cc.Asset';
  const pack = packMembership[String(assetIndex)] || null;
  const importVersion = pack ? pack.version : importVersionMap[String(assetIndex)] || null;
  const nativeVersion = nativeVersionMap[String(assetIndex)] || null;
  const importUrl = importVersion
    ? buildImportUrl(baseUrl, bundleName, uuid, importVersion, pack?.packId || null)
    : null;

  return {
    bundle: bundleName,
    bundleVersion: version,
    assetIndex: Number(assetIndex),
    source,
    scenePath,
    logicalPath,
    type,
    shortUuid,
    uuid,
    importVersion,
    nativeVersion,
    packId: pack?.packId || null,
    packVersion: pack?.version || null,
    importUrl,
    nativeBaseUrl: nativeVersion
      ? new URL(`assets/${bundleName}/native/${uuid.slice(0, 2)}/${uuid}.${nativeVersion}`, baseUrl).href
      : null,
  };
}

function buildImportUrl(baseUrl, bundleName, uuid, importVersion, packId) {
  const importId = packId || uuid;
  return new URL(`assets/${bundleName}/import/${importId.slice(0, 2)}/${importId}.${importVersion}.json`, baseUrl).href;
}

function createPackMembership(packs, importVersionMap) {
  const membership = Object.create(null);
  for (const [packId, members] of Object.entries(packs)) {
    for (const member of members) {
      membership[String(member)] = {
        packId,
        version: importVersionMap[packId] || null,
      };
    }
  }
  return membership;
}

function pairsToObject(pairs) {
  const out = Object.create(null);
  for (let index = 0; index < pairs.length; index += 2) {
    out[String(pairs[index])] = pairs[index + 1];
  }
  return out;
}

function buildStats(bundleConfigs, assets, jsConfigs) {
  const byBundle = Object.create(null);
  const byType = Object.create(null);
  const byRootPrefix = Object.create(null);

  for (const bundleInfo of bundleConfigs) {
    byBundle[bundleInfo.bundleName] = {
      version: bundleInfo.version,
      pathCount: Object.keys(bundleInfo.config.paths || {}).length,
      uuidCount: (bundleInfo.config.uuids || []).length,
      packCount: Object.keys(bundleInfo.config.packs || {}).length,
      sceneCount: Object.keys(bundleInfo.config.scenes || {}).length,
    };
  }

  for (const asset of assets) {
    byType[asset.type] = (byType[asset.type] || 0) + 1;
    const root = asset.logicalPath.split('/')[0] || '(root)';
    byRootPrefix[root] = (byRootPrefix[root] || 0) + 1;
  }

  return {
    totalAssets: assets.length,
    jsConfigCount: jsConfigs.length,
    byBundle,
    byType: sortObjectByValueDesc(byType),
    byRootPrefix: sortObjectByValueDesc(byRootPrefix),
  };
}

function sortObjectByValueDesc(input) {
  return Object.fromEntries(Object.entries(input).sort((left, right) => right[1] - left[1]));
}

function buildDownloadPlan(manifest, options) {
  const targets = expandTargets(options.targets);
  const filteredAssets = applyAssetFilters(manifest.assets, options);
  const tasks = [];
  const seenStaticUrls = new Set();

  if (targets.has('entry')) {
    for (const entryAsset of manifest.entryAssets) {
      tasks.push(buildStaticTask(entryAsset.kind, entryAsset.remoteUrl, getStaticSavePath(entryAsset, options), entryAsset));
    }
  }

  if (targets.has('js-config')) {
    for (const entry of manifest.jsConfigs) {
      tasks.push(buildStaticTask(entry.kind, entry.remoteUrl, getStaticSavePath(entry, options), entry));
    }
  }

  if (targets.has('bundle-config')) {
    for (const entry of manifest.bundleConfigs) {
      tasks.push(buildStaticTask(entry.kind, entry.remoteUrl, getStaticSavePath(entry, options), entry));
    }
  }

  if (targets.has('import-metadata') || options.includeImportMetadata) {
    for (const asset of filteredAssets) {
      if (!asset.importUrl) {
        continue;
      }
      if (seenStaticUrls.has(asset.importUrl)) {
        continue;
      }
      seenStaticUrls.add(asset.importUrl);
      tasks.push(
        buildStaticTask(
          'import-metadata',
          asset.importUrl,
          getImportMetadataSavePath(asset, options),
          asset,
        ),
      );
    }
  }

  if (targets.has('json-asset')) {
    for (const asset of filteredAssets) {
      if (asset.type !== 'cc.JsonAsset') {
        continue;
      }
      if (!asset.importUrl) {
        continue;
      }
      if (asset.packId && !options.includePackedJson) {
        continue;
      }
      tasks.push({
        kind: 'json-asset',
        asset,
        savePath: getJsonAssetSavePath(asset, options),
      });
    }
  }

  if (targets.has('native')) {
    for (const asset of filteredAssets) {
      if (!asset.nativeVersion) {
        continue;
      }
      tasks.push({
        kind: 'native',
        asset,
        savePath: getNativeSavePath(asset, options),
      });
    }
  }

  const uniqueTasks = uniquifyTaskSavePaths(tasks);
  const limitedTasks = Number.isFinite(options.limit) && options.limit > 0 ? uniqueTasks.slice(0, options.limit) : uniqueTasks;
  return { filteredAssets, tasks: limitedTasks };
}

function uniquifyTaskSavePaths(tasks) {
  const groups = new Map();
  for (const task of tasks) {
    if (!task.savePath) {
      continue;
    }
    const key = task.savePath.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(task);
  }

  for (const [, group] of groups) {
    if (group.length <= 1) {
      continue;
    }

    const used = new Set();
    for (const task of group) {
      const candidate = buildDisambiguatedSavePath(task, task.savePath);
      task.savePath = candidate;
      used.add(candidate.toLowerCase());
    }

    let index = 1;
    for (const task of group) {
      const lower = task.savePath.toLowerCase();
      const duplicates = group.filter((item) => item.savePath.toLowerCase() === lower);
      if (duplicates.length <= 1) {
        continue;
      }

      let next;
      do {
        next = appendSuffixBeforeExtension(task.savePath, `dup${index}`);
        index += 1;
      } while (used.has(next.toLowerCase()));
      task.savePath = next;
      used.add(next.toLowerCase());
    }
  }

  return tasks;
}

function buildDisambiguatedSavePath(task, savePath) {
  const assetLike = task.asset || task.meta;
  if (!assetLike || !assetLike.type) {
    return savePath;
  }

  const typeSuffix = slugifyType(assetLike.type);
  let candidate = appendSuffixBeforeExtension(savePath, typeSuffix);

  if (task.kind === 'import-metadata' && assetLike.packId) {
    candidate = appendSuffixBeforeExtension(candidate, 'pack');
  }

  return candidate;
}

function appendSuffixBeforeExtension(filename, suffix) {
  const parsed = path.posix.parse(filename);
  return path.posix.join(parsed.dir, `${parsed.name}.${suffix}${parsed.ext}`);
}

function slugifyType(typeName) {
  return String(typeName)
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function expandTargets(targets) {
  if (targets.includes('all')) {
    return new Set(['entry', 'js-config', 'bundle-config', 'json-asset', 'native', 'import-metadata']);
  }
  return new Set(targets);
}

function applyAssetFilters(assets, options) {
  return assets.filter((asset) => {
    if (options.bundles.length > 0 && !options.bundles.includes(asset.bundle)) {
      return false;
    }

    if (options.types.length > 0 && !options.types.includes(asset.type)) {
      return false;
    }

    if (options.pathPrefixes.length > 0) {
      const matched = options.pathPrefixes.some((prefix) => asset.logicalPath.startsWith(prefix));
      if (!matched) {
        return false;
      }
    }

    if (options.uuids.length > 0) {
      const normalizedShort = normalizeUuid(asset.shortUuid);
      const normalizedFull = normalizeUuid(asset.uuid);
      if (!options.uuids.includes(normalizedShort) && !options.uuids.includes(normalizedFull)) {
        return false;
      }
    }

    return true;
  });
}

function buildStaticTask(kind, remoteUrl, savePath, meta) {
  return { kind, remoteUrl, savePath, meta };
}

async function executeTask(task, index, total, context) {
  const label = `${index + 1}/${total}`;
  try {
    switch (task.kind) {
      case 'entry':
      case 'js-config':
      case 'bundle-config':
      case 'import-metadata':
        return await downloadStaticTask(task, label, context);
      case 'json-asset':
        return await downloadJsonAsset(task, label, context);
      case 'native':
        return await downloadNativeAsset(task, label, context);
      default:
        throw new Error(`Unsupported task kind: ${task.kind}`);
    }
  } catch (error) {
    console.error(`[${label}] FAIL ${task.kind} ${describeTask(task)} :: ${error.message}`);
    return { status: 'failed', task, error };
  }
}

async function downloadStaticTask(task, label, context) {
  const outputPath = path.resolve(context.options.outDir, task.savePath);
  if (!context.options.overwrite && (await exists(outputPath))) {
    console.log(`[${label}] SKIP ${task.kind} ${task.savePath}`);
    return { status: 'skipped', task };
  }

  const buffer = await fetchBuffer(task.remoteUrl, context.options);
  await writeFile(outputPath, buffer);
  console.log(`[${label}] OK   ${task.kind} ${task.savePath}`);
  return { status: 'ok', task };
}

async function downloadJsonAsset(task, label, context) {
  const outputPath = path.resolve(context.options.outDir, task.savePath);
  if (!context.options.overwrite && (await exists(outputPath))) {
    console.log(`[${label}] SKIP json-asset ${task.savePath}`);
    return { status: 'skipped', task };
  }

  const text = await getImportText(task.asset, context);
  let buffer;
  if (context.options.jsonMode === 'raw') {
    buffer = Buffer.from(text, 'utf8');
  } else {
    const jsonValue = extractJsonAssetValue(text);
    if (jsonValue === undefined) {
      throw new Error(`JsonAsset unwrap failed for ${task.asset.logicalPath}`);
    }
    buffer = Buffer.from(`${JSON.stringify(jsonValue, null, 2)}\n`, 'utf8');
  }

  await writeFile(outputPath, buffer);
  console.log(`[${label}] OK   json-asset ${task.savePath}`);
  return { status: 'ok', task };
}

async function downloadNativeAsset(task, label, context) {
  const outputPathBase = path.resolve(context.options.outDir, task.savePath);
  if (!context.options.overwrite) {
    const existing = await findExistingNativeOutput(outputPathBase);
    if (existing) {
      console.log(`[${label}] SKIP native ${path.relative(context.options.outDir, existing)}`);
      return { status: 'skipped', task };
    }
  }

  const resolved = await resolveNative(task.asset, context);
  if (!resolved) {
    throw new Error(`Native URL unresolved for ${task.asset.logicalPath} (${task.asset.type})`);
  }

  const outputPath = outputPathBase.endsWith(resolved.extension)
    ? outputPathBase
    : `${outputPathBase}${resolved.extension}`;
  if (!context.options.overwrite && (await exists(outputPath))) {
    console.log(`[${label}] SKIP native ${path.relative(context.options.outDir, outputPath)}`);
    return { status: 'skipped', task };
  }

  await writeFile(outputPath, resolved.buffer);
  console.log(`[${label}] OK   native ${path.relative(context.options.outDir, outputPath)}`);
  return { status: 'ok', task };
}

async function resolveNative(asset, context) {
  const directSpec = await tryReadDirectNativeSpec(asset, context);
  if (directSpec) {
    return downloadResolvedNative(asset, directSpec, context);
  }

  if (context.options.noNativeProbe) {
    return null;
  }

  const candidateExts = Array.from(
    new Set([...(PROBE_EXTENSIONS_BY_TYPE[asset.type] || []), ...context.options.nativeExts]),
  );

  if (candidateExts.length === 0) {
    return null;
  }

  for (const extension of candidateExts) {
    const url = `${asset.nativeBaseUrl}${extension}`;
    try {
      const buffer = await fetchBuffer(url, context.options);
      return { url, buffer, extension };
    } catch {
    }
  }

  return null;
}

async function tryReadDirectNativeSpec(asset, context) {
  if (!asset.importUrl || asset.packId) {
    return null;
  }

  const text = await getImportText(asset, context);
  const directNative = extractCocosProperty(text, '_native');
  if (typeof directNative !== 'string' || directNative.length === 0) {
    return null;
  }
  return directNative;
}

async function downloadResolvedNative(asset, nativeSpec, context) {
  const isPathFile = !nativeSpec.startsWith('.');
  const extension = isPathFile ? path.posix.extname(nativeSpec) : nativeSpec;
  const remoteUrl = isPathFile
    ? `${asset.nativeBaseUrl}/${nativeSpec}`
    : `${asset.nativeBaseUrl}${nativeSpec}`;
  const buffer = await fetchBuffer(remoteUrl, context.options);
  return { url: remoteUrl, buffer, extension };
}

async function getImportText(asset, context) {
  const cacheKey = asset.importUrl;
  if (context.importTextCache.has(cacheKey)) {
    return context.importTextCache.get(cacheKey);
  }
  const text = await fetchText(asset.importUrl, context.options);
  context.importTextCache.set(cacheKey, text);
  return text;
}

function extractJsonAssetValue(text) {
  const value = extractCocosProperty(text, 'json');
  return value;
}

function extractCocosProperty(text, propertyName) {
  const data = JSON.parse(text);
  if (!Array.isArray(data) || !Array.isArray(data[3]) || !Array.isArray(data[5])) {
    return undefined;
  }

  const classDefinition = data[3][0];
  if (!Array.isArray(classDefinition) || !Array.isArray(classDefinition[1])) {
    return undefined;
  }

  const properties = classDefinition[1];
  const propertyIndex = properties.indexOf(propertyName);
  if (propertyIndex < 0) {
    return undefined;
  }

  const firstRecord = data[5][0];
  if (!Array.isArray(firstRecord)) {
    return undefined;
  }

  return firstRecord[propertyIndex + 1];
}

function getStaticSavePath(entry, options) {
  if (options.saveMode === 'remote') {
    return trimClientPrefix(entry.relativePath);
  }
  if (options.saveMode === 'uuid') {
    return path.posix.join(entry.kind, path.posix.basename(entry.relativePath));
  }
  return trimClientPrefix(entry.relativePath);
}

function getJsonAssetSavePath(asset, options) {
  const extension = options.jsonMode === 'raw' ? '.import.json' : '.json';
  if (options.saveMode === 'uuid') {
    return path.posix.join('json-assets', asset.bundle, `${asset.uuid}${extension}`);
  }
  if (options.saveMode === 'remote') {
    return path.posix.join('json-assets', asset.bundle, `${asset.uuid}${extension}`);
  }
  return path.posix.join(asset.bundle, `${asset.logicalPath}${extension}`);
}

function getNativeSavePath(asset, options) {
  if (options.saveMode === 'uuid') {
    return path.posix.join('native', asset.bundle, asset.uuid);
  }
  if (options.saveMode === 'remote') {
    return path.posix.join('native', asset.bundle, asset.uuid);
  }
  return path.posix.join(asset.bundle, asset.logicalPath);
}

function getImportMetadataSavePath(asset, options) {
  if (options.saveMode === 'remote') {
    return trimClientPrefix(new URL(asset.importUrl).pathname);
  }
  if (options.saveMode === 'uuid') {
    const name = asset.packId ? asset.packId : asset.uuid;
    return path.posix.join('import-metadata', asset.bundle, `${name}.json`);
  }
  const logical = asset.packId ? `__packs/${asset.packId}` : asset.logicalPath;
  return path.posix.join(asset.bundle, `${logical}.import.json`);
}

function trimClientPrefix(relativePath) {
  return relativePath.replace(/^\/?client\//i, '').replace(/^\//, '');
}

function normalizeScenePath(scenePath) {
  return scenePath.replace(/^db:\/\/assets\//, '').replace(/\.fire$/, '');
}

function normalizeUuid(uuid) {
  return String(uuid).trim().toLowerCase();
}

function printManifestSummary(manifest, options) {
  console.log(`Manifest written to ${options.manifest}`);
  console.log(`Base URL       : ${manifest.baseUrl}`);
  console.log(`JS configs     : ${manifest.stats.jsConfigCount}`);
  console.log(`Logical assets : ${manifest.stats.totalAssets}`);
  console.log(`Bundles        : ${Object.keys(manifest.stats.byBundle).join(', ')}`);
  console.log('Top types      :');
  for (const [type, count] of Object.entries(manifest.stats.byType).slice(0, 10)) {
    console.log(`  - ${type}: ${count}`);
  }
}

function printPlanSummary(plan, options) {
  console.log(`Manifest       : ${options.manifest}`);
  console.log(`Output dir     : ${options.outDir}`);
  console.log(`Targets        : ${options.targets.join(', ')}`);
  console.log(`Save mode      : ${options.saveMode}`);
  console.log(`Asset matches  : ${plan.filteredAssets.length}`);
  console.log(`Download tasks : ${plan.tasks.length}`);
}

function describeTask(task) {
  if (task.asset) {
    return `${task.asset.bundle}:${task.asset.logicalPath}`;
  }
  return task.remoteUrl || task.savePath;
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const slots = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(slots);
  return results;
}

function summarizeResults(results) {
  const summary = { ok: 0, skipped: 0, failed: 0 };
  for (const result of results) {
    if (!result) {
      continue;
    }
    summary[result.status] += 1;
  }
  return summary;
}

async function fetchText(url, options) {
  const buffer = await fetchBuffer(url, options);
  return TEXT_DECODER.decode(buffer);
}

async function fetchBuffer(url, options) {
  let lastError;
  for (let attempt = 0; attempt <= options.retry; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      clearTimeout(timer);
      return Buffer.from(arrayBuffer);
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < options.retry) {
        await sleep(300 * (attempt + 1));
      }
    }
  }
  throw lastError;
}

async function writeJson(filename, data) {
  await writeFile(filename, Buffer.from(`${JSON.stringify(data, null, 2)}\n`, 'utf8'));
}

async function writeFile(filename, buffer) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, buffer);
}

async function exists(filename) {
  try {
    await fs.access(filename);
    return true;
  } catch {
    return false;
  }
}

async function findExistingNativeOutput(basePath) {
  const directory = path.dirname(basePath);
  const stem = path.basename(basePath);
  try {
    const entries = await fs.readdir(directory);
    const matched = entries.find((entry) => entry === stem || entry.startsWith(`${stem}.`));
    return matched ? path.join(directory, matched) : null;
  } catch {
    return null;
  }
}

function ensureTrailingSlash(url) {
  return url.endsWith('/') ? url : `${url}/`;
}

function splitList(value) {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function matchRequired(text, regex, label) {
  const matched = text.match(regex);
  if (!matched) {
    throw new Error(`Unable to find ${label} in HTML entry`);
  }
  return matched[1];
}

function matchOptional(text, regex) {
  const matched = text.match(regex);
  return matched ? matched[1] : null;
}

function decodeUuid(value) {
  if (typeof value !== 'string' || value.length !== 22) {
    return value;
  }

  const hexChars = '0123456789abcdef';
  const base64Values = Object.create(null);
  const base64KeyChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let index = 0; index < base64KeyChars.length; index += 1) {
    base64Values[base64KeyChars.charCodeAt(index)] = index;
  }

  const decoded = [value[0], value[1]];
  for (let index = 2; index < 22; index += 2) {
    const lhs = base64Values[value.charCodeAt(index)];
    const rhs = base64Values[value.charCodeAt(index + 1)];
    decoded.push(hexChars[lhs >> 2]);
    decoded.push(hexChars[((lhs & 3) << 2) | (rhs >> 4)]);
    decoded.push(hexChars[rhs & 15]);
  }

  const hex = decoded.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await main();
