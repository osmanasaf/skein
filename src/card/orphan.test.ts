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
import { closeOrphan, isOrphan, isStale } from "./orphan.js";
import { CardQueue } from "./queue.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

let root: string;
let queue: CardQueue;
let daily: TopologySnapshot;
let spec: TopologySnapshot;
let logPath: string;

const load = async (name: string): Promise<TopologySnapshot> =>
  snapshot(
    await loadFlow(join(repoRoot, "hub", "flows", `${name}.yaml`), {
      root: repoRoot,
      providers: knownProviderSet(),
    }),
    repoRoot,
  );

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-orphan-"));
  queue = new CardQueue(join(root, ".skein"));
  await queue.init();
  daily = await load("daily");
  spec = await load("spec");
  logPath = join(root, ".skein", "olaylar.jsonl");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** `spec` akışıyla açılmış kart; `daily` akışında `analyst` rolü yok. */
const specKart = (): Promise<Card> =>
  queue.add(newCard({ title: "spec kartı", task: "iş", topology: spec }));

describe("isOrphan", () => {
  it("rolü yaşayan akışta olmayan kart yetimdir", async () => {
    const card = await specKart();
    expect(card.role).toBe("analyst");
    expect(isOrphan(card, daily)).toBe(true);
  });

  it("rolü duran kart yetim değildir", async () => {
    const card = await specKart();
    expect(isOrphan(card, spec)).toBe(false);
  });

  // Bitmiş kartın gideceği yer yok; yetimlik onu ilgilendirmiyor.
  it("bitmiş kart yetim sayılmaz", async () => {
    const card = await specKart();
    const bitmis: Card = { ...card, state: "done" };
    expect(isOrphan(bitmis, daily)).toBe(false);
  });

  // Akış dosyası silinmişse gidecek rol listesi yok.
  it("akış hiç okunamıyorsa kart yetimdir", async () => {
    const card = await specKart();
    expect(isOrphan(card, null)).toBe(true);
  });
});

describe("closeOrphan — akış okunamıyorsa", () => {
  it("gerekçe akışı işaret eder", async () => {
    const card = await specKart();

    const sonuc = await closeOrphan(root, queue, null, card.id, logPath);

    expect(sonuc.reason).toContain("spec");
    expect(sonuc.card.state).toBe("done");
  });
});

describe("isStale", () => {
  it("farklı damgayla başlamış kartı işaretler", async () => {
    const card = await specKart();
    expect(isStale(card, daily.hash)).toBe(true);
    expect(isStale(card, spec.hash)).toBe(false);
  });
});

describe("closeOrphan", () => {
  it("yetim kartı gerekçesiyle kapatır ve günlüğe düşürür", async () => {
    const card = await specKart();

    const sonuc = await closeOrphan(root, queue, daily, card.id, logPath);

    expect(sonuc.card.state).toBe("done");
    expect(sonuc.card.history.at(-1)).toMatchObject({ event: "done", from: "analyst" });
    expect(sonuc.reason).toContain("analyst");

    const { events } = await readEvents(logPath);
    expect(events[0]).toMatchObject({ type: "card.closed", card: card.id, role: "analyst" });
  });

  // Genel bir "kartı iptal et" düğmesi olsaydı, sürtünmesi olması gereken
  // bir şey sürtünmesiz olurdu.
  it("yetim olmayan kartı kapatmayı reddeder", async () => {
    const card = await specKart();

    await expect(closeOrphan(root, queue, spec, card.id, logPath)).rejects.toThrow(/yetim değil/);

    expect((await queue.get(card.id))?.state).toBe("queued");
    expect((await readEvents(logPath)).events).toEqual([]);
  });

  it("olmayan kart için hata", async () => {
    await expect(closeOrphan(root, queue, daily, "c-yok", logPath)).rejects.toThrow(/Böyle bir kart yok/);
  });

  // Altından kartı çekmek, parası ödenmiş bir turu ortada bırakmak olurdu.
  it("koşan kart kapatılamaz", async () => {
    await specKart();
    await queue.take("analyst");
    const aktif = (await queue.list())[0] as Card;
    expect(aktif.state).toBe("active");

    await expect(closeOrphan(root, queue, daily, aktif.id, logPath)).rejects.toThrow(/koşuyor/);
  });

  it("kapıdaki yetim kart kapatılabilir", async () => {
    await specKart();
    const taken = (await queue.take("analyst")) as Card;
    const gated = await queue.escalate(taken, "verdikt yok");
    expect(gated.state).toBe("gate");

    const sonuc = await closeOrphan(root, queue, daily, gated.id, logPath);

    expect(sonuc.card.state).toBe("done");
  });
});
