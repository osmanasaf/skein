# Devir Teslim — 2026-09-18

Bu dosya bir sonraki oturumun giriş noktası. Durum ajanın kafasında değil,
burada ve git'te (PHILOSOPHY 1). Yeni bir sohbete/projeye tek başına
yapıştırılabilsin diye yazıldı: aşağısı Skein'i tanımayan birine de yeter.

**Dal:** `claude/project-thread-sc56cs` · **HEAD:** `c40248c`
**Durum:** 471 test yeşil, typecheck temiz, origin ile senkron, ağaç temiz.
**Kod:** ~8.6k satır ürün + ~5.7k satır test.
**Taban:** `claude/project-plan-brainstorm-pthvoc` (`462aa7c`) üzerine üç commit.

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

**Darboğaz kalktı.** Önceki devir teslim "kusur üreten bir görev sınıfı
eksik" diyordu; artık üç tane var ve üçü de kusur üretiyor. Deney koşum
takımı hazır, kancalar kanıtlı, `codex` adaptörü gerçek CLI'a karşı
doğrulandı. **Kalan tek iş, çapraz satıcı 2x2'sini koşmak** — ve o,
uzak konteynerde değil senin makinende yapılmalı (aşağıda sebebi).

| # | Adım | Durum |
|---|---|---|
| 1 | `--serve` — gözcü uyur, kart düşünce uyanır | ✅ |
| 2 | `agent.step` — ajan koşarken günlüğe düşer | ✅ |
| 3 | Okuyucu ekran — pano, canlı adım, iz, diff | ✅ |
| 4 | Kapı ekrandan açılıyor | ✅ |
| 5 | Akış ekrandan kuruluyor | ✅ |
| — | **Kusur üreten görev seti** | ✅ **bu oturum** |
| 6 | Planlamada ajanlar arası yazılı tur | ⬜ ölçümden sonra |

---

## SENİN SIRADAKİ İŞİN — yerel çapraz satıcı koşusu

Bu bölüm sıradaki oturum için değil, senin için. Dört adım.

```bash
# 1. dalı al
git fetch origin claude/project-thread-sc56cs
git checkout claude/project-thread-sc56cs
npm install

# 2. kancalar sağlam mı — ajan çağırmaz, PARA HARCAMAZ
npx tsx src/bench/cli.ts selftest
#    beklenen: 5 görevin beşi de "referansla hepsi yeşil"

# 3. codex gerçekten çağrılabiliyor mu
npx tsx src/bench/cli.ts doctor codex:gpt-5.5
#    "ÇALIŞIYOR" → hazırsın
#    "ÇALIŞMIYOR — ama bayraklar yüzünden değil" → ağ/oturum sorunu, adaptöre dokunma
#    "ÇALIŞMIYOR. Bayraklar yanlış olabilir" → codex sürümün farklı, DEFAULT_ARGS'ı düzelt

# 4. çapraz satıcı 2x2
npx tsx src/bench/cli.ts matrix snapshot-store claude:claude-haiku-4-5-20251001 codex:<model>
```

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

**Sonrasında:** `npx tsx src/bench/cli.ts report` — sayılar
`.skein/events.jsonl`'den gelir, ekrana basılan metinden değil.

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
npx tsx src/bench/cli.ts report                 ölçüm özeti
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

**Ölçülmüş — görev kalibrasyonu (bu oturum, k=1):**

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

**Ölçülmemiş:** merkezî tezin kendisi. Dört hücre hiç koşmadı.

**Bilinmeyen:** frontier modelde kusurun hangi ölçekte başladığı.
`claude-opus-5` beş görevde altı koşuda bir kez bile kusur üretmedi. Bu,
"frontier model kusur üretmiyor" demek değil — bu beş görevin ona kolay
geldiği demek.

---

## Bu oturumda ne yapıldı

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
  görmeden yazıldı ve `bench/DESIGN.md`'de duruyor: kaçırma oranında ≥%20
  göreli azalma olumlu, <%10 olumsuz.
- **Ölçüm gücü yetmezse** → görev setini büyütmek. Aday yön: `seed/`
  zaten var, daha büyük ve iki modülün etkileşimini içeren bir görev
  frontier modelde de kusur üretebilir.

### Bilerek dışarıda bırakılanlar

- **Rol promptlarını ekrandan düzenlemek.** Prompt içeriği her tur taze
  okunuyor, yani düzenleme yoldaki kartın **sonraki turunu** etkiler.
  Dondurma değişmezinin kenarında duruyor, kendi kararını hak ediyor.
- Yargıç (judge) katmanı, kalan bench görevleri, 2×2 etkileşim raporu.
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
