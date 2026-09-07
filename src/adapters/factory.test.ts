import { describe, expect, it } from "vitest";
import { adapterFor, parseModelSpec } from "./factory.js";

describe("parseModelSpec", () => {
  it("sağlayıcı ve modeli ayırır", () => {
    expect(parseModelSpec("codex:gpt-5.5")).toEqual({ provider: "codex", model: "gpt-5.5" });
  });

  it("sağlayıcı yazılmazsa claude varsayar", () => {
    expect(parseModelSpec("claude-opus-5")).toEqual({ provider: "claude", model: "claude-opus-5" });
  });

  it("boş parçalı tanımı reddeder", () => {
    expect(() => parseModelSpec("codex:")).toThrow(/Geçersiz/);
    expect(() => parseModelSpec(":m")).toThrow(/Geçersiz/);
  });
});

describe("adapterFor", () => {
  it("her iki sağlayıcıyı da kurar", () => {
    expect(adapterFor("claude:claude-opus-5").model).toBe("claude-opus-5");
    expect(adapterFor("codex:gpt-5.5").model).toBe("gpt-5.5");
  });

  // 2x2'nin hücreleri model düzeyinde ayrışmalı, yoksa iki köşe aynı id'yi taşır.
  it("id model tanımının tamamı olur", () => {
    expect(adapterFor("claude:claude-opus-5").id).toBe("claude:claude-opus-5");
    expect(adapterFor("claude:claude-sonnet-5").id).not.toBe(adapterFor("claude:claude-opus-5").id);
  });

  it("bilinmeyen sağlayıcıda kayıtlıları listeler", () => {
    expect(() => adapterFor("gemini:x")).toThrow(/claude, codex/);
  });
});
