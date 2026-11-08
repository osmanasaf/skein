import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

/**
 * SUNUCU İLE İSTEMCİ ARASINDAKİ TEL SÖZLEŞMESİ.
 *
 * `page.ts` tarayıcıda koşan betiği bir template literal İÇİNDE taşıyor,
 * yani o kod DİZE. Sunucunun gönderdiği alan adı ile betiğin okuduğu ad
 * ayrışırsa `tsc` HİÇBİR ŞEY DEMEZ ve kırılma sessiz olur: alan
 * `undefined` gelir, kod yedek dala düşer.
 *
 * NİYE BU DOSYA VAR — iki ölçülmüş kusur:
 *
 * 1. Prompt kaydetme. İstemci `{ path, metin }` gönderiyordu, sunucu
 *    `text` bekliyordu (`metin` kısayol alan olduğu için dil geçişinde
 *    atlanmıştı). KAYDETME SESSİZCE YAZMIYORDU; tsc temizdi, yakalayan
 *    şey bir tarayıcı sınamasıydı.
 *
 * 2. Hata yanıtı. Sunucu 34 yerde `{ hata }` gönderiyordu; dil geçişi
 *    istemcinin `.hata` okumalarını `.error` yaptı ama sunucunun kısayol
 *    alanını atladı. O uçlardan gelen HER hata mesajı kayboluyordu,
 *    istemci mesaj yerine ham durum koduna düşüyordu. 1656 sınamanın
 *    hiçbiri düşmedi.
 *
 * Buradaki sınamalar iki tarafı KAYNAK DÜZEYİNDE birbirine bağlıyor:
 * sunucu dosyası ile betik dizesi okunup alan adları karşılaştırılıyor.
 * Sunucu çalıştırmaya gerek yok, o yüzden her koşuda ucuz.
 */

const SERVER = new URL("./server.ts", import.meta.url).pathname;
const PAGE = new URL("./page.ts", import.meta.url).pathname;

/** `page.ts`in gömülü `<script>` bölgesi. */
async function clientScript(): Promise<string> {
  const text = await readFile(PAGE, "utf8");
  const i1 = text.indexOf("<script>");
  const i2 = text.indexOf("</script>");
  expect(i1).toBeGreaterThan(-1);
  expect(i2).toBeGreaterThan(i1);
  return text.slice(i1 + "<script>".length, i2);
}

describe("tel sözleşmesi — hata alanı", () => {
  it("sunucunun GÖNDERDİĞİ hata alanı ile betiğin OKUDUĞU ad aynı", async () => {
    const server = await readFile(SERVER, "utf8");
    const script = await clientScript();

    // Sunucunun yanıt gövdelerinde kullandığı İLK alan adları.
    const sent = new Set(
      [...server.matchAll(/JSON\.stringify\(\{\s*([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1] as string),
    );
    // Hata yolu TEK bir ad kullanmalı: "error". "hata" kalmışsa sessiz kırık.
    expect(sent.has("hata")).toBe(false);
    expect(sent.has("error")).toBe(true);

    // Betik hata mesajını okurken AYNI adı kullanmalı.
    expect(/\.\s*error\b/.test(script)).toBe(true);
    expect(/\.\s*hata\b/.test(script)).toBe(false);
  });
});

describe("tel sözleşmesi — yazma uçlarının gövde alanları", () => {
  it("betiğin GÖNDERDİĞİ her gövde alanı, sunucunun OKUDUĞU adlar arasında", async () => {
    const server = await readFile(SERVER, "utf8");
    const script = await clientScript();

    /*
     * Betiğin POST gövdeleri: `body: JSON.stringify({ ... })`. Kısayol
     * alanlar (`{ metin }`) da yakalanıyor — kusur tam orada çıktı.
     */
    const bodies = [...script.matchAll(/body:\s*JSON\.stringify\(\{([^}]*)\}/g)].map((m) => m[1] as string);
    expect(bodies.length).toBeGreaterThan(3);

    const fields = new Set<string>();
    for (const body of bodies) {
      for (const part of body.split(",")) {
        const t = part.trim();
        if (t === "" || t.startsWith("...")) continue;
        const name = (t.includes(":") ? t.slice(0, t.indexOf(":")) : t).trim();
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) fields.add(name);
      }
    }
    expect(fields.size).toBeGreaterThan(3);

    /*
     * Sunucunun okuduğu adlar: `request["x"]`, `request.x` ve
     * `{ x?: unknown }` biçimindeki gövde türleri.
     */
    const read = new Set<string>([
      ...[...server.matchAll(/request\["([A-Za-z_][A-Za-z0-9_]*)"\]/g)].map((m) => m[1] as string),
      ...[...server.matchAll(/request\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1] as string),
      ...[...server.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\?:\s*unknown/g)].map((m) => m[1] as string),
    ]);

    // Tema seçimi `.skein/ekran.json`a yazılan SABİT bir ad (DIL-GECISI.md);
    // taslak gövdesi ise tüm taslağı yayıyor, alan adı sunucuda tek tek
    // okunmuyor. İkisi bilerek dışarıda.
    const muaf = new Set(["tema", "newName"]);
    const unread = [...fields].filter((f) => !read.has(f) && !muaf.has(f));
    expect(unread).toEqual([]);
  });
});
