# Sağlayıcı Adaptörü Sözleşmesi

"Farklı sağlayıcıların ahenk içinde çalışması"nın teknik karşılığı budur.
Her sağlayıcı (Claude, Codex, Copilot, Gemini, …) bu tek sözleşmeyi uygular;
yürütücü hangi sağlayıcıyla konuştuğunu bilmez.

## Neden bu mümkün

Çünkü kalıcı durum ajanın context'inde değil, git'te ve dosyalarda. Bir rolü
Claude'un mu Codex'in mi doldurduğu, işin devamlılığını etkilemez. Bu
felsefenin 1. ilkesi, çoklu sağlayıcının ön koşuludur.

## Arayüz

```
invoke(request) -> result

request:
  workdir      : string   — rolün git worktree'si; süreç burada çalışır
  promptFile   : string   — rol tanımı + anayasa (birleştirilmiş)
  taskText     : string   — bu tur yapılacak iş
  timeoutMs    : number
  env          : map      — sağlayıcıya özel ek ortam değişkenleri
  onStep       : fn?      — adım geldikçe çağrılır (isteğe bağlı, aşağıya bak)

result:
  exitCode     : number   — 0 = başarı
  stdout       : string
  stderr       : string
  durationMs   : number
  usage        : map?     — token/maliyet, sağlayıcı veriyorsa
```

## Uygulama kuralları

**Headless çağrı zorunlu.** Ajan interaktif TUI olarak değil, iş başına bir
süreç olarak çalışır: başlar, işi yapar, çıkar. Bu sayede tmux, `send-keys`
ve pane metni kazıma katmanının tamamı ortadan kalkar — ve sistem
Windows/Mac/Linux ile CI'da aynı davranır.

**Gerçek exit code kullan.** SwarmForge ajan durumunu pane çıktısında
`"I'm ..."` içeren son satırı regex'le arayarak çıkarıyordu; CLI çıktı
formatı değişince sessizce bozulan bir yüzey. Adaptör bunun yerine süreç
çıkış kodunu ve stdout'u döndürür.

**Otomatik onay bayrağını adaptör bilir, çekirdek bilmez.** Her CLI'ın
izin/onay modu farklı adlandırılır ve zamanla değişir. Bu bilgi adaptörde
kapsüllenir.

**Canlı adım isteğe bağlıdır, ve yalnızca yapılandırılmış çıktıdan gelir.**
`onStep` verilirse adaptör, ajan koşarken her adımı (hangi aracı çağırdı, ne
söyledi) bildirebilir. İki kural:

1. **Metin kazıyarak adım üretmek yasak.** Sağlayıcının makine-okunur bir
   akış biçimi yoksa adaptör `onStep`'i sessizce yok sayar ve turun geri
   kalanı aynen çalışır. Pane kazımayı reddetmenin sebebi buydu; kendi
   ekranımız için geri getirmek anlamsız olurdu.
2. **Adım GÖZLEM'dir, durum değil.** Kaybı turun sonucunu değiştirmez;
   kartın nereye gittiği `card.settled`'dan okunur.

Bugün `claude` adaptörü destekliyor (`--output-format stream-json`),
`codex` desteklemiyor — bayrakları doğrulanmadığı için (aşağıdaki kural).

**Bayrakları doğrulayarak yaz.** Her sağlayıcının non-interactive çağrım
şekli (bayrak adları, izin modu, prompt dosyası geçirme biçimi) kendi
dokümanından doğrulanmalıdır. Ezberden yazılan bayrak sessizce yanlış
çalışır.

Bayrağın ADI kadar SIRASI da doğrulanmalı: `claude`'un
`--allowed-tools <tools...>` bayrağı variadic ve kendisinden sonraki her
pozisyonel argümanı araç adı sanıyor. Görev metni sondayken CLI "Input must
be provided" diyor — yani ajan görevi hiç görmüyor. Görev metni artık en
başta.

## Yürütücünün adaptörden beklemedikleri

- Handoff yazmak — çekirdeğin işi
- Audit gate uygulamak — çekirdeğin işi
- Worktree oluşturmak — çekirdeğin işi
- Kuyruğu yönetmek — çekirdeğin işi

Adaptör yalnızca "şu dizinde, şu promptla, şu işi yap ve bana ne olduğunu
söyle" der. Bu kadar dar olması, yeni bir sağlayıcı eklemeyi tek dosyalık
işe indirger.

## Olay günlüğü

Her `invoke` bir kayıt üretir: rol, sağlayıcı, görev, exit code, süre,
usage. Takip, maliyet ölçümü ve "hangi model hangi rolde daha iyi"
karşılaştırması bu günlükten gelir. SwarmForge'da bu veri hiç toplanmıyor.
