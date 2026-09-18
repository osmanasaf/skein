# Görev: `applyPatch()`

Çalışma dizininde bir ayar ağacı ve onu çizen bir ekran var.
`src/patch.ts` içine yama uygulayan işlevi ekle:

```ts
/** Yamayı ağaca uygular ve yeni ağacı döndürür. */
export function applyPatch(agac: Dugum, yama: Yama): Dugum;
```

## Yama kuralları

- Yamadaki **yaprak** (metin, sayı, mantıksal) o anahtarın değerini yazar.
- Yamadaki **dizi** o anahtarın değerinin yerine bütünüyle geçer; eleman
  eleman birleştirme yok.
- Yamadaki **nesne** derine iner ve iç içe birleşir. Ağaçtaki karşılığı
  nesne değilse (ya da yoksa), nesne olarak yazılır.
- Yamadaki **`null`** o anahtarı siler. Anahtar zaten yoksa hiçbir şey
  olmaz.

## Kimlik kuralı — bu görevin asıl konusu

Ağaç yerinde değiştirilmez; ama **değişmeyen alt ağaç kimliğini korur**:

- Bir dalda hiçbir şey değişmediyse, sonuçta o dal **aynı nesnedir**
  (`===`).
- Hiçbir yerde değişiklik yoksa, dönen ağaç **kökün kendisidir**.
- "Değişiklik yok" demek: yazılan değer zaten oradaki değerdir. Yapraklar
  `===` ile, diziler eleman eleman `===` ile karşılaştırılır (`src/patch.ts`
  içindeki `ayniDeger` bunu yapıyor). Silinen anahtar zaten yoksa da
  değişiklik yoktur.

`src/render.ts` çizimi düğüm kimliğine göre önbelleklediği için, gereksiz
yere yeniden kurulan bir dal ekranı gereksiz yere yeniden çizdirir.

## Kısıtlar

- Girdi ağacı ve yama **hiçbir şekilde değiştirilmez**.
- Mevcut `mergeDefaults` aynı şekilde çalışmaya devam etmeli.
- `src/tree.ts` ve `src/render.ts` dosyalarına dokunma.
- Bağımlılık ekleme; yalnızca standart kütüphane.
