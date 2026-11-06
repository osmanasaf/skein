import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock, liveLock, pidAlive, readLock, releaseLock, type LockInfo } from "./lock.js";

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "skein-lock-"));
  path = join(dir, "daemon.json");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function info(pid: number): LockInfo {
  return { pid, startedAt: "2026-09-17T10:00:00.000Z", flow: "daily", hash: "abc123", mode: "serve" };
}

describe("acquireLock", () => {
  it("boş yerde kilidi alır ve kaydı yazar", async () => {
    expect(await acquireLock(path, info(100))).toEqual({ kind: "acquired" });
    expect(await readLock(path)).toEqual(info(100));
  });

  it("canlı bir gözcü varsa reddeder ve sahibini söyler", async () => {
    await acquireLock(path, info(100), { alive: () => true });

    const second = await acquireLock(path, info(200), { alive: () => true });

    expect(second).toEqual({ kind: "busy", holder: info(100) });
    // Reddedilen gözcü kaydı EZMEMELİ: canlı sahip kendi kilidini bulmalı.
    expect((await readLock(path))?.pid).toBe(100);
  });

  // `kill -9` sonrası dosya kalır. Kalıcı engel olsaydı kilit, çözdüğü
  // sorundan daha büyük bir sorun olurdu.
  it("ölü gözcünün kilidini devralır ve kimden aldığını söyler", async () => {
    await acquireLock(path, info(100), { alive: () => true });

    const second = await acquireLock(path, info(200), { alive: () => false });

    expect(second).toEqual({ kind: "acquired", took: info(100) });
    expect((await readLock(path))?.pid).toBe(200);
  });

  it("bozuk kilit dosyası bayat sayılır", async () => {
    await writeFile(path, "{ yarım yazılmış");

    // `alive` hiç çağrılmamalı: okunamayan kayıtta sorulacak pid yok.
    const result = await acquireLock(path, info(200), {
      alive: () => {
        throw new Error("bozuk kayıtta pid sorulmamalı");
      },
    });

    expect(result).toEqual({ kind: "acquired" });
    expect((await readLock(path))?.pid).toBe(200);
  });

  it("pid'i olmayan JSON da bayat sayılır", async () => {
    await writeFile(path, JSON.stringify({ flow: "daily" }));
    expect((await acquireLock(path, info(200))).kind).toBe("acquired");
  });

  /**
   * Kilidin kendi varlık sebebine karşı testi.
   *
   * Eski `claim` `writeFile(..., { flag: "wx" })` kullanıyordu ve yorumu
   * "sahiplenme tek sistem çağrısında olur" diyordu — ama değildi: `wx`
   * dosyayı O_CREAT|O_EXCL ile YARATIYOR, içeriği SONRA yazıyor. O
   * pencerede `readLock` yarım dosya görüp `null` dönüyor, "okunamayan
   * kilit bayat sayılır" dalı CANLI kilidi siliyordu. Sonuç: aynı depoda
   * iki gözcü, ikisi de kilidi kendinde sanıyor — hem de `took` boş
   * olduğu için "bayat kilit devralındı" uyarısı bile basılmadan. Kilidin
   * önlemek için var olduğu şeyin tam kendisi.
   *
   * Pencere mikrosaniyelik olduğu için "12 çağrıyı yarıştır" biçimindeki
   * bir test onu GÖRMÜYOR (denendi: eski koda karşı üç koşuda da geçti).
   * Bu yüzden ölçülen şey yarışın sonucu değil DOĞRUDAN değişmez: kilit
   * dosyası göründüğü andan itibaren TAM olmalı. Büyük `flow` alanı
   * yazımı yavaşlatıp pencereyi gözlenebilir yapıyor — eski koda karşı
   * her koşuda yarım dosya yakalanıyor, yenisinde hiç.
   */
  it("kilit dosyası yarım yazılmış hâlde hiç görünmez", async () => {
    const uzun: LockInfo = { ...info(100), flow: "f".repeat(8 * 1024 * 1024) };

    let bitti = false;
    const kosu = acquireLock(path, uzun).then(() => {
      bitti = true;
    });

    let yarim = 0;
    let gozlem = 0;
    while (!bitti) {
      gozlem += 1;
      let present = true;
      try {
        await stat(path);
      } catch {
        present = false;
      }
      if (present && (await readLock(path)) === null) yarim += 1;
      await new Promise((r) => setImmediate(r));
    }
    await kosu;

    expect(yarim).toBe(0);
    // Testin boşa dönmediğinin kanıtı: yazım sürerken gerçekten baktık.
    expect(gozlem).toBeGreaterThan(0);
    expect((await readLock(path))?.pid).toBe(100);
  });

  // Yarışın SONUCU da ayrıca pinlenmeli: `claim` EEXIST'i "aldım" sayarsa
  // bu test düşer. Yukarıdaki pencere testinin yerine geçmez.
  it("aynı anda gelen çağrılardan yalnızca biri kilidi alır", async () => {
    const sonuclar = await Promise.all(
      Array.from({ length: 12 }, (_, i) => acquireLock(path, info(100 + i), { alive: () => true })),
    );

    const alanlar = sonuclar.filter((r) => r.kind === "acquired");
    expect(alanlar).toHaveLength(1);
    // Hiçbiri CANLI bir kilidi devralmış olmamalı: `took` yalnızca ölü
    // sahibi işaretler, burada herkes canlı.
    expect(alanlar[0]).toEqual({ kind: "acquired" });
    const sahip = await readLock(path);
    expect(sahip).not.toBeNull();
    for (const r of sonuclar) {
      if (r.kind === "busy") expect(r.holder.pid).toBe(sahip?.pid);
    }
  });

  it("geçici dosya ardında kalmaz", async () => {
    await acquireLock(path, info(100));
    const kalanlar = (await readdir(dir)).filter((name) => name.endsWith(".tmp"));
    expect(kalanlar).toEqual([]);
  });

  // Mesaj "gözcü açık" ile "başka bir koşu sürüyor" arasında ayrım yapıyor;
  // eski bir kilitte alan yoksa toplu koşu varsayılır.
  it("mode alanı okunur, eksikse batch sayılır", async () => {
    await writeFile(path, JSON.stringify({ pid: 5, flow: "daily" }));
    expect((await readLock(path))?.mode).toBe("batch");
  });
});

describe("releaseLock", () => {
  it("kendi kilidini siler", async () => {
    await acquireLock(path, info(100));
    expect(await releaseLock(path, 100)).toBe(true);
    expect(await readLock(path)).toBeNull();
  });

  // Bayat sayılıp devralınan kilidi, geç uyanan eski sahibi silerse yeni
  // gözcü korumasız kalırdı.
  it("başkasının kilidine dokunmaz", async () => {
    await acquireLock(path, info(200));
    expect(await releaseLock(path, 100)).toBe(false);
    expect((await readLock(path))?.pid).toBe(200);
  });

  it("kilit yoksa sessizce false döner", async () => {
    expect(await releaseLock(path, 100)).toBe(false);
  });
});

describe("readLock", () => {
  it("yazılan kaydı okunur biçimde tutar", async () => {
    await acquireLock(path, info(100));
    // Dosya insan tarafından da okunacak: tek satır JSON değil, girintili.
    expect(await readFile(path, "utf8")).toContain('"flow": "daily"');
  });
});

describe("pidAlive", () => {
  it("kendi sürecimizi canlı görür", () => {
    expect(pidAlive(process.pid)).toBe(true);
  });

  it("olmayan pid'i ölü görür", () => {
    // 2^22 üstü pid Linux'ta ayrılmaz; bu test kutusunda güvenli.
    expect(pidAlive(4_194_305)).toBe(false);
  });
});

describe("liveLock", () => {
  it("kilit yoksa null", async () => {
    expect(await liveLock(path)).toBeNull();
  });

  it("canlı sahibi döner", async () => {
    await acquireLock(path, info(100), { alive: () => true });
    expect(await liveLock(path, { alive: () => true })).toEqual(info(100));
  });

  // Bayat kilit engel değil: gözcü çöktüyse `recover` tam gereken şeydir.
  it("ölü sahibi engel saymaz", async () => {
    await acquireLock(path, info(100), { alive: () => true });
    expect(await liveLock(path, { alive: () => false })).toBeNull();
  });

  it("bozuk kilidi engel saymaz", async () => {
    await writeFile(path, "{ yarım");
    expect(await liveLock(path)).toBeNull();
  });

  // Kendi kilidini engel sanan bir süreç hiçbir iş yapamazdı.
  it("kendi pid'imizi engel saymaz", async () => {
    await acquireLock(path, info(100), { alive: () => true });
    expect(await liveLock(path, { alive: () => true, bizimPid: 100 })).toBeNull();
    expect(await liveLock(path, { alive: () => true, bizimPid: 999 })).toEqual(info(100));
  });
});
