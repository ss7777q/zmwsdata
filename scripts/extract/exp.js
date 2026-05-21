const u = require('../lib/utils');

function extractExpStandards() {
  const rows = u.loadTable('exp')
    .filter((entry) => Number.isFinite(Number(entry.level)))
    .map((entry) => ({
      id: Number(entry.id),
      level: Number(entry.level),
      exp: Number(entry.exp || 0),
      phyDefStandard: Number(entry.phyDefStandard || 0),
      commonStandard: Number(entry.hitStandard || 0),
    }))
    .sort((left, right) => left.level - right.level);

  u.saveOutput('exp', rows, {
    system: '抗值标准',
    source: 'exp.*.json',
    note: '保留防御抗值和通用抗值，通用抗值合并自 hit/dodge/critical/toughness/lucky/guardian standard，并补充 exp 经验值字段',
  });
}

function extract() {
  console.log('\n🛡️ 抗值标准');
  extractExpStandards();
}

if (require.main === module) {
  extract();
}

module.exports = extract;
