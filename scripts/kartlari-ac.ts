/**
 * `scripts/kartlar-<tarih>.json` içindeki kartları kuyruğa açar.
 *
 * NİYE BETİK VAR: kartlar `.skein/` altında yaşıyor ve `.skein/` gitignore'da
 * — yani kart açmak DEPOYA yazmaz. 2026-11-10'daki üç kusur bir konteynerde
 * kart olarak açıldı ve o konteynerle birlikte kaybolacak. Başka bir makinede
 * aynı kartları açmanın tek yolu iş metinlerini yeniden girmek; metinler
 * JSON'da duruyor, bu betik onları kuyruğa veriyor.
 *
 * Kullanım:
 *   npx tsx scripts/kartlari-ac.ts scripts/kartlar-2026-11-10.json --plan
 *   npx tsx scripts/kartlari-ac.ts scripts/kartlar-2026-11-10.json
 *   npx tsx scripts/kartlari-ac.ts scripts/kartlar-2026-11-10.json --sadece 3
 *
 * `--plan` hiçbir kart açmaz, yalnızca ne açılacağını yazar. Varsayılan
 * DEĞİL çünkü kart açmak ucuz ve geri alınabilir; ama koşmadan önce ne
 * açacağını görmek isteyeceksin.
 *
 * `--sadece <n>` (1'den başlar, virgülle birden fazla: `--sadece 3,1`)
 * yalnızca o kartları açar, VERİLDİĞİ SIRAYLA. Kuyruk FIFO olduğu için
 * açılış sırası koşma sırasıdır: bu dosyadaki 3. kart (işin operatörün
 * ağacına dönmemesi) diğer ikisinin düzeltmesini güvenceye alan bildirimi
 * getiriyor, o yüzden önce o koşsun istiyorsan `--sadece 3` ile başla.
 *
 * İKİ KEZ KOŞTURMA: kuyruk aynı başlıkla ikinci bir kart açar ve iki ajan
 * aynı işi yapar. Önce `npx tsx src/card/cli.ts ls` ile bak.
 */
import { readFileSync } from "node:fs";
import spawn from "cross-spawn";

interface CardSpec {
  readonly flow: string;
  readonly title: string;
  readonly task: string;
}

/**
 * Dosyayı okur ve ŞEKLİNİ doğrular.
 *
 * Doğrulama var çünkü eksik alan sessizce geçerse kart CLI'ı `undefined`
 * başlıkla çağrılır ve kuyrukta adsız bir kart oluşur. Hangi kartın hangi
 * alanı eksik olduğunu burada söylemek, orada "bilinmeyen hata" okumaktan
 * ucuz.
 */
function loadSpecs(path: string): CardSpec[] {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) throw new Error(`${path}: en üst düzey bir dizi olmalı`);
  return raw.map((item, i) => {
    const where = `${path}[${String(i)}]`;
    if (typeof item !== "object" || item === null) throw new Error(`${where}: nesne olmalı`);
    const rec = item as Record<string, unknown>;
    for (const key of ["flow", "title", "task"]) {
      const value = rec[key];
      if (typeof value !== "string" || value.trim() === "")
        throw new Error(`${where}.${key}: boş olmayan bir metin olmalı`);
    }
    return { flow: rec["flow"] as string, title: rec["title"] as string, task: rec["task"] as string };
  });
}

const args = process.argv.slice(2);
const plan = args.includes("--plan");
const onlyAt = args.indexOf("--sadece");
const onlyRaw = onlyAt === -1 ? undefined : args[onlyAt + 1];
// `onlyAt === -1` iken `onlyAt + 1` SIFIR olur ve ilk konumsal argümanı —
// yani dosya yolunu — atardı: `--sadece` vermeyen her çağrı "kullanım"
// basıp çıkıyordu. Bayrak yoksa atlanacak indeks de YOKTUR.
const skipIndex = onlyAt === -1 ? -1 : onlyAt + 1;
const positional = args.filter((a, i) => !a.startsWith("--") && i !== skipIndex);
const path = positional[0];

if (path === undefined) {
  console.error(
    "Kullanım: npx tsx scripts/kartlari-ac.ts <kartlar.json> [--plan] [--sadece 3,1]",
  );
  process.exit(2);
}

const all = loadSpecs(path);

/**
 * `--sadece` sırayı KORUR: verilen numara dizilimi açılış dizilimidir.
 * Sıralamak bu seçeneğin tek işini bozardı — kuyruk FIFO olduğu için
 * açılış sırası koşma sırası demek.
 */
function pick(raw: string | undefined): CardSpec[] {
  if (raw === undefined) return all;
  const picked: CardSpec[] = [];
  for (const part of raw.split(",")) {
    const n = Number(part.trim());
    if (!Number.isInteger(n) || n < 1 || n > all.length) {
      console.error(`✗ --sadece: "${part.trim()}" geçerli bir kart numarası değil (1..${String(all.length)})`);
      process.exit(2);
    }
    picked.push(all[n - 1] as CardSpec);
  }
  return picked;
}

const specs = pick(onlyRaw);
if (onlyRaw !== undefined) {
  console.log(`--sadece ${onlyRaw}: ${String(all.length)} karttan ${String(specs.length)} tanesi`);
}

for (const [i, spec] of specs.entries()) {
  const no = `${String(i + 1)}/${String(specs.length)}`;
  console.log(`\n--- ${no} --- ${spec.title}`);
  console.log(`    akış: ${spec.flow} · iş metni ${String(spec.task.split("\n").length)} satır`);
  if (plan) continue;

  // cross-spawn: Windows'ta `npx` bir .cmd dosyası ve düz `spawn` onu
  // bulamıyor. Depo bunu zaten biliyor (src/proc/process.ts aynı sebeple
  // spawnPortable yazıyor); burada senkron sürümü yeterli.
  const run = spawn.sync("npx", ["tsx", "src/card/cli.ts", "new", spec.flow, spec.title, spec.task], {
    stdio: "inherit",
  });
  if (run.status !== 0) {
    console.error(`\n✗ ${no} açılamadı (çıkış ${String(run.status)}). KALANLAR AÇILMADI.`);
    console.error("  Açılanları görmek için: npx tsx src/card/cli.ts ls");
    process.exit(1);
  }
}

console.log(plan ? "\n--plan: hiçbir kart açılmadı." : `\n${String(specs.length)} kart açıldı.`);
