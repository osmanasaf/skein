import { describe, expect, it } from "vitest";
import { goreliParlaklik, kontrastOrani, NORMAL_METIN_ESIGI, IKINCIL_ETIKET_ESIGI } from "./kontrast.js";

describe("goreliParlaklik", () => {
  it("siyah 0, beyaz 1", () => {
    expect(goreliParlaklik("#000000")).toBeCloseTo(0, 5);
    expect(goreliParlaklik("#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("gecersiz hex reddediliyor", () => {
    // Kısa form (#RGB) ve eksik '#' bu dosyada hiç üretilmiyor; sessizce
    // yanlış sayı üretmek yerine BAĞIRMASI gerekiyor.
    expect(() => goreliParlaklik("#FFF")).toThrow();
    expect(() => goreliParlaklik("FFFFFF")).toThrow();
    expect(() => goreliParlaklik("#GGGGGG")).toThrow();
  });
});

describe("kontrastOrani", () => {
  // Bilinen çiftlerde bilinen oranlar — WCAG'ın kendi örnekleri.
  it("siyah/beyaz tam 21:1", () => {
    expect(kontrastOrani("#000000", "#FFFFFF")).toBeCloseTo(21, 2);
  });

  it("ayni renk 1:1", () => {
    expect(kontrastOrani("#336699", "#336699")).toBeCloseTo(1, 5);
  });

  // #767676/beyaz, WCAG belgelerinde AA eşiğinin tam sınırında verilen
  // klasik referans değer (~4.54:1) — bağımsız bir doğrulama noktası.
  it("bilinen referans cift: #767676 / beyaz ~4.54:1", () => {
    expect(kontrastOrani("#767676", "#FFFFFF")).toBeCloseTo(4.54, 1);
  });

  it("sira onemsiz — iki yonde de ayni oran", () => {
    const a = kontrastOrani("#102030", "#EEEEEE");
    const b = kontrastOrani("#EEEEEE", "#102030");
    expect(a).toBeCloseTo(b, 10);
  });

  it("daha acik zemin orani buyutur", () => {
    const koyuZemin = kontrastOrani("#333333", "#555555");
    const acikZemin = kontrastOrani("#333333", "#FFFFFF");
    expect(acikZemin).toBeGreaterThan(koyuZemin);
  });
});

describe("esik sabitleri", () => {
  it("normal metin esigi 4.5, ikincil etiket esigi 3", () => {
    expect(NORMAL_METIN_ESIGI).toBe(4.5);
    expect(IKINCIL_ETIKET_ESIGI).toBe(3);
  });
});
