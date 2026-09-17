import { apply } from "./apply.js";
import { BOS, type Event, type State } from "./state.js";

export type Listener = (state: State) => void;

/**
 * Olayları biriktiren ve her değişiklikte abonelere haber veren mağaza.
 *
 * Değişmezler:
 *  - `getSnapshot()` aynı sürüm için aynı nesneyi döndürür (kimlik sabit).
 *  - Abone yalnızca sürüm gerçekten değiştiğinde çağrılır.
 *  - Bildirim sırasında eklenen abone, o bildirimi almaz — liste kopyalanır.
 */
export class Store {
  #state: State = BOS;
  #history: Event[] = [];
  #listeners = new Set<Listener>();

  getSnapshot(): State {
    return this.#state;
  }

  /** Uygulanmış olayların sırası. Kopyadır: dışarıdan bozulamaz. */
  history(): readonly Event[] {
    return [...this.#history];
  }

  dispatch(event: Event): void {
    this.#state = apply(this.#state, event);
    this.#history.push(event);
    this.#notify();
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #notify(): void {
    // Kopya şart: bir dinleyici bildirim sırasında abonelikten çıkarsa
    // Set üzerinde gezinme ortasında değişir.
    for (const l of [...this.#listeners]) l(this.#state);
  }
}
