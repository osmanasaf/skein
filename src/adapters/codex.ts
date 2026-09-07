import { killTree, spawnPortable, stdinOf } from "../proc/process.js";
import type { Adapter, InvokeRequest, InvokeResult, Usage } from "./contract.js";

export interface CodexCliOptions {
  model: string;
  id?: string;
  bin?: string;
  /**
   * Çağrı bayraklarını tamamen değiştirmek için.
   *
   * `{promptFile}` ve `{model}` yer tutucuları doldurulur. Görev metni her
   * durumda stdin'den gider.
   */
  argsTemplate?: string[];
}

/**
 * Codex CLI adaptörü — headless çağrı.
 *
 * DİKKAT: Buradaki bayraklar DOĞRULANMADI. `hub/adapters/CONTRACT.md`
 * "bayrakları doğrulayarak yaz, ezberden yazılan bayrak sessizce yanlış
 * çalışır" diyor ve bu adaptör codex'in kurulu OLMADIĞI bir makinede
 * yazıldı. Kullanmadan önce `cli.ts doctor codex` çalıştır: gerçek argümanları
 * basar ve küçük bir çağrı dener.
 *
 * Bayraklar yanlışsa `argsTemplate` ile TypeScript'e dokunmadan düzeltilir.
 *
 * Usage ayrıştırması kasıtlı olarak "elinden geleni yapar": codex'in çıktı
 * biçimi farklıysa maliyet alanı boş kalır ama deney yine çalışır — ölçüm
 * gizli kancalardan geliyor, token sayımından değil.
 */
export class CodexCliAdapter implements Adapter {
  readonly id: string;
  readonly model: string;
  readonly #bin: string;
  readonly #template: string[];

  /** Doğrulanmamış varsayılan. doctor ile sına, gerekiyorsa argsTemplate ile değiştir. */
  static readonly DEFAULT_ARGS = [
    "exec",
    "--model", "{model}",
    "--skip-git-repo-check",
    "--dangerously-bypass-approvals-and-sandbox",
  ];

  constructor(options: CodexCliOptions) {
    this.id = options.id ?? "codex";
    this.model = options.model;
    this.#bin = options.bin ?? "codex";
    this.#template = options.argsTemplate ?? CodexCliAdapter.DEFAULT_ARGS;
  }

  get bin(): string {
    return this.#bin;
  }

  argsFor(req: InvokeRequest): string[] {
    return this.#template.map((a) =>
      a.replace("{model}", this.model).replace("{promptFile}", req.promptFile),
    );
  }

  async invoke(req: InvokeRequest): Promise<InvokeResult> {
    // Prompt spawn'dan ÖNCE okunur. Spawn ile `error` dinleyicisi arasına bir
    // `await` girerse, olmayan bir ikilinin ENOENT'i dinleyicisiz ateşlenir ve
    // yakalanmamış istisnaya dönüşür. Testte böyle yakalandı.
    const rolePrompt = await readPrompt(req.promptFile);

    const started = Date.now();
    const child = spawnPortable(this.#bin, this.argsFor(req), {
      cwd: req.workdir,
      env: { ...process.env, ...req.env },
      stdin: "pipe",
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c: string) => (stdout += c));
    child.stderr.on("data", (c: string) => (stderr += c));

    // Süreç olayları hiçbir await'e uğramadan, spawn'ın hemen ardından bağlanır.
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, req.timeoutMs);
    const done = new Promise<number>((resolve) => {
      child.on("error", (err) => {
        stderr += `\n${this.#bin} çalıştırılamadı: ${err.message}`;
        resolve(127);
      });
      child.on("close", (code, signal) => resolve(code ?? (signal ? 137 : 1)));
    });

    const stdin = stdinOf(child);
    stdin?.on("error", () => {});
    // Rol promptu + görev metni birlikte stdin'e gider: codex'te
    // --system-prompt-file karşılığı doğrulanmadığı için ikisi birleştiriliyor.
    stdin?.end(`${rolePrompt}\n\n---\n\n${req.taskText}`);

    const exitCode = await done.finally(() => clearTimeout(timer));

    const result: InvokeResult = { exitCode, stdout, stderr, durationMs: Date.now() - started };
    const usage = bestEffortUsage(stdout);
    if (usage) result.usage = usage;
    if (timedOut) result.timedOut = true;
    return result;
  }
}

async function readPrompt(path: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(path, "utf8");
}

/** Çıktıda JSON varsa token alanlarını arar; yoksa sessizce vazgeçer. */
export function bestEffortUsage(stdout: string): Usage | undefined {
  const usage: Usage = {};
  for (const line of stdout.split("\n")) {
    const text = line.trim();
    if (!text.startsWith("{")) continue;
    try {
      const doc = JSON.parse(text) as Record<string, unknown>;
      const u = (doc["usage"] ?? doc) as Record<string, unknown>;
      const inTok = u["input_tokens"] ?? u["prompt_tokens"];
      const outTok = u["output_tokens"] ?? u["completion_tokens"];
      if (typeof inTok === "number") usage.inputTokens = inTok;
      if (typeof outTok === "number") usage.outputTokens = outTok;
    } catch {
      // JSON değil; bir sonraki satır.
    }
  }
  return Object.keys(usage).length > 0 ? usage : undefined;
}
