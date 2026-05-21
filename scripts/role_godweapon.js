/**
 * 角色 → 神器系统
 * 提取叶子: 解锁, 升级/进阶
 */
const u = require('../lib/utils');

// ━━━ 神器解锁 ━━━ godWeapon.*.json ━━━━━━━━━━━━━━━━
function extractGodWeaponUnlock() {
  const raw = u.loadTable('godWeapon');
  const result = raw.filter(r => r.activationValue).map(r => ({
    id: r.id, name: r.name,
    activationValue: u.parseCost(r.activationValue),
    rankCost: u.parseCost(r.rankCost),
    rank: r.rank
  }));
  u.saveOutput('role_godweapon_unlock', result, {
    system: '角色 → 神器系统 → 解锁',
    source: 'godWeapon.*.json',
    costType: '核心道具 activationValue:[[itemId,count],...] + 进阶 rankCost',
    dedup: '每种神器一条记录'
  });
}

// ━━━ 神器升级/进阶 ━━━ godWeaponLev.*.json ━━━━━━━━
function extractGodWeaponLev() {
  const raw = u.loadTable('godWeaponLev');
  // 从 godWeapon 表建立 typeId -> {name, rank} 的映射
  const gwMap = {};
  for (const gw of u.loadTable('godWeapon')) gwMap[gw.id] = { name: gw.name, rank: gw.rank };

  // 按神器种类分组 (id前缀区分)
  const groups = {};
  for (const r of raw) {
    // id 格式: 前几位=typeId (神器id), 后2位=等级
    const typeId = Math.floor(r.id / 100);
    if (!groups[typeId]) {
      const meta = gwMap[typeId] || { name: `未知(${typeId})`, rank: null };
      groups[typeId] = { typeId, name: meta.name, rank: meta.rank, levels: [] };
    }
    groups[typeId].levels.push({
      lv: r.lv,
      lvDeduct: u.parseCost(r.lvDeduct),
      consumeDeduct: u.parseCost(r.consumeDeduct)
    });
  }
  u.saveOutput('role_godweapon_lev', Object.values(groups), {
    system: '角色 → 神器系统 → 升级/进阶',
    source: 'godWeaponLev.*.json',
    costType: '专属核心(lvDeduct:[[601001,count]]) + 点券(consumeDeduct:[[1,count]])',
    dedup: '按神器种类分组, 每种10级'
  });
}

function extract() {
  console.log('\n📦 角色 → 神器系统');
  extractGodWeaponUnlock();
  extractGodWeaponLev();
}

if (require.main === module) extract();
module.exports = extract;
