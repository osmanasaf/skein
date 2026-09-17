import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock, pidAlive, readLock, releaseLock, type LockInfo } from "./lock.js";

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
