# Devir Teslim — 2026-09-07

Bu dosya bir sonraki oturumun giriş noktası. Durum ajanın kafasında değil,
burada ve git'te (PHILOSOPHY 1).

**Dal:** `claude/project-plan-brainstorm-pthvoc` · **HEAD:** `dae3e17`
**Durum:** 138 test yeşil, typecheck temiz, origin ile senkron.

---

## Tek cümlede nerede kaldık

Deney koşum takımı çalışıyor ve iki gerçek ölçüm üretti; **ilk çapraz satıcı
koşusu operatörün Windows makinesinde tıkalı** ve tıkanmanın sebebini
öğrenmek için tek bir komutun çıktısı bekleniyor.

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
  Şu ana kadarki kalıp: sabit bayrak varsayımları operatörün CLI sürümünde
  tutmuyor; çözüm her seferinde "CLI'ın kendi beyanına göre davran" oldu.

## Tıkanmanın hikâyesi — dört tur, dört ayrı sebep

Operatörün makinesinde `claude` üretimi ajanı hiç çalıştıramadı. Her tur
bir sebep eledi:

| Tur | Belirti | Sebep | Çözüm |
|---|---|---|---|
| 1 | `0/0 yeşil — kusur yok` | Matriste ölçüm koruması yoktu; ayrıca vitest 5 JSON raporunu dosyaya yazıyor | Koruma matrise eklendi, rapor `--outputFile` ile okunuyor |
| 2 | `HİÇBİR dosya yazmadı` | `error: unknown option '--permission-prompts'` | Bayraklar `--help` çıktısından tespit ediliyor |
| 3 | `iterations: []` | Görev metni stdin'den gidiyordu, o sürüm `-p` modunda stdin okumuyor | Metin pozisyonel argüman oldu |
| 4 | `iterations: []` (hâlâ) | `--system-prompt-file` `--help`'te YOK, belgesiz çalışıyor | İlan edilmişse dosya, değilse `--system-prompt` gövde |

Tur 4'ün düzeltmesi operatörde henüz denenmedi. `doctor` çıktısı bunu
söyleyecek.

**Kalıp:** dört sebebin dördü de "benim makinemde çalışıyor" varsayımıydı ve
hiçbiri Linux'ta görünmüyordu. Farklı bir ortamda koşturmak, testlerin
yakalayamadığı varsayımları söktü.

---

## Elde olan ölçümler

### Audit gate — Açık Soru #1 (`claude-opus-5`, `retry-backoff`)

```
kapısız : ortalama 1.00 kırmızı  ·  $0.0603
kapılı  : ortalama 0.00 kırmızı  ·  $0.5361      (8.9x maliyet)
```

Mekanizma izi sayıdan güçlü: kapısız 3/3 koşuda `export function retry`
(senkron fırlatma kusuru), kapılı 3/3 koşuda `export async function retry`.
İki kapılı koşuda ajan denetim turunda parmak izini değiştirdi — yani işi
gerçekten değişti.

Sınırlar `bench/DESIGN.md`'de yazılı: n=3'e 3, tek görev, tek kusur türü,
ve üçüncü kapılı koşu hiç düzeltme yapmadan 9/9 çıktı (üretimi zaten
temizdi).

### Görev kalibrasyonu — çözülmemiş

| Görev | opus-5 | sonnet-5 | haiku-4.5 |
|---|---|---|---|
| `retry-backoff` | ~%25-75 kusur | temiz | — |
| `token-bucket` (14 kanca) | 14/14 | 14/14 | 14/14 |

Güçlü modeller tek dosyalık, spec'i tam yazılmış bağımsız görevleri temiz
çözüyor. **Bu deneyin darboğazı.** İki yol, ikisi de bedelli:

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
yükleyici, gizli test çalıştırıcı, olay günlüğü + özet, audit gate
(parmak izi + kilitli durum + tur sayacı), 2x2 matris orkestrasyonu,
ölçüm koruması, `doctor` teşhisi.

**Yok:** hakem katmanı (körlenmiş puanlama), kalan 10 görev, 2x2 raporu
(etkileşim terimi hesabı), ve ürün tarafının tamamı — kuyruk, handoff,
worktree, gözcü döngüsü, merkez ekranı.

**Bilinen boşluk:** audit gate turlar arası anlık görüntü tutmuyor, bu
yüzden "denetim turunda tam olarak ne değişti" sorusu son artefakta
bakılarak çıkarsanıyor.

## Harcama

27 ajan çağrısı, ~$3.60 (bu ortamda). Operatörün makinesindeki koşular
ayrı.

## Yol haritası bağlamı

`ROADMAP.md` → "Yakın plan": Adım 1-3 tamam (ilk koşu, olay günlüğü, audit
gate). Adım 4 (deneyi tamamla) yarım: 2x2 boru hattı kuruldu ama kalibre
görev olmadığı için ölçüm üretmedi.
