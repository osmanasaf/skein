import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { portuHatirlayarakAc, sonAkisiOku, sonAkisiYaz, sonPortuOku, sonPortuYaz } from "./port-memory.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-portmem-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("sonPortuOku", () => {
  it("dosya yoksa undefined döner — ilk açılışta hafıza boş sayılır", async () => {
    expect(await sonPortuOku(root)).toBeUndefined();
  });

  it("sonPortuYaz ile yazılan port geri okunur", async () => {
    await sonPortuYaz(root, 7799);
    expect(await sonPortuOku(root)).toBe(7799);
  });

  it("bozuk JSON engel olmuyor — undefined döner, fırlatmaz", async () => {
    await mkdir(join(root, ".skein"), { recursive: true });
    await writeFile(join(root, ".skein", "ekran.json"), "{ bu json degil", "utf8");
    await expect(sonPortuOku(root)).resolves.toBeUndefined();
  });

  it("port alanı sayı değilse yok sayılır", async () => {
    await mkdir(join(root, ".skein"), { recursive: true });
    await writeFile(join(root, ".skein", "ekran.json"), JSON.stringify({ port: "7799" }), "utf8");
    expect(await sonPortuOku(root)).toBeUndefined();
  });

  /**
   * ARALIK SINIRI, SINIRIN KENDİSİNDE SINANIR.
   *
   * Bu kural neden önemli: `listen()` aralık dışı ya da kesirli bir portta
   * SENKRON `ERR_SOCKET_BAD_PORT` fırlatıyor ve bu `EADDRINUSE` DEĞİL, yani
   * `portuHatirlayarakAc` onu örtmez, olduğu gibi fırlatır. Doğrulama
   * gevşerse elle bozulmuş bir `ekran.json` ekranın HİÇ açılmamasına yol
   * açar — kartın D kısıtının ("bozuk kayıt engel olmasın") tam tersi.
   *
   * 99999 gibi sınırdan UZAK bir değer bu kuralı pinlemiyordu: üst sınır
   * 70000'e çekilse de 99999 yine reddedilirdi. Sınır sınamaları sınırın
   * İKİ yanında durmak zorunda.
   */
  const reddedilmeli: [string, unknown][] = [
    ["üst sınırın bir fazlası", 65536],
    ["sınırdan uzak", 99999],
    ["sıfır — 0 ayrılmış, 'hatırlanmadı' ile aynı şey değil", 0],
    ["negatif", -1],
    ["kesirli", 8080.5],
  ];
  for (const [ad, deger] of reddedilmeli) {
    it(`port alanı geçersizse yok sayılır: ${ad}`, async () => {
      await mkdir(join(root, ".skein"), { recursive: true });
      await writeFile(join(root, ".skein", "ekran.json"), JSON.stringify({ port: deger }), "utf8");
      expect(await sonPortuOku(root)).toBeUndefined();
    });
  }

  // Sınırın DİĞER yanı: yalnızca "reddediyor" sınamaları olsa sınırı
  // daraltan bir mutasyon (ör. 65535'i dışarıda bırakmak) ayakta kalırdı.
  it("üst sınır DAHİL — 65535 geçerli bir porttur", async () => {
    await mkdir(join(root, ".skein"), { recursive: true });
    await writeFile(join(root, ".skein", "ekran.json"), JSON.stringify({ port: 65535 }), "utf8");
    expect(await sonPortuOku(root)).toBe(65535);
  });

  it("JSON dizi (nesne değil) ise yok sayılır", async () => {
    await mkdir(join(root, ".skein"), { recursive: true });
    await writeFile(join(root, ".skein", "ekran.json"), "[1,2,3]", "utf8");
    expect(await sonPortuOku(root)).toBeUndefined();
  });
});

describe("sonPortuYaz", () => {
  it("atomik yazıyor — yarım dosya (tmp) kalmıyor", async () => {
    await sonPortuYaz(root, 1234);
    const entries = await import("node:fs/promises").then((m) =>
      m.readdir(join(root, ".skein")));
    expect(entries).toEqual(["ekran.json"]);
  });

  it("dizin yoksa kendisi yaratıyor", async () => {
    await sonPortuYaz(root, 4321);
    const text = await readFile(join(root, ".skein", "ekran.json"), "utf8");
    expect(JSON.parse(text)).toEqual({ port: 4321 });
  });
});

/**
 * SON AÇILAN AKIŞIN HAFIZASI.
 *
 * Varsayılan akış seçiminin (`ui/cli.ts`) kullandığı ipucu. Aynı "bozuk
 * kayıt kilitlemez" kuralı `sonPortuOku` ile — bu sınamalar kuralın akış
 * adı tarafını pinliyor.
 */
describe("sonAkisiOku", () => {
  it("dosya yoksa undefined döner — ilk açılışta hafıza boş sayılır", async () => {
    expect(await sonAkisiOku(root)).toBeUndefined();
  });

  it("sonAkisiYaz ile yazılan ad geri okunur", async () => {
    await sonAkisiYaz(root, "gunluk-tek");
    expect(await sonAkisiOku(root)).toBe("gunluk-tek");
  });

  it("bozuk JSON engel olmuyor — undefined döner, fırlatmaz", async () => {
    await mkdir(join(root, ".skein"), { recursive: true });
    await writeFile(join(root, ".skein", "ekran.json"), "{ bu json degil", "utf8");
    await expect(sonAkisiOku(root)).resolves.toBeUndefined();
  });

  it("akis alanı metin değilse yok sayılır", async () => {
    await mkdir(join(root, ".skein"), { recursive: true });
    await writeFile(join(root, ".skein", "ekran.json"), JSON.stringify({ akis: 7 }), "utf8");
    expect(await sonAkisiOku(root)).toBeUndefined();
  });

  it("akis alanı boş/boşluk metinse yok sayılır", async () => {
    await mkdir(join(root, ".skein"), { recursive: true });
    await writeFile(join(root, ".skein", "ekran.json"), JSON.stringify({ akis: "   " }), "utf8");
    expect(await sonAkisiOku(root)).toBeUndefined();
  });
});

/**
 * İKİ ALANIN BAĞIMSIZLIĞI.
 *
 * `port` ve `akis` AYNI dosyada duruyor ve biri ötekini EZMEMELİ — "önce
 * oku, sonra kendi alanını değiştirip yaz" (bkz. `hamKaydiYaz`) olmasa bu
 * sınamalar düşerdi: sıradan bir "nesneyi olduğu gibi yaz" mutasyonu ikinci
 * yazılan alanın öncekini silmesine yol açar.
 */
describe("port ve akış hafızası birbirini EZMİYOR", () => {
  it("port yazıldıktan sonra akış yazmak portu SİLMİYOR", async () => {
    await sonPortuYaz(root, 7777);
    await sonAkisiYaz(root, "gunluk-tek");
    expect(await sonPortuOku(root)).toBe(7777);
    expect(await sonAkisiOku(root)).toBe("gunluk-tek");
  });

  it("akış yazıldıktan sonra port yazmak akışı SİLMİYOR", async () => {
    await sonAkisiYaz(root, "gunluk-tek");
    await sonPortuYaz(root, 7777);
    expect(await sonAkisiOku(root)).toBe("gunluk-tek");
    expect(await sonPortuOku(root)).toBe(7777);
  });

  it("ikisi de aynı dosyaya yazılıyor — iki ayrı dosya yok", async () => {
    await sonPortuYaz(root, 7777);
    await sonAkisiYaz(root, "gunluk-tek");
    const entries = await import("node:fs/promises").then((m) => m.readdir(join(root, ".skein")));
    expect(entries).toEqual(["ekran.json"]);
  });
});

describe("portuHatirlayarakAc", () => {
  it("explicitPort verilmişse hatırlanan port HİÇ okunmuyor, ac AYNEN explicit ile çağrılıyor", async () => {
    await sonPortuYaz(root, 1111);
    const gorulenler: (number | undefined)[] = [];
    const sonuc = await portuHatirlayarakAc(root, 9999, async (p) => {
      gorulenler.push(p);
      return { port: 9999 };
    });
    expect(gorulenler).toEqual([9999]);
    expect(sonuc).toEqual({ port: 9999 });
  });

  it("explicitPort verilmişse hatırlanan kayıt EZİLİR — sonraki okuma explicit'i verir", async () => {
    await sonPortuYaz(root, 1111);
    await portuHatirlayarakAc(root, 9999, async (p) => ({ port: p ?? 0 }));
    expect(await sonPortuOku(root)).toBe(9999);
  });

  it("explicit yok, hafıza boş → ac undefined (boş port) ile çağrılır", async () => {
    const gorulenler: (number | undefined)[] = [];
    await portuHatirlayarakAc(root, undefined, async (p) => {
      gorulenler.push(p);
      return { port: 5050 };
    });
    expect(gorulenler).toEqual([undefined]);
  });

  it("explicit yok, hafızada port VAR → ac önce o port ile çağrılır", async () => {
    await sonPortuYaz(root, 7777);
    const gorulenler: (number | undefined)[] = [];
    await portuHatirlayarakAc(root, undefined, async (p) => {
      gorulenler.push(p);
      return { port: 7777 };
    });
    expect(gorulenler).toEqual([7777]);
  });

  it("hatırlanan port DOLUYSA (EADDRINUSE) sessizce boş porta düşer", async () => {
    await sonPortuYaz(root, 7777);
    const gorulenler: (number | undefined)[] = [];
    const sonuc = await portuHatirlayarakAc(root, undefined, async (p) => {
      gorulenler.push(p);
      if (p === 7777) {
        const hata = new Error("in use") as NodeJS.ErrnoException;
        hata.code = "EADDRINUSE";
        throw hata;
      }
      return { port: 8080 };
    });
    // Önce hatırlanan denendi, dolu çıktı, sonra boş port istendi.
    expect(gorulenler).toEqual([7777, undefined]);
    expect(sonuc).toEqual({ port: 8080 });
  });

  it("düşülen boş port yeni hafıza olarak kaydedilir", async () => {
    await sonPortuYaz(root, 7777);
    await portuHatirlayarakAc(root, undefined, async (p) => {
      if (p === 7777) {
        const hata = new Error("in use") as NodeJS.ErrnoException;
        hata.code = "EADDRINUSE";
        throw hata;
      }
      return { port: 8080 };
    });
    expect(await sonPortuOku(root)).toBe(8080);
  });

  it("DOLU DIŞINDA bir hata ÖRTÜLMEZ, olduğu gibi fırlar", async () => {
    await sonPortuYaz(root, 7777);
    const baskaHata = new Error("izin yok") as NodeJS.ErrnoException;
    baskaHata.code = "EACCES";
    // `ac` yalnızca HATIRLANAN portla çağrıldığında fırlatıyor — "düş"
    // dalı (boş port) GERÇEKTEN denenseydi BAŞARILI dönerdi. Bu yüzden
    // iddia yalnızca "reddediyor" değil, "başka bir porta hiç DÜŞMEDEN
    // reddediyor" — ikisini ayırt etmeyen bir iddia, `portDolu` her hatayı
    // dolu sayan bir mutasyonu YAKALAMAZDI (ac zaten her çağrıda fırlasa
    // sonuç değişmezdi).
    await expect(
      portuHatirlayarakAc(root, undefined, async (p) => {
        if (p === 7777) throw baskaHata;
        return { port: p ?? 0 };
      }),
    ).rejects.toBe(baskaHata);
  });

  /**
   * "Bozuk kayıt" yalnızca bozuk JSON değil — GEÇERLİ JSON içinde GEÇERSİZ
   * port da bozuk kayıttır, ve sonucu daha kötü olurdu: bozuk JSON'da
   * `JSON.parse` fırlatıp yutuluyor, aralık dışı portta ise değer kapıdan
   * geçip `listen()`e gidiyor ve ORADA fırlıyor — EADDRINUSE olmadığı için
   * de örtülmüyor. Yukarıdaki birim sınamaları doğrulayıcıyı pinliyor; bu
   * sınama D kısıtının KENDİSİNİ pinliyor: ekran yine açılıyor.
   */
  it("aralık dışı hatırlanan port engel olmuyor — boş port ile açılmaya devam eder", async () => {
    await mkdir(join(root, ".skein"), { recursive: true });
    await writeFile(join(root, ".skein", "ekran.json"), JSON.stringify({ port: 70000 }), "utf8");
    const gorulenler: (number | undefined)[] = [];
    const sonuc = await portuHatirlayarakAc(root, undefined, async (p) => {
      gorulenler.push(p);
      return { port: 4040 };
    });
    // 70000 HİÇ denenmemeli: denenirse `listen` fırlatır ve ekran açılmaz.
    expect(gorulenler).toEqual([undefined]);
    expect(sonuc).toEqual({ port: 4040 });
  });

  it("bozuk hafıza dosyası engel olmuyor — boş port ile açılmaya devam eder", async () => {
    await mkdir(join(root, ".skein"), { recursive: true });
    await writeFile(join(root, ".skein", "ekran.json"), "bozuk", "utf8");
    const gorulenler: (number | undefined)[] = [];
    const sonuc = await portuHatirlayarakAc(root, undefined, async (p) => {
      gorulenler.push(p);
      return { port: 3030 };
    });
    expect(gorulenler).toEqual([undefined]);
    expect(sonuc).toEqual({ port: 3030 });
  });
});
