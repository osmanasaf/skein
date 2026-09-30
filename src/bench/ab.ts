import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Adapter } from "../adapters/contract.js";
import { adapterFor, knownProviderSet, parseModelSpec, type AdapterOptions } from "../adapters/factory.js";
import { newCard } from "../card/card.js";
import { CardQueue } from "../card/queue.js";
import { EventLog, readEvents, type SkeinEvent } from "../events/log.js";
import { loadFlow } from "../flow/load.js";
import { snapshot } from "../flow/snapshot.js";
import { runUntilIdle, type SweepResult } from "../watch/loop.js";
import { workspacePath } from "../watch/workspace.js";
import { spawnPortable } from "../proc/process.js";
import { runHidden } from "./hidden.js";
import { loadTask, type Task } from "./task.js";

/** Ölçümün iki kolu. */
export type Arm = "planli" | "plansiz";

export const ARM_FLOW: Record<Arm, string> = {
  planli: "ab-planli",
  plansiz: "ab-plansiz",
};

export interface ArmOptions {
  /** Gerçek Skein deposu: görevler, promptlar ve akışlar buradan gelir. */
  repo: string;
  taskId: string;
  /**
   * Görev dizini; verilmezse `<repo>/bench/tasks/<taskId>`.
   *
   * Ayrı parametre olmasının sebebi: `repo` gizli süitin koşacağı yer
   * (node_modules oradadır), görev ise başka bir yerde durabilir. Testler
   * bunu kullanıp gerçek görev setini kirletmeden fikstür görevle koşuyor.
   */
  taskDir?: string;
  arm: Arm;
  /** Kum havuzu dizini — her koşu kendi deposunda çalışır. */
  sandbox: string;
  adapters: Map<string, Adapter>;
  logPath: string;
  /** Bu kolun koşu kimliği; bütün olaylar bununla yazılır. */
  runId: string;
  timeoutMs?: number;
  maxSweeps?: number;
  onSweep?: (sweep: SweepResult, index: number) => void;
}

export interface ArmResult {
  arm: Arm;
  taskId: string;
  runId: string;
  /** Gizli süit gerçekten koştu mu. Koşmadıysa "kusur yok" DEĞİLDİR. */
  ran: boolean;
  red: string[];
  total: number;
  /** Kartın son durumu: `done` değilse iş bitmemiştir. */
  cardState: string;
  activations: number;
  costUsd: number;
  /** Kartın zincirde kaç kez geri gönderildiği. */
  rejects: number;
  /** Planlı kolda alışverişin sayıları; kontrol kolunda yok. */
  planning?: { rounds: number; objections: number; accepted: number; invalid: number };
  /**
   * Kart kapıda kaldıysa SEBEBİ.
   *
   * Kampanyada bu satır olmadan "⚠ kart `gate` durumunda kaldı" yazısı
   * operatöre hiçbir şey söylemiyor: modelin commit'i atlaması, ret
   * limitinin dolması ve planlama kilidi aynı görünüyor. Sebep ölçümün
   * geçerliliğini belirliyor — bir kolda sistematik olarak çıkıyorsa
   * karşılaştırma bozulmuştur.
   */
  escalation?: string;
}

async function git(cwd: string, args: string[]): Promise<void> {
  const child = spawnPortable("git", args, { cwd });
  const code = await new Promise<number>((resolve) => child.on("close", (c) => resolve(c ?? 1)));
  if (code !== 0) throw new Error(`git ${args.join(" ")} başarısız (${code}) — ${cwd}`);
}

/**
 * Kolun koşacağı kum havuzu deposunu kurar.
 *
 * Neden ayrı bir depo: orkestratör rolleri gerçek worktree'lerde çalıştırıyor
 * ve kod git'te taşınıyor. Ölçümü Skein'in kendi deposunda koşturmak,
 * ajanların ürettiği çözümü projenin içine yazmak olurdu.
 *
 * `hub/` kopyalanıyor çünkü akış dosyasının çözdüğü prompt yolları kökün
 * İÇİNDE kalmak zorunda (kural: yollar depo dışına çıkamaz).
 */
export async function prepareSandbox(repo: string, sandbox: string, task: Task): Promise<void> {
  await mkdir(sandbox, { recursive: true });
  await git(sandbox, ["init", "--quiet"]);
  await git(sandbox, ["config", "user.email", "skein@ornek"]);
  await git(sandbox, ["config", "user.name", "Skein Ölçüm"]);
  await git(sandbox, ["config", "commit.gpgsign", "false"]);

  await cp(join(repo, "hub"), join(sandbox, "hub"), { recursive: true });
  // Orkestratörün kendi durumu ve worktree'ler depoya girmez.
  await writeFile(join(sandbox, ".gitignore"), ".skein/\n.worktrees/\n");

  // Mevcut kod üretimden ÖNCE yerine konur — bench'teki sıranın aynısı.
  if (task.seedDir !== undefined) {
    await cp(task.seedDir, sandbox, { recursive: true });
  }
  await git(sandbox, ["add", "-A"]);
  await git(sandbox, ["commit", "--quiet", "-m", "skein: ölçüm kum havuzu"]);
}

/**
 * Karta verilecek iş metni: görev tanımı, hedef dosya ve kum havuzunun sınırı.
 *
 * Son madde şart: kum havuzunda `package.json` ve `node_modules` yok, yani
 * anayasanın "doğrulamayı deponun betikleriyle koş" kuralı burada
 * uygulanamıyor. Söylenmezse ajan turunu var olmayan bir test koşucusunu
 * aramakla harcar — ve bu iki kolda da olacağı için ölçümü bozmaz ama
 * pahalılaştırır. Ölçümün yer gerçeği zaten gizli süit; o, akış bittikten
 * SONRA koşuyor ve ajan onu hiç görmüyor.
 */
export async function armTaskText(task: Task): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  const spec = await readFile(task.specPath, "utf8");
  return `${spec}\n\nÇözümü şu dosyaya yaz: ${task.entry}\n\n` +
    "## Bu deponun sınırı\n\n" +
    "Bu bir ölçüm kum havuzu: `package.json`, `node_modules` ve test koşucusu " +
    "YOK. `npm test` / `npm run typecheck` aramayı deneme — çalışmayacak. " +
    "Doğrulamanı kodu okuyarak yap ve neyi izlediğini söyle.\n";
}

/**
 * Bir kolu uçtan uca koşar ve sonucu gizli süitle ölçer.
 *
 * Sıra deneyin geçerlilik koşulu: gizli testler ancak akış BİTTİKTEN sonra
 * diske geliyor. Kum havuzunda üretim sırasında bulunmamaları, "üretici
 * gizli testi görmedi" garantisini talimat olmaktan çıkarıp fiziksel yapar.
 */
export class ArmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArmError";
  }
}

/**
 * Akışın istediği her sağlayıcı için adaptör var mı.
 *
 * Kontrol burada ve koşu BAŞLAMADAN: eksik adaptörle koşulduğunda her kol
 * "ÖLÇÜLEMEDİ" döndürüyordu, yani yazım hatası ölçüm sonucu gibi
 * görünüyordu. Canlı doğrulama koşusunda tam bu oldu — `--k 1` biçimi model
 * adını yuttu, adaptör `1` diye kaydedildi ve iki kol da sessizce boş
 * döndü. Para harcanmadı ama sonuç yanıltıcıydı.
 */
export function requireAdapters(providers: string[], adapters: Map<string, Adapter>): void {
  const eksik = [...new Set(providers)].filter((p) => !adapters.has(p));
  if (eksik.length === 0) return;
  throw new ArmError(
    `Şu sağlayıcı(lar) için adaptör yok: ${eksik.join(", ")}. ` +
      `Verilen: ${[...adapters.keys()].join(", ") || "(hiç)"}. ` +
      `Model biçimi \`sağlayıcı:model\` olmalı, ör. \`claude:claude-sonnet-5\`.`,
  );
}

/**
 * Kol koşusunun beklediği adaptör haritası — anahtar SAĞLAYICI.
 *
 * `adapterFor` adaptörün `id`'sine model tanımının tamamını yazıyor
 * (`claude:claude-haiku-4-5`), çünkü 2x2'nin hücreleri model düzeyinde
 * ayrışmak zorunda. Akış rolleri ise `provider: claude` diyor. Harita
 * `adapter.id` ile kurulunca ikisi eşleşmiyor ve koşu hiç başlamıyor —
 * canlı doğrulamada tam bu oldu. Testler haritayı elle `"claude"`
 * anahtarıyla kurduğu için kusuru göremiyordu; kurulum bu yüzden artık
 * tek yerde ve test edilebilir.
 */
export function armAdapters(modelSpec: string, options: AdapterOptions = {}): Map<string, Adapter> {
  const { provider } = parseModelSpec(modelSpec);
  return new Map([[provider, adapterFor(modelSpec, options)]]);
}

export async function runArm(options: ArmOptions): Promise<ArmResult> {
  const { repo, taskId, arm, sandbox, adapters, logPath, runId } = options;
  const task = await loadTask(options.taskDir ?? join(repo, "bench/tasks", taskId));
  await prepareSandbox(repo, sandbox, task);

  const flowPath = join(sandbox, "hub", "flows", `${ARM_FLOW[arm]}.yaml`);
  const flow = await loadFlow(flowPath, { root: sandbox, providers: knownProviderSet() });
  const topology = snapshot(flow, sandbox);
  requireAdapters(topology.roles.map((r) => r.provider), adapters);

  const queue = new CardQueue(join(sandbox, ".skein"));
  await queue.init();
  const log = new EventLog(logPath, runId);
  await log.append({ type: "run.started", taskId });
  // Kolun kimliği günlüğe AÇIKÇA yazılıyor: "plan olayı var mı" diye
  // çıkarsamak, planlayıcısı hiç koşmamış bir planlı kolu kontrol kolu
  // gibi gösterirdi.
  // Model de yazılıyor: ölçüm grubunun anahtarı görev × model kurgusu.
  const model = [...new Set(topology.roles.map((r) => adapters.get(r.provider)?.model ?? "?"))]
    .sort()
    .join("+");
  await log.append({ type: "ab.arm", taskId, arm, flow: flow.name, model });

  const card = await queue.add(newCard({
    title: `${taskId} (${arm})`,
    task: await armTaskText(task),
    topology,
  }));

  await runUntilIdle(topology, {
    root: sandbox,
    queue,
    adapters,
    log,
    maxSweeps: options.maxSweeps ?? 12,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.onSweep === undefined ? {} : { onSweep: options.onSweep }),
  });

  const son = await queue.get(card.id);

  // Ancak şimdi: akış bitti, gizli testler diske gelebilir.
  // Kod zincir boyunca İLERİ taşınıyor, yani son hâli zincirin SON rolünün
  // ağacında duruyor — `main`de değil. İlk hâli `main`den kopyalıyordu ve
  // planlı kolda orada yalnızca plan belgesi vardı: süit hiç koşmuyor,
  // sonuç "ÖLÇÜLEMEDİ" görünüyordu.
  const sonRol = topology.roles[topology.roles.length - 1];
  const kaynak = sonRol === undefined ? sandbox : workspacePath(sandbox, sonRol.workspace);
  const cellDir = join(sandbox, ".skein", "olcum", arm);
  await mkdir(join(cellDir, "artifact"), { recursive: true });
  await cp(join(kaynak, "src"), join(cellDir, "artifact", "src"), { recursive: true })
    .catch(() => undefined);
  await cp(task.hiddenDir, join(cellDir, "hidden"), { recursive: true });
  const h = await runHidden(task, cellDir, repo);
  await log.append({
    type: "hooks.measured", cell: `olcum/${arm}`, ran: h.ran, total: h.hooks.length, red: h.red,
  });

  const { events } = await readEvents(logPath);
  const own = events.filter((e) => e.runId === runId);
  const kacis = [...own].reverse().find(
    (e): e is Extract<SkeinEvent, { type: "card.settled" }> =>
      e.type === "card.settled" && e.outcome === "escalated",
  );
  return {
    arm, taskId, runId,
    ran: h.ran,
    red: h.red,
    total: h.hooks.length,
    cardState: son?.state ?? "yok",
    ...(kacis?.reason === undefined ? {} : { escalation: kacis.reason }),
    ...armMetrics(own),
  };
}

/** Kolun sayıları — günlükten türetiliyor, bellekte sayaç tutulmuyor. */
export function armMetrics(events: SkeinEvent[]): {
  activations: number;
  costUsd: number;
  rejects: number;
  planning?: { rounds: number; objections: number; accepted: number; invalid: number };
} {
  let activations = 0;
  let costUsd = 0;
  let rejects = 0;
  let planning: { rounds: number; objections: number; accepted: number; invalid: number } | undefined;

  for (const e of events) {
    if (e.type === "agent.finished") {
      activations += 1;
      costUsd += e.usage?.costUsd ?? 0;
    }
    if (e.type === "card.settled" && e.outcome === "rejected") rejects += 1;
    if (e.type === "plan.settled") {
      planning = {
        rounds: e.rounds, objections: e.objections, accepted: e.accepted, invalid: e.invalid,
      };
    }
  }
  return { activations, costUsd, rejects, ...(planning === undefined ? {} : { planning }) };
}
