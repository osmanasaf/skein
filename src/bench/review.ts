import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { Adapter, InvokeResult } from "../adapters/contract.js";
import { assemblePrompt, type PromptLayer } from "../prompt/assemble.js";
import type { Task } from "./task.js";

export interface ReviewOptions {
  task: Task;
  /** İncelenecek artefaktın dizini. */
  artifactDir: string;
  reviewer: Adapter;
  /** Denetim çalışma dizini — hücreden AYRI, artefakta yazamasın diye. */
  workdir: string;
  layers: PromptLayer[];
  timeoutMs: number;
}

export interface ReviewResult {
  reviewer: string;
  model: string;
  promptHash: string;
  text: string;
  invoke: InvokeResult;
}

/**
 * Bir artefaktı bir denetçiye inceletir.
 *
 * Deneyin geçerliliği iki kurala bağlı, ikisi de burada:
 *
 * 1. **Yazarlık sızmaz.** Denetçiye kodu kimin yazdığı söylenmez — `AA`
 *    hücresinde "kendi kodunu incele" denseydi, `AA` ile `AB` arasındaki
 *    farkı kör nokta değil çerçeveleme yaratırdı.
 * 2. **Taze süreç.** Denetim, üretim konuşmasının devamı değil. Devam
 *    olsaydı `AA` üretim bağlamını taşır, `AB` taşımazdı — bu bir confound
 *    ve kör nokta mekanizması değil. Adaptör zaten her çağrıda yeni süreç
 *    başlatıyor; durumun ajanın dışında olması (PHILOSOPHY 1) burada
 *    deneyin geçerlilik koşulu.
 */
export async function review(options: ReviewOptions): Promise<ReviewResult> {
  const { task, artifactDir, reviewer, workdir, layers, timeoutMs } = options;

  const prompt = await assemblePrompt(layers);
  const promptFile = join(workdir, "review-prompt.txt");
  await writeFile(promptFile, prompt.text);

  const spec = await readFile(task.specPath, "utf8");
  const code = await renderArtifact(artifactDir);
  const taskText = `## Görev tanımı\n\n${spec}\n\n## İncelenecek kod\n\n${code}`;

  const invoke = await reviewer.invoke({ workdir, promptFile, taskText, timeoutMs });
  return {
    reviewer: reviewer.id,
    model: reviewer.model,
    promptHash: prompt.hash,
    text: invoke.stdout,
    invoke,
  };
}

/** Artefaktın tüm dosyalarını tek metne serer; denetçi diske erişmez. */
async function renderArtifact(dir: string): Promise<string> {
  const files = await walk(dir, dir);
  files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const parts: string[] = [];
  for (const rel of files) {
    parts.push(`### ${rel}\n\n\`\`\`\n${await readFile(join(dir, rel), "utf8")}\n\`\`\`\n`);
  }
  return parts.join("\n");
}

async function walk(dir: string, base: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    else if (entry.isFile()) out.push(relative(base, full).split(sep).join("/"));
  }
  return out;
}
