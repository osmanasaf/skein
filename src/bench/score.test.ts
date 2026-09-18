import { describe, expect, it } from "vitest";
import type { SkeinEvent } from "../events/log.js";
import { scoreTargets } from "./score.js";

const ev = (e: Partial<SkeinEvent> & { type: string }, runId = "r1"): SkeinEvent =>
  ({ v: 1, at: "2026-01-01T00:00:00.000Z", runId, ...e }) as SkeinEvent;

/** Ölçüm gücü olan bir 2x2'nin günlüğü: A kusurlu üretti, B temiz. */
const matrixLog = (runId = "r1"): SkeinEvent[] => [
  ev({ type: "run.started", taskId: "snapshot-store" }, runId),
  ev({ type: "agent.started", cell: "runs/A", role: "uretici", provider: "claude", model: "A", promptHash: "h" }, runId),
  ev({ type: "hooks.measured", cell: "runs/A", ran: true, total: 16, red: ["k1", "k2"] }, runId),
  ev({ type: "agent.started", cell: "runs/B", role: "uretici", provider: "claude", model: "B", promptHash: "h" }, runId),
  ev({ type: "hooks.measured", cell: "runs/B", ran: true, total: 16, red: [] }, runId),
  ev({ type: "review.done", cell: "runs/d/A-by-A", producer: "A", reviewer: "A", crossed: false, promptHash: "h", path: "runs/d/A-by-A/rapor.txt" }, runId),
  ev({ type: "review.done", cell: "runs/d/A-by-B", producer: "A", reviewer: "B", crossed: true, promptHash: "h", path: "runs/d/A-by-B/rapor.txt" }, runId),
];

describe("scoreTargets", () => {
  it("kanıtlanmış kusuru olan üretimin denetim hücrelerini hedefler", () => {
    const { targets } = scoreTargets(matrixLog());
    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({
      taskId: "snapshot-store", producer: "A", reviewer: "A", crossed: false, redHooks: ["k1", "k2"],
    });
  });

  // Kusursuz üretim üzerinde denetim puanlamak, kaçırma oranına payda
  // ekler ve etkiyi sessizce sulandırır: yakalanacak bir şey yoktu.
  it("kusursuz üretimin hücrelerini atlar", () => {
    const log = [
      ...matrixLog(),
      ev({ type: "review.done", cell: "runs/d/B-by-A", producer: "B", reviewer: "A", crossed: true, promptHash: "h", path: "p" }),
    ];
    const { targets, skipped } = scoreTargets(log);
    expect(targets.map((t) => t.cell)).not.toContain("runs/d/B-by-A");
    expect(skipped.find((s) => s.cell === "runs/d/B-by-A")?.reason).toMatch(/kanıtlanmış kusur yok/);
  });

  // ÖLÇÜLEMEDİ, "kusur yok" değildir — yer gerçeği olmadan denetim
  // puanlanamaz. Gizli süitin ayrımının puanlama tarafındaki karşılığı.
  it("süiti koşmamış üretimin hücrelerini puanlamaz", () => {
    const log: SkeinEvent[] = [
      ev({ type: "run.started", taskId: "snapshot-store" }),
      ev({ type: "agent.started", cell: "runs/A", role: "uretici", provider: "claude", model: "A", promptHash: "h" }),
      ev({ type: "hooks.measured", cell: "runs/A", ran: false, total: 0, red: [] }),
      ev({ type: "review.done", cell: "runs/d/A-by-A", producer: "A", reviewer: "A", crossed: false, promptHash: "h", path: "p" }),
    ];
    const { targets, skipped } = scoreTargets(log);
    expect(targets).toHaveLength(0);
    expect(skipped[0]?.reason).toMatch(/ÖLÇÜLEMEDİ/);
  });

  it("zaten puanlanmış hücreyi tekrar puanlamaz", () => {
    const log = [
      ...matrixLog(),
      ev({ type: "judge.scored", cell: "runs/d/A-by-A", judge: "J", hooks: 2, caught: ["k1"], missed: ["k2"], unverified: [] }),
    ];
    expect(scoreTargets(log).targets.map((t) => t.cell)).toEqual(["runs/d/A-by-B"]);
    expect(scoreTargets(log, { rescore: true }).targets).toHaveLength(2);
  });

  // İki koşunun aynı modeli aynı kodu üretmez; kusurları koşu sınırını
  // geçerek eşleştirmek, bir koşunun raporunu başka bir koşunun kusuruna
  // karşı puanlamak olurdu.
  it("kusurları koşu sınırını geçerek eşleştirmez", () => {
    const log = [
      ...matrixLog("r1"),
      ev({ type: "run.started", taskId: "snapshot-store" }, "r2"),
      ev({ type: "review.done", cell: "runs2/d/A-by-A", producer: "A", reviewer: "A", crossed: false, promptHash: "h", path: "p" }, "r2"),
    ];
    const { targets, skipped } = scoreTargets(log);
    expect(targets.map((t) => t.runId)).toEqual(["r1", "r1"]);
    expect(skipped.find((s) => s.cell === "runs2/d/A-by-A")?.reason).toMatch(/üretim hücresi bulunamadı/);
  });
});
