/**
 * Ayar ağacı. Hiçbir yerde yerinde değiştirilmez: her değişiklik yeni
 * nesne üretir.
 *
 * Değişmez: **değişmeyen alt ağaç kimliğini korur.** Yani bir dalda
 * hiçbir şey değişmediyse, sonuçta o dal aynı nesnedir (`===`). `render.ts`
 * çizimi düğüm kimliğine göre önbelleklediği için, gereksiz yere yeniden
 * kurulan bir dal ekranın tamamını yeniden çizdirir.
 */
export type Yaprak = string | number | boolean;

export type Deger = Yaprak | readonly Yaprak[] | Dugum;

export interface Dugum {
  readonly [anahtar: string]: Deger;
}

/** Yama: değer yazar, `null` siler, iç içe nesne derine iner. */
export type Yama = {
  readonly [anahtar: string]: Yaprak | readonly Yaprak[] | Yama | null;
};

/** Düğüm mü, yoksa yaprak/dizi mi. */
export function dugumMu(value: unknown): value is Dugum {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** İki dizi eleman eleman aynı mı (`===` ile). */
export function dizilerAyni(a: readonly Yaprak[], b: readonly Yaprak[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
