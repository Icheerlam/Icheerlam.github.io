(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GraphicPortfolioRenderer = api;
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  const SECTION_ORDER = ['graphic', 'ai-store', '3d'];

  function createPortfolioRenderer(options) {
    const config = options || {};
    const doc = config.document || (typeof document !== 'undefined' ? document : null);
    if (!doc || typeof doc.createElement !== 'function') {
      throw new Error('渲染作品集需要可用的 document');
    }
    const containers = Object.assign({
      graphic: 'graphicGallery',
      'ai-store': 'aiStoreGallery',
      '3d': 'modelingGallery',
    }, config.containers || {});
    const getContainer = (section) => {
      const value = containers[section];
      return typeof value === 'string' ? doc.getElementById(value) : value;
    };
    const getLanguage = () => {
      if (typeof config.getLanguage === 'function') return config.getLanguage();
      if (typeof config.language === 'string') return config.language;
      const rootLanguage = doc.documentElement && typeof doc.documentElement.getAttribute === 'function'
        ? doc.documentElement.getAttribute('data-current-lang')
        : '';
      return rootLanguage || (doc.body?.classList && doc.body.classList.contains('lang-en') ? 'en' : 'zh');
    };
    const openMedia = typeof config.onOpenMedia === 'function' ? config.onOpenMedia : function () {};
    const mediaNodes = [];

    function text(value) {
      return typeof value === 'string' ? value : '';
    }

    function titleFor(work) {
      const title = work && work.title;
      if (typeof title === 'string') return title;
      if (!title || typeof title !== 'object') return '';
      const lang = getLanguage() === 'en' ? 'en' : 'zh';
      return text(title[lang]);
    }

    function addTitle(card, work) {
      const title = work && work.title;
      const zh = typeof title === 'string' ? title : text(title?.zh);
      const en = typeof title === 'string' ? title : text(title?.en);
      if (!zh && !en) return;
      const node = doc.createElement('div');
      node.className = work.section === '3d' ? 'c3d-title' : 'portfolio-title';
      node.setAttribute('data-lang-zh', zh);
      node.setAttribute('data-lang-en', en);
      node.textContent = titleFor(work);
      card.appendChild(node);
    }

    function addError(card, source) {
      if (card.querySelector && card.querySelector('.media-error')) return;
      const placeholder = doc.createElement('div');
      placeholder.className = 'media-error';
      placeholder.setAttribute('role', 'status');
      placeholder.setAttribute('data-source', source || '');
      placeholder.textContent = getLanguage() === 'en' ? 'MEDIA UNAVAILABLE' : '媒体暂不可用';
      card.appendChild(placeholder);
      card.classList.add('media-error-state');
    }

    function bindMedia(media, card, work, source, openable) {
      if (openable) {
        media.classList.add('img-clicker');
        media.addEventListener('click', function (event) {
          event.stopPropagation();
          openMedia({ work: work, element: media, src: source || media.currentSrc || media.src || '' });
        });
      }
      media.addEventListener('error', function () { addError(card, source); });
      mediaNodes.push(media);
    }

    function addImage(card, work, source) {
      const image = doc.createElement('img');
      image.src = source;
      image.loading = 'lazy';
      image.alt = titleFor(work);
      bindMedia(image, card, work, source, true);
      card.appendChild(image);
    }

    function addVideo(card, work, source, groupClass) {
      const video = doc.createElement('video');
      video.src = source;
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.controls = work.mediaType === 'video';
      if (groupClass) video.className = groupClass;
      bindMedia(video, card, work, source, false);
      card.appendChild(video);
    }

    function addManagement(card, work, index, callbacks) {
      if (!callbacks.editing) return;
      card.draggable = true;
      card.setAttribute('data-editing', 'true');
      card.addEventListener('dragstart', function (event) {
        card.classList.add('is-dragging');
        if (event.dataTransfer) event.dataTransfer.setData('text/plain', work.id);
      });
      card.addEventListener('dragend', function () { card.classList.remove('is-dragging'); });
      card.addEventListener('dragover', function (event) { event.preventDefault(); card.classList.add('drop-target'); });
      card.addEventListener('dragleave', function () { card.classList.remove('drop-target'); });
      card.addEventListener('drop', function (event) {
        event.preventDefault();
        card.classList.remove('drop-target');
        const draggedId = event.dataTransfer && event.dataTransfer.getData('text/plain');
        if (draggedId && draggedId !== work.id && typeof callbacks.onMove === 'function') {
          callbacks.onMove(draggedId, work.section, index, work);
        }
      });
      const handle = doc.createElement('span');
      handle.className = 'portfolio-drag-handle';
      handle.setAttribute('draggable', 'true');
      handle.setAttribute('aria-label', '拖拽移动作品');
      handle.textContent = '↕';
      card.appendChild(handle);
      const controls = doc.createElement('div');
      controls.className = 'portfolio-manage-controls';
      const remove = doc.createElement('button');
      remove.type = 'button';
      remove.className = 'portfolio-remove';
      remove.dataset.action = 'remove';
      remove.textContent = '删除';
      remove.addEventListener('click', function (event) {
        event.stopPropagation();
        if (typeof callbacks.onRemove === 'function') callbacks.onRemove(work.id, work);
      });
      controls.appendChild(remove);
      [['up', -1, '↑'], ['down', 1, '↓']].forEach(function (entry) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.dataset.action = `move-${entry[0]}`;
        button.textContent = entry[2];
        button.addEventListener('click', function (event) {
          event.stopPropagation();
          if (typeof callbacks.onMove === 'function') callbacks.onMove(work.id, work.section, index + entry[1], work);
        });
        controls.appendChild(button);
      });
      card.appendChild(controls);
    }

    function renderCard(work, index, callbacks) {
      const card = doc.createElement('article');
      card.className = work.section === '3d' ? 'card-3d interactable' : 'masonry-item interactable';
      card.dataset.workId = work.id;
      card.setAttribute('data-work-id', work.id);
      card.style.animationDelay = `${Math.min(index * 0.03 + 0.03, 0.96).toFixed(2)}s`;

      if (work.mediaType === 'image') {
        if (work.section === '3d') {
          const box = doc.createElement('div');
          box.className = 'img-box';
          addImage(box, work, work.src);
          card.appendChild(box);
        } else addImage(card, work, work.src);
      } else if (work.mediaType === 'video') {
        const box = doc.createElement('div');
        box.className = 'img-box';
        addVideo(box, work, work.src);
        card.appendChild(box);
      } else if (work.mediaType === 'video-group') {
        const wrapper = doc.createElement('div');
        wrapper.className = 'video-group-content';
        const videos = doc.createElement('div');
        videos.className = 'video-group-media';
        (work.sources || []).forEach(function (source, sourceIndex) {
          const pane = doc.createElement('div');
          pane.className = 'video-group-pane';
          pane.style.flex = sourceIndex === 0 ? '1.2' : '1';
          addVideo(pane, work, source);
          videos.appendChild(pane);
        });
        wrapper.appendChild(videos);
        card.appendChild(wrapper);
      }
      addTitle(card, work);
      addManagement(card, work, index, callbacks);
      return card;
    }

    function render(items, state) {
      const callbacks = state || {};
      mediaNodes.length = 0;
      SECTION_ORDER.forEach(function (section) {
        const container = getContainer(section);
        if (!container) return;
        while (container.firstChild) container.removeChild(container.firstChild);
        (Array.isArray(items) ? items : [])
          .filter(function (work) { return work && work.section === section; })
          .sort(function (left, right) { return Number(left.order) - Number(right.order); })
          .forEach(function (work, index) { container.appendChild(renderCard(work, index, callbacks)); });
      });
      const customEvent = doc.defaultView && doc.defaultView.CustomEvent
        ? doc.defaultView.CustomEvent
        : (typeof window !== 'undefined' && window.CustomEvent ? window.CustomEvent : null);
      if (doc.dispatchEvent && typeof customEvent === 'function') {
        doc.dispatchEvent(new customEvent('portfolio:rendered', { detail: { items: items || [], media: mediaNodes.slice() } }));
      }
      return { media: mediaNodes.slice() };
    }

    return { render: render, getMediaNodes: function () { return mediaNodes.slice(); } };
  }

  return { SECTION_ORDER: SECTION_ORDER, createPortfolioRenderer: createPortfolioRenderer };
}));
