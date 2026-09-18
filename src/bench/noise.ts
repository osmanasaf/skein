import type { SkeinEvent } from "../events/log.js";
import { groupRuns, tasksByRun, UNKNOWN_TASK } from "./effect.js";

/**
 * 2. KATMANIN RAPORU — gürültü, karar değil.
 *
 * Nesnel katman (`effect.ts`) "kanıtlanmış kusuru rapor söylüyor mu" diye
 * sorar ve karar kuralı YALNIZCA oradan okunur. Bu dosya gizli testin
 * göremediği tarafı özetler: raporun bulgularının ne kadarı gerçek, ne
 * kadarı nit, ne kadarı yanlış pozitif.
 *
 * Burada bilerek **karar yok**. Tek bir "bulgu skoru" üretip iki katmanı
 * harmanlamak, itiraz edilebilir bir modelin görüşünü tartışmaya kapalı bir
 * test sonucuyla aynı çuvala koymak olurdu (bench/DESIGN.md: "iki katman
 * harmanlanmaz").
 */
export interface NoiseSide {
  /** Sınıflanmış rapor sayısı. */
  reports: number;
  /** Kanıtlanmış kusura ait OLMAYAN bulgular. */
  findings: number;
  real: number;
  nit: number;
  wrong: number;
  /** Hakemin sınıfa karar veremedikleri; oranların paydasında yok. */
  uncertain: number;
  /** Kanıtlanmış kusuru tarif eden bulgular — 1. katmanın alanı. */
  proven: number;
  /** nit / (gerçek + nit + yanlış). */
  nitRate: number | null;
  /** yanlış / (gerçek + nit + yanlış). */
  wrongRate: number | null;
  /** Rapor başına gerçek bulgu. */
  realPerReport: number | null;
}

export interface NoiseGroup {
  taskId: string;
  models: string[];
  same: NoiseSide | null;
  crossed: NoiseSide | null;
}

export interface NoiseReport {
  groups: NoiseGroup[];
  /** Bütün hücreler tek torbada; yine yalnızca bilgi. */
  total: NoiseSide | null;
  /** Alıntısı raporda bulunamadığı için sayılmayan bulgular — hakemin sağlığı. */
  unverified: number;
}

interface ClassifiedCell {
  runId: string;
  taskId: string;
  cell: string;
  producer: string;
  reviewer: string;
  crossed: boolean;
  findings: number;
  real: number;
  nit: number;
  wrong: number;
  proven: number;
  uncertain: number;
  unverified: number;
}

const key = (...parts: string[]): string => JSON.stringify(parts);

/** Sınıflanmış hücreleri günlükten toplar; `review.done` ile birleştirir. */
export function classifiedCells(events: SkeinEvent[]): ClassifiedCell[] {
  const meta = new Map<string, { producer: string; reviewer: string; crossed: boolean }>();
  for (const e of events) {
    if (e.type === "review.done") {
      meta.set(key(e.runId, e.cell), { producer: e.producer, reviewer: e.reviewer, crossed: e.crossed });
    }
  }
  const tasks = tasksByRun(events);
  // Hücre başına SON sınıflama geçerli — `judge.scored`'daki ile aynı
  // sebep: `--yeniden` iki kayıt bırakır ve ikisi de sayılırsa hücre iki
  // kez sayılmış olur.
  const latest = new Map<string, ClassifiedCell>();
  for (const e of events) {
    if (e.type !== "judge.classified") continue;
    const m = meta.get(key(e.runId, e.cell));
    // Denetim kaydı olmayan sınıflama, hangi tarafa ait olduğunu söyleyemez.
    if (m === undefined) continue;
    latest.set(key(e.runId, e.cell), {
      runId: e.runId, taskId: tasks.get(e.runId) ?? UNKNOWN_TASK, cell: e.cell, ...m,
      findings: e.findings, real: e.real, nit: e.nit, wrong: e.wrong,
      proven: e.proven, uncertain: e.uncertain, unverified: e.unverified,
    });
  }
  return [...latest.values()];
}

function side(cells: ClassifiedCell[]): NoiseSide | null {
  if (cells.length === 0) return null;
  const sum = (f: (c: ClassifiedCell) => number): number => cells.reduce((s, c) => s + f(c), 0);
  const real = sum((c) => c.real);
  const nit = sum((c) => c.nit);
  const wrong = sum((c) => c.wrong);
  // Payda `belirsiz`i dışarıda bırakıyor: hakemin karar veremediği bulgu
  // ne gürültüdür ne değer, ve paydaya girerse iki oranı da aşağı çeker.
  const rated = real + nit + wrong;
  return {
    reports: cells.length,
    findings: sum((c) => c.findings),
    real, nit, wrong,
    uncertain: sum((c) => c.uncertain),
    proven: sum((c) => c.proven),
    nitRate: rated === 0 ? null : nit / rated,
    wrongRate: rated === 0 ? null : wrong / rated,
    realPerReport: real / cells.length,
  };
}

export function noiseReport(events: SkeinEvent[]): NoiseReport {
  const cells = classifiedCells(events);
  const groups: NoiseGroup[] = groupRuns(cells).map((g) => ({
    taskId: g.taskId,
    models: g.models,
    same: side(g.cells.filter((c) => !c.crossed)),
    crossed: side(g.cells.filter((c) => c.crossed)),
  }));
  return {
    groups,
    total: side(cells),
    unverified: cells.reduce((s, c) => s + c.unverified, 0),
  };
}
