# Akış Tanımı Şeması

Topoloji ürünün sabiti değil, senin kararın. Kaç rol, hangi sırada, hangi
sağlayıcı, kapı nerede — hepsi burada tanımlanır. İki adımlı da kurabilirsin,
dört adımlı da, on adımlı da.

**Rol isimleri tamamen serbesttir.** Sistem isme bakıp davranış değiştirmez.
`coder`, `reviewer`, `security`, `perf`, `docs`, `ahmet` — fark etmez. (Bu,
SwarmForge'un en kırılgan yanının kasıtlı olarak tersidir: orada `specifier`
adını değiştirmek insan onay kapısını sessizce yok ediyordu.)

## Alanlar

```yaml
name: string                    # akışın adı
description: string?            # opsiyonel

constitution:                   # tüm rollerin üstünde kanun; sıra anlamlıdır
  - string                      # prompt dosyası yolları

roles:                          # sıra önemli değil; zincir `next` ile kurulur
  - id: string                  # serbest isim, akış içinde tekil
    provider: string            # adapters/ altındaki bir adaptör
    workspace: string           # "main" ya da worktree adı
    prompt: string              # rol tanımı dosyasının yolu
    receive: task | batch       # varsayılan: task
    next: string | "done"       # bir sonraki rolün id'si, ya da bitiş
    syncBack: [string]          # merge-only kopya gidecek roller; varsayılan: []
    reject: string?             # ret hâlinde kartın döneceği rol; varsayılan: gönderen

gates:                          # insan kapıları; varsayılan: []
  - after: string               # bu rolün çıktısı kapıda bekler
    type: approval | none
    message: string?            # insana gösterilecek açıklama

reject:                         # akış geneli ret politikası
  limit: integer                # aynı kenarda en fazla kaç ret; varsayılan: 2
  onExhausted: gate             # limit dolunca kart insan kapısında bekler

audit:
  enabled: boolean              # varsayılan: true
  fingerprint: [string]         # parmak izine giren alanlar
```

## Alanların anlamı

**Yollar** — `constitution` ve `prompt` alanlarındaki yollar **akış
dosyasının bulunduğu dizine** göre çözülür. Mutlak yol yasaktır; çözülmüş
yol **depo kökünün** içinde kalmak zorundadır.

> `../` serbesttir. Bu kural önce "`../` ile dışarı çıkmak yasak" diye
> yazılmıştı ve o hâliyle gönderilen iki örneği de reddederdi: ikisi de
> `hub/flows/`'tan `java-kit/`'e `../../` ile uzanıyor. Anayasa maddeleri
> ile rol tanımları aynı dizinde durmak zorunda değil; sınır dizin değil,
> depo.

**`constitution`** — her role, kendi rol promptundan **önce** eklenen ortak
katmanlar. Çekirdek bunları rol promptuyla birleştirip adaptöre tek dosya
olarak verir; ajan dosyaları kendi okumaz (headless çağrıda çalışmaz).

Hangi maddelerin gireceği **akışın kararıdır**. SwarmForge tüm maddeleri
zorluyordu; Java kuralları Python rolüne de gidiyordu. Burada bir Java akışı
`engineering-java` maddesini alır, başka bir akış almaz.

Katman sırası ve kurcalama koruması için aşağıdaki "Prompt katmanları"na bak.

**`workspace`** — `main` ana checkout'tur; tam olarak bir rol onu alır.
Diğer her rol kendi adıyla bir git worktree alır ve orada izole çalışır.

**`next`** — ileri yön. Bir rol işini bitirince kart buraya gider. `done`
yazan rol zinciri kapatır ve kartı bitmiş sayar.

**Kart taşınırken kod da taşınır.** Rolün dalı, sonraki rolün worktree'sine
merge-only olarak birleştirilir — `syncBack`'in geriye yaptığının ileri
yöndeki karşılığı. İkisi aynı ilkenin iki yönü: bir rolün ağacı, görmesi
gereken işi içermeli.

> Bu cümle ilk taslakta yoktu ve eksikliği ancak gerçek ajanlarla koşunca
> göründü. Her rol kendi worktree'sinde, kendi dalında çalışıyor; ana dal
> ilerlediğinde denetçinin ağacı kendiliğinden ilerlemiyor. Denetçi boş bir
> depoda "denetle" talimatı aldı ve doğal olarak denetleyecek bir şey
> bulamadı. Sahte adaptörle koşan testlerin hiçbiri bunu göremezdi:
> kod taşımayan bir devir teslim, kod üretmeyen ajanlarla kusursuz görünür.

**Çakışma çözülmez, yukarı çıkar.** Birleştirme çakışırsa geri alınır
(`merge --abort`) ve kart insan kapısında bekler. İki ajanın aynı satırda
ayrıştığı yer, bir üçüncü ajanın tahmin edeceği yer değil.

**Kabul, temiz ağaç ister.** Rol `accept` dediği hâlde ağacında işlenmemiş
değişiklik bırakmışsa devir teslim yapılmaz. Kural "her kabul commit
üretmeli" değil — değişiklik yapmadan kabul eden bir denetçi meşru; yasak
olan, ortada duran ve hiçbir yere gidemeyecek iş bırakmak.

> Bu da aynı koşuda bulundu: üretici dosyaları yazdı, commit atmadı, yine de
> "kabul" dedi. Devir teslim iskelet commit'ini kaydetti — kart geçmişindeki
> o hash bir yalandı.

> SwarmForge'da ileri yön rol promptunun *metnine* gömülüydü, geri yön ise
> konfigürasyondaydı; ikisinin tutarlılığı hiç doğrulanmıyordu. Burada ikisi
> de tanımda ve doğrulanıyor.

**`receive`** — `task` her devir teslimi ayrı iş olarak alır. `batch`
kuyrukta bekleyen eşdeğer işleri tek turda yutar; zincirin sonundaki denetim
rolleri için uygundur.

**`syncBack`** — bu rol işini bitirince, listedeki rollere işin merge-only
bir kopyası gider; onların ağacı güncel kalır. Kart hareket etmez.

> Açık liste olması kasıtlı. SwarmForge'da bu `back-one` / `back-all`
> kısayollarıydı ve `back-all`'ın maliyeti görünmezdi — altı rollük bir
> pakette kart başına 9 fazladan ajan uyandırması demekti. Burada kimin
> uyandığını sayabilirsin.

**`reject`** — geri yön. Bir rol, kendisine gelen işi kabul etmezse kart bu
role **geri gider**. `syncBack` bir kopya gönderir ve kart yerinde kalır;
`reject` kartın kendisini geri taşır. İkisi farklı şeylerdir.

Varsayılan hedef **gönderendir**: `next`'i bu role işaret eden rol. Açıkça
yazmak, hedef gönderenden farklıysa gerekir — güvenlik bakışı yapan bir rol,
bulduğu kusuru kodu yazana döndürmek ister, kendisinden önceki denetçiye
değil.

Ret **boş dönmez**. Kartla birlikte bir ret kaydı taşınır: reddeden rol,
gerekçe metni, reddedilen commit ve tur numarası. Alıcı rol bunu görev
metninin içinde alır; "bir şeyler yanlış" değil, ne olduğu gider.

Ret, devir teslim denetiminden (`audit`) ayrıdır. `audit` rolün **kendi**
işini teslim etmeden önce denetlemesidir; `reject` teslim **sonrası**
başka bir rolün itirazıdır. İkisi de olay günlüğüne ayrı yazılır.

**`reject.limit`** — aynı kenarda üst üste kaç ret olabileceği. Sınırsız ret
iki rolün birbirini sonsuza kadar reddetmesi demektir; bu kurgusal bir risk
değil, iki modelin farklı doğru bildiği her durumda olan şeydir. Limit
dolunca kart ilerlemez ve **insan kapısında bekler** (`onExhausted: gate`;
şimdilik tek geçerli değer). Sessizce kabul etmek de, sessizce durmak da
yasak — anlaşmazlık yukarı çıkar.

**`gates`** — kapı, bir rolün çıktısının teslim edilmeden önce insan onayı
beklemesidir. Zincirin **herhangi** bir yerine konabilir; hiçbir role
ayrıcalık yoktur.

**Akış hash'i** — yükleyici topolojinin SHA-256'sını hesaplar ve koşan her
kart bu damgayı yanında taşır. Amaç, akışların **değiştirilebilir** olması:
rol ekleyip çıkarabilmelisin, ama yolda olan bir kartın hangi topolojiyle
koştuğu sonradan da bilinmeli.

Hash'e giren: rol zinciri (sıra, sağlayıcı, workspace, prompt yolu,
`receive`, `next`, `syncBack`, çözülmüş `reject`), kapıların yeri ve türü,
ret politikası, audit politikası, anayasa listesi. Yollar depo köküne göre
relatif — aynı tanım her makinede aynı hash'i verir.

Hash'e girmeyen: `description` ve kapı mesajları (insana yazılmış düzyazı;
bir yazım düzeltmesi yolda olan kartları geçersiz kılmamalı) ve prompt
dosyalarının **içeriği** — o `assemblePrompt`'un hash'inin işi. İkisi ayrı
kaydedilir ki bir şey değiştiğinde hangisi olduğu bilinsin: yol mu değişti,
talimat mı.

Buradan çıkan sözleşme:

| Ne zaman değişir | Serbest mi | Yolda olan karta etkisi |
|---|---|---|
| Akış başlamadan — rol ekle/çıkar, sıra değiştir | evet | — |
| Akış koşarken — dosyayı düzenle | evet | yok; kart kendi hash'iyle biter |
| Ajan kendi kararıyla rol ekler | **hayır** | — |

Üçüncü satır kasıtlı. Maliyeti önceden göremediğin, iki koşuyu
karşılaştıramadığın bir topoloji ölçülemez; "prompt aynıydı, topoloji
aynıydı" diyemezsen elinde veri değil anekdot kalır. İleride istenirse insan
kapısı arkasında bir *öneri* olarak eklenebilir.

**`audit`** — devir teslim denetim kapısı. Parmak izine `commit` dahil olduğu
için, denetim sırasında yapılan düzeltme otomatik olarak yeni bir tur açar;
devir teslim ancak hiçbir şeyin değişmediği bir turdan sonra gerçekleşir.

## Doğrulama kuralları

Akış yüklenirken şunlar kontrol edilir; ihlal varsa akış hiç başlamaz.
Hata mesajları kural numarasını taşır — `npm run flow -- check <dosya>` ile
görürsün.

1. `id` değerleri tekil.
2. Tam olarak bir rolün `workspace` değeri `main`.
3. Her `next`, var olan bir `id`'ye ya da `done`'a işaret eder.
4. Tam olarak bir rolün `next` değeri `done`.
5. **`next` zincirinde** döngü yok; her rol `done`'a ulaşabiliyor.
   (Ret kasıtlı bir geri kenardır ve bu kurala girmez; onu kural 12-15
   sınırlar.)
6. `syncBack` yalnızca zincirde **daha önce** gelen rollere işaret eder.
7. Her `gates[].after`, var olan bir `id`'ye işaret eder.
8. Her `provider`, kayıtlı bir adaptöre karşılık gelir.
9. Her `prompt` dosyası mevcut ve boş değil.
10. Her `constitution` dosyası mevcut ve boş değil; liste tekil (aynı dosya
    iki kez giremez).
11. Hiçbir prompt dosyası katman sınırı işaretini (`<<<skein:layer`) içermez.
12. `reject`, var olan bir `id`'ye işaret eder ve rolün kendisi olamaz.
13. `reject` yalnızca zincirde **daha önce** gelen bir role işaret eder —
    ret ileri sıçrayamaz. (`syncBack` ile aynı kısıt.)
14. Zincirin başı — hiçbir rolün `next`'inin işaret etmediği rol — `reject`
    taşıyamaz; geri dönecek rol yoktur. O rol işi yapamıyorsa insana çıkar.
15. `reject.limit` en az 1 olan bir tamsayıdır.
16. İki rol aynı `workspace` değerini paylaşamaz. Paylaşılan bir worktree
    izolasyonu sessizce yok eder: iki ajan aynı ağaçta çalışır ve
    birbirinin değişikliğini ezer. Rol kopyalayıp `workspace` satırını
    değiştirmeyi unutmak, topolojiyi büyütürken yapılacak en kolay hata.

Kural 9-11 akış yüklenirken değil, **prompt derlenirken** de yeniden
uygulanır; ikisi de aynı birleştiriciden geçer.

## Prompt katmanları

Adaptöre giden `promptFile` şu sırayla derlenir:

```
constitution[0..n]      ← akıştan; tüm rollerde aynı
role.prompt             ← rolden
```

`taskText` bu dosyaya **girmez** — adaptöre ayrı alan olarak gider. Böylece
bir rolün prompt hash'i görevden bağımsızdır; "bu iki koşuda prompt aynıydı"
iddiası kanıtlanabilir olur.

Her katman makine-okunur bir sınır işaretiyle ayrılır ve **kaynak dosyaların
hiçbiri bu işareti içeremez**. Bir rol promptu sahte anayasa bölümü açıp
kendini kanun ilan edemez.

> SwarmForge'da anayasanın üstünlüğü bir konvansiyondu — upstream *"those
> filenames are law from `main`"* diyordu, ama `java-kit` o kanunu ezmek için
> paylaşılan kopyaları elle değiştirmeni söylüyordu. İhlal mümkündü ve
> **sessizdi**. Burada mekanik.

Derleme sonucu bir SHA-256 hash üretir; olay günlüğüne yazılır.

## Maliyet

Topolojiyi çalıştırmadan önce ne kadara mal olacağını görebilmelisin. Kaba
tahmin, kart başına ajan uyandırması:

```
temel ≈ (rol sayısı × audit tur sayısı) + toplam syncBack alıcısı
```

| Topoloji | Roller | syncBack toplamı | ~Temel |
|---|---:|---:|---:|
| `daily` (2 adım) | 2 | 1 | ~5 |
| `spec` (4 adım) | 4 | 3 | ~11 |
| 6 adım, her denetim rolü tüm öncekilere syncBack | 6 | 9 | ~21 |

**Ret bu sayının üstüne biner.** Bir ret, reddeden rolle hedefi arasındaki
zincir parçasını baştan koşturur. Varsayılan hedef gönderen olduğu için
**zincirin başı dışındaki her rol bir ret kenarıdır** — akışta `reject`
yazmamış olman kenarı yok etmez, yalnızca görünmez kılar:

```
en kötü ≈ temel + Σ (kenarın ret limiti × o parçanın maliyeti)
```

| Topoloji | Temel | Ret kenarları | En kötü (limit 2) |
|---|---:|---|---:|
| `daily` | ~5 | reviewer→coder (4) | ~13 |
| `spec` | ~11 | coder→analyst (4), reviewer→coder (4), guard→coder (6) | ~39 |

Derin topoloji de, cömert ret limiti de yasak değil — maliyeti görünür olsun
diye burada. Ret limiti aynı zamanda bir bütçe kararıdır.

## Örnekler

- [`daily.yaml`](daily.yaml) — 2 adım, kapısız. Günlük iş.
- [`spec.yaml`](spec.yaml) — 4 adım, spec kapılı. Gereksinim belirsizse.

Kendi akışını yazarken bunları kopyalayıp değiştir. Rol isimlerini istediğin
gibi koy; sistem karışmaz.
