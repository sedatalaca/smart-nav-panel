# AGENTS.md — Evrensel Navigasyon Eklentisi (v5.0)

## Proje yapısı
```
Navigasyon Eklentisi/
├── manifest.json          — Manifest V3, __MSG_* ile i18n, default_locale: "en"
├── background.js          — Service worker: klavye komutları, sekme rozeti, ayar göçü,
│                            kurulumda açık sekmelere betik enjeksiyonu (scripting)
├── dark.js                — Akıllı sayfa karartma (document_start): yerel karanlık mod algılama,
│                            host başına karar önbelleği (flaşsız), sonradan tema değişimini izleme
├── shared.js              — Ortak yardımcılar: ipucu (tooltip), escapeHtml, debounce,
│                            renk doğrulama, özel CSS ve HTML şablon temizleme,
│                            NVP.panel (ikon seti + panel CSS'i; content.js ve ayarlar önizlemesi ortak kullanır)
├── content.js             — Panel (Shadow DOM, kompakt/tam), kaydırma motoru, menü, kısayollar,
│                            okuma ilerlemesi, başlık gezgini, yer imleri, otomatik kaydırma, SPA uyumu
├── popup.html / popup.js  — Eklenti balonu: site durumu, hızlı gezinme, karartma seçimi
├── options.html / options.js — Ayarlar sayfası: kenar menüsü + kartlar + üstte sabit kaydet çubuğu.
│                            Ayarlar sayfasının kendisi önizleme alanıdır: gerçek panel CSS'iyle
│                            çalışan panel (#navPreview, açık shadow root) bu sayfayı kaydırır.
│                            Form alanlarının id'leri options.js ile eşleşir; değiştirirken ikisini birlikte güncelle.
├── icon.svg, icons/       — Simgeler (16/32/48/128 px)
├── _locales/{tr,en,ru}/messages.json — Chrome i18n metinleri (ad, açıklama, komutlar)
├── README.md, LICENSE     — Tanıtım ve GPL-3.0 lisansı
└── YAPILACAKLAR.md        — Planlanan iyileştirmeler
```
İçerik betikleri: `dark.js` (document_start) → `shared.js` + `content.js` (document_end).
İkisi aynı izole dünyada çalışır; karartma durumu `window.__nvpDark` ile paylaşılır.

## Komutlar
| Komut | Amaç |
|-------|------|
| `node --check content.js` (ve diğer .js dosyaları) | Sözdizimi denetimi |
| `python3 -c "import json;json.load(open('manifest.json'))"` | JSON denetimi |

## Karartma kuralları (dark.js)
- Site seçimi `storage.local.siteDark[host]`: `'off'` = Aydınlık (koyu siteyi açık renge çevirir, açık siteye dokunmaz), `'on'` = Karanlık (açık siteyi karartır, koyu siteye dokunmaz), yok = Sistem. Her yerde sıra ve ikonlar: Aydınlık (güneş) → Karanlık (ay) → Sistem (monitör).
- Genel seçim `storage.sync.pageDark = 'auto' | 'always' | 'never'` (varsayılan `auto`).
- `auto`: yalnız sistem karanlıkken ve sayfa açık renkliyse karartır. Şunlardan biri varsa
  **dokunmaz**: karanlık sınıf/öznitelik (`.dark`, `html[dark]`, `data-theme*=dark`,
  `data-color-mode`, `data-bs-theme`…), Dark Reader, `color-scheme` (meta/hesaplanmış),
  ölçülen koyu arka plan (görünen öğeler üzerinden), sitenin tema düğmesi ya da
  `prefers-color-scheme: dark` / `.dark` CSS kuralları.
- Yöntemler (`darkModeMethod`): `smart` (varsayılan, v5.1) yalnız beyaz/gri yüzeyleri koyulaştırır ve koyu yazıları açar;
  renkli düğme/rozet/görsel ve renkli zemin üstündeki yazıya dokunmaz (inline `!important`, özgün değerler `SMART.saved`'da,
  kapatınca geri yüklenir; yeni öğeler MutationObserver ile işlenir; aynı kökenli açık desen resimleri iç gölgeyle karartılır).
  Son güvence `smartSweep()`: ekrandaki ızgarada (10×12) ve sınıfı değişen öğelerde görünen zemin `smartThreshold`
  (%45, ayarlardan) eşiğinden açıksa nötr zemin koyulaştırılır; resim/gradyan katmanları `estimateBg()` ile tahmin
  edilip açıksa iç gölge örtüsü (`OVERLAY`) uygulanır; renkli düz zeminler yalnız %70 üstünde ve büyükse örtülür;
  ekranın ≥%20'sini kaplayan açık `<img>` hafifçe karartılır; açık `::before/::after` `data-nvp-ps` ile boyanır.
  Placeholder/otomatik doldurma/seçenek renkleri stil sayfası kurallarıyla düzeltilir; açık shadow root'lar da işlenir.
  `invert` tüm sayfayı ters çevirir; Aydınlık seçeneği koyu siteyi açarken her zaman `invert` kullanılır. `theme` eski alan boyama.
- Karar `storage.local.nvpDarkCache:<host>`'a yazılır; bir sonraki açılışta stil erken eklenir.
- Panel kökü (`<nvp-root>`) yalnız `invert + hue-rotate` ile geri çevrilir.
- Eski kayıtlar (`siteThemes`, `darkExcludeSites`) background.js'te bir kez `siteDark`'a taşınır.

## Kod kuralları
- Tanımlayıcılar **İngilizce**; yorumlar Türkçe olabilir.
- Panel, menü, ipucu ve "hap"lar **kapalı Shadow DOM** içindedir. Panel CSS'i `content.js` → `buildCss()`.
  Kullanıcının özel CSS'i yalnız bu shadow root'a eklenir.
- Özel HTML şablonu `NVP.sanitizeTemplate` ile temizlenir. Şablonda gezinme düğmeleri
  (`#btn-top`, `#btn-page-up`, `#btn-page-down`, `#btn-bottom`) varsa yığının yerine geçer
  (⋯ menü düğmesi korunur); yalnız `#btn-theme-toggle` varsa sadece tema düğmesinin yerine geçer.
- Kaydırma tek bir "birincil kaydırıcı" üzerinden yapılır (`getScroller()` puanlama;
  kullanıcının kaydırdığı/tıkladığı kap benimsenir). Sayfa adımı üstteki sabit başlığı düşer.
- Depolama: ayarlar `storage.sync`; konum (`nvpPos:<url>`), yer imleri (`nvpMarks:<url>`),
  sürüklenen panel (`nvpPanelPos:<host>`), `siteDark` ve karar önbelleği `storage.local`'da.
- Yeni metin üç dile birden eklenir: `TXT` (content.js), `TRANSLATIONS` (popup.js), `translations` (options.js).
- Varsayılan dil tarayıcı dilidir (`chrome.i18n.getUILanguage()`: tr/ru, aksi hâlde en).

## Test kontrol listesi
1. `chrome://extensions` → Geliştirici modu → "Paketlenmemiş öğe yükle" → bu klasör.
2. Uzun bir sayfa: sağ altta ilerleme halkalı tek düğme; üzerine gelince yığın açılır (⋯, tema, en üst, sayfa ↑/↓, en alt).
3. Sayfanın başındayken düğme "aşağı kaydır", aşağıdayken "en üste çık" olur.
4. Sağ tık ya da ⋯ → menü: Başlıklar, Yer imleri, Otomatik kaydır, karartma (Otomatik/Açık/Kapalı), paneli gizle, Ayarlar.
5. Sistem karanlıkken: Wikipedia gibi açık site kararır; YouTube/GitHub (karanlık temada) kararmaz.
6. Gmail/Notion gibi iç kaydırıcılı sitelerde sayfa ↑/↓ doğru kabı kaydırır; sabit başlık altında satır kaybolmaz.
7. SPA'da rota değişince yer imleri ve ilerleme yeni sayfaya göre güncellenir.
8. Popup: durum satırı, hızlı gezinme, karartma seçimi, "Bu sitede çalışsın", "Paneli göster", "Her yerde duraklat".
