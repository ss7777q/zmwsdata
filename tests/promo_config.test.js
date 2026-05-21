const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('../frontend/node_modules/typescript');

function loadTsModule(relativePath) {
  const sourcePath = path.join(__dirname, '..', 'frontend', 'src', relativePath);
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
    URL,
  });

  return moduleRef.exports;
}

const { resolvePromoPlaybackSource, PROMO_VIDEOS, SITE_COPY } = loadTsModule(path.join('lib', 'promo-content.ts'));

function toComparable(value) {
  return JSON.parse(JSON.stringify(value));
}

assert.ok(Array.isArray(PROMO_VIDEOS), '宣传视频列表必须存在');
assert.ok(PROMO_VIDEOS.length >= 3, '宣传视频列表至少保留 3 个视频位');

for (const [index, video] of PROMO_VIDEOS.entries()) {
  assert.ok(typeof video.id === 'string' && video.id.trim(), `视频 ${index + 1} 缺少 id`);
  assert.ok(typeof video.title === 'string' && video.title.trim(), `视频 ${video.id} 缺少标题`);
  assert.ok(typeof video.slotLabel === 'string' && video.slotLabel.trim(), `视频 ${video.id} 缺少片位标签`);
  if (typeof video.videoUrl === 'string') {
    assert.ok(/^(https:\/\/|\/)/.test(video.videoUrl), `视频 ${video.id} 链接格式不合法`);
  }
  assert.ok(typeof video.cover === 'string' && video.cover.trim(), `视频 ${video.id} 缺少封面`);
}

assert.deepStrictEqual(
  toComparable(resolvePromoPlaybackSource('https://www.bilibili.com/video/BV1xx411c7mD/?spm_id_from=333.999.0.0')),
  { kind: 'iframe', src: 'https://player.bilibili.com/player.html?bvid=BV1xx411c7mD&autoplay=0' },
);

assert.deepStrictEqual(
  toComparable(resolvePromoPlaybackSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ')),
  { kind: 'iframe', src: 'https://www.youtube.com/embed/dQw4w9WgXcQ' },
);

assert.deepStrictEqual(
  toComparable(resolvePromoPlaybackSource('/promo/trailer.mp4')),
  { kind: 'video', src: '/promo/trailer.mp4' },
);

assert.strictEqual(resolvePromoPlaybackSource(''), null);
assert.throws(() => resolvePromoPlaybackSource('https://example.com/video/demo'), /Unsupported promo video url/);

assert.ok(typeof SITE_COPY.heroTitle === 'string' && SITE_COPY.heroTitle.includes('造梦无双'));
assert.ok(typeof SITE_COPY.heroDescription === 'string' && SITE_COPY.heroDescription.length >= 20);
