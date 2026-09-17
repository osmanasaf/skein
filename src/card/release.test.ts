import { describe, expect, it, beforeEach, afterEach } from "vitest";
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
  const taken = (await queue.take("coder")) as Card;
  return queue.escalate(taken, "ağaçta işlenmemiş değişiklik var");
}

describe("releaseCard", () => {
  // "İnsan ne sıklıkla araya girdi" sorusu kartları tek tek açmadan
  // cevaplanabilmeli.
  it("kararı olay günlüğüne düşürür", async () => {
    const card = await kacisKapisinda();

    const sonuc = await releaseCard(root, queue, card.id, undefined, logPath);

    expect(sonuc.decision).toBe("retry");
    expect(sonuc.kind).toBe("escalation");
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
    let card = (await queue.take("coder")) as Card;
    for (let i = 0; i < 2; i += 1) {
      await queue.handoff(card, {});
      await queue.reject((await queue.take("reviewer")) as Card, { reason: `tur ${i + 1}` });
      card = (await queue.take("coder")) as Card;
    }
    await queue.handoff(card, {});
    const kilitli = await queue.reject((await queue.take("reviewer")) as Card, { reason: "yine olmadı" });
    expect(kilitli.state).toBe("gate");

    const sonuc = await releaseCard(root, queue, kilitli.id, undefined, logPath);

    // Kilit kapısında tur tamamlandı ve kod yerinde: varsayılan ileri.
    expect(sonuc).toMatchObject({ kind: "deadlock", decision: "forward" });
    const { events } = await readEvents(logPath);
    expect(events[0]).toMatchObject({ kind: "deadlock", decision: "forward" });
  });

  it("açık verilen karar günlüğe aynen geçer", async () => {
    const card = await kacisKapisinda();

    await releaseCard(root, queue, card.id, "back", logPath);

    const { events } = await readEvents(logPath);
    expect(events[0]).toMatchObject({ decision: "back" });
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
