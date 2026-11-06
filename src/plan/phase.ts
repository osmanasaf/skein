import type { Card } from "../card/card.js";
import { isPlanner, planAuthor, planObjectors, type TopologySnapshot } from "../flow/snapshot.js";

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
 * Son plan kaydından sonra kart alışverişin DIŞINA çıktı mı.
 *
 * Katılımcı olmayan bir rolün `taken`/`handoff`/`reject` kaydı aranıyor:
 * alışveriş içindeki taşıma yalnızca `plan` kaydı bırakıyor, yani böyle
 * bir kayıt kartın zinciri sürdürdüğünü söylüyor.
 */
function exchangeClosed(card: Card, topology: TopologySnapshot): boolean {
  const i = lastPlanIndex(card);
  if (i === -1) return false;
  const participant = (rol: string): boolean => isPlanner(topology, rol);
  for (const entry of card.history.slice(i + 1)) {
    switch (entry.event) {
      case "taken":
        if (!participant(entry.role)) return true;
        break;
      case "handoff":
        if (!participant(entry.from) || !participant(entry.to)) return true;
        break;
      case "reject":
        if (!participant(entry.from)) return true;
        break;
      default:
        break;
    }
  }
  return false;
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
  const gate = card.history[i + 1];
  const decision = card.history[i + 2];
  if (gate?.event !== "gate" || decision?.event !== "released") return null;
  // `released.role` insanın kartı verdiği rol: `retry`de aynı rol,
  // `forward`da alışverişten sonraki rol. İkincisinde katılımcı eşleşmez
  // ve alışveriş yeniden açılmaz — istenen de bu.
  return decision.role;
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
  const again = reopenedFor(card);
  if (again !== null) {
    if (again !== last.role || roleId !== last.role) return { kind: "yok" };
    switch (last.action) {
      case "yazdi": return { kind: "yaz" };
      case "itiraz": return { kind: "itiraz", round: last.round };
      case "cevap": return { kind: "cevap", round: last.round };
    }
  }

  // ALIŞVERİŞ KAPANDI MI — ürün farkını okumadan önceki soru.
  //
  // Eski kod yalnızca SON PLAN KAYDINA bakıyordu, kartın alışverişten
  // ÇIKIP çıkmadığını hiç sormuyordu. Ölçülmüş sonucu şu: alışveriş doğal
  // sonla biter, kart `coder`'a gider, `coder` KODLA ilgili bir sebepten
  // reddeder ve kart `reject: planner` kenarıyla yazara döner. `planPhase`
  // o noktada hâlâ `{kind:"cevap", round: N}` diyor, iş metni
  // "## İtirazları yanıtla" basıyor, ve `tick`'in cevap turu dalı koşuyor:
  // plan dosyası değişmediği için kart "KABUL etti ama planı değiştirmedi"
  // gerekçesiyle insan kapısına çıkıyor. Reddin gerçek sebebi hiç ele
  // alınmıyor ve operatöre tamamen yanlış teşhis gidiyor.
  //
  // Yer gerçeği kartın kendi geçmişi: son plan kaydından SONRA
  // alışverişin dışındaki bir rol kartı aldıysa ya da devrettiyse,
  // alışveriş kapanmıştır. Alışveriş İÇİNDE taşıma `plan` kaydıyla
  // yapılıyor (`planTurn`), `taken`/`handoff`/`reject` kayıtları
  // bırakmıyor — o yüzden katılımcı olmayan bir rolün kaydı, kartın
  // zinciri sürdürdüğünün kanıtı.
  //
  // İnsanın yeniden açtığı alışveriş bu kapıdan ÖNCE okunuyor
  // (`reopenedFor`), çünkü planı yalnızca insan yeniden açar.
  if (exchangeClosed(card, topology)) return { kind: "yok" };

  const limit = topology.plan?.tur ?? 1;

  switch (last.action) {
    case "yazdi":
      // Plan yazıldı: turun İLK itirazcısı söz alır.
      return roleId === objectors[0] ? { kind: "itiraz", round: 1 } : { kind: "yok" };

    case "itiraz": {
      const order = objectors.indexOf(last.role);
      // Topolojide olmayan bir rolün itirazı: sıra hesaplanamaz, alışveriş
      // ilerletilmez. Sessizce başa dönmek, itirazcıları sonsuz döndürürdü.
      if (order === -1) return { kind: "yok" };
      const nextOne = objectors[order + 1];
      if (nextOne !== undefined) {
        return roleId === nextOne ? { kind: "itiraz", round: last.round } : { kind: "yok" };
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
