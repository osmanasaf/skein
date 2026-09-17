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
│  YÜZEY        CLI · ekran · (ileride) editör│   durum TUTMAZ
├─────────────────────────────────────────────┤
│  OTURUM       uzun ömürlü süreç (skeind)    │   YOK — tek büyük eksik
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

### Bugünkü durum

`src/watch/cli.ts` bir **toplu iş**: kuyruğu süpürür, kart kalmayınca
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

Gerçekten eksik olan üç şey var, ve üçü de dar:

- **Uyandırma** — `.skein/queue` dizinini izlemek (ya da 1 sn'lik yoklama;
  ilk sürüm için yeterli ve taşınabilir).
- **Kontrol yüzeyi** — localhost'ta küçük bir HTTP/soket: "durum ver", "kapıyı
  aç", "kartı durdur".
- **Adaptörlerde akış modu** — `capture()` bugün çıktıyı biriktirip sonunda
  veriyor; satır geldikçe olay yayan bir kardeşi gerekiyor.

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
| 1 | `skeind` iskeleti — davranış aynı, süreç kalıcı | En küçük daemon; hâlâ toplu koşuyla aynı sonucu vermeli |
| 2 | Akış modunda adaptör + dar canlı olaylar | Canlı izlemenin ön koşulu; tip kümesi dar tutulur |
| 3 | Okuyucu ekran: kart × rol panosu, son gerekçe, diff | En çok değeri en az riskle veren yüzey |
| 4 | Kontrol: kapıyı ekrandan açmak | İlk *yazan* yüzey eylemi — komut olarak, durum olarak değil |
| 5 | Tanımlama: akış ve rol düzenleme (Aşama 6) | Doğrulama ve maliyet tahmini zaten yazılı |
| 6 | Planlamada ajanlar arası yazılı tur | En sonda, ve mekanizma olarak; serbest sohbet olarak değil |

Adım 6'nın gerekçesi `PHILOSOPHY.md`'de: serbest sohbet maliyeti sınırsız
büyütür, izlenebilirliği kaybeder ve modeller birbirine yakınsadıkça kör nokta
tezini zayıflatır. Doğru biçimi, `reject` mekanizmasının kardeşi: kayıtlı,
sayılı, gerekçeli turlar.
