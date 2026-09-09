(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GraphicPortfolioManager = api;
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  const ACCEPTED_TYPES = Object.freeze([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/webm', 'video/mp4',
  ]);
  const ACCEPTED_TYPE_SET = new Set(ACCEPTED_TYPES);
  const ACCEPTED_EXTENSIONS = Object.freeze({
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
    'image/gif': ['gif'],
    'video/webm': ['webm'],
    'video/mp4': ['mp4'],
  });
  const MAX_FILE_BYTES = 50 * 1024 * 1024;

  const MESSAGES = Object.freeze({
    ready: { zh: '管理模式已就绪，改动只会保存在本地预览。', en: 'Management mode is ready; changes stay in this local preview.' },
    dirty: { zh: '有尚未保存的本地改动。', en: 'There are unsaved local changes.' },
    clean: { zh: '当前没有未保存的改动。', en: 'There are no unsaved changes.' },
    added: { zh: '作品已添加到本地预览。', en: 'Works were added to the local preview.' },
    partial: { zh: '部分文件未添加，请查看逐项结果。', en: 'Some files were not added; review the per-file results.' },
    removed: { zh: '作品已删除。', en: 'Work removed.' },
    undo: { zh: '撤销', en: 'Undo' },
    undoLabel: { zh: '撤销删除', en: 'Undo removal' },
    confirmRemove: { zh: '确定删除此作品吗？', en: 'Remove this work?' },
    confirmCancel: { zh: '确定取消编辑并丢弃本地改动吗？', en: 'Cancel editing and discard local changes?' },
    unavailable: { zh: '作品清单暂时无法加载，请稍后重试。', en: 'The portfolio manifest is unavailable. Please try again later.' },
    enterFailed: { zh: '无法进入管理模式。', en: 'Unable to enter management mode.' },
    sortFailed: { zh: '作品排序失败，请重试。', en: 'Unable to reorder the work. Please try again.' },
    sameSectionOnly: { zh: '作品只能在同一区域内排序。', en: 'Works can only be reordered within the same section.' },
    saved: { zh: '本地预览清单已导出，Blob 媒体仅在当前会话有效，尚未发布到 GitHub。', en: 'The local manifest was exported. Blob media remains valid only for this session and is not published to GitHub.' },
    saveFailed: { zh: '导出失败，请重试。', en: 'Export failed. Please try again.' },
    cancelled: { zh: '编辑已取消，本地改动已清除。', en: 'Editing was cancelled and local changes were cleared.' },
  });

  function validateFile(file) {
    const type = String(file && file.type || '').toLowerCase();
    if (!file || !ACCEPTED_TYPE_SET.has(type)) {
      return { ok: false, reason: 'unsupported-type' };
    }
    const match = String(file.name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    if (!match || !ACCEPTED_EXTENSIONS[type].includes(match[1])) {
      return { ok: false, reason: 'unsupported-extension' };
    }
    if (Number(file.size) > MAX_FILE_BYTES) {
      return { ok: false, reason: 'file-too-large' };
    }
    return { ok: true };
  }

  function getUrl(options) {
    return (options && options.URL) || (options && options.window && options.window.URL)
      || (typeof URL !== 'undefined' ? URL : null);
  }

  function downloadManifest(items, options) {
    const config = options || {};
    const doc = config.document || (typeof document !== 'undefined' ? document : null);
    const urlApi = getUrl(config);
    if (!doc || !urlApi || typeof urlApi.createObjectURL !== 'function') {
      throw new Error('当前环境不支持下载作品清单');
    }
    const BlobCtor = config.Blob || (typeof Blob !== 'undefined' ? Blob : null);
    if (!BlobCtor) throw new Error('当前环境不支持生成作品清单');
    const manifestItems = Array.isArray(items) ? items : [];
    const pendingFiles = config.pendingFiles;
    const pendingFileSummaries = manifestItems.reduce(function (summaries, item) {
      const file = pendingFiles && typeof pendingFiles.get === 'function' ? pendingFiles.get(item.id) : null;
      if (file) {
        summaries.push({
          id: item.id,
          name: String(file.name || ''),
          type: String(file.type || ''),
          size: Number(file.size) || 0,
          section: item.section,
          title: item.title && typeof item.title === 'object'
            ? { zh: String(item.title.zh || ''), en: String(item.title.en || '') }
            : { zh: '', en: '' },
        });
      }
      return summaries;
    }, []);
    const payload = JSON.stringify({
      version: 1,
      items: manifestItems,
      pendingFiles: pendingFileSummaries,
      notice: {
        zh: 'Blob 媒体地址仅用于当前会话预览；请根据 pendingFiles 摘要手动上传对应文件并替换地址。文件尚未写入项目，也未发布。',
        en: 'Blob media URLs are previews for this session only; use the pendingFiles summaries to upload each file and replace its URL. Files are not written to the project or published.',
      },
    }, null, 2);
    const blob = new BlobCtor([payload], { type: 'application/json;charset=utf-8' });
    const objectUrl = urlApi.createObjectURL(blob);
    const link = doc.createElement('a');
    link.href = objectUrl;
    link.download = config.filename || 'graphic-works.local.json';
    if (doc.body && typeof doc.body.appendChild === 'function') doc.body.appendChild(link);
    if (typeof link.click === 'function') link.click();
    if (typeof link.remove === 'function') link.remove();
    if (typeof urlApi.revokeObjectURL === 'function') {
      const schedule = config.setTimeout || (typeof setTimeout !== 'undefined' ? setTimeout : null);
      if (schedule) schedule(function () { urlApi.revokeObjectURL(objectUrl); }, 1000);
    }
    return link;
  }

  function createPortfolioManager(options) {
    const config = options || {};
    const doc = config.document || (typeof document !== 'undefined' ? document : null);
    const win = config.window || (typeof window !== 'undefined' ? window : null);
    let renderer = config.renderer || null;
    let store = config.store || null;
    let editing = false;
    let uploadFiles = [];
    const pendingUrls = new Map();
    const pendingFiles = new Map();
    const removals = new Map();

    const find = function (names) {
      if (!doc || typeof doc.getElementById !== 'function') return null;
      for (const name of names) {
        const node = doc.getElementById(name);
        if (node) return node;
      }
      return null;
    };
    const nodes = {
      manage: find(['portfolioManageButton']),
      panel: find(['portfolioManager']),
      uploadButton: find(['portfolioUploadButton']),
      uploadInput: find(['portfolioUploadInput']),
      save: find(['portfolioSaveButton']),
      cancel: find(['portfolioCancelButton']),
      dialog: find(['portfolioUploadDialog']),
      form: find(['portfolioUploadForm']),
      section: find(['portfolioSectionSelect', 'portfolioUploadSection']),
      titleZh: find(['portfolioTitleZh']),
      titleEn: find(['portfolioTitleEn']),
      uploadConfirm: find(['portfolioUploadConfirm', 'portfolioUploadConfirmButton']),
      uploadCancel: find(['portfolioUploadCancel', 'portfolioUploadCancelButton']),
      status: find(['portfolioStatus', 'portfolioManagerStatus']),
      empty: find(['portfolioEmptyState']),
      toast: find(['portfolioToast']),
      fileList: find(['portfolioUploadFileList']),
      language: find(['langBtn']),
    };

    function getLanguage() {
      const root = doc && doc.documentElement;
      const value = root && typeof root.getAttribute === 'function' ? root.getAttribute('data-current-lang') : '';
      return value === 'en' || (doc && doc.body?.classList?.contains('lang-en')) ? 'en' : 'zh';
    }
    function localized(key) {
      const pair = MESSAGES[key] || MESSAGES.saveFailed;
      return pair[getLanguage()];
    }
    function setLocalizedText(node, zh, en) {
      if (!node) return;
      node.setAttribute('data-lang-zh', zh);
      node.setAttribute('data-lang-en', en);
      node.textContent = getLanguage() === 'en' ? en : zh;
    }

    function getStore() {
      if (typeof config.getStore === 'function') return config.getStore();
      return store || (win && win.graphicPortfolioStore) || null;
    }
    function getRenderer() {
      return renderer || (win && win.graphicPortfolioRenderer) || null;
    }
    function setHidden(node, value) { if (node) node.hidden = Boolean(value); }
    function setStatus(key) {
      const pair = MESSAGES[key] || MESSAGES.saveFailed;
      setLocalizedText(nodes.status, pair.zh, pair.en);
    }
    function refreshDirtyStatus(cleanKey) {
      const activeStore = getStore();
      const dirty = Boolean(activeStore && activeStore.isDirty && activeStore.isDirty());
      if (nodes.status) nodes.status.dataset.dirty = String(dirty);
      setStatus(dirty ? 'dirty' : (cleanKey || 'clean'));
    }
    function confirmAction(key) {
      const confirmFn = (win && typeof win.confirm === 'function' && win.confirm.bind(win))
        || (typeof confirm === 'function' ? confirm : null);
      return confirmFn ? confirmFn(localized(key)) : true;
    }
    function render() {
      const activeStore = getStore();
      const activeRenderer = getRenderer();
      if (!activeStore || !activeRenderer || typeof activeRenderer.render !== 'function') return;
      activeRenderer.render(activeStore.items(), {
        editing,
        onRemove: remove,
        onMove: move,
      });
      if (nodes.empty) nodes.empty.hidden = activeStore.items().length !== 0;
    }
    function releaseUrl(url) {
      const urlApi = getUrl(config);
      if (url && urlApi && typeof urlApi.revokeObjectURL === 'function') urlApi.revokeObjectURL(url);
    }
    function releaseAllPending() {
      const urls = new Set();
      pendingUrls.forEach(function (url) { urls.add(url); });
      removals.forEach(function (removal) { if (removal.url) urls.add(removal.url); });
      urls.forEach(releaseUrl);
      pendingUrls.clear();
      pendingFiles.clear();
      removals.clear();
    }
    function reconcilePending(visibleItems) {
      const visibleById = new Map((visibleItems || []).map(function (item) { return [item.id, item]; }));
      pendingUrls.forEach(function (url, id) {
        const visible = visibleById.get(id);
        if (!visible || visible.src !== url) {
          releaseUrl(url);
          pendingUrls.delete(id);
          pendingFiles.delete(id);
        }
      });
      removals.forEach(function (removal) {
        const visible = visibleById.get(removal.id);
        if (visible && removal.url && visible.src === removal.url) {
          pendingUrls.set(removal.id, removal.url);
          if (removal.file) pendingFiles.set(removal.id, removal.file);
        } else if (removal.url) {
          releaseUrl(removal.url);
        }
      });
      removals.clear();
    }
    function closeDialog() {
      if (!nodes.dialog) return;
      if (typeof nodes.dialog.close === 'function') nodes.dialog.close();
      else nodes.dialog.hidden = true;
    }
    function resetDialog() {
      uploadFiles = [];
      if (nodes.uploadInput) nodes.uploadInput.value = '';
      if (nodes.titleZh) nodes.titleZh.value = '';
      if (nodes.titleEn) nodes.titleEn.value = '';
      renderFileResults([]);
      closeDialog();
    }
    function hideToast() {
      if (!nodes.toast) return;
      while (nodes.toast.firstChild && typeof nodes.toast.removeChild === 'function') nodes.toast.removeChild(nodes.toast.firstChild);
      setHidden(nodes.toast, true);
    }
    function openDialog() {
      if (!nodes.dialog) return;
      if (nodes.section && !nodes.section.value) nodes.section.value = 'graphic';
      uploadFiles = [];
      renderFileResults([]);
      if (typeof nodes.dialog.showModal === 'function') {
        try { nodes.dialog.showModal(); } catch (_) { nodes.dialog.hidden = false; }
      } else nodes.dialog.hidden = false;
    }
    function fileResultText(result) {
      const name = result.name || '未命名文件';
      const reasons = {
        'file-too-large': { zh: '文件超过 50 MiB', en: 'file exceeds 50 MiB' },
        'unsupported-type': { zh: '不支持的 MIME 类型', en: 'unsupported MIME type' },
        'unsupported-extension': { zh: '不支持的文件扩展名', en: 'unsupported file extension' },
        'object-url-unavailable': { zh: '浏览器无法创建本地预览', en: 'browser cannot create a local preview' },
      };
      if (result.status === 'ready') return { zh: name + '：待添加', en: name + ': ready to add' };
      if (result.status === 'added') return { zh: name + '：已添加', en: name + ': added' };
      const reason = reasons[result.reason] || { zh: '添加失败', en: 'failed to add' };
      return { zh: name + '：' + reason.zh, en: name + ': ' + reason.en };
    }
    function renderFileResults(results) {
      if (!nodes.fileList) return;
      while (nodes.fileList.firstChild && typeof nodes.fileList.removeChild === 'function') {
        nodes.fileList.removeChild(nodes.fileList.firstChild);
      }
      results.forEach(function (result) {
        const row = doc.createElement('div');
        row.setAttribute('role', 'listitem');
        row.setAttribute('data-upload-status', result.status);
        const copy = fileResultText(result);
        setLocalizedText(row, copy.zh, copy.en);
        nodes.fileList.appendChild(row);
      });
    }
    function chooseFiles(event) {
      uploadFiles = Array.from((event && event.target && event.target.files) || (nodes.uploadInput && nodes.uploadInput.files) || []);
      renderFileResults(uploadFiles.map(function (file) {
        const result = validateFile(file);
        return result.ok
          ? { name: file.name || '未命名文件', status: 'ready' }
          : { name: file.name || '未命名文件', status: 'error', reason: result.reason };
      }));
    }
    function newId() {
      const cryptoApi = config.crypto || (win && win.crypto) || (typeof crypto !== 'undefined' ? crypto : null);
      if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return 'local-' + cryptoApi.randomUUID();
      return 'local-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    }
    function addFiles(event) {
      event && typeof event.preventDefault === 'function' && event.preventDefault();
      const activeStore = getStore();
      if (!activeStore || !editing) return;
      const section = nodes.section && nodes.section.value ? nodes.section.value : 'graphic';
      const title = {
        zh: nodes.titleZh && typeof nodes.titleZh.value === 'string' ? nodes.titleZh.value.trim() : '',
        en: nodes.titleEn && typeof nodes.titleEn.value === 'string' ? nodes.titleEn.value.trim() : '',
      };
      const results = [];
      uploadFiles.forEach(function (file) {
        const result = validateFile(file);
        if (!result.ok) {
          results.push({ name: file.name || '未命名文件', status: 'error', reason: result.reason });
          return;
        }
        const urlApi = getUrl(config);
        if (!urlApi || typeof urlApi.createObjectURL !== 'function') {
          results.push({ name: file.name || '未命名文件', status: 'error', reason: 'object-url-unavailable' });
          return;
        }
        const src = urlApi.createObjectURL(file);
        const id = newId();
        const currentItems = activeStore.items(section);
        const work = {
          id,
          section,
          mediaType: String(file.type).toLowerCase().indexOf('video/') === 0 ? 'video' : 'image',
          src,
          title: { zh: title.zh, en: title.en },
          order: currentItems.length,
        };
        try {
          activeStore.add(work);
          pendingUrls.set(id, src);
          pendingFiles.set(id, file);
          results.push({ name: file.name || '未命名文件', status: 'added' });
        } catch (error) {
          releaseUrl(src);
          results.push({ name: file.name || '未命名文件', status: 'error', reason: 'add-failed' });
        }
      });
      uploadFiles = [];
      renderFileResults(results);
      render();
      const hasErrors = results.some(function (result) { return result.status === 'error'; });
      refreshDirtyStatus(hasErrors ? 'partial' : 'added');
    }
    function remove(id) {
      const activeStore = getStore();
      if (!activeStore || !confirmAction('confirmRemove')) return;
      const token = activeStore.remove(id);
      const url = pendingUrls.get(id);
      const file = pendingFiles.get(id);
      pendingUrls.delete(id);
      pendingFiles.delete(id);
      const removal = { id, url, file, token };
      removals.set(token, removal);
      showUndoToast(removal);
      render();
      refreshDirtyStatus();
    }
    function showUndoToast(removal) {
      if (!nodes.toast) return;
      while (nodes.toast.firstChild && typeof nodes.toast.removeChild === 'function') nodes.toast.removeChild(nodes.toast.firstChild);
      const message = doc.createElement('span');
      setLocalizedText(message, MESSAGES.removed.zh, MESSAGES.removed.en);
      nodes.toast.appendChild(message);
      const undo = doc.createElement('button');
      undo.type = 'button';
      undo.setAttribute('data-aria-label-zh', MESSAGES.undoLabel.zh);
      undo.setAttribute('data-aria-label-en', MESSAGES.undoLabel.en);
      undo.setAttribute('aria-label', localized('undoLabel'));
      setLocalizedText(undo, MESSAGES.undo.zh, MESSAGES.undo.en);
      undo.addEventListener('click', function () {
        const activeStore = getStore();
        if (!activeStore || !removals.has(removal.token)) return;
        activeStore.undo(removal.token);
        if (removal.url) pendingUrls.set(removal.id, removal.url);
        if (removal.file) pendingFiles.set(removal.id, removal.file);
        removals.delete(removal.token);
        setHidden(nodes.toast, true);
        render();
        refreshDirtyStatus();
      });
      nodes.toast.appendChild(undo);
      setHidden(nodes.toast, false);
    }
    function move(id, sourceSection, targetSection, index) {
      const activeStore = getStore();
      if (!activeStore) return;
      if (sourceSection !== targetSection) {
        setStatus('sameSectionOnly');
        return;
      }
      try {
        activeStore.move(id, sourceSection, targetSection, Math.max(0, Math.trunc(Number(index) || 0)));
        render();
        refreshDirtyStatus();
      } catch (_) { setStatus('sortFailed'); }
    }
    function enter() {
      if (editing) return true;
      const activeStore = getStore();
      if (!activeStore) { setStatus('unavailable'); return false; }
      store = activeStore;
      try { activeStore.begin(); } catch (_) { setStatus('enterFailed'); return false; }
      editing = true;
      setHidden(nodes.panel, false);
      if (nodes.panel) nodes.panel.classList && nodes.panel.classList.add('is-active');
      render();
      refreshDirtyStatus('ready');
      return true;
    }
    function cancel() {
      const activeStore = getStore();
      if (!editing || !confirmAction('confirmCancel')) return false;
      const snapshot = activeStore ? activeStore.cancel() : [];
      reconcilePending(snapshot);
      editing = false;
      resetDialog();
      hideToast();
      setHidden(nodes.panel, true);
      if (nodes.panel && nodes.panel.classList) nodes.panel.classList.remove('is-active');
      render();
      refreshDirtyStatus('cancelled');
      return true;
    }
    function save() {
      const activeStore = getStore();
      if (!editing || !activeStore || nodes.save && nodes.save.disabled) return false;
      if (nodes.save) nodes.save.disabled = true;
      try {
        downloadManifest(activeStore.items(), {
          document: doc,
          URL: getUrl(config),
          Blob: config.Blob,
          pendingFiles,
          setTimeout: config.setTimeout,
        });
        const snapshot = activeStore.commit();
        reconcilePending(snapshot);
        editing = false;
        resetDialog();
        hideToast();
        setHidden(nodes.panel, true);
        if (nodes.panel && nodes.panel.classList) nodes.panel.classList.remove('is-active');
        render();
        refreshDirtyStatus('saved');
        return true;
      } catch (_) {
        setStatus('saveFailed');
        return false;
      } finally {
        if (nodes.save) nodes.save.disabled = false;
      }
    }
    function beforeUnload(event) {
      const activeStore = getStore();
      if (activeStore && activeStore.isDirty && activeStore.isDirty()) event.returnValue = '';
    }
    function bind() {
      if (nodes.manage) nodes.manage.addEventListener('click', function () { editing ? cancel() : enter(); });
      if (nodes.uploadButton) nodes.uploadButton.addEventListener('click', openDialog);
      if (nodes.uploadInput) nodes.uploadInput.addEventListener('change', chooseFiles);
      if (nodes.form) nodes.form.addEventListener('submit', addFiles);
      if (nodes.uploadConfirm) nodes.uploadConfirm.addEventListener('click', addFiles);
      if (nodes.uploadCancel) nodes.uploadCancel.addEventListener('click', closeDialog);
      if (nodes.save) nodes.save.addEventListener('click', save);
      if (nodes.cancel) nodes.cancel.addEventListener('click', cancel);
      if (nodes.language) nodes.language.addEventListener('click', function () {
        const schedule = config.setTimeout || (win && win.setTimeout) || (typeof setTimeout !== 'undefined' ? setTimeout : null);
        if (schedule) schedule(function () { render(); }, 0);
        else render();
      });
      if (win && typeof win.addEventListener === 'function') {
        win.addEventListener('beforeunload', beforeUnload);
        win.addEventListener('pagehide', releaseAllPending);
        win.addEventListener('unload', releaseAllPending);
      }
    }
    bind();
    return {
      enter,
      cancel,
      save,
      render,
      cleanup: releaseAllPending,
      openUpload: openDialog,
      handleUpload: addFiles,
      setStore: function (nextStore) {
        if (store === nextStore) return;
        store = nextStore;
        render();
      },
      getPendingFile: function (id) { return pendingFiles.get(id); },
      isEditing: function () { return editing; },
    };
  }

  return { ACCEPTED_TYPES, ACCEPTED_EXTENSIONS, MAX_FILE_BYTES, MESSAGES, validateFile, downloadManifest, createPortfolioManager };
}));
