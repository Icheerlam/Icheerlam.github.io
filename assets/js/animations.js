/* =====================================================================
   PRTS Terminal // GSAP Animation Layer
   滚动触发入场 · 视差 · 磁吸按钮 · Hero 增强（渐进增强，无 GSAP 时静默降级）
   ===================================================================== */
(function () {
    'use strict';

    if (!window.gsap) return; // 无 GSAP 时安全降级，不影响页面
    const gsap = window.gsap;
    if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);
    const ST = window.ScrollTrigger;

    document.documentElement.classList.add('gsap-ready');

    // 等图片/字体就绪后再启动，避免抖动
    function start() {
        /* ---------- 1. Hero 视差（背景视频/图随滚动缓慢移动） ---------- */
        const heroBg = document.querySelector('.tech-bg-video, .tech-bg');
        if (heroBg && ST) {
            gsap.to(heroBg, {
                yPercent: 18, ease: 'none',
                scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom top', scrub: true }
            });
        }

        /* ---------- 2. 显式标记的滚动入场（.gsap-reveal，不自动给网格子项加，避免与 CSS 加载动画冲突） ---------- */
        if (ST) {
            const revealEls = gsap.utils.toArray('.gsap-reveal');
            revealEls.forEach(function (el) {
                el.style.animation = 'none';
                gsap.fromTo(el,
                    { opacity: 0, y: 40 },
                    {
                        opacity: 1, y: 0, duration: 0.8, ease: 'expo.out',
                        scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' }
                    }
                );
            });
        }

        /* ---------- 3. 标题字符分割入场（带 .split-title 的元素） ---------- */
        gsap.utils.toArray('.split-title').forEach(function (title) {
            const text = title.textContent;
            title.innerHTML = '';
            text.split('').forEach(function (ch) {
                const span = document.createElement('span');
                span.textContent = ch === ' ' ? ' ' : ch;
                span.style.display = 'inline-block';
                title.appendChild(span);
            });
            const chars = title.querySelectorAll('span');
            gsap.from(chars, {
                opacity: 0, y: 30, rotateX: -60, duration: 0.7, ease: 'back.out(1.7)', stagger: 0.03, delay: 0.2
            });
        });

        /* ---------- 4. 磁吸按钮 ---------- */
        const hasFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        if (hasFinePointer) {
            gsap.utils.toArray('.magnetic').forEach(function (el) {
                const strength = parseFloat(el.dataset.magnetic) || 0.4;
                el.addEventListener('mousemove', function (e) {
                    const r = el.getBoundingClientRect();
                    const x = (e.clientX - r.left - r.width / 2) * strength;
                    const y = (e.clientY - r.top - r.height / 2) * strength;
                    gsap.to(el, { x: x, y: y, duration: 0.4, ease: 'power3.out' });
                });
                el.addEventListener('mouseleave', function () {
                    gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
                });
            });
        }

        /* ---------- 5. 卡片 3D 倾斜（hover） ---------- */
        if (hasFinePointer) {
            gsap.utils.toArray('.tilt').forEach(function (card) {
                card.addEventListener('mousemove', function (e) {
                    const r = card.getBoundingClientRect();
                    const px = (e.clientX - r.left) / r.width - 0.5;
                    const py = (e.clientY - r.top) / r.height - 0.5;
                    gsap.to(card, { rotateY: px * 8, rotateX: -py * 8, duration: 0.4, ease: 'power2.out', transformPerspective: 800 });
                });
                card.addEventListener('mouseleave', function () {
                    gsap.to(card, { rotateY: 0, rotateX: 0, duration: 0.6, ease: 'power3.out' });
                });
            });
        }

        /* ---------- 6. 主题切换 / Lightbox 等动态内容后刷新 ScrollTrigger ---------- */
        const mo = new MutationObserver(function () { if (ST) ST.refresh(); });
        const main = document.querySelector('main, .container');
        if (main) mo.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

        if (ST) ST.refresh();
    }

    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start);
})();
