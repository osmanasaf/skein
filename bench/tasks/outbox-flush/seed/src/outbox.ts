import { nextId } from "./ids.js";
import type { Mesaj, Sink } from "./sink.js";

/**
 * Gönderilmeyi bekleyen mesajların kuyruğu.
 *
 * Değişmezler:
 *  - `pending()` kopya döndürür: dışarıdan bozulamaz.
 *  - Kuyruk sırası, kuyruğa giriş sırasıdır.
 *  - Bir mesajın kimliği kuyruğa girdiği anda verilir ve bir daha değişmez.
 */
export class Outbox {
  readonly #sink: Sink;
  readonly #bekleyen: Mesaj[] = [];

  constructor(sink: Sink) {
    this.#sink = sink;
  }

  /** Gövdeyi kuyruğa alır ve mesajın kimliğini döndürür. */
  enqueue(govde: string): string {
    const mesaj: Mesaj = { id: nextId(), govde };
    this.#bekleyen.push(mesaj);
    return mesaj.id;
  }

  /** Bekleyen mesajlar, kuyruk sırasıyla. Kopyadır. */
  pending(): readonly Mesaj[] {
    return [...this.#bekleyen];
  }

  get bekleyenSayisi(): number {
    return this.#bekleyen.length;
  }
}
