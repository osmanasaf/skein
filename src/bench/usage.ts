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
  /**
   * Toplama giren ÇAĞRILARDAN en az biri yarım ölçüydü (bkz. `Usage.kismi`).
   *
   * O zaman bu toplam bir ALT SINIR. İşaret toplamla birlikte taşınmazsa
   * yarım bir sayı tam bir sayı gibi okunur — ölçünün yarım olduğunu bilip
   * söylememek, hiç ölçmemekten daha yanıltıcı.
   */
  partial?: true;
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
  const sum = (choose: (u: Usage) => number | undefined): number | undefined => {
    let totalOf: number | undefined;
    for (const u of list) {
      if (u === undefined) continue;
      const v = choose(u);
      if (typeof v !== "number") continue;
      totalOf = (totalOf ?? 0) + v;
    }
    return totalOf;
  };
  const costUsd = sum((u) => u.costUsd);
  const inputTokens = sum((u) => u.inputTokens);
  const outputTokens = sum((u) => u.outputTokens);
  // Tek bir yarım çağrı bütün toplamı alt sınıra çevirir: kirlilik yukarı
  // taşınır, aşağı değil.
  const partial = list.some((u) => u?.partial === true);
  return {
    ...(costUsd === undefined ? {} : { costUsd }),
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(partial ? { partial: true as const } : {}),
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
  // Yarım ölçü SAYIYA YAPIŞIR, cümlenin sonuna iliştirilmez: satır
  // kırpıldığında bile "en az" okunur kalmalı.
  const en = t.partial === true ? "≥" : "";
  if (t.costUsd !== undefined) {
    const usd = `${en}$${t.costUsd.toFixed(4)}`;
    return token === undefined ? usd : `${usd} · ${en}${token}`;
  }
  if (token !== undefined) {
    // İki ayrı "dolar yok" sebebi var ve karıştırılmamalı: abonelik kimliği
    // dolar BİLDİRMİYOR, yarım ölçüde ise dolar HİÇ ÜRETİLMEDİ çünkü tur
    // bitmedi. İlki ücretsiz olabilir, ikincisi kesinlikle değil.
    const sebep = t.partial === true
      ? "tur yarıda kesildi, dolar bildirilmedi — ALT SINIR"
      : "dolar yok (abonelik kimliği)";
    return `${en}${token} · ${sebep}`;
  }
  return "ÖLÇÜ YOK";
}
