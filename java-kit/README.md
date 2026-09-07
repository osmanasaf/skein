# SwarmForge — Java Kit

SwarmForge'un pack katmanının Java'ya uyarlanmış hali. Upstream'in `two-pack`
ve `four-pack` topolojilerini temel alır, ama Clojure/Go/Gherkin bağımlılıkları
çıkarılmış, yerine Java ekosisteminin standart araçları konmuştur.

Bu kit **rol ve kural katmanıdır**. SwarmForge'un script katmanını (handoff
daemon, audit gate, worktree yönetimi) değiştirmez — onları upstream'den
olduğu gibi kullanır.

## İçerik

```
conf/daily.conf                       Topoloji A — günlük sürücü (2 rol)
conf/spec.conf                        Topoloji B — spec kapılı (3 rol)
constitution.prompt                   Giriş noktası
constitution/articles/engineering.prompt   Java mühendislik kuralları
constitution/articles/workflow.prompt      Worktree/commit/tmp disiplini
roles/coder.prompt
roles/cleaner.prompt
roles/specifier.prompt                Sadece Topoloji B için
roles/guard.prompt                    Güvenlik/mimari son bakış (Skein spec akışı)
```

## Kurulum

`get-swarm-forge` ile forge'u kurduktan sonra, bir pack şablonunun üstüne
kopyala:

```sh
PACK=packs/two-pack          # ya da kendi pack dizinin
cp conf/daily.conf                       $PACK/swarmforge/swarmforge.conf
cp constitution.prompt                   $PACK/swarmforge/constitution.prompt
cp constitution/articles/*.prompt        $PACK/swarmforge/constitution/articles/
cp roles/coder.prompt roles/cleaner.prompt $PACK/swarmforge/roles/
```

Topoloji B için `conf/spec.conf`'u ve ek olarak `roles/specifier.prompt`'u
kopyala.

Upstream'in `engineering.prompt` ve `workflow.prompt` dosyaları `main`'den
gelir ve pack'ler tarafından ezilemez ("Those filenames are law from `main`").
Bu kit'in dosyaları aynı isimleri taşıdığı için, forge'un `swarmforge/` kök
dizinindeki paylaşılan kopyaları da değiştirmen gerekir — yoksa Clojure
kuralları geri gelir.

## ZORUNLU YAMA: launcher Java projesine Gherkin enjekte ediyor

Bu, README'de yazmayan ve sessizce bozan bir davranış. `swarmforge.bb`, her
ajanın başlangıç talimat dosyasını üretirken **rol adına göre sabit kodlu bir
araç listesi** enjekte ediyor:

```clojure
;; swarmforge/scripts/swarmforge.bb:393
(def role-required-tools
  {"specifier" ["gherkin-parser" "ir-dry-checker"]
   "coder"     ["gherkin-parser"]
   ...})
```

`coder` ve `specifier` adlarını kullandığın için — ki kullanmak zorundasın,
bkz. aşağıdaki "magic isimler" — Java projende ajanlara "APS Gherkin
parser'ını kur ve çalıştır" talimatı gidecek. İki düzenleme gerekiyor:

**1. Araç haritasını boşalt** (`swarmforge.bb:393`):

```clojure
(def role-required-tools {})
```

**2. Clojure araç satırını değiştir** (`swarmforge.bb`, `tool-startup-section`
içinde, `"- Constitution tools: \`swarm_tool.sh require crap4clj\`..."` ile
başlayan satır). Bu satır rolden bağımsız olarak her ajana gidiyor. Java için:

```clojure
"- Build and verification commands come from the engineering article. Do not
   install language tools yourself.\n"
```

Bu iki düzenleme olmadan her ajan, olmayan araçları kurmaya çalışarak tur
harcar.

## Magic rol isimleri — değiştirme

SwarmForge'da rol isimleri anlam taşır. Bu kit kasıtlı olarak upstream
isimlerini korur:

- **`specifier`** — insan onay kapısı (`handoffd.bb` `should-hold?`) yalnızca
  harfiyen `specifier` adlı, `master` worktree'sindeki bir rol tek alıcıya
  gönderdiğinde tetiklenir. Adı `analyst` yaparsan onay kapısı sessizce yok
  olur.
- **`coder`, `cleaner`** — conf'taki **son satır** kartı Done'a taşır
  (`last-pack-role?`). Sıralamayı değiştirirsen bitiş noktası değişir.

Yeni bir rol (`security`, `perf`, `docs`) eklemek istersen launcher'ı
düzenlemen gerekir; konfigürasyonla yapılamaz.

## Upstream'den ne değişti, neden

| Upstream | Bu kit | Neden |
|---|---|---|
| `crap4clj`, `dry4clj`, `clj-mutate` | JaCoCo, PIT, PMD CPD | Java'nın olgun standartları; kurumsal build'de zaten var, yeni bağımlılık onayı gerekmiyor |
| Gherkin / APS acceptance pipeline | Yok | Java tarafında karşılığı yok; `specifier` bunun yerine gözden geçirilebilir spec dokümanı yazıyor |
| "Java'da testleri Maven ile çalıştırmaktan kaçın, kendi test runner'ını yaz" | Silindi | Kurumsal Java'da aktif olarak zararlı. Projenin kendi build'i otoritedir |
| Mimari kurallar düzyazı | ArchUnit testleri | Kural, tur bitince de yürürlükte kalsın diye |
| Yok | Test döngüsü ekonomisi | Java build'i yavaş + audit gate her şeyi ikiye katlıyor; döngüde dar kapsamlı, handoff öncesi tam `verify` |
| Yok | Kurumsal guardrail'ler | Bağımlılık ekleme, sürüm değiştirme, CI/formatter config'e dokunma yasağı — upstream tek kişilik kişisel projeler için yazılmış |

`crap4java` opsiyonel bırakıldı: CRAP metriğinin Java'da yaygın bir karşılığı
yok ve araç gerçek (30 Java dosyası, JaCoCo üstüne kurulu, Mart 2026). Ama
kurulumunu ajana bırakmıyoruz — kurumsal makinede üçüncü parti araç kurulumu
operatörün kararı.

## Bilinen wart

Son rol hem `back-one` propagasyonu hem de `to: coder` başlığı taşıdığı için
`coder`'a aynı işin **iki merge-only kopyası** gider (biri `to:` başlığından,
biri `reverse-roles`'tan). İkisi de `non-forwarding` olduğu için zararsız —
coder ikisini de merge edip `done_with_current` çalıştırır — ama gereksiz bir
tur maliyeti. Upstream `two-pack` de aynı davranışı gösteriyor.
