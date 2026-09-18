import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diffLines, diffSnapshots, splitLines, takeSnapshot, TurnRecorder } from "./snapshot.js";

describe("splitLines", () => {
  it("boş dosyayı sıfır satır sayar", () => {
    expect(splitLines("")).toEqual([]);
  });

  it("sondaki satır sonunu fazladan satır saymaz", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
    expect(splitLines("a\r\nb\r\n")).toEqual(["a", "b"]);
  });
});

describe("diffLines", () => {
  it("eklenen ve silinen satırları ayırır", () => {
    const d = diffLines("a\nb\nc\n", "a\nx\nc\nd\n");
    expect(d.removed).toEqual(["b"]);
    expect(d.added).toEqual(["x", "d"]);
  });

  // "Kaç satır arttı" gibi kaba bir ölçü, aynı uzunlukta yeniden yazılmış
  // bir dosyayı "değişmemiş" gösterirdi — tam olarak gizlemek istemediğimiz
  // durum.
  it("aynı uzunlukta yeniden yazımı fark eder", () => {
    const d = diffLines("bir\niki\nuc\n", "dort\nbes\nalti\n");
    expect(d.added).toHaveLength(3);
    expect(d.removed).toHaveLength(3);
  });

  it("değişiklik yoksa boş döner", () => {
    const d = diffLines("a\nb\n", "a\nb\n");
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });
});

describe("anlık görüntü", () => {
  let root: string;
  const artifact = () => join(root, "artifact");
  const turns = () => join(root, "turlar");

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "skein-tur-"));
    await mkdir(join(artifact(), "src"), { recursive: true });
    await writeFile(join(artifact(), "src/x.ts"), "export const f = () => 1;\n");
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  // Asıl sınır buydu: koşu bittikten sonra elde yalnızca SON hâl kalıyor ve
  // "o turda ne değişti" ancak tahmin ediliyordu. Kopya olmadan damga tek
  // başına bunu cevaplayamaz.
  it("turun içeriğini saklar, sonraki tur onu bozmaz", async () => {
    const first = await takeSnapshot(artifact(), turns(), 0, "uretim");
    await writeFile(join(artifact(), "src/x.ts"), "export const f = () => 2;\n");
    const second = await takeSnapshot(artifact(), turns(), 1, "denetim-1");

    const d = await diffSnapshots(first, second);
    expect(d.changes).toEqual([
      { path: "src/x.ts", kind: "degisti", addedLines: 1, removedLines: 1 },
    ]);
    expect(first.fingerprint).not.toBe(second.fingerprint);
  });

  it("eklenen ve silinen dosyaları ayırır", async () => {
    const first = await takeSnapshot(artifact(), turns(), 0, "uretim");
    await writeFile(join(artifact(), "src/y.ts"), "export const g = () => 0;\n");
    await rm(join(artifact(), "src/x.ts"));
    const second = await takeSnapshot(artifact(), turns(), 1, "denetim-1");

    const d = await diffSnapshots(first, second);
    expect(d.changes.map((c) => [c.path, c.kind])).toEqual([
      ["src/x.ts", "silindi"],
      ["src/y.ts", "eklendi"],
    ]);
  });

  it("dokunulmamış dosyaları sayar", async () => {
    await writeFile(join(artifact(), "src/z.ts"), "export const h = () => 0;\n");
    const first = await takeSnapshot(artifact(), turns(), 0, "uretim");
    await writeFile(join(artifact(), "src/x.ts"), "export const f = () => 3;\n");
    const second = await takeSnapshot(artifact(), turns(), 1, "denetim-1");

    const d = await diffSnapshots(first, second);
    expect(d.unchanged).toBe(1);
    expect(d.changes).toHaveLength(1);
  });
});

describe("TurnRecorder", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "skein-tur-"));
    await mkdir(join(root, "artifact"), { recursive: true });
    await writeFile(join(root, "artifact/x.ts"), "bir\n");
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  // Üretim ve denetim döngüsü ayrı dosyalarda; her biri kendi sayacını
  // tutsaydı denetim turları üretimin üstüne yazardı.
  it("turları sırayla numaralar ve bir öncekiyle karşılaştırır", async () => {
    const seen: (number | null)[] = [];
    const r = new TurnRecorder(join(root, "turlar"), async (s, d) => {
      seen.push(d === null ? null : d.addedLines);
      expect(s.turn).toBe(seen.length - 1);
    });

    await r.record(join(root, "artifact"), "tohum");
    await writeFile(join(root, "artifact/x.ts"), "bir\niki\n");
    await r.record(join(root, "artifact"), "uretim");
    await writeFile(join(root, "artifact/x.ts"), "bir\niki\nuc\n");
    await r.record(join(root, "artifact"), "denetim-1");

    expect(seen).toEqual([null, 1, 1]);
    expect(r.turns).toBe(3);
  });
});
