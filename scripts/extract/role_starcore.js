/**
 * 角色 → 星核系统
 * 提取叶子: 主星激活, 伴星升级
 */
const u = require('../lib/utils');

function extract() {
  console.log('\n📦 角色 → 星核系统');

  const raw = u.loadTable('starCore');
  const stars = [];

  for (const r of raw) {
    const star = {
      id: r.id, name: r.name, icon: r.icon,
      // ━━━ 主星激活 ━━━
      mainStar: {},
      // ━━━ 伴星升级 ━━━
      satellite: {
        maxLevel: r.satelliteLv,
        attribute: r.satelliteAttribute,
        costs: []
      }
    };

    // 解析 starCore 对象 (按品质分段)
    if (r.starCore) {
      for (const [quality, arr] of Object.entries(r.starCore)) {
        if (!Array.isArray(arr) || arr.length < 4) continue;
        const entry = {
          quality: Number(quality),
          activationCost: u.parseCost(arr[0]),  // [[itemId, count]]
          attributes: arr[1],                    // 属性列表
          ratio: arr[2],                         // 属性比率
          score: arr[3]                          // 战力分
        };
        // 部分品质有回收产物 (第5个元素)
        if (arr.length >= 5) {
          entry.recycleCost = u.parseCost(arr[4]);
        }
        star.mainStar[quality] = entry;
      }
    }

    // 解析 satelliteCost [[等级, [itemId, count]], ...]
    if (r.satelliteCost && Array.isArray(r.satelliteCost)) {
      star.satellite.costs = r.satelliteCost.map(sc => ({
        levelRequirement: sc[0],
        cost: Array.isArray(sc[1])
          ? { itemId: sc[1][0], name: u.itemName(sc[1][0]), count: sc[1][1] }
          : sc[1]
      }));
    }

    stars.push(star);
  }

  u.saveOutput('role_starcore', stars, {
    system: '角色 → 星核系统 → 主星/伴星',
    source: 'starCore.*.json',
    costType: [
      '主星: starCore.{品质}:[[itemId,count], 属性, 比率, 战力, ?回收]',
      '伴星: satelliteCost:[[等级门槛, [itemId=天魁星尘, count]]]'
    ].join('; '),
    keyItems: '40001=天魁星尘, 40003~40006=各品质天魁星核',
    dedup: '每颗星一条记录, 内含品质3~6的激活消耗'
  });
}

if (require.main === module) extract();
module.exports = extract;
