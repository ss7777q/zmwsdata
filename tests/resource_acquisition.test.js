const test = require('node:test');
const assert = require('node:assert/strict');
const extract = require('../scripts/extract/resource_acquisition');
const u = require('../scripts/lib/utils');

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

test('资源获取提取器生成完整的宝箱等级档和五格神秘商店', () => {
  const data = extract.buildResourceAcquisitionData(loadTables());

  assert.equal(data.surpriseBoxes.levels.length, 24);
  assert.equal(data.surpriseBoxes.levels[0].level, 30);
  assert.equal(data.surpriseBoxes.levels.at(-1).level, 260);
  assert.ok(data.surpriseBoxes.levels.every((tier) => tier.boxes.length > 0));
  assert.ok(data.surpriseBoxes.levels.every((tier) => tier.boxes.every((box) => box.rewards.length > 0)));

  assert.deepEqual(data.secretShop.slots.map((slot) => slot.slot), [1, 2, 3, 4, 5]);
  assert.ok(data.secretShop.slots.every((slot) => slot.items.length > 0));
});

test('黑市按常规与特惠两套价格方案生成六格阶段商品池', () => {
  const data = extract.buildResourceAcquisitionData(loadTables());
  const [current, special] = data.blackMarket.modes;

  assert.equal(data.blackMarket.unlockStage.id, 40301);
  assert.equal(data.blackMarket.dailyRefreshTime, '06:00');
  assert.deepEqual(data.blackMarket.modes.map((mode) => mode.id), ['current', 'special']);
  assert.equal(current.stages.length, 16);
  assert.equal(special.stages.length, 16);
  assert.ok(current.stages.every((stage) => stage.slots.length === 6));
  assert.ok(current.stages.every((stage) => stage.slots.every((slot) => slot.items.length > 0)));
  assert.equal(special.activity.name, '黑市特惠');
  assert.ok(special.stages[0].slots[2].items.length > current.stages[0].slots[2].items.length);
  assert.ok(special.stages.flatMap((stage) => stage.slots)
    .flatMap((slot) => slot.items)
    .some((item) => item.discountPercent != null && item.discountPercent < 100));
});

test('黑市宝石商品随主线阶段切换', () => {
  const data = extract.buildResourceAcquisitionData(loadTables());
  const stages = data.blackMarket.modes[0].stages;
  const firstGems = stages[0].slots.flatMap((slot) => slot.items)
    .filter((item) => item.name.includes('宝石'))
    .map((item) => [item.name, item.cost?.itemId, item.cost?.count, item.weight]);
  const nightmareGems = stages.find((entry) => entry.stage.id === 990401).slots
    .flatMap((slot) => slot.items)
    .filter((item) => item.name.includes('宝石'))
    .map((item) => [item.name, item.cost?.itemId, item.cost?.count, item.weight]);

  assert.ok(firstGems.length > 0);
  assert.ok(nightmareGems.length > 0);
  assert.notDeepEqual(firstGems, nightmareGems);
});

test('神秘商店按要求聚合关卡材料和关卡装备', () => {
  const data = extract.buildResourceAcquisitionData(loadTables());
  const allItems = data.secretShop.slots.flatMap((slot) => slot.items);

  assert.ok(allItems.some((item) => item.name === '关卡材料道具'));
  assert.ok(allItems.some((item) => item.name === '关卡装备'));
  assert.equal(allItems.some((item) => item.name === '火纹皮'), false);
  assert.equal(allItems.some((item) => item.name === '沧海玄甲'), false);
  assert.ok(allItems.some((item) => item.name === '还魂丹'));
});
