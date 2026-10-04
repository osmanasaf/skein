import { describe, expect, it } from "vitest";
import { power2x2, powerLines } from "./power.js";

const girdi = (over: Partial<Parameters<typeof power2x2>[0]> = {}) => ({
  ran: true, producerExit: 0, redHooks: ["k1", "k2"], scored: true,
  caught: ["k1", "k2"], missed: [], ...over,
});

// Ölçüt 4 Ekim'deki ilk çapraz satıcı koşusundan geliyor: aynı-satıcı denetim
// kusurun ikisini de yakaladığı için göreli azalma TANIMSIZ kaldı ve karar
// çıkmadı. İkinci koşul o yüzden var.
describe("power2x2", () => {
  it("iki koşul da sağlanıyorsa ÖLÇER", () => {
    expect(power2x2(girdi({ caught: ["k1"], missed: ["k2"] })))
      .toEqual({ kind: "olcer", missed: ["k2"] });
  });

  it("üretici kusur üretmediyse ÖLÇEMEZ (1. koşul)", () => {
    expect(power2x2(girdi({ redHooks: [], caught: [], missed: [] })))
      .toEqual({ kind: "olcemez-uretici" });
  });

  // `snapshot-store` tam olarak burada: kusuru üretmek zor, görmek kolay.
  it("aynı-satıcı denetim hepsini yakaladıysa ÖLÇEMEZ (2. koşul)", () => {
    expect(power2x2(girdi({ caught: ["k1", "k2"], missed: [] })))
      .toEqual({ kind: "olcemez-denetci", caught: 2 });
  });

  it("süit koşmadıysa ÖLÇÜLEMEDİ — 'kusur yok' ile karıştırılmaz", () => {
    const v = power2x2(girdi({ ran: false, redHooks: [] }));
    expect(v.kind).toBe("olculemedi");
    expect(v.kind === "olculemedi" && v.reason).toMatch(/yer gerçeği yok/);
  });

  // Sıra önemli: kusur yoksa "hepsini yakaladı" demek sıfırı yakalamaktır.
  it("kusur yokken denetçi koşuluna DÜŞMEZ", () => {
    expect(power2x2(girdi({ redHooks: [], caught: [], missed: [], scored: true })).kind)
      .toBe("olcemez-uretici");
  });

  // Olmayan bir modelle koşturulan ilk denemede ajan çöktü, artefakt boş
  // kaldı ve 14 kanca kırmızı düştü: sayıya bakan ön kontrol o hücreyi
  // "ölçüm gücü yüksek" diye okudu. Çökmüş üretimin kırmızıları kusur değil.
  it("üretim çağrısı hata ile bittiyse ÖLÇÜLEMEDİ — kırmızılar kusur sayılmaz", () => {
    const v = power2x2(girdi({ producerExit: 1, redHooks: ["k1", "k2"], caught: [], missed: ["k1"] }));
    expect(v.kind).toBe("olculemedi");
    expect(v.kind === "olculemedi" && v.reason).toMatch(/artefaktın yokluğu/);
  });

  it("puanlama tamamlanmadıysa ÖLÇÜLEMEDİ", () => {
    const v = power2x2(girdi({ scored: false }));
    expect(v.kind).toBe("olculemedi");
    expect(v.kind === "olculemedi" && v.reason).toMatch(/puanlanamadı/);
  });
});

describe("powerLines", () => {
  it("ÖLÇEMEZ (2. koşul) gerekçesini TAŞIR — sayı tek başına öğretmiyor", () => {
    const satirlar = powerLines({ kind: "olcemez-denetci", caught: 2 }).join(" ");
    expect(satirlar).toMatch(/göreli azalma tanımsız/);
    expect(satirlar).toMatch(/KAÇIRDIĞI bir kusur/);
  });

  it("ÖLÇER kaçan kusurları adıyla söyler", () => {
    expect(powerLines({ kind: "olcer", missed: ["version geri gitmez"] })[0])
      .toMatch(/version geri gitmez/);
  });

  it("ÖLÇÜLEMEDİ 'kusur yok' demediğini açıkça söyler", () => {
    expect(powerLines({ kind: "olculemedi", reason: "x" }).join(" ")).toMatch(/'kusur yok' DEĞİL/);
  });
});
