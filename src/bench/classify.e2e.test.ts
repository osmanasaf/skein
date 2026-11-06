import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adapterFor } from "../adapters/factory.js";
import { readEvents, type SkeinEvent } from "../events/log.js";
import { makeFakeCli } from "../testing/fake-cli.js";
import { classifyAll, classifyTargets } from "./score.js";
import { noiseReport } from "./noise.js";

let root: string;
const LOG = () => join(root, "events.jsonl");

/** Sınıflanmaya hazır bir koşu: görev, artefakt, rapor ve denetim kaydı. */
async function seedRun(report: string): Promise<SkeinEvent[]> {
  await mkdir(join(root, "bench/tasks/ornek/hidden"), { recursive: true });
  await writeFile(join(root, "bench/tasks/ornek/task.yaml"),
    "id: ornek\ntitle: Örnek\nlanguage: ts\nspec: spec.md\nentry: src/x.ts\n" +
    'hidden:\n  command: ["npx", "vitest", "run"]\n');
  await writeFile(join(root, "bench/tasks/ornek/spec.md"), "# Örnek görev\n");
  await writeFile(join(root, "bench/prompts/siniflandir.md"), "SINIFLA");

  await mkdir(join(root, "runs/A/artifact/src"), { recursive: true });
  await writeFile(join(root, "runs/A/artifact/src/x.ts"), "export const f = () => 1;\n");

  const cell = "runs/denetim/A-by-B";
  await mkdir(join(root, cell), { recursive: true });
  await writeFile(join(root, cell, "rapor.txt"), report);

  const ev = (e: Partial<SkeinEvent> & { type: string }): SkeinEvent =>
    ({ v: 1, at: "2026-01-01T00:00:00.000Z", runId: "r1", ...e }) as SkeinEvent;
  return [
    ev({ type: "run.started", taskId: "ornek" }),
    ev({ type: "agent.started", cell: "runs/A", role: "uretici", provider: "claude", model: "A", promptHash: "h" }),
    ev({ type: "hooks.measured", cell: "runs/A", ran: true, total: 12, red: ["limit sıfırsa senkron fırlatır"] }),
    ev({ type: "review.done", cell, producer: "A", reviewer: "B", crossed: true, promptHash: "h", path: `${cell}/rapor.txt` }),
  ];
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-sinif-e2e-"));
  await mkdir(join(root, "bench/prompts"), { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("sınıflama — uçtan uca", () => {
  const report =
    "1. Limit sıfır verildiğinde senkron fırlatıyor, oysa Promise sözü var.\n" +
    "2. Değişken adı olarak x seçilmiş, daha açıklayıcı olabilirdi.\n" +
    "3. Sonuç hiçbir zaman döndürülmüyor.";

  it("sınıflamayı günlüğe yazar ve gürültü raporuna taşır", async () => {
    const events = await seedRun(report);
    const bin = await makeFakeCli(root, {
      stdout: JSON.stringify({
        is_error: false,
        total_cost_usd: 0.03,
        result: JSON.stringify([
          { sinif: "gercek", kanitli: true, alinti: "Limit sıfır verildiğinde senkron fırlatıyor" },
          { sinif: "nit", kanitli: false, alinti: "daha açıklayıcı olabilirdi" },
          { sinif: "yanlis", kanitli: false, alinti: "Sonuç hiçbir zaman döndürülmüyor" },
        ]),
      }),
    });

    const { targets } = classifyTargets(events);
    const out = await classifyAll({
      repo: root,
      judge: adapterFor("claude:hakem", { bin }),
      layers: [{ name: "siniflandir", path: join(root, "bench/prompts/siniflandir.md") }],
      timeoutMs: 10_000,
      logPath: LOG(),
      targets,
    });

    expect(out.classified).toBe(1);
    expect(out.failed).toEqual([]);

    const written = await readEvents(LOG());
    const e = written.events.find((x) => x.type === "judge.classified");
    expect(e).toMatchObject({
      cell: "runs/denetim/A-by-B", findings: 2, nit: 1, wrong: 1, real: 0, proven: 1,
    });

    // Sınıflamanın runId'si SINIFLANAN denetimin koşusu olmalı; olmazsa
    // gürültü raporu `review.done` ile birleştiremez ve hücre sessizce düşer.
    const n = noiseReport([...events, ...written.events]);
    expect(n.groups).toHaveLength(1);
    expect(n.groups[0]?.crossed?.nitRate).toBeCloseTo(0.5);
    expect(n.groups[0]?.crossed?.proven).toBe(1);
  });

  // Ayrıştırılamayan tek bir sınıflama, zaten parası ödenmiş diğer
  // hücreleri sınıfsız bırakmamalı.
  it("hakem JSON üretmezse hücreyi kaydeder ama koşuyu düşürmez", async () => {
    const events = await seedRun(report);
    const bin = await makeFakeCli(root, {
      stdout: JSON.stringify({ is_error: false, result: "Rapor bence gayet iyi." }),
    });

    const out = await classifyAll({
      repo: root,
      judge: adapterFor("claude:hakem", { bin }),
      layers: [{ name: "siniflandir", path: join(root, "bench/prompts/siniflandir.md") }],
      timeoutMs: 10_000,
      logPath: LOG(),
      targets: classifyTargets(events).targets,
    });

    expect(out.classified).toBe(0);
    expect(out.failed[0]?.error).toMatch(/JSON dizisi yok/);
    const written = await readEvents(LOG()).catch(() => ({ events: [] as SkeinEvent[] }));
    expect(written.events.filter((x) => x.type === "judge.classified")).toHaveLength(0);
  });
});
