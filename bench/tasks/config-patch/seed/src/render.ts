import { dugumMu, type Dugum } from "./tree.js";

/**
 * Ağacı metne çizer ve **düğüm kimliğine göre** önbellekler: aynı nesne
 * ikinci kez çizilmez.
 *
 * `cizimSayisi`, önbelleğe düşmeyen düğüm sayısını sayar. Gereksiz yere
 * yeniden kurulmuş bir dal buradan görünür.
 */
export class Cizer {
  readonly #memo = new WeakMap<Dugum, string>();
  #sayac = 0;

  get cizimSayisi(): number {
    return this.#sayac;
  }

  ciz(dugum: Dugum): string {
    const hazir = this.#memo.get(dugum);
    if (hazir !== undefined) return hazir;

    this.#sayac += 1;
    const parcalar: string[] = [];
    for (const anahtar of Object.keys(dugum).sort()) {
      const value = dugum[anahtar] as Dugum | string | number | boolean | readonly unknown[];
      parcalar.push(
        dugumMu(value)
          ? `${anahtar}{${this.ciz(value)}}`
          : `${anahtar}=${Array.isArray(value) ? value.join(",") : String(value)}`,
      );
    }
    const metin = parcalar.join(" ");
    this.#memo.set(dugum, metin);
    return metin;
  }
}
