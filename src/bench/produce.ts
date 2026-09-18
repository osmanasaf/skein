import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { listFilesRelative } from "../proc/files.js";
import type { Adapter, InvokeResult } from "../adapters/contract.js";
import { assemblePrompt, type PromptLayer } from "../prompt/assemble.js";
import { HIDDEN_DIR, type Task } from "./task.js";
import type { TurnRecorder } from "./snapshot.js";

export interface ProduceOptions {
  task: Task;
  adapter: Adapter;
  /** Bu hücrenin dizini; altında artifact/ ve (sonradan) hidden/ oluşur. */
  cellDir: string;
  /** Üretim prompt katmanları. Dört hücrede de aynı olmalı. */
  layers: PromptLayer[];
  timeoutMs: number;
  /**
   * Depo kökü. Verilirse, ajanın kendi hücresinin dışına yazıp yazmadığı
   * üretim sonrası kontrol edilir.
   */
  repo?: string;
  /**
   * Verilirse her tur diske saklanır. Üretim iki tur bırakır: "tohum"
   * (ajan koşmadan önceki hâl) ve "uretim". Tohum turu olmadan "ajan
   * mevcut kodda neyi değiştirdi" sorusu cevaplanamaz — `seed/` verilen
   * görevlerde ölçmek istediğimiz şeyin ta kendisi bu.
   */
  recorder?: TurnRecorder;
}

export interface ProduceResult {
  cellDir: string;
  artifactDir: string;
  /** Ajanın yazması istenen dosya gerçekten oluştu mu. */
  entryWritten: boolean;
  /** Artefakt dizinine gerçekte yazılan dosyalar (seed dahil). */
  filesWritten: string[];
  /** Üretimden önce yerine konan mevcut kod; seed yoksa boş. */
  seeded: string[];
  /**
   * Ajan istenen dosyayı hücresinin DIŞINA yazdıysa, bulunduğu yol.
   *
   * Gerçek bir koşuda oldu: ajana `Glob`/`Grep` verilince çalışma dizininden
   * yukarı çıktı, deponun kendi `src/` dizinini buldu ve çözümü oraya yazdı.
   * Hücre boş kaldığı için koşu "ÖLÇÜLEMEDİ" göründü — ama asıl zarar,
   * operatörün deposuna sessizce dosya düşmesiydi.
   */
  escapedTo: string | undefined;
  /** Katmanlı promptun SHA-256'sı. Hücreler arası eşitlik bununla kanıtlanır. */
  promptHash: string;
  invoke: InvokeResult;
}

/**
 * Bir üreticiye görevi çözdürür.
 *
 * Gizli testler üretimden SONRA kopyalanır. Üretim sırasında diskte hiç
 * bulunmamaları, "üretici gizli testi görmedi" garantisini talimat olmaktan
 * çıkarıp fiziksel yapar — ajan bakmak istese de bakacak bir şey yok.
 */
export async function produce(options: ProduceOptions): Promise<ProduceResult> {
  const { task, adapter, cellDir, layers, timeoutMs } = options;
  const artifactDir = join(cellDir, "artifact");
  await mkdir(artifactDir, { recursive: true });

  // Mevcut kod üretimden ÖNCE yerine konur; gizli testler SONRA kopyalanır.
  // İkisinin sırası deneyin geçerlilik koşulu: ajan dokunacağı kodu görmeli,
  // ölçen testi görmemeli.
  let seeded: string[] = [];
  if (task.seedDir !== undefined) {
    await cp(task.seedDir, artifactDir, { recursive: true });
    seeded = await listFilesRelative(artifactDir);
  }

  await options.recorder?.record(artifactDir, "tohum");

  const prompt = await assemblePrompt(layers);
  const promptFile = join(cellDir, "prompt.txt");
  await writeFile(promptFile, prompt.text);

  const spec = await readFile(task.specPath, "utf8");
  // Seed varsa ajana dizinde ne bulduğu söylenir. Bu metin göreve göre
  // değişir ama iki üretici için birebir aynıdır — eşleşmeli karşılaştırmanın
  // gerektirdiği tek eşitlik bu.
  const seedNote = seeded.length === 0
    ? ""
    : `\nÇalışma dizininde hâlihazırda şu dosyalar var; değiştirmen gereken ` +
      `yerleri değiştir, gerisine dokunma:\n` +
      seeded.map((f) => `  ${f}`).join("\n") + "\n";
  const taskText = `${spec}\n${seedNote}\nÇözümü şu dosyaya yaz: ${task.entry}\n`;

  // Kaçış denetimi için önceki hâl. Saat çözünürlüğüne güvenmek yerine
  // dosyanın kendi damgası kıyaslanıyor: aynı milisaniyede yazılan bir
  // dosya "eski" görünüp denetimden kaçardı.
  const oncekiHal = await fileStamp(options.repo, task.entry);
  const invoke = await adapter.invoke({ workdir: artifactDir, promptFile, taskText, timeoutMs });

  // Anlık görüntü gizli testler KOPYALANMADAN önce: sonra alınsaydı her
  // üretim turu, ajanın hiç görmediği dosyaları da değişmiş gibi gösterirdi.
  await options.recorder?.record(artifactDir, "uretim");

  // Ancak şimdi: üretim bitti, ajan çıktı.
  await cp(task.hiddenDir, join(cellDir, HIDDEN_DIR), { recursive: true });

  // "Süit koşmadı" tek başına belirsiz bir teşhis: ajan hiç dosya yazmamış da
  // olabilir, yanlış yere yazmış da, derlenmeyen kod da yazmış olabilir.
  // Üçünü ayırt etmek için ne yazıldığını burada kaydediyoruz.
  const filesWritten = await listFilesRelative(artifactDir);
  const entryWritten = filesWritten.includes(task.entry);
  const escapedTo = entryWritten
    ? undefined
    : await findEscaped(options.repo, task.entry, oncekiHal);

  return {
    cellDir, artifactDir, promptHash: prompt.hash, invoke,
    entryWritten, filesWritten, seeded, escapedTo,
  };
}

/** Dosyanın değişiklik damgası; yoksa undefined. */
async function fileStamp(repo: string | undefined, entry: string): Promise<number | undefined> {
  if (repo === undefined) return undefined;
  try {
    const st = await stat(join(repo, entry));
    return st.isFile() ? st.mtimeMs : undefined;
  } catch {
    return undefined;
  }
}

/**
 * İstenen dosya depo kökünde, bu koşu sırasında oluşmuş ya da değişmiş mi.
 *
 * Önceki damgayla kıyaslanıyor: aynı adlı bir dosya depoda zaten duruyor
 * olabilir ve ona "ajan yazdı" demek, gerçek bir kaçışı hiç görmemekten
 * daha kötü bir yanlış yönlendirme olurdu.
 */
async function findEscaped(
  repo: string | undefined,
  entry: string,
  onceki: number | undefined,
): Promise<string | undefined> {
  if (repo === undefined) return undefined;
  const simdi = await fileStamp(repo, entry);
  if (simdi === undefined) return undefined;
  return onceki === undefined || simdi !== onceki ? join(repo, entry) : undefined;
}

