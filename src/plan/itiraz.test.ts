import { describe, expect, it } from "vitest";
import { kanitYolu, kanitYollari, parseItirazlar } from "./itiraz.js";

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

  // 1 Ekim kampanyasının hizalama analizi: iyileşen planlı koşuların
  // hepsinde itiraz `src/selector.ts`'e, iyileşmeyenlerin hepsinde PLANIN
  // KENDİ BELGESİNE işaret etti. Plan belgesi de depoda olduğu için
  // `varMi()` geçiyordu; kuralı asıl taşıyan koşul buydu.
  it("kanıt olarak plan belgesini gösteren itirazı geçersiz sayar", () => {
    const text = ITIRAZ.replace("`src/selector.ts:12`", "`docs/plan/c-1.md:42`");
    const d = parseItirazlar(text, {
      varMi: (yol) => yol === "docs/plan/c-1.md" || varMi(yol),
      kendiBelgeleri: ["docs/plan/c-1.md"],
    });
    expect(d.gecerli).toHaveLength(0);
    expect(d.acik).toHaveLength(0);
    expect(d.itirazlar[0]?.gecersiz).toMatch(/kendi belgesine/);
  });

  it("kanıt olarak bir itiraz dosyasını gösteren itirazı geçersiz sayar", () => {
    const text = ITIRAZ.replace("`src/selector.ts:12`", "`docs/plan/c-1.itiraz.reviewer.md`");
    const d = parseItirazlar(text, {
      varMi: () => true,
      kendiBelgeleri: ["docs/plan/c-1.md", "docs/plan/c-1.itiraz.reviewer.md"],
    });
    expect(d.gecerli).toHaveLength(0);
    expect(d.itirazlar[0]?.gecersiz).toMatch(/kendi belgesine/);
  });

  // Kural yalnızca KENDİ belgelerini kapatıyor; depodaki başka bir belge
  // (ör. bir tasarım notu) hâlâ kanıt olabilir.
  it("alışverişin dışındaki bir belgeyi kanıt saymayı sürdürür", () => {
    const text = ITIRAZ.replace("`src/selector.ts:12`", "`docs/ARCHITECTURE.md:7`");
    const d = parseItirazlar(text, {
      varMi: () => true,
      kendiBelgeleri: ["docs/plan/c-1.md"],
    });
    expect(d.gecerli).toHaveLength(1);
  });

  // 1 Ekim'in İKİNCİ kampanyası bunu canlı çıkardı. Gerçek itiraz kanıtı
  // madde madde yazdı: bir madde plan belgesini, öteki `src/selector.ts`'i
  // gösteriyordu. İlk yola bakan denetim itirazı attı — oysa itiraz tam da
  // istediğimiz şeyi, tüketici modülü, gösteriyordu.
  it("plan belgesinin YANINDA koda da işaret eden itiraz geçerli", () => {
    const text = ITIRAZ.replace(
      "**Neyi yanlışlar:** `src/selector.ts:12` — aynı sürüm için önbellek tazelenmez.",
      "**Neyi yanlışlar:**\n" +
      "- `docs/plan/c-1.md:44` — \"version sayaçları otomatik doğru olur\" yüzeysel.\n" +
      "- `src/selector.ts:10-11` — cache koşulu undo'dan sonra yanlış sonuç verir.",
    );
    const d = parseItirazlar(text, {
      varMi: () => true,
      kendiBelgeleri: ["docs/plan/c-1.md"],
    });
    expect(d.itirazlar[0]?.gecersiz).toBeUndefined();
    expect(d.gecerli).toHaveLength(1);
  });

  it("yolların HEPSİ kendi belgesiyse itiraz düşer", () => {
    const text = ITIRAZ.replace(
      "**Neyi yanlışlar:** `src/selector.ts:12` — aynı sürüm için önbellek tazelenmez.",
      "**Neyi yanlışlar:**\n" +
      "- `docs/plan/c-1.md:44` — plan böyle diyor.\n" +
      "- `docs/plan/c-1.itiraz.reviewer.md:3` — reviewer da böyle demiş.",
    );
    const d = parseItirazlar(text, {
      varMi: () => true,
      kendiBelgeleri: ["docs/plan/c-1.md", "docs/plan/c-1.itiraz.reviewer.md"],
    });
    expect(d.gecerli).toHaveLength(0);
    expect(d.itirazlar[0]?.gecersiz).toMatch(/kendi belgesine/);
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

  // Yalnızca İLK ters tırnağa bakan bir okuyucu, bu satırda `Store.undo()`
  // parçasını yol sanıp itirazı geçersiz sayardı — iyi niyetli bir itiraz
  // biçim yüzünden ölürdü ve kural sonuçlu olduğu için bedeli yüksek.
  it("ilk ters tırnak yol değilse sonrakine bakar", () => {
    expect(kanitYolu("`Store.undo()` — `src/card/store.ts:12`")).toBe("src/card/store.ts");
  });

  it("dizin ayracı taşıyan parçayı da yol sayar", () => {
    expect(kanitYolu("`hub/flows` altındaki örnekler")).toBe("hub/flows");
  });
});

// 6d kampanyasının üçüncü koşusundan: plan yazarı iki itirazı da
// `kabul — Haklı. Plan güncellenmiştir: …` diye yanıtladı ve ayrıştırıcı
// İKİSİNİ DE okunamaz saydı. `kabul` tam eşleşme istiyordu, `ret` ve
// `insana` ise sondaki gerekçeyi kabul ediyordu. Projenin ilk gerçek
// "itiraz açıldı ve kabul edildi" alışverişi böyle kayboldu.
describe("Durum satırı — dört durum da gerekçe alır", () => {
  const ile = (durum: string) => `# İtirazlar

## İtiraz 1 — architect
**Ne:** Replay stratejisi kontratı kırıyor.
**Neden:** Aynı version için farklı nesne döner.
**Neyi yanlışlar:** \`src/store.ts:9\` — değişmez orada yazılı.
**Durum:** ${durum}
`;

  it("`kabul — gerekçe` okunur ve kabul sayılır", () => {
    const d = parseItirazlar(ile("kabul — Haklı. Plan güncellenmiştir: state caching."));
    expect(d.gecerli).toHaveLength(1);
    expect(d.kabul).toHaveLength(1);
    expect(d.itirazlar[0]?.gerekce).toMatch(/^Haklı/);
  });

  it("`kabul: gerekçe` de okunur", () => {
    expect(parseItirazlar(ile("kabul: planı düzelttim")).kabul).toHaveLength(1);
  });

  it("`açık — not` okunur ve açık sayılır", () => {
    const d = parseItirazlar(ile("açık — henüz yanıtlamadım"));
    expect(d.acik).toHaveLength(1);
    expect(d.itirazlar[0]?.gerekce).toBe("henüz yanıtlamadım");
  });

  // Ayraç zorunlu: yalnızca boşluk kabul edilseydi "kabul edilemez"
  // `kabul` diye okunur ve itirazın anlamı TERSİNE dönerdi.
  it("ayraçsız devam eden metin okunamaz sayılır — anlam tersine dönmez", () => {
    const d = parseItirazlar(ile("kabul edilemez"));
    expect(d.gecerli).toHaveLength(0);
    expect(d.itirazlar[0]?.gecersiz).toMatch(/Durum. okunamadı/);
  });

  it("gerekçesiz `ret` hâlâ geçersiz", () => {
    expect(parseItirazlar(ile("ret")).itirazlar[0]?.gecersiz).toMatch(/gerekçesiz olamaz/);
  });
});

describe("kanitYollari", () => {
  it("bütün yolları sırayla verir, sarmalayıcıları atar", () => {
    expect(kanitYollari("- `docs/plan/k.md:44` — şu\n- (`src/a.ts:10-11`) — bu."))
      .toEqual(["docs/plan/k.md", "src/a.ts"]);
  });

  it("aynı yolu iki kez saymaz", () => {
    expect(kanitYollari("`src/a.ts:1` ve src/a.ts:9")).toEqual(["src/a.ts"]);
  });

  it("yol yoksa boş", () => {
    expect(kanitYollari("Satır 47-49 — sıra koruması açık değil.")).toEqual([]);
  });
});
