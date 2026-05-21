/**
 * 角色 → 阵法系统
 * 提取叶子: 法器(升级/洗练/合成), 镇魂(升级/洗练/合成), 技能升级
 */
const u = require('../lib/utils');

// ━━━ 法器/镇魂通用提取 ━━━ matrixCore.*.json ━━━━━━━
function extractMatrixCoreByType(groupTypeFilter, outputName, typeName) {
  const raw = u.loadTable('matrixCore');
  const typeRows = raw.filter(r => r.groupType === groupTypeFilter);
  const maxQualityByMatrix = new Map();
  for (const r of typeRows) {
    const old = maxQualityByMatrix.get(r.matrix);
    if (old == null || r.quality > old) maxQualityByMatrix.set(r.matrix, r.quality);
  }
  const filtered = typeRows.filter(r => r.quality === maxQualityByMatrix.get(r.matrix));
  // 按品质分组
  const byQuality = {};
  for (const r of filtered) {
    const q = r.quality;
    if (!byQuality[q]) byQuality[q] = { quality: q, records: [] };
    byQuality[q].records.push({
      id: r.id, name: r.name, group: r.group, matrix: r.matrix,
      // 升级消耗
      upLevelCost: u.parseCost(r.upLevelCost),
      // 洗练消耗
      clearCost: u.parseCost(r.clearCost),
      lockClear: u.parseCost(r.lockClear),
      luckClear: r.luckClear ? Object.fromEntries(
        Object.entries(r.luckClear).map(([lockNum, cost]) => [
          lockNum, { itemId: cost[0], name: u.itemName(cost[0]), count: cost[1] }
        ])
      ) : null,
      // 合成/分解
      sellCost: u.parseCost(r.sellCost),
      sellRatio: r.sellRatio,
      // 属性
      attribute: r.attribute,
      attributeBase: r.attributeBase,
      levelLimit: r.levelLimit
    });
  }
  u.saveOutput(outputName, Object.values(byQuality), {
    system: `角色 → 阵法系统 → ${typeName} → 升级/洗练/合成`,
    source: `matrixCore.*.json (groupType=${groupTypeFilter})`,
    costType: [
      `升级: upLevelCost(先天之气200000013)`,
      `洗练: clearCost(普通)/lockClear(锁定)/luckClear(强运·阵法27)`,
      `合成: sellCost`
    ].join('; '),
    dedup: `按品质(quality)分组; 每个阵法仅保留最高品质(原始${typeRows.length}条→保留${filtered.length}条)`
  });
}

// ━━━ 法器 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function extractMatrixFQ() {
  extractMatrixCoreByType(1, 'role_matrix_fq', '法器');
}

// ━━━ 镇魂 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function extractMatrixZH() {
  // 镇魂 groupType 不为1的其他类型
  const raw = u.loadTable('matrixCore');
  const groupTypes = [...new Set(raw.map(r => r.groupType))].filter(t => t !== 1);
  for (const gt of groupTypes) {
    extractMatrixCoreByType(gt, `role_matrix_zh_type${gt}`, `镇魂(type${gt})`);
  }
  // 如果只有 groupType=1 和另一个, 输出一个统一名
  if (groupTypes.length === 1) {
    // 重命名: 将 role_matrix_zh_typeX 改为 role_matrix_zh
    const fs = require('fs');
    const path = require('path');
    const src = path.join(u.OUTPUT_DIR, `role_matrix_zh_type${groupTypes[0]}.json`);
    const dst = path.join(u.OUTPUT_DIR, 'role_matrix_zh.json');
    if (fs.existsSync(src)) fs.renameSync(src, dst);
  }
}

// ━━━ 阵法技能 ━━━ matrixSkill.*.json ━━━━━━━━━━━━━━
function extractMatrixSkill() {
  const raw = u.loadTable('matrixSkill');
  const maxQualityBySkill = new Map();
  for (const r of raw) {
    const old = maxQualityBySkill.get(r.matrixSkill);
    if (old == null || r.quality > old) maxQualityBySkill.set(r.matrixSkill, r.quality);
  }
  const filtered = raw.filter(r => r.quality === maxQualityBySkill.get(r.matrixSkill));
  // 按 matrixSkill + quality 分组
  const groups = {};
  for (const r of filtered) {
    const key = `${r.matrixSkill}_q${r.quality}`;
    if (!groups[key]) {
      groups[key] = {
        matrixSkill: r.matrixSkill,
        quality: r.quality,
        desName: r.desName,
        icon: r.icon,
        levels: []
      };
    }
    groups[key].levels.push({
      id: r.id, level: r.level,
      nextCost: u.parseCost(r.nextCost),
      upLimit: r.upLimit,
      beSkill: r.beSkill
    });
  }
  u.saveOutput('role_matrix_skill', Object.values(groups), {
    system: '角色 → 阵法系统 → 技能 → 升级',
    source: 'matrixSkill.*.json',
    costType: '阵图碎片 nextCost:[[200000011, count]]',
    dedup: `按 matrixSkill×quality 分组; 每个技能仅保留最高品质(原始${raw.length}条→保留${filtered.length}条)`
  });
}

function extract() {
  console.log('\n📦 角色 → 阵法系统');
  extractMatrixFQ();
  extractMatrixZH();
  extractMatrixSkill();
}

if (require.main === module) extract();
module.exports = extract;
