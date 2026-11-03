import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { knownProviderSet } from "../adapters/factory.js";
import { newCard } from "../card/card.js";
import { CardQueue } from "../card/queue.js";
import { al } from "../testing/queue.js";
import { loadFlow } from "../flow/load.js";
import { LiveFlow } from "../flow/live.js";
import { snapshot, type TopologySnapshot } from "../flow/snapshot.js";
import { acquireLock } from "../watch/lock.js";
import { serveUi, type UiServer } from "./server.js";

/**
 * EKRANI GERÇEK TARAYICIDA KOŞTURAN SINAMALAR.
 *
 * Niye var: 3 Kasım'da önyüze kart açma ve gözcü yönetimi eklenirken ÜÇ
 * kusur çıktı ve ÜÇÜ DE birim sınamalardan geçiyordu —
 *
 *   1. "Gözcüyü durdur" hiçbir şeyi durdurmuyordu (sinyal torun sürece
 *      ulaşmıyordu),
 *   2. durdurma anlık değilken ekran "durdurdum" diyordu,
 *   3. bayat kilitte düğme "durdur" diyordu, oysa basınca çalışmıyordu.
 *
 * Üçü de yalnızca sayfayı GERÇEKTEN açınca göründü. `page.test.ts` gömülü
 * betiğin KAYNAK METNİNİ sınıyor; ölü bir dalı ya da yanlış bir etiketi
 * göremez. Bu dosya o boşluğu kapatıyor ve asıl değeri şu: ajanlar
 * `npx vitest run` koşuyor, yani arayüz işini onlara verdiğimizde
 * doğrulama döngüleri artık tarayıcıyı da kapsıyor.
 *
 * PLAYWRIGHT YOKSA SESSİZ GEÇMİYOR. Kurulu olmayan bir makinede sınamalar
 * atlanıyor ama sebebi BAĞIRARAK yazılıyor: "atlandı" ile "geçti" aynı
 * şey değil ve bu depoda sessiz atlama ayrı bir kusur sayılıyor
 * (BİLDİRİLMEYEN SIFIR DEĞİLDİR).
 */
const FLOW = `
name: test
constitution:
  - ../prompts/base.md
roles:
  - id: coder
    provider: claude
    workspace: main
    prompt: ../../roles/coder.prompt
    next: done
`;

/**
 * `page.evaluate` gövdesi TARAYICIDA koşuyor, Node'da değil.
 *
 * Projenin `lib`'ine `dom` eklemek, `document`'ı Node dosyalarında da
 * çözünür yapardı — sunucu kodunda tarayıcı API'si yazmanın sessizce
 * derlenmesi, kaçınmak istediğimiz tam o. Bu yüzden yalnızca bu dosyada,
 * ihtiyaç duyulan kadarı bildiriliyor.
 */
/**
 * Tek bir DOM düğümü için gereken kadarı — recursive: `.querySelector` kendi
 * tipini döndürüyor, "sütun içinde boş kutuyu bul" gibi İÇ İÇE aramalar için
 * (bkz. boş durum sınamaları).
 */
type El = {
  textContent: string | null;
  style: { display: string };
  classList: { contains: (c: string) => boolean };
  /** Yalnızca `<details>` öğesinde var — bkz. kapı gerekçesi sınaması. */
  open?: boolean;
  /** Kuş işaretinin `d`/`stroke` özniteliklerini ve kimlik sınamasının
   * işaretleyici özniteliğini okumak/yazmak için. */
  getAttribute: (ad: string) => string | null;
  setAttribute: (ad: string, deger: string) => void;
  querySelector: (s: string) => El | null;
  /** Yalnızca zincir okunun sütunları GERÇEKTEN alt alta mı sınaması için. */
  getBoundingClientRect: () => { top: number; left: number };
};
declare const document: {
  querySelector: (s: string) => El | null;
  querySelectorAll: (s: string) => ArrayLike<El>;
  body: unknown;
};
/**
 * Zemin rengi, dönüş, kuş işaretinin GERÇEK rengi (currentColor'ın çözüldüğü
 * `color`) ve devir animasyonunun adı için — gökyüzü paleti, zincir okunun
 * yönü, kuş işareti ve devir hareketi sınamalarının ihtiyacı kadar.
 */
declare function getComputedStyle(
  el: unknown,
): { backgroundColor: string; transform: string; color: string; animationName: string };

type Tarayici = { newPage: (o?: unknown) => Promise<Sayfa>; close: () => Promise<void> };
type Sayfa = {
  goto: (url: string, o?: unknown) => Promise<unknown>;
  waitForSelector: (s: string, o?: unknown) => Promise<unknown>;
  waitForTimeout: (ms: number) => Promise<void>;
  click: (s: string) => Promise<void>;
  fill: (s: string, v: string) => Promise<void>;
  selectOption: (s: string, v: string) => Promise<unknown>;
  textContent: (s: string) => Promise<string | null>;
  evaluate: <T>(fn: () => T) => Promise<T>;
  on: (ev: string, cb: (e: unknown) => void) => void;
  close: () => Promise<void>;
};

/**
 * Playwright MODUL KAPSAMINDA yoklanıyor, `beforeAll`'da değil.
 *
 * `skipIf` toplama anında karar veriyor; `beforeAll` o anda henüz
 * koşmamış olurdu ve sınamalar "browser null" diye DÜŞERDİ (ilk yazımda
 * tam olarak bu oldu). Modul adı değişkende: `playwright` bu projede
 * bağımlılık DEĞİL, ortamda varsa kullanılıyor — sabit bir `import`
 * yazarsak `tsc` çözümleyemez.
 */
type Chromium = { launch: (o?: unknown) => Promise<Tarayici> };

/**
 * `createRequire` kullanılıyor, düz `import` değil.
 *
 * Playwright bu projenin bağımlılığı DEĞİL: ortamda varsa kullanılıyor.
 * ESM `import` NODE_PATH'i yok sayıyor, yani küresel kurulumu bulamıyor
 * (ölçüldü: ERR_MODULE_NOT_FOUND, oysa aynı paket `require` ile
 * bulunuyordu). `createRequire` ikisini de karşılıyor — hem küresel
 * kurulumu, hem `npm i -D playwright` ile yerele kurulmuş hâlini.
 */
const yukle = createRequire(import.meta.url);
let pwChromium: Chromium | null = null;
try {
  pwChromium = (yukle("playwright") as { chromium: Chromium }).chromium;
} catch {
  pwChromium = null;
}

if (pwChromium === null) {
  // SESLİ atlama: "atlandı" ile "geçti" aynı şey değil ve bu depoda
  // sessiz atlama ayrı bir kusur (BİLDİRİLMEYEN SIFIR DEĞİLDİR).
  console.warn(
    "\n⚠ TARAYICI SINAMALARI ATLANDI — playwright kurulu değil.\n" +
    "  Önyüzün gerçekten çizildiği, düğmelerin doğru etiketi taşıdığı ve\n" +
    "  uçların uçtan uca çalıştığı BU KOŞUDA DOĞRULANMADI.\n" +
    "  Kurmak için: npm i -D playwright && npx playwright install chromium\n",
  );
}

let browser: Tarayici | null = null;

beforeAll(async () => {
  if (pwChromium !== null) browser = await pwChromium.launch({ args: ["--no-sandbox"] });
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

let root: string;
let queue: CardQueue;
let topology: TopologySnapshot;
let server: UiServer;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-tarayici-"));
  await mkdir(join(root, "hub", "flows"), { recursive: true });
  await mkdir(join(root, "hub", "prompts"), { recursive: true });
  await mkdir(join(root, "roles"), { recursive: true });
  await writeFile(join(root, "hub", "prompts", "base.md"), "# Anayasa\n");
  await writeFile(join(root, "roles", "coder.prompt"), "# coder\n");
  await writeFile(join(root, "hub", "flows", "test.yaml"), FLOW);

  queue = new CardQueue(join(root, ".skein"));
  await queue.init();
  const flow = await loadFlow(join(root, "hub", "flows", "test.yaml"), {
    root, providers: knownProviderSet(),
  });
  topology = snapshot(flow, root);
  server = await serveUi({
    root, queue, topology, flowName: flow.name, flowHash: flow.hash,
  });
});

afterEach(async () => {
  await server.close();
  await rm(root, { recursive: true, force: true });
});

/** Sayfayı açar ve sayfa hatalarını toplar. */
async function ac(): Promise<{ page: Sayfa; hatalar: string[] }> {
  const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
  const hatalar: string[] = [];
  page.on("pageerror", (e) => hatalar.push(String(e)));
  await page.goto(server.url, { waitUntil: "networkidle" });
  return { page, hatalar };
}

/**
 * Sayfayı BELİRLİ bir renk şemasıyla açar ve konsol hatalarını da toplar.
 *
 * "Gökyüzü paleti" kartı iki temayı da (açık/koyu) ölçülebilir kılmayı
 * istiyor; `prefers-color-scheme` test makinesinin ayarına bağlı kalırsa
 * hangi temanın koştuğu BELİRSİZ olur. Playwright'a şemayı açıkça
 * vererek bu belirsizliği kaldırıyoruz.
 */
async function acTema(sema: "light" | "dark"): Promise<{ page: Sayfa; hatalar: string[] }> {
  const page = await (browser as Tarayici).newPage({
    viewport: { width: 1280, height: 900 },
    colorScheme: sema,
  });
  const hatalar: string[] = [];
  page.on("pageerror", (e) => hatalar.push(String(e)));
  // KONSOL HATASI YOK iddiası page error'dan AYRI: bir `console.error`
  // çağrısı sayfayı çökertmez ama sessizce yutulan bir kusur olurdu.
  page.on("console", (m) => {
    const mesaj = m as { type?: () => string; text?: () => string };
    if (mesaj.type && mesaj.type() === "error") {
      hatalar.push("konsol: " + (mesaj.text ? mesaj.text() : String(m)));
    }
  });
  await page.goto(server.url, { waitUntil: "networkidle" });
  return { page, hatalar };
}

/**
 * Sayfayı BELİRLİ bir `prefers-reduced-motion` tercihiyle açar.
 *
 * Devir hareketinin EN ÖNEMLİ kısıtı bu tercihle çöküyor — Playwright'ın
 * `reducedMotion` seçeneği `matchMedia` sorgusunu gerçekten bağlıyor (ölçüldü:
 * `page.evaluate(() => matchMedia(...).matches)` ile doğrulandı), yani burada
 * CSS'i KAYNAK METİNDEN değil tarayıcının GERÇEKTEN uyguladığı hesaplanmış
 * stilden okuyoruz.
 */
async function acHareket(hareket: "reduce" | "no-preference"): Promise<{ page: Sayfa; hatalar: string[] }> {
  const page = await (browser as Tarayici).newPage({
    viewport: { width: 1280, height: 900 },
    reducedMotion: hareket,
  });
  const hatalar: string[] = [];
  page.on("pageerror", (e) => hatalar.push(String(e)));
  await page.goto(server.url, { waitUntil: "networkidle" });
  return { page, hatalar };
}

describe.skipIf(pwChromium === null)("ekran — gerçek tarayıcı", () => {
  it("sayfa çiziliyor ve betik hata vermiyor", async () => {
    const { page, hatalar } = await ac();
    try {
      await page.waitForSelector("#bar .pill", { timeout: 15_000 });
      // İddia "bir sütun var" DEĞİL, "pano ZİNCİRİ gösteriyor".
      //
      // İlk yazımda `.col` sayısının sıfırdan büyük olmasına bakıyordum ve
      // "sütunları hiç çizme" mutasyonu hayatta kaldı: `.col` başka bir
      // yerde de üretiliyor, yani sayı hep pozitifti. Isırmayan bir iddia,
      // bu depoda kusurun kendisi sayılıyor.
      const basliklar = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".col .colhead")).map((e) => e.textContent ?? ""));
      // Akışta tek rol var (`coder`), zincirin sonu `bitti`.
      expect(basliklar).toHaveLength(2);
      expect(basliklar[0]).toContain("coder");
      expect(basliklar[1]).toContain("bitti");
      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  /**
   * GÖKYÜZÜ PALETİ — hesaplanan zemin rengi ve konsol temiz.
   *
   * `page.test.ts` yalnızca KAYNAK METNİ sınıyor: `:root` bloğunda doğru
   * hex yazdığını görür ama tarayıcının o CSS'i GERÇEKTEN uyguladığını
   * göremez (yanlış seçici, atlanmış bir blok, vb. kaynak metinde de
   * dururdu). Bu sınama `getComputedStyle` ile GERÇEK çizimi ölçüyor —
   * hem açık hem koyu temada, token-kontrast.test.ts'teki değerlerle
   * AYNI token'lara karşı (bu dosyadaki hex'ler o testteki hex'lerin
   * kopyası DEĞİL, page.ts'teki --bg'nin rgb karşılığı; ikisi birlikte
   * aynı kaynağı iki açıdan doğruluyor).
   */
  it("gökyüzü paleti: açık temada zemin doğru rgb, konsol temiz", async () => {
    const { page, hatalar } = await acTema("light");
    try {
      await page.waitForSelector("#bar .pill", { timeout: 15_000 });
      const zemin = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      // --bg: #E7ECF2 → rgb(231, 236, 242)
      expect(zemin).toBe("rgb(231, 236, 242)");
      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("gökyüzü paleti: koyu temada zemin doğru rgb, konsol temiz", async () => {
    const { page, hatalar } = await acTema("dark");
    try {
      await page.waitForSelector("#bar .pill", { timeout: 15_000 });
      const zemin = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      // --bg (koyu): #0B1118 → rgb(11, 17, 24)
      expect(zemin).toBe("rgb(11, 17, 24)");
      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("formdan açılan kart panoya düşüyor", async () => {
    const { page, hatalar } = await ac();
    try {
      await page.waitForSelector("#bar .pill", { timeout: 15_000 });
      await page.click('button:has-text("Yeni kart")');
      await page.waitForSelector(".ust textarea", { timeout: 10_000 });
      await page.fill('.ust input[type=text]', "tarayıcıdan");
      await page.fill(".ust textarea", "gerçek tarayıcıdan açılan kart");
      await page.click('.ust button:has-text("Kartı aç")');
      await page.waitForSelector(".card", { timeout: 10_000 });

      // Çekirdek GERÇEKTEN yazdı mı — sayfanın iddiasına değil kuyruğa bak.
      const kartlar = await queue.list();
      expect(kartlar.map((c) => c.title)).toEqual(["tarayıcıdan"]);
      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  // Boş gönderim ÇEKİRDEĞİN mesajıyla reddedilmeli: doğrulama tek yerde.
  it("boş kart reddediliyor, çekirdeğin mesajıyla", async () => {
    const { page } = await ac();
    try {
      await page.waitForSelector("#bar .pill", { timeout: 15_000 });
      await page.click('button:has-text("Yeni kart")');
      await page.waitForSelector(".ust textarea", { timeout: 10_000 });
      await page.click('.ust button:has-text("Kartı aç")');
      await page.waitForTimeout(500);
      const hata = await page.evaluate(() => {
        const e = document.querySelector(".ust .err");
        return e && e.style.display !== "none" ? (e.textContent ?? "") : null;
      });
      expect(hata).toMatch(/başlığı boş olamaz/);
      expect(await queue.list()).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  /**
   * BAYAT KİLİTTE düğme "başlat" demeli.
   *
   * Ölçülmüş kusur: düğme kilidin VARLIĞINA bakıyordu, canlı olmasına
   * değil — bayat kilitte "Gözcüyü durdur" diyor, basınca çalışmıyordu.
   * Birim sınama bunu göremezdi; etiket ancak çizilince görünür.
   */
  it("bayat kilitte gözcü düğmesi 'başlat' diyor", async () => {
    // Ölü pid: 2^22 üstü Linux'ta ayrılmaz.
    await acquireLock(join(root, ".skein", "daemon.json"), {
      pid: 4_194_305, startedAt: new Date().toISOString(),
      flow: "test", hash: "abc", mode: "serve",
    });
    const { page } = await ac();
    try {
      await page.waitForSelector("#bar .pill", { timeout: 15_000 });
      const hap = (await page.textContent("#bar .pill")) ?? "";
      expect(hap).toContain("bayat kilit");
      const dugmeler = await page.evaluate(() =>
        Array.from(document.querySelectorAll("#bar button")).map((b) => b.textContent ?? ""));
      // Gözcü bayrağı verilmediği için düğme HİÇ çıkmamalı ya da çıkarsa
      // "başlat" demeli — "durdur" demesi yapamayacağı şeyi vaat etmektir.
      expect(dugmeler.some((d) => d.includes("Gözcüyü durdur"))).toBe(false);
    } finally {
      await page.close();
    }
  }, 60_000);

  /**
   * SEÇİCİDEN AKIŞ DEĞİŞTİRMEK — gerçek tarayıcıda.
   *
   * `server.test.ts` uçları birim sınıyor ama "seçiciye tıklayınca pano
   * GERÇEKTEN yeni akışın sütunlarını çiziyor mu" sorusu yalnızca sayfayı
   * gerçekten açınca görünür — tıpkı gözcü düğmesindeki üç kusurun ancak
   * burada çıkması gibi.
   */
  it("seçiciden akış değiştirince sütunlar değişiyor", async () => {
    const FLOW2 = `
name: ikinci
constitution:
  - ../prompts/base.md
roles:
  - id: digerrol
    provider: claude
    workspace: main
    prompt: ../../roles/coder.prompt
    next: done
`;
    await writeFile(join(root, "hub", "flows", "ikinci.yaml"), FLOW2);
    const live = await LiveFlow.open(join(root, "hub", "flows", "test.yaml"), {
      root, providers: knownProviderSet(),
    });
    const s = await serveUi({
      root, queue, topology, flowName: "test", flowHash: live.flow.hash, live,
      akisSecimi: {
        listele: async () => ["test", "ikinci"],
        ac: async (ad) => {
          const l = await LiveFlow.open(join(root, "hub", "flows", `${ad}.yaml`), {
            root, providers: knownProviderSet(),
          });
          return { live: l, flowPath: l.flow.path };
        },
      },
    });

    const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
    const hatalar: string[] = [];
    page.on("pageerror", (e) => hatalar.push(String(e)));
    try {
      await page.goto(s.url, { waitUntil: "networkidle" });
      await page.waitForSelector("#akisSecici", { timeout: 15_000 });

      // Başlangıçta ilk akışın sütunu duruyor.
      let basliklar = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".col .colhead")).map((e) => e.textContent ?? ""));
      expect(basliklar.some((b) => b.includes("coder"))).toBe(true);

      await page.selectOption("#akisSecici", "ikinci");
      await page.waitForSelector('.colhead:has-text("digerrol")', { timeout: 10_000 });

      // İDDİA "yeni sütun EKLENDİ" değil, "pano DEĞİŞTİ": eski akışın rolü
      // artık hiç görünmemeli — sayfa iki akışı birden çizseydi bu kaçardı.
      basliklar = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".col .colhead")).map((e) => e.textContent ?? ""));
      expect(basliklar.some((b) => b.includes("digerrol"))).toBe(true);
      expect(basliklar.some((b) => b.includes("coder"))).toBe(false);
      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
      await s.close();
    }
  }, 60_000);

  /**
   * ROL PROMPTLARINI EKRANDAN DÜZENLEMEK — gerçek tarayıcıda.
   *
   * `server.test.ts` uçları birim sınıyor ama "panelden dosya seçip metni
   * değiştirip kaydedince disk GERÇEKTEN değişiyor mu" sorusu yalnızca
   * sayfayı gerçekten açınca görünür — akış seçicideki ve kart formundaki
   * aynı boşluğun aynısı.
   */
  it("promptlar panelinden metni değiştirip kaydedince dosya gerçekten değişiyor", async () => {
    const live = await LiveFlow.open(join(root, "hub", "flows", "test.yaml"), {
      root, providers: knownProviderSet(),
    });
    const s = await serveUi({
      root, queue, topology, flowName: "test", flowHash: live.flow.hash, live,
      flowPath: live.flow.path,
      loadOptions: { root, providers: knownProviderSet() },
    });

    const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
    const hatalar: string[] = [];
    page.on("pageerror", (e) => hatalar.push(String(e)));
    try {
      await page.goto(s.url, { waitUntil: "networkidle" });
      await page.waitForSelector("#bar .pill", { timeout: 15_000 });
      await page.click('button:has-text("Promptları düzenle")');
      await page.waitForSelector(".promptListe button", { timeout: 10_000 });
      // İki dosya listelenir (anayasa:1, rol:coder); rol dosyasını seçiyoruz.
      await page.click('.promptListe button:has-text("rol:coder")');
      await page.waitForTimeout(500);
      await page.fill("#promptMetin", "# coder\ntarayıcıdan değişti\n");
      await page.click("#promptKaydet");
      await page.waitForTimeout(500);

      // İDDİA sunucunun söylediği değil, DİSKTE GERÇEKTEN ne olduğu.
      expect(await readFile(join(root, "roles", "coder.prompt"), "utf8"))
        .toBe("# coder\ntarayıcıdan değişti\n");
      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
      await s.close();
    }
  }, 60_000);

  /**
   * ZİNCİR OKU — dar ekranda yön AŞAĞI döner, geniş ekranda SAĞ kalır.
   *
   * Yön page.ts'teki bir CSS medya sorgusuyla çözülüyor
   * (".colhead .zincir .ok" kuralı), JS'le ÖLÇÜLEREK değil — ama bir
   * medya sorgusunun tarayıcıda GERÇEKTEN tuttuğu, kaynak metni okuyan
   * page.test.ts'ten GÖRÜNMEZ: sorgu yanlış yazılsa ya da hiç
   * UYGULANMASA bile o dosyadaki sınamalar yine geçerdi. Burada viewport
   * GERÇEKTEN daraltılıyor ve HESAPLANAN dönüş okunuyor.
   */
  it("zincir oku geniş ekranda düz kalır, dar ekranda aşağı döner", async () => {
    const genis = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
    const dar = await (browser as Tarayici).newPage({ viewport: { width: 400, height: 900 } });
    try {
      await genis.goto(server.url, { waitUntil: "networkidle" });
      await genis.waitForSelector(".colhead .zincir .ok", { timeout: 15_000 });
      const genisDonus = await genis.evaluate(() =>
        getComputedStyle(document.querySelector(".colhead .zincir .ok")).transform);
      // İDDİA sadece "ok döndü" değil, okun GERÇEK diziliş yönüyle eşleştiği:
      // iki sütunun üst kenarı burada AYNI hizada olmalı (yan yana).
      const genisTepeler = await genis.evaluate(() =>
        Array.from(document.querySelectorAll(".col")).slice(0, 2)
          .map((c) => c.getBoundingClientRect().top));

      await dar.goto(server.url, { waitUntil: "networkidle" });
      await dar.waitForSelector(".colhead .zincir .ok", { timeout: 15_000 });
      const darDonus = await dar.evaluate(() =>
        getComputedStyle(document.querySelector(".colhead .zincir .ok")).transform);
      // Burada ise ikinci sütun BİRİNCİNİN altına düşmüş olmalı — grid'in
      // kendi kuralı (bkz. page.ts ".board" yorumu) bu genişlikte artık
      // tek sütuna sarıyor.
      const darTepeler = await dar.evaluate(() =>
        Array.from(document.querySelectorAll(".col")).slice(0, 2)
          .map((c) => c.getBoundingClientRect().top));

      expect(genisDonus).toBe("none");
      expect(genisTepeler[0]).toBe(genisTepeler[1]);
      expect(darDonus).not.toBe("none");
      expect(darTepeler[1]).toBeGreaterThan(darTepeler[0] ?? 0);
    } finally {
      await genis.close();
      await dar.close();
    }
  }, 60_000);

  /**
   * KAPI GEREKÇESİ OKUNUR — çekirdeğin cümlesi hep görünür; ajanın ham
   * (ve burada JSON'a benzeyen) son mesajı KATLANIR ama METNİ KAYBETMEZ.
   *
   * Ölçülen kusur TAM BUYDU: bir kapı kartında gerekçe olarak ham API
   * JSON'u gerekçenin GÖVDESİNE dökülmüş hâlde duruyordu — operatörün
   * karar vermesi gereken ilk cümle, o JSON'un içinde kayboluyordu. Kart
   * burada GERÇEK örnekle (tick.ts'teki agentSaid'in ürettiği kesilmiş
   * kuyruğun aynı biçimi — '…' ile başlayan, '{' ile başlamayan bir JSON
   * parçası) kuruluyor; heuristiğin '{' kontrolünden değil "anahtar":
   * kalıbından geçtiğini de dolaylı doğruluyor.
   */
  it("uzun ve JSON'lu gerekçe: ilk satır görünür, tamamı açılabiliyor, açınca metnin tamamı DOM'da", async () => {
    const cekirdek = "Ajan zaman aşımına uğradı";
    // ÖZELLİKLE 200 KARAKTERDEN UZUN: "ilk 200 karakter, gerisi yok" türü
    // bir kırpma mutasyonunun bu sınamayı GERÇEKTEN düşürdüğü (bkz. bu
    // kartın commit'i) ancak kuyruk bu eşiği aşınca görülebiliyordu —
    // ölçülen gerçek bug raporunda da kuyruk ~600 karakterdi (agentSaid).
    const ajanKuyruk =
      '…"stop_reason":null,"stop_sequence":null,"stop_details":null,"usage":' +
      '{"input_tokens":2,"cache_creation_input_tokens":337,' +
      '"cache_read_input_tokens":219591,"cache_creation":' +
      '{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":337},' +
      '"output_tokens":9,"service_tier":"standard","inference_geo":"global",' +
      '"speed":"standard"},"input_transformations":[],"diagnostics":null,' +
      '"context_management":null},"parent_tool_use_id":null,"session_id":' +
      '"4285ec03-c118-4613-b7a5-c74ca34de154","uuid":' +
      '"5c473ca0-34b2-451d-a387-9d0b10cbd941","timestamp":' +
      '"2026-11-03T15:41:29.839Z","request_id":"req_011CggFNLdfTgJLC5gY89p4f"}';
    const gerekce = `${cekirdek}\n\nAjan şunu söyledi:\n${ajanKuyruk}`;

    await queue.add(newCard({ title: "zaman asimi", task: "iş", topology }));
    const taken = await al(queue, "coder");
    await queue.escalate(taken, gerekce);

    const { page, hatalar } = await ac();
    try {
      await page.waitForSelector(".card.gate", { timeout: 15_000 });

      // İLK SATIR HER ZAMAN TAM GÖRÜNÜR — ham JSON'un İÇİNDE DEĞİL.
      expect(await page.textContent(".card.gate .reason")).toBe(cekirdek);

      // KATLANABİLİR, varsayılan KAPALI.
      expect(await page.evaluate(() => document.querySelector(".card.gate .ajanDetay")?.open))
        .toBe(false);

      // TIKLAYINCA AÇILIYOR ve metnin TAMAMI DOM'da — KIRPMA YOK: "ilk 200
      // karakter, gerisi yok" burada aranan tam kusur.
      await page.click(".card.gate .ajanDetay summary");
      expect(await page.textContent(".card.gate .ajanTam")).toBe(ajanKuyruk);

      // JSON'A BENZEYEN kuyruk mono/kaydırmalı blokta — paragraf gibi
      // sarılıp okutulmuyor.
      expect(await page.evaluate(() =>
        document.querySelector(".card.gate .ajanTam")?.classList.contains("mono"))).toBe(true);

      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  /**
   * KAPI GEREKÇESİ OLMAYAN KARTIN GÖRÜNÜMÜ DEĞİŞMİYOR.
   *
   * Yeni katlanabilir blok yalnızca ayraç ("Ajan şunu söyledi:") gerçekten
   * bulunduğunda çıkmalı — kısa, ajan mesajı taşımayan bir kapı
   * gerekçesinde eski görünüm (tek `.reason` paragrafı) AYNEN kalmalı.
   */
  it("ajan mesajı taşımayan kapı gerekçesinde katlanabilir blok çıkmıyor", async () => {
    await queue.add(newCard({ title: "basit kapı", task: "iş", topology }));
    const taken = await al(queue, "coder");
    await queue.escalate(taken, "ağaçta işlenmemiş değişiklik var: README.md");

    const { page, hatalar } = await ac();
    try {
      await page.waitForSelector(".card.gate", { timeout: 15_000 });
      expect(await page.textContent(".card.gate .reason"))
        .toBe("ağaçta işlenmemiş değişiklik var: README.md");
      expect(await page.evaluate(() => document.querySelector(".card.gate .ajanDetay"))).toBeNull();
      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  /**
   * KUŞ İŞARETİ — bardaki metnin YERİNE çizilen SVG, GERÇEKTEN görünür ve
   * her iki temada da kendiliğinden doğru renkte.
   *
   * `page.test.ts` yalnızca kaynak metni (ISARET_D sabiti var mı) sınayabilir
   * — "currentColor gerçekten --ink'e eşitleniyor mu" sorusu GERÇEK çizim
   * olmadan görünmez: yanlış bir seçici ya da unutulmuş bir sabit renk bile
   * kaynak metinde dururdu.
   */
  it("kuş işareti bardaki svg olarak çiziliyor, iki temada da currentColor --ink'e eşit", async () => {
    const { page: acik, hatalar: hatalarAcik } = await acTema("light");
    try {
      await acik.waitForSelector(".marka svg path", { timeout: 15_000 });
      // İŞARET currentColor KULLANIYOR: renk kararı burada DEĞİL, gövdenin
      // --ink'inden geliyor — bu yüzden 'stroke' özniteliğinin KENDİSİ
      // "currentColor" dizgesi olmalı (bir hex DEĞİL).
      const stroke = await acik.evaluate(() => document.querySelector(".marka svg path")?.getAttribute("stroke"));
      expect(stroke).toBe("currentColor");
      // currentColor'ın ÇÖZÜLMÜŞ hâli: path'in computed 'color'ı, --ink'in
      // o temadaki gerçek değeri.
      const ciziliRenkAcik = await acik.evaluate(() =>
        getComputedStyle(document.querySelector(".marka svg path")).color);
      // --ink (açık): #15212C → rgb(21, 33, 44)
      expect(ciziliRenkAcik).toBe("rgb(21, 33, 44)");
      expect(hatalarAcik).toEqual([]);
    } finally {
      await acik.close();
    }

    const { page: koyu, hatalar: hatalarKoyu } = await acTema("dark");
    try {
      await koyu.waitForSelector(".marka svg path", { timeout: 15_000 });
      const ciziliRenkKoyu = await koyu.evaluate(() =>
        getComputedStyle(document.querySelector(".marka svg path")).color);
      // --ink (koyu): #E8EEF4 → rgb(232, 238, 244)
      expect(ciziliRenkKoyu).toBe("rgb(232, 238, 244)");
      expect(hatalarKoyu).toEqual([]);
    } finally {
      await koyu.close();
    }
  }, 60_000);

  /**
   * FAVICON — AYNI işaretten kurulan bir data URI, dosya indirme yok.
   *
   * Sekmede bugün varsayılan ikon duruyordu: `<link rel=icon>` hiç yoktu.
   * Bu sınama sayfanın kendisinin o etiketi GERÇEKTEN eklediğini ölçüyor —
   * kaynak metinde `faviconAyarla` fonksiyonunun durması, tarayıcıda
   * ÇAĞRILDIĞINI göstermez.
   */
  it("favicon aynı işaretten data URI olarak kuruluyor, dosya indirmiyor", async () => {
    const { page, hatalar } = await ac();
    try {
      await page.waitForSelector(".marka svg path", { timeout: 15_000 });
      const href = await page.evaluate(() => {
        const l = document.querySelector("link[rel=icon]") as unknown as { href: string } | null;
        return l === null ? null : l.href;
      });
      expect(href).not.toBeNull();
      expect(href).toMatch(/^data:image\/svg\+xml,/);
      // DOSYA İNDİRME YOK: href bir ağ adresi DEĞİL, gömülü veri.
      expect(href).not.toContain("http://");
      expect(href).not.toContain("https://");
      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  /**
   * DEVİR HAREKETİ — `prefers-reduced-motion: reduce` HAREKETİ TAMAMEN
   * SIFIRLAR.
   *
   * Bu bir süs tercihi değil, erişilebilirlik koşulu: `page.test.ts`
   * medya sorgusunun KAYNAK METİNDE durduğunu görebilir ama tarayıcının
   * onu GERÇEKTEN uyguladığını göremez. Aynı senaryo iki hareket
   * tercihiyle AÇILIYOR: reduce'da hesaplanan animasyon 'none', aksi
   * hâlde kartın GERÇEKTEN animasyonu var — ikisi karşılaştırılmadan
   * "animasyon yok" iddiası "hiç animasyon TANIMLI değil" kusuruyla
   * karıştırılabilirdi.
   */
  it("yeni kart: prefers-reduced-motion'da animasyon YOK, aksi hâlde VAR", async () => {
    const { page: azalt, hatalar: hatalarAzalt } = await acHareket("reduce");
    try {
      await queue.add(newCard({ title: "hareket-azalt", task: "iş", topology }));
      await azalt.waitForSelector(".card", { timeout: 15_000 });
      const animAzalt = await azalt.evaluate(() => getComputedStyle(document.querySelector(".card")).animationName);
      expect(animAzalt).toBe("none");
      expect(hatalarAzalt).toEqual([]);
    } finally {
      await azalt.close();
    }
  }, 60_000);

  it("yeni kart: hareket tercihi 'no-preference' ise GERÇEKTEN animasyon oynuyor", async () => {
    const { page: normal, hatalar: hatalarNormal } = await acHareket("no-preference");
    try {
      await queue.add(newCard({ title: "hareket-normal", task: "iş", topology }));
      await normal.waitForSelector(".card", { timeout: 15_000 });
      const animNormal = await normal.evaluate(() => getComputedStyle(document.querySelector(".card")).animationName);
      expect(animNormal).not.toBe("none");
      expect(hatalarNormal).toEqual([]);
    } finally {
      await normal.close();
    }
  }, 60_000);

  /**
   * KARTIN KİMLİĞİ İKİ YOKLAMA ARASINDA KORUNUYOR.
   *
   * Pano her yoklamada baştan çiziliyor (bkz. page.ts `ciz`), ama devrin
   * hareketi ANLAMLI olması için aynı kartın aynı DOM düğümü kalması
   * gerekiyor — yoksa her yoklamada her kart "yeni gelmiş" gibi oynardı.
   *
   * Düğüm NASIL sınanır: kartın kendi düğümüne bir öznitelik İŞARETLENİR
   * (`setAttribute`) ve bir yoklama döngüsünden (1000ms) SONRA o işaretin
   * HÂLÂ ORADA olduğu ölçülür. `kartIcerik` her yoklamada `replaceChildren`
   * ve `className` ile içeriği baştan kuruyor ama düğümün KENDİSİNİ yok
   * etmiyor — eğer `kartYerlestir` yeni bir düğüm YARATSAYDI (kimliği
   * korumayan bir uygulama), bu işaret taze düğümde HİÇ BULUNMAZDI.
   */
  it("aynı kart, hiçbir şey değişmeden geçen bir yoklamadan sonra AYNI DOM düğümü", async () => {
    await queue.add(newCard({ title: "kimlik-sinama", task: "iş", topology }));
    const { page, hatalar } = await ac();
    try {
      await page.waitForSelector(".card", { timeout: 15_000 });
      await page.evaluate(() => {
        document.querySelector(".card")?.setAttribute("data-kimlik-sinama", "aynen-burada");
      });
      // En az bir yoklama döngüsünü (1000ms) GEÇİRİYORUZ — sunucu /durum'u
      // tekrar yoklayıp panoyu yeniden çizecek kadar.
      await page.waitForTimeout(1500);
      const isaretHalaDuruyor = await page.evaluate(() =>
        document.querySelector(".card")?.getAttribute("data-kimlik-sinama") ?? null);
      expect(isaretHalaDuruyor).toBe("aynen-burada");
      // İKİ KEZ ÇİZİLMEDİ: işaretli düğüm TEK, yoklama kartı ne kaybetti
      // ne de yanına bir ikincisini ekledi.
      const kartSayisi = await page.evaluate(() => document.querySelectorAll(".card").length);
      expect(kartSayisi).toBe(1);
      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  /**
   * BOŞ DURUMLAR — sütun neden boş olduğunu GERÇEKTEN söylüyor, "—"
   * demiyor; "bitti" boşken ile rol sütunu boşken AYNI cümleyi kurmuyor.
   *
   * Üç GERÇEK senaryo, üçü de gerçek tarayıcıda ERİŞİLEBİLİR (yarış
   * durumunun ayrı sınaması page.test.ts'te — bkz. `bosRolMetni` orada,
   * burada tekrarlanmıyor çünkü gerçek uygulamada güvenilir tetiklenemez):
   *   - hiç kart yokken,
   *   - bir kart koşarken (biten yok ama iş sürüyor),
   *   - bir kart kuyrukta/kapıda beklerken (koşan yok, biten de yok).
   */
  it("boş 'bitti' sütunu: hiç kart açılmadıysa bunu söyler, rol sütunuyla AYNI cümleyi kurmaz", async () => {
    const { page, hatalar } = await ac();
    try {
      await page.waitForSelector("#bar .pill", { timeout: 15_000 });
      const metinler = await page.evaluate(() => {
        const sutunlar = Array.from(document.querySelectorAll(".col"));
        return sutunlar.map((s) => s.querySelector(".empty")?.textContent ?? null);
      });
      const rolBos = metinler[0] ?? null;
      const bittiBos = metinler[metinler.length - 1] ?? null;
      expect(rolBos).toBe("kuyrukta kart yok");
      expect(bittiBos).toBe("henuz kart acilmadi");
      expect(rolBos).not.toBe(bittiBos);
      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("boş 'bitti' sütunu: bir kart koşarken 'iş sürüyor' der, 'hiç açılmadı' demez", async () => {
    await queue.add(newCard({ title: "kosan-kart", task: "iş", topology }));
    await al(queue, "coder");
    const { page, hatalar } = await ac();
    try {
      await page.waitForSelector(".card.live", { timeout: 15_000 });
      const bittiBos = await page.evaluate(() => {
        const sutunlar = Array.from(document.querySelectorAll(".col"));
        const son = sutunlar[sutunlar.length - 1];
        return son?.querySelector(".empty")?.textContent ?? null;
      });
      expect(bittiBos).toBe("bir rol su an kosuyor, henuz biten kart yok");
      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("boş 'bitti' sütunu: kart kapıda beklerken 'biten yok' der, koşan yokken 'hiç açılmadı' demez", async () => {
    await queue.add(newCard({ title: "kapida-bekleyen", task: "iş", topology }));
    const taken = await al(queue, "coder");
    await queue.escalate(taken, "insan kararı bekleniyor");
    const { page, hatalar } = await ac();
    try {
      await page.waitForSelector(".card.gate", { timeout: 15_000 });
      const bittiBos = await page.evaluate(() => {
        const sutunlar = Array.from(document.querySelectorAll(".col"));
        const son = sutunlar[sutunlar.length - 1];
        return son?.querySelector(".empty")?.textContent ?? null;
      });
      expect(bittiBos).toBe("kart kuyrukta ya da kapida bekliyor, henuz biten yok");
      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);
});
