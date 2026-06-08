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
  { key: 'exp',       file: 'exp.js',            label: '抗值标准' },
  { key: 'title',     file: 'role_title.js',     label: '角色 → 称号系统' },
  { key: 'starcore',  file: 'role_starcore.js',  label: '角色 → 星核系统' },
  { key: 'boss',      file: 'boss.js',           label: 'BOSS 属性' },
  { key: 'pet',       file: 'pet.js',            label: '宠物系统' },
  { key: 'ride',      file: 'ride.js',           label: '坐骑系统' },
  { key: 'ride_skill_baseline', file: 'ride_skill_baseline.js', label: '坐骑技能 Wiki → 基准值 X' },
  { key: 'beast',     file: 'beast_stats.js',    label: '万兽统计' },
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
