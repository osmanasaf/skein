import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { listFilesRelative } from "../proc/files.js";

/**
 * Bir çalışma ürününün parmak izi.
 *
 * SCHEMA.md'nin `audit.fingerprint` alanının deneydeki karşılığı: orada
 * görev + alıcılar + commit + taslak, burada taslağın kendisi. Parmak izine
 * içerik dahil olduğu için, denetim sırasında yapılan her düzeltme otomatik
 * olarak yeni bir tur açar — devir teslim ancak hiçbir şeyin değişmediği bir
 * turdan sonra gerçekleşir (PHILOSOPHY 6).
 */
export async function fingerprintDir(dir: string): Promise<string> {
  let files: string[];
  try {
    files = await listFilesRelative(dir);
  } catch (cause) {
    throw new Error(`Parmak izi alınamadı: ${dir} — ${(cause as Error).message}`);
  }

  const hash = createHash("sha256");
  for (const rel of files) {
    // Yol da karışıma girer: aynı gövdeyi başka isme taşımak değişikliktir.
    // Ayraç, "ab" + "c" ile "a" + "bc" ayrımının kaybolmamasi için.
    hash.update(rel);
    hash.update(SEP);
    hash.update(await readFile(join(dir, rel)));
    hash.update(SEP);
  }
  return hash.digest("hex");
}

/** Dosya adı ve içeriğinde geçemeyecek bir ayraç. */
const SEP = Buffer.from([0]);

