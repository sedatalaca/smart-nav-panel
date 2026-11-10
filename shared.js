// Smart Nav Panel — Copyright (C) 2026 LikaGroup (Sedat Alaca-LikaPulse)
// SPDX-License-Identifier: GPL-3.0-or-later
/* ============================================================================
 * shared.js — Ortak yardımcılar (popup, options, content tarafından paylaşılır)
 *
 * Tek bir tooltip singleton'ı (diagonal köşe yerleştirme + tema + invert
 * karşıtı), HTML escape, debounce yardımcıları içerir.
 *
 * Kullanım:
 *   <script src="shared.js"></script>     // options.html, popup.html
 *   content.js: manifest'te content.js'ten ÖNCE content script olarak yüklenir.
 *
 * Bağlamlar arası izolasyon: her bir world (content, popup, options) kendi
 * NVP nesnesini kurar. Content script'te ipucu, Tip.setContainer(shadowRoot)
 * ile kapalı Shadow DOM içine taşınır.
 * ============================================================================ */
(function (root) {
    'use strict';

    /* ----------------------------------------------------------------------
     * HTML escape — attribute ve metin için güvenli kodlama
     * -------------------------------------------------------------------- */
    const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    function escapeHtml(str) {
        return String(str == null ? '' : str).replace(/[&<>"']/g, c => HTML_ESCAPES[c]);
    }
    function escapeAttr(str) { return escapeHtml(str); }

    /* ----------------------------------------------------------------------
     * Debounce yardımcısı
     * -------------------------------------------------------------------- */
    function debounce(fn, wait) {
        let t = null;
        return function debounced(...args) {
            if (t) clearTimeout(t);
            t = setTimeout(() => { t = null; fn.apply(this, args); }, wait);
        };
    }

    /* ----------------------------------------------------------------------
     * Tooltip — tek singleton, üç bağlam (popup / options / content) paylaşır.
     *
     *   data-ttip         : tooltip metni
     *   data-ttip-box     : çok satırlı kutu stili
     *   data-ttip-pos     : tercih edilen yön ("tr"|"br"|"tl"|"bl"|"top"|...)
     *                          (yoksa otomatik en uygun köşe/yön seçilir)
     *   data-ttip-sticky  : tıklamayla sabitleme
     *
     * Tema: setTheme({bg, fg, border, light, invertCounter}) ile değiştirilebilir.
     *   - light           : true ise açık renk paleti (ve invert filter uygulanmaz)
     *   - invertCounter   : true ise 'invert(1) hue-rotate(180deg)' uygulanır
     *                       (genel sayfa invert filtresini geri çevirmek için).
     *   Tema verilmediğinde sayfanın --tip-bg / --tip-fg / --tip-border CSS
     *   değişkenlerini okumaya çalışır (popup/options temasıyla uyum için).
     * -------------------------------------------------------------------- */
    const Tip = (function () {
        const STYLE_ID = '__nvp_tip_style';
        const TIP_ID = '__nvp_tip';

        // Uzun metinler dengeli 2-3 satıra sarılır; ok, ipucunun hangi yanda durduğuna göre çizilir.
        const CSS =
            '#' + TIP_ID + '{' +
                'position:fixed;z-index:2147483647;' +
                'max-width:min(240px,calc(100vw - 16px));min-width:0;width:max-content;' +
                'padding:7px 11px;border-radius:10px;' +
                'border:1px solid rgba(255,255,255,.12);' +
                'font:500 12px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;' +
                'letter-spacing:.1px;white-space:normal;overflow-wrap:break-word;text-wrap:balance;text-align:left;' +
                'color:#f5f5f7;background:#2c2c2e;' +
                'box-shadow:0 10px 30px rgba(0,0,0,.3);' +
                'pointer-events:none;opacity:0;transition:opacity .15s ease,transform .15s ease;' +
                'will-change:opacity;box-sizing:border-box;' +
            '}' +
            '#' + TIP_ID + '.is-visible{opacity:1;}' +
            '#' + TIP_ID + '.is-box{max-width:min(260px,calc(100vw - 16px));}' +
            '#' + TIP_ID + '.is-stuck{pointer-events:auto;cursor:pointer;}' +
            '#' + TIP_ID + '.__nvp_light{' +
                'color:#1c1c1e;background:#fbfbfe;' +
                'border-color:rgba(0,0,0,.1);' +
                'box-shadow:0 10px 30px rgba(0,0,0,.12);' +
            '}' +
            '#' + TIP_ID + '::after{content:"";position:absolute;width:9px;height:9px;background:inherit;transform:rotate(45deg);}' +
            '#' + TIP_ID + '[data-dir="left"]::after{right:-5px;top:calc(var(--arrow-y,50%) - 4.5px);}' +
            '#' + TIP_ID + '[data-dir="right"]::after{left:-5px;top:calc(var(--arrow-y,50%) - 4.5px);}' +
            '#' + TIP_ID + '[data-dir="top"]::after{bottom:-5px;left:calc(var(--arrow-x,50%) - 4.5px);}' +
            '#' + TIP_ID + '[data-dir="bottom"]::after{top:-5px;left:calc(var(--arrow-x,50%) - 4.5px);}';

        const STATE = {
            el: null,
            host: null,
            pendingHide: null,
            pendingShow: null,
            stuck: false,
            rafId: 0,
            light: false,
            invertCounter: false,
            listenersAttached: false,
            lastMouseEvt: null,
            container: null
        };

        // container: isteğe bağlı bir ShadowRoot. Verilirse ipucu ve stili sayfa
        // DOM'una değil bu köke eklenir (content.js kapalı Shadow DOM kullanır).
        function ensureStyle() {
            const c = STATE.container;
            if (c) {
                if (c.querySelector('#' + STYLE_ID)) return;
                const s = document.createElement('style');
                s.id = STYLE_ID;
                s.textContent = CSS;
                c.appendChild(s);
                return;
            }
            if (document.getElementById(STYLE_ID)) return;
            const s = document.createElement('style');
            s.id = STYLE_ID;
            s.textContent = CSS;
            (document.head || document.documentElement).appendChild(s);
        }

        function ensureEl() {
            if (STATE.el && STATE.el.isConnected) return STATE.el;
            ensureStyle();
            const t = document.createElement('div');
            t.id = TIP_ID;
            t.setAttribute('role', 'tooltip');
            (STATE.container || document.documentElement || document.body).appendChild(t);
            STATE.el = t;
            return t;
        }

        function setContainer(node) {
            if (STATE.container === node) return;
            if (STATE.el) { try { STATE.el.remove(); } catch (_) { /* yok say */ } }
            STATE.el = null;
            STATE.host = null;
            STATE.container = node || null;
        }

        // Görünür ipucunun metnini, imleç üstündeyken yerinde günceller.
        function update(el) {
            if (!el || STATE.host !== el || !STATE.el) return;
            const txt = el.getAttribute('data-ttip');
            if (txt) STATE.el.textContent = txt;
        }

        function isLight(el) {
            if (STATE.light) return true;
            return !!(el && el.closest && (el.closest('.theme-light') || el.closest('.panel-light')));
        }

        function applyTheme() {
            const t = ensureEl();
            if (isLight(STATE.host)) {
                t.classList.add('__nvp_light');
            } else {
                t.classList.remove('__nvp_light');
            }
            t.style.filter = (STATE.invertCounter && !isLight(STATE.host)) ? 'invert(1) hue-rotate(180deg)' : 'none';
        }

        function clearTimers() {
            if (STATE.pendingShow) { clearTimeout(STATE.pendingShow); STATE.pendingShow = null; }
            if (STATE.pendingHide) { clearTimeout(STATE.pendingHide); STATE.pendingHide = null; }
        }

        function cancelLayout() {
            if (STATE.rafId) { cancelAnimationFrame(STATE.rafId); STATE.rafId = 0; }
        }

        // Öğenin kutusuna göre yerleştir: önce yan taraf (üstteki/alttaki öğelerin üstüne
        // binmez), sığmazsa alt, sonra üst. data-ttip-pos="left|right|top|bottom" ile zorlanabilir.
        function place(el) {
            if (!el) return;
            const t = STATE.el;
            if (!t) return;
            cancelLayout();
            STATE.rafId = requestAnimationFrame(() => {
                STATE.rafId = 0;
                if (!el.isConnected || !t.isConnected) return;
                t.style.left = '0px';
                t.style.top = '0px';
                const vw = window.innerWidth, vh = window.innerHeight;
                const w = t.offsetWidth, h = t.offsetHeight;
                const m = 8, gap = 10;
                const r = el.getBoundingClientRect();
                const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                const fits = {
                    left: r.left - gap - w >= m,
                    right: r.right + gap + w <= vw - m,
                    bottom: r.bottom + gap + h <= vh - m,
                    top: r.top - gap - h >= m
                };
                const want = el.getAttribute('data-ttip-pos');
                const order = ['left', 'right', 'top', 'bottom'].includes(want) ? [want, 'left', 'right', 'bottom', 'top']
                    : (cx > vw / 2 ? ['left', 'right', 'bottom', 'top'] : ['right', 'left', 'bottom', 'top']);
                const dir = order.find((d) => fits[d]) || order[0];
                let left, top;
                if (dir === 'left' || dir === 'right') {
                    left = dir === 'left' ? r.left - gap - w : r.right + gap;
                    top = Math.max(m, Math.min(cy - h / 2, vh - h - m));
                    t.style.setProperty('--arrow-y', Math.max(10, Math.min(cy - top, h - 10)) + 'px');
                } else {
                    top = dir === 'bottom' ? r.bottom + gap : r.top - gap - h;
                    left = Math.max(m, Math.min(cx - w / 2, vw - w - m));
                    t.style.setProperty('--arrow-x', Math.max(12, Math.min(cx - left, w - 12)) + 'px');
                }
                t.setAttribute('data-dir', dir);
                t.style.left = Math.round(Math.max(m, Math.min(left, vw - w - m))) + 'px';
                t.style.top = Math.round(Math.max(m, Math.min(top, vh - h - m))) + 'px';
            });
        }

        function show(el, opts) {
            if (!el) return;
            var txt = el.getAttribute('data-ttip');
            if (!txt) return;
            if (STATE.host && STATE.host !== el && !STATE.stuck) hide(true);
            STATE.host = el;
            clearTimers();
            STATE.pendingShow = setTimeout(() => {
                STATE.pendingShow = null;
                var t = ensureEl();
                applyTheme();
                t.textContent = txt;
                if (el.hasAttribute('data-ttip-box')) t.classList.add('is-box'); else t.classList.remove('is-box');
                if (STATE.stuck) t.classList.add('is-stuck'); else t.classList.remove('is-stuck');
                place(el, STATE.lastMouseEvt);
                requestAnimationFrame(() => { t.classList.add('is-visible'); });
            }, opts && opts.delay != null ? opts.delay : 30);
        }

        function hide(immediate) {
            clearTimers();
            var doHide = function () {
                STATE.pendingHide = null;
                STATE.host = null;
                STATE.stuck = false;
                var t = STATE.el;
                if (!t) return;
                t.classList.remove('is-visible', 'is-stuck', 'is-box');
            };
            if (immediate) { doHide(); return; }
            STATE.pendingHide = setTimeout(doHide, 120);
        }

        function toggleSticky(el) {
            if (!el) return;
            if (STATE.stuck && STATE.host === el) { hide(true); return; }
            STATE.stuck = true;
            show(el, { delay: 0 });
        }

        function bind(el) {
            if (!el || el.__nvpTipBound) return;
            el.__nvpTipBound = true;
            el.addEventListener('mouseenter', (e) => { STATE.lastMouseEvt = e; show(el); });
            el.addEventListener('mousemove', (e) => { STATE.lastMouseEvt = e; });
            el.addEventListener('mouseleave', () => { if (!STATE.stuck) hide(); });
            el.addEventListener('focus', () => { show(el); });
            el.addEventListener('blur', () => { if (!STATE.stuck) hide(); });
            if (el.hasAttribute('data-ttip-sticky')) {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleSticky(el);
                });
            }
        }

        function init(root, opts) {
            var scope = root || document;
            var arr = scope.querySelectorAll ? scope.querySelectorAll('[data-ttip]') : [];
            for (var i = 0; i < arr.length; i++) bind(arr[i]);
            if (opts && opts.theme) setTheme(opts.theme);
            if (opts && typeof opts.invertCounter === 'boolean') {
                STATE.invertCounter = opts.invertCounter;
                applyTheme();
            }
            var reposition = () => { if (STATE.host) place(STATE.host); };
            if (!STATE.listenersAttached) {
                STATE.listenersAttached = true;
                window.addEventListener('scroll', reposition, { passive: true });
                window.addEventListener('resize', reposition, { passive: true });
                document.addEventListener('click', (e) => {
                    if (!STATE.stuck) return;
                    if (STATE.host && STATE.host.contains(e.target)) return;
                    if (STATE.el && STATE.el.contains(e.target)) return;
                    hide(true);
                }, true);
            }
            return arr.length;
        }

        function setTheme(theme) {
            if (theme) {
                if (typeof theme.light === 'boolean') STATE.light = theme.light;
                if (typeof theme.invertCounter === 'boolean') STATE.invertCounter = theme.invertCounter;
            }
            applyTheme();
        }

        function setColors() { applyTheme(); }

        return {
            init: init,
            show: show,
            hide: hide,
            toggleSticky: toggleSticky,
            setTheme: setTheme,
            setColors: setColors,
            refresh: place,
            update: update,
            setContainer: setContainer,
            escapeHtml: escapeHtml,
            escapeAttr: escapeAttr,
            debounce: debounce,
            _state: STATE,
            bindOne: bind
        };
    })();

    /* ----------------------------------------------------------------------
     * Renk doğrulama — yalnız #hex ve rgb()/rgba() kabul edilir. CSS'e
     * gömülen kullanıcı renklerinin bildirimden kaçmasını engeller.
     * -------------------------------------------------------------------- */
    const COLOR_RE = /^(#[0-9a-f]{3}|#[0-9a-f]{4}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/i;
    function isSafeColor(v) { return typeof v === 'string' && COLOR_RE.test(v.trim()); }
    function safeColor(v, fallback) { return isSafeColor(v) ? v.trim() : fallback; }

    /* ----------------------------------------------------------------------
     * Özel CSS temizleme — tehlikeli kalıplar varsa tümüyle reddedilir,
     * @import satırları silinir, uzunluk sınırlanır.
     * -------------------------------------------------------------------- */
    const CSS_DANGERS = ['expression(', 'javascript:', 'vbscript:', '-moz-binding', 'behavior:', 'url(javascript'];
    function sanitizeCustomCss(css) {
        if (!css || !String(css).trim()) return '';
        let out = String(css);
        const low = out.toLowerCase();
        for (const d of CSS_DANGERS) { if (low.includes(d)) return ''; }
        out = out.replace(/@import[^;]*;?/gi, '');
        return out.slice(0, 50000);
    }

    /* ----------------------------------------------------------------------
     * HTML şablon temizleme — DOMParser + izin listesi. Yalnız buton/ikon
     * yapımı için gereken etiket ve öznitelikler kalır; geri kalan her şey
     * (script, style, iframe, on* olayları, javascript: adresleri) atılır.
     * -------------------------------------------------------------------- */
    const TPL_TAGS = new Set(['button', 'span', 'div', 'i', 'b', 'strong', 'small', 'svg', 'path', 'circle', 'rect', 'line',
        'polyline', 'polygon', 'ellipse', 'g', 'defs', 'lineargradient', 'radialgradient', 'stop', 'title']);
    const TPL_ATTRS = new Set(['class', 'id', 'role', 'title', 'type', 'style', 'data-ttip', 'data-ttip-box', 'tabindex',
        'viewbox', 'xmlns', 'd', 'fill', 'fill-rule', 'clip-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap',
        'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity', 'cx', 'cy', 'r', 'rx', 'ry',
        'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points', 'transform', 'offset', 'stop-color', 'stop-opacity',
        'gradientunits', 'gradienttransform', 'preserveaspectratio']);
    function sanitizeTemplate(html) {
        if (!html || typeof DOMParser === 'undefined') return '';
        const src = String(html).slice(0, 20000);
        let doc;
        try { doc = new DOMParser().parseFromString('<body>' + src + '</body>', 'text/html'); }
        catch (_) { return ''; }
        const walk = (node) => {
            Array.from(node.childNodes).forEach((ch) => {
                if (ch.nodeType === 3) return; // metin
                if (ch.nodeType !== 1) { ch.remove(); return; } // yorum vb.
                const tag = ch.localName.toLowerCase();
                if (!TPL_TAGS.has(tag)) {
                    // Zararsız kapsayıcıları (ör. <p>) açıp içeriği koru; tehlikelileri tümden sil.
                    if (/^(script|style|iframe|object|embed|link|meta|form|input|textarea|select|img|video|audio|template|noscript|base|frame|frameset)$/.test(tag)) { ch.remove(); return; }
                    walk(ch);
                    while (ch.firstChild) ch.parentNode.insertBefore(ch.firstChild, ch);
                    ch.remove();
                    return;
                }
                Array.from(ch.attributes).forEach((at) => {
                    const n = at.name.toLowerCase();
                    const v = at.value;
                    const ok = TPL_ATTRS.has(n) || /^aria-[a-z-]+$/.test(n);
                    if (!ok) { ch.removeAttribute(at.name); return; }
                    if (/javascript\s*:|vbscript\s*:|expression\s*\(|url\s*\(|@import/i.test(v)) ch.removeAttribute(at.name);
                });
                walk(ch);
            });
        };
        walk(doc.body);
        return doc.body.innerHTML.trim();
    }


    /* ----------------------------------------------------------------------
     * Panel görünümü — ikon seti ve panel CSS'i. content.js (gerçek panel) ve
     * options.js (canlı önizleme) aynı kodu kullanır.
     * -------------------------------------------------------------------- */
    const Panel = (function () {
        const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
        const num = (v, a, b, d) => { v = parseFloat(v); return isNaN(v) ? d : clamp(v, a, b); };
        const svg = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
        const ICON = {
            top: svg('<path d="M5 4h14"/><path d="M12 20V9"/><path d="M7 13l5-5 5 5"/>'),
            bottom: svg('<path d="M5 20h14"/><path d="M12 4v11"/><path d="M7 11l5 5 5-5"/>'),
            up: svg('<path d="M6 15l6-6 6 6"/>'),
            down: svg('<path d="M6 9l6 6 6-6"/>'),
            arrowUp: svg('<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>'),
            arrowDown: svg('<path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/>'),
            more: svg('<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>'),
            auto: svg('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>'),
            system: svg('<rect x="2.5" y="3.5" width="19" height="13" rx="2"/><path d="M8 20.5h8M12 16.5v4"/>'),
            moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
            sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
            list: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>'),
            mark: svg('<path d="M6 3h12v18l-6-4-6 4z"/>'),
            play: svg('<path d="M7 4l13 8-13 8z"/>'),
            eyeOff: svg('<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s4 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
            target: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
            gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
            back: svg('<path d="M15 6l-6 6 6 6"/>'),
            x: svg('<path d="M6 6l12 12M18 6L6 18"/>')
        };
        function hexToRgb(h) {
            h = String(h || '').replace('#', '');
            if (h.length === 3) h = h.replace(/./g, '$&$&');
            if (!/^[0-9a-f]{6}$/i.test(h)) return null;
            return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16));
        }
        function relLum(rgb) {
            const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
            return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
        }
        const onAccent = (hex) => { const c = hexToRgb(hex); return c && relLum(c) > 0.42 ? '#111318' : '#ffffff'; };
        function positionCss(S) {
            const h = num(S.offsetRight, 0, 2000, 24), v = num(S.offsetBottom, 0, 2000, 24);
            const p = S.position;
            return (p && p.startsWith('left') ? 'left:' + h + 'px;' : 'right:' + h + 'px;') + (p && p.endsWith('top') ? 'top:' + v + 'px;' : 'bottom:' + v + 'px;');
        }
        function buildCss(S, defaults) {
            const accent = safeColor(S.hoverColor, defaults.hoverColor);
            const accentRgb = hexToRgb(accent) || [55, 168, 168];
            const darkBg = hexToRgb(safeColor(S.bgColorHex, defaults.bgColorHex)) || [30, 30, 36];
            const icon = safeColor(S.arrowColor, defaults.arrowColor);
            const size = Math.round(num(S.buttonSize, 26, 64, 36));
            const fabSize = size + 8;
            const radius = Math.round(num(S.buttonRadius, 0, 40, 12));
            const r = radius >= size / 2 ? '50%' : radius + 'px';
            const ar = accentRgb.join(',');
            return `
    :host{all:initial;--acc:${accent};--acc-rgb:${ar};--on-acc:${onAccent(accent)}}
    *{box-sizing:border-box}
    #nvp{position:fixed;${positionCss(S)}pointer-events:auto;display:flex;flex-direction:column;align-items:center;
      font:600 13px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-user-select:none;user-select:none;touch-action:none;
      transform:translateY(calc(var(--lift,0px) * -1));transition:opacity .3s ease,transform .3s ease}
    #nvp.theme-dark{--glass:rgba(${darkBg.join(',')},.84);--fg:${icon};--line:rgba(255,255,255,.12);--track:rgba(255,255,255,.16);--hover:rgba(255,255,255,.09);--shadow:0 10px 30px rgba(0,0,0,.45)}
    #nvp.theme-light{--glass:rgba(255,255,255,.9);--fg:#1f2329;--line:rgba(15,23,42,.12);--track:rgba(15,23,42,.10);--hover:rgba(15,23,42,.06);--shadow:0 10px 28px rgba(15,23,42,.18)}
    #nvp.hidden{opacity:0;transform:translateY(14px) scale(.9);pointer-events:none}
    #nvp.rest:not(.open):not(:hover){opacity:.38}
    #nvp.attop:not(.open):not(:hover){opacity:.62}
    #nvp.dragging{transition:none}
    .fab{appearance:none;margin:0;padding:0;border:1px solid var(--line);width:${fabSize}px;height:${fabSize}px;border-radius:50%;
      background:var(--glass);color:var(--fg);box-shadow:var(--shadow);cursor:pointer;position:relative;display:grid;place-items:center;
      backdrop-filter:blur(12px) saturate(1.4);-webkit-backdrop-filter:blur(12px) saturate(1.4);outline:none;
      transition:transform .2s cubic-bezier(.3,1.4,.5,1),background .2s,color .2s}
    .fab:hover{transform:scale(1.06)}
    .fab:active{transform:scale(.94)}
    .fab:focus-visible{box-shadow:var(--shadow),0 0 0 3px rgba(var(--acc-rgb),.55)}
    .fab .ic{width:${Math.round(size * 0.5)}px;height:${Math.round(size * 0.5)}px;display:grid;place-items:center;transition:transform .35s cubic-bezier(.3,1.4,.5,1)}
    .fab .ic svg{width:100%;height:100%;display:block}
    .fab.down .ic{transform:rotate(180deg)}
    .ring{position:absolute;inset:-1px;width:calc(100% + 2px);height:calc(100% + 2px);transform:rotate(-90deg);pointer-events:none}
    .ring circle{fill:none;stroke-width:2.6}
    .ring .trk{stroke:var(--track)}
    .ring .bar{stroke:var(--acc);stroke-linecap:round;stroke-dasharray:var(--p,0) 100;transition:stroke-dasharray .15s linear}
    .fab.inf .ring .bar{stroke-dasharray:22 78;animation:nvp-spin 1.2s linear infinite;transform-origin:50% 50%}
    .fab.noprog .ring{display:none}
    @keyframes nvp-spin{to{stroke-dashoffset:-100}}
    .stack{position:absolute;left:50%;bottom:calc(100% + 8px);display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px;
      border-radius:${radius >= size / 2 ? '999px' : (radius + 4) + 'px'};background:var(--glass);border:1px solid var(--line);box-shadow:var(--shadow);
      backdrop-filter:blur(12px) saturate(1.4);-webkit-backdrop-filter:blur(12px) saturate(1.4);
      transform:translate(-50%,6px) scale(.92);transform-origin:50% 100%;opacity:0;visibility:hidden;pointer-events:none;
      transition:opacity .2s ease,transform .25s cubic-bezier(.3,1.3,.5,1),visibility 0s linear .25s}
    #nvp.pos-top .stack{bottom:auto;top:calc(100% + 8px);flex-direction:column-reverse;transform-origin:50% 0;transform:translate(-50%,-6px) scale(.92)}
    #nvp.open .stack,#nvp.full .stack{opacity:1;visibility:visible;pointer-events:auto;transform:translate(-50%,0) scale(1);transition:opacity .2s ease,transform .25s cubic-bezier(.3,1.3,.5,1),visibility 0s}
    .nav-button{appearance:none;margin:0;padding:0;border:0;width:${size}px;height:${size}px;border-radius:${r};background:transparent;color:var(--fg);
      cursor:pointer;display:grid;place-items:center;position:relative;outline:none;font:inherit;transition:background .15s,color .15s,transform .15s}
    .nav-button svg{width:${Math.round(size * 0.48)}px;height:${Math.round(size * 0.48)}px;display:block}
    .nav-button:hover{background:var(--hover);color:var(--acc)}
    .nav-button:active{transform:scale(.9)}
    .nav-button:focus-visible{box-shadow:0 0 0 2px rgba(var(--acc-rgb),.7)}
    .nav-button.is-on{background:var(--acc);color:var(--on-acc)}
    .nav-theme svg{animation:nvp-pop .4s cubic-bezier(.3,1.5,.5,1)}
    @keyframes nvp-pop{from{opacity:0;transform:rotate(-90deg) scale(.4)}}
    .sep{width:60%;height:1px;background:var(--line);margin:2px 0}
    #menu{position:fixed;pointer-events:auto;min-width:220px;max-width:min(320px,calc(100vw - 16px));padding:6px;border-radius:14px;
      background:var(--glass);color:var(--fg);border:1px solid var(--line);box-shadow:var(--shadow);
      backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);
      font:500 13px/1.25 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;animation:nvp-in .18s ease}
    #menu.theme-dark{--glass:rgba(${darkBg.join(',')},.94);--fg:${icon};--line:rgba(255,255,255,.12);--hover:rgba(255,255,255,.09);--shadow:0 14px 40px rgba(0,0,0,.5);--muted:rgba(255,255,255,.55)}
    #menu.theme-light{--glass:rgba(255,255,255,.97);--fg:#1f2329;--line:rgba(15,23,42,.12);--hover:rgba(15,23,42,.06);--shadow:0 14px 40px rgba(15,23,42,.2);--muted:rgba(15,23,42,.55)}
    @keyframes nvp-in{from{opacity:0;transform:translateY(4px) scale(.98)}}
    #menu .mi{appearance:none;margin:0;border:0;background:transparent;color:inherit;font:inherit;width:100%;display:flex;align-items:center;gap:10px;
      padding:8px 10px;border-radius:9px;cursor:pointer;text-align:left;outline:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #menu .mi svg{width:16px;height:16px;flex:none;opacity:.85}
    #menu .mi:hover,#menu .mi:focus-visible{background:var(--hover)}
    #menu .mi:focus-visible{box-shadow:inset 0 0 0 2px rgba(var(--acc-rgb),.6)}
    #menu .mi.current{color:var(--acc);font-weight:600}
    #menu .mi small{margin-left:auto;color:var(--muted);font-size:11px}
    #menu .mh{padding:8px 10px 4px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
    #menu .note{padding:0 10px 6px;font-size:11px;color:var(--muted);white-space:normal}
    #menu .seg{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;padding:2px 6px 6px}
    #menu .seg button{appearance:none;border:1px solid var(--line);background:transparent;color:inherit;font:600 12px/1 inherit;font-family:inherit;padding:7px 4px;border-radius:8px;cursor:pointer;outline:none}
    #menu .seg button.on{background:var(--acc);border-color:var(--acc);color:var(--on-acc)}
    #menu .seg button:focus-visible{box-shadow:0 0 0 2px rgba(var(--acc-rgb),.6)}
    #menu .list{max-height:min(55vh,400px);overflow-y:auto;overscroll-behavior:contain}
    #menu .list .lvl-2{padding-left:24px}#menu .list .lvl-3{padding-left:38px;font-size:12px}
    #menu .row{display:flex;gap:2px}#menu .row .mi:first-child{flex:1;min-width:0}#menu .row .mi.del{width:auto;flex:none}
    #menu .empty{padding:10px;color:var(--muted);white-space:normal}
    #menu .sepl{height:1px;background:var(--line);margin:4px 2px}
    .pill{position:fixed;pointer-events:auto;appearance:none;margin:0;border:1px solid var(--line);border-radius:999px;padding:9px 14px;
      font:600 12.5px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;cursor:pointer;white-space:nowrap;
      background:var(--glass);color:var(--fg);box-shadow:var(--shadow);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
      opacity:0;transform:translateY(6px);transition:opacity .2s ease,transform .2s ease;display:flex;align-items:center;gap:8px}
    .pill svg{width:15px;height:15px}
    .pill.theme-dark{--glass:rgba(${darkBg.join(',')},.92);--fg:${icon};--line:rgba(255,255,255,.12);--shadow:0 10px 30px rgba(0,0,0,.45);--hover:rgba(255,255,255,.1)}
    .pill.theme-light{--glass:rgba(255,255,255,.96);--fg:#1f2329;--line:rgba(15,23,42,.12);--shadow:0 10px 28px rgba(15,23,42,.18);--hover:rgba(15,23,42,.07)}
    .pill.show{opacity:1;transform:none}
    .pill:hover{color:var(--acc)}
    .pill.toast{cursor:default}
    .pill.toast:hover{color:var(--fg)}
    .auto button{appearance:none;margin:0;font:inherit;border:0;border-radius:999px;min-width:26px;height:24px;cursor:pointer;background:var(--hover);color:inherit}
    .auto button:hover{background:var(--acc);color:var(--on-acc)}
    @media (max-width:480px){.fab{width:${Math.max(44, fabSize)}px;height:${Math.max(44, fabSize)}px}}
    @media (prefers-reduced-motion:reduce){*{transition-duration:.01ms!important;animation-duration:.01ms!important}}`;
        }
        return { ICON, hexToRgb, relLum, onAccent, buildCss };
    })();

    /* ----------------------------------------------------------------------
     * Genel API
     * -------------------------------------------------------------------- */
    root.NVP = root.NVP || {};
    root.NVP.tip = Tip;
    root.NVP.escapeHtml = escapeHtml;
    root.NVP.escapeAttr = escapeAttr;
    root.NVP.debounce = debounce;
    root.NVP.isSafeColor = isSafeColor;
    root.NVP.safeColor = safeColor;
    root.NVP.sanitizeCustomCss = sanitizeCustomCss;
    root.NVP.sanitizeTemplate = sanitizeTemplate;
    root.NVP.panel = Panel;
})(typeof window !== 'undefined' ? window : this);
