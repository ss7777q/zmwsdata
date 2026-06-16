/**
 * 角色 -> 星石系统 -> 全部词条效果
 */
const extractRoleStarstoneEffect = require('./role_starstone_effect');

function extractRoleStarstoneEffectAll() {
  extractRoleStarstoneEffect({
    outputName: 'role_starstone_effect_all',
    includeOwnershipKinds: ['通用', '专属', '未知'],
    system: '角色 → 星石系统 → 全部词条效果',
    ownershipRule: '通用词条命中复用星石掉落组；专属词条只命中单个专属星池；无法唯一判断时保留未知和 warning。'
  });
}

if (require.main === module) {
  extractRoleStarstoneEffectAll();
}

module.exports = extractRoleStarstoneEffectAll;
