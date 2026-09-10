(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PortfolioAdminStore = api;
  }
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function normalizePath(value) {
    return String(value || '').replace(/\\/g, '/').replace(/^\.\.\//, '');
  }

  function createAdminStore(index, manifest) {
    const indexItems = Array.isArray(index) ? index : (index && Array.isArray(index.items) ? index.items : []);
    const works = manifest && Array.isArray(manifest.items) ? manifest.items : [];
    const shownByPath = new Map();

    works.forEach(function (work) {
      const sources = work.mediaType === 'video-group' ? work.sources : [work.src];
      (Array.isArray(sources) ? sources : []).forEach(function (source) {
        const mediaPath = normalizePath(source);
        if (!mediaPath) return;
        const sections = shownByPath.get(mediaPath) || new Set();
        sections.add(work.section);
        shownByPath.set(mediaPath, sections);
      });
    });

    const items = indexItems.map(function (item) {
      const mediaPath = normalizePath(item.path);
      const sections = Array.from(shownByPath.get(mediaPath) || []).sort();
      return {
        path: mediaPath,
        name: item.name || mediaPath.split('/').pop(),
        mediaType: item.mediaType,
        shown: sections.length > 0,
        sections: sections,
      };
    }).sort(function (left, right) {
      return left.path.localeCompare(right.path, 'en');
    });

    return {
      items: function (filter) {
        const selected = filter || 'all';
        if (!['all', 'shown', 'unshown'].includes(selected)) {
          throw new Error('未知的筛选状态：' + selected);
        }
        return items.filter(function (item) {
          return selected === 'all' || (selected === 'shown' ? item.shown : !item.shown);
        }).map(function (item) {
          return { ...item, sections: item.sections.slice() };
        });
      },
      statusFor: function (mediaPath) {
        const sections = Array.from(shownByPath.get(normalizePath(mediaPath)) || []).sort();
        return { shown: sections.length > 0, sections: sections };
      },
    };
  }

  return { createAdminStore: createAdminStore };
}));
