import { Lru } from "./lru.js";

export type Loader<V> = (key: string) => Promise<V>;

/**
 * REFERANS ÇÖZÜM — yalnızca kancaların karşılanabilir olduğunu kanıtlar.
 *
 * İki fikir taşıyor:
 *
 * 1. **Çağ.** Her anahtarın bir çağı var; geçersiz kılma ve yenileme onu
 *    ilerletir. Yükleme başlarken kendi çağını yakalar ve sonucu ancak çağ
 *    hâlâ aynıysa yazar — bayat yükleme taze değerin üstüne yazamaz.
 * 2. **Kimlikle temizlik.** Uçuş kaydı, KENDİ sözü hâlâ oradaysa silinir.
 *    Koşulsuz silinseydi yeni yüklemenin kaydını eski yükleme süpürür;
 *    çağa bakılsaydı bayat kayıt hiç silinmez ve sonraki `get` ona takılıp
 *    sonsuza kadar bayat kalırdı.
 */
export class Cache<V> {
  readonly #loader: Loader<V>;
  readonly #lru: Lru<V>;
  readonly #inflight = new Map<string, Promise<V>>();
  readonly #refreshes = new Map<string, Promise<V>>();
  readonly #versions = new Map<string, number>();
  readonly #epochs = new Map<string, number>();
  #loads = 0;

  constructor(loader: Loader<V>, capacity = 16) {
    this.#loader = loader;
    this.#lru = new Lru<V>(capacity);
  }

  get loads(): number {
    return this.#loads;
  }

  version(key: string): number {
    return this.#versions.get(key) ?? 0;
  }

  peek(key: string): V | undefined {
    return this.#lru.peek(key);
  }

  keys(): string[] {
    return this.#lru.keys();
  }

  async get(key: string): Promise<V> {
    const cached = this.#lru.get(key);
    if (cached !== undefined) return cached;

    const ucusta = this.#inflight.get(key);
    if (ucusta !== undefined) return ucusta;

    return this.#start(key);
  }

  invalidate(key: string): void {
    // Çağ her hâlükârda ilerler: önbellekte değer olmasa bile uçuştaki
    // yükleme yazma hakkını kaybetmeli.
    this.#epochs.set(key, this.#epoch(key) + 1);
    if (this.#lru.delete(key)) this.#bump(key);
  }

  async refresh(key: string): Promise<V> {
    // Süren bir YENİLEMEYE takılırız; süren bir `get` yüklemesine takılmayız,
    // çünkü o yenilemeden önce başlamıştır ve bayattır.
    const suren = this.#refreshes.get(key);
    if (suren !== undefined) return suren;

    this.#epochs.set(key, this.#epoch(key) + 1);
    const promise = this.#start(key);
    this.#refreshes.set(key, promise);
    const temizle = (): void => {
      if (this.#refreshes.get(key) === promise) this.#refreshes.delete(key);
    };
    promise.then(temizle, temizle);
    return promise;
  }

  #start(key: string): Promise<V> {
    this.#loads += 1;
    const epoch = this.#epoch(key);
    const promise = (async () => {
      const value = await this.#loader(key);
      if (this.#epoch(key) === epoch) this.#write(key, value);
      return value;
    })();
    this.#inflight.set(key, promise);
    const temizle = (): void => {
      if (this.#inflight.get(key) === promise) this.#inflight.delete(key);
    };
    promise.then(temizle, temizle);
    return promise;
  }

  #epoch(key: string): number {
    return this.#epochs.get(key) ?? 0;
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
