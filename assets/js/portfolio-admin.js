(function () {
  'use strict';

  const paths = {
    index: '../data/portfolio-media-index.json',
    manifest: '../data/graphic-works.json',
  };
  const sectionLabels = { graphic: '平面设计', 'ai-store': 'AI 商店', '3d': '3D' };
  const DRAFT_KEY = 'graphic-portfolio-draft-v1';

  function apiOrigin() {
    return String(window.PORTFOLIO_ADMIN_CONFIG && window.PORTFOLIO_ADMIN_CONFIG.apiOrigin || '').replace(/\/$/, '');
  }

  function apiUrl(path) { return apiOrigin() + path; }
  function authHeaders() { return window.PortfolioAdminAuth ? window.PortfolioAdminAuth.headers() : {}; }

  function assetUrl(mediaPath) {
    return '../' + mediaPath.split('/').map(encodeURIComponent).join('/');
  }

  function normalizePath(value) {
    return String(value || '').replace(/\\/g, '/').replace(/^\.\.\//, '');
  }

  function text(node, value) {
    node.textContent = value;
  }

  function createPreview(doc, item) {
    const wrap = doc.createElement('div');
    wrap.className = 'admin-preview';
    const media = doc.createElement(item.mediaType === 'video' ? 'video' : 'img');
    media.src = assetUrl(item.path);
    if (item.mediaType === 'video') {
      media.muted = true;
      media.preload = 'metadata';
      media.controls = true;
    } else {
      media.alt = item.name;
      media.loading = 'lazy';
    }
    media.addEventListener('error', function () {
      wrap.replaceChildren(Object.assign(doc.createElement('span'), {
        className: 'admin-preview-error',
        textContent: '媒体预览不可用',
      }));
    }, { once: true });
    wrap.appendChild(media);
    return wrap;
  }

  function loadJson(url) {
    return fetch(url).then(function (response) {
      if (!response.ok) throw new Error('无法读取 ' + url);
      return response.json();
    });
  }

  function manifestWithLocalDraft(manifest) {
    try {
      const raw = window.localStorage && window.localStorage.getItem(DRAFT_KEY);
      const draft = raw && JSON.parse(raw);
      const items = Array.isArray(draft) ? draft : draft && draft.items;
      if (Array.isArray(items)) return { version: 1, items: items };
    } catch (_) {}
    return manifest;
  }

  function start(doc) {
    const gallery = doc.getElementById('adminGallery');
    const status = doc.getElementById('adminStatus');
    const template = doc.getElementById('adminCardTemplate');
    const stats = doc.getElementById('adminStats');
    const filters = Array.from(doc.querySelectorAll('[data-filter]'));
    let store;
    let filter = 'all';
    let indexData;
    let manifestData;
    let directoryHandle;

    async function authorizeRemoteAdmin() {
      if (/^(127\.0\.0\.1|localhost)$/.test(window.location.hostname) || !apiOrigin()) return true;
      try {
        const response = await fetch(apiUrl('/api/session'), { credentials: 'include', headers: authHeaders() });
        if (response.ok && (await response.json()).authorized) return true;
      } catch (_) {}
      gallery.innerHTML = '<p class="admin-empty">此页面仅供作品管理员使用。请先登录 GitHub 后再继续。</p>';
      const login = doc.createElement('a');
      login.className = 'admin-back';
      login.href = apiUrl('/auth/login');
      login.textContent = '使用 GitHub 登录';
      gallery.appendChild(login);
      text(status, '需要管理员登录');
      return false;
    }

    function updateStats() {
      ['all', 'shown', 'unshown'].forEach(function (name) {
        text(stats.querySelector('[data-stat="' + name + '"]'), String(store.items(name).length));
      });
    }

    function rebuildStore() {
      store = window.PortfolioAdminStore.createAdminStore(indexData, manifestData);
      updateStats();
    }

    function isVideoGroupMember(item) {
      return manifestData.items.some(function (work) {
        return work.mediaType === 'video-group'
          && Array.isArray(work.sources)
          && work.sources.some(function (source) { return normalizePath(source) === item.path; });
      });
    }

    async function writeManifest(nextItems) {
      if (/^(127\.0\.0\.1|localhost)$/.test(window.location.hostname)) {
        try {
          const response = await fetch('/api/portfolio/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: nextItems }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || '保存失败');
          return Array.isArray(result.items) ? result.items : nextItems;
        } catch (error) {
          text(status, (error && error.message) || '没有保存成功，请稍后重试。');
          return null;
        }
      }
      if (apiOrigin()) {
        try {
          const response = await fetch(apiUrl('/api/portfolio/save'), {
            method: 'POST', credentials: 'include', headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
            body: JSON.stringify({ items: nextItems }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || '保存失败');
          return Array.isArray(result.items) ? result.items : nextItems;
        } catch (error) {
          text(status, (error && error.message) || '没有保存成功，请稍后重试。');
          return null;
        }
      }
      if (typeof window.showDirectoryPicker !== 'function') {
        text(status, '当前浏览器不支持直接保存，请在 Chrome 或 Edge 中打开。');
        return null;
      }
      try {
        directoryHandle = directoryHandle || await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
        const dataDirectory = await directoryHandle.getDirectoryHandle('data', { create: true });
        const manifestFile = await dataDirectory.getFileHandle('graphic-works.json', { create: true });
        const writable = await manifestFile.createWritable();
        await writable.write(JSON.stringify({ version: 1, items: nextItems }, null, 2));
        await writable.close();
        return nextItems;
      } catch (_) {
        directoryHandle = null;
        text(status, '没有保存：请重新选择网站项目根目录。');
        return null;
      }
    }

    async function updateVisibility(item, action, section) {
      if (action === 'remove' && isVideoGroupMember(item)) {
        text(status, '视频组请在主作品页面中管理，以避免误删同组视频。');
        return;
      }
      let nextItems;
      try {
        if (action === 'add') {
          const work = window.PortfolioAdminActions.addMediaToManifest(manifestData.items, item, section);
          nextItems = manifestData.items.concat([work]);
        } else {
          nextItems = window.PortfolioAdminActions.removeMediaFromManifest(manifestData.items, item.path);
        }
      } catch (error) {
        text(status, error.message || '无法更新展示状态。');
        return;
      }
      const savedItems = await writeManifest(nextItems);
      if (!savedItems) return;
      manifestData = { version: 1, items: savedItems };
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(manifestData));
      } catch (_) {}
      rebuildStore();
      render();
      text(status, action === 'add' ? '已加入展示并保存到本地项目。' : '已移出展示；原始媒体文件仍保留。');
    }

    async function deleteMedia(item) {
      if (!window.confirm('确定要彻底删除“' + item.name + '”吗？\n文件会移到 Windows 回收站，并从网站展示中移除。')) return;
      if (!/^(127\.0\.0\.1|localhost)$/.test(window.location.hostname) && !apiOrigin()) {
        text(status, '请先配置安全管理服务后再删除。');
        return;
      }
      try {
        const response = await fetch(apiUrl('/api/portfolio/delete'), {
          method: 'POST', credentials: apiOrigin() ? 'include' : 'same-origin',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
          body: JSON.stringify({ path: item.path }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '删除失败');
        manifestData = { version: 1, items: Array.isArray(result.items) ? result.items : [] };
        try {
          window.localStorage.setItem(DRAFT_KEY, JSON.stringify(manifestData));
        } catch (_) {}
        indexData = await loadJson(paths.index + '?t=' + Date.now());
        rebuildStore();
        render();
        text(status, apiOrigin() ? '已从 GitHub 仓库删除，并更新作品清单。' : '已移到本地回收站，并从作品清单中移除。');
      } catch (error) {
        text(status, (error && error.message) || '无法移到本地回收站。');
      }
    }

    function render() {
      const items = store.items(filter);
      gallery.replaceChildren();
      items.forEach(function (item) {
        const card = template.content.firstElementChild.cloneNode(true);
        card.classList.toggle('is-shown', item.shown);
        card.classList.toggle('is-video-group', isVideoGroupMember(item));
        card.querySelector('.admin-preview').replaceWith(createPreview(doc, item));
        text(card.querySelector('.admin-media-type'), item.mediaType);
        const badge = card.querySelector('.admin-badge');
        text(badge, item.shown ? '已展示' : '未展示');
        badge.classList.toggle('is-shown', item.shown);
        text(card.querySelector('.admin-name'), item.name);
        text(card.querySelector('.admin-path'), item.path);
        text(card.querySelector('.admin-sections'), item.shown
          ? '展示区域：' + item.sections.map(function (section) { return sectionLabels[section] || section; }).join('、')
          : '尚未展示在网页中');
        if (isVideoGroupMember(item)) {
          const note = doc.createElement('p');
          note.className = 'admin-card-note';
          note.textContent = '视频组请从主作品页面管理';
          card.querySelector('.admin-card-content').appendChild(note);
        }
        card.querySelector('[data-admin-action="add"]').addEventListener('click', function () {
          updateVisibility(item, 'add', card.querySelector('.admin-section-select').value);
        });
        card.querySelector('[data-admin-action="remove"]').addEventListener('click', function () {
          updateVisibility(item, 'remove');
        });
        card.querySelector('[data-admin-action="delete"]').addEventListener('click', function () {
          deleteMedia(item);
        });
        gallery.appendChild(card);
      });
      if (!items.length) {
        const empty = doc.createElement('p');
        empty.className = 'admin-empty';
        empty.textContent = '这个筛选下暂无作品';
        gallery.appendChild(empty);
      }
      filters.forEach(function (button) { button.classList.toggle('is-active', button.dataset.filter === filter); });
      text(status, '显示 ' + items.length + ' 个作品');
    }

    authorizeRemoteAdmin().then(function (allowed) {
      return allowed ? Promise.all([loadJson(paths.index), loadJson(paths.manifest)]) : null;
    }).then(function (result) {
      if (!result) return;
      indexData = result[0];
      manifestData = manifestWithLocalDraft(result[1]);
      rebuildStore();
      filters.forEach(function (button) {
        button.addEventListener('click', function () {
          filter = button.dataset.filter;
          render();
        });
      });
      render();
    }).catch(function () {
      text(status, '无法读取作品清单，请在本地网站预览中打开此页面。');
      gallery.innerHTML = '<p class=\"admin-empty\">作品后台暂时无法读取数据。</p>';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { start(document); });
  else start(document);
}());
