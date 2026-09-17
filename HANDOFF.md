# Devir Teslim — 2026-09-17

Bu dosya bir sonraki oturumun giriş noktası. Durum ajanın kafasında değil,
burada ve git'te (PHILOSOPHY 1).

**Dal:** `claude/project-plan-brainstorm-pthvoc`
**Durum:** 336 test yeşil, typecheck temiz, origin ile senkron.
**Kod:** 5037 satır (testler hariç).
**Çizimler:** [kartın yolu](https://claude.ai/code/artifact/185e9279-510a-4544-a20c-831ecf1cdfd3) ·
[genel bakış](https://claude.ai/code/artifact/2e7575af-84ee-40d8-aab4-5c3bdce0fe50)

---

## Tek cümlede nerede kaldık

**Orkestratör bitti ve gerçek iş yapıyor** — kart açılıyor, iki farklı
satıcının ajanı arasında dolaşıyor, kod worktree'ler arasında taşınıyor,
sonuç günlüğe yazılıyor.

**Yol haritasının 1. ve 2. adımı bitti:** `--serve` ile gözcü kuyruk
boşalınca ölmüyor, uyuyor — kart açmak işin başlaması demek. Ve ajan
koşarken attığı her adım (`agent.step`) günlüğe düşüyor, tur bitmeden.
Sıra **adım 3'te: okuyucu ekran** — `ARCHITECTURE.md` "Sıra" tablosu.
Ekranın ihtiyacı olan verinin tamamı artık var.

---

## Sıradaki oturumun konusu: EKRAN

**Önce `ARCHITECTURE.md` okunsun.** Genel yapı oturtuldu: üç katman (çekirdek
/ oturum / yüzey), uzun ömürlü çekirdeğin (`skeind`) ne olduğu ve neden küçük
bir iş olduğu, yerel DB kararı (gerekmiyor; gerekirse türetilmiş indeks), ve
ekranın kıramayacağı altı değişmez orada yazılı. Aşağıdaki sorular hâlâ
geçerli ama artık boşlukta değil.

Bu tartışma kendi oturumunu hak ediyor, çünkü ilk soru "nasıl yapalım"
değil.

### Önce cevaplanması gereken: ekran karşılığını veriyor mu?

Şu an `watch` koşarken zaten okunabilir bir çıktı basıyor ve `card ls`
kuyruğu gösteriyor. Tipik koşu 2-3 dakika, tek kart. Bu ölçekte ekran ne
ekliyor?

Ekranın karşılığını verdiği yerler farklı:

- Kuyruk derinleştiğinde (10 kart, 4 rol — hangisi nerede?)
- Koşu uzadığında (20 dakikalık bir tur sırasında ne oluyor?)
- Sonradan bakıldığında (dün ne oldu, hangi kart kaç kez reddedildi?)

**İlk karar bu olmalı:** hangi durum için yapıyoruz. Üçü üç farklı ürün.

### Sonra: okuma kaynağı zaten var

Ekranın yeni durum tutmasına gerek yok, ve tutmamalı:

- `.skein/queue|active|gate|done/` — kartın nerede olduğu **dizinden** okunur
- `.skein/olaylar.jsonl` — ne olduğu; `card.settled` artık her turun sonucunu
  (kabul/ret/kapı, gerekçe, syncBack uyarıları) taşıyor
- Kartın kendi `history` dizisi — tam iz, gerekçeleriyle

Yani ekran saf bir **okuyucu** olabilir. Bu iyi bir kısıt; ihlal edilirse
durum iki yerde tutulmuş olur.

### Açık tasarım soruları

| Soru | Not |
|---|---|
| Terminal (TUI) mi, web mi? | Web bir süreç demek; şu an daemon yok, `watch` toplu koşuyor ve bitiyor |
| Canlı mı, yenilemeli mi? | Canlı izleme bir gözcü süreci ya da dosya yoklaması gerektirir |
| En değerli tek görünüm? | Muhtemelen kart × rol panosu, son gerekçeyle |
| `bench` ile paylaşılacak mı? | `src/events/summary.ts` deney okuyucusu; orkestratör onu kullanmıyor |

`ROADMAP.md` Aşama 5 ("Merkez ekranı") ilk taslağı içeriyor — ama
orkestratör yazılmadan önce yazılmıştı; okurken tarihini hesaba kat.

---

## Ne çalışıyor

```
npx tsx src/flow/cli.ts check daily        topolojiyi doğrular ve yazar
npx tsx src/card/cli.ts new|ls|show|…      kartı elle sürer
npx tsx src/watch/cli.ts daily --model …   orkestratör (toplu koşu)
npx tsx src/watch/cli.ts daily --serve …   gözcüyü açık bırak
```

**Bayrak verirken `npm run` kullanma** — bazı npm sürümleri `--` sonrasını
kendi seçeneği sanıp yutuyor, sessizce. `RUNNING.md`'de üç adımlık başlangıç
var.

| Parça | Dosya |
|---|---|
| Akış yükleyici — 16 kural, zincir sırası, topoloji hash'i | `src/flow/load.ts` |
| Maliyet tahmini — ret kenarları dahil | `src/flow/cost.ts` |
| Kart — geçmiş, ret sayaçları, gömülü topoloji | `src/card/card.ts` |
| Kuyruk — atomik geçiş, kilitsiz sahiplenme, çökme toplama | `src/card/queue.ts` |
| Gözcü — tur, verdikt, yönlendirme | `src/watch/tick.ts` |
| Uzun ömürlü gözcü — uyu/uyan, durdurma | `src/watch/serve.ts` |
| Canlı adımlar — `stream-json` → `agent.step` | `src/adapters/claude.ts` |
| Akan çıktıyı satıra bölme | `src/proc/lines.ts` |
| Tek yazıcı kilidi — bayat kilidi devralır | `src/watch/lock.ts` |
| Git katmanı — ileri birleştirme, syncBack, worktree, kirlilik | `src/watch/git.ts` |
| Olay günlüğü — `card.settled` dahil | `src/events/log.ts` |

Yazılmamış: **ekran**. Ve deneyin kendisi (aşağıya bak).

---

## 4 rollü akış ilk kez koşuldu — ve iki kusur çıkardı

`spec.yaml` (analyst → coder → reviewer → guard, kapı analyst sonrasında)
17 Eylül'de ilk kez gerçek ajanlarla koştu. Hepsi haiku (konteynerde codex
yok), belirsiz bir görev: *"toplam() büyük listelerde kayan nokta hatası
biriktiriyor, düzelt"*.

**Mekanizma tamamen çalıştı:** kapı durdu ve insan bıraktı, kod üç worktree
arasında taşındı, syncBack üç dala da ulaştı, testler yeşil bitti.
4 aktivasyon · 4 dk 20 sn · $0.42.

**Kusur 1 — maliyet tahmini 2.75 kat şişikti.** Model 11 aktivasyon diyordu,
gerçek 4. İki sebep: uygulanmayan audit turları sayılıyordu (`src/audit/gate.ts`
yalnızca bench'te; `src/watch/` onu hiç çağırmıyor) ve syncBack alıcıları
aktivasyon sanılıyordu (git birleştirmesi, ajan çağrısı değil). Düzeltildi;
`flow check` artık `audit.enabled: true` yazıp hiçbir şey yapmadığını da
söylüyor.

**Kusur 2 — belge üreten rolün çıktısı devirde kayboluyordu. ÇÖZÜLDÜ.**
`specifier.md` rolü dosya yazmayı açıkça yasaklıyor ("Kod, test ya da dosya
yazmak" sahiplenmediklerinde), `handoff` kabul özetini kartın geçmişine
YAZMIYOR, ve `buildTaskText` yalnızca **ret** gerekçesini ileri taşıyor.
Sonuç: analyst'in kabul kriterleri `.skein-verdict.json` içinde kalıyor ve
coder özgün belirsiz görevi alıyor. Koşuda coder Kahan toplamını kendi
buldu — yani kayıp maskelendi, ama analyst rolü kâğıt üstünde kaldı.

İkisi de yapıldı: (a) `specifier.md` artık spec'i `docs/spec/<kart-id>.md`'ye
yazıp commit'liyor; (b) `handoff` kabul özetini kartın devir kaydına yazıyor ve
`buildTaskText` onu sonraki role taşıyor. Canlı koşuda doğrulandı: `coder`
devir commit'ini görüp spec dosyasını kendi okudu. Ayrıntı `ARCHITECTURE.md`
"Belge üreten rolün çıktısı" kaydında.

**Kusur 3 — kaçırılan kapı: kaçış (escalate) sonrası `release forward`
kodu taşımıyor. AÇIK.** Normal kapıda kod devirden ÖNCE birleştiriliyor
(`handOverCode` → `handoff` → gate). Ama kirli ağaç gibi bir sebeple kart
kaçışla kapıya çıktığında birleştirme HİÇ koşmuyor; insan `release forward`
derse sonraki rol bayat bir worktree'de çalışır ve bunu kimse söylemez.
Seçenekler: kaçış kapısından ileri bırakmayı yasaklamak, bırakırken
birleştirmeyi tetiklemek, ya da turun başında gelen kodu doğrulamak.

---

## Üç canlı çapraz satıcı koşusu — ve çıkan örüntü

| # | Görev | Üretici | Denetçi | Sonuç |
|---|---|---|---|---|
| 1 | `backoff` (4 satır) | claude-opus-5 | codex gpt-5.5 | kabul, 2 dk 36 sn |
| 2 | token bucket | claude-haiku | claude-haiku | kabul |
| 3 | `card.settled` (Skein'in kendi backlog'u) | claude-opus-5 | codex gpt-5.5 | kabul |

**Üçünde de üretici kusur üretmedi.** Çapraz denetimin yakalayacağı bir şey
oluşmadı. Üçüncüsünde çıktı ayrıca insan-yönlendirmeli bir üçüncü gözden
geçti; iki küçük bulgu çıktı ama ikisi de ret sebebi değildi.

Örüntünün kendisi artık bulgu — ayrıntısı `PHILOSOPHY.md` açık soru #2'de.
Soru muhtemelen yeniden çerçevelenmeli: *"çapraz denetim daha çok yakalar
mı"* değil, *"bu güçteki modellerde denetim katmanı hangi görev sınıfında
karşılığını verir"*.

Kovalanmayı bekleyen aday görev sınıfları: belirsiz gereksinim, mevcut koda
derin dokunan değişiklik, eşzamanlılık.

---

## Kusurları ajanlar buldu, ben değil

Bu oturumun en şaşırtıcı sonucu. Ajanlar durup şunları söyledi:

- *"bana verilen kurallar Java/Maven için yazılmış ama bu depo TypeScript"* —
  `daily.yaml` java-kit'e işaret ediyordu ve o kit SwarmForge'un kabuk
  betiklerini çağırıyordu; Skein'de yok. Ajana **yapması imkânsız** şeyler
  söyleniyordu.
- *"git add için izin yok, o yüzden verdikt yazmıyorum"* — `acceptEdits`
  dosya yazdırır ama Bash'e izin vermez. Ajan işi yaptı, commit atamadı, ve
  "başardım" demeyi reddetti.

Üçüncüsünü ajan söylemedi ama yaptı: denetçi `.skein-verdict.json`'ı
commit'ledi. Kök sebep kart metnimdeydi — *"işini işle"* talimatını karta
yazmıştım ve **kart metni her role aynı gidiyor**. O talimat artık
`hub/prompts/roles/coder.md`'de, olması gereken yerde.

Ders: çekirdeğin kapıları (ÖLÇÜLEMEDİ, kirli ağaç, izlenen verdikt) ajanın
söylediğini **duyulur** hale getiriyor. Mekanizma çalışıyor, sadece
beklenen yerde değil.

---

## Elde olan ölçümler

### Açık Soru #1 — audit gate (`claude-opus-5`, `retry-backoff`, 9 kanca)

```
kapısız (n=5) : ortalama 0.80 kırmızı kanca  ·  $0.0743
kapılı  (n=3) : ortalama 0.00 kırmızı kanca  ·  $0.5361     (7.2x maliyet)
```

Sayıdan güçlü olan mekanizma izi: kusur her koşuda aynı — model `retry`'yi
`async` yazmıyor, `RangeError` senkron fırlıyor, oysa imza `Promise<T>`
taahhüt ediyor. Kapılı üç koşunun üçünde de `export async function retry`.

Sınırlar `bench/DESIGN.md`'de.

### Görev kalibrasyonu — hâlâ darboğaz

| Görev | opus-5 | sonnet-5 | haiku-4.5 |
|---|---|---|---|
| `retry-backoff` (9 kanca) | 5 koşuda 4'ü kusurlu | temiz | — |
| `token-bucket` (14 kanca) | 14/14 | 14/14 | 14/14 |

Orkestratördeki üç koşu da aynı duvarı gösteriyor.

---

## Okuma sırası

| Dosya | Ne için |
|---|---|
| `ARCHITECTURE.md` | **Genel yapı** — üç katman, uzun ömürlü çekirdek, DB kararı, değişmezler |
| `PHILOSOPHY.md` | İlkeler, reddedilenler, açık sorular (#2 güncel) |
| `hub/flows/SCHEMA.md` | Akış dili — 16 kural, ret yolu, kod taşıma, hash sözleşmesi |
| `RUNNING.md` | Kendi makinende koşturmak; Windows notları |
| `ROADMAP.md` | Aşama 5 = ekran (orkestratörden önce yazıldı, tarihini hesaba kat) |
| `bench/DESIGN.md` | 2×2 deney tasarımı ve sınırları |

---

## Not: ajanlar senin dalına commit atıyor

`main` workspace'i kullanıcının checkout'u olduğu için kaçınılmaz. Deney
koşuları ayrı dalda yapıldı (`deney/olay-gunlugu`) ve inceleme sonrası
birleştirildi. İleride orkestratörün kendi dalında koşması düşünülebilir —
ama bu, ekran tartışmasından sonra.
