import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Adapter, InvokeRequest, InvokeResult } from "../adapters/contract.js";
import { knownProviderSet } from "../adapters/factory.js";
import { gateKind, newCard, type Card } from "../card/card.js";
import { CardQueue } from "../card/queue.js";
import { EventLog, readEvents } from "../events/log.js";
import { loadFlow } from "../flow/load.js";
import { roleOf, snapshot, type TopologySnapshot } from "../flow/snapshot.js";
import { buildTaskText } from "./task-text.js";
import { tick, type TickOptions } from "./tick.js";
import { VERDICT_FILE } from "./verdict.js";
import { WORKTREE_DIR } from "./workspace.js";

const FLOW = `
name: exchange-test
constitution:
  - ../prompts/base.md
roles:
  - id: planner
    provider: claude
    workspace: main
    prompt: ../../roles/planner.prompt
    next: architect
  - id: architect
    provider: claude
    workspace: architect
    prompt: ../../roles/architect.prompt
    next: coder
  - id: coder
    provider: claude
    workspace: coder
    prompt: ../../roles/coder.prompt
    reject: planner
    next: done
planlama:
  katilimcilar: [planner, architect]
  tur: 1
  plan: docs/plan/{kart}.md
reject:
  limit: 2
  onExhausted: gate
`;

class FakeAdapter implements Adapter {
  readonly id = "claude";
  readonly model = "sahte-1";
  readonly calls: InvokeRequest[] = [];
  answer: ((req: InvokeRequest) => Promise<InvokeResult | void>) | null = null;
  async invoke(req: InvokeRequest): Promise<InvokeResult> {
    this.calls.push(req);
    const custom = await this.answer?.(req);
    return custom ?? { exitCode: 0, stdout: "", stderr: "", durationMs: 5 };
  }
}

let root: string;
let queue: CardQueue;
let topology: TopologySnapshot;
let claude: FakeAdapter;
let options: TickOptions;
/** Sahte dosya sistemi: yol → içerik. */
let dosyalar: Map<string, string>;

const PLAN_YOLU = (id: string) => `docs/plan/${id}.md`;
// 6e: her itirazcının kendi dosyası. Bu akışta itirazcı tek: `architect`.
const ITIRAZ_YOLU = (id: string) => `docs/plan/${id}.itiraz.architect.md`;

/** Rolün ağacındaki mutlak yol. */
const at = (workspace: string, rel: string): string =>
  join(workspace === "main" ? root : join(root, WORKTREE_DIR, workspace), rel);

const itiraz = (durum: string, kanit = "`src/var.ts:3`") => `# İtirazlar

## İtiraz 1 — architect
**Ne:** Plan geçmişi baştan oynatıyor.
**Neden:** Sürüm geriye düşer.
**Neyi yanlışlar:** ${kanit} — orada sürüm önbellek anahtarı.
**Durum:** ${durum}
`;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-alisveris-"));
  await mkdir(join(root, "hub", "flows"), { recursive: true });
  await mkdir(join(root, "hub", "prompts"), { recursive: true });
  await mkdir(join(root, "roles"), { recursive: true });
  for (const w of ["architect", "coder"]) {
    await mkdir(join(root, WORKTREE_DIR, w), { recursive: true });
  }
  await writeFile(join(root, "hub", "prompts", "base.md"), "# Anayasa\n");
  for (const r of ["planner", "architect", "coder"]) {
    await writeFile(join(root, "roles", `${r}.prompt`), `# ${r}\n`);
  }
  await writeFile(join(root, "hub", "flows", "exchange-test.yaml"), FLOW);

  queue = new CardQueue(join(root, ".skein"));
  await queue.init();
  const flow = await loadFlow(join(root, "hub", "flows", "exchange-test.yaml"), {
    root, providers: knownProviderSet(),
  });
  topology = snapshot(flow, root);

  claude = new FakeAdapter();
  dosyalar = new Map();
  options = {
    root,
    queue,
    adapters: new Map<string, Adapter>([["claude", claude]]),
    headCommit: async () => "abc1234",
    dirtyPaths: async () => [],
    isTracked: async () => false,
    mergeForward: async () => ({ kind: "merged" as const }),
    readPlan: async (path) => {
      const text = dosyalar.get(path);
      if (text === undefined) throw new Error("ENOENT");
      return text;
    },
    pathExists: async (path) => dosyalar.has(path),
  };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const put = async (): Promise<Card> =>
  queue.add(newCard({ title: "iş", task: "undo ekle", topology }));

const kabulEt = (summary = "tamam") => async (req: InvokeRequest): Promise<void> => {
  await writeFile(join(req.workdir, VERDICT_FILE), JSON.stringify({ decision: "accept", summary }));
};

/** Planı yazma turunu koşar; kart architect'e geçer. */
async function planYaz(card: Card, metin = "# Plan\nselector.ts sürüme bakıyor.\n"): Promise<void> {
  dosyalar.set(at("main", PLAN_YOLU(card.id)), metin);
  dosyalar.set(at("main", "src/var.ts"), "export const x = 1;\n");
  dosyalar.set(at("architect", "src/var.ts"), "export const x = 1;\n");
  claude.answer = kabulEt("plan yazıldı");
  await tick("planner", options);
}

describe("alışveriş — plan yazma turu", () => {
  it("plan yazılınca kart itiraz edene gider, zincirdeki koder'a değil", async () => {
    const card = await put();
    await planYaz(card);
    const moved = await queue.get(card.id);
    expect(moved?.role).toBe("architect");
    expect(moved?.plan?.path).toBe(PLAN_YOLU(card.id));
  });

  it("itiraz turunun iş metni biçimi ve kanıt kuralını taşır", async () => {
    const card = await put();
    await planYaz(card);
    const moved = (await queue.get(card.id)) as Card;
    const text = buildTaskText(moved, roleOf(topology, "architect")!);
    expect(text).toContain("## Plana itiraz et");
    expect(text).toContain(ITIRAZ_YOLU(card.id));
    expect(text).toContain("Neyi yanlışlar");
    expect(text).toContain("sessizlik anlaşma sayılmaz");
  });
});

describe("alışveriş — itiraz turu", () => {
  it("itiraz dosyası yoksa tur kabul edilmez", async () => {
    const card = await put();
    await planYaz(card);
    claude.answer = kabulEt("itirazım yok");

    const result = await tick("architect", options);
    expect(result.status).toBe("escalated");
    expect(result.status === "escalated" && result.reason).toMatch(/itiraz dosyası yok/);
  });

  it("geçerli itiraz kartı yazara geri gönderir", async () => {
    const card = await put();
    await planYaz(card);
    dosyalar.set(at("architect", ITIRAZ_YOLU(card.id)), itiraz("açık"));
    claude.answer = kabulEt("bir itirazım var");

    const result = await tick("architect", options);
    expect(result.status).toBe("accepted");
    const moved = await queue.get(card.id);
    expect(moved?.role).toBe("planner");

    const text = buildTaskText(moved as Card, roleOf(topology, "planner")!);
    expect(text).toContain("## İtirazları yanıtla");
  });

  // Tasarımın en keskin kuralı: genel öğüt makineyle elenir.
  it("kanıtı depoda olmayan itiraz sayılmaz, kart ilerler", async () => {
    const card = await put();
    await planYaz(card);
    dosyalar.set(at("architect", ITIRAZ_YOLU(card.id)), itiraz("açık", "`src/olmayan.ts:3`"));
    claude.answer = kabulEt("itiraz ettim");

    await tick("architect", options);
    // İtiraz geçersiz → alışveriş itirazsız kapanır → zincir devam eder.
    expect((await queue.get(card.id))?.role).toBe("coder");
  });

  // "İtiraz yok" ile "itiraz var ama hiçbiri sayılmadı" aynı şey değil:
  // ilki anlaşma, ikincisi ya biçimi öğrenmemiş bir rol ya da genel öğüt
  // üreten bir mekanizma. Tek sayıya erirse mekanizmanın tören olup
  // olmadığı sorusu cevapsız kalır.
  it("sayılmayan itirazları ayrı sayar", async () => {
    const card = await put();
    const logPath = join(root, "olaylar.jsonl");
    await planYaz(card);
    dosyalar.set(at("architect", ITIRAZ_YOLU(card.id)), itiraz("açık", "`src/olmayan.ts:3`"));
    claude.answer = kabulEt("itiraz ettim");

    await tick("architect", { ...options, log: new EventLog(logPath, "r1") });

    const { events } = await readEvents(logPath);
    const settled = events.find((e) => e.type === "plan.settled");
    expect(settled).toMatchObject({ objections: 0, invalid: 1 });
  });

  it("itirazsız tur alışverişi kapatır ve kart zincirden devam eder", async () => {
    const card = await put();
    await planYaz(card);
    dosyalar.set(at("architect", ITIRAZ_YOLU(card.id)), "# İtirazlar\n\nPlan bana doğru geldi.\n");
    claude.answer = kabulEt("itirazım yok");

    await tick("architect", options);
    expect((await queue.get(card.id))?.role).toBe("coder");
  });
});

describe("alışveriş — cevap turu", () => {
  /** İtiraz turunu da koşar; kart yazarda cevap bekler. */
  async function itirazaKadar(card: Card): Promise<void> {
    await planYaz(card);
    dosyalar.set(at("architect", ITIRAZ_YOLU(card.id)), itiraz("açık"));
    claude.answer = kabulEt("itirazım var");
    await tick("architect", options);
    // İtiraz dosyası yazarın ağacına da ulaşmış olmalı (gerçekte merge).
    dosyalar.set(at("main", ITIRAZ_YOLU(card.id)), itiraz("açık"));
  }

  it("kabul edilen itiraz planı değiştirmemişse tur kabul edilmez", async () => {
    const card = await put();
    await itirazaKadar(card);
    dosyalar.set(at("main", ITIRAZ_YOLU(card.id)), itiraz("kabul"));
    claude.answer = kabulEt("haklısın");

    const result = await tick("planner", options);
    expect(result.status).toBe("escalated");
    expect(result.status === "escalated" && result.reason).toMatch(/planı değiştirmedi/);
  });

  it("kabul + düzeltilmiş plan kartı zincirde ilerletir", async () => {
    const DUZELTILMIS = "# Plan\nSürüm ileri gider; selector.ts korunur.\n";
    const card = await put();
    await itirazaKadar(card);
    dosyalar.set(at("main", ITIRAZ_YOLU(card.id)), itiraz("kabul"));
    dosyalar.set(at("main", PLAN_YOLU(card.id)), DUZELTILMIS);
    claude.answer = kabulEt("planı düzelttim");

    const result = await tick("planner", options);
    expect(result.status).toBe("accepted");
    const moved = await queue.get(card.id);
    expect(moved?.role).toBe("coder");
    // Kartın dondurduğu hash DÜZELTİLMİŞ planı göstermeli — aşağıdaki rol
    // "sürüm X" diye okuyacağı şeyle elindeki dosya aynı olmak zorunda.
    //
    // Eski hâli `not.toBe(card.plan?.hash)` idi ve ISIRMIYORDU: `card`
    // `put()`'tan geliyor, yani `card.plan` undefined, yani iddia "hash
    // undefined değil"e iniyordu. İlk yazım hash'in hangi sürüme ait
    // olduğunu hiç sormuyordu.
    expect(moved?.plan?.hash).toBe(
      createHash("sha256").update(DUZELTILMIS, "utf8").digest("hex"),
    );
  });

  it("gerekçeli ret kartı ilerletir, plan değişmeden", async () => {
    const card = await put();
    await itirazaKadar(card);
    dosyalar.set(at("main", ITIRAZ_YOLU(card.id)), itiraz("ret: ölçüm bunu göstermiyor"));
    claude.answer = kabulEt("katılmıyorum");

    const result = await tick("planner", options);
    expect(result.status).toBe("accepted");
    expect((await queue.get(card.id))?.role).toBe("coder");
  });

  // Sessizlik anlaşma değildir: açık bırakılan itiraz kartı kapıya çıkarır.
  it("açık bırakılan itiraz kartı KİLİT kapısına çıkarır", async () => {
    const card = await put();
    await itirazaKadar(card);
    claude.answer = kabulEt("cevap vermedim");

    const result = await tick("planner", options);
    expect(result.status).toBe("escalated");
    const gated = (await queue.get(card.id)) as Card;
    expect(gated.state).toBe("gate");
    // Kaçış değil kilit: tur tamamlandı, kod yerinde, insan ileri bırakabilir.
    expect(gateKind(gated)).toBe("deadlock");
  });

  it("insana çıkan itiraz kartı kapıya çıkarır", async () => {
    const card = await put();
    await itirazaKadar(card);
    dosyalar.set(at("main", ITIRAZ_YOLU(card.id)), itiraz("insana: bu bir değer kararı"));
    claude.answer = kabulEt("karar insana");

    const result = await tick("planner", options);
    expect(result.status).toBe("escalated");
    expect(result.status === "escalated" && result.reason).toMatch(/insana çıktı/);
    expect(gateKind((await queue.get(card.id)) as Card)).toBe("deadlock");
  });
});

// Kural 22'nin ÇALIŞMA ZAMANI karşılığı. Kenar kaldırıldı ama ret kararı
// `planStep`'ten önce işleniyor; 6d kampanyasında itirazcının mekanizmayı
// baypas etmesinin mekanik sebebi tam buydu ve kenarsız bir rolde
// `queue.reject` istisna atıp süpürmeyi düşürürdü.
describe("alışveriş — planlama turunda ret kanalı yok (kural 22)", () => {
  const reddet = (reason: string) => async (req: InvokeRequest): Promise<void> => {
    await writeFile(join(req.workdir, VERDICT_FILE), JSON.stringify({ decision: "reject", reason }));
  };

  it("itiraz turunda 'reject' kartı geri göndermez; itiraz dosyası okunur", async () => {
    const card = await put();
    await planYaz(card);
    dosyalar.set(at("architect", ITIRAZ_YOLU(card.id)), itiraz("açık"));
    claude.answer = reddet("plan yanlış");

    const result = await tick("architect", options);
    // Kart YAZARA gidiyor (itiraz turunun normal sonucu), geri değil.
    expect(result.status).toBe("accepted");
    expect((await queue.get(card.id))?.role).toBe("planner");
    // Deneme kayda geçiyor: sessizce yok saymak, rolün ne yapmaya
    // çalıştığını operatörden saklamak olurdu.
    expect(result.status === "accepted" && result.warnings?.join(" ")).toMatch(/kural 22/);
  });

  it("itiraz dosyası yoksa 'reject' turu kurtarmaz", async () => {
    const card = await put();
    await planYaz(card);
    claude.answer = reddet("plan yanlış");

    const result = await tick("architect", options);
    expect(result.status).toBe("escalated");
    expect(result.status === "escalated" && result.reason).toMatch(/itiraz dosyası yok/);
  });

  // Planlama DIŞINDAKİ rollerde ret kanalı yerinde duruyor: kural 22
  // yalnızca katılımcıları bağlıyor.
  it("planlama dışı rolde ret kanalı çalışmaya devam eder", async () => {
    const card = await put();
    await planYaz(card);
    dosyalar.set(at("architect", ITIRAZ_YOLU(card.id)), "# İtirazlar\n\nİtirazım yok.\n");
    claude.answer = kabulEt("itirazım yok");
    await tick("architect", options);
    expect((await queue.get(card.id))?.role).toBe("coder");

    claude.answer = reddet("görev metni çelişkili");
    const result = await tick("coder", options);
    expect(result.status).toBe("rejected");
    expect((await queue.get(card.id))?.role).toBe("planner");
  });
});

describe("alışveriş — günlük", () => {
  it("itiraz turu ve kapanış günlüğe düşer", async () => {
    const card = await put();
    const logPath = join(root, "olaylar.jsonl");
    const log = new EventLog(logPath, "r1");
    const withLog = { ...options, log };

    await planYaz(card);
    dosyalar.set(at("architect", ITIRAZ_YOLU(card.id)), itiraz("açık"));
    claude.answer = kabulEt("itiraz");
    await tick("architect", withLog);

    dosyalar.set(at("main", ITIRAZ_YOLU(card.id)), itiraz("kabul"));
    dosyalar.set(at("main", PLAN_YOLU(card.id)), "# Plan\nDüzeltildi.\n");
    claude.answer = kabulEt("düzelttim");
    await tick("planner", withLog);

    const { events } = await readEvents(logPath);
    expect(events.find((e) => e.type === "plan.round")).toMatchObject({
      // `blind: false` — körleme yapılmadı ve günlük bunu böyle yazıyor.
      // İleri birleştirme ikinci itirazcının ağacına birincinin dosyasını
      // taşıyor; `true` yazan bir günlük yapılmamış bir şeyi yapılmış
      // gösterirdi (6e).
      card: card.id, role: "architect", round: 1, blind: false, newObjections: 1, openObjections: 1,
    });
    expect(events.find((e) => e.type === "plan.settled")).toMatchObject({
      card: card.id, outcome: "anlasma", rounds: 1, objections: 1, accepted: 1,
    });
  });
});

// Kilit kapısından "ileri bırak" kararının hedefi, zincirdeki ardıl DEĞİL:
// orası itiraz eden rol ve oraya dönmek, insanın "planı olduğu gibi kabul
// ediyorum" kararını bir tur daha alışverişe çevirirdi.
describe("alışveriş — kilit kapısından çıkış", () => {
  async function kilide(card: Card): Promise<void> {
    await planYaz(card);
    dosyalar.set(at("architect", ITIRAZ_YOLU(card.id)), itiraz("açık"));
    claude.answer = kabulEt("itirazım var");
    await tick("architect", options);
    dosyalar.set(at("main", ITIRAZ_YOLU(card.id)), itiraz("açık"));
    claude.answer = kabulEt("cevap vermedim");
    await tick("planner", options);
  }

  it("ileri bırakma kartı alışverişten SONRAKİ role gönderir", async () => {
    const card = await put();
    await kilide(card);
    expect((await queue.get(card.id))?.state).toBe("gate");

    const released = await queue.release(card.id, { decision: "forward" });
    expect(released.role).toBe("coder");
  });

  it("retry aynı role, back ret hedefine gider", async () => {
    const card = await put();
    await kilide(card);
    const released = await queue.release(card.id, { decision: "retry" });
    expect(released.role).toBe("planner");
  });
});

/**
 * YÜKÜMLÜLÜK — kabul edilmiş itiraz bağlayıcı (adım 1-3).
 *
 * Ölçülen kusur şu: `snapshot-store` 1. koşusunda iki itiraz da doğru
 * tüketici modülü gösterdi, ikisi de KABUL edildi, plan değişti — ürün
 * değişmedi (PLANLAMA.md). Kabul edilmiş itirazın karşılanıp
 * karşılanmadığı hiçbir yerde yazılı olmadığı için zincirin hangi
 * halkasının koptuğu bilinemedi: plan mı yetersiz yazdı, üretici mi
 * atladı, yoksa anlayıp yine mi hatalı yazdı.
 *
 * Mekanizma bu üç olasılığı ayırmak için var — üreticiyi bilgilendirmek
 * için değil.
 */
describe("yükümlülük — kabul edilmiş itiraz bağlayıcı", () => {
  const FLOW_DENETCI = `
name: denetci-test
constitution:
  - ../prompts/base.md
roles:
  - id: planner
    provider: claude
    workspace: main
    prompt: ../../roles/planner.prompt
    next: architect
  - id: architect
    provider: claude
    workspace: architect
    prompt: ../../roles/architect.prompt
    next: coder
  - id: coder
    provider: claude
    workspace: coder
    prompt: ../../roles/coder.prompt
    reject: planner
    next: reviewer
  - id: reviewer
    provider: claude
    workspace: reviewer
    prompt: ../../roles/reviewer.prompt
    reject: coder
    next: done
planlama:
  katilimcilar: [planner, architect]
  tur: 1
  plan: docs/plan/{kart}.md
  denetci: reviewer
reject:
  limit: 2
  onExhausted: gate
`;
  let topo: TopologySnapshot;

  beforeEach(async () => {
    await mkdir(join(root, WORKTREE_DIR, "reviewer"), { recursive: true });
    await writeFile(join(root, "roles", "reviewer.prompt"), "# reviewer\n");
    await writeFile(join(root, "hub", "flows", "denetci-test.yaml"), FLOW_DENETCI);
    const flow = await loadFlow(join(root, "hub", "flows", "denetci-test.yaml"), {
      root, providers: knownProviderSet(),
    });
    topo = snapshot(flow, root);
  });

  /** Alışverişi KABUL edilmiş itirazla bitirir; kart `coder`'a geçer. */
  async function kabulluAlisveris(): Promise<Card> {
    const card = await queue.add(newCard({ title: "iş", task: "undo ekle", topology: topo }));
    dosyalar.set(at("main", PLAN_YOLU(card.id)), "# Plan\nselector.ts sürüme bakıyor.\n");
    // Kanıt yolu GERÇEKTEN var olmalı: yoksa itiraz "depoda olmayan yol"
    // diye elenir ve kabul hiç oluşmaz.
    dosyalar.set(at("main", "src/var.ts"), "export const x = 1;\n");
    dosyalar.set(at("architect", "src/var.ts"), "export const x = 1;\n");
    claude.answer = kabulEt("plan yazıldı");
    await tick("planner", options);
    dosyalar.set(at("architect", ITIRAZ_YOLU(card.id)), itiraz("açık"));
    claude.answer = kabulEt("itirazım var");
    await tick("architect", options);
    dosyalar.set(at("main", ITIRAZ_YOLU(card.id)), itiraz("kabul"));
    dosyalar.set(at("main", PLAN_YOLU(card.id)), "# Plan\nSürüm ileri gider.\n");
    claude.answer = kabulEt("planı düzelttim");
    await tick("planner", options);
    return (await queue.get(card.id)) as Card;
  }

  /** Kartı `coder`'dan geçirip `reviewer`'a getirir. */
  async function denetciyeKadar(): Promise<Card> {
    const card = await kabulluAlisveris();
    claude.answer = kabulEt("kodu yazdım");
    await tick("coder", options);
    return (await queue.get(card.id)) as Card;
  }

  it("kabul edilen itirazı karta yazar — kimlik `rol#no`", async () => {
    const card = await kabulluAlisveris();
    expect(card.role).toBe("coder");
    expect(card.plan?.kabuller).toEqual([{
      id: "architect#1",
      role: "architect",
      ne: "Plan geçmişi baştan oynatıyor.",
      kanit: "`src/var.ts:3` — orada sürüm önbellek anahtarı.",
    }]);
  });

  // TASARIM KARARI, en önemli iddia: yükümlülük ÜRETİCİYE verilmiyor.
  //
  // Plan sözleşmedir; sözleşmenin tek başına yetip yetmediği ancak üretici
  // yalnızca onu okursa ölçülebilir. Üreticiye itiraz listesini de verirsen
  // o soruyu bir daha hiç soramazsın.
  it("üreticiye yükümlülük listesi VERİLMEZ", async () => {
    const card = await kabulluAlisveris();
    const text = buildTaskText(card, roleOf(topo, "coder")!);
    expect(text).toContain("## Plan");
    expect(text).not.toContain("## İtiraz üzerine değişen maddeler");
    expect(text).not.toContain("architect#1");
  });

  it("denetçiye madde listesini ve biçimi verir", async () => {
    const card = await denetciyeKadar();
    const text = buildTaskText(card, roleOf(topo, "reviewer")!);
    expect(text).toContain("## İtiraz üzerine değişen maddeler");
    expect(text).toContain("architect#1");
    expect(text).toContain("src/var.ts:3");
    expect(text).toContain("yukumlulukler");
    // Serbest denetimin YERİNE geçmediği metinde yazılı olmalı: liste
    // denetçiyi o bölgeye yönlendirip başka yerlere karşı körleştirebilir.
    expect(text).toContain("serbest denetiminin YERİNE geçmiyor");
  });

  it("yükümlülük yoksa denetçiye bölüm basılmaz", async () => {
    const card = await queue.add(newCard({ title: "iş", task: "x", topology: topo }));
    const text = buildTaskText({ ...card, role: "reviewer" }, roleOf(topo, "reviewer")!);
    expect(text).not.toContain("## İtiraz üzerine değişen maddeler");
  });

  // Cevapsız madde karşılanmış SAYILMAZ: cevap vermemek bir cevap değildir.
  it("yanıtlanmayan yükümlülükle kabul kartı geçirmez", async () => {
    await denetciyeKadar();
    claude.answer = kabulEt("denetledim");
    const result = await tick("reviewer", options);
    expect(result.status).toBe("escalated");
    expect(result.status === "escalated" && result.reason).toMatch(/yükümlülüğü yanıtlamadı/);
  });

  // `accept` + karşılanmamış madde bir ÇELİŞKİ: rol maddeyi karşılanmadı
  // sayıyor ve işi yine ileri gönderiyor.
  it("karşılanmadı diyip kabul etmeyi reddeder", async () => {
    await denetciyeKadar();
    claude.answer = async (req: InvokeRequest): Promise<void> => {
      await writeFile(join(req.workdir, VERDICT_FILE), JSON.stringify({
        decision: "accept", summary: "x",
        yukumlulukler: { "architect#1": { durum: "karsilanmadi", not: "sürüm hâlâ geriye düşüyor" } },
      }));
    };
    const result = await tick("reviewer", options);
    expect(result.status).toBe("escalated");
    expect(result.status === "escalated" && result.reason).toMatch(/KARŞILANMADI saydı ama/);
  });

  it("hepsi karşılandıysa kartı ilerletir ve madde başına olay yazar", async () => {
    await denetciyeKadar();
    claude.answer = async (req: InvokeRequest): Promise<void> => {
      await writeFile(join(req.workdir, VERDICT_FILE), JSON.stringify({
        decision: "accept", summary: "x",
        yukumlulukler: { "architect#1": { durum: "karsilandi", not: "selector.ts sürümü artırıyor" } },
      }));
    };
    const yol = join(root, "yukumluluk.jsonl");
    const result = await tick("reviewer", { ...options, log: new EventLog(yol, "r1") });
    expect(result.status).toBe("accepted");
    const { events } = await readEvents(yol);
    const olaylar = events.filter((e) => e.type === "plan.obligation");
    expect(olaylar).toHaveLength(1);
    expect(olaylar[0]).toMatchObject({
      role: "reviewer",
      id: "architect#1", objector: "architect", durum: "karsilandi",
    });
  });

  // Ret turunda kart geri dönüyor ve maddeler bir sonraki geçişte
  // denetlenir: kapının iddiası "kart yükümlülük yanıtlanmadan KAPANMAZ",
  // "her tur denetlenir" değil.
  it("ret turunda yükümlülük istemez", async () => {
    await denetciyeKadar();
    claude.answer = async (req: InvokeRequest): Promise<void> => {
      await writeFile(join(req.workdir, VERDICT_FILE), JSON.stringify({
        decision: "reject", reason: "kod planı hiç uygulamamış",
      }));
    };
    const result = await tick("reviewer", options);
    expect(result.status).toBe("rejected");
  });
});
