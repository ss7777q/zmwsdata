/**
 * 角色 → 修炼系统 → 内丹 → 丹元效果
 */
const u = require('../lib/utils');
const { BATTLE_FRAMES_PER_SECOND, DANYUAN_QUALITY_NAMES } = require('./danyuan_effect/constants');
const { buildBuffSequenceById, loadBulletById } = require('./danyuan_effect/mechanics');
const {
  DANYUAN_EFFECT_OVERRIDES_SOURCE,
  addUnusedOverrideWarnings,
  loadDanyuanEffectOverrides
} = require('./danyuan_effect/overrides');
const { exportDanyuanFamilies } = require('./danyuan_effect/family-exporter');

function createDanyuanEffectContext() {
  const beskillById = new Map(u.loadTable('beskill').map((row) => [row.id, row]));
  const buffRows = u.loadTable('buff');
  const buffById = new Map(buffRows.map((row) => [row.id, row]));
  const buffSequenceById = buildBuffSequenceById(buffRows);
  const monsterById = new Map(u.loadTable('monster').map((row) => [row.id, row]));
  const skillById = new Map(u.loadTable('skill').map((row) => [row.id, row]));
  const skillLevelById = new Map(u.loadTable('skillLevel').map((row) => [row.id, row]));
  const bulletById = loadBulletById();
  return { beskillById, buffById, buffSequenceById, monsterById, skillById, skillLevelById, bulletById };
}

function extractDanyuanEffect(raw) {
  const overrides = loadDanyuanEffectOverrides();
  const ctx = createDanyuanEffectContext();
  const warnings = [];
  const { families, usedOverrideKeys } = exportDanyuanFamilies(raw, ctx, overrides, warnings);
  addUnusedOverrideWarnings(overrides, usedOverrideKeys, warnings);

  u.saveOutput('role_danyuan_effect', {
    framesPerSecond: BATTLE_FRAMES_PER_SECOND,
    qualities: Object.entries(DANYUAN_QUALITY_NAMES).map(([quality, name]) => ({ quality: Number(quality), name })),
    families,
    warnings
  }, {
    system: '角色 → 修炼系统 → 内丹 → 丹元效果',
    source: `danyuan.*.json + beskill.*.json + buff.*.json + ${DANYUAN_EFFECT_OVERRIDES_SOURCE}`,
    costType: '原丹元升级 role_danyuan 保持不变；本文件仅承载逐丹元效果说明与成长数值',
    note: 'effectValues 只输出同丹元同品质内随等级变化的成长项；qualityEffectValues 输出只随品质变化的明确数值；固定触发率/冷却/机制说明保留在 mechanics 中追溯，不补造缺失值'
  });
}

module.exports = extractDanyuanEffect;
