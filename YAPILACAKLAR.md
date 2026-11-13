# Yapılacaklar

Planlanan ve tamamlanan iyileştirmeler.

## Bekleyenler

Şu an bekleyen iş yok.

## Tamamlananlar
- **Sitelerde varsayılan olarak kapalı:** Eklenti yalnız popup'taki "Bu sitede çalışsın" ile açılan
  sitelerde çalışır (panel, kısayollar, karartma). Eski kurulumlar bir kez kapalıya geçirilir; açılmış siteler korunur.
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

