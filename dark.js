// Smart Nav Panel — Copyright (C) 2026 Sedat Alaca (LikaPulse) — LikaGroup
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
        pageDark: 'auto', darkModeMethod: 'smart', smartThreshold: 45,
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
    // Ekranda gerçekten görünen arka plan (body çoğu zaman saydamdır; sarmalayıcılar sayılır)
    function backgroundAt(x, y) {
        let list = [];
        try { list = document.elementsFromPoint(x, y); } catch (_) { list = []; }
        for (const el of list) {
            if (el.localName === 'nvp-root') continue;
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
            if (sh.ownerNode === styleEl) continue;
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
        let out = '';
        try {
            out = markers();
            if (!out && alreadyDark()) out = 'already-dark';
            if (!out && supportsDark()) out = 'supports';
        } catch (_) { out = ''; }
        if (had) styleEl.media = 'all';
        return out;
    }

    // ── Karar ──────────────────────────────────────────────────────────────
    function decide(measure) {
        api.siteMode = readSiteMode();
        api.globalMode = ['auto', 'always', 'never'].includes(S.pageDark) ? S.pageDark : 'auto';
        if (!activeHere()) return ['off', 'paused'];
        if (api.siteMode === 'off') {
            // Aydınlık: kendi karanlık temasındaki / zaten koyu siteyi açık renge çevir
            if (!measure || !document.body) return cached === 'lighten' ? ['on', 'lighten'] : ['off', 'user-off'];
            const native = detect();
            measuredOnce = true;
            return (native === 'native' || native === 'already-dark') ? ['on', 'lighten'] : ['off', 'user-off'];
        }
        // Karanlık (site seçimi ya da genel "her zaman"): zaten koyu siteyi ters çevirip açmamak için ölç
        const forceDark = (reason) => {
            if (!measure || !document.body) return cached === 'light' ? ['off', 'already-dark'] : ['on', reason];
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
            css += 'html,body{background-color:' + SMART_BG + '!important;color:' + SMART_FG + '!important}\nhtml{color-scheme:dark}\n';
            css += '[data-nvp-ps~="b"]::before,[data-nvp-ps~="a"]::after{background-color:#20232a!important;background-image:none!important;border-color:#33363e!important}\n';
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
    const OVERLAY = 'inset 0 0 0 200vmax rgba(22,24,29,.86)';     // zeminin üstünde, içeriğin altında kalan koyu örtü
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
            if (light && SMART.on && el.isConnected) setImp(el, 'box-shadow', 'inset 0 0 0 200vmax rgba(22,24,29,.88)');
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
        if (prop === 'background-color' || prop === 'box-shadow') mark(el, 'data-nvp-d');
        let sv = SMART.saved.get(el);
        if (!sv) { sv = {}; SMART.saved.set(el, sv); }
        if (!(prop in sv)) sv[prop] = [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)];
        el.style.setProperty(prop, val, 'important');
        SMART.els.add(el);
    }
    // Okuma (hepsi) → yazma (hepsi): her yazmadan sonra stil yeniden hesaplanmasın
    function smartProcess(list) {
        const decide = [];
        const memo = new Map();   // el → { changedBg: bool, fg: özgün yazı rengi, nfg: yeni yazı rengi }
        const info = (el) => {
            for (let n = el, k = 0; n && k < 40; k++, n = n.parentElement) {
                if (memo.has(n)) return memo.get(n);
                if (n === document.body || n === document.documentElement) return { changedBg: true, fg: null, nfg: SMART_FG };
            }
            return { changedBg: true, fg: null, nfg: null };
        };
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
                changedBg = !!nbg || (gradientOnly ? false : (hsl(bg).l < 0.35)); // koyu zemin de "koyu yüzey" sayılır
            } else if (bg && bg.a > 0.05 && !gradientOnly) {
                nbg = mapBg(bg);                                          // yarı saydam beyaz örtü
            }
            if (hasUrl && !nbg) maybeShadeImage(el, imgs);
            let shade = false;
            if (gradientOnly && gradientLight(imgs)) { shade = true; changedBg = true; }
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
            if (nbg || write || nbr || shade) decide.push([el, nbg, write ? nfg : null, nbr, shade]);
        }
        for (const [el, nbg, nfg, nbr, shade] of decide) {
            if (shade) setImp(el, 'box-shadow', OVERLAY);
            if (nbg) setImp(el, 'background-color', nbg);
            if (nfg) setImp(el, 'color', nfg);
            if (nbr) setImp(el, 'border-color', nbr);
        }
    }
    function smartDrain() {
        SMART.timer = 0;
        if (!SMART.on) { SMART.queue = []; return; }
        const batch = SMART.queue.splice(0, 2500);
        smartProcess(batch);
        if (SMART.queue.length) SMART.timer = setTimeout(smartDrain, 16);
        else scheduleSweep(300);
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
                if (b && b.a > 0.5 && !mapBg(b) && !el.hasAttribute('data-nvp-d')) continue; // renkli düğme/rozet
            }
            const c = parseRgb(cs.color);
            if (c && lum(c) < 0.3) { const f = mapFg(c); if (f) setImp(el, 'color', f); }
            for (const ch of el.children) stack.push(ch);
        }
    }
    function checkPseudo(el, th) {
        let tokens = el.getAttribute('data-nvp-ps') || '';
        for (const [p, t] of [['::before', 'b'], ['::after', 'a']]) {
            if (tokens.includes(t)) continue;
            const pc = getComputedStyle(el, p);
            if (!pc.content || pc.content === 'none' || pc.content === 'normal') continue;
            const pb = parseRgb(pc.backgroundColor);
            const pimg = pc.backgroundImage || 'none';
            if ((pb && pb.a > 0.5 && lum(pb) > th) || (/gradient\(/i.test(pimg) && !/url\(/i.test(pimg) && gradientLight(pimg))) tokens += (tokens ? ' ' : '') + t;
        }
        if (tokens && tokens !== (el.getAttribute('data-nvp-ps') || '')) mark(el, 'data-nvp-ps', tokens);
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
        const shade = () => { if (SMART.on && el.isConnected && !SMART.saved.get(el)?.['box-shadow']) { setImp(el, 'box-shadow', OVERLAY); fixTextIn(el); } };
        if ((hasUrl || hasGrad) && big) {
            estimateBg(cs, (v) => { if (v > th) shade(); });
            return true;
        }
        if (bg && bg.a > 0.5 && lum(bg) > th) {
            const m = mapBg(bg);
            if (m) { setImp(el, 'background-color', m); fixTextIn(el); }
            else if (big && lum(bg) > Math.max(th, 0.7)) shade();          // renkli zemin: yalnız çok açıksa (pastel)
            const bc = parseRgb(cs.borderTopColor);
            if (bc && parseFloat(cs.borderTopWidth) > 0 && lum(bc) > th) setImp(el, 'border-color', '#33363e');
            return true;
        }
        if (hasGrad && !hasUrl && gradientLight(imgs)) { shade(); return true; }   // küçük ama açık gradyan (kart başlığı vb.)
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
        const seen = new Set();
        for (let iy = 0; iy < 12; iy++) {
            for (let ix = 0; ix < 10; ix++) {
                let list = [];
                try { list = document.elementsFromPoint((ix + 0.5) * W / 10, (iy + 0.5) * H / 12); } catch (_) { list = []; }
                for (const el of list) {
                    if (el.localName === 'nvp-root') continue;
                    if (el === document.body || el === document.documentElement) break;
                    if (seen.has(el)) break;
                    seen.add(el);
                    if (sweepEl(el, th)) break;
                }
            }
        }
    }
    window.addEventListener('scroll', () => scheduleSweep(350), { capture: true, passive: true });
    window.addEventListener('resize', () => scheduleSweep(400), { passive: true });

    // ── Uygula ─────────────────────────────────────────────────────────────
    function setCache(v) {
        if (cached === v || !alive()) return;
        cached = v;
        try { chrome.storage.local.set({ [CACHE_KEY]: v }, () => void chrome.runtime.lastError); } catch (_) { /* yok say */ }
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
            api.counter = built.counter;
            if (a.darkModeMethod === 'smart' && !lighten) smartStart(); else smartStop();
        } else {
            smartStop();
            if (styleEl) styleEl.remove();
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
        const measureNow = () => evaluate(true);
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', measureNow, { once: true });
        else measureNow();
        window.addEventListener('load', () => { scheduleRecheck(50); setTimeout(() => evaluate(true), 1500); }, { once: true });
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
