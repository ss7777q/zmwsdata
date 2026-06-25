#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { createBattlefieldService } = require('../../server/battlefield-service');

const ROOT = path.resolve(__dirname, '../..');
const OUTPUT_PATH = path.join(ROOT, 'output', 'call_god_battlefield_source.json');

const dataApiDir = process.argv[2];
if (!dataApiDir) {
  throw new Error('Usage: node scripts/extract/call_god_battlefield_source.js <dataApiDir>');
}

const service = createBattlefieldService({ dataApiDir: path.resolve(dataApiDir) });
const config = service.getConfig();
const battlefieldTiers = config.selectors.battlefieldTier.values;
const bossStages = config.selectors.bossStage.values;
const monsterIds = new Set();
const battlefieldTierOffset = 6;
const battlefieldSuffixWidth = 2;

for (const tier of battlefieldTiers) {
  const suffix = String(tier + battlefieldTierOffset).padStart(battlefieldSuffixWidth, '0');
  for (const hero of config.rosters.heroes) monsterIds.add(`1${hero.baseId}${suffix}`);
  for (const mount of config.rosters.mounts) monsterIds.add(`${mount.baseId}${suffix}`);
  monsterIds.add(`${config.rosters.specials.nuBa.baseId}${suffix}`);
}

for (const stage of bossStages) {
  for (const demonKing of config.rosters.demonKings) monsterIds.add(`${demonKing.baseId}${stage}`);
}

function requiredRows(index, ids, label) {
  return ids.map((id) => {
    const row = index.get(String(id));
    if (!row) throw new Error(`${label} lookup failed for id ${id}`);
    return row;
  });
}

const battlefieldLevels = battlefieldTiers.map((tier) => (tier + battlefieldTierOffset) * 10);
const payload = {
  _meta: {
    name: 'call_god_battlefield_source',
    extractedAt: new Date().toISOString(),
    system: 'call_god',
    source: 'monster.*.json + monsterAttribute.*.json + godWarAttribute.*.json + godWarCrystal.*.json',
    note: 'Compact source rows for battlefield calculation.',
    sourceFiles: Object.fromEntries(
      Object.entries(config.source.files).map(([key, value]) => [key, path.basename(value)])
    ),
  },
  data: {
    rosters: config.rosters,
    monsterRows: requiredRows(service.data.monsterById, [...monsterIds].sort((left, right) => left.localeCompare(right)), 'monster'),
    monsterAttributeRows: requiredRows(service.data.monsterAttributeById, battlefieldLevels, 'monsterAttribute'),
    godWarAttributeRows: requiredRows(service.data.godWarAttributeById, battlefieldLevels, 'godWarAttribute'),
    godWarCrystalRows: requiredRows(service.data.godWarCrystalById, battlefieldLevels, 'godWarCrystal'),
  },
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload)}\n`, 'utf8');
console.log(`[call-god-battlefield-source] wrote ${OUTPUT_PATH}`);
