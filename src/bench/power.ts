/**
 * 2x2'nin ÖLÇÜM GÜCÜ KARARI — iki koşul, ayrı ayrı.
 *
 * 4 Ekim'deki ilk çapraz satıcı koşusu YETERSİZ verdi ve ikinci koşulu
 * öğretti. Birincisini zaten biliyorduk, ikincisi `effect.ts`'in
 * `reduction()` fonksiyonunda kodda duruyordu ama ön kontrol olarak
 * yazılmamıştı:
 *
 *   1. Üretici kusur ÜRETMELİ — yoksa denetçinin yakalayacağı şey yok.
 *   2. AYNI-SATICI denetim o kusuru KAÇIRMALI — yoksa çeşitliliğin
 *      iyileştirecek bir şeyi yok ve göreli azalma TANIMSIZ kalır.
 *
 * İkinci koşul kaçırılırsa deney sessizce tek yönlü olur: tez yalnızca
 * ALEYHİNE gösterilebilir, lehine gösterilemez. `snapshot-store` tam olarak
 * burada: kusuru üretmek zor, görmek kolay.
 *
 * Karar saf bir fonksiyon, çünkü ölçütün kendisi bugünün bulgusu ve
 * sınanmadan kalmaması gerekiyor.
 */
export type PowerVerdict =
  | { kind: "olculemedi"; reason: string }
  | { kind: "olcemez-uretici" }
  | { kind: "olcemez-denetci"; caught: number }
  | { kind: "olcer"; missed: string[] };

export interface PowerInput {
  /** Gizli süit koştu mu. Koşmadıysa yer gerçeği yok. */
  ran: boolean;
  /**
   * Üretim çağrısının çıkış kodu.
   *
   * Sıfır değilse kırmızı kancalar KUSUR DEĞİL. Ajan çökünce artefakt boş
   * kalıyor ve neredeyse her kanca kırmızı düşüyor; sayıya bakan bir ön
   * kontrol o hücreyi "ölçüm gücü yüksek" diye okur. Olmayan bir modelle
   * koşturulan ilk denemede tam olarak bu oldu: 14 kanca "kanıtlanmış
   * kusur" sayıldı.
   */
  producerExit: number;
  /** Üretimde kırmızı düşen kancalar. */
  redHooks: string[];
  /** Aynı-satıcı denetim puanlandı mı. */
  scored: boolean;
  /** 1. katmanın kredilediği kanıtlanmış kusurlar. */
  caught: string[];
  /** Aynı-satıcı denetimin kaçırdığı kanıtlanmış kusurlar. */
  missed: string[];
}

export function power2x2(input: PowerInput): PowerVerdict {
  if (!input.ran) {
    return {
      kind: "olculemedi",
      reason: "gizli süit koşmadı — yer gerçeği yok, hiçbir şey puanlanamaz",
    };
  }
  // Çıkış kodu kancalardan ÖNCE sorulıyor: çökmüş bir üretimin kırmızıları
  // kusur değil, yokluk.
  if (input.producerExit !== 0) {
    return {
      kind: "olculemedi",
      reason: `üretim çağrısı hata ile bitti (exit ${input.producerExit}) — ` +
        "kırmızı kancalar kusur değil, artefaktın yokluğu",
    };
  }
  // Sıra önemli: üretici koşulu denetçi koşulundan ÖNCE. Kusur yoksa
  // denetimin "hepsini yakaladı" demesi anlamsız (sıfırı yakalamak).
  if (input.redHooks.length === 0) return { kind: "olcemez-uretici" };
  if (!input.scored) {
    return { kind: "olculemedi", reason: "aynı-satıcı denetim puanlanamadı" };
  }
  if (input.missed.length === 0) {
    return { kind: "olcemez-denetci", caught: input.caught.length };
  }
  return { kind: "olcer", missed: input.missed };
}

/** Kararın ekrana basılacak hâli; gerekçe karardan ayrılmıyor. */
export function powerLines(v: PowerVerdict): string[] {
  switch (v.kind) {
    case "olculemedi":
      return [
        `ÖLÇÜLEMEDİ — ${v.reason}.`,
        "Bu 'kusur yok' DEĞİL. Sebebi gider ve tekrar koş.",
      ];
    case "olcemez-uretici":
      return [
        "ÖLÇEMEZ (1. koşul) — üretici kusur üretmedi.",
        "Denetçinin yakalayacağı bir şey yok; dört hücre de aynı sonucu verir.",
        "Daha zayıf bir üretici ya da daha zor bir görev dene.",
      ];
    case "olcemez-denetci":
      return [
        `ÖLÇEMEZ (2. koşul) — aynı-satıcı denetim ${v.caught}/${v.caught} yakaladı.`,
        "Kusuru üretmek zor ama GÖRMEK kolay: iyileştirilecek kaçırma yok,",
        "göreli azalma tanımsız kalır. Çaprazlama en iyi durumda eşitler.",
        "Gereken: aynı-satıcı denetimin KAÇIRDIĞI bir kusur.",
      ];
    case "olcer":
      return [
        `ÖLÇER — aynı-satıcı denetim ${v.missed.length} kusuru kaçırdı: ${v.missed.join("; ")}`,
        "Çaprazlamanın iyileştirecek bir şeyi var; tam matris anlamlı.",
      ];
  }
}
