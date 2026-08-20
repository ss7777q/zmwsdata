const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const outputPath = path.join(repoRoot, 'output', 'pet_potential.json');
const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8')).data;

assert.ok(Array.isArray(payload.potentials), 'pet_potential should export the potential list');
assert.strictEqual(payload.potentials.length, payload.totalPotentialTypes);

for (const potential of payload.potentials) {
  assert.ok(potential.name, `potential ${potential.potentialId} should have a name`);
  assert.ok(Array.isArray(potential.levels) && potential.levels.length > 0, `${potential.name} should have levels`);
  assert.deepStrictEqual(
    potential.levels.map(level => level.level),
    payload.sharedCostByLevel.map(level => level.level),
    `${potential.name} levels should align with shared upgrade costs`
  );

  for (const level of potential.levels) {
    assert.ok(Number.isFinite(level.levelLimit), `${potential.name} Lv.${level.level} should have a pet level requirement`);
    assert.ok(Array.isArray(level.attributes) && level.attributes.length > 0, `${potential.name} Lv.${level.level} should have attributes`);
    for (const attribute of level.attributes) {
      assert.ok(attribute.key && attribute.label, `${potential.name} attribute should have a key and label`);
      assert.ok(Number.isFinite(attribute.value), `${potential.name} ${attribute.label} should have a numeric value`);
    }
  }
}

console.log(`pet potential attributes: ${payload.potentials.length} potentials verified`);
