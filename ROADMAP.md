# Murmuration — Yol Haritası

Aşamalar **risk azaltma sırasına** göre dizildi, özellik sırasına göre değil.
Her aşama tek başına değer üretir ve bir sonrakinin en büyük belirsizliğini
kaldırır. Bir aşama olumsuz sonuç verirse orada durulur — sonraki aşamalar
zaten o varsayımın üstüne kuruluydu.

Sıra şu mantıkla: **en ucuz deney, en riskli varsayımı önce sınar.**

---

## Aşama 0 — Temel · ✅ tamam

Felsefenin ve kapsamın yazılı olması.

- `PHILOSOPHY.md` — ilkeler, reddedilenler, açık sorular
- `ROADMAP.md` — bu dosya
- `hub/flows/daily.yaml` — akış tanımı şeması taslağı
- `hub/adapters/CONTRACT.md` — sağlayıcı sözleşmesi taslağı
- `java-kit/` — SwarmForge'a uyarlanmış Java rol/kural seti (referans ve
  prompt kaynağı olarak taşınıyor)

**Biter kriteri:** Ne inşa ettiğimiz ve neyi inşa etmediğimiz yazılı.

---

## Aşama 1 — Audit gate, tek başına

**Sınadığı varsayım:** Açık Soru #1 — mekanik sürtünme ajanın çıktısını
gerçekten iyileştiriyor mu?

Projenin en özgün fikri bu ve en ucuz şekilde tek başına test edilebilir.
Merkeze, akışa, worktree'ye, çoklu sağlayıcıya gerek yok.

**Kapsam:**
- Dil ve platform bağımsız tek bir bileşen (~150 satır)
- Parmak izi: görev + alıcı + commit + taslak içeriği
- Kilitli durum dosyası; ilk çağrı reddedilir, değişmemiş ikinci çağrı geçer
- Denetim sırasında commit atılırsa yeni tur
- Her turu olay olarak kaydet

**Nasıl denenecek:** Mevcut tek-ajanlı iş akışında, ajan "bitti" dediğinde
tetiklenen bir adım olarak. Merkez kurulmadan işe yarar.

**Biter kriteri:** Bir hafta gerçek görevlerde kullanıldı; denetim turlarında
yapılan düzeltmeler kayıt altında. Düzeltme oranı anlamlıysa devam; sıfıra
yakınsa mekanizma yeniden düşünülür.

---

## Aşama 2 — Handoff çekirdeği

**Sınadığı varsayım:** Dosya tabanlı, durumsuz devir teslim, ajan
değişikliğine ve yeniden başlatmaya gerçekten dayanıyor mu?

Henüz ajan çağrısı yok — elle test edilir. Bu kasıtlı: taşıma katmanı,
üstünde çalışan ajanlardan bağımsız olarak doğru olmalı.

**Kapsam:**
- Dosya tabanlı kuyruk: `outbox` / `inbox` / `sent` / `failed`
- Yapılandırılmış mesaj doğrulama (dar tip kümesi, katı alan kontrolü)
- Commit çözümleme ve soy doğrulaması
- Yinelenen devir teslim tespiti
- `flows/*.yaml` yükleyici: roller, ileri yön, `syncBack`, kapılar
- Rol başına git worktree hazırlama

**Biter kriteri:** İki "sahte rol" arasında elle devir teslim yapılabiliyor;
süreç yarıda kesilip yeniden başlatıldığında iş kaybolmuyor.

---

## Aşama 3 — Sağlayıcı adaptörleri + yürütücü · **ilk uçtan uca**

**Sınadığı varsayım:** Açık Soru #2 — çapraz sağlayıcı denetimi, aynı
sağlayıcıyla denetimden daha çok bulgu yakalıyor mu? Projenin merkezi tezi.

**Kapsam:**
- `CONTRACT.md`'yi uygulayan iki adaptör, headless çağrı
  (her sağlayıcının bayrakları kendi dokümanından doğrulanarak)
- Gözcü döngüsü: kuyrukta iş varsa ajanı çağır, çıkışı bekle
- Olay günlüğü: rol, sağlayıcı, görev, exit code, süre, usage
- Aşama 1'in audit gate'i devrede

**Biter kriteri:** Gerçek bir görev, gerçek bir repoda, `coder(A) →
reviewer(B)` akışından geçip Done'a ulaşıyor. Ve karşılaştırma deneyi
çalıştırılabiliyor: aynı görev seti hem çapraz hem aynı sağlayıcıyla.

**Bu aşama bittiğinde elde olan:** Bir görevi bir sağlayıcı yazıyor, başkası
denetliyor, ikisi de "bitti" demeden önce kendi işini yeniden denetlemek
zorunda, ve her adım ölçülü. Felsefenin tamamı çalışır halde.

---

## Aşama 4 — İnsan kapıları

**Sınadığı varsayım:** İnsan kapısı, doğru noktada mı duruyor? Çok sık duran
bir akış terk edilir; hiç durmayan akış güven vermez.

**Kapsam:**
- Onay bekleyen kuyruğu; onaylanana kadar teslim yok
- Onay / red; red edilen iş göndericiye geri döner
- Kapı konumu akış tanımından okunur (rol adına gömülü değil)
- Önce CLI, UI sonra

**Biter kriteri:** Spec kapılı bir akış (`specifier → coder → reviewer`) uçtan
uca çalışıyor; kapı sayısı ve bekleme süresi ölçülüyor.

---

## Aşama 5 — Görünürlük

**Sınadığı varsayım:** Açık Soru #4 — maliyet karşılığını veriyor mu?
Cevaplayabilmek için veriyi görebilmek gerek.

**Kapsam:**
- Board: hangi iş hangi rolde
- Olay günlüğü görünümü: ajan çağrıları, süre, maliyet, audit tur sayısı
- Canlı ajan çıktısı (kazıma değil, süreç stdout'u)
- Web arayüzü

**Biter kriteri:** "Bu görev bana neye mal oldu ve kaç bulgu yakalandı"
sorusu arayüzden cevaplanabiliyor.

---

## Aşama 6 — Esneklik

Buraya ancak Açık Sorular olumlu cevaplanırsa gelinir.

- Birden fazla eşzamanlı akış
- Akış editörü
- Çoklu proje
- Yeni sağlayıcı adaptörleri
- Daha uzun topolojiler (spec / mimari / güvenlik rolleri)

---

## Ölçüm

Aşama 3'ten itibaren her ajan çağrısı kaydedilir. Takip edilen metrikler:

| Metrik | Ne söyler |
|---|---|
| Görev başına audit turu | Yüksek = ajan zorlanıyor ya da görev belirsiz |
| Denetim turunda yapılan düzeltme oranı | Açık Soru #1'in cevabı |
| Denetleyicinin yakaladığı bulgu (çapraz vs aynı sağlayıcı) | Açık Soru #2'nin cevabı — merkezi tez |
| Devir teslim reddi oranı | Doğrulama katmanı çok mu katı |
| İnsan müdahalesi sayısı | Kapılar doğru yerde mi |
| Görev başına süre ve maliyet | Açık Soru #4'ün cevabı |

---

## Şu anki durum

**Aşama 0 tamam.** Sıradaki: Aşama 1 — audit gate.
