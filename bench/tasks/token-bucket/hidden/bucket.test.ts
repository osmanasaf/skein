// GİZLİ — üretici bu dosyayı hiç görmez. Yer gerçeği buradan gelir.
// Her `it` bir kusur kancası: adı kusuru tarif eder, numara vermez.
import { describe, expect, it } from "vitest";
import { TokenBucket } from "../artifact/src/bucket.js";

/** Elle ilerletilebilen sahte saat. */
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms), set: (ms: number) => void (t = ms) };
}

const make = (capacity: number, refillPerSecond: number, c = clock()) =>
  ({ bucket: new TokenBucket({ capacity, refillPerSecond, now: c.now }), clock: c });

describe("TokenBucket", () => {
  it("kova dolu başlar", () => {
    const { bucket } = make(10, 1);
    expect(bucket.available()).toBe(10);
  });

  it("yeterli token varsa düşer ve true döner", () => {
    const { bucket } = make(10, 1);
    expect(bucket.tryRemove(3)).toBe(true);
    expect(bucket.available()).toBe(7);
  });

  it("count varsayılanı 1", () => {
    const { bucket } = make(10, 1);
    bucket.tryRemove();
    expect(bucket.available()).toBe(9);
  });

  // Klasik kusur: yetmediği halde kısmi düşmek.
  it("yetersizse HİÇBİR ŞEY düşmez", () => {
    const { bucket } = make(5, 1);
    expect(bucket.tryRemove(9)).toBe(false);
    expect(bucket.available()).toBe(5);
  });

  it("count capacity'den büyükse asla başaramaz", () => {
    const { bucket, clock: c } = make(5, 100);
    c.advance(10_000);
    expect(bucket.tryRemove(6)).toBe(false);
  });

  it("geçen zamanla orantılı dolar", () => {
    const { bucket, clock: c } = make(10, 2);
    bucket.tryRemove(10);
    c.advance(2_000);
    expect(bucket.available()).toBeCloseTo(4, 6);
  });

  it("doldurma capacity'yi aşmaz", () => {
    const { bucket, clock: c } = make(10, 5);
    bucket.tryRemove(10);
    c.advance(60_000);
    expect(bucket.available()).toBe(10);
  });

  // En sık kusur: kesirli token'ı erken yuvarlayıp kaybetmek.
  it("kısmi doldurma kaybolmaz — çok kısa çağrılar tek uzun bekleyişe eşit", () => {
    const { bucket, clock: c } = make(10, 1);
    bucket.tryRemove(10);
    for (let i = 0; i < 10; i += 1) {
      c.advance(100);
      bucket.available();
    }
    expect(bucket.available()).toBeCloseTo(1, 6);
  });

  it("kesirli refill oranı çalışır", () => {
    const { bucket, clock: c } = make(10, 0.5);
    bucket.tryRemove(10);
    c.advance(4_000);
    expect(bucket.available()).toBeCloseTo(2, 6);
  });

  // Klasik kusur: saat geri gidince negatif geçen süre ile token eksiltmek.
  it("zaman geri giderse token EKSİLMEZ", () => {
    const c = clock();
    const { bucket } = make(10, 1, c);
    bucket.tryRemove(5);
    const before = bucket.available();
    c.advance(-5_000);
    expect(bucket.available()).toBeGreaterThanOrEqual(before);
  });

  it("available() kovayı değiştirmez", () => {
    const { bucket } = make(10, 1);
    bucket.available(); bucket.available();
    expect(bucket.available()).toBe(10);
  });

  it("negatif count RangeError", () => {
    const { bucket } = make(10, 1);
    expect(() => bucket.tryRemove(-1)).toThrow(RangeError);
  });

  it("sayı olmayan count RangeError", () => {
    const { bucket } = make(10, 1);
    expect(() => bucket.tryRemove(Number.NaN)).toThrow(RangeError);
  });

  it("gerçek zamanı değil enjekte edilen now'ı kullanır", () => {
    let calls = 0;
    const bucket = new TokenBucket({ capacity: 5, refillPerSecond: 1, now: () => { calls += 1; return 0; } });
    bucket.tryRemove(1);
    bucket.available();
    expect(calls).toBeGreaterThan(0);
  });
});
