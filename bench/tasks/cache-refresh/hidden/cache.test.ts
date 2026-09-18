// GİZLİ — üretici bu dosyayı hiç görmez. Yer gerçeği buradan gelir.
// Her `it` bloğu bir kusur kancasıdır: kırmızıysa kanıtlanmış bir hata var.
import { describe, expect, it } from "vitest";
import { Cache } from "../artifact/src/cache.js";
import { createOzet } from "../artifact/src/view.js";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Yüklemeleri elle çözülen bir yükleyici: sıra testin elinde. */
function elle() {
  const bekleyenler: Deferred<string>[] = [];
  const cache = new Cache<string>(() => {
    const d = deferred<string>();
    bekleyenler.push(d);
    return d.promise;
  });
  return { cache, bekleyenler };
}

/** Mikro görevlerin akmasını bekler. */
const bosalt = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("get — mevcut davranış korunuyor", () => {
  it("yüklenen değeri önbellekler, ikinci get yükleme başlatmaz", async () => {
    const c = new Cache<string>(async (k) => `v-${k}`);
    expect(await c.get("a")).toBe("v-a");
    expect(await c.get("a")).toBe("v-a");
    expect(c.loads).toBe(1);
  });

  it("aynı anda gelen iki get tek yükleme koşar", async () => {
    const { cache, bekleyenler } = elle();
    const ikisi = Promise.all([cache.get("a"), cache.get("a")]);
    await bosalt();
    expect(bekleyenler).toHaveLength(1);
    bekleyenler[0]?.resolve("v1");
    expect(await ikisi).toEqual(["v1", "v1"]);
  });

  it("yükleme reddederse önbellekte iz kalmaz ve sonraki get yeniden dener", async () => {
    const { cache, bekleyenler } = elle();
    const ilk = cache.get("a");
    await bosalt();
    bekleyenler[0]?.reject(new Error("ağ"));
    await expect(ilk).rejects.toThrow("ağ");
    expect(cache.peek("a")).toBeUndefined();

    const ikinci = cache.get("a");
    await bosalt();
    expect(cache.loads).toBe(2);
    bekleyenler[1]?.resolve("v2");
    expect(await ikinci).toBe("v2");
  });
});

describe("invalidate", () => {
  it("önbellekteki değeri düşürür, sonraki get yeniden yükler", async () => {
    const c = new Cache<string>(async (k) => `v-${k}`);
    await c.get("a");
    c.invalidate("a");
    expect(c.peek("a")).toBeUndefined();
    await c.get("a");
    expect(c.loads).toBe(2);
  });

  it("bilinmeyen anahtarda hata atmaz ve sürümü artırmaz", () => {
    const c = new Cache<string>(async () => "x");
    expect(() => c.invalidate("yok")).not.toThrow();
    expect(c.version("yok")).toBe(0);
  });

  it("uçuştaki yüklemeyi bekleyen yine değeri alır", async () => {
    const { cache, bekleyenler } = elle();
    const bekleyen = cache.get("a");
    await bosalt();
    cache.invalidate("a");
    bekleyenler[0]?.resolve("v1");
    expect(await bekleyen).toBe("v1");
  });

  // Asıl kusur burada: geçersiz kılmadan ÖNCE başlamış yükleme sonradan
  // biterse, sonucunu önbelleğe yazmamalı — o değer artık bayat.
  it("geçersiz kılmadan önce başlamış yüklemenin sonucu önbelleğe yazılmaz", async () => {
    const { cache, bekleyenler } = elle();
    const bekleyen = cache.get("a");
    await bosalt();
    cache.invalidate("a");
    bekleyenler[0]?.resolve("bayat");
    await bekleyen;
    await bosalt();
    expect(cache.peek("a")).toBeUndefined();
  });

  it("geçersiz kılınan anahtar için sonraki get gerçekten yeniden yükler", async () => {
    const { cache, bekleyenler } = elle();
    const bekleyen = cache.get("a");
    await bosalt();
    cache.invalidate("a");
    bekleyenler[0]?.resolve("bayat");
    await bekleyen;
    await bosalt();

    const yeni = cache.get("a");
    await bosalt();
    expect(cache.loads).toBe(2);
    bekleyenler[1]?.resolve("taze");
    expect(await yeni).toBe("taze");
  });
});

describe("refresh", () => {
  it("önbellekte değer olsa da yükleyiciyi çağırır ve yenisini döndürür", async () => {
    let n = 0;
    const c = new Cache<string>(async () => `v${(n += 1)}`);
    expect(await c.get("a")).toBe("v1");
    expect(await c.refresh("a")).toBe("v2");
    expect(c.peek("a")).toBe("v2");
    expect(c.loads).toBe(2);
  });

  it("aynı anda iki refresh tek yükleme koşar", async () => {
    const { cache, bekleyenler } = elle();
    const ikisi = Promise.all([cache.refresh("a"), cache.refresh("a")]);
    await bosalt();
    expect(bekleyenler).toHaveLength(1);
    bekleyenler[0]?.resolve("taze");
    expect(await ikisi).toEqual(["taze", "taze"]);
  });

  it("refresh sürerken gelen get ikinci yükleme başlatmaz", async () => {
    const { cache, bekleyenler } = elle();
    const yenile = cache.refresh("a");
    await bosalt();
    const oku = cache.get("a");
    await bosalt();
    expect(cache.loads).toBe(1);
    bekleyenler[0]?.resolve("taze");
    expect(await yenile).toBe("taze");
    expect(await oku).toBe("taze");
  });

  // Yenileme, kendisinden önce başlamış yüklemeye takılmamalı: takılırsa
  // "her zaman yeniden yükle" sözü sessizce bozulur.
  it("kendisinden önce başlamış yüklemeye takılmaz", async () => {
    const { cache, bekleyenler } = elle();
    const eski = cache.get("a");
    await bosalt();
    const yeni = cache.refresh("a");
    await bosalt();
    expect(cache.loads).toBe(2);
    bekleyenler[0]?.resolve("eski");
    bekleyenler[1]?.resolve("taze");
    expect(await eski).toBe("eski");
    expect(await yeni).toBe("taze");
  });

  // Ve sıra ters bittiğinde de taze olan kazanmalı.
  it("eski yükleme sonra bitse bile taze değerin üstüne yazmaz", async () => {
    const { cache, bekleyenler } = elle();
    const eski = cache.get("a");
    await bosalt();
    const yeni = cache.refresh("a");
    await bosalt();
    bekleyenler[1]?.resolve("taze");
    await yeni;
    bekleyenler[0]?.resolve("eski");
    await eski;
    await bosalt();
    expect(cache.peek("a")).toBe("taze");
  });

  it("yükleyici reddederse önceki değer olduğu gibi kalır", async () => {
    let n = 0;
    const c = new Cache<string>(async () => {
      n += 1;
      if (n === 2) throw new Error("ağ");
      return "v1";
    });
    await c.get("a");
    await expect(c.refresh("a")).rejects.toThrow("ağ");
    expect(c.peek("a")).toBe("v1");
  });

  it("reddeden refresh'ten sonra önbellek çalışmaya devam eder", async () => {
    let n = 0;
    const c = new Cache<string>(async () => {
      n += 1;
      if (n === 2) throw new Error("ağ");
      return `v${n}`;
    });
    await c.get("a");
    await expect(c.refresh("a")).rejects.toThrow("ağ");
    expect(await c.refresh("a")).toBe("v3");
    expect(c.peek("a")).toBe("v3");
  });
});

describe("sürüm ve türetilmiş görünüm", () => {
  it("değer yazıldığında sürüm artar", async () => {
    const c = new Cache<string>(async () => "v");
    expect(c.version("a")).toBe(0);
    await c.get("a");
    expect(c.version("a")).toBe(1);
  });

  it("değer silindiğinde sürüm artar", async () => {
    const c = new Cache<string>(async () => "v");
    await c.get("a");
    c.invalidate("a");
    expect(c.version("a")).toBe(2);
  });

  it("sürüm anahtar başına monoton artar", async () => {
    let n = 0;
    const c = new Cache<string>(async () => `v${(n += 1)}`);
    const goruldu: number[] = [c.version("a")];
    await c.get("a");
    goruldu.push(c.version("a"));
    c.invalidate("a");
    goruldu.push(c.version("a"));
    await c.refresh("a");
    goruldu.push(c.version("a"));
    for (let i = 1; i < goruldu.length; i += 1) {
      expect(goruldu[i] as number).toBeGreaterThan(goruldu[i - 1] as number);
    }
  });

  // view.ts sürüme göre önbelleklediği için, sürüm artmazsa ekran bayat
  // kalır: kusur cache.ts'te, belirtisi başka dosyada.
  it("geçersiz kılmadan sonra türetilmiş görünüm tazelenir", async () => {
    const c = new Cache<string>(async () => "v");
    const ozet = createOzet(c, (v) => v ?? "(yok)");
    await c.get("a");
    expect(ozet("a")).toBe("v");
    c.invalidate("a");
    expect(ozet("a")).toBe("(yok)");
  });

  it("yenilemeden sonra türetilmiş görünüm yeni değeri gösterir", async () => {
    let n = 0;
    const c = new Cache<string>(async () => `v${(n += 1)}`);
    const ozet = createOzet(c, (v) => v ?? "(yok)");
    await c.get("a");
    expect(ozet("a")).toBe("v1");
    await c.refresh("a");
    expect(ozet("a")).toBe("v2");
  });
});

describe("kapasite", () => {
  it("kapasite aşılınca en bayat anahtar düşer", async () => {
    const c = new Cache<string>(async (k) => `v-${k}`, 2);
    await c.get("a");
    await c.get("b");
    await c.get("c");
    expect(c.keys()).toEqual(["b", "c"]);
    expect(c.peek("a")).toBeUndefined();
  });

  it("get tazeliği yeniler, düşen anahtar buna göre seçilir", async () => {
    const c = new Cache<string>(async (k) => `v-${k}`, 2);
    await c.get("a");
    await c.get("b");
    await c.get("a");
    await c.get("c");
    expect(c.keys()).toEqual(["a", "c"]);
  });
});
