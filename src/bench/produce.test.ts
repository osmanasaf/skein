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
