import { LineSplitter } from "../proc/lines.js";
import { killTree, spawnPortable, stdinOf } from "../proc/process.js";
import type { Adapter, AgentStep, InvokeRequest, InvokeResult, Usage } from "./contract.js";

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
   * İzin modu. Varsayılan `bypassPermissions`: headless bir rol commit
   * atmak zorunda ve kimse izin istemine cevap veremez.
   *
   * `acceptEdits` YETMEZ ve bunu bir koşu pahasına öğrendik: dosya
   * yazmaya izin verir ama Bash'e vermez, yani ajan kodu yazar, `git
   * commit` atamaz ve — doğru davranarak — "başardım" demeyi reddeder.
   * Tur, hiç kimsenin anlamadığı bir sebeple sonuçsuz kalır.
   *
   * Root altında CLI `bypassPermissions`'ı reddeder; o durumda
   * `acceptEdits` + `allowedTools` ile gerekli komutlar açılır.
   */
  permissionMode?: string;
  /** `--allowed-tools` değerleri, ör. `["Bash(git:*)"]`. */
  allowedTools?: string[];
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
  readonly #allowedTools: string[];

  constructor(options: ClaudeCliOptions) {
    this.id = options.id ?? "claude";
    this.model = options.model;
    this.#bin = options.bin ?? "claude";
    this.#permissionMode = options.permissionMode ?? "bypassPermissions";
    this.#allowedTools = options.allowedTools ?? [];
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
  argsFor(req: InvokeRequest, supported?: ReadonlySet<string>, promptText?: string): string[] {
    const args: string[] = ["-p"];

    // Görev metni EN BAŞTA, hiçbir bayraktan sonra değil.
    //
    // `--allowed-tools <tools...>` variadic: kendisinden sonraki her
    // pozisyonel argümanı araç adı sanar. Görev metni sonda olduğunda araya
    // bir bayrak girmezse metin araç listesine yutuluyor ve CLI "Input must
    // be provided" diyor — yani ajan görevi HİÇ görmüyor. Eskiden araya
    // `--permission-prompts` giriyordu ve kaza gizleniyordu; o bayrağın
    // olmadığı bir CLI sürümünde (operatörün makinesinde yoktu) tur sessizce
    // boşa gidiyordu. Sıra artık kazaya bağlı değil.
    //
    // Çok uzun metinlerde komut satırı sınırına takılmamak için (Windows
    // ~32K) stdin'e düşülür.
    if (!needsStdin(req.taskText)) args.push(req.taskText);

    // Akış biçimi yalnızca adım isteniyorsa: `json` yolu kanıtlanmış ve
    // deney onu kullanıyor, biçimi gereksiz yere değiştirmenin faydası yok.
    if (req.onStep !== undefined) {
      args.push("--output-format", "stream-json", "--verbose");
    } else {
      args.push("--output-format", "json");
    }
    args.push("--model", this.model);

    // Rol promptu: dosya yolu mu, gövde mi.
    //
    // `--system-prompt-file` bu CLI'ın `--help` çıktısında GÖRÜNMÜYOR — belgesiz
    // çalışıyor. Belgesiz bir bayrağa dayanmak, sürümler arasında sessizce
    // bozulmanın kısa yolu. Yalnızca gerçekten ilan edilmişse kullanılıyor;
    // aksi halde belgelenmiş `--system-prompt` ile gövde geçiliyor.
    if (supported?.has("--system-prompt-file") ?? promptText === undefined) {
      args.push("--system-prompt-file", req.promptFile);
    } else {
      args.push("--system-prompt", promptText ?? "");
    }

    args.push("--permission-mode", this.#permissionMode);
    if (this.#allowedTools.length > 0 && (supported === undefined || supported.has("--allowed-tools"))) {
      args.push("--allowed-tools", ...this.#allowedTools);
    }
    // Soracak bir insan yok: prompt gerektiren her şey otomatik reddedilsin.
    // Zorunlu değil — yokluğunda timeout aynı işi görür, sadece daha yavaş.
    if (supported === undefined || supported.has("--permission-prompts")) {
      args.push("--permission-prompts", "none");
    }
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
    // Prompt spawn'dan ÖNCE okunur: spawn ile `error` dinleyicisi arasına bir
    // await girerse, olmayan bir ikilinin ENOENT'i dinleyicisiz ateşlenir.
    const promptText = await readFileSafe(req.promptFile);

    const started = Date.now();
    const child = spawnPortable(this.#bin, this.argsFor(req, supported, promptText), {
      cwd: req.workdir,
      env: { ...process.env, ...req.env },
      stdin: "pipe",
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (c: string) => (stderr += c));

    // Akış modunda her satır ayrı bir kayıt: satır tamamlandıkça okunur,
    // sürecin bitmesi beklenmez. stdout yine de biriktirilir — teşhis için
    // ham çıktı sözleşmenin parçası.
    let streamed: ClaudeJsonResult | undefined;
    if (req.onStep !== undefined) {
      const onStep = req.onStep;
      const splitter = new LineSplitter((line) => {
        const record = parseLine(line);
        if (record === undefined) return;
        if (record.type === "result") {
          streamed = record.value as ClaudeJsonResult;
          return;
        }
        for (const step of stepsOf(record, req.workdir)) onStep(step);
      });
      child.stdout.on("data", (c: string) => {
        stdout += c;
        splitter.push(c);
      });
      child.stdout.on("end", () => splitter.flush());
    } else {
      child.stdout.on("data", (c: string) => (stdout += c));
    }

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

    // Akış modunda sonuç, `type: "result"` satırından gelir — SON satırdan
    // değil. Gerçek koşuda `result`'tan sonra bir `system` satırı daha
    // geliyor; "sonuncusu sonuçtur" varsayımı maliyeti ve ajanın son mesajını
    // sessizce kaybettirirdi.
    const parsed = req.onStep !== undefined ? streamed : parseResult(stdout);
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
    // Ajanın son mesajı: tur sonuçsuz bittiğinde sebebi çoğu zaman burada.
    if (typeof parsed?.result === "string" && parsed.result.trim() !== "") {
      result.message = parsed.result.trim();
    }
    if (timedOut) result.timedOut = true;
    return result;
  }
}

async function readFileSafe(path: string): Promise<string | undefined> {
  const { readFile } = await import("node:fs/promises");
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
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

/** Akıştaki tek kayıt: tipi ve gövdesi. */
interface StreamRecord {
  type: string;
  value: Record<string, unknown>;
}

function parseLine(line: string): StreamRecord | undefined {
  try {
    const value: unknown = JSON.parse(line);
    if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    return typeof record["type"] === "string" ? { type: record["type"], value: record } : undefined;
  } catch {
    // Akışta JSON olmayan satır olabilir (CLI uyarısı). Adım kaybı turun
    // sonucunu değiştirmez; kayıt GÖZLEM'dir.
    return undefined;
  }
}

/** Adım ayrıntısının üst sınırı. Günlük okunabilir kalmalı. */
const DETAIL_MAX = 160;

function trim(text: string): string {
  const oneLine = text.trim().split("\n")[0] ?? "";
  return oneLine.length > DETAIL_MAX ? `${oneLine.slice(0, DETAIL_MAX - 1)}…` : oneLine;
}

/**
 * Sağlayıcıya özel akış kaydını, sağlayıcıdan bağımsız adımlara çevirir.
 *
 * Yalnızca `assistant` kayıtlarının `tool_use` ve `text` parçaları geçer.
 * `thinking` KASITLI olarak dışarıda: ajanın iç muhakemesi gözlem değil, ve
 * günlüğü şişirmekten başka bir şey yapmaz.
 */
export function stepsOf(record: StreamRecord, workdir?: string): AgentStep[] {
  if (record.type !== "assistant") return [];
  const message = record.value["message"];
  if (message === null || typeof message !== "object") return [];
  const content = (message as Record<string, unknown>)["content"];
  if (!Array.isArray(content)) return [];

  const steps: AgentStep[] = [];
  for (const raw of content) {
    if (raw === null || typeof raw !== "object") continue;
    const block = raw as Record<string, unknown>;
    if (block["type"] === "tool_use" && typeof block["name"] === "string") {
      const step: AgentStep = { kind: "tool", name: block["name"] };
      const detail = toolDetail(block["input"], workdir);
      if (detail !== "") step.detail = detail;
      steps.push(step);
    } else if (block["type"] === "text" && typeof block["text"] === "string") {
      const detail = trim(block["text"]);
      if (detail !== "") steps.push({ kind: "text", detail });
    }
  }
  return steps;
}

/**
 * Çalışma dizininin altındaki yolu kısaltır.
 *
 * Ajanın verdiği yol mutlak: `/uzun/gecici/dizin/.worktrees/reviewer/src/a.ts`.
 * Ekranda ve günlükte okunması gereken kısım son parça; önekin her satırda
 * tekrarlanması ayrıntıyı görünmez yapıyor.
 */
function relativize(value: string, workdir?: string): string {
  if (workdir === undefined || workdir === "") return value;
  const prefix = workdir.endsWith("/") || workdir.endsWith("\\") ? workdir : `${workdir}/`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

/**
 * Aracın girdisinden okunabilir tek bir satır.
 *
 * Alan sırası önem sırası: hangi dosyaya dokunduğu, hangi komutu koşturduğu.
 * Hiçbiri yoksa ham JSON'un başı — hiç ayrıntı olmamasından iyidir.
 */
function toolDetail(input: unknown, workdir?: string): string {
  if (input === null || typeof input !== "object") return "";
  const record = input as Record<string, unknown>;
  for (const key of ["file_path", "command", "pattern", "path", "description", "prompt"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") return trim(relativize(value, workdir));
  }
  try {
    return trim(JSON.stringify(record));
  } catch {
    return "";
  }
}
