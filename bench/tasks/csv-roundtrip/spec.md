# Görev: `parse` ve `serialize`

`src/csv.ts` dosyasına bir CSV okuyucu ve yazıcı yaz.

```ts
export declare function parse(text: string): string[][];
export declare function serialize(rows: readonly (readonly string[])[]): string;
```

## Biçim — `parse` neyi okur

- Alanlar virgülle, satırlar satır sonuyla ayrılır. Hem `\n` hem `\r\n`
  satır ayracı sayılır.
- Bir alan çift tırnakla başlıyorsa tırnaklıdır. Tırnaklı alanın içinde
  virgül ve satır sonu düz karakterdir, ayraç değildir.
- Tırnaklı alanın içinde iki ardışık çift tırnak (`""`) tek bir çift
  tırnak karakteri demektir; alanı sonlandıran tırnak tek olandır.
- Alanlar kırpılmaz: yazılan boşluk okunan boşluktur.
- `parse` her zaman en az bir satır döndürür.

## Değişmez — tek ölçüt bu

`rows`, en az bir satırdan oluşan ve her satırı en az bir alan içeren
herhangi bir dize matrisi olmak üzere:

```
parse(serialize(rows))   derinlemesine eşittir   rows
```

Bu **her** `rows` için geçerli olmalıdır. Alanların içinde ne olduğunun
bir önemi yok: virgül, tırnak, satır sonu, boşluk, boş dize — hepsi
kendisi olarak geri gelmeli.

`serialize`'ın hangi alanı tırnaklayacağına ve neyi nasıl kaçıracağına
sen karar ver; ölçüt yukarıdaki eşitliktir.

## Kısıtlar

- Bağımlılık ekleme; yalnızca standart kütüphane.
- Dosyayı `export` edilebilir bir ES modülü olarak yaz.
