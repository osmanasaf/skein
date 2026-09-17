// REFERANS ÇÖZÜM — `hidden/` altında, yani üretici bunu asla görmez.
// Kancaların karşılanabilir olduğunu kanıtlar; `cli.ts selftest` koşar.
import { apply } from "./apply.js";
import { BOS, type Event, type State } from "./state.js";

export type Listener = (state: State) => void;

export class Store {
  #state: State = BOS;
  #history: Event[] = [];
  #listeners = new Set<Listener>();
  /**
   * Sürüm sayacı geçmişten bağımsız ilerler.
   *
   * Geri alma, geçmişi baştan oynatarak yapılıyor — en kısa doğru yol —
   * ama `apply`ın ürettiği `version` o zaman geriye düşer ve daha önce
   * kullanılmış bir değeri tekrar eder. Sürüme göre önbellekleyen abone
   * bayat veri gösterir. Sayaç bu yüzden ayrı tutuluyor.
   */
  #nextVersion = 1;

  getSnapshot(): State {
    return this.#state;
  }

  history(): readonly Event[] {
    return [...this.#history];
  }

  dispatch(event: Event): void {
    const next = apply(this.#state, event);
    this.#history.push(event);
    this.#commit(next);
  }

  undo(): boolean {
    if (this.#history.length === 0) return false;
    this.#history.pop();
    let replayed = BOS;
    for (const e of this.#history) replayed = apply(replayed, e);
    this.#commit(replayed);
    return true;
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Yeni durumu tekil sürümle yerine koyar ve haber verir. */
  #commit(next: State): void {
    // Yeni nesne: `apply` zaten taze diziler üretiyor, burada yalnızca
    // sürüm alanı değişiyor. Yerinde değişiklik olmadığı için daha önce
    // dışarı verilmiş anlık görüntüler dokunulmadan kalır.
    this.#state = { version: this.#nextVersion++, items: next.items };
    this.#notify();
  }

  #notify(): void {
    for (const l of [...this.#listeners]) l(this.#state);
  }
}
