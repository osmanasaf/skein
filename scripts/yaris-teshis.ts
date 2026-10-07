/**
 * TEŞHİS: `CardQueue.take` sahiplenmesi bu platformda gerçekten dışlayıcı mı?
 *
 * Kuyruğun tek güvencesi şu: iki koşucu aynı kartı görse bile yalnızca biri
 * `rename` edebilir, kaybeden ENOENT alır. POSIX'te 450 turluk zorlamada bir
 * kez bile kırılmadı. Windows'ta `npm test` bir koşuda "ikisi de kart aldı"
 * dedi — yani ya yarış gerçek, ya kurgu farklı.
 *
 * Bu betik tahmin etmiyor, ölçüyor. İki parça:
 *
 *   1. VARSAYIM: tasarımın dayandığı rename davranışı. Kaynak taşındıktan
 *      sonra aynı rename ENOENT vermeli. Vermiyorsa sahiplenme mekanizması
 *      bu platformda baştan geçersiz.
 *   2. ZORLAMA: tek kartlı taze kuyrukta iki eşzamanlı `take`, N tur.
 *      Sonuçlar sınıflanıyor; "ikisi de kart aldı" ikiye ayrılıyor —
 *      AYNI kimlik (çekirdekte yarış) ve AYRI kimlik (kuyruk kurgusu).
 *
 * Kullanım:  npx tsx scripts/yaris-teshis.ts [tur-sayısı]
 * Ajan çağırmaz, para harcamaz.
 */
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newCard } from "../src/card/card.js";
import { CardQueue } from "../src/card/queue.js";
import { knownProviderSet } from "../src/adapters/factory.js";
import { loadFlow } from "../src/flow/load.js";
import { snapshot } from "../src/flow/snapshot.js";

const REPO = join(import.meta.dirname, "..");
const TUR = Number(process.argv[2] ?? 200);

console.log(`platform : ${process.platform} · node ${process.version}`);
console.log(`tur      : ${TUR}\n`);

// ── 1. VARSAYIM ───────────────────────────────────────────────────────────
{
  const dir = await mkdtemp(join(tmpdir(), "yaris-varsayim-"));
  const a = join(dir, "a.json");
  const b = join(dir, "b.json");
  await writeFile(a, "{}");
  await rename(a, b);
  let kod = "(hata atmadı)";
  try {
    await rename(a, b);
  } catch (e) {
    kod = (e as NodeJS.ErrnoException).code ?? String(e);
  }
  const tamam = kod === "ENOENT";
  console.log(`VARSAYIM  taşınmış kaynağı yeniden rename → ${kod}  ${tamam ? "✓" : "✗ SAHİPLENME GEÇERSİZ"}`);
  if (!tamam) {
    console.log("          Kuyruğun dışlayıcılığı bu davranışa dayanıyor; burada tutmuyor.");
  }
  await rm(dir, { recursive: true, force: true });
}

// ── 2. ZORLAMA ────────────────────────────────────────────────────────────
const topology = snapshot(
  await loadFlow(join(REPO, "hub/flows/daily.yaml"), { root: REPO, providers: knownProviderSet() }),
  REPO,
);

let tekKart = 0;
let ayniKimlik = 0;
let ayriKimlik = 0;
let ikisiNull = 0;
let firlatan = 0;
let ornek = "";

for (let i = 0; i < TUR; i += 1) {
  const root = await mkdtemp(join(tmpdir(), "yaris-"));
  const q = new CardQueue(join(root, ".skein"));
  await q.init();
  const card = newCard({ title: "iş", task: "bir şey", topology });
  await q.add(card);
  try {
    const sonuc = await Promise.all([q.take("coder"), q.take("coder")]);
    const alinan = sonuc.filter((c) => c !== null);
    if (alinan.length === 1) tekKart += 1;
    else if (alinan.length === 0) ikisiNull += 1;
    else {
      const kimlikler = alinan.map((c) => c?.id);
      if (new Set(kimlikler).size === 1) {
        ayniKimlik += 1;
        if (ornek === "") ornek = `AYNI kimlik iki kez: ${kimlikler[0]}`;
      } else {
        ayriKimlik += 1;
        if (ornek === "") ornek = `AYRI kimlikler: ${kimlikler.join(", ")}`;
      }
    }
  } catch (e) {
    firlatan += 1;
    if (ornek === "") ornek = `fırlattı: ${(e as Error).message.slice(0, 120)}`;
  }
  await rm(root, { recursive: true, force: true });
}

console.log(`\nZORLAMA   ${TUR} turda:`);
console.log(`  tam bir kart          : ${tekKart}`);
console.log(`  İKİSİ DE — aynı kimlik: ${ayniKimlik}   ${ayniKimlik > 0 ? "← ÇEKİRDEKTE YARIŞ" : ""}`);
console.log(`  İKİSİ DE — ayrı kimlik: ${ayriKimlik}   ${ayriKimlik > 0 ? "← kuyruk kurgusu bozuk" : ""}`);
console.log(`  ikisi de null         : ${ikisiNull}`);
console.log(`  fırlattı              : ${firlatan}`);
if (ornek !== "") console.log(`\n  ilk örnek: ${ornek}`);
