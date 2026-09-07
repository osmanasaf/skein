# Skein

Farklı sağlayıcıların AI ajanlarını (Claude, Codex, Copilot, Gemini…) tek bir
yazılım geliştirme akışında, **birbirini denetleyerek** çalıştıran bir merkez.

> *Skein:* uçuştaki bir yaban kazı sürüsü — her kuş kendi kanadını çırpar,
> ama formasyon tektir. Aynı kelime, birbirine dolanmış iplik demeti anlamına
> da gelir.

## Tez

Bir AI ajanına "şunu yap" demek ile bir yazılım ekibine "şunu yap" demek
arasındaki fark, ekibin birbirini denetlemesidir. Skein bu denetimi
ajanın iyi niyetine değil **mekanizmaya** bağlar:

- Durum ajanın context'inde değil, git'te ve dosyalarda — bu yüzden bir rolü
  herhangi bir sağlayıcı doldurabilir
- Üreten ile denetleyen kasıtlı olarak farklı model — farklı kör nokta
- Devir teslim doğrulanmış bir kayıt, serbest metin değil
- "Bitti" demek sürtünmeli: ilk deneme reddedilir, ajan işini yeniden denetler
- Topolojiyi kullanıcı yazar: kaç rol, hangi isimler, kapı nerede — 2 adım da
  6 adım da senin kararın, ürünün sabiti değil
- Merkez ekranı birinci sınıf: ajanları canlı izle, maliyeti ve bulguları gör

## Nereden başlamalı

| Dosya | İçerik |
|---|---|
| [`PHILOSOPHY.md`](PHILOSOPHY.md) | İlkeler, reddedilenler, test edilmemiş varsayımlar |
| [`ROADMAP.md`](ROADMAP.md) | Risk azaltma sırasına göre aşamalar |
| [`hub/flows/SCHEMA.md`](hub/flows/SCHEMA.md) | Topoloji tanımlama dili — kendi akışını bununla yazarsın |
| [`hub/flows/`](hub/flows/) | Örnek akışlar: 2 adımlı `daily`, 4 adımlı kapılı `spec` |
| [`hub/adapters/CONTRACT.md`](hub/adapters/CONTRACT.md) | Sağlayıcı sözleşmesi |
| [`java-kit/`](java-kit/) | Java rol ve kural seti (prompt kaynağı) |

## Durum

Aşama 0 — felsefe ve kapsam yazılı. Sıradaki: audit gate.

## Kaynak

Fikirler [`unclebob/swarm-forge`](https://github.com/unclebob/swarm-forge)
kod tabanının incelenmesinden damıtıldı. Kod kopyalanmadı; neyin alındığı ve
neyin neden bırakıldığı `PHILOSOPHY.md`'de açıkça yazılı.
