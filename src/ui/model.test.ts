import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { al } from "../testing/queue.js";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { knownProviderSet } from "../adapters/factory.js";
import { newCard, type Card } from "../card/card.js";
import { CardQueue } from "../card/queue.js";
import { EventLog } from "../events/log.js";
import { loadFlow } from "../flow/load.js";
import { snapshot, type TopologySnapshot } from "../flow/snapshot.js";
import { acquireLock } from "../watch/lock.js";
import { tick } from "../watch/tick.js";
import {
  activationSteps, buildDetail, buildModel, buildSteps, kartSayisi, kirliSuruyorMu,
  type BuildOptions, type UiEngel,
} from "./model.js";

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

  /**
   * SAĞ PANEL — "Rol" modu meta satırı (DEVIR.md: "sağlayıcı, çalışma
   * alanı, ... toplu alım") buradan okuyor. `receive` belirtilmemiş rol
   * `"task"`'a düşer (load.ts'in kendi varsayılanı) — ekran YENİ bir
   * varsayılan icat ETMİYOR, topolojinin verdiğini aynen taşıyor.
   */
  it("rolün prompt yolunu ve alım türünü taşır", async () => {
    const model = await buildModel(base);
    expect(model.roles[0]).toMatchObject({ id: "coder", prompt: "roles/coder.prompt", receive: "task" });
    expect(model.roles[1]).toMatchObject({ id: "reviewer", prompt: "roles/reviewer.prompt", receive: "batch" });
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

  /**
   * BİLDİRİLMEYEN SIFIR DEĞİLDİR — ekran tarafı.
   *
   * Model eskiden `costUsd ?? 0` ile topluyordu, yani projenin kendi
   * yasakladığı kalıbın ta kendisi (bkz. `bench/usage.ts`). Gerçek bir
   * koşuda zaman aşımına uğrayan bir aktivasyon dolar bildirmedi ve
   * ekranda o tur BEDAVA göründü: 20 dakika, 156 adım, milyonlarca
   * token. Sayı eksik değildi, YANLIŞTI.
   */
  it("dolar bildirmeyen aktivasyon SAYILIR — toplam alt sınır olduğunu söyler", async () => {
    const card = await put();
    const log = new EventLog(logPath, "kosu-1");
    await log.append({
      type: "agent.finished", cell: `${card.id}:coder`, exitCode: 0, durationMs: 1_000,
      usage: { costUsd: 0.5 },
    });
    // Zaman aşımı: dolar YOK, token var (akıştan toplanan yarım ölçü).
    await log.append({
      type: "agent.finished", cell: `${card.id}:reviewer`, exitCode: 137, durationMs: 1_200_000,
      timedOut: true, usage: { inputTokens: 3_000_000, outputTokens: 40_000, partial: true },
    });

    const model = await buildModel(base);
    const c = model.cards[0];

    expect(c?.costUsd).toBeCloseTo(0.5, 5);
    expect(c?.olculmeyen).toBe(1);
    expect(c?.tokens).toBe(3_040_000);
    expect(model.totals.olculmeyen).toBe(1);
  });

  // Ölçü HİÇ bildirilmediğinde de aynı: dolar da token da yok, ama
  // aktivasyon oldu ve sayılmalı.
  it("hiç ölçü taşımayan aktivasyon da ölçülmeyen sayılır", async () => {
    const card = await put();
    const log = new EventLog(logPath, "kosu-1");
    await log.append({
      type: "agent.finished", cell: `${card.id}:coder`, exitCode: 1, durationMs: 500,
    });

    const model = await buildModel(base);

    expect(model.cards[0]?.olculmeyen).toBe(1);
    expect(model.cards[0]?.tokens).toBe(0);
  });

  // Karşı yan: her şey ölçüldüyse işaret SIFIR kalmalı, yoksa her toplam
  // alt sınır gibi okunur ve uyarı anlamını yitirir.
  it("hepsi dolar bildirdiyse ölçülmeyen SIFIR", async () => {
    const card = await put();
    const log = new EventLog(logPath, "kosu-1");
    await log.append({
      type: "agent.finished", cell: `${card.id}:coder`, exitCode: 0, durationMs: 10,
      usage: { costUsd: 0.01 },
    });

    const model = await buildModel(base);

    expect(model.cards[0]?.olculmeyen).toBe(0);
    expect(model.totals.olculmeyen).toBe(0);
  });

  // Sıfır dolar BİLDİREN bir çağrı, dolar BİLDİRMEYEN bir çağrı değildir.
  // Bu ayrım kaybolursa ücretsiz bir tur ölçülmemiş sayılır ve uyarı
  // yanlış yerde çıkar.
  it("doları 0 olarak BİLDİREN çağrı ölçülmüş sayılır", async () => {
    const card = await put();
    const log = new EventLog(logPath, "kosu-1");
    await log.append({
      type: "agent.finished", cell: `${card.id}:coder`, exitCode: 0, durationMs: 10,
      usage: { costUsd: 0 },
    });

    const model = await buildModel(base);

    expect(model.cards[0]?.olculmeyen).toBe(0);
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

    const record = detail?.history.find((h) => h.event === "plan");
    expect(record?.plan).toEqual({
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

    const record = detail?.history.find((h) => h.event === "plan");
    expect(record?.plan).toEqual({
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

    const record = detail?.history.find((h) => h.event === "plan");
    expect(record?.plan?.invalid).toBe(0);
    expect(record?.plan).toEqual({
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

/**
 * `geriHedef` TOPOLOJİDEN gelmeli, sabit olmamalı.
 *
 * Ekranın "Geri gönder" düğmesi bu alana bakıyor. Alan her zaman `null`
 * olsaydı düğme hiç çıkmaz ve insan GERÇEKTEN var olan bir çıkışı
 * kaybederdi — hedefsiz `back`'i sessizce `retry`'ye çevirmenin ters
 * yönden aynası. (Bu sınama olmadan "hep null ver" mutasyonu hayatta
 * kalıyordu.)
 */
describe("buildModel — geri hedefi", () => {
  it("ret hedefi olan rolde hedefi veriyor", async () => {
    await put();
    const ilk = await queue.take("coder");
    if (ilk.kind !== "alindi") throw new Error("kart alınamadı");
    const kart = await queue.handoff(ilk.card, {});

    const m = await buildModel(base);

    // reviewer'ın ret hedefi coder.
    expect(m.cards.find((c) => c.id === kart.id)?.geriHedef).toBe("coder");
  });

  it("zincirin başındaki rolde null", async () => {
    const kart = await put();

    const m = await buildModel(base);

    // coder'ın ret hedefi yok.
    expect(m.cards.find((c) => c.id === kart.id)?.geriHedef).toBeNull();
  });
});

/**
 * DİYAGRAMIN OKUDUĞU KENARLAR VE KAPILAR.
 *
 * Sayfa artık akışı bir diyagram olarak çiziyor ama YAML'ı KENDİSİ
 * AYRIŞTIRMIYOR — `src/flow/load.ts` akışın ne anlama geldiğine karar veren
 * TEK yer kalmalı. Bu yüzden kenarlar ve kapılar burada, `buildModel`
 * içinde türetiliyor; sayfa yalnızca bu listeyi okuyor.
 */
describe("buildModel — akış diyagramı", () => {
  it("next ve reject kenarları doğru yönde giriyor", async () => {
    const m = await buildModel(base);

    expect(m.edges).toEqual(
      expect.arrayContaining([
        { from: "coder", to: "reviewer", kind: "next" },
        { from: "reviewer", to: "coder", kind: "reject" },
      ]),
    );
  });

  /**
   * BOŞ KENAR ÇİZİLMİYOR.
   *
   * `coder` zincirin başı: ret hedefi yok (`load.ts` kural 14). Model her
   * rol için "gönderene dön" kenarı üretseydi, zincirin başında olmayan bir
   * ilişki varmış gibi görünürdü — en kötü sessiz arıza türü, çünkü
   * diyagram YANLIŞ bir okla ama hatasız çizilir.
   */
  it("reject hedefi olmayan rol için kenar üretilmiyor", async () => {
    const m = await buildModel(base);

    expect(m.edges.some((e) => e.kind === "reject" && e.from === "coder")).toBe(false);
  });

  it("syncBack kendi türünde, ayrı bir kenar olarak giriyor", async () => {
    const syncBackFlow = FLOW.replace("reject: coder", "syncBack: [coder]\n    reject: coder");
    await writeFile(join(root, "hub", "flows", "test.yaml"), syncBackFlow);
    const flow = await loadFlow(join(root, "hub", "flows", "test.yaml"), {
      root, providers: knownProviderSet(),
    });
    const topo = snapshot(flow, root);

    const m = await buildModel({ ...base, topology: topo, flowHash: flow.hash });

    expect(m.edges).toEqual(
      expect.arrayContaining([{ from: "reviewer", to: "coder", kind: "syncBack" }]),
    );
    // Aynı hedefe giden reject ile syncBack İKİ AYRI kenar — biri birini
    // ezmemeli, yoksa diyagram iki ilişkiden birini kaybeder.
    expect(m.edges.filter((e) => e.from === "reviewer" && e.to === "coder")).toHaveLength(2);
  });

  it("kapılar modele giriyor", async () => {
    await writeFile(join(root, "hub", "flows", "test.yaml"), FLOW_KAPILI);
    const flow = await loadFlow(join(root, "hub", "flows", "test.yaml"), {
      root, providers: knownProviderSet(),
    });
    const topo = snapshot(flow, root);

    const m = await buildModel({ ...base, topology: topo, flowHash: flow.hash });

    expect(m.gates).toEqual([{ after: "coder", type: "approval" }]);
  });

  // `type: none` sessizce elenmemeli: filtreleme kararı SAYFADA verilir
  // (hangi kapı türü görsel olarak işaretleniyor), modelde değil.
  it("kapı tipi filtrelenmeden olduğu gibi taşınıyor", async () => {
    const flowText = FLOW.replace("reject:\n  limit: 2", `gates:
  - after: coder
    type: none
reject:
  limit: 2`);
    await writeFile(join(root, "hub", "flows", "test.yaml"), flowText);
    const flow = await loadFlow(join(root, "hub", "flows", "test.yaml"), {
      root, providers: knownProviderSet(),
    });
    const topo = snapshot(flow, root);

    const m = await buildModel({ ...base, topology: topo, flowHash: flow.hash });

    expect(m.gates).toEqual([{ after: "coder", type: "none" }]);
  });
});

/**
 * PLANLAMA ALANI — V formasyonu diyagramının "planlama bandı" ve
 * "en çok N tur" etiketinin kaynağı (kart c-20261105-2a8dab, DEVIR.md
 * "Planlama bandı").
 *
 * `topology.plan` zaten `flow/load.ts`te doğrulanmış (katılımcılar var
 * olan rollere işaret ediyor, zincir sırasında, vb.) — burada SINANAN,
 * modelin bu alanı OLDUĞU GİBİ taşıdığı, ne bir rolü atladığı ne de tur
 * sayısını yeniden yorumladığı.
 */
describe("buildModel — planlama alanı", () => {
  it("akış planlama tanımlamadıysa null döner", async () => {
    const m = await buildModel(base);
    expect(m.plan).toBeNull();
  });

  it("planlama varsa katılımcıları ve en çok tur sayısını taşır", async () => {
    const flowText = `
name: test
constitution:
  - ../prompts/base.md
roles:
  - id: planner
    provider: claude
    workspace: main
    prompt: ../../roles/coder.prompt
    next: coder
  - id: coder
    provider: claude
    workspace: coder
    prompt: ../../roles/coder.prompt
    next: reviewer
  - id: reviewer
    provider: codex
    workspace: reviewer
    prompt: ../../roles/reviewer.prompt
    receive: batch
    reject: coder
    next: done
planlama:
  katilimcilar: [planner, coder]
  tur: 3
  plan: docs/plan/{kart}.md
reject:
  limit: 2
  onExhausted: gate
`;
    await writeFile(join(root, "hub", "flows", "test.yaml"), flowText);
    const flow = await loadFlow(join(root, "hub", "flows", "test.yaml"), {
      root, providers: knownProviderSet(),
    });
    const topo = snapshot(flow, root);

    const m = await buildModel({ ...base, topology: topo, flowHash: flow.hash });

    expect(m.plan).toEqual({ katilimcilar: ["planner", "coder"], tur: 3 });
  });

  // KOPYA, REFERANS DEĞİL: ekran bu diziyi mutasyona uğratırsa (örn. sıralama
  // için) canlı topolojinin kendisini bozmamalı — `snapshot()`'un kendi
  // savunmasıyla aynı ilke.
  it("katılımcı dizisi topolojiden BAĞIMSIZ bir kopya", async () => {
    const flowText = `
name: test
constitution:
  - ../prompts/base.md
roles:
  - id: planner
    provider: claude
    workspace: main
    prompt: ../../roles/coder.prompt
    next: done
planlama:
  katilimcilar: [planner]
  tur: 1
  plan: docs/plan/{kart}.md
reject:
  limit: 2
  onExhausted: gate
`;
    await writeFile(join(root, "hub", "flows", "test.yaml"), flowText);
    const flow = await loadFlow(join(root, "hub", "flows", "test.yaml"), {
      root, providers: knownProviderSet(),
    });
    const topo = snapshot(flow, root);

    const m = await buildModel({ ...base, topology: topo, flowHash: flow.hash });
    m.plan?.katilimcilar.push("uydurma");

    expect(topo.plan?.katilimcilar).toEqual(["planner"]);
  });
});

/**
 * Kuyruk engeli EKRANDA görünmeli.
 *
 * `take` yarışı kaybetmeyi gerçek engelden ayırıyor ve engeli
 * `queue.blocked` olayına yazıyor — ama teşhis yalnızca gözcünün
 * terminalinde ve günlükte duruyordu. Operatörün baktığı yer ekran ve
 * orada kart sessizce kuyrukta bekliyordu.
 *
 * Olay GEÇMİŞ, engel ise bir DURUM: çözülmüş engeli basmak operatöre
 * olmayan bir arıza göstermek olurdu. Ayrım dosyanın hâlâ yerinde olup
 * olmaması — `rename` başardığı an o yol kaybolur.
 */
describe("buildModel — kuyruk engeli", () => {
  async function engelKaydi(yol: string): Promise<void> {
    const log = new EventLog(logPath, "kosu-1");
    await log.append({
      type: "queue.blocked",
      role: "coder",
      path: yol,
      code: "EPERM",
      message: "operation not permitted",
    });
  }

  it("dosya yerindeyse engel bildiriliyor", async () => {
    const yol = join(root, ".skein", "queue", "coder", "0-x-c-1.json");
    await mkdir(dirname(yol), { recursive: true });
    await writeFile(yol, "{}");
    await engelKaydi(yol);

    const m = await buildModel(base);

    expect(m.blockages).toHaveLength(1);
    // Kod ve yol olmadan "alınamadı" kullanıcıyı hiçbir yere götürmez.
    expect(m.blockages[0]).toMatchObject({ code: "EPERM", role: "coder", path: yol });
    expect(m.blockages[0]?.message).toBe("operation not permitted");
  });

  it("dosya gitmişse engel bildirilmiyor", async () => {
    // Kayıt var ama dosya yok: kart alındı ya da taşındı, engel çözüldü.
    await engelKaydi(join(root, ".skein", "queue", "coder", "0-x-c-yok.json"));

    const m = await buildModel(base);

    expect(m.blockages).toEqual([]);
  });

  // Gözcü her geçişte bir kayıt yazıyor: aynı engel onlarca kez basılmamalı.
  it("aynı yol için tek satır, en yeni kayıt", async () => {
    const yol = join(root, ".skein", "queue", "coder", "0-x-c-2.json");
    await mkdir(dirname(yol), { recursive: true });
    await writeFile(yol, "{}");
    const log = new EventLog(logPath, "kosu-1");
    await log.append({ type: "queue.blocked", role: "coder", path: yol, code: "EPERM", message: "ilk" });
    await log.append({ type: "queue.blocked", role: "coder", path: yol, code: "EBUSY", message: "son" });

    const m = await buildModel(base);

    expect(m.blockages).toHaveLength(1);
    expect(m.blockages[0]?.code).toBe("EBUSY");
  });

  it("hiç engel kaydı yoksa boş", async () => {
    await put();
    expect((await buildModel(base)).blockages).toEqual([]);
  });
});

/**
 * `kartSayisi` — başlığın KART sayması, ENGEL KAYDI saymaması (ÖLÇÜM, kart
 * c-20261106-9a451b). Mutasyon denemesi: gruplama anahtarını KIRLI için
 * `path`'e çevirirsen (ya da diğer kodlar için `role`'e) ilk/üçüncü sınama
 * düşer; geri alınca yeşile döner.
 */
describe("kartSayisi", () => {
  const blockage = (ovr: Partial<UiEngel>): UiEngel => ({
    path: "p", code: "KIRLI", message: "m", role: "coder", at: "2026-11-06T00:00:00.000Z", ...ovr,
  });

  it("aynı rolün birden çok KIRLI kaydı TEK kart sayılır", () => {
    const blockages = [blockage({ path: "a" }), blockage({ path: "b" }), blockage({ path: "c" })];
    expect(kartSayisi(blockages)).toBe(1);
  });

  it("farklı rollerin KIRLI kayıtları ayrı kart sayılır", () => {
    const blockages = [blockage({ path: "a", role: "coder" }), blockage({ path: "b", role: "reviewer" })];
    expect(kartSayisi(blockages)).toBe(2);
  });

  it("KIRLI olmayan kodlarda yol kart sayar, eski anlam korunuyor", () => {
    const blockages = [
      blockage({ code: "EPERM", path: "x", role: "coder" }),
      blockage({ code: "EPERM", path: "y", role: "coder" }),
    ];
    expect(kartSayisi(blockages)).toBe(2);
  });

  it("boş liste sıfır kart", () => {
    expect(kartSayisi([])).toBe(0);
  });
});

/**
 * `kirliSuruyorMu` — ÖLÇÜM (kart c-20261106-9a451b): KIRLI'nin yolu bir
 * KAYNAK dosyası, asla kaybolmaz; çözülme bir SONRAKİ `agent.started`a
 * bağlı, dosyanın varlığına değil. Mutasyon denemesi: `<=`'yi `<`'ye ya da
 * `undefined` dalını `false`'a çevirirsen ilk/son sınama düşer.
 */
describe("kirliSuruyorMu", () => {
  const blockage: UiEngel = {
    path: "src/ui/server.ts", code: "KIRLI", message: "m", role: "coder",
    at: "2026-11-06T02:29:00.000Z",
  };

  it("rol hiç tur başlatmadıysa sürüyor sayılır — bilmiyorsak çözülmüş sayma", () => {
    expect(kirliSuruyorMu(blockage, undefined)).toBe(true);
  });

  it("engelden SONRA bir agent.started varsa çözülmüş sayılır", () => {
    expect(kirliSuruyorMu(blockage, "2026-11-06T05:00:00.000Z")).toBe(false);
  });

  it("agent.started engelden ÖNCEYSE hâlâ sürüyor sayılır", () => {
    expect(kirliSuruyorMu(blockage, "2026-11-06T01:00:00.000Z")).toBe(true);
  });

  // Tam aynı an: kesinlikle SONRA değil, o yüzden temkinli taraf seçiliyor
  // — "daha yeni" (SAPMALAR'ın "bilmiyorsak başlatma" ilkesiyle aynı).
  it("agent.started engelle TAM AYNI anda sayılırsa hâlâ sürüyor sayılır", () => {
    expect(kirliSuruyorMu(blockage, blockage.at)).toBe(true);
  });
});

/**
 * KIRLI engeli — ÖLÇÜM, canlı ekran (kart c-20261106-9a451b): kırmızı bant
 * "8 kart kuyrukta ALINAMIYOR" diyordu, gerçekte kuyrukta 1 kart vardı ve
 * son KIRLI olayı saatler önceydi. İki ayrı hata burada uçtan uca sınanıyor:
 * birim (dosya sayısı ≠ kart sayısı) ve yaşam süresi (kaynak dosya hiç
 * kaybolmaz, çözülme olaya bağlı olmalı).
 */
describe("buildModel — KIRLI engeli", () => {
  async function kirliKaydi(yol: string): Promise<void> {
    const log = new EventLog(logPath, "kosu-1");
    await log.append({ type: "queue.blocked", role: "coder", path: yol, code: "KIRLI", message: "kirli ağaç" });
  }

  it("kaynak dosya hâlâ yerinde olsa da, sonraki agent.started engeli çözer", async () => {
    const kaynak = join(root, "src", "ui", "server.ts");
    await mkdir(dirname(kaynak), { recursive: true });
    await writeFile(kaynak, "// kaynak\n");
    await kirliKaydi(kaynak);

    const once = await buildModel(base);
    expect(once.blockages).toHaveLength(1);
    expect(once.blockages[0]?.code).toBe("KIRLI");

    // Rol sonradan BAŞARIYLA bir tur başlattı — runRole ajanı çağırmadan
    // önce ağacı kontrol ediyor (tick.ts), yani bu olay ancak ağaç o anda
    // temizse loglanabilir.
    const log = new EventLog(logPath, "kosu-1");
    await log.append({
      type: "agent.started", cell: "c-sonraki:coder", role: "coder",
      provider: "claude", model: "m", promptHash: "h",
    });

    const sonra = await buildModel(base);
    expect(sonra.blockages).toEqual([]);
    // Dosya HÂLÂ yerinde: çözülme varlığa değil olaya bağlı olduğunu kanıtlıyor.
    await expect(stat(kaynak)).resolves.toBeDefined();
  });

  it("sonraki agent.started yoksa engel saatler sonra bile sürmeye devam eder", async () => {
    const kaynak = join(root, "src", "ui", "server.ts");
    await mkdir(dirname(kaynak), { recursive: true });
    await writeFile(kaynak, "// kaynak\n");
    await kirliKaydi(kaynak);

    const m = await buildModel(base);
    expect(m.blockages).toHaveLength(1);
  });

  it("8 kirli dosyalı aynı rol TEK kart sayılır (totals.engelliKart)", async () => {
    const log = new EventLog(logPath, "kosu-1");
    for (let i = 0; i < 8; i += 1) {
      const yol = join(root, "src", `dosya${i}.ts`);
      await mkdir(dirname(yol), { recursive: true });
      await writeFile(yol, "// x\n");
      await log.append({ type: "queue.blocked", role: "coder", path: yol, code: "KIRLI", message: "kirli ağaç" });
    }

    const m = await buildModel(base);
    expect(m.blockages).toHaveLength(8);
    expect(m.totals.engelliKart).toBe(1);
  });

  // KIRLI olmayan engel (kuyruk dosyası engeli) eski davranışı korumalı:
  // dosya yerindeyse sürüyor, taşındıysa bitmiş — stat kontrolü bozulmamış.
  it("KIRLI olmayan engel eski davranışı korur: dosya yerindeyse sürüyor", async () => {
    const yol = join(root, ".skein", "queue", "coder", "0-x-c-eski.json");
    await mkdir(dirname(yol), { recursive: true });
    await writeFile(yol, "{}");
    const log = new EventLog(logPath, "kosu-1");
    await log.append({ type: "queue.blocked", role: "coder", path: yol, code: "EPERM", message: "izin yok" });
    await log.append({
      type: "agent.started", cell: "c-baska:coder", role: "coder",
      provider: "claude", model: "m", promptHash: "h",
    });

    const m = await buildModel(base);
    // Dosya hâlâ yerinde: sonraki agent.started KIRLI'nin kuralı, bunu
    // ETKİLEMEMELİ — eski anlam (varlık testi) bu kod için geçerli.
    expect(m.blockages).toHaveLength(1);
    expect(m.blockages[0]?.code).toBe("EPERM");
  });
});

/**
 * Yazan ile okuyan arasındaki SÖZLEŞME.
 *
 * `tick` olayı `path`/`code`/`role`/`message` alanlarıyla yazıyor, model
 * aynı adlarla okuyor. İki taraf kendi sınamalarında kendi düz
 * metinlerini kullandığı için adlar ayrışsa İKİ sınama takımı da yeşil
 * kalırdı — bu depoda "aynı bilgi iki yerde" diye adlandırılan kusur
 * sınıfı. Bu sınama gerçek bir engeli gerçek `tick` ile yazdırıp ekranın
 * modelinden okuyor.
 */
describe("tick → model — engel sözleşmesi", () => {
  it("tick'in yazdığı engeli ekranın modeli görüyor", async () => {
    const kart = await put();
    // Hedef adı bir dizin: `rename` oraya taşıyamaz.
    await mkdir(join(root, ".skein", "active", "coder", `${kart.id}.json`), { recursive: true });

    const sonuc = await tick("coder", {
      root,
      queue,
      adapters: new Map(),
      log: new EventLog(logPath, "kosu-1"),
    });
    expect(sonuc.status).toBe("engelli");

    const m = await buildModel(base);

    expect(m.blockages).toHaveLength(1);
    expect(m.blockages[0]?.role).toBe("coder");
    expect(m.blockages[0]?.path).toContain(kart.id);
    // Kod gerçek bir errno olmalı: "?" demek alanın adının ayrıştığı
    // ya da hiç yazılmadığı anlamına gelir.
    expect(m.blockages[0]?.code).not.toBe("?");
    expect(m.blockages[0]?.code).not.toBe("ENOENT");
    expect(m.blockages[0]?.message).not.toBe("");
  });
});

/**
 * `activationSteps` — Ajanlar sekmesinin "Adımlar" listesi (DEVIR.md §6,
 * kart c-20261105-d304ed). SAF: olay dizisi veriliyor, DOM/disk yok.
 *
 * `lastStep`in ("buildModel — canlı adım" takımı, yukarıda) AYNI pencere
 * kuralını paylaştığı için burada o takımı TEKRARLAMIYORUZ — yalnızca
 * `lastStep`in GÖREMEDİĞİ şeyi sınıyoruz: TAM listeyi ve pencereleme
 * mantığının (önceki aktivasyonun adımlarının sızmaması) kendisini.
 */
/** `bench/ab.test.ts`'in `ev()` yardımcısıyla AYNI desen: zorunlu zarf alanları (v/at/runId) tek yerde. */
const ev = (e: Record<string, unknown>, at = "2026-01-01T00:00:00.000Z") =>
  ({ v: 1, at, runId: "r1", ...e }) as never;

describe("activationSteps", () => {
  it("boş günlükte boş dizi döner", () => {
    expect(activationSteps([])).toEqual([]);
  });

  it("son agent.started'dan sonraki adımları ARTAN sırayla verir", () => {
    const olaylar = [
      ev({ type: "agent.started", cell: "c-1:coder", role: "coder" }),
      ev({ type: "agent.step", cell: "c-1:coder", role: "coder", seq: 1, kind: "tool", name: "Read", detail: "a.ts" }, "10:00"),
      ev({ type: "agent.step", cell: "c-1:coder", role: "coder", seq: 2, kind: "tool", name: "Edit", detail: "a.ts" }, "10:01"),
    ];
    expect(activationSteps(olaylar)).toEqual([
      { seq: 1, kind: "tool", name: "Read", detail: "a.ts", at: "10:00" },
      { seq: 2, kind: "tool", name: "Edit", detail: "a.ts", at: "10:01" },
    ]);
  });

  it("bitmiş aktivasyon boş dizi döner — bitmiş bir turun adımı 'şu an' değildir", () => {
    const olaylar = [
      ev({ type: "agent.started", cell: "c-1:coder", role: "coder" }),
      ev({ type: "agent.step", cell: "c-1:coder", role: "coder", seq: 1, kind: "tool", name: "Read" }),
      ev({ type: "agent.finished", cell: "c-1:coder", exitCode: 0, durationMs: 1 }),
    ];
    expect(activationSteps(olaylar)).toEqual([]);
  });

  /**
   * PENCERELEME — en kritik karar noktası: `from` yanlış hesaplansa önceki
   * (BİTMİŞ) aktivasyonun adımları YENİ aktivasyonun listesine sızar ve
   * operatör eski bir Bash komutunu "şu an koşuyor" sanır.
   */
  it("önceki (bitmiş) aktivasyonun adımları yeni aktivasyona sızmaz", () => {
    const olaylar = [
      ev({ type: "agent.started", cell: "c-1:coder", role: "coder" }),
      ev({ type: "agent.step", cell: "c-1:coder", role: "coder", seq: 1, kind: "tool", name: "ESKİ" }),
      ev({ type: "agent.finished", cell: "c-1:coder", exitCode: 1, durationMs: 1 }),
      ev({ type: "agent.started", cell: "c-1:coder", role: "coder" }),
      ev({ type: "agent.step", cell: "c-1:coder", role: "coder", seq: 1, kind: "tool", name: "YENİ" }),
    ];
    const adimlar = activationSteps(olaylar);
    expect(adimlar).toHaveLength(1);
    expect(adimlar[0]?.name).toBe("YENİ");
  });

  it("'text' türündeki adımları da (araç adı olmadan) taşır", () => {
    const olaylar = [
      ev({ type: "agent.started", cell: "c-1:coder", role: "coder" }),
      ev({ type: "agent.step", cell: "c-1:coder", role: "coder", seq: 1, kind: "text" }, "10:05"),
    ];
    expect(activationSteps(olaylar)).toEqual([{ seq: 1, kind: "text", name: null, detail: null, at: "10:05" }]);
  });
});

/**
 * `buildSteps` — `GET /adimlar?kart=`in model tarafı (server.ts). Kart
 * `buildDetail` gibi `queue.get` ile aranıyor, ama `git show` çalıştıran
 * diff okuması YOK — bu uç SANİYELİK yoklamaya açık, pahalı bir yan iş
 * taşımamalı.
 */
describe("buildSteps", () => {
  it("kart yoksa null döner", async () => {
    expect(await buildSteps(base, "c-yok")).toBeNull();
  });

  it("kartın güncel aktivasyonunun adımlarını artan sırada döner", async () => {
    const card = await put();
    await al(queue, "coder");
    const log = new EventLog(logPath, "kosu-1");
    await log.append({
      type: "agent.started", cell: `${card.id}:coder`, role: "coder",
      provider: "claude", model: "m", promptHash: "h",
    });
    await log.append({
      type: "agent.step", cell: `${card.id}:coder`, role: "coder",
      seq: 1, kind: "tool", name: "Read", detail: "src/retry.ts",
    });
    await log.append({
      type: "agent.step", cell: `${card.id}:coder`, role: "coder",
      seq: 2, kind: "tool", name: "Bash", detail: "npx vitest run",
    });

    const adimlar = await buildSteps(base, card.id);

    expect(adimlar).toHaveLength(2);
    expect(adimlar?.[0]).toMatchObject({ seq: 1, name: "Read" });
    expect(adimlar?.[1]).toMatchObject({ seq: 2, name: "Bash", detail: "npx vitest run" });
  });

  it("bitmiş aktivasyonda boş dizi döner", async () => {
    const card = await put();
    await al(queue, "coder");
    const log = new EventLog(logPath, "kosu-1");
    await log.append({
      type: "agent.started", cell: `${card.id}:coder`, role: "coder",
      provider: "claude", model: "m", promptHash: "h",
    });
    await log.append({ type: "agent.step", cell: `${card.id}:coder`, role: "coder", seq: 1, kind: "tool", name: "Read" });
    await log.append({ type: "agent.finished", cell: `${card.id}:coder`, exitCode: 0, durationMs: 1 });

    expect(await buildSteps(base, card.id)).toEqual([]);
  });

  it("başka kartın adımlarını SIZDIRMAZ — olaylar hücreden kart kimliğine ayrıştırılır", async () => {
    const birinci = await put("bir");
    const ikinci = await put("iki");
    await al(queue, "coder");
    await al(queue, "coder");
    const log = new EventLog(logPath, "kosu-1");
    await log.append({
      type: "agent.started", cell: `${birinci.id}:coder`, role: "coder",
      provider: "claude", model: "m", promptHash: "h",
    });
    await log.append({ type: "agent.step", cell: `${birinci.id}:coder`, role: "coder", seq: 1, kind: "tool", name: "BİRİNCİ" });
    await log.append({
      type: "agent.started", cell: `${ikinci.id}:coder`, role: "coder",
      provider: "claude", model: "m", promptHash: "h",
    });
    await log.append({ type: "agent.step", cell: `${ikinci.id}:coder`, role: "coder", seq: 1, kind: "tool", name: "İKİNCİ" });

    const birininAdimlari = await buildSteps(base, birinci.id);
    expect(birininAdimlari).toHaveLength(1);
    expect(birininAdimlari?.[0]?.name).toBe("BİRİNCİ");
  });
});
