import { join } from "node:path";
import { gateKind, type Card, type CardState } from "../card/card.js";
import { isOrphan, isStale } from "../card/orphan.js";
import type { CardQueue } from "../card/queue.js";
import { readEvents, type SkeinEvent } from "../events/log.js";
import type { TopologySnapshot } from "../flow/snapshot.js";
import { pidAlive, readLock, type LockInfo } from "../watch/lock.js";

/**
 * Ekranın okuduğu model.
 *
 * Tamamı TÜRETİLMİŞ: kaynak `.skein/` dizinleri, kartların kendi geçmişi ve
 * olay günlüğü. Burada tutulan hiçbir şey yeni durum değil — model silinse
 * bir sonraki okumada aynen geri gelir (ARCHITECTURE, değişmez 1).
 */
export interface UiModel {
  flow: {
    name: string;
    hash: string;
    /**
     * Akış dosyası şu an geçersizse gerekçesi.
     *
     * Bu alan olmadan kullanıcı YAML'ı bozduğunda hiçbir şey olmuyordu:
     * ekran eski topolojiyle çizmeye devam ediyor, düzenlemenin neden
     * tutmadığı görünmüyordu.
     */
    error?: string;
  };
  /** Gözcü açık mı. `null` ise hiç kilit yok. */
  daemon: { alive: boolean; info: LockInfo } | null;
  roles: UiRole[];
  cards: UiCard[];
  totals: { open: number; done: number; costUsd: number; activations: number; orphans: number };
  at: string;
}

export interface UiRole {
  id: string;
  provider: string;
  workspace: string;
  /** Kuyrukta bekleyen kart sayısı. */
  depth: number;
}

/** Kartın panoda ve detayda gösterilen hâli. */
export interface UiCard {
  id: string;
  title: string;
  role: string;
  state: CardState;
  /** Kapıda duruyorsa hangi kapıda — çıkış kümesini bu belirler. */
  gate: "approval" | "deadlock" | "escalation" | null;
  gateReason: string | null;
  /** Bu kart için yapılan tur sayısı. */
  turns: number;
  rejects: number;
  /** Son ret gerekçesi — kart geri döndüyse neden döndüğü. */
  lastReject: string | null;
  durationMs: number;
  costUsd: number;
  /** Kart koşuyorsa ajanın son adımı. */
  live: UiStep | null;
  /**
   * Kartın rolü YAŞAYAN akışta yok — hiçbir sütuna düşmez.
   *
   * Bu alan olmadan pano kartı sessizce eliyordu: sütunlar rollerden
   * geliyor ve hiçbir role uymayan kart filtreden düşüyordu. Bir kartın
   * ekrandan yok olması, en kötü görünüm hatası.
   */
  orphan: boolean;
  /** Kart farklı bir akış damgasıyla başladı — bilgi amaçlı. */
  stale: boolean;
  /**
   * Kartın hikâyesi, sırayla. Sayı tek başına anlatmıyor: "2 ret" ile
   * "kabul, ret, kapı, ret, bitti" aynı şey değil.
   */
  trail: ("accepted" | "rejected" | "gate" | "released" | "done")[];
}

export interface UiStep {
  seq: number;
  kind: string;
  name: string | null;
  detail: string | null;
  at: string;
}

export interface BuildOptions {
  root: string;
  queue: CardQueue;
  topology: TopologySnapshot;
  flowName: string;
  flowHash: string;
  /** Olay günlüğü yolu. Varsayılan `<root>/.skein/olaylar.jsonl`. */
  logPath?: string;
  /** Akış dosyası şu an geçersizse gerekçesi. */
  flowError?: string | null;
  /** Test edilebilirlik için; varsayılan `process.kill(pid, 0)`. */
  alive?: (pid: number) => boolean;
  now?: () => Date;
}

/** Hücre kimliğinden kart kimliği: `c-2026…:coder` → `c-2026…`. */
function cardOf(cell: string): string {
  const at = cell.lastIndexOf(":");
  return at === -1 ? cell : cell.slice(0, at);
}

export async function buildModel(options: BuildOptions): Promise<UiModel> {
  const { root, queue, topology } = options;
  const now = options.now ?? (() => new Date());

  const lockPath = join(root, ".skein", "daemon.json");
  const info = await readLock(lockPath);
  const isAlive = options.alive ?? pidAlive;

  const cards = await queue.list();
  const { events } = await readEvents(options.logPath ?? join(root, ".skein", "olaylar.jsonl"));

  const roles: UiRole[] = [];
  for (const role of topology.roles) {
    roles.push({
      id: role.id,
      provider: role.provider,
      workspace: role.workspace,
      depth: await queue.depth(role.id),
    });
  }

  const byCard = groupEvents(events);
  const ui = cards.map((card) =>
    toUiCard(card, byCard.get(card.id) ?? [], {
      orphan: isOrphan(card, topology),
      stale: isStale(card, options.flowHash),
    }),
  );

  return {
    flow: {
      name: options.flowName,
      hash: options.flowHash,
      ...(options.flowError === undefined || options.flowError === null
        ? {}
        : { error: options.flowError }),
    },
    daemon: info === null ? null : { alive: isAlive(info.pid), info },
    roles,
    cards: ui,
    totals: {
      orphans: ui.filter((c) => c.orphan).length,
      open: ui.filter((c) => c.state !== "done").length,
      done: ui.filter((c) => c.state === "done").length,
      costUsd: ui.reduce((sum, c) => sum + c.costUsd, 0),
      activations: events.filter((e) => e.type === "agent.started").length,
    },
    at: now().toISOString(),
  };
}

function groupEvents(events: SkeinEvent[]): Map<string, SkeinEvent[]> {
  const byCard = new Map<string, SkeinEvent[]>();
  for (const event of events) {
    const cell = (event as { cell?: unknown }).cell;
    if (typeof cell !== "string") continue;
    const id = cardOf(cell);
    const list = byCard.get(id);
    if (list === undefined) byCard.set(id, [event]);
    else list.push(event);
  }
  return byCard;
}

function toUiCard(
  card: Card,
  events: SkeinEvent[],
  hiza: { orphan: boolean; stale: boolean },
): UiCard {
  let costUsd = 0;
  let durationMs = 0;
  for (const event of events) {
    if (event.type !== "agent.finished") continue;
    durationMs += event.durationMs;
    costUsd += event.usage?.costUsd ?? 0;
  }

  const trail: UiCard["trail"] = [];
  let rejects = 0;
  let turns = 0;
  let lastReject: string | null = null;
  for (const entry of card.history) {
    if (entry.event === "taken") turns += 1;
    else if (entry.event === "handoff") trail.push("accepted");
    else if (entry.event === "reject") {
      trail.push("rejected");
      rejects += 1;
      lastReject = entry.reason;
    } else if (entry.event === "gate") trail.push("gate");
    else if (entry.event === "released") trail.push("released");
    else if (entry.event === "done") trail.push("done");
  }

  return {
    id: card.id,
    title: card.title,
    role: card.role,
    state: card.state,
    gate: gateKind(card),
    gateReason: lastGateReason(card),
    turns,
    rejects,
    lastReject,
    durationMs,
    costUsd,
    live: card.state === "active" ? lastStep(events) : null,
    orphan: hiza.orphan,
    stale: hiza.stale,
    trail,
  };
}

function lastGateReason(card: Card): string | null {
  if (card.state !== "gate") return null;
  for (let i = card.history.length - 1; i >= 0; i -= 1) {
    const entry = card.history[i];
    if (entry?.event === "gate") return entry.reason;
    if (entry?.event === "handoff") return null;
  }
  return null;
}

/**
 * Koşan ajanın son adımı.
 *
 * Bitmiş bir hücrenin adımı "şu an" değildir: `agent.finished` gördükten
 * sonraki adımlar yalnızca YENİ bir turun adımları olabilir, o yüzden son
 * `agent.started`'dan sonrasına bakılır.
 */
function lastStep(events: SkeinEvent[]): UiStep | null {
  let from = 0;
  for (const [i, event] of events.entries()) {
    if (event.type === "agent.started") from = i;
  }
  let step: UiStep | null = null;
  for (const event of events.slice(from)) {
    if (event.type === "agent.finished") return null;
    if (event.type !== "agent.step") continue;
    step = {
      seq: event.seq,
      kind: event.kind,
      name: event.name ?? null,
      detail: event.detail ?? null,
      at: event.at,
    };
  }
  return step;
}

/** Kartın detay görünümü: tam iz + devredilen commit'in diff özeti. */
export interface UiDetail {
  card: UiCard;
  history: UiHistory[];
  diff: UiDiff | null;
}

export interface UiHistory {
  at: string;
  event: string;
  who: string;
  note: string | null;
  commit: string | null;
}

export interface UiDiff {
  commit: string;
  files: { path: string; add: number; del: number }[];
}

export interface DetailOptions extends BuildOptions {
  /** Test edilebilirlik için; varsayılan gerçek `git show --numstat`. */
  numstat?: (root: string, commit: string) => Promise<string>;
}

/**
 * Bir kartın detayı.
 *
 * "En son neden reddedildi" ve "kodda ne değişti" sorularının cevabı burada:
 * gerekçeler kartın kendi geçmişinden, diff ise geçmişteki commit'ten. İkisi
 * de TÜRETİLMİŞ — ekran hiçbir şey saklamıyor.
 */
export async function buildDetail(options: DetailOptions, id: string): Promise<UiDetail | null> {
  const card = await options.queue.get(id);
  if (card === null) return null;

  const { events } = await readEvents(
    options.logPath ?? join(options.root, ".skein", "olaylar.jsonl"),
  );
  const mine = groupEvents(events).get(id) ?? [];

  const history: UiHistory[] = card.history.map((entry) => {
    const who =
      "from" in entry && "to" in entry
        ? `${entry.from} → ${entry.to}`
        : "from" in entry
          ? entry.from
          : "role" in entry
            ? entry.role
            : "";
    const note =
      "reason" in entry
        ? entry.reason
        : "summary" in entry && entry.summary !== undefined
          ? entry.summary
          : null;
    return {
      at: entry.at,
      event: entry.event,
      who,
      note,
      commit: "commit" in entry && entry.commit !== undefined ? entry.commit : null,
    };
  });

  // En son devredilen commit: "kodda ne değişti" sorusunun konusu.
  let commit: string | null = null;
  for (const entry of card.history) {
    if ((entry.event === "handoff" || entry.event === "reject") && entry.commit !== undefined) {
      commit = entry.commit;
    }
  }

  return {
    card: toUiCard(card, mine, {
      orphan: isOrphan(card, options.topology),
      stale: isStale(card, options.flowHash),
    }),
    history,
    diff: commit === null ? null : await readDiff(options, commit),
  };
}

async function readDiff(options: DetailOptions, commit: string): Promise<UiDiff | null> {
  const run = options.numstat ?? defaultNumstat;
  let out: string;
  try {
    out = await run(options.root, commit);
  } catch {
    // Commit bu depoda yoksa (dal silinmiş, worktree temizlenmiş) detay yine
    // gösterilir — diff'siz. Ekran, eksik bir parçası yüzünden kapanmamalı.
    return null;
  }
  const files: UiDiff["files"] = [];
  for (const line of out.split("\n")) {
    const parts = line.trim().split("\t");
    if (parts.length < 3) continue;
    const [add, del, path] = parts;
    files.push({
      path: path ?? "",
      add: Number(add) || 0,
      del: Number(del) || 0,
    });
  }
  return files.length === 0 ? null : { commit, files };
}

async function defaultNumstat(root: string, commit: string): Promise<string> {
  const { capture } = await import("../proc/process.js");
  const result = await capture("git", ["show", "--numstat", "--format=", commit], {
    cwd: root,
    timeoutMs: 10_000,
  });
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || "git show başarısız");
  return result.stdout;
}
