import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { adapterFor } from "../adapters/factory.js";
import type { Adapter } from "../adapters/contract.js";
import type { EventLog } from "../events/log.js";
import { loadTask } from "./task.js";
import { produce } from "./produce.js";
import { runHidden } from "./hidden.js";
import { review } from "./review.js";

export interface MatrixOptions {
  repo: string;
  taskId: string;
  /**
   * 2x2'nin iki köşesi, "sağlayıcı:model" biçiminde.
   * Farklı MODEL olmaları yeterli; satıcı ayrımı tezin daha güçlü hali.
   */
  models: [string, string];
  runRoot: string;
  log: EventLog;
  timeoutMs: number;
  /** Ölçüm gücü olmasa bile denetim hücrelerini koştur. Varsayılan: false. */
  force?: boolean;
}

export interface CellOutcome {
  producer: string;
  reviewer: string;
  crossed: boolean;
  reviewPath: string;
  costUsd: number;
}

export interface MatrixOutcome {
  producers: { model: string; redHooks: string[]; total: number; ran: boolean; costUsd: number }[];
  cells: CellOutcome[];
  /** Denetim hücreleri neden atlandı; koştularsa undefined. */
  skipped?: string;
}

/**
 * 2x2 çapraz kurgu: her model hem üretir hem denetler.
 *
 * Naif iki hücreli tasarım "çeşitlilik etkisi" ile "denetçi gücü"nü
 * ayıramaz. Burada çeşitlilik, faktöriyelin etkileşim terimi olarak okunur
 * ve iki ana etkiye diktir (bench/DESIGN.md).
 *
 * Artefakt üretici başına BİR KEZ üretilir ve iki denetçiye birden verilir;
 * böylece aynı kodu inceleyen iki denetçi arasındaki fark kodun kendisinden
 * gelemez.
 */
/** Dosya adında kullanılamayacak karakterleri temizler. */
const safe = (s: string): string => s.replace(/[^A-Za-z0-9._-]/g, "_");

export async function runMatrix(options: MatrixOptions): Promise<MatrixOutcome> {
  const { repo, taskId, models, runRoot, log, timeoutMs } = options;
  const task = await loadTask(join(repo, "bench/tasks", taskId));
  const rel = (p: string) => p.slice(repo.length + 1);

  const adapters: Adapter[] = models.map(adapterFor);
  const produced: {
    adapter: Adapter; artifactDir: string; redHooks: string[];
    total: number; ran: boolean; costUsd: number;
  }[] = [];

  for (const adapter of adapters) {
    const cellDir = join(runRoot, task.id, safe(adapter.id));
    console.log(`üretim: ${adapter.model}`);
    const p = await produce({
      task, adapter, cellDir,
      layers: [{ name: "produce", path: join(repo, "bench/prompts/produce.md") }],
      timeoutMs,
    });
    await log.append({
      type: "agent.started", cell: rel(cellDir), role: "uretici",
      provider: adapter.id, model: adapter.model, promptHash: p.promptHash,
    });
    await log.append({
      type: "agent.finished", cell: rel(cellDir),
      exitCode: p.invoke.exitCode, durationMs: p.invoke.durationMs,
      ...(p.invoke.usage ? { usage: p.invoke.usage } : {}),
    });

    const h = await runHidden(task, cellDir, repo);
    await log.append({
      type: "hooks.measured", cell: rel(cellDir), ran: h.ran, total: h.hooks.length, red: h.red,
    });
    console.log(h.ran
      ? `  ${h.hooks.length - h.red.length}/${h.hooks.length} yeşil` +
        (h.red.length > 0 ? ` — kanıtlanmış kusur: ${h.red.join(", ")}` : " — kusur yok")
      : "  ÖLÇÜLEMEDİ — süit hiç koşmadı (artefakt derlenmiyor ya da yok)");

    produced.push({
      adapter, artifactDir: p.artifactDir, redHooks: h.red, total: h.hooks.length, ran: h.ran,
      costUsd: p.invoke.usage?.costUsd ?? 0,
    });
  }

  // Denetim hücreleri pahalı ve yer gerçeği olmadan hiçbir şey ölçmezler.
  // Ölçülemeyen ya da kusursuz bir üretim üzerinde denetim koşturmak, parayı
  // sonuç üretmeyecek bir koşuya harcamaktır. Bu koruma tek koşu yolunda
  // vardı ama matriste yoktu ve gerçek bir koşuda "0/0 yeşil — kusur yok"
  // diye raporlanıp dört denetim boşa koştu.
  const unmeasured = produced.filter((p) => !p.ran);
  const defective = produced.filter((p) => p.redHooks.length > 0);
  const skipped =
    unmeasured.length > 0
      ? `ÖLÇÜLEMEDİ: ${unmeasured.map((p) => p.adapter.model).join(", ")} için gizli süit hiç koşmadı. ` +
        `Bu "kusur yok" DEĞİLDİR — yer gerçeği yok, denetim puanlanamaz.`
      : defective.length === 0
        ? `Ölçüm gücü yok: hiçbir üreticide kanıtlanmış kusur yok, denetçilerin ` +
          `yakalayacağı bir şey olmadığı için dört hücre de aynı sonucu verir.`
        : undefined;

  if (skipped !== undefined && options.force !== true) {
    console.log(`\n${skipped}`);
    console.log("Denetim hücreleri atlandı (yine de koşmak için --force).");
    return {
      producers: produced.map((p) => ({
        model: p.adapter.model, redHooks: p.redHooks, total: p.total, ran: p.ran, costUsd: p.costUsd,
      })),
      cells: [],
      skipped,
    };
  }

  const cells: CellOutcome[] = [];
  for (const prod of produced) {
    for (const rev of adapters) {
      const crossed = prod.adapter.id !== rev.id;
      const workdir = join(runRoot, task.id, "denetim", `${safe(prod.adapter.id)}--by--${safe(rev.id)}`);
      await mkdir(workdir, { recursive: true });
      console.log(`denetim: ${prod.adapter.model} üretti, ${rev.model} inceliyor ${crossed ? "(ÇAPRAZ)" : "(aynı)"}`);

      const r = await review({
        task, artifactDir: prod.artifactDir, reviewer: rev, workdir,
        layers: [{ name: "review", path: join(repo, "bench/prompts/review.md") }],
        timeoutMs,
      });
      const reviewPath = join(workdir, "rapor.txt");
      await writeFile(reviewPath, r.text);

      await log.append({
        type: "review.done", cell: rel(workdir),
        producer: prod.adapter.model, reviewer: rev.model, crossed,
        promptHash: r.promptHash, path: rel(reviewPath),
      });
      await log.append({
        type: "agent.finished", cell: rel(workdir),
        exitCode: r.invoke.exitCode, durationMs: r.invoke.durationMs,
        ...(r.invoke.usage ? { usage: r.invoke.usage } : {}),
      });

      cells.push({
        producer: prod.adapter.model, reviewer: rev.model, crossed,
        reviewPath: rel(reviewPath), costUsd: r.invoke.usage?.costUsd ?? 0,
      });
    }
  }

  return {
    producers: produced.map((p) => ({
      model: p.adapter.model, redHooks: p.redHooks, total: p.total, ran: p.ran, costUsd: p.costUsd,
    })),
    cells,
  };
}
