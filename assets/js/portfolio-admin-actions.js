(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PortfolioAdminActions = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const sections = ['graphic', 'ai-store', '3d'];

  function normalizePath(value) {
    return String(value || '').replace(/\\/g, '/').replace(/^\.\.\//, '');
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeOrders(items) {
    sections.forEach(function (section) {
      items.filter(function (item) { return item.section === section; })
        .sort(function (left, right) { return left.order - right.order; })
        .forEach(function (item, order) { item.order = order; });
    });
    return items;
  }

  function idBase(name) {
    const stem = String(name || 'work').replace(/\.[^.]+$/, '');
    const slug = stem.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return 'managed-' + (slug || 'work');
  }

  function availableId(items, name) {
    const used = new Set(items.map(function (item) { return item.id; }));
    const base = idBase(name);
    let id = base;
    let suffix = 2;
    while (used.has(id)) {
      id = base + '-' + suffix;
      suffix += 1;
    }
    return id;
  }

  function addMediaToManifest(items, media, section) {
    if (!sections.includes(section)) throw new Error('未知的作品区域');
    const safePath = normalizePath(media && media.path);
    if (!safePath || !['image', 'video'].includes(media && media.mediaType)) {
      throw new Error('媒体信息不完整');
    }
    const current = clone(items || []);
    if (current.some(function (item) { return normalizePath(item.src) === safePath; })) {
      throw new Error('该媒体已在网页展示');
    }
    const work = {
      id: availableId(current, media.name),
      section: section,
      mediaType: media.mediaType,
      src: '../' + safePath,
      title: { zh: '', en: '' },
      order: current.filter(function (item) { return item.section === section; }).length,
    };
    return work;
  }

  function removeMediaFromManifest(items, mediaPath) {
    const safePath = normalizePath(mediaPath);
    const next = clone(items || []).filter(function (item) {
      return normalizePath(item.src) !== safePath;
    });
    return normalizeOrders(next);
  }

  return { addMediaToManifest: addMediaToManifest, removeMediaFromManifest: removeMediaFromManifest };
}));
