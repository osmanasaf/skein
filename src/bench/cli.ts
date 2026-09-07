import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ClaudeCliAdapter } from "../adapters/claude.js";
import { AdapterRegistry, type Adapter } from "../adapters/contract.js";
import { EventLog, readEvents } from "../events/log.js";
import { summarize } from "../events/summary.js";
import { loadTask } from "./task.js";
import { produce } from "./produce.js";
import { runHidden } from "./hidden.js";
import { auditLoop } from "./audit-loop.js";

const REPO = resolve(import.meta.dirname, "../..");
const LOG = join(REPO, ".skein/events.jsonl");
const rel = (p: string) => p.slice(REPO.length + 1);

async function report(): Promise<void> {
  const { events, malformed } = await readEvents(LOG);
  if (events.length === 0) {
    console.log("Günlük boş. Önce bir koşu yap: cli.ts <görev-id>");
    return;
  }
  const s = summarize(events);
  console.log(`${events.length} olay, ${s.runIds.length} koşu` +
    (malformed > 0 ? `, ${malformed} BOZUK SATIR` : "") + "\n");
  for (const c of s.cells) {
    const hooks = c.hooks === undefined
      ? "ölçüm yok"
      : !c.hooks.ran
        ? "ÖLÇÜLEMEDİ"
        : `${c.hooks.total - c.hooks.red}/${c.hooks.total} yeşil, ${c.hooks.red} kırmızı`;
    console.log(`  ${c.provider}/${c.model}  ${c.role}`);
    console.log(`    ${hooks}  ·  ${((c.durationMs ?? 0) / 1000).toFixed(1)}s  ·  ` +
      `$${(c.costUsd ?? 0).toFixed(4)}  ·  exit=${c.exitCode ?? "?"}  ·  prompt ${c.promptHash?.slice(0, 12)}…`);
  }
  console.log(`\n  toplam: $${s.totalCostUsd.toFixed(4)}  ·  ${(s.totalDurationMs / 1000).toFixed(1)}s`);
}

async function run(taskId: string, provider: string, model: string, audit: boolean): Promise<void> {
  const task = await loadTask(join(REPO, "bench/tasks", taskId));
  const adapter: Adapter = new AdapterRegistry().register(new ClaudeCliAdapter({ model })).get(provider);

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const cellDir = join(REPO, ".skein/runs", runId, task.id, `${adapter.id}--${adapter.model}`);
  await mkdir(join(REPO, ".skein"), { recursive: true });
  const log = new EventLog(LOG, runId);

  console.log(`görev    : ${task.id} — ${task.title}`);
  console.log(`üretici  : ${adapter.id} / ${adapter.model}`);
  console.log(`hücre    : ${rel(cellDir)}\n`);

  await log.append({ type: "run.started", taskId: task.id });

  console.log("üretim koşuyor…");
  const p = await produce({
    task, adapter, cellDir,
    layers: [{ name: "produce", path: join(REPO, "bench/prompts/produce.md") }],
    timeoutMs: 10 * 60_000,
  });
  await log.append({
    type: "agent.started", cell: rel(cellDir), role: "uretici",
    provider: adapter.id, model: adapter.model, promptHash: p.promptHash,
  });
  const finished = {
    type: "agent.finished" as const, cell: rel(cellDir),
    exitCode: p.invoke.exitCode, durationMs: p.invoke.durationMs,
    ...(p.invoke.usage ? { usage: p.invoke.usage } : {}),
    ...(p.invoke.timedOut ? { timedOut: true } : {}),
  };
  await log.append(finished);

  const u = p.invoke.usage;
  console.log(`  exit=${p.invoke.exitCode} süre=${(p.invoke.durationMs / 1000).toFixed(1)}s` +
    (u?.costUsd !== undefined ? ` maliyet=$${u.costUsd.toFixed(4)}` : ""));
  console.log(`  prompt hash: ${p.promptHash.slice(0, 16)}…`);

  if (p.invoke.exitCode !== 0) {
    console.error(`\nÜretim başarısız (exit ${p.invoke.exitCode}).`);
    console.error(p.invoke.stderr.slice(0, 800) || p.invoke.stdout.slice(0, 800));
    process.exit(1);
  }

  if (audit) {
    console.log("\naudit gate…");
    const outcome = await auditLoop({
      task, adapter, cellDir, artifactDir: p.artifactDir,
      layers: [{ name: "audit", path: join(REPO, "bench/prompts/audit.md") }],
      maxRounds: 4, timeoutMs: 10 * 60_000,
      onRound: async (d, inv) => {
        await log.append({
          type: "audit.round", cell: rel(cellDir), round: d.round, reason: d.reason, accepted: d.accepted,
        });
        if (inv) {
          await log.append({
            type: "agent.finished", cell: `${rel(cellDir)}#audit${d.round}`,
            exitCode: inv.exitCode, durationMs: inv.durationMs,
            ...(inv.usage ? { usage: inv.usage } : {}),
          });
        }
        console.log(`  tur ${d.round}: ${d.reason}${d.accepted ? " → KABUL" : " → red"}`);
      },
    });
    const extra = outcome.invocations.reduce((s2, i) => s2 + (i.usage?.costUsd ?? 0), 0);
    console.log(`  ${outcome.rounds} tur, ${outcome.changedRounds} turda düzeltme yapıldı` +
      `, +$${extra.toFixed(4)}` + (outcome.exhausted ? " (ÜST SINIRA TAKILDI)" : ""));
  }

  console.log("\ngizli testler koşuyor…");
  const h = await runHidden(task, cellDir, REPO);
  await log.append({ type: "hooks.measured", cell: rel(cellDir), ran: h.ran, total: h.hooks.length, red: h.red });

  if (!h.ran) {
    console.error("  ÖLÇÜLEMEDİ — süit hiç koşmadı (artefakt derlenmiyor ya da yok).");
    console.error("  Bu 'sıfır kırmızı' DEĞİLDİR.");
    console.error((h.stderr || h.raw).slice(0, 800));
    process.exit(1);
  }

  console.log(`\n  ${h.hooks.length - h.red.length}/${h.hooks.length} kanca yeşil, ${h.red.length} KIRMIZI\n`);
  for (const hook of h.hooks) console.log(`  ${hook.passed ? "✓" : "✗"} ${hook.title}`);
  console.log(`\ngünlük: ${rel(LOG)}  (özet için: cli.ts report)`);
}

const argv = process.argv.slice(2);
const audit = argv.includes("--audit");
const [cmd, ...rest] = argv.filter((a) => a !== "--audit");
if (cmd === "report") {
  await report();
} else if (cmd) {
  await run(cmd, rest[0] ?? "claude", rest[1] ?? "claude-opus-5", audit);
} else {
  console.error("kullanım: cli.ts <görev-id> [sağlayıcı] [model] [--audit]  |  cli.ts report");
  process.exit(2);
}
