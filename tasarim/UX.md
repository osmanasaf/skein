# UX listesi — bir gecelik koşudan çıkan gözlemler

Bu liste tahmin değil. 5–6 Kasım gecesi on kartlık bir koşuyu baştan
sona izlerken **yaşanan** şeylerden çıktı: dört konteyner ölümü, iki
zaman aşımı, yedi denetçi bulgusu, 893M token. Her madde neyin
gözlemlendiğini ve kanıtını söylüyor.

Sıralama operatöre verdiği zarara göre: önce yanlış bilgi verenler,
sonra yapılamayanlar, sonra cila.

---

## 1. Ekran yanlış bilgi veriyor

### 1.1 Sahte tıkanıklık uyarısı — EN ÖNCELİKLİ

Pano'nun en büyük, en kırmızı öğesi şunu diyordu:

> **8 kart kuyrukta ALINAMIYOR**

Aynı anda ölçülen gerçek: kuyruk **boş** (coder 0, reviewer 0, aktif 0),
ağaç **temiz**, son `KIRLI` olayı **altı saat önce**. Ekran geçmiş
engelleri şimdiki durum diye gösteriyor.

Bu, projenin kusur listesinin aynadaki hâli: her zaman "bildiğinden
azını söyleyen yol" ararız, bu sefer **bildiğinden fazlasını** söylüyor.
Bedeli daha sinsi: operatöre uyarıları ciddiye almamayı öğretir.

**Yapılacak:** engel kayıtları zamana bağlanmalı. Bir engel ancak o
kart hâlâ kuyruktaysa VE engel son başarılı turdan sonraysa gösterilir.

### 1.2 `≥` işareti açıklamasız

Üst çubukta `toplam maliyet ≥$276.65` yazıyor. Bu işaret bir koşuda
176M token'ın $0 görünmesini engelleyen düzeltmenin ürünü, ama ekranda
hiçbir yerde "en az bu kadar, bazı turların doları bildirilmedi"
demiyor. Bilmeyen bir okuyucu için `≥` gürültü.

**Yapılacak:** işarete dokunulduğunda/üzerine gelindiğinde kaç turun
ölçülmediğini söyleyen kısa bir açıklama.

### 1.3 Ekran dinlenme hâlinde kendini açıklamıyor

Operatör taze bir klonda `npm start` dedi ve "animasyonlar çalışmıyor,
tasarımı beğenmedim" dedi. Ölçüldü: animasyon **doğru** çalışıyor.
Koşul `rolKartlari.some(c => c.state === "active") && daemon?.alive` —
çalışan kart VE canlı gözcü, ikisi birden. Taze klonda ikisi de yok,
dolayısıyla hiçbir şey kıpırdamıyor. Dört tarayıcı sınaması bunu
kanıtlıyor (koşul sağlanınca çırpıyor, gözcü kapalıyken çırpmıyor,
reduced-motion'da çırpmıyor).

Ama şikâyet yine de haklı: **çalışmayan bir ekranla bozuk bir ekran
birbirinden ayırt edilemiyor.** Ekran "şu an koşan bir şey yok, gözcüyü
başlatırsan buradaki kuşlar kanat çırpar" demiyor.

**Yapılacak:** boş durumda ekranın kendini anlatması. Formasyon
alanında "gözcü kapalı — başlatmak için üst çubuktaki çipe bas" gibi
bir yönlendirme; kuşların yanında neyin ne zaman canlanacağını söyleyen
bir satır.

### 1.4 Üst çubukta koşan ajan göstergesi YOK

Operatörün doğrudan isteği: "başlatınca hangi agent çalışıyor görmeliyim
önyüzden."

Envanter:
- **Var:** kartın üzerinde canlı adım satırı (araç adı, yol, `adım N`),
  `.card.live` accent kenarı, Ajanlar sekmesinde rol başına durum,
  formasyonda kuş rengi ve kanat çırpma.
- **Yok:** üst çubukta hiçbir şey. Orada yalnızca `açık`, `bitti`,
  `toplam maliyet` var.

Yani bilgi ekranda var ama **bir bakışta** yok: Pano'da aktif kartı
bulman ya da Ajanlar sekmesine geçmen gerekiyor. Üst çubuk her sekmede
görünen tek yer; koşan ajan oraya ait.

**Yapılacak:** gözcü çipinin yanına "coder · Bash · adım 143" gibi tek
satırlık canlı gösterge. Tıklayınca o ajanın Ajanlar sekmesini açar.
Hiçbir şey koşmuyorsa "boşta" der — 1.3'ün yarısını da çözer.

---

---

## 2. Operatörün yapamadıkları

### 2.1 Ölü turun kirli ağacı her şeyi donduruyor — KÖK SEBEP

Gecenin en pahalı tek sorunu. Bir tur ölünce (konteyner yeniden başladı,
ajan kesildi) ağaçta işlenmemiş dosyalar kalıyor. Tur başındaki temiz
ağaç denetimi — doğru bir denetim — sonraki her turu reddediyor.
Sonuç: **kuyruk tamamen donuyor ve bunu insan temizleyene kadar hiçbir
şey ilerlemiyor.**

Ölçülen: olay günlüğünde **3155** adet `queue.blocked`/`KIRLI` kaydı.
Aynı engel, dakikada bir, saatlerce.

Not: kapılar kuyruğu tıkamıyor — `retReduction` kartı günlerdir kapıda
ve bu sürede 74 kart devredildi. Tıkayan şey yalnızca kirli ağaç.

**Yapılacak, üç parça:**
- **Kurtarma yolu:** tur ölünce ağacı ölç. `tsc` + takım yeşilse
  kurtarma commit'i at ve kartı kuyruğa ver. Kırmızıysa diff'i sakla,
  ağacı temizle, kartı kuyruğa ver, **insana bildir**. Bu gece bu
  yordamı elle uyguladım; kart 3'te bir saatlik yeniden koşuyu 9
  dakikaya indirdi, kart 5'te kırmızı işi dala sokmaktan kurtardı.
- **Aynı engeli bir kez yaz.** 3155 kayıt bir bilgi değil, gürültü.
- **Tekrarlayan engeli yükselt.** Aynı engel üst üste N kez görülüyorsa
  bu artık "bekle" değil, "insan lazım" demektir.

### 2.2 Zaman aşımı işi çöpe atıyor

Kart kesildiğinde yapılan tek şey kapıya düşürmek. Ağaçtaki iş — kart
3'te 1187 satır, derlenen ve 1285 sınaması geçen iş — kendiliğinden
kurtarılmıyor. O turun bedeli **187 milyon girdi token'ıydı**.

**Yapılacak:** 2.1'deki kurtarma yolu bunu da kapsar. Ek olarak kapı
kartında "bu turda şu kadar iş kaldı, ölçümü şu" bilgisi görünmeli.

### 2.3 Kuyruk sırası değiştirilemiyor

Koşu sırasında bir kartı öne almak istedim, yolu yok. `kapat` komutu
da haklı olarak reddetti ("yalnızca akışta karşılığı kalmamış
kartlar"). Operatör sırayı ancak kart silip yeniden açarak değiştirebiliyor.

**Yapılacak:** kartı kuyrukta yukarı/aşağı taşıma, ya da bir öncelik
alanı. Pano'daki kart kareleri zaten sırayı gösteriyor; sürükleme
doğal yer.

### 2.4 Gözcünün ölümü sessiz

Konteyner bu gece **dört kez** yeniden başladı (20:25, 21:17, 21:45,
00:05) ve her seferinde gözcüyü yanında götürdü. Ekran bunu "bayat
kilit" olarak doğru gösteriyor — ama ekrana bakan yoksa kimse
bilmiyor. İlk ölümde koşu **36 dakika** sessizce durdu.

**Yapılacak:** bayat kilit saptandığında işletim sistemi bildirimi.
Ekran açıksa `Notification` API'si yeter; kapalıysa gözcünün kendisi
ölemeyeceği için bu zaten ekranın işi.

### 2.5 Ekran uzaktan görülemiyor

Ekran `127.0.0.1`'e bağlı ve bu kasıtlı — yazma uçları var. Ama
orkestratör bir bulut konteynerinde koşuyorsa operatör ekranı hiç
göremiyor. Bu gece bunu sekiz saat boyunca ekran görüntüsü göndererek
çözdüm; sürdürülebilir değil.

**Yapılacak:** `--host` ile tek bir adı eklemek zaten mümkün ve en dar
ödün. Belgelenmeli: "uzak kullanımda `--host <ad>` ver, `0.0.0.0`
verme". Jeton + `x-skein-token` + `Origin` kapısı o durumda da
çalışıyor.

---

## 3. Cila

### 3.1 Lejant sıkışık

Pano'nun altındaki lejant şöyle çıkıyor:

```
çalışıyor□kapıda■kuyrukta—ret yoluokundu 08:32:35
```

Öğeler birbirine girmiş; "ret yolu" ile "okundu" bitişik. Aralık yok.

### 3.2 Gövde zemini eski palette kalmış

Ölçülen: `body` arka planı `rgb(231, 236, 242)` — mavimsi, eski
"gökyüzü" paletinden. Modernist zemin `#f3f2f2` (nötr gri). Üst çubuk
ve paneller Modernist'e geçmiş, gövde geçmemiş. İki palet aynı ekranda.

### 3.3 V formasyonu az rolde boş duruyor

Koordinat kutusu sabit 1000×640. İki rollü bir akışta ikisi de üst
köşelerde duruyor ve ekranın yarısı boş bir V çiziyor. Tasarım çok
rollü akışlar düşünülerek yapılmış; az rolde oran bozuluyor.

**Yapılacak:** rol sayısına göre kutu yüksekliğini kısmak, ya da iki
rolde V yerine düz çizgi.

---

## 4. Sıraya girmesi önerilenler

| # | iş | niye |
|---|---|---|
| 1 | 2.1 kurtarma yolu + engel gürültüsü | gecenin en pahalı sorunu |
| 2 | 1.1 sahte tıkanıklık uyarısı | ekranın en görünür yeri yalan söylüyor |
| 3 | 1.4 üst çubukta koşan ajan göstergesi | operatörün doğrudan isteği |
| 4 | 1.3 boş durumda ekranın kendini anlatması | "çalışmıyor" sanılıyor |
| 5 | 2.4 bayat kilit bildirimi | 36 dakika sessiz durma |
| 4 | 3.2 gövde zemini | iki palet bir arada, tek satırlık iş |
| 5 | 2.3 kuyruk sırası | operatörün elini bağlıyor |
| 6 | 3.1 lejant aralıkları | tek satırlık iş |
| 7 | 2.5 uzaktan erişim belgelemesi | kod değil, belge |
| 8 | 1.2 `≥` açıklaması | küçük ama maliyet okunurluğu |
| 9 | 3.3 V formasyonu oranı | en az acil |
