const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('../frontend/node_modules/typescript');

const sourcePath = path.join(__dirname, '..', 'frontend', 'src', 'lib', 'browser-compat.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
});

const moduleRef = { exports: {} };
vm.runInNewContext(compiled.outputText, {
  exports: moduleRef.exports,
  module: moduleRef,
  require,
});

const {
  supportsRequiredBrowserFeatures,
  hasForcedLegacyAccess,
  rememberForcedLegacyAccess,
} = moduleRef.exports;

function createCssSupport(rejectedValue) {
  return {
    supports(...args) {
      if (args.includes(rejectedValue)) return false;
      return true;
    },
  };
}

assert.strictEqual(supportsRequiredBrowserFeatures({
  css: createCssSupport(null),
  fetch() {},
  promise: Promise,
}), true);

assert.strictEqual(supportsRequiredBrowserFeatures({
  css: createCssSupport('oklch(50% 0.1 120)'),
  fetch() {},
  promise: Promise,
}), false);

assert.strictEqual(supportsRequiredBrowserFeatures({
  css: { supports() { throw new Error('unsupported'); } },
  fetch() {},
  promise: Promise,
}), false);

assert.strictEqual(supportsRequiredBrowserFeatures({
  css: createCssSupport(null),
  fetch: undefined,
  promise: Promise,
}), false);

const storageValues = new Map();
const storage = {
  getItem(key) {
    return storageValues.get(key) ?? null;
  },
  setItem(key, value) {
    storageValues.set(key, value);
  },
};

assert.strictEqual(hasForcedLegacyAccess(storage), false);
rememberForcedLegacyAccess(storage);
assert.strictEqual(hasForcedLegacyAccess(storage), true);

assert.strictEqual(hasForcedLegacyAccess({ getItem() { throw new Error('denied'); } }), false);
assert.doesNotThrow(() => rememberForcedLegacyAccess({ setItem() { throw new Error('denied'); } }));
