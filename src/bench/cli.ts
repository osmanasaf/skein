import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ClaudeCliAdapter } from "../adapters/claude.js";
import { AdapterRegistry, type Adapter } from "../adapters/contract.js";
import { EventLog, readEvents } from "../events/log.js";
import { summarize } from "../events/summary.js";
import { loadTask } from "./task.js";
import { produce } from "./produce.js";
import { runHidden } from "./hidden.js";
import { auditLoop } from "./audit-loop.js";
import { runMatrix, diagnose } from "./matrix.js";
import { adapterFor } from "../adapters/factory.js";

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
    const who = c.role === "denetci"
      ? `${c.producer} üretti → ${c.model} inceledi  ${c.crossed ? "ÇAPRAZ" : "aynı"}`
      : `${c.model ?? c.provider ?? "?"}  ${c.role ?? ""}`;
    console.log(`  ${who}`);
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
    console.error(`  ÖLÇÜLEMEDİ — ${diagnose(p.entryWritten, p.filesWritten, task.entry)}`);
    console.error("  Bu 'sıfır kırmızı' DEĞİLDİR.");
    console.error((h.stderr || h.raw).slice(0, 600));
    process.exit(1);
  }

  console.log(`\n  ${h.hooks.length - h.red.length}/${h.hooks.length} kanca yeşil, ${h.red.length} KIRMIZI\n`);
  for (const hook of h.hooks) console.log(`  ${hook.passed ? "✓" : "✗"} ${hook.title}`);
  console.log(`\ngünlük: ${rel(LOG)}  (özet için: cli.ts report)`);
}

/**
 * Bir sağlayıcı CLI'ının gerçekten çağrılabildiğini doğrular.
 *
 * Codex adaptörünün bayrakları, codex'in KURULU OLMADIĞI bir makinede
 * yazıldı. CONTRACT.md "bayrakları doğrulayarak yaz" diyor; bu komut o
 * doğrulamayı senin makinene taşıyor.
 */
async function doctor(spec: string): Promise<void> {
  const adapter = adapterFor(spec);
  const dir = join(REPO, ".skein/doctor");
  await mkdir(dir, { recursive: true });
  const promptFile = join(dir, "prompt.md");
  await writeFile(promptFile, "Sen kısa cevap veren bir asistansın.\n");

  const req = { workdir: dir, promptFile, taskText: "2+2 kaç? Sadece sayıyı yaz.", timeoutMs: 120_000 };
  const bin = (adapter as { bin?: string }).bin ?? adapter.id;

  // CLI sürümü ve desteklenen bayraklar: uzaktan teşhisin can damarı.
  // Sürümler arasında bayrak adları ve girdi biçimi değişiyor.
  const probe = adapter as { supportedFlags?: () => Promise<ReadonlySet<string>> };
  const supported = await probe.supportedFlags?.();
  // Gösterilen komut gerçek çağrıyla aynı olmalı: prompt gövdesi de geçilir,
  // yoksa doctor "--system-prompt " diye boş bir bayrak gösterip yanıltır.
  const promptText = await readFile(promptFile, "utf8");
  const args = (adapter as {
    argsFor?: (r: typeof req, s?: ReadonlySet<string>, p?: string) => string[];
  }).argsFor?.(req, supported, promptText) ?? [];

  console.log(`sağlayıcı : ${adapter.id}`);
  console.log(`model     : ${adapter.model}`);
  console.log(`ikili     : ${bin}`);
  console.log(`sürüm     : ${await binVersion(bin)}`);
  if (supported) {
    const ilgi = ["--system-prompt-file", "--system-prompt", "--append-system-prompt",
      "--permission-mode", "--permission-prompts", "--output-format", "--model", "--print"];
    console.log(`bayraklar : ${ilgi.map((f) => `${f}${supported.has(f) ? "✓" : "✗"}`).join("  ")}`);
  }
  const shown = args.map((a) => {
    const short = a.length > 70 ? `${a.slice(0, 70)}…(${a.length} karakter)` : a;
    return /\s/.test(short) ? JSON.stringify(short) : short;
  });
  console.log(`komut     : ${bin} ${shown.join(" ")}\n`);

  console.log("deneme çağrısı…");
  const r = await adapter.invoke(req);
  console.log(`  exit=${r.exitCode}  süre=${(r.durationMs / 1000).toFixed(1)}s` +
    (r.usage?.costUsd !== undefined ? `  maliyet=$${r.usage.costUsd.toFixed(4)}` : ""));
  if (r.exitCode === 0) {
    // Çıkış kodu sıfır olabilir ama model hiç çalışmamış olabilir: sıfır tur,
    // boş modelUsage. Operatörün makinesinde tam olarak bu oldu ve "başarılı"
    // görünüyordu. Sessizce boş dönen bir çağrı, hatadan daha kötüdür.
    const turns = modelTurns(r.stdout);
    if (turns === 0) {
      console.error(`  MODEL HİÇ ÇAĞRILMADI — sıfır tur, boş modelUsage.`);
      console.error(`  Çağrı hatasız döndü ama görev metni ajana ulaşmadı.`);
      console.error(`\n  ham stdout:\n${r.stdout.slice(0, 1500)}`);
      process.exit(1);
    }
    console.log(`  model turu: ${turns ?? "?"}`);
    console.log(`  stdout (ilk 300): ${r.stdout.slice(0, 300).replace(/\n/g, " ")}`);
    console.log("\n  ÇALIŞIYOR. Matriste kullanabilirsin.");
  } else {
    console.error(`  stderr: ${r.stderr.slice(0, 600)}`);
    console.error("\n  ÇALIŞMIYOR. Bayraklar yanlış olabilir — `codex --help` çıktısına bakıp");
    console.error("  src/adapters/codex.ts içindeki DEFAULT_ARGS'ı düzelt (TypeScript bilmeden de olur).");
    process.exit(1);
  }
}

/** İkilinin bildirdiği sürüm; okunamazsa "bilinmiyor". */
async function binVersion(bin: string): Promise<string> {
  const { spawnPortable } = await import("../proc/process.js");
  try {
    const child = spawnPortable(bin, ["--version"], {});
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (c: string) => (out += c));
    await new Promise<void>((r) => {
      child.on("error", () => r());
      child.on("close", () => r());
    });
    return out.trim().split("\n")[0] ?? "bilinmiyor";
  } catch {
    return "bilinmiyor";
  }
}

/** Çıktıdaki model turu sayısı; biçim tanınmazsa undefined. */
function modelTurns(stdout: string): number | undefined {
  try {
    const d = JSON.parse(stdout.trim()) as {
      usage?: { iterations?: unknown[] };
      modelUsage?: Record<string, unknown>;
    };
    if (Array.isArray(d.usage?.iterations)) return d.usage.iterations.length;
    if (d.modelUsage) return Object.keys(d.modelUsage).length;
    return undefined;
  } catch {
    return undefined;
  }
}

async function matrix(taskId: string, a: string, b: string, force: boolean): Promise<void> {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  await mkdir(join(REPO, ".skein"), { recursive: true });
  const log = new EventLog(LOG, runId);
  await log.append({ type: "run.started", taskId });

  console.log(`2x2 çapraz kurgu — ${a}  ×  ${b}\n`);
  const out = await runMatrix({
    repo: REPO, taskId, models: [a, b],
    runRoot: join(REPO, ".skein/runs", runId), log, timeoutMs: 10 * 60_000, force,
  });

  console.log("\n=== üretim ===");
  for (const p of out.producers) {
    console.log(`  ${p.model.padEnd(18)} ` + (p.ran
      ? `${p.total - p.redHooks.length}/${p.total} yeşil` +
        (p.redHooks.length > 0 ? `  ← kusur: ${p.redHooks.join("; ")}` : "  ← kusur yok")
      : "ÖLÇÜLEMEDİ — süit koşmadı"));
  }
  if (out.skipped !== undefined) {
    console.log(`\n${out.skipped}`);
    return;
  }
  console.log("\n=== denetim hücreleri ===");
  for (const c of out.cells) {
    console.log(`  ${c.producer} üretti → ${c.reviewer} inceledi  ${c.crossed ? "ÇAPRAZ" : "aynı  "}  ${c.reviewPath}`);
  }
  const total = out.producers.reduce((s2, p) => s2 + p.costUsd, 0) + out.cells.reduce((s2, c) => s2 + c.costUsd, 0);
  console.log(`\n  toplam: $${total.toFixed(4)}`);
  console.log("\nSıradaki: raporları puanla — kanıtlanmış kusuru hangi hücreler yakaladı?");
}

const argv = process.argv.slice(2);
const audit = argv.includes("--audit");
const force = argv.includes("--force");
const [cmd, ...rest] = argv.filter((a) => a !== "--audit" && a !== "--force");
if (cmd === "report") {
  await report();
} else if (cmd === "doctor") {
  await doctor(rest[0] ?? "codex:gpt-5.5");
} else if (cmd === "matrix") {
  await matrix(rest[0] ?? "retry-backoff", rest[1] ?? "claude:claude-opus-5", rest[2] ?? "claude:claude-sonnet-5", force);
} else if (cmd) {
  await run(cmd, rest[0] ?? "claude", rest[1] ?? "claude-opus-5", audit);
} else {
  console.error("kullanım: cli.ts <görev-id> [sağlayıcı] [model] [--audit]\n         cli.ts matrix <görev-id> [sağlayıcı:model] [sağlayıcı:model]\n         cli.ts doctor <sağlayıcı:model>\n         cli.ts report");
  process.exit(2);
}
