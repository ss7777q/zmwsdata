const path = require('path');
const { loadAppSettings } = require('../server/app-config');

const keyPath = process.argv[2] || '';
const settings = loadAppSettings();
const value = keyPath
  .split('.')
  .filter(Boolean)
  .reduce((current, key) => (current && Object.prototype.hasOwnProperty.call(current, key) ? current[key] : undefined), settings);

if (value === undefined) {
  process.exit(1);
}

if (typeof value === 'object') {
  process.stdout.write(JSON.stringify(value));
} else {
  process.stdout.write(String(value));
}
