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
const CATALOG_VERSION = '3';
const MAX_RECORDS_PER_FILE = 4_000;
const MAX_RECORD_TEXT_LENGTH = 3_000;
const MAX_SUMMARY_DEPTH = 3;
const MAX_ARRAY_ITEMS = 8;
const MAX_OBJECT_KEYS = 40;
const MAX_CATALOG_DEPTH = 4;
const MAX_INDEX_TEXT_LENGTH = 700;
const MAX_TERMS_PER_RECORD = 120;

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

function labelFor(value, fallback) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  for (const key of ['title', 'name', 'skillName', 'petName', 'familyName', 'label', 'id', 'level', 'rank', 'quality']) {
    const text = scalarText(value[key]);
    if (text) return text;
  }
  return fallback;
}

function summarizeRecord(value, pointer, parentKey) {
  if (value == null) return '';
  if (typeof value !== 'object') return clipText(`${parentKey || 'value'}: ${String(value)}`);

  const compact = compactValue(value);
  const title = labelFor(value, displayPointer(pointer));
  const header = parentKey ? `${parentKey}：${title}` : title;
  const body = JSON.stringify(compact, null, 2);
  return clipText(`${header}\n${body}`);
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
    title: rootMeta.system || fileName,
    kind: 'file',
    depth: 0,
    text: clipText(rootText),
  });

  function addRecord(value, parts, parentKey, depth, kind = 'record') {
    if (records.length >= MAX_RECORDS_PER_FILE) return;
    const pointer = jsonPointer(parts);
    const text = summarizeRecord(value, pointer, parentKey);
    if (!text || text.length < 8) return;
    records.push({
      pointer,
      title: labelFor(value, displayPointer(pointer)),
      kind,
      depth,
      text,
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
        const labels = child.slice(0, 4).map((item) => labelFor(item, '')).filter(Boolean);
        parts.push(`${key}=[${labels.join('、')}${child.length > labels.length ? '…' : ''}]`);
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
      // Small nested lists are already preserved in their parent summary. Indexing
      // them separately creates mostly duplicate one-row records.
      if (arrayDepth > 0 && value.length <= MAX_ARRAY_ITEMS) return;
      if (records.length < MAX_RECORDS_PER_FILE) {
        records.push({
          pointer: jsonPointer(parts),
          title: `${parentKey || '列表'}（${value.length}项）`,
          kind: 'collection',
          depth,
          text: clipText(`${parentKey || '列表'}：共 ${value.length} 项；路径 ${displayPointer(jsonPointer(parts))}`),
        });
      }
      const indexIndividualRows = arrayDepth === 0 && value.length <= 2_000;
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
          addRecord(child, childParts, parentKey, depth + 1);
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
  return fs.readdirSync(outputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => {
      const fullPath = path.join(outputDir, entry.name);
      const stat = fs.statSync(fullPath);
      return { name: entry.name.slice(0, -5), path: fullPath, size: stat.size, mtimeMs: stat.mtimeMs };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
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
      const records = collectRecords(payload, file.name);
      database.exec('BEGIN');
      try {
        insertFile.run(file.name, file.size, Math.floor(file.mtimeMs), JSON.stringify(meta), JSON.stringify(schemaHint(data)), records.length);
        for (const record of records) {
          const result = insertRecord.run(file.name, record.pointer, record.title, record.kind, record.depth, record.text);
          const recordId = Number(result.lastInsertRowid);
          for (const [term, frequency] of tokenize(`${record.title}\n${record.text}`.slice(0, MAX_INDEX_TEXT_LENGTH))) {
            insertTerm.run(term, recordId, frequency);
          }
          totalRecords += 1;
        }
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
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
