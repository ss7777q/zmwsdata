const fs = require('fs');
const path = require('path');

const DANYUAN_EFFECT_OVERRIDES = path.join(__dirname, 'overrides.json');
const DANYUAN_EFFECT_OVERRIDES_SOURCE = 'scripts/extract/danyuan_effect/overrides.json';

function loadDanyuanEffectOverrides() {
  if (!fs.existsSync(DANYUAN_EFFECT_OVERRIDES)) {
    throw new Error(`丹元效果覆盖文件缺失: ${DANYUAN_EFFECT_OVERRIDES}`);
  }

  try {
    const data = JSON.parse(fs.readFileSync(DANYUAN_EFFECT_OVERRIDES, 'utf8'));
    if (!data || typeof data !== 'object' || !data.effects || typeof data.effects !== 'object') {
      throw new Error('缺少 effects 对象');
    }
    return data;
  } catch (e) {
    throw new Error(`丹元效果覆盖文件解析失败: ${e.message}`);
  }
}

function requireDanyuanOverride(overrides, familyId, name) {
  const entry = overrides.effects[String(familyId)];
  if (!entry) {
    throw new Error(`丹元效果覆盖缺少 ${familyId}(${name})`);
  }
  if (typeof entry.summary !== 'string' || entry.summary.trim() === '') {
    throw new Error(`丹元效果覆盖 ${familyId}(${name}) 缺少 summary`);
  }
  if (!Array.isArray(entry.detail) || entry.detail.length === 0) {
    throw new Error(`丹元效果覆盖 ${familyId}(${name}) 缺少 detail`);
  }
  if (!Array.isArray(entry.clarification) || entry.clarification.length === 0) {
    throw new Error(`丹元效果覆盖 ${familyId}(${name}) 缺少 clarification`);
  }
  for (const key of ['levelGrowth', 'qualityGrowth', 'qualityDifference']) {
    if (typeof entry[key] !== 'string' || entry[key].trim() === '') {
      throw new Error(`丹元效果覆盖 ${familyId}(${name}) 缺少 ${key}`);
    }
  }
  if (entry.qualityTable != null) {
    if (typeof entry.qualityTable !== 'object' || Array.isArray(entry.qualityTable)) {
      throw new Error(`丹元效果覆盖 ${familyId}(${name}) qualityTable 必须是对象`);
    }
    if (!Array.isArray(entry.qualityTable.columns) || entry.qualityTable.columns.length === 0) {
      throw new Error(`丹元效果覆盖 ${familyId}(${name}) qualityTable 缺少 columns`);
    }
    if (!Array.isArray(entry.qualityTable.rows) || entry.qualityTable.rows.length === 0) {
      throw new Error(`丹元效果覆盖 ${familyId}(${name}) qualityTable 缺少 rows`);
    }
    for (const column of entry.qualityTable.columns) {
      if (!column || typeof column.key !== 'string' || typeof column.label !== 'string') {
        throw new Error(`丹元效果覆盖 ${familyId}(${name}) qualityTable column 必须包含 key/label`);
      }
    }
    for (const row of entry.qualityTable.rows) {
      if (!row || typeof row.quality !== 'string') {
        throw new Error(`丹元效果覆盖 ${familyId}(${name}) qualityTable row 必须包含 quality`);
      }
    }
  }
  return entry;
}

function addUnusedOverrideWarnings(overrides, usedOverrideKeys, warnings) {
  for (const key of Object.keys(overrides.effects)) {
    if (!usedOverrideKeys.has(key)) {
      warnings.push({ code: 'DANYUAN_EFFECT_OVERRIDE_UNUSED', detail: `覆盖项 ${key} 没有匹配到当前丹元` });
    }
  }
}

module.exports = {
  DANYUAN_EFFECT_OVERRIDES_SOURCE,
  addUnusedOverrideWarnings,
  loadDanyuanEffectOverrides,
  requireDanyuanOverride
};
