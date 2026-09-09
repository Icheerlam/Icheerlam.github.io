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
  assert.match(html, /id=["']lightbox["']/);
  assert.match(html, /id=["']langBtn["']/);
  assert.match(html, /src=["']\.\.\/assets\/js\/language\.js["']/);
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
