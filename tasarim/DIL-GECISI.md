# Dil geçişi — kod İngilizce, arayüz Türkçe

**Karar (6 Kasım 2026, operatör):** kod içindeki tanımlayıcılar ve
yorumlar İngilizceye geçecek. Arayüz metinleri Türkçe kalacak.

**Zamanlama:** üç tasarım kartı (koyu tema, kuşların uçuşu, DEVIR
denetimi) bittikten sonra, tek seferde. Koşu sürerken yapılmayacak —
üç kart da `src/ui/page.ts`'e dokunuyor ve toplu yeniden adlandırma
onlarla çarpışır.

---

## Ölçü — DÜZELTİLDİ (6 Kasım, geçişe başlarken)

İlk ölçü **~343** diyordu ve YANLIŞTI: sayımda kullanılan Türkçe kök
listesi eksikti (`karar`, `taslak`, `kanit`, `denetci`, `itiraz`,
`gorev`, `gerekce`, `anayasa`, `yukumluluk`, `etiket`, `katilimci` ve
onlarcası listede yoktu).

**Gerçek ölçü**, TypeScript'in kendi AST'sinden çıkarıldı (regex değil —
bir ad dizede, yorumda ve CSS sınıf adı olarak da geçiyor):

| | |
|---|---|
| bildirilen tanımlayıcı | **2147** |
| bunlardan Türkçe | **638** |
| toplam kullanım | **2532** |
| etkilenen dosya | **90** |

Örnekler: `kusRengi`, `gozcuPanelDurum`, `kanatCirpiyorMu`,
`izinliAdlar`, `bizeAit`, `surenEngeller`, `kapiCikislari`,
`retYayKontrol`, `ajanSuAnDurumu`, `gozcuBeklemeSonucu`.

Koruma: **1654 sınama**. Yeniden adlandırma mekanik olarak güvenli —
bir ismi kaçırırsan `tsc` bağırır. Ama "mekanik" ile "kör" aynı şey
değil: bkz. aşağıdaki iki tehlike.

---

## SINIR — nerede durulacak

Bu ayrım işin tamamıdır; karıştırmak sınamaları kırar.

### İngilizceye geçecek

- Değişken, fonksiyon, tip, arayüz, sınıf adları.
- Kod içindeki yorumlar (`//` ve `/* */`).
- İç CSS sınıf adları (`.railGozcuNokta` → `.railDaemonDot`) —
  **ama** sınamalar bu seçicilere bakıyor, ikisi birlikte değişecek.

### TÜRKÇE KALACAK

- **Kullanıcının gördüğü her metin.** Düğme etiketleri ("Gözcüyü
  başlat", "Kilidi devral ve başlat"), durum metinleri ("boşta",
  "kapıda bekliyor", "gözcü kapalı · … yarıda"), uyarılar, lejant,
  altbilgi, hata mesajları.
- **Sınamaların başlıkları** (`it("bayat kilitte gözcü düğmesi
  'başlat' diyor")`) — bunlar davranışın tarifi ve Türkçe okunuyor.
- `tasarim/*.md`, `hub/prompts/**`, commit mesajları.
- **SERİLEŞEN HER ALAN ADI VE DEĞERİ.** İlk sürüm yalnızca olay
  günlüğünü yazıyordu; sınır daha geniş. Diskteki gerçek JSON
  dosyalarından çıkarılan dokunulmaz liste:

  | ad | nerede | niye |
  |---|---|---|
  | `akis`, `tema` | `.skein/ekran.json` | yeniden adlandırma operatörün kayıtlı seçimini düşürür |
  | `kanit`, `itiraz`, `kabuller`, `katilimcilar`, `denetci`, `ne`, `ilkTurKor`, `tur` | kart ve kapı dosyaları | yaşayan kuyruktaki kartlar okunamaz olur |
  | `durum` | `.skein/olaylar.jsonl` (`plan.obligation`) | geçmiş veri |
  | `yukumlulukler`, `durum`, `not` | `.skein-verdict.json` (`Verdict`, `YukumlulukCevabi`) | **AJANIN yazdığı dosya** — şeması `hub/prompts/**` ile sözleşme, promptlar Türkçe kalıyor |

  Tip ADLARI serileşmiyor, onlar değişebilir (`YukumlulukCevabi` →
  `ObligationAnswer`); değişmeyecek olan ALAN adları.

**Niye:** arayüz Türk operatör için. Metni çevirmek ürünü değiştirir,
kodu çevirmek değiştirmez.

---

## Yorumlar hakkında bir uyarı

Bu depodaki yorumlar kısa değil. Çoğu bir **kusur tarihçesi** taşıyor:
"gerçekte şöyle patladı…", "bu sınama şu mutasyon ayakta kaldığı için
yazıldı", "önceki yorum yanlıştı, sebebi şuydu". O anlatı projenin
hafızası.

Çeviri mekanik olmayacak: cümleleri İngilizceye aktarırken **gerekçeyi
ve ölçüyü** korumak gerekir. Kısaltmak, "bu kodu şöyle yapar" diye
özetlemek kayıptır. Bir yorum neyin niye böyle olduğunu anlatıyorsa,
İngilizcesi de anlatmalı.

Operatör bu riski bilerek seçti; not buraya, sonradan "neden bu kadar
uzun sürdü" sorulmasın diye.

---

## İki tehlike — "mekanik" kör demek değil

**1. Sessiz yakalama.** `kart` adını `card`'a çevirirken aynı dosyada
zaten bir `card` varsa `tsc` bağırır (iyi). Ama AYRI kapsamlardaysa
gölgeleme olur ve `tsc` SUSAR — davranış sessizce değişir. Bu yüzden
araç her dosyada hedef adın zaten var olup olmadığını denetliyor ve
çakışanı elle işaretliyor, kör değiştirmiyor.

**2. Dize ve CSS sınıf adları.** Bir tanımlayıcı adı aynı zamanda CSS
sınıf adı (`el("div", "railGozcuNokta")`) ve arayüz metni olarak
geçiyor. Bunlar dize, tanımlayıcı değil — AST tabanlı değiştirme
onlara DOKUNMUYOR, ve bu kasıtlı. CSS sınıf adları AYRI bir geçiş;
sınamalar o seçicilere bakıyor, ikisi birlikte değişecek.

**3. Düz nesneyi eşlem olarak kullanmak.** Aracın ilk sürümü eşlemi
`{}` ile tutuyordu ve `src/card/queue.ts`'i BOZDU: `eslem["toString"]`
`Object.prototype`'tan MİRAS gelen fonksiyonu döndürüyor, `undefined`
değil — araç `.toString(` çağrısını `.function toString() { [native
code] }(` yaptı. Aynı tuzak `constructor`, `valueOf`,
`hasOwnProperty` için de geçerli. `Map` kullanılıyor. Bu sefer
sözdizimi patladığı için `tsc` yakaladı; miras gelen bir DİZE olsaydı
sessizce geçebilirdi.

**4. Dize-literal türleri tanımlayıcı sanmak.** `planli`/`plansiz`
`Record<Arm, string>`'in anahtarları ama `Arm = "planli" | "plansiz"`
bir dize-literal türü, ve `events/log.ts`'te olay alanının DEĞERİ. Yani
veri. `tsc` yakaladı; sabit listeye eklendi. Ders: bir adı çevirmeden
önce "bu ad bir DEĞER olarak da geçiyor mu" diye bakılacak.

**5. `page.ts` ÜÇÜNCÜ BİR SINIR: 324 KB kod-dize.** `src/ui/page.ts`
tarayıcıda koşan betiği bir template literal İÇİNDE taşıyor — o kod
DİZE, ve AST yeniden adlandırması dizelere dokunmuyor. Ama
`page.test.ts`/`tarayici.test.ts` o betiği `declare` ile tipleyip
ÇAĞIRIYOR; sözleşme ikisi arasında.

**ÖLÇÜLDÜ:** sınama dosyaları çevrilip betik dizesi çevrilmeyince
**28 sınama düştü ve `tsc` TEMİZ kaldı** — tür düzeyinde görünmeyen bir
kırılma. Örnek: betik `{ hatalar: [...] }` döndürüyor, sınama `.errors`
okuyor, `undefined`. Dosyayı dışlamak ters sorunu yarattı: `server.ts`
çevrilince dışlanan sınama `ServeUiOptions.gozcu`'yu arıyordu.

**ÇÖZÜM:** dışlama DOSYA bazında değil **AD** bazında. `page.ts`'in dize
içeriğinde geçen her ad erteleniyor (ölçüldü: 42 adın 30'u orada
geçiyor). Geri kalanı her yerde çevriliyor.

**Niye kör metin değiştirme ÇALIŞMAZ:** o 324 KB'ın içinde betiğin
tanımlayıcıları, CSS sınıf adları, Türkçe arayüz metni ve serileşen
DEĞERLER (`data-tema="acik"`) birlikte duruyor.

**ÇÖZÜLDÜ.** Betik JS olarak ayrıştırılıp KENDİ AST'si üzerinden
çevriliyor, sunucu tarafıyla AYNI koşuda (ayrı koşu olsaydı sınır
uyuşmazdı). Ölçümler:

- `page.ts`'te TEK bir `NoSubstitutionTemplateLiteral` var (satır 47),
  `${}` ikamesi YOK: `<style>` 170–87.855, `<script>` 88.641–323.657.
- HAM metin üzerinde çalışılıyor: çözülmüş metin 54 karakter daha kısa
  (27 ters bölü) ve ofisler kayardı.
- Ham betik **sıfır sözdizimi hatasıyla** JS olarak ayrışıyor: 9981
  tanımlayıcı, 2331 dize literali.
- O 2331 dizeye DOKUNULMUYOR — CSS sınıf adları, Türkçe arayüz metni ve
  serileşen değerler orada yaşıyor.

**Kanıt:** çeviriden sonra ekran gerçek tarayıcıda açıldı, konsol
hatası 0, ve seçili tema düğmesi hâlâ **"Açık"** yazıyor. Tanımlayıcılar
İngilizce, arayüz Türkçe.

**6. SESSİZ GÖLGELEME — ölçüldü, `tsc` susuyor.** `src/ui/cli.ts`:

    const value = argv[i]              // DIŞ, zaten İngilizce
    ...
    const deger = argv[++i]            // İÇ
    if (value === "--model") ...       // BAYRAĞA bakıyor
    gozcuBayraklari.push(value, deger)

`deger -> value` çevirisi dış `value`'yu GÖLGELEDİ: koşul artık DEĞERE
bakıyor, `modelVar` hiç `true` olmuyor, **ekran hiç açılmıyor**; push
bayrak yerine değeri iki kez itiyor. `tsc` TAMAMEN SESSİZ kaldı.
Yakalayan şey ekranı ayağa kaldırma denemesiydi.

**KURAL:** çakışma denetimi KAPATILMAZ. Hedef ad bir dosyada
BİLDİRİLMİŞSE o dosyada bildirim konumları çevrilmez. Ama **özellik
konumları çevrilir** (`o.neden -> o.reason`): özellik erişiminin
hangi değişkenin görünür olduğuyla ilgisi yok, gölgeleme İMKÂNSIZ.
Bu ayrım tsc hatalarını 26'dan 5'e indirdi.

**Araç tuzağı:** `program.getSourceFiles()` düğümlerinin `parent`
işaretçileri dosyalar BAĞLANANA kadar atanmıyor; `program.getTypeChecker()`
çağrılmazsa `n.parent` undefined kalır ve "özellik konumu mu" testi HİÇ
true olmaz.

**7. DÖRDÜNCÜ SINIR: HTTP TEL GÖVDELERİ.** İstemci ile sunucu arasındaki
POST gövdelerinin alan adları da bir sözleşme:

- Kart açma: istemci `{ title, task }` göndermeye başladı, sunucu hâlâ
  `request["baslik"]` okuyordu (dize, AST dokunmaz).
- Prompt kaydetme: istemci `{ path, metin }` gönderiyordu, sunucu `text`
  bekliyordu — `metin` KISAYOL alan (`{ metin }`) olduğu için bildirim
  sayılıp atlanmıştı. **Prompt kaydetme SESSİZCE yazmıyordu, `tsc`
  temizdi**; yakalayan şey tarayıcı sınamasıydı.

Bu uçlar YALNIZCA bizim istemcimiz tarafından çağrılıyor ve gövde
hiçbir yerde saklanmıyor, o yüzden tel adları çevrilebilir — olay
günlüğü, kart dosyaları ve ajanın verdict dosyasının alan adları gibi
SABİT değil. Ayrım şu: **saklanan ya da ajanın gördüğü ad sabittir;
aynı sürümde birlikte servis edilen iki parça arasındaki ad değildir.**

**KISAYOL ALANLAR:** `{ x }` hem bildirim hem özellik olduğu için
atlanıyor. Tel ya da tür sözleşmesi gerektiren yerlerde AÇIK yazılıyor
(`{ text: metin }`): özellik adı İngilizce, yerel ad olduğu gibi,
gölgeleme riski sıfır.

**8. `page.ts` İÇİNDE BACKTICK YAZILAMAZ.** Template literal'i kapatır.
Bu dosyaya düzeltme yorumu yazarken backtick kullanıldı ve derleme
patladı. Yorumlarda düz tırnak kullanılacak.

**9. BEŞİNCİ SINIR: sınamalar betiğin KAYNAK METNİNİ doğruluyor.**
`page.test.ts` betikteki fonksiyonu metin aramasıyla çıkarıyor —
`fonksiyon(html, "jsonGibiMi")` → `src.indexOf("function jsonGibiMi(")`
— ve ad bir DİZE. Ayrıca ~400 beklenti betiğin kaynağını doğruluyor:
`expect(src).toContain("const canli = Boolean(g && g.alive)")`.

Üç çıkarıcı var (`fonksiyon`, `bildirim`, `fonksiyonlar`); üçüncüsü
adları bir DİZİ içinde alıyor. Çıkarıcı adları AST ile çevrildi
(yalnızca o çağrıların dize argümanları; `renderPage("jeton")` bir
token DEĞERİ ve dokunulmadı).

Beklenen kod parçaları için de aynı numara denendi: dizenin İÇİ JS
olarak ayrıştırılıp yalnızca tanımlayıcı konumları çevriliyor, iç içe
dizeler korunuyor (`h === "yeni"` değişmiyor, çünkü betikteki o dize de
çevrilmedi). Ama **Türkçe sınama BAŞLIKLARI da aynı kelimeleri
taşıyor** ("onay kapısı: hedef varsa geri gönder") ve başlıklar Türkçe
KALACAK; ayrım kırılgan. ÖLÇÜLDÜ: 285 adlık partide bu yüzden 15 sınama
düştü, ve yeniden-tırnaklama mantığı `tarayici.test.ts`'i bozdu
("Unterminated string literal").

**KARAR:** arayüz katmanının üç dosyası (`page.ts`, `page.test.ts`,
`tarayici.test.ts`) büyük partilerden DIŞLANIYOR (`--ui-haric`). Az
sayıda adla bu çeviri başarıyla yapıldı (3. parti, 30 ad): yöntem
çalışıyor, ölçek kırıyor. Kalan arayüz adları kendi aşamasında, küçük
gruplar hâlinde ve her grupta tam suite koşarak çevrilecek.

**10. DOSYA BAZINDA AD — yalnızca GERÇEKTEN yerel adlar.** Hedef adın
zaten bildirildiği dosyalarda kalan Türkçe adlar için, o dosyaya özgü
bir ad seçilebilir: kapsam o dosyayla sınırlı. Jenerik `Of` türevleri
yerine bağlama uygun eşanlamlı seçiliyor (`pathOf` değil `filePath`,
`textOf` değil `textBody`).

**AMA yalnızca yerel bildirimler.** İlk sürüm her bildirimi yerel saydı
ve YANILDI: `yakalandi` `RawVerdict` türünün ALANI; dosya bazında ayrı
ad seçmek paylaşılan tür alanını bozdu (`judge.test.ts` `caught`
bekliyor, `judge.ts` `yakalandi` tutuyor) — 12 tsc hatası.

Ölçüt: adın o dosyadaki TÜM bildirimleri yerel bağlama (değişken,
parametre, yıkım) olmalı VE ad hiçbir ÖZELLİK konumunda geçmemeli.
Özellik adları dosyalar arası sözleşme; onlar genel partilerde tutarlı
biçimde çevriliyor.

**Kanıt (her iki aşama için):** Türkçe metne bakan sınamaların hepsi
DEĞİŞMEDEN geçmeli. Değişen varsa sınır çiğnenmiştir.

## Yöntem

1. Koşu bitsin, ağaç temiz olsun, her şey itilsin.
2. Tanımlayıcılar önce — mekanik, `tsc` ile doğrulanır, tek commit.
   Her adımda `npx tsc --noEmit` ve `npx vitest run`.
3. Yorumlar sonra — dosya dosya, anlamı koruyarak. Ayrı commit'ler.
4. Arayüz metnine dokunulmadığının kanıtı: Türkçe metne bakan
   sınamaların hepsi değişmeden geçmeli. Değişen varsa sınır
   çiğnenmiştir.
