import crossSpawn from "cross-spawn";
import type { ChildProcess } from "node:child_process";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
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

export interface CaptureResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Kısa ömürlü bir yardımcı komutu koşturup çıktısını toplar.
 *
 * Ajan çağrıları için DEĞİL — onlar adaptörlerin işi ve zaman aşımı,
 * süreç ağacı öldürme, kullanım ölçümü gibi yükleri var. Bu, `git rev-parse`
 * gibi tek satırlık şeyler için.
 */
export function capture(
  command: string,
  args: string[],
  options: SpawnPortableOptions & { timeoutMs?: number } = {},
): Promise<CaptureResult> {
  return new Promise((resolve) => {
    const child = spawnPortable(command, args, options);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));

    const timer = setTimeout(() => killTree(child.pid), options.timeoutMs ?? 15_000);
    // `error` ve `close` ikisi birden tetiklenebilir; ilk sonuç bağlayıcı.
    let settled = false;
    const finish = (exitCode: number): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr });
    };
    child.on("error", () => finish(-1));
    child.on("close", (code) => finish(code ?? -1));
  });
}

/**
 * `tsx`'in CLI giriş noktasını (`node_modules/tsx/dist/cli.mjs`) bulur.
 *
 * `join(root, "node_modules", "tsx", "dist", "cli.mjs")` gibi ELLE
 * birleştirmiyoruz: `git worktree add` ile açılan bir çalışma ağacının
 * KENDİ `node_modules`'ü yoktur (paketler ana depoda kalır, `npm install`
 * worktree'de koşmaz) — elle birleştirme orada "modül yok" diye patlar.
 * Node'un kendi modül çözümlemesi (`createRequire(...).resolve`) `root`tan
 * başlayıp ÜST dizinlere doğru `node_modules` arar — `npx tsx` komutunun
 * yaptığı tam da bu, biz süreci `npx` ÜZERİNDEN başlatmadan (bu modülün
 * çağıranları `PATH`i boşaltıp başka bir alt süreci [ör. tarayıcı açma]
 * deterministik başarısız kılmak isteyebiliyor; `npx` komutunun kendisi de
 * `PATH`te bulunduğundan bu ihtiyaçla çakışırdı) aynı sonucu üretiyoruz.
 */
export function tsxCliYolu(root: string): string {
  const req = createRequire(join(root, "package.json"));
  const paketYolu = req.resolve("tsx/package.json");
  return join(dirname(paketYolu), "dist", "cli.mjs");
}

/**
 * Bu modül sürecin GİRİŞ NOKTASI mı, yoksa biri onu `import` mu etti?
 *
 * Gerçekte şöyle patladı: `watch/cli.ts` ve `ui/cli.ts` dosya sonunda
 * koşulsuz `main(process.argv.slice(2))` çağırıyordu. `parseArgs`'ı sınamak
 * için modülü `import` eden sınama dosyası, farkında olmadan GÖZCÜYÜ sınama
 * sürecinin içinde koşturdu: vitest'in argv'si ayrıştırıldı, `main` ilerledi
 * ve `process.exit` çağrıldı. vitest `process.exit`i yakaladığı için takım
 * yeşil kaldı — kusuru yalnızca bir "unhandled rejection" satırı anlattı ve
 * o satır "dokunulmamış bir dosyadaki eski uyarı" diye geçiştirildi. Oysa
 * `.skein/` kilidini almaya ya da ajan çağırmaya kadar gidebilirdi.
 *
 * Bir modülü içe almanın YAN ETKİSİ olmamalı. Giriş noktası olup olmadığını
 * `process.argv[1]` ile karşılaştırarak anlıyoruz.
 *
 * İki biçim de aday: `resolve` edilmiş hâli ve `realpathSync`'ten geçmiş
 * hâli. Deponun kendisi bir sembolik bağın arkasındaysa `import.meta.url`
 * ile `argv[1]` farklı yazılır; tek biçimle karşılaştırmak o kurulumda
 * CLI'ı SESSİZCE hiç çalışmaz hâle getirirdi — düzelttiğimiz kusurun tam
 * olarak aynısı, bu kez bizim elimizden.
 */
export function girisNoktasiMi(moduleUrl: string): boolean {
  const giris = process.argv[1];
  if (giris === undefined || giris === "") return false;
  // `resolve` bir dizge için ASLA atmaz — bu yüzden try/catch'i yok ve
  // yukarıdaki undefined/boş denetimi TAŞIYICI: onu kaldıran bir mutasyon
  // burada yakalanıyor, sessizce yutulmuyor.
  const adaylar = new Set<string>([pathToFileURL(resolve(giris)).href]);
  try {
    adaylar.add(pathToFileURL(realpathSync(giris)).href);
  } catch {
    // Dosya yok (ör. `node -e`); diğer adaya bak.
  }
  return adaylar.has(moduleUrl);
}
