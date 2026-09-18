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

## Puanlama körlenmiş ve makineyle doğrulanabilir

> **Bu, yukarıdaki 2. katman değildir.** Yazılan şey **1. (nesnel)
> katmanın okuyucusu**: raporu kırmızı gizli testlere karşı eşleştirir.
> 2. katman ayrıca yazıldı (aşağıda) ve ayrı raporlanıyor — iki katman
> harmanlanmaz.

Ana metrik ("kaçırma") rapor metninden okunur: kanıtlanmış kusuru rapor
söylüyor mu, söylemiyor mu. Bu okuma iki şekilde bozulabilir ve ikisi de
sonucu sessizce üretir:

1. **Körlenmemiş okuma.** Raporları deneyi yapan kişi okursa, hangi hücrenin
   çapraz olduğunu bilerek okur. Beklentinin lehine bir cümleyi "yakaladı"
   saymak için kötü niyet gerekmez.
2. **Doğrulanmamış hakem.** Puanlamayı bir modele yaptırmak birinciyi çözer
   ama yenisini açar: model, raporda olmayan bir cümleyi hatırladığını
   sanabilir ya da kusuru raporun yerine kendi bilgisinden tarif edebilir.

`src/bench/judge.ts` ikisini birden kapatıyor:

| Koruma | Nasıl |
|---|---|
| Körleme | Hakem kimin ürettiğini, kimin incelediğini ve hücrenin çapraz olup olmadığını görmez. Rapor metnindeki model/satıcı adları (`claude`, `gpt`, `haiku`, …) maskelenir ve kaç yerde maskelendiği kaydedilir |
| Kanıt zorunluluğu | "Yakalandı" diyen her karar, rapordan **birebir** bir alıntıya bağlı. Alıntı raporda bulunamazsa yakalama sayılmaz |
| Hakemin kendi sağlığı | Doğrulanamayan alıntılar ayrıca sayılır (`unverified`). Bu sayının yükselmesi, hakemin bozulduğunun göstergesi |
| Puanlanamayan ≠ kaçırılmış | Hakemin çıktısı ayrıştırılamazsa hücre ölçüm dışı kalır, kaçırma sayılmaz — gizli süitteki "ÖLÇÜLEMEDİ ≠ kusur yok" ayrımının puanlama tarafındaki karşılığı |

Puanlama `matrix`'ten ayrı bir komut (`cli.ts puanla`), çünkü denetim koşusu
zaten pahalı: ayrıştırma hatası yüzünden o parayı ikinci kez harcamamak
için puanlama tekrar edilebilir olmalı. Her karar `judge.scored` olayıyla
günlüğe düşer; sonuç, raporları okuyan kişinin belleğinde değil.

### Bunun ölçüme getirdiği yanlılık — ve neden sorun değil

Alıntı şartı **muhafazakâr**: kusuru doğru tarif edip de hakemin alıntıyı
beceremediği bir rapor, kaçırma sayılır. Yani ölçülen kaçırma oranı
gerçeğin üstünde olabilir.

Önemli olan, bu yanlılığın **dört hücrede de aynı** olması. Karşılaştırdığımız
şey hücreler arası fark; her hücreye eşit binen bir sapma farkı kaydırmaz.
Mutlak "kaçırma oranı %35" sayısı bu yüzden tek başına alıntılanmamalı.

### Karar kuralı artık kodda

`src/bench/effect.ts` eşikleri sabit tutuyor (%20 / %10) ve iki şeyi
makineye bağlıyor:

- **k < 3 iken karar yok.** Sayı gösterilir, "yetersiz" denir. Bu kural
  DESIGN'da zaten yazılıydı ve bir kez ihlal edildi (tek koşudan "bu görev
  kolay" sonucu çıkarılmıştı); artık ihlal edilemiyor.
- **"Varyansın dışında" şartının işletilebilir hâli:** azalmanın işareti her
  tekrarda aynı olmalı. Güven aralığı değil — havuzlanmış sayı eşiği geçse
  bile üç koşunun birinde etki ters yöndeyse karar "belirsiz" olur.

Etkileşim terimi ((AA+BB)/2 − (AB+BA)/2) yalnızca dört hücrenin dördü de
puanlanmışsa hesaplanır; eksik hücreyle hesaplanan "etkileşim", ana etkinin
kılık değiştirmiş hâlidir.

### Hakemin kendisi de bir sınır

Hakem bir model, ve tek satıcıyla koşulan bir deneyde denetçilerle aynı
aileden. İki koruma bunu tamamen kaldırmıyor, yalnızca zararını sınırlıyor:
alıntı doğrulaması hakemin uydurmasını eler, körleme hücre kimliğini eler.
Kalan risk, hakemin bir kusur sınıfını sistematik olarak tanımaması — bu da
dört hücreye eşit bineceği için farkı değil, düzeyi etkiler.

## 2. katman — bulgu sınıflaması (`siniflandir`)

Nesnel katman yalnızca **kanıtlanmış** kusurları görür: kırmızı gizli test.
Raporun geri kalanı — tasarım itirazı, sızıntı uyarısı, isim önerisi,
uydurulmuş iddia — o katmanda hiç sayılmaz. 2. katman orayı ölçer.

**Sınıflar:** `gercek` (doğru ve önemli), `nit` (doğru ama önemsiz),
`yanlis` (kodda karşılığı yok), `belirsiz` (hakem karar veremedi).

**1. katmandan üç şeyde bilerek ayrılıyor:**

| | 1. katman (`puanla`) | 2. katman (`siniflandir`) |
|---|---|---|
| Yer gerçeği | Kırmızı test — tartışmaya kapalı | Hakemin görüşü — itiraz edilebilir |
| Hakem kodu görür mü | Hayır, gerekmiyor | **Evet** — "bu iddianın karşılığı yok" ancak kod okunarak söylenir |
| Hücre şartı | Kanıtlanmış kusur **olmalı** | Kanıtlanmış kusur **aranmaz** |

Üçüncü satır ilk bakışta ters görünür ama sebebi net: kusursuz üretilmiş
kodun raporu nesnel katman için ölçüm gücü taşımaz (yakalanacak bir şey
yok), oysa gürültü ölçümü için en temiz örnektir — oradaki her bulgu ya nit
ya yanlış pozitiftir. O hücreleri atlamak, gürültü ölçümünü sistematik
olarak kusurlu kodlara daraltırdı.

**Kanıtlı bulgular oranların dışında.** Bir bulgu kırmızı bir kancayı tarif
ediyorsa `kanitli` işaretlenir ve 2. katmanın paydasına girmez. Girseydi
aynı bulgu iki katmanda birden puan üretir, "harmanlanmaz" kuralı sayıların
içinden delinirdi.

**Körleme koda da uygulanıyor.** Rapor gibi kod da model/satıcı adlarından
arındırılıyor: üretim ajanının yorum satırına bıraktığı bir imza, hakemin
körlüğünü rapor tarafından değil kod tarafından bozardı.

**Alıntı kuralı aynı, yönü farklı.** Alıntısı raporda bulunamayan bulgu
1. katmanda denetçinin ALEYHİNE sayılıyor (kaçırma); burada bulgunun
kendisi düşüyor ve ayrı sayılıyor. Uydurulmuş bir bulguyu "yanlış pozitif"
saymak, denetçiyi hakemin hatasıyla cezalandırmak olurdu.

### Bu katmanın bilinen sınırları

- **Bulgu sınırını hakem çiziyor.** "Kaç ayrı bulgu var" sorusunun cevabı
  hakemin okumasına bağlı; geveze bir rapor daha çok bulguya bölünebilir.
  Bu yüzden ana sayı **oran** (nit payı, yanlış payı), ham bulgu sayısı
  değil — ham sayı yine basılıyor ama yorumlanırken bu sınır hatırlanmalı.
- **Sınıflama bir model görüşü.** Aynı hakem dört hücrede de aynı olduğu
  için sapma farka değil düzeye biner; yine de mutlak oranlar tek başına
  alıntılanmamalı.
- **Karara girmez.** Açık Soru #2'nin kararı yalnızca nesnel katmandan
  okunur. Bu bir üslup tercihi değil, kodda sınanan bir özellik
  (`noise.test.ts`: sınıflama olayları eklendiğinde kararın ve sayıların
  değişmediği doğrulanıyor).

## Tur başına artefakt anlık görüntüsü

Ajan dosyayı **yerinde** değiştiriyor, yani bir turun sonundaki hâl bir
sonraki turda kayboluyordu. Koşu bittikten sonra elde yalnızca son artefakt
kalıyor ve "denetim turunda tam olarak ne değişti" sorusu ona bakıp
çıkarsanıyordu. Parmak izi (`audit/fingerprint.ts`) zaten "değişti mi"yi
söylüyordu; eksik olan **neye dönüştü**ydü.

Artık her tur, hücrenin altındaki `turlar/` dizinine kopyalanıyor:

```
<hücre>/turlar/00-tohum/      ajan koşmadan önceki hâl (seed ya da boş)
<hücre>/turlar/01-uretim/     üretim turunun sonucu
<hücre>/turlar/02-denetim-1/  kapının birinci turu
```

Okumak: `cli.ts turlar [hücre-parçası] [--diff]`.

**Üç karar:**

1. **Kopya, damganın yerine geçmez.** Damga "değişti mi"yi ucuza cevaplar,
   kopya "neye dönüştü"yü **sonradan** cevaplanabilir kılar. Yalnızca damga
   saklansaydı sınır kalkmazdı, yalnızca ölçülmüş olurdu.
2. **Tohum turu ayrı.** `seed/` verilen görevlerde ölçmek istediğimiz şey
   ajanın MEVCUT kodda neyi değiştirdiği; tohum turu olmadan bu fark yok.
3. **Anlık görüntü gizli testler kopyalanmadan ÖNCE alınır.** Sonra
   alınsaydı her üretim turu, ajanın hiç görmediği dosyaları da değişmiş
   gösterirdi.

**Fark satır satır (LCS).** "Kaç satır arttı" gibi kaba bir ölçü, aynı
uzunlukta yeniden yazılmış bir dosyayı "değişmemiş" gösterirdi. Artefaktlar
birkaç yüz satır olduğu için kareli maliyet sorun değil; yine de 4000
satırlık bir üst sınır var ve üstünde "hepsi değişti" deniyor — abartır ama
sessizce yanlış olmaz.

**Okuma kopyalardan, günlükten değil.** `turlar` komutu özet alanlarına
(`changed`, `addedLines`) değil, iki tur dizinine bakarak farkı yeniden
hesaplıyor: özet yanlış yazılmış olsa bile fark doğru kalsın.

**Neden yalnızca deneyde.** Orkestratörde kartın turu zaten git'te: rol
kendi worktree'sinde çalışıp commit atıyor, ekran da `git show --numstat`
ile turu gösteriyor. Aynı mekanizmayı ikinci kez kurmak, "kod git'te
taşınır" değişmezinin yanına ikinci bir tarih kaynağı koymak olurdu.

**Bedeli:** her tur artefaktın tam kopyası. Artefaktlar birkaç KB olduğu
için bugün ölçülemeyecek kadar küçük; büyük artefaktlı bir görev sınıfı
gelirse bu karar yeniden bakılmalı.

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

### Ek — 18 Eylül: tekrar **grup içinde** sayılır

Kuralın k'sı stokastikliğe karşıdır: aynı kurgunun tekrarı. Kodda ise koşu
sayısıyla ölçülüyordu ve bir koşu = bir matris = bir görev. Sonuç: **üç
farklı görevi birer kez koşmak "k=3" görünüyor ve karar kuralını
açıyordu.** Aynı günlük iki sürüme verildiğinde:

```
ESKİ: k = 3   karar = olumlu   (%67 azalma, "3 tekrarın hepsinde aynı yönde")
YENİ: gorev-1:k=1 gorev-2:k=1 gorev-3:k=1   karar = yetersiz
```

Yani kural, tam da engellemek için yazıldığı hatayı — tek koşudan sonuç
çıkarmayı — üç kez üst üste yapmaya izin veriyordu.

**Düzeltme:** ölçüm grubu = **görev × model kurgusu**. k grubun içinde
sayılır, karar grup seviyesinde verilir. Kurgu ayrımı ikinci bir sessiz
hatayı da kapatıyor: ölçüm gücü çıkmayınca modeli değiştirmek gerçek bir
senaryo ve eski hesap iki kurgunun hücrelerini tek orana topluyordu.

**Gruplar çelişirse** sonuç `belirsiz` ve sınıf başına okunur. Havuzlanmış
oran yine basılıyor ama karar ondan çıkmıyor: görevlerin kanca sayıları eşit
değil (16/18/12), yani havuz ağırlığı kanca çoğunluğu olan göreve verir ve
bir sınıftaki ters yönü yutabilir.

**Eşikler değişmedi** (%20 / %10). Bu ek kuralı gevşetmiyor, sıkıştırıyor —
ve **hiçbir çapraz satıcı verisi görülmeden** yazıldı: dört hücre hâlâ
koşulmadı.


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
  seed/              # opsiyonel: mevcut kod — üretimden ÖNCE konur
  hidden/            # gizli testler — üretici asla görmez
    reference/       # referans çözüm — kancaların karşılanabilirlik kanıtı
```

`seed/` varsa içeriği artefakt dizinine **üretim başlamadan** kopyalanır
ve görev metni ajana orada ne bulacağını söyler. Gizli testler hâlâ
üretim **bittikten sonra** kopyalanır; iki kopyanın sırası deneyin
geçerlilik koşuludur: ajan dokunacağı kodu görmeli, ölçen testi
görmemeli.

`hidden/reference/` bir referans çözümdür ve `hidden/` altında durduğu
için üretici onu da hiç görmez. `npm run bench -- selftest` kancaları bu
çözüme karşı koşar ve hepsinin yeşile döndüğünü doğrular. Doğru bir
çözümle de kırmızı kalan kanca kusur değil **bozuk test** ölçüyordur: her
hücrede kırmızı çıkar, "kaçırma" metriğini şişirir ve hiçbir üreticiyle
ilgisi yoktur. Ajan çağrılmadığı için bu doğrulama bedavadır.

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
| (sonraki) | kapısız | — | — | 9/9 | $0.1296 |
| (sonraki) | kapısız | — | — | 8/9 | $0.0611 |
| 18-47-41 | **kapılı** | 3 | 1 | **9/9** | $0.5913 |
| 18-49-59 | **kapılı** | 3 | 1 | **9/9** | $0.7011 |
| 18-52-45 | **kapılı** | 2 | 0 | **9/9** | $0.3160 |

```
kapısız (n=5) : ortalama 0.80 kırmızı  ·  $0.0743
kapılı  (n=3) : ortalama 0.00 kırmızı  ·  $0.5361      (7.2x maliyet)
```

> Sayılar olay günlüğünden (`.skein/events.jsonl`) türetilmiştir; aynı görev,
> aynı üretici. Kapısız koşu sayısı sonradan 3'ten 5'e çıktı ve ortalama
> 1.00'dan 0.80'e indi — beşinci koşu 9/9 verdi.

### Mekanizma izi — sayıdan daha güçlü kanıt

Kusur her koşuda aynı: model `retry`'yi `async` yazmıyor, `RangeError`
senkron fırlıyor, imza `Promise<T>` taahhüt ediyor.

| | İmza |
|---|---|
| kapısız, kusurlu koşular | `export function retry` ← senkron fırlatma |
| kapılı, 3/3 koşu | `export async function retry` ← kusur yok |

İki kapılı koşuda ajan denetim turunda **gerçekten bir düzeltme yaptı**
(`degisti` → yeni tur → `degismedi` → kabul) ve kusur ortadan kalktı.
Bu, "ajan komutu ikinci kez çalıştırıyor" alternatifini bu iki vaka için
eler: parmak izi değişti, yani iş değişti.

### Ne demiyoruz

- **n=5'e 3.** Bu bir eğilim, cevap değil.
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

## Kalibrasyon zor çıktı — ve bu bir bulgu

`token-bucket` görevi, `retry-backoff`'tan bilinçli olarak daha zor yazıldı:
14 kusur kancası, kesirli token birikimi, saat geri gitmesi, kısmi düşme
yasağı, enjekte edilmiş zaman. Sonuç:

| Üretici | Sonuç |
|---|---|
| `claude-opus-5` | 14/14 yeşil |
| `claude-sonnet-5` | 14/14 yeşil |
| `claude-haiku-4-5` | 14/14 yeşil |

Üç model de temiz çözdü. `retry-backoff` da çoğu koşuda temiz çıkıyor.

**Bu, görev yazımının değil ölçeğin sorunu olabilir.** Güçlü modeller, tek
dosyalık, spec'i tam yazılmış, bağımsız görevleri güvenilir biçimde doğru
çözüyor. Kör noktanın ortaya çıktığı yer muhtemelen başka: var olan bir kod
tabanına dokunmak, örtük sözleşmeler, iki modülün etkileşimi, spec'in
sessiz kaldığı yerler.

Deney bir sonraki adımda ya **daha büyük, bağlamlı görevlere** geçmeli
(mevcut bir repoya değişiklik), ya da kusuru üretmeye çalışmak yerine
**gerçek kusurlu kod** bulmalı (geçmiş commit'lerden gerçek hatalar).
İkincisi yer gerçeğini bedavaya getirir ama "üreticinin kendi kusuru"
ilkesini bırakmak demektir — ve o ilke tezin kör nokta iddiasının taşıyıcısı.

Karar verilmedi; kayda geçti.

## Üç yeni görev sınıfı — ve frontier modelin duvarı

Bir önceki bölüm darboğazı "görev yazımının değil ölçeğin sorunu olabilir"
diye bırakmıştı ve üç aday yön saymıştı. Üçü de birer göreve çevrildi,
her biri ayrı bir hipotezi sınıyor:

| Görev | Sınıf | Hipotez |
|---|---|---|
| `async-pool` | eşzamanlılık | Kusur, tek bir çağrının içinde değil çağrıların *arasında* doğar: tembel başlatma, hata sonrası iptal, senkron fırlatan thunk. |
| `snapshot-store` | mevcut koda dokunmak | Kusur, yazılanda değil *bozulanda*: verilen kodun örtük sözleşmeleri (sürüm tekilliği, anlık görüntü kimliği) görev metninde yazmıyor, kodda yaşıyor. |
| `csv-roundtrip` | sessiz kenar durumu | Değişmez yazılı (`parse(serialize(rows)) === rows`), onu bozan girdiler yazılı değil. Model türetecek mi? |

`snapshot-store` için görev formatına `seed/` eklendi: üretimden önce
artefakt dizinine konan mevcut kod. Görev metni yalnızca "geri alma ekle"
diyor; korunması gereken sözleşmeler `seed/src/selector.ts` içinde
yaşıyor — sürüme göre önbellekleyen bir sayaç ve bir önceki anlık
görüntüyü elinde tutan bir fark izleyici. Yer gerçeği nesnel kalıyor
(teslim edilen değişiklik *mevcut, görünür* kodu bozuyor) ama bilgi
görev metninde hiç geçmiyor. "Elle tohumlanmış hata işe yaramaz" kuralı
korunuyor: tohumlanan hata değil, bağlam.

### Kancaların sağlamlığı artık kanıtlanıyor

Görev sayısı arttıkça sessiz bir hata sınıfı büyüyor: **doğru bir çözümle
de kırmızı kalan kanca.** Böyle bir kanca her hücrede kırmızı çıkar,
kaçırma metriğini şişirir ve hiçbir üreticiyle ilgisi yoktur — yani
deneyi, kimsenin fark etmeyeceği bir yerden bozar.

Her göreve `hidden/reference/` altında bir referans çözüm kondu ve
`selftest` komutu kancaları ona karşı koşuyor. Beş görevin beşi geçiyor
(9 + 12 + 14 + 16 + 18 = 69 kanca). Ajan çağrılmadığı için bedava.

### Kalibrasyon: `claude-opus-5` üçünü de temiz çözdü

| Görev | Kanca | Tur 1 | Tur 2 | Maliyet |
|---|---:|---|---|---:|
| `async-pool` | 12 | 12/12 yeşil | 12/12 yeşil | $0.17 |
| `snapshot-store` | 16 | 14/14 yeşil | 16/16 yeşil | $0.33 – $0.47 |
| `csv-roundtrip` | 18 | 18/18 yeşil | 18/18 yeşil | $0.24 – $0.26 |

İki tur arasında görev metinleri **sadeleştirildi**. İlk turdan sonra
şöyle bir açıklama yazmıştım: görev metni kusuru önceden söylüyor, yani
denetimi görev yazarı zaten yapmış. `snapshot-store` spec'inde
"Korunması gereken değişmezler" diye bir bölüm vardı ve sürüm
tekilliğini açıkça sayıyordu; `csv-roundtrip` "virgül, tırnak, satır
sonu, boşluk, boş dize" diye zor girdileri tek tek yazıyordu;
`async-pool` "görevler baştan hepsi birden başlatılmaz" diyordu. Üçü de
kaldırıldı.

**Açıklama tutmadı.** Sadeleşmiş metinlerle de üçü de temiz çıktı. İlk
tur beş dakikada yazılmış bir hipotezdi ve ikinci tur onu eledi; kayda
geçiyor çünkü aynı açıklamaya tekrar sarılmanın bedeli bir tur daha.

### Kalibrasyon: `claude-haiku-4-5` kusur üretti — hem de tasarlanan kusuru

| Görev | Sonuç | Maliyet |
|---|---|---:|
| `snapshot-store` | **14/16**, 2 kırmızı | $0.0431 |
| `csv-roundtrip` | **17/18**, 1 kırmızı | $0.1290 |
| `async-pool` | **10/12**, 2 kırmızı | $0.0931 |

```
snapshot-store
  ✗ version geri gitmez
  ✗ version hiçbir zaman tekrar etmez

csv-roundtrip
  ✗ gidiş-dönüş: tek boş alanlı tek satır

async-pool
  ✗ bir görev reddederse O hatayla reddeder
  ✗ bir görev reddettikten sonra yeni görev başlatmaz
```

Üçü de **önceden tarif edilmiş** kusurlar — kancalar tahmin üzerine
yazılmıştı ve tahmin tuttu:

- `snapshot-store`: geri alma, geçmişi baştan oynatarak yapıldı — kısa ve
  ilk bakışta doğru — ama `apply` her çağrıda `version`ı kendi artırdığı
  için sürüm geriye düştü ve daha önce kullanılmış bir değeri tekrar etti.
  Sürüme göre önbellekleyen mevcut tüketici o noktadan sonra bayat veri
  gösterir. Görev metni bu sözleşmeden hiç söz etmiyor;
  `seed/src/selector.ts` içinde yazıyor. **Örtük sözleşme hipotezi
  çalıştı.**
- `csv-roundtrip`: `serialize([[""]])` boş metin üretir, dolayısıyla
  değişmez `parse("")`ın `[[""]]` dönmesini zorunlu kılar. Bu, görev
  metninde hiç geçmeyen ama değişmezden **türetilebilen** tek sonuç ve
  model onu türetmedi. **Sessiz kenar durumu hipotezi çalıştı.**
- `async-pool`: hata yolunda iki kusur birden — reddeden görevin hatası
  yerine başka bir hata yüzeye çıktı ve ilk hatadan sonra kuyruk
  beslenmeye devam etti. İkisi de tek bir çağrının içinde değil,
  çağrıların arasında yaşayan kusurlar. **Eşzamanlılık hipotezi
  çalıştı.**

**Bu, iki görev sınıfının da çalıştığının ilk kanıtı.** Aynı iki görev,
`claude-opus-5` tarafında ikişer koşuda da temiz. Yani görevler bozuk
değil, `claude-opus-5` için kolay.

### Üçüncü görev ölçülemedi — ve sebebi bir tuzaktı

`async-pool` × `claude-haiku-4-5` iki koşuda da **ÖLÇÜLEMEDİ** verdi:
hücrenin artefakt dizini boştu. "Ajan hiçbir dosya yazmadı" teşhisi
doğruydu ama eksikti — dosya yazılmıştı, sadece başka yere: ajan çalışma
dizininden yukarı çıkıp **deponun kendi `src/` dizinini** bulmuş ve
çözümü oraya yazmıştı. İki koşuda da aynı yere.

İki ayrı zarar:

1. Hücre boş kaldığı için koşu ölçümsüz göründü ve parası boşa gitti.
2. Ajanın ürettiği dosya operatörün deposuna düştü ve orada kaldı.
   İkincisi daha ciddi: `.skein/runs/` `git` tarafından yok sayılıyor,
   ama `src/` sayılmıyor.

Sebep muhtemelen araç listesi: ajana `Glob` ve `Grep` verilmişti, yani
dizin ağacında yukarı bakabiliyordu. `claude-opus-5` aynı araçlarla altı
koşuda bir kez bile çıkmadı; bu bir kural değil, model davranışı.

Teşhis artık bunu açıkça söylüyor: üretim bittiğinde istenen dosya depo
kökünde belirmişse `ÖLÇÜLEMEDİ` satırı "ajan hücresinin DIŞINA yazdı"
der ve yolu verir. Damga karşılaştırması ile: aynı adlı bir dosya depoda
zaten duruyorsa ona "ajan yazdı" denmez.

Araç listesi `Read,Write,Edit` ile kısıtlanınca aynı koşu kaçmadı ve
ölçüm verdi (yukarıdaki tabloda `async-pool` satırı). Üretim için bu üç
araç yetiyor: seed dosyalarının listesi zaten görev metninde. Artık
**varsayılan** bu; dört hücrede de aynı olduğu için karşılaştırmayı
bozmuyor. `SKEIN_ALLOWED_TOOLS` ile geçersiz kılınabilir.

**Kaçan dosyanın içeriği ayrıca bir veri:** `export function runPool` —
`async` değil. Yani `limit < 1` kontrolü `RangeError`'ı senkron
fırlatıyor, oysa imza `Promise<T[]>` taahhüt ediyor. Bu, `retry-backoff`
ölçümlerinde bulunan kusurun birebir aynısı ve `async-pool`'un
kancalarından biri onu bekliyor. Yani üçüncü görev de kusur üretiyordu;
yalnızca hücrenin dışında ürettiği için sayılamıyordu.

### Ne demiyoruz

- **k=1.** Bu bölümdeki her hücre tek koşu. DESIGN'ın kendi kuralı k≥3
  diyor; buradaki sayılar kalibrasyon sinyali, sonuç değil.
- **"Frontier model kusur üretmiyor" değil.** Beş görevde temiz çıkması,
  bu beş görevin `claude-opus-5` için kolay olduğunu söyler. Kusurun
  hangi ölçekte başladığı hâlâ bilinmiyor.
- **Kusur üretilmesi ile kusurun denetimde yakalanması ayrı şeyler.**
  Bu bölüm yalnızca birincisini ölçtü.

### Bunun deney için sonucu

Ölçüm gücü olan bir 2x2, üreticinin kusur ürettiği bir hücre gerektiriyor.
Elde artık üç tane var: üç yeni görevin üçü de `claude-haiku-4-5`
üreticisiyle kusur üretiyor (k=1).
Üç yol açık, ve üçü de aynı anda denenebilir:

1. **2x2'yi haiku sınıfında koşmak.** Bugün mümkün, ucuz (üretim ~$0.04)
   ve ölçüm gücü var. Sonuç "bu güç sınıfındaki modellerde" der.
2. **Görevleri büyütmek.** `snapshot-store` dört dosya; on dosyalık, iki
   modülün etkileşimini içeren bir görev frontier modelde de kusur
   üretebilir. Pahalı ve yazması yavaş.
3. **Üretici sayısını artırmak.** k=3 ile `claude-sonnet-5` de denenmeli;
   haiku ile opus arasındaki eşiğin nerede olduğu bilinmiyor.

Sıralama önemli: (1) bugün bir cevap verir, (2) daha genel bir cevap
verir. Birinciyi koşmadan ikinciye yatırım yapmak, ölçüm takımının
çalıştığını hiç görmeden görev yazmak demek.

## Çapraz satıcı nerede koşulabilir

`codex` CLI'ın API anahtarına ihtiyacı yok — ChatGPT oturumuyla da çalışıyor.
Ama Claude Code'un uzak çalışma ortamında **hiçbir kimlik yöntemi işe
yaramıyor**: konteynerin çıkış vekili `api.openai.com` ve `chatgpt.com`
için CONNECT'i 403 ile reddediyor (kurum politikası). Tarayıcı oturumu
açılamıyor, anahtarla da çıkış yok.

Doğrulandı (2026-09-18): `codex-cli 0.155.0` kuruldu, `codex exec` çağrı
bayraklarının hepsini kabul etti, oturumu açtı, stdin'den giden rol
promptunu ve görev metnini doğru yerde gösterdi — çağrı yalnızca websocket
açılırken durdu. Devir teslim belgesinin "bayraklar doğrulanmadı" riski
böylece kapandı.

Kapanmayan kısım **çıktı biçimi**: `--json` ve `--output-last-message`
yalnızca `--help` çıktısında doğrulandı, ürettikleri biçim görülmedi.
Adaptör ikisini de "bulamazsa boş bırak" diye okuyor, yani biçim farklıysa
codex hücrelerinde maliyet boş kalır ama deney yürür.

Çapraz satıcı koşusu operatörün kendi makinesinde yapılmalı. Uzak oturumda
yalnızca aynı satıcının iki modeliyle (ör. `haiku × sonnet`) koşulabilir.

## Durum

- [x] Tasarım — 2×2 çapraz kurgu, iki katmanlı yer gerçeği, karar kuralı
- [x] Adaptör sözleşmesi + kayıt (`src/adapters/`)
- [x] Görev formatı + katı yükleyici (`src/bench/`)
- [x] Örnek görev — `retry-backoff` (9 kusur kancası)
- [x] Sağlayıcı adaptörü — `claude` CLI, headless, bayrakları doğrulanmış
- [x] Sağlayıcı adaptörü — `codex` CLI, bayrakları `0.155.0`'da doğrulandı
      (gerçek çağrı hâlâ denenmedi: ağ)
- [x] Üretim koşucusu (artefakt üretimi, gizli testleri izole tutma)
- [x] Gizli test çalıştırıcı + JSON çıktı ayrıştırma (test bazlı yeşil/kırmızı)
- [x] **İlk uçtan uca koşu** — gerçek ajan, gerçek artefakt, gerçek sayı
- [x] Olay günlüğü — yalnızca-ekleme JSONL, katı doğrulama, özet görünümü
- [x] Audit gate — parmak izi, kilitli durum, tur sayacı, üst sınır
- [x] Tur başına artefakt anlık görüntüsü — `turlar/` kopyaları + `cli.ts turlar`
- [x] Kanca sağlamlığı — `hidden/reference/` + `selftest`, 5/5 görev geçiyor
- [x] Görev formatında `seed/` — mevcut koda dokunan görev sınıfı
- [ ] Görev zorluk kalibrasyonu — `snapshot-store` × `claude-haiku-4-5`
      kusur üretiyor (k=1); `claude-opus-5` beş görevde de temiz
- [x] Denetim koşucusu (aynı artefakt → iki denetçi), 2x2 orkestrasyonu
- [x] Nesnel katmanın puanlayıcısı — körlenmiş, alıntı doğrulamalı
- [x] Hakem katmanı — 2. yer gerçeği (nit / yanlış pozitif sınıflaması)
- [ ] Kalan görevler — darboğaz hâlâ burası, ama artık daha dar: elde
      ölçüm gücü olan bir hücre var (`snapshot-store` × haiku)
- [x] Rapor: hücre tablosu + etkileşim terimi + önceden ilan edilmiş karar
