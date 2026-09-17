# Devir Teslim — 2026-09-17

Bu dosya bir sonraki oturumun giriş noktası. Durum ajanın kafasında değil,
burada ve git'te (PHILOSOPHY 1). Yeni bir sohbete/projeye tek başına
yapıştırılabilsin diye yazıldı: aşağısı Skein'i tanımayan birine de yeter.

**Dal:** `claude/project-plan-brainstorm-pthvoc` · **HEAD:** `cfd33da`
**Durum:** 453 test yeşil, typecheck temiz, origin ile senkron, ağaç temiz.
**Kod:** ~8.2k satır ürün + ~5.5k satır test.
**Çizimler:** [yol haritası](https://claude.ai/artifact/1R83SxkfhLKwgTbRS4bc8y) ·
[ekran tasarımı](https://claude.ai/artifact/1At1Y4m211bikwr73gSstG) ·
[genel bakış](https://claude.ai/code/artifact/2e7575af-84ee-40d8-aab4-5c3bdce0fe50) ·
[kartın yolu](https://claude.ai/code/artifact/41Y5sWd7iZud9jiFKzzzAE)

---

## Skein nedir (tanımayan için üç paragraf)

Farklı satıcıların ajanlarını (Claude, Codex) **bildirime dayalı bir rol
topolojisi** üzerinden koşturan bir orkestratör. Bir iş bir **kart**; kart
rollerin arasında dolaşır; her rol kendi worktree'sinde çalışır; kod
dosya kopyalanarak değil **git'te** taşınır. Bir rol kabul ederse kart
ilerler, reddederse akış dosyasındaki ret hedefine geri döner, ret hakkı
biterse **kapı**da (gate) durup insanı bekler.

Tez: farklı satıcıların modelleri farklı kör noktalara sahip, dolayısıyla
birbirini denetlediklerinde tek modelin kaçırdığı kusur yakalanır. **Bu tez
hâlâ ölçülmedi** — aşağıda "Açık karar"a bak.

Uzun vadeli hedef bir kütüphane değil, bir **ajan geliştirme ortamı (ADK)**:
rolleri/görevleri tanımladığın, koşarken izlediğin, ne değiştirdiklerini
gördüğün yer. Kod editörü **değil** — bu sınır kasıtlı (`ARCHITECTURE.md`).

---

## Tek cümlede nerede kaldık

Yol haritasının **1-5. adımları bitti ve hepsi canlı koşuda doğrulandı**;
elde çalışan bir motor *ve* onu süren bir ekran var. Kalan tek planlı adım
**6: planlamada ajanlar arası yazılı tur** — ve ondan önce cevaplanması
gereken bir soru var (en altta).

| # | Adım | Durum |
|---|---|---|
| 1 | `--serve` — gözcü uyur, kart düşünce uyanır | ✅ kart, ikinci komut olmadan bitti |
| 2 | `agent.step` — ajan koşarken günlüğe düşer | ✅ 8 adım, tur bitmeden |
| 3 | Okuyucu ekran — pano, canlı adım, iz, diff | ✅ üç sorunun üçü ekrandan cevaplanıyor |
| 4 | Kapı ekrandan açılıyor | ✅ jetonlu; 403/409/200 yolları denendi |
| 5 | Akış ekrandan kuruluyor | ✅ doğrulanmış + atomik yazım |
| 6 | Planlamada ajanlar arası yazılı tur | ⬜ başlanmadı; gerekçesi PHILOSOPHY'de |

---

## Ne çalışıyor

```
npx tsx src/flow/cli.ts check <akış>            topolojiyi doğrula + maliyet
npx tsx src/card/cli.ts new|ls|show|kapat …     kartı elle sür
npx tsx src/watch/cli.ts <akış> --model …       orkestratör (toplu koşu)
npx tsx src/watch/cli.ts <akış> --serve …       gözcüyü açık bırak
npx tsx src/ui/cli.ts <akış> [--port N]         ekran (127.0.0.1)
```

**Bayrak verirken `npm run` kullanma** — bazı npm sürümleri `--` sonrasını
kendi seçeneği sanıp sessizce yutuyor. `RUNNING.md` üç adımlık başlangıcı
ve Windows notlarını içeriyor.

| Parça | Dosya |
|---|---|
| Akış yükleyici — 16 kural, zincir sırası, topoloji hash'i | `src/flow/load.ts` |
| Akışın yaşayan hâli — atomik + doğrulanmış yeniden yükleme | `src/flow/live.ts` |
| Akış taslağı — YAML üretimi, doğrulama, atomik yazma | `src/flow/draft.ts` |
| Maliyet tahmini — ret kenarları dahil | `src/flow/cost.ts` |
| Kart — geçmiş, ret sayaçları, donmuş topoloji | `src/card/card.ts` |
| Kuyruk — atomik geçiş, kilitsiz sahiplenme, çökme toplama | `src/card/queue.ts` |
| Kapı kararı — kartı taşır, `gate.released` düşer | `src/card/release.ts` |
| Yetim kart — tanım, kapatma, gerekçe | `src/card/orphan.ts` |
| Gözcü — tur, verdikt, yönlendirme | `src/watch/tick.ts` |
| Uzun ömürlü gözcü — uyu/uyan, yetim duyurusu | `src/watch/serve.ts` |
| Tek yazıcı kilidi — bayat kilidi devralır | `src/watch/lock.ts` |
| Git katmanı — ileri birleştirme, syncBack, worktree | `src/watch/git.ts` |
| Canlı adımlar — `stream-json` → `agent.step` | `src/adapters/claude.ts` |
| Ekran — okuma modeli, yerel sunucu, tek dosya sayfa | `src/ui/` |
| Olay günlüğü — dar tip birliği + `REQUIRED` haritası | `src/events/log.ts` |

---

## Yeniden açılmayacak kararlar

Hepsinin gerekçesi `ARCHITECTURE.md`'de; burada yalnızca özeti:

1. **Durum yüzeyde tutulmaz.** Ekran okur; yazacaksa çekirdeğe *komut*
   gönderir, kendi kopyasını güncellemez.
2. **Kartın yeri dizindir.** "Nerede" sorusunun cevabı hangi dizinde
   durduğudur.
3. **Olay günlüğü yalnızca eklenir, tipi dardır.** Yeni görünüm için serbest
   biçimli olay eklenmez.
4. **Topoloji kartta donar.** Akış koşarken düzenlenebilir; yoldaki kart
   kendi hash'iyle yaşar.
5. **Ajan kendi akışını değiştiremez.**
6. **Kod git'te taşınır.** Dosya kopyalayan bir "paylaşım" yüzeyi yok.

**Yerel DB (H2 vb.) gerekmiyor** ve bugün eklemek zarar olur: `.skein/`
dizinleri + JSONL + git zaten üç parçalı depo; DB dördüncü kopya olur.
Sorgu ihtiyacı doğarsa cevap SQLite, ve **türetilmiş indeks** olarak —
testi: `rm .skein/index.db` dedikten sonra hiçbir şey kaybolmamalı.

**Kapı üç tiptir ve karıştırılmaz** (`gate.kind`): `approval` (kod zaten
ileri birleştirildi), `deadlock` (ret hakkı bitti, kod yerinde),
`escalation` (tur hiç tamamlanmadı, kod hiç taşınmadı). `forward` kararı
kaçış kapısından **reddedilir**; oradan çıkış `retry`.

**Yetim kart** (rolü artık topolojide yok): görünür kılınır, tek meşru
çıkışı `kapat`. Yeni akışa taşımak dondurmayı bozar — reddedildi.

---

## Ölçülmüş olan, ölçülmemiş olan

**Ölçülmüş — mekanizma:** 4 rollü `spec` akışı gerçek ajanlarla uçtan uca
koştu (4 aktivasyon · 4 dk 20 sn · $0.42). Kapı durdu, insan bıraktı, kod üç
worktree arasında taşındı, syncBack üç dala ulaştı.

**Ölçülmüş — audit gate (`claude-opus-5`, `retry-backoff`, 9 kanca):**

```
kapısız (n=5) : ortalama 0.80 kırmızı kanca  ·  $0.0743
kapılı  (n=3) : ortalama 0.00 kırmızı kanca  ·  $0.5361     (7.2x maliyet)
```

**İlk kez: denetim katmanı gerçek bir kusur yakaladı.** Aynı kartta iki kez
— Kahan toplamı `[Infinity, Infinity]` için NaN veriyordu; kısmi düzeltme de
`[Infinity, 2, 3]` için hâlâ hatalıydı. İkisini de aritmetiği elle koşarak
bağımsız doğruladım.

**Ama üretici ile denetçi aynı modeldi (haiku).** Yani bu bulgu **ayrı bir
denetim turunun** değerini gösteriyor; **çapraz satıcı denetiminin** değil.
Merkezî tez hâlâ ölçülmedi. Bu dürüst sınır `PHILOSOPHY.md` açık soru #2'de
kayıtlı ve orada kalmalı.

**Görev kalibrasyonu hâlâ darboğaz:** `token-bucket` üç modelde de 14/14
temiz; kusur üreten tek görev `retry-backoff` (opus-5'te 5 koşuda 4'ü).
Kusur üretmeyen görevle denetim ölçülemez.

---

## Açık karar (kullanıcıya soruldu, cevap bekliyor)

> Sıradaki iş **adım 6** mı, yoksa önce **çapraz satıcı ölçümü** mü?

**Benim önerim ölçüm.** Gerekçe: adım 6 (ajanlar arası yazılı tur) tezin
üstüne bina kuruyor; tez ölçülmeden kurulan bina, yanlış yere kurulmuş
olabilir. Ölçüm için gereken şey zaten yazılı — eksik olan, **kusur üreten
bir görev sınıfı**. Aday sınıflar: belirsiz gereksinim, mevcut koda derin
dokunan değişiklik, eşzamanlılık.

Adım 6'ya geçilecekse şekli de kayıtlı: serbest sohbet **değil**, `reject`
mekanizmasının kardeşi — kayıtlı, sayılı, gerekçeli turlar. Serbest sohbet
maliyeti sınırsız büyütür, izlenebilirliği kaybeder ve modeller birbirine
yakınsadıkça kör nokta tezini zayıflatır.

### Ayrıca bilerek dışarıda bırakılanlar

- **Rol promptlarını ekrandan düzenlemek** (adım 5'in dışında tutuldu).
  Sebep: prompt içeriği her tur taze okunuyor, yani düzenleme yoldaki
  kartın **sonraki turunu** etkiler. Bu, dondurma değişmezinin kenarında
  duruyor ve kendi kararını hak ediyor.
- Yargıç (judge) katmanı, kalan bench görevleri, 2×2 etkileşim raporu.

---

## Tuzaklar (hepsi canlı koşuda ısırdı)

- `--allowed-tools <tools...>` **değişken sayıda argüman alır**; görev metni
  ondan sonra yazılırsa sessizce yutulur ve ajan görevi hiç görmez. Metin
  `-p`'den hemen sonra geliyor; iki regresyon testi bekçilik ediyor.
- `stream-json` çıktısında `type:"result"` satırı **son satır değildir**;
  ardından bir `system` satırı gelir. "Son satır sonuçtur" varsayımı maliyeti
  ve ajanın mesajını sessizce kaybettirir.
- Rol promptundaki kısıt **en başa** yazılmalı; sona yazılan kısıt tutmuyor
  (aynı ders görev metninde de öğrenilmişti).
- `pkill -f` / `pgrep -f` kendi komut satırını eşleştirip kabuğu öldürüyor.
  `npx tsx` araya 3 sarmalayıcı süreç koyuyor; `kill <npx pid>` node'a
  ulaşmıyor. İkisi de `RUNNING.md`'de.
- Ekranın gömülü betiği tamamen bozulmuştu ama **453 testin hepsi yeşildi** —
  yalnızca uç noktalar test ediliyordu. `src/ui/page.test.ts` artık betiği
  `new Function` ile derliyor. Ders: ekranı gerçekten **aç ve bak**.

---

## Okuma sırası

| Dosya | Ne için |
|---|---|
| `ARCHITECTURE.md` | **Önce bu.** Katmanlar, uzun ömürlü çekirdek, DB kararı, değişmezler, adım kayıtları |
| `PHILOSOPHY.md` | İlkeler, reddedilenler, açık sorular (#2 güncel) |
| `hub/flows/SCHEMA.md` | Akış dili — 16 kural, ret yolu, kod taşıma, hash sözleşmesi |
| `RUNNING.md` | Kendi makinende koşturmak; Windows notları |
| `bench/DESIGN.md` | 2×2 deney tasarımı ve sınırları |
| `ROADMAP.md` | Orkestratörden önce yazıldı; okurken tarihini hesaba kat |

---

## Not: ajanlar senin dalına commit atıyor

`main` workspace'i kullanıcının checkout'u olduğu için kaçınılmaz. Deney
koşuları ayrı dalda yapıldı (`deney/olay-gunlugu`) ve inceleme sonrası
birleştirildi. Orkestratörün kendi dalında koşması hâlâ düşünülebilir.
