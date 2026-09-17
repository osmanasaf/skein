import { join } from "node:path";
import { EventLog } from "../events/log.js";
import { gateKind, type Card } from "./card.js";
import type { CardQueue, ReleaseDecision } from "./queue.js";

export interface ReleaseResult {
  card: Card;
  /** Hangi karar uygulandı — verilmediyse kapının varsayılanı. */
  decision: ReleaseDecision;
  kind: "approval" | "deadlock" | "escalation";
}

/**
 * İnsanın kapı kararı — kartı taşır ve kaydı düşer.
 *
 * `queue.release()` tek başına yetmiyordu: karar kartın geçmişine giriyor ama
 * olay günlüğüne girmiyordu, yani "insan ne sıklıkla araya girdi" sorusu
 * kartları tek tek açmadan cevaplanamıyordu.
 *
 * Günlük yazımı KUYRUĞUN İÇİNDE değil burada, çünkü kuyruk ölçümden habersiz
 * kalmalı: kartın nerede olduğu ile o kararın kaydı iki ayrı sorumluluk.
 * Ekran da, `card` CLI'ı da buradan geçer.
 */
export async function releaseCard(
  root: string,
  queue: CardQueue,
  id: string,
  decision?: ReleaseDecision,
  logPath?: string,
): Promise<ReleaseResult> {
  const before = await queue.get(id);
  // Kapı tipi bırakmadan ÖNCE okunur: bırakma kartın son kaydını değiştirir.
  const kind = before === null ? null : gateKind(before);

  const card = await queue.release(id, decision === undefined ? {} : { decision });
  const uygulanan: ReleaseDecision =
    decision ?? (kind === "escalation" ? "retry" : "forward");

  const log = new EventLog(logPath ?? join(root, ".skein", "olaylar.jsonl"), `insan-${Date.now()}`);
  try {
    await log.append({
      type: "gate.released",
      card: card.id,
      role: card.role,
      decision: uygulanan,
      kind: kind ?? "approval",
    });
  } catch {
    // Kayıt gözlem; kart zaten taşındı ve geçmişinde yazıyor. Diski dolmuş
    // bir makinede insanın kararını geri almak, kaydı kaybetmekten kötüdür.
  }

  return { card, decision: uygulanan, kind: kind ?? "approval" };
}
