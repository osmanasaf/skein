import { describe, expect, it } from "vitest";
import { applyVerdicts, extractJson, JudgeError, quoteFound, scrubIdentity } from "./judge.js";

describe("scrubIdentity", () => {
  it("model ve satıcı adlarını maskeler", () => {
    const r = scrubIdentity("Claude olarak inceledim; GPT-5.5 de aynısını derdi.");
    expect(r.text).not.toMatch(/claude/i);
    expect(r.text).not.toMatch(/gpt/i);
    expect(r.count).toBe(2);
  });

  // Hakem kimliği görürse puanlama artık kör değil: "çapraz hücre" etiketi
  // rapordan okunabilir hale gelir ve ölçtüğümüz şey hakemin model
  // tercihine dönüşür.
  it("kimlik sızmayan raporu değiştirmez", () => {
    const text = "parse('') boş dizi dönüyor, oysa [['']] dönmeli.";
    expect(scrubIdentity(text)).toEqual({ text, count: 0 });
  });
});

describe("quoteFound", () => {
  const report = "Kusur:  retry()\n  son denemeden sonra da bekliyor.";

  it("boşluk ve satır sonu farkını yok sayar", () => {
    expect(quoteFound(report, "retry() son denemeden sonra da bekliyor")).toBe(true);
  });

  it("raporda olmayan alıntıyı reddeder", () => {
    expect(quoteFound(report, "limit sıfırsa sonsuza kadar döner")).toBe(false);
  });

  // "null", "the", "hata" gibi alıntılar her raporda bulunur; kanıt
  // sayılsalardı doğrulama kendi kendini geçersiz kılardı.
  it("çok kısa alıntıyı kanıt saymaz", () => {
    expect(quoteFound(report, "retry()")).toBe(false);
  });
});

describe("extractJson", () => {
  it("çıplak diziyi okur", () => {
    expect(extractJson('[{"no":1,"yakalandi":true}]')).toHaveLength(1);
  });

  it("kod çiti ve açıklama cümlesi arasından diziyi çıkarır", () => {
    const raw = 'İşte değerlendirmem:\n```json\n[{"no":1,"yakalandi":false}]\n```\nUmarım yardımcı olur.';
    expect(extractJson(raw)).toEqual([{ no: 1, yakalandi: false }]);
  });

  it("JSON yoksa açık hata atar", () => {
    expect(() => extractJson("Rapor iyi görünüyor.")).toThrow(JudgeError);
  });
});

describe("applyVerdicts", () => {
  const hooks = ["son denemeden sonra bekler", "limit sıfırsa hata atmaz"];
  const report = "Birinci kusur: fonksiyon son denemeden sonra da bekliyor, bu bir gecikme israfı.";

  it("alıntı doğrulanırsa yakalama sayılır", () => {
    const v = applyVerdicts(hooks, [
      { no: 1, yakalandi: true, alinti: "son denemeden sonra da bekliyor" },
      { no: 2, yakalandi: false },
    ], report);
    expect(v[0]?.caught).toBe(true);
    expect(v[1]?.caught).toBe(false);
  });

  // Hakeme güvenmek yerine hakemi doğruluyoruz: raporda olmayan bir cümleyi
  // kanıt diye sunan karar, yakalama sayılmaz ve ayrıca işaretlenir.
  it("uydurulmuş alıntı yakalama sayılmaz ve işaretlenir", () => {
    const v = applyVerdicts(hooks, [
      { no: 1, yakalandi: true, alinti: "raporda böyle bir cümle hiç geçmiyor" },
    ], report);
    expect(v[0]?.caught).toBe(false);
    expect(v[0]?.unverified).toBe(true);
  });

  it("alıntısız yakalama iddiası da sayılmaz", () => {
    const v = applyVerdicts(hooks, [{ no: 1, yakalandi: true }], report);
    expect(v[0]?.caught).toBe(false);
    expect(v[0]?.unverified).toBe(true);
  });

  // Eksik karar, kaçırma demektir: hakem bir kusur hakkında hiçbir şey
  // söylemediyse, raporda bulunduğuna dair kanıt yok.
  it("hakem bir kancayı hiç değerlendirmezse kaçırma sayılır", () => {
    const v = applyVerdicts(hooks, [{ no: 1, yakalandi: true, alinti: "son denemeden sonra da bekliyor" }], report);
    expect(v).toHaveLength(2);
    expect(v[1]?.caught).toBe(false);
  });

  it("numara verilmezse sıra takip edilir", () => {
    const v = applyVerdicts(hooks, [{ yakalandi: false }, { yakalandi: false }], report);
    expect(v.map((x) => x.hook)).toEqual(hooks);
  });
});
