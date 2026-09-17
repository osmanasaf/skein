// REFERANS ÇÖZÜM — `hidden/` altında, yani üretici bunu asla görmez.
// Kancaların karşılanabilir olduğunu kanıtlar; `cli.ts selftest` koşar.
export interface TokenBucketOptions {
  capacity: number;
  refillPerSecond: number;
  now: () => number;
}

export class TokenBucket {
  readonly #capacity: number;
  readonly #refillPerSecond: number;
  readonly #now: () => number;
  #tokens: number;
  #last: number;

  constructor(options: TokenBucketOptions) {
    this.#capacity = options.capacity;
    this.#refillPerSecond = options.refillPerSecond;
    this.#now = options.now;
    this.#tokens = options.capacity;
    this.#last = options.now();
  }

  /**
   * Geçen zamanı token'a çevirir ve saati ilerletir.
   *
   * Kesir kaybı burada olurdu: `#last`ı `now`a taşıyıp kesirli artışı
   * yuvarlasaydık, art arda kısa çağrılar tek uzun bekleyişten az token
   * üretirdi. Kesir `#tokens` içinde saklanıyor, bu yüzden kaybolmaz.
   */
  #refill(): void {
    const now = this.#now();
    // Saat geri giderse token eksilmez; yalnızca referans anı güncellenir.
    if (now <= this.#last) {
      this.#last = now;
      return;
    }
    this.#tokens = Math.min(this.#capacity, this.#tokens + ((now - this.#last) / 1000) * this.#refillPerSecond);
    this.#last = now;
  }

  tryRemove(count = 1): boolean {
    if (typeof count !== "number" || Number.isNaN(count) || count < 0) {
      throw new RangeError(`count negatif olamaz ve sayı olmalı: ${String(count)}`);
    }
    this.#refill();
    if (count > this.#tokens) return false;
    this.#tokens -= count;
    return true;
  }

  available(): number {
    this.#refill();
    return this.#tokens;
  }
}
