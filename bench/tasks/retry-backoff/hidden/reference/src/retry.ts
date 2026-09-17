// REFERANS ÇÖZÜM — `hidden/` altında, yani üretici bunu asla görmez.
// Kancaların karşılanabilir olduğunu kanıtlar; `cli.ts selftest` koşar.
export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  factor?: number;
  isRetryable?: (error: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

const bekle = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// `async`: imza `Promise<T>` taahhüt ediyor, bu yüzden RangeError de
// reddedilmiş bir promise olarak çıkmalı. Ölçülen koşuların çoğunda kusur
// tam olarak burada: senkron fırlatan bir `function retry`.
export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { attempts, baseDelayMs, maxDelayMs } = options;
  if (attempts < 1) throw new RangeError(`attempts en az 1 olmalı: ${attempts}`);
  const factor = options.factor ?? 2;
  const sleep = options.sleep ?? bekle;
  const isRetryable = options.isRetryable ?? (() => true);

  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      last = error;
      if (!isRetryable(error)) throw error;
      // Son başarısız denemeden sonra beklenmez: bekleyecek bir deneme yok.
      if (attempt === attempts) break;
      await sleep(Math.min(baseDelayMs * factor ** (attempt - 1), maxDelayMs));
    }
  }
  throw last;
}
