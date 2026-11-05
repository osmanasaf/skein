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
  /** Yalnızca akış düzenleyicisinin 'change' dinleyicisini elle tetiklemek
   * için — bkz. "Ham YAML" sınaması: 'fill' yalnızca 'input' yayıyor. */
  dispatchEvent: (e: unknown) => void;
};
declare const document: {
  querySelector: (s: string) => El | null;
  querySelectorAll: (s: string) => ArrayLike<El>;
  body: unknown;
};
/** Yalnızca 'change' olayını elle kurup yaymak için — bkz. yukarıdaki not. */
declare class Event {
  constructor(type: string, init?: { bubbles?: boolean });
}
/**
 * Zemin rengi, dönüş, kuş işaretinin GERÇEK rengi (currentColor'ın çözüldüğü
 * `color`) ve devir animasyonunun adı için — gökyüzü paleti, zincir okunun
 * yönü, kuş işareti ve devir hareketi sınamalarının ihtiyacı kadar.
 */
declare function getComputedStyle(
  el: unknown,
): {
  backgroundColor: string; transform: string; color: string; animationName: string;
  /** Yalnızca diyagramın dar/geniş ekranda hangi kopyasının göründüğü
   * sınaması için — bkz. akış diyagramı describe'ı. */
  display: string;
  /** Yalnızca başlık fontu sınaması için — bkz. "başlık fontu" describe'ı
   * altındaki test (kart c-20261105-6d7f66, reddin gerekçesi). */
  fontFamily: string;
};

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

  /**
   * ÜST ÇUBUK KOYU TEMADA — reviewer'ın reddi (0f75e74, bu kenarda 2. ret).
   *
   * token-kontrast.test.ts kaynak METNİ ayrıştırıp var() zincirini izliyor;
   * önceki halde dark `:root:not(...)` bloğu Modernist token'larını hiç
   * EZMİYORDU, yani o sınamanın "koyu" haritası otomatik olarak AÇIK
   * değerlere düşüyordu — ayrıştırıcı doğru çalışıyordu ama ezecek hiçbir
   * şey yoktu, yani kusuru YAKALAYAMAZDI (aynı sınıf: ezilmemiş bir token
   * kaynak metinde "tanımlı" görünür ama gerçek çizimde yanlış değere
   * çözülür). Reviewer gerçek tarayıcıda `acTema('dark')` ile ölçtü:
   * document.body rgb(11, 17, 24) (doğru koyu) ama #bar rgb(243, 242, 242)
   * (AÇIK — hiç değişmemiş) kaldı. Bu sınama tam o ölçümü pinliyor.
   */
  it("#bar koyu temada document.body ile BİRLİKTE koyulaşıyor, açık kalmıyor", async () => {
    const { page, hatalar } = await acTema("dark");
    try {
      await page.waitForSelector("#bar .pill", { timeout: 15_000 });
      const barZemin = await page.evaluate(() =>
        getComputedStyle(document.querySelector("#bar")).backgroundColor);
      const govdeZemin = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const sekmeMetni = await page.evaluate(() =>
        getComputedStyle(document.querySelector(".navSekme")).color);
      // --color-bg'nin koyu ezmesi: #1A1817 → rgb(26, 24, 23).
      expect(barZemin).toBe("rgb(26, 24, 23)");
      // KARŞIT İDDİA: açık temanın --color-bg'si (#f3f2f2 → rgb(243, 242,
      // 242)) DEĞİL — reddedilen halde #bar tam olarak bu değerde donup
      // kalıyordu.
      expect(barZemin).not.toBe("rgb(243, 242, 242)");
      // --bg'nin (eski aile) koyu ezmesi: #0B1118 → rgb(11, 17, 24).
      expect(govdeZemin).toBe("rgb(11, 17, 24)");
      // --color-text'in koyu ezmesi: #F2EFEE → rgb(242, 239, 238).
      expect(sekmeMetni).toBe("rgb(242, 239, 238)");
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
   * YENİ ROL EKRANDAN — gerçek tarayıcıda.
   *
   * `server.test.ts` `/rol/yeni`'yi birim sınıyor ama "panelden doldurup
   * basınca sütunlarda GERÇEKTEN yeni bir sütun beliriyor mu" sorusu
   * yalnızca sayfayı gerçekten açınca görünür — akış seçicideki ve prompt
   * panelindeki aynı boşluğun aynısı. Yol kart bunu açıkça istiyor:
   * "ekrandan yeni rol ekleniyor ve sütunlarda beliriyor".
   */
  it("prompt panelinden yeni rol ekleniyor ve sütunlarda beliriyor", async () => {
    const live = await LiveFlow.open(join(root, "hub", "flows", "test.yaml"), {
      root, providers: knownProviderSet(),
    });
    const s = await serveUi({
      root, queue, topology, flowName: "test", flowHash: live.flow.hash, live,
      flowPath: live.flow.path,
      loadOptions: { root, providers: knownProviderSet() },
      providerIds: knownProviderSet().ids(),
    });

    const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
    const hatalar: string[] = [];
    page.on("pageerror", (e) => hatalar.push(String(e)));
    try {
      await page.goto(s.url, { waitUntil: "networkidle" });
      await page.waitForSelector("#bar .pill", { timeout: 15_000 });
      await page.click('button:has-text("Promptları düzenle")');
      await page.waitForSelector('button:has-text("Yeni rol")', { timeout: 10_000 });
      await page.click('button:has-text("Yeni rol")');
      await page.waitForSelector("#yeniRolId", { timeout: 10_000 });

      await page.fill("#yeniRolId", "reviewer");
      await page.selectOption("#yeniRolProvider", "claude");
      await page.fill("#yeniRolWorkspace", "reviewer");
      await page.selectOption("#yeniRolSonra", "coder");
      // Prompt BOŞ bırakılıyor — sunucu şablondan yazmalı (kural 9).
      await page.click('button:has-text("Rolü ekle")');
      await page.waitForSelector('.colhead:has-text("reviewer")', { timeout: 10_000 });

      // İDDİA panonun SÖYLEDİĞİ değil, DİSKTE GERÇEKTEN ne olduğu: hem
      // YAML hem de yeni promptu dosyası.
      const basliklar = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".col .colhead")).map((e) => e.textContent ?? ""));
      expect(basliklar.some((b) => b.includes("coder"))).toBe(true);
      expect(basliklar.some((b) => b.includes("reviewer"))).toBe(true);

      const yaml = await readFile(join(root, "hub", "flows", "test.yaml"), "utf8");
      expect(yaml).toContain("id: reviewer");
      const promptMetni = await readFile(join(root, "roles", "reviewer.md"), "utf8");
      expect(promptMetni).toContain("Rolün: reviewer");
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
   * KUŞ İŞARETİ — bardaki marka SVG'si GERÇEKTEN görünür ve her iki temada
   * da kendiliğinden aynı vurgu renginde (kart c-20261105-6d7f66).
   *
   * Bu sınama ESKİDEN "currentColor → --ink" eşitliğini ölçüyordu (marka
   * metnin YERİNE geçen tek-çizgili simgeydi). Yeni üst çubuk tasarımı
   * (DEVIR.md) markayı "40x26 üç kuş SVG'si, vurgu renginde" yapıyor —
   * simge artık "Skein" sözcüğünün YANINDA, --ink'e değil --color-accent'e
   * bağlı. --color-accent'in koyu tema ezmesi BİLİNÇLİ OLARAK yok (bkz.
   * page.ts'teki @media (prefers-color-scheme: dark) bloğu — diğer
   * Modernist token'lar orada ezildi, bu biri hariç: accent kendi dolgulu
   * bileşenlerinde kendi zeminine karşı ölçülüyor, sayfa zeminine değil),
   * yani iki temada da AYNI kırmızı çözülmeli — bu, eski simgenin "iki
   * temada iki ayrı renk" davranışının BİLİNÇLİ tersi, kaynak metinde
   * durmaz, yalnızca gerçek çizimde görünür.
   */
  it("marka simgesi bardaki svg olarak çiziliyor, iki temada da currentColor --color-accent'e eşit", async () => {
    const { page: acik, hatalar: hatalarAcik } = await acTema("light");
    try {
      await acik.waitForSelector(".marka svg path", { timeout: 15_000 });
      // İŞARET currentColor KULLANIYOR: renk kararı burada DEĞİL, ".marka"
      // kuralının CSS 'color'ından geliyor — bu yüzden 'stroke'
      // özniteliğinin KENDİSİ "currentColor" dizgesi olmalı (bir hex DEĞİL).
      const stroke = await acik.evaluate(() => document.querySelector(".marka svg path")?.getAttribute("stroke"));
      expect(stroke).toBe("currentColor");
      // currentColor'ın ÇÖZÜLMÜŞ hâli: path'in computed 'color'ı,
      // --color-accent'in gerçek değeri.
      const ciziliRenkAcik = await acik.evaluate(() =>
        getComputedStyle(document.querySelector(".marka svg path")).color);
      // --color-accent: #ec3013 → rgb(236, 48, 19)
      expect(ciziliRenkAcik).toBe("rgb(236, 48, 19)");
      expect(hatalarAcik).toEqual([]);
    } finally {
      await acik.close();
    }

    const { page: koyu, hatalar: hatalarKoyu } = await acTema("dark");
    try {
      await koyu.waitForSelector(".marka svg path", { timeout: 15_000 });
      const ciziliRenkKoyu = await koyu.evaluate(() =>
        getComputedStyle(document.querySelector(".marka svg path")).color);
      // --color-accent'in koyu tema EZMESİ yok (Modernist katmanı koyu
      // tanımlamıyor) — iki temada da AYNI kırmızı çözülmeli.
      expect(ciziliRenkKoyu).toBe("rgb(236, 48, 19)");
      expect(hatalarKoyu).toEqual([]);
    } finally {
      await koyu.close();
    }
  }, 60_000);

  /**
   * BAŞLIK FONTU — marka sözcüğü, sekme etiketleri ve "Yeni kart" düğmesi
   * GERÇEKTEN Archivo'ya çözülüyor, gövdenin system-ui yığınına DÜŞMÜYOR
   * (reddedilen 03fbf8c'in kusuru: `--font-heading` hiç tanımlanmamıştı,
   * yani üç kuraldaki `var(--font-heading)` computed-value'da geçersizdi
   * ve font-family sessizce body'nin `system-ui, -apple-system, ...`
   * yığınına düşüyordu — font-weight hâlâ uygulanıyordu, yalnızca aile
   * yanlıştı). `page.test.ts` kaynak metni sınar, burada `var()`'ın
   * tarayıcıda GERÇEKTEN çözüldüğünü ölçüyoruz: token tanımsız kalsa bu
   * sınama DÜŞER (computed fontFamily "Archivo" içermez, body'nin
   * system-ui'ına eşit kalır), tanımlı olunca GEÇER.
   */
  it("marka adı, sekme etiketleri ve 'Yeni kart' düğmesi Archivo'ya çözülüyor, gövdenin system-ui yığınına düşmüyor", async () => {
    const { page, hatalar } = await ac();
    try {
      await page.waitForSelector(".marka .markaAd", { timeout: 15_000 });
      const govdeFontu = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
      const markaFontu = await page.evaluate(() =>
        getComputedStyle(document.querySelector(".marka .markaAd")).fontFamily);
      const sekmeFontu = await page.evaluate(() =>
        getComputedStyle(document.querySelector(".navSekme")).fontFamily);
      const dugmeFontu = await page.evaluate(() =>
        getComputedStyle(document.querySelector(".yeniKart")).fontFamily);
      expect(markaFontu).toContain("Archivo");
      expect(sekmeFontu).toContain("Archivo");
      expect(dugmeFontu).toContain("Archivo");
      // KARŞIT İDDİA: gövdenin system-ui yığınına EŞİT KALMADIKLARI —
      // tanımsız var() tam olarak bu değere sessizce düşerdi.
      expect(markaFontu).not.toBe(govdeFontu);
      expect(sekmeFontu).not.toBe(govdeFontu);
      expect(dugmeFontu).not.toBe(govdeFontu);
      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
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

  /**
   * AKIŞ DİYAGRAMI — gerçek tarayıcıda.
   *
   * Akış bugüne kadar ekranda bir YAML metin kutusuydu; bu akış artık bir
   * DİYAGRAM: roller düğüm, next/reject/syncBack kenar (bkz. page.ts
   * "Akış diyagramı" bölümü). `model.test.ts` kenarların MODELE doğru
   * girdiğini sınıyor ama "tarayıcı GERÇEKTEN düğüm ve okları çiziyor mu"
   * sorusu yalnızca sayfayı açınca görünür — bu dosyadaki her kusurun
   * ortak noktası.
   */
  describe("akış diyagramı", () => {
    const GUNLUK_TEK_FLOW = `
name: gunluk-tek
constitution:
  - ../prompts/base.md
roles:
  - id: coder
    provider: claude
    workspace: main
    prompt: ../../roles/coder.prompt
    next: reviewer

  - id: reviewer
    provider: claude
    workspace: reviewer
    prompt: ../../roles/coder.prompt
    receive: batch
    syncBack: [coder]
    reject: coder
    next: done
`;

    // Dört rol, hem next hem reject hem de İKİ kapı (biri 'none' —
    // davranışsal olarak kapı DEĞİL ve bu yüzden işaretlenmemeli, biri
    // 'approval' — işaretlenmeli). Filtreleme kararı SAYFADA (bkz.
    // model.ts "kapı tipi filtrelenmeden taşınıyor" yorumu).
    const AB_PLANLI_FLOW = `
name: ab-planli
constitution:
  - ../prompts/base.md
roles:
  - id: planner
    provider: claude
    workspace: main
    prompt: ../../roles/coder.prompt
    next: architect

  - id: architect
    provider: claude
    workspace: architect
    prompt: ../../roles/coder.prompt
    next: coder

  - id: coder
    provider: claude
    workspace: coder
    prompt: ../../roles/coder.prompt
    reject: planner
    next: reviewer

  - id: reviewer
    provider: claude
    workspace: reviewer
    prompt: ../../roles/coder.prompt
    receive: batch
    reject: coder
    next: done

gates:
  - after: architect
    type: none
  - after: coder
    type: approval
`;

    /** Verilen akış metnini yükler, sunucuyu o akışla açar. */
    async function akisSunucusuAc(ad: string, metin: string) {
      await writeFile(join(root, "hub", "flows", `${ad}.yaml`), metin);
      const flow = await loadFlow(join(root, "hub", "flows", `${ad}.yaml`), {
        root, providers: knownProviderSet(),
      });
      const topo = snapshot(flow, root);
      return serveUi({ root, queue: queue, topology: topo, flowName: flow.name, flowHash: flow.hash });
    }

    /**
     * `akisSunucusuAc`'IN DÜZENLEMEYE AÇIK hâli — `live`/`flowPath`/
     * `loadOptions` VERİLMEDEN diyagram tıklanamaz (bkz. `akisAc`
     * yorumu: "görüntülemek düzenlemekten ayrı bir yetki"), bu yüzden
     * diyagramdan düzenleme sınamaları AYRI bir sunucu açılışına
     * ihtiyaç duyuyor — "Ham YAML" sekmesinin kendi sınamasıyla (bkz.
     * yukarıdaki describe dışı test) AYNI kalıp.
     */
    async function akisSunucusuDuzenlenebilirAc(ad: string, metin: string) {
      const yol = join(root, "hub", "flows", `${ad}.yaml`);
      await writeFile(yol, metin);
      const live = await LiveFlow.open(yol, { root, providers: knownProviderSet() });
      return serveUi({
        root, queue, topology: live.topology, flowName: live.flow.name, flowHash: live.flow.hash,
        live, flowPath: live.flow.path,
        loadOptions: { root, providers: knownProviderSet() },
        providerIds: knownProviderSet().ids(),
      });
    }

    it("gunluk-tek: iki düğüm, next ileri, reject ve syncBack GERİ ve GÖRSEL OLARAK AYRI", async () => {
      const s = await akisSunucusuAc("gunluk-tek", GUNLUK_TEK_FLOW);
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.waitForSelector("#bar .pill", { timeout: 15_000 });
        await page.click('button:has-text("Akışı düzenle")');
        await page.waitForSelector(".diyagram-yatay .dugum", { timeout: 10_000 });

        const dugumler = await page.evaluate(() =>
          Array.from(document.querySelectorAll(".diyagram-yatay .dugum")).map((d) => d.getAttribute("data-rol")));
        expect(dugumler.sort()).toEqual(["coder", "reviewer"]);

        const next = await page.evaluate(() =>
          document.querySelector('.diyagram-yatay .kenar[data-kind="next"][data-from="coder"][data-to="reviewer"]') !== null);
        expect(next).toBe(true);

        // RET KENARI reviewer -> coder yönünde; next'in TERSİ.
        const reject = await page.evaluate(() =>
          document.querySelector('.diyagram-yatay .kenar[data-kind="reject"][data-from="reviewer"][data-to="coder"]') !== null);
        expect(reject).toBe(true);

        // AYNI ÇİFTE giden syncBack de var ve reject'ten AYRI bir kenar —
        // biri biri EZMEMELİ (model katmanında da aynı iddia, model.test.ts).
        const ayniCift = await page.evaluate(() =>
          document.querySelectorAll('.diyagram-yatay .kenar[data-from="reviewer"][data-to="coder"]').length);
        expect(ayniCift).toBe(2);

        // ÇİZGİ BİÇİMİ TEK TAŞIYICI (erişilebilirlik): next, reject,
        // syncBack ÜÇÜNÜN de stroke-dasharray'i FARKLI — renk körü bir göz
        // de ayırt edebilsin. Bu, "reject'i next gibi çiz" türü bir
        // mutasyonun YAKALANDIĞI nokta: next'in dasharray'i hiç YOK
        // (düz çizgi), reject ve syncBack'in VAR ve birbirinden FARKLI.
        const dashler = await page.evaluate(() => {
          const al = (sel: string) => document.querySelector(sel)?.getAttribute("stroke-dasharray") ?? null;
          return {
            next: al('.diyagram-yatay .kenar[data-kind="next"] line'),
            reject: al('.diyagram-yatay .kenar[data-kind="reject"] path'),
            syncBack: al('.diyagram-yatay .kenar[data-kind="syncBack"] path'),
          };
        });
        expect(dashler.next).toBeNull();
        expect(dashler.reject).not.toBeNull();
        expect(dashler.syncBack).not.toBeNull();
        expect(dashler.reject).not.toBe(dashler.syncBack);

        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    /**
     * DAR EKRANDA YÖN DEĞİŞİR — zincir okunun aynı ilkesi (bkz.
     * ".colhead .zincir .ok" sınaması). Yön bir CSS medya sorgusuyla
     * çözülüyor, JS pencereyi ÖLÇEREK değil: bu yüzden iddia KAYNAK
     * METİNDEN değil, iki GERÇEK viewport'ta HESAPLANAN 'display'dan.
     */
    it("geniş ekranda yatay diyagram görünür/dikey gizli, dar ekranda tersi", async () => {
      const s = await akisSunucusuAc("gunluk-tek", GUNLUK_TEK_FLOW);
      const genis = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const dar = await (browser as Tarayici).newPage({ viewport: { width: 400, height: 900 } });
      try {
        await genis.goto(s.url, { waitUntil: "networkidle" });
        await genis.waitForSelector("#bar .pill", { timeout: 15_000 });
        await genis.click('button:has-text("Akışı düzenle")');
        await genis.waitForSelector(".diyagram-yatay .dugum", { timeout: 10_000 });
        const genisGorunum = await genis.evaluate(() => ({
          yatay: getComputedStyle(document.querySelector(".diyagram-yatay")).display,
          dikey: getComputedStyle(document.querySelector(".diyagram-dikey")).display,
        }));

        await dar.goto(s.url, { waitUntil: "networkidle" });
        await dar.waitForSelector("#bar .pill", { timeout: 15_000 });
        await dar.click('button:has-text("Akışı düzenle")');
        await dar.waitForSelector(".diyagram-dikey", { timeout: 10_000 });
        const darGorunum = await dar.evaluate(() => ({
          yatay: getComputedStyle(document.querySelector(".diyagram-yatay")).display,
          dikey: getComputedStyle(document.querySelector(".diyagram-dikey")).display,
        }));

        expect(genisGorunum.yatay).not.toBe("none");
        expect(genisGorunum.dikey).toBe("none");
        expect(darGorunum.yatay).toBe("none");
        expect(darGorunum.dikey).not.toBe("none");
      } finally {
        await genis.close();
        await dar.close();
        await s.close();
      }
    }, 60_000);

    it("ab-planli: dört rol, zincirdeki her next/reject kenarı ve yalnızca onay kapısı işaretli", async () => {
      const s = await akisSunucusuAc("ab-planli", AB_PLANLI_FLOW);
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.waitForSelector("#bar .pill", { timeout: 15_000 });
        await page.click('button:has-text("Akışı düzenle")');
        await page.waitForSelector(".diyagram-yatay .dugum", { timeout: 10_000 });

        const dugumler = await page.evaluate(() =>
          Array.from(document.querySelectorAll(".diyagram-yatay .dugum")).map((d) => d.getAttribute("data-rol")));
        expect(dugumler.sort()).toEqual(["architect", "coder", "planner", "reviewer"]);

        // Sayfadaki HER kenarı (from, to, kind) üçlüsü olarak çıkarıp
        // Node tarafında karşılaştırıyoruz — "Sayfa" tipi evaluate'e
        // argüman geçmiyor (bkz. dosya başı), o yüzden seçiciyi tarayıcı
        // içinde KURMAK yerine listeyi BURAYA taşıyoruz.
        const kenarlar = await page.evaluate(() =>
          Array.from(document.querySelectorAll(".diyagram-yatay .kenar")).map((g) => ({
            from: g.getAttribute("data-from"),
            to: g.getAttribute("data-to"),
            kind: g.getAttribute("data-kind"),
          })));
        expect(kenarlar).toEqual(
          expect.arrayContaining([
            { from: "planner", to: "architect", kind: "next" },
            { from: "architect", to: "coder", kind: "next" },
            { from: "coder", to: "reviewer", kind: "next" },
            { from: "coder", to: "planner", kind: "reject" },
            { from: "reviewer", to: "coder", kind: "reject" },
            // 'architect' açıkça 'reject' BEYAN ETMİYOR — load.ts kuralı
            // varsayılanı GÖNDERENE (sender) bağlıyor, yani zincirdeki
            // ÖNCEKİ role: planner. Bu beşinci değil altıncı kenar.
            { from: "architect", to: "planner", kind: "reject" },
          ]),
        );
        // Zincirin SONU 'done'a hiç kenar yok — gidecek bir düğüm yok.
        expect(kenarlar.some((k) => k.to === "done")).toBe(false);
        expect(kenarlar).toHaveLength(6);

        // KAPI FİLTRESİ: 'none' davranışsal olarak kapı değil, çizilmiyor;
        // 'approval' çiziliyor. İkisi de modelden geliyor (buildModel
        // ikisini de taşıyor, bkz. model.test.ts), filtre SAYFADA.
        const kapilar = await page.evaluate(() =>
          Array.from(document.querySelectorAll(".diyagram-yatay .kapi-isaret")).map((g) => g.getAttribute("data-after")));
        expect(kapilar).toEqual(["coder"]);

        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    /**
     * BOZUK AKIŞTA DİYAGRAM DEĞİL HATA.
     *
     * Her `/durum` yoklaması `live.refresh()` ile dosyayı yeniden okuyor
     * (bkz. server.ts `guncel()`), yani dosyayı bozup bir yoklama
     * döngüsü (1000ms) bekleyince model `flow.error` ile işaretlenir.
     * Yarım bir graf çizmek hatayı göstermekten KÖTÜ — sağlam görünür ama
     * artık yaşayan topolojiyi yansıtmayabilir.
     */
    it("akış bozulunca diyagram yerine hata görünüyor, düğüm/kenar HİÇ basılmıyor", async () => {
      const live = await LiveFlow.open(join(root, "hub", "flows", "test.yaml"), {
        root, providers: knownProviderSet(),
      });
      const s = await serveUi({
        root, queue, topology, flowName: "test", flowHash: live.flow.hash, live,
      });
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      page.on("console", (m) => {
        const mesaj = m as { type?: () => string; text?: () => string };
        if (mesaj.type && mesaj.type() === "error") {
          hatalar.push("konsol: " + (mesaj.text ? mesaj.text() : String(m)));
        }
      });
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.waitForSelector("#bar .pill", { timeout: 15_000 });

        // AYNI bozuk hal live.test.ts'te de kullanılıyor: boş 'roles'
        // zincirin başı olmadığı için kural 5'i ihlal ediyor.
        await writeFile(join(root, "hub", "flows", "test.yaml"), "name: bozuk\nroles: []\n");
        await page.waitForTimeout(1500);

        await page.click('button:has-text("Akışı düzenle")');
        await page.waitForSelector(".panel .err", { timeout: 10_000 });

        const hataMetni = await page.textContent(".panel .err");
        expect(hataMetni).toMatch(/geçersiz/);
        expect(await page.evaluate(() => document.querySelectorAll(".dugum").length)).toBe(0);
        expect(await page.evaluate(() => document.querySelectorAll(".kenar").length)).toBe(0);
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    /**
     * AYNI İDDİA, EKRAN DÜZENLEMEYE AÇIKKEN: yukarıdaki sınama `live`yi
     * `flowPath`/`loadOptions` VERMEDEN açıyor, yani TASLAK hep `null`
     * kalıyor ve diyagram zaten SON_MODEL'den çiziliyor — bu YOLDA
     * `akisGecerli` kontrolüne hiç uğranmıyor. Ekran düzenlemeye AÇIKKEN
     * `/akis` BAŞARIYLA dönüyor (bkz. `LiveFlow`'un kendi kuralı: başarısız
     * `refresh()` ESKİ — hâlâ GEÇERLİ — akışı taşımaya devam eder), yani
     * TASLAK burada `null` DEĞİL. Diyagram o taslaktan (eski, hâlâ sağlam
     * topolojiden) çizilseydi, akış o AN geçersizken sağlammış GİBİ
     * görünürdü — tam da `akisGecerli` kontrolünün kapattığı kusur.
     */
    it("akış bozulunca, DÜZENLEMEYE AÇIK ekranda da diyagram yerine hata görünüyor (taslak eski akıştan hâlâ dolu olsa bile)", async () => {
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

        await writeFile(join(root, "hub", "flows", "test.yaml"), "name: bozuk\nroles: []\n");
        await page.waitForTimeout(1500);

        await page.click('button:has-text("Akışı düzenle")');
        await page.waitForSelector(".panel .err", { timeout: 10_000 });

        // TASLAK BURADA null DEĞİL (eski geçerli akıştan dolu) — iddia
        // tam da BUNUN diyagramı yanıltmadığı: hâlâ hata görünüyor, eski
        // (hâlâ sağlam) topolojiden bir düğüm/kenar SIZMIYOR.
        const hataMetni = await page.textContent(".panel .err");
        expect(hataMetni).toMatch(/geçersiz/);
        expect(await page.evaluate(() => document.querySelectorAll(".dugum").length)).toBe(0);
        expect(await page.evaluate(() => document.querySelectorAll(".kenar").length)).toBe(0);
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    /**
     * HAM YAML HÂLÂ AÇILABİLİYOR VE DÜZENLEME ÇALIŞIYOR.
     *
     * Panel artık VARSAYILAN olarak diyagramla açılıyor ama eski editör
     * KAYBOLMADI — "Ham YAML" sekmesinin arkasında, aynı uçlarla
     * (POST /akis/yaz) çalışıyor. Bu, bu kartın kendi kısıtı: "yarım bir
     * editör, iyi bir görüntüleyiciden kötüdür" — editör YARIM değil,
     * yerinde durmalı.
     */
    it("Ham YAML sekmesinden rol adını değiştirip kaydetmek dosyayı GERÇEKTEN değiştiriyor", async () => {
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
        await page.click('button:has-text("Akışı düzenle")');
        // VARSAYILAN SEKME DİYAGRAM: önce o görünmeli.
        await page.waitForSelector(".diyagram-yatay .dugum", { timeout: 10_000 });

        await page.click('button:has-text("Ham YAML")');
        await page.waitForSelector(".rol input", { timeout: 10_000 });
        await page.fill(".rol input", "coder-degisti");
        // "change" olayını elle tetikliyoruz: alan()'daki dinleyici ona
        // bağlı, 'fill' tek başına tetiklemeyebilir.
        await page.evaluate(() => {
          document.querySelector(".rol input")?.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await page.waitForSelector("#kaydet:not([disabled])", { timeout: 10_000 });
        await page.click("#kaydet");
        await page.waitForTimeout(500);

        // İDDİA sunucunun söylediği değil DİSKTE GERÇEKTEN ne olduğu.
        const yaml = await readFile(join(root, "hub", "flows", "test.yaml"), "utf8");
        expect(yaml).toContain("id: coder-degisti");
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    /**
     * DÜĞÜME TIKLAYINCA ALANLAR AÇILIYOR, KAYDETMEK DOSYAYI DEĞİŞTİRİYOR.
     *
     * Bu kartın 1. isteği: "diyagramda rol düğümüne tıklayınca sağlayıcı,
     * workspace, next, reject, syncBack düzenlenebilsin". Burada sağlayıcı
     * sınanıyor (öteki dördü silme/ekleme sınamalarında zaten değişiyor:
     * next aşağıdaki "rol çıkar" sınamasında, reject/syncBack da orada
     * TEMİZLENEREK sınanıyor).
     */
    it("diyagramdan düğüme tıklayınca düzenleme alanları açılıyor, provider değiştirip kaydetmek dosyayı değiştiriyor", async () => {
      const s = await akisSunucusuDuzenlenebilirAc("gunluk-tek", GUNLUK_TEK_FLOW);
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.waitForSelector("#bar .pill", { timeout: 15_000 });
        await page.click('button:has-text("Akışı düzenle")');
        await page.waitForSelector(".diyagram-yatay .dugum", { timeout: 10_000 });

        // TIKLAMADAN ÖNCE: düzenleme alanları henüz yok.
        expect(await page.evaluate(() => document.querySelectorAll(".diyagram-sarmal .rol").length)).toBe(0);

        await page.click('.diyagram-yatay .dugum[data-rol="coder"]');
        await page.waitForSelector(".diyagram-sarmal .rol", { timeout: 10_000 });
        // SEÇİLİ düğüm KENDİ dış çizgisiyle işaretli (bkz. diyagramSvgKur
        // yorumu) — operatör hangi düğümü düzenlediğini kaybetmemeli.
        const seciliSinifli = await page.evaluate(() =>
          document.querySelector('.diyagram-yatay .dugum[data-rol="coder"]')?.classList.contains("dugum-secili"));
        expect(seciliSinifli).toBe(true);

        await page.selectOption('.diyagram-sarmal .rol label:has-text("provider") select', "codex");
        await page.waitForSelector("#kaydet:not([disabled])", { timeout: 10_000 });
        await page.click("#kaydet");
        await page.waitForTimeout(500);

        const yaml = await readFile(join(root, "hub", "flows", "gunluk-tek.yaml"), "utf8");
        expect(yaml).toMatch(/id: coder[\s\S]*provider: codex/);
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    /**
     * DİYAGRAMDAN "+" İLE ROL EKLEME — bu kartın 2. isteği. "+" işareti
     * `coder` ile `reviewer` arasındaki `next` kenarının ortasında;
     * tıklanınca açılan panel NEREYE eklendiğini (başlıkta VE "sonra"
     * seçiminde) önceden söylüyor, sonra /rol/yeni'yi ATOMİK çağırıyor.
     */
    it("diyagramdaki '+' ile iki düğüm arasına rol ekleniyor, zincire doğru yere giriyor", async () => {
      const s = await akisSunucusuDuzenlenebilirAc("gunluk-tek", GUNLUK_TEK_FLOW);
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.waitForSelector("#bar .pill", { timeout: 15_000 });
        await page.click('button:has-text("Akışı düzenle")');
        await page.waitForSelector('.diyagram-yatay .kenar-ekle[data-sonra="coder"]', { timeout: 10_000 });

        await page.click('.diyagram-yatay .kenar-ekle[data-sonra="coder"]');
        await page.waitForSelector("#yeniRolId", { timeout: 10_000 });

        // NEREYE GİRECEĞİ ÖNCEDEN SÖYLENMİŞ: başlık VE "sonra" seçimi.
        const baslik = await page.textContent(".panel h2");
        expect(baslik).toContain("coder");
        expect(baslik).toContain("reviewer");
        const sonraSecili = await page.evaluate(() =>
          (document.querySelector("#yeniRolSonra") as unknown as { value: string } | null)?.value);
        expect(sonraSecili).toBe("coder");

        await page.fill("#yeniRolId", "ortadaki");
        await page.selectOption("#yeniRolProvider", "claude");
        await page.fill("#yeniRolWorkspace", "ortadaki");
        await page.click('button:has-text("Rolü ekle")');
        // BAŞARILI EKLEME paneli KAPATIYOR (bkz. yeniRolGonder: ciz(model)
        // + location.hash = "") — iddia panoda, panelin içinde değil;
        // "prompt panelinden yeni rol ekleniyor" sınamasıyla AYNI kalıp.
        await page.waitForSelector('.colhead:has-text("ortadaki")', { timeout: 10_000 });

        const yaml = await readFile(join(root, "hub", "flows", "gunluk-tek.yaml"), "utf8");
        expect(yaml).toMatch(/id: coder[\s\S]*next: ortadaki/);
        expect(yaml).toMatch(/id: ortadaki[\s\S]*next: reviewer/);
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    /**
     * DİYAGRAMDAN ROL ÇIKARMA — bu kartın 3. isteği, ZİNCİR KOPMADAN.
     *
     * server.test.ts'teki HTTP sınaması AYNI iddiayı tarayıcı olmadan
     * kanıtlıyor; bu sınama GERÇEK tıklamanın (düğüm seç → "Rolü sil" →
     * kaydet) aynı sonucu ürettiğini kanıtlıyor — page.ts'teki `rolSil`in
     * KENDİSİ koşuyor, HTTP gövdesi elle kurulmuyor.
     */
    const UCLU_FLOW = `
name: uclu
constitution:
  - ../prompts/base.md
roles:
  - id: coder
    provider: claude
    workspace: main
    prompt: ../../roles/coder.prompt
    next: reviewer

  - id: reviewer
    provider: claude
    workspace: reviewer
    prompt: ../../roles/coder.prompt
    receive: batch
    syncBack: [coder]
    reject: coder
    next: gatekeeper

  - id: gatekeeper
    provider: claude
    workspace: gatekeeper
    prompt: ../../roles/coder.prompt
    receive: batch
    reject: reviewer
    next: done
`;

    it("diyagramdan rol silinince zincir KOPMUYOR, çıkarılan role işaret eden kenarlar TEMİZLENİYOR", async () => {
      const s = await akisSunucusuDuzenlenebilirAc("uclu", UCLU_FLOW);
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.waitForSelector("#bar .pill", { timeout: 15_000 });
        await page.click('button:has-text("Akışı düzenle")');
        await page.waitForSelector('.diyagram-yatay .dugum[data-rol="reviewer"]', { timeout: 10_000 });

        await page.click('.diyagram-yatay .dugum[data-rol="reviewer"]');
        await page.waitForSelector('button:has-text("Rolü sil")', { timeout: 10_000 });
        await page.click('button:has-text("Rolü sil")');

        // DÜĞÜM GERÇEKTEN GİTTİ — hem reviewer'ın kendisi hem de düzenleme
        // formu (seçim temizlendi, bkz. diyagramRolSil yorumu).
        await page.waitForSelector('.diyagram-yatay .dugum[data-rol="reviewer"]', { state: "detached", timeout: 10_000 });
        expect(await page.evaluate(() => document.querySelectorAll(".diyagram-sarmal .rol").length)).toBe(0);

        await page.waitForSelector("#kaydet:not([disabled])", { timeout: 10_000 });
        await page.click("#kaydet");
        await page.waitForTimeout(500);

        const yaml = await readFile(join(root, "hub", "flows", "uclu.yaml"), "utf8");
        expect(yaml).not.toContain("reviewer");
        // ZİNCİR KOPMADI: coder artık DOĞRUDAN gatekeeper'a next veriyor.
        expect(yaml).toMatch(/id: coder[\s\S]*next: gatekeeper/);
        // ÇIKARILAN ROLE İŞARET EDEN reject TEMİZLENDİ — "reviewer" artık
        // hiçbir rolün reject hedefi değil.
        expect(yaml).not.toMatch(/reject: reviewer/);
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    /**
     * KURAL İHLALİ DİYAGRAMDA DA ANINDA GÖRÜNÜYOR — bu kartın 4. isteği.
     * `load.ts`nin mesajı OLDUĞU GİBİ basılıyor, yeniden yazılmıyor (bkz.
     * `onizle` yorumu): burada o mesajın GERÇEKTEN diyagram sekmesinin
     * önizleme kutusuna düştüğü kanıtlanıyor, "Ham YAML" sekmesine
     * geçmeden.
     */
    it("diyagramdan geçersiz bir değişiklik yapınca kural mesajı EKRANDA (diyagram sekmesinde) görünüyor", async () => {
      const s = await akisSunucusuDuzenlenebilirAc("gunluk-tek", GUNLUK_TEK_FLOW);
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.waitForSelector("#bar .pill", { timeout: 15_000 });
        await page.click('button:has-text("Akışı düzenle")');
        await page.waitForSelector(".diyagram-yatay .dugum", { timeout: 10_000 });

        await page.click('.diyagram-yatay .dugum[data-rol="coder"]');
        await page.waitForSelector(".diyagram-sarmal .rol", { timeout: 10_000 });
        // reviewer'IN workspace'İYLE AYNI değeri vererek kural 2'yi ihlal
        // ettiriyoruz ("aynı workspace'i paylaşan iki rol reddedilir").
        await page.fill('.diyagram-sarmal .rol label:has-text("workspace") input', "reviewer");
        // "change" olayını elle tetikliyoruz: alan()'daki dinleyici ona
        // bağlı, 'fill' tek başına tetiklemeyebilir (bkz. "Ham YAML"
        // sınamasındaki AYNI not). ':has-text()' Playwright'ın KENDİ
        // seçici motoru — düz DOM'da (`page.evaluate` içinde) ÇALIŞMAZ,
        // o yüzden burada etiket metnine göre elle arıyoruz.
        await page.evaluate(() => {
          const etiketler = Array.from(document.querySelectorAll(".diyagram-sarmal .rol label"));
          const workspaceEtiketi = etiketler.find((l) => (l.textContent ?? "").startsWith("workspace"));
          workspaceEtiketi?.querySelector("input")?.dispatchEvent(new Event("change", { bubbles: true }));
        });

        await page.waitForSelector("#onizleme .err", { timeout: 10_000 });
        const mesaj = await page.textContent("#onizleme .err");
        expect(mesaj).toContain("kural");
        // GEÇERSİZKEN KAYDET KAPALI — hiçbir yarım taslak dosyaya düşemez.
        expect(await page.evaluate(() =>
          (document.querySelector("#kaydet") as unknown as { disabled: boolean } | null)?.disabled)).toBe(true);
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    /**
     * KAYBOLAN ALAN OLMAZ — diyagramdan TEK bir kenar değiştirilince.
     *
     * `fromFlow`/`toYaml` bu garantiyi ZATEN taşıyor (bkz. flow/draft.ts
     * ve draft.test.ts "ekranın modellemediği bloklar korunuyor") ama o
     * sınama `FlowDraft` nesnesini ELLE kuruyor — diyagramın GERÇEKTEN
     * ürettiği taslağın da aynı yoldan geçtiğini kanıtlamıyor. Burada
     * yorumlu, `audit` ve "planlama" (ekranın hiç MODELLEMEDİĞİ bir blok)
     * taşıyan bir akışta diyagramdan TEK bir syncBack kenarı ekleniyor;
     * iddia geri kalan HER ŞEYİN yerinde durduğu.
     */
    it("diyagramdan bir kenar değişince yorumlar, audit ve planlama bloğu AYNEN duruyor", async () => {
      const PLANLI_FLOW = `# Üst başlık yorumu
# İkinci satır

name: planli
constitution:
  - ../prompts/base.md
roles:
  - id: coder
    provider: claude
    workspace: main
    prompt: ../../roles/coder.prompt
    next: reviewer

  - id: reviewer
    provider: claude
    workspace: reviewer
    prompt: ../../roles/coder.prompt
    receive: batch
    reject: coder
    next: done

audit:
  enabled: true
  fingerprint: [name, roles]

planlama:
  katilimcilar: [coder]
  plan: docs/plan/{kart}.md
  denetci: reviewer
`;
      const yol = join(root, "hub", "flows", "planli.yaml");
      const s = await akisSunucusuDuzenlenebilirAc("planli", PLANLI_FLOW);
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.waitForSelector("#bar .pill", { timeout: 15_000 });
        await page.click('button:has-text("Akışı düzenle")');
        await page.waitForSelector('.diyagram-yatay .dugum[data-rol="reviewer"]', { timeout: 10_000 });

        // TEK KENAR DEĞİŞİKLİĞİ: reviewer'a bir syncBack hedefi (coder)
        // ekliyoruz — GERİYE işaret ettiği için kural 13'ü ihlal etmez.
        await page.click('.diyagram-yatay .dugum[data-rol="reviewer"]');
        await page.waitForSelector(".diyagram-sarmal .rol", { timeout: 10_000 });
        await page.click(".syncback-oge:has-text('coder') input[type=checkbox]");
        await page.waitForSelector("#kaydet:not([disabled])", { timeout: 10_000 });
        await page.click("#kaydet");
        await page.waitForTimeout(500);

        const yazilan = await readFile(yol, "utf8");
        // DEĞİŞEN: yeni kenar GERÇEKTEN dosyada.
        expect(yazilan).toMatch(/id: reviewer[\s\S]*syncBack:\s*\n\s*- coder/);
        // DEĞİŞMEYEN — hepsi AYNEN duruyor:
        expect(yazilan).toContain("# Üst başlık yorumu");
        expect(yazilan).toContain("# İkinci satır");
        expect(yazilan).toContain("audit:");
        expect(yazilan).toContain("fingerprint:");
        expect(yazilan).toContain("planlama:");
        expect(yazilan).toContain("denetci: reviewer");
        expect(yazilan).toContain("plan: docs/plan/{kart}.md");
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);
  });

  /**
   * SEKME İSKELETİ — üst çubuktaki dört sekme hash ile yönleniyor ve
   * GERÇEKTEN içerik değiştiriyor (kart c-20261105-6d7f66).
   *
   * Yalnızca kaynak metin (page.test.ts'teki sekmeAdi sınaması) "hangi
   * sekme aktif sayılır" kararını ölçebilir; "tıklanınca board GERÇEKTEN
   * gizleniyor mu, Pano'ya dönünce sütunlar hâlâ duruyor mu" sorusu
   * yalnızca gerçek DOM'da görünür.
   */
  it("sekmeler arasında geçiş board'u gizleyip yer tutucuyu gösteriyor, Pano'ya dönünce sütunlar aynen duruyor", async () => {
    const { page, hatalar } = await ac();
    try {
      await page.waitForSelector("#bar .pill", { timeout: 15_000 });
      // Başlangıçta Pano görünür, Akışlar gizli.
      expect(await page.evaluate(() =>
        getComputedStyle(document.querySelector("#icerikPano")).display)).not.toBe("none");
      expect(await page.evaluate(() =>
        getComputedStyle(document.querySelector("#icerikAkislar")).display)).toBe("none");

      await page.click('.navSekme:has-text("Akışlar")');
      await page.waitForSelector("#icerikAkislar", { state: "visible", timeout: 10_000 });
      expect(await page.evaluate(() =>
        getComputedStyle(document.querySelector("#icerikPano")).display)).toBe("none");
      expect(await page.evaluate(() =>
        document.querySelector(".navSekme-aktif")?.textContent ?? "")).toContain("Akışlar");

      // GERİ DÖNÜŞ: Pano'nun kendi board'u (sütunlar) hâlâ DOM'da —
      // sekme değişimi onu YOK ETMEDİ, yalnızca gizledi.
      await page.click('.navSekme:has-text("Pano")');
      await page.waitForSelector("#icerikPano", { state: "visible", timeout: 10_000 });
      expect(await page.evaluate(() =>
        getComputedStyle(document.querySelector("#icerikAkislar")).display)).toBe("none");
      expect(await page.evaluate(() => document.querySelectorAll(".col").length)).toBeGreaterThan(0);
      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);
});
