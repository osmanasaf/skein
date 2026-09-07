# Görev: `retry`

`src/retry.ts` dosyasına, üstel geri çekilmeli bir yeniden deneme yardımcısı yaz.

```ts
export interface RetryOptions {
  /** Toplam deneme sayısı, ilk deneme dahil. En az 1. */
  attempts: number;
  /** İlk bekleme süresi (ms). */
  baseDelayMs: number;
  /** Bekleme süresi üst sınırı (ms). */
  maxDelayMs: number;
  /** Her turda beklemenin çarpanı. Varsayılan 2. */
  factor?: number;
  /** Hangi hatanın yeniden denenebilir olduğu. Varsayılan: hepsi. */
  isRetryable?: (error: unknown) => boolean;
  /** Beklemeyi gerçekleştiren fonksiyon. Test için enjekte edilir. Varsayılan: setTimeout tabanlı. */
  sleep?: (ms: number) => Promise<void>;
}

export declare function retry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T>;
```

## Davranış

- `fn` başarılı olursa sonucu döndür.
- `fn` hata fırlatırsa, deneme hakkı kaldıysa bekle ve tekrar dene.
- `fn`'e verilen `attempt` **1'den başlar**.
- Bekleme süresi: `baseDelayMs * factor^(deneme-1)`, `maxDelayMs` ile sınırlı.
- `isRetryable` false derse yeniden deneme yapma; hatayı olduğu gibi fırlat.
- Deneme hakkı bittiğinde **son** hatayı fırlat.
- `attempts < 1` ise `RangeError` fırlat.

## Kısıtlar

- Bağımlılık ekleme; yalnızca standart kütüphane.
- Dosyayı `export` edilebilir bir ES modülü olarak yaz.
