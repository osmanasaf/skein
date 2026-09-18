import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Adapter } from "../adapters/contract.js";
import { auditLoop } from "./audit-loop.js";
import { produce } from "./produce.js";
import { loadTask } from "./task.js";
import { TurnRecorder, type Snapshot, type SnapshotDiff } from "./snapshot.js";

let root: string;

/** Her çağrıldığında çözüm dosyasına verilen metni yazan sahte ajan. */
const writer = (texts: string[]): Adapter => {
  let i = 0;
  return {
    id: "sahte",
    model: "m",
    async invoke(req) {
      const text = texts[Math.min(i, texts.length - 1)] as string;
      i += 1;
      await mkdir(join(req.workdir, "src"), { recursive: true });
      await writeFile(join(req.workdir, "src/x.ts"), text);
      return { exitCode: 0, stdout: "", stderr: "", durationMs: 1 };
    },
  };
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-turlar-"));
  const t = join(root, "gorev");
  await mkdir(join(t, "hidden"), { recursive: true });
  await mkdir(join(t, "seed/src"), { recursive: true });
  await writeFile(join(t, "task.yaml"),
    'id: gorev\ntitle: T\nlanguage: ts\nspec: spec.md\nentry: src/x.ts\nseed: seed\nhidden:\n  command: ["echo"]\n');
  await writeFile(join(t, "spec.md"), "SPEC");
  await writeFile(join(t, "seed/src/selector.ts"), "export const sec = () => 1;\n");
  await writeFile(join(t, "hidden/a.test.ts"), "// gizli");
  await writeFile(join(root, "produce.md"), "URETIM");
  await writeFile(join(root, "audit.md"), "DENETIM");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("tur kaydı — üretim", () => {
  const collect = (): { turns: { s: Snapshot; d: SnapshotDiff | null }[]; recorder: TurnRecorder } => {
    const turns: { s: Snapshot; d: SnapshotDiff | null }[] = [];
    const recorder = new TurnRecorder(join(root, "hucre/turlar"), async (s, d) => {
      turns.push({ s, d });
    });
    return { turns, recorder };
  };

  // `seed/` verilen görevlerde ölçmek istediğimiz şey tam olarak bu fark:
  // ajan MEVCUT kodda neyi değiştirdi. Tohum turu olmadan cevabı yok.
  it("tohum ve üretim turlarını ayrı saklar", async () => {
    const { turns, recorder } = collect();
    await produce({
      task: await loadTask(join(root, "gorev")),
      adapter: writer(["export const f = () => 1;\n"]),
      cellDir: join(root, "hucre"),
      layers: [{ name: "produce", path: join(root, "produce.md") }],
      timeoutMs: 1000, recorder,
    });

    expect(turns.map((t) => t.s.label)).toEqual(["tohum", "uretim"]);
    expect(turns[0]?.s.files.map((f) => f.path)).toEqual(["src/selector.ts"]);
    expect(turns[1]?.d?.changes).toEqual([
      { path: "src/x.ts", kind: "eklendi", addedLines: 1, removedLines: 0 },
    ]);
    // Tohum dosyasına dokunulmadığı da okunabilir olmalı.
    expect(turns[1]?.d?.unchanged).toBe(1);
  });

  // Gizli testler üretimden SONRA kopyalanıyor; anlık görüntü ondan sonra
  // alınsaydı her üretim turu, ajanın hiç görmediği dosyaları da değişmiş
  // gösterirdi.
  it("üretim turunda gizli testler görünmez", async () => {
    const { turns, recorder } = collect();
    await produce({
      task: await loadTask(join(root, "gorev")),
      adapter: writer(["export const f = () => 1;\n"]),
      cellDir: join(root, "hucre"),
      layers: [{ name: "produce", path: join(root, "produce.md") }],
      timeoutMs: 1000, recorder,
    });
    const paths = turns[1]?.s.files.map((f) => f.path) ?? [];
    expect(paths).not.toContain("a.test.ts");
    expect(paths).toEqual(["src/selector.ts", "src/x.ts"]);
  });
});

describe("tur kaydı — denetim döngüsü", () => {
  it("her denetim turunun sonucunu ayrı saklar ve numaralar üretimden devam eder", async () => {
    const turns: { s: Snapshot; d: SnapshotDiff | null }[] = [];
    const recorder = new TurnRecorder(join(root, "hucre/turlar"), async (s, d) => {
      turns.push({ s, d });
    });
    const task = await loadTask(join(root, "gorev"));
    const cellDir = join(root, "hucre");

    // Üretim bir şey yazar; denetimde ajan önce düzeltir, sonra dokunmaz.
    const adapter = writer([
      "export const f = () => 1;\n",
      "export const f = (): number => 1;\n",
      "export const f = (): number => 1;\n",
    ]);
    const p = await produce({
      task, adapter, cellDir,
      layers: [{ name: "produce", path: join(root, "produce.md") }],
      timeoutMs: 1000, recorder,
    });

    const outcome = await auditLoop({
      task, adapter, cellDir, artifactDir: p.artifactDir,
      layers: [{ name: "audit", path: join(root, "audit.md") }],
      maxRounds: 4, timeoutMs: 1000, recorder,
    });

    expect(outcome.accepted).toBe(true);
    expect(turns.map((t) => t.s.turn)).toEqual([0, 1, 2, 3]);
    expect(turns.map((t) => t.s.label)).toEqual(["tohum", "uretim", "denetim-1", "denetim-2"]);

    // Asıl kazanım: kapının turunda NE değiştiği artık kayıtlı — imzanın
    // `(): number` olması. Önceden yalnızca "değişti" biliniyordu.
    expect(turns[2]?.d?.changes).toEqual([
      { path: "src/x.ts", kind: "degisti", addedLines: 1, removedLines: 1 },
    ]);
    const after = await readFile(join(turns[2]?.s.dir ?? "", "src/x.ts"), "utf8");
    expect(after).toContain("(): number");

    // Ve dokunulmayan tur da görünür: kabul turu tam olarak burası.
    expect(turns[3]?.d?.changes).toEqual([]);
  });

  it("turlar diskte, hücrenin altında durur", async () => {
    const recorder = new TurnRecorder(join(root, "hucre/turlar"));
    const task = await loadTask(join(root, "gorev"));
    await produce({
      task, adapter: writer(["export const f = () => 1;\n"]),
      cellDir: join(root, "hucre"),
      layers: [{ name: "produce", path: join(root, "produce.md") }],
      timeoutMs: 1000, recorder,
    });
    const entries = await readdir(join(root, "hucre/turlar"));
    expect(entries.sort()).toEqual(["00-tohum", "00-tohum.json", "01-uretim", "01-uretim.json"]);
  });
});
