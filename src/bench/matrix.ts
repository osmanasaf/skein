import { mkdir, writeFile } from "node:fs/promises";
import { safeName } from "./safe-name.js";
import { totalUsage, type UsageTotal } from "./usage.js";
import { join } from "node:path";
import { adapterFor, type AdapterOptions } from "../adapters/factory.js";
import type { Adapter } from "../adapters/contract.js";
import type { EventLog } from "../events/log.js";
import { loadTask } from "./task.js";
import { produce } from "./produce.js";
import { runHidden } from "./hidden.js";
import { review } from "./review.js";
import { TurnRecorder } from "./snapshot.js";

export interface MatrixOptions {
  repo: string;
  taskId: string;
  /**
   * 2x2'nin iki köşesi, "sağlayıcı:model" biçiminde.
   * Farklı MODEL olmaları yeterli; satıcı ayrımı tezin daha güçlü hali.
   */
  /**
   * İki model: 2x2'nin dört hücresi bunların çarpımı.
   *
   * TEK model de geçerli ve kasıtlı: o zaman bir üretim + bir aynı-satıcı
   * denetim koşuyor, yani 2x2'nin ÖLÇÜM GÜCÜ ön kontrolü (`kalibre2x2`).
   * Ayrı bir koşucu yazmak aynı mantığın ikinci kopyası olurdu.
   */
  models: [string] | [string, string];
  runRoot: string;
  log: EventLog;
  timeoutMs: number;
  /** Ölçüm gücü olmasa bile denetim hücrelerini koştur. Varsayılan: false. */
  force?: boolean;
  /** Sağlayıcı CLI seçenekleri (izin modu, araçlar). Dört hücrede de aynı. */
  adapter?: AdapterOptions;
}

export interface CellOutcome {
  producer: string;
  reviewer: string;
  crossed: boolean;
  reviewPath: string;
  /**
   * Hücrenin ölçüsü: dolar VE token, ayrı ayrı.
   *
   * Eskiden `costUsd: number` idi ve `?? 0` ile dolduruluyordu. Çapraz
   * satıcıda bu yanlış bilgi üretiyor: abonelik kimliğiyle koşan bir
   * sağlayıcı dolar bildirmiyor, hücre `$0.0000` görünüyor ve bedava
   * sanılıyor. Ortak birim token.
   */
  usage: UsageTotal;
}

export interface MatrixOutcome {
  producers: {
    model: string; redHooks: string[]; total: number; ran: boolean; usage: UsageTotal;
    /**
     * Üretim çağrısının çıkış kodu.
     *
     * Sıfır değilse kancaların kırmızılığı KUSUR DEĞİL: ajan çökmüşse
     * artefakt boş kalıyor ve neredeyse her kanca kırmızı düşüyor — yani
     * başarısız bir üretim, ölçüm için en iyi hücre gibi görünüyor. Bu,
     * `kalibre2x2`yi olmayan bir modelle koşturunca ortaya çıktı.
     */
    exitCode: number;
  }[];
  cells: CellOutcome[];
  /** Denetim hücreleri neden atlandı; koştularsa undefined. */
  skipped?: string;
}

/**
 * 2x2 çapraz kurgu: her model hem üretir hem denetler.
 *
 * Naif iki hücreli tasarım "çeşitlilik etkisi" ile "denetçi gücü"nü
 * ayıramaz. Burada çeşitlilik, faktöriyelin etkileşim terimi olarak okunur
 * ve iki ana etkiye diktir (bench/DESIGN.md).
 *
 * Artefakt üretici başına BİR KEZ üretilir ve iki denetçiye birden verilir;
 * böylece aynı kodu inceleyen iki denetçi arasındaki fark kodun kendisinden
 * gelemez.
 */
/**
 * "Süit koşmadı" üç ayrı sebebi gizler: ajan hiç yazmamıştır, yanlış yere
 * yazmıştır, ya da derlenmeyen kod yazmıştır. Üçü farklı düzeltme gerektirir.
 */
export function diagnose(
  entryWritten: boolean,
  filesWritten: string[],
  entry: string,
  escapedTo?: string,
): string {
  // Kaçış önce söylenir: "hiçbir dosya yazmadı" teşhisi doğru ama eksik ve
  // operatörü yanlış yere bakmaya gönderir — asıl haber, dosyanın DEPOSUNA
  // düşmüş olması.
  if (escapedTo !== undefined) {
    return `ajan hücresinin DIŞINA yazdı: ${escapedTo}. ` +
      `Çözümü oraya yazdığı için hücre boş kaldı ve dosya deponun içinde duruyor — sil. ` +
      `Ajana Glob/Grep verilmişse çalışma dizininden yukarı çıkabiliyor.`;
  }
  if (filesWritten.length === 0) {
    return "ajan HİÇBİR dosya yazmadı (izin reddedilmiş ya da çağrı boşa dönmüş olabilir)";
  }
  if (!entryWritten) {
    return `ajan istenen dosyayı yazmadı. Beklenen: ${entry}. Yazılan: ${filesWritten.join(", ")}`;
  }
  return `dosya yazıldı (${filesWritten.join(", ")}) ama gizli süit koşmadı — kod derlenmiyor olabilir`;
}

const tail = (s: string): string => s.trim().slice(-200).replace(/\s+/g, " ");

/** Dosya adında kullanılamayacak karakterleri temizler. */
export interface ProducerSummary {
  model: string;
  ran: boolean;
  exitCode: number;
  redHooks: string[];
}

/**
 * Denetim hücreleri koşmalı mı; koşmamalıysa SEBEBİ.
 *
 * Denetim hücreleri pahalı ve yer gerçeği olmadan hiçbir şey ölçmezler, o
 * yüzden karar ÜRETİMDEN SONRA, denetimden önce veriliyor. Üç durum ayrı
 * tutuluyor çünkü üçü ayrı şey:
 *
 * 1. **Üretim ÇÖKTÜ** (`exitCode !== 0`). En pahalı yanılgı buydu: ajan
 *    çökünce artefakt boş kalıyor ve gizli süit neredeyse her kancayı
 *    kırmızı düşürüyor — yani çöp artefakt "ölçüm gücü en yüksek hücre"
 *    gibi görünüyor ve üstüne denetim parası harcanıyor. `kalibre2x2`
 *    ilk kez koşulduğunda tam bu oldu: üretim exit 1 verdi, denetim ve
 *    puanlama yine koştu.
 * 2. **Süit koşmadı** (`!ran`). Yer gerçeği yok; "kusur yok" DEĞİL.
 * 3. **Kusur yok.** Denetçilerin yakalayacağı bir şey olmadığı için dört
 *    hücre de aynı sonucu verir.
 *
 * Sıra önemli: çökmüş üretimin kırmızı kancaları 3. koşulu "geçiyor" gibi
 * görünür, o yüzden 1. koşul önce soruluyor.
 */
export function matrixSkip(producers: readonly ProducerSummary[]): string | undefined {
  const crashed = producers.filter((p) => p.exitCode !== 0);
  if (crashed.length > 0) {
    return `ÜRETİM ÇÖKTÜ: ${crashed.map((p) => `${p.model} (exit ${p.exitCode})`).join(", ")}. ` +
      `Kırmızı kancalar kusur değil, artefaktın yokluğu — denetim koşturmak parayı çöpe atar.`;
  }
  const unmeasured = producers.filter((p) => !p.ran);
  if (unmeasured.length > 0) {
    return `ÖLÇÜLEMEDİ: ${unmeasured.map((p) => p.model).join(", ")} için gizli süit hiç koşmadı. ` +
      `Bu "kusur yok" DEĞİLDİR — yer gerçeği yok, denetim puanlanamaz.`;
  }
  if (producers.every((p) => p.redHooks.length === 0)) {
    return `Ölçüm gücü yok: hiçbir üreticide kanıtlanmış kusur yok, denetçilerin ` +
      `yakalayacağı bir şey olmadığı için dört hücre de aynı sonucu verir.`;
  }
  return undefined;
}

export async function runMatrix(options: MatrixOptions): Promise<MatrixOutcome> {
  const { repo, taskId, models, runRoot, log, timeoutMs } = options;
  const task = await loadTask(join(repo, "bench/tasks", taskId));
  const rel = (p: string) => p.slice(repo.length + 1);

  const adapters: Adapter[] = models.map((spec) => adapterFor(spec, options.adapter ?? {}));
  const produced: {
    adapter: Adapter; artifactDir: string; redHooks: string[];
    total: number; ran: boolean; usage: UsageTotal; exitCode: number;
  }[] = [];

  for (const adapter of adapters) {
    const cellDir = join(runRoot, task.id, safeName(adapter.id));
    console.log(`üretim: ${adapter.model}`);
    // Üretim hücresinde iki tur kalıyor: "tohum" ve "uretim". `seed/` verilen
    // görevlerde ölçmek istediğimiz şey tam olarak ikisinin farkı — ajanın
    // mevcut kodda NEYİ değiştirdiği.
    const recorder = new TurnRecorder(join(cellDir, "turlar"), async (snapshot, diff) => {
      await log.append({
        type: "artifact.snapshot", cell: rel(cellDir),
        turn: snapshot.turn, label: snapshot.label, path: rel(snapshot.dir),
        fingerprint: snapshot.fingerprint, files: snapshot.files.length,
        changed: diff?.changes.length ?? 0,
        addedLines: diff?.addedLines ?? 0, removedLines: diff?.removedLines ?? 0,
      });
    });
    const p = await produce({
      task, adapter, cellDir,
      layers: [{ name: "produce", path: join(repo, "bench/prompts/produce.md") }],
      timeoutMs, repo, recorder,
    });
    await log.append({
      type: "agent.started", cell: rel(cellDir), role: "uretici",
      provider: adapter.id, model: adapter.model, promptHash: p.promptHash,
    });
    await log.append({
      type: "agent.finished", cell: rel(cellDir),
      exitCode: p.invoke.exitCode, durationMs: p.invoke.durationMs,
      ...(p.invoke.usage ? { usage: p.invoke.usage } : {}),
    });

    const h = await runHidden(task, cellDir, repo);
    await log.append({
      type: "hooks.measured", cell: rel(cellDir), ran: h.ran, total: h.hooks.length, red: h.red,
    });
    if (h.ran) {
      console.log(`  ${h.hooks.length - h.red.length}/${h.hooks.length} yeşil` +
        (h.red.length > 0 ? ` — kanıtlanmış kusur: ${h.red.join(", ")}` : " — kusur yok"));
    } else {
      console.log(`  ÖLÇÜLEMEDİ — ${diagnose(p.entryWritten, p.filesWritten, task.entry, p.escapedTo)}`);
      console.log(`    ajan çıktısı (son 200): ${tail(p.invoke.stdout || p.invoke.stderr)}`);
    }

    produced.push({
      adapter, artifactDir: p.artifactDir, redHooks: h.red, total: h.hooks.length, ran: h.ran,
      usage: totalUsage([p.invoke.usage]), exitCode: p.invoke.exitCode,
    });
  }

  // Denetim hücreleri pahalı ve yer gerçeği olmadan hiçbir şey ölçmezler.
  // Ölçülemeyen ya da kusursuz bir üretim üzerinde denetim koşturmak, parayı
  // sonuç üretmeyecek bir koşuya harcamaktır. Bu koruma tek koşu yolunda
  // vardı ama matriste yoktu ve gerçek bir koşuda "0/0 yeşil — kusur yok"
  // diye raporlanıp dört denetim boşa koştu.
  const skipped = matrixSkip(produced.map((p) => ({
    model: p.adapter.model, ran: p.ran, exitCode: p.exitCode, redHooks: p.redHooks,
  })));

  if (skipped !== undefined && options.force !== true) {
    console.log(`\n${skipped}`);
    console.log("Denetim hücreleri atlandı (yine de koşmak için --force).");
    return {
      producers: produced.map((p) => ({
        model: p.adapter.model, redHooks: p.redHooks, total: p.total, ran: p.ran,
        usage: p.usage, exitCode: p.exitCode,
      })),
      cells: [],
      skipped,
    };
  }

  const cells: CellOutcome[] = [];
  for (const prod of produced) {
    for (const rev of adapters) {
      const crossed = prod.adapter.id !== rev.id;
      const workdir = join(runRoot, task.id, "denetim", `${safeName(prod.adapter.id)}--by--${safeName(rev.id)}`);
      await mkdir(workdir, { recursive: true });
      console.log(`denetim: ${prod.adapter.model} üretti, ${rev.model} inceliyor ${crossed ? "(ÇAPRAZ)" : "(aynı)"}`);

      const r = await review({
        task, artifactDir: prod.artifactDir, reviewer: rev, workdir,
        layers: [{ name: "review", path: join(repo, "bench/prompts/review.md") }],
        timeoutMs,
      });
      const reviewPath = join(workdir, "rapor.txt");
      await writeFile(reviewPath, r.text);

      await log.append({
        type: "review.done", cell: rel(workdir),
        producer: prod.adapter.model, reviewer: rev.model, crossed,
        promptHash: r.promptHash, path: rel(reviewPath),
      });
      await log.append({
        type: "agent.finished", cell: rel(workdir),
        exitCode: r.invoke.exitCode, durationMs: r.invoke.durationMs,
        ...(r.invoke.usage ? { usage: r.invoke.usage } : {}),
      });

      cells.push({
        producer: prod.adapter.model, reviewer: rev.model, crossed,
        reviewPath: rel(reviewPath), usage: totalUsage([r.invoke.usage]),
      });
    }
  }

  return {
    producers: produced.map((p) => ({
      model: p.adapter.model, redHooks: p.redHooks, total: p.total, ran: p.ran,
      usage: p.usage, exitCode: p.exitCode,
    })),
    cells,
  };
}
