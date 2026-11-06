import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { al } from "../testing/queue.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { knownProviderSet } from "../adapters/factory.js";
import { readEvents } from "../events/log.js";
import { loadFlow } from "../flow/load.js";
import { snapshot, type TopologySnapshot } from "../flow/snapshot.js";
import { newCard, type Card } from "./card.js";
import { CardQueue } from "./queue.js";
import { releaseCard } from "./release.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

let root: string;
let queue: CardQueue;
let daily: TopologySnapshot;
let logPath: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-release-"));
  queue = new CardQueue(join(root, ".skein"));
  await queue.init();
  const flow = await loadFlow(join(repoRoot, "hub", "flows", "daily.yaml"), {
    root: repoRoot,
    providers: knownProviderSet(),
  });
  daily = snapshot(flow, repoRoot);
  logPath = join(root, ".skein", "olaylar.jsonl");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function kacisKapisinda(): Promise<Card> {
  await queue.add(newCard({ title: "jitter", task: "iş", topology: daily }));
  const taken = await al(queue, "coder");
  return queue.escalate(taken, "ağaçta işlenmemiş değişiklik var");
}

describe("releaseCard", () => {
  // "İnsan ne sıklıkla araya girdi" sorusu kartları tek tek açmadan
  // cevaplanabilmeli.
  it("kararı olay günlüğüne düşürür", async () => {
    const card = await kacisKapisinda();

    const result = await releaseCard(root, queue, card.id, undefined, logPath);

    expect(result.decision).toBe("retry");
    expect(result.kind).toBe("escalation");
    const { events } = await readEvents(logPath);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "gate.released",
      card: card.id,
      role: "coder",
      decision: "retry",
      kind: "escalation",
    });
  });

  // Kapı tipi bırakmadan ÖNCE okunmalı: bırakma kartın son kaydını
  // `released` yapıyor ve o noktada kapı tipi artık okunamaz.
  it("kilit kapısının tipini ve varsayılanını doğru kaydeder", async () => {
    await queue.add(newCard({ title: "jitter", task: "iş", topology: daily }));
    let card = await al(queue, "coder");
    for (let i = 0; i < 2; i += 1) {
      await queue.handoff(card, {});
      await queue.reject(await al(queue, "reviewer"), { reason: `tur ${i + 1}` });
      card = await al(queue, "coder");
    }
    await queue.handoff(card, {});
    const kilitli = await queue.reject(await al(queue, "reviewer"), { reason: "yine olmadı" });
    expect(kilitli.state).toBe("gate");

    const result = await releaseCard(root, queue, kilitli.id, undefined, logPath);

    // Kilit kapısında tur tamamlandı ve kod yerinde: varsayılan ileri.
    expect(result).toMatchObject({ kind: "deadlock", decision: "forward" });
    const { events } = await readEvents(logPath);
    expect(events[0]).toMatchObject({ kind: "deadlock", decision: "forward" });
  });

  /**
   * Günlüğe UYGULANAN karar geçer, istenen değil.
   *
   * Bu sınama eskiden `decision: "back"` bekliyordu ve kusuru KİLİTLİYORDU:
   * `coder` zincirin başı, `back`'in hedefi yok, çekirdek kartı aynı role
   * döndürüyor — yani olan şey bir `retry`. Günlük yine `back` diyordu, yani
   * "insan kartı geri gönderdi mi" sorusu günlükten YANLIŞ cevaplanıyordu:
   * hiç geri gitmemiş kartlar `back` olarak sayılıyordu.
   */
  it("hedefi olmayan back, retry olarak kaydedilir", async () => {
    const card = await kacisKapisinda();

    const result = await releaseCard(root, queue, card.id, "back", logPath);

    expect(result.decision).toBe("retry");
    // İnsanın NİYETİ de kaybolmamalı: ayrı ve ölçülebilir bir olgu.
    expect(result.requested).toBe("back");
    const { events } = await readEvents(logPath);
    expect(events[0]).toMatchObject({ decision: "retry", requested: "back" });
    // Kart gerçekten aynı rolde: kayıt ile kartın yeri AYNI şeyi söylüyor.
    expect(result.card.role).toBe("coder");
  });

  // Hedefi OLAN `back` aynen geçmeli, yoksa düzeltme ters yöne kaçar ve
  // gerçek geri göndermeler de `retry` sayılırdı.
  it("hedefi olan back aynen kaydedilir", async () => {
    await queue.add(newCard({ title: "jitter", task: "iş", topology: daily }));
    await queue.handoff(await al(queue, "coder"), {});
    // reviewer'ın ret hedefi coder: geri dönecek rol VAR.
    const atGate = await queue.escalate(await al(queue, "reviewer"), "verdikt yok");

    const result = await releaseCard(root, queue, atGate.id, "back", logPath);

    expect(result.decision).toBe("back");
    expect(result.requested).toBe("back");
    expect(result.card.role).toBe("coder");
    const { events } = await readEvents(logPath);
    // İstenen ile uygulanan aynıysa `requested` HİÇ yazılmamalı: her kayda
    // eklemek, ayrımı okunamaz hâle getirirdi.
    expect(events[0]).toMatchObject({ decision: "back" });
    expect(events[0]).not.toHaveProperty("requested");
  });

  // Çekirdeğin reddi yardımcıdan da geçmeli: reddedilen komut kayıt bırakmaz.
  it("reddedilen karar günlüğe yazılmaz", async () => {
    const card = await kacisKapisinda();

    await expect(releaseCard(root, queue, card.id, "forward", logPath)).rejects.toThrow(
      /kaçış kapısında/,
    );

    expect((await readEvents(logPath)).events).toEqual([]);
    expect((await queue.get(card.id))?.state).toBe("gate");
  });
});
