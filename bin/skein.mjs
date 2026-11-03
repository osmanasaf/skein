#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Bu betik salt bir ÖNYÜKLEYİCİ — `package.json`daki `bin` girdisi `skein`
// komutunu buraya bağlıyor, asıl iş gerçek ekrana (`src/ui/cli.ts`)
// devrediliyor. Depo TypeScript'i derlemeden dağıtıyor, o yüzden `tsx`
// burada elle çağrılıyor: `node_modules/tsx/dist/cli.mjs`'e DOĞRUDAN
// gidiliyor, "npx tsx" gibi PATH'e bağımlı bir ara adım eklenmiyor — bu
// depodaki gözcü başlatma koduyla (bkz. `src/ui/cli.ts`, `gercekSpawn`)
// aynı desen.
const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const tsx = join(kok, "node_modules", "tsx", "dist", "cli.mjs");
const ekran = join(kok, "src", "ui", "cli.ts");

const sonuc = spawnSync(process.execPath, [tsx, ekran, ...process.argv.slice(2)], {
  stdio: "inherit",
});
// `status` sinyalle ölürse `null` olur; sinyal bilgisini kaybetmemek çıkış
// kodunu 1 yapmaktan daha doğru olurdu ama shell'ler zaten bunu 128+n'e
// çeviriyor — burada basit tutuluyor, çocuk zaten kendi Ctrl-C işleyicisini
// taşıyor (`src/ui/cli.ts`, SIGINT/SIGTERM).
process.exit(sonuc.status ?? 1);
