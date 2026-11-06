import { randomUUID } from "node:crypto";
import { link, readFile, rm, unlink, writeFile } from "node:fs/promises";

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
 * iş ikinci kez, para harcayarak yapılır.
 *
 * Politika ÜÇ katmanlı; "yazan her koşu kilidi alır" demek yetmiyordu, çünkü
 * o cümle doğru olmadığı hâlde yazılıydı (kilidi yalnızca `watch/cli.ts`
 * alıyordu):
 *
 * - Kilidi ALANLAR: gözcü ve toplu koşu (`watch/cli.ts`). `--plan` almaz,
 *   çünkü yazmaz.
 * - Kilide UYANLAR: `card -- take` ve `card -- recover`. Kilidi almıyorlar
 *   ama canlı kilit varken reddediyorlar (`liveLock`) — `active/` alanı
 *   gözcünün elindedir.
 * - Kilide BAKMAYANLAR: ekranın kapı kararları (`release`, `kapat`). Gözcü
 *   koşarken kapıdaki bir kartı ileri bırakmak NORMAL durumdur; gözcü o
 *   kartlara dokunmuyor. "Her yazma kilit alsın" demek ekranı
 *   kullanılamaz yapardı.
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

  /**
   * Kilidi İÇERİĞİYLE BİRLİKTE, tek adımda sahiplenir.
   *
   * Eski hâli `writeFile(path, body, { flag: "wx" })` idi ve yorumu
   * "sahiplenme tek sistem çağrısında olur" diyordu — ama değildi: `wx`
   * dosyayı O_CREAT|O_EXCL ile YARATIYOR, içeriği SONRA yazıyor. Aradaki
   * pencerede okuyan boş dosya görüyor, `readLock` `null` dönüyor,
   * "okunamayan kilit bayat sayılır" dalına giriliyor ve CANLI kilit
   * siliniyor. İki gözcü de kilidi kendinde sanıyor — kilidin önlemek için
   * var olduğu şeyin tam kendisi, bu kez farkında olmadan. `took` da boş
   * olduğu için "bayat kilit devralındı" uyarısı basılmıyor.
   *
   * Çare `link`: geçici dosya TAM yazılıyor, sonra hedefe bağlanıyor.
   * `link` hedef varsa `EEXIST` veriyor, yani teklik garantisi duruyor ve
   * görünür olan dosya daima tam. Kuyruğun tmp+rename disiplininin
   * kilitteki karşılığı — orada `rename` ezer, burada ezmemesi gerekiyor.
   *
   * `link` desteklenmeyen bir dosya sisteminde (bazı ağ/konteyner
   * bağlamaları) eski yola düşüyoruz: pencere küçük ama sıfır değil, ve
   * bunu gizlemek yerine yazıyoruz.
   */
  const claim = async (): Promise<boolean> => {
    // Pid tek başına yetmiyor: aynı süreçte iki `acquireLock` (testler, ya da
    // iki akışı aynı kökte koşan bir araç) aynı geçici adı paylaşırdı.
    const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmp, body, "utf8");
    try {
      await link(tmp, path);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EEXIST") return false;
      // `link` yok/yasak: eski yol, dar pencereyle.
      try {
        await writeFile(path, body, { encoding: "utf8", flag: "wx" });
        return true;
      } catch (ikinci) {
        if ((ikinci as NodeJS.ErrnoException).code === "EEXIST") return false;
        throw ikinci;
      }
    } finally {
      await unlink(tmp).catch(() => undefined);
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

/**
 * CANLI bir kilit tutan var mı — yazmayan okuyucular için.
 *
 * Kuyruğa yazan her yol kilidi ALMAK zorunda değil; `active/` alanına
 * dokunan yollar ona UYMAK zorunda. Ayrım şu: gözcü koşarken kapıdaki bir
 * kartı ekrandan ileri bırakmak NORMAL durumdur (gözcü kapıdaki karta
 * dokunmuyor), ama `recover` gözcünün ELİNDEKİ kartı kuyruğa geri
 * atabiliyor ve aynı iş ikinci kez, para harcayarak yapılıyor.
 *
 * `bizimPid` verilirse kendi kilidimiz canlı sayılmıyor: kendi kilidini
 * engel sanan bir süreç hiçbir iş yapamazdı.
 */
export async function liveLock(
  path: string, options: LockOptions & { ourPid?: number } = {},
): Promise<LockInfo | null> {
  const alive = options.alive ?? pidAlive;
  const holder = await readLock(path);
  if (holder === null) return null;
  if (options.ourPid !== undefined && holder.pid === options.ourPid) return null;
  return alive(holder.pid) ? holder : null;
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
