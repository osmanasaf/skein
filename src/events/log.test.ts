import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, appendFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventLog, readEvents, EVENT_SCHEMA } from "./log.js";

let root: string;
let path: string;
const at = () => new Date("2026-01-02T03:04:05.000Z");

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-log-"));
  path = join(root, "events.jsonl");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const log = (runId = "r1") => new EventLog(path, runId, at);

const AGENT_STARTED = {
  type: "agent.started", cell: "c1", role: "uretici",
  provider: "claude", model: "claude-opus-5", promptHash: "a".repeat(64),
} as const;

describe("EventLog", () => {
  it("her kaydı şema sürümü, zaman ve runId ile damgalar", async () => {
    await log().append({ type: "run.started", taskId: "t1" });
    const { events } = await readEvents(path);
    expect(events[0]).toMatchObject({
      v: EVENT_SCHEMA, at: "2026-01-02T03:04:05.000Z", runId: "r1", type: "run.started", taskId: "t1",
    });
  });

  it("satır başına bir kayıt yazar — ekleme, üzerine yazma değil", async () => {
    const l = log();
    await l.append({ type: "run.started", taskId: "t1" });
    await l.append(AGENT_STARTED);
    expect((await readFile(path, "utf8")).trimEnd().split("\n")).toHaveLength(2);
  });

  it("var olan günlüğe eklemeye devam eder", async () => {
    await log().append({ type: "run.started", taskId: "t1" });
    await new EventLog(path, "r2", at).append({ type: "run.started", taskId: "t2" });
    const { events } = await readEvents(path);
    expect(events.map((e) => e.runId)).toEqual(["r1", "r2"]);
  });

  it("ölçüm kaydında kanca sonucunu taşır", async () => {
    await log().append({ type: "hooks.measured", cell: "c1", ran: true, total: 9, red: ["x", "y"] });
    const { events } = await readEvents(path);
    expect(events[0]).toMatchObject({ ran: true, total: 9, red: ["x", "y"] });
  });

  it("usage ve timedOut opsiyonel alanlarını korur", async () => {
    await log().append({
      type: "agent.finished", cell: "c1", exitCode: 0, durationMs: 1200,
      timedOut: false, usage: { inputTokens: 10, outputTokens: 4, costUsd: 0.25 },
    });
    const { events } = await readEvents(path);
    expect(events[0]).toMatchObject({ durationMs: 1200, usage: { costUsd: 0.25 } });
  });

  // Ölçüm yalnızca bu günlükten geliyor: alanı eksik bir kayıt, analiz
  // anında fark edilen bir çöp satır olmaktan kötüdür — yazarken patlamalı.
  it("bilinmeyen olay tipini yazmayı reddeder", async () => {
    await expect(log().append({ type: "uydurma" } as never)).rejects.toThrow(/bilinmeyen|uydurma/i);
  });

  it("zorunlu alanı eksik kaydı yazmayı reddeder", async () => {
    await expect(log().append({ ...AGENT_STARTED, model: "" } as never)).rejects.toThrow(/model/);
  });

  it("sayısal alan sonlu değilse reddeder", async () => {
    await expect(
      log().append({ type: "agent.finished", cell: "c1", exitCode: 0, durationMs: NaN } as never),
    ).rejects.toThrow(/durationMs/);
  });

  it("reddedilen kayıt dosyaya hiç yazılmaz", async () => {
    await log().append({ type: "run.started", taskId: "t1" });
    await expect(log().append({ type: "uydurma" } as never)).rejects.toThrow();
    expect((await readEvents(path)).events).toHaveLength(1);
  });
});

describe("readEvents", () => {
  it("olmayan dosyada boş sonuç döner", async () => {
    expect(await readEvents(join(root, "yok.jsonl"))).toEqual({ events: [], malformed: 0 });
  });

  // Çökme anında yarım kalmış son satır, tüm koşunun ölçümünü kaybettirmemeli.
  it("bozuk satırı atlar, geri kalanı kurtarır ve sayar", async () => {
    await log().append({ type: "run.started", taskId: "t1" });
    await appendFile(path, '{"v":1,"type":"agent.st\n');
    await log().append({ type: "run.started", taskId: "t2" });
    const { events, malformed } = await readEvents(path);
    expect(events).toHaveLength(2);
    expect(malformed).toBe(1);
  });

  it("yarım kalmış son satırı sayar ama çökmez", async () => {
    await log().append({ type: "run.started", taskId: "t1" });
    await appendFile(path, '{"v":1,"runId":"r');
    const { events, malformed } = await readEvents(path);
    expect(events).toHaveLength(1);
    expect(malformed).toBe(1);
  });

  it("boş satırları bozuk saymaz", async () => {
    await log().append({ type: "run.started", taskId: "t1" });
    await appendFile(path, "\n\n");
    expect((await readEvents(path)).malformed).toBe(0);
  });
});
