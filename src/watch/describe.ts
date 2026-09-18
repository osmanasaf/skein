import type { Card, HistoryEntry } from "../card/card.js";
import type { TickResult } from "./tick.js";

export const MARK: Record<TickResult["status"], string> = {
  idle: " ",
  accepted: "→",
  rejected: "←",
  escalated: "⏸",
};

type PlanEntry = Extract<HistoryEntry, { event: "plan" }>;

/**
 * Bu GEÇİŞ bir planlama turu muydu, öyleyse hangi tur.
 *
 * `plan/phase.ts`'teki `lastPlanEntry`'den KASITLI olarak farklı ve onun
 * yerine kullanılmamalı: o, geçmişte geriye doğru ilk `plan` kaydını bulur
 * (arada kaç `handoff`/`taken`/`reject` geçmiş olursa olsun) — "şu an hangi
 * plan fazındayız" kararı için doğru, ama "BU geçiş bir plan turu muydu"
 * sorusu için YANLIŞ: planlaması aylar önce bitmiş bir kart, ondan sonraki
 * her sıradan geçişte de eski turu göstermeye devam eder (sahte pozitif).
 *
 * Doğru test `card/queue.ts`'ten geliyor: `take()` HER turun başında bir
 * `{ event: "taken" }` kaydı ekliyor; bu, bir önceki (artık bitmiş) plan
 * turunu her zaman ayırıyor. Yani "bu geçişte gerçekten bir plan kaydı
 * eklendi mi" sorusu SADECE şuna bakılarak güvenle cevaplanabilir: geçmişin
 * son elemanı `plan` mı (`planTurn()`), ya da son eleman `gate` ve ondan
 * hemen önceki eleman `plan` mı (`deadlock()`, plan kaydını gate'ten hemen
 * önce iter). Aradaki `taken` kaydı yanlış pozitifi engeller.
 */
export function thisTurnPlanEntry(card: Card): PlanEntry | null {
  const history = card.history;
  const last = history[history.length - 1];
  if (last?.event === "plan") return last;
  if (last?.event === "gate") {
    const prev = history[history.length - 2];
    if (prev?.event === "plan") return prev;
  }
  return null;
}

/**
 * Bu geçiş bir planlama turuysa, geçiş satırına eklenecek not.
 *
 * Ret kenarının kendi turu (`card/cli.ts`'teki `(tur ${entry.round})`) ile
 * karışmasın diye "planlama" sözcüğü açıkça geçiyor — aynı ekranda iki ayrı
 * tur sayacı var.
 */
function planNote(card: Card): string {
  const entry = thisTurnPlanEntry(card);
  if (entry === null) return "";
  // Yazma turunun `round`u 0 ve "tur 0" okuyana bir şey söylemiyor: o tur
  // sayacın dışında, alışveriş ondan sonra başlıyor.
  if (entry.action === "yazdi") return "  (planlama: plan yazıldı)";
  const kac = entry.objections;
  const sayi = kac === undefined
    ? ""
    : `, ${kac} itiraz${entry.accepted ? ` / ${entry.accepted} kabul` : ""}` +
      (entry.invalid ? ` / ${entry.invalid} sayılmadı` : "");
  return `  (planlama, tur ${entry.round}${sayi})`;
}

export function describeTick(role: string, result: TickResult): string {
  const head = `${MARK[result.status]} ${role.padEnd(10)}`;
  switch (result.status) {
    case "idle":
      return `${head} —`;
    case "accepted":
      return `${head} kabul → ${result.card.state === "done" ? "bitti" : result.card.role}` +
        planNote(result.card) +
        (result.summary === undefined ? "" : `  (${result.summary})`) +
        (result.warnings === undefined
          ? ""
          : result.warnings.map((w) => `\n             ⚠ ${w}`).join(""));
    case "rejected":
      return `${head} RET → ${result.card.role}\n             ${result.reason}`;
    case "escalated":
      return `${head} ⏸ insan kapısı` + planNote(result.card) + `\n             ${result.reason}`;
  }
}
