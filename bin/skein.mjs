#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Bu betik salt bir ÖNYÜKLEYİCİ — `package.json`daki `bin` girdisi `skein`
// komutunu buraya bağlıyor, asıl iş gerçek ekrana (`src/ui/cli.ts`)
// devrediliyor. Depo TypeScript'i derlemeden dağıtıyor, o yüzden `tsx`
// burada elle çağrılıyor: `node_modules/tsx/dist/cli.mjs`'e DOĞRUDAN
// gidiliyor, "npx tsx" gibi PATH'e bağımlı bir ara adım eklenmiyor — bu
// depodaki gözcü başlatma koduyla (bkz. `src/proc/process.ts`,
// `tsxCliYolu`) aynı desen. Bu dosya TypeScript DEĞİL (henüz `tsx`
// çağrılmadan koşuyor), o yüzden o yardımcıyı import EDEMİYORUZ — aynı
// çözümleme burada küçük ve bağımsız tekrarlanıyor.
//
// ELLE `join(kok, "node_modules", ...)` DEĞİL: `kok`un KENDİ
// `node_modules`'ü olmayabilir (ör. `git worktree add` ile açılmış bir
// çalışma ağacı — paketler ana depoda kalır). Node'un kendi modül
// çözümlemesi (`createRequire(...).resolve`) ÜST dizinlere doğru arar,
// tam `npx tsx`in yaptığı gibi.
const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const tsxPaketYolu = createRequire(join(kok, "package.json")).resolve("tsx/package.json");
const tsx = join(dirname(tsxPaketYolu), "dist", "cli.mjs");
const ekran = join(kok, "src", "ui", "cli.ts");

const sonuc = spawnSync(process.execPath, [tsx, ekran, ...process.argv.slice(2)], {
  stdio: "inherit",
});
// `status` sinyalle ölürse `null` olur; sinyal bilgisini kaybetmemek çıkış
// kodunu 1 yapmaktan daha doğru olurdu ama shell'ler zaten bunu 128+n'e
// çeviriyor — burada basit tutuluyor, çocuk zaten kendi Ctrl-C işleyicisini
// taşıyor (`src/ui/cli.ts`, SIGINT/SIGTERM).
process.exit(sonuc.status ?? 1);
