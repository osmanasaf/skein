import type { SkeinEvent } from "../events/log.js";
import { MIN_REPEATS, NEGATIVE_THRESHOLD, POSITIVE_THRESHOLD, type VerdictCode } from "./effect.js";
import type { Arm } from "./ab.js";

/**
 * 6d'nin raporu: planlama turu ürünü daha doğru yapıyor mu?
 *
 * Ölçüt `PLANLAMA.md`'de SONUÇTAN ÖNCE yazıldı ve eşikler `effect.ts`'ten
 * ödünç alınıyor — iki ölçümün aynı kuralla okunması kasıtlı: "planlama işe
 * yaradı mı" ile "çapraz denetim işe yaradı mı" sorularının eşiği farklı
 * olsaydı, hangisinin daha cömert okunduğu tartışması açılırdı.
 */
export interface ArmSide {
  /** Kolun ölçülebilmiş koşu sayısı. */
  runs: number;
  hooks: number;
  red: number;
  /** Kırmızı kanca oranı. */
  redRate: number;
  activations: number;
  costUsd: number;
  rejects: number;
  /** Ölçülemeyen koşular: "kusur yok" DEĞİL, yer gerçeği yok. */
  unmeasured: number;
}

export interface PlanGroup {
  taskId: string;
  /** Üretici model kurgusu; grubun anahtarının öteki yarısı. */
  model: string;
  planli: ArmSide | null;
  plansiz: ArmSide | null;
  /** Kırmızı kanca oranındaki göreli azalma: (plansız − planlı) / plansız. */
  relativeReduction: number | null;
  /** Koşu başına azalma; işaret tutarlılığı buradan okunur. */
  perRun: { runId: string; relativeReduction: number | null }[];
  repeats: number;
  /** Alışverişin töreni: itirazsız kapanan oran ve kabul oranı. */
  ceremony: { exchanges: number; withoutObjection: number; objections: number; accepted: number; invalid: number };
  verdict: { code: VerdictCode; reason: string };
}

export interface PlanEffectReport {
  groups: PlanGroup[];
  verdict: { code: VerdictCode; reason: string };
}

interface ArmRun {
  runId: string;
  taskId: string;
  model: string;
  arm: Arm;
  ran: boolean;
  hooks: number;
  red: number;
  activations: number;
  costUsd: number;
  rejects: number;
  planning?: { rounds: number; objections: number; accepted: number; invalid: number };
}

/** Günlükten kol koşularını çıkarır; kol bilgisi `ab.arm` olayından gelir. */
export function armRuns(events: SkeinEvent[]): ArmRun[] {
  const arms = new Map<string, { taskId: string; arm: Arm; model: string }>();
  for (const e of events) {
    // `model` 6d'nin ilk kampanyasında YOKTU; o günlüklerin kolları
    // "(bilinmiyor)" grubuna düşüyor. Eksik alanı sessizce boş saymak,
    // eski koşuları yeni bir modelin grubuna karıştırırdı.
    if (e.type === "ab.arm") {
      arms.set(e.runId, { taskId: e.taskId, arm: e.arm, model: e.model ?? "(bilinmiyor)" });
    }
  }

  const out = new Map<string, ArmRun>();
  for (const [runId, meta] of arms) {
    out.set(runId, {
      runId, taskId: meta.taskId, model: meta.model, arm: meta.arm,
      ran: false, hooks: 0, red: 0, activations: 0, costUsd: 0, rejects: 0,
    });
  }

  for (const e of events) {
    const run = out.get(e.runId);
    if (run === undefined) continue;
    if (e.type === "agent.finished") {
      run.activations += 1;
      run.costUsd += e.usage?.costUsd ?? 0;
    }
    if (e.type === "card.settled" && e.outcome === "rejected") run.rejects += 1;
    if (e.type === "plan.settled") {
      run.planning = {
        rounds: e.rounds, objections: e.objections, accepted: e.accepted, invalid: e.invalid,
      };
    }
    // Ölçüm kaydı SON yazılan olay; koşuda birden fazlaysa son geçerli.
    if (e.type === "hooks.measured") {
      run.ran = e.ran;
      run.hooks = e.total;
      run.red = e.red.length;
    }
  }
  return [...out.values()];
}

function side(runs: ArmRun[]): ArmSide | null {
  if (runs.length === 0) return null;
  const olculen = runs.filter((r) => r.ran);
  const hooks = olculen.reduce((s, r) => s + r.hooks, 0);
  const red = olculen.reduce((s, r) => s + r.red, 0);
  return {
    runs: olculen.length,
    hooks,
    red,
    redRate: hooks === 0 ? 0 : red / hooks,
    activations: runs.reduce((s, r) => s + r.activations, 0),
    costUsd: runs.reduce((s, r) => s + r.costUsd, 0),
    rejects: runs.reduce((s, r) => s + r.rejects, 0),
    unmeasured: runs.length - olculen.length,
  };
}

function reduction(plansiz: ArmSide | null, planli: ArmSide | null): number | null {
  if (plansiz === null || planli === null) return null;
  if (plansiz.runs === 0 || planli.runs === 0) return null;
  // Kontrol kolunda hiç kusur yoksa "azalma" tanımsız: sıfırdan azalma yok
  // ve sıfıra bölmek sonsuz bir etki uydurur.
  if (plansiz.redRate === 0) return null;
  return (plansiz.redRate - planli.redRate) / plansiz.redRate;
}

export function planEffect(events: SkeinEvent[]): PlanEffectReport {
  const runs = armRuns(events);
  // Grup = görev × MODEL KURGUSU. Yalnızca göreve göre gruplamak, kampanya
  // ortasında üretici değişince iki kurgu tek gruba eritir ve k şişer —
  // `effect.ts`'te bir kez yapılan ve düzeltilen hatanın aynısı. Burada
  // ikinci kez yapıldı ve canlı kampanyada yakalandı: aynı görev sonnet ve
  // haiku ile koşulduğunda rapor ikisini tek hücre sanıyordu.
  const byGroup = new Map<string, ArmRun[]>();
  for (const r of runs) {
    const key = `${r.taskId}\u0000${r.model}`;
    const list = byGroup.get(key);
    if (list) list.push(r);
    else byGroup.set(key, [r]);
  }

  const groups: PlanGroup[] = [...byGroup.entries()].map(([key, own]) => {
    const [taskId, model] = key.split("\u0000") as [string, string];
    const planliRuns = own.filter((r) => r.arm === "planli");
    const plansizRuns = own.filter((r) => r.arm === "plansiz");
    const planli = side(planliRuns);
    const plansiz = side(plansizRuns);

    // Tekrar = kolların ikisinde de ölçülmüş koşu sayısının KÜÇÜĞÜ. Bir
    // kolda üç, ötekinde bir koşu varsa elde üç tekrar yok, bir tane var.
    const repeats = Math.min(planli?.runs ?? 0, plansiz?.runs ?? 0);

    // Koşu başına eşleştirme: aynı sıradaki koşular karşılaştırılıyor.
    const perRun = planliRuns
      .filter((r) => r.ran)
      .map((r, i) => {
        const karsi = plansizRuns.filter((x) => x.ran)[i];
        return {
          runId: r.runId,
          relativeReduction: karsi === undefined || karsi.hooks === 0 || karsi.red === 0
            ? null
            : (karsi.red / karsi.hooks - r.red / r.hooks) / (karsi.red / karsi.hooks),
        };
      });

    const exchanges = planliRuns.filter((r) => r.planning !== undefined);
    const ceremony = {
      exchanges: exchanges.length,
      withoutObjection: exchanges.filter((r) => (r.planning?.objections ?? 0) === 0).length,
      objections: exchanges.reduce((s, r) => s + (r.planning?.objections ?? 0), 0),
      accepted: exchanges.reduce((s, r) => s + (r.planning?.accepted ?? 0), 0),
      invalid: exchanges.reduce((s, r) => s + (r.planning?.invalid ?? 0), 0),
    };

    const relativeReduction = reduction(plansiz, planli);
    return {
      taskId, model, planli, plansiz, relativeReduction, perRun, repeats, ceremony,
      verdict: decide(relativeReduction, repeats, perRun, plansiz),
    };
  });

  return { groups, verdict: overall(groups) };
}

function decide(
  relative: number | null,
  repeats: number,
  perRun: { relativeReduction: number | null }[],
  plansiz: ArmSide | null,
): { code: VerdictCode; reason: string } {
  if (plansiz === null || plansiz.runs === 0) {
    return { code: "yetersiz", reason: "Kontrol kolu ölçülmedi; karşılaştırılacak bir şey yok." };
  }
  if (relative === null) {
    return {
      code: "yetersiz",
      reason: "Kontrol kolunda hiç kırmızı kanca yok; azalma tanımsız. " +
        "Kusur üretmeyen görevde planlamanın etkisi ölçülemez.",
    };
  }
  if (repeats < MIN_REPEATS) {
    return {
      code: "yetersiz",
      reason: `k=${repeats}; karar için iki kolda da en az ${MIN_REPEATS} ölçülmüş koşu gerekiyor. ` +
        "Aşağıdaki sayı sinyaldir, sonuç değildir.",
    };
  }
  const signs = perRun.map((r) => r.relativeReduction).filter((r): r is number => r !== null);
  const consistent = signs.length > 0 && signs.every((r) => r > 0);
  const pct = (n: number): string => `%${(n * 100).toFixed(0)}`;

  if (relative >= POSITIVE_THRESHOLD && consistent) {
    return {
      code: "olumlu",
      reason: `Kırmızı kanca oranında ${pct(relative)} göreli azalma (eşik ` +
        `${pct(POSITIVE_THRESHOLD)}) ve azalma ${signs.length} tekrarın hepsinde aynı yönde.`,
    };
  }
  if (relative >= POSITIVE_THRESHOLD) {
    return {
      code: "belirsiz",
      reason: `Azalma eşiğin üstünde (${pct(relative)}) ama tekrarlar arasında işaret ` +
        "tutarsız — en az bir tekrarda planlı kol daha ÇOK kusur üretti. k artırılmalı.",
    };
  }
  if (relative < NEGATIVE_THRESHOLD) {
    return {
      code: "olumsuz",
      reason: `Göreli azalma ${pct(relative)}, eşiğin (${pct(NEGATIVE_THRESHOLD)}) altında. ` +
        "Planlama turu ürünü daha doğru yapmıyor; bedeli aktivasyon farkı kadar.",
    };
  }
  return {
    code: "belirsiz",
    reason: `Göreli azalma ${pct(relative)}: iki eşiğin arasında. k artırılmalı.`,
  };
}

/** Görev sınıfları çelişirse havuzda eritilmez; ayrışma yazılır. */
function overall(groups: PlanGroup[]): { code: VerdictCode; reason: string } {
  if (groups.length === 0) {
    return { code: "yetersiz", reason: "Ölçülmüş kol koşusu yok." };
  }
  const only = groups[0] as PlanGroup;
  if (groups.length === 1) return only.verdict;

  const say = (g: PlanGroup): string => `${g.taskId} × ${g.model} (k=${g.repeats})`;
  const decisive = groups.filter((g) => g.verdict.code === "olumlu" || g.verdict.code === "olumsuz");
  if (decisive.length === 0) {
    return {
      code: "yetersiz",
      reason: `${groups.length} görevin hiçbiri karar verecek durumda değil: ` +
        groups.map((g) => `${say(g)} → ${g.verdict.code}`).join(", ") + ".",
    };
  }
  const positive = decisive.filter((g) => g.verdict.code === "olumlu");
  const negative = decisive.filter((g) => g.verdict.code === "olumsuz");
  if (negative.length === 0) {
    return { code: "olumlu", reason: `Karar verebilen ${positive.length} görevin hepsi olumlu: ` + positive.map(say).join(", ") + "." };
  }
  if (positive.length === 0) {
    return { code: "olumsuz", reason: `Karar verebilen ${negative.length} görevin hepsi olumsuz: ` + negative.map(say).join(", ") + "." };
  }
  return {
    code: "belirsiz",
    reason: "Görevler ayrışıyor — olumlu: " + positive.map(say).join(", ") +
      "; olumsuz: " + negative.map(say).join(", ") + ". Sonuç görev sınıfı başına okunmalı.",
  };
}
