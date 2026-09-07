import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Adapter, InvokeResult } from "../adapters/contract.js";
import { AuditGate, type GateDecision } from "../audit/gate.js";
import { fingerprintDir } from "../audit/fingerprint.js";
import { assemblePrompt, type PromptLayer } from "../prompt/assemble.js";
import type { Task } from "./task.js";

export interface AuditLoopOptions {
  task: Task;
  adapter: Adapter;
  cellDir: string;
  artifactDir: string;
  /** Denetim prompt katmanları. Üretim promptundan ayrı. */
  layers: PromptLayer[];
  /** Tur üst sınırı: sürtünme sonsuz döngüye ve sınırsız maliyete dönüşmemeli. */
  maxRounds: number;
  timeoutMs: number;
  onRound?: (decision: GateDecision, invoke?: InvokeResult) => Promise<void>;
}

export interface AuditOutcome {
  accepted: boolean;
  /** Kapının saydığı toplam tur. */
  rounds: number;
  /** Ajanın denetim turunda işi gerçekten değiştirdiği tur sayısı. */
  changedRounds: number;
  /** Üst sınıra takılıp kabul edilmeden çıkıldı mı. */
  exhausted: boolean;
  invocations: InvokeResult[];
}

/**
 * Denetim kapısı döngüsü.
 *
 * İlk deneme reddedilir; ajan işini yeniden denetler. Bir düzeltme yaparsa
 * parmak izi değişir ve yeni tur açılır. Kabul, ancak hiçbir şeyin
 * değişmediği bir turdan sonra gelir.
 *
 * `changedRounds` kasıtlı olarak ayrı sayılıyor: bu, mekanizmanın tören mi
 * yoksa gerçek denetim mi olduğunun doğrudan göstergesi. Sıfıra yakınsa ajan
 * komutu ikinci kez çalıştırıyor demektir (PHILOSOPHY, "dürüst sınır").
 */
export async function auditLoop(options: AuditLoopOptions): Promise<AuditOutcome> {
  const { task, adapter, cellDir, artifactDir, layers, maxRounds, timeoutMs, onRound } = options;

  const gate = new AuditGate(join(cellDir, "audit.json"));
  const prompt = await assemblePrompt(layers);
  const promptFile = join(cellDir, "audit-prompt.txt");
  await import("node:fs/promises").then((fs) => fs.writeFile(promptFile, prompt.text));
  const spec = await readFile(task.specPath, "utf8");

  const invocations: InvokeResult[] = [];
  let changedRounds = 0;
  let last: GateDecision | undefined;

  for (let i = 0; i < maxRounds; i += 1) {
    const decision = await gate.attempt(await fingerprintDir(artifactDir));
    last = decision;
    if (decision.reason === "degisti") changedRounds += 1;

    if (decision.accepted) {
      await onRound?.(decision);
      return { accepted: true, rounds: decision.round, changedRounds, exhausted: false, invocations };
    }

    const invoke = await adapter.invoke({
      workdir: artifactDir,
      promptFile,
      taskText: `${spec}\n\nÜzerinde çalıştığın dosya: ${task.entry}\n`,
      timeoutMs,
    });
    invocations.push(invoke);
    await onRound?.(decision, invoke);

    if (invoke.exitCode !== 0) {
      return { accepted: false, rounds: decision.round, changedRounds, exhausted: false, invocations };
    }
  }

  return {
    accepted: false,
    rounds: last?.round ?? 0,
    changedRounds,
    exhausted: true,
    invocations,
  };
}
