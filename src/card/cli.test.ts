import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnPortable } from "../proc/process.js";

/**
 * CLI'yi GERÇEKTEN koşturur.
 *
 * `cli.ts` modül düzeyinde kendini çağırıyor, yani import edilemiyor —
 * bu yüzden projede hiç CLI testi yoktu ve `take`/`recover` gibi yollar
 * yalnızca `queue` katmanından sınanıyordu. Kapının kendisi (kilide
 * uyuyor mu) ancak süreç sınırında görülebilir.
 */
async function card(cwd: string, ...argv: string[]): Promise<{ code: number; out: string }> {
  const child = spawnPortable("npx", ["tsx", join(process.cwd(), "src", "card", "cli.ts"), ...argv], {
    cwd,
  });
  let out = "";
  child.stdout?.on("data", (c: Buffer) => (out += c.toString()));
  child.stderr?.on("data", (c: Buffer) => (out += c.toString()));
  const code = await new Promise<number>((resolve) => {
    child.on("close", (c) => resolve(c ?? 1));
  });
  return { code, out };
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "skein-cardcli-"));
  await mkdir(join(dir, ".skein"), { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function kilit(pid: number): Promise<void> {
  await writeFile(
    join(dir, ".skein", "daemon.json"),
    JSON.stringify({ pid, startedAt: "2026-11-02T10:00:00.000Z", flow: "daily", hash: "abc", mode: "serve" }),
  );
}

/**
 * Gözcü koşarken `active/` alanına dokunan komutlar reddedilmeli.
 *
 * `recover` gözcünün ELİNDEKİ kartı çökmüş sanıp kuyruğa geri atıyordu,
 * `take` aynı kartı insanın eline veriyordu; ikisi de aynı işi ikinci kez,
 * para harcayarak yaptırır. Gözcünün kilidi tam bunu önlemek için var ve
 * bu iki yol ona hiç bakmıyordu.
 */
describe("card CLI — gözcü kilidi", () => {
  it("canlı gözcü varken take reddediyor", async () => {
    await kilit(process.pid);
    const { code, out } = await card(dir, "take", "kodlayici");
    expect(code).toBe(1);
    expect(out).toContain("gözcü açık");
    // Ne yapacağını söylemeyen ret, kullanıcıyı kilitli bırakır.
    expect(out).toContain("daemon.json");
  });

  it("canlı gözcü varken recover reddediyor", async () => {
    await kilit(process.pid);
    const { code, out } = await card(dir, "recover");
    expect(code).toBe(1);
    expect(out).toContain("gözcü açık");
  });

  // Bayat kilit engel OLMAMALI: gözcü `kill -9` ile öldüyse `recover` tam
  // gereken şeydir. Kilit kalıcı engele dönüşürse çözdüğü sorundan büyük
  // bir sorun olur.
  it("bayat kilit recover'ı engellemiyor", async () => {
    await kilit(4_194_305);
    const { code, out } = await card(dir, "recover");
    expect(code).toBe(0);
    expect(out).toContain("yarıda kalan kart yok");
  });

  it("kilit yokken take normal çalışıyor", async () => {
    const { code, out } = await card(dir, "take", "kodlayici");
    expect(code).toBe(0);
    expect(out).toContain("kuyruğu boş");
  });
}, 60_000);
