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

Yükleyiciye dört kural eklenir (bugün 16 var, bunlar 17-20):

| # | Kural | Neden |
|---|---|---|
| 17 | `katilimcilar` en az iki, tekrarsız, hepsi tanımlı rol | Tek kişilik "alışveriş" alışveriş değil |
| 18 | `tur` 1..5 | Maliyet tavanı dilin içinde olmalı, promptun değil |
| 19 | Katılımcılar, kod yazan her rolden **önce** gelmeli | Plan, iş yapıldıktan sonra tartışılmaz |
| 20 | `plan` yolu `src/` altında olamaz | Plan belge; kod taşıma yolu git, dosya değil |

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
ediliyor. `tur > 1`, üç ve fazla katılımcı, ve `ilk-tur-kor: false` hâlâ
AÇIKÇA reddediliyor — üçü de 6c'nin konusu.

**Canlı koşu (18 Eylül, `claude-sonnet-5`, `plan2.yaml`):** `planner` planı
yazdı ve commit'ledi; `architect` itiraz turunu koştu; alışveriş kapandı;
`coder` ve `reviewer` işi bitirdi. Mekanizma uçtan uca çalıştı.

**Ama bitiş testi tam olarak geçilmedi.** Tasarımın istediği "en az bir
itiraz `kabul` ile kapansın ve plan hash'i değişsin" olmadı: `architect`
planın her iddiasını depodaki kodla tek tek karşılaştırdı, hepsini
doğruladı ve **itirazım yok** dedi — uydurma itiraz da eklemedi ("Uydurma
bir itiraz eklemiyorum"). Yani `itirazsız` yolu koştu, `kabul` yolu değil.
`kabul`, `ret`, `insana` ve kilit kapısı yolları testlerle kapalı
(`src/watch/exchange.test.ts`), canlı koşuyla değil.

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

**6c — Çok tur + sayaçlar + kapı.** Tur limiti, yeni itiraz sayacı,
`tukendi` → deadlock kapısı. Bitiş testi: limit dolduğunda kart kapıda
bekliyor, insan `retry` ile planı yeniden açabiliyor.

**6d — Ölçüm.** Yukarıdaki A/B, k≥3.

Dokunacağı yerler: `src/flow/load.ts` (kural 17-20), `src/flow/cost.ts`
(formül), `src/card/card.ts` (geçmiş kaydı + `plan.hash`),
`src/watch/tick.ts` (planlama aşaması), yeni `src/plan/exchange.ts`,
`hub/prompts/planlama/*.md`, `src/ui/model.ts` (pano alanları),
`src/events/log.ts` (iki olay). Kaba büyüklük: 600-800 satır ürün kodu ve
bir o kadar test.

---

## Bu tasarımın kendi sınırı

Adım 6, tezin **üstüne** bina kuruyor: farklı satıcıların birbirini
denetlemesi değer üretiyorsa, birbiriyle planlaması da üretmelidir. Tez
hâlâ ölçülmedi (çapraz satıcı 2x2'si koşulmadı). Bu yüzden sıralama
önerisi değişmedi: **önce ölçüm, sonra 6b.** 6a ölçümü beklemeden
yazılabilir, çünkü alışverişe değil belge taşımaya dayanıyor.
