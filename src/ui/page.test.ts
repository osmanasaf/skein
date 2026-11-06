import { describe, expect, it } from "vitest";
import { renderPage } from "./page.js";

/** Sayfadaki gömülü betiği çıkarır. */
function betik(html: string): string {
  const at = html.indexOf("<script>");
  const son = html.indexOf("</script>", at);
  return html.slice(at + "<script>".length, son);
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
function fonksiyon<T>(html: string, ad: string): T {
  const src = betik(html);
  const bas = src.indexOf(`function ${ad}(`);
  if (bas < 0) throw new Error(`betikte ${ad} yok`);
  const son = src.indexOf("\n}\n", bas);
  if (son < 0) throw new Error(`${ad} kapanışı bulunamadı`);
  const metin = src.slice(bas, son + 3);
  return new Function(`${metin}; return ${ad};`)() as T;
}

/** `fonksiyon`'un TEK bir bildirimi (fonksiyon ya da üst düzey `const`) için kullandığı çıkarma mantığı. */
function bildirim(src: string, ad: string): string {
  const fBas = src.indexOf(`function ${ad}(`);
  if (fBas >= 0) {
    const son = src.indexOf("\n}\n", fBas);
    if (son < 0) throw new Error(`${ad} kapanışı bulunamadı`);
    return src.slice(fBas, son + 3);
  }
  const cBas = src.indexOf(`const ${ad} = `);
  if (cBas >= 0) {
    const son = src.indexOf(";\n", cBas);
    if (son < 0) throw new Error(`${ad} (const) kapanışı bulunamadı`);
    return src.slice(cBas, son + 2);
  }
  throw new Error(`betikte ${ad} yok`);
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
function fonksiyonlar<T>(html: string, adlar: string[], donus: string): T {
  const src = betik(html);
  const metin = adlar.map((ad) => bildirim(src, ad)).join("\n");
  return new Function(`${metin}; return ${donus};`)() as T;
}

type Cikis = { etiket: string; not: string; dugmeler: [string, string][] };

/**
 * Zincirin başında "Geri gönder" düğmesi OLMAMALI.
 *
 * `back` kararının hedefi rolün ret hedefi; yoksa çekirdek kartı aynı role
 * döndürüyor, yani olan şey bir retry. Düğme yapmayacağı şeyi vaat
 * ediyordu: insan "geri gönderdim" sanıyor, kart aynı rolde baştan
 * koşuyordu — ve günlük de ona `back` diyordu.
 */
describe("kapiCikislari — geri hedefi", () => {
  const cikis = (kind: string, planKilidi: boolean, geriHedef: string | null): Cikis =>
    fonksiyon<(k: string, p: boolean, g: string | null) => Cikis>(
      renderPage("x"),
      "kapiCikislari",
    )(kind, planKilidi, geriHedef);

  it("onay kapısı: hedef varsa geri gönder, yoksa baştan koştur", () => {
    expect(cikis("approval", false, "coder").dugmeler).toEqual([
      ["Geçir", "forward"],
      ["Geri gönder", "back"],
    ]);
    expect(cikis("approval", false, null).dugmeler).toEqual([
      ["Geçir", "forward"],
      ["Baştan koştur", "retry"],
    ]);
  });

  it("kaçış kapısı: hedef yoksa tek çıkış kalır", () => {
    expect(cikis("escalation", false, "coder").dugmeler).toEqual([
      ["Yeniden koş", "retry"],
      ["Geri gönder", "back"],
    ]);
    // "Yeniden koş" zaten retry: ikinci bir retry düğmesi aynı şeyi iki kez
    // sunmak olurdu.
    expect(cikis("escalation", false, null).dugmeler).toEqual([["Yeniden koş", "retry"]]);
  });

  it("kilit kapısı: 'Denetçi haklı' hedefsizse retry oluyor", () => {
    expect(cikis("deadlock", false, "coder").dugmeler).toEqual([
      ["Üretici haklı", "forward"],
      ["Denetçi haklı", "back"],
    ]);
    expect(cikis("deadlock", false, null).dugmeler).toEqual([
      ["Üretici haklı", "forward"],
      ["Baştan koştur", "retry"],
    ]);
  });

  // Planlama kilidinin çıkışlarında `back` HİÇ yok: hedef alanı onu
  // etkilememeli.
  it("planlama kilidi geri hedefinden etkilenmiyor", () => {
    const a = cikis("deadlock", true, "coder");
    const b = cikis("deadlock", true, null);
    expect(a.dugmeler).toEqual(b.dugmeler);
    expect(a.etiket).toBe("planlama kilidi");
  });
});

describe("renderPage", () => {
  // Bu test bir kusurun bedeliyle yazıldı: şablon içinde `\n` yazınca
  // TypeScript onu GERÇEK satır sonuna çeviriyor ve JS dizesi ortasından
  // kırılıyor. Sayfa tamamen boş açılıyordu ve hiçbir test görmüyordu —
  // uçlar çalıştığı için hepsi yeşildi.
  it("gömülü betik sözdizimi geçerli", () => {
    const src = betik(renderPage("jeton"));
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
    const kokAt = html.indexOf(":root {");
    const koyuAt = html.indexOf("prefers-color-scheme: dark");
    expect(kokAt).toBeGreaterThan(-1);
    expect(koyuAt).toBeGreaterThan(kokAt);
    expect(html).toContain("--reject:");
  });

  it("dış kaynak yüklemez", () => {
    const html = renderPage("x");
    expect(html).not.toContain("http://");
    expect(html.includes("https://")).toBe(false);
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
    expect(html).toContain("if (planKilidi)");
    expect(html).toContain("kapiCikislari(c.gate, c.planKilidi, c.geriHedef)");
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
    const src = betik(renderPage("x"));
    expect(src).toContain("d.card.plan");
    expect(src).toContain("d.card.plan.hash.slice(0, 12)");
  });

  // İz satırındaki plan olayı ham "plan" sözcüğü yerine tur numarasını ve
  // dolu olan itiraz sayılarını taşımalı (bkz. PLANLAMA.md 6b).
  it("iz satırı plan olayı için tur numarasını ve dolu sayıları çizer", () => {
    const src = betik(renderPage("x"));
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
    const src = betik(renderPage("x"));
    expect(src).toContain("m.engeller && m.engeller.length");
    expect(src).toContain("kart kuyrukta ALINAMIYOR");
  });

  // Kod ve yol olmadan "alınamadı" kullanıcıyı hiçbir yere götürmez.
  it("kod, rol ve yol basılıyor", () => {
    const src = betik(renderPage("x"));
    expect(src).toContain('e.code + "  " + e.role + "  " + e.path');
    expect(src).toContain("e.message");
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
    const src = betik(renderPage("x"));
    expect(src).toContain('"Yeni kart"');
    expect(src).toContain('h === "yeni"');
    expect(src).toContain("yeniKartAc");
    expect(src).toContain('fetch("/kart/yeni"');
  });

  // Yazma ucu JETONSUZ çağrılamaz: sayfanın kendi isteği de aynı kapıdan
  // geçmek zorunda, yoksa uç ya kırık ya korumasızdır.
  it("gönderim jetonu taşıyor", () => {
    const src = betik(renderPage("x"));
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
    const src = betik(renderPage("x"));
    expect(src).toContain("if (AKISLAR.length)");
    expect(src).toContain('secici.id = "akisSecici"');
  });

  it("seçim doğru uca jetonla gidiyor", () => {
    const src = betik(renderPage("x"));
    const at = src.indexOf('fetch("/akis/sec"');
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 300)).toContain("x-skein-token");
  });

  // Liste SAYFA AÇILIRKEN BİR KEZ okunuyor: dosya listesi ekran koşarken
  // değişmiyor, her saniyelik yoklamaya eklemek değişmeyen bir şeyi
  // tekrar tekrar sormak olurdu.
  it("liste sayfa açılışında okunuyor, yoklama döngüsüne eklenmiyor", () => {
    const src = betik(renderPage("x"));
    expect(src).toContain('fetch("/akislar"');
    expect(src).toContain("akislarYukle().then(() => yokla().then(hashOku))");
    expect(src).not.toContain('setInterval(akislarYukle');
  });
});

describe("renderPage — gözcü düğmesi", () => {
  it("düğme kilidin VARLIĞINA değil CANLI olmasına bakıyor", () => {
    const src = betik(renderPage("x"));
    expect(src).toContain("const canli = Boolean(g && g.alive)");
    expect(src).toContain('canli ? "Gözcüyü durdur" : "Gözcüyü başlat"');
    expect(src).toContain('gozcuKomut(canli ? "durdur" : "baslat"');
  });

  it("komut jetonla ve doğru uca gidiyor", () => {
    const src = betik(renderPage("x"));
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
    const sonrakiSutun = fonksiyon<(m: unknown, rolId: string) => string>(
      renderPage("t"), "sonrakiSutun",
    );
    const m = { edges: [
      { from: "coder", to: "reviewer", kind: "next" },
      { from: "coder", to: "coder", kind: "reject" },
    ] };
    expect(sonrakiSutun(m, "coder")).toBe("reviewer");
  });

  // model.ts zincirin SONUNA ('done'a) kenar hiç üretmiyor (boş bir kenarı
  // çizmek olmayan bir ilişkiyi varmış gibi göstermek olurdu) — yani
  // sütunun kendi "next" kenarı yoksa hedef zaten "bitti" sütunudur.
  it("'next' kenarı yoksa 'bitti' döner", () => {
    const sonrakiSutun = fonksiyon<(m: unknown, rolId: string) => string>(
      renderPage("t"), "sonrakiSutun",
    );
    expect(sonrakiSutun({ edges: [] }, "coder")).toBe("bitti");
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
    const jsonGibiMi = fonksiyon<(s: string) => boolean>(renderPage("t"), "jsonGibiMi");
    expect(jsonGibiMi('{"a":1}')).toBe(true);
  });

  // GERÇEK bir kesilmiş kuyruk '{' ile değil '…' ile başlar (agentSaid son
  // 600 karakteri alıyor) — heuristik bu yüzden başlangıca değil, en az üç
  // "anahtar": kalıbına da bakıyor. Bu dal olmasa ÖLÇÜLEN bugün karttaki
  // kusur yine JSON sayılmazdı.
  it("'{' ile BAŞLAMAYAN ama 'anahtar': kalıbı üç kez geçen kırpılmış kuyruk da JSON sayılır", () => {
    const jsonGibiMi = fonksiyon<(s: string) => boolean>(renderPage("t"), "jsonGibiMi");
    expect(jsonGibiMi('…"a":1,"b":2,"c":3}')).toBe(true);
  });

  it("düz bir cümle JSON sayılmaz", () => {
    const jsonGibiMi = fonksiyon<(s: string) => boolean>(renderPage("t"), "jsonGibiMi");
    expect(jsonGibiMi("Ajan zaman aşımına uğradı, yeniden deneniyor.")).toBe(false);
  });
});

describe("ozetle — katlı özetin kısaltması TAM METNİ etkilemiyor", () => {
  it("kısa metin DEĞİŞMEDEN döner", () => {
    const ozetle = fonksiyon<(s: string) => string>(renderPage("t"), "ozetle");
    expect(ozetle("kısa metin")).toBe("kısa metin");
  });

  // Kırpma burada SADECE özet etiketini ilgilendiriyor — gerekceKur
  // govdeye ayraçtan sonraki metnin TAMAMINI yazıyor, ozetle onu
  // ETKİLEMİYOR (bkz. tarayici.test.ts'teki "tamamı DOM'da" sınaması).
  it("uzun metin yalnızca ÖZET için kısaltılır", () => {
    const ozetle = fonksiyon<(s: string) => string>(renderPage("t"), "ozetle");
    const uzun = "a".repeat(300);
    const sonuc = ozetle(uzun);
    expect(sonuc.length).toBeLessThan(300);
    expect(sonuc.endsWith("…")).toBe(true);
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
  const metin = (rol: { depth: number }, kartlar: unknown[]): string =>
    fonksiyon<(r: { depth: number }, k: unknown[]) => string>(renderPage("t"), "bosRolMetni")(
      rol, kartlar,
    );

  it("kuyruk da boşsa 'kuyrukta kart yok' der", () => {
    expect(metin({ depth: 0 }, [])).toBe("kuyrukta kart yok");
  });

  // YARIŞ: depth kartlar listesinden büyük — ekran bunu BİLİYOR, "boş"
  // demek bildiği ama yanlış söylemek olurdu.
  it("rol.depth kartlar listesinden büyükse yarış durumunu söyler, 'boş' demez", () => {
    expect(metin({ depth: 3 }, [])).toBe("3 kart kuyrukta, henuz yuklenmedi");
  });

  // SINIR: depth kartlar sayısına EŞİTSE (büyük DEĞİL) yarış yok — bu dal
  // `>` ile `>=` arasındaki farkı yakalıyor; `>=` yazılsaydı burada da
  // yarış cümlesi dönerdi.
  it("rol.depth kartlar sayısına eşitse (büyük değilse) normal boş cümleyi söyler", () => {
    expect(metin({ depth: 2 }, [{}, {}])).toBe("kuyrukta kart yok");
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
  const metin = (cards: { state: string }[], open: number): string =>
    fonksiyon<(m: { cards: { state: string }[]; totals: { open: number } }) => string>(
      renderPage("t"), "bosBittiMetni",
    )({ cards, totals: { open } });

  it("hiç kart açılmamışsa bunu söyler", () => {
    expect(metin([], 0)).toBe("henuz kart acilmadi");
  });

  it("bir rol şu an koşuyorsa 'iş sürüyor' der, 'hiç açılmadı' demez", () => {
    expect(metin([{ state: "active" }], 1)).toBe("bir rol su an kosuyor, henuz biten kart yok");
  });

  it("koşan yok ama kuyrukta/kapıda kart varsa onu söyler", () => {
    expect(metin([{ state: "gate" }], 1)).toBe("kart kuyrukta ya da kapida bekliyor, henuz biten yok");
  });

  // ÖNCELİK: ikisi de doğruyken "koşuyor" cümlesi kazanır.
  it("hem koşan rol hem kuyrukta kart varsa 'koşuyor' cümlesi öne geçer", () => {
    expect(metin([{ state: "active" }, { state: "gate" }], 2))
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
  const sekme = (h: string): string => fonksiyon<(h: string) => string>(renderPage("t"), "sekmeAdi")(h);

  it("üç sekme adını aynen döner", () => {
    expect(sekme("akislar")).toBe("akislar");
    expect(sekme("promptlar")).toBe("promptlar");
    expect(sekme("ajanlar")).toBe("ajanlar");
  });

  it("boş hash ve Pano'nun kendi panel yolları 'pano' döner", () => {
    expect(sekme("")).toBe("pano");
    expect(sekme("kart/123")).toBe("pano");
    expect(sekme("akis")).toBe("pano");
    expect(sekme("prompt")).toBe("pano");
    expect(sekme("prompt/yeni")).toBe("pano");
    expect(sekme("yeni")).toBe("pano");
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
  type Durum = { durum: string; etiket: string };
  const durum = (g: { alive: boolean; info?: unknown } | null): Durum =>
    fonksiyon<(g: { alive: boolean; info?: unknown } | null) => Durum>(renderPage("t"), "gozcuDurum")(g);

  it("kilit yoksa 'yok' der", () => {
    expect(durum(null)).toEqual({ durum: "yok", etiket: "gözcü yok" });
  });

  it("kilit canlıysa 'açık' der", () => {
    expect(durum({ alive: true })).toEqual({ durum: "acik", etiket: "gözcü açık" });
  });

  // SINIR: 'alive: false' (kilit var ama pid ölü) "açık" DEĞİL. `g.alive`
  // yerine `g !== null` yazılsaydı bu dal "açık" derdi — ÖLÇÜLMÜŞ kusurun
  // aynısı (bkz. page.ts "GÖZCÜ DÜĞMESİ" yorumu).
  it("kilit var ama ölüyse 'çökmüş' der, metin 'bayat kilit' içerir", () => {
    const sonuc = durum({ alive: false });
    expect(sonuc.durum).toBe("cokmus");
    expect(sonuc.etiket).toContain("bayat kilit");
  });
});

/**
 * ROZET SAYILARI — Pano/Ajanlar sekme rozetlerinin KARAR noktaları
 * (kart c-20261105-6d7f66). SAF, DOM yok.
 */
describe("kapidaBekleyenSayisi — Pano rozeti", () => {
  const say = (cards: { gate: string | null }[]): number =>
    fonksiyon<(c: { gate: string | null }[]) => number>(renderPage("t"), "kapidaBekleyenSayisi")(cards);

  it("gate alanı dolu olanları sayar, null olanları saymaz", () => {
    expect(say([{ gate: "approval" }, { gate: null }, { gate: "deadlock" }])).toBe(2);
  });

  it("hiç kart yoksa sıfır döner", () => {
    expect(say([])).toBe(0);
  });
});

describe("calisanAjanSayisi — Ajanlar rozeti", () => {
  const say = (cards: { state: string }[]): number =>
    fonksiyon<(c: { state: string }[]) => number>(renderPage("t"), "calisanAjanSayisi")(cards);

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
 * ROLKONUMU — V formasyonundaki rol yerleşimi (kart c-20261105-2a8dab,
 * DEVIR.md "Formasyon diyagramı"). SAF (DOM yok), ama `FORMASYON_GOVDE`
 * sabitine bağlı olduğu için `fonksiyonlar` ile BİRLİKTE çıkarılıyor.
 */
describe("rolKonumu — V üzerindeki rol yerleşimi", () => {
  type Konum = { x: number; y: number; kol: string };
  const konum = (i: number, n: number): Konum =>
    fonksiyonlar<(i: number, n: number) => Konum>(
      renderPage("t"), ["FORMASYON_GOVDE", "rolKonumu"], "rolKonumu",
    )(i, n);

  // TEK ROL VARSA TEPEDE — n===1 bir özel durum, f hesabına hiç girmez
  // (n-1===0 olurdu, bölme hatası).
  it("tek rol varsa tepede durur", () => {
    expect(konum(0, 1)).toEqual({ x: 500, y: 480, kol: "tepe" });
  });

  // İLK ROL GİRİŞTE DEĞİL, SOL UÇTA (230,110) durur — giriş (40,110) "+"
  // düğmesi İÇİN ayrılmış, role ait DEĞİL. İlk denemede ilk rol tam
  // girişe denk geliyordu ve "+" düğmesiyle AYNI merkeze biniyordu (iki
  // tıklanabilir öğe üst üste); skein-merkez-v3.html'in gerçek formülü
  // (posAt/place) bu çakışmayı YAŞAMIYOR çünkü sol/sağ uçtan başlıyor.
  it("ilk rol (öncü) sol UÇTA durur, girişin kendisinde DEĞİL", () => {
    const k = konum(0, 2);
    expect(k.kol).toBe("sol");
    expect(k.x).toBeCloseTo(230);
    expect(k.y).toBeCloseTo(110);
  });

  it("son rol sağ uçta durur, çıkışın kendisinde DEĞİL", () => {
    const k = konum(1, 2);
    expect(k.kol).toBe("sag");
    expect(k.x).toBeCloseTo(770);
    expect(k.y).toBeCloseTo(110);
  });

  // SINIR: f === 0.5 — ister n===1'den ZORLANMIŞ olsun ister tek sayıda
  // rolün ORTANCASI olsun, HER İKİ durumda da "tepe" dalına düşer: kol
  // KOORDİNATA göre (apex'le çakışıyor mu), "n===1 mi" sorusuna göre
  // DEĞİL — skein-merkez-v3.html'in `place` fonksiyonundaki
  // side==="apex" ayrımıyla AYNI ilke.
  it("f===0.5 (üç rolde ortanca) tepeye düşer, 'sol' ya da 'sag' SAYILMAZ", () => {
    const k = konum(1, 3);
    expect(k.kol).toBe("tepe");
    expect(k.x).toBeCloseTo(500);
    expect(k.y).toBeCloseTo(480);
  });

  // DÜZ ORAN (lerp), ARC-LENGTH DEĞİL: sol-uç(230,110)→tepe(500,480)
  // arasında f*2 oranıyla DOĞRUSAL ilerliyor — skein-merkez-v3.html'in
  // posAt'ı bunu "TL.x + (AP.x-TL.x)*f*2" olarak yazıyor, çizginin
  // gerçek (arc-length) uzunluğuna hiç bakmıyor.
  it("konum sol-uç/tepe arasında DÜZ ORANLA (lerp) hesaplanır", () => {
    const k = konum(1, 5); // f = 0.25 → sol kolda yerel oran f*2 = 0.5
    expect(k.x).toBeCloseTo(230 + (500 - 230) * 0.5);
    expect(k.y).toBeCloseTo(110 + (480 - 110) * 0.5);
  });

  // GİRİŞ/ÇIKIŞ konuma HİÇ GİRMİYOR: iki rollü akışta roller sol-uç ve
  // sağ-uç noktalarında durur, giriş (40,110) ve çıkış (950,110) ile
  // ÇAKIŞMAZ — bu olmasaydı "+" düğmesi ve biten-kart kutusu ilk/son rol
  // düğümüyle aynı merkezde üst üste binerdi.
  it("roller giriş/çıkış noktalarıyla ÇAKIŞMAZ", () => {
    const ilk = konum(0, 2);
    const son = konum(1, 2);
    expect(ilk).not.toEqual(expect.objectContaining({ x: 40, y: 110 }));
    expect(son).not.toEqual(expect.objectContaining({ x: 950, y: 110 }));
  });
});

/**
 * KUŞRENGİ — rol düğümündeki kuşun rengi (SAPMALAR.md §1'in "boş rol
 * kuşu" düzeltmesi burada: neutral-600, tasarımın neutral-400'ü DEĞİL).
 */
describe("kusRengi — rol düğümünün kuş rengi", () => {
  const renk = (kartlar: { state: string; gate: string | null }[]): string =>
    fonksiyon<(k: { state: string; gate: string | null }[]) => string>(renderPage("t"), "kusRengi")(kartlar);

  it("çalışan kart varsa accent", () => {
    expect(renk([{ state: "active", gate: null }])).toBe("var(--color-accent)");
  });

  it("kapıda bekleyen kart varsa (çalışmasa da) accent", () => {
    expect(renk([{ state: "gate", gate: "approval" }])).toBe("var(--color-accent)");
  });

  it("kart var ama çalışmıyor/kapıda değilse (kuyrukta) text", () => {
    expect(renk([{ state: "queued", gate: null }])).toBe("var(--color-text)");
  });

  // SAPMA: tasarım neutral-400 diyor (1.80:1) — burada neutral-600.
  it("hiç kart yoksa SAPMA'nın düzelttiği empty-bird-ink", () => {
    expect(renk([])).toBe("var(--empty-bird-ink)");
  });
});

/** KAREDURUMU — kart karesinin üç durumu (çizim ".kare-<ad>" sınıfıyla paylaşılıyor). */
describe("kareDurumu — kart karesinin durumu", () => {
  const durum = (c: { state: string; gate: string | null }): string =>
    fonksiyon<(c: { state: string; gate: string | null }) => string>(renderPage("t"), "kareDurumu")(c);

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
  type Nokta = { x: number; y: number };
  const kontrol = (a: Nokta, b: Nokta): Nokta =>
    fonksiyon<(a: Nokta, b: Nokta) => Nokta>(renderPage("t"), "retYayKontrol")(a, b);

  it("orta nokta hedefe (500,170) doğru %60 kaydırılır, hedefin KENDİSİNE eşitlenmez", () => {
    const k = kontrol({ x: 40, y: 110 }, { x: 230, y: 110 });
    // orta = (135, 110); hedef = (500, 170); fark = (365, 60); *.6 = (219, 36)
    expect(k.x).toBeCloseTo(135 + 219);
    expect(k.y).toBeCloseTo(110 + 36);
    // %100 OLSAYDI her yay (500,170)'e eşit olurdu — burada DEĞİL.
    expect(k.x).not.toBeCloseTo(500);
    expect(k.y).not.toBeCloseTo(170);
  });

  it("kaynak ve hedef aynı noktaysa kontrol noktası da aynı lerp'i uygular", () => {
    const k = kontrol({ x: 0, y: 0 }, { x: 0, y: 0 });
    expect(k.x).toBeCloseTo(500 * 0.6);
    expect(k.y).toBeCloseTo(170 * 0.6);
  });
});

/** KAPICIZGISI — insan onayı kapısının dik çizgi segmenti. */
describe("kapiCizgisi — iki nokta arasındaki çizgiye dik segment", () => {
  type Nokta = { x: number; y: number };
  type Segment = { x1: number; y1: number; x2: number; y2: number };
  const cizgi = (a: Nokta, b: Nokta, uzunluk: number): Segment =>
    fonksiyon<(a: Nokta, b: Nokta, u: number) => Segment>(renderPage("t"), "kapiCizgisi")(a, b, uzunluk);

  it("yatay bir çizginin ortasına DİK (düşey) bir segment üretir", () => {
    const s = cizgi({ x: 0, y: 0 }, { x: 10, y: 0 }, 16);
    expect(s).toEqual({ x1: 5, y1: -8, x2: 5, y2: 8 });
  });

  // DÜŞEY bir çizgide dik yön YATAY olur — yatay örnek "dy===0" olduğu
  // için dik vektörün İŞARETİNİ (-dy/boy) sınayamıyordu (sonuç hep 0).
  // Bu örnek dy !== 0, yani işaret ters çevrilse (örn. "-dy" yerine "dy")
  // bu sınama DÜŞER.
  it("düşey bir çizginin ortasına DİK (yatay) bir segment üretir, İŞARETİ sabit", () => {
    const s = cizgi({ x: 0, y: 0 }, { x: 0, y: 10 }, 16);
    expect(s).toEqual({ x1: 8, y1: 5, x2: -8, y2: 5 });
  });

  it("segment UZUNLUĞU parametreyle ölçeklenir", () => {
    const s = cizgi({ x: 0, y: 0 }, { x: 10, y: 0 }, 4);
    expect(Math.hypot(s.x2 - s.x1, s.y2 - s.y1)).toBeCloseTo(4);
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
  const cirpiyor = (kartlar: { state: string }[], daemon: Daemon): boolean =>
    fonksiyon<(k: { state: string }[], d: Daemon) => boolean>(renderPage("t"), "kanatCirpiyorMu")(kartlar, daemon);

  it("çalışan kart VE canlı gözcü varsa true", () => {
    expect(cirpiyor([{ state: "active" }], { alive: true })).toBe(true);
  });

  it("çalışan kart var ama gözcü YOKSA (null) false", () => {
    expect(cirpiyor([{ state: "active" }], null)).toBe(false);
  });

  it("çalışan kart var ama gözcü ÖLÜYSE (alive: false) false", () => {
    expect(cirpiyor([{ state: "active" }], { alive: false })).toBe(false);
  });

  // SINIR: kapıda bekleyen bir kart "çalışan" SAYILMAZ — insan kararını
  // bekleyen bir kart için kanat çırpmak yanlış bir sinyal olurdu.
  it("kart kapıda bekliyor ama çalışmıyor ise, gözcü canlı olsa da false", () => {
    expect(cirpiyor([{ state: "gate" }], { alive: true })).toBe(false);
  });

  it("hiç kart yoksa false", () => {
    expect(cirpiyor([], { alive: true })).toBe(false);
  });
});

/**
 * PLANLAMAKATILIMCIKONUMLARI — planlama bandının geçtiği noktalar
 * (DEVIR.md: "planlama katılımcılarının üzerinden geçen ... şerit").
 * `rolKonumu`ya bağlı, `fonksiyonlar` ile BİRLİKTE çıkarılıyor.
 */
describe("planlamaKatilimciKonumlari — planlama bandının noktaları", () => {
  type Konum = { x: number; y: number; kol: string };
  type Rol = { id: string };
  const konumlar = (roller: Rol[], katilimcilar: string[]): Konum[] =>
    fonksiyonlar<(r: Rol[], k: string[]) => Konum[]>(
      renderPage("t"),
      ["FORMASYON_GOVDE", "rolKonumu", "planlamaKatilimciKonumlari"],
      "planlamaKatilimciKonumlari",
    )(roller, katilimcilar);

  it("katılımcıların konumlarını ZİNCİR SIRASIYLA döner", () => {
    const roller = [{ id: "planner" }, { id: "coder" }, { id: "reviewer" }];
    const sonuc = konumlar(roller, ["planner", "coder"]);
    expect(sonuc).toHaveLength(2);
    expect(sonuc[0]).toEqual({ x: 230, y: 110, kol: "sol" });
  });

  // BİLİNMEYEN KATILIMCI sessizce elenir — olmayan bir rolü varmış gibi
  // göstermek (örn. (0,0) gibi bir uydurma nokta) daha KÖTÜ bir hata
  // modu olurdu.
  it("bilinmeyen bir katılımcı (akışta olmayan rol) sessizce elenir", () => {
    const roller = [{ id: "planner" }];
    const sonuc = konumlar(roller, ["planner", "uydurma-rol"]);
    expect(sonuc).toHaveLength(1);
  });

  it("katılımcı listesi boşsa boş dizi döner", () => {
    expect(konumlar([{ id: "planner" }], [])).toEqual([]);
  });
});

/**
 * PLANLAMABANDYOLU — planlama bandının çizdiği SVG yolu. İlk/son
 * katılımcının "kol"una göre TEPE'den dolanıp dolanmayacağına karar
 * veriyor (kart c-20261105-2a8dab).
 */
describe("planlamaBandYolu — bandın tepeden dolanması", () => {
  type Konum = { x: number; y: number; kol: string };
  const yol = (ilk: Konum, son: Konum): string =>
    fonksiyonlar<(a: Konum, b: Konum) => string>(
      renderPage("t"), ["FORMASYON_GOVDE", "planlamaBandYolu"], "planlamaBandYolu",
    )(ilk, son);

  // İKİ KOLA YAYILAN bant (ilk solda, son sağda) TEPE'den (500,480)
  // GEÇMEK ZORUNDA — yoksa düz çizgi iki kolun arasından kestirmeden
  // geçer, V'nin kendi hattını İZLEMEZ.
  it("ilk sol kolda, son sağ koldaysa TEPEDEN dolanır", () => {
    const ilk = { x: 230, y: 110, kol: "sol" };
    const son = { x: 770, y: 110, kol: "sag" };
    expect(yol(ilk, son)).toBe("M 230 110 L 500 480 L 770 110");
  });

  // AYNI KOLDAKİ (ya da biri tepedeki) iki nokta ZATEN aynı doğru
  // üzerinde — detur GEREKMİYOR, düz çizgi yeterli.
  it("ikisi de sol koldaysa düz çizgi çizer, tepeden dolanmaz", () => {
    const ilk = { x: 230, y: 110, kol: "sol" };
    const son = { x: 365, y: 295, kol: "sol" };
    expect(yol(ilk, son)).toBe("M 230 110 L 365 295");
  });

  it("son tepedeyse (örn. tek katılımcı tepeye denk gelmiş) dolanmaz", () => {
    const ilk = { x: 230, y: 110, kol: "sol" };
    const son = { x: 500, y: 480, kol: "tepe" };
    expect(yol(ilk, son)).toBe("M 230 110 L 500 480");
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
  const gecis = (rail: Rail, eylem: Record<string, unknown>): Rail =>
    fonksiyon<(r: Rail, e: Record<string, unknown>) => Rail>(renderPage("t"), "railGecis")(rail, eylem);

  const GENEL_BAKIS: Rail = { mode: "overview", roleId: null, cardId: null, cardFrom: "overview" };

  it("'genelBakis' her zaman Genel bakışa döner", () => {
    const icindeyken = { mode: "card", roleId: "coder", cardId: "c-1", cardFrom: "role" };
    expect(gecis(icindeyken, { tur: "genelBakis" })).toEqual(GENEL_BAKIS);
  });

  // TOGGLE: Rol modunda AYNI role tekrar tıklamak Genel bakışa döner —
  // formasyon düğümünün eski davranışıyla (secimDegistir) AYNI.
  it("Rol modunda AYNI role tıklamak Genel bakışa döner", () => {
    const rolAcik: Rail = { mode: "role", roleId: "coder", cardId: null, cardFrom: "overview" };
    expect(gecis(rolAcik, { tur: "rolSec", rolId: "coder" })).toEqual(GENEL_BAKIS);
  });

  it("Rol modunda BAŞKA role tıklamak o role GEÇER, kapatmaz", () => {
    const rolAcik: Rail = { mode: "role", roleId: "coder", cardId: null, cardFrom: "overview" };
    expect(gecis(rolAcik, { tur: "rolSec", rolId: "reviewer" })).toEqual({
      mode: "role", roleId: "reviewer", cardId: null, cardFrom: "overview",
    });
  });

  // "&&" sınaması: Kart modundayken (roleId AYNI role ait bile olsa) o
  // role tıklamak KAPATMAZ, Rol moduna geçer — "&&" "||" olsaydı bu dal da
  // GENEL_BAKIS'a düşerdi.
  it("Kart modunda (roleId eşleşse de) role tıklamak Rol moduna geçer, KAPATMAZ", () => {
    const kartAcik: Rail = { mode: "card", roleId: "coder", cardId: "c-1", cardFrom: "role" };
    expect(gecis(kartAcik, { tur: "rolSec", rolId: "coder" })).toEqual({
      mode: "role", roleId: "coder", cardId: null, cardFrom: "overview",
    });
  });

  it("'kartAcGenel' roleId'yi TEMİZLER, cardFrom 'overview'dur", () => {
    const rolAcik: Rail = { mode: "role", roleId: "coder", cardId: null, cardFrom: "overview" };
    expect(gecis(rolAcik, { tur: "kartAcGenel", kartId: "c-9" })).toEqual({
      mode: "card", roleId: null, cardId: "c-9", cardFrom: "overview",
    });
  });

  it("'kartAcRol' roleId'yi KORUR, cardFrom 'role'dur", () => {
    expect(gecis(GENEL_BAKIS, { tur: "kartAcRol", rolId: "reviewer", kartId: "c-9" })).toEqual({
      mode: "card", roleId: "reviewer", cardId: "c-9", cardFrom: "role",
    });
  });

  it("'geri' — Kart 'role'den açıldıysa Rol'e döner, roleId KORUNUR", () => {
    const kartAcik: Rail = { mode: "card", roleId: "reviewer", cardId: "c-9", cardFrom: "role" };
    expect(gecis(kartAcik, { tur: "geri" })).toEqual({
      mode: "role", roleId: "reviewer", cardId: null, cardFrom: "overview",
    });
  });

  it("'geri' — Kart 'overview'den açıldıysa Genel bakışa döner", () => {
    const kartAcik: Rail = { mode: "card", roleId: null, cardId: "c-9", cardFrom: "overview" };
    expect(gecis(kartAcik, { tur: "geri" })).toEqual(GENEL_BAKIS);
  });

  it("tanınmayan bir eylem rail'i DEĞİŞTİRMEDEN döner", () => {
    const rolAcik: Rail = { mode: "role", roleId: "coder", cardId: null, cardFrom: "overview" };
    expect(gecis(rolAcik, { tur: "bilinmeyen" })).toEqual(rolAcik);
  });
});

/**
 * RAILROLMETA — "Rol" modunun meta satırı (DEVIR.md: "sağlayıcı, çalışma
 * alanı, sonraki rol, ret hedefi, toplu alım"). SAF, DOM yok.
 */
describe("railRolMeta — Rol modunun meta satırı", () => {
  type Meta = {
    no: string; oncu: boolean; id: string; provider: string; workspace: string;
    sonrakiRol: string; retHedefi: string | null; receive: string; prompt: string;
  };
  const meta = (m: unknown, rolId: string): Meta | null =>
    fonksiyonlar<(m: unknown, rolId: string) => Meta | null>(
      renderPage("t"), ["sonrakiSutun", "railRolMeta"], "railRolMeta",
    )(m, rolId);

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
    expect(meta(MODEL, "coder")).toMatchObject({ no: "01", oncu: true });
  });

  it("ilk olmayan rolü 'öncü' SAYMAZ", () => {
    expect(meta(MODEL, "reviewer")).toMatchObject({ no: "02", oncu: false });
  });

  it("sonraki rolü ZİNCİR OKU'nun (sonrakiSutun) aynı kararıyla verir", () => {
    expect(meta(MODEL, "coder")?.sonrakiRol).toBe("reviewer");
    expect(meta(MODEL, "reviewer")?.sonrakiRol).toBe("bitti");
  });

  it("ret hedefi varsa onu, yoksa null döner", () => {
    expect(meta(MODEL, "reviewer")?.retHedefi).toBe("coder");
    expect(meta(MODEL, "coder")?.retHedefi).toBe(null);
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
  const karar = (g: unknown, h: unknown): boolean =>
    fonksiyon<(g: unknown, h: unknown) => boolean>(renderPage("t"), "railYenidenYuklenmeliMi")(g, h);

  it("gösterilen kart hedefle AYNIYSA yeniden yüklemez", () => {
    expect(karar("c-1", "c-1")).toBe(false);
  });

  it("gösterilen kart hedeften FARKLIYSA yeniden yükler", () => {
    expect(karar("c-1", "c-2")).toBe(true);
  });

  // İlk açılış: panel hiçbir kart taşımıyor (dataset undefined) — hedef
  // her ne olursa olsun bu YÜKLEMELİ dönmek zorunda, aksi hâlde Kart modu
  // İLK kez açıldığında hiç fetch ETMEZDİ.
  it("panel hiçbir kart taşımıyorsa (ilk açılış) yeniden yükler", () => {
    expect(karar(undefined, "c-1")).toBe(true);
  });
});

/**
 * MOD 5 — "Rolleri düzenle" (kart c-20261105-725320, DEVIR.md §3). Bu
 * fonksiyonların hepsi SAF: çizim (railDuzenlePaneliCiz ve yardımcıları)
 * DOM gerektirdiği için tarayici.test.ts'te, burada yalnızca KARAR.
 */
type DuzenleRol = {
  id: string; provider?: string; workspace?: string; receive?: string;
  reject?: string; syncBack?: string[]; next?: string; prompt?: string;
};

describe("duzenleHatalari — boş/tekrarlanan rol adı HATA'sı", () => {
  const hatalar = (roller: DuzenleRol[]): { hatalar: string[]; gecersiz: Set<number> } =>
    fonksiyon<(r: DuzenleRol[]) => { hatalar: string[]; gecersiz: Set<number> }>(
      renderPage("t"), "duzenleHatalari",
    )(roller);

  it("hepsi tekil ve doluysa hata YOK", () => {
    const sonuc = hatalar([{ id: "coder" }, { id: "reviewer" }]);
    expect(sonuc.hatalar).toEqual([]);
    expect(sonuc.gecersiz.size).toBe(0);
  });

  it("boş ad (ya da sadece boşluk) HATA verir ve o indeksi işaretler", () => {
    const sonuc = hatalar([{ id: "coder" }, { id: "   " }]);
    expect(sonuc.hatalar).toHaveLength(1);
    expect(sonuc.gecersiz.has(1)).toBe(true);
    expect(sonuc.gecersiz.has(0)).toBe(false);
  });

  it("aynı adı taşıyan İKİ rol HATA verir ve İKİSİNİ de işaretler", () => {
    const sonuc = hatalar([{ id: "coder" }, { id: "coder" }, { id: "reviewer" }]);
    expect(sonuc.hatalar).toHaveLength(1);
    expect(sonuc.hatalar[0]).toContain("coder");
    expect(sonuc.gecersiz).toEqual(new Set([0, 1]));
  });

  it("boş liste için hata YOK", () => {
    expect(hatalar([]).hatalar).toEqual([]);
  });
});

describe("duzenleSilmeUyarilari — açık kartı olan silinen rol UYARI'sı (engellemez)", () => {
  type Kart = { role: string; state: string; orphan?: boolean };
  const uyarilar = (onceki: string[], simdi: string[], kartlar: Kart[]): string[] =>
    fonksiyon<(o: string[], s: string[], k: Kart[]) => string[]>(
      renderPage("t"), "duzenleSilmeUyarilari",
    )(onceki, simdi, kartlar);

  it("silinmeyen rol için uyarı YOK", () => {
    expect(uyarilar(["coder"], ["coder"], [{ role: "coder", state: "active" }])).toEqual([]);
  });

  it("silinen rolün AÇIK (done olmayan) kartı varsa uyarır", () => {
    const sonuc = uyarilar(["coder", "reviewer"], ["coder"], [{ role: "reviewer", state: "gate" }]);
    expect(sonuc).toHaveLength(1);
    expect(sonuc[0]).toContain("reviewer");
  });

  it("silinen rolün kartları hepsi 'done'sa uyarmaz", () => {
    expect(uyarilar(["coder", "reviewer"], ["coder"], [{ role: "reviewer", state: "done" }])).toEqual([]);
  });

  it("silinen rolün kartı YETİM (orphan) ise SAYMAZ", () => {
    expect(uyarilar(["coder", "reviewer"], ["coder"], [{ role: "reviewer", state: "gate", orphan: true }])).toEqual([]);
  });
});

describe("duzenleSiradanBagla — 'next' HER ZAMAN sıradan türer, sonuncusu 'done'", () => {
  const bagla = (roller: DuzenleRol[]): DuzenleRol[] =>
    fonksiyon<(r: DuzenleRol[]) => DuzenleRol[]>(renderPage("t"), "duzenleSiradanBagla")(roller);

  it("üç rolü sırayla zincirler, sonuncusu 'done'", () => {
    const sonuc = bagla([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(sonuc.map((r) => r.next)).toEqual(["b", "c", "done"]);
  });

  it("tek rol de 'done'a bağlanır", () => {
    expect(bagla([{ id: "a" }])[0]?.next).toBe("done");
  });
});

describe("duzenleReddiTemizle — kural 13: reject yalnızca DAHA ÖNCEki role işaret edebilir", () => {
  const temizle = (roller: DuzenleRol[]): DuzenleRol[] =>
    fonksiyon<(r: DuzenleRol[]) => DuzenleRol[]>(renderPage("t"), "duzenleReddiTemizle")(roller);

  it("öncekine işaret eden reject KORUNUR", () => {
    const sonuc = temizle([{ id: "a" }, { id: "b", reject: "a" }]);
    expect(sonuc[1]?.reject).toBe("a");
  });

  it("SONRAKİ bir role işaret eden reject TEMİZLENİR", () => {
    const sonuc = temizle([{ id: "a", reject: "b" }, { id: "b" }]);
    expect(sonuc[0]?.reject).toBeUndefined();
  });

  it("var olmayan bir role işaret eden reject TEMİZLENİR", () => {
    const sonuc = temizle([{ id: "a" }, { id: "b", reject: "yok" }]);
    expect(sonuc[1]?.reject).toBeUndefined();
  });

  it("kendine işaret eden reject (hedef === i) TEMİZLENİR", () => {
    const sonuc = temizle([{ id: "a", reject: "a" }]);
    expect(sonuc[0]?.reject).toBeUndefined();
  });
});

describe("duzenleTasi — ↑/↓ ikon düğmeleri: sırayı değiştirir, next'i yeniden türetir", () => {
  const tasi = (roller: DuzenleRol[], i: number, yon: number): DuzenleRol[] =>
    fonksiyonlar<(r: DuzenleRol[], i: number, y: number) => DuzenleRol[]>(
      renderPage("t"), ["duzenleReddiTemizle", "duzenleSiradanBagla", "duzenleTasi"], "duzenleTasi",
    )(roller, i, yon);

  it("ortadaki rolü YUKARI taşır", () => {
    const sonuc = tasi([{ id: "a" }, { id: "b" }, { id: "c" }], 1, -1);
    expect(sonuc.map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(sonuc.map((r) => r.next)).toEqual(["a", "c", "done"]);
  });

  it("İLK rolü YUKARI taşımak hiçbir şey yapmaz (sınır)", () => {
    const roller = [{ id: "a" }, { id: "b" }];
    expect(tasi(roller, 0, -1).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("SON rolü AŞAĞI taşımak hiçbir şey yapmaz (sınır)", () => {
    const roller = [{ id: "a" }, { id: "b" }];
    expect(tasi(roller, 1, 1).map((r) => r.id)).toEqual(["a", "b"]);
  });

  // Taşıma sırayı tersine çevirince eski bir reject GEÇERSİZ kalabilir —
  // normalizasyon (duzenleReddiTemizle) bunu TEMİZLEMELİ.
  it("taşıma SONRASI geçersiz kalan reject TEMİZLENİR", () => {
    const sonuc = tasi([{ id: "a" }, { id: "b", reject: "a" }, { id: "c" }], 0, 1);
    // yeni sıra: b, a, c — b artık a'DAN ÖNCE, b'nin a'ya reject'i geçersiz.
    expect(sonuc.map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(sonuc.find((r) => r.id === "b")?.reject).toBeUndefined();
  });
});

describe("duzenleAdSanitize — DEVIR.md §3: ad girişi yalnızca a-z0-9-", () => {
  const sanitize = (deger: string): string =>
    fonksiyon<(d: string) => string>(renderPage("t"), "duzenleAdSanitize")(deger);

  it("zaten geçerli bir ad DEĞİŞMEDEN kalır", () => {
    expect(sanitize("coder-2")).toBe("coder-2");
  });

  it("BÜYÜK harfler küçültülür", () => {
    expect(sanitize("Coder")).toBe("coder");
  });

  it("izin verilmeyen karakterler (boşluk, nokta, alt çizgi) DÜŞÜRÜLÜR", () => {
    expect(sanitize("my role_1.v2")).toBe("myrole1v2");
  });

  it("baştaki/sondaki boşluk kırpılır", () => {
    expect(sanitize("  coder  ")).toBe("coder");
  });

  it("yalnızca boşluktan oluşan bir ad BOŞ dizeye düşer", () => {
    expect(sanitize("   ")).toBe("");
  });
});

describe("duzenleAdDegis — ad değişince reject/planlama.katilimcilar/denetci de güncellenir", () => {
  type Taslak = { roles: DuzenleRol[]; planlama?: { katilimcilar: string[]; denetci?: string } };
  const degis = (taslak: Taslak, i: number, yeniAd: string): Taslak =>
    fonksiyon<(t: Taslak, i: number, a: string) => Taslak>(renderPage("t"), "duzenleAdDegis")(taslak, i, yeniAd);

  it("rolün kendi id'sini değiştirir", () => {
    const sonuc = degis({ roles: [{ id: "coder" }] }, 0, "yazar");
    expect(sonuc.roles[0]?.id).toBe("yazar");
  });

  it("BAŞKA bir rolün 'reject'i eski ada işaret ediyorsa GÜNCELLENİR", () => {
    const taslak: Taslak = { roles: [{ id: "coder" }, { id: "reviewer", reject: "coder" }] };
    const sonuc = degis(taslak, 0, "yazar");
    expect(sonuc.roles[1]?.reject).toBe("yazar");
  });

  it("planlama.katilimcilar İÇİNDEKİ eski ad GÜNCELLENİR", () => {
    const taslak: Taslak = {
      roles: [{ id: "coder" }, { id: "reviewer" }],
      planlama: { katilimcilar: ["coder"] },
    };
    const sonuc = degis(taslak, 0, "yazar");
    expect(sonuc.planlama?.katilimcilar).toEqual(["yazar"]);
  });

  it("planlama.denetci eski ada işaret ediyorsa GÜNCELLENİR", () => {
    const taslak: Taslak = {
      roles: [{ id: "coder" }, { id: "guard" }],
      planlama: { katilimcilar: ["coder"], denetci: "guard" },
    };
    const sonuc = degis(taslak, 1, "denetmen");
    expect(sonuc.planlama?.denetci).toBe("denetmen");
  });

  it("İLGİSİZ bir rolün referansını DEĞİŞTİRMEZ", () => {
    const taslak: Taslak = { roles: [{ id: "coder" }, { id: "reviewer", reject: "coder" }, { id: "guard" }] };
    const sonuc = degis(taslak, 2, "denetmen");
    expect(sonuc.roles[1]?.reject).toBe("coder");
  });

  it("BOŞ ada yeniden adlandırma YOK SAYILIR — eski ad kalır", () => {
    const sonuc = degis({ roles: [{ id: "coder" }] }, 0, "");
    expect(sonuc.roles[0]?.id).toBe("coder");
  });

  it("aynı ada 'değiştirmek' hiçbir referansa dokunmaz", () => {
    const taslak: Taslak = { roles: [{ id: "coder" }, { id: "reviewer", reject: "coder" }] };
    const sonuc = degis(taslak, 0, "coder");
    expect(sonuc.roles[1]?.reject).toBe("coder");
  });
});

describe("duzenleSil — rol silinince reject/syncBack/gates/planlama referansları temizlenir", () => {
  type Gate = { after: string; type: string };
  type Taslak = {
    roles: DuzenleRol[]; gates?: Gate[];
    planlama?: { katilimcilar: string[]; denetci?: string };
  };
  const sil = (taslak: Taslak, id: string): Taslak =>
    fonksiyonlar<(t: Taslak, id: string) => Taslak>(
      renderPage("t"), ["duzenleReddiTemizle", "duzenleSiradanBagla", "duzenleSil"], "duzenleSil",
    )(taslak, id);

  it("rolü diziden ÇIKARIR", () => {
    const sonuc = sil({ roles: [{ id: "a" }, { id: "b" }] }, "b");
    expect(sonuc.roles.map((r) => r.id)).toEqual(["a"]);
  });

  it("ona 'reject' eden rolün referansını TEMİZLER", () => {
    const sonuc = sil({ roles: [{ id: "a" }, { id: "b" }, { id: "c", reject: "b" }] }, "b");
    expect(sonuc.roles.find((r) => r.id === "c")?.reject).toBeUndefined();
  });

  it("ona 'syncBack' eden rolün listesinden ÇIKARIR", () => {
    const sonuc = sil({ roles: [{ id: "a", syncBack: ["b"] }, { id: "b" }] }, "b");
    expect(sonuc.roles.find((r) => r.id === "a")?.syncBack).toEqual([]);
  });

  it("ona ait 'gates' girdisini KALDIRIR", () => {
    const sonuc = sil({ roles: [{ id: "a" }, { id: "b" }], gates: [{ after: "b", type: "approval" }] }, "b");
    expect(sonuc.gates).toEqual([]);
  });

  it("planlama.katilimcilar İÇİNDEN çıkarır, boşalırsa planlama TAMAMEN kalkar", () => {
    const sonuc = sil({ roles: [{ id: "a" }, { id: "b" }], planlama: { katilimcilar: ["a"] } }, "a");
    expect(sonuc.planlama).toBeUndefined();
  });

  it("denetçi silinirse planlama.denetci TEMİZLENİR (katılımcılar kalsa da)", () => {
    const sonuc = sil(
      { roles: [{ id: "a" }, { id: "b" }, { id: "c" }], planlama: { katilimcilar: ["a"], denetci: "c" } },
      "c",
    );
    expect(sonuc.planlama?.denetci).toBeUndefined();
    expect(sonuc.planlama?.katilimcilar).toEqual(["a"]);
  });

  it("SON kalan rol SİLİNEMEZ", () => {
    const sonuc = sil({ roles: [{ id: "a" }] }, "a");
    expect(sonuc.roles).toHaveLength(1);
  });

  it("bilinmeyen bir id için hiçbir şey YAPMAZ", () => {
    const taslak = { roles: [{ id: "a" }, { id: "b" }] };
    expect(sil(taslak, "yok").roles).toHaveLength(2);
  });
});

describe("duzenlePlanlamaAyarla — katılım her zaman zincirin KESİNTİSİZ bir öneği", () => {
  const ayarla = (katilimcilar: string[], rolIdler: string[], idx: number, katilmak: boolean): string[] =>
    fonksiyon<(k: string[], r: string[], i: number, kt: boolean) => string[]>(
      renderPage("t"), "duzenlePlanlamaAyarla",
    )(katilimcilar, rolIdler, idx, katilmak);

  const ROLLER = ["a", "b", "c", "d"];

  it("hiç katılımcı yokken İLK rolü katmak öneği bir uzatır", () => {
    expect(ayarla([], ROLLER, 0, true)).toEqual(["a"]);
  });

  it("önekin TAM ARDINDAKİ rolü katmak öneği uzatır", () => {
    expect(ayarla(["a"], ROLLER, 1, true)).toEqual(["a", "b"]);
  });

  // SIRA DIŞI istek: önek {a} iken DOĞRUDAN c'yi (idx 2) katmaya çalışmak
  // kuralı (19) ihlal ederdi — sessizce YOK SAYILIR.
  it("SIRA DIŞI bir katılım isteği YOK SAYILIR, önek değişmez", () => {
    expect(ayarla(["a"], ROLLER, 2, true)).toEqual(["a"]);
  });

  it("zaten katılımcı olan bir role 'katıl' demek DEĞİŞTİRMEZ", () => {
    expect(ayarla(["a", "b"], ROLLER, 0, true)).toEqual(["a", "b"]);
  });

  it("önekin SON elemanını çıkarmak öneği bir kısaltır", () => {
    expect(ayarla(["a", "b"], ROLLER, 1, false)).toEqual(["a"]);
  });

  it("ortadan birini ÇIKARMAK onu ve ARDINDAKİ hepsini öneğin dışına atar", () => {
    expect(ayarla(["a", "b", "c"], ROLLER, 1, false)).toEqual(["a"]);
  });

  it("katılımcı olmayan bir role 'çık' demek DEĞİŞTİRMEZ", () => {
    expect(ayarla(["a"], ROLLER, 2, false)).toEqual(["a"]);
  });
});

describe("duzenleDenetciGecerle — kural 23: denetçi katılımcı OLAMAZ, katılımcılardan SONRA gelmeli", () => {
  const gecerle = (denetci: string | undefined, katilimcilar: string[], rolIdler: string[]): string | undefined =>
    fonksiyon<(d: string | undefined, k: string[], r: string[]) => string | undefined>(
      renderPage("t"), "duzenleDenetciGecerle",
    )(denetci, katilimcilar, rolIdler);

  const ROLLER = ["a", "b", "c", "d"];

  it("katılımcılardan SONRA gelen geçerli bir denetçiyi KORUR", () => {
    expect(gecerle("c", ["a", "b"], ROLLER)).toBe("c");
  });

  it("denetçi bir KATILIMCIYSA temizlenir", () => {
    expect(gecerle("b", ["a", "b"], ROLLER)).toBeUndefined();
  });

  it("denetçi katılımcılardan ÖNCE/ARASINDAYSA temizlenir", () => {
    expect(gecerle("a", ["a", "b"], ROLLER)).toBeUndefined();
  });

  it("katılımcı YOKSA denetçi de anlamsız, temizlenir", () => {
    expect(gecerle("c", [], ROLLER)).toBeUndefined();
  });

  it("denetçi tanımsızsa tanımsız kalır", () => {
    expect(gecerle(undefined, ["a"], ROLLER)).toBeUndefined();
  });
});

describe("duzenlePlanlamaOzet — 'Yazar: X · itiraz: Y, Z' özeti", () => {
  const ozet = (katilimcilar: string[]): string =>
    fonksiyon<(k: string[]) => string>(renderPage("t"), "duzenlePlanlamaOzet")(katilimcilar);

  it("katılımcı yoksa boş dize", () => {
    expect(ozet([])).toBe("");
  });

  it("tek katılımcıda yalnızca yazar", () => {
    expect(ozet(["planner"])).toBe("Yazar: planner");
  });

  it("birden çok katılımcıda ilk yazar, ötekiler itiraz", () => {
    expect(ozet(["planner", "architect", "analyst"])).toBe("Yazar: planner · itiraz: architect, analyst");
  });
});

describe("duzenleNormallestir — kaydetmeden/önizlemeden önce uygulanan TAM normalizasyon", () => {
  type Taslak = {
    roles: DuzenleRol[];
    planlama?: { katilimcilar: string[]; denetci?: string; tur: number; plan: string; ilkTurKor: boolean };
  };
  const normallestir = (taslak: Taslak): Taslak =>
    fonksiyonlar<(t: Taslak) => Taslak>(
      renderPage("t"),
      ["duzenleReddiTemizle", "duzenleSiradanBagla", "duzenleDenetciGecerle", "duzenleNormallestir"],
      "duzenleNormallestir",
    )(taslak);

  it("next'i sıradan türetir", () => {
    const sonuc = normallestir({ roles: [{ id: "a" }, { id: "b" }] });
    expect(sonuc.roles.map((r) => r.next)).toEqual(["b", "done"]);
  });

  it("geçersiz reject'i temizler", () => {
    const sonuc = normallestir({ roles: [{ id: "a", reject: "b" }, { id: "b" }] });
    expect(sonuc.roles[0]?.reject).toBeUndefined();
  });

  it("planlama varken geçersiz kalmış denetçiyi temizler", () => {
    const sonuc = normallestir({
      roles: [{ id: "a" }, { id: "b" }],
      planlama: { katilimcilar: ["a", "b"], denetci: "b", tur: 1, plan: "docs/plan/{kart}.md", ilkTurKor: true },
    });
    expect(sonuc.planlama?.denetci).toBeUndefined();
  });

  it("planlama yoksa denetçi adımını hiç ÇALIŞTIRMAZ (çökmez)", () => {
    expect(() => normallestir({ roles: [{ id: "a" }] })).not.toThrow();
  });
});
