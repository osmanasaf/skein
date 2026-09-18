import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Adapter, InvokeRequest, InvokeResult } from "../adapters/contract.js";
import { knownProviderSet } from "../adapters/factory.js";
import { gateKind, newCard, type Card } from "../card/card.js";
import { CardQueue } from "../card/queue.js";
import { EventLog, readEvents } from "../events/log.js";
import { loadFlow } from "../flow/load.js";
import { roleOf, snapshot, type TopologySnapshot } from "../flow/snapshot.js";
import { buildTaskText } from "./task-text.js";
import { tick, type TickOptions } from "./tick.js";
import { VERDICT_FILE } from "./verdict.js";
import { WORKTREE_DIR } from "./workspace.js";

const FLOW = `
name: exchange-test
constitution:
  - ../prompts/base.md
roles:
  - id: planner
    provider: claude
    workspace: main
    prompt: ../../roles/planner.prompt
    next: architect
  - id: architect
    provider: claude
    workspace: architect
    prompt: ../../roles/architect.prompt
    reject: planner
    next: coder
  - id: coder
    provider: claude
    workspace: coder
    prompt: ../../roles/coder.prompt
    reject: planner
    next: done
planlama:
  katilimcilar: [planner, architect]
  tur: 1
  plan: docs/plan/{kart}.md
reject:
  limit: 2
  onExhausted: gate
`;

class FakeAdapter implements Adapter {
  readonly id = "claude";
  readonly model = "sahte-1";
  readonly calls: InvokeRequest[] = [];
  answer: ((req: InvokeRequest) => Promise<InvokeResult | void>) | null = null;
  async invoke(req: InvokeRequest): Promise<InvokeResult> {
    this.calls.push(req);
    const custom = await this.answer?.(req);
    return custom ?? { exitCode: 0, stdout: "", stderr: "", durationMs: 5 };
  }
}

let root: string;
let queue: CardQueue;
let topology: TopologySnapshot;
let claude: FakeAdapter;
let options: TickOptions;
/** Sahte dosya sistemi: yol → içerik. */
let dosyalar: Map<string, string>;

const PLAN_YOLU = (id: string) => `docs/plan/${id}.md`;
const ITIRAZ_YOLU = (id: string) => `docs/plan/${id}.itiraz.md`;

/** Rolün ağacındaki mutlak yol. */
const at = (workspace: string, rel: string): string =>
  join(workspace === "main" ? root : join(root, WORKTREE_DIR, workspace), rel);

const itiraz = (durum: string, kanit = "`src/var.ts:3`") => `# İtirazlar

## İtiraz 1 — architect
**Ne:** Plan geçmişi baştan oynatıyor.
**Neden:** Sürüm geriye düşer.
**Neyi yanlışlar:** ${kanit} — orada sürüm önbellek anahtarı.
**Durum:** ${durum}
`;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-alisveris-"));
  await mkdir(join(root, "hub", "flows"), { recursive: true });
  await mkdir(join(root, "hub", "prompts"), { recursive: true });
  await mkdir(join(root, "roles"), { recursive: true });
  for (const w of ["architect", "coder"]) {
    await mkdir(join(root, WORKTREE_DIR, w), { recursive: true });
  }
  await writeFile(join(root, "hub", "prompts", "base.md"), "# Anayasa\n");
  for (const r of ["planner", "architect", "coder"]) {
    await writeFile(join(root, "roles", `${r}.prompt`), `# ${r}\n`);
  }
  await writeFile(join(root, "hub", "flows", "exchange-test.yaml"), FLOW);

  queue = new CardQueue(join(root, ".skein"));
  await queue.init();
  const flow = await loadFlow(join(root, "hub", "flows", "exchange-test.yaml"), {
    root, providers: knownProviderSet(),
  });
  topology = snapshot(flow, root);

  claude = new FakeAdapter();
  dosyalar = new Map();
  options = {
    root,
    queue,
    adapters: new Map<string, Adapter>([["claude", claude]]),
    headCommit: async () => "abc1234",
    dirtyPaths: async () => [],
    isTracked: async () => false,
    mergeForward: async () => ({ kind: "merged" as const }),
    readPlan: async (path) => {
      const text = dosyalar.get(path);
      if (text === undefined) throw new Error("ENOENT");
      return text;
    },
    pathExists: async (path) => dosyalar.has(path),
  };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const put = async (): Promise<Card> =>
  queue.add(newCard({ title: "iş", task: "undo ekle", topology }));

const kabulEt = (summary = "tamam") => async (req: InvokeRequest): Promise<void> => {
  await writeFile(join(req.workdir, VERDICT_FILE), JSON.stringify({ decision: "accept", summary }));
};

/** Planı yazma turunu koşar; kart architect'e geçer. */
async function planYaz(card: Card, metin = "# Plan\nselector.ts sürüme bakıyor.\n"): Promise<void> {
  dosyalar.set(at("main", PLAN_YOLU(card.id)), metin);
  dosyalar.set(at("main", "src/var.ts"), "export const x = 1;\n");
  dosyalar.set(at("architect", "src/var.ts"), "export const x = 1;\n");
  claude.answer = kabulEt("plan yazıldı");
  await tick("planner", options);
}

describe("alışveriş — plan yazma turu", () => {
  it("plan yazılınca kart itiraz edene gider, zincirdeki koder'a değil", async () => {
    const card = await put();
    await planYaz(card);
    const moved = await queue.get(card.id);
    expect(moved?.role).toBe("architect");
    expect(moved?.plan?.path).toBe(PLAN_YOLU(card.id));
  });

  it("itiraz turunun iş metni biçimi ve kanıt kuralını taşır", async () => {
    const card = await put();
    await planYaz(card);
    const moved = (await queue.get(card.id)) as Card;
    const text = buildTaskText(moved, roleOf(topology, "architect")!);
    expect(text).toContain("## Plana itiraz et");
    expect(text).toContain(ITIRAZ_YOLU(card.id));
    expect(text).toContain("Neyi yanlışlar");
    expect(text).toContain("sessizlik anlaşma sayılmaz");
  });
});

describe("alışveriş — itiraz turu", () => {
  it("itiraz dosyası yoksa tur kabul edilmez", async () => {
    const card = await put();
    await planYaz(card);
    claude.answer = kabulEt("itirazım yok");

    const result = await tick("architect", options);
    expect(result.status).toBe("escalated");
    expect(result.status === "escalated" && result.reason).toMatch(/itiraz dosyası yok/);
  });

  it("geçerli itiraz kartı yazara geri gönderir", async () => {
    const card = await put();
    await planYaz(card);
    dosyalar.set(at("architect", ITIRAZ_YOLU(card.id)), itiraz("açık"));
    claude.answer = kabulEt("bir itirazım var");

    const result = await tick("architect", options);
    expect(result.status).toBe("accepted");
    const moved = await queue.get(card.id);
    expect(moved?.role).toBe("planner");

    const text = buildTaskText(moved as Card, roleOf(topology, "planner")!);
    expect(text).toContain("## İtirazları yanıtla");
  });

  // Tasarımın en keskin kuralı: genel öğüt makineyle elenir.
  it("kanıtı depoda olmayan itiraz sayılmaz, kart ilerler", async () => {
    const card = await put();
    await planYaz(card);
    dosyalar.set(at("architect", ITIRAZ_YOLU(card.id)), itiraz("açık", "`src/olmayan.ts:3`"));
    claude.answer = kabulEt("itiraz ettim");

    await tick("architect", options);
    // İtiraz geçersiz → alışveriş itirazsız kapanır → zincir devam eder.
    expect((await queue.get(card.id))?.role).toBe("coder");
  });

  // "İtiraz yok" ile "itiraz var ama hiçbiri sayılmadı" aynı şey değil:
  // ilki anlaşma, ikincisi ya biçimi öğrenmemiş bir rol ya da genel öğüt
  // üreten bir mekanizma. Tek sayıya erirse mekanizmanın tören olup
  // olmadığı sorusu cevapsız kalır.
  it("sayılmayan itirazları ayrı sayar", async () => {
    const card = await put();
    const logPath = join(root, "olaylar.jsonl");
    await planYaz(card);
    dosyalar.set(at("architect", ITIRAZ_YOLU(card.id)), itiraz("açık", "`src/olmayan.ts:3`"));
    claude.answer = kabulEt("itiraz ettim");

    await tick("architect", { ...options, log: new EventLog(logPath, "r1") });

    const { events } = await readEvents(logPath);
    const settled = events.find((e) => e.type === "plan.settled");
    expect(settled).toMatchObject({ objections: 0, invalid: 1 });
  });

  it("itirazsız tur alışverişi kapatır ve kart zincirden devam eder", async () => {
    const card = await put();
    await planYaz(card);
    dosyalar.set(at("architect", ITIRAZ_YOLU(card.id)), "# İtirazlar\n\nPlan bana doğru geldi.\n");
    claude.answer = kabulEt("itirazım yok");

    await tick("architect", options);
    expect((await queue.get(card.id))?.role).toBe("coder");
  });
});

describe("alışveriş — cevap turu", () => {
  /** İtiraz turunu da koşar; kart yazarda cevap bekler. */
  async function itirazaKadar(card: Card): Promise<void> {
    await planYaz(card);
    dosyalar.set(at("architect", ITIRAZ_YOLU(card.id)), itiraz("açık"));
    claude.answer = kabulEt("itirazım var");
    await tick("architect", options);
    // İtiraz dosyası yazarın ağacına da ulaşmış olmalı (gerçekte merge).
    dosyalar.set(at("main", ITIRAZ_YOLU(card.id)), itiraz("açık"));
  }

  it("kabul edilen itiraz planı değiştirmemişse tur kabul edilmez", async () => {
    const card = await put();
    await itirazaKadar(card);
    dosyalar.set(at("main", ITIRAZ_YOLU(card.id)), itiraz("kabul"));
    claude.answer = kabulEt("haklısın");

    const result = await tick("planner", options);
    expect(result.status).toBe("escalated");
    expect(result.status === "escalated" && result.reason).toMatch(/planı değiştirmedi/);
  });

  it("kabul + düzeltilmiş plan kartı zincirde ilerletir", async () => {
    const card = await put();
    await itirazaKadar(card);
    dosyalar.set(at("main", ITIRAZ_YOLU(card.id)), itiraz("kabul"));
    dosyalar.set(at("main", PLAN_YOLU(card.id)), "# Plan\nSürüm ileri gider; selector.ts korunur.\n");
    claude.answer = kabulEt("planı düzelttim");

    const result = await tick("planner", options);
    expect(result.status).toBe("accepted");
    const moved = await queue.get(card.id);
    expect(moved?.role).toBe("coder");
    // Plan hash'i yeni sürümü göstermeli.
    expect(moved?.plan?.hash).not.toBe(card.plan?.hash);
  });

  it("gerekçeli ret kartı ilerletir, plan değişmeden", async () => {
    const card = await put();
    await itirazaKadar(card);
    dosyalar.set(at("main", ITIRAZ_YOLU(card.id)), itiraz("ret: ölçüm bunu göstermiyor"));
    claude.answer = kabulEt("katılmıyorum");

    const result = await tick("planner", options);
    expect(result.status).toBe("accepted");
    expect((await queue.get(card.id))?.role).toBe("coder");
  });

  // Sessizlik anlaşma değildir: açık bırakılan itiraz kartı kapıya çıkarır.
  it("açık bırakılan itiraz kartı KİLİT kapısına çıkarır", async () => {
    const card = await put();
    await itirazaKadar(card);
    claude.answer = kabulEt("cevap vermedim");

    const result = await tick("planner", options);
    expect(result.status).toBe("escalated");
    const gated = (await queue.get(card.id)) as Card;
    expect(gated.state).toBe("gate");
    // Kaçış değil kilit: tur tamamlandı, kod yerinde, insan ileri bırakabilir.
    expect(gateKind(gated)).toBe("deadlock");
  });

  it("insana çıkan itiraz kartı kapıya çıkarır", async () => {
    const card = await put();
    await itirazaKadar(card);
    dosyalar.set(at("main", ITIRAZ_YOLU(card.id)), itiraz("insana: bu bir değer kararı"));
    claude.answer = kabulEt("karar insana");

    const result = await tick("planner", options);
    expect(result.status).toBe("escalated");
    expect(result.status === "escalated" && result.reason).toMatch(/insana çıktı/);
    expect(gateKind((await queue.get(card.id)) as Card)).toBe("deadlock");
  });
});

describe("alışveriş — günlük", () => {
  it("itiraz turu ve kapanış günlüğe düşer", async () => {
    const card = await put();
    const logPath = join(root, "olaylar.jsonl");
    const log = new EventLog(logPath, "r1");
    const withLog = { ...options, log };

    await planYaz(card);
    dosyalar.set(at("architect", ITIRAZ_YOLU(card.id)), itiraz("açık"));
    claude.answer = kabulEt("itiraz");
    await tick("architect", withLog);

    dosyalar.set(at("main", ITIRAZ_YOLU(card.id)), itiraz("kabul"));
    dosyalar.set(at("main", PLAN_YOLU(card.id)), "# Plan\nDüzeltildi.\n");
    claude.answer = kabulEt("düzelttim");
    await tick("planner", withLog);

    const { events } = await readEvents(logPath);
    expect(events.find((e) => e.type === "plan.round")).toMatchObject({
      card: card.id, role: "architect", round: 1, blind: true, newObjections: 1, openObjections: 1,
    });
    expect(events.find((e) => e.type === "plan.settled")).toMatchObject({
      card: card.id, outcome: "anlasma", rounds: 1, objections: 1, accepted: 1,
    });
  });
});
