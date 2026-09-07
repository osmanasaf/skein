import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { listFilesRelative } from "../proc/files.js";
import type { Adapter, InvokeResult } from "../adapters/contract.js";
import { assemblePrompt, type PromptLayer } from "../prompt/assemble.js";
import { HIDDEN_DIR, type Task } from "./task.js";

export interface ProduceOptions {
  task: Task;
  adapter: Adapter;
  /** Bu hücrenin dizini; altında artifact/ ve (sonradan) hidden/ oluşur. */
  cellDir: string;
  /** Üretim prompt katmanları. Dört hücrede de aynı olmalı. */
  layers: PromptLayer[];
  timeoutMs: number;
}

export interface ProduceResult {
  cellDir: string;
  artifactDir: string;
  /** Ajanın yazması istenen dosya gerçekten oluştu mu. */
  entryWritten: boolean;
  /** Artefakt dizinine gerçekte yazılan dosyalar. */
  filesWritten: string[];
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

  const prompt = await assemblePrompt(layers);
  const promptFile = join(cellDir, "prompt.txt");
  await writeFile(promptFile, prompt.text);

  const spec = await readFile(task.specPath, "utf8");
  const taskText = `${spec}\n\nÇözümü şu dosyaya yaz: ${task.entry}\n`;

  const invoke = await adapter.invoke({ workdir: artifactDir, promptFile, taskText, timeoutMs });

  // Ancak şimdi: üretim bitti, ajan çıktı.
  await cp(task.hiddenDir, join(cellDir, HIDDEN_DIR), { recursive: true });

  // "Süit koşmadı" tek başına belirsiz bir teşhis: ajan hiç dosya yazmamış da
  // olabilir, yanlış yere yazmış da, derlenmeyen kod da yazmış olabilir.
  // Üçünü ayırt etmek için ne yazıldığını burada kaydediyoruz.
  const filesWritten = await listFilesRelative(artifactDir);
  const entryWritten = filesWritten.includes(task.entry);

  return { cellDir, artifactDir, promptHash: prompt.hash, invoke, entryWritten, filesWritten };
}

