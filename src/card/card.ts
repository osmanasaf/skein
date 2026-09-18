import { randomBytes } from "node:crypto";
import { edgeKey, headOf, type TopologySnapshot } from "../flow/snapshot.js";

/**
 * Kartın bulunduğu yer. Dosya sisteminde tam olarak bir dizine karşılık
 * gelir; kart her zaman bir ve yalnız bir yerdedir.
 */
export type CardState = "queued" | "active" | "gate" | "done";

export type HistoryEntry =
  | { at: string; event: "created"; role: string }
  | { at: string; event: "taken"; role: string }
  | {
      at: string;
      event: "handoff";
      from: string;
      to: string;
      commit?: string;
      /**
       * Devreden rolün kendi özeti — sonraki role iletilir.
       *
       * Kod git'te taşınıyor, ama BELGE üreten bir rolün çıktısı (kabul
       * kriterleri, kapsam sınırı) hiçbir yere taşınmıyordu: verdikt
       * dosyasında kalıp siliniyordu. 4 rollü canlı koşu bunu ortaya
       * çıkardı — `analyst` kriterleri yazdı, `coder` özgün belirsiz görevi
       * aldı ve kendi kriterlerini uydurdu.
       *
       * Ret gerekçesi zaten böyle taşınıyordu; bu onun simetriği.
       */
      summary?: string;
    }
  | {
      /**
       * Planlama alışverişinde bir tur (PLANLAMA.md 6b).
       *
       * `reject` değil: ret, işin reddidir ve kenar sayacını ilerletir.
       * Bu, plan üzerinde yürüyen ayrı bir döngü — sayacı kendi `round`u.
       */
      at: string;
      event: "plan";
      role: string;
      /** `yazdi` planı yazdı, `itiraz` itiraz etti, `cevap` itirazları yanıtladı. */
      action: "yazdi" | "itiraz" | "cevap";
      /** İtiraz→cevap döngüsünün sırası; plan yazma turunda 0. */
      round: number;
      /** Bu turdan sonra geçerli itiraz sayısı. */
      objections?: number;
      /** Sayılmayan itirazlar: biçimi tutmayan ya da kanıtı bulunmayan. */
      invalid?: number;
      /** Kabul edilmiş itiraz sayısı. */
      accepted?: number;
      /** Plan dosyasının o turdaki hash'i. */
      planHash?: string;
    }
  | {
      at: string;
      event: "reject";
      from: string;
      to: string;
      /** Bu kenarda kaçıncı ret. */
      round: number;
      commit?: string;
      reason: string;
    }
  | {
      at: string;
      event: "gate";
      role: string;
      reason: string;
      /**
       * Kartı hangi sebep durdurdu.
       *
       * - `deadlock` — tur TAMAMLANDI, kart politika yüzünden durdu (ret
       *   limiti doldu). Kod yerinde; "üretici haklı" denip ileri
       *   bırakılabilir.
       * - `escalation` — tur tamamlanmadı (kirli ağaç, verdikt yok, çakışma).
       *   Kod bir sonraki worktree'ye HİÇ taşınmadı.
       *
       * İkisi de `state: "gate"` bırakıyor ve rolü değiştirmiyordu; fark
       * kayıtta yazmadığı için ileri bırakma sessizce bayat ağaç
       * üretebiliyordu. Alan eksikse `escalation` varsayılır — güvenli yön.
       */
      kind?: "deadlock" | "escalation";
    }
  | { at: string; event: "released"; role: string }
  | { at: string; event: "requeued"; role: string; reason: string }
  | {
      at: string;
      event: "done";
      from: string;
      /**
       * Kart normal yoldan değil, insan kararıyla kapandıysa sebebi.
       *
       * "Bitti" iki farklı şey olabiliyor: zinciri tamamlamak, ve akışta
       * karşılığı kalmamış bir kartı kapatmak. İkisini ayırt edemeyen bir
       * geçmiş, sonradan bakan birine yalan söyler.
       */
      reason?: string;
    };

export interface Card {
  id: string;
  title: string;
  /** Role verilecek iş metni. */
  task: string;
  createdAt: string;
  /** Kartın şu an hangi rolde olduğu. */
  role: string;
  state: CardState;
  /**
   * Kenar ("reviewer->coder") başına ÜST ÜSTE ret sayısı.
   *
   * Reddeden rol aynı kartı kabul edince o kenarın sayacı sıfırlanır:
   * `reject.limit` "üst üste kaç ret" demek, "ömür boyu kaç ret" değil.
   * Aksi hâlde uzun yaşayan bir kart, ilgisiz turlarda biriken sayaçlar
   * yüzünden insan kapısına takılırdı.
   */
  rejects: Record<string, number>;
  history: HistoryEntry[];
  /**
   * Kartın başladığı topoloji, dondurulmuş.
   *
   * Yönlendirme canlı YAML'dan değil buradan okunur — akış dosyası yolda
   * olan kartı bozamaz.
   */
  topology: TopologySnapshot;
  /**
   * Planın dondurulmuş hâli — planı yazan rol devrettiğinde konur.
   *
   * Topoloji hash'inin kardeşi: kartın hangi planla yürüdüğü, plan dosyası
   * sonradan düzenlense bile sonradan bilinebilsin. Sonraki roller planı
   * dosyadan okur; bu alan "hangi sürümünü okuması gerekiyordu"nun kaydı.
   */
  plan?: { path: string; hash: string };
}

export class CardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CardError";
  }
}

const STATES: readonly CardState[] = ["queued", "active", "gate", "done"];

/** `c-20260913-9f2a1c` — tarih gözle taranabilsin, çakışma olmasın diye. */
function newId(now: Date): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `c-${day}-${randomBytes(3).toString("hex")}`;
}

export interface NewCardInput {
  title: string;
  task: string;
  topology: TopologySnapshot;
  /** Testler için sabitlenebilir. */
  now?: Date;
}

/** Yeni bir kart açar: zincirin başında, kuyrukta, topolojisi pinlenmiş. */
export function newCard(input: NewCardInput): Card {
  const title = input.title.trim();
  const task = input.task.trim();
  if (title === "") throw new CardError("Kartın başlığı boş olamaz");
  if (task === "") {
    throw new CardError("Kartın görev metni boş olamaz — role verilecek iş bu");
  }

  const now = input.now ?? new Date();
  const at = now.toISOString();
  const role = headOf(input.topology);

  return {
    id: newId(now),
    title,
    task,
    createdAt: at,
    role,
    state: "queued",
    rejects: {},
    history: [{ at, event: "created", role }],
    topology: input.topology,
  };
}

/**
 * Kart kapıda duruyorsa HANGİ kapıda.
 *
 * İki kapı var ve karıştırılmaları pahalıya mal oluyor:
 *
 * - **onay** — rol işini bitirdi, kod bir sonraki worktree'ye BİRLEŞTİRİLDİ,
 *   kart devredilmeden önce insana soruluyor. Son kayıt bir `handoff`.
 * - **kilit** (`deadlock`) — ret limiti doldu. Tur tamamlandı, kod yerinde;
 *   karar "kim haklı".
 * - **kaçış** (`escalation`) — tur tamamlanmadı (kirli ağaç, verdikt yok,
 *   çakışma). Kod HİÇ taşınmadı ve kart hâlâ aynı rolde.
 *
 * Fark görünmezdi: ikisinde de `state: "gate"` ve rol değişmemiş oluyor.
 * Kaçıştan sonra "ileri bırak" denince kod taşınmadığı için sonraki rol
 * bayat bir ağaçta çalışıyor ve bunu kimse söylemiyordu.
 */
export function gateKind(card: Card): "approval" | "deadlock" | "escalation" | null {
  if (card.state !== "gate") return null;
  const last = card.history[card.history.length - 1];
  if (last?.event === "gate") return last.kind ?? "escalation";
  if (last?.event === "handoff") return "approval";
  return null;
}

/**
 * Kart bir PLANLAMA kilidinde mi bekliyor.
 *
 * Kapı kaydının hemen öncesinde bir `plan` cevabı varsa, bu kapı alışverişin
 * tükenmesinden doğmuştur. Ayrımın bedeli var: böyle bir kartta "ileri
 * bırak", zincirdeki ardıla (itiraz eden role) değil, alışverişten SONRAKİ
 * role gitmeli. Aksi hâlde insan "planı olduğu gibi kabul ediyorum" dediğinde
 * kart itiraz edene geri döner ve bir tur daha para harcar.
 */
export function planGateEntry(card: Card): Extract<HistoryEntry, { event: "plan" }> | null {
  if (card.state !== "gate") return null;
  const last = card.history[card.history.length - 1];
  if (last?.event !== "gate") return null;
  const prev = card.history[card.history.length - 2];
  return prev?.event === "plan" && prev.action === "cevap" ? prev : null;
}

export function rejectCount(card: Card, from: string, to: string): number {
  return card.rejects[edgeKey(from, to)] ?? 0;
}

/** Okunabilir dursun diye girintili; dosya olarak `git diff`'e de girer. */
export function serializeCard(card: Card): string {
  return `${JSON.stringify(card, null, 2)}\n`;
}

function need(doc: Record<string, unknown>, field: string, kind: "string" | "object"): unknown {
  const value = doc[field];
  if (kind === "string" && (typeof value !== "string" || value.trim() === "")) {
    throw new CardError(`Kart alanı eksik ya da metin değil: \`${field}\``);
  }
  if (kind === "object" && (value === null || typeof value !== "object")) {
    throw new CardError(`Kart alanı eksik ya da nesne değil: \`${field}\``);
  }
  return value;
}

/**
 * Bir kart dosyasını okur.
 *
 * Olay günlüğünün aksine okuma KATI: günlük geçmişin kaydı, kart durumun
 * kendisidir. Bozuk bir kartı hoşgörmek, sessizce geçmiş kaybetmek ya da
 * kartı yanlış role göndermek demek. Bilinmeyen üst düzey alanlar yok
 * sayılır — ileri uyumluluk için tek taviz.
 */
export function parseCard(text: string): Card {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    throw new CardError(`Kart geçerli JSON değil: ${(cause as Error).message}`);
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new CardError("Kart bir nesne olmalı");
  }
  const doc = raw as Record<string, unknown>;

  const id = need(doc, "id", "string") as string;
  const title = need(doc, "title", "string") as string;
  const task = need(doc, "task", "string") as string;
  const createdAt = need(doc, "createdAt", "string") as string;
  const role = need(doc, "role", "string") as string;

  const state = doc["state"];
  if (typeof state !== "string" || !STATES.includes(state as CardState)) {
    throw new CardError(`Kart alanı geçersiz: \`state\` = ${String(state)}. ` +
      `Beklenen: ${STATES.join(", ")}`);
  }

  const rejects = need(doc, "rejects", "object") as Record<string, unknown>;
  for (const [edge, count] of Object.entries(rejects)) {
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      throw new CardError(`Kart alanı geçersiz: \`rejects["${edge}"]\` negatif olmayan tamsayı olmalı`);
    }
  }

  const history = doc["history"];
  if (!Array.isArray(history) || history.length === 0) {
    throw new CardError("Kart alanı eksik ya da boş: `history` — kartın nereden geldiği kaybolamaz");
  }
  for (const [i, entry] of history.entries()) {
    if (entry === null || typeof entry !== "object" || typeof (entry as Record<string, unknown>)["event"] !== "string") {
      throw new CardError(`Kart alanı geçersiz: \`history[${i}]\``);
    }
  }

  const topology = need(doc, "topology", "object") as Record<string, unknown>;
  if (!Array.isArray(topology["roles"]) || topology["roles"].length === 0) {
    throw new CardError("Kart alanı geçersiz: `topology.roles` boş — yönlendirme buradan okunuyor");
  }
  if (typeof topology["hash"] !== "string") {
    throw new CardError("Kart alanı eksik: `topology.hash`");
  }

  // Plan isteğe bağlı ama varsa KATI: yarım bir plan kaydı, "hangi planla
  // yürüdü" sorusunu cevaplıyormuş gibi görünüp cevaplamaz.
  const planRaw = doc["plan"];
  let plan: { path: string; hash: string } | undefined;
  if (planRaw !== undefined && planRaw !== null) {
    const rec = planRaw as Record<string, unknown>;
    if (typeof rec["path"] !== "string" || typeof rec["hash"] !== "string"
      || rec["path"].trim() === "" || rec["hash"].trim() === "") {
      throw new CardError("Kart alanı geçersiz: `plan` — `path` ve `hash` boş olmayan metin olmalı");
    }
    plan = { path: rec["path"], hash: rec["hash"] };
  }

  return {
    id,
    title,
    task,
    createdAt,
    role,
    state: state as CardState,
    rejects: rejects as Record<string, number>,
    history: history as HistoryEntry[],
    topology: topology as unknown as TopologySnapshot,
    ...(plan === undefined ? {} : { plan }),
  };
}
