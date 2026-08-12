const test = require('node:test');
const assert = require('node:assert/strict');

const language = require('../assets/js/language.js');

function element(dataset = {}) {
  return {
    dataset,
    hidden: false,
    textContent: '',
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(type, fn) { this.listener = fn; }
  };
}

function fixture(storedValue) {
  const zh = element({ lang: 'zh' });
  const en = element({ lang: 'en' });
  const inline = element({ langZh: '中文标题', langEn: 'English title' });
  const button = element();
  const document = {
    title: '',
    documentElement: {
      lang: '',
      dataset: { titleZh: '中文页面', titleEn: 'English page' },
      setAttribute(name, value) { this[name] = value; }
    },
    querySelectorAll(selector) {
      return selector === '[data-lang]' ? [zh, en] : [inline];
    },
    querySelector() { return button; }
  };
  const writes = [];
  const storage = {
    getItem() { return storedValue; },
    setItem(key, value) { writes.push([key, value]); }
  };
  return { document, storage, zh, en, inline, button, writes };
}

test('defaults to English and rejects invalid stored languages', () => {
  assert.equal(language.readLanguage({ getItem: () => null }), 'en');
  assert.equal(language.readLanguage({ getItem: () => 'fr' }), 'en');
  assert.equal(language.readLanguage({ getItem: () => 'en' }), 'en');
  assert.equal(language.readLanguage({ getItem: () => { throw new Error('blocked'); } }), 'en');
});

test('applies language to content, title, root and button', () => {
  const f = fixture('en');
  language.applyLanguage('en', f.document, f.button);
  assert.equal(f.document.documentElement.lang, 'en');
  assert.equal(f.document.title, 'English page');
  assert.equal(f.zh.hidden, true);
  assert.equal(f.en.hidden, false);
  assert.equal(f.inline.textContent, 'English title');
  assert.equal(f.button.textContent, '中');
  assert.equal(f.button.attributes['aria-label'], '切换到中文');
});

test('toggle persists the next language', () => {
  const f = fixture('zh');
  const next = language.toggleLanguage('zh', f.document, f.storage, f.button);
  assert.equal(next, 'en');
  assert.deepEqual(f.writes, [['site-language', 'en']]);
});

test('applies bilingual accessibility and metadata attributes', () => {
  const aria = element({ ariaLabelZh: '返回顶部', ariaLabelEn: 'Back to top' });
  const titled = element({ titleZh: '查看原图', titleEn: 'View full-size image' });
  const described = element({ descZh: '中文说明', descEn: 'English description' });
  const doc = {
    title: '',
    body: null,
    documentElement: { dataset: {}, setAttribute() {} },
    querySelectorAll(selector) {
      if (selector === '[data-aria-label-zh][data-aria-label-en]') return [aria];
      if (selector === '[data-title-zh][data-title-en]:not(html)') return [titled];
      if (selector === '[data-desc-zh][data-desc-en]') return [described];
      return [];
    },
    querySelector() { return null; }
  };
  language.applyLanguage('en', doc, null);
  assert.equal(aria.attributes['aria-label'], 'Back to top');
  assert.equal(titled.attributes.title, 'View full-size image');
  assert.equal(described.dataset.desc, 'English description');
});

