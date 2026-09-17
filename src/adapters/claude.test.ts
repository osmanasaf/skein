import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeCliAdapter } from "./claude.js";
import type { AgentStep } from "./contract.js";
import { makeFakeCli, type FakeCliSpec } from "../testing/fake-cli.js";

let root: string;

/** Gerçek API çağırmadan adaptörü sınamak için sahte bir CLI kurar. */
const fakeCli = (spec: FakeCliSpec) => makeFakeCli(root, spec);

const req = (over: Partial<Parameters<ClaudeCliAdapter["invoke"]>[0]> = {}) => ({
  workdir: root,
  promptFile: join(root, "prompt.md"),
  taskText: "işi yap",
  timeoutMs: 10_000,
  ...over,
});

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-claude-"));
  await writeFile(join(root, "prompt.md"), "PROMPT");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const OK = `{"is_error":false,"result":"tamam","total_cost_usd":0.25,"usage":{"input_tokens":10,"output_tokens":4}}`;

describe("ClaudeCliAdapter", () => {
  it("izin modu ve açık araç listesi geçirilebilir", () => {
    const adapter = new ClaudeCliAdapter({
      model: "claude-opus-5",
      permissionMode: "acceptEdits",
      allowedTools: ["Bash(git:*)", "Edit"],
    });
    const args = adapter.argsFor(
      { workdir: "/tmp", promptFile: "/tmp/p.md", taskText: "işi yap", timeoutMs: 1000 },
    ).join(" ");

    expect(args).toContain("--permission-mode acceptEdits");
    expect(args).toContain("--allowed-tools Bash(git:*) Edit");
  });

  it("model pinlenmiş ve id sabit", () => {
    const a = new ClaudeCliAdapter({ model: "claude-opus-5" });
    expect(a.id).toBe("claude");
    expect(a.model).toBe("claude-opus-5");
  });

  // Bayraklar CLI'ın kendi --help çıktısından doğrulandı; regresyona karşı kilit.
  it("headless çağrı bayraklarını kurar", () => {
    const a = new ClaudeCliAdapter({ model: "claude-opus-5" });
    const args = a.argsFor(req());
    expect(args).toContain("-p");
    expect(args.join(" ")).toContain("--output-format json");
    expect(args.join(" ")).toContain("--model claude-opus-5");
    expect(args.join(" ")).toContain(`--system-prompt-file ${join(root, "prompt.md")}`);
    // Headless bir rol commit atmak zorunda ve kimse izin istemine cevap
    // veremez. `acceptEdits` dosya yazdırır ama Bash'e izin vermez: ajan
    // kodu yazar, commit atamaz ve haklı olarak "başardım" demez.
    expect(args.join(" ")).toContain("--permission-mode bypassPermissions");
    expect(args.join(" ")).toContain("--permission-prompts none");
  });

  // Operatörün CLI'ında --permission-prompts yoktu ve çağrı boşa döndü.
  it("desteklenmeyen opsiyonel bayrağı atlar", () => {
    const a = new ClaudeCliAdapter({ model: "m" });
    const args = a.argsFor(req(), new Set(["--model", "--permission-mode"]));
    expect(args.join(" ")).not.toContain("--permission-prompts");
    expect(args.join(" ")).toContain("--permission-mode");
  });

  it("desteklenen opsiyonel bayrağı ekler", () => {
    const a = new ClaudeCliAdapter({ model: "m" });
    const args = a.argsFor(req(), new Set(["--permission-prompts"]));
    expect(args.join(" ")).toContain("--permission-prompts none");
  });

  it("--help okunamayan ikilide opsiyonel bayrak eklenmez", async () => {
    const a = new ClaudeCliAdapter({ model: "m", bin: "/yok/boyle/claude" });
    expect((await a.supportedFlags()).size).toBe(0);
  });

  it("bayrakları gerçekten --help çıktısından okur", async () => {
    const bin = await fakeCli({ help: "  --model <m>\n  --permission-mode <p>\n" });
    const flags = await new ClaudeCliAdapter({ model: "m", bin }).supportedFlags();
    expect(flags.has("--permission-mode")).toBe(true);
    expect(flags.has("--permission-prompts")).toBe(false);
  });

  // Eski CLI'da bu bayrak yok; çağrı "unknown option" ile boşa dönüyordu.
  it("eski CLI'da --permission-prompts göndermez", async () => {
    const out = join(root, "args.txt");
    const bin = await fakeCli({ help: "  --permission-mode <p>\n", stdout: OK, stdinTo: out });
    const a = new ClaudeCliAdapter({ model: "m", bin });
    const args = a.argsFor(req(), await a.supportedFlags());
    expect(args).not.toContain("--permission-prompts");
  });

  // Operatörün sürümü -p modunda stdin okumuyordu: çağrı hatasız tamamlanıp
  // iterations: [] dönüyordu, yani model hiç çağrılmamıştı.
  it("görev metnini pozisyonel argüman olarak geçirir", () => {
    const a = new ClaudeCliAdapter({ model: "m" });
    expect(a.argsFor(req({ taskText: "GÖREV" }))).toContain("GÖREV");
  });

  // `--allowed-tools <tools...>` VARIADIC: sonrasındaki her pozisyoneli araç
  // adı sanıyor. Görev metni sonda olduğunda CLI "Input must be provided"
  // diyor — ajan görevi hiç görmüyor. Eskiden araya `--permission-prompts`
  // girdiği için kaza gizleniyordu; o bayrağın olmadığı sürümde tur sessizce
  // boşa gidiyordu.
  it("görev metni araç listesinden ÖNCE gelir", () => {
    const a = new ClaudeCliAdapter({ model: "m", allowedTools: ["Read", "Write"] });
    const args = a.argsFor(req({ taskText: "GÖREV" }), new Set(["--allowed-tools"]));
    expect(args.indexOf("GÖREV")).toBeLessThan(args.indexOf("--allowed-tools"));
  });

  // Aynı kaza, hiçbir opsiyonel bayrak desteklenmediğinde de olmamalı.
  it("araya bayrak girmese de görev metni yutulmaz", () => {
    const a = new ClaudeCliAdapter({ model: "m", allowedTools: ["Read"] });
    const args = a.argsFor(req({ taskText: "GÖREV" }), new Set(["--allowed-tools"]));
    expect(args.at(-1)).not.toBe("GÖREV");
    expect(args[1]).toBe("GÖREV");
  });

  it("çok uzun metni pozisyonele koymaz — komut satırı sınırı", () => {
    const a = new ClaudeCliAdapter({ model: "m" });
    const uzun = "x".repeat(9000);
    expect(a.argsFor(req({ taskText: uzun }))).not.toContain(uzun);
  });

  // --system-prompt-file bu CLI'ın --help çıktısında yok: belgesiz çalışıyor.
  // Belgesiz bayrağa dayanmak sürümler arası sessiz bozulmanın kısa yolu.
  it("--system-prompt-file ilan edilmişse dosya yolunu kullanır", () => {
    const a = new ClaudeCliAdapter({ model: "m" });
    const args = a.argsFor(req(), new Set(["--system-prompt-file"]), "GOVDE");
    expect(args.join(" ")).toContain("--system-prompt-file");
    expect(args).not.toContain("GOVDE");
  });

  it("ilan edilmemişse belgelenmiş --system-prompt ile gövdeyi geçer", () => {
    const a = new ClaudeCliAdapter({ model: "m" });
    const args = a.argsFor(req(), new Set(["--system-prompt"]), "GOVDE");
    expect(args.join(" ")).not.toContain("--system-prompt-file");
    expect(args).toContain("GOVDE");
  });

  it("izin modu değiştirilebilir", () => {
    const a = new ClaudeCliAdapter({ model: "m", permissionMode: "dontAsk" });
    expect(a.argsFor(req()).join(" ")).toContain("--permission-mode dontAsk");
  });

  it("başarılı koşuda usage'ı JSON'dan çıkarır", async () => {
    const bin = await fakeCli({ stdout: OK });
    const r = await new ClaudeCliAdapter({ model: "m", bin }).invoke(req());
    expect(r.exitCode).toBe(0);
    expect(r.usage).toEqual({ inputTokens: 10, outputTokens: 4, costUsd: 0.25 });
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("uzun metin stdin'e düşer", async () => {
    const out = join(root, "stdin.txt");
    const bin = await fakeCli({ stdinTo: out, stdout: OK });
    const uzun = "y".repeat(9000);
    await new ClaudeCliAdapter({ model: "m", bin }).invoke(req({ taskText: uzun }));
    expect(await readFile(out, "utf8")).toBe(uzun);
  });

  it("kısa metinde stdin boş kalır — çift gönderim olmasın", async () => {
    const out = join(root, "stdin.txt");
    const bin = await fakeCli({ stdinTo: out, stdout: OK });
    await new ClaudeCliAdapter({ model: "m", bin }).invoke(req({ taskText: "KISA" }));
    expect(await readFile(out, "utf8")).toBe("");
  });

  it("süreci workdir içinde çalıştırır", async () => {
    const sub = join(root, "alt");
    await import("node:fs/promises").then((fs) => fs.mkdir(sub));
    const bin = await fakeCli({ cwdTo: join(root, "cwd.txt"), stdout: OK });
    await new ClaudeCliAdapter({ model: "m", bin }).invoke(req({ workdir: sub }));
    expect((await readFile(join(root, "cwd.txt"), "utf8")).trim()).toBe(sub);
  });

  it("sıfır olmayan çıkış kodunu olduğu gibi taşır", async () => {
    const bin = await fakeCli({ stderr: "patladı", exit: 3 });
    const r = await new ClaudeCliAdapter({ model: "m", bin }).invoke(req());
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("patladı");
  });

  // CLI 0 dönüp kendi çıktısında hata bildirebiliyor; bunu başarı saymak yanlış olur.
  it("exit 0 ama is_error:true ise başarısız sayar", async () => {
    const bin = await fakeCli({ stdout: '{"is_error":true,"result":"olmadı"}' });
    const r = await new ClaudeCliAdapter({ model: "m", bin }).invoke(req());
    expect(r.exitCode).not.toBe(0);
  });

  it("JSON olmayan çıktıda çökmez, stdout'u korur", async () => {
    const bin = await fakeCli({ stdout: "bu JSON değil" });
    const r = await new ClaudeCliAdapter({ model: "m", bin }).invoke(req());
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("bu JSON değil");
    expect(r.usage).toBeUndefined();
  });

  it("timeout'ta süreci öldürür ve işaretler", async () => {
    const bin = await fakeCli({ sleepMs: 30_000 });
    const r = await new ClaudeCliAdapter({ model: "m", bin }).invoke(req({ timeoutMs: 300 }));
    expect(r.timedOut).toBe(true);
    expect(r.exitCode).not.toBe(0);
    expect(r.durationMs).toBeLessThan(10_000);
  });

  it("ikili bulunamazsa anlamlı hata döndürür, atmaz", async () => {
    const r = await new ClaudeCliAdapter({ model: "m", bin: "/yok/boyle/bir/sey" }).invoke(req());
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/çalıştırılamadı/);
  });
});

// --- Akış modu (adım 2) ---

/** Gerçek koşudan alınmış satır şekilleri. */
const S_TEXT = JSON.stringify({
  type: "assistant",
  message: { content: [{ type: "text", text: "Önce dosyayı okuyacağım.\nSonra yazacağım." }] },
});
const S_TOOL = JSON.stringify({
  type: "assistant",
  message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/repo/not.txt" } }] },
});
const S_THINK = JSON.stringify({
  type: "assistant",
  message: { content: [{ type: "thinking", thinking: "içimden geçenler" }] },
});
const S_SYS = JSON.stringify({ type: "system", subtype: "thinking_tokens", estimated_tokens: 5 });
const S_RESULT = JSON.stringify({
  type: "result",
  subtype: "success",
  is_error: false,
  result: "bitti",
  total_cost_usd: 0.02,
  usage: { input_tokens: 7, output_tokens: 3 },
});
// Gerçek koşuda `result`'tan SONRA da satır geliyor.
const S_AFTER = JSON.stringify({ type: "system", subtype: "task_summary", detail: "özet" });

describe("ClaudeCliAdapter — akış modu", () => {
  it("adım istenmezse biçim değişmez", () => {
    const a = new ClaudeCliAdapter({ model: "m" });
    expect(a.argsFor(req()).join(" ")).toContain("--output-format json");
  });

  it("adım istenirse stream-json'a geçer", () => {
    const a = new ClaudeCliAdapter({ model: "m" });
    const args = a.argsFor(req({ onStep: () => {} })).join(" ");
    expect(args).toContain("--output-format stream-json");
    // `stream-json` yalnızca --verbose ile tam kayıt basıyor.
    expect(args).toContain("--verbose");
  });

  // Mutlak yol her satırda tekrarlanınca ayrıntı görünmez oluyor.
  it("çalışma dizininin altındaki yolu kısaltır", async () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: join(root, "src", "retry.ts") } }] },
    });
    const bin = await fakeCli({ stdout: `${line}\n${S_RESULT}\n` });
    const steps: AgentStep[] = [];
    await new ClaudeCliAdapter({ model: "m", bin }).invoke(req({ onStep: (s) => steps.push(s) }));
    expect(steps[0]?.detail).toBe(join("src", "retry.ts").split("\\").join("/"));
  });

  it("dizin dışındaki yol olduğu gibi kalır", async () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/etc/hosts" } }] },
    });
    const bin = await fakeCli({ stdout: `${line}\n${S_RESULT}\n` });
    const steps: AgentStep[] = [];
    await new ClaudeCliAdapter({ model: "m", bin }).invoke(req({ onStep: (s) => steps.push(s) }));
    expect(steps[0]?.detail).toBe("/etc/hosts");
  });

  it("araç ve metin adımlarını yayar", async () => {
    const bin = await fakeCli({ stdout: [S_TEXT, S_TOOL, S_RESULT, S_AFTER].join("\n") + "\n" });
    const steps: AgentStep[] = [];
    await new ClaudeCliAdapter({ model: "m", bin }).invoke(req({ onStep: (s) => steps.push(s) }));

    expect(steps).toEqual([
      { kind: "text", detail: "Önce dosyayı okuyacağım." },
      { kind: "tool", name: "Read", detail: "/repo/not.txt" },
    ]);
  });

  // İç muhakeme gözlem değil; günlüğü şişirmekten başka bir şey yapmaz.
  it("thinking ve system satırlarını adıma çevirmez", async () => {
    const bin = await fakeCli({ stdout: [S_THINK, S_SYS, S_RESULT].join("\n") + "\n" });
    const steps: AgentStep[] = [];
    await new ClaudeCliAdapter({ model: "m", bin }).invoke(req({ onStep: (s) => steps.push(s) }));
    expect(steps).toEqual([]);
  });

  // "Sonuncusu sonuçtur" varsayımı maliyeti ve ajanın son mesajını
  // sessizce kaybettirirdi: gerçek koşuda result son satır DEĞİL.
  it("sonucu son satırdan değil `type: result` satırından okur", async () => {
    const bin = await fakeCli({ stdout: [S_TOOL, S_RESULT, S_AFTER].join("\n") + "\n" });
    const r = await new ClaudeCliAdapter({ model: "m", bin }).invoke(req({ onStep: () => {} }));

    expect(r.usage).toEqual({ inputTokens: 7, outputTokens: 3, costUsd: 0.02 });
    expect(r.message).toBe("bitti");
    expect(r.exitCode).toBe(0);
  });

  it("akışta hata bildirilirse exitCode 0 olmaz", async () => {
    const err = JSON.stringify({ type: "result", is_error: true, result: "patladı" });
    const bin = await fakeCli({ stdout: `${err}\n` });
    const r = await new ClaudeCliAdapter({ model: "m", bin }).invoke(req({ onStep: () => {} }));
    expect(r.exitCode).toBe(1);
  });

  it("JSON olmayan satır turu bozmaz", async () => {
    const bin = await fakeCli({ stdout: `uyarı: bir şey\n${S_TOOL}\n${S_RESULT}\n` });
    const steps: AgentStep[] = [];
    const r = await new ClaudeCliAdapter({ model: "m", bin }).invoke(req({ onStep: (s) => steps.push(s) }));
    expect(steps).toHaveLength(1);
    expect(r.exitCode).toBe(0);
  });

  // Asıl sınav: adım süreç BİTMEDEN gelmeli. Biriktirip sonunda ayrıştıran
  // bir uygulama yukarıdaki testlerin hepsini geçer, bunu geçemez.
  //
  // Kanıt zamanlamaya değil NEDENSELLİĞE dayanıyor: sahte CLI son satırı
  // yazmadan önce bir dosya bekliyor, o dosyayı ilk adımı gören test yazıyor.
  // Adımlar süreç bittikten sonra yayılsaydı dosya hiç belirmez, süreç 3 ile
  // çıkardı — yavaş bir makinede yanlışlıkla kırmızı yanan bir eşik yok.
  it("adımlar süreç bitmeden gelir", async () => {
    const hold = join(root, "devam-et");
    const bin = await fakeCli({ chunks: [`${S_TOOL}\n`, `${S_RESULT}\n`], holdUntil: hold });
    const steps: AgentStep[] = [];

    const result = await new ClaudeCliAdapter({ model: "m", bin }).invoke(
      req({
        onStep: (s) => {
          steps.push(s);
          void writeFile(hold, "");
        },
      }),
    );

    expect(steps).toHaveLength(1);
    expect(result.exitCode).toBe(0);
    // Sonuç satırı ancak adım görüldükten SONRA yazıldı; yine de okundu.
    expect(result.usage?.costUsd).toBe(0.02);
  });
});
