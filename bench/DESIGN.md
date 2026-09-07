# Deney Tasarımı — Açık Soru #2

> **Sınanan sav:** Üreten ile denetleyen farklı sağlayıcı olduğunda, aynı
> sağlayıcıyla denetime kıyasla daha çok *gerçek* kusur yakalanır.

Bu, `PHILOSOPHY.md`'nin 3. ilkesi ve projenin merkezi tezi. Olumsuz çıkarsa
Skein'in var olma sebebi ortadan kalkar. Bu yüzden önce bu sınanıyor —
merkeze, kuyruğa, worktree'ye, yürütücüye gerek yok.

---

## Naif tasarımın ölümcül hatası

`ROADMAP.md` deneyi şöyle tarif ediyor: *"aynı görev setini hem çapraz hem
aynı sağlayıcıyla denetimden geçirip bulgu sayısını karşılaştırmak."*

Düz okunduğunda bu iki hücre demek:

```
A üretir → A denetler        (aynı)
A üretir → B denetler        (çapraz)
```

Çapraz hücre daha çok bulgu verirse bunu **çeşitliliğe** yorarsın. Ama başka
bir açıklama daha var ve en az onun kadar olası: **B basitçe daha iyi bir
denetçidir.** İki hücreli tasarım, "çeşitlilik etkisi" ile "denetçi gücü"nü
birbirinden ayıramaz. Confounded — ve yanlış cevap, projeyi yanlış temele
oturtur.

## 2×2 çapraz tasarım

Her iki model **hem üretir hem denetler**:

|  | **A denetler** | **B denetler** |
|---|---|---|
| **A üretir** | `AA` · aynı | `AB` · çapraz |
| **B üretir** | `BA` · çapraz | `BB` · aynı |

Bu klasik bir 2×2 faktöriyel kurgu. Üç etki ayrı ayrı okunabilir:

| Etki | Hesap | Ne söyler |
|---|---|---|
| Denetçi gücü | `(AA+BA)` vs `(AB+BB)` | Hangi model daha iyi denetçi |
| Üretim zorluğu | `(AA+AB)` vs `(BA+BB)` | Hangi model daha kusurlu kod yazıyor |
| **Çeşitlilik** | `(AB+BA) − (AA+BB)` | **Tezin cevabı** |

Çeşitlilik, faktöriyelin **etkileşim terimi**dir ve iki ana etkiye
diktir — yani "B daha iyi denetçi" ya da "A daha kusurlu yazıyor"
doğru olsa bile çeşitlilik ölçümünü kirletmez. Naif tasarımın çözemediği
şey tam olarak budur.

## Kusurlar üreticinin kendi hatası olmalı

Elle tohumlanmış hata (seeded bug) bu deneyde **işe yaramaz**. Tez, modelin
*kendi kör noktası* hakkında: bir model kendi çıktısını denetlerken kendi
varsayımını ikinci kez yapar. İnsanın koyduğu bir hata her iki denetçiye de
eşit derecede yabancıdır — kör nokta hakkında hiçbir şey ölçmez.

Bu yüzden: model görevi gerçekten çözer, kusurlar onun doğal hatalarıdır.

## Yer gerçeği — iki katman, harmanlanmaz

Doğal kusurun bedeli, yer gerçeğinin bedava gelmemesi. İki katman:

**1. Nesnel katman — gizli testler.** Her görevin, üreticinin *hiç görmediği*
bir test seti var. Üretim bittikten sonra çalıştırılır. Kırmızı gizli test =
kanıtlanmış fonksiyonel kusur. Bir bulgu, kırmızı bir testin sebebini
işaret ediyorsa doğru pozitiftir. Tartışmaya kapalı.

**2. Hakem katmanı — üçüncü model.** Gizli testin göremediği bulgular
(tasarım, güvenlik, kaynak sızıntısı, eşzamanlılık) için. Hakem **ne A ne
B**'dir; bulgular karıştırılır ve sağlayıcı bilgisi silinir — hakem hangi
hücreden geldiğini bilmez. Puanlama: gerçek / nit / yanlış pozitif.

İki katman **ayrı raporlanır**. Nesnel katman tek başına da bir cevap verir;
hakem katmanı zenginleştirir ama itiraz edilebilir. Birleştirilmiş tek bir
"bulgu skoru", zayıf katmanın gücünü güçlü katmandan ödünç alır.

## Eşleşmeli karşılaştırma

Üretim (task, üretici) başına **bir kez** koşulur; o tek artefakt **iki
denetçiye birden** verilir. Yani `AA` ile `AB` **aynı kodu** inceler.

Bu, üretim varyansını denklemden çıkarır: iki denetçi arasındaki fark
kodun kendisinden gelemez. Bağımsız üretimlerle karşılaştırma yapmak,
model stokastikliğini çeşitlilik etkisi sanmakla sonuçlanırdı.

```
üretim koşusu  = görev × 2 üretici
denetim koşusu = görev × 2 üretici × 2 denetçi   (aynı artefakt üzerinde)
```

## Denetim promptu dört hücrede birebir aynı

Sağlayıcıya göre prompt uyarlamak, ölçtüğün şeyi sessizce prompt kalitesine
çevirir. Adaptör yalnızca **çağrı biçimini** kapsüller — `CONTRACT.md` zaten
bunu söylüyor. Prompt çekirdeğe aittir.

## Metrikler

| Metrik | Ne söyler |
|---|---|
| **Kaçırma** — kırmızı olduğu halde hiçbir bulguyla eşleşmemiş gizli test | Kör noktanın doğrudan ölçüsü. Tezin en keskin kanıtı: `AA`'da kaçırılıp `AB`'de yakalanan kusur. |
| Doğru pozitif (nesnel) | Kırmızı teste bağlanan bulgu sayısı |
| Yanlış pozitif oranı | Denetçi uyduruyor mu |
| Nit oranı | Gürültü. Pratikte kapıyı işlevsiz kılan şey bu; yüksek nit oranı yüksek bulgu sayısını değersizleştirir. |
| Süre ve token maliyeti | Açık Soru #4'e girdi |

Ana metrik **kaçırma azalması**dır, ham bulgu sayısı değil. Bulgu saymak
gevezeliği ödüllendirir.

## Örneklem ve tekrar

LLM çıktısı stokastik; tek koşuluk fark gürültü olabilir.

```
12 görev × 2 üretici           =  24 artefakt
24 artefakt × 2 denetçi        =  48 denetim  (k=1)
k=3 tekrar                     = 144 denetim
```

`k=1` ile başlanır (koşum takımını sağlamlaştırmak için), sonuç için `k=3`.

## Önceden ilan edilen karar kuralı

Sonucu gördükten sonra eşik belirlemek, deneyi süse çevirir. Şimdiden:

- **Çeşitlilik etkisi**, kaçırma oranında **≥ %20 göreli azalma** ise ve
  tekrarlar arası varyansın dışındaysa → Açık Soru #2 **olumlu**. Yol
  haritası devam eder.
- **< %10** ya da gürültünün içinde → Açık Soru #2 **olumsuz**. `PHILOSOPHY.md`
  3. ilkesi değişir; çoklu sağlayıcı bir *kalite mekanizması* değil, olsa
  olsa bir *dayanıklılık/maliyet* özelliğidir ve proje ona göre yeniden
  çerçevelenir.
- Arada → k artırılır, görev seti genişletilir.

## Bilinen sınırlar

- **Görev dili TypeScript.** Koşum takımı ile aynı ekosistem olduğu için
  gizli testler ucuz. Kör nokta dile göre değişebilir; `java-kit`'in hedef
  kitlesi Java. Görev formatı dil-agnostik tutuluyor (`run` komutu görevden
  gelir), ama ilk set TS.
- **İki sağlayıcı.** Üç ve fazlası için tasarım genelleşir (n×n), ama ilk
  cevap için 2×2 yeterli.
- **Hakem katmanı bir modeldir.** Kendi yanlılığı vardır. Nesnel katmanın
  ayrı raporlanmasının sebebi bu.
- **Görev seti küçük.** 12 görev, dar bir kod evreni. Sonuç "bu tür
  görevlerde" der, "her yerde" demez.

---

## Görev formatı

```
bench/tasks/<id>/
  task.yaml          # kimlik + gizli test komutu
  spec.md            # üreticinin göreceği TEK dosya
  hidden/            # gizli testler — üretici asla görmez
```

```yaml
id: retry-backoff        # dizin adıyla birebir aynı olmalı
title: Üstel geri çekilmeli yeniden deneme
language: ts
spec: spec.md            # üreticiye verilecek dosya
entry: src/retry.ts      # üreticinin yazması beklenen dosya
hidden:
  command: ["npx", "vitest", "run", "--reporter=json", "--dir", "."]
  cwd: hidden            # opsiyonel; varsayılan hidden/
```

Yükleyici (`src/bench/task.ts`) şunları **akış başlamadan** reddeder:

| Kural | Neden |
|---|---|
| `id` ≠ dizin adı | Sonuçlar yanlış göreve yazılır |
| `spec` dosyası yok | Üretici boş prompt alır |
| `spec` ya da `entry` → `hidden/` | **Yer gerçeği çöker** — üretici testi görürse deney biter |
| `entry` mutlak ya da `../` | Görev dizininden kaçış |
| `hidden/` yok | Ölçülecek yer gerçeği yok |
| `hidden.command` boş | Gizli test koşulamaz |

Her gizli `it` bloğu **bir kusur kancası**dır. Kırmızıysa kanıtlanmış bir
hata var demektir; "kaçırma" metriği kırmızı olup hiçbir bulguyla
eşleşmeyen blokları sayar. Bu yüzden test adları kusuru tarif eder
("son başarısız denemeden sonra beklemez"), numara vermez.

## İlk koşudan gelen bulgu: görev zorluğu kalibre edilmeli

İlk gerçek koşu (`claude-opus-5`, `retry-backoff`, 11.8s, $0.059):
**9 kancadan 9'u yeşil, 0 kırmızı.**

Bu, koşum takımı için iyi haber ama **deney için bir sorun**. Sıfır kusur
demek, denetçiye yakalayacak bir şey olmaması demek: bu görev dört hücrede de
aynı sonucu verir ve çeşitlilik etkisine hiç katkı yapmaz. Ölçüm gücü sıfır.

Bu, `bench/DESIGN.md`'nin baştan söylediği "kusurlar üreticinin kendi doğal
hatası olmalı" ilkesinin faturası: doğal kusuru sipariş edemezsin. Görev
yeterince zor değilse doğal kusur oluşmaz.

**Sonuç — görev setine bir kabul ölçütü ekleniyor.** Bir görev sete ancak
kalibrasyon koşusunu geçerse girer:

| Ölçüt | Neden |
|---|---|
| Her iki üreticide de **en az bir kırmızı kanca**, k=3 koşunun çoğunluğunda | Kusursuz çözülen görev denetimi ölçemez |
| Kancaların **hepsi kırmızı değil** | Model görevi hiç anlamadıysa ölçtüğün şey denetim değil, anlaşılmazlık |
| Kırmızı kancalar koşular arası **tamamen rastgele değil** | Tümüyle stokastik kusur, kör nokta değil gürültüdür |

Kalibrasyondan geçemeyen görev ya zorlaştırılır ya setten çıkarılır.
`retry-backoff` mevcut haliyle **geçemedi**; ya sınır durumları artırılmalı
(eşzamanlı çağrı, iptal, jitter, saat geri sarması) ya da yerine daha zor
bir görev konmalı.

Bu ölçüt neden önemli: kalibre edilmemiş 12 görevle koşulan bir deney,
"çapraz sağlayıcı fark yaratmıyor" sonucunu **görevler kolay olduğu için**
üretir ve tez haksız yere reddedilir. Kalibrasyon, deneyin ana etki
ölçebilmesinin ön koşulu.

## Durum

- [x] Tasarım — 2×2 çapraz kurgu, iki katmanlı yer gerçeği, karar kuralı
- [x] Adaptör sözleşmesi + kayıt (`src/adapters/`)
- [x] Görev formatı + katı yükleyici (`src/bench/`)
- [x] Örnek görev — `retry-backoff` (9 kusur kancası)
- [x] Sağlayıcı adaptörü — `claude` CLI, headless, bayrakları doğrulanmış
- [x] Üretim koşucusu (artefakt üretimi, gizli testleri izole tutma)
- [x] Gizli test çalıştırıcı + JSON çıktı ayrıştırma (test bazlı yeşil/kırmızı)
- [x] **İlk uçtan uca koşu** — gerçek ajan, gerçek artefakt, gerçek sayı
- [ ] Görev zorluk kalibrasyonu (yukarıdaki ölçüt) — `retry-backoff` geçemedi
- [ ] Denetim koşucusu (aynı artefakt → iki denetçi)
- [ ] Hakem katmanı (körlenmiş puanlama)
- [ ] Kalan 11 görev
- [ ] Rapor: hücre tablosu + etkileşim terimi
