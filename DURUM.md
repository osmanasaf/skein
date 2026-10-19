# Skein — durum raporu (19 Ekim 2026)

Bu belge "proje ne durumda ve kullanılabilir mi" sorusunu cevaplıyor.
Kronolojik kayıt `HANDOFF.md`'de, ölçüm tasarımı `bench/DESIGN.md`'de.

---

## Tek paragraf

Orkestratör **çalışıyor ve iki platformda sınanmış** (765 test, Linux +
Windows). Ölçüm takımı da çalışıyor ve bugüne kadar **üç kez kendi
kusurunu buldurdu**. Projenin kurucu tezi — *farklı satıcıların modelleri
birbirini denetlediğinde tek modelin kaçırdığı kusur yakalanır* — hâlâ
kanıtlanmadı, ama artık "ölçülmedi" demiyoruz: **ölçüldü ve ölçüm, elimizdeki
görev setiyle bu sorunun cevaplanamayacağını söyledi.** Sebebi aşağıda ve
projenin en kayda değer bulgusu o.

---

## 1. Ne inşa edildi (ve doğrulandı)

| katman | durum |
|---|---|
| Kart kuyruğu, worktree, git ile taşıma, ret/kapı | ✅ |
| Akış dili — 22 doğrulama kuralı, topoloji hash'i donuyor | ✅ |
| `--serve` gözcü, okuyucu ekran, kapı ve akış ekrandan | ✅ |
| Ölçüm: 8 görevli set, gizli kancalar, körlenmiş hakem, karar kuralı | ✅ |
| Adım 6 bütünüyle (plan belgesi, itiraz turu, çok tur, körleme, A/B) | ✅ canlı doğrulandı |
| Çapraz satıcı: codex adaptörü uçtan uca | ✅ |
| Ölçüm gücü ön kontrolleri (`kalibre`, `kalibre2x2`) | ✅ |

765 test yeşil, typecheck temiz, Linux ve Windows'ta koşuyor.
~13.9k satır ürün + ~10.2k satır test.

## 2. Ne ölçüldü — ve her ölçüm ne dedi

**(a) Planlama turu ürünü daha doğru yapıyor mu? → OLUMSUZ**

Üç kampanya, iki görev × k=3. Son kampanya iki görevde de **%0 azalma**
verdi ve karar kuralı ilk kez net konuştu: planlama turu ürünü daha doğru
yapmıyor, bedeli ~2.2 kat aktivasyon. Ama sebep "planlama işe yaramıyor"
değil: mekanizma sustu — 6 planlı koşuda 4'ü hiç itiraz yazmadı, yazılan
4 itiraz kanıtta dosya yolu vermediği için elendi.

**(b) Çapraz satıcı denetimi değer katıyor mu? → YETERSİZ (ölçülemedi)**

İlk çapraz satıcı 2x2'si koştu (claude-sonnet-5 × gpt-5.5). Aynı-satıcı
hücreler 4/4 yakaladı, çapraz hücreler 2/4. Karar kuralı sayıyı okumayı
reddetti ve gerekçesini kendisi yazdı:

> Aynı-model hücrelerinde hiç kaçırma yok; göreli azalma tanımsız.
> Denetçilerin kaçırdığı bir kusur olmadan çeşitlilik etkisi ölçülemez.

**(c) Ve asıl bulgu: ÜÇ HÜCREDE ÜÇ KEZ, aynı-satıcı denetim HİÇBİR ŞEY
kaçırmadı**

Ölçüm gücü için iki koşul gerekiyor: üretici kusur üretmeli **ve**
aynı-satıcı denetim o kusuru kaçırmalı. İkinci koşul üç kez sınandı:

| hücre | kusur üretildi mi | aynı-satıcı denetim |
|---|---|---|
| `snapshot-store` × sonnet-5 | ✅ 2 kanca | **2/2 yakaladı** |
| `snapshot-store` × gpt-5.5 | ✅ 2 kanca | **2/2 yakaladı** |
| `csv-roundtrip` × haiku-4.5 | ✅ 1 kanca | **1/1 yakaladı** |
| `async-pool` × haiku-4.5 | ✗ temiz çıktı | — |
| `config-patch` × sonnet-5 | ✗ temiz çıktı | — |

Üç için üç. Bu, teze karşı bir kanıt **değil**; görev seti hakkında bir
kanıt: **bu görevlerin ürettiği kusurların hepsi "okuyunca görülebilir"
sınıfından.** Tez tam olarak öteki sınıfta yaşıyor — bir modelin YAZDIĞI
ama başka bir modelin okuyarak göremediği kusurlar.

Yani ölçülmesi gereken boşluk şu: **"kusuru üretmek" ile "kusuru görmemek"
arasındaki mesafe.** Elimizdeki sekiz görev o mesafeyi içermiyor.

## 3. Kullanılabilir mi?

**Evet, ama amaçlanan şey için değil.**

### Bugün kullanılabilir

Tek satıcılı denetim zinciri: akışı tanımla, `watch --serve` koştur,
ekrandan izle, kapıları aç. Canlı koşularda çalıştı, iki platformda sınandı.
Pratik şartlar: operatörün ağacı temiz olmalı, ajanlar senin dalına commit
atıyor, ve rol promptları ekrandan düzenlenemiyor (bilerek bekliyor).

### Bugün kullanılmaması gereken

**Planlama/itiraz turu.** Ölçüm olumsuz: 2.2 kat bedel, gösterilebilir
kazanç yok. Mekanizma açık ama ürüne değmiyor.

### Sayılmaması gereken

**Çapraz satıcı denetimi.** İki satıcı aynı akışta bir kez koştu ve ölçüm
"bu hücrede cevaplanamaz" dedi. Bugün bir tasarım, bir sonuç değil.

### En kullanışlı parça, amaçlanan parça değil

Projenin en sağlam ürünü **ölçüm takımının kendisi**: iki katmanlı yer
gerçeği (harmanlanmayan), önceden ilan edilmiş karar kuralı, körlenmiş
hakem, kimlik maskeleme, ölçüm gücü ön kontrolleri, mutasyonla doğrulanan
sınamalar. Bu makine kurulduğundan beri tekrar tekrar **kendi kusurunu**
buldurdu:

- adaptör iki ayrı yoldan kuruluyordu (üç kez kusur doğurdu)
- `input_tokens` önbellek okumalarını saymıyordu — "ortak birim token"
  kararı bozuk ölçüyle çalışıyordu
- maliyet `?? 0` ile toplanıyordu: abonelikle koşan sağlayıcı bedava görünüyordu
- çökmüş üretim "ölçüm gücü en yüksek hücre" gibi görünüyordu
- iki katmanın arasından gerçek bir bulgu düşüyordu (artık `report` bildiriyor)
- kuyrukta yarışı kaybeden taraf çöküyordu

Ajan hatlarına dair **herhangi bir** iddiayı ölçmek isteyen biri için
değerli olan kısım bu. Tez kanıtlanmasa da bu makine duruyor.

## 4. Ne kaldı — sırayla

1. **Denetçinin kaçırdığı bir kusur sınıfı.** Artık tahmin değil, **ölçülmüş
   gereksinim**: üç hücrede üç kez aynı-satıcı denetim hiçbir şey kaçırmadı.
   Tasarım kaldıracı da ölçümden çıktı — `snapshot-store` kusuru dosya
   başlığında PROZAYLA yazılı bir değişmezin ihlaliydi ve iki denetçi de onu
   okuyup buldu. Yeni görevde sözleşmeyi bir tüketici modülün **kodu**
   zorunlu kılmalı, yorum söylememeli.
2. **Planlamada kanıt biçimi.** İsteme karşı örnek kondu, üçüncü kampanya
   yarım kaldı (kontrol kolunun 2 koşusu ölçüldü).
3. **Görev seti 8/12** — ve asıl eksik sayı değil sınıf (bkz. 1).
4. **`AdapterRegistry`'yi silmek** — ikinci kurucu yol var oldukça aynı
   kusur dördüncü kez çıkar.
5. **ADK tarafı:** rol promptlarını ekrandan düzenlemek.

### Açık ve üretilemeyen

Windows'ta `npm test` bir koşuda kuyruk sahiplenmesini kırdı ("ikisi de
kart aldı"). Mekanizma iki platformda da doğrudan sınandı ve sağlam; 800+
izole tur ve 7 tam takım koşusunda tekrarlanmadı. Sınamanın iddiası artık
teşhis taşıyor: bir dahaki kırılmada kök nedeni kendisi söyleyecek.

---

## Harcama

Ölçüme bugüne kadar kabaca **$27** gitti (üç 6d kampanyası ~$24, çapraz
satıcı 2x2 + puanlama + sınıflama ~$2, ön kontroller ~$0.5). Ön kontroller
bunun karşılığını veriyor: üç hücrede tam matris koşulsaydı ~$3 daha
giderdi ve hiçbiri sonuç üretmeyecekti.
