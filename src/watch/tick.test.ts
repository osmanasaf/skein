import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Adapter, InvokeRequest, InvokeResult } from "../adapters/contract.js";
import { newCard, rejectCount, type Card } from "../card/card.js";
import { CardQueue } from "../card/queue.js";
import { knownProviderSet } from "../adapters/factory.js";
import { EventLog, readEvents } from "../events/log.js";
import { loadFlow } from "../flow/load.js";
import { snapshot, type TopologySnapshot } from "../flow/snapshot.js";
import { tick, type TickOptions } from "./tick.js";
import { VERDICT_FILE } from "./verdict.js";
import { WORKTREE_DIR } from "./workspace.js";

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
    syncBack: [coder]
    reject: coder
    next: done
reject:
  limit: 2
  onExhausted: gate
`;

/**
 * Ajanı taklit eden adaptör. `answer` ile o turda ne yazacağını
 * (ya da yazmayacağını) belirlersin.
 */
class FakeAdapter implements Adapter {
  readonly id: string;
  readonly model = "sahte-1";
  readonly calls: InvokeRequest[] = [];
  answer: ((req: InvokeRequest) => Promise<InvokeResult | void>) | null = null;

  constructor(id: string) {
    this.id = id;
  }

  async invoke(req: InvokeRequest): Promise<InvokeResult> {
    this.calls.push(req);
    const custom = await this.answer?.(req);
    return custom ?? { exitCode: 0, stdout: "", stderr: "", durationMs: 5 };
  }
}

/** Verdikt yazan bir cevap kurar. */
function writes(verdict: unknown) {
  return async (req: InvokeRequest): Promise<void> => {
    await writeFile(join(req.workdir, VERDICT_FILE), JSON.stringify(verdict));
  };
}

let root: string;
let queue: CardQueue;
let daily: TopologySnapshot;
let claude: FakeAdapter;
let codex: FakeAdapter;
let options: TickOptions;

beforeEach(async () => {
  // Üretimde tek bir kök var: prompt dosyaları da, worktree'ler de onun
  // altında. Test de öyle kurulur, yoksa sınadığı şey üretimdeki şey olmaz.
  root = await mkdtemp(join(tmpdir(), "skein-tick-"));
  await mkdir(join(root, "hub", "flows"), { recursive: true });
  await mkdir(join(root, "hub", "prompts"), { recursive: true });
  await mkdir(join(root, "roles"), { recursive: true });
  await mkdir(join(root, WORKTREE_DIR, "reviewer"), { recursive: true });

  await writeFile(join(root, "hub", "prompts", "base.md"), "# Anayasa\nKurallar.\n");
  await writeFile(join(root, "roles", "coder.prompt"), "# coder\nKodu yaz.\n");
  await writeFile(join(root, "roles", "reviewer.prompt"), "# reviewer\nKodu denetle.\n");
  await writeFile(join(root, "hub", "flows", "test.yaml"), FLOW);

  queue = new CardQueue(join(root, ".skein"));
  await queue.init();

  const flow = await loadFlow(join(root, "hub", "flows", "test.yaml"), {
    root,
    providers: knownProviderSet(),
  });
  daily = snapshot(flow, root);

  claude = new FakeAdapter("claude");
  codex = new FakeAdapter("codex");
  // Git bu dosyanın konusu değil; gerçek birleştirme git.test.ts'de.
  // Buradaki testler yönlendirmeyi sınıyor, o yüzden git enjekte ediliyor.
  options = {
    root,
    queue,
    adapters: new Map<string, Adapter>([["claude", claude], ["codex", codex]]),
    headCommit: async () => "abc1234",
    dirtyPaths: async () => [],
    isTracked: async () => false,
    mergeForward: async () => ({ kind: "merged" as const }),
  };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(title = "iş"): Promise<Card> {
  return queue.add(newCard({ title, task: "retry'a jitter ekle", topology: daily }));
}

describe("tick — boş kuyruk", () => {
  it("kart yoksa hiçbir şey yapmaz", async () => {
    expect(await tick("coder", options)).toEqual({ status: "idle" });
    expect(claude.calls).toHaveLength(0);
  });
});

describe("tick — kabul", () => {
  it("verdikt accept ise kart ileri gider", async () => {
    await put();
    claude.answer = writes({ decision: "accept", summary: "jitter eklendi" });

    const result = await tick("coder", options);

    expect(result.status).toBe("accepted");
    expect(result.status === "accepted" && result.summary).toBe("jitter eklendi");
    expect((await queue.get((result as { card: Card }).card.id))?.role).toBe("reviewer");
  });

  it("commit kart geçmişine yazılır", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    const result = await tick("coder", options);

    expect((result as { card: Card }).card.history.at(-1)).toMatchObject({
      event: "handoff", from: "coder", to: "reviewer", commit: "abc1234",
    });
  });

  it("zincirin sonunda kart biter", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    codex.answer = writes({ decision: "accept" });

    await tick("coder", options);
    const result = await tick("reviewer", options);

    expect((result as { card: Card }).card.state).toBe("done");
  });

  it("rol kendi workspace'inde koşar", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    codex.answer = writes({ decision: "accept" });

    await tick("coder", options);
    await tick("reviewer", options);

    expect(claude.calls[0]?.workdir).toBe(root);
    expect(codex.calls[0]?.workdir).toBe(join(root, WORKTREE_DIR, "reviewer"));
  });
});

describe("tick — ret", () => {
  it("verdikt reject ise KART geri döner", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    codex.answer = writes({ decision: "reject", reason: "senkron çağrıda RangeError" });

    await tick("coder", options);
    const result = await tick("reviewer", options);

    expect(result.status).toBe("rejected");
    const card = (result as { card: Card }).card;
    expect(card.role).toBe("coder");
    expect(rejectCount(card, "reviewer", "coder")).toBe(1);
  });

  it("ret gerekçesi bir sonraki turda ÜRETİCİYE gider", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    codex.answer = writes({ decision: "reject", reason: "senkron çağrıda RangeError atıyor" });

    await tick("coder", options);
    await tick("reviewer", options);
    await tick("coder", options);

    // Bu, "ret boş dönmez" sözünün mekanik karşılığı.
    const second = claude.calls[1]?.taskText as string;
    expect(second).toContain("Önceki tur reddedildi");
    expect(second).toContain("senkron çağrıda RangeError atıyor");
    expect(second).toContain("abc1234");
  });

  it("zorunlu çıktı görev metninin BAŞINDA da durur", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    await tick("coder", options);

    const text = claude.calls[0]?.taskText as string;
    const first = text.indexOf(VERDICT_FILE);
    const work = text.indexOf("## İş");
    expect(first).toBeGreaterThanOrEqual(0);
    // Sonda kalan talimat, iş bittiğinde unutulan talimattır.
    expect(first).toBeLessThan(work);
  });

  it("ilk turda ret kaydı yoktur", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    await tick("coder", options);
    expect(claude.calls[0]?.taskText).not.toContain("Önceki tur reddedildi");
  });

  it("gerekçesiz reject verdikti geçersizdir — kart kapıya çıkar", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    codex.answer = writes({ decision: "reject" });

    await tick("coder", options);
    const result = await tick("reviewer", options);

    expect(result.status).toBe("escalated");
    expect((result as { reason: string }).reason).toMatch(/ret boş dönmez/);
  });

  it("limit dolunca tur escalated döner", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    codex.answer = writes({ decision: "reject", reason: "olmadı" });

    // limit 2: iki tam tur geçer, üçüncü ret kartı kapıya koyar.
    for (let i = 0; i < 2; i++) {
      await tick("coder", options);
      expect((await tick("reviewer", options)).status).toBe("rejected");
    }
    await tick("coder", options);
    const result = await tick("reviewer", options);

    expect(result.status).toBe("escalated");
    expect((result as { card: Card }).card.state).toBe("gate");
  });
});

describe("tick — devir teslim kodu da taşır", () => {
  it("kabul edilen iş sonraki rolün ağacına birleştirilir", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    const merges: { fromDir: string; toDir: string }[] = [];

    await tick("coder", {
      ...options,
      mergeForward: async (o) => {
        merges.push({ fromDir: o.fromDir, toDir: o.toDir });
        return { kind: "merged" };
      },
    });

    expect(merges).toEqual([
      { fromDir: root, toDir: join(root, WORKTREE_DIR, "reviewer") },
    ]);
  });

  it("zincirin sonunda İLERİ birleştirme yapılmaz", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    codex.answer = writes({ decision: "accept" });
    const forward: string[] = [];

    // syncBack ayrı sayılıyor: reviewer zincirin sonunda ileri taşımaz ama
    // coder'a kopya gönderir.
    const counting = {
      ...options,
      mergeForward: async (o: { message: string }) => {
        if (!o.message.includes("syncBack")) forward.push(o.message);
        return { kind: "merged" as const };
      },
    };
    await tick("coder", counting);
    await tick("reviewer", counting);

    expect(forward).toHaveLength(1);
    expect(forward[0]).toContain("coder → reviewer");
  });

  it("çakışma kartı kapıya çıkarır — kimse tahmin etmez", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });

    const result = await tick("coder", {
      ...options,
      mergeForward: async () => ({ kind: "conflict", paths: ["src/retry.ts"] }),
    });

    expect(result.status).toBe("escalated");
    expect((result as { reason: string }).reason).toContain("src/retry.ts");
    expect((result as { reason: string }).reason).toMatch(/çakış/);
  });

  it("birleştirme başarısızsa kart ileri GİTMEZ", async () => {
    const card = await put();
    claude.answer = writes({ decision: "accept" });

    await tick("coder", {
      ...options,
      mergeForward: async () => ({ kind: "blocked", reason: "hedef ağaç kirli" }),
    });

    expect((await queue.get(card.id))?.role).toBe("coder");
  });

  it("ret yolunda birleştirme yapılmaz — reddedilen iş ilerlemez", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    codex.answer = writes({ decision: "reject", reason: "olmadı" });
    let calls = 0;

    const counting = { ...options, mergeForward: async () => { calls += 1; return { kind: "merged" as const }; } };
    await tick("coder", counting);
    await tick("reviewer", counting);

    expect(calls).toBe(1); // yalnızca coder'ın kabulü
  });
});

describe("tick — syncBack", () => {
  it("kabul edilen iş listelenen rolün ağacına kopyalanır", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    codex.answer = writes({ decision: "accept" });
    const merges: string[] = [];

    const tracking = {
      ...options,
      mergeForward: async (o: { fromDir: string; toDir: string; message: string }) => {
        merges.push(o.message);
        return { kind: "merged" as const };
      },
    };
    await tick("coder", tracking);
    await tick("reviewer", tracking);

    // coder→reviewer ileri taşıma, sonra reviewer'ın syncBack'i coder'a.
    expect(merges).toHaveLength(2);
    expect(merges[1]).toContain("syncBack reviewer → coder");
  });

  it("kart syncBack ile hareket etmez", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    codex.answer = writes({ decision: "accept" });

    await tick("coder", options);
    const result = await tick("reviewer", options);

    // syncBack coder'a gitti ama kart bitti, coder'a dönmedi.
    expect((result as { card: Card }).card.state).toBe("done");
    expect(await queue.depth("coder")).toBe(0);
  });

  it("syncBack çakışması kartı durdurmaz, uyarı olur", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    codex.answer = writes({ decision: "accept" });

    await tick("coder", options);
    const result = await tick("reviewer", {
      ...options,
      mergeForward: async (o) =>
        o.message.includes("syncBack")
          ? { kind: "conflict", paths: ["src/retry.ts"] }
          : { kind: "merged" },
    });

    // Kart yerine ulaştı; kopyanın başarısızlığı onu geri alamaz.
    expect(result.status).toBe("accepted");
    expect((result as { card: Card }).card.state).toBe("done");
    // Ama sessiz kalmadı.
    expect((result as { warnings?: string[] }).warnings?.[0]).toContain("çakıştı");
  });

  it("syncBack listesi boşsa hiçbir şey yapılmaz", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    let calls = 0;

    await tick("coder", {
      ...options,
      mergeForward: async () => { calls += 1; return { kind: "merged" as const }; },
    });

    // coder'ın syncBack'i yok; yalnızca ileri taşıma.
    expect(calls).toBe(1);
  });
});

describe("tick — işlenmemiş iş devredilemez", () => {
  // Gerçek koşuda bulundu: coder dosyaları yazdı, commit atmadı, yine de
  // "accept" dedi. Devir teslim iskelet commit'ini kaydediyordu.
  it("kirli ağaçla kabul kartı kapıya çıkarır", async () => {
    const card = await put();
    claude.answer = writes({ decision: "accept" });

    const result = await tick("coder", {
      ...options,
      dirtyPaths: async () => ["src/retry.ts", "src/retry.test.ts"],
    });

    expect(result.status).toBe("escalated");
    expect((result as { reason: string }).reason).toContain("src/retry.ts");
    expect((result as { reason: string }).reason).toMatch(/devredilemez/);
    expect((await queue.get(card.id))?.state).toBe("gate");
  });

  it("kirli ağaç kontrolü orkestratörün kendi dosyasını saymaz", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    let ignored: string[] = [];

    await tick("coder", {
      ...options,
      dirtyPaths: async (_dir, ignore) => { ignored = ignore; return []; },
    });

    expect(ignored).toContain(VERDICT_FILE);
  });
});

describe("tick — orkestratörün izi ürüne giremez", () => {
  // Gerçek koşuda denetçi ajan `.skein-verdict.json`'ı zorla ekleyip
  // commit'ledi; syncBack onu ana ağaca taşıdı. `.gitignore` yeterli değil.
  it("verdikt dosyası izleniyorsa kart kapıya çıkar", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });

    const result = await tick("coder", { ...options, isTracked: async () => true });

    expect(result.status).toBe("escalated");
    expect((result as { reason: string }).reason).toContain(VERDICT_FILE);
    expect((result as { reason: string }).reason).toContain("git rm --cached");
  });

  it("ret yolunda da yakalanır", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    codex.answer = writes({ decision: "reject", reason: "olmadı" });

    await tick("coder", options);
    const result = await tick("reviewer", { ...options, isTracked: async () => true });

    expect(result.status).toBe("escalated");
  });

  it("izlenmiyorsa hiçbir şey olmaz", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    expect((await tick("coder", options)).status).toBe("accepted");
  });
});

describe("tick — sessiz başarısızlık yasağı", () => {
  // Deneyde en pahalıya mal olan hata buydu: hiçbir şey üretmemiş bir
  // koşuyu başarılı saymak.
  it("verdikt yazmayan ajan KABUL sayılmaz", async () => {
    await put();
    claude.answer = null; // çıkış kodu 0, ama dosya yok

    const result = await tick("coder", options);

    expect(result.status).toBe("escalated");
    expect((result as { reason: string }).reason).toMatch(/verdikt yazmadı/);
    expect((result as { card: Card }).card.state).toBe("gate");
  });

  it("önceki turdan kalan verdikt bu turun cevabı sayılmaz", async () => {
    await put();
    await writeFile(join(root, VERDICT_FILE), JSON.stringify({ decision: "accept" }));
    claude.answer = null;

    expect((await tick("coder", options)).status).toBe("escalated");
  });

  it("sıfırdan farklı çıkış kodu kartı kapıya çıkarır", async () => {
    await put();
    claude.answer = async () => ({ exitCode: 2, stdout: "", stderr: "unknown option --foo", durationMs: 3 });

    const result = await tick("coder", options);
    expect(result.status).toBe("escalated");
    expect((result as { reason: string }).reason).toContain("unknown option --foo");
  });

  it("zaman aşımı kartı kapıya çıkarır", async () => {
    await put();
    claude.answer = async () => ({ exitCode: 124, stdout: "", stderr: "", durationMs: 1, timedOut: true });

    expect((await tick("coder", options)).status).toBe("escalated");
    expect(((await queue.list())[0] as Card).history.at(-1)).toMatchObject({ event: "gate" });
  });

  it("bozuk verdikt JSON'u kartı kapıya çıkarır", async () => {
    await put();
    claude.answer = async (req) => {
      await writeFile(join(req.workdir, VERDICT_FILE), "{ bu json değil");
    };

    const result = await tick("coder", options);
    expect((result as { reason: string }).reason).toMatch(/geçerli JSON değil/);
  });

  // Kod artık devir teslimde taşındığı için eksik worktree BİR ADIM ÖNCE
  // yakalanıyor: kart coder'dan hiç çıkmadan. Hata, iş ilerledikten sonra
  // değil ilerlemeden önce görünüyor.
  it("olmayan worktree kartı kapıya çıkarır ve komutu söyler", async () => {
    await rm(join(root, WORKTREE_DIR, "reviewer"), { recursive: true, force: true });
    const card = await put();
    claude.answer = writes({ decision: "accept" });

    const result = await tick("coder", options);

    expect(result.status).toBe("escalated");
    expect((result as { reason: string }).reason).toContain("git worktree add");
    expect((await queue.get(card.id))?.role).toBe("coder");
  });
});

describe("tick — olay günlüğü", () => {
  it("başlangıç ve bitiş kaydedilir, prompt hash'iyle", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    const logPath = join(root, "olaylar.jsonl");

    await tick("coder", { ...options, log: new EventLog(logPath, "kosu-1") });

    const { events } = await readEvents(logPath);
    expect(events.map((e) => e.type)).toEqual(["agent.started", "agent.finished", "card.settled"]);
    const started = events[0] as { promptHash: string; provider: string; model: string; role: string };
    expect(started.role).toBe("coder");
    expect(started.provider).toBe("claude");
    expect(started.model).toBe("sahte-1");
    expect(started.promptHash).toMatch(/^[0-9a-f]{64}$/);
  });

  // Adım 2: `agent.started` ile `agent.finished` arasında dakikalar geçiyor
  // ve günlükten "şu an ne oluyor" okunamıyordu.
  it("ajanın adımları sırasıyla günlüğe düşer", async () => {
    await put();
    claude.answer = async (req) => {
      req.onStep?.({ kind: "text", detail: "önce okuyacağım" });
      req.onStep?.({ kind: "tool", name: "Read", detail: "/repo/retry.ts" });
      req.onStep?.({ kind: "tool", name: "Edit", detail: "/repo/retry.ts" });
      await writeFile(join(req.workdir, VERDICT_FILE), JSON.stringify({ decision: "accept" }));
    };
    const logPath = join(root, "olaylar.jsonl");

    await tick("coder", { ...options, log: new EventLog(logPath, "kosu-1") });

    const { events } = await readEvents(logPath);
    const steps = events.filter((e) => e.type === "agent.step") as unknown as Record<string, unknown>[];
    expect(steps.map((s) => s["seq"])).toEqual([1, 2, 3]);
    expect(steps.map((s) => s["name"])).toEqual([undefined, "Read", "Edit"]);
    expect(steps[0]).toMatchObject({ cell: expect.stringContaining(":coder"), role: "coder", kind: "text" });
    // Adımlar başlangıç ile bitiş ARASINDA: günlüğü okuyan, turun neresinde
    // olunduğunu sıradan anlayabilmeli.
    const types = events.map((e) => e.type);
    expect(types.indexOf("agent.step")).toBeGreaterThan(types.indexOf("agent.started"));
    expect(types.lastIndexOf("agent.step")).toBeLessThan(types.indexOf("agent.finished"));
  });

  // Adımlar gözlem, durum değil: kaybolmaları turu bozmamalı. (Kartın
  // nereye gittiğini söyleyen `card.settled` için aynı şey geçerli DEĞİL —
  // o yazılamıyorsa tur gürültüyle patlamalı.)
  it("adım yazılamasa da tur tamamlanır", async () => {
    await put();
    claude.answer = async (req) => {
      req.onStep?.({ kind: "tool", name: "Read" });
      req.onStep?.({ kind: "tool", name: "Edit" });
      await writeFile(join(req.workdir, VERDICT_FILE), JSON.stringify({ decision: "accept" }));
    };
    const logPath = join(root, "olaylar.jsonl");
    class AdimiYazamayanLog extends EventLog {
      override async append(event: Parameters<EventLog["append"]>[0]): Promise<void> {
        if (event.type === "agent.step") throw new Error("disk dolu");
        return super.append(event);
      }
    }

    const result = await tick("coder", { ...options, log: new AdimiYazamayanLog(logPath, "kosu-1") });

    expect(result.status).toBe("accepted");
    // Turun kaydı yine de tam: sonuç olayı yazıldı.
    const { events } = await readEvents(logPath);
    expect(events.map((e) => e.type)).toEqual(["agent.started", "agent.finished", "card.settled"]);
  });

  it("aynı rolün promptu turlar arasında aynı hash'i taşır", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    codex.answer = writes({ decision: "reject", reason: "olmadı" });
    const logPath = join(root, "olaylar.jsonl");
    const log = new EventLog(logPath, "kosu-1");

    await tick("coder", { ...options, log });
    await tick("reviewer", { ...options, log });
    await tick("coder", { ...options, log });

    const { events } = await readEvents(logPath);
    const coderHashes = events
      .filter((e): e is typeof e & { role: string; promptHash: string } => e.type === "agent.started")
      .filter((e) => e.role === "coder")
      .map((e) => e.promptHash);

    // Görev metni değişti (ret kaydı eklendi) ama ROL PROMPTU değişmedi.
    expect(coderHashes).toHaveLength(2);
    expect(coderHashes[0]).toBe(coderHashes[1]);
  });
});

describe("tick — sonuç günlüğe yazılır", () => {
  let logPath: string;
  let logged: TickOptions;
  beforeEach(() => {
    logPath = join(root, "olaylar.jsonl");
    logged = { ...options, log: new EventLog(logPath, "kosu-1") };
  });
  const settled = async (): Promise<Record<string, unknown>[]> =>
    (await readEvents(logPath)).events.filter((e) => e.type === "card.settled") as unknown as Record<string, unknown>[];

  it("kabul: kart id, rol, sonuç, durum ve özet", async () => {
    const card = await put();
    claude.answer = writes({ decision: "accept", summary: "jitter eklendi" });

    await tick("coder", logged);

    expect(await settled()).toEqual([
      expect.objectContaining({
        cell: `${card.id}:coder`, card: card.id, role: "coder",
        outcome: "accepted", state: "queued", summary: "jitter eklendi",
      }),
    ]);
  });

  it("ret: gerekçe kaydedilir", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    codex.answer = writes({ decision: "reject", reason: "test yok" });

    await tick("coder", logged);
    await tick("reviewer", logged);

    expect((await settled())[1]).toMatchObject({ role: "reviewer", outcome: "rejected", reason: "test yok" });
  });

  it("insan kapısı: gerekçe ve gate durumu kaydedilir", async () => {
    await put();
    claude.answer = null;

    await tick("coder", logged);

    const [event] = await settled();
    expect(event).toMatchObject({ outcome: "escalated", state: "gate" });
    expect(event?.["reason"]).toMatch(/verdikt yazmadı/);
  });

  it("adaptör yoksa da kapı sonucu kaydedilir", async () => {
    await put();

    await tick("coder", { ...logged, adapters: new Map() });

    expect(await settled()).toEqual([expect.objectContaining({ outcome: "escalated", role: "coder" })]);
  });

  it("syncBack uyarıları kaydedilir", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    codex.answer = writes({ decision: "accept" });

    await tick("coder", logged);
    await tick("reviewer", {
      ...logged,
      mergeForward: async (o) =>
        o.message.includes("syncBack") ? { kind: "conflict", paths: ["src/retry.ts"] } : { kind: "merged" },
    });

    const event = (await settled())[1];
    expect(event).toMatchObject({ outcome: "accepted", state: "done" });
    expect((event?.["warnings"] as string[])[0]).toContain("çakıştı");
  });

  it("boş kuyruk günlüğe hiçbir şey yazmaz", async () => {
    await tick("coder", logged);
    expect(await settled()).toEqual([]);
  });
});

describe("tick — prompt derleme", () => {
  it("anayasa katmanları rol promptundan önce gelir", async () => {
    await put();
    claude.answer = writes({ decision: "accept" });
    await tick("coder", options);

    const text = await readFile(claude.calls[0]?.promptFile as string, "utf8");
    const anayasa = text.indexOf('name="anayasa:1"');
    const rol = text.indexOf('name="rol:coder"');
    expect(anayasa).toBeGreaterThanOrEqual(0);
    expect(rol).toBeGreaterThan(anayasa);
  });

  it("görev metni prompt dosyasına GİRMEZ — hash görevden bağımsız kalmalı", async () => {
    await put("Jitter ekle");
    claude.answer = writes({ decision: "accept" });
    await tick("coder", options);

    const text = await readFile(claude.calls[0]?.promptFile as string, "utf8");
    expect(text).not.toContain("Jitter ekle");
    expect(claude.calls[0]?.taskText).toContain("Jitter ekle");
  });
});
