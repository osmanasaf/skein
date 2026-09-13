import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capture } from "../proc/process.js";
import { addWorktree, currentBranch, dirtyPaths, head, mergeForward, ORCHESTRATOR_PATHS } from "./git.js";

let root: string;
let main: string;
let review: string;

const git = (dir: string, ...args: string[]) => capture("git", args, { cwd: dir, timeoutMs: 30_000 });

/** `main` ana checkout, `review` ayrı dalda bir worktree. */
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-git-"));
  main = join(root, "repo");
  review = join(root, "repo", ".worktrees", "reviewer");

  await git(root, "init", "-q", "-b", "ana", "repo");
  await git(main, "config", "user.email", "skein@local");
  await git(main, "config", "user.name", "skein");
  await writeFile(join(main, "README.md"), "# iskelet\n");
  await git(main, "add", "-A");
  await git(main, "commit", "-qm", "iskelet");
  await git(main, "worktree", "add", "-q", ".worktrees/reviewer", "-b", "rev");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function commit(dir: string, file: string, body: string, message: string): Promise<void> {
  await writeFile(join(dir, file), body);
  await git(dir, "add", "-A");
  await git(dir, "commit", "-qm", message);
}

describe("head / currentBranch", () => {
  it("commit hash'ini ve dalı okur", async () => {
    expect(await head(main)).toMatch(/^[0-9a-f]{7,}$/);
    expect(await currentBranch(main)).toBe("ana");
    expect(await currentBranch(review)).toBe("rev");
  });

  it("depo olmayan dizinde undefined döner", async () => {
    expect(await head(root)).toBeUndefined();
  });
});

describe("dirtyPaths", () => {
  it("temiz ağaçta boş", async () => {
    expect(await dirtyPaths(main, ORCHESTRATOR_PATHS)).toEqual([]);
  });

  it("izlenmeyen ve değiştirilmiş dosyaları sayar", async () => {
    await writeFile(join(main, "yeni.ts"), "export const a = 1;\n");
    await writeFile(join(main, "README.md"), "# değişti\n");
    expect((await dirtyPaths(main, ORCHESTRATOR_PATHS)).sort()).toEqual(["README.md", "yeni.ts"]);
  });

  it("yok sayılan dosyalar kirlilik saymaz", async () => {
    await writeFile(join(main, ".skein-verdict.json"), "{}");
    expect(await dirtyPaths(main, ORCHESTRATOR_PATHS)).toEqual([]);
  });

  // Orkestratörün kendi kurduğu worktree dizini, `main`'de çalışan her rolü
  // sonsuza kadar "kirli" gösteriyordu.
  it("worktree dizini kirlilik saymaz — kullanıcının .gitignore'una güvenilmez", async () => {
    expect(await dirtyPaths(main)).toContain(".worktrees");
    expect(await dirtyPaths(main, ORCHESTRATOR_PATHS)).toEqual([]);
  });

  it("yok sayılan dizinin altındaki dosyalar da sayılmaz", async () => {
    await writeFile(join(main, ".skein-verdict.json"), "{}");
    expect(await dirtyPaths(main, [".skein", ".worktrees"])).toEqual([".skein-verdict.json"]);
  });
});

describe("mergeForward", () => {
  it("kaynak daldaki commit'i hedef ağaca taşır", async () => {
    await commit(main, "retry.ts", "export const retry = 1;\n", "retry eklendi");

    const result = await mergeForward({ fromDir: main, toDir: review, message: "skein: coder → reviewer" });

    expect(result.kind).toBe("merged");
    // Devir teslimin asıl sınavı: denetçi artık kodu GÖRÜYOR.
    expect(await dirtyPaths(review)).toEqual([]);
    const ls = await git(review, "ls-files");
    expect(ls.stdout).toContain("retry.ts");
  });

  it("yeni bir şey yoksa `already` döner", async () => {
    const result = await mergeForward({ fromDir: main, toDir: review, message: "boş" });
    expect(result.kind).toBe("already");
  });

  it("hedef ağaç kirliyse birleştirmez", async () => {
    await commit(main, "retry.ts", "a\n", "retry");
    await writeFile(join(review, "README.md"), "elle değişti\n");

    const result = await mergeForward({
      fromDir: main, toDir: review, message: "x", ignoreDirty: ORCHESTRATOR_PATHS,
    });

    expect(result.kind).toBe("blocked");
    expect(result.kind === "blocked" && result.reason).toContain("README.md");
  });

  it("çakışmayı çözmez — geri alır ve dosyaları söyler", async () => {
    await commit(main, "retry.ts", "üretici sürümü\n", "üretici");
    await commit(review, "retry.ts", "denetçi sürümü\n", "denetçi");

    const result = await mergeForward({ fromDir: main, toDir: review, message: "x" });

    expect(result.kind).toBe("conflict");
    expect(result.kind === "conflict" && result.paths).toEqual(["retry.ts"]);
    // `merge --abort` çalıştı: ağaç çakışma artığıyla kalmadı.
    expect(await dirtyPaths(review)).toEqual([]);
    expect(await readFileText(join(review, "retry.ts"))).toBe("denetçi sürümü\n");
  });

  it("orkestratörün verdikt dosyası birleştirmeyi engellemez", async () => {
    await commit(main, "retry.ts", "a\n", "retry");
    await writeFile(join(review, ".skein-verdict.json"), '{"decision":"accept"}');

    const result = await mergeForward({
      fromDir: main,
      toDir: review,
      message: "x",
      ignoreDirty: ORCHESTRATOR_PATHS,
    });

    expect(result.kind).toBe("merged");
  });
});

async function readFileText(path: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(path, "utf8");
}

describe("addWorktree", () => {
  it("yeni worktree'yi skein/ ad alanında bir dalla oluşturur", async () => {
    const result = await addWorktree(main, join(".worktrees", "guard"), "guard");

    expect(result).toEqual({ kind: "created", branch: "skein/guard" });
    expect(await currentBranch(join(main, ".worktrees", "guard"))).toBe("skein/guard");
  });

  it("dal önceki koşudan kalmışsa ona bağlanır — iş çöpe atılmaz", async () => {
    const rel = join(".worktrees", "guard");
    await addWorktree(main, rel, "guard");
    await commit(join(main, rel), "not.txt", "önceki koşunun işi\n", "önceki iş");
    await git(main, "worktree", "remove", "--force", rel);

    const again = await addWorktree(main, rel, "guard");

    expect(again.kind).toBe("created");
    expect(await readFileText(join(main, rel, "not.txt"))).toBe("önceki koşunun işi\n");
  });

  it("başarısızlığı sessizce yutmaz", async () => {
    const result = await addWorktree(root, join("yok", "olan"), "guard");
    expect(result.kind).toBe("failed");
  });
});
