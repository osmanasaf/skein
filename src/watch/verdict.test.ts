import { describe, expect, it } from "vitest";
import { parseVerdict } from "./verdict.js";

/**
 * Yükümlülük cevaplarının doğrulanması.
 *
 * Kurallar KATI, çünkü gevşek bir kural denetlenmemiş bir maddeyi
 * denetlenmiş sayar — bu mekanizmanın var olma sebebinin tam tersi.
 */
describe("parseVerdict — yükümlülükler", () => {
  const ok = (ek: string): string => `{"decision": "accept", "summary": "x"${ek}}`;

  it("yükümlülük cevaplarını çözer", () => {
    const r = parseVerdict(ok(
      `, "yukumlulukler": {"architect#1": {"durum": "karsilandi", "not": "selector.ts'e baktım"}}`,
    ));
    expect(r.kind).toBe("ok");
    expect(r.kind === "ok" && r.verdict.yukumlulukler).toEqual({
      "architect#1": { durum: "karsilandi", not: "selector.ts'e baktım" },
    });
  });

  it("alan yoksa verdikt yine geçerli — kapı kartta, burada değil", () => {
    const r = parseVerdict(ok(""));
    expect(r.kind).toBe("ok");
    expect(r.kind === "ok" && r.verdict.yukumlulukler).toBeUndefined();
  });

  it("tanınmayan durumu reddeder", () => {
    const r = parseVerdict(ok(
      `, "yukumlulukler": {"a#1": {"durum": "belki", "not": "n"}}`,
    ));
    expect(r.kind).toBe("invalid");
    expect(r.kind === "invalid" && r.problem).toMatch(/durum.*karsilandi/s);
  });

  // "Karşılandı" tek başına kanıt değil: neye bakıldığı yazılmazsa
  // yükümlülük denetimi bir onay kutusuna iner.
  it("boş `not` ile karşılandı demeyi reddeder", () => {
    const r = parseVerdict(ok(
      `, "yukumlulukler": {"a#1": {"durum": "karsilandi", "not": "   "}}`,
    ));
    expect(r.kind).toBe("invalid");
    expect(r.kind === "invalid" && r.problem).toMatch(/not.*boş olamaz/s);
  });

  it("eşleme olmayan yükümlülük alanını reddeder", () => {
    expect(parseVerdict(ok(`, "yukumlulukler": []`)).kind).toBe("invalid");
    expect(parseVerdict(ok(`, "yukumlulukler": {"a#1": "karsilandi"}`)).kind).toBe("invalid");
  });

  // Eski verdiktler alan olmadan yazılmıştı; biçim geriye dönük uyumlu
  // kalmak zorunda, yoksa kapı açılmadan bütün akışlar düşer.
  it("eski biçim bozulmadı", () => {
    expect(parseVerdict('{"decision": "reject", "reason": "kusur"}').kind).toBe("ok");
    expect(parseVerdict('{"decision": "reject"}').kind).toBe("invalid");
  });
});
