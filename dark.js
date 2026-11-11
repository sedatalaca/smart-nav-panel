// Smart Nav Panel — Copyright (C) 2026 LikaGroup (Sedat Alaca-LikaPulse)
// SPDX-License-Identifier: GPL-3.0-or-later
/* ============================================================================
 * dark.js — Akıllı sayfa karartma (content script, run_at: document_start)
 *
 * Kurallar
 *  - Site başına seçim (storage.local → siteDark[host] = 'on' | 'off') her şeyden önce gelir.
 *  - Genel seçim pageDark: 'auto' (varsayılan) | 'always' | 'never'.
 *  - 'auto': yalnız işletim sistemi karanlıksa ve sayfa AÇIK renkliyse karartır.
 *    Sitenin kendi karanlık modu varsa (işaretler, renk şeması, CSS kuralları, tema
 *    düğmesi) ya da sayfa zaten koyuysa ASLA karartmaz.
 *  - Karar host başına önbelleğe alınır (storage.local → nvpDarkCache:<host>); bir
 *    sonraki açılışta stil ilk boyamadan önce eklenir → beyaz flaş olmaz.
 *  - Sonradan tema değiştiren siteler (SPA, hidrasyon) öznitelik gözlemcisiyle izlenir.
 *
 * content.js ile aynı izole dünyada çalışır; durum window.__nvpDark üzerinden paylaşılır.
 * ============================================================================ */
(function () {
    'use strict';
    if (window.__nvpDark) {
        try { if (window.__nvpDark.alive && window.__nvpDark.alive()) return; } catch (_) { /* öksüz kopya */ }
        const old = document.getElementById('nvp-dark');
        if (old) old.remove();
    }

    const HOST = location.hostname;
    const CACHE_KEY = 'nvpDarkCache:' + HOST;
    const listeners = new Set();
    const api = window.__nvpDark = {
        state: 'off',          // 'on' | 'off'
        reason: 'pending',     // neden (popup ve ipucunda gösterilir)
        siteMode: 'auto',      // bu site için kullanıcı seçimi: 'auto' | 'on' | 'off'
        globalMode: 'auto',    // pageDark
        counter: '',           // panel kökünü geri çevirecek filtre
        onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        recheck: () => evaluate(true),
        alive: () => alive(),
        setSiteMode
    };

    const DEF = {
        // etkinlik
        paused: false, pausedSites: [], enableAllSites: true, activeSites: [], siteRules: [],
        // karartma
        pageDark: 'auto', darkModeMethod: 'smart', smartThreshold: 45, smartTint: true, smartTintThreshold: 45, smartBands: true, smartBandThreshold: 35,
        darkModeAreas: { body: true, text: false, link: false, button: false, image: false, form: false, code: false, table: false, scrollbar: false },
        excludeCss: '', invertIntensity: 1, invertBrightness: 1, invertContrast: 1, invertGrayscale: 0, invertWarmth: 0,
        invertDim: false, invertImageMode: 'original', invertAreas: { image: false },
        invertOverrideText: false, invertTextColor: '#e1e1e6', invertOverrideLink: false, invertLinkColor: '#4dabf7',
        invertOverrideBg: false, invertBgColor: '#121214',
        overlayHeadingColor: false, overlayHeadingColorHex: '#e0e0e0', overlayBoldColor: false, overlayBoldColorHex: '#e0e0e0',
        overlaySvgColor: false, overlaySvgColorHex: '#e1e1e6', overlayGrayscale: false,
        overlayLineHeight: '', overlayLetterSpacing: '', overlayTextShadow: '', overlayFontFamily: '',
        darkSiteRules: {}, darkSchedule: { enabled: false, startHour: 20, startMin: 0, endHour: 7, endMin: 0 },
        darkFontSize: 0, darkFontWeight: 0, darkFilters: { saturate: 100, hueRotate: 0 }, darkTransition: 300,
        darkExcludeSites: [], siteThemes: {},
        hoverColor: '#37a8a8', bgColorHex: '#1e1e24', buttonColor: '#2d2d37'
    };
    let S = { ...DEF };
    let siteDark = {};
    let cached = null;          // 'dark' | 'light' | null
    let loaded = false;
    let measuredOnce = false;
    let styleEl = null;
    let hoverEl = null;          // sitenin :hover/:focus/:active kurallarının koyu eşleri (ayrı stil: ölçümde kapatılabilsin)
    let appliedKey = '';
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false, addEventListener() {} };

    const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; } };

    // ── Etkinlik (content.js ile aynı kural) ───────────────────────────────
    function ruleMatches(sel, host) {
        sel = String(sel || '').trim().toLowerCase();
        return !!sel && (host === sel || host.endsWith('.' + sel));
    }
    function activeHere() {
        let show = false;
        for (const r of (S.siteRules || [])) if (r && r.action === 'show' && ruleMatches(r.selector, HOST)) show = true;
        if (show) return true;
        if (S.paused || (S.pausedSites || []).includes(HOST)) return false;
        return S.enableAllSites || (S.activeSites || []).includes(HOST);
    }

    // ── Kullanıcı seçimi ───────────────────────────────────────────────────
    function readSiteMode() {
        const v = siteDark[HOST];
        if (v === 'on' || v === 'off') return v;
        // eski sürüm kayıtları (taşınmamışsa)
        const old = S.siteThemes && S.siteThemes[HOST] && S.siteThemes[HOST].mod;
        if (old === 'dark') return 'on';
        if (old === 'light') return 'off';
        if ((S.darkExcludeSites || []).includes(HOST)) return 'off';
        return 'auto';
    }
    function scheduleActive(s) {
        if (!s || !s.enabled) return true;
        const now = new Date(), cur = now.getHours() * 60 + now.getMinutes();
        const a = (s.startHour || 0) * 60 + (s.startMin || 0), b = (s.endHour || 0) * 60 + (s.endMin || 0);
        if (a === b) return true;
        return a < b ? (cur >= a && cur < b) : (cur >= a || cur < b);
    }

    // ── Yerel karanlık mod algılama ────────────────────────────────────────
    function parseRgb(str) {
        const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/i.exec(str || '');
        if (!m) return null;
        let a = m[4] === undefined ? 1 : parseFloat(m[4]);
        if (m[4] && m[4].endsWith('%')) a /= 100;
        return { r: +m[1], g: +m[2], b: +m[3], a };
    }
    function lum(c) {
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    }
    const DARK_CLASS = /(^|\s)(dark|dark-mode|darkmode|dark-theme|theme-dark|theme--dark|is-dark|night-mode|nightmode|mode-dark)(?=\s|$)/i;
    const THEME_ATTRS = ['data-theme', 'data-color-mode', 'data-bs-theme', 'data-mode', 'data-color-scheme', 'data-appearance', 'theme', 'data-dark-mode'];
    function markers() {
        const html = document.documentElement, body = document.body;
        if (html.hasAttribute('data-darkreader-mode') || html.hasAttribute('data-darkreader-scheme') || document.querySelector('meta[name="darkreader"]')) return 'darkreader';
        if (html.hasAttribute('dark')) return 'native';
        for (const el of [html, body]) {
            if (!el) continue;
            if (DARK_CLASS.test(el.getAttribute('class') || '')) return 'native';
            for (const a of THEME_ATTRS) { const v = el.getAttribute(a); if (v && /dark|night/i.test(v)) return 'native'; }
        }
        const meta = document.querySelector('meta[name="color-scheme"]');
        const mc = meta ? (meta.getAttribute('content') || '').trim().toLowerCase() : '';
        if (mc === 'dark' || mc === 'only dark') return 'native';
        const cs = (getComputedStyle(html).colorScheme || '').trim().toLowerCase();
        if (cs === 'dark' || cs === 'only dark') return 'native';
        return '';
    }
    // Modal / ışık kutusu / video penceresi arkasındaki koyu örtü: ekranı kaplayan, konumlu,
    // koyu ve yarı saydam (ya da adı backdrop/overlay/modal… olan) katman. Sayfanın kendi zemini
    // sayılmaz; açıkken karartma kararı değiştirilmez ve örtüye dokunulmaz.
    const BACKDROP_RE = /backdrop|overlay|modal|lightbox|scrim|dimmer|curtain|popup-bg|mask/i;
    function isBackdrop(el, cs) {
        if (!el || el.nodeType !== 1) return false;
        cs = cs || getComputedStyle(el);
        if (cs.position !== 'fixed' && cs.position !== 'absolute') return false;
        const bg = parseRgb(cs.backgroundColor);
        if (!bg || bg.a < 0.15 || lum(bg) > 0.12) return false;
        const r = el.getBoundingClientRect();
        if (r.width < window.innerWidth * 0.85 || r.height < window.innerHeight * 0.85) return false;
        const name = (typeof el.className === 'string' ? el.className : '') + ' ' + (el.id || '');
        return bg.a < 0.97 || BACKDROP_RE.test(name);
    }
    function overlayOpen() {
        if (!document.body) return false;
        try {
            for (const d of document.querySelectorAll('dialog[open], [aria-modal="true"]')) if (d.getClientRects().length) return true;
        } catch (_) { /* yok say */ }
        let list = [];
        try { list = document.elementsFromPoint(window.innerWidth / 2, window.innerHeight / 2); } catch (_) { list = []; }
        for (const el of list.slice(0, 8)) {
            if (el.localName === 'nvp-root') continue;
            if (el === document.body || el === document.documentElement) break;
            for (let n = el, k = 0; n && n !== document.body && k < 12; n = n.parentElement, k++) if (isBackdrop(n)) return true;
        }
        return false;
    }

    // Ekranda gerçekten görünen arka plan (body çoğu zaman saydamdır; sarmalayıcılar sayılır)
    function backgroundAt(x, y) {
        let list = [];
        try { list = document.elementsFromPoint(x, y); } catch (_) { list = []; }
        for (const el of list) {
            if (el.localName === 'nvp-root' || isBackdrop(el)) continue;   // modal/video örtüsü sayfanın zemini değildir
            const o = SMART.oc.get(el);
            const c = parseRgb(o ? o.bg : getComputedStyle(el).backgroundColor);
            if (c && c.a >= 0.6) return c;
        }
        return null;
    }
    function rootBackground() {
        for (const el of [document.body, document.documentElement]) {
            if (!el) continue;
            const c = parseRgb(getComputedStyle(el).backgroundColor);
            if (c && c.a >= 0.6) return c;
        }
        const cs = (getComputedStyle(document.documentElement).colorScheme || '').toLowerCase();
        return (cs.includes('dark') && mq.matches) ? { r: 18, g: 18, b: 18, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
    }
    function alreadyDark() {
        if (!document.body) return false;
        const W = window.innerWidth, H = window.innerHeight;
        const pts = [[0.5, 0.5], [0.25, 0.3], [0.75, 0.3], [0.25, 0.75], [0.75, 0.75], [0.5, 0.08]];
        const fallback = rootBackground();
        let sum = 0;
        for (const [fx, fy] of pts) sum += lum(backgroundAt(W * fx, H * fy) || fallback);
        const bg = sum / pts.length;
        const textEl = document.querySelector('main p, article p, p, main, article') || document.body;
        const to = SMART.oc.get(textEl);
        const tc = parseRgb(to ? to.fg : getComputedStyle(textEl).color);
        const text = tc ? lum(tc) : 0;
        return bg < 0.3 || (text > 0.55 && bg < 0.5);
    }
    // Sitenin kendi karanlık modu var mı (şu an açık olmasa bile)?
    const TOGGLE_SEL = [
        '[aria-label*="dark mode" i]', '[title*="dark mode" i]', '[aria-label*="dark theme" i]', '[aria-label*="toggle theme" i]',
        '[aria-label*="switch theme" i]', '[aria-label*="color mode" i]', '[aria-label*="colour mode" i]', '[aria-label*="karanlık mod" i]',
        '[aria-label*="koyu tema" i]', '[aria-label*="gece modu" i]', '[aria-label*="тёмн" i]', '[aria-label*="темн" i]',
        '[class*="theme-toggle" i]', '[class*="theme-switch" i]', '[class*="dark-mode-toggle" i]', '[class*="darkmode-toggle" i]',
        '[class*="color-mode-toggle" i]', '[id*="theme-toggle" i]', '[id*="dark-mode" i]', '[data-theme-toggle]'
    ].join(',');
    let cssomCache = { n: -1, v: false };
    function cssomSupportsDark() {
        const sheets = document.styleSheets;
        if (sheets.length === cssomCache.n) return cssomCache.v;
        let hits = 0, scanned = 0;
        const SEL = /(^|[\s,>+~(])(:root|html|body)?(\.dark|\.dark-mode|\.theme-dark|\.night|\[data-theme\s*[*^~|]?=\s*["']?dark|\[data-(bs-)?theme\s*=\s*["']?dark|\[data-color-mode\s*=\s*["']?dark|\[data-mode\s*=\s*["']?dark|\[dark\])/i;
        const walk = (rules, inDarkMedia) => {
            for (let i = 0; i < rules.length && scanned < 20000 && hits < 8; i++) {
                const r = rules[i];
                scanned++;
                if (r.cssRules && r.media) {
                    const dm = inDarkMedia || /prefers-color-scheme\s*:\s*dark/i.test(r.media.mediaText || r.conditionText || '');
                    walk(r.cssRules, dm);
                } else if (r.cssRules) {
                    walk(r.cssRules, inDarkMedia);
                } else if (r.selectorText) {
                    if (inDarkMedia) hits++;
                    else if (SEL.test(r.selectorText)) hits++;
                }
            }
        };
        for (let i = 0; i < sheets.length && hits < 8; i++) {
            const sh = sheets[i];
            if (sh.ownerNode === styleEl || sh.ownerNode === hoverEl) continue;
            let rules = null;
            try { rules = sh.cssRules; } catch (_) { rules = null; } // farklı kökenli stil sayfası
            if (rules) walk(rules, /prefers-color-scheme\s*:\s*dark/i.test((sh.media && sh.media.mediaText) || ''));
            else if (sh.media && /prefers-color-scheme\s*:\s*dark/i.test(sh.media.mediaText || '')) hits += 8;
        }
        cssomCache = { n: sheets.length, v: hits >= 8 };
        return cssomCache.v;
    }
    function supportsDark() {
        const meta = document.querySelector('meta[name="color-scheme"]');
        if (meta && /dark/i.test(meta.getAttribute('content') || '')) return true;
        if (/dark/i.test(getComputedStyle(document.documentElement).colorScheme || '')) return true;
        try { if (document.querySelector(TOGGLE_SEL)) return true; } catch (_) { /* yok say */ }
        return cssomSupportsDark();
    }
    // Kendi stilimiz devre dışıyken ölç
    function detect() {
        const had = styleEl && styleEl.media !== 'not all';
        if (had) styleEl.media = 'not all';
        const hadH = hoverEl && hoverEl.isConnected && hoverEl.media !== 'not all';
        if (hadH) hoverEl.media = 'not all';
        let out = '';
        try {
            out = markers();
            if (!out && alreadyDark()) out = 'already-dark';
            if (!out && supportsDark()) out = 'supports';
        } catch (_) { out = ''; }
        if (had) styleEl.media = 'all';
        if (hadH) hoverEl.media = 'all';
        return out;
    }

    // ── Karar ──────────────────────────────────────────────────────────────
    function decide(measure) {
        api.siteMode = readSiteMode();
        api.globalMode = ['auto', 'always', 'never'].includes(S.pageDark) ? S.pageDark : 'auto';
        if (!activeHere()) return ['off', 'paused'];
        // Modal/video penceresi açıkken ölçüm yanıltır (koyu örtü "sayfa zaten koyu" sanılır): mevcut karar korunur
        const keep = () => (measure && document.body && api.reason !== 'pending' && overlayOpen()) ? [api.state, api.reason] : null;
        if (api.siteMode === 'off') {
            // Aydınlık: kendi karanlık temasındaki / zaten koyu siteyi açık renge çevir
            if (!measure || !document.body) return cached === 'lighten' ? ['on', 'lighten'] : ['off', 'user-off'];
            if (api.reason === 'lighten' || api.reason === 'user-off') { const k = keep(); if (k) return k; }
            const native = detect();
            measuredOnce = true;
            return (native === 'native' || native === 'already-dark') ? ['on', 'lighten'] : ['off', 'user-off'];
        }
        // Karanlık (site seçimi ya da genel "her zaman"): zaten koyu siteyi ters çevirip açmamak için ölç
        const forceDark = (reason) => {
            if (!measure || !document.body) return cached === 'light' ? ['off', 'already-dark'] : ['on', reason];
            const k = keep(); if (k) return k;
            const native = detect();
            measuredOnce = true;
            return (native === 'native' || native === 'already-dark' || native === 'darkreader') ? ['off', native] : ['on', reason];
        };
        if (api.siteMode === 'on') return forceDark('user-on');
        if (api.globalMode === 'never') return ['off', 'never'];
        if (!scheduleActive(S.darkSchedule)) return ['off', 'schedule'];
        if (api.globalMode === 'always') return forceDark('always');
        if (!mq.matches) return ['off', 'os-light'];
        if (!measure || !document.body) return cached === 'dark' ? ['on', 'cached'] : ['off', 'pending'];
        const k = keep(); if (k) return k;
        const native = detect();
        measuredOnce = true;
        return native ? ['off', native] : ['on', 'auto'];
    }

    // ── CSS üretimi ────────────────────────────────────────────────────────
    const num = (v, a, b, d) => { v = parseFloat(v); if (isNaN(v)) v = d; return Math.min(b, Math.max(a, v)); };
    const r2 = (v) => Math.round(v * 100) / 100;
    const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
    const color = (v, d) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim() : d);
    const cssVal = (v) => String(v || '').replace(/[{};<>]/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\s*\(|expression\s*\(|@import/gi, '').slice(0, 200);
    const BAD_SEL = /expression\s*\(|javascript\s*:|url\s*\(|@import|\bon\w+\s*=/i;

    function rules() {
        const r = S.darkSiteRules && S.darkSiteRules[HOST];
        return (r && typeof r === 'object') ? { ...S, ...r } : S;
    }
    function invertFilter(a) {
        const b = num(a.invertBrightness, 0.2, 2, 1), c = num(a.invertContrast, 0.3, 2, 1);
        if (a.invertDim) return 'brightness(' + r2(b) + ') contrast(' + r2(c) + ')';
        const i = num(a.invertIntensity, 0, 1, 1), g = num(a.invertGrayscale, 0, 1, 0), w = num(a.invertWarmth, 0, 1, 0);
        const p = [];
        if (i > 0) p.push('invert(' + r2(i) + ')', 'hue-rotate(180deg)');
        if (g > 0) p.push('grayscale(' + r2(g) + ')');
        if (w > 0) p.push('sepia(' + r2(w) + ')');
        if (b !== 1) p.push('brightness(' + r2(b) + ')');
        if (c !== 1) p.push('contrast(' + r2(c) + ')');
        const f = a.darkFilters || {};
        const sat = num(f.saturate, 0, 300, 100), hue = num(f.hueRotate, -360, 360, 0);
        if (sat !== 100) p.push('saturate(' + sat + '%)');
        if (hue !== 0) p.push('hue-rotate(' + hue + 'deg)');
        return p.join(' ') || 'none';
    }
    function buildCss(a, withTransition, forceInvert) {
        const method = forceInvert ? 'invert' : a.darkModeMethod;
        const isSmart = method === 'smart';
        const isInvert = !isSmart && method !== 'theme' && method !== 'tema';
        let css = '', counter = '';
        if (isSmart) {
            // :root özgüllüğü (0,1,0 / 0,1,1): sitenin "body{background:…!important}" kuralını sıradan bağımsız yener
            css += ':root,:root>body{background-color:' + SMART_BG + '!important;color:' + SMART_FG + '!important}\n:root{color-scheme:dark}\n';
            css += '[data-nvp-ps~="b"]::before,[data-nvp-ps~="a"]::after{background-color:#20232a!important;background-image:none!important;border-color:#33363e!important}\n';
            // Koyu yüzeydeki sözde öğe simgeleri ve CSS üçgenleri (açılır menü okları, simge fontları): rengi açılır
            css += '[data-nvp-ps~="fb"]::before{color:var(--nvp-pfb)!important}[data-nvp-ps~="fa"]::after{color:var(--nvp-pfa)!important}\n';
            css += '[data-nvp-ps~="tb"]::before{border-top-color:var(--nvp-ptb)!important}[data-nvp-ps~="ta"]::after{border-top-color:var(--nvp-pta)!important}\n';
            css += '[data-nvp-ps~="ub"]::before{border-bottom-color:var(--nvp-pub)!important}[data-nvp-ps~="ua"]::after{border-bottom-color:var(--nvp-pua)!important}\n';
            css += 'input::placeholder,textarea::placeholder,[contenteditable]:empty::before{color:rgba(227,229,234,.62)!important;opacity:1!important;-webkit-text-fill-color:rgba(227,229,234,.62)!important}\n';
            css += 'input::-webkit-input-placeholder,textarea::-webkit-input-placeholder{color:rgba(227,229,234,.62)!important}\n';
            css += 'input:-webkit-autofill,input:-webkit-autofill:hover,input:-webkit-autofill:focus,textarea:-webkit-autofill,select:-webkit-autofill{-webkit-box-shadow:0 0 0 1000px #1e2026 inset!important;box-shadow:0 0 0 1000px #1e2026 inset!important;-webkit-text-fill-color:' + SMART_FG + '!important;caret-color:' + SMART_FG + '}\n';
            css += 'select option,select optgroup{background-color:#1e2026;color:' + SMART_FG + '}\n';
            const ex = String(a.excludeCss || '').split(/[\n,]/).map((x) => x.replace(/[{};]/g, '').trim()).filter((x) => {
                if (!x || BAD_SEL.test(x)) return false;
                try { document.querySelector(x); return true; } catch (_) { return false; }
            });
            SMART.exclude = ex.join(',');
        } else if (isInvert) {
            const inv = a.invertDim ? 0 : num(a.invertIntensity, 0, 1, 1);
            css += 'html{filter:' + invertFilter(a) + '!important;' + (a.invertDim ? '' : 'background-color:#ededeb!important;') /* filtreyle #121214 olur */ + '}\n';
            if (inv > 0) {
                counter = 'invert(' + r2(inv) + ') hue-rotate(180deg)';
                const mode = a.invertImageMode || 'original';
                const follow = mode === 'invert' || (mode !== 'grayscale' && a.invertAreas && a.invertAreas.image === true);
                const gray = mode === 'grayscale' ? ' grayscale(1)' : '';
                css += 'video,canvas,iframe,embed,object{filter:' + counter + '!important}\n';
                if (!follow) {
                    css += 'img,[role="img"]:not(svg),[style*="background-image"]:not(html):not(body),[style*="background:url"]:not(html):not(body),[style*="background: url"]:not(html):not(body){filter:' + counter + gray + '!important}\n';
                    // Arka plan görseli taşıyan kabın içindeki medya iki kez çevrilmesin
                    css += '[style*="background-image"] img,[style*="background-image"] video,[style*="background-image"] canvas,[style*="background:url"] img,[style*="background: url"] img{filter:none!important}\n';
                }
                const ex = String(a.excludeCss || '').split(/[\n,]/).map((s) => s.replace(/[{};]/g, '').trim()).filter((s) => {
                    if (!s || BAD_SEL.test(s)) return false;
                    try { document.querySelector(s); return true; } catch (_) { return false; }
                });
                if (ex.length) css += ex.join(',') + '{filter:' + counter + '!important}\n';
            }
        } else {
            const bg = color(a.bgColorHex, '#1e1e24'), hv = color(a.hoverColor, '#37a8a8'), bt = color(a.buttonColor, '#2d2d37');
            const ar = { ...DEF.darkModeAreas, ...(a.darkModeAreas || {}) };
            if (ar.body) css += 'html,body{background:' + bg + '!important}\n';
            if (ar.text) css += 'body,body *{color:#e1e1e6!important}\n';
            if (ar.link) css += 'a{color:' + hv + '!important}\n';
            if (ar.button) css += 'button,[role="button"]{background-color:' + bt + '!important;color:#fff!important;border-color:transparent!important}\n';
            if (ar.form) css += 'input,textarea,select,[role="textbox"]{background-color:' + bt + '!important;color:#e1e1e6!important;border-color:#4a4a5a!important}\n';
            if (ar.code) css += 'pre,code{background:' + bt + '!important;color:#e1e1e6!important}\n';
            if (ar.table) css += 'table,th,td{background:' + bt + '!important;color:#e1e1e6!important;border-color:#4a4a5a!important}\n';
            if (ar.scrollbar) css += 'html{scrollbar-color:' + hv + ' ' + bt + '}\n';
            css += 'html{color-scheme:dark}\n';
        }
        if (withTransition) {
            const ms = num(a.darkTransition, 0, 3000, 300);
            if (ms > 0) css += 'html{transition:filter ' + ms + 'ms ease,background-color ' + ms + 'ms ease!important}\n';
        }
        const fs = num(a.darkFontSize, 0, 100, 0);
        if (fs > 0) css += 'html{font-size:calc(100% + ' + fs + '%)!important}\n';
        const fw = num(a.darkFontWeight, 0, 900, 0);
        if (fw > 0) css += 'body,body *{font-weight:' + Math.round(fw) + '!important}\n';
        if (a.invertOverrideText) css += 'body,body *:not(svg):not(svg *){color:' + color(a.invertTextColor, '#e1e1e6') + '!important}\n';
        if (a.invertOverrideLink) css += 'a,a *{color:' + color(a.invertLinkColor, '#4dabf7') + '!important}\n';
        if (a.invertOverrideBg) css += 'html{background-color:' + color(a.invertBgColor, '#121214') + '!important}\n';
        if (a.overlayHeadingColor) css += 'h1,h2,h3,h4,h5,h6{color:' + color(a.overlayHeadingColorHex, '#e0e0e0') + '!important}\n';
        if (a.overlayBoldColor) css += 'b,strong{color:' + color(a.overlayBoldColorHex, '#e0e0e0') + '!important}\n';
        if (a.overlaySvgColor) css += 'svg{color:' + color(a.overlaySvgColorHex, '#e1e1e6') + '!important}\n';
        if (a.overlayGrayscale && counter) css += '[style*="grayscale"]{filter:' + counter + '!important}\n';
        const lh = cssVal(a.overlayLineHeight); if (lh) css += 'body{line-height:' + lh + '!important}\n';
        const ls = cssVal(a.overlayLetterSpacing); if (ls) css += 'body{letter-spacing:' + ls + 'px!important}\n';
        const ts = cssVal(a.overlayTextShadow); if (ts) css += 'p,li,td,h1,h2,h3,h4,h5,h6{text-shadow:' + ts + '!important}\n';
        const ff = cssVal(a.overlayFontFamily); if (ff) css += 'body{font-family:' + ff + '!important}\n';
        return { css, counter };
    }

    // ── Akıllı boyama (yöntem 'smart') ─────────────────────────────────────
    // Sayfayı ters çevirmez: yalnız beyaz/gri yüzeyleri (gövde, kart, kutu, form alanı) koyulaştırır,
    // koyu yazıları açar, açık gri çerçeveleri koyulaştırır. Renkli düğmelere, rozetlere, görsellere
    // ve renkli zemin üstündeki yazılara dokunmaz. Özgün değerler saklanır, kapatınca geri yüklenir.
    const SMART_BG = '#16181d', SMART_FG = '#e3e5ea';
    const SMART = { on: false, els: new Set(), saved: new WeakMap(), oc: new WeakMap(), done: new WeakSet(), obs: null, timer: 0, queue: [], exclude: '',
        marked: new Set(), roots: new WeakSet(), dirty: new Set() };
    // Koyu örtü: zeminin üstünde, içeriğin altında kalan bir arka plan katmanı (en üstteki
    // background-image). box-shadow kullanılmaz; böylece sitenin :hover gölgesi/parlaması bastırılmaz.
    const OV_COLOR = 'rgba(22,24,29,.86)';
    const threshold = () => num(S.smartThreshold, 40, 95, 45) / 100; // "açık" sayılan bağıl parlaklık eşiği
    const SKIP_TAG = /^(script|style|link|meta|img|picture|video|audio|canvas|iframe|svg|object|embed|noscript|br|template|nvp-root|head|title|source|track)$/i;
    function hsl(c) {
        const r = c.r / 255, g = c.g / 255, b = c.b / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
        let h = 0, s = 0;
        if (d) {
            s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
            h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
            h /= 6;
        }
        return { h, s, l, chroma: (mx - mn) * 255 };
    }
    function hslStr(h, s, l, a) {
        return 'hsla(' + Math.round(h * 360) + ',' + Math.round(s * 100) + '%,' + Math.round(l * 100) + '%,' + (a == null ? 1 : Math.round(a * 100) / 100) + ')';
    }
    const neutral = (x) => x.chroma < 30 || x.s < 0.14;
    // Açık mavi ve sarı tonlu zeminler (bilgi kutusu, uyarı şeridi): belli bir açıklığın üstündeyse
    // koyu, aynı tonda bir zemine çevrilir. Doygun orta tonlar (düğme rengi) ve küçük öğeler korunur.
    const tintTh = () => num(S.smartTintThreshold, 30, 90, 45) / 100;
    function mapTint(c) {
        if (S.smartTint === false) return null;
        const x = hsl(c);
        if (neutral(x)) return null;
        const deg = x.h * 360;
        const blue = deg >= 185 && deg <= 255, yellow = deg >= 38 && deg <= 68;
        if (!blue && !yellow) return null;
        if (x.s > 0.7 && x.l < 0.68) return null;                 // doygun orta ton: düğme/rozet rengi
        if (lum(c) < tintTh()) return null;
        return hslStr(x.h, Math.min(0.45, x.s * 0.5), yellow ? 0.15 : 0.17, c.a);
    }
    const INTERACTIVE = /^(button|a|input|select|label|summary|option)$/i;
    function tintAllowed(el, cs) {
        if (INTERACTIVE.test(el.localName) || el.getAttribute('role') === 'button' || cs.cursor === 'pointer') return false;
        const r = el.getBoundingClientRect();
        return r.width >= 160 && r.height >= 32;
    }
    // Doygun renkli büyük şerit/bant (üst menü çubuğu, turuncu bölüm bandı): açık değildir ama koyu
    // sayfada göz alır. Tonu korunarak koyulaştırılır. Eşik HSL açıklığıdır (varsayılan %35); düğme,
    // rozet gibi küçük öğeler ve etkileşimli öğeler etkilenmez.
    const BAND_OV = 'rgba(12,14,20,.6)';
    const bandTh = () => num(S.smartBandThreshold, 20, 80, 35) / 100;
    function mapBand(c) {
        if (S.smartBands === false || !c || c.a <= 0.5) return null;
        const x = hsl(c);
        if (neutral(x) || x.s < 0.3 || x.l < bandTh() || x.l >= 0.86) return null;
        return hslStr(x.h, Math.min(0.7, x.s) * 0.7, Math.min(0.22, 0.15 + (x.l - 0.3) * 0.12), c.a);
    }
    function bandAllowed(el, cs) {
        if (INTERACTIVE.test(el.localName) || el.getAttribute('role') === 'button') return false;
        const r = el.getBoundingClientRect();
        // geniş bant (≥ %45 genişlik, ≥ 40 px) ya da sayfa boyu ince şerit (≥ %80 genişlik, ≥ 24 px)
        return (r.width >= window.innerWidth * 0.45 && r.height >= 40) || (r.width >= window.innerWidth * 0.8 && r.height >= 24);
    }
    function parseColorStr(m) {
        if (/^black$/i.test(m)) return { r: 0, g: 0, b: 0, a: 1 };
        if (/^white$/i.test(m)) return { r: 255, g: 255, b: 255, a: 1 };
        if (m[0] === '#') {
            let h = m.slice(1); if (h.length <= 4) h = h.replace(/./g, '$&$&');
            return { r: parseInt(h.substr(0, 2), 16), g: parseInt(h.substr(2, 2), 16), b: parseInt(h.substr(4, 2), 16), a: h.length >= 8 ? parseInt(h.substr(6, 2), 16) / 255 : 1 };
        }
        return parseRgb(m);
    }
    // Gradyanlı bant: renk duraklarından biri doygun ve eşikten açıksa (tümü açık nötrse zaten "yüzey" sayılır)
    function bandGradient(imgs) {
        if (S.smartBands === false || /url\(/i.test(imgs)) return false;
        const cols = (imgs.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/gi) || []).map(parseColorStr).filter((c) => c && c.a > 0.5);
        return cols.length > 0 && cols.some((c) => !!mapBand(c));
    }
    // Sitenin kendi "üzerine gelince" gölgesi (ör. kartın etrafındaki hale) açık temada koyu renklidir ve
    // koyu zeminde görünmez. Aynı kuralın (aynı seçici, aynı boyut/bulanıklık) açık renkli bir eşi üretilir;
    // böylece efekt karanlıkta da görünür. Yalnız okunabilen (aynı kökenli) stil sayfaları taranır.
    let glowCache = { n: -1, css: '' };
    function glowColor(str) {
        return str.replace(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|\bblack\b/gi, (m) => {
            let c;
            if (/^black$/i.test(m)) c = { r: 0, g: 0, b: 0, a: 1 };
            else if (m[0] === '#') { let h = m.slice(1); if (h.length <= 4) h = h.replace(/./g, '$&$&'); c = { r: parseInt(h.substr(0, 2), 16), g: parseInt(h.substr(2, 2), 16), b: parseInt(h.substr(4, 2), 16), a: h.length >= 8 ? parseInt(h.substr(6, 2), 16) / 255 : 1 }; }
            else c = parseRgb(m);
            if (!c || lum(c) > 0.35) return m;                                   // zaten açık renk: aynen kalsın
            return 'rgba(205,215,255,' + Math.round(Math.min(0.4, Math.max(0.08, c.a * 0.85)) * 100) / 100 + ')';
        });
    }
    function splitSelectors(text) {
        const out = [];
        let depth = 0, cur = '';
        for (const ch of text) {
            if (ch === '(' || ch === '[') depth++;
            else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
            if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
        }
        if (cur.trim()) out.push(cur.trim());
        return out;
    }
    function hoverGlowCss() {
        const sheets = document.styleSheets;
        if (sheets.length === glowCache.n) return glowCache.css;
        const out = [];
        let scanned = 0;
        const walk = (rules) => {
            for (let i = 0; i < rules.length && scanned < 30000 && out.length < 200; i++) {
                const r = rules[i];
                scanned++;
                if (r.cssRules && !r.selectorText) { if (!r.media || window.matchMedia(r.media.mediaText).matches) walk(r.cssRules); continue; }
                if (!r.selectorText || !/:hover|:focus|:active/.test(r.selectorText) || !r.style) continue;
                // Aynı listede durum içermeyen seçiciler de olabilir (ör. ".btn[disabled]"): yalnız gerçek
                // :hover/:focus/:active parçaları alınır; yoksa düğme kalıcı olarak "koyu" sanılır.
                const sel = splitSelectors(r.selectorText).filter((x) => /:hover|:focus|:active/.test(x)).join(',');
                if (!sel) continue;
                let decl = '';
                const bs = r.style.getPropertyValue('box-shadow');
                if (bs && bs !== 'none' && !/var\(/.test(bs)) {
                    const g = glowColor(bs);
                    if (g !== bs) decl += 'box-shadow:' + g + '!important;';
                }
                // Açık "üzerine gelince/odak" zemini (ör. menü öğesi #f5f5f5): koyu ama belirgin bir vurguya çevrilir
                const bgc = parseColorStr((r.style.getPropertyValue('background-color') || '').trim());
                const hb = bgc ? mapHover(bgc) : null;
                if (hb) {
                    decl += 'background-color:' + hb + '!important;';
                    const fc = parseColorStr((r.style.getPropertyValue('color') || '').trim());
                    const nf = fc ? mapFg(fc) : null;
                    if (nf) decl += 'color:' + nf + '!important;';
                }
                if (decl) out.push(sel + '{' + decl + '}');
            }
        };
        for (let i = 0; i < sheets.length; i++) {
            const sh = sheets[i];
            if (sh.ownerNode === styleEl || sh.ownerNode === hoverEl) continue;
            let rules = null;
            try { rules = sh.cssRules; } catch (_) { rules = null; }               // farklı kökenli stil sayfası
            if (rules) walk(rules);
        }
        glowCache = { n: sheets.length, css: out.length ? out.join('\n') + '\n' : '' };
        return glowCache.css;
    }
    function mapHover(c) {
        if (!c || c.a < 0.05) return null;
        const x = hsl(c);
        if (neutral(x) && x.l >= 0.6) return hslStr(x.h, Math.min(x.s, 0.1), 0.2 + (1 - x.l) * 0.25, c.a);
        if (x.l >= 0.86) return hslStr(x.h, x.s * 0.45, 0.26, c.a);
        return null;
    }
    function mapBg(c) {
        const x = hsl(c);
        if (neutral(x) && x.l >= 0.6) return hslStr(x.h, Math.min(x.s, 0.1), 0.1 + (1 - x.l) * 0.32, c.a);      // beyaz/gri yüzey
        if (x.l >= 0.86) return hslStr(x.h, x.s * 0.45, 0.17, c.a);                                              // pastel yüzey (uyarı kutusu vb.)
        return null;                                                                                              // renkli: dokunma
    }
    function mapFg(c) {
        const x = hsl(c);
        if (neutral(x) && x.l < 0.62) return hslStr(x.h, Math.min(x.s, 0.08), 0.92 - x.l * 0.28, c.a < 0.62 ? Math.max(c.a, 0.62) : c.a); // siyah/gri yazı → açık (çok silik ikincil yazılar okunur kalsın)
        if (!neutral(x) && x.l < 0.5) return hslStr(x.h, Math.min(1, x.s), 0.72, c.a);                           // koyu renkli yazı/bağlantı → aynı ton, açık
        return null;
    }
    function mapBorder(c) {
        const x = hsl(c);
        return neutral(x) && x.l >= 0.7 ? hslStr(x.h, Math.min(x.s, 0.08), 0.27, c.a) : null;
    }
    // Büyük ve açık renkli arka plan resmi (desen, doku): içeriğin altında kalan koyu bir iç gölge
    // katmanıyla karartılır. Resim aynı kökenden değilse ölçülemez ve dokunulmaz; fotoğraflar koyu
    // ölçüldüğü için olduğu gibi kalır.
    const imgLumMap = new Map();     // url → ortalama bağıl parlaklık | null (ölçülemez) | 'wait'
    function imageLum(url, cb) {
        if (imgLumMap.has(url)) { const v = imgLumMap.get(url); if (v !== 'wait') cb(v); else setTimeout(() => imageLum(url, cb), 150); return; }
        imgLumMap.set(url, 'wait');
        const im = new Image();
        im.onload = () => {
            let v = null;
            try {
                const cv = document.createElement('canvas'); cv.width = cv.height = 12;
                const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0, 12, 12);
                const d = cx.getImageData(0, 0, 12, 12).data;
                let sum = 0, n = 0;
                for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 30) continue; sum += lum({ r: d[i], g: d[i + 1], b: d[i + 2] }); n++; }
                v = n > 0 ? sum / n : null;
            } catch (_) { v = null; } // farklı köken: ölçülemez
            imgLumMap.set(url, v); cb(v);
        };
        im.onerror = () => { imgLumMap.set(url, null); cb(null); };
        im.src = url;
    }
    const imageIsLight = (url, cb) => imageLum(url, (v) => cb(v != null && v > 0.62));
    function sameOriginUrl(raw) {
        try { const u = new URL(raw, location.href); return (u.origin === location.origin || u.protocol === 'data:') ? u.href : null; } catch (_) { return null; }
    }
    // Çok katmanlı arka planın ekranda görünen parlaklığını tahmin et: zemin rengi + resimler + gradyanlar
    // (en alttan üste bindirilerek). Ölçülemeyen resim katmanı atlanır.
    function estimateBg(cs, cb) {
        const bg = parseRgb(cs.backgroundColor);
        let base = bg && bg.a > 0.5 ? lum(bg) : 0.08;
        const layers = [];
        const re = /(url\(["']?[^"')]+["']?\))|((?:repeating-)?(?:linear|radial|conic)-gradient\((?:[^()]|\([^()]*\))*\))/gi;
        let m;
        while ((m = re.exec(cs.backgroundImage || '')) !== null) layers.push(m[0]);
        let pending = 0, done = false;
        const vals = new Array(layers.length);
        const finish = () => {
            if (done || pending > 0) return;
            done = true;
            for (let i = layers.length - 1; i >= 0; i--) {                 // CSS: ilk katman en üstte
                const v = vals[i];
                if (v == null) continue;
                base = v.a >= 1 ? v.l : v.a * v.l + (1 - v.a) * base;
            }
            cb(base);
        };
        layers.forEach((L, i) => {
            if (/^url/i.test(L)) {
                const raw = /url\(["']?([^"')]+)["']?\)/i.exec(L)[1];
                const u = sameOriginUrl(raw);
                if (!u) return;
                pending++;
                imageLum(u, (v) => { pending--; vals[i] = v == null ? null : { l: v, a: 1 }; finish(); });
            } else {
                const cols = (L.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/gi) || []).map((c) => {
                    if (c[0] !== '#') return parseRgb(c);
                    let h = c.slice(1); if (h.length <= 4) h = h.replace(/./g, '$&$&');
                    return { r: parseInt(h.substr(0, 2), 16), g: parseInt(h.substr(2, 2), 16), b: parseInt(h.substr(4, 2), 16), a: h.length >= 8 ? parseInt(h.substr(6, 2), 16) / 255 : 1 };
                }).filter(Boolean);
                if (!cols.length) return;
                // Açık alanı kaçırmamak için en açık renk durağı esas alınır (radyal gradyanın parlak merkezi gibi)
                const top = cols.reduce((x, c) => (lum(c) > lum(x) ? c : x), cols[0]);
                vals[i] = { l: lum(top), a: top.a == null ? 1 : top.a };
            }
        });
        finish();
    }
    function maybeShadeImage(el, imgs) {
        const r = el.getBoundingClientRect();
        if (r.width * Math.max(r.height, 1) < window.innerWidth * window.innerHeight * 0.12) return;
        const m = /url\(["']?([^"')]+)["']?\)/i.exec(imgs);
        if (!m) return;
        let url;
        try { url = new URL(m[1], location.href); } catch (_) { return; }
        if (url.origin !== location.origin && url.protocol !== 'data:') return;
        imageIsLight(url.href, (light) => {
            if (light && SMART.on && el.isConnected) shadeEl(el, 'rgba(22,24,29,.88)');
        });
    }
    function mark(el, attr, val) {
        el.setAttribute(attr, val == null ? '' : val);
        SMART.marked.add(el);
    }
    // Gradyandaki renkler: hepsi açık ve nötr/pastelse yüzey sayılır (renkli gradyan = düğme/afiş, dokunulmaz)
    function gradientLight(imgs) {
        const cols = (imgs.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/gi) || []).map((c) => {
            if (c[0] !== '#') return parseRgb(c);
            let h = c.slice(1); if (h.length <= 4) h = h.replace(/./g, '$&$&');
            return { r: parseInt(h.substr(0, 2), 16), g: parseInt(h.substr(2, 2), 16), b: parseInt(h.substr(4, 2), 16), a: h.length >= 8 ? parseInt(h.substr(6, 2), 16) / 255 : 1 };
        }).filter((c) => c && c.a > 0.05);
        return cols.length > 0 && cols.every((c) => !!mapBg(c));
    }
    function setImp(el, prop, val) {
        if (prop === 'background-color' || prop === 'background-image') mark(el, 'data-nvp-d');
        let sv = SMART.saved.get(el);
        if (!sv) { sv = {}; SMART.saved.set(el, sv); }
        if (!(prop in sv)) sv[prop] = [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)];
        el.style.setProperty(prop, val, 'important');
        SMART.els.add(el);
    }
    // Arka plan katmanlarının özgün değerleri (örtü katmanı eklenirken liste kaymasın diye)
    function bgSnap(cs) {
        return { img: cs.backgroundImage || 'none', size: cs.backgroundSize, rep: cs.backgroundRepeat, pos: cs.backgroundPosition,
            att: cs.backgroundAttachment, org: cs.backgroundOrigin, clip: cs.backgroundClip };
    }
    // Öğeye koyu örtü katmanı ekle (en üst background-image katmanı; içerik ve sitenin gölgeleri etkilenmez)
    function shadeEl(el, col, snap) {
        if (SMART.saved.get(el)?.['background-image']) return;
        const b = snap || bgSnap(getComputedStyle(el));
        const layer = 'linear-gradient(' + (col || OV_COLOR) + ',' + (col || OV_COLOR) + ')';
        if (!b.img || b.img === 'none') { setImp(el, 'background-image', layer); return; }
        setImp(el, 'background-image', layer + ',' + b.img);
        setImp(el, 'background-size', '100% 100%,' + b.size);
        setImp(el, 'background-repeat', 'no-repeat,' + b.rep);
        setImp(el, 'background-position', '0 0,' + b.pos);
        setImp(el, 'background-attachment', 'scroll,' + b.att);
        setImp(el, 'background-origin', 'border-box,' + b.org);
        setImp(el, 'background-clip', 'border-box,' + b.clip);
    }
    // Okuma (hepsi) → yazma (hepsi): her yazmadan sonra stil yeniden hesaplanmasın
    function smartProcess(list) {
        const decide = [];
        const estimates = [];
        const bands = [];
        const selects = [];
        const memo = new Map();   // el → { changedBg: bool, fg: özgün yazı rengi, nfg: yeni yazı rengi }
        const info = (el) => {
            for (let n = el, k = 0; n && k < 40; k++, n = n.parentElement) {
                if (memo.has(n)) return memo.get(n);
                if (n === document.body || n === document.documentElement) return { changedBg: true, fg: null, nfg: SMART_FG };
            }
            return { changedBg: true, fg: null, nfg: null };
        };
        // Okuma sırasında durum kurallarının koyu eşleri kapalı: öğenin gerçek (özgün) rengi ölçülür.
        // Odaklı/kilitli bir düğme o an koyu görünse de kalıcı koyu zemini yazılır.
        const hv = !!(hoverEl && hoverEl.isConnected && hoverEl.media !== 'not all');
        if (hv) hoverEl.media = 'not all';
        for (const el of list) {
            if (!el || el.nodeType !== 1 || SMART.done.has(el) || SKIP_TAG.test(el.localName) || el === document.body || el === document.documentElement) continue;
            if (el.closest('svg')) continue;
            if (SMART.exclude) { try { if (el.closest(SMART.exclude)) continue; } catch (_) { /* yok say */ } }
            SMART.done.add(el);
            const cs = getComputedStyle(el);
            const bg = parseRgb(cs.backgroundColor), fg = parseRgb(cs.color);
            SMART.oc.set(el, { bg: cs.backgroundColor, fg: cs.color });
            const parent = info(el.parentElement);
            const imgs = cs.backgroundImage || 'none';
            const hasUrl = /url\(/i.test(imgs);
            const gradientOnly = !hasUrl && /gradient\(/i.test(imgs);    // gradyan: renkleri bilinmez, dokunma
            let nbg = null, changedBg = parent.changedBg;
            if (bg && bg.a > 0.5) {
                nbg = gradientOnly ? null : mapBg(bg);                   // resimli kartın zemini de koyulaşır, resim üstte kalır
                if (!nbg && !gradientOnly && mapTint(bg) && tintAllowed(el, cs)) nbg = mapTint(bg); // açık mavi/sarı kutu
                if (!nbg && !gradientOnly && mapBand(bg) && bandAllowed(el, cs)) nbg = mapBand(bg); // doygun renkli büyük bant
                changedBg = !!nbg || (gradientOnly ? false : (hsl(bg).l < 0.35)); // koyu zemin de "koyu yüzey" sayılır
            } else if (bg && bg.a > 0.05 && !gradientOnly) {
                nbg = mapBg(bg);                                          // yarı saydam beyaz örtü
            }
            let shade = false;
            if (gradientOnly && gradientLight(imgs)) { shade = true; changedBg = true; }
            // Resimli/gradyanlı büyük alan (kahraman bölümü, afiş): görünen parlaklığı hemen tahmin et;
            // böylece örtü kaydırma sonrası taramayı beklemeden gelir.
            if (gradientOnly && !shade && bandGradient(imgs) && bandAllowed(el, cs)) { bands.push([el, bgSnap(cs)]); changedBg = true; }
            else if ((hasUrl || (gradientOnly && !shade))) {
                const rr = el.getBoundingClientRect();
                if (rr.width >= 160 && rr.height >= 36) estimates.push([el, { backgroundColor: nbg || cs.backgroundColor, backgroundImage: imgs }]);
                else if (hasUrl && !nbg) maybeShadeImage(el, imgs);
            }
            let nfg = null;
            if (fg && changedBg) nfg = mapFg(fg);
            // Rengi üst öğeyle aynı olsa bile yazılır: öğe aynı değeri kendisi de tanımlıyor olabilir
            // (ör. Angular Material kartları); hesaplanmış stilden miras mı açık mı anlaşılamaz.
            const inherited = parent.fg === cs.color;
            const write = !!nfg;
            let nbr = null;
            if (parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0) {
                const bc = parseRgb(cs.borderTopColor) || parseRgb(cs.borderBottomColor);
                if (bc && bc.a > 0.1) nbr = mapBorder(bc);
            }
            memo.set(el, { changedBg, fg: cs.color, nfg: nfg || (inherited ? parent.nfg : null) });
            const ps = changedBg ? pseudoFgFixes(el) : null;
            if (nbg && el.localName === 'select' && hasUrl && /no-repeat/.test(cs.backgroundRepeat)) selects.push(el);
            if (nbg || write || nbr || shade || ps) decide.push([el, nbg, write ? nfg : null, nbr, shade ? bgSnap(cs) : null, ps]);
        }
        if (hv) hoverEl.media = 'all';
        for (const [el, nbg, nfg, nbr, shade, ps] of decide) {
            if (ps) applyPseudoFixes(el, ps);
            if (shade) shadeEl(el, OV_COLOR, shade);
            if (nbg) setImp(el, 'background-color', nbg);
            if (nfg) setImp(el, 'color', nfg);
            if (nbr) setImp(el, 'border-color', nbr);
        }
        for (const [el, snap] of bands) shadeEl(el, BAND_OV, snap);
        for (const el of selects) fixSelectArrow(el);
        const th = threshold();
        for (const [el, snap] of estimates) {
            estimateBg(snap, (v) => {
                if (v > th && SMART.on && el.isConnected && !SMART.saved.get(el)?.['background-image']) { shadeEl(el); fixTextIn(el); }
            });
        }
    }
    function smartDrain() {
        SMART.timer = 0;
        if (!SMART.on) { SMART.queue = []; return; }
        const batch = SMART.queue.splice(0, 2500);
        smartProcess(batch);
        if (SMART.queue.length) SMART.timer = setTimeout(smartDrain, 16);
        else scheduleSweep(120);
    }
    function smartEnqueue(root) {
        if (!root || root.nodeType !== 1) return;
        SMART.queue.push(root);
        const all = root.getElementsByTagName('*');
        for (let i = 0; i < all.length && SMART.queue.length < 30000; i++) {
            const el = all[i];
            SMART.queue.push(el);
            if (el.shadowRoot) enqueueShadow(el.shadowRoot);       // açık shadow root içi de boyanır
        }
        if (root.shadowRoot) enqueueShadow(root.shadowRoot);
        if (!SMART.timer) SMART.timer = setTimeout(smartDrain, 0);
    }
    function enqueueShadow(sr) {
        if (!SMART.roots.has(sr)) {
            SMART.roots.add(sr);
            if (SMART.obs) { try { SMART.obs.observe(sr, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'open', 'aria-expanded', 'aria-selected'] }); } catch (_) { /* yok say */ } }
        }
        for (const ch of sr.children) smartEnqueue(ch);
    }
    function smartStart() {
        if (!document.body) return;
        if (!SMART.on) {
            SMART.on = true;
            SMART.obs = new MutationObserver((muts) => {
                let changed = false;
                for (const m of muts) {
                    if (m.type === 'attributes') { changed = true; if (SMART.dirty.size < 300) SMART.dirty.add(m.target); continue; }   // sekme/akordeon/durum değişimi
                    for (const n of m.addedNodes) if (n.nodeType === 1) smartEnqueue(n);
                }
                if (changed) scheduleSweep(250);
            });
            SMART.obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'open', 'aria-expanded', 'aria-selected'] });
        }
        smartEnqueue(document.body);
    }
    function smartStop() {
        if (!SMART.on && !SMART.els.size) return;
        SMART.on = false;
        if (SMART.obs) { SMART.obs.disconnect(); SMART.obs = null; }
        clearTimeout(SMART.timer); SMART.timer = 0; SMART.queue = [];
        for (const el of SMART.els) {
            const sv = SMART.saved.get(el);
            if (!sv) continue;
            for (const prop of Object.keys(sv)) {
                const [v, pr] = sv[prop];
                if (v) el.style.setProperty(prop, v, pr); else el.style.removeProperty(prop);
            }
            SMART.saved.delete(el);
        }
        SMART.els.clear();
        for (const el of SMART.marked) { el.removeAttribute('data-nvp-d'); el.removeAttribute('data-nvp-ps'); }
        SMART.marked.clear();
        SMART.done = new WeakSet();
        SMART.oc = new WeakMap();
        SMART.roots = new WeakSet();
        SMART.dirty.clear();
        clearTimeout(sweepT);
    }
    // SPA rota değişince yeni içerik: işlenmemiş öğeleri yakala
    function smartRescan() { if (SMART.on && document.body) smartEnqueue(document.body); }

    // ── Görünen açık alan taraması (son güvence) ──
    // Ekrandaki bir ızgarada gerçekte görünen zemini bulur; eşikten açık kalan yerleri yakalar:
    // sonradan açığa dönen öğeler, açık gradyanlar, ölçülemeyen açık desenler ve sözde öğeler (::before/::after).
    let sweepT = 0;
    function scheduleSweep(ms) {
        if (!SMART.on) return;
        clearTimeout(sweepT);
        sweepT = setTimeout(smartSweep, ms == null ? 350 : ms);
    }
    const MEDIA = /^(img|picture|video|canvas|svg|iframe|embed|object)$/i;
    // Örtü/koyulaştırma sonrası içerideki koyu yazıları aç (renkli zeminli alt öğelere dokunmadan)
    function fixTextIn(root) {
        const stack = [root];
        let n = 0;
        while (stack.length && n < 600) {
            const el = stack.pop(); n++;
            if (MEDIA.test(el.localName)) continue;
            const cs = getComputedStyle(el);
            if (el !== root) {
                const b = parseRgb(cs.backgroundColor);
                if (b && b.a > 0.5 && !el.hasAttribute('data-nvp-d')) {
                    const m = mapBg(b);
                    if (!m) continue;                                   // renkli düğme/rozet: dokunma
                    setImp(el, 'background-color', m);                 // açık zeminli alt öğe (düğme vb.): zemini de koyulaşsın,
                }                                                       // yoksa "açık yazı + beyaz zemin" oluşur
            }
            const c = parseRgb(cs.color);
            if (c && lum(c) < 0.3) { const f = mapFg(c); if (f) setImp(el, 'color', f); }
            applyPseudoFixes(el, pseudoFgFixes(el));
            for (const ch of el.children) stack.push(ch);
        }
    }
    // Sözde öğe simgesi/oku: ::before/::after kendi koyu rengini (ya da koyu kenar üçgenini) taşıyorsa
    // açık eşi hesaplanır. Okuma ve yazma ayrı: [token, css değişkeni, değer] listesi döner.
    // Açık zemine göre çizilmiş koyu açılır kutu oku (genelde küçük bir PNG/SVG arka plan resmi). Kutunun
    // zemini koyulaşınca görünmez olur; resmin rengi değiştirilemediği için aynı konuma açık bir ok konur.
    const SELECT_ARROW = 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23c8ccd4\' stroke-width=\'3\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><path d=\'M6 9l6 6 6-6\'/></svg>")';
    function fixSelectArrow(el) {
        if (SMART.saved.get(el)?.['background-image']) return;
        setImp(el, 'background-image', SELECT_ARROW);
        setImp(el, 'background-size', '12px 12px');
    }
    const PS_TAGS = /^(a|i|span|li|button|label|em|b|strong|small|summary)$/i;
    const PS_CLASS = /arrow|caret|chevron|select|dropdown|toggle|icon|angle/i;
    function pseudoFgFixes(el) {
        if (!PS_TAGS.test(el.localName) && !(el.localName === 'div' && PS_CLASS.test(typeof el.className === 'string' ? el.className : ''))) return null;
        const out = [];
        for (const [p, s] of [['::before', 'b'], ['::after', 'a']]) {
            const pc = getComputedStyle(el, p);
            if (!pc.content || pc.content === 'none' || pc.content === 'normal') continue;
            const c = parseRgb(pc.color);
            if (c && c.a > 0.2 && lum(c) < 0.3) { const f = mapFg(c); if (f) out.push(['f' + s, '--nvp-pf' + s, f]); }
            for (const [side, k] of [['Top', 't'], ['Bottom', 'u']]) {
                if (parseFloat(pc['border' + side + 'Width']) < 2 || pc['border' + side + 'Style'] === 'none') continue;
                const bc = parseRgb(pc['border' + side + 'Color']);
                if (bc && bc.a > 0.3 && lum(bc) < 0.3) out.push([k + s, '--nvp-p' + k + s, mapFg(bc) || '#c8ccd4']);
            }
        }
        return out.length ? out : null;
    }
    function addPsToken(el, tok) {
        const cur = (el.getAttribute('data-nvp-ps') || '').split(/\s+/).filter(Boolean);
        if (!cur.includes(tok)) { cur.push(tok); mark(el, 'data-nvp-ps', cur.join(' ')); }
    }
    function applyPseudoFixes(el, fixes) {
        if (!fixes) return;
        for (const [tok, prop, val] of fixes) { setImp(el, prop, val); addPsToken(el, tok); }
    }
    function checkPseudo(el, th) {
        let tokens = el.getAttribute('data-nvp-ps') || '';
        for (const [p, t] of [['::before', 'b'], ['::after', 'a']]) {
            if (tokens.split(/\s+/).includes(t)) continue;
            const pc = getComputedStyle(el, p);
            if (!pc.content || pc.content === 'none' || pc.content === 'normal') continue;
            const pb = parseRgb(pc.backgroundColor);
            const pimg = pc.backgroundImage || 'none';
            if ((pb && pb.a > 0.5 && lum(pb) > th) || (/gradient\(/i.test(pimg) && !/url\(/i.test(pimg) && gradientLight(pimg))) tokens += (tokens ? ' ' : '') + t;
        }
        if (tokens && tokens !== (el.getAttribute('data-nvp-ps') || '')) mark(el, 'data-nvp-ps', tokens.trim());
    }
    // Tek bir öğeyi kontrol et; true dönerse o noktada daha alttaki öğelere bakmaya gerek yok
    // Ekranın en az beşte birini kaplayan açık renkli büyük görsel (afiş, kaydırmalı kahraman resmi):
    // hafifçe karartılır. Küçük görsellere (ürün fotoğrafı, logo) dokunulmaz; ölçülemeyen (farklı kökenli) görsel kalır.
    function dimBigImage(el) {
        if (el.localName !== 'img' || SMART.saved.get(el)?.filter) return;
        const r = el.getBoundingClientRect();
        const vis = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
        if (vis < window.innerWidth * window.innerHeight * 0.2) return;
        let u;
        try { u = new URL(el.currentSrc || el.src, location.href); } catch (_) { return; }
        if (u.origin !== location.origin && u.protocol !== 'data:') return;
        imageIsLight(u.href, (light) => { if (light && SMART.on && el.isConnected) setImp(el, 'filter', 'brightness(.55) contrast(1.05)'); });
    }
    function sweepEl(el, th) {
        if (el.localName === 'img') { dimBigImage(el); return true; }
        if (MEDIA.test(el.localName) || el.closest('svg')) return true;            // diğer görseller: olduğu gibi kalsın
        if (SMART.exclude) { try { if (el.closest(SMART.exclude)) return true; } catch (_) { /* yok say */ } }
        checkPseudo(el, th);
        const cs = getComputedStyle(el);
        const bg = parseRgb(cs.backgroundColor);
        const imgs = cs.backgroundImage || 'none';
        const hasUrl = /url\(/i.test(imgs), hasGrad = /gradient\(/i.test(imgs);
        const r = el.getBoundingClientRect();
        const big = r.width >= 160 && r.height >= 36;                       // düğme boyutundaki renkli öğeler korunur
        if (isBackdrop(el, cs)) return false;                                // modal örtüsü: dokunma, altına bak
        const shade = () => { if (SMART.on && el.isConnected && !SMART.saved.get(el)?.['background-image']) { shadeEl(el); fixTextIn(el); } };
        if (hasGrad && !hasUrl && !SMART.saved.get(el)?.['background-image'] && bandGradient(imgs) && bandAllowed(el, cs)) { shadeEl(el, BAND_OV); return true; }
        if ((hasUrl || hasGrad) && big) {
            estimateBg(cs, (v) => { if (v > th) shade(); });
            return true;
        }
        if (bg && bg.a > 0.5 && lum(bg) > th) {
            const m = mapBg(bg) || (mapTint(bg) && tintAllowed(el, cs) ? mapTint(bg) : null);
            if (m) { setImp(el, 'background-color', m); fixTextIn(el); }
            else if (big && lum(bg) > Math.max(th, 0.7)) shade();          // renkli zemin: yalnız çok açıksa (pastel)
            const bc = parseRgb(cs.borderTopColor);
            if (bc && parseFloat(cs.borderTopWidth) > 0 && lum(bc) > th) setImp(el, 'border-color', '#33363e');
            return true;
        }
        if (hasGrad && !hasUrl && gradientLight(imgs)) { shade(); return true; }   // küçük ama açık gradyan (kart başlığı vb.)
        if (bg && bg.a > 0.5 && !SMART.saved.get(el)?.['background-color']) {     // doygun renkli büyük bant
            const b = mapBand(bg);
            if (b && bandAllowed(el, cs)) { setImp(el, 'background-color', b); return true; }
        }
        return !!(bg && bg.a > 0.5);                                         // opak koyu/renkli yüzey: altına bakma
    }
    function smartSweep() {
        if (!SMART.on || !document.body || document.visibilityState === 'hidden') return;
        const W = window.innerWidth, H = window.innerHeight, th = threshold();
        // 1) Sınıfı/durumu değişen öğeler ve içleri (ızgaranın kaçırabileceği ince öğeler)
        const dirty = Array.from(SMART.dirty); SMART.dirty.clear();
        let budget = 800;
        for (const root of dirty) {
            if (!root.isConnected || root.nodeType !== 1 || root === document.body || root === document.documentElement) continue;
            const stack = [root];
            while (stack.length && budget-- > 0) {
                const el = stack.pop();
                if (el.localName === 'nvp-root') continue;
                sweepEl(el, th);
                for (const ch of el.children) stack.push(ch);
            }
        }
        // 2) Ekranda gerçekte görünen zeminler (sık ızgara)
        const seen = new Set(), stops = new Set();
        for (let iy = 0; iy < 12; iy++) {
            for (let ix = 0; ix < 10; ix++) {
                let list = [];
                try { list = document.elementsFromPoint((ix + 0.5) * W / 10, (iy + 0.5) * H / 12); } catch (_) { list = []; }
                for (const el of list) {
                    if (el.localName === 'nvp-root') continue;
                    if (el === document.body || el === document.documentElement) break;
                    // Daha önce görülen öğe: zemini opaksa altına bakmaya gerek yok; saydamsa
                    // (ekranı kaplayan modal kabı gibi) bu noktada alttaki öğelere geçilir.
                    if (seen.has(el)) { if (stops.has(el)) break; continue; }
                    seen.add(el);
                    if (sweepEl(el, th)) { stops.add(el); break; }
                }
            }
        }
    }
    // Kaydırırken de tara (en çok 250 ms'de bir), kaydırma bitince bir kez daha: yeni görünen açık alanlar beklemeden örtülür
    let lastSweepAt = 0;
    window.addEventListener('scroll', () => {
        const now = performance.now();
        if (now - lastSweepAt > 250) { lastSweepAt = now; scheduleSweep(0); } else scheduleSweep(150);
    }, { capture: true, passive: true });
    window.addEventListener('resize', () => scheduleSweep(400), { passive: true });

    // ── Uygula ─────────────────────────────────────────────────────────────
    function setCache(v) {
        if (cached === v || !alive()) return;
        cached = v;
        try { chrome.storage.local.set({ [CACHE_KEY]: v }, () => void chrome.runtime.lastError); } catch (_) { /* yok say */ }
    }
    // Stilimiz document_start'ta eklendiği için belgede sitenin stillerinden önce kalır; eşit güçteki
    // !important kurallarda sonra gelen kazandığından, sayfa ayrıştırıldıkça stil en sona taşınır.
    function ensureLast() {
        if (!styleEl || !styleEl.isConnected || !document.body) return;
        const root = document.documentElement;
        const last = hoverEl && hoverEl.isConnected ? hoverEl : styleEl;
        if (root.lastElementChild !== last) { root.appendChild(styleEl); if (last === hoverEl) root.appendChild(hoverEl); }
    }
    function setHoverCss(on) {
        const css = on && document.body ? hoverGlowCss() : '';
        if (!css) { if (hoverEl) hoverEl.remove(); return; }
        if (!hoverEl) { hoverEl = document.createElement('style'); hoverEl.id = 'nvp-dark-hover'; }
        if (hoverEl.textContent !== css) hoverEl.textContent = css;
        if (!hoverEl.isConnected) document.documentElement.appendChild(hoverEl);
    }
    function apply(state, reason) {
        const prev = api.state;
        const a = rules();
        if (state === 'on') {
            const lighten = reason === 'lighten';
            const built = buildCss(a, prev === 'on' || measuredOnce, lighten);
            const key = built.css;
            if (key !== appliedKey || !styleEl || !styleEl.isConnected) {
                if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'nvp-dark'; }
                styleEl.textContent = built.css;
                styleEl.media = 'all';
                if (!styleEl.isConnected) document.documentElement.appendChild(styleEl);
                appliedKey = key;
            }
            const smart = a.darkModeMethod === 'smart' && !lighten;
            setHoverCss(smart);
            ensureLast();
            api.counter = built.counter;
            if (smart) smartStart(); else smartStop();
        } else {
            smartStop();
            if (styleEl) styleEl.remove();
            setHoverCss(false);
            appliedKey = '';
            api.counter = '';
        }
        api.state = state;
        api.reason = reason;
        if (reason === 'auto') setCache('dark');
        else if (reason === 'lighten') setCache('lighten');
        else if (reason === 'user-off') setCache('light');
        else if (['native', 'already-dark', 'supports', 'darkreader'].includes(reason)) setCache('light');
        if (prev !== state || api._lastReason !== reason) {
            api._lastReason = reason;
            listeners.forEach((fn) => { try { fn(api); } catch (_) { /* yok say */ } });
        }
    }
    function evaluate(measure) {
        if (!loaded) return;
        const [state, reason] = decide(measure);
        apply(state, reason);
    }

    // ── Site seçimi (panel ve popup çağırır) ───────────────────────────────
    function setSiteMode(mode, cb) {
        if (!alive()) return;
        chrome.storage.local.get({ siteDark: {} }, (r) => {
            const map = (r && r.siteDark && typeof r.siteDark === 'object') ? r.siteDark : {};
            if (mode === 'on' || mode === 'off') map[HOST] = mode; else delete map[HOST];
            siteDark = map;
            // eski kayıtlar karar vermesin
            if (S.siteThemes && S.siteThemes[HOST]) { delete S.siteThemes[HOST]; }
            if ((S.darkExcludeSites || []).includes(HOST)) S.darkExcludeSites = S.darkExcludeSites.filter((h) => h !== HOST);
            chrome.storage.local.set({ siteDark: map }, () => {
                void chrome.runtime.lastError;
                evaluate(true);
                if (cb) cb(api);
            });
        });
    }

    // ── Yeniden kontrol tetikleyicileri ────────────────────────────────────
    let recheckTimer = null;
    function scheduleRecheck(delay) {
        clearTimeout(recheckTimer);
        recheckTimer = setTimeout(() => evaluate(true), delay == null ? 250 : delay);
    }
    const attrObs = new MutationObserver((muts) => {
        for (const m of muts) {
            if (m.type === 'attributes') { scheduleRecheck(); return; }
            for (const n of m.addedNodes) {
                if (n === styleEl) continue;
                if (n.nodeType === 1 && /^(style|link|meta)$/i.test(n.localName)) { cssomCache.n = -1; scheduleRecheck(400); return; }
            }
        }
    });
    function observe() {
        const opts = { attributes: true, attributeFilter: ['class', 'style', 'dark', 'data-darkreader-mode', 'data-darkreader-scheme', ...THEME_ATTRS] };
        try { attrObs.observe(document.documentElement, opts); } catch (_) { /* yok say */ }
        const more = () => {
            try { if (document.body) attrObs.observe(document.body, opts); } catch (_) { /* yok say */ }
            try { if (document.head) attrObs.observe(document.head, { childList: true }); } catch (_) { /* yok say */ }
        };
        if (document.body) more(); else document.addEventListener('DOMContentLoaded', more, { once: true });
    }
    let lastUrl = location.href;
    function urlChanged() {
        if (location.href === lastUrl) return;
        lastUrl = location.href;
        cssomCache.n = -1;
        scheduleRecheck(600);
        setTimeout(smartRescan, 800);
        setTimeout(() => scheduleSweep(0), 1500);
    }
    if (window.navigation && window.navigation.addEventListener) window.navigation.addEventListener('navigatesuccess', urlChanged);
    window.addEventListener('popstate', urlChanged);
    setInterval(urlChanged, 1500);
    mq.addEventListener('change', () => evaluate(true));
    setInterval(() => { if (S.darkSchedule && S.darkSchedule.enabled) evaluate(true); }, 60000);

    // ── Başlangıç ──────────────────────────────────────────────────────────
    if (!alive()) return;
    let pending = 2;
    const done = () => {
        if (--pending > 0) return;
        loaded = true;
        evaluate(false); // önbelleğe göre hemen (flaşsız)
        observe();
        const measureNow = () => { ensureLast(); evaluate(true); };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', measureNow, { once: true });
        else measureNow();
        window.addEventListener('load', () => { ensureLast(); scheduleRecheck(50); setTimeout(() => evaluate(true), 1500); }, { once: true });
    };
    try {
        chrome.storage.sync.get(DEF, (r) => { if (!chrome.runtime.lastError && r) S = r; done(); });
        chrome.storage.local.get({ siteDark: {}, [CACHE_KEY]: null }, (r) => {
            if (!chrome.runtime.lastError && r) { siteDark = r.siteDark || {}; cached = r[CACHE_KEY]; }
            done();
        });
    } catch (_) { return; }

    chrome.storage.onChanged.addListener((ch, area) => {
        if (!alive()) return;
        if (area === 'local' && ch.siteDark) { siteDark = ch.siteDark.newValue || {}; evaluate(true); }
        if (area === 'sync') {
            const keys = Object.keys(ch);
            if (!keys.some((k) => k in DEF)) return;
            chrome.storage.sync.get(DEF, (r) => { if (!chrome.runtime.lastError && r) { S = r; evaluate(true); } });
        }
    });
})();
