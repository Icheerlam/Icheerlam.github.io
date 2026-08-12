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

test('defaults to Chinese and rejects invalid stored languages', () => {
  assert.equal(language.readLanguage({ getItem: () => null }), 'zh');
  assert.equal(language.readLanguage({ getItem: () => 'fr' }), 'zh');
  assert.equal(language.readLanguage({ getItem: () => 'en' }), 'en');
  assert.equal(language.readLanguage({ getItem: () => { throw new Error('blocked'); } }), 'zh');
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

