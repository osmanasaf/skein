import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isEntryPoint, tsxCliPath } from "./process.js";

/**
 * `tsxCliYolu` köke doğru GERÇEK `tsx` kurulumuna bakmadan da sınanabilir:
 * sahte bir `node_modules/tsx` paketi kurup Node'un modül çözümlemesinin
 * gerçekten ÜST dizine doğru aradığını doğruluyoruz — reddedilen turda
 * `cli.test.ts`in ELLE `join(cwd, "node_modules", ...)` yapması tam bu
 * senaryoda (çağıran dizinin KENDİ `node_modules`'ü yok) patlamıştı.
 */
let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-tsxyolu-"));
  await mkdir(join(root, "node_modules", "tsx", "dist"), { recursive: true });
  await writeFile(
    join(root, "node_modules", "tsx", "package.json"),
    JSON.stringify({ name: "tsx", version: "0.0.0" }),
  );
  await writeFile(join(root, "node_modules", "tsx", "dist", "cli.mjs"), "// sahte\n");
  // `git worktree add` ile açılmış bir çalışma ağacını taklit ediyor: KENDİ
  // `node_modules`'ü yok, paket ancak ÜST dizinde (`root`) var.
  await mkdir(join(root, "calisma-agaci", "alt"), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("tsxCliYolu", () => {
  it("çağıranın KENDİ node_modules'ü olmasa da ÜST dizindeki tsx'i bulur", () => {
    const expected = join(root, "node_modules", "tsx", "dist", "cli.mjs");
    expect(tsxCliPath(join(root, "calisma-agaci", "alt"))).toBe(expected);
  });

  it("node_modules doğrudan kökte olduğunda da aynı sonucu verir", () => {
    const expected = join(root, "node_modules", "tsx", "dist", "cli.mjs");
    expect(tsxCliPath(root)).toBe(expected);
  });
});

/**
 * BİR MODÜLÜ İÇE ALMANIN YAN ETKİSİ OLMAMALI.
 *
 * Bu sınamaların koruduğu kusur gerçekti: iki CLI da dosya sonunda koşulsuz
 * `main()` çağırıyordu, `parseArgs`'ı içe alan sınama gözcüyü sınama
 * sürecinde koşturdu ve kusur yalnızca bir "unhandled rejection" satırı
 * olarak göründü.
 *
 * Buradaki asıl tehlike DÜZELTMENİN KENDİSİ: koruma yanlış tarafa düşerse
 * CLI hiç çalışmaz ve bunu kimse duymaz. Onun için iki yön de pinli —
 * "içe alınınca false" VE "giriş noktasıyken true".
 */
describe("girisNoktasiMi", () => {
  const oldArgv = process.argv[1];
  afterEach(() => {
    process.argv[1] = oldArgv as string;
  });

  it("BAŞKA bir dosya giriş noktasıysa false — içe alma yan etki yapmaz", () => {
    process.argv[1] = join(root, "baska-giris.mjs");
    expect(isEntryPoint(pathToFileURL(join(root, "modul.ts")).href)).toBe(false);
  });

  // ASIL SINAV: bu yön düşerse CLI'lar SESSİZCE hiç koşmaz.
  it("modülün KENDİSİ giriş noktasıysa true", async () => {
    const entry = join(root, "giris.mjs");
    await writeFile(entry, "export {};\n");
    process.argv[1] = entry;
    expect(isEntryPoint(pathToFileURL(entry).href)).toBe(true);
  });

  it("göreli yazılmış giriş yolunu da tanır — `resolve`'dan geçiyor", async () => {
    const entry = join(root, "goreli.mjs");
    await writeFile(entry, "export {};\n");
    const oldCwd = process.cwd();
    process.chdir(root);
    try {
      process.argv[1] = "goreli.mjs";
      expect(isEntryPoint(pathToFileURL(entry).href)).toBe(true);
    } finally {
      process.chdir(oldCwd);
    }
  });

  // Depo bir sembolik bağın arkasındaysa `import.meta.url` gerçek yolu
  // yazar, `argv[1]` ise bağı. Tek biçimle karşılaştırmak o kurulumda
  // CLI'ı sessizce öldürürdü.
  it("giriş sembolik bağla verilse de GERÇEK yolu tanır", async () => {
    const actual = join(root, "gercek.mjs");
    await writeFile(actual, "export {};\n");
    const bag = join(root, "bag.mjs");
    await symlink(actual, bag);
    process.argv[1] = bag;
    expect(isEntryPoint(pathToFileURL(actual).href)).toBe(true);
  });

  it("giriş noktası yoksa (`node -e`) false", () => {
    delete process.argv[1];
    expect(isEntryPoint(pathToFileURL(join(root, "modul.ts")).href)).toBe(false);
  });
});
