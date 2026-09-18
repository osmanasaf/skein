import { dizilerAyni, dugumMu, type Deger, type Dugum, type Yaprak } from "./tree.js";

/**
 * Eksik anahtarları varsayılanlarla doldurur.
 *
 * Kimlik paylaşımının bu dosyadaki örneği: bir dalda eklenecek bir şey
 * yoksa o dal AYNI nesne olarak geri döner, yeni nesne kurulmaz. Hiçbir
 * yerde ekleme yoksa kökün kendisi geri döner.
 */
export function mergeDefaults(agac: Dugum, varsayilan: Dugum): Dugum {
  let degisti = false;
  const sonuc: Record<string, Deger> = { ...agac };

  for (const anahtar of Object.keys(varsayilan)) {
    const yeni = varsayilan[anahtar] as Deger;
    const eski = agac[anahtar];

    if (eski === undefined) {
      sonuc[anahtar] = yeni;
      degisti = true;
      continue;
    }
    if (dugumMu(eski) && dugumMu(yeni)) {
      const alt = mergeDefaults(eski, yeni);
      if (alt !== eski) {
        sonuc[anahtar] = alt;
        degisti = true;
      }
      continue;
    }
    // Yaprak zaten var: varsayılan dokunmaz.
  }

  return degisti ? sonuc : agac;
}

/** İki değer, yama açısından "aynı" mı. */
export function ayniDeger(eski: Deger | undefined, yeni: Yaprak | readonly Yaprak[]): boolean {
  if (Array.isArray(eski) && Array.isArray(yeni)) {
    return dizilerAyni(eski as readonly Yaprak[], yeni as readonly Yaprak[]);
  }
  return eski === yeni;
}
