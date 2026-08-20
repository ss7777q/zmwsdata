import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';

const upgradeCostSource = fs.readFileSync(
  new URL('../frontend/src/lib/upgrade-cost.ts', import.meta.url),
  'utf8',
);
const upgradeCostModule = ts.transpileModule(upgradeCostSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
});
const {
  buildUpgradeSteps,
  sumUpgradeStepCosts,
  upgradeRange,
} = await import(`data:text/javascript;base64,${Buffer.from(upgradeCostModule.outputText).toString('base64')}`);

function readData(fileName) {
  return JSON.parse(fs.readFileSync(new URL(`../frontend/public/data/${fileName}`, import.meta.url), 'utf8')).data;
}

function maxLevel(rows, getLevel) {
  return Math.max(...rows.map((row) => Number(getLevel(row)) || 0));
}

function assertRange(steps, expected, message) {
  assert.deepStrictEqual(upgradeRange(steps), expected, message);
  assert.equal(
    steps.some((step) => step.fromLevel === 0 && step.toLevel === 1),
    expected.fromLevel === 0,
    message,
  );
}

test('升级计算器默认排除 0→1，但可为真实零级系统显式开启', () => {
  const rows = [
    { level: 0, costs: [{ itemId: 1, name: '点券', count: 50 }, { itemId: 100, name: '核心', count: 1 }] },
    { level: 1, costs: [{ itemId: 100, name: '核心', count: 2 }] },
    { level: 2, costs: [{ itemId: 100, name: '核心', count: 3 }] },
    { level: 3, costs: [{ itemId: 100, name: '核心', count: 99 }] },
  ];
  const options = {
    rows,
    getStoredLevel: (row) => row.level,
    getCosts: (row) => row.costs,
    maxLevel: 3,
  };

  const oneBasedSteps = buildUpgradeSteps(options);
  assert.deepStrictEqual(oneBasedSteps.map(({ fromLevel, toLevel }) => [fromLevel, toLevel]), [[1, 2], [2, 3]]);

  const zeroBasedSteps = buildUpgradeSteps({ ...options, minimumLevel: 0 });
  assert.deepStrictEqual(
    zeroBasedSteps.map(({ fromLevel, toLevel }) => [fromLevel, toLevel]),
    [[0, 1], [1, 2], [2, 3]],
  );
  assert.deepStrictEqual(sumUpgradeStepCosts(zeroBasedSteps), [{ itemId: 100, name: '核心', count: 6 }]);
});

for (const [label, fileName] of [
  ['法宝', 'role_magic_lev.json'],
  ['神器', 'role_godweapon_lev.json'],
]) {
  test(`${label}保留真实的 0→1 消耗`, () => {
    const group = readData(fileName)[0];
    const steps = buildUpgradeSteps({
      rows: group.levels,
      getStoredLevel: (row) => row.lv,
      getCosts: (row) => row.lvDeduct,
      minimumLevel: 0,
      maxLevel: maxLevel(group.levels, (row) => row.lv) + 1,
    });

    assertRange(steps, { fromLevel: 0, toLevel: 10 }, `${label}应显示 0→1 到 9→10`);
    assert.equal(steps.length, 10);
    assert.deepStrictEqual(steps[0].costs, group.levels[0].lvDeduct);
  });
}

test('装备升重保留配置中真实的 0重→1重消耗', () => {
  const item = readData('role_equip_make.json').find((entry) => entry.recastUpgrade?.length > 0);
  assert.ok(item, '应至少存在一件带升重配置的装备');

  const stages = item.recastUpgrade;
  const steps = buildUpgradeSteps({
    rows: stages,
    getStoredLevel: (stage) => stage.fromWeight,
    getCosts: (stage) => stage.cost,
    minimumLevel: 0,
    maxLevel: maxLevel(stages, (stage) => stage.toWeight),
  });

  assertRange(steps, { fromLevel: 0, toLevel: 9 }, '装备升重应显示 0重→1重 到 8重→9重');
  assert.equal(steps[0].source.stageLabel, '0重 → 1重');
  assert.deepStrictEqual(steps[0].costs, stages[0].cost);
});

test('宠物技能跳过 Lv.1 学习成本，升级从 Lv.1→Lv.2 开始', () => {
  const levels = readData('pet_skill.json').levels;
  const max = maxLevel(levels, (row) => row.level);
  const steps = buildUpgradeSteps({
    rows: levels,
    getStoredLevel: (row) => row.level,
    getCosts: (row) => row.upgradeCost,
    storedLevelOffset: -1,
    maxLevel: max,
  });

  assertRange(steps, { fromLevel: 1, toLevel: max }, '宠物技能不应显示 0→1');
  assert.equal(steps[0].source.level, 2, 'Lv.1→Lv.2 应读取目标等级 Lv.2 的成本行');
});

test('坐骑技能按当前等级成本升级，不显示 0→1', () => {
  const group = readData('ride_skill.json').byItem[0];
  const max = maxLevel(group.levels, (row) => row.level);
  const steps = buildUpgradeSteps({
    rows: group.levels,
    getStoredLevel: (row) => row.level,
    getCosts: (row) => [{ itemId: group.itemId, name: group.name, count: row.count }],
    maxLevel: max,
  });

  assertRange(steps, { fromLevel: 1, toLevel: max }, '坐骑技能不应显示 0→1');
  assert.equal(steps[0].source.level, 1, 'Lv.1→Lv.2 应读取当前等级 Lv.1 的成本行');
});

test('翅膀解锁即为 Lv.1，升级不显示 0→1', () => {
  const wing = readData('role_wing_upgrade.json')[0];
  const max = maxLevel(wing.levels, (row) => row.wingLevel);
  const steps = buildUpgradeSteps({
    rows: wing.levels,
    getStoredLevel: (row) => row.wingLevel,
    getCosts: (row) => row.consume ? [row.consume] : [],
    maxLevel: max,
  });

  assertRange(steps, { fromLevel: 1, toLevel: max }, '翅膀不应显示 0→1');
});

test('修心默认六项均为 Lv.1，忽略 level=0 成本行', () => {
  const levels = readData('role_heart.json');
  const max = maxLevel(levels, (row) => row.level);
  const steps = buildUpgradeSteps({
    rows: levels,
    getStoredLevel: (row) => row.level,
    getCosts: (row) => row.soulCost,
    maxLevel: max,
  });

  assertRange(steps, { fromLevel: 1, toLevel: max }, '修心不应显示 0→1');
});

test('法宝器魂从 Lv.1→Lv.2 开始', () => {
  const group = readData('role_magic_soul.json')[0];
  const steps = buildUpgradeSteps({
    rows: group.levels,
    getStoredLevel: (row) => row.level,
    getCosts: (row) => row.upCost,
    maxLevel: maxLevel(group.levels, (row) => row.level),
  });

  assertRange(steps, { fromLevel: 1, toLevel: 10 }, '器魂不应显示 0→1');
  assert.equal(steps.length, 9);
});
