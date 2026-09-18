# Görev: `Cache.invalidate()` ve `Cache.refresh()`

Çalışma dizininde çalışan bir asenkron önbellek var. `src/cache.ts`
içindeki `Cache` sınıfına iki yöntem ekle:

```ts
/** Anahtarı önbellekten düşürür. */
invalidate(key: string): void;

/** Değeri yeniden yükler ve yenisini döndürür. */
refresh(key: string): Promise<V>;
```

## `invalidate` davranışı

- Önbellekteki değer silinir; sonraki `get` yeniden yükler.
- **Uçuştaki yükleme iptal edilmez.** Onu bekleyenler değeri yine alır —
  ama o değer **önbelleğe yazılmaz**, çünkü geçersiz kılınmış bir anahtarın
  eski yüklemesi artık güncel değildir.
- Önbellekte olmayan bir anahtar için hiçbir şey yapmaz ve hata atmaz.

## `refresh` davranışı

- Yükleyiciyi **her zaman** çağırır: önbellekteki değeri kullanmaz ve
  yenilemeden ÖNCE başlamış bir yüklemeye takılmaz.
- Aynı anahtar için aynı anda çağrılan iki `refresh` **tek** yükleme koşar.
- `refresh` sürerken gelen `get`, o yenilemeye takılır — ikinci yükleme
  başlamaz.
- Başarılı olursa değer önbelleğe yazılır ve döndürülür. Yenilemeden önce
  başlamış daha eski bir yükleme sonradan bitse bile **onun sonucu
  yazılmaz**: taze olan kazanır.
- Yükleyici reddederse `refresh` reddeder, önbellekteki eski değer **olduğu
  gibi kalır**.

## Sürüm

`version(key)`, önbellekte bir şey değiştiğinde artar: değer yazıldığında
ve değer silindiğinde. Değişiklik yoksa artmaz. `src/view.ts` türetilmiş
görünümü buna göre önbelleklediği için bu kural onun doğru çalışma koşulu.

## Kısıtlar

- Mevcut kodun dayandığı sözleşmeleri bozma: `get`, `peek`, `keys`,
  `version`, `loads` ve uçuşta tekleme aynı şekilde çalışmaya devam etmeli.
- `src/lru.ts` ve `src/view.ts` dosyalarına dokunma.
- Bağımlılık ekleme; yalnızca standart kütüphane.
