# Tasarımdan bilinçli sapmalar ve taşınacaklar

`DEVIR.md` tasarımcının devir notudur ve **referanstır**. Bu dosya onun
üstüne iki şey ekler:

1. **Sapmalar** — tasarımı birebir uygulamamamız gereken yerler, ölçülmüş
   gerekçeyle.
2. **Taşınacaklar** — ekranda şu an olan ama tasarımda karşılığı olmayan,
   yeniden yazımda KAYBOLMAMASI gereken davranışlar.

İkisi de pazarlık konusu değil. Bir kart bunlardan birine aykırı iş
getirirse denetçinin onu reddetmesi beklenir.

---

## 1. Sapmalar — kontrast

`DEVIR.md` "renkler nihai" diyor. Altı çift, deponun kendi
`src/ui/kontrast.ts` fonksiyonuyla ölçüldüğünde WCAG 2.1 AA eşiğinin
altında kaldı. Eşleştirmeler düzyazıdan değil, `skein-merkez-v3.html`
içinden doğrulandı.

Hiçbir düzeltme YENİ RENK İCAT ETMİYOR; hepsi Modernist paletin kendi
token'ları.

| nerede | tasarım | ölçülen | eşik | yerine | yeni oran |
|---|---|---|---|---|---|
| 11px ve 12px/600 etiketler (3 yer) | `neutral-600` | 3.85 | 4.5 | `neutral-700` | 5.83 |
| kuyruk kart karesi | `neutral-500` dolgu **ve** kenar | 2.59 | 3 | dolgu `neutral-500`, kenar `--color-text` | 14.86 (şekil) |
| gözcü noktası `off` / `unmanaged` | `neutral-400`, **kenarsız** | 1.80 | 3 | aynı dolgu + 2px `--color-text` kenar | 14.86 (şekil) |
| gözcü noktası `stopping` | `neutral-500`, kenarsız | 2.59 | 3 | aynı dolgu + 2px `--color-text` kenar | 14.86 (şekil) |
| boş rol kuşu | `neutral-400` | 1.80 | 3 | `neutral-600` | 3.85 |

### Niye bu kadar önemli

Gözcü noktası, **gözcünün açık mı kapalı mı olduğunu** söyleyen ana
işarettir. Kapalıyken 1.80:1 ile zeminden neredeyse ayırt edilemiyordu.
Bir operatörün ekrana bakıp "gözcü koşuyor" sanması, bu projenin tam
olarak kaçındığı kusur sınıfı: **bildiğinden azını söyleyen bildirim
yolu**.

Ayrıca `DEVIR.md`'nin kendisi "tüm durum noktaları kare (10px, **2px
kenar**)" diyor; gözcü noktasının kodda hiç kenarı yok, kart karelerinin
kenarı dolgusuyla aynı renk. Yani bu düzeltmeler tasarımın kendi
kuralını çiğnemiyor, **uyguluyor**.

### Kapı

`src/ui/token-kontrast.test.ts` yeni paletin çiftleriyle genişletilmeli.
Bir token eşiğin altına düşerse takım kırmızıya dönmeli — düzyazıdaki
"erişilebilir" iddiasının karar yolundaki karşılığı budur.

---

## 2. Taşınacaklar — tasarımda yok, bizde var

### 2.1 Maliyetin ALT SINIR olduğunu söyleyen gösterim

Tasarımda `≥` işareti **hiç geçmiyor**; üst çubukta yalnızca düz bir
"toplam maliyet" var. Bizde `kismi`, `olculmeyen` ve `≥` için 20
referans var.

Bu bir süs değil, ölçülmüş bir kusurun yamasıydı: zaman aşımına uğrayan
turlar dolar bildirmiyordu ve bir koşuda **176 milyon token $0,00 olarak
kayda geçti** — günün token'ının %65'i. Düzeltme, kesilen turun
girdi/çıktısını kurtarıp tutarı `≥` ile ALT SINIR olarak işaretliyor ve
doları hiç ölçülmemiş turları ayrıca sayıyor.

Korunacak davranış:
- toplam tutarın önünde `≥`, en az bir tur kısmiyse,
- "maliyet ölçülmedi · ≥N token" biçimi, dolar hiç yoksa,
- "tur yarıda kesildi, dolar bildirilmedi — ALT SINIR" ile "dolar yok
  (abonelik kimliği)" ayrımı.

**BİLDİRİLMEYEN SIFIR DEĞİLDİR.** Harcanan gizlenmez.

### 2.2 `prefers-reduced-motion`

Tasarımda **0** referans var. Kanat çırpma `.55s infinite alternate`
olarak sürekli koşuyor ve yalnızca uygulama içi "animate" ayarıyla
kapatılıyor.

Bizde işletim sistemi tercihine saygı duyan bir koruma var ve sınamalı.
Yeni formasyon diyagramındaki kanat çırpma da aynı korumanın arkasında
olmalı. Uygulama içi ayar bunun YERİNE değil, YANINA.

### 2.3 Yazma uçlarının güvenliği

Tasarım güvenlikten hiç söz etmiyor. Mevcut sunucuda her yazma ucu üç
şeyden geçiyor:

- her açılışta üretilen rastgele belirteç, sayfanın içine gömülü,
- özel `x-skein-token` başlığı (tarayıcıyı preflight'a zorlar),
- `Origin` denetimi.

Tasarımın getirdiği her yeni yazma ucu **aynı kapıdan** geçmeli. Prompt
yazmadaki yol beyaz listesi de aynen kalmalı: liste `===` ile
karşılaştırır, `endsWith` ile değil — gevşetilmesine karşı sınamayla
pinlendi.

### 2.5 KOYU TEMA — tasarımda yok, ekranda var

`DEVIR.md` koyu temadan **hiç söz etmiyor**; verdiği palet yalnızca açık
tema. Oysa mevcut ekranda üç `@media (prefers-color-scheme: dark)` bloğu
var ve dokuz token orada yeniden tanımlanıyor.

Bu madde sonradan eklendi, çünkü ilk boşluk listesinde ATLANMIŞTI ve
bedelini kart 2 ödedi: üst çubuk yalnızca yeni Modernist token'larını
kullanıyordu, o token'lar koyu blokta ezilmediği için sayfanın gövdesi
koyulaşırken üst çubuk açık kalıyordu. Denetçi bunu gerçek tarayıcıda
ölçtü: `body` `rgb(11, 17, 24)`, `#bar` `rgb(243, 242, 242)`.

**Kural:** Modernist token'larından ekranda GÖRÜNEN her biri, koyu tema
bloğunda da bir karşılık almalı. Yeni bir token tanımlayıp koyu bloğu
atlamak, o öğeyi koyu temada kırmak demektir — ve kırık hâli sessizdir,
takım yeşil kalır.

`DEVIR.md` koyu değerleri vermediği için bunlar TÜRETİLECEK. Türetilen
her çift `token-kontrast.test.ts`'te AÇIK VE KOYU için ayrı ayrı
ölçülmeli; bu dosyanın 1. bölümündeki eşikler (metin 4.5, grafik 3) iki
temada da geçerli. Açık temada ölçülmüş olmak koyu temada bir şey
kanıtlamaz.

---

### 2.4 Lejant iddiası YANLIŞ

Tasarımın lejantı şunu yazıyor:

> okundu {{ readAt }} · **bu yüzey yalnızca okur**

Bu doğru değil. Ekran yazıyor: kapı kararı, akış kaydı, prompt kaydı,
rol ekleme, kart açma, gözcü başlatma ve durdurma. Aynı iddia bir kez
`page.ts`'te vardı ve düzeltildi. Doğrusu şu:

> okundu HH:MM · durum `.skein/` ve `olaylar.jsonl`'dan okunuyor ·
> değişiklik yalnızca düğmelerle

Geri getirilmeyecek.

### 2.6 GÖZCÜ DAVRANIŞLARI — yeniden yazım bunları BOZAMAZ

Gözcü panelinin görünüşü değişiyor; **davranışı değişmiyor**. Üç
güvence mevcut sınamalarla korunuyor ve yeniden yazım bunları
düşüremez:

1. **Bayat kilitte düğme "durdur" DEMEZ.** `daemon.json` duruyor ama
   pid ölüyse gözcü koşmuyordur; "durdur" demek operatöre var olmayan
   bir süreci durdurabileceğini söylemektir. Doğrusu "Kilidi devral ve
   başlat".
2. **Başka bir ekranın başlattığı gözcü DURDURULMAZ.** Bu ekran onu
   yönetmiyor; durdurma düğmesi çıkmaz.
3. **Durdurma yanıtı "süren turu bitirecek" der.** Durdurma anlık
   değildir; aksini söylemek operatöre yalan söylemektir.

Bu madde sonradan eklendi, çünkü kart 5'in ilk turu tam olarak
birincisini bozdu: `bayat kilitte gözcü düğmesi 'başlat' diyor`
sınaması düştü. İş 1217 satırdı, derliyordu, ama kırmızıydı ve
commit edilmedi — diff'i saklandı, ağaç temizlendi, kart yeniden
kuyruğa verildi.

**Kural:** gözcü panelini yazarken önce `tarayici.test.ts` ve
`server.test.ts` içindeki mevcut gözcü sınamalarını OKU. Onları
kırmadan görünüşü değiştir. Bir sınama görünüş yüzünden düşüyorsa
seçiciyi güncelle; DAVRANIŞI değiştirme.

---

### 2.7 "NİTELİK DOĞRU" İLE "EKRANDA DOĞRU" AYRI İDDİALARDIR

On kartın hiçbiri, on turun hiçbir denetçisi ve bütün sınama takımı
şunu kaçırdı: rol düğümlerindeki kuşlar ekranda **21 kat** büyük
çiziliyordu (46×23 yerine ~983×313) ve diyagramın üstünü tamamen
kapatıyordu.

Sebep tek satırdı: `.formasyonSarmal svg` TORUN seçicisi gömülü kuş
`<svg>`'lerine de uyuyor ve `width="46"` niteliğini eziyordu. CSS
niteliği ezer. Düzeltme `>` ile seçiciyi daraltmak.

**Niye kimse görmedi:** her sınama NİTELİĞE, SINIFA ve RENGE bakıyordu.
`polyline` noktaları doğruydu. `stroke` 4'tü. Sınıf yerindeydi. Renk
`kusRengi` önceliğine uygundu. Kontrast çiftleri ölçülmüştü. Hepsi
geçiyordu — ve ekran kullanılamaz hâldeydi.

**Daha kötüsü:** kart 4'ün ajanı belirtiyi GÖRDÜ. `6b171a0`'daki bir
sınama yorumu aynen şöyle diyordu: *"gömülü kuş `<svg>`'si bazı
tarayıcılarda `getBoundingClientRect`'te devasa bir kutu bildiriyor;
bu kart ÖNCESİNDEKİ HEAD'de de aynı ölçüldü — bu kartın kapsamı
DEĞİL."* Teşhis doğruydu, "önceden vardı" doğrulaması da yapılmıştı —
ama bulgu "tarayıcı tuhaflığı" diye yazıldı, kusur diye değil, ve
etrafından dolaşıldı. Denetçi gerekçeyi kabul etti. Altı kart daha
üstünden geçti.

**Kural:** görsel bir öğe eklerken ÇİZİLEN ölçüsünü en az bir sınamada
ölç. `getBoundingClientRect` beklenenden büyüklük mertebesi sapıyorsa
bu bir tuhaflık değil, kusurdur — kapsam dışı olsa bile BİLDİRİLİR.
Kapsam dışı bırakmak, görmemiş gibi yazmak demek değildir.

---

---

### 2.8 EKRANDA ÖLÇMEK YETMEZ — ÖLÇÜMÜN KENDİSİ KARARLI OLMALI

§2.7'nin dersi "ekranda ölç" idi. Kuşların uçuşu kartı bunu yaptı ve
yine bir kusur yerleşti: ölçüm KARARSIZDI.

Sınama (`tarayici.test.ts`, "ara karede kuş kaynak İLE hedef ARASINDA
durur") `waitForSelector(".ucanKus")` ile uçuşu bekliyor, sonra sabit
`waitForTimeout(400)` ile TEK kare ölçüyordu. 400ms sabitti ama
BAŞLANGIÇ noktası değil: `waitForSelector`'ın dönme gecikmesi makine
yüküne göre değişiyor, örnek uçuşun sonuna — kuşun hedefe geri
tırmandığı yere — kayıyordu.

**ÖLÇÜM:** 5 koşudan 3'ü düştü (y = 337.7 / 343.4 / 346.9; eşik 349.0).
Kart, suite'in yeşil geldiği koşuda denetçiden RET ALMADAN geçti.

**Niye tehlikeli:** rastgele ısıran bir sınama, ısırmayan bir sınamadan
kötüdür. Sonraki kartın denetçisi kırmızıyı görür, kendi diff'inde
sebep arar, bulamaz; ya yanlış yere ret verir ya da alakasız bir
"düzeltme" yapar. Takımın kırmızısı sinyal olmaktan çıkar.

**KURAL:** bir hareketi/animasyonu ölçen sınama, ZAMANLAMAYA bağlı tek
bir kareye dayanmayacak. Ya hareketin tamamı örneklenip zamanlamadan
BAĞIMSIZ bir değişmez üzerinden iddia kurulur (burada: V'nin DİBİ —
uçuş onu her hâlükârda geçiyor), ya da zaman denetim altına alınır.
Yeni bir zamanlama sınaması eklerken 5 kez koştur; 5/5 değilse sınama
hazır değil.

**Düzeltme:** örnekleyici DEVİRDEN ÖNCE başlıyor, tüm uçuş boyunca
`requestAnimationFrame` ile kare topluyor, iddia en derin kare üzerinden
kuruluyor. Mutasyonla doğrulandı: `govdeYolu` düz çizgi döndürünce
kırmızı (y 324.4), `ucusSuresiMs` 1ms döndürünce kırmızı (0 kare),
ikisi geri alınınca yeşil; ve 5/5 kararlı.

## 3. Tasarımın "yeni" sandığı ama zaten var olan uçlar

`DEVIR.md` üç yeni uç istiyor. İkisi zaten var:

| tasarımın istediği | depodaki karşılığı |
|---|---|
| akış YAML'ını yazma | `POST /akis/yaz` (+ `POST /akis/onizleme`) |
| prompt dosyalarını okuma/yazma | `GET /prompt?yol=`, `POST /prompt/yaz`, `GET /promptlar` |
| ajan adım akışı | **gerçekten yeni** |

Mevcut uçların tamamı: `/durum`, `/akislar`, `/akis`, `/akis/sec`,
`/akis/yaz`, `/akis/onizleme`, `/promptlar`, `/prompt`, `/prompt/yaz`,
`/rol/yeni`, `/kart/yeni`, `/kart/<id>`, `/gozcu/baslat`,
`/gozcu/durdur`. Yeniden yazım bunları yeniden icat etmemeli.

---

## 4. Örnek içerik, uygulanacak içerik değil

Devir paketindeki `prompts/` klasörü deponun kendi `hub/prompts/`
dosyalarından alınmıştır ve `DEVIR.md` bunu "yalnızca örnek içerik"
diye açıkça söyler. **Rol promptlarına dokunulmayacak**; bu iş
ekranın görünüşüyle ilgili, akışın davranışıyla değil.

Aynı şekilde `support.js` ve `.dc.html` çalışma zamanı ürüne taşınmaz:
hedef, bağımlılıksız tek dosyalık `src/ui/page.ts` yaklaşımıdır.

---

## 5. Sapma — sağlayıcı listesi sabit-4 değil

`DEVIR.md` §3 "Rolleri düzenle" sağlayıcı alanı için "claude / codex /
copilot / gemini" dört seçeneğini sayıyor. Ekran bunun yerine
`knownProviderSet()` ile GERÇEKTEN KAYITLI sağlayıcıları listeliyor
(bugün: `claude`, `codex`) — sabit dörtlü listeyi aynen basmak,
"yapamayacağı şeyi vaat eden düğme" kusur sınıfına girerdi: operatör
`copilot`/`gemini` seçip Kaydet'e bassa dosya o değerle yazılır ama
akışı hiçbir rol gerçekten koşturamaz, hata ancak gözcü çalışınca çıkar.

Bu, DEVIR-DENETIM.md'nin §3 denetimi sırasında bulundu; önceden bu
dosyada kayıtlı DEĞİLDİ (bir "bilinmiş sapma" değil, gözden kaçmıştı).
Geri getirilmeyecek: sabit liste eklenirse yeni bir sağlayıcı
kaydedilmeden önce de seçilebilir olurdu, bu da aynı kusuru geri
getirir.
