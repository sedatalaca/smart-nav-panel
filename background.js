// Smart Nav Panel — Copyright (C) 2026 LikaGroup (Sedat Alaca-LikaPulse)
// SPDX-License-Identifier: GPL-3.0-or-later
// Arka plan service worker: klavye komutları, sekme rozeti, ayar göçü,
// kurulum/güncellemede açık sekmelere betik enjeksiyonu.

function sendToActive(msg) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const id = tabs && tabs[0] && tabs[0].id;
        if (!id) return;
        chrome.tabs.sendMessage(id, msg, () => void chrome.runtime.lastError);
    });
}

chrome.commands.onCommand.addListener((cmd) => {
    if (cmd === 'toggle-theme') sendToActive({ action: 'toggleTheme' });
    else if (cmd === 'toggle-panel') sendToActive({ action: 'togglePanelHere' });
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!msg || !msg.action) return;
    if (msg.action === 'openOptions') {
        chrome.runtime.openOptionsPage();
    } else if (msg.action === 'badge' && sender.tab && sender.tab.id != null) {
        // Rozet sekme başına: yalnız eklentinin duraklatıldığı sekmede görünür
        chrome.action.setBadgeText({ tabId: sender.tab.id, text: msg.text || '' }, () => void chrome.runtime.lastError);
        if (msg.text) chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: msg.color || '#8a8a96' }, () => void chrome.runtime.lastError);
    }
    reply && reply({});
});

// Eski kayıtları yeni şemaya taşı (bir kez, kurulum/güncellemede)
function migrate(done) {
    chrome.storage.sync.get({ bgColor: null, bgColorHex: null, siteThemes: {}, darkExcludeSites: [], nvpMigrated5: false }, (d) => {
        if (chrome.runtime.lastError) { done(); return; }
        const sync = {};
        if (!d.bgColorHex && typeof d.bgColor === 'string') {
            const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(d.bgColor);
            if (m) sync.bgColorHex = '#' + m.slice(1).map((n) => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0')).join('');
        }
        if (d.nvpMigrated5) { if (Object.keys(sync).length) chrome.storage.sync.set(sync, done); else done(); return; }
        // v5: site başına karartma seçimi storage.local → siteDark[host] = 'on' | 'off'
        chrome.storage.local.get({ siteDark: {} }, (l) => {
            const map = (l && l.siteDark) || {};
            const themes = d.siteThemes && typeof d.siteThemes === 'object' ? d.siteThemes : {};
            Object.keys(themes).forEach((h) => {
                const mod = themes[h] && themes[h].mod;
                if (!map[h] && (mod === 'dark' || mod === 'light')) map[h] = mod === 'dark' ? 'on' : 'off';
            });
            (Array.isArray(d.darkExcludeSites) ? d.darkExcludeSites : []).forEach((h) => { if (!map[h]) map[h] = 'off'; });
            sync.siteThemes = {};
            sync.darkExcludeSites = [];
            sync.nvpMigrated5 = true;
            chrome.storage.local.set({ siteDark: map }, () => chrome.storage.sync.set(sync, done));
        });
    });
}

// Kurulumdan önce açık olan sekmelere betikleri ekle (yeniden yüklemeye gerek kalmasın)
function injectIntoOpenTabs() {
    chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }, (tabs) => {
        (tabs || []).forEach((t) => {
            if (t.id == null || t.discarded) return;
            chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['dark.js', 'shared.js', 'content.js'] }, () => void chrome.runtime.lastError);
        });
    });
}

// v5.1: varsayılan karartma yöntemi "akıllı boyama"; eski "ters çevirme" kaydı bir kez taşınır
function migrateMethod(done) {
    chrome.storage.sync.get({ darkModeMethod: null, nvpMigrated6: false }, (d) => {
        if (chrome.runtime.lastError || d.nvpMigrated6) { done(); return; }
        const upd = { nvpMigrated6: true };
        if (d.darkModeMethod === 'invert' || d.darkModeMethod === null) upd.darkModeMethod = 'smart';
        chrome.storage.sync.set(upd, done);
    });
}

// Eklenti artık sitelerde varsayılan olarak KAPALI başlar (v5.2): yalnız popup'taki "Bu sitede çalışsın"
// ile açılan sitelerde panel, kısayollar ve karartma çalışır. Eski kurulumlarda bir kez uygulanır;
// daha önce açıkça çalıştırılan siteler (activeSites) korunur.
function migrateOptIn(done) {
    chrome.storage.sync.get({ nvpOptIn7: false }, (d) => {
        if (chrome.runtime.lastError || d.nvpOptIn7) { done(); return; }
        chrome.storage.sync.set({ nvpOptIn7: true, enableAllSites: false }, done);
    });
}

chrome.runtime.onInstalled.addListener(() => {
    try { migrate(() => migrateMethod(() => migrateOptIn(injectIntoOpenTabs))); } catch (_) { /* yok say */ }
});
