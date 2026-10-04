import { describe, expect, it } from "vitest";
import type { SkeinEvent } from "../events/log.js";
import { layerGaps } from "./gap.js";

let seq = 0;
const ev = (e: Record<string, unknown>): SkeinEvent =>
  ({ at: new Date(2026, 9, 4, 0, 0, seq++).toISOString(), runId: "r1", ...e }) as SkeinEvent;

const kurulum = (opts: { cell: string; crossed: boolean; hooks: number; missed: number; proven: number }) => [
  ev({ type: "run.started", taskId: "snapshot-store" }),
  ev({
    type: "review.done", cell: opts.cell, producer: "A", reviewer: "B",
    crossed: opts.crossed, promptHash: "h", path: "p",
  }),
  ev({
    type: "judge.scored", cell: opts.cell, judge: "j", hooks: opts.hooks,
    caught: Array.from({ length: opts.hooks - opts.missed }, (_, i) => `k${i}`),
    missed: Array.from({ length: opts.missed }, (_, i) => `m${i}`),
    unverified: [],
  }),
  ev({
    type: "judge.classified", cell: opts.cell, judge: "j", findings: 0,
    real: 0, nit: 0, wrong: 0, proven: opts.proven, uncertain: 0, unverified: 0,
  }),
];

// 4 Ekim'deki ilk çapraz satıcı koşusu bu boşluğu üretti: codex gerçek bir
// değişmez ihlali buldu, 1. katman "hiçbir kancayı söylemiyor" dedi, 2.
// katman "kanıtlanmışa ait" sayıp oranlardan dışladı. Bulgu hiçbir yere
// düşmedi.
describe("layerGaps", () => {
  it("1. katman kredilemediği hâlde 2. katman kanıtlanmışa sayarsa boşluk bildirir", () => {
    const g = layerGaps(kurulum({ cell: "c1", crossed: true, hooks: 2, missed: 2, proven: 1 }));
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({
      taskId: "snapshot-store", cell: "c1", crossed: true, hooks: 2, caught: 0, proven: 1,
    });
  });

  it("iki katman uyuşuyorsa boşluk yok", () => {
    expect(layerGaps(kurulum({ cell: "c1", crossed: false, hooks: 2, missed: 0, proven: 2 }))).toEqual([]);
  });

  // Ters yön boşluk DEĞİL: tek bir bulgu iki kancayı birden söyleyebilir,
  // o yüzden 1. katmanın daha çok kredilemesi beklenen bir durum.
  it("1. katman daha çok kredilediyse boşluk saymaz", () => {
    expect(layerGaps(kurulum({ cell: "c1", crossed: false, hooks: 2, missed: 0, proven: 1 }))).toEqual([]);
  });

  it("yalnızca tek katmanı olan hücreyi atlar", () => {
    const olaylar = kurulum({ cell: "c1", crossed: true, hooks: 2, missed: 2, proven: 1 })
      .filter((e) => e.type !== "judge.scored");
    expect(layerGaps(olaylar)).toEqual([]);
  });
});
