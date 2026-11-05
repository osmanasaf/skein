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

### 2.4 Lejant iddiası YANLIŞ

Tasarımın lejantı şunu yazıyor:

> okundu {{ readAt }} · **bu yüzey yalnızca okur**

Bu doğru değil. Ekran yazıyor: kapı kararı, akış kaydı, prompt kaydı,
rol ekleme, kart açma, gözcü başlatma ve durdurma. Aynı iddia bir kez
`page.ts`'te vardı ve düzeltildi. Doğrusu şu:

> okundu HH:MM · durum `.skein/` ve `olaylar.jsonl`'dan okunuyor ·
> değişiklik yalnızca düğmelerle

Geri getirilmeyecek.

---

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
