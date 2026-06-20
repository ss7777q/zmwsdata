export function sumMatrixPartsCost(parts: any[]) {
    const upMap = new Map();
    const clearMap = new Map();
    const luckMap = new Map();

    const details: any[] = [];

    parts.forEach(part => {
        const limit = part.levelLimit || 0;
        const partUpCosts: any[] = [];
        const partLuckCosts: any[] = [];

        if (Array.isArray(part.upLevelCost)) {
            part.upLevelCost.forEach((c: any) => {
  if (c.itemId === 1 || !c.itemId) return;
  const exist = upMap.get(c.itemId) || { name: c.name, count: 0 };
  exist.count += c.count * limit; // 获取拉满的材料总量
  upMap.set(c.itemId, exist);

  partUpCosts.push({ ...c, count: c.count * limit });
            });
        }
        if (Array.isArray(part.clearCost)) {
            part.clearCost.forEach((c: any) => {
  if (c.itemId === 1 || !c.itemId) return;
  const exist = clearMap.get(c.itemId) || { name: c.name, count: 0 };
  exist.count += c.count;
  clearMap.set(c.itemId, exist);
            });
        }
        if (part.luckClear) {
            Object.entries(part.luckClear).forEach(([key, c]: [string, any]) => {
  if (c.itemId === 1 || !c.itemId) return;
  const luckType = key === '0' ? '全部' : '单条';
  const mapKey = `${c.itemId}_${luckType}`;

  const exist = luckMap.get(mapKey) || { itemId: c.itemId, name: `${c.name}(${luckType})`, count: 0 };
  exist.count += c.count;
  luckMap.set(mapKey, exist);

  partLuckCosts.push({ ...c, luckLabel: luckType });
            });
        }

        details.push({
            name: part.name, // 例如 "天"
            upCosts: partUpCosts,
            luckCosts: partLuckCosts
        });
    });

    return {
        upCosts: Array.from(upMap.entries()).map(([itemId, v]) => ({ itemId, ...v })),
        clearCosts: Array.from(clearMap.entries()).map(([itemId, v]) => ({ itemId, ...v })),
        luckCosts: Array.from(luckMap.entries()).map(([itemId, v]) => ({ itemId, ...v })),
        details
    };
}
