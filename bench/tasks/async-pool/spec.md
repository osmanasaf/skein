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
- Bir görev başarısız olursa `runPool` o hatayla reddeder ve kalan
  görevler çalıştırılmaz.
- `runPool` yerleştiğinde (çözülsün ya da reddetsin) arkada devam eden
  iş kalmaz.
- `limit < 1` ise `RangeError` ile başarısız olunur.

## Kısıtlar

- Bağımlılık ekleme; yalnızca standart kütüphane.
- Dosyayı `export` edilebilir bir ES modülü olarak yaz.
