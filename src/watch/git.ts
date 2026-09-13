import { capture } from "../proc/process.js";
import { VERDICT_FILE } from "./verdict.js";
import { WORKTREE_DIR } from "./workspace.js";

const GIT_TIMEOUT_MS = 60_000;

/**
 * Orkestratörün deponun içine bıraktığı izler.
 *
 * Üçü de ajanın işi DEĞİL, bu yüzden kirlilik sayılmazlar. Özellikle
 * `.worktrees/`: rollerin ağaçları deponun içinde duruyor ve `main`'de
 * çalışan her rol, kendi kurduğumuz dizin yüzünden sonsuza kadar "kirli"
 * görünürdü. Kullanıcının bunları `.gitignore`'a yazmış olmasına güvenmek,
 * unutulduğunda akışı sessizce durdurmak demekti.
 */
export const ORCHESTRATOR_PATHS = [VERDICT_FILE, ".skein", WORKTREE_DIR];

async function git(dir: string, args: string[]): Promise<{ ok: boolean; out: string; err: string }> {
  const result = await capture("git", args, { cwd: dir, timeoutMs: GIT_TIMEOUT_MS });
  // Yalnızca SONDAN kırpılır. `status --porcelain` durum kodunu iki sütuna
  // yazar ve değiştirilmiş bir dosyanın satırı boşlukla başlar (" M yol");
  // baştan kırpmak ilk satırın ilk harfini yiyordu.
  return { ok: result.exitCode === 0, out: result.stdout.trimEnd(), err: result.stderr.trim() };
}

/** Kısa commit hash'i. Depo değilse ya da commit yoksa undefined. */
export async function head(dir: string): Promise<string | undefined> {
  const { ok, out } = await git(dir, ["rev-parse", "--short", "HEAD"]);
  return ok && out !== "" ? out : undefined;
}

/** Üzerinde çalışılan dal. Ayrık HEAD'de null. */
export async function currentBranch(dir: string): Promise<string | null> {
  const { ok, out } = await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return ok && out !== "" && out !== "HEAD" ? out : null;
}

/**
 * İşlenmemiş değişikliklerin yol listesi.
 *
 * `ignore` ile dışarıda bırakılanlar: verdikt dosyası çalışma ağacının
 * köküne yazılıyor ve her turda kirlilik gibi görünürdü. Kullanıcının
 * `.gitignore`'una güvenmek yerine adıyla eleniyor — orkestratörün kendi
 * bıraktığı iz, ajanın yarım bıraktığı iş sanılmamalı.
 */
export async function dirtyPaths(dir: string, ignore: string[] = []): Promise<string[]> {
  const { ok, out } = await git(dir, ["status", "--porcelain"]);
  if (!ok || out === "") return [];
  const ignored = ignore.map((path) => path.replace(/\/+$/, ""));
  return out
    .split("\n")
    .map((line) => line.slice(3).trim().replace(/\/+$/, ""))
    // Dizin olarak da eşleşmeli: porcelain izlenmeyen bir dizini tek satırda
    // ".worktrees/" diye bildiriyor, altındaki dosyaları tek tek değil.
    .filter((path) => path !== "" && !ignored.some((i) => path === i || path.startsWith(`${i}/`)));
}

export type MergeResult =
  | { kind: "merged"; commit?: string }
  | { kind: "already" }
  | { kind: "conflict"; paths: string[] }
  | { kind: "blocked"; reason: string };

/**
 * Bir rolün dalını diğerinin çalışma ağacına birleştirir.
 *
 * Devir teslimin eksik yarısı buydu: `next` kartı taşıyordu ama kodu
 * bıraktığı yerde bırakıyordu. Her rol kendi worktree'sinde, kendi dalında
 * çalıştığı için, ana dal ilerlediğinde denetçinin ağacı kendiliğinden
 * ilerlemiyor — denetçi boş bir depoda "denetle" talimatı alıyordu.
 *
 * Çakışma kendiliğinden çözülmez: `merge --abort` ile geri alınır ve kart
 * insana çıkar. İki ajanın aynı satırda ayrıştığı yer, bir üçüncü ajanın
 * tahmin edeceği yer değil.
 */
export async function mergeForward(opts: {
  fromDir: string;
  toDir: string;
  message: string;
  ignoreDirty?: string[];
}): Promise<MergeResult> {
  const branch = await currentBranch(opts.fromDir);
  if (branch === null) {
    return { kind: "blocked", reason: `kaynak ağaç ayrık HEAD'de: ${opts.fromDir}` };
  }

  const dirty = await dirtyPaths(opts.toDir, opts.ignoreDirty ?? []);
  if (dirty.length > 0) {
    return {
      kind: "blocked",
      reason: `hedef ağaçta işlenmemiş değişiklik var, birleştirme yapılamaz: ${dirty.join(", ")}`,
    };
  }

  const merge = await git(opts.toDir, ["merge", "--no-edit", "-m", opts.message, branch]);
  if (merge.ok) {
    if (/up to date/i.test(merge.out)) return { kind: "already" };
    const commit = await head(opts.toDir);
    return commit === undefined ? { kind: "merged" } : { kind: "merged", commit };
  }

  const conflicted = await git(opts.toDir, ["diff", "--name-only", "--diff-filter=U"]);
  await git(opts.toDir, ["merge", "--abort"]);
  const paths = conflicted.out === "" ? [] : conflicted.out.split("\n");
  return paths.length > 0
    ? { kind: "conflict", paths }
    : { kind: "blocked", reason: merge.err || merge.out || "birleştirme başarısız" };
}

export type WorktreeResult =
  | { kind: "existed" }
  | { kind: "created"; branch: string }
  | { kind: "failed"; reason: string };

/**
 * Bir rol için git worktree'si oluşturur; varsa dokunmaz.
 *
 * Dal adı `skein/<workspace>`: rollerin dalları, insanın kendi dallarından
 * ad alanıyla ayrılır. Dal zaten varsa (önceki koşudan kalma) ona bağlanır
 * — yeniden oluşturmaya çalışmak, biriken işi çöpe atardı.
 */
export async function addWorktree(
  repoDir: string,
  relPath: string,
  workspace: string,
): Promise<WorktreeResult> {
  const branch = `skein/${workspace}`;

  const fresh = await git(repoDir, ["worktree", "add", relPath, "-b", branch]);
  if (fresh.ok) return { kind: "created", branch };

  // `-b` yalnızca dal yoksa çalışır. Varsa ona bağlan.
  const existing = await git(repoDir, ["worktree", "add", relPath, branch]);
  if (existing.ok) return { kind: "created", branch };

  return { kind: "failed", reason: existing.err || fresh.err || "worktree oluşturulamadı" };
}
