const test = require('node:test');
const assert = require('node:assert/strict');

const { addMediaToManifest, removeMediaFromManifest } = require('../assets/js/portfolio-admin-actions.js');

test('未展示媒体加入区域时生成合法 ID，并排在该区域末尾', () => {
  const items = [
    { id: 'graphic-old', section: 'graphic', mediaType: 'image', src: '../works/graphic/old.jpg', title: { zh: '', en: '' }, order: 0 },
  ];

  const result = addMediaToManifest(items, {
    path: 'works/3d/new model.png',
    name: 'new model.png',
    mediaType: 'image',
  }, '3d');

  assert.deepEqual(result, {
    id: 'managed-new-model',
    section: '3d',
    mediaType: 'image',
    src: '../works/3d/new model.png',
    title: { zh: '', en: '' },
    order: 0,
  });
});

test('移出展示仅从清单移除媒体引用，不删除媒体索引项', () => {
  const items = [
    { id: 'graphic-old', section: 'graphic', mediaType: 'image', src: '../works/graphic/old.jpg', title: { zh: '', en: '' }, order: 0 },
    { id: 'model', section: '3d', mediaType: 'image', src: '../works/3d/model.png', title: { zh: '', en: '' }, order: 0 },
  ];

  const result = removeMediaFromManifest(items, 'works/graphic/old.jpg');

  assert.deepEqual(result.map(({ id, section, order }) => [id, section, order]), [['model', '3d', 0]]);
});
