import { describe, expect, it } from "vitest";
import { diagnose } from "./matrix.js";

describe("diagnose", () => {
  it("hiç dosya yazılmadıysa izin/çağrı sorununu işaret eder", () => {
    expect(diagnose(false, [], "src/x.ts")).toMatch(/HİÇBİR dosya/);
  });

  it("yanlış dosya yazıldıysa beklenen ve yazılanı söyler", () => {
    const msg = diagnose(false, ["src/other.ts"], "src/x.ts");
    expect(msg).toContain("src/x.ts");
    expect(msg).toContain("src/other.ts");
  });

  it("doğru dosya yazıldıysa derleme sorununa işaret eder", () => {
    expect(diagnose(true, ["src/x.ts"], "src/x.ts")).toMatch(/derlenmiyor/);
  });
});
