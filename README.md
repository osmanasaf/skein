# Murmuration

Farklı sağlayıcıların AI ajanlarını (Claude, Codex, Copilot, Gemini…) tek bir
yazılım geliştirme akışında, **birbirini denetleyerek** çalıştıran bir merkez.

> *Murmuration:* sığırcık sürülerinin gökyüzünde, merkezi bir lider olmadan,
> tek bir organizma gibi hareket etmesi.

## Tez

Bir AI ajanına "şunu yap" demek ile bir yazılım ekibine "şunu yap" demek
arasındaki fark, ekibin birbirini denetlemesidir. Murmuration bu denetimi
ajanın iyi niyetine değil **mekanizmaya** bağlar:

- Durum ajanın context'inde değil, git'te ve dosyalarda — bu yüzden bir rolü
  herhangi bir sağlayıcı doldurabilir
- Üreten ile denetleyen kasıtlı olarak farklı model — farklı kör nokta
- Devir teslim doğrulanmış bir kayıt, serbest metin değil
- "Bitti" demek sürtünmeli: ilk deneme reddedilir, ajan işini yeniden denetler

## Nereden başlamalı

| Dosya | İçerik |
|---|---|
| [`PHILOSOPHY.md`](PHILOSOPHY.md) | İlkeler, reddedilenler, test edilmemiş varsayımlar |
| [`ROADMAP.md`](ROADMAP.md) | Risk azaltma sırasına göre aşamalar |
| [`hub/flows/daily.yaml`](hub/flows/daily.yaml) | Akış tanımı şeması |
| [`hub/adapters/CONTRACT.md`](hub/adapters/CONTRACT.md) | Sağlayıcı sözleşmesi |
| [`java-kit/`](java-kit/) | Java rol ve kural seti (prompt kaynağı) |

## Durum

Aşama 0 — felsefe ve kapsam yazılı. Sıradaki: audit gate.

## Kaynak

Fikirler [`unclebob/swarm-forge`](https://github.com/unclebob/swarm-forge)
kod tabanının incelenmesinden damıtıldı. Kod kopyalanmadı; neyin alındığı ve
neyin neden bırakıldığı `PHILOSOPHY.md`'de açıkça yazılı.
