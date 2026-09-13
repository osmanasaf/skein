import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Adapter } from "../adapters/contract.js";
import type { Card } from "../card/card.js";
import type { CardQueue } from "../card/queue.js";
import type { EventLog } from "../events/log.js";
import { promptLayers, roleOf, type SnapshotRole } from "../flow/snapshot.js";
import { assemblePrompt } from "../prompt/assemble.js";
import { capture } from "../proc/process.js";
import { buildTaskText } from "./task-text.js";
import { clearVerdict, readVerdict } from "./verdict.js";
import { resolveWorkspace } from "./workspace.js";

/** Bir turun sonucu. `idle` dışında her biri kartı hareket ettirmiştir. */
export type TickResult =
  | { status: "idle" }
  | { status: "accepted"; card: Card; summary?: string }
  | { status: "rejected"; card: Card; reason: string }
  | { status: "escalated"; card: Card; reason: string };

export interface TickOptions {
  root: string;
  queue: CardQueue;
  /** Sağlayıcı id'sinden adaptöre. Akış doğrulaması bunu zaten garantiledi. */
  adapters: Map<string, Adapter>;
  log?: EventLog;
  timeoutMs?: number;
  /** Test edilebilirlik için; varsayılan `git rev-parse HEAD`. */
  headCommit?: (workdir: string) => Promise<string | undefined>;
}

const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;

/** Çalışılan ağacın son commit'i; kart geçmişine ve itiraza bağlanır. */
async function gitHead(workdir: string): Promise<string | undefined> {
  const result = await capture("git", ["rev-parse", "--short", "HEAD"], { cwd: workdir, timeoutMs: 10_000 });
  const hash = result.stdout.trim();
  return result.exitCode === 0 && hash !== "" ? hash : undefined;
}

/**
 * Bir rol için tek tur koşar.
 *
 * Kuyrukta kart yoksa hiçbir şey yapmaz. Varsa: kartı alır, promptu
 * derler, adaptörü çağırır ve ajanın verdiktine göre kartı ilerletir ya da
 * geri gönderir.
 *
 * Ajanın "kabul" demesi ile "hiç cevap vermemesi" burada KESİN olarak
 * ayrılır. Deneyde en pahalıya mal olan hata, çıktısız bir koşuyu başarılı
 * saymaktı; cevapsız tur kartı insan kapısına çıkarır.
 */
export async function tick(roleId: string, options: TickOptions): Promise<TickResult> {
  const { queue } = options;

  const card = await queue.take(roleId);
  if (card === null) return { status: "idle" };

  const role = roleOf(card.topology, roleId);
  if (role === null) {
    const reason = `Kartın rolü topolojisinde yok: ${roleId}`;
    return { status: "escalated", card: await queue.escalate(card, reason), reason };
  }

  try {
    return await runRole(card, role, options);
  } catch (error) {
    // Altyapı hatası da sessiz kalmamalı: kart kapıda görünür olur.
    const reason = `Tur koşulamadı: ${(error as Error).message}`;
    return { status: "escalated", card: await queue.escalate(card, reason), reason };
  }
}

async function runRole(card: Card, role: SnapshotRole, options: TickOptions): Promise<TickResult> {
  const { root, queue, adapters, log } = options;

  const adapter = adapters.get(role.provider);
  if (adapter === undefined) {
    const reason = `\`${role.provider}\` için adaptör yok. Kayıtlı: ${[...adapters.keys()].join(", ")}`;
    return { status: "escalated", card: await queue.escalate(card, reason), reason };
  }

  const workdir = await resolveWorkspace(root, role.workspace);
  const prompt = await assemblePrompt(promptLayers(card.topology, role, root));
  const promptDir = await mkdtemp(join(tmpdir(), "skein-prompt-"));
  const promptFile = join(promptDir, `${role.id}.md`);
  await writeFile(promptFile, prompt.text, "utf8");

  // Önceki turdan kalmış bir verdikt bu turun cevabı sanılmasın.
  await clearVerdict(workdir);

  const cell = `${card.id}:${role.id}`;
  await log?.append({
    type: "agent.started",
    cell,
    role: role.id,
    provider: role.provider,
    model: adapter.model,
    promptHash: prompt.hash,
  });

  const result = await adapter.invoke({
    workdir,
    promptFile,
    taskText: buildTaskText(card, role),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });

  await log?.append({
    type: "agent.finished",
    cell,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    ...(result.timedOut === true ? { timedOut: true } : {}),
    ...(result.usage === undefined ? {} : { usage: result.usage }),
  });

  const commit = await (options.headCommit ?? gitHead)(workdir);

  if (result.exitCode !== 0) {
    const tail = result.stderr.trim().slice(-400);
    const reason =
      `Ajan ${result.timedOut === true ? "zaman aşımına uğradı" : `hata kodu ${result.exitCode} ile bitti`}` +
      (tail === "" ? "" : `: ${tail}`);
    return { status: "escalated", card: await queue.escalate(card, reason), reason };
  }

  const verdict = await readVerdict(workdir);

  if (verdict.kind === "missing") {
    const reason =
      "Ajan verdikt yazmadı — tur sonuçsuz. Cevap vermemek bir cevap değildir; " +
      "sessizce kabul saymak, hiçbir şey üretmemiş bir koşuyu başarılı saymak olurdu.";
    return { status: "escalated", card: await queue.escalate(card, reason), reason };
  }
  if (verdict.kind === "invalid") {
    const reason = `Verdikt geçersiz: ${verdict.problem}`;
    return { status: "escalated", card: await queue.escalate(card, reason), reason };
  }

  if (verdict.verdict.decision === "reject") {
    const reason = verdict.verdict.reason as string;
    const sent = await queue.reject(card, { reason, ...(commit === undefined ? {} : { commit }) });
    // Limit dolduysa `reject` kartı kuyruğa değil kapıya koyar.
    return sent.state === "gate"
      ? { status: "escalated", card: sent, reason: `ret limiti doldu: ${reason}` }
      : { status: "rejected", card: sent, reason };
  }

  const moved = await queue.handoff(card, commit === undefined ? {} : { commit });
  const summary = verdict.verdict.summary;
  return { status: "accepted", card: moved, ...(summary === undefined ? {} : { summary }) };
}
