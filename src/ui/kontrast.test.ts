import { describe, expect, it } from "vitest";
import { relativeLuminance, kontrastOrani, NORMAL_TEXT_THRESHOLD, SECONDARY_LABEL_THRESHOLD } from "./kontrast.js";

describe("goreliParlaklik", () => {
  it("siyah 0, beyaz 1", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("gecersiz hex reddediliyor", () => {
    // Kısa form (#RGB) ve eksik '#' bu dosyada hiç üretilmiyor; sessizce
    // yanlış sayı üretmek yerine BAĞIRMASI gerekiyor.
    expect(() => relativeLuminance("#FFF")).toThrow();
    expect(() => relativeLuminance("FFFFFF")).toThrow();
    expect(() => relativeLuminance("#GGGGGG")).toThrow();
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
    const darkBackground = kontrastOrani("#333333", "#555555");
    const lightBackground = kontrastOrani("#333333", "#FFFFFF");
    expect(lightBackground).toBeGreaterThan(darkBackground);
  });
});

describe("esik sabitleri", () => {
  it("normal metin esigi 4.5, ikincil etiket esigi 3", () => {
    expect(NORMAL_TEXT_THRESHOLD).toBe(4.5);
    expect(SECONDARY_LABEL_THRESHOLD).toBe(3);
  });
});

/**
 * EŞİĞİN KENDİSİ PİNLİ OLMALI.
 *
 * Dürüst kayıt: bu sınamaları, "eşiği 4.5'ten 3.0'a düşüren mutasyon
 * ayakta kaldı" diye ekledim. Yanlıştı — mutasyonum dosyadaki İLK
 * "4.5"i değiştiriyordu ve o bir YORUMUN içindeydi. Sabiti doğru
 * çapayla bozunca `token-kontrast.test.ts` zaten düşüyor: eşikler
 * ajanın bıraktığı hâliyle de korunuyordu.
 *
 * Yine de kalıyorlar, çünkü ölçüt DIŞARIDAN geliyor (WCAG 2.1 AA) ve
 * dolaylı korunuyordu: paletin oranları eşiği geçtiği için düşüyordu,
 * sayının KENDİSİ hiçbir yerde yazılı değildi. Palet bir gün eşiğe
 * yaklaşırsa o dolaylı koruma incelir. Dışarıdan gelen bir ölçütün
 * yazılı olduğu yer sınamadır.
 */
describe("eşikler WCAG AA'nın kendisidir", () => {
  it("normal metin eşiği 4.5:1 — gevşetilemez", () => {
    expect(NORMAL_TEXT_THRESHOLD).toBe(4.5);
  });

  it("ikincil etiket eşiği 3:1 — gevşetilemez", () => {
    expect(SECONDARY_LABEL_THRESHOLD).toBe(3);
  });
});

/**
 * ÖLÇÜ GERÇEKTEN REDDEDİYOR MU?
 *
 * Bu, turun asıl boşluğu: kontrast sınamalarının hepsi tek yönlüydü,
 * "şu çift eşiği GEÇİYOR" diyorlardı. Hiçbiri "şu çift KALMALI"
 * demiyordu. Bilinen-kötü bir çift olmadan, ölçünün ısırdığını değil
 * yalnızca büyük sayı döndürdüğünü biliyorduk.
 */
describe("kontrastOrani bilinen-kötü çifti REDDEDER", () => {
  it("açık gri üstünde beyaz AA'yı geçemez", () => {
    const ratio = kontrastOrani("#ffffff", "#bbbbbb");
    expect(ratio).toBeLessThan(NORMAL_TEXT_THRESHOLD);
  });

  it("aynı renk 1:1'dir — ayırt edilemez", () => {
    expect(kontrastOrani("#334455", "#334455")).toBeCloseTo(1, 5);
  });

  // Uç nokta: siyah/beyaz WCAG'de tam 21:1'dir. Hesabın ölçeği
  // kaymışsa burada görünür.
  it("siyah/beyaz tam 21:1", () => {
    expect(kontrastOrani("#000000", "#ffffff")).toBeCloseTo(21, 2);
  });
});
