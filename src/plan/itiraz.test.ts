import { describe, expect, it } from "vitest";
import { kanitYolu, parseItirazlar } from "./itiraz.js";

const ITIRAZ = `# İtirazlar — c-1

## İtiraz 1 — architect
**Ne:** Plan, \`Store.undo()\`'yu geçmişi baştan oynatarak kuruyor.
**Neden:** \`src/selector.ts\` türetilmiş hesapları \`version\`a göre önbellekliyor;
baştan oynatma sürümü geriye düşürür.
**Neyi yanlışlar:** \`src/selector.ts:12\` — aynı sürüm için önbellek tazelenmez.
**Durum:** açık
`;

const varMi = (yol: string): boolean => yol === "src/selector.ts";

describe("parseItirazlar", () => {
  it("dört alanı ve rolü okur", () => {
    const d = parseItirazlar(ITIRAZ, { varMi });
    expect(d.gecerli).toHaveLength(1);
    const i = d.gecerli[0];
    expect(i?.no).toBe(1);
    expect(i?.role).toBe("architect");
    expect(i?.durum).toBe("acik");
    expect(i?.neden).toContain("önbellekliyor");
    expect(d.acik).toHaveLength(1);
  });

  it("çok satırlı alanı birleştirir", () => {
    const d = parseItirazlar(ITIRAZ, { varMi });
    expect(d.gecerli[0]?.neden).toMatch(/baştan oynatma sürümü geriye düşürür/);
  });

  it("kabul ve ret durumlarını ayırır", () => {
    const text = ITIRAZ.replace("**Durum:** açık", "**Durum:** kabul") +
      `
## İtiraz 2 — architect
**Ne:** İkinci itiraz.
**Neden:** Gerekçe.
**Neyi yanlışlar:** \`src/selector.ts\`
**Durum:** ret: ölçüm bunu göstermiyor
`;
    const d = parseItirazlar(text, { varMi });
    expect(d.kabul).toHaveLength(1);
    expect(d.acik).toHaveLength(0);
    expect(d.gecerli[1]?.durum).toBe("ret");
    expect(d.gecerli[1]?.gerekce).toBe("ölçüm bunu göstermiyor");
  });

  it("insana çıkan itirazı ayrı sayar", () => {
    const text = ITIRAZ.replace("**Durum:** açık", "**Durum:** insana: bu bir değer kararı");
    const d = parseItirazlar(text, { varMi });
    expect(d.insana).toHaveLength(1);
    expect(d.insana[0]?.gerekce).toBe("bu bir değer kararı");
  });

  // "ret" ve "insana" kararlarının bedeli var; gerekçesiz olamazlar.
  it("gerekçesiz reddi geçersiz sayar", () => {
    const text = ITIRAZ.replace("**Durum:** açık", "**Durum:** ret");
    const d = parseItirazlar(text, { varMi });
    expect(d.gecerli).toHaveLength(0);
    expect(d.itirazlar[0]?.gecersiz).toMatch(/gerekçesiz/);
  });

  it("eksik alanlı itirazı geçersiz sayar", () => {
    const text = `## İtiraz 1 — architect\n**Ne:** Bir şey yanlış.\n**Durum:** açık\n`;
    const d = parseItirazlar(text, { varMi });
    expect(d.gecerli).toHaveLength(0);
    expect(d.itirazlar[0]?.gecersiz).toMatch(/eksik alan: Neden, Neyi yanlışlar/);
  });

  // Tasarımın en keskin kuralı: genel öğüt makineyle elenir.
  it("depoda olmayan yola işaret eden itirazı geçersiz sayar", () => {
    const text = ITIRAZ.replace("`src/selector.ts:12`", "`src/olmayan.ts:3`");
    const d = parseItirazlar(text, { varMi });
    expect(d.gecerli).toHaveLength(0);
    expect(d.acik).toHaveLength(0);
    expect(d.itirazlar[0]?.gecersiz).toMatch(/depoda olmayan/);
  });

  it("hiç yol içermeyen kanıtı geçersiz sayar", () => {
    const text = ITIRAZ.replace("**Neyi yanlışlar:** `src/selector.ts:12` — aynı sürüm için önbellek tazelenmez.",
      "**Neyi yanlışlar:** Sınır durumlarına dikkat edilmeli.");
    const d = parseItirazlar(text, { varMi });
    expect(d.gecerli).toHaveLength(0);
    expect(d.itirazlar[0]?.gecersiz).toMatch(/dosya yolu içermiyor/);
  });

  it("boş dosyada itiraz yok", () => {
    const d = parseItirazlar("# İtirazlar\n\nBu turda itirazım yok.\n", { varMi });
    expect(d.itirazlar).toHaveLength(0);
    expect(d.acik).toHaveLength(0);
  });

  it("yol denetimi verilmezse kanıtı olduğu gibi kabul eder", () => {
    const d = parseItirazlar(ITIRAZ);
    expect(d.gecerli).toHaveLength(1);
  });
});

describe("kanitYolu", () => {
  it("backtick içindeki yolu alır ve satır numarasını atar", () => {
    expect(kanitYolu("`src/ui/model.ts:42` — burada")).toBe("src/ui/model.ts");
  });

  it("backtick yoksa uzantılı kelimeyi bulur", () => {
    expect(kanitYolu("bkz. src/flow/load.ts satır 12")).toBe("src/flow/load.ts");
  });

  it("yol yoksa null döner", () => {
    expect(kanitYolu("genel olarak hata yönetimi zayıf")).toBeNull();
  });
});
