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

**11. EN CİDDİ KUSUR: AJAN PROMPTUYLA OLAN JSON SÖZLEŞMESİ KIRILDI.**

`bench/prompts/judge.md` hakeme BİREBİR şunu söylüyor:

    {"no": 1, "yakalandi": true, "alinti": "...", "gerekce": "..."}

`siniflandir.md` de `sinif` / `kanitli` / `alinti` / `gerekce` diyor.

Geçişin **1. partisinde** `alinti -> quotation` ve `gerekce -> rationale`
çevrildi (3. partide `kanitli -> proven`). Kod ajanın HİÇ yazmadığı
alanları okumaya başladı: her alıntı ve gerekçe sessizce `undefined`,
her `kanitli` sessizce `false`. Puanlama "bildirilmedi"yi "sıfır"
sayardı — bu depodaki adıyla **BİLDİRİLMEYEN SIFIR DEĞİLDİR**.

**1654 sınamanın HİÇBİRİ düşmedi.** `judge.test.ts`,
`classify.test.ts`, `classify.e2e.test.ts` ve `score.e2e.test.ts`'in
fikstürleri de birlikte çevrilmişti: kendi içinde tutarlı, gerçek
ajanla değil. Isırmayan sınamanın ders kitabı örneği.

**DÜZELTME:** ham girdi arayüzleri (`RawVerdict`, `RawFinding`) Türkçe
alan adlarına döndü; ÇIKTI türlerinin (`JudgeVerdict`, `Finding`)
alanları İngilizce kaldı. Dört ad SABİT listeye eklendi: `alinti`,
`gerekce`, `kanitli`, `yakalandi`.

**KUSURU YAKALAYAN SINAMA:** `src/bench/prompt-sozlesmesi.test.ts`.
Fikstür KULLANMIYOR — promptun KENDİSİNDEKİ JSON örneğini okuyup gerçek
ayrıştırıcıdan geçiriyor. Promptla kod ayrışırsa düşer. Mutasyonla
doğrulandı: `alinti` yerine `quotation` okutunca hem hakem hem
sınıflandırıcı sınaması kırmızıya düşüyor, geri alınca yeşile dönüyor.

**GENEL KURAL (bu kusurun dersi):** bir alan adının SABİT olup
olmadığını anlamak için diskteki JSON'a bakmak YETMEZ. Ajana ne
söylediğimize de bakılacak: `hub/prompts/**` ve `bench/prompts/**`
içindeki her JSON örneği bir şemadır.

**12. ARAYÜZ AŞAMASI AÇILDI — doğru ayrım ÇAĞRI BAĞLAMI.**

§9 bu katmanı ertelemişti. Sorun, beklenen dizelerin içindeki kodu
çevirirken Türkçe sınama BAŞLIKLARINI ayırmaktı. İlk denemem "JS olarak
ayrışıyor mu" diye bakıyordu ve ayrışan başlıkları da çeviriyordu.

**ÇALIŞAN AYRIM — dizenin NEREDE kullanıldığı:**

| konum | karar |
|---|---|
| `it`/`test`/`describe`'ın İLK argümanı | ASLA dokunulmaz (başlık) |
| `fonksiyon`/`bildirim`/`fonksiyonlar`'ın ad argümanı | tam değiştirilir |
| `toContain`/`toMatch` argümanı, içinde kod işareti varsa | tanımlayıcı konumları çevrilir |
| düzenli ifade literali, içinde kod işareti varsa | tanımlayıcı konumları çevrilir |
| başka her dize | dokunulmaz |

**AYRIŞTIRICI DEĞİL TARAYICI (scanner).** Beklentiler betiğin bir ALT
DİZESİNİ doğruluyor, yani parça çoğu zaman dengesiz: `fetch("/kart/yeni"`.
Ayrıştırıcı bunları reddediyor ve o beklentiler sessizce çevrilmeden
kalıyordu. Tarayıcı dengeli sözdizimi istemiyor ve DİZE simgelerini ayrı
simge olarak veriyor — dize içindeki adlar kendiliğinden korunuyor.

**İKİ ÖLÇÜLEN KUSUR (ikisinde de `tsc` temizdi):**
1. Dize geçişi yalnızca üç UI dosyasında yapıldı; `ui/cli.test.ts` ve
   `ui/server.test.ts` de servis edilen HTML'in kaynak metnini
   doğruluyor → 3 sınama düştü. Dize geçişi HER sınama dosyasına
   yayıldı (tanımlayıcı geçişi hâlâ yalnızca üç dosyada: adlar orada
   bildiriliyor).
2. `/const JETON = "([^"]+)"/` bir DÜZENLİ İFADE literali, dize değil →
   "sayfada jeton bulunamadı". Regex literalleri de kapsandı.

**KAPSAM DÜZELTMESİ:** §9 bu katmanda "166 ad" kalmış diyordu. Gerçek
sayı, yalnızca o üç dosyada bildirilen adlar için **850**. Önceki sayım
sınırlı bir Türkçe kök listesine dayanıyordu.

**13. ARAYÜZ AŞAMASINDA ÇIKAN DÖRT SINIR DAHA.** Hepsinde `tsc` TEMİZDİ.

**(a) `dataset.X` = HTML'deki `data-X`.** `el.dataset.sekme` ile
`data-sekme="promptlar"` aynı çiftin iki yüzü; nitelik bir DİZEDE
yaşıyor. JS tarafını çevirmek çifti koparıyor: okuma `data-tab` arıyor,
HTML `data-sekme` yazıyor, değer hep `undefined`. ÖLÇÜLDÜ: nav rozeti
hiç güncellenmedi, üç tarayıcı sınaması ZAMAN AŞIMINA düştü. Araç artık
`dataset` özelliklerine hiç dokunmuyor.

Geçiş öncesiyle karşılaştırıldı: `dataset.kart` -> `card` ve
`dataset.yol` -> `path` önceki partilerde çevrilmiş ama o iki nitelik
hiçbir yerde dize olarak yazılmıyor (ne `page.ts`te ne sınamalarda),
yalnızca JS içinde yazılıp okunuyor — çift tutarlı, kırık yok.

**(b) `{ad}` sarılı adlar YER TUTUCU.** Akış YAML'ı
`plan: docs/plan/{kart}.md` yazıyor ve `snapshot.ts` `{kart}`/`{rol}`
yerine kimlikleri koyuyor. Bir beklentinin içindeki `{kart}`ı çevirmek
o sözleşmeyi kırıyor. Tarayıcıda bir adın iki yanında `{` ve `}` varsa
çevrilmiyor.

**(c) Dize geçişi YALNIZCA `src/ui/` altındaki sınamalarda.** Tüm
sınama dosyalarına yayılınca `flow/load.test.ts`in `"{kart}"`
beklentileri bozuldu ve 10 sınama düştü.

**(d) Kod işareti ayrımı DARDI.** İlk sürüm yalnızca `[=(){};]` ve
`const/function/return` arıyordu; `"m.engeller && m.engeller.length"` ve
`"canli ? \"Gözcüyü durdur\" : ..."` çevrilmeden kaldı. Ayrım Türkçe
düz metinde geçmeyen işaretlere bağlandı; en ayırt edici olanı
BOŞLUKSUZ NOKTA-HARF (`m.engeller`), çünkü Türkçe cümlede nokta SONDA
ve ardından boşluk gelir. `?` kuralı bilerek dar: yalnızca ardından
tırnak gelen üçlü işleç.

**ARACIN "DOKUNMADIM, BİLDİRDİM" DAVRANIŞI İŞE YARADI.** Bir OLUMSUZ
beklenti (`expect(src).not.toContain("m.engeller.length + \" kart")`)
yeni içerik tırnak taşıdığı için çevrilmedi ve bildirildi. Çevrilmemiş
hâliyle asla görünemeyecek bir dizeyi arıyordu — yani ISIRMAYAN bir
sınamaya dönüşmüştü. Elle düzeltildi. Sessizce atlanmış olsaydı
takımda yeşil görünen ölü bir beklenti kalırdı.

**14. AYNI KUSUR SINIFI İKİNCİ KEZ: KAYBOLAN HATA MESAJLARI.**

Sunucu 34 yerde `JSON.stringify({ hata })` gönderiyordu. Geçiş
istemcinin `.hata` okumalarını (23 yer) `.error` yaptı ama sunucunun
KISAYOL alanını atladı (kısayol hem bildirim hem özellik, bkz. §7).

Sonuç: o uçlardan gelen HER hata mesajı `undefined` geliyordu ve
istemci mesaj yerine ham durum koduna düşüyordu. **1656 sınamanın
hiçbiri düşmedi**, `tsc` temizdi. Mevcut beklentiler `.error` okuyordu
çünkü ZATEN İngilizce olan öteki uçları sınıyorlardı.

Bu, §7'deki prompt-kaydetme kusurunun AYNI sınıfı: sunucu alanı ile
istemcinin okuduğu ad ayrışıyor ve kırılma sessiz, çünkü betik bir
DİZEDE yaşıyor.

**DÜZELTME:** 34 yanıtın hepsi `{ error: hata }` (tel adı İngilizce,
yerel ad olduğu gibi).

**KUSURU YAKALAYAN SINAMA:** `src/ui/tel-sozlesmesi.test.ts`. İki tarafı
KAYNAK DÜZEYİNDE bağlıyor: `server.ts` ile `page.ts`in `<script>`
bölgesini okuyup alan adlarını karşılaştırıyor. Sunucu çalıştırmıyor,
o yüzden her koşuda ucuz. İki sınama:
1. Sunucunun gönderdiği hata alanı ile betiğin okuduğu ad aynı mı.
2. Betiğin POST gövdelerindeki her alan, sunucunun okuduğu adlar
   arasında mı (kısayol alanlar dahil — kusur tam orada çıktı).

Mutasyonla doğrulandı: sunucu bir yerde `{ hata }` gönderince 1. sınama
kırmızı; istemci gövdesine `metin` kısayolu konunca 2. sınama
`expected [ 'metin' ] to deeply equal []` diyor. İkisi geri alınınca
yeşil.

**15. EN AĞIR KUSUR: YENİ ROL EKLEMEK TAMAMEN KIRIKTI.**

Sunucu `request["sonra"]` okuyordu; istemci `afterRole` gönderiyordu.
Alan HİÇ okunmuyordu ve sunucu *"`sonra` boş olamaz"* diyordu — oysa
istemci DOLU gönderiyordu. `tsc` temizdi.

**Kendi yazdığım tel sözleşmesi sınaması bile kaçırdı:** istemci gövdeyi
satır içi nesne yerine bir DEĞİŞKENDE kuruyor
(`body: JSON.stringify(bodyPart)`) ve regex onu görmüyordu.

**DÜZELTME + ÜÇÜNCÜ SINAMA (ters yön):** sunucunun `request["x"]` ile
okuduğu her ad SABİT bir dize; o adın istemcide bir nesne alanı olarak
geçmesi aranıyor. Mutasyonla doğrulandı: sunucu tekrar
`request["sonra"]` okuyunca `expected [ 'sonra' ] to deeply equal []`.

**16. JSON ANAHTARI İÇ İÇE DİZEDE.** Beklenti
`const WATCHER_CONFIG = {"bayraklar":[...]}` idi. O `"bayraklar"`,
`JSON.stringify`ın ÇEVRİLMİŞ bir özellikten ürettiği anahtar — yani
değişmesi gerekiyordu. Araç iç içe dizeleri korur (betik DEĞERLERİ için
doğru), bu yüzden elle güncellendi. Ayrım: iç içe dize betiğin kendi
değeri mi, yoksa çevrilmiş bir özellikten üretilen anahtar mı.

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

---

## Kapanış — sınır kanıtı

Geçiş bitti. Aşağıdaki dört ölçü **bugün (9 Kasım 2026), bu ağaç
üzerinde** yeniden ölçüldü — hiçbiri önceki bölümlerden kopyalanmadı.
Komutlar tekrarlanabilir; `rg` (ripgrep) kullanıldı, `node_modules` ve
`.skein/` (gitignore'da) otomatik dışlanıyor.

### 1. Türkçe sınama başlıkları duruyor mu

```
rg -o '\b(it|describe)\(\s*"[^"]*[çğıöşüÇĞİÖŞÜ][^"]*"' -g '*.test.ts' | wc -l
```
→ **1774** (74 dosyada).

### 2. Serileşen SABİT alan adları hâlâ kodda mı

Her ad için: `rg -o '\bAD\b' -g '*.ts' -g '*.json' -g '*.jsonl' | wc -l`
(tekil geçişte toplam gerçek KULLANIM sayısı, satır sayısı değil —
bir satırda aynı ad birden çok geçebilir).

| ad | sayı | ad | sayı |
|---|---|---|---|
| `akis` | 194 | `kanitli` | 12 |
| `tema` | 120 | `yakalandi` | 18 |
| `kanit` | 34 | `sinif` | 31 |
| `itiraz` | 351 | `planlama` | 208 |
| `kabuller` | 38 | `planli` | 143 |
| `katilimcilar` | 129 | `plansiz` | 105 |
| `denetci` | 92 | `engelli` | 26 |
| `ilkTurKor` | 19 | `durum` | 350 |
| `yukumlulukler` | 24 | `ne` | 164 |
| `alinti` | 29 | `tur` | 364 |
| `gerekce` | 16 | `not` | 240 |

**SIFIR olan yok.** 22 adın hepsi en az bir yerde geçiyor — kusur
BULUNMADI. (Ölçüm `.skein/` içindeki ÇALIŞMA ZAMANI dosyalarını
KAPSAMIYOR — o dizin `.gitignore`'da, depoya ait değil, kodda sayılmaz.
Orada da aynı adlar üretiliyor olmalı ama bu kart o dizine bakmadı;
"ölçülemedi".)

### 3. Türkçe arayüz metni duruyor mu

```
rg -o 'METİN' src | wc -l
```

| metin | sayı |
|---|---|
| "Gözcüyü başlat" | 13 |
| "Kilidi devral ve başlat" | 7 |
| "Rolleri düzenle" | 26 |

Üçü de duruyor, sıfır yok.

### 4. `hub/prompts` ve `bench/prompts` altında Türkçe harf içeren dosya

Dosya ADLARI (basename) hiçbirinde Türkçe harf (çğıöşüÇĞİÖŞÜ) YOK —
dizin zaten ASCII-transliterasyonla adlandırılıyor (`siniflandir.md`,
`plan-itiraz.md`), bu bir kusur değil, var olan kural.

Dosya İÇERİĞİNDE Türkçe harf arandı
(`rg -l '[çğıöşüÇĞİÖŞÜ]' hub/prompts` / `bench/prompts`):

- `hub/prompts`: 7/8 dosya Türkçe içerik taşıyor. İstisna:
  `constitution/base.md` — bu dosya kasıtlı olarak İngilizce (orkestratör
  tarafından yazılan, her rol için ortak çekirdek; bu kart onu
  değiştirmedi, geçişten önce de İngilizceydi).
- `bench/prompts`: 5/5 dosya Türkçe içerik taşıyor.

### Derleme ve sınama

```
npx tsc --noEmit    → temiz, hata yok
npx vitest run      → 66 dosya, 1659 sınama, hepsi geçti
```

**Sonuç:** sınır duruyor. Kod tanımlayıcıları İngilizce, arayüz ve
sınama başlıkları Türkçe, ajana verilen JSON sözleşmesi (`bench/prompts`
alan adları) Türkçe, serileşen sabit alan adları hiçbiri sıfırlanmamış.
