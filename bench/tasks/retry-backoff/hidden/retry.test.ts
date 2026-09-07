// GİZLİ — üretici bu dosyayı hiç görmez. Yer gerçeği buradan gelir.
// Her `it` bloğu bir kusur kancası: kırmızıysa kanıtlanmış bir hata vardır.
import { describe, expect, it, vi } from "vitest";
import { retry } from "../artifact/src/retry.js";

/** Beklemeleri kaydeden sahte sleep; gerçek zaman geçmez. */
function recorder() {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => void waits.push(ms) };
}

describe("retry", () => {
  it("ilk denemede başarılıysa sonucu döndürür ve hiç beklemez", async () => {
    const r = recorder();
    const fn = vi.fn(async () => "ok");
    await expect(retry(fn, { attempts: 3, baseDelayMs: 10, maxDelayMs: 100, sleep: r.sleep }))
      .resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(r.waits).toEqual([]);
  });

  it("attempt numarası 1'den başlar", async () => {
    const r = recorder();
    const seen: number[] = [];
    await retry(async (a) => { seen.push(a); if (a < 3) throw new Error("x"); return a; },
      { attempts: 3, baseDelayMs: 1, maxDelayMs: 100, sleep: r.sleep });
    expect(seen).toEqual([1, 2, 3]);
  });

  it("beklemeler üstel ve maxDelayMs ile sınırlı", async () => {
    const r = recorder();
    await retry(async (a) => { if (a < 5) throw new Error("x"); return a; },
      { attempts: 5, baseDelayMs: 10, maxDelayMs: 45, factor: 2, sleep: r.sleep });
    expect(r.waits).toEqual([10, 20, 40, 45]);
  });

  // Klasik kusur: son başarısız denemeden sonra da bekleyip sonra fırlatmak.
  it("son başarısız denemeden sonra beklemez", async () => {
    const r = recorder();
    await expect(retry(async () => { throw new Error("x"); },
      { attempts: 3, baseDelayMs: 10, maxDelayMs: 1000, sleep: r.sleep })).rejects.toThrow();
    expect(r.waits).toHaveLength(2);
  });

  // Klasik kusur: ilk hatayı saklayıp onu fırlatmak.
  it("hak bittiğinde SON hatayı fırlatır", async () => {
    const r = recorder();
    let n = 0;
    await expect(retry(async () => { throw new Error(`hata-${++n}`); },
      { attempts: 3, baseDelayMs: 1, maxDelayMs: 10, sleep: r.sleep })).rejects.toThrow("hata-3");
  });

  it("yeniden denenemez hatayı anında fırlatır", async () => {
    const r = recorder();
    const fn = vi.fn(async () => { throw new Error("kalici"); });
    await expect(retry(fn, {
      attempts: 5, baseDelayMs: 1, maxDelayMs: 10, sleep: r.sleep,
      isRetryable: (e) => (e as Error).message !== "kalici",
    })).rejects.toThrow("kalici");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(r.waits).toEqual([]);
  });

  it("attempts=1 ise tek deneme, bekleme yok", async () => {
    const r = recorder();
    const fn = vi.fn(async () => { throw new Error("x"); });
    await expect(retry(fn, { attempts: 1, baseDelayMs: 5, maxDelayMs: 5, sleep: r.sleep }))
      .rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(r.waits).toEqual([]);
  });

  it("attempts < 1 ise RangeError", async () => {
    await expect(retry(async () => 1, { attempts: 0, baseDelayMs: 1, maxDelayMs: 1 }))
      .rejects.toBeInstanceOf(RangeError);
  });

  it("factor varsayılanı 2", async () => {
    const r = recorder();
    await expect(retry(async () => { throw new Error("x"); },
      { attempts: 4, baseDelayMs: 10, maxDelayMs: 10_000, sleep: r.sleep })).rejects.toThrow();
    expect(r.waits).toEqual([10, 20, 40]);
  });
});
