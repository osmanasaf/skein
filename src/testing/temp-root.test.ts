import { describe, expect, it, afterEach } from "vitest";
import { mkdtemp, readdir, readFile, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { tempRoot } from "./temp-root.js";

/**
 * `tempRoot`'un tek işi geçici kökü GERÇEK yolu ile vermek. Bunu sınamak
 * kolay görünüyor ama bir tuzağı var: Linux'ta `/tmp` sembolik bağ DEĞİL,
 * yani `realpath`'i kaldıran bir mutasyon bu platformda hiçbir şeyi
 * kırmazdı. "Sınama geçiyor" derdik ve macOS'teki beş kırmızı geri gelirdi.
 *
 * Bu yüzden kurgu aliası KENDİSİ kuruyor: gerçek bir dizin, ona bakan bir
 * sembolik bağ, ve `TMPDIR` bağa ayarlı. Böylece sınama macOS'i beklemeden,
 * her platformda ısırıyor.
 */
describe("tempRoot", () => {
  let temizlik: string[] = [];
  const eskiTmp = process.env["TMPDIR"];

  afterEach(async () => {
    if (eskiTmp === undefined) delete process.env["TMPDIR"];
    else process.env["TMPDIR"] = eskiTmp;
    for (const p of temizlik) await rm(p, { recursive: true, force: true });
    temizlik = [];
  });

  // Windows'ta `TMPDIR` okunmuyor (TEMP/TMP) ve sembolik bağ ayrıcalık
  // istiyor. Kuralın kendisi orada da geçerli, ama bu KURGU taşınmıyor.
  it.skipIf(process.platform === "win32")(
    "sembolik bağın arkasındaki geçici kökü GERÇEK yolla verir",
    async () => {
      const gercek = await realpath(await mkdtemp(join(tmpdir(), "skein-tr-gercek-")));
      const bag = `${gercek}-bag`;
      await symlink(gercek, bag);
      temizlik.push(gercek, bag);

      process.env["TMPDIR"] = bag;
      const kok = await tempRoot("skein-tr-");

      expect(kok.startsWith(gercek)).toBe(true);
      expect(kok.startsWith(bag)).toBe(false);
      // Çözülmüş yolun kendisi kararlı: ikinci `realpath` onu değiştirmiyor.
      expect(await realpath(kok)).toBe(kok);
    },
  );

  it("verilen önadı kullanır — hangi sınamanın bıraktığı anlaşılsın", async () => {
    const kok = await tempRoot("skein-tr-onad-");
    temizlik.push(kok);
    expect(kok).toContain("skein-tr-onad-");
  });
});

/**
 * KAYNAK DÜZEYİ KURAL: hiçbir sınama dosyası `mkdtemp`i doğrudan
 * çağırmasın.
 *
 * Niye kaynağı tarıyoruz: kuralı ihlal eden bir dosya yalnızca macOS'te,
 * yalnızca yol karşılaştıran bir iddia eklendiğinde patlar. Yani ihlal
 * aylarca sessiz kalabilir ve bedelini depoyu ilk kez kendi makinesinde
 * koşturan kişi öder. Davranış sınamasıyla yakalanamaz çünkü ihlal
 * BAŞKA bir dosyada.
 *
 * Bu dosyanın kendisi muaf: aliası kurmak için gerçek bir `mkdtemp`e
 * ihtiyacı var ve sonucunu zaten `realpath`'ten geçiriyor.
 */
describe("geçici kök kuralı", () => {
  it("hiçbir sınama dosyası mkdtemp'i doğrudan çağırmıyor", async () => {
    const kokDizin = new URL("..", import.meta.url).pathname;
    const bulunan: string[] = [];

    async function tara(dir: string): Promise<void> {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) await tara(p);
        else if (e.name.endsWith(".test.ts")) {
          const yol = relative(kokDizin, p);
          if (yol === join("testing", "temp-root.test.ts")) continue; // muaf
          if ((await readFile(p, "utf8")).includes("mkdtemp(")) bulunan.push(yol);
        }
      }
    }

    await tara(kokDizin);

    // Boş liste beklenir; dolu gelirse HANGİ dosyalar olduğu mesajda görünür.
    expect(bulunan).toEqual([]);
  });
});
