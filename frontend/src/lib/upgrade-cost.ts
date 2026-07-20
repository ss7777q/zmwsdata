export interface UpgradeCostItem {
  itemId: number;
  name: string;
  count: number;
}

export interface UpgradeStep<T> {
  source: T;
  fromLevel: number;
  toLevel: number;
  costs: UpgradeCostItem[];
}

interface BuildUpgradeStepsOptions<T> {
  rows: readonly T[];
  getStoredLevel: (row: T, index: number) => unknown;
  getCosts: (row: T) => unknown;
  storedLevelOffset?: number;
  minimumLevel?: number;
  maxLevel: number;
  excludedItemIds?: readonly number[];
}

function toInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

/**
 * 将配置里的“当前等级 + 升下一级消耗”转换成玩家看到的升级阶段。
 *
 * 默认从 Lv.1 开始，适合没有 0→1 阶段的系统。法宝、神器、装备升重等
 * 确实存在 0→1 消耗的系统应传 minimumLevel: 0。maxLevel 用于丢弃满级
 * 行上残留的不可用消耗。
 */
export function buildUpgradeSteps<T>({
  rows,
  getStoredLevel,
  getCosts,
  storedLevelOffset = 0,
  minimumLevel = 1,
  maxLevel,
  excludedItemIds = [1],
}: BuildUpgradeStepsOptions<T>): UpgradeStep<T>[] {
  const excluded = new Set(excludedItemIds);
  const normalizedMaxLevel = toInteger(maxLevel);
  if (normalizedMaxLevel == null || normalizedMaxLevel < 1) return [];

  return rows.flatMap((row, index) => {
    const storedLevel = toInteger(getStoredLevel(row, index));
    if (storedLevel == null) return [];

    const fromLevel = storedLevel + storedLevelOffset;
    const toLevel = fromLevel + 1;
    if (fromLevel < minimumLevel || toLevel > normalizedMaxLevel) return [];

    const rawCosts = getCosts(row);
    if (!Array.isArray(rawCosts)) return [];

    const costs = rawCosts.flatMap((rawCost): UpgradeCostItem[] => {
      if (!rawCost || typeof rawCost !== 'object') return [];
      const cost = rawCost as Partial<UpgradeCostItem>;
      const itemId = toInteger(cost.itemId);
      const count = Number(cost.count);
      if (itemId == null || excluded.has(itemId) || !Number.isFinite(count) || count <= 0) return [];
      return [{ itemId, name: typeof cost.name === 'string' ? cost.name : String(itemId), count }];
    });

    return costs.length > 0 ? [{ source: row, fromLevel, toLevel, costs }] : [];
  });
}

export function sumUpgradeStepCosts<T>(steps: readonly UpgradeStep<T>[]) {
  const totals = new Map<number, UpgradeCostItem>();

  for (const step of steps) {
    for (const cost of step.costs) {
      const existing = totals.get(cost.itemId);
      totals.set(cost.itemId, {
        itemId: cost.itemId,
        name: cost.name,
        count: (existing?.count || 0) + cost.count,
      });
    }
  }

  return [...totals.values()].sort((left, right) => left.itemId - right.itemId);
}

export function withCumulativeUpgradeCosts<T>(steps: readonly UpgradeStep<T>[]) {
  const totals = new Map<number, UpgradeCostItem>();

  return steps.map((step) => {
    for (const cost of step.costs) {
      const existing = totals.get(cost.itemId);
      totals.set(cost.itemId, {
        itemId: cost.itemId,
        name: cost.name,
        count: (existing?.count || 0) + cost.count,
      });
    }
    return {
      ...step,
      cumulativeCosts: [...totals.values()].sort((left, right) => left.itemId - right.itemId),
    };
  });
}

export function levelCountInRange(levelStart: unknown, levelEnd: unknown) {
  const start = toInteger(levelStart);
  const end = toInteger(levelEnd);
  if (start == null || end == null || end < start) return 0;
  return end - start + 1;
}

export function upgradeRange<T>(steps: readonly UpgradeStep<T>[]) {
  if (steps.length === 0) return null;
  return {
    fromLevel: steps[0].fromLevel,
    toLevel: steps[steps.length - 1].toLevel,
  };
}
