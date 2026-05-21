/**
 * 角色 → 时装系统
 * 提取叶子: 宝珠升级/进阶, 时装续费
 */
const u = require('../lib/utils');
const fs = require('fs');
const path = require('path');

function removeOutput(name) {
  const fp = path.join(u.OUTPUT_DIR, `${name}.json`);
  if (!fs.existsSync(fp)) return;
  fs.unlinkSync(fp);
  console.log(`  🗑️  ${name}.json 已移除`);
}

// ━━━ 宝珠升级/进阶 ━━━ equipFashionBall.*.json ━━━━━━
function extractFashionBall() {
  const raw = u.loadTable('equipFashionBall');
  // 按 rank 分组
  const byRank = {};
  for (const r of raw) {
    if (!byRank[r.rank]) byRank[r.rank] = { rank: r.rank, levels: [] };
    byRank[r.rank].levels.push({
      id: r.id, level: r.level,
      upResources: r.upResources
        ? { itemId: r.upResources[0], name: u.itemName(r.upResources[0]), count: r.upResources[1] }
        : null,
      upLevelLimits: r.upLevelLimits,
      attributeValue: r.attributeValue,
      resourceId: r.resourceId
    });
  }
  // 去重: 同 rank 内消耗递增,但可按 resourceId 前缀分辨角色
  u.saveOutput('role_fashion_ball', Object.values(byRank), {
    system: '角色 → 时装系统 → 宝珠 → 升级/进阶',
    source: 'equipFashionBall.*.json',
    costType: '经验道具 upResources:[itemId=6(时装经验), count]',
    dedup: '按 rank(阶) 分组, 每阶内循环提升不同属性'
  });
}

// ━━━ 时装续费 ━━━ equipFashion.*.json (renew字段) ━━━━
function extractFashionRenew() {
  const raw = u.loadTable('equipFashion');
  // 只取有 renew 的时装
  const withRenew = raw.filter(r => r.renew && r.type === 1);
  const plans = [];
  const planIdByKey = new Map();
  const byPart = {};

  for (const r of withRenew) {
    const part = r.part || 'unknown';
    if (!byPart[part]) byPart[part] = { part, items: [] };

    const renewParsed = {};
    for (const [days, cost] of Object.entries(r.renew)) {
      renewParsed[days === '-1' ? '永久' : days + '天'] = {
        itemId: cost[0], name: u.itemName(cost[0]), count: cost[1]
      };
    }

    const transCost = u.parseCost(r.transCost);
    const planKey = JSON.stringify({ renew: renewParsed, transCost });
    let planId = planIdByKey.get(planKey);
    if (!planId) {
      planId = plans.length + 1;
      planIdByKey.set(planKey, planId);
      plans.push({
        planId,
        renew: renewParsed,
        transCost,
        itemCount: 0
      });
    }

    const plan = plans[planId - 1];
    plan.itemCount += 1;

    byPart[part].items.push({
      id: r.id, name: r.name,
      planId
    });
  }

  u.saveOutput('role_fashion_renew', {
    plans,
    parts: Object.values(byPart)
  }, {
    system: '角色 → 时装系统 → 时装 → 各品质续费',
    source: 'equipFashion.*.json (renew??)',
    costType: '点券 renew:{"天数":[1, 点券数]} + 传承消耗transCost',
    dedup: '提取公共续费方案(plan)，时装条目仅保留 planId 引用'
  });
}

function extract() {
  console.log('\n📦 角色 → 时装系统');
  extractFashionBall();
  extractFashionRenew();
  removeOutput('role_fashion_wardrobe');
}

if (require.main === module) extract();
module.exports = extract;
