import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { DONE, edgeKey, gateAfter, roleOf } from "../flow/snapshot.js";
import { parseCard, rejectCount, serializeCard, type Card, type HistoryEntry } from "./card.js";

export class QueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueError";
  }
}

/**
 * Kuyruk önceliği. Dosya adının ilk karakteri; sıralama sözlük sırasıyla
 * yapıldığı için indeks dosyasına gerek kalmıyor.
 *
 * Geri dönen kart taze kartın önüne geçer: yarım kalmış bir işi bitirmek,
 * yenisine başlamaktan önce gelir. Aksi hâlde reddedilen kartlar kuyruğun
 * dibinde birikir ve ret döngüsü hiç kapanmaz.
 */
const PRIO_RETURNED = "0";
const PRIO_FRESH = "1";

/** Kartın bulunabileceği dizinler. Kart her an bunlardan birinde ve yalnız birinde. */
const AREAS = ["queue", "active", "gate", "done"] as const;

interface Located {
  card: Card;
  path: string;
}

/**
 * Dosya tabanlı kart kuyruğu.
 *
 * Kartın nerede olduğu dosya sistemindeki YERİ ile belirlenir; her geçiş bir
 * `rename`. Böylece kart hiçbir an iki durumda birden olmaz ve süreç
 * öldüğünde iş ortada kalmaz — `recover()` toplar.
 *
 * `.skein/` git tarafından yok sayılır ve KASITLI olarak öyle: her rolün
 * kendi worktree'si var, kuyruğun tek bir yerde durması gerekiyor. Ajanlar
 * kuyruğa dokunmaz; yalnızca orkestratör okur ve yazar. Denetlenebilirlik
 * kartın kendi geçmişinden ve olay günlüğünden gelir.
 */
export class CardQueue {
  readonly #root: string;

  constructor(root: string) {
    this.#root = root;
  }

  async init(): Promise<void> {
    for (const area of AREAS) {
      await mkdir(join(this.#root, area), { recursive: true });
    }
  }

  // ---- yerleşim ----

  #queueDir(role: string): string {
    return join(this.#root, "queue", role);
  }

  #activeDir(role: string): string {
    return join(this.#root, "active", role);
  }

  /** Sıralanabilir dosya adı: öncelik, zaman damgası, kart id'si. */
  #queueName(card: Card, prio: string): string {
    const ms = String(Date.parse(card.createdAt)).padStart(15, "0");
    return `${prio}-${ms}-${card.id}.json`;
  }

  // ---- okuma ----

  async #readCard(path: string): Promise<Card> {
    const text = await readFile(path, "utf8");
    try {
      return parseCard(text);
    } catch (cause) {
      throw new QueueError(`Bozuk kart dosyası: ${path} — ${(cause as Error).message}`);
    }
  }

  /** Bir dizindeki (ve alt dizinlerindeki) tüm kart dosyalarını okur. */
  async #scan(dir: string): Promise<Located[]> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const found: Located[] = [];
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        found.push(...(await this.#scan(path)));
      } else if (entry.name.endsWith(".json") && !entry.name.startsWith(".tmp-")) {
        found.push({ card: await this.#readCard(path), path });
      }
    }
    return found;
  }

  async #locate(id: string): Promise<Located[]> {
    const all: Located[] = [];
    for (const area of AREAS) {
      all.push(...(await this.#scan(join(this.#root, area))));
    }
    return all.filter((entry) => entry.card.id === id);
  }

  async get(id: string): Promise<Card | null> {
    const found = await this.#locate(id);
    // Kopya varsa geçmişi uzun olan kazanır; `recover()` ile aynı kural.
    return found.sort((a, b) => b.card.history.length - a.card.history.length)[0]?.card ?? null;
  }

  async list(): Promise<Card[]> {
    const all: Card[] = [];
    for (const area of AREAS) {
      all.push(...(await this.#scan(join(this.#root, area))).map((e) => e.card));
    }
    return all;
  }

  async depth(role: string): Promise<number> {
    return (await this.#scan(this.#queueDir(role))).length;
  }

  // ---- yazma ----

  /**
   * Kartı hedef yola taşır: önce hedefe yaz, sonra kaynağı sil.
   *
   * Aradaki çökme kartı iki yerde bırakır. Bu kasıtlı olarak bu yönde:
   * geçmiş yalnızca büyüdüğü için, kopyalardan geçmişi uzun olan her zaman
   * daha yeni olanıdır ve `recover()` bunu tek kuralla çözebilir. Ters sıra
   * (önce sil, sonra yaz) çökmede kartı tamamen kaybederdi.
   */
  async #move(card: Card, destDir: string, destName: string, from?: string): Promise<Card> {
    await mkdir(destDir, { recursive: true });
    const tmp = join(destDir, `.tmp-${randomBytes(6).toString("hex")}`);
    await writeFile(tmp, serializeCard(card));
    await rename(tmp, join(destDir, destName));
    if (from !== undefined) await rm(from, { force: true });
    return card;
  }

  #push(card: Card, entry: HistoryEntry): Card {
    return { ...card, history: [...card.history, entry] };
  }

  /** Yeni bir kartı zincirin başındaki rolün kuyruğuna koyar. */
  async add(card: Card): Promise<Card> {
    return this.#move(card, this.#queueDir(card.role), this.#queueName(card, PRIO_FRESH));
  }

  /**
   * Rolün kuyruğundan en öndeki kartı alır ve aktif hâle getirir.
   *
   * Sahiplenme `rename` ile: iki koşucu aynı kartı görse bile yalnızca biri
   * taşıyabilir, diğeri ENOENT alır ve sıradakine geçer. Kilit dosyasına
   * gerek yok.
   */
  async take(role: string): Promise<Card | null> {
    const dir = this.#activeDir(role);
    await mkdir(dir, { recursive: true });

    for (const { card, path } of await this.#scan(this.#queueDir(role))) {
      const dest = join(dir, `${card.id}.json`);
      try {
        // TALEP: tek bir rename. Başaran kartı alır, başaramayan ENOENT alıp
        // sıradakine bakar. Ara dosya yok — aradaki çökme kartı ortada
        // bırakamaz, çünkü ara yok.
        await rename(path, dest);
      } catch {
        continue;
      }
      // İçerik talepten SONRA güncellenir. Buradaki çökme kartı `active/`
      // altında eski içerikle bırakır; `recover()` dizine bakar, içeriğe
      // değil, ve kartı toplar.
      const claimed = {
        ...this.#push(card, { at: now(), event: "taken", role }),
        state: "active" as const,
      };
      await this.#rewrite(dest, claimed);
      return claimed;
    }
    return null;
  }

  /** Bir kart dosyasını yerinde, atomik olarak günceller. */
  async #rewrite(path: string, card: Card): Promise<void> {
    const tmp = join(dirname(path), `.tmp-${randomBytes(6).toString("hex")}`);
    await writeFile(tmp, serializeCard(card));
    await rename(tmp, path);
  }

  #requireActive(card: Card): { role: import("../flow/snapshot.js").SnapshotRole; path: string } {
    if (card.state !== "active") {
      throw new QueueError(
        `Kart aktif değil (${card.state}): ${card.id}. Yalnızca alınmış bir kart ilerletilebilir.`,
      );
    }
    const role = roleOf(card.topology, card.role);
    if (role === null) {
      throw new QueueError(`Kartın rolü topolojisinde yok: ${card.role} (kart ${card.id})`);
    }
    return { role, path: join(this.#activeDir(card.role), `${card.id}.json`) };
  }

  /**
   * Rol işi kabul etti: kart ileri gider.
   *
   * Bu rolün ret kenarının sayacı sıfırlanır — `reject.limit` "üst üste kaç
   * ret" demek. Kabul, seriyi kırar.
   */
  async handoff(card: Card, opts: { commit?: string; summary?: string }): Promise<Card> {
    const { role, path } = this.#requireActive(card);

    const rejects = { ...card.rejects };
    if (role.reject !== null) delete rejects[edgeKey(role.id, role.reject)];

    if (role.next === DONE) {
      const done = {
        ...this.#push({ ...card, rejects }, { at: now(), event: "done", from: role.id }),
        state: "done" as const,
      };
      return this.#move(done, join(this.#root, "done"), `${card.id}.json`, path);
    }

    const entry: HistoryEntry = {
      at: now(),
      event: "handoff",
      from: role.id,
      to: role.next,
      ...(opts.commit === undefined ? {} : { commit: opts.commit }),
      ...(opts.summary === undefined ? {} : { summary: opts.summary }),
    };

    // Kapı, kartın rolden ÇIKIŞINDA durur: iş bitti ama teslim edilmedi.
    // Bu yüzden kartın rolü değişmez; onaylandığında `release` taşır.
    if (gateAfter(card.topology, role.id) !== null) {
      const gated = {
        ...this.#push({ ...card, rejects }, entry),
        state: "gate" as const,
      };
      return this.#move(gated, join(this.#root, "gate"), `${card.id}.json`, path);
    }

    const moved = {
      ...this.#push({ ...card, rejects }, entry),
      role: role.next,
      state: "queued" as const,
    };
    return this.#move(moved, this.#queueDir(role.next), this.#queueName(moved, PRIO_FRESH), path);
  }

  /**
   * Rol işi kabul etmedi: KART geri gider, gerekçesiyle.
   *
   * Hedef kartın kendi topolojisinden okunur; akış dosyası o sırada
   * değişmiş olsa bile kart başladığı yoldan döner.
   */
  async reject(card: Card, opts: { reason: string; commit?: string }): Promise<Card> {
    const { role, path } = this.#requireActive(card);

    const reason = opts.reason.trim();
    if (reason === "") {
      throw new QueueError(
        `Gerekçesiz ret kabul edilmiyor (kart ${card.id}). "Bir şeyler yanlış" değil, ne olduğu gider.`,
      );
    }
    if (role.reject === null) {
      throw new QueueError(
        `\`${role.id}\` zincirin başı — geri dönecek rol yok. Bu rol işi yapamıyorsa insana çıkar.`,
      );
    }

    const target = role.reject;
    const round = rejectCount(card, role.id, target) + 1;
    const limit = card.topology.reject.limit;

    if (round > limit) {
      const gated = {
        ...this.#push(card, {
          at: now(),
          event: "gate",
          role: role.id,
          reason: `ret limiti doldu (${limit}): ${reason}`,
        }),
        state: "gate" as const,
      };
      return this.#move(gated, join(this.#root, "gate"), `${card.id}.json`, path);
    }

    const entry: HistoryEntry = opts.commit === undefined
      ? { at: now(), event: "reject", from: role.id, to: target, round, reason }
      : { at: now(), event: "reject", from: role.id, to: target, round, commit: opts.commit, reason };

    const sent = {
      ...this.#push(card, entry),
      role: target,
      state: "queued" as const,
      rejects: { ...card.rejects, [edgeKey(role.id, target)]: round },
    };
    return this.#move(sent, this.#queueDir(target), this.#queueName(sent, PRIO_RETURNED), path);
  }

  /**
   * Tur sonuçsuz kaldı: kartı insan kapısına çıkarır.
   *
   * Başarısız bir çağrıyı sessizce yeniden denemek parayı bir döngüde
   * yakar; "cevap vermedi"yi kabul saymak ise deneyde en pahalıya mal olan
   * hataydı. İkisi de yasak — kart durur ve görünür olur.
   */
  async escalate(card: Card, reason: string): Promise<Card> {
    const { role, path } = this.#requireActive(card);
    const gated = {
      ...this.#push(card, { at: now(), event: "gate", role: role.id, reason }),
      state: "gate" as const,
    };
    return this.#move(gated, join(this.#root, "gate"), `${card.id}.json`, path);
  }

  /**
   * İnsan kapıdaki kartı karara bağladı.
   *
   * Kapının iki çıkışı var ve bu kasıtlı. Bir onay kapısında karar "geçsin
   * mi"; ret kilidinde ise "kim haklı" — denetçi haklıysa iş üreticiye
   * döner, üretici haklıysa kart denetçiyi geçip ilerler. Tek yönlü bir
   * bırakma, anlaşmazlığı insana çıkarıp sonra insana yalnızca bir cevap
   * hakkı tanımak olurdu.
   *
   * Hangi yön seçilirse seçilsin ilgili kenarın ret sayacı sıfırlanır:
   * insan seriyi kırdı, kart hemen yeniden kapıya düşmemeli.
   */
  async release(id: string, opts: { decision?: "forward" | "back" } = {}): Promise<Card> {
    const path = join(this.#root, "gate", `${id}.json`);
    const card = await this.#readCard(path).catch(() => {
      throw new QueueError(`Kapıda böyle bir kart yok: ${id}`);
    });

    const role = roleOf(card.topology, card.role);
    if (role === null) {
      throw new QueueError(`Kartın rolü topolojisinde yok: ${card.role} (kart ${id})`);
    }

    const decision = opts.decision ?? "forward";
    // `back` hedefi: rolün ret hedefi. Zincirin başında geri dönecek rol
    // olmadığı için rol işi kendisi yeniden yapar.
    const target = decision === "forward" ? role.next : (role.reject ?? role.id);

    const rejects = { ...card.rejects };
    if (role.reject !== null) delete rejects[edgeKey(role.id, role.reject)];

    if (target === DONE) {
      const done = {
        ...this.#push({ ...card, rejects }, { at: now(), event: "done", from: role.id }),
        state: "done" as const,
      };
      return this.#move(done, join(this.#root, "done"), `${id}.json`, path);
    }

    const released = {
      ...this.#push({ ...card, rejects }, { at: now(), event: "released", role: target }),
      role: target,
      state: "queued" as const,
      rejects,
    };
    return this.#move(released, this.#queueDir(target), this.#queueName(released, PRIO_RETURNED), path);
  }

  /**
   * Yarıda kalmış işi toplar. Başlangıçta çağrılır.
   *
   * İki şey yapar: kopyaları tek kurala göre çözer (geçmişi uzun olan
   * kazanır — geçmiş yalnızca büyür), ve aktif kalmış kartları kuyruğun
   * başına geri koyar. Aktif bir kart, süreç ölmüş demektir; o iş kimsenin
   * beklemediği bir yerde durmamalı.
   */
  async recover(): Promise<Card[]> {
    const byId = new Map<string, Located[]>();
    for (const area of AREAS) {
      for (const entry of await this.#scan(join(this.#root, area))) {
        const list = byId.get(entry.card.id) ?? [];
        list.push(entry);
        byId.set(entry.card.id, list);
      }
    }

    const requeued: Card[] = [];
    for (const copies of byId.values()) {
      const sorted = copies.sort((a, b) => b.card.history.length - a.card.history.length);
      const keep = sorted[0] as Located;
      for (const stale of sorted.slice(1)) {
        await rm(stale.path, { force: true });
      }

      // Dizin otoritedir, içerik değil: `active/` altındaki her kart yarıda
      // kalmıştır, içeriğinde ne yazarsa yazsın.
      if (!keep.path.startsWith(join(this.#root, "active") + sep)) continue;
      const card = {
        ...this.#push(keep.card, {
          at: now(),
          event: "requeued",
          role: keep.card.role,
          reason: "süreç yarıda kesildi",
        }),
        state: "queued" as const,
      };
      await this.#move(card, this.#queueDir(card.role), this.#queueName(card, PRIO_RETURNED), keep.path);
      requeued.push(card);
    }
    return requeued;
  }
}

function now(): string {
  return new Date().toISOString();
}
