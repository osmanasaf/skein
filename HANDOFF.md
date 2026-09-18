# Devir Teslim — 2026-09-18

Bu dosya bir sonraki oturumun giriş noktası. Durum ajanın kafasında değil,
burada ve git'te (PHILOSOPHY 1). Yeni bir sohbete/projeye tek başına
yapıştırılabilsin diye yazıldı: aşağısı Skein'i tanımayan birine de yeter.

**Dal:** `claude/project-plan-brainstorm-pthvoc` — `claude/project-thread-sc56cs`
ileri sarılıp üstüne devam edildi, yani iki dalın işi bu dalda birleşti.
`sc56cs` olduğu yerde duruyor; yeni iş burada.
**Durum:** 506 test yeşil, typecheck temiz, `selftest` 5/5, ağaç temiz.
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

**Deney artık cevap üretebiliyor — ve cevabı doğru sayıyor.** Önceki
oturum körlenmiş puanlamayı ve karar kuralını yazmıştı; bu oturumda kuralın
kendisinde bir sessiz hata bulundu: "k≥3" şartı koşu sayısıyla ölçülüyordu,
yani **üç farklı görevi birer kez koşmak k=3 görünüyor** ve karar kuralını
açıyordu. Artık tekrar, görev × model kurgusu grubunun içinde sayılıyor.
**Kalan tek iş hâlâ aynı: çapraz satıcı 2x2'sini koşmak** — ve o, uzak
konteynerde değil senin makinende yapılmalı (aşağıda sebebi; bugün bir kez
daha sınandı, vekil `api.openai.com` CONNECT'ini hâlâ 403 ile kesiyor).

| # | Adım | Durum |
|---|---|---|
| 1 | `--serve` — gözcü uyur, kart düşünce uyanır | ✅ |
| 2 | `agent.step` — ajan koşarken günlüğe düşer | ✅ |
| 3 | Okuyucu ekran — pano, canlı adım, iz, diff | ✅ |
| 4 | Kapı ekrandan açılıyor | ✅ |
| 5 | Akış ekrandan kuruluyor | ✅ |
| — | Kusur üreten görev seti | ✅ |
| — | Körlenmiş puanlama + karar kuralı | ✅ |
| — | **Tekrar grup içinde sayılıyor** | ✅ **bu oturum** |
| 6 | Planlamada ajanlar arası yazılı tur | ⬜ ölçümden sonra |

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
#    beklenen: 5 görevin beşi de "referansla hepsi yeşil"

# 3. codex gerçekten çağrılabiliyor mu
npx tsx src/bench/cli.ts doctor codex:gpt-5.5
#    "ÇALIŞIYOR" → hazırsın
#    "ÇALIŞMIYOR — ama bayraklar yüzünden değil" → ağ/oturum sorunu, adaptöre dokunma
#    "ÇALIŞMIYOR. Bayraklar yanlış olabilir" → codex sürümün farklı, DEFAULT_ARGS'ı düzelt

# 4. çapraz satıcı 2x2 — ÜÇ GÖREV × ÜÇ TEKRAR = 9 matris
#    Model çiftini dokuzunda da AYNI yaz; değişirse ayrı ölçüm grubu olur.
for g in snapshot-store csv-roundtrip async-pool; do
  for k in 1 2 3; do
    npx tsx src/bench/cli.ts matrix $g claude:claude-haiku-4-5-20251001 codex:<model>
  done
done

# 5. raporları puanla — önce kuru koş (ajan çağırmaz, PARA HARCAMAZ)
npx tsx src/bench/cli.ts puanla --kuru
npx tsx src/bench/cli.ts puanla claude:claude-opus-5

# 6. sonuç — hepsi, ya da tek görev
npx tsx src/bench/cli.ts report
npx tsx src/bench/cli.ts report --gorev=snapshot-store
```

**İzin modu:** konteynerde `--dangerously-skip-permissions` root altında
reddediliyor; kendi makinende gerekmeyebilir. Gerekirse
`SKEIN_PERMISSION_MODE=acceptEdits` ver. Dört hücrede de aynı olmalı,
yoksa karşılaştırma bozulur — koşuda ekrana basılıyor, bir bak.

**Neden `haiku`:** `claude-opus-5` beş görevin hepsini altı koşuda temiz
çözdü. Kusur üretmeyen üreticiyle denetim ölçülemez ve `matrix` bunu fark
edip denetim hücrelerini **atlıyor** ("Ölçüm gücü yok"). Ölçüm gücü olan
tek üretici şimdilik haiku sınıfı. Codex tarafında da güç sınıfı yakın bir
model seç, yoksa aynı duvara çarparsın.

**Maliyet:** bir 2x2 = 2 üretim + 4 denetim. Üretim haiku'da $0.04–0.13,
`claude-opus-5`'te $0.17–0.47. `retry-backoff` üzerindeki eski bir matris
toplamda $0.93 tutmuştu. Üç görev × k=3 kabaca **$12–15**.

**Üç görev de koşulmalı** (`snapshot-store`, `csv-roundtrip`, `async-pool`).
Tek görevlik sonuç "bu görevde" der.

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
npx tsx src/ui/cli.ts <akış> [--port N]         ekran (127.0.0.1)

npx tsx src/bench/cli.ts selftest [görev]       kancalar sağlam mı (bedava)
npx tsx src/bench/cli.ts doctor <sağ:model>     CLI çağrılabiliyor mu
npx tsx src/bench/cli.ts <görev> [sağ] [model]  tek üretim + gizli testler
npx tsx src/bench/cli.ts matrix <görev> A B     2x2 çapraz kurgu
npx tsx src/bench/cli.ts puanla [model] [--kuru] raporları körlenmiş puanla
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
| Körlenmiş puanlama + alıntı doğrulaması | `src/bench/judge.ts` |
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

| Görev | Kanca | `claude-opus-5` | `claude-haiku-4-5` |
|---|---:|---|---|
| `snapshot-store` | 16 | temiz (×2) | **14/16** — 2 kırmızı |
| `csv-roundtrip` | 18 | temiz (×2) | **17/18** — 1 kırmızı |
| `async-pool` | 12 | temiz (×2) | **10/12** — 2 kırmızı |
| `retry-backoff` | 9 | 5 koşuda 4'ü kusurlu | — |
| `token-bucket` | 14 | temiz | temiz |

Üçü de **önceden tarif edilmiş** kusuru üretti; kancalar tahminle yazılmıştı
ve tahmin tuttu. `snapshot-store`'da geri alma geçmişi baştan oynattı ve
`version` geriye düştü; `csv-roundtrip`'te `parse("")`ın `[[""]]` dönmesi
gerektiği türetilemedi; `async-pool`'da hata yolunda kuyruk beslenmeye
devam etti.

**Ölçülmemiş:** merkezî tezin kendisi. Dört hücre hiç koşmadı. Artık
eksik olan tek şey **koşunun kendisi**: ölçen, puanlayan ve karar veren
katmanların üçü de yazılı ve testli.

**Bilinmeyen:** frontier modelde kusurun hangi ölçekte başladığı.
`claude-opus-5` beş görevde altı koşuda bir kez bile kusur üretmedi. Bu,
"frontier model kusur üretmiyor" demek değil — bu beş görevin ona kolay
geldiği demek.

---

## Bu oturumda ne yapıldı — tekrarın sayılma biçimi

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

## Önceki oturumda ne yapıldı — puanlama katmanı

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

## Daha önce ne yapıldı — görev seti

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

> Çapraz satıcı 2x2'si koşulduktan sonra: **adım 6** mı, yoksa görev setini
> büyütmek mi?

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
- **Hakem katmanı — 2. yer gerçeği.** Bu oturumda yazılan puanlayıcı
  NESNEL katmanı okuyor (rapor ↔ kırmızı kanca). Gizli testin göremediği
  bulguları (tasarım, sızıntı) nit / yanlış pozitif diye sınıflayan ikinci
  katman hâlâ yok ve ayrı raporlanacak — iki katman harmanlanmaz.
- Kalan bench görevleri.
- **Tur başına artefakt anlık görüntüsü.** "Denetim turunda tam olarak ne
  değişti" hâlâ son artefakta bakıp çıkarsanıyor.

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
