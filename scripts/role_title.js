/**
 * 角色 → 称号系统
 * 提取叶子: 称号升阶消耗
 */
const u = require('../lib/utils');

function extract() {
  console.log('\n📦 角色 → 称号系统');

  const raw = u.loadTable('title');
  // 只取有 rankCost 的称号(可升阶)
  const withCost = raw.filter(r => r.rankCost);

  // 构建升阶链: group 相同的称号形成链
  const chains = {};
  for (const r of raw) {
    const g = r.group;
    if (!chains[g]) chains[g] = { group: g, name: r.name, ranks: [] };
    chains[g].ranks.push({
      id: r.id, name: r.name, level: r.level,
      rankCost: u.parseCost(r.rankCost),
      nextId: r.nextId,
      type: r.type,
      value: r.value,
      buteId: r.buteId
    });
  }

  // 过滤: 只保留含有消耗的链
  const result = Object.values(chains).filter(c =>
    c.ranks.some(r => r.rankCost)
  );

  // 按链内 level 排序
  for (const chain of result) {
    chain.ranks.sort((a, b) => (a.level || 0) - (b.level || 0));
    // 用第一个名字作为链名
    chain.name = chain.ranks[0].name.replace(/[·].*$/, '');
  }

  u.saveOutput('role_title', result, {
    system: '角色 → 称号系统 → 升级',
    source: 'title.*.json',
    costType: '专属道具 rankCost:[[itemId, count]]',
    dedup: '按 group 分链, 仅含有消耗的称号系列',
    note: '大多数称号无直接消耗(条件获取型), 仅少数可升阶称号有rankCost'
  });
}

if (require.main === module) extract();
module.exports = extract;
