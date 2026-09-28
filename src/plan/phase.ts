import type { Card } from "../card/card.js";
import { planAuthor, planObjectors, type TopologySnapshot } from "../flow/snapshot.js";

/**
 * Planlama alışverişinde bir rolün turu ne anlama geliyor.
 *
 * Saf: karar KARTIN GEÇMİŞİNDEN okunuyor, bellekte tutulan bir durumdan
 * değil. Bu, "durum ajanın kafasında değil" ilkesinin planlama tarafındaki
 * karşılığı — gözcü çökse de kart nerede kaldığını kendi taşır.
 *
 * Bir tur şu şekilde ilerliyor: yazar planı yazar, itirazcılar zincir
 * sırasında birer birer itiraz eder, turun sonunda yazar hepsini yanıtlar.
 * Sıradaki turun kime ait olduğu, son plan kaydının rolüne bakılarak
 * bulunuyor — ayrı bir "sıra" alanı tutmak, kartla senkron kalması gereken
 * ikinci bir gerçek olurdu.
 */
export type PlanPhase =
  | { kind: "yok" }
  | { kind: "yaz" }
  | { kind: "itiraz"; round: number }
  | { kind: "cevap"; round: number };

type PlanEntry = Extract<Card["history"][number], { event: "plan" }>;

/** Kartın geçmişindeki son planlama kaydının yeri; yoksa -1. */
function lastPlanIndex(card: Card): number {
  for (let i = card.history.length - 1; i >= 0; i -= 1) {
    if (card.history[i]?.event === "plan") return i;
  }
  return -1;
}

/** Kartın geçmişindeki son planlama kaydı. */
export function lastPlanEntry(card: Card): PlanEntry | null {
  const i = lastPlanIndex(card);
  return i === -1 ? null : (card.history[i] as PlanEntry);
}

/**
 * İnsan planlama kilidini kapıdan `retry` ile yeniden açtı mı.
 *
 * Tasarımın kuralı: planı yalnızca insan yeniden açar. Makine tarafındaki
 * karşılığı bu — son plan kaydından SONRA bir kapı ve insanın kararı
 * varsa, kapıda bekleyen rol turunu baştan koşar. Bu bilgi de kartın
 * kendi geçmişinden okunuyor; "şu kart yeniden açıldı" diye bir bayrak
 * tutmak, kartla senkron kalması gereken ikinci bir gerçek olurdu.
 */
function reopenedFor(card: Card): string | null {
  const i = lastPlanIndex(card);
  if (i === -1) return null;
  // Kapı, plan kaydının HEMEN ardından gelmek zorunda: `deadlock` ikisini
  // yan yana yazıyor, `release` de kararı kapının hemen üstüne koyuyor.
  //
  // Gevşek bir tarama (plan kaydından sonraki İLK kapı + bırakma) burada
  // bir kusur üretiyordu: zincirin ilerisindeki bir rol kaçış kapısına
  // çıktığında insanın `back` kararı da `released` yazıyor ve hedefi ret
  // hedefi — yani sıklıkla planı yazan rol. O kart planlamayı yeniden
  // açmak için dönmüyor; kodla ilgili bir sebepten dönüyor. Yeniden
  // açılmış sayılsaydı, plan yazarına "itirazları yanıtla" turu
  // verilirdi.
  const kapi = card.history[i + 1];
  const karar = card.history[i + 2];
  if (kapi?.event !== "gate" || karar?.event !== "released") return null;
  // `released.role` insanın kartı verdiği rol: `retry`de aynı rol,
  // `forward`da alışverişten sonraki rol. İkincisinde katılımcı eşleşmez
  // ve alışveriş yeniden açılmaz — istenen de bu.
  return karar.role;
}

/**
 * Tur başında elde olan geçerli itiraz sayısı.
 *
 * "Bu turda yeni itiraz eklendi mi" sorusunun tabanı. Doğal sonlanma
 * kuralı (`PLANLAMA.md`: bir tur hiç yeni itiraz eklemediyse alışveriş
 * biter) buna dayanıyor ve denetim kapısındaki "parmak izi değişmedi"
 * kuralının kardeşi.
 *
 * `round`'dan ÖNCEKİ son sayıya bakılıyor, bir önceki turun yazar
 * kaydına değil: yazar turu hiç koşmadan bitmiş bir tur olabilir (doğal
 * son), ve o durumda taban yine son bilinen sayıdır.
 */
export function objectionBaseline(card: Card, round: number): number {
  for (let i = card.history.length - 1; i >= 0; i -= 1) {
    const entry = card.history[i];
    if (entry?.event !== "plan") continue;
    if (entry.round >= round) continue;
    if (entry.objections !== undefined) return entry.objections;
  }
  return 0;
}

export function planPhase(card: Card, roleId: string, topology: TopologySnapshot): PlanPhase {
  const author = planAuthor(topology);
  if (author === null) return { kind: "yok" };
  const objectors = planObjectors(topology);
  if (roleId !== author && !objectors.includes(roleId)) return { kind: "yok" };

  const last = lastPlanEntry(card);
  if (last === null) return roleId === author ? { kind: "yaz" } : { kind: "yok" };

  // Yeniden açılan alışverişte sıra ilerlemiyor: kapıda bekleyen rol AYNI
  // turu yeniden koşuyor. İlerletmek, insanın "bunu düzelt" dediği turu
  // atlamak olurdu.
  const yeniden = reopenedFor(card);
  if (yeniden !== null) {
    if (yeniden !== last.role || roleId !== last.role) return { kind: "yok" };
    switch (last.action) {
      case "yazdi": return { kind: "yaz" };
      case "itiraz": return { kind: "itiraz", round: last.round };
      case "cevap": return { kind: "cevap", round: last.round };
    }
  }

  const limit = topology.plan?.tur ?? 1;

  switch (last.action) {
    case "yazdi":
      // Plan yazıldı: turun İLK itirazcısı söz alır.
      return roleId === objectors[0] ? { kind: "itiraz", round: 1 } : { kind: "yok" };

    case "itiraz": {
      const sira = objectors.indexOf(last.role);
      // Topolojide olmayan bir rolün itirazı: sıra hesaplanamaz, alışveriş
      // ilerletilmez. Sessizce başa dönmek, itirazcıları sonsuz döndürürdü.
      if (sira === -1) return { kind: "yok" };
      const sonraki = objectors[sira + 1];
      if (sonraki !== undefined) {
        return roleId === sonraki ? { kind: "itiraz", round: last.round } : { kind: "yok" };
      }
      // Turun bütün itirazcıları konuştu: yanıt sırası yazarda.
      return roleId === author ? { kind: "cevap", round: last.round } : { kind: "yok" };
    }

    case "cevap":
      // Yanıt verildi. Tavan dolmadıysa yeni bir tur açılır; itirazcılar
      // DÜZELTİLMİŞ planı okuyup yeni itiraz yazabilir. Hiçbiri yazmazsa
      // alışveriş o turun sonunda doğal olarak biter.
      if (last.round >= limit) return { kind: "yok" };
      return roleId === objectors[0] ? { kind: "itiraz", round: last.round + 1 } : { kind: "yok" };
  }
}
