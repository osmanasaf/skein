# DEVIR.md madde madde denetimi

Kart: `c-20261106-b6dc0e`. Önceki "taşıma denetimi" kartı `SAPMALAR.md`'yi
denetlemişti, `DEVIR.md`'yi değil — bu kart o boşluğu kapatıyor: `DEVIR.md`
baştan sona okundu ve **her maddesi** için üç olasılıktan biri verildi:
UYGULANDI (kanıtla), BİLEREK SAPILDI (`SAPMALAR.md` madde no), EKSİK (ne
yok + büyüklük).

## Yöntem

Denetim 7 paralel ajana bölündü (her biri DEVIR.md'nin bir bölümünü
okudu, `src/ui/page.ts`/`model.ts`/`server.ts`'te karşılığını buldu,
mevcut sınamaları OKUYARAK — isme güvenmeden — doğruladı, ve her
ölçülebilir iddiayı GERÇEK TARAYICIDA (Playwright/Chromium, `tarayici.
test.ts`'teki `serveUi`+`chromium.launch` kurulumu) ölçtü). Bu, SAPMALAR
§2.7'nin dersi: "nitelik doğru" ile "ekranda doğru" ayrı iddialardır —
kuşların `width="46"` niteliği doğruydu, ekranda 983×313 çiziliyordu ve
on kart boyunca kimse görmedi. Aşağıdaki her ölçü bu yüzden CSS metnine
değil `getBoundingClientRect()`/`getComputedStyle()`'a dayanıyor.

Geçici ölçüm sınamaları her ajan tarafından silindi/`git checkout`
edildi — denetim aşaması repoya iz bırakmadı. Bu karttaki KALICI
değişiklikler (4 küçük düzeltme + testleri + bir `SAPMALAR.md` maddesi)
"Bu kartta düzeltilenler" bölümünde ayrı listeleniyor.

**Sayım (ham, 7 ajanın bulduğu hal):** UYGULANDI 135 · BİLEREK SAPILDI 2
(+ bu kartta 1 yeni kayıt) · EKSİK 27 (4'ü büyük/orta, bu kartta
düzeltilmedi; 4'ü bu kartta düzeltildi; 19'u küçük test-boşluğu, bu
kartta düzeltilmedi — bkz. "Düzeltilmeyen küçük boşluklar").

---

## Genel yerleşim (üst çubuk)

| Madde | Durum | Kanıt |
|---|---|---|
| `.bar`, 2px alt kenar, padding 12/24, flex/wrap, gap 12/20 | UYGULANDI | `page.ts:486-490`. Ölçüldü: `borderBottomWidth` = **2px**. |
| Marka: 40×26 üç kuş SVG, stroke 2.5, "Skein" 800/22px/−0.03em | UYGULANDI | `page.ts:504-508`, `markaSvg()` (1662). Ölçüldü: `.marka svg` = **40×26px tam**. |
| Sekmeler: Pano/Akışlar/Promptlar/Ajanlar, 44px, 14px/700, aktif altı 4px | UYGULANDI | `page.ts:510-516`. Ölçüldü: `.navSekme-aktif` `borderBottomWidth` = **4px**. |
| Rozetler: Pano (accent), Akışlar (nötr), Promptlar (kaydedilmemiş), Ajanlar (accent) | UYGULANDI | `.navRozet-accent/-notr`, `kapidaBekleyenSayisi` (2589), `calisanAjanSayisi` (2594). DOM bağlantısı tek tek iz sürülmedi — kanıt orta. |
| Gözcü çipi: 2px kenar, 10px kare nokta, etiket+ok | UYGULANDI | `.pill`/`.dot` (538-549). Ölçüldü: `.dot` = **10×10px**, kenar **2px**. |
| Sayaçlar (açık/bitti/toplam maliyet, 13px neutral-700) | UYGULANDI (kanıt orta) | DOM var, tek tek px doğrulanmadı (zaman). |
| "Yeni kart" ana düğmesi, min-height 40px | UYGULANDI (adı/konumu belirsiz) | Formasyonun 44px accent "+" girişi (`formasyonSvgKur`) DEVIR'in "girişte +44px" maddesiyle örtüşüyor; üst çubukta AYRI bir "Yeni kart" düğmesi bu isimle bulunamadı. Davranış var (`yeniKartAc`), yerleşimi DEVIR'in tarif ettiği üst-çubuk konumuyla birebir değil — küçük, belirsiz; ayrı kart önerilir (ölçülmedi, kesin EKSİK denemez). |
| Tüm sayısal metinlerde `tabular-nums` | UYGULANDI | `.bar` (490) + `.meta`/`.iz .t`/`.dosya .a/.d` (1112, 1152, 1162-63) gibi birçok yerde tekrar tekrar. |

## 1. Pano — Başlık satırı

| Madde | Durum | Kanıt |
|---|---|---|
| Akış adı h1 (40px/800, −0.03em) | **EKSİK — BÜYÜK, ayrı kart** | `--fs-40` dosyada TEK yerde kullanılıyor: Akışlar sekmesinin h1'i. Pano'nun KENDİ h1'i yok; `.panoArac` (mono akış adı+hash, dropdown, 3 düğme) kullanılıyor. |
| "taslak · kaydedilmedi" etiketi | **EKSİK (başlık satırının doğal sonucu)** | `grep "taslak · kaydedilmedi"` → 0 sonuç. |
| Akış açıklaması (14px, neutral-700, max 58ch) | **EKSİK** | Pano'da yok (Akışlar sekmesinde var, farklı ekran). |
| "Rolleri düzenle" (secondary) + "Akış değiştir" (ghost) | **KISMEN — BÜYÜK, ayrı kart** | "Rolleri düzenle" VAR ve doğru çalışıyor (`duzenleAc()`). "Akış değiştir" YOK; yerine **"Akışı düzenle"** var ve bu ESKİ, Modernist-öncesi bir overlay (`.ust`/`.panel`/`.ed`/`.rol`) açıyor — kodun kendi yorumu bunu kabul ediyor: *"Akışı düzenle ESKİ overlay'i açıyor (henüz sökülmedi)"* (`page.ts:2745`). Üçüncü, DEVIR'de hiç olmayan bir "Promptları düzenle" düğmesi de var. |

**Bu kartta düzeltilen yan bulgu:** bu üç düğme (`.mini` sınıfı) GERÇEK
TARAYICIDA `border-radius: 3px` ölçüldü — DEVIR Fidelity'nin "köşe
yarıçapı: 0 (her yerde)" kuralının ölçülmüş ihlaliydi, SAPMALAR'da
kayıtlı bir sapma DEĞİLDİ. **Düzeltildi** (bkz. aşağı).

## 1. Pano — Formasyon diyagramı

| Madde | Durum | Kanıt (gerçek ölçüm) |
|---|---|---|
| Koordinat kutusu 1000×640, aspect-ratio, genişlik formülü | UYGULANDI | `page.ts:633`. Ölçüldü: dış svg 868×555.52px, oran **tam 1.5625 = 1000/640**. |
| Gövde çizgisi (2px, --color-text, 5 nokta) | UYGULANDI | `page.ts:4177-4182`, `vector-effect:non-scaling-stroke` ile 2px her ölçekte sabit. |
| Roller V üzerine `f=i/(n-1)` ile dizili | UYGULANDI | `rolKonumu(i,n)` (3599). |
| **Rol düğümü 64×44** (seçiliyse accent-100+2px kenar) | UYGULANDI | `page.ts:4286` öznitelik 64×44 TAM. Ölçüldü: 55.55×38.19px, oran **1000/640'a göre tam eşit (0.064/0.06875)** — bozulma YOK. |
| **Gömülü kuş 46×23**, polyline, stroke 4, miter — SAPMALAR §2.7 regresyonu | UYGULANDI, REGRESYON YOK | `page.ts:4292-4298` öznitelikler TAM eşleşiyor. Ölçüldü: 38.19×12.15px, polyline bbox'ıyla AYNI 0.868 ölçek faktöründe — iki boyut da örtüşüyor. **Pinli sınama** `tarayici.test.ts` "formasyon kuşu — çizilen boyut" (79/79 YEŞİL, bu denetimde tekrar koşuldu). |
| Kuş rengi: çalışan/kapıda→accent, kartı var→text, boş→neutral-600 | UYGULANDI (+ SAPMALAR §1) | `kusRengi()` (3621); boş-kuş rengi düzeltmesi `token-kontrast.test.ts` satır 202'de açık+koyu pinli. |
| Kanat çırpma: `.55s ease-in-out infinite alternate`, "animate" ile kapatılır | UYGULANDI | `page.ts:685`, `kanatCirpiyorMu()` (3679). |
| **`prefers-reduced-motion`** koruması (SAPMALAR §2.2) | UYGULANDI | `page.ts:688-690`. `tarayici.test.ts`: formasyon/Ajanlar kuşu/uçuş overlay'i için üçü de Playwright `reducedMotion` emülasyonuyla GERÇEKTEN sınanıyor. |
| Kart kareleri: 10px, 2px kenar | UYGULANDI | `page.ts:4306-4308`; SAPMALAR §1 kuyruk-kare kenar düzeltmesi `token-kontrast.test.ts:184`'te açık+koyu pinli. |
| Planlama bandı: 22px, accent-200, etiket 13px/600 accent-800 | UYGULANDI | `page.ts:4163` `strokeWidth="22"` TAM; `token-kontrast.test.ts:334` pinli. |
| Ret yayları: quadratic eğri, %60 kaydırma, 2px accent, ok başı, etiket | UYGULANDI | `retYayKontrol()` (4184-4211), `FORMASYON_RET_GOSTER` bayrağı. |
| İnsan onayı kapısı: dik 6px accent çizgi + etiket | UYGULANDI | `page.ts:4218-4232`, `strokeWidth="6"`. |
| Giriş: 44px accent "+" | UYGULANDI | `page.ts:4243`, `r=22`, klavye erişimi var. |
| Çıkış: 44×44 kutu, biten kart sayısı | UYGULANDI | `page.ts:4259`. |
| Lejant: çalışıyor/kapıda/kuyrukta/ret yolu + "okundu HH:MM · …" | BİLEREK SAPILDI (metin) | SAPMALAR §2.4: DEVIR'in "bu yüzey yalnızca okur" iddiası YANLIŞ; gerçek metin *"…durum `.skein/` ve `olaylar.jsonl`'dan okunuyor · değişiklik yalnızca düğmelerle"* (`page.ts:4358-4360`, birebir). Geri getirilmeyecek. |

## 1. Pano — Sağ panel modları 1/2/3

| Madde | Durum | Kanıt |
|---|---|---|
| Genel bakış: kapıda bekleyen 44px/800 accent + "kart kararını bekliyor" | UYGULANDI | `railGenelBakisCiz` (4443), `kapidaBekleyenSayisi`. |
| Kapı kartı: üst etiket 10.5px/600 büyük harf, başlık 15.5px/800, gerekçe en fazla 3 satır, çıkış düğmeleri | UYGULANDI (px'ler kanıt orta) | `railKapiKutu` (4405-4441). 3-satır kısıtı doğrulandı (`-webkit-line-clamp:3`); px değerleri tek tek doğrulanmadı — küçük boşluk. |
| Kapı kutusu üstte 4px accent çizgi | UYGULANDI | `page.ts:764` `border-top: 4px`. |
| "Uçuşta · N" + kart satırları (10px kare) | UYGULANDI | `page.ts:4460`, `railKartSatiri` (4379). |
| Rol modu: "← Genel bakış", "rol 0N · öncü", rol adı 30px, meta, "Prompt ·"/"Ajanı izle →" | UYGULANDI | `--fs-30` = 30px ölçüldü; metinler kanıt orta (tek tek grep edilmedi). |
| Kart modu: geri düğmesi, başlık 22px, meta, kapı kutusu, son ret, canlı adım, "Kartın izi", "Kodda ne değişti" | UYGULANDI (bkz. aşağı önemli not) | `.railKartBaslik{font-size:22px}` DOĞRU; `railKartCiz` (4571) `izZamanCizelgesiKur`/`kodDegisikligiKur`'u PAYLAŞIYOR — bu PAYLAŞIM, aşağıdaki büyük bulgunun kaynağı. |

### Bu kartta düzeltilen bulgu — "Kartın izi" düğümü (hem eski hem YENİ Kart modunda canlı)

DEVIR.md: *"Kartın izi … 52px saat sütunu, **10px düğüm**, **2px dikey
ray**"* + Interactions & Behavior: *"Tüm durum noktaları kare (10px, 2px
kenar); yuvarlak hiçbir şey yok."* `izZamanCizelgesiKur` (eski
`detayCiz`'den çıkarılıp YENİ `railKartCiz`'e de taşınan AYNI
fonksiyon — `page.ts` yorumu: *"sağ panelin Kart modu AYNI bloğu
kullanıyor"*) `.iz .t` **54px** (52 değil), `.iz .rail i` **9px
YUVARLAK kenarsız** (10px kare/2px kenar değil), `.iz .rail s` **1px**
(2px değil) çiziyordu. Hiçbir sınama bu GERÇEKTEN ÇİZİLEN şekli
ölçmüyordu — SAPMALAR §2.7'nin tam tarif ettiği boşluk türü, ve bu
widget Kart moduna her girişte (formasyon karesine ya da "Uçuşta"
satırına tıklandığında) görünür, nadir bir köşe değil.

**Düzeltildi** (dolgu rengi — `IZ_RENK` — KASITLI dokunulmadı, SAPMALAR
§1'in kuyruk-kare desenindeki gibi "dolgu anlam taşır, kenar şekli
sabitler" ilkesiyle): `.iz .t` 54→52px, `.iz .rail i` 9px
yuvarlak/kenarsız → 10px kare/2px `--color-text` kenar, `.iz .rail s`
1→2px. Mutasyon-sınandı (aşağı).

### Düzeltilmeyen, aynı köke bağlı not — "yetim kart"/"başka akışın kartı" bantları ve diff renkleri

- `kartIcerik`/`kartCiz` (Pano'nun "yetim kart" bantları) ve "Kartı
  panoda aç" (Ajanlar)/"başka akışın kartı" tıklaması `railKartCiz`'e
  GİTMİYOR — `location.hash="kart/"+id` → `detayAc` → `detayCiz` adlı,
  redesign-ÖNCESİ tam-ekran `.ust{position:fixed}` modalına gidiyor:
  `.panel h2` **18px** (DEVIR ölçeğinde YOK), `.card` **4px köşe**,
  `.trail i` **9px yuvarlak kenarsız** (yukarıdaki `.iz` ile AYNI kusur,
  AYNI nedenle düzeltilmedi — bu modal bütünüyle legacy, tek bir CSS
  satırı değil). **Büyük, ayrı kart gerekir.**
- "Yeni kart" iletişim kutusu da (`yeniKartAc`) DEVIR'in istediği
  `.dialog` deseni DEĞİL, AYNI eski `.ust`/`.panel`/`.exits`/`.err`
  çekmecesini kullanıyor.
- `kodDegisikligiKur`'daki `.dosya .a`/`.d` (diff +/−) rengi `--accept`
  (YEŞİL #2B6E45) / `--reject-ink` — DEVIR'in "dosya yolu, +eklenen,
  −silinen satır (**accent-700**)" metnine ve Modernist'in "tek vurgu
  rengi kırmızı" kuralına göre İKİSİ de accent-700 olmalıydı. Bu bir
  TASARIM KARARI gerektiriyor (yeşil/kırmızı diff okunabilirliği vs.
  tek-vurgu kuralı) — SAPMALAR'da kayıtlı değil, **bilerek bu kartta
  DÜZELTİLMEDİ**, karar gerektiren bir EKSİK olarak bildiriliyor.

Üçü de AYNI kökten (eski `.card`/`.iz`/`.trail`/`.dosya`/`.ust`/`.panel`
CSS bloğu, `--sp-*`/`--fs-title` gibi eski ölçek) besleniyor. Pano'nun
başlık-satırı eksiğiyle birleştirilip **tek büyük kart** olarak
ele alınmalı: (a) Pano başlık satırını DEVIR'e göre kur, (b) "Yeni
kart"ı `.dialog`'a taşı, (c) kart-tıklama yollarını `railKartCiz`'e
yönlendir, (d) diff renk kararını ver, (e) sonra eski `.ust/.panel/
.card/.exits/.redd` bloğunu SİL.

## Interactions & Behavior (genel)

| Madde | Durum | Kanıt |
|---|---|---|
| Kapı çıkışları `kapiCikislari` ile birebir | UYGULANDI | `kapiCikislari()` (1906), 4 kapı türü taşınmış. |
| Bildirim: sol altta, koyu zemin, 4px accent sol kenar, 3.4sn | UYGULANDI | `page.ts:1046-1051`, `setTimeout(...,3400)` (1977) — **tam 3.4sn**. |
| Escape dialogları kapatır | UYGULANDI | `kapat()` (2432), sekmeye göre ayrım kodlanmış. |
| Yeni kart dialogu: zorunlu alanlar, ilk role girer, "bekleyecek" bildirimi | UYGULANDI | `yeniKartAc()` (3391), `gozcuBeklemeSonucu()` (2621). |
| Tüm durum noktaları kare (10px, 2px kenar), yuvarlak YOK | **UYGULANDI (bu kart sonrası — önceden kısmi EKSİK)** | Üst çubuk `.dot` DOĞRUYDU; gözcü paneli `.railGozcuNokta` **14px** ölçülüyordu (üst çubukla tutarsız) ve "Kartın izi" `.iz .rail i` **9px yuvarlak kenarsız**ydı — İKİSİ bu kartta 10px/kare/2px-kenara düzeltildi. "Yetim kart" bandının `.trail i`'si (aynı kusur) legacy-modal kapsamında bilerek dokunulmadı (yukarı bkz.). |
| hover→neutral-200, focus→2px accent outline, disabled→%45 opaklık | KISMEN UYGULANDI | YENİ bileşenlerde (railBtn, formasyonDugum, vb.) tam; ESKİ bileşenler (`.exits button`, `.kaydet`, `.mini` vb.) farklı opaklık (%60/%50) kullanıyor, `:focus-visible` yok — legacy-kaldırma kartının parçası. |

## State Management (varlık denetimi)

DEVIR'in listesi kavramsal; `page.ts` Türkçe adlarla karşılıyor — isim
farkı EKSİK sayılmadı, davranış denetlendi:

| DEVIR.md anahtarı | Kod karşılığı | Durum |
|---|---|---|
| flows / flow | `AKISLAR` (1584) / `SON_MODEL.flow` | UYGULANDI |
| draft / editFocus | `TASLAK` (3377) / `DUZENLE_VURGU` | UYGULANDI |
| cards / rail / tab | `SON_MODEL.cards` / `RAIL` (3880) / `sekmeAdi(hash)`'ten türetilmiş | UYGULANDI |
| daemon / daemonSince / topoChanged | `SON_MODEL.daemon` + `gozcuTopoUyari()` (2548), türetilmiş — ayrı bayrak yok | UYGULANDI (kavramsal eşdeğer) |
| prompts / promptSel | `PROMPTLAR` (6262) / `PROMPT_SEC` (6263) | UYGULANDI |
| promptDrafts | ayrı bir harita bulunamadı (zaman kısıtı) | EKSİK/not — küçük, davranış (kaydedilmemiş işareti) ÇALIŞIYOR, yalnızca tekil değişken adı doğrulanamadı |
| steps / agentSel | `AJAN_ADIMLAR` (1613) / `AJAN_SEC` (1608) | UYGULANDI |

---

## 2. Gözcü paneli

| Madde | Durum | Kanıt |
|---|---|---|
| **on**: "gözcü açık" / nokta accent / "Gözcüyü durdur" (secondary) | UYGULANDI | `gozcuPanelDurum`/`gozcuEylemEtiketi`. `tarayici.test.ts` "yönetilen ekranda kapalıyken panelden başlatmak…" — YEŞİL (bu denetimde tekrar çalıştırıldı). |
| **stopping**: "gözcü duruyor…" / nokta neutral-500+kenar / eylem devre dışı "Süren tur bitiyor…" | UYGULANDI | `tarayici.test.ts` "…'Süren tur bitiyor…' gösterir" — YEŞİL (tekrar çalıştırıldı). `token-kontrast.test.ts` "SAPMALAR §4" açık+koyu pinli. |
| **off**: "gözcü kapalı" / nokta neutral-400+kenar / "Gözcüyü başlat" (primary) | UYGULANDI | `gozcuPanelDurum`. `tarayici.test.ts` satır 807-808 metni doğruluyor. |
| **stale**: "gözcü çökmüş" / nokta text+accent çip kenarı / "Kilidi devral ve başlat" | UYGULANDI | `tarayici.test.ts` "bayat kilitte gözcü düğmesi 'başlat' diyor" — **ŞU AN tekrar çalıştırıldı: 1 passed**. Koyu temada nokta kontrastı ölçüldü: **16.57:1**. |
| **unmanaged**: "gözcü · elle" / nokta neutral-400 / düğme YOK, iki komut bloğu | UYGULANDI | `tarayici.test.ts` "unmanaged: düğme yok, iki komut" — **ŞU AN tekrar çalıştırıldı: 1 passed**. |
| Bilgi tablosu: 84px etiket + pid/akış/mod/açıldı/kilit | UYGULANDI (tek-tek assert EKSİK, küçük) | `railGozcuCiz:5506-5519`, 5 satır DEVIR'le birebir; CSS grid doğrulandı, 5 satırı birlikte assert eden sınama yok. |
| Gözcüye geçen bayraklar `.tag.tag-outline` | UYGULANDI, **SINAMASI YOK (küçük)** | `railGozcuCiz:5522-5526`. GERÇEK TARAYICIDA ölçüldü, ÇALIŞIYOR — ama `page.test.ts`/`tarayici.test.ts`/`server.test.ts` içinde render'ı doğrulayan satır yok (yalnızca JSON-gömme sınanıyor). SAPMALAR §2.7 sınıfı risk. |
| `.skein/gozcu.log`: saat+mesaj, hata accent-700 | UYGULANDI (render sınaması yok, küçük) | `gozcuLogSatiriAyristir` (server.ts:308). Koyu temada ölçüldü: **12.50:1**. |
| Topoloji uyarısı: çip "gözcü · yeniden başlat"+accent kenar, panel kutusu+"Yeniden başlat" | UYGULANDI | `gozcuTopoUyari()`, `tarayici.test.ts` "topoloji uyarısı…" + "gözcü GERÇEKTEN ölünce 'Yeniden başlat' otomatik tetikler" (DEVIR'de adı geçmeyen bir ek güvence, not edildi). |
| "Davranış server.ts/page.ts testleriyle uyumlu olmalı" | UYGULANDI | Aşağıdaki üç kritik güvence. |

### SAPMALAR §2.6 — üç davranış güvencesi, tek tek `-t` ile bu denetimde tekrar koşuldu

1. "Bayat kilitte düğme 'durdur' DEMEZ" → `tarayici.test.ts -t "bayat kilitte gözcü düğmesi"` → **1 passed**.
2. "Başka ekranın gözcüsü DURDURULMAZ" (unmanaged) → `-t "unmanaged: düğme yok"` → **1 passed**.
3. "Durdurma 'süren turu bitirecek' der" → `-t "Süren tur bitiyor"` → **1 passed**.

Üçü GERÇEKTEN yeşil — "var" diye değil, çalıştırılıp görüldü.

### SAPMALAR §2.5 (koyu tema, gözcü kapsamı)

`token-kontrast.test.ts` ilgili token'ları (`daemon-dot-off-fill`,
`daemon-dot-stopping-fill`, `--color-text`, `--label-ink`, log-hata
rengi) açık+koyu AYRI haritalarla ölçüyor (satır 393-434) — kodu okundu,
isme güvenilmedi. **Ölçülmeyen tek nokta:** `.railGozcuKomut`'un koyu
render'ı (unmanaged kod blokları) — küçük boşluk.

---

## 3. Rolleri düzenle

| Madde | Durum | Kanıt |
|---|---|---|
| Üst bilgi: `hub/flows/<ad>.yaml` yolu, "Roller" başlığı, açıklama | UYGULANDI | `railDuzenlePaneliCiz:5336-5339`. |
| Numara, ad girişi (`a-z0-9-`), ↑↓✕ (36px) | UYGULANDI, ÖLÇÜLDÜ | `.duzenleIkon` **36×36px, radius 0px** (gerçek tarayıcı). `duzenleAdSanitize` (4766) sınamasız (küçük). |
| Ad değişince reject/planlama.katilimcilar/denetci güncellenir | UYGULANDI, SAĞLAM | `page.test.ts:1505` ÜÇÜNÜ ayrı ayrı sınıyor + "ilgisiz rolü değiştirmez" + "boş ad yok sayılır" + "aynı ad dokunmaz" — okunup doğrulandı. |
| 2×2 ızgara (sağlayıcı/çalışma alanı/alım/ret yolu) | UYGULANDI | `.duzenleIzgara` (902), sıra DEVIR'le eşleşiyor. |
| Sağlayıcı seçenekleri | **BİLEREK SAPILDI (bu kartta SAPMALAR'a eklendi)** | Sabit 4'lü DEĞİL, `knownProviderSet()`'ten (bugün claude/codex) — "yapamayacağı şeyi vaat eden düğme" kusur sınıfından kaçınma. **SAPMALAR.md §5 olarak bu kartta kayda geçirildi** (önceden belgesiz bir sapmaydı). |
| Alım segment (2px kenar, seçili koyu zemin) | UYGULANDI, ÖLÇÜLDÜ | `.duzenleSegment{border:2px}` (916), kenar+radius 0px ölçüldü. Tıklama davranışı browser'da sınanmıyor (küçük). |
| Ret yolu: yalnız önceki roller ya da "yok" | UYGULANDI | `page.ts:5187-5189`. |
| Prompt seçimi + "Aç" | UYGULANDI, ÇALIŞIYOR | `duzenlePromptAlani` (5027); "Aç" tıklaması sınanmıyor (küçük). |
| Planlamaya katılım: ilk yazar, kesintisiz önek | UYGULANDI, SAĞLAM | `duzenlePlanlamaAyarla` saf sınaması `page.test.ts:1613`. |
| "devreder → sonraki" etiketi | UYGULANDI (metin sınaması yok, küçük) | `page.ts:5068-5071`. |
| Diyagram tıklaması → panel vurgusu | UYGULANDI, SAĞLAM | `tarayici.test.ts:2964`, panel AÇIK KALDIĞI da doğrulanıyor. |
| "Rol ekle" | UYGULANDI, ÇALIŞIYOR — **sınaması yok (küçük-orta)** | `duzenleRolEkle` (5199), gerçek tarayıcıda denendi (2→3 rol). |
| Planlama özeti / tur stepper (1-5) / denetçi seçimi | UYGULANDI | `duzenlePlanlamaOzet` sınandı (1681); `duzenleStepper`'ın KENDİSİ (min/max disabled) sınanmıyor (küçük, iki yerde kullanılıyor: tur+ret). |
| Ret limit stepper (1-5), "onExhausted: gate" açıklaması | UYGULANDI | `duzenleRetBolumuCiz` (5117). |
| Hata: boş ad / aynı ad | UYGULANDI (boş-ad saf sınaması yok, küçük-orta) | Aynı-ad `tarayici.test.ts:2824` SAĞLAM; boş-ad yalnızca kod okumasıyla doğrulandı. |
| Uyarı: açık kartı olan rol silinirse (engellemez) | UYGULANDI, SAĞLAM | `tarayici.test.ts:2861`, negatif iddia (`.duzenleHata` sayısı 0) de kontrol ediliyor. |
| "YAML'ı göster" önizleme, diske YAZMAZ | UYGULANDI, ÇALIŞIYOR — negatif-güvence sınaması yok (küçük) | `duzenleOnizlemeYukle` (5244), `/akis/onizleme` (SAPMALAR §3, zaten var). |
| Sabit alt çubuk: durum/Vazgeç/Kaydet | UYGULANDI | `duzenleAltCubukGuncelle` (5265); "Vazgeç" hiç tıklanmamış (küçük-orta). |
| Normalizasyon: next zinciri + referans temizliği | UYGULANDI, EN SAĞLAM BÖLÜM | `page.test.ts` "duzenleSil" describe'ı (1557) BEŞ referans türünü ayrı sınıyor + uçtan-uca disk kanıtı (`tarayici.test.ts:2952`). |
| SAPMALAR §2.3 (`/akis/yaz`, `/akis/onizleme` token+origin) | UYGULANDI | `server.ts:739-745` `yetkili()`. |
| SAPMALAR §1/§2.5 (accent-700 metinler, açık+koyu) | UYGULANDI | `token-kontrast.test.ts:339-344`. |

**Not (risk, madde değil):** `<select>` köşe-0'ı tarayıcının native
widget varsayılanına dayanıyor (`appearance:none` yok) — DEVIR bunu
tartışmıyor, kapsam dışı ama bildiriliyor.

---

## 4. Akışlar

| Madde | Durum | Kanıt |
|---|---|---|
| h1 "Akışlar" + açıklama + "Yeni akış" (primary) | UYGULANDI | `.akislarBaslik h1` ölçüldü: **40px/800/−0.03em**. |
| Kart ızgarası `auto-fill, minmax(300px,1fr)` | UYGULANDI | 1280px'de 4×311.5px sütun, GERÇEK hesaplanmış stil. |
| Kartlar 2px ayırıcı | UYGULANDI | Ölçüldü: **2px**. |
| 200×110 mini formasyon (`preserveAspectRatio="none"`) | UYGULANDI, §2.7 regresyonu YOK | Ölçüldü: ÇİZİLEN **200×110px tam**, nitelikle birebir. |
| ad (20px/800), "panoda" etiketi, rol sayısı | UYGULANDI | Ölçüldü: **20px/800**. |
| açıklama | UYGULANDI (düşüş yolu sınanmamış, küçük) | `"(açıklama yok)"` yolu hiçbir testte denenmemiş. |
| "planner → … → bitti" zinciri | UYGULANDI, SAĞLAM | `page.test.ts` 3 sınama (sıra/tek rol/boş liste). |
| "Panoda aç" / "Rolleri düzenle" / "Kopyala" | **KISMEN EKSİK (küçük)** | İlk ikisi sınandı. **"Kopyala" hiçbir testte geçmiyor** (`grep -i kopyala` → 0) — kod var (disabled-when-broken, dialog ön-doldurma), kanıtlanmamış. |
| Paneldeki akışın accent-100 vurgusu | UYGULANDI, SAĞLAM | `akisKartSinifi()` saf sınaması + 109 token-kontrast sınaması. |
| Yeni akış dialog: `.dialog`, 4px text çizgisi | UYGULANDI | Ölçüldü: **4px, rgb(32,30,29)=--color-text**. |
| … ad (benzersiz, `a-z0-9-`), açıklama, şablon | UYGULANDI, SAĞLAM | `page.test.ts` 7 sınama (istemci) + sunucu `hedefAkisYolu` AYNI regex ile ikinci katman. |
| "Oluştur ve düzenle" → Pano'da editör | UYGULANDI, SAĞLAM | `tarayici.test.ts` uçtan-uca: dosya diskte, editör Pano'da. |

### Bu kartta düzeltilen bulgu — "Yeni akış" hata kutusu

`yeniAkisAc()` hata kutusu ESKİ `.err` sınıfını kullanıyordu:
`border-radius: 4px`, `--gate-bg/--gate-line/--gate-ink` (turuncu
palet) — DEVIR Fidelity'nin "köşe yarıçapı 0" ve "tek vurgu rengi
kırmızı" kurallarının İKİSİNİ de çiğniyordu, SAPMALAR'da kayıtlı değildi.
`.err`'ün KENDİSİ değiştirilmedi (eski `.ust/.panel` çekmecesi hâlâ ona
bağlı — legacy-kaldırma kartının parçası); `.dialog .err` kapsamlı bir
override eklendi, `.akisKartHata`'nın ZATEN kullandığı accent-100/
accent-700/accent-800 çiftiyle (yeni renk YOK). Mutasyon-sınandı (aşağı).

---

## 5. Promptlar

| Madde | Durum | Kanıt |
|---|---|---|
| Sol liste 320px, iki grup (Anayasa/Rol promptları) | UYGULANDI | Ölçüldü: **320px**. |
| Kullanım bilgisi ("N rol · M akış"/"kullanılmıyor") | UYGULANDI | Gerçek veriyle doğrulandı. |
| Kaydedilmemiş işareti (8px kare) | UYGULANDI | Ölçüldü: **8×8px**. |
| Seçili öğe: 4px accent sol kenar + accent-100 | UYGULANDI | Ölçüldü. |
| "Yeni rol promptu" + şablon (Sahiplendiğin/Sahiplenmediğin) | UYGULANDI | Şablon metni doğrulandı. |
| Dosya adı (26px) + yolu | UYGULANDI | Ölçüldü: **26px**. |
| "Kullanan" satırı + tıklanınca rolü panoda açma | UYGULANDI | |
| "Ajanın okuduğu sıra" şeridi (base→engineering-ts→rol→kart) | UYGULANDI | |
| Metin alanı: monospace, 13.5px/1.6 | UYGULANDI | Ölçüldü: **13.5px, line-height 21.6px (=1.6), monospace**. |
| Sabit alt çubuk: durum/Geri al/Kaydet | UYGULANDI | |
| Köşe yarıçapı 0 (bu ekranda) | UYGULANDI | Süpürüldü, ihlal yok. |

**SAPMALAR §2.3 — KRİTİK, doğrulandı:** `/prompt/yaz` VE `GET /prompt`
yol beyaz listesi **`===`** ile karşılaştırıyor (`server.ts:873,1200`),
`endsWith` DEĞİL. `server.test.ts`'in "BİTEN dış yolu" saldırı sınaması
bu denetimde canlı çalıştırıldı: **1 passed**.

**SAPMALAR §4** doğrulandı: `git log -- hub/prompts/` bu iş dizisinde o
klasöre dokunan commit YOK — rol promptlarının İÇERİĞİ değişmedi.

0 EKSİK, 0 BİLEREK SAPILDI — bu bölüm denetimin en temiz sonucu.

---

## 6. Ajanlar

| Madde | Durum | Kanıt |
|---|---|---|
| Sol liste 340px | UYGULANDI | Ölçüldü: **340px**. |
| Her rol: 36px kuş + kanat çırpma | UYGULANDI, §2.7 regresyonu YOK | Ölçüldü: **36×18px** (46:23 oranı korunmuş), `.ajanKus` doğrudan sınıf, torun-seçici çakışması yok. |
| Durum metinleri (5'i): "Bash · …", "kapıda bekliyor · …", "N kart kuyrukta", "boşta", "gözcü kapalı · … yarıda" | UYGULANDI, HEPSİ SINANDI | `page.test.ts` "ajanDurumMetni — DEVIR.md §6'nın beş durum metni" + uçtan-uca `tarayici.test.ts`. Bayat-kilit dalı AYNI tek karar fonksiyonundan (`ajanSuAnDurumu`) okunuyor — sol satır/"Şu an" kutusu çelişkisi İMKANSIZ (kart `b64fe2f`'in itirazına kalıcı yanıt). |
| Üst bilgi: no+akış, rol adı 36px, meta (4 alan) | UYGULANDI | Ölçüldü: **36px**. |
| "Şu an" kutusu: surface zemin, 4px accent çizgi (koşarken/kapıda), başlık 20px/800 | UYGULANDI | Ölçüldü: **4px**, **20px/800**. |
| "Şu an" kutusu: adım/araç/süre/maliyet, "Kartı panoda aç" | UYGULANDI (düğme tıklaması sınanmamış, küçük) | |
| "Adımlar": seq/araç/ayrıntı/saat, en yeni üstte, "canlı" etiketi | UYGULANDI, SAĞLAM | Sıra GERÇEKTEN tarayıcıda iki adımla doğrulandı. |
| "Görevi · promptundan": giriş paragrafı, ilk `##` max 5 madde, "Promptu düzenle →" | UYGULANDI, SAĞLAM (düzenle-düğmesi sınanmamış, küçük) | `page.test.ts` "promptGorevOzeti" 9 senaryo, 5-sınırı AYRICA sınanıyor. |
| Lucide çizgileriyle uyumlu ikonlar (plus/pencil/chevron/arrow/x) | **EKSİK — ORTA, ayrı kart** | Kodda düz Unicode karakter (`+`, `✕`, `→`, `←`), 6+ dağınık çağrı yeri, hiçbiri stroke-tabanlı SVG değil. "pencil" hiç kullanılmıyor. SAPMALAR'da kayıtlı değil — gerçek boşluk, operatöre işlevsel kayıp yok (görsel dil zaten tutarlı) ama DEVIR'in lafzıyla örtüşmüyor. |
| Assets: SVG kod içinde üretiliyor, `prompts/` örnek içerik | UYGULANDI | `sv()` (3475); `hub/prompts/roles/` dosyalarına dokunulmadı. |

**SAPMALAR §3** doğrulandı: `GET /adimlar` GERÇEKTEN yeni (server.ts
yorumu açıkça söylüyor), var olan bir uç yeniden icat edilmemiş;
`buildSteps` alanları (`seq,kind,name,detail,at`) DEVIR'in istediğiyle
birebir.

---

## Fidelity + Design Tokens (kesişen, genel)

| Madde | Durum | Kanıt |
|---|---|---|
| Düz yüzeyler, sıfır köşe yarıçapı HER YERDE | **EKSİK (kısmi) — bu kartta 2 örneği düzeltildi, kökü büyük** | YENİ Modernist bileşenlerin TÜMÜNDE 0 (grep'le doğrulandı). ESKİ CSS bloğu (`.card` 4px, `.panel h2` 18px, `.exits button` 3px, vb.) CANLI ve iki giriş noktasından (legacy "Kart" modalı, "Yeni kart" dialogu) erişiliyor — büyük, ayrı kart. Bu denetimde bulunan ve DÜZELTİLEN iki örnek (`.mini` 3px, `.iz .rail i` 50%) kapsam dışı değildi çünkü ikisi de o an AKTİF ekranlarda (Pano araç satırı, YENİ Kart modu) görünüyordu. |
| 2px ayırıcı çizgiler | UYGULANDI | `--border-section:2px`. |
| Tek vurgu rengi kırmızı | UYGULANDI (Modernist katmanda) — EKSİK (eski katmanda, bkz. not) | Modernist bloğunda ikinci marka rengi YOK. Eski `--gate`/`--accept`/`--reject` palet üçlüsü (turuncu/yeşil/kırmızı) hâlâ `IZ_RENK`, diff +/−, `.card.gate` gibi canlı yerlerde kullanılıyor — karar gerektiren EKSİK, bu kartta düzeltilmedi (yukarı bkz.). |
| Tüm etiketler sola yaslı (düğmeler dahil) | UYGULANDI (örneklemle) | Taranan Modernist düğmelerde ihlal yok; tam tarama yapılmadı (küçük risk). |
| Renk paleti (17 hex) | UYGULANDI | Hepsi harfi harfine eşleşiyor. |
| Tipografi ölçeği (16 basamak) | **EKSİK (kısmi)** | Modernist ölçek tam ve kullanımda; ESKİ ölçek (`--fs-title:14.5px`, `--fs-panel-title:18px` vb.) hâlâ tanımlı ve legacy `.card h3`/`.panel h2`'de CANLI — aynı legacy-kaldırma kartının parçası. `--fs-brand`/`--fs-stat` ÖLÜ token (0 kullanım), etkisiz. |
| Küçük büyük harf etiket deseni (10px/600, .1em) | UYGULANDI | Birçok seçicide birebir tekrarlanıyor. |
| Boşluk ölçeği (7 basamak) | UYGULANDI (Modernist katmanda) | Eski `--sp-*` ölçeği (4/6/8/10/12/14/16/18/20/24) aynı legacy bloğun parçası olarak hâlâ kullanımda — ayrı madde açılmadı, yukarıdaki köşe-yarıçapı bulgusuyla AYNI kök. |
| Gölge yalnızca dialog+bildirimde | UYGULANDI | Dosyada TOPLAM 2 `box-shadow`, ikisi de DEVIR'in `--shadow-lg` tanımıyla birebir. |
| Çizgi kalınlıkları (2/1/4px) | UYGULANDI | `--border-section/-row/-accent` isimleri bile DEVIR metnini yansıtıyor. |
| `tabular-nums` her yerde | UYGULANDI (örneklemle) | Taranan tüm sayısal span'lerde var. |

---

## Bu kartta düzeltilenler (küçük, mutasyon-sınandı)

Dört ölçülmüş Fidelity ihlali — her biri SAPMALAR §1'in deseniyle
(dolgu/renk mantığına DOKUNMADAN yalnızca şekil/ölçü) düzeltildi, yeni
bir tarayıcı sınamasıyla pinlendi, ve **önce kırmızı, düzeltilince
yeşil** olacak şekilde elle mutasyon-sınandı (değer geri alınıp
`npx vitest run -t "<isim>"` ile doğrulandı, sonra tekrar düzeltildi):

| # | Ne | Önce | Sonra | Yeni sınama | Mutasyon |
|---|---|---|---|---|---|
| 1 | `.railGozcuNokta` (gözcü panelinin ANA durum göstergesi) | 14×14px | **10×10px**, 2px kenar (değişmedi) | `tarayici.test.ts` "gözcü panelindeki durum noktası 10×10px…" | 14px'e geri alındı → kırmızı (`14≠10`) → 10px'e düzeltildi → yeşil |
| 2 | `.mini` (Pano araç satırının 3 düğmesi) | `border-radius:3px` | **0px** | `tarayici.test.ts` "…düğmesi köşesiz (DEVIR.md Fidelity)" | 3px'e geri alındı → kırmızı (`3px≠0px`) → 0'a düzeltildi → yeşil |
| 3 | `.iz .rail i`/`.iz .t`/`.iz .rail s` ("Kartın izi" düğümü, Kart modunda canlı) | 9px yuvarlak kenarsız, 54px, 1px ray | **10px kare, 2px `--color-text` kenar**, 52px, 2px ray | `tarayici.test.ts` "'Kartın izi' düğümü kare, 10px, 2px kenarlı (yuvarlak DEĞİL)" | eski değerlere geri alındı → kırmızı (9/0px/50%) → düzeltildi → yeşil |
| 4 | `.dialog .err` ("Yeni akış" hata kutusu) | `.err` (4px köşe, `--gate-*` turuncu) | **0px köşe, accent-100/700/800** (scoped override, `.err`'ün kendisi DEĞİŞMEDİ) | `tarayici.test.ts` "'Yeni akış' kutusunun hata kutusu köşesiz ve tek-vurgu (accent) paletinde" | override devre dışı bırakıldı → kırmızı (`4px≠0px`) → geri eklendi → yeşil |

Ayrıca: `SAPMALAR.md`'ye yeni **§5** eklendi (sağlayıcı listesinin sabit
4'lü olmadığı, önceden belgesiz bir sapmaydı — bkz. §3 tablosu).

**Doğrulama (bu kart, son hal):**
- `npx tsc --noEmit` → temiz.
- `npx vitest run` → **1637/1637 geçti** (64 dosya), yeni 4 sınama dahil.
- Her 4 düzeltme için mutasyon denemesi yukarıdaki tabloda: kırmızı→yeşil GERÇEKTEN gözlendi, "takım yeşil" tek başına kanıt sayılmadı.

---

## Ayrı kart gerekir (büyük, bu kartta YAPILMADI)

1. **Pano başlık satırı + legacy kart-modalı/legacy "Yeni kart" dialogu
   + diff renk kararı — TEK kart.** Üçü AYNI eski `.ust/.panel/.card/
   .iz/.trail/.dosya/.exits/.redd` CSS bloğuna ve `--sp-*`/`--fs-title`
   ölçeğine bağlı: (a) DEVIR'in Pano başlık satırını (h1 40px, taslak
   etiketi, açıklama, "Rolleri düzenle"+"Akış değiştir") kur, (b) "Yeni
   kart"ı `.dialog`'a taşı, (c) "Kartı panoda aç"/"yetim kart" tıklamasını
   `railKartCiz`'e yönlendir, (d) diff +/− renklerinin tek-vurgu kuralına
   mı uyacağına yoksa yeşil/kırmızının mı kalacağına karar ver, (e) bu
   dört adım bittiğinde eski bloğu SİL. En büyük, en riskli iş — tek
   kartta yapılmaz.
2. **Lucide-uyumlu ikonlar.** Düz Unicode karakterleri (`+`,`✕`,`→`,`←`)
   stroke-tabanlı SVG ile değiştirmek, 6+ çağrı yerinde tutarlı biçimde.
3. **Üst çubuktaki `--bg` (eski, mavimsi "gökyüzü" paleti) `body`
   zemininde hâlâ aktif** — DEVIR Design Tokens'ın "zemin `#f3f2f2`"
   maddesine karşı, kod yorumunda açıkça kabul edilmiş ("henüz
   göçmedi"). UX.md 3.2 ile aynı gözlem, bağımsız olarak bu denetimde de
   doğrulandı. Legacy-kaldırma kartının bir parçası olabilir.

## Düzeltilmeyen küçük boşluklar (test-kapsamı, davranış ÇALIŞIYOR)

Aşağıdakiler DEVIR.md maddeleri olarak UYGULANDI sayıldı (kod okunarak
ve/veya gerçek tarayıcıda elle denenerek davranış doğrulandı) ama
koruyucu bir otomatik sınamaları YOK. Hacim (19 madde) ve her birinin
gerçek kurulum gerektirmesi ("1-2 satır" değil, genelde 10-20 satır
test-scaffolding) nedeniyle bu kartta TOPLU olarak eklenmedi — bu bir
ihmal değil, bilinçli bir sınır: yukarıdaki 4 gerçek DEFEKT (davranış
yanlıştı) ile bu liste (davranış doğru, kanıtı yok) ayrı risk
sınıflarıdır, SAPMALAR §2.6'nın kendi dersi de bunu ayırıyor. Önerilen:
ayrı bir "test kapsamı tamamlama" kartı.

- Gözcü: bayraklar render'ı, bilgi tablosu 5 satırı, log hata render'ı, "on" panel-noktası kontrastı, `.railGozcuKomut` koyu render'ı (5).
- Rolleri düzenle: `duzenleAdSanitize`, `duzenleTasi` (↓), segment tıklaması, "Aç" tıklaması, "devreder→sonraki" metni, "Rol ekle" ucu, `duzenleStepper`, denetçi seçim kutusu DOM'u, boş-ad `duzenleHatalari`, "Vazgeç", önizleme-diske-yazmaz negatif-güvencesi (11).
- Akışlar: "Kopyala" düğmesi, "(açıklama yok)" düşüş yolu (2).
- Ajanlar: "Kartı panoda aç" tıklaması, "Promptu düzenle →" tıklaması (2, not olarak — küçük risk).
- State: `promptDrafts` eşdeğeri tekil değişken adı doğrulanamadı (1).

---

## Özet

| | UYGULANDI | BİLEREK SAPILDI | EKSİK (büyük/orta, ayrı kart) | EKSİK (bu kartta düzeltildi) | EKSİK (küçük, test-boşluğu, düzeltilmedi) |
|---|---|---|---|---|---|
| Genel yerleşim + §1 Pano + I&B + State | 27 | 1 (lejant metni) | 2 (başlık satırı+legacy modal/dialog, kısmen) | 2 (`.mini`, `.iz` düğümü) | birkaç (px kanıtı orta) |
| §2 Gözcü | 19 | 0 | 0 | 1 (`.railGozcuNokta`) | 5 |
| §3 Rolleri düzenle | 27 | 1 (sağlayıcı listesi, bu kartta SAPMALAR'a eklendi) | 0 | 0 | 11 |
| §4 Akışlar | 14 | 0 | 0 | 1 (`.dialog .err`) | 2 |
| §5 Promptlar | 13 | 0 | 0 | 0 | 0 |
| §6 Ajanlar + Assets | 22 | 0 | 1 (Lucide ikonlar) | 0 | 2 |
| Fidelity/Design Tokens (genel) | 13 | 0 | 1 (eski renk/ölçek/köşe bloğu — başlık-satırı kartıyla BİRLEŞİK) | — | 1 (promptDrafts) |

**Toplam:** UYGULANDI **135**, BİLEREK SAPILDI **2** (+bu kartta 1 yeni
kayıt = SAPMALAR §5), bu kartta **4 defekt düzeltildi** (mutasyon-
sınandı), **3 büyük** iş ayrı karta bırakıldı, **19 küçük** test-boşluğu
kataloglandı ama eklenmedi (gerekçe yukarıda).

**En önemli üç bulgu (bu denetimin kendisinden):**
1. DEVIR.md'nin Pano başlık satırı hiç kurulmadı; "Akışı düzenle" ve
   "Yeni kart" hâlâ redesign-öncesi bir overlay/çekmece açıyor, ve kart
   tıklamalarının bir kısmı (yetim kart, "Kartı panoda aç") YENİ "Kart"
   moduna değil o eski modalına gidiyor — kod bunu kendi yorumlarında
   açıkça kabul ediyor, gizli bir kusur değil.
2. SAPMALAR §2.7'nin uyardığı kusur sınıfı ("nitelik doğru, ekranda
   yanlış") bu denetimde İKİ YERDE TEKRAR bulundu (`.railGozcuNokta`
   14px, "Kartın izi" düğümü 9px-yuvarlak) — ikisi de hiçbir sınamanın
   bakmadığı GERÇEK ÇİZİLEN ölçülerdi, ikisi de bu kartta düzeltildi ve
   artık pinli.
3. Formasyon diyagramının kendisi (DEVIR'in en ayrıntılı, en riskli
   bölümü: 64×44 düğüm, 46×23 kuş, 22px bant, ret yayları, reduced-
   motion) GERÇEK TARAYICIDA ölçülüp TAMAMEN doğrulandı — on kartlık
   koşunun asıl kusuru (kart c-20261105 serisindeki 21-kat büyüme) BU
   denetimde YOK, düzeltme kalıcı.
