import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

/**
 * Bir dizin altındaki tüm dosyaları, dizine göre relatif ve POSIX ayracıyla,
 * sıralı olarak listeler.
 *
 * Sıralama zorunlu: dizin okuma sırası platforma göre değişir ve parmak izi
 * buna duyarlı olsaydı "değişmedi" turu asla gelmezdi. POSIX ayracı da
 * zorunlu: bu yollar prompt'a ve parmak izine giriyor, işletim sistemine
 * göre değişemezler.
 *
 * Bu gezinme daha önce üç yerde ayrı ayrı yazılmıştı ve kopyalardan birinde
 * özyinelemede taban dizin kayboluyordu.
 */
export async function listFilesRelative(dir: string): Promise<string[]> {
  const absolute = await walk(dir);
  const rels = absolute.map((f) => relative(dir, f).split(sep).join("/"));
  rels.sort();
  return rels;
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}
