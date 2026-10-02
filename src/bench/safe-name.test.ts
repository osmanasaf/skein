import { describe, expect, it } from "vitest";
import { safeName } from "./safe-name.js";

describe("safeName", () => {
  // Asıl sebep: `codex:gpt-5.5` hücre dizini adına giriyor ve iki nokta
  // Windows'ta geçersiz yol karakteri.
  it("iki noktayı temizler — Windows'ta yol karakteri değil", () => {
    expect(safeName("codex:gpt-5.5")).toBe("codex_gpt-5.5");
  });

  it("nokta, alt çizgi ve tireyi KORUR — model adları bunları taşıyor", () => {
    expect(safeName("claude-haiku-4-5-20251001")).toBe("claude-haiku-4-5-20251001");
    expect(safeName("gpt-5.5")).toBe("gpt-5.5");
  });

  it("yol ayraçlarını temizler — dizinden dışarı çıkılamaz", () => {
    expect(safeName("../../etc/passwd")).toBe(".._.._etc_passwd");
    expect(safeName("a\\b")).toBe("a_b");
  });

  it("boşluk ve yıldızı temizler", () => {
    expect(safeName("bir model *")).toBe("bir_model__");
  });
});
