import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
 * Bayraklar `codex-cli 0.155.0` üzerinde doğrulandı — ama iki farklı
 * güçte, ve aradaki fark kayda değer:
 *
 * - `exec`, `--model`, `--skip-git-repo-check`,
 *   `--dangerously-bypass-approvals-and-sandbox`: GERÇEK bir çağrıda
 *   sınandı. CLI hepsini kabul etti, oturumu açtı (`approval: never`,
 *   `sandbox: danger-full-access`) ve stdin'den giden rol promptu + görev
 *   metnini doğru yerde gösterdi. Çağrı yalnızca ağ katmanında durdu:
 *   kurumsal vekil `api.openai.com`'a CONNECT'i reddediyor.
 * - `--json`, `--output-last-message`: yalnızca `codex exec --help`
 *   çıktısında doğrulandı. Var oldukları kesin, ürettikleri BİÇİM
 *   görülmedi. Bu yüzden ikisi de kırılırsa sessizce değil, boş dönecek
 *   şekilde okunuyor: usage bulunamazsa alan yazılmaz, son mesaj dosyası
 *   yoksa `message` boş kalır ve çağıran stdout'a düşer.
 *
 * Başka bir sürümde biçim değişirse `argsTemplate` ile TypeScript'e
 * dokunmadan düzeltilir; `cli.ts doctor codex:<model>` gerçek argümanları
 * basar ve küçük bir çağrı dener.
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

  /**
   * `codex-cli 0.155.0` üzerinde doğrulanmış varsayılan.
   *
   * `--json` olmadan stdout insan için biçimlenmiş metin oluyor ve
   * `bestEffortUsage` arayacak tek bir JSON satırı bulamıyor: codex
   * hücrelerinin maliyeti sessizce boş kalırdı. `{lastMessage}` ise
   * ajanın son mesajını ayrı bir dosyaya yazdırıyor — `--json` ile stdout
   * artık JSONL olduğu için denetim raporunun metni oradan okunamaz.
   */
  static readonly DEFAULT_ARGS = [
    "exec",
    "--model", "{model}",
    "--skip-git-repo-check",
    "--dangerously-bypass-approvals-and-sandbox",
    "--json",
    "--output-last-message", "{lastMessage}",
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

  /**
   * `lastMessagePath` verilmezse görünür bir yer tutucu konur.
   *
   * Boş bırakmak, `doctor`ın "--output-last-message " diye ucu boş bir
   * bayrak basmasına yol açardı — ve doctor'ın tek işi çağrıyı olduğu gibi
   * göstermek. Aynı tuzağa `--system-prompt` tarafında bir kez düşülmüş.
   */
  argsFor(req: InvokeRequest, lastMessagePath = "<koşuda-geçici-dosya>"): string[] {
    return this.#template.map((a) =>
      a
        .replace("{model}", this.model)
        .replace("{promptFile}", req.promptFile)
        .replace("{lastMessage}", lastMessagePath),
    );
  }

  async invoke(req: InvokeRequest): Promise<InvokeResult> {
    // Prompt spawn'dan ÖNCE okunur. Spawn ile `error` dinleyicisi arasına bir
    // `await` girerse, olmayan bir ikilinin ENOENT'i dinleyicisiz ateşlenir ve
    // yakalanmamış istisnaya dönüşür. Testte böyle yakalandı.
    const rolePrompt = await readPrompt(req.promptFile);

    // Son mesaj dosyası çalışma dizininin DIŞINDA: `produce` artefakt
    // dizinine yazılan dosyaları listeliyor ve oraya konsa "ajan ne yazdı"
    // sayımına karışırdı.
    const lastMessagePath = join(await mkdtemp(join(tmpdir(), "skein-codex-")), "last-message.txt");

    const started = Date.now();
    const child = spawnPortable(this.#bin, this.argsFor(req, lastMessagePath), {
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
    // Dosya yoksa ya da boşsa `message` boş bırakılır ve çağıran stdout'a
    // düşer. Uydurmaktansa eksik bırakmak: bir denetim raporunun yerine
    // JSONL geçmesi, pahalı bir koşuyu fark edilmeden çöpe çevirirdi.
    const message = await readLastMessage(lastMessagePath);
    if (message !== undefined) result.message = message;
    if (timedOut) result.timedOut = true;
    return result;
  }
}

/** Codex'in yazdığı son mesaj dosyası; yoksa ya da boşsa undefined. */
async function readLastMessage(path: string): Promise<string | undefined> {
  try {
    const text = (await readFile(path, "utf8")).trim();
    return text === "" ? undefined : text;
  } catch {
    return undefined;
  } finally {
    await rm(dirname(path), { recursive: true, force: true });
  }
}

async function readPrompt(path: string): Promise<string> {
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
