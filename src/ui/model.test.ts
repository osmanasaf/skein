import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { al } from "../testing/queue.js";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { knownProviderSet } from "../adapters/factory.js";
import { newCard, type Card } from "../card/card.js";
import { CardQueue } from "../card/queue.js";
import { EventLog } from "../events/log.js";
import { loadFlow } from "../flow/load.js";
import { snapshot, type TopologySnapshot } from "../flow/snapshot.js";
import { acquireLock } from "../watch/lock.js";
import { buildDetail, buildModel, type BuildOptions } from "./model.js";

const FLOW = `
name: test
constitution:
  - ../prompts/base.md
roles:
  - id: coder
    provider: claude
    workspace: main
    prompt: ../../roles/coder.prompt
    next: reviewer
  - id: reviewer
    provider: codex
    workspace: reviewer
    prompt: ../../roles/reviewer.prompt
    receive: batch
    reject: coder
    next: done
reject:
  limit: 2
  onExhausted: gate
`;

/** Onay kapısı taşıyan akış: `coder` devrettikten SONRA insan onayı. */
const FLOW_KAPILI = FLOW.replace("reject:\n  limit: 2", `gates:
  - after: coder
    type: approval
    message: insan onayı
reject:
  limit: 2`);

let root: string;
let queue: CardQueue;
let topology: TopologySnapshot;
let logPath: string;
let base: BuildOptions;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-ui-"));
  await mkdir(join(root, "hub", "flows"), { recursive: true });
  await mkdir(join(root, "hub", "prompts"), { recursive: true });
  await mkdir(join(root, "roles"), { recursive: true });
  await writeFile(join(root, "hub", "prompts", "base.md"), "# Anayasa\n");
  await writeFile(join(root, "roles", "coder.prompt"), "# coder\n");
  await writeFile(join(root, "roles", "reviewer.prompt"), "# reviewer\n");
  await writeFile(join(root, "hub", "flows", "test.yaml"), FLOW);

  queue = new CardQueue(join(root, ".skein"));
  await queue.init();
  const flow = await loadFlow(join(root, "hub", "flows", "test.yaml"), {
    root,
    providers: knownProviderSet(),
  });
  topology = snapshot(flow, root);
  logPath = join(root, ".skein", "olaylar.jsonl");
  base = { root, queue, topology, flowName: flow.name, flowHash: flow.hash, logPath };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const put = (title = "iş"): Promise<Card> =>
  queue.add(newCard({ title, task: "retry'a jitter ekle", topology }));


/**
 * BAŞKA AKIŞIN KARTI — ölçülmüş kusur, ve yıkıcı olanı.
 *
 * Kuyruk kök başına, akış başına değil: depoda iki akış varsa ikisinin
 * kartları aynı `.skein/` altında duruyor. Eski kod her kartı EKRANIN
 * akışıyla yargılıyordu, yani `spec` akışının SAĞLAM bir kartı `daily`
 * panosunda yetim görünüyor, "Kartı kapat" düğmesi çıkıyor ve POST
 * geçiyordu: kart "akışta rolü yok" gerekçesiyle kapanıyor. Gerekçe
 * yanlış (rol kendi akışında duruyor) ve sürtünmesi olması gereken bir
 * karar tek düğmeyle veriliyordu.
 */
describe("buildModel — başka akışın kartı", () => {
  /** Kartın diskteki kaydını başka bir akışa çevirir. */
  async function baskaAkisaCevir(id: string): Promise<void> {
    const dizin = join(root, ".skein", "queue", "coder");
    for (const ad of await readdir(dizin)) {
      if (!ad.includes(id)) continue;
      const yol = join(dizin, ad);
      const ham = JSON.parse(await readFile(yol, "utf8")) as Record<string, unknown>;
      const topo = ham["topology"] as Record<string, unknown>;
      topo["flow"] = "baska-akis";
      topo["hash"] = "f".repeat(64);
      await writeFile(yol, JSON.stringify(ham));
    }
  }

  it("yetim de bayat da sayılmıyor, ayrı işaretleniyor", async () => {
    const card = await put();
    await baskaAkisaCevir(card.id);

    const m = await buildModel(base);
    const c = m.cards.find((x) => x.id === card.id);
    expect(c?.digerAkis).toBe(true);
    expect(c?.orphan).toBe(false);
    expect(c?.stale).toBe(false);
  });

  it("kendi akışının kartı diğer akış sayılmıyor", async () => {
    const card = await put();
    const m = await buildModel(base);
    expect(m.cards.find((x) => x.id === card.id)?.digerAkis).toBe(false);
  });
});

describe("buildModel — pano", () => {
  it("boş kuyrukta rolleri ve sıfır kartı verir", async () => {
    const model = await buildModel(base);
    expect(model.roles.map((r) => r.id)).toEqual(["coder", "reviewer"]);
    expect(model.cards).toEqual([]);
    expect(model.totals).toMatchObject({ open: 0, done: 0 });
  });

  it("kuyruk derinliğini rol başına sayar", async () => {
    await put("bir");
    await put("iki");
    const model = await buildModel(base);
    expect(model.roles[0]?.depth).toBe(2);
    expect(model.roles[1]?.depth).toBe(0);
  });

  it("kartın yeri DİZİNDEN okunur", async () => {
    const card = await put();
    await al(queue, "coder");

    const model = await buildModel(base);

    expect(model.cards[0]).toMatchObject({ id: card.id, role: "coder", state: "active" });
  });
});

describe("buildModel — kapılar", () => {
  it("kaçış kapısını gerekçesiyle ayırt eder", async () => {
    await put();
    const taken = await al(queue, "coder");
    await queue.escalate(taken, "ağaçta işlenmemiş değişiklik var: README.md");

    const model = await buildModel(base);

    expect(model.cards[0]?.gate).toBe("escalation");
    expect(model.cards[0]?.gateReason).toContain("README.md");
  });

  // Ekranın "Geçir" düğmesini göstermesi bu ayrıma bağlı.
  //
  // ISIRMAYAN SINAMA DÜZELTİLDİ: eski hâli yalnızca `queue.escalate`
  // çağırıp `"escalation"` bekliyordu — yani bir üstteki sınamanın
  // aynısıydı ve HİÇBİR YERDE onay kapısı kurmuyordu. `gateKind`'ın
  // `handoff` → `"approval"` satırı silinse bu sınama yeşil kalır,
  // akış kapısında bekleyen her kart panoda "kaçış kapısı · kod
  // taşınmadı" diye çizilir ve "Geçir" düğmesi hiç görünmez.
  it("onay kapısı kaçıştan ayrılır", async () => {
    // Onay kapılı akışı kur: `coder` devredince kart kapıda bekler.
    await writeFile(join(root, "hub", "flows", "test.yaml"), FLOW_KAPILI);
    const flow = await loadFlow(join(root, "hub", "flows", "test.yaml"), {
      root, providers: knownProviderSet(),
    });
    const topo = snapshot(flow, root);
    await queue.add(newCard({ title: "iş", task: "i", topology: topo }));
    const taken = await al(queue, "coder");
    await queue.handoff(taken, { commit: "abc1234" });

    const m = await buildModel({ ...base, topology: topo, flowHash: flow.hash });
    const kart = m.cards[0];

    expect(kart?.gate).toBe("approval");
    expect(kart?.planKilidi).toBe(false);
  });

  it("kapıda olmayan kartın kapısı yoktur", async () => {
    await put();
    const model = await buildModel(base);
    expect(model.cards[0]?.gate).toBeNull();
    expect(model.cards[0]?.gateReason).toBeNull();
  });
});

describe("buildModel — kartın hikâyesi", () => {
  // "2 ret" ile "kabul, ret, kapı, ret, bitti" aynı şey değil.
  it("iz sırayla kurulur ve ret gerekçesi taşınır", async () => {
    await put();
    const first = await al(queue, "coder");
    await queue.handoff(first, { commit: "abc1234" });
    await queue.reject(await al(queue, "reviewer"), { reason: "senkron çağrıda RangeError" });
    const again = await al(queue, "coder");
    await queue.handoff(again, { commit: "def5678" });
    await queue.handoff(await al(queue, "reviewer"), {});

    const card = (await buildModel(base)).cards[0];

    expect(card?.trail).toEqual(["accepted", "rejected", "accepted", "done"]);
    expect(card?.rejects).toBe(1);
    expect(card?.lastReject).toContain("RangeError");
    expect(card?.turns).toBe(4);
    expect(card?.state).toBe("done");
  });
});

describe("buildModel — ölçüm", () => {
  it("süre ve maliyet kart başına toplanır", async () => {
    const card = await put();
    const log = new EventLog(logPath, "kosu-1");
    await log.append({
      type: "agent.finished", cell: `${card.id}:coder`, exitCode: 0, durationMs: 62_000,
      usage: { costUsd: 0.07 },
    });
    await log.append({
      type: "agent.finished", cell: `${card.id}:reviewer`, exitCode: 0, durationMs: 89_000,
      usage: { costUsd: 0.02 },
    });

    const model = await buildModel(base);

    expect(model.cards[0]?.durationMs).toBe(151_000);
    expect(model.cards[0]?.costUsd).toBeCloseTo(0.09, 5);
    expect(model.totals.costUsd).toBeCloseTo(0.09, 5);
  });

  it("başka kartın olayları karışmaz", async () => {
    const mine = await put("benim");
    const log = new EventLog(logPath, "kosu-1");
    await log.append({
      type: "agent.finished", cell: "c-20260101-ffffff:coder", exitCode: 0, durationMs: 9_000,
      usage: { costUsd: 5 },
    });

    const model = await buildModel(base);

    expect(model.cards.find((c) => c.id === mine.id)?.costUsd).toBe(0);
  });
});

describe("buildModel — canlı adım", () => {
  it("koşan kartın son adımını verir", async () => {
    const card = await put();
    await al(queue, "coder");
    const log = new EventLog(logPath, "kosu-1");
    await log.append({
      type: "agent.started", cell: `${card.id}:coder`, role: "coder",
      provider: "claude", model: "m", promptHash: "h",
    });
    await log.append({ type: "agent.step", cell: `${card.id}:coder`, role: "coder", seq: 1, kind: "tool", name: "Read", detail: "src/retry.ts" });
    await log.append({ type: "agent.step", cell: `${card.id}:coder`, role: "coder", seq: 2, kind: "tool", name: "Edit", detail: "src/retry.ts" });

    const model = await buildModel(base);

    expect(model.cards[0]?.live).toMatchObject({ seq: 2, name: "Edit", detail: "src/retry.ts" });
  });

  // Bitmiş bir turun adımı "şu an" değildir.
  it("tur bittiyse canlı adım gösterilmez", async () => {
    const card = await put();
    await al(queue, "coder");
    const log = new EventLog(logPath, "kosu-1");
    await log.append({
      type: "agent.started", cell: `${card.id}:coder`, role: "coder",
      provider: "claude", model: "m", promptHash: "h",
    });
    await log.append({ type: "agent.step", cell: `${card.id}:coder`, role: "coder", seq: 1, kind: "tool", name: "Read" });
    await log.append({ type: "agent.finished", cell: `${card.id}:coder`, exitCode: 0, durationMs: 10 });

    expect((await buildModel(base)).cards[0]?.live).toBeNull();
  });

  it("koşmayan kartta canlı adım yoktur", async () => {
    await put();
    expect((await buildModel(base)).cards[0]?.live).toBeNull();
  });
});

describe("buildModel — gözcü", () => {
  it("kilit yoksa daemon null", async () => {
    expect((await buildModel(base)).daemon).toBeNull();
  });

  it("canlı gözcüyü bildirir", async () => {
    await acquireLock(join(root, ".skein", "daemon.json"), {
      pid: 4242, startedAt: "2026-09-17T10:00:00.000Z", flow: "test", hash: "h", mode: "serve",
    });

    const model = await buildModel({ ...base, alive: () => true });

    expect(model.daemon).toMatchObject({ alive: true, info: { pid: 4242, mode: "serve" } });
  });

  // Bayat kilit "açık" gösterilirse ekran yalan söyler.
  it("ölü pid'li kilidi açık göstermez", async () => {
    await acquireLock(join(root, ".skein", "daemon.json"), {
      pid: 4242, startedAt: "2026-09-17T10:00:00.000Z", flow: "test", hash: "h", mode: "serve",
    });

    const model = await buildModel({ ...base, alive: () => false });

    expect(model.daemon?.alive).toBe(false);
  });
});

describe("buildModel — türetilmiş, durum değil", () => {
  // Model silinse bir sonraki okumada aynen geri gelmeli (değişmez 1).
  it("iki kez kurulan model aynı sonucu verir", async () => {
    await put();
    await al(queue, "coder");
    const a = await buildModel({ ...base, now: () => new Date(0) });
    const b = await buildModel({ ...base, now: () => new Date(0) });
    expect(a).toEqual(b);
  });

  it("günlük hiç yoksa model yine kurulur", async () => {
    await put();
    const model = await buildModel({ ...base, logPath: join(root, "olmayan.jsonl") });
    expect(model.cards).toHaveLength(1);
    expect(model.totals.costUsd).toBe(0);
  });
});

describe("buildDetail — plan", () => {
  const numstat = async () => "";

  it("devredilen kartın plan alanı tam {path, hash} olarak döner", async () => {
    await put();
    await queue.handoff(await al(queue, "coder"), {
      commit: "abc1234",
      plan: { path: "docs/plan/c-yok.md", hash: "66ae27b7539abcdef0123456" },
    });
    const card = (await queue.list())[0] as Card;

    const detail = await buildDetail({ ...base, numstat }, card.id);

    expect(detail?.card.plan).toEqual({ path: "docs/plan/c-yok.md", hash: "66ae27b7539abcdef0123456" });
  });

  it("plana bağlı olmayan kartın plan alanı null'dur", async () => {
    await put();
    const card = (await queue.list())[0] as Card;

    const detail = await buildDetail({ ...base, numstat }, card.id);

    expect(detail?.card.plan).toBeNull();
  });
});

describe("buildDetail — planlama alışverişi", () => {
  const numstat = async () => "";

  it("action: yazdi, round 0 — objections/accepted/invalid hiç verilmemişse üçü de null", async () => {
    await put();
    const taken = await al(queue, "coder");
    await queue.planTurn(taken, "coder", {
      at: new Date().toISOString(),
      event: "plan",
      role: "coder",
      action: "yazdi",
      round: 0,
    });
    const card = (await queue.list())[0] as Card;

    const detail = await buildDetail({ ...base, numstat }, card.id);

    const kayit = detail?.history.find((h) => h.event === "plan");
    expect(kayit?.plan).toEqual({
      action: "yazdi",
      round: 0,
      objections: null,
      accepted: null,
      invalid: null,
    });
  });

  it("action: itiraz — accepted verilmemişse null, objections/invalid sayı olarak döner", async () => {
    await put();
    const taken = await al(queue, "coder");
    await queue.planTurn(taken, "coder", {
      at: new Date().toISOString(),
      event: "plan",
      role: "coder",
      action: "itiraz",
      round: 1,
      objections: 2,
      invalid: 1,
    });
    const card = (await queue.list())[0] as Card;

    const detail = await buildDetail({ ...base, numstat }, card.id);

    const kayit = detail?.history.find((h) => h.event === "plan");
    expect(kayit?.plan).toEqual({
      action: "itiraz",
      round: 1,
      objections: 2,
      accepted: null,
      invalid: 1,
    });
  });

  it("action: cevap — invalid: 0 null'a düşmez (?? kullanımı, || değil)", async () => {
    await put();
    const taken = await al(queue, "coder");
    await queue.planTurn(taken, "coder", {
      at: new Date().toISOString(),
      event: "plan",
      role: "coder",
      action: "cevap",
      round: 1,
      objections: 2,
      accepted: 1,
      invalid: 0,
    });
    const card = (await queue.list())[0] as Card;

    const detail = await buildDetail({ ...base, numstat }, card.id);

    const kayit = detail?.history.find((h) => h.event === "plan");
    expect(kayit?.plan?.invalid).toBe(0);
    expect(kayit?.plan).toEqual({
      action: "cevap",
      round: 1,
      objections: 2,
      accepted: 1,
      invalid: 0,
    });
  });

  it("hiç plan olayı geçmemiş kartta HER kaydın plan alanı null'dur", async () => {
    await put();
    await queue.handoff(await al(queue, "coder"), { commit: "abc1234" });
    const card = (await queue.list())[0] as Card;

    const detail = await buildDetail({ ...base, numstat }, card.id);

    expect(detail?.history.length).toBeGreaterThan(0);
    for (const h of detail?.history ?? []) {
      expect(h.plan).toBeNull();
    }
  });
});

describe("buildDetail — iz ve diff", () => {
  const numstat = async () => "24\t1\tsrc/events/log.ts\n19\t0\tsrc/watch/tick.ts\n";

  it("olmayan kart için null", async () => {
    expect(await buildDetail({ ...base, numstat }, "c-yok")).toBeNull();
  });

  // "En son neden reddedildi" sorusunun cevabı burada.
  it("ret gerekçesi izde tam metin olarak durur", async () => {
    await put();
    await queue.handoff(await al(queue, "coder"), { commit: "abc1234" });
    await queue.reject(await al(queue, "reviewer"), {
      reason: "senkron çağrıda RangeError atıyor",
      commit: "abc1234",
    });
    const card = (await queue.list())[0] as Card;

    const detail = await buildDetail({ ...base, numstat }, card.id);

    const ret = detail?.history.find((h) => h.event === "reject");
    expect(ret?.note).toBe("senkron çağrıda RangeError atıyor");
    expect(ret?.who).toBe("reviewer → coder");
  });

  it("devir özeti de izde görünür", async () => {
    await put();
    await queue.handoff(await al(queue, "coder"), {
      commit: "abc1234",
      summary: "kabul kriterleri yazıldı",
    });
    const card = (await queue.list())[0] as Card;

    const detail = await buildDetail({ ...base, numstat }, card.id);

    expect(detail?.history.find((h) => h.event === "handoff")?.note).toBe("kabul kriterleri yazıldı");
  });

  it("son commit'in diff özetini verir", async () => {
    await put();
    await queue.handoff(await al(queue, "coder"), { commit: "abc1234" });
    const card = (await queue.list())[0] as Card;

    const detail = await buildDetail({ ...base, numstat }, card.id);

    expect(detail?.diff?.commit).toBe("abc1234");
    expect(detail?.diff?.files).toEqual([
      { path: "src/events/log.ts", add: 24, del: 1 },
      { path: "src/watch/tick.ts", add: 19, del: 0 },
    ]);
  });

  it("commit yoksa diff null — kart yine gösterilir", async () => {
    await put();
    const card = (await queue.list())[0] as Card;
    const detail = await buildDetail({ ...base, numstat }, card.id);
    expect(detail?.diff).toBeNull();
    expect(detail?.card.title).toBe("iş");
  });

  // Dal silinmiş, worktree temizlenmiş olabilir. Ekran eksik bir parçası
  // yüzünden kapanmamalı.
  it("git okunamazsa detay diff'siz döner", async () => {
    await put();
    await queue.handoff(await al(queue, "coder"), { commit: "yok1234" });
    const card = (await queue.list())[0] as Card;

    const detail = await buildDetail({
      ...base,
      numstat: async () => { throw new Error("bad object"); },
    }, card.id);

    expect(detail).not.toBeNull();
    expect(detail?.diff).toBeNull();
  });
});
