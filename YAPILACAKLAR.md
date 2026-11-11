# Yapılacaklar

Planlanan ve tamamlanan iyileştirmeler.

## Bekleyenler

### 1. "Bu sitede çalışsın" varsayılan olarak kapalı gelsin
Popup'taki **"Bu sitede çalışsın — Panel, kısayollar ve karartma"** anahtarı web sitelerinde
varsayılan olarak açık gelmeyecek. Eklenti bir sitede ancak kullanıcı bu anahtarı açınca çalışacak
(panel, klavye kısayolları ve karartma). Şu an `enableAllSites` varsayılanı `true`
(content.js, options.js, popup.js); `false` yapılıp ayarlar sayfasında "Tüm sitelerde çalışsın"
seçeneği isteğe bağlı bırakılacak. Mevcut kullanıcıların kayıtlı tercihi bozulmamalı.

## Tamamlananlar
- **Açık mavi ve sarı tonlara örtü:** Belli bir açıklığın üstündeki mavi/sarı zeminler (bilgi kutusu,
  uyarı şeridi) aynı tonda koyulaşır; doygun orta tonlu düğmeler ve küçük öğeler korunur. Ayarlar →
  Karartma'da açılıp kapatılabilir, eşik seçilebilir (`smartTint`, `smartTintThreshold`).
- **Gömülü video / modal arka planı:** Ekranı kaplayan koyu yarı saydam örtüler (backdrop, overlay,
  ışık kutusu) sayfanın zemini sayılmaz; modal açıkken karartma kararı değişmez.
- **Kartlarda üzerine gelince ışık efekti:** Sitenin kendi hover gölgesi (kart çevresindeki hale) koyu
  renkli olduğu için karanlıkta görünmüyordu; aynı kuralın açık renkli eşi üretilir, efekt karanlıkta da
  görünür. Koyu örtü artık `box-shadow` ile verilmediği için sitenin gölgesi de bastırılmaz.
- **Gecikmeli örtüler:** Resimli/gradyanlı büyük alanlar (kahraman bölümü, afiş) ilk geçişte ölçülür;
  kaydırırken de tarama yapılır; modal açıkken ekranın geri kalanı atlanmaz.
- **Renkli büyük şeritler:** Sayfa genişliğindeki canlı renkli menü çubukları ve bölüm bantları tonu
  korunarak koyulaşır; eşik ayarlardan seçilir. Açılır menülerin açık "üzerine gelince" zemini de koyulaşır.
- **Ayarlar sayfasının sağ tarafı:** Geniş ekranda (≥1360 px) sağda bölüm ipucu, durum özeti ve
  kısayol kartı gösterilir.

