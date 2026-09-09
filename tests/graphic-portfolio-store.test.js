const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createPortfolioStore } = require('../assets/js/graphic-portfolio-store.js');

function initialItems() {
  return [
    { ...imageWork('a', 'graphic', 0), title: { zh: '甲', en: 'A' } },
    { ...imageWork('b', 'graphic', 1), title: { zh: '乙', en: 'B' } },
    { ...imageWork('c', '3d', 0), title: { zh: '丙', en: 'C' } },
  ];
}

function imageWork(id, section = 'graphic', order = 0) {
  return { id, section, order, mediaType: 'image', src: `../assets/${id}.jpg` };
}

test('草稿可移动和添加作品，并可取消回到初始基线', () => {
  const store = createPortfolioStore(initialItems());

  store.begin();
  store.move('b', 'graphic', 'graphic', 0);
  store.add({ ...imageWork('d', 'ai-store', 99), title: { zh: '丁', en: 'D' } });

  assert.deepEqual(store.items('graphic').map(({ id }) => id), ['b', 'a']);
  assert.deepEqual(store.items('ai-store').map(({ id }) => id), ['d']);
  assert.equal(store.isDirty(), true);

  store.cancel();
  assert.deepEqual(store.items().map(({ id }) => id), ['a', 'b', 'c']);
  assert.equal(store.isDirty(), false);
});

test('删除令牌可恢复作品原位置且只能消费一次', () => {
  const store = createPortfolioStore(initialItems());
  store.begin();

  const token = store.remove('b');
  assert.deepEqual(store.items('graphic').map(({ id }) => id), ['a']);
  store.undo(token);
  assert.deepEqual(store.items('graphic').map(({ id }) => id), ['a', 'b']);
  assert.throws(() => store.undo(token), /token|撤销/i);
});

test('撤销不会产生重复 ID，冲突解除后仍可使用原令牌', () => {
  const store = createPortfolioStore(initialItems());
  store.begin();

  const token = store.remove('a');
  store.add({ ...imageWork('a', 'ai-store'), title: { zh: '新甲', en: 'New A' } });
  assert.throws(() => store.undo(token), /重复|duplicate/i);

  store.remove('a');
  store.undo(token);
  assert.deepEqual(store.items('graphic').map(({ id }) => id), ['a', 'b']);
});

test('未开始草稿时拒绝所有变更', () => {
  const store = createPortfolioStore(initialItems());

  assert.throws(() => store.add(imageWork('d', '3d')), /begin|草稿/i);
  assert.throws(() => store.remove('a'), /begin|草稿/i);
  assert.throws(() => store.move('a', 'graphic', 'graphic', 0), /begin|草稿/i);
  assert.throws(() => store.undo('missing'), /begin|草稿/i);
  assert.throws(() => store.commit(), /begin|草稿/i);
});

test('拒绝重复 ID、未知 ID 和非法 section', () => {
  const store = createPortfolioStore(initialItems());
  store.begin();

  assert.throws(() => store.add(imageWork('a')), /重复|duplicate/i);
  assert.throws(() => store.remove('missing'), /未知|unknown/i);
  assert.throws(() => store.move('missing', 'graphic', 'graphic', 0), /未知|unknown/i);
  assert.throws(() => store.add(imageWork('d', 'other')), /section|区域/i);
  assert.throws(() => store.move('a', 'graphic', 'other', 0), /section|区域/i);
});

test('同区移动索引夹紧到区域边界并归一化 order', () => {
  const store = createPortfolioStore(initialItems());
  store.begin();

  store.move('b', 'graphic', 'graphic', -100);
  assert.deepEqual(store.items('graphic').map(({ id, order }) => [id, order]), [['b', 0], ['a', 1]]);
  store.move('b', 'graphic', 'graphic', 100);
  assert.deepEqual(store.items('graphic').map(({ id, order }) => [id, order]), [['a', 0], ['b', 1]]);
});

test('拒绝跨区域移动且不改变任何 section 或 order', () => {
  const store = createPortfolioStore(initialItems());
  store.begin();

  assert.throws(() => store.move('a', 'graphic', '3d', 0), /同一|section|区域/i);
  assert.deepEqual(store.items('graphic').map(({ id, order }) => [id, order]), [['a', 0], ['b', 1]]);
  assert.deepEqual(store.items('3d').map(({ id, order }) => [id, order]), [['c', 0]]);
});

test('提交返回规范化快照并成为新的取消基线', () => {
  const store = createPortfolioStore(initialItems());
  store.begin();
  store.remove('b');
  store.add({ ...imageWork('b', 'ai-store', 50), title: { zh: '乙', en: 'B' } });

  const snapshot = store.commit();
  assert.deepEqual(snapshot.map(({ id, section, order }) => [id, section, order]), [
    ['a', 'graphic', 0],
    ['b', 'ai-store', 0],
    ['c', '3d', 0],
  ]);
  assert.equal(store.isDirty(), false);

  store.begin();
  store.remove('a');
  store.cancel();
  assert.deepEqual(store.items().map(({ id }) => id), ['a', 'b', 'c']);
  assert.deepEqual(store.items('ai-store').map(({ id }) => id), ['b']);
});

test('输入、items 与 commit 返回值均为防御性深拷贝', () => {
  const source = initialItems();
  const store = createPortfolioStore(source);
  source[0].title.zh = '被外部修改';

  const read = store.items();
  read[0].title.zh = '被读取结果修改';
  assert.equal(store.items()[0].title.zh, '甲');

  store.begin();
  const added = { ...imageWork('d', 'ai-store'), title: { zh: '丁', en: 'D' } };
  store.add(added);
  added.title.zh = '被添加参数修改';
  const committed = store.commit();
  committed.find(({ id }) => id === 'd').title.zh = '被提交结果修改';
  assert.equal(store.items('ai-store')[0].title.zh, '丁');
});

test('浏览器脚本将 API 导出到 window.GraphicPortfolioStore', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../assets/js/graphic-portfolio-store.js'),
    'utf8',
  );
  const sandbox = { window: {} };
  vm.createContext(sandbox);

  vm.runInContext(source, sandbox);

  assert.equal(typeof sandbox.window.GraphicPortfolioStore?.createPortfolioStore, 'function');
});

test('重复 begin 从提交基线重建草稿并清空撤销历史', () => {
  const store = createPortfolioStore(initialItems());
  store.begin();
  store.move('b', 'graphic', 'graphic', 0);
  const token = store.remove('a');

  store.begin();

  assert.deepEqual(store.items('graphic').map(({ id }) => id), ['a', 'b']);
  assert.equal(store.isDirty(), false);
  assert.throws(() => store.undo(token), /token|撤销/i);
});

test('add 校验 ID、section、order 与媒体字段形态', () => {
  const store = createPortfolioStore(initialItems());
  store.begin();

  assert.throws(() => store.add(imageWork('', 'graphic')), /id/i);
  assert.throws(() => store.add(imageWork('Upper_Case', 'graphic')), /id/i);
  assert.throws(() => store.add(imageWork('valid-id', 'other')), /section|区域/i);
  assert.throws(() => store.add({ ...imageWork('bad-order'), order: Infinity }), /order/i);
  assert.throws(() => store.add({ ...imageWork('bad-type'), mediaType: 'audio' }), /mediaType/i);
  assert.throws(() => store.add({ ...imageWork('empty-src'), src: '' }), /src/i);
  assert.throws(() => store.add({ ...imageWork('image-sources'), sources: ['a', 'b'] }), /sources/i);
  assert.throws(
    () => store.add({ id: 'short-group', section: '3d', order: 0, mediaType: 'video-group', sources: ['a'] }),
    /sources/i,
  );
  assert.throws(
    () => store.add({ id: 'group-src', section: '3d', order: 0, mediaType: 'video-group', sources: ['a', 'b'], src: 'c' }),
    /src/i,
  );

  store.add({ id: 'valid-video', section: '3d', order: 0, mediaType: 'video', src: 'video.mp4' });
  store.add({ id: 'valid-group', section: '3d', order: 1, mediaType: 'video-group', sources: ['a.mp4', 'b.mp4'] });
  assert.deepEqual(store.items('3d').map(({ id }) => id), ['valid-video', 'valid-group', 'c']);
});

test('items() 按固定区域顺序及各区 order 返回', () => {
  const store = createPortfolioStore([
    imageWork('d', '3d', 0),
    imageWork('a2', 'graphic', 1),
    imageWork('s', 'ai-store', 0),
    imageWork('a1', 'graphic', 0),
  ]);

  assert.deepEqual(store.items().map(({ id }) => id), ['a1', 'a2', 's', 'd']);
});

test('初始化入口对每条作品执行完整模型校验', () => {
  assert.throws(
    () => createPortfolioStore([{ id: 'INVALID', section: 'graphic', order: 0, mediaType: 'image', src: 'a.jpg' }]),
    /id/i,
  );
  assert.throws(
    () => createPortfolioStore([{ id: 'missing-src', section: 'graphic', order: 0, mediaType: 'image' }]),
    /src/i,
  );
  assert.throws(
    () => createPortfolioStore([{ id: 'bad-order', section: 'graphic', order: NaN, mediaType: 'image', src: 'a.jpg' }]),
    /order/i,
  );
});

test('video-group 的每个 source 都必须是非空字符串', () => {
  const invalidGroup = {
    id: 'bad-group',
    section: '3d',
    order: 0,
    mediaType: 'video-group',
    sources: ['valid.mp4', '  '],
  };

  assert.throws(() => createPortfolioStore([invalidGroup]), /sources/i);

  const store = createPortfolioStore([]);
  store.begin();
  assert.throws(() => store.add(invalidGroup), /sources/i);
});
