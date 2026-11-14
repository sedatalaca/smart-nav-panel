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
├── options.html / options.js — Ayarlar sayfası: kenar menüsü + kartlar + üstte sabit kaydet çubuğu;
│                            ≥1360 px'te sağ sütun (bölüm ipucu, durum özeti, kısayollar).
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
  Açık mavi/sarı zeminler `mapTint()` ile aynı tonda koyulaşır (`smartTint`, `smartTintThreshold` %45; doygun orta tonlar,
  etkileşimli ve küçük öğeler hariç). Örtü `shadeEl()` ile en üst `background-image` katmanı olarak eklenir (box-shadow değil;
  sitenin hover gölgesi korunur). `hoverGlowCss()` okunabilen stil sayfalarındaki `:hover`/`:focus-within` box-shadow
  kurallarının açık renkli eşini üretir (aynı seçici ve boyut), böylece kart halesi karanlıkta da görünür. Resimli/gradyanlı büyük
  alanlar ilk geçişte `estimateBg()` ile ölçülür (taramayı beklemez); tarama kaydırırken de 250 ms'de bir çalışır ve ekranı
  kaplayan saydam katmanlar (modal kabı) ızgaranın geri kalanını kesmez.
  Doygun renkli büyük şeritler (sayfa genişliğinde menü çubuğu, bölüm bandı) `mapBand()` ile tonu korunarak koyulaşır; gradyanlı
  şeritlere `BAND_OV` örtüsü eklenir (`smartBands`, `smartBandThreshold` = HSL açıklığı %35; düğme/rozet ve dar öğeler hariç).
  `hoverGlowCss()` ayrıca `:hover/:focus/:active` kurallarındaki açık zeminleri koyu ama belirgin bir vurguya çevirir (`mapHover()`).
  Modal/video örtüleri `isBackdrop()` ile tanınır; `overlayOpen()` iken karartma kararı değiştirilmez.
  `invert` tüm sayfayı ters çevirir; Aydınlık seçeneği koyu siteyi açarken her zaman `invert` kullanılır. `theme` eski alan boyama.
- Karar `storage.local.nvpDarkCache:<host>`'a yazılır; bir sonraki açılışta stil erken eklenir.
- Doğrudan açılan SVG belgesi (`document.contentType === 'image/svg+xml'`): dark.js başındaki ayrı IIFE yalnız kök zemini
  ayarlar (`storage.sync.svgBg = 'auto'|'dark'|'light'|'checker'`, oluşturulabilir stil sayfasıyla, SVG DOM'una dokunmadan);
  kendi `getState`/`setSvgBg`/`toggleTheme` mesajlarını yanıtlar. Karartma IIFE'si ve content.js bu belgede hiç çalışmaz.
  Ekran içi kontrol: kök `<svg>`'ye eklenen 0×0 `<foreignObject data-nvp-svg-ui>` içindeki XHTML `div` popover (üst katman)
  olarak gösterilir; SVG ölçeği/kırpması etkilemez, kök boyutu ve kaydırma alanı değişmez. İçerik kapalı shadow root'ta; XML
  ayrıştırma nedeniyle ikonlara `xmlns` yazılır. Seçenekler dikey açılır (düğme üst yarıdaysa altına); düğme sürüklenebilir,
  konum `storage.local.nvpSvgUiPos` ({h, y, top, left}: düğmenin bulunduğu yarıya göre en yakın kenardan) olarak tüm SVG'ler için saklanır; seçenekler hep ekranın içine doğru açılır. 2,5 sn hareketsizlik / imleç ayrılması /
  dışarı tıklama ile kapanır.
  Popup `st.svg` gelince `renderSvg()` gösterir. "Bu sitede çalışsın" gerekmez; yalnız "Her yerde duraklat" uyulur.
- Stil öğesi (`#nvp-dark`) document_start'ta eklendiği için sayfa ayrıştırıldıkça `ensureLast()` ile belgenin sonuna
  taşınır (eşit güçteki `!important` kurallarda sonra gelen kazanır). Akıllı yöntemin kök kuralı `:root,:root>body`
  özgüllüğündedir; sitenin `body{background:…!important}` kuralını yener. `fixTextIn()` açık zeminli alt öğenin
  zeminini de koyulaştırır (açık yazı + beyaz zemin oluşmaz).
- Durum kurallarının koyu eşleri (`hoverGlowCss()`) ayrı `#nvp-dark-hover` stilindedir ve yalnız gerçek `:hover/:focus/:active`
  seçicilerini içerir (aynı listedeki `[disabled]` gibi parçalar alınmaz). `smartProcess()` okurken bu stil kapatılır; böylece
  odaklı/kilitli bir öğe o an koyu görünse de kalıcı koyu zemini yazılır.
- Koyu yüzeydeki `::before/::after` simge ve okları (simge fontu rengi, CSS üçgeni `border-top/bottom-color`) `pseudoFgFixes()` ile
  açılır: öğeye `--nvp-pf*/--nvp-pt*/--nvp-pu*` değişkeni ve `data-nvp-ps` belirteci (`fb/fa/tb/ta/ub/ua`) yazılır.
- Zemini koyulaştırılan `select` kutusundaki tekrar etmeyen arka plan resmi (koyu açılır kutu oku) `fixSelectArrow()` ile açık bir
  SVG okla değiştirilir.
- Panel (content.js): kısa sayfada gizlenmez, `.short` ile soluk durur. `avoidWidgets()` sitenin köşe öğesini bir kez bulunca
  (`liftEl`) panel onun 8 px üstünde sabit kalır; temel konum hesaplanmış dönüşümden (`m42`) bulunur, animasyon sırasında
  pay şişmez. Öğe gizlenip gösterilse de panel inip kalkmaz; açıkken/üzerindeyken kaydırılmaz. Dışarı tıklama yığını hemen kapatır;
  açık yığın 2,5 sn hiçbir etkileşim olmazsa (imleç üzerinde olsa bile) kendiliğinden kapanır (`IDLE_CLOSE_MS`, `bumpIdle()`);
  her kapanış `closeStack()` üzerinden olur; düğme ipucu, bilgi hapı (`toast`) ve "kaldığın yere dön" düğmesi de aynı anda kapanır.
  Yığın kapalıyken çıkan hap/düğme kendi süresiyle (2,6 sn / 6 sn) kapanır.
  Panel tonu kaydırırken de (250 ms) ölçülür.
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
2. Yeni açılan bir sitede panel ve karartma yok (varsayılan kapalı, `enableAllSites: false`); popup'tan "Bu sitede
   çalışsın" açılınca site `activeSites`'a eklenir ve ikisi de devreye girer. Eski kurulumlar background.js'teki
   `migrateOptIn()` ile bir kez kapalıya geçirilir (`nvpOptIn7`), `activeSites` korunur.
3. Uzun bir sayfa: sağ altta ilerleme halkalı tek düğme; üzerine gelince yığın açılır (⋯, tema, en üst, sayfa ↑/↓, en alt).
4. Sayfanın başındayken düğme "aşağı kaydır", aşağıdayken "en üste çık" olur.
5. Sağ tık ya da ⋯ → menü: Başlıklar, Yer imleri, Otomatik kaydır, karartma (Otomatik/Açık/Kapalı), paneli gizle, Ayarlar.
6. Sistem karanlıkken: Wikipedia gibi açık site kararır; YouTube/GitHub (karanlık temada) kararmaz.
7. Gmail/Notion gibi iç kaydırıcılı sitelerde sayfa ↑/↓ doğru kabı kaydırır; sabit başlık altında satır kaybolmaz.
8. SPA'da rota değişince yer imleri ve ilerleme yeni sayfaya göre güncellenir.
9. Popup: durum satırı, hızlı gezinme, karartma seçimi, "Bu sitede çalışsın", "Paneli göster", "Her yerde duraklat".
