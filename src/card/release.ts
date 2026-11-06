import { join } from "node:path";
import { EventLog } from "../events/log.js";
import type { Card } from "./card.js";
import { kapiKarari, type CardQueue, type ReleaseDecision } from "./queue.js";

export interface ReleaseResult {
  card: Card;
  /** GERÇEKTEN uygulanan karar — istenenden farklı olabilir. */
  decision: ReleaseDecision;
  /**
   * İnsanın istediği karar. `decision`'dan farklıysa, istenen şey
   * yapılamamıştır: zincirin başında `back`'in hedefi yok ve olan şey bir
   * `retry`'dir. Çağıran bunu kullanıcıya söylemek zorunda, yoksa insan
   * kartı geri gönderdiğini sanır.
   */
  requested: ReleaseDecision;
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
  // Kapı kararı bırakmadan ÖNCE hesaplanır: bırakma kartın son kaydını
  // değiştirir, yani sonra hesaplanan `gateKind` artık o kapıyı görmez.
  // Hesabı `kapiKarari` yapıyor — `queue.release` de aynı yerden okuyor,
  // böylece günlüğe yazılan karar ile kartın gittiği yer AYNI kaynaktan
  // geliyor. Eskiden ikisi ayrı ayrı hesaplanıyordu ve ayrışıyorlardı.
  const karar = before === null ? null : kapiKarari(before, decision);

  const card = await queue.release(id, decision === undefined ? {} : { decision });

  const log = new EventLog(logPath ?? join(root, ".skein", "olaylar.jsonl"), `insan-${Date.now()}`);
  try {
    await log.append({
      type: "gate.released",
      card: card.id,
      role: card.role,
      // UYGULANAN karar. Eskiden İSTENEN yazılıyordu: zincirin başında
      // `back` sessizce `retry` oluyor ama günlüğe `back` giriyordu, yani
      // "insan kartı geri gönderdi mi" sorusu günlükten yanlış
      // cevaplanıyordu — hiç geri gitmemiş kartlar `back` sayılıyordu.
      decision: karar?.applied ?? "forward",
      // İstenen şey yapılamadıysa o da kaybolmamalı: insanın niyeti de
      // ölçülebilir bir olgu.
      ...(karar !== null && karar.requested !== karar.applied
        ? { requested: karar.requested }
        : {}),
      kind: karar?.kind ?? "approval",
    });
  } catch {
    // Kayıt gözlem; kart zaten taşındı ve geçmişinde yazıyor. Diski dolmuş
    // bir makinede insanın kararını geri almak, kaydı kaybetmekten kötüdür.
  }

  return {
    card,
    decision: karar?.applied ?? "forward",
    requested: karar?.requested ?? "forward",
    kind: karar?.kind ?? "approval",
  };
}
