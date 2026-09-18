# Bulgu sınıflama

Aşağıda bir görev tanımı, incelenen kodun tamamı, kanıtlanmış kusurların
listesi ve bir kod inceleme raporu var.

İşin: **raporun ileri sürdüğü her ayrı bulguyu bulmak ve sınıflamak.**

Raporun iyi olup olmadığına karar vermiyorsun, bir puan da vermiyorsun.
Bulgu bulgu sınıflıyorsun.

## Bulgu nedir

Bulgu, raporun kod hakkında ileri sürdüğü **tek bir iddia**: şu davranış
yanlış, şu durum ele alınmamış, şu isim yanıltıcı. Aynı iddianın iki kez
söylenmesi bir bulgudur. İki ayrı iddianın tek cümlede söylenmesi iki
bulgudur.

Bulgu **değildir**: özet cümleleri ("kod genel olarak temiz"), övgü, plan
("önce testlere bakalım"), ve raporun kendi yapısı hakkında cümleler.

## Sınıflar

Her bulgu tam olarak birine girer:

- **`gercek`** — İddia doğru **ve** davranışı, doğruluğu, güvenliği ya da
  bakımı gerçekten etkiliyor. Kodda karşılığını görebiliyorsun.
- **`nit`** — İddia doğru ama önemsiz: biçim, adlandırma, üslup, tercih
  meselesi. Düzeltilmese de kod aynı şeyi yapar.
- **`yanlis`** — İddianın kodda karşılığı yok: kod öyle davranmıyor, ya da
  iddia edilen eksik zaten yapılmış.
- **`belirsiz`** — Karar veremiyorsan. Bunu kullanmaktan çekinme; emin
  olmadığın bulguyu `gercek` ya da `yanlis` yazmak, sayıyı bozar.

## Kanıtlanmış kusurlar ayrı tutulur

Sana verilen "kanıtlanmış kusurlar" listesi, kodu çalıştırarak kırmızıya
düşmüş testlerden geliyor. Bir bulgu bu kusurlardan birini tarif ediyorsa
`kanitli: true` yaz — sınıfını yine de doldur, ama bu bulgular ayrı
sayılacak. Liste boş olabilir; o zaman hiçbiri `kanitli` değildir.

## Kanıt zorunlu

Her bulgu için rapordan **birebir** bir alıntı ver. Kopyala; özetleme,
düzeltme, kısaltma yapma. Alıntı raporda aynen bulunamazsa o bulgu
sayılmaz — yani uydurulmuş bulgu sessizce geçmez.

## Çıktı

Yalnızca JSON dizisi yaz, başka hiçbir şey yazma:

```json
[
  {"no": 1, "sinif": "gercek", "kanitli": false, "alinti": "rapordan birebir cümle", "gerekce": "tek cümle"},
  {"no": 2, "sinif": "nit", "kanitli": false, "alinti": "…", "gerekce": "…"}
]
```

Rapor hiçbir bulgu ileri sürmüyorsa boş dizi yaz: `[]`
