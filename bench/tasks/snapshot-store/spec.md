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

## Korunması gereken değişmezler

Bunlar mevcut kodun dayandığı sözleşmelerdir; `undo` sonrası da geçerli
olmalıdır.

- **`version` asla geri gitmez ve asla tekrar etmez.** Durumun her yeni
  hâli, daha önce kullanılmamış ve bir öncekinden büyük bir `version`
  taşır. Aboneler iki bildirimi bu sayıyla ayırt ediyor.
- **Dışarı verilmiş bir anlık görüntü geçmişe dönük değişmez.**
  `getSnapshot()` ile alınmış bir `State`, sonraki bir `dispatch` ya da
  `undo` sonrasında da ilk alındığı andaki değeri taşır — içindeki
  `items` dizisi dahil.
- **`apply` saftır.** Girdisini değiştirmez. Bu dosyaya dokunma.

## Kısıtlar

- Bağımlılık ekleme; yalnızca standart kütüphane.
- Mevcut genel API (`getSnapshot`, `history`, `dispatch`, `subscribe`)
  davranışını koru.
