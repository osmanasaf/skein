import type { SkeinEvent } from "./log.js";

export interface CellRow {
  cell: string;
  role?: string;
  provider?: string;
  model?: string;
  promptHash?: string;
  exitCode?: number;
  durationMs?: number;
  costUsd?: number;
  /** Ölçüm hiç yapılmadıysa undefined; koşup sıfır kırmızı vermekten farklı. */
  hooks?: { total: number; red: number; ran: boolean };
}

export interface Summary {
  runIds: string[];
  cells: CellRow[];
  totalCostUsd: number;
  totalDurationMs: number;
}

/**
 * Olay günlüğünü hücre satırlarına indirger.
 *
 * "Bu görev bana neye mal oldu ve kaç kusur yakalandı" sorusu buradan
 * cevaplanır — koşu sırasında ekrana basılan metinden değil. Günlük tek
 * ölçüm kaynağı olmazsa, koşu bittiğinde sayılar da gider.
 */
export function summarize(events: SkeinEvent[]): Summary {
  const byCell = new Map<string, CellRow>();
  const runIds: string[] = [];
  const row = (cell: string): CellRow => {
    let r = byCell.get(cell);
    if (!r) byCell.set(cell, (r = { cell }));
    return r;
  };

  for (const e of events) {
    if (typeof e.runId === "string" && !runIds.includes(e.runId)) runIds.push(e.runId);
    switch (e.type) {
      case "agent.started": {
        Object.assign(row(e.cell), {
          role: e.role, provider: e.provider, model: e.model, promptHash: e.promptHash,
        });
        break;
      }
      case "agent.finished": {
        const r = row(e.cell);
        r.exitCode = e.exitCode;
        r.durationMs = e.durationMs;
        if (typeof e.usage?.costUsd === "number") r.costUsd = e.usage.costUsd;
        break;
      }
      case "hooks.measured": {
        row(e.cell).hooks = { total: e.total, red: e.red.length, ran: e.ran };
        break;
      }
      default:
        break;
    }
  }

  const cells = [...byCell.values()];
  return {
    runIds,
    cells,
    totalCostUsd: cells.reduce((s, c) => s + (c.costUsd ?? 0), 0),
    totalDurationMs: cells.reduce((s, c) => s + (c.durationMs ?? 0), 0),
  };
}
