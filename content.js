// Smart Nav Panel — Copyright (C) 2026 LikaGroup (Sedat Alaca-LikaPulse)
// SPDX-License-Identifier: GPL-3.0-or-later
/* ============================================================================
 * content.js — Evrensel Navigasyon Paneli v5.0 (content script, document_end)
 *
 * - Panel kapalı Shadow DOM içinde (<nvp-root>): sayfa CSS'i panele, panel CSS'i
 *   sayfaya sızmaz. Kompakt düzen: ilerleme halkalı tek akıllı düğme; fare
 *   yaklaşınca / dokununca tüm düğmeler açılır. Görünüm sayfanın gerçek rengine uyar.
 * - Sayfa karartma dark.js'tedir (document_start). Bu dosya yalnız durumunu okur
 *   (window.__nvpDark) ve site seçimini değiştirir.
 * - Kaydırma motoru: puanlamayla seçilen birincil kaydırıcı (pencere ya da iç kap,
 *   açık shadow root'lar dahil), sabit başlık payı, biriken sayfa adımları,
 *   SPA rota değişimlerine uyum.
 * ============================================================================ */
(function () {
    'use strict';
    // Eklenti yeniden yüklenince eski (öksüz) kopya kalır; yalnız canlıysa çık
    if (window.__nvpContentLoaded) {
        try { if (window.__nvpContentAlive && window.__nvpContentAlive()) return; } catch (_) { /* öksüz kopya */ }
        document.querySelectorAll('nvp-root').forEach((n) => n.remove());
    }
    window.__nvpContentLoaded = true;
    window.__nvpContentAlive = () => !!(chrome.runtime && chrome.runtime.id);

    const NVPX = window.NVP || {};
    const NOOP_TIP = { init() {}, update() {}, hide() {}, setContainer() {} };
    const Tip = NVPX.tip || NOOP_TIP;
    const safeColor = (v, f) => (NVPX.safeColor ? NVPX.safeColor(v, f) : f);
    const sanitizeCustomCss = (c) => (NVPX.sanitizeCustomCss ? NVPX.sanitizeCustomCss(c) : '');
    const sanitizeTemplate = (h) => (NVPX.sanitizeTemplate ? NVPX.sanitizeTemplate(h) : '');
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const num = (v, a, b, d) => { v = parseFloat(v); return isNaN(v) ? d : clamp(v, a, b); };
    const DARK = window.__nvpDark || null;

    const UI_LANG = (() => {
        try { const l = String(chrome.i18n.getUILanguage() || 'en').slice(0, 2).toLowerCase(); return l === 'tr' || l === 'ru' ? l : 'en'; }
        catch (_) { return 'en'; }
    })();

    const defaults = {
        hoverColor: '#37a8a8', bgColor: 'rgba(30, 30, 36, 0.85)', bgColorHex: '#1e1e24', buttonColor: '#2d2d37', arrowColor: '#ffffff',
        offsetRight: 24, offsetBottom: 24, buttonRadius: 12, buttonSize: 36, position: 'right-bottom',
        panelStyle: 'compact', panelTheme: 'auto',
        showThemeButton: true, showPageButton: true, showEdgeButton: true, keyboardShortcuts: true,
        paused: false, pausedSites: [], activeSites: [], enableAllSites: false, siteRules: [],
        autoHide: true, autoHideDelay: 600, rememberPosition: true, gestures: true, detectConflicts: true,
        readingProgress: true, autoScrollSpeed: 40,
        customCss: '', customButtonTemplate: '', language: UI_LANG
    };

    // ── Metinler ───────────────────────────────────────────────────────────
    const TXT = {
        tr: {
            panel: 'Navigasyon paneli', top: 'En üst', bottom: 'En alt', pageUp: 'Sayfa yukarı', pageDown: 'Sayfa aşağı', menu: 'Diğer',
            fabTop: 'En üste çık', fabDown: 'Aşağı kaydır',
            darkAuto: 'Tema: Sistem', darkOn: 'Tema: Karanlık', darkOff: 'Tema: Aydınlık',
            nowOn: 'şu an karartılmış', nowOff: 'şu an karartılmamış', nowLight: 'şu an açık renge çevrilmiş',
            r: { native: 'site kendi karanlık modunda', supports: 'sitenin kendi karanlık modu var', 'already-dark': 'sayfa zaten koyu', darkreader: 'Dark Reader etkin', 'os-light': 'sistem teması açık', never: 'genel ayar: hiçbir zaman', 'user-off': 'Aydınlık seçili, site zaten açık renkli', lighten: 'koyu site açık renge çevrildi', 'user-on': 'Karanlık seçili', always: 'genel ayar: her zaman', auto: 'açık renkli sayfa', paused: 'eklenti duraklatıldı', schedule: 'zamanlama dışında', cached: 'önceki karar', pending: 'kontrol ediliyor' },
            headings: 'Başlıklar', noHeadings: 'Bu sayfada başlık yok', back: 'Geri',
            bookmarks: 'Yer imleri', noBookmarks: 'Sayfada Alt+tıklayarak yer imi ekle', clearBookmarks: 'Tümünü sil', bookmarkAdded: 'Yer imi eklendi', remove: 'Sil',
            autoScroll: 'Otomatik kaydır', autoScrollOn: 'Otomatik kaydırma', speedUnit: 'px/sn', slower: 'Yavaşlat (−)', faster: 'Hızlandır (+)', stop: 'Durdur (Esc)',
            dimming: 'Bu sitede tema', mAuto: 'Sistem', mOn: 'Karanlık', mOff: 'Aydınlık',
            hideHere: 'Paneli bu sitede gizle', hiddenHere: 'Panel bu sitede gizlendi — açmak için eklenti simgesine tıkla',
            resetPos: 'Panel konumunu sıfırla', settings: 'Ayarlar', returnBack: 'Kaldığın yere dön',
            progress: '%{p} okundu · ~{m} dk kaldı', progressDone: 'Sayfanın sonu', infinite: 'Sonsuz akış — içerik yükleniyor', moreLoaded: 'Yeni içerik yüklendi — tekrar bas'
        },
        en: {
            panel: 'Navigation panel', top: 'Top', bottom: 'Bottom', pageUp: 'Page up', pageDown: 'Page down', menu: 'More',
            fabTop: 'Back to top', fabDown: 'Scroll down',
            darkAuto: 'Theme: System', darkOn: 'Theme: Dark', darkOff: 'Theme: Light',
            nowOn: 'currently dimmed', nowOff: 'currently not dimmed', nowLight: 'currently turned light',
            r: { native: 'site is in its own dark mode', supports: 'site has its own dark mode', 'already-dark': 'page is already dark', darkreader: 'Dark Reader is active', 'os-light': 'system theme is light', never: 'global setting: never', 'user-off': 'Light selected, the site is already light', lighten: 'dark site turned light', 'user-on': 'Dark selected', always: 'global setting: always', auto: 'light page', paused: 'extension paused', schedule: 'outside schedule', cached: 'previous decision', pending: 'checking' },
            headings: 'Headings', noHeadings: 'No headings on this page', back: 'Back',
            bookmarks: 'Bookmarks', noBookmarks: 'Alt+click on the page to add a bookmark', clearBookmarks: 'Clear all', bookmarkAdded: 'Bookmark added', remove: 'Remove',
            autoScroll: 'Auto-scroll', autoScrollOn: 'Auto-scroll', speedUnit: 'px/s', slower: 'Slower (−)', faster: 'Faster (+)', stop: 'Stop (Esc)',
            dimming: 'Theme on this site', mAuto: 'System', mOn: 'Dark', mOff: 'Light',
            hideHere: 'Hide panel on this site', hiddenHere: 'Panel hidden on this site — click the extension icon to bring it back',
            resetPos: 'Reset panel position', settings: 'Settings', returnBack: 'Back to where you were',
            progress: '{p}% read · ~{m} min left', progressDone: 'End of page', infinite: 'Endless feed — loading content', moreLoaded: 'More content loaded — press again'
        },
        ru: {
            panel: 'Панель навигации', top: 'В начало', bottom: 'В конец', pageUp: 'Страница вверх', pageDown: 'Страница вниз', menu: 'Ещё',
            fabTop: 'Наверх', fabDown: 'Прокрутить вниз',
            darkAuto: 'Тема: системная', darkOn: 'Тема: тёмная', darkOff: 'Тема: светлая',
            nowOn: 'сейчас затемнено', nowOff: 'сейчас не затемнено', nowLight: 'сейчас осветлено',
            r: { native: 'сайт в своём тёмном режиме', supports: 'у сайта есть свой тёмный режим', 'already-dark': 'страница уже тёмная', darkreader: 'активен Dark Reader', 'os-light': 'светлая тема системы', never: 'общая настройка: никогда', 'user-off': 'выбрана светлая, сайт уже светлый', lighten: 'тёмный сайт осветлён', 'user-on': 'выбрана тёмная', always: 'общая настройка: всегда', auto: 'светлая страница', paused: 'расширение на паузе', schedule: 'вне расписания', cached: 'прежнее решение', pending: 'проверка' },
            headings: 'Заголовки', noHeadings: 'На странице нет заголовков', back: 'Назад',
            bookmarks: 'Закладки', noBookmarks: 'Alt+клик по странице — добавить закладку', clearBookmarks: 'Удалить все', bookmarkAdded: 'Закладка добавлена', remove: 'Удалить',
            autoScroll: 'Автопрокрутка', autoScrollOn: 'Автопрокрутка', speedUnit: 'пикс/с', slower: 'Медленнее (−)', faster: 'Быстрее (+)', stop: 'Стоп (Esc)',
            dimming: 'Тема на сайте', mAuto: 'Системная', mOn: 'Тёмная', mOff: 'Светлая',
            hideHere: 'Скрыть панель на сайте', hiddenHere: 'Панель скрыта на этом сайте — нажмите значок расширения, чтобы вернуть',
            resetPos: 'Сбросить позицию панели', settings: 'Настройки', returnBack: 'Вернуться назад',
            progress: 'Прочитано {p}% · ~{m} мин', progressDone: 'Конец страницы', infinite: 'Бесконечная лента — загрузка', moreLoaded: 'Загружено ещё — нажмите снова'
        }
    };
    let S = { ...defaults };
    const T = () => TXT[S.language] || TXT[UI_LANG] || TXT.en;

    // ── İkonlar (tek SVG seti, currentColor) ───────────────────────────────
    // İkonlar ve panel CSS'i shared.js'te (NVP.panel): ayarlar sayfasındaki canlı önizleme de aynısını kullanır
    const PANEL = NVPX.panel;
    const ICON = PANEL.ICON;

    // ── Eklenti bağlamı ve depolama ────────────────────────────────────────
    const HOST = location.hostname;
    function alive() { try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; } }
    function syncGet(def, cb) {
        if (!alive()) { cb({ ...def }); return; }
        try { chrome.storage.sync.get(def, (r) => cb(chrome.runtime.lastError || !r ? { ...def } : r)); } catch (_) { cb({ ...def }); }
    }
    function syncSet(obj, cb) {
        if (!alive()) { if (cb) cb(); return; }
        try { chrome.storage.sync.set(obj, () => { void chrome.runtime.lastError; if (cb) cb(); }); } catch (_) { if (cb) cb(); }
    }
    function localGet(keys, cb) {
        if (!alive()) { cb({}); return; }
        try { chrome.storage.local.get(keys, (r) => cb(chrome.runtime.lastError ? {} : (r || {}))); } catch (_) { cb({}); }
    }
    function localSet(obj) { if (!alive()) return; try { chrome.storage.local.set(obj, () => void chrome.runtime.lastError); } catch (_) { /* yok say */ } }
    function localRemove(keys) { if (!alive()) return; try { chrome.storage.local.remove(keys, () => void chrome.runtime.lastError); } catch (_) { /* yok say */ } }
    function sendBg(msg) { if (!alive()) return; try { chrome.runtime.sendMessage(msg, () => void chrome.runtime.lastError); } catch (_) { /* yok say */ } }

    // ── Site kuralları ve etkinlik ─────────────────────────────────────────
    function ruleMatches(sel, host) { sel = String(sel || '').trim().toLowerCase(); return !!sel && (host === sel || host.endsWith('.' + sel)); }
    function ruleState() {
        let hide = false, show = false;
        for (const r of (S.siteRules || [])) {
            if (!r || !ruleMatches(r.selector, HOST)) continue;
            if (r.action === 'hide') hide = true; else if (r.action === 'show') show = true;
        }
        return { hide, show };
    }
    const pausedOnSite = () => (S.pausedSites || []).includes(HOST);
    function extensionActiveHere() {
        if (ruleState().show) return true;
        if (S.paused || pausedOnSite()) return false;
        return S.enableAllSites || (S.activeSites || []).includes(HOST);
    }

    // ── Shadow DOM kökü ────────────────────────────────────────────────────
    let hostEl = null, shadow = null, baseStyleEl = null, customStyleEl = null, docStyleEl = null;
    let panel = null, stack = null, fab = null, menu = null;
    function ensureHost() {
        if (!hostEl) {
            hostEl = document.createElement('nvp-root');
            shadow = hostEl.attachShadow({ mode: 'closed' });
            baseStyleEl = document.createElement('style');
            customStyleEl = document.createElement('style');
            shadow.append(baseStyleEl, customStyleEl);
            baseStyleEl.textContent = buildCss();
            const st = hostEl.style;
            // Genişlik/yükseklik verilmez: inset:0 görünür alanı (kaydırma çubuğu hariç) kaplar. 100vw
            // kaydırma çubuğunu da içerir; karartma filtresi uygulanınca panel o kadar sağa kayıyordu.
            [['position', 'fixed'], ['inset', '0'], ['width', 'auto'], ['height', 'auto'], ['margin', '0'], ['padding', '0'],
                ['border', '0'], ['background', 'transparent'], ['pointer-events', 'none'], ['z-index', '2147483646'],
                ['opacity', '1'], ['transform', 'none'], ['visibility', 'visible'], ['contain', 'none']
            ].forEach(([k, v]) => st.setProperty(k, v, 'important'));
        }
        // Yazdırmada ve tam ekranda gizle (satır içi display yok ki bu kurallar işlesin)
        if (!docStyleEl) {
            docStyleEl = document.createElement('style');
            docStyleEl.textContent = 'nvp-root{display:block!important}@media print{nvp-root{display:none!important}}nvp-root[data-fs]{display:none!important}';
        }
        if (!docStyleEl.isConnected) (document.head || document.documentElement).appendChild(docStyleEl);
        if (!hostEl.isConnected) (document.documentElement || document.body).appendChild(hostEl);
        applyHostFilter();
        Tip.setContainer(shadow);
        return shadow;
    }
    function applyHostFilter() {
        if (!hostEl) return;
        const f = DARK && DARK.state === 'on' && DARK.counter ? DARK.counter : 'none';
        hostEl.style.setProperty('filter', f, 'important');
    }
    function removeHost() {
        try { Tip.hide(true); } catch (_) { /* yok say */ }
        Tip.setContainer(null);
        if (hostEl) hostEl.remove();
        if (docStyleEl) docStyleEl.remove();
    }

    // ── Kaydırma motoru ────────────────────────────────────────────────────
    let scrollerCache = null, scrollerT = 0;
    const docEl = () => document.scrollingElement || document.documentElement;
    function windowScrollable() {
        const d = docEl();
        if (!d || d.scrollHeight <= window.innerHeight + 2) return false;
        try {
            const ho = getComputedStyle(document.documentElement).overflowY;
            const bo = document.body ? getComputedStyle(document.body).overflowY : 'visible';
            if (ho === 'hidden' || ho === 'clip') return false;
            if ((bo === 'hidden' || bo === 'clip') && (ho === 'visible' || ho === '')) return false;
        } catch (_) { /* yok say */ }
        return true;
    }
    const winRange = () => windowScrollable() ? Math.max(0, docEl().scrollHeight - window.innerHeight) : 0;
    function isScrollableEl(el) {
        if (!el || el.nodeType !== 1 || el === document.documentElement || el === document.body || el === hostEl) return false;
        if (el.clientHeight < 60 || el.scrollHeight <= el.clientHeight + 4) return false;
        const oy = getComputedStyle(el).overflowY;
        return oy === 'auto' || oy === 'scroll' || oy === 'overlay';
    }
    const parentOf = (n) => n.parentElement || (n.getRootNode && n.getRootNode() !== document && n.getRootNode().host) || null;
    function scrollableAncestors(el) {
        const out = [];
        for (let n = el; n && n !== document.documentElement; n = parentOf(n)) if (isScrollableEl(n)) out.push(n);
        return out;
    }
    // Görünmez ama tıklanabilir örtüler (yükleme ekranı vb.) hesaba katılmaz
    function ghost(el) {
        for (let n = el, k = 0; n && n.nodeType === 1 && k < 6; k++, n = n.parentElement) {
            if (parseFloat(getComputedStyle(n).opacity) < 0.05) return true;
        }
        return false;
    }
    function hitList(x, y) {
        let l = [];
        try { l = document.elementsFromPoint(x, y); } catch (_) { l = []; }
        return l.filter((e) => e !== hostEl && !ghost(e));
    }
    // Açık shadow root'ları delerek en içteki öğe
    function deepAt(x, y) {
        let el = hitList(x, y)[0] || null;
        if (!el) return null;
        for (let i = 0; el && el.shadowRoot && i < 8; i++) {
            const inner = el.shadowRoot.elementFromPoint(x, y);
            if (!inner || inner === el) break;
            el = inner;
        }
        return el;
    }
    function visibleArea(el) {
        const r = el.getBoundingClientRect();
        const w = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0));
        const h = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
        return w * h;
    }
    function pickScroller() {
        const W = window.innerWidth, H = window.innerHeight;
        const wr = winRange();
        const winScore = Math.min(wr, H * 10) * W * H;
        let best = null, bestScore = 0;
        const seen = new Set();
        for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.6], [0.7, 0.4], [0.5, 0.85], [0.5, 0.2]]) {
            const el = deepAt(W * fx, H * fy);
            if (!el) continue;
            for (const s of scrollableAncestors(el)) {
                if (seen.has(s)) continue;
                seen.add(s);
                const area = visibleArea(s);
                if (area < W * H * 0.25) continue;
                const score = Math.min(s.scrollHeight - s.clientHeight, H * 10) * area;
                if (score > bestScore) { best = s; bestScore = score; }
            }
        }
        if (best && (bestScore > winScore || wr < H * 0.25)) return best;
        return wr > 0 ? 'window' : (best || 'window');
    }
    function getScroller() {
        const fresh = Date.now() - scrollerT < 2500;
        if (fresh && scrollerCache === 'window' && windowScrollable()) return 'window';
        if (fresh && scrollerCache && scrollerCache !== 'window' && scrollerCache.isConnected && isScrollableEl(scrollerCache)) return scrollerCache;
        scrollerCache = pickScroller();
        scrollerT = Date.now();
        return scrollerCache;
    }
    function setScroller(s) { scrollerCache = s; scrollerT = Date.now(); }
    function scrollInfo() {
        const s = getScroller();
        if (s === 'window') {
            const d = docEl();
            return { el: null, top: window.scrollY || d.scrollTop || 0, max: Math.max(0, d.scrollHeight - window.innerHeight), view: window.innerHeight, rectTop: 0 };
        }
        const r = s.getBoundingClientRect();
        return { el: s, top: s.scrollTop, max: Math.max(0, s.scrollHeight - s.clientHeight), view: s.clientHeight, rectTop: Math.max(0, r.top) };
    }
    function rawScroll(i, top, behavior) {
        const opt = { top, behavior };
        if (i.el) i.el.scrollTo(opt); else window.scrollTo(opt);
    }
    function scrollToY(y, smooth) {
        const i = scrollInfo();
        const top = clamp(Math.round(y), 0, i.max);
        // Çok uzak hedefte önce yakına ışınlan, son ekranı yumuşak kaydır (uzun animasyon olmasın)
        if (smooth !== false && Math.abs(top - i.top) > i.view * 12) rawScroll(i, top - Math.sign(top - i.top) * i.view, 'instant');
        rawScroll(i, top, smooth === false ? 'instant' : 'smooth');
    }
    // Üstteki sabit/yapışkan başlığın kapladığı yükseklik
    function topObstruction(i) {
        const base = i.rectTop;
        let bottom = base;
        for (const fx of [0.2, 0.5, 0.8]) {
            const first = hitList(window.innerWidth * fx, base + 3).find((e) => e !== document.documentElement && e !== document.body);
            for (let n = first; n && n !== document.body && n !== document.documentElement && n !== i.el; n = parentOf(n)) {
                const p = getComputedStyle(n).position;
                if (p === 'fixed' || p === 'sticky') {
                    const r = n.getBoundingClientRect();
                    if (r.top <= base + 6 && r.height < i.view * 0.4 && r.bottom > bottom) bottom = r.bottom;
                    break;
                }
            }
        }
        return Math.max(0, bottom - base);
    }
    let pendingStep = null;
    function scrollStep(dir) {
        const i = scrollInfo();
        const step = Math.max(40, (i.view - topObstruction(i)) * 0.88);
        const now = performance.now();
        let base = i.top;
        if (pendingStep && now - pendingStep.t < 650 && pendingStep.el === i.el && pendingStep.dir === dir) base = pendingStep.y;
        const y = clamp(base + dir * step, 0, i.max);
        pendingStep = { y, t: now, el: i.el, dir };
        scrollToY(y);
    }
    let growth = { max: 0, n: 0 };
    function scrollWholePage(type) {
        const i = scrollInfo();
        if (type === 'top' || type === 'bottom') {
            pendingStep = null;
            rememberJump(i.top);
            scrollToY(type === 'top' ? 0 : i.max);
            if (type === 'bottom') {
                const before = i.max;
                setTimeout(() => { if (scrollInfo().max > before + i.view * 0.5) toast(T().moreLoaded); }, 1300);
            }
        } else if (type === 'page-up') scrollStep(-1);
        else if (type === 'page-down') scrollStep(1);
    }
    function scrollToElement(el, smooth) {
        const i = scrollInfo();
        const y = i.top + (el.getBoundingClientRect().top - i.rectTop) - topObstruction(i) - 12;
        scrollToY(y, smooth);
    }
    // Kullanıcının etkileştiği kap birincil kaydırıcı olur
    const pathTarget = (e) => (e.composedPath ? e.composedPath()[0] : e.target);
    function adoptFrom(t) {
        if (!t || t === hostEl || t.nodeType !== 1) return;
        const s = scrollableAncestors(t).find((x) => visibleArea(x) >= window.innerWidth * window.innerHeight * 0.25);
        if (s) setScroller(s);
        else if (windowScrollable()) setScroller('window');
    }
    document.addEventListener('wheel', (e) => adoptFrom(pathTarget(e)), { capture: true, passive: true });
    document.addEventListener('pointerdown', (e) => { if (e.target !== hostEl) adoptFrom(pathTarget(e)); }, { capture: true, passive: true });
    document.addEventListener('scroll', (e) => {
        const t = e.target;
        if (t === document || t === document.documentElement) { if (windowScrollable()) setScroller('window'); }
        else if (t && t.nodeType === 1 && isScrollableEl(t) && visibleArea(t) >= window.innerWidth * window.innerHeight * 0.25) setScroller(t);
        onScroll();
    }, { capture: true, passive: true });

    // ── "Kaldığın yere dön" + bildirim ─────────────────────────────────────
    let returnY = null, returnBtn = null, returnTimer = null;
    function rememberJump(fromY) {
        if (scrollInfo().max <= 0) return;
        returnY = fromY;
        clearTimeout(returnTimer);
        returnTimer = setTimeout(() => {
            const now = scrollInfo();
            if (returnY == null || Math.abs(now.top - returnY) < now.view * 0.5) return;
            showReturnButton();
        }, 650);
    }
    function showReturnButton() {
        if (!panel) return;
        if (!returnBtn) {
            returnBtn = document.createElement('button');
            returnBtn.type = 'button';
            returnBtn.addEventListener('click', () => { if (returnY != null) scrollToY(returnY); returnY = null; hideReturnButton(); });
            returnBtn.addEventListener('pointermove', () => bumpIdle(), { passive: true });
        }
        returnBtn.className = 'pill ' + themeClass();
        returnBtn.innerHTML = ICON.back + '<span>' + esc(T().returnBack) + '</span>';
        shadow.appendChild(returnBtn);
        placeNearPanel(returnBtn, 0);
        requestAnimationFrame(() => returnBtn && returnBtn.classList.add('show'));
        clearTimeout(returnTimer);
        // Yığın açıkken onunla birlikte kapanır (closeStack); kapalıyken kendi süresi işler
        if (stackOpen()) bumpIdle(); else returnTimer = setTimeout(hideReturnButton, 6000);
    }
    const stackOpen = () => !!(panel && panel.classList.contains('open'));
    function hideReturnButton() {
        clearTimeout(returnTimer);
        if (returnBtn) { returnBtn.classList.remove('show'); const b = returnBtn; setTimeout(() => { if (!b.classList.contains('show')) b.remove(); }, 250); }
    }
    function placeNearPanel(el, stackIndex) {
        const vw = window.innerWidth, vh = window.innerHeight;
        const w = el.offsetWidth, h = el.offsetHeight;
        let left, top;
        const anchor = fab && fab.isConnected ? fab : null;
        if (anchor) {
            const r = anchor.getBoundingClientRect();
            left = r.left - w - 12;
            if (left < 8) left = r.right + 12;
            top = r.top + r.height / 2 - h / 2 - (stackIndex || 0) * (h + 8);
        } else {
            left = vw - w - 24;
            top = vh - h - 24 - (stackIndex || 0) * (h + 8);
        }
        el.style.left = clamp(left, 8, vw - w - 8) + 'px';
        el.style.top = clamp(top, 8, vh - h - 8) + 'px';
    }
    let toastEl = null, toastTimer = null;
    function toast(text) {
        ensureHost();
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.setAttribute('role', 'status');
            toastEl.addEventListener('pointermove', () => bumpIdle(), { passive: true });
        }
        toastEl.className = 'pill toast ' + themeClass();
        toastEl.textContent = text;
        shadow.appendChild(toastEl);
        placeNearPanel(toastEl, 1);
        requestAnimationFrame(() => toastEl && toastEl.classList.add('show'));
        clearTimeout(toastTimer);
        // Yığın açıkken bilgi hapı da onunla birlikte kapanır; kapalıyken (kısayol vb.) kendi süresi işler
        if (stackOpen()) bumpIdle(); else toastTimer = setTimeout(hideToast, 2600);
    }
    function hideToast() {
        clearTimeout(toastTimer);
        if (toastEl) { toastEl.classList.remove('show'); setTimeout(() => toastEl && !toastEl.classList.contains('show') && toastEl.remove(), 250); }
    }

    // ── Okuma ilerlemesi ───────────────────────────────────────────────────
    let wordCache = { n: 0, t: 0 };
    function wordCount() {
        const now = Date.now();
        if (now - wordCache.t < 5000) return wordCache.n;
        const i = scrollInfo();
        const root = document.querySelector('article') || document.querySelector('main, [role="main"]') || i.el || document.body;
        let txt = '';
        try { txt = root ? (root.innerText || root.textContent || '') : ''; } catch (_) { txt = ''; }
        const m = txt.match(/\S+/g);
        wordCache = { n: m ? m.length : 0, t: now };
        return wordCache.n;
    }
    const progressPercent = (i) => (i.max > 0 ? clamp(Math.round(i.top / i.max * 100), 0, 100) : 100);
    function progressText(i) {
        const L = T();
        if (growth.n >= 3) return L.infinite;
        const p = progressPercent(i);
        if (p >= 99) return L.progressDone;
        const mins = Math.max(1, Math.ceil(wordCount() * (1 - p / 100) / 220));
        return L.progress.replace('{p}', p).replace('{m}', mins);
    }

    // ── Panel CSS ──────────────────────────────────────────────────────────
    const relLum = PANEL.relLum;
    const buildCss = () => PANEL.buildCss(S, defaults);

    // ── Panel görünümü (sayfanın gerçek rengine uyum) ──────────────────────
    let pageTone = 'light';
    function sampleTone() {
        const want = S.panelTheme;
        if (want === 'dark' || want === 'light') { pageTone = want; return; }
        if (!fab || !fab.isConnected) return;
        const r = fab.getBoundingClientRect();
        let sum = 0, n = 0;
        for (const [x, y] of [[r.left - 30, r.top + r.height / 2], [r.left + r.width / 2, r.top - 30], [r.left - 10, r.bottom + 4]]) {
            if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
            let c = null;
            for (const el of hitList(x, y)) {
                const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?/i.exec(getComputedStyle(el).backgroundColor);
                if (m && (m[4] === undefined || parseFloat(m[4]) >= 0.6)) { c = [+m[1], +m[2], +m[3]]; break; }
            }
            // Opak öğe yoksa sayfanın tuvali görünür: akıllı karartma açıksa koyu, değilse beyaz kabul edilir
            // (kök zeminin geçiş animasyonu sürerken saydam okunabilir)
            if (!c) c = (DARK && DARK.state === 'on' && !DARK.counter) ? [22, 24, 29] : [255, 255, 255];
            sum += relLum(c); n++;
        }
        if (!n) return;
        let l = sum / n;
        if (DARK && DARK.state === 'on' && DARK.counter) l = 1 - l; // sayfa ters çevrilmişse görünen renk tersidir
        pageTone = l < 0.4 ? 'dark' : 'light';
    }
    const themeClass = () => 'theme-' + pageTone;
    function applyTone() {
        sampleTone();
        const cls = themeClass();
        if (panel) { panel.classList.remove('theme-dark', 'theme-light'); panel.classList.add(cls); }
        if (menu) { menu.classList.remove('theme-dark', 'theme-light'); menu.classList.add(cls); }
        try { Tip.setTheme({ light: pageTone === 'light', invertCounter: false }); } catch (_) { /* yok say */ }
    }

    // ── Panel oluşturma ────────────────────────────────────────────────────
    const NAV_IDS = ['btn-top', 'btn-bottom', 'btn-page-up', 'btn-page-down', 'btn-theme-toggle', 'btn-menu'];
    function navButton(id, icon, label, extra) {
        return '<button class="nav-button' + (extra || '') + '" id="' + id + '" type="button" data-ttip="' + esc(label) + '" aria-label="' + esc(label) + '">' + icon + '</button>';
    }
    function defaultStack() {
        const L = T();
        let h = navButton('btn-menu', ICON.more, L.menu);
        if (S.showThemeButton) h += navButton('btn-theme-toggle', ICON.system, L.darkAuto, ' nav-theme');
        // Kompakt düzende akıllı düğme zaten "en üste çık" olur; ayrı "En üst" yalnız tam düzende
        if (S.showEdgeButton && S.panelStyle === 'full') h += navButton('btn-top', ICON.top, L.top);
        if (S.showPageButton) h += navButton('btn-page-up', ICON.up, L.pageUp) + navButton('btn-page-down', ICON.down, L.pageDown);
        if (S.showEdgeButton) h += navButton('btn-bottom', ICON.bottom, L.bottom);
        return h;
    }
    function fillStack() {
        stack.innerHTML = defaultStack();
        const tpl = sanitizeTemplate(String(S.customButtonTemplate || '').trim());
        if (!tpl || !tpl.includes('<')) return;
        const t = document.createElement('template');
        t.innerHTML = tpl;
        const hasNav = t.content.querySelector('#btn-top, #btn-bottom, #btn-page-up, #btn-page-down');
        const customTheme = t.content.querySelector('#btn-theme-toggle');
        if (!hasNav && customTheme) {
            const def = stack.querySelector('#btn-theme-toggle');
            if (def) def.replaceWith(t.content); else stack.append(t.content);
        } else {
            const menuBtn = stack.querySelector('#btn-menu');
            stack.replaceChildren(t.content);
            if (!stack.querySelector('#btn-menu') && menuBtn) stack.prepend(menuBtn);
        }
    }
    function updateThemeButton() {
        if (!stack) return;
        const tb = stack.querySelector('#btn-theme-toggle');
        if (!tb) return;
        const L = T();
        const mode = DARK ? DARK.siteMode : 'auto';
        const on = DARK && DARK.state === 'on';
        const label = (mode === 'on' ? L.darkOn : mode === 'off' ? L.darkOff : L.darkAuto) +
            (DARK ? ' — ' + nowText(L) + (DARK.reason && L.r[DARK.reason] ? ' (' + L.r[DARK.reason] + ')' : '') : '');
        tb.setAttribute('data-mode', mode);
        tb.setAttribute('aria-label', label);
        tb.setAttribute('data-ttip', label);
        if (tb.classList.contains('nav-theme') && !tb.hasAttribute('data-custom')) {
            const ic = mode === 'on' ? ICON.moon : mode === 'off' ? ICON.sun : ICON.system;
            if (tb.innerHTML !== ic) tb.innerHTML = ic;
        }
        tb.classList.toggle('is-on', mode !== 'auto');
        Tip.update(tb);
    }

    let lastPanelKey = '';
    const panelKey = () => JSON.stringify(['hoverColor', 'bgColorHex', 'buttonColor', 'arrowColor', 'offsetRight', 'offsetBottom', 'buttonRadius',
        'buttonSize', 'showThemeButton', 'showPageButton', 'showEdgeButton', 'position', 'panelStyle', 'panelTheme', 'readingProgress',
        'customCss', 'customButtonTemplate', 'language'].map((k) => S[k]));

    function destroyPanel() {
        closeMenu();
        hideReturnButton();
        stopAutoScroll();
        try { Tip.hide(true); } catch (_) { /* yok say */ }
        if (panel) { panel.remove(); panel = stack = fab = null; }
        lastPanelKey = '';
    }
    function createPanel() {
        destroyPanel();
        ensureHost();
        baseStyleEl.textContent = buildCss();
        customStyleEl.textContent = sanitizeCustomCss(S.customCss);
        const L = T();
        panel = document.createElement('div');
        panel.id = 'nvp';
        panel.className = 'hidden ' + (S.panelStyle === 'full' ? 'full' : 'compact') + (String(S.position || '').endsWith('top') ? ' pos-top' : ' pos-bottom');
        panel.setAttribute('role', 'toolbar');
        panel.setAttribute('aria-label', L.panel);
        stack = document.createElement('div');
        stack.className = 'stack';
        fillStack();
        fab = document.createElement('button');
        fab.type = 'button';
        fab.className = 'fab' + (S.readingProgress ? '' : ' noprog');
        fab.id = 'btn-fab';
        fab.innerHTML = '<svg class="ring" viewBox="0 0 40 40" aria-hidden="true"><circle class="trk" cx="20" cy="20" r="18.5"/><circle class="bar" cx="20" cy="20" r="18.5" pathLength="100"/></svg><span class="ic">' + ICON.arrowUp + '</span>';
        panel.append(stack, fab);
        shadow.appendChild(panel);

        panel.addEventListener('click', onPanelClick);
        panel.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu(); });
        panel.addEventListener('mouseenter', () => { clearTimeout(closeTimer); openStack(); });
        panel.addEventListener('mouseleave', () => scheduleClose());
        panel.addEventListener('focusin', () => openStack());
        panel.addEventListener('focusout', (e) => { if (!panel.contains(e.relatedTarget)) scheduleClose(); });
        // Panelin üzerinde hareket, tıklama, tekerlek ya da tuş: hareketsizlik sayacı yeniden başlar
        ['pointermove', 'pointerdown', 'wheel', 'keydown'].forEach((ev) => panel.addEventListener(ev, bumpIdle, { passive: true }));
        // Kapanınca imleç hâlâ üstündeyse, yeniden açmak için düğmeye hafifçe dokunmak (hareket) yeterli olsun
        fab.addEventListener('pointermove', () => { if (!panel.classList.contains('open') && !panel.classList.contains('dragging')) openStack(); }, { passive: true });
        fab.addEventListener('mouseenter', () => { fab.setAttribute('data-ttip', fabLabel()); });
        fab.setAttribute('data-ttip', fabLabel());
        stack.querySelectorAll('#btn-theme-toggle').forEach((b) => { if (!b.querySelector('svg') || b.classList.contains('nav-theme') === false) b.setAttribute('data-custom', ''); });
        try { Tip.init(panel); } catch (_) { /* yok say */ }
        setupDrag();
        restorePanelXY();
        applyTone();
        updateThemeButton();
        checkConflict();
        lastPanelKey = panelKey();
        updatePanel();
        updateProgress();
    }
    function fabMode(i) { return i.top < i.view * 0.35 && i.max > i.view * 0.5 ? 'down' : 'up'; }
    function fabLabel() {
        const i = scrollInfo();
        const L = T();
        const base = fabMode(i) === 'down' ? L.fabDown : L.fabTop;
        return S.readingProgress ? base + ' · ' + progressText(i) : base;
    }
    let suppressClick = false;
    function onPanelClick(e) {
        if (suppressClick) { suppressClick = false; e.preventDefault(); return; }
        const btn = e.target.closest('button');
        if (!btn) return;
        if (btn === fab) {
            const i = scrollInfo();
            if (fabMode(i) === 'down') scrollWholePage('page-down'); else scrollWholePage('top');
            return;
        }
        const id = btn.id;
        if (id === 'btn-top') scrollWholePage('top');
        else if (id === 'btn-bottom') scrollWholePage('bottom');
        else if (id === 'btn-page-up') scrollWholePage('page-up');
        else if (id === 'btn-page-down') scrollWholePage('page-down');
        else if (id === 'btn-theme-toggle') cycleSiteDark();
        else if (id === 'btn-menu') openMenu(btn);
    }

    // Kompakt yığın: aç/kapat
    let closeTimer = null, idleTimer = null;
    const IDLE_CLOSE_MS = 2500;   // açık yığın, hiçbir şey yapılmazsa bu süre sonra kendiliğinden kapanır
    // Fareyle tıklanan düğme odakta kalır; panel yalnız KLAVYE odağında (:focus-visible) açık tutulur
    const kbdFocus = () => { const f = shadow && shadow.activeElement; return !!(f && panel && panel.contains(f) && f.matches(':focus-visible')); };
    // Yığın kapanınca düğme ipucu (baloncuk) da hemen kapanır; imleç düğmenin üstünde kalsa bile asılı kalmaz
    function closeStack() {
        if (!panel) return;
        const wasOpen = panel.classList.contains('open');
        panel.classList.remove('open');
        clearTimeout(idleTimer);
        try { Tip.hide(true); } catch (_) { /* yok say */ }
        // Panelle birlikte açılan bilgi hapı ve "kaldığın yere dön" düğmesi de aynı anda kapanır
        if (wasOpen) { hideToast(); hideReturnButton(); }
    }
    function openStack() { if (panel) { panel.classList.add('open'); panel.classList.remove('rest'); bumpIdle(); } }
    // Hareketsizlik sayacı: açıkken her etkileşimde yeniden başlar; dolunca imleç üzerinde olsa bile kapanır
    function bumpIdle() {
        clearTimeout(idleTimer);
        if (!panel || !panel.classList.contains('open')) return;
        idleTimer = setTimeout(() => { if (panel && !menu && !kbdFocus()) closeStack(); }, IDLE_CLOSE_MS);
    }
    function scheduleClose() {
        clearTimeout(closeTimer);
        const onPill = () => !!((returnBtn && returnBtn.isConnected && returnBtn.matches(':hover')) || (toastEl && toastEl.isConnected && toastEl.matches(':hover')));
        closeTimer = setTimeout(() => { if (panel && !menu && !panel.matches(':hover') && !onPill() && !kbdFocus()) closeStack(); }, num(S.autoHideDelay, 0, 10000, 600));
    }

    // ── Sürükleme (fab ya da yığın boşluğu) + dokunmatik açma ──────────────
    let panelXY = null;
    const panelPosKey = () => 'nvpPanelPos:' + HOST;
    function setPanelXY(x, y) {
        if (!panel) return;
        const w = fab ? fab.offsetWidth : 44, h = fab ? fab.offsetHeight : 44;
        x = clamp(x, 4, window.innerWidth - w - 4);
        y = clamp(y, 4, window.innerHeight - h - 4);
        const s = panel.style;
        s.setProperty('left', x + 'px', 'important');
        s.setProperty('top', y + 'px', 'important');
        s.setProperty('right', 'auto', 'important');
        s.setProperty('bottom', 'auto', 'important');
        panel.style.setProperty('--lift', '0px');
        // Panel ekranın üst yarısındaysa yığın aşağı açılır
        panel.classList.toggle('pos-top', y < window.innerHeight / 2);
        panelXY = { x, y };
    }
    function restorePanelXY() {
        panelXY = null;
        localGet(panelPosKey(), (r) => { const p = r[panelPosKey()]; if (p && typeof p.x === 'number' && typeof p.y === 'number' && panel) setPanelXY(p.x, p.y); });
    }
    function resetPanelXY() {
        panelXY = null;
        localRemove(panelPosKey());
        if (panel) {
            ['left', 'top', 'right', 'bottom'].forEach((k) => panel.style.removeProperty(k));
            panel.classList.toggle('pos-top', String(S.position || '').endsWith('top'));
            avoidWidgets();
        }
    }
    function setupDrag() {
        let drag = null;
        panel.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            const onFab = e.target.closest('.fab');
            if (!onFab && e.target.closest('button')) return;
            if (e.pointerType === 'touch' && onFab && !panel.classList.contains('open') && S.panelStyle !== 'full') {
                // İlk dokunuş yığını açar, eylem yapmaz
                openStack();
                suppressClick = true;
                setTimeout(() => { suppressClick = false; }, 600);
                scheduleCloseTouch();
            }
            const r = fab.getBoundingClientRect();
            drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
        });
        panel.addEventListener('pointermove', (e) => {
            if (!drag || e.pointerId !== drag.id) return;
            const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
            if (!drag.moved && Math.hypot(dx, dy) > 6) {
                drag.moved = true;
                try { panel.setPointerCapture(e.pointerId); } catch (_) { /* yok say */ }
                closeMenu();
                panel.classList.add('dragging');
            }
            if (drag.moved) setPanelXY(drag.ox + dx, drag.oy + dy);
        });
        const end = (e) => {
            if (!drag || (e && e.pointerId !== drag.id)) return;
            if (drag.moved) {
                panel.classList.remove('dragging');
                suppressClick = true;
                setTimeout(() => { suppressClick = false; }, 0);
                if (panelXY) localSet({ [panelPosKey()]: panelXY });
                applyTone();
            }
            drag = null;
        };
        panel.addEventListener('pointerup', end);
        panel.addEventListener('pointercancel', end);
    }
    // Panel açıkken sayfada başka bir yere tıklanınca yığın hemen kapanır (beklemeden)
    document.addEventListener('pointerdown', (e) => {
        if (!panel || e.target === hostEl || menu || !panel.classList.contains('open')) return;
        clearTimeout(closeTimer);
        closeStack();
    }, { capture: true, passive: true });
    function scheduleCloseTouch() {
        const off = (e) => {
            if (e.target === hostEl) return;
            document.removeEventListener('pointerdown', off, true);
            if (panel && !menu) closeStack();
        };
        setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
    }

    // ── Köşedeki sohbet/çerez öğeleriyle çakışmayı önle ────────────────────
    // Sitenin köşe öğesi (kendi "yukarı çık" düğmesi, sohbet balonu) bir kez bulununca hatırlanır ve panel
    // onun üstünde SABİT durur. Site düğmeyi kaydırdıkça gizleyip gösterse de panel inip kalkmaz.
    let liftEl = null, liftVal = 0;
    function avoidWidgets() {
        if (!panel || !fab || panelXY || !S.detectConflicts || String(S.position || '').endsWith('top')) { liftEl = null; liftVal = 0; if (panel) panel.style.setProperty('--lift', '0px'); return; }
        // İmleç paneldeyken ya da menü açıkken panel kaydırılmaz (altından kayıp kapanmasın)
        if (panel.classList.contains('open') || panel.matches(':hover') || menu) return;
        const r = fab.getBoundingClientRect();
        // Panelin O ANKİ kayması hesaplanmış dönüşümden okunur: kalkma animasyonu sürerken de temel
        // (kalkmamış) konum doğru bulunur, pay iki kez sayılıp şişmez.
        let cur = 0;
        try { cur = new DOMMatrixReadOnly(getComputedStyle(panel).transform).m42 || 0; } catch (_) { cur = 0; }
        const baseTop = r.top - cur, baseBottom = r.bottom - cur;
        let minTop = Infinity, found = null;
        for (const [x, y] of [[r.left + 4, baseBottom - 4], [r.right - 4, baseBottom - 4], [r.left + r.width / 2, baseTop + r.height / 2], [r.left + 4, baseTop + 4], [r.right - 4, baseTop + 4]]) {
            for (const el of hitList(x, y)) {
                if (el === document.documentElement || el === document.body) continue;
                let n = el, fixed = null;
                for (let k = 0; n && k < 8 && n !== document.body; k++, n = parentOf(n)) {
                    if (getComputedStyle(n).position === 'fixed') { fixed = n; break; }
                }
                if (fixed) {
                    const fr = fixed.getBoundingClientRect();
                    if (fr.height < window.innerHeight * 0.5 && fr.width < window.innerWidth * 0.9 && fr.top < minTop) { minTop = fr.top; found = fixed; }
                }
                break;
            }
        }
        if (found) {
            // Öğenin hemen üstüne, 8 px boşlukla
            liftVal = Math.round(clamp(baseBottom - minTop + 8, 0, window.innerHeight * 0.5));
            liftEl = found;
        } else if (!(liftEl && liftEl.isConnected)) {
            liftEl = null; liftVal = 0;                 // öğe sayfadan tamamen kalktıysa panel yerine döner
        }
        if ((parseFloat(panel.style.getPropertyValue('--lift')) || 0) !== liftVal) panel.style.setProperty('--lift', liftVal + 'px');
    }

    // Sitenin kendi "yukarı çık" düğmesi artık düğme gizletmez (kaydırınca kaybolan, yalnız en üstte
    // görünen bir düğme işe yaramıyordu). Panel o düğmenin/sohbet balonunun üstüne kalkar: avoidWidgets().
    function checkConflict() { avoidWidgets(); }

    // ── Görünürlük ─────────────────────────────────────────────────────────
    let hiddenReason = '';
    function updatePanel() {
        if (!panel) return;
        if (hostEl && !hostEl.isConnected) ensureHost();
        const i = scrollInfo();
        // Kısa (neredeyse kaydırılamayan) sayfada da panel kalır: menü, tema ve ayarlar burada da gerekir.
        // Yalnız soluk durur; üzerine gelince tam görünür.
        const short = !(i.max > i.view * 0.5);
        hiddenReason = '';
        panel.classList.remove('hidden');
        panel.classList.toggle('short', short);
        avoidWidgets();
    }

    // ── Kaydırma olayı: ilerleme, yön, konum belleği ───────────────────────
    let progRaf = 0, lastTop = 0;
    function onScroll() {
        if (progRaf) return;
        progRaf = requestAnimationFrame(() => {
            progRaf = 0;
            updateProgress();
            savePosition();
            // Sitenin kendi "yukarı çık" düğmesi kaydırınca belirebilir: sık ama seyrek kontrol
            const now = Date.now();
            if (panel && now - lastSiteCheck > 400) { lastSiteCheck = now; checkConflict(); avoidWidgets(); }
            // Açık/koyu bölümler arasında geçerken panel tonu da hemen uysun (2,5 sn beklemeden)
            if (panel && now - lastToneAt > 250) { lastToneAt = now; applyTone(); }
            clearTimeout(toneT); toneT = setTimeout(() => { if (panel) applyTone(); }, 300);
        });
    }
    let lastSiteCheck = 0, lastToneAt = 0, toneT = 0;
    function updateProgress() {
        if (!panel) return;
        const i = scrollInfo();
        if (i.max > growth.max + i.view * 0.8 && growth.max > 0 && i.top > growth.max - i.view * 2) growth.n++;
        growth.max = Math.max(growth.max, i.max);
        fab.style.setProperty('--p', String(progressPercent(i)));
        fab.classList.toggle('inf', growth.n >= 3);
        fab.classList.toggle('down', fabMode(i) === 'down');
        if (S.autoHide && !panel.classList.contains('open')) {
            const d = i.top - lastTop;
            if (d > 4) panel.classList.add('rest'); else if (d < -4) panel.classList.remove('rest');
        }
        panel.classList.toggle('attop', i.top < i.view * 0.35);
        lastTop = i.top;
        if (fab.matches(':hover')) { fab.setAttribute('data-ttip', fabLabel()); Tip.update(fab); }
        if (panel.classList.contains('short') && i.max > i.view * 0.5) updatePanel();
    }

    // ── Menü ───────────────────────────────────────────────────────────────
    function closeMenu() {
        if (menu) { menu.remove(); menu = null; }
        document.removeEventListener('pointerdown', dismissMenu, true);
        if (panel && !panel.matches(':hover')) scheduleClose();
    }
    function dismissMenu(e) { if (e.target !== hostEl) closeMenu(); }
    function mi(icon, text, attrs) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mi';
        b.setAttribute('role', 'menuitem');
        b.innerHTML = (icon || '') + '<span>' + esc(text) + '</span>';
        if (attrs) Object.entries(attrs).forEach(([k, v]) => b.setAttribute(k, v));
        return b;
    }
    function shell() {
        if (!menu) {
            menu = document.createElement('div');
            menu.id = 'menu';
            menu.setAttribute('role', 'menu');
            menu.addEventListener('keydown', menuKeys);
            shadow.appendChild(menu);
            setTimeout(() => document.addEventListener('pointerdown', dismissMenu, true), 0);
        }
        menu.className = themeClass();
        menu.replaceChildren();
        return menu;
    }
    function placeMenu() {
        if (!menu || !fab) return;
        const r = fab.getBoundingClientRect();
        const mw = menu.offsetWidth, mh = menu.offsetHeight;
        let left = r.left - mw - 12;
        if (left < 8) left = r.right + 12;
        left = clamp(left, 8, window.innerWidth - mw - 8);
        const top = clamp(r.bottom - mh, 8, window.innerHeight - mh - 8);
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
    }
    function finishMenu(focusSel) {
        placeMenu();
        const f = (focusSel && menu.querySelector(focusSel)) || menu.querySelector('.mi, .seg button');
        if (f) f.focus({ preventScroll: true });
    }
    function menuItems() { return menu ? Array.from(menu.querySelectorAll('.mi, .seg button')) : []; }
    function menuKeys(e) {
        const items = menuItems();
        const idx = items.indexOf(shadow.activeElement);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const n = items.length;
            if (!n) return;
            const next = idx < 0 ? 0 : (idx + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
            items[next].focus();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeMenu();
            if (fab) fab.focus({ preventScroll: true });
        } else if (e.key === 'ArrowLeft' && menu.querySelector('[data-back]')) {
            e.preventDefault();
            renderMainMenu();
        }
    }
    function openMenu() {
        if (menu) { closeMenu(); return; }
        openStack();
        renderMainMenu();
    }
    function renderMainMenu() {
        const L = T();
        const m = shell();
        const h = mi(ICON.list, L.headings);
        h.addEventListener('click', renderHeadings);
        const b = mi(ICON.mark, L.bookmarks);
        b.addEventListener('click', () => loadMarks(renderBookmarks));
        const a = mi(ICON.play, L.autoScroll, { 'aria-keyshortcuts': 'Alt+S' });
        a.insertAdjacentHTML('beforeend', '<small>Alt+S</small>');
        a.addEventListener('click', () => { closeMenu(); startAutoScroll(); });
        m.append(h, b, a);
        const sep = document.createElement('div'); sep.className = 'sepl'; m.append(sep);
        const head = document.createElement('div'); head.className = 'mh'; head.textContent = L.dimming; m.append(head);
        const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'group');
        const cur = DARK ? DARK.siteMode : 'auto';
        [['off', L.mOff], ['on', L.mOn], ['auto', L.mAuto]].forEach(([v, t]) => {
            const s = document.createElement('button');
            s.type = 'button'; s.textContent = t; s.setAttribute('role', 'menuitemradio');
            s.setAttribute('aria-checked', String(v === cur));
            if (v === cur) s.className = 'on';
            s.addEventListener('click', () => setSiteDark(v, () => renderMainMenu()));
            seg.append(s);
        });
        m.append(seg);
        if (DARK && DARK.reason && L.r[DARK.reason]) {
            const note = document.createElement('div'); note.className = 'note';
            note.textContent = nowText(L) + ' · ' + L.r[DARK.reason];
            m.append(note);
        }
        const sep2 = document.createElement('div'); sep2.className = 'sepl'; m.append(sep2);
        if (panelXY) { const rp = mi(ICON.target, L.resetPos); rp.addEventListener('click', () => { resetPanelXY(); closeMenu(); }); m.append(rp); }
        const hide = mi(ICON.eyeOff, L.hideHere);
        hide.addEventListener('click', hidePanelHere);
        const st = mi(ICON.gear, L.settings);
        st.addEventListener('click', () => { closeMenu(); sendBg({ action: 'openOptions' }); });
        m.append(hide, st);
        finishMenu();
    }
    function backItem() {
        const b = mi(ICON.back, T().back, { 'data-back': '' });
        b.addEventListener('click', renderMainMenu);
        return b;
    }
    function collectHeadings() {
        const out = [];
        const list = document.querySelectorAll('h1, h2, h3');
        for (let i = 0; i < list.length && out.length < 100; i++) {
            const h = list[i];
            const txt = (h.textContent || '').replace(/\s+/g, ' ').trim();
            if (!txt || !h.getClientRects().length) continue;
            out.push({ el: h, txt: txt.slice(0, 90), lvl: +h.tagName[1] });
        }
        return out;
    }
    function renderHeadings() {
        const L = T();
        const m = shell();
        m.append(backItem());
        const heads = collectHeadings();
        if (!heads.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = L.noHeadings; m.append(e); finishMenu(); return; }
        const minLvl = Math.min(...heads.map((x) => x.lvl));
        const line = window.innerHeight * 0.35;
        let cur = 0;
        heads.forEach((x, i) => { if (x.el.getBoundingClientRect().top <= line) cur = i; });
        const box = document.createElement('div'); box.className = 'list';
        heads.forEach((x, i) => {
            const b = mi('', x.txt);
            b.classList.add('lvl-' + (x.lvl - minLvl + 1));
            if (i === cur) b.classList.add('current');
            b.title = x.txt;
            b.addEventListener('click', () => { rememberJump(scrollInfo().top); scrollToElement(x.el); closeMenu(); });
            box.append(b);
        });
        m.append(box);
        finishMenu('.list .current');
        const c = box.querySelector('.current');
        if (c) c.scrollIntoView({ block: 'nearest' });
    }

    // ── Yer imleri: öğe çapası + göreli konum (sayfa değişse de kaymaz) ────
    let marks = null;
    const pageKey = () => location.host + location.pathname + location.search;
    const marksKey = () => 'nvpMarks:' + pageKey();
    function loadMarks(cb) {
        if (marks) { if (cb) cb(); return; }
        const k = marksKey();
        localGet(k, (r) => { marks = Array.isArray(r[k]) ? r[k] : []; if (cb) cb(); });
    }
    function saveMarks() { if (!marks || !marks.length) localRemove(marksKey()); else localSet({ [marksKey()]: marks }); }
    function cssPath(el) {
        const parts = [];
        for (let n = el, k = 0; n && n.nodeType === 1 && n !== document.body && k < 7; k++, n = n.parentElement) {
            if (n.id && !/\d{4,}/.test(n.id)) {
                let sel = '#' + CSS.escape(n.id);
                try { if (document.querySelectorAll(sel).length === 1) { parts.unshift(sel); return parts.join('>'); } } catch (_) { /* yok say */ }
            }
            let i = 1;
            for (let s = n.previousElementSibling; s; s = s.previousElementSibling) if (s.localName === n.localName) i++;
            parts.unshift(n.localName + ':nth-of-type(' + i + ')');
        }
        return 'body>' + parts.join('>');
    }
    function jumpToMark(mk) {
        rememberJump(scrollInfo().top);
        let el = null;
        try { el = mk.sel ? document.querySelector(mk.sel) : null; } catch (_) { el = null; }
        if (el && mk.label && !(el.textContent || '').replace(/\s+/g, ' ').includes(mk.label.slice(0, 20))) el = null;
        if (el) {
            const i = scrollInfo();
            scrollToY(i.top + (el.getBoundingClientRect().top - i.rectTop) + (mk.off || 0) - topObstruction(i) - 60);
        } else scrollToY(mk.y);
    }
    function renderBookmarks() {
        const L = T();
        const m = shell();
        m.append(backItem());
        if (!marks.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = L.noBookmarks; m.append(e); finishMenu(); return; }
        const box = document.createElement('div'); box.className = 'list';
        marks.slice().sort((x, y) => x.y - y.y).forEach((mk) => {
            const row = document.createElement('div'); row.className = 'row';
            const go = mi(ICON.mark, mk.label || Math.round(mk.y) + 'px');
            go.title = mk.label || '';
            go.addEventListener('click', () => { jumpToMark(mk); closeMenu(); });
            const del = mi(ICON.x, '', { 'aria-label': L.remove, title: L.remove });
            del.classList.add('del');
            del.addEventListener('click', () => { marks = marks.filter((x) => x !== mk); saveMarks(); renderBookmarks(); });
            row.append(go, del);
            box.append(row);
        });
        m.append(box);
        const clr = mi(ICON.x, L.clearBookmarks);
        clr.addEventListener('click', () => { marks = []; saveMarks(); renderBookmarks(); });
        m.append(clr);
        finishMenu();
    }
    document.addEventListener('click', (e) => {
        if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0 || e.defaultPrevented) return;
        if (e.target === hostEl || !S.gestures || !extensionActiveHere()) return;
        const t = pathTarget(e);
        if (!t || !t.closest || t.closest('a[href], input, textarea, select, button, label, canvas, svg, video, [contenteditable], [role="application"], [role="button"], [role="textbox"]')) return;
        e.preventDefault();
        const i = scrollInfo();
        const src = t.closest('h1, h2, h3, h4, h5, h6, p, li, td, blockquote, figcaption, pre, dd, dt') || t;
        const label = (src.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        const off = Math.round(e.clientY - src.getBoundingClientRect().top);
        const y = Math.max(0, Math.round(i.top + (e.clientY - i.rectTop) - 80));
        loadMarks(() => {
            marks.push({ sel: cssPath(src), off, y, label, t: Date.now() });
            if (marks.length > 20) marks.shift();
            saveMarks();
            toast(T().bookmarkAdded + ' (' + marks.length + ')');
        });
    }, true);

    // ── Otomatik kaydırma (Alt+S) ──────────────────────────────────────────
    const auto = { on: false, raf: 0, last: 0, acc: 0, pill: null, saveT: null, snapEl: null, snapVal: '' };
    const autoSpeed = () => num(S.autoScrollSpeed, 10, 400, 40);
    function renderAutoPill() {
        if (!auto.pill) return;
        const L = T();
        auto.pill.className = 'pill auto show ' + themeClass();
        auto.pill.replaceChildren();
        const txt = document.createElement('span');
        txt.textContent = L.autoScrollOn + ' · ' + autoSpeed() + ' ' + L.speedUnit;
        const mk = (label, title, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.title = title; b.setAttribute('aria-label', title); b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); return b; };
        auto.pill.append(txt, mk('−', L.slower, () => adjustAutoSpeed(-10)), mk('+', L.faster, () => adjustAutoSpeed(10)), mk('■', L.stop, stopAutoScroll));
        placeNearPanel(auto.pill, 0);
    }
    function adjustAutoSpeed(d) {
        S.autoScrollSpeed = clamp(autoSpeed() + d, 10, 400);
        renderAutoPill();
        clearTimeout(auto.saveT);
        auto.saveT = setTimeout(() => syncSet({ autoScrollSpeed: S.autoScrollSpeed }), 800);
    }
    function autoStep(ts) {
        if (!auto.on) return;
        const dt = auto.last ? Math.min(100, ts - auto.last) : 16;
        auto.last = ts;
        auto.acc += autoSpeed() * dt / 1000;
        if (auto.acc >= 1) {
            const n = Math.floor(auto.acc);
            auto.acc -= n;
            const i = scrollInfo();
            if (i.top >= i.max - 1) { stopAutoScroll(); return; }
            rawScroll(i, i.top + n, 'instant');
        }
        auto.raf = requestAnimationFrame(autoStep);
    }
    function startAutoScroll() {
        if (auto.on) return;
        ensureHost();
        auto.on = true; auto.last = 0; auto.acc = 0;
        // scroll-snap otomatik kaydırmayı geri çeker: geçici olarak kapat
        const i = scrollInfo();
        const snapEl = i.el || document.documentElement;
        const snap = getComputedStyle(snapEl).scrollSnapType;
        if (snap && snap !== 'none') { auto.snapEl = snapEl; auto.snapVal = snapEl.style.getPropertyValue('scroll-snap-type'); snapEl.style.setProperty('scroll-snap-type', 'none', 'important'); }
        if (!auto.pill) auto.pill = document.createElement('div');
        auto.pill.setAttribute('role', 'status');
        shadow.appendChild(auto.pill);
        renderAutoPill();
        auto.raf = requestAnimationFrame(autoStep);
        document.addEventListener('mousedown', autoMouseStop, true);
    }
    function stopAutoScroll() {
        if (!auto.on) return;
        auto.on = false;
        cancelAnimationFrame(auto.raf);
        if (auto.snapEl) { if (auto.snapVal) auto.snapEl.style.setProperty('scroll-snap-type', auto.snapVal); else auto.snapEl.style.removeProperty('scroll-snap-type'); auto.snapEl = null; }
        if (auto.pill) auto.pill.remove();
        document.removeEventListener('mousedown', autoMouseStop, true);
    }
    function autoMouseStop(e) { if (e.target !== hostEl) stopAutoScroll(); }
    const toggleAutoScroll = () => (auto.on ? stopAutoScroll() : startAutoScroll());

    // ── Klavye kısayolları ─────────────────────────────────────────────────
    function isEditable(t) {
        if (!t || t.nodeType !== 1) return false;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return true;
        return !!(t.closest && t.closest('[contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"]'));
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && (auto.on || menu)) { stopAutoScroll(); closeMenu(); return; }
        if (e.defaultPrevented || !S.keyboardShortcuts || !extensionActiveHere()) return;
        if (isEditable(pathTarget(e))) return;
        if (auto.on && !e.altKey && !e.ctrlKey && !e.metaKey) {
            if (e.key === '+' || e.key === '=') { e.preventDefault(); adjustAutoSpeed(10); return; }
            if (e.key === '-' || e.key === '_') { e.preventDefault(); adjustAutoSpeed(-10); return; }
        }
        if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            if (e.key === 'ArrowUp') { e.preventDefault(); scrollWholePage('page-up'); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); scrollWholePage('page-down'); }
            else if (e.code === 'KeyS') { e.preventDefault(); toggleAutoScroll(); }
        } else if (e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey) {
            if (e.key === 'ArrowUp') { e.preventDefault(); scrollWholePage('top'); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); scrollWholePage('bottom'); }
        }
    });

    // ── Kaydırma konumu belleği ────────────────────────────────────────────
    const POS_PREFIX = 'nvpPos:';
    let positionTimer = null, positionRestored = false, posPruned = false;
    function navType() { try { const n = performance.getEntriesByType('navigation')[0]; return n ? n.type : ''; } catch (_) { return ''; } }
    function restorePositionOnce() {
        if (positionRestored || !S.rememberPosition || !extensionActiveHere()) return;
        positionRestored = true;
        if (location.hash) return;                                      // bağlantı çapası öncelikli
        if (['reload', 'back_forward'].includes(navType())) return;      // tarayıcı zaten geri yükler
        const k = POS_PREFIX + pageKey();
        localGet(k, (r) => {
            const p = r[k];
            if (!p || typeof p.y !== 'number' || p.y <= 0) return;
            const tryIt = (left) => {
                const i = scrollInfo();
                if (i.top > 40) return;
                if (i.max >= p.y || left <= 0) { scrollToY(p.y, false); return; }
                setTimeout(() => tryIt(left - 1), 400); // geç yüklenen içerik (Angular vb.) için bekle
            };
            tryIt(20);
        });
    }
    function savePosition() {
        if (!positionRestored || !S.rememberPosition || !alive() || !extensionActiveHere()) return;
        clearTimeout(positionTimer);
        positionTimer = setTimeout(() => {
            const k = POS_PREFIX + pageKey();
            localSet({ [k]: { y: Math.round(scrollInfo().top), t: Date.now() } });
            if (!posPruned) {
                posPruned = true;
                localGet(null, (all) => {
                    const ks = Object.keys(all).filter((x) => x.startsWith(POS_PREFIX));
                    if (ks.length <= 200) return;
                    ks.sort((x, y) => ((all[x] && all[x].t) || 0) - ((all[y] && all[y].t) || 0));
                    localRemove(ks.slice(0, ks.length - 200));
                });
            }
        }, 500);
    }

    // ── Karartma (dark.js ile köprü) ───────────────────────────────────────
    function setSiteDark(mode, cb) {
        if (!DARK) return;
        DARK.setSiteMode(mode, () => { onDarkChange(); if (cb) cb(); });
    }
    // Döngü her yerde aynı sırada: Aydınlık (off) → Karanlık (on) → Sistem (auto)
    const nowText = (L) => (DARK && DARK.reason === 'lighten' ? L.nowLight : DARK && DARK.state === 'on' ? L.nowOn : L.nowOff);
    function cycleSiteDark() {
        if (!DARK) return;
        const cur = DARK.siteMode;
        const next = cur === 'off' ? 'on' : cur === 'on' ? 'auto' : 'off';
        setSiteDark(next, () => {
            const L = T();
            toast((next === 'on' ? L.darkOn : next === 'off' ? L.darkOff : L.darkAuto) + ' — ' + nowText(L));
        });
    }
    function onDarkChange() {
        applyHostFilter();
        updateThemeButton();
        applyTone();
        sendBadge();
    }
    if (DARK) DARK.onChange(onDarkChange);

    function hidePanelHere() {
        closeMenu();
        syncGet({ siteRules: [] }, (r) => {
            const rules = Array.isArray(r.siteRules) ? r.siteRules.filter((x) => !(x && ruleMatches(x.selector, HOST) && x.selector.toLowerCase() === HOST)) : [];
            rules.push({ selector: HOST, action: 'hide' });
            S.siteRules = rules;
            syncSet({ siteRules: rules });
            destroyPanel();
            hiddenReason = 'rule';
            toast(T().hiddenHere);
        });
    }
    function showPanelHere() {
        syncGet({ siteRules: [] }, (r) => {
            const rules = (Array.isArray(r.siteRules) ? r.siteRules : []).filter((x) => !(x && x.action === 'hide' && ruleMatches(x.selector, HOST)));
            S.siteRules = rules;
            syncSet({ siteRules: rules }, () => reevaluate());
        });
    }

    function sendBadge() {
        const paused = !extensionActiveHere();
        sendBg({ action: 'badge', text: paused ? 'OFF' : '', color: '#8a8a96' });
    }

    // ── SPA rota değişimleri ───────────────────────────────────────────────
    let lastUrl = location.href;
    function urlChanged() {
        if (location.href === lastUrl) return;
        lastUrl = location.href;
        setScroller(null); scrollerT = 0;
        marks = null;
        wordCache.t = 0;
        growth = { max: 0, n: 0 };
        pendingStep = null;
        closeMenu();
        hideReturnButton();
        positionRestored = false;
        setTimeout(() => { restorePositionOnce(); checkConflict(); updatePanel(); updateProgress(); }, 500);
    }
    if (window.navigation && window.navigation.addEventListener) window.navigation.addEventListener('navigatesuccess', urlChanged);
    window.addEventListener('popstate', urlChanged);
    window.addEventListener('hashchange', () => { lastUrl = location.href; });
    setInterval(urlChanged, 1000);

    // ── DOM gözlemcisi, boyut, tam ekran ───────────────────────────────────
    let domTimer = null;
    const domObs = new MutationObserver((muts) => {
        if (!panel) return;
        if (!muts.some((m) => m.addedNodes.length || m.removedNodes.length)) return;
        if (domTimer) return;
        domTimer = setTimeout(() => {
            domTimer = null;
            wordCache.t = 0;
            if (hostEl && !hostEl.isConnected) ensureHost();
            updatePanel();
            checkConflict();
        }, 600);
    });
    function startDomObserver() {
        const go = () => { if (document.body) domObs.observe(document.body, { childList: true, subtree: true }); };
        if (document.body) go(); else document.addEventListener('DOMContentLoaded', go, { once: true });
    }
    startDomObserver();
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            setScroller(null); scrollerT = 0;
            if (panelXY) setPanelXY(panelXY.x, panelXY.y);
            updatePanel();
            placeMenu();
            updateProgress();
            applyTone();
        }, 150);
    });
    document.addEventListener('fullscreenchange', () => {
        if (!hostEl) return;
        if (document.fullscreenElement) hostEl.setAttribute('data-fs', ''); else hostEl.removeAttribute('data-fs');
    });
    [1000, 2000, 3500].forEach((ms) => setTimeout(() => { if (!panel) return; setScroller(null); scrollerT = 0; updatePanel(); updateProgress(); }, ms));
    window.addEventListener('load', () => { setScroller(null); scrollerT = 0; updatePanel(); updateProgress(); applyTone(); restorePositionOnce(); checkConflict(); });
    // Sayfa rengi kaydırdıkça değişebilir (koyu/açık bölümler): ara sıra yeniden örnekle
    setInterval(() => { if (panel && !panel.classList.contains('hidden') && document.visibilityState === 'visible') { applyTone(); avoidWidgets(); } }, 2500);

    // ── Yeniden değerlendirme ──────────────────────────────────────────────
    function reevaluate() {
        sendBadge();
        if (!extensionActiveHere()) { destroyPanel(); removeHost(); hiddenReason = 'paused'; return; }
        if (document.readyState === 'complete') restorePositionOnce();
        if (ruleState().hide && !ruleState().show) { destroyPanel(); hiddenReason = 'rule'; return; }
        if (panel && panel.isConnected && lastPanelKey === panelKey()) { applyTone(); updateThemeButton(); updatePanel(); }
        else createPanel();
    }
    let reevalTimer = null;
    function scheduleReevaluate() {
        clearTimeout(reevalTimer);
        reevalTimer = setTimeout(() => syncGet(defaults, (r) => { S = r; reevaluate(); }), 150);
    }
    if (chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (!alive() || area !== 'sync') return;
            if (Object.keys(changes).some((k) => k in defaults)) scheduleReevaluate();
        });
    }

    // ── Mesajlar (popup / arka plan) ───────────────────────────────────────
    if (chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((msg, sender, reply) => {
            if (!msg || !msg.action) return;
            if (msg.action === 'scroll' && msg.type) { scrollWholePage(msg.type); reply({ ok: true }); }
            else if (msg.action === 'getState') {
                syncGet(defaults, (fresh) => {
                    S = fresh;
                    const i = scrollInfo();
                    reply({
                        host: HOST, supported: true,
                        globallyPaused: !!S.paused,
                        pausedOnSite: pausedOnSite(),
                        activeOnSite: (S.activeSites || []).includes(HOST),
                        enableAllSites: !!S.enableAllSites,
                        active: extensionActiveHere(),
                        panelHidden: ruleState().hide && !ruleState().show,
                        visible: !!(panel && !panel.classList.contains('hidden')),
                        hiddenReason: !extensionActiveHere() ? 'paused' : (ruleState().hide && !ruleState().show) ? 'rule' : hiddenReason,
                        progress: progressPercent(i),
                        dark: DARK ? { state: DARK.state, reason: DARK.reason, siteMode: DARK.siteMode, globalMode: DARK.globalMode } : null
                    });
                });
                return true;
            } else if (msg.action === 'pauseUpdate') {
                syncGet(defaults, (r) => { S = r; reevaluate(); reply({}); });
                return true;
            } else if (msg.action === 'pauseGuncelle') {
                syncGet(defaults, (r) => {
                    S = r;
                    S.paused = !S.paused;
                    syncSet({ paused: S.paused }, () => { reevaluate(); reply({ paused: S.paused }); });
                });
                return true;
            } else if (msg.action === 'togglePanelHere') {
                if (ruleState().hide) showPanelHere(); else hidePanelHere();
                reply({});
            } else if (msg.action === 'toggleTheme') {
                if (extensionActiveHere()) { cycleSiteDark(); reply({ toggled: true }); } else reply({ toggled: false });
            } else if (msg.action === 'setSiteDark') {
                if (DARK) { setSiteDark(msg.mode, () => reply({ dark: { state: DARK.state, reason: DARK.reason, siteMode: DARK.siteMode } })); return true; }
                reply({});
            }
        });
    }

    // ── Başlangıç ──────────────────────────────────────────────────────────
    if (!alive()) return;
    syncGet(defaults, (r) => { S = r; reevaluate(); });
})();
