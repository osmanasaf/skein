import { killTree, spawnPortable, stdinOf } from "../proc/process.js";
import type { Adapter, InvokeRequest, InvokeResult, Usage } from "./contract.js";

export interface ClaudeCliOptions {
  /** Pinlenmiş model kimliği, ör. "claude-opus-5". Tarih eki yok. */
  model: string;
  /**
   * Kayıttaki sağlayıcı kimliği. Varsayılan "claude".
   *
   * Aynı CLI'ı farklı modellerle iki ayrı sağlayıcı gibi kaydedebilmek için
   * ayrılabilir: 2x2 kurgu iki farklı MODEL gerektirir, satıcı ayrımı tezin
   * daha güçlü ama daha pahalı hali.
   */
  id?: string;
  /** Çalıştırılacak ikili. Testte sahte bir script ile değiştirilir. */
  bin?: string;
  /**
   * İzin modu. Varsayılan `acceptEdits`: ajan dosya yazabilmeli, ama
   * `bypassPermissions` root altında CLI tarafından reddediliyor.
   */
  permissionMode?: string;
}

/** `claude -p --output-format json` çıktısının okuduğumuz alanları. */
interface ClaudeJsonResult {
  is_error?: boolean;
  result?: string;
  total_cost_usd?: number;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * Claude Code CLI adaptörü — headless çağrı.
 *
 * Bayraklar CLI'ın kendi `--help` çıktısından doğrulanarak yazıldı; ezbere
 * yazılan bayrak sessizce yanlış çalışır (CONTRACT.md).
 */
export class ClaudeCliAdapter implements Adapter {
  readonly id: string;
  readonly model: string;
  readonly #bin: string;
  readonly #permissionMode: string;

  constructor(options: ClaudeCliOptions) {
    this.id = options.id ?? "claude";
    this.model = options.model;
    this.#bin = options.bin ?? "claude";
    this.#permissionMode = options.permissionMode ?? "acceptEdits";
  }

  get bin(): string {
    return this.#bin;
  }

  /** Test ve hata ayıklama için: bu istek için kurulacak argüman listesi. */
  argsFor(req: InvokeRequest): string[] {
    return [
      "-p",
      "--output-format", "json",
      "--model", this.model,
      "--system-prompt-file", req.promptFile,
      "--permission-mode", this.#permissionMode,
      // Soracak bir insan yok: prompt gerektiren her şey otomatik reddedilir.
      "--permission-prompts", "none",
    ];
  }

  async invoke(req: InvokeRequest): Promise<InvokeResult> {
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

    const stdin = stdinOf(child);
    // Süreç stdin okumadan öldüyse EPIPE gelir; sonucu exit belirler.
    stdin?.on("error", () => {});
    stdin?.end(req.taskText);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, req.timeoutMs);

    const exitCode = await new Promise<number>((resolve) => {
      child.on("error", (err) => {
        stderr += `\n${this.#bin} çalıştırılamadı: ${err.message}`;
        resolve(127);
      });
      child.on("close", (code, signal) => resolve(code ?? (signal ? 137 : 1)));
    }).finally(() => clearTimeout(timer));

    const parsed = parseResult(stdout);
    const result: InvokeResult = {
      // Süreç 0 dönse bile CLI kendi çıktısında hata bildirdiyse başarı değildir.
      // Sağlayıcının hatayı nasıl bildirdiği adaptörde kapsüllenir.
      exitCode: exitCode !== 0 ? exitCode : parsed?.is_error === true ? 1 : 0,
      stdout,
      stderr,
      durationMs: Date.now() - started,
    };
    const usage = toUsage(parsed);
    if (usage) result.usage = usage;
    if (timedOut) result.timedOut = true;
    return result;
  }
}

/** Çıktı JSON değilse (CLI hata metni bastıysa) sessizce yutulur; stdout korunur. */
function parseResult(stdout: string): ClaudeJsonResult | undefined {
  const text = stdout.trim();
  if (text === "") return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object" ? (value as ClaudeJsonResult) : undefined;
  } catch {
    return undefined;
  }
}

function toUsage(parsed: ClaudeJsonResult | undefined): Usage | undefined {
  if (!parsed) return undefined;
  const usage: Usage = {};
  if (typeof parsed.usage?.input_tokens === "number") usage.inputTokens = parsed.usage.input_tokens;
  if (typeof parsed.usage?.output_tokens === "number") usage.outputTokens = parsed.usage.output_tokens;
  if (typeof parsed.total_cost_usd === "number") usage.costUsd = parsed.total_cost_usd;
  return Object.keys(usage).length > 0 ? usage : undefined;
}
