import { describe, expect, it } from "vitest";
import type { SkeinEvent } from "../events/log.js";
import { effectReport } from "./effect.js";
import { noiseReport } from "./noise.js";

const ev = (e: Partial<SkeinEvent> & { type: string }, runId: string): SkeinEvent =>
  ({ v: 1, at: "2026-01-01T00:00:00.000Z", runId, ...e }) as SkeinEvent;

interface Counts {
  real?: number; nit?: number; wrong?: number;
  proven?: number; uncertain?: number; unverified?: number;
}

/** Bir denetim hücresi ve onun sınıflaması. */
function cell(runId: string, producer: string, reviewer: string, c: Counts): SkeinEvent[] {
  const id = `${runId}/${producer}-by-${reviewer}`;
  const real = c.real ?? 0, nit = c.nit ?? 0, wrong = c.wrong ?? 0, uncertain = c.uncertain ?? 0;
  return [
    ev({ type: "review.done", cell: id, producer, reviewer, crossed: producer !== reviewer, promptHash: "h", path: "p" }, runId),
    ev({
      type: "judge.classified", cell: id, judge: "J",
      findings: real + nit + wrong + uncertain,
      real, nit, wrong, uncertain,
      proven: c.proven ?? 0, unverified: c.unverified ?? 0, path: `${id}/siniflama.json`,
    }, runId),
  ];
}

describe("noiseReport", () => {
  it("aynı ve çapraz tarafı ayrı ayrı özetler", () => {
    const n = noiseReport([
      ev({ type: "run.started", taskId: "async-pool" }, "r1"),
      ...cell("r1", "A", "A", { real: 1, nit: 3, wrong: 0 }),
      ...cell("r1", "A", "B", { real: 2, nit: 1, wrong: 1 }),
    ]);
    expect(n.groups).toHaveLength(1);
    const g = n.groups[0];
    expect(g?.taskId).toBe("async-pool");
    expect(g?.same?.nitRate).toBeCloseTo(3 / 4);
    expect(g?.crossed?.nitRate).toBeCloseTo(1 / 4);
    expect(g?.crossed?.wrongRate).toBeCloseTo(1 / 4);
    expect(g?.crossed?.realPerReport).toBeCloseTo(2);
  });

  // Kanıtlanmış kusuru tarif eden bulgu 1. katmanda sayıldı. Burada da
  // paydaya girseydi aynı bulgu iki katmanda birden puan üretirdi.
  it("kanıtlı bulguları oranların dışında tutar", () => {
    const n = noiseReport([
      ev({ type: "run.started", taskId: "async-pool" }, "r1"),
      ...cell("r1", "A", "B", { real: 1, nit: 1, proven: 8 }),
    ]);
    expect(n.total?.proven).toBe(8);
    expect(n.total?.findings).toBe(2);
    expect(n.total?.nitRate).toBeCloseTo(0.5);
  });

  // Hakemin karar veremediği bulgu ne gürültüdür ne değer; paydaya girerse
  // iki oranı da olduğundan düşük gösterir.
  it("belirsiz bulgular paydaya girmez", () => {
    const n = noiseReport([
      ev({ type: "run.started", taskId: "async-pool" }, "r1"),
      ...cell("r1", "A", "B", { nit: 1, wrong: 1, uncertain: 6 }),
    ]);
    expect(n.total?.uncertain).toBe(6);
    expect(n.total?.nitRate).toBeCloseTo(0.5);
    expect(n.total?.wrongRate).toBeCloseTo(0.5);
  });

  it("görev × kurgu grubunu nesnel katmanla aynı böler", () => {
    const n = noiseReport([
      ev({ type: "run.started", taskId: "g1" }, "r1"), ...cell("r1", "A", "B", { nit: 1 }),
      ev({ type: "run.started", taskId: "g2" }, "r2"), ...cell("r2", "A", "B", { nit: 1 }),
      ev({ type: "run.started", taskId: "g1" }, "r3"), ...cell("r3", "A", "C", { nit: 1 }),
    ]);
    expect(n.groups.map((g) => `${g.taskId}:${g.models.join("×")}`))
      .toEqual(["g1:A×B", "g2:A×B", "g1:A×C"]);
  });

  it("denetim kaydı olmayan sınıflamayı saymaz", () => {
    const n = noiseReport([
      ev({ type: "judge.classified", cell: "yetim", judge: "J", findings: 3, real: 3, nit: 0, wrong: 0, proven: 0, uncertain: 0, unverified: 0, path: "p" }, "r1"),
    ]);
    expect(n.groups).toHaveLength(0);
    expect(n.total).toBeNull();
  });

  it("doğrulanamayan alıntıları ayrı sayar", () => {
    const n = noiseReport([
      ev({ type: "run.started", taskId: "g1" }, "r1"),
      ...cell("r1", "A", "B", { real: 1, unverified: 4 }),
    ]);
    expect(n.unverified).toBe(4);
  });
});

// İki katmanın ayrılığı bir yorum değil, sınanabilir bir özellik olmalı:
// 2. katmanın olayları karara hiçbir yoldan giremez.
describe("katmanlar harmanlanmaz", () => {
  const objective: SkeinEvent[] = ["r1", "r2", "r3"].flatMap((r) => [
    ev({ type: "run.started", taskId: "g1" }, r),
    ev({ type: "review.done", cell: `${r}/A-by-A`, producer: "A", reviewer: "A", crossed: false, promptHash: "h", path: "p" }, r),
    ev({ type: "judge.scored", cell: `${r}/A-by-A`, judge: "J", hooks: 10, caught: ["k1"], missed: ["k2", "k3", "k4", "k5"], unverified: [] }, r),
    ev({ type: "review.done", cell: `${r}/A-by-B`, producer: "A", reviewer: "B", crossed: true, promptHash: "h", path: "p" }, r),
    ev({ type: "judge.scored", cell: `${r}/A-by-B`, judge: "J", hooks: 10, caught: ["k1", "k2", "k3", "k4"], missed: ["k5"], unverified: [] }, r),
  ]);

  it("sınıflama olayları kararı ve sayıları değiştirmez", () => {
    const before = effectReport(objective);
    // Çapraz hücreleri gürültüyle dolduran, aynı hücreleri tertemiz gösteren
    // bir sınıflama: karara sızabilseydi işareti ters çevirirdi.
    const withNoise = effectReport([
      ...objective,
      ...["r1", "r2", "r3"].flatMap((r) => [
        ev({ type: "judge.classified", cell: `${r}/A-by-A`, judge: "J", findings: 1, real: 1, nit: 0, wrong: 0, proven: 0, uncertain: 0, unverified: 0, path: "p" }, r),
        ev({ type: "judge.classified", cell: `${r}/A-by-B`, judge: "J", findings: 40, real: 0, nit: 20, wrong: 20, proven: 0, uncertain: 0, unverified: 0, path: "p" }, r),
      ]),
    ]);
    expect(withNoise.relativeReduction).toBe(before.relativeReduction);
    expect(withNoise.verdict).toEqual(before.verdict);
    expect(before.verdict.code).toBe("olumlu");
  });
});

describe("yeniden sınıflama", () => {
  it("hücre başına yalnızca son sınıflamayı sayar", () => {
    const n = noiseReport([
      ev({ type: "run.started", taskId: "g1" }, "r1"),
      ...cell("r1", "A", "B", { nit: 9 }),
      ...cell("r1", "A", "B", { real: 1, nit: 1 }),
    ]);
    expect(n.total?.reports).toBe(1);
    expect(n.total?.nit).toBe(1);
    expect(n.total?.nitRate).toBeCloseTo(0.5);
  });
});
