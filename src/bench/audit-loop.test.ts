import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLoop } from "./audit-loop.js";
import { loadTask, type Task } from "./task.js";
import type { Adapter } from "../adapters/contract.js";

let root: string, cellDir: string, artifactDir: string, task: Task;

/** Belirtilen turlarda dosyayı değiştiren sahte ajan. */
function agent(changeOnRounds: number[] = [], exitCode = 0): Adapter & { calls: number } {
  const a = {
    calls: 0,
    id: "sahte",
    model: "m",
    async invoke() {
      a.calls += 1;
      if (changeOnRounds.includes(a.calls)) {
        await writeFile(join(artifactDir, "src/x.ts"), `sürüm-${a.calls}`);
      }
      return { exitCode, stdout: "", stderr: "", durationMs: 1 };
    },
  };
  return a;
}

const run = (adapter: Adapter, maxRounds = 5) =>
  auditLoop({
    task, adapter, cellDir, artifactDir,
    layers: [{ name: "audit", path: join(root, "audit.md") }],
    maxRounds, timeoutMs: 1000,
  });

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-loop-"));
  const t = join(root, "gorev");
  await mkdir(join(t, "hidden"), { recursive: true });
  await writeFile(join(t, "task.yaml"),
    `id: gorev\ntitle: T\nlanguage: ts\nspec: spec.md\nentry: src/x.ts\nhidden:\n  command: ["echo"]\n`);
  await writeFile(join(t, "spec.md"), "SPEC");
  await writeFile(join(t, "hidden", "a.test.ts"), "//");
  await writeFile(join(root, "audit.md"), "DENETIM PROMPTU");
  task = await loadTask(t);
  cellDir = join(root, "hucre");
  artifactDir = join(cellDir, "artifact");
  await mkdir(join(artifactDir, "src"), { recursive: true });
  await writeFile(join(artifactDir, "src/x.ts"), "ilk");
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("auditLoop", () => {
  // Hiçbir şey değiştirmeyen ajan: ilk deneme reddedilir, ikinci geçer.
  it("değiştirmeyen ajan iki turda kabul edilir", async () => {
    const a = agent();
    const out = await run(a);
    expect(out).toMatchObject({ accepted: true, rounds: 2, changedRounds: 0, exhausted: false });
    expect(a.calls).toBe(1);
  });

  // Düzeltme yeni tur açar: kabul ancak sabit bir turdan sonra.
  it("düzeltme yapan ajanda tur sayısı artar", async () => {
    const out = await run(agent([1]));
    expect(out).toMatchObject({ accepted: true, changedRounds: 1 });
    expect(out.rounds).toBe(3);
  });

  it("her turda düzelten ajan üst sınıra takılır", async () => {
    const out = await run(agent([1, 2, 3, 4, 5]), 4);
    expect(out.exhausted).toBe(true);
    expect(out.accepted).toBe(false);
  });

  // Sürtünme sonsuz döngüye ve sınırsız maliyete dönüşmemeli.
  it("üst sınır ajan çağrısını da sınırlar", async () => {
    const a = agent([1, 2, 3, 4, 5, 6, 7]);
    await run(a, 3);
    expect(a.calls).toBeLessThanOrEqual(3);
  });

  it("ajan hata verirse döngü durur", async () => {
    const out = await run(agent([], 2));
    expect(out.accepted).toBe(false);
    expect(out.exhausted).toBe(false);
    expect(out.invocations[0]?.exitCode).toBe(2);
  });

  it("her tur için geri çağrı tetiklenir", async () => {
    const seen: string[] = [];
    await auditLoop({
      task, adapter: agent([1]), cellDir, artifactDir,
      layers: [{ name: "audit", path: join(root, "audit.md") }],
      maxRounds: 5, timeoutMs: 1000,
      onRound: async (d) => void seen.push(d.reason),
    });
    expect(seen).toEqual(["ilk-deneme", "degisti", "degismedi"]);
  });

  it("spec'i taskText olarak geçirir, denetim promptuna gömmez", async () => {
    let seenTask = "";
    await run({
      id: "s", model: "m",
      async invoke(req) { seenTask = req.taskText; return { exitCode: 0, stdout: "", stderr: "", durationMs: 1 }; },
    });
    expect(seenTask).toContain("SPEC");
  });
});
