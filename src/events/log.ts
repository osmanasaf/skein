import { appendFile, readFile } from "node:fs/promises";
import type { Usage } from "../adapters/contract.js";

/** Kayıt biçimi sürümü. Eski günlükler okunabilir kalsın diye her satırda. */
export const EVENT_SCHEMA = 1;

/**
 * Yazılabilecek olayların tamamı.
 *
 * Tip kümesi kasıtlı olarak dar — PHILOSOPHY 5. ilkenin ("dar mesaj tipi
 * kümesi, katı doğrulama") ölçüm tarafındaki karşılığı. Serbest biçimli bir
 * olay günlüğü, hatanın sessizce yayıldığı yerdir.
 */
export type EventInput =
  | { type: "run.started"; taskId: string }
  | {
      type: "agent.started";
      cell: string;
      /** Akıştaki rol id'si, ya da deneyde "uretici"/"denetci". */
      role: string;
      provider: string;
      model: string;
      /** Derlenmiş promptun hash'i — hücreler arası eşitliğin kanıtı. */
      promptHash: string;
    }
  | {
      type: "agent.finished";
      cell: string;
      exitCode: number;
      durationMs: number;
      timedOut?: boolean;
      usage?: Usage;
    }
  | { type: "hooks.measured"; cell: string; ran: boolean; total: number; red: string[] };

export type SkeinEvent = EventInput & { v: number; at: string; runId: string };

/** Tip başına zorunlu alanlar ve beklenen türleri. */
const REQUIRED: Record<EventInput["type"], { strings: string[]; numbers: string[] }> = {
  "run.started": { strings: ["taskId"], numbers: [] },
  "agent.started": { strings: ["cell", "role", "provider", "model", "promptHash"], numbers: [] },
  "agent.finished": { strings: ["cell"], numbers: ["exitCode", "durationMs"] },
  "hooks.measured": { strings: ["cell"], numbers: ["total"] },
};

class EventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventError";
  }
}

function validate(event: EventInput): void {
  const spec = REQUIRED[event.type];
  if (!spec) {
    throw new EventError(`Bilinmeyen olay tipi: ${String((event as { type?: unknown }).type)}`);
  }
  const record = event as unknown as Record<string, unknown>;
  for (const field of spec.strings) {
    const value = record[field];
    if (typeof value !== "string" || value.trim() === "") {
      throw new EventError(`\`${event.type}\` olayında \`${field}\` boş olmayan metin olmalı`);
    }
  }
  for (const field of spec.numbers) {
    const value = record[field];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new EventError(`\`${event.type}\` olayında \`${field}\` sonlu bir sayı olmalı`);
    }
  }
}

/**
 * Yalnızca-ekleme JSONL olay günlüğü.
 *
 * Pane metni kazımanın yerine geçen şey budur: durum, terminal çıktısını
 * regex'leyerek değil, yapılandırılmış kayıtlardan okunur (PHILOSOPHY 8).
 * Satır başına bir tam kayıt olması, koşu yarıda kesilse bile önceki
 * kayıtların okunabilir kalmasını sağlar.
 */
export class EventLog {
  readonly #path: string;
  readonly #runId: string;
  readonly #now: () => Date;

  constructor(path: string, runId: string, now: () => Date = () => new Date()) {
    this.#path = path;
    this.#runId = runId;
    this.#now = now;
  }

  get path(): string {
    return this.#path;
  }

  /** Doğrular, sonra yazar. Geçersiz kayıt dosyaya hiç ulaşmaz. */
  async append(event: EventInput): Promise<void> {
    validate(event);
    const record: SkeinEvent = {
      v: EVENT_SCHEMA,
      at: this.#now().toISOString(),
      runId: this.#runId,
      ...event,
    };
    await appendFile(this.#path, `${JSON.stringify(record)}\n`, "utf8");
  }
}

export interface ReadResult {
  events: SkeinEvent[];
  /** Ayrıştırılamayan satır sayısı — çökme anında yarım kalan son satır dahil. */
  malformed: number;
}

/**
 * Günlüğü okur. Bozuk bir satır tüm koşunun ölçümünü kaybettirmemeli:
 * atlanır, sayılır, geri kalan kurtarılır.
 */
export async function readEvents(path: string): Promise<ReadResult> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return { events: [], malformed: 0 };
  }

  const events: SkeinEvent[] = [];
  let malformed = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const value: unknown = JSON.parse(line);
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        events.push(value as SkeinEvent);
      } else {
        malformed += 1;
      }
    } catch {
      malformed += 1;
    }
  }
  return { events, malformed };
}
