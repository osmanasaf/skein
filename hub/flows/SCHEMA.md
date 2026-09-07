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

gates:                          # insan kapıları; varsayılan: []
  - after: string               # bu rolün çıktısı kapıda bekler
    type: approval | none
    message: string?            # insana gösterilecek açıklama

audit:
  enabled: boolean              # varsayılan: true
  fingerprint: [string]         # parmak izine giren alanlar
```

## Alanların anlamı

**Yollar** — `constitution` ve `prompt` alanlarındaki yollar **akış
dosyasının bulunduğu dizine** göre çözülür. Mutlak yol ve `../` ile dışarı
çıkmak yasaktır.

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

**`gates`** — kapı, bir rolün çıktısının teslim edilmeden önce insan onayı
beklemesidir. Zincirin **herhangi** bir yerine konabilir; hiçbir role
ayrıcalık yoktur.

**`audit`** — devir teslim denetim kapısı. Parmak izine `commit` dahil olduğu
için, denetim sırasında yapılan düzeltme otomatik olarak yeni bir tur açar;
devir teslim ancak hiçbir şeyin değişmediği bir turdan sonra gerçekleşir.

## Doğrulama kuralları

Akış yüklenirken şunlar kontrol edilir; ihlal varsa akış hiç başlamaz:

1. `id` değerleri tekil.
2. Tam olarak bir rolün `workspace` değeri `main`.
3. Her `next`, var olan bir `id`'ye ya da `done`'a işaret eder.
4. Tam olarak bir rolün `next` değeri `done`.
5. Zincirde döngü yok; her rol `done`'a ulaşabiliyor.
6. `syncBack` yalnızca zincirde **daha önce** gelen rollere işaret eder.
7. Her `gates[].after`, var olan bir `id`'ye işaret eder.
8. Her `provider`, kayıtlı bir adaptöre karşılık gelir.
9. Her `prompt` dosyası mevcut ve boş değil.
10. Her `constitution` dosyası mevcut ve boş değil; liste tekil (aynı dosya
    iki kez giremez).
11. Hiçbir prompt dosyası katman sınırı işaretini (`<<<skein:layer`) içermez.

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
aktivasyon ≈ (rol sayısı × audit tur sayısı) + toplam syncBack alıcısı
```

| Topoloji | Roller | syncBack toplamı | ~Aktivasyon |
|---|---:|---:|---:|
| `daily` (2 adım) | 2 | 1 | ~5 |
| `spec` (4 adım) | 4 | 4 | ~12 |
| 6 adım, her denetim rolü tüm öncekilere syncBack | 6 | 9 | ~21 |

Derin topoloji yasak değil — maliyeti görünür olsun diye burada.

## Örnekler

- [`daily.yaml`](daily.yaml) — 2 adım, kapısız. Günlük iş.
- [`spec.yaml`](spec.yaml) — 4 adım, spec kapılı. Gereksinim belirsizse.

Kendi akışını yazarken bunları kopyalayıp değiştir. Rol isimlerini istediğin
gibi koy; sistem karışmaz.
