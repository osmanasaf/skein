import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

/**
 * İSTEMCİ–SUNUCU SINIRININ DİZE SÖZLEŞMELERİ.
 *
 * `page.ts` tarayıcı betiğini bir template literal İÇİNDE taşıyor, yani o
 * kod DİZE. İki tarafın anlaşması gereken her ad bir dizede yaşıyor ve
 * `tsc` ikisini KARŞILAŞTIRMIYOR. Bu dosya o karşılaştırmayı yapıyor.
 *
 * `tel-sozlesmesi.test.ts` POST gövdelerinin ve hata alanının adlarını
 * zaten pinliyor. Burada kalan üç sınıf var — üçü de bu geçişte GERÇEKTEN
 * kırıldı ya da kırılmaya bir adım kalmıştı:
 *
 *   1. UÇ YOLLARI — istemci `fetch("/prompt/yaz")` çağırıyor, sunucu
 *      `path === "/prompt/yaz"` ile yönlendiriyor. Biri değişirse öteki
 *      404 alır ve ekranda yalnızca durum kodu görünür.
 *   2. SORGU PARAMETRELERİ — istemci `?yol=` gönderiyor, sunucu
 *      `queryParam(req, "yol")` okuyor.
 *   3. `dataset.X` ↔ `data-X` — ÖLÇÜLMÜŞ KUSUR: `b.dataset.sekme`
 *      `b.dataset.tab` olunca HTML hâlâ `data-sekme` yazıyordu, okuma hep
 *      `undefined` döndü, NAV ROZETİ HİÇ GÜNCELLENMEDİ ve üç tarayıcı
 *      sınaması zaman aşımına düştü. `tsc` temizdi.
 *
 * Hepsi KAYNAK DÜZEYİNDE ölçülüyor: sunucu çalıştırmaya gerek yok.
 */

const SERVER = new URL("./server.ts", import.meta.url).pathname;
const PAGE = new URL("./page.ts", import.meta.url).pathname;

async function clientScript(): Promise<string> {
  const text = await readFile(PAGE, "utf8");
  const i1 = text.indexOf("<script>");
  const i2 = text.indexOf("</script>");
  expect(i1).toBeGreaterThan(-1);
  expect(i2).toBeGreaterThan(i1);
  return text.slice(i1 + "<script>".length, i2);
}

/** camelCase -> kebab-case, `dataset.railEdit` <-> `data-rail-edit`. */
function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
}

describe("sınır sözleşmesi — uç yolları", () => {
  it("istemcinin çağırdığı her uç sunucuda KARŞILANIYOR", async () => {
    const server = await readFile(SERVER, "utf8");
    const script = await clientScript();

    const exact = new Set([...server.matchAll(/path === "([^"]+)"/g)].map((m) => m[1] as string));
    const prefixes = [...server.matchAll(/startsWith\("([^"]+)"\)/g)].map((m) => m[1] as string);

    const called = [...new Set(
      [...script.matchAll(/fetch\(\s*"([^"]+)"/g)].map((m) => (m[1] as string).split("?")[0] as string),
    )];
    expect(called.length).toBeGreaterThan(8);

    const unmatched = called.filter((p) => {
      if (exact.has(p)) return false;
      if (prefixes.some((x) => p === x || p.startsWith(x))) return false;
      // `/gozcu/` + değişken: sunucuda BETON yollar var (/gozcu/baslat).
      if (p.endsWith("/") && [...exact].some((e) => e.startsWith(p))) return false;
      return true;
    });
    expect(unmatched).toEqual([]);
  });

  it("sunucunun YAZMA uçlarının hepsi istemciden çağrılıyor", async () => {
    const server = await readFile(SERVER, "utf8");
    const script = await clientScript();

    /*
     * Ters yön: sunucuda duran ama hiç çağrılmayan bir yazma ucu, ya ölü
     * koddur ya da istemci tarafı kopmuştur. İkisi de bilinmeye değer.
     *
     * Yalnızca POST uçları: GET uçları tarayıcıya doğrudan yazılabiliyor
     * ve bazıları (/ , /index.html) sayfanın kendisi.
     */
    const postRoutes = [...server.matchAll(/req\.method === "POST" && path === "([^"]+)"/g)]
      .map((m) => m[1] as string);
    expect(postRoutes.length).toBeGreaterThan(3);

    const uncalled = [...new Set(postRoutes)].filter((p) => {
      if (script.includes(`"${p}"`)) return false;
      // `/gozcu/baslat` istemcide `"/gozcu/" + ne` olarak kuruluyor.
      const i = p.lastIndexOf("/");
      const prefix = p.slice(0, i + 1);
      const last = p.slice(i + 1);
      return !(script.includes(`"${prefix}"`) && script.includes(`"${last}"`));
    });
    expect(uncalled).toEqual([]);
  });
});

describe("sınır sözleşmesi — sorgu parametreleri", () => {
  it("sunucunun okuduğu her sorgu parametresini istemci GÖNDERİYOR", async () => {
    const server = await readFile(SERVER, "utf8");
    const script = await clientScript();

    const read = [...new Set(
      [...server.matchAll(/queryParam\(\s*req\s*,\s*"([^"]+)"/g)].map((m) => m[1] as string),
    )];
    expect(read.length).toBeGreaterThan(0);

    const missing = read.filter((name) => !script.includes(`${name}=`));
    expect(missing).toEqual([]);
  });
});

describe("sınır sözleşmesi — dataset ile data- niteliği", () => {
  it("betiğin OKUDUĞU her `dataset.X` için bir YAZAN taraf var", async () => {
    const script = await clientScript();

    /*
     * `dataset.X` okuması ancak X bir yerde YAZILIYORSA anlamlı: ya
     * `dataset.X = ...` ile (ikisi de JS, tutarlı), ya da HTML'de
     * `data-<kebab(X)>` niteliği olarak (dize — AST onu görmez).
     *
     * Hiçbiri yoksa okuma HEP undefined döner ve kırılma SESSİZDİR.
     */
    const reads = [...new Set(
      [...script.matchAll(/\.dataset\.([a-zA-Z]+)\b/g)].map((m) => m[1] as string),
    )];
    expect(reads.length).toBeGreaterThan(5);

    const writes = new Set(
      [...script.matchAll(/\.dataset\.([a-zA-Z]+)\s*=/g)].map((m) => m[1] as string),
    );
    const attrs = new Set(
      [...script.matchAll(/"(data-[a-z-]+)"/g)].map((m) => m[1] as string),
    );

    const orphan = reads.filter((name) => !writes.has(name) && !attrs.has("data-" + kebab(name)));
    expect(orphan).toEqual([]);
  });

  /*
   * KALDIRILAN SINAMA: "HTML'de yazılan data- niteliği ile okuyan
   * dataset adı uyuşuyor" diye bir sınama yazıldı ve SİLİNDİ — yalnızca
   * niteliklerin tekil olduğunu ve okuma sayısının 5'ten büyük olduğunu
   * ölçüyordu, yani GERÇEK bir kusurda düşmezdi. Üstteki sınama
   * ("her dataset.X için bir YAZAN taraf var") sözleşmeyi zaten
   * zorluyor ve mutasyonla ısırdığı doğrulandı.
   */
});
