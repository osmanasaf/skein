# Handoff: Skein Merkez — kaz sürüsü panosu

## Overview
Skein'in yerel operatör ekranının (`src/ui/page.ts` + `model.ts` + `server.ts`) yeniden tasarımı. Akış, roller V formasyonunda uçan bir kaz sürüsü olarak çiziliyor. İnsan kararı bekleyen kartlar sağ panelde öne çıkıyor. Dört bölüm var: **Pano · Akışlar · Promptlar · Ajanlar**. Gözcü (daemon) yönetimi ve akış/rol düzenleyicisi de ekranın içinde.

## About the Design Files
Bu paketteki dosyalar **HTML ile yapılmış tasarım referanslarıdır**. Görünüşü ve davranışı gösteren prototiplerdir, üretim kodu değildir. Görev, bunları Skein deposunun mevcut ortamında yeniden kurmaktır: bağımlılıksız, tek dosyalık `src/ui/page.ts` yaklaşımı ve `server.ts` uçları korunur. `.dc.html` dosyaları `support.js` çalışma zamanıyla tarayıcıda açılır, ama bu yapı ürüne taşınmaz.

- `Skein Merkez v3.dc.html` en güncel ve **asıl referans**. Önizleme ortamında açılırken takılma görüldü; sebebi kesinleşmedi, önizleme sürecinin kendisi de takılmıştı. Açılmazsa v2'ye ve bu README'ye dayan.
- `Skein Merkez v2.dc.html` yalnızca Pano'yu içerir: formasyon, sağ panel, gözcü, rol düzenleyici. v3 bunun üstüne sekmeleri ekler.
- Örnek veriler (kartlar, ajan adımları, günlük satırları) uydurmadır. Gerçek veri `buildModel()` ve olaylar.jsonl'den gelir.

## Fidelity
**High-fidelity.** Renkler, tipografi, kurallar ve etkileşimler nihai. Görsel dil Modernist tasarım sistemidir:
- düz yüzeyler, **sıfır köşe yarıçapı**,
- 2px ayırıcı çizgiler,
- tek vurgu rengi kırmızı,
- tüm etiketler sola yaslı, düğmelerin içindekiler dahil.

## Genel yerleşim
- **Üst çubuk** (`border-bottom: 2px solid --color-text`, padding 12px 24px, öğeler flex ve wrap, gap 12px 20px). Soldan sağa:
  - Marka: 40×26 üç kuş SVG'si (vurgu renginde, stroke 2.5) ve "Skein" (800, 22px, letter-spacing −0.03em).
  - Sekmeler: Pano, Akışlar, Promptlar, Ajanlar. Her biri 44px yüksek, 14px/700. Aktif sekmenin altında 4px vurgu çizgisi var. Rozetler: Pano'da kapıdaki kart sayısı (kırmızı zemin), Akışlar'da akış sayısı (nötr zemin), Promptlar'da kaydedilmemiş prompt sayısı, Ajanlar'da çalışan ajan sayısı (kırmızı zemin).
  - Gözcü çipi: 2px kenar, 10px kare durum noktası, etiket ve sağ ok. Tıklayınca sağ paneli gözcü moduna alır.
  - Esnek boşluk.
  - Sayaçlar: açık, bitti, toplam maliyet (13px, neutral-700; sayılar koyu).
  - "Yeni kart" ana düğmesi (min-height 40px).
- Sayısal metinlerin hepsinde `font-variant-numeric: tabular-nums`.

## Screens / Views

### 1. Pano
İki sütun, flex ve wrap:
- **Formasyon alanı**: `flex: 1 1 620px`, padding 24px.
- **Sağ panel**: `flex: 0 1 380px`, `min-width: 300px`, `border-left: 2px solid --color-text`, kendi içinde kaydırılır (`max-height: calc(100vh - 66px)`).

**Başlık satırı**:
- Akış adı h1 (40px/800, −0.03em).
- Taslak varsa "taslak · kaydedilmedi" etiketi (`.tag.tag-accent`).
- Akış açıklaması (14px, neutral-700, max 58ch).
- Sağda "Rolleri düzenle" (secondary) ve "Akış değiştir" (ghost) düğmeleri; bu ikincisi Akışlar sekmesini açar.

**Formasyon diyagramı (V formasyonu)**
- Koordinat kutusu 1000×640 (`aspect-ratio: 1000/640`, genişlik `min(100%, calc((100vh - 210px) * 1.5625))`).
- Gövde çizgisi (2px, --color-text) beş noktadan geçen bir kırık çizgi: giriş (40,110) → sol uç (230,110) → tepe (500,480) → sağ uç (770,110) → çıkış (950,110).
- Roller bu V'nin üzerine eşit aralıkla dizilir: f = i/(n−1); f ≤ 0.5 ise sol koldadır, değilse sağ koldadır. Tek rol varsa tepede durur.
- **Rol düğümü**: 64×44 tıklanabilir kutu (seçiliyse accent-100 zemin ve 2px accent kenar). İçinde 46×23 kuş SVG'si: `polyline 2,5 13,9 24,19 35,9 46,5`, stroke 4, miter birleşim. Kuş rengi:
  - çalışan ya da kapıdaki kart varsa → accent,
  - kartı varsa → text,
  - boşsa → neutral-400.
- **Kanat çırpma**: rolde çalışan kart varsa ve gözcü açıksa çalışır. `@keyframes skein-flap { from scaleY(1) → to scaleY(.4) translateY(3px) }`, .55s ease-in-out infinite alternate, transform-origin 50% 75%. "animate" ayarıyla kapatılabilir.
- **Düğüm etiketi** (150px genişlik): sol koldaki rollerde düğümün soluna sağa yaslı, sağ koldakilerde sağına, tepedekinde altına yerleşir. İçeriği:
  - numara (11px/600, neutral-600) ve rol adı (17px/800),
  - "sağlayıcı · çalışma alanı" bilgisi; ilk role "· öncü" eklenir (11px),
  - kart kareleri: 10px, 2px kenar.
- **Kart kareleri**:
  - çalışıyor: accent dolgu,
  - kapıda: boş, accent kenar,
  - kuyrukta: neutral-500 dolgu.
- **Planlama bandı**: planlama katılımcılarının üzerinden geçen 22px kalınlıkta accent-200 şerit ve "planlama · en çok N tur" etiketi (13px/600, accent-800).
- **Ret yayları**: her `reject` için kaynak rolden hedef role, V'nin iç tarafına doğru kıvrılan quadratic eğri. Kontrol noktası, iki rolün orta noktasından (500,170)'e doğru %60 kaydırılır. 2px accent, ok başlı, "ret → hedef" etiketiyle (12px/600, accent-700). "showArcs" ayarıyla gizlenebilir.
- **İnsan onayı kapısı** (spec akışı): `gateAfter` rolü ile sonraki rol arasındaki çizgiye dik, 6px kalınlıkta accent bir çizgi ve "insan onayı" etiketi.
- **Giriş ve çıkış**: girişte 44px accent "+" düğmesi var (Yeni kart açar). Çıkışta biten kart sayısını gösteren 44×44 kutu var (biten kartlar listesini açar).
- **Lejant** (11.5px): çalışıyor / kapıda / kuyrukta / ret yolu, sağda "okundu HH:MM · bu yüzey yalnızca okur".

**Sağ panel modları**
1. **Genel bakış**
   - Kapıda bekleyen kart sayısı: 44px/800, accent renkte; yanında "kart kararını bekliyor".
   - Her kapı kartı:
     - türünü ve rolünü gösteren üst etiket (10.5px/600, büyük harf, accent-700),
     - başlık düğmesi (15.5px/800),
     - gerekçe (13px, accent-800, en fazla 3 satır),
     - çıkış düğmeleri: ilki primary, diğerleri secondary, min-height 40px.
   - Altında "Uçuşta · N": çalışan kartlar; her birinde 10px kare, başlık ve tek satırlık alt bilgi.
2. **Rol**
   - "← Genel bakış" düğmesi.
   - Üst bilgi: "rol 0N · öncü", rol adı (30px), meta satırı (sağlayıcı, çalışma alanı, sonraki rol, ret hedefi, toplu alım).
   - İki düğme: "Prompt · roles/x.md" (Promptlar sekmesinde o dosyayı açar) ve "Ajanı izle →" (Ajanlar sekmesinde o rolü seçer).
   - Roldeki kartların listesi.
3. **Kart**
   - Geri dönüş düğmesi ve durum etiketi.
   - Başlık (22px).
   - Meta: kimlik, rol, tur sayısı, süre, maliyet.
   - Kapı kartıysa accent-100 kutu (üstte 4px accent çizgi), içinde gerekçe ve çıkış düğmeleri.
   - Son ret gerekçesi: sol kenarı 2px accent çizgili blok.
   - Canlı adım satırı.
   - "Kartın izi" zaman çizelgesi: 52px saat sütunu, 10px düğüm, 2px dikey ray; ret ve kapı olayları accent renkte.
   - "Kodda ne değişti": dosya yolu, +eklenen satır, −silinen satır (accent-700).
4. **Gözcü** (ayrıntılar aşağıda).
5. **Rolleri düzenle** (ayrıntılar aşağıda).

### 2. Gözcü paneli
Durumlar ve üst çubuktaki etiketleri:

| Durum | Etiket | Nokta | Açıklama | Eylem |
|---|---|---|---|---|
| on | gözcü açık | accent | Kuyrukları izliyor; kuyruk boşalınca uyur | "Gözcüyü durdur" (secondary) |
| stopping | gözcü duruyor… | neutral-500 | Durdurma anlık değil: süren tur bitince çıkar | devre dışı "Süren tur bitiyor…" |
| off | gözcü kapalı | neutral-400 | Kartlar kuyrukta bekler | "Gözcüyü başlat" (primary) |
| stale | gözcü çökmüş | text, çipte accent kenar | daemon.json var ama pid ölü | "Kilidi devral ve başlat" |
| unmanaged | gözcü · elle | neutral-400 | Ekran gözcü bayraklarıyla açılmamış | Düğme yok; iki komut kod bloğunda gösterilir |

- Bilgi tablosu (84px etiket sütunu): pid, akış, mod, açılış saati, kilit yolu.
- Gözcüye geçen bayraklar `.tag.tag-outline` olarak gösterilir.
- `.skein/gozcu.log` dosyasının son satırları: saat ve mesaj; hatalar accent-700.
- **Topoloji uyarısı**: gözcü açıkken akış kaydedilirse çipin etiketi "gözcü · yeniden başlat" olur ve kenarı accent'e döner. Panelde "Akış gözcü açıldıktan sonra değişti…" kutusu ve "Yeniden başlat" düğmesi çıkar. Bu, `orphan.ts` ve `serve.ts` uyarılarının görsel karşılığıdır.

Davranış `server.ts` ve `page.ts` testleriyle uyumlu olmalı: bayat kilitte düğme "durdur" demez, başka bir ekranın başlattığı gözcü durdurulmaz, durdurma yanıtı "süren turu bitirecek" der.

### 3. Rolleri düzenle (sağ panel, Pano içinde)
- Üst bilgi: `hub/flows/<ad>.yaml` yolu, "Roller" başlığı ve sıranın formasyonu belirlediğini anlatan bir açıklama.
- **Her rol bloğu**:
  - Numara, ad girişi (yalnız `a-z0-9-`; ad değişince ona bağlı `reject`, `planlama.katilimcilar` ve `denetci` referansları da güncellenir), ↑ ↓ ✕ ikon düğmeleri (36px).
  - 2×2 ızgara:
    - Sağlayıcı (claude / codex / copilot / gemini),
    - Çalışma alanı,
    - Alım: tekil/toplu segment düğmesi (2px kenar, seçili olan koyu zeminli),
    - Ret yolu: yalnızca kendinden önceki roller ya da "yok".
  - Prompt seçimi (`roles/*.md`) ve yanında "Aç" düğmesi.
  - Planlamaya katılım kutusu: ilk katılımcı yazar, diğerleri itiraz eder. Satırın sağında "devreder → sonraki".
  - Diyagramda bir düğüme tıklanınca o rolün bloğu accent-100 zeminle vurgulanır.
- "Rol ekle" düğmesi.
- **Planlama bölümü**: özet ("Yazar: … · itiraz: …"), en çok tur stepper'ı (1–5), yükümlülük denetçisi seçimi.
- **Ret bölümü**: limit stepper'ı (1–5). Limit dolunca kart kapıya düşer (`onExhausted: gate`).
- **Doğrulama**:
  - Hatalar (kaydetmeyi engeller, accent-700): boş rol adı, aynı adı taşıyan iki rol.
  - Uyarı (engellemez): açık kartı olan bir rol silinirse.
- "YAML'ı göster" ile oluşan YAML'ın önizlemesi.
- Sabit alt çubuk: durum metni, "Vazgeç", "Kaydet" (değişiklik yoksa ya da hata varsa devre dışı).
- Normalizasyon: `next` her zaman sıradan türetilir (sonuncusu `done`). Silinen rollere giden referanslar temizlenir.

### 4. Akışlar
- h1 "Akışlar", kısa bir açıklama ve "Yeni akış" (primary).
- Kart ızgarası `repeat(auto-fill, minmax(300px, 1fr))`, kartlar 2px ayırıcı çizgilerle bölünür. Her kartta:
  - 200×110 mini formasyon,
  - ad (20px/800); paneldeki akışa "panoda" etiketi, sağda rol sayısı,
  - açıklama,
  - "planner → architect → … → bitti" zinciri,
  - "Panoda aç", "Rolleri düzenle" ve "Kopyala" düğmeleri.
- Paneldeki akışın kartı accent-100 zeminli.
- **Yeni akış iletişim kutusu** (`.dialog`, üstte 4px text çizgisi): ad (benzersiz, `a-z0-9-`), açıklama ve şablon akış seçilir. "Oluştur ve düzenle" akışı açar ve rol düzenleyicide başlatır.

### 5. Promptlar
- Solda 320px'lik liste, iki grup:
  - **Anayasa** (`constitution/*.md`, "her ajana önce verilir"),
  - **Rol promptları** (`roles/*.md`).
- Her öğede dosya adı ve kullanım bilgisi ("N rol · M akış" ya da "kullanılmıyor"). Kaydedilmemiş değişiklik 8px accent kareyle işaretlenir. Seçili öğe 4px accent sol kenar ve accent-100 zeminle gösterilir.
- Listenin altında "Yeni rol promptu" düğmesi; Sahiplendiğin / Sahiplenmediğin bölümlerini içeren bir şablonla başlar.
- **Sağ taraf**:
  - Dosya adı (26px) ve yolu.
  - "Kullanan" satırı: akış · rol etiketleri; tıklanınca o rol panoda açılır.
  - "Ajanın okuduğu sıra" şeridi: base → engineering-ts → rol promptu → kart metni; seçili dosya accent kenarla vurgulanır.
  - Tam yükseklikte, monospace (13.5px/1.6) metin alanı.
  - Sabit alt çubuk: durum, "Geri al", "Kaydet".

### 6. Ajanlar
- Solda 340px'lik ajan listesi, akıştaki her rol için bir satır: 36px kuş (çalışırken kanat çırpar), rol adı, sağlayıcı ve tek satırlık durum.
  - Durum metinleri: "Bash · npx vitest run …", "kapıda bekliyor · …", "N kart kuyrukta", "boşta", "gözcü kapalı · … yarıda".
- **Sağ taraf**:
  - Üst bilgi: ajan numarası ve akış, rol adı (36px), meta (sağlayıcı, çalışma ağacı, alım biçimi, sonraki rol).
  - **"Şu an" kutusu** (surface zemin, çalışırken ya da kapıda üstte 4px accent çizgi): kart başlığı (20px/800), adım/araç/süre/maliyet satırı, "Kartı panoda aç".
  - **Adımlar**: seq, araç adı (Read/Write/Edit/Bash/Grep/Glob), ayrıntı ve saat. En yenisi en üstte; çalışırken "canlı" etiketi görünür.
  - **"Görevi · promptundan"**: rol prompt dosyasının giriş paragrafı ve ilk `##` bölümündeki madde listesi (en fazla 5), "Promptu düzenle →".

## Interactions & Behavior
- **Kapı çıkışları** mevcut `kapiCikislari` mantığıyla birebir aynı:
  - kaçış kapısı → Yeniden koş / Geri gönder,
  - planlama kilidi → Planı ilerlet / Alışverişi yeniden aç,
  - kilit kapısı → Üretici haklı / Denetçi haklı (geri hedef yoksa Baştan koştur),
  - onay kapısı → Geçir / Geri gönder.
- Her çıkış kartı ilgili kuyruğa bırakır ve kısa bir bildirim gösterir.
- **Bildirim**: sol altta, koyu zemin, 4px accent sol kenar, 3.4 sn görünür.
- **Escape** iletişim kutularını kapatır.
- **Yeni kart iletişim kutusu**: başlık ve iş metni zorunlu; kart akışın ilk rolüne girer. Gözcü kapalıysa bildirim "bekleyecek" der.
- Tüm durum noktaları kare (10px, 2px kenar); yuvarlak hiçbir şey yok.
- **Durumlar**: hover → neutral-200 zemin; focus → 2px accent outline (DS); disabled → %45 opaklık (DS).

## State Management
- `flows` (ad → `{desc, roles[{id, provider, workspace, receive, reject, prompt, next}], planning[], tur, denetci, rejectLimit, gateAfter}`), `flow` (seçili akış).
- `draft` (düzenlenen akışın kopyası), `editFocus`.
- `cards` (`model.ts` Card ve kapı bilgisi), `rail` (`{mode: overview|role|card|daemon|edit, id, from}`), `tab`.
- `daemon` (on|off|stopping|stale|unmanaged), `daemonSince`, `topoChanged`.
- `prompts` (yol → metin), `promptDrafts`, `promptSel`.
- `steps` (kart kimliği → ajan adımları), `agentSel`.
- Gerekli veri ve uçlar: `server.ts` içindeki mevcut durum, kart ve gözcü uçları. Yeni gerekenler:
  - akış YAML'ını yazma (önizleme yazmaz; yalnızca Kaydet yazar, geçersiz YAML diske düşmez),
  - prompt dosyalarını okuma/yazma,
  - ajan adım akışı (tur başına araç çağrıları; `live.name`, `live.detail`, `live.seq`).

## Design Tokens (Modernist)
- **Renkler**:
  - zemin `--color-bg` #f3f2f2, yüzey `--color-surface` #eae9e9, metin `--color-text` #201e1d,
  - vurgu `--color-accent` #ec3013, ayırıcı `--color-divider` = metin rengi %40,
  - accent-100 #fff2ef, accent-200 #ffe0d9, accent-600 #dd2b0f, accent-700 #ae1800, accent-800 #7c1405,
  - neutral 200 #eae7e7, 300 #d7d3d3, 400 #bab6b6, 500 #9b9797, 600 #7d7979, 700 #605d5d, 800 #444141, 900 #2d2b2b.
- **Tipografi**: Archivo (başlık 800, gövde 400/600).
  - Ölçek: 40 / 36 / 30 / 26 / 22 / 20 / 17 / 15 / 14 / 13.5 / 13 / 12.5 / 12 / 11.5 / 11 / 10px.
  - Küçük büyük harfli etiketler: 10px/600, letter-spacing .1em.
- **Boşluk**: 4 / 8 / 12 / 16 / 20 / 24 / 32px.
- **Köşe yarıçapı**: 0 (her yerde).
- **Gölge**: yalnızca iletişim kutusu ve bildirimde `--shadow-lg` (0 12px 32px, %22).
- **Çizgi kalınlıkları**: 2px bölüm ayırıcı, 1px satır ayırıcı, 4px vurgu çizgisi (aktif sekme ve kapı kutusu üstü).

## Assets
- Kuş simgeleri ve diyagram kod içinde üretilen SVG'lerdir (ayrıca görsel dosya yok).
- Arayüz simgeleri Lucide çizgileriyle uyumludur (plus, pencil, chevron, arrow, x).
- `prompts/`: deponun `hub/prompts/` klasöründen alınmış gerçek dosyalar, yalnızca örnek içerik olarak.

## Files
- `Skein Merkez v3.dc.html`: tam tasarım (Pano, Akışlar, Promptlar, Ajanlar, gözcü, rol düzenleyici).
- `Skein Merkez v2.dc.html`: yalnızca Pano.
- `support.js`: `.dc.html` dosyalarını tarayıcıda açmak için gereken çalışma zamanı (ürüne taşınmaz).
- `_ds/…/styles.css`, `_ds_bundle.js`: Modernist tokenları ve bileşen sınıfları.
- `prompts/`: prompt örnekleri.
- İlgili depo dosyaları: `src/ui/page.ts`, `src/ui/model.ts`, `src/ui/server.ts`, `src/watch/lock.ts`, `src/watch/serve.ts`, `src/card/orphan.ts`, `hub/flows/*.yaml`.
