import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { review } from "./review.js";
import { loadTask, type Task } from "./task.js";
import type { Adapter, InvokeRequest } from "../adapters/contract.js";

let root: string, artifactDir: string, workdir: string, task: Task, seen: InvokeRequest | undefined;

const reviewer = (id: string, model: string): Adapter => ({
  id, model,
  async invoke(req) {
    seen = req;
    return { exitCode: 0, stdout: "BULGU: x", stderr: "", durationMs: 1 };
  },
});

const run = (r: Adapter = reviewer("claude", "m")) =>
  review({
    task, artifactDir, reviewer: r, workdir,
    layers: [{ name: "review", path: join(root, "review.md") }],
    timeoutMs: 1000,
  });

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-review-"));
  const t = join(root, "gorev");
  await mkdir(join(t, "hidden"), { recursive: true });
  await writeFile(join(t, "task.yaml"),
    `id: gorev\ntitle: T\nlanguage: ts\nspec: spec.md\nentry: src/x.ts\nhidden:\n  command: ["echo"]\n`);
  await writeFile(join(t, "spec.md"), "SPEC GOVDESI");
  await writeFile(join(t, "hidden", "a.test.ts"), "// GIZLI TEST GOVDESI");
  await writeFile(join(root, "review.md"), "DENETIM PROMPTU");
  task = await loadTask(t);
  artifactDir = join(root, "artifact");
  await mkdir(join(artifactDir, "src"), { recursive: true });
  await writeFile(join(artifactDir, "src/x.ts"), "KOD GOVDESI");
  workdir = join(root, "denetim");
  await mkdir(workdir, { recursive: true });
});
afterEach(async () => { seen = undefined; await rm(root, { recursive: true, force: true }); });

describe("review", () => {
  it("spec'i ve kodu denetçiye verir", async () => {
    await run();
    expect(seen?.taskText).toContain("SPEC GOVDESI");
    expect(seen?.taskText).toContain("KOD GOVDESI");
    expect(seen?.taskText).toContain("src/x.ts");
  });

  // Yazarlık sızarsa AA ile AB farkını kör nokta değil çerçeveleme yaratır.
  it("kodu kimin yazdığını SÖYLEMEZ", async () => {
    await run(reviewer("claude", "claude-opus-5"));
    const all = `${seen?.taskText}`;
    for (const leak of ["kendi", "üretici", "claude", "opus", "sonnet", "yazdığın"]) {
      expect(all.toLowerCase()).not.toContain(leak);
    }
  });

  it("gizli testleri denetçiye vermez", async () => {
    await run();
    expect(seen?.taskText).not.toContain("GIZLI TEST GOVDESI");
  });

  // Denetçi artefaktın içinde çalışmamalı: rapor etmeli, düzeltmemeli.
  it("denetçiyi artefakt dizininin DIŞINDA çalıştırır", async () => {
    await run();
    expect(seen?.workdir).toBe(workdir);
    expect(seen?.workdir).not.toBe(artifactDir);
  });

  // Dört hücrede prompt aynı olmalı; hash bunun kanıtı.
  it("denetçi değişse de prompt hash'i aynı kalır", async () => {
    const a = await run(reviewer("claude", "claude-opus-5"));
    const b = await run(reviewer("claude", "claude-sonnet-5"));
    expect(a.promptHash).toBe(b.promptHash);
    expect(a.model).not.toBe(b.model);
  });

  it("denetçi kimliğini ve raporu döndürür", async () => {
    const r = await run(reviewer("claude", "claude-sonnet-5"));
    expect(r).toMatchObject({ reviewer: "claude", model: "claude-sonnet-5", text: "BULGU: x" });
  });
});
