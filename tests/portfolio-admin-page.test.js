const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('作品后台页面提供统计、展示状态筛选与作品卡片容器', () => {
  const page = read('pages/portfolio-admin.html');

  for (const id of ['adminStats', 'adminFilterAll', 'adminFilterShown', 'adminFilterUnshown', 'adminGallery']) {
    assert.match(page, new RegExp(`id=["']${id}["']`));
  }
  assert.match(page, /portfolio-admin-store\.js/);
  assert.match(page, /portfolio-admin\.js/);
  assert.match(page, /portfolio-admin-actions\.js/);
  assert.match(page, /graphic-portfolio-draft-v1/);
  assert.match(read('assets/js/portfolio-admin.js'), /draft\.items/);
  assert.match(page, /data-admin-action=["']add["']/);
  assert.match(page, /data-admin-action=["']remove["']/);
  assert.match(page, /data-admin-action=["']delete["']/);
  assert.match(read('assets/js/portfolio-admin.js'), /\/api\/portfolio\/save/);
});

test('Graphic 管理栏提供打开作品后台的入口', () => {
  const page = read('pages/graphic.html');

  assert.match(page, /href=["']portfolio-admin\.html["']/);
  assert.match(page, /打开作品后台/);
});
