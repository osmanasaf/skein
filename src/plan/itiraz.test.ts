import { describe, expect, it } from "vitest";
import { evidencePath, evidencePaths, parseObjections } from "./itiraz.js";

const OBJECTION = `# İtirazlar — c-1

## İtiraz 1 — architect
**Ne:** Plan, \`Store.undo()\`'yu geçmişi baştan oynatarak kuruyor.
**Neden:** \`src/selector.ts\` türetilmiş hesapları \`version\`a göre önbellekliyor;
baştan oynatma sürümü geriye düşürür.
**Neyi yanlışlar:** \`src/selector.ts:12\` — aynı sürüm için önbellek tazelenmez.
**Durum:** açık
`;

const present = (path: string): boolean => path === "src/selector.ts";

// CANLI KOŞUDA ÖLÇÜLEN KUSUR. Bir rol biçime uygun bir itiraz yazdı,
// `**Durum:** açık` koydu ve ardından `## Kontrol ettiklerim` diye serbest
// bir bölüm açtı. Başlık alan saymadığı için bütün bölüm `Durum` değerinin
// içine aktı ve itiraz ELENDİ — elenen şey gerçek bir kusurun doğru
// teşhisiydi. Biçimin sonlandırıcısı yoktu.
/**
 * BİÇİM TOLERANSI — ölçülmüş kusurlardan sonra.
 *
 * Biçim bu projede DÖRT kez gerçek bir itirazı yedi: kanıtta yol
 * göstermemek, kanıtın kendi belgesini göstermesi, sonlandırıcı eksikliği,
 * ve buradaki üç yazım. Biçim pazarlık konusu değil ama biçimin TUZAKLARI
 * ölçümün kendi kusuru.
 *
 * Gevşetmenin sınırı da sınanıyor: `kabul edilemez` HÂLÂ elenmeli, yoksa
 * ters yönde bir kusur üretmiş olurduk.
 */
describe("biçim toleransı", () => {
  const body = (durum: string, title = "## İtiraz 1 — architect", field = "**Ne:** ") => `${title}
${field}Sürüm geriye düşüyor.
**Neden:** Tüketici önbelleği bozulur.
**Neyi yanlışlar:** \`src/a.ts:1\` — orada.
**Durum:** ${durum}
`;
  const resolve = (textBody: string) => parseObjections(textBody, { present: () => true });

  // `**Durum:** kabul.` geçersiz sayılıyordu ve bedeli kaskad: kabul
  // sayımdan düşüyor, "kabul etti ama planı değiştirmedi" kapısı
  // ateşlenmiyor, tur "anlaşma" sayılıyor, yükümlülükler karta yazılmıyor.
  it.each(["kabul", "kabul.", "kabul: tamam", "kabul (plan güncellendi)", "kabul — tamam"])(
    "kabul kuyruğu okunur: %s",
    (durum) => {
      const d = resolve(body(durum));
      expect(d.valid).toHaveLength(1);
      expect(d.acceptance).toHaveLength(1);
    },
  );

  it.each(["açık", "açık.", "Açık", "açık — not"])("açık kuyruğu okunur: %s", (durum) => {
    expect(resolve(body(durum)).isOpen).toHaveLength(1);
  });

  // GEVŞETMENİN SINIRI. Ayraç zorunluluğu `kabul edilemez`i elemek için
  // vardı ve o gerekçe duruyor: harfle başlayan kuyruk belirsizdir.
  it.each(["kabul edilemez", "açıkça yanlış", "retrospektif", "insanlar"])(
    "harfle devam eden kuyruk hâlâ elenir: %s",
    (durum) => {
      const d = resolve(body(durum));
      expect(d.valid).toHaveLength(0);
      expect(d.objectionList[0]?.invalid).toMatch(/Durum/);
    },
  );

  it.each([
    "## İtiraz 1 — architect",
    "## İtiraz 1",
    "## İtiraz 1: architect",
    "### İtiraz 1 — architect",
    "## İtiraz 1 architect",
  ])("başlık yazımı okunur: %s", (title) => {
    expect(resolve(body("açık", title)).valid).toHaveLength(1);
  });

  it.each(["- **Ne:** ", "* **Ne:** ", "**Ne**: "])("alan satırı yazımı okunur: %s", (field) => {
    expect(resolve(body("açık", "## İtiraz 1 — architect", field)).valid).toHaveLength(1);
  });

  // İki nokta HÂLÂ zorunlu: olmasa düz bir kalın satır alan sanılırdı.
  it("iki noktasız kalın satır alan sayılmaz", () => {
    const d = resolve(`## İtiraz 1 — architect
**Ne** Sürüm geriye düşüyor.
**Neden:** y
**Neyi yanlışlar:** \`src/a.ts:1\` — z
**Durum:** açık
`);
    expect(d.valid).toHaveLength(0);
    expect(d.objectionList[0]?.invalid).toMatch(/eksik alan/);
  });

  // EN KÖTÜ TÜR: sessiz kayıp. Okunamayan başlık önceki itirazın gövdesine
  // akıyor ve ALANLARINI EZİYORDU — iki itiraz bire düşüyor, `invalid`
  // sayacı 0 kalıyor, "yeni itiraz yok → anlaşma" dalı ateşlenebiliyor.
  it("okunamayan başlık SESSİZ kaybolmuyor, geçersiz sayılıyor", () => {
    const d = resolve(`# İtirazlar — c-1

## İtiraz 1 — architect
**Ne:** birinci
**Neden:** y
**Neyi yanlışlar:** \`src/a.ts:1\` — z
**Durum:** açık

## İtiraz 2'nin devamı
**Ne:** ikinci
**Neden:** y
**Neyi yanlışlar:** \`src/a.ts:2\` — z
**Durum:** açık
`);
    // Birinci itiraz AYAKTA: ikinci başlık onun alanlarını ezmiyor.
    expect(d.objectionList.some((i) => i.ne === "birinci" && i.invalid === undefined)).toBe(true);
    // Ve okunamayan başlık GÖRÜNÜR: geçersiz sayılıyor, yani `invalid` sayacı dolu.
    const sayilmayan = d.objectionList.filter((i) => i.invalid !== undefined);
    expect(sayilmayan).toHaveLength(1);
    expect(sayilmayan[0]?.invalid).toMatch(/başlığı okunamadı/);
  });

  // Dosyanın kendi başlığı itiraz başlığı DEĞİL. İlk yazımda bu daraltma
  // yoktu ve `# İtirazlar — c-1` geçersiz itiraz sayılıyordu.
  it("dosya başlığı geçersiz itiraz sayılmaz", () => {
    const d = resolve(`# İtirazlar — c-1

Bu turda itirazım yok.
`);
    expect(d.objectionList).toHaveLength(0);
  });
});

describe("alanlar — başlık bloğu bitirir", () => {
  const BODY = `## İtiraz 1 — architect
**Ne:** Üretimde \`karsilanmadi\` hiç yazılmıyor.
**Neden:** Kapı yazımdan önce escalate ediyor.
**Neyi yanlışlar:** \`src/watch/tick.ts:332\` — yazım döngüsü kapının arkasında.
**Durum:** açık

## Kontrol ettiklerim (bu tur)
- \`src/bench/planeffect.ts:116-173\` plan metniyle örtüşüyor.
- \`src/events/log.ts:210-219\` şema birebir.
`;

  it("başlıktan sonraki serbest bölüm `Durum`u yemiyor", () => {
    const d = parseObjections(BODY, { present: () => true });
    expect(d.objectionList).toHaveLength(1);
    expect(d.objectionList[0]?.invalid).toBeUndefined();
    expect(d.objectionList[0]?.durum).toBe("acik");
    expect(d.valid).toHaveLength(1);
  });

  // Alanların çok satırlı olması KASITLI: `Neyi yanlışlar` madde madde
  // yazılabiliyor. Çare alanları tek satıra indirmek değildi.
  it("çok satırlı alan hâlâ toplanıyor", () => {
    const d = parseObjections(`## İtiraz 1 — x
**Ne:** bir
iki
**Neden:** üç
**Neyi yanlışlar:** \`src/a.ts:1\` — dört
beş
**Durum:** açık
`, { present: () => true });
    expect(d.objectionList[0]?.ne).toBe("bir iki");
    expect(d.objectionList[0]?.kanit).toContain("dört beş");
  });
});

describe("parseItirazlar", () => {
  it("dört alanı ve rolü okur", () => {
    const d = parseObjections(OBJECTION, { present });
    expect(d.valid).toHaveLength(1);
    const i = d.valid[0];
    expect(i?.no).toBe(1);
    expect(i?.role).toBe("architect");
    expect(i?.durum).toBe("acik");
    expect(i?.reason).toContain("önbellekliyor");
    expect(d.isOpen).toHaveLength(1);
  });

  it("çok satırlı alanı birleştirir", () => {
    const d = parseObjections(OBJECTION, { present });
    expect(d.valid[0]?.reason).toMatch(/baştan oynatma sürümü geriye düşürür/);
  });

  it("kabul ve ret durumlarını ayırır", () => {
    const text = OBJECTION.replace("**Durum:** açık", "**Durum:** kabul") +
      `
## İtiraz 2 — architect
**Ne:** İkinci itiraz.
**Neden:** Gerekçe.
**Neyi yanlışlar:** \`src/selector.ts\`
**Durum:** ret: ölçüm bunu göstermiyor
`;
    const d = parseObjections(text, { present });
    expect(d.acceptance).toHaveLength(1);
    expect(d.isOpen).toHaveLength(0);
    expect(d.valid[1]?.durum).toBe("ret");
    expect(d.valid[1]?.rationale).toBe("ölçüm bunu göstermiyor");
  });

  it("insana çıkan itirazı ayrı sayar", () => {
    const text = OBJECTION.replace("**Durum:** açık", "**Durum:** insana: bu bir değer kararı");
    const d = parseObjections(text, { present });
    expect(d.toHuman).toHaveLength(1);
    expect(d.toHuman[0]?.rationale).toBe("bu bir değer kararı");
  });

  // "ret" ve "insana" kararlarının bedeli var; gerekçesiz olamazlar.
  it("gerekçesiz reddi geçersiz sayar", () => {
    const text = OBJECTION.replace("**Durum:** açık", "**Durum:** ret");
    const d = parseObjections(text, { present });
    expect(d.valid).toHaveLength(0);
    expect(d.objectionList[0]?.invalid).toMatch(/gerekçesiz/);
  });

  it("eksik alanlı itirazı geçersiz sayar", () => {
    const text = `## İtiraz 1 — architect\n**Ne:** Bir şey yanlış.\n**Durum:** açık\n`;
    const d = parseObjections(text, { present });
    expect(d.valid).toHaveLength(0);
    expect(d.objectionList[0]?.invalid).toMatch(/eksik alan: Neden, Neyi yanlışlar/);
  });

  // Tasarımın en keskin kuralı: genel öğüt makineyle elenir.
  it("depoda olmayan yola işaret eden itirazı geçersiz sayar", () => {
    const text = OBJECTION.replace("`src/selector.ts:12`", "`src/olmayan.ts:3`");
    const d = parseObjections(text, { present });
    expect(d.valid).toHaveLength(0);
    expect(d.isOpen).toHaveLength(0);
    expect(d.objectionList[0]?.invalid).toMatch(/depoda olmayan/);
  });

  it("hiç yol içermeyen kanıtı geçersiz sayar", () => {
    const text = OBJECTION.replace("**Neyi yanlışlar:** `src/selector.ts:12` — aynı sürüm için önbellek tazelenmez.",
      "**Neyi yanlışlar:** Sınır durumlarına dikkat edilmeli.");
    const d = parseObjections(text, { present });
    expect(d.valid).toHaveLength(0);
    expect(d.objectionList[0]?.invalid).toMatch(/dosya yolu içermiyor/);
  });

  // 1 Ekim kampanyasının hizalama analizi: iyileşen planlı koşuların
  // hepsinde itiraz `src/selector.ts`'e, iyileşmeyenlerin hepsinde PLANIN
  // KENDİ BELGESİNE işaret etti. Plan belgesi de depoda olduğu için
  // `varMi()` geçiyordu; kuralı asıl taşıyan koşul buydu.
  it("kanıt olarak plan belgesini gösteren itirazı geçersiz sayar", () => {
    const text = OBJECTION.replace("`src/selector.ts:12`", "`docs/plan/c-1.md:42`");
    const d = parseObjections(text, {
      present: (path) => path === "docs/plan/c-1.md" || present(path),
      ownDocs: ["docs/plan/c-1.md"],
    });
    expect(d.valid).toHaveLength(0);
    expect(d.isOpen).toHaveLength(0);
    expect(d.objectionList[0]?.invalid).toMatch(/kendi belgesine/);
  });

  it("kanıt olarak bir itiraz dosyasını gösteren itirazı geçersiz sayar", () => {
    const text = OBJECTION.replace("`src/selector.ts:12`", "`docs/plan/c-1.itiraz.reviewer.md`");
    const d = parseObjections(text, {
      present: () => true,
      ownDocs: ["docs/plan/c-1.md", "docs/plan/c-1.itiraz.reviewer.md"],
    });
    expect(d.valid).toHaveLength(0);
    expect(d.objectionList[0]?.invalid).toMatch(/kendi belgesine/);
  });

  // Kural yalnızca KENDİ belgelerini kapatıyor; depodaki başka bir belge
  // (ör. bir tasarım notu) hâlâ kanıt olabilir.
  it("alışverişin dışındaki bir belgeyi kanıt saymayı sürdürür", () => {
    const text = OBJECTION.replace("`src/selector.ts:12`", "`docs/ARCHITECTURE.md:7`");
    const d = parseObjections(text, {
      present: () => true,
      ownDocs: ["docs/plan/c-1.md"],
    });
    expect(d.valid).toHaveLength(1);
  });

  // 1 Ekim'in İKİNCİ kampanyası bunu canlı çıkardı. Gerçek itiraz kanıtı
  // madde madde yazdı: bir madde plan belgesini, öteki `src/selector.ts`'i
  // gösteriyordu. İlk yola bakan denetim itirazı attı — oysa itiraz tam da
  // istediğimiz şeyi, tüketici modülü, gösteriyordu.
  it("plan belgesinin YANINDA koda da işaret eden itiraz geçerli", () => {
    const text = OBJECTION.replace(
      "**Neyi yanlışlar:** `src/selector.ts:12` — aynı sürüm için önbellek tazelenmez.",
      "**Neyi yanlışlar:**\n" +
      "- `docs/plan/c-1.md:44` — \"version sayaçları otomatik doğru olur\" yüzeysel.\n" +
      "- `src/selector.ts:10-11` — cache koşulu undo'dan sonra yanlış sonuç verir.",
    );
    const d = parseObjections(text, {
      present: () => true,
      ownDocs: ["docs/plan/c-1.md"],
    });
    expect(d.objectionList[0]?.invalid).toBeUndefined();
    expect(d.valid).toHaveLength(1);
  });

  it("yolların HEPSİ kendi belgesiyse itiraz düşer", () => {
    const text = OBJECTION.replace(
      "**Neyi yanlışlar:** `src/selector.ts:12` — aynı sürüm için önbellek tazelenmez.",
      "**Neyi yanlışlar:**\n" +
      "- `docs/plan/c-1.md:44` — plan böyle diyor.\n" +
      "- `docs/plan/c-1.itiraz.reviewer.md:3` — reviewer da böyle demiş.",
    );
    const d = parseObjections(text, {
      present: () => true,
      ownDocs: ["docs/plan/c-1.md", "docs/plan/c-1.itiraz.reviewer.md"],
    });
    expect(d.valid).toHaveLength(0);
    expect(d.objectionList[0]?.invalid).toMatch(/kendi belgesine/);
  });

  it("boş dosyada itiraz yok", () => {
    const d = parseObjections("# İtirazlar\n\nBu turda itirazım yok.\n", { present });
    expect(d.objectionList).toHaveLength(0);
    expect(d.isOpen).toHaveLength(0);
  });

  it("yol denetimi verilmezse kanıtı olduğu gibi kabul eder", () => {
    const d = parseObjections(OBJECTION);
    expect(d.valid).toHaveLength(1);
  });
});

describe("kanitYolu", () => {
  it("backtick içindeki yolu alır ve satır numarasını atar", () => {
    expect(evidencePath("`src/ui/model.ts:42` — burada")).toBe("src/ui/model.ts");
  });

  it("backtick yoksa uzantılı kelimeyi bulur", () => {
    expect(evidencePath("bkz. src/flow/load.ts satır 12")).toBe("src/flow/load.ts");
  });

  it("yol yoksa null döner", () => {
    expect(evidencePath("genel olarak hata yönetimi zayıf")).toBeNull();
  });

  // Yalnızca İLK ters tırnağa bakan bir okuyucu, bu satırda `Store.undo()`
  // parçasını yol sanıp itirazı geçersiz sayardı — iyi niyetli bir itiraz
  // biçim yüzünden ölürdü ve kural sonuçlu olduğu için bedeli yüksek.
  it("ilk ters tırnak yol değilse sonrakine bakar", () => {
    expect(evidencePath("`Store.undo()` — `src/card/store.ts:12`")).toBe("src/card/store.ts");
  });

  it("dizin ayracı taşıyan parçayı da yol sayar", () => {
    expect(evidencePath("`hub/flows` altındaki örnekler")).toBe("hub/flows");
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
    const d = parseObjections(ile("kabul — Haklı. Plan güncellenmiştir: state caching."));
    expect(d.valid).toHaveLength(1);
    expect(d.acceptance).toHaveLength(1);
    expect(d.objectionList[0]?.rationale).toMatch(/^Haklı/);
  });

  it("`kabul: gerekçe` de okunur", () => {
    expect(parseObjections(ile("kabul: planı düzelttim")).acceptance).toHaveLength(1);
  });

  it("`açık — not` okunur ve açık sayılır", () => {
    const d = parseObjections(ile("açık — henüz yanıtlamadım"));
    expect(d.isOpen).toHaveLength(1);
    expect(d.objectionList[0]?.rationale).toBe("henüz yanıtlamadım");
  });

  // Ayraç zorunlu: yalnızca boşluk kabul edilseydi "kabul edilemez"
  // `kabul` diye okunur ve itirazın anlamı TERSİNE dönerdi.
  it("ayraçsız devam eden metin okunamaz sayılır — anlam tersine dönmez", () => {
    const d = parseObjections(ile("kabul edilemez"));
    expect(d.valid).toHaveLength(0);
    expect(d.objectionList[0]?.invalid).toMatch(/Durum. okunamadı/);
  });

  it("gerekçesiz `ret` hâlâ geçersiz", () => {
    expect(parseObjections(ile("ret")).objectionList[0]?.invalid).toMatch(/gerekçesiz olamaz/);
  });
});

describe("kanitYollari", () => {
  it("bütün yolları sırayla verir, sarmalayıcıları atar", () => {
    expect(evidencePaths("- `docs/plan/k.md:44` — şu\n- (`src/a.ts:10-11`) — bu."))
      .toEqual(["docs/plan/k.md", "src/a.ts"]);
  });

  it("aynı yolu iki kez saymaz", () => {
    expect(evidencePaths("`src/a.ts:1` ve src/a.ts:9")).toEqual(["src/a.ts"]);
  });

  it("yol yoksa boş", () => {
    expect(evidencePaths("Satır 47-49 — sıra koruması açık değil.")).toEqual([]);
  });
});
