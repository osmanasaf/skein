// GİZLİ — üretici bu dosyayı hiç görmez. Yer gerçeği buradan gelir.
// Her `it` bloğu bir kusur kancasıdır: kırmızıysa kanıtlanmış bir hata var.
import { describe, expect, it } from "vitest";
import { applyPatch, mergeDefaults } from "../artifact/src/patch.js";
import { Cizer } from "../artifact/src/render.js";
import type { Dugum } from "../artifact/src/tree.js";

/** İki dallı bir ağaç: `sunucu` ve `ekran`. */
const agac = (): Dugum => ({
  sunucu: { host: "localhost", port: 8080, etiketler: ["a", "b"] },
  ekran: { tema: "koyu", satir: 24 },
  surum: 3,
});

describe("yama kuralları", () => {
  it("yaprak değeri yazar", () => {
    const y = applyPatch(agac(), { surum: 4 });
    expect(y["surum"]).toBe(4);
  });

  it("iç içe nesne derine inip birleşir", () => {
    const y = applyPatch(agac(), { sunucu: { port: 9090 } });
    expect(y["sunucu"]).toEqual({ host: "localhost", port: 9090, etiketler: ["a", "b"] });
  });

  it("dizi bütünüyle yerine geçer, eleman eleman birleşmez", () => {
    const y = applyPatch(agac(), { sunucu: { etiketler: ["z"] } });
    expect((y["sunucu"] as Dugum)["etiketler"]).toEqual(["z"]);
  });

  it("null anahtarı siler", () => {
    const y = applyPatch(agac(), { surum: null });
    expect("surum" in y).toBe(false);
  });

  it("null ile alt ağacın tamamı silinir", () => {
    const y = applyPatch(agac(), { ekran: null });
    expect(Object.keys(y).sort()).toEqual(["sunucu", "surum"]);
  });

  it("ağaçta karşılığı nesne olmayan anahtara nesne yazılır", () => {
    const y = applyPatch(agac(), { surum: { major: 3 } });
    expect(y["surum"]).toEqual({ major: 3 });
  });

  it("yeni anahtar eklenir", () => {
    const y = applyPatch(agac(), { gunluk: { seviye: "hata" } });
    expect(y["gunluk"]).toEqual({ seviye: "hata" });
  });
});

describe("girdi bozulmaz", () => {
  it("girdi ağacı değişmez", () => {
    const a = agac();
    const kopya = JSON.parse(JSON.stringify(a)) as unknown;
    applyPatch(a, { sunucu: { port: 1 }, ekran: null, yeni: 5 });
    expect(JSON.parse(JSON.stringify(a))).toEqual(kopya);
  });

  it("yama nesnesi değişmez", () => {
    const yama = { sunucu: { port: 1 } };
    const kopya = JSON.parse(JSON.stringify(yama)) as unknown;
    applyPatch(agac(), yama);
    expect(JSON.parse(JSON.stringify(yama))).toEqual(kopya);
  });
});

describe("kimlik kuralı", () => {
  it("boş yama kökün kendisini döndürür", () => {
    const a = agac();
    expect(applyPatch(a, {})).toBe(a);
  });

  it("aynı yaprak değeri yazmak değişiklik sayılmaz", () => {
    const a = agac();
    expect(applyPatch(a, { surum: 3 })).toBe(a);
  });

  it("eleman eleman aynı dizi değişiklik sayılmaz", () => {
    const a = agac();
    expect(applyPatch(a, { sunucu: { etiketler: ["a", "b"] } })).toBe(a);
  });

  it("olmayan anahtarı silmek değişiklik sayılmaz", () => {
    const a = agac();
    expect(applyPatch(a, { yok: null })).toBe(a);
  });

  it("var olan düğüme boş nesne yaması değişiklik sayılmaz", () => {
    const a = agac();
    expect(applyPatch(a, { sunucu: {} })).toBe(a);
  });

  it("derinde hiçbir şey değişmiyorsa kök yine kendisidir", () => {
    const a = agac();
    expect(applyPatch(a, { sunucu: { host: "localhost" }, ekran: { satir: 24 } })).toBe(a);
  });

  it("dokunulmayan dal aynı nesne kalır", () => {
    const a = agac();
    const y = applyPatch(a, { sunucu: { port: 9090 } });
    expect(y["ekran"]).toBe(a["ekran"]);
  });

  it("değişen dal yeni nesne olur", () => {
    const a = agac();
    const y = applyPatch(a, { sunucu: { port: 9090 } });
    expect(y["sunucu"]).not.toBe(a["sunucu"]);
    expect(y).not.toBe(a);
  });

  it("silme sonrası kardeş dal aynı nesne kalır", () => {
    const a = agac();
    const y = applyPatch(a, { ekran: null });
    expect(y["sunucu"]).toBe(a["sunucu"]);
  });
});

describe("çizim önbelleği — kimliğin görünen bedeli", () => {
  it("değişiklik olmayan yamadan sonra hiçbir düğüm yeniden çizilmez", () => {
    const a = agac();
    const c = new Cizer();
    c.ciz(a);
    const once = c.cizimSayisi;
    c.ciz(applyPatch(a, { surum: 3 }));
    expect(c.cizimSayisi).toBe(once);
  });

  it("tek dal değişince yalnızca kök ve o dal yeniden çizilir", () => {
    const a = agac();
    const c = new Cizer();
    c.ciz(a);
    const once = c.cizimSayisi;
    c.ciz(applyPatch(a, { sunucu: { port: 9090 } }));
    expect(c.cizimSayisi - once).toBe(2);
  });

  it("derin değişiklik yalnızca o yolu yeniden çizdirir", () => {
    const derin: Dugum = { a: { b: { c: { d: 1 } } }, yan: { x: 1 } };
    const c = new Cizer();
    c.ciz(derin);
    const once = c.cizimSayisi;
    c.ciz(applyPatch(derin, { a: { b: { c: { d: 2 } } } }));
    expect(c.cizimSayisi - once).toBe(4);
  });
});

describe("mevcut sözleşme", () => {
  it("mergeDefaults eksik anahtarları doldurmaya devam eder", () => {
    const y = mergeDefaults({ a: 1 } as Dugum, { a: 9, b: 2 } as Dugum);
    expect(y).toEqual({ a: 1, b: 2 });
  });

  it("mergeDefaults eklenecek bir şey yoksa kökü döndürmeye devam eder", () => {
    const a = { a: 1 } as Dugum;
    expect(mergeDefaults(a, { a: 9 } as Dugum)).toBe(a);
  });
});

// ————————————————————————————————————————————————————————————————
// Sayılı örnek yerine RASTGELE ama yeniden üretilebilir diziler.
//
// Elle yazılmış yirmi örnek, elle yazılmış bir çözümün düşündüğü yirmi
// durumu ölçer. Aşağıdaki iki kanca 300 rastgele ağaç/yama çifti üretip
// hem değeri hem kimlik kuralını sınıyor — kusur, yazarın aklına gelmeyen
// birleşimde çıkar.
// ————————————————————————————————————————————————————————————————

/** mulberry32 — tohumu sabit, dizisi her koşuda aynı. */
function rastgele(tohum: number): () => number {
  let a = tohum;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ANAHTARLAR = ["a", "b", "c", "d"];
const YAPRAKLAR = [1, 2, "x", "y", true, false];

function rastgeleAgac(r: () => number, derinlik: number): Dugum {
  const dugum: Record<string, unknown> = {};
  for (const anahtar of ANAHTARLAR) {
    const p = r();
    if (p < 0.25) continue;
    if (p < 0.45 && derinlik > 0) dugum[anahtar] = rastgeleAgac(r, derinlik - 1);
    else if (p < 0.6) dugum[anahtar] = [YAPRAKLAR[Math.floor(r() * YAPRAKLAR.length)]];
    else dugum[anahtar] = YAPRAKLAR[Math.floor(r() * YAPRAKLAR.length)];
  }
  return dugum as Dugum;
}

/** Ağacın kendi değerlerini de kullanan yama: "aynı değeri yaz" da çıksın. */
function rastgeleYama(r: () => number, agac: Dugum, derinlik: number): Record<string, unknown> {
  const yama: Record<string, unknown> = {};
  for (const anahtar of ANAHTARLAR) {
    const p = r();
    if (p < 0.35) continue;
    const mevcut = agac[anahtar];
    if (p < 0.5) yama[anahtar] = null;
    else if (p < 0.62 && mevcut !== undefined) {
      // Zaten oradaki değeri yaz: değişiklik sayılmamalı.
      yama[anahtar] = Array.isArray(mevcut) ? [...(mevcut as unknown[])] : mevcut;
    } else if (p < 0.78 && derinlik > 0) {
      const alt = (typeof mevcut === "object" && mevcut !== null && !Array.isArray(mevcut)
        ? mevcut
        : {}) as Dugum;
      yama[anahtar] = rastgeleYama(r, alt, derinlik - 1);
    } else if (p < 0.88) {
      yama[anahtar] = [YAPRAKLAR[Math.floor(r() * YAPRAKLAR.length)]];
    } else {
      yama[anahtar] = YAPRAKLAR[Math.floor(r() * YAPRAKLAR.length)];
    }
  }
  return yama;
}

const nesneMi = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Kimliği hiç umursamayan, yalnızca DEĞERİ doğru hesaplayan bağımsız uygulama. */
function beklenenDeger(agac: Record<string, unknown>, yama: Record<string, unknown>): Record<string, unknown> {
  const sonuc: Record<string, unknown> = { ...agac };
  for (const anahtar of Object.keys(yama)) {
    const istek = yama[anahtar];
    if (istek === null) {
      delete sonuc[anahtar];
      continue;
    }
    if (nesneMi(istek)) {
      const eski = agac[anahtar];
      sonuc[anahtar] = beklenenDeger(nesneMi(eski) ? eski : {}, istek);
      continue;
    }
    sonuc[anahtar] = istek;
  }
  return sonuc;
}

/** Derin eşit olan her alt ağaç AYNI nesne olmalı — kimlik kuralının kendisi. */
function kimlikBozulmasi(
  once: unknown,
  sonra: unknown,
  yol: string,
): string | undefined {
  if (!nesneMi(once) || !nesneMi(sonra)) return undefined;
  if (JSON.stringify(once) === JSON.stringify(sonra) && once !== sonra) {
    return yol === "" ? "(kök)" : yol;
  }
  for (const anahtar of Object.keys(sonra)) {
    const bozuk = kimlikBozulmasi(once[anahtar], sonra[anahtar], `${yol}.${anahtar}`);
    if (bozuk !== undefined) return bozuk;
  }
  return undefined;
}

describe("rastgele diziler", () => {
  it("300 rastgele ağaç/yama çiftinde değer doğru", () => {
    for (let tohum = 1; tohum <= 300; tohum += 1) {
      const r = rastgele(tohum);
      const agac = rastgeleAgac(r, 3);
      const yama = rastgeleYama(r, agac, 3);
      const alinan = applyPatch(agac, yama as never);
      const beklenen = beklenenDeger(agac as Record<string, unknown>, yama);
      expect({ tohum, sonuc: alinan }).toEqual({ tohum, sonuc: beklenen });
    }
  });

  it("300 rastgele çiftte değişmeyen alt ağaç kimliğini korur", () => {
    for (let tohum = 1; tohum <= 300; tohum += 1) {
      const r = rastgele(tohum);
      const agac = rastgeleAgac(r, 3);
      const yama = rastgeleYama(r, agac, 3);
      const sonra = applyPatch(agac, yama as never);
      const bozuk = kimlikBozulmasi(agac, sonra, "");
      expect({ tohum, bozukDal: bozuk }).toEqual({ tohum, bozukDal: undefined });
    }
  });
});
