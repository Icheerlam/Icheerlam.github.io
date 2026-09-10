const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { savePortfolio, deletePortfolioMedia } = require('../scripts/local-preview-server.js');

test('本地预览服务将上传文件与清单保存到同一个项目根目录', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-server-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const result = await savePortfolio(root, {
    items: [{
      id: 'local-one', section: 'graphic', order: 0, mediaType: 'image',
      src: 'blob:preview', title: { zh: '', en: '' },
    }],
    files: [{
      id: 'local-one', name: 'new work.png',
      base64: Buffer.from('image-content').toString('base64'),
    }],
  });

  assert.equal(result.items[0].src, '../assets/portfolio-uploads/local-one-new-work.png');
  assert.equal(
    fs.readFileSync(path.join(root, 'assets', 'portfolio-uploads', 'local-one-new-work.png'), 'utf8'),
    'image-content',
  );
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(root, 'data', 'graphic-works.json'), 'utf8')),
    { version: 1, items: result.items },
  );
  const mediaIndex = JSON.parse(fs.readFileSync(path.join(root, 'data', 'portfolio-media-index.json'), 'utf8'));
  assert.ok(mediaIndex.items.some((item) => item.path === 'assets/portfolio-uploads/local-one-new-work.png'));
});

test('彻底删除仅允许受管媒体，并将文件交给本地回收站', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-delete-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const mediaPath = path.join(root, 'assets', 'portfolio-uploads', 'remove-me.png');
  fs.mkdirSync(path.dirname(mediaPath), { recursive: true });
  fs.writeFileSync(mediaPath, 'remove');
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'graphic-works.json'), JSON.stringify({
    version: 1,
    items: [{ id: 'remove-me', section: 'graphic', order: 0, mediaType: 'image', src: '../assets/portfolio-uploads/remove-me.png', title: { zh: '', en: '' } }],
  }));

  let recycledPath;
  const result = await deletePortfolioMedia(root, 'assets/portfolio-uploads/remove-me.png', async (filePath) => {
    recycledPath = filePath;
    fs.rmSync(filePath);
  });

  assert.equal(recycledPath, mediaPath);
  assert.deepEqual(result.items, []);
  assert.equal(fs.existsSync(mediaPath), false);
  await assert.rejects(
    () => deletePortfolioMedia(root, '../data/graphic-works.json', async () => {}),
    /受管|路径/,
  );
});
