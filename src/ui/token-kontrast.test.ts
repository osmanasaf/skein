import { describe, expect, it } from "vitest";
import { renderPage } from "./page.js";
import { kontrastOrani, NORMAL_METIN_ESIGI, IKINCIL_ETIKET_ESIGI } from "./kontrast.js";

/**
 * TOKEN DEĞERLERİ CSS METNİNDEN OKUNUR, AYRI BİR LİSTEYE KOPYALANMAZ.
 *
 * Aynı gerçeği iki yere yazmak bu depodaki yinelenen kusur sınıfı: biri
 * değişir, öteki sessizce yalan söyler. Bu yüzden renk sabitleri burada
 * HİÇ görünmüyor — yalnızca değişken ADLARI görünüyor, değerleri her
 * zaman `renderPage()`'in ürettiği gerçek sayfadan ayrıştırılıyor. Palet
 * `page.ts` içinde değişirse bu sınama YENİ değerlerle koşar; eski
 * değerle kıyaslayan bir ikinci kaynak hiç yok.
 */

/**
 * ":root { ... }" gövdesindeki "--ad: #HEX;" ya da "--ad: var(--baska);"
 * çiftlerini bir haritaya çıkarır.
 *
 * var() formu Modernist token katmanı için gerekli: SAPMALAR.md'nin beş
 * düzeltmesi (örn. `--label-ink: var(--color-neutral-700);`) ham hex'i
 * BURADA tekrar etmiyor, ramptaki tek kaynağa işaret ediyor. Değer yine de
 * sayfanın gerçek CSS metninden okunuyor — `cozumle()` zinciri izleyip asıl
 * hex'e iniyor, ikinci bir kaynak hiç açılmıyor.
 */
function tokenlariAyristir(gövdeMetni: string): Map<string, string> {
  const lookup = new Map<string, string>();
  const desen = /--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6}|var\(--[a-z0-9-]+\))\s*;/g;
  let eslesme: RegExpExecArray | null;
  while ((eslesme = desen.exec(gövdeMetni)) !== null) {
    const name = eslesme[1];
    const value = eslesme[2];
    if (name !== undefined && value !== undefined) lookup.set(name, value);
  }
  return lookup;
}

/**
 * Açık ve koyu tema `:root` gövdelerini sayfanın GERÇEK HTML/CSS
 * metninden kesip çıkarır.
 *
 * Açık tema çıplak `:root { ... }`'ta; koyu tema `prefers-color-scheme:
 * dark` sorgusunun içindeki ikinci `:root` kuralında, yalnızca EZDİĞİ
 * token'ları taşıyor (bkz. page.test.ts — "açık palet temel, koyu palet
 * üzerine biniyor"). Koyu haritayı açığın üstüne yazarak birleştiriyoruz,
 * çünkü koyu blok --mono gibi değişmeyen token'ları tekrar etmiyor.
 */
function temaTokenlari(html: string): { isOpen: Map<string, string>; darkBlock: Map<string, string> } {
  const kokBas = html.indexOf(":root {");
  const kokSon = html.indexOf("\n  }", kokBas);
  const acikGovde = html.slice(kokBas, kokSon);

  const darkQueryStart = html.indexOf("prefers-color-scheme: dark");
  const darkRootStart = html.indexOf(":root:not(", darkQueryStart);
  const darkRootEnd = html.indexOf("\n    }", darkRootStart);
  const koyuGovde = html.slice(darkRootStart, darkRootEnd);

  const isOpen = tokenlariAyristir(acikGovde);
  const darkBlock = new Map(isOpen);
  for (const [name, value] of tokenlariAyristir(koyuGovde)) darkBlock.set(name, value);
  return { isOpen, darkBlock };
}

/**
 * `@media (prefers-color-scheme: dark) { :root:not(...) { ... } }`
 * bloğunun SADECE EZDİĞİ token'larını (açıkla birleştirmeden) döner.
 */
function medyaEzmesi(html: string): Map<string, string> {
  const darkQueryStart = html.indexOf("prefers-color-scheme: dark");
  const darkRootStart = html.indexOf(":root:not(", darkQueryStart);
  const darkRootEnd = html.indexOf("\n    }", darkRootStart);
  return tokenlariAyristir(html.slice(darkRootStart, darkRootEnd));
}

/**
 * `:root[data-theme="dark"] { ... }` bloğunun token'ları — tema anahtarı
 * OS tercihinden BAĞIMSIZ "koyu" seçildiğinde uygulanan blok (kart
 * c-20261106-e62847, page.ts'teki TEMA ANAHTARI yorumu).
 */
function zorlananKoyuTokenlari(html: string): Map<string, string> {
  const bas = html.indexOf(':root[data-theme="dark"] {');
  const last = html.indexOf("\n  }", bas);
  return tokenlariAyristir(html.slice(bas, last));
}

/**
 * Bir token adını, var() zincirini izleyerek gerçek hex değerine indirir.
 * Zincir derinliği sınırlı: döngü ya da bozuk bir referans sessizce
 * yutulmasın, açık hata versin.
 */
function cozumle(lookup: Map<string, string>, name: string, derinlik = 0): string {
  if (derinlik > 8) throw new Error("var() zinciri cok derin (dongu?): " + name);
  const value = lookup.get(name);
  if (value === undefined) throw new Error("token bulunamadi: " + name);
  const match = /^var\(--([a-z0-9-]+)\)$/.exec(value);
  if (match) {
    const ic = match[1];
    if (ic === undefined) throw new Error("gecersiz var() referansi: " + value);
    return cozumle(lookup, ic, derinlik + 1);
  }
  return value;
}

/** Haritadan bir token okur; yoksa (örn. "#fff" gibi sabit bir renk) hex'i aynen döndürür. */
function colour(lookup: Map<string, string>, adVeyaHex: string): string {
  if (adVeyaHex.startsWith("#")) return adVeyaHex;
  return cozumle(lookup, adVeyaHex);
}

type Esik = typeof NORMAL_METIN_ESIGI | typeof IKINCIL_ETIKET_ESIGI;

/**
 * Sayfada GERÇEKTEN üst üste binen metin/zemin çiftleri.
 *
 * Her satır bir CSS kuralına karşılık geliyor (bkz. page.ts) — örneğin
 * ".band h2 { color: var(--reject-ink) }" kuralı "bg" üzerinde çiziliyor
 * çünkü `.band`'in kendi zemini yok. Eşik, metnin BÜYÜKLÜĞÜNE göre:
 * gövde metni NORMAL_METIN_ESIGI (4.5:1), küçük/ikincil etiket
 * IKINCIL_ETIKET_ESIGI (3:1) — kart metninde yazılı kural.
 */
const CIFTLER: [string, string, string, Esik][] = [
  // normal metin — gövde, başlık, uyarı
  ["ink/bg — sütun başlığı zemin üstünde", "ink", "bg", NORMAL_METIN_ESIGI],
  ["ink/surface — kart başlığı kart üstünde", "ink", "surface", NORMAL_METIN_ESIGI],
  ["ink/gate-bg — kapı kartında başlık", "ink", "gate-bg", NORMAL_METIN_ESIGI],
  ["ink/accent-soft — gözcü açık hapı", "ink", "accent-soft", NORMAL_METIN_ESIGI],
  ["ink/surface-2 — form girdisi metni", "ink", "surface-2", NORMAL_METIN_ESIGI],
  ["ink-2/surface — ikincil gövde kart üstünde", "ink-2", "surface", NORMAL_METIN_ESIGI],
  ["ink-2/bg — kuyruk engeli bandı metni", "ink-2", "bg", NORMAL_METIN_ESIGI],
  ["ink-2/gate-bg — kapı kartında adım metni", "ink-2", "gate-bg", NORMAL_METIN_ESIGI],
  ["ink-2/surface-2 — gözcü kapalı hapı", "ink-2", "surface-2", NORMAL_METIN_ESIGI],
  ["reject-ink/surface — dosya satırı silinen", "reject-ink", "surface", NORMAL_METIN_ESIGI],
  ["reject-ink/bg — bant başlığı zemin üstünde", "reject-ink", "bg", NORMAL_METIN_ESIGI],
  ["reject-ink/gate-bg — ret sayacı kapı kartında", "reject-ink", "gate-bg", NORMAL_METIN_ESIGI],
  ["accept/surface — dosya satırı eklenen", "accept", "surface", NORMAL_METIN_ESIGI],
  ["gate-ink/gate-bg — kapı gerekçesi", "gate-ink", "gate-bg", NORMAL_METIN_ESIGI],
  ["beyaz/gate — birincil kapı düğmesi", "#FFFFFF", "gate", NORMAL_METIN_ESIGI],
  ["beyaz/reject — yetim kart kapatma düğmesi", "#FFFFFF", "reject", NORMAL_METIN_ESIGI],
  ["beyaz/accent — akış/prompt kaydet düğmesi", "#FFFFFF", "accent", NORMAL_METIN_ESIGI],
  // ikincil etiket — küçük büyük harf etiketler, sayaçlar
  ["ink-3/bg — boş sütun, altbilgi", "ink-3", "bg", IKINCIL_ETIKET_ESIGI],
  ["ink-3/surface — kuyrukta etiketi", "ink-3", "surface", IKINCIL_ETIKET_ESIGI],
  ["ink-3/gate-bg — kapı kartında sayaç", "ink-3", "gate-bg", IKINCIL_ETIKET_ESIGI],
  ["accent-ink/surface — çalışıyor etiketi", "accent-ink", "surface", IKINCIL_ETIKET_ESIGI],
  ["gate/gate-bg — kapı etiketi kendi kartında", "gate", "gate-bg", IKINCIL_ETIKET_ESIGI],

  // --- Modernist token katmanı (c-20261105-fc7a36) ---
  // Bu çiftler henüz hiçbir seçicide kullanılmıyor — ekranın görünüşü bu
  // kartla değişmiyor. Buradaki sayılar, bir sonraki kart Modernist
  // ekranı gerçekten kurduğunda hangi token'ı hangi zeminle eşleyeceğini
  // ÖNCEDEN kilitliyor; token'lardan biri yanlışlıkla düzeltme-öncesi
  // değere dönerse bu takım kırmızıya döner.
  //
  // normal metin
  ["Modernist gövde metni — zemin üstünde", "color-text", "color-bg", NORMAL_METIN_ESIGI],
  ["Modernist gövde metni — yüzey üstünde", "color-text", "color-surface", NORMAL_METIN_ESIGI],
  [
    "SAPMALAR §1 — 11-12px/600 etiket, zemin üstünde (neutral-700, neutral-600 DEĞİL)",
    "label-ink",
    "color-bg",
    NORMAL_METIN_ESIGI,
  ],
  ["Modernist lejant metni — zemin üstünde", "label-ink", "color-bg", NORMAL_METIN_ESIGI],
  [
    "Modernist kapı gerekçesi — kapı kartında (accent-800/accent-100)",
    "color-accent-800",
    "color-accent-100",
    NORMAL_METIN_ESIGI,
  ],
  [
    "Modernist rozet — tag-accent (accent-800/accent-100)",
    "color-accent-800",
    "color-accent-100",
    NORMAL_METIN_ESIGI,
  ],
  [
    "Modernist rozet — tag-neutral (neutral-800/neutral-100)",
    "color-neutral-800",
    "color-neutral-100",
    NORMAL_METIN_ESIGI,
  ],
  // büyük metin ve grafik (durum göstergeleri, simgeler)
  [
    "SAPMALAR §2 — kuyruk kart karesi kenarı, zemin üstünde (kenar artık --color-text)",
    "queue-square-border",
    "color-bg",
    IKINCIL_ETIKET_ESIGI,
  ],
  [
    "SAPMALAR §3 — gözcü noktası (kapalı/elle) kenarı, zemin üstünde",
    "daemon-dot-off-border",
    "color-bg",
    IKINCIL_ETIKET_ESIGI,
  ],
  [
    "SAPMALAR §4 — gözcü noktası (duruyor) kenarı, zemin üstünde",
    "daemon-dot-stopping-border",
    "color-bg",
    IKINCIL_ETIKET_ESIGI,
  ],
  [
    "SAPMALAR §5 — boş rol kuşu, zemin üstünde (neutral-600, neutral-400 DEĞİL)",
    "empty-bird-ink",
    "color-bg",
    IKINCIL_ETIKET_ESIGI,
  ],

  // --- Üst çubuk ve sekme iskeleti (c-20261105-6d7f66) ---
  // Bu kart Modernist katmanını İLK kez gerçekten tüketiyor, yani
  // aşağıdaki üç çift YENİ: eski palette hiç karşılığı yok. Ölçüldü:
  // beyaz metin düz --color-accent zemin üstünde 4.20:1 — normal metin
  // eşiğini (4.5) GEÇMİYOR. Bu yüzden "Yeni kart" düğmesi ve dolu
  // rozetler ("Yeni kart", .navRozet-accent, .railBtn.primary) --solid-accent
  // kullanıyor (7.17:1, aynı ramptan bir ADIM koyu, kart c-20261106-e62847'
  // den ÖNCE --color-accent-700'ün KENDİSİYDİ) — SAPMALAR'ın kendi
  // yönteminin aynısı: yeni renk icat etme, ramptan doğru basamağı seç.
  // --solid-accent BİLİNÇLİ OLARAK hiçbir temada ezilmiyor (page.ts'teki
  // SOLID-* yorumu) — color-accent-700'ün KENDİSİ artık (kart
  // c-20261106-e62847) koyu temada BAŞKA bir role (accent-100 zemini
  // üstünde ink) hizmet ediyor ve o roldeki değeri koyuda DEĞİŞİYOR,
  // bu yüzden dolgulu-düğme rolü ayrı, değişmez bir ada taşındı.
  [
    "Modernist marka simgesi/açık gözcü noktası — accent, zemin üstünde (büyük grafik)",
    "color-accent",
    "color-bg",
    IKINCIL_ETIKET_ESIGI,
  ],
  [
    "Modernist birincil düğme ve dolu rozet — beyaz metin, solid-accent zemin (temadan bağımsız)",
    "#FFFFFF",
    "solid-accent",
    NORMAL_METIN_ESIGI,
  ],
  [
    "Modernist nötr rozet/Pano araç satırı — metin, neutral-200 zemin üstünde",
    "color-text",
    "color-neutral-200",
    NORMAL_METIN_ESIGI,
  ],

  // --- Sağ panel (c-20261105-d500f1) ---
  // Kapı kutusunun accent-100 zemini kart c-20261106-e62847'den ÖNCE
  // tema tarafından hiç değişmiyordu (bkz. page.ts ".railKapiKutu"
  // yorumu) — ARTIK değişiyor: accent-100 koyuda koyulaşıyor, accent-700/
  // neutral-900 (buradaki ink rolleri) koyuda AÇILIYOR, ikisi BİRLİKTE
  // ters yönde dönüyor. Bu yüzden aşağıdaki iki çift artık AÇIK VE KOYU
  // için AYRI AYRI ölçülüyor (SAPMALAR.md §2.5) — aynı sayı değil, ama
  // ikisi de eşiği geçiyor. Başlık düğmesi --color-text (koyu temada AÇIK
  // renge döner) DEĞİL, --color-neutral-900 kullanmayı sürdürüyor, çünkü
  // neutral-900 artık accent-100 ile AYNI kart tarafından BİRLİKTE
  // ters çevrildi (page.ts'teki ACCENT RAMPASI yorumu).
  [
    "Sağ panel kapı kutusu üst etiketi — accent-700, accent-100 zemin üstünde",
    "color-accent-700",
    "color-accent-100",
    NORMAL_METIN_ESIGI,
  ],
  [
    "Sağ panel kapı kutusu başlık düğmesi — neutral-900, accent-100 zemin üstünde",
    "color-neutral-900",
    "color-accent-100",
    NORMAL_METIN_ESIGI,
  ],
  [
    "Sağ panel Genel bakış — kapıda bekleyen sayısı, accent zemin üstünde (büyük metin)",
    "color-accent",
    "color-bg",
    IKINCIL_ETIKET_ESIGI,
  ],
  [
    "Bildirim — beyaz metin, toast-bg zemin üstünde (DEVIR.md: 'koyu zemin', temadan bağımsız)",
    "#FFFFFF",
    "toast-bg",
    NORMAL_METIN_ESIGI,
  ],

  // --- Promptlar sekmesi (DEVIR.md §5) ---
  // "Kaydedilmemiş değişiklik" işareti accent dolgulu 8px bir kare,
  // SEÇİLİ (accent-100 zemin) bir öğenin üstünde de görünür olmak
  // zorunda. color-accent hiçbir temada EZİLMİYOR, ama color-accent-100
  // artık (kart c-20261106-e62847) koyuda koyulaşıyor — oran bu yüzden
  // ARTIK tema-değişmez DEĞİL (açıkta 3.84:1, koyuda 3.46:1), ikisi de
  // IKINCIL_ETIKET_ESIGI'yi (3, küçük grafik işaret) geçiyor.
  [
    "Promptlar sekmesi — kaydedilmemiş taslak işareti, seçili öğenin accent-100 zemini üstünde",
    "color-accent",
    "color-accent-100",
    IKINCIL_ETIKET_ESIGI,
  ],

  // --- Ajanlar sekmesi (DEVIR.md §6) — denetim kartı c-20261105-387d01 ---
  // `.ajanSuAnSatir .bad`, "ölçülmeyen maliyet" uyarısını (SAPMALAR §2.1)
  // `.ajanSuAn`ın `color-surface` zemini ÜSTÜNDE METİN olarak basıyor.
  // Bu, accent-700'ün önceki tüm kullanımlarından (dolgu+beyaz metin,
  // ya da accent-100 zemini — ikisi de "tema değişse de aynı kalır"
  // diye BİLEREK ezilmemişti) FARKLI bir rol: burada koyu temada
  // OKUNMUYORDU (2.23:1), bu yüzden `--bad-ink` adıyla AYRI bir token
  // ve koyu ezmesi eklendi (bkz. page.ts :root).
  [
    "Ajanlar 'Şu an' kutusu — ölçülmeyen maliyet uyarısı (.bad), surface zemin üstünde",
    "bad-ink",
    "color-surface",
    NORMAL_METIN_ESIGI,
  ],

  // --- Koyu tema — accent rampası + color-neutral-900 (c-20261106-e62847) ---
  // ÖLÇÜLEN KUSUR: ".railKapiKutu" zemini (accent-100) koyu temada hiç
  // ezilmiyordu — koyu gövde rgb(11,17,24) iken kutu rgb(255,242,239),
  // parlaklık 245/255, 338×267px, ekranın en önemli kutusunun (kapı
  // kararı) üstünde. Yukarıdaki iki çift ("Sağ panel kapı kutusu üst
  // etiketi"/"...başlık düğmesi", "Modernist kapı gerekçesi", "Modernist
  // rozet — tag-accent") artık BU ikinci düzeltmeyi (accent-100 koyuda
  // koyulaşıyor) de ölçüyor — burada EKLENEN, o düzeltmenin AÇMADIĞI,
  // önceden HİÇ test edilmemiş iki çıplak-ink çiftidir: accent-700/800
  // bazı yerlerde accent-100 kutusuna SARILI DEĞİL, çıplak --color-bg/
  // --color-surface üstünde duruyor (.formasyonRetEtiket/.formasyonKapiEtiket/
  // .formasyonPlanEtiket, .duzenleAdGirisi.gecersiz, .duzenleIkonSil:hover).
  // Koyu temada ÖLÇÜLDÜ (düzeltmeden ÖNCE): accent-700/color-bg 2.47:1,
  // accent-800/color-bg 1.65:1 — IKINCIL_ETIKET_ESIGI'nin (3) bile altında,
  // yani bu metin fiilen OKUNMUYORDU, hiçbir sınama bunu yakalamıyordu.
  [
    "Formasyon 'ret' etiketi — çıplak accent-700, zemin üstünde (büyük grafik)",
    "color-accent-700",
    "color-bg",
    IKINCIL_ETIKET_ESIGI,
  ],
  [
    "Formasyon 'insan onayı' etiketi — çıplak accent-700, zemin üstünde (büyük grafik)",
    "color-accent-700",
    "color-bg",
    IKINCIL_ETIKET_ESIGI,
  ],
  [
    "Formasyon 'planlama' etiketi — çıplak accent-800, zemin üstünde (büyük grafik)",
    "color-accent-800",
    "color-bg",
    IKINCIL_ETIKET_ESIGI,
  ],
  [
    "Rolleri düzenle — geçersiz ad girişi kenarı/sil düğmesi hover'ı, accent-700, surface zemin üstünde",
    "color-accent-700",
    "color-surface",
    IKINCIL_ETIKET_ESIGI,
  ],
  // --solid-accent(-hover) BİLİNÇLİ OLARAK hiçbir temada ezilmiyor
  // (page.ts'teki SOLID-* yorumu) — "Yeni kart"/rozet çiftiyle AYNI
  // sebep, hover durumu için AYRI pinlendi.
  [
    "Yeni kart düğmesi (hover) — beyaz metin, solid-accent-hover zemin (temadan bağımsız)",
    "#FFFFFF",
    "solid-accent-hover",
    NORMAL_METIN_ESIGI,
  ],
];

describe("token kontrastı — açık tema", () => {
  const { isOpen } = temaTokenlari(renderPage("x"));

  it.each(CIFTLER)("%s", (_etiket, a, b, threshold) => {
    const ratio = kontrastOrani(colour(isOpen, a), colour(isOpen, b));
    expect(ratio).toBeGreaterThanOrEqual(threshold);
  });
});

describe("token kontrastı — koyu tema", () => {
  const { darkBlock } = temaTokenlari(renderPage("x"));

  it.each(CIFTLER)("%s", (_etiket, a, b, threshold) => {
    const ratio = kontrastOrani(colour(darkBlock, a), colour(darkBlock, b));
    expect(ratio).toBeGreaterThanOrEqual(threshold);
  });
});

/** "#RRGGBB" metninden 0-255 arası ORTALAMA kanal (kaba parlaklık) — tarayici.test.ts'teki `parlaklik()`'in AYNI formülü, ama "rgb(r, g, b)" DEĞİL kaynak metnin kendi hex'i üzerinde. */
function parlaklikHex(hex: string): number {
  const match = /^#([0-9A-Fa-f]{6})$/.exec(hex);
  if (!match) throw new Error("gecersiz renk: " + hex);
  const value = match[1];
  if (value === undefined) throw new Error("gecersiz renk: " + hex);
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (r + g + b) / 3;
}

/**
 * SAPMALAR §2.5 — zemin DOLGUSU (fill), KENAR (border) DEĞİL.
 *
 * reviewer'ın reddi (bu kenarda 1. ret, reddedilen commit 36ae34a):
 * "SAPMALAR §2/§3/§4 satırları" (yukarıdaki "queue-square-border",
 * "daemon-dot-off-border", "daemon-dot-stopping-border" çiftleri) yalnızca
 * KENARI ölçüyor — aynı seçicilerin FILL (dolgu) rengini (--queue-square-
 * fill, --daemon-dot-off-fill, --daemon-dot-stopping-fill, neutral-400/500
 * üzerinden) HİÇBİR sınama ölçmüyordu. Bu üçü AÇIK/KOYU için AYRI AYRI,
 * gövdeden (color-bg) ÖLÇÜLEBİLİR bir parlaklık farkıyla (görev metninin
 * ÖLÇÜLEBİLİR HEDEFİ: "gövdeden 100 parlaklık biriminden fazla sapan
 * yüzey KALMASIN") burada kilitleniyor — kontrastOrani/NORMAL_METIN_ESIGI
 * burada KULLANILMIYOR çünkü bu bir METİN rolü değil (ikisi zaten çok
 * düşük oran veriyor, açık temada da: 1.80:1 ve 2.59:1 — tasarımın
 * KENDİSİ bu dolguları KENARLA okunur kılıyor, dolgunun kendisiyle değil).
 *
 * Gerçek piksel GÖRÜNÜMÜ (bu statik kaynak-metin ölçümünün YAKALAYAMADIĞI,
 * SAPMALAR §2.7'nin ayrımı) tarayici.test.ts'teki iki gerçek-tarayıcı
 * sınamasında ayrıca ölçülüyor.
 */
describe("SAPMALAR §2.5 — zemin dolgusu (fill, kenar DEĞİL): gövdeden (color-bg) parlaklık farkı <=100, açık ve koyu AYRI", () => {
  const FILL_TOKENLARI = [
    "queue-square-fill",
    "daemon-dot-off-fill",
    "daemon-dot-stopping-fill",
  ] as const;

  it.each(FILL_TOKENLARI)("%s/color-bg — AÇIK temada", (name) => {
    const { isOpen } = temaTokenlari(renderPage("x"));
    const diff = Math.abs(parlaklikHex(colour(isOpen, name)) - parlaklikHex(colour(isOpen, "color-bg")));
    expect(diff).toBeLessThanOrEqual(100);
  });

  it.each(FILL_TOKENLARI)("%s/color-bg — KOYU temada (reviewer'ın yakaladığı kusur: ÖNCEDEN hiç ezilmiyordu — neutral-400 fark 159, neutral-500 fark 128, ikisi de >100)", (name) => {
    const { darkBlock } = temaTokenlari(renderPage("x"));
    const diff = Math.abs(parlaklikHex(colour(darkBlock, name)) - parlaklikHex(colour(darkBlock, "color-bg")));
    expect(diff).toBeLessThanOrEqual(100);
  });

  it("--color-neutral-400 koyu temada ESKİ açık ham değerine (neutral-400, #bab6b6) EŞİT DEĞİL — bu, tam reviewer'ın bulduğu kusurdu", () => {
    const { darkBlock } = temaTokenlari(renderPage("x"));
    expect(cozumle(darkBlock, "color-neutral-400")).not.toBe("#bab6b6");
    expect(cozumle(darkBlock, "color-neutral-400")).toBe("#444141");
  });

  it("--color-neutral-500 koyu temada ESKİ açık ham değerine (neutral-500, #9b9797) EŞİT DEĞİL — tam reviewer'ın bulduğu kusurdu", () => {
    const { darkBlock } = temaTokenlari(renderPage("x"));
    expect(cozumle(darkBlock, "color-neutral-500")).not.toBe("#9b9797");
    expect(cozumle(darkBlock, "color-neutral-500")).toBe("#605d5d");
  });
});

describe("token ayrıştırma — bağlantı sınaması", () => {
  // Bu sınama BAĞLANTIYI doğruluyor: ayrıştırıcı sahte bir harita
  // üretmiyor, sayfadaki GERÇEK token sayısını buluyor. Eşik sayısı
  // değişirse (yeni bir token eklenir/silinirse) bu da değişmeli —
  // sabit bir sayı yerine "önemli miktarda token" iddia ediliyor.
  it("her iki temada da aynı token adları tanımlı", () => {
    const { isOpen, darkBlock } = temaTokenlari(renderPage("x"));
    expect(isOpen.size).toBeGreaterThan(15);
    expect([...isOpen.keys()].sort()).toEqual([...darkBlock.keys()].sort());
  });
});

/**
 * TEMA ANAHTARI — "sistem"den BAĞIMSIZ "koyu" seçimi, kart c-20261106-e62847.
 *
 * `page.ts` iki ayrı yerde koyu değerleri basıyor: `@media
 * (prefers-color-scheme: dark)`'in içindeki `:root:not([data-theme="light"])`
 * (OS tercihini izler) ve `:root[data-theme="dark"]` (anahtarla AÇIKÇA
 * seçilen, OS'tan BAĞIMSIZ). Bu dosya tek kaynak değil — CSS'te bir @media
 * bloğu ile düz bir seçici AYNI gövdeyi "paylaşamaz" (bkz. page.ts'teki
 * TEMA ANAHTARI yorumu) — bu yüzden ikinci blok BİREBİR kopya olarak
 * yazıldı. Bu sınama o kopyanın DRİFT ETMEDİĞİNİ ölçüyor: biri değişip
 * öteki unutulursa (üstteki "koyu tema" takımının ÖLÇTÜĞÜ, @media bloğu)
 * anahtarla "koyu" seçen bir operatör FARKLI, test edilmemiş bir palet
 * görür — hiçbir sınama bunu yakalamaz, çünkü yukarıdaki iki describe
 * bloğu SADECE @media bloğunu okuyor (`temaTokenlari`, `renderPage("x")`
 * varsayılan "sistem" ile çağrılıyor, `data-theme` niteliği hiç basılmıyor).
 */
describe("tema anahtarı — :root[data-theme=\"dark\"] @media'daki koyu ezmesiyle BİREBİR AYNI", () => {
  it("iki blok da AYNI token adlarını taşıyor", () => {
    const html = renderPage("x");
    const medya = medyaEzmesi(html);
    const forced = zorlananKoyuTokenlari(html);
    expect(forced.size).toBeGreaterThan(5);
    expect([...medya.keys()].sort()).toEqual([...forced.keys()].sort());
  });

  it("ortak her token AYNI ham değere çözülüyor", () => {
    const html = renderPage("x");
    const { isOpen } = temaTokenlari(html);
    const forced = zorlananKoyuTokenlari(html);
    // var() zincirleri (ör. "--color-accent-100: var(--color-accent-900)")
    // EZİLMEYEN taban token'lara (color-accent-900 gibi) iniyor — bunlar
    // sadece açık :root'ta tanımlı, bu yüzden ÇÖZÜMLEME açığın üstüne
    // kurulan haritayla yapılıyor (temaTokenlari'nin "koyu" haritasıyla
    // AYNI desen).
    const medyaCozumlu = new Map(isOpen);
    for (const [name, value] of medyaEzmesi(html)) medyaCozumlu.set(name, value);
    const zorlananCozumlu = new Map(isOpen);
    for (const [name, value] of forced) zorlananCozumlu.set(name, value);
    for (const name of forced.keys()) {
      expect(colour(zorlananCozumlu, name)).toBe(colour(medyaCozumlu, name));
    }
  });
});

describe("renderPage — tema parametresi <html>'in data-theme niteliğini basıyor", () => {
  it("'sistem' (varsayılan) — nitelik YOK, OS tercihi @media ile izleniyor", () => {
    // "data-theme" DİZGİSİ sayfanın CSS'inde (seçici olarak) başka
    // yerlerde de geçiyor — bu yüzden TÜM metin değil, SADECE <html>
    // etiketinin kendisi sınanıyor.
    const html = renderPage("x");
    expect(html).toContain('<html lang="tr">');
    expect(html.slice(0, html.indexOf(">") + 1)).not.toContain("data-theme");
  });

  it("'acik' — data-theme=\"light\" (koyu @media bloğunu KAPATAN mevcut kaçış yolu)", () => {
    const html = renderPage("x", null, "acik");
    expect(html).toContain('<html lang="tr" data-theme="light">');
  });

  it("'koyu' — data-theme=\"dark\" (OS'tan BAĞIMSIZ, yeni :root[data-theme=\"dark\"] bloğunu açan nitelik)", () => {
    const html = renderPage("x", null, "koyu");
    expect(html).toContain('<html lang="tr" data-theme="dark">');
  });

  it("__TEMA_NITELIGI__ yer tutucusu hiçbir seçimde kalmıyor", () => {
    for (const tema of ["sistem", "acik", "koyu"] as const) {
      expect(renderPage("x", null, tema)).not.toContain("__TEMA_NITELIGI__");
    }
  });
});
