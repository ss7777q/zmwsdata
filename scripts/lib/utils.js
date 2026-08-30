/**
 * 共享工具函数 — 所有提取脚本依赖此模块
 * 功能: 通配加载 dataApi 表, item 名称查询, 通用 cost 解析, 输出 JSON
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'dataApi');
const OUTPUT_DIR = path.join(ROOT, 'output');

// ─── 表文件加载（通配哈希）───────────────────────────

/** 通配查找 dataApi/<tableName>.*.json，兼容未来版本哈希变更 */
function findTableFile(tableName) {
  const files = fs.readdirSync(DATA_DIR);
  const match = files.find(f => {
    const dot1 = f.indexOf('.');
    return f.substring(0, dot1) === tableName && f.endsWith('.json');
  });
  if (!match) throw new Error(`找不到数据表: ${tableName}.*.json`);
  return path.join(DATA_DIR, match);
}

/** 加载并解析数据表（自动通配哈希） */
function isInactiveDataApiRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  return row.cancel === 1 || row.close === 1;
}

function loadTable(tableName) {
  const rows = JSON.parse(fs.readFileSync(findTableFile(tableName), 'utf-8'));
  if (!Array.isArray(rows)) return rows;
  return rows.filter(row => !isInactiveDataApiRow(row));
}

// ─── Item 表查询 ─────────────────────────────────────

let _items = null;
function getItems() {
  if (!_items) {
    _items = new Map();
    for (const it of loadTable('item')) _items.set(it.id, it);
  }
  return _items;
}

function itemName(id) {
  const m = getItems();
  return m.has(id) ? m.get(id).name : `未知道具`;
}

function itemInfo(id) {
  const m = getItems();
  const it = m.get(id);
  if (!it) return { id, name: `未知(${id})`, type: 'unknown' };
  return { id: it.id, name: it.name, type: it.type, icon: it.icon };
}

// ─── 通用 cost 解析 ──────────────────────────────────

/**
 * 解析各种消耗格式，统一输出 [{itemId, name, count}, ...]
 * 支持:
 *   [[itemId, count], ...]  — 多道具消耗
 *   [itemId, count]         — 单道具消耗
 *   {"itemId": count, ...}  — 对象映射 (equipSmelt)
 *   [[itemId, [min,max]]]   — 范围消耗 (stone sellCost)
 *   null                    — 无消耗
 */
function parseCost(cost) {
  if (cost == null) return null;

  // 对象映射: {"4": 6, "5": 6}
  if (typeof cost === 'object' && !Array.isArray(cost)) {
    return Object.entries(cost).map(([k, v]) => ({
      itemId: Number(k), name: itemName(Number(k)), count: v
    }));
  }

  if (!Array.isArray(cost) || cost.length === 0) return cost;

  // 嵌套数组: [[itemId, count], ...]
  if (Array.isArray(cost[0])) {
    // 兼容 [[[itemId, count], ...], ...] 格式 (如 pet.starCost)
    let list = Array.isArray(cost[0][0]) ? cost.flat() : cost;

    return list.map(c => {
      const count = Array.isArray(c[1]) ? { min: c[1][0], max: c[1][1] } : c[1];
      return { itemId: c[0], name: itemName(c[0]), count };
    });
  }

  // 单对: [itemId, count]
  if (cost.length === 2 && typeof cost[0] === 'number') {
    return [{ itemId: cost[0], name: itemName(cost[0]), count: cost[1] }];
  }

  return cost;
}

// ─── 输出 ────────────────────────────────────────────

/** 写出提取结果到 output/<name>.json */
function saveOutput(name, data, meta = {}) {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const fp = path.join(OUTPUT_DIR, name + '.json');
  const extractedAt = new Date().toISOString();
  const out = {
    _meta: { name, extractedAt, ...meta },
    data
  };

  if (!writeJsonIfChanged(fp, out)) {
    const cnt = Array.isArray(data) ? data.length + '条' : Object.keys(data).length + '组';
    console.log(`  ⏭️ ${name}.json unchanged → ${cnt}`);
    return;
  }
  const cnt = Array.isArray(data) ? data.length + '条' : Object.keys(data).length + '组';
  console.log(`  ✅ ${name}.json → ${cnt}`);
}

function writeJsonIfChanged(filePath, value) {
  const comparable = node => {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(comparable);
    return Object.fromEntries(
      Object.entries(node)
        .filter(([key]) => key !== 'extractedAt' && key !== 'generatedAt')
        .map(([key, entry]) => [key, comparable(entry)])
    );
  };

  if (fs.existsSync(filePath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (JSON.stringify(comparable(existing)) === JSON.stringify(comparable(value))) return false;
    } catch {
      // Rewrite malformed or unreadable output below.
    }
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value), 'utf8');
  return true;
}

// ─── 去重辅助 ────────────────────────────────────────

/** 按 cost 字段做分段去重 (装备强化、宠物装备强化等通用) */
function dedupByLevelTier(records, { costField = 'cost', levelField = 'level' } = {}) {
  const tiers = [];
  let prev = null;
  for (const r of records) {
    if (!r[costField]) continue;
    const key = JSON.stringify(r[costField]);
    if (!prev || prev._key !== key) {
      prev = {
        _key: key,
        levelStart: r[levelField],
        levelEnd: r[levelField],
        exp: r.exp || null,
        cost: parseCost(r[costField])
      };
      tiers.push(prev);
    } else {
      prev.levelEnd = r[levelField];
      if (r.exp) prev.exp = r.exp; // 取该段内重复值(多数级别的exp)
    }
  }
  tiers.forEach(t => delete t._key);
  return tiers;
}

module.exports = {
  ROOT, DATA_DIR, OUTPUT_DIR,
  findTableFile, loadTable, isInactiveDataApiRow,
  getItems, itemName, itemInfo,
  parseCost, saveOutput, writeJsonIfChanged, dedupByLevelTier
};
