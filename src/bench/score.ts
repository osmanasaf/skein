import { mkdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { EventLog, type SkeinEvent } from "../events/log.js";
import type { Adapter } from "../adapters/contract.js";
import type { PromptLayer } from "../prompt/assemble.js";
import { loadTask } from "./task.js";
import { judgeReport, JudgeError } from "./judge.js";
import { classifyReport, type ClassifyResult } from "./classify.js";

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
  /** İncelenen artefaktın dizini (depoya göre); 2. katman kodu okur. */
  artifactDir: string;
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
interface RunIndex {
  taskId: string | undefined;
  /** Model adından, o modelin bu koşudaki üretim hücresine. */
  cellOfModel: Map<string, string>;
  redOf: Map<string, { red: string[]; ran: boolean }>;
  scored: Set<string>;
  classified: Set<string>;
  reviews: Extract<SkeinEvent, { type: "review.done" }>[];
}

/** Bir koşunun olaylarını, hedef çıkarmaya yarayan biçime indirger. */
function indexRun(list: SkeinEvent[]): RunIndex {
  const modelOf = new Map<string, string>();
  const index: RunIndex = {
    taskId: list.find((e) => e.type === "run.started")?.taskId,
    cellOfModel: new Map(),
    redOf: new Map(),
    scored: new Set(),
    classified: new Set(),
    reviews: [],
  };
  for (const e of list) {
    if (e.type === "agent.started" && e.role === "uretici") modelOf.set(e.cell, e.model);
    if (e.type === "hooks.measured") index.redOf.set(e.cell, { red: e.red, ran: e.ran });
    if (e.type === "judge.scored") index.scored.add(e.cell);
    if (e.type === "judge.classified") index.classified.add(e.cell);
    if (e.type === "review.done") index.reviews.push(e);
  }
  for (const [cell, model] of modelOf) {
    if (!index.cellOfModel.has(model)) index.cellOfModel.set(model, cell);
  }
  return index;
}

/** Koşuları runId'ye göre ayırır. */
function byRun(events: SkeinEvent[]): Map<string, SkeinEvent[]> {
  const runs = new Map<string, SkeinEvent[]>();
  for (const e of events) {
    const list = runs.get(e.runId);
    if (list) list.push(e);
    else runs.set(e.runId, [e]);
  }
  return runs;
}

/**
 * Bir denetim hücresinin ortak ön koşulları: görevi bilinen, üretim hücresi
 * bulunan ve gizli süiti koşmuş olmak. İki katman da bunları arıyor.
 */
function resolveCell(
  index: RunIndex,
  e: Extract<SkeinEvent, { type: "review.done" }>,
): Resolved | ScoreSkip {
  if (index.taskId === undefined) {
    return { cell: e.cell, reason: "koşuda `run.started` yok, görev bilinmiyor" };
  }
  const producerCell = index.cellOfModel.get(e.producer);
  const hooks = producerCell === undefined ? undefined : index.redOf.get(producerCell);
  if (producerCell === undefined || hooks === undefined) {
    return { cell: e.cell, reason: `üretim hücresi bulunamadı: ${e.producer}` };
  }
  if (!hooks.ran) {
    // Puanlanamayan hücre, kaçırılmış hücre değildir: yer gerçeği yok.
    return { cell: e.cell, reason: "ÖLÇÜLEMEDİ — gizli süit koşmadı, yer gerçeği yok" };
  }
  return { taskId: index.taskId, producerCell, red: hooks.red };
}

type Resolved = { taskId: string; producerCell: string; red: string[] };
const isSkip = (r: Resolved | ScoreSkip): r is ScoreSkip => "reason" in r;

export function scoreTargets(
  events: SkeinEvent[],
  options: { rescore?: boolean } = {},
): { targets: ScoreTarget[]; skipped: ScoreSkip[] } {
  const targets: ScoreTarget[] = [];
  const skipped: ScoreSkip[] = [];

  for (const [runId, list] of byRun(events)) {
    const index = indexRun(list);
    for (const e of index.reviews) {
      if (index.scored.has(e.cell) && options.rescore !== true) {
        skipped.push({ cell: e.cell, reason: "zaten puanlanmış (yeniden için --yeniden)" });
        continue;
      }
      const r = resolveCell(index, e);
      if (isSkip(r)) {
        skipped.push(r);
        continue;
      }
      if (r.red.length === 0) {
        skipped.push({ cell: e.cell, reason: "kanıtlanmış kusur yok — puanlanacak bir şey yok" });
        continue;
      }
      targets.push({
        runId, taskId: r.taskId, cell: e.cell, reportPath: e.path,
        producer: e.producer, reviewer: e.reviewer, crossed: e.crossed, redHooks: r.red,
        artifactDir: join(r.producerCell, "artifact"),
      });
    }
  }

  return { targets, skipped };
}

/**
 * 2. katmanın hedefleri — 1. katmanınkinden BİR şartla ayrılıyor:
 * kanıtlanmış kusur ARANMAZ.
 *
 * Kusursuz üretilmiş kodun raporu, nesnel katman için ölçüm gücü taşımaz
 * (yakalanacak bir şey yok) ama gürültü katmanı için tam tersi: o rapordaki
 * her bulgu ya nit ya yanlış pozitiftir, yani "denetim katmanı boş yere ne
 * kadar konuşuyor" sorusunun en temiz örneği. Bu hücreleri atlamak, gürültü
 * ölçümünü sistematik olarak kusurlu kodlara daraltırdı.
 */
export function classifyTargets(
  events: SkeinEvent[],
  options: { reclassify?: boolean } = {},
): { targets: ScoreTarget[]; skipped: ScoreSkip[] } {
  const targets: ScoreTarget[] = [];
  const skipped: ScoreSkip[] = [];

  for (const [runId, list] of byRun(events)) {
    const index = indexRun(list);
    for (const e of index.reviews) {
      if (index.classified.has(e.cell) && options.reclassify !== true) {
        skipped.push({ cell: e.cell, reason: "zaten sınıflanmış (yeniden için --yeniden)" });
        continue;
      }
      const r = resolveCell(index, e);
      if (isSkip(r)) {
        skipped.push(r);
        continue;
      }
      targets.push({
        runId, taskId: r.taskId, cell: e.cell, reportPath: e.path,
        producer: e.producer, reviewer: e.reviewer, crossed: e.crossed, redHooks: r.red,
        artifactDir: join(r.producerCell, "artifact"),
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

export interface ClassifyRunResult {
  classified: number;
  failed: { cell: string; error: string }[];
  costUsd: number;
}

export interface ClassifyAllOptions extends Omit<ScoreOptions, "onCell"> {
  onCell?: (target: ScoreTarget, result: ClassifyResult, costUsd: number) => void;
}

/**
 * 2. katmanı hedef hücrelerde koşar ve her sınıflamayı günlüğe düşürür.
 *
 * `scoreAll` ile aynı iskelet, ama AYRI bir olay yazıyor (`judge.classified`)
 * ve ayrı bir dizine (`siniflama/`). Aynı olaya yazsalardı iki katman tek
 * kayıtta erir, "ayrı raporlanır" kuralı da ancak raporlama katmanının
 * dikkatine kalırdı — burada yapıyla garanti ediliyor.
 */
export async function classifyAll(options: ClassifyAllOptions): Promise<ClassifyRunResult> {
  const { repo, judge, layers, timeoutMs, logPath, targets } = options;
  const failed: { cell: string; error: string }[] = [];
  let costUsd = 0;
  let classified = 0;

  for (const target of targets) {
    const task = await loadTask(join(repo, "bench/tasks", target.taskId));
    const workdir = join(repo, target.cell, "siniflama");
    await mkdir(workdir, { recursive: true });
    const reportText = await readFile(join(repo, target.reportPath), "utf8");

    try {
      const r = await classifyReport({
        judge, workdir, layers, timeoutMs,
        specPath: task.specPath,
        artifactDir: join(repo, target.artifactDir),
        reportText,
        redHooks: target.redHooks,
      });
      const cost = r.invoke.usage?.costUsd ?? 0;
      costUsd += cost;
      classified += 1;
      await new EventLog(logPath, target.runId).append({
        type: "judge.classified",
        cell: target.cell,
        judge: judge.model,
        ...r.counts,
        unverified: r.unverified,
        path: join(target.cell, "siniflama", "siniflama.json"),
      });
      options.onCell?.(target, r, cost);
    } catch (error) {
      const message = error instanceof JudgeError ? error.message : String(error);
      failed.push({ cell: target.cell, error: message });
    }
  }

  return { classified, failed, costUsd };
}
