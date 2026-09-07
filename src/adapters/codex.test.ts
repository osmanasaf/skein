import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexCliAdapter, bestEffortUsage } from "./codex.js";
import { makeFakeCli, type FakeCliSpec } from "../testing/fake-cli.js";

let root: string;
const fakeCli = (spec: FakeCliSpec) => makeFakeCli(root, spec);
const req = () => ({
  workdir: root, promptFile: join(root, "prompt.md"),
  taskText: "GOREV METNI", timeoutMs: 10_000,
});

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-codex-"));
  await writeFile(join(root, "prompt.md"), "ROL PROMPTU");
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("CodexCliAdapter", () => {
  it("model pinlenmiş, id değiştirilebilir", () => {
    expect(new CodexCliAdapter({ model: "gpt-5.5" }).id).toBe("codex");
    expect(new CodexCliAdapter({ model: "gpt-5.5", id: "gpt" }).id).toBe("gpt");
  });

  it("model yer tutucusunu doldurur", () => {
    const a = new CodexCliAdapter({ model: "gpt-5.5" });
    expect(a.argsFor(req())).toContain("gpt-5.5");
  });

  // Bayraklar doğrulanmadığı için TypeScript'e dokunmadan değiştirilebilmeli.
  it("argsTemplate ile bayraklar tamamen değiştirilebilir", () => {
    const a = new CodexCliAdapter({
      model: "m", argsTemplate: ["run", "--mdl", "{model}", "--sys", "{promptFile}"],
    });
    expect(a.argsFor(req())).toEqual(["run", "--mdl", "m", "--sys", join(root, "prompt.md")]);
  });

  it("rol promptunu ve görev metnini stdin'den geçirir", async () => {
    const out = join(root, "stdin.txt");
    const bin = await fakeCli({ stdinTo: out });
    await new CodexCliAdapter({ model: "m", bin }).invoke(req());
    const seen = await readFile(out, "utf8");
    expect(seen).toContain("ROL PROMPTU");
    expect(seen).toContain("GOREV METNI");
  });

  it("çıkış kodunu ve stderr'i taşır", async () => {
    const bin = await fakeCli({ stderr: "hata", exit: 4 });
    const r = await new CodexCliAdapter({ model: "m", bin }).invoke(req());
    expect(r.exitCode).toBe(4);
    expect(r.stderr).toContain("hata");
  });

  it("ikili yoksa anlamlı hata döndürür, atmaz", async () => {
    const r = await new CodexCliAdapter({ model: "m", bin: "/yok/codex" }).invoke(req());
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/çalıştırılamadı/);
  });

  it("timeout'ta süreci öldürür", async () => {
    const bin = await fakeCli({ sleepMs: 30_000 });
    const r = await new CodexCliAdapter({ model: "m", bin }).invoke({ ...req(), timeoutMs: 300 });
    expect(r.timedOut).toBe(true);
  });
});

describe("bestEffortUsage", () => {
  it("openai adlandırmasını tanır", () => {
    expect(bestEffortUsage('{"usage":{"prompt_tokens":12,"completion_tokens":3}}'))
      .toEqual({ inputTokens: 12, outputTokens: 3 });
  });

  it("anthropic adlandırmasını da tanır", () => {
    expect(bestEffortUsage('{"input_tokens":5,"output_tokens":2}'))
      .toEqual({ inputTokens: 5, outputTokens: 2 });
  });

  // Biçim tanınmazsa deney yine çalışmalı: ölçüm gizli kancalardan geliyor.
  it("tanımadığı biçimde sessizce vazgeçer", () => {
    expect(bestEffortUsage("düz metin çıktı")).toBeUndefined();
    expect(bestEffortUsage("")).toBeUndefined();
  });

  it("JSONL içinde son geçerli sayımı alır", () => {
    expect(bestEffortUsage('{"a":1}\nsatır\n{"input_tokens":9,"output_tokens":1}'))
      .toEqual({ inputTokens: 9, outputTokens: 1 });
  });
});
