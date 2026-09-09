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

test('每条作品都有合法且唯一的字段，且各区域 order 从 0 连续递增', () => {
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

  for (const section of ['graphic', 'ai-store', '3d']) {
    const sectionWorks = works.filter((work) => work.section === section);
    assert.deepEqual(
      sectionWorks.map((work) => work.order),
      Array.from({ length: sectionWorks.length }, (_, index) => index),
      `${section} 区域的 order 必须按当前数组顺序从 0 连续递增`,
    );
  }
});

test('媒体类型使用对应的 src 或 sources 字段形态', () => {
  const { works } = loadManifest();

  for (const work of works) {
    if (work.mediaType === 'video-group') {
      assert.equal('src' in work, false, `${work.id} 的 video-group 不应包含 src`);
      assert.ok(Array.isArray(work.sources) && work.sources.length >= 2, `${work.id} 的 video-group 至少需要两个 sources`);
      for (const source of work.sources) {
        assert.ok(typeof source === 'string' && source.length > 0, `${work.id} 包含空的 source`);
      }
    } else {
      assert.equal('sources' in work, false, `${work.id} 的 ${work.mediaType} 不应包含 sources`);
      assert.ok(typeof work.src === 'string' && work.src.length > 0, `${work.id} 缺少非空 src`);
    }
  }
});

test('每条媒体引用都使用仓库内相对于 pages 目录的现有文件', () => {
  const { works } = loadManifest();
  const pagesDirectory = path.join(projectRoot, 'pages');

  for (const work of works) {
    const sources = work.mediaType === 'video-group' ? work.sources : [work.src];
    for (const source of sources) {
      assert.equal(path.isAbsolute(source), false, `${work.id} 不得使用绝对路径：${source}`);
      const resolvedSource = path.resolve(pagesDirectory, source);
      const relativeToRoot = path.relative(projectRoot, resolvedSource);
      assert.ok(
        relativeToRoot !== '..' && !relativeToRoot.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeToRoot),
        `${work.id} 引用的文件不得超出仓库：${source}`,
      );
      assert.ok(fs.existsSync(resolvedSource), `${work.id} 引用的文件不存在：${source}`);
    }
  }
});
