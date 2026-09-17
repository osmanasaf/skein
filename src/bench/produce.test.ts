import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { produce } from "./produce.js";
import { loadTask } from "./task.js";
import type { Adapter, InvokeRequest } from "../adapters/contract.js";

let root: string;
let seen: InvokeRequest | undefined;
/** Çağrıldığı anda gizli testlerin diskte olup olmadığını kaydeden sahte ajan. */
let hiddenVisibleAtInvoke: boolean | undefined;

const spy = (cellDir: string): Adapter => ({
  id: "sahte",
  model: "m",
  async invoke(req) {
    seen = req;
    hiddenVisibleAtInvoke = await readdir(cellDir).then((e) => e.includes("hidden"));
    return { exitCode: 0, stdout: "", stderr: "", durationMs: 1 };
  },
});

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-produce-"));
  const t = join(root, "gorev");
  await mkdir(join(t, "hidden"), { recursive: true });
  await writeFile(join(t, "task.yaml"),
    `id: gorev\ntitle: T\nlanguage: ts\nspec: spec.md\nentry: src/x.ts\nhidden:\n  command: ["echo"]\n`);
  await writeFile(join(t, "spec.md"), "SPEC GOVDESI");
  await writeFile(join(t, "hidden", "a.test.ts"), "// gizli");
  await writeFile(join(root, "produce.md"), "URETIM PROMPTU");
});
afterEach(async () => {
  seen = undefined; hiddenVisibleAtInvoke = undefined;
  await rm(root, { recursive: true, force: true });
});

const run = async (cell = join(root, "hucre")) =>
  produce({
    task: await loadTask(join(root, "gorev")),
    adapter: spy(cell),
    cellDir: cell,
    layers: [{ name: "produce", path: join(root, "produce.md") }],
    timeoutMs: 1000,
  });

describe("produce", () => {
  // Deneyin bütünlüğünün taşıyıcısı: garanti talimat değil, fiziksel.
  it("üretim sırasında gizli testler diskte YOKTUR", async () => {
    await run();
    expect(hiddenVisibleAtInvoke).toBe(false);
  });

  it("üretimden sonra gizli testleri kopyalar", async () => {
    const r = await run();
    expect(await readdir(join(r.cellDir, "hidden"))).toContain("a.test.ts");
  });

  it("ajanı artifact/ içinde çalıştırır", async () => {
    const r = await run();
    expect(seen?.workdir).toBe(r.artifactDir);
  });

  it("spec'i taskText olarak geçirir, prompta gömmez", async () => {
    const r = await run();
    expect(seen?.taskText).toContain("SPEC GOVDESI");
    expect(seen?.taskText).toContain("src/x.ts");
    const promptText = await readFile(join(r.cellDir, "prompt.txt"), "utf8");
    expect(promptText).toContain("URETIM PROMPTU");
    expect(promptText).not.toContain("SPEC GOVDESI");
  });

  // Prompt hash'i görevden bağımsız olmalı ki "hücrelerde prompt aynıydı"
  // iddiası kanıtlanabilsin.
  // "Süit koşmadı" belirsiz bir teşhis; ajanın ne yazdığını ayırt edebilmeli.
  it("istenen dosya yazılmadıysa bunu bildirir", async () => {
    const r = await run();
    expect(r.entryWritten).toBe(false);
    expect(r.filesWritten).toEqual([]);
  });

  it("yazılan dosyaları POSIX ayracıyla listeler", async () => {
    const cell = join(root, "yazan");
    const writer: Adapter = {
      id: "y", model: "m",
      async invoke(req) {
        await mkdir(join(req.workdir, "src"), { recursive: true });
        await writeFile(join(req.workdir, "src", "x.ts"), "kod");
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 1 };
      },
    };
    const r = await produce({
      task: await loadTask(join(root, "gorev")), adapter: writer, cellDir: cell,
      layers: [{ name: "produce", path: join(root, "produce.md") }], timeoutMs: 1000,
    });
    expect(r.filesWritten).toEqual(["src/x.ts"]);
    expect(r.entryWritten).toBe(true);
  });

  it("prompt hash'i döndürür ve görevden bağımsızdır", async () => {
    const a = await run(join(root, "h1"));
    const b = await run(join(root, "h2"));
    expect(a.promptHash).toBe(b.promptHash);
    expect(a.promptHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("produce — seed/", () => {
  /** Görev dizinine mevcut kod koyar. */
  async function seed(files: Record<string, string>): Promise<void> {
    for (const [rel, body] of Object.entries(files)) {
      const abs = join(root, "gorev", "seed", rel);
      await mkdir(join(abs, ".."), { recursive: true });
      await writeFile(abs, body);
    }
  }

  it("mevcut kodu üretimden ÖNCE artefakt dizinine koyar", async () => {
    await seed({ "src/store.ts": "export const VERSION = 1;\n" });
    const cell = join(root, "hucre");
    const r = await produce({
      task: await loadTask(join(root, "gorev")),
      adapter: {
        id: "sahte", model: "m",
        async invoke(req) {
          // Ajan çağrıldığı anda dosya orada olmalı; yoksa "mevcut koda
          // dokunmak" görev sınıfı boş bir dizine yazmaya dönüşür.
          seen = req;
          const body = await readFile(join(req.workdir, "src/store.ts"), "utf8");
          expect(body).toContain("VERSION = 1");
          return { exitCode: 0, stdout: "", stderr: "", durationMs: 1 };
        },
      },
      cellDir: cell,
      layers: [{ name: "produce", path: join(root, "produce.md") }],
      timeoutMs: 1000,
    });
    expect(r.seeded).toEqual(["src/store.ts"]);
  });

  it("görev metni ajana hangi dosyaları bulacağını söyler", async () => {
    await seed({ "src/store.ts": "x", "src/apply.ts": "y" });
    await run();
    expect(seen?.taskText).toContain("src/store.ts");
    expect(seen?.taskText).toContain("src/apply.ts");
  });

  it("seed yokken görev metnine hiçbir şey eklemez", async () => {
    await run();
    expect(seen?.taskText).toBe("SPEC GOVDESI\n\nÇözümü şu dosyaya yaz: src/x.ts\n");
  });

  it("seed varken de gizli testler üretim sırasında diskte YOKTUR", async () => {
    await seed({ "src/store.ts": "x" });
    await run();
    expect(hiddenVisibleAtInvoke).toBe(false);
  });
});
