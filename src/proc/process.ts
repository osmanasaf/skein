import crossSpawn from "cross-spawn";
import type { ChildProcess } from "node:child_process";
import type { Readable, Writable } from "node:stream";

const WINDOWS = process.platform === "win32";

/** stdout ve stderr'i kesin borulu olan çocuk süreç. */
export interface PipedChild extends ChildProcess {
  stdout: Readable;
  stderr: Readable;
}

export interface SpawnPortableOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** stdin borulu mu, yoksa kapalı mı. Varsayılan: kapalı. */
  stdin?: "pipe" | "ignore";
}

/**
 * Platformdan bağımsız süreç başlatma.
 *
 * İki Windows tuzağı burada kapsülleniyor:
 *
 * - `npx` Windows'ta `npx.cmd`'dir; `shell` olmadan çıplak `spawn` ENOENT
 *   verir. `cross-spawn` PATHEXT çözümünü, boşluklu yolları bozmadan yapar.
 * - `detached` POSIX'te süreç grubu lideri yaratır ama Windows'ta yeni bir
 *   konsol açar. Orada istediğimiz şey değil; yalnızca POSIX'te açılır.
 *
 * stdout/stderr her zaman borulu: adaptör sözleşmesi ikisini de döndürmek
 * zorunda ve stderr'i yutmanın bedelini bir kez ödedik.
 */
export function spawnPortable(
  command: string,
  args: string[],
  options: SpawnPortableOptions = {},
): PipedChild {
  const child = crossSpawn(command, args, {
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.env !== undefined ? { env: options.env } : {}),
    stdio: [options.stdin ?? "ignore", "pipe", "pipe"],
    detached: !WINDOWS,
  });
  return child as PipedChild;
}

/** stdin borulu olduğunda yazılabilir akışı verir; değilse undefined. */
export function stdinOf(child: ChildProcess): Writable | undefined {
  return child.stdin ?? undefined;
}

/**
 * Süreci ve doğurduğu her şeyi öldürür.
 *
 * Yalnızca ebeveyni öldürmek yetmez: yaşayan torunlar boruları açık tutar,
 * `close` olayı hiç gelmez ve akış sonsuza kilitlenir. Bunu timeout testi
 * ortaya çıkardı.
 *
 * POSIX'te negatif pid tüm süreç grubuna sinyal gönderir. Windows'ta öyle bir
 * şey yok; ağacı `taskkill /T` yıkar.
 */
export function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  if (WINDOWS) {
    try {
      crossSpawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      // Süreç zaten gitmiş.
    }
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Süreç zaten gitmiş.
    }
  }
}
