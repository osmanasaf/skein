import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Adapter, InvokeResult } from "../adapters/contract.js";
import type { Card } from "../card/card.js";
import type { CardQueue } from "../card/queue.js";
import type { EventLog } from "../events/log.js";
import { DONE, promptLayers, roleOf, type SnapshotRole } from "../flow/snapshot.js";
import { assemblePrompt } from "../prompt/assemble.js";
import { dirtyPaths, head, mergeForward, ORCHESTRATOR_PATHS } from "./git.js";
import { buildTaskText } from "./task-text.js";
import { clearVerdict, readVerdict } from "./verdict.js";
import { resolveWorkspace } from "./workspace.js";

/** Bir turun sonucu. `idle` dışında her biri kartı hareket ettirmiştir. */
export type TickResult =
  | { status: "idle" }
  | { status: "accepted"; card: Card; summary?: string; warnings?: string[] }
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
  /** Test edilebilirlik için; varsayılan `git status --porcelain`. */
  dirtyPaths?: (workdir: string, ignore: string[]) => Promise<string[]>;
  /** Test edilebilirlik için; varsayılan gerçek git birleştirmesi. */
  mergeForward?: typeof mergeForward;
}

const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;



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
  const result = await settle(roleId, options);
  if (result.status !== "idle") {
    // Tek yazım noktası: her sonuçlanma yolu buradan geçer, hiçbiri kaydı atlayamaz.
    await options.log?.append({
      type: "card.settled",
      cell: `${result.card.id}:${roleId}`,
      card: result.card.id,
      role: roleId,
      outcome: result.status,
      state: result.card.state,
      ...("reason" in result ? { reason: result.reason } : {}),
      ...("summary" in result && result.summary !== undefined ? { summary: result.summary } : {}),
      ...("warnings" in result && result.warnings !== undefined ? { warnings: result.warnings } : {}),
    });
  }
  return result;
}

async function settle(roleId: string, options: TickOptions): Promise<TickResult> {
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

/**
 * Ajanın kendi açıklamasını gerekçeye ekler.
 *
 * Sonuçsuz bir turda "verdikt yazmadı" cümlesi olayı anlatır, sebebini
 * anlatmaz. Sebebi çoğu zaman ajan kendisi söylüyor — çekirdeğin onu
 * okumaması, teşhisi koşu sayısı kadar geciktiriyor.
 */
function agentSaid(result: InvokeResult): string {
  const text = (result.message ?? result.stdout).trim();
  if (text === "") return "";
  const tail = text.length > 600 ? `…${text.slice(-600)}` : text;
  return `\n\nAjan şunu söyledi:\n${tail}`;
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

  const commit = await (options.headCommit ?? head)(workdir);

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
      "sessizce kabul saymak, hiçbir şey üretmemiş bir koşuyu başarılı saymak olurdu." +
      agentSaid(result);
    return { status: "escalated", card: await queue.escalate(card, reason), reason };
  }
  if (verdict.kind === "invalid") {
    const reason = `Verdikt geçersiz: ${verdict.problem}${agentSaid(result)}`;
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

  // KUSUR 1'in kapısı: işlenmemiş değişiklik devredilemez.
  //
  // Gerçek koşuda `coder` dosyaları yazdı, commit atmadı ve yine de
  // "accept" dedi; devir teslim iskelet commit'ini kaydetti. "Dosya
  // yazdım" ile "işi teslim ettim" ayrı şeyler. Kural "her kabul commit
  // üretmeli" DEĞİL — değişiklik yapmadan kabul eden bir denetçi meşru;
  // yasak olan, ortada duran ve hiçbir yere gidemeyecek iş bırakmak.
  const dirty = await (options.dirtyPaths ?? dirtyPaths)(workdir, ORCHESTRATOR_PATHS);
  if (dirty.length > 0) {
    const reason =
      `\`${role.id}\` kabul etti ama ağacında işlenmemiş değişiklik var: ` +
      `${dirty.slice(0, 8).join(", ")}${dirty.length > 8 ? ` (+${dirty.length - 8})` : ""}. ` +
      `İşlenmemiş iş devredilemez — sonraki rol onu göremez.`;
    return { status: "escalated", card: await queue.escalate(card, reason), reason };
  }

  // KUSUR 2'nin kapısı: devir teslim kodu da taşır.
  const merge = await handOverCode(card, role, options, workdir);
  if (merge !== null) {
    return { status: "escalated", card: await queue.escalate(card, merge), reason: merge };
  }

  const moved = await queue.handoff(card, commit === undefined ? {} : { commit });

  // syncBack devir teslimden SONRA: kart zaten yerine ulaştı, kopyanın
  // başarısızlığı onu geri alamaz. Ama sessiz de kalamaz — ağacı güncel
  // kalmayan bir rol, sıradaki kartına bayat bir ağaçtan başlar.
  const warnings = await syncBack(card, role, options, workdir);
  const summary = verdict.verdict.summary;
  return {
    status: "accepted",
    card: moved,
    ...(summary === undefined ? {} : { summary }),
    ...(warnings.length === 0 ? {} : { warnings }),
  };
}

/**
 * Kabul edilen işin merge-only bir kopyasını `syncBack` listesindeki
 * rollerin ağaçlarına gönderir. Kart hareket etmez.
 *
 * `next` ile farkı: `next` kartı ve kodu birlikte ileri taşır; `syncBack`
 * yalnızca kodu, geriye, kart yerinde kalarak. Listenin açık olması kasıtlı
 * — kimin ağacının güncelleneceği sayılabilir olmalı (SCHEMA.md, maliyet).
 */
async function syncBack(
  card: Card,
  role: SnapshotRole,
  options: TickOptions,
  fromDir: string,
): Promise<string[]> {
  const warnings: string[] = [];

  for (const targetId of role.syncBack) {
    const target = roleOf(card.topology, targetId);
    if (target === null) {
      warnings.push(`syncBack hedefi topolojide yok: ${targetId}`);
      continue;
    }
    if (target.workspace === role.workspace) continue;

    try {
      const toDir = await resolveWorkspace(options.root, target.workspace);
      const result = await (options.mergeForward ?? mergeForward)({
        fromDir,
        toDir,
        message: `skein: syncBack ${role.id} → ${target.id} (${card.id})`,
        ignoreDirty: ORCHESTRATOR_PATHS,
      });
      if (result.kind === "conflict") {
        warnings.push(`syncBack ${role.id} → ${target.id} çakıştı: ${result.paths.join(", ")}`);
      } else if (result.kind === "blocked") {
        warnings.push(`syncBack ${role.id} → ${target.id} yapılamadı: ${result.reason}`);
      }
    } catch (error) {
      warnings.push(`syncBack ${role.id} → ${target.id}: ${(error as Error).message}`);
    }
  }
  return warnings;
}

/**
 * Kodu zincirde bir sonraki rolün ağacına taşır.
 *
 * Şema `syncBack`'i "merge-only kopya" diye tanımlıyordu ama yalnızca GERİ
 * yön için. İleri yön hiç yazılmamıştı: kart taşınıyor, kod bıraktığı yerde
 * kalıyordu. Gerçek koşuda denetçi boş bir worktree'de "denetle" talimatı
 * aldı ve doğal olarak denetleyecek bir şey bulamadı.
 *
 * Sorun varsa gerekçe metnini döner; yoksa null.
 */
async function handOverCode(
  card: Card,
  role: SnapshotRole,
  options: TickOptions,
  fromDir: string,
): Promise<string | null> {
  if (role.next === DONE) return null;

  const next = roleOf(card.topology, role.next);
  if (next === null) return `Sonraki rol topolojide yok: ${role.next}`;
  if (next.workspace === role.workspace) return null;

  const toDir = await resolveWorkspace(options.root, next.workspace);
  const result = await (options.mergeForward ?? mergeForward)({
    fromDir,
    toDir,
    message: `skein: ${role.id} → ${next.id} (${card.id})`,
    ignoreDirty: ORCHESTRATOR_PATHS,
  });

  switch (result.kind) {
    case "merged":
    case "already":
      return null;
    case "conflict":
      // Çakışmayı üçüncü bir ajanın tahmin etmesi değil, insanın çözmesi
      // gereken yer burası.
      return `\`${role.id}\` → \`${next.id}\` birleştirmesi çakıştı: ${result.paths.join(", ")}`;
    case "blocked":
      return `\`${role.id}\` → \`${next.id}\` kodu taşınamadı: ${result.reason}`;
  }
}
