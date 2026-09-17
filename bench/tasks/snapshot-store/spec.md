# Görev: `Store.undo()`

Çalışma dizininde çalışan bir olay mağazası var. `src/store.ts` içindeki
`Store` sınıfına **geri alma** ekle.

```ts
/** Son uygulanan olayı geri alır. Geri alınacak bir şey yoksa false. */
undo(): boolean;
```

## Davranış

- Son uygulanan olay geri alınır; durum, o olay hiç uygulanmamış gibi olur.
- Geçmiş (`history()`) bir olay kısalır.
- Bir şey geri alındıysa `true`, geçmiş boşsa `false` döner.
- Bir şey geri alındığında aboneler **tam bir kez** haber alır.
- Geçmiş boşken `undo()` hiçbir şey yapmaz: abone çağrılmaz, durum değişmez.
- Geri alma sonrası `dispatch` normal çalışmaya devam eder.

## Kısıtlar

- Mevcut kodun dayandığı sözleşmeleri bozma. Bu dosyanın genel API'si
  (`getSnapshot`, `history`, `dispatch`, `subscribe`) ve onu kullanan
  diğer modüller aynı şekilde çalışmaya devam etmeli.
- `src/apply.ts` ve `src/state.ts` dosyalarına dokunma.
- Bağımlılık ekleme; yalnızca standart kütüphane.
