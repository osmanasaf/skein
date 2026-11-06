import type { Card } from "../card/card.js";
import type { CardQueue } from "../card/queue.js";

/**
 * Testlerde kartı alır; alınamazsa testi ANLAMLI mesajla düşürür.
 *
 * `take` artık `Card | null` değil üç kollu bir birlik döndürüyor —
 * "kuyruk boş" ile "kart var ama alınamadı" aynı değer olamasın diye.
 * Testlerin çoğu "kart elbette var" senaryosu kuruyor; o niyeti her
 * çağrı yerinde `as Card` ile EZMEK, gerçek bir engeli de sessizce
 * `undefined` erişimine çevirirdi. Burada niyet bir kez yazılıyor ve
 * engel durumunda sebebi basılıyor.
 */
export async function al(queue: CardQueue, role: string): Promise<Card> {
  const result = await queue.take(role);
  if (result.kind === "alindi") return result.card;
  if (result.kind === "bos") throw new Error(`${role} kuyruğu boş: alınacak kart yok`);
  throw new Error(
    `${role} kuyruğundan kart alınamadı: ` +
      result.blockages.map((e) => `${e.code} ${e.path}`).join(" · "),
  );
}
