/**
 * Kapasiteli, en-az-kullanılanı-düşüren küçük bir harita.
 *
 * Sözleşmeler:
 *  - `get` erişim sayılır: anahtarı en tazeye taşır.
 *  - `peek` erişim SAYILMAZ: tazeliği değiştirmeden okur.
 *  - `set` kapasiteyi aşarsa en bayat anahtarı düşürür ve adını döndürür.
 */
export class Lru<V> {
  readonly #max: number;
  readonly #map = new Map<string, V>();

  constructor(max: number) {
    if (max < 1) throw new RangeError("kapasite en az 1 olmalı");
    this.#max = max;
  }

  get size(): number {
    return this.#map.size;
  }

  /** Bayattan tazeye doğru anahtarlar. */
  keys(): string[] {
    return [...this.#map.keys()];
  }

  has(key: string): boolean {
    return this.#map.has(key);
  }

  peek(key: string): V | undefined {
    return this.#map.get(key);
  }

  get(key: string): V | undefined {
    if (!this.#map.has(key)) return undefined;
    const value = this.#map.get(key) as V;
    this.#map.delete(key);
    this.#map.set(key, value);
    return value;
  }

  /** Düşen anahtarın adı, düşen olmadıysa undefined. */
  set(key: string, value: V): string | undefined {
    this.#map.delete(key);
    this.#map.set(key, value);
    if (this.#map.size <= this.#max) return undefined;
    const bayat = this.#map.keys().next().value as string;
    this.#map.delete(bayat);
    return bayat;
  }

  delete(key: string): boolean {
    return this.#map.delete(key);
  }
}
