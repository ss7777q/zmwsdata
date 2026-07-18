#!/usr/bin/env node
/**
 * 主入口 — 一键提取所有子系统去重后的 JSON 数据
 *
 * 用法:
 *   node scripts/extract_all.js          # 提取全部
 *   node scripts/extract_all.js equip    # 仅提取装备系统
 *   node scripts/extract_all.js pet ride # 仅提取宠物 + 坐骑
 *
 * 输出目录: output/
 */
const fs = require('fs');
const path = require('path');

const extractDir = path.join(__dirname, 'extract');

// ━━━ 提取模块注册表 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const MODULES = [
  { key: 'equip',     file: 'role_equip.js',     label: '角色 → 装备系统' },
  { key: 'magic',     file: 'role_magic.js',     label: '角色 → 法宝系统' },
  { key: 'xiulian',   file: 'role_xiulian.js',   label: '角色 → 修炼系统' },
  { key: 'wing',      file: 'role_wing.js',      label: '角色 → 翅膀系统' },
  { key: 'fashion',   file: 'role_fashion.js',   label: '角色 → 时装系统' },
  { key: 'godweapon', file: 'role_godweapon.js', label: '角色 → 神器系统' },
  { key: 'matrix',    file: 'role_matrix.js',    label: '角色 → 阵法系统' },
  { key: 'callgod',   file: 'role_callgod.js',   label: '神魔属性' },
  { key: 'callgod_boss', file: 'call_god_boss_analysis.js', label: '神魔相关 → 魔王解析' },
  { key: 'rogue_item', file: 'rogue_item_analysis.js', label: '局内道具机制' },
  { key: 'exp',       file: 'exp.js',            label: '抗值标准' },
  { key: 'honor',     file: 'role_honor.js',     label: '角色 → 称号系统' },
  { key: 'title',     file: 'role_title.js',     label: '角色 → 称号系统' },
  { key: 'starcore',  file: 'role_starcore.js',  label: '角色 → 星核系统' },
  { key: 'starstone', file: 'role_starstone_effect.js', label: '角色 → 星石系统 → 通用词条效果' },
  { key: 'starstone_all', file: 'role_starstone_effect_all.js', label: '角色 → 星石系统 → 全部词条效果' },
  { key: 'extreme_stats', file: 'role_extreme_stats.js', label: '角色 → 极限属性 source map' },
  { key: 'boss',      file: 'boss.js',           label: 'BOSS 属性' },
  { key: 'stage_rewards', file: 'stage_rewards.js', label: '关卡奖励' },
  { key: 'pet',       file: 'pet.js',            label: '宠物系统' },
  { key: 'ride',      file: 'ride.js',           label: '坐骑系统' },
  { key: 'role_wiki_wukong',   file: 'role_wiki_wukong.js',   label: '角色技能 Wiki → 孙悟空' },
  { key: 'role_wiki_yangjian', file: 'role_wiki_yangjian.js', label: '角色技能 Wiki → 杨戬' },
  { key: 'role_wiki_shaseng',  file: 'role_wiki_shaseng.js',  label: '角色技能 Wiki → 沙悟净' },
  { key: 'role_wiki_tangseng', file: 'role_wiki_tangseng.js', label: '角色技能 Wiki → 唐三藏' },
  { key: 'role_wiki_xiaoyan',  file: 'role_wiki_xiaoyan.js',  label: '角色技能 Wiki → 萧嫣' },
  { key: 'role_wiki_bajie',    file: 'role_wiki_bajie.js',    label: '角色技能 Wiki → 猪八戒' },
  { key: 'role_wiki_aoxue',    file: 'role_wiki_aoxue.js',    label: '角色技能 Wiki → 敖雪' },
  { key: 'role_wiki_aolie',    file: 'role_wiki_aolie.js',    label: '角色技能 Wiki → 敖烈' },
  { key: 'role_wiki_xuannv',   file: 'role_wiki_xuannv.js',   label: '角色技能 Wiki → 玄女' },
  { key: 'role_wiki_skill_extra', file: 'role_wiki_skill_extra.js', label: '角色技能 Wiki → 绝技无双' },
  { key: 'ride_wiki_diting', file: 'ride_wiki_diting.js', label: '坐骑技能 Wiki → 谛听' },
  { key: 'ride_wiki_pixiu', file: 'ride_wiki_pixiu.js', label: '坐骑技能 Wiki → 天禄/辟邪' },
  { key: 'ride_wiki_qingshi', file: 'ride_wiki_qingshi.js', label: '坐骑技能 Wiki → 青狮/青鬃狮王' },
  { key: 'ride_wiki_nianshou', file: 'ride_wiki_nianshou.js', label: '坐骑技能 Wiki → 年兽/上古年兽/永冬年兽' },
  { key: 'ride_wiki_fenghuang', file: 'ride_wiki_fenghuang.js', label: '坐骑技能 Wiki → 赤凤/赤炎凤凰/青鸾/寒冰凤凰' },
  { key: 'ride_wiki_wangwang', file: 'ride_wiki_wangwang.js', label: '坐骑技能 Wiki → 汪汪/超级汪' },
  { key: 'ride_wiki_jinmaohou', file: 'ride_wiki_jinmaohou.js', label: '坐骑技能 Wiki → 金毛犼/冲天神犼' },
  { key: 'ride_wiki_mojingshou', file: 'ride_wiki_mojingshou.js', label: '坐骑技能 Wiki → 避火魔睛兽/至尊魔睛兽/避水金睛兽/至尊金睛兽' },
  { key: 'ride_wiki_common', file: 'ride_wiki_common.js', label: '坐骑技能 Wiki → 未专项解析坐骑' },
  { key: 'ride_skill_baseline', file: 'ride_skill_baseline.js', label: '坐骑技能 Wiki → 基准值 X' },
  { key: 'pet_wiki_hou', file: 'pet_wiki_hou.js', label: '宠物技能 Wiki → 炽焰/极光猴王' },
  { key: 'pet_wiki_wangshe', file: 'pet_wiki_wangshe.js', label: '宠物技能 Wiki → 圣木/圣砂王蛇' },
  { key: 'pet_wiki_niuxueren', file: 'pet_wiki_niuxueren.js', label: '宠物技能 Wiki → 圣力神牛/圣雪圆圆' },
  { key: 'pet_wiki_huadiehubing', file: 'pet_wiki_huadiehubing.js', label: '宠物技能 Wiki → 神霄花仙/玄蝶仙子/千年冰狐/圣冰天狐' },
  { key: 'pet_wiki_xuanwu', file: 'pet_wiki_xuanwu.js', label: '宠物技能 Wiki → 玄武大帝' },
  { key: 'pet_wiki_baihu', file: 'pet_wiki_baihu.js', label: '宠物技能 Wiki → 白虎战神' },
  { key: 'pet_wiki_zhuque', file: 'pet_wiki_zhuque.js', label: '宠物技能 Wiki → 朱雀炎皇' },
  { key: 'pet_wiki_qinglong', file: 'pet_wiki_qinglong.js', label: '宠物技能 Wiki → 青龙妖圣' },
  { key: 'pet_wiki_tianshe', file: 'pet_wiki_tianshe.js', label: '宠物技能 Wiki → 天蛇元君' },
  { key: 'pet_wiki_qilin', file: 'pet_wiki_qilin.js', label: '宠物技能 Wiki → 麒麟' },
  { key: 'pet_wiki_tuzi', file: 'pet_wiki_tuzi.js', label: '宠物技能 Wiki → 皓月兔皇/暗月兔皇' },
  { key: 'pet_wiki_laoshu', file: 'pet_wiki_laoshu.js', label: '宠物技能 Wiki → 暗夜鼠王/冥甲鼠王' },
  { key: 'pet_skill_baseline', file: 'pet_skill_baseline.js', label: '宠物技能 Wiki → 基准值 X' },
  { key: 'beast',     file: 'beast_stats.js',    label: '万兽统计' },
  { key: 'cold_knowledge', file: 'cold_knowledge.js', label: '冷知识机制文章' },
];

// ━━━ 命令行参数解析 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const args = process.argv.slice(2);
const selectedKeys = args.length > 0 ? args : null;

const toRun = selectedKeys
  ? MODULES.filter(m => selectedKeys.some(k =>
      m.key.includes(k) || m.label.includes(k)
    ))
  : MODULES;

if (toRun.length === 0) {
  console.error('❌ 未找到匹配的模块。可用模块:');
  MODULES.forEach(m => console.error(`  ${m.key.padEnd(12)} ${m.label}`));
  process.exit(1);
}

// ━━━ 执行提取 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const startTime = Date.now();
console.log('═══════════════════════════════════════════');
console.log('  🚀 造梦世界 · 资源消耗数据提取工具');
console.log('═══════════════════════════════════════════');
console.log(`  待提取: ${toRun.length} 个子系统`);
console.log(`  输出到: output/\n`);

let successCount = 0;
let errorCount = 0;
const errors = [];

for (const mod of toRun) {
  try {
    const fn = require(path.join(extractDir, mod.file));
    if (typeof fn === 'function') {
      fn();
      successCount++;
    } else {
      console.warn(`  ⚠️  ${mod.file} 未导出函数`);
    }
  } catch (e) {
    errorCount++;
    errors.push({ module: mod.key, error: e.message });
    console.error(`  ❌ ${mod.label}: ${e.message}`);
  }
}

// ━━━ 输出汇总 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log('\n═══════════════════════════════════════════');
console.log(`  ✨ 提取完成! 耗时 ${elapsed}s`);
console.log(`  ✅ 成功: ${successCount}  ❌ 失败: ${errorCount}`);

// 统计输出文件
const outputDir = path.join(__dirname, '..', 'output');
if (fs.existsSync(outputDir)) {
  const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.json'));
  console.log(`  📁 输出文件: ${files.length} 个 JSON`);
}
console.log('═══════════════════════════════════════════');

if (errors.length > 0) {
  console.log('\n⚠️  失败详情:');
  errors.forEach(e => console.log(`  · ${e.module}: ${e.error}`));
}
