import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Adapter, InvokeRequest, InvokeResult } from "../adapters/contract.js";
import { knownProviderSet } from "../adapters/factory.js";
import { newCard } from "../card/card.js";
import { CardQueue } from "../card/queue.js";
import { loadFlow } from "../flow/load.js";
import { snapshot, type TopologySnapshot } from "../flow/snapshot.js";
import { runUntilIdle, sweep } from "./loop.js";
import { WORKTREE_DIR } from "./workspace.js";
import type { TickOptions } from "./tick.js";

const FLOW = `
name: test
constitution:
  - ../prompts/base.md
roles:
  - id: coder
    provider: claude
    workspace: main
    prompt: ../../roles/coder.prompt
    next: done
`;

class QuietAdapter implements Adapter {
  readonly id = "claude";
  readonly model = "sahte-1";
  calls = 0;
  async invoke(_req: InvokeRequest): Promise<InvokeResult> {
    this.calls += 1;
    return { exitCode: 0, stdout: "", stderr: "", durationMs: 1 };
  }
}

let root: string;
let queue: CardQueue;
let topology: TopologySnapshot;
let options: TickOptions;
let adapter: QuietAdapter;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-loop-"));
  await mkdir(join(root, "hub", "flows"), { recursive: true });
  await mkdir(join(root, "hub", "prompts"), { recursive: true });
  await mkdir(join(root, "roles"), { recursive: true });
  await mkdir(join(root, WORKTREE_DIR), { recursive: true });
  await writeFile(join(root, "hub", "prompts", "base.md"), "# Anayasa\n");
  await writeFile(join(root, "roles", "coder.prompt"), "# coder\n");
  await writeFile(join(root, "hub", "flows", "test.yaml"), FLOW);

  queue = new CardQueue(join(root, ".skein"));
  await queue.init();
  const flow = await loadFlow(join(root, "hub", "flows", "test.yaml"), {
    root,
    providers: knownProviderSet(),
  });
  topology = snapshot(flow, root);
  adapter = new QuietAdapter();
  options = {
    root,
    queue,
    adapters: new Map<string, Adapter>([["claude", adapter]]),
    headCommit: async () => "abc1234",
    dirtyPaths: async () => [],
    isTracked: async () => false,
    mergeForward: async () => ({ kind: "merged" as const }),
  };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Kuyrukta bir kart bırakır ve onu ALINAMAZ yapar. */
async function blockedCards(): Promise<string> {
  const card = await queue.add(newCard({ title: "iş", task: "bir şey", topology }));
  // Hedef adı bir dizin: `rename` oraya taşıyamaz.
  await mkdir(join(root, ".skein", "active", "coder", `${card.id}.json`), { recursive: true });
  return card.id;
}

/**
 * Engel HAREKET SAYILMAZ.
 *
 * `moved` döngüyü besliyor: `runUntilIdle` `moved` olduğu sürece geçiş
 * yapıyor. Engelli tur "hareket" sayılsaydı — ki `status !== "idle"`
 * testi onu sayardı — alınamayan tek bir dosya gözcüyü `maxSweeps`'e
 * kadar boşa döndüren bir çarka çevirirdi. Kartın ilerlemediği bir turda
 * döngünün kendini beslemesi, kusuru sessizlikten gürültüye çevirmek
 * olurdu; teşhis `report()` ile yine basılıyor.
 */
describe("sweep — kuyruk engeli", () => {
  it("engelli tur hareket saymıyor", async () => {
    await blockedCards();

    const s = await sweep(topology, options);

    expect(s.results.map((r) => r.result.status)).toEqual(["engelli"]);
    expect(s.moved).toBe(false);
  });

  it("runUntilIdle engelde boşa dönmüyor", async () => {
    await blockedCards();

    const sweeps = await runUntilIdle(topology, { ...options, maxSweeps: 20 });

    // Tek geçişte duruyor: 20'ye kadar dönseydi `maxSweeps` emniyetine
    // yapışır ve her geçişte kuyruğu yeniden tarardı.
    expect(sweeps).toHaveLength(1);
    expect(adapter.calls).toBe(0);
  });

  it("boş kuyruk da hareket saymıyor", async () => {
    const s = await sweep(topology, options);
    expect(s.results.map((r) => r.result.status)).toEqual(["idle"]);
    expect(s.moved).toBe(false);
  });
});
