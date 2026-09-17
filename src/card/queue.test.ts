import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { knownProviderSet } from "../adapters/factory.js";
import { loadFlow } from "../flow/load.js";
import { snapshot, type TopologySnapshot } from "../flow/snapshot.js";
import { newCard, rejectCount, serializeCard, type Card } from "./card.js";
import { CardQueue, QueueError } from "./queue.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

async function topologyOf(name: string): Promise<TopologySnapshot> {
  const flow = await loadFlow(join(repoRoot, "hub", "flows", `${name}.yaml`), {
    root: repoRoot,
    providers: knownProviderSet(),
  });
  return snapshot(flow, repoRoot);
}

let root: string;
let queue: CardQueue;
let daily: TopologySnapshot;
let spec: TopologySnapshot;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-queue-"));
  queue = new CardQueue(join(root, ".skein"));
  await queue.init();
  daily = await topologyOf("daily");
  spec = await topologyOf("spec");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Bir kartı açıp kuyruğa koyar. */
async function put(topology: TopologySnapshot, title = "iş", now?: Date): Promise<Card> {
  const card = newCard({ title, task: "bir şey yap", topology, ...(now ? { now } : {}) });
  await queue.add(card);
  return card;
}

/** Kartın dosya sisteminde kaç yerde göründüğünü sayar. */
async function copiesOf(id: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.includes(id)) found.push(path);
    }
  }
  await walk(join(root, ".skein"));
  return found;
}

describe("CardQueue — temel hareket", () => {
  it("eklenen kart rolün kuyruğunda bekler", async () => {
    const card = await put(daily);
    expect(await queue.depth("coder")).toBe(1);
    expect((await queue.get(card.id))?.state).toBe("queued");
  });

  it("take kartı aktif hâle getirir", async () => {
    const card = await put(daily);
    const taken = await queue.take("coder");

    expect(taken?.id).toBe(card.id);
    expect(taken?.state).toBe("active");
    expect(taken?.history.at(-1)).toMatchObject({ event: "taken", role: "coder" });
    expect(await queue.depth("coder")).toBe(0);
  });

  it("boş kuyrukta take null döner", async () => {
    expect(await queue.take("coder")).toBeNull();
  });

  it("başka rolün kuyruğundan kart almaz", async () => {
    await put(daily);
    expect(await queue.take("reviewer")).toBeNull();
  });

  it("kart her zaman tam olarak bir yerdedir", async () => {
    const card = await put(daily);
    expect(await copiesOf(card.id)).toHaveLength(1);
    await queue.take("coder");
    expect(await copiesOf(card.id)).toHaveLength(1);
  });

  it("FIFO: önce açılan kart önce alınır", async () => {
    const eski = await put(daily, "eski", new Date("2026-09-01T10:00:00Z"));
    const yeni = await put(daily, "yeni", new Date("2026-09-02T10:00:00Z"));

    expect((await queue.take("coder"))?.id).toBe(eski.id);
    expect((await queue.take("coder"))?.id).toBe(yeni.id);
  });
});

describe("CardQueue — ileri yön", () => {
  it("handoff kartı sonraki rolün kuyruğuna taşır", async () => {
    await put(daily);
    const card = (await queue.take("coder")) as Card;
    const moved = await queue.handoff(card, { commit: "abc1234" });

    expect(moved.role).toBe("reviewer");
    expect(moved.state).toBe("queued");
    expect(moved.history.at(-1)).toMatchObject({
      event: "handoff", from: "coder", to: "reviewer", commit: "abc1234",
    });
    expect(await queue.depth("reviewer")).toBe(1);
  });

  it("zincirin sonunda handoff kartı bitirir", async () => {
    await put(daily);
    await queue.handoff((await queue.take("coder")) as Card, {});
    const done = await queue.handoff((await queue.take("reviewer")) as Card, {});

    expect(done.state).toBe("done");
    expect(done.history.at(-1)).toMatchObject({ event: "done", from: "reviewer" });
    expect(await queue.depth("reviewer")).toBe(0);
  });

  it("kapısı olan rolden sonra kart insan kapısında bekler", async () => {
    await put(spec);
    const card = (await queue.take("analyst")) as Card;
    const gated = await queue.handoff(card, {});

    expect(gated.state).toBe("gate");
    // Kart henüz coder'a GEÇMEDİ; onay bekliyor.
    expect(gated.role).toBe("analyst");
    expect(await queue.depth("coder")).toBe(0);
  });

  it("kapıdan bırakılan kart sonraki rolün kuyruğuna geçer", async () => {
    await put(spec);
    const gated = await queue.handoff((await queue.take("analyst")) as Card, {});
    const released = await queue.release(gated.id);

    expect(released.role).toBe("coder");
    expect(released.state).toBe("queued");
    expect(released.history.at(-1)).toMatchObject({ event: "released" });
  });

  it("kapıda reddeden insan işi geri gönderir", async () => {
    await put(spec);
    const gated = await queue.handoff((await queue.take("analyst")) as Card, {});
    const back = await queue.release(gated.id, { decision: "back" });

    // analyst zincirin başı: geri dönecek rol yok, işi kendi yeniden yapar.
    expect(back.role).toBe("analyst");
    expect(back.state).toBe("queued");
  });

  it("aktif olmayan kart devredilemez", async () => {
    const card = await put(daily);
    await expect(queue.handoff(card, {})).rejects.toThrow(QueueError);
  });
});

describe("CardQueue — ret", () => {
  it("ret kartı hedef rolün kuyruğuna geri taşır", async () => {
    await put(daily);
    await queue.handoff((await queue.take("coder")) as Card, {});
    const card = (await queue.take("reviewer")) as Card;
    const sent = await queue.reject(card, { reason: "yarış koşulu var", commit: "abc1234" });

    expect(sent.role).toBe("coder");
    expect(sent.state).toBe("queued");
    expect(sent.rejects["reviewer->coder"]).toBe(1);
    expect(sent.history.at(-1)).toMatchObject({
      event: "reject", from: "reviewer", to: "coder", round: 1, reason: "yarış koşulu var",
    });
  });

  it("reddedilen kart kuyruğun başına geçer", async () => {
    await put(daily, "reddedilen", new Date("2026-09-02T10:00:00Z"));
    await put(daily, "taze", new Date("2026-09-01T10:00:00Z"));

    const first = (await queue.take("coder")) as Card; // taze, daha eski
    await queue.handoff(first, {});
    const reviewed = (await queue.take("reviewer")) as Card;
    const rejected = await queue.reject(reviewed, { reason: "olmamış" });

    // Kuyrukta daha ESKİ bir kart beklemesine rağmen, geri dönen önce gelir:
    // yarım kalmış işi bitirmek, yenisine başlamaktan önemli.
    expect((await queue.take("coder"))?.id).toBe(rejected.id);
  });

  it("gerekçesiz ret reddedilir", async () => {
    await put(daily);
    await queue.handoff((await queue.take("coder")) as Card, {});
    const card = (await queue.take("reviewer")) as Card;
    await expect(queue.reject(card, { reason: "  " })).rejects.toThrow(/gerekçe/i);
  });

  it("zincirin başı reddedemez", async () => {
    await put(daily);
    const card = (await queue.take("coder")) as Card;
    await expect(queue.reject(card, { reason: "olmadı" })).rejects.toThrow(/geri dönecek rol/i);
  });

  it("limit dolunca kart insan kapısına çıkar", async () => {
    await put(daily);
    let card = (await queue.take("coder")) as Card;

    // limit 2: iki ret geçer, üçüncüsü kapıya çıkar.
    for (const round of [1, 2]) {
      await queue.handoff(card, {});
      const sent = await queue.reject((await queue.take("reviewer")) as Card, { reason: `tur ${round}` });
      expect(sent.rejects["reviewer->coder"]).toBe(round);
      card = (await queue.take("coder")) as Card;
    }

    await queue.handoff(card, {});
    const escalated = await queue.reject((await queue.take("reviewer")) as Card, { reason: "yine olmadı" });

    expect(escalated.state).toBe("gate");
    expect(escalated.history.at(-1)).toMatchObject({ event: "gate", role: "reviewer" });
    expect(await queue.depth("coder")).toBe(0);
  });

  // Kaçış kapısı ile kilit kapısı ikisi de `state: "gate"` bırakıyor ve rolü
  // değiştirmiyor. Farkı kayıt söylüyor; söylemeseydi ileri bırakma sessizce
  // bayat bir ağaç üretirdi.
  describe("kaçış kapısı ≠ onay/kilit kapısı", () => {
    async function escalated(): Promise<Card> {
      await put(daily);
      const card = (await queue.take("coder")) as Card;
      return queue.escalate(card, "ağaçta işlenmemiş değişiklik var: README.md");
    }

    it("kaçış kapısında ileri bırakmak REDDEDİLİR", async () => {
      const card = await escalated();
      await expect(queue.release(card.id, { decision: "forward" })).rejects.toThrow(
        /kaçış kapısında/,
      );
      // Kart yerinde kaldı: reddedilen bir karar kartı oynatmamalı.
      expect((await queue.get(card.id))?.state).toBe("gate");
    });

    it("hata mesajı sebebi ve çıkış yolunu söyler", async () => {
      const card = await escalated();
      const error = await queue.release(card.id, { decision: "forward" }).catch((e: Error) => e);
      expect(String(error)).toContain("README.md");
      expect(String(error)).toContain("retry");
    });

    it("kaçış kapısının varsayılanı retry — aynı rol baştan koşar", async () => {
      const card = await escalated();
      const released = await queue.release(card.id);
      expect(released.role).toBe("coder");
      expect(released.state).toBe("queued");
      expect(await queue.depth("coder")).toBe(1);
    });

    it("kaçış kapısından geri göndermek serbest", async () => {
      await put(daily);
      await queue.handoff((await queue.take("coder")) as Card, {});
      const card = await queue.escalate((await queue.take("reviewer")) as Card, "verdikt yok");

      const released = await queue.release(card.id, { decision: "back" });

      expect(released.role).toBe("coder");
    });

    it("onay kapısında ileri bırakmak serbest — kod zaten taşındı", async () => {
      await put(spec);
      const card = (await queue.take("analyst")) as Card;
      const gated = await queue.handoff(card, { commit: "abc1234" });
      expect(gated.state).toBe("gate");

      const released = await queue.release(gated.id, { decision: "forward" });

      expect(released.role).toBe("coder");
    });
  });

  it("kapıdaki kilidi insan iki yönde de çözebilir", async () => {
    /** daily akışında kartı ret limiti dolana kadar döndürür. */
    async function deadlock(): Promise<Card> {
      await put(daily);
      let card = (await queue.take("coder")) as Card;
      for (let i = 0; i < 2; i++) {
        await queue.handoff(card, {});
        await queue.reject((await queue.take("reviewer")) as Card, { reason: `tur ${i + 1}` });
        card = (await queue.take("coder")) as Card;
      }
      await queue.handoff(card, {});
      return queue.reject((await queue.take("reviewer")) as Card, { reason: "yine olmadı" });
    }

    // "Denetçi haklı" — iş üreticiye döner, sayaç sıfırlanmış olarak.
    const back = await queue.release((await deadlock()).id, { decision: "back" });
    expect(back.role).toBe("coder");
    expect(rejectCount(back, "reviewer", "coder")).toBe(0);

    // "Üretici haklı" — kart denetçiyi geçer ve biter.
    const forward = await queue.release((await deadlock()).id, { decision: "forward" });
    expect(forward.state).toBe("done");
  });

  it("reddeden rol kabul edince o kenarın sayacı sıfırlanır", async () => {
    await put(daily);
    await queue.handoff((await queue.take("coder")) as Card, {});
    await queue.reject((await queue.take("reviewer")) as Card, { reason: "olmadı" });

    const fixed = (await queue.take("coder")) as Card;
    expect(rejectCount(fixed, "reviewer", "coder")).toBe(1);

    await queue.handoff(fixed, {});
    const accepted = await queue.handoff((await queue.take("reviewer")) as Card, {});
    // Sayaç sıfırlanmıyor, anahtar siliniyor: kart ölü sıfırlar biriktirmesin.
    expect(rejectCount(accepted, "reviewer", "coder")).toBe(0);
    expect(Object.keys(accepted.rejects)).toEqual([]);
  });
});

describe("CardQueue — çökme ve yarış", () => {
  it("aynı kartı iki koşucu birden alamaz", async () => {
    await put(daily);
    const [a, b] = await Promise.all([queue.take("coder"), queue.take("coder")]);
    expect([a, b].filter((c) => c !== null)).toHaveLength(1);
  });

  it("recover yarıda kalan aktif kartı kuyruğa geri koyar", async () => {
    await put(daily);
    const card = (await queue.take("coder")) as Card;

    const recovered = await queue.recover();
    expect(recovered.map((c) => c.id)).toEqual([card.id]);
    expect((await queue.get(card.id))?.state).toBe("queued");
    expect((await queue.get(card.id))?.history.at(-1)).toMatchObject({ event: "requeued" });
  });

  it("recover kopyayı uzun geçmişli olanı tutarak çözer", async () => {
    await put(daily);
    const card = (await queue.take("coder")) as Card;
    const moved = await queue.handoff(card, { commit: "abc" });

    // Taşıma tamamlandıktan SONRA kaynak dosyanın silinemediği hâli kur:
    // yeniden adlandırma ile unlink arasında çöken bir süreç tam olarak
    // bunu bırakır.
    const stale = join(root, ".skein", "active", "coder", `${card.id}.json`);
    await mkdir(dirname(stale), { recursive: true });
    await writeFile(stale, serializeCard(card));
    expect(await copiesOf(card.id)).toHaveLength(2);

    await queue.recover();

    const copies = await copiesOf(card.id);
    expect(copies).toHaveLength(1);
    const kept = (await queue.get(card.id)) as Card;
    expect(kept.role).toBe("reviewer");
    expect(kept.history).toHaveLength(moved.history.length);
  });

  it("bozuk kart dosyası kuyruğu durdurmaz ama sessizce de geçmez", async () => {
    await put(daily);
    await writeFile(join(root, ".skein", "queue", "coder", "0-000000000000000-c-bozuk.json"), "{ değil");
    await expect(queue.take("coder")).rejects.toThrow(/bozuk/i);
  });
});

describe("CardQueue — listeleme", () => {
  it("list tüm kartları durumlarıyla döner", async () => {
    const a = await put(daily, "a", new Date("2026-09-01T10:00:00Z"));
    const b = await put(daily, "b", new Date("2026-09-02T10:00:00Z"));
    await queue.take("coder");

    const all = await queue.list();
    expect(all.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
    expect(all.find((c) => c.id === a.id)?.state).toBe("active");
    expect(all.find((c) => c.id === b.id)?.state).toBe("queued");
  });

  it("olmayan kart null döner", async () => {
    expect(await queue.get("c-20260101-aaaaaa")).toBeNull();
  });

  it("init iki kez çağrılabilir", async () => {
    await queue.init();
    expect(await queue.list()).toEqual([]);
  });

  it("kart dosyaları .skein altında kalır", async () => {
    const card = await put(daily);
    const files = await readdir(join(root, ".skein", "queue", "coder"));
    expect(files).toHaveLength(1);
    expect(await readFile(join(root, ".skein", "queue", "coder", files[0] as string), "utf8"))
      .toContain(card.id);
  });
});
