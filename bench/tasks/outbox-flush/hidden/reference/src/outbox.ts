import { nextId } from "./ids.js";
import type { Mesaj, Sink } from "./sink.js";

/**
 * REFERANS ÇÖZÜM — yalnızca kancaların karşılanabilir olduğunu kanıtlar.
 *
 * Kritik nokta spec'te yazmıyor, `sink.ts`'te yazıyor: taşıyıcı kimliğe
 * göre tekilleştiriyor. Yani yeniden deneme AYNI mesaj nesnesiyle
 * yapılmalı; mesajı gövdesinden yeniden kuyruğa koymak yeni bir kimlik
 * üretir ve aynı gövdeyi karşı tarafa iki kez teslim ettirir.
 */
export class Outbox {
  readonly #sink: Sink;
  readonly #bekleyen: Mesaj[] = [];

  constructor(sink: Sink) {
    this.#sink = sink;
  }

  enqueue(govde: string): string {
    const mesaj: Mesaj = { id: nextId(), govde };
    this.#bekleyen.push(mesaj);
    return mesaj.id;
  }

  pending(): readonly Mesaj[] {
    return [...this.#bekleyen];
  }

  get bekleyenSayisi(): number {
    return this.#bekleyen.length;
  }

  async flush(denemeSayisi = 3): Promise<number> {
    const sirada = [...this.#bekleyen];
    const kalan: Mesaj[] = [];
    let teslim = 0;

    for (const mesaj of sirada) {
      if (await this.#gonder(mesaj, denemeSayisi)) teslim += 1;
      else kalan.push(mesaj);
    }

    this.#bekleyen.length = 0;
    this.#bekleyen.push(...kalan);
    return teslim;
  }

  async #gonder(mesaj: Mesaj, denemeSayisi: number): Promise<boolean> {
    for (let i = 0; i < denemeSayisi; i += 1) {
      try {
        await this.#sink.send(mesaj);
        return true;
      } catch {
        // Bir sonraki deneme aynı mesajla, yani aynı kimlikle.
      }
    }
    return false;
  }
}
