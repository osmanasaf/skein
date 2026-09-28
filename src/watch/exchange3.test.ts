import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

/**
 * 6c: üç katılımcı ve iki tur.
 *
 * `exchange.test.ts` iki katılımcı ve tek turu sınıyor; buradaki soru
 * başka: turun SIRASI, yeni itiraz sayacı ve tavan. İki dosya bilerek
 * ayrı — biri 6b'nin, öteki 6c'nin sözleşmesi.
 */
const FLOW = `
name: exchange3-test
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
    next: analyst
  - id: analyst
    provider: claude
    workspace: analyst
    prompt: ../../roles/analyst.prompt
    next: coder
  - id: coder
    provider: claude
    workspace: coder
    prompt: ../../roles/coder.prompt
    reject: planner
    next: done
planlama:
  katilimcilar: [planner, architect, analyst]
  tur: 2
  plan: docs/plan/{kart}.md
reject:
  limit: 2
  onExhausted: gate
`;

class FakeAdapter implements Adapter {
  readonly id = "claude";
  readonly model = "sahte-1";
  readonly gorulen: string[] = [];
  async invoke(req: InvokeRequest): Promise<InvokeResult> {
    this.gorulen.push(req.workdir);
    await writeFile(join(req.workdir, VERDICT_FILE), JSON.stringify({ decision: "accept", summary: "tamam" }));
    return { exitCode: 0, stdout: "", stderr: "", durationMs: 5 };
  }
}

let root: string;
let queue: CardQueue;
let topology: TopologySnapshot;
let options: TickOptions;
let dosyalar: Map<string, string>;
let logPath: string;

const WORKSPACES = ["main", "architect", "analyst", "coder"];
const at = (workspace: string, rel: string): string =>
  join(workspace === "main" ? root : join(root, WORKTREE_DIR, workspace), rel);

const PLAN = (id: string) => `docs/plan/${id}.md`;
const ITIRAZ = (id: string) => `docs/plan/${id}.itiraz.md`;

/**
 * Dosyayı BÜTÜN ağaçlara yazar.
 *
 * Gerçek koşuda bunu ileri birleştirme yapıyor; burada `mergeForward`
 * taklit edildiği için elle yazılıyor. Ve tam bu satır, körlemenin neden
 * yapılmadığını gösteriyor: taşıma bütün ağaçları eşitliyor, yani ikinci
 * itirazcı birincinin dosyasını görüyor (bkz. PLANLAMA.md, 6e).
 */
const herYere = (rel: string, metin: string): void => {
  for (const w of WORKSPACES) dosyalar.set(at(w, rel), metin);
};

interface Kayit {
  no: number;
  role: string;
  durum: string;
  kanit?: string;
}

const itirazDosyasi = (...kayitlar: Kayit[]): string =>
  `# İtirazlar\n\n${kayitlar.map((k) => `## İtiraz ${k.no} — ${k.role}
**Ne:** ${k.no}. itiraz.
**Neden:** Sebep ${k.no}.
**Neyi yanlışlar:** \`${k.kanit ?? "src/var.ts"}:3\` — orada.
**Durum:** ${k.durum}
`).join("\n")}`;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-alisveris3-"));
  logPath = join(root, "olaylar.jsonl");
  await mkdir(join(root, "hub", "flows"), { recursive: true });
  await mkdir(join(root, "hub", "prompts"), { recursive: true });
  await mkdir(join(root, "roles"), { recursive: true });
  for (const w of WORKSPACES.filter((w) => w !== "main")) {
    await mkdir(join(root, WORKTREE_DIR, w), { recursive: true });
  }
  await writeFile(join(root, "hub", "prompts", "base.md"), "# Anayasa\n");
  for (const r of ["planner", "architect", "analyst", "coder"]) {
    await writeFile(join(root, "roles", `${r}.prompt`), `# ${r}\n`);
  }
  await writeFile(join(root, "hub", "flows", "exchange3-test.yaml"), FLOW);

  queue = new CardQueue(join(root, ".skein"));
  await queue.init();
  topology = snapshot(
    await loadFlow(join(root, "hub", "flows", "exchange3-test.yaml"), { root, providers: knownProviderSet() }),
    root,
  );

  dosyalar = new Map();
  options = {
    root,
    queue,
    adapters: new Map<string, Adapter>([["claude", new FakeAdapter()]]),
    headCommit: async () => "abc1234",
    dirtyPaths: async () => [],
    isTracked: async () => false,
    mergeForward: async () => ({ kind: "merged" as const }),
    log: new EventLog(logPath, "r1"),
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

const rol = async (id: string): Promise<string | undefined> => (await queue.get(id))?.role;

/** Plan yazma turunu koşar; kart ilk itirazcıya geçer. */
async function planYaz(card: Card): Promise<void> {
  herYere(PLAN(card.id), "# Plan\nBirinci sürüm.\n");
  herYere("src/var.ts", "export const x = 1;\n");
  await tick("planner", options);
}

describe("6c — turun sırası", () => {
  it("itirazcılar zincir sırasında birer birer konuşur, yazar turun SONUNDA yanıtlar", async () => {
    const card = await put();
    await planYaz(card);
    expect(await rol(card.id)).toBe("architect");

    herYere(ITIRAZ(card.id), itirazDosyasi({ no: 1, role: "architect", durum: "açık" }));
    await tick("architect", options);
    // Kart yazara DEĞİL, ikinci itirazcıya gidiyor: turun ortasında
    // sonlanma kararı verilmez.
    expect(await rol(card.id)).toBe("analyst");

    herYere(ITIRAZ(card.id), itirazDosyasi(
      { no: 1, role: "architect", durum: "açık" },
      { no: 2, role: "analyst", durum: "açık" },
    ));
    await tick("analyst", options);
    expect(await rol(card.id)).toBe("planner");
  });

  it("turun ortasındaki sessizlik turu bitirmez", async () => {
    const card = await put();
    await planYaz(card);
    // İlk itirazcı hiçbir şey yazmadı; alışveriş buna bakıp kapanmamalı.
    herYere(ITIRAZ(card.id), "# İtirazlar\n\nBenden itiraz yok.\n");
    await tick("architect", options);
    expect(await rol(card.id)).toBe("analyst");

    // İkinci itirazcı yazınca tur yazara gider.
    herYere(ITIRAZ(card.id), itirazDosyasi({ no: 1, role: "analyst", durum: "açık" }));
    await tick("analyst", options);
    expect(await rol(card.id)).toBe("planner");
  });
});

describe("6c — yeni itiraz sayacı ve doğal son", () => {
  /** Tur 1: iki itiraz, yazar ikisini de kabul edip planı düzeltir. */
  async function tur1(card: Card): Promise<void> {
    await planYaz(card);
    herYere(ITIRAZ(card.id), itirazDosyasi({ no: 1, role: "architect", durum: "açık" }));
    await tick("architect", options);
    herYere(ITIRAZ(card.id), itirazDosyasi(
      { no: 1, role: "architect", durum: "açık" },
      { no: 2, role: "analyst", durum: "açık" },
    ));
    await tick("analyst", options);
    herYere(ITIRAZ(card.id), itirazDosyasi(
      { no: 1, role: "architect", durum: "kabul" },
      { no: 2, role: "analyst", durum: "kabul" },
    ));
    herYere(PLAN(card.id), "# Plan\nİkinci sürüm — itirazlar karşılandı.\n");
    await tick("planner", options);
  }

  it("tavan dolmadıysa ikinci tur açılır", async () => {
    const card = await put();
    await tur1(card);
    // Tavan 2: tur 1 kapandı ama alışveriş bitmedi — itirazcılar
    // DÜZELTİLMİŞ planı okuyup yeni itiraz yazabilir.
    expect(await rol(card.id)).toBe("architect");
  });

  it("yeni itiraz eklemeyen tur alışverişi bitirir — yazarın turu koşmaz", async () => {
    const card = await put();
    await tur1(card);

    // Tur 2: kimse yeni itiraz eklemedi (dosya aynı, ikisi de kapalı).
    await tick("architect", options);
    expect(await rol(card.id)).toBe("analyst");
    await tick("analyst", options);

    // Alışveriş kapandı ve kart zincirden devam etti; yazar boş bir
    // aktivasyon harcamadı.
    expect(await rol(card.id)).toBe("coder");
    const { events } = await readEvents(logPath);
    const settled = events.filter((e) => e.type === "plan.settled");
    expect(settled).toHaveLength(1);
    expect(settled[0]).toMatchObject({ outcome: "anlasma", rounds: 2, role: "analyst", accepted: 2 });
  });

  it("bu turda eklenen itiraz sayısı günlüğe AYRI düşer", async () => {
    const card = await put();
    await tur1(card);

    herYere(ITIRAZ(card.id), itirazDosyasi(
      { no: 1, role: "architect", durum: "kabul" },
      { no: 2, role: "analyst", durum: "kabul" },
      { no: 3, role: "architect", durum: "açık" },
    ));
    await tick("architect", options);

    const { events } = await readEvents(logPath);
    const turlar = events.filter((e) => e.type === "plan.round");
    const son = turlar[turlar.length - 1];
    // Dosyada üç itiraz var ama bu turun katkısı BİR. Birikimli sayıyı
    // "yeni" diye okumak, her turu yeni itiraz eklemiş gibi gösterirdi.
    expect(son).toMatchObject({ round: 2, newObjections: 1, openObjections: 1 });
    // Körleme yapılmadı ve günlük bunu böyle yazıyor.
    expect(son).toMatchObject({ blind: false });
  });
});

describe("6c — kilit", () => {
  async function turBir(card: Card, durum1 = "açık"): Promise<void> {
    await planYaz(card);
    herYere(ITIRAZ(card.id), itirazDosyasi({ no: 1, role: "architect", durum: durum1 }));
    await tick("architect", options);
    await tick("analyst", options);
  }

  it("tur yeni itiraz eklemedi ama açık itiraz kaldıysa kart KİLİT kapısına çıkar", async () => {
    const card = await put();
    await turBir(card);
    // Tur 1 sonu: yazar itirazı cevapsız bıraktı → tavan dolmadı, tur 2 açıldı.
    await tick("planner", options);
    expect(await rol(card.id)).toBe("architect");

    // Tur 2: kimse yeni itiraz eklemedi, ama #1 hâlâ açık.
    await tick("architect", options);
    const result = await tick("analyst", options);

    expect(result.status).toBe("escalated");
    const gated = (await queue.get(card.id)) as Card;
    expect(gateKind(gated)).toBe("deadlock");
    expect(result.status === "escalated" && result.reason).toMatch(/yeni itiraz eklemedi/);

    const { events } = await readEvents(logPath);
    expect(events.filter((e) => e.type === "plan.settled")[0]).toMatchObject({
      outcome: "tukendi", rounds: 2, role: "analyst",
    });
  });

  // İtirazcının turunda doğan kilit de PLANLAMA kilidi: "ileri bırak"
  // kartı alışverişten SONRAKİ role göndermeli, zincirdeki ardıla değil.
  // Ardıl itiraz eden roldür ve oraya dönmek bir tur daha para harcardı.
  it("itirazcı turunda doğan kilitten ileri bırakma alışverişi atlar", async () => {
    const card = await put();
    await turBir(card);
    await tick("planner", options);
    await tick("architect", options);
    await tick("analyst", options);

    const released = await queue.release(card.id, { decision: "forward" });
    expect(released.role).toBe("coder");
  });

  it("tavan dolduğunda açık itiraz kartı kilide çıkarır", async () => {
    const card = await put();
    await turBir(card);
    await tick("planner", options);

    // Tur 2: yeni bir itiraz eklendi, yazar yine cevapsız bıraktı. Tavan
    // (2) doldu.
    herYere(ITIRAZ(card.id), itirazDosyasi(
      { no: 1, role: "architect", durum: "açık" },
      { no: 2, role: "analyst", durum: "açık" },
    ));
    await tick("architect", options);
    await tick("analyst", options);
    expect(await rol(card.id)).toBe("planner");

    const result = await tick("planner", options);
    expect(result.status).toBe("escalated");
    expect(result.status === "escalated" && result.reason).toMatch(/tavanı doldu \(2 tur\)/);
    expect(gateKind((await queue.get(card.id)) as Card)).toBe("deadlock");
  });

  it("retry aynı rolü AYNI tura geri koyar — insan planı yeniden açar", async () => {
    const card = await put();
    await turBir(card);
    await tick("planner", options);
    herYere(ITIRAZ(card.id), itirazDosyasi(
      { no: 1, role: "architect", durum: "açık" },
      { no: 2, role: "analyst", durum: "açık" },
    ));
    await tick("architect", options);
    await tick("analyst", options);
    await tick("planner", options);

    const released = await queue.release(card.id, { decision: "retry" });
    expect(released.role).toBe("planner");

    // Yazar şimdi itirazları karşılayabilir: tur ilerlemedi, aynı tur
    // yeniden koşuyor.
    herYere(ITIRAZ(card.id), itirazDosyasi(
      { no: 1, role: "architect", durum: "ret: ölçüm bunu göstermiyor" },
      { no: 2, role: "analyst", durum: "ret: aynı sebep" },
    ));
    const sonuc = await tick("planner", options);
    expect(sonuc.status).toBe("accepted");
    expect(await rol(card.id)).toBe("coder");
  });
});

describe("6c — iş metni turu taşır", () => {
  it("itiraz turunda ORTAK dosya uyarısı var", async () => {
    const card = await put();
    await planYaz(card);
    const kart = (await queue.get(card.id)) as Card;
    const metin = buildTaskText(kart, roleOf(topology, "architect") as never);
    // Dosya ortak: başkasının itirazını ezmek, sayılmış bir itirazı sessizce
    // kaybetmek olur.
    expect(metin).toMatch(/ORTAK bir dosya/);
    expect(metin).not.toMatch(/tur 2/);
  });

  it("ikinci turda itirazcıya 'düzeltme karşıladı mı' sorusu gider", async () => {
    const card = await put();
    await planYaz(card);
    herYere(ITIRAZ(card.id), itirazDosyasi({ no: 1, role: "architect", durum: "açık" }));
    await tick("architect", options);
    await tick("analyst", options);
    herYere(ITIRAZ(card.id), itirazDosyasi({ no: 1, role: "architect", durum: "kabul" }));
    herYere(PLAN(card.id), "# Plan\nİkinci sürüm.\n");
    await tick("planner", options);

    const kart = (await queue.get(card.id)) as Card;
    const metin = buildTaskText(kart, roleOf(topology, "architect") as never);
    expect(metin).toContain("## Plana itiraz et (tur 2)");
    expect(metin).toMatch(/düzeltmenin gerçekten karşılayıp/);
  });

  it("cevap turunda tavanın nerede olduğu yazılı", async () => {
    const card = await put();
    await planYaz(card);
    herYere(ITIRAZ(card.id), itirazDosyasi({ no: 1, role: "architect", durum: "açık" }));
    await tick("architect", options);
    await tick("analyst", options);

    const kart = (await queue.get(card.id)) as Card;
    const metin = buildTaskText(kart, roleOf(topology, "planner") as never);
    // Tur 1, tavan 2: yazar bir tur daha olduğunu bilmeli.
    expect(metin).toMatch(/Tavan 2 tur; bu tur 1/);
    expect(metin).not.toMatch(/son tur/);
  });
});
