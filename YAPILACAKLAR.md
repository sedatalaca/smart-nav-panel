# Yapılacaklar

Akıllı boyama (karanlık mod) için not edilen iyileştirmeler. Henüz uygulanmadı.

## 1. Açık mavi ve sarı tonlara da örtü
Şu an renkli düz zeminler yalnız çok açık (pastel, bağıl parlaklık %70 üstü) ve büyükse örtülüyor.
Mavi ve sarı tonlarda belli bir açıklığa kadar olan zeminlere de koyu örtü uygulanacak
(ör. açık mavi bilgi kutuları, sarı uyarı şeritleri). Doygun, orta tonlu düğmeler yine korunacak.
Ton aralığı ve eşik ayarlardan seçilebilir olabilir.

## 2. Gömülü video açılınca arka plan
Sayfada bir video penceresi (ör. YouTube gömmesi, ışık kutusu / modal) açıldığında arkada kalan
koyu yarı saydam örtü, akıllı boyama tarafından "açık alan" sanılıp geri çevrilmeye çalışılıyor.
Zaten koyu olan bu tür örtüler (modal arka planı, `backdrop`, yarı saydam siyah katmanlar) tanınıp
olduğu gibi bırakılacak.

## 3. Kartlarda üzerine gelince ışık efekti
Bazı sitelerde kartların üzerine gelince arkasında hafif bir ışık hüzmesi / parlama (gölge, kenar
parlaması) oluşuyor ve kart daha iyi ayırt ediliyor. Akıllı boyamada koyulaştırılan kartlarda da
aynı etki görülebilmeli: karartma sitenin `:hover` gölgesini ve parlamasını bastırmamalı, gerekirse
koyu temaya uygun bir kenar parlaması eklenmeli.

## 4. Ayarlar sayfasının sağ tarafı
Geniş ekranda ayarlar sayfasının sağ tarafı çok boş kalıyor. Bu alan değerlendirilecek
(ör. seçili bölüme göre ipuçları, bu sitedeki durum özeti, kısayol kartı ya da hızlı ayarlar).
