const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(projectRoot, 'data', 'graphic-works.json');

function loadManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

test('Graphic 作品清单使用版本 1 并覆盖三个区域', () => {
  const manifest = loadManifest();

  assert.equal(manifest.version, 1);
  assert.ok(Array.isArray(manifest.works));
  assert.deepEqual(
    [...new Set(manifest.works.map((work) => work.section))].sort(),
    ['3d', 'ai-store', 'graphic'],
  );
});

test('每条作品都有合法且唯一的字段', () => {
  const { works } = loadManifest();
  const ids = new Set();
  const allowedMediaTypes = new Set(['image', 'video', 'video-group']);

  for (const work of works) {
    assert.match(work.id, /^[a-z0-9-]+$/);
    assert.equal(ids.has(work.id), false, `重复的作品 ID：${work.id}`);
    ids.add(work.id);
    assert.ok(allowedMediaTypes.has(work.mediaType), `不支持的媒体类型：${work.mediaType}`);
    assert.ok(Number.isInteger(work.order) && work.order >= 0, `${work.id} 的 order 必须是非负整数`);
    assert.equal(typeof work.title?.zh, 'string');
    assert.equal(typeof work.title?.en, 'string');
  }
});

test('每条媒体引用都相对于 pages 目录存在', () => {
  const { works } = loadManifest();
  const pagesDirectory = path.join(projectRoot, 'pages');

  for (const work of works) {
    const sources = work.mediaType === 'video-group' ? work.sources : [work.src];
    assert.ok(Array.isArray(sources) && sources.length > 0, `${work.id} 缺少媒体引用`);
    for (const source of sources) {
      assert.equal(typeof source, 'string');
      assert.ok(fs.existsSync(path.resolve(pagesDirectory, source)), `${work.id} 引用的文件不存在：${source}`);
    }
  }
});
