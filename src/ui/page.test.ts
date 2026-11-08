import { describe, expect, it } from "vitest";
import { renderPage } from "./page.js";

/** Sayfadaki gömülü betiği çıkarır. */
function scriptText(html: string): string {
  const at = html.indexOf("<script>");
  const last = html.indexOf("</script>", at);
  return html.slice(at + "<script>".length, last);
}

/**
 * Gömülü betikten TEK bir fonksiyonu çıkarıp çalıştırılabilir hâle getirir.
 *
 * Bu dosyanın geri kalanı betiğin KAYNAK METNİNİ sınıyor; o yöntem ölü bir
 * dalı göremiyor (bir kez bu yüzden yanlış geçen sınama yazıldı). Düğme
 * kümesi bir KARAR, yani davranışı ölçülmeli. Betiğin bütününü
 * çalıştırmak mümkün değil (`document`, `fetch` yok), o yüzden yalnızca bu
 * kapanışsız fonksiyon kesilip değerlendiriliyor — ölçülen şey gerçekten
 * sayfaya giden metin.
 */
function scriptFn<T>(html: string, nameText: string): T {
  const src = scriptText(html);
  const bas = src.indexOf(`function ${nameText}(`);
  if (bas < 0) throw new Error(`betikte ${nameText} yok`);
  const last = src.indexOf("\n}\n", bas);
  if (last < 0) throw new Error(`${nameText} kapanışı bulunamadı`);
  const text = src.slice(bas, last + 3);
  return new Function(`${text}; return ${nameText};`)() as T;
}

/** `fonksiyon`'un TEK bir bildirimi (fonksiyon ya da üst düzey `const`) için kullandığı çıkarma mantığı. */
function declaration(src: string, nameText: string): string {
  const funcStart = src.indexOf(`function ${nameText}(`);
  if (funcStart >= 0) {
    const last = src.indexOf("\n}\n", funcStart);
    if (last < 0) throw new Error(`${nameText} kapanışı bulunamadı`);
    return src.slice(funcStart, last + 3);
  }
  const constStart = src.indexOf(`const ${nameText} = `);
  if (constStart >= 0) {
    const last = src.indexOf(";\n", constStart);
    if (last < 0) throw new Error(`${nameText} (const) kapanışı bulunamadı`);
    return src.slice(constStart, last + 2);
  }
  throw new Error(`betikte ${nameText} yok`);
}

/**
 * BİRDEN ÇOK adlandırılmış bildirimi (fonksiyon ya da `const`) BİRLİKTE
 * çıkarıp çalıştırır.
 *
 * `rolKonumu` gibi fonksiyonlar `FORMASYON_GOVDE` sabitine bağlı; `fonksiyon`
 * gibi TEK bildirimi izole etmek burada `ReferenceError` verirdi. Sabiti
 * fonksiyonun İÇİNE KOPYALAMAK yerine (iki kopyanın AYNI kalacağının
 * garantisi yok — tam da bu dosyadaki AJAN_AYRAC'ın kendi yorumunun
 * uyardığı kusur) ikisi BİRLİKTE, gerçek kaynaktan çıkarılıyor.
 */
function scriptFns<T>(html: string, names: string[], turnBack: string): T {
  const src = scriptText(html);
  const text = names.map((nameText) => declaration(src, nameText)).join("\n");
  return new Function(`${text}; return ${turnBack};`)() as T;
}

type Exit = { label: string; not: string; buttons: [string, string][] };

/**
 * Zincirin başında "Geri gönder" düğmesi OLMAMALI.
 *
 * `back` kararının hedefi rolün ret hedefi; yoksa çekirdek kartı aynı role
 * döndürüyor, yani olan şey bir retry. Düğme yapmayacağı şeyi vaat
 * ediyordu: insan "geri gönderdim" sanıyor, kart aynı rolde baştan
 * koşuyordu — ve günlük de ona `back` diyordu.
 */
describe("kapiCikislari — geri hedefi", () => {
  const exitSpec = (kind: string, planLock: boolean, backTarget: string | null): Exit =>
    scriptFn<(k: string, p: boolean, g: string | null) => Exit>(
      renderPage("x"),
      "gateExits",
    )(kind, planLock, backTarget);

  it("onay kapısı: hedef varsa geri gönder, yoksa baştan koştur", () => {
    expect(exitSpec("approval", false, "coder").buttons).toEqual([
      ["Geçir", "forward"],
      ["Geri gönder", "back"],
    ]);
    expect(exitSpec("approval", false, null).buttons).toEqual([
      ["Geçir", "forward"],
      ["Baştan koştur", "retry"],
    ]);
  });

  it("kaçış kapısı: hedef yoksa tek çıkış kalır", () => {
    expect(exitSpec("escalation", false, "coder").buttons).toEqual([
      ["Yeniden koş", "retry"],
      ["Geri gönder", "back"],
    ]);
    // "Yeniden koş" zaten retry: ikinci bir retry düğmesi aynı şeyi iki kez
    // sunmak olurdu.
    expect(exitSpec("escalation", false, null).buttons).toEqual([["Yeniden koş", "retry"]]);
  });

  it("kilit kapısı: 'Denetçi haklı' hedefsizse retry oluyor", () => {
    expect(exitSpec("deadlock", false, "coder").buttons).toEqual([
      ["Üretici haklı", "forward"],
      ["Denetçi haklı", "back"],
    ]);
    expect(exitSpec("deadlock", false, null).buttons).toEqual([
      ["Üretici haklı", "forward"],
      ["Baştan koştur", "retry"],
    ]);
  });

  // Planlama kilidinin çıkışlarında `back` HİÇ yok: hedef alanı onu
  // etkilememeli.
  it("planlama kilidi geri hedefinden etkilenmiyor", () => {
    const a = exitSpec("deadlock", true, "coder");
    const b = exitSpec("deadlock", true, null);
    expect(a.buttons).toEqual(b.buttons);
    expect(a.label).toBe("planlama kilidi");
  });
});

describe("renderPage", () => {
  // Bu test bir kusurun bedeliyle yazıldı: şablon içinde `\n` yazınca
  // TypeScript onu GERÇEK satır sonuna çeviriyor ve JS dizesi ortasından
  // kırılıyor. Sayfa tamamen boş açılıyordu ve hiçbir test görmüyordu —
  // uçlar çalıştığı için hepsi yeşildi.
  it("gömülü betik sözdizimi geçerli", () => {
    const src = scriptText(renderPage("jeton"));
    expect(src.length).toBeGreaterThan(1000);
    // `new Function` derler ama ÇALIŞTIRMAZ: sözdizimi hatası burada patlar.
    expect(() => new Function(src)).not.toThrow();
  });

  it("jeton gömülür, yer tutucu kalmaz", () => {
    const html = renderPage("abc123");
    expect(html).toContain('"abc123"');
    expect(html).not.toContain("__JETON__");
  });

  // Açık palet çıplak `:root`ta, koyu olan yalnızca onu EZİYOR. Rengin tek
  // tanımı bir medya sorgusunun içinde kalırsa, sorgu tutmadığında öğe
  // renksiz kalır.
  it("açık palet temel, koyu palet üzerine biniyor", () => {
    const html = renderPage("x");
    const rootAt = html.indexOf(":root {");
    const darkAt = html.indexOf("prefers-color-scheme: dark");
    expect(rootAt).toBeGreaterThan(-1);
    expect(darkAt).toBeGreaterThan(rootAt);
    expect(html).toContain("--reject:");
  });

  it("dış kaynak yüklemez", () => {
    const html = renderPage("x");
    expect(html).not.toContain("http://");
    expect(html.includes("https://")).toBe(false);
  });

  /**
   * LEJANT — "bu yüzey yalnızca okur" İDDİASI YANLIŞ (SAPMALAR.md §2.4,
   * denetim kartı c-20261105-387d01). Tasarımın kendi lejantı bunu
   * yazıyor ama ekran kapı kararı veriyor, kart açıyor, akış/prompt
   * yazıyor, gözcüyü başlatıp durduruyor — "yalnızca okur" GERİ
   * GETİRİLMEMELİ. `lejantKur` `el`/`document`'e bağlı olduğu için
   * (bu dosyanın `fonksiyon()` yardımcısı DOM'suz çalışıyor, bkz. dosya
   * başı yorumu) burada KAYNAK METİN sınanıyor — tıpkı "jeton gömülür"
   * sınamasının yaptığı gibi.
   */
  it("lejant 'bu yüzey yalnızca okur' DEMİYOR, doğru metni taşıyor", () => {
    const html = renderPage("x");
    // Tasarımın KENDİ lejant metni (tasarim/skein-merkez-v3.html satır 107):
    // "okundu {{ readAt }} · bu yüzey yalnızca okur". Bu TAM dizgi geri
    // GELMEMELİ — ayraçtan ÖNCEki "·" ile birlikte arandığı için, aynı
    // yanlış iddiayı açıklayan kod YORUMU (bu yorumun kendisi tırnak
    // içinde tekrar ediyor, aşağıdaki JSDoc'ta da) burada YANLIŞ pozitif
    // vermiyor.
    expect(html).not.toContain("· bu yüzey yalnızca okur");
    expect(html).toContain(
      "· durum .skein/ ve olaylar.jsonl'dan okunuyor · değişiklik yalnızca düğmelerle",
    );
  });

  // Kart bir plana bağlıysa detay panelinde yol + sürümün ilk 12 karakteri
  // görünmeli; kısaltma ekranın kendi tüketicisinde yapılır (akış hash'iyle
  // aynı ilke), sunucudan tam hash gelir.
  // Model `stale`'i hesaplıyordu, sayfa hiç basmıyordu: ekran kartın başka
  // bir topolojiyle koştuğunu biliyor ve söylemiyordu. Panoda plan4'ün
  // kartı plan-capraz'ın kolonunda işaretsiz göründü.
  // İZOLE ET AMA SAKLAMA. Bozuk kart dosyası artık taramayı durdurmuyor
  // (biri done/ altında olduğunda gözcü hiç açılamıyordu), ama veri kaybı
  // ekranda görünmek zorunda — izole etmek ile saklamak ayrı şeyler.
  //
  // Bu dosyanın sınamaları sayfanın KAYNAK METNİNİ okuyor, davranışını
  // değil — yani ölü bir dalı göremezler: metin ölü dalın içinde de
  // duruyor. O yüzden KOŞULUN KENDİSİ iddia ediliyor; koşulu `false`
  // yapan bir mutasyon böyle ısırıyor. Sınadığı şey BAĞLANTI, çizim
  // değil, ve bu sınır burada yazılı olsun.
  // İKİ AYRI KİLİT. kind: "deadlock" ret limitinden de planlama
  // alışverişinin tükenmesinden de geliyor; çekirdek ikisini ayırıyor ve
  // forward'ın HEDEFİ bile farklı. Eski kod ikisine de "ret limiti doldu"
  // ve "Üretici haklı / Denetçi haklı" basıyordu: planlama kilidinde üç
  // ifade de yanlıştı ve insan o etiketlerle karar veriyordu.
  // Yükümlülükler kartta duruyordu ve ekranda görünmüyordu: `toUiCard`
  // veriyi referansla geçiriyor, yani JSON'la tarayıcıya gidiyor ama
  // tipte ilan edilmediği için kullanılamıyordu ve yalnızca path·hash
  // basılıyordu. İnsan kapısında kararın DAYANAĞI ekranda olmak zorunda;
  // `card show` bunu basıyordu (planLines), ekran basmıyordu.
  it("kart detayı yükümlülükleri kanıtıyla çiziyor", () => {
    const html = renderPage("t");
    expect(html).toContain("yükümlülük ");
    expect(html).toContain("d.card.plan.kabuller");
    expect(html).toContain("kanıt: ");
  });

  it("planlama kilidi ret limitinden ayrı etiketleniyor", () => {
    const html = renderPage("t");
    expect(html).toContain("planlama kilidi");
    expect(html).toContain("itirazlar kapanmadı");
    expect(html).toContain("Planı olduğu gibi ilerlet");
    expect(html).toContain("Alışverişi yeniden aç");
    // Bağlantı: ayrım modelden geliyor, çıkarsanmıyor.
    expect(html).toContain("if (planLock)");
    expect(html).toContain("gateExits(c.gate, c.planLock, c.backTarget)");
  });

  it("bozuk kart dosyası uyarı bandına bağlı", () => {
    const html = renderPage("t");
    expect(html).toContain("kart dosyası okunamıyor");
    expect(html).toContain("m.bozuk && m.bozuk.length");
  });

  it("eski damgalı kartı işaretler, yetimi ayrı tutar", () => {
    const html = renderPage("jeton");
    expect(html).toContain("eski damga");
    // Yetim ayrı bir şey: rolü akışta hiç bulunmayan kart, kapatılması
    // gereken kart. Eski damga meşru.
    expect(html).toContain("c.stale && !c.orphan");
  });

  it("detay betiği plan varsa yol ve kısaltılmış hash'i çizer", () => {
    const src = scriptText(renderPage("x"));
    expect(src).toContain("d.card.plan");
    expect(src).toContain("d.card.plan.hash.slice(0, 12)");
  });

  // İz satırındaki plan olayı ham "plan" sözcüğü yerine tur numarasını ve
  // dolu olan itiraz sayılarını taşımalı (bkz. PLANLAMA.md 6b).
  it("iz satırı plan olayı için tur numarasını ve dolu sayıları çizer", () => {
    const src = scriptText(renderPage("x"));
    expect(src).toContain("h.plan");
    expect(src).toContain("h.plan.round");
    expect(src).toContain("h.plan.objections");
    expect(src).toContain("h.plan.accepted");
    expect(src).toContain("h.plan.invalid");
  });
});

/**
 * Kuyruk engeli bandı — BAĞLANTI sınaması.
 *
 * Bu dosya sayfanın kaynak METNİNİ sınıyor, çizimini değil: ölü bir dalı
 * göremez, çünkü metin ölü dalın içinde de durur. O yüzden iddia edilen
 * şey koşulun KENDİSİ — bandın modelin alanına bakıyor olması ve kodu,
 * rolü, yolu basıyor olması.
 */
describe("renderPage — kuyruk engeli bandı", () => {
  it("bant modelin engeller alanına bağlı", () => {
    const src = scriptText(renderPage("x"));
    expect(src).toContain("m.blockageList && m.blockageList.length");
    expect(src).toContain("kart kuyrukta alınamıyor");
  });

  /**
   * Başlık KART sayar, ENGEL KAYDI saymaz (ÖLÇÜM, kart c-20261106-9a451b):
   * KIRLI kodu kirli dosya başına bir kayıt üretiyor, kart sayısı modelin
   * `totals.engelliKart`'ından gelmeli — `m.engeller.length`'ten değil,
   * aksi hâlde sekiz kirli dosyalı tek kart yine "8 kart" basardı.
   */
  it("başlık kart sayısını totals.engelliKart'tan okur, engel kaydı saymaz", () => {
    const src = scriptText(renderPage("x"));
    expect(src).toContain("m.totals.engelliKart");
    // Dil geçişinde `engeller` -> `blockageList` oldu. Bu OLUMSUZ
    // beklentinin içindeki ad çevrilmezse asla görünemeyecek bir dizeyi
    // arar ve ISIRMAYAN bir sınamaya dönüşür — araç tırnak taşıdığı için
    // dokunmadı ve BİLDİRDİ, elle düzeltildi.
    expect(src).not.toContain("m.blockageList.length + \" kart");
  });

  // KIRLI engeli varken dosya sayısı da ayrıca görünür — iki büyüklük de
  // okunabilir olmalı (hedef metin: "1 kart alınamıyor — 8 kirli dosya").
  it("KIRLI engeli varsa dosya sayısı da ikinci bir cümlede geçiyor", () => {
    const src = scriptText(renderPage("x"));
    expect(src).toContain('e.code === "KIRLI"');
    expect(src).toContain("kirli dosya");
  });

  // Kod ve yol olmadan "alınamadı" kullanıcıyı hiçbir yere götürmez.
  it("kod, rol ve yol basılıyor", () => {
    const src = scriptText(renderPage("x"));
    expect(src).toContain('e.code + "  " + e.role + "  " + e.path');
    expect(src).toContain("e.message");
  });
});

/**
 * `engelBandBasligi` — DAVRANIŞ sınaması (SAPMALAR §2.7: "nitelik doğru"
 * ile "ekranda doğru" ayrı iddialardır, biri diğerini kanıtlamaz). Yukarıki
 * "bağlantı" testleri kaynak metni sınıyor; bu blok fonksiyonu gerçekten
 * ÇALIŞTIRIYOR ve bastığı METNİ karşılaştırıyor.
 *
 * ÖLÇÜM (kart c-20261106-9a451b): kırmızı bant "8 kart kuyrukta
 * ALINAMIYOR" diyordu, gerçekte kuyrukta 1 kart vardı, sekiz dosya onu
 * tutuyordu. Mutasyon denemesi: `kartSayisi` yerine `engeller.length`
 * kullanırsan, ya da ternary'yi tersine çevirirsen birinci sınama düşer.
 */
describe("engelBandBasligi — davranış", () => {
  const headingText = (cardTotal: number, blockages: { code: string }[]): string =>
    scriptFn<(k: number, e: { code: string }[]) => string>(
      renderPage("x"),
      "blockageBandTitle",
    )(cardTotal, blockages);

  it("8 kirli dosyalı tek kartta '1 kart' geçiyor, '8 kart' GEÇMİYOR", () => {
    const eightDirtyFiles = Array.from({ length: 8 }, () => ({ code: "KIRLI" }));
    const text = headingText(1, eightDirtyFiles);
    expect(text).toBe("1 kart kuyrukta alınamıyor — 8 kirli dosya");
    expect(text).not.toContain("8 kart");
  });

  it("KIRLI yoksa (ör. GIT) ikinci cümle çıkmıyor, eski anlam korunuyor", () => {
    expect(headingText(1, [{ code: "GIT" }])).toBe("1 kart kuyrukta alınamıyor");
    expect(headingText(3, [{ code: "GIT" }, { code: "GIT" }, { code: "GIT" }])).toBe(
      "3 kart kuyrukta alınamıyor",
    );
  });

  it("engel yoksa (boş liste) ikinci cümle çıkmaz, çağıran dal zaten çizmiyor", () => {
    expect(headingText(0, [])).toBe("0 kart kuyrukta alınamıyor");
  });
});

/**
 * YENİ KART yolu — BAĞLANTI sınaması.
 *
 * Bu dosya kaynak METNİ sınıyor, çizimi değil (paneli çalıştırmak
 * `document` ister). O yüzden iddia edilen şey bağlantının kendisi:
 * düğme var, hash yolu var, ve gönderim doğru uca jetonla gidiyor.
 * "Sayfadaki yolu kaldır" mutasyonu bu satırlar olmadan hayatta kalıyordu.
 */
describe("renderPage — ekrandan kart açmak", () => {
  it("düğme, hash yolu ve uç bağlı", () => {
    const src = scriptText(renderPage("x"));
    expect(src).toContain('"Yeni kart"');
    expect(src).toContain('h === "yeni"');
    expect(src).toContain("openNewCard");
    expect(src).toContain('fetch("/kart/yeni"');
  });

  // Yazma ucu JETONSUZ çağrılamaz: sayfanın kendi isteği de aynı kapıdan
  // geçmek zorunda, yoksa uç ya kırık ya korumasızdır.
  it("gönderim jetonu taşıyor", () => {
    const src = scriptText(renderPage("x"));
    const at = src.indexOf('fetch("/kart/yeni"');
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 400)).toContain("x-skein-token");
  });
});

/**
 * GÖZCÜ DÜĞMESİ bayat kilitte "başlat" demeli.
 *
 * İlk yazımda düğme kilidin VARLIĞINA bakıyordu: gözcü çökmüş, dosya
 * kalmışken düğme "Gözcüyü durdur" diyor ve basınca "bu gözcüyü bu ekran
 * başlatmadı" cevabı geliyordu. Yapamayacağı şeyi vaat eden düğme — bugün
 * "Geri gönder"de düzeltilen kusurun aynısı, ve yine gerçek tarayıcıda
 * koşturunca çıktı.
 */
/**
 * AKIŞ SEÇİCİ — BAĞLANTI sınaması.
 *
 * Bu dosya kaynak METNİ sınıyor, çizimi değil (gerçek çizim
 * `tarayici.test.ts`'te). Burada iddia edilen şey bağlantının kendisi:
 * liste boşsa seçici hiç çıkmamalı, çıkıyorsa doğru id'yle ve doğru uca
 * jetonla gitmeli, ve liste sayfa açılışında bir kez okunmalı (her
 * saniyelik yoklamada değil).
 */
describe("renderPage — akış seçici", () => {
  it("liste boşsa seçici hiç çıkmıyor", () => {
    const src = scriptText(renderPage("x"));
    expect(src).toContain("if (FLOWS.length)");
    expect(src).toContain('selector.id = "akisSecici"');
  });

  it("seçim doğru uca jetonla gidiyor", () => {
    const src = scriptText(renderPage("x"));
    const at = src.indexOf('fetch("/akis/sec"');
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 300)).toContain("x-skein-token");
  });

  // Liste SAYFA AÇILIRKEN BİR KEZ okunuyor: dosya listesi ekran koşarken
  // değişmiyor, her saniyelik yoklamaya eklemek değişmeyen bir şeyi
  // tekrar tekrar sormak olurdu.
  it("liste sayfa açılışında okunuyor, yoklama döngüsüne eklenmiyor", () => {
    const src = scriptText(renderPage("x"));
    expect(src).toContain('fetch("/akislar"');
    expect(src).toContain("loadFlows().then(() => probe().then(readHash))");
    expect(src).not.toContain('setInterval(loadFlows');
  });
});

describe("renderPage — gözcü düğmesi", () => {
  it("düğme kilidin VARLIĞINA değil CANLI olmasına bakıyor", () => {
    const src = scriptText(renderPage("x"));
    expect(src).toContain("const isLive = Boolean(g && g.alive)");
    expect(src).toContain('isLive ? "Gözcüyü durdur" : "Gözcüyü başlat"');
    expect(src).toContain('watcherCommand(isLive ? "durdur" : "baslat"');
  });

  it("komut jetonla ve doğru uca gidiyor", () => {
    const src = scriptText(renderPage("x"));
    const at = src.indexOf('fetch("/gozcu/"');
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 300)).toContain("x-skein-token");
  });
});

/**
 * ZİNCİR OKU — bir sütun kabul edilen kartı hangi sütuna yollar.
 *
 * 'sonrakiSutun' saf bir fonksiyon (DOM'a dokunmuyor), o yüzden gerçek
 * tarayıcıya çıkmadan burada davranışıyla sınanabiliyor — yönün gerçekten
 * DÖNDÜĞÜ (dar ekranda) ise yalnızca CSS'in işi, bkz. tarayici.test.ts.
 */
describe("sonrakiSutun — zincir okunun hedefi", () => {
  it("rolün 'next' kenarı varsa hedefi döner", () => {
    const nextColumn = scriptFn<(m: unknown, roleIdent: string) => string>(
      renderPage("t"), "nextColumn",
    );
    const m = { edges: [
      { from: "coder", to: "reviewer", kind: "next" },
      { from: "coder", to: "coder", kind: "reject" },
    ] };
    expect(nextColumn(m, "coder")).toBe("reviewer");
  });

  // model.ts zincirin SONUNA ('done'a) kenar hiç üretmiyor (boş bir kenarı
  // çizmek olmayan bir ilişkiyi varmış gibi göstermek olurdu) — yani
  // sütunun kendi "next" kenarı yoksa hedef zaten "bitti" sütunudur.
  it("'next' kenarı yoksa 'bitti' döner", () => {
    const nextColumn = scriptFn<(m: unknown, roleIdent: string) => string>(
      renderPage("t"), "nextColumn",
    );
    expect(nextColumn({ edges: [] }, "coder")).toBe("bitti");
  });
});

/**
 * KAPI GEREKÇESİ OKUNUR OLMA — ayrıştırma ve sınıflandırma kararları.
 *
 * Bu iki fonksiyon SAF (DOM yok), gerçek çizim (katlanan <details>, tam
 * metnin DOM'da kalması) tarayici.test.ts'te sınanıyor. Burada sınanan,
 * o çizimin GİRDİSİNİ belirleyen kararlar: bir metin JSON'a mı benziyor,
 * ve katlı özet gerçek metni KIRPMADAN mı üretiliyor.
 */
describe("jsonGibiMi — ajan mesajı mono/kaydırmalı mı, paragraf mı", () => {
  it("süslü parantezle başlayan metin JSON sayılır", () => {
    const looksLikeJson = scriptFn<(s: string) => boolean>(renderPage("t"), "looksLikeJson");
    expect(looksLikeJson('{"a":1}')).toBe(true);
  });

  // GERÇEK bir kesilmiş kuyruk '{' ile değil '…' ile başlar (agentSaid son
  // 600 karakteri alıyor) — heuristik bu yüzden başlangıca değil, en az üç
  // "anahtar": kalıbına da bakıyor. Bu dal olmasa ÖLÇÜLEN bugün karttaki
  // kusur yine JSON sayılmazdı.
  it("'{' ile BAŞLAMAYAN ama 'anahtar': kalıbı üç kez geçen kırpılmış kuyruk da JSON sayılır", () => {
    const looksLikeJson = scriptFn<(s: string) => boolean>(renderPage("t"), "looksLikeJson");
    expect(looksLikeJson('…"a":1,"b":2,"c":3}')).toBe(true);
  });

  it("düz bir cümle JSON sayılmaz", () => {
    const looksLikeJson = scriptFn<(s: string) => boolean>(renderPage("t"), "looksLikeJson");
    expect(looksLikeJson("Ajan zaman aşımına uğradı, yeniden deneniyor.")).toBe(false);
  });
});

describe("ozetle — katlı özetin kısaltması TAM METNİ etkilemiyor", () => {
  it("kısa metin DEĞİŞMEDEN döner", () => {
    const summarize = scriptFn<(s: string) => string>(renderPage("t"), "summarize");
    expect(summarize("kısa metin")).toBe("kısa metin");
  });

  // Kırpma burada SADECE özet etiketini ilgilendiriyor — gerekceKur
  // govdeye ayraçtan sonraki metnin TAMAMINI yazıyor, ozetle onu
  // ETKİLEMİYOR (bkz. tarayici.test.ts'teki "tamamı DOM'da" sınaması).
  it("uzun metin yalnızca ÖZET için kısaltılır", () => {
    const summarize = scriptFn<(s: string) => string>(renderPage("t"), "summarize");
    const uzun = "a".repeat(300);
    const result = summarize(uzun);
    expect(result.length).toBeLessThan(300);
    expect(result.endsWith("…")).toBe(true);
  });
});

/**
 * BOŞ ROL SÜTUNU EKRANIN BİLDİĞİNİ SÖYLER, BİLMEDİĞİNİ UYDURMAZ.
 *
 * `rol.depth` kuyruk dizininin TAZE taraması, `kartlar` modelin biraz
 * ÖNCEKİ taramasından — aralarında bir kart alınmış/kuyruğa düşmüş
 * olabilir. Bu YARIŞ gerçek tarayıcıda GÜVENİLİR tetiklenemiyor (iki
 * tarama arasına zamanlamayla kart sıkıştırmak kırılgan olurdu), o yüzden
 * saf karar burada DOĞRUDAN çağrılarak sınanıyor; tarayici.test.ts
 * yalnızca gerçek uygulamada ERİŞİLEBİLEN metinleri sınıyor.
 */
describe("bosRolMetni — boş sütun metninin karar noktası", () => {
  const text = (roleRec: { depth: number }, cardList: unknown[]): string =>
    scriptFn<(r: { depth: number }, k: unknown[]) => string>(renderPage("t"), "emptyRoleText")(
      roleRec, cardList,
    );

  it("kuyruk da boşsa 'kuyrukta kart yok' der", () => {
    expect(text({ depth: 0 }, [])).toBe("kuyrukta kart yok");
  });

  // YARIŞ: depth kartlar listesinden büyük — ekran bunu BİLİYOR, "boş"
  // demek bildiği ama yanlış söylemek olurdu.
  it("rol.depth kartlar listesinden büyükse yarış durumunu söyler, 'boş' demez", () => {
    expect(text({ depth: 3 }, [])).toBe("3 kart kuyrukta, henuz yuklenmedi");
  });

  // SINIR: depth kartlar sayısına EŞİTSE (büyük DEĞİL) yarış yok — bu dal
  // `>` ile `>=` arasındaki farkı yakalıyor; `>=` yazılsaydı burada da
  // yarış cümlesi dönerdi.
  it("rol.depth kartlar sayısına eşitse (büyük değilse) normal boş cümleyi söyler", () => {
    expect(text({ depth: 2 }, [{}, {}])).toBe("kuyrukta kart yok");
  });
});

/**
 * BOŞ "BİTTİ" SÜTUNU — "kuyrukta kart yok" İLE AYNI CÜMLEYİ KURMAZ.
 *
 * Üç ayrı gerçek, üçü de modelden BİLİNİYOR: bir rol koşuyor mu, kuyrukta/
 * kapıda bekleyen var mı, yoksa hiç kart açılmamış mı. Öncelik sırası da
 * bir KARAR — "koşuyor" ile "kuyrukta bekliyor" aynı anda doğruyken hangisi
 * SÖYLENİR, mutasyonla korunmalı.
 */
describe("bosBittiMetni — boş 'bitti' sütununun karar noktası", () => {
  const text = (cards: { state: string }[], open: number): string =>
    scriptFn<(m: { cards: { state: string }[]; totals: { open: number } }) => string>(
      renderPage("t"), "emptyDoneText",
    )({ cards, totals: { open } });

  it("hiç kart açılmamışsa bunu söyler", () => {
    expect(text([], 0)).toBe("henuz kart acilmadi");
  });

  it("bir rol şu an koşuyorsa 'iş sürüyor' der, 'hiç açılmadı' demez", () => {
    expect(text([{ state: "active" }], 1)).toBe("bir rol su an kosuyor, henuz biten kart yok");
  });

  it("koşan yok ama kuyrukta/kapıda kart varsa onu söyler", () => {
    expect(text([{ state: "gate" }], 1)).toBe("kart kuyrukta ya da kapida bekliyor, henuz biten yok");
  });

  // ÖNCELİK: ikisi de doğruyken "koşuyor" cümlesi kazanır.
  it("hem koşan rol hem kuyrukta kart varsa 'koşuyor' cümlesi öne geçer", () => {
    expect(text([{ state: "active" }, { state: "gate" }], 2))
      .toBe("bir rol su an kosuyor, henuz biten kart yok");
  });
});

/**
 * SEKMEADI — hash'ten aktif sekmenin KARAR noktası (kart c-20261105-6d7f66).
 *
 * Üç sekme adı dışında kalan HER ŞEY (boş hash dahil) Pano sayılmalı:
 * kart/, akis, prompt, prompt/yeni, yeni hash'leri Pano'nun KENDİ üst üste
 * binen panelleri — ayrı bir sekme değil. Bu ayrım yanlış kurulsaydı
 * (örn. "akis" hash'i "akislar" sekmesine düşseydi) "Akışı düzenle"
 * düğmesi tıklanınca ekran sessizce Akışlar sekmesine atlardı.
 */
describe("sekmeAdi — hash'ten aktif sekme kararı", () => {
  const tab = (h: string): string => scriptFn<(h: string) => string>(renderPage("t"), "tabName")(h);

  it("üç sekme adını aynen döner", () => {
    expect(tab("akislar")).toBe("akislar");
    expect(tab("promptlar")).toBe("promptlar");
    expect(tab("ajanlar")).toBe("ajanlar");
  });

  it("boş hash ve Pano'nun kendi panel yolları 'pano' döner", () => {
    expect(tab("")).toBe("pano");
    expect(tab("kart/123")).toBe("pano");
    expect(tab("akis")).toBe("pano");
    expect(tab("prompt")).toBe("pano");
    expect(tab("prompt/yeni")).toBe("pano");
    expect(tab("yeni")).toBe("pano");
  });
});

/**
 * GÖZCÜDURUM — gözcü çipinin durum kararı (kart c-20261105-6d7f66).
 *
 * Üç durum da MEVCUT modelden (m.daemon) ayrılıyor; metinler ESKİ koddan
 * DEĞİŞMEDİ (bu salt bir çizim/kontrast kartı). "bayat kilit" ibaresi
 * KALMALI — tarayici.test.ts'in "#bar .pill" sınaması buna bağlı.
 */
describe("gozcuDurum — gözcü çipinin durum kararı", () => {
  type Status = { durum: string; label: string };
  const durum = (g: { alive: boolean; info?: unknown } | null): Status =>
    scriptFn<(g: { alive: boolean; info?: unknown } | null) => Status>(renderPage("t"), "watcherStatus")(g);

  it("kilit yoksa 'yok' der", () => {
    expect(durum(null)).toEqual({ durum: "yok", label: "gözcü yok" });
  });

  it("kilit canlıysa 'açık' der", () => {
    expect(durum({ alive: true })).toEqual({ durum: "acik", label: "gözcü açık" });
  });

  // SINIR: 'alive: false' (kilit var ama pid ölü) "açık" DEĞİL. `g.alive`
  // yerine `g !== null` yazılsaydı bu dal "açık" derdi — ÖLÇÜLMÜŞ kusurun
  // aynısı (bkz. page.ts "GÖZCÜ DÜĞMESİ" yorumu).
  it("kilit var ama ölüyse 'çökmüş' der, metin 'bayat kilit' içerir", () => {
    const result = durum({ alive: false });
    expect(result.durum).toBe("cokmus");
    expect(result.label).toContain("bayat kilit");
  });
});

type DaemonInfo = { pid: number; flow: string; hash: string; mode: "serve" | "batch"; startedAt: string };
type Daemon = { alive: boolean; info: DaemonInfo } | null;

const DAEMON_INFO: DaemonInfo = { pid: 1, flow: "f", hash: "abc", mode: "serve", startedAt: "2026-01-01T00:00:00.000Z" };

/**
 * GOZCUPANELDURUM — gözcü PANELİNİN beş durumu (DEVIR.md §2, kart
 * c-20261105-92d731). `gozcuDurum`'u (yukarıda) YAPI TAŞI olarak
 * kullandığı için fonksiyonlar() ile İKİSİ BİRLİKTE çıkarılıyor —
 * `fonksiyon()` burada `gozcuDurum is not defined` ile patlardı (bkz.
 * rolKonumu/FORMASYON_GOVDE emsali, yukarıda `fonksiyonlar` yorumu).
 */
describe("gozcuPanelDurum — gözcü panelinin beş durumu", () => {
  type Status = { durum: string; label: string };
  const durum = (g: Daemon, isManaged: boolean, stopped: boolean): Status =>
    scriptFns<(g: Daemon, y: boolean, d: boolean) => Status>(
      renderPage("t"), ["watcherStatus", "watcherPanelState"], "watcherPanelState",
    )(g, isManaged, stopped);

  // ÖNCELİK: yönetilmiyorsa HER ZAMAN "unmanaged" — gözcü GERÇEKTEN
  // çalışıyor olsa BİLE (başka bir kabuktan açılmış olabilir).
  it("yönetilmiyorsa durum her zaman unmanaged", () => {
    expect(durum(null, false, false)).toEqual({ durum: "unmanaged", label: "gözcü · elle" });
    expect(durum({ alive: true, info: DAEMON_INFO }, false, false))
      .toEqual({ durum: "unmanaged", label: "gözcü · elle" });
  });

  it("yönetiliyor, kilit yok: off", () => {
    expect(durum(null, true, false)).toEqual({ durum: "off", label: "gözcü kapalı" });
  });

  it("yönetiliyor, kilit ölü: stale", () => {
    expect(durum({ alive: false, info: DAEMON_INFO }, true, false))
      .toEqual({ durum: "stale", label: "gözcü çökmüş" });
  });

  it("yönetiliyor, canlı, bekleyen YOK: on", () => {
    expect(durum({ alive: true, info: DAEMON_INFO }, true, false))
      .toEqual({ durum: "on", label: "gözcü açık" });
  });

  // SINIR: canlı VE durdurma bekleniyor → "stopping", "on" DEĞİL. Bayrak
  // yokken bu dal hiç tetiklenmez ("on" döner) — model SIGTERM'den SONRA
  // bile `alive: true` okuduğu için (süreç henüz ölmedi) bu bayrak olmadan
  // çip bir tur boyunca "açık" demeye devam ederdi.
  it("yönetiliyor, canlı, bekleyen VAR: stopping, on DEĞİL", () => {
    expect(durum({ alive: true, info: DAEMON_INFO }, true, true))
      .toEqual({ durum: "stopping", label: "gözcü duruyor…" });
  });

  // "duruyor" bayrağı yalnızca CANLI dalda etkili — kilit yoksa/ölüyse
  // durdurma beklemek anlamsız, off/stale olarak kalmalı.
  it("bekleyen VAR ama kilit yok/ölüyse off/stale'den ÇIKMAZ", () => {
    expect(durum(null, true, true)).toEqual({ durum: "off", label: "gözcü kapalı" });
    expect(durum({ alive: false, info: DAEMON_INFO }, true, true))
      .toEqual({ durum: "stale", label: "gözcü çökmüş" });
  });
});

/**
 * GOZCUTOPOUYARI — DEVIR.md §2 "Topoloji uyarısı" kararı. SAF, DOM yok.
 */
describe("gozcuTopoUyari — akış gözcü açıldıktan sonra değişti mi", () => {
  const warning = (g: Daemon, flowHash: string, durum: string): boolean =>
    scriptFn<(g: Daemon, f: string, d: string) => boolean>(renderPage("t"), "watcherTopoWarning")(g, flowHash, durum);

  it("açıkken hash değiştiyse uyarır", () => {
    expect(warning({ alive: true, info: DAEMON_INFO }, "YENI-HASH", "on")).toBe(true);
  });

  it("açıkken hash AYNIYSA uyarmaz", () => {
    expect(warning({ alive: true, info: DAEMON_INFO }, DAEMON_INFO.hash, "on")).toBe(false);
  });

  // SINIR: hash farklı olsa bile durum "on" DEĞİLSE (stopping/stale/off)
  // uyarmaz — "Yeniden başlat" vaat eder ama başlatılacak canlı bir süreç
  // yok, yapamayacağı şeyi vaat eden düğme sınıfına düşerdi.
  it("durum 'on' değilse hash farklı olsa da uyarmaz", () => {
    expect(warning({ alive: true, info: DAEMON_INFO }, "YENI-HASH", "stopping")).toBe(false);
  });

  it("kilit yoksa uyarmaz", () => {
    expect(warning(null, "YENI-HASH", "on")).toBe(false);
  });
});

/** GOZCUKOMUTORNEKLERI — "unmanaged" panelindeki iki örnek komut. SAF, DOM yok. */
describe("gozcuKomutOrnekleri — ayrı kabuk komutları", () => {
  const examples = (flowName: string): { cmd1: string; cmd2: string } =>
    scriptFn<(f: string) => { cmd1: string; cmd2: string }>(renderPage("t"), "watcherCommandExamples")(flowName);

  it("akış adını İKİ komuta da yerleştirir", () => {
    const o = examples("gunluk-tek");
    expect(o.cmd1).toContain("src/watch/cli.ts");
    expect(o.cmd1).toContain("gunluk-tek");
    expect(o.cmd1).toContain("--serve");
    expect(o.cmd2).toContain("src/ui/cli.ts");
    expect(o.cmd2).toContain("gunluk-tek");
  });
});

/**
 * GOZCUEYLEMETIKETI — panelin tek başlat/durdur düğmesinin etiketi.
 * SAF, DOM yok.
 */
describe("gozcuEylemEtiketi — başlat/devral/durdur etiketi", () => {
  const label = (g: Daemon): string =>
    scriptFn<(g: Daemon) => string>(renderPage("t"), "watcherActionLabel")(g);

  it("kilit yoksa 'Gözcüyü başlat'", () => {
    expect(label(null)).toBe("Gözcüyü başlat");
  });

  it("canlıysa 'Gözcüyü durdur'", () => {
    expect(label({ alive: true, info: DAEMON_INFO })).toBe("Gözcüyü durdur");
  });

  // SINIR: kilit VAR ama ölü (bayat) — "Gözcüyü başlat" DEĞİL, "Kilidi
  // devral ve başlat". `g && !canli` yerine `!canli` yazılsaydı null
  // durumunda da bu dal seçilir, "Kilidi devral ve başlat" yanlış yere
  // (hiç kilit yokken) sızardı.
  it("kilit var ama ölüyse 'Kilidi devral ve başlat'", () => {
    expect(label({ alive: false, info: DAEMON_INFO })).toBe("Kilidi devral ve başlat");
  });
});

/**
 * GOZCUBEKLEMESONUCU — "Yeniden başlat"ın otomatik ikinci yarısının
 * kararı (DEVIR.md §2, kart c-20261105-92d731). SAF, DOM yok.
 *
 * Reviewer ret notu (bu kenarda 2. ret, reddedilen commit 017d453): bu
 * karar önceden ciz() içine gömülüydü ve hiçbir testle kapsanmıyordu.
 * Her SINIR burada ayrı sınanıyor ki mutasyon (=== yerine !==, && yerine
 * ||, "yenidenBaslatiliyor" yerine başka bir string, null kontrolünün
 * kaldırılması) en az bir sınamayı düşürsün.
 */
describe("gozcuBeklemeSonucu — durdurma/yeniden başlatma bekleniyorken gözcü öldüyse", () => {
  type Outcome = { restart: boolean } | null;
  const result = (pendingOnes: string | null, g: Daemon): Outcome =>
    scriptFn<(b: string | null, g: Daemon) => Outcome>(renderPage("t"), "watcherWaitResult")(pendingOnes, g);

  it("beklenen YOK (bekleyen null): her g için null", () => {
    expect(result(null, null)).toBeNull();
    expect(result(null, { alive: true, info: DAEMON_INFO })).toBeNull();
    expect(result(null, { alive: false, info: DAEMON_INFO })).toBeNull();
  });

  // SINIR: süreç HÂLÂ canlıysa (g && g.alive) beklenen iş henüz
  // BİTMEDİ — "durduruluyor" da "yenidenBaslatiliyor" da null dönmeli,
  // bayrak İNDİRİLMEMELİ. `&&` yerine `||` yazılsaydı g===null iken de
  // bu dal seçilir, aşağıdaki "öldü" sınamaları yanlış geçerdi.
  it("bekleyen VAR ama süreç HÂLÂ canlı: null (henüz bitmedi)", () => {
    expect(result("durduruluyor", { alive: true, info: DAEMON_INFO })).toBeNull();
    expect(result("yenidenBaslatiliyor", { alive: true, info: DAEMON_INFO })).toBeNull();
  });

  // "durduruluyor" iken öldüyse (kilit yok YA DA ölü) yeniden başlatma
  // TETİKLENMEMELİ — normal "Gözcüyü durdur" bunu hiç vaat etmiyor.
  it("'durduruluyor' + öldü: bayrak iner, yenidenBaslat false", () => {
    expect(result("durduruluyor", null)).toEqual({ restart: false });
    expect(result("durduruluyor", { alive: false, info: DAEMON_INFO })).toEqual({ restart: false });
  });

  // ASIL DAVRANIŞ: "yenidenBaslatiliyor" iken öldüyse (kilit yok YA DA
  // ölü) yeniden başlatma TETİKLENMELİ — "Yeniden başlat" düğmesinin
  // vaadi tam bu. Bu string karşılaştırması `===` yerine herhangi bir
  // başka değerle (ör. her zaman true) değiştirilseydi "durduruluyor"
  // sınaması yukarıda düşerdi; kaldırılsaydı (her zaman false) bu
  // sınama düşer.
  it("'yenidenBaslatiliyor' + öldü: bayrak iner, yenidenBaslat true", () => {
    expect(result("yenidenBaslatiliyor", null)).toEqual({ restart: true });
    expect(result("yenidenBaslatiliyor", { alive: false, info: DAEMON_INFO })).toEqual({ restart: true });
  });
});

/**
 * RENDERPAGE — gözcü ayarı gömülü (kart c-20261105-92d731). Kaynak metin
 * sınaması: JETON'un AYNI deseni, `GOZCU_AYAR` sayfaya JSON olarak gömülü.
 */
describe("renderPage — gözcü ayarı gömülü", () => {
  it("ikinci parametre verilmezse GOZCU_AYAR null olur", () => {
    const src = scriptText(renderPage("x"));
    expect(src).toContain("const WATCHER_CONFIG = null;");
  });

  it("bayraklarla verilirse GOZCU_AYAR o bayrakları taşır", () => {
    const src = scriptText(renderPage("x", { bayraklar: ["--model", "claude:m"] }));
    expect(src).toContain('const WATCHER_CONFIG = {"bayraklar":["--model","claude:m"]};');
  });
});

/**
 * GÖZCÜ GÜNLÜĞÜ HATA SATIRI — reviewer ret notu (REDDEDİLEN commit
 * b74e6ee): çıplak accent-700 metin panelin ambient zemini --color-bg
 * üstünde duruyordu, koyu temada 2.47:1 (3:1 eşiğinin altı). Kontrast
 * KANITI token-kontrast.test.ts'teki accent-700/accent-100 çiftinde
 * ("Sağ panel kapı kutusu üst etiketi") zaten AÇIK VE KOYU için ölçülü;
 * bu test SADECE ".railGozcuLogSatir .hata" kuralının o rozeti GERÇEKTEN
 * kullandığını doğruluyor — zemin satırı silinirse (çıplak metne geri
 * dönülürse) bu test düşer, zemin geri eklenirse yeşile döner.
 */
describe("renderPage — gözcü günlüğü hata satırı zeminli rozet kullanır", () => {
  it(".railGozcuLogSatir .hata accent-700/accent-100 rozeti taşır, çıplak metin DEĞİL", () => {
    const html = renderPage("x");
    const ruleStart = html.indexOf(".railGozcuLogSatir .hata {");
    expect(ruleStart).toBeGreaterThan(-1);
    const ruleEnd = html.indexOf("}", ruleStart);
    const rule = html.slice(ruleStart, ruleEnd);
    expect(rule).toContain("color: var(--color-accent-700)");
    expect(rule).toContain("background: var(--color-accent-100)");
  });
});

/**
 * ROZET SAYILARI — Pano/Ajanlar sekme rozetlerinin KARAR noktaları
 * (kart c-20261105-6d7f66). SAF, DOM yok.
 */
describe("kapidaBekleyenSayisi — Pano rozeti", () => {
  const say = (cards: { gate: string | null }[]): number =>
    scriptFn<(c: { gate: string | null }[]) => number>(renderPage("t"), "atGateCount")(cards);

  it("gate alanı dolu olanları sayar, null olanları saymaz", () => {
    expect(say([{ gate: "approval" }, { gate: null }, { gate: "deadlock" }])).toBe(2);
  });

  it("hiç kart yoksa sıfır döner", () => {
    expect(say([])).toBe(0);
  });
});

describe("calisanAjanSayisi — Ajanlar rozeti", () => {
  const say = (cards: { state: string }[]): number =>
    scriptFn<(c: { state: string }[]) => number>(renderPage("t"), "runningAgentCount")(cards);

  // SINIR: yalnızca "active" sayılır — "gate"/"done"/"queued" ÇALIŞAN
  // ajan DEĞİL, karşı mutasyon (=== yerine !==) bu satırı KIRAR.
  it("yalnızca state === 'active' olanları sayar", () => {
    expect(say([{ state: "active" }, { state: "gate" }, { state: "active" }, { state: "done" }])).toBe(2);
  });

  it("hiç çalışan yoksa sıfır döner", () => {
    expect(say([{ state: "gate" }, { state: "done" }])).toBe(0);
  });
});

/**
 * TEMA ÇEVİRİSİ — kart c-20261106-e62847. "sistem"/"acik"/"koyu"
 * sözlüğü İLE gerçek <html data-theme> niteliği arasındaki eşleme, SAF.
 * İKİ YÖN de ayrı sınanıyor: biri düşerse anahtar tıklandığında DOM'a
 * yazılan nitelik yanlış olur, öteki düşerse sayfa AÇILIRKEN (sunucudan
 * gelen niteliğe göre) "secili" düğme yanlış görünür.
 */
describe("temaNitelikDegeri — tema adından <html data-theme> niteliğine", () => {
  const attribute = (tema: string): string | null =>
    scriptFn<(t: string) => string | null>(renderPage("t"), "themeAttributeValue")(tema);

  it("'acik' -> 'light'", () => {
    expect(attribute("acik")).toBe("light");
  });

  it("'koyu' -> 'dark'", () => {
    expect(attribute("koyu")).toBe("dark");
  });

  it("'sistem' -> null (nitelik hiç basılmaz, OS tercihi @media ile izlenir)", () => {
    expect(attribute("sistem")).toBeNull();
  });
});

describe("nitelikTemaDegeri — <html data-theme> niteliğinden tema adına (tersi)", () => {
  const tema = (attribute: string | null): string =>
    scriptFn<(n: string | null) => string>(renderPage("t"), "attributeThemeValue")(attribute);

  it("'light' -> 'acik'", () => {
    expect(tema("light")).toBe("acik");
  });

  it("'dark' -> 'koyu'", () => {
    expect(tema("dark")).toBe("koyu");
  });

  // SINIR: nitelik YOKSA (null) VE tanınmayan bir değer gelse de (elle
  // bozulmuş DOM) ikisi de "sistem" — bozuk bir nitelik anahtarı
  // KİLİTLEMEMELİ, en güvenli varsayılana düşmeli.
  it("null -> 'sistem'", () => {
    expect(tema(null)).toBe("sistem");
  });

  it("tanınmayan bir değer -> 'sistem'", () => {
    expect(tema("mavi")).toBe("sistem");
  });
});

/**
 * ROLKONUMU — V formasyonundaki rol yerleşimi (kart c-20261105-2a8dab,
 * DEVIR.md "Formasyon diyagramı"). SAF (DOM yok), ama `FORMASYON_GOVDE`
 * sabitine bağlı olduğu için `fonksiyonlar` ile BİRLİKTE çıkarılıyor.
 */
describe("rolKonumu — V üzerindeki rol yerleşimi", () => {
  type Position = { x: number; y: number; arm: string };
  const position = (i: number, n: number): Position =>
    scriptFns<(i: number, n: number) => Position>(
      renderPage("t"), ["FORMATION_BODY", "rolePosition"], "rolePosition",
    )(i, n);

  // TEK ROL VARSA TEPEDE — n===1 bir özel durum, f hesabına hiç girmez
  // (n-1===0 olurdu, bölme hatası).
  it("tek rol varsa tepede durur", () => {
    expect(position(0, 1)).toEqual({ x: 500, y: 480, arm: "tepe" });
  });

  // İLK ROL GİRİŞTE DEĞİL, SOL UÇTA (230,110) durur — giriş (40,110) "+"
  // düğmesi İÇİN ayrılmış, role ait DEĞİL. İlk denemede ilk rol tam
  // girişe denk geliyordu ve "+" düğmesiyle AYNI merkeze biniyordu (iki
  // tıklanabilir öğe üst üste); skein-merkez-v3.html'in gerçek formülü
  // (posAt/place) bu çakışmayı YAŞAMIYOR çünkü sol/sağ uçtan başlıyor.
  it("ilk rol (öncü) sol UÇTA durur, girişin kendisinde DEĞİL", () => {
    const k = position(0, 2);
    expect(k.arm).toBe("sol");
    expect(k.x).toBeCloseTo(230);
    expect(k.y).toBeCloseTo(110);
  });

  it("son rol sağ uçta durur, çıkışın kendisinde DEĞİL", () => {
    const k = position(1, 2);
    expect(k.arm).toBe("sag");
    expect(k.x).toBeCloseTo(770);
    expect(k.y).toBeCloseTo(110);
  });

  // SINIR: f === 0.5 — ister n===1'den ZORLANMIŞ olsun ister tek sayıda
  // rolün ORTANCASI olsun, HER İKİ durumda da "tepe" dalına düşer: kol
  // KOORDİNATA göre (apex'le çakışıyor mu), "n===1 mi" sorusuna göre
  // DEĞİL — skein-merkez-v3.html'in `place` fonksiyonundaki
  // side==="apex" ayrımıyla AYNI ilke.
  it("f===0.5 (üç rolde ortanca) tepeye düşer, 'sol' ya da 'sag' SAYILMAZ", () => {
    const k = position(1, 3);
    expect(k.arm).toBe("tepe");
    expect(k.x).toBeCloseTo(500);
    expect(k.y).toBeCloseTo(480);
  });

  // DÜZ ORAN (lerp), ARC-LENGTH DEĞİL: sol-uç(230,110)→tepe(500,480)
  // arasında f*2 oranıyla DOĞRUSAL ilerliyor — skein-merkez-v3.html'in
  // posAt'ı bunu "TL.x + (AP.x-TL.x)*f*2" olarak yazıyor, çizginin
  // gerçek (arc-length) uzunluğuna hiç bakmıyor.
  it("konum sol-uç/tepe arasında DÜZ ORANLA (lerp) hesaplanır", () => {
    const k = position(1, 5); // f = 0.25 → sol kolda yerel oran f*2 = 0.5
    expect(k.x).toBeCloseTo(230 + (500 - 230) * 0.5);
    expect(k.y).toBeCloseTo(110 + (480 - 110) * 0.5);
  });

  // GİRİŞ/ÇIKIŞ konuma HİÇ GİRMİYOR: iki rollü akışta roller sol-uç ve
  // sağ-uç noktalarında durur, giriş (40,110) ve çıkış (950,110) ile
  // ÇAKIŞMAZ — bu olmasaydı "+" düğmesi ve biten-kart kutusu ilk/son rol
  // düğümüyle aynı merkezde üst üste binerdi.
  it("roller giriş/çıkış noktalarıyla ÇAKIŞMAZ", () => {
    const first = position(0, 2);
    const last = position(1, 2);
    expect(first).not.toEqual(expect.objectContaining({ x: 40, y: 110 }));
    expect(last).not.toEqual(expect.objectContaining({ x: 950, y: 110 }));
  });
});

/**
 * KUŞRENGİ — rol düğümündeki kuşun rengi (SAPMALAR.md §1'in "boş rol
 * kuşu" düzeltmesi burada: neutral-600, tasarımın neutral-400'ü DEĞİL).
 */
describe("kusRengi — rol düğümünün kuş rengi", () => {
  const colourVal = (cardList: { state: string; gate: string | null }[]): string =>
    scriptFn<(k: { state: string; gate: string | null }[]) => string>(renderPage("t"), "birdColour")(cardList);

  it("çalışan kart varsa accent", () => {
    expect(colourVal([{ state: "active", gate: null }])).toBe("var(--color-accent)");
  });

  it("kapıda bekleyen kart varsa (çalışmasa da) accent", () => {
    expect(colourVal([{ state: "gate", gate: "approval" }])).toBe("var(--color-accent)");
  });

  it("kart var ama çalışmıyor/kapıda değilse (kuyrukta) text", () => {
    expect(colourVal([{ state: "queued", gate: null }])).toBe("var(--color-text)");
  });

  // SAPMA: tasarım neutral-400 diyor (1.80:1) — burada neutral-600.
  it("hiç kart yoksa SAPMA'nın düzelttiği empty-bird-ink", () => {
    expect(colourVal([])).toBe("var(--empty-bird-ink)");
  });
});

/** KAREDURUMU — kart karesinin üç durumu (çizim ".kare-<ad>" sınıfıyla paylaşılıyor). */
describe("kareDurumu — kart karesinin durumu", () => {
  const durum = (c: { state: string; gate: string | null }): string =>
    scriptFn<(c: { state: string; gate: string | null }) => string>(renderPage("t"), "squareState")(c);

  it("çalışıyor", () => {
    expect(durum({ state: "active", gate: null })).toBe("calisiyor");
  });

  it("kapıda", () => {
    expect(durum({ state: "gate", gate: "approval" })).toBe("kapida");
  });

  it("kuyrukta (ne çalışıyor ne kapıda)", () => {
    expect(durum({ state: "queued", gate: null })).toBe("kuyrukta");
  });

  // SINIR: state active İSE kapı alanı dolu olsa bile "calisiyor" kazanır
  // (sıra bu — aktif bir kartın kapıda sayılması modelin kendi iç
  // tutarlılığına aykırı olurdu, ama karar noktası burada PİNLENİYOR).
  it("state active ise gate alanı dolu olsa bile 'calisiyor' kazanır", () => {
    expect(durum({ state: "active", gate: "approval" })).toBe("calisiyor");
  });
});

/**
 * RETYAYKONTROL — ret yayının kontrol noktası (DEVIR.md: "iki rolün orta
 * noktasından (500,170)'e doğru %60 kaydırılır").
 */
describe("retYayKontrol — ret yayının kontrol noktası", () => {
  type Point = { x: number; y: number };
  const check = (a: Point, b: Point): Point =>
    scriptFn<(a: Point, b: Point) => Point>(renderPage("t"), "rejectArcCheck")(a, b);

  it("orta nokta hedefe (500,170) doğru %60 kaydırılır, hedefin KENDİSİNE eşitlenmez", () => {
    const k = check({ x: 40, y: 110 }, { x: 230, y: 110 });
    // orta = (135, 110); hedef = (500, 170); fark = (365, 60); *.6 = (219, 36)
    expect(k.x).toBeCloseTo(135 + 219);
    expect(k.y).toBeCloseTo(110 + 36);
    // %100 OLSAYDI her yay (500,170)'e eşit olurdu — burada DEĞİL.
    expect(k.x).not.toBeCloseTo(500);
    expect(k.y).not.toBeCloseTo(170);
  });

  it("kaynak ve hedef aynı noktaysa kontrol noktası da aynı lerp'i uygular", () => {
    const k = check({ x: 0, y: 0 }, { x: 0, y: 0 });
    expect(k.x).toBeCloseTo(500 * 0.6);
    expect(k.y).toBeCloseTo(170 * 0.6);
  });
});

/** KAPICIZGISI — insan onayı kapısının dik çizgi segmenti. */
describe("kapiCizgisi — iki nokta arasındaki çizgiye dik segment", () => {
  type Point = { x: number; y: number };
  type Segment = { x1: number; y1: number; x2: number; y2: number };
  const lineSeg = (a: Point, b: Point, lengthPx: number): Segment =>
    scriptFn<(a: Point, b: Point, u: number) => Segment>(renderPage("t"), "gateLine")(a, b, lengthPx);

  it("yatay bir çizginin ortasına DİK (düşey) bir segment üretir", () => {
    const s = lineSeg({ x: 0, y: 0 }, { x: 10, y: 0 }, 16);
    expect(s).toEqual({ x1: 5, y1: -8, x2: 5, y2: 8 });
  });

  // DÜŞEY bir çizgide dik yön YATAY olur — yatay örnek "dy===0" olduğu
  // için dik vektörün İŞARETİNİ (-dy/boy) sınayamıyordu (sonuç hep 0).
  // Bu örnek dy !== 0, yani işaret ters çevrilse (örn. "-dy" yerine "dy")
  // bu sınama DÜŞER.
  it("düşey bir çizginin ortasına DİK (yatay) bir segment üretir, İŞARETİ sabit", () => {
    const s = lineSeg({ x: 0, y: 0 }, { x: 0, y: 10 }, 16);
    expect(s).toEqual({ x1: 8, y1: 5, x2: -8, y2: 5 });
  });

  it("segment UZUNLUĞU parametreyle ölçeklenir", () => {
    const s = lineSeg({ x: 0, y: 0 }, { x: 10, y: 0 }, 4);
    expect(Math.hypot(s.x2 - s.x1, s.y2 - s.y1)).toBeCloseTo(4);
  });
});

/**
 * MALİYETMETNİ — ALT SINIR gösterimi (SAPMALAR.md §2.1, denetim kartı
 * c-20261105-387d01).
 *
 * Tasarımda "≥" hiç geçmiyor; bu üç hâl bir zaman aşımı turunun dolar
 * kaybını SESSİZCE sıfır gibi göstermemek için var (bkz. page.ts
 * yorumu, a5392f0). Üç hâl AYRI sorular soruyor ve biri diğerine
 * düşerse (örn. "olculmeyen var + dolar var" dalı "tam rakam" dalına
 * düşerse) ekran gerçekte eksik olan bir turu TAM ÖLÇÜLMÜŞ gibi gösterir
 * — bu yüzden üçü de burada AYRI AYRI sınanıyor, biri "kapsar" diye
 * atlanmıyor.
 */
describe("maliyetMetni — maliyetin ALT SINIR olduğunu söyleyen biçim", () => {
  const text = (amount: number, unmeasured: number, tokens: number): string =>
    scriptFns<(t: number, o: number, saturated: number) => string>(
      renderPage("t"),
      ["money", "shortCount", "costText"],
      "costText",
    )(amount, unmeasured, tokens);

  // HİÇBİR aktivasyon ölçüsüz değilse işaret YOK — "tam rakam" dalı.
  it("olculmeyen SIFIR ise düz rakam döner, '≥' YOK", () => {
    expect(text(12.5, 0, 0)).toBe("$12.50");
  });

  // Bazı aktivasyonlar dolar bildirdi (toplam > 0) ama en az biri
  // bildirmedi: toplam GERÇEK dolarların toplamı, ama eksik olanı
  // SAKLAMIYOR — "≥" ile ALT SINIR olduğunu söylüyor.
  it("olculmeyen VAR ve dolar VAR ise '≥' + tutar döner", () => {
    expect(text(0.5, 1, 3_040_000)).toBe("≥$0.50");
  });

  // Zaman aşımı: dolar HİÇ yok ama akıştan token kurtarıldı (SAPMALAR
  // §2.1: "tur yarıda kesildi, dolar bildirilmedi — ALT SINIR"). Rakam
  // DEĞİL, çünkü $0.00 "bedava" ile "ölçülmedi" aynı şey değil.
  it("olculmeyen VAR, dolar YOK, token VAR ise 'ölçülmedi · ≥N token' döner", () => {
    expect(text(0, 1, 3_040_000)).toBe("maliyet ölçülmedi · ≥3.0M token");
  });

  // Ölçü HİÇ bildirilmedi — ne dolar ne token (SAPMALAR §2.1: "dolar yok
  // (abonelik kimliği)"). Bu iki hâl AYNI metni DEĞİL, farklı metni
  // üretmeli: token sayısı olmadan "≥N token" yazmak uydurma bir alt
  // sınır olurdu.
  it("olculmeyen VAR, dolar YOK, token da YOK ise düz 'ölçülmedi' döner, token YOK", () => {
    expect(text(0, 1, 0)).toBe("maliyet ölçülmedi");
  });
});

/**
 * KANATCIRPIYORMU — kanat çırpmanın koşulu (DEVIR.md: "yalnızca rolde
 * çalışan kart varsa VE gözcü açıkken"; SAPMALAR.md §2.2'nin sınanması
 * istediği karar). "çalışan" burada "kapıda bekleyen"i KAPSAMAZ —
 * `kusRengi`'nin accent koşulundan daha DAR.
 */
describe("kanatCirpiyorMu — kanat çırpmanın koşulu", () => {
  type Daemon = { alive: boolean } | null;
  const flapping = (cardList: { state: string }[], daemon: Daemon): boolean =>
    scriptFn<(k: { state: string }[], d: Daemon) => boolean>(renderPage("t"), "wingsFlapping")(cardList, daemon);

  it("çalışan kart VE canlı gözcü varsa true", () => {
    expect(flapping([{ state: "active" }], { alive: true })).toBe(true);
  });

  it("çalışan kart var ama gözcü YOKSA (null) false", () => {
    expect(flapping([{ state: "active" }], null)).toBe(false);
  });

  it("çalışan kart var ama gözcü ÖLÜYSE (alive: false) false", () => {
    expect(flapping([{ state: "active" }], { alive: false })).toBe(false);
  });

  // SINIR: kapıda bekleyen bir kart "çalışan" SAYILMAZ — insan kararını
  // bekleyen bir kart için kanat çırpmak yanlış bir sinyal olurdu.
  it("kart kapıda bekliyor ama çalışmıyor ise, gözcü canlı olsa da false", () => {
    expect(flapping([{ state: "gate" }], { alive: true })).toBe(false);
  });

  it("hiç kart yoksa false", () => {
    expect(flapping([], { alive: true })).toBe(false);
  });
});

/**
 * PLANLAMAKATILIMCIKONUMLARI — planlama bandının geçtiği noktalar
 * (DEVIR.md: "planlama katılımcılarının üzerinden geçen ... şerit").
 * `rolKonumu`ya bağlı, `fonksiyonlar` ile BİRLİKTE çıkarılıyor.
 */
describe("planlamaKatilimciKonumlari — planlama bandının noktaları", () => {
  type Position = { x: number; y: number; arm: string };
  type RoleShape = { id: string };
  const positions = (roleList: RoleShape[], katilimcilar: string[]): Position[] =>
    scriptFns<(r: RoleShape[], k: string[]) => Position[]>(
      renderPage("t"),
      ["FORMATION_BODY", "rolePosition", "planningParticipantPositions"],
      "planningParticipantPositions",
    )(roleList, katilimcilar);

  it("katılımcıların konumlarını ZİNCİR SIRASIYLA döner", () => {
    const roleList = [{ id: "planner" }, { id: "coder" }, { id: "reviewer" }];
    const result = positions(roleList, ["planner", "coder"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ x: 230, y: 110, arm: "sol" });
  });

  // BİLİNMEYEN KATILIMCI sessizce elenir — olmayan bir rolü varmış gibi
  // göstermek (örn. (0,0) gibi bir uydurma nokta) daha KÖTÜ bir hata
  // modu olurdu.
  it("bilinmeyen bir katılımcı (akışta olmayan rol) sessizce elenir", () => {
    const roleList = [{ id: "planner" }];
    const result = positions(roleList, ["planner", "uydurma-rol"]);
    expect(result).toHaveLength(1);
  });

  it("katılımcı listesi boşsa boş dizi döner", () => {
    expect(positions([{ id: "planner" }], [])).toEqual([]);
  });
});

/**
 * PLANLAMABANDYOLU — planlama bandının çizdiği SVG yolu. İlk/son
 * katılımcının "kol"una göre TEPE'den dolanıp dolanmayacağına karar
 * veriyor (kart c-20261105-2a8dab).
 */
describe("planlamaBandYolu — bandın tepeden dolanması", () => {
  type Position = { x: number; y: number; arm: string };
  const path = (first: Position, last: Position): string =>
    scriptFns<(a: Position, b: Position) => string>(
      renderPage("t"), ["FORMATION_BODY", "planningBandPath"], "planningBandPath",
    )(first, last);

  // İKİ KOLA YAYILAN bant (ilk solda, son sağda) TEPE'den (500,480)
  // GEÇMEK ZORUNDA — yoksa düz çizgi iki kolun arasından kestirmeden
  // geçer, V'nin kendi hattını İZLEMEZ.
  it("ilk sol kolda, son sağ koldaysa TEPEDEN dolanır", () => {
    const first = { x: 230, y: 110, arm: "sol" };
    const last = { x: 770, y: 110, arm: "sag" };
    expect(path(first, last)).toBe("M 230 110 L 500 480 L 770 110");
  });

  // AYNI KOLDAKİ (ya da biri tepedeki) iki nokta ZATEN aynı doğru
  // üzerinde — detur GEREKMİYOR, düz çizgi yeterli.
  it("ikisi de sol koldaysa düz çizgi çizer, tepeden dolanmaz", () => {
    const first = { x: 230, y: 110, arm: "sol" };
    const last = { x: 365, y: 295, arm: "sol" };
    expect(path(first, last)).toBe("M 230 110 L 365 295");
  });

  it("son tepedeyse (örn. tek katılımcı tepeye denk gelmiş) dolanmaz", () => {
    const first = { x: 230, y: 110, arm: "sol" };
    const last = { x: 500, y: 480, arm: "tepe" };
    expect(path(first, last)).toBe("M 230 110 L 500 480");
  });
});

/**
 * RAILGEÇİŞ — sağ panelin durum geçişleri (kart c-20261105-d500f1).
 *
 * SAF karar, DOM'suz: hangi moda/role/karta geçileceği burada sınanıyor.
 * Gerçek çizim (sagPanelCiz ve modların kendisi) tarayici.test.ts'te.
 */
describe("railGecis — sağ panelin durum geçişleri", () => {
  type Rail = { mode: string; roleId: string | null; cardId: string | null; cardFrom: string };
  const transition = (railEl: Rail, actionSpec: Record<string, unknown>): Rail =>
    scriptFn<(r: Rail, e: Record<string, unknown>) => Rail>(renderPage("t"), "railTransition")(railEl, actionSpec);

  const OVERVIEW: Rail = { mode: "overview", roleId: null, cardId: null, cardFrom: "overview" };

  it("'genelBakis' her zaman Genel bakışa döner", () => {
    const whileInside = { mode: "card", roleId: "coder", cardId: "c-1", cardFrom: "role" };
    expect(transition(whileInside, { tur: "genelBakis" })).toEqual(OVERVIEW);
  });

  // TOGGLE: Rol modunda AYNI role tekrar tıklamak Genel bakışa döner —
  // formasyon düğümünün eski davranışıyla (secimDegistir) AYNI.
  it("Rol modunda AYNI role tıklamak Genel bakışa döner", () => {
    const roleOpenCount: Rail = { mode: "role", roleId: "coder", cardId: null, cardFrom: "overview" };
    expect(transition(roleOpenCount, { tur: "rolSec", roleId: "coder" })).toEqual(OVERVIEW);
  });

  it("Rol modunda BAŞKA role tıklamak o role GEÇER, kapatmaz", () => {
    const roleOpenCount: Rail = { mode: "role", roleId: "coder", cardId: null, cardFrom: "overview" };
    expect(transition(roleOpenCount, { tur: "rolSec", roleId: "reviewer" })).toEqual({
      mode: "role", roleId: "reviewer", cardId: null, cardFrom: "overview",
    });
  });

  // "&&" sınaması: Kart modundayken (roleId AYNI role ait bile olsa) o
  // role tıklamak KAPATMAZ, Rol moduna geçer — "&&" "||" olsaydı bu dal da
  // GENEL_BAKIS'a düşerdi.
  it("Kart modunda (roleId eşleşse de) role tıklamak Rol moduna geçer, KAPATMAZ", () => {
    const cardOpenFlag: Rail = { mode: "card", roleId: "coder", cardId: "c-1", cardFrom: "role" };
    expect(transition(cardOpenFlag, { tur: "rolSec", roleId: "coder" })).toEqual({
      mode: "role", roleId: "coder", cardId: null, cardFrom: "overview",
    });
  });

  it("'kartAcGenel' roleId'yi TEMİZLER, cardFrom 'overview'dur", () => {
    const roleOpenCount: Rail = { mode: "role", roleId: "coder", cardId: null, cardFrom: "overview" };
    expect(transition(roleOpenCount, { tur: "kartAcGenel", cardIdent: "c-9" })).toEqual({
      mode: "card", roleId: null, cardId: "c-9", cardFrom: "overview",
    });
  });

  it("'kartAcRol' roleId'yi KORUR, cardFrom 'role'dur", () => {
    expect(transition(OVERVIEW, { tur: "kartAcRol", roleId: "reviewer", cardIdent: "c-9" })).toEqual({
      mode: "card", roleId: "reviewer", cardId: "c-9", cardFrom: "role",
    });
  });

  it("'geri' — Kart 'role'den açıldıysa Rol'e döner, roleId KORUNUR", () => {
    const cardOpenFlag: Rail = { mode: "card", roleId: "reviewer", cardId: "c-9", cardFrom: "role" };
    expect(transition(cardOpenFlag, { tur: "geri" })).toEqual({
      mode: "role", roleId: "reviewer", cardId: null, cardFrom: "overview",
    });
  });

  it("'geri' — Kart 'overview'den açıldıysa Genel bakışa döner", () => {
    const cardOpenFlag: Rail = { mode: "card", roleId: null, cardId: "c-9", cardFrom: "overview" };
    expect(transition(cardOpenFlag, { tur: "geri" })).toEqual(OVERVIEW);
  });

  it("tanınmayan bir eylem rail'i DEĞİŞTİRMEDEN döner", () => {
    const roleOpenCount: Rail = { mode: "role", roleId: "coder", cardId: null, cardFrom: "overview" };
    expect(transition(roleOpenCount, { tur: "bilinmeyen" })).toEqual(roleOpenCount);
  });
});

/**
 * RAILROLMETA — "Rol" modunun meta satırı (DEVIR.md: "sağlayıcı, çalışma
 * alanı, sonraki rol, ret hedefi, toplu alım"). SAF, DOM yok.
 */
describe("railRolMeta — Rol modunun meta satırı", () => {
  type Meta = {
    no: string; leader: boolean; id: string; provider: string; workspace: string;
    nextRole: string; rejectTarget: string | null; receive: string; prompt: string;
  };
  const meta = (m: unknown, roleIdent: string): Meta | null =>
    scriptFns<(m: unknown, roleIdent: string) => Meta | null>(
      renderPage("t"), ["nextColumn", "railRoleMeta"], "railRoleMeta",
    )(m, roleIdent);

  const MODEL = {
    roles: [
      { id: "coder", provider: "claude", workspace: "main", prompt: "roles/coder.prompt", receive: "task" },
      { id: "reviewer", provider: "codex", workspace: "reviewer", prompt: "roles/reviewer.prompt", receive: "batch" },
    ],
    edges: [
      { from: "coder", to: "reviewer", kind: "next" },
      { from: "reviewer", to: "coder", kind: "reject" },
    ],
  };

  it("ilk rolü 'öncü' sayar, numarayı 1'den başlatıp dolgular", () => {
    expect(meta(MODEL, "coder")).toMatchObject({ no: "01", leader: true });
  });

  it("ilk olmayan rolü 'öncü' SAYMAZ", () => {
    expect(meta(MODEL, "reviewer")).toMatchObject({ no: "02", leader: false });
  });

  it("sonraki rolü ZİNCİR OKU'nun (sonrakiSutun) aynı kararıyla verir", () => {
    expect(meta(MODEL, "coder")?.nextRole).toBe("reviewer");
    expect(meta(MODEL, "reviewer")?.nextRole).toBe("bitti");
  });

  it("ret hedefi varsa onu, yoksa null döner", () => {
    expect(meta(MODEL, "reviewer")?.rejectTarget).toBe("coder");
    expect(meta(MODEL, "coder")?.rejectTarget).toBe(null);
  });

  it("alım türünü ve prompt yolunu rolden AYNEN taşır", () => {
    expect(meta(MODEL, "reviewer")).toMatchObject({ receive: "batch", prompt: "roles/reviewer.prompt" });
  });

  it("bilinmeyen rol id'si için null döner", () => {
    expect(meta(MODEL, "yok")).toBe(null);
  });
});

/**
 * RAILYENIDENYUKLENMELIMI — Kart modunun fetch kararı (kart
 * c-20261105-d500f1). SAF: sagPanelCiz her saniyelik yoklamada (yokla/ciz)
 * çağrılıyor, bu karar aynı kart için ikinci bir /kart/<id> isteğini
 * ÖNLÜYOR — yoksa panel her saniye "yükleniyor…"ya dönerdi.
 */
describe("railYenidenYuklenmeliMi — Kart modunun fetch kararı", () => {
  const decision = (g: unknown, h: unknown): boolean =>
    scriptFn<(g: unknown, h: unknown) => boolean>(renderPage("t"), "railNeedsReload")(g, h);

  it("gösterilen kart hedefle AYNIYSA yeniden yüklemez", () => {
    expect(decision("c-1", "c-1")).toBe(false);
  });

  it("gösterilen kart hedeften FARKLIYSA yeniden yükler", () => {
    expect(decision("c-1", "c-2")).toBe(true);
  });

  // İlk açılış: panel hiçbir kart taşımıyor (dataset undefined) — hedef
  // her ne olursa olsun bu YÜKLEMELİ dönmek zorunda, aksi hâlde Kart modu
  // İLK kez açıldığında hiç fetch ETMEZDİ.
  it("panel hiçbir kart taşımıyorsa (ilk açılış) yeniden yükler", () => {
    expect(decision(undefined, "c-1")).toBe(true);
  });
});

/**
 * MOD 5 — "Rolleri düzenle" (kart c-20261105-725320, DEVIR.md §3). Bu
 * fonksiyonların hepsi SAF: çizim (railDuzenlePaneliCiz ve yardımcıları)
 * DOM gerektirdiği için tarayici.test.ts'te, burada yalnızca KARAR.
 */
type EditRole = {
  id: string; provider?: string; workspace?: string; receive?: string;
  reject?: string; syncBack?: string[]; next?: string; prompt?: string;
};

describe("duzenleHatalari — boş/tekrarlanan rol adı HATA'sı", () => {
  const errors = (roleList: EditRole[]): { errors: string[]; invalid: Set<number> } =>
    scriptFn<(r: EditRole[]) => { errors: string[]; invalid: Set<number> }>(
      renderPage("t"), "editErrors",
    )(roleList);

  it("hepsi tekil ve doluysa hata YOK", () => {
    const result = errors([{ id: "coder" }, { id: "reviewer" }]);
    expect(result.errors).toEqual([]);
    expect(result.invalid.size).toBe(0);
  });

  it("boş ad (ya da sadece boşluk) HATA verir ve o indeksi işaretler", () => {
    const result = errors([{ id: "coder" }, { id: "   " }]);
    expect(result.errors).toHaveLength(1);
    expect(result.invalid.has(1)).toBe(true);
    expect(result.invalid.has(0)).toBe(false);
  });

  it("aynı adı taşıyan İKİ rol HATA verir ve İKİSİNİ de işaretler", () => {
    const result = errors([{ id: "coder" }, { id: "coder" }, { id: "reviewer" }]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("coder");
    expect(result.invalid).toEqual(new Set([0, 1]));
  });

  it("boş liste için hata YOK", () => {
    expect(errors([]).errors).toEqual([]);
  });
});

describe("duzenleSilmeUyarilari — açık kartı olan silinen rol UYARI'sı (engellemez)", () => {
  type CardShape = { role: string; state: string; orphan?: boolean };
  const warningList = (previous: string[], nowTs: string[], cardList: CardShape[]): string[] =>
    scriptFn<(o: string[], s: string[], k: CardShape[]) => string[]>(
      renderPage("t"), "editDeleteWarnings",
    )(previous, nowTs, cardList);

  it("silinmeyen rol için uyarı YOK", () => {
    expect(warningList(["coder"], ["coder"], [{ role: "coder", state: "active" }])).toEqual([]);
  });

  it("silinen rolün AÇIK (done olmayan) kartı varsa uyarır", () => {
    const result = warningList(["coder", "reviewer"], ["coder"], [{ role: "reviewer", state: "gate" }]);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("reviewer");
  });

  it("silinen rolün kartları hepsi 'done'sa uyarmaz", () => {
    expect(warningList(["coder", "reviewer"], ["coder"], [{ role: "reviewer", state: "done" }])).toEqual([]);
  });

  it("silinen rolün kartı YETİM (orphan) ise SAYMAZ", () => {
    expect(warningList(["coder", "reviewer"], ["coder"], [{ role: "reviewer", state: "gate", orphan: true }])).toEqual([]);
  });
});

describe("duzenleSiradanBagla — 'next' HER ZAMAN sıradan türer, sonuncusu 'done'", () => {
  const bind = (roleList: EditRole[]): EditRole[] =>
    scriptFn<(r: EditRole[]) => EditRole[]>(renderPage("t"), "editBindInOrder")(roleList);

  it("üç rolü sırayla zincirler, sonuncusu 'done'", () => {
    const result = bind([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(result.map((r) => r.next)).toEqual(["b", "c", "done"]);
  });

  it("tek rol de 'done'a bağlanır", () => {
    expect(bind([{ id: "a" }])[0]?.next).toBe("done");
  });
});

describe("duzenleReddiTemizle — kural 13: reject yalnızca DAHA ÖNCEki role işaret edebilir", () => {
  const clear = (roleList: EditRole[]): EditRole[] =>
    scriptFn<(r: EditRole[]) => EditRole[]>(renderPage("t"), "editClearReject")(roleList);

  it("öncekine işaret eden reject KORUNUR", () => {
    const result = clear([{ id: "a" }, { id: "b", reject: "a" }]);
    expect(result[1]?.reject).toBe("a");
  });

  it("SONRAKİ bir role işaret eden reject TEMİZLENİR", () => {
    const result = clear([{ id: "a", reject: "b" }, { id: "b" }]);
    expect(result[0]?.reject).toBeUndefined();
  });

  it("var olmayan bir role işaret eden reject TEMİZLENİR", () => {
    const result = clear([{ id: "a" }, { id: "b", reject: "yok" }]);
    expect(result[1]?.reject).toBeUndefined();
  });

  it("kendine işaret eden reject (hedef === i) TEMİZLENİR", () => {
    const result = clear([{ id: "a", reject: "a" }]);
    expect(result[0]?.reject).toBeUndefined();
  });
});

describe("duzenleTasi — ↑/↓ ikon düğmeleri: sırayı değiştirir, next'i yeniden türetir", () => {
  const move = (roleList: EditRole[], i: number, direction: number): EditRole[] =>
    scriptFns<(r: EditRole[], i: number, y: number) => EditRole[]>(
      renderPage("t"), ["editClearReject", "editBindInOrder", "editMove"], "editMove",
    )(roleList, i, direction);

  it("ortadaki rolü YUKARI taşır", () => {
    const result = move([{ id: "a" }, { id: "b" }, { id: "c" }], 1, -1);
    expect(result.map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(result.map((r) => r.next)).toEqual(["a", "c", "done"]);
  });

  it("İLK rolü YUKARI taşımak hiçbir şey yapmaz (sınır)", () => {
    const roleList = [{ id: "a" }, { id: "b" }];
    expect(move(roleList, 0, -1).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("SON rolü AŞAĞI taşımak hiçbir şey yapmaz (sınır)", () => {
    const roleList = [{ id: "a" }, { id: "b" }];
    expect(move(roleList, 1, 1).map((r) => r.id)).toEqual(["a", "b"]);
  });

  // Taşıma sırayı tersine çevirince eski bir reject GEÇERSİZ kalabilir —
  // normalizasyon (duzenleReddiTemizle) bunu TEMİZLEMELİ.
  it("taşıma SONRASI geçersiz kalan reject TEMİZLENİR", () => {
    const result = move([{ id: "a" }, { id: "b", reject: "a" }, { id: "c" }], 0, 1);
    // yeni sıra: b, a, c — b artık a'DAN ÖNCE, b'nin a'ya reject'i geçersiz.
    expect(result.map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(result.find((r) => r.id === "b")?.reject).toBeUndefined();
  });
});

describe("duzenleAdSanitize — DEVIR.md §3: ad girişi yalnızca a-z0-9-", () => {
  const sanitiseName = (value: string): string =>
    scriptFn<(d: string) => string>(renderPage("t"), "editSanitizeName")(value);

  it("zaten geçerli bir ad DEĞİŞMEDEN kalır", () => {
    expect(sanitiseName("coder-2")).toBe("coder-2");
  });

  it("BÜYÜK harfler küçültülür", () => {
    expect(sanitiseName("Coder")).toBe("coder");
  });

  it("izin verilmeyen karakterler (boşluk, nokta, alt çizgi) DÜŞÜRÜLÜR", () => {
    expect(sanitiseName("my role_1.v2")).toBe("myrole1v2");
  });

  it("baştaki/sondaki boşluk kırpılır", () => {
    expect(sanitiseName("  coder  ")).toBe("coder");
  });

  it("yalnızca boşluktan oluşan bir ad BOŞ dizeye düşer", () => {
    expect(sanitiseName("   ")).toBe("");
  });
});

describe("duzenleAdDegis — ad değişince reject/planlama.katilimcilar/denetci de güncellenir", () => {
  type DraftShape = { roles: EditRole[]; planlama?: { katilimcilar: string[]; denetci?: string } };
  const change = (draftState: DraftShape, i: number, newName: string): DraftShape =>
    scriptFn<(t: DraftShape, i: number, a: string) => DraftShape>(renderPage("t"), "editRenameRole")(draftState, i, newName);

  it("rolün kendi id'sini değiştirir", () => {
    const result = change({ roles: [{ id: "coder" }] }, 0, "yazar");
    expect(result.roles[0]?.id).toBe("yazar");
  });

  it("BAŞKA bir rolün 'reject'i eski ada işaret ediyorsa GÜNCELLENİR", () => {
    const draftState: DraftShape = { roles: [{ id: "coder" }, { id: "reviewer", reject: "coder" }] };
    const result = change(draftState, 0, "yazar");
    expect(result.roles[1]?.reject).toBe("yazar");
  });

  it("planlama.katilimcilar İÇİNDEKİ eski ad GÜNCELLENİR", () => {
    const draftState: DraftShape = {
      roles: [{ id: "coder" }, { id: "reviewer" }],
      planlama: { katilimcilar: ["coder"] },
    };
    const result = change(draftState, 0, "yazar");
    expect(result.planlama?.katilimcilar).toEqual(["yazar"]);
  });

  it("planlama.denetci eski ada işaret ediyorsa GÜNCELLENİR", () => {
    const draftState: DraftShape = {
      roles: [{ id: "coder" }, { id: "guard" }],
      planlama: { katilimcilar: ["coder"], denetci: "guard" },
    };
    const result = change(draftState, 1, "denetmen");
    expect(result.planlama?.denetci).toBe("denetmen");
  });

  it("İLGİSİZ bir rolün referansını DEĞİŞTİRMEZ", () => {
    const draftState: DraftShape = { roles: [{ id: "coder" }, { id: "reviewer", reject: "coder" }, { id: "guard" }] };
    const result = change(draftState, 2, "denetmen");
    expect(result.roles[1]?.reject).toBe("coder");
  });

  it("BOŞ ada yeniden adlandırma YOK SAYILIR — eski ad kalır", () => {
    const result = change({ roles: [{ id: "coder" }] }, 0, "");
    expect(result.roles[0]?.id).toBe("coder");
  });

  it("aynı ada 'değiştirmek' hiçbir referansa dokunmaz", () => {
    const draftState: DraftShape = { roles: [{ id: "coder" }, { id: "reviewer", reject: "coder" }] };
    const result = change(draftState, 0, "coder");
    expect(result.roles[1]?.reject).toBe("coder");
  });
});

describe("duzenleSil — rol silinince reject/syncBack/gates/planlama referansları temizlenir", () => {
  type Gate = { after: string; type: string };
  type DraftShape = {
    roles: EditRole[]; gates?: Gate[];
    planlama?: { katilimcilar: string[]; denetci?: string };
  };
  const remove = (draftState: DraftShape, id: string): DraftShape =>
    scriptFns<(t: DraftShape, id: string) => DraftShape>(
      renderPage("t"), ["editClearReject", "editBindInOrder", "editDelete"], "editDelete",
    )(draftState, id);

  it("rolü diziden ÇIKARIR", () => {
    const result = remove({ roles: [{ id: "a" }, { id: "b" }] }, "b");
    expect(result.roles.map((r) => r.id)).toEqual(["a"]);
  });

  it("ona 'reject' eden rolün referansını TEMİZLER", () => {
    const result = remove({ roles: [{ id: "a" }, { id: "b" }, { id: "c", reject: "b" }] }, "b");
    expect(result.roles.find((r) => r.id === "c")?.reject).toBeUndefined();
  });

  it("ona 'syncBack' eden rolün listesinden ÇIKARIR", () => {
    const result = remove({ roles: [{ id: "a", syncBack: ["b"] }, { id: "b" }] }, "b");
    expect(result.roles.find((r) => r.id === "a")?.syncBack).toEqual([]);
  });

  it("ona ait 'gates' girdisini KALDIRIR", () => {
    const result = remove({ roles: [{ id: "a" }, { id: "b" }], gates: [{ after: "b", type: "approval" }] }, "b");
    expect(result.gates).toEqual([]);
  });

  it("planlama.katilimcilar İÇİNDEN çıkarır, boşalırsa planlama TAMAMEN kalkar", () => {
    const result = remove({ roles: [{ id: "a" }, { id: "b" }], planlama: { katilimcilar: ["a"] } }, "a");
    expect(result.planlama).toBeUndefined();
  });

  it("denetçi silinirse planlama.denetci TEMİZLENİR (katılımcılar kalsa da)", () => {
    const result = remove(
      { roles: [{ id: "a" }, { id: "b" }, { id: "c" }], planlama: { katilimcilar: ["a"], denetci: "c" } },
      "c",
    );
    expect(result.planlama?.denetci).toBeUndefined();
    expect(result.planlama?.katilimcilar).toEqual(["a"]);
  });

  it("SON kalan rol SİLİNEMEZ", () => {
    const result = remove({ roles: [{ id: "a" }] }, "a");
    expect(result.roles).toHaveLength(1);
  });

  it("bilinmeyen bir id için hiçbir şey YAPMAZ", () => {
    const draftState = { roles: [{ id: "a" }, { id: "b" }] };
    expect(remove(draftState, "yok").roles).toHaveLength(2);
  });
});

describe("duzenlePlanlamaAyarla — katılım her zaman zincirin KESİNTİSİZ bir öneği", () => {
  const configure = (katilimcilar: string[], roleIds: string[], idx: number, joining: boolean): string[] =>
    scriptFn<(k: string[], r: string[], i: number, kt: boolean) => string[]>(
      renderPage("t"), "editSetPlanning",
    )(katilimcilar, roleIds, idx, joining);

  const ROLES = ["a", "b", "c", "d"];

  it("hiç katılımcı yokken İLK rolü katmak öneği bir uzatır", () => {
    expect(configure([], ROLES, 0, true)).toEqual(["a"]);
  });

  it("önekin TAM ARDINDAKİ rolü katmak öneği uzatır", () => {
    expect(configure(["a"], ROLES, 1, true)).toEqual(["a", "b"]);
  });

  // SIRA DIŞI istek: önek {a} iken DOĞRUDAN c'yi (idx 2) katmaya çalışmak
  // kuralı (19) ihlal ederdi — sessizce YOK SAYILIR.
  it("SIRA DIŞI bir katılım isteği YOK SAYILIR, önek değişmez", () => {
    expect(configure(["a"], ROLES, 2, true)).toEqual(["a"]);
  });

  it("zaten katılımcı olan bir role 'katıl' demek DEĞİŞTİRMEZ", () => {
    expect(configure(["a", "b"], ROLES, 0, true)).toEqual(["a", "b"]);
  });

  it("önekin SON elemanını çıkarmak öneği bir kısaltır", () => {
    expect(configure(["a", "b"], ROLES, 1, false)).toEqual(["a"]);
  });

  it("ortadan birini ÇIKARMAK onu ve ARDINDAKİ hepsini öneğin dışına atar", () => {
    expect(configure(["a", "b", "c"], ROLES, 1, false)).toEqual(["a"]);
  });

  it("katılımcı olmayan bir role 'çık' demek DEĞİŞTİRMEZ", () => {
    expect(configure(["a"], ROLES, 2, false)).toEqual(["a"]);
  });
});

describe("duzenleDenetciGecerle — kural 23: denetçi katılımcı OLAMAZ, katılımcılardan SONRA gelmeli", () => {
  const validate = (denetci: string | undefined, katilimcilar: string[], roleIds: string[]): string | undefined =>
    scriptFn<(d: string | undefined, k: string[], r: string[]) => string | undefined>(
      renderPage("t"), "editValidateAuditor",
    )(denetci, katilimcilar, roleIds);

  const ROLES = ["a", "b", "c", "d"];

  it("katılımcılardan SONRA gelen geçerli bir denetçiyi KORUR", () => {
    expect(validate("c", ["a", "b"], ROLES)).toBe("c");
  });

  it("denetçi bir KATILIMCIYSA temizlenir", () => {
    expect(validate("b", ["a", "b"], ROLES)).toBeUndefined();
  });

  it("denetçi katılımcılardan ÖNCE/ARASINDAYSA temizlenir", () => {
    expect(validate("a", ["a", "b"], ROLES)).toBeUndefined();
  });

  it("katılımcı YOKSA denetçi de anlamsız, temizlenir", () => {
    expect(validate("c", [], ROLES)).toBeUndefined();
  });

  it("denetçi tanımsızsa tanımsız kalır", () => {
    expect(validate(undefined, ["a"], ROLES)).toBeUndefined();
  });
});

describe("duzenlePlanlamaOzet — 'Yazar: X · itiraz: Y, Z' özeti", () => {
  const summary = (katilimcilar: string[]): string =>
    scriptFn<(k: string[]) => string>(renderPage("t"), "editPlanningSummary")(katilimcilar);

  it("katılımcı yoksa boş dize", () => {
    expect(summary([])).toBe("");
  });

  it("tek katılımcıda yalnızca yazar", () => {
    expect(summary(["planner"])).toBe("Yazar: planner");
  });

  it("birden çok katılımcıda ilk yazar, ötekiler itiraz", () => {
    expect(summary(["planner", "architect", "analyst"])).toBe("Yazar: planner · itiraz: architect, analyst");
  });
});

describe("duzenleNormallestir — kaydetmeden/önizlemeden önce uygulanan TAM normalizasyon", () => {
  type DraftShape = {
    roles: EditRole[];
    planlama?: { katilimcilar: string[]; denetci?: string; tur: number; plan: string; ilkTurKor: boolean };
  };
  const normalise = (draftState: DraftShape): DraftShape =>
    scriptFns<(t: DraftShape) => DraftShape>(
      renderPage("t"),
      ["editClearReject", "editBindInOrder", "editValidateAuditor", "editNormalise"],
      "editNormalise",
    )(draftState);

  it("next'i sıradan türetir", () => {
    const result = normalise({ roles: [{ id: "a" }, { id: "b" }] });
    expect(result.roles.map((r) => r.next)).toEqual(["b", "done"]);
  });

  it("geçersiz reject'i temizler", () => {
    const result = normalise({ roles: [{ id: "a", reject: "b" }, { id: "b" }] });
    expect(result.roles[0]?.reject).toBeUndefined();
  });

  it("planlama varken geçersiz kalmış denetçiyi temizler", () => {
    const result = normalise({
      roles: [{ id: "a" }, { id: "b" }],
      planlama: { katilimcilar: ["a", "b"], denetci: "b", tur: 1, plan: "docs/plan/{kart}.md", ilkTurKor: true },
    });
    expect(result.planlama?.denetci).toBeUndefined();
  });

  it("planlama yoksa denetçi adımını hiç ÇALIŞTIRMAZ (çökmez)", () => {
    expect(() => normalise({ roles: [{ id: "a" }] })).not.toThrow();
  });
});

/**
 * AKIŞLAR SEKMESİ — SAF karar fonksiyonları (DEVIR.md §4, kart
 * c-20261105-d36e37). DOM'a dokunan taraf (akisKartKur/
 * akislarEkraniCiz/yeniAkisAc) burada DEĞİL — gerçek tarayıcı gerektiren
 * kısım tarayici.test.ts'te (bkz. o dosyadaki "Akışlar sekmesi" describe).
 */
describe("akisOzetBul — AKISLAR_OZET içinde ad arama", () => {
  type Summary = { name: string; draft: unknown; error?: string };
  const find = (items: Summary[], nameText: string): Summary | null =>
    scriptFn<(l: Summary[], a: string) => Summary | null>(renderPage("t"), "findFlowSummary")(items, nameText);

  it("ad listede varsa o kaydı döner", () => {
    const items = [{ name: "a", draft: 1 }, { name: "b", draft: 2 }];
    expect(find(items, "b")).toEqual({ name: "b", draft: 2 });
  });

  it("ad listede yoksa null döner (başka bir kayıt UYDURMAZ)", () => {
    const items = [{ name: "a", draft: 1 }];
    expect(find(items, "yok")).toBeNull();
  });

  it("boş listede null döner", () => {
    expect(find([], "a")).toBeNull();
  });
});

describe("akisZinciriMetni — 'planner → … → bitti' metni", () => {
  const chainText = (roleIds: string[]): string =>
    scriptFn<(r: string[]) => string>(renderPage("t"), "flowChainText")(roleIds);

  it("roller varsa sırayla birleştirip 'bitti' ile biter", () => {
    expect(chainText(["planner", "architect", "coder"])).toBe("planner → architect → coder → bitti");
  });

  it("tek rolde de 'bitti' eklenir", () => {
    expect(chainText(["coder"])).toBe("coder → bitti");
  });

  // Akış bozuksa rol listesi bilinmiyor (bkz. akisKartKur) ama "bitti"
  // yine de doğru — mutasyon: "" dönmek ya da çökmek burada YAKALANIR.
  it("boş listede de yalnızca 'bitti' döner, çökmez", () => {
    expect(chainText([])).toBe("bitti");
  });
});

describe("akisKartSinifi — 'panoda' zemin kararı", () => {
  const sinif = (nameText: string, activeName: string): string =>
    scriptFn<(a: string, b: string) => string>(renderPage("t"), "flowCardClass")(nameText, activeName);

  it("aktif akışın kartı 'akisKart-panoda' taşır", () => {
    expect(sinif("test", "test")).toBe("akisKart akisKart-panoda");
  });

  it("başka bir akışın kartı taşımaz", () => {
    expect(sinif("test", "ikinci")).toBe("akisKart");
  });
});

describe("akisAdiGecerliMi — DEVIR.md §3/§4'ün a-z0-9- kısıtı", () => {
  const valid = (nameText: string): boolean =>
    scriptFn<(a: string) => boolean>(renderPage("t"), "isFlowNameValid")(nameText);

  it("küçük harf, sayı ve tire kabul edilir", () => {
    expect(valid("ab-planli-2")).toBe(true);
  });

  it("boş ad reddedilir", () => {
    expect(valid("")).toBe(false);
  });

  it("büyük harf reddedilir (sessizce düşürülmez, dizge TAMAMEN düşer)", () => {
    expect(valid("Kopya")).toBe(false);
  });

  it("boşluk ve diğer özel karakterler reddedilir", () => {
    expect(valid("kopya adi")).toBe(false);
    expect(valid("kopya/adi")).toBe(false);
  });
});

describe("yeniAkisGecerliMi — 'Oluştur ve düzenle' düğmesinin etkinlik kararı", () => {
  const valid = (nameText: string, mevcut: string[]): boolean =>
    scriptFns<(a: string, m: string[]) => boolean>(
      renderPage("t"), ["isFlowNameValid", "isNewFlowValid"], "isNewFlowValid",
    )(nameText, mevcut);

  it("geçerli ve benzersiz adı kabul eder", () => {
    expect(valid("yeni-akis", ["test", "ikinci"])).toBe(true);
  });

  it("zaten var olan adı reddeder (benzersizlik)", () => {
    expect(valid("test", ["test", "ikinci"])).toBe(false);
  });

  it("geçersiz karakterli adı reddeder, listede olmasa bile", () => {
    expect(valid("Yeni Akis", ["test"])).toBe(false);
  });
});

// --- Promptlar sekmesi (DEVIR.md §5) ---

type Prompt = { label: string; path: string };
type SummaryDraft = { constitution: string[]; roles: { id: string; prompt: string }[] };
type Summary = { name: string; draft: SummaryDraft | null };

/**
 * FLOWGORELIYOLKOKECEVIR — AKISLAR_OZET'in draft'ları FLOW DOSYASININ
 * KENDİ DİZİNİNE göre relatif (bkz. flow/draft.ts fromFlow 'goreli'),
 * /promptlar'ın listesi KÖK-RELATİF. Bu fonksiyon ikisini AYNI tabana
 * getiriyor — yanlış çevrilirse promptKullananListesi AYNI dosyayı
 * "kullanılmıyor" sayar (bkz. onun kendi sınamaları, altta).
 */
describe("flowGoreliYolKokeCevir — flow-relatif yolu KÖK-relatife çevirir", () => {
  const translate = (relPath: string): string =>
    scriptFn<(g: string) => string>(renderPage("t"), "flowRelativePathToRoot")(relPath);

  it("'../' ile dizin yukarı çıkan yolu doğru çözer", () => {
    expect(translate("../prompts/constitution/base.md")).toBe("hub/prompts/constitution/base.md");
  });

  it("'./' önekli (flow dizininin kendi içindeki) yolu doğru çözer", () => {
    expect(translate("./coder.md")).toBe("hub/flows/coder.md");
  });

  // ÖNEK YOKSA (fromFlow'un 'goreli'si "." ile başlamayan her yola "./"
  // ekler, ama bu fonksiyon öneksiz bir girdiyi de ÇÖKMEDEN çözmeli) —
  // "pop yerine push" ya da ayraç hatası burada YAKALANIR.
  it("önek olmadan da (iki üst dizine çıkma) doğru çözer", () => {
    expect(translate("../../roles/coder.prompt")).toBe("roles/coder.prompt");
  });
});

describe("dosyaAdiKisa — uzantısız kısa dosya adı", () => {
  const nameText = (path: string): string => scriptFn<(y: string) => string>(renderPage("t"), "shortFileName")(path);

  it("yolun son parçasından uzantıyı KALDIRIR", () => {
    expect(nameText("hub/prompts/roles/coder.md")).toBe("coder");
  });

  it("tireli dosya adında SON noktadan keser, ortadaki tireyi KORUR", () => {
    expect(nameText("hub/prompts/constitution/engineering-ts.md")).toBe("engineering-ts");
  });

  it("uzantısı yoksa yolun son parçasını AYNEN döner", () => {
    expect(nameText("coder")).toBe("coder");
  });
});

/**
 * PROMPTKULLANANLISTESI — "Kullanan" satırı + kullanım sayısının
 * KAYNAĞI (DEVIR.md §5). flowGoreliYolKokeCevir'e bağlı,
 * 'fonksiyonlar' ile BİRLİKTE çıkarılıyor.
 */
describe("promptKullananListesi — bir prompt dosyasının kullanıcıları", () => {
  const users = (p: Prompt[], o: Summary[], activeName: string, path: string) =>
    scriptFns<(p: Prompt[], o: Summary[], a: string, y: string) => { akis: string; roleRec: string | null }[]>(
      renderPage("t"), ["flowRelativePathToRoot", "promptUsersList"], "promptUsersList",
    )(p, o, activeName, path);

  const prompts: Prompt[] = [
    { label: "anayasa:1", path: "hub/prompts/constitution/base.md" },
    { label: "rol:coder", path: "hub/prompts/roles/coder.md" },
  ];

  it("AKTİF akışta rol promptu kullanılıyorsa {akis, rol} döner", () => {
    expect(users(prompts, [], "ab-planli", "hub/prompts/roles/coder.md"))
      .toEqual([{ akis: "ab-planli", roleRec: "coder" }]);
  });

  it("AKTİF akışta anayasa dosyası kullanılıyorsa rol NULL döner (tüm rollere veriliyor)", () => {
    expect(users(prompts, [], "ab-planli", "hub/prompts/constitution/base.md"))
      .toEqual([{ akis: "ab-planli", roleRec: null }]);
  });

  // AKISLAR_OZET'TEKİ AKTİF AKIŞ GİRDİSİ ATLANIYOR: 'promptlar'dan ZATEN
  // sayıldı. Bu dal YANLIŞ olsaydı sonuç [coder, coder] (iki kez) olurdu.
  it("AKISLAR_OZET'te AKTİF akış da varsa İKİ KEZ saymaz", () => {
    const summary: Summary[] = [
      {
        name: "ab-planli",
        draft: { constitution: [], roles: [{ id: "coder", prompt: "../prompts/roles/coder.md" }] },
      },
    ];
    expect(users(prompts, summary, "ab-planli", "hub/prompts/roles/coder.md"))
      .toEqual([{ akis: "ab-planli", roleRec: "coder" }]);
  });

  // flow-relatif yol (AKISLAR_OZET'in draft'ı) KÖK-relatife ÇEVRİLEREK
  // karşılaştırılıyor — çevrilmeseydi bu DİĞER akış hiç bulunamazdı.
  it("DİĞER bir akış AYNI dosyayı (flow-relatif yazılmış) kullanıyorsa da bulur", () => {
    const summary: Summary[] = [
      { name: "baska-akis", draft: { constitution: [], roles: [{ id: "reviewer", prompt: "../prompts/roles/coder.md" }] } },
    ];
    expect(users(prompts, summary, "ab-planli", "hub/prompts/roles/coder.md"))
      .toEqual([{ akis: "ab-planli", roleRec: "coder" }, { akis: "baska-akis", roleRec: "reviewer" }]);
  });

  it("DİĞER bir akış AYNI anayasa dosyasını kullanıyorsa rol NULL olarak eklenir", () => {
    const summary: Summary[] = [
      { name: "baska-akis", draft: { constitution: ["../prompts/constitution/base.md"], roles: [] } },
    ];
    expect(users(prompts, summary, "ab-planli", "hub/prompts/constitution/base.md"))
      .toEqual([{ akis: "ab-planli", roleRec: null }, { akis: "baska-akis", roleRec: null }]);
  });

  // BOZUK AKIŞ (draft: null, bkz. akisOzetiYukle, server.ts) ÇÖKMEDEN
  // atlanıyor — "bir akışın bozulması listenin GERİ KALANINI göstermeyi
  // engellememeli" ilkesinin bu ekrandaki karşılığı.
  it("draft'ı null olan (bozuk) bir akış çökmeden atlanır", () => {
    const summary: Summary[] = [{ name: "bozuk", draft: null }];
    expect(users(prompts, summary, "ab-planli", "hub/prompts/roles/coder.md"))
      .toEqual([{ akis: "ab-planli", roleRec: "coder" }]);
  });

  it("hiçbir akış kullanmıyorsa boş dizi döner", () => {
    expect(users(prompts, [], "ab-planli", "hub/prompts/roles/baska.md")).toEqual([]);
  });
});

describe("promptKullanimSayisi — 'N rol · M akış' sayımı", () => {
  const count = (items: { akis: string; roleRec: string | null }[]) =>
    scriptFn<(l: { akis: string; roleRec: string | null }[]) => { roleRec: number; akis: number }>(
      renderPage("t"), "promptUsageCount",
    )(items);

  it("rol SAYISINI rolü null OLMAYANLARDAN sayar", () => {
    expect(count([{ akis: "a", roleRec: "coder" }, { akis: "a", roleRec: null }])).toEqual({ roleRec: 1, akis: 1 });
  });

  // AYNI akış İKİ KEZ geçse de (iki rol aynı dosyayı kullanıyor) akış
  // sayısı BİR kalmalı — Set burada YANLIŞ bir diziye (push) dönseydi bu
  // sınama YAKALARDI.
  it("akış sayısını TEKİL akış adlarından sayar (aynı akışta iki rol → 1 akış)", () => {
    expect(count([{ akis: "a", roleRec: "coder" }, { akis: "a", roleRec: "reviewer" }])).toEqual({ roleRec: 2, akis: 1 });
  });

  it("boş listede ikisi de sıfır", () => {
    expect(count([])).toEqual({ roleRec: 0, akis: 0 });
  });
});

/**
 * PROMPTKULLANIMETIKETI — "N rol · M akış" ya da "kullanılmıyor"
 * (DEVIR.md §5).
 */
describe("promptKullanimEtiketi — kullanım metni", () => {
  const label = (roleRec: number, akis: number): string =>
    scriptFn<(r: number, a: number) => string>(renderPage("t"), "promptUsageLabel")(roleRec, akis);

  it("ikisi de sıfırsa 'kullanılmıyor' der", () => {
    expect(label(0, 0)).toBe("kullanılmıyor");
  });

  it("rol ve akış sayısını BİRLİKTE yazar", () => {
    expect(label(2, 1)).toBe("2 rol · 1 akış");
  });

  // "&&" YERİNE "||" YAZILSAYDI: rol=0 ama akis>0 olan (anayasa dosyası,
  // hiçbir role doğrudan BAĞLI değil ama bir akış tarafından kullanılıyor)
  // bir dosya YANLIŞLIKLA "kullanılmıyor" derdi. Bu iki sınama TAM O
  // mutasyonu öldürür.
  it("rol sıfır ama akış sıfır DEĞİLSE (anayasa dosyası) 'kullanılmıyor' DEMEZ", () => {
    expect(label(0, 2)).toBe("0 rol · 2 akış");
  });

  it("akış sıfır ama rol sıfır DEĞİLSE de 'kullanılmıyor' DEMEZ", () => {
    expect(label(3, 0)).toBe("3 rol · 0 akış");
  });
});

/**
 * AJANOKUMASIRASI — "base → engineering-ts → rol promptu → kart metni"
 * şeridi (DEVIR.md §5). dosyaAdiKisa'ya bağlı, BİRLİKTE çıkarılıyor.
 */
describe("ajanOkumaSirasi — 'Ajanın okuduğu sıra' şeridi", () => {
  type Step = { label: string; accented: boolean };
  const order = (p: Prompt[], selected: string | null): Step[] =>
    scriptFns<(p: Prompt[], s: string | null) => Step[]>(
      renderPage("t"), ["shortFileName", "agentReadOrder"], "agentReadOrder",
    )(p, selected);

  const prompts: Prompt[] = [
    { label: "anayasa:1", path: "hub/prompts/constitution/base.md" },
    { label: "anayasa:2", path: "hub/prompts/constitution/engineering-ts.md" },
    { label: "rol:coder", path: "hub/prompts/roles/coder.md" },
    { label: "rol:reviewer", path: "hub/prompts/roles/reviewer.md" },
  ];

  it("anayasa sırası + seçili ROL + 'kart metni' ile biter", () => {
    const steps = order(prompts, "hub/prompts/roles/coder.md");
    expect(steps.map((a) => a.label)).toEqual(["base", "engineering-ts", "coder", "kart metni"]);
  });

  it("seçili dosya rol promptuysa SADECE o adım 'vurgulu'", () => {
    const steps = order(prompts, "hub/prompts/roles/coder.md");
    expect(steps.map((a) => a.accented)).toEqual([false, false, true, false]);
  });

  // ANAYASA dosyası seçiliyken ÖRNEK rol İLK rol — anayasa akıştaki HER
  // role AYNI sırada verildiği için hangisi gösterildiği şeridin ANLAMINI
  // değiştirmiyor; "vurgulu" yine de doğru anayasa adımına düşmeli.
  it("anayasa dosyası seçiliyken İLK rol örnek gösterilir, O vurgulu DEĞİL", () => {
    const steps = order(prompts, "hub/prompts/constitution/engineering-ts.md");
    expect(steps.map((a) => a.label)).toEqual(["base", "engineering-ts", "coder", "kart metni"]);
    expect(steps.map((a) => a.accented)).toEqual([false, true, false, false]);
  });

  it("'kart metni' adımı HİÇBİR seçimde vurgulu olamaz (yol: null)", () => {
    const steps = order(prompts, "hub/prompts/roles/reviewer.md");
    expect(steps[steps.length - 1]).toEqual({ label: "kart metni", accented: false });
  });

  it("akışta hiç rol yoksa ÇÖKMEZ, rol adımı eklenmeden 'kart metni' ile biter", () => {
    const constitutionOnly = prompts.filter((p) => p.label.startsWith("anayasa:"));
    const steps = order(constitutionOnly, null);
    expect(steps.map((a) => a.label)).toEqual(["base", "engineering-ts", "kart metni"]);
  });

  // 'yol: null' TAŞIYAN TEK adım "kart metni"; seçili yol da null OLABİLİR
  // (örn. hiç rol yok). "a.yol !== null" korumasını KALDIRIP sade
  // "a.yol === seciliYol" yazılsaydı bu durumda null === null olup "kart
  // metni" YANLIŞLIKLA vurgulu görünürdü.
  it("seçili yol null İKEN 'kart metni' (yol: null) YİNE DE vurgulu OLMAZ", () => {
    const constitutionOnly = prompts.filter((p) => p.label.startsWith("anayasa:"));
    const steps = order(constitutionOnly, null);
    expect(steps.map((a) => a.accented)).toEqual([false, false, false]);
  });
});

describe("promptKirliMi — editördeki metin disktekinden FARKLI mı", () => {
  const dirty = (original: Record<string, string>, text: Record<string, string>, path: string): boolean =>
    scriptFn<(o: Record<string, string>, m: Record<string, string>, y: string) => boolean>(
      renderPage("t"), "isPromptDirty",
    )(original, text, path);

  it("henüz YÜKLENMEMİŞ bir dosya (metin[yol] undefined) kirli SAYILMAZ", () => {
    expect(dirty({}, {}, "x")).toBe(false);
  });

  it("editör metni disktekiyle AYNIYSA temiz", () => {
    expect(dirty({ x: "a" }, { x: "a" }, "x")).toBe(false);
  });

  it("editör metni disktekinden FARKLIYSA kirli", () => {
    expect(dirty({ x: "a" }, { x: "a-degisti" }, "x")).toBe(true);
  });
});

describe("promptKaydedilmemisSayisi — Promptlar nav rozetinin sayısı", () => {
  const count = (original: Record<string, string>, text: Record<string, string>): number =>
    scriptFns<(o: Record<string, string>, m: Record<string, string>) => number>(
      renderPage("t"), ["isPromptDirty", "promptUnsavedCount"], "promptUnsavedCount",
    )(original, text);

  it("hiçbir dosya düzenlenmemişse 0", () => {
    expect(count({}, {})).toBe(0);
  });

  it("yalnızca DEĞİŞTİRİLMİŞ dosyaları sayar, temiz olanları saymaz", () => {
    const original = { a: "1", b: "2" };
    const text = { a: "1-degisti", b: "2" };
    expect(count(original, text)).toBe(1);
  });

  it("birden fazla dosya aynı anda kirli olabilir", () => {
    const original = { a: "1", b: "2" };
    const text = { a: "1-degisti", b: "2-degisti" };
    expect(count(original, text)).toBe(2);
  });
});

describe("promptDurumMetni — sabit alt çubuğun durum metni", () => {
  const text = (dirty: boolean): string =>
    scriptFn<(k: boolean) => string>(renderPage("t"), "promptStatusText")(dirty);

  it("kirliyse 'kaydedilmemiş değişiklik' der", () => {
    expect(text(true)).toBe("kaydedilmemiş değişiklik");
  });

  it("temizse 'kaydedildi' der", () => {
    expect(text(false)).toBe("kaydedildi");
  });
});

// --- Ajanlar sekmesi (DEVIR.md §6, kart c-20261105-d304ed) ---

type AgentCard = {
  role: string; state: string; gate?: string | null; orphan?: boolean; title?: string;
  live?: { name: string | null; kind: string; detail: string | null } | null;
};

describe("ajanGuncelKart — rolün 'güncel' kartı", () => {
  const current = (roleIdent: string, cards: AgentCard[]): AgentCard | null =>
    scriptFns<(r: string, c: AgentCard[]) => AgentCard | null>(
      renderPage("t"), ["roleOpenCards", "agentCurrentCard"], "agentCurrentCard",
    )(roleIdent, cards);

  it("hiç kart yoksa null", () => {
    expect(current("coder", [])).toBeNull();
  });

  it("koşan kart varsa ONU verir — kuyruktaki/bitmiş kartları saymaz", () => {
    const runningFlag: AgentCard = { role: "coder", state: "active", title: "x" };
    expect(current("coder", [
      { role: "coder", state: "done", title: "bitmiş" },
      runningFlag,
      { role: "coder", state: "queued", title: "kuyrukta" },
    ])).toEqual(runningFlag);
  });

  it("koşan yoksa KAPIDA bekleyen kartı verir", () => {
    const atGate: AgentCard = { role: "coder", state: "gate", gate: "approval", title: "k" };
    expect(current("coder", [atGate])).toEqual(atGate);
  });

  // ÖNCELİK: ikisi de varsa (nadir ama olanaklı — toplu alım yapan bir
  // rolün BİR kartı koşuyorken ÖTEKİ kapıda bekleyebilir) KOŞAN kazanır.
  // "şu an ne oluyor" sorusunun cevabı bu — kapıda bekleyen zaten İNSANI
  // bekliyor, operatörün önce görmesi gereken şey KOŞAN.
  it("hem koşan hem kapıda kart varsa KOŞAN kazanır", () => {
    const runningFlag: AgentCard = { role: "coder", state: "active", title: "koşan" };
    const atGate: AgentCard = { role: "coder", state: "gate", gate: "approval", title: "kapıda" };
    expect(current("coder", [atGate, runningFlag])).toEqual(runningFlag);
  });

  it("ne koşan ne kapıda varsa (yalnızca kuyrukta) null", () => {
    expect(current("coder", [{ role: "coder", state: "queued", title: "x" }])).toBeNull();
  });

  // YETİM kartlar rolün KARTI SAYILMAZ — formasyon düğümüyle AYNI filtre
  // (rolunAcikKartlari), ikinci bir "bu role ait mi" yorumu YOK.
  it("yetim kart sayılmaz, başka rolün kartı sayılmaz", () => {
    expect(current("coder", [
      { role: "coder", state: "active", orphan: true, title: "yetim" },
      { role: "reviewer", state: "active", title: "başka rol" },
    ])).toBeNull();
  });
});

describe("ajanDurumMetni — DEVIR.md §6'nın beş durum metni", () => {
  const ON = { alive: true };
  const CLOSED = null;
  // ajanDurumMetni artık kararı paylaşılan ajanSuAnDurumu'ndan okuyor
  // (bkz. page.ts yorumu — ajanSuAnKutuKur İKİSİ aynı karardan geçsin
  // diye); o yüzden tek başına değil, ikisi BİRLİKTE çıkarılıyor
  // (rolKonumu/FORMASYON_GOVDE çiftinin aynı deseni, bkz. fonksiyonlar).
  const durum = (role: { depth: number }, card: AgentCard | null, daemon: unknown): string =>
    scriptFns<(r: { depth: number }, k: AgentCard | null, d: unknown) => string>(
      renderPage("t"), ["agentCurrentState", "agentStatusText"], "agentStatusText",
    )(role, card, daemon);

  it("boşta: kart yok, kuyruk boş", () => {
    expect(durum({ depth: 0 }, null, ON)).toBe("boşta");
  });

  it("N kart kuyrukta: kart yok ama kuyruk dolu", () => {
    expect(durum({ depth: 3 }, null, ON)).toBe("3 kart kuyrukta");
  });

  it("kapıda bekliyor: kart kapıda, başlığıyla birlikte", () => {
    const card: AgentCard = { role: "coder", state: "gate", gate: "approval", title: "jitter ekle" };
    expect(durum({ depth: 0 }, card, ON)).toBe("kapıda bekliyor · jitter ekle");
  });

  it("araç · ayrıntı: koşuyor, gözcü açık, canlı adım var", () => {
    const card: AgentCard = {
      role: "coder", state: "active", title: "x",
      live: { name: "Bash", kind: "tool", detail: "npx vitest run" },
    };
    expect(durum({ depth: 0 }, card, ON)).toBe("Bash · npx vitest run");
  });

  it("çalışıyor: koşuyor, gözcü açık, henüz hiç adım yok", () => {
    const card: AgentCard = { role: "coder", state: "active", title: "x", live: null };
    expect(durum({ depth: 0 }, card, ON)).toBe("çalışıyor");
  });

  /**
   * SAPMALAR.md §2.6'nın "bayat kilitte düğme 'durdur' DEMEZ" kuralıyla
   * AYNI ilke: kart "active" olsa bile gözcü çökmüşse ona dokunan bir
   * süreç yok — "Bash · …" demek var olmayan bir işlemi varmış gibi
   * göstermek olurdu.
   */
  it("gözcü kapalı · … yarıda: kart active ama gözcü ÖLÜ (bayat kilit)", () => {
    const card: AgentCard = {
      role: "coder", state: "active", title: "jitter ekle",
      live: { name: "Bash", kind: "tool", detail: "npx vitest run" },
    };
    expect(durum({ depth: 0 }, card, CLOSED)).toBe("gözcü kapalı · jitter ekle yarıda");
  });

  it("gözcü kapalı: daemon alive:false iken de aynı dal çalışır", () => {
    const card: AgentCard = { role: "coder", state: "active", title: "x" };
    expect(durum({ depth: 0 }, card, { alive: false })).toBe("gözcü kapalı · x yarıda");
  });
});

/**
 * ajanSuAnDurumu — ajanDurumMetni (sol satır) VE ajanSuAnKutuKur (sağ
 * "Şu an" kutusu) İKİSİNİN DE okuduğu PAYLAŞILAN karar (bkz. page.ts
 * yorumu). Üstteki describe zaten bu kararı ajanDurumMetni'nin METNİ
 * üzerinden dolaylı sınıyor; burada doğrudan ŞEKLİ (tur + live) sınanıyor
 * — reviewer'ın b64fe2f itirazının tam karşılığı: iki yüzeyin AYRI AYRI
 * karar vermesi önce buradan, tek bir yerden kesiliyor.
 */
describe("ajanSuAnDurumu — iki yüzeyin paylaştığı karar", () => {
  type AgentStatus = { tur: string; live?: { name?: string; kind?: string; detail?: string } };
  const durum = (card: AgentCard | null, daemon: unknown): AgentStatus | null =>
    scriptFn<(k: AgentCard | null, d: unknown) => AgentStatus | null>(
      renderPage("t"), "agentCurrentState",
    )(card, daemon);

  it("kart yoksa null — çağıran kendi 'boşta'/'kuyrukta' kararını verir", () => {
    expect(durum(null, { alive: true })).toBeNull();
  });

  it("kart kapıda (active değil) — gözcü durumu FARK ETMEZ", () => {
    const card: AgentCard = { role: "coder", state: "gate", gate: "approval", title: "x" };
    expect(durum(card, { alive: true })).toEqual({ tur: "kapida" });
    expect(durum(card, null)).toEqual({ tur: "kapida" });
  });

  // SINIR: gözcü ÖLÜYSE (daemon null YA DA alive:false) bu dal "live"dan
  // ÖNCE devreye girer — kartın "live" alanı dolu olsa BİLE.
  it("active + gözcü ÖLÜ (daemon null) — gozcuKapali, live alanı YOK SAYILIR", () => {
    const card: AgentCard = {
      role: "coder", state: "active", title: "x",
      live: { name: "Bash", kind: "tool", detail: "npx vitest run" },
    };
    expect(durum(card, null)).toEqual({ tur: "gozcuKapali" });
  });

  it("active + gözcü ÖLÜ (daemon.alive === false) — gozcuKapali", () => {
    const card: AgentCard = { role: "coder", state: "active", title: "x" };
    expect(durum(card, { alive: false })).toEqual({ tur: "gozcuKapali" });
  });

  it("active + gözcü AÇIK + live var — live, live'ın KENDİSİ taşınır", () => {
    const live = { name: "Bash", kind: "tool", detail: "npx vitest run" };
    const card: AgentCard = { role: "coder", state: "active", title: "x", live };
    expect(durum(card, { alive: true })).toEqual({ tur: "live", live });
  });

  it("active + gözcü AÇIK + live yok — calisiyor", () => {
    const card: AgentCard = { role: "coder", state: "active", title: "x", live: null };
    expect(durum(card, { alive: true })).toEqual({ tur: "calisiyor" });
  });
});

describe("promptGorevOzeti — 'Görevi · promptundan' bloğunun ayrıştırması", () => {
  const summary = (text: string): { entry: string; title: string | null; clauses: string[] } =>
    scriptFn<(m: string) => { entry: string; title: string | null; clauses: string[] }>(
      renderPage("t"), "promptTaskSummary",
    )(text);

  it("boş metinde boş özet döner", () => {
    expect(summary("")).toEqual({ entry: "", title: null, clauses: [] });
  });

  // server.ts'in rolPromptSablonu'nun TAM biçimi: başlıktan hemen sonra
  // bölüm geliyor, GİRİŞ PARAGRAFI yok.
  it("şablonun kendisi — giriş boş, ilk bölümün maddeleri alınır", () => {
    const text = "# Rolün: coder\n\n## Sahiplendiğin\n\n" +
      "- (bu rol hangi davranışı/işi üstleniyor?)\n\n## Nasıl çalışırsın\n\n- ilgisiz\n";
    expect(summary(text)).toEqual({
      entry: "", title: "Sahiplendiğin",
      clauses: ["(bu rol hangi davranışı/işi üstleniyor?)"],
    });
  });

  it("başlık ve ilk '##' arasındaki düz metni GİRİŞ sayar", () => {
    const text = "# Rolün: coder\n\nKısa bir açıklama cümlesi.\nİkinci satır.\n\n" +
      "## Sahiplendiğin\n\n- madde 1\n";
    expect(summary(text).entry).toBe("Kısa bir açıklama cümlesi. İkinci satır.");
  });

  it("'* ' işaretli maddeleri de '- ' kadar madde sayar", () => {
    const text = "# x\n\n## Sahiplendiğin\n\n* bir\n* iki\n";
    expect(summary(text).clauses).toEqual(["bir", "iki"]);
  });

  it("madde OLMAYAN düz metin satırlarını listeye KATMAZ", () => {
    const text = "# x\n\n## Sahiplendiğin\n\nbu bir madde değil\n- bu bir madde\n";
    expect(summary(text).clauses).toEqual(["bu bir madde"]);
  });

  // EN FAZLA 5 — DEVIR.md'nin kendi sınırı.
  it("ilk bölümde 5'ten fazla madde varsa yalnızca İLK 5'i alır", () => {
    const text = "# x\n\n## Sahiplendiğin\n\n" + [1, 2, 3, 4, 5, 6, 7].map((n) => "- madde " + n).join("\n") + "\n";
    expect(summary(text).clauses).toEqual(["madde 1", "madde 2", "madde 3", "madde 4", "madde 5"]);
  });

  it("ilk bölümden SONRAKİ bölümlerin maddelerini saymaz", () => {
    const text = "# x\n\n## Sahiplendiğin\n\n- bir\n\n## Nasıl çalışırsın\n\n- iki\n- üç\n";
    expect(summary(text).clauses).toEqual(["bir"]);
  });

  it("hiç '##' bölümü yoksa baslik null, maddeler boş, her şey GİRİŞ sayılır", () => {
    const text = "# x\n\nyalnızca düz metin, bölüm yok.\n";
    expect(summary(text)).toEqual({ entry: "yalnızca düz metin, bölüm yok.", title: null, clauses: [] });
  });

  it("başlık satırı ('# ...') hiç yoksa her şey yine doğru ayrıştırılır", () => {
    const text = "## Sahiplendiğin\n\n- tek madde\n";
    expect(summary(text)).toEqual({ entry: "", title: "Sahiplendiğin", clauses: ["tek madde"] });
  });
});

describe("ajanCanliMi — 'canlı' etiketi ve /adimlar yoklama kararı", () => {
  const isLive = (card: AgentCard | null, daemon: unknown): boolean =>
    scriptFn<(k: AgentCard | null, d: unknown) => boolean>(renderPage("t"), "isAgentLive")(card, daemon);

  it("kart yoksa canlı değil", () => {
    expect(isLive(null, { alive: true })).toBe(false);
  });

  it("kart active VE gözcü canlıysa canlı", () => {
    expect(isLive({ role: "coder", state: "active" }, { alive: true })).toBe(true);
  });

  it("kart active ama gözcü ÖLÜYSE canlı DEĞİL", () => {
    expect(isLive({ role: "coder", state: "active" }, null)).toBe(false);
  });

  it("kart kapıda (active değil) canlı DEĞİL", () => {
    expect(isLive({ role: "coder", state: "gate", gate: "approval" }, { alive: true })).toBe(false);
  });
});

/**
 * GÖVDEYOLU — devredilen bir kartın uçuş yolu (kart c-20261106-d6e795,
 * "kuşlar V üzerinde yol alsın"). `planlamaBandYolu`nun aynı "tepeden
 * dolan" kuralının YÖNDEN BAĞIMSIZ hâli — devir (ret) kaynaktan hedefe
 * GERİYE de gidebilir, planlama bandı gibi hep zincir sırasıyla değil.
 */
describe("govdeYolu — uçuşun gövde çizgisi üzerindeki yolu", () => {
  type Position = { x: number; y: number; arm: string };
  const apex: Position = { x: 500, y: 480, arm: "tepe" };
  const path = (a: Position, b: Position): Position[] =>
    scriptFn<(a: Position, b: Position, t: Position) => Position[]>(renderPage("t"), "bodyPath")(a, b, apex);

  it("aynı koldaki iki nokta DÜZ yol alır (2 nokta), tepeden dolanmaz", () => {
    const a = { x: 230, y: 110, arm: "sol" };
    const b = { x: 365, y: 295, arm: "sol" };
    expect(path(a, b)).toEqual([a, b]);
  });

  it("farklı kollardaki iki nokta TEPEDEN dolanır (3 nokta)", () => {
    const a = { x: 230, y: 110, arm: "sol" };
    const b = { x: 770, y: 110, arm: "sag" };
    expect(path(a, b)).toEqual([a, apex, b]);
  });

  // YÖNDEN BAĞIMSIZ: ret bir kartı SAĞ koldan SOL koldaki bir role
  // geri gönderebilir — planlamaBandYolu'nun "ilk sol, son sağ" varsayımı
  // burada YOK, hangisi önce verilirse verilsin aynı dolanma üretilir.
  it("YÖN TERS OLSA DA (sağdan sola) aynı dolanmayı üretir", () => {
    const a = { x: 770, y: 110, arm: "sag" };
    const b = { x: 230, y: 110, arm: "sol" };
    expect(path(a, b)).toEqual([a, apex, b]);
  });

  it("biri tepedeyse dolanmaz (zaten aynı doğru üzerinde)", () => {
    const a = { x: 230, y: 110, arm: "sol" };
    expect(path(a, apex)).toEqual([a, apex]);
  });
});

/**
 * UCUSSURESIMS — SAPMALAR.md §2.7'nin "nitelik doğru, ekranda doğru
 * değil" sınıfına düşmeyecek kadar BASİT bir karar: iki hâl, mutasyona
 * açık tek bir karşılaştırma.
 */
describe("ucusSuresiMs — uçuşun süresi", () => {
  type Position = { x: number; y: number };
  const duration = (path: Position[]): number =>
    scriptFn<(y: Position[]) => number>(renderPage("t"), "flightDurationMs")(path);

  it("düz yol (2 nokta) KISA sürede uçar (600ms)", () => {
    expect(duration([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe(600);
  });

  // SINIR: "yol.length > 2" ters çevrilirse (örn. ">=" ya da "< 2")
  // bu sınama ya ÖNCEKİ testle ya da bununla düşer.
  it("tepeden dolanan yol (3 nokta) UZUN sürede uçar (900ms)", () => {
    expect(duration([{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }])).toBe(900);
  });
});

/**
 * YUMUSAKILERLEME — DEVIR görevinin "yumuşak giriş/çıkış" istediği eğri
 * (smoothstep). Doğrusal ilerlemenin KENDİSİ olmadığını (ease-in/out
 * gerçekten var) üç noktada pinler.
 */
describe("yumusakIlerleme — ease-in/out eğrisi", () => {
  const progress = (t: number): number =>
    scriptFn<(t: number) => number>(renderPage("t"), "easeProgress")(t);

  it("uçlarda (0 ve 1) sınır değerleri korunur", () => {
    expect(progress(0)).toBe(0);
    expect(progress(1)).toBe(1);
  });

  it("ortada (0.5) doğrusalla AYNI noktaya düşer (simetrik eğri)", () => {
    expect(progress(0.5)).toBeCloseTo(0.5);
  });

  // EASE-IN: başta doğrusaldan YAVAŞ — t=0.25 doğrusal olsaydı 0.25
  // olurdu, smoothstep'te DAHA AZ. Doğrusal t kullanılsaydı (mutasyon:
  // "return t;") bu sınama düşer.
  it("başta doğrusaldan YAVAŞ (ease-in), t=0.25 < 0.25 döner", () => {
    expect(progress(0.25)).toBeLessThan(0.25);
    expect(progress(0.25)).toBeCloseTo(0.15625);
  });
});

/**
 * UCUSKONUMU — bir uçuş yolu üzerinde YAY UZUNLUĞUNA göre örnekleme
 * (SAPMALAR.md §2.7'nin asıl uyardığı yer: "nitelik doğru" ile "ekranda
 * doğru" ayrı iddialardır — bu fonksiyon o ikincisinin SAF, ölçülebilir
 * karşılığı; GERÇEK tarayıcıda ARA KAREDE ÖLÇÜLEN hâli tarayici.test.ts'te).
 */
describe("ucusKonumu — yol üzerindeki ara nokta", () => {
  type Point = { x: number; y: number };
  const position = (path: Point[], t: number): Point =>
    scriptFn<(y: Point[], t: number) => Point>(renderPage("t"), "flightPosition")(path, t);

  it("t=0 KAYNAKTA, t=1 HEDEFTE durur (2 noktalı düz yol)", () => {
    const path = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    expect(position(path, 0)).toEqual({ x: 0, y: 0 });
    expect(position(path, 1)).toEqual({ x: 10, y: 0 });
  });

  it("t=0.5 KAYNAK İLE HEDEF ARASINDA durur, İKİSİNE DE eşit DEĞİL", () => {
    const path = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const dot = position(path, 0.5);
    expect(dot).toEqual({ x: 5, y: 0 });
    expect(dot).not.toEqual(path[0]);
    expect(dot).not.toEqual(path[1]);
  });

  // EŞİT SEGMENTLİ 3 noktalı yol (tepeden dolanan bir uçuşun tipik
  // şekli): t=0.5 TAM ORTA noktaya (yol[1], "tepe") düşer — YAY UZUNLUĞU
  // eşit bölündüğü için.
  it("eşit segmentli 3 noktalı yolda t=0.5 TAM ORTA noktaya (tepeye) düşer", () => {
    const path = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }];
    expect(position(path, 0.5)).toEqual({ x: 0, y: 10 });
  });

  // YAY UZUNLUĞU, SEGMENT İNDEKSİ DEĞİL: segmentler FARKLI uzunlukta
  // (10 ve 20, toplam 30). "t"yi segment indeksine göre bölen bir
  // mutasyon (örn. "t<0.5 ise ilk segment, değilse ikinci") burada
  // YANLIŞ bir nokta üretirdi — t=0.5 yay uzunluğuna göre tam ikinci
  // segmentin İÇİNDE (toplam*0.5=15, ilk segment 10'u geçiyor) durmalı,
  // segment sınırında (10,0) DEĞİL.
  it("FARKLI uzunluktaki segmentlerde YAY UZUNLUĞUNA göre örnekler, segment İNDEKSİNE göre DEĞİL", () => {
    const path = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 30, y: 0 }];
    const dot = position(path, 0.5);
    // toplam=30, kalan=15; ilk segment(10) tükenir, ikinci segmentte
    // kalan 5/20 oranı: x = 10 + 20*0.25 = 15.
    expect(dot.x).toBeCloseTo(15);
    expect(dot.x).not.toBeCloseTo(10);
  });
});

/**
 * ROLHARITASICIKAR — devir tespitinin "önceki" anlık görüntüsü.
 */
describe("rolHaritasiCikar — kart→rol haritası", () => {
  type CardShape = { id: string; role: string; orphan: boolean };
  const lookupMap = (cardList: CardShape[]): Map<string, string> =>
    scriptFn<(k: CardShape[]) => Map<string, string>>(renderPage("t"), "buildRoleMap")(cardList);

  it("her kartın id'sini rolüne eşler", () => {
    const h = lookupMap([{ id: "c1", role: "coder", orphan: false }]);
    expect(h.get("c1")).toBe("coder");
  });

  // YETİM kartlar ELENİR: akışta artık karşılığı olmayan bir rolden
  // "uçmak" anlamsız — hedef düğüm yok.
  it("yetim kartları haritaya KOYMAZ", () => {
    const h = lookupMap([{ id: "c1", role: "hayalet", orphan: true }]);
    expect(h.has("c1")).toBe(false);
  });
});

/**
 * KARTDEVIRLERINIBUL — kart c-20261106-d6e795'in ana karar noktası:
 * iki yoklama arasında HANGİ kartların rolü DEĞİŞTİ.
 */
describe("kartDevirleriniBul — iki yoklama arasındaki devirler", () => {
  type CardShape = { id: string; role: string; orphan: boolean };
  const handoffs = (previous: Map<string, string>, cardList: CardShape[]) =>
    scriptFn<(o: Map<string, string>, k: CardShape[]) => { cardId: string; from: string; to: string }[]>(
      renderPage("t"), "findCardHandoffs",
    )(previous, cardList);

  it("rolü değişen BİLİNEN bir kart için devir bildirir", () => {
    const previous = new Map([["c1", "coder"]]);
    expect(handoffs(previous, [{ id: "c1", role: "reviewer", orphan: false }])).toEqual([
      { cardId: "c1", from: "coder", to: "reviewer" },
    ]);
  });

  it("rolü AYNI kalan bir kart için devir bildirmez", () => {
    const previous = new Map([["c1", "coder"]]);
    expect(handoffs(previous, [{ id: "c1", role: "coder", orphan: false }])).toEqual([]);
  });

  // YENİ görünen bir kart "hiçbir yerden" uçmaz — önceden BİLİNMİYORSA
  // (haritada hiç yok) devir sayılmaz, konumunda zaten BELİRİR.
  it("önceden BİLİNMEYEN (yeni) bir kart için devir bildirmez", () => {
    const previous = new Map<string, string>();
    expect(handoffs(previous, [{ id: "c1", role: "coder", orphan: false }])).toEqual([]);
  });

  // YETİM bir kart, rolü (teorik olarak) değişmiş olsa bile ELENİR.
  it("yetim bir kart için rolü değişmiş olsa bile devir bildirmez", () => {
    const previous = new Map([["c1", "coder"]]);
    expect(handoffs(previous, [{ id: "c1", role: "reviewer", orphan: true }])).toEqual([]);
  });

  it("BİRDEN ÇOK kart aynı anda devredilirse hepsini AYRI AYRI bildirir", () => {
    const previous = new Map([["c1", "coder"], ["c2", "coder"]]);
    const result = handoffs(previous, [
      { id: "c1", role: "reviewer", orphan: false },
      { id: "c2", role: "reviewer", orphan: false },
    ]);
    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining([
      { cardId: "c1", from: "coder", to: "reviewer" },
      { cardId: "c2", from: "coder", to: "reviewer" },
    ]));
  });
});

/**
 * UCUSPLANLARINIKUR — devir listesini TAM uçuş planına bağlayan
 * orkestrasyon. rolKonumu/FORMASYON_GOVDE/govdeYolu/ucusSuresiMs'e
 * bağlı, `fonksiyonlar` ile BİRLİKTE çıkarılıyor.
 */
describe("ucusPlanlariniKur — devirlerden uçuş planına", () => {
  type RoleShape = { id: string };
  type Plan = { cardId: string; path: { x: number; y: number }[]; duration: number };
  const planList = (handoffs: { cardId: string; from: string; to: string }[], roleList: RoleShape[]): Plan[] =>
    scriptFns<(d: typeof handoffs, r: RoleShape[]) => Plan[]>(
      renderPage("t"),
      ["FORMATION_BODY", "rolePosition", "bodyPath", "flightDurationMs", "buildFlightPlans"],
      "buildFlightPlans",
    )(handoffs, roleList);

  it("farklı kollardaki (sol/sağ) iki rol arasında UZUN (900ms) bir plan üretir", () => {
    const roleList = [{ id: "coder" }, { id: "reviewer" }];
    const result = planList([{ cardId: "c1", from: "coder", to: "reviewer" }], roleList);
    expect(result).toHaveLength(1);
    expect(result[0]?.cardId).toBe("c1");
    expect(result[0]?.duration).toBe(900);
    expect(result[0]?.path).toHaveLength(3); // tepeden dolanıyor
  });

  it("aynı koldaki (sol/tepe) iki rol arasında KISA (600ms) bir plan üretir", () => {
    const roleList = [{ id: "a" }, { id: "b" }, { id: "c" }]; // a=sol, b=tepe, c=sağ
    const result = planList([{ cardId: "c1", from: "a", to: "b" }], roleList);
    expect(result[0]?.duration).toBe(600);
    expect(result[0]?.path).toHaveLength(2);
  });

  // OLMAYAN bir role (akış değişti, rol silindi) devir SESSİZCE elenir.
  it("kaynak ya da hedef rol artık yoksa o devri ATLAR", () => {
    const roleList = [{ id: "coder" }, { id: "reviewer" }];
    const result = planList([{ cardId: "c1", from: "coder", to: "hayalet" }], roleList);
    expect(result).toEqual([]);
  });
});
