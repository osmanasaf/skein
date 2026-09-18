import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adapterFor } from "../adapters/factory.js";
import { readEvents } from "../events/log.js";
import { makeFakeCli } from "../testing/fake-cli.js";
import { effectReport } from "./effect.js";
import { scoreAll, scoreTargets } from "./score.js";
import type { SkeinEvent } from "../events/log.js";

let root: string;
const LOG = () => join(root, "events.jsonl");

/** Hakemin döndüreceği kararı taşıyan sahte CLI. */
async function fakeJudge(verdicts: unknown): Promise<string> {
  return makeFakeCli(root, {
    stdout: JSON.stringify({
      is_error: false,
      result: JSON.stringify(verdicts),
      total_cost_usd: 0.01,
    }),
  });
}

/** Görev, rapor ve denetim kaydıyla birlikte puanlanmaya hazır bir koşu. */
async function seedRun(report: string): Promise<SkeinEvent[]> {
  await mkdir(join(root, "bench/tasks/ornek/hidden"), { recursive: true });
  await writeFile(join(root, "bench/tasks/ornek/task.yaml"),
    "id: ornek\ntitle: Örnek\nlanguage: ts\nspec: spec.md\nentry: src/x.ts\n" +
    'hidden:\n  command: ["npx", "vitest", "run"]\n');
  await writeFile(join(root, "bench/tasks/ornek/spec.md"), "# Örnek görev\n");
  await writeFile(join(root, "bench/prompts/judge.md"), "PUANLA");

  const cell = "runs/denetim/A-by-B";
  await mkdir(join(root, cell), { recursive: true });
  await writeFile(join(root, cell, "rapor.txt"), report);

  const ev = (e: Partial<SkeinEvent> & { type: string }): SkeinEvent =>
    ({ v: 1, at: "2026-01-01T00:00:00.000Z", runId: "r1", ...e }) as SkeinEvent;
  return [
    ev({ type: "run.started", taskId: "ornek" }),
    ev({ type: "agent.started", cell: "runs/A", role: "uretici", provider: "claude", model: "A", promptHash: "h" }),
    ev({ type: "hooks.measured", cell: "runs/A", ran: true, total: 12, red: ["hata yolunda kuyruk beslenmeye devam eder", "limit sıfırsa senkron fırlatır"] }),
    ev({ type: "review.done", cell, producer: "A", reviewer: "B", crossed: true, promptHash: "h", path: `${cell}/rapor.txt` }),
  ];
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-puan-"));
  await mkdir(join(root, "bench/prompts"), { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("puanlama — uçtan uca", () => {
  const report =
    "1. Hata yolunda kuyruk beslenmeye devam ediyor: bir görev reddedince " +
    "havuz kalan görevleri başlatmayı sürdürüyor.\n" +
    "2. Kod okunaklı, isimlendirme iyi.";

  it("raporu puanlar, kararı günlüğe yazar ve etki raporuna taşır", async () => {
    const events = await seedRun(report);
    const bin = await fakeJudge([
      { no: 1, yakalandi: true, alinti: "havuz kalan görevleri başlatmayı sürdürüyor" },
      { no: 2, yakalandi: false, gerekce: "rapor bu davranışa değinmiyor" },
    ]);

    const { targets } = scoreTargets(events);
    const out = await scoreAll({
      repo: root,
      judge: adapterFor("claude:hakem", { bin }),
      layers: [{ name: "judge", path: join(root, "bench/prompts/judge.md") }],
      timeoutMs: 10_000,
      logPath: LOG(),
      targets,
    });

    expect(out.scored).toBe(1);
    expect(out.failed).toEqual([]);

    const written = await readEvents(LOG());
    const scored = written.events.find((e) => e.type === "judge.scored");
    expect(scored).toMatchObject({
      cell: "runs/denetim/A-by-B",
      hooks: 2,
      caught: ["hata yolunda kuyruk beslenmeye devam eder"],
      missed: ["limit sıfırsa senkron fırlatır"],
    });

    // Puanın runId'si PUANLANAN denetimin koşusu olmalı; olmazsa etki
    // raporu `review.done` ile birleştiremez ve hücre sessizce düşer.
    const e = effectReport([...events, ...written.events]);
    expect(e.crossed?.missed).toBe(1);
    expect(e.crossed?.hooks).toBe(2);
  });

  // Ayrıştırılamayan tek bir karar, zaten parası ödenmiş diğer hücreleri
  // puansız bırakmamalı.
  it("hakem JSON üretmezse hücreyi kaydeder ama koşuyu düşürmez", async () => {
    const events = await seedRun(report);
    const bin = await makeFakeCli(root, {
      stdout: JSON.stringify({ is_error: false, result: "Rapor gayet iyi görünüyor." }),
    });

    const out = await scoreAll({
      repo: root,
      judge: adapterFor("claude:hakem", { bin }),
      layers: [{ name: "judge", path: join(root, "bench/prompts/judge.md") }],
      timeoutMs: 10_000,
      logPath: LOG(),
      targets: scoreTargets(events).targets,
    });

    expect(out.scored).toBe(0);
    expect(out.failed[0]?.error).toMatch(/JSON dizisi yok/);
    // Puanlanamayan hücre kaçırma sayılmaz: günlüğe hiçbir şey yazılmaz.
    expect((await readEvents(LOG())).events).toHaveLength(0);
  });

  it("uydurulmuş alıntı yakalama sayılmaz ve günlükte işaretlenir", async () => {
    const events = await seedRun(report);
    const bin = await fakeJudge([
      { no: 1, yakalandi: true, alinti: "raporda hiç geçmeyen bir cümle uyduruyorum" },
      { no: 2, yakalandi: true, alinti: "bu da raporda yok ama iddia ediyorum" },
    ]);

    await scoreAll({
      repo: root,
      judge: adapterFor("claude:hakem", { bin }),
      layers: [{ name: "judge", path: join(root, "bench/prompts/judge.md") }],
      timeoutMs: 10_000,
      logPath: LOG(),
      targets: scoreTargets(events).targets,
    });

    const scored = (await readEvents(LOG())).events.find((e) => e.type === "judge.scored");
    expect(scored).toMatchObject({ caught: [], unverified: expect.any(Array) });
    expect((scored as { unverified: string[] }).unverified).toHaveLength(2);
  });
});
