const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildMediaIndex } = require('../scripts/build-portfolio-media-index.js');

function writeFixture(root, relativePath) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, 'fixture');
}

test('媒体索引只收录受管目录中的图片与视频，并按路径排序', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-index-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  writeFixture(root, 'works/graphic/z-last.jpg');
  writeFixture(root, 'works/graphic/nested/a-first.PNG');
  writeFixture(root, 'works/3d/demo.webm');
  writeFixture(root, 'assets/portfolio-uploads/new-work.mp4');
  writeFixture(root, 'works/graphic/readme.txt');
  writeFixture(root, 'data/should-not-appear.jpg');

  assert.deepEqual(buildMediaIndex(root), [
    { path: 'assets/portfolio-uploads/new-work.mp4', name: 'new-work.mp4', mediaType: 'video' },
    { path: 'works/3d/demo.webm', name: 'demo.webm', mediaType: 'video' },
    { path: 'works/graphic/nested/a-first.PNG', name: 'a-first.PNG', mediaType: 'image' },
    { path: 'works/graphic/z-last.jpg', name: 'z-last.jpg', mediaType: 'image' },
  ]);
});
