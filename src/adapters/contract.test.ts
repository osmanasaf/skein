import { describe, expect, it } from "vitest";
import { AdapterRegistry, type Adapter } from "./contract.js";

const fake = (id: string, model: string): Adapter => ({
  id,
  model,
  async invoke() {
    return { exitCode: 0, stdout: "", stderr: "", durationMs: 0 };
  },
});

describe("AdapterRegistry", () => {
  it("kayıtlı adaptörü id ile döndürür", () => {
    const r = new AdapterRegistry().register(fake("claude", "claude-opus-5"));
    expect(r.get("claude").model).toBe("claude-opus-5");
    expect(r.has("claude")).toBe(true);
  });

  it("aynı id iki kez kaydedilemez", () => {
    const r = new AdapterRegistry().register(fake("claude", "m1"));
    expect(() => r.register(fake("claude", "m2"))).toThrow(/zaten kay[ıi]tl[ıi]/i);
  });

  // SCHEMA.md 8. kural: akış yüklenirken bilinmeyen provider akışı hiç başlatmamalı.
  it("bilinmeyen sağlayıcıda kayıtlı olanları listeleyerek hata verir", () => {
    const r = new AdapterRegistry().register(fake("claude", "m")).register(fake("codex", "m"));
    expect(() => r.get("gemini")).toThrow(/gemini/);
    expect(() => r.get("gemini")).toThrow(/claude, codex/);
  });

  it("hiç adaptör yokken de anlamlı hata verir", () => {
    expect(() => new AdapterRegistry().get("claude")).toThrow(/hi[çc]biri/i);
  });

  it("ids sıralı döner", () => {
    const r = new AdapterRegistry().register(fake("codex", "m")).register(fake("claude", "m"));
    expect(r.ids()).toEqual(["claude", "codex"]);
  });
});
