const { extractStageRewards } = require('../extract-stage-rewards');

function extract() {
  console.log('\n🎁 关卡奖励');
  extractStageRewards();
}

if (require.main === module) {
  extract();
}

module.exports = extract;
