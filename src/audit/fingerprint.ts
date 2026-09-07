import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

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
  const files = await walk(dir, dir);
  // Sıralama zorunlu: dizin okuma sırası platforma göre değişir ve parmak izi
  // bundan etkilenirse "değişmedi" turu asla gelmez.
  files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

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

async function walk(dir: string, base: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (cause) {
    throw new Error(`Parmak izi alınamadı: ${dir} — ${(cause as Error).message}`);
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    else if (entry.isFile()) out.push(relative(base, full).split(sep).join("/"));
  }
  return out;
}
