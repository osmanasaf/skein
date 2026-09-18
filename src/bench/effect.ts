import type { SkeinEvent } from "../events/log.js";

/** Önceden ilan edilen karar kuralının eşikleri (bench/DESIGN.md). */
export const POSITIVE_THRESHOLD = 0.2;
export const NEGATIVE_THRESHOLD = 0.1;
/** Karar için gereken en az tekrar sayısı. */
export const MIN_REPEATS = 3;

export interface PairScore {
  producer: string;
  reviewer: string;
  crossed: boolean;
  /** Bu çiftte puanlanan hücre sayısı. */
  cells: number;
  hooks: number;
  missed: number;
  missRate: number;
}

export interface Side {
  hooks: number;
  missed: number;
  missRate: number;
}

export type VerdictCode = "olumlu" | "olumsuz" | "belirsiz" | "yetersiz";

export interface EffectReport {
  pairs: PairScore[];
  same: Side | null;
  crossed: Side | null;
  /** Kaçırma oranında göreli azalma: (aynı − çapraz) / aynı. */
  relativeReduction: number | null;
  /** Faktöriyel etkileşim terimi: (AA+BB)/2 − (AB+BA)/2. Dört hücre şart. */
  interaction: number | null;
  /** Koşu başına göreli azalma — işaret tutarlılığı buradan okunur. */
  perRun: { runId: string; relativeReduction: number | null }[];
  repeats: number;
  /** Doğrulanamayan alıntı sayısı; hakemin kendi sağlığı. */
  unverified: number;
  verdict: { code: VerdictCode; reason: string };
}

interface ScoredCell {
  runId: string;
  cell: string;
  producer: string;
  reviewer: string;
  crossed: boolean;
  hooks: number;
  missed: number;
  unverified: number;
}

const key = (...parts: string[]): string => JSON.stringify(parts);

/** Puanlanmış hücreleri günlükten toplar; `review.done` ile birleştirir. */
export function scoredCells(events: SkeinEvent[]): ScoredCell[] {
  const meta = new Map<string, { producer: string; reviewer: string; crossed: boolean }>();
  for (const e of events) {
    if (e.type === "review.done") {
      meta.set(key(e.runId, e.cell), {
        producer: e.producer, reviewer: e.reviewer, crossed: e.crossed,
      });
    }
  }
  const out: ScoredCell[] = [];
  for (const e of events) {
    if (e.type !== "judge.scored") continue;
    const m = meta.get(key(e.runId, e.cell));
    // Puanı olup denetim kaydı olmayan hücre, kimin kimi incelediğini
    // söyleyemez — sayıya katılırsa "çapraz" sütunu sessizce kirlenir.
    if (m === undefined) continue;
    out.push({
      runId: e.runId, cell: e.cell, ...m,
      hooks: e.hooks, missed: e.missed.length, unverified: e.unverified.length,
    });
  }
  return out;
}

function side(cells: ScoredCell[]): Side | null {
  if (cells.length === 0) return null;
  const hooks = cells.reduce((s, c) => s + c.hooks, 0);
  const missed = cells.reduce((s, c) => s + c.missed, 0);
  return { hooks, missed, missRate: hooks === 0 ? 0 : missed / hooks };
}

function reduction(same: Side | null, crossed: Side | null): number | null {
  if (same === null || crossed === null) return null;
  // Aynı-model hücrelerinde hiç kaçırma yoksa "azalma" tanımsız: sıfırdan
  // azalma yok, ve sıfıra bölmek sonsuz bir etki uydurur.
  if (same.missRate === 0) return null;
  return (same.missRate - crossed.missRate) / same.missRate;
}

/**
 * Puanlanmış hücrelerden deneyin cevabını çıkarır.
 *
 * İki şeyi ayrı tutuyor ve ikisini de gösteriyor: **sayı** (kaçırma oranında
 * göreli azalma) ve **karar** (önceden ilan edilmiş kural bu sayıya ne
 * diyor). Sayıyı görüp eşiği sonradan seçmek deneyi süse çevirirdi; o yüzden
 * eşikler `bench/DESIGN.md`'de sonuçtan önce yazıldı ve burada sabit.
 *
 * Karar ayrıca tekrar sayısına bağlı: `k < 3` iken hiçbir sayı karar
 * vermez, yalnızca sinyal olur. Bu kural da DESIGN'da sonuçtan önce
 * yazılıydı ve bir kez ihlal edildiği için (tek koşudan "bu görev kolay"
 * sonucu çıkarılmıştı) burada makineye bağlandı.
 */
export function effectReport(events: SkeinEvent[]): EffectReport {
  const cells = scoredCells(events);
  const byPair = new Map<string, ScoredCell[]>();
  for (const c of cells) {
    const k = key(c.producer, c.reviewer);
    const list = byPair.get(k);
    if (list) list.push(c);
    else byPair.set(k, [c]);
  }

  const pairs: PairScore[] = [...byPair.values()].map((group) => {
    const first = group[0] as ScoredCell;
    const s = side(group) as Side;
    return {
      producer: first.producer, reviewer: first.reviewer, crossed: first.crossed,
      cells: group.length, hooks: s.hooks, missed: s.missed, missRate: s.missRate,
    };
  });

  const same = side(cells.filter((c) => !c.crossed));
  const crossed = side(cells.filter((c) => c.crossed));
  const relativeReduction = reduction(same, crossed);

  // Etkileşim terimi yalnızca dört hücrenin dördü de puanlanmışsa okunur;
  // eksik hücreyle hesaplanan "etkileşim", ana etkinin kılık değiştirmiş
  // hâlidir.
  const sameP = pairs.filter((p) => !p.crossed);
  const crossedP = pairs.filter((p) => p.crossed);
  const interaction =
    pairs.length === 4 && sameP.length === 2 && crossedP.length === 2
      ? sameP.reduce((s, p) => s + p.missRate, 0) / 2 -
        crossedP.reduce((s, p) => s + p.missRate, 0) / 2
      : null;

  const runIds = [...new Set(cells.map((c) => c.runId))];
  const perRun = runIds.map((runId) => {
    const own = cells.filter((c) => c.runId === runId);
    return {
      runId,
      relativeReduction: reduction(
        side(own.filter((c) => !c.crossed)),
        side(own.filter((c) => c.crossed)),
      ),
    };
  });

  return {
    pairs, same, crossed, relativeReduction, interaction, perRun,
    repeats: runIds.length,
    unverified: cells.reduce((s, c) => s + c.unverified, 0),
    verdict: decide(cells.length, runIds.length, relativeReduction, perRun),
  };
}

function decide(
  cellCount: number,
  repeats: number,
  relative: number | null,
  perRun: { relativeReduction: number | null }[],
): { code: VerdictCode; reason: string } {
  if (cellCount === 0) {
    return { code: "yetersiz", reason: "Puanlanmış denetim hücresi yok." };
  }
  if (relative === null) {
    return {
      code: "yetersiz",
      reason:
        "Aynı-model hücrelerinde hiç kaçırma yok; göreli azalma tanımsız. " +
        "Denetçilerin kaçırdığı bir kusur olmadan çeşitlilik etkisi ölçülemez.",
    };
  }
  if (repeats < MIN_REPEATS) {
    return {
      code: "yetersiz",
      reason:
        `k=${repeats}; karar için en az ${MIN_REPEATS} tekrar gerekiyor (DESIGN). ` +
        "Aşağıdaki sayı sinyaldir, sonuç değildir.",
    };
  }
  // "Tekrarlar arası varyansın dışında" şartının işletilebilir hâli: her
  // tekrarda azalmanın İŞARETİ aynı olmalı. Güven aralığı değil, ama
  // "üç koşunun ikisinde ters yönde" bir sonucun olumlu ilan edilmesini
  // engelliyor.
  const signs = perRun.map((r) => r.relativeReduction).filter((r): r is number => r !== null);
  const consistent = signs.length > 0 && signs.every((r) => r > 0);
  const pct = (n: number): string => `%${(n * 100).toFixed(0)}`;

  if (relative >= POSITIVE_THRESHOLD && consistent) {
    return {
      code: "olumlu",
      reason:
        `Kaçırma oranında ${pct(relative)} göreli azalma (eşik ${pct(POSITIVE_THRESHOLD)}) ` +
        `ve azalma ${signs.length} tekrarın hepsinde aynı yönde.`,
    };
  }
  if (relative >= POSITIVE_THRESHOLD) {
    return {
      code: "belirsiz",
      reason:
        `Azalma eşiğin üstünde (${pct(relative)}) ama tekrarlar arasında işaret tutarsız — ` +
        "en az bir tekrarda çapraz denetim daha ÇOK kaçırdı. k artırılmalı.",
    };
  }
  if (relative < NEGATIVE_THRESHOLD) {
    return {
      code: "olumsuz",
      reason:
        `Göreli azalma ${pct(relative)}, eşiğin (${pct(NEGATIVE_THRESHOLD)}) altında. ` +
        "PHILOSOPHY 3. ilkesi gözden geçirilmeli: çoklu sağlayıcı bir kalite " +
        "mekanizması değil, olsa olsa dayanıklılık/maliyet özelliğidir.",
    };
  }
  return {
    code: "belirsiz",
    reason:
      `Göreli azalma ${pct(relative)}: iki eşiğin arasında. ` +
      "DESIGN'ın kuralı burada k artırmak ve görev setini genişletmek.",
  };
}
