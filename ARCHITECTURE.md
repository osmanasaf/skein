# Skein — Genel Yapı

Bu belge, ekran tartışmasından **önce** oturması gereken şeyi sabitliyor:
Skein neyin nesi, hangi katmanlardan oluşuyor, hangi değişmezler ekran
gelince de kırılmayacak.

`PHILOSOPHY.md` *neden*'i, `hub/flows/SCHEMA.md` akış dilini, bu dosya
*yapıyı* anlatır.

---

## Hedefin adı

Skein bir orkestratör kütüphanesi değil, bir **ajan geliştirme ortamı**
(ADK): ajanları, rolleri ve görevleri tanımladığın, koşarken izlediğin, ne
değiştirdiklerini gördüğün yer.

Bugün elde olan, o ortamın **motoru**. Eksik olan, motorun çevresindeki
ortam. Aradaki mesafe düşünüldüğü kadar uzun değil, çünkü zor kısım motordu.

**Skein'in ne OLMADIĞI da hedefin parçası: kod editörü değil.** Kodu kendi
editöründe yazıyorsun. Skein, ajanların ne yaptığını tanımladığın,
izlediğin ve karara bağladığın yer. Bu sınır olmazsa proje bir VS Code
klonuna dönüşür ve asıl sorunu çözmeyi bırakır.

---

## Üç katman

```
┌─────────────────────────────────────────────┐
│  YÜZEY        CLI · ekran · (ileride) editör│   ✅ okuyucu ekran
├─────────────────────────────────────────────┤
│  OTURUM       uzun ömürlü süreç + canlı olay │   ✅ adım 1-2 yazıldı
├─────────────────────────────────────────────┤
│  ÇEKİRDEK     akış · kart · kuyruk · tur·git│   ✅ yazıldı, koşuyor
├─────────────────────────────────────────────┤
│  DEPO         .skein/ dizinleri · JSONL·git │   ✅ tek gerçek kaynağı
└─────────────────────────────────────────────┘
```

Katmanlar arası tek kural: **yukarı doğru yalnızca olay akar, aşağı doğru
yalnızca komut.** Yüzey çekirdeğin iç tiplerine bakmaz; depo dosyalarına ve
olay günlüğüne bakar. İhlal edilirse ekran ikinci bir durum kopyası olur ve
"durum ajanın kafasında değil" ilkesi kendi aracımızda çöker (PHILOSOPHY 1).

---

## "Uzun ömürlü çekirdek" ne demek

### Bugünkü durum (adım 1 sonrası)

`--serve` ile gözcü artık kuyruk boşalınca **ölmüyor, uyuyor**:
`src/watch/serve.ts` aynı süpürme döngüsünü koşturur, kuyruk boşalınca
`fs.watch` + yoklama ile bekler, kart düşünce uyanır. Ctrl-C koşan turu
bitirip çıkar. `src/watch/lock.ts` yazan her koşuyu tekleştirir.

Kalan eksikler adım 2 ve 3'ün konusu: ajan çıktısının canlı akması ve
ekranın bağlanacağı bir kontrol yüzeyi. Aşağıdaki tablo, adım 1'den önceki
durumu ve hangi ihtiyacın neden doğduğunu anlatıyor.

`--serve` olmadan `src/watch/cli.ts` bir **toplu iş**: kuyruğu süpürür, kart kalmayınca
`process.exit`. Süreç ömrü = koşu ömrü.

Üç şeyi aynı anda imkânsız kılan da bu:

| İstenen | Neden olmuyor |
|---|---|
| "Şu an hangi kartta çalışıyor" | Cevap sürecin belleğinde, ve o bellek koşu bitince ölüyor |
| Koşan oturumun içine girmek | Girecek bir süreç yok; ajan bitmiş, `capture()` çıktıyı toplamış |
| Canlı ekran | Ekranın bağlanacağı bir yayın yok; yalnızca koşu sonrası dosyalar var |

### Ne olacak

`skeind`: **aynı `runUntilIdle` döngüsünü sahiplenen, ama kuyruk boşalınca
ölmeyen** bir süreç. Kazandırdığı üç şey:

1. **Boş kuyrukta uyur, kart düşünce uyanır.** "Kart aç" ve "koş" iki ayrı
   komut olmaktan çıkar — kart açmak işin başlaması demek olur.
2. **Ajan çıktısını satır satır alır ve olaya çevirir.** Canlı izlemenin tek
   dürüst yolu bu; pane kazıma değil (PHILOSOPHY 8).
3. **Tek yazıcı olur.** İki `watch` koşusunu aynı anda başlatma sorunu
   kendiliğinden ortadan kalkar; kuyruğa yazan tek süreç vardır.

### Yapabilir miyiz — evet, ve sanılandan küçük bir iş

Bir daemon'ı zorlaştıran şeyler zaten çözülmüş durumda:

| Daemon'ın ihtiyacı | Bizde |
|---|---|
| Koşum döngüsü | `runUntilIdle` + `sweep` yazılı |
| Çökme sonrası toparlanma | `queue.recover()` yazılı, dizin otoriter |
| Durumun süreç dışında olması | Dizin + JSONL + git; bellekte durum yok |
| Sonlanma garantisi | `reject.limit` + `maxSweeps` |
| Eşzamanlılık güvenliği | Atomik `rename` ile kilitsiz sahiplenme |

Gerçekten eksik olan üç şey vardı, ve üçü de dar:

- **Uyandırma** — ✅ adım 1. Doğruluğu yoklama sağlıyor, `fs.watch` yalnızca
  gecikmeyi kısaltıyor. Tersi kurulsaydı, izlemenin çalışmadığı bir dosya
  sisteminde gözcü kartı hiç görmezdi — ve bu **sessiz** bir arıza olurdu.
- **Kontrol yüzeyi** — ✅ adım 4. `POST /kart/<id>/birak`: jetonlu, kapı
  tipine göre doğru çıkışla, kararı olay günlüğüne düşürerek.
- **Adaptörlerde akış modu** — ✅ adım 2. `claude` adaptörü `stream-json`
  okuyor, her satırı sağlayıcıdan bağımsız bir adıma çeviriyor ve tur
  bitmeden günlüğe yazıyor.

### Adım 1'de öğrenilen: asıl tehlike `take()` değil `recover()`

Tek yazıcı kuralı, "iki gözcü aynı kartı alır" diye düşünülüyordu; atomik
`rename` bunu zaten engelliyor. Gerçek tehlike başka: ikinci koşunun
`recover()`'ı, birincinin **elindeki** (`active/` dizinindeki) kartı çökmüş
sanıp kuyruğa geri atar — ve aynı iş ikinci kez, para harcayarak yapılır.

Sonuç: kilit `recover()`'dan **önce** alınıyor ve yazan her koşu (gözcü de,
toplu koşu da) alıyor. `--plan` almıyor, çünkü yazmıyor — ve artık gerçekten
yazmıyor: `recover()` çağrısı plan yolundan çıkarıldı.

### Sabitlenen kısıt: daemon bir depo değildir

`skeind` öldüğünde **hiçbir şey kaybolmamalı**. Ölçütü net:

> Daemon'ı `kill -9` ile öldür. `npx tsx src/watch/cli.ts <akış>` ile devam
> edebiliyorsan doğru yazılmıştır.

Daemon bir hızlandırıcı ve gözlem noktasıdır; gerçeğin kendisi değil. Bu
kısıt, ilerideki her özelliği de disipline eder.

---

## IDE gibi bir uygulama olabilir mi

Evet — ve yarısı zaten yazılı, çünkü IDE'nin göstereceği her şey bugün bir
dosyada duruyor:

| Ekranda görmek istenen | Kaynağı | Bugün var mı |
|---|---|:---:|
| Hangi kart hangi rolde | `.skein/{queue,active,gate,done}/` dizini | ✅ |
| Kart ne yaşadı, kaç kez reddedildi | Kartın `history` + `rejects` alanları | ✅ |
| Turun sonucu, gerekçesi, uyarıları | `card.settled` olayı | ✅ |
| Ajan ne kadar sürdü, ne harcadı | `agent.finished` olayı (`usage`) | ✅ |
| Ajan kodda ne değiştirdi | Rolün dalı + karttaki commit → `git diff` | ✅ |
| Akış nasıl bir topoloji | `flow.hash` + dondurulmuş `TopologySnapshot` | ✅ |
| Ajan **şu an** ne yapıyor | — | ❌ oturum katmanı |
| Ajanların planlamada konuşması | — | ❌ kasıtlı olarak en sonda |

Yani ekranın büyük kısmı **saf okuyucu** olarak yazılabilir. Bu bir kısıt
değil, kazanç: okuyucu ekran bozulduğunda hiçbir iş kaybolmaz.

**Önerilen şekil:** tek bir yerel süreç (`skeind`) + tarayıcıdan açılan
yüzey. Electron'a şimdilik gerek yok; yerel süreç zaten var olacağı için
tarayıcı sekmesi bedava geliyor. Terminal TUI'yi eleyen şey diff: kod
farkını ve canlı ajan çıktısını yan yana göstermek terminalde dar.

---

## H2 gibi yerel bir veritabanı gerekir mi

**Hayır — ve bugün eklemek aktif zarar olur.** Üç gerekçe:

### 1. Depo zaten üç parçalı ve her parçası o iş için seçildi

| Parça | Ne tutuyor | Neden o biçim |
|---|---|---|
| `.skein/*/` dizinleri | Kartın **nerede** olduğu | Durum, dosyanın içeriğinde değil konumunda; geçiş atomik `rename` |
| `olaylar.jsonl` | **Ne olduğu** | Yalnızca ekleme; koşu yarıda kesilse önceki satırlar okunur |
| git | **Kod** | Zaten sürüm, dal, diff ve birleştirme demek |

Bir DB bunların hiçbirinin yerine geçmez — yanlarına **dördüncü bir kopya**
olarak gelir. O anda iki gerçek kaynağın olur ve ilk tutarsızlıkta hangisinin
doğru olduğunu bilemezsin. Şu an `card show` ile dizin listesi asla
çelişemez; DB ile çelişebilir hale gelir.

### 2. H2 özellikle yanlış eşleşme

H2 bir JVM veritabanı. Skein Node/TypeScript. Kullanıcının makinesinde JVM
şartı koşmak, tek satır Java yazmadan Java bağımlılığı almak demek.
(`java-kit/` yalnızca rol promptlarından ibaret, çalışan Java değil.)

### 3. Gerçek cazibe genelde "eşzamanlılık", ve o zaten çözülmüş

İnsanlar bu noktada DB'ye genelde "iki süreç aynı anda yazarsa" diye uzanır.
Bizim cevabımız zaten var: kilitsiz sahiplenme + tek yazıcı daemon. DB
eklemek, çözülmüş bir sorunu ikinci kez çözmek olur.

### Ne zaman gerekir — ve o zaman bile nasıl

Gerektiren şey sorgudur, saklama değil: *"son 30 günde hangi rol kaç kez
reddetti"*, *"model × görev sınıfı kabul oranı"*. Bunlar bugün JSONL'i baştan
okuyarak da cevaplanır; günlük on binlerce satıra çıkana kadar da öyle
kalacak.

O gün geldiğinde doğru cevap **SQLite**, ve **türetilmiş indeks** olarak:

> `rm .skein/index.db` dedikten sonra hiçbir şey kaybolmuyor, indeks
> JSONL'den yeniden kuruluyorsa doğru yapmışsındır.

**Fikrimi değiştirecek şey:** tek ekranda birden fazla depo/proje ve koşu
sayısının yüzlere çıkması. O zaman bile indeks kaynak olmaz, hızlandırıcı
olur.

---

## Ekranın kıramayacağı değişmezler

Ekran tartışması bunların üstüne gelir, bunları yeniden açmaz:

1. **Durum yüzeyde tutulmaz.** Ekran okur; yazacaksa çekirdeğe *komut*
   gönderir, kendi kopyasını güncellemez.
2. **Kartın yeri dizindir.** Bir kartın nerede olduğu sorusunun tek cevabı
   hangi dizinde durduğudur.
3. **Olay günlüğü yalnızca eklenir ve tipi dardır.** Yeni bir görünüm için
   serbest biçimli olay eklenmez; tip kümesi genişleyecekse `EventInput`
   birliğine ve `REQUIRED`'a birlikte girer.
4. **Topoloji kartta donar.** Akış dosyası koşarken düzenlenebilir; yoldaki
   kart kendi hash'iyle yaşar.
5. **Ajan kendi akışını değiştiremez.** Ekran bu kapıyı açmaz.
6. **Kod git'te taşınır.** Dosya kopyalayan bir "paylaşım" yüzeyi eklenmez.

---

## Sıra

| # | Adım | Neden bu sırada |
|---|---|---|
| 0 | Bu belge | Yapı oturmadan ekran çizmek, ekranı yanlış yere bağlar |
| ~~1~~ | ✅ `--serve` — davranış aynı, süreç kalıcı | Canlı koşuda doğrulandı: gözcü uyurken açılan kart ikinci komut olmadan bitti |
| ~~2~~ | ✅ `agent.step` — ajan koşarken günlüğe düşüyor | Canlı koşuda doğrulandı: 8 adım, tur bitmeden, saniye saniye |
| ~~3~~ | ✅ Okuyucu ekran — pano, canlı adım, kart izi, diff | Gerçek depoda doğrulandı; üç sorunun üçü de ekrandan cevaplanıyor |
| ~~4~~ | ✅ Kapı ekrandan açılıyor | Yüzey komut gönderiyor; çekirdeğin reddi kullanıcıya aynen gidiyor |
| 5 | Tanımlama: akış ve rol düzenleme (Aşama 6) | Doğrulama ve maliyet tahmini zaten yazılı |
| 6 | Planlamada ajanlar arası yazılı tur | En sonda, ve mekanizma olarak; serbest sohbet olarak değil |

Adım 6'nın gerekçesi `PHILOSOPHY.md`'de: serbest sohbet maliyeti sınırsız
büyütür, izlenebilirliği kaybeder ve modeller birbirine yakınsadıkça kör nokta
tezini zayıflatır. Doğru biçimi, `reject` mekanizmasının kardeşi: kayıtlı,
sayılı, gerekçeli turlar.

---

## Adım kayıtları

### Adım 1 — `--serve` · 2026-09-17

**Yazılanlar:** `src/watch/serve.ts` (uyu/uyan döngüsü),
`src/watch/lock.ts` (tek yazıcı), `src/watch/cli.ts` (`--serve`, `--poll`).
308 test yeşil (+18).

**Biter kriteri karşılandı.** Canlı koşu, `claude-haiku-4.5`, iki rol:
gözcü boş kuyrukta beklerken başka bir kabuktan kart açıldı; gözcü kendisi
uyanıp kartı aldı, ajanı çağırdı, iş commit'lendi. İkinci turda kart insan
kapısında beklerken `card release` ile bırakıldı — gözcü yine kendisi
uyanıp 26 saniyede bitirdi. Hiçbir aşamada ikinci bir `watch` komutu
verilmedi.

**`kill -9` ölçütü:** kilit devralma testlerle, dosyanın bırakılması canlı
koşuda doğrulandı. Gözcü durunca `npx tsx src/watch/cli.ts` toplu koşusu
kaldığı yerden devam ediyor — durum süreçte değil, dizinde.

**Bilinen sınır:** gözcü akış dosyasını **başlarken bir kez** okur. Koşarken
akışa yeni bir rol eklenirse o rolün kuyruğu süpürülmez; gözcüyü yeniden
başlatmak gerekir. Yoldaki kartlar etkilenmez — onlar kendi dondurulmuş
topolojilerini taşır (değişmez 4).

### Adım 2 — canlı adımlar · 2026-09-17

**Yazılanlar:** `src/proc/lines.ts` (satır ayırıcı), `AgentStep` +
`onStep` (sözleşme), `claude` adaptöründe `stream-json` okuma,
`agent.step` olayı, `tick`'te sıralı yazım kanalı. 328 test yeşil (+20).

**Biter kriteri karşılandı.** Canlı koşuda, ajan HÂLÂ koşarken günlük şunu
gösteriyordu:

```
12:19:16  agent.started
12:19:19  adım  1  tool  Bash   pwd && ls -la
12:19:21  adım  2  tool  Read   README.md
12:19:26  adım  4  tool  Write  LICENSE
12:19:29  adım  5  tool  Edit   README.md
12:19:34  adım  8  text         İş başarıyla tamamlandı:
12:19:36  agent.finished
```

Daha önce bu aralık — çoğu zaman dakikalar — günlükte tamamen boştu.

**Kararlar:**

- **`thinking` blokları dışarıda.** Ajanın iç muhakemesi gözlem değil;
  günlüğü şişirmekten başka bir şey yapmaz.
- **Biçim yalnızca adım istendiğinde değişiyor.** `--output-format json`
  yolu kanıtlanmış ve deney onu kullanıyor; gereksiz yere değiştirmenin
  faydası yok.
- **Adım kaybı turu bozmaz.** Diski dolmuş bir makinede, parası ödenmiş bir
  ajan çağrısı günlüğe yazamadığı için çökmemeli. `card.settled` için aynı
  hoşgörü YOK — o yazılamıyorsa tur gürültüyle patlamalı.
- **Adaptör başına isteğe bağlı.** `codex` desteklemiyor: bayrakları
  doğrulanmadı ve metin kazıyarak adım üretmek yasak (CONTRACT.md).

**Yol boyunca çıkan iki kusur:**

1. **`--allowed-tools` variadic.** Görev metni ondan sonra geldiği için CLI
   metni araç adı sanıyor ve "Input must be provided" diyor — ajan görevi
   HİÇ görmüyor. Araya giren `--permission-prompts` kazayı gizliyordu; o
   bayrağın olmadığı CLI sürümünde (operatörün makinesinde yoktu) tur
   sessizce boşa gidiyordu. Görev metni artık en başta.
2. **`result` son satır değil.** Gerçek koşuda `type: "result"` satırından
   SONRA bir `system` satırı daha geliyor. "Sonuncusu sonuçtur" varsayımı
   maliyeti ve ajanın son mesajını sessizce kaybettirirdi.

### Belge üreten rolün çıktısı — iki yönlü çözüm · 2026-09-17

4 rollü canlı koşu bir boşluk gösterdi: **kod git'te taşınıyordu, belge
hiçbir yerde.** `analyst` kabul kriterlerini üretti, kriterler
`.skein-verdict.json` içinde kaldı (her tur başında silinen, git'e girmeyen
bir dosya), `coder` özgün belirsiz görevi aldı ve kendi kriterlerini uydurdu.

Üç yerden birden doğrulandı: `specifier.md` dosya yazmayı yasaklıyordu,
`handoff` kabul özetini kaydetmiyordu, `buildTaskText` yalnızca **ret**
gerekçesini taşıyordu.

Çözüm iki parçalı, çünkü tek başına ikisi de yetmiyor:

| | Ne yapar | Olmazsa |
|---|---|---|
| **(a) Belge dosyaya yazılır ve commit'lenir** | Spec `docs/spec/<kart-id>.md`'de; git'le taşınır, diff'lenir, kalıcıdır | Belge kalıcı olmaz |
| **(b) Devir özeti iş metnine taşınır** | Sonraki rol "önceki rol ne dedi"yi ve devir commit'ini görür | Sonraki rol belgenin varlığını bilmez |

**Değişmeze uyum:** (a), "kod git'te taşınır" kuralının belgelere
uygulanması — yeni bir durum kanalı açmıyor. (b) ret kaydının simetriği ve
**yalnızca en son devri** taşıyor: zincir boyunca biriken özetler, altı rollü
bir akışta iş metnini rapora çevirirdi.

**Canlı koşuda doğrulandı.** `analyst` yalnızca spec dosyasını commit'ledi;
`coder` iş metnindeki devir commit'ini gördü, `git show <commit> --stat`
çalıştırdı ve `docs/spec/c-…md`'yi okudu. Zincir kendiliğinden kapandı.

**Yol boyunca çıkan iki şey:**

1. **Rol promptunda kısıt sona yazılırsa tutmuyor.** İlk denemede yasak
   "Sahiplenmediğin" başlığı altındaydı; ajan spec'i yazdı ama `src/` altına
   da dokundu ve devir çakışmayla durdu. Kısıt promptun BAŞINA alınınca
   ikinci koşuda yalnızca spec dosyası commit'lendi. Aynı ders iş metninde de
   öğrenilmişti (zorunlu çıktı başa alınmıştı).
2. **Mekanizma değil, ikna.** "Yalnızca şu yolu değiştir" bugün yalnızca
   prompt'ta yazıyor; çekirdek doğrulamıyor. Rol başına yazma izni
   (`writes: [docs/spec/**]`) akış diline eklenip devir öncesi commit'in
   dokunduğu yollar denetlenebilir. Şema değişikliği olduğu için ayrı karar.

### Adım 3 — okuyucu ekran · 2026-09-17

**Yazılanlar:** `src/ui/model.ts` (okuma modeli), `src/ui/server.ts`
(yerel sunucu), `src/ui/page.ts` (sayfa), `src/ui/cli.ts`.
373 test yeşil (+32).

**Biter kriteri karşılandı.** Üç soru da ekrandan cevaplanıyor:

| Soru | Nereden |
|---|---|
| Hangi kart hangi rolde | `.skein/{queue,active,gate,done}/` dizini |
| En son neden reddedildi | Kartın `history` dizisi — gerekçe tam metin |
| Kodda ne değişti | Devir commit'i → `git show --numstat` |

**Kararlar:**

- **Bağımlılık yok.** Sayfa tek dosya, çerçevesiz. Derleme adımı ve paket
  ağacı, "ekran saf okuyucudur" kısıtını ilk ihlal edecek yer olurdu.
- **Yalnızca `GET`.** Yazan uç nokta yok; `POST` 405 döner. Kapıyı ekrandan
  açmak adım 4 ve komut olarak gelecek.
- **127.0.0.1.** Ekran kart metinlerini ve ret gerekçelerini gösteriyor;
  yerel bir araç, ağa açılan bir servis değil.
- **`recover()` çağrılmıyor.** O yazan bir işlem ve gözcünün işi. Ekranın
  açılması kuyruğu oynatmamalı.
- **Üç kapı tipi, üç ayrı çıkış kümesi.** Kaçış kapısında "Geçir" düğmesi
  hiç çizilmiyor — ekran, çekirdeğin reddedeceği bir eylemi önermemeli.
- **Panel adreslenebilir** (`#kart/<id>`): bir karta bakarken URL'yi
  paylaşmak, "hangi kart" sorusunu konuşmanın en kısa yolu.

**Yol boyunca çıkan iki kusur (ikisi de ekranı açıp bakınca):**

1. Sütun başlığındaki sayı kuyruk derinliğiydi; kapıdaki kart kuyrukta
   durmadığı için iki kart duran sütun **"0"** yazıyordu. Sayı artık
   sütundaki kart sayısı, kuyruk derinliği ayrı bir ipucu.
2. Beş sütun 1500 piksele sığmıyor, "bitti" sütunu `analyst`'in altına
   sarıyor ve o sütuna aitmiş gibi görünüyordu.

### Adım 4 — kapı ekrandan açılıyor · 2026-09-17

Ekranın ilk **yazan** eylemi. `POST /kart/<id>/birak` → `releaseCard()` →
`queue.release()`. 385 test yeşil (+12).

**Değişmez korundu:** yüzey kendi kopyasını güncellemiyor. Komut çekirdeğe
gidiyor, cevap çekirdeğin ürettiği YENİ modelden okunuyor, ekran onu
çiziyor. Çekirdek reddederse mesaj kullanıcıya **aynen** gidiyor — o mesaj
gerekçeyi ve çıkış yolunu zaten söylüyor.

**Yerel sunucuya yazma eklemenin bedeli var ve ödendi.** Tarayıcıda açık
herhangi bir site `http://127.0.0.1:<port>`'a POST atabilir; yani
kullanıcının haberi olmadan bir kapı açabilirdi. İki kapı birden:

1. **Jeton** — açılışta üretiliyor ve sayfaya gömülüyor. Başka kaynaktaki
   JavaScript sayfayı okuyamadığı için jetonu öğrenemez.
2. **Özel başlık** (`x-skein-token`) — çapraz kaynak isteği önce preflight
   ister, biz preflight'a izin vermiyoruz. `Origin` varsa ayrıca kendi
   adresimizle eşleşmeli.

Canlı doğrulandı: jetonsuz POST **403**, kaçış kapısından ileri bırakma
**409** (gerekçesiyle), doğru karar kartı taşıdı ve günlüğe düştü.

**`gate.released` olayı eklendi.** Karar kartın geçmişine zaten giriyordu;
bu kayıt KARTLAR ARASI soru için: *"insan ne sıklıkla araya girdi, hangi
kapıda, hangi yöne?"* Tek bir kartın izinden okunamayan tek şey buydu.

Günlük yazımı kuyruğun içinde değil `src/card/release.ts` içinde: kartın
nerede olduğu ile o kararın kaydı iki ayrı sorumluluk, ve kuyruk ölçümden
habersiz kalmalı. Ekran da `card` CLI'ı da aynı yardımcıdan geçiyor.

### Akış değişince yoldaki kartlar — ve "yetim kart" kararı · 2026-09-17

**Sınır:** topolojiyi üç yer okuyor ve üçü farklı anda — gözcü başlarken bir
kez, kart açılırken bir kez (ve **donduruyor**), ekran başlarken bir kez.
`sweep()` kendi listesini geziyor, `tick()` ise yönlendirmeyi kartın
topolojisinden okuyor. Bu ikisi ayrıştığında kart hiçbir turda alınmıyor ve
**hiçbir hata üretmiyor**.

Dondurma kasıtlı (değişmez 4). Gözcünün ve ekranın bir kez okuması kasıtlı
değildi; `--serve` toplu koşudan türedi ve orada süreç zaten kısa yaşıyordu.

#### Karar 1 — yoldaki kartlara dokunulmaz

Akış değişse de yoldaki kart kendi topolojisiyle yaşar. Tartışma yok:
"bazen değiştirilebilir" bir garanti, garanti değildir.

#### Karar 2 — rolü kalmamış kart GÖRÜNÜR olur

Ekran hiçbir kartı düşürmez. Rolü yaşayan akışta olmayan kart kendi
şeridinde, iki olası sebebiyle birlikte durur:

- rol akıştan gerçekten silindi (kart gerçekten yetim), ya da
- akışa rol eklendi ve **bakan taraf bayat**.

Tek anlık görüntüden ayırt edilemiyorlar, ama eylem aynı: bu kart hiçbir
yere gitmiyor. Gözcü de aynı kartı **bir kez** duyurur.

#### Karar 3 — tek çıkış "kapat", "yeni akışa taşı" DEĞİL

Kartı yaşayan topolojiye taşımak daha nazik görünüyor ama iki şeyi kırıyor:

1. **Dondurmanın verdiği tek garanti** — kart başladığı yoldan gider.
2. **Kodun nerede olduğu** — iş, rol adını taşıyan dallarda
   (`skein/<workspace>`) ve ileri birleştirme zinciri o rollere göre kuruldu.
   Yeni topolojiye taşınan kartın commit'leri, kimsenin birleştirmeyeceği bir
   dalda kalır — sessizce.

"İptal" değil "kapat" demesinin sebebi: iş çöpe gitmiyor. Commit'ler dalında,
iz geçmişinde duruyor. Kapanan şey kartın **yolculuğu**. İşi yeni akışta
sürdürmek istiyorsan yeni kart açarsın; o kart yeni topolojiyi dondurur.

Kapatma **yalnızca** yetim kart için açık. Genel bir "kartı iptal et" düğmesi,
sürtünmesi olması gereken bir şeyi (işi yarıda bırakmak) sürtünmesiz yapardı.
Koşan kart da kapatılamaz: altından kartı çekmek, parası ödenmiş bir turu
ortada bırakmak olurdu.

#### Sırada kalan: akışı yeniden yükleme — ✅ yapıldı (aşağıya bak)

Bu kayıt sınırı **görünür** kıldı, kaldırmadı. Kaldırması bir sonraki
kayıtta.

### Akışın yaşayan hâli — `LiveFlow` · 2026-09-17

Adım 5'in ön koşulu. `src/flow/live.ts`: gözcü ve ekran akış dosyasını artık
**yaşayan** tutuyor — gözcü geçişler arasında, ekran her okumadan önce
yokluyor. 421 test yeşil (+18).

**İki şart, ikisi de pazarlıksız:**

1. **Doğrulanmış.** Yeni içerik 16 kuralın tamamından geçmeden geçerli
   sayılmaz. Editör yarım kaydetmiş olabilir.
2. **Atomik.** Geçiş ya tamamen olur ya hiç olmaz. Başarısızlıkta eldeki
   topoloji **aynen** durur; "yarı yüklenmiş akış" diye bir durum yok.

**Neden mtime değil içerik karşılaştırılıyor:** mtime çözünürlüğü bazı dosya
sistemlerinde bir saniye, ve aynı saniyede yapılan bir düzenleme sessizce
kaçardı. Akış dosyası küçük; okumak ucuz, kaçırmak pahalı.

**Geçişin ORTASINDA değil, arasında.** `sweep()` rol listesini baştan alıyor;
tur ortasında değişen bir topoloji, hangi anın geçerli olduğunu
bulanıklaştırırdı.

**Yoldaki kartlar etkilenmiyor** (değişmez 4). Değişen tek şey gözcünün hangi
kuyrukları süpüreceği ve ekranın hangi sütunları çizeceği.

**Canlı koşuda doğrulandı:** rol eklendi → gözcü `↻ akış yeniden yüklendi`
dedi ve yeni rolü süpürmeye başladı; YAML bozuldu → `⚠ ESKİSİYLE devam
ediliyor` deyip gerekçeyi yazdı ve çalışmaya devam etti; ekran bozuk akışta
eski sütunları çizmeye devam edip hatayı şeritte gösterdi; dosya düzeltilince
ikisi de kendiliğinden toparladı.

**Canlı koşunun çıkardığı iki kusur:**

1. **Uyarı spam'i.** Aynı hata her yoklamada yazılıyordu: 3 saniyede **48
   satır**. Artık yalnızca DEĞİŞEN hata duyuruluyor (48 → 2, ve tam olarak iki
   farklı hata vardı). Aynı disiplin yetim kart duyurusunda zaten vardı;
   burada unutulmuştu.
2. **Kalıcı hayalet hata.** Bozuk metin hiç kaydedilmiyor, dolayısıyla dosya
   eski geçerli hâline döndüğünde içerik son başarılı hâlle eşleşiyor ve
   `unchanged` dönüyordu — ama hata izi temizlenmiyordu. Ekran, geçerli bir
   dosya için sonsuza kadar hata gösterirdi.

**Bilinen davranış:** yeniden yükleme akışa YENİ BİR SAĞLAYICI getirirse
adaptör haritası eski kalır ve o role düşen kart `adaptör yok` gerekçesiyle
kaçış kapısına çıkar. Sessiz değil, görünür — ve doğrusu bu: model pinleri
komut satırından geliyor, gözcü kendi başına model seçemez.
