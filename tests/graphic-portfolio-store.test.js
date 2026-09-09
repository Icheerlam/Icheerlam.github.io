const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createPortfolioStore } = require('../assets/js/graphic-portfolio-store.js');

function initialItems() {
  return [
    { id: 'a', section: 'graphic', order: 0, title: { zh: '甲', en: 'A' } },
    { id: 'b', section: 'graphic', order: 1, title: { zh: '乙', en: 'B' } },
    { id: 'c', section: '3d', order: 0, title: { zh: '丙', en: 'C' } },
  ];
}

test('草稿可移动和添加作品，并可取消回到初始基线', () => {
  const store = createPortfolioStore(initialItems());

  store.begin();
  store.move('b', 'graphic', 0);
  store.add({ id: 'd', section: 'ai-store', order: 99, title: { zh: '丁', en: 'D' } });

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
  store.add({ id: 'a', section: 'ai-store', order: 0, title: { zh: '新甲', en: 'New A' } });
  assert.throws(() => store.undo(token), /重复|duplicate/i);

  store.remove('a');
  store.undo(token);
  assert.deepEqual(store.items('graphic').map(({ id }) => id), ['a', 'b']);
});

test('未开始草稿时拒绝所有变更', () => {
  const store = createPortfolioStore(initialItems());

  assert.throws(() => store.add({ id: 'd', section: '3d', order: 0 }), /begin|草稿/i);
  assert.throws(() => store.remove('a'), /begin|草稿/i);
  assert.throws(() => store.move('a', '3d', 0), /begin|草稿/i);
  assert.throws(() => store.undo('missing'), /begin|草稿/i);
  assert.throws(() => store.commit(), /begin|草稿/i);
});

test('拒绝重复 ID、未知 ID 和非法 section', () => {
  const store = createPortfolioStore(initialItems());
  store.begin();

  assert.throws(() => store.add({ id: 'a', section: 'graphic', order: 0 }), /重复|duplicate/i);
  assert.throws(() => store.remove('missing'), /未知|unknown/i);
  assert.throws(() => store.move('missing', 'graphic', 0), /未知|unknown/i);
  assert.throws(() => store.add({ id: 'd', section: 'other', order: 0 }), /section|区域/i);
  assert.throws(() => store.move('a', 'other', 0), /section|区域/i);
});

test('移动索引夹紧到目标区域边界并归一化 order', () => {
  const store = createPortfolioStore(initialItems());
  store.begin();

  store.move('b', 'graphic', -100);
  assert.deepEqual(store.items('graphic').map(({ id, order }) => [id, order]), [['b', 0], ['a', 1]]);
  store.move('b', 'graphic', 100);
  assert.deepEqual(store.items('graphic').map(({ id, order }) => [id, order]), [['a', 0], ['b', 1]]);
  store.move('a', '3d', 100);
  assert.deepEqual(store.items('3d').map(({ id, order }) => [id, order]), [['c', 0], ['a', 1]]);
});

test('提交返回规范化快照并成为新的取消基线', () => {
  const store = createPortfolioStore(initialItems());
  store.begin();
  store.move('b', 'ai-store', 50);

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
  const added = { id: 'd', section: 'ai-store', order: 0, title: { zh: '丁', en: 'D' } };
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
