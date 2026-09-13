import { stat } from "node:fs/promises";
import { join } from "node:path";
import { addWorktree } from "./git.js";

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

export interface ResolveOptions {
  /**
   * Eksik worktree'yi oluştur. Varsayılan: true.
   *
   * Bir topolojiye rol eklemenin bedeli "önce şu git komutunu elle çalıştır"
   * olmamalı — akış dosyası zaten hangi worktree'nin gerektiğini söylüyor.
   * `false` yalnızca depoya dokunmadan bakmak istendiğinde (`--plan`).
   */
  create?: boolean;
  /** Test edilebilirlik için. */
  addWorktree?: typeof addWorktree;
}

/**
 * Rolün çalışacağı dizini çözer; yoksa worktree'yi oluşturur.
 *
 * `main` oluşturulmaz: o, kullanıcının kendi checkout'u. Yoksa ortada bir
 * depo yok demektir ve bu, orkestratörün düzeltebileceği bir şey değil.
 */
export async function resolveWorkspace(
  root: string,
  workspace: string,
  options: ResolveOptions = {},
): Promise<string> {
  const path = workspacePath(root, workspace);
  if (await isDirectory(path)) return path;

  if (workspace === "main") {
    throw new WorkspaceError(`Ana checkout bulunamadı: ${path}`);
  }

  const rel = join(WORKTREE_DIR, workspace);
  const manual = `  Elle oluşturmak için:  git worktree add ${rel} -b skein/${workspace}`;

  if (options.create === false) {
    throw new WorkspaceError(`\`${workspace}\` worktree'si yok: ${path}\n${manual}`);
  }

  const result = await (options.addWorktree ?? addWorktree)(root, rel, workspace);
  if (result.kind === "failed") {
    throw new WorkspaceError(
      `\`${workspace}\` worktree'si oluşturulamadı: ${result.reason}\n${manual}`,
    );
  }
  if (!(await isDirectory(path))) {
    throw new WorkspaceError(`\`${workspace}\` worktree'si oluşturuldu ama dizin yok: ${path}`);
  }
  return path;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
