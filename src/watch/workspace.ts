import { stat } from "node:fs/promises";
import { join } from "node:path";

/** Ana checkout dışındaki worktree'lerin durduğu dizin. */
export const WORKTREE_DIR = ".worktrees";

export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceError";
  }
}

export function workspacePath(root: string, workspace: string): string {
  return workspace === "main" ? root : join(root, WORKTREE_DIR, workspace);
}

/**
 * Rolün çalışacağı dizini çözer ve var olduğunu doğrular.
 *
 * Worktree'yi BU KOD OLUŞTURMUYOR ve bu şimdilik kasıtlı: `git worktree
 * add` deponun durumuna dokunan bir işlem ve kendi adımını hak ediyor.
 * Eksikse hata, kullanıcının kopyalayıp çalıştırabileceği komutu söyler —
 * "dizin yok" demek, ne yapacağını söylemeden bırakmak olurdu.
 */
export async function resolveWorkspace(root: string, workspace: string): Promise<string> {
  const path = workspacePath(root, workspace);
  try {
    if ((await stat(path)).isDirectory()) return path;
  } catch {
    /* aşağıda */
  }
  if (workspace === "main") {
    throw new WorkspaceError(`Ana checkout bulunamadı: ${path}`);
  }
  throw new WorkspaceError(
    `\`${workspace}\` worktree'si yok: ${path}\n` +
      `  Oluşturmak için:  git worktree add ${join(WORKTREE_DIR, workspace)} -b skein/${workspace}`,
  );
}
