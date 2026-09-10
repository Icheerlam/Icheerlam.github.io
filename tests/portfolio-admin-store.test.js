const test = require('node:test');
const assert = require('node:assert/strict');

const { createAdminStore } = require('../assets/js/portfolio-admin-store.js');

test('后台状态模型标记展示中的单媒体和视频组来源', () => {
  const store = createAdminStore(
    {
      version: 1,
      items: [
        { path: 'works/graphic/shown.jpg', name: 'shown.jpg', mediaType: 'image' },
        { path: 'works/graphic/clip-a.webm', name: 'clip-a.webm', mediaType: 'video' },
        { path: 'works/graphic/clip-b.webm', name: 'clip-b.webm', mediaType: 'video' },
        { path: 'works/3d/hidden.png', name: 'hidden.png', mediaType: 'image' },
      ],
    },
    {
      items: [
        { id: 'graphic-shown', section: 'graphic', mediaType: 'image', src: '../works/graphic/shown.jpg', order: 0 },
        {
          id: 'graphic-clips',
          section: 'ai-store',
          mediaType: 'video-group',
          sources: ['../works/graphic/clip-a.webm', '../works/graphic/clip-b.webm'],
          order: 0,
        },
      ],
    },
  );

  assert.deepEqual(store.items('shown').map(({ path, sections }) => [path, sections]), [
    ['works/graphic/clip-a.webm', ['ai-store']],
    ['works/graphic/clip-b.webm', ['ai-store']],
    ['works/graphic/shown.jpg', ['graphic']],
  ]);
  assert.deepEqual(store.items('unshown').map(({ path }) => path), ['works/3d/hidden.png']);
  assert.deepEqual(store.statusFor('works/graphic/clip-a.webm'), {
    shown: true,
    sections: ['ai-store'],
  });
  assert.deepEqual(store.statusFor('works/3d/hidden.png'), {
    shown: false,
    sections: [],
  });
  assert.deepEqual(store.statusFor('works\\graphic\\shown.jpg'), {
    shown: true,
    sections: ['graphic'],
  });
});
