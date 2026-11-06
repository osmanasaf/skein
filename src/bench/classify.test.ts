import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adapterFor } from "../adapters/factory.js";
import { makeFakeCli } from "../testing/fake-cli.js";
import { applyFindings, classifyReport, countFindings, type Finding } from "./classify.js";

describe("applyFindings", () => {
  const report = "Havuz hata yolunda kuyruğu beslemeye devam ediyor; ayrıca değişken adı kısa.";

  it("alıntısı raporda bulunan bulguları sayar", () => {
    const { findings, unverified } = applyFindings([
      { sinif: "gercek", kanitli: true, alinti: "kuyruğu beslemeye devam ediyor" },
      { sinif: "nit", kanitli: false, alinti: "ayrıca değişken adı kısa" },
    ], report);
    expect(findings).toHaveLength(2);
    expect(unverified).toBe(0);
    expect(findings[0]?.proven).toBe(true);
  });

  // 1. katmanda doğrulanamayan alıntı denetçinin ALEYHİNE sayılıyor
  // (kaçırma). Burada aleyhe saymak, hakemin uydurduğu bir bulguyu
  // denetçinin yanlış pozitifi diye yazmak olurdu.
  it("alıntısı bulunmayan bulguyu sayıya katmaz, ayrı sayar", () => {
    const { findings, unverified } = applyFindings([
      { sinif: "yanlis", kanitli: false, alinti: "raporda olmayan bir cümle burada" },
    ], report);
    expect(findings).toHaveLength(0);
    expect(unverified).toBe(1);
  });

  it("tanınmayan sınıfı belirsiz sayar", () => {
    const { findings } = applyFindings([
      { sinif: "kritik", kanitli: false, alinti: "ayrıca değişken adı kısa" },
    ], report);
    expect(findings[0]?.sinif).toBe("belirsiz");
  });
});

describe("countFindings", () => {
  const f = (sinif: Finding["sinif"], proven = false): Finding => ({ sinif, proven, quote: "q" });

  // Kanıtlanmış kusura ait bulgular 1. katmanda sayıldı; burada da
  // sayılsalardı aynı bulgu iki katmanda birden puan üretir ve "iki katman
  // harmanlanmaz" kuralı sayıların içinden delinirdi.
  it("kanıtlı bulguları oranların dışında tutar", () => {
    const c = countFindings([f("gercek", true), f("nit"), f("gercek")]);
    expect(c.proven).toBe(1);
    expect(c.findings).toBe(2);
    expect(c.real).toBe(1);
    expect(c.nit).toBe(1);
  });
});

describe("classifyReport — uçtan uca", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "skein-sinif-"));
    await mkdir(join(root, "artifact/src"), { recursive: true });
    await mkdir(join(root, "is"), { recursive: true });
    await writeFile(join(root, "spec.md"), "# Görev\n");
    await writeFile(join(root, "prompt.md"), "SINIFLA");
    await writeFile(join(root, "artifact/src/x.ts"),
      "// claude tarafından yazıldı\nexport const f = (): number => 1;\n");
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const run = async (findings: unknown, report: string) => {
    const bin = await makeFakeCli(root, {
      stdout: JSON.stringify({ is_error: false, result: JSON.stringify(findings), total_cost_usd: 0.02 }),
      argvTo: join(root, "argv.json"),
      stdinTo: join(root, "stdin.txt"),
    });
    return classifyReport({
      judge: adapterFor("claude:hakem", { bin }),
      workdir: join(root, "is"),
      layers: [{ name: "siniflandir", path: join(root, "prompt.md") }],
      timeoutMs: 10_000,
      specPath: join(root, "spec.md"),
      artifactDir: join(root, "artifact"),
      reportText: report,
      redHooks: ["limit sıfırsa senkron fırlatır"],
    });
  };

  it("bulguları sınıflar, sayar ve dosyaya yazar", async () => {
    const r = await run([
      { sinif: "nit", kanitli: false, alinti: "değişken adı kısa seçilmiş" },
      { sinif: "yanlis", kanitli: false, alinti: "sonuç hiçbir zaman döndürülmüyor" },
    ], "GPT-5.5 raporu: değişken adı kısa seçilmiş. Ayrıca sonuç hiçbir zaman döndürülmüyor.");

    expect(r.counts).toMatchObject({ findings: 2, nit: 1, wrong: 1, real: 0, proven: 0 });
    const written: unknown = JSON.parse(await readFile(join(root, "is/siniflama.json"), "utf8"));
    expect(Array.isArray(written)).toBe(true);
    expect((written as Finding[])[0]?.sinif).toBe("nit");
  });

  // Hakem, raporu kimin yazdığını görmemeli; kimlik rapordan da koddan da
  // sızabilir ve ikisi de körlüğü aynı şekilde bozar.
  it("hem raporu hem kodu kimliksizleştirir", async () => {
    const r = await run([], "GPT-5.5 ile incelendi; bir sorun görülmedi.");
    expect(r.scrubbed).toBeGreaterThan(0);
    const blinded = await readFile(join(root, "is/korlenmis-rapor.txt"), "utf8");
    expect(blinded).not.toMatch(/gpt/i);

    // Kod da hakeme gidiyor ve üretim ajanı yorum satırına imza atmış
    // olabilir: artefaktın ilk satırı "// claude tarafından yazıldı".
    // Rapor körlenip kod körlenmeseydi, hakem kimliği koddan okurdu.
    const argv: string[] = JSON.parse(await readFile(join(root, "argv.json"), "utf8"));
    const stdin = await readFile(join(root, "stdin.txt"), "utf8");
    const sent = argv.join("\n") + stdin;
    expect(sent).toMatch(/tarafından yazıldı/); // kod gerçekten gönderildi
    expect(sent).not.toMatch(/\bclaude\b/i);
    expect(sent).not.toMatch(/gpt/i);
  });

  it("bulgusuz raporu boş sınıflama olarak kabul eder", async () => {
    const r = await run([], "Kodda düzeltilecek bir şey görmedim.");
    expect(r.findings).toEqual([]);
    expect(r.counts.findings).toBe(0);
  });
});
