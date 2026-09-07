# Skein rol zinciri

Beş skill, bir zincir. Her biri tek başına da çağrılabilir, ama sıralı
kullanıldıklarında Skein'in felsefesini tek oturumda uygularlar:
roller ayrı, devir teslim açık, "bitti" demek sürtünmeli.

```
analyst  →  architect  →  developer  →  reviewer  →  verifier
  ne?         nasıl?        yap          iyi mi?      oldu mu?
```

| Skill | Sorusu | Çıktısı | Tipik hatası (skill bunu engeller) |
|---|---|---|---|
| `analyst` | Ne inşa edeceğiz? | Gözlemlenebilir kabul kriterleri, kapsam sınırı | Belirsiz kriter ("düzgün çalışır") |
| `architect` | Nasıl inşa edeceğiz? | Modül sınırları, gerekçeli tasarım kararları | Desen kargo kültü |
| `developer` | Uygula | Kod + testler, TDD ile | Kapsam sürüklenmesi, testi sonradan yazma |
| `reviewer` | Kod iyi mi? | Önem sıralı bulgular, somut senaryolarla | Üslup didikleyip hatayı kaçırmak |
| `verifier` | İstenen oldu mu? | Kriter-kanıt izlenebilirlik tablosu | Yeşil testi kanıt saymak |

## reviewer ve verifier neden ayrı

Farklı soru soruyorlar:

- **reviewer** → *bu kod iyi mi?* Doğruluk, tasarım uyumu, karmaşıklık.
- **verifier** → *istenen şey yapıldı mı?* Her kriterin kanıta bağlanması.

İyi yazılmış ama yanlış işi yapan kod reviewer'dan geçer, verifier'dan
geçmez. Tersi de mümkün: doğru işi yapan ama kırılgan kod verifier'dan
geçer, reviewer'dan geçmez. İki kapı iki farklı riski tutar.

## Kullanım

Tek tek çağırabilirsin:

```
/analyst    ödeme yeniden deneme mantığı ekleyelim
/architect  (analistin çıktısı üzerine)
/developer  (mimarın tasarımı üzerine)
/reviewer   (yazılan kod üzerine)
/verifier   (teslim öncesi)
```

Küçük işlerde zincirin tamamı gereksiz. Pratik kısayollar:

- **Belirsiz istek** → `analyst` ile başla
- **Net istek, riskli değişiklik** → `architect` → `developer` → `reviewer`
- **Küçük düzeltme** → `developer` → `verifier`
- **Devralınan kod** → `reviewer` tek başına

## Skein ile ilişkisi

Bu dosyalar iki yerde çalışır:

1. **Şimdi** — Claude Code skill'i olarak, tek oturumda sıralı çağrılarak.
2. **Sonra** — Skein akışlarının rol tanımları olarak
   (`hub/flows/SCHEMA.md`'deki `prompt:` alanı), her rol ayrı worktree'de
   ayrı sağlayıcıda çalışırken.

Aradaki fark taşıyıcıda: bugün aynı modelin sıralı turları, yarın farklı
sağlayıcıların paralel süreçleri. Rol tanımı aynı kalır.

Bu yüzden hepsinde ortak bir kalıp var: **Sahiplenmediklerin** bölümü (rol
sınırı) ve **Bitirmeden önce** bölümü (kendi işini denetlemeden teslim etme).
İkincisi, Skein'in audit gate'inin prompt seviyesindeki karşılığıdır.
