const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'settings.js');

const DEFAULT_SETTINGS = {
  server: {
    host: '0.0.0.0',
    port: 2317,
    adminToken: '',
  },
  data: {
    maxLevel: 235,
  },
  autoRefresh: {
    enabled: true,
    intervalMinutes: 360,
    onStart: true,
  },
};

function normalizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeInteger(value, fallback, minValue = 0) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minValue) return fallback;
  return parsed;
}

function normalizeString(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function normalizeSettings(input) {
  const source = input && typeof input === 'object' ? input : {};
  const defaults = cloneDefaults();
  return {
    server: {
      host: normalizeString(source.server?.host, defaults.server.host),
      port: normalizeInteger(source.server?.port, defaults.server.port, 1),
      adminToken: typeof source.server?.adminToken === 'string' ? source.server.adminToken : defaults.server.adminToken,
    },
    data: {
      maxLevel: normalizeInteger(source.data?.maxLevel, defaults.data.maxLevel, 0),
    },
    autoRefresh: {
      enabled: normalizeBoolean(source.autoRefresh?.enabled, defaults.autoRefresh.enabled),
      intervalMinutes: normalizeInteger(source.autoRefresh?.intervalMinutes, defaults.autoRefresh.intervalMinutes, 1),
      onStart: normalizeBoolean(source.autoRefresh?.onStart, defaults.autoRefresh.onStart),
    },
  };
}

function serializeSettings(settings) {
  return `module.exports = ${JSON.stringify(normalizeSettings(settings), null, 2)};\n`;
}

function persistAppSettings(settings) {
  const normalized = normalizeSettings(settings);
  fs.writeFileSync(CONFIG_PATH, serializeSettings(normalized), 'utf8');
  return normalized;
}

function loadAppSettings() {
  try {
    delete require.cache[require.resolve(CONFIG_PATH)];
    const raw = require(CONFIG_PATH);
    const normalized = normalizeSettings(raw);
    if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
      persistAppSettings(normalized);
    }
    return normalized;
  } catch {
    return persistAppSettings(DEFAULT_SETTINGS);
  }
}

module.exports = {
  CONFIG_PATH,
  DEFAULT_SETTINGS,
  loadAppSettings,
  normalizeSettings,
  persistAppSettings,
};
