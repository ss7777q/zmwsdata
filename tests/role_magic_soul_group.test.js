const assert = require('assert');
const fs = require('fs');
const path = require('path');

function readOutput(fileName) {
  const parsed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'output', fileName), 'utf8'));
  return Array.isArray(parsed) ? parsed : parsed.data;
}

const magicLuck = readOutput('role_magic_luck.json');

const expectations = [
  { name: '罗悲净瓶', soulGroupId: 19 },
  { name: '浮行如意', soulGroupId: 20 },
  { name: '多智石莲', soulGroupId: 21 },
  { name: '风廉羽扇', soulGroupId: 22 },
];

for (const expected of expectations) {
  const item = magicLuck.find((entry) => entry.name === expected.name);
  assert.ok(item, `缺少法宝 ${expected.name}`);
  assert.strictEqual(item.soulGroupId, expected.soulGroupId, `${expected.name} 器魂组号错误`);
}
