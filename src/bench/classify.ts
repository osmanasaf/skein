import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { listFilesRelative } from "../proc/files.js";
import type { Adapter, InvokeResult } from "../adapters/contract.js";
import { assemblePrompt, type PromptLayer } from "../prompt/assemble.js";
import { extractJson, JudgeError, quoteFound, scrubIdentity } from "./judge.js";

/** Bir bulgunun sınıfı. `belirsiz` oranlara girmez. */
export type FindingClass = "gercek" | "nit" | "yanlis" | "belirsiz";

export interface Finding {
  sinif: FindingClass;
  /** Kanıtlanmış bir kusuru tarif ediyor mu — 1. katmanın alanı. */
  proven: boolean;
  quote: string;
  reason?: string;
}

export interface ClassifyResult {
  findings: Finding[];
  /** Alıntısı raporda bulunamadığı için sayılmayan bulgular. */
  unverified: number;
  counts: { findings: number; real: number; nit: number; wrong: number; proven: number; uncertain: number };
  scrubbed: number;
  promptHash: string;
  invoke: InvokeResult;
}

interface RawFinding {
  sinif?: unknown;
  kanitli?: unknown;
  alinti?: unknown;
  gerekce?: unknown;
}

const CLASSES: FindingClass[] = ["gercek", "nit", "yanlis", "belirsiz"];

/**
 * Ham sınıflamayı bulgulara çevirir ve alıntıları doğrular.
 *
 * Alıntısı raporda bulunamayan bulgu sayılmaz. 1. katmandaki kuralla aynı,
 * ve aynı sebeple: hakemin "rapor şunu diyor" demesi tek başına veri değil.
 * Burada ayrıca bir yön farkı var — 1. katmanda doğrulanamayan alıntı
 * denetçinin ALEYHİNE (kaçırma) sayılıyordu; burada bulgunun kendisi
 * düşüyor, yani ne lehe ne aleyhe. Uydurulmuş bir bulguyu "yanlış pozitif"
 * saymak denetçiyi hakemin hatasıyla cezalandırmak olurdu.
 */
export function applyFindings(raws: RawFinding[], report: string): {
  findings: Finding[];
  unverified: number;
} {
  const findings: Finding[] = [];
  let unverified = 0;
  for (const raw of raws) {
    const quote = typeof raw.alinti === "string" ? raw.alinti : "";
    if (!quoteFound(report, quote)) {
      unverified += 1;
      continue;
    }
    const sinif = CLASSES.find((c) => c === raw.sinif) ?? "belirsiz";
    const reason = typeof raw.gerekce === "string" ? raw.gerekce : undefined;
    findings.push({
      sinif,
      proven: raw.kanitli === true,
      quote,
      ...(reason ? { reason } : {}),
    });
  }
  return { findings, unverified };
}

/** Sınıfları sayar. Kanıtlı bulgular ayrı sayılır; oranlara girmezler. */
export function countFindings(findings: Finding[]): ClassifyResult["counts"] {
  const own = findings.filter((f) => !f.proven);
  return {
    findings: own.length,
    real: own.filter((f) => f.sinif === "gercek").length,
    nit: own.filter((f) => f.sinif === "nit").length,
    wrong: own.filter((f) => f.sinif === "yanlis").length,
    proven: findings.length - own.length,
    uncertain: own.filter((f) => f.sinif === "belirsiz").length,
  };
}

export interface ClassifyOptions {
  judge: Adapter;
  /** Hakemin çalışma dizini — körlenmiş rapor ve sınıflama buraya yazılır. */
  workdir: string;
  layers: PromptLayer[];
  timeoutMs: number;
  /** Görev tanımı. */
  specPath: string;
  /** İncelenen artefaktın dizini; yanlış pozitif ancak kod okunarak ayrılır. */
  artifactDir: string;
  /** Denetçinin raporu, ham hâliyle. Körleme burada yapılır. */
  reportText: string;
  /** Kanıtlanmış kusurlar; boş olabilir. */
  redHooks: string[];
}

/**
 * 2. YER GERÇEĞİ: raporun bulgularını gerçek / nit / yanlış diye ayırır.
 *
 * 1. katman (`judge.ts`) "kanıtlanmış kusuru rapor söylüyor mu" diye sorar;
 * cevabı kırmızı bir test verir, tartışmaya kapalıdır. Bu katman gizli
 * testin GÖREMEDİĞİ bulguları ölçer — tasarım, sızıntı, yanlış iddia — ve
 * cevabı bir modelin görüşüdür, itiraz edilebilir. İkisi ayrı olaylara
 * yazılır ve ayrı raporlanır; birleştirilmiş tek bir "bulgu skoru", zayıf
 * katmanın gücünü güçlü katmandan ödünç alırdı (bench/DESIGN.md).
 *
 * İki fark, 1. katmandan bilerek ayrılıyor:
 *
 * 1. **Hakem kodu görür.** "Bu iddianın kodda karşılığı yok" demek ancak
 *    kod okunarak söylenebilir. 1. katmanda kod verilmiyordu, çünkü orada
 *    yer gerçeği testin kendisiydi.
 * 2. **Kod da körleniyor.** Rapor gibi kod da model/satıcı adlarından
 *    arındırılıyor: üretim ajanının yorum satırına bıraktığı bir imza,
 *    hakemin körlüğünü rapor tarafından değil kod tarafından bozardı.
 */
export async function classifyReport(options: ClassifyOptions): Promise<ClassifyResult> {
  const { judge, workdir, layers, timeoutMs, specPath, artifactDir, reportText, redHooks } = options;

  const prompt = await assemblePrompt(layers);
  const promptFile = join(workdir, "siniflandir-prompt.txt");
  await writeFile(promptFile, prompt.text);

  const blind = scrubIdentity(reportText);
  await writeFile(join(workdir, "korlenmis-rapor.txt"), blind.text);

  const spec = await readFile(specPath, "utf8");
  const code = scrubIdentity(await renderArtifact(artifactDir)).text;
  const list = redHooks.length === 0
    ? "(yok — bu üretimde kırmızı gizli test çıkmadı)"
    : redHooks.map((h, i) => `${i + 1}. ${h}`).join("\n");
  const taskText =
    `## Görev tanımı\n\n${spec}\n\n` +
    `## İncelenen kod\n\n${code}\n\n` +
    `## Kanıtlanmış kusurlar\n\n${list}\n\n` +
    `## İnceleme raporu\n\n${blind.text}`;

  const invoke = await judge.invoke({ workdir, promptFile, taskText, timeoutMs });
  const raw = invoke.message ?? invoke.stdout;
  const { findings, unverified } = applyFindings(extractJson(raw) as RawFinding[], blind.text);
  await writeFile(join(workdir, "siniflama.json"), JSON.stringify(findings, null, 2));

  return {
    findings,
    unverified,
    counts: countFindings(findings),
    scrubbed: blind.count,
    promptHash: prompt.hash,
    invoke,
  };
}

/** Artefaktın tüm dosyalarını tek metne serer; hakem diske erişmez. */
async function renderArtifact(dir: string): Promise<string> {
  const files = await listFilesRelative(dir);
  const parts: string[] = [];
  for (const rel of files) {
    parts.push(`### ${rel}\n\n\`\`\`\n${await readFile(join(dir, rel), "utf8")}\n\`\`\`\n`);
  }
  return parts.join("\n");
}

export { JudgeError };
