import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { knownProviderSet } from "../adapters/factory.js";
import { loadFlow } from "../flow/load.js";
import { snapshot } from "../flow/snapshot.js";
import { spawnPortable } from "../proc/process.js";
import { newCard } from "./card.js";
import { CardQueue } from "./queue.js";

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

/**
 * "Kuyruk boş" ile "kart alamadım" aynı cümle olamaz.
 *
 * `take` her `rename` hatasını yarış sanıyordu: kart kuyrukta kalıyor,
 * CLI "kuyruğu boş" diyor ve kullanıcı kartı bekliyordu. Çıkış kodu da
 * 0'dı, yani betikler de arızayı başarı sayıyordu.
 */
describe("card CLI — kuyruk engeli", () => {
  it("alınamayan kart 'kuyruk boş' demiyor", async () => {
    // Kart üretim API'siyle konuluyor; dosya adlandırmasını testin taklit
    // etmesi, taklidi sınamak olurdu.
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const flow = await loadFlow(join(repoRoot, "hub", "flows", "daily.yaml"), {
      root: repoRoot,
      providers: knownProviderSet(),
    });
    const queue = new CardQueue(join(dir, ".skein"));
    await queue.init();
    const kart = await queue.add(
      newCard({ title: "iş", task: "bir şey yap", topology: snapshot(flow, repoRoot) }),
    );

    // Hedef adı bir dizin: `rename` oraya taşıyamaz (Linux EISDIR,
    // Windows EPERM/EACCES) — "yolda duran bir şey" senaryosu.
    await mkdir(join(dir, ".skein", "active", kart.role, `${kart.id}.json`), { recursive: true });

    const { code, out } = await card(dir, "take", kart.role);

    expect(out).not.toContain("kuyruğu boş");
    expect(out).toContain("alınamadı");
    expect(out).toContain(kart.id);
    // Betikler için de arıza: 0 dönerse "iş yok" sanılır.
    expect(code).toBe(1);
  });
}, 60_000);

/**
 * İnsan "geri gönder" dediğinde, gönderilemediyse SÖYLENMELİ.
 *
 * Zincirin başında `back`'in hedefi yok ve kart aynı role dönüyor. CLI
 * sessizce `(retry)` basarsa insan kartı geri gönderdiğini sanır; ekranda
 * düğme artık çıkmıyor ama CLI hâlâ komutu kabul ediyor.
 */
describe("card CLI — hedefsiz back", () => {
  it("uygulanamayan kararı yazıyor", async () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const flow = await loadFlow(join(repoRoot, "hub", "flows", "daily.yaml"), {
      root: repoRoot,
      providers: knownProviderSet(),
    });
    const topology = snapshot(flow, repoRoot);
    const queue = new CardQueue(join(dir, ".skein"));
    await queue.init();
    await queue.add(newCard({ title: "iş", task: "bir şey yap", topology }));
    // coder zincirin başı: ret hedefi yok.
    const sonuc = await queue.take("coder");
    if (sonuc.kind !== "alindi") throw new Error("kart alınamadı");
    const atGate = await queue.escalate(sonuc.card, "verdikt yok");

    const { code, out } = await card(dir, "release", atGate.id, "back");

    expect(code).toBe(0);
    expect(out).toContain("uygulanamadı");
    expect(out).toContain("zincirin başında");
    // Uygulanan karar da doğru adla basılmalı.
    expect(out).toContain("(retry)");
    expect(out).not.toContain("(back)");
  });

  // Hedefi OLAN back'te uyarı ÇIKMAMALI: her bırakmada basılan bir uyarı
  // okunmaz hâle gelir.
  it("hedefi olan back'te uyarı yok", async () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const flow = await loadFlow(join(repoRoot, "hub", "flows", "daily.yaml"), {
      root: repoRoot,
      providers: knownProviderSet(),
    });
    const topology = snapshot(flow, repoRoot);
    const queue = new CardQueue(join(dir, ".skein"));
    await queue.init();
    await queue.add(newCard({ title: "iş", task: "bir şey yap", topology }));
    const ilk = await queue.take("coder");
    if (ilk.kind !== "alindi") throw new Error("kart alınamadı");
    await queue.handoff(ilk.card, {});
    const ikinci = await queue.take("reviewer");
    if (ikinci.kind !== "alindi") throw new Error("kart alınamadı");
    const atGate = await queue.escalate(ikinci.card, "verdikt yok");

    const { code, out } = await card(dir, "release", atGate.id, "back");

    expect(code).toBe(0);
    expect(out).not.toContain("uygulanamadı");
    expect(out).toContain("(back)");
  });
}, 60_000);
