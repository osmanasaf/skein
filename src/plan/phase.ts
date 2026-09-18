import type { Card } from "../card/card.js";
import { planAuthor, planObjectors, type TopologySnapshot } from "../flow/snapshot.js";

/**
 * Planlama alışverişinde bir rolün turu ne anlama geliyor.
 *
 * Saf: karar KARTIN GEÇMİŞİNDEN okunuyor, bellekte tutulan bir durumdan
 * değil. Bu, "durum ajanın kafasında değil" ilkesinin planlama tarafındaki
 * karşılığı — gözcü çökse de kart nerede kaldığını kendi taşır.
 */
export type PlanPhase =
  | { kind: "yok" }
  | { kind: "yaz" }
  | { kind: "itiraz"; round: number }
  | { kind: "cevap"; round: number };

type PlanEntry = Extract<Card["history"][number], { event: "plan" }>;

/** Kartın geçmişindeki son planlama kaydı. */
export function lastPlanEntry(card: Card): PlanEntry | null {
  for (let i = card.history.length - 1; i >= 0; i -= 1) {
    const entry = card.history[i];
    if (entry?.event === "plan") return entry;
  }
  return null;
}

export function planPhase(card: Card, roleId: string, topology: TopologySnapshot): PlanPhase {
  const author = planAuthor(topology);
  if (author === null) return { kind: "yok" };
  const objectors = planObjectors(topology);
  if (roleId !== author && !objectors.includes(roleId)) return { kind: "yok" };

  const last = lastPlanEntry(card);

  if (roleId === author) {
    // Plan henüz yazılmadıysa bu tur onu yazma turu.
    if (last === null) return { kind: "yaz" };
    // İtirazdan sonra yazara dönen kart cevap turundadır.
    if (last.action === "itiraz") return { kind: "cevap", round: last.round };
    // Yazarın başka bir turu yok: alışveriş ya kapandı ya da itiraz bekliyor.
    return { kind: "yok" };
  }

  // İtiraz eden rol: plan yazıldıysa itiraz turu.
  if (last === null) return { kind: "yok" };
  if (last.action === "yazdi") return { kind: "itiraz", round: 1 };
  // Cevaptan sonraki yeni tur 6c'nin konusu; bugün tur sınırı 1.
  const limit = topology.plan?.tur ?? 1;
  if (last.action === "cevap" && last.round < limit) {
    return { kind: "itiraz", round: last.round + 1 };
  }
  return { kind: "yok" };
}
