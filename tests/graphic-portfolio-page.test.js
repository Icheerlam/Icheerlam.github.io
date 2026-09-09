const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pagePath = path.resolve(__dirname, '../pages/graphic.html');

function readPage() {
  return fs.readFileSync(pagePath, 'utf8');
}

test('Graphic 页面保留三个作品区域的空数据容器', () => {
  const html = readPage();
  for (const id of ['graphicGallery', 'aiStoreGallery', 'modelingGallery']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.doesNotMatch(html, /works\/graphic\/(?:11|21|ai-stores\/ai-store-01)\.(?:jpg|png)/);
});

test('Graphic 页面加载清单、store、renderer 及共享语言模块', () => {
  const html = readPage();
  assert.match(html, /fetch\(['"]\.\.\/data\/graphic-works\.json['"]\)/);
  assert.match(html, /src=["']\.\.\/assets\/js\/graphic-portfolio-store\.js["']/);
  assert.match(html, /src=["']\.\.\/assets\/js\/graphic-portfolio-renderer\.js["']/);
  assert.match(html, /id=["']lightbox["']/);
  assert.match(html, /id=["']langBtn["']/);
  assert.match(html, /src=["']\.\.\/assets\/js\/language\.js["']/);
});
