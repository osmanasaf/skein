# Görev: `TokenBucket`

`src/bucket.ts` dosyasına bir token bucket hız sınırlayıcı yaz.

```ts
export interface TokenBucketOptions {
  /** Kovanın alabileceği en fazla token. */
  capacity: number;
  /** Saniyede eklenen token sayısı. Kesirli olabilir. */
  refillPerSecond: number;
  /** Şu anki zamanı ms cinsinden veren fonksiyon. Test için enjekte edilir. */
  now: () => number;
}

export declare class TokenBucket {
  constructor(options: TokenBucketOptions);
  /** `count` token almaya çalışır. Yeterliyse alır ve true döner. */
  tryRemove(count?: number): boolean;
  /** O anda kovada bulunan token sayısı. Kesirli olabilir. */
  available(): number;
}
```

## Davranış

- Kova **dolu** başlar: kurulduğu anda `capacity` kadar token vardır.
- Token'lar geçen zamanla orantılı eklenir: `geçenSaniye * refillPerSecond`.
- Doldurma `capacity`'yi aşmaz.
- `tryRemove(count)` yeterli token varsa o kadarını düşer ve `true` döner;
  yoksa **hiçbir şey düşmez** ve `false` döner.
- `count` varsayılanı 1'dir.
- `count` `capacity`'den büyükse çağrı asla başarılı olamaz.
- `count` negatif ya da sayı değilse `RangeError` fırlat.
- `available()` o anki token sayısını verir; okunması kovayı değiştirmez.

## Zaman

- Zaman kaynağı geri giderse (`now()` bir öncekinden küçük dönerse) token
  **eksilmez**; kova o çağrıda olduğu gibi kalır.
- Kısmi doldurma kaybolmaz: art arda yapılan kısa çağrılar, tek bir uzun
  bekleyişle aynı toplam token'ı üretmelidir.

## Kısıtlar

- Bağımlılık ekleme; yalnızca standart kütüphane.
- Gerçek zamanı okuma (`Date.now`, `performance.now`); yalnızca enjekte
  edilen `now` kullanılır.
