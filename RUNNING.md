# Kendi makinende koşturmak

Windows, macOS ve Linux. İki ayrı şey var ve ikisi de burada:

- **Orkestratör** — kartı rollerden geçiren asıl ürün (`watch`).
- **Deney** — 2×2 çapraz kurgu, tezi ölçen kısım (`bench`).

## Gerekenler

- Node.js 22+
- En az bir sağlayıcı CLI'ı, oturumu açılmış:
  - `claude` — [Claude Code](https://code.claude.com)
  - `codex` — [OpenAI Codex](https://github.com/openai/codex)

## Kurulum

**PowerShell kullanıyorsan `&&` yazma.** Windows PowerShell 5.1 onu
desteklemez; her komutu ayrı satıra yaz (ya da `;` kullan).

```powershell
git clone https://github.com/osmanasaf/skein
cd skein
git checkout claude/project-plan-brainstorm-pthvoc
npm install
npm test
```

`npm test` testlerin tamamını geçmeli (şu an 453). Geçmiyorsa çıktıyı
sakla.

---

## Orkestratör — üç adım

**Bayrak verirken `npm run` kullanma.** Bazı npm sürümleri `--` sonrasındaki
bayrakları kendi seçeneği sanıp yutuyor; `npm run watch -- daily --plan`
sessizce `--plan`'sız koşar. Doğrudan biçim her yerde çalışır:

```powershell
# 1. Ne koşacağını gör. Ajan çağırmaz, depoya dokunmaz.
npx tsx src/watch/cli.ts daily --plan --model claude:claude-opus-5 --model codex:gpt-5.5

# 2. Kart aç. Kuyrukta kart yoksa orkestratör yapacak bir şey bulamaz.
npx tsx src/card/cli.ts new daily "Jitter ekle" "retry fonksiyonuna tam jitter ekle"

# 3. Koştur.
npx tsx src/watch/cli.ts daily --model claude:claude-opus-5 --model codex:gpt-5.5
```

### Ya da: gözcüyü açık bırak (`--serve`)

Toplu koşu kuyruk boşalınca çıkar. `--serve` çıkmaz, **bekler** — kart
açmak işin başlaması demek olur, ikinci bir komut gerekmez:

```powershell
# Bir kabukta gözcüyü aç ve orada bırak
npx tsx src/watch/cli.ts daily --serve --model claude:claude-opus-5 --model codex:gpt-5.5

# Başka bir kabukta kart aç — gözcü kendisi uyanır
npx tsx src/card/cli.ts new daily "Jitter ekle" "retry fonksiyonuna tam jitter ekle"
```

Durdurmak için **Ctrl-C**: koşan tur bitirilir, sonra çıkılır (yarıda
kesilen tur, parası ödenmiş bir ajan çağrısını çöpe atardı). İkinci Ctrl-C
hemen çıkar.

| Seçenek | Ne yapar |
|---|---|
| `--serve` | Kuyruk boşalınca çıkma, bekle |
| `--poll <ms>` | Beklerken yoklama aralığı (varsayılan 1000) |

### Ajan koşarken ne yaptığını izlemek

Gözcü, ajanın attığı her adımı olay günlüğüne yazıyor — tur bitmeden.
Başka bir kabukta:

```powershell
Get-Content .skein\olaylar.jsonl -Wait -Tail 20    # PowerShell
tail -f .skein/olaylar.jsonl                       # macOS / Linux
```

`agent.step` kayıtları ajanın hangi aracı çağırdığını ve neye dokunduğunu
söyler:

```
adım 1  tool  Bash   pwd && ls -la
adım 2  tool  Read   README.md
adım 4  tool  Write  LICENSE
adım 8  text         İş başarıyla tamamlandı:
```

Ajanın iç muhakemesi (`thinking`) KASITLI olarak yazılmıyor: gözlem değil,
ve günlüğü şişirmekten başka bir şey yapmıyor. Bu kayıtlar gözlem olduğu
için kaybolmaları turu bozmaz — kartın nereye gittiğini `card.settled`
söyler.

Bugün yalnızca `claude` adaptörü adım yayıyor. `codex` yaymıyor: bayrakları
doğrulanmadı ve metin kazıyarak adım üretmek yasak (`hub/adapters/CONTRACT.md`).
Adım gelmemesi turu etkilemez.

### Ekran

```powershell
npx tsx src/ui/cli.ts daily            # boş bir port seçer
npx tsx src/ui/cli.ts daily --port 7799
```

Bastığı adresi tarayıcıda aç. Gösterdikleri:

- **Pano** — hangi kart hangi rolde, kuyruk derinliği, gözcü açık mı
- **Canlı adım** — koşan ajanın son adımı (araç adı + dokunduğu dosya)
- **Kapı tipi** — onay / kilit / kaçış; her birinin çıkışları farklı ve
  kaçışta "Geçir" düğmesi hiç çizilmiyor
- **Kart detayı** — karta tıkla: tam iz, ret gerekçeleri, devir özetleri ve
  devredilen commit'in diff özeti. URL adreslenebilir (`#kart/<id>`).

**Kapıyı ekrandan açabilirsin.** Kapıdaki kartın düğmeleri kapı tipine göre
değişiyor ve çekirdeğe komut gönderiyor; çekirdek reddederse gerekçe kartın
üstünde belirir. Karar `gate.released` olarak günlüğe de düşer, ve aynı iş
`card release` ile de yapılabilir.

Bunun dışında ekran yalnızca okur. `127.0.0.1`'e bağlanır — kart metinlerini
ve ret gerekçelerini gösterdiği için ağa açılmaz. `--host` ile
değiştirebilirsin ama ne yaptığını bil: yazma çağrıları sayfaya gömülü bir
jetonla korunuyor, ama ağa açılan bir ekran yine de depo içeriğini
gösterir.

### Akışı ekrandan kurmak

Şeritteki **Akışı düzenle** düğmesi: rol ekle/çıkar, sağlayıcı ata, `next` ve
`reject` bağlarını kur. Her değişiklikte:

- **Canlı doğrulama** — 16 kuralın tamamı, kural numarasıyla
- **Canlı maliyet** — aktivasyon/kart ve en kötü durum; rol ekledikçe büyür
- **Yazılacak dosyanın önizlemesi** — kaydetmeden önce tamamı görünür

Geçersiz taslak **yazılmaz**. Yazma atomik; gözcü koşuyorsa yeni akışı
kendiliğinden alır.

**Kaydetmek dosyayı yeniden yazar ve YORUMLAR KAYBOLUR.** Dosya git'te, diff'e
bakabilirsin. Kapı metinleri, anayasa ve audit ayarları korunur.

Düzenlemeyi kapatmak için: `npx tsx src/ui/cli.ts <akış> --salt-okunur`

Gözcü ile ekran ayrı süreçler; ekran kilidi almaz, kuyruğa dokunmaz.

### Akış dosyasını değiştirdiysen

**Yeniden başlatmana gerek yok.** Gözcü geçişler arasında, ekran her okumadan
önce dosyayı yokluyor:

- Geçerli bir değişiklik → gözcü `↻ akış yeniden yüklendi` der, ekran yeni
  sütunları çizer.
- Geçersiz (yarım kaydedilmiş YAML) → ikisi de **eskisiyle devam eder** ve
  gerekçeyi gösterir. Düzeltince kendiliğinden toparlar.

Yoldaki kartlar etkilenmez: her kart açılırken topolojisini dondurur.
Rolü artık var olmayan kart varsa gözcü onu bir kez duyurur, ekran kendi
şeridinde gösterir. Rol gerçekten silindiyse kartın tek çıkışı var:

```powershell
npx tsx src/card/cli.ts kapat <kart-id>
```

Kapatma yalnızca akışta karşılığı kalmamış kart için çalışır; yoldaki normal
bir kartı durdurmak istiyorsan kapıdan karara bağla. Kapatılan kartın işi
dalında durmaya devam eder — kapanan şey kartın yolculuğu.

**Aynı depoda tek yazıcı.** Gözcü açıkken ikinci bir `watch` koşusu
reddedilir; `--plan` reddedilmez çünkü yazmaz. Sebep şu: ikinci koşu,
birincinin **elindeki** kartı çökmüş sanıp kuyruğa geri atar ve aynı iş
ikinci kez, para harcayarak yapılır. Kilit `.skein/daemon.json`; süreç
`kill -9` ile ölse bile sonraki gözcü onu bayat görüp devralır.

Kart açmak, `card ls`, `card show` ve `card release` gözcü açıkken de
serbesttir — kuyruğa kart eklemek ve kapıdaki kartı karara bağlamak
gözcünün turuyla çakışmaz.

**`npx tsx` ile başlatılan gözcüyü `kill` ile durduramazsın:** araya üç
sarmalayıcı süreç giriyor ve sinyal node'a ulaşmıyor. Ctrl-C çalışır
(terminal sinyali süreç grubuna gider); betikten durduracaksan pid'i
`.skein/daemon.json` içinden oku.

**Her sağlayıcı için `--model` zorunlu.** Akış dosyası model taşımaz: topoloji
ile model ayrı kararlar ve modeli akışa gömmek, model değiştiğinde yolda olan
kartların topoloji hash'ini kırardı. Pin eksikse koşu **başlamadan** durur —
ajan çağrılmaz, para harcanmaz.

`daily.yaml` üretimi `claude`'a, denetimi `codex`'e veriyor — yani bu koşu
aynı zamanda **Açık Soru #2'nin ilk gerçek verisi**.

Kartın nerede olduğunu görmek için:

```powershell
npx tsx src/card/cli.ts ls
npx tsx src/card/cli.ts show <kart-id>
```

### Bir tur sonuçsuz kalırsa

Kart insan kapısında bekler (`⏸`) ve gerekçe yazılır — **ajanın kendi
açıklaması dahil**. Sık görülen iki sebep:

| Gerekçe | Ne yapmalı |
|---|---|
| "Ajan verdikt yazmadı" + ajan izinden söz ediyor | `--permission-mode` / `--allow-tool` ver |
| `unrecognized_model` | `--model` pinini kontrol et; kimliği tam yaz |
| "kabul etti ama ağacında işlenmemiş değişiklik var" | O dosyaları `.gitignore`'a ekle ya da işlet |
| "Bu depoda zaten bir gözcü açık" | Açık gözcüyü durdur; süreç gerçekten yoksa `.skein/daemon.json`'ı sil |

Kapıdaki kartı karara bağlamak:

```powershell
npx tsx src/card/cli.ts release <kart-id>           # kapının tipine göre karar
npx tsx src/card/cli.ts release <kart-id> forward   # geçsin
npx tsx src/card/cli.ts release <kart-id> back      # geri dönsün
npx tsx src/card/cli.ts release <kart-id> retry     # aynı rol baştan koşsun
```

**İki tür kapı var ve çıkışları farklı:**

| Kapı | Ne oldu | Kod nerede | Çıkış |
|---|---|---|---|
| **onay** | Rol işini bitirdi, `gates:` burada durmanı istedi | Sonraki worktree'ye taşındı | `forward` (varsayılan) · `back` |
| **kilit** | Ret limiti doldu | Yerinde | `forward` ("üretici haklı") · `back` |
| **kaçış** | Tur tamamlanmadı: kirli ağaç, verdikt yok, çakışma | **Hiç taşınmadı** | `retry` (varsayılan) · `back` |

Kaçış kapısında `forward` **reddedilir** — kod taşınmadığı için sonraki rol
bayat bir ağaçta çalışırdı. Sebebi gider (dosyayı işle ya da sil), sonra
`retry` ver.

### Modeli ve izinleri pinlemek

```powershell
npx tsx src/watch/cli.ts daily --model claude:claude-opus-5 --model codex:gpt-5.5
npx tsx src/watch/cli.ts daily --permission-mode acceptEdits --allow-tool "Bash"
```

Rolün `git commit` atabilmesi gerekiyor. Varsayılan `bypassPermissions` bunu
sağlar; root olarak koşuyorsan CLI onu reddeder, o zaman `acceptEdits` +
`--allow-tool "Bash"` ver.

**Canlı koşuda öğrenildi:** `acceptEdits` tek başına yetmiyor — dosya
yazdırır ama `git add`/`commit` yaptırmaz. Ajan dosyayı yazıp "commit
atamadım" diyerek durur (ve doğru davranmış olur). Dar hâli:

```bash
npx tsx src/watch/cli.ts <akış> --permission-mode acceptEdits \
  --allow-tool "Bash(git:*)" --allow-tool Read --allow-tool Write --allow-tool Edit
```

`SKEIN_PERMISSION_MODE` ortam değişkeni yalnızca **bench** yolunda okunuyor;
orkestratörde bayrak kullan.

**Koşudan sonra `npm test` kırmızı yanıyorsa** önce `.worktrees/` bak:
orkestratör her rol için deponun bir worktree'sini açıyor ve kökten koşan
vitest oradaki kopyaları da toplayabiliyordu. `vitest.config.ts` artık
dışlıyor; başka bir araç (eslint, tsc --build) için aynı tuzak geçerli.

---

## Deney (bench)

## Önce doğrula, sonra koş

Codex adaptörünün çağrı bayrakları artık gerçek bir çağrıda **doğrulandı**
(`codex-cli 0.155.0`): CLI hepsini kabul etti, oturumu açtı ve stdin'den
giden rol promptu + görev metnini doğru yerde gösterdi. Çağrı yalnızca ağ
katmanında durdu.

Doğrulanmayan tek şey **çıktı biçimi**: `--json` ve `--output-last-message`
yalnızca `--help` çıktısında görüldü, ürettikleri biçim görülmedi. Kendi
makinende bir kez koş — hem sürüm farkı bayrak adlarını değiştirebiliyor,
hem de maliyet alanının dolup dolmadığını ancak gerçek bir çağrı söyler:

```powershell
npm run bench -- doctor codex:gpt-5.5
```

(`npm run bench` `tsx`'i projeden kullanır; `npx tsx` gibi her seferinde
kurulum sormaz. `--` şart: ondan sonrası komuta gider.)

Bu komut çağıracağı tam komut satırını basar ve küçük bir deneme çağrısı
yapar. **ÇALIŞIYOR** derse hazırsın.

**"ÇALIŞMIYOR — ama bayraklar yüzünden değil"** derse CLI argümanları kabul
etmiş, çağrı ağ katmanında durmuştur: vekil, DNS, TLS ya da kimlik
doğrulama. Adaptöre dokunma; çıkışın açık olup olmadığına bak.

**"ÇALIŞMIYOR. Bayraklar yanlış olabilir"** derse `codex --help` çıktısına bakıp
`src/adapters/codex.ts` içindeki `DEFAULT_ARGS` dizisini düzelt — TypeScript
bilmeye gerek yok, sadece bir metin dizisi:

```ts
static readonly DEFAULT_ARGS = [
  "exec",
  "--model", "{model}",
  "--skip-git-repo-check",
  "--dangerously-bypass-approvals-and-sandbox",
];
```

`{model}` ve `{promptFile}` yer tutucuları doldurulur; görev metni her durumda
stdin'den gider.

Aynı doğrulamayı claude için de yapabilirsin:

```powershell
npm run bench -- doctor claude:claude-opus-5
```

### Kancalar sağlam mı (ajan çağırmaz, para harcamaz)

```powershell
npm run bench -- selftest
```

Her görevin gizli kancalarını, `hidden/reference/` altındaki referans
çözüme karşı koşar. Doğru bir çözümle de kırmızı kalan bir kanca kusur
değil **bozuk test** ölçüyordur — ve her hücrede kırmızı çıkıp "kaçırma"
metriğini sessizce şişirir. Görev seti büyürken ilk koşulacak komut bu.

Tek görev için: `npm run bench -- selftest async-pool`

### İzin modu (root altında koşuyorsan)

Sağlayıcı CLI'ı varsayılan `bypassPermissions`'ı root altında reddediyor
(tek satırlık stderr, exit 1). Ortamdan geç:

```bash
export SKEIN_PERMISSION_MODE=acceptEdits
export SKEIN_ALLOWED_TOOLS="Read,Write,Edit,Glob,Grep"
```

Her koşu kullandığı izin modunu ekrana basar. Otomatik geri düşmüyor:
izin modu ajanın neye dokunabildiğini belirliyor ve koşular arasında
sessizce değişmesi karşılaştırmayı fark edilmeden bozar.

**Araç listesi varsayılan olarak `Read,Write,Edit`** ve bu bir tercih
değil düzeltme. Gerçek bir koşuda `Glob`/`Grep` verilen `claude-haiku-4-5`
çalışma dizininden yukarı çıktı, deponun kendi `src/` dizinini buldu ve
çözümü oraya yazdı — iki koşuda da. Hücre boş kaldığı için koşu
`ÖLÇÜLEMEDİ` göründü ve dosya deponun içinde kaldı (`.skein/runs/`
yok sayılıyor, `src/` sayılmıyor).

Üretim için bu üçü yetiyor: seed dosyalarının listesi zaten görev metninde.
Değiştirmek istersen `SKEIN_ALLOWED_TOOLS` ile geçersiz kılabilirsin, ama
kaçış riskini geri getirirsin. Koşu artık kaçışı yakalayıp dosyanın yolunu
da söylüyor — yine de **koşudan sonra `git status`'a bak.**

## Koşular

### Tek üretici + gizli testler

```powershell
npm run bench -- retry-backoff
```

### Audit gate ile (Açık Soru #1)

```powershell
npm run bench -- retry-backoff claude claude-opus-5 --audit
```

### 2x2 çapraz kurgu (Açık Soru #2 — projenin merkezi tezi)

```powershell
npm run bench -- matrix retry-backoff claude:claude-opus-5 codex:gpt-5.5
```

Her iki model hem üretir hem denetler. Neden dört hücre gerektiği ve
çeşitliliğin neden etkileşim terimi olarak okunduğu: `bench/DESIGN.md`.

### Ölçüm özeti

```powershell
npm run bench -- report
```

Tüm koşular `.skein/events.jsonl` dosyasına yazılır (yalnızca ekleme).
Sayılar buradan gelir, ekrana basılan metinden değil.

## Maliyet

Kabaca, `retry-backoff` için:

| Koşu | Yaklaşık |
|---|---|
| Tek üretim (`retry-backoff`, ilk ölçümler) | $0.06 |
| Tek üretim (yeni görevler, `claude-opus-5`) | $0.17 – $0.47 |
| Audit gate'li üretim | $0.32 – $0.70 |
| 2x2 matris (2 üretim + 4 denetim) | $0.93 |

Deney koşuları gerçek para harcar. `--audit` özellikle pahalı: denetim
turları üretimin kendisinden ~9 kat pahalıya çıktı.

Üretim maliyeti göreve göre 3-8 kat değişiyor: `retry-backoff` tek
fonksiyon, `snapshot-store` dört dosyalık bir dizini okutuyor. Bir
çağrının tabanı da sanıldığından yüksek — "2+2" soran bir `doctor`
çağrısı bile `claude-haiku-4-5` üzerinde $0.06 tuttu, çünkü CLI'ın kendi
sistem promptu her çağrıda önbelleğe yazılıyor. Koşu sayısını tahmin
ederken çarpan bu taban.

## Windows notu

Kod Windows'ta çalışacak şekilde yazıldı ve Windows'ta koşularak düzeltildi:

- **`npm run x -- --bayrak` güvenilir değil.** Bazı npm sürümleri `--`
  sonrasındaki bayrakları kendi seçeneği sanıp yutuyor ve komut sessizce
  bayraksız koşuyor. `npx tsx <yol>` doğrudan biçimi kullan.
- PowerShell 5.1 `&&` desteklemez; her komutu ayrı satıra yaz.

- Süreç ağacı `taskkill /T` ile yıkılıyor (POSIX'te süreç grubu sinyali).
- `npx` gibi `.cmd` sarmalayıcıları `cross-spawn` ile çözülüyor.
- Testlerdeki sahte CLI'lar `sh` script'i değil, Node script'i + platforma
  uygun ince başlatıcı (`src/testing/fake-cli.ts`).
- `entry` yolları POSIX ayracına normalleştiriliyor: aynı `task.yaml` her
  platformda ajana aynı talimatı vermeli, yoksa koşular karşılaştırılamaz.

Bir şey patlarsa `src/proc/process.ts` ilk bakılacak yer.
