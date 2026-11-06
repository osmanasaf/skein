import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Son kullanılan dinleme portu VE son açılan akışın adı nereye yazılıyor.
 *
 * `.skein/` altında — kuyruk da orada ve gözcünün kilidi de. Bu dosya
 * İKİSİNİN de parçası değil: yalnızca ekranın "önceki açılışta neredeydim"
 * hafızası, bozulması hiçbir yazma yolunu kilitlemez (bkz. `sonPortuOku`,
 * `sonAkisiOku`).
 *
 * İki alan (`port`, `akis`) AYNI dosyada ve okuma/yazma BİRBİRİNİ EZMİYOR:
 * her yazma önce mevcut kaydı okuyup yalnızca kendi alanını değiştiriyor
 * (bkz. `hamKaydiYaz`). Bu olmasa `sonPortuYaz` sonra gelen bir `sonAkisiYaz`
 * portu, ya da tersi, SESSİZCE silerdi.
 */
const FILE_NAME = "ekran.json";

/** `port` alanı makul bir TCP portu mu — 0 ayrılmamış, 65535 üst sınır. */
function validPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 65535;
}

/** Üç hâlden biri — "sistem" (OS tercihini izle), "acik", "koyu". */
export type Theme = "sistem" | "acik" | "koyu";

/** `tema` alanı üç geçerli değerden biri mi. */
function validTheme(value: unknown): value is Theme {
  return value === "sistem" || value === "acik" || value === "koyu";
}

/**
 * Ham kaydı okur — dosya yoksa, okunamıyorsa ya da kök öğe bir eşleme
 * (mapping) değilse boş nesne döner, FIRLATMAZ.
 *
 * Her iki alanın (`port`, `akis`) okuyucusu da BURADAN geçiyor: "bozuk
 * dosya kilitlemez" kuralının tek yeri, ikisi için ayrı ayrı yazılmıyor.
 */
async function readRawRecord(root: string): Promise<Record<string, unknown>> {
  let text: string;
  try {
    text = await readFile(join(root, ".skein", FILE_NAME), "utf8");
  } catch {
    return {};
  }
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
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
export async function readLastPort(root: string): Promise<number | undefined> {
  const port = (await readRawRecord(root))["port"];
  return validPort(port) ? port : undefined;
}

/**
 * `.skein/ekran.json`'dan son açılan akışın adını okur.
 *
 * Aynı "bozuk kayıt kilitlemez" kuralı: dosya yoksa, bozuksa ya da `akis`
 * alanı boş/yanlış tipteyse `undefined` döner — FIRLATMAZ. Çağıran taraf
 * (ekranın varsayılan akış seçimi, `ui/cli.ts`) bunu yalnızca bir İPUCU
 * sayıyor: adı dönse bile o akış artık diskte olmayabilir ya da bozuk
 * olabilir, bu fonksiyon o denetimi YAPMIYOR — "var mı, geçerli mi" sorusu
 * çağıranın işi.
 */
export async function readLastFlow(root: string): Promise<string | undefined> {
  const akis = (await readRawRecord(root))["akis"];
  return typeof akis === "string" && akis.trim() !== "" ? akis : undefined;
}

/**
 * `.skein/ekran.json`'dan hatırlanan tema seçimini okur.
 *
 * Aynı "bozuk kayıt kilitlemez" kuralı: dosya yoksa, bozuksa ya da `tema`
 * alanı üç geçerli değerden biri değilse `undefined` döner — FIRLATMAZ.
 * Çağıran taraf (`serveUi`, `GET /`) `undefined`'ı "sistem" sayar: hiç
 * seçim yapılmamış ekranla açıkça "sistem" seçmiş ekran GÖRÜNÜRDE aynı
 * davranır (ikisi de OS tercihini izler), bu yüzden ayrı bir "hiç
 * seçilmedi" durumu YOK.
 */
export async function readLastTheme(root: string): Promise<Theme | undefined> {
  const tema = (await readRawRecord(root))["tema"];
  return validTheme(tema) ? tema : undefined;
}

/**
 * Kaydın TEK bir alanını değiştirip atomik yazar — ötekisi (port/akış)
 * AYNEN kalır.
 *
 * Önce mevcut kaydı okuyup üstüne yazıyoruz (merge): `sonPortuYaz` ve
 * `sonAkisiYaz` aynı dosyaya BAĞIMSIZ yazıyor gibi görünse de, biri ötekini
 * ezebilirdi — bu fonksiyon o riski kapatıyor. Yazma yine tmp+rename ile
 * atomik: `card/queue.ts`'teki kart yazma disipliniyle aynı, yarım yazılmış
 * bir dosya bir sonraki okumada "bozuk" sayılıp yok sayılır.
 */
async function writeRawRecord(root: string, field: string, deger: unknown): Promise<void> {
  const dir = join(root, ".skein");
  await mkdir(dir, { recursive: true });
  const mevcut = await readRawRecord(root);
  const fresh = { ...mevcut, [field]: deger };
  const tmp = join(dir, `.tmp-${randomBytes(6).toString("hex")}`);
  await writeFile(tmp, JSON.stringify(fresh), "utf8");
  await rename(tmp, join(dir, FILE_NAME));
}

/**
 * Kullanılan portu `.skein/ekran.json`'a kalıcı yazar.
 *
 * `akis` alanı AYNEN kalır (bkz. `hamKaydiYaz`) — port hatırlama ile akış
 * hatırlama birbirinden bağımsız iki özellik, biri ötekini silmemeli.
 */
export async function writeLastPort(root: string, port: number): Promise<void> {
  await writeRawRecord(root, "port", port);
}

/**
 * Son açılan akışın adını `.skein/ekran.json`'a kalıcı yazar.
 *
 * Ekrandaki seçiciden akış değiştirmek de bunu çağırmalı (bkz.
 * `ui/cli.ts`'teki `akisSecimi.ac`) — yoksa "son açılan" yalan olurdu:
 * seçiciyle değiştirilen akış ekranda görünür ama bir sonraki `npm start`
 * hâlâ eski kaydı okurdu.
 */
export async function writeLastFlow(root: string, akis: string): Promise<void> {
  await writeRawRecord(root, "akis", akis);
}

/**
 * Seçilen temayı `.skein/ekran.json`'a kalıcı yazar.
 *
 * `port`/`akis` alanları AYNEN kalır (bkz. `hamKaydiYaz`) — üçü birbirinden
 * bağımsız, biri ötekini silmemeli. Ekrandaki tema anahtarı (`POST /tema`,
 * `server.ts`) bunu çağırıyor; sayfa yenilenince `GET /` aynı dosyadan
 * okuyup `renderPage`'e veriyor (kart c-20261106-e62847).
 */
export async function writeLastTheme(root: string, tema: Theme): Promise<void> {
  await writeRawRecord(root, "tema", tema);
}

/** `EADDRINUSE` mi — başka biri o portu tutuyor demek. */
function portBusy(error: unknown): boolean {
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
export async function openRememberingPort<T extends { port: number }>(
  root: string,
  explicitPort: number | undefined,
  open: (port: number | undefined) => Promise<T>,
): Promise<T> {
  if (explicitPort !== undefined) {
    const result = await open(explicitPort);
    await writeLastPort(root, result.port);
    return result;
  }

  const remembered = await readLastPort(root);
  if (remembered !== undefined) {
    try {
      const result = await open(remembered);
      await writeLastPort(root, result.port);
      return result;
    } catch (error) {
      if (!portBusy(error)) throw error;
      // Düş: boş port seç.
    }
  }

  const result = await open(undefined);
  await writeLastPort(root, result.port);
  return result;
}
