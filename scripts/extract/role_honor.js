/**
 * Role honor system.
 * Independent export for title attributes, upgrade costs, and display groups.
 */
const u = require('../lib/utils');
const { DEFAULT_SETTINGS, loadAppSettings } = require('../../server/app-config');

const ATTRIBUTE_LABELS = {
  hp: '\u751f\u547d',
  mp: '\u9b54\u6cd5',
  atk: '\u653b\u51fb',
  def: '\u9632\u5fa1',
  healHp: '\u56de\u8840',
  healMp: '\u56de\u9b54',
  hitVal: '\u547d\u4e2d',
  dodge: '\u95ea\u907f',
  crit: '\u66b4\u51fb',
  tenacity: '\u97e7\u6027',
  lucky: '\u5e78\u8fd0',
  guardian: '\u5b88\u62a4',
};

const TYPE_LABELS = {
  0: '\u666e\u901a\u79f0\u53f7',
  1: '\u6d3b\u52a8\u79f0\u53f7',
  3: '\u5192\u9669\u79f0\u53f7',
  6: 'VIP\u79f0\u53f7',
  7: '\u4ed9\u4f4d\u79f0\u53f7',
  8: '\u6597\u5ba0\u79f0\u53f7',
  9: '\u5929\u9053\u79f0\u53f7',
  10: '\u540d\u5e08\u79f0\u53f7',
  11: '\u6210\u5c31\u79f0\u53f7',
  12: '\u795e\u5c06\u79f0\u53f7',
  13: '\u9b54\u738b\u79f0\u53f7',
  14: '\u6d3b\u52a8\u79f0\u53f7',
  16: '\u6392\u884c\u79f0\u53f7',
  17: '\u7ade\u6280\u79f0\u53f7',
  18: '\u6392\u884c\u79f0\u53f7',
  19: '\u6d3b\u52a8\u79f0\u53f7',
};

const LEVEL_SERIES = {
  6: { key: 'vip', name: 'VIP\u79f0\u53f7', order: 10 },
  7: { key: 'xianwei', name: '\u4ed9\u4f4d\u79f0\u53f7', order: 20 },
  8: { key: 'pet_arena', name: '\u6597\u5ba0\u79f0\u53f7', order: 30 },
};

const MAINLINE_TYPE = 3;
const MAINLINE_SERIES = { key: 'mainline', name: '\u4e3b\u7ebf\u79f0\u53f7', order: 40 };

function configuredMaxLevel() {
  const settings = loadAppSettings();
  const value = Number(settings.data?.maxLevel);
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_SETTINGS.data.maxLevel;
}

function itemNameStrict(itemId) {
  const item = u.getItems().get(itemId);
  if (!item) throw new Error('\u79f0\u53f7\u6d88\u8017\u5f15\u7528\u4e86\u4e0d\u5b58\u5728\u7684\u9053\u5177 itemId=' + itemId);
  return item.name;
}

function parseCostStrict(cost, label) {
  if (cost == null) return null;
  if (!Array.isArray(cost) || cost.length === 0) return cost;
  const rows = Array.isArray(cost[0]) ? cost : [cost];
  return rows.map((entry, index) => {
    if (!Array.isArray(entry) || entry.length < 2 || typeof entry[0] !== 'number') {
      throw new Error(label + ' \u6d88\u8017\u683c\u5f0f\u5f02\u5e38 index=' + index);
    }
    return {
      itemId: entry[0],
      name: itemNameStrict(entry[0]),
      count: entry[1],
    };
  });
}

function parseUnlockCost(value) {
  if (!Array.isArray(value) || value.length === 0 || !Array.isArray(value[0])) return null;
  const rows = value;
  const items = u.getItems();
  for (const entry of rows) {
    if (!Array.isArray(entry) || entry.length < 2 || typeof entry[0] !== 'number') return null;
    if (!items.has(entry[0])) return null;
    if (typeof entry[1] !== 'number' || !Number.isFinite(entry[1])) return null;
  }
  return rows.map((entry) => ({
    itemId: entry[0],
    name: itemNameStrict(entry[0]),
    count: entry[1],
  }));
}

function addCosts(left, right) {
  const totals = new Map();
  for (const cost of [...(left || []), ...(right || [])]) {
    if (!cost || typeof cost.itemId !== 'number') continue;
    const previous = totals.get(cost.itemId) || { itemId: cost.itemId, name: cost.name, count: 0 };
    if (typeof cost.count !== 'number' || !Number.isFinite(cost.count)) {
      throw new Error('\u79f0\u53f7\u6d88\u8017\u6570\u91cf\u4e0d\u662f\u6709\u6548\u6570\u5b57 itemId=' + cost.itemId);
    }
    previous.count += cost.count;
    totals.set(cost.itemId, previous);
  }
  return [...totals.values()];
}

function formatAttributes(fields, values, label) {
  if (!Array.isArray(fields) || !Array.isArray(values) || fields.length !== values.length) {
    throw new Error(label + ' \u5c5e\u6027\u5b57\u6bb5\u548c\u503c\u6570\u91cf\u4e0d\u4e00\u81f4');
  }
  return fields.map((field, index) => {
    const name = ATTRIBUTE_LABELS[field];
    if (!name) throw new Error(label + ' \u51fa\u73b0\u672a\u767b\u8bb0\u5c5e\u6027\u5b57\u6bb5 ' + field);
    const value = values[index];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(label + ' \u5c5e\u6027 ' + field + ' \u7f3a\u5c11\u6709\u6548\u6570\u503c');
    }
    return { field, name, value };
  });
}

function buildAttributeRowsByButeId() {
  const rowsByButeId = new Map();
  for (const row of u.loadTable('titleAttribute')) {
    if (!rowsByButeId.has(row.buteId)) rowsByButeId.set(row.buteId, []);
    rowsByButeId.get(row.buteId).push({
      id: row.id,
      playerLevel: row.level,
      attributes: formatAttributes(row.attribute || [], row.attributeValue || [], 'titleAttribute.' + row.id),
    });
  }
  for (const rows of rowsByButeId.values()) {
    rows.sort((left, right) => left.playerLevel - right.playerLevel || left.id - right.id);
  }
  return rowsByButeId;
}

function chainName(firstName) {
  return String(firstName || '').replace(/[?].*$/, '').trim();
}

function typeLabel(type) {
  return TYPE_LABELS[type] || ('\u7c7b\u578b ' + type);
}

function attributeText(attributes) {
  if (!Array.isArray(attributes) || attributes.length === 0) return '';
  return attributes.map((attr) => attr.name + ' +' + attr.value).join(' / ');
}

function pickAttributeAtLevel(rows, level) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  let selected = null;
  for (const row of rows) {
    if (row.playerLevel > level) break;
    selected = row;
  }
  return selected;
}

function buildRank(row, attrRowsByButeId) {
  const attributeRows = row.buteId == null ? [] : (attrRowsByButeId.get(row.buteId) || []);
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    showName: row.showName,
    showNameIndex: row.showNameIndex,
    type: row.type,
    typeLabel: typeLabel(row.type),
    getDesc: row.getDesc,
    resetText: row.resetText,
    rankCost: parseCostStrict(row.rankCost, 'title.' + row.id + '.rankCost'),
    unlockCost: parseUnlockCost(row.value),
    nextId: row.nextId,
    buteId: row.buteId,
    attributeRows,
  };
}

function buildChains(attrRowsByButeId) {
  const chains = new Map();
  for (const row of u.loadTable('title')) {
    const group = row.group ?? row.id;
    if (!chains.has(group)) {
      chains.set(group, {
        group,
        name: chainName(row.name),
        showName: row.showName,
        showNameIndex: row.showNameIndex,
        type: row.type,
        typeLabel: typeLabel(row.type),
        ranks: [],
      });
    }
    chains.get(group).ranks.push(buildRank(row, attrRowsByButeId));
  }

  return [...chains.values()].map((chain) => {
    chain.ranks.sort((left, right) => (left.level ?? 0) - (right.level ?? 0) || left.id - right.id);
    chain.name = chainName(chain.ranks[0]?.name) || chain.name;
    chain.type = chain.ranks[0]?.type ?? chain.type;
    chain.typeLabel = typeLabel(chain.type);
    chain.hasAttributes = chain.ranks.some((rank) => rank.attributeRows.length > 0);
    chain.hasUpgradeCost = chain.ranks.some((rank) => Array.isArray(rank.rankCost) && rank.rankCost.length > 0);
    chain.rankCount = chain.ranks.length;
    chain.maxRankLevel = Math.max(...chain.ranks.map((rank) => rank.level ?? 0));
    chain.levelLinked = chain.ranks.some((rank) => rank.attributeRows.length > 1);
    return chain;
  });
}

function withCostTotals(ranks) {
  let cumulative = [];
  return ranks.map((rank, index) => {
    const upgradeCost = index === 0 ? rank.unlockCost : ranks[index - 1].rankCost;
    cumulative = addCosts(cumulative, upgradeCost || []);
    const fixedAttributeRow = rank.attributeRows.length === 1 ? rank.attributeRows[0] : null;
    return {
      ...rank,
      attributes: fixedAttributeRow?.attributes || [],
      attributeText: attributeText(fixedAttributeRow?.attributes || []),
      upgradeCost,
      cumulativeCost: cumulative.length ? cumulative : null,
    };
  });
}

function buildRegularGroup(chain) {
  return {
    id: 'chain-' + chain.group,
    group: chain.group,
    kind: 'regular',
    category: chain.hasAttributes ? 'with_attributes' : 'without_attributes',
    seriesKey: 'chain-' + chain.group,
    seriesName: chain.name,
    name: chain.name,
    showName: chain.showName,
    showNameIndex: chain.showNameIndex,
    type: chain.type,
    typeLabel: chain.typeLabel,
    levelLinked: false,
    hasAttributes: chain.hasAttributes,
    hasUpgradeCost: chain.hasUpgradeCost,
    rankCount: chain.rankCount,
    maxRankLevel: chain.maxRankLevel,
    rows: withCostTotals(chain.ranks),
    searchText: [chain.name, chain.showName, chain.typeLabel, ...chain.ranks.map((rank) => [rank.name, rank.getDesc, rank.resetText, attributeText(rank.attributeRows[0]?.attributes || [])].filter(Boolean).join(' '))].filter(Boolean).join(' '),
  };
}

function buildLevelSeries(chains, series, maxLevel) {
  const rows = chains
    .flatMap((chain) => chain.ranks.map((rank) => ({ chain, rank })))
    .map(({ chain, rank }) => {
      const selected = pickAttributeAtLevel(rank.attributeRows, maxLevel);
      return {
        id: rank.id,
        name: rank.name,
        level: rank.level,
        type: rank.type,
        typeLabel: rank.typeLabel,
        getDesc: rank.getDesc,
        resetText: rank.resetText,
        group: chain.group,
        attributeRows: rank.attributeRows,
        attributes: selected?.attributes || [],
        attributeText: attributeText(selected?.attributes || []),
      };
    })
    .sort((left, right) => left.id - right.id);

  return {
    id: 'series-' + series.key,
    kind: 'level_series',
    category: 'with_attributes',
    seriesKey: series.key,
    seriesName: series.name,
    name: series.name,
    showName: rows[0]?.typeLabel || series.name,
    showNameIndex: series.order,
    type: rows[0]?.type ?? null,
    typeLabel: series.name,
    levelLinked: true,
    hasAttributes: true,
    hasUpgradeCost: false,
    rankCount: rows.length,
    maxRankLevel: 0,
    rows,
    searchText: [series.name, ...rows.map((row) => [row.name, row.getDesc, row.attributeText].filter(Boolean).join(' '))].join(' '),
  };
}

function buildMainlineSeries(chains) {
  const rows = chains
    .flatMap((chain) => chain.ranks.map((rank) => ({ chain, rank })))
    .map(({ chain, rank }) => {
      const selected = rank.attributeRows[0] || null;
      return {
        id: rank.id,
        name: rank.name,
        level: rank.level,
        type: rank.type,
        typeLabel: rank.typeLabel,
        getDesc: rank.getDesc,
        resetText: rank.resetText,
        group: chain.group,
        attributes: selected?.attributes || [],
        attributeText: attributeText(selected?.attributes || []),
      };
    })
    .sort((left, right) => left.id - right.id);

  return {
    id: 'series-' + MAINLINE_SERIES.key,
    kind: 'mainline_series',
    category: 'with_attributes',
    seriesKey: MAINLINE_SERIES.key,
    seriesName: MAINLINE_SERIES.name,
    name: MAINLINE_SERIES.name,
    showName: '\u5192\u9669\u79f0\u53f7',
    showNameIndex: MAINLINE_SERIES.order,
    type: MAINLINE_TYPE,
    typeLabel: '\u5192\u9669\u79f0\u53f7',
    levelLinked: false,
    hasAttributes: true,
    hasUpgradeCost: false,
    rankCount: rows.length,
    maxRankLevel: 0,
    rows,
    searchText: [MAINLINE_SERIES.name, ...rows.map((row) => [row.name, row.getDesc, row.attributeText].filter(Boolean).join(' '))].join(' '),
  };
}

function extract() {
  console.log('\nrole honor export');

  const maxLevel = configuredMaxLevel();
  const attrRowsByButeId = buildAttributeRowsByButeId();
  const chains = buildChains(attrRowsByButeId);
  const consumedGroups = new Set();
  const groups = [];

  for (const [type, series] of Object.entries(LEVEL_SERIES)) {
    const typedChains = chains.filter((chain) => Number(type) === chain.type && chain.levelLinked);
    if (typedChains.length === 0) continue;
    typedChains.forEach((chain) => consumedGroups.add(chain.group));
    groups.push(buildLevelSeries(typedChains, series, maxLevel));
  }

  const mainlineChains = chains.filter((chain) => chain.type === MAINLINE_TYPE && chain.hasAttributes);
  if (mainlineChains.length > 0) {
    mainlineChains.forEach((chain) => consumedGroups.add(chain.group));
    groups.push(buildMainlineSeries(mainlineChains));
  }

  for (const chain of chains) {
    if (consumedGroups.has(chain.group)) continue;
    groups.push(buildRegularGroup(chain));
  }

  groups.sort((left, right) => (left.showNameIndex ?? 0) - (right.showNameIndex ?? 0) || String(left.name).localeCompare(String(right.name), 'zh-Hans-CN'));

  const stats = {
    totalGroups: groups.length,
    withAttributes: groups.filter((group) => group.hasAttributes).length,
    withoutAttributes: groups.filter((group) => !group.hasAttributes).length,
    levelLinked: groups.filter((group) => group.levelLinked).length,
    regularUpgradeChains: groups.filter((group) => group.kind === 'regular' && group.hasUpgradeCost).length,
  };

  u.saveOutput('role_honor', { configuredMaxLevel: maxLevel, stats, groups }, {
    system: '\u89d2\u8272 \u2192 \u79f0\u53f7\u7cfb\u7edf',
    source: 'title.*.json + titleAttribute.*.json',
    configuredMaxLevel: maxLevel,
    note: '\u72ec\u7acb\u79f0\u53f7\u5c55\u793a\u6570\u636e\uff1b\u4e0d\u590d\u7528 role_title \u6216 role_extreme_stats\u3002rankCost \u4e3a\u5347\u9636\u6d88\u8017\uff0ctitleAttribute \u4e3a\u79f0\u53f7\u5c5e\u6027\u6765\u6e90\uff0cvalue \u53ea\u4fdd\u7559\u539f\u59cb\u89e3\u9501\u6761\u4ef6\u542b\u4e49\uff0c\u4e0d\u89e3\u6790\u4e3a\u6d88\u8017\u3002',
  });
}

if (require.main === module) extract();
module.exports = extract;
