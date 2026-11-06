/**
 * WCAG kontrast oranı — ölçü, göz değil.
 *
 * NİYE VAR: "gökyüzü paleti" kartı kontrastın HESAPLANMASINI istiyor,
 * "güzel göründü" ile karara bağlanmasın diye. Bu dosya o hesabı tek
 * yerde yapar; page.ts içindeki gerçek token değerleri bu fonksiyona
 * verilip eşiğe bağlanır (bkz. token-kontrast.test.ts). Sayı burada
 * üretilmezse eşik sınaması bir iddiadan ibaret kalırdı.
 *
 * Formül WCAG 2.x'in kendisi: sRGB kanalları önce doğrusallaştırılır
 * (gamma düzeltmesi geri alınır), ardından göreli parlaklık (relative
 * luminance) ağırlıklı toplamla bulunur, son olarak açık/koyu oranı
 * (L1+0.05)/(L2+0.05) hesaplanır.
 */

/** "#RRGGBB" formatını kanallara ayırır. Kısa "#RGB" formu desteklenmiyor — bu dosyada hiç üretilmiyor. */
function kanallaraAyir(hex: string): [number, number, number] {
  const temiz = hex.trim();
  const match = /^#([0-9A-Fa-f]{6})$/.exec(temiz);
  if (!match) throw new Error("gecersiz renk: " + hex + " (beklenen: #RRGGBB)");
  // Yakalama grubu desenin kendisinde zorunlu (altındaki alternatif yok),
  // yani eşleşme varsa bu grup da var — ama noUncheckedIndexedAccess
  // bunu bilmiyor, o yüzden açıkça doğrulanıyor.
  const value = match[1];
  if (value === undefined) throw new Error("gecersiz renk: " + hex);
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

/** sRGB kanalını (0-255) WCAG'ın doğrusal uzayına taşır. */
function dogrusallastir(kanal: number): number {
  const oran = kanal / 255;
  return oran <= 0.03928 ? oran / 12.92 : Math.pow((oran + 0.055) / 1.055, 2.4);
}

/** WCAG göreli parlaklığı (relative luminance), 0 (siyah) ile 1 (beyaz) arasında. */
export function goreliParlaklik(hex: string): number {
  const [r, g, b] = kanallaraAyir(hex);
  return 0.2126 * dogrusallastir(r) + 0.7152 * dogrusallastir(g) + 0.0722 * dogrusallastir(b);
}

/**
 * İki renk arasındaki WCAG kontrast oranı, 1 (ayırt edilemez) ile 21
 * (siyah/beyaz) arasında. Sıra önemsiz: metin/zemin hangi sırada
 * verilirse verilsin aynı oran çıkar — WCAG formülü zaten açık/koyu
 * ayrımını kendi içinde yapıyor.
 */
export function kontrastOrani(renk1: string, renk2: string): number {
  const l1 = goreliParlaklik(renk1);
  const l2 = goreliParlaklik(renk2);
  const isOpen = Math.max(l1, l2);
  const koyu = Math.min(l1, l2);
  return (isOpen + 0.05) / (koyu + 0.05);
}

/** Normal metin eşiği — WCAG AA, 4.5:1. */
export const NORMAL_METIN_ESIGI = 4.5;

/** Büyük metin ve ikincil etiket eşiği — WCAG AA, 3:1. */
export const IKINCIL_ETIKET_ESIGI = 3;
