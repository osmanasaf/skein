import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Adapter, InvokeRequest, InvokeResult } from "../adapters/contract.js";
import { knownProviderSet } from "../adapters/factory.js";
import { newCard, type Card } from "../card/card.js";
import { CardQueue } from "../card/queue.js";
import { loadFlow } from "../flow/load.js";
import { snapshot, type TopologySnapshot } from "../flow/snapshot.js";
import { serve, type ServeOptions } from "./serve.js";
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
    reject: coder
    next: done
reject:
  limit: 2
  onExhausted: gate
`;

/** Her çağrıda `accept` yazan ajan taklidi. */
class AcceptingAdapter implements Adapter {
  readonly id: string;
  readonly model = "sahte-1";
  calls = 0;

  constructor(id: string) {
    this.id = id;
  }

  async invoke(req: InvokeRequest): Promise<InvokeResult> {
    this.calls += 1;
    await writeFile(join(req.workdir, VERDICT_FILE), JSON.stringify({ decision: "accept" }));
    return { exitCode: 0, stdout: "", stderr: "", durationMs: 1 };
  }
}

let root: string;
let queue: CardQueue;
let topology: TopologySnapshot;
let claude: AcceptingAdapter;
let codex: AcceptingAdapter;
let base: ServeOptions;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-serve-"));
  await mkdir(join(root, "hub", "flows"), { recursive: true });
  await mkdir(join(root, "hub", "prompts"), { recursive: true });
  await mkdir(join(root, "roles"), { recursive: true });
  await mkdir(join(root, WORKTREE_DIR, "reviewer"), { recursive: true });
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

  claude = new AcceptingAdapter("claude");
  codex = new AcceptingAdapter("codex");
  base = {
    root,
    queue,
    adapters: new Map<string, Adapter>([["claude", claude], ["codex", codex]]),
    headCommit: async () => "abc1234",
    dirtyPaths: async () => [],
    isTracked: async () => false,
    mergeForward: async () => ({ kind: "merged" as const }),
    pollMs: 10,
    watchDir: join(root, ".skein", "queue"),
  };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(title = "iş"): Promise<Card> {
  return queue.add(newCard({ title, task: "retry'a jitter ekle", topology }));
}

describe("serve — uyku", () => {
  it("kuyruk boşken ölmez, uyur", async () => {
    const stop = new AbortController();
    const running = serve(topology, { ...base, signal: stop.signal });

    // Toplu koşu burada çıkardı. Gözcü çıkmamalı: birkaç uyku turu sonra
    // hâlâ koşuyor olmalı.
    await new Promise((r) => setTimeout(r, 60));
    expect(claude.calls).toBe(0);

    stop.abort();
    const summary = await running;

    expect(summary.stopped).toBe("signal");
    expect(summary.naps).toBe(1); // tek bir boşalma; her yoklama turu ayrı sayılmaz
    expect(summary.sweeps).toBeGreaterThan(1);
  });

  it("uykudayken durdurma sinyali hemen döner", async () => {
    const stop = new AbortController();
    const running = serve(topology, { ...base, pollMs: 60_000, signal: stop.signal });

    await new Promise((r) => setTimeout(r, 20));
    const started = Date.now();
    stop.abort();
    await running;

    // Yoklama süresini beklemedi: `fs.watch` değil, iptal uyandırdı.
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("serve — uyanma", () => {
  // Adım 1'in biter kriteri: kart açmak işin başlaması demek.
  it("koşarken açılan kartı ikinci bir komut olmadan işler", async () => {
    const stop = new AbortController();
    const done: string[] = [];
    const running = serve(topology, {
      ...base,
      signal: stop.signal,
      onSweep: (s) => {
        for (const { result } of s.results) {
          if (result.status !== "idle" && result.card.state === "done") done.push(result.card.id);
        }
      },
    });

    await new Promise((r) => setTimeout(r, 30));
    const card = await put();

    const deadline = Date.now() + 3000;
    while (done.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    stop.abort();
    await running;

    expect(done).toEqual([card.id]);
    expect(claude.calls).toBe(1);
    expect(codex.calls).toBe(1);
    expect((await queue.get(card.id))?.state).toBe("done");
  });

  it("işi bitirince tekrar uykuya döner", async () => {
    const stop = new AbortController();
    const running = serve(topology, { ...base, signal: stop.signal });

    await new Promise((r) => setTimeout(r, 30));
    await put();
    await new Promise((r) => setTimeout(r, 300));
    stop.abort();
    const summary = await running;

    // İki boşalma: kart gelmeden önce bir, iş bittikten sonra bir.
    expect(summary.naps).toBe(2);
  });
});

describe("serve — emniyet", () => {
  // `reject.limit` her kartı sonlu kılıyor; bu emniyet o garantiyi delen bir
  // kusur için. Kart hiç bitmezse gözcü sonsuza kadar para harcamamalı.
  it("uykuya hiç uğramadan kaçak döngüye girerse durur", async () => {
    // Her turda yeni kart doğuran bir ajan: kuyruk hiç boşalmaz.
    let spawned = 0;
    claude.invoke = async (req: InvokeRequest): Promise<InvokeResult> => {
      spawned += 1;
      await put(`türeme ${spawned}`);
      await writeFile(join(req.workdir, VERDICT_FILE), JSON.stringify({ decision: "accept" }));
      return { exitCode: 0, stdout: "", stderr: "", durationMs: 1 };
    };
    await put();

    const summary = await serve(topology, { ...base, maxBusySweeps: 5 });

    expect(summary.stopped).toBe("runaway");
    expect(summary.sweeps).toBe(5);
  });
});

describe("serve — durum süreçte tutulmaz", () => {
  // ARCHITECTURE: daemon bir depo değildir. Durdurulup yeniden başlatılan
  // gözcü, yarım kalan işi dizinden okuyup devam edebilmeli.
  it("durdurulup yeniden başlatılınca kaldığı yerden devam eder", async () => {
    const card = await put();

    // Birinci gözcü: yalnızca coder'ın turunu koşacak kadar yaşıyor.
    const first = new AbortController();
    const running = serve(topology, {
      ...base,
      signal: first.signal,
      onSweep: () => first.abort(),
    });
    await running;
    expect((await queue.get(card.id))?.role).toBe("reviewer");

    // İkinci gözcü sıfırdan başlıyor: elinde birinciden hiçbir bellek yok.
    const second = new AbortController();
    const rest = serve(topology, {
      ...base,
      signal: second.signal,
      onSweep: (s) => {
        if (s.results.some((r) => r.result.status !== "idle")) second.abort();
      },
    });
    await rest;

    expect((await queue.get(card.id))?.state).toBe("done");
  });
});
