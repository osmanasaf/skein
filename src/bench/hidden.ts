import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { spawnPortable } from "../proc/process.js";
import type { Task } from "./task.js";

export interface Hook {
  /** Kancanın adı — kusuru tarif eder, numara vermez. */
  title: string;
  passed: boolean;
}

export interface HiddenRun {
  hooks: Hook[];
  /** Kırmızı kancaların adları: kanıtlanmış kusurlar. */
  red: string[];
  /**
   * Süit gerçekten koştu mu. Artefakt derlenmiyor ya da hiç yoksa vitest
   * sıfır kanca bildirir — bunu "sıfır kırmızı" saymak kusursuz bir çözümle
   * karıştırmak olurdu. Ölçülemeyen koşu, temiz koşu değildir.
   */
  ran: boolean;
  exitCode: number;
  raw: string;
  /** Süit koşmadığında sebebi burada olur. */
  stderr: string;
}

interface VitestJson {
  testResults?: { assertionResults?: { title?: string; status?: string }[] }[];
}

/**
 * Görevin gizli testlerini bir hücrenin artefaktına karşı koşar.
 *
 * `cellDir/hidden` dizininin ÜRETİMDEN SONRA kopyalanmış olması gerekir;
 * üretim sırasında diskte bulunmaması, "üretici gizli testi görmedi"
 * garantisini talimat olmaktan çıkarıp fiziksel yapar.
 */
export async function runHidden(task: Task, cellDir: string, cwd: string): Promise<HiddenRun> {
  // `join` şart: elle "/" eklemek Windows'ta "C:\\...\\hucre/hidden" gibi karışık
  // ayraçlı bir yol üretir.
  //
  // `--outputFile` de şart: vitest 5 JSON raporunu stdout'a değil dosyaya
  // yazıyor. Stdout'tan okumaya devam etseydik her koşu "süit hiç koşmadı"
  // görünürdü — ki tam olarak bu oldu ve ÖLÇÜLEMEDİ koruması yakaladı.
  // Dosyadan okumak ayrıca daha sağlam: rapor başka çıktıyla karışmıyor.
  const reportPath = join(cellDir, "hidden-report.json");
  await rm(reportPath, { force: true });
  const args = [
    ...task.hidden.command.slice(1),
    "--dir", join(cellDir, "hidden"),
    "--outputFile", reportPath,
  ];
  const child = spawnPortable(task.hidden.command[0] as string, args, { cwd });

  let raw = "";
  let errText = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (c: string) => (raw += c));
  // stderr yutulmamalı: yanlış kurulmuş bir komut hatasını buraya yazıp
  // stdout'u boş bırakır, ve koşu sebebi görünmeden ölçümsüz kalır.
  child.stderr.on("data", (c: string) => (errText += c));

  const exitCode = await new Promise<number>((resolve) => {
    child.on("error", () => resolve(127));
    child.on("close", (code) => resolve(code ?? 1));
  });

  // Önce rapor dosyası; yoksa stdout'a geri düş (başka koşucular için).
  let report = "";
  try {
    report = await readFile(reportPath, "utf8");
  } catch {
    report = raw;
  }
  const hooks = parseHooks(report);
  return {
    hooks,
    red: hooks.filter((h) => !h.passed).map((h) => h.title),
    ran: hooks.length > 0,
    exitCode,
    raw,
    stderr: errText,
  };
}

/** vitest JSON raporundan kanca listesi. Rapor bozuksa boş liste. */
export function parseHooks(raw: string): Hook[] {
  const start = raw.indexOf("{");
  if (start === -1) return [];
  let doc: VitestJson;
  try {
    doc = JSON.parse(raw.slice(start)) as VitestJson;
  } catch {
    return [];
  }
  const hooks: Hook[] = [];
  for (const file of doc.testResults ?? []) {
    for (const t of file.assertionResults ?? []) {
      if (typeof t.title === "string") hooks.push({ title: t.title, passed: t.status === "passed" });
    }
  }
  return hooks;
}
