# Görev: `Outbox.flush()`

Çalışma dizininde gönderilmeyi bekleyen mesajların kuyruğu var.
`src/outbox.ts` içindeki `Outbox` sınıfına gönderimi ekle:

```ts
/** Bekleyen mesajları gönderir; teslim edilenlerin sayısını döndürür. */
flush(denemeSayisi?: number): Promise<number>;
```

## Davranış

- Mesajlar **kuyruk sırasıyla** gönderilir.
- Bir gönderim başarısız olursa o mesaj için en fazla `denemeSayisi` kez
  denenir. Varsayılan 3.
- Teslim edilen mesaj kuyruktan çıkar.
- Denemeleri tükenen mesaj kuyrukta **kalır**; kuyruktaki sırası korunur.
- Başarısız bir mesaj, kendisinden sonrakilerin gönderilmesini engellemez.
- Dönen sayı, **bu çağrıda** teslim edilen mesaj sayısıdır.
- Kuyruk boşsa taşıyıcı hiç çağrılmaz ve `0` döner.

## Kısıtlar

- Mevcut kodun dayandığı sözleşmeleri bozma: `enqueue`, `pending` ve
  `bekleyenSayisi` aynı şekilde çalışmaya devam etmeli.
- `src/ids.ts` ve `src/sink.ts` dosyalarına dokunma.
- Bağımlılık ekleme; yalnızca standart kütüphane.
