# Kendi makinende koşturmak

Skein'in deney koşum takımı Windows, macOS ve Linux'ta çalışır. Bu belge,
özellikle **gerçek çapraz satıcı koşusu** (Claude × Codex) için.

## Gerekenler

- Node.js 22+
- En az bir sağlayıcı CLI'ı, oturumu açılmış:
  - `claude` — [Claude Code](https://code.claude.com)
  - `codex` — [OpenAI Codex](https://github.com/openai/codex)

## Kurulum

**PowerShell kullanıyorsan `&&` yazma.** Windows PowerShell 5.1 onu
desteklemez; her komutu ayrı satıra yaz (ya da `;` kullan).

```powershell
git clone https://github.com/osmanasaf/skein
cd skein
git checkout claude/project-plan-brainstorm-pthvoc
npm install
npm test
```

`npm test` 122 testin tamamını geçmeli. Geçmiyorsa çıktıyı sakla — Windows
tarafı bu makinede yazıldı ama Windows'ta koşulmadı.

## Önce doğrula, sonra koş

Codex adaptörünün bayrakları **codex'in kurulu olmadığı bir makinede
yazıldı**. `hub/adapters/CONTRACT.md` "bayrakları doğrulayarak yaz, ezberden
yazılan bayrak sessizce yanlış çalışır" diyor — o doğrulama sende:

```powershell
npm run bench -- doctor codex:gpt-5.5
```

(`npm run bench` `tsx`'i projeden kullanır; `npx tsx` gibi her seferinde
kurulum sormaz. `--` şart: ondan sonrası komuta gider.)

Bu komut çağıracağı tam komut satırını basar ve küçük bir deneme çağrısı
yapar. **ÇALIŞIYOR** derse hazırsın.

**ÇALIŞMIYOR** derse bayraklar yanlış demektir. `codex --help` çıktısına bakıp
`src/adapters/codex.ts` içindeki `DEFAULT_ARGS` dizisini düzelt — TypeScript
bilmeye gerek yok, sadece bir metin dizisi:

```ts
static readonly DEFAULT_ARGS = [
  "exec",
  "--model", "{model}",
  "--skip-git-repo-check",
  "--dangerously-bypass-approvals-and-sandbox",
];
```

`{model}` ve `{promptFile}` yer tutucuları doldurulur; görev metni her durumda
stdin'den gider.

Aynı doğrulamayı claude için de yapabilirsin:

```powershell
npm run bench -- doctor claude:claude-opus-5
```

## Koşular

### Tek üretici + gizli testler

```powershell
npm run bench -- retry-backoff
```

### Audit gate ile (Açık Soru #1)

```powershell
npm run bench -- retry-backoff claude claude-opus-5 --audit
```

### 2x2 çapraz kurgu (Açık Soru #2 — projenin merkezi tezi)

```powershell
npm run bench -- matrix retry-backoff claude:claude-opus-5 codex:gpt-5.5
```

Her iki model hem üretir hem denetler. Neden dört hücre gerektiği ve
çeşitliliğin neden etkileşim terimi olarak okunduğu: `bench/DESIGN.md`.

### Ölçüm özeti

```powershell
npm run bench -- report
```

Tüm koşular `.skein/events.jsonl` dosyasına yazılır (yalnızca ekleme).
Sayılar buradan gelir, ekrana basılan metinden değil.

## Maliyet

Kabaca, `retry-backoff` için:

| Koşu | Yaklaşık |
|---|---|
| Tek üretim | $0.06 |
| Audit gate'li üretim | $0.32 – $0.70 |
| 2x2 matris (2 üretim + 4 denetim) | $0.93 |

Deney koşuları gerçek para harcar. `--audit` özellikle pahalı: denetim
turları üretimin kendisinden ~9 kat pahalıya çıktı.

## Windows notu

Kod Windows'ta çalışacak şekilde yazıldı ve Windows'ta koşularak düzeltildi:

- Süreç ağacı `taskkill /T` ile yıkılıyor (POSIX'te süreç grubu sinyali).
- `npx` gibi `.cmd` sarmalayıcıları `cross-spawn` ile çözülüyor.
- Testlerdeki sahte CLI'lar `sh` script'i değil, Node script'i + platforma
  uygun ince başlatıcı (`src/testing/fake-cli.ts`).
- `entry` yolları POSIX ayracına normalleştiriliyor: aynı `task.yaml` her
  platformda ajana aynı talimatı vermeli, yoksa koşular karşılaştırılamaz.

Bir şey patlarsa `src/proc/process.ts` ilk bakılacak yer.
