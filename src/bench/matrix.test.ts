import { describe, expect, it } from "vitest";
import { diagnose, matrixSkip, type ProducerSummary } from "./matrix.js";

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

// Denetim hücreleri pahalı: karar üretimden SONRA, denetimden ÖNCE veriliyor.
// En pahalı yanılgı çökmüş üretimdi — `kalibre2x2` ilk koşuldugunda üretim
// exit 1 verdi, artefakt boş kaldı, 23 kanca kırmızı düştü ve denetim yine
// koştu. Çöp artefakt "ölçüm gücü en yüksek hücre" gibi görünüyordu.
describe("matrixSkip", () => {
  const u = (over: Partial<ProducerSummary> = {}): ProducerSummary =>
    ({ model: "m", ran: true, exitCode: 0, redHooks: ["k1"], ...over });

  it("iki koşul da sağlamsa denetim koşar", () => {
    expect(matrixSkip([u(), u({ model: "m2" })])).toBeUndefined();
  });

  it("üretim çöktüyse DURDURUR ve parayı anar", () => {
    const r = matrixSkip([u(), u({ model: "m2", exitCode: 1 })]);
    expect(r).toMatch(/ÜRETİM ÇÖKTÜ/);
    expect(r).toMatch(/m2 \(exit 1\)/);
    expect(r).toMatch(/parayı çöpe atar/);
  });

  // Sıra önemli: çökmüş üretimin kırmızı kancaları "kusur var" gibi görünür.
  it("çökmüş üretimde kırmızı kanca VARSA da durdurur", () => {
    expect(matrixSkip([u({ exitCode: 1, redHooks: ["k1", "k2", "k3"] })]))
      .toMatch(/ÜRETİM ÇÖKTÜ/);
  });

  it("süit koşmadıysa 'kusur yok' demediğini söyler", () => {
    const r = matrixSkip([u({ ran: false, redHooks: [] })]);
    expect(r).toMatch(/ÖLÇÜLEMEDİ/);
    expect(r).toMatch(/"kusur yok" DEĞİLDİR/);
  });

  it("hiçbir üreticide kusur yoksa ölçüm gücü yok der", () => {
    expect(matrixSkip([u({ redHooks: [] }), u({ model: "m2", redHooks: [] })]))
      .toMatch(/Ölçüm gücü yok/);
  });

  // Tek üreticide kusur varsa matris anlamlı: o artefakt üzerinde denetçiler
  // karşılaştırılabilir.
  it("tek üreticide kusur varsa koşar", () => {
    expect(matrixSkip([u({ redHooks: [] }), u({ model: "m2", redHooks: ["k1"] })]))
      .toBeUndefined();
  });
});
