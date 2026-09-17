import { join } from "node:path";
import { EventLog } from "../events/log.js";
import { roleOf, type TopologySnapshot } from "../flow/snapshot.js";
import type { Card } from "./card.js";
import { QueueError, type CardQueue } from "./queue.js";

/**
 * Kart, YAŞAYAN akışta karşılığı olmayan bir rolde mi bekliyor.
 *
 * Kartın kendi topolojisi sağlam; sorun akış dosyasının değişmiş olması.
 * İki farklı sebep aynı belirtiyi veriyor ve tek bir anlık görüntüden
 * ayırt edilemiyorlar:
 *
 * - Akıştan o rol gerçekten silindi (kart gerçekten yetim).
 * - Akışa yeni rol eklendi ama gözcü/ekran eski listeyi taşıyor (kart
 *   yetim değil, BAKAN taraf bayat).
 *
 * Ayırt edemesek de eylem aynı: bu kart hiçbir yere gitmiyor ve bunu
 * söylemek zorundayız. Sessiz takılma, bu projenin en sevmediği şey.
 */
export function isOrphan(card: Card, topology: TopologySnapshot | null): boolean {
  if (card.state === "done") return false;
  // Akış dosyası hiç okunamıyorsa (silinmiş, bozulmuş) o akışın her kartı
  // yetimdir: gidecek rol listesi yok.
  if (topology === null) return true;
  return roleOf(topology, card.role) === null;
}

/** Kartın başladığı topoloji ile yaşayan akış aynı damgada mı. */
export function isStale(card: Card, flowHash: string): boolean {
  return card.topology.hash !== flowHash;
}

export interface CloseResult {
  card: Card;
  reason: string;
}

/**
 * Yetim kartı kapatır — tek meşru çıkış.
 *
 * ## Neden "yeni akışa taşı" değil
 *
 * Kartı yaşayan topolojiye taşımak ilk bakışta daha nazik görünüyor ama iki
 * şeyi birden kırıyor:
 *
 * 1. **Dondurmanın verdiği tek garanti.** Kart, başladığı yoldan gider
 *    (değişmez 4). Yolu ortasında değiştirilebiliyorsa o garanti yoktur;
 *    "bazen değiştirilebilir" bir garanti değildir.
 * 2. **Kodun nerede olduğu.** İş, rol adını taşıyan dallarda duruyor
 *    (`skein/<workspace>`) ve ileri birleştirme zinciri o rollere göre
 *    kuruldu. Yeni bir topolojiye taşınan kartın commit'leri, kimsenin
 *    birleştirmeyeceği bir dalda kalır — sessizce.
 *
 * ## Neden "iptal" değil de "kapat"
 *
 * İptal, yapılan işin çöpe gittiğini ima ediyor. Gitmiyor: commit'ler
 * dalında duruyor, kartın izi geçmişinde duruyor. Kapanan şey kartın
 * YOLCULUĞU. İşi yeni akışta sürdürmek istiyorsan yeni kart açarsın; o kart
 * yeni topolojiyi dondurur ve eskisi izini bırakarak kapanır.
 */
export async function closeOrphan(
  root: string,
  queue: CardQueue,
  /** Kartın akışının YAŞAYAN hâli; okunamıyorsa `null`. */
  topology: TopologySnapshot | null,
  id: string,
  logPath?: string,
): Promise<CloseResult> {
  const card = await queue.get(id);
  if (card === null) throw new QueueError(`Böyle bir kart yok: ${id}`);

  // Kapatma YALNIZCA yetim kart için. Genel bir "kartı iptal et" düğmesi
  // olsaydı, sürtünmesi olması gereken bir şey (işi yarıda bırakmak)
  // sürtünmesiz olurdu.
  if (!isOrphan(card, topology)) {
    throw new QueueError(
      `\`${id}\` yetim değil: \`${card.role}\` rolü akışta duruyor.\n\n` +
        `  Kapatma yalnızca akışta karşılığı kalmamış kartlar için. Yoldaki bir\n` +
        `  kartı durdurmak istiyorsan kapıdan karara bağla.`,
    );
  }

  const reason =
    topology === null
      ? `\`${card.topology.flow}\` akışı okunamıyor — kart kapatıldı`
      : `akışta \`${card.role}\` rolü yok — kart kapatıldı`;
  const closed = await queue.close(id, reason);

  const log = new EventLog(logPath ?? join(root, ".skein", "olaylar.jsonl"), `insan-${Date.now()}`);
  try {
    await log.append({ type: "card.closed", card: closed.id, role: card.role, reason });
  } catch {
    // Kayıt gözlem; kart zaten kapandı ve geçmişinde gerekçesi yazıyor.
  }

  return { card: closed, reason };
}
