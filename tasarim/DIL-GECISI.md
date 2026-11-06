# Dil geçişi — kod İngilizce, arayüz Türkçe

**Karar (6 Kasım 2026, operatör):** kod içindeki tanımlayıcılar ve
yorumlar İngilizceye geçecek. Arayüz metinleri Türkçe kalacak.

**Zamanlama:** üç tasarım kartı (koyu tema, kuşların uçuşu, DEVIR
denetimi) bittikten sonra, tek seferde. Koşu sürerken yapılmayacak —
üç kart da `src/ui/page.ts`'e dokunuyor ve toplu yeniden adlandırma
onlarla çarpışır.

---

## Ölçü

2152 tanımlayıcıdan **~343'ü** Türkçe, **130** kaynak dosyasına
yayılmış. Örnekler: `kusRengi`, `gozcuPanelDurum`, `kanatCirpiyorMu`,
`izinliAdlar`, `bizeAit`, `surenEngeller`, `kapiCikislari`,
`retYayKontrol`, `ajanSuAnDurumu`, `gozcuBeklemeSonucu`.

Koruma: **1552 sınama**. Yeniden adlandırma mekanik olarak güvenli —
bir ismi kaçırırsan `tsc` bağırır.

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
- Olay günlüğündeki alan adları ve değerler (`.skein/olaylar.jsonl`) —
  geçmiş veriyle uyumluluk.

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

## Yöntem

1. Koşu bitsin, ağaç temiz olsun, her şey itilsin.
2. Tanımlayıcılar önce — mekanik, `tsc` ile doğrulanır, tek commit.
   Her adımda `npx tsc --noEmit` ve `npx vitest run`.
3. Yorumlar sonra — dosya dosya, anlamı koruyarak. Ayrı commit'ler.
4. Arayüz metnine dokunulmadığının kanıtı: Türkçe metne bakan
   sınamaların hepsi değişmeden geçmeli. Değişen varsa sınır
   çiğnenmiştir.
