import { join, resolve } from "node:path";
import { ClaudeCliAdapter } from "../adapters/claude.js";
import { AdapterRegistry, type Adapter } from "../adapters/contract.js";
import { loadTask } from "./task.js";
import { produce } from "./produce.js";
import { runHidden } from "./hidden.js";

const REPO = resolve(import.meta.dirname, "../..");

function registry(model: string): AdapterRegistry {
  return new AdapterRegistry().register(new ClaudeCliAdapter({ model }));
}

async function main(): Promise<void> {
  const [taskId, provider = "claude", model = "claude-opus-5"] = process.argv.slice(2);
  if (!taskId) {
    console.error("kullanım: cli.ts <görev-id> [sağlayıcı] [model]");
    process.exit(2);
  }

  const task = await loadTask(join(REPO, "bench/tasks", taskId));
  const adapter: Adapter = registry(model).get(provider);
  const cellDir = join(REPO, ".skein/runs", `${Date.now()}`, task.id, `${adapter.id}--${adapter.model}`);

  console.log(`görev    : ${task.id} — ${task.title}`);
  console.log(`üretici  : ${adapter.id} / ${adapter.model}`);
  console.log(`hücre    : ${cellDir.slice(REPO.length + 1)}\n`);

  console.log("üretim koşuyor…");
  const p = await produce({
    task,
    adapter,
    cellDir,
    layers: [{ name: "produce", path: join(REPO, "bench/prompts/produce.md") }],
    timeoutMs: 10 * 60_000,
  });

  const u = p.invoke.usage;
  console.log(`  exit=${p.invoke.exitCode} süre=${(p.invoke.durationMs / 1000).toFixed(1)}s` +
    (u?.costUsd !== undefined ? ` maliyet=$${u.costUsd.toFixed(4)}` : "") +
    (u?.outputTokens !== undefined ? ` çıktı=${u.outputTokens}tok` : ""));
  console.log(`  prompt hash: ${p.promptHash.slice(0, 16)}…`);

  if (p.invoke.exitCode !== 0) {
    console.error(`\nÜretim başarısız (exit ${p.invoke.exitCode}).`);
    console.error(p.invoke.stderr.slice(0, 800) || p.invoke.stdout.slice(0, 800));
    process.exit(1);
  }

  console.log("\ngizli testler koşuyor…");
  const h = await runHidden(task, cellDir, REPO);

  if (!h.ran) {
    console.error("  ÖLÇÜLEMEDİ — süit hiç koşmadı (artefakt derlenmiyor ya da yok).");
    console.error("  Bu 'sıfır kırmızı' DEĞİLDİR.");
    console.error((h.stderr || h.raw).slice(0, 800));
    process.exit(1);
  }

  const green = h.hooks.length - h.red.length;
  console.log(`\n  ${green}/${h.hooks.length} kanca yeşil, ${h.red.length} KIRMIZI\n`);
  for (const hook of h.hooks) console.log(`  ${hook.passed ? "✓" : "✗"} ${hook.title}`);
  if (h.red.length > 0) {
    console.log(`\nKanıtlanmış kusur: ${h.red.length}. Bunlar denetim aşamasının hedefi.`);
  }
}

await main();
