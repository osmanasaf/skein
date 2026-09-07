import { readFile, stat } from "node:fs/promises";
import { basename, isAbsolute, join, normalize, resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";

/** Gizli testlerin durduğu alt dizin. Üretici bunu asla görmez. */
export const HIDDEN_DIR = "hidden";

export interface HiddenSuite {
  /** argv dizisi — shell yok, enjeksiyon yüzeyi yok. */
  command: string[];
  /** Komutun çalıştırılacağı dizin; görev dizinine relatif. Varsayılan: hidden/ */
  cwd: string;
}

export interface Task {
  id: string;
  title: string;
  language: string;
  /** Üreticinin göreceği tek dosya. */
  specPath: string;
  /** Üreticinin yazması beklenen dosya; üretim workdir'ine relatif. */
  entry: string;
  hidden: HiddenSuite;
  /** Gizli testlerin mutlak yolu. Üretim workdir'ine kopyalanmaz. */
  hiddenDir: string;
  dir: string;
}

class TaskError extends Error {
  constructor(file: string, message: string) {
    super(`${file}: ${message}`);
    this.name = "TaskError";
  }
}

function requireString(raw: Record<string, unknown>, field: string, file: string): string {
  const value = raw[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new TaskError(file, `zorunlu alan eksik ya da metin değil: \`${field}\``);
  }
  return value.trim();
}

/**
 * Görev dizinine hapsedilmiş, gizli dizine değmeyen bir relatif yol doğrular.
 * `label` hata mesajında geçen alan adıdır.
 */
function safeRelative(value: string, label: string, file: string): string {
  if (isAbsolute(value)) {
    throw new TaskError(file, `\`${label}\` mutlak yol olamaz: ${value}`);
  }
  const norm = normalize(value);
  if (norm === ".." || norm.startsWith(`..${sep}`)) {
    throw new TaskError(file, `\`${label}\` görev dizininin dışına çıkıyor: ${value}`);
  }
  const first = norm.split(sep)[0];
  if (first === HIDDEN_DIR) {
    throw new TaskError(
      file,
      `\`${label}\` gizli test dizinine işaret ediyor: ${value}. ` +
        `Üretici gizli testleri göremez — yer gerçeği buna bağlı.`,
    );
  }
  // POSIX ayracına geri çevrilir. `normalize` Windows'ta "/" yerine "\\" koyar
  // ve bu yol ajana verilen talimatın içine giriyor: aynı task.yaml, işletim
  // sistemine göre farklı prompt üretirdi. Deneyin makineler arası
  // karşılaştırılabilirliği buna bağlı.
  return norm.split(sep).join("/");
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * Bir görev dizinini yükler ve doğrular.
 *
 * Doğrulama kasıtlı olarak katı ve hata mesajları kasıtlı olarak alanı
 * adıyla söylüyor: sessizce yanlış yüklenmiş bir görev, deneyin sonucunu
 * fark edilmeden bozar.
 */
export async function loadTask(dir: string): Promise<Task> {
  const taskDir = resolve(dir);
  const yamlPath = join(taskDir, "task.yaml");
  const label = join(basename(taskDir), "task.yaml");

  let raw: unknown;
  try {
    raw = parseYaml(await readFile(yamlPath, "utf8"));
  } catch (cause) {
    throw new TaskError(label, `okunamadı ya da geçerli YAML değil: ${(cause as Error).message}`);
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TaskError(label, "kök öğe bir eşleme (mapping) olmalı");
  }
  const doc = raw as Record<string, unknown>;

  const id = requireString(doc, "id", label);
  if (id !== basename(taskDir)) {
    throw new TaskError(label, `\`id\` dizin adıyla aynı olmalı: \`${id}\` ≠ \`${basename(taskDir)}\``);
  }

  const title = requireString(doc, "title", label);
  const language = requireString(doc, "language", label);

  const specRel = safeRelative(requireString(doc, "spec", label), "spec", label);
  const specPath = join(taskDir, specRel);
  if (!(await isFile(specPath))) {
    throw new TaskError(label, `\`spec\` dosyası yok: ${specRel}`);
  }

  const entry = safeRelative(requireString(doc, "entry", label), "entry", label);

  const hiddenRaw = doc["hidden"];
  if (hiddenRaw === null || typeof hiddenRaw !== "object" || Array.isArray(hiddenRaw)) {
    throw new TaskError(label, "zorunlu alan eksik ya da eşleme değil: `hidden`");
  }
  const hiddenDoc = hiddenRaw as Record<string, unknown>;
  const command = hiddenDoc["command"];
  if (!Array.isArray(command) || command.length === 0 || !command.every((c) => typeof c === "string")) {
    throw new TaskError(label, "`hidden.command` boş olmayan bir metin dizisi olmalı");
  }
  // Dizini koşucu ekler. Görev de eklerse vitest iki değer görüp reddediyor ve
  // hata stderr'de kalıyordu: sessizce ölçümsüz kalan bir koşu.
  if ((command as string[]).includes("--dir")) {
    throw new TaskError(label, "`hidden.command` `--dir` içeremez — hedef dizini koşucu ekler");
  }
  const hiddenCwd = typeof hiddenDoc["cwd"] === "string" ? (hiddenDoc["cwd"] as string) : HIDDEN_DIR;

  const hiddenDir = join(taskDir, HIDDEN_DIR);
  if (!(await isDirectory(hiddenDir))) {
    throw new TaskError(label, `\`${HIDDEN_DIR}/\` dizini yok — yer gerçeği bu testlerden geliyor`);
  }

  return {
    id,
    title,
    language,
    specPath,
    entry,
    hidden: { command: command as string[], cwd: hiddenCwd },
    hiddenDir,
    dir: taskDir,
  };
}
