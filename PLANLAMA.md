# Adım 6 — Planlamada ajanlar arası yazılı tur (TASARIM)

**Durum: 6a yazıldı ve canlı koşuda doğrulandı (18 Eylül); 6b-6d tasarım.**
Bu belge ne yapılacağını, hangi şekilde ve neden o şekilde yapılacağını
sabitliyor.

`ARCHITECTURE.md` "Sıra" tablosunun 6. maddesi. En sonda olmasının sebebi
`PHILOSOPHY.md`'de: serbest sohbet maliyeti sınırsız büyütür,
izlenebilirliği kaybeder ve modeller birbirine yakınsadıkça kör nokta
tezini zayıflatır. Bu tasarımın tamamı o üç riskin etrafından dolaşma
denemesidir.

---

## Neyi çözüyor

Bugün kart zincirde ilerler: her rol çalışır, bir verdikt verir, kabul
ederse ileri gider, reddederse geri döner. İki rolün **iş yapılmadan önce**
görüş alışverişi yaptığı bir an yok.

Kaldıraç tam orada: yanlış plan, kendisinden sonraki bütün turların
faturasını yanlış yere yazar. `spec` akışı bunu kısmen çözüyor — `analyst`
bir spec yazıyor, insan onaylıyor — ama bu tek taraflı: kimse spec'e
*itiraz* etmiyor.

Adım 6 şunu ekler: **plan, ilerlemeden önce en az iki rolün yazılı
turundan geçer.**

## Neyi çözmüyor

- Ajanların birbirine serbestçe yazması. Bu bir sohbet kanalı değil.
- Kararı ajana devretmek. Anlaşma çıkmazsa karar insana gider.
- Kodun tartışılması. Planlama rolleri kod yazmaz, `src/` altına dokunmaz.
- Downstream'in planı yeniden açması (aşağıda "planın çürümesi").

---

## Mekanizmanın şekli: `reject`'in kardeşi

Ret mekanizması zaten bu ailenin bir üyesi: sayılı (limit), gerekçeli
(reason), kayıtlı (kart geçmişi) ve tükendiğinde insana çıkan. Planlama
turu aynı iskeleti kullanır.

### Alışverişin taşıyıcısı bir dosya, sohbet değil

```
docs/plan/<kart-id>.md            planın kendisi (git'te, commit'li)
docs/plan/<kart-id>.itiraz.md     numaralı itirazlar ve cevapları
```

Transkript diye ayrı bir şey yok: **transkript dosyanın kendisi.** Bunun
üç sonucu var ve üçü de kasıtlı:

1. Sonradan okunabilir (git geçmişi + `git show`).
2. Ajanın kafasında durum kalmaz (PHILOSOPHY 1).
3. Bir sonraki tur, "önceki mesajları hatırla" değil "dosyayı oku"dur —
   yani bağlam penceresi değil, depo taşır.

### İtirazın zorunlu şekli

Serbest yorum kabul edilmez. Her itiraz üç alan taşır:

```markdown
## İtiraz 3 — analyst
**Ne:** Plan, `Store.undo()`'yu geçmişi baştan oynatarak kuruyor.
**Neden:** `src/selector.ts` türetilmiş hesapları `version`a göre
önbellekliyor; baştan oynatma sürümü geriye düşürür.
**Neyi yanlışlar:** `selector.ts:12` — aynı sürüm için önbellek tazelenmez.
**Durum:** açık
```

`Neyi yanlışlar` alanı **depodan bir yere işaret etmek zorunda**: bir
dosya, bir satır, bir test adı. Yolu var olmayan itiraz geçersiz sayılır
ve açık itiraz listesine girmez.

> Bu kural bugünkü ölçümden geliyor. `snapshot-store`'da eşik "daha iyi kod
> yazmak" değil, **değiştirdiği modülün tüketicisini okumak** çıktı: haiku
> ve sonnet `selector.ts`'i hiç açmadan doğru görünen bir `undo` yazdı,
> opus açıp tuzağı adıyla söyledi. İtirazı depoya bağlamak, mekanizmayı tam
> o davranışa zorluyor. Genel öğüt ("sınır durumlarına dikkat") makineyle
> elenir.

### Karşı tarafın üç cevabı

Her açık itiraza, bir sonraki turda üç cevaptan biri verilir:

| Cevap | Anlamı | Sonucu |
|---|---|---|
| `kabul` | Haklısın | Planı düzenler, itiraz kapanır |
| `ret` | Katılmıyorum, çünkü… | İtiraz açık kalır, gerekçe yazılır |
| `insana` | Bu bir değer kararı | Alışveriş biter, kapıya çıkar |

Cevapsız bırakılan itiraz `ret` sayılmaz — **açık** sayılır. Sessizlik
anlaşma değildir.

### Tur 1 kör, sonrası açık

> **Yazıldı (6e).** Körleme bir talimat değil taşıma kuralı: körlü turda
> her itirazcının ağacı yazarın ağacından besleniyor, turun sonunda hepsi
> yazara katılıyor. Ayrıntısı ve bedeli 6e bölümünde.

Birinci turda katılımcılar birbirinin itirazlarını **görmez**: herkes planı
okur ve kendi itirazlarını yazar. İkinci turdan itibaren dosyanın tamamı
açıktır.

Gerekçe deneyin kendisinden: 2x2 kurgusunda aynı artefaktı iki denetçiye
**bağımsız** verdiğimiz için farkı kodun kendisi açıklayamıyor. Aynı
mantık burada da geçerli — ilk görüşler bağımsız olmazsa, ikinci
katılımcının itirazı birincinin çerçevesinin içinde kalır ve "çeşitlilik"
ölçülemez hale gelir. Yakınsama sonraki turlarda zaten serbest; korunan
şey **ilk bağımsız görüş**.

---

## Sonlanma ve çıkış

Üç çıkış var ve üçü de mevcut makineyi kullanır — **yeni kart durumu
eklenmiyor**:

| Çıkış | Koşul | Kartın gittiği yer |
|---|---|---|
| `anlasma` | Açık itiraz kalmadı | Zincirde bir sonraki rol |
| `tukendi` | Tur limiti doldu, açık itiraz var | Kapı, `gate.kind: "deadlock"` |
| `kacis` | Katılımcının turu hiç tamamlanmadı | Kapı, `gate.kind: "escalation"` |

İki sonlanma koşulu birlikte çalışır:

- **Sert tavan:** `planlama.tur` (en fazla 5).
- **Doğal son:** bir tur **hiç yeni itiraz eklemediyse** alışveriş biter.
  Bu, denetim kapısındaki "parmak izi değişmedi" kuralının kardeşi.

Anlaşma sağlandığında planın hash'i karta yazılır (`plan.hash`), topoloji
hash'i gibi. Sonraki roller planı görev metninde yolu verilmiş bir dosya
olarak alır — devir özeti mekanizması zaten var.

### Planın çürümesi — ve neden yeniden açılmıyor

Zincirin ilerisindeki bir rol "plan yanlışmış" diyebilir. Cazip olan, kartı
planlamaya geri döndürmek; **yapılmıyor.** Sebep maliyet değil, sonlanma:
plan → kod → ret → plan döngüsünün üst sınırı yok ve `reject.limit` onu
saymıyor. Karar: planı yalnızca **insan** yeniden açar (kapıdan `retry`).
Ajan, planın çürüdüğünü söyleyebilir; kararı veremez.

---

## Akış dili eklemeleri

```yaml
planlama:
  katilimcilar: [analyst, architect]   # en az 2, hepsi tanımlı rol
  tur: 2                               # üst sınır; 1..5
  ilk-tur-kor: true                    # varsayılan true
  plan: docs/plan/{kart}.md            # yol; `src/` altı yasak
```

Yükleyiciye dört kural eklenir (o gün 16 vardı, bunlar 17-20; 6b bir de
21'i ekledi):

| # | Kural | Neden |
|---|---|---|
| 17 | `katilimcilar` tekrarsız, hepsi tanımlı rol | Var olmayan role plan yazdırılamaz |
| 18 | `tur` 1..5; `ilk-tur-kor` mantıksal (varsayılan açık) | Maliyet tavanı dilin içinde olmalı, promptun değil |
| 19 | Katılımcılar, kod yazan her rolden **önce** gelmeli | Plan, iş yapıldıktan sonra tartışılmaz |
| 20 | `plan` yolu `src/` altında olamaz | Plan belge; kod taşıma yolu git, dosya değil |
| 21 | `gates[].after` katılımcıya işaret edemez | Alışveriş kapı kontrolünden geçmiyor; o kapı hiç ateşlenmez |

Kural numaraları kullanıcıya aynen gösterilir; bugünkü davranış böyle.

---

## Durum nerede duruyor

Değişmezlere uyum, satır satır:

| Ne | Nerede | Neden orada |
|---|---|---|
| Plan metni ve itirazlar | Depoda, commit'li | İçerik; git zaten sürüm ve diff demek |
| Hangi itiraz kabul/ret | Kart geçmişi (`HistoryEntry`) | Karar; kartın izinden okunmalı |
| Tur sayısı, yeni itiraz sayısı | Olay günlüğü | Gözlem; kartlar arası soru |
| Anlaşılan planın hash'i | Kartın kendisi | Dondurma; topoloji hash'inin kardeşi |

İki yeni olay tipi — `EventInput` birliğine ve `REQUIRED` haritasına
**birlikte** girer (değişmez 3):

```ts
| { type: "plan.round"; card: string; role: string; round: number;
    blind: boolean; newObjections: number; openObjections: number }
| { type: "plan.settled"; card: string; outcome: "anlasma" | "tukendi" | "kacis";
    rounds: number; objections: number; accepted: number; planHash: string }
```

İtiraz başına olay **yazılmaz**: metin dosyada, sayı günlükte. Günlüğün dar
kalması kasıtlı.

---

## Maliyet

Bir kart için planlama maliyeti:

```
aktivasyon = katilimci_sayisi × gerçekleşen_tur
en kötü   = katilimci_sayisi × planlama.tur
```

İki katılımcı, iki tur → 4 aktivasyon. Bugünkü `spec` akışı 4 aktivasyon
ediyor; yani planlama, tipik bir kartın maliyetini **iki katına yakın**
çıkarır. `flow check` bunu koşmadan önce basmalı (maliyet modeli
`src/flow/cost.ts`'te var, formül oraya eklenir).

Bu, mekanizmanın karşılığını vermesi gereken çıtayı da belirliyor:
**planlama, en az bir turluk downstream israfını önlemeli.** Ölçülmesi
aşağıda.

---

## Ekranda ne görünür

Kart planlama aşamasındayken pano kartı şunları gösterir:

- tur `n/limit`, katılımcılar, **açık itiraz sayısı**
- tur 1 ise "kör" işareti
- plan dosyasının o turdaki diff'i (`git show --numstat`; ekran bunu zaten
  yapıyor)

Kapıya çıkmış bir alışverişte insan, açık itirazları ve gerekçelerini
görür; kararı `retry` (plan yeniden açılır) ya da `forward` (plan olduğu
gibi kabul, kart ilerler).

---

## Başarısızlık kipleri ve her birine verilen cevap

| Kip | Belirtisi | Tasarım cevabı |
|---|---|---|
| **Nezaket çöküşü** | Karşı taraf her şeye "haklısın" der | `kabul` planı **düzenlemek** zorunda; düzenleme yoksa kabul sayılmaz (dosya hash'i değişmeli) |
| **Boş tur** | Hiç itiraz gelmez | Alışveriş `itirazsiz` diye kaydedilir ve **sayılır**; oranı yüksekse mekanizma törendir (audit gate'in `changedRounds`'unun kardeşi) |
| **Ping-pong** | Aynı itiraz yeniden yazılır | Yeni itiraz sayısı sıfır olan tur alışverişi bitirir |
| **Genel öğüt** | "Hata yönetimine dikkat" | İtiraz depodan bir yere işaret etmek zorunda; yol yoksa itiraz geçersiz |
| **Plan/kod ayrışması** | Plan yazılır, kimse commit'lemez | Kısıt rol promptunun **en başında**: planı yaz ve commit'le (bu ders `specifier.md`'de zaten öğrenildi) |
| **Sonsuz döngü** | Plan ↔ kod arasında gidip gelme | Planı yalnızca insan yeniden açar |
| **Bağlam şişmesi** | Dosya büyür, her tur daha pahalı | Açık itirazlar dosyanın başında; kapanmışlar alt bölümde ve turlara verilmez |

---

## Nasıl bileceğiz işe yaradığını

Mekanizmayı yazmak, işe yaradığını göstermez. Ölçüt **sonuçtan önce**
yazılıyor; bench'in karar kuralıyla aynı biçimde:

**Kurgu:** aynı görev seti, planlama **açık** ve **kapalı** iki kol, k≥3.
Ölçüm grubu = görev × model kurgusu (bench'teki gruplama kuralı burada da
geçerli).

| Metrik | Ne söyler | Eşik (önceden ilan) |
|---|---|---|
| **Downstream ret sayısı** | Plan, aşağıdaki israfı önledi mi | ≥%20 göreli azalma olumlu, <%10 olumsuz |
| **Kırmızı kanca** (bench görevlerinde) | Ürün gerçekten daha doğru mu | Aynı eşik |
| **Kabul edilen itiraz oranı** | İtirazlar bilgi taşıyor mu | <%20 ise mekanizma gürültü |
| **İtirazsız alışveriş oranı** | Tören mi | >%50 ise mekanizma tören |
| **Aktivasyon farkı** | Bedeli | Kayıt; eşiksiz |

**Dürüst sınır, baştan yazılı:** katılımcılar aynı satıcıdansa bu ölçüm
"ikinci bir planlama görüşü"nün değerini ölçer, **çeşitliliğin** değil —
audit gate ölçümünde öğrenilen ayrımın aynısı. Çeşitlilik iddiası için
katılımcılar farklı satıcı olmalı.

---

## Reddedilen alternatifler

**Serbest sohbet kanalı.** Sınırsız maliyet, kaybolan izlenebilirlik ve
"kim neye karar verdi" sorusunun cevapsız kalması. Ayrıca sohbet, durumu
ajanın bağlam penceresine taşır — PHILOSOPHY 1'in doğrudan ihlali.

**Paylaşılan çalışma belleği (scratchpad).** Aynı sorun, daha sessiz
biçimi: iki ajan aynı tampona yazar, kimin ne dediği kaybolur.

**Oylama / çoğunluk.** Üç ajanın ikisi aynı fikirdeyse doğru sayılması,
kör noktanın tanımıyla çelişir: kör nokta **ortak** olabilir. Çoğunluk,
ortak kör noktayı oy birliğiyle onaylar.

**Tek turluk "ikinci görüş".** Ucuz ama itiraza cevap yok; bugünkü `spec`
akışının insan onayıyla zaten yaptığı şeyin ajanlı kopyası olurdu.

**Ajanlar arası doğrudan mesajlaşma (MCP/kanal).** Taşıyıcı olarak cazip,
ama durumu depodan çıkarır ve alışverişi yeniden üretilemez kılar. Dosya
yavaş görünür; yeniden üretilebilir olması o yavaşlığa değer.

---

## Aşamalı yol

Her aşamanın bitiş testi var; testi geçmeden sonrakine geçilmez.

**6a — Plan dosyası (alışveriş yok). ✅ YAZILDI.** Tek rol plan yazar ve
commit'ler; sonraki roller yolu görev metninde alır.

Bitiş testi geçildi: `hub/flows/plan.yaml` (planner → coder → reviewer)
gerçek ajanlarla koştu (`claude-sonnet-5`). `planner`
`docs/plan/c-20260918-4abcb2.md` dosyasını yazıp commit'ledi; `coder`
devir özetinde plana atıf yaptı ("model.ts tam hash taşır" — planın
koyduğu sözleşme); `reviewer` işi **plana karşı** denetledi ("testler
planın izin verdiği stile uygun", "kapsam dışı alanlar"). Yani plan yalnızca
bir sonraki role bilgi taşımadı, denetimin ölçütü de oldu — tasarımda
beklenmeyen bir yan etki.

Yazılanlar: akış dilinde `planlama` bloğu + kural 17-20, plan politikasının
topoloji hash'ine ve kart anlık görüntüsüne girmesi, iş metninin iki yüzü
(yazan role zorunlu çıktı, okuyan role "önce oku"), **plan kapısı**
(`tick`: planı yazan rol kabul dediğinde dosya diskte aranır; yoksa ya da
boşsa devir teslim olmaz, kart insana çıkar), kartta donan `plan.hash`,
`plan.settled` olayı ve `planner.md` rol promptu.

Koşuda öğrenilen iki şey belgeye değil koda yazıldı:

- **İzin modu ile git.** `acceptEdits` dosya yazdırır ama `git add`
  yaptırmaz; planı yazan ajan dosyayı yazdı, commit atamadı ve doğru
  davranıp "yapamadım" dedi. Orkestratörü canlı koşarken
  `--allow-tool "Bash(git:*)"` gerekiyor.
- **`.worktrees/` vitest'e giriyordu.** Orkestratör her rol için deponun
  bir worktree'sini açıyor; kökten koşan vitest oradaki kopyaları da
  topluyor ve canlı koşudan sonra `npm test` 16 uydurma kırmızı veriyordu.
  Yapılandırmaya dışlama eklendi.

**6b — İki katılımcı, tek tur. ✅ YAZILDI.** İkinci rol itirazlarını yazar,
birincisi cevaplar, alışveriş biter.

Yazılanlar:

- **İtiraz dosyası ve makine okuyucusu** (`src/plan/itiraz.ts`). Dört alan
  sabit; eksik alanlı itiraz `geçersiz` sayılır ve **hiçbir yöne**
  sayılmaz — ne açık itiraz diye planı durdurur, ne reddedilmiş sayılır.
- **Kanıt denetimi.** `Neyi yanlışlar` alanındaki yol depoda aranıyor;
  yoksa itiraz sayılmıyor. Tasarımın en keskin kuralı kodda: "sınır
  durumlarına dikkat" diyen bir itiraz hiçbir dosyaya işaret edemez.
- **Tur makinesi** (`src/plan/phase.ts`). Hangi turda olunduğu **kartın
  geçmişinden** okunuyor, bellekte tutulan bir durumdan değil: gözcü çökse
  de kart nerede kaldığını kendi taşır.
- **Üç kapı.** İtiraz dosyası yoksa tur kabul edilmez (sessizlik anlaşma
  değil); kabul edilen itiraz planı değiştirmemişse tur kabul edilmez
  (nezaket çöküşü); açık kalan ya da `insana` denen itiraz **kilit
  kapısına** çıkar — kaçış değil, çünkü tur tamamlandı ve kod yerinde.
- **Kartın zincirden ayrı dolaşması.** Alışveriş sırasında kart
  katılımcılar arasında gidip geliyor (`queue.planTurn`); zincirin `next`i
  ancak alışveriş kapandığında devreye giriyor. Kod da her adımda hedefin
  ağacına taşınıyor.
- **Maliyet modeli** alışverişi sayıyor: `flow check` artık "5 aktivasyon,
  1'i planlama alışverişi" diyor.

Kural değişiklikleri: `katilimcilar` iki olabiliyor, `tur: 1` kabul
ediliyor. (6c bu iki sınırı da kaldırdı; `ilk-tur-kor` hâlâ reddediliyor —
aşağıda.)

**İki canlı koşu (18 Eylül, `claude-sonnet-5`, `plan2.yaml`):** ikisinde de
`planner` planı yazıp commit'ledi, `architect` itiraz turunu koştu,
alışveriş kapandı, `coder` ve `reviewer` işi bitirdi. Mekanizma uçtan uca
çalıştı.

**Ama bitiş testi ikisinde de geçilmedi — ve bu artık bir bulgu.**
Tasarımın istediği "en az bir itiraz `kabul` ile kapansın" olmadı:
**2/2 alışveriş sıfır itirazla kapandı.** İkisinde de itiraz eden rol planın
her iddiasını depodaki kodla dosya:satır atıflarıyla karşılaştırdı ve
uydurma itiraz eklemeyi açıkça reddetti. İkincisinde planın bir satır
aralığı kaymasını (71-87 yerine 77-93) bile fark etti ve **itiraz açmama
kararını gerekçelendirdi** — kararı etkilemeyen bir kaynak göstergesi
olduğu için.

Bu sayı tasarımın kendi ölçütünü ("itirazsız alışveriş oranı >%50 ise
mekanizma tören") kırmızı yakıyor. Ama iki dosyada da ortada **sessizlik
değil kanıtlı doğrulama** var; ayrımı görünür kılan şey, ilk koşudan sonra
`plan-itiraz.md`'ye eklenen "itirazın yoksa neyi kontrol ettiğini listele"
maddesi. Yani bugünkü dürüst okuma şu: **mekanizma ikinci bir çift göz
üretiyor, itiraz üretmiyor.** İkisinin aynı şey olup olmadığı, ölçümün
(6d) cevaplayacağı soru.

`kabul`, `ret`, `insana` ve kilit kapısı yolları testlerle kapalı
(`src/watch/exchange.test.ts`), canlı koşuyla değil.

**İkinci koşu ayrıca denetim katmanının sınırını gösterdi:** `coder`
ekranın gömülü betiğine ters tırnak içeren bir yorum yazdı — o betik dış
dosyada bir şablon dizesinin içinde durduğu için **dosya derlenmez oldu**.
Ne kodu yazan ne denetleyen rol derleyiciyi koşturabildiği (sandbox'ta
onay yüzeyi yok) için ikisi de "elle doğruladım" deyip geçti. Kusuru
birleştirmeden sonra derleyici bir saniyede buldu. "ÖLÇÜLEMEDİ ≠ temiz"
dersinin akış tarafındaki karşılığı: **doğrulama koşturulamıyorsa denetim
turu bir kanaat turudur.**

Koşunun kendisi iki kusur çıkardı, ikisi de düzeltildi:

- **"İtiraz yok" ile "itirazların hiçbiri sayılmadı" tek sayıya eriyordu.**
  Geçersiz itirazlar artık ayrı sayılıyor (`invalid`) ve günlüğe,
  kart izine, gözcü satırına düşüyor. Ayrım şart: ilki anlaşma, ikincisi
  ya biçimi öğrenmemiş bir rol ya da genel öğüt üreten bir mekanizma.
- **Alışveriş kartın kendi izinde görünmüyordu:** `card show` `plan`
  kaydını sessizce atlıyordu. Bunu itiraz eden rol kendi raporunda tespit
  etti ("`printCard`'ın switch'i … `plan` yok — sessizce atlanıyor").

**Körleme bugün atıl, ve bu dürüstçe yazılı:** iki katılımcıda itiraz eden
tek rol var, yani kimsenin görmeyeceği bir itiraz yok. Körleme üç ve
fazlasında anlam kazanıyor; o yüzden varsayılan `true` duruyor ama
kapatılması reddediliyor — "kapatılmış sanılan körleme" diye bir şey
olmasın.

**6c — Çok tur + sayaçlar + kapı. YAZILDI.** Aşağıda.

**6e — Körleme (taşıma değişikliği). YAZILDI.** Aşağıda.

**6d — Ölçüm koşum takımı. YAZILDI.** `src/bench/ab.ts` +
`src/bench/planeffect.ts` + `cli.ts planab|planrapor`. Aşağıda.

Dokunacağı yerler: `src/flow/load.ts` (kural 17-20), `src/flow/cost.ts`
(formül), `src/card/card.ts` (geçmiş kaydı + `plan.hash`),
`src/watch/tick.ts` (planlama aşaması), yeni `src/plan/exchange.ts`,
`hub/prompts/planlama/*.md`, `src/ui/model.ts` (pano alanları),
`src/events/log.ts` (iki olay). Kaba büyüklük: 600-800 satır ürün kodu ve
bir o kadar test.

---

## 6c — Çok tur, çok katılımcı, sayaç ve kilit (YAZILDI)

Kaldırılan iki sınır: `tur` artık 1..5, `katilimcilar` üç ve fazlası
olabiliyor. Örnek akış `hub/flows/plan3.yaml` (üç katılımcı, iki tur).

### Turun şekli: sıra makinesi kartın geçmişinden okunuyor

Bir tur = bütün itirazcılar, zincir sırasında birer birer, sonra yazarın
yanıtı. Sıranın kimde olduğu ayrı bir alanda **tutulmuyor**; son plan
kaydının rolüne bakılıp hesaplanıyor (`src/plan/phase.ts`). Sebep
PHILOSOPHY 1'in doğrudan sonucu: bir "sıra" alanı, kartla senkron kalmak
zorunda olan ikinci bir gerçek olurdu ve gözcü çökerse ikisi ayrışırdı.

Turun **ortasında** sonlanma kararı verilmiyor. İlk itirazcı sessiz
kalabilir; turun sessiz olup olmadığı ancak son itirazcı konuştuktan sonra
bilinir. İlk hâli buna bakıyordu ve tek bir sessiz itirazcı bütün turu
kapatıyordu.

### Sayaç: birikimli dosya, turun kendi katkısı

İtiraz dosyası birikimli — transkript o. Ama sonlanma kuralı turun **kendi
katkısını** sormak zorunda, yoksa her tur "üç itiraz var" diye kendini
haklı çıkarır. Taban her turun başında kartın geçmişinden okunuyor
(`objectionBaseline`) ve `yeni = toplam − taban`. Ekran da ikisini ayrı
basıyor: `tur 2, 3 itiraz (bu turda +1)`.

### Üç çıkış, üçü de mevcut makineyle

| Çıkış | Koşul | Kartın gittiği yer |
|---|---|---|
| `anlasma` | Açık itiraz kalmadı, ya da tur hiç yeni itiraz eklemedi | Alışverişten sonraki rol |
| `tukendi` | Tavan doldu **ya da** tur yeni itiraz eklemedi — ama açık itiraz var | Kapı, `gate.kind: deadlock` |
| `insana` | Bir itiraz değer kararı diye insana çıktı | Kapı, `gate.kind: deadlock` |

**Doğal son yazarın turunu atlıyor:** son itirazcı yeni bir şey eklemediyse
ve açık itiraz yoksa alışveriş orada kapanıyor. Yanıtlanacak bir şey
olmadığı hâlde yazarı uyandırmak, bedeli olan bir nezaket.

`insana` çıkışı `plan.settled`'a kendi adıyla düşüyor. Önceden `kacis`e ya
da `tukendi`ye sıkıştırılacaktı; ikisi de yanlış olurdu — biri turun hiç
tamamlanmamasını, öteki tavanın dolmasını anlatıyor.

### Kilitten çıkış: planı yalnızca insan yeniden açar

Tasarımın kuralı buydu; makine karşılığı da kartın geçmişinden okunuyor.
Son plan kaydından sonra bir kapı ve bir `released` kaydı varsa, insanın
kartı verdiği rol **aynı turu** yeniden koşuyor. Sıra ilerlemiyor: insanın
"bunu düzelt" dediği turu atlamak olurdu.

`forward` ise alışverişi yeniden açmıyor — kart alışverişten sonraki role
gidiyor, yani "planı olduğu gibi kabul ediyorum" kararı bir tur daha para
harcamıyor.

**Ve burada kendi işime saldırgan bakınca ikinci bir kusur çıktı.** İlk
hâl "son plan kaydından sonraki İLK kapı + bırakma" diye tarıyordu. O
tarama, zincirin **ilerisinden** gelen bir kararı da yeniden açma sayıyor:
`coder` kaçış kapısına çıkar, insan `back` der, hedef ret hedefi — yani
sıklıkla planı yazan rol. O kart planlama için dönmüyor, kodla ilgili bir
sebepten dönüyor; yeniden açılmış sayılsaydı yazara "itirazları yanıtla"
turu verilirdi. Kapı artık plan kaydının **hemen ardından** gelmek zorunda
(`deadlock` ikisini yan yana yazıyor, `release` de kararı kapının hemen
üstüne koyuyor). Kusur bir regresyon testiyle kapatıldı ve eski gevşek
tarama geri konarak testin gerçekten tuttuğu doğrulandı.

Bu yolda bir kusur daha düzeltildi: `planGateEntry` yalnızca `cevap` kaydına
bakıyordu, oysa 6c'de kilit **itirazcının** turunda da doğabiliyor (tur
yeni itiraz eklemedi, açık itiraz kaldı). O kilidi tanımayan bir okuyucu
`forward`u zincirdeki ardıla, yani itiraz eden role gönderirdi — tam olarak
bu fonksiyonun önlemek için var olduğu hata.

### Körleme 6c'de yapılmadı — gerekçesi 6e'yi doğurdu

6b'de `ilk-tur-kor: false` reddediliyordu, gerekçe "iki katılımcıda etkisi
yok, anlam kazandığı yer 6c". 6c üç katılımcıyı açtı ve gerekçe **düştü**;
yerine daha keskin bir gerçek geldi: **kod taşıma ileri birleştirme**, yani
ikinci itirazcının ağacı birincinin itiraz dosyasını alıyor. Körleme
talimatla sağlanamaz (dosya orada); taşımanın şeklini değiştirmek gerekiyor.

6c bu yüzden alanı iki değerle de reddetti ve işi **6e**'ye ayırdı. Aşağıda.

### Maliyet

`flow check` çok turu sayıyor: `plan3.yaml` için "~9 aktivasyon/kart, 4'ü
planlama alışverişi". Tahmin **en kötü hâl** — doğal son son turu yazar
turuna varmadan kapatırsa 8'e düşer. Yön kasıtlı: maliyeti eksik göstermek,
operatörü hazırlıksız yakalayan taraf.

`plan3` (9 aktivasyon) `plan2`nin (5) neredeyse iki katı. 6d ölçümünün
cevaplayacağı soru tam olarak bunun değip değmediği.

### Neyle doğrulandı

27 yeni test: `src/plan/phase.test.ts` (15, saf sıra makinesi — diske hiç
dokunmuyor), `src/watch/exchange3.test.ts` (12, üç katılımcı ve iki turla
uçtan uca `tick`). Toplam 664 test yeşil.

Sıra makinesinin gerçekten sınandığı **mutasyonla** doğrulandı: tabanı hep
0 döndürünce 5 test, turun ortasındaki devri kapatınca 8 test, tavan
kontrolünü kaldırınca 2 test kırmızı oldu.

**Canlı koşuldu** (30 Eylül, `plan3.yaml` × `claude-sonnet-5`): turun
sırası, tur sayacı ve doğal son uçtan uca çalıştı. Ayrıntısı 6e
bölümünde — iki aşama tek koşuda doğrulandı. Kilit ve `retry` yolları
testlerle kapalı, canlı koşuyla değil: o koşu için planın kusurlu olması
gerekiyor ve bu koşuda plan doğruydu.

---

## 6e — Körleme: taşıma katmanında (YAZILDI)

6c'nin bıraktığı iş. Sorun şuydu: körleme bir **talimat** olarak
yazılamaz. "Ötekinin itirazını okuma" diyen bir prompt, dosya ajanın
ağacındayken hiçbir şey garanti etmez — ve okumadığını hiçbir yerden
doğrulayamayız. Körleme ancak dosyanın **o ağaçta hiç bulunmaması** ile
sağlanır. Yani körleme taşıma katmanının işi.

### Fan-out / fan-in

Açık turda taşıma zincir boyunca ileri: her rol kendinden öncekinin
ağacını alır.

Körlü turda iki değişiklik:

- **Fan-out.** Kart itirazcıdan itirazcıya geçerken hedef ağaç, önceki
  itirazcının ağacından değil **yazarın** ağacından besleniyor. İkinci
  itirazcının ağacında planın kendisi var, birincinin itiraz dosyası yok.
- **Fan-in.** Turun son itirazcısı bitirdiğinde bütün itirazcıların
  ağaçları sırayla yazarın ağacına katılıyor. Yazar turun tamamını görür.

Kodda tek yer: `handOverCode` artık bir **kaynak rol listesi** alıyor.
Körlü turda liste `[yazar]` (dallanma), turun sonunda `itirazcilar`
(toplama). Geri kalan her yerde liste tek elemanlı ve davranış aynı.

### Zorunlu yan sonuç: itirazcı başına dosya

Fan-in N ağacı tek ağaca katıyor. Hepsi **aynı yolu** yazsaydı her
birleşme çakışırdı — yani ortak tek transkript, körlemeyle birlikte
yaşayamaz. Bu yüzden `itiraz` yolu artık `{rol}` içeriyor:

```
docs/plan/<kart>.itiraz.architect.md
docs/plan/<kart>.itiraz.analyst.md
```

Numaralar dosyalar arasında çakışabilir ve bu **sorun değil**: kimlik
(dosya sahibi, numara) çifti. Tekilleştirme yapılmıyor — yapılsaydı iki
rolün "İtiraz 1"i tek itiraza erir ve sayaç düşerdi.

Dosyanın sahibi aynı zamanda rolün **yer gerçeği**: ayrıştırıcıya `owner`
veriliyor ve başlıkta yazan ad ne olursa olsun itiraz dosya sahibine
sayılıyor. Ajan adı yanlış yazarsa itiraz başka bir role sayılırdı.

Beklenmedik ama hoş bir yan fayda: 6c'de prompta yazdığım "ortak dosyayı
ezme" tuzağı **tamamen kalktı**. İki rol artık aynı dosyaya yazamaz.

### Körlü turda sonlanma kararı yazarda

6c'nin sonlanma kuralı "turun son itirazcısı yeni itiraz eklenmediğini
görürse alışveriş biter" diyordu. Körlemeyle bu kural **tehlikeli** hale
geliyor: son itirazcı kendi dosyasından başkasını görmüyor, yani "yeni
itiraz yok" ve "açık itiraz yok" derken ötekinin itirazını hiç
saymıyor. O kararı vermesine izin verilse, birinci itirazcının itirazı
sessizce çöpe giderdi.

Bu yüzden körlü tur **her zaman** yazarın turuyla bitiyor. Doğal sonlanma
kuralı da yazarın turuna taşındı: tur hiç yeni itiraz eklemediyse ve açık
itiraz yoksa yazar alışverişi orada kapatıyor. Açık turda yazara ancak yeni
itiraz varken gelindiği için o dal orada ateşlenmiyor — tek kural, iki
taşıma.

Bedeli açık: körlü turda itirazsız bir tur bile yazarın bir aktivasyonunu
harcıyor. Alternatifi itiraz kaybetmek olduğu için bu bedel ödeniyor.

### Kaybolan dosya sessizce "itiraz yok" sayılmaz

Fan-in'den sonra yazarın ağacında **her** itirazcının dosyası olmak
zorunda. Biri yoksa taşıma bozulmuştur ve tur reddediliyor
(`\`analyst\` rolünün itiraz dosyası \`planner\` ağacına ulaşmadı`).

Bu kontrol körlemenin en pahalı kusurunu kapatıyor: eksik dosyayı "o rol
itiraz yazmamış" diye okuyan bir mekanizma, taşıma her bozulduğunda
itirazı yutar ve bunu hiçbir yere yazmaz.

### Atıl körleme `true` yazılmıyor

Tek itirazcıda körlemenin etkisi yok — kimsenin görmeyeceği bir itiraz yok.
Alan kabul ediliyor (varsayılanı reddetmek saçma olurdu) ama `plan.round`
olayı `blind: false` yazıyor ve `flow check` "ilk tur açık — körleme tek
itirazcıda atıl" diyor. Kural aynı: çalışmayan bir şey çalışıyor
görünmemeli.

### Yol açtığı kusur: topoloji damgası yalan söylüyordu

6e'nin testlerinden biri "körleme ayarı hash'i değiştirir" diyordu ve
**kırmızı çıktı**. Sebep ilk bakışta 6e değil: plan politikasının hash'e
giren parçası yalnızca `katilimcilar` ve `plan` yoluydu. Yani `tur`
da hash'in dışındaydı — ve bu **6c'nin bıraktığı bir delik**, çünkü 6c
tavanı 1..5 yaptı. O noktadan sonra yalnızca `tur`da ayrışan iki akış aynı
damgayı üretiyordu; damga, davranışı belirleyen bir kararı gizliyordu.
İkisi de hash'e eklendi, mutasyonla iki testin de tuttuğu doğrulandı.

### Neyle doğrulandı

`src/watch/exchange3.test.ts` yeniden yazıldı: 19 test, körlü ve açık
taşımanın ikisi de. Kritik nokta test koşumunda: sahte `mergeForward`
artık **gerçekten kopyalıyor** (kaynak ağacın dosyalarını hedefe taşıyor).
Dosyaları her ağaca elle yazan eski koşum, taşımanın ne yaptığını hiç
sormamış olurdu — yani körlemeyi sınayamazdı.

Bitiş testinin iki yarısı da yeşil: ikinci itirazcının ağacında birincinin
dosyası **yok**, ve turun sonunda yazarın ağacında **ikisi de var**.
Mutasyonla doğrulandı: fan-out'u kaldırınca 2 test, fan-in'i kaldırınca 4
test, körlü turda kararı son itirazcıya bırakınca 5 test kırmızıya döndü.

### Canlı koşu: körleme uçtan uca doğrulandı

30 Eylül, `plan3.yaml` × `claude-sonnet-5`, kum havuzu deposunda
(`snapshot-store` tohumu), **6 aktivasyon · $1.98**.

Bitiş testinin iki yarısı da canlıda geçti:

- **Fan-out.** `architect` itiraz dosyasını yazıp commit'ledikten sonra kart
  `analyst`e geçti ve `analyst`in ağacında `...itiraz.architect.md` **yoktu**.
  Git geçmişi kanıtı taşıyor: o ağaçtaki son commit yazarın plan commit'i
  (`plan: Store.undo() için tasarım kararı…`), architect'in commit'i değil.
- **Fan-in.** `analyst` bitirdiğinde yazarın ağacında **iki dosya da** vardı.

Üç `plan.round` olayının üçünde de `blind: true`. Kart izi sırayı doğruluyor:
`planner planı yazdı → architect itiraz turu → analyst itiraz turu →
planner itirazları yanıtladı`.

**Doğal son çalıştı ve parayı gerçekten kurtardı.** Tavan 2 tur ama
alışveriş tur 1'de kapandı: `tur: 2` ile en kötü hâl 9 aktivasyondu, koşu
**6**'da bitti. `flow check`'in tahmini bilerek en kötü hâli veriyor.

**Ve körleme ilk canlı koşusunda ÇEŞİTLİLİK değil YAKINSAMA üretti.** İki
itirazcı birbirini görmeden, bağımsız olarak **aynı** şeyi buldu:
`selector.ts`'in `state.version === sonSurum` önbelleğinin, version geri
sarılırsa bayat sonuç döndüreceği. İkisi de bunu planın zaten doğru
çözdüğünü söyleyip itiraz açmadı. Yani beşinci canlı alışveriş de sıfır
itirazla kapandı (5/5).

Dürüst okuma: bu koşu körlemenin **mekanizmasını** doğruluyor, **değerini**
doğrulamıyor. Üstelik plan bu koşuda gerçekten doğruydu — kusuru olmayan
bir planda itiraz çeşitliliği ölçülemez. Körlemenin çeşitlilik ürettiği
iddiası, ancak planın kusurlu olduğu koşularda sınanabilir.

**Bir yan sinyal, ölçüm değil.** Üretilen kod gizli süitte **16/16 yeşil** —
eşik ölçümünde `haiku` ve `sonnet`in üçer koşunun üçünde de düşürdüğü iki
kanca (`version geri gitmez`, `version hiçbir zaman tekrar etmez`) dahil.
Cazip ama karşılaştırılabilir değil: eşik ölçümü tek ajanlı `produce`
yolundan geçiyordu, bu koşu beş rollü zincirden. Kontrol kolu yok, k=1.
Bunu ölçüme çevirecek şey 6d kampanyası (`planab`), yani zaten o iş için
yazılmış olan takım.

---

## 6d kampanyası — KOŞULDU, karar çıkmadı (30 Eylül)

İki görev × `claude-haiku-4-5` × k=3 hedeflendi; toplam **$11.98**
harcandı ve **karar çıkmadı**. Ama kampanya, ölçmeye çalıştığı şeyden
başka dört şey ölçtü ve üçü mekanizmanın kendisiyle ilgili.

### Rapor

```
=== snapshot-store × haiku-4.5 · k=2 ===
  kol        koşu  kanca  kırmızı   oran   aktivasyon  maliyet  ret
  plansız      3     48        6    %13        6      $0.55     0
  planlı       2     32        2     %6       16      $2.41     3   (1 ÖLÇÜLEMEDİ)
  göreli azalma: %50 · koşu başına: %0, %100

=== cache-refresh × haiku-4.5 · k=1 ===
  plansız      3     66        2     %3       12      $2.29     3
  planlı       1     22       10    %45       16      $3.20     4   (2 ÖLÇÜLEMEDİ)
  göreli azalma: %-1400

  KARAR: YETERSIZ — iki görevin hiçbiri karar verecek durumda değil.
```

### Bulgu 1: itiraz mekanizması kullanılmıyor — ret kanalı kullanılıyor

Kampanyanın en önemli sonucu bu ve ölçülmek istenen şey değil.

**`architect` (plan itirazcısı) 7 ret verdi ve 0 itiraz yazdı.** Yedi retin
gerekçeleri genel değil, tam da tasarımın istediği cinsten:

> Plan, `Store` sınıfının mevcut `#stateSnapshots` mekanizmasını göz ardı
> ederek, yalnızca `#history.pop()` işlemiyle
> `snapshots.length == history.length + 1` değişmezini kıracak bir `undo()`
> uygulaması önerir.

Yani itirazcının söyleyecek gerçek bir şeyi vardı ve onu **yanlış kanaldan**
söyledi. Tören ölçüsü "3 alışverişin 3'ü itirazsız (%100)" diyor — bu sayı
artık **yanıltıcı**: anlaşmazlık vardı, itiraz dosyasından geçmedi.

Sebep tasarımda: `ab-planli.yaml`, `plan2.yaml` ve `plan3.yaml`'da itirazcı
rolün hem `reject` kenarı hem itiraz dosyası var. İki kanal verildiğinde
model tanıdık olanı seçiyor. Ve ret burada her açıdan daha kötü:

| | yazılı itiraz | ret |
|---|---|---|
| maliyet | bir tur içinde, plan yeniden yazılmaz | her ret = tam bir yeniden planlama |
| kayıt | `kabul`/`ret`/`insana` ayrımı, sayılabilir | tek gerekçe metni |
| sonlanma | tur sayacı, doğal son | `reject.limit` dolunca kart kapıda |

**Öneri (kural 22):** planlama katılımcısı `reject` kenarı taşıyamasın.
Planlama aşamasında itirazın yolu itiraz dosyası; ret, kod aşamasının
mekanizması. Kural 21 katılımcıya *kapı* koymayı zaten yasaklıyor, aynı
gerekçenin kardeşi. Yazılmadı — akış dilini değiştiriyor, ayrı bir karar.

### Bulgu 2: kol kaybı ASİMETRİK ve deney kolunda

Gerçek kol kayıplarının hepsi deney kolunda: iki planlı kol `reject.limit`
dolduğu için kapıya çıktı, hiçbir kontrol kolu düşmedi. (Üçüncü planlı
kaybı bana ait — kararı değiştiremeyeceği kesinleşince koşuyu durdurdum.)

Bu, ölçümü yalnızca yavaşlatmıyor **bozuyor**: deney kolunun en çok
tartışılan koşuları sistematik olarak eleniyor. Bulgu 1'in düzeltilmesi
bunu da düzeltir.

### Bulgu 3: hücre seçimi yanlış tabloya dayanıyordu

İlk deneme `snapshot-store × sonnet-5` ile başladı ve kontrol kolu
**16/16 yeşil** verdi — ölçüm gücü yok, rapor zorunlu olarak YETERSİZ.
Sebep: hücreler **tek ajanlı `produce`** yolunun eşik tablosuna göre
seçilmişti, oysa AB kolları koder+reviewer zinciri. Zincirdeki reviewer
tuzağı yakalayıp reddetti, koder düzeltti.

Aynısı `cache-refresh`te de görüldü: tek ajanlı yolda haiku 22 kancanın
10'unu düşürüyordu, zincirde kontrol kolu 66 kancanın yalnızca 2'sini
düşürdü. **Zincir, çıplak üreticiden belirgin şekilde güçlü** — ve bu,
denetim turunun değerine dair bağımsız bir sinyal.

Sonuç: 6d için hücre seçmenin doğru tablosu yok. `planab`'a, kontrol kolu
temiz çıktığında kalan tekrarları koşmadan uyaran bir ön kontrol
gerekiyor.

### Bulgu 4: yön, olduğu kadarıyla, olumlu değil

`snapshot-store`ta göreli azalma %50 ama işaret tutarsız (%0 ve %100):
bir planlı tekrarda kusur tamamen kayboldu, ötekinde hiç değişmedi.
`cache-refresh`in tek ölçülmüş planlı koşusu 22 kancanın 10'unu düşürdü,
kontrol kolu ise 66'nın 2'sini — **%-1400**. Tek koşu, ama yön olumlu
değil ve iki görev ayrışıyor.

Bedel net ve tekrarlanıyor: planlı kollar kontrol kollarının **3-4 katı**
($2.41 / $0.55 ve $3.20 / $2.29).

### Karar kuralı doğru davrandı

Hiçbir sayı karara çevrilmedi: k eşiğin altında kaldığı için iki grup da
YETERSİZ okundu, düşen kollar `ÖLÇÜLEMEDİ` diye ayrı sayıldı ve "0 kırmızı"
sayılmadı. Kampanyanın ürettiği tek "sonuç" cümlesi şu: **planlamanın
ürünü daha doğru yapıp yapmadığı hâlâ bilinmiyor**, ve bugünkü haliyle
mekanizma ölçülmeden önce bir tasarım düzeltmesi bekliyor (Bulgu 1).

---

## 6d — Koşum takımı (YAZILDI)

Ölçütler yukarıda ilan edilmişti; bu bölüm onları koşturan takımı
anlatıyor. Takımın kendisi bir cevap **değil** — cevabı üretecek alet.

### Kolların tek farkı planlama bloğu

`hub/flows/ab-plansiz.yaml` ve `hub/flows/ab-planli.yaml` satır satır
aynı: aynı rol promptları, aynı anayasa, aynı ret politikası, aynı kod
taşıma. Deney kolunda fazladan yalnızca `planlama:` bloğu ve iki
katılımcı rolü var. Fark buysa, ölçülen şey de bu olabilir; iki akış
başka bir yerde de ayrışsaydı hiçbir sayı planlamaya yazılamazdı.

### Her koşu kendi kum havuzunda

`prepareSandbox` her kol-tekrar için ayrı bir git deposu kuruyor: `hub/`
kopyalanıyor, görevin `seed/`i açılıyor, ilk commit atılıyor. Ajanların
ürettiği çözüm **bu depoya yazılmaz**. Gizli süit yine gerçek depodan
koşuyor (`node_modules` orada), ama üretim sırasında kum havuzunda
`hidden/` **yok** — bunu bir test casus adaptörle doğruluyor, çünkü
"gizli testler sızmadı" iddiası tam olarak ölçümün geçerlilik koşulu.

### Kolun kimliği çıkarsanmıyor, yazılıyor

Günlüğe `ab.arm` olayı düşüyor (`taskId`, `arm`, `flow`). "Plan olayı var
mı" diye çıkarsamak, planlayıcısı hiç koşmamış bir planlı kolu kontrol
kolu gibi gösterirdi — yani ölçümü sessizce kendi lehine bozardı.
`armRuns` kolu **sadece** bu olaydan okuyor.

### Karar kuralı bench'ten devralınıyor

`planEffect` eşikleri `bench/effect.ts`ten **import ediyor**, kopyalamıyor:
ikinci bir eşik tanımı, zamanla birinciyle ayrışacak ikinci bir gerçek
demekti. Gruplama da aynı — grup = görev × model, ve `repeats`
`min(planli.runs, plansiz.runs)`: eksik kolla koşulmuş bir görev k'yı
şişirmiyor. Tören metrikleri (`exchanges`, `withoutObjection`,
`objections`, `accepted`, `invalid`) ayrı raporlanıyor; sonuç metriğiyle
harmanlanmıyor.

### Canlı doğrulama iki yazım hatası çıkardı — ve ikisi de ölçüm gibi görünebilirdi

Bu iki kusur, takımın en önemli parçasının neden `requireAdapters`
olduğunu anlatıyor:

1. **`--k 1` biçimi model adını yuttu.** Boşluklu biçimde `"1"` konumsal
   argüman olarak kaldı ve model tanımı diye okundu; adaptör `1` diye
   kaydedildi. Her iki kol da "ÖLÇÜLEMEDİ · 0 aktivasyon · $0.0000"
   döndürdü. Para harcanmadı, ama çıktı **bir ölçüm sonucu gibi
   duruyordu.**
2. **Adaptör haritası yanlış anahtarla kuruluyordu.** `adapterFor`
   adaptörün `id`'sine model tanımının tamamını yazıyor
   (`claude:claude-haiku-4-5-20251001`) — 2x2'nin hücreleri model
   düzeyinde ayrışmak zorunda olduğu için. Akış rolleri ise
   `provider: claude` diyor. Harita `adapter.id` ile kurulunca hiçbir rol
   adaptör bulamıyordu.

Birinci kusur ayrıştırıcıyla, ikincisi `armAdapters()` ile düzeltildi. Ama
asıl ders ikisinin ortak yanında: **yazım hatası, sessiz sıfırla
sonuçlandığında ölçümden ayırt edilemez.** O yüzden `requireAdapters`
koşuyu hiç başlatmadan patlatıyor — ikinci kusuru yakalayan da bu oldu.
Ve testlerin kusuru görmemesinin sebebi tam olarak şu: testler adaptör
haritasını **elle** `"claude"` anahtarıyla kuruyordu, yani gerçek
kablolamayı hiç sınamıyordu. Kurulum bu yüzden artık tek bir yerde
(`armAdapters`) ve üç testle kaplı.

### Canlı doğrulama: deney kolu baştan sona ölçüldü

`snapshot-store` × haiku, k=1 (~$0.56):

```
── tekrar 1 · plansiz ──
   coder: escalated
   ÖLÇÜLEMEDİ  ·  1 aktivasyon  ·  $0.1347
── tekrar 1 · planli ──
   planner/architect/coder/reviewer: accepted
   14/16 yeşil  ← kusur: version geri gitmez; version hiçbir zaman tekrar etmez
   4 aktivasyon · $0.4270 · alışveriş: 0 itiraz, 0 kabul
```

İki şey doğrulandı, biri de kendini gösterdi:

1. **Zincir baştan sona koşuyor ve gizli süit üretilen koda karşı
   koşuyor.** Dahası kırmızı düşen iki kanca, eşik ölçümünde `haiku` ve
   `sonnet`in üçer koşunun üçünde de düşürdüğü **tam olarak aynı iki
   kanca**. Yani kum havuzu, ayrı bir depoda ve ayrı bir akışla, bilinen
   kusuru yeniden üretiyor — koşum takımının geçerliliğine dair elde en
   güçlü kanıt bu.
2. **Kolun düşmesi ölçüm gibi sayılmıyor.** Kontrol kolunda `coder` kodu
   yazdı ama commit atmadı; temiz-ağaç kapısı devri reddetti. `planrapor`
   bunu `ÖLÇÜLEMEDİ` diye ayrı sayıyor, "0 kırmızı" saymıyor, ve kararı
   `k=0 · YETERSİZ — kontrol kolu ölçülmedi` diye veriyor. Doğru davranış:
   tek kollu bir A/B, sonuç değil.
3. **Alışveriş yine sıfır itirazla kapandı** — bu dördüncü canlı
   alışveriş, dördü de `anlasma`. Tören ölçüsü (>%50 itirazsız ise tören)
   bugün %100'de duruyor.

Kontrol kolunun düşme sebebi modelin bir adımı atlaması; aynı koşunun
**planlı** kolunda aynı model commit'i attı, yani sistematik bir engel
değil haiku'nun değişkenliği. Ama kampanyada bu, kolları asimetrik
düşürebildiği için ölçümü bozar; o yüzden sebep artık ekrana basılıyor
(`ArmResult.escalation`) ve kampanya talimatı sonnet üreticisini öneriyor.

**Ölçümün kendisi hâlâ koşulmadı:** k≥3 ve en az iki görev gerekiyor.
Bu belgeye sonuç yazılmadan önce koşması gereken şey o.

---

## Bu tasarımın kendi sınırı

Adım 6, tezin **üstüne** bina kuruyor: farklı satıcıların birbirini
denetlemesi değer üretiyorsa, birbiriyle planlaması da üretmelidir. Tez
hâlâ ölçülmedi (çapraz satıcı 2x2'si koşulmadı). Bu yüzden sıralama
önerisi değişmedi: **önce ölçüm, sonra 6b.** 6a ölçümü beklemeden
yazılabilir, çünkü alışverişe değil belge taşımaya dayanıyor.
