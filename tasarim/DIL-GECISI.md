# Dil geçişi — kod İngilizce, arayüz Türkçe

**Karar (6 Kasım 2026, operatör):** kod içindeki tanımlayıcılar ve
yorumlar İngilizceye geçecek. Arayüz metinleri Türkçe kalacak.

**Zamanlama:** üç tasarım kartı (koyu tema, kuşların uçuşu, DEVIR
denetimi) bittikten sonra, tek seferde. Koşu sürerken yapılmayacak —
üç kart da `src/ui/page.ts`'e dokunuyor ve toplu yeniden adlandırma
onlarla çarpışır.

---

## Ölçü — DÜZELTİLDİ (6 Kasım, geçişe başlarken)

İlk ölçü **~343** diyordu ve YANLIŞTI: sayımda kullanılan Türkçe kök
listesi eksikti (`karar`, `taslak`, `kanit`, `denetci`, `itiraz`,
`gorev`, `gerekce`, `anayasa`, `yukumluluk`, `etiket`, `katilimci` ve
onlarcası listede yoktu).

**Gerçek ölçü**, TypeScript'in kendi AST'sinden çıkarıldı (regex değil —
bir ad dizede, yorumda ve CSS sınıf adı olarak da geçiyor):

| | |
|---|---|
| bildirilen tanımlayıcı | **2147** |
| bunlardan Türkçe | **638** |
| toplam kullanım | **2532** |
| etkilenen dosya | **90** |

Örnekler: `kusRengi`, `gozcuPanelDurum`, `kanatCirpiyorMu`,
`izinliAdlar`, `bizeAit`, `surenEngeller`, `kapiCikislari`,
`retYayKontrol`, `ajanSuAnDurumu`, `gozcuBeklemeSonucu`.

Koruma: **1654 sınama**. Yeniden adlandırma mekanik olarak güvenli —
bir ismi kaçırırsan `tsc` bağırır. Ama "mekanik" ile "kör" aynı şey
değil: bkz. aşağıdaki iki tehlike.

---

## SINIR — nerede durulacak

Bu ayrım işin tamamıdır; karıştırmak sınamaları kırar.

### İngilizceye geçecek

- Değişken, fonksiyon, tip, arayüz, sınıf adları.
- Kod içindeki yorumlar (`//` ve `/* */`).
- İç CSS sınıf adları (`.railGozcuNokta` → `.railDaemonDot`) —
  **ama** sınamalar bu seçicilere bakıyor, ikisi birlikte değişecek.

### TÜRKÇE KALACAK

- **Kullanıcının gördüğü her metin.** Düğme etiketleri ("Gözcüyü
  başlat", "Kilidi devral ve başlat"), durum metinleri ("boşta",
  "kapıda bekliyor", "gözcü kapalı · … yarıda"), uyarılar, lejant,
  altbilgi, hata mesajları.
- **Sınamaların başlıkları** (`it("bayat kilitte gözcü düğmesi
  'başlat' diyor")`) — bunlar davranışın tarifi ve Türkçe okunuyor.
- `tasarim/*.md`, `hub/prompts/**`, commit mesajları.
- **SERİLEŞEN HER ALAN ADI VE DEĞERİ.** İlk sürüm yalnızca olay
  günlüğünü yazıyordu; sınır daha geniş. Diskteki gerçek JSON
  dosyalarından çıkarılan dokunulmaz liste:

  | ad | nerede | niye |
  |---|---|---|
  | `akis`, `tema` | `.skein/ekran.json` | yeniden adlandırma operatörün kayıtlı seçimini düşürür |
  | `kanit`, `itiraz`, `kabuller`, `katilimcilar`, `denetci`, `ne`, `ilkTurKor`, `tur` | kart ve kapı dosyaları | yaşayan kuyruktaki kartlar okunamaz olur |
  | `durum` | `.skein/olaylar.jsonl` (`plan.obligation`) | geçmiş veri |
  | `yukumlulukler`, `durum`, `not` | `.skein-verdict.json` (`Verdict`, `YukumlulukCevabi`) | **AJANIN yazdığı dosya** — şeması `hub/prompts/**` ile sözleşme, promptlar Türkçe kalıyor |

  Tip ADLARI serileşmiyor, onlar değişebilir (`YukumlulukCevabi` →
  `ObligationAnswer`); değişmeyecek olan ALAN adları.

**Niye:** arayüz Türk operatör için. Metni çevirmek ürünü değiştirir,
kodu çevirmek değiştirmez.

---

## Yorumlar hakkında bir uyarı

Bu depodaki yorumlar kısa değil. Çoğu bir **kusur tarihçesi** taşıyor:
"gerçekte şöyle patladı…", "bu sınama şu mutasyon ayakta kaldığı için
yazıldı", "önceki yorum yanlıştı, sebebi şuydu". O anlatı projenin
hafızası.

Çeviri mekanik olmayacak: cümleleri İngilizceye aktarırken **gerekçeyi
ve ölçüyü** korumak gerekir. Kısaltmak, "bu kodu şöyle yapar" diye
özetlemek kayıptır. Bir yorum neyin niye böyle olduğunu anlatıyorsa,
İngilizcesi de anlatmalı.

Operatör bu riski bilerek seçti; not buraya, sonradan "neden bu kadar
uzun sürdü" sorulmasın diye.

---

## İki tehlike — "mekanik" kör demek değil

**1. Sessiz yakalama.** `kart` adını `card`'a çevirirken aynı dosyada
zaten bir `card` varsa `tsc` bağırır (iyi). Ama AYRI kapsamlardaysa
gölgeleme olur ve `tsc` SUSAR — davranış sessizce değişir. Bu yüzden
araç her dosyada hedef adın zaten var olup olmadığını denetliyor ve
çakışanı elle işaretliyor, kör değiştirmiyor.

**2. Dize ve CSS sınıf adları.** Bir tanımlayıcı adı aynı zamanda CSS
sınıf adı (`el("div", "railGozcuNokta")`) ve arayüz metni olarak
geçiyor. Bunlar dize, tanımlayıcı değil — AST tabanlı değiştirme
onlara DOKUNMUYOR, ve bu kasıtlı. CSS sınıf adları AYRI bir geçiş;
sınamalar o seçicilere bakıyor, ikisi birlikte değişecek.

**Kanıt (her iki aşama için):** Türkçe metne bakan sınamaların hepsi
DEĞİŞMEDEN geçmeli. Değişen varsa sınır çiğnenmiştir.

## Yöntem

1. Koşu bitsin, ağaç temiz olsun, her şey itilsin.
2. Tanımlayıcılar önce — mekanik, `tsc` ile doğrulanır, tek commit.
   Her adımda `npx tsc --noEmit` ve `npx vitest run`.
3. Yorumlar sonra — dosya dosya, anlamı koruyarak. Ayrı commit'ler.
4. Arayüz metnine dokunulmadığının kanıtı: Türkçe metne bakan
   sınamaların hepsi değişmeden geçmeli. Değişen varsa sınır
   çiğnenmiştir.
