(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SiteLanguage = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const STORAGE_KEY = 'site-language';

  function normalizeLanguage(value) {
    return value === 'zh' ? 'zh' : 'en';
  }

  function readLanguage(storage) {
    try {
      const saved = storage && storage.getItem(STORAGE_KEY);
      if (!saved) return 'zh'; // 无保存偏好时默认中文
      return normalizeLanguage(saved);
    } catch (_) {
      return 'zh';
    }
  }

  function updateButton(button, language) {
    if (!button) return;
    const isEnglish = language === 'en';
    button.textContent = isEnglish ? '中' : 'EN';
    button.setAttribute('aria-label', isEnglish ? '切换到中文' : 'Switch to English');
    button.setAttribute('title', isEnglish ? '切换到中文' : 'Switch to English');
  }

  function applyLanguage(value, documentRef, button) {
    const language = normalizeLanguage(value);
    const doc = documentRef || document;
    doc.documentElement.setAttribute('lang', language === 'en' ? 'en' : 'zh-CN');
    doc.documentElement.setAttribute('data-current-lang', language);
    if (doc.body && doc.body.classList) doc.body.classList.toggle('lang-en', language === 'en');

    doc.querySelectorAll('[data-lang]').forEach(function (node) {
      node.hidden = node.dataset.lang !== language;
    });
    doc.querySelectorAll('[data-lang-zh][data-lang-en]').forEach(function (node) {
      const text = node.dataset[language === 'en' ? 'langEn' : 'langZh'];
      if (node.hasAttribute && node.hasAttribute('placeholder')) node.setAttribute('placeholder', text);
      else node.textContent = text;
    });
    doc.querySelectorAll('[data-placeholder-zh][data-placeholder-en]').forEach(function (node) {
      node.setAttribute('placeholder', node.dataset[language === 'en' ? 'placeholderEn' : 'placeholderZh']);
    });
    doc.querySelectorAll('[data-aria-label-zh][data-aria-label-en]').forEach(function (node) {
      node.setAttribute('aria-label', node.dataset[language === 'en' ? 'ariaLabelEn' : 'ariaLabelZh']);
    });
    doc.querySelectorAll('[data-title-zh][data-title-en]:not(html)').forEach(function (node) {
      node.setAttribute('title', node.dataset[language === 'en' ? 'titleEn' : 'titleZh']);
    });
    doc.querySelectorAll('[data-desc-zh][data-desc-en]').forEach(function (node) {
      node.dataset.desc = node.dataset[language === 'en' ? 'descEn' : 'descZh'];
    });

    const title = doc.documentElement.dataset[language === 'en' ? 'titleEn' : 'titleZh'];
    if (title) doc.title = title;
    if (typeof window !== 'undefined' && typeof window._updateAIPrompt === 'function') {
      window._updateAIPrompt(language);
    }
    updateButton(button || doc.querySelector('.site-language-toggle'), language);
    return language;
  }

  function writeLanguage(storage, language) {
    try {
      if (storage) storage.setItem(STORAGE_KEY, language);
    } catch (_) {}
  }

  function toggleLanguage(current, documentRef, storage, button) {
    const next = normalizeLanguage(current) === 'zh' ? 'en' : 'zh';
    applyLanguage(next, documentRef, button);
    writeLanguage(storage, next);
    return next;
  }

  function init(documentRef, storage) {
    const doc = documentRef || document;
    const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
    let button = doc.querySelector('.site-language-toggle');
    if (!button) {
      button = doc.createElement('button');
      button.type = 'button';
      button.className = 'site-language-toggle';
      doc.body.appendChild(button);
    }
    if (button.dataset.languageBound !== 'true') {
      button.dataset.languageBound = 'true';
      button.addEventListener('click', function () {
        const current = doc.documentElement.getAttribute('data-current-lang') || 'zh';
        toggleLanguage(current, doc, store, button);
      });
    }
    return applyLanguage(readLanguage(store), doc, button);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { init(document); });
    } else {
      init(document);
    }
  }

  return { STORAGE_KEY, normalizeLanguage, readLanguage, applyLanguage, toggleLanguage, init };
});
