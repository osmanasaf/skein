import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Adapter, InvokeRequest, InvokeResult } from "../adapters/contract.js";
import { knownProviderSet } from "../adapters/factory.js";
import { newCard, type Card } from "../card/card.js";
import { CardQueue } from "../card/queue.js";
import { EventLog, readEvents } from "../events/log.js";
import { loadFlow } from "../flow/load.js";
import { isPlanner, planPathFor, roleOf, snapshot, type TopologySnapshot } from "../flow/snapshot.js";
import { buildTaskText } from "./task-text.js";
import { tick, type TickOptions } from "./tick.js";
import { VERDICT_FILE } from "./verdict.js";
import { WORKTREE_DIR } from "./workspace.js";

const FLOW = `
name: plan-test
constitution:
  - ../prompts/base.md
roles:
  - id: planner
    provider: claude
    workspace: main
    prompt: ../../roles/planner.prompt
    next: coder
  - id: coder
    provider: claude
    workspace: coder
    prompt: ../../roles/coder.prompt
    reject: planner
    next: done
planlama:
  katilimcilar: [planner]
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
/** Plan dosyası "diskte" var mı — tick'e enjekte ediliyor. */
let planlar: Map<string, string>;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-plan-"));
  await mkdir(join(root, "hub", "flows"), { recursive: true });
  await mkdir(join(root, "hub", "prompts"), { recursive: true });
  await mkdir(join(root, "roles"), { recursive: true });
  await mkdir(join(root, WORKTREE_DIR, "coder"), { recursive: true });
  await writeFile(join(root, "hub", "prompts", "base.md"), "# Anayasa\n");
  await writeFile(join(root, "roles", "planner.prompt"), "# planner\nPlanı yaz.\n");
  await writeFile(join(root, "roles", "coder.prompt"), "# coder\nKodu yaz.\n");
  await writeFile(join(root, "hub", "flows", "plan-test.yaml"), FLOW);

  queue = new CardQueue(join(root, ".skein"));
  await queue.init();
  const flow = await loadFlow(join(root, "hub", "flows", "plan-test.yaml"), {
    root, providers: knownProviderSet(),
  });
  topology = snapshot(flow, root);

  claude = new FakeAdapter();
  planlar = new Map();
  options = {
    root,
    queue,
    adapters: new Map<string, Adapter>([["claude", claude]]),
    headCommit: async () => "abc1234",
    dirtyPaths: async () => [],
    isTracked: async () => false,
    mergeForward: async () => ({ kind: "merged" as const }),
    readPlan: async (path) => {
      const text = planlar.get(path);
      if (text === undefined) throw new Error("ENOENT");
      return text;
    },
  };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const put = async (): Promise<Card> =>
  queue.add(newCard({ title: "iş", task: "undo ekle", topology }));

const writes = (verdict: unknown) => async (req: InvokeRequest): Promise<void> => {
  await writeFile(join(req.workdir, VERDICT_FILE), JSON.stringify(verdict));
};

describe("topoloji — plan politikası donuyor", () => {
  it("anlık görüntü plan politikasını taşır", () => {
    expect(topology.plan).toEqual({
      katilimcilar: ["planner"], plan: "docs/plan/{kart}.md",
      itiraz: "docs/plan/{kart}.itiraz.md", tur: 1,
    });
  });

  // `{kart}` yerine kart kimliği: aynı akıştan geçen iki kart aynı dosyayı
  // ezmemeli.
  it("yol kart kimliğiyle çözülür", () => {
    expect(planPathFor(topology, "c-123")).toBe("docs/plan/c-123.md");
    expect(isPlanner(topology, "planner")).toBe(true);
    expect(isPlanner(topology, "coder")).toBe(false);
  });
});

describe("iş metni", () => {
  it("planı yazan role zorunlu çıktıyı söyler", async () => {
    const card = await put();
    const text = buildTaskText(card, roleOf(topology, "planner")!);
    expect(text).toContain("## Planı yaz");
    expect(text).toContain(`docs/plan/${card.id}.md`);
    expect(text).toContain("commit");
    // İş metninin BAŞINDA: sondaki talimat unutulan talimattır.
    expect(text.indexOf("## Planı yaz")).toBeLessThan(text.indexOf("## Cevabını nasıl vereceksin"));
  });

  it("sonraki role planı okumasını söyler", async () => {
    const card = await put();
    const text = buildTaskText(card, roleOf(topology, "coder")!);
    expect(text).toContain("## Plan");
    expect(text).not.toContain("## Planı yaz");
    expect(text).toContain(`docs/plan/${card.id}.md`);
    expect(text).toContain("Önce onu oku");
  });

  it("plan dondurulmuşsa sürümünü de söyler", async () => {
    const card = await put();
    const donmus: Card = { ...card, plan: { path: "docs/plan/x.md", hash: "abcdef0123456789" } };
    const text = buildTaskText(donmus, roleOf(topology, "coder")!);
    expect(text).toContain("abcdef012345");
  });

  it("planlama tanımlanmamış akışta plan bölümü yok", async () => {
    const plansiz: TopologySnapshot = { ...topology };
    delete (plansiz as { plan?: unknown }).plan;
    const card = { ...(await put()), topology: plansiz };
    const text = buildTaskText(card, roleOf(plansiz, "planner")!);
    expect(text).not.toContain("## Plan");
  });
});

describe("tick — plan kapısı", () => {
  // Prompt bir talimattır, kapı değil. "Belge üreten rolün çıktısı
  // kayboluyor" kusuru bir kez yaşandı; bu onun makine karşılığı.
  it("plan yazılmadan kabul devredemez, kart insana çıkar", async () => {
    const card = await put();
    claude.answer = writes({ decision: "accept", summary: "plan hazır" });

    const result = await tick("planner", options);

    expect(result.status).toBe("escalated");
    expect(result.status === "escalated" && result.reason).toMatch(/plan dosyası yok/);
    expect((await queue.get(card.id))?.role).toBe("planner");
  });

  it("boş plan dosyası da kabul edilmez", async () => {
    const card = await put();
    planlar.set(join(root, `docs/plan/${card.id}.md`), "   \n");
    claude.answer = writes({ decision: "accept" });

    const result = await tick("planner", options);
    expect(result.status).toBe("escalated");
    expect(result.status === "escalated" && result.reason).toMatch(/boş bir plan/);
  });

  it("plan varsa kart ilerler ve plan karta donar", async () => {
    const card = await put();
    planlar.set(join(root, `docs/plan/${card.id}.md`), "# Plan\nselector.ts sürüme bakıyor.\n");
    claude.answer = writes({ decision: "accept", summary: "plan yazıldı" });

    const result = await tick("planner", options);

    expect(result.status).toBe("accepted");
    const moved = await queue.get(card.id);
    expect(moved?.role).toBe("coder");
    expect(moved?.plan?.path).toBe(`docs/plan/${card.id}.md`);
    // Hash içerikten: dosya sonradan düzenlense bile o turdaki hâli bilinsin.
    expect(moved?.plan?.hash).toHaveLength(64);
  });

  it("planı yazmayan rol için kapı işlemez", async () => {
    const card = await put();
    planlar.set(join(root, `docs/plan/${card.id}.md`), "# Plan\n");
    claude.answer = writes({ decision: "accept" });
    await tick("planner", options);

    // coder'ın planı YAZMASI beklenmiyor; kendi turunda plan aranmaz.
    claude.answer = writes({ decision: "accept" });
    const result = await tick("coder", options);
    expect(result.status).toBe("accepted");
    expect((await queue.get(card.id))?.state).toBe("done");
  });

  it("plan günlüğe düşer", async () => {
    const card = await put();
    planlar.set(join(root, `docs/plan/${card.id}.md`), "# Plan\n");
    claude.answer = writes({ decision: "accept" });

    const logPath = join(root, "olaylar.jsonl");
    await tick("planner", { ...options, log: new EventLog(logPath, "r1") });

    const { events } = await readEvents(logPath);
    const settled = events.find((e) => e.type === "plan.settled");
    expect(settled).toMatchObject({
      card: card.id, role: "planner", outcome: "anlasma", rounds: 0, objections: 0,
    });
  });
});
