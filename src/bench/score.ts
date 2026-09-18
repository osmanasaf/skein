import { mkdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { EventLog, type SkeinEvent } from "../events/log.js";
import type { Adapter } from "../adapters/contract.js";
import type { PromptLayer } from "../prompt/assemble.js";
import { loadTask } from "./task.js";
import { judgeReport, JudgeError } from "./judge.js";

export interface ScoreTarget {
  runId: string;
  taskId: string;
  /** Denetim hücresi — `review.done` ile aynı anahtar. */
  cell: string;
  reportPath: string;
  producer: string;
  reviewer: string;
  crossed: boolean;
  /** Bu hücrede puanlanacak kanıtlanmış kusurlar. */
  redHooks: string[];
}

export interface ScoreSkip {
  cell: string;
  reason: string;
}

/**
 * Günlükten puanlanabilir denetim hücrelerini çıkarır.
 *
 * Saf: dosya sistemine bakmaz, ajan çağırmaz. Böylece "hangi hücreler
 * puanlanacak" sorusu para harcamadan cevaplanabiliyor ve puanlama
 * mantığının kendisi test edilebiliyor.
 *
 * Eşleştirme kuralı: bir denetim hücresinin kanıtlanmış kusurları, AYNI
 * koşuda aynı modelin ürettiği hücrenin kırmızı kancalarıdır. Koşu sınırını
 * geçmiyoruz — iki koşunun aynı modeli aynı kodu üretmez.
 */
export function scoreTargets(
  events: SkeinEvent[],
  options: { rescore?: boolean } = {},
): { targets: ScoreTarget[]; skipped: ScoreSkip[] } {
  const targets: ScoreTarget[] = [];
  const skipped: ScoreSkip[] = [];

  const runs = new Map<string, SkeinEvent[]>();
  for (const e of events) {
    const list = runs.get(e.runId);
    if (list) list.push(e);
    else runs.set(e.runId, [e]);
  }

  for (const [runId, list] of runs) {
    const taskId = list.find((e) => e.type === "run.started")?.taskId;
    const modelOf = new Map<string, string>();
    const redOf = new Map<string, { red: string[]; ran: boolean }>();
    const scored = new Set<string>();

    for (const e of list) {
      if (e.type === "agent.started" && e.role === "uretici") modelOf.set(e.cell, e.model);
      if (e.type === "hooks.measured") redOf.set(e.cell, { red: e.red, ran: e.ran });
      if (e.type === "judge.scored") scored.add(e.cell);
    }

    /** Model adından, o modelin bu koşudaki üretim hücresine. */
    const cellOfModel = new Map<string, string>();
    for (const [cell, model] of modelOf) if (!cellOfModel.has(model)) cellOfModel.set(model, cell);

    for (const e of list) {
      if (e.type !== "review.done") continue;
      if (scored.has(e.cell) && options.rescore !== true) {
        skipped.push({ cell: e.cell, reason: "zaten puanlanmış (yeniden için --yeniden)" });
        continue;
      }
      if (taskId === undefined) {
        skipped.push({ cell: e.cell, reason: "koşuda `run.started` yok, görev bilinmiyor" });
        continue;
      }
      const producerCell = cellOfModel.get(e.producer);
      const hooks = producerCell === undefined ? undefined : redOf.get(producerCell);
      if (hooks === undefined) {
        skipped.push({ cell: e.cell, reason: `üretim hücresi bulunamadı: ${e.producer}` });
        continue;
      }
      if (!hooks.ran) {
        // Puanlanamayan hücre, kaçırılmış hücre değildir: yer gerçeği yok.
        skipped.push({ cell: e.cell, reason: "ÖLÇÜLEMEDİ — gizli süit koşmadı, yer gerçeği yok" });
        continue;
      }
      if (hooks.red.length === 0) {
        skipped.push({ cell: e.cell, reason: "kanıtlanmış kusur yok — puanlanacak bir şey yok" });
        continue;
      }
      targets.push({
        runId, taskId, cell: e.cell, reportPath: e.path,
        producer: e.producer, reviewer: e.reviewer, crossed: e.crossed, redHooks: hooks.red,
      });
    }
  }

  return { targets, skipped };
}

export interface ScoreOptions {
  repo: string;
  judge: Adapter;
  layers: PromptLayer[];
  timeoutMs: number;
  /**
   * Olay günlüğünün yolu. Günlük nesnesi hedef başına kuruluyor, çünkü
   * puanın `runId`'si PUANLAMA koşusunun değil, PUANLANAN denetimin
   * koşusudur — birleştirme anahtarı o. Yeni bir runId ile yazılsaydı
   * `judge.scored` ile `review.done` aynı hücrede buluşamazdı.
   */
  logPath: string;
  targets: ScoreTarget[];
  onCell?: (target: ScoreTarget, result: ScoredCell) => void;
}

export interface ScoredCell {
  caught: string[];
  missed: string[];
  unverified: string[];
  scrubbed: number;
  costUsd: number;
}

export interface ScoreRunResult {
  scored: number;
  failed: { cell: string; error: string }[];
  costUsd: number;
}

/**
 * Hedef hücreleri tek tek puanlar ve her kararı günlüğe düşürür.
 *
 * Bir hücrenin puanlanamaması koşuyu durdurmaz: hata kaydedilir, diğerleri
 * puanlanır. Pahalı olan denetim koşusu zaten bitmiş durumda; ayrıştırma
 * hatası yüzünden geri kalan on hücreyi puansız bırakmak, o parayı ikinci
 * kez harcamak demek olurdu.
 */
export async function scoreAll(options: ScoreOptions): Promise<ScoreRunResult> {
  const { repo, judge, layers, timeoutMs, logPath, targets } = options;
  const failed: { cell: string; error: string }[] = [];
  let costUsd = 0;
  let scored = 0;

  for (const target of targets) {
    const task = await loadTask(join(repo, "bench/tasks", target.taskId));
    const workdir = join(repo, target.cell, "puanlama");
    await mkdir(workdir, { recursive: true });
    const reportText = await readFile(join(repo, target.reportPath), "utf8");

    try {
      const r = await judgeReport({
        judge, workdir, layers, timeoutMs,
        specPath: task.specPath, reportText, redHooks: target.redHooks,
      });
      const cost = r.invoke.usage?.costUsd ?? 0;
      costUsd += cost;
      scored += 1;
      await new EventLog(logPath, target.runId).append({
        type: "judge.scored",
        cell: target.cell,
        judge: judge.model,
        hooks: target.redHooks.length,
        caught: r.caught,
        missed: r.missed,
        unverified: r.unverified,
      });
      options.onCell?.(target, {
        caught: r.caught, missed: r.missed, unverified: r.unverified,
        scrubbed: r.scrubbed, costUsd: cost,
      });
    } catch (error) {
      const message = error instanceof JudgeError ? error.message : String(error);
      failed.push({ cell: target.cell, error: message });
    }
  }

  return { scored, failed, costUsd };
}
