import type { Usage } from "../adapters/contract.js";

/**
 * Bir hücrenin ölçüsü: dolar VE token, ayrı ayrı.
 *
 * Alanların hepsi isteğe bağlı ve bu kasıtlı: **bildirilmemiş bir ölçü
 * sıfır değildir.** `?? 0` ile toplamak codex hücrelerini `$0.0000` diye
 * gösteriyordu — eksik veri değil, yanlış bilgi: codex bedavaymış gibi
 * okunuyordu.
 */
export interface UsageTotal {
  /** Yalnızca en az bir çağrı dolar bildirdiyse dolu. */
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Çağrıların ölçüsünü toplar; hiç bildirilmeyen alanı BOŞ bırakır.
 *
 * Çapraz satıcı 2x2'si bunu gerektirdi. ChatGPT aboneliğiyle koşan codex
 * `total_cost_usd` üretmiyor, claude üretiyor: iki kolu dolar üzerinden
 * karşılaştırmak iki ayrı birimi harmanlamak olur. Ortak birim **token**;
 * dolar, onu bildiren sağlayıcı için ek alan olarak kalıyor.
 *
 * Projenin kendi kuralının aynısı: iki ayrı yer gerçeği harmanlanmıyor.
 */
export function totalUsage(list: readonly (Usage | undefined)[]): UsageTotal {
  const topla = (sec: (u: Usage) => number | undefined): number | undefined => {
    let toplam: number | undefined;
    for (const u of list) {
      if (u === undefined) continue;
      const v = sec(u);
      if (typeof v !== "number") continue;
      toplam = (toplam ?? 0) + v;
    }
    return toplam;
  };
  const costUsd = topla((u) => u.costUsd);
  const inputTokens = topla((u) => u.inputTokens);
  const outputTokens = topla((u) => u.outputTokens);
  return {
    ...(costUsd === undefined ? {} : { costUsd }),
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
  };
}

/** İki ölçüyü toplar; biri boşsa ötekinin değeri korunur. */
export function sumUsage(a: UsageTotal, b: UsageTotal): UsageTotal {
  return totalUsage([a, b]);
}

/**
 * Ekrana basılacak tek satır.
 *
 * Dolar yoksa bunu SÖYLÜYOR; sessizce sıfır basmıyor. Hiçbir ölçü yoksa
 * "ÖLÇÜ YOK" diyor, çünkü ölçülemeyen bir hücre ucuz bir hücre değildir.
 */
export function formatUsage(t: UsageTotal): string {
  const token = t.inputTokens !== undefined || t.outputTokens !== undefined
    ? `${t.inputTokens ?? "?"}→${t.outputTokens ?? "?"} token`
    : undefined;
  if (t.costUsd !== undefined) {
    return token === undefined ? `$${t.costUsd.toFixed(4)}` : `$${t.costUsd.toFixed(4)} · ${token}`;
  }
  if (token !== undefined) return `${token} · dolar yok (abonelik kimliği)`;
  return "ÖLÇÜ YOK";
}
