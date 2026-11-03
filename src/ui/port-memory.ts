import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Son kullanılan dinleme portu nereye yazılıyor.
 *
 * `.skein/` altında — kuyruk da orada ve gözcünün kilidi de. Bu dosya
 * İKİSİNİN de parçası değil: yalnızca ekranın "önceki açılışta neredeydim"
 * hafızası, bozulması hiçbir yazma yolunu kilitlemez (bkz. `sonPortuOku`).
 */
const DOSYA_ADI = "ekran.json";

/** `port` alanı makul bir TCP portu mu — 0 ayrılmamış, 65535 üst sınır. */
function gecerliPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 65535;
}

/**
 * `.skein/ekran.json`'dan son kullanılan portu okur.
 *
 * Dosya yoksa, okunamıyorsa ya da içeriği bozuksa (geçersiz JSON, eksik ya
 * da yanlış tipte `port` alanı) `undefined` döner — FIRLATMAZ. Kart bunu
 * açıkça istiyor: "bozuk bir yardımcı kayıt aracı kilitlemez" kuralı
 * `card/queue.ts`'teki `#scan`/`bozuklar()` ayrımının aynısı, burada da
 * geçerli. Hatırlanan port yalnızca bir İPUCU; kaybı turu durdurmaz, ekran
 * boş bir port seçerek açılmaya devam eder.
 */
export async function sonPortuOku(root: string): Promise<number | undefined> {
  let text: string;
  try {
    text = await readFile(join(root, ".skein", DOSYA_ADI), "utf8");
  } catch {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== "object") return undefined;
    const port = (value as Record<string, unknown>)["port"];
    return gecerliPort(port) ? port : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Kullanılan portu `.skein/ekran.json`'a kalıcı yazar.
 *
 * tmp+rename ile atomik — `card/queue.ts`'teki kart yazma disipliniyle
 * aynı: yarım yazılmış bir dosya, bir sonraki açılışın `sonPortuOku`'sunda
 * "bozuk" sayılıp sessizce yok sayılır, ama yarım dosyanın KENDİSİ hiç
 * görünmez.
 */
export async function sonPortuYaz(root: string, port: number): Promise<void> {
  const dir = join(root, ".skein");
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.tmp-${randomBytes(6).toString("hex")}`);
  await writeFile(tmp, JSON.stringify({ port }), "utf8");
  await rename(tmp, join(dir, DOSYA_ADI));
}

/** `EADDRINUSE` mi — başka biri o portu tutuyor demek. */
function portDolu(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "EADDRINUSE";
}

/**
 * Portu hatırlayarak açar.
 *
 * Üç yol:
 *
 * 1. `explicitPort` verildi (`--port`) → AÇIK İSTEK, hatırlanan port hiç
 *    okunmuyor bile. Sonuç yine kaydediliyor: açık istek hatırlanan kaydı
 *    EZİYOR, bir sonraki açılış artık bunu dener — kart bunu açıkça istiyor.
 * 2. `explicitPort` yok, hatırlanan port VAR → önce o denenir. Boşsa
 *    (`EADDRINUSE`) sessizce boş bir porta düşülür — ekranın açılması
 *    hatırlanan portun o anki durumuna bağlı olamaz. Başka türlü bir hata
 *    (izin, geçersiz ana bilgisayar adı) OLDUĞU GİBİ fırlatılır: bu hafıza
 *    özelliğinin örtmesi gereken tek şey "port dolu", başka hiçbir şey değil.
 * 3. Hiçbiri yok (ilk açılış, ya da hafıza bozuk/okunamaz) → boş port.
 *
 * `ac` enjekte ediliyor: çağıran taraf gerçek `serveUi`'yi verir, sınama
 * sahte bir fonksiyon vererek "dolu port" senaryosunu GERÇEK bir soket
 * açmadan üretir.
 */
export async function portuHatirlayarakAc<T extends { port: number }>(
  root: string,
  explicitPort: number | undefined,
  ac: (port: number | undefined) => Promise<T>,
): Promise<T> {
  if (explicitPort !== undefined) {
    const sonuc = await ac(explicitPort);
    await sonPortuYaz(root, sonuc.port);
    return sonuc;
  }

  const hatirlanan = await sonPortuOku(root);
  if (hatirlanan !== undefined) {
    try {
      const sonuc = await ac(hatirlanan);
      await sonPortuYaz(root, sonuc.port);
      return sonuc;
    } catch (error) {
      if (!portDolu(error)) throw error;
      // Düş: boş port seç.
    }
  }

  const sonuc = await ac(undefined);
  await sonPortuYaz(root, sonuc.port);
  return sonuc;
}
