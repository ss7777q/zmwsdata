#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'output');
const { writeJsonIfChanged } = require('./lib/utils');
const MANIFEST_NAME = 'system_data_manifest';
const GENERATED_DIRS = ['pet', 'ride', 'role', 'resource', 'rogue-item', 'boss', 'stage'];

function readOutput(name) {
  const filePath = path.join(OUTPUT_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertManagedPath(target) {
  const root = path.resolve(OUTPUT_DIR) + path.sep;
  const resolved = path.resolve(target);
  if (!resolved.startsWith(root) || resolved === path.resolve(OUTPUT_DIR)) {
    throw new Error(`Refusing to modify unmanaged output path: ${resolved}`);
  }
  return resolved;
}

function cleanupGeneratedDirectories(expectedFiles) {
  const expected = new Set(expectedFiles);
  for (const name of GENERATED_DIRS) {
    const directory = assertManagedPath(path.join(OUTPUT_DIR, name));
    if (!fs.existsSync(directory)) continue;
    const walk = current => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
          if (fs.readdirSync(fullPath).length === 0) fs.rmdirSync(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          const relative = path.relative(OUTPUT_DIR, fullPath).split(path.sep).join('/');
          if (!expected.has(relative)) fs.rmSync(fullPath);
        }
      }
    };
    walk(directory);
  }
}

function safeSegment(value, fallback = '未命名') {
  const normalized = String(value || fallback)
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim();
  return normalized || fallback;
}

function portablePath(value) {
  return String(value).split(path.sep).join('/');
}

function uniqueSegment(value, used, fallback) {
  const base = safeSegment(value, fallback);
  let current = base;
  let suffix = 2;
  while (used.has(current)) {
    current = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(current);
  return current;
}

function rootFields(value) {
  if (Array.isArray(value)) return ['[]'];
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value);
}

function createWriter(generatedAt) {
  const files = [];
  return {
    files,
    write(name, data, meta = {}) {
      const normalizedName = portablePath(name).replace(/^\/+|\/+$/g, '');
      if (!normalizedName || normalizedName.includes('..')) throw new Error(`Invalid system data name: ${name}`);
      const filePath = assertManagedPath(path.join(OUTPUT_DIR, ...normalizedName.split('/')) + '.json');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const payload = {
        _meta: {
          name: normalizedName,
          extractedAt: generatedAt,
          generated: 'system-data',
          ...meta,
        },
        data,
      };
      writeJsonIfChanged(filePath, payload);
      const stat = fs.statSync(filePath);
      files.push({
        name: normalizedName,
        path: `${normalizedName}.json`,
        size: stat.size,
        system: String(meta.system || ''),
        entity: String(meta.entity || ''),
        rootFields: rootFields(data),
      });
      return normalizedName;
    },
  };
}

function withoutKeys(value, keys) {
  const omitted = new Set(keys);
  return Object.fromEntries(Object.entries(value || {}).filter(([key]) => !omitted.has(key)));
}

function compactSkillBaseline(skill) {
  return {
    file: skill.file,
    petId: skill.petId ?? null,
    rideId: skill.rideId ?? null,
    slot: skill.slot,
    skillId: skill.skillId,
    fixedMultiplierMode: skill.fixedMultiplierMode,
    fixedMultiplierStats: skill.fixedMultiplierStats,
    correctionRatioStats: skill.correctionRatioStats,
    medianFixedMultiplier: skill.medianFixedMultiplier,
    medianCorrectionRatio: skill.medianCorrectionRatio,
    levels: (skill.levels || []).map((level) => ({
      level: level.level,
      xRaw: level.xRaw,
      x: level.x,
      xNearestInteger: level.xNearestInteger,
      fixedMultiplier: level.fixedMultiplier,
      correctionRatio: level.correctionRatio,
    })),
  };
}

function buildPetWiki(writer, replacedSources) {
  const originalIndex = readOutput('pet_wiki_index')?.data;
  const baseline = readOutput('pet_skill_baseline')?.data;
  if (!originalIndex || !Array.isArray(originalIndex.groups)) return;

  const groups = [];
  for (const group of originalIndex.groups) {
    const sourceName = group.fileName;
    const source = readOutput(sourceName);
    const variants = source?.data?.variants;
    if (!Array.isArray(variants)) continue;
    replacedSources.add(sourceName);
    const entries = [];
    const used = new Set();
    for (const variant of variants) {
      const pet = variant?.pet;
      if (!pet?.name) continue;
      const fileName = writer.write(
        `pet/wiki/${uniqueSegment(pet.name, used, `宠物-${pet.id || entries.length + 1}`)}`,
        {
          petGroup: { key: source.data.petGroup?.key, name: pet.name },
          variants: [variant],
          skillBaselines: (baseline?.skills || [])
            .filter((skill) => Number(skill.petId) === Number(pet.id))
            .map(compactSkillBaseline),
        },
        { system: 'pet/wiki', entity: pet.name, source: `${sourceName}.json` },
      );
      const indexEntry = (group.entries || []).find((entry) => Number(entry.petId) === Number(pet.id));
      entries.push({ ...indexEntry, fileName, petId: pet.id, petName: pet.name });
    }
    if (entries.length > 0) groups.push({ ...group, fileName: entries[0].fileName, entries });
  }
  writer.write('pet/wiki/index', { groups, warnings: originalIndex.warnings || [] }, {
    system: 'pet/wiki',
    entity: '宠物技能 Wiki 索引',
    source: 'pet_wiki_index.json',
  });
  replacedSources.add('pet_wiki_index');
  replacedSources.add('pet_skill_baseline');
}

function buildRideWiki(writer, replacedSources) {
  const originalIndex = readOutput('ride_wiki_index')?.data;
  const baseline = readOutput('ride_skill_baseline')?.data;
  if (!originalIndex || !Array.isArray(originalIndex.groups)) return;

  const groups = [];
  for (const group of originalIndex.groups) {
    const sourceName = group.fileName;
    const source = readOutput(sourceName);
    const variants = source?.data?.variants;
    if (!Array.isArray(variants)) continue;
    replacedSources.add(sourceName);
    const entries = [];
    const used = new Set();
    for (const variant of variants) {
      const ride = variant?.ride;
      if (!ride?.name) continue;
      const fileName = writer.write(
        `ride/wiki/${uniqueSegment(ride.name, used, `坐骑-${ride.id || entries.length + 1}`)}`,
        {
          rideGroup: { key: source.data.rideGroup?.key, name: ride.name },
          variants: [variant],
          skillBaselines: (baseline?.skills || [])
            .filter((skill) => Number(skill.rideId) === Number(ride.id))
            .map(compactSkillBaseline),
        },
        { system: 'ride/wiki', entity: ride.name, source: `${sourceName}.json` },
      );
      const indexEntry = (group.entries || []).find((entry) => Number(entry.rideId) === Number(ride.id));
      entries.push({ ...indexEntry, fileName, rideId: ride.id, rideName: ride.name });
    }
    if (entries.length > 0) groups.push({ ...group, fileName: entries[0].fileName, entries });
  }
  writer.write('ride/wiki/index', { groups, warnings: originalIndex.warnings || [] }, {
    system: 'ride/wiki',
    entity: '坐骑技能 Wiki 索引',
    source: 'ride_wiki_index.json',
  });
  replacedSources.add('ride_wiki_index');
  replacedSources.add('ride_skill_baseline');
}

function buildRoleWiki(writer, replacedSources) {
  const sourceFiles = fs.readdirSync(OUTPUT_DIR)
    .filter((name) => /^role_wiki_(?!skill_extra).*\.json$/.test(name))
    .sort((left, right) => left.localeCompare(right));
  const roles = [];
  for (const file of sourceFiles) {
    const sourceName = file.slice(0, -5);
    const source = readOutput(sourceName);
    const data = source?.data;
    if (!data?.role?.name || !Array.isArray(data.slots)) continue;
    const roleSegment = safeSegment(data.role.name);
    const used = new Set();
    const skills = [];
    const allSlots = [
      ...(data.slots || []).map((slot) => ({ ...slot, category: 'active' })),
      ...(data.passiveSlots || []).map((slot) => ({ ...slot, category: 'passive' })),
    ];
    for (const slot of allSlots) {
      const name = slot?.base?.name || slot?.slotLabel || slot?.slot || '未命名技能';
      const fileName = writer.write(
        `role/wiki/${roleSegment}/${uniqueSegment(name, used, '未命名技能')}`,
        { role: data.role, slot },
        { system: 'role/wiki', entity: `${data.role.name} · ${name}`, source: file },
      );
      skills.push({
        name,
        fileName,
        slot: slot.slot,
        slotLabel: slot.slotLabel,
        category: slot.category,
        skillId: slot.base?.skillId ?? null,
      });
    }
    const indexFile = writer.write(`role/wiki/${roleSegment}/index`, { role: data.role, skills }, {
      system: 'role/wiki', entity: data.role.name, source: file,
    });
    roles.push({ role: data.role, fileName: indexFile, skillCount: skills.length });
    replacedSources.add(sourceName);
  }
  writer.write('role/wiki/index', { roles }, { system: 'role/wiki', entity: '角色技能 Wiki 索引' });
}

function buildStarstones(writer, replacedSources) {
  const source = readOutput('role_starstone_effect_all');
  const rows = source?.data;
  if (!Array.isArray(rows)) return;
  const used = new Set();
  const entries = [];
  for (const row of rows) {
    if (!row?.name) continue;
    const fileName = writer.write(`role/starstone/${uniqueSegment(row.name, used, '未命名星石')}`, row, {
      system: 'role/starstone', entity: row.name, source: 'role_starstone_effect_all.json',
    });
    entries.push({
      id: row.id,
      group: row.group,
      name: row.name,
      type: row.type,
      typeName: row.typeName,
      ownership: row.ownership,
      summary: row.summary,
      officialDescription: row.officialDescription,
      mechanismExplanation: row.mechanismExplanation,
      baseEffectName: row.baseEffectName,
      extremeEffectName: row.extremeEffectName,
      fileName,
    });
  }
  writer.write('role/starstone/index', { entries }, {
    system: 'role/starstone', entity: '星石词条索引', source: 'role_starstone_effect_all.json',
  });
  replacedSources.add('role_starstone_effect_all');
  replacedSources.add('role_starstone_effect');
  replacedSources.add('role_starstone');
}

function buildRogueItems(writer, replacedSources) {
  const source = readOutput('rogue_item_analysis');
  const data = source?.data;
  if (!data || !Array.isArray(data.items)) return;
  const used = new Set();
  const items = [];
  for (const item of data.items) {
    const displayName = item.displayName || item.name;
    if (!displayName) continue;
    const fileName = writer.write(`rogue-item/${uniqueSegment(displayName, used, '未命名道具')}`, item, {
      system: 'rogue-item', entity: displayName, source: 'rogue_item_analysis.json',
    });
    items.push({
      id: item.id,
      groupId: item.groupId,
      name: item.name,
      displayName: item.displayName,
      type: item.type,
      typeLabel: item.typeLabel,
      priority: item.priority,
      hasManualExplanation: item.hasManualExplanation,
      hasDerivedExplanation: item.hasDerivedExplanation,
      hasExplanation: item.hasExplanation,
      explanationLevel: item.explanationLevel,
      summary: item.summary,
      stageCount: Array.isArray(item.stages) ? item.stages.length : 0,
      searchText: [item.displayName, item.name, item.typeLabel, item.summary, String(item.searchText || '').slice(0, 320)]
        .filter(Boolean)
        .join(' '),
      fileName,
    });
  }
  writer.write('rogue-item/index', { summary: data.summary, typeGroups: data.typeGroups, items }, {
    system: 'rogue-item', entity: '局内道具索引', source: 'rogue_item_analysis.json',
  });
  replacedSources.add('rogue_item_analysis');
}

function buildResourceAcquisition(writer, replacedSources) {
  const source = readOutput('resource_acquisition');
  const data = source?.data;
  if (!data) return;
  if (data.surpriseBoxes) writer.write('resource/acquisition/boxes', { surpriseBoxes: data.surpriseBoxes }, {
    system: 'resource/acquisition', entity: '惊喜宝箱', source: 'resource_acquisition.json',
  });
  if (data.secretShop) writer.write('resource/acquisition/secret-shop', { secretShop: data.secretShop }, {
    system: 'resource/acquisition', entity: '神秘商店', source: 'resource_acquisition.json',
  });

  const market = data.blackMarket;
  if (market && Array.isArray(market.modes)) {
    const modes = [];
    for (const mode of market.modes) {
      const used = new Set();
      const stages = [];
      for (const stage of mode.stages || []) {
        const stageName = stage?.stage?.name || `阶段-${stages.length + 1}`;
        const fileName = writer.write(
          `resource/acquisition/black-market/${safeSegment(mode.name || mode.id)}/${uniqueSegment(stageName, used, '未命名阶段')}`,
          stage,
          { system: 'resource/acquisition/black-market', entity: `${mode.name} · ${stageName}`, source: 'resource_acquisition.json' },
        );
        stages.push({ stage: stage.stage, nextStage: stage.nextStage, fileName });
      }
      modes.push({ ...withoutKeys(mode, ['stages']), stages });
    }
    writer.write('resource/acquisition/black-market/index', {
      blackMarket: { ...withoutKeys(market, ['modes']), modes },
    }, { system: 'resource/acquisition/black-market', entity: '黑市商店索引', source: 'resource_acquisition.json' });
  }
  writer.write('resource/acquisition/index', {
    sections: [
      { name: '惊喜宝箱', fileName: 'resource/acquisition/boxes' },
      { name: '神秘商店', fileName: 'resource/acquisition/secret-shop' },
      { name: '黑市商店', fileName: 'resource/acquisition/black-market/index' },
    ],
  }, { system: 'resource/acquisition', entity: '资源获取索引', source: 'resource_acquisition.json' });
  replacedSources.add('resource_acquisition');
}

function buildDanyuan(writer, replacedSources) {
  const source = readOutput('role_danyuan_effect_index');
  const families = source?.data?.families;
  if (!Array.isArray(families)) return;
  const indexEntries = [];
  for (const indexEntry of families) {
    const familySource = readOutput(indexEntry.fileName);
    const family = familySource?.data;
    if (!family?.name || !Array.isArray(family.levels)) continue;
    const familyPath = `role/danyuan/${safeSegment(family.name)}`;
    const qualities = [];
    for (const quality of family.qualities || []) {
      const key = String(quality.quality);
      const levels = family.levels
        .map((level) => ({ level: level.level, ...(level.qualities?.[key] || {}) }))
        .filter((level) => Object.keys(level).length > 1);
      const fileName = writer.write(`${familyPath}/${safeSegment(quality.name || `品质-${key}`)}`, {
        family: withoutKeys(family, ['levels']),
        quality,
        levels,
      }, { system: 'role/danyuan', entity: `${family.name} · ${quality.name}`, source: `${indexEntry.fileName}.json` });
      qualities.push({ ...quality, fileName, levelCount: levels.length });
    }
    const fileName = writer.write(`${familyPath}/index`, {
      family: withoutKeys(family, ['levels']),
      qualities,
    }, { system: 'role/danyuan', entity: family.name, source: `${indexEntry.fileName}.json` });
    indexEntries.push({ ...indexEntry, fileName, qualities });
    replacedSources.add(indexEntry.fileName);
  }
  writer.write('role/danyuan/index', { families: indexEntries, warnings: source.data.warnings || [] }, {
    system: 'role/danyuan', entity: '丹元索引', source: 'role_danyuan_effect_index.json',
  });
  replacedSources.add('role_danyuan_effect');
  replacedSources.add('role_danyuan_effect_index');
}

function buildExtremeStats(writer, replacedSources) {
  const source = readOutput('role_extreme_stats_stage_curves');
  const data = source?.data;
  if (!data || !Array.isArray(data.modules)) return;
  const used = new Set();
  const modules = [];
  for (const module of data.modules) {
    const label = module.label || module.name || module.key;
    if (!label) continue;
    const fileName = writer.write(`role/extreme-stats/${uniqueSegment(label, used, '未命名模块')}`, {
      powerAttribute: data.powerAttribute,
      extractionScope: data.extractionScope,
      module,
    }, { system: 'role/extreme-stats', entity: label, source: 'role_extreme_stats_stage_curves.json' });
    modules.push({ key: module.key, label, status: module.status, fileName });
  }
  writer.write('role/extreme-stats/index', { powerAttribute: data.powerAttribute, modules }, {
    system: 'role/extreme-stats', entity: '极限属性模块索引', source: 'role_extreme_stats_stage_curves.json',
  });
  replacedSources.add('role_extreme_stats_stage_curves');
}

function buildBosses(writer, replacedSources) {
  const files = fs.readdirSync(OUTPUT_DIR).filter((name) => /^boss_type_.*\.json$/.test(name));
  const groups = [];
  for (const file of files.sort((left, right) => left.localeCompare(right))) {
    const sourceName = file.slice(0, -5);
    const source = readOutput(sourceName);
    const data = source?.data;
    if (!data || !Array.isArray(data.stages)) continue;
    const groupName = data.label || data.slug || sourceName;
    const groupPath = `boss/${safeSegment(groupName)}`;
    const used = new Set();
    const stages = [];
    for (const stage of data.stages) {
      const stageName = stage.name || stage.stageName || `关卡-${stages.length + 1}`;
      const fileName = writer.write(`${groupPath}/${uniqueSegment(stageName, used, '未命名关卡')}`, stage, {
        system: 'boss', entity: stageName, source: file,
      });
      stages.push({ id: stage.id ?? stage.stageId ?? null, name: stageName, fileName });
    }
    const indexFile = writer.write(`${groupPath}/index`, {
      group: withoutKeys(data, ['stages']),
      stages,
    }, { system: 'boss', entity: groupName, source: file });
    groups.push({ type: data.type, label: data.label, slug: data.slug, fileName: indexFile, stageCount: stages.length });
    replacedSources.add(sourceName);
  }
  writer.write('boss/index', { groups }, { system: 'boss', entity: 'Boss 关卡索引' });
  replacedSources.add('boss_index');
}

function buildStageDrops(writer, replacedSources) {
  const source = readOutput('stage_expected_drops');
  const data = source?.data;
  if (!data || !Array.isArray(data.stages)) return;
  const used = new Set();
  const stages = [];
  for (const stage of data.stages) {
    const name = stage.name || stage.stageName || `关卡-${stages.length + 1}`;
    const fileName = writer.write(`stage/expected-drops/${uniqueSegment(name, used, '未命名关卡')}`, stage, {
      system: 'stage/expected-drops', entity: name, source: 'stage_expected_drops.json',
    });
    stages.push({ id: stage.id ?? stage.stageId ?? null, name, fileName });
  }
  writer.write('stage/expected-drops/index', { summary: data.summary, stages }, {
    system: 'stage/expected-drops', entity: '关卡期望掉落索引', source: 'stage_expected_drops.json',
  });
  replacedSources.add('stage_expected_drops');
}

function buildSystemData({ outputDir = OUTPUT_DIR } = {}) {
  if (path.resolve(outputDir) !== path.resolve(OUTPUT_DIR)) {
    throw new Error('Custom outputDir is not supported by the system-data builder');
  }
  if (!fs.existsSync(OUTPUT_DIR)) throw new Error(`Missing output directory: ${OUTPUT_DIR}`);
  const generatedAt = new Date().toISOString();
  const writer = createWriter(generatedAt);
  const replacedSources = new Set();

  buildPetWiki(writer, replacedSources);
  buildRideWiki(writer, replacedSources);
  buildRoleWiki(writer, replacedSources);
  buildStarstones(writer, replacedSources);
  buildRogueItems(writer, replacedSources);
  buildResourceAcquisition(writer, replacedSources);
  buildDanyuan(writer, replacedSources);
  buildExtremeStats(writer, replacedSources);
  buildBosses(writer, replacedSources);
  buildStageDrops(writer, replacedSources);

  cleanupGeneratedDirectories(writer.files.map(file => file.path));

  writer.files.sort((left, right) => left.name.localeCompare(right.name));
  const manifest = {
    version: 1,
    generatedAt,
    note: '系统化小文件是 QA 和前端按需读取的数据源；根目录聚合文件仅保留兼容用途。',
    replacedSources: [...replacedSources].sort((left, right) => left.localeCompare(right)),
    frontendFiles: writer.files
      .filter((file) => /^(?:pet\/wiki|ride\/wiki|role\/starstone|rogue-item|resource\/acquisition)(?:\/|$)/.test(file.name))
      .map((file) => file.name),
    files: writer.files,
  };
  const manifestPath = path.join(OUTPUT_DIR, `${MANIFEST_NAME}.json`);
  writeJsonIfChanged(manifestPath, {
    _meta: { name: MANIFEST_NAME, extractedAt: generatedAt, system: 'system-data' },
    data: manifest,
  });
  return { manifestPath, fileCount: writer.files.length, replacedSourceCount: replacedSources.size };
}

if (require.main === module) {
  try {
    const result = buildSystemData();
    console.log(`[system-data] wrote ${result.fileCount} small files; replaced ${result.replacedSourceCount} aggregate sources`);
  } catch (error) {
    console.error(`[system-data] ${error.stack || error.message || error}`);
    process.exitCode = 1;
  }
}

module.exports = {
  GENERATED_DIRS,
  MANIFEST_NAME,
  buildSystemData,
  safeSegment,
};
