/* =====================================================================
   PRTS Terminal // Common Interactions
   音频系统 · 主题切换 · interactable 音效 · 平滑滚动 · 自定义光标 · 进度条
   全站通用，按需启用（对应 DOM 存在才执行）
   暴露 window.AK 命名空间供页面调用
   ===================================================================== */
(function () {
    'use strict';

    const AK = window.AK = window.AK || {};
    AK.audioEnabled = false;

    /* ---------- 1. 音频系统 ---------- */
    const bgmAudio = document.getElementById('bgmAudio');
    const hoverSound = document.getElementById('hoverSound');
    const clickSound = document.getElementById('clickSound');
    // 兼容命名：specialSound（内页）/ avatarSound（首页）
    const specialSound = document.getElementById('specialSound') || document.getElementById('avatarSound');

    const bgmVol = document.getElementById('bgmVol');
    const hoverVol = document.getElementById('hoverVol');
    const clickVol = document.getElementById('clickVol');
    const specialVol = document.getElementById('specialVol') || document.getElementById('avatarVol');

    const audioToggle = document.getElementById('audioToggle');
    const volHeader = document.getElementById('volHeader');
    const volumePanel = document.getElementById('volumePanel');
    const volIcon = document.getElementById('volIcon');

    function volOf(input) { return input ? parseFloat(input.value) : 0.8; }

    // 供页面调用的统一音效播放
    AK.playSound = function (audioEl, volInput) {
        if (!AK.audioEnabled || !audioEl) return;
        audioEl.currentTime = 0;
        audioEl.volume = volInput ? volOf(volInput) : 0.8;
        const p = audioEl.play();
        if (p && p.catch) p.catch(function () {});
    };

    if (bgmVol) {
        bgmVol.addEventListener('input', function (e) {
            if (AK.audioEnabled && bgmAudio) bgmAudio.volume = parseFloat(e.target.value);
        });
    }

    if (audioToggle) {
        audioToggle.addEventListener('click', function () {
            AK.audioEnabled = !AK.audioEnabled;
            if (AK.audioEnabled) {
                audioToggle.innerHTML = '[ AUDIO: ON ]';
                audioToggle.classList.remove('muted');
                if (bgmAudio) { bgmAudio.volume = volOf(bgmVol); bgmAudio.play().catch(function () {}); }
                AK.playSound(clickSound, clickVol);
            } else {
                audioToggle.innerHTML = '[ AUDIO: OFF ]';
                audioToggle.classList.add('muted');
                if (bgmAudio) bgmAudio.pause();
            }
        });
    }

    if (volHeader && volumePanel) {
        volHeader.addEventListener('click', function () {
            volumePanel.classList.toggle('collapsed');
            if (volIcon) volIcon.textContent = volumePanel.classList.contains('collapsed') ? '[+]' : '[-]';
            AK.playSound(clickSound, clickVol);
        });
    }

    /* ---------- 2. .interactable 音效绑定 ---------- */
    function bindInteractables() {
        const extra = window.AK_EXTRA_INTERACTABLE || '';
        const baseSel = '.interactable, button, a' + (extra ? ', ' + extra : '');
        const els = document.querySelectorAll(baseSel);
        els.forEach(function (el) {
            if (el.dataset.akBound) return;
            el.dataset.akBound = '1';
            el.addEventListener('mouseenter', function () { AK.playSound(hoverSound, hoverVol); });
            if (el.tagName === 'BUTTON' || el.tagName === 'A') {
                if (el.classList.contains('vol-slider')) return;
                el.addEventListener('click', function () {
                    AK.playSound(el.classList.contains('nav-logo') ? specialSound : clickSound,
                                 el.classList.contains('nav-logo') ? specialVol : clickVol);
                });
            }
        });
    }
    AK.bindInteractables = bindInteractables;
    bindInteractables();

    /* ---------- 3. 主题切换 ---------- */
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) {
        themeBtn.addEventListener('click', function () {
            document.body.classList.toggle('light-mode');
            themeBtn.innerHTML = document.body.classList.contains('light-mode') ? 'MED_DEPT' : 'OP_DEPT';
        });
    }

    /* ---------- 4. Lenis 平滑滚动 ---------- */
    AK.lenis = null;
    if (window.Lenis) {
        AK.lenis = new Lenis({ duration: 1.1, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); } });
        function raf(time) { AK.lenis.raf(time); requestAnimationFrame(raf); }
        requestAnimationFrame(raf);
        // 与 GSAP ScrollTrigger 联动
        if (window.ScrollTrigger) {
            AK.lenis.on('scroll', window.ScrollTrigger.update);
            window.gsap && window.gsap.ticker.add(function (t) { AK.lenis.raf(t * 1000); });
            window.gsap && window.gsap.ticker.lagSmoothing(0);
        }
    }

    /* ---------- 5. 自定义光标 ---------- */
    const cursor = document.querySelector('.custom-cursor');
    const cursorDot = document.querySelector('.custom-cursor-dot');
    const hasFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (cursor && cursorDot && hasFinePointer) {
        let cx = 0, cy = 0, tx = 0, ty = 0;
        document.addEventListener('mousemove', function (e) { tx = e.clientX; ty = e.clientY; cursorDot.style.transform = 'translate(' + tx + 'px,' + ty + 'px) translate(-50%,-50%)'; });
        function loop() {
            cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18;
            cursor.style.transform = 'translate(' + cx + 'px,' + cy + 'px) translate(-50%,-50%)';
            requestAnimationFrame(loop);
        }
        loop();
        const hoverSel = 'a, button, .interactable, input, .vol-slider, .bento-card, .video-card, .feature-card, .gallery-card, .knowledge-card, .masonry-item, .case-header';
        document.addEventListener('mouseover', function (e) { if (e.target.closest(hoverSel)) cursor.classList.add('hover'); });
        document.addEventListener('mouseout', function (e) { if (e.target.closest(hoverSel)) cursor.classList.remove('hover'); });
        document.addEventListener('mousedown', function () { cursor.classList.add('click'); });
        document.addEventListener('mouseup', function () { cursor.classList.remove('click'); });
    }

    /* ---------- 6. 滚动进度条 + 返回顶部 + 导航栏滚动状态 ---------- */
    const progress = document.querySelector('.scroll-progress');
    const backTop = document.querySelector('.back-to-top');
    const nav = document.querySelector('nav');
    function onScroll() {
        const st = window.scrollY;
        const h = document.documentElement.scrollHeight - window.innerHeight;
        const pct = h > 0 ? (st / h) * 100 : 0;
        if (progress) progress.style.width = pct + '%';
        if (backTop) { if (st > 600) backTop.classList.add('show'); else backTop.classList.remove('show'); }
        if (nav) { if (st > 60) nav.classList.add('nav-scrolled'); else nav.classList.remove('nav-scrolled'); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    if (backTop) {
        backTop.addEventListener('click', function () {
            if (AK.lenis) AK.lenis.scrollTo(0); else window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    /* ---------- 7. Preloader 启动序列 ---------- */
    const preloader = document.querySelector('.preloader');
    if (preloader) {
        // 安全兜底：无论是否出错，8 秒后强制隐藏，避免页面被锁死
        setTimeout(function () { preloader.classList.add('hidden'); }, 6000);
        const bootText = preloader.querySelector('.preloader-boot');
        const barFill = preloader.querySelector('.preloader-bar-fill');
        const pctEl = preloader.querySelector('.preloader-pct');
        const lines = ['INITIALIZING PRTS CORE', 'LOADING OPERATOR DATA', 'CALIBRATING TERMINAL', 'SYSTEM READY'];
        let li = 0, pct = 0;
        const bootIv = setInterval(function () {
            if (bootText) bootText.innerHTML = lines[li] + ' <span class="blink">_</span>';
            li = (li + 1) % lines.length;
        }, 380);
        const barIv = setInterval(function () {
            pct += Math.random() * 16 + 6;
            if (pct >= 100) { pct = 100; clearInterval(barIv); clearInterval(bootIv); }
            if (barFill) barFill.style.width = pct + '%';
            if (pctEl) pctEl.textContent = Math.floor(pct) + '%';
            if (pct >= 100) setTimeout(function () { preloader.classList.add('hidden'); }, 350);
        }, 130);
    }

    AK.rebind = function () { bindInteractables(); onScroll(); };
})();
