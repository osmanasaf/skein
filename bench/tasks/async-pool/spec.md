# Görev: `runPool`

`src/pool.ts` dosyasına, eşzamanlılığı sınırlı bir görev havuzu yaz.

```ts
export declare function runPool<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]>;
```

## Davranış

- Her görev **tam bir kez** çağrılır.
- Sonuçlar **girdi sırasında** döner — bitiş sırasında değil.
- Aynı anda uçan görev sayısı hiçbir an `limit`i aşmaz.
- Görevler baştan hepsi birden başlatılmaz; bir slot boşaldıkça sıradaki
  görev başlar.
- Bir görev başarısız olursa `runPool` o hatayla reddeder.
- Bir görev başarısız olduktan sonra **yeni görev başlatılmaz**.
- Reddetmeden önce, o an **uçmakta olan** görevlerin bitmesi beklenir:
  `runPool` reddettiğinde arkada devam eden iş kalmamalıdır.
- `limit < 1` ise `RangeError` ile başarısız olunur.

## Kısıtlar

- Bağımlılık ekleme; yalnızca standart kütüphane.
- Dosyayı `export` edilebilir bir ES modülü olarak yaz.
