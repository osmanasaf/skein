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

  /**
   * Bu istek için kurulacak argüman listesi.
   *
   * `supported` verilirse, orada olmayan opsiyonel bayraklar atlanır. CLI
   * sürümleri arasında bayrak adları değişiyor: operatörün makinesinde
   * `--permission-prompts` yoktu ve çağrı "unknown option" ile boşa döndü.
   * CONTRACT.md zaten uyarıyordu — izin bayrakları adaptörün sorunu.
   */
  argsFor(req: InvokeRequest, supported?: ReadonlySet<string>): string[] {
    const args: string[] = [
      "-p",
      "--output-format", "json",
      "--model", this.model,
      "--system-prompt-file", req.promptFile,
      "--permission-mode", this.#permissionMode,
    ];
    // Soracak bir insan yok: prompt gerektiren her şey otomatik reddedilsin.
    // Zorunlu değil — yokluğunda timeout aynı işi görür, sadece daha yavaş.
    if (supported === undefined || supported.has("--permission-prompts")) {
      args.push("--permission-prompts", "none");
    }
    // Görev metni pozisyonel argüman olarak gider, stdin'den değil.
    //
    // Operatörün CLI sürümü `-p` modunda stdin'i okumuyordu: çağrı hatasız
    // tamamlanıyor ama `iterations: []` ve `modelUsage: {}` dönüyordu — yani
    // model hiç çağrılmamıştı. Pozisyonel argüman her iki sürümde de çalışıyor.
    //
    // Çok uzun metinlerde komut satırı sınırına takılmamak için (Windows
    // ~32K) stdin'e düşülür.
    if (!needsStdin(req.taskText)) args.push(req.taskText);
    return args;
  }

  /** `--help` çıktısından desteklenen bayraklar. İkili başına bir kez okunur. */
  async supportedFlags(): Promise<ReadonlySet<string>> {
    const cached = ClaudeCliAdapter.#flagCache.get(this.#bin);
    if (cached) return cached;
    const flags = new Set<string>();
    try {
      const child = spawnPortable(this.#bin, ["--help"], {});
      let help = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (c: string) => (help += c));
      await new Promise<void>((resolve) => {
        child.on("error", () => resolve());
        child.on("close", () => resolve());
      });
      for (const m of help.matchAll(/--[a-zA-Z][\w-]*/g)) flags.add(m[0]);
    } catch {
      // --help okunamadıysa hiçbir opsiyonel bayrak eklenmez: güvenli taraf.
    }
    ClaudeCliAdapter.#flagCache.set(this.#bin, flags);
    return flags;
  }

  static readonly #flagCache = new Map<string, ReadonlySet<string>>();

  async invoke(req: InvokeRequest): Promise<InvokeResult> {
    const supported = await this.supportedFlags();

    const started = Date.now();
    const child = spawnPortable(this.#bin, this.argsFor(req, supported), {
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
    stdin?.end(needsStdin(req.taskText) ? req.taskText : "");

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
 * Komut satırına sığmayacak kadar uzun mu.
 *
 * Windows'ta tüm komut satırı ~32767 karakterle sınırlı; prompt yolu ve
 * bayraklar da aynı bütçeden yiyor, o yüzden geniş bir pay bırakılıyor.
 */
export function needsStdin(taskText: string): boolean {
  return taskText.length > 8000;
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
