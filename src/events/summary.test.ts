import { describe, expect, it } from "vitest";
import { summarize } from "./summary.js";
import type { SkeinEvent } from "./log.js";

const ev = (e: Partial<SkeinEvent> & { type: string }): SkeinEvent =>
  ({ v: 1, at: "2026-01-01T00:00:00.000Z", runId: "r1", ...e }) as SkeinEvent;

const started = (cell: string, provider: string) =>
  ev({ type: "agent.started", cell, role: "uretici", provider, model: "m", promptHash: "h" });

describe("summarize", () => {
  it("bir hücrenin başlangıç, bitiş ve ölçüm kayıtlarını tek satırda birleştirir", () => {
    const s = summarize([
      started("c1", "claude"),
      ev({ type: "agent.finished", cell: "c1", exitCode: 0, durationMs: 1200, usage: { costUsd: 0.05 } }),
      ev({ type: "hooks.measured", cell: "c1", ran: true, total: 9, red: ["a", "b"] }),
    ]);
    expect(s.cells).toHaveLength(1);
    expect(s.cells[0]).toMatchObject({
      cell: "c1", provider: "claude", exitCode: 0, durationMs: 1200, costUsd: 0.05,
      hooks: { total: 9, red: 2, ran: true },
    });
  });

  it("maliyet ve süreyi hücreler üzerinden toplar", () => {
    const s = summarize([
      started("c1", "claude"),
      ev({ type: "agent.finished", cell: "c1", exitCode: 0, durationMs: 1000, usage: { costUsd: 0.1 } }),
      started("c2", "codex"),
      ev({ type: "agent.finished", cell: "c2", exitCode: 0, durationMs: 2000, usage: { costUsd: 0.2 } }),
    ]);
    expect(s.totalCostUsd).toBeCloseTo(0.3);
    expect(s.totalDurationMs).toBe(3000);
    expect(s.cells.map((c) => c.provider)).toEqual(["claude", "codex"]);
  });

  // Ölçülmemiş hücre ile sıfır kırmızı veren hücre aynı şey değil.
  it("ölçüm kaydı olmayan hücrede hooks tanımsız kalır", () => {
    const s = summarize([started("c1", "claude")]);
    expect(s.cells[0]?.hooks).toBeUndefined();
  });

  it("süit koşmadığında ran=false taşınır", () => {
    const s = summarize([
      started("c1", "claude"),
      ev({ type: "hooks.measured", cell: "c1", ran: false, total: 0, red: [] }),
    ]);
    expect(s.cells[0]?.hooks).toEqual({ total: 0, red: 0, ran: false });
  });

  it("birden çok koşuyu ayırt eder", () => {
    const s = summarize([
      started("c1", "claude"),
      ev({ type: "run.started", runId: "r2", taskId: "t" }),
    ]);
    expect(s.runIds).toEqual(["r1", "r2"]);
  });

  it("maliyeti olmayan hücre toplamı bozmaz", () => {
    const s = summarize([
      started("c1", "claude"),
      ev({ type: "agent.finished", cell: "c1", exitCode: 1, durationMs: 500 }),
    ]);
    expect(s.totalCostUsd).toBe(0);
    expect(s.totalDurationMs).toBe(500);
  });
});
