import { describe, expect, it } from "vitest";
import { backoff } from "./backoff.js";

describe("backoff", () => {
  it("attempt 0 icin baseMs dondurur", () => {
    expect(backoff(0, 100)).toBe(100);
  });

  it("her denemede gecikmeyi iki katina cikarir", () => {
    expect([1, 2, 3, 10].map((a) => backoff(a, 100))).toEqual([200, 400, 800, 102400]);
  });

  it("negatif attempt icin hata firlatir", () => {
    expect(() => backoff(-1, 100)).toThrow(RangeError);
  });
});
