import { dizilerAyni, dugumMu, type Deger, type Dugum, type Yama, type Yaprak } from "./tree.js";

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
  }

  return degisti ? sonuc : agac;
}

export function ayniDeger(eski: Deger | undefined, yeni: Yaprak | readonly Yaprak[]): boolean {
  if (Array.isArray(eski) && Array.isArray(yeni)) {
    return dizilerAyni(eski as readonly Yaprak[], yeni as readonly Yaprak[]);
  }
  return eski === yeni;
}

/**
 * REFERANS ÇÖZÜM — yalnızca kancaların karşılanabilir olduğunu kanıtlar.
 *
 * Tek kural: yeni nesne ANCAK gerçekten bir şey değiştiyse kurulur. Bu
 * yüzden her dal önce "değişti mi" diye hesaplanır, sonra yazılır.
 */
export function applyPatch(agac: Dugum, yama: Yama): Dugum {
  let degisti = false;
  const sonuc: Record<string, Deger> = { ...agac };

  for (const anahtar of Object.keys(yama)) {
    const istek = yama[anahtar];
    const eski = agac[anahtar];

    if (istek === null) {
      if (anahtar in agac) {
        delete sonuc[anahtar];
        degisti = true;
      }
      continue;
    }

    if (dugumMu(istek)) {
      const alt = dugumMu(eski)
        ? applyPatch(eski, istek as Yama)
        : applyPatch({}, istek as Yama);
      // İkinci dalda `eski` düğüm değil: karşılaştırma kimlikle yapılamaz,
      // çünkü ortada aynı nesne zaten yok.
      if (!dugumMu(eski) || alt !== eski) {
        sonuc[anahtar] = alt;
        degisti = true;
      }
      continue;
    }

    const yeni = istek as Yaprak | readonly Yaprak[];
    if (!ayniDeger(eski, yeni)) {
      sonuc[anahtar] = yeni;
      degisti = true;
    }
  }

  return degisti ? sonuc : agac;
}
