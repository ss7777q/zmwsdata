const u = require('../lib/utils');

function toMap(rows) {
  return new Map(rows.map((row) => [row.id, row]));
}

function stageRef(stageId, stageMap) {
  if (!Number.isFinite(Number(stageId)) || Number(stageId) <= 0) return null;
  const id = Number(stageId);
  return { id, name: stageMap.get(id)?.name || `关卡 ${id}` };
}

function boxContentLabel(boxName) {
  return String(boxName || '')
    .replace(/箱子$/, '')
    .replace(/金$/, '')
    .trim();
}

function buildSurpriseBoxes(tables) {
  const itemMap = toMap(tables.items);
  const boxes = [...tables.surpriseBoxes].sort((left, right) => left.type - right.type || left.id - right.id);
  const dropByLevel = toMap(tables.surpriseDrops);

  const levels = [...tables.surprisePools]
    .sort((left, right) => left.id - right.id)
    .map((pool, index, pools) => {
      const drop = dropByLevel.get(pool.id) || {};
      const activeBoxes = boxes.filter((box) => Number(pool[box.id]) > 0 && Array.isArray(drop[box.id]));
      return {
        level: pool.id,
        levelEnd: pools[index + 1] ? pools[index + 1].id - 1 : null,
        boxes: activeBoxes.map((box) => ({
          id: box.id,
          tier: box.type,
          name: box.name,
          contentLabel: boxContentLabel(box.boxName),
          waitHours: box.time,
          poolWeight: Number(pool[box.id]),
          rewards: drop[box.id].map(([itemId, count]) => {
            const item = itemMap.get(itemId);
            return {
              itemId,
              name: item?.name || `未知道具 ${itemId}`,
              count,
              icon: item?.icon ?? null,
            };
          }),
        })),
      };
    });

  return {
    note: '奖励按宝箱掉落时的角色等级档确定；出现权重是同一等级档内的配置相对权重。',
    tiers: [...new Map(boxes.map((box) => [box.type, {
      tier: box.type,
      name: box.name,
      waitHours: box.time,
    }])).values()],
    levels,
  };
}

function shopRowKey(row) {
  return JSON.stringify([
    row.subtype,
    row.name,
    row.num,
    row.cost,
    row.limitStage,
    row.deleteStage,
    row.limitLv,
    row.limitVip,
  ]);
}

function dedupeShopRows(rows) {
  const deduped = new Map();
  for (const row of rows) {
    const key = shopRowKey(row);
    const existing = deduped.get(key);
    if (!existing || Number(row.weight || 0) > Number(existing.weight || 0)) {
      deduped.set(key, row);
    }
  }
  return [...deduped.values()];
}

function isStageMaterial(row, item) {
  return item?.type !== 'equip' && (String(row.itemId).startsWith('898') || /原石$/.test(row.name || ''));
}

function buildShopItem(row, itemMap, stageMap) {
  const item = itemMap.get(row.itemId);
  const cost = Array.isArray(row.cost) && Array.isArray(row.cost[0]) ? row.cost[0] : null;
  const costItem = cost ? itemMap.get(cost[0]) : null;
  return {
    kind: 'item',
    name: row.name || item?.name || `未知道具 ${row.itemId}`,
    quantity: Number(row.num) || 1,
    cost: cost ? {
      itemId: cost[0],
      name: costItem?.name || `未知道具 ${cost[0]}`,
      count: cost[1],
    } : null,
    unlockStage: stageRef(row.limitStage, stageMap),
    retireStage: stageRef(row.deleteStage, stageMap),
    unlockLevel: Number(row.limitLv) > 0 ? Number(row.limitLv) : null,
    unlockVip: Number(row.limitVip) > 0 ? Number(row.limitVip) : null,
    weight: Number(row.weight) || 0,
  };
}

function buildSecretShop(tables) {
  const itemMap = toMap(tables.items);
  const stageMap = toMap(tables.stages);
  const rows = dedupeShopRows(tables.shops.filter((row) => row.type === 'secret'));

  const slots = [1, 2, 3, 4, 5].map((slot) => {
    const slotRows = rows.filter((row) => row.subtype === slot);
    const materialRows = slotRows.filter((row) => isStageMaterial(row, itemMap.get(row.itemId)));
    const equipmentRows = slotRows.filter((row) => itemMap.get(row.itemId)?.type === 'equip');
    const hiddenIds = new Set([...materialRows, ...equipmentRows].map((row) => row.id));
    const items = slotRows
      .filter((row) => !hiddenIds.has(row.id))
      .map((row) => buildShopItem(row, itemMap, stageMap))
      .sort((left, right) =>
        (left.unlockStage?.id || 0) - (right.unlockStage?.id || 0) ||
        left.name.localeCompare(right.name, 'zh-CN')
      );

    if (equipmentRows.length > 0) {
      items.unshift({
        kind: 'category',
        name: '关卡装备',
        note: '具体装备随主线进度与角色变化',
      });
    }
    if (materialRows.length > 0) {
      items.unshift({
        kind: 'category',
        name: '关卡材料道具',
        note: '具体材料随主线进度变化',
      });
    }

    return { slot, items };
  });

  return {
    note: '神秘商店固定显示 5 格；各格从对应 subtype 商品池中生成，购买后该格会清空。',
    slots,
  };
}

const BLACK_MARKET_UNLOCK_STAGE_ID = 40301;

function parseGameTime(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value;
  const normalized = String(value).trim().replace(' ', 'T');
  const timestamp = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)
    ? normalized
    : `${normalized}+08:00`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isTimeActive(row, timestamp) {
  const startTime = parseGameTime(row.startTime);
  const endTime = parseGameTime(row.endTime);
  return (startTime == null || startTime <= timestamp)
    && (endTime == null || endTime >= timestamp);
}

function buildPrice(value, itemMap) {
  const raw = Array.isArray(value) && Array.isArray(value[0]) ? value[0] : null;
  if (!raw) return null;
  const item = itemMap.get(raw[0]);
  return {
    itemId: raw[0],
    name: item?.name || `未知道具 ${raw[0]}`,
    count: Number(raw[1]) || 0,
  };
}

function buildBlackMarketItem(row, itemMap) {
  const item = itemMap.get(row.itemId);
  const formerCost = buildPrice(row.formerCost, itemMap);
  const cost = buildPrice(row.cost, itemMap);
  const discountPercent = formerCost && cost && formerCost.itemId === cost.itemId && formerCost.count > 0
    ? Math.round((cost.count / formerCost.count) * 1000) / 10
    : null;

  return {
    id: row.id,
    itemId: row.itemId,
    name: row.name || item?.name || `未知道具 ${row.itemId}`,
    quantity: Number(row.num) || 1,
    formerCost,
    cost,
    discountPercent,
    tag: Number(row.tag) > 0 ? Number(row.tag) : null,
    weight: Number(row.weight) || 0,
  };
}

function isStageActive(row, stageId) {
  return (!row.limitStage || Number(row.limitStage) <= stageId)
    && (!row.deleteStage || Number(row.deleteStage) > stageId);
}

function blackMarketStageIds(rows) {
  return [...new Set([
    BLACK_MARKET_UNLOCK_STAGE_ID,
    ...rows.flatMap((row) => [row.limitStage, row.deleteStage])
      .map(Number)
      .filter((stageId) => Number.isFinite(stageId) && stageId >= BLACK_MARKET_UNLOCK_STAGE_ID),
  ])].sort((left, right) => left - right);
}

function buildBlackMarketMode({ id, name, rows, timestamp, activity, itemMap, stageMap, stageIds }) {
  const activeRows = rows.filter((row) => isTimeActive(row, timestamp));
  const stages = stageIds.map((stageId, index) => ({
    stage: stageRef(stageId, stageMap),
    nextStage: stageRef(stageIds[index + 1], stageMap),
    slots: [1, 2, 3, 4, 5, 6].map((slot) => ({
      slot,
      items: activeRows
        .filter((row) => Array.isArray(row.subtype) && row.subtype.includes(slot) && isStageActive(row, stageId))
        .map((row) => buildBlackMarketItem(row, itemMap))
        .sort((left, right) =>
          left.name.localeCompare(right.name, 'zh-CN')
          || (left.discountPercent ?? 100) - (right.discountPercent ?? 100)
          || left.id - right.id
        ),
    })),
  }));

  return {
    id,
    name,
    snapshotTime: new Date(timestamp).toISOString(),
    activity,
    stages,
  };
}

function buildBlackMarket(tables) {
  const itemMap = toMap(tables.items);
  const stageMap = toMap(tables.stages);
  const rows = tables.shops.filter((row) => row.type === 'black');
  const stageIds = blackMarketStageIds(rows);
  const specialActivity = tables.activities.find((row) =>
    row.name === '黑市特惠' && row.otherInfo?.jumpShopType === 'black'
  );
  const specialStart = parseGameTime(specialActivity?.startTime);
  const specialEnd = parseGameTime(specialActivity?.endTime);
  const specialSnapshot = specialStart == null
    ? Date.now()
    : Math.min(specialStart + 24 * 60 * 60 * 1000, specialEnd ?? Number.POSITIVE_INFINITY);
  const activity = specialActivity ? {
    id: specialActivity.id,
    name: specialActivity.name,
    startTime: specialActivity.startTime,
    endTime: specialActivity.endTime,
  } : null;

  return {
    note: '黑市固定显示 6 格，每日 06:00 自动刷新；商品池和宝石等级会随主线阶段变化。',
    unlockStage: stageRef(BLACK_MARKET_UNLOCK_STAGE_ID, stageMap),
    dailyRefreshTime: '06:00',
    modes: [
      buildBlackMarketMode({
        id: 'current',
        name: '当前常规',
        rows,
        timestamp: Date.now(),
        activity: null,
        itemMap,
        stageMap,
        stageIds,
      }),
      buildBlackMarketMode({
        id: 'special',
        name: '黑市特惠',
        rows,
        timestamp: specialSnapshot,
        activity,
        itemMap,
        stageMap,
        stageIds,
      }),
    ],
  };
}

function buildResourceAcquisitionData(tables) {
  return {
    surpriseBoxes: buildSurpriseBoxes(tables),
    secretShop: buildSecretShop(tables),
    blackMarket: buildBlackMarket(tables),
  };
}

function loadTables() {
  return {
    surpriseBoxes: u.loadTable('surpriseBox'),
    surprisePools: u.loadTable('surprisePool'),
    surpriseDrops: u.loadTable('surpriseDrop'),
    shops: u.loadTable('shop'),
    items: u.loadTable('item'),
    stages: u.loadTable('stage'),
    activities: u.loadTable('activity'),
  };
}

function extract() {
  console.log('\n📦 资源获取');
  const data = buildResourceAcquisitionData(loadTables());
  u.saveOutput('resource_acquisition', data, {
    system: '资源获取',
    source: 'surpriseBox/surprisePool/surpriseDrop/shop/item/stage/activity.*.json',
    note: '惊喜宝箱按掉落等级档展示奖励；神秘商店按五个格子展示；黑市按价格方案、主线阶段和六个格子展示。',
  });
}

if (require.main === module) extract();

module.exports = extract;
module.exports.buildResourceAcquisitionData = buildResourceAcquisitionData;
module.exports.isStageMaterial = isStageMaterial;
module.exports.isTimeActive = isTimeActive;
