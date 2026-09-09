const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const pagePath = path.resolve(__dirname, '../pages/graphic.html');
const managerCssPath = path.resolve(__dirname, '../assets/css/graphic-portfolio-manager.css');

function readPage() {
  return fs.readFileSync(pagePath, 'utf8');
}

function readManagerCss() {
  return fs.readFileSync(managerCssPath, 'utf8');
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
  assert.match(html, /src=["']\.\.\/assets\/js\/graphic-portfolio-manager\.js["']/);
  assert.match(html, /id=["']lightbox["']/);
  assert.match(html, /id=["']langBtn["']/);
  assert.match(html, /src=["']\.\.\/assets\/js\/language\.js["']/);
  assert.match(html, /createPortfolioStore\(manifest\.items\)/);
  assert.doesNotMatch(html, /createPortfolioStore\(manifest\.works\)/);
  assert.equal((html.match(/\.setStore\(store\)/g) || []).length, 1);
  assert.doesNotMatch(html, /setStore\(store\);\s*renderer\.render/);
});

function loadManager(overrides) {
  const source = fs.readFileSync(path.resolve(__dirname, '../assets/js/graphic-portfolio-manager.js'), 'utf8');
  const sandbox = Object.assign({
    module: { exports: {} },
    exports: {},
    window: {},
    globalThis: {},
    console,
  }, overrides || {});
  vm.runInNewContext(source, sandbox);
  return { api: sandbox.module.exports, sandbox };
}

test('manager 文件校验同时检查 MIME、扩展名与 50 MiB 上限', () => {
  const { api } = loadManager();
  assert.equal(api.validateFile({ name: 'photo.JPEG', type: 'image/jpeg', size: 50 * 1024 * 1024 }).ok, true);
  assert.equal(api.validateFile({ name: 'payload.exe', type: 'image/jpeg', size: 1 }).reason, 'unsupported-extension');
  assert.equal(api.validateFile({ name: 'photo.png', type: 'application/x-msdownload', size: 1 }).reason, 'unsupported-type');
  assert.equal(api.validateFile({ name: 'photo.png', type: 'image/png', size: 50 * 1024 * 1024 + 1 }).reason, 'file-too-large');
});

test('manager downloadManifest 生成 JSON 下载并释放临时 URL', () => {
  const downloads = [];
  const revoked = [];
  const scheduled = [];
  const { api } = loadManager({
    URL: {
      createObjectURL(blob) { downloads.push({ blob }); return 'blob:manifest'; },
      revokeObjectURL(url) { revoked.push(url); },
    },
    document: {
      createElement(tag) {
        assert.equal(tag, 'a');
        return { click() { this.clicked = true; }, remove() {}, set href(value) { this._href = value; }, set download(value) { this._download = value; } };
      },
      body: { appendChild() {} },
    },
    Blob: class FakeBlob {
      constructor(parts, options) { this.parts = parts; this.options = options; }
    },
    setTimeout(callback) { scheduled.push(callback); return scheduled.length; },
  });
  const items = [{ id: 'local-demo', section: 'graphic', order: 0, mediaType: 'image', src: 'blob:demo', title: { zh: '标题', en: 'Title' } }];
  const pendingFiles = new Map([['local-demo', { name: 'demo.png', type: 'image/png', size: 123 }]]);
  const link = api.downloadManifest(items, { pendingFiles });
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].blob.options.type, 'application/json;charset=utf-8');
  assert.match(downloads[0].blob.parts[0], /local-demo/);
  const payload = JSON.parse(downloads[0].blob.parts[0]);
  assert.equal(payload.version, 1);
  assert.deepEqual(payload.items, items);
  assert.equal('works' in payload, false);
  assert.deepEqual(payload.pendingFiles, [{
    id: 'local-demo', name: 'demo.png', type: 'image/png', size: 123,
    section: 'graphic', title: { zh: '标题', en: 'Title' },
  }]);
  assert.match(payload.notice.zh, /Blob|当前会话/);
  assert.match(payload.notice.en, /Blob|current session/i);
  assert.equal(link._download, 'graphic-works.local.json');
  assert.equal(link.clicked, true);
  assert.deepEqual(revoked, [], '点击后不应立即回收下载 URL');
  assert.equal(scheduled.length, 1);
  scheduled[0]();
  assert.deepEqual(revoked, ['blob:manifest']);
});

test('manager beforeunload 仅在 dirty 时阻止离开', () => {
  const listeners = {};
  const windowRef = { addEventListener(type, listener) { listeners[type] = listener; } };
  const { api } = loadManager({
    window: windowRef,
    document: { getElementById() { return null; } },
  });
  const store = { begin() {}, isDirty: () => false };
  const manager = api.createPortfolioManager({ store, document: { getElementById() { return null; } }, window: windowRef });
  assert.equal(typeof manager, 'object');
  manager.enter();
  const cleanEvent = {};
  listeners.beforeunload?.(cleanEvent);
  assert.equal(cleanEvent.returnValue, undefined);
  store.isDirty = () => true;
  const dirtyEvent = {};
  listeners.beforeunload?.(dirtyEvent);
  assert.equal(dirtyEvent.returnValue, '');
});

test('manager 静态契约包含生命周期、上传与排序入口', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../assets/js/graphic-portfolio-manager.js'), 'utf8');
  for (const contract of [
    'ACCEPTED_TYPES', 'MAX_FILE_BYTES', 'createPortfolioManager', 'validateFile', 'downloadManifest',
    'portfolioManageButton', 'portfolioUploadInput', 'portfolioSaveButton', 'portfolioCancelButton',
    'portfolioToast', 'beforeunload', 'revokeObjectURL', 'pendingFile',
  ]) assert.match(source, new RegExp(contract));
});

test('Graphic 页面提供作品管理入口与隐藏管理容器', () => {
  const html = readPage();
  assert.match(html, /<button\b[^>]*id=["']portfolioManageButton["'][^>]*>/);
  assert.match(html, /<[^>]+\bid=["']portfolioManager["'][^>]*\bhidden(?:\s|=|>)/);
  assert.match(html, /<input\b[^>]*id=["']portfolioUploadInput["'][^>]*\bmultiple(?:\s|=|>)/);
  assert.match(html, /<button\b[^>]*id=["']portfolioSaveButton["'][^>]*>/);
  assert.match(html, /<button\b[^>]*id=["']portfolioCancelButton["'][^>]*>/);
});

test('Graphic 上传输入限制为受支持的图片与视频格式', () => {
  const html = readPage();
  const input = html.match(/<input\b[^>]*id=["']portfolioUploadInput["'][^>]*>/)?.[0] || '';
  assert.equal(
    input.match(/\baccept=["']([^"']+)["']/)?.[1],
    'image/jpeg,image/png,image/webp,image/gif,video/webm,video/mp4',
  );
});

test('Graphic 页面引用管理样式且页面按钮具备类型与可读标签', () => {
  const html = readPage();
  assert.match(html, /<link\b[^>]*href=["']\.\.\/assets\/css\/graphic-portfolio-manager\.css["']/);
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map((match) => match[0]);
  assert.ok(buttons.length > 0);
  for (const button of buttons) {
    assert.match(button, /\btype=["']button["']/i, `按钮缺少 type="button": ${button}`);
    const ariaLabel = button.match(/\baria-label=["']([^"']+)["']/i)?.[1] || '';
    assert.ok(ariaLabel.trim().length >= 2, `按钮缺少可读 aria-label: ${button}`);
  }
});

test('管理样式独立定义媒体错误，并为移动端 toast 预留安全位置', () => {
  const css = readManagerCss();
  assert.match(css, /\.media-error\s*\{/);
  const mobileRules = css.match(/@media\s*\(max-width:\s*768px\)[\s\S]*?(?=\n@media|$)/)?.[0] || '';
  const toastRules = mobileRules.match(/\.portfolio-toast\s*\{[\s\S]*?\}/)?.[0] || '';
  assert.match(toastRules, /bottom:\s*(?:84px|[0-9]{2,}px)/);
  assert.doesNotMatch(toastRules, /bottom:\s*(?:16|20|24)px/);
});

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach((name) => this.values.add(name)); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.classList = new FakeClassList();
    this.attributes = {};
    this.listeners = {};
    this._textContent = '';
    this._className = '';
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  removeChild(child) { this.children = this.children.filter((candidate) => candidate !== child); child.parentNode = null; }
  get firstChild() { return this.children[0] || null; }
  set textContent(value) { this._textContent = String(value); }
  get textContent() { return this._textContent || this.children.map((child) => child.textContent).join(''); }
  set innerHTML(value) { this._innerHTML = String(value); }
  get innerHTML() {
    if (this._innerHTML !== undefined) return this._innerHTML;
    return this.textContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  set className(value) { this._className = String(value); this.classList = new FakeClassList(); this._className.split(/\s+/).forEach((token) => token && this.classList.add(token)); }
  get className() { return this._className; }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') String(value).split(/\s+/).forEach((token) => token && this.classList.add(token));
  }
  getAttribute(name) { return this.attributes[name] || null; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  dispatchEvent(event) {
    event.target = this;
    event.stopPropagation ||= () => {};
    for (const listener of this.listeners[event.type] || []) listener.call(this, event);
  }
  querySelector(selector) {
    for (const child of this.children) {
      if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) return child;
      if (/^[a-z]+$/i.test(selector) && child.tagName === selector.toUpperCase()) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
}

class FakeDocument extends FakeElement {
  constructor() {
    super('document');
    this.nodes = new Map(['graphicGallery', 'aiStoreGallery', 'modelingGallery']
      .map((id) => [id, new FakeElement('section')]));
    this.documentElement = new FakeElement('html');
    this.body = new FakeElement('body');
    this.defaultView = { CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } } };
    this.eventLog = [];
  }
  createElement(tagName) { return new FakeElement(tagName); }
  getElementById(id) { return this.nodes.get(id) || null; }
  dispatchEvent(event) { this.eventLog.push(event); }
}

test('manager 进入管理模式并可批量添加媒体，保留无效文件提示', () => {
  const ids = ['portfolioManageButton', 'portfolioManager', 'portfolioUploadButton', 'portfolioUploadInput',
    'portfolioSaveButton', 'portfolioCancelButton', 'portfolioUploadDialog', 'portfolioUploadForm',
    'portfolioUploadSection', 'portfolioTitleZh', 'portfolioTitleEn', 'portfolioUploadConfirmButton',
    'portfolioUploadCancelButton', 'portfolioManagerStatus', 'portfolioEmptyState', 'portfolioToast', 'portfolioUploadFileList'];
  const documentRef = new FakeDocument();
  ids.forEach((id) => {
    const node = new FakeElement(id.includes('Input') ? 'input' : id.includes('Section') ? 'select' : 'div');
    node.id = id;
    documentRef.nodes.set(id, node);
  });
  const store = require('../assets/js/graphic-portfolio-store.js').createPortfolioStore([
    { id: 'existing', section: 'graphic', order: 0, mediaType: 'image', src: 'existing.jpg', title: { zh: '', en: '' } },
  ]);
  const renders = [];
  const revoked = [];
  const scheduleCalls = [];
  const windowRef = {
    confirm: () => true,
    URL: { createObjectURL: () => 'blob:local', revokeObjectURL: (url) => revoked.push(url) },
    crypto: { randomUUID: () => 'test-id' },
    addEventListener() {},
  };
  const manager = loadManager().api.createPortfolioManager({
    document: documentRef,
    window: windowRef,
    store,
    renderer: { render(items, state) { renders.push({ items, state }); } },
    setTimeout: () => { scheduleCalls.push('unexpected'); return 'timer'; },
    clearTimeout() {},
  });
  documentRef.getElementById('portfolioManageButton').dispatchEvent({ type: 'click' });
  assert.equal(manager.isEditing(), true);
  assert.equal(documentRef.getElementById('portfolioManager').hidden, false);
  documentRef.getElementById('portfolioUploadButton').dispatchEvent({ type: 'click' });
  const input = documentRef.getElementById('portfolioUploadInput');
  input.files = [{ name: 'ok.png', type: 'image/png', size: 1 }, { name: 'bad.exe', type: 'application/x-msdownload', size: 1 }];
  const validFile = input.files[0];
  documentRef.getElementById('portfolioUploadInput').dispatchEvent({ type: 'change' });
  assert.equal(documentRef.getElementById('portfolioUploadFileList').children.length, 2, '选择后逐项显示有效与无效文件');
  documentRef.getElementById('portfolioUploadSection').value = '3d';
  documentRef.getElementById('portfolioTitleZh').value = '<安全文本>';
  documentRef.getElementById('portfolioUploadConfirmButton').dispatchEvent({ type: 'click' });
  const resultRows = documentRef.getElementById('portfolioUploadFileList').children;
  assert.equal(resultRows.length, 2, '上传后逐项保留成功与失败结果');
  assert.match(resultRows[0].textContent, /ok\.png/);
  assert.match(resultRows[0].getAttribute('data-lang-en'), /added/i);
  assert.match(resultRows[1].textContent, /bad\.exe/);
  const added = store.items('3d')[0];
  assert.match(added.id, /^local-test-id$/);
  assert.equal(added.mediaType, 'image');
  assert.equal(added.title.zh, '<安全文本>');
  assert.equal(added.pendingFile, undefined, 'store 条目不应依赖 File 对象');
  assert.equal(manager.getPendingFile(added.id), validFile, 'manager 应保留原始 File 引用');
  assert.equal(documentRef.getElementById('portfolioManagerStatus').dataset.dirty, 'true');
  manager.enter();
  assert.equal(store.items('3d')[0].id, added.id, '重复进入不得重置当前草稿');
  assert.equal(manager.getPendingFile(added.id), validFile, '重复进入不得丢失 pending File 引用');
  assert.equal(documentRef.getElementById('portfolioUploadDialog').hidden, false);
  renders.at(-1).state.onRemove(added.id);
  assert.equal(scheduleCalls.length, 0, '删除撤销入口不得自动失效');
  assert.equal(documentRef.getElementById('portfolioToast').hidden, false);
  assert.equal(documentRef.getElementById('portfolioManagerStatus').dataset.dirty, 'false', '删除刚添加的作品后草稿回到干净状态');
  documentRef.getElementById('portfolioToast').children[1].dispatchEvent({ type: 'click' });
  assert.equal(documentRef.getElementById('portfolioManagerStatus').dataset.dirty, 'true', '撤销删除后重新标记未保存改动');
  manager.cancel();
  assert.equal(manager.isEditing(), false);
  assert.equal(documentRef.getElementById('portfolioUploadDialog').hidden, true);
  assert.equal(documentRef.getElementById('portfolioToast').hidden, true);
  assert.deepEqual(revoked, ['blob:local']);
  assert.ok(renders.length >= 2);
});

test('manager 保存时关闭上传对话框并清空撤销提示', () => {
  const documentRef = new FakeDocument();
  ['portfolioManager', 'portfolioSaveButton', 'portfolioCancelButton', 'portfolioUploadDialog', 'portfolioToast']
    .forEach((id) => documentRef.nodes.set(id, new FakeElement('div')));
  const dialog = documentRef.getElementById('portfolioUploadDialog');
  dialog.close = () => { dialog.closed = true; dialog.hidden = true; };
  const toast = documentRef.getElementById('portfolioToast');
  toast.hidden = false;
  toast.appendChild(new FakeElement('button'));
  const store = require('../assets/js/graphic-portfolio-store.js').createPortfolioStore([]);
  const windowRef = {
    URL: { createObjectURL: () => 'blob:manifest', revokeObjectURL() {} },
    addEventListener() {},
  };
  const manager = loadManager().api.createPortfolioManager({
    document: documentRef,
    window: windowRef,
    store,
    renderer: { render() {} },
    Blob: class FakeBlob {},
  });
  manager.enter();
  assert.equal(manager.save(), true);
  assert.equal(dialog.closed, true);
  assert.equal(toast.hidden, true);
  assert.equal(toast.children.length, 0);
});

test('manager 保存后保留仍在渲染中的媒体 Blob，页面关闭时才回收', () => {
  const listeners = {};
  const revoked = [];
  const downloads = [];
  const exported = [];
  const documentRef = new FakeDocument();
  ['portfolioManager', 'portfolioSaveButton', 'portfolioCancelButton', 'portfolioUploadDialog', 'portfolioToast',
    'portfolioManagerStatus', 'portfolioUploadInput', 'portfolioUploadSection', 'portfolioTitleZh',
    'portfolioTitleEn', 'portfolioUploadConfirmButton', 'portfolioUploadFileList']
    .forEach((id) => {
      const tag = id.includes('Input') ? 'input' : id.includes('Section') ? 'select' : 'div';
      documentRef.nodes.set(id, new FakeElement(tag));
    });
  const store = require('../assets/js/graphic-portfolio-store.js').createPortfolioStore([]);
  const windowRef = {
    URL: {
      createObjectURL(value) { return value?.name ? 'blob:media' : 'blob:manifest'; },
      revokeObjectURL(url) { revoked.push(url); },
    },
    crypto: { randomUUID: () => 'saved' },
    addEventListener(type, listener) { listeners[type] = listener; },
  };
  const manager = loadManager().api.createPortfolioManager({
    document: documentRef,
    window: windowRef,
    store,
    renderer: { render(items) { downloads.push(items); } },
    Blob: class FakeBlob { constructor(parts) { exported.push(parts[0]); } },
    setTimeout() { return 1; },
  });
  manager.enter();
  const input = documentRef.getElementById('portfolioUploadInput');
  input.files = [{ name: 'saved.png', type: 'image/png', size: 5 }];
  input.dispatchEvent({ type: 'change' });
  documentRef.getElementById('portfolioUploadSection').value = 'graphic';
  documentRef.getElementById('portfolioUploadConfirmButton').dispatchEvent({ type: 'click' });

  assert.equal(manager.save(), true);
  assert.equal(manager.isEditing(), false);
  assert.equal(store.items()[0].id, 'local-saved');
  assert.equal(store.items()[0].src, 'blob:media');
  assert.equal(downloads.at(-1)[0].src, 'blob:media', 'commit 后的首次渲染仍使用有效 Blob URL');
  assert.equal(JSON.parse(exported[0]).pendingFiles[0].name, 'saved.png');
  assert.deepEqual(revoked, [], '保存不回收仍在当前页面显示的媒体 URL');

  manager.enter();
  manager.cancel();
  assert.deepEqual(revoked, [], '再次进入并取消编辑也不应回收基线仍引用的媒体 URL');

  listeners.pagehide();
  assert.deepEqual(revoked, ['blob:media']);
});

function loadRenderer() {
  const source = fs.readFileSync(path.resolve(__dirname, '../assets/js/graphic-portfolio-renderer.js'), 'utf8');
  const sandbox = { module: { exports: {} }, exports: {}, window: {}, globalThis: {} };
  vm.runInNewContext(source, sandbox);
  return sandbox.module.exports;
}

test('renderer 按区域和 order 重建卡片、保留媒体形态且不累积', () => {
  const documentRef = new FakeDocument();
  const renderer = loadRenderer().createPortfolioRenderer({ document: documentRef });
  const items = [
    { id: 'late', section: 'graphic', order: 2, mediaType: 'image', src: 'late.jpg', title: { zh: '', en: '' } },
    { id: 'early', section: 'graphic', order: 0, mediaType: 'image', src: 'early.jpg', title: { zh: '安全标题', en: 'Safe title' } },
    { id: 'movie', section: '3d', order: 0, mediaType: 'video', src: 'house.mp4', title: { zh: '场景', en: 'Scene' } },
  ];

  renderer.render(items, { editing: false });
  const graphic = documentRef.getElementById('graphicGallery');
  const modeling = documentRef.getElementById('modelingGallery');
  assert.deepEqual(graphic.children.map((card) => card.dataset.workId), ['early', 'late']);
  assert.equal(graphic.children[0].querySelector('img').tagName, 'IMG');
  assert.equal(modeling.children[0].querySelector('video').tagName, 'VIDEO');
  assert.equal(modeling.children[0].dataset.workId, 'movie');
  assert.equal(graphic.children[1].querySelector('.portfolio-title'), null, '空标题不应插入标题占位');

  renderer.render([items[1]], { editing: false });
  assert.equal(graphic.children.length, 1);
  assert.equal(modeling.children.length, 0);
});

test('renderer 当前语言标题为空时不创建标题节点，切换后仅以 textContent 渲染', () => {
  const documentRef = new FakeDocument();
  let language = 'zh';
  const renderer = loadRenderer().createPortfolioRenderer({ document: documentRef, getLanguage: () => language });
  const items = [
    { id: 'single-lang', section: '3d', order: 0, mediaType: 'image', src: 'single.jpg', title: { zh: '   ', en: '<English only>' } },
  ];

  renderer.render(items, { editing: false });
  assert.equal(documentRef.getElementById('modelingGallery').children[0].querySelector('.c3d-title'), null);

  language = 'en';
  renderer.render(items, { editing: false });
  const title = documentRef.getElementById('modelingGallery').children[0].querySelector('.c3d-title');
  assert.equal(title.textContent, '<English only>');
  assert.doesNotMatch(title.innerHTML, /<English only>/);
});

test('renderer 管理控件提供双语标签、边界禁用并向移动回调传 source 与 target section', () => {
  const documentRef = new FakeDocument();
  const moves = [];
  const renderer = loadRenderer().createPortfolioRenderer({ document: documentRef, language: 'en' });
  renderer.render([
    { id: 'first', section: 'graphic', order: 0, mediaType: 'image', src: 'first.jpg', title: { zh: '', en: '' } },
    { id: 'second', section: 'graphic', order: 1, mediaType: 'image', src: 'second.jpg', title: { zh: '', en: '' } },
    { id: 'target', section: '3d', order: 0, mediaType: 'image', src: 'target.jpg', title: { zh: '', en: '' } },
  ], { editing: true, onMove: (...args) => moves.push(args) });

  const first = documentRef.getElementById('graphicGallery').children[0];
  const controls = first.querySelector('.portfolio-manage-controls');
  const remove = controls.children[0];
  const up = controls.children[1];
  const down = controls.children[2];
  const handle = first.querySelector('.portfolio-drag-handle');
  for (const node of [remove, up, down, handle]) {
    assert.ok(node.getAttribute('data-aria-label-zh'));
    assert.ok(node.getAttribute('data-aria-label-en'));
    assert.equal(node.getAttribute('aria-label'), node.getAttribute('data-aria-label-en'));
  }
  assert.equal(up.disabled, true);
  assert.equal(down.disabled, false);
  const second = documentRef.getElementById('graphicGallery').children[1];
  assert.equal(second.querySelector('.portfolio-manage-controls').children[2].disabled, true);

  const transfer = {
    values: {},
    setData(type, value) { this.values[type] = value; },
    getData(type) { return this.values[type] || ''; },
  };
  first.dispatchEvent({ type: 'dragstart', dataTransfer: transfer });
  documentRef.getElementById('modelingGallery').children[0].dispatchEvent({ type: 'drop', dataTransfer: transfer, preventDefault() {} });
  assert.equal(moves.length, 0, '跨区域拖拽应在 renderer 层直接拒绝');
});

test('manager 拒绝 renderer 发出的跨区拖拽且不改变作品区域', () => {
  const documentRef = new FakeDocument();
  documentRef.nodes.set('portfolioManagerStatus', new FakeElement('p'));
  const store = require('../assets/js/graphic-portfolio-store.js').createPortfolioStore([
    { id: 'source', section: 'graphic', order: 0, mediaType: 'image', src: 'source.jpg', title: { zh: '', en: '' } },
    { id: 'target', section: '3d', order: 0, mediaType: 'image', src: 'target.jpg', title: { zh: '', en: '' } },
  ]);
  let state;
  const manager = loadManager().api.createPortfolioManager({
    document: documentRef,
    window: { addEventListener() {} },
    store,
    renderer: { render(_items, nextState) { state = nextState; } },
  });
  manager.enter();
  state.onMove('source', 'graphic', '3d', 0);
  assert.equal(store.items('graphic')[0].id, 'source');
  assert.equal(store.items('3d')[0].id, 'target');
  assert.equal(store.isDirty(), false);
});

test('manager 同区移动后更新 dirty 状态，并为英文确认与状态提供双语映射', () => {
  const documentRef = new FakeDocument();
  documentRef.documentElement.setAttribute('data-current-lang', 'en');
  documentRef.nodes.set('portfolioManagerStatus', new FakeElement('p'));
  const confirmations = [];
  const store = require('../assets/js/graphic-portfolio-store.js').createPortfolioStore([
    { id: 'first-item', section: 'graphic', order: 0, mediaType: 'image', src: 'first.jpg', title: { zh: '', en: '' } },
    { id: 'second-item', section: 'graphic', order: 1, mediaType: 'image', src: 'second.jpg', title: { zh: '', en: '' } },
  ]);
  let state;
  const manager = loadManager().api.createPortfolioManager({
    document: documentRef,
    window: { addEventListener() {}, confirm(message) { confirmations.push(message); return true; } },
    store,
    renderer: { render(_items, nextState) { state = nextState; } },
  });
  manager.enter();
  const status = documentRef.getElementById('portfolioManagerStatus');
  assert.match(status.textContent, /Management mode/i);
  assert.ok(status.getAttribute('data-lang-zh'));
  assert.ok(status.getAttribute('data-lang-en'));

  state.onMove('second-item', 'graphic', 'graphic', 0);
  assert.equal(status.dataset.dirty, 'true');
  assert.match(status.textContent, /unsaved/i);
  state.onRemove('first-item');
  assert.match(confirmations[0], /Remove this work/i);
});

test('普通瀑布流单视频自适应容器且窄屏不溢出', () => {
  const css = `${readPage()}\n${readManagerCss()}`;
  const rule = css.match(/\.masonry-item\s+\.img-box\s+video\s*\{[\s\S]*?\}/)?.[0] || '';
  assert.match(rule, /width:\s*100%/);
  assert.match(rule, /display:\s*block/);
  assert.match(rule, /object-fit:\s*cover/);
  assert.match(rule, /max-width:\s*100%/);
});

test('renderer 只为图片绑定灯箱、媒体错误独立显示且标题使用 textContent', () => {
  const documentRef = new FakeDocument();
  const opened = [];
  const renderer = loadRenderer().createPortfolioRenderer({
    document: documentRef,
    onOpenMedia: (payload) => opened.push(payload),
  });
  renderer.render([
    { id: 'image', section: 'graphic', order: 0, mediaType: 'image', src: 'image.jpg', title: { zh: '<img>危险', en: 'Safe' } },
    { id: 'video', section: '3d', order: 0, mediaType: 'video', src: 'video.mp4', title: { zh: '视频', en: 'Video' } },
  ], { editing: false });
  const imageCard = documentRef.getElementById('graphicGallery').children[0];
  const videoCard = documentRef.getElementById('modelingGallery').children[0];
  const image = imageCard.querySelector('img');
  const video = videoCard.querySelector('video');
  const title = imageCard.querySelector('.portfolio-title');
  assert.equal(title.textContent, '<img>危险');
  assert.doesNotMatch(title.innerHTML, /<img>/i, '恶意标题不应作为 HTML 注入');
  image.dispatchEvent({ type: 'error' });
  assert.ok(imageCard.querySelector('.media-error'));
  image.dispatchEvent({ type: 'click' });
  video.dispatchEvent({ type: 'click' });
  assert.equal(video.classList.contains('img-clicker'), false);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].src, 'image.jpg');
});
