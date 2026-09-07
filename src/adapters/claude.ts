import { spawn } from "node:child_process";
import type { Adapter, InvokeRequest, InvokeResult, Usage } from "./contract.js";

export interface ClaudeCliOptions {
  /** Pinlenmiş model kimliği, ör. "claude-opus-5". Tarih eki yok. */
  model: string;
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
  readonly id = "claude";
  readonly model: string;
  readonly #bin: string;
  readonly #permissionMode: string;

  constructor(options: ClaudeCliOptions) {
    this.model = options.model;
    this.#bin = options.bin ?? "claude";
    this.#permissionMode = options.permissionMode ?? "acceptEdits";
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
    const child = spawn(this.#bin, this.argsFor(req), {
      cwd: req.workdir,
      env: { ...process.env, ...req.env },
      stdio: ["pipe", "pipe", "pipe"],
      // Kendi süreç grubunda başlat: bir sağlayıcı CLI'ı alt süreçler doğurur
      // ve yalnızca ebeveyni öldürmek onları hayatta bırakır. Yaşayan torunlar
      // boruları açık tuttuğu için `close` hiç gelmez ve akış sonsuza kilitlenir.
      detached: true,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c: string) => (stdout += c));
    child.stderr.on("data", (c: string) => (stderr += c));

    child.stdin.on("error", () => {
      // Süreç stdin okumadan öldüyse EPIPE gelir; sonucu exit belirler.
    });
    child.stdin.end(req.taskText);

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

/**
 * Süreci ve doğurduğu her şeyi öldürür.
 *
 * `detached: true` ile başlatıldığı için çocuk kendi süreç grubunun lideridir;
 * negatif pid tüm gruba sinyal gönderir. Grup ölmüşse ESRCH gelir, zararsız.
 */
function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
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
