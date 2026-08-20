#!/usr/bin/env node

/**
 * Build the generic, read-only catalog used by the Q&A agent.
 *
 * The exported JSON files remain the source of truth for the website. This
 * catalog only stores searchable summaries and pointers back to those files,
 * so a model never has to load a whole multi-megabyte snapshot.
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'output');
const DEFAULT_DB_PATH = path.join(ROOT, 'file', 'runtime', 'qa-catalog.db');
const CATALOG_VERSION = '14';
const MAX_RECORDS_PER_FILE = 4_000;
const MAX_RECORD_TEXT_LENGTH = 3_000;
const MAX_SUMMARY_DEPTH = 3;
const MAX_ARRAY_ITEMS = 8;
const MAX_OBJECT_KEYS = 40;
const MAX_CATALOG_DEPTH = 4;
const MAX_INDEX_TEXT_LENGTH = 2_400;
const MAX_TERMS_PER_RECORD = 600;

const OMIT_KEYS = new Set([
  'raw',
  'source',
  'sourceFile',
  'guidePath',
  'icon',
  'image',
  'metadata',
  'otherData',
  'makeUpBeskills',
  'initializeBeskills',
  'skillBaselines',
]);

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function jsonPointer(parts) {
  if (parts.length === 0) return '/';
  return `/${parts.map((part) => String(part).replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`;
}

function displayPointer(pointer) {
  if (!pointer || pointer === '/') return '$';
  const [basePointer, chunkSuffix] = String(pointer).split('#chunk=');
  const displayed = `$${basePointer.split('/').slice(1).map((part) => {
    const decoded = part.replace(/~1/g, '/').replace(/~0/g, '~');
    return /^\d+$/.test(decoded) ? `[${decoded}]` : `.${decoded}`;
  }).join('')}`;
  return chunkSuffix ? `${displayed}（分块 ${chunkSuffix}）` : displayed;
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '');
}

function clipText(value, maxLength = MAX_RECORD_TEXT_LENGTH) {
  const text = String(value ?? '').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function compactValue(value, depth = 0) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return clipText(value, 480);
  if (depth >= MAX_SUMMARY_DEPTH) return Array.isArray(value) ? `[${value.length} items]` : '[object]';
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => compactValue(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) items.push(`…共 ${value.length} 项`);
    return items;
  }

  const result = {};
  const entries = Object.entries(value).filter(([key]) => !OMIT_KEYS.has(key));
  for (const [key, child] of entries.slice(0, MAX_OBJECT_KEYS)) {
    result[key] = compactValue(child, depth + 1);
  }
  if (entries.length > MAX_OBJECT_KEYS) result._more = `…共 ${entries.length} 个字段`;
  return result;
}

function scalarText(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

const LABEL_KEYS = [
  'title', 'name', 'skillName', 'desName', 'petName', 'familyName', 'roleName',
  'partName', 'label', 'matrixSkill', 'category', 'stageName', 'monsterName',
  'itemName', 'displayName',
];

function labelFor(value, fallback) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  for (const key of LABEL_KEYS) {
    const text = scalarText(value[key]);
    if (text) return text;
  }
  // Many records wrap their identity one level down (a pet skill slot keeps its
  // name at .base.name, a pet wiki variant at .pet.name). Without this fallback
  // those titles collapse to raw JSON paths like $.data.variants[1].slots[2],
  // which search can match but the model cannot act on. Recursing one level
  // turns them into entity names.
  for (const key of Object.keys(value)) {
    const child = value[key];
    if (!child || typeof child !== 'object' || Array.isArray(child)) continue;
    for (const nestedKey of LABEL_KEYS) {
      const text = scalarText(child[nestedKey]);
      if (text) return text;
    }
  }
  return fallback;
}

function levelValueLine(level) {
  const parts = [];
  for (const buff of Array.isArray(level?.growthBuffs) ? level.growthBuffs : []) {
    if (!buff) continue;
    const name = buff.name || '';
    const value = buff.value;
    const text = buff.displayText || '';
    if (value == null || typeof value !== 'object') {
      if (value != null) parts.push(`${name}:${value}`);
      continue;
    }
    const chunks = [];
    if (value.per != null) chunks.push(`${value.per}%`);
    if (value.val != null) chunks.push(String(value.val));
    if (chunks.length > 0) parts.push(`${name}:${chunks.join('+')}`);
    else if (name && text) parts.push(`${name}:${clipText(text, 60)}`);
  }
  for (const segment of Array.isArray(level?.segmentVals) ? level.segmentVals : []) {
    if (segment && segment.val != null) parts.push(`段伤害:${segment.val}`);
  }
  // Numeric-only schemas (skill baseline records) carry the effect value as a
  // bare number field instead of growthBuffs — e.g. {level, totalVal, x,
  // fixedMultiplier}. Surface those when no buff/segment values exist, so any
  // mechanic's number is searchable regardless of schema. totalVal alone keeps
  // the 60-level table inside the model's context window.
  if (parts.length === 0) {
    for (const key of ['totalVal', 'val']) {
      const value = level?.[key];
      if (value != null && typeof value === 'number') parts.push(`${key}:${value}`);
    }
  }
  return parts.join('，');
}

// Skill / matrix / item records carry per-level numbers (growthBuffs values,
// segment damage) inside a `levels` array that the shallow index text omits.
// Surfacing EVERY level's numbers (not just max) lets the model answer
// "某级是多少 / 满级是多少 / Lv.30 恢复多少" from a single search instead of
// reading N levels. The table sits right after the title so it stays inside the
// model's context window even when the JSON body truncates.
function appendLevelSummary(value) {
  const levels = Array.isArray(value?.levels) ? value.levels
    : Array.isArray(value?.base?.levels) ? value.base.levels
      : null;
  if (!levels || levels.length === 0) return '';
  const lines = [];
  for (let index = 0; index < levels.length && index < 90; index += 1) {
    const level = levels[index];
    const text = levelValueLine(level);
    if (!text) continue;
    const levelNo = level?.level ?? index + 1;
    const isMax = index === levels.length - 1;
    lines.push(isMax ? `满级Lv.${levelNo}=${text}` : `Lv.${levelNo}=${text}`);
  }
  return lines.length > 0 ? `等级数值：${lines.join('；')}` : '';
}

function summarizeRecord(value, pointer, parentKey) {
  if (value == null) return '';
  if (typeof value !== 'object') return clipText(`${parentKey || 'value'}: ${String(value)}`);

  const compact = compactValue(value);
  const title = labelFor(value, displayPointer(pointer));
  const header = parentKey ? `${parentKey}：${title}` : title;
  // Keep the max-level numbers right after the title so the model sees them
  // even when the full JSON body is truncated past the context window.
  const levelSummary = appendLevelSummary(value);
  const body = JSON.stringify(compact, null, 2);
  return clipText(levelSummary ? `${header}\n${levelSummary}\n${body}` : `${header}\n${body}`);
}

function schemaHint(value, depth = 0) {
  if (depth > 2 || value == null || typeof value !== 'object') return typeof value;
  if (Array.isArray(value)) {
    return { type: 'array', count: value.length, item: value.length > 0 ? schemaHint(value[0], depth + 1) : null };
  }
  const result = {};
  for (const [key, child] of Object.entries(value).filter(([key]) => !OMIT_KEYS.has(key)).slice(0, MAX_OBJECT_KEYS)) {
    result[key] = schemaHint(child, depth + 1);
  }
  return result;
}

function isIndexableObject(value, parentKey) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).filter((key) => !OMIT_KEYS.has(key));
  if (keys.length === 0) return false;
  if (keys.some((key) => ['title', 'name', 'skillName', 'petName', 'familyName', 'id', 'level', 'rank', 'quality'].includes(key))) return true;
  if (keys.some((key) => scalarText(value[key]))) return true;
  return Boolean(parentKey && /level|row|skill|item|family|record|list|data/i.test(parentKey));
}

function collectRecords(payload, fileName) {
  const records = [];
  const rootMeta = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload._meta || {} : {};
  const wrappedData = payload && typeof payload === 'object' && !Array.isArray(payload) && Object.prototype.hasOwnProperty.call(payload, 'data');
  const data = wrappedData
    ? payload.data
    : payload;
  const rootText = [
    `文件：${fileName}`,
    rootMeta.system ? `系统：${rootMeta.system}` : '',
    rootMeta.source ? `来源：${rootMeta.source}` : '',
    rootMeta.costType ? `消耗/字段口径：${rootMeta.costType}` : '',
    rootMeta.dedup ? `去重口径：${rootMeta.dedup}` : '',
    rootMeta.note ? `说明：${rootMeta.note}` : '',
    `结构提示：${JSON.stringify(schemaHint(data))}`,
    data && typeof data === 'object' ? `数据预览：${JSON.stringify(compactValue(data))}` : `数据值：${String(data ?? '')}`,
  ].filter(Boolean).join('\n');

  records.push({
    pointer: '/',
    title: rootMeta.entity || rootMeta.system || fileName,
    kind: 'file',
    depth: 0,
    text: clipText(rootText),
  });

  function addRecord(value, parts, parentKey, depth, kind = 'record', ownerLabel = '') {
    if (records.length >= MAX_RECORDS_PER_FILE) return;
    const pointer = jsonPointer(parts);
    const text = summarizeRecord(value, pointer, parentKey);
    if (!text || text.length < 8) return;
    const label = labelFor(value, displayPointer(pointer));
    records.push({
      pointer,
      title: ownerLabel && ownerLabel !== label ? `${ownerLabel} · ${label}` : label,
      kind,
      depth,
      text: ownerLabel ? `所属实体：${ownerLabel}\n${text}` : text,
    });
  }

  if (wrappedData && data && typeof data === 'object' && !Array.isArray(data) && isIndexableObject(data, 'data')) {
    addRecord(data, ['data'], 'data', 0, 'entity');
  }

  function shallowText(value) {
    if (value == null || typeof value !== 'object') return clipText(value, 220);
    if (Array.isArray(value)) return `[${value.length}项]`;
    const parts = [];
    for (const [key, child] of Object.entries(value).filter(([key]) => !OMIT_KEYS.has(key)).slice(0, 14)) {
      if (child == null || typeof child === 'number' || typeof child === 'boolean' || typeof child === 'string') {
        parts.push(`${key}=${clipText(child, 160)}`);
      } else if (Array.isArray(child)) {
        if (child.every((item) => item == null || typeof item !== 'object')) {
          parts.push(`${key}=[${child.join(',')}]`);
        } else {
          const labels = child.slice(0, 4).map((item) => labelFor(item, '')).filter(Boolean);
          parts.push(`${key}=[${labels.join('、')}${child.length > labels.length ? '…' : ''}]`);
        }
      }
    }
    return parts.join('；');
  }

  function addChunk(value, parts, parentKey, ownerLabel, depth, start, end) {
    if (records.length >= MAX_RECORDS_PER_FILE) return;
    const pointer = `${jsonPointer(parts)}#chunk=${start}-${end}`;
    const range = value.slice(start, end);
    const rows = range.map((item, offset) => `${start + offset + 1}. ${labelFor(item, displayPointer(pointer))} ${shallowText(item)}`);
    records.push({
      pointer,
      title: `${ownerLabel ? `${ownerLabel} · ` : ''}${parentKey || '列表'} ${start + 1}-${end}`,
      kind: 'chunk',
      depth,
      text: clipText(`${parentKey || '列表'}：第 ${start + 1}-${end} 项，共 ${value.length} 项\n${rows.join('\n')}`),
    });
  }

  function visit(value, parts, parentKey, depth, arrayDepth = 0, ownerLabel = '') {
    if (records.length >= MAX_RECORDS_PER_FILE || value == null || depth > MAX_CATALOG_DEPTH) return;
    if (Array.isArray(value)) {
      if (value.length === 0) return;
      // Small nested lists that carry no meaningful per-item labels are already
      // preserved in their parent summary. But nested arrays of real objects
      // (fashion renew groups, matrix rows) deserve their own records.
      const nestedIndexable = value.some((item) => item && typeof item === 'object' && !Array.isArray(item) && isIndexableObject(item, parentKey));
      if (arrayDepth > 0 && value.length <= MAX_ARRAY_ITEMS && !nestedIndexable) return;
      if (records.length < MAX_RECORDS_PER_FILE) {
        records.push({
          pointer: jsonPointer(parts),
          title: `${parentKey || '列表'}（${value.length}项）`,
          kind: 'collection',
          depth,
          text: clipText(`${parentKey || '列表'}：共 ${value.length} 项；路径 ${displayPointer(jsonPointer(parts))}`),
        });
      }
      // Top-level data arrays index every row. So do small nested arrays whose
      // items carry real content (fashion renew groups, matrix rows) — chunking
      // those hides per-item text like fashion names and renew costs.
      const smallIndexableArray = arrayDepth > 0 && value.length <= MAX_ARRAY_ITEMS && nestedIndexable;
      const indexIndividualRows = arrayDepth === 0 || smallIndexableArray;
      if (!indexIndividualRows) {
        const chunkSize = 48;
        for (let start = 0; start < value.length && records.length < MAX_RECORDS_PER_FILE; start += chunkSize) {
          addChunk(value, parts, parentKey, ownerLabel, depth, start, Math.min(value.length, start + chunkSize));
        }
        return;
      }
      for (let index = 0; index < value.length && records.length < MAX_RECORDS_PER_FILE; index += 1) {
        const child = value[index];
        const childParts = [...parts, index];
        if (isIndexableObject(child, parentKey) || typeof child !== 'object') {
          addRecord(child, childParts, parentKey, depth + 1, 'record', ownerLabel);
        }
        if (child && typeof child === 'object' && depth < MAX_CATALOG_DEPTH) {
          visit(child, childParts, parentKey, depth + 1, arrayDepth + 1, labelFor(child, ownerLabel));
        }
      }
      return;
    }
    if (typeof value !== 'object' || depth >= MAX_CATALOG_DEPTH) return;
    const nextOwnerLabel = labelFor(value, ownerLabel);
    for (const [key, child] of Object.entries(value)) {
      if (OMIT_KEYS.has(key)) continue;
      const childParts = [...parts, key];
      if (Array.isArray(child)) {
        visit(child, childParts, key, depth + 1, arrayDepth, nextOwnerLabel);
        continue;
      }
      if (child && typeof child === 'object') {
        visit(child, childParts, key, depth + 1, arrayDepth, nextOwnerLabel);
      }
    }
  }

  visit(data, wrappedData ? ['data'] : [], wrappedData ? 'data' : fileName, 0);
  return records;
}

function tokenize(value) {
  const normalized = normalizeText(value);
  const terms = new Map();
  const add = (term, weight = 1) => {
    if (terms.size >= MAX_TERMS_PER_RECORD) return;
    const clean = term.trim();
    if (clean.length < 2 || clean.length > 48) return;
    terms.set(clean, Math.max(terms.get(clean) || 0, weight));
  };

  for (const word of normalized.match(/[a-z0-9][a-z0-9._:-]*/g) || []) add(word, Math.min(4, Math.max(1, word.length - 1)));
  for (const group of normalized.match(/[\u4e00-\u9fff]+/g) || []) {
    if (group.length <= 12) add(group, Math.min(6, group.length));
    for (let size = 2; size <= 4; size += 1) {
      for (let index = 0; index + size <= group.length && terms.size < MAX_TERMS_PER_RECORD; index += 1) add(group.slice(index, index + size), size - 1);
    }
  }
  return terms;
}

function createSchema(database) {
  database.exec(`
    PRAGMA journal_mode = DELETE;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE files (
      file_name TEXT PRIMARY KEY,
      bytes INTEGER NOT NULL,
      modified_ms INTEGER NOT NULL,
      meta_json TEXT NOT NULL,
      schema_json TEXT NOT NULL,
      record_count INTEGER NOT NULL
    );
    CREATE TABLE records (
      id INTEGER PRIMARY KEY,
      file_name TEXT NOT NULL,
      pointer TEXT NOT NULL,
      title TEXT NOT NULL,
      kind TEXT NOT NULL,
      depth INTEGER NOT NULL,
      text TEXT NOT NULL,
      FOREIGN KEY (file_name) REFERENCES files(file_name),
      UNIQUE (file_name, pointer)
    );
    CREATE TABLE terms (
      term TEXT NOT NULL,
      record_id INTEGER NOT NULL,
      frequency INTEGER NOT NULL,
      PRIMARY KEY (term, record_id),
      FOREIGN KEY (record_id) REFERENCES records(id)
    ) WITHOUT ROWID;
    CREATE INDEX idx_terms_term ON terms(term);
    CREATE INDEX idx_records_file ON records(file_name);
  `);
}

function buildSignature(files) {
  return files.map((file) => `${file.name}:${file.size}:${Math.floor(file.mtimeMs)}`).join('|');
}

function collectOutputFiles(outputDir) {
  const manifestPath = path.join(outputDir, 'system_data_manifest.json');
  let replacedSources = new Set();
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))?.data;
      replacedSources = new Set(Array.isArray(manifest?.replacedSources) ? manifest.replacedSources : []);
    } catch (error) {
      console.warn(`[qa-catalog] ignore invalid system_data_manifest.json: ${error.message}`);
    }
  }

  const files = [];
  function visit(directory, relativeParts = []) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath, [...relativeParts, entry.name]);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const baseName = entry.name.slice(0, -5);
      if (relativeParts.length === 0 && (baseName === 'system_data_manifest' || replacedSources.has(baseName))) continue;
      const name = [...relativeParts, baseName].join('/');
      const stat = fs.statSync(fullPath);
      files.push({ name, path: fullPath, size: stat.size, mtimeMs: stat.mtimeMs });
    }
  }
  visit(outputDir);
  return files.sort((left, right) => left.name.localeCompare(right.name));
}

function buildQaCatalog({ outputDir = DEFAULT_OUTPUT_DIR, dbPath = DEFAULT_DB_PATH } = {}) {
  if (!fs.existsSync(outputDir)) throw new Error(`Missing output directory: ${outputDir}`);
  const files = collectOutputFiles(outputDir);
  ensureDirectory(path.dirname(dbPath));
  const temporaryPath = `${dbPath}.tmp-${process.pid}-${Date.now()}`;
  fs.rmSync(temporaryPath, { force: true });
  const database = new DatabaseSync(temporaryPath);
  let totalRecords = 0;
  let failed = false;
  try {
    createSchema(database);
    const insertFile = database.prepare(`INSERT INTO files(file_name, bytes, modified_ms, meta_json, schema_json, record_count) VALUES(?, ?, ?, ?, ?, ?)`);
    const insertRecord = database.prepare(`INSERT INTO records(file_name, pointer, title, kind, depth, text) VALUES(?, ?, ?, ?, ?, ?)`);
    const insertTerm = database.prepare(`INSERT OR REPLACE INTO terms(term, record_id, frequency) VALUES(?, ?, ?)`);

    database.exec('BEGIN');
    try {
      for (const file of files) {
        let payload;
        try {
          payload = JSON.parse(fs.readFileSync(file.path, 'utf8'));
        } catch (error) {
          console.warn(`[qa-catalog] skip invalid JSON ${file.name}: ${error.message}`);
          continue;
        }
        const data = payload && typeof payload === 'object' && !Array.isArray(payload) && Object.prototype.hasOwnProperty.call(payload, 'data')
          ? payload.data
          : payload;
        const meta = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload._meta || {} : {};
        const searchableEntityLeaf = /^(?:pet\/wiki|ride\/wiki)\//.test(file.name);
        const isSystemLeaf = file.name.includes('/') && !file.name.endsWith('/index') && !searchableEntityLeaf;
        const records = isSystemLeaf ? [] : collectRecords(payload, file.name);
        insertFile.run(file.name, file.size, Math.floor(file.mtimeMs), JSON.stringify(meta), JSON.stringify(schemaHint(data)), records.length);
        for (const record of records) {
          const result = insertRecord.run(file.name, record.pointer, record.title, record.kind, record.depth, record.text);
          const recordId = Number(result.lastInsertRowid);
          for (const [term, frequency] of tokenize(`${record.title}\n${record.text}`.slice(0, MAX_INDEX_TEXT_LENGTH))) {
            insertTerm.run(term, recordId, frequency);
          }
          totalRecords += 1;
        }
      }
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }

    database.prepare('INSERT INTO meta(key, value) VALUES(?, ?)').run('version', CATALOG_VERSION);
    database.prepare('INSERT INTO meta(key, value) VALUES(?, ?)').run('generated_at', new Date().toISOString());
    database.prepare('INSERT INTO meta(key, value) VALUES(?, ?)').run('signature', buildSignature(files));
    database.prepare('INSERT INTO meta(key, value) VALUES(?, ?)').run('file_count', String(files.length));
    database.prepare('INSERT INTO meta(key, value) VALUES(?, ?)').run('record_count', String(totalRecords));
    database.exec('VACUUM;');
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    database.close();
    if (failed) fs.rmSync(temporaryPath, { force: true });
  }

  fs.rmSync(dbPath, { force: true });
  fs.renameSync(temporaryPath, dbPath);
  return { dbPath, fileCount: files.length, recordCount: totalRecords };
}

if (require.main === module) {
  const outputDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OUTPUT_DIR;
  const dbPath = process.argv[3] ? path.resolve(process.argv[3]) : DEFAULT_DB_PATH;
  try {
    const result = buildQaCatalog({ outputDir, dbPath });
    console.log(`[qa-catalog] built ${result.fileCount} files and ${result.recordCount} records at ${result.dbPath}`);
  } catch (error) {
    console.error(`[qa-catalog] ${error.stack || error.message || error}`);
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_DB_PATH,
  DEFAULT_OUTPUT_DIR,
  CATALOG_VERSION,
  buildQaCatalog,
  collectOutputFiles,
  collectRecords,
  displayPointer,
  jsonPointer,
  normalizeText,
  tokenize,
};
