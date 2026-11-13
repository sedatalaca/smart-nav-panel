// Smart Nav Panel — Copyright (C) 2026 LikaGroup (Sedat Alaca-LikaPulse)
// SPDX-License-Identifier: GPL-3.0-or-later
// popup.js — Navigasyon v5 eklenti balonu
'use strict';

const UI_LANG = (() => {
    try { const l = String(chrome.i18n.getUILanguage() || 'en').slice(0, 2).toLowerCase(); return l === 'tr' || l === 'ru' ? l : 'en'; }
    catch (_) { return 'en'; }
})();

const TRANSLATIONS = {
    tr: {
        title: 'Navigasyon', unsupported: 'Bu sayfada çalışamıyorum.', unsupportedAlt: 'chrome://, mağaza ve eklenti sayfaları korumalıdır.',
        reload: 'Sayfa eklentiden önce açılmışsa bir kez yenile.', openSettings: 'Ayarlar',
        active: 'Aktif', paused: 'Bu sitede duraklatıldı', pausedAll: 'Her yerde duraklatıldı', notEnabled: 'Bu sitede etkin değil',
        hiddenRule: 'Panel bu sitede gizli', hiddenShort: 'Sayfa kısa — panel gerekmedi', visible: 'Panel görünür',
        top: 'En üst', pageUp: 'Sayfa yukarı', pageDown: 'Sayfa aşağı', bottom: 'En alt',
        dimming: 'Bu sitede tema', mAuto: 'Sistem', mOn: 'Karanlık', mOff: 'Aydınlık', now: 'Şu an:', dimmed: 'karartılmış', notDimmed: 'karartılmamış', lightened: 'açık renge çevrilmiş',
        r: { native: 'site kendi karanlık modunda', supports: 'sitenin kendi karanlık modu var', 'already-dark': 'sayfa zaten koyu', darkreader: 'Dark Reader etkin', 'os-light': 'sistem teması açık (Sistem seçeneği yalnız sistem karanlıkken karartır)', never: 'genel ayar: hiçbir zaman', 'user-off': 'Aydınlık seçili, site zaten açık renkli', lighten: 'koyu site açık renge çevrildi', 'user-on': 'Karanlık seçili', always: 'genel ayar: her zaman', auto: 'açık renkli sayfa, sistem karanlık', paused: 'eklenti duraklatıldı', schedule: 'zamanlama dışında', cached: 'önceki karar', pending: 'kontrol ediliyor' },
        settingsSec: 'Bu site', runHere: 'Bu sitede çalışsın', runHereSmall: 'Panel, kısayollar ve karartma',
        showPanel: 'Paneli göster', showPanelSmall: 'Kapalıyken yalnız kısayollar ve karartma çalışır',
        pauseAll: 'Her yerde duraklat', pauseAllSmall: 'Tüm siteler için geçici olarak kapat',
        keys: 'Alt+↑/↓ sayfa · Ctrl+Alt+↑/↓ en üst/alt · Alt+S otomatik kaydırma · Alt+tık yer imi'
    },
    en: {
        title: 'Navigation', unsupported: "I can't run on this page.", unsupportedAlt: 'chrome://, store and extension pages are protected.',
        reload: 'If the page was open before the extension, reload it once.', openSettings: 'Settings',
        active: 'Active', paused: 'Paused on this site', pausedAll: 'Paused everywhere', notEnabled: 'Not enabled on this site',
        hiddenRule: 'Panel hidden on this site', hiddenShort: 'Short page — panel not needed', visible: 'Panel visible',
        top: 'Top', pageUp: 'Page up', pageDown: 'Page down', bottom: 'Bottom',
        dimming: 'Theme on this site', mAuto: 'System', mOn: 'Dark', mOff: 'Light', now: 'Now:', dimmed: 'dimmed', notDimmed: 'not dimmed', lightened: 'turned light',
        r: { native: 'site is in its own dark mode', supports: 'site has its own dark mode', 'already-dark': 'page is already dark', darkreader: 'Dark Reader is active', 'os-light': 'system theme is light (System only dims when the system is dark)', never: 'global setting: never', 'user-off': 'Light selected, the site is already light', lighten: 'dark site turned light', 'user-on': 'Dark selected', always: 'global setting: always', auto: 'light page, dark system', paused: 'extension paused', schedule: 'outside schedule', cached: 'previous decision', pending: 'checking' },
        settingsSec: 'This site', runHere: 'Run on this site', runHereSmall: 'Panel, shortcuts and dimming',
        showPanel: 'Show panel', showPanelSmall: 'When off, only shortcuts and dimming work',
        pauseAll: 'Pause everywhere', pauseAllSmall: 'Temporarily turn off on all sites',
        keys: 'Alt+↑/↓ page · Ctrl+Alt+↑/↓ top/bottom · Alt+S auto-scroll · Alt+click bookmark'
    },
    ru: {
        title: 'Навигация', unsupported: 'На этой странице я не работаю.', unsupportedAlt: 'chrome://, магазин и страницы расширений защищены.',
        reload: 'Если страница была открыта до установки, обновите её.', openSettings: 'Настройки',
        active: 'Активно', paused: 'Пауза на этом сайте', pausedAll: 'Пауза везде', notEnabled: 'Не включено на этом сайте',
        hiddenRule: 'Панель скрыта на сайте', hiddenShort: 'Короткая страница — панель не нужна', visible: 'Панель видна',
        top: 'В начало', pageUp: 'Страница вверх', pageDown: 'Страница вниз', bottom: 'В конец',
        dimming: 'Тема на сайте', mAuto: 'Системная', mOn: 'Тёмная', mOff: 'Светлая', now: 'Сейчас:', dimmed: 'затемнено', notDimmed: 'не затемнено', lightened: 'осветлено',
        r: { native: 'сайт в своём тёмном режиме', supports: 'у сайта есть свой тёмный режим', 'already-dark': 'страница уже тёмная', darkreader: 'активен Dark Reader', 'os-light': 'светлая тема системы (Системная затемняет только при тёмной системе)', never: 'общая настройка: никогда', 'user-off': 'выбрана светлая, сайт уже светлый', lighten: 'тёмный сайт осветлён', 'user-on': 'выбрана тёмная', always: 'общая настройка: всегда', auto: 'светлая страница, тёмная система', paused: 'расширение на паузе', schedule: 'вне расписания', cached: 'прежнее решение', pending: 'проверка' },
        settingsSec: 'Этот сайт', runHere: 'Работать на этом сайте', runHereSmall: 'Панель, сочетания клавиш и затемнение',
        showPanel: 'Показывать панель', showPanelSmall: 'Если выкл., работают только клавиши и затемнение',
        pauseAll: 'Пауза везде', pauseAllSmall: 'Временно выключить на всех сайтах',
        keys: 'Alt+↑/↓ страница · Ctrl+Alt+↑/↓ начало/конец · Alt+S автопрокрутка · Alt+клик закладка'
    }
};

const svg = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>';
const ICON = {
    top: svg('<path d="M5 4h14"/><path d="M12 20V9"/><path d="M7 13l5-5 5 5"/>'),
    up: svg('<path d="M6 15l6-6 6 6"/>'),
    down: svg('<path d="M6 9l6 6 6-6"/>'),
    bottom: svg('<path d="M5 20h14"/><path d="M12 4v11"/><path d="M7 11l5 5 5-5"/>'),
    system: svg('<rect x="2.5" y="3.5" width="19" height="13" rx="2"/><path d="M8 20.5h8M12 16.5v4"/>'),
    moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>')
};
const esc = (s) => (window.NVP && NVP.escapeHtml ? NVP.escapeHtml(s) : String(s));
let D = TRANSLATIONS[UI_LANG];
let tabId = null;

function syncGet(def, cb) {
    try { chrome.storage.sync.get(def, (r) => cb(chrome.runtime.lastError || !r ? def : r)); } catch (_) { cb(def); }
}
function syncSet(obj, cb) {
    try { chrome.storage.sync.set(obj, () => { void chrome.runtime.lastError; if (cb) cb(); }); } catch (_) { if (cb) cb(); }
}
function toTab(msg, cb) {
    if (tabId == null) { if (cb) cb(null); return; }
    try { chrome.tabs.sendMessage(tabId, msg, (r) => { void chrome.runtime.lastError; if (cb) cb(r || null); }); } catch (_) { if (cb) cb(null); }
}

function applyPopupTheme(mode) {
    const sys = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const m = mode === 'light' || mode === 'dark' ? mode : sys;
    document.body.classList.toggle('light', m === 'light');
}

function renderUnsupported() {
    document.getElementById('content').innerHTML =
        '<div class="msg">' + esc(D.unsupported) + '<br><small>' + esc(D.unsupportedAlt) + '<br>' + esc(D.reload) + '</small></div>' +
        '<div class="foot"><button class="btn" id="settingsBtn">' + ICON.gear + esc(D.openSettings) + '</button></div>';
    document.getElementById('settingsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
}

function statusLine(st) {
    if (st.globallyPaused) return [false, D.pausedAll];
    if (!st.active) return [false, st.pausedOnSite ? D.paused : D.notEnabled];
    if (st.hiddenReason === 'rule') return [true, D.active + ' · ' + D.hiddenRule];
    if (st.hiddenReason === 'short') return [true, D.active + ' · ' + D.hiddenShort];
    return [true, D.active + ' · ' + D.visible];
}

function render(st, s) {
    const [ok, line] = statusLine(st);
    const dk = st.dark || { state: 'off', reason: 'pending', siteMode: 'auto' };
    const runHere = s.enableAllSites ? !st.pausedOnSite : st.activeOnSite;
    const c = document.getElementById('content');
    c.innerHTML = `
      <div class="site${ok ? '' : ' off'}"><span class="dot"></span><div><b>${esc(st.host)}</b><small>${esc(line)}</small></div></div>
      <div class="nav">
        <button data-scroll="top" data-ttip="${esc(D.top)}" aria-label="${esc(D.top)}">${ICON.top}</button>
        <button data-scroll="page-up" data-ttip="${esc(D.pageUp)}" aria-label="${esc(D.pageUp)}">${ICON.up}</button>
        <button data-scroll="page-down" data-ttip="${esc(D.pageDown)}" aria-label="${esc(D.pageDown)}">${ICON.down}</button>
        <button data-scroll="bottom" data-ttip="${esc(D.bottom)}" aria-label="${esc(D.bottom)}">${ICON.bottom}</button>
      </div>
      <div class="sec">${esc(D.dimming)}</div>
      <div class="seg" role="radiogroup" aria-label="${esc(D.dimming)}">
        <button data-dark="off" role="radio" aria-checked="${dk.siteMode === 'off'}" class="${dk.siteMode === 'off' ? 'on' : ''}">${ICON.sun}${esc(D.mOff)}</button>
        <button data-dark="on" role="radio" aria-checked="${dk.siteMode === 'on'}" class="${dk.siteMode === 'on' ? 'on' : ''}">${ICON.moon}${esc(D.mOn)}</button>
        <button data-dark="auto" role="radio" aria-checked="${dk.siteMode === 'auto'}" class="${dk.siteMode === 'auto' ? 'on' : ''}">${ICON.system}${esc(D.mAuto)}</button>
      </div>
      <div class="why">${esc(D.now)} <b>${esc(dk.reason === 'lighten' ? D.lightened : dk.state === 'on' ? D.dimmed : D.notDimmed)}</b>${D.r[dk.reason] ? ' — ' + esc(D.r[dk.reason]) : ''}</div>
      <div class="sec">${esc(D.settingsSec)}</div>
      <div class="row"><div class="lbl">${esc(D.runHere)}<small>${esc(D.runHereSmall)}</small></div><label class="switch"><input type="checkbox" id="swRun" ${runHere ? 'checked' : ''} ${st.globallyPaused ? 'disabled' : ''}><span class="slider"></span></label></div>
      <div class="row"><div class="lbl">${esc(D.showPanel)}<small>${esc(D.showPanelSmall)}</small></div><label class="switch"><input type="checkbox" id="swPanel" ${st.panelHidden ? '' : 'checked'} ${st.active ? '' : 'disabled'}><span class="slider"></span></label></div>
      <div class="row"><div class="lbl">${esc(D.pauseAll)}<small>${esc(D.pauseAllSmall)}</small></div><label class="switch"><input type="checkbox" id="swAll" ${st.globallyPaused ? 'checked' : ''}><span class="slider"></span></label></div>
      <hr>
      <div class="foot"><button class="btn" id="settingsBtn">${ICON.gear}${esc(D.openSettings)}</button></div>
      <div class="keys">${esc(D.keys)}</div>`;

    try { NVP.tip.init(c); } catch (_) { /* yok say */ }
    c.querySelectorAll('[data-scroll]').forEach((b) => b.addEventListener('click', () => toTab({ action: 'scroll', type: b.dataset.scroll })));
    c.querySelectorAll('[data-dark]').forEach((b) => b.addEventListener('click', () => toTab({ action: 'setSiteDark', mode: b.dataset.dark }, () => setTimeout(refresh, 120))));
    document.getElementById('settingsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());

    document.getElementById('swRun').addEventListener('change', (e) => {
        const on = e.target.checked;
        syncGet({ pausedSites: [], activeSites: [], enableAllSites: false }, (r) => {
            let paused = (r.pausedSites || []).filter((h) => h !== st.host);
            let active = (r.activeSites || []).filter((h) => h !== st.host);
            if (r.enableAllSites) { if (!on) paused.push(st.host); }
            else if (on) active.push(st.host);
            syncSet({ pausedSites: paused, activeSites: active }, () => toTab({ action: 'pauseUpdate' }, refresh));
        });
    });
    document.getElementById('swPanel').addEventListener('change', () => toTab({ action: 'togglePanelHere' }, () => setTimeout(refresh, 200)));
    document.getElementById('swAll').addEventListener('change', (e) => syncSet({ paused: e.target.checked }, () => toTab({ action: 'pauseUpdate' }, refresh)));
}

function refresh() {
    syncGet({ language: UI_LANG, balloonMode: 'system', enableAllSites: false }, (s) => {
        D = TRANSLATIONS[s.language] || TRANSLATIONS[UI_LANG] || TRANSLATIONS.en;
        document.documentElement.lang = s.language || UI_LANG;
        applyPopupTheme(s.balloonMode);
        document.getElementById('title').textContent = D.title;
        document.title = D.title;
        toTab({ action: 'getState' }, (st) => {
            if (!st || !st.supported) { renderUnsupported(); return; }
            render(st, s);
        });
    });
}

try { document.getElementById('ver').textContent = 'v' + chrome.runtime.getManifest().version; } catch (_) { /* yok say */ }
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    tabId = tab ? tab.id : null;
    refresh();
});
if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refresh);
