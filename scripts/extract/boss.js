const extractBossStats = require('../extract-boss-stats');

function extract() {
  console.log('\n👹 BOSS 属性');
  const groupedData = extractBossStats({
    types: [],
    out: null,
  });
  extractBossStats.writeBossOutput(groupedData, null);
}

if (require.main === module) {
  extract();
}

module.exports = extract;
