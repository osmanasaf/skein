import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { safeName } from "./safe-name.js";
import { formatUsage, sumUsage, totalUsage } from "./usage.js";
import { join, resolve } from "node:path";
import type { Adapter } from "../adapters/contract.js";
import { EventLog, readEvents } from "../events/log.js";
import { summarize } from "../events/summary.js";
import { loadTask } from "./task.js";
import { produce } from "./produce.js";
import { runHidden } from "./hidden.js";
import { auditLoop } from "./audit-loop.js";
import { runMatrix, diagnose } from "./matrix.js";
import { TurnRecorder, diffLines, diffSnapshots, loadSnapshot,
  type Snapshot, type SnapshotDiff } from "./snapshot.js";
import { selfTest } from "./selftest.js";
import { networkFailure } from "./failure.js";
import { armAdapters, runArm, ARM_FLOW, type Arm } from "./ab.js";
import { planEffect, type PlanEffectReport, type PlanGroup } from "./planeffect.js";
import { scoreTargets, scoreAll, classifyTargets, classifyAll } from "./score.js";
import { effectReport, filterByTask, type EffectReport, type PairScore, type Side } from "./effect.js";
import { noiseReport, type NoiseReport, type NoiseSide } from "./noise.js";
import { adapterFor } from "../adapters/factory.js";

import { modelTurns } from "./modelturns.js";

const REPO = resolve(import.meta.dirname, "../..");

/**
 * Sağlayıcı CLI'ının izin ayarları, ortamdan.
 *
 * Varsayılan `bypassPermissions` root altında CLI tarafından reddediliyor
 * (konteynerde koşarken tam olarak bu oldu: exit 1, tek satır stderr).
 * Otomatik geri düşmek yerine açıkça veriliyor — izin modu ajanın neye
 * dokunabildiğini belirliyor ve koşular arasında sessizce değişmesi,
 * karşılaştırmayı fark edilmeden bozar. Koşuda ekrana yazdırılıyor.
 *
 *   SKEIN_PERMISSION_MODE=acceptEdits
 *   SKEIN_ALLOWED_TOOLS="Read,Write,Edit,Bash"
 */
/**
 * Deneyin ajanına verilen araçlar.
 *
 * Kısıtlı, ve bu bir tercih değil düzeltme: `Glob`/`Grep` verilen bir ajan
 * çalışma dizininden yukarı çıkabiliyor. `claude-haiku-4-5` iki koşuda da
 * çıktı, deponun kendi `src/` dizinini buldu ve çözümü oraya yazdı. Hücre
 * boş kaldığı için koşu ÖLÇÜLEMEDİ göründü ve dosya operatörün ağacında
 * kaldı (`.skein/runs/` yok sayılıyor, `src/` sayılmıyor).
 *
 * Üretim için bu üçü yetiyor: seed dosyalarının listesi zaten görev
 * metninde. Dört hücrede de aynı olduğu için karşılaştırmayı bozmuyor.
 */
export const BENCH_TOOLS = ["Read", "Write", "Edit"];

function adapterEnv(): { permissionMode?: string; allowedTools?: string[] } {
  const mode = process.env["SKEIN_PERMISSION_MODE"]?.trim();
  const tools = process.env["SKEIN_ALLOWED_TOOLS"]?.split(",").map((t) => t.trim()).filter(Boolean);
  return {
    ...(mode ? { permissionMode: mode } : {}),
    allowedTools: tools && tools.length > 0 ? tools : BENCH_TOOLS,
  };
}

function announceEnv(): void {
  const e = adapterEnv();
  if (e.permissionMode) console.log(`izin modu: ${e.permissionMode}`);
  if (e.allowedTools) console.log(`araçlar  : ${e.allowedTools.join(" ")}`);
}
const LOG = join(REPO, ".skein/events.jsonl");
const rel = (p: string) => p.slice(REPO.length + 1);

async function report(taskFilter?: string): Promise<void> {
  const { events: all, malformed } = await readEvents(LOG);
  if (all.length === 0) {
    console.log("Günlük boş. Önce bir koşu yap: cli.ts <görev-id>");
    return;
  }
  const events = taskFilter === undefined ? all : filterByTask(all, taskFilter);
  if (events.length === 0) {
    console.log(`Günlükte "${taskFilter}" görevine ait koşu yok.`);
    return;
  }
  if (taskFilter !== undefined) console.log(`yalnızca ${taskFilter}\n`);
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
      `${formatUsage(c.usage)}  ·  exit=${c.exitCode ?? "?"}  ·  prompt ${c.promptHash?.slice(0, 12)}…`);
  }
  console.log(`\n  toplam: ${formatUsage(s.usage)}  ·  ${(s.totalDurationMs / 1000).toFixed(1)}s`);
  printEffect(effectReport(events));
  printNoise(noiseReport(events));
}

/**
 * Tur kaydedicisi — her turun sonundaki artefaktı saklar ve günlüğe düşer.
 *
 * Ekrana basılan satır kasıtlı olarak kısa: "hangi dosyada kaç satır"
 * yeter, tam fark diskte duruyor ve `cli.ts turlar` ile okunuyor.
 */
function recorderFor(log: EventLog, cellDir: string): TurnRecorder {
  return new TurnRecorder(join(cellDir, "turlar"), async (snapshot, diff) => {
    await log.append({
      type: "artifact.snapshot",
      cell: rel(cellDir),
      turn: snapshot.turn,
      label: snapshot.label,
      path: rel(snapshot.dir),
      fingerprint: snapshot.fingerprint,
      files: snapshot.files.length,
      changed: diff?.changes.length ?? 0,
      addedLines: diff?.addedLines ?? 0,
      removedLines: diff?.removedLines ?? 0,
    });
    if (diff !== null) {
      const what = diff.changes.length === 0
        ? "hiçbir dosya değişmedi"
        : diff.changes.map((c) => `${c.path} (${c.kind}, +${c.addedLines}/−${c.removedLines})`).join(", ");
      console.log(`  tur ${snapshot.turn} (${snapshot.label}): ${what}`);
    }
  });
}

async function run(taskId: string, provider: string, model: string, audit: boolean): Promise<void> {
  const task = await loadTask(join(REPO, "bench/tasks", taskId));
  // Adaptör FABRİKADAN kuruluyor: sağlayıcıların tek kaynağı orası
  // (`KNOWN_PROVIDERS`). Burada elle kurulan kayıt defterinde yalnızca
  // claude vardı, yani CLI `cli.ts <görev> codex gpt-5.5` diye BELGELENMİŞ
  // olduğu hâlde "Bilinmeyen sağlayıcı: codex" diyordu. Aynı sınıf kusuru 6d
  // kolunda da yaşadık: adaptörü iki ayrı yoldan kurmak, yollardan birini
  // sessizce eksik bırakıyor.
  const adapter: Adapter = adapterFor(`${provider}:${model}`, adapterEnv());

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  // Dizin adı sağlayıcı ve modelden kuruluyor, `adapter.id`'den DEĞİL:
  // fabrika `id`'yi model tanımının tamamı yapıyor (`codex:gpt-5.5`) ve iki
  // nokta Windows'ta geçersiz. Eski adlandırma biçimi korunuyor
  // (`claude--claude-opus-5`) ki geçmiş koşuların dizinleriyle aynı kalsın.
  const cellDir = join(REPO, ".skein/runs", runId, task.id,
    `${safeName(provider)}--${safeName(model)}`);
  await mkdir(join(REPO, ".skein"), { recursive: true });
  const log = new EventLog(LOG, runId);

  console.log(`görev    : ${task.id} — ${task.title}`);
  console.log(`üretici  : ${provider} / ${adapter.model}`);
  console.log(`hücre    : ${rel(cellDir)}`);
  announceEnv();
  console.log();

  await log.append({ type: "run.started", taskId: task.id });

  const recorder = recorderFor(log, cellDir);

  console.log("üretim koşuyor…");
  const p = await produce({
    task, adapter, cellDir,
    layers: [{ name: "produce", path: join(REPO, "bench/prompts/produce.md") }],
    timeoutMs: 10 * 60_000, repo: REPO, recorder,
  });
  await log.append({
    type: "agent.started", cell: rel(cellDir), role: "uretici",
    provider, model: adapter.model, promptHash: p.promptHash,
  });
  const finished = {
    type: "agent.finished" as const, cell: rel(cellDir),
    exitCode: p.invoke.exitCode, durationMs: p.invoke.durationMs,
    ...(p.invoke.usage ? { usage: p.invoke.usage } : {}),
    ...(p.invoke.timedOut ? { timedOut: true } : {}),
  };
  await log.append(finished);

  // Dolar yoksa token basılıyor: abonelik kimliğiyle koşan bir sağlayıcıda
  // satır tamamen boş kalıyordu ve koşunun ölçüsü hiç görünmüyordu.
  console.log(`  exit=${p.invoke.exitCode} süre=${(p.invoke.durationMs / 1000).toFixed(1)}s` +
    `  ${formatUsage(totalUsage([p.invoke.usage]))}`);
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
      maxRounds: 4, timeoutMs: 10 * 60_000, recorder,
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
    console.error(`  ÖLÇÜLEMEDİ — ${diagnose(p.entryWritten, p.filesWritten, task.entry, p.escapedTo)}`);
    console.error("  Bu 'sıfır kırmızı' DEĞİLDİR.");
    console.error((h.stderr || h.raw).slice(0, 600));
    process.exit(1);
  }

  console.log(`\n  ${h.hooks.length - h.red.length}/${h.hooks.length} kanca yeşil, ${h.red.length} KIRMIZI\n`);
  for (const hook of h.hooks) console.log(`  ${hook.passed ? "✓" : "✗"} ${hook.title}`);
  console.log(`\ngünlük: ${rel(LOG)}  (özet için: cli.ts report)`);
}

/**
 * 6d ölçümü: planlama açık/kapalı iki kol, aynı görev, k tekrar.
 *
 * Kolların TEK farkı planlama turu; rol promptları, anayasa, ret politikası
 * ve kod taşıma birebir aynı (`hub/flows/ab-*.yaml`). Her koşu kendi kum
 * havuzu deposunda çalışıyor — ajanların ürettiği çözüm bu projeye
 * yazılmaz.
 */
/**
 * Ölçüm gücü ön kontrolü: YALNIZCA kontrol kolunu koşar.
 *
 * 6d kampanyasının üçüncü bulgusundan geliyor. Hücreler tek ajanlı
 * `produce` yolunun eşik tablosuna göre seçilmişti; AB kolları ise
 * koder+reviewer zinciri ve zincirdeki denetçi kusurların çoğunu
 * yakalıyor. `snapshot-store × sonnet` böyle seçilmiş ve kontrol kolu
 * 16/16 yeşil vermişti: ölçüm gücü yok, karar zorunlu olarak YETERSİZ.
 *
 * Kontrol kolunda kırmızı kanca yoksa "azalma" tanımsızdır — yani o
 * hücreye harcanacak her tekrar boşa gider. Bu komut o soruyu tek kolla
 * ve deney kolunun bedelini ödemeden cevaplıyor.
 */
async function kalibre(taskId: string, modelSpec: string): Promise<void> {
  await mkdir(join(REPO, ".skein"), { recursive: true });
  const adapters = armAdapters(modelSpec, adapterEnv());
  const adapter = [...adapters.values()][0] as Adapter;

  console.log(`ölçüm gücü ön kontrolü — ${taskId} · ${adapter.model}`);
  console.log("yalnızca KONTROL kolu (ab-plansiz) koşuyor");
  announceEnv();
  console.log();

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runId = `kalibre-${taskId}-${stamp}`;
  const r = await runArm({
    repo: REPO, taskId, arm: "plansiz",
    sandbox: join(REPO, ".skein", "kalibre", runId),
    adapters, logPath: LOG, runId, timeoutMs: 15 * 60_000,
    onSweep: (sweep) => {
      for (const { role, result } of sweep.results) {
        if (result.status !== "idle") console.log(`   ${role}: ${result.status}`);
      }
    },
  });

  console.log();
  if (!r.ran) {
    console.log(`  ÖLÇÜLEMEDİ — kol düştü${r.escalation === undefined ? "" : `: ${r.escalation}`}`);
    console.log("  Bu 'kusur yok' DEĞİL. Kolu düşüren sebebi gider ve tekrar koş.");
    return;
  }
  console.log(`  ${r.total - r.red.length}/${r.total} yeşil  ·  ${r.activations} aktivasyon  ` +
    `·  $${r.costUsd.toFixed(4)}`);
  if (r.red.length === 0) {
    console.log("\n  ÖLÇEMEZ — kontrol kolunda hiç kırmızı kanca yok.");
    console.log("  Sıfırdan azalma olmaz: bu hücreye harcanan her tekrar boşa gider.");
    console.log("  Daha zayıf bir üretici ya da daha zor bir görev dene.");
    return;
  }
  console.log(`\n  ÖLÇER — ${r.red.length} kırmızı kanca: ${r.red.join("; ")}`);
  console.log(`  Sıradaki: cli.ts planab ${taskId} --k=3 --model=${modelSpec}`);
}

async function planab(
  taskId: string, k: number, modelSpec: string,
  /**
   * Yalnızca bu kolu koş. Verilmezse ikisi.
   *
   * Kolları ayrı koşturmak koşum ortamının gereği: bir tekrar (iki kol)
   * dokuz dakikayı aşıyor ve bu oturumun arka plan komutu 10 dakikada
   * kesiliyor; üstelik konteyner, oturum boşta kalınca geri alınıyor ve
   * ayrık süreç onu aşamıyor. Tek kol ~2-6 dakika, yani pencereye sığıyor.
   *
   * Ölçüme etkisi yok: grup ölçülmüş KOŞU sayar, komutun kaç kol
   * koşturduğunu saymaz.
   */
  kol?: Arm,
  /** Yarıda kesilmiş EN YENİ kum havuzunu kaldığı yerden sürdür. */
  devam = false,
): Promise<void> {
  await mkdir(join(REPO, ".skein"), { recursive: true });
  const adapters = armAdapters(modelSpec, adapterEnv());
  const adapter = [...adapters.values()][0] as Adapter;

  console.log(`6d ölçümü — ${taskId} · ${adapter.model} · k=${k}`);
  console.log(`kollar: ${ARM_FLOW.plansiz} (kontrol) ve ${ARM_FLOW.planli} (deney)`);
  announceEnv();
  console.log();

  const kokDizin = join(REPO, ".skein", "olcum");

  if (devam) {
    const kolAdi = kol ?? "planli";
    const onek = `ab-${taskId}-${kolAdi}-`;
    const adaylar = (await readdir(kokDizin).catch(() => [] as string[]))
      .filter((d) => d.startsWith(onek))
      .sort();
    const sonKum = adaylar[adaylar.length - 1];
    if (sonKum === undefined) {
      console.error(`sürdürülecek kum havuzu yok: ${onek}*`);
      process.exit(1);
    }
    console.log(`── sürdürülüyor · ${kolAdi} · ${sonKum} ──`);
    const r = await runArm({
      repo: REPO, taskId, arm: kolAdi, sandbox: join(kokDizin, sonKum),
      adapters, logPath: LOG, runId: sonKum, resume: true, timeoutMs: 15 * 60_000,
      onSweep: (sweep) => {
        for (const { role, result } of sweep.results) {
          if (result.status !== "idle") console.log(`   ${role}: ${result.status}`);
        }
      },
    });
    console.log(
      `   ${r.ran ? `${r.total - r.red.length}/${r.total} yeşil` : "ÖLÇÜLEMEDİ"}` +
        (r.red.length > 0 ? `  ← kusur: ${r.red.join("; ")}` : "") +
        `  ·  ${r.activations} aktivasyon  ·  $${r.costUsd.toFixed(4)}` +
        (r.planning === undefined
          ? ""
          : `  ·  alışveriş: ${r.planning.objections} itiraz, ${r.planning.accepted} kabul`),
    );
    if (r.cardState !== "done") console.log(`   ⚠ kart \`${r.cardState}\` durumunda kaldı`);
    console.log("\nSıradaki: cli.ts planrapor");
    return;
  }
  for (let i = 1; i <= k; i += 1) {
    for (const arm of (kol === undefined ? ["plansiz", "planli"] : [kol]) as Arm[]) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const runId = `ab-${taskId}-${arm}-${i}-${stamp}`;
      const sandbox = join(kokDizin, runId);
      console.log(`── tekrar ${i} · ${arm} ──`);
      const r = await runArm({
        repo: REPO, taskId, arm, sandbox, adapters, logPath: LOG, runId,
        timeoutMs: 15 * 60_000,
        onSweep: (sweep) => {
          for (const { role, result } of sweep.results) {
            if (result.status !== "idle") console.log(`   ${role}: ${result.status}`);
          }
        },
      });
      console.log(
        `   ${r.ran ? `${r.total - r.red.length}/${r.total} yeşil` : "ÖLÇÜLEMEDİ"}` +
          (r.red.length > 0 ? `  ← kusur: ${r.red.join("; ")}` : "") +
          `  ·  ${r.activations} aktivasyon  ·  $${r.costUsd.toFixed(4)}` +
          (r.rejects > 0 ? `  ·  ${r.rejects} ret` : "") +
          (r.planning === undefined
            ? ""
            : `  ·  alışveriş: ${r.planning.objections} itiraz, ` +
              `${r.planning.accepted} kabul${r.planning.invalid > 0 ? `, ${r.planning.invalid} sayılmadı` : ""}`),
      );
      if (r.cardState !== "done") {
        console.log(`   ⚠ kart \`${r.cardState}\` durumunda kaldı` +
          (r.escalation === undefined ? "" : `\n     sebep: ${r.escalation}`));
      }
    }
  }

  console.log("\nSıradaki: cli.ts planrapor");
}

/** 6d raporu: kol tabloları, göreli azalma ve önceden ilan edilmiş karar. */
async function planrapor(): Promise<void> {
  const { events } = await readEvents(LOG);
  const report = planEffect(events);
  if (report.groups.length === 0) {
    console.log("Ölçülmüş kol koşusu yok. Önce: cli.ts planab <görev-id>");
    return;
  }
  printPlanEffect(report);
}

function printPlanEffect(r: PlanEffectReport): void {
  const pct = (n: number | null): string => (n === null ? "—" : `%${(n * 100).toFixed(0)}`);
  for (const g of r.groups) {
    console.log(`\n=== ${g.taskId} × ${g.model}  ·  k=${g.repeats} ===`);
    console.log("  kol        koşu  kanca  kırmızı   oran   aktivasyon   maliyet   ret");
    for (const [ad, s] of [["plansız", g.plansiz], ["planlı", g.planli]] as const) {
      if (s === null) continue;
      console.log(`  ${ad.padEnd(10)}${String(s.runs).padStart(4)}${String(s.hooks).padStart(7)}` +
        `${String(s.red).padStart(9)}${pct(s.redRate).padStart(7)}${String(s.activations).padStart(13)}` +
        `${("$" + s.costUsd.toFixed(2)).padStart(10)}${String(s.rejects).padStart(6)}` +
        (s.unmeasured > 0 ? `   (${s.unmeasured} ÖLÇÜLEMEDİ)` : ""));
    }
    if (g.relativeReduction !== null) {
      console.log(`  göreli azalma: ${pct(g.relativeReduction)}`);
    }
    if (g.perRun.length > 1) {
      console.log(`  koşu başına: ${g.perRun.map((x) => pct(x.relativeReduction)).join(", ")}`);
    }
    const c = g.ceremony;
    if (c.exchanges > 0) {
      // Tören ölçüsü: itiraz hiç çıkmıyorsa mekanizma ikinci bir çift göz
      // olabilir ama itiraz üretmiyor.
      console.log(`  alışveriş: ${c.exchanges} tur · ${c.withoutObjection} itirazsız ` +
        `(${pct(c.withoutObjection / c.exchanges)}) · ${c.objections} itiraz, ${c.accepted} kabul` +
        (c.invalid > 0 ? `, ${c.invalid} sayılmadı` : ""));
    }
    // Kanca KİMLİĞİ: sayının göremediği kusur kayması. `yalnizPlanli` boş
    // değilse, "daha az kusur" ile "daha iyi ürün" aynı şey değil.
    const h = g.hooks;
    if (h.plansiz.length > 0 || h.planli.length > 0) {
      // Sıfır sayının yanına etiket basmak ("0 yalnız planlıda (planlama
      // GETİRDİ)") olmayan bir şeyi varmış gibi okutuyor; etiket yalnızca
      // sayı varsa çıkıyor.
      const kimlik = (sayi: number, ad: string, etiket: string): string =>
        sayi > 0 ? `${sayi} ${ad} (${etiket})` : `${sayi} ${ad}`;
      console.log(`  kusur kimliği: ${h.ortak.length} ortak · ` +
        `${kimlik(h.yalnizPlansiz.length, "yalnız kontrolde", "planlama çözdü")} · ` +
        `${kimlik(h.yalnizPlanli.length, "yalnız planlıda", "planlama GETİRDİ")}`);
      if (h.yalnizPlanli.length > 0) {
        console.log(`    ⚠ planlamanın getirdiği: ${h.yalnizPlanli.join("; ")}`);
      }
      // Kontrol kolu her koşuda aynı kancaları düşürüyorsa hücre kararlı.
      const kararli = h.herKosudaPlansiz.length === h.plansiz.length && h.plansiz.length > 0;
      console.log(`    kontrol kolu ${kararli ? "KARARLI" : "değişken"}: ` +
        `${h.herKosudaPlansiz.length}/${h.plansiz.length} kanca her koşuda`);
    }
    console.log(`  karar: ${g.verdict.code.toUpperCase()} — ${g.verdict.reason}`);
  }
  console.log(`\n  KARAR: ${r.verdict.code.toUpperCase()}`);
  console.log(`  ${r.verdict.reason}`);
}

/**
 * Bir sağlayıcı CLI'ının gerçekten çağrılabildiğini doğrular.
 *
 * Codex adaptörünün bayrakları, codex'in KURULU OLMADIĞI bir makinede
 * yazıldı. CONTRACT.md "bayrakları doğrulayarak yaz" diyor; bu komut o
 * doğrulamayı senin makinene taşıyor.
 */
/**
 * Turları ve turlar arası farkı okur.
 *
 * Kaldırdığı sınır: "denetim turunda tam olarak ne değişti" sorusu, ajan
 * dosyayı yerinde değiştirdiği için SON artefakta bakıp çıkarsanıyordu.
 * Artık her turun kopyası diskte; bu komut kopyaları karşılaştırıyor,
 * günlüğün özetini değil — özet yanlış yazılmış olsa bile fark doğru kalır.
 */
async function turlar(cellFilter: string | undefined, showDiff: boolean): Promise<void> {
  const { events } = await readEvents(LOG);
  const snaps = events.filter((e) => e.type === "artifact.snapshot");
  if (snaps.length === 0) {
    console.log("Günlükte anlık görüntü yok. Turlar `cli.ts <görev-id>` ve `matrix` koşularında saklanıyor.");
    return;
  }

  const all = [...new Set(snaps.map((e) => e.cell))];
  const cells = all.filter((c) => cellFilter === undefined || c.includes(cellFilter));
  if (cells.length === 0) {
    console.log(`"${cellFilter ?? ""}" ile eşleşen hücre yok. Hücreler:`);
    for (const c of all) console.log(`  ${c}`);
    return;
  }

  for (const cell of cells) {
    const own = snaps.filter((e) => e.cell === cell).sort((a, b) => a.turn - b.turn);
    console.log(`\n=== ${cell} ===`);
    let prev: Snapshot | undefined;
    for (const e of own) {
      const snapshot = await loadSnapshot(join(REPO, e.path), e.turn, e.label);
      // Kopyanın parmak izi günlüktekiyle tutmuyorsa, tur dizini koşudan
      // sonra değişmiş demektir; fark yine hesaplanır ama artık koşunun
      // kaydı değildir ve bunu söylemeden geçmek yanıltıcı olur.
      if (snapshot.fingerprint !== e.fingerprint) {
        console.log(`  ! tur ${e.turn}: kopyanın parmak izi günlüktekiyle tutmuyor`);
      }
      const diff = prev === undefined ? null : await diffSnapshots(prev, snapshot);
      if (diff === null) {
        console.log(`  tur ${e.turn} (${e.label}): ${snapshot.files.length} dosya — başlangıç`);
      } else if (diff.changes.length === 0) {
        // Denetim kapısının kabul turu tam olarak burası: ajan koştu ve
        // hiçbir şey değiştirmedi. Mekanizmanın tören mi gerçek mi olduğu
        // bu satırdan okunuyor.
        console.log(`  tur ${e.turn} (${e.label}): HİÇBİR ŞEY DEĞİŞMEDİ`);
      } else {
        console.log(`  tur ${e.turn} (${e.label}): ${diff.changes.length} dosya, ` +
          `+${diff.addedLines}/−${diff.removedLines}`);
        for (const c of diff.changes) {
          console.log(`      ${c.kind.padEnd(8)} ${c.path}  +${c.addedLines}/−${c.removedLines}`);
        }
        if (showDiff && prev !== undefined) await printDiff(prev, snapshot, diff);
      }
      prev = snapshot;
    }
  }
}

/** Değişen dosyaların satır satır farkı; uzun farklar kırpılır. */
async function printDiff(before: Snapshot, after: Snapshot, diff: SnapshotDiff): Promise<void> {
  const LIMIT = 60;
  for (const c of diff.changes) {
    const oldText = c.kind === "eklendi" ? "" : await readFile(join(before.dir, c.path), "utf8");
    const newText = c.kind === "silindi" ? "" : await readFile(join(after.dir, c.path), "utf8");
    const d = diffLines(oldText, newText);
    console.log(`\n      --- ${c.path}`);
    const lines = [...d.removed.map((l) => `−${l}`), ...d.added.map((l) => `+${l}`)];
    for (const l of lines.slice(0, LIMIT)) console.log(`      ${l}`);
    if (lines.length > LIMIT) console.log(`      … ${lines.length - LIMIT} satır daha`);
  }
  console.log();
}

async function doctor(spec: string): Promise<void> {
  const adapter = adapterFor(spec, adapterEnv());
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
  // Maliyet YOKSA token basılıyor. Codex'i ChatGPT aboneliğiyle koşturmak
  // `total_cost_usd` üretmiyor: dolar alanı boş kalıyor ve doctor "çalıştı
  // ama hiçbir şey ölçemedim" gibi görünüyordu. Token sayısı, modelin
  // gerçekten çağrıldığının kanıtı ve çapraz satıcı karşılaştırmasında
  // doların yerini tutan tek ortak birim.
  const olcu = r.usage?.costUsd !== undefined
    ? `  maliyet=$${r.usage.costUsd.toFixed(4)}`
    : r.usage?.inputTokens !== undefined || r.usage?.outputTokens !== undefined
      ? `  token=${r.usage.inputTokens ?? "?"}→${r.usage.outputTokens ?? "?"} (dolar maliyeti yok: abonelik kimliği)`
      : "  ÖLÇÜ YOK: ne maliyet ne token okunabildi";
  console.log(`  exit=${r.exitCode}  süre=${(r.durationMs / 1000).toFixed(1)}s${olcu}`);
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
    // Başarısızlığın sebebini söylemek doctor'ın tek işi. "Bayraklar yanlış
    // olabilir" her durumda basılıyordu ve gerçek bir koşuda yanılttı:
    // bayraklar doğruydu, çağrıyı kurumsal vekil 403 ile kesmişti.
    const ag = networkFailure(`${r.stderr}\n${r.stdout}`);
    if (ag !== undefined) {
      console.error(`\n  ÇALIŞMIYOR — ama bayraklar yüzünden değil: ${ag}`);
      console.error("  CLI argümanları kabul etti; çağrı ağ katmanında durdu.");
      console.error("  Bu makinenin ağ politikası sağlayıcıya çıkışa izin vermiyor olabilir.");
    } else {
      console.error("\n  ÇALIŞMIYOR. Bayraklar yanlış olabilir — `codex --help` çıktısına bakıp");
      console.error("  src/adapters/codex.ts içindeki DEFAULT_ARGS'ı düzelt (TypeScript bilmeden de olur).");
    }
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


/**
 * Her görevin kancalarını referans çözümüne karşı koşar.
 *
 * Ajan çağrılmaz, para harcanmaz. Görev seti büyürken tek koruma bu:
 * doğru bir çözümle de kırmızı kalan kanca bozuk testtir ve her hücrede
 * kırmızı çıkıp "kaçırma" metriğini sessizce şişirir.
 */
async function selftest(taskId?: string): Promise<void> {
  const taskRoot = join(REPO, "bench/tasks");
  const ids = taskId ? [taskId] : (await readdir(taskRoot, { withFileTypes: true }))
    .filter((e) => e.isDirectory()).map((e) => e.name).sort();

  let bad = 0;
  for (const id of ids) {
    const task = await loadTask(join(taskRoot, id));
    const r = await selfTest(task, REPO);
    if (!r.hasReference) {
      console.log(`  ?  ${id.padEnd(16)} referans çözüm yok (hidden/reference/) — kancalar kanıtsız`);
      bad++;
      continue;
    }
    if (!r.ran) {
      console.log(`  ✗  ${id.padEnd(16)} süit koşmadı — referans derlenmiyor olabilir`);
      console.log(`     ${r.stderr.slice(0, 300)}`);
      bad++;
      continue;
    }
    if (r.red.length > 0) {
      console.log(`  ✗  ${id.padEnd(16)} ${r.red.length}/${r.total} kanca BOZUK — doğru çözümle de kırmızı:`);
      for (const t of r.red) console.log(`       ${t}`);
      bad++;
      continue;
    }
    console.log(`  ✓  ${id.padEnd(16)} ${r.total} kanca, referansla hepsi yeşil`);
  }
  if (bad > 0) {
    console.error(`\n${bad} görev kanca doğrulamasını geçemedi.`);
    process.exit(1);
  }
}

async function matrix(taskId: string, a: string, b: string, force: boolean): Promise<void> {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  await mkdir(join(REPO, ".skein"), { recursive: true });
  const log = new EventLog(LOG, runId);
  await log.append({ type: "run.started", taskId });

  console.log(`2x2 çapraz kurgu — ${a}  ×  ${b}`);
  announceEnv();
  console.log();
  const out = await runMatrix({
    repo: REPO, taskId, models: [a, b],
    runRoot: join(REPO, ".skein/runs", runId), log, timeoutMs: 10 * 60_000, force,
    adapter: adapterEnv(),
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
    console.log(`  ${c.producer} üretti → ${c.reviewer} inceledi  ${c.crossed ? "ÇAPRAZ" : "aynı  "}  ` +
      `${c.reviewPath}  ·  ${formatUsage(c.usage)}`);
  }
  // Toplam dolar olarak basılamıyor: hücrelerin bir kısmı abonelik
  // kimliğiyle koşmuşsa dolar bildirmiyor ve `?? 0` ile toplamak eksik bir
  // toplamı tam gibi gösterirdi. `formatUsage` neyin bilinmediğini söylüyor.
  const toplam = [...out.producers.map((p) => p.usage), ...out.cells.map((c) => c.usage)]
    .reduce((a, b) => sumUsage(a, b), {});
  console.log(`\n  toplam: ${formatUsage(toplam)}`);
  console.log("\nSıradaki: cli.ts puanla — kanıtlanmış kusuru hangi hücreler yakaladı?");
}

/**
 * Denetim raporlarını kanıtlanmış kusurlara karşı puanlar.
 *
 * Deneyin ana metriği (kaçırma) ancak buradan çıkıyor. Elle okunsaydı,
 * raporu okuyan kişi hangi hücrenin çapraz olduğunu bilerek okurdu; hakem
 * onu görmüyor ve her "yakaladı" iddiası raporda birebir bulunması gereken
 * bir alıntıya bağlı.
 */
async function puanla(judgeSpec: string, rescore: boolean, dry: boolean): Promise<void> {
  const { events } = await readEvents(LOG);
  if (events.length === 0) {
    console.log("Günlük boş. Önce bir matris koş: cli.ts matrix <görev-id> A B");
    return;
  }
  const { targets, skipped } = scoreTargets(events, { rescore });
  for (const s of skipped) console.log(`  atlandı  ${s.cell}\n           ${s.reason}`);
  if (targets.length === 0) {
    console.log("\nPuanlanacak hücre yok.");
    return;
  }

  // Hangi hücrelerin puanlanacağını görmek para harcamamalı: puanlama
  // pahalı denetim koşusundan SONRA geliyor ve yanlış hedef listesiyle
  // başlatılırsa o parayı ikinci kez harcatır.
  if (dry) {
    console.log(`\n${targets.length} hücre puanlanacak (kuru koşu, ajan çağrılmadı):`);
    for (const t of targets) {
      console.log(`  ${t.producer} → ${t.reviewer}  ${t.crossed ? "ÇAPRAZ" : "aynı  "}  ` +
        `${t.redHooks.length} kanıtlanmış kusur  ${t.cell}`);
    }
    return;
  }

  const judge = adapterFor(judgeSpec, adapterEnv());
  console.log(`\npuanlayıcı: ${judge.model} · ${targets.length} hücre · körlenmiş\n`);

  const out = await scoreAll({
    repo: REPO, judge, logPath: LOG, timeoutMs: 5 * 60_000,
    layers: [{ name: "judge", path: join(REPO, "bench/prompts/judge.md") }],
    targets,
    onCell: (t, r) => {
      const n = t.redHooks.length;
      console.log(`  ${t.producer} → ${t.reviewer}  ${t.crossed ? "ÇAPRAZ" : "aynı  "}  ` +
        `${r.caught.length}/${n} yakalandı` +
        (r.unverified.length > 0 ? `  (${r.unverified.length} alıntı doğrulanamadı)` : "") +
        (r.scrubbed > 0 ? `  · ${r.scrubbed} kimlik maskelendi` : ""));
      for (const m of r.missed) console.log(`      kaçırdı: ${m}`);
    },
  });

  for (const f of out.failed) console.log(`  PUANLANAMADI ${f.cell}\n      ${f.error}`);
  console.log(`\n  ${out.scored} hücre puanlandı · $${out.costUsd.toFixed(4)}`);
  console.log("  Sonuç için: cli.ts report [--gorev=<görev-id>]");
}

/** Hücre tablosu, etkileşim terimi ve önceden ilan edilmiş karar. */
/**
 * 2. YER GERÇEĞİ: raporun bulgularını gerçek / nit / yanlış diye ayırır.
 *
 * `puanla`dan ayrı bir komut, çünkü ayrı bir katman ve ayrı bir maliyet:
 * bu hakem kodu da okur (yanlış pozitif ancak kod okunarak söylenebilir) ve
 * hücre şartı farklıdır — kanıtlanmış kusur aranmaz. Sonuç karara girmez.
 */
async function siniflandir(judgeSpec: string, reclassify: boolean, dry: boolean): Promise<void> {
  const { events } = await readEvents(LOG);
  if (events.length === 0) {
    console.log("Günlük boş. Önce bir matris koş: cli.ts matrix <görev-id> A B");
    return;
  }
  const { targets, skipped } = classifyTargets(events, { reclassify });
  for (const s of skipped) console.log(`  atlandı  ${s.cell}\n           ${s.reason}`);
  if (targets.length === 0) {
    console.log("\nSınıflanacak hücre yok.");
    return;
  }

  if (dry) {
    console.log(`\n${targets.length} hücre sınıflanacak (kuru koşu, ajan çağrılmadı):`);
    for (const t of targets) {
      console.log(`  ${t.producer} → ${t.reviewer}  ${t.crossed ? "ÇAPRAZ" : "aynı  "}  ` +
        `${t.redHooks.length} kanıtlanmış kusur  ${t.cell}`);
    }
    return;
  }

  const judge = adapterFor(judgeSpec, adapterEnv());
  console.log(`\nsınıflayıcı: ${judge.model} · ${targets.length} hücre · körlenmiş (kod dahil)\n`);

  const out = await classifyAll({
    repo: REPO, judge, logPath: LOG, timeoutMs: 5 * 60_000,
    layers: [{ name: "siniflandir", path: join(REPO, "bench/prompts/siniflandir.md") }],
    targets,
    onCell: (t, r) => {
      const c = r.counts;
      console.log(`  ${t.producer} → ${t.reviewer}  ${t.crossed ? "ÇAPRAZ" : "aynı  "}  ` +
        `${c.findings} bulgu: ${c.real} gerçek, ${c.nit} nit, ${c.wrong} yanlış` +
        (c.uncertain > 0 ? `, ${c.uncertain} belirsiz` : "") +
        (c.proven > 0 ? `  · ${c.proven} kanıtlı (1. katman)` : "") +
        (r.unverified > 0 ? `  · ${r.unverified} alıntı doğrulanamadı` : ""));
    },
  });

  for (const f of out.failed) console.log(`  SINIFLANAMADI ${f.cell}\n      ${f.error}`);
  console.log(`\n  ${out.classified} hücre sınıflandı · $${out.costUsd.toFixed(4)}`);
  console.log("  Sonuç için: cli.ts report");
}

function printSide(e: { pairs: PairScore[]; same: Side | null; crossed: Side | null;
  relativeReduction: number | null; interaction: number | null;
  perRun: { relativeReduction: number | null }[]; repeats: number }, indent: string): void {
  const pct = (n: number): string => `%${(n * 100).toFixed(0)}`;
  console.log(`${indent}üretici → denetçi                         hücre  kanca  kaçan   oran`);
  for (const p of [...e.pairs].sort((a, b) => Number(a.crossed) - Number(b.crossed))) {
    const who = `${p.producer} → ${p.reviewer}${p.crossed ? "  ÇAPRAZ" : ""}`;
    console.log(`${indent}${who.padEnd(42)}${String(p.cells).padStart(4)}` +
      `${String(p.hooks).padStart(7)}${String(p.missed).padStart(7)}` +
      `${pct(p.missRate).padStart(7)}`);
  }
  if (e.same && e.crossed) {
    console.log(`${indent}aynı  : ${e.same.missed}/${e.same.hooks} kaçtı (${pct(e.same.missRate)})` +
      `   çapraz: ${e.crossed.missed}/${e.crossed.hooks} kaçtı (${pct(e.crossed.missRate)})`);
  }
  if (e.relativeReduction !== null) {
    console.log(`${indent}göreli azalma: ${pct(e.relativeReduction)}`);
  }
  if (e.interaction !== null) {
    console.log(`${indent}etkileşim terimi: ${(e.interaction * 100).toFixed(1)} puan ` +
      "((AA+BB)/2 − (AB+BA)/2; pozitif = çeşitlilik lehine)");
  }
  if (e.repeats > 1) {
    const each = e.perRun
      .map((r) => (r.relativeReduction === null ? "—" : pct(r.relativeReduction)))
      .join(", ");
    console.log(`${indent}koşu başına azalma (k=${e.repeats}): ${each}`);
  }
}

/**
 * Önce gruplar, sonra havuz.
 *
 * Sıra kasıtlı: karar grup seviyesinde veriliyor ve havuzlanmış oran —
 * kanca sayıları eşit olmadığı için — bir görev sınıfındaki ters yönü
 * gizleyebiliyor. Havuz sayısını üste koymak, okuyanı yanlış sayıya
 * bakmaya davet ederdi.
 */
function printEffect(e: EffectReport): void {
  if (e.groups.length === 0) {
    console.log("\nPuanlanmış denetim hücresi yok (cli.ts puanla).");
    return;
  }
  for (const g of e.groups) {
    console.log(`\n=== ${g.taskId}  ·  ${g.models.join(" × ")}  ·  k=${g.repeats} ===`);
    printSide(g, "  ");
    console.log(`  karar: ${g.verdict.code.toUpperCase()} — ${g.verdict.reason}`);
  }
  if (e.groups.length > 1) {
    console.log("\n=== havuzlanmış (yalnızca bilgi; karar buradan çıkmaz) ===");
    printSide(e, "  ");
  }
  if (e.unverified > 0) {
    console.log(`\n  ! ${e.unverified} alıntı raporda bulunamadı — puanlayıcının kendi sağlığına bak`);
  }
  console.log(`\n  KARAR: ${e.verdict.code.toUpperCase()}`);
  console.log(`  ${e.verdict.reason}`);
}

/**
 * 2. katmanın çıktısı — kararın ALTINDA ve karardan ayrı.
 *
 * Yeri kasıtlı: karar nesnel katmandan çıkıyor ve bu tablo onun üstüne
 * konsaydı, okuyan ilk olarak itiraz edilebilir sayıyı görürdü.
 */
function printNoise(n: NoiseReport): void {
  if (n.groups.length === 0) return;
  const pct = (x: number | null): string => (x === null ? "—" : `%${(x * 100).toFixed(0)}`);
  const line = (label: string, s: NoiseSide | null): void => {
    if (s === null) return;
    console.log(`  ${label.padEnd(8)}${String(s.reports).padStart(5)}${String(s.findings).padStart(7)}` +
      `${String(s.real).padStart(8)}${pct(s.nitRate).padStart(7)}${pct(s.wrongRate).padStart(8)}` +
      `${(s.realPerReport ?? 0).toFixed(1).padStart(9)}`);
  };
  console.log("\n=== 2. katman: bulgu kalitesi (KARARA GİRMEZ) ===");
  console.log("  Hakem görüşü, test sonucu değil. Kanıtlanmış kusura ait bulgular");
  console.log("  bu tablonun dışında — onlar 1. katmanda sayıldı.");
  for (const g of n.groups) {
    console.log(`\n  ${g.taskId}  ·  ${g.models.join(" × ")}`);
    console.log("          rapor  bulgu  gerçek    nit   yanlış  gerçek/rapor");
    line("aynı", g.same);
    line("çapraz", g.crossed);
  }
  if (n.unverified > 0) {
    console.log(`\n  ! ${n.unverified} bulgunun alıntısı raporda bulunamadı — sayılmadı`);
  }
}

const argv = process.argv.slice(2);
const audit = argv.includes("--audit");
const force = argv.includes("--force");
const [cmd, ...rest] = argv.filter((a) => !a.startsWith("--"));
if (cmd === "report") {
  await report(argv.find((a) => a.startsWith("--gorev="))?.slice("--gorev=".length));
} else if (cmd === "doctor") {
  await doctor(rest[0] ?? "codex:gpt-5.5");
} else if (cmd === "planab") {
  const gorev = rest[0];
  if (gorev === undefined) {
    console.error("kullanım: cli.ts planab <görev-id> [--k 3] [--model claude:claude-sonnet-5] [--kol planli|plansiz] [--devam]");
    process.exit(2);
  }
  // Boşluklu biçim (`--k 1`) değeri konumsal argümanlara bırakıyor ve model
  // adı olarak okunuyordu; canlı koşuda model "1" oldu. Değer artık
  // konumsallardan ÇIKARILIYOR ve model yalnızca `sağlayıcı:model`
  // biçimindeyse konumsal kabul ediliyor.
  const deger = (ad: string): string | undefined => {
    const esit = argv.find((a) => a.startsWith(`${ad}=`));
    if (esit !== undefined) return esit.slice(ad.length + 1);
    const at = argv.indexOf(ad);
    return at === -1 ? undefined : argv[at + 1];
  };
  const tuketilen = new Set([deger("--k"), deger("--model"), deger("--kol")].filter((x) => x !== undefined));
  const konumsal = rest.slice(1).filter((a) => !tuketilen.has(a));
  const kolRaw = deger("--kol");
  if (kolRaw !== undefined && kolRaw !== "planli" && kolRaw !== "plansiz") {
    console.error(`--kol yalnızca \`planli\` ya da \`plansiz\` olabilir (verilen: ${kolRaw})`);
    process.exit(2);
  }
  await planab(
    gorev,
    Math.max(1, Number(deger("--k") ?? 3)),
    deger("--model") ?? konumsal.find((a) => a.includes(":")) ?? "claude:claude-sonnet-5",
    kolRaw as Arm | undefined,
    argv.includes("--devam"),
  );
} else if (cmd === "kalibre") {
  const gorev = rest[0];
  if (gorev === undefined) {
    console.error("kullanım: cli.ts kalibre <görev-id> [--model sağ:model]");
    process.exit(2);
  }
  const esit = argv.find((a) => a.startsWith("--model="));
  const at = argv.indexOf("--model");
  const model = esit !== undefined
    ? esit.slice("--model=".length)
    : at === -1 ? undefined : argv[at + 1];
  await kalibre(gorev, model ?? rest.slice(1).find((a) => a.includes(":")) ?? "claude:claude-sonnet-5");
} else if (cmd === "planrapor") {
  await planrapor();
} else if (cmd === "turlar") {
  await turlar(rest[0], argv.includes("--diff"));
} else if (cmd === "siniflandir") {
  await siniflandir(rest[0] ?? "claude:claude-opus-5", argv.includes("--yeniden"), argv.includes("--kuru"));
} else if (cmd === "puanla") {
  await puanla(rest[0] ?? "claude:claude-opus-5", argv.includes("--yeniden"), argv.includes("--kuru"));
} else if (cmd === "selftest") {
  await selftest(rest[0]);
} else if (cmd === "matrix") {
  await matrix(rest[0] ?? "retry-backoff", rest[1] ?? "claude:claude-opus-5", rest[2] ?? "claude:claude-sonnet-5", force);
} else if (cmd) {
  await run(cmd, rest[0] ?? "claude", rest[1] ?? "claude-opus-5", audit);
} else {
  console.error("kullanım: cli.ts <görev-id> [sağlayıcı] [model] [--audit]\n         cli.ts matrix <görev-id> [sağlayıcı:model] [sağlayıcı:model]\n         cli.ts doctor <sağlayıcı:model>\n         cli.ts puanla [hakem-modeli] [--kuru] [--yeniden]\n         cli.ts siniflandir [hakem-modeli] [--kuru] [--yeniden]\n         cli.ts selftest [görev-id]\n         cli.ts turlar [hücre-parçası] [--diff]\n         cli.ts kalibre <görev-id> [--model sağ:model]   (ölçüm gücü ön kontrolü)\n         cli.ts planab <görev-id> [--k 3] [--model sağ:model] [--kol planli|plansiz] [--devam]\n         cli.ts planrapor\n         cli.ts report [--gorev=<görev-id>]");
  process.exit(2);
}
