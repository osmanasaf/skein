# Devir Teslim — 2026-09-18

Bu dosya bir sonraki oturumun giriş noktası. Durum ajanın kafasında değil,
burada ve git'te (PHILOSOPHY 1). Yeni bir sohbete/projeye tek başına
yapıştırılabilsin diye yazıldı: aşağısı Skein'i tanımayan birine de yeter.

**Dal:** `claude/project-plan-brainstorm-pthvoc` — `claude/project-thread-sc56cs`
ileri sarılıp üstüne devam edildi, yani iki dalın işi bu dalda birleşti.
`sc56cs` olduğu yerde duruyor; yeni iş burada.
**Durum:** 737 test yeşil, typecheck temiz, ağaç temiz.
`watch selftest` bu konteynerde **koşmuyor**: `hub/flows/selftest.yaml`
depoda izlenmiyor (yalnızca yazarın makinesinde duruyordu, konteyner
yenilenince gitti). Belgelenmiş bir komutun depoda olmayan bir dosyaya
dayanması açık bir eksik; akış dosyasını depoya almak bir tasarım kararı
olduğu için kendiliğinden eklenmedi.
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

**İki ölçüm takımı da bitti (çapraz denetim ve 6d planlama A/B'si); kalan
iş ikisini koşmak — ve artık daha iyi bir üreticiyle.** Bu oturumda eşik ölçüldü: `snapshot-store` görevinde
`claude-haiku-4-5` ve `claude-sonnet-5` üçer koşunun üçünde de **aynı iki
kancayı** kırmızıya düşürüyor, `claude-opus-5` üçünde de temiz. Yani
kampanya artık haiku sınıfına mahkûm değil; sonnet üreticisiyle koşulabilir
(koşu başına ~$0.07). Ayrıca dürüst bir kötü haber: Açık Soru #1'in
dayandığı `retry-backoff` kusuru bugünkü hatla **hiçbir modelde**
tekrarlanmadı. **Kalan iki iş de koşmak: çapraz satıcı 2x2'si ve 6d kampanyası** —
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
| 6d | Ölçüm koşum takımı (A/B, kum havuzu, rapor) | ✅ **bu oturum** |
| — | **6d kampanyası** | ✅ tam koştu (k=3 × 2 görev): iki görevde de **BELİRSİZ** |
| — | Kural 22 + itiraz durumu + `--devam` | ✅ kampanyayı koşturabilir hâle getiren üç düzeltme |
| 6c | Çok tur, çok katılımcı, sayaç, kilit kapısı | ✅ canlı koşuda doğrulandı |
| 6e | Körleme — taşıma katmanında (fan-out/fan-in) | ✅ canlı koşuda doğrulandı |

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

## ÜÇÜNCÜ İŞ — 6c/6e'yi tekrar koşmak (isteğe bağlı, ~$2)

Bir kez koşuldu ve mekanizma çalıştı (yukarı bak). Tekrar koşmanın değeri
başka bir yerde: **plan kusurlu olduğunda** körlemenin çeşitlilik üretip
üretmediği hâlâ bilinmiyor. Bunun için planın yanlış olacağı bir görev
seçmek gerekiyor — ya da aynı görevi daha zayıf bir modelle koşmak
(`claude-haiku-4-5`), çünkü plan kusurluysa itirazcıların ayrışması
ölçülebilir hale gelir.

Kum havuzunda koşum (gerçek depoyu kirletmez):

Bunlar 30 Eylül koşusunun **aynen** çalıştırdığı komutlar. `watch/cli.ts`
kökü `cwd`den alıyor ve akışı `<cwd>/hub/flows/<ad>.yaml` diye arıyor;
kum havuzunda koşmak bu yüzden sadece `cd` meselesi.

```bash
SB=/tmp/plan3-canli
TSX=$PWD/node_modules/.bin/tsx
REPO=$PWD

# 1. kum havuzu: git deposu + hub/ + görev tohumu
rm -rf "$SB" && mkdir -p "$SB" && cd "$SB"
git init --quiet
git config user.email skein@ornek && git config user.name "Skein Canli"
cp -r "$REPO/hub" .
printf '.skein/\n.worktrees/\n' > .gitignore
cp -r "$REPO/bench/tasks/snapshot-store/seed/." .
git add -A && git commit --quiet -m "kum havuzu"

# 2. kart: görev metni spec + "bu depoda test koşucusu YOK" notu
"$TSX" "$REPO/src/card/cli.ts" new plan3 "Store.undo() ekle" "$(cat "$REPO/bench/tasks/snapshot-store/spec.md")
Çözümü şu dosyaya yaz: src/store.ts
Bu bir kum havuzu: node_modules ve test koşucusu YOK; npm test aramayı deneme."

# 3. koşu — `Bash(git:*)` ŞART, rol kendi işini commit ediyor
"$TSX" "$REPO/src/watch/cli.ts" plan3 --model claude:claude-sonnet-5 \
  --permission-mode acceptEdits \
  --allow-tool Read --allow-tool Write --allow-tool Edit --allow-tool "Bash(git:*)"
```

**Körlemenin doğrulandığı yer kart izi değil, ağaçlar.** Koşu sırasında,
kart `analyst`e geçtiği anda:

```bash
ls "$SB/.worktrees/analyst/docs/plan/"     # SADECE plan; architect'in itirazı YOK
ls "$SB/.worktrees/architect/docs/plan/"   # plan + kendi itirazı
git -C "$SB/.worktrees/analyst" log --oneline -3   # son commit YAZARIN plan commit'i
```

Kart yazara döndüğünde `ls "$SB/docs/plan/"` iki itiraz dosyasını da
göstermeli — fan-in budur. Günlükte `plan.round` olaylarının `blind` alanı
`true`, ve itirazcıların `newObjections` değeri kendi katkısını, yazarınki
turun gerçek toplamını gösterir.

---

## WINDOWS'TA İLK KOŞU: 24 kırılma, dört kök neden (2 Ekim)

Proje ilk kez Windows'ta koşuldu (`C:\dev\skein`, Node 22) ve
**685/709 geçti, 24 kırıldı.** Dördü ayrı kök nedendi; ikisi GERÇEK ürün
kusuru, ikisi sınama koşumunun POSIX varsayımı. Hepsi düzeltildi.

### Ürün kusuru 1: yol kısaltma ayraç farkında kalıyordu

`relativize` (claude adaptörü) öneki `${workdir}/` diye kuruyordu; Windows'ta
`join` ters eğik çizgi üretiyor, `startsWith` hiç tutmuyor ve **ekranda her
adım mutlak yolla doluyordu**. Artık karşılaştırma tek ayraç biçiminde
yapılıyor ve kısalan yol POSIX ayraçla dönüyor. Dizin dışındaki yol olduğu
gibi kalıyor — onu yeniden yazmak bilgi kaybı olurdu.

### Ürün kusuru 2: çok satırlı görev metni cmd.exe'den sağlam geçmiyor

Windows'ta sağlayıcı CLI'ı genelde bir `.cmd` sarmalayıcısı (npm global
kurulumu böyle kuruyor) ve cmd.exe `%*` ile argümanları yeniden ayrıştırıyor:
satır sonları ve `>` `<` `&` `|` yönlendirme sanılıyor. `needsStdin` yalnızca
uzunluğa (>8000) bakıyordu, yani **çok satırlı ama kısa bir görev metni
pozisyonel argümanla gidiyor ve ajan görevi eksik görüyordu — sessizce.**
`needsStdin` artık Windows'ta çok satırlı metni de stdin'e düşürüyor.

Kural platforma bağlı tutuldu: POSIX davranışı DEĞİŞMEDİ, çünkü ölçülmüş
kampanyaların yolu aynı kalsın. Platform parametre olarak geçtiği için iki
davranış da POSIX'te sınanabiliyor.

### Sınama koşumu 1: sahte dosya sisteminin yol çözücüsü

`exchange3.test.ts`'in `coz()`'ü `abs.startsWith(wsDir + "/")` diyordu;
Windows'ta hiçbir yol çözülmüyor, `readPlan` undefined dönüyor ve kart
"plan dosyası yok" diye kapıya çıkıyordu. **20 kırılmanın hepsi buydu** —
ürün kodu doğruydu. Çözücü artık ayraçları normalize ediyor.

### Sınama koşumu 2: git'in satır sonu dönüşümü

`git.test.ts` bayt düzeyinde iddia ediyor (`"...\n"`), ama kullanıcının
global `core.autocrlf=true` ayarı checkout'ta CRLF üretiyor. Sınama
depoları artık `core.autocrlf=false` + `core.eol=lf` ile kuruluyor:
sınanan şey birleştirmenin davranışı, git'in satır sonu politikası değil.

### Yolda çıkan AYRI kusur — Windows'la ilgisi yok

Kanıt varlık haritası (`tick.ts`) satır satır kuruluyordu ve her satırdan
yalnızca İLK yolu alıyordu; ayrıştırıcı ise (1 Ekim düzeltmesinden sonra)
bütün yollara bakıyor. İkisi ayrı düştüğü için **aynı satırda plan belgesini
ve kodu gösteren bir itirazın KOD yolu haritaya hiç girmiyor**, `varMi` false
diyor, ve itiraz "yolların hepsi kendi belgesi" diye eleniyordu. Yani 1
Ekim'de kapattığımı sandığım yanlış eleme bir katman aşağıda duruyordu.
Düzeltildi; mutasyonla doğrulandı.

### Beşinci kök neden: gizli bir kırılganlık, platformdan bağımsız

İlk dört düzeltmeden sonra Windows'ta 712/714 kaldı. Kalan ikisi assertion
değil **zaman aşımıydı** (5031ms, 5035ms — tam 5s varsayılanında), ve ikisi
de `ab.test.ts`'in en ağır bütünleşme sınaması. POSIX'te aynı ikisi 4.6s ve
3.7s sürüyor: sınıra zaten yapışıktı. Yani bu bir Windows kusuru değil,
**her iki platformda da var olan gizli kırılganlık**; Windows (git daha
yavaş, dosyalar taranıyor) onu görünür yaptı.

`ab.test.ts` artık `vi.setConfig({ testTimeout: 60_000 })` ile koşuyor.
Sınır performans hakkında bir şey iddia etmiyor — ne kadar sürdüğü
ölçülmüyor, yalnızca takılmanın sonsuza kilitlenmemesi isteniyor. Varsayılan
5 saniye birim sınaması ölçüsü; bu dosyanın her sınaması geçici git deposu
kurup worktree açıp gizli süiti koşturuyor.

**Durum: KAPANDI.** Beş düzeltmenin hepsi **Windows'ta doğrulandı** —
`C:\dev\skein`, Node 22, `714 passed (714)`, 24 saniye. Linux'ta da 714
yeşil ve typecheck temiz, yani proje artık iki platformda koşuyor.

Windows'a çıkmanın bilançosu: üç gerçek hata (yol kısaltma, çok satırlı
metnin cmd.exe'den sağlam geçmemesi, zamana yapışık bütünleşme sınaması) ve
bir dördüncüsü kod okurken yakalandı (kanıt haritasının yalnızca ilk yola
bakması). Üçüncü ve dördüncü ikisi de platformdan bağımsızdı; Windows
yalnızca bakmaya zorladı.

---

## YERELE TAŞIMA: klonla GELMEYEN şeyler (2 Ekim)

Bulut konteynerinde koşulan her şey geçici bir makinede duruyor. Kod ve
belgeler git'te, ama ölçüm kaydı **değil** — `.gitignore` `.skein/`'i dışarıda
tutuyor. Klon attığında bunlar gelmez:

| gelmeyen | ne | neden önemli |
|---|---|---|
| `.skein/arsiv/*.jsonl` | 9 kampanya günlüğü, 2.0 MB | üç kampanyanın ham kaydı — ~$25'lık gerçek koşu. Yeniden üretmek para demek. |
| `.skein/olcum/` | kum havuzları, 34 MB | plan ve itiraz belgeleri burada; hizalama analizinin ham malzemesi |
| `.skein/events.jsonl` | canlı günlük | `planrapor` bunu okuyor |
| `.worktrees/`, `node_modules/` | çalışma zamanı | yeniden üretilebilir |

Kaydı yitirmemek için `.skein/arsiv/` + kum havuzlarının `docs/plan/`
belgeleri ayrı paketlendi (2 Ekim, 262 KB). Yerelde `.skein/arsiv/` altına
açılırsa geçmiş kampanyalar okunabilir kalır; `planrapor` yalnızca
`.skein/events.jsonl`'e baktığı için rapor için bir şey yapmak gerekmiyor.

### Yerelde kurulum

```
npm ci            # Node 22
npm test          # 709 test
npm run typecheck
```

İzin modu: **yerelde ortam değişkeni gerekmiyor.** Varsayılan
`bypassPermissions` normal kullanıcıda çalışıyor; `SKEIN_PERMISSION_MODE`
yalnızca konteyner root altında koştuğu için gerekiyordu.

Yerelde geçerli olmayan üç konteyner sınırı: oturum boşta kalınca konteyner
geri alınıyor, tek komut 10 dakikada kesiliyor, araç çağrısı yoksa konteyner
askıda. Yani `planab <görev> --k=3` yerelde tek komutta biter; `--kol` ve
`--devam` bölmeye gerek kalmaz.

**Not:** `watch selftest` için gereken `hub/flows/selftest.yaml` depoda
izlenmiyor — senin eski klonunda duruyor olabilir; konteynerde yoktu.

---

## ÇEKİRDEKTE YARIŞ KUSURU — kuyruk, yarışı kaybedince ÇÖKÜYORDU (2 Ekim)

2x2'ye hazırlanırken tam takım bir kez `queue.test.ts > aynı kartı iki
koşucu birden alamaz` sınamasında kırıldı, sonra izole 3/3 geçti. "Takılma"
deyip geçmek yerine zorladım ve **gerçek bir kusur** çıktı:

```
Error: ENOENT: ... .skein/queue/coder/1-...json
  at CardQueue.#readCard (queue.ts:88)
  at CardQueue.#scan (queue.ts:110)
  at CardQueue.take (queue.ts:181)
```

`#scan` dizini listeleyip SONRA dosyaları okuyor. Arada öteki `take` dosyayı
yeniden adlandırırsa ENOENT taramadan dışarı fırlıyor ve **`take` yarışı
kaybeden tarafta `null` dönmek yerine çöküyor.** Gözcü süreci bir kartı
kaçırmakla kalmaz, ölür.

Kuyruk aynı yarışı **rename** yolunda zaten bilerek tolere ediyordu
("başaramayan ENOENT alıp sıradakine geçer"); eksik olan **tarama** yoluydu.
Düzeltildi: kaybolan dosya atlanıyor, **bozuk** dosya hâlâ hata — birincisi
eşzamanlılığın normali, ikincisi veri kaybı.

### Sınaması neden yarıştırmıyor

Önce yarıştıran bir sınama yazdım; **mutasyon ısırmadı.** Pencereyi ölçtüm:
düzeltme kaldırılmış hâlde 450 turluk zorlamada (2 ve 8 eşzamanlı `take`)
bir kez bile yakalanmadı — ilk gözlem tek seferlik bir şanstı. Yarışa
dayanan bir sınama ısırmıyorsa güven vermesi sahtedir, o yüzden atıldı.

Yerine `readdir`'in LİSTELEDİĞİ ama `readFile`'ın ENOENT verdiği durum
doğrudan kuruluyor: **kopuk sembolik bağ.** Determinist, mutasyonla tam o
ENOENT ile ısırıyor, Windows'ta sembolik bağ ayrıcalık istediği için orada
atlanıyor (`it.skipIf`).

Bu, bugünün dördüncü "yük altında takılan sınama" vakası ve ilk üçü gibi
altında gerçek bir şey vardı.

---

## 1. ADIM BİTTİ: codex uçtan uca koştu (2 Ekim, operatörün makinesi)

Projenin **ilk tamamlanmış codex koşusu**. `bench doctor codex:gpt-5.5`,
Windows, codex-cli 0.153.4:

```
exit=0  süre=7.8s
stdout: {"type":"thread.started",...} {"type":"turn.started"}
        {"type":"item.completed","item":{"type":"agent_message","text":"4"}}
        {"type":"turn.completed","usage":{"input_tokens":13607,
          "cached_input_tokens":2432,"cache_write_input_tokens":0,"outp…
ÇALIŞIYOR. Matriste kullanabilirsin.
```

Adaptörün bayrakları 0.153.4'te de geçerli; `codex doctor` sende
`auth ✓ (chatgpt kipi)`, `websocket ✓ HTTP 101`, `reachability ✓` dedi.
Model `gpt-5.5` olarak pinli (`~/.codex/config.toml`).

Önemli ayrıntı: **`chatgpt` kimlik kipinde codex `api.openai.com`'a değil
`chatgpt.com/backend-api`'ye konuşuyor.** Konteynerdeki vekil ikisini de
kesiyordu, o yüzden orada ayrım görünmemişti.

### Çıktının açtığı iki şey

**1) `model turu: ?` kozmetik değildi.** `modelTurns` yalnızca tek JSON
nesnesi okuyordu (claude `--output-format json`); codex JSONL basıyor ve
`JSON.parse(stdout)` her zaman atıyordu. Altındaki boşluk şu: doctor'ın
**"MODEL HİÇ ÇAĞRILMADI" koruması** — exit 0 dönen ama modeli hiç çağırmayan
sessiz çağrı, operatörün makinesinde tam olarak bu olmuştu — `turns === 0`
koşuluna bakıyor ve `undefined` sıfır olmadığı için **codex'te hiç
ateşlenemiyordu.** `modelTurns` artık JSONL'de `turn.completed` sayıyor,
`src/bench/modelturns.ts`'e taşındı (cli.ts modül düzeyinde kendini
koşturduğu için oradan sınanamıyordu) ve 10 sınaması var, ikisi mutasyonla
doğrulandı.

**2) Dolar maliyeti YOK, ve bu ölçüm tasarımını etkiliyor.** ChatGPT
aboneliğiyle koşan codex `total_cost_usd` üretmiyor; claude tarafı üretiyor.
Doctor artık maliyet yoksa token basıyor (`token=13607→11`), ama asıl karar
çapraz satıcı 2x2'sinde: **maliyet dolar olarak karşılaştırılamaz.**

Öneri: ortak birim **token**. İki adaptör de `inputTokens`/`outputTokens`
dolduruyor (claude `usage.input_tokens`'tan, codex `turn.completed.usage`'dan),
yani karşılaştırma token üzerinden kurulabilir; dolar, onu bildiren sağlayıcı
için EK alan olarak kalır. Gerekçe projenin kendi kuralıyla aynı: iki ayrı
yer gerçeğini harmanlamıyoruz — dolar ile abonelik aynı birim değil.

---

## 1. adım: codex adaptörü canlı — ağ sınırına kadar (2 Ekim)

`codex` bu konteynerde kurulu değildi; `npm i -g @openai/codex` ile
**codex-cli 0.160.0** kuruldu. `bench doctor codex:gpt-5.5` sonucu:

```
komut: codex exec --model gpt-5.5 --skip-git-repo-check \
       --dangerously-bypass-approvals-and-sandbox --json --output-last-message <dosya>
exit=137  süre=120.0s
stderr: failed to connect to websocket: Proxy connection failed:
        HTTP CONNECT failed with status 403, url: wss://api.openai.com/v1/responses
ÇALIŞMIYOR — ama bayraklar yüzünden değil
```

Ne öğrenildi:

1. **Adaptörün bayrakları 0.160.0'da da geçerli** (önce 0.155.0'da
   doğrulanmıştı). `--output-last-message` yardımda kısa biçimiyle
   (`-o, --output-last-message`) listeleniyor; uzun bayrakları tarayan bir
   göz onu kaybolmuş sanıyor.
2. **Çağrı doğru kuruluyor:** CLI argümanları kabul etti, oturumu açtı,
   promptu stdin'den okudu. Kalan tek engel ağ.
3. **0.160.0 WEBSOCKET kullanıyor** (`wss://api.openai.com/v1/responses`).
   Ağ politikasına host eklenirken bunun önemi var.
4. **Ortamda OpenAI kimlik bilgisi yok.** Host açılsa bile kimlik ayrıca
   gerekiyor.
5. Bağlantı kurulamayınca codex yeniden denemeyi sürdürüyor, kendi kendine
   çıkmıyor; `doctor` zaman aşımında ağacı öldürüyor (exit 137).

`doctor`ın varlık sebebi tam buydu: "bayraklar yanlış" ile "ağ kapalı"yı
ayırmak. Ayırdı.

**Durum:** adaptör gidebileceği yere kadar doğrulandı; ölçüm arşivinde hâlâ
tek bir tamamlanmış codex koşusu yok, çünkü hiçbiri ağ katmanını geçemedi.
Çapraz satıcı 2x2'si (2. adım) buna bağlı olduğu için açılmadı.

---

## YENİ KURALLA TEKRAR KOŞULDU (1 Ekim, ikinci kampanya): OLUMSUZ

İki görev × `claude-haiku-4-5` × k=3, iki kol da baştan (12 koşu, **$4.56**).
Eski kuralın kaydı `.skein/arsiv/events-6d-kampanya-2026-10-01-eskikural.jsonl`'e
ayrıldı — eski ve yeni kuralın koşularını bir grupta toplamak iki
mekanizmanın karışımını ölçmek olurdu.

```
snapshot-store  plansız 6 kırmızı/48 · planlı 6 kırmızı/48 · azalma %0 · OLUMSUZ
async-pool      plansız 2 kırmızı/36 · planlı 2 kırmızı/36 · azalma %0 · OLUMSUZ
KARAR: OLUMSUZ
```

Projenin **ilk net kararı**: önceki iki kampanya YETERSİZ/BELİRSİZ vermişti.
Planlama turu ürünü daha doğru yapmadı; bedeli ~2.2 kat aktivasyon.

**Ama bu kampanya yeni kuralı sınamıyor.** Altı planlı koşuda:

| ne oldu | sayı |
|---|---|
| koşu hiç itiraz yazmadı | **4 / 6** |
| **eski** kural eledi (kanıtta yol yok: "Satır 47-49") | 4 |
| geçerli (`src/selector.ts:7-16`) | 1 |
| **yeni** kural eledi | **1 → düzeltmeden sonra 0** |

%0'ı açıklayan şey kural değil: planlı kol çoğu koşuda "plan yazıldı, kimse
itiraz etmedi"ye indi. Baskın kayıp **kanıtın biçimi** — itirazcı plan satır
numarası yazıyor, depodan yol göstermiyor; onu eleyen kural eskiden beri var.

**Kuralın tek ateşlenmesi yanlış elemeydi, düzeltildi.** Gerçek itiraz kanıtı
madde madde yazdı: bir madde plan belgesini, öteki `src/selector.ts:10-11`'i
gösteriyordu. `kanitYolu` ilk yolu alıyordu → itiraz atıldı. `kanitYollari`
eklendi; üç koşul da bütün yollara bakıyor, en az biri geçerliyse itiraz
ayakta. Altından ikincisi çıktı: boşlukla ayırma aynı parçayı ters
tırnaklarıyla da aday yapıyordu. 5 yeni sınama, üçü mutasyonla doğrulandı.

**Hizalama korelasyonu çürüdü.** Aynı gün "koda işaret eden itiraz kusurun
elenmesine denk geliyor" yazmıştım. Bu kampanyanın `snapshot-store` 1.
koşusunda iki itiraz da `src/selector.ts`'i gösterdi, ikisi de kabul edildi —
ürün yine 14/16. Olası sebep: itirazın kabulü PLANIN değişmesi demek, kodun
değişmesi demek değil; `coder` güncellenmiş planı okuyup aynı kusuru
yazabiliyor.

**Güç uyarısı:** `async-pool` kontrol kolu %14'ten %6'ya indi (iki koşu
12/12 temiz). O görevin %0'ı düşük güçlü. `snapshot-store` iki kampanyada da
aynı: 6 kırmızı, her koşuda aynı iki kanca.

**Kendi tuzağım:** kural ve istem değişikliği birlikte gitti.
`snapshot-store`'da itiraz 4→1 düştü; kuraldan mı istemden mi değişkenlikten
mi olduğu bu veriyle ayrılamaz. `async-pool`'da ayrılabiliyor: itirazlar
yazıldı, eski kural eledi — sebep istem değil.

**Sıradaki kaldıraç:** isteme bir karşı örnek ("Satır 47-49 bir yol
DEĞİLDİR"). Kendiliğinden yapılmadı: her istem değişikliği sonraki
kampanyayı karıştırıyor ve bu tuzağa bu kampanyada bir kez düşüldü.

### Ortam: izin modu her komutta verilmeli

Konteyner root altında koşuyor ve sağlayıcı CLI'ı `bypassPermissions`'ı
reddediyor. Üç koşu $0 harcayıp `ÖLÇÜLEMEDİ` düştü, sebebi ekrana basıldı.
Kabuk ortamı çağrılar arasında kalmadığı için **her** `planab` komutunun
başına gerekiyor:

```
SKEIN_PERMISSION_MODE=acceptEdits SKEIN_ALLOWED_TOOLS="Read,Write,Edit,Bash(git:*)"
```

Sessiz geri düşme bilerek yok (`src/bench/cli.ts`): izin modu koşular
arasında sessizce değişirse karşılaştırma fark edilmeden bozulur.

---

## 6d KAMPANYASI TAM KOŞTU (1 Ekim) — iki görevde de BELİRSİZ

Önceki kampanya mekanizma kusurlarına çarpmıştı. Üç düzeltmeden sonra
(kural 22, itiraz durumu ayrıştırıcısı, `--devam`) kampanya ilk kez iki
görevde de **k=3**'e ulaştı. Ayrıntı `PLANLAMA.md`'de.

```
=== snapshot-store × haiku-4.5 · k=3 ===
  plansız   3 koşu  48 kanca  6 kırmızı  %13   6 akt  $0.75
  planlı    3 koşu  48 kanca  2 kırmızı   %4  24 akt  $3.20  (3 ÖLÇÜLEMEDİ)
  göreli azalma %67 · koşu başına %100, %0, %100 · %40 itirazsız
  karar: BELİRSİZ — eşiğin üstünde ama işaret tutarsız

=== async-pool × haiku-4.5 · k=3 ===
  plansız   3 koşu  36 kanca  5 kırmızı  %14   8 akt  $0.92
  planlı    3 koşu  36 kanca  4 kırmızı  %11  20 akt  $2.48
  göreli azalma %20 · koşu başına %0, %100, %-100 · %33 itirazsız
  karar: BELİRSİZ — eşiğin üstünde ama işaret tutarsız

KARAR: YETERSİZ
```

**Önceden ilan edilmiş kurala göre cevap: planlamanın ürünü daha doğru
yaptığı gösterilemedi.** Azalma iki görevde de eşiği geçiyor (%67, %20)
ama ikisinde de bir tekrar ters yönde çıktı; kural işaret tutarlılığı
istiyor. %67'yi "olumlu" okumak, üç tekrardan birinde hiçbir iyileşme
olmadığını gizlemek olurdu.

**Kurduğum hipotezi veri çürüttü.** `snapshot-store`'da örüntü temizdi:
itiraz açılıp kabul edildiğinde 16/16 (iki kez), alışveriş boş geçtiğinde
14/16. `async-pool` bunu iki yönden de yanlışladı — **0 itirazla 12/12**,
**4 itirazla 10/12**. Mekanizmanın çalışması ile ürünün düzelmesi arasında
bu veriyle kurulabilen bir bağ yok.

**Kusur azalmıyor, kayıyor — ve bu artık doğrulandı.** Kanca KİMLİĞİ
karşılaştırıldı (`planeffect` artık `HookSets` basıyor): `snapshot-store`'da
kayma **yok** (iki kolun kusurları aynı iki kancada, yani %67 gerçek bir
azalma), `async-pool`'da kayma **gerçek** (sayı 5→4 düşerken kusur sınıfı
2→3 çıktı, ikisi yeni). O görevin %20'si iyileşme diye okunamaz. Sayıya
bakan rapor bu farkı göremiyordu; artık her grupta kimlik satırı var.

**Tartışmasız tek sonuç bedel:** planlı kol iki görevde de 3-4 kat pahalı
(24/6 ve 20/8 aktivasyon).

**Mekanizma artık çalışıyor:**

| | 30 Eylül | 1 Ekim |
|---|---|---|
| itiraz / ret | 0 itiraz, 7 ret | **9 itiraz, 9 kabul, 4 ret** |
| itirazsız alışveriş | %100 | %40 ve %33 |
| kol kaybı sebebi | ret limiti (mekanizma) | zaman penceresi (ortam) |

### Koşum ortamı: öğrenilen üç sınır

Bunlar bu konteynerin gerçekleri, kodun değil:

1. **Konteyner, oturum boşta kalınca geri alınıyor.** İlk tam kampanya
   böyle öldü ve bir süre koştuğunu sandım — `pgrep` eşleşmesi kendi
   kabuk sarmalayıcımdı. "Öldürdüm" ya da "koşuyor" demek yetmiyor;
   **günlüğün büyüyüp büyümediğine** bakmak gerekiyor.
2. **Tek komut 10 dakikada kesiliyor.** İtiraz turu olan planlı kollar
   bunu aşıyor. Çözüm `planab --kol` (tek kol) + `--devam` (kaldığı
   yerden sürdürme, orkestratörün `recover()`'ı üzerinden).
3. **Konteyner, tool çağrısı yapmadığım sürece askıda.** Arka plan işi
   ancak ben çalışırken ilerliyor; uzun kolları ÖN PLANDA koşturmak
   gerekiyor.

Senin makinende bu üçü de yok: `planab <görev> --k=3` tek komutta biter.

### İtiraz kusura denk geldiğinde kusur eleniyor — ve bir kural kusuru

İkinci analiz (geçerli itirazın kanıt yolu ile kırmızı kancanın dosyası)
tam ayrışma verdi:

| görev | geçerli itiraz | **koda** işaret eden | **plan belgesine** işaret eden | sonuç |
|---|---|---|---|---|
| `snapshot-store` | 4 | **4** (`src/selector.ts`) | 0 | 16/16 (iki koşu) |
| `async-pool` | 5 | 0 | **5** (`docs/plan/<kart>.md`) | kusur kaldı/kaydı |

İyileşen koşuların hepsinde itiraz planın dokunacağı modülün
**tüketicisine** işaret ediyor; iyileşmeyenlerin hepsinde **planın kendi
belgesine** — yani "plan şöyle diyor", döngüsel bir kanıt. k=3'te bu bir
korelasyon. Ama **kural kusuru** kısmı kanıt gerektirmiyor: kanıt
kuralının gerekçesi "model tüketici modülü okudu mu" idi, plan belgesini
göstermek bunu hiç göstermiyor; eski kural ayrımı yapamıyordu çünkü plan
belgesi de depoda ve `varMi()` geçiyordu.

**Kapatıldı:** `parseItirazlar` artık `kendiBelgeleri` alıyor (kartın plan
belgesi + itiraz dosyaları) ve o yolları gösteren itirazı geçersiz sayıyor.
Depodaki başka belgeler kanıt olmayı sürdürüyor; kapatılan şey döngü.
İtirazcı istemine gerekçesiyle yazıldı. 5 yeni sınama (3 ayrıştırıcı,
2 `tick` bağlantısı), üçü mutasyonla doğrulandı.

### Sıradaki adım — koşuldu, aşağıda

Kuralın canlı sınavı yapıldı; sonucu bir sonraki bölümde. Kısası: kural hiç
ateşlenmedi ve kampanya ilk kez net bir OLUMSUZ verdi.

---

## 6d KAMPANYASI KOŞULDU — karar çıkmadı, ama dört şey öğrenildi

30 Eylül, iki görev × `claude-haiku-4-5`, hedef k=3. **$12.20 harcandı,
karar çıkmadı.** Ayrıntı `PLANLAMA.md`'de; özeti burada.

```
=== snapshot-store × haiku-4.5 · k=2 ===
  plansız  3 koşu  48 kanca   6 kırmızı  %13   6 akt  $0.55  0 ret
  planlı   2 koşu  32 kanca   2 kırmızı   %6  16 akt  $2.41  3 ret  (1 ÖLÇÜLEMEDİ)
  göreli azalma %50 · koşu başına %0, %100

=== cache-refresh × haiku-4.5 · k=1 ===
  plansız  3 koşu  66 kanca   2 kırmızı   %3  12 akt  $2.29  3 ret
  planlı   1 koşu  22 kanca  10 kırmızı  %45  17 akt  $3.42  5 ret  (2 ÖLÇÜLEMEDİ)
  göreli azalma %-1400

  KARAR: YETERSIZ
```

**1. İtiraz mekanizması kullanılmıyor; ret kanalı kullanılıyor.** Plan
itirazcısı (`architect`) **7 ret verdi ve 0 itiraz yazdı**. Retlerin
gerekçeleri tam da tasarımın istediği cinsten ("plan `#stateSnapshots`
mekanizmasını göz ardı ediyor, `snapshots.length == history.length + 1`
değişmezini kırar"). Yani söyleyecek şey vardı, yanlış kanaldan söylendi.
Tören ölçüsünün "%100 itirazsız" demesi artık **yanıltıcı**.

Sebep tasarımda: itirazcı rol hem `reject` kenarı hem itiraz dosyası
taşıyordu. **Kural 22 yazıldı (1 Ekim):** planlama katılımcısı `reject`
taşıyamaz — açık yazılmışsa akış reddedilir, varsayılan kenar da kaldırılır
ve `flow check` bunu gösterir. Çalışma zamanında da kapandı: planlama
turunda verdikteki `decision` kanal sayılmıyor, tur itiraz dosyasından
okunur ve deneme uyarı olarak kayda geçer. Ayrıntı `PLANLAMA.md`'de.

**2. Kol kaybı asimetrik ve deney kolunda.** Gerçek kayıpların ikisi de
planlı kolda, `reject.limit` dolduğu için. Hiçbir kontrol kolu düşmedi.
Bu ölçümü yavaşlatmıyor, **bozuyor**. Kural 22 bu kaybın sebebini kaldırdı;
tekrar koşuda sınanacak.

**3. Hücre seçiminin doğru tablosu yok.** İlk deneme
`snapshot-store × sonnet-5` ile başladı, kontrol kolu 16/16 yeşil verdi
(ölçüm gücü yok) ve $1.19'a durduruldu. Sebep: eşik tablosu **tek ajanlı
`produce`** yolunu ölçüyor, AB kolları koder+reviewer zinciri.
`cache-refresh`te de aynı: tek ajanlı yolda 10/22 kırmızı, zincirde 2/66.
**Zincir çıplak üreticiden belirgin şekilde güçlü** — denetim turunun
değerine dair bağımsız bir sinyal, ve 6d için ayrı bir kalibrasyon
gerektiriyor.

**4. Yön, olduğu kadarıyla, olumlu değil.** `snapshot-store`ta %50 azalma
ama işaret tutarsız (%0 ve %100). `cache-refresh`in tek planlı koşusu
%-1400. İki görev ayrışıyor. Bedel tekrarlanıyor: planlı kollar **3-4 kat**
pahalı.

**Karar kuralı doğru davrandı:** hiçbir sayı karara çevrilmedi, düşen
kollar `ÖLÇÜLEMEDİ` sayıldı, "0 kırmızı" sayılmadı.

### Tekrar koşmadan önce

1. ~~Kural 22'ye karar ver~~ — **yazıldı.** Asimetrik kol kaybının sebebi
   kaldırıldı; kuralın asıl sınavı, tekrar koşuda itirazcının gerçekten
   itiraz dosyasını kullanması.
2. **Hücreleri zincire göre kalibre et.** `planab` öncesi her aday hücrede
   tek bir kontrol kolu koş; kontrol kolu temizse o hücre ölçemez. Bugünkü
   bilgi: `snapshot-store × haiku` zincirde belirlenimci olarak 14/16
   (ölçülebilir), `× sonnet` 16/16 (ölçülemez), `cache-refresh × haiku`
   zincirde yalnızca 2/66 (zayıf).
3. Sonra: `planab <görev> --k=3 --model=claude:claude-haiku-4-5-20251001`,
   iki-üç görev, ~$12-15. Kol kaybı için fazladan tekrar bütçesi ayır.

---

## SENİN İKİNCİ İŞİN — 6d kampanyası (planlama işe yarıyor mu)

Çapraz satıcı ölçümünden **bağımsız** ve tek satıcıyla koşulabilir; bu
yüzden ikisi paralel gidebilir. Sorduğu soru: **plandan önce yazılı bir
alışveriş, ürünü daha doğru yapıyor mu, yoksa sadece iki aktivasyon mu
ekliyor?**

```bash
# Ağacın TEMİZ olmak zorunda — kapı operatörün işini ajanın işinden
# ayırt edemiyor ve kirli ağaçta kart kapıda kalır.
git status --porcelain      # boş çıkmalı

export SKEIN_PERMISSION_MODE=acceptEdits
export SKEIN_ALLOWED_TOOLS='Read,Write,Edit,Bash(git:*)'
#  ^ `Bash(git:*)` ŞART: rol kendi işini commit etmek zorunda, yoksa
#    devir olmaz ve kart kapıda kalır.

# İki görev × k=3. Her komut iki kol koşar (kontrol + deney).
npx tsx src/bench/cli.ts planab snapshot-store --k=3 --model=claude:claude-sonnet-5
npx tsx src/bench/cli.ts planab cache-refresh  --k=3 --model=claude:claude-sonnet-5

npx tsx src/bench/cli.ts planrapor
```

**Görev seçimi ölçümün gücünü belirliyor.** Kontrol kolunda kırmızı kanca
çıkmazsa "azalma" tanımsızdır ve rapor YETERSİZ der — doğru davranış, ama
harcanmış para. Bugünkü hatla kusur üreten görevler: `snapshot-store`
(16 kancanın 2'si, haiku ve sonnet'te belirlenimci), `cache-refresh`
(22'nin 10'u, haiku), `csv-roundtrip` ve `async-pool` (haiku). Yani
**sonnet üreticisiyle `snapshot-store` en güvenli hücre; `cache-refresh`
için haiku daha güçlü.** `retry-backoff`, `config-patch`, `outbox-flush`
koşma.

**Maliyet:** kontrol kolu 2 aktivasyon, deney kolu 4. Haiku'da kol çifti
~$0.5, sonnet'te ~$1.5–2. İki görev × k=3 kabaca **$6–12**.

**Koşarken ekrana bakılacak tek satır:** bir kol "ÖLÇÜLEMEDİ" derse
altındaki `sebep:` satırını oku. Bugüne kadar görülen sebep: rolün
**commit atlamamış olması** ("işlenmemiş iş devredilemez"). Bu bir ölçüm
sonucu değil, kolun düşmesidir — ve `planrapor` onu `ÖLÇÜLEMEDİ` diye ayrı
sayar, "0 kırmızı" saymaz. Bir kolda sistematik olarak çıkıyorsa
karşılaştırma bozulmuştur: modeli yükselt (haiku bunu atlayabiliyor,
canlı doğrulamada bir kez atladı) ve o görevi yeniden koş.

**Önceden ilan edilmiş eşikler** (`PLANLAMA.md`, sonuçtan önce yazıldı):
kırmızı kanca oranında ≥%20 göreli azalma olumlu, <%10 olumsuz; karar için
k≥3 ve tekrarlar arasında işaret tutarlılığı. Ayrıca iki tören ölçüsü:
kabul edilen itiraz oranı <%20 ise mekanizma gürültü, itirazsız alışveriş
oranı >%50 ise mekanizma tören.

**Bugünkü dürüst beklenti şu ki ikinci tören ölçüsü kırmızı yanacak.**
Canlı koşulan üç alışverişin üçü de **sıfır itirazla** kapandı
(`plan.settled` → `outcome: anlasma`). Üçünde de itiraz eden rol planı
gerçekten okuyup kontrol ettiğini listeledi, yani sessizlik değil; ama
"ikinci bir çift göz" ile "itiraz üreten mekanizma" aynı şey değil.
Ölçüm tam bu ayrımı kesecek.

---

## Ne çalışıyor

```
npx tsx src/flow/cli.ts check <akış>            topolojiyi doğrula + maliyet
npx tsx src/card/cli.ts new|ls|show|kapat …     kartı elle sür
npx tsx src/watch/cli.ts <akış> --model …       orkestratör (toplu koşu)
npx tsx src/watch/cli.ts <akış> --serve …       gözcüyü açık bırak
npx tsx src/flow/cli.ts check hub/flows/plan.yaml   planlı örnek akış (6a)
npx tsx src/flow/cli.ts check hub/flows/plan2.yaml  itiraz turlu akış (6b)
npx tsx src/flow/cli.ts check hub/flows/plan3.yaml  üç katılımcı, iki tur (6c)
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

### 6b: plana itiraz turu

Alışveriş kodda. `planlama.katilimcilar` iki rol alabiliyor: ilki planı
yazar, ikincisi **itiraz eder**, yazan itirazları yanıtlar, sonra iş kodu
yazan role geçer. Kart bu sırada zincirden ayrılıp katılımcılar arasında
dolaşıyor; zincirin `next`i ancak alışveriş kapanınca devreye giriyor.

**İtiraz serbest yorum değil**, dört alanlı bir kayıt — ve mekanizma onu
makineyle okuyor (`src/plan/itiraz.ts`):

```markdown
## İtiraz 1 — architect
**Ne:** Planın hangi kararı yanlış.
**Neden:** Neden yanlış.
**Neyi yanlışlar:** `src/selector.ts:12` — orada ne var.
**Durum:** açık
```

`Neyi yanlışlar` **depodan bir yere işaret etmek zorunda**: yol depoda
aranıyor, yoksa itiraz sayılmıyor — ne lehte (planı durdurmaz) ne aleyhte
(reddedilmiş sayılmaz). Bu kural doğrudan eşik ölçümünden geldi: "sınır
durumlarına dikkat" diyen bir itiraz hiçbir dosyaya işaret edemez.

**Üç kapı:** itiraz dosyası yoksa tur kabul edilmez (sessizlik anlaşma
değil); `kabul` denip plan değişmemişse tur kabul edilmez (nezaket
çöküşü); açık kalan ya da `insana` denen itiraz **kilit kapısına** çıkar —
kaçış değil, çünkü tur tamamlandı ve kod yerinde, insan planı olduğu gibi
ileri bırakabilir.

Hangi turda olunduğu **kartın geçmişinden** okunuyor (`src/plan/phase.ts`),
bellekte tutulan bir durumdan değil: gözcü çökse de kart nerede kaldığını
kendi taşır.

**İki canlı koşu — ve dürüst sonuç.** `plan2.yaml` iki kez gerçek ajanlarla
koştu; ikisinde de mekanizma uçtan uca çalıştı. **Ama bitiş testi ikisinde
de geçilmedi: 2/2 alışveriş SIFIR itirazla kapandı.** İtiraz eden rol her
seferinde planın iddialarını depodaki kodla dosya:satır atıflarıyla
doğruladı ve uydurma itiraz eklemeyi açıkça reddetti; ikincisinde planın
bir satır aralığı kaymasını fark edip itiraz AÇMAMA kararını gerekçelendirdi.

Bugünkü dürüst okuma: **mekanizma ikinci bir çift göz üretiyor, itiraz
üretmiyor.** İkisinin aynı şey olup olmadığı ölçümün (6d) sorusu.
`kabul` / `ret` / `insana` / kilit kapısı yolları yalnızca testlerle kapalı.

**İkinci koşu denetim katmanının sınırını de gösterdi:** `coder` ekranın
gömülü betiğine ters tırnak içeren bir yorum yazdı; o betik bir şablon
dizesinin içinde durduğu için **dosya derlenmez oldu**. Ne kodu yazan ne
denetleyen rol derleyiciyi koşturabildiği için (sandbox'ta onay yüzeyi yok)
ikisi de "elle doğruladım" dedi. Birleştirdikten sonra derleyici kusuru bir
saniyede buldu. Ders: **doğrulama koşturulamıyorsa denetim turu bir kanaat
turudur** — "ÖLÇÜLEMEDİ ≠ temiz"in akış tarafındaki karşılığı.

Koşular dört kusur çıkardı, dördü de düzeltildi:

- **"İtiraz yok" ile "itirazların hiçbiri sayılmadı" tek sayıya eriyordu.**
  Geçersiz itirazlar artık ayrı sayılıyor ve günlüğe, kart izine, gözcü
  satırına düşüyor.
- **Alışveriş kartın kendi izinde görünmüyordu** (`card show` `plan`
  kaydını atlıyordu). Bunu **itiraz eden rol kendi raporunda tespit etti.**
- **Kanıt kuralı fazla katıydı:** satırdaki ilk ters tırnak yol değilse
  (`` `Store.undo()` — `src/store.ts:12` ``) iyi niyetli bir itiraz biçim
  yüzünden sayılmıyordu. Artık yol gibi görünen ilk parça seçiliyor.
- **Orkestratörü kendi düzenlediğin ağaçta koşturma.** "Kabul temiz ağaç
  ister" kapısı, ajanın işiyle operatörün işini ayırt edemez: benim
  commit'lenmemiş dosyalarım planner'ı kapıya çıkardı. Kapı doğru davrandı;
  ders `RUNNING.md`'ye yazıldı.

Ajanların ürettiği iş (gözcü geçiş satırında planlama turu) birleştirildi;
testleri yine ben koşturdum. Üstelik ürettikleri modül, benim yazdığım
`lastPlanEntry`'nin bu iş için yanlış araç olduğunu gösteriyor: planlaması
bitmiş bir kart her sıradan geçişte eski turu göstermeye devam ederdi.
Ayrı bir `thisTurnPlanEntry` yazıp gerekçesini yorumda anlatmışlar.

### 6c: çok tur, çok katılımcı, sayaç ve kilit

Kaldırılan iki sınır: `planlama.tur` artık 1..5, `katilimcilar` üç ve
fazlası olabiliyor. Örnek akış `hub/flows/plan3.yaml` — üç katılımcı, iki
tur, ~9 aktivasyon/kart.

- **Turun şekli:** bir tur = bütün itirazcılar (zincir sırasında, birer
  birer) + yazarın yanıtı. Sıra ayrı bir alanda tutulmuyor, kartın
  geçmişinden hesaplanıyor (`src/plan/phase.ts`). Bir "sıra" alanı,
  kartla senkron kalmak zorunda olan ikinci bir gerçek olurdu.
- **Turun ortasında sonlanma kararı verilmiyor.** İlk itirazcı sessiz
  kalabilir; turun sessiz olup olmadığı ancak son itirazcı konuştuktan
  sonra bilinir.
- **Yeni itiraz sayacı:** dosya birikimli, ama sonlanma kuralı turun KENDİ
  katkısını soruyor (`objectionBaseline`). Ekran ikisini ayrı basıyor:
  `tur 2, 3 itiraz (bu turda +1)`.
- **Doğal son yazarın turunu atlıyor:** son itirazcı yeni bir şey
  eklemediyse ve açık itiraz yoksa alışveriş orada kapanıyor. Yanıtlanacak
  şey yokken yazarı uyandırmak, bedeli olan bir nezaket.
- **Kilit:** tavan doldu ya da tur yeni itiraz eklemedi, ama açık itiraz
  var → `gate.kind: deadlock`, `plan.settled` outcome `tukendi`. `insana`
  çıkışı artık kendi adıyla kayda geçiyor; `kacis`e ya da `tukendi`ye
  sıkıştırmak ikisi de yanlış olurdu.
- **Planı yalnızca insan yeniden açıyor:** kapıdan `retry` aynı rolü AYNI
  tura geri koyuyor (kart geçmişinden okunuyor); `forward` alışverişi
  yeniden açmıyor.

**Kendi işime saldırgan bakınca bir kusur daha çıktı:** yeniden açma
tespiti "plan kaydından sonraki ilk kapı + bırakma" diye tarıyordu, ve o
tarama zincirin **ilerisinden** gelen bir `back` kararını da yeniden açma
sayıyordu (coder kapıya çıkar, insan `back` der, hedef ret hedefi = planı
yazan rol). Kart plan için değil kodla ilgili bir sebepten dönüyor; yazara
"itirazları yanıtla" turu verilirdi. Kapı artık plan kaydının **hemen
ardından** gelmek zorunda. Regresyon testi yazıldı ve eski gevşek tarama
geri konarak testin tuttuğu doğrulandı.

**Bir kusur daha:** `planGateEntry` yalnızca `cevap`
kaydına bakıyordu, oysa 6c'de kilit **itirazcının** turunda da doğabiliyor.
O kilidi tanımayan bir okuyucu `forward`u zincirdeki ardıla — yani itiraz
eden role — gönderirdi, tam olarak bu fonksiyonun önlemek için var olduğu
hata.

**Körleme 6c'de yapılmadı ve gerekçesi 6e'yi doğurdu.** 6b'de gerekçe "iki
katılımcıda etkisi yok, 6c'de anlam kazanır" idi; 6c üç katılımcıyı açtı ve
gerekçe düştü. Yerine daha keskin bir gerçek geldi: kod taşıma ileri
birleştirme, yani ikinci itirazcının ağacı birincinin itiraz dosyasını
**alıyor**. Körleme talimatla sağlanamaz (dosya orada); taşımanın şeklini
değiştirmek gerekiyor. 6c alanı iki değerle de reddetti ve işi 6e'ye
ayırdı — o da yukarıda yazıldı.

**Doğrulama:** `src/plan/phase.test.ts` (15, saf sıra makinesi — diske hiç
dokunmuyor) ve `src/watch/exchange3.test.ts` (6e'de yeniden yazıldı). Sıra
makinesinin gerçekten sınandığı **mutasyonla** doğrulandı: tabanı hep 0 döndürünce 5 test, turun
ortasındaki devri kapatınca 8 test, tavan kontrolünü kaldırınca 2 test
kırmızıya döndü.

Ayrıca kendi testimde bir kusur çıktı: topoloji fikstürünü `as
TopologySnapshot` ile yazmıştım ve cast, alan adının yanlış olduğunu
(`promptFile` ≠ `prompt`) ve `constitution`ın eksik olduğunu gizliyordu.
Cast kalktı, derleyici ikisini de söyledi. **Testte `as`, testin kendisini
sınanmaz yapıyor.**

**Canlı koşulmadı.** 6b iki canlı koşuyla doğrulanmıştı; `plan3.yaml`
gerçek ajanla koşmadı. Kampanya komutu aşağıda.

### 6e: körleme taşıma katmanına indi

6c'nin bıraktığı iş, ve asıl mesele şu: **körleme bir talimat olarak
yazılamaz.** "Ötekinin itirazını okuma" diyen bir prompt, dosya ajanın
ağacındayken hiçbir şey garanti etmez ve okumadığı hiçbir yerden
doğrulanamaz. Körleme ancak dosyanın o ağaçta **hiç bulunmaması** ile olur.

- **Fan-out:** körlü turda hedef ağaç, önceki itirazcının ağacından değil
  **yazarın** ağacından besleniyor. İkinci itirazcının ağacında plan var,
  birincinin itiraz dosyası yok.
- **Fan-in:** turun sonunda bütün itirazcıların ağaçları sırayla yazarın
  ağacına katılıyor. Kodda tek yer: `handOverCode` artık bir kaynak rol
  listesi alıyor.
- **İtirazcı başına dosya** (`docs/plan/{kart}.itiraz.{rol}.md`). Zorunlu:
  fan-in N ağacı tek ağaca katıyor ve hepsi aynı yolu yazsaydı her
  birleşme çakışırdı. Numaraların roller arasında çakışması sorun değil —
  kimlik (dosya sahibi, numara) çifti. Yan fayda: 6c'de prompta yazdığım
  "ortak dosyayı ezme" tuzağı tamamen kalktı.
- **Körlü turda sonlanma kararı yazarda.** 6c'nin kuralı "son itirazcı
  yeni itiraz olmadığını görürse alışveriş biter"di; körlemeyle bu
  tehlikeli: son itirazcı kendi dosyasından başkasını görmüyor, o kararı
  verse birinci itirazcının itirazı sessizce çöpe giderdi. Körlü tur artık
  her zaman yazarın turuyla bitiyor. Bedeli: itirazsız bir körlü tur bile
  yazarın bir aktivasyonunu harcıyor.
- **Kaybolan dosya sessizce "itiraz yok" sayılmıyor.** Fan-in'den sonra her
  itirazcının dosyası yazarın ağacında olmak zorunda; biri yoksa tur
  reddediliyor. Eksik dosyayı "itiraz yazmamış" diye okuyan bir mekanizma,
  taşıma her bozulduğunda itirazı yutardı.
- **Atıl körleme `true` yazılmıyor:** tek itirazcıda etkisi yok, `plan.round`
  `blind: false` diyor ve `flow check` "körleme tek itirazcıda atıl" yazıyor.

**Bu iş yolda ikinci bir kusur açtı ve o benim 6c'den kalan deliğim:**
"körleme ayarı hash'i değiştirir" testi kırmızı çıktı, sebebi plan
politikasının hash'e giren parçasının yalnızca `katilimcilar` + `plan` yolu
olmasıydı. Yani **`tur` da hash'in dışındaydı** — 6c tavanı 1..5 yaptığı
andan itibaren, yalnızca `tur`da ayrışan iki akış aynı topoloji damgasını
üretiyordu. Damga, davranışı belirleyen bir kararı gizliyordu. İkisi de
hash'e eklendi.

**Doğrulama:** `src/watch/exchange3.test.ts` yeniden yazıldı (19 test,
körlü ve açık taşıma). Kritik nokta koşumda: sahte `mergeForward` artık
**gerçekten kopyalıyor**. Dosyaları her ağaca elle yazan eski koşum,
taşımanın ne yaptığını hiç sormamış olurdu — körlemeyi sınayamazdı.
Mutasyonla: fan-out'u kaldırınca 2, fan-in'i kaldırınca 4, kararı son
itirazcıya bırakınca 5 test kırmızıya döndü. Toplam 674 yeşil.

### Canlı koşu (30 Eylül): körleme uçtan uca çalıştı

`plan3.yaml` × `claude-sonnet-5`, kum havuzu deposunda (`snapshot-store`
tohumu) — gerçek depo kirletilmedi. **6 aktivasyon · $1.98.**

Bitiş testinin iki yarısı da canlıda geçti:

- **Fan-out:** `architect` itirazını yazıp commit'ledikten sonra kart
  `analyst`e geçti ve `analyst`in ağacında `...itiraz.architect.md`
  **yoktu**. Git geçmişi kanıt: o ağaçtaki son commit yazarın plan
  commit'i, architect'in commit'i değil.
- **Fan-in:** `analyst` bitirdiğinde yazarın ağacında iki dosya da vardı.

Üç `plan.round` olayının üçünde `blind: true`. Kart izi sırayı gösteriyor:
`planner planı yazdı → architect itiraz turu → analyst itiraz turu →
planner itirazları yanıtladı → coder → reviewer → bitti`.

**Doğal son parayı gerçekten kurtardı:** tavan 2 tur, en kötü hâl 9
aktivasyon; alışveriş tur 1'de kapandığı için koşu 6'da bitti.

**Ama körleme ilk koşusunda çeşitlilik değil YAKINSAMA üretti.** İki
itirazcı birbirini görmeden aynı şeyi buldu: `selector.ts`'in
`state.version === sonSurum` önbelleğinin version geri sarılırsa bayat
sonuç döndüreceği. İkisi de planın bunu zaten doğru çözdüğünü söyleyip
itiraz açmadı — beşinci canlı alışveriş de sıfır itirazla kapandı (5/5).

Dürüst okuma: koşu körlemenin **mekanizmasını** doğruluyor, **değerini**
doğrulamıyor. Plan bu koşuda gerçekten doğruydu ve kusuru olmayan bir
planda itiraz çeşitliliği ölçülemez.

**Yan sinyal, ölçüm DEĞİL:** üretilen kod gizli süitte **16/16 yeşil** —
eşik ölçümünde haiku ve sonnet'in üçer koşunun üçünde de düşürdüğü iki
kanca dahil (`version geri gitmez`, `version hiçbir zaman tekrar etmez`).
Karşılaştırılabilir değil: eşik ölçümü tek ajanlı `produce` yolundan
geçiyordu, bu koşu beş rollü zincirden; kontrol kolu yok, k=1. Ölçüme
çevirecek şey 6d kampanyası.

### 6d: ölçümün koşum takımı yazıldı

`src/bench/ab.ts` + `src/bench/planeffect.ts` + `cli.ts planab|planrapor`.
Ölçütler `PLANLAMA.md`'de sonuçtan önce ilan edilmişti; bu oturumda onları
koşturan alet yazıldı. **Ölçümün kendisi koşulmadı** — kampanya senin
makinende koşacak, komutlar aşağıda.

Takımın taşıdığı tasarım kararları:

- **Kolların tek farkı planlama bloğu.** `ab-plansiz.yaml` ve
  `ab-planli.yaml` başka hiçbir yerde ayrışmıyor; ayrışsalar hiçbir sayı
  planlamaya yazılamazdı.
- **Her koşu kendi kum havuzu deposunda.** Ajanların ürettiği çözüm bu
  depoya yazılmıyor. Üretim sırasında kum havuzunda `hidden/` **yok** —
  casus adaptörle test edildi, çünkü bu tam olarak ölçümün geçerlilik
  koşulu.
- **Kolun kimliği günlüğe yazılıyor, çıkarsanmıyor** (`ab.arm`).
  "Plan olayı var mı" diye bakmak, planlayıcısı hiç koşmamış bir planlı
  kolu kontrol kolu gibi gösterirdi.
- **Eşikler `effect.ts`ten import ediliyor**, kopyalanmıyor; gruplama aynı
  ve `repeats = min(planlı, plansız)` — eksik kolla koşulmuş görev k'yı
  şişirmiyor.
- **Ölçülemeyen koşu ayrı sayılıyor** (`unmeasured`) ve rapora basılıyor.
  "0 kırmızı" ile "yer gerçeği yok" aynı hücreye düşemez.

**Canlı doğrulama üç kusur çıkardı, üçü de aletin kendisinde:**

1. **`--k 1` biçimi model adını yuttu.** `"1"` konumsal argüman olarak
   kalıp model tanımı diye okundu; adaptör `1` diye kaydedildi ve iki kol
   da "ÖLÇÜLEMEDİ · 0 aktivasyon · $0.0000" döndürdü. Para harcanmadı ama
   **çıktı bir ölçüm sonucu gibi duruyordu.**
2. **Adaptör haritası yanlış anahtarla kuruluyordu.** `adapterFor`
   adaptörün `id`'sine model tanımının tamamını yazıyor
   (`claude:claude-haiku-4-5-20251001`) çünkü 2x2 hücreleri model
   düzeyinde ayrışmak zorunda; akış rolleri ise `provider: claude` diyor.
   Harita `adapter.id` ile kurulunca hiçbir rol adaptör bulamıyordu.
   Testler haritayı **elle** `"claude"` anahtarıyla kurduğu için gerçek
   kablolamayı hiç sınamamıştı; kurulum artık `armAdapters()` içinde tek
   yerde ve üç testle kaplı.
3. **Kapıda kalan kolun SEBEBİ görünmüyordu.** "⚠ kart `gate` durumunda
   kaldı" satırı, modelin commit'i atlamasıyla ret limitinin dolmasını
   ayırt etmiyordu. Sebep artık `ArmResult.escalation` üstünden ekrana
   düşüyor — ve sebep ölçümün geçerliliğini belirliyor: bir kolda
   sistematik çıkıyorsa karşılaştırma bozulmuştur.

İlk ikisinin ortak dersi, ölçüm altyapısının en pahalı tuzağı:
**yazım hatası, sessiz sıfırla sonuçlandığında ölçümden ayırt edilemez.**
Bu yüzden `requireAdapters` koşuyu hiç başlatmadan patlatıyor — ikinci
kusuru yakalayan da tam bu oldu.

**Canlı doğrulama (snapshot-store × haiku, k=1, ~$0.56):**

```
── tekrar 1 · plansiz ──   coder: escalated  →  ÖLÇÜLEMEDİ · $0.1347
── tekrar 1 · planli  ──   4/4 rol accepted
   14/16 yeşil  ← version geri gitmez; version hiçbir zaman tekrar etmez
   4 aktivasyon · $0.4270 · alışveriş: 0 itiraz, 0 kabul
```

Deney kolu baştan sona koştu ve kırmızı düşen iki kanca, **eşik
ölçümünde haiku ile sonnet'in üçer koşunun üçünde de düşürdüğü aynı iki
kanca.** Ayrı depoda, ayrı akışla, bilinen kusur yeniden üretildi —
takımın geçerliliğine dair elde en güçlü kanıt bu.

Kontrol kolu düştü: `coder` kodu yazdı, commit atmadı, temiz-ağaç kapısı
devri reddetti. `planrapor` bunu doğru okudu — `k=0 · YETERSİZ — kontrol
kolu ölçülmedi`, `ÖLÇÜLEMEDİ` ayrı sayıldı, "0 kırmızı" sayılmadı. Aynı
koşunun planlı kolunda **aynı model commit'i attı**, yani sistematik engel
değil haiku'nun değişkenliği; ama kampanyada kolları asimetrik
düşürebileceği için sonnet üreticisi öneriliyor.

**Bir tuzak, günlüğün doğası:** `planrapor` görev başına biriktiriyor, yani
iptal edilmiş ya da düşmüş eski koşular o görevin `ÖLÇÜLEMEDİ` sayısında
kalıcı olarak görünür (doğrulamada 2+1 öyle birikti). Bu bilerek böyle —
kol kaybı görünmeli — ama temiz bir kampanya istiyorsan `.skein/events.jsonl`'i
başlamadan önce bir kenara al.

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
