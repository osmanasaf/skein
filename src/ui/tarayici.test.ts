import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
import { EventLog } from "../events/log.js";
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
 * tipini döndürüyor, iç içe aramalar için (bkz. formasyon düğümü/kare
 * sınamaları).
 */
type El = {
  textContent: string | null;
  style: { display: string };
  classList: { contains: (c: string) => boolean };
  /** Rol düğümünün "data-rol"u, kart karesinin sınıfı vb. okumak için. */
  getAttribute: (ad: string) => string | null;
  querySelector: (s: string) => El | null;
  /**
   * Formasyon genişliği sınaması `width` ister; uçuş sınamaları (düğüm
   * MERKEZİNİ bulmak için) `height` de ister — ikisi AYNI alanın parçası,
   * ikinci bir "ölçü" türü İCAT ETMEDEN burada genişletildi.
   */
  getBoundingClientRect: () => { top: number; left: number; width: number; height: number };
  /** Yalnızca akış düzenleyicisinin 'change' dinleyicisini elle tetiklemek
   * için — bkz. "Ham YAML" sınaması: 'fill' yalnızca 'input' yayıyor. */
  dispatchEvent: (e: unknown) => void;
  /** Yalnızca `<details>` öğesinde var — bkz. sağ panelin kapı gerekçesi sınaması. */
  open?: boolean;
  /** Yalnızca `<textarea>` değerini okumak için — bkz. "Prompt" düğmesi sınaması. */
  value?: string;
  /** Yalnızca "Rolleri düzenle" ad girişini odaktan ÇIKARMAK için — bkz. o sınamanın yorumu. */
  blur?: () => void;
};
declare const document: {
  querySelector: (s: string) => El | null;
  querySelectorAll: (s: string) => ArrayLike<El>;
  /** Yalnızca bildirim ve "Rol kaybolursa" sınamaları için. */
  getElementById: (id: string) => El | null;
  body: unknown;
  /** Yalnızca "Akışlar sekmesi" describe'ındaki Escape sınaması için. */
  dispatchEvent: (e: unknown) => void;
  /** Yalnızca "tema anahtarı" describe'ı için — <html>'in "data-theme" niteliğini okur. */
  documentElement: { getAttribute: (ad: string) => string | null };
};
/** Yalnızca 'change' olayını elle kurup yaymak için — bkz. yukarıdaki not. */
declare class Event {
  constructor(type: string, init?: { bubbles?: boolean });
}
/** Yalnızca Escape tuşunu ELLE kurup yaymak için — bkz. "Akışlar sekmesi" describe'ındaki Escape sınaması. */
declare class KeyboardEvent extends Event {
  constructor(type: string, init?: { key?: string; bubbles?: boolean });
}
/**
 * Zemin rengi, kuş işaretinin GERÇEK rengi (currentColor'ın çözüldüğü
 * `color`) ve kanat çırpma animasyonunun adı için — gökyüzü paleti, marka
 * kuşu ve kanat çırpma sınamalarının ihtiyacı kadar.
 */
declare function getComputedStyle(
  el: unknown,
): {
  backgroundColor: string; color: string; animationName: string;
  /** Yalnızca diyagramın dar/geniş ekranda hangi kopyasının göründüğü
   * sınaması için — bkz. akış diyagramı describe'ı. */
  display: string;
  /** Yalnızca başlık fontu sınaması için — bkz. "başlık fontu" describe'ı
   * altındaki test (kart c-20261105-6d7f66, reddin gerekçesi). */
  fontFamily: string;
  /** Yalnızca DEVIR-DENETIM'in köşe yarıçapı/kenar ölçümleri için (DEVIR.md
   * Fidelity: "köşe yarıçapı 0 her yerde" + "tüm durum noktaları kare, 2px
   * kenar; yuvarlak hiçbir şey yok" — bkz. ".mini", ".railGozcuNokta",
   * ".iz .rail i", ".dialog .err" sınamaları). */
  borderRadius: string;
  borderWidth: string;
};
/**
 * page.ts'in gömülü betiği MODÜL DEĞİL (düz `<script>`) — üst düzey
 * `function`/`let` bildirimleri aynı global ortamda görünür. Yalnızca
 * "Rol modundaki rol kaybolursa" sınaması için: RAIL'i doğrudan kurup
 * GERÇEK ciz() ile çizdiriyor (bkz. o sınamanın yorumu).
 */
/**
 * Uçuş sınaması kuşun konumunu TARAYICIDA kare kare örnekliyor (bkz.
 * "Uçuş — devredilen kartın V üzerinde uçması"). Projenin `lib`'i
 * bilerek `dom` içermiyor (yukarıdaki `document` notu), o yüzden
 * gereken iki ad da aynı desenle, EN AZ yüzeyle bildiriliyor.
 */
declare function requestAnimationFrame(cb: () => void): number;
declare const performance: { now: () => number };

declare let RAIL: { mode: string; roleId: string | null; cardId: string | null; cardFrom: string };
declare let SON_MODEL: unknown;
declare function ciz(m: unknown): void;

type Tarayici = { newPage: (o?: unknown) => Promise<Sayfa>; close: () => Promise<void> };
type Sayfa = {
  goto: (url: string, o?: unknown) => Promise<unknown>;
  /** Yalnızca "tema anahtarı" describe'ı için — seçimin GERÇEK bir sayfa yenilemesinde korunduğunu ölçer. */
  reload: (o?: unknown) => Promise<unknown>;
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
      // İddia "bir düğüm var" DEĞİL, "pano FORMASYONU gösteriyor" — tek
      // rolli akışta (`coder`) o rol tek başına TEPEDE durmalı (DEVIR.md:
      // "tek rol varsa tepede") ve çıkış kutusu (biten kart sayısı) orada.
      const dugumler = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".formasyonDugum")).map((e) => e.getAttribute("data-rol")));
      expect(dugumler).toEqual(["coder"]);
      const cikisSayisi = await page.textContent(".formasyonCikis text");
      expect(cikisSayisi).toBe("0");
      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  /**
   * ZEMİN RENGİ — hesaplanan arka plan ve konsol temiz.
   *
   * `page.test.ts` yalnızca KAYNAK METNİ sınıyor: `:root` bloğunda doğru
   * hex yazdığını görür ama tarayıcının o CSS'i GERÇEKTEN uyguladığını
   * göremez (yanlış seçici, atlanmış bir blok, vb. kaynak metinde de
   * dururdu). Bu sınama `getComputedStyle` ile GERÇEK çizimi ölçüyor —
   * hem açık hem koyu temada, token-kontrast.test.ts'teki değerlerle
   * AYNI token'lara karşı (bu dosyadaki hex'ler o testteki hex'lerin
   * kopyası DEĞİL, page.ts'teki --bg'nin rgb karşılığı; ikisi birlikte
   * aynı kaynağı iki açıdan doğruluyor).
   *
   * AÇIK değer kart c-20261106-e62847'den beri "gökyüzü" DEĞİL (UX.md
   * §3.2 bonusu) — --bg'nin açık hex'i Modernist --color-bg'ye hizalandı
   * (#f3f2f2), bu testin adı ve beklediği rgb de ONUNLA güncellendi. KOYU
   * değer BİLEREK dokunulmadı (görev metni "açık temada" diyor) — alttaki
   * sınama hâlâ eski "gökyüzü" ailesinin koyu ucunu (#0B1118) ölçüyor.
   */
  it("açık temada zemin artık Modernist'in nötr grisi (eski 'gökyüzü' mavisi DEĞİL), konsol temiz", async () => {
    const { page, hatalar } = await acTema("light");
    try {
      await page.waitForSelector("#bar .pill", { timeout: 15_000 });
      const zemin = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      // --bg (açık, kart c-20261106-e62847'den ÖNCE): #E7ECF2 → rgb(231, 236, 242).
      expect(zemin).not.toBe("rgb(231, 236, 242)");
      // --bg (açık, ARTIK): #f3f2f2 → rgb(243, 242, 242) — --color-bg'yle AYNI hex.
      expect(zemin).toBe("rgb(243, 242, 242)");
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

  /** "rgb(r, g, b)" metninden 0-255 arası ORTALAMA kanal (kaba parlaklık). */
  function parlaklik(rgb: string): number {
    const esle = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(rgb);
    if (!esle) throw new Error("rgb ayrıştırılamadı: " + rgb);
    return (Number(esle[1]) + Number(esle[2]) + Number(esle[3])) / 3;
  }

  /**
   * ÖLÇÜLEN KUSUR — kart c-20261106-e62847. Operatörün ölçtüğü hâl:
   * koyu temada ".railKapiKutu" (sağ panelin kapı kutusu, accent-100
   * zeminli) rgb(255, 242, 239) basıyordu — gövde rgb(11, 17, 24) iken
   * parlaklık 245/255, ekranın en önemli kutusunun (kapı kararı) üstünde
   * NEREDEYSE BEYAZ bir blok. Bu sınama tam o yüzeyi, GERÇEK tarayıcıda
   * `getComputedStyle` ile ölçüyor — `token-kontrast.test.ts` kaynak
   * METNİ ayrıştırıyor, bu dosyanın başındaki "#bar koyu temada" sınaması
   * gibi "nitelik doğru" ile "ekranda doğru" AYRI iddialar (SAPMALAR.md
   * §2.7).
   */
  it("koyu temada '.railKapiKutu' artık gövdeden >100 parlaklık birimi uzak PARLAK bir yüzey DEĞİL", async () => {
    await queue.add(newCard({ title: "zaman asimi", task: "iş", topology }));
    const taken = await al(queue, "coder");
    await queue.escalate(taken, "sebep");

    const { page, hatalar } = await acTema("dark");
    try {
      await page.waitForSelector(".railKapiKutu", { timeout: 15_000 });
      const kutuZemin = await page.evaluate(() =>
        getComputedStyle(document.querySelector(".railKapiKutu")).backgroundColor);
      const govdeZemin = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

      // ESKİ (kusurlu) değer tam olarak bu — KARŞIT iddia, regresyonu pinler.
      expect(kutuZemin).not.toBe("rgb(255, 242, 239)");
      // YENİ değer: --color-accent-100'ün koyu ezmesi, #4d170e → rgb(77, 23, 14).
      expect(kutuZemin).toBe("rgb(77, 23, 14)");

      const fark = Math.abs(parlaklik(kutuZemin) - parlaklik(govdeZemin));
      expect(fark).toBeLessThanOrEqual(100);

      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  /**
   * ÖLÇÜLEN KUSUR (devamı) — reviewer'ın reddi (bu kenarda 1. ret,
   * reddedilen commit 36ae34a). Üstteki ".railKapiKutu" düzeltmesi
   * accent-100 ZEMİNİNİ ezdi ama color-neutral-400/500'ü (FILL rolünde
   * kullanılan iki ayrı token) hiç ezmedi. ".lejant .kare.kuyrukta" (ana
   * panonun ALTINDAKİ lejant — queue-square-fill/neutral-500) hep çizili,
   * hiçbir kuyruklu kart gerekmiyor. Ölçtü: koyu gövde #1A1817 (parlaklık
   * 24.3), neutral-500 ham değeri (#9b9797) parlaklık 152.3, fark 128 —
   * kartın kendi 100 birimlik eşiğini AŞIYOR.
   */
  it("koyu temada '.lejant .kare.kuyrukta' (kuyruk dolgusu, queue-square-fill) artık gövdeden >100 parlaklık birimi uzak PARLAK bir yüzey DEĞİL", async () => {
    const { page, hatalar } = await acTema("dark");
    try {
      await page.waitForSelector("#lejant", { timeout: 15_000 });
      const kareZemin = await page.evaluate(() =>
        getComputedStyle(document.querySelector(".lejant .kare.kuyrukta")).backgroundColor);
      const govdeZemin = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

      // ESKİ (kusurlu) değer tam olarak bu — KARŞIT iddia, regresyonu pinler.
      expect(kareZemin).not.toBe("rgb(155, 151, 151)"); // #9b9797
      // YENİ değer: --color-neutral-500'ün koyu ezmesi, #605d5d → rgb(96, 93, 93).
      expect(kareZemin).toBe("rgb(96, 93, 93)");

      const fark = Math.abs(parlaklik(kareZemin) - parlaklik(govdeZemin));
      expect(fark).toBeLessThanOrEqual(100);

      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  /**
   * AYNI kusurun İKİNCİSİ — SAPMALAR §1'in "gözcünün açık mı kapalı mı
   * olduğunu söyleyen ANA işaret" dediği ".railGozcuNokta" (sağ paneldeki
   * gözcü göstergesi, burada "unmanaged" — ekran gözcü bayrakları olmadan
   * açıldı, varsayılan `server` kurulumu budur). daemon-dot-off-fill de
   * neutral-400 üzerinden geliyordu, AYNI şekilde hiç ezilmiyordu. Ölçtü:
   * neutral-400 ham değeri (#bab6b6) parlaklık 183.3, gövdeden fark 159.
   * ".dot.off/.unmanaged" (üst çubuktaki küçük hap) AYNI token zincirine
   * bağlı — burada AYRICA ölçülmüyor, token-kontrast.test.ts'in "SAPMALAR
   * §2.5" takımı token SEVİYESİNDE ikisini de kapsıyor.
   */
  it("koyu temada '.railGozcuNokta.unmanaged' (gözcü ANA göstergesi, daemon-dot-off-fill) artık gövdeden >100 parlaklık birimi uzak PARLAK bir yüzey DEĞİL", async () => {
    const { page, hatalar } = await acTema("dark");
    try {
      await page.waitForSelector("#bar .pill", { timeout: 15_000 });
      await page.click("#bar .pill");
      await page.waitForSelector(".railGozcuNokta.unmanaged", { timeout: 10_000 });
      const noktaZemin = await page.evaluate(() =>
        getComputedStyle(document.querySelector(".railGozcuNokta.unmanaged")).backgroundColor);
      const govdeZemin = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

      // ESKİ (kusurlu) değer tam olarak bu — KARŞIT iddia, regresyonu pinler.
      expect(noktaZemin).not.toBe("rgb(186, 182, 182)"); // #bab6b6
      // YENİ değer: --color-neutral-400'ün koyu ezmesi, #444141 → rgb(68, 65, 65).
      expect(noktaZemin).toBe("rgb(68, 65, 65)");

      const fark = Math.abs(parlaklik(noktaZemin) - parlaklik(govdeZemin));
      expect(fark).toBeLessThanOrEqual(100);

      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  /**
   * TEMA ANAHTARI — kart c-20261106-e62847 (UX.md: "operatör koyu temayı
   * kapatamıyor"). Üç sınama: anında uygulanıyor (ağ isteğini beklemeden),
   * sunucudan BAĞIMSIZ bir OS tercihini EZEBİLİyor (var olan data-theme
   * kaçış yolu artık bir ARAYÜZDEN tetikleniyor), ve seçim sayfa
   * YENİDEN AÇILINCA (gerçek bir `page.reload`, .skein/ekran.json'dan)
   * korunuyor.
   */
  describe("tema anahtarı", () => {
    it("'Koyu' tıklanınca OS açık olsa da ANINDA koyulaşır VE yeniden açılışta KORUNUR", async () => {
      const { page, hatalar } = await acTema("light");
      try {
        await page.waitForSelector(".temaAnahtari", { timeout: 15_000 });
        expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))
          .toBe("rgb(243, 242, 242)");

        await page.click('.temaBtn:has-text("Koyu")');
        expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme")))
          .toBe("dark");
        expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))
          .toBe("rgb(11, 17, 24)");
        // Düğmenin KENDİSİ de "secili" olarak güncelleniyor — bir sonraki
        // saniyelik yoklamaya kadar beklemeden (temaSec, ciz(SON_MODEL)).
        // NOT: ":has-text" Playwright'ın KENDİ seçici motoru — düz
        // `document.querySelector` içinde geçersiz, bu yüzden `evaluate`
        // İÇİNDE metinle eşleştirme elle yapılıyor.
        expect(await page.evaluate(() =>
          Array.from(document.querySelectorAll(".temaBtn"))
            .find((b) => b.textContent === "Koyu")
            ?.classList.contains("secili")))
          .toBe(true);

        // SAYFA YENİDEN AÇILIYOR — tarayıcı belleği değil, GERÇEK bir
        // istek ve GERÇEK .skein/ekran.json okuması.
        await page.reload({ waitUntil: "networkidle" });
        await page.waitForSelector(".temaAnahtari", { timeout: 15_000 });
        expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme")))
          .toBe("dark");
        expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))
          .toBe("rgb(11, 17, 24)");

        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
      }
    }, 60_000);

    it("OS koyuyken 'Açık' seçilince gövde AÇIK kalır (mevcut kaçış yolu, şimdi arayüzden)", async () => {
      const { page, hatalar } = await acTema("dark");
      try {
        await page.waitForSelector(".temaAnahtari", { timeout: 15_000 });
        expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))
          .toBe("rgb(11, 17, 24)");

        await page.click('.temaBtn:has-text("Açık")');
        expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme")))
          .toBe("light");
        expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))
          .toBe("rgb(243, 242, 242)");

        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
      }
    }, 60_000);

    it("'Sistem' seçimine geri dönünce OS tercihi yeniden izlenir", async () => {
      const { page, hatalar } = await acTema("dark");
      try {
        await page.waitForSelector(".temaAnahtari", { timeout: 15_000 });
        await page.click('.temaBtn:has-text("Açık")');
        expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))
          .toBe("rgb(243, 242, 242)");

        await page.click('.temaBtn:has-text("Sistem")');
        expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme")))
          .toBeNull();
        // OS "dark" ile açıldı (acTema("dark")) — "sistem" bunu izler.
        expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))
          .toBe("rgb(11, 17, 24)");

        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
      }
    }, 60_000);
  });

  /**
   * --solid-accent — kart c-20261106-e62847. ".yeniKart"/".railBtn.primary"/
   * ".navRozet-accent" dolgulu beyaz-metin düğmeleri ARTIK --color-accent-700
   * DEĞİL, --solid-accent kullanıyor (bkz. page.ts'teki SOLID-* yorumu):
   * --color-accent-700 koyu temada AÇIK bir değere dönüyor (accent-100
   * zemini üstünde ink rolü için), ama bu düğmelerin dolgusu HER ZAMAN
   * koyu kalmalı (üstündeki metin beyaz). AÇIK temada ikisi AYNI hex
   * olduğu için (ae1800) bu ayrım yalnızca KOYU temada GÖRÜNÜR — ".dialog
   * .railBtn.primary" sınaması (yukarıda, "Yeni akış" describe'ı) SADECE
   * açık temada koşuyor, bu yüzden bu regresyonu YAKALAYAMAZDI. Bu sınama
   * AÇIKÇA koyu temada ölçüyor.
   */
  it("koyu temada 'Yeni kart' düğmesi HÂLÂ koyu dolgulu (--solid-accent, --color-accent-700'ün koyu-tema AÇIK değerine DÖNMEDİ)", async () => {
    const { page, hatalar } = await acTema("dark");
    try {
      await page.waitForSelector("#bar .pill", { timeout: 15_000 });
      const zemin = await page.evaluate(() =>
        getComputedStyle(document.querySelector('button.yeniKart')).backgroundColor);
      // --solid-accent: #ae1800 → rgb(174, 24, 0) — temadan bağımsız.
      expect(zemin).toBe("rgb(174, 24, 0)");
      // KARŞIT İDDİA: --color-accent-700'ün koyu-tema (ink) değeri, #ffc4b8
      // → rgb(255, 196, 184) — bu düğme BUNA dönerse beyaz "+" metni
      // okunmaz hâle gelirdi.
      expect(zemin).not.toBe("rgb(255, 196, 184)");
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
      // Kart panoda bir "kart karesi" olarak görünür — DOM'da ayrı bir
      // `.card` kutusu değil, V formasyonundaki `coder` düğümünün altında
      // küçük bir kare (bkz. page.ts formasyonSvgKur/kareDurumu).
      await page.waitForSelector('.formasyonDugum[data-rol="coder"] .kare-kuyrukta', { timeout: 10_000 });

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
   * ÜST ÇUBUK "TOPLAM MALİYET" — ALT SINIR işareti (SAPMALAR.md §2.1,
   * denetim kartı c-20261105-387d01). `page.test.ts`'teki `maliyetMetni`
   * sınaması kaynak metni doğruluyor ama bu DEĞER gerçekten `#bar`'a
   * YAZILIYOR mu, `m.totals.olculmeyen` GERÇEK bir modelden mi geliyor —
   * bunu yalnızca sayfa GERÇEKTEN çizilince görülür. Zaman aşımına
   * uğramış (dolar YOK, token akıştan kurtarılmış) bir aktivasyonun
   * yanına dolar bildiren normal bir aktivasyon ekleniyor: toplam SIFIR
   * DEĞİL ama eksik — "≥" bunu söylemeli, düz rakam SAKLAMAMALI.
   */
  it("üst çubuk: zaman aşımına uğrayan tur varsa 'toplam maliyet' ÖNÜNDE '≥' gösterir", async () => {
    const kart = await queue.add(newCard({ title: "zaman aşımı", task: "iş", topology }));
    await al(queue, "coder");
    const log = new EventLog(join(root, ".skein", "olaylar.jsonl"), "kosu-1");
    await log.append({
      type: "agent.finished", cell: `${kart.id}:coder`, exitCode: 0, durationMs: 1_000,
      usage: { costUsd: 0.5 },
    });
    // Aynı hücreye ikinci bir aktivasyon: zaman aşımı, dolar YOK, token akıştan kurtarılmış.
    await log.append({
      type: "agent.finished", cell: `${kart.id}:coder`, exitCode: 137, durationMs: 1_200_000,
      timedOut: true, usage: { inputTokens: 3_000_000, outputTokens: 40_000, kismi: true },
    });

    const { page, hatalar } = await ac();
    try {
      await page.waitForSelector("#bar .sayac", { timeout: 15_000 });
      const barMetni = await page.textContent("#bar");
      expect(barMetni).toContain("toplam maliyet ≥$0.50");
      expect(hatalar).toEqual([]);
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
   * GÖZCÜ PANELİ — MOD 4 (DEVIR.md §2, kart c-20261105-92d731).
   *
   * Önceki kart çipi "tek başına tıklanabilir DEĞİL" diye not etmişti
   * (sağ panel henüz yoktu). Bu takım o notu kapatan gerçek davranışı
   * tarayıcıda ölçüyor: `page.test.ts` yalnızca KARAR fonksiyonlarını
   * (gozcuPanelDurum/gozcuTopoUyari/gozcuEylemEtiketi) SAF olarak sınıyor —
   * çipin GERÇEKTEN tıklanabilir olduğu, paneli AÇTIĞI ve doğru düğmenin
   * gözcüyü GERÇEKTEN başlattığı/durdurduğu yalnızca burada görünür
   * (tıpkı "Gözcüyü durdur"ın hiçbir şeyi durdurmadığı üç kusurun ancak
   * tarayıcıda çıktığı gibi, bkz. dosya başı yorumu).
   */
  it("gözcü çipine tıklayınca sağ panel açılır — unmanaged: düğme yok, iki komut", async () => {
    const { page } = await ac();
    try {
      await page.waitForSelector("#bar .pill", { timeout: 15_000 });
      await page.click("#bar .pill");
      await page.waitForSelector(".railGozcuBaslik", { timeout: 10_000 });
      expect(await page.textContent(".railGozcuBaslik")).toBe("gözcü · elle");
      const komutlar = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".railGozcuKomut")).map((e) => e.textContent ?? ""));
      expect(komutlar.length).toBe(2);
      expect(komutlar[0]).toContain("src/watch/cli.ts");
      expect(komutlar[1]).toContain("src/ui/cli.ts");
      const dugmeVar = await page.evaluate(() => Boolean(document.querySelector(".railGozcuEylemler button")));
      expect(dugmeVar).toBe(false);
    } finally {
      await page.close();
    }
  }, 60_000);

  /**
   * DEVIR-DENETIM: DEVIR.md Interactions & Behavior — "Tüm durum noktaları
   * kare (10px, 2px kenar); yuvarlak hiçbir şey yok." Gözcü paneli
   * noktası (`.railGozcuNokta`, "gözcünün açık mı kapalı mı olduğunu
   * söyleyen ANA işaret" — bkz. SAPMALAR §1 gerekçesi) 14×14px ÇİZİLİYORDU,
   * üst çubuktaki eşdeğeri (`.dot`, 10×10) ile TUTARSIZ — hiçbir sınama bu
   * boyutu GERÇEK TARAYICIDA ölçmüyordu (SAPMALAR §2.7 sınıfı boşluk).
   */
  it("gözcü panelindeki durum noktası 10×10px, 2px kenarlı (üst çubuktaki .dot ile AYNI ölçü)", async () => {
    const { page, hatalar } = await ac();
    try {
      await page.waitForSelector("#bar .pill", { timeout: 15_000 });
      await page.click("#bar .pill");
      await page.waitForSelector(".railGozcuNokta", { timeout: 10_000 });
      const olcu = await page.evaluate(() => {
        const n = document.querySelector(".railGozcuNokta");
        if (!n) return null;
        const r = n.getBoundingClientRect();
        const s = getComputedStyle(n);
        return { w: r.width, h: r.height, kenar: s.borderWidth, kose: s.borderRadius };
      });
      expect(olcu).toEqual({ w: 10, h: 10, kenar: "2px", kose: "0px" });
      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  /**
   * Gözcü bayraklarıyla açılan, sahte `spawn` alan ayrı bir sunucu — bu
   * takımın MANAGED sınamaları için.
   *
   * `alive` isteğe bağlı: varsayılanı HER ZAMAN true (eski davranış,
   * aşağıdaki çoğu sınama buna dayanıyor). "Yeniden başlat"ın otomatik
   * ikinci yarısını (gözcü GERÇEKTEN öldüğünde "/gozcu/baslat"ın kendiliğinden
   * tetiklenmesi) tarayıcıda sınamak bu değerin TEST SIRASINDA false'a
   * dönebilmesini gerektiriyor — bkz. aşağıdaki "Yeniden başlat tıklanınca…"
   * sınaması, reviewer ret notu (reddedilen commit 017d453): bu geçiş
   * eskiden yardımcının sabit `() => true`'u yüzünden tarayıcıda hiç
   * SINANAMAZ'dı.
   */
  async function yonetilenSunucu(gozcuAyar: {
    bayraklar?: string[];
    spawn?: (argv: string[]) => { pid: number; kill: () => void; onExit: (cb: () => void) => void };
    alive?: () => boolean;
  } = {}): Promise<{ s: UiServer; flow: { name: string; hash: string } }> {
    const flow = await loadFlow(join(root, "hub", "flows", "test.yaml"), { root, providers: knownProviderSet() });
    const s = await serveUi({
      root, queue, topology, flowName: flow.name, flowHash: flow.hash,
      // Bayat kilidin PID'i gerçek olmayabilir (4_194_305 gibi) — alive
      // override'ı o YOLU bozmuyor, pidAlive zaten test boyunca
      // KULLANILMIYOR (model her zaman verilen fonksiyona bakıyor).
      alive: gozcuAyar.alive ?? (() => true),
      gozcu: {
        komut: ["node", "-e", ""],
        bayraklar: gozcuAyar.bayraklar ?? ["--model", "claude:m"],
        spawn: (gozcuAyar.spawn ?? (() => ({ pid: 777, kill: () => {}, onExit: () => {} }))) as never,
      },
    });
    return { s, flow };
  }

  it("yönetilen ekranda kapalıyken panelden başlatmak gözcüyü GERÇEKTEN çalıştırır", async () => {
    const cagrilar: string[][] = [];
    const { s, flow } = await yonetilenSunucu({
      spawn: (argv) => {
        cagrilar.push(argv);
        // Gerçek gözcü kilidi KENDİSİ yazar (watch/cli.ts); sahte spawn
        // bunu SENKRON taklit ediyor — asenkron yazsaydı HTTP cevabındaki
        // model hâlâ "kapalı" okurdu (yarış), panel bir turluk YANLIŞ
        // durum gösterirdi.
        writeFileSync(join(root, ".skein", "daemon.json"), JSON.stringify({
          pid: 777, startedAt: new Date().toISOString(), flow: flow.name, hash: flow.hash, mode: "serve",
        }));
        return { pid: 777, kill: () => {}, onExit: () => {} };
      },
    });
    const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
    try {
      await page.goto(s.url, { waitUntil: "networkidle" });
      await page.waitForSelector("#bar .pill", { timeout: 15_000 });
      await page.click("#bar .pill");
      await page.waitForSelector(".railGozcuEylemler .railBtn", { timeout: 10_000 });
      expect(await page.textContent(".railGozcuEylemler .railBtn")).toBe("Gözcüyü başlat");

      await page.click(".railGozcuEylemler .railBtn");
      await page.waitForTimeout(400);
      expect(cagrilar).toEqual([["node", "-e", "", "test", "--serve", "--model", "claude:m"]]);
      expect(await page.textContent(".railGozcuBaslik")).toBe("gözcü açık");
    } finally {
      await page.close();
      await s.close();
    }
  }, 60_000);

  it("yönetilen ekranda AÇIK gözcüyü panelden durdurmak 'Süren tur bitiyor…' gösterir", async () => {
    // "Durdur" sunucuda YALNIZCA bu ekranın BAŞLATTIĞI süreci kabul ediyor
    // (SAPMALAR §2.6 kural 2) — o yüzden kilidi ELLE yazıp hemen durdurmayı
    // DENEMEK YERİNE önce GERÇEKTEN "Gözcüyü başlat"a basılıyor (sahte
    // spawn kilidi senkron yazıyor, bkz. önceki sınama), `cocuk` sunucuda
    // GERÇEKTEN kurulsun.
    const { s, flow } = await yonetilenSunucu({
      spawn: (argv) => {
        writeFileSync(join(root, ".skein", "daemon.json"), JSON.stringify({
          pid: 777, startedAt: new Date().toISOString(), flow: flow.name, hash: flow.hash, mode: "serve",
        }));
        return { pid: 777, kill: () => {}, onExit: () => {} };
      },
    });
    const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
    try {
      await page.goto(s.url, { waitUntil: "networkidle" });
      await page.waitForSelector("#bar .pill", { timeout: 15_000 });
      await page.click("#bar .pill");
      await page.waitForSelector(".railGozcuEylemler .railBtn", { timeout: 10_000 });
      await page.click(".railGozcuEylemler .railBtn"); // "Gözcüyü başlat"
      await page.waitForTimeout(400);
      expect(await page.textContent(".railGozcuEylemler .railBtn")).toBe("Gözcüyü durdur");

      await page.click(".railGozcuEylemler .railBtn"); // "Gözcüyü durdur"
      await page.waitForTimeout(400);
      const dugme = await page.evaluate(() => {
        const b = document.querySelector(".railGozcuEylemler button") as { textContent: string | null; disabled?: boolean } | null;
        return b ? { metin: b.textContent, devreDisi: Boolean(b.disabled) } : null;
      });
      expect(dugme).toEqual({ metin: "Süren tur bitiyor…", devreDisi: true });
      expect(await page.textContent(".railGozcuBaslik")).toBe("gözcü duruyor…");
      // SAPMALAR §2.6 kural 3'ün TAM cümlesi: "anlık değil" açıkça
      // yazılmalı (denetim kartı c-20261105-387d01) — düğme/başlık
      // "duruyor" dese de açıklama metni GERİ ALINIP "durdu" denebilir.
      expect(await page.textContent(".railGozcuAciklama")).toBe(
        "Durdurma sinyali gitti. Gözcü süren ajan turunu bitirip çıkacak — anlık değil.",
      );
    } finally {
      await page.close();
      await s.close();
    }
  }, 60_000);

  it("yönetilen ekranda bayat kilitte panel 'Kilidi devral ve başlat' gösterir, durdur YOK", async () => {
    // Bu sınama `yonetilenSunucu`nun "alive" override'ını KASITLI
    // KULLANMIYOR: override her pid'i canlı sayar, oysa "bayat kilit"in
    // GERÇEK anlamı pid'in GERÇEKTEN ölü olması — gerçek `pidAlive` ile
    // ölçülmesi gerekiyor.
    const flow = await loadFlow(join(root, "hub", "flows", "test.yaml"), { root, providers: knownProviderSet() });
    const s = await serveUi({
      root, queue, topology, flowName: flow.name, flowHash: flow.hash,
      gozcu: { komut: ["node"], bayraklar: [], spawn: (() => ({ pid: 1, kill: () => {}, onExit: () => {} })) as never },
    });
    // Ölü pid: "bayat kilitte gözcü düğmesi 'başlat' diyor" sınamasıyla AYNI
    // sabit (2^22 üstü Linux'ta ayrılmaz).
    await acquireLock(join(root, ".skein", "daemon.json"), {
      pid: 4_194_305, startedAt: new Date().toISOString(), flow: flow.name, hash: flow.hash, mode: "serve",
    });
    const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
    try {
      await page.goto(s.url, { waitUntil: "networkidle" });
      await page.waitForSelector("#bar .pill", { timeout: 15_000 });
      await page.click("#bar .pill");
      await page.waitForSelector(".railGozcuEylemler .railBtn", { timeout: 10_000 });
      expect(await page.textContent(".railGozcuEylemler .railBtn")).toBe("Kilidi devral ve başlat");
      const digerDugmeler = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".railGozcuEylemler button")).map((b) => b.textContent ?? ""));
      expect(digerDugmeler.some((d) => d.includes("Gözcüyü durdur"))).toBe(false);
    } finally {
      await page.close();
      await s.close();
    }
  }, 60_000);

  it("topoloji uyarısı: akış hash'i gözcününkiyle UYUŞMUYORSA 'Yeniden başlat' çıkar", async () => {
    const { s, flow } = await yonetilenSunucu();
    writeFileSync(join(root, ".skein", "daemon.json"), JSON.stringify({
      pid: 777, startedAt: new Date().toISOString(), flow: flow.name, hash: "ESKI-HASH-abc", mode: "serve",
    }));
    const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
    try {
      await page.goto(s.url, { waitUntil: "networkidle" });
      await page.waitForSelector("#bar .pill", { timeout: 15_000 });
      expect(await page.textContent("#bar .pill")).toContain("gözcü · yeniden başlat");
      await page.click("#bar .pill");
      await page.waitForSelector(".railGozcuUyari", { timeout: 10_000 });
      const yenidenVar = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".railGozcuUyari button")).some((b) => b.textContent === "Yeniden başlat"));
      expect(yenidenVar).toBe(true);
      // Normal "Gözcüyü durdur" düğmesi UYARI KUTUSUNUN YANINDA hâlâ duruyor
      // — topoloji uyarısı "on" durumunu DEĞİŞTİRMİYOR, yalnızca EK bir kutu.
      expect(await page.textContent(".railGozcuEylemler .railBtn")).toBe("Gözcüyü durdur");
    } finally {
      await page.close();
      await s.close();
    }
  }, 60_000);

  /**
   * "YENİDEN BAŞLAT"IN OTOMATİK İKİNCİ YARISI — gerçek tarayıcıda.
   *
   * Reviewer ret notu (bu kenarda 2. ret, reddedilen commit 017d453): bu
   * geçiş (durdur → gözcü GERÇEKTEN ölünce "/gozcu/baslat"ın KENDİLİĞİNDEN
   * tetiklenmesi, bkz. page.ts ciz() + gozcuBeklemeSonucu) hiçbir testle
   * kapsanmıyordu — page.test.ts yalnızca KARAR fonksiyonunu saf sınıyor,
   * "gerçekten otomatik tetikleniyor mu" sorusu yalnızca burada görünür.
   * Üstüne, yardımcı `yonetilenSunucu`'nun eski sabit `alive: () => true`'u
   * bu geçişi tarayıcıda SINANAMAZ kılıyordu — bu test onu `alive`
   * override'ıyla (yukarıda, yardımcıya eklendi) aşıyor.
   *
   * Gerçek bir süreç ölümü yerine `alive` override'ı mutasyona uğratılıyor
   * (üçüncü sınamanın "bayat kilit" ile aynı ilke): ikinci `spawn` çağrısı
   * (otomatik yeniden başlatma) GERÇEKTEN olduğu an override'ı senkron
   * olarak true'ya döndürüyor, yani yarış yok — bkz. aşağıdaki yorumlar.
   */
  it("gözcü GERÇEKTEN ölünce 'Yeniden başlat' otomatik olarak /gozcu/baslat'ı tetikler", async () => {
    const cagrilar: string[][] = [];
    const canli = { deger: true };
    let sayac = 0;
    const { s, flow } = await yonetilenSunucu({
      alive: () => canli.deger,
      spawn: (argv) => {
        cagrilar.push(argv);
        sayac += 1;
        // Her ikisi de GERÇEK bir OS sürecine AİT OLAMAYACAK kadar büyük
        // pid (2^22 üstü, Linux'ta ayrılmaz) — /gozcu/baslat'ın kendi iç
        // `liveLock` kontrolü GERÇEK `pidAlive`'a bakıyor (bu testin
        // `alive` override'ı SADECE EKRANA giden modeli etkiliyor, bkz.
        // yonetilenSunucu yorumu), yoksa İKİNCİ (otomatik) başlatma "zaten
        // bir gözcü açık" hatasına çarpardı.
        const pid = 4_194_305 + sayac;
        // BİRİNCİ çağrı KASITLI ESKİ bir hash yazıyor — "Yeniden başlat"
        // düğmesini çıkarmak için gereken topoloji uyuşmazlığı GERÇEK bir
        // akış değişikliği yerine burada kuruluyor. İKİNCİ çağrı (otomatik
        // yeniden başlatma) GÜNCEL hash'i yazıyor: yeni gözcü artık
        // GÜNCEL topolojiyle ayakta.
        const hash = sayac === 1 ? "ESKI-HASH-abc" : flow.hash;
        writeFileSync(join(root, ".skein", "daemon.json"), JSON.stringify({
          pid, startedAt: new Date().toISOString(), flow: flow.name, hash, mode: "serve",
        }));
        // İKİNCİ çağrı GERÇEKTEN olduğu an "yeni süreç ayakta" demek —
        // override'ı BURADA, aynı senkron adımda true'ya çevirmek, test
        // kodunun bunu AYRI bir zamanlamada yapmasını (yarış) gereksiz
        // kılıyor.
        if (sayac === 2) canli.deger = true;
        return { pid, kill: () => {}, onExit: () => {} };
      },
    });
    const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
    try {
      await page.goto(s.url, { waitUntil: "networkidle" });
      await page.waitForSelector("#bar .pill", { timeout: 15_000 });
      await page.click("#bar .pill");
      await page.waitForSelector(".railGozcuEylemler .railBtn", { timeout: 10_000 });
      await page.click(".railGozcuEylemler .railBtn"); // "Gözcüyü başlat" — İLK, GERÇEK start.
      await page.waitForSelector(".railGozcuUyari", { timeout: 10_000 });
      expect(cagrilar.length).toBe(1);

      await page.click(".railGozcuUyari button"); // "Yeniden başlat".
      await page.waitForTimeout(400);
      expect(await page.textContent(".railGozcuBaslik")).toBe("gözcü duruyor…");
      // Durdurma hiçbir yeni süreç başlatmıyor — hâlâ tek çağrı.
      expect(cagrilar.length).toBe(1);

      // Gözcü GERÇEKTEN ÖLDÜ — hiçbir düğmeye basılmadan.
      canli.deger = false;
      // setInterval(yokla, 1000)'in EN AZ bir turunu bekle: ciz() bu turda
      // gozcuBeklemeSonucu'nun "öldü" dalına girip "/gozcu/baslat"ı
      // KENDİLİĞİNDEN tetiklemeli — test hiçbir düğmeye basmıyor.
      await page.waitForTimeout(1_800);

      expect(cagrilar.length).toBe(2);
      expect(await page.textContent(".railGozcuBaslik")).toBe("gözcü açık");
      const pillMetin = await page.textContent("#bar .pill");
      expect(pillMetin).toContain("gözcü açık");
      expect(pillMetin).not.toContain("yeniden başlat");
    } finally {
      await page.close();
      await s.close();
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

      // Başlangıçta ilk akışın düğümü duruyor.
      let dugumler = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".formasyonDugum")).map((e) => e.getAttribute("data-rol")));
      expect(dugumler).toContain("coder");

      await page.selectOption("#akisSecici", "ikinci");
      await page.waitForSelector('.formasyonDugum[data-rol="digerrol"]', { timeout: 10_000 });

      // İDDİA "yeni düğüm EKLENDİ" değil, "pano DEĞİŞTİ": eski akışın rolü
      // artık hiç görünmemeli — sayfa iki akışı birden çizseydi bu kaçardı.
      dugumler = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".formasyonDugum")).map((e) => e.getAttribute("data-rol")));
      expect(dugumler).toContain("digerrol");
      expect(dugumler).not.toContain("coder");
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
      await page.waitForSelector(".promptlarOge", { timeout: 10_000 });
      // İki dosya listelenir (anayasa dosyası, coder'ın rol promptu); rol
      // dosyasını seçiyoruz — liste artık etiketi değil, uzantısız dosya
      // adını gösteriyor (bkz. dosyaAdiKisa, page.ts).
      await page.click('.promptlarOge:has-text("coder")');
      await page.waitForTimeout(500);
      await page.fill("#promptlarMetin", "# coder\ntarayıcıdan değişti\n");
      await page.click("#promptlarKaydet");
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
      await page.waitForSelector('button:has-text("Yeni rol promptu")', { timeout: 10_000 });
      await page.click('button:has-text("Yeni rol promptu")');
      await page.waitForSelector("#yeniRolId", { timeout: 10_000 });

      await page.fill("#yeniRolId", "reviewer");
      await page.selectOption("#yeniRolProvider", "claude");
      await page.fill("#yeniRolWorkspace", "reviewer");
      await page.selectOption("#yeniRolSonra", "coder");
      // Prompt BOŞ bırakılıyor — sunucu şablondan yazmalı (kural 9).
      await page.click('button:has-text("Rolü ekle")');
      await page.waitForSelector('.formasyonDugum[data-rol="reviewer"]', { timeout: 10_000 });

      // İDDİA panonun SÖYLEDİĞİ değil, DİSKTE GERÇEKTEN ne olduğu: hem
      // YAML hem de yeni promptu dosyası.
      const dugumler = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".formasyonDugum")).map((e) => e.getAttribute("data-rol")));
      expect(dugumler).toContain("coder");
      expect(dugumler).toContain("reviewer");

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
   * BİRDEN FAZLA DOSYA AYNI ANDA KİRLİ KALABİLİYOR — gerçek tarayıcıda.
   *
   * `promptlarMetniGetir` (page.ts) bir dosyanın metnini ZATEN YÜKLÜYSE
   * YENİDEN OKUMUYOR — bu YARIŞ/EZME riski (disk'ten tekrar okumak
   * operatörün elle yazdığını SESSİZCE EZER) yalnızca GERÇEK tarayıcıda,
   * GERÇEK seçim değişimiyle ölçülebilir; birim sınama fetch'i taklit
   * etmez. Aynı turda nav rozetinin (kaç dosya kirli) ve "Geri al"ın da
   * doğru çalıştığı doğrulanıyor.
   */
  it("bir dosyayı düzenleyip BAŞKA dosyaya geçmek ilk dosyanın taslağını KAYBETMEZ", async () => {
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
      await page.waitForSelector(".promptlarOge", { timeout: 10_000 });

      // "coder" dosyasını seç, DEĞİŞTİR — ama KAYDETME.
      await page.click('.promptlarOge:has-text("coder")');
      await page.waitForTimeout(300);
      await page.fill("#promptlarMetin", "# coder\nkaydedilmemiş taslak\n");

      // Rozet ("promptlar" nav sekmesi) 1 kirli dosya göstermeli.
      expect(await page.textContent('.navSekme[data-sekme="promptlar"] .navRozet')).toBe("1");

      // ŞİMDİ "base" (anayasa) dosyasına geç ve ONU DA değiştir.
      await page.click('.promptlarOge:has-text("base")');
      await page.waitForTimeout(300);
      await page.fill("#promptlarMetin", "# Anayasa\nbu da değişti\n");
      expect(await page.textContent('.navSekme[data-sekme="promptlar"] .navRozet')).toBe("2");

      // GERİ "coder"a dön — İLK taslak SESSİZCE EZİLMEMİŞ olmalı.
      await page.click('.promptlarOge:has-text("coder")');
      await page.waitForTimeout(300);
      const coderMetni = await page.evaluate(() => document.querySelector("#promptlarMetin")?.value ?? null);
      expect(coderMetni).toBe("# coder\nkaydedilmemiş taslak\n");

      // "Geri al" SADECE o an seçili (coder) dosyayı eski hâline döndürür;
      // "base" taslağı ETKİLENMEMELİ — rozet 2'den 1'e düşer, SIFIRA değil.
      await page.click("#promptlarGeriAl");
      await page.waitForTimeout(300);
      const geriAlinmisMetin = await page.evaluate(() =>
        document.querySelector("#promptlarMetin")?.value ?? null);
      expect(geriAlinmisMetin).toBe("# coder\n");
      expect(await page.textContent('.navSekme[data-sekme="promptlar"] .navRozet')).toBe("1");

      // DİSKTE HİÇBİR ŞEY DEĞİŞMEDİ — bu tur hiç "Kaydet"e basmadı.
      expect(await readFile(join(root, "roles", "coder.prompt"), "utf8")).toBe("# coder\n");
      expect(await readFile(join(root, "hub", "prompts", "base.md"), "utf8")).toBe("# Anayasa\n");
      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
      await s.close();
    }
  }, 60_000);

  /**
   * "KULLANAN" ETİKETİNE TIKLAMAK O ROLÜ PANODA AÇAR — DEVIR.md §5.
   * RAIL geçişi (railGecis "rolSec") GERÇEK bir tarayıcıda, GERÇEK bir
   * tıklamayla ölçülüyor — promptlarKullananTikla'nın hash'i boşaltıp
   * Rol modunu açtığını birim sınama kanıtlayamaz (hash değişimi ve
   * sagPanelCiz'in yeniden çizimi gerçek DOM'a bağlı).
   */
  it("'Kullanan' etiketine tıklamak o rolü Pano'da Rol modunda açar", async () => {
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
      await page.waitForSelector(".promptlarOge", { timeout: 10_000 });
      await page.click('.promptlarOge:has-text("coder")');
      await page.waitForSelector('.promptlarKullananEtiket:has-text("coder")', { timeout: 10_000 });

      await page.click('.promptlarKullananEtiket:has-text("coder")');

      // Hash boşalmış (Pano'ya dönülmüş) ve Rol modu AÇIK olmalı.
      await page.waitForSelector(".railRolBaslik", { timeout: 10_000 });
      expect(await page.textContent(".railRolBaslik")).toBe("coder");
      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
      await s.close();
    }
  }, 60_000);

  /**
   * FORMASYON GENİŞLİĞİ — DEVIR.md'nin formülü GERÇEKTEN tutuyor mu.
   *
   * "genislik min(100%, calc((100vh - 210px) * 1.5625))" kaynak metinde
   * durabilir ama bir CSS formülünün tarayıcıda GERÇEKTEN o değere
   * çözüldüğü yalnızca HESAPLANAN genişliği ölçünce görünür — sayı
   * yanlış yazılsa (örn. 1.5625 yerine 1000/640'ın kendisi değil başka
   * bir oran) kaynak metin sınaması bunu YAKALAYAMAZDI. İki GERÇEK
   * viewport yüksekliği, iki farklı BEKLENEN genişlik üretiyor.
   */
  it("formasyon genişliği pencere yüksekliğine göre ölçekleniyor", async () => {
    // GENİŞLİK 1600 — kart c-20261105-d500f1 (sağ panel) formasyon
    // alanını .panoGovde içinde sağ panelle (flex 0 1 380px) PAYLAŞTIRDI;
    // eski 1280 genişlikte "100%" artık 868px'e düşüyor (1248 - 380) ve bu
    // sınama HEP YÜKSEKLİĞE bağlı kaldığını göstermek isterken yanlışlıkla
    // GENİŞLİĞE çarpmış olurdu. 1600, .wrap'ın kendi max-width'ini (1500)
    // doldurur: .wrap 1500 - 32 (yatay dolgu) = 1468 panoGovde içeriği,
    // formasyonAlan (620 taban + büyüme) = 620 + (1468-1000) = 1088 —
    // aşağıdaki iki yükseklik formülünün HER İKİSİNDEN de (1078.125 ve
    // 453.125) BÜYÜK, yani "100%" dalı hâlâ devre dışı ve asıl ölçülen şey
    // GERÇEKTEN yükseklik formülü. Sayılar bu yüzden sağ panelden ÖNCEKİ
    // hâliyle AYNEN kalıyor — değişen tek şey viewport genişliği.
    //
    // Yükseklik 900 → min(1088, (900-210)*1.5625) = min(1088, 1078.125).
    const uzun = await (browser as Tarayici).newPage({ viewport: { width: 1600, height: 900 } });
    // Yükseklik 500 → min(1088, (500-210)*1.5625) = min(1088, 453.125) —
    // burada YÜKSEKLİK sınırlayan taraf, "min(100%, ...)"ın "100%" dalı
    // DEĞİL; iki senaryo birlikte formülün HER İKİ tarafını da sınıyor.
    const kisa = await (browser as Tarayici).newPage({ viewport: { width: 1600, height: 500 } });
    try {
      await uzun.goto(server.url, { waitUntil: "networkidle" });
      await uzun.waitForSelector(".formasyonSarmal svg", { timeout: 15_000 });
      const uzunGenislik = await uzun.evaluate(() =>
        document.querySelector(".formasyonSarmal")?.getBoundingClientRect().width ?? 0);

      await kisa.goto(server.url, { waitUntil: "networkidle" });
      await kisa.waitForSelector(".formasyonSarmal svg", { timeout: 15_000 });
      const kisaGenislik = await kisa.evaluate(() =>
        document.querySelector(".formasyonSarmal")?.getBoundingClientRect().width ?? 0);

      expect(uzunGenislik).toBeGreaterThan(1050);
      expect(uzunGenislik).toBeLessThan(1110);
      expect(kisaGenislik).toBeGreaterThan(425);
      expect(kisaGenislik).toBeLessThan(480);
      // DAHA KISA PENCERE → DAHA DAR DİYAGRAM: formül yüksekliğe BAĞLI,
      // sabit bir genişlik DEĞİL.
      expect(kisaGenislik).toBeLessThan(uzunGenislik);
    } finally {
      await uzun.close();
      await kisa.close();
    }
  }, 60_000);

  /**
   * FORMASYONUN ÜÇ İŞARETİ BİR ARADA — planlama bandı, insan onayı kapısı
   * ve ret yayı — GERÇEK tarayıcıda (kart c-20261105-2a8dab).
   *
   * Bu üçü `formasyonSvgKur`'un DOM'a dokunan tarafı; `fonksiyon()` ile
   * izole edilemezler (document.createElementNS gerektiriyor), o yüzden
   * TEK yerde, gerçek bir akışla sınanıyorlar. Akış kasıtlı ZENGİN: iki
   * ret kenarı (coder→planner, reviewer→coder), bir onay kapısı (coder
   * sonrası) ve İKİ katılımcılı bir planlama — üçü de aynı koşuda.
   */
  describe("formasyon işaretleri — planlama bandı, kapı çizgisi, ret yayı", () => {
    // planner/architect PLANLAMA katılımcısı (coder/reviewer DEĞİL — kural
    // 22: bir katılımcı "reject" taşıyamaz, itirazın yolu itiraz dosyası).
    const ZENGIN_FLOW = `
name: zengin
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
  - after: coder
    type: approval

planlama:
  katilimcilar: [planner, architect]
  tur: 2
  plan: docs/plan/{kart}.md

reject:
  limit: 2
  onExhausted: gate
`;

    async function zenginSunucusuAc() {
      await writeFile(join(root, "hub", "flows", "zengin.yaml"), ZENGIN_FLOW);
      const flow = await loadFlow(join(root, "hub", "flows", "zengin.yaml"), {
        root, providers: knownProviderSet(),
      });
      const topo = snapshot(flow, root);
      return serveUi({ root, queue, topology: topo, flowName: flow.name, flowHash: flow.hash });
    }

    it("planlama bandı 2 katılımcıda 'en çok N tur' etiketiyle çiziliyor", async () => {
      const s = await zenginSunucusuAc();
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.waitForSelector(".formasyonPlanEtiket", { timeout: 15_000 });
        expect(await page.textContent(".formasyonPlanEtiket")).toBe("planlama · en çok 2 tur");
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    it("onay kapısı dik çizgi + 'insan onayı' etiketiyle çiziliyor", async () => {
      const s = await zenginSunucusuAc();
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.waitForSelector(".formasyonKapiEtiket", { timeout: 15_000 });
        expect(await page.textContent(".formasyonKapiEtiket")).toBe("insan onayı");
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    it("her ret kenarı için 'ret → hedef' etiketli bir yay çiziliyor", async () => {
      const s = await zenginSunucusuAc();
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.waitForSelector(".formasyonRetEtiket", { timeout: 15_000 });
        const etiketler = await page.evaluate(() =>
          Array.from(document.querySelectorAll(".formasyonRetEtiket")).map((e) => e.textContent ?? ""));
        expect(etiketler.sort()).toEqual(["ret → coder", "ret → planner"]);
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    // TEK KATILIMCIDA BANT YOK: "ilk ile son arasında geçen bir şerit" tek
    // noktada anlamsız (skein-merkez-v3.html'in kendi kuralı, plan.length>1).
    it("tek katılımcılı planlamada bant/etiket HİÇ çizilmiyor", async () => {
      const TEK_KATILIMCI_FLOW = ZENGIN_FLOW.replace("katilimcilar: [planner, architect]", "katilimcilar: [planner]");
      await writeFile(join(root, "hub", "flows", "zengin.yaml"), TEK_KATILIMCI_FLOW);
      const flow = await loadFlow(join(root, "hub", "flows", "zengin.yaml"), {
        root, providers: knownProviderSet(),
      });
      const topo = snapshot(flow, root);
      const s = await serveUi({ root, queue, topology: topo, flowName: flow.name, flowHash: flow.hash });
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.waitForSelector(".formasyonDugum", { timeout: 15_000 });
        expect(await page.evaluate(() => document.querySelectorAll(".formasyonPlanEtiket").length)).toBe(0);
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);
  });

  /**
   * SAĞ PANEL — Genel bakış/Rol/Kart (kart c-20261105-d500f1).
   *
   * Aşağıdaki iki "kapı gerekçesi" sınaması TAM OLARAK buradan taşınan
   * sınamalar (bkz. commit 88f68ad): o commit katlanabilir <details>'ı eski
   * sütun panosunun `.card.gate`'inde kurmuştu; V formasyonu o panoyu
   * kaldırınca sınamalar "yeşil ama ölçmüyor" hâline düştü ve geçici olarak
   * buradan silindi (bkz. git tarihi). Burada GERİ GELİYORLAR, YENİ
   * seçicilerle (`.railKapiKutu`) — davranış (çekirdek cümle hep görünür,
   * ajan metni katlanır ama KIRPILMAZ) BİREBİR AYNI.
   */
  describe("sağ panel — Genel bakış / Rol / Kart", () => {
    it("formasyon düğümüne tıklamak Rol modunu açar; aynı role tekrar tıklamak Genel bakışa döner", async () => {
      // NOT: tıklama hedefi "g.formasyonDugum"ın KENDİSİ DEĞİL, içindeki
      // "rect.kutu".
      //
      // DÜZELTME NOTU: bu yorum eskiden "tarayıcı ölçüm tuhaflığı, bu
      // kartın kapsamı değil" diyordu. YANLIŞTI. Sebep gerçek bir CSS
      // kusuruydu: ".formasyonSarmal svg" TORUN seçicisi gömülü kuş
      // <svg>'lerine de uyuyor, width="46" niteliğini eziyor ve her kuşu
      // 1000x640 çizdiriyordu. Kuş diyagramın üstünü kaplıyordu; "devasa
      // sınır kutusu" bunun BELİRTİSİYDİ, tuhaflık değil. Seçici ">" ile
      // daraltılarak düzeltildi ve çizilen boyut artık ayrı bir sınamayla
      // pinli ("formasyon kuşu — çizilen boyut").
      //
      // "rect.kutu" hedefi yine de doğru ve dar bir hedef olduğu için
      // korunuyor.
      const kutu = '.formasyonDugum[data-rol="coder"] rect.kutu';
      const { page, hatalar } = await ac();
      try {
        await page.waitForSelector(kutu, { timeout: 15_000 });

        // BAŞLANGIÇ: Genel bakış — "Uçuşta" başlığı görünür, Rol içeriği yok.
        await page.waitForSelector(".railSayiSatiri", { timeout: 10_000 });
        expect(await page.evaluate(() => document.querySelector(".railRolBaslik"))).toBeNull();

        await page.click(kutu);
        await page.waitForSelector(".railRolBaslik", { timeout: 10_000 });
        expect(await page.textContent(".railRolBaslik")).toBe("coder");
        // Düğüm GERÇEKTEN "seçili" sayılıyor (DEVIR.md: accent-100 zemin).
        expect(await page.evaluate(() =>
          document.querySelector('.formasyonDugum[data-rol="coder"]')?.classList.contains("secili")))
          .toBe(true);

        // AYNI role tekrar tıklamak Genel bakışa döner — formasyon
        // düğümünün eski "toggle" davranışıyla AYNI (bkz. railGecis).
        await page.click(kutu);
        await page.waitForSelector(".railSayiSatiri", { timeout: 10_000 });
        expect(await page.evaluate(() => document.querySelector(".railRolBaslik"))).toBeNull();

        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
      }
    }, 60_000);

    /**
     * ROL MODU — "Prompt" düğmesi GERÇEKTEN çalışan Promptlar sekmesini
     * (bkz. promptlarEkraniCiz, page.ts) o rolün DOSYASI SEÇİLİ olarak
     * açıyor. Yarış endişesi (PROMPT_SEC'in promptlarEkraniCiz()
     * /promptlar'ı okumadan önce ayarlanması) gerçek tarayıcıda yalnızca
     * BURADA ölçülebilir — birim sınama fetch'i taklit etmez.
     */
    it("Rol modunda 'Prompt' düğmesi o rolün dosyasını seçili açar", async () => {
      const kutu = '.formasyonDugum[data-rol="coder"] rect.kutu';
      const { page, hatalar } = await ac();
      try {
        await page.waitForSelector(kutu, { timeout: 15_000 });
        await page.click(kutu);
        await page.waitForSelector(".railRolDugmeler button", { timeout: 10_000 });
        await page.click('.railRolDugmeler button:has-text("Prompt ·")');
        await page.waitForSelector(".promptlarOge-secili", { timeout: 10_000 });
        expect(await page.textContent(".promptlarOge-secili")).toContain("coder");
        await page.waitForTimeout(500);
        const metin = await page.evaluate(() => document.querySelector("#promptlarMetin")?.value ?? null);
        expect(metin).toBe("# coder\n");
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
      }
    }, 60_000);

    /**
     * KAPI GEREKÇESİ OKUNUR — çekirdeğin cümlesi hep görünür; ajanın ham
     * (ve burada JSON'a benzeyen) son mesajı KATLANIR ama METNİ KAYBETMEZ.
     * bkz. commit 88f68ad'in AYNI adlı sınaması — yalnızca seçici değişti.
     */
    it("uzun ve JSON'lu gerekçe: ilk satır görünür, tamamı açılabiliyor, açınca metnin tamamı DOM'da", async () => {
      const cekirdek = "Ajan zaman aşımına uğradı";
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
        await page.waitForSelector(".railKapiKutu", { timeout: 15_000 });

        // İLK SATIR HER ZAMAN TAM GÖRÜNÜR — ham JSON'un İÇİNDE DEĞİL.
        expect(await page.textContent(".railKapiKutu .reason")).toBe(cekirdek);

        // KATLANABİLİR, varsayılan KAPALI.
        expect(await page.evaluate(() => document.querySelector(".railKapiKutu .ajanDetay")?.open))
          .toBe(false);

        // TIKLAYINCA AÇILIYOR ve metnin TAMAMI DOM'da — KIRPMA YOK: "en
        // fazla 3 satır" kuralı (DEVIR.md) yalnızca GÖRÜNÜMÜ kırpar.
        await page.click(".railKapiKutu .ajanDetay summary");
        expect(await page.textContent(".railKapiKutu .ajanTam")).toBe(ajanKuyruk);

        // JSON'A BENZEYEN kuyruk mono/kaydırmalı blokta.
        expect(await page.evaluate(() =>
          document.querySelector(".railKapiKutu .ajanTam")?.classList.contains("mono"))).toBe(true);

        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
      }
    }, 60_000);

    it("ajan mesajı taşımayan kapı gerekçesinde katlanabilir blok çıkmıyor", async () => {
      await queue.add(newCard({ title: "basit kapı", task: "iş", topology }));
      const taken = await al(queue, "coder");
      await queue.escalate(taken, "ağaçta işlenmemiş değişiklik var: README.md");

      const { page, hatalar } = await ac();
      try {
        await page.waitForSelector(".railKapiKutu", { timeout: 15_000 });
        expect(await page.textContent(".railKapiKutu .reason"))
          .toBe("ağaçta işlenmemiş değişiklik var: README.md");
        expect(await page.evaluate(() => document.querySelector(".railKapiKutu .ajanDetay"))).toBeNull();
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
      }
    }, 60_000);

    /**
     * KAPI ÇIKIŞLARI — MEVCUT kapiCikislari/karar mantığıyla BİREBİR AYNI
     * (kart c-20261105-d500f1'in şartı). Kaçış kapısında geri hedefi
     * yoksa tek düğme "Yeniden koş" çıkar (bkz. page.test.ts
     * "kapiCikislari — geri hedefi"); tıklayınca kart kapıdan çıkıyor ve
     * Genel bakışın sayısı 1'den 0'a düşüyor.
     */
    it("kapı kartının çıkış düğmesi karar veriyor; Genel bakışın sayısı güncelleniyor", async () => {
      await queue.add(newCard({ title: "yeniden denenecek", task: "iş", topology }));
      const taken = await al(queue, "coder");
      await queue.escalate(taken, "geçici bir hata");

      const { page, hatalar } = await ac();
      try {
        await page.waitForSelector(".railKapiKutu", { timeout: 15_000 });
        expect(await page.textContent(".railSayi")).toBe("1");

        await page.click('.railKapiKutu .railCikis button:has-text("Yeniden koş")');
        await page.waitForSelector(".railKapiKutu", { state: "detached", timeout: 10_000 });
        expect(await page.textContent(".railSayi")).toBe("0");

        // BİLDİRİM — DEVIR.md "Interactions & Behavior": her çıkış kısa bir
        // bildirim gösterir; düğmenin kendi etiketini taşır, 3.4 sn sonra
        // kendiliğinden kapanır.
        expect(await page.evaluate(() => document.getElementById("bildirim")?.classList.contains("gorunur")))
          .toBe(true);
        expect(await page.textContent("#bildirim")).toBe("Yeniden koş — kuyruğa bırakıldı.");
        await page.waitForTimeout(3700);
        expect(await page.evaluate(() => document.getElementById("bildirim")?.classList.contains("gorunur")))
          .toBe(false);

        const guncel = await queue.get(taken.id);
        expect(guncel?.state).not.toBe("gate");
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
      }
    }, 60_000);

    /**
     * --toast-bg — kart c-20261106-e62847. "#bildirim" ARTIK --color-
     * neutral-900 DEĞİL, --toast-bg kullanıyor (bkz. page.ts'teki
     * TOAST-BG yorumu): neutral-900 koyu temada AÇIK bir değere dönüyor
     * (accent-100 zemini üstünde ink rolü için), ama toast'ın "her zaman
     * koyu zemin" sözü (DEVIR.md) buna bağlı KALAMAZ. Açık temada ikisi
     * AYNI hex olduğu için (üstteki "kapı kartının çıkış düğmesi"
     * sınaması bunu YAKALAYAMAZ) bu sınama AÇIKÇA koyu temada ölçüyor.
     */
    it("koyu temada bildirim kutusu HÂLÂ koyu zeminli (--toast-bg, neutral-900'ün koyu-tema AÇIK değerine DÖNMEDİ)", async () => {
      await queue.add(newCard({ title: "yeniden denenecek", task: "iş", topology }));
      const taken = await al(queue, "coder");
      await queue.escalate(taken, "geçici bir hata");

      const { page, hatalar } = await acTema("dark");
      try {
        await page.waitForSelector(".railKapiKutu", { timeout: 15_000 });
        await page.click('.railKapiKutu .railCikis button:has-text("Yeniden koş")');
        await page.waitForSelector("#bildirim.gorunur", { timeout: 10_000 });
        const zemin = await page.evaluate(() => getComputedStyle(document.getElementById("bildirim")).backgroundColor);
        // --toast-bg: #2d2b2b → rgb(45, 43, 43) — temadan bağımsız.
        expect(zemin).toBe("rgb(45, 43, 43)");
        // KARŞIT İDDİA: --color-neutral-900'ün koyu-tema (ink) değeri,
        // #f8f4f4 → rgb(248, 244, 244).
        expect(zemin).not.toBe("rgb(248, 244, 244)");
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
      }
    }, 60_000);

    /**
     * KART MODU — başlık düğmesine tıklamak Kart moduna geçer, "←"
     * Genel bakışa döner. "Kartın izi"/"Kodda ne değişti" blokları eski
     * detay panelinden (detayCiz) ÇIKARILAN AYNI fonksiyonlar (bkz.
     * izZamanCizelgesiKur/kodDegisikligiKur), o yüzden burada yalnızca
     * VARLIKLARI sınanıyor — içerikleri model.test.ts/eski detay
     * sınamalarında zaten doğrulanmıştı.
     */
    it("kapı kartının başlığına tıklamak Kart moduna geçer; '←' Genel bakışa döner", async () => {
      await queue.add(newCard({ title: "detaya bakılacak kart", task: "iş", topology }));
      const taken = await al(queue, "coder");
      await queue.escalate(taken, "elle bakılmalı");

      const { page, hatalar } = await ac();
      try {
        await page.waitForSelector(".railBaslikBtn", { timeout: 15_000 });
        await page.click(".railBaslikBtn");
        await page.waitForSelector(".railKartBaslik", { timeout: 10_000 });
        expect(await page.textContent(".railKartBaslik")).toBe("detaya bakılacak kart");
        await page.waitForSelector(".kutu .eyebrow", { timeout: 10_000 });
        // Kart modunun kapı kutusunda başlık düğmesi YOK — başlık zaten
        // kartın kendi h2'si, railKapiKutu'ya baslikTikla=null geçiyor
        // (bkz. railKartCiz). İkinci bir başlık YİNELEMEMELİ.
        expect(await page.evaluate(() => document.querySelectorAll(".railBaslikBtn").length)).toBe(0);

        await page.click(".railGeri");
        await page.waitForSelector(".railSayiSatiri", { timeout: 10_000 });
        expect(await page.evaluate(() => document.querySelector(".railKartBaslik"))).toBeNull();

        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
      }
    }, 60_000);

    /**
     * DEVIR-DENETIM: DEVIR.md §1 Rail mod 3 — "'Kartın izi' zaman
     * çizelgesi: 52px saat sütunu, 10px düğüm, 2px dikey ray" + genel
     * "tüm durum noktaları kare, yuvarlak hiçbir şey yok" kuralı.
     *
     * `izZamanCizelgesiKur` (eski detayCiz'den ÇIKARILIP Kart moduna
     * TAŞINAN aynı fonksiyon) 9px YUVARLAK, kenarsız bir nokta ve 1px'lik
     * bir ray çiziyordu — SAPMALAR §2.7'nin tam tarif ettiği boşluk:
     * nitelik/CSS'e bakan hiçbir sınama bu GERÇEKTEN ÇİZİLEN şekli hiç
     * ölçmüyordu. Dolgu rengi (IZ_RENK, olaya göre) kasıtlı DOKUNULMADI.
     */
    it("'Kartın izi' düğümü kare, 10px, 2px kenarlı (yuvarlak DEĞİL)", async () => {
      await queue.add(newCard({ title: "iz denetimi", task: "iş", topology }));
      const taken = await al(queue, "coder");
      await queue.escalate(taken, "elle bakılmalı");

      const { page, hatalar } = await ac();
      try {
        await page.waitForSelector(".railBaslikBtn", { timeout: 15_000 });
        await page.click(".railBaslikBtn");
        await page.waitForSelector(".iz .rail i", { timeout: 10_000 });
        const olcu = await page.evaluate(() => {
          const n = document.querySelector(".iz .rail i");
          if (!n) return null;
          const r = n.getBoundingClientRect();
          const s = getComputedStyle(n);
          return { w: r.width, h: r.height, kenar: s.borderWidth, kose: s.borderRadius };
        });
        expect(olcu).toEqual({ w: 10, h: 10, kenar: "2px", kose: "0px" });
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
      }
    }, 60_000);

    /**
     * KART MODUNDAN KARAR — reviewer'ın 1. ret gerekçesi (bu kenarda 1. ret,
     * reddedilen commit 6b171a0): Kart moduna (railBaslikBtn ile) girip AYNI
     * karttaki .railKapiKutu'dan karar verildiğinde panel BAYAT kalıyordu —
     * istek çekirdekte gerçekten başarıyla sonuçlanıyor ama RAIL.cardId
     * DEĞİŞMEDİĞİ için railYenidenYuklenmeliMi hiçbir zaman "evet" demiyor,
     * panel eski kapı kutusunu ve karar()'ın disable ettiği düğmeyi
     * SONSUZA DEK göstermeye devam ediyordu (yukarıdaki test AYNI senaryoyu
     * yalnızca Genel bakış modundan sınıyordu — Kart modundan HİÇ
     * sınanmamıştı). Düzeltme karar()'ın kendisinde: Kart modunda AYNI
     * karttaysak panelin "data-rail-kart" damgası karar BAŞARIYLA
     * sonuçlanınca SİLİNİYOR, böylece hemen ardından gelen ciz() çağrısı
     * sagPanelCiz'i GERÇEKTEN yeniden fetch'e zorluyor.
     */
    it("Kart modunda kapı kartının çıkış düğmesine basınca panel KENDİLİĞİNDEN güncelleniyor (bayat kalmıyor)", async () => {
      await queue.add(newCard({ title: "kart modunda karar verilecek", task: "iş", topology }));
      const taken = await al(queue, "coder");
      await queue.escalate(taken, "geçici bir hata");

      const { page, hatalar } = await ac();
      try {
        await page.waitForSelector(".railBaslikBtn", { timeout: 15_000 });
        await page.click(".railBaslikBtn");
        await page.waitForSelector(".railKartBaslik", { timeout: 10_000 });

        // Kart modunda da aynı kapı kutusu/düğme çıkıyor (DEVIR/SAPMALAR'ın
        // "kapı çıkışları MEVCUT mantıkla BİREBİR aynı" şartı).
        await page.waitForSelector(".railKapiKutu", { timeout: 10_000 });
        expect(await page.textContent(".railDurumEtiket")).toBe("kaçış kapısı");

        const dugme = '.railKapiKutu .railCikis button:has-text("Yeniden koş")';
        await page.waitForSelector(dugme, { timeout: 10_000 });
        await page.click(dugme);

        // Çekirdek GERÇEKTEN kuyruğa bıraktı mı — ekranın iddiasına değil
        // kuyruğa bak (aynı disiplin: yukarıdaki "...sayısı güncelleniyor"
        // sınaması).
        await page.waitForTimeout(500);
        const guncel = await queue.get(taken.id);
        expect(guncel?.state).not.toBe("gate");

        // PANEL KENDİLİĞİNDEN GÜNCELLENİYOR MU — bu kartın ASIL şartı. Sayfa
        // hiç yeniden yüklenmedi, RAIL.cardId HİÇ değişmedi (hâlâ aynı kart,
        // hâlâ Kart modu) — eski kapı kutusu/etiket/devre dışı düğme KALICI
        // KALMAMALI.
        await page.waitForSelector(".railKapiKutu", { state: "detached", timeout: 10_000 });
        expect(await page.textContent(".railDurumEtiket")).toBe("kuyrukta");

        // Hâlâ Kart modundayız — '←' basmadan, RAIL hiç değişmeden.
        expect(await page.textContent(".railKartBaslik")).toBe("kart modunda karar verilecek");

        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
      }
    }, 60_000);

    /**
     * KİLİTLENME KORUMASI — Rol modu açıkken AKIŞ DEĞİŞİP o rol
     * kaybolursa (akış dosyası elle düzenlenir, gözcü/ekran yeniden
     * taramadan önce RAIL hâlâ eski role işaret eder) "← Genel bakış"
     * yine de ÇIKMALI. Gerçekte bu durumu BİREBİR tetiklemek bir dosya
     * düzenlemesi + yoklama zamanlaması gerektirir ve kırılgan olurdu; bu
     * sınama RAIL'i doğrudan kurup SAME GERÇEK ciz() ile çiziyor — modül
     * tip betik olduğu için üst düzey `function`/`let` bildirimleri aynı
     * global ortamda GÖRÜNÜR, `page.evaluate` onlara çıplak adla erişebilir.
     */
    it("Rol modundaki rol kaybolursa 'rol bulunamadı' ile BİRLİKTE 'Genel bakış' düğmesi kalır", async () => {
      const { page, hatalar } = await ac();
      try {
        await page.waitForSelector(".railSayiSatiri", { timeout: 15_000 });
        await page.evaluate(() => {
          RAIL = { mode: "role", roleId: "hayalet-rol", cardId: null, cardFrom: "overview" };
          ciz(SON_MODEL);
        });
        await page.waitForSelector(".railBos", { timeout: 10_000 });
        expect(await page.textContent(".railBos")).toContain("rol bulunamadı");
        // Kilit YOK: düğme hâlâ orada ve tıklanınca Genel bakışa döner.
        await page.click(".railGeri");
        await page.waitForSelector(".railSayiSatiri", { timeout: 10_000 });
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
      }
    }, 60_000);
  });

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
   * KANAT ÇIRPMA — `prefers-reduced-motion: reduce` ANİMASYONU TAMAMEN
   * SIFIRLAR (kart c-20261105-2a8dab, SAPMALAR.md §2.2'nin "sınanmalı"
   * dediği yer; eski "devir hareketi" sınamasının YERİNİ alıyor —
   * `.card.gelis` sütun panosuyla birlikte kalktı, DEVIR.md'nin V
   * formasyonunda "iş sürüyor" sinyali artık kanat çırpmanın kendisi).
   *
   * Bu bir süs tercihi değil, erişilebilirlik koşulu: `page.test.ts`
   * medya sorgusunun KAYNAK METİNDE durduğunu görebilir ama tarayıcının
   * onu GERÇEKTEN uyguladığını göremez. Aynı senaryo (bir rol ÇALIŞIYOR
   * VE gözcü AÇIK — `kanatCirpiyorMu`'nun iki koşulu) iki hareket
   * tercihiyle AÇILIYOR: reduce'da hesaplanan animasyon 'none', aksi
   * hâlde kuşun GERÇEKTEN animasyonu var.
   */
  it("kanat çırpma: prefers-reduced-motion'da animasyon YOK, aksi hâlde VAR", async () => {
    await acquireLock(join(root, ".skein", "daemon.json"), {
      pid: process.pid, startedAt: new Date().toISOString(),
      flow: "test", hash: "abc", mode: "serve",
    });
    await queue.add(newCard({ title: "kanat-azalt", task: "iş", topology }));
    await al(queue, "coder");

    const { page: azalt, hatalar: hatalarAzalt } = await acHareket("reduce");
    try {
      await azalt.waitForSelector(".formasyonKus.kanatCirpiyor", { timeout: 15_000 });
      const animAzalt = await azalt.evaluate(() =>
        getComputedStyle(document.querySelector(".formasyonKus.kanatCirpiyor")).animationName);
      expect(animAzalt).toBe("none");
      expect(hatalarAzalt).toEqual([]);
    } finally {
      await azalt.close();
    }
  }, 60_000);

  it("kanat çırpma: hareket tercihi 'no-preference' ise GERÇEKTEN animasyon oynuyor", async () => {
    await acquireLock(join(root, ".skein", "daemon.json"), {
      pid: process.pid, startedAt: new Date().toISOString(),
      flow: "test", hash: "abc", mode: "serve",
    });
    await queue.add(newCard({ title: "kanat-normal", task: "iş", topology }));
    await al(queue, "coder");

    const { page: normal, hatalar: hatalarNormal } = await acHareket("no-preference");
    try {
      await normal.waitForSelector(".formasyonKus.kanatCirpiyor", { timeout: 15_000 });
      const animNormal = await normal.evaluate(() =>
        getComputedStyle(document.querySelector(".formasyonKus.kanatCirpiyor")).animationName);
      expect(animNormal).not.toBe("none");
      expect(hatalarNormal).toEqual([]);
    } finally {
      await normal.close();
    }
  }, 60_000);

  /**
   * KANAT ÇIRPMANIN KOŞULU GERÇEK TARAYICIDA DA TUTUYOR: gözcü KAPALIYKEN
   * çalışan bir kart kanat çırptırmaz (DEVIR.md: "yalnızca ... VE gözcü
   * açıkken"). `kanatCirpiyorMu`'nun kendi birim sınaması bu kararı SAF
   * fonksiyon olarak doğruluyor (page.test.ts); burada iddia GERÇEKTEN
   * sınıfın DOM'a hiç eklenmediği.
   */
  it("gözcü kapalıyken çalışan kart bile kanat çırptırmaz", async () => {
    await queue.add(newCard({ title: "gozcu-kapali", task: "iş", topology }));
    await al(queue, "coder");
    const { page, hatalar } = await ac();
    try {
      await page.waitForSelector(".formasyonDugum .kare-calisiyor", { timeout: 15_000 });
      expect(await page.evaluate(() => document.querySelectorAll(".formasyonKus.kanatCirpiyor").length)).toBe(0);
      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  /**
   * BOŞ DURUMLAR / KARTIN KİMLİĞİ sınamaları BURADAN KALKTI
   * (kart c-20261105-2a8dab). Sütun panosunun (.col/.colhead/.empty) ve
   * devir hareketinin (kartYerlestir/KART_DUGUM) kimlik koruması V
   * formasyonunda karşılığı YOK — diyagram diyagramSvgKur gibi her
   * yoklamada baştan kuruluyor, "boş sütun" metni bugün hiçbir yerde
   * ÇİZİLMİYOR. `bosRolMetni`/`bosBittiMetni`'nin SAF sınamaları
   * page.test.ts'te hâlâ duruyor (fonksiyonlar kasıtlı olarak silinmedi,
   * bir sonraki kart onları tüketebilir) ama burada ölçtükleri hiçbir DOM
   * düğümü kalmadı.
   */

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
     * DAR EKRANDA YÖN DEĞİŞİR — Pano'nun formasyon genişliği sınamasıyla
     * AYNI ilke (bkz. "formasyon genişliği pencere yüksekliğine göre
     * ölçekleniyor"). Yön bir CSS medya sorgusuyla çözülüyor, JS
     * pencereyi ÖLÇEREK değil: bu yüzden iddia KAYNAK METİNDEN değil, iki
     * GERÇEK viewport'ta HESAPLANAN 'display'dan.
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
        await page.waitForSelector('.formasyonDugum[data-rol="ortadaki"]', { timeout: 10_000 });

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
   * gizleniyor mu, Pano'ya dönünce formasyon hâlâ duruyor mu" sorusu
   * yalnızca gerçek DOM'da görünür.
   */
  it("sekmeler arasında geçiş board'u gizleyip yer tutucuyu gösteriyor, Pano'ya dönünce formasyon aynen duruyor", async () => {
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

      // GERİ DÖNÜŞ: Pano'nun kendi board'u (formasyon düğümleri) hâlâ
      // DOM'da — sekme değişimi onu YOK ETMEDİ, yalnızca gizledi.
      await page.click('.navSekme:has-text("Pano")');
      await page.waitForSelector("#icerikPano", { state: "visible", timeout: 10_000 });
      expect(await page.evaluate(() =>
        getComputedStyle(document.querySelector("#icerikAkislar")).display)).toBe("none");
      expect(await page.evaluate(() => document.querySelectorAll(".formasyonDugum").length)).toBeGreaterThan(0);
      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  /**
   * DEVIR-DENETIM: DEVIR.md Fidelity — "köşe yarıçapı: 0 (her yerde)".
   *
   * `.panoArac`'ın "Akışı düzenle"/"Rolleri düzenle"/"Promptları düzenle"
   * düğmeleri `.mini` sınıfını eski akış-düzenleyici bloğuyla PAYLAŞIYOR
   * (DEVIR-DENETIM.md §1, "ÖNEMLİ BULGU") ve bu blok `border-radius: 3px`
   * taşıyordu — SAPMALAR §2.7'nin tarif ettiği türden bir kusur: hiçbir
   * sınama GERÇEKTEN ÇİZİLEN köşeyi ölçmüyordu. Burada ölçülüyor.
   */
  it("üst araç satırındaki 'Rolleri düzenle' düğmesi köşesiz (DEVIR.md Fidelity)", async () => {
    const { page, hatalar } = await ac();
    try {
      await page.waitForSelector('button:has-text("Rolleri düzenle")', { timeout: 15_000 });
      const yaricap = await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll("#panoArac button"))
          .find((e) => e.textContent === "Rolleri düzenle");
        return b ? getComputedStyle(b).borderRadius : null;
      });
      expect(yaricap).toBe("0px");
      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  /**
   * MOD 5 — "Rolleri düzenle" (kart c-20261105-725320, DEVIR.md §3).
   *
   * page.test.ts yalnızca karar fonksiyonlarını (duzenleHatalari,
   * duzenleTasi, duzenleAdDegis, ...) kaynaktan çıkarıp sınıyor — panelin
   * GERÇEKTEN açıldığı, düğmelerin doğru öğeye bağlı olduğu ve Kaydet'in
   * GERÇEKTEN /akis/yaz'a gidip dosyayı değiştirdiği yalnızca burada
   * görünür. "Akışı düzenle" (üstteki "akış diyagramı" describe'ı) AYRI
   * bir yüzey — bu describe ona DOKUNMUYOR, kendi uçlarını (/akis,
   * /akis/onizleme, /akis/yaz, /promptlar) PAYLAŞIYOR.
   */
  describe("Rolleri düzenle (sağ panel MOD 5)", () => {
    const duzenleFlowYaml = (ad: string): string => `
name: ${ad}
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
    next: guard

  - id: guard
    provider: codex
    workspace: guard
    prompt: ../../roles/coder.prompt
    receive: batch
    next: done
`;

    /** "Ham YAML" sekmesinin DÜZENLENEBİLİR sunucu açılışıyla AYNI kalıp (bkz. akisSunucusuDuzenlenebilirAc). */
    async function duzenleSunucusuAc(ad: string, metin: string) {
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

    it("panel açılınca roller listelenir; başlıkta akış dosya yolu görünür, Kaydet değişiklik yokken devre dışıdır", async () => {
      const s = await duzenleSunucusuAc("duzenle-test1", duzenleFlowYaml("duzenle-test1"));
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.waitForSelector("#bar .pill", { timeout: 15_000 });
        await page.click('button:has-text("Rolleri düzenle")');
        await page.waitForSelector(".duzenleRol", { timeout: 10_000 });

        expect(await page.evaluate(() => document.querySelectorAll(".duzenleRol").length)).toBe(3);
        expect(await page.textContent(".railUst")).toContain("hub/flows/duzenle-test1.yaml");
        await page.waitForSelector("#duzenleKaydetBtn[disabled]", { timeout: 10_000 });
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    it("aynı adı taşıyan iki rol HATA verir (accent-700), Kaydet devre dışı kalır", async () => {
      const s = await duzenleSunucusuAc("duzenle-test2", duzenleFlowYaml("duzenle-test2"));
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.waitForSelector("#bar .pill", { timeout: 15_000 });
        await page.click('button:has-text("Rolleri düzenle")');
        await page.waitForSelector(".duzenleRol", { timeout: 10_000 });

        // İKİNCİ rolün adını BİRİNCİYLE AYNI yapıyoruz. ÖNCE blur() —
        // odaklı girdiyi KALDIRAN bir yeniden çizim (duzenleYenile ->
        // replaceChildren) tarayıcının kendi senkron "blur" yan etkisiyle
        // çakışıp "node to be removed is no longer a child" hatası
        // verebiliyor (ölçüldü); gerçek kullanıcı da yazdıktan sonra
        // ALANDAN ÇIKAR (Tab/tıkla), bu adım onu TAKLİT ediyor.
        await page.fill(".duzenleRolListe > .duzenleRol:nth-of-type(2) .duzenleAdGirisi", "coder");
        await page.evaluate(() => {
          const girdi = document.querySelectorAll(".duzenleAdGirisi")[1];
          girdi?.blur?.();
          girdi?.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await page.waitForSelector(".duzenleHata", { timeout: 10_000 });
        expect(await page.textContent(".duzenleHata")).toContain("coder");
        const disabled = await page.evaluate(() =>
          document.querySelector("#duzenleKaydetBtn")?.getAttribute("disabled") !== null);
        expect(disabled).toBe(true);
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    // UYARI engellemez (DEVIR.md §3) — bu sınama onu KANITLIYOR: açık
    // kartı olan bir rol SİLİNEBİLİYOR, yalnızca uyarılıyor.
    it("açık kartı olan bir rol silinince UYARI çıkar, ama silmeyi ENGELLEMEZ", async () => {
      const ad = "duzenle-test3";
      const yol = join(root, "hub", "flows", `${ad}.yaml`);
      await writeFile(yol, duzenleFlowYaml(ad));
      const live = await LiveFlow.open(yol, { root, providers: knownProviderSet() });
      await queue.add(newCard({ title: "açık kart", task: "iş", topology: live.topology }));
      const s = await serveUi({
        root, queue, topology: live.topology, flowName: live.flow.name, flowHash: live.flow.hash,
        live, flowPath: live.flow.path,
        loadOptions: { root, providers: knownProviderSet() },
        providerIds: knownProviderSet().ids(),
      });
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.waitForSelector("#bar .pill", { timeout: 15_000 });
        await page.click('button:has-text("Rolleri düzenle")');
        await page.waitForSelector(".duzenleRol", { timeout: 10_000 });

        // KART İLK ROLE ("coder") GİRDİ — onu SİLİYORUZ.
        await page.click('.duzenleRolListe > .duzenleRol:nth-of-type(1) button[aria-label="rolü sil"]');
        await page.waitForSelector(".duzenleUyari", { timeout: 10_000 });
        expect(await page.textContent(".duzenleUyari")).toContain("coder");
        expect(await page.evaluate(() => document.querySelectorAll(".duzenleRol").length)).toBe(2);
        // HATA yok — silme ENGELLENMEDİ, sadece uyarıldı.
        expect(await page.evaluate(() => document.querySelectorAll(".duzenleHata").length)).toBe(0);
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    it("sağlayıcı değiştirip Kaydet'e basmak dosyayı GERÇEKTEN değiştiriyor", async () => {
      const ad = "duzenle-test4";
      const s = await duzenleSunucusuAc(ad, duzenleFlowYaml(ad));
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.waitForSelector("#bar .pill", { timeout: 15_000 });
        await page.click('button:has-text("Rolleri düzenle")');
        await page.waitForSelector(".duzenleRol", { timeout: 10_000 });

        // GUARD (3. rol) codex'ten claude'a geçiyor.
        await page.selectOption(
          '.duzenleRolListe > .duzenleRol:nth-of-type(3) .duzenleIzgara label:has-text("sağlayıcı") select',
          "claude",
        );
        await page.waitForSelector("#duzenleKaydetBtn:not([disabled])", { timeout: 10_000 });
        await page.click("#duzenleKaydetBtn");
        await page.waitForTimeout(500);

        // İDDİA sunucunun söylediği değil DİSKTE GERÇEKTEN ne olduğu.
        const yaml = await readFile(join(root, "hub", "flows", `${ad}.yaml`), "utf8");
        expect(yaml).toMatch(/id: guard[\s\S]*?provider: claude/);
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    // ↑/↓ ikon düğmeleri — DEVIR.md §3: sıra formasyonu belirler.
    // "Normalizasyon: next HER ZAMAN sıradan türetilir" burada DİSKE
    // YAZILAN dosyada KANITLANIYOR, duzenleSiradanBagla'nın page.test.ts'teki
    // birim sınamasının TAMAMLAYICISI.
    it("↑ ile rolü yukarı taşımak sırayı GERÇEKTEN değiştirir, next yeniden kurulup kaydedilir", async () => {
      const ad = "duzenle-test5";
      const s = await duzenleSunucusuAc(ad, duzenleFlowYaml(ad));
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.waitForSelector("#bar .pill", { timeout: 15_000 });
        await page.click('button:has-text("Rolleri düzenle")');
        await page.waitForSelector(".duzenleRol", { timeout: 10_000 });

        // GUARD'ı (3.) YUKARI taşı: coder, guard, reviewer olmalı.
        await page.click('.duzenleRolListe > .duzenleRol:nth-of-type(3) button[aria-label="yukarı taşı"]');
        const ikinciAd = await page.evaluate(() => document.querySelectorAll(".duzenleAdGirisi")[1]?.value);
        expect(ikinciAd).toBe("guard");

        await page.waitForSelector("#duzenleKaydetBtn:not([disabled])", { timeout: 10_000 });
        await page.click("#duzenleKaydetBtn");
        await page.waitForTimeout(500);

        const yaml = await readFile(join(root, "hub", "flows", `${ad}.yaml`), "utf8");
        expect(yaml).toMatch(/id: guard[\s\S]*?next: reviewer/);
        expect(yaml).toMatch(/id: reviewer[\s\S]*?next: done/);
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    // DEVIR.md §3: "Diyagramda bir düğüme tıklanınca o rolün bloğu
    // accent-100 ile vurgulanır." — RAIL modu DEĞİŞMİYOR (panel kapanmıyor).
    it("diyagramda bir düğüme tıklamak panelde o rolün bloğunu vurgular, panel AÇIK KALIR", async () => {
      const ad = "duzenle-test6";
      const s = await duzenleSunucusuAc(ad, duzenleFlowYaml(ad));
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.waitForSelector("#bar .pill", { timeout: 15_000 });
        await page.click('button:has-text("Rolleri düzenle")');
        await page.waitForSelector(".duzenleRol", { timeout: 10_000 });

        await page.click('.formasyonDugum[data-rol="guard"] rect.kutu');
        await page.waitForSelector(".duzenleRol.duzenleVurgu", { timeout: 10_000 });
        const vurgulanan = await page.evaluate(() =>
          document.querySelector(".duzenleRol.duzenleVurgu")?.getAttribute("data-rol"));
        expect(vurgulanan).toBe("guard");
        // Panel KAPANMADI — hâlâ üç blok duruyor.
        expect(await page.evaluate(() => document.querySelectorAll(".duzenleRol").length)).toBe(3);
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);
  });

  /**
   * AKIŞLAR SEKMESİ — DEVIR.md §4, kart c-20261105-d36e37.
   *
   * page.test.ts yalnızca SAF karar fonksiyonlarını (akisOzetBul,
   * akisZinciriMetni, akisKartSinifi, akisAdiGecerliMi,
   * yeniAkisGecerliMi) kaynaktan çıkarıp sınıyor; kart ızgarasının
   * GERÇEKTEN birden çok akışı DOM'a çizdiği, "Panoda aç"ın GERÇEKTEN
   * akış değiştirdiği ve "Yeni akış" kutusunun GERÇEKTEN yeni bir dosya
   * yazıp onu rol düzenleyicisinde açtığı yalnızca burada görünür.
   */
  describe("Akışlar sekmesi", () => {
    const ikinciFlowYaml = `
name: ikinci
description: ikinci akış
constitution:
  - ../prompts/base.md
roles:
  - id: analiz
    provider: claude
    workspace: main
    prompt: ../../roles/coder.prompt
    next: done
`;

    /** Akış seçimine VE düzenlemeye açık bir ekran — "ikinci" adlı ikinci akışla. */
    async function akislarSunucusuAc() {
      await writeFile(join(root, "hub", "flows", "ikinci.yaml"), ikinciFlowYaml);
      const live = await LiveFlow.open(join(root, "hub", "flows", "test.yaml"), {
        root, providers: knownProviderSet(),
      });
      return serveUi({
        root, queue, topology, flowName: "test", flowHash: live.flow.hash, live,
        flowPath: live.flow.path,
        loadOptions: { root, providers: knownProviderSet() },
        providerIds: knownProviderSet().ids(),
        akisSecimi: {
          // GERÇEK dizini okuyor (production'daki listFlowNames'in AYNISI)
          // — sabit bir dizi, "Yeni akış" kutusunun yazdığı dosyayı asla
          // GÖRMEZDİ ve /akis/sec "Bilinmeyen akış" diye reddederdi.
          listele: async () => {
            const girdiler = await readdir(join(root, "hub", "flows"));
            return girdiler.filter((e) => e.endsWith(".yaml")).map((e) => e.slice(0, -".yaml".length)).sort();
          },
          ac: async (ad) => {
            const l = await LiveFlow.open(join(root, "hub", "flows", `${ad}.yaml`), {
              root, providers: knownProviderSet(),
            });
            return { live: l, flowPath: l.flow.path };
          },
        },
      });
    }

    it("kart ızgarası her akışı gösterir: panoda etiketi, rol sayısı ve zincir gerçek veriden", async () => {
      const s = await akislarSunucusuAc();
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.click('.navSekme:has-text("Akışlar")');
        await page.waitForSelector(".akisKart", { timeout: 10_000 });

        const kartlar = await page.evaluate(() =>
          Array.from(document.querySelectorAll(".akisKart")).map((k) => ({
            ad: k.getAttribute("data-akis"),
            panoda: k.classList.contains("akisKart-panoda"),
            metin: k.textContent,
          })));
        const test = kartlar.find((k) => k.ad === "test");
        const ikinci = kartlar.find((k) => k.ad === "ikinci");
        expect(test?.panoda).toBe(true);
        expect(ikinci?.panoda).toBe(false);
        expect(test?.metin).toContain("coder");
        expect(test?.metin).toContain("bitti");
        expect(ikinci?.metin).toContain("analiz");
        expect(ikinci?.metin).toContain("ikinci akış");
        // Her kartın mini formasyonu gerçekten çizildi (iki akış, iki SVG).
        expect(await page.evaluate(() => document.querySelectorAll(".akisKartFormasyon").length)).toBe(2);
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    it("'Panoda aç' başka bir akışın kartından panoyu o akışa geçirir", async () => {
      const s = await akislarSunucusuAc();
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.click('.navSekme:has-text("Akışlar")');
        await page.waitForSelector(".akisKart", { timeout: 10_000 });

        await page.click('.akisKart[data-akis="ikinci"] button:has-text("Panoda aç")');
        await page.waitForSelector('.formasyonDugum[data-rol="analiz"]', { timeout: 10_000 });
        // "Panoda aç" PANO'ya GEÇMELİ — Akışlar sekmesinde kalıp arkada
        // akış DEĞİŞTİRMEMELİ, yoksa operatör hangi akışa baktığını
        // GÖREMEZ.
        expect(await page.evaluate(() =>
          document.querySelector(".navSekme-aktif")?.textContent ?? "")).toContain("Pano");
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    it("'Yeni akış' kutusu şablondan YENİ bir dosya yazar ve onu rol düzenleyicisinde, PANO'DA açar", async () => {
      const s = await akislarSunucusuAc();
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.click('.navSekme:has-text("Akışlar")');
        await page.waitForSelector(".akisKart", { timeout: 10_000 });

        await page.click('button:has-text("Yeni akış")');
        await page.waitForSelector(".dialog", { timeout: 10_000 });
        // Modernist ".railBtn.primary" GERÇEKTEN uygulanıyor mu — düğme
        // satırı ".exits" (ESKİ sistem) içinde dursaydı ".exits
        // button.primary" (daha yüksek özgüllük) bunu ESKİ "gate" rengine
        // EZERDİ; ölçüldü (bu sınama önce TAM BU KUSURLA kırmızıydı).
        const olusturZemin = await page.evaluate(() =>
          getComputedStyle(document.querySelector(".dialog .railBtn.primary")).backgroundColor);
        expect(olusturZemin).toBe("rgb(174, 24, 0)"); // --color-accent-700
        await page.fill(".dialog input", "ucuncu");
        await page.selectOption(".dialog select", "test");
        await page.click('button:has-text("Oluştur ve düzenle")');

        // Editör PANO'da açılıyor — Akışlar sekmesinin kendi görünmez
        // alt ağacında kalsaydı operatör hiçbir şey GÖRMEZDİ.
        await page.waitForSelector(".duzenleRol", { timeout: 10_000 });
        expect(await page.evaluate(() =>
          document.querySelector(".navSekme-aktif")?.textContent ?? "")).toContain("Pano");
        const akisMono = await page.evaluate(() =>
          document.querySelector("#panoArac .mono")?.textContent ?? "");
        expect(akisMono).toContain("ucuncu");

        const yeniYol = join(root, "hub", "flows", "ucuncu.yaml");
        expect(await readFile(yeniYol, "utf8")).toContain("id: coder");
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    /**
     * DEVIR-DENETIM: DEVIR.md Fidelity — "köşe yarıçapı: 0 (her yerde)",
     * "tek vurgu rengi kırmızı". "Yeni akış" kutusunun hata kutusu ESKİ
     * ".err" sınıfını (4px köşe, turuncu "gate" paleti) devralıyordu —
     * SAPMALAR.md'de kayıtlı bir sapma DEĞİL, gözden kaçmış bir kusur.
     * Şablon akış BOZUKSA ("draft" yok) "Oluştur ve düzenle" senkron
     * olarak bu kutuyu gösteriyor — gerçek bir hata yolu, mock YOK.
     */
    it("'Yeni akış' kutusunun hata kutusu köşesiz ve tek-vurgu (accent) paletinde", async () => {
      await writeFile(join(root, "hub", "flows", "bozuk.yaml"), "name: bozuk\nroles: []\n");
      const s = await akislarSunucusuAc();
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.click('.navSekme:has-text("Akışlar")');
        await page.waitForSelector(".akisKart", { timeout: 10_000 });
        await page.click('button:has-text("Yeni akış")');
        await page.waitForSelector(".dialog", { timeout: 10_000 });

        await page.fill(".dialog input", "dorduncu");
        await page.selectOption(".dialog select", "bozuk");
        await page.click('button:has-text("Oluştur ve düzenle")');

        await page.waitForSelector(".dialog .err", { timeout: 10_000 });
        const stil = await page.evaluate(() => {
          const e = document.querySelector(".dialog .err");
          return e ? { kose: getComputedStyle(e).borderRadius, metin: e.textContent } : null;
        });
        expect(stil?.kose).toBe("0px");
        expect(stil?.metin).toContain("okunamıyor");
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    // kapat()'in YENİ dalı (bkz. page.ts yorumu): Akışlar sekmesinde
    // açılan "Yeni akış" kutusu Escape'le kapanınca sekme DEĞİŞMEMELİ —
    // ESKİ davranış (hash'i boşalt) burada Pano'ya SIÇRARDI, çünkü bu
    // sekmede hash SEKMENİN KENDİSİ.
    it("Akışlar sekmesinde 'Yeni akış' kutusu Escape'le kapanır, sekme DEĞİŞMEZ", async () => {
      const s = await akislarSunucusuAc();
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.click('.navSekme:has-text("Akışlar")');
        await page.waitForSelector(".akisKart", { timeout: 10_000 });
        await page.click('button:has-text("Yeni akış")');
        await page.waitForSelector(".dialog", { timeout: 10_000 });

        await page.evaluate(() =>
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));

        await page.waitForTimeout(150);
        expect(await page.evaluate(() => document.querySelector(".dialog"))).toBeNull();
        expect(await page.evaluate(() =>
          document.querySelector(".navSekme-aktif")?.textContent ?? "")).toContain("Akışlar");
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);
  });

  /**
   * AJANLAR SEKMESİ — DEVIR.md §6, kart c-20261105-d304ed.
   *
   * `page.test.ts` yalnızca karar fonksiyonlarını (ajanDurumMetni vb.)
   * izole sınıyor; GERÇEK bir aktivasyonun "GET /adimlar"a gidip
   * döndüğünü, "canlı" etiketinin GERÇEKTEN göründüğünü ve rol seçiminin
   * GERÇEKTEN panel değiştirdiğini ancak burada görebiliriz.
   */
  describe("Ajanlar sekmesi", () => {
    const ikiRolFlowYaml = `
name: test
constitution:
  - ../prompts/base.md
roles:
  - id: coder
    provider: claude
    workspace: main
    prompt: ../../roles/coder.prompt
    next: reviewer
  - id: reviewer
    provider: codex
    workspace: reviewer
    receive: batch
    prompt: ../../roles/reviewer.prompt
    next: done
`;

    /** İKİ rollü bir akışla ekran — rol SEÇİMİNİ ve "Görevi" özetini sınamak için. */
    async function ikiRolSunucusuAc() {
      await writeFile(
        join(root, "roles", "reviewer.prompt"),
        "# Rolün: reviewer\n\nKodu gözden geçirir.\n\n## Sahiplendiğin\n\n- kodu incele\n- hata bul\n",
      );
      await writeFile(join(root, "hub", "flows", "test.yaml"), ikiRolFlowYaml);
      const live = await LiveFlow.open(join(root, "hub", "flows", "test.yaml"), {
        root, providers: knownProviderSet(),
      });
      const topo = snapshot(live.flow, root);
      return serveUi({
        root, queue, topology: topo, flowName: "test", flowHash: live.flow.hash,
        live, flowPath: live.flow.path, loadOptions: { root, providers: knownProviderSet() },
      });
    }

    it("solda her rol için bir satır; tıklamak sağ paneli o role çevirir", async () => {
      const s = await ikiRolSunucusuAc();
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.click('.navSekme:has-text("Ajanlar")');
        await page.waitForSelector(".ajanSatir", { timeout: 10_000 });

        const satirlar = await page.evaluate(() =>
          Array.from(document.querySelectorAll(".ajanSatir")).map((s) => s.textContent));
        expect(satirlar.some((t) => t?.includes("coder"))).toBe(true);
        expect(satirlar.some((t) => t?.includes("reviewer"))).toBe(true);
        // Hiç kart yokken İKİSİ de boşta.
        expect(satirlar.every((t) => t?.includes("boşta"))).toBe(true);

        // İLK rol varsayılan olarak seçili — sağlayıcısı, çalışma alanı,
        // alım biçimi ve "Görevi" özeti GERÇEK topolojiden geliyor.
        const ilkPanel = await page.textContent(".ajanPanel");
        expect(ilkPanel).toContain("coder");
        expect(ilkPanel).toContain("claude");
        expect(ilkPanel).toContain("tekil alım");
        // BOŞ DURUM METİNLERİ hiç kart/aktivasyon yokken kaybolmamalı
        // (denetim kartı c-20261105-387d01) — "Şu an" kutusu ve Adımlar
        // bölümü ikisi de "ajanPanel" içine yuvalı.
        expect(ilkPanel).toContain("Şu an bu role atanmış bir kart yok.");
        expect(ilkPanel).toContain("Koşan bir ajan yok.");

        await page.click('.ajanSatir:has-text("reviewer")');
        await page.waitForSelector(".ajanPanelAd:has-text(\"reviewer\")", { timeout: 10_000 });
        // "Görevi" özeti AYRI bir fetch'ten geliyor (ajanPromptYukle) ve
        // bir SONRAKİ saniyelik yoklamada basılıyor — madde listesi
        // GERÇEKTEN göründüğünde özet de hazır demektir.
        await page.waitForSelector(".ajanGorevListe", { timeout: 10_000 });
        const reviewerPanel = await page.textContent(".ajanPanel");
        expect(reviewerPanel).toContain("codex");
        expect(reviewerPanel).toContain("toplu alım");
        // "Görevi · promptundan" — giriş paragrafı + ilk bölümün maddeleri,
        // GERÇEKTEN diskten okunup ayrıştırıldı.
        expect(reviewerPanel).toContain("Kodu gözden geçirir.");
        expect(reviewerPanel).toContain("kodu incele");
        expect(reviewerPanel).toContain("hata bul");

        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    it("'Ajanı izle →' Rol modundan Ajanlar sekmesini O ROLÜ SEÇİLİ açar", async () => {
      const s = await ikiRolSunucusuAc();
      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.click('.formasyonDugum[data-rol="reviewer"] rect.kutu');
        await page.waitForSelector('button:has-text("Ajanı izle →")', { timeout: 10_000 });
        await page.click('button:has-text("Ajanı izle →")');

        await page.waitForSelector(".ajanPanelAd:has-text(\"reviewer\")", { timeout: 10_000 });
        expect(await page.evaluate(() =>
          document.querySelector(".navSekme-aktif")?.textContent ?? "")).toContain("Ajanlar");
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    /**
     * GERÇEK AKTİVASYON — "GET /adimlar"ın UÇTAN UCA sınaması. model.test.ts
     * ve page.test.ts ikisi de bu yolun PARÇALARINI (activationSteps,
     * ajanCanliMi) izole sınıyor; burada ÜÇÜ (günlük → uç → tarayıcı)
     * birlikte, GERÇEKTEN çalışıyor mu görülüyor.
     */
    it("koşan ajan: 'şu an' kutusu, 'canlı' etiketi ve Adımlar listesi GERÇEK /adimlar'dan gelir", async () => {
      // "canlı" (ve bu nedenle "GET /adimlar"ın GERÇEKTEN çağrılması)
      // gözcünün AÇIK olmasını şart koşuyor (ajanCanliMi, page.ts) — gerçek
      // bu test SÜRECİNİN kendi pid'i kullanılıyor ki `pidAlive` GERÇEKTEN
      // "yaşıyor" dönsün (bkz. watch/lock.ts pidAlive: process.kill(pid, 0)).
      await acquireLock(join(root, ".skein", "daemon.json"), {
        pid: process.pid, startedAt: new Date().toISOString(), flow: "test", hash: "h", mode: "serve",
      });
      const kart = await queue.add(newCard({ title: "jitter ekle", task: "iş", topology }));
      await al(queue, "coder");
      const log = new EventLog(join(root, ".skein", "olaylar.jsonl"), "kosu-1");
      await log.append({
        type: "agent.started", cell: `${kart.id}:coder`, role: "coder",
        provider: "claude", model: "m", promptHash: "h",
      });
      await log.append({
        type: "agent.step", cell: `${kart.id}:coder`, role: "coder",
        seq: 1, kind: "tool", name: "Read", detail: "src/retry.ts",
      });
      await log.append({
        type: "agent.step", cell: `${kart.id}:coder`, role: "coder",
        seq: 2, kind: "tool", name: "Bash", detail: "npx vitest run",
      });

      const { page, hatalar } = await ac();
      try {
        await page.click('.navSekme:has-text("Ajanlar")');
        await page.waitForSelector(".ajanSatir", { timeout: 10_000 });

        // SOL SATIR: canlı adım "araç · ayrıntı" biçiminde.
        await page.waitForSelector(".ajanSatirDurum:has-text(\"Bash\")", { timeout: 10_000 });
        const satirMetni = await page.textContent(".ajanSatirDurum");
        expect(satirMetni).toBe("Bash · npx vitest run");

        // SAĞ PANEL: "Şu an" kutusu kartın başlığını taşıyor, "canlı"
        // etiketi görünür, ve Adımlar listesi SUNUCUDAN GERÇEKTEN gelen
        // iki adımı EN YENİSİ EN ÜSTTE gösteriyor.
        expect(await page.textContent(".ajanSuAnBaslik")).toBe("jitter ekle");
        // "Şu an" kutusunun KENDİ satırı da sol satırla AYNI "araç ·
        // ayrıntı"yı taşıyor — ajanSuAnDurumu'nun "live" dalının bu kutuya
        // GERÇEKTEN ulaştığının kanıtı (bkz. ajanSuAnKutuKur, page.ts).
        const suAnSatirMetni = await page.textContent(".ajanSuAnSatir");
        expect(suAnSatirMetni).toContain("Bash");
        expect(suAnSatirMetni).toContain("npx vitest run");
        await page.waitForSelector(".ajanCanliEtiket", { timeout: 10_000 });
        await page.waitForSelector(".ajanAdim", { timeout: 10_000 });
        const adimlar = await page.evaluate(() =>
          Array.from(document.querySelectorAll(".ajanAdim")).map((a) => a.textContent ?? ""));
        expect(adimlar).toHaveLength(2);
        expect(adimlar[0]).toContain("Bash");
        expect(adimlar[0]).toContain("npx vitest run");
        expect(adimlar[1]).toContain("Read");

        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
      }
    }, 60_000);

    /**
     * BAYAT KİLİT — reviewer'ın b64fe2f için itirazı: kart "active" olsa
     * bile gözcü ÖLÜYSE (burada hiç acquireLock çağrılmıyor, tıpkı "gözcü
     * kapalıyken çalışan kart" (satır ~1667) testindeki gibi) "Şu an"
     * kutusu SOLDAKİ satırla (ajanDurumMetni) ÇELİŞEN sahte bir
     * "Bash · …" basmamalı — ikisi AYNI karttan AYNI kararı (page.ts,
     * ajanSuAnDurumu) okumalı.
     */
    it("gözcü ölüyken 'Şu an' kutusu da 'gözcü kapalı' der, sahte araç satırı basmaz", async () => {
      const kart = await queue.add(newCard({ title: "bayat-kilit", task: "iş", topology }));
      await al(queue, "coder");
      const log = new EventLog(join(root, ".skein", "olaylar.jsonl"), "kosu-2");
      await log.append({
        type: "agent.started", cell: `${kart.id}:coder`, role: "coder",
        provider: "claude", model: "m", promptHash: "h",
      });
      await log.append({
        type: "agent.step", cell: `${kart.id}:coder`, role: "coder",
        seq: 1, kind: "tool", name: "Bash", detail: "npx vitest run",
      });

      const { page, hatalar } = await ac();
      try {
        await page.click('.navSekme:has-text("Ajanlar")');
        await page.waitForSelector(".ajanSatir", { timeout: 10_000 });

        // SOL SATIR: page.test.ts'teki ajanDurumMetni biriminin GERÇEK
        // DOM karşılığı.
        await page.waitForSelector('.ajanSatirDurum:has-text("gözcü kapalı")', { timeout: 10_000 });
        expect(await page.textContent(".ajanSatirDurum")).toBe("gözcü kapalı · bayat-kilit yarıda");

        // SAĞ KUTU — AYNI kart için AYNI anlatı: sahte "Bash" satırı YOK,
        // "gözcü kapalı" VAR, ve "şu an önemli bir şey oluyor" diyen
        // accent çizgisi (ajanSuAn-vurgulu) de BASILMIYOR.
        const satirMetni = await page.textContent(".ajanSuAnSatir");
        expect(satirMetni).not.toContain("Bash");
        expect(satirMetni).toContain("gözcü kapalı");
        expect(await page.evaluate(() =>
          document.querySelector(".ajanSuAn")?.classList.contains("ajanSuAn-vurgulu"))).toBe(false);

        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
      }
    }, 60_000);

    /**
     * KANAT ÇIRPMA Ajanlar listesinde de GERÇEKTEN oynuyor.
     *
     * Ölçülmüş kusur: ".kanatCirpiyor" sınıfı JS'te (kanatCirpiyorMu)
     * ".ajanKus"a da ekleniyordu ama "@keyframes formasyonKanat" kuralı
     * SEÇİCİ olarak yalnızca ".formasyonKus.kanatCirpiyor"u hedefliyordu —
     * sınıf DOM'a biniyordu ama hiçbir animasyon UYGULANMIYORDU, ve bunu
     * "sözdizimi geçerli" ya da "sınıf var mı" türünden hiçbir sınama
     * YAKALAYAMAZDI (ikisi de doğruydu). Tek kanıt GERÇEK tarayıcının
     * hesapladığı `animationName`.
     */
    it("Ajanlar listesindeki kuş da GERÇEKTEN kanat çırpıyor (koşan + gözcü açık)", async () => {
      await acquireLock(join(root, ".skein", "daemon.json"), {
        pid: process.pid, startedAt: new Date().toISOString(), flow: "test", hash: "abc", mode: "serve",
      });
      await queue.add(newCard({ title: "kanat-ajanlar", task: "iş", topology }));
      await al(queue, "coder");

      const { page, hatalar } = await ac();
      try {
        await page.click('.navSekme:has-text("Ajanlar")');
        await page.waitForSelector(".ajanKus.kanatCirpiyor", { timeout: 15_000 });
        const anim = await page.evaluate(() =>
          getComputedStyle(document.querySelector(".ajanKus.kanatCirpiyor")).animationName);
        expect(anim).not.toBe("none");
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
      }
    }, 60_000);

    // SAPMALAR.md §2.2: "yeni formasyon diyagramındaki kanat çırpma da
    // AYNI korumanın arkasında olmalı" — Ajanlar listesinin kuşu da aynı
    // koşuldan geçiyor. Yukarıdaki "formasyonKus" çiftinin (satır ~1620)
    // Ajanlar sekmesindeki eşi.
    it("Ajanlar listesindeki kuş prefers-reduced-motion'da ÇIRPMAZ", async () => {
      await acquireLock(join(root, ".skein", "daemon.json"), {
        pid: process.pid, startedAt: new Date().toISOString(), flow: "test", hash: "abc", mode: "serve",
      });
      await queue.add(newCard({ title: "kanat-ajanlar-azalt", task: "iş", topology }));
      await al(queue, "coder");

      const { page, hatalar } = await acHareket("reduce");
      try {
        await page.click('.navSekme:has-text("Ajanlar")');
        await page.waitForSelector(".ajanKus.kanatCirpiyor", { timeout: 15_000 });
        const anim = await page.evaluate(() =>
          getComputedStyle(document.querySelector(".ajanKus.kanatCirpiyor")).animationName);
        expect(anim).toBe("none");
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
      }
    }, 60_000);
  });

  /**
   * UÇUŞ — kart devredilince kuşun V üzerinden kaynaktan hedefe kayması
   * (kart c-20261106-d6e795, "kuşlar V üzerinde yol alsın"). `page.test.ts`
   * yalnızca SAF fonksiyonları (govdeYolu/ucusKonumu/...) sınıyor; "ekranda
   * GERÇEKTEN bir kuş kayıyor mu, bu düz bir çizgi mi yoksa V'nin kendisi
   * mi" sorusu SAPMALAR.md §2.7'nin tam uyardığı sınıf — ancak gerçek
   * tarayıcıda, ARA KAREDE ÖLÇÜLEREK cevaplanabilir.
   *
   * İki rollü (coder→reviewer) özel bir akış gerekiyor: dış beforeEach'in
   * "test" akışı tek rollü, devredilecek bir İKİNCİ rol yok. `queue` ve
   * `root` dış beforeEach'ten PAYLAŞILIYOR (yukarıdaki "seçiciden akış
   * değiştirince" sınamasının AYNI deseni); yalnızca sunucu bu YENİ
   * topolojiyle açılıyor.
   */
  describe("Uçuş — devredilen kartın V üzerinde uçması", () => {
    const FLOW_IKI = `
name: iki
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
    next: done
`;

    /** İki rollü akışı yazar, topolojisini çıkarır ve ONUNLA bir sunucu açar. */
    async function ikiRoluSunucuAc(): Promise<{ s: UiServer; topologyIki: TopologySnapshot }> {
      await writeFile(join(root, "hub", "flows", "iki.yaml"), FLOW_IKI);
      const flowIki = await loadFlow(join(root, "hub", "flows", "iki.yaml"), {
        root, providers: knownProviderSet(),
      });
      const topologyIki = snapshot(flowIki, root);
      const s = await serveUi({
        root, queue, topology: topologyIki, flowName: flowIki.name, flowHash: flowIki.hash,
      });
      return { s, topologyIki };
    }

    /**
     * Bir düğümün EKRANDAKİ merkezi (getBoundingClientRect'ten). Seçici
     * BİLEREK satır içinde (ikisi de bu describe'ın sabit rolleri,
     * "coder"/"reviewer") — bu dosyadaki `Sayfa.evaluate` türü tek
     * argümanlı, bir parametre geçirmeyi desteklemiyor (bkz. yukarıdaki
     * `El`/`Sayfa` bildirimleri); o türü BURADA genişletmek bu kartın
     * kapsamı dışında bir altyapı değişikliği olurdu.
     */
    async function dugumMerkeziCoder(page: Sayfa): Promise<{ x: number; y: number }> {
      return page.evaluate(() => {
        const r = document.querySelector('.formasyonDugum[data-rol="coder"]')!.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
    }
    async function dugumMerkeziReviewer(page: Sayfa): Promise<{ x: number; y: number }> {
      return page.evaluate(() => {
        const r = document.querySelector('.formasyonDugum[data-rol="reviewer"]')!.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
    }

    it("ara karede kuş kaynak İLE hedef ARASINDA durur, GERÇEKTEN V'nin üzerinden (düz çizgi DEĞİL)", async () => {
      const { s, topologyIki } = await ikiRoluSunucuAc();
      const card = newCard({ title: "devir-ucusu", task: "iş", topology: topologyIki });
      await queue.add(card);
      const taken = await al(queue, "coder");

      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.waitForSelector('.formasyonDugum[data-rol="coder"] .kare-calisiyor', { timeout: 15_000 });

        const coderMerkez = await dugumMerkeziCoder(page);
        const reviewerMerkez = await dugumMerkeziReviewer(page);

        /*
         * ÖRNEKLEYİCİ DEVİRDEN ÖNCE başlar ve TÜM uçuş boyunca kare
         * toplar. Sözü Node tarafında tutuluyor: `evaluate` beklenmeden
         * başlatılıyor, devir arada yapılıyor, sonuç sonra alınıyor.
         *
         * NİYE: önceki hâli `waitForSelector` + sabit `waitForTimeout(400)`
         * ile TEK kare ölçüyordu ve KARARSIZDI — ölçüldü, 5 koşudan 3'ü
         * düştü (y = 337.7 / 343.4 / 346.9; eşik 349.0). 400ms sabitti ama
         * BAŞLANGIÇ noktası değil: `waitForSelector`'ın dönme gecikmesi
         * yüke göre değişiyor ve örnek uçuşun SONUNA, kuşun hedefe geri
         * tırmandığı yere kayıyordu. Suite'in yeşil geldiği koşuda kart
         * denetçiden geçti; kararsızlık böyle yerleşti.
         *
         * V'nin DİBİ zamanlamadan BAĞIMSIZ: uçuş onu her hâlükârda
         * geçiyor. İddia aynı (SAPMALAR §2.7 — KONUM ölçülür, nitelik
         * değil), yalnızca dayanağı sağlam.
         */
        const izSozu = page.evaluate(
          () =>
            new Promise<{ x: number; y: number; w: number }[]>((coz) => {
              const kareler: { x: number; y: number; w: number }[] = [];
              let gorundu = false;
              const bitis = performance.now() + 20_000; // koşulsuz üst sınır
              const bak = (): void => {
                const el = document.querySelector(".ucanKus svg.formasyonKus");
                if (el !== null) {
                  gorundu = true;
                  const r = el.getBoundingClientRect();
                  kareler.push({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width });
                } else if (gorundu) {
                  coz(kareler); // uçuş bitti: overlay söküldü
                  return;
                }
                if (performance.now() > bitis) { coz(kareler); return; }
                requestAnimationFrame(bak);
              };
              bak();
            }),
        );

        // DEVİR — kart artık "coder" DEĞİL, "reviewer" rolünde.
        await queue.handoff(taken, {});

        const iz = await izSozu;
        // Tek kare "hareket" iddiasını taşımaz.
        expect(iz.length).toBeGreaterThan(2);

        // V'nin DİBİ: ekranda en AŞAĞIDAKİ (en büyük y) kare.
        const araKonum = iz.reduce((a, b) => (b.y > a.y ? b : a));

        // SAPMALAR.md §2.7'nin asıl iddiası: KONUM ölçülüyor, nitelik/
        // sınıf değil. x KAYNAK İLE HEDEF ARASINDA, İKİSİNE DE eşit DEĞİL.
        const solX = Math.min(coderMerkez.x, reviewerMerkez.x);
        const sagX = Math.max(coderMerkez.x, reviewerMerkez.x);
        expect(araKonum.x).toBeGreaterThan(solX + 5);
        expect(araKonum.x).toBeLessThan(sagX - 5);

        // DÜZ ÇİZGİ DEĞİL: coder ve reviewer AYNI satırda (ekranda aynı Y),
        // düz bir çizgi ara karede de O satırda kalırdı. Gerçek yol
        // tepeden (daha AŞAĞIDA, SVG'de y=480) dolandığı için ara karenin
        // Y'si ikisininkinden GÖZLE GÖRÜLÜR ölçüde BÜYÜK (ekranda AŞAĞIDA)
        // olmalı.
        expect(Math.abs(coderMerkez.y - reviewerMerkez.y)).toBeLessThan(15);
        expect(araKonum.y).toBeGreaterThan(coderMerkez.y + 20);
        expect(araKonum.y).toBeGreaterThan(reviewerMerkez.y + 20);

        // SAPMALAR.md §2.7'nin ikinci dersi (21 kat büyüme kusuru): bu YENİ
        // öğe de kendi nominal (46x23) ölçüsünde kalmalı, diyagramı
        // kaplamamalı.
        expect(araKonum.w).toBeLessThan(120);
        expect(araKonum.w).toBeGreaterThan(10);

        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    it("hareket bitince kuş hedefte KALIR ve normal koşulla kanat çırpmaya başlar", async () => {
      await acquireLock(join(root, ".skein", "daemon.json"), {
        pid: process.pid, startedAt: new Date().toISOString(), flow: "iki", hash: "abc", mode: "serve",
      });
      const { s, topologyIki } = await ikiRoluSunucuAc();
      const card = newCard({ title: "devir-inis", task: "iş", topology: topologyIki });
      await queue.add(card);
      const taken = await al(queue, "coder");

      const page = await (browser as Tarayici).newPage({ viewport: { width: 1280, height: 900 } });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.waitForSelector('.formasyonDugum[data-rol="coder"] .kare-calisiyor', { timeout: 15_000 });

        await queue.handoff(taken, {});
        await al(queue, "reviewer"); // reviewer'ı da ALMADAN "active" olmaz, kanat çırpma koşulu bunu ister.

        // Uçuş biter (900ms) VE bir sonraki yoklama ÇOKTAN geçmiştir —
        // hedefte artık NORMAL (statik) düğüm kuşu kanat çırpıyor olmalı,
        // AYNI kanatCirpiyorMu koşuluyla (DEVIR görevinin istediği gibi).
        await page.waitForSelector(".formasyonDugum[data-rol=\"reviewer\"] .formasyonKus.kanatCirpiyor", {
          timeout: 15_000,
        });
        // UÇUŞ overlay'i artık YOK — kalıcı bir "hayalet kuş" bırakmıyor.
        await page.waitForTimeout(1_200);
        const ucanKusSayisi = await page.evaluate(() => document.querySelectorAll(".ucanKus").length);
        expect(ucanKusSayisi).toBe(0);

        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);

    /**
     * SAPMALAR.md §2.2 — prefers-reduced-motion'da UÇUŞ OLMAZ, kuş hedefte
     * ANINDA belirir. Kanat çırpmanın AYNI korumasının (acHareket("reduce"))
     * bu YENİ harekete de uygulandığının sınaması.
     */
    it("prefers-reduced-motion'da UÇUŞ overlay'i HİÇ kurulmaz", async () => {
      const { s, topologyIki } = await ikiRoluSunucuAc();
      const card = newCard({ title: "devir-azalt", task: "iş", topology: topologyIki });
      await queue.add(card);
      const taken = await al(queue, "coder");

      const page = await (browser as Tarayici).newPage({
        viewport: { width: 1280, height: 900 }, reducedMotion: "reduce",
      });
      const hatalar: string[] = [];
      page.on("pageerror", (e) => hatalar.push(String(e)));
      try {
        await page.goto(s.url, { waitUntil: "networkidle" });
        await page.waitForSelector('.formasyonDugum[data-rol="coder"] .kare-calisiyor', { timeout: 15_000 });

        await queue.handoff(taken, {});
        await al(queue, "reviewer");
        // Devrin POLL'a yakalanıp ekranın hedefte GERÇEKTEN belirdiğini
        // bekliyoruz — bu an geçtiyse, bir uçuş OLACAKSA çoktan olmuş
        // olurdu (reduced-motion dalı uçuşu hiç KURMUYOR, zamanlamaya
        // bağlı bir yarış DEĞİL).
        await page.waitForSelector('.formasyonDugum[data-rol="reviewer"] .kare-calisiyor', { timeout: 15_000 });

        const ucanKusSayisi = await page.evaluate(() => document.querySelectorAll(".ucanKus").length);
        expect(ucanKusSayisi).toBe(0);
        expect(hatalar).toEqual([]);
      } finally {
        await page.close();
        await s.close();
      }
    }, 60_000);
  });
});

/**
 * KUŞ ÇİZİLEN BOYUTTA DA DOĞRU OLMALI.
 *
 * Gerçekte şöyle patladı: ".formasyonSarmal svg" TORUN seçicisiydi ve
 * rol düğümlerine gömülü kuş <svg>'lerine de uyuyordu. Kuş
 * width="46" height="23" nitelikleriyle yaratılıyor ama CSS niteliği
 * EZER — her kuş 1000x640 hesaplandı, ekranda ~983x313 çizildi ve
 * diyagramın üstünü tamamen kapattı.
 *
 * On kartın hiçbirinin sınaması bunu yakalamadı, denetçi de görmedi.
 * Sebebi tek cümlede: hepsi NİTELİĞE, SINIFA ve RENGE bakıyordu.
 * polyline noktaları doğruydu, stroke 4'tü, sınıf yerindeydi, renk
 * doğruydu — ve ekran kullanılamaz hâldeydi.
 *
 * Bu sınama ÇİZİLEN boyutu ölçer. "Nitelik doğru" ile "ekranda doğru"
 * ayrı iddialardır; ikincisini ancak tarayıcı söyleyebilir.
 */
describe("formasyon kuşu — çizilen boyut", () => {
  it("kuş kendi 46x23 kutusunda kalır, diyagramı kaplamaz", async () => {
    const { page, hatalar } = await ac();
    try {
      const olcu = await page.evaluate(() => {
        const kus = document.querySelector("svg.formasyonKus");
        if (!kus) return null;
        const r = kus.getBoundingClientRect();
        return { g: r.width };
      });
      expect(olcu).not.toBeNull();
      // 46x23 nominal; ölçek ve yuvarlama için geniş pay bırakıyoruz ama
      // bir büyüklük mertebesi sapmayı yakalayacak kadar dar.
      expect(olcu!.g).toBeLessThan(120);
      // Sıfır da kusurdur: görünmeyen kuş da yanlış.
      expect(olcu!.g).toBeGreaterThan(10);
      expect(hatalar).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("DIŞ diyagram svg'si hâlâ sarmalı dolduruyor", async () => {
    // Düzeltme yanlış tarafa kaçarsa (dış svg de küçülürse) diyagram
    // görünmez olur; o yön de pinli.
    const { page } = await ac();
    try {
      const olcu = await page.evaluate(() => {
        const dis = document.querySelector(".formasyonSarmal > svg");
        return dis ? Math.round(dis.getBoundingClientRect().width) : 0;
      });
      expect(olcu).toBeGreaterThan(300);
    } finally {
      await page.close();
    }
  }, 60_000);
});
