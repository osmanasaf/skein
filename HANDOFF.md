# Devir Teslim — 2026-09-12

Bu dosya bir sonraki oturumun giriş noktası. Durum ajanın kafasında değil,
burada ve git'te (PHILOSOPHY 1).

**Dal:** `claude/project-plan-brainstorm-pthvoc` · **HEAD:** `bb5b66f`
**Durum:** 138 test yeşil, typecheck temiz, origin ile senkron.
**Genel bakış sayfası:** https://claude.ai/code/artifact/2e7575af-84ee-40d8-aab4-5c3bdce0fe50

> 7 Eylül'den bu yana repoda değişiklik yok. Aşağıdaki "sıradaki adım" hâlâ
> geçerli; yalnızca ölçüm sayıları olay günlüğünden yeniden türetildi.

---

## Tek cümlede nerede kaldık

Deney koşum takımı çalışıyor ve Açık Soru #1'e ilk sayısal cevabı verdi;
**ilk çapraz satıcı koşusu operatörün Windows makinesinde tıkalı** ve
tıkanmanın sebebini öğrenmek için tek bir komutun çıktısı bekleniyor.

## Sıradaki adım — buradan başla

Operatör şunu koşturup **çıktının tamamını** yapıştıracak:

```powershell
git pull
npm run bench -- doctor claude:claude-opus-5
```

Bu komut şunları basar: CLI sürümü, hangi bayrakların desteklendiği,
çalıştırılacak tam komut satırı, ve modelin gerçekten çağrılıp
çağrılmadığı.

**Beklenen iki sonuç:**

- `ÇALIŞIYOR` → matrise geç:
  `npm run bench -- matrix retry-backoff claude:claude-opus-5 codex:gpt-5.5`
- `MODEL HİÇ ÇAĞRILMADI` → çıktıdaki bayrak listesi sebebi verecek.

## Tıkanmanın hikâyesi — dört tur, dört ayrı sebep

Operatörün makinesinde `claude` üretimi ajanı hiç çalıştıramadı. Her tur bir
sebep eledi:

| Tur | Belirti | Sebep | Çözüm |
|---|---|---|---|
| 1 | `0/0 yeşil — kusur yok` | Matriste ölçüm koruması yoktu; ayrıca vitest 5 JSON raporunu dosyaya yazıyor | Koruma matrise eklendi, rapor `--outputFile` ile okunuyor |
| 2 | `HİÇBİR dosya yazmadı` | `error: unknown option '--permission-prompts'` | Bayraklar `--help` çıktısından tespit ediliyor |
| 3 | `iterations: []` | Görev metni stdin'den gidiyordu, o sürüm `-p` modunda stdin okumuyor | Metin pozisyonel argüman oldu |
| 4 | `iterations: []` (hâlâ) | `--system-prompt-file` `--help`'te YOK, belgesiz çalışıyor | İlan edilmişse dosya, değilse `--system-prompt` gövde |

Tur 4'ün düzeltmesi operatörde **henüz denenmedi.** `doctor` çıktısı bunu
söyleyecek.

**Kalıp:** dört sebebin dördü de "benim makinemde çalışıyor" varsayımıydı ve
hiçbiri Linux'ta görünmüyordu. Bir sonraki sebep de muhtemelen aynı yerden
gelecek: sabit varsayım yerine CLI'ın kendi beyanına bak.

---

## Elde olan ölçümler

### Açık Soru #1 — audit gate (`claude-opus-5`, `retry-backoff`, 9 kanca)

```
kapısız (n=5) : ortalama 0.80 kırmızı kanca  ·  $0.0743
kapılı  (n=3) : ortalama 0.00 kırmızı kanca  ·  $0.5361     (7.2x maliyet)
```

Sayıdan güçlü olan mekanizma izi: kusur her koşuda aynı — model `retry`'yi
`async` yazmıyor, `RangeError` senkron fırlıyor, oysa imza `Promise<T>`
taahhüt ediyor. Kapılı üç koşunun üçünde de `export async function retry`.
İki kapılı koşuda ajan denetim turunda parmak izini değiştirdi.

Sınırlar `bench/DESIGN.md`'de: n=5'e 3, tek görev, tek kusur türü, ve üçüncü
kapılı koşu hiç düzeltme yapmadan 9/9 çıktı (üretimi zaten temizdi).

### Açık Soru #2 — çapraz sağlayıcı: tıkalı

2x2 boru hattı kuruldu ve dört hücre gerçek modellerle koştu
(`claude-opus-5` × `claude-sonnet-5`, $0.93), ama **ölçüm üretmedi**: iki
üretici de temiz çözdü, yani denetçiye yakalanacak kanıtlanmış kusur yoktu.

### Görev kalibrasyonu — asıl darboğaz

| Görev | opus-5 | sonnet-5 | haiku-4.5 |
|---|---|---|---|
| `retry-backoff` (9 kanca) | 5 koşuda 4'ü kusurlu | temiz | — |
| `token-bucket` (14 kanca) | 14/14 | 14/14 | 14/14 |

Güçlü modeller tek dosyalık, spec'i tam yazılmış bağımsız görevleri temiz
çözüyor. İki yol, ikisi de bedelli:

- **Daha büyük, bağlamlı görevler** (var olan bir repoya değişiklik) —
  ilkeye sadık, görev yazımı pahalı
- **Gerçek kusurlu kod** (geçmiş commit'lerden) — yer gerçeği bedava, ama
  "kusur üreticinin kendisinin olmalı" ilkesini bırakmak demek, ve o ilke
  tezin kör nokta iddiasının taşıyıcısı

Karar verilmedi.

---

## Ne var, ne yok

**Çalışıyor:** adaptörler (claude + codex, sürüm-dayanıklı bayraklar),
katmanlı prompt derleyici (kurcalamaya karşı korumalı, hash'li), görev
yükleyici, gizli test çalıştırıcı, olay günlüğü + özet, audit gate (parmak
izi + kilitli durum + tur sayacı + üst sınır), 2x2 matris orkestrasyonu,
ölçüm koruması, `doctor` teşhisi.

**Yok:** hakem katmanı (körlenmiş puanlama), kalan 10 görev, 2x2 raporu
(etkileşim terimi hesabı), ve ürün tarafının tamamı — kuyruk, handoff,
worktree, gözcü döngüsü, merkez ekranı.

**Bilinen boşluk:** audit gate turlar arası anlık görüntü tutmuyor, bu yüzden
"denetim turunda tam olarak ne değişti" sorusu son artefakta bakılarak
çıkarsanıyor.

## Sayılar

2131 satır kod · 138 test · 27 gerçek ajan çağrısı · ~$3.60 (bu ortamda).
Operatörün makinesindeki koşular ayrı.

## Yol haritası bağlamı

`ROADMAP.md` → "Yakın plan": Adım 1-3 tamam (ilk koşu, olay günlüğü, audit
gate). Adım 4 (deneyi tamamla) yarım: boru hattı kuruldu, kalibre görev
bekliyor.

## Okuma sırası

| Dosya | Ne için |
|---|---|
| bu dosya | Nerede kaldık, sıradaki adım |
| `PHILOSOPHY.md` | İlkeler, reddedilenler, açık sorular |
| `ROADMAP.md` | Yakın plan ve aşamalar |
| `bench/DESIGN.md` | Deney tasarımı, ölçümler, kalibrasyon bulgusu |
| `RUNNING.md` | Kendi makinende koşturmak |
| `hub/flows/SCHEMA.md` | Akış tanımlama dili |
