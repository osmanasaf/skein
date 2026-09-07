import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeCliAdapter } from "./claude.js";
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
    expect(args.join(" ")).toContain("--permission-mode acceptEdits");
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

  it("taskText'i stdin'den geçirir", async () => {
    const out = join(root, "stdin.txt");
    const bin = await fakeCli({ stdinTo: out, stdout: OK });
    await new ClaudeCliAdapter({ model: "m", bin }).invoke(req({ taskText: "MERHABA" }));
    expect(await readFile(out, "utf8")).toBe("MERHABA");
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
