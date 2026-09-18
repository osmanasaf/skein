# Devir Teslim — 2026-09-18

Bu dosya bir sonraki oturumun giriş noktası. Durum ajanın kafasında değil,
burada ve git'te (PHILOSOPHY 1). Yeni bir sohbete/projeye tek başına
yapıştırılabilsin diye yazıldı: aşağısı Skein'i tanımayan birine de yeter.

**Dal:** `claude/project-plan-brainstorm-pthvoc` — `claude/project-thread-sc56cs`
ileri sarılıp üstüne devam edildi, yani iki dalın işi bu dalda birleşti.
`sc56cs` olduğu yerde duruyor; yeni iş burada.
**Durum:** 592 test yeşil, typecheck temiz, `selftest` 5/5, ağaç temiz.
**Kod:** ~9.3k satır ürün + ~6.1k satır test.

---

## Skein nedir (tanımayan için üç paragraf)

Farklı satıcıların ajanlarını (Claude, Codex) **bildirime dayalı bir rol
topolojisi** üzerinden koşturan bir orkestratör. Bir iş bir **kart**; kart
rollerin arasında dolaşır; her rol kendi worktree'sinde çalışır; kod
dosya kopyalanarak değil **git'te** taşınır. Bir rol kabul ederse kart
ilerler, reddederse akış dosyasındaki ret hedefine geri döner, ret hakkı
biterse **kapı**da (gate) durup insanı bekler.

Tez: farklı satıcıların modelleri farklı kör noktalara sahip, dolayısıyla
birbirini denetlediklerinde tek modelin kaçırdığı kusur yakalanır. **Bu tez
hâlâ ölçülmedi** — ama ölçmenin önündeki engel artık teknik değil.

Uzun vadeli hedef bir kütüphane değil, bir **ajan geliştirme ortamı (ADK)**:
rolleri/görevleri tanımladığın, koşarken izlediğin, ne değiştirdiklerini
gördüğün yer. Kod editörü **değil** — bu sınır kasıtlı (`ARCHITECTURE.md`).

---

## Tek cümlede nerede kaldık

**Ölçüm takımı bitti; kalan tek iş koşmak — ve artık daha iyi bir
üreticiyle.** Bu oturumda eşik ölçüldü: `snapshot-store` görevinde
`claude-haiku-4-5` ve `claude-sonnet-5` üçer koşunun üçünde de **aynı iki
kancayı** kırmızıya düşürüyor, `claude-opus-5` üçünde de temiz. Yani
kampanya artık haiku sınıfına mahkûm değil; sonnet üreticisiyle koşulabilir
(koşu başına ~$0.07). Ayrıca dürüst bir kötü haber: Açık Soru #1'in
dayandığı `retry-backoff` kusuru bugünkü hatla **hiçbir modelde**
tekrarlanmadı. **Kalan tek iş hâlâ aynı: çapraz satıcı 2x2'sini koşmak** —
ve o, uzak konteynerde değil senin makinende yapılmalı (aşağıda sebebi;
bugün bir kez daha sınandı, vekil `api.openai.com` CONNECT'ini hâlâ 403 ile
kesiyor).

| # | Adım | Durum |
|---|---|---|
| 1 | `--serve` — gözcü uyur, kart düşünce uyanır | ✅ |
| 2 | `agent.step` — ajan koşarken günlüğe düşer | ✅ |
| 3 | Okuyucu ekran — pano, canlı adım, iz, diff | ✅ |
| 4 | Kapı ekrandan açılıyor | ✅ |
| 5 | Akış ekrandan kuruluyor | ✅ |
| — | Kusur üreten görev seti | ✅ |
| — | Körlenmiş puanlama + karar kuralı | ✅ |
| — | Tekrar grup içinde sayılıyor | ✅ |
| — | Hakem katmanı — 2. yer gerçeği | ✅ |
| — | Tur başına artefakt anlık görüntüsü | ✅ |
| — | Görev seti 5 → 8 | ✅ |
| — | **Eşik ölçümü: sonnet-5** | ✅ **bu oturum** |
| 6a | Plan belgesi akışın parçası | ✅ canlı koşuda doğrulandı |
| 6b | Plana itiraz turu (iki katılımcı, tek tur) | ✅ **bu oturum** |
| 6c-d | Çok tur, sayaç, körleme, ölçüm | 📐 tasarım hazır (`PLANLAMA.md`) |

---

## SENİN SIRADAKİ İŞİN — yerel çapraz satıcı koşusu

Bu bölüm sıradaki oturum için değil, senin için. Dört adım.

```bash
# 1. dalı al  (iş bu dalda; sc56cs geride kaldı)
git fetch origin claude/project-plan-brainstorm-pthvoc
git checkout claude/project-plan-brainstorm-pthvoc
npm install

# 2. kancalar sağlam mı — ajan çağırmaz, PARA HARCAMAZ
npx tsx src/bench/cli.ts selftest
#    beklenen: 8 görevin sekizi de "referansla hepsi yeşil"

# 3. codex gerçekten çağrılabiliyor mu
npx tsx src/bench/cli.ts doctor codex:gpt-5.5
#    "ÇALIŞIYOR" → hazırsın
#    "ÇALIŞMIYOR — ama bayraklar yüzünden değil" → ağ/oturum sorunu, adaptöre dokunma
#    "ÇALIŞMIYOR. Bayraklar yanlış olabilir" → codex sürümün farklı, DEFAULT_ARGS'ı düzelt

# 4. çapraz satıcı 2x2 — ÜÇ GÖREV × ÜÇ TEKRAR = 9 matris
#    Model çiftini dokuzunda da AYNI yaz; değişirse ayrı ölçüm grubu olur.
for g in snapshot-store csv-roundtrip async-pool; do   # + cache-refresh (aşağıya bak)
  for k in 1 2 3; do
    npx tsx src/bench/cli.ts matrix $g claude:claude-haiku-4-5-20251001 codex:<model>
  done
done

# 5. raporları puanla — önce kuru koş (ajan çağırmaz, PARA HARCAMAZ)
npx tsx src/bench/cli.ts puanla --kuru
npx tsx src/bench/cli.ts puanla claude:claude-opus-5

# 5b. 2. katman: bulguların kalitesi (ayrı hakem çağrısı, kodu da okur)
npx tsx src/bench/cli.ts siniflandir --kuru
npx tsx src/bench/cli.ts siniflandir claude:claude-opus-5

# 6. sonuç — hepsi, ya da tek görev
npx tsx src/bench/cli.ts report
npx tsx src/bench/cli.ts report --gorev=snapshot-store
```

**İzin modu:** konteynerde `--dangerously-skip-permissions` root altında
reddediliyor; kendi makinende gerekmeyebilir. Gerekirse
`SKEIN_PERMISSION_MODE=acceptEdits` ver. Dört hücrede de aynı olmalı,
yoksa karşılaştırma bozulur — koşuda ekrana basılıyor, bir bak.

**Üretici seçimi — 18 Eylül ölçümünden sonra güncellendi.** Kusur
üretmeyen üreticiyle denetim ölçülemez; `matrix` bunu fark edip denetim
hücrelerini **atlıyor** ("Ölçüm gücü yok"). Elde iki seçenek var:

| Üretici | Nerede kusur üretiyor | Koşu maliyeti |
|---|---|---|
| `claude-haiku-4-5-20251001` | 4 görevde (`snapshot-store`, `csv-roundtrip`, `async-pool`, `cache-refresh`) | $0.04–0.19 |
| `claude-sonnet-5` | yalnızca `snapshot-store` — ama 3/3 koşuda, aynı iki kanca | ~$0.07 |

`claude-opus-5` sekiz görevin on iki koşusunda hiç kusur üretmedi; üretici
olarak seçme.

**Önerim: ikisini de koş, ama farklı kapsamda.** Haiku ile dört görev
(geniş taban), sonnet ile yalnızca `snapshot-store` (güçlü sınıfta tek ama
belirlenimci hücre). İkincisi "zaten zayıf model kusur üretti" itirazını
kapatır. Bunlar iki ayrı **ölçüm grubu** olur ve `report` onları zaten ayrı
raporlar — karıştırma riski yok.

Codex tarafında güç sınıfı yakın bir model seç, yoksa aynı duvara
çarparsın.

**Maliyet:** bir 2x2 = 2 üretim + 4 denetim. Üretim haiku'da $0.04–0.13,
`claude-opus-5`'te $0.17–0.47. `retry-backoff` üzerindeki eski bir matris
toplamda $0.93 tutmuştu. Üç görev × k=3 kabaca **$12–15**.

**Üç görev de koşulmalı** (`snapshot-store`, `csv-roundtrip`, `async-pool`).
Tek görevlik sonuç "bu görevde" der.

**Dördüncü aday: `cache-refresh`.** Haiku'da 22 kancanın 10'u kırmızı, yani
en güçlü ölçüm hücresi elde bu. Kampanyaya eklemek maliyeti üçte bir
artırır (~$4-5); bütçe elveriyorsa değer, çünkü kusur oranı yüksek olan
hücre denetim farkını en net gösteren hücredir. `config-patch`,
`outbox-flush` ve `retry-backoff`'ı koşma: üçünde de bugünkü modeller
kusur üretmiyor.

**Sonnet kolu (isteğe bağlı, ~$3):**

```bash
for k in 1 2 3; do
  npx tsx src/bench/cli.ts matrix snapshot-store claude:claude-sonnet-5 codex:<model>
done
```

**Ölçüm gücü yoksa** `matrix` denetimi atlar ve sebebini yazar. Yine de
koşturmak istersen `--force`.

**Sonrasında:** `report` hücre tablosunu, göreli azalmayı, etkileşim
terimini ve önceden ilan edilmiş karar kuralının verdiği kararı basar.
Sayılar `.skein/events.jsonl`'den gelir, ekrana basılan metinden değil.

**k=1 ile karar çıkmaz, bilerek:** tek koşuda `report` sayıyı gösterir ama
"YETERSİZ" der. Karar için k≥3 — DESIGN'ın kendi kuralı, artık kodda.

**k GÖREV BAŞINA sayılır.** Üç görevi birer kez koşmak k=3 değildir, üç ayrı
k=1'dir; `report` bunu artık ayırt ediyor (18 Eylül düzeltmesi, aşağıda).
Aynı sebeple: model çiftini kampanya ortasında değiştirirsen o koşular ayrı
bir gruba düşer ve iki grubun da k'sı ayrı sayılır.

---

## Ne çalışıyor

```
npx tsx src/flow/cli.ts check <akış>            topolojiyi doğrula + maliyet
npx tsx src/card/cli.ts new|ls|show|kapat …     kartı elle sür
npx tsx src/watch/cli.ts <akış> --model …       orkestratör (toplu koşu)
npx tsx src/watch/cli.ts <akış> --serve …       gözcüyü açık bırak
npx tsx src/flow/cli.ts check hub/flows/plan.yaml   planlı örnek akış (6a)
npx tsx src/flow/cli.ts check hub/flows/plan2.yaml  itiraz turlu akış (6b)
npx tsx src/ui/cli.ts <akış> [--port N]         ekran (127.0.0.1)

npx tsx src/bench/cli.ts selftest [görev]       kancalar sağlam mı (bedava)
npx tsx src/bench/cli.ts doctor <sağ:model>     CLI çağrılabiliyor mu
npx tsx src/bench/cli.ts <görev> [sağ] [model]  tek üretim + gizli testler
npx tsx src/bench/cli.ts matrix <görev> A B     2x2 çapraz kurgu
npx tsx src/bench/cli.ts puanla [model] [--kuru] raporları körlenmiş puanla
npx tsx src/bench/cli.ts turlar [hücre] [--diff] turlar arası fark
npx tsx src/bench/cli.ts report                 ölçüm özeti + karar
```

**Bayrak verirken `npm run` kullanma** — bazı npm sürümleri `--` sonrasını
kendi seçeneği sanıp sessizce yutuyor. `RUNNING.md` üç adımlık başlangıcı
ve Windows notlarını içeriyor.

| Parça | Dosya |
|---|---|
| Akış yükleyici — 16 kural, zincir sırası, topoloji hash'i | `src/flow/load.ts` |
| Akışın yaşayan hâli — atomik + doğrulanmış yeniden yükleme | `src/flow/live.ts` |
| Akış taslağı — YAML üretimi, doğrulama, atomik yazma | `src/flow/draft.ts` |
| Maliyet tahmini — ret kenarları dahil | `src/flow/cost.ts` |
| Kart — geçmiş, ret sayaçları, donmuş topoloji | `src/card/card.ts` |
| Kuyruk — atomik geçiş, kilitsiz sahiplenme, çökme toplama | `src/card/queue.ts` |
| Kapı kararı — kartı taşır, `gate.released` düşer | `src/card/release.ts` |
| Yetim kart — tanım, kapatma, gerekçe | `src/card/orphan.ts` |
| Gözcü — tur, verdikt, yönlendirme | `src/watch/tick.ts` |
| Uzun ömürlü gözcü — uyu/uyan, yetim duyurusu | `src/watch/serve.ts` |
| Tek yazıcı kilidi — bayat kilidi devralır | `src/watch/lock.ts` |
| Git katmanı — ileri birleştirme, syncBack, worktree | `src/watch/git.ts` |
| Canlı adımlar — `stream-json` → `agent.step` | `src/adapters/claude.ts` |
| Codex adaptörü — bayrakları `0.155.0`'da doğrulandı | `src/adapters/codex.ts` |
| Ekran — okuma modeli, yerel sunucu, tek dosya sayfa | `src/ui/` |
| Olay günlüğü — dar tip birliği + `REQUIRED` haritası | `src/events/log.ts` |
| Görev yükleyici — katı doğrulama, `seed/`, `hidden/` | `src/bench/task.ts` |
| Üretim — seed önce, gizli test sonra, kaçış denetimi | `src/bench/produce.ts` |
| Kanca doğrulama — referans çözüme karşı koşar | `src/bench/selftest.ts` |
| 2x2 orkestrasyonu + ölçüm gücü koruması | `src/bench/matrix.ts` |
| Körlenmiş puanlama + alıntı doğrulaması (1. katman) | `src/bench/judge.ts` |
| Bulgu sınıflaması — gerçek/nit/yanlış (2. katman) | `src/bench/classify.ts` |
| Gürültü raporu — karara girmeyen taraf | `src/bench/noise.ts` |
| Tur anlık görüntüsü — kopya, LCS farkı, sayaç | `src/bench/snapshot.ts` |
| Puanlanacak hücreleri günlükten çıkarma | `src/bench/score.ts` |
| Ölçüm grupları, etkileşim terimi, ilan edilmiş karar | `src/bench/effect.ts` |
| Ağ hatasını bayrak hatasından ayırma | `src/bench/failure.ts` |

---

## Yeniden açılmayacak kararlar

Hepsinin gerekçesi `ARCHITECTURE.md`'de; burada yalnızca özeti:

1. **Durum yüzeyde tutulmaz.** Ekran okur; yazacaksa çekirdeğe *komut*
   gönderir, kendi kopyasını güncellemez.
2. **Kartın yeri dizindir.**
3. **Olay günlüğü yalnızca eklenir, tipi dardır.**
4. **Topoloji kartta donar.**
5. **Ajan kendi akışını değiştiremez.**
6. **Kod git'te taşınır.**

**Yerel DB (H2 vb.) gerekmiyor.** Sorgu ihtiyacı doğarsa cevap SQLite, ve
**türetilmiş indeks** olarak — testi: `rm .skein/index.db` dedikten sonra
hiçbir şey kaybolmamalı.

**Kapı üç tiptir ve karıştırılmaz** (`gate.kind`): `approval`, `deadlock`,
`escalation`. `forward` kararı kaçış kapısından **reddedilir**.

**Yetim kart**: görünür kılınır, tek meşru çıkışı `kapat`.

**Yeni:** **Elle tohumlanmış hata yasağı bağlam için geçerli değil.** Tez
modelin *kendi* kusuru hakkında, o yüzden hatayı insan koyamaz. Ama
`seed/` ile verilen **mevcut kod** tohumlanmış hata değil, tohumlanmış
bağlamdır — ve kör noktanın ortaya çıktığı yer tam orası.

---

## Ölçülmüş olan, ölçülmemiş olan

**Ölçülmüş — mekanizma:** 4 rollü `spec` akışı gerçek ajanlarla uçtan uca
koştu (4 aktivasyon · 4 dk 20 sn · $0.42).

**Ölçülmüş — audit gate** (`claude-opus-5`, `retry-backoff`, 9 kanca):
kapısız (n=5) ortalama 0.80 kırmızı kanca / $0.0743; kapılı (n=3) 0.00
kırmızı / $0.5361 (7.2x maliyet). Denetim katmanı ilk kez gerçek bir kusur
yakaladı — ama üretici ile denetçi **aynı modeldi**. Yani bulgu *ayrı bir
denetim turunun* değerini gösteriyor, *çapraz satıcı denetiminin* değil.

**Ölçülmüş — görev kalibrasyonu (17-18 Eylül, k=1):**

| Görev | Kanca | `claude-haiku-4-5` | `claude-sonnet-5` | `claude-opus-5` |
|---|---:|---|---|---|
| `snapshot-store` | 16 | **14/16** (3/3 koşu) | **14/16** (3/3 koşu) | temiz (3/3) |
| `cache-refresh` | 22 | **12/22** | temiz | temiz |
| `csv-roundtrip` | 18 | **17/18** | temiz | temiz |
| `async-pool` | 12 | **10/12** | temiz | temiz |
| `config-patch` | 25 | temiz | — | temiz (×2) |
| `outbox-flush` | 17 | temiz | — | temiz |
| `token-bucket` | 14 | temiz | temiz | temiz |
| `retry-backoff` | 9 | temiz (3/3) | temiz (3/3) | temiz (3/3) · eski kayıt: 5'te 4 kusurlu |

Belirtilmeyen hücreler k=1; `snapshot-store` ve `retry-backoff` satırları
k=3 ve üç koşunun üçünde de aynı sonuç.

Üçü de **önceden tarif edilmiş** kusuru üretti; kancalar tahminle yazılmıştı
ve tahmin tuttu. `snapshot-store`'da geri alma geçmişi baştan oynattı ve
`version` geriye düştü; `csv-roundtrip`'te `parse("")`ın `[[""]]` dönmesi
gerektiği türetilemedi; `async-pool`'da hata yolunda kuyruk beslenmeye
devam etti.

**Ölçülmemiş:** merkezî tezin kendisi. Dört hücre hiç koşmadı. Artık
eksik olan tek şey **koşunun kendisi**: ölçen, puanlayan ve karar veren
katmanların üçü de yazılı ve testli.

**Bilinen sınır:** eşik `snapshot-store` sınıfında **sonnet-5 ile opus-5
arasında**. Opus sekiz görevin on iki koşusunda hiç kusur üretmedi; sonnet
yalnızca `snapshot-store`'da üretti, haiku dört görevde üretti. Yani
"frontier model kusur üretmiyor" değil: bu görevlerin ona kolay geldiği,
ve zorluğun yazılmış kural sayısından değil **komşu modülden türetilen
gereksinimden** geldiği ölçüldü.

---

## Bu oturumda ne yapıldı — eşik ölçüldü

Haiku kusur üretiyordu, opus üretmiyordu; arada ne olduğu bilinmiyordu.
20 canlı koşu (~$2.4) ile ölçüldü.

| Görev | Kanca | `claude-haiku-4-5` | `claude-sonnet-5` | `claude-opus-5` |
|---|---:|---|---|---|
| `snapshot-store` | 16 | **14/16** (3/3) | **14/16** (3/3) | temiz (3/3) |
| `retry-backoff` | 9 | temiz (3/3) | temiz (3/3) | temiz (3/3) |
| `csv-roundtrip` | 18 | **17/18** | temiz | temiz |
| `async-pool` | 12 | **10/12** | temiz | temiz |
| `cache-refresh` | 22 | **12/22** | temiz | temiz |

### Eşik: komşu modülü okuyup okumamak

`snapshot-store` **bütün bir model katmanını aşıyor** ve kusur belirlenimci:
haiku ve sonnet, üçer koşunun üçünde de **aynı iki kancayı** düşürdü
(`version geri gitmez`, `version hiçbir zaman tekrar etmez`).

Üç `undo` yan yana konunca fark bir puan değil, bir davranış:

```ts
// haiku ve sonnet — ikisi de geçmişi baştan oynatıyor
this.#history.pop();
this.#state = this.#history.reduce(apply, BOS);   // version geriye düşer
```

```ts
// opus — kendi yorumuyla
// "Eski State nesnesini geri takmak cazip ama yanlış olurdu: version
//  türetilmiş hesapların önbellek anahtarı (bkz. selector.ts)."
```

Yani eşik "daha iyi kod" değil: **değiştirdiği modülün TÜKETİCİSİNİ
okumak.** `selector.ts` sürüme göre önbellekliyor, bu spec'te yazmıyor.
Dünkü dersin ikinci kanıtı: ölçüm gücü yazılmamış ama komşu modülden
türetilebilir gereksinimden geliyor.

### Kötü haber: Açık Soru #1'in sayısı tekrarlanmadı

Audit gate ölçümünün dayandığı kusur (`retry-backoff` × opus, eski kayıt:
5 koşuda ortalama 0.80 kırmızı kanca) bugün **hiçbir modelde** çıkmadı —
üç model, üçer koşu, hepsi 9/9 temiz. Üç aday sebep var ve hiçbiri elenmiş
değil: (1) o ölçümden sonra görev metninin geçiş yolu iki kez değişti,
(2) üretim ajanının araçları `Read,Write,Edit` ile sınırlandı, (3) aynı ad
altındaki model değişmiş olabilir.

Sayı iptal edilmiyor — o koşular gerçekten oldu — ama **tekrarlanabilir
bulgu sayılamaz** ve DESIGN'daki bölümün başına bu uyarı düşüldü. Yeniden
ölçmek için kusur üreten bir hücre gerekiyor; bugün o hücre
`snapshot-store` × {haiku, sonnet}.

### Kampanya için sonucu

Ölçüm gücü olan üretici artık haiku sınıfıyla sınırlı değil:
**`snapshot-store` × `claude-sonnet-5`** belirlenimci kusur üretiyor,
koşu başına ~$0.07. Çapraz satıcıda üretici olarak sonnet kullanmak sonucu
daha güçlü bir sınıfa taşır ve "zaten zayıf model kusur üretti" itirazını
zayıflatır.

### Ve 6a yazıldı: plan belgesi akışın parçası

Tasarımın ilk aşaması kodda. Akış artık `planlama` bloğu tanımlayabiliyor;
zincirin başındaki rol bir plan belgesi yazıp commit'liyor, sonraki roller
planın yolunu iş metninde alıp okuyor.

**Asıl mekanizma bir kapı, talimat değil:** planı yazan rol "kabul" dediğinde
plan dosyası **diskte aranıyor**. Yoksa ya da boşsa devir teslim olmuyor,
kart insana çıkıyor. "Belge üreten rolün çıktısı kayboluyor" kusuru bir kez
yaşanmıştı ve çözümü prompta yazmaktı — prompt talimattır, kapı değil.

Yazılmamış alanlar sessizce yok sayılmıyor: `planlama.tur` yazarsan akış
"henüz uygulanmadı, 6b'nin konusu" diyen bir hatayla reddediliyor.

**Bitiş testi canlı koşuda geçildi** (`plan.yaml`, planner → coder →
reviewer, `claude-sonnet-5`):

- `planner` planı yazıp commit'ledi (107 satır: dokunulacak dosyalar,
  satır aralıkları, korunacak sözleşme, kapsam dışı).
- `coder` devir özetinde plana atıf yaptı — planın koyduğu sözleşmeyi
  ("model.ts tam hash taşır, kısaltma page.ts'in işi") uyguladı.
- `reviewer` işi **plana karşı** denetledi ("testler planın izin verdiği
  stile uygun", "kapsam dışı alanlar"). Plan yalnızca bilgi taşımadı,
  denetimin ölçütü oldu — tasarımda beklenmeyen bir yan etki.

Ajanların ürettiği iş (ekranın kart detayında plan yolu + sürüm) bu dala
birleştirildi; **testleri ve typecheck'i ben koşturdum** — ajanlar
koşturamadı (sandbox'ta Bash izni yok) ve "statik okumayla doğruladım"
dediler. 565 test yeşil.

Koşunun çıkardığı iki tuzak:

- **İzin modu ile git.** `acceptEdits` dosya yazdırır ama `git add`
  yaptırmaz. Orkestratörü canlı koşarken `--allow-tool "Bash(git:*)"`
  gerekiyor; `SKEIN_PERMISSION_MODE` yalnızca bench yolunda okunuyor,
  orkestratörde bayrak var: `--permission-mode`.
- **`.worktrees/` vitest'e giriyordu.** Orkestratör her rol için deponun
  bir worktree'sini açıyor; kökten koşan vitest oradaki kopyaları da
  topluyordu ve canlı koşudan sonra `npm test` 16 uydurma kırmızı
  veriyordu. Yapılandırmaya dışlama eklendi.

### Ayrıca: adım 6'nın tasarımı yazıldı (`PLANLAMA.md`)

Kod değil, kararlar. Özeti:

- **Alışverişin taşıyıcısı dosya, sohbet değil.** `docs/plan/<kart>.md` ve
  `<kart>.itiraz.md`; transkript diye ayrı bir şey yok. Bir sonraki tur
  "önceki mesajları hatırla" değil "dosyayı oku"dur.
- **İtirazın zorunlu üç alanı:** ne, neden, **neyi yanlışlar** — ve sonuncu
  depodan bir yere işaret etmek zorunda (dosya/satır/test adı). Yolu
  olmayan itiraz geçersiz. Bu kural doğrudan bugünkü ölçümden geliyor:
  eşik, komşu modülü okuyup okumamaktı.
- **Tur 1 kör.** İlk turda katılımcılar birbirinin itirazını görmez —
  2x2'deki "aynı artefakt, bağımsız iki denetçi" mantığı. Yakınsama
  sonraki turlarda serbest; korunan şey ilk bağımsız görüş.
- **Üç çıkış, yeni kart durumu yok:** anlaşma → ilerler; tur limiti dolup
  açık itiraz kalırsa → deadlock kapısı; tur hiç tamamlanmazsa → kaçış
  kapısı. Mevcut kapı makinesi aynen kullanılıyor.
- **Planı yalnızca insan yeniden açar.** Downstream "plan yanlışmış"
  diyebilir ama kartı planlamaya geri gönderemez: plan↔kod döngüsünün üst
  sınırı yok.
- **Akış diline dört kural (17-20), iki yeni olay**, ve maliyet formülü:
  `katilimci × tur`. İki katılımcı iki tur, tipik kartın maliyetini iki
  katına yakın çıkarır — çıtayı da bu belirliyor.
- **Önceden ilan edilmiş ölçüt:** planlama açık/kapalı A/B, k≥3; downstream
  ret sayısında ≥%20 azalma olumlu, <%10 olumsuz; ayrıca "kabul edilen
  itiraz oranı" ve "itirazsız alışveriş oranı" — ikincisi yüksekse
  mekanizma tören demektir.
- **Reddedilenler gerekçeleriyle:** serbest sohbet, paylaşılan scratchpad,
  oylama (ortak kör noktayı oy birliğiyle onaylar), ajanlar arası doğrudan
  mesajlaşma.

Aşamalı yol 6a→6d ve her aşamanın bitiş testi belgede. **6a (plan dosyası,
alışveriş yok) ölçümü beklemeden yazılabilir**; 6b ve sonrası tezin üstüne
bina kurduğu için ölçümden sonra.

---

## Önceki oturumda ne yapıldı — görev seti 5'ten 8'e

Üç yeni görev, üçü de "mevcut koda dokun" sınıfında ve her biri ayrı bir
tuzağı hedefliyor:

| Görev | Kanca | Tuzak |
|---|---:|---|
| `cache-refresh` | 22 | Geçersiz kılmadan önce başlamış yükleme, taze değerin üstüne yazabilir (çağ sayacı gerekiyor) |
| `config-patch` | 25 | Değişmeyen alt ağaç kimliğini korumalı; `render.ts` kimliğe göre önbellekliyor |
| `outbox-flush` | 17 | Taşıyıcı kimliğe göre tekilleştiriyor; yeniden deneme aynı kimlikle olmalı |

`config-patch` yeni bir kanca biçimi de getirdi: **tohumu sabit rastgele
diziler** (300 ağaç/yama çifti, bağımsız bir uygulamaya karşı). Gerekçe:
elle yazılmış yirmi örnek, elle yazılmış bir çözümün *düşündüğü* yirmi
durumu ölçer.

### Kalibrasyon — ve dürüst sonuç

| Görev | Naif çözüm | `claude-opus-5` | `claude-haiku-4-5` |
|---|---|---|---|
| `cache-refresh` | 18/22 | **22/22 temiz** | **12/22 — 10 kırmızı** |
| `config-patch` | 17/25 | **25/25 temiz** | 25/25 temiz |
| `outbox-flush` | — | **17/17 temiz** | 17/17 temiz |

Naif çözümü elle yazıp kancalara karşı koştum: üçünde de hedeflenen tuzağa
tam olarak düştü, yani kancalar ölçmek istedikleri şeyi ölçüyor.

**Ama hedef tutmadı.** İş "frontier modelde de kusur üreten görev" idi;
`claude-opus-5` üçünü de (config-patch'i rastgele kancalar eklendikten
sonra tekrar) temiz çözdü. Sekiz görev, dokuz tek-atış koşu, sıfır
kanıtlanmış kusur.

### Bundan çıkan ders

Tuzakları bilerek zor seçtim — çağ sayacı, yapısal paylaşım, kimlik
kararlılığı. Üçü de işe yaramadı ve sebebi sonradan açık: **spec her köşeyi
tek tek yazıyordu.** Her kural yazılıysa iş kuralları uygulamaktır ve
frontier model bunu yapar. Kusur üreten örnekler bunun tersi: `snapshot-store`
haiku'da kusur üretiyor çünkü kritik gereksinim spec'te değil
`selector.ts`'te yaşıyor.

`outbox-flush` bu ilkeyle tasarlandı (kimlik kuralı yalnızca `sink.ts`'te
yazılı) ve yine de iki modelde de temiz çıktı — yani "yazılmamış gereksinim"
tek başına yetmiyor; gereksinimin **türetilmesi de zor** olmalı. Sıradaki
görev yazan bunu baştan bilsin.

### `cache-refresh` × haiku: kusur sınıfı kayda değer

Kusuru tur anlık görüntüsünden okudum (dün yazılan `cli.ts turlar`). Model
çağ sayacını doğru kurmuş, ama yanına **hiç temizlenmeyen** bir küme
koymuş: bir anahtar bir kez geçersiz kılındıysa bir daha asla önbelleğe
yazılamıyor. On kırmızı kancanın kök sebebi tek. Doğru fikir + yanlış
ikinci mekanizma — ve denetçinin "bu küme nerede temizleniyor" diye sorarak
yakalayabileceği türden, yani ölçüm için aranan kusur.

### Sete kabul durumu

- **`cache-refresh` kampanyaya girer** (haiku tarafında ölçüm gücü var).
- **`config-patch` ve `outbox-flush` kalibre edilmedi**: iki modelde de
  temiz. Depoda duruyorlar, naif çözüme karşı güçleri kanıtlı, ama bugünkü
  iki üreticiyle ölçüm üretmiyorlar — `matrix`in kendi koruması zaten
  atlayacak.

**Harcama:** 6 canlı koşu, toplam ~$1.87.

---

## Daha önce — tur başına anlık görüntü

**Sınır şuydu:** ajan dosyayı **yerinde** değiştiriyor, yani bir turun
sonundaki hâl bir sonraki turda kayboluyor. Koşu bittikten sonra elde
yalnızca son artefakt kalıyordu ve "denetim turunda tam olarak ne değişti"
sorusu ona bakıp tahmin ediliyordu. Parmak izi zaten "değişti mi"yi
söylüyordu; eksik olan **neye dönüştü**ydü.

Artık her tur hücrenin altına kopyalanıyor (`turlar/00-tohum`,
`01-uretim`, `02-denetim-1`…) ve `cli.ts turlar [hücre] [--diff]` ile
okunuyor. Gerçek çıktı:

```
tur 1 (uretim): 1 dosya, +3/−0
tur 2 (denetim-1): 1 dosya, +1/−0
    +  if (limit < 1) throw new RangeError('limit');
tur 3 (denetim-2): HİÇBİR ŞEY DEĞİŞMEDİ
```

Son satır ayrıca bir ölçü: kapının kabul turu tam olarak orası, ve
"mekanizma tören mi gerçek mi" sorusu artık `changedRounds` sayısından
değil turun kendisinden okunuyor.

**Üç karar:**

1. **Kopya, damganın yerine geçmez.** Damga "değişti mi"yi ucuza cevaplar;
   kopya "neye dönüştü"yü **sonradan** cevaplanabilir kılar. Yalnızca damga
   saklansaydı sınır kalkmaz, ölçülmüş olurdu.
2. **Tohum turu ayrı saklanıyor.** `seed/` verilen görevlerde ölçmek
   istediğimiz şey ajanın MEVCUT kodda neyi değiştirdiği; tohum turu
   olmadan o fark hiç yok.
3. **Anlık görüntü gizli testler kopyalanmadan ÖNCE alınıyor.** Sonra
   alınsaydı her üretim turu, ajanın hiç görmediği dosyaları da değişmiş
   gösterirdi — testle bağlandı.

**Fark satır satır (LCS), kaba sayım değil:** "kaç satır arttı" ölçüsü aynı
uzunlukta yeniden yazılmış bir dosyayı "değişmemiş" gösterirdi. 4000 satır
üst sınırı var; üstünde "hepsi değişti" der — abartır ama sessizce yanlış
olmaz.

**Okuma kopyalardan, günlükten değil:** `turlar` özet alanlarına değil iki
tur dizinine bakıp farkı yeniden hesaplıyor.

**Kopyanın bütünlüğü sınanıyor:** `turlar`, tur dizininin parmak izini
günlüktekiyle karşılaştırıyor. Tutmuyorsa fark yine hesaplanıyor ama
"bu artık koşunun kaydı değil" diye uyarıyor — koşudan sonra elle
değiştirilmiş bir tur sessizce kanıt yerine geçmesin.

**Orkestratörde bilerek yok.** Kartın turu zaten git'te: rol kendi
worktree'sinde commit atıyor, ekran `git show --numstat` ile gösteriyor.
Aynı mekanizmayı ikinci kez kurmak "kod git'te taşınır" değişmezinin yanına
ikinci bir tarih kaynağı koymak olurdu.

---

## Daha önce — 2. yer gerçeği

**DESIGN'ın iki katmanından ikincisi yazıldı.** Nesnel katman yalnızca
kanıtlanmış kusurları görüyor (kırmızı gizli test); raporun geri kalanı —
tasarım itirazı, isim önerisi, uydurulmuş iddia — hiç sayılmıyordu.
`siniflandir` komutu artık her bulguyu **gerçek / nit / yanlış / belirsiz**
diye ayırıyor.

**1. katmandan üç şeyde bilerek ayrı:**

| | `puanla` (1. katman) | `siniflandir` (2. katman) |
|---|---|---|
| Yer gerçeği | Kırmızı test — tartışmaya kapalı | Hakem görüşü — itiraz edilebilir |
| Hakem kodu görür mü | Hayır | **Evet** — yanlış pozitif ancak kod okunarak ayrılır |
| Hücre şartı | Kanıtlanmış kusur olmalı | Kanıtlanmış kusur **aranmaz** |

Üçüncüsü ters görünür ama sebebi net: kusursuz üretilmiş kodun raporu
nesnel katman için ölçüm gücü taşımaz, gürültü için ise en temiz örnektir —
oradaki her bulgu ya nit ya yanlış pozitiftir. O hücreleri atlamak gürültü
ölçümünü sistematik olarak kusurlu kodlara daraltırdı.

**Harmanlanmama bir yorum değil, sınanan bir özellik.** Ayrı olay
(`judge.classified`), ayrı dizin (`siniflama/`), ayrı rapor bölümü, ve bir
test: çapraz hücreleri gürültüyle dolduran, aynı hücreleri tertemiz
gösteren bir sınıflama eklendiğinde kararın ve bütün nesnel sayıların
**bit bit aynı** kaldığı doğrulanıyor.

**Kanıtlı bulgular oranların dışında:** bir bulgu kırmızı kancayı tarif
ediyorsa `kanitli` işaretlenip 2. katmanın paydasından çıkarılıyor. Aksi
hâlde aynı bulgu iki katmanda birden puan üretirdi.

**Körleme koda da uygulanıyor.** Üretim ajanının yorum satırına bıraktığı
bir imza (`// claude tarafından yazıldı`) hakemin körlüğünü rapor tarafından
değil kod tarafından bozardı; test bunu artık ajana giden metnin üstünde
doğruluyor.

**Alıntı kuralı aynı, yönü farklı:** alıntısı raporda bulunamayan bulgu
1. katmanda denetçinin aleyhine sayılıyor (kaçırma), burada bulgunun kendisi
düşüyor. Uydurulmuş bir bulguyu "yanlış pozitif" saymak, denetçiyi hakemin
hatasıyla cezalandırmak olurdu.

**Ayrıca — yolda çıkan bir kusur:** `--yeniden` ile yeniden puanlanan
hücre günlüğe ikinci bir kayıt bırakıyor ve **ikisi de sayılıyordu**. Yani
bir hücre iki kez sayılıyor, oran da düzeltilmiş puanla eskisinin
ortalaması oluyordu — yeniden puanlama yarı yarıya geri alınıyordu.
Doğrulandı (10 kancalık bir hücre 20 kanca sayıldı), düzeltildi: hücre
başına **son** kayıt geçerli. Her iki katmanda da.

**Maliyeti ölçülmedi.** Bu hakem koda da baktığı için promptu 1. katmandan
büyük ve hücre sayısı da fazla (kanıtlanmış kusur şartı olmadığı için).
Kampanyada önce tek görevde koş, faturayı gör, sonra kalanına geç.

---

## Daha önce — tekrarın sayılma biçimi

**Bulunan hata, ölçümün kendisindeydi.** Karar kuralının "k≥3" şartı kodda
**koşu sayısıyla** ölçülüyordu, ve bir koşu = bir matris = bir görev.
Yani üç farklı görevi birer kez koşmak "k=3" görünüyor ve karar kuralını
açıyordu. Aynı sentetik günlük iki sürüme verildi:

```
ESKİ: k = 3   karar = OLUMLU   (%67 azalma, "3 tekrarın hepsinde aynı yönde")
YENİ: gorev-1:k=1 gorev-2:k=1 gorev-3:k=1   karar = YETERSİZ
```

Kural, tam da engellemek için yazıldığı hatayı yapmaya izin veriyordu — ve
bu, $12-15'lik koşu bittikten SONRA fark edilecekti.

**Düzeltme:** ölçüm grubu = **görev × model kurgusu**. k grubun içinde
sayılır, karar grup seviyesinde verilir (`src/bench/effect.ts`). Kurgu
ayrımı ikinci bir sessiz hatayı da kapatıyor: ölçüm gücü çıkmayınca modeli
değiştirmek gerçek bir senaryo ve eski hesap iki kurgunun hücrelerini tek
oranda topluyordu.

**Gruplar çelişirse karar `belirsiz`** ve hangi sınıfın hangi yöne gittiği
yazılıyor. Havuzlanmış oran hâlâ basılıyor ama kararın kaynağı değil:
görevlerin kanca sayıları eşit değil (16/18/12), yani havuz ağırlığı kanca
çoğunluğu olan göreve verir. Gerçek bir örnekte havuz %25 azalma (olumlu
görünüm) gösterirken alt sınıflardan biri %-200 çıkıyor.

**Eşikler değişmedi** (%20 / %10) ve bu ek **hiçbir çapraz satıcı verisi
görülmeden** yazıldı — dört hücre hâlâ koşulmadı. `bench/DESIGN.md`'de
"Ek — 18 Eylül" olarak duruyor.

**Ayrıca:** `report --gorev=<id>` ile günlük tek göreve daraltılabiliyor
(eski koşular aynı dosyada birikiyor).

---

## Daha önce — puanlama katmanı

**Boşluk şuydu:** `matrix` bitiyor, elde dört `rapor.txt` kalıyor, ve ana
metriği (kaçırma) hesaplayan hiçbir şey yok. Puanlama elle yapılacaktı —
raporu okuyan kişi hangi hücrenin çapraz olduğunu bilerek okuyarak. Deneyin
en pahalı adımı bitmiş, cevabı veren adım yazılmamıştı.

**Yazılan üç parça:**

- `judge.ts` — bir raporu kanıtlanmış kusurlara karşı puanlar. Puanlayıcı
  kimin ürettiğini, kimin incelediğini, hücrenin çapraz olup olmadığını
  **görmez**; rapordaki model ve satıcı adları maskelenir (kaç yerde
  maskelendiği kaydedilir).
- `score.ts` — hangi hücrelerin puanlanacağını **günlükten** çıkarır.
  Kusursuz üretimin hücrelerini atlar (payda şişerdi), ÖLÇÜLEMEDİ olanları
  atlar (yer gerçeği yok), koşu sınırını geçip eşleştirmez.
- `effect.ts` — hücre tablosu, göreli azalma, etkileşim terimi ve
  **önceden ilan edilmiş** karar kuralı.

**İki koruma, ikisi de tezin lehine çalışmıyor — doğrunun lehine:**

1. **Alıntı zorunlu ve makineyle doğrulanıyor.** "Yakalandı" diyen her
   karar rapordan birebir bir alıntıya bağlı; alıntı raporda bulunamazsa
   yakalama **sayılmaz** ve ayrıca sayılır. Bu sayının yükselmesi
   puanlayıcının kendisinin bozulduğunu gösterir.
2. **k<3 iken karar yok.** `report` sayıyı basar, kararı "YETERSİZ" der.
   DESIGN'ın kendi kuralıydı ve bir kez ihlal edilmişti (tek koşudan "bu
   görev kolay" sonucu çıkarılmıştı); artık ihlal edilemiyor. "Varyansın
   dışında" şartı da işletilebilir hâle getirildi: azalmanın işareti her
   tekrarda aynı olmalı, yoksa karar "belirsiz".

**Puanlanamayan hücre, kaçırılmış hücre değil.** Puanlayıcının çıktısı
ayrıştırılamazsa hücre ölçüm dışı kalır ve günlüğe hiçbir şey yazılmaz —
gizli süitteki "ÖLÇÜLEMEDİ ≠ kusur yok" ayrımının puanlama tarafındaki
karşılığı.

**Yanlılık kaydı:** alıntı şartı muhafazakâr — kusuru doğru tarif edip
alıntısı tutmayan bir rapor kaçırma sayılır, yani ölçülen kaçırma oranı
gerçeğin üstünde olabilir. Önemli olan sapmanın dört hücreye **eşit**
binmesi; karşılaştırdığımız şey hücreler arası fark. Mutlak oran tek başına
alıntılanmamalı.

### Doğrulanan ve doğrulanmayan

**Doğrulandı:** 30 yeni test (501 toplam), sahte CLI ile uçtan uca puanlama
(karar günlüğe düşüyor, `review.done` ile birleşiyor, etki raporuna
taşınıyor), uydurma alıntının elenmesi, ayrıştırma hatasının koşuyu
düşürmemesi, ve `report` çıktısının **gerçekten** basıldığı hâli (sentetik
bir günlükle ekrana bakıldı — "testler yeşildi ama ekran boştu" dersi).

**Doğrulanmadı — sırada bu var:** puanlama promptunun **canlı bir modele**
karşı çalışıp çalışmadığı. Yani gerçek bir model, istenen JSON'u üretiyor
mu, alıntıyı birebir kopyalıyor mu? Bu oturumda hiç ajan çağrılamadı: kök
kullanıcı altında `--dangerously-skip-permissions` reddediliyor, izin modu
verilerek yapılan çağrı da ortamın kendi korumasına takıldı. **Senin
koşunda ilk bakacağın yer bu:** `puanla` çıktısında "PUANLANAMADI" satırı
varsa prompt tutmamış demektir; hücre puansız kalır ama rapor durur, yani
`--yeniden` ile tekrar puanlanabilir. Para ikinci kez üretime harcanmaz.

---

## Daha da önce — görev seti

**Üç yeni görev sınıfı**, her biri ayrı bir hipotez:

- `async-pool` — **eşzamanlılık**. Kusur tek çağrının içinde değil
  çağrıların arasında: tembel başlatma, hata sonrası iptal, senkron
  fırlatan thunk.
- `snapshot-store` — **mevcut koda dokunmak**. Kusur yazılanda değil
  bozulanda. `seed/` ile verilen kodun örtük sözleşmeleri görev metninde
  **yazmıyor**, `seed/src/selector.ts` içinde yaşıyor.
- `csv-roundtrip` — **sessiz kenar durumu**. Değişmez yazılı
  (`parse(serialize(rows)) === rows`), onu bozan girdiler yazılı değil.

**Görev formatına `seed/`**: üretimden **önce** artefakt dizinine konan
mevcut kod. Gizli testler hâlâ **sonra**. Sıranın kendisi geçerlilik
koşulu: ajan dokunacağı kodu görmeli, ölçen testi görmemeli.

**`selftest` + `hidden/reference/`**: her görevin kancaları bir referans
çözüme karşı koşuluyor. Doğru bir çözümle de kırmızı kalan kanca kusur
değil **bozuk test** ölçüyordur — her hücrede kırmızı çıkar, "kaçırma"
metriğini şişirir, hiçbir üreticiyle ilgisi yoktur. Beş görev, 69 kanca,
hepsi geçiyor. Ajan çağrılmadığı için bedava.

**Codex adaptörü doğrulandı.** codex ilk kez kurulu bir makinede denendi
(`codex-cli 0.155.0`). Önceki devir teslimin "bayraklar codex'in kurulu
OLMADIĞI bir makinede yazıldı" riski kapandı: `exec`, `--model`,
`--skip-git-repo-check`, `--dangerously-bypass-approvals-and-sandbox`
gerçek bir çağrıda kabul edildi, oturum açıldı, rol promptu + görev metni
stdin'den doğru yerde göründü.

Doğrulama iki eksik çıkardı:

- `--json` yoktu → stdout insan için biçimlenmiş metindi → maliyet
  ayrıştırıcısı hiçbir şey bulamıyordu. 2x2'nin codex hücrelerinde maliyet
  sessizce boş kalacaktı (Açık Soru #4'ün girdisi).
- `--json` eklenince stdout JSONL olay akışı oluyor → denetim raporunun
  metni oradan okunamaz. `--output-last-message` ile rapor ayrı dosyaya
  yazılıyor; `review` artık `invoke.message ?? invoke.stdout` okuyor.
  Bu olmasaydı dört hücreden ikisi okunamaz rapor üretirdi ve bu ancak
  pahalı koşu bittikten sonra görülürdü.

> İkisinin de ürettiği **biçim görülmedi**, yalnızca `--help`'te var
> oldukları. Bu yüzden ikisi de "bulamazsan boş bırak" diye okunuyor.
> Senin koşunda maliyet alanının dolup dolmadığına bak.

---

## Açık karar (hâlâ açık)

> Çapraz satıcı 2x2'si koşulduktan sonra: **adım 6'nın kodu** mu, yoksa
> görev setini büyütmek mi?

Görev seti bu arada 5'ten 8'e çıktı ve adım 6'nın **tasarımı** yazıldı
(`PLANLAMA.md`); ikisi de sıradaki kararı beklemiyordu. Karar hâlâ ölçüme
bağlı.

Önceki devir teslimin sorusu ("önce ölçüm mü, adım 6 mı") artık cevaplandı:
ölçüm hazır, sıra koşmakta. Ondan sonrası sonuca bağlı.

- **Çeşitlilik etkisi çıkarsa** → adım 6'nın temeli sağlam, yol haritası
  devam eder. Şekli kayıtlı: serbest sohbet **değil**, `reject`
  mekanizmasının kardeşi — kayıtlı, sayılı, gerekçeli turlar.
- **Çıkmazsa** → `PHILOSOPHY.md` 3. ilkesi değişir. Karar kuralı sonucu
  görmeden yazıldı, `bench/DESIGN.md`'de duruyor ve artık `effect.ts`'te
  kodda: kaçırma oranında ≥%20 göreli azalma olumlu, <%10 olumsuz. Kararı
  `report` veriyor, ben değil — sayıyı görüp eşiği sonradan seçme imkânı
  kapalı.
- **Ölçüm gücü yetmezse** → görev setini büyütmek. Aday yön: `seed/`
  zaten var, daha büyük ve iki modülün etkileşimini içeren bir görev
  frontier modelde de kusur üretebilir.

### Bilerek dışarıda bırakılanlar

- **Rol promptlarını ekrandan düzenlemek.** Prompt içeriği her tur taze
  okunuyor, yani düzenleme yoldaki kartın **sonraki turunu** etkiler.
  Dondurma değişmezinin kenarında duruyor, kendi kararını hak ediyor.
- Kalan bench görevleri (12 hedeflenmişti, 8 var) — ve asıl açık
  soru sayı değil sınıf: frontier modelde kusur üreten bir görev hâlâ
  yazılmadı (aşağıdaki oturum kaydına bak).
- **Büyük artefaktlı görev sınıfı.** Tur anlık görüntüsü her turda tam
  kopya alıyor; bugünkü artefaktlar birkaç KB olduğu için bedeli
  ölçülemeyecek kadar küçük, ama büyük artefaktlı bir görev gelirse bu
  karar yeniden bakılmalı.

---

## Tuzaklar (hepsi canlı koşuda ısırdı)

- **Ajan hücresinden kaçıyor.** `Glob`/`Grep` verilen `claude-haiku-4-5`
  iki koşuda da çalışma dizininden yukarı çıktı, deponun kendi `src/`
  dizinini buldu ve çözümü **oraya** yazdı. Hücre boş kaldığı için koşu
  `ÖLÇÜLEMEDİ` göründü *ve* dosya operatörün ağacında kaldı
  (`.skein/runs/` yok sayılıyor, `src/` sayılmıyor). Artık iki koruma var:
  üretim ajanına varsayılan olarak yalnızca `Read,Write,Edit` veriliyor
  (`SKEIN_ALLOWED_TOOLS` ile değiştirilebilir), ve kaçış olursa teşhis
  dosyanın yolunu söylüyor. **Koşundan sonra `git status`'a bak.**
- `--allowed-tools <tools...>` **değişken sayıda argüman alır**; görev metni
  ondan sonra yazılırsa sessizce yutulur ve ajan görevi hiç görmez.
- `stream-json` çıktısında `type:"result"` satırı **son satır değildir**.
- Rol promptundaki kısıt **en başa** yazılmalı.
- `pkill -f` / `pgrep -f` kendi komut satırını eşleştirip kabuğu öldürüyor.
  Bu oturumda bir kez daha ısırdı. Güvenlisi: `ps -eo pid,comm` ile süz.
- Ekranın gömülü betiği tamamen bozulmuştu ama testlerin hepsi yeşildi.
  Ders: ekranı gerçekten **aç ve bak**.
- **Bir ajan çağrısının tabanı sanılandan pahalı.** "2+2" soran bir
  `doctor` çağrısı `claude-haiku-4-5`'te $0.06 tuttu: CLI'ın kendi sistem
  promptu her çağrıda önbelleğe yazılıyor. Koşu sayısı tahmin ederken
  çarpan bu taban.
- **Kök kullanıcı altında varsayılan izin modu reddediliyor.** Konteynerde
  `matrix` iki üretimi de anında "ÖLÇÜLEMEDİ" bıraktı; sebebi tek satır
  stderr'de duruyordu: `--dangerously-skip-permissions cannot be used with
  root/sudo privileges`. Para harcanmadı çünkü çağrı hiç başlamadı, ama
  koruma olmasaydı bu "kusur yok" diye okunurdu. Kendi makinende sorun
  çıkarsa `SKEIN_PERMISSION_MODE=acceptEdits`.
- **Uzak konteynerde çapraz satıcı koşulamaz.** `codex` kuruluyor ve
  anahtar da gerekmiyor (ChatGPT oturumu yeterli), ama konteynerin çıkış
  vekili `api.openai.com` ve `chatgpt.com` için CONNECT'i 403 ile
  reddediyor. Ağ kesikken codex çağrısı **timeout'a kadar yeniden
  deniyor** — gerçek koşuda hücre başına 10 dakika. `doctor` ile önce sına.

---

## Okuma sırası

| Dosya | Ne için |
|---|---|
| `ARCHITECTURE.md` | **Önce bu.** Katmanlar, çekirdek, DB kararı, değişmezler |
| `PLANLAMA.md` | Adım 6'nın tasarımı — yazılmadı, kararları sabit |
| `PHILOSOPHY.md` | İlkeler, reddedilenler, açık sorular (#2 güncel) |
| `bench/DESIGN.md` | 2×2 tasarımı, görev formatı, kalibrasyon kayıtları |
| `hub/flows/SCHEMA.md` | Akış dili — 16 kural, ret yolu, hash sözleşmesi |
| `RUNNING.md` | Kendi makinende koşturmak; izin modu; Windows notları |
| `ROADMAP.md` | Orkestratörden önce yazıldı; okurken tarihini hesaba kat |

---

## Not: ajanlar senin dalına commit atıyor

`main` workspace'i kullanıcının checkout'u olduğu için kaçınılmaz. Deney
koşuları ayrı dalda yapıldı (`deney/olay-gunlugu`) ve inceleme sonrası
birleştirildi. Orkestratörün kendi dalında koşması hâlâ düşünülebilir.
Yukarıdaki kaçış tuzağı bu notu daha da önemli kılıyor: **koşudan sonra
`git status`.**
