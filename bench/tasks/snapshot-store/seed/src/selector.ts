import type { Item, State } from "./state.js";

/**
 * Türetilmiş görünümler. Ekran her karede çağırıyor, bu yüzden hesap
 * `version`a göre önbellekleniyor: aynı sürüm için yeniden hesaplanmaz.
 */
export function createBitmemisSayaci(): (state: State) => number {
  let sonSurum = -1;
  let sonuc = 0;
  return (state) => {
    if (state.version === sonSurum) return sonuc;
    sonSurum = state.version;
    sonuc = state.items.filter((i) => !i.done).length;
    return sonuc;
  };
}

export interface Degisim {
  readonly eklenen: readonly Item[];
  readonly cikan: readonly Item[];
}

/**
 * Ardışık iki durum arasındaki farkı verir.
 *
 * Bir önceki anlık görüntüyü elinde tutar ve bir sonraki çağrıda onunla
 * karşılaştırır — yani geçmişten bir `State` bu nesnenin içinde yaşamaya
 * devam eder.
 */
export function createDegisimIzleyici(baslangic: State): (state: State) => Degisim {
  let onceki = baslangic;
  return (state) => {
    const oncekiIdler = new Set(onceki.items.map((i) => i.id));
    const yeniIdler = new Set(state.items.map((i) => i.id));
    const degisim: Degisim = {
      eklenen: state.items.filter((i) => !oncekiIdler.has(i.id)),
      cikan: onceki.items.filter((i) => !yeniIdler.has(i.id)),
    };
    onceki = state;
    return degisim;
  };
}
