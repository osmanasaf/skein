import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { listFilesRelative } from "../proc/files.js";
import { fingerprintDir } from "../audit/fingerprint.js";

export interface FileStamp {
  path: string;
  sha: string;
  lines: number;
  bytes: number;
}

export interface Snapshot {
  /** Sıfırdan başlayan tur numarası; 0 = ajan koşmadan önceki hâl. */
  turn: number;
  /** Turun adı: "tohum", "uretim", "denetim-1"… */
  label: string;
  /** Anlık görüntünün dizini (kopyanın kendisi). */
  dir: string;
  files: FileStamp[];
  fingerprint: string;
}

export type ChangeKind = "eklendi" | "silindi" | "degisti";

export interface FileChange {
  path: string;
  kind: ChangeKind;
  addedLines: number;
  removedLines: number;
}

export interface SnapshotDiff {
  changes: FileChange[];
  /** Dokunulmamış dosya sayısı. */
  unchanged: number;
  addedLines: number;
  removedLines: number;
}

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

/** Boş dosya sıfır satırdır; sondaki tek satır sonu satır saydırmaz. */
export function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Satır satır fark — eklenen ve silinen satırlar.
 *
 * En uzun ortak altdizi (LCS) ile: "kaç satır arttı" gibi kaba bir ölçü,
 * aynı uzunlukta yeniden yazılmış bir dosyayı "değişmemiş" gösterirdi.
 * Artefaktlar birkaç yüz satır olduğu için kareli maliyet sorun değil; yine
 * de bir üst sınır var, çünkü ölçüm aracının kendisi koşuyu kilitlememeli.
 */
export function diffLines(before: string, after: string): { added: string[]; removed: string[] } {
  const a = splitLines(before);
  const b = splitLines(after);
  const LIMIT = 4000;
  if (a.length > LIMIT || b.length > LIMIT) {
    // Sınırın üstünde LCS'yi bırakıyoruz; "hepsi değişti" abartır ama
    // sessizce yanlış olmaktan iyidir ve sınır kayda geçer.
    return { added: b, removed: a };
  }

  // lcs[i][j] = a[i..] ile b[j..] arasındaki en uzun ortak altdizi uzunluğu.
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      const row = lcs[i] as number[];
      const next = lcs[i + 1] as number[];
      row[j] = a[i] === b[j]
        ? (next[j + 1] as number) + 1
        : Math.max(next[j] as number, row[j + 1] as number);
    }
  }

  const added: string[] = [];
  const removed: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    const down = (lcs[i + 1] as number[])[j] as number;
    const right = (lcs[i] as number[])[j + 1] as number;
    if (down >= right) {
      removed.push(a[i] as string);
      i += 1;
    } else {
      added.push(b[j] as string);
      j += 1;
    }
  }
  while (i < a.length) {
    removed.push(a[i] as string);
    i += 1;
  }
  while (j < b.length) {
    added.push(b[j] as string);
    j += 1;
  }
  return { added, removed };
}

/** Bir dizinin dosya damgalarını çıkarır. */
export async function stampDir(dir: string): Promise<FileStamp[]> {
  const files = await listFilesRelative(dir);
  const out: FileStamp[] = [];
  for (const path of files) {
    const text = await readFile(join(dir, path), "utf8");
    out.push({ path, sha: sha(text), lines: splitLines(text).length, bytes: Buffer.byteLength(text) });
  }
  return out;
}

/**
 * Artefaktın o andaki hâlini kopyalayarak saklar.
 *
 * Kopya, damganın yerine geçmez — damga "değişti mi" sorusunu ucuza
 * cevaplar, kopya ise "tam olarak neye dönüştü" sorusunu sonradan
 * cevaplanabilir kılar. Yalnızca damga saklansaydı, bir turda ne olduğu
 * ancak o tur koşarken bakılırsa bilinebilirdi; koşu bittikten sonra elde
 * yalnızca son hâl kalırdı — kaldırmak istediğimiz sınır tam olarak buydu.
 */
export async function takeSnapshot(
  artifactDir: string,
  turnsDir: string,
  turn: number,
  label: string,
): Promise<Snapshot> {
  const dir = join(turnsDir, `${String(turn).padStart(2, "0")}-${label}`);
  await mkdir(dir, { recursive: true });
  await cp(artifactDir, dir, { recursive: true });
  const snapshot: Snapshot = {
    turn, label, dir,
    files: await stampDir(dir),
    fingerprint: await fingerprintDir(artifactDir),
  };
  await writeFile(join(turnsDir, `${String(turn).padStart(2, "0")}-${label}.json`),
    JSON.stringify(snapshot, null, 2));
  return snapshot;
}

/**
 * Diskteki bir tur dizinini anlık görüntü olarak okur.
 *
 * Günlükteki özet (kaç dosya, kaç satır) yerine kopyanın kendisi
 * damgalanıyor: özet yanlış yazılmış olsa bile fark doğru kalsın.
 */
export async function loadSnapshot(dir: string, turn: number, label: string): Promise<Snapshot> {
  return { turn, label, dir, files: await stampDir(dir), fingerprint: await fingerprintDir(dir) };
}

/** İki anlık görüntü arasındaki fark; içerik kopyalardan okunur. */
export async function diffSnapshots(before: Snapshot, after: Snapshot): Promise<SnapshotDiff> {
  const beforeBy = new Map(before.files.map((f) => [f.path, f]));
  const afterBy = new Map(after.files.map((f) => [f.path, f]));
  const changes: FileChange[] = [];
  let unchanged = 0;

  for (const f of after.files) {
    const old = beforeBy.get(f.path);
    if (old === undefined) {
      changes.push({ path: f.path, kind: "eklendi", addedLines: f.lines, removedLines: 0 });
      continue;
    }
    if (old.sha === f.sha) {
      unchanged += 1;
      continue;
    }
    const d = diffLines(
      await readFile(join(before.dir, f.path), "utf8"),
      await readFile(join(after.dir, f.path), "utf8"),
    );
    changes.push({ path: f.path, kind: "degisti", addedLines: d.added.length, removedLines: d.removed.length });
  }
  for (const f of before.files) {
    if (!afterBy.has(f.path)) {
      changes.push({ path: f.path, kind: "silindi", addedLines: 0, removedLines: f.lines });
    }
  }

  changes.sort((x, y) => x.path.localeCompare(y.path));
  return {
    changes,
    unchanged,
    addedLines: changes.reduce((s, c) => s + c.addedLines, 0),
    removedLines: changes.reduce((s, c) => s + c.removedLines, 0),
  };
}

export type TurnListener = (snapshot: Snapshot, diff: SnapshotDiff | null) => Promise<void>;

/**
 * Tur tur anlık görüntü alan sayaç.
 *
 * Numaralandırmayı tek yerde tutuyor: üretim ve denetim döngüsü ayrı
 * dosyalarda yaşıyor ve her biri kendi sayacını tutsaydı, denetim turları
 * üretimin üstüne yazardı.
 */
export class TurnRecorder {
  readonly #dir: string;
  readonly #onTurn: TurnListener | undefined;
  #next = 0;
  #last: Snapshot | undefined;

  constructor(turnsDir: string, onTurn?: TurnListener) {
    this.#dir = turnsDir;
    this.#onTurn = onTurn;
  }

  get turns(): number {
    return this.#next;
  }

  async record(artifactDir: string, label: string): Promise<{ snapshot: Snapshot; diff: SnapshotDiff | null }> {
    const snapshot = await takeSnapshot(artifactDir, this.#dir, this.#next, label);
    this.#next += 1;
    const diff = this.#last === undefined ? null : await diffSnapshots(this.#last, snapshot);
    this.#last = snapshot;
    await this.#onTurn?.(snapshot, diff);
    return { snapshot, diff };
  }
}
