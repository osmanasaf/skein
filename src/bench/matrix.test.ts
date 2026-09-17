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

  // Gerçek bir koşuda oldu: ajan yukarı çıkıp deponun kendi src/ dizinine
  // yazdı. "Hiçbir dosya yazmadı" teşhisi doğru ama operatörü yanlış yere
  // bakmaya gönderiyordu — ve dosya deponun içinde duruyordu.
  it("hücre dışına yazmayı önce ve açıkça söyler", () => {
    const msg = diagnose(false, [], "src/x.ts", "/repo/src/x.ts");
    expect(msg).toMatch(/DIŞINA/);
    expect(msg).toContain("/repo/src/x.ts");
    expect(msg).not.toMatch(/HİÇBİR dosya/);
  });
});
