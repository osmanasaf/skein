import { Lru } from "./lru.js";

export type Loader<V> = (key: string) => Promise<V>;

/**
 * Yükleyicinin önüne konan asenkron önbellek.
 *
 * Değişmezler:
 *  - **Uçuşta tekleme.** Aynı anahtar için aynı anda yalnızca bir yükleme
 *    koşar; ikinci `get` başlamış yüklemeye takılır.
 *  - **Sürüm monoton.** Önbellekte bir şey değiştiğinde (değer yazıldı ya
 *    da silindi) o anahtarın `version`ı artar. `view.ts` buna göre
 *    önbellekliyor; artmazsa ekran bayat kalır.
 *  - **Hata önbelleğe yazılmaz.** Yükleme reddederse bekleyenlerin hepsi
 *    reddi görür, önbellekte iz kalmaz, sonraki `get` yeniden dener.
 */
export class Cache<V> {
  readonly #loader: Loader<V>;
  readonly #lru: Lru<V>;
  readonly #inflight = new Map<string, Promise<V>>();
  readonly #versions = new Map<string, number>();
  #loads = 0;

  constructor(loader: Loader<V>, capacity = 16) {
    this.#loader = loader;
    this.#lru = new Lru<V>(capacity);
  }

  /** Yükleyicinin kaç kez çağrıldığı. Teklemenin kanıtı bu sayı. */
  get loads(): number {
    return this.#loads;
  }

  /** Anahtarın sürümü; hiç yazılmadıysa 0. */
  version(key: string): number {
    return this.#versions.get(key) ?? 0;
  }

  /** Önbellekteki değer — yükleme başlatmaz, tazeliği de değiştirmez. */
  peek(key: string): V | undefined {
    return this.#lru.peek(key);
  }

  /** Önbellekteki anahtarlar, bayattan tazeye. */
  keys(): string[] {
    return this.#lru.keys();
  }

  async get(key: string): Promise<V> {
    const cached = this.#lru.get(key);
    if (cached !== undefined) return cached;

    const ucusta = this.#inflight.get(key);
    if (ucusta !== undefined) return ucusta;

    const promise = this.#load(key);
    this.#inflight.set(key, promise);
    return promise;
  }

  async #load(key: string): Promise<V> {
    this.#loads += 1;
    try {
      const value = await this.#loader(key);
      this.#write(key, value);
      return value;
    } finally {
      this.#inflight.delete(key);
    }
  }

  #write(key: string, value: V): void {
    const dusen = this.#lru.set(key, value);
    this.#bump(key);
    if (dusen !== undefined) this.#bump(dusen);
  }

  #bump(key: string): void {
    this.#versions.set(key, this.version(key) + 1);
  }
}
