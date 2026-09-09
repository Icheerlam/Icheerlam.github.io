(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.GraphicPortfolioStore = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
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
      .sort(function (left, right) { return left.order - right.order; })
      .forEach(function (item, index) { item.order = index; });
  }

  function normalizeAll(items) {
    sections.forEach(function (section) { normalize(items, section); });
    return items;
  }

  function createPortfolioStore(initialItems) {
    if (!Array.isArray(initialItems)) {
      throw new TypeError('initialItems 必须是数组');
    }

    const seenIds = new Set();
    let current = clone(initialItems);
    current.forEach(function (item) {
      validateSection(item.section);
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
        editing = true;
        removals.clear();
        return this.items();
      },

      items: function (section) {
        if (section === undefined) {
          return clone(current);
        }
        validateSection(section);
        return clone(ordered(section));
      },

      add: function (item) {
        requireDraft();
        if (!item || typeof item !== 'object') {
          throw new TypeError('作品必须是对象');
        }
        validateSection(item.section);
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
        removals.delete(token);
        const restored = clone(removal.item);
        current.splice(Math.min(removal.index, current.length), 0, restored);
        place(restored, removal.section, removal.order);
        return clone(restored);
      },

      move: function (id, section, index) {
        requireDraft();
        validateSection(section);
        const item = findItem(id);
        const previousSection = item.section;
        place(item, section, index);
        if (previousSection !== section) {
          normalize(current, previousSection);
        }
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
        return clone(current);
      },

      isDirty: function () {
        return JSON.stringify(current) !== JSON.stringify(baseline);
      },
    };
  }

  return { createPortfolioStore: createPortfolioStore };
}));
