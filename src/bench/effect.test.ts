import { describe, expect, it } from "vitest";
import type { SkeinEvent } from "../events/log.js";
import { effectReport } from "./effect.js";

const ev = (e: Partial<SkeinEvent> & { type: string }, runId: string): SkeinEvent =>
  ({ v: 1, at: "2026-01-01T00:00:00.000Z", runId, ...e }) as SkeinEvent;

/** Bir denetim hücresi: kim üretti, kim inceledi, kaç kanca kaçtı. */
function cell(
  runId: string,
  producer: string,
  reviewer: string,
  hooks: number,
  missed: number,
  unverified = 0,
): SkeinEvent[] {
  const id = `${runId}/${producer}-by-${reviewer}`;
  const names = Array.from({ length: hooks }, (_, i) => `k${i + 1}`);
  return [
    ev({ type: "review.done", cell: id, producer, reviewer, crossed: producer !== reviewer, promptHash: "h", path: "p" }, runId),
    ev({
      type: "judge.scored", cell: id, judge: "J", hooks,
      missed: names.slice(0, missed),
      caught: names.slice(missed),
      unverified: names.slice(0, unverified),
    }, runId),
  ];
}

/** Üç tekrar; her tekrarda aynı-model hücreler 4/10, çapraz hücreler 2/10 kaçırıyor. */
const threeRuns = (crossedMissed = 2): SkeinEvent[] =>
  ["r1", "r2", "r3"].flatMap((r) => [
    ...cell(r, "A", "A", 10, 4),
    ...cell(r, "B", "B", 10, 4),
    ...cell(r, "A", "B", 10, crossedMissed),
    ...cell(r, "B", "A", 10, crossedMissed),
  ]);

describe("effectReport", () => {
  it("çiftleri, iki tarafı ve göreli azalmayı hesaplar", () => {
    const e = effectReport(threeRuns());
    expect(e.pairs).toHaveLength(4);
    expect(e.same?.missRate).toBeCloseTo(0.4);
    expect(e.crossed?.missRate).toBeCloseTo(0.2);
    expect(e.relativeReduction).toBeCloseTo(0.5);
    expect(e.interaction).toBeCloseTo(0.2);
  });

  it("eşiğin üstünde ve işaret tutarlıysa olumlu karar verir", () => {
    const e = effectReport(threeRuns());
    expect(e.verdict.code).toBe("olumlu");
    expect(e.repeats).toBe(3);
  });

  // Karar kuralı sonuçtan önce yazıldı ve bir kez ihlal edildi: tek koşudan
  // "bu görev kolay" sonucu çıkarılmıştı. Artık makineye bağlı.
  it("k<3 iken sayıyı gösterir ama karar vermez", () => {
    const e = effectReport([
      ...cell("r1", "A", "A", 10, 4),
      ...cell("r1", "A", "B", 10, 1),
    ]);
    expect(e.relativeReduction).toBeCloseTo(0.75);
    expect(e.verdict.code).toBe("yetersiz");
    expect(e.verdict.reason).toMatch(/k=1/);
  });

  it("eşiğin altındaki azalma olumsuz karardır", () => {
    const e = effectReport(threeRuns(4));
    expect(e.relativeReduction).toBe(0);
    expect(e.verdict.code).toBe("olumsuz");
    expect(e.verdict.reason).toMatch(/PHILOSOPHY/);
  });

  // Havuzlanmış sayı eşiği geçse bile, bir tekrarda etki ters yöndeyse
  // "tekrarlar arası varyansın dışında" şartı sağlanmamıştır.
  it("tekrarlar arasında işaret tutarsızsa olumlu demez", () => {
    const e = effectReport([
      ...cell("r1", "A", "A", 10, 9), ...cell("r1", "A", "B", 10, 1),
      ...cell("r2", "A", "A", 10, 5), ...cell("r2", "A", "B", 10, 1),
      ...cell("r3", "A", "A", 10, 1), ...cell("r3", "A", "B", 10, 3),
    ]);
    expect(e.relativeReduction).toBeGreaterThan(0.2);
    expect(e.verdict.code).toBe("belirsiz");
    expect(e.verdict.reason).toMatch(/tutarsız/);
  });

  // Sıfıra bölmek sonsuz bir etki uydururdu; kaçırma yoksa ölçüm gücü de yok.
  it("aynı-model hücrelerde hiç kaçırma yoksa azalma tanımsızdır", () => {
    const e = effectReport([
      ...cell("r1", "A", "A", 10, 0),
      ...cell("r1", "A", "B", 10, 0),
    ]);
    expect(e.relativeReduction).toBeNull();
    expect(e.verdict.code).toBe("yetersiz");
    expect(e.verdict.reason).toMatch(/tanımsız/);
  });

  it("eksik hücreyle etkileşim terimi hesaplamaz", () => {
    const e = effectReport([...cell("r1", "A", "A", 10, 4), ...cell("r1", "A", "B", 10, 2)]);
    expect(e.interaction).toBeNull();
  });

  it("doğrulanamayan alıntıları sayar", () => {
    const e = effectReport([...cell("r1", "A", "A", 10, 4, 2)]);
    expect(e.unverified).toBe(2);
  });

  // Denetim kaydı olmayan puan, kimin kimi incelediğini söyleyemez.
  it("review.done'ı olmayan puanı sayıya katmaz", () => {
    const e = effectReport([
      ev({ type: "judge.scored", cell: "yetim", judge: "J", hooks: 5, caught: [], missed: ["k1"], unverified: [] }, "r1"),
    ]);
    expect(e.pairs).toHaveLength(0);
    expect(e.verdict.code).toBe("yetersiz");
  });
});
