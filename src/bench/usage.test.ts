import { describe, expect, it } from "vitest";
import { formatUsage, sumUsage, totalUsage } from "./usage.js";

// Kuralın tek cümlesi: BİLDİRİLMEMİŞ ÖLÇÜ SIFIR DEĞİLDİR. `?? 0` ile
// toplamak, abonelik kimliğiyle koşan codex hücrelerini "$0.0000" diye
// gösteriyordu — eksik veri değil, yanlış bilgi.
describe("totalUsage", () => {
  it("dolar bildiren çağrıları toplar", () => {
    expect(totalUsage([{ costUsd: 0.2 }, { costUsd: 0.1 }]).costUsd).toBeCloseTo(0.3);
  });

  it("hiç dolar bildirilmezse costUsd BOŞ kalır — sıfır değil", () => {
    const t = totalUsage([{ inputTokens: 10 }, { inputTokens: 5 }]);
    expect(t.costUsd).toBeUndefined();
    expect("costUsd" in t).toBe(false);
  });

  it("token'ları toplar", () => {
    const t = totalUsage([{ inputTokens: 13607, outputTokens: 11 }, { inputTokens: 100, outputTokens: 2 }]);
    expect(t.inputTokens).toBe(13707);
    expect(t.outputTokens).toBe(13);
  });

  // Karışık kol: claude dolar bildiriyor, codex bildirmiyor. Dolar toplamı
  // yalnızca bildirenleri kapsıyor ve bu AÇIKÇA eksik bir toplam; o yüzden
  // rapor token'ı ortak birim sayıyor.
  it("bir çağrı dolar bildirip öteki bildirmezse yalnızca bildireni toplar", () => {
    const t = totalUsage([{ costUsd: 0.3, inputTokens: 100 }, { inputTokens: 50 }]);
    expect(t.costUsd).toBeCloseTo(0.3);
    expect(t.inputTokens).toBe(150);
  });

  it("boş listede her alan boş", () => {
    expect(totalUsage([])).toEqual({});
    expect(totalUsage([undefined, undefined])).toEqual({});
  });

  it("sıfır dolar bildiren bir çağrı BİLDİRİM sayılır", () => {
    expect(totalUsage([{ costUsd: 0 }]).costUsd).toBe(0);
  });
});

describe("sumUsage", () => {
  it("birinde olmayan alanı ötekinden alır", () => {
    expect(sumUsage({ costUsd: 0.5 }, { inputTokens: 7 })).toEqual({ costUsd: 0.5, inputTokens: 7 });
  });
});

describe("formatUsage", () => {
  it("dolar ve token varsa ikisini basar", () => {
    expect(formatUsage({ costUsd: 0.3011, inputTokens: 13607, outputTokens: 11 }))
      .toBe("$0.3011 · 13607→11 token");
  });

  it("yalnızca dolar varsa onu basar", () => {
    expect(formatUsage({ costUsd: 0.3011 })).toBe("$0.3011");
  });

  // Asıl kazanç: dolar yokluğu SÖYLENİYOR, sessizce sıfır basılmıyor.
  it("dolar yoksa bunu söyler", () => {
    expect(formatUsage({ inputTokens: 13607, outputTokens: 11 }))
      .toBe("13607→11 token · dolar yok (abonelik kimliği)");
  });

  it("hiç ölçü yoksa ÖLÇÜ YOK der — ucuz hücre sanılmasın", () => {
    expect(formatUsage({})).toBe("ÖLÇÜ YOK");
  });
});
