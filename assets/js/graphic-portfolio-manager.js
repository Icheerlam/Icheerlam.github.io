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
  const MAX_FILE_BYTES = 50 * 1024 * 1024;

  function validateFile(file) {
    if (!file || !ACCEPTED_TYPE_SET.has(String(file.type || '').toLowerCase())) {
      return { ok: false, reason: 'unsupported-type' };
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

  function downloadManifest(works, options) {
    const config = options || {};
    const doc = config.document || (typeof document !== 'undefined' ? document : null);
    const urlApi = getUrl(config);
    if (!doc || !urlApi || typeof urlApi.createObjectURL !== 'function') {
      throw new Error('当前环境不支持下载作品清单');
    }
    const BlobCtor = config.Blob || (typeof Blob !== 'undefined' ? Blob : null);
    if (!BlobCtor) throw new Error('当前环境不支持生成作品清单');
    const payload = JSON.stringify({ version: 1, works: Array.isArray(works) ? works : [] }, null, 2);
    const blob = new BlobCtor([payload], { type: 'application/json;charset=utf-8' });
    const objectUrl = urlApi.createObjectURL(blob);
    const link = doc.createElement('a');
    link.href = objectUrl;
    link.download = config.filename || 'graphic-works.local.json';
    if (doc.body && typeof doc.body.appendChild === 'function') doc.body.appendChild(link);
    if (typeof link.click === 'function') link.click();
    if (typeof link.remove === 'function') link.remove();
    if (typeof urlApi.revokeObjectURL === 'function') urlApi.revokeObjectURL(objectUrl);
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
    const removals = new Map();
    const schedule = config.setTimeout || (typeof setTimeout !== 'undefined' ? setTimeout : function () { return null; });
    const unschedule = config.clearTimeout || (typeof clearTimeout !== 'undefined' ? clearTimeout : function () {});

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
    };

    function getStore() {
      if (typeof config.getStore === 'function') return config.getStore();
      return store || (win && win.graphicPortfolioStore) || null;
    }
    function getRenderer() {
      return renderer || (win && win.graphicPortfolioRenderer) || null;
    }
    function setHidden(node, value) { if (node) node.hidden = Boolean(value); }
    function setStatus(message) { if (nodes.status) nodes.status.textContent = message || ''; }
    function confirmAction(message) {
      const confirmFn = (win && typeof win.confirm === 'function' && win.confirm.bind(win))
        || (typeof confirm === 'function' ? confirm : null);
      return confirmFn ? confirmFn(message) : true;
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
    function releasePending() {
      pendingUrls.forEach(function (url) { releaseUrl(url); });
      pendingUrls.clear();
      removals.forEach(function (removal) {
        if (removal.timer) unschedule(removal.timer);
        if (removal.url) releaseUrl(removal.url);
      });
      removals.clear();
    }
    function closeDialog() {
      if (!nodes.dialog) return;
      if (typeof nodes.dialog.close === 'function') nodes.dialog.close();
      else nodes.dialog.hidden = true;
    }
    function openDialog() {
      if (!nodes.dialog) return;
      if (nodes.section && !nodes.section.value) nodes.section.value = 'graphic';
      uploadFiles = [];
      renderFileErrors([]);
      if (typeof nodes.dialog.showModal === 'function') {
        try { nodes.dialog.showModal(); } catch (_) { nodes.dialog.hidden = false; }
      } else nodes.dialog.hidden = false;
    }
    function renderFileErrors(errors) {
      if (!nodes.fileList) return;
      while (nodes.fileList.firstChild && typeof nodes.fileList.removeChild === 'function') {
        nodes.fileList.removeChild(nodes.fileList.firstChild);
      }
      errors.forEach(function (error) {
        const row = doc.createElement('div');
        row.setAttribute('role', 'listitem');
        row.textContent = error.name + '：' + (error.reason === 'file-too-large' ? '文件超过 50 MiB' : '不支持的文件类型');
        nodes.fileList.appendChild(row);
      });
    }
    function chooseFiles(event) {
      uploadFiles = Array.from((event && event.target && event.target.files) || (nodes.uploadInput && nodes.uploadInput.files) || []);
      renderFileErrors(uploadFiles.map(function (file) {
        const result = validateFile(file);
        return result.ok ? null : { name: file.name || '未命名文件', reason: result.reason };
      }).filter(Boolean));
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
      const errors = [];
      uploadFiles.forEach(function (file) {
        const result = validateFile(file);
        if (!result.ok) {
          errors.push({ name: file.name || '未命名文件', reason: result.reason });
          return;
        }
        const urlApi = getUrl(config);
        if (!urlApi || typeof urlApi.createObjectURL !== 'function') {
          errors.push({ name: file.name || '未命名文件', reason: 'unsupported-type' });
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
        Object.defineProperty(work, 'pendingFile', { value: file, enumerable: false, configurable: true });
        try {
          activeStore.add(work);
          pendingUrls.set(id, src);
        } catch (error) {
          releaseUrl(src);
          errors.push({ name: file.name || '未命名文件', reason: error.message || '上传失败' });
        }
      });
      uploadFiles = [];
      renderFileErrors(errors);
      render();
      if (!errors.length) closeDialog();
      setStatus(errors.length ? '部分文件未添加，请检查上传列表。' : '作品已添加到本地预览。');
    }
    function remove(id) {
      const activeStore = getStore();
      if (!activeStore || !confirmAction('确定删除此作品吗？')) return;
      const token = activeStore.remove(id);
      const url = pendingUrls.get(id);
      pendingUrls.delete(id);
      const removal = { id, url, token, timer: null };
      removal.timer = schedule(function () {
        if (removals.get(token) === removal) {
          removals.delete(token);
          releaseUrl(url);
        }
      }, 8000);
      removals.set(token, removal);
      showUndoToast(removal);
      render();
    }
    function showUndoToast(removal) {
      if (!nodes.toast) return;
      while (nodes.toast.firstChild && typeof nodes.toast.removeChild === 'function') nodes.toast.removeChild(nodes.toast.firstChild);
      const message = doc.createElement('span');
      message.textContent = '作品已删除。';
      nodes.toast.appendChild(message);
      const undo = doc.createElement('button');
      undo.type = 'button';
      undo.setAttribute('aria-label', '撤销删除');
      undo.textContent = '撤销';
      undo.addEventListener('click', function () {
        const activeStore = getStore();
        if (!activeStore || !removals.has(removal.token)) return;
        if (removal.timer) unschedule(removal.timer);
        activeStore.undo(removal.token);
        if (removal.url) pendingUrls.set(removal.id, removal.url);
        removals.delete(removal.token);
        setHidden(nodes.toast, true);
        render();
      });
      nodes.toast.appendChild(undo);
      setHidden(nodes.toast, false);
    }
    function move(id, section, index) {
      const activeStore = getStore();
      if (!activeStore) return;
      try { activeStore.move(id, section, Math.max(0, Math.trunc(Number(index) || 0))); render(); } catch (_) { setStatus('作品排序失败，请重试。'); }
    }
    function enter() {
      const activeStore = getStore();
      if (!activeStore) { setStatus('作品清单暂时无法加载，请稍后重试。'); return false; }
      store = activeStore;
      try { activeStore.begin(); } catch (error) { setStatus(error.message || '无法进入管理模式。'); return false; }
      editing = true;
      setHidden(nodes.panel, false);
      if (nodes.panel) nodes.panel.classList && nodes.panel.classList.add('is-active');
      render();
      setStatus('管理模式已就绪，改动只会保存在本地预览。');
      return true;
    }
    function cancel() {
      const activeStore = getStore();
      if (!editing || !confirmAction('确定取消编辑并丢弃本地改动吗？')) return false;
      releasePending();
      if (activeStore) activeStore.cancel();
      editing = false;
      closeDialog();
      setHidden(nodes.panel, true);
      if (nodes.panel && nodes.panel.classList) nodes.panel.classList.remove('is-active');
      render();
      return true;
    }
    function save() {
      const activeStore = getStore();
      if (!editing || !activeStore || nodes.save && nodes.save.disabled) return false;
      if (nodes.save) nodes.save.disabled = true;
      try {
        downloadManifest(activeStore.items(), { document: doc, URL: getUrl(config) });
        activeStore.commit();
        releasePending();
        editing = false;
        setHidden(nodes.panel, true);
        if (nodes.panel && nodes.panel.classList) nodes.panel.classList.remove('is-active');
        render();
        setStatus('本地预览已导出，尚未发布到 GitHub');
        return true;
      } catch (error) {
        setStatus(error.message || '导出失败，请重试。');
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
      if (win && typeof win.addEventListener === 'function') {
        win.addEventListener('beforeunload', beforeUnload);
        win.addEventListener('pagehide', releasePending);
        win.addEventListener('unload', releasePending);
      }
    }
    bind();
    return {
      enter,
      cancel,
      save,
      render,
      cleanup: releasePending,
      openUpload: openDialog,
      handleUpload: addFiles,
      setStore: function (nextStore) { store = nextStore; render(); },
      isEditing: function () { return editing; },
    };
  }

  return { ACCEPTED_TYPES, MAX_FILE_BYTES, validateFile, downloadManifest, createPortfolioManager };
}));
