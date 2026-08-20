const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const {
  buildQaCatalog,
  CATALOG_VERSION,
  collectOutputFiles,
  displayPointer,
  normalizeText,
  tokenize,
} = require('../scripts/build_qa_catalog');

const MAX_SEARCH_TERMS = 64;
const MAX_SEARCH_RESULTS = 12;
const MAX_READ_RECORDS = 24;
const MAX_READ_RESPONSE_BYTES = 128 * 1024;
const MAX_QUERY_ITEMS = 10_000;
const MAX_SAMPLE_ROWS = 6;

function clampInteger(value, fallback, minimum, maximum) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function outputSignature(outputDir) {
  return collectOutputFiles(outputDir)
    .map((file) => `${file.name}:${file.size}:${Math.floor(file.mtimeMs)}`)
    .join('|');
}

function isSafeFileName(value) {
  const normalized = String(value || '').normalize('NFKC').split('\\').join('/');
  if (!normalized || normalized.startsWith('/') || normalized.endsWith('/') || normalized.includes('\0')) return false;
  const segments = normalized.split('/');
  return segments.every((segment) => segment && segment !== '.' && segment !== '..' && !/[<>:"|?*\u0000-\u001f]/.test(segment));
}

function decodePointerPart(value) {
  return value.replace(/~1/g, '/').replace(/~0/g, '~');
}

function encodePointerPart(value) {
  return String(value).replace(/~/g, '~0').replace(/\//g, '~1');
}

function dotPathToPointer(value) {
  const path = String(value || '').trim();
  if (!path || path === '$') return '/';
  if (path.startsWith('/')) return path;
  const source = path.startsWith('$') ? path.slice(1) : path;
  const parts = [];
  const matcher = /(?:^|\.)([^.\[\]]+)|\[(\d+|\*)\]/g;
  let match;
  while ((match = matcher.exec(source))) parts.push(match[1] ?? match[2]);
  return parts.length > 0 ? `/${parts.map(encodePointerPart).join('/')}` : '/';
}

function pointerParts(pointer) {
  const normalized = dotPathToPointer(pointer).split('#chunk=')[0];
  if (normalized === '/') return [];
  return normalized.split('/').slice(1).map(decodePointerPart);
}

function parseChunkPointer(pointer) {
  const normalized = dotPathToPointer(pointer);
  const match = /^(.*)#chunk=(\d+)-(\d+)$/.exec(normalized);
  if (!match) return { pointer: normalized, start: null, end: null };
  return { pointer: match[1] || '/', start: Number(match[2]), end: Number(match[3]) };
}

function readPointer(value, pointer) {
  let current = value;
  for (const part of pointerParts(pointer)) {
    if (current == null || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

// Most data files wrap their payload in a `data` key (e.g. power_requirements
// lives at $.data, not $). The model often guesses a pointer without the
// wrapper (e.g. $.byItem[0] instead of $.data.byItem[0]), so when the exact
// pointer misses, retry one level down under /data before reporting "not found".
function resolveDataPointer(raw, pointer) {
  const direct = readPointer(raw, pointer);
  if (direct !== undefined) return { value: direct, pointer };
  if (pointer !== '/' && pointer !== '/data') {
    const dataPointer = `/data${pointer}`;
    const wrapped = readPointer(raw, dataPointer);
    if (wrapped !== undefined) return { value: wrapped, pointer: dataPointer };
  }
  return { value: direct, pointer };
}

function compactForResponse(value, depth = 0) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  // Keep one more level so records such as recastUpgrade[].cost[] retain item
  // names and counts. The read-response byte cap still bounds large payloads.
  if (depth >= 5) return Array.isArray(value) ? `[${value.length} items]` : '[object]';
  if (Array.isArray(value)) {
    const items = value.slice(0, 8).map((item) => compactForResponse(item, depth + 1));
    if (value.length > 8) items.push(`…共 ${value.length} 项`);
    return items;
  }
  const entries = Object.entries(value).filter(([key]) => !['raw', 'source', 'sourceFile', 'icon', 'image', 'metadata', 'otherData'].includes(key));
  const result = {};
  for (const [key, child] of entries.slice(0, 32)) result[key] = compactForResponse(child, depth + 1);
  if (entries.length > 32) result._more = `…共 ${entries.length} 个字段`;
  return result;
}

function resolveWildcard(value, pointer) {
  const parts = pointerParts(pointer);
  let values = [value];
  for (const part of parts) {
    const next = [];
    for (const current of values) {
      if (current == null || typeof current !== 'object') continue;
      if (part === '*') {
        if (Array.isArray(current)) next.push(...current);
        else next.push(...Object.values(current));
      } else if (Object.prototype.hasOwnProperty.call(current, part)) {
        next.push(current[part]);
      }
    }
    values = next;
  }
  return values;
}

function toComparable(value) {
  if (value == null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return normalizeText(value);
}

function matchesFilter(value, filter) {
  if (!filter || typeof filter !== 'object' || !filter.path) return true;
  const values = resolveWildcard(value, filter.path);
  if (Object.prototype.hasOwnProperty.call(filter, 'equals')) {
    const expected = toComparable(filter.equals);
    return values.some((entry) => toComparable(entry) === expected);
  }
  if (typeof filter.contains === 'string') {
    const expected = normalizeText(filter.contains);
    return values.some((entry) => normalizeText(entry).includes(expected));
  }
  if (Number.isFinite(Number(filter.min))) return values.some((entry) => Number(entry) >= Number(filter.min));
  if (Number.isFinite(Number(filter.max))) return values.some((entry) => Number(entry) <= Number(filter.max));
  return true;
}

function aggregateValues(values, aggregate) {
  const numericValues = values.map(Number).filter(Number.isFinite);
  if (aggregate === 'count') return values.length;
  if (aggregate === 'sum') return numericValues.reduce((total, value) => total + value, 0);
  if (aggregate === 'min') return numericValues.length > 0 ? Math.min(...numericValues) : null;
  if (aggregate === 'max') return numericValues.length > 0 ? Math.max(...numericValues) : null;
  return values;
}

class QaCatalog {
  constructor({ outputDir, dbPath }) {
    this.outputDir = outputDir;
    this.dbPath = dbPath;
    this.database = null;
    this.signature = '';
    this.rawCache = new Map();
  }

  close() {
    if (this.database) this.database.close();
    this.database = null;
  }

  invalidate() {
    this.signature = '';
    this.rawCache.clear();
    this.close();
  }

  ensure() {
    const currentSignature = outputSignature(this.outputDir);
    if (this.database && this.signature === currentSignature) return this.database;
    this.close();

    let needsBuild = !fs.existsSync(this.dbPath);
    if (!needsBuild) {
      try {
        const existing = new DatabaseSync(this.dbPath, { readOnly: true });
        const storedVersion = existing.prepare("SELECT value FROM meta WHERE key = 'version'").get()?.value;
        const storedSignature = existing.prepare("SELECT value FROM meta WHERE key = 'signature'").get()?.value;
        existing.close();
        needsBuild = storedVersion !== CATALOG_VERSION || storedSignature !== currentSignature;
      } catch {
        needsBuild = true;
      }
    }
    if (needsBuild) buildQaCatalog({ outputDir: this.outputDir, dbPath: this.dbPath });

    this.database = new DatabaseSync(this.dbPath, { readOnly: true });
    this.database.exec('PRAGMA busy_timeout = 1500;');
    this.signature = currentSignature;
    return this.database;
  }

  status() {
    const database = this.ensure();
    const getMeta = database.prepare('SELECT value FROM meta WHERE key = ?');
    return {
      fileCount: Number(getMeta.get('file_count')?.value || 0),
      recordCount: Number(getMeta.get('record_count')?.value || 0),
      generatedAt: getMeta.get('generated_at')?.value || null,
    };
  }

  fileNamesForScope(database, scope) {
    const normalized = normalizeText(scope);
    if (!normalized || normalized === 'auto' || normalized === 'all') return null;
    const candidates = new Set([normalized]);
    if (normalized.endsWith('s')) candidates.add(normalized.slice(0, -1));
    const files = database.prepare('SELECT file_name, meta_json FROM files').all();
    const matches = files
      .filter((file) => {
        const haystack = normalizeText(`${file.file_name}\n${file.meta_json}`);
        return [...candidates].some((candidate) => haystack.includes(candidate) || candidate.includes(normalizeText(file.file_name)));
      })
      .map((file) => file.file_name);
    return matches;
  }

  search({ query, scope = 'auto', maxResults = 6 } = {}) {
    const database = this.ensure();
    const normalizedQuery = String(query || '').trim().slice(0, 400);
    if (!normalizedQuery) throw new Error('query is required');
    const queryTerms = [...tokenize(normalizedQuery)].slice(0, MAX_SEARCH_TERMS);
    const allowedFiles = this.fileNamesForScope(database, scope);
    if (allowedFiles && allowedFiles.length === 0) return { files: [], documents: [] };

    const limit = clampInteger(maxResults, 6, 1, MAX_SEARCH_RESULTS);
    let rows = [];
    if (queryTerms.length > 0) {
      const termPlaceholders = queryTerms.map(() => '?').join(', ');
      const fileClause = allowedFiles ? ` AND r.file_name IN (${allowedFiles.map(() => '?').join(', ')})` : '';
      rows = database.prepare(`
        SELECT t.term, t.frequency, r.id, r.file_name, r.pointer, r.title, r.text
        FROM terms t
        JOIN records r ON r.id = t.record_id
        WHERE t.term IN (${termPlaceholders})${fileClause}
      `).all(...queryTerms.map(([term]) => term), ...(allowedFiles || []));
    }

    const termWeights = new Map(queryTerms);
    const byId = new Map();
    for (const row of rows) {
      const item = byId.get(row.id) || { ...row, score: 0 };
      item.score += (termWeights.get(row.term) || 1) * Math.min(3, Number(row.frequency) || 1);
      byId.set(row.id, item);
    }
    const compactQuery = normalizeText(normalizedQuery);
    const documents = [...byId.values()]
      .map((item) => ({
        id: item.id,
        file: item.file_name,
        pointer: item.pointer,
        title: item.title,
        source: `${item.file_name}.json / ${displayPointer(item.pointer)}`,
        text: item.text,
        score: item.score + (normalizeText(item.title).includes(compactQuery) ? 12 : 0),
      }))
      .sort((left, right) => right.score - left.score || left.file.localeCompare(right.file) || left.pointer.localeCompare(right.pointer))
      .slice(0, limit);
    return { files: [...new Set(documents.map((document) => document.file))], documents };
  }

  getKnownFile(database, file) {
    if (!isSafeFileName(file)) throw new Error('invalid file name');
    const row = database.prepare('SELECT file_name FROM files WHERE file_name = ?').get(file);
    if (!row) throw new Error(`unknown catalog file: ${file}`);
    return row.file_name;
  }

  loadRawFile(file) {
    const database = this.ensure();
    const fileName = this.getKnownFile(database, file);
    const filePath = path.resolve(this.outputDir, ...fileName.split('/')) + '.json';
    const outputRoot = path.resolve(this.outputDir) + path.sep;
    if (!filePath.startsWith(outputRoot)) throw new Error('invalid file path');
    const stat = fs.statSync(filePath);
    const cached = this.rawCache.get(fileName);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.value;
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    this.rawCache.set(fileName, { mtimeMs: stat.mtimeMs, size: stat.size, value });
    return value;
  }

  resolveRecordPointers(database, input) {
    const requestedIds = Array.isArray(input.record_ids) ? input.record_ids.map(Number).filter(Number.isInteger).slice(0, MAX_READ_RECORDS) : [];
    const pointers = [];
    if (requestedIds.length > 0) {
      const rows = database.prepare(`SELECT id, file_name, pointer, title FROM records WHERE id IN (${requestedIds.map(() => '?').join(', ')})`).all(...requestedIds);
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const id of requestedIds) {
        const row = byId.get(id);
        if (row) pointers.push({ file: row.file_name, pointer: row.pointer, title: row.title });
      }
    }

    const file = input.file ? this.getKnownFile(database, input.file) : '';
    const suppliedPointers = Array.isArray(input.pointers) ? input.pointers : input.pointer ? [input.pointer] : [];
    for (const pointer of suppliedPointers.slice(0, MAX_READ_RECORDS)) {
      if (!file) throw new Error('file is required when reading by pointer');
      pointers.push({ file, pointer: dotPathToPointer(pointer), title: '' });
    }
    return pointers;
  }

  read(input = {}) {
    const database = this.ensure();
    const pointers = this.resolveRecordPointers(database, input);
    if (pointers.length === 0) throw new Error('record_ids or file + pointer is required');
    const limit = clampInteger(input.limit, 8, 1, MAX_READ_RECORDS);
    const offset = clampInteger(input.offset, 0, 0, 10_000);
    const records = [];
    let bytes = 0;
    const pushRecord = (record) => {
      if (records.length >= limit) return false;
      const size = JSON.stringify(record).length;
      if (bytes + size > MAX_READ_RESPONSE_BYTES && records.length > 0) return false;
      bytes += size;
      records.push(record);
      return true;
    };
    for (const requested of pointers) {
      if (records.length >= limit) break;
      const raw = this.loadRawFile(requested.file);
      const chunk = parseChunkPointer(requested.pointer);
      const { value, pointer: resolvedPointer } = resolveDataPointer(raw, chunk.pointer);
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        const start = chunk.start == null ? offset : chunk.start;
        const end = chunk.end == null ? value.length : Math.min(value.length, chunk.end);
        for (let index = start; index < end && records.length < limit; index += 1) {
          const pointer = `${resolvedPointer === '/' ? '' : resolvedPointer}/${index}` || '/';
          if (!pushRecord({
            file: requested.file,
            pointer,
            title: requested.title || displayPointer(pointer),
            source: `${requested.file}.json / ${displayPointer(pointer)}`,
            value: compactForResponse(value[index]),
          })) break;
        }
      } else if (!pushRecord({
        file: requested.file,
        pointer: requested.pointer,
        title: requested.title || displayPointer(requested.pointer),
        source: `${requested.file}.json / ${displayPointer(requested.pointer)}`,
        value: compactForResponse(value),
      })) {
        break;
      }
    }
    return { records };
  }

  query(input = {}) {
    const database = this.ensure();
    const file = this.getKnownFile(database, input.file);
    const requestedPointer = dotPathToPointer(input.pointer || input.path || '/data');
    const raw = this.loadRawFile(file);
    const { value: resolvedValue, pointer } = resolveDataPointer(raw, requestedPointer);
    const collection = Array.isArray(resolvedValue) ? resolvedValue : null;
    if (!collection) throw new Error('pointer must resolve to an array');
    const aggregate = ['count', 'sum', 'min', 'max', 'list'].includes(input.aggregate) ? input.aggregate : 'list';
    const filters = Array.isArray(input.filters) ? input.filters : input.filter ? [input.filter] : [];
    const hasValuePath = Boolean(input.value_path || input.valuePath);
    const valuePath = input.value_path || input.valuePath || '/';
    const groupBy = input.group_by || input.groupBy || '';
    const valuesByGroup = new Map();
    const samples = [];
    let matchedItems = 0;

    for (let index = 0; index < collection.length && index < MAX_QUERY_ITEMS; index += 1) {
      const item = collection[index];
      if (!filters.every((filter) => matchesFilter(item, filter))) continue;
      matchedItems += 1;
      const values = aggregate === 'count' && !hasValuePath
        ? [item]
        : resolveWildcard(item, valuePath).filter((value) => value == null || ['string', 'number', 'boolean'].includes(typeof value));
      const groupValues = groupBy ? resolveWildcard(item, groupBy) : ['all'];
      const groups = groupValues.length > 0 ? groupValues.map((value) => String(value)) : ['all'];
      for (const group of groups) {
        if (!valuesByGroup.has(group)) valuesByGroup.set(group, []);
        valuesByGroup.get(group).push(...values);
      }
      if (samples.length < MAX_SAMPLE_ROWS) {
        samples.push({
          pointer: `${pointer === '/' ? '' : pointer}/${index}` || '/',
          value: compactForResponse(item),
        });
      }
    }

    const groups = [...valuesByGroup.entries()].map(([key, values]) => ({ key, value: aggregateValues(values, aggregate) }));
    const value = groupBy ? null : (groups[0]?.value ?? aggregateValues([], aggregate));
    return {
      file,
      pointer,
      source: `${file}.json / ${displayPointer(pointer)}`,
      aggregate,
      matchedItems,
      value,
      groups,
      samples,
    };
  }
}

function createQaCatalog(options) {
  return new QaCatalog(options);
}

module.exports = {
  QaCatalog,
  createQaCatalog,
  displayPointer,
  dotPathToPointer,
};
