import { sumUsage, totalUsage, type UsageTotal } from "../bench/usage.js";
import type { SkeinEvent } from "./log.js";

export interface CellRow {
  cell: string;
  role?: string;
  /** Denetim hücrelerinde: kodu üreten ve inceleyen modeller. */
  producer?: string;
  crossed?: boolean;
  provider?: string;
  model?: string;
  promptHash?: string;
  exitCode?: number;
  durationMs?: number;
  /**
   * Hücrenin ölçüsü: dolar VE token, ayrı ayrı.
   *
   * Eskiden yalnızca `costUsd?: number` vardı ve rapor `?? 0` ile basıyordu.
   * Abonelik kimliğiyle koşan bir sağlayıcı dolar bildirmiyor, yani codex
   * hücreleri `$0.0000` görünüyordu — bedava sanılırdı.
   */
  usage: UsageTotal;
  /** Ölçüm hiç yapılmadıysa undefined; koşup sıfır kırmızı vermekten farklı. */
  hooks?: { total: number; red: number; ran: boolean };
}

export interface Summary {
  runIds: string[];
  cells: CellRow[];
  /** Bütün hücrelerin toplamı; bildirilmeyen alan BOŞ kalır, sıfır olmaz. */
  usage: UsageTotal;
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
    if (!r) byCell.set(cell, (r = { cell, usage: {} }));
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
        // Yalnızca bir şey bildirildiyse yazılıyor: eski davranış korunuyor
        // ki ölçülmüş koşuların sayıları değişmesin.
        const u = totalUsage([e.usage]);
        if (Object.keys(u).length > 0) r.usage = u;
        break;
      }
      case "review.done": {
        Object.assign(row(e.cell), {
          role: "denetci", provider: e.reviewer, model: e.reviewer,
          producer: e.producer, crossed: e.crossed, promptHash: e.promptHash,
        });
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
    usage: cells.reduce<UsageTotal>((a, c) => sumUsage(a, c.usage), {}),
    totalDurationMs: cells.reduce((s, c) => s + (c.durationMs ?? 0), 0),
  };
}
