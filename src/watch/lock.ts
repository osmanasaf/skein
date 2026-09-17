import { readFile, rm, writeFile } from "node:fs/promises";

/**
 * Kilit dosyasının içeriği. Ekran ve `card ls` gibi okuyucular buradan
 * gözcünün açık olup olmadığını anlar; kimse buraya kart durumu yazmaz.
 */
export interface LockInfo {
  pid: number;
  startedAt: string;
  /** Hangi akışı koşuyor. */
  flow: string;
  /** Akışın topoloji hash'i — açıkken akış dosyası değişirse fark edilir. */
  hash: string;
  /** Uzun ömürlü gözcü mü, tek seferlik toplu koşu mu. Mesajı bu ayırır. */
  mode: "serve" | "batch";
}

export type LockResult =
  | {
      kind: "acquired";
      /** Ölü bir gözcüden devralındıysa, o kaydın kendisi. */
      took?: LockInfo;
    }
  | { kind: "busy"; holder: LockInfo };

export interface LockOptions {
  /** Test edilebilirlik için; varsayılan `process.kill(pid, 0)`. */
  alive?: (pid: number) => boolean;
}

/**
 * Süreç hâlâ yaşıyor mu.
 *
 * `EPERM` "var ama bizim değil" demek — başka kullanıcının süreci de canlı
 * sayılır. Yalnızca `ESRCH` (böyle bir süreç yok) ölü demektir.
 */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Tek yazıcı kilidi.
 *
 * Kuyruğa yazan iki süreç, atomik `rename`'in çözemeyeceği tek şeydir.
 * Asıl tehlike `take()` değil `recover()`: ikinci koşu, birincinin ELİNDEKİ
 * kartı (`active/` dizininde duran) çökmüş sanıp kuyruğa geri atar — ve aynı
 * iş ikinci kez, para harcayarak yapılır. Bu yüzden yazan HER koşu (gözcü de,
 * toplu koşu da) kilidi alır; `--plan` almaz, çünkü yazmaz.
 *
 * Tekliğin kanıtı bir dosyanın VARLIĞI — süreç ölünce dosya kalır, ama
 * içindeki pid ölüyü belli eder.
 *
 * Bayat kilit kalıcı engel DEĞİLDİR: `kill -9` sonrası sonraki gözcü onu
 * devralır. "Kilit bir gün kalıcı olarak bozulur" hatası, dosya tabanlı
 * kilitlerin klasik ölüm sebebi.
 */
export async function acquireLock(
  path: string,
  info: LockInfo,
  options: LockOptions = {},
): Promise<LockResult> {
  const alive = options.alive ?? pidAlive;
  const body = `${JSON.stringify(info, null, 2)}\n`;

  const claim = async (): Promise<boolean> => {
    try {
      // `wx`: dosya varsa yazma. Sahiplenme tek sistem çağrısında olur.
      await writeFile(path, body, { encoding: "utf8", flag: "wx" });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw error;
    }
  };

  if (await claim()) return { kind: "acquired" };

  const holder = await readLock(path);

  // Okunamayan kilit bayat sayılır: yarım yazılmış ya da elle bozulmuş bir
  // dosya, gözcüyü sonsuza kadar kilitlememeli.
  if (holder !== null && alive(holder.pid)) {
    return { kind: "busy", holder };
  }

  // Silip yeniden `wx` ile almak, aynı anda iki gözcünün bayat kilidi
  // devralma yarışını da çözer: ikisi de siler, ama yalnızca biri yazabilir.
  await rm(path, { force: true });
  if (await claim()) {
    return holder === null ? { kind: "acquired" } : { kind: "acquired", took: holder };
  }

  const winner = await readLock(path);
  return winner === null
    ? { kind: "busy", holder: { pid: 0, startedAt: "", flow: "?", hash: "?", mode: "batch" } }
    : { kind: "busy", holder: winner };
}

/** Kilidi okur. Yoksa ya da bozuksa `null`. */
export async function readLock(path: string): Promise<LockInfo | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return null;
  }
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (typeof record["pid"] !== "number" || !Number.isInteger(record["pid"])) return null;
    return {
      pid: record["pid"],
      startedAt: typeof record["startedAt"] === "string" ? record["startedAt"] : "",
      flow: typeof record["flow"] === "string" ? record["flow"] : "?",
      hash: typeof record["hash"] === "string" ? record["hash"] : "?",
      mode: record["mode"] === "serve" ? "serve" : "batch",
    };
  } catch {
    return null;
  }
}

/**
 * Kilidi bırakır — ama yalnızca bizimse.
 *
 * Bayat sayılıp devralınmış bir kilidi, geç uyanan eski sahibinin silmesi
 * yeni gözcüyü korumasız bırakırdı.
 */
export async function releaseLock(path: string, pid: number): Promise<boolean> {
  const holder = await readLock(path);
  if (holder === null || holder.pid !== pid) return false;
  await rm(path, { force: true });
  return true;
}
