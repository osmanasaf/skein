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
  const harita = new Map<string, string>();
  const desen = /--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6}|var\(--[a-z0-9-]+\))\s*;/g;
  let eslesme: RegExpExecArray | null;
  while ((eslesme = desen.exec(gövdeMetni)) !== null) {
    const ad = eslesme[1];
    const deger = eslesme[2];
    if (ad !== undefined && deger !== undefined) harita.set(ad, deger);
  }
  return harita;
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
function temaTokenlari(html: string): { acik: Map<string, string>; koyu: Map<string, string> } {
  const kokBas = html.indexOf(":root {");
  const kokSon = html.indexOf("\n  }", kokBas);
  const acikGovde = html.slice(kokBas, kokSon);

  const koyuSorguBas = html.indexOf("prefers-color-scheme: dark");
  const koyuKokBas = html.indexOf(":root:not(", koyuSorguBas);
  const koyuKokSon = html.indexOf("\n    }", koyuKokBas);
  const koyuGovde = html.slice(koyuKokBas, koyuKokSon);

  const acik = tokenlariAyristir(acikGovde);
  const koyu = new Map(acik);
  for (const [ad, deger] of tokenlariAyristir(koyuGovde)) koyu.set(ad, deger);
  return { acik, koyu };
}

/**
 * Bir token adını, var() zincirini izleyerek gerçek hex değerine indirir.
 * Zincir derinliği sınırlı: döngü ya da bozuk bir referans sessizce
 * yutulmasın, açık hata versin.
 */
function cozumle(harita: Map<string, string>, ad: string, derinlik = 0): string {
  if (derinlik > 8) throw new Error("var() zinciri cok derin (dongu?): " + ad);
  const deger = harita.get(ad);
  if (deger === undefined) throw new Error("token bulunamadi: " + ad);
  const esle = /^var\(--([a-z0-9-]+)\)$/.exec(deger);
  if (esle) {
    const ic = esle[1];
    if (ic === undefined) throw new Error("gecersiz var() referansi: " + deger);
    return cozumle(harita, ic, derinlik + 1);
  }
  return deger;
}

/** Haritadan bir token okur; yoksa (örn. "#fff" gibi sabit bir renk) hex'i aynen döndürür. */
function renk(harita: Map<string, string>, adVeyaHex: string): string {
  if (adVeyaHex.startsWith("#")) return adVeyaHex;
  return cozumle(harita, adVeyaHex);
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
  // rozetler --color-accent-700 kullanıyor (7.17:1, aynı ramptan bir
  // ADIM koyu) — SAPMALAR'ın kendi yönteminin aynısı: yeni renk icat
  // etme, ramptan doğru basamağı seç.
  [
    "Modernist marka simgesi/açık gözcü noktası — accent, zemin üstünde (büyük grafik)",
    "color-accent",
    "color-bg",
    IKINCIL_ETIKET_ESIGI,
  ],
  [
    "Modernist birincil düğme ve dolu rozet — beyaz metin, accent-700 zemin",
    "#FFFFFF",
    "color-accent-700",
    NORMAL_METIN_ESIGI,
  ],
  [
    "Modernist nötr rozet/Pano araç satırı — metin, neutral-200 zemin üstünde",
    "color-text",
    "color-neutral-200",
    NORMAL_METIN_ESIGI,
  ],

  // --- Sağ panel (c-20261105-d500f1) ---
  // Kapı kutusunun accent-100 zemini TEMA TARAFINDAN HİÇ DEĞİŞMİYOR (bkz.
  // page.ts ".railKapiKutu" yorumu) — yani gerekçenin accent-800/accent-100
  // çiftinin aksine ("Modernist kapı gerekçesi", yukarıda), bu üç çift de
  // KASITLI OLARAK tema-değişmez token'lar arasında: açık ve koyu temada
  // AYNI iki sayı ölçülür. Başlık düğmesi bu yüzden --color-text (koyu
  // temada AÇIK renge döner) DEĞİL, --color-neutral-900 kullanıyor — o da
  // hiçbir zaman ezilmiyor.
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
    "Bildirim — beyaz metin, neutral-900 zemin üstünde (DEVIR.md: 'koyu zemin', temadan bağımsız)",
    "#FFFFFF",
    "color-neutral-900",
    NORMAL_METIN_ESIGI,
  ],
];

describe("token kontrastı — açık tema", () => {
  const { acik } = temaTokenlari(renderPage("x"));

  it.each(CIFTLER)("%s", (_etiket, a, b, esik) => {
    const oran = kontrastOrani(renk(acik, a), renk(acik, b));
    expect(oran).toBeGreaterThanOrEqual(esik);
  });
});

describe("token kontrastı — koyu tema", () => {
  const { koyu } = temaTokenlari(renderPage("x"));

  it.each(CIFTLER)("%s", (_etiket, a, b, esik) => {
    const oran = kontrastOrani(renk(koyu, a), renk(koyu, b));
    expect(oran).toBeGreaterThanOrEqual(esik);
  });
});

describe("token ayrıştırma — bağlantı sınaması", () => {
  // Bu sınama BAĞLANTIYI doğruluyor: ayrıştırıcı sahte bir harita
  // üretmiyor, sayfadaki GERÇEK token sayısını buluyor. Eşik sayısı
  // değişirse (yeni bir token eklenir/silinirse) bu da değişmeli —
  // sabit bir sayı yerine "önemli miktarda token" iddia ediliyor.
  it("her iki temada da aynı token adları tanımlı", () => {
    const { acik, koyu } = temaTokenlari(renderPage("x"));
    expect(acik.size).toBeGreaterThan(15);
    expect([...acik.keys()].sort()).toEqual([...koyu.keys()].sort());
  });
});
