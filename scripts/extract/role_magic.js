/**
 * 角色 → 法宝系统
 * 提取叶子: 升级, 器魂, 强运洗练
 */
const u = require('../lib/utils');

// ━━━ 法宝升级 ━━━ magicWeaponLev.*.json ━━━━━━━━━━━━━
function extractLev() {
  const raw = u.loadTable('magicWeaponLev');
  const magic = u.loadTable('magicWeapon');
  const magicNameById = new Map(magic.map(m => [m.id, m.name]));
  const zhPhase = { 1: '一', 2: '二' };

  function resolveWeaponName(weaponGroup) {
    const direct = magicNameById.get(weaponGroup);
    if (direct) return direct;

    const phase = weaponGroup % 10;
    const baseId = weaponGroup - (phase - 1);
    const baseName = magicNameById.get(baseId);
    if (!baseName) return `未知法宝(${weaponGroup})`;

    if (phase <= 1) return baseName;
    const pure = baseName.replace(/^[一二三四五六七八九十]+阶/, '');
    const phaseName = zhPhase[phase] || String(phase);
    return `${phaseName}阶${pure}`;
  }

  // id编码: 前4位=法宝种类, 后2位=等级
  const weapons = {};
  for (const r of raw) {
    const wpnKey = Math.floor(r.id / 100);
    if (!weapons[wpnKey]) {
      weapons[wpnKey] = {
        weaponGroup: wpnKey,
        weaponName: resolveWeaponName(wpnKey),
        levels: []
      };
    }
    weapons[wpnKey].levels.push({
      lv: r.lv,
      lvDeduct: u.parseCost(r.lvDeduct),
      consumeDeduct: u.parseCost(r.consumeDeduct)
    });
  }
  u.saveOutput('role_magic_lev', Object.values(weapons), {
    system: '角色 → 法宝系统 → 升级',
    source: 'magicWeaponLev.*.json',
    costType: '道具(lvDeduct) + 点券(consumeDeduct)',
    dedup: '46种法宝×10级=460条, 不同法宝用不同专属道具'
  });
}

// ━━━ 器魂 ━━━ magicWeaponSoulLv.*.json ━━━━━━━━━━━━━━
function extractSoul() {
  const raw = u.loadTable('magicWeaponSoulLv');
  const groups = {};
  for (const r of raw) {
    if (!groups[r.groupId]) {
      groups[r.groupId] = {
        groupId: r.groupId, desName: r.desName,
        name: r.name, levels: []
      };
    }
    groups[r.groupId].levels.push({
      level: r.level,
      upCost: u.parseCost(r.upCost)
    });
  }
  u.saveOutput('role_magic_soul', Object.values(groups), {
    system: '角色 → 法宝系统 → 器魂',
    source: 'magicWeaponSoulLv.*.json',
    costType: '灵镔铁(141000000)',
    dedup: '同系器魂各级消耗固定为1个灵镔铁'
  });
}

// ━━━ 强运洗练 ━━━ magicWeapon.*.json ━━
function extractLuck() {
  const raw = u.loadTable('magicWeapon');
  const soulRows = u.loadTable('magicWeaponSoulLv');
  const soulGroupIdByName = new Map();

  for (const row of soulRows) {
    if (!row.name) continue;
    if (!soulGroupIdByName.has(row.name)) {
      soulGroupIdByName.set(row.name, row.groupId);
    } else if (soulGroupIdByName.get(row.name) !== row.groupId) {
      throw new Error(`Duplicate magic soul groupId for ${row.name}`);
    }
  }

  const magic = raw.map(r => ({
    id: r.id,
    name: r.name,
    phases: r.phases, // 几阶法宝
    soulGroupId: soulGroupIdByName.get(r.name) || null,
    baptizeLuck: u.parseCost(r.baptizeLuck),           // 普通强运洗练消耗
    blessingCostLuck: u.parseCost(r.blessingCostLuck), // 祝福洗练消耗(必出紫以上等)
    baptizeGrowLuck: u.parseCost(r.baptizeGrowLuck)    // 强运培养消耗
  }));

  u.saveOutput('role_magic_luck', magic, {
    system: '角色 → 法宝系统 → 强运洗练',
    source: 'magicWeapon.*.json',
    costType: '强运币(luckCoin) 等',
    note: '提取各阶法宝的普通洗练、祝福洗练及洗练培养强运消耗'
  });
}

function extract() {
  console.log('\n📦 角色 → 法宝系统');
  extractLev();
  extractSoul();
  extractLuck();
}

if (require.main === module) extract();
module.exports = extract;
