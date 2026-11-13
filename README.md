# Smart Nav Panel — Akıllı Gezinme Paneli

Sayfanın tasarımına uyum sağlayan bir Chrome eklentisi: kompakt gezinme paneli, okuma ilerlemesi,
başlık gezgini, yer imleri, otomatik kaydırma ve sitenin kendi karanlık modunu bozmayan akıllı karartma.

Eklenti sitelerde **varsayılan olarak kapalıdır**. Bir sitede kullanmak için eklenti simgesine tıklayıp
**"Bu sitede çalışsın"** anahtarını açın; panel, kısayollar ve karartma yalnız açtığınız sitelerde çalışır.

![Simge](icon.svg)

## Özellikler

- **Kompakt panel** — Sağ altta ilerleme halkalı tek akıllı düğme. Sayfanın başında "aşağı kaydır",
  aşağıdayken "en üste çık" olur. Üzerine gelince ya da dokununca diğer düğmeler açılır. Görünümü
  altındaki sayfanın rengine uyar; sürüklenerek taşınabilir.
- **Akıllı boyama (karanlık mod)** — Sayfayı ters çevirmez: yalnız beyaz/gri yüzeyleri (gövde,
  kartlar, form alanları) koyulaştırır, koyu yazıları açar. Renkli düğmelere, rozetlere ve
  görsellere dokunmaz. Ekranda açık kalan alanları ayrıca yakalayıp koyu bir örtüyle kapatır.
- **Aydınlık / Karanlık / Sistem** — Her site için ayrı seçilebilir. Sistem seçeneği yalnız
  bilgisayar karanlık moddayken ve site açık renkliyse karartır; sitenin kendi karanlık modu varsa
  dokunmaz. Aydınlık, koyu temalı bir siteyi açık renge çevirir.
- **Her site yapısında doğru kaydırma** — İçeriğin pencere yerine bir iç alanda kaydığı uygulamalar,
  üstte sabit duran başlıklar, sayfa yenilenmeden adres değiştiren siteler ve sonsuz akışlar.
- **Menü** (⋯ ya da sağ tık) — Başlık gezgini, yer imleri (Alt+tık), otomatik kaydırma (Alt+S).
- **Köşe uyumu** — Sitenin kendi "yukarı çık" düğmesi ya da sohbet balonu varsa panel onların
  üstüne kalkar.
- **Ayarlar sayfası** — Panelin kendisi önizlemedir; her değişiklik sağ alttaki panelde anında
  görünür. Türkçe, İngilizce ve Rusça.

## Kurulum (geliştirici modu)

1. Bu depoyu indir ya da klonla.
2. Chrome'da `chrome://extensions` sayfasını aç ve sağ üstten **Geliştirici modu**nu aç.
3. **Paketlenmemiş öğe yükle** ile bu klasörü seç.

## Kısayollar

| Kısayol | İşlev |
|---|---|
| Alt + ↑ / ↓ | Sayfa yukarı / aşağı |
| Ctrl + Alt + ↑ / ↓ | En üst / en alt |
| Alt + S | Otomatik kaydırma (+ / − hız, Esc durdurur) |
| Alt + tık | Yer imi ekle |
| Alt + Shift + N | Paneli bu sitede göster / gizle |
| Alt + Shift + T | Bu sitede tema: Aydınlık → Karanlık → Sistem |

## Klasör yapısı

| Dosya | Görev |
|---|---|
| `manifest.json` | Manifest V3 yapılandırması |
| `background.js` | Kısayollar, sekme rozeti, ayar geçişi |
| `dark.js` | Akıllı karartma (sayfa yüklenmeden çalışır) |
| `content.js` | Sayfa içi panel ve gezinme |
| `shared.js` | Ortak yardımcılar, panel ikonları ve CSS'i |
| `popup.html` / `popup.js` | Eklenti balonu |
| `options.html` / `options.js` | Ayarlar sayfası |
| `_locales/` | Çeviriler (tr, en, ru) |
| `AGENTS.md` | Geliştirici notları |
| `YAPILACAKLAR.md` | Planlanan iyileştirmeler |

## Lisans

Copyright © 2026 LikaGroup (Sedat Alaca-LikaPulse)

Bu program özgür yazılımdır: **GNU Genel Kamu Lisansı sürüm 3** (GPL-3.0-or-later) koşulları altında
yeniden dağıtabilir ve/veya değiştirebilirsiniz. Değiştirilmiş sürümlerin de aynı lisansla açık
kaynak olarak dağıtılması ve özgün yazarın belirtilmesi gerekir. Ayrıntılar için [LICENSE](LICENSE).

---

### English

**Smart Nav Panel** is a Chrome extension that adds a compact, design-aware navigation panel to every
site: reading progress, heading navigator, bookmarks, auto-scroll and a smart dark mode that paints
only light surfaces and respects a site's own dark theme. Load it unpacked from `chrome://extensions`
(Developer mode → Load unpacked). Licensed under GPL-3.0-or-later. Copyright © 2026 LikaGroup (Sedat Alaca-LikaPulse).
