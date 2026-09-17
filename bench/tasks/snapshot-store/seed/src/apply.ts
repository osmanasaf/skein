import type { Event, Item, State } from "./state.js";

/**
 * Saf: girdiyi değiştirmez, her çağrıda yeni bir `State` döndürür ve
 * `version`ı bir artırır.
 *
 * Saflık dekoratif değil — `Store.getSnapshot()` sonuçları `version`a göre
 * önbelleğe alınıyor ve abone tarafı iki anlık görüntüyü kimlikle (`===`)
 * karşılaştırıyor. Yerinde bir değişiklik, daha önce dışarı verilmiş bir
 * anlık görüntüyü geçmişe dönük olarak bozar.
 */
export function apply(state: State, event: Event): State {
  switch (event.kind) {
    case "ekle": {
      const item: Item = { id: event.id, label: event.label, done: false };
      return { version: state.version + 1, items: [...state.items, item] };
    }
    case "bitir": {
      const items = state.items.map((i) => (i.id === event.id ? { ...i, done: true } : i));
      return { version: state.version + 1, items };
    }
    case "sil": {
      return { version: state.version + 1, items: state.items.filter((i) => i.id !== event.id) };
    }
  }
}
