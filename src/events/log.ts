import { appendFile, readFile } from "node:fs/promises";
import type { Usage } from "../adapters/contract.js";
import type { CardState } from "../card/card.js";

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
  | {
      /**
       * Turun neyle sonuçlandığı. `agent.finished` ajanın bittiğini söyler,
       * kartın nereye gittiğini söylemez; bu olay olmadan sonuç günlükten
       * okunamaz (PHILOSOPHY 8).
       */
      type: "card.settled";
      cell: string;
      card: string;
      role: string;
      outcome: "accepted" | "rejected" | "escalated";
      /**
       * Kartın turdan sonraki durumu.
       *
       * `string` değil `CardState`: birlik zaten dışa açık ve `validate()`
       * yalnızca "boş olmayan metin mi" diye bakıyor, yani bir yazım hatası
       * çalışma zamanında geçerdi. Derleyicinin yardımını atmaya gerek yok.
       */
      state: CardState;
      /** Ret ya da kapı gerekçesi. */
      reason?: string;
      summary?: string;
      /** syncBack uyarıları. */
      warnings?: string[];
    }
  | {
      /**
       * Ajanın koşarken attığı bir adım — canlı izlemenin taşıyıcısı.
       *
       * `agent.started` ile `agent.finished` arasındaki boşluğu dolduruyor:
       * o iki olay arasında dakikalar geçiyor ve günlükten "şu an ne oluyor"
       * okunamıyordu.
       *
       * GÖZLEM, durum değil: bu kayıtların kaybı turun sonucunu değiştirmez
       * ve kartın nereye gittiği yine `card.settled`'dan okunur. `seq`
       * olduğu için, kayıtlar sırasız yazılsa bile sıra kurtarılabilir.
       */
      type: "agent.step";
      cell: string;
      role: string;
      /** Hücre içinde 1'den başlayan sıra numarası. */
      seq: number;
      kind: "tool" | "text";
      /** Araç adı — yalnızca `kind: "tool"` için. */
      name?: string;
      /** Kırpılmış ayrıntı. */
      detail?: string;
    }
  | {
      /**
       * İnsan kapıdaki kartı karara bağladı.
       *
       * Karar kartın kendi geçmişine zaten yazılıyor; bu kayıt KARTLAR ARASI
       * soru içindir: "insan ne sıklıkla araya girdi, hangi kapıda, hangi
       * yöne?" Tek bir kartın izinden okunamayan tek şey bu.
       */
      type: "gate.released";
      card: string;
      /** Kartın gittiği rol. */
      role: string;
      decision: "forward" | "back" | "retry";
      /** Hangi kapıydı — çıkış kümesini bu belirliyordu. */
      kind: "approval" | "deadlock" | "escalation";
    }
  | {
      /**
       * İnsan kartı iş bitmeden kapattı.
       *
       * `card.settled` turun sonucunu söylüyor, bu ise kartın SONUNU: zinciri
       * tamamlayarak mı bitti, yoksa kapatıldı mı. Kartlar arası soru:
       * "topoloji değiştirdiğimizde kaç kart yolda kaldı?"
       */
      type: "card.closed";
      card: string;
      /** Kapatıldığı andaki rolü — akışta karşılığı olmayan rol. */
      role: string;
      reason: string;
    }
  | { type: "hooks.measured"; cell: string; ran: boolean; total: number; red: string[] }
  | {
      type: "review.done";
      cell: string;
      /** Kodu üreten modelin kimliği. */
      producer: string;
      /** Kodu inceleyen modelin kimliği. */
      reviewer: string;
      /** Aynı model mi (aynı hücre) farklı mı (çapraz hücre). */
      crossed: boolean;
      promptHash: string;
      /** Rapor dosyasının yolu. */
      path: string;
    }
  | {
      /**
       * Bir denetim raporu, kanıtlanmış kusurlara karşı puanlandı.
       *
       * `review.done` raporun nerede olduğunu söyler, ne söylediğini
       * söylemez — ve deneyin ana metriği (kaçırma) tam olarak orada.
       * Puanlama günlüğe düşmezse sonuç, raporları elle okuyan kişinin
       * belleğinde kalır.
       *
       * `hooks` alanı ile `caught + missed` toplamı eşittir; eşit değilse
       * puanlama eksik kalmıştır. `unverified`, hakemin "yakalandı" deyip
       * raporda bulunamayan bir alıntı verdiği kancalar — bunlar kaçırma
       * sayılır ve ayrıca sayılır, çünkü yükselmesi hakemin kendisinin
       * bozulduğunu gösterir.
       */
      type: "judge.scored";
      cell: string;
      /** Puanlayan model. */
      judge: string;
      /** Puanlanan kanca sayısı = o üretimde kanıtlanmış kusur sayısı. */
      hooks: number;
      caught: string[];
      missed: string[];
      unverified: string[];
    }
  | {
      /**
       * 2. YER GERÇEĞİ: raporun bulgularının sınıflaması.
       *
       * `judge.scored`'dan ayrı bir olay, çünkü ayrı bir katman: o, kanıtlı
       * kusurların kaçını raporun söylediğini ölçer (nesnel, tartışmaya
       * kapalı); bu, gizli testin göremediği bulguları gerçek/nit/yanlış
       * diye ayırır (hakem görüşü, itiraz edilebilir). Tek olayda
       * toplansalardı rapor tek bir "bulgu skoru"na erir ve zayıf katman
       * gücünü güçlü katmandan ödünç alırdı (bench/DESIGN.md).
       *
       * Sayılar kararı ETKİLEMEZ: karar kuralı yalnızca nesnel katmandan
       * okunur.
       */
      type: "judge.classified";
      cell: string;
      /** Sınıflayan model. */
      judge: string;
      /** Raporda sayılan ayrı bulgu sayısı (doğrulanmış alıntılar). */
      findings: number;
      /** Kodda karşılığı olan ve davranışı etkileyen bulgular. */
      real: number;
      /** Doğru ama önemsiz — biçim, adlandırma, tercih. */
      nit: number;
      /** Kodda karşılığı olmayan iddia. */
      wrong: number;
      /** Kanıtlanmış kusura ait bulgular; 1. katmanın alanı, oranlara girmez. */
      proven: number;
      /** Hakemin sınıfa karar veremediği bulgular; oranlara girmez. */
      uncertain: number;
      /** Alıntısı raporda bulunamayan bulgular — sayılmadı, sağlık göstergesi. */
      unverified: number;
      /** Tam sınıflamanın yazıldığı dosya. */
      path: string;
    }
  | {
      type: "audit.round";
      cell: string;
      round: number;
      /** Kapının kararı: ilk-deneme | degisti | degismedi */
      reason: string;
      accepted: boolean;
    };

export type SkeinEvent = EventInput & { v: number; at: string; runId: string };

/** Tip başına zorunlu alanlar ve beklenen türleri. */
const REQUIRED: Record<EventInput["type"], { strings: string[]; numbers: string[] }> = {
  "run.started": { strings: ["taskId"], numbers: [] },
  "agent.started": { strings: ["cell", "role", "provider", "model", "promptHash"], numbers: [] },
  "agent.finished": { strings: ["cell"], numbers: ["exitCode", "durationMs"] },
  "card.settled": { strings: ["cell", "card", "role", "outcome", "state"], numbers: [] },
  "agent.step": { strings: ["cell", "role", "kind"], numbers: ["seq"] },
  "gate.released": { strings: ["card", "role", "decision", "kind"], numbers: [] },
  "card.closed": { strings: ["card", "role", "reason"], numbers: [] },
  "hooks.measured": { strings: ["cell"], numbers: ["total"] },
  "audit.round": { strings: ["cell", "reason"], numbers: ["round"] },
  "review.done": { strings: ["cell", "producer", "reviewer", "promptHash", "path"], numbers: [] },
  "judge.scored": { strings: ["cell", "judge"], numbers: ["hooks"] },
  "judge.classified": {
    strings: ["cell", "judge", "path"],
    numbers: ["findings", "real", "nit", "wrong", "proven", "uncertain", "unverified"],
  },
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
