import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { portuHatirlayarakAc, sonPortuOku, sonPortuYaz } from "./port-memory.js";

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

  it("port alanı aralık dışıysa yok sayılır", async () => {
    await mkdir(join(root, ".skein"), { recursive: true });
    await writeFile(join(root, ".skein", "ekran.json"), JSON.stringify({ port: 99999 }), "utf8");
    expect(await sonPortuOku(root)).toBeUndefined();
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
