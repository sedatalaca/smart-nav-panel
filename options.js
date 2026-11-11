// Smart Nav Panel — Copyright (C) 2026 LikaGroup (Sedat Alaca-LikaPulse)
// SPDX-License-Identifier: GPL-3.0-or-later
const UI_LANG = (() => { try { const l = String(chrome.i18n.getUILanguage() || 'en').slice(0, 2).toLowerCase(); return l === 'tr' || l === 'ru' ? l : 'en'; } catch (_) { return 'en'; } })();

const defaults = {
    pageDark: 'auto',
    panelTheme: 'auto',
    panelStyle: 'compact',
    optionsTheme: null,
    hoverColor: '#37a8a8',
    bgColorHex: '#1e1e24',
    buttonColor: '#2d2d37',
    arrowColor: '#ffffff',
    offsetRight: 30,
    offsetBottom: 30,
    panelMode: null,
    balloonMode: null,
    frontFollowsSystem: true,
    buttonRadius: 12,
    buttonSize: 30,
    showThemeButton: true,
    showPageButton: true,
    showEdgeButton: true,
    keyboardShortcuts: true,
    position: 'right-bottom',
    paused: false,
    pausedSites: [],
    activeSites: [],
    enableAllSites: true,
    siteRules: [],
    autoHide: true,
    autoHideDelay: 300,
    rememberPosition: true,
    gestures: true,
    detectConflicts: true,
    readingProgress: true,
    autoScrollSpeed: 40,
    smartThreshold: 45,
    smartTint: true,
    smartTintThreshold: 45,
    smartBands: true,
    smartBandThreshold: 35,
    darkModeMethod: 'smart',
    darkModeAreas: { body: true, text: false, link: false, button: false, image: false, form: false, code: false, table: false, scrollbar: false },
    excludeCss: '',
    invertIntensity: 1,
    invertBrightness: 1,
    invertContrast: 1,
    invertGrayscale: 0,
    invertWarmth: 0,
    invertDim: false,
    invertImageMode: 'original',
    colorPreserve: 0.25,
    invertOverrideText: false,
    invertTextColor: '#e1e1e6',
    invertOverrideLink: false,
    invertLinkColor: '#4dabf7',
    invertOverrideBg: false,
    invertBgColor: '#121214',
    invertAreas: { link: false, button: false, text: false, form: false, code: false, table: false, image: false },
    overlayHeadingColor: false,
    overlayHeadingColorHex: '#e0e0e0',
    overlayBoldColor: false,
    overlayBoldColorHex: '#e0e0e0',
    overlaySvgColor: false,
    overlaySvgColorHex: '#e1e1e6',
    overlayGrayscale: false,
    overlayLineHeight: '',
    overlayLetterSpacing: '',
    overlayTextShadow: '',
    overlayFontFamily: '',
    darkSiteRules: {},
    darkSchedule: { enabled: false, startHour: 20, startMin: 0, endHour: 7, endMin: 0 },
    darkFontSize: 0,
    darkFontWeight: 0,
    darkBgGradient: '',
    darkFilters: { saturate: 100, hueRotate: 0 },
    darkTransition: 300,
    darkScrollOpt: false,
    darkExcludeSites: [],
    darkAutoDetect: true,
    customCss: '/* CSS code to inject into sites */\n',
    customButtonTemplate: '',
    language: UI_LANG
};

// Parse an input value as a safe integer, falling back to `dflt` only when the
// value is missing/NaN — preserves a legitimate `0` (unlike `parseInt(...) || d`).
function safeInt(v, dflt) {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? dflt : n;
}

function parseRules(text) {
    const lines = (text || '').split('\n');
    const out = [];
    lines.forEach((s) => {
        s = s.trim();
        if (!s) return;
        let action = 'hide', selector = s;
        if (s[0] === '+') { action = 'show'; selector = s.slice(1).trim(); }
        else if (s[0] === '-') { action = 'hide'; selector = s.slice(1).trim(); }
        if (selector) {
            const valid = isValidSelector(selector);
            if (!valid) {
                console.warn('Invalid CSS selector in site rule:', selector);
            }
            out.push({ selector, action });
        }
    });
    return out;
}

// Validate CSS selector via document.querySelector (throws on invalid)
function isValidSelector(sel) {
    try {
        document.querySelector(sel);
        return true;
    } catch (e) {
        // Check against a basic regex pattern as fallback
        return /^(#|\\.|\[|::?[a-zA-Z])/.test(sel.trim());
    }
}

// Validate CSS: reject dangerous patterns like expression(), url(javascript:), etc.
function sanitizeCss(css) {
    if (!css?.trim()) return defaults.customCss;
    const MAX = 50000;
    const dangers = ['expression(', 'javascript:', 'vbscript:', '-moz-binding', 'behavior:', 'url(javascript'];
    const low = css.toLowerCase();
    for (const d of dangers) {
        if (low.includes(d)) {
            console.warn('Blocked potentially unsafe CSS:', d);
            return defaults.customCss;
        }
    }
    // @import ile dış stil dosyası yüklenmesini engelle
    css = css.replace(/@import[^;]*;?/gi, '');
    if (css.length > MAX) {
        console.warn('Custom CSS exceeds maximum length; truncated');
        return css.slice(0, MAX);
    }
    return css;
}

// Sanitize excludeCss: per-selector dangerous pattern filter (line-by-line)
function sanitizeExcludeCss(text) {
    if (!text?.trim()) return '';
    const dangers = ['expression(', 'javascript:', 'vbscript:', '-moz-binding', 'behavior:', 'url(javascript'];
    return text.split(/[\n,]/).map((s) => {
        s = s.trim();
        if (!s) return '';
        const low = s.toLowerCase();
        for (const d of dangers) {
            if (low.includes(d)) { console.warn('Blocked unsafe exclude selector:', s); return ''; }
        }
        return s;
    }).filter(Boolean).join('\n');
}
function serializeRules(arr) {
    return (arr || []).map((r) => (r.action === 'show' ? '+ ' : '- ') + r.selector).join('\n');
}

// Storage layer for environments without chrome.storage API
// (e.g. opening HTML directly). Falls back: chrome.storage.sync → localStorage →
// if even that's blocked (file:// / data: opaque origin), in-memory storage.
let _ls = null;
try {
    const _t = '__nav_ls_test__';
    localStorage.setItem(_t, '1');
    localStorage.removeItem(_t);
    _ls = localStorage;
} catch (e) {
    _ls = null;
}
const _mem = {};
// Bu sayfanın kendi yazımlarını storage.onChanged'de ayırt etmek için
let _selfWriteUntil = 0;

const storage = (typeof chrome !== 'undefined' && chrome.storage?.sync)
    ? {
        get: (keys, cb) => { try { chrome.storage.sync.get(keys, (result) => { try { if (chrome.runtime?.lastError) { cb({}); return; } cb(result || {}); } catch (_) { cb({}); } }); } catch (_) { cb({}); } },
        set: (obj, cb) => { _selfWriteUntil = Date.now() + 1500; try { chrome.storage.sync.set(obj, cb); } catch { if (cb) cb(); } },
        remove: (keys, cb) => { try { chrome.storage.sync.remove(keys, cb); } catch { if (cb) cb(); } }
      }
    : {
        get: (keys, cb) => {
          if (typeof keys === 'string') keys = [keys];
          if (Array.isArray(keys)) {
            const out = {};
            keys.forEach(k => {
              const v = _ls ? _ls.getItem('nav_' + k) : _mem[k];
              out[k] = (v == null) ? undefined : JSON.parse(v);
            });
            cb(out);
          } else {
            const out = {};
            Object.keys(keys).forEach(k => {
              const v = _ls ? _ls.getItem('nav_' + k) : _mem[k];
              out[k] = (v == null) ? keys[k] : JSON.parse(v);
            });
            cb(out);
          }
        },
        set: (obj, cb) => {
          Object.keys(obj).forEach(k => {
            const v = JSON.stringify(obj[k]);
            if (_ls) _ls.setItem('nav_' + k, v);
            else _mem[k] = v;
          });
          if (cb) cb();
        },
        remove: (keys, cb) => {
          if (typeof keys === 'string') keys = [keys];
          keys.forEach(k => { if (_ls) _ls.removeItem('nav_' + k); else delete _mem[k]; });
          if (cb) cb();
        }
      };


const SUN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="#FFC107" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5" fill="#FFC107" stroke="none"/><line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/><line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/><line x1="3.4" y1="3.4" x2="5.5" y2="5.5"/><line x1="18.5" y1="18.5" x2="20.6" y2="20.6"/><line x1="3.4" y1="20.6" x2="5.5" y2="18.5"/><line x1="18.5" y1="5.5" x2="20.6" y2="3.4"/></svg>';
const MOON_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const MONITOR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="2" y1="9" x2="22" y2="9"/><path d="M6 17l6 4 6-4"/><line x1="9" y1="21" x2="9" y2="17"/><line x1="15" y1="21" x2="15" y2="17"/></svg>';

function adminThemeIcon() {
    if (currentAdminTheme === null) return MONITOR_SVG;
    return currentAdminTheme === 'light' ? MOON_SVG : SUN_SVG;
}

function hexToRgba(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, 0.85)`;
}

// Convert an rgba() string back to a hex color (#rrggbb), for migrating legacy
// stored `bgColor` values into the newer `bgColorHex` field. Returns null on failure.
function rgbaToHex(rgba) {
    const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(String(rgba));
    if (!m) return null;
    const c = m.slice(1).map((n) => {
        const v = Math.max(0, Math.min(255, parseInt(n, 10)));
        return v.toString(16).padStart(2, '0');
    });
    return '#' + c.join('');
}

function positionCss(position, h, v) {
    if (position === 'left-bottom') return `left: ${h}px !important; bottom: ${v}px !important; right: auto !important; top: auto !important;`;
    if (position === 'right-top') return `right: ${h}px !important; top: ${v}px !important; left: auto !important; bottom: auto !important;`;
    if (position === 'left-top') return `left: ${h}px !important; top: ${v}px !important; right: auto !important; bottom: auto !important;`;
    return `right: ${h}px !important; bottom: ${v}px !important; left: auto !important; top: auto !important;`;
}

function isMac() {
    return /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac OS/.test(navigator.userAgent);
}

function updateKeyboardHint() {
    const el = document.getElementById('keyboardHint');
    if (!el) return;
    const d = translations[activeLang] || translations.tr;
    el.textContent = isMac() ? d.keyboardHintMac : d.keyboardHintOther;
}

function showMessage(message) {
    const statusEl = document.getElementById('status');
    statusEl.innerText = message;
    setTimeout(() => { statusEl.innerText = ''; }, 3000);
}

let currentAdminTheme = null; // 'dark' | 'light' | null (null => follows system)
let currentBalloonTheme = null; // 'dark' | 'light' | null (null => follows system)

function updateThemeIcon(mode) {
    const icon = document.querySelector('.theme-icon');
    if (!icon) return;
    icon.setAttribute('data-mode', mode === null ? 'system' : (mode === 'light' ? 'light' : 'dark'));
}

function applyPanelTheme(panelMode) {
    currentAdminTheme = panelMode === null ? null : (panelMode === 'light' ? 'light' : 'dark');
    document.body.classList.remove('panel-dark', 'panel-light');
    if (panelMode === 'dark') document.body.classList.add('panel-dark');
    else if (panelMode === 'light') document.body.classList.add('panel-light');
    else document.body.classList.add(systemTheme() === 'dark' ? 'panel-dark' : 'panel-light');
    updateThemeIcon(panelMode);
}

// Sıra her yerde aynı: Aydınlık → Karanlık → Sistem (null)
function setAdminTheme(next) {
    applyPanelTheme(next);
    storage.set({ optionsTheme: next }, () => {
        updatePreview();
        updateJsonField(collectFormData());
        notify('themeChanged');
    });
}
function cycleAdminTheme() {
    setAdminTheme(currentAdminTheme === 'light' ? 'dark' : (currentAdminTheme === 'dark' ? null : 'light'));
}

function updateBalloonThemeIcon(mode) {
    const icon = document.getElementById('balloonThemeIcon');
    if (!icon) return;
    icon.setAttribute('data-mode', mode === null ? 'system' : (mode === 'light' ? 'light' : 'dark'));
}

function applyBalloonTheme(mode) {
    currentBalloonTheme = mode === null ? null : (mode === 'light' ? 'light' : 'dark');
    updateBalloonThemeIcon(currentBalloonTheme);
}

function cycleBalloonTheme() {
    const next = currentBalloonTheme === 'light' ? 'dark' : (currentBalloonTheme === 'dark' ? null : 'light');
    applyBalloonTheme(next);
    storage.set({ balloonMode: next }, () => {
        updateJsonField(collectFormData());
        notify('themeChanged');
    });
}

if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (currentAdminTheme === null) applyPanelTheme(null);
    });
}

function systemTheme() {
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}

// ---------- Multi-language (i18n) ----------
const translations = {
    tr: {
        title: 'Navigasyon Eklentisi Ayarları',
        activeInactive: '🔘 Aktif / Pasif Ayarları',
        positionShortcuts: '📍 Konum & Kısayollar',
        visualStyle: '🎨 Görsel Stil Ayarları',
        siteRules: '🌐 Site Kuralları',
        darkMode: '🌙 Karanlık Mod',
        studio: 'Canlı Kod Geliştirme Stüdyosu',
        themeLabel: 'Tema Değiştirici Butonu:',
        pageLabel: 'Sayfa İlerleme Butonları (↑ / ↓):',
        edgeLabel: 'En Üst / En Alt Butonları (▲ / ▼):',
        panelPosition: 'Panel Konumu:',
        keyboardShortcuts: 'Klavye Kısayolları:',
        autoHide: 'Otomatik Gizlenme:',
        rememberPosition: 'Konumu Hatırla:',
        gestures: 'Jestler:',
        hoverColor: 'Üzerine Gelince Renk (Hover):',
        backgroundColor: 'Panel Arka Plan Rengi:',
        buttonColor: 'Buton Kutu Rengi:',
        arrowColor: 'Ok Simgeleri Rengi:',
        buttonSize: 'Buton Boyutu (px):',
        buttonRadius: 'Buton Yuvarlaklık (px):',
        fromRight: 'Sağ Kenar (px):',
        fromBottom: 'Alt Kenar (px):',
        siteRulesHeading: 'Belli sitelerde otomatik açık / kapalı',
        darkModeMethod: 'Yöntem:',
        invertAreas: 'Karanlık modun uygulanacağı alanlar',
        body: 'Gövde',
        text: 'Yazı',
        link: 'Bağlantı',
        button: 'Buton',
        image: 'Görseller',
        form: 'Form alanları',
        code: 'Kod blokları',
        table: 'Tablolar',
        scrollbar: 'Kaydırma çubuğu',
        areaSelectAll: 'Hepsini Aç',
        areaClearAll: 'Hepsini Kapat',
        exclude: 'Hariç tutulacak öğeler (CSS seçici):',
        resetAllBtn: '🔄 Tüm Ayarları Varsayılana Döndür',
        save: 'TÜM DEĞİŞİKLİKLERİ CANLI KAYDET',
        languageLabel: 'Dil:',
        heading: 'Navigasyon Kontrol Paneli',
        reset: 'Sıfırla',
        themeTransition: 'Temaya tıkla geçiş',
        balloonThemeLabel: 'Balon (Popup) Teması:',
        balloonThemeHint: 'Eklenti balonunun kendi teması (arka yüzden bağımsız)',
        balloonTheme: 'Balon temasına tıkla geçiş',
        decrease: 'Azalt',
        increase: 'Artır',
        preview: 'Buton önizleme',
        keyboardHintMac: '⌥ (Option) + ↑/↓ Sayfa • ⌃ (Ctrl) + ⌥ (Option) + ↑/↓ Uç • ⌥ + S Oto-kaydır',
        keyboardHintOther: 'Alt + ↑/↓ Sayfa • Ctrl + Alt + ↑/↓ Uç • Alt + S Oto-kaydır',
        autoHideHint: 'Aşağı kaydırırken saydamlaşır, yukarı kaydırınca belirir',
        autoHideDelay: 'Gizleme Gecikmesi (ms):',
        rememberPositionHint: 'Yenilemede eski konuma dön',
        gesturesHint: 'Sayfada Alt+tıklama ile yer imi ekle',
        detectConflicts: 'Çakışma Algıla:',
        detectConflictsHint: 'Sitenin kendi görünür "yukarı çık" düğmesi varsa bizimkini gizle',
        cssVarsayilan: '/* Sitelere enjekte edilecek CSS kodu */\n',
        saved: '⚡ Tüm değişiklikler canlı kaydedildi!',
        themeChanged: '⚡ Tema değiştirildi!',
        resetDone: '🔄 Tüm ayarlar varsayılana döndü!',
        singleReset: '↺ {0} varsayılana döndü!',
        languageChanged: '⚡ Dil değiştirildi!',
        btnTheme: 'Tema',
        btnTop: 'En Üst',
        btnBottom: 'En Alt',
        btnUp: 'Yukarı',
        btnDown: 'Aşağı',
        jsonLabel: '1. Dinamik JSON Yapılandırması',
        cssLabel: '2. Canlı CSS Editörü (yalnız panele uygulanır — panel Shadow DOM içinde, sayfaya sızmaz)',
        htmlLabel: '3. Canlı HTML Buton Şablonu (ID\'leri koruyun; yalnız #btn-theme-toggle içeren şablon sadece tema butonunun yerine geçer)',
        cssPlaceholder: 'Örn: .nav-button { border-radius: 50% !important; background: gold !important; }',
        htmlPlaceholder: 'Boş bırakırsanız eklentinin standart 4\'lü oklu yapısı kullanılır.',
        posBottomRight: 'Sağ Alt',
        posBottomLeft: 'Sol Alt',
        posTopRight: 'Sağ Üst',
        posTopLeft: 'Sol Üst',
        methodInvert: 'İnvert (renkler korunur)',
        methodTheme: 'Temamızı Uygula',
        siteRuleHint: 'Her satıra bir site. <b>-</b> ile başlarsa panel gizlenir, <b>+</b> ile başlarsa zorla gösterilir. Örn:<br>- example.com<br>+ mail.example.com',
        areaHint: 'Bu alanlar "Temamızı Uygula" yöntemiyle karanlık mod uygulanırken denetlenir. İşaretli olmayanlar orijinal hâliyle kalır.',
        excludeHint: 'Bu öğeler karanlık moddan etkilenmez (orijinal hâliyle kalır). Virgül veya satırla ayırın. Örn: <b>.ad, #banner, img.logo</b>',
        pausedSitesTitle: 'Duraklatılmış Siteler',
        pausedSitesHint: 'Bu sitelerde gezinme paneli otomatik olarak gizlenir. <b>Popup\'taki "Duraklat" butonu</b> ile eklenir.',
        clearAll: 'Tümünü Temizle',
        cleared: '✓ Duraklatılmış siteler temizlendi!',
        infoMethod: '<b>İnvert:</b> Tüm sayfayı otomatik ters çevirir; renk tonları korunur, tek dokunuş. Ayrıntılı alan kontrolü yoktur.<br><br><b>Temamızı Uygula:</b> Sitenin gövdesini bizim koyu temamızla boyar. Aşağıdaki "alanlar"ı (gövde, yazı, bağlantı, buton, görseller, form alanları, kod blokları, tablolar, kaydırma çubuğu) tek tek açıp kapatabilirsin.',
        exportBtn: '📥 Ayarları Dışa Aktar',
        importBtn: '📤 Ayarları İçe Aktar',
        exported: '⚡ Ayarlar dışa aktarıldı!',
        imported: '⚡ Ayarlar içe aktarıldı! Sayfa yenilendi.',
        importError: '❌ Geçersiz JSON dosyası!',
        invertSettings: 'İnvert Ayarları',
        invertSettingsHint: 'Yalnızca "İnvert" yönteminde geçerli',
        invertIntensity: 'İnvert şiddeti:',
        invertBrightness: 'Parlaklık:',
        invertContrast: 'Kontrast:',
        invertGrayscale: 'Gri tonlama:',
        invertWarmth: 'Sıcak ton (mavi ışık):',
        invertDim: 'Karartma modu (renkleri ters çevirme, sadece koyulaştır)',
        invertImageMode: 'Görsellerin davranışı:',
        colorPreserve: 'Renk koruma eşiği:',
        colorPreserveHint: 'Kök düzeydeki container\'lardaki renkli içerikleri korur. 0 = kapalı.',
        invImgOriginal: 'Renkli kalsın (orijinal)',
        invImgInvert: 'Sayfayla birlikte ters çevrilsin',
        invImgGrayscale: 'Gri tonlamaya zorla',
        invAreaHint: 'İşaretli alanlar koyu moddan etkilenir (ters çevrilir). İşaretli olmayan alanlar orijinal hâliyle kalır.',
        invertTextColor: '🖌️ Metin & Renk Ayarları',
        invTextOverride: 'Yazı rengi',
        invLinkOverride: 'Bağlantı rengi',
        invBgOverride: 'Arka plan',
        overlaySettings: '🎨 Overlay Ayarları (invert üzerine)',
        overlayHint: 'Bu ayarlar invert uygulanmış sayfanın üzerine uygulanır, tekrar invert edilmez.',
        overlayHeadingColor: 'Başlık rengi (h1-h6)',
        overlayBoldColor: 'Kalın/italic rengi',
        overlaySvgColor: 'SVG/İkon rengi',
        overlayGrayscale: 'Grayscale Koruması',
        overlayGrayscaleHint: 'Grayscale uygulanmış elementleri invert\'ten muaf tut',
        overlayLineHeight: 'Satır yüksekliği:',
        overlayLineHeightHint: 'Boş = tarayıcı varsayılanı. Örn: 1.6, 1.8',
        overlayLetterSpacing: 'Harfler arası boşluk:',
        overlayLetterSpacingHint: 'Boş = tarayıcı varsayılanı. Örn: 0.5, 1 (px)',
        overlayTextShadow: 'Metin gölgesi:',
        overlayTextShadowHint: 'Boş = gölge yok. CSS text-shadow değeri girin.',
        overlayFontFamily: 'Font ailesi:',
        overlayFontFamilyHint: 'Boş = sayfanın kendi fontu kullanılır.',
        excludeIframe: '+ iframe',
        excludeImages: '+ Görseller',
        excludeBgImg: '+ Arka plan görselleri',
        excludeMap: '+ Harita (gm-style)',
        darkAdvanced: '⚙️ Gelişmiş Karanlık Mod',
        darkAutoDetect: 'Otomatik Algıla:',
        darkAutoDetectHint: 'Sayfa zaten koyuysa karanlık modu atla',
        darkSchedule: 'Zamanlama:',
        darkScheduleHint: 'Belirli saatlerde otomatik aktifleşsin',
        scheduleStart: 'Başlangıç:',
        scheduleEnd: 'Bitiş:',
        darkTransition: 'Geçiş Süresi (ms):',
        darkTransitionHint: 'Karanlık mod açılırken animasyon süresi',
        darkFontSize: 'Font Boyutu Artışı (%):',
        darkFontSizeHint: 'Karanlık modda yazı boyutunu büyüt',
        darkFontWeight: 'Font Kalınlığı:',
        darkFontWeightHint: '0=normal, pozitif değerler kalınlaştırır',
        darkSaturate: 'Doygunluk (%):',
        darkSaturateHint: 'Renk doygunluğu ayarı',
        darkHueRotate: 'Renk Döndürme (°):',
        darkHueRotateHint: 'Tüm renkleri döndür',
        darkScrollOpt: 'Scroll Optimizasyonu:',
        darkScrollOptHint: 'Performans için karanlık modda scroll hızlandır',
        darkSaveSite: 'Site Bazlı Kaydet:',
        darkSaveSiteHint: 'Bu site için özel ayarları kaydet',
        darkExcludeSite: 'Bu Siteyi Hariç Tut:',
        darkExcludeSiteHint: 'Karanlık mod bu sitede uygulanmasın',
        resetSection: 'Bölümü sıfırla',
        enable: 'Etkinleştir',
        readingProgress: 'Okuma İlerlemesi:',
        pageDarkLabel: 'Sayfa karartma:', pageDarkHint: 'Otomatik: yalnız sistem karanlıkken ve site açık renkliyse; sitenin kendi karanlık modu varsa dokunmaz', pdAuto: 'Otomatik (akıllı)', pdAlways: 'Her zaman', pdNever: 'Hiçbir zaman',
        panelThemeLabel: 'Panel görünümü:', panelThemeHint: 'Otomatik: panel, altındaki sayfanın rengine uyar', ptAuto: 'Sayfaya uy (otomatik)', ptDark: 'Koyu', ptLight: 'Açık',
        panelStyleLabel: 'Panel düzeni:', panelStyleHint: 'Kompakt: tek akıllı düğme, üzerine gelince açılır', psCompact: 'Kompakt', psFull: 'Tam (hep açık)',
        readingProgressHint: '"En Üst" butonunda ilerleme halkası ve kalan okuma süresi',
        autoScrollSpeed: 'Otomatik Kaydırma Hızı (px/sn):',
        autoScrollSpeedHint: 'Alt+S ile başlat/durdur · çalışırken + / − ile ayarla · Esc durdurur',
        externalChange: '↻ Ayarlar başka bir yerde değişti; kaydedince yalnız sizin değiştirdiğiniz alanlar yazılır.',
    },
    en: {
        title: 'Navigation Extension Settings',
        activeInactive: '🔘 Active / Passive Settings',
        positionShortcuts: '📍 Position & Shortcuts',
        visualStyle: '🎨 Visual Style Settings',
        siteRules: '🌐 Site Rules',
        darkMode: '🌙 Dark Mode',
        studio: 'Live Code Development Studio',
        themeLabel: 'Theme Switcher Button:',
        pageLabel: 'Page Scroll Buttons (↑ / ↓):',
        edgeLabel: 'Top / Bottom Buttons (▲ / ▼):',
        panelPosition: 'Panel Position:',
        keyboardShortcuts: 'Keyboard Shortcuts:',
        autoHide: 'Auto Hide:',
        rememberPosition: 'Remember Position:',
        gestures: 'Gestures:',
        hoverColor: 'Hover Color:',
        backgroundColor: 'Panel Background Color:',
        buttonColor: 'Button Box Color:',
        arrowColor: 'Arrow Icon Color:',
        buttonSize: 'Button Size (px):',
        buttonRadius: 'Button Roundness (px):',
        fromRight: 'Right Edge (px):',
        fromBottom: 'Bottom Edge (px):',
        siteRulesHeading: 'Auto on/off on certain sites',
        darkModeMethod: 'Method:',
        invertAreas: 'Areas the dark mode applies to',
        body: 'Body',
        text: 'Text',
        link: 'Link',
        button: 'Button',
        image: 'Images',
        form: 'Form fields',
        code: 'Code blocks',
        table: 'Tables',
        scrollbar: 'Scrollbar',
        areaSelectAll: 'Select All',
        areaClearAll: 'Clear All',
        exclude: 'Elements to exclude (CSS selector):',
        resetAllBtn: '🔄 Reset All Settings to Default',
        save: 'SAVE ALL CHANGES LIVE',
        languageLabel: 'Language:',
        heading: 'Navigation Control Panel',
        reset: 'Reset',
        themeTransition: 'Click to switch theme',
        balloonThemeLabel: 'Balloon (Popup) Theme:',
        balloonThemeHint: 'The extension balloon\'s own theme (independent of back-face)',
        balloonTheme: 'Click to switch balloon theme',
        decrease: 'Decrease',
        increase: 'Increase',
        preview: 'Button preview',
        keyboardHintMac: '⌥ (Option) + ↑/↓ Page • ⌃ (Ctrl) + ⌥ (Option) + ↑/↓ Edge • ⌥ + S Auto-scroll',
        keyboardHintOther: 'Alt + ↑/↓ Page • Ctrl + Alt + ↑/↓ Edge • Alt + S Auto-scroll',
        autoHideHint: 'Fades while scrolling down, returns when scrolling up',
        autoHideDelay: 'Hide delay (ms):',
        rememberPositionHint: 'Returns to last position on reload',
        gesturesHint: 'Alt+click on the page to add a bookmark',
        detectConflicts: 'Detect Conflicts:',
        detectConflictsHint: "Hide our Top button when the site shows its own",
        cssVarsayilan: '/* CSS code to inject into sites */\n',
        saved: '⚡ All changes saved live!',
        themeChanged: '⚡ Theme changed!',
        resetDone: '🔄 All settings reset to default!',
        singleReset: '↺ {0} reset to default!',
        languageChanged: '⚡ Language changed!',
        btnTheme: 'Theme',
        btnTop: 'Top',
        btnBottom: 'Bottom',
        btnUp: 'Up',
        btnDown: 'Down',
        jsonLabel: '1. Dynamic JSON Configuration',
        cssLabel: '2. Live CSS Editor (applied to the panel only — it lives in a Shadow DOM)',
        htmlLabel: '3. Live HTML Button Template (keep IDs; a template with only #btn-theme-toggle replaces just the theme button)',
        cssPlaceholder: 'E.g.: .nav-button { border-radius: 50% !important; background: gold !important; }',
        htmlPlaceholder: 'Leave empty to use the extension\'s standard 4-arrow layout.',
        posBottomRight: 'Bottom Right',
        posBottomLeft: 'Bottom Left',
        posTopRight: 'Top Right',
        posTopLeft: 'Top Left',
        methodInvert: 'Invert (colors preserved)',
        methodTheme: 'Apply Our Theme',
        siteRuleHint: 'One site per line. Starting with <b>-</b> hides the panel, <b>+</b> forces it to show. E.g.:<br>- example.com<br>+ mail.example.com',
        areaHint: 'These areas are controlled when "Apply Our Theme" method is active. Unchecked ones stay in their original state.',
        excludeHint: 'These elements are unaffected by dark mode (stay original). Separate with commas or newlines. E.g.: <b>.ad, #banner, img.logo</b>',
        pausedSitesTitle: 'Paused Sites',
        pausedSitesHint: 'Navigation panel is automatically hidden on these sites. Added via the <b>"Pause" button in the popup</b>.',
        clearAll: 'Clear All',
        cleared: '✓ Paused sites cleared!',
        infoMethod: '<b>Invert:</b> Automatically inverts the whole page; colors are preserved, single tap. No detailed area control.<br><br><b>Apply Our Theme:</b> Paints the site body with our dark theme. You can toggle the following "areas" (body, text, link, button, images, form fields, code blocks, tables, scrollbar) individually.',
        exportBtn: '📥 Export Settings',
        importBtn: '📤 Import Settings',
        exported: '⚡ Settings exported!',
        imported: '⚡ Settings imported! Page will reload.',
        importError: '❌ Invalid JSON file!',
        invertSettings: 'Invert Settings',
        invertSettingsHint: 'Only valid with the "Invert" method',
        invertIntensity: 'Invert strength:',
        invertBrightness: 'Brightness:',
        invertContrast: 'Contrast:',
        invertGrayscale: 'Grayscale:',
        invertWarmth: 'Warm tone (blue light):',
        invertDim: 'Dim mode (no color inversion, just darken)',
        invertImageMode: 'Image behavior:',
        colorPreserve: 'Color preservation threshold:',
        colorPreserveHint: 'Preserves colorful content in root-level containers. 0 = off.',
        invImgOriginal: 'Keep colors (original)',
        invImgInvert: 'Invert with the page',
        invImgGrayscale: 'Force grayscale',
        invAreaHint: 'Checked areas are affected by dark mode (inverted). Unchecked areas stay original.',
        invertTextColor: '🖌️ Text & Color Settings',
        invTextOverride: 'Text color',
        invLinkOverride: 'Link color',
        invBgOverride: 'Background',
        overlaySettings: '🎨 Overlay Settings (on top of invert)',
        overlayHint: 'Applied on top of the inverted page, not inverted again.',
        overlayHeadingColor: 'Heading color (h1-h6)',
        overlayBoldColor: 'Bold/italic color',
        overlaySvgColor: 'SVG/Icon color',
        overlayGrayscale: 'Grayscale Protection',
        overlayGrayscaleHint: 'Exclude grayscale elements from invert',
        overlayLineHeight: 'Line height:',
        overlayLineHeightHint: 'Empty = browser default. E.g: 1.6, 1.8',
        overlayLetterSpacing: 'Letter spacing:',
        overlayLetterSpacingHint: 'Empty = browser default. E.g: 0.5, 1 (px)',
        overlayTextShadow: 'Text shadow:',
        overlayTextShadowHint: 'Empty = no shadow. Enter CSS text-shadow value.',
        overlayFontFamily: 'Font family:',
        overlayFontFamilyHint: 'Empty = page uses its own font.',
        excludeIframe: '+ iframe',
        excludeImages: '+ Images',
        excludeBgImg: '+ Background images',
        excludeMap: '+ Map (gm-style)',
        darkAdvanced: '⚙️ Advanced Dark Mode',
        darkAutoDetect: 'Auto Detect:',
        darkAutoDetectHint: 'Skip dark mode if page is already dark',
        darkSchedule: 'Schedule:',
        darkScheduleHint: 'Auto-activate during specific hours',
        scheduleStart: 'Start:',
        scheduleEnd: 'End:',
        darkTransition: 'Transition (ms):',
        darkTransitionHint: 'Animation duration when toggling dark mode',
        darkFontSize: 'Font Size Increase (%):',
        darkFontSizeHint: 'Increase font size in dark mode',
        darkFontWeight: 'Font Weight:',
        darkFontWeightHint: '0=normal, higher values make text bolder',
        darkSaturate: 'Saturation (%):',
        darkSaturateHint: 'Color saturation adjustment',
        darkHueRotate: 'Hue Rotate (°):',
        darkHueRotateHint: 'Rotate all colors',
        darkScrollOpt: 'Scroll Optimization:',
        darkScrollOptHint: 'Boost scroll performance in dark mode',
        darkSaveSite: 'Save Per Site:',
        darkSaveSiteHint: 'Save custom settings for this site',
        darkExcludeSite: 'Exclude This Site:',
        darkExcludeSiteHint: 'Do not apply dark mode on this site',
        resetSection: 'Reset section',
        enable: 'Enable',
        readingProgress: 'Reading Progress:',
        pageDarkLabel: 'Page dimming:', pageDarkHint: "Auto: only when the system is dark and the site is light; never touches sites with their own dark mode", pdAuto: 'Auto (smart)', pdAlways: 'Always', pdNever: 'Never',
        panelThemeLabel: 'Panel look:', panelThemeHint: 'Auto: the panel matches the page beneath it', ptAuto: 'Match page (auto)', ptDark: 'Dark', ptLight: 'Light',
        panelStyleLabel: 'Panel layout:', panelStyleHint: 'Compact: one smart button that expands on hover', psCompact: 'Compact', psFull: 'Full (always open)',
        readingProgressHint: 'Progress ring and time left on the "Top" button',
        autoScrollSpeed: 'Auto-scroll Speed (px/s):',
        autoScrollSpeedHint: 'Alt+S starts/stops · + / − adjusts while running · Esc stops',
        externalChange: '↻ Settings changed elsewhere; saving writes only the fields you changed.',
    },
    ru: {
        title: 'Настройки расширения Навигация',
        activeInactive: '🔘 Активные / Пассивные настройки',
        positionShortcuts: '📍 Положение и горячие клавиши',
        visualStyle: '🎨 Настройки визуального стиля',
        siteRules: '🌐 Правила сайтов',
        darkMode: '🌙 Тёмная тема',
        studio: 'Студия живого кода',
        themeLabel: 'Кнопка переключения темы:',
        pageLabel: 'Кнопки прокрутки страницы (↑ / ↓):',
        edgeLabel: 'Кнопки вверх / вниз (▲ / ▼):',
        panelPosition: 'Положение панели:',
        keyboardShortcuts: 'Горячие клавиши:',
        autoHide: 'Автоскрытие:',
        rememberPosition: 'Запоминать положение:',
        gestures: 'Жесты:',
        hoverColor: 'Цвет при наведении:',
        backgroundColor: 'Цвет фона панели:',
        buttonColor: 'Цвет блока кнопки:',
        arrowColor: 'Цвет стрелок:',
        buttonSize: 'Размер кнопки (px):',
        buttonRadius: 'Скругление кнопки (px):',
        fromRight: 'Отступ справа (px):',
        fromBottom: 'Отступ снизу (px):',
        siteRulesHeading: 'Автовкл/выкл на определённых сайтах',
        darkModeMethod: 'Метод:',
        invertAreas: 'Области применения тёмной темы',
        body: 'Тело',
        text: 'Текст',
        link: 'Ссылка',
        button: 'Кнопка',
        image: 'Изображения',
        form: 'Поля формы',
        code: 'Блоки кода',
        table: 'Таблицы',
        scrollbar: 'Полоса прокрутки',
        areaSelectAll: 'Выбрать все',
        areaClearAll: 'Очистить все',
        exclude: 'Исключить элементы (CSS-селектор):',
        resetAllBtn: '🔄 Сбросить все настройки по умолчанию',
        save: 'СОХРАНИТЬ ВСЕ ИЗМЕНЕНИЯ',
        languageLabel: 'Язык:',
        heading: 'Панель управления Навигация',
        reset: 'Сброс',
        themeTransition: 'Нажмите, чтобы переключить тему',
        balloonThemeLabel: 'Тема баллона (Popup):',
        balloonThemeHint: 'Собственная тема баллона расширения (независимо от лицевой стороны)',
        balloonTheme: 'Нажмите, чтобы переключить тему баллона',
        decrease: 'Уменьшить',
        increase: 'Увеличить',
        preview: 'Предпросмотр кнопки',
        keyboardHintMac: '⌥ (Option) + ↑/↓ Страница • ⌃ (Ctrl) + ⌥ (Option) + ↑/↓ Край • ⌥ + S Автопрокрутка',
        keyboardHintOther: 'Alt + ↑/↓ Страница • Ctrl + Alt + ↑/↓ Край • Alt + S Автопрокрутка',
        autoHideHint: 'Бледнеет при прокрутке вниз, возвращается при прокрутке вверх',
        autoHideDelay: 'Задержка скрытия (мс):',
        rememberPositionHint: 'Возвращается на прежнее место при перезагрузке',
        gesturesHint: 'Alt+клик по странице — добавить закладку',
        detectConflicts: 'Обнаружение конфликтов:',
        detectConflictsHint: 'Скрыть нашу кнопку «В начало», если у сайта есть своя',
        cssVarsayilan: '/* CSS-код для внедрения на сайты */\n',
        saved: '⚡ Все изменения сохранены!',
        themeChanged: '⚡ Тема изменена!',
        resetDone: '🔄 Все настройки сброшены по умолчанию!',
        singleReset: '↺ {0} сброшено по умолчанию!',
        languageChanged: '⚡ Язык изменён!',
        btnTheme: 'Тема',
        btnTop: 'Вверх',
        btnBottom: 'Вниз',
        btnUp: 'Выше',
        btnDown: 'Ниже',
        jsonLabel: '1. Динамическая JSON-конфигурация',
        cssLabel: '2. Редактор CSS (применяется только к панели — она в Shadow DOM)',
        htmlLabel: '3. HTML-шаблон кнопок (сохраняйте ID; шаблон только с #btn-theme-toggle заменяет лишь кнопку темы)',
        cssPlaceholder: 'Напр.: .nav-button { border-radius: 50% !important; background: gold !important; }',
        htmlPlaceholder: 'Оставьте пустым, чтобы использовать стандартную 4-стрелочную раскладку.',
        posBottomRight: 'Низ право',
        posBottomLeft: 'Низ лево',
        posTopRight: 'Верх право',
        posTopLeft: 'Верх лево',
        methodInvert: 'Инверсия (цвета сохраняются)',
        methodTheme: 'Применить нашу тему',
        siteRuleHint: 'Один сайт на строку. С <b>-</b> панель скрывается, с <b>+</b> принудительно показывается. Напр.:<br>- example.com<br>+ mail.example.com',
        areaHint: 'Эти области управляются при методе «Применить нашу тему». Отключённые остаются в исходном состоянии.',
        excludeHint: 'Эти элементы не затрагиваются тёмной темой (остаются как есть). Разделяйте запятыми или переносом. Напр.: <b>.ad, #banner, img.logo</b>',
        pausedSitesTitle: 'Приостановленные сайты',
        pausedSitesHint: 'На этих сайтах панель навигации автоматически скрывается. Добавляется через <b>"Пауза" в popup</b>.',
        clearAll: 'Очистить все',
        cleared: '✓ Приостановленные сайты очищены!',
        infoMethod: '<b>Инверсия:</b> Автоматически инвертирует всю страницу; цвета сохраняются, один тап. Нет детального контроля областей.<br><br><b>Применить нашу тему:</b> Окрашивает тело сайта нашей тёмной темой. Можно переключать следующие «области» (тело, текст, ссылка, кнопка, изображения, поля форм, блоки кода, таблицы, полоса прокрутки) по отдельности.',
        exportBtn: '📥 Экспорт настроек',
        importBtn: '📤 Импорт настроек',
        exported: '⚡ Настройки экспортированы!',
        imported: '⚡ Настройки импортированы! Страница будет перезагружена.',
        importError: '❌ Неверный JSON файл!',
        invertSettings: 'Настройки инверсии',
        invertSettingsHint: 'Действует только с методом «Инверсия»',
        invertIntensity: 'Сила инверсии:',
        invertBrightness: 'Яркость:',
        invertContrast: 'Контраст:',
        invertGrayscale: 'Серые тона:',
        invertWarmth: 'Тёплый тон (синяя подсветка):',
        invertDim: 'Режим затемнения (без инверсии цветов, просто темнее)',
        invertImageMode: 'Поведение изображений:',
        colorPreserve: 'Порог сохранения цвета:',
        colorPreserveHint: 'Сохраняет цветной контент в контейнерах корневого уровня. 0 = выкл.',
        invImgOriginal: 'Оставить цветными (оригинал)',
        invImgInvert: 'Инвертировать вместе со страницей',
        invImgGrayscale: 'Принудительно в серый',
        invAreaHint: 'Отмеченные области инвертируются. Неотмеченные остаются как есть.',
        invertTextColor: '🖌️ Настройки текста и цвета',
        invTextOverride: 'Цвет текста',
        invLinkOverride: 'Цвет ссылок',
        invBgOverride: 'Фон',
        overlaySettings: '🎨 Настройки оверлея (поверх инверсии)',
        overlayHint: 'Применя поверх инвертированной страницы, не инвертируется повторно.',
        overlayHeadingColor: 'Цвет заголовков (h1-h6)',
        overlayBoldColor: 'Цвет полужирного/курсива',
        overlaySvgColor: 'Цвет SVG/иконок',
        overlayGrayscale: 'Защита от полутонов',
        overlayGrayscaleHint: 'Исключить полутоновые элементы из инверсии',
        overlayLineHeight: 'Высота строки:',
        overlayLineHeightHint: 'Пусто = по умолчанию. Напр: 1.6, 1.8',
        overlayLetterSpacing: 'Межбуквенное расстояние:',
        overlayLetterSpacingHint: 'Пусто = по умолчанию. Напр: 0.5, 1 (px)',
        overlayTextShadow: 'Тень текста:',
        overlayTextShadowHint: 'Пусто = без тени. Введите CSS text-shadow значение.',
        overlayFontFamily: 'Шрифт:',
        overlayFontFamilyHint: 'Пусто = используется шрифт страницы.',
        excludeIframe: '+ iframe',
        excludeImages: '+ Изображения',
        excludeBgImg: '+ Фоновые изображения',
        excludeMap: '+ Карта (gm-style)',
        darkAdvanced: '⚙️ Расширенный тёмный режим',
        darkAutoDetect: 'Автоопределение:',
        darkAutoDetectHint: 'Пропустить тёмный режим, если страница уже тёмная',
        darkSchedule: 'Расписание:',
        darkScheduleHint: 'Автоматическая активация в определённые часы',
        scheduleStart: 'Начало:',
        scheduleEnd: 'Конец:',
        darkTransition: 'Переход (мс):',
        darkTransitionHint: 'Длительность анимации при переключении',
        darkFontSize: 'Увеличение шрифта (%):',
        darkFontSizeHint: 'Увеличить размер шрифта в тёмном режиме',
        darkFontWeight: 'Жирность шрифта:',
        darkFontWeightHint: '0=нормальный, положительные значения делают текст жирнее',
        darkSaturate: 'Насыщенность (%):',
        darkSaturateHint: 'Настройка насыщенности цвета',
        darkHueRotate: 'Вращение оттенка (°):',
        darkHueRotateHint: 'Повернуть все цвета',
        darkScrollOpt: 'Оптимизация прокрутки:',
        darkScrollOptHint: 'Ускорить прокрутку в тёмном режиме',
        darkSaveSite: 'Сохранять для сайта:',
        darkSaveSiteHint: 'Сохранить пользовательские настройки для этого сайта',
        darkExcludeSite: 'Исключить сайт:',
        darkExcludeSiteHint: 'Не применять тёмный режим на этом сайте',
        resetSection: 'Сбросить раздел',
        enable: 'Включить',
        readingProgress: 'Прогресс чтения:',
        pageDarkLabel: 'Затемнение страниц:', pageDarkHint: 'Авто: только при тёмной системе и светлом сайте; сайты со своим тёмным режимом не трогает', pdAuto: 'Авто (умное)', pdAlways: 'Всегда', pdNever: 'Никогда',
        panelThemeLabel: 'Вид панели:', panelThemeHint: 'Авто: панель подстраивается под цвет страницы', ptAuto: 'Под страницу (авто)', ptDark: 'Тёмная', ptLight: 'Светлая',
        panelStyleLabel: 'Компоновка панели:', panelStyleHint: 'Компактная: одна умная кнопка, раскрывается при наведении', psCompact: 'Компактная', psFull: 'Полная (всегда открыта)',
        readingProgressHint: 'Кольцо прогресса и оставшееся время на кнопке «В начало»',
        autoScrollSpeed: 'Скорость автопрокрутки (пикс/с):',
        autoScrollSpeedHint: 'Alt+S — старт/стоп · + / − меняют скорость · Esc останавливает',
        externalChange: '↻ Настройки изменены в другом месте; при сохранении записываются только изменённые вами поля.',
    }
};


// v5 ayarlar sayfası tasarımı: güncel etiketler (eski sözlük değerlerinin üzerine yazar)
Object.assign(translations.tr, {"title": "Navigasyon Ayarları", "heading": "Ayarlar", "headingSub": "Paneli, akıllı karartmayı ve site kurallarını buradan yönet. Değişiklikler sağdaki önizlemede anında görünür.", "brandName": "Navigasyon", "navPanel": "Panel", "navLook": "Görünüm", "navDark": "Karartma", "navDarkPro": "Gelişmiş karartma", "navSites": "Site kuralları", "navDev": "Geliştirici", "navBackup": "Yedek", "activeInactive": "Düğmeler", "themeLabel": "Karartma düğmesi", "pageLabel": "Sayfa yukarı / aşağı", "edgeLabel": "En üst / en alt", "positionShortcuts": "Konum ve davranış", "panelPosition": "Panel konumu", "posBottomRight": "Sağ alt", "posBottomLeft": "Sol alt", "posTopRight": "Sağ üst", "posTopLeft": "Sol üst", "panelStyleLabel": "Panel düzeni", "panelThemeLabel": "Panel görünümü", "pageDarkLabel": "Sayfa karartma", "keyboardShortcuts": "Klavye kısayolları", "autoHide": "Otomatik gizlenme", "autoHideDelay": "Kapanma gecikmesi (ms)", "rememberPosition": "Kaydırma konumunu hatırla", "rememberPositionHint": "Sayfaya dönünce kaldığın yerden devam et", "gestures": "Yer imleri", "detectConflicts": "Çakışma algıla", "readingProgress": "Okuma ilerlemesi", "readingProgressHint": "Düğmede ilerleme halkası ve kalan okuma süresi", "autoScrollSpeed": "Otomatik kaydırma hızı (px/sn)", "autoScrollSpeedHint": "Alt+S başlat/durdur · + / − hız · Esc durdurur", "visualStyle": "Görünüm", "hoverColor": "Vurgu rengi", "backgroundColor": "Koyu panel zemini", "buttonColor": "Düğme rengi", "arrowColor": "Koyu panelde ikon rengi", "buttonSize": "Düğme boyutu (px)", "buttonRadius": "Köşe yuvarlaklığı (px)", "fromRight": "Yan kenar boşluğu (px)", "fromBottom": "Dikey kenar boşluğu (px)", "balloonThemeLabel": "Balon (popup) teması", "balloonThemeHint": "Eklenti balonunun kendi teması", "darkMode": "Karartma", "darkModeMethod": "Yöntem", "methodInvert": "Ters çevirme (renkler korunur)", "methodTheme": "Kendi temamızı uygula", "invertSettings": "Ters çevirme ayarları", "invertSettingsHint": "Yalnızca \"Ters çevirme\" yönteminde geçerli", "invertIntensity": "Şiddet", "invertBrightness": "Parlaklık", "invertContrast": "Kontrast", "invertGrayscale": "Gri tonlama", "invertWarmth": "Sıcak ton", "invertImageMode": "Görseller", "invImgOriginal": "Renkli kalsın", "invImgInvert": "Sayfayla birlikte çevrilsin", "invImgGrayscale": "Gri tonlansın", "invertDim": "Yalnız koyulaştır (renkleri ters çevirme)", "invertAreas": "\"Kendi temamız\" yönteminde boyanacak alanlar", "areaHint": "Yalnızca \"Kendi temamızı uygula\" yönteminde geçerli", "areaSelectAll": "Hepsini aç", "areaClearAll": "Hepsini kapat", "exclude": "Karartılmayacak öğeler (CSS seçici)", "excludeHint": "Virgül ya da satırla ayır. Örn: <b>.ad, #banner, img.logo</b>", "darkAdvanced": "Gelişmiş karartma", "darkSchedule": "Zamanlama", "darkScheduleHint": "Yalnız belirli saatlerde karart", "scheduleStart": "Başlangıç", "scheduleEnd": "Bitiş", "darkTransition": "Geçiş süresi (ms)", "darkTransitionHint": "Karartma açılırken animasyon süresi", "darkFontSize": "Yazı büyütme (%)", "darkFontSizeHint": "Karartılmış sayfada yazıyı büyüt", "darkFontWeight": "Yazı kalınlığı", "darkFontWeightHint": "0 = sayfanın kendi kalınlığı", "darkSaturate": "Doygunluk (%)", "darkSaturateHint": "Renk canlılığı", "darkHueRotate": "Renk döndürme (°)", "darkHueRotateHint": "Tüm renkleri döndür", "overlaySettings": "Karartılmış sayfaya ek renkler", "overlayHint": "Bu renkler karartılmış sayfanın üstüne uygulanır.", "invTextOverride": "Yazı", "invLinkOverride": "Bağlantı", "invBgOverride": "Arka plan", "overlayHeadingColor": "Başlıklar", "overlayBoldColor": "Kalın yazı", "overlaySvgColor": "İkonlar", "overlayGrayscale": "Gri görselleri koru", "overlayLineHeight": "Satır yüksekliği", "overlayLineHeightHint": "Boş = sayfanın kendisi. Örn: 1.6", "overlayLetterSpacing": "Harf aralığı (px)", "overlayLetterSpacingHint": "Boş = sayfanın kendisi", "overlayTextShadow": "Yazı gölgesi", "overlayTextShadowHint": "CSS text-shadow değeri", "overlayFontFamily": "Yazı tipi", "overlayFontFamilyHint": "Boş = sayfanın kendi yazı tipi", "siteRules": "Site kuralları", "siteRulesHeading": "Belirli sitelerde paneli gizle / zorla göster", "siteRuleHint": "Her satıra bir site. <b>-</b> panel gizlenir, <b>+</b> zorla gösterilir. Örn: <b>- example.com</b>", "pausedSitesTitle": "Duraklatılmış siteler", "pausedSitesHint": "Bu sitelerde eklenti çalışmaz. Popup'taki <b>\"Bu sitede çalışsın\"</b> anahtarıyla eklenir.", "clearAll": "Tümünü temizle", "studio": "Geliştirici", "cssLabel": "Özel CSS (panele uygulanır)", "htmlLabel": "Özel HTML düğme şablonu", "jsonLabel": "Tüm ayarlar (JSON)", "devHint": "Tema Stüdyosu'nun \"Navigasyon Eklentisi\" sekmesindeki HTML ve CSS'i buradaki alanlara yapıştırabilirsin.", "htmlPlaceholder": "Boş bırakırsan standart düğmeler kullanılır.", "exportBtn": "Ayarları dışa aktar", "importBtn": "Ayarları içe aktar", "resetAllBtn": "Tüm ayarları varsayılana döndür", "save": "Değişiklikleri kaydet", "previewTitle": "Canlı önizleme", "pvLight": "Açık site", "pvDark": "Koyu site", "previewHint": "Üzerine gel: panel açılır · <kbd>sağ tık</kbd> menü · düğmeler önizleme sayfasını kaydırır", "pvArticle": "Gece de gündüz de rahat okuma", "pvP1": "Bu, panelin gerçek bir sitede nasıl görüneceğini gösteren örnek bir sayfadır. Sağ alttaki düğmenin üzerine gel: diğer düğmeler açılır.", "pvH1": "Akıllı düğme", "pvP2": "Sayfanın başındayken aşağı kaydırır, aşağıdayken en üste çıkarır. Çevresindeki halka ne kadar okuduğunu gösterir.", "pvP3": "Önizleme sayfasını kaydır ya da paneldeki düğmeleri kullan; her şey gerçek eklentideki gibi çalışır.", "pvH2": "Akıllı karartma", "pvP4": "Karartma düğmesi bu önizlemede Otomatik → Açık → Kapalı arasında geçiş yapar.", "pvP5": "Renk, boyut ve konum ayarlarını değiştirdikçe panel anında güncellenir.", "pvP6": "Sayfanın sonu.", "pvMenuHeadings": "Başlıklar", "pvMenuBookmarks": "Yer imleri", "pvMenuAuto": "Otomatik kaydır", "pvMenuDim": "Bu sitede karartma", "pvAuto": "Otomatik", "pvOn": "Açık", "pvOff": "Kapalı", "pvMenuHide": "Paneli bu sitede gizle", "pvMenuSettings": "Ayarlar", "pvMore": "Diğer", "pvFabDown": "Aşağı kaydır", "pvFabTop": "En üste çık", "pvRead": "okundu"});
Object.assign(translations.en, {"title": "Navigation Settings", "heading": "Settings", "headingSub": "Manage the panel, smart dimming and site rules. Changes show instantly in the preview on the right.", "brandName": "Navigation", "navPanel": "Panel", "navLook": "Appearance", "navDark": "Dimming", "navDarkPro": "Advanced dimming", "navSites": "Site rules", "navDev": "Developer", "navBackup": "Backup", "activeInactive": "Buttons", "themeLabel": "Dimming button", "pageLabel": "Page up / down", "edgeLabel": "Top / bottom", "positionShortcuts": "Position & behavior", "panelPosition": "Panel position", "posBottomRight": "Bottom right", "posBottomLeft": "Bottom left", "posTopRight": "Top right", "posTopLeft": "Top left", "panelStyleLabel": "Panel layout", "panelThemeLabel": "Panel look", "pageDarkLabel": "Page dimming", "keyboardShortcuts": "Keyboard shortcuts", "autoHide": "Auto-hide", "autoHideDelay": "Close delay (ms)", "rememberPosition": "Remember scroll position", "rememberPositionHint": "Continue where you left off", "gestures": "Bookmarks", "detectConflicts": "Detect conflicts", "readingProgress": "Reading progress", "readingProgressHint": "Progress ring and time left on the button", "autoScrollSpeed": "Auto-scroll speed (px/s)", "autoScrollSpeedHint": "Alt+S start/stop · + / − speed · Esc stops", "visualStyle": "Appearance", "hoverColor": "Accent color", "backgroundColor": "Dark panel background", "buttonColor": "Button color", "arrowColor": "Icon color on dark panel", "buttonSize": "Button size (px)", "buttonRadius": "Corner radius (px)", "fromRight": "Side margin (px)", "fromBottom": "Vertical margin (px)", "balloonThemeLabel": "Popup theme", "balloonThemeHint": "The extension popup's own theme", "darkMode": "Dimming", "darkModeMethod": "Method", "methodInvert": "Invert (keeps colors)", "methodTheme": "Apply our theme", "invertSettings": "Invert settings", "invertSettingsHint": "Only for the \"Invert\" method", "invertIntensity": "Intensity", "invertBrightness": "Brightness", "invertContrast": "Contrast", "invertGrayscale": "Grayscale", "invertWarmth": "Warmth", "invertImageMode": "Images", "invImgOriginal": "Keep colors", "invImgInvert": "Invert with the page", "invImgGrayscale": "Grayscale", "invertDim": "Only darken (no inversion)", "invertAreas": "Areas painted by \"our theme\"", "areaHint": "Only for the \"Apply our theme\" method", "areaSelectAll": "All on", "areaClearAll": "All off", "exclude": "Elements to keep (CSS selectors)", "excludeHint": "Separate with commas or lines. E.g. <b>.ad, #banner, img.logo</b>", "darkAdvanced": "Advanced dimming", "darkSchedule": "Schedule", "darkScheduleHint": "Only dim during certain hours", "scheduleStart": "Start", "scheduleEnd": "End", "darkTransition": "Transition (ms)", "darkTransitionHint": "Animation when dimming turns on", "darkFontSize": "Text enlarge (%)", "darkFontSizeHint": "Enlarge text on dimmed pages", "darkFontWeight": "Text weight", "darkFontWeightHint": "0 = the page's own weight", "darkSaturate": "Saturation (%)", "darkSaturateHint": "Color vividness", "darkHueRotate": "Hue rotate (°)", "darkHueRotateHint": "Rotate all colors", "overlaySettings": "Extra colors on dimmed pages", "overlayHint": "These colors are applied on top of the dimmed page.", "invTextOverride": "Text", "invLinkOverride": "Links", "invBgOverride": "Background", "overlayHeadingColor": "Headings", "overlayBoldColor": "Bold text", "overlaySvgColor": "Icons", "overlayGrayscale": "Keep gray images", "overlayLineHeight": "Line height", "overlayLineHeightHint": "Empty = page default. E.g. 1.6", "overlayLetterSpacing": "Letter spacing (px)", "overlayLetterSpacingHint": "Empty = page default", "overlayTextShadow": "Text shadow", "overlayTextShadowHint": "CSS text-shadow value", "overlayFontFamily": "Font", "overlayFontFamilyHint": "Empty = the page's own font", "siteRules": "Site rules", "siteRulesHeading": "Hide / force-show the panel on certain sites", "siteRuleHint": "One site per line. <b>-</b> hides the panel, <b>+</b> forces it. E.g. <b>- example.com</b>", "pausedSitesTitle": "Paused sites", "pausedSitesHint": "The extension does not run on these sites. Added with the popup's <b>\"Run on this site\"</b> switch.", "clearAll": "Clear all", "studio": "Developer", "cssLabel": "Custom CSS (applied to the panel)", "htmlLabel": "Custom HTML button template", "jsonLabel": "All settings (JSON)", "devHint": "You can paste the HTML and CSS from Theme Studio's \"Navigation Extension\" tab here.", "htmlPlaceholder": "Leave empty to use the standard buttons.", "exportBtn": "Export settings", "importBtn": "Import settings", "resetAllBtn": "Reset everything to defaults", "save": "Save changes", "previewTitle": "Live preview", "pvLight": "Light site", "pvDark": "Dark site", "previewHint": "Hover: the panel expands · <kbd>right-click</kbd> menu · buttons scroll the preview page", "pvArticle": "Comfortable reading, day and night", "pvP1": "This sample page shows how the panel looks on a real site. Hover the button at the bottom right: the other buttons appear.", "pvH1": "Smart button", "pvP2": "At the top it scrolls down; further down it takes you to the top. The ring shows how much you have read.", "pvP3": "Scroll the preview page or use the panel buttons; everything works like the real extension.", "pvH2": "Smart dimming", "pvP4": "In this preview the dimming button cycles Auto → On → Off.", "pvP5": "The panel updates instantly as you change color, size and position.", "pvP6": "End of page.", "pvMenuHeadings": "Headings", "pvMenuBookmarks": "Bookmarks", "pvMenuAuto": "Auto-scroll", "pvMenuDim": "Dimming on this site", "pvAuto": "Auto", "pvOn": "On", "pvOff": "Off", "pvMenuHide": "Hide panel on this site", "pvMenuSettings": "Settings", "pvMore": "More", "pvFabDown": "Scroll down", "pvFabTop": "Back to top", "pvRead": "read"});
Object.assign(translations.ru, {"title": "Настройки навигации", "heading": "Настройки", "headingSub": "Управляйте панелью, умным затемнением и правилами сайтов. Изменения сразу видны в предпросмотре справа.", "brandName": "Навигация", "navPanel": "Панель", "navLook": "Вид", "navDark": "Затемнение", "navDarkPro": "Расширенное затемнение", "navSites": "Правила сайтов", "navDev": "Разработчик", "navBackup": "Резервная копия", "activeInactive": "Кнопки", "themeLabel": "Кнопка затемнения", "pageLabel": "Страница вверх / вниз", "edgeLabel": "В начало / в конец", "positionShortcuts": "Положение и поведение", "panelPosition": "Положение панели", "posBottomRight": "Справа снизу", "posBottomLeft": "Слева снизу", "posTopRight": "Справа сверху", "posTopLeft": "Слева сверху", "panelStyleLabel": "Компоновка панели", "panelThemeLabel": "Вид панели", "pageDarkLabel": "Затемнение страниц", "keyboardShortcuts": "Сочетания клавиш", "autoHide": "Автоскрытие", "autoHideDelay": "Задержка закрытия (мс)", "rememberPosition": "Запоминать позицию прокрутки", "rememberPositionHint": "Продолжить с того же места", "gestures": "Закладки", "detectConflicts": "Обнаружение конфликтов", "readingProgress": "Прогресс чтения", "readingProgressHint": "Кольцо прогресса и оставшееся время на кнопке", "autoScrollSpeed": "Скорость автопрокрутки (пикс/с)", "autoScrollSpeedHint": "Alt+S старт/стоп · + / − скорость · Esc стоп", "visualStyle": "Вид", "hoverColor": "Акцентный цвет", "backgroundColor": "Фон тёмной панели", "buttonColor": "Цвет кнопок", "arrowColor": "Цвет значков на тёмной панели", "buttonSize": "Размер кнопки (пикс)", "buttonRadius": "Скругление (пикс)", "fromRight": "Боковой отступ (пикс)", "fromBottom": "Вертикальный отступ (пикс)", "balloonThemeLabel": "Тема всплывающего окна", "balloonThemeHint": "Собственная тема окна расширения", "darkMode": "Затемнение", "darkModeMethod": "Метод", "methodInvert": "Инверсия (сохраняет цвета)", "methodTheme": "Наша тема", "invertSettings": "Настройки инверсии", "invertSettingsHint": "Только для метода «Инверсия»", "invertIntensity": "Сила", "invertBrightness": "Яркость", "invertContrast": "Контраст", "invertGrayscale": "Оттенки серого", "invertWarmth": "Тёплый тон", "invertImageMode": "Изображения", "invImgOriginal": "Сохранять цвета", "invImgInvert": "Инвертировать со страницей", "invImgGrayscale": "Оттенки серого", "invertDim": "Только затемнять (без инверсии)", "invertAreas": "Области для метода «Наша тема»", "areaHint": "Только для метода «Наша тема»", "areaSelectAll": "Всё вкл.", "areaClearAll": "Всё выкл.", "exclude": "Не затемнять (CSS-селекторы)", "excludeHint": "Через запятую или с новой строки. Напр.: <b>.ad, #banner, img.logo</b>", "darkAdvanced": "Расширенное затемнение", "darkSchedule": "Расписание", "darkScheduleHint": "Затемнять только в определённые часы", "scheduleStart": "Начало", "scheduleEnd": "Конец", "darkTransition": "Переход (мс)", "darkTransitionHint": "Анимация включения затемнения", "darkFontSize": "Увеличение текста (%)", "darkFontSizeHint": "Увеличить текст на затемнённых страницах", "darkFontWeight": "Жирность текста", "darkFontWeightHint": "0 = как на странице", "darkSaturate": "Насыщенность (%)", "darkSaturateHint": "Яркость цветов", "darkHueRotate": "Поворот оттенка (°)", "darkHueRotateHint": "Повернуть все цвета", "overlaySettings": "Доп. цвета на затемнённых страницах", "overlayHint": "Эти цвета применяются поверх затемнённой страницы.", "invTextOverride": "Текст", "invLinkOverride": "Ссылки", "invBgOverride": "Фон", "overlayHeadingColor": "Заголовки", "overlayBoldColor": "Жирный текст", "overlaySvgColor": "Значки", "overlayGrayscale": "Сохранять серые изображения", "overlayLineHeight": "Межстрочный интервал", "overlayLineHeightHint": "Пусто = как на странице. Напр.: 1.6", "overlayLetterSpacing": "Межбуквенный интервал (пикс)", "overlayLetterSpacingHint": "Пусто = как на странице", "overlayTextShadow": "Тень текста", "overlayTextShadowHint": "Значение CSS text-shadow", "overlayFontFamily": "Шрифт", "overlayFontFamilyHint": "Пусто = шрифт страницы", "siteRules": "Правила сайтов", "siteRulesHeading": "Скрыть / принудительно показать панель на сайтах", "siteRuleHint": "Один сайт на строку. <b>-</b> скрывает панель, <b>+</b> показывает принудительно. Напр.: <b>- example.com</b>", "pausedSitesTitle": "Сайты на паузе", "pausedSitesHint": "На этих сайтах расширение не работает. Добавляются переключателем <b>«Работать на этом сайте»</b> во всплывающем окне.", "clearAll": "Очистить всё", "studio": "Разработчик", "cssLabel": "Свой CSS (для панели)", "htmlLabel": "Свой HTML-шаблон кнопок", "jsonLabel": "Все настройки (JSON)", "devHint": "Сюда можно вставить HTML и CSS со вкладки «Navigation Extension» в Theme Studio.", "htmlPlaceholder": "Оставьте пустым для стандартных кнопок.", "exportBtn": "Экспорт настроек", "importBtn": "Импорт настроек", "resetAllBtn": "Сбросить всё по умолчанию", "save": "Сохранить изменения", "previewTitle": "Живой предпросмотр", "pvLight": "Светлый сайт", "pvDark": "Тёмный сайт", "previewHint": "Наведите: панель раскроется · <kbd>правый клик</kbd> меню · кнопки прокручивают страницу предпросмотра", "pvArticle": "Удобное чтение днём и ночью", "pvP1": "Это пример страницы, показывающий, как панель выглядит на настоящем сайте. Наведите на кнопку справа внизу.", "pvH1": "Умная кнопка", "pvP2": "В начале страницы прокручивает вниз, ниже — возвращает наверх. Кольцо показывает, сколько прочитано.", "pvP3": "Прокрутите страницу предпросмотра или используйте кнопки панели.", "pvH2": "Умное затемнение", "pvP4": "Здесь кнопка затемнения переключает Авто → Вкл. → Выкл.", "pvP5": "Панель обновляется сразу при изменении цвета, размера и положения.", "pvP6": "Конец страницы.", "pvMenuHeadings": "Заголовки", "pvMenuBookmarks": "Закладки", "pvMenuAuto": "Автопрокрутка", "pvMenuDim": "Затемнение на сайте", "pvAuto": "Авто", "pvOn": "Вкл.", "pvOff": "Выкл.", "pvMenuHide": "Скрыть панель на сайте", "pvMenuSettings": "Настройки", "pvMore": "Ещё", "pvFabDown": "Прокрутить вниз", "pvFabTop": "Наверх", "pvRead": "прочитано"});

Object.assign(translations.tr, {"pvDimNote": "Bu sayfada deneme: \"Açık\" ayarlar sayfasını karartır.", "back": "Geri", "headingSub": "Sağ alttaki panel gerçek paneldir: yaptığın her değişiklik onda anında görünür."});
Object.assign(translations.en, {"pvDimNote": "Try it here: \"On\" dims this settings page.", "back": "Back", "headingSub": "The panel at the bottom right is the real panel: every change shows up on it instantly."});
Object.assign(translations.ru, {"pvDimNote": "Попробуйте здесь: «Вкл.» затемняет эту страницу.", "back": "Назад", "headingSub": "Панель справа внизу — настоящая: любое изменение сразу видно на ней."});
Object.assign(translations.tr, {"pdNever": "Aydınlık (hiç karartma)", "pdAlways": "Karanlık (her zaman karart)", "pdAuto": "Sistem (akıllı)", "pageDarkLabel": "Sitelerin teması", "pageDarkHint": "Sistem: yalnız bilgisayar karanlık moddayken ve site açık renkliyse karartır; sitenin kendi karanlık modu varsa dokunmaz.", "pvMenuDim": "Tema", "pvLightT": "Aydınlık", "pvDarkT": "Karanlık", "pvSystemT": "Sistem", "pvDimNote": "Bu sayfada ayarlar sayfasının temasını değiştirir; sitelerde o sitenin temasını."});
Object.assign(translations.en, {"pdNever": "Light (never dim)", "pdAlways": "Dark (always dim)", "pdAuto": "System (smart)", "pageDarkLabel": "Theme of sites", "pageDarkHint": "System: dims only when your computer is in dark mode and the site is light; never touches sites with their own dark mode.", "pvMenuDim": "Theme", "pvLightT": "Light", "pvDarkT": "Dark", "pvSystemT": "System", "pvDimNote": "Here it changes this settings page's theme; on sites, that site's theme."});
Object.assign(translations.ru, {"pdNever": "Светлая (не затемнять)", "pdAlways": "Тёмная (всегда затемнять)", "pdAuto": "Системная (умная)", "pageDarkLabel": "Тема сайтов", "pageDarkHint": "Системная: затемняет только при тёмной теме компьютера и светлом сайте; сайты со своей тёмной темой не трогает.", "pvMenuDim": "Тема", "pvLightT": "Светлая", "pvDarkT": "Тёмная", "pvSystemT": "Системная", "pvDimNote": "Здесь меняет тему этой страницы настроек; на сайтах — тему сайта."});
Object.assign(translations.tr, {"detectConflicts": "Köşedeki öğelerden kaç", "detectConflictsHint": "Sitenin kendi \"yukarı çık\" düğmesi ya da sohbet balonu varsa panel onların üstüne kalkar", "edgeLabel": "En alt (tam düzende en üst de)"});
Object.assign(translations.en, {"detectConflicts": "Avoid corner elements", "detectConflictsHint": "If the site has its own back-to-top button or a chat bubble, the panel moves above it", "edgeLabel": "Bottom (also Top in full layout)"});
Object.assign(translations.ru, {"detectConflicts": "Избегать угловых элементов", "detectConflictsHint": "Если у сайта есть своя кнопка «наверх» или чат, панель поднимается над ними", "edgeLabel": "В конец (в полном виде и «в начало»)"});
Object.assign(translations.tr, {"methodSmart": "Akıllı boyama (renkli öğelere dokunmaz)", "methodInvert": "Ters çevirme (tüm sayfa)", "methodTheme": "Kendi temamızı uygula", "invertSettingsHint": "Yalnızca \"Ters çevirme\" yönteminde ve Aydınlık seçeneğinde koyu siteyi açarken geçerli"});
Object.assign(translations.en, {"methodSmart": "Smart painting (leaves colored elements alone)", "methodInvert": "Invert (whole page)", "methodTheme": "Apply our theme", "invertSettingsHint": "Only for the \"Invert\" method and when Light turns a dark site light"});
Object.assign(translations.ru, {"methodSmart": "Умная покраска (не трогает цветные элементы)", "methodInvert": "Инверсия (вся страница)", "methodTheme": "Наша тема", "invertSettingsHint": "Только для метода «Инверсия» и когда «Светлая» осветляет тёмный сайт"});
Object.assign(translations.tr, {"smartThreshold": "Açık kalan alanları yakala", "smartThresholdHint": "Akıllı boyamadan sonra ekranda bu açıklığın üstünde kalan yerlere koyu örtü uygulanır. Düşük değer daha fazla alanı yakalar."});
Object.assign(translations.en, {"smartThreshold": "Catch areas left light", "smartThresholdHint": "After smart painting, places on screen brighter than this get a dark overlay. Lower values catch more."});
Object.assign(translations.ru, {"smartThreshold": "Ловить оставшиеся светлые места", "smartThresholdHint": "После умной покраски места ярче этого порога получают тёмный слой. Меньшее значение ловит больше."});
Object.assign(translations.tr, {"smartBands": "Renkli büyük şeritleri koyulaştır", "smartBandsHint": "Üst menü çubuğu, turuncu/mavi bölüm bantları gibi sayfa genişliğindeki canlı renkli alanlar tonu korunarak koyulaşır; düğmeler ve rozetler etkilenmez.", "smartBandThreshold": "Renkli şerit eşiği", "smartBandThresholdHint": "Rengin açıklığı bu değerin üstündeyse şerit koyulaşır. Düşük değer daha koyu renkli şeritleri de yakalar."});
Object.assign(translations.en, {"smartBands": "Darken large colored bands", "smartBandsHint": "Page-wide vivid areas such as the top menu bar or orange/blue section bands get darker while keeping their hue; buttons and badges are left alone.", "smartBandThreshold": "Colored band threshold", "smartBandThresholdHint": "A band is darkened when its color is lighter than this. Lower values also catch deeper colors."});
Object.assign(translations.ru, {"smartBands": "Затемнять крупные цветные полосы", "smartBandsHint": "Яркие области во всю ширину страницы (верхняя панель меню, оранжевые/синие полосы разделов) затемняются с сохранением оттенка; кнопки и значки не трогаются.", "smartBandThreshold": "Порог для цветных полос", "smartBandThresholdHint": "Полоса затемняется, если её цвет светлее этого значения. Меньшее значение ловит и более тёмные цвета."});
Object.assign(translations.tr, {"smartTint": "Açık mavi ve sarı zeminleri de koyulaştır", "smartTintHint": "Bilgi kutuları, uyarı şeritleri gibi açık mavi/sarı alanlar aynı tonda koyulaşır; doygun düğme renklerine ve küçük öğelere dokunulmaz.", "smartTintThreshold": "Mavi/sarı için açıklık eşiği", "smartTintThresholdHint": "Bu açıklığın üstündeki mavi ve sarı zeminler koyulaşır. Düşük değer daha koyu tonları da yakalar.",
    "railTipTitle": "İpucu", "railStatusTitle": "Durum özeti", "railKeysTitle": "Kısayollar", "railUnsaved": "● Kaydedilmemiş değişiklik var",
    "tip_sec-panel": "Paneldeki düğmeleri buradan seç. Az düğme daha sade bir panel demektir; sağ tık menüsü her zaman açılır.",
    "tip_sec-look": "Renkler ve boyut sağ alttaki gerçek panelde anında görünür. Kaydetmeden önce panelin üzerine gelip dene.",
    "tip_sec-dark": "Çoğu kişi için \"Sistem\" + \"Akıllı boyama\" en iyisidir: yalnız bilgisayar karanlıkken ve site açık renkliyse karartır, renkli düğmelere dokunmaz.",
    "tip_sec-darkpro": "Zamanlama, yazı büyütme ve renk ayarları karartılmış sayfalara uygulanır. Bir site kötü görünüyorsa önce \"Karartılmayacak öğeler\"i dene.",
    "tip_sec-sites": "\"- site.com\" paneli o sitede gizler, \"+ site.com\" zorla gösterir. Duraklatılmış sitelerde eklenti hiç çalışmaz.",
    "tip_sec-dev": "Tema Stüdyosu'ndan kopyaladığın HTML ve CSS'i buraya yapıştır. Betikler ve tehlikeli öznitelikler kaydederken temizlenir.",
    "tip_sec-backup": "Ayarlarını başka bir bilgisayara taşımak için dışa aktar, orada içe aktar. Sıfırlama geri alınamaz.",
    "stTheme": "Sitelerin teması", "stMethod": "Yöntem", "stRun": "Çalıştığı yer", "stAll": "Tüm siteler", "stSelected": "Seçili siteler ({0})", "stPaused": "Duraklatılmış site", "stSiteDark": "Siteye özel tema", "stKeys": "Klavye kısayolları", "stOn": "Açık", "stOff": "Kapalı",
    "kPage": "Sayfa yukarı / aşağı", "kEdge": "En üst / en alt", "kAuto": "Otomatik kaydırma", "kMark": "Yer imi ekle", "kPanel": "Paneli göster / gizle", "kTheme": "Bu sitenin teması", "kPopup": "Eklenti balonu", "kClick": "tık"});
Object.assign(translations.en, {"smartTint": "Also darken light blue and yellow backgrounds", "smartTintHint": "Light blue/yellow areas such as info boxes and warning bars get a dark version of the same hue; saturated button colors and small elements are left alone.", "smartTintThreshold": "Lightness threshold for blue/yellow", "smartTintThresholdHint": "Blue and yellow backgrounds lighter than this are darkened. Lower values also catch deeper tones.",
    "railTipTitle": "Tip", "railStatusTitle": "Status", "railKeysTitle": "Shortcuts", "railUnsaved": "● You have unsaved changes",
    "tip_sec-panel": "Choose the panel buttons here. Fewer buttons make a cleaner panel; the right-click menu is always available.",
    "tip_sec-look": "Colors and size show up instantly on the real panel at the bottom right. Hover it to try before saving.",
    "tip_sec-dark": "For most people \"System\" + \"Smart painting\" works best: it dims only when your computer is dark and the site is light, and leaves colored buttons alone.",
    "tip_sec-darkpro": "Schedule, text size and color tweaks apply to dimmed pages. If a site looks wrong, try \"Elements to keep\" first.",
    "tip_sec-sites": "\"- site.com\" hides the panel on that site, \"+ site.com\" forces it. The extension does not run at all on paused sites.",
    "tip_sec-dev": "Paste the HTML and CSS copied from Theme Studio here. Scripts and unsafe attributes are removed when saving.",
    "tip_sec-backup": "Export to move your settings to another computer, then import there. Resetting cannot be undone.",
    "stTheme": "Theme of sites", "stMethod": "Method", "stRun": "Runs on", "stAll": "All sites", "stSelected": "Selected sites ({0})", "stPaused": "Paused sites", "stSiteDark": "Per-site theme", "stKeys": "Keyboard shortcuts", "stOn": "On", "stOff": "Off",
    "kPage": "Page up / down", "kEdge": "Top / bottom", "kAuto": "Auto-scroll", "kMark": "Add bookmark", "kPanel": "Show / hide panel", "kTheme": "This site's theme", "kPopup": "Extension popup", "kClick": "click"});
Object.assign(translations.ru, {"smartTint": "Затемнять и светло-синие и жёлтые фоны", "smartTintHint": "Светло-синие/жёлтые области (инфоблоки, предупреждения) становятся тёмными того же оттенка; насыщенные цвета кнопок и мелкие элементы не трогаются.", "smartTintThreshold": "Порог светлоты для синего/жёлтого", "smartTintThresholdHint": "Синие и жёлтые фоны светлее этого порога затемняются. Меньшее значение ловит и более тёмные тона.",
    "railTipTitle": "Совет", "railStatusTitle": "Сводка", "railKeysTitle": "Горячие клавиши", "railUnsaved": "● Есть несохранённые изменения",
    "tip_sec-panel": "Выберите кнопки панели. Меньше кнопок — проще панель; меню по правому клику доступно всегда.",
    "tip_sec-look": "Цвета и размер сразу видны на настоящей панели справа внизу. Наведите на неё, чтобы попробовать до сохранения.",
    "tip_sec-dark": "Обычно лучше всего «Системная» + «Умная покраска»: затемняет только при тёмной теме компьютера и светлом сайте и не трогает цветные кнопки.",
    "tip_sec-darkpro": "Расписание, размер текста и цвета применяются к затемнённым страницам. Если сайт выглядит плохо, сначала попробуйте «Не затемнять».",
    "tip_sec-sites": "«- site.com» скрывает панель на сайте, «+ site.com» показывает принудительно. На сайтах на паузе расширение не работает.",
    "tip_sec-dev": "Вставьте сюда HTML и CSS из Theme Studio. Скрипты и опасные атрибуты удаляются при сохранении.",
    "tip_sec-backup": "Экспортируйте настройки, чтобы перенести их на другой компьютер, и импортируйте там. Сброс нельзя отменить.",
    "stTheme": "Тема сайтов", "stMethod": "Метод", "stRun": "Где работает", "stAll": "Все сайты", "stSelected": "Выбранные сайты ({0})", "stPaused": "Сайты на паузе", "stSiteDark": "Тема для сайтов", "stKeys": "Горячие клавиши", "stOn": "Вкл.", "stOff": "Выкл.",
    "kPage": "Страница вверх / вниз", "kEdge": "В начало / в конец", "kAuto": "Автопрокрутка", "kMark": "Добавить закладку", "kPanel": "Показать / скрыть панель", "kTheme": "Тема этого сайта", "kPopup": "Окно расширения", "kClick": "клик"});
function updateThresholdOut() {
    const el = document.getElementById('smartThreshold'), out = document.getElementById('smartThresholdOut');
    if (el && out) out.textContent = '%' + el.value;
}
document.addEventListener('input', (e) => { if (e.target && e.target.id === 'smartThreshold') updateThresholdOut(); });
function updateTintOut() {
    const el = document.getElementById('smartTintThreshold'), out = document.getElementById('smartTintThresholdOut');
    if (el && out) out.textContent = '%' + el.value;
}
document.addEventListener('input', (e) => { if (e.target && e.target.id === 'smartTintThreshold') updateTintOut(); });
function updateBandOut() {
    const el = document.getElementById('smartBandThreshold'), out = document.getElementById('smartBandThresholdOut');
    if (el && out) out.textContent = '%' + el.value;
}
document.addEventListener('input', (e) => { if (e.target && e.target.id === 'smartBandThreshold') updateBandOut(); });
let activeLang = 'tr';
const CSS_DEFAULT = {
    tr: '/* Sitelere enjekte edilecek CSS kodu */\n',
    en: '/* CSS code to inject into sites */\n',
    ru: '/* CSS-код для внедрения на сайты */\n'
};
function notify(key, param) {
    let m = (translations[activeLang] && translations[activeLang][key]) || translations.tr[key] || '';
    if (param !== undefined) m = m.replace('{0}', param);
    showMessage(m);
}

function applyLanguage(lang) {
    activeLang = lang;
    const dict = translations[lang] || translations.tr;
    document.documentElement.lang = lang;
    document.documentElement.dir = 'ltr';
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (dict[key] !== undefined) el.textContent = dict[key];
    });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
        const key = el.getAttribute('data-i18n-html');
        if (dict[key] !== undefined) el.innerHTML = dict[key];
    });
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
        const key = el.getAttribute('data-i18n-ph');
        if (dict[key] !== undefined) el.placeholder = dict[key];
    });
    document.querySelectorAll('[data-i18n-balloon]').forEach((el) => {
        const key = el.getAttribute('data-i18n-balloon');
        if (dict[key] !== undefined) el.setAttribute('data-balloon', dict[key]);
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
        const key = el.getAttribute('data-i18n-title');
        if (dict[key] !== undefined) { el.setAttribute('data-ttip', dict[key]); el.setAttribute('aria-label', dict[key]); }
    });
    if (window.NVP && window.NVP.tip) {
        // options world: tema CSS değişkenlerini okuyarak tooltip paletini ayarla.
        const cs = getComputedStyle(document.body);
        window.NVP.tip.init(document, {
            theme: {
                bg: cs.getPropertyValue('--balloon-bg').trim() || '#29292e',
                fg: cs.getPropertyValue('--balloon-text').trim() || '#fff',
                border: cs.getPropertyValue('--tip-border').trim() || 'rgba(255,255,255,.12)'
            }
        });
    } else {
        initTooltips(document);
    }
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
        const key = el.getAttribute('data-i18n-aria');
        if (dict[key] !== undefined) el.setAttribute('aria-label', dict[key]);
    });
    const cssEl = document.getElementById('cssArea');
    if (cssEl) {
        const cssValue = cssEl.value.trim();
        const matched = Object.keys(CSS_DEFAULT).some((k) => CSS_DEFAULT[k].trim() === cssValue);
        if (matched) { cssEl.value = CSS_DEFAULT[lang] || CSS_DEFAULT.tr; }
    }
    updateKeyboardHint();
}

// Fixed tooltip balloon (positioned within viewport, not clipped when left panel overflows)
function sanitizeBalloonHtml(html) {
    if (!html) return '';
    return html
        .replace(/<\s*(script|style|iframe|object|embed|form)[\s\S]*?<\/(script|style|iframe|object|embed|form)>/gi, '')
        .replace(/<\s*(script|style|iframe|object|embed|form)[\s\S]*?>/gi, '')
        .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/javascript\s*:/gi, '')
        .replace(/vbscript\s*:/gi, '')
        .replace(/data\s*:[^image]/gi, '');
}
function initBalloon() {
    const balloon = document.getElementById('infoBalloon');
    if (!balloon) return;
    const showBalloon = (e) => {
        const el = e.currentTarget;
        balloon.innerHTML = sanitizeBalloonHtml(el.getAttribute('data-balloon') || '');
        balloon.style.display = 'block';
        const bw = balloon.offsetWidth, bh = balloon.offsetHeight;
        const vw = window.innerWidth, vh = window.innerHeight;
        const m = 8, gap = 6;
        const mx = e.clientX, my = e.clientY;

        const mouseOnTop = my < vh / 2;
        const mouseOnLeft = mx < vw / 2;
        let top = mouseOnTop ? my + gap : my - bh - gap;
        let leftPos = mouseOnLeft ? mx + gap : mx - bw - gap;

        leftPos = Math.max(m, Math.min(leftPos, vw - bw - m));
        top = Math.max(m, Math.min(top, vh - bh - m));

        const btnR = el.getBoundingClientRect();
        if (mouseOnTop && top < btnR.bottom + gap) top = btnR.bottom + gap;
        if (!mouseOnTop && top + bh > btnR.top - gap) top = btnR.top - gap - bh;
        balloon.style.left = leftPos + 'px';
        balloon.style.top = top + 'px';
    };
    const hideBalloon = () => { balloon.style.display = 'none'; };
    document.querySelectorAll('.info').forEach((el) => {
        el.addEventListener('mouseenter', showBalloon);
        el.addEventListener('mousemove', showBalloon);
        el.addEventListener('mouseleave', hideBalloon);
        el.addEventListener('focus', showBalloon);
        el.addEventListener('blur', hideBalloon);
    });
}

// Yüzde kaydırıcısını 0-1 aralığına çevirir; geçerli bir 0 değerini korur (|| yerine NaN kontrolü).
function pct(id, dflt) {
    const n = parseFloat(document.getElementById(id).value);
    return Number.isNaN(n) ? dflt : n / 100;
}
// Son yüklenen ayarlar (formda alanı olmayan alt anahtarları — ör. invertAreas.text — korumak için)
let _lastLoaded = null;
// Son yükleme/kaydetmedeki form durumu: Kaydet yalnız değişen anahtarları yazar,
// böylece popup/mini menünün yaptığı değişiklikler bayat formla ezilmez.
let _snapshot = null;
let _dirtyVal = false;
function markDirty(v) { _dirtyVal = v; const b = document.getElementById('save'); if (b) b.classList.toggle('dirty', !!v); }
let _dirty = false;

function collectFormData() {
    const hex = document.getElementById('bgColorHex').value;
    const panelMode = document.body.classList.contains('panel-light') ? 'light' : 'dark';
    return {
        hoverColor: document.getElementById('hoverColor').value,
        bgColorHex: hex,
        bgColor: hexToRgba(hex),
        buttonColor: document.getElementById('buttonColor').value,
        arrowColor: document.getElementById('arrowColor').value,
        offsetRight: safeInt(document.getElementById('offsetRight').value, defaults.offsetRight),
        offsetBottom: safeInt(document.getElementById('offsetBottom').value, defaults.offsetBottom),
        optionsTheme: currentAdminTheme,
        balloonMode: currentBalloonTheme,
        buttonRadius: safeInt(document.getElementById('buttonRadius').value, defaults.buttonRadius),
        buttonSize: safeInt(document.getElementById('buttonSize').value, defaults.buttonSize),
        showThemeButton: document.getElementById('showThemeButton').checked,
        showPageButton: document.getElementById('showPageButton').checked,
        showEdgeButton: document.getElementById('showEdgeButton').checked,
        keyboardShortcuts: document.getElementById('keyboardShortcuts').checked,
        position: document.getElementById('position').value,
        autoHide: document.getElementById('autoHide').checked,
        autoHideDelay: _ahDelayEl ? safeInt(_ahDelayEl.value, 300) : 300,
        rememberPosition: document.getElementById('rememberPosition').checked,
        gestures: document.getElementById('gestures').checked,
        detectConflicts: document.getElementById('detectConflicts').checked,
        readingProgress: document.getElementById('readingProgress').checked,
        pageDark: document.getElementById('pageDark').value,
        panelTheme: document.getElementById('panelTheme').value,
        panelStyle: document.getElementById('panelStyle').value,
        autoScrollSpeed: Math.min(400, Math.max(10, safeInt(document.getElementById('autoScrollSpeed').value, defaults.autoScrollSpeed))),
        smartThreshold: Math.min(95, Math.max(40, safeInt(document.getElementById('smartThreshold').value, defaults.smartThreshold))),
        smartTint: document.getElementById('smartTint').checked,
        smartTintThreshold: Math.min(90, Math.max(30, safeInt(document.getElementById('smartTintThreshold').value, defaults.smartTintThreshold))),
        smartBands: document.getElementById('smartBands').checked,
        smartBandThreshold: Math.min(80, Math.max(20, safeInt(document.getElementById('smartBandThreshold').value, defaults.smartBandThreshold))),
        darkModeMethod: document.getElementById('darkModeMethod').value,
        darkModeAreas: {
            body: document.getElementById('darkAreaBody').checked,
            text: document.getElementById('darkAreaText').checked,
            link: document.getElementById('darkAreaLink').checked,
            button: document.getElementById('darkAreaButton').checked,
            image: document.getElementById('darkAreaImage').checked,
            form: document.getElementById('darkAreaForm').checked,
            code: document.getElementById('darkAreaCode').checked,
            table: document.getElementById('darkAreaTable').checked,
            scrollbar: document.getElementById('darkAreaScrollbar').checked
        },
        excludeCss: sanitizeExcludeCss(document.getElementById('excludeCssArea').value),
        invertIntensity: pct('invertIntensity', defaults.invertIntensity),
        invertBrightness: pct('invertBrightness', defaults.invertBrightness),
        invertContrast: pct('invertContrast', defaults.invertContrast),
        invertGrayscale: pct('invertGrayscale', defaults.invertGrayscale),
        invertWarmth: pct('invertWarmth', defaults.invertWarmth),
        invertDim: document.getElementById('invertDim').checked,
        invertImageMode: document.getElementById('invertImageMode').value,
        colorPreserve: pct('colorPreserve', defaults.colorPreserve),
        invertAreas: {
            ...((_lastLoaded && _lastLoaded.invertAreas) || defaults.invertAreas),
            link: document.getElementById('invAreaLink').checked,
            button: document.getElementById('invAreaButton').checked,
            form: document.getElementById('invAreaForm').checked,
            code: document.getElementById('invAreaCode').checked,
            table: document.getElementById('invAreaTable').checked,
            image: document.getElementById('invAreaImage').checked
        },
        invertOverrideText: document.getElementById('invOverrideText').checked,
        invertTextColor: document.getElementById('invTextColor').value,
        invertOverrideLink: document.getElementById('invOverrideLink').checked,
        invertLinkColor: document.getElementById('invLinkColor').value,
        invertOverrideBg: document.getElementById('invOverrideBg').checked,
        invertBgColor: document.getElementById('invBgColor').value,
        overlayHeadingColor: document.getElementById('overlayHeadingColor').checked,
        overlayHeadingColorHex: document.getElementById('overlayHeadingColorHex').value,
        overlayBoldColor: document.getElementById('overlayBoldColor').checked,
        overlayBoldColorHex: document.getElementById('overlayBoldColorHex').value,
        overlaySvgColor: document.getElementById('overlaySvgColor').checked,
        overlaySvgColorHex: document.getElementById('overlaySvgColorHex').value,
        overlayGrayscale: document.getElementById('overlayGrayscale').checked,
        overlayLineHeight: document.getElementById('overlayLineHeight').value,
        overlayLetterSpacing: document.getElementById('overlayLetterSpacing').value,
        overlayTextShadow: document.getElementById('overlayTextShadow').value,
        overlayFontFamily: document.getElementById('overlayFontFamily').value,
        darkAutoDetect: document.getElementById('darkAutoDetect').checked,
        darkSchedule: {
            enabled: document.getElementById('darkSchedule').checked,
            startHour: safeInt(document.getElementById('darkScheduleStartH').value, 20),
            startMin: safeInt(document.getElementById('darkScheduleStartM').value, 0),
            endHour: safeInt(document.getElementById('darkScheduleEndH').value, 7),
            endMin: safeInt(document.getElementById('darkScheduleEndM').value, 0)
        },
        darkTransition: safeInt(document.getElementById('darkTransition').value, 300),
        darkFontSize: safeInt(document.getElementById('darkFontSize').value, 0),
        darkFontWeight: safeInt(document.getElementById('darkFontWeight').value, 0),
        darkFilters: {
            saturate: safeInt(document.getElementById('darkSaturate').value, 100),
            hueRotate: safeInt(document.getElementById('darkHueRotate').value, 0)
        },
        darkScrollOpt: document.getElementById('darkScrollOpt').checked,
        darkBgGradient: '',
        siteRules: parseRules(document.getElementById('rulesArea').value),
        customCss: sanitizeCss(document.getElementById('cssArea').value),
        customButtonTemplate: sanitizeTemplateSafe(document.getElementById('htmlArea').value.slice(0, 20000)),
        language: document.getElementById('language') ? document.getElementById('language').value : 'tr'
    };
}

function sanitizeTemplateSafe(html) {
    if (!html || !html.trim()) return '';
    return (window.NVP && window.NVP.sanitizeTemplate) ? window.NVP.sanitizeTemplate(html) : '';
}

function updateJsonField(data) {
    const previewData = {
        hoverColor: data.hoverColor,
        bgColor: data.bgColor,
        buttonColor: data.buttonColor,
        arrowColor: data.arrowColor,
        offsetRight: data.offsetRight,
        offsetBottom: data.offsetBottom,
        optionsTheme: data.optionsTheme,
        pageDark: data.pageDark,
        panelTheme: data.panelTheme,
        panelStyle: data.panelStyle,
        balloonMode: data.balloonMode,
        buttonRadius: data.buttonRadius,
        buttonSize: data.buttonSize,
        showThemeButton: data.showThemeButton,
        showPageButton: data.showPageButton,
        showEdgeButton: data.showEdgeButton,
        keyboardShortcuts: data.keyboardShortcuts,
        position: data.position,
        autoHide: data.autoHide,
        rememberPosition: data.rememberPosition,
        gestures: data.gestures,
        detectConflicts: data.detectConflicts,
        readingProgress: data.readingProgress,
        autoScrollSpeed: data.autoScrollSpeed,
        smartThreshold: data.smartThreshold,
        smartTint: data.smartTint,
        smartTintThreshold: data.smartTintThreshold,
        smartBands: data.smartBands,
        smartBandThreshold: data.smartBandThreshold,
        darkModeMethod: data.darkModeMethod,
        darkModeAreas: data.darkModeAreas,
        excludeCss: data.excludeCss,
        invertIntensity: data.invertIntensity,
        invertBrightness: data.invertBrightness,
        invertContrast: data.invertContrast,
        invertGrayscale: data.invertGrayscale,
        invertWarmth: data.invertWarmth,
        invertDim: data.invertDim,
        invertImageMode: data.invertImageMode,
        colorPreserve: data.colorPreserve,
        invertAreas: data.invertAreas,
        invertOverrideText: data.invertOverrideText,
        invertTextColor: data.invertTextColor,
        invertOverrideLink: data.invertOverrideLink,
        invertLinkColor: data.invertLinkColor,
        invertOverrideBg: data.invertOverrideBg,
        invertBgColor: data.invertBgColor,
        siteRules: data.siteRules,
        language: data.language
    };
    document.getElementById('jsonArea').value = JSON.stringify(previewData, null, 4);
}

// ── Canlı panel: ayarlar sayfasının kendisi önizleme alanıdır ──────────────
// Gerçek paneldeki CSS ve ikonların aynısı (shared.js → NVP.panel) kullanılır.
// Panel bu sayfayı kaydırır, ilerleme halkası bu sayfanın okunma oranını gösterir.
const PV = { root: null, dim: 'auto', open: false, menu: false, autoRaf: 0, closeT: null };

function pvSettings() {
    const v = (id) => document.getElementById(id);
    return {
        hoverColor: v('hoverColor').value, bgColorHex: v('bgColorHex').value, buttonColor: v('buttonColor').value, arrowColor: v('arrowColor').value,
        buttonSize: safeInt(v('buttonSize').value, defaults.buttonSize), buttonRadius: safeInt(v('buttonRadius').value, defaults.buttonRadius),
        offsetRight: safeInt(v('offsetRight').value, defaults.offsetRight), offsetBottom: safeInt(v('offsetBottom').value, defaults.offsetBottom),
        position: v('position').value, panelStyle: v('panelStyle').value, panelTheme: v('panelTheme').value,
        readingProgress: v('readingProgress').checked, showThemeButton: v('showThemeButton').checked,
        showPageButton: v('showPageButton').checked, showEdgeButton: v('showEdgeButton').checked,
        autoHide: v('autoHide').checked, autoHideDelay: safeInt(v('autoHideDelay').value, 600),
        autoScrollSpeed: safeInt(v('autoScrollSpeed').value, 40),
        customCss: v('cssArea').value, customButtonTemplate: v('htmlArea').value
    };
}
const pvDict = () => translations[activeLang] || translations.tr;
function pvInfo() {
    const d = document.scrollingElement || document.documentElement;
    const bar = document.querySelector('.top');
    const obstruct = bar ? bar.getBoundingClientRect().bottom : 0;
    return { top: window.scrollY, max: Math.max(0, d.scrollHeight - window.innerHeight), view: window.innerHeight, obstruct };
}
let pvPending = null;
function pvScroll(type) {
    const i = pvInfo();
    let y;
    if (type === 'top') y = 0;
    else if (type === 'bottom') y = i.max;
    else {
        const dir = type === 'page-up' ? -1 : 1;
        const now = performance.now();
        const base = pvPending && now - pvPending.t < 650 && pvPending.dir === dir ? pvPending.y : i.top;
        y = base + dir * Math.max(40, (i.view - i.obstruct) * 0.88);
        pvPending = { y: Math.max(0, Math.min(i.max, y)), t: now, dir };
    }
    window.scrollTo({ top: Math.max(0, Math.min(i.max, y)), behavior: 'smooth' });
}
function pvFabDown(i) { return i.top < i.view * 0.35 && i.max > i.view * 0.5; }
function pvProgress() {
    if (!PV.root) return;
    const fab = PV.root.getElementById('btn-fab'), nvp = PV.root.getElementById('nvp');
    if (!fab || !nvp) return;
    const i = pvInfo();
    const p = i.max > 0 ? Math.round(i.top / i.max * 100) : 100;
    const down = pvFabDown(i);
    fab.style.setProperty('--p', String(p));
    fab.classList.toggle('down', down);
    nvp.classList.toggle('attop', i.top < i.view * 0.35);
    const d = pvDict();
    const label = (down ? d.pvFabDown : d.pvFabTop) + (pvSettings().readingProgress ? ' · %' + p + ' ' + d.pvRead : '');
    fab.setAttribute('data-ttip', label);
    fab.setAttribute('aria-label', label);
    if (window.NVP && NVP.tip) NVP.tip.update(fab);
}
let pvLastTop = 0;
window.addEventListener('scroll', () => {
    pvProgress();
    const top = document.querySelector('.top');
    if (top) top.classList.toggle('stuck', window.scrollY > 4);
    const nvp = PV.root && PV.root.getElementById('nvp');
    if (nvp && document.getElementById('autoHide').checked && !nvp.classList.contains('open')) {
        const dlt = window.scrollY - pvLastTop;
        if (dlt > 4) nvp.classList.add('rest'); else if (dlt < -4) nvp.classList.remove('rest');
    }
    pvLastTop = window.scrollY;
}, { passive: true });

// Panelin tema düğmesi bu sayfada, sol alttaki düğmeyle aynı işi yapar (ayarlar sayfasının teması)
const pvThemeKey = () => (currentAdminTheme === 'light' || currentAdminTheme === 'dark' ? currentAdminTheme : 'system');
const pvThemeName = (k) => { const d = pvDict(); return k === 'light' ? d.pvLightT : k === 'dark' ? d.pvDarkT : d.pvSystemT; };
function pvToast(text) {
    const st = document.getElementById('status');
    if (!st) return;
    st.textContent = text;
    clearTimeout(pvToast.t);
    pvToast.t = setTimeout(() => { if (st.textContent === text) st.textContent = ''; }, 2600);
}

// Otomatik kaydırma (bu sayfada gerçekten çalışır)
function pvStopAuto() { if (PV.autoRaf) { cancelAnimationFrame(PV.autoRaf); PV.autoRaf = 0; document.removeEventListener('mousedown', pvStopAuto, true); } }
function pvStartAuto() {
    pvStopAuto();
    let last = 0, acc = 0;
    const step = (ts) => {
        const dt = last ? Math.min(100, ts - last) : 16;
        last = ts;
        acc += pvSettings().autoScrollSpeed * dt / 1000;
        if (acc >= 1) {
            const n = Math.floor(acc); acc -= n;
            const i = pvInfo();
            if (i.top >= i.max - 1) { pvStopAuto(); return; }
            window.scrollTo({ top: i.top + n, behavior: 'instant' });
        }
        PV.autoRaf = requestAnimationFrame(step);
    };
    PV.autoRaf = requestAnimationFrame(step);
    setTimeout(() => document.addEventListener('mousedown', pvStopAuto, true), 0);
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { pvStopAuto(); pvCloseMenu(); } });

function pvCloseMenu() {
    PV.menu = false;
    const m = PV.root && PV.root.getElementById('menu');
    if (m) m.remove();
}
function pvRenderMenu(view) {
    const d = pvDict();
    const I = NVP.panel.ICON;
    const esc = NVP.escapeHtml;
    const nvp = PV.root.getElementById('nvp');
    let m = PV.root.getElementById('menu');
    if (!m) { m = document.createElement('div'); m.id = 'menu'; m.setAttribute('role', 'menu'); PV.root.appendChild(m); }
    m.className = nvp.classList.contains('theme-light') ? 'theme-light' : 'theme-dark';
    const item = (ic, t, act, extra) => '<button type="button" class="mi" role="menuitem" data-act="' + act + '"' + (extra || '') + '>' + ic + '<span>' + esc(t) + '</span></button>';
    if (view === 'headings') {
        const cards = Array.from(document.querySelectorAll('.card'));
        m.innerHTML = item(I.back, d.back || '←', 'back') + '<div class="list">' + cards.map((c, idx) => {
            const h = c.querySelector('h3 > span:not(.ico)');
            return item('', h ? h.textContent : '#' + idx, 'goto', ' data-i="' + idx + '"');
        }).join('') + '</div>';
    } else {
        m.innerHTML = item(I.list, d.pvMenuHeadings, 'headings') + item(I.play, d.pvMenuAuto, 'auto') +
            '<div class="sepl"></div><div class="mh">' + esc(d.pvMenuDim) + '</div><div class="seg">' +
            ['light', 'dark', 'system'].map((k) => '<button type="button" data-theme-set="' + k + '" class="' + (pvThemeKey() === k ? 'on' : '') + '">' + esc(pvThemeName(k)) + '</button>').join('') +
            '</div><div class="note">' + esc(d.pvDimNote || '') + '</div><div class="sepl"></div>' + item(I.top, d.btnTop || 'Top', 'top') + item(I.gear, d.pvMenuSettings, 'top');
    }
    const fr = PV.root.getElementById('btn-fab').getBoundingClientRect();
    let left = fr.left - m.offsetWidth - 12;
    if (left < 8) left = fr.right + 12;
    m.style.left = Math.max(8, Math.min(left, innerWidth - m.offsetWidth - 8)) + 'px';
    m.style.top = Math.max(8, Math.min(fr.bottom - m.offsetHeight, innerHeight - m.offsetHeight - 8)) + 'px';
    const first = m.querySelector('.mi, .seg button');
    if (first) first.focus({ preventScroll: true });
}
function pvOpenMenu() { PV.menu = true; pvRenderMenu('main'); }

function pvSetOpen(on) {
    const nvp = PV.root && PV.root.getElementById('nvp');
    if (!nvp) return;
    PV.open = on;
    nvp.classList.toggle('open', on);
    if (on) nvp.classList.remove('rest');
}

function updatePreview() {
    if (!window.NVP || !NVP.panel) return;
    const host = document.getElementById('navPreview');
    if (!host) return;
    if (!PV.root) {
        PV.root = host.attachShadow({ mode: 'open' });
        document.addEventListener('pointerdown', (e) => { if (PV.menu && e.target !== host) pvCloseMenu(); });
        PV.root.addEventListener('click', (e) => {
            const mb = e.target.closest('#menu button');
            if (mb) {
                if (mb.dataset.themeSet) {
                    const k = mb.dataset.themeSet;
                    PV.menu = true;
                    setAdminTheme(k === 'system' ? null : k);
                    return;
                }
                const act = mb.dataset.act;
                if (act === 'headings') { pvRenderMenu('headings'); return; }
                if (act === 'back') { pvRenderMenu('main'); return; }
                pvCloseMenu();
                if (act === 'goto') { const c = document.querySelectorAll('.card')[+mb.dataset.i]; if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
                else if (act === 'auto') pvStartAuto();
                else if (act === 'top') pvScroll('top');
                return;
            }
            const b = e.target.closest('button');
            if (!b) return;
            if (b.id === 'btn-fab') pvScroll(pvFabDown(pvInfo()) ? 'page-down' : 'top');
            else if (b.id === 'btn-top') pvScroll('top');
            else if (b.id === 'btn-bottom') pvScroll('bottom');
            else if (b.id === 'btn-page-up') pvScroll('page-up');
            else if (b.id === 'btn-page-down') pvScroll('page-down');
            else if (b.id === 'btn-theme-toggle') {
                cycleAdminTheme();
            } else if (b.id === 'btn-menu') { if (PV.menu) pvCloseMenu(); else pvOpenMenu(); }
        });
        PV.root.addEventListener('contextmenu', (e) => { if (e.target.closest('#nvp')) { e.preventDefault(); pvOpenMenu(); } });
        PV.root.addEventListener('keydown', (e) => {
            const m = PV.root.getElementById('menu');
            if (!m || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
            e.preventDefault();
            const items = Array.from(m.querySelectorAll('.mi, .seg button'));
            const i = items.indexOf(PV.root.activeElement);
            items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
        });
    }
    const S = pvSettings();
    const d = pvDict();
    const I = NVP.panel.ICON;
    const adminDark = !document.body.classList.contains('panel-light');
    const visualDark = adminDark;
    const theme = S.panelTheme === 'dark' || S.panelTheme === 'light' ? S.panelTheme : (visualDark ? 'dark' : 'light');

    const esc = NVP.escapeHtml;
    const btn = (id, icon, label, extra) => '<button type="button" class="nav-button' + (extra || '') + '" id="' + id + '" data-ttip="' + esc(label) + '" aria-label="' + esc(label) + '">' + icon + '</button>';
    let stack = btn('btn-menu', I.more, d.pvMore);
    const tk = pvThemeKey();
    if (S.showThemeButton) stack += btn('btn-theme-toggle', tk === 'dark' ? I.moon : tk === 'light' ? I.sun : I.system, d.pvMenuDim + ': ' + pvThemeName(tk), ' nav-theme' + (tk !== 'system' ? ' is-on' : ''));
    if (S.showEdgeButton && S.panelStyle === 'full') stack += btn('btn-top', I.top, d.btnTop || 'Top');
    if (S.showPageButton) stack += btn('btn-page-up', I.up, d.btnUp || 'Up') + btn('btn-page-down', I.down, d.btnDown || 'Down');
    if (S.showEdgeButton) stack += btn('btn-bottom', I.bottom, d.btnBottom || 'Bottom');

    const cls = ['theme-' + theme, S.panelStyle === 'full' ? 'full' : 'compact', String(S.position).endsWith('top') ? 'pos-top' : 'pos-bottom'];
    if (PV.open) cls.push('open');
    const css = NVP.panel.buildCss(S, defaults) + '\n' + (NVP.sanitizeCustomCss ? NVP.sanitizeCustomCss(S.customCss) : '');
    const wasMenu = PV.menu;
    PV.root.innerHTML = '<style>' + css + '</style><div id="nvp" class="' + cls.join(' ') + '" role="toolbar" aria-label="' + esc(d.previewTitle || 'Panel') + '"><div class="stack">' + stack + '</div>' +
        '<button type="button" class="fab' + (S.readingProgress ? '' : ' noprog') + '" id="btn-fab"><svg class="ring" viewBox="0 0 40 40" aria-hidden="true"><circle class="trk" cx="20" cy="20" r="18.5"/><circle class="bar" cx="20" cy="20" r="18.5" pathLength="100"/></svg><span class="ic">' + I.arrowUp + '</span></button></div>';
    const tpl = NVP.sanitizeTemplate ? NVP.sanitizeTemplate(String(S.customButtonTemplate || '').trim()) : '';
    if (tpl && tpl.includes('<')) {
        const t = document.createElement('template');
        t.innerHTML = tpl;
        const st = PV.root.querySelector('.stack');
        const hasNav = t.content.querySelector('#btn-top, #btn-bottom, #btn-page-up, #btn-page-down');
        if (!hasNav && t.content.querySelector('#btn-theme-toggle')) { const def = st.querySelector('#btn-theme-toggle'); if (def) def.replaceWith(t.content); else st.append(t.content); }
        else { const mb = st.querySelector('#btn-menu'); st.replaceChildren(t.content); if (!st.querySelector('#btn-menu')) st.prepend(mb); }
    }
    const nvp = PV.root.getElementById('nvp');
    nvp.addEventListener('mouseenter', () => { clearTimeout(PV.closeT); pvSetOpen(true); });
    nvp.addEventListener('mouseleave', () => {
        clearTimeout(PV.closeT);
        PV.closeT = setTimeout(() => { if (!nvp.matches(':hover') && !PV.menu) pvSetOpen(false); }, S.autoHideDelay);
    });
    nvp.addEventListener('focusin', () => pvSetOpen(true));
    PV.menu = false;
    if (wasMenu) pvOpenMenu();
    pvProgress();
    try { NVP.tip.hide(true); NVP.tip.init(PV.root); } catch (_) { /* yok say */ }
}

// Kenar menüsü: görünen bölümü vurgula
(function sideNavSpy() {
    const links = Array.from(document.querySelectorAll('#sideNav a'));
    const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const obs = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
            if (!en.isIntersecting) return;
            links.forEach((a) => a.classList.toggle('on', a === map.get(en.target.id)));
        });
    }, { rootMargin: '-15% 0px -70% 0px' });
    map.forEach((_, id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    try { document.getElementById('verLabel').textContent = 'v' + chrome.runtime.getManifest().version; } catch (_) { /* önizleme dışında */ }
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => updatePreview());
})();

    function loadSettings() {
    storage.get(defaults, (data) => {
        // Kullanıcı seçimleri artık zorla sıfırlanmaz (v4.0). Yalnız eski content.js'in
        // 0-100 ölçeğine yazdığı colorPreserve değeri 0-1 ölçeğine geri çevrilir.
        if (typeof data.colorPreserve === 'number' && data.colorPreserve > 1) data.colorPreserve = data.colorPreserve / 100;
        _lastLoaded = data;

        document.getElementById('hoverColor').value = data.hoverColor;
        document.getElementById('bgColorHex').value = data.bgColorHex || rgbaToHex(data.bgColor) || '#1e1e24';
        document.getElementById('buttonColor').value = data.buttonColor;
        document.getElementById('arrowColor').value = data.arrowColor;
        document.getElementById('offsetRight').value = data.offsetRight;
        document.getElementById('offsetBottom').value = data.offsetBottom;
        document.getElementById('buttonRadius').value = data.buttonRadius;
        document.getElementById('buttonSize').value = data.buttonSize;
        document.getElementById('showThemeButton').checked = data.showThemeButton;
        document.getElementById('showPageButton').checked = data.showPageButton;
        document.getElementById('showEdgeButton').checked = data.showEdgeButton;
        document.getElementById('keyboardShortcuts').checked = data.keyboardShortcuts;
        document.getElementById('position').value = data.position;
        document.getElementById('autoHide').checked = data.autoHide;
        if (_ahDelayEl) _ahDelayEl.value = data.autoHideDelay ?? 300;
        if (_ahGroup) _ahGroup.style.display = data.autoHide ? 'flex' : 'none';
        document.getElementById('rememberPosition').checked = data.rememberPosition;
        document.getElementById('gestures').checked = data.gestures;
        document.getElementById('detectConflicts').checked = data.detectConflicts !== false;
        document.getElementById('readingProgress').checked = data.readingProgress !== false;
        document.getElementById('pageDark').value = ['auto', 'always', 'never'].includes(data.pageDark) ? data.pageDark : 'auto';
        document.getElementById('panelTheme').value = ['auto', 'dark', 'light'].includes(data.panelTheme) ? data.panelTheme : 'auto';
        document.getElementById('panelStyle').value = data.panelStyle === 'full' ? 'full' : 'compact';
        document.getElementById('autoScrollSpeed').value = data.autoScrollSpeed ?? defaults.autoScrollSpeed;
        document.getElementById('smartThreshold').value = data.smartThreshold ?? defaults.smartThreshold;
        updateThresholdOut();
        document.getElementById('smartTint').checked = data.smartTint !== false;
        document.getElementById('smartTintThreshold').value = data.smartTintThreshold ?? defaults.smartTintThreshold;
        updateTintOut();
        document.getElementById('smartBands').checked = data.smartBands !== false;
        document.getElementById('smartBandThreshold').value = data.smartBandThreshold ?? defaults.smartBandThreshold;
        updateBandOut();
        document.getElementById('darkModeMethod').value = data.darkModeMethod === 'tema' ? 'theme' : (data.darkModeMethod || 'invert');
        const darkAreas = data.darkModeAreas || {};
        document.getElementById('darkAreaBody').checked = darkAreas.body !== false;
        document.getElementById('darkAreaText').checked = darkAreas.text !== false;
        document.getElementById('darkAreaLink').checked = darkAreas.link !== false;
        document.getElementById('darkAreaButton').checked = darkAreas.button !== false;
        document.getElementById('darkAreaImage').checked = darkAreas.image !== false;
        document.getElementById('darkAreaForm').checked = darkAreas.form !== false;
        document.getElementById('darkAreaCode').checked = darkAreas.code !== false;
        document.getElementById('darkAreaTable').checked = darkAreas.table !== false;
        document.getElementById('darkAreaScrollbar').checked = darkAreas.scrollbar !== false;
        refreshDarkAreaControls();
        refreshInvertSettingsControls();
        document.getElementById('excludeCssArea').value = data.excludeCss;
        document.getElementById('invertIntensity').value = Math.round((data.invertIntensity != null ? data.invertIntensity : defaults.invertIntensity) * 100);
        document.getElementById('invertBrightness').value = Math.round((data.invertBrightness != null ? data.invertBrightness : defaults.invertBrightness) * 100);
        document.getElementById('invertContrast').value = Math.round((data.invertContrast != null ? data.invertContrast : defaults.invertContrast) * 100);
        document.getElementById('invertGrayscale').value = Math.round((data.invertGrayscale != null ? data.invertGrayscale : defaults.invertGrayscale) * 100);
        document.getElementById('invertWarmth').value = Math.round((data.invertWarmth != null ? data.invertWarmth : defaults.invertWarmth) * 100);
        document.getElementById('invertDim').checked = !!data.invertDim;
        document.getElementById('invertImageMode').value = data.invertImageMode || 'original';
        document.getElementById('colorPreserve').value = Math.round((data.colorPreserve != null ? data.colorPreserve : defaults.colorPreserve) * 100);
        const invAreas = data.invertAreas || {};
        document.getElementById('invAreaLink').checked = invAreas.link !== false;
        document.getElementById('invAreaButton').checked = invAreas.button !== false;
        document.getElementById('invAreaForm').checked = invAreas.form !== false;
        document.getElementById('invAreaCode').checked = invAreas.code !== false;
        document.getElementById('invAreaTable').checked = invAreas.table !== false;
        document.getElementById('invAreaImage').checked = invAreas.image !== false;
        document.getElementById('invOverrideText').checked = !!data.invertOverrideText;
        document.getElementById('invTextColor').value = data.invertTextColor || defaults.invertTextColor;
        document.getElementById('invTextColor').disabled = !data.invertOverrideText;
        document.getElementById('invOverrideLink').checked = !!data.invertOverrideLink;
        document.getElementById('invLinkColor').value = data.invertLinkColor || defaults.invertLinkColor;
        document.getElementById('invLinkColor').disabled = !data.invertOverrideLink;
        document.getElementById('invOverrideBg').checked = !!data.invertOverrideBg;
        document.getElementById('invBgColor').value = data.invertBgColor || defaults.invertBgColor;
        document.getElementById('invBgColor').disabled = !data.invertOverrideBg;
        document.getElementById('overlayHeadingColor').checked = !!data.overlayHeadingColor;
        document.getElementById('overlayHeadingColorHex').value = data.overlayHeadingColorHex || defaults.overlayHeadingColorHex;
        document.getElementById('overlayHeadingColorHex').disabled = !data.overlayHeadingColor;
        document.getElementById('overlayBoldColor').checked = !!data.overlayBoldColor;
        document.getElementById('overlayBoldColorHex').value = data.overlayBoldColorHex || defaults.overlayBoldColorHex;
        document.getElementById('overlayBoldColorHex').disabled = !data.overlayBoldColor;
        document.getElementById('overlaySvgColor').checked = !!data.overlaySvgColor;
        document.getElementById('overlaySvgColorHex').value = data.overlaySvgColorHex || defaults.overlaySvgColorHex;
        document.getElementById('overlaySvgColorHex').disabled = !data.overlaySvgColor;
        document.getElementById('overlayGrayscale').checked = !!data.overlayGrayscale;
        document.getElementById('overlayLineHeight').value = data.overlayLineHeight ?? '';
        document.getElementById('overlayLetterSpacing').value = data.overlayLetterSpacing ?? '';
        document.getElementById('overlayTextShadow').value = data.overlayTextShadow ?? '';
        document.getElementById('overlayFontFamily').value = data.overlayFontFamily ?? '';
        if (typeof syncInvOutputs === 'function') syncInvOutputs();
        document.getElementById('darkAutoDetect').checked = !!data.darkAutoDetect;
        document.getElementById('darkSchedule').checked = !!data.darkSchedule?.enabled;
        document.getElementById('darkScheduleTimes').style.display = data.darkSchedule?.enabled ? 'flex' : 'none';
        document.getElementById('darkScheduleStartH').value = data.darkSchedule?.startHour ?? 20;
        document.getElementById('darkScheduleStartM').value = data.darkSchedule?.startMin ?? 0;
        document.getElementById('darkScheduleEndH').value = data.darkSchedule?.endHour ?? 7;
        document.getElementById('darkScheduleEndM').value = data.darkSchedule?.endMin ?? 0;
        document.getElementById('darkTransition').value = data.darkTransition ?? 300;
        document.getElementById('darkFontSize').value = data.darkFontSize ?? 0;
        document.getElementById('darkFontWeight').value = data.darkFontWeight ?? 0;
        document.getElementById('darkSaturate').value = data.darkFilters?.saturate ?? 100;
        document.getElementById('darkHueRotate').value = data.darkFilters?.hueRotate ?? 0;
        document.getElementById('darkScrollOpt').checked = !!data.darkScrollOpt;
        document.getElementById('rulesArea').value = serializeRules(data.siteRules);
        document.getElementById('pausedSitesArea').value = (data.pausedSites || []).join('\n');
        document.getElementById('cssArea').value = data.customCss;
        document.getElementById('htmlArea').value = data.customButtonTemplate;
        applyPanelTheme(data.optionsTheme === 'light' ? 'light' : (data.optionsTheme === 'dark' ? 'dark' : null));
        applyBalloonTheme(data.balloonMode === 'light' ? 'light' : (data.balloonMode === 'dark' ? 'dark' : null));
        const langEl = document.getElementById('language');
        if (langEl) { langEl.value = data.language || UI_LANG; applyLanguage(langEl.value); }
        updateJsonField(data);
        updatePreview();
        _snapshot = collectFormData();
        _dirty = false; markDirty(false);
    });
}

function save() {
    const data = collectFormData();
    // Yalnız formda değişen anahtarlar yazılır; darkSiteRules, siteThemes, darkExcludeSites
    // gibi formda olmayan ya da başka yerde değişen ayarlar korunur.
    const changed = {};
    Object.keys(data).forEach((k) => {
        if (!_snapshot || JSON.stringify(data[k]) !== JSON.stringify(_snapshot[k])) changed[k] = data[k];
    });
    const htmlEl = document.getElementById('htmlArea');
    if (htmlEl && htmlEl.value.trim() && htmlEl.value !== data.customButtonTemplate) htmlEl.value = data.customButtonTemplate;
    const done = () => {
        _snapshot = data;
        _dirty = false; markDirty(false);
        updateJsonField(data);
        updatePreview();
        notify('saved');
    };
    if (!Object.keys(changed).length) { done(); return; }
    storage.set(changed, done);
}

// Formdaki her kullanıcı değişikliği "kaydedilmemiş" sayılır.
['input', 'change'].forEach((ev) => document.addEventListener(ev, (e) => {
    if (e.target && e.target.id !== 'language' && e.target.id !== 'importFile') { _dirty = true; markDirty(true); }
}, true));

// Başka bir yerden (popup, mini menü, başka sekme) gelen değişiklikler: form temizse
// yeniden yüklenir; kaydedilmemiş düzenleme varsa kullanıcı uyarılır.
if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    let _extReloadTimer = null;
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync' || Date.now() < _selfWriteUntil) return;
        clearTimeout(_extReloadTimer);
        _extReloadTimer = setTimeout(() => {
            if (_dirty) notify('externalChange');
            else loadSettings();
        }, 250);
    });
}

    const _themeIconEl = document.querySelector('.theme-icon');
    if (_themeIconEl) _themeIconEl.addEventListener('click', cycleAdminTheme);
    const _balloonThemeEl = document.getElementById('balloonThemeIcon');
    if (_balloonThemeEl) _balloonThemeEl.addEventListener('click', cycleBalloonTheme);

// JSON area: validate on input (debounced), apply on change (blur)
let _jsonValidationTimer = null;
document.getElementById('jsonArea').addEventListener('input', function () {
    const ta = this;
    clearTimeout(_jsonValidationTimer);
    _jsonValidationTimer = setTimeout(() => {
        try {
            JSON.parse(ta.value);
            ta.style.borderColor = '#04d361';
        } catch (e) {
            ta.style.borderColor = '#ff6b6b';
        }
    }, 400);
});
document.getElementById('jsonArea').addEventListener('change', function () {
    this.style.borderColor = '';
    try {
        const d = JSON.parse(this.value);
        if (d.hoverColor !== undefined) document.getElementById('hoverColor').value = d.hoverColor;
        if (d.bgColorHex !== undefined) document.getElementById('bgColorHex').value = d.bgColorHex;
        if (d.buttonColor !== undefined) document.getElementById('buttonColor').value = d.buttonColor;
        if (d.arrowColor !== undefined) document.getElementById('arrowColor').value = d.arrowColor;
        if (d.offsetRight !== undefined) document.getElementById('offsetRight').value = d.offsetRight;
        if (d.offsetBottom !== undefined) document.getElementById('offsetBottom').value = d.offsetBottom;
        if (d.buttonRadius !== undefined) document.getElementById('buttonRadius').value = d.buttonRadius;
        if (d.buttonSize !== undefined) document.getElementById('buttonSize').value = d.buttonSize;
        if ('optionsTheme' in d) applyPanelTheme(d.optionsTheme === 'light' ? 'light' : d.optionsTheme === 'dark' ? 'dark' : null);
        ['pageDark', 'panelTheme', 'panelStyle'].forEach((k) => { if (d[k] !== undefined && document.getElementById(k)) document.getElementById(k).value = d[k]; });
        if ('balloonMode' in d) applyBalloonTheme(d.balloonMode === 'light' ? 'light' : d.balloonMode === 'dark' ? 'dark' : null);
        if (d.showThemeButton !== undefined) document.getElementById('showThemeButton').checked = d.showThemeButton;
        if (d.showPageButton !== undefined) document.getElementById('showPageButton').checked = d.showPageButton;
        if (d.showEdgeButton !== undefined) document.getElementById('showEdgeButton').checked = d.showEdgeButton;
        if (d.keyboardShortcuts !== undefined) document.getElementById('keyboardShortcuts').checked = d.keyboardShortcuts;
        if (d.position !== undefined) document.getElementById('position').value = d.position;
        if (d.autoHide !== undefined) document.getElementById('autoHide').checked = d.autoHide;
        if (d.rememberPosition !== undefined) document.getElementById('rememberPosition').checked = d.rememberPosition;
        if (d.gestures !== undefined) document.getElementById('gestures').checked = d.gestures;
        if (d.detectConflicts !== undefined) document.getElementById('detectConflicts').checked = d.detectConflicts;
        if (d.readingProgress !== undefined) document.getElementById('readingProgress').checked = d.readingProgress;
        if (d.autoScrollSpeed !== undefined) document.getElementById('autoScrollSpeed').value = d.autoScrollSpeed;
        if (d.smartThreshold !== undefined) { document.getElementById('smartThreshold').value = d.smartThreshold; updateThresholdOut(); }
        if (d.smartTint !== undefined) document.getElementById('smartTint').checked = d.smartTint;
        if (d.smartTintThreshold !== undefined) { document.getElementById('smartTintThreshold').value = d.smartTintThreshold; updateTintOut(); }
        if (d.smartBands !== undefined) document.getElementById('smartBands').checked = d.smartBands;
        if (d.smartBandThreshold !== undefined) { document.getElementById('smartBandThreshold').value = d.smartBandThreshold; updateBandOut(); }
        if (d.darkModeMethod !== undefined) document.getElementById('darkModeMethod').value = d.darkModeMethod === 'tema' ? 'theme' : d.darkModeMethod;
        if (d.darkModeAreas) {
            const darkAreas = d.darkModeAreas;
            if (darkAreas.body !== undefined) document.getElementById('darkAreaBody').checked = darkAreas.body;
            if (darkAreas.text !== undefined) document.getElementById('darkAreaText').checked = darkAreas.text;
            if (darkAreas.link !== undefined) document.getElementById('darkAreaLink').checked = darkAreas.link;
            if (darkAreas.button !== undefined) document.getElementById('darkAreaButton').checked = darkAreas.button;
            if (darkAreas.image !== undefined) document.getElementById('darkAreaImage').checked = darkAreas.image;
            if (darkAreas.form !== undefined) document.getElementById('darkAreaForm').checked = darkAreas.form;
            if (darkAreas.code !== undefined) document.getElementById('darkAreaCode').checked = darkAreas.code;
            if (darkAreas.table !== undefined) document.getElementById('darkAreaTable').checked = darkAreas.table;
            if (darkAreas.scrollbar !== undefined) document.getElementById('darkAreaScrollbar').checked = darkAreas.scrollbar;
        }
        refreshDarkAreaControls();
        refreshInvertSettingsControls();
        if (d.language !== undefined) { const langEl = document.getElementById('language'); if (langEl) { langEl.value = d.language; applyLanguage(d.language); } }
        if (d.excludeCss !== undefined) document.getElementById('excludeCssArea').value = d.excludeCss;
        if (d.invertIntensity != null) document.getElementById('invertIntensity').value = Math.round(d.invertIntensity * 100);
        if (d.invertBrightness != null) document.getElementById('invertBrightness').value = Math.round(d.invertBrightness * 100);
        if (d.invertContrast != null) document.getElementById('invertContrast').value = Math.round(d.invertContrast * 100);
        if (d.invertGrayscale != null) document.getElementById('invertGrayscale').value = Math.round(d.invertGrayscale * 100);
        if (d.invertWarmth != null) document.getElementById('invertWarmth').value = Math.round(d.invertWarmth * 100);
        if (d.invertDim !== undefined) document.getElementById('invertDim').checked = d.invertDim;
        if (d.invertImageMode !== undefined) document.getElementById('invertImageMode').value = d.invertImageMode;
        if (d.colorPreserve != null) document.getElementById('colorPreserve').value = Math.round(d.colorPreserve * 100);
        if (d.invertAreas !== undefined) {
            const ia = d.invertAreas;
            if (ia.link !== undefined) document.getElementById('invAreaLink').checked = ia.link;
            if (ia.button !== undefined) document.getElementById('invAreaButton').checked = ia.button;
            if (ia.form !== undefined) document.getElementById('invAreaForm').checked = ia.form;
            if (ia.code !== undefined) document.getElementById('invAreaCode').checked = ia.code;
            if (ia.table !== undefined) document.getElementById('invAreaTable').checked = ia.table;
            if (ia.image !== undefined) document.getElementById('invAreaImage').checked = ia.image;
        }
        if (d.invertOverrideText !== undefined) { document.getElementById('invOverrideText').checked = d.invertOverrideText; document.getElementById('invTextColor').disabled = !d.invertOverrideText; }
        if (d.invertTextColor) document.getElementById('invTextColor').value = d.invertTextColor;
        if (d.invertOverrideLink !== undefined) { document.getElementById('invOverrideLink').checked = d.invertOverrideLink; document.getElementById('invLinkColor').disabled = !d.invertOverrideLink; }
        if (d.invertLinkColor) document.getElementById('invLinkColor').value = d.invertLinkColor;
        if (d.invertOverrideBg !== undefined) { document.getElementById('invOverrideBg').checked = d.invertOverrideBg; document.getElementById('invBgColor').disabled = !d.invertOverrideBg; }
        if (d.invertBgColor) document.getElementById('invBgColor').value = d.invertBgColor;
        if (d.siteRules !== undefined) document.getElementById('rulesArea').value = serializeRules(d.siteRules);
        updatePreview();
        updateJsonField(collectFormData());
    } catch (e) {
        alert('Invalid JSON structure!');
    }
});

// Debounced preview updater — avoids re-rendering on every keystroke
let previewDebounceId = null;
function debouncedPreview() {
    clearTimeout(previewDebounceId);
    previewDebounceId = setTimeout(updatePreview, 150);
}

['hoverColor', 'bgColorHex', 'buttonColor', 'arrowColor', 'offsetRight', 'offsetBottom', 'buttonRadius', 'buttonSize', 'position'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', debouncedPreview);
});
['showThemeButton', 'showPageButton', 'showEdgeButton', 'keyboardShortcuts', 'autoHide', 'rememberPosition', 'gestures', 'darkModeMethod'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', debouncedPreview);
});
// İnvert ayarları: canlı değer göstergeleri + kayıt dinleyicileri
function syncInvOutputs() {
    ['invIntensityOut', 'invBrightnessOut', 'invContrastOut', 'invGrayscaleOut', 'invWarmthOut', 'invColorPreserveOut'].forEach((outId) => {
        const out = document.getElementById(outId);
        if (!out || !out.previousElementSibling) return;
        out.textContent = out.previousElementSibling.value + '%';
    });
}
['invertIntensity', 'invertBrightness', 'invertContrast', 'invertGrayscale', 'invertWarmth', 'colorPreserve'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => { syncInvOutputs(); debouncedPreview(); });
});
['invertDim', 'invertImageMode', 'invAreaLink', 'invAreaButton', 'invAreaForm', 'invAreaCode', 'invAreaTable', 'invAreaImage'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', debouncedPreview);
});
// Invert color override toggles
[['invOverrideText', 'invTextColor'], ['invOverrideLink', 'invLinkColor'], ['invOverrideBg', 'invBgColor']].forEach(([cbId, colorId]) => {
    const cb = document.getElementById(cbId);
    const color = document.getElementById(colorId);
    if (cb && color) {
        cb.addEventListener('change', () => { color.disabled = !cb.checked; debouncedPreview(); });
        color.addEventListener('input', debouncedPreview);
    }
});
    [['overlayHeadingColor', 'overlayHeadingColorHex'], ['overlayBoldColor', 'overlayBoldColorHex'], ['overlaySvgColor', 'overlaySvgColorHex']].forEach(([cbId, colorId]) => {
    const cb = document.getElementById(cbId);
    const color = document.getElementById(colorId);
    if (cb && color) {
        cb.addEventListener('change', () => { color.disabled = !cb.checked; debouncedPreview(); });
        color.addEventListener('input', debouncedPreview);
    }
});
['overlayLineHeight', 'overlayLetterSpacing', 'overlayTextShadow', 'overlayFontFamily'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', debouncedPreview);
});
// Hariç tutma (exclude) için hızlı ekleme butonları
const EXCLUDE_PRESETS = {
    iframe: 'iframe',
    images: 'img, picture, video, canvas, svg, [role="img"]',
    bgimg: '[style*="background-image"], [style*="background:url"], [style*="background: url"]',
    map: '.gm-style'
};
document.querySelectorAll('.preset-btn, [data-exclude]').forEach((b) => {
    b.addEventListener('click', () => {
        const sel = EXCLUDE_PRESETS[b.getAttribute('data-exclude')];
        if (!sel) return;
        const ta = document.getElementById('excludeCssArea');
        const cur = ta.value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
        if (!cur.includes(sel)) {
            ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + sel;
            debouncedPreview();
        }
    });
});
// Karanlık-mod alanları (body/text/link/button/image): sadece "Temamızı Uygula" yöntemi
// aktifken kullanılabilir. Diğer yöntemde devre dışı (ve değerler korunur); tıklanınca
// yeniden aktif olur.
function refreshDarkAreaControls() {
    const methodEl = document.getElementById('darkModeMethod');
    const isTheme = methodEl?.value === 'theme';
    ['Body', 'Text', 'Link', 'Button', 'Image', 'Form', 'Code', 'Table', 'Scrollbar'].forEach((name) => {
        const cb = document.getElementById('darkArea' + name);
        if (!cb) return;
        cb.disabled = !isTheme;
        if (cb.parentNode) cb.parentNode.classList.toggle('disabled', !isTheme);
    });
    ['areaSelectAll', 'areaClearAll'].forEach((id) => {
        const b = document.getElementById(id);
        if (b) { b.disabled = !isTheme; b.classList.toggle('disabled', !isTheme); }
    });
    // Reset buttons for area checkboxes
    document.querySelectorAll('.area-check').forEach((cb) => {
        const group = cb.closest('.mini-switch');
        if (!group) return;
        const resetBtn = group.querySelector('.reset-btn');
        if (resetBtn) { resetBtn.disabled = !isTheme; resetBtn.classList.toggle('disabled', !isTheme); }
    });
    // Section-level reset button for darkModeAreas
    const darkAreasReset = document.querySelector('.reset-btn[data-setting="darkModeAreas"]');
    if (darkAreasReset) { darkAreasReset.disabled = !isTheme; darkAreasReset.classList.toggle('disabled', !isTheme); }
}

// Invert settings: disabled when "Temamızı Uygula" (theme) method is selected
function refreshInvertSettingsControls() {
    const methodEl = document.getElementById('darkModeMethod');
    const isInvert = methodEl?.value === 'invert';
    const invertIds = ['invertIntensity', 'invertBrightness', 'invertContrast', 'invertGrayscale', 'invertWarmth', 'invertDim', 'invertImageMode', 'colorPreserve', 'invOverrideText', 'invTextColor', 'invOverrideLink', 'invLinkColor', 'invOverrideBg', 'invBgColor', 'invAreaLink', 'invAreaButton', 'invAreaForm', 'invAreaCode', 'invAreaTable', 'invAreaImage', 'overlayHeadingColor', 'overlayHeadingColorHex', 'overlayBoldColor', 'overlayBoldColorHex', 'overlaySvgColor', 'overlaySvgColorHex', 'overlayGrayscale', 'overlayLineHeight', 'overlayLetterSpacing', 'overlayTextShadow', 'overlayFontFamily'];
    invertIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = !isInvert;
        if (el.parentNode) el.parentNode.classList.toggle('disabled', !isInvert);
    });
    const invertSliders = document.querySelectorAll('#invertIntensity, #invertBrightness, #invertContrast, #invertGrayscale, #invertWarmth, #colorPreserve');
    invertSliders.forEach((el) => { el.disabled = !isInvert; });
    // Reset buttons of disabled invert controls
    const invertResetSettings = ['invertIntensity', 'invertBrightness', 'invertContrast', 'invertGrayscale', 'invertWarmth', 'invertDim', 'invertImageMode', 'invertAreas', 'colorPreserve', 'invertColors'];
    invertResetSettings.forEach((setting) => {
        const btn = document.querySelector('.reset-btn[data-setting="' + setting + '"]');
        if (btn) { btn.disabled = !isInvert; btn.classList.toggle('disabled', !isInvert); }
    });
    // Reset buttons for invertArea checkboxes
    ['invAreaLink', 'invAreaButton', 'invAreaForm', 'invAreaCode', 'invAreaTable', 'invAreaImage'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const group = el.closest('.mini-switch');
        if (!group) return;
        const resetBtn = group.querySelector('.reset-btn');
        if (resetBtn) { resetBtn.disabled = !isInvert; resetBtn.classList.toggle('disabled', !isInvert); }
    });
}
const _dmEl = document.getElementById('darkModeMethod');
if (_dmEl) _dmEl.addEventListener('change', () => { refreshDarkAreaControls(); refreshInvertSettingsControls(); });
// Karanlık-mod alanları için toplu "Hepsini Aç / Kapat" butonları
['areaSelectAll', 'areaClearAll'].forEach((id) => {
    const b = document.getElementById(id);
    if (!b) return;
    b.addEventListener('click', () => {
        document.querySelectorAll('.area-check').forEach((c) => { c.checked = (id === 'areaSelectAll'); });
        refreshDarkAreaControls();
        debouncedPreview();
    });
});
// Auto-hide delay: show/hide group based on checkbox + auto-save
const _ahEl = document.getElementById('autoHide');
const _ahDelayEl = document.getElementById('autoHideDelay');
const _ahGroup = document.getElementById('autoHideDelayGroup');
if (_ahEl && _ahGroup) {
    _ahEl.addEventListener('change', (e) => {
        if (_ahGroup) _ahGroup.style.display = e.target.checked ? 'flex' : 'none';
        debouncedPreview();
    });
}
if (_ahDelayEl) {
    _ahDelayEl.addEventListener('input', debouncedPreview);
}
// Textareas: live preview on blur only — use the SAVE button to persist
['rulesArea', 'pausedSitesArea', 'excludeCssArea', 'cssArea', 'htmlArea', 'jsonArea'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('blur', debouncedPreview);
});

// Simple syntax highlighting: color-code key tokens in editor textareas
function highlightEditor(id) {
    const ta = document.getElementById(id);
    if (!ta) return;
    ta.style.background = 'var(--editor-bg)';
    ta.addEventListener('focus', () => ta.style.borderColor = 'var(--color-accent, #007bff)');
    ta.addEventListener('focusout', () => ta.style.borderColor = 'var(--border-input)');
}
['jsonArea', 'cssArea', 'htmlArea'].forEach((id) => highlightEditor(id));
document.querySelectorAll('.step-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        const step = parseInt(btn.dataset.step, 10);
        const min = target.min !== '' ? parseInt(target.min, 10) : -Infinity;
        const max = target.max !== '' ? parseInt(target.max, 10) : Infinity;
        let val = parseInt(target.value, 10);
        if (isNaN(val)) val = 0;
        val = Math.min(max, Math.max(min, val + step));
        target.value = val;
        target.dispatchEvent(new Event('input', { bubbles: true }));
    });
});

// Language change: save + re-translate UI
const _langEl = document.getElementById('language');
if (_langEl) _langEl.addEventListener('change', (e) => {
    storage.set({ language: e.target.value }, () => {
        applyLanguage(_langEl.value);
        updateJsonField(collectFormData());
        notify('languageChanged');
    });
});

    initBalloon();
    applyLanguage(_langEl?.value || UI_LANG);

    // Show preview immediately before storage responds
    updatePreview();
    updateKeyboardHint();

    document.getElementById('save').addEventListener('click', save);

    // Dark mode advanced settings
    document.getElementById('darkSchedule').addEventListener('change', (e) => {
        document.getElementById('darkScheduleTimes').style.display = e.target.checked ? 'flex' : 'none';
        debouncedPreview();
    });

    document.getElementById('reset').addEventListener('click', () => {
    const currentLang = (_langEl && _langEl.value) || 'tr';
    const resetValues = { ...defaults, language: currentLang };
    storage.set(resetValues, () => {
        loadSettings();
        document.getElementById('reset').blur();
        notify('resetDone');
    });
});

// Export settings
document.getElementById('exportBtn').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    try {
        storage.get(null, (all) => {
            try {
                const dataStr = JSON.stringify(all, null, 2);
                const blob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const ts = new Date().toISOString().replace(/[:.]/g, '-');
                a.download = `universal-navigation-settings-${ts}.json`;
                a.click();
                URL.revokeObjectURL(url);
                btn.blur();
                notify('exported');
            } catch (e) {
                console.error('Export failed:', e);
                btn.blur();
                notify('importError');
            }
        });
    } catch (e) {
        console.error('Export storage error:', e);
        btn.blur();
    }
});

// Import settings
document.getElementById('importBtn').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const fileInput = document.getElementById('importFile');
    fileInput.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onerror = () => {
            fileInput.value = '';
            btn.blur();
            notify('importError');
        };
        reader.onload = (evt) => {
            try {
                const imported = JSON.parse(evt.target.result);
                const allowedKeys = Object.keys(defaults);
                const valid = {};
                Object.keys(imported).forEach((k) => {
                    if (allowedKeys.includes(k)) valid[k] = imported[k];
                });
                // Sanitize CSS at import time too (collectFormData also sanitizes on save).
                if (valid.customCss) valid.customCss = sanitizeCss(valid.customCss);
                if (typeof valid.customButtonTemplate === 'string') valid.customButtonTemplate = sanitizeTemplateSafe(valid.customButtonTemplate);
                // Renk alanları katı hex/rgba doğrulamasından geçmezse varsayılana döner
                const isColor = (v) => (window.NVP && window.NVP.isSafeColor) ? window.NVP.isSafeColor(v) : /^#[0-9a-f]{6}$/i.test(String(v));
                ['hoverColor', 'bgColorHex', 'buttonColor', 'arrowColor', 'bgColor', 'invertTextColor', 'invertLinkColor', 'invertBgColor',
                    'overlayHeadingColorHex', 'overlayBoldColorHex', 'overlaySvgColorHex'].forEach((k) => {
                    if (k in valid && !isColor(valid[k])) delete valid[k];
                });
                const merged = { ...defaults, ...valid };
                storage.set(merged, () => {
                    fileInput.value = '';
                    btn.blur();
                    loadSettings();
                    notify('imported');
                });
            } catch (err) {
                fileInput.value = '';
                btn.blur();
                notify('importError');
            }
        };
        reader.readAsText(file);
    };
    fileInput.click();
});
function getResetLabel(btn) {
    const parent = btn.parentElement;
    const sl = parent && parent.querySelector('.setting-label');
    if (sl && sl.textContent.trim()) return sl.textContent.trim();
    const span = parent && parent.querySelector('span');
    if (span && span.textContent.trim()) return span.textContent.trim();
    const group = btn.closest('.setting-group');
    const gl = group && group.querySelector('.setting-label');
    return gl ? gl.textContent.trim() : '';
}

const INVERT_SLIDERS = ['invertIntensity', 'invertBrightness', 'invertContrast', 'invertGrayscale', 'invertWarmth', 'colorPreserve'];

document.querySelectorAll('.reset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const setting = btn.getAttribute('data-setting');
        const defaultValue = defaults[setting];
        const labelText = getResetLabel(btn);

        // Invert area checkboxes (nested object) — reset all sub-keys at once
        if (setting === 'invertAreas') {
            const inv = { ...defaults.invertAreas };
            storage.set({ invertAreas: inv }, () => {
                Object.keys(inv).forEach((k) => {
                    const cb = document.getElementById('invArea' + k.charAt(0).toUpperCase() + k.slice(1));
                    if (cb) cb.checked = inv[k];
                });
                debouncedPreview();
                updateJsonField(collectFormData());
                btn.blur();
                notify('singleReset', labelText);
            });
            return;
        }

        // Dark mode area checkboxes (nested object) — reset all sub-keys at once
        if (setting === 'darkModeAreas') {
            const areas = { ...defaults.darkModeAreas };
            storage.set({ darkModeAreas: areas }, () => {
                Object.keys(areas).forEach((k) => {
                    const cb = document.getElementById('darkArea' + k.charAt(0).toUpperCase() + k.slice(1));
                    if (cb) cb.checked = areas[k];
                });
                debouncedPreview();
                updateJsonField(collectFormData());
                btn.blur();
                notify('singleReset', labelText);
            });
            return;
        }

        // Balloon (popup) theme — cycle button, not a form input
        if (setting === 'balloonMode') {
            storage.set({ balloonMode: defaultValue }, () => {
                applyBalloonTheme(defaultValue);
                debouncedPreview();
                updateJsonField(collectFormData());
                btn.blur();
                notify('singleReset', labelText);
            });
            return;
        }

        // Invert color overrides — group reset
        if (setting === 'invertColors') {
            const colorDefaults = {
                invertOverrideText: defaults.invertOverrideText,
                invertTextColor: defaults.invertTextColor,
                invertOverrideLink: defaults.invertOverrideLink,
                invertLinkColor: defaults.invertLinkColor,
                invertOverrideBg: defaults.invertOverrideBg,
                invertBgColor: defaults.invertBgColor,
                overlayHeadingColor: defaults.overlayHeadingColor,
                overlayHeadingColorHex: defaults.overlayHeadingColorHex,
                overlayBoldColor: defaults.overlayBoldColor,
                overlayBoldColorHex: defaults.overlayBoldColorHex
            };
            storage.set(colorDefaults, () => {
                document.getElementById('invOverrideText').checked = false;
                document.getElementById('invTextColor').value = defaults.invertTextColor;
                document.getElementById('invTextColor').disabled = true;
                document.getElementById('invOverrideLink').checked = false;
                document.getElementById('invLinkColor').value = defaults.invertLinkColor;
                document.getElementById('invLinkColor').disabled = true;
                document.getElementById('invOverrideBg').checked = false;
                document.getElementById('invBgColor').value = defaults.invertBgColor;
                document.getElementById('invBgColor').disabled = true;
                document.getElementById('overlayHeadingColor').checked = false;
                document.getElementById('overlayHeadingColorHex').value = defaults.overlayHeadingColorHex;
                document.getElementById('overlayHeadingColorHex').disabled = true;
                document.getElementById('overlayBoldColor').checked = false;
                document.getElementById('overlayBoldColorHex').value = defaults.overlayBoldColorHex;
                document.getElementById('overlayBoldColorHex').disabled = true;
                document.getElementById('overlaySvgColor').checked = false;
                document.getElementById('overlaySvgColorHex').value = defaults.overlaySvgColorHex;
                document.getElementById('overlaySvgColorHex').disabled = true;
                document.getElementById('overlayGrayscale').checked = false;
                debouncedPreview();
                updateJsonField(collectFormData());
                btn.blur();
                notify('singleReset', labelText);
            });
            return;
        }

        // Dark schedule — group reset
        if (setting === 'darkSchedule') {
            const schedDefaults = defaults.darkSchedule;
            storage.set({ darkSchedule: schedDefaults }, () => {
                document.getElementById('darkSchedule').checked = schedDefaults.enabled;
                document.getElementById('darkScheduleTimes').style.display = schedDefaults.enabled ? 'flex' : 'none';
                document.getElementById('darkScheduleStartH').value = schedDefaults.startHour;
                document.getElementById('darkScheduleStartM').value = schedDefaults.startMin;
                document.getElementById('darkScheduleEndH').value = schedDefaults.endHour;
                document.getElementById('darkScheduleEndM').value = schedDefaults.endMin;
                debouncedPreview();
                updateJsonField(collectFormData());
                btn.blur();
                notify('singleReset', labelText);
            });
            return;
        }

        // Dark filters — group reset
        if (setting === 'darkSaturate' || setting === 'darkHueRotate') {
            const fDefaults = defaults.darkFilters || {};
            storage.set({ darkFilters: fDefaults }, () => {
                document.getElementById('darkSaturate').value = fDefaults.saturate ?? 100;
                document.getElementById('darkHueRotate').value = fDefaults.hueRotate ?? 0;
                debouncedPreview();
                updateJsonField(collectFormData());
                btn.blur();
                notify('singleReset', labelText);
            });
            return;
        }

        const updateObj = {};
        updateObj[setting] = defaultValue;
        storage.set(updateObj, () => {
            const el = document.getElementById(setting);
            if (!el) {
                debouncedPreview();
                updateJsonField(collectFormData());
                btn.blur();
                notify('singleReset', labelText);
                return;
            }
            if (el.type === 'checkbox') {
                el.checked = defaultValue;
            } else if (INVERT_SLIDERS.includes(setting)) {
                el.value = Math.round(defaultValue * 100);
                syncInvOutputs();
            } else {
                el.value = defaultValue;
            }
            debouncedPreview();
            updateJsonField(collectFormData());
            btn.blur();
            notify('singleReset', labelText);
        });
    });
});

// Clear all paused sites
const _clearPausedBtn = document.getElementById('clearPausedSites');
if (_clearPausedBtn) _clearPausedBtn.addEventListener('click', (e) => {
    e.currentTarget.blur();
    storage.set({ pausedSites: [] }, () => {
        loadSettings();
        notify('cleared');
    });
});

// Section reset handlers
const SECTION_SETTINGS = {
    active: ['showThemeButton', 'showPageButton', 'showEdgeButton'],
    position: ['position', 'panelStyle', 'panelTheme', 'offsetRight', 'offsetBottom', 'buttonRadius', 'buttonSize', 'keyboardShortcuts', 'autoHide', 'autoHideDelay', 'rememberPosition', 'gestures', 'detectConflicts', 'readingProgress', 'autoScrollSpeed'],
    visual: ['hoverColor', 'bgColorHex', 'buttonColor', 'arrowColor', 'buttonSize', 'buttonRadius', 'offsetRight'],
    dark: ['pageDark', 'balloonMode', 'darkModeMethod', 'smartThreshold', 'smartTint', 'smartTintThreshold', 'smartBands', 'smartBandThreshold', 'darkModeAreas', 'excludeCss', 'invertIntensity', 'invertBrightness', 'invertContrast', 'invertGrayscale', 'invertWarmth', 'invertDim', 'invertImageMode', 'colorPreserve', 'invertAreas', 'invertOverrideText', 'invertTextColor', 'invertOverrideLink', 'invertLinkColor', 'invertOverrideBg', 'invertBgColor', 'overlayHeadingColor', 'overlayHeadingColorHex', 'overlayBoldColor', 'overlayBoldColorHex', 'overlaySvgColor', 'overlaySvgColorHex', 'overlayGrayscale', 'overlayLineHeight', 'overlayLetterSpacing', 'overlayTextShadow', 'overlayFontFamily'],
    darkAdvanced: ['darkAutoDetect', 'darkSchedule', 'darkTransition', 'darkFontSize', 'darkFontWeight', 'darkSaturate', 'darkHueRotate', 'darkScrollOpt'],
    siteRules: ['siteRules', 'pausedSites', 'activeSites', 'enableAllSites']
};

document.querySelectorAll('.section-reset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const section = btn.getAttribute('data-section');
        const keys = SECTION_SETTINGS[section];
        if (!keys) return;
        const resetData = {};
        keys.forEach(k => { resetData[k] = defaults[k]; });
        storage.set(resetData, () => {
            loadSettings();
            btn.blur();
            notify('singleReset', section);
        });
    });
});

// Initialize: load saved settings (script is at bottom of <body>, DOM is ready)
loadSettings();


// v5: etkisiz ayarlar gizlenir (veri korunur)
(function hideDeadControls() {
    const hide = (el) => { if (el) el.hidden = true; };
    const cp = document.getElementById('colorPreserve');
    if (cp) { hide(cp.closest('label')); const h = document.querySelector('[data-i18n="colorPreserveHint"]'); hide(h); }
    ['darkScrollOpt', 'darkAutoDetect'].forEach((id) => { const el = document.getElementById(id); if (el) hide(el.closest('.setting-group')); });
})();

// ── Sağ sütun (geniş ekran): bölüm ipucu, durum özeti, kısayollar ─────────────
(function rail() {
    const box = document.getElementById('rail');
    if (!box) return;
    const T = (k) => ((translations[activeLang] || translations.tr)[k]) || translations.tr[k] || '';
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let siteDarkCount = 0;
    function readLocal() {
        try {
            chrome.storage.local.get({ siteDark: {} }, (r) => {
                siteDarkCount = Object.keys((r && r.siteDark) || {}).length;
                render();
            });
        } catch (_) { /* önizleme dışında */ }
    }
    function tip() {
        const on = document.querySelector('#sideNav a.on') || document.querySelector('#sideNav a');
        if (!on) return;
        const id = on.getAttribute('href').slice(1);
        document.getElementById('railSecName').textContent = on.textContent.trim();
        document.getElementById('railTipText').textContent = T('tip_' + id);
    }
    const optText = (id) => { const el = document.getElementById(id); return el && el.selectedOptions[0] ? el.selectedOptions[0].textContent.trim() : ''; };
    function render() {
        tip();
        let d = {};
        try { d = collectFormData(); } catch (_) { d = {}; }
        const L = _lastLoaded || {};
        const all = L.enableAllSites !== false;
        const paused = (L.pausedSites || []).length;
        const rows = [
            [T('stTheme'), optText('pageDark')],
            [T('stMethod'), optText('darkModeMethod').replace(/\s*\(.*\)$/, '')],
            [T('stRun'), all ? T('stAll') : T('stSelected').replace('{0}', (L.activeSites || []).length)],
            [T('stPaused'), String(paused)],
            [T('stSiteDark'), String(siteDarkCount)],
            [T('stKeys'), d.keyboardShortcuts === false ? T('stOff') : T('stOn')]
        ];
        document.getElementById('railStatus').innerHTML = rows.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('');
        document.getElementById('railUnsaved').hidden = !_dirty;
        const mac = isMac();
        const alt = mac ? '⌥' : 'Alt', ctrl = mac ? '⌃' : 'Ctrl';
        const keys = [
            [T('kPage'), alt + ' ↑ / ↓'], [T('kEdge'), ctrl + ' ' + alt + ' ↑ / ↓'], [T('kAuto'), alt + ' S'],
            [T('kMark'), alt + ' + ' + T('kClick')], [T('kPanel'), alt + ' ⇧ N'], [T('kTheme'), alt + ' ⇧ T'], [T('kPopup'), ctrl + ' ⇧ 8']
        ];
        document.getElementById('railKeys').innerHTML = keys.map(([k, v]) => '<li><span>' + esc(k) + '</span><kbd>' + esc(v) + '</kbd></li>').join('');
    }
    let t = 0;
    const later = () => { clearTimeout(t); t = setTimeout(render, 120); };
    // Kaydet/yükle durumu değişince (markDirty her ikisinde de çağrılır) özeti yenile
    const origMarkDirty = markDirty;
    markDirty = function (v) { origMarkDirty(v); later(); };
    ['input', 'change'].forEach((ev) => document.addEventListener(ev, later, true));
    new MutationObserver(later).observe(document.getElementById('sideNav'), { subtree: true, attributes: true, attributeFilter: ['class'] });
    new MutationObserver(later).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    try { chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.siteDark) readLocal(); else if (area === 'sync') later(); }); } catch (_) { /* yok say */ }
    readLocal();
    render();
})();
