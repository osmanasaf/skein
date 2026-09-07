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

## İlk koşulardan gelen bulgu: k=1 sonuç vermez

`claude-opus-5`, `retry-backoff`, dört koşu:

| Koşu | Sonuç | Kırmızı kanca |
|---|---|---|
| 1 | 9/9 yeşil | — |
| 2 | 8/9 | `attempts < 1 ise RangeError` |
| 3 | 8/9 | `attempts < 1 ise RangeError` |
| 4 | 8/9 | `attempts < 1 ise RangeError` |

**İlk koşuya bakıp "bu görev çok kolay, kusur üretmiyor" diye yazmıştım.
Yanlıştı.** Dört koşunun üçünde *aynı* kanca kırmızı — gürültü değil,
tekrarlanabilir bir kusur.

Kusurun kendisi: üç koşuda da model `export function retry` yazdı,
`async` değil. `attempts < 1` kontrolü `RangeError`'ı **senkron** fırlatıyor,
oysa imza `Promise<T>` dönmeyi taahhüt ediyor. `retry(...).catch(...)` yazan
bir çağıran, yakalanmamış bir istisna alır. Gerçek bir hata sınıfı —
async görünümlü bir API'de senkron fırlatma — ve denetim deneyi için iyi bir
hedef: denetçi bunu yakalayacak mı?

Bu olay tasarımın kendi kuralını deneysel olarak doğruladı: "LLM çıktısı
stokastik; tek koşuluk fark gürültü olabilir" diye yazmıştık, sonra tek
koşudan sonuç çıkardım. **k≥3 bir öneri değil, ön koşul.**

### Görev seti kabul ölçütü

Bir görev sete ancak kalibrasyon koşusunu geçerse girer:

| Ölçüt | Neden |
|---|---|
| Her iki üreticide de **en az bir kırmızı kanca**, k=3 koşunun çoğunluğunda | Kusursuz çözülen görev denetimi ölçemez |
| Kancaların **hepsi kırmızı değil** | Model görevi hiç anlamadıysa ölçtüğün şey denetim değil, anlaşılmazlık |
| Kırmızı kancalar koşular arası **tamamen rastgele değil** | Tümüyle stokastik kusur, kör nokta değil gürültüdür |

`retry-backoff` bu ölçütün üçünü de `claude-opus-5` tarafında karşılıyor
(3/4 koşuda aynı kanca, 8/9 yeşil). İkinci üretici gelince tekrarlanacak.

Ölçüt neden önemli: kalibre edilmemiş görevlerle koşulan bir deney,
"çapraz sağlayıcı fark yaratmıyor" sonucunu **görevler kolay olduğu için**
üretir ve tez haksız yere reddedilir.

## Audit gate — ilk ölçüm (Açık Soru #1)

Roadmap'in ölçütü ("denetim turunda yapılan düzeltme oranı") kendi kendini
çürütüyordu: kapının geçme koşulu *hiçbir şeyin değişmediği bir tur* olduğu
için mekanizma düzeltme **yapmayan** ajanı ödüllendirir. Ölçüt bir **sonuç**
ölçüsüyle değiştirildi: kapılı ve kapısız koşuların kırmızı kanca sayısı.

`claude-opus-5`, `retry-backoff`:

| Koşu | Kapı | Tur | Düzeltme | Sonuç | Toplam |
|---|---|---:|---:|---:|---:|
| 18-40-35 | kapısız | — | — | 8/9 | $0.0599 |
| 18-41-12 | kapısız | — | — | 8/9 | $0.0600 |
| 18-41-26 | kapısız | — | — | 8/9 | $0.0611 |
| 18-47-41 | **kapılı** | 3 | 1 | **9/9** | $0.5913 |
| 18-49-59 | **kapılı** | 3 | 1 | **9/9** | $0.7011 |
| 18-52-45 | **kapılı** | 2 | 0 | **9/9** | $0.3160 |

```
kapısız : ortalama 1.00 kırmızı  ·  $0.0603
kapılı  : ortalama 0.00 kırmızı  ·  $0.5361      (8.9x maliyet)
```

### Mekanizma izi — sayıdan daha güçlü kanıt

Kusur her koşuda aynı: model `retry`'yi `async` yazmıyor, `RangeError`
senkron fırlıyor, imza `Promise<T>` taahhüt ediyor.

| | İmza |
|---|---|
| kapısız, 3/3 koşu | `export function retry` ← kusur var |
| kapılı, 3/3 koşu | `export async function retry` ← kusur yok |

İki kapılı koşuda ajan denetim turunda **gerçekten bir düzeltme yaptı**
(`degisti` → yeni tur → `degismedi` → kabul) ve kusur ortadan kalktı.
Bu, "ajan komutu ikinci kez çalıştırıyor" alternatifini bu iki vaka için
eler: parmak izi değişti, yani iş değişti.

### Ne demiyoruz

- **n=3'e 3.** Bu bir eğilim, cevap değil.
- **Üçüncü kapılı koşuda düzeltme yapılmadı** (0 tur değişiklik) ve yine de
  9/9 çıktı — yani o koşunun üretimi zaten temizdi ve 9/9'u kapı sağlamadı.
  Kapı, kusurun *bulunduğu* iki vakanın ikisinde de düzeltti; bulunmadığı
  vakada bir şey yapmadı. Doğru okuma bu.
- **Tek görev, tek sağlayıcı, tek kusur türü.** Genelleme yok.
- **Maliyet 8.9x** ve denetim turları üretimin kendisinden ~9 kat pahalı.
  Açık Soru #4 için ciddi bir veri: sürtünme ucuz değil.

### Bulunan tasarım boşluğu

"Denetim turunda tam olarak ne değişti" sorusunu **son artefakta bakarak
çıkarsamak** zorunda kaldık; kapı turlar arasında anlık görüntü tutmuyor.
Parmak izi değişikliği yakalıyor ama **neyin** değiştiğini söylemiyor.
Açık Soru #1'i ciddi ölçmek için tur başına artefakt anlık görüntüsü
gerekiyor. Sıradaki iş.

## 2x2 boru hattı — kuruldu ve koştu

Dört hücrenin tamamı gerçek modellerle koştu (`claude-opus-5` × `claude-sonnet-5`,
$0.9278). Denetim koşucusunun taşıdığı iki geçerlilik kuralı testle sabitlendi:
denetçiye kodu kimin yazdığı **söylenmiyor**, ve denetim üretim konuşmasının
devamı değil, **taze süreç**. İkincisi, felsefenin 1. ilkesinin ("durum ajanın
dışında") deneyin geçerlilik koşulu olarak iş görmesi.

**Satıcı değil, model çeşitliliği.** Elde tek satıcı olduğu için 2x2'nin iki
köşesi aynı ailenin iki modeli. Bu tezin **daha zor** hali: aynı eğitim
soyundan gelen iki model kör noktalarını daha çok paylaşır, yani burada etki
çıkarsa çapraz satıcıda en az o kadar çıkar. Tersi geçerli değil — burada etki
çıkmaması çapraz satıcıyı elemez.

### Koşu ölçüm üretmedi — ve sebebi kayıtlı

Bu koşuda **iki üretici de 9/9 yeşil** çıktı. Kanıtlanmış kusur yoksa
denetçiye yakalanacak bir şey yok; dört hücre de aynı sonucu verir ve
kaçırma metriği hesaplanamaz. Ölçüm gücü sıfır.

Bu, kalibrasyon ölçütünün neden var olduğunun canlı örneği. `retry-backoff`
kusuru **bazen** üretiyor (kapısız 3/4 koşuda çıkmıştı, bu koşuda hiç
çıkmadı). Stokastik olarak temiz çıkan bir görev, deneyi ölçümsüz bırakır.

**Darboğaz artık görev seti.** Boru hattı bitti; eksik olan, kusuru
güvenilir biçimde üreten kalibre edilmiş görevler.

### Yan gözlem: denetçiler kodun diskte olmadığını fark ediyor

İki rapor "kod diskte yok, çalışma dizini boş" diye not düştü. Kod kasıtlı
olarak yalnızca `taskText` içinde veriliyor (denetçi düzeltmesin diye), ama
bu rapora gürültü olarak sızıyor. Denetçiye salt-okunur bir kopya vermek
düşünülmeli.

## Durum

- [x] Tasarım — 2×2 çapraz kurgu, iki katmanlı yer gerçeği, karar kuralı
- [x] Adaptör sözleşmesi + kayıt (`src/adapters/`)
- [x] Görev formatı + katı yükleyici (`src/bench/`)
- [x] Örnek görev — `retry-backoff` (9 kusur kancası)
- [x] Sağlayıcı adaptörü — `claude` CLI, headless, bayrakları doğrulanmış
- [x] Üretim koşucusu (artefakt üretimi, gizli testleri izole tutma)
- [x] Gizli test çalıştırıcı + JSON çıktı ayrıştırma (test bazlı yeşil/kırmızı)
- [x] **İlk uçtan uca koşu** — gerçek ajan, gerçek artefakt, gerçek sayı
- [x] Olay günlüğü — yalnızca-ekleme JSONL, katı doğrulama, özet görünümü
- [x] Audit gate — parmak izi, kilitli durum, tur sayacı, üst sınır
- [ ] Tur başına artefakt anlık görüntüsü (yukarıdaki boşluk)
- [ ] Görev zorluk kalibrasyonu — `retry-backoff` tek üreticide geçti,
      ikinci üretici bekliyor
- [x] Denetim koşucusu (aynı artefakt → iki denetçi), 2x2 orkestrasyonu
- [ ] Hakem katmanı (körlenmiş puanlama)
- [ ] Kalan 11 görev — **darboğaz burası**: kusuru güvenilir üreten kalibre görevler
- [ ] Rapor: hücre tablosu + etkileşim terimi
