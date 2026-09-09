(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.GraphicPortfolioStore = api;
  }
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  const sections = new Set(['graphic', 'ai-store', '3d']);

  function clone(value) {
    if (Array.isArray(value)) {
      return value.map(clone);
    }
    if (value && typeof value === 'object') {
      return Object.keys(value).reduce(function (copy, key) {
        copy[key] = clone(value[key]);
        return copy;
      }, {});
    }
    return value;
  }

  function validateSection(section) {
    if (!sections.has(section)) {
      throw new Error('未知的作品区域 section：' + section);
    }
  }

  function normalize(items, section) {
    items
      .filter(function (item) { return item.section === section; })
      .sort(function (left, right) { return Number(left.order) - Number(right.order); })
      .forEach(function (item, index) { item.order = index; });
  }

  function normalizeAll(items) {
    sections.forEach(function (section) { normalize(items, section); });
    return items;
  }

  function orderedAll(items) {
    return Array.from(sections).reduce(function (result, section) {
      return result.concat(items
        .filter(function (item) { return item.section === section; })
        .sort(function (left, right) { return left.order - right.order; }));
    }, []);
  }

  function validateWork(item) {
    if (!item || typeof item !== 'object') {
      throw new TypeError('作品必须是对象');
    }
    if (typeof item.id !== 'string' || !/^[a-z0-9-]+$/.test(item.id)) {
      throw new Error('作品 id 必须是非空的小写字母、数字或连字符');
    }
    validateSection(item.section);
    if (!Number.isFinite(item.order)) {
      throw new Error('作品 order 必须是有限数值');
    }
    if (!['image', 'video', 'video-group'].includes(item.mediaType)) {
      throw new Error('不支持的 mediaType：' + item.mediaType);
    }
    if (item.mediaType === 'video-group') {
      if (!Array.isArray(item.sources) || item.sources.length < 2 || item.sources.some(function (source) {
        return typeof source !== 'string' || source.trim() === '';
      })) {
        throw new Error('video-group 的 sources 至少需要两个条目');
      }
      if ('src' in item) {
        throw new Error('video-group 不能包含 src');
      }
      return;
    }
    if (typeof item.src !== 'string' || item.src.trim() === '') {
      throw new Error(item.mediaType + ' 必须包含非空 src');
    }
    if ('sources' in item) {
      throw new Error(item.mediaType + ' 不能包含 sources');
    }
  }

  function createPortfolioStore(initialItems) {
    if (!Array.isArray(initialItems)) {
      throw new TypeError('initialItems 必须是数组');
    }

    const seenIds = new Set();
    let current = clone(initialItems);
    current.forEach(function (item) {
      validateWork(item);
      if (seenIds.has(item.id)) {
        throw new Error('重复的作品 ID：' + item.id);
      }
      seenIds.add(item.id);
    });
    normalizeAll(current);

    let baseline = clone(current);
    let editing = false;
    let nextTokenId = 1;
    const removals = new Map();

    function requireDraft() {
      if (!editing) {
        throw new Error('请先调用 begin 开始草稿');
      }
    }

    function findItem(id) {
      const item = current.find(function (candidate) { return candidate.id === id; });
      if (!item) {
        throw new Error('未知的作品 ID：' + id);
      }
      return item;
    }

    function ordered(section, excludedItem) {
      return current
        .filter(function (item) { return item !== excludedItem && item.section === section; })
        .sort(function (left, right) { return left.order - right.order; });
    }

    function place(item, section, index) {
      validateSection(section);
      const destination = ordered(section, item);
      const numericIndex = Number.isFinite(Number(index)) ? Math.trunc(Number(index)) : destination.length;
      const clampedIndex = Math.max(0, Math.min(numericIndex, destination.length));
      destination.splice(clampedIndex, 0, item);
      item.section = section;
      destination.forEach(function (entry, order) { entry.order = order; });
    }

    return {
      begin: function () {
        current = clone(baseline);
        editing = true;
        removals.clear();
        return this.items();
      },

      items: function (section) {
        if (section === undefined) {
          return clone(orderedAll(current));
        }
        validateSection(section);
        return clone(ordered(section));
      },

      add: function (item) {
        requireDraft();
        validateWork(item);
        if (current.some(function (candidate) { return candidate.id === item.id; })) {
          throw new Error('重复的作品 ID：' + item.id);
        }
        const added = clone(item);
        current.push(added);
        place(added, added.section, added.order);
        return clone(added);
      },

      remove: function (id) {
        requireDraft();
        const item = findItem(id);
        const index = current.indexOf(item);
        const token = Object.freeze({ removalId: nextTokenId++ });
        removals.set(token, {
          item: clone(item),
          index: index,
          section: item.section,
          order: item.order,
        });
        current.splice(index, 1);
        normalize(current, item.section);
        return token;
      },

      undo: function (token) {
        requireDraft();
        const removal = removals.get(token);
        if (!removal) {
          throw new Error('无效或已消费的撤销 token');
        }
        if (current.some(function (item) { return item.id === removal.item.id; })) {
          throw new Error('Duplicate work id：' + removal.item.id);
        }
        removals.delete(token);
        const restored = clone(removal.item);
        current.splice(Math.min(removal.index, current.length), 0, restored);
        place(restored, removal.section, removal.order);
        return clone(restored);
      },

      move: function (id, sourceSection, targetSection, index) {
        requireDraft();
        validateSection(sourceSection);
        validateSection(targetSection);
        const item = findItem(id);
        if (item.section !== sourceSection) {
          throw new Error('作品 source section 与当前区域不一致');
        }
        if (sourceSection !== targetSection) {
          throw new Error('作品只能在同一区域内排序');
        }
        place(item, targetSection, index);
        return clone(item);
      },

      cancel: function () {
        current = clone(baseline);
        editing = false;
        removals.clear();
        return clone(current);
      },

      commit: function () {
        requireDraft();
        normalizeAll(current);
        baseline = clone(current);
        editing = false;
        removals.clear();
        return clone(orderedAll(current));
      },

      isDirty: function () {
        return JSON.stringify(current) !== JSON.stringify(baseline);
      },
    };
  }

  return { createPortfolioStore: createPortfolioStore };
}));
