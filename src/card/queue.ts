import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { afterPlanning, DONE, edgeKey, gateAfter, roleOf } from "../flow/snapshot.js";
import {
  gateKind, parseCard, planGateEntry, rejectCount, serializeCard,
  type Card, type HistoryEntry,
} from "./card.js";

/**
 * İnsanın kapıdaki karta verdiği karar.
 *
 * `retry` yalnızca kaçış kapısında anlamlı: tur tamamlanmadı, sebebi
 * giderildi, aynı rol baştan koşsun.
 */
export type ReleaseDecision = "forward" | "back" | "retry";

/**
 * Kuyruktaki bir kart dosyası alınamadı ve bu YARIŞ DEĞİL.
 *
 * Yarışı kaybetmek (ENOENT) normaldir ve sessizdir; gerisi gerçek bir
 * engeldir ve kart kuyrukta kalır.
 */
export interface KuyrukEngeli {
  /** Alınamayan kart dosyasının yolu. */
  path: string;
  /** `errno` kodu; yoksa "?". */
  code: string;
  message: string;
}

export type TakeResult =
  /** Kart alındı. `engeller` boş olmayabilir: başka kartlar alınamamış olabilir. */
  | { kind: "alindi"; card: Card; engeller: KuyrukEngeli[] }
  /** Kuyrukta kart yok. Engel de yok — alan bilerek bulunmuyor. */
  | { kind: "bos" }
  /** Kuyrukta kart VAR ama hiçbiri alınamadı. */
  | { kind: "engel"; engeller: KuyrukEngeli[] };

export class QueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueError";
  }
}

/** Kapı kararının GERÇEKTEN ne yaptığı. */
export interface KapiKarari {
  kind: "approval" | "deadlock" | "escalation";
  /** İnsanın istediği karar; verilmediyse kapının varsayılanı. */
  istenen: ReleaseDecision;
  /**
   * UYGULANAN karar — istenenden farklı olabilir.
   *
   * Zincirin başında `back`'in hedefi yok (`role.reject === null`) ve rol
   * işi kendisi yeniden yapıyor, yani olan şey bir `retry`. Eskiden bu
   * ayrım hiçbir yere yazılmıyordu: `releaseCard` günlüğe İSTENENİ
   * basıyordu, dolayısıyla "insan kartı geri gönderdi mi" sorusu
   * günlükten YANLIŞ cevaplanıyordu — hiç geri gitmemiş kartlar `back`
   * olarak sayılıyordu.
   */
  uygulanan: ReleaseDecision;
  /** Kartın gittiği rol (ya da `DONE`). */
  hedef: string;
}

/**
 * Kapı kararını TEK yerden hesaplar.
 *
 * Eskiden iki yerde hesaplanıyordu: `queue.release` hedefi, `releaseCard`
 * ise günlüğe yazdığı kararı — aynı varsayılan ifadesi (`escalation ?
 * retry : forward`) iki dosyada ayrı ayrı yazılıydı. "Aynı bilgi iki
 * yerde" bu depoda tekrarlayan kusur sınıfı; ikisi de buradan okuyor.
 */
export function kapiKarari(card: Card, istenenGiris?: ReleaseDecision): KapiKarari {
  const role = roleOf(card.topology, card.role);
  if (role === null) {
    throw new QueueError(`Kartın rolü topolojisinde yok: ${card.role} (kart ${card.id})`);
  }
  const kind = gateKind(card) ?? "approval";
  const istenen = istenenGiris ?? (kind === "escalation" ? "retry" : "forward");

  // Planlama kilidinden ileri bırakmak, alışverişten SONRAKİ role gider:
  // zincirdeki ardıl itiraz eden roldür ve oraya dönmek, insanın "planı
  // olduğu gibi kabul ediyorum" kararını bir tur daha alışverişe çevirir.
  const ileri = planGateEntry(card) === null
    ? role.next
    : (afterPlanning(card.topology) ?? role.next);

  // `back` hedefi: rolün ret hedefi. Zincirin başında geri dönecek rol
  // olmadığı için rol işi kendisi yeniden yapar — ve bu bir `retry`'dir,
  // öyle de kaydedilir.
  const geriHedefi = role.reject;
  const uygulanan: ReleaseDecision =
    istenen === "back" && geriHedefi === null ? "retry" : istenen;

  const hedef =
    uygulanan === "retry" ? role.id : uygulanan === "forward" ? ileri : (geriHedefi ?? role.id);

  return { kind, istenen, uygulanan, hedef };
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
 * Kopya kartlarda TEK kural: geçmişi UZUN olan kazanır.
 *
 * Geçmiş yalnızca büyüyor, yani uzunluk "hangisi daha ileri" sorusunun
 * güvenilir cevabı. Kural üç yerde gerekiyor (`get`, `recover`, `close`)
 * ve üçüncüsünde YAZILI DEĞİLDİ: `close` `found[0]` alıyordu, yani tarama
 * sırasının verdiği rastgele kopyayı. Sonucu iki yönlü: bayat kopya
 * arşivlenip güncel olan kuyrukta kalıyor, ve insan "Kartı kapat" dedikten
 * sonra kart panoda DURMAYA devam ediyor — kapatma kapatmıyor.
 *
 * "Aynı bilgi iki (üç) yerde" bu depoda tekrarlayan kusur sınıfı; kural
 * artık tek yerde.
 */
function kopyaSirasi(copies: Located[]): Located[] {
  // `sort` yerinde çalışır, o yüzden kopya alınıyor. İHTİYAT, ölçülmüş bir
  // kusur DEĞİL: bugünkü üç çağıranın hiçbiri listesini sonra kullanmıyor
  // ve "yerinde sırala" mutasyonu sınamaların hiçbirini düşürmüyor. Böyle
  // yazılı, çünkü ısırmayan bir satırı ısırıyormuş gibi anlatmak bu depoda
  // ayrı bir kusur sayılıyor.
  return [...copies].sort((a, b) => b.card.history.length - a.card.history.length);
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
    const card = await this.#readCardIfPresent(path);
    if (card === null) {
      throw new QueueError(`Kart dosyası yok: ${path}`);
    }
    return card;
  }

  /**
   * Kartı okur; dosya YOKSA null.
   *
   * Taramayla okuma arasında bir dosya kaybolabiliyor ve bu iyi huylu bir
   * yarış: öteki koşucu kartı aldı, yani yeniden adlandırdı. Eskiden ENOENT
   * `#scan`'den dışarı fırlıyordu ve `take` yarışı KAYBEDEN tarafta `null`
   * dönmek yerine çöküyordu — gözcü süreci bir kartı kaybetmekle kalmayıp
   * ölürdü. 300 denemelik zorlamada ilk denemede çıktı.
   *
   * Ayrım korunuyor: kaybolan dosya atlanıyor, BOZUK dosya hâlâ hata.
   * Birincisi eşzamanlılığın normali, ikincisi veri kaybı.
   */
  async #readCardIfPresent(path: string): Promise<Card | null> {
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw cause;
    }
    try {
      return parseCard(text);
    } catch (cause) {
      throw new QueueError(`Bozuk kart dosyası: ${path} — ${(cause as Error).message}`);
    }
  }

  /**
   * Bir dizindeki (ve alt dizinlerindeki) kart dosyalarını okur.
   *
   * BOZUK dosya artık FIRLATMIYOR, ayrı listeye düşüyor. Ölçülmüş kusur:
   * `#scan` özyinelemeli ve dört alanı da tarıyor, yani `done/` altındaki
   * bozuk bir dosya `recover()`'ı fırlatıyordu. `serve`'in süpürmesinde
   * try/catch yok, dolayısıyla gözcü süreci ÖLÜYOR; yeniden başlatmada
   * kilitten sonraki ilk iş yine `recover()` olduğu için gözcü artık
   * HİÇBİR akış için açılamıyordu. Bitmiş bir kartın bozuk kaydı bütün
   * sistemi tutuyordu.
   *
   * "Sessizce de geçmez" kuralı korunuyor: bozuk yollar `bozuklar()` ile
   * dışa veriliyor, `get()` aranan kartı bulamazsa onları adıyla
   * fırlatıyor, ve gözcü açılışta uyarı basıyor. Fark şu: artık İLGİSİZ
   * her işlemi durdurmuyor.
   */
  async #scan(dir: string): Promise<{ kartlar: Located[]; bozuk: string[] }> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return { kartlar: [], bozuk: [] };
    }
    const kartlar: Located[] = [];
    const bozuk: string[] = [];
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        const alt = await this.#scan(path);
        kartlar.push(...alt.kartlar);
        bozuk.push(...alt.bozuk);
      } else if (entry.name.endsWith(".json") && !entry.name.startsWith(".tmp-")) {
        // Dosya tarandıktan sonra kaybolmuş olabilir: öteki koşucu aldı.
        try {
          const card = await this.#readCardIfPresent(path);
          if (card !== null) kartlar.push({ card, path });
        } catch {
          bozuk.push(path);
        }
      }
    }
    return { kartlar, bozuk };
  }

  /** Dört alanın hepsini tarar; sağlam kartlar ve bozuk yollar. */
  async #tara(): Promise<{ kartlar: Located[]; bozuk: string[] }> {
    const kartlar: Located[] = [];
    const bozuk: string[] = [];
    for (const area of AREAS) {
      const r = await this.#scan(join(this.#root, area));
      kartlar.push(...r.kartlar);
      bozuk.push(...r.bozuk);
    }
    return { kartlar, bozuk };
  }

  /**
   * Ayrıştırılamayan kart dosyalarının yolları.
   *
   * Gözcü açılışta basıyor: bozukluk ölümcül değil ama SESSİZ de değil.
   */
  async bozuklar(): Promise<string[]> {
    return (await this.#tara()).bozuk;
  }

  async #locate(id: string): Promise<Located[]> {
    return (await this.#tara()).kartlar.filter((entry) => entry.card.id === id);
  }

  async get(id: string): Promise<Card | null> {
    const { kartlar, bozuk } = await this.#tara();
    const found = kartlar.filter((entry) => entry.card.id === id);
    const card = kopyaSirasi(found)[0]?.card;
    if (card !== undefined) return card;
    // Aranan kart BOZUK olanlardan biri olabilir: "böyle bir kart yok"
    // demek veri kaybını yokluk gibi okutmak olurdu.
    if (bozuk.length > 0) {
      throw new QueueError(
        `\`${id}\` bulunamadı ve ${bozuk.length} kart dosyası okunamıyor: ${bozuk.join(", ")}`,
      );
    }
    return null;
  }

  async list(): Promise<Card[]> {
    const all: Card[] = [];
    for (const area of AREAS) {
      all.push(...(await this.#scan(join(this.#root, area))).kartlar.map((e) => e.card));
    }
    return all;
  }

  async depth(role: string): Promise<number> {
    return (await this.#scan(this.#queueDir(role))).kartlar.length;
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
  async take(role: string): Promise<TakeResult> {
    const dir = this.#activeDir(role);
    await mkdir(dir, { recursive: true });
    const engeller: KuyrukEngeli[] = [];

    for (const { card, path } of (await this.#scan(this.#queueDir(role))).kartlar) {
      const dest = join(dir, `${card.id}.json`);
      try {
        // TALEP: tek bir rename. Başaran kartı alır, başaramayan ENOENT alıp
        // sıradakine bakar. Ara dosya yok — aradaki çökme kartı ortada
        // bırakamaz, çünkü ara yok.
        await rename(path, dest);
      } catch (cause) {
        const code = (cause as NodeJS.ErrnoException).code ?? "?";
        // ENOENT: yarışı KAYBETTİK, kartı başka bir süreç aldı. Eşzamanlılığın
        // normali, sessizce sıradakine.
        //
        // Her şey DEĞİL. Eski hâli `catch { continue; }` idi, yani EACCES,
        // EPERM, EBUSY, EXDEV, ENOSPC, EROFS — hepsi "yarış" sayılıyordu:
        // kart kuyrukta kalıyor, `take` "kuyruk boş" diyor ve hiçbir yere
        // tek satır teşhis yazılmıyordu. Kart sonsuza kadar duruyordu.
        //
        // Windows'ta virüs tarayıcısı ya da dosya dizinleyicisi açık tuttuğu
        // bir dosyanın `rename`'ine EPERM/EBUSY verir. Üretilemeyen "Windows
        // kuyruk arızası" bulgusunun adaylarından biri tam bu ve sessizce
        // yutuluyordu; artık en azından KONUŞUYOR.
        //
        // Yeniden deneme YOK, çünkü gereksiz: gözcü zaten döngüde, sonraki
        // geçiş denemenin kendisidir. Tek seferlik CLI'de ise kullanıcı
        // teşhisi görüp kendi karar verir.
        if (code === "ENOENT") continue;
        engeller.push({ path, code, message: (cause as Error).message });
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
      return { kind: "alindi", card: claimed, engeller };
    }
    // "Boş" ile "alınamadı" yapısal olarak ayrı: `bos` varyantının `engeller`
    // alanı YOK, yani engel varken "kuyruk boş" demek tip düzeyinde
    // temsil edilemiyor. Bu projede en sık tekrarlayan kusur sınıfı
    // "bildiğinden az söyleyen rapor yolu"; burada o yol kapatıldı.
    return engeller.length === 0 ? { kind: "bos" } : { kind: "engel", engeller };
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
  async handoff(
    card: Card,
    opts: { commit?: string; summary?: string; plan?: { path: string; hash: string } },
  ): Promise<Card> {
    const { role, path } = this.#requireActive(card);

    const rejects = { ...card.rejects };
    if (role.reject !== null) delete rejects[edgeKey(role.id, role.reject)];

    // Plan, kartın üstünde donuyor: hangi planla yürüdüğü, dosya sonradan
    // düzenlense bile bilinsin (topoloji hash'inin kardeşi).
    const withPlan = opts.plan === undefined ? card : { ...card, plan: opts.plan };

    if (role.next === DONE) {
      const done = {
        ...this.#push({ ...withPlan, rejects }, { at: now(), event: "done", from: role.id }),
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
        ...this.#push({ ...withPlan, rejects }, entry),
        state: "gate" as const,
      };
      return this.#move(gated, join(this.#root, "gate"), `${card.id}.json`, path);
    }

    const moved = {
      ...this.#push({ ...withPlan, rejects }, entry),
      role: role.next,
      state: "queued" as const,
    };
    return this.#move(moved, this.#queueDir(role.next), this.#queueName(moved, PRIO_FRESH), path);
  }

  /**
   * Planlama alışverişinde kartı bir katılımcıdan diğerine taşır.
   *
   * `handoff` değil: devir teslim zincirin `next`ini izler ve kapı
   * kontrolünden geçer. Planlama kendi döngüsü — kart katılımcılar arasında
   * gidip geliyor ve zincir ancak alışveriş kapandığında devreye giriyor.
   * `reject` de değil: ret kenar sayacını ilerletir, bu ilerletmemeli.
   */
  async planTurn(
    card: Card,
    to: string,
    entry: Extract<HistoryEntry, { event: "plan" }>,
    plan?: Card["plan"],
  ): Promise<Card> {
    const { path } = this.#requireActive(card);
    const withPlan = plan === undefined ? card : { ...card, plan };

    // Alışveriş zincirin SONUNDA kapanıyorsa kart biter. `queue/done` diye
    // bir rol kuyruğu açmak, kartı var olmayan bir role göndermek olurdu.
    if (to === DONE) {
      const kayitli = this.#push(withPlan, entry);
      const done = {
        ...this.#push(kayitli, { at: now(), event: "done", from: card.role }),
        state: "done" as const,
      };
      return this.#move(done, join(this.#root, "done"), `${card.id}.json`, path);
    }

    const moved = {
      ...this.#push(withPlan, entry),
      role: to,
      state: "queued" as const,
    };
    // Yarım kalmış alışveriş, taze kartın önünde: bir kartı planlamada
    // asılı bırakıp yenisine başlamak, iki yarım iş demek.
    return this.#move(moved, this.#queueDir(to), this.#queueName(moved, PRIO_RETURNED), path);
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
          // Tur tamamlandı; kod devredildiği yerde duruyor. "Üretici haklı"
          // denip ileri bırakılabilir.
          kind: "deadlock",
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
  /**
   * Tur tamamlandı ama anlaşma çıkmadı: KİLİT kapısı.
   *
   * Kaçış kapısından farkı, insanın elindeki seçenek: kaçışta kod hiç
   * taşınmadı ve "ileri bırak" yasak; burada tur bitti, kod yerinde ve
   * insan planı olduğu gibi kabul edip ilerletebilir. Planlama alışverişi
   * turu dolduğunda buraya çıkıyor (PLANLAMA.md).
   */
  /**
   * `plan`: kilit kapısına çıkan kartın dondurulmuş planı ve YÜKÜMLÜLÜKLERİ.
   *
   * Eskiden bu parametre yoktu ve sonucu şuydu: kabul edilmiş itirazlar
   * yalnızca `planTurn` yolundan karta yazılıyordu, yani alışveriş bir
   * kapıdan çıktığında (`insana` ya da tavan doldu) hiç yazılmıyordu.
   * İnsan `forward` dediğinde kart `afterPlanning`'e gidiyor, denetçinin
   * yükümlülük listesi BOŞ oluyor ve kabul edilmiş itiraz hiç
   * denetlenmiyordu — kapının kurulma gerekçesinin tam tersi.
   *
   * `tur: 1` olan akışlarda ilk cevap turu TEK cevap turu olduğu için
   * yükümlülükler bu yoldan hiçbir zaman yazılamıyordu.
   */
  async deadlock(
    card: Card,
    reason: string,
    entry?: Extract<HistoryEntry, { event: "plan" }>,
    plan?: Card["plan"],
  ): Promise<Card> {
    const { role, path } = this.#requireActive(card);
    const planli = plan === undefined ? card : { ...card, plan };
    const kayitli = entry === undefined ? planli : this.#push(planli, entry);
    const gated = {
      ...this.#push(kayitli, { at: now(), event: "gate", role: role.id, reason, kind: "deadlock" }),
      state: "gate" as const,
    };
    return this.#move(gated, join(this.#root, "gate"), `${card.id}.json`, path);
  }

  async escalate(card: Card, reason: string): Promise<Card> {
    const { role, path } = this.#requireActive(card);
    const gated = {
      ...this.#push(card, { at: now(), event: "gate", role: role.id, reason, kind: "escalation" }),
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
  async release(id: string, opts: { decision?: ReleaseDecision } = {}): Promise<Card> {
    const path = join(this.#root, "gate", `${id}.json`);
    const card = await this.#readCard(path).catch(() => {
      throw new QueueError(`Kapıda böyle bir kart yok: ${id}`);
    });

    const role = roleOf(card.topology, card.role);
    if (role === null) {
      throw new QueueError(`Kartın rolü topolojisinde yok: ${card.role} (kart ${id})`);
    }

    const karar = kapiKarari(card, opts.decision);
    const kind = karar.kind;
    const decision = karar.istenen;
    // Kaçış kapısında tur TAMAMLANMADI: kod bir sonraki worktree'ye hiç
    // birleştirilmedi. İleri bırakmak, sonraki role bayat bir ağaçta
    // çalıştırmak olurdu — ve hiçbir yerde görünmezdi.
    if (kind === "escalation" && decision === "forward") {
      const reason = lastGateReason(card);
      throw new QueueError(
        `Bu kart kaçış kapısında, onay kapısında değil — ileri bırakılamaz.\n\n` +
          `  Tur tamamlanmadı, yani kod \`${role.next}\` worktree'sine HİÇ taşınmadı;\n` +
          `  ileri bırakılsa sonraki rol bayat bir ağaçta çalışırdı.\n\n` +
          (reason === null ? "" : `  Sebep: ${reason}\n\n`) +
          `  Sebebi giderip \`retry\` ile aynı role geri ver (varsayılan), ya da\n` +
          `  \`back\` ile önceki role gönder.`,
      );
    }

    const target = karar.hedef;

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
   * Aktif kartı kuyruğa GERİ KOYAR — tur hiç başlamadan.
   *
   * `recover()` ile aynı mekanizma, farkı niyeti: orada süreç yarıda
   * kesilmiştir ve kart arkada kalmıştır; burada tur BİLEREK başlatılmadı
   * (ör. çalışma ağacı kirli) ve kartın bunun bedelini ödememesi gerekiyor.
   *
   * NİYE kapıya çıkarmıyor: ortam sorunu kartın kusuru değil. Kirli bir
   * ağaç yüzünden kartları tek tek kapıya çıkarmak, bir tek dosya yüzünden
   * bütün kuyruğu insana yıkardı. Kart kuyrukta kalıyor, engel ekranda
   * görünüyor, ağaç temizlenince tur kendiliğinden koşuyor.
   *
   * Geri dönen kart taze kartın ÖNÜNE geçiyor (`PRIO_RETURNED`): başlamış
   * bir iş, başlamamışın önünde gelir.
   */
  async requeue(card: Card, reason: string): Promise<Card> {
    const { role, path } = this.#requireActive(card);
    const geri = {
      ...this.#push(card, { at: now(), event: "requeued", role: role.id, reason }),
      state: "queued" as const,
    };
    return this.#move(geri, this.#queueDir(role.id), this.#queueName(geri, PRIO_RETURNED), path);
  }

  /**
   * Kartı insan kararıyla kapatır — iş bitmeden.
   *
   * Tek kullanımı: akışta karşılığı kalmamış kart (bkz. `src/card/orphan.ts`).
   * `handoff` gibi zincirin sonunu beklemiyor, çünkü bekleyecek bir zincir
   * yok; kart `done`'a gerekçesiyle gider ve izini bırakır.
   *
   * `active` kart kapatılamaz: o an bir ajan koşuyor olabilir ve altından
   * kartı çekmek, parası ödenmiş bir turu ortada bırakmak olurdu.
   */
  async close(id: string, reason: string): Promise<Card> {
    const trimmed = reason.trim();
    if (trimmed === "") throw new QueueError("Kapatma gerekçesi boş olamaz");

    const kopyalar = kopyaSirasi(await this.#locate(id));
    const here = kopyalar[0];
    if (here === undefined) throw new QueueError(`Böyle bir kart yok: ${id}`);
    if (here.card.state === "done") throw new QueueError(`Kart zaten bitmiş: ${id}`);
    // Karar KAZANANIN durumuna göre, kopyaların herhangi birine göre
    // değil. İlk yazımda "herhangi bir kopya aktifse reddet" yapmıştım ve
    // yanlıştı: `active/` altında kalmış bayat bir kopya tam olarak ÇÖPTÜR
    // (yeniden adlandırma ile unlink arasında çökmüş bir süreç bırakır) ve
    // ona bakmak, çökme sonrası yetim kartı kapatmayı — bu düğmenin tek
    // işini — imkânsız kılardı. Kazanan ileri gitmişse tur tamamlanmıştır.
    if (here.card.state === "active") {
      throw new QueueError(
        `\`${id}\` şu an bir rolde koşuyor; kapatmadan önce turun bitmesini bekle.`,
      );
    }

    // Kaybeden kopyalar SİLİNİR, yoksa kapatma kapatmaz: kart `done`'a
    // gider ama kopyası kuyrukta kaldığı için panoda durmaya devam eder.
    // `recover()` aynı kuralla aynı şeyi yapıyor; burada yapılmaması
    // kuralın üçüncü yerde eksik yazılmasının sonucuydu.
    for (const bayat of kopyalar.slice(1)) {
      await rm(bayat.path, { force: true });
    }

    const closed = {
      ...this.#push(here.card, { at: now(), event: "done" as const, from: here.card.role, reason: trimmed }),
      state: "done" as const,
    };
    return this.#move(closed, join(this.#root, "done"), `${id}.json`, here.path);
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
    for (const entry of (await this.#tara()).kartlar) {
      const list = byId.get(entry.card.id) ?? [];
      list.push(entry);
      byId.set(entry.card.id, list);
    }

    const requeued: Card[] = [];
    for (const copies of byId.values()) {
      const sorted = kopyaSirasi(copies);
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

/** Kaçış kapısındaki kartın gerekçesi — hata mesajında gösterilir. */
function lastGateReason(card: Card): string | null {
  const last = card.history[card.history.length - 1];
  return last?.event === "gate" ? last.reason : null;
}

function now(): string {
  return new Date().toISOString();
}
