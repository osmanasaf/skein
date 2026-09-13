import type { TopologySnapshot } from "../flow/snapshot.js";
import { tick, type TickOptions, type TickResult } from "./tick.js";

export interface SweepResult {
  /** Rol id'sine göre, bu turda ne olduğu. Boş kuyruklar da var. */
  results: { role: string; result: TickResult }[];
  /** Bu geçişte hiç kart hareket etti mi. */
  moved: boolean;
}

/**
 * Topolojideki her rol için birer tur koşar.
 *
 * Sıra zincirin TERSİ: önce zincirin sonundaki roller. İleri sırayla
 * koşulsaydı taze bir kart tek geçişte bütün zinciri kat eder ve "bir
 * geçiş" kaç ajan uyandırması demek olduğu belirsizleşirdi; ters sırada
 * taze kart geçiş başına bir rol ilerler.
 *
 * Reddedilen kart bunun istisnası ve kasıtlı: ret hedefi zincirde daha
 * geride olduğu için, geri dönen kartı hedef rol aynı geçişte alır.
 * Düzeltme turu beklemez — yarım kalmış işi bitirmek kuyruk önceliğinde de
 * böyleydi.
 *
 * Her hâlükârda garanti olan şey: her rol geçiş başına EN FAZLA bir tur.
 */
export async function sweep(topology: TopologySnapshot, options: TickOptions): Promise<SweepResult> {
  const results: { role: string; result: TickResult }[] = [];
  for (const role of [...topology.roles].reverse()) {
    const result = await tick(role.id, options);
    results.push({ role: role.id, result });
  }
  return { results, moved: results.some((r) => r.result.status !== "idle") };
}

export interface LoopOptions extends TickOptions {
  /** Kart kalmadığında dur. Varsayılan: true. */
  untilIdle?: boolean;
  /** En fazla kaç geçiş; kaçak döngüye karşı emniyet. */
  maxSweeps?: number;
  onSweep?: (sweep: SweepResult, index: number) => void;
}

/**
 * Kart kalmayana kadar geçiş yapar.
 *
 * `maxSweeps` bir emniyet: ret/düzelt döngüsünün sonlu olduğunu `reject.limit`
 * zaten garantiliyor, ama bir kusur o garantiyi delerse fatura sonsuza kadar
 * büyümesin.
 */
export async function runUntilIdle(
  topology: TopologySnapshot,
  options: LoopOptions,
): Promise<SweepResult[]> {
  const max = options.maxSweeps ?? 50;
  const sweeps: SweepResult[] = [];

  for (let i = 0; i < max; i += 1) {
    const result = await sweep(topology, options);
    sweeps.push(result);
    options.onSweep?.(result, i);
    if (!result.moved) return sweeps;
  }
  return sweeps;
}
