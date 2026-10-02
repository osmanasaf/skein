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
 * 6c ve 6e: üç katılımcı, iki tur, ve körleme.
 *
 * `exchange.test.ts` iki katılımcı ve tek turu sınıyor; buradaki sorular
 * başka: turun SIRASI, yeni itiraz sayacı, tavan, ve körlemenin TAŞIMA
 * tarafı — körlü turda kimin ağacına ne giriyor.
 *
 * Sahte `mergeForward` gerçek anlamı taklit ediyor: birleştirme, kaynak
 * ağacın dosyalarını hedef ağaca KOPYALIYOR. Bu şart — yoksa körleme
 * sınanamaz: dosyaları her ağaca elle yazan bir test, taşımanın ne yaptığını
 * hiç sormamış olur.
 */
const FLOW = (kor: boolean): string => `
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
    next: reviewer
  - id: reviewer
    provider: claude
    workspace: reviewer
    prompt: ../../roles/reviewer.prompt
    syncBack: [coder]
    reject: coder
    next: done
planlama:
  katilimcilar: [planner, architect, analyst]
  tur: 2
  ilk-tur-kor: ${kor}
  plan: docs/plan/{kart}.md
reject:
  limit: 2
  onExhausted: gate
`;

class FakeAdapter implements Adapter {
  readonly id = "claude";
  readonly model = "sahte-1";
  async invoke(req: InvokeRequest): Promise<InvokeResult> {
    await writeFile(join(req.workdir, VERDICT_FILE), JSON.stringify({ decision: "accept", summary: "tamam" }));
    return { exitCode: 0, stdout: "", stderr: "", durationMs: 5 };
  }
}

const WORKSPACES = ["main", "architect", "analyst", "coder", "reviewer"];

let root: string;
let queue: CardQueue;
let topology: TopologySnapshot;
let options: TickOptions;
/** Sahte dosya sistemi: `çalışma-alanı:yol` → içerik. */
let dosyalar: Map<string, string>;
/** Her birleştirme: `kaynak→hedef`. Taşımanın şeklini bu liste söylüyor. */
let birlesmeler: string[];
let logPath: string;

const wsDir = (ws: string): string =>
  ws === "main" ? root : join(root, WORKTREE_DIR, ws);

/** Mutlak yolu (çalışma-alanı, relatif) çiftine çözer; en uzun önek kazanır. */
function coz(abs: string): { ws: string; rel: string } | null {
  // Windows'ta `join` ters eğik çizgi üretiyor, sahte dosya sisteminin
  // anahtarları ise POSIX. Normalize edilmezse hiçbir yol çözülmüyor:
  // ürün kodu doğru olduğu halde bu dosyanın 20 sınaması kırmızı yanıyordu.
  const duz = (x: string): string => x.split("\\").join("/");
  const yolu = duz(abs);
  let best: { ws: string; rel: string } | null = null;
  for (const ws of WORKSPACES) {
    const dir = duz(wsDir(ws)) + "/";
    if (!yolu.startsWith(dir)) continue;
    const rel = yolu.slice(dir.length);
    if (best === null || rel.length < best.rel.length) best = { ws, rel };
  }
  return best;
}

const yaz = (ws: string, rel: string, metin: string): void => {
  dosyalar.set(`${ws}:${rel}`, metin);
};
const var_ = (ws: string, rel: string): boolean => dosyalar.has(`${ws}:${rel}`);

const PLAN = (id: string) => `docs/plan/${id}.md`;
const ITIRAZ = (id: string, rol: string) => `docs/plan/${id}.itiraz.${rol}.md`;

interface Kayit {
  no: number;
  durum: string;
  kanit?: string;
}

/** Bir itirazcının KENDİ dosyası. Numaralar dosya içinde 1'den başlar. */
const itirazDosyasi = (rol: string, ...kayitlar: Kayit[]): string =>
  `# İtirazlar — ${rol}\n\n${kayitlar.map((k) => `## İtiraz ${k.no} — ${rol}
**Ne:** ${rol} ${k.no}. itiraz.
**Neden:** Sebep ${k.no}.
**Neyi yanlışlar:** \`${k.kanit ?? "src/var.ts"}:3\` — orada.
**Durum:** ${k.durum}
`).join("\n")}`;

const YOK = "# İtirazlar\n\nBenden itiraz yok; planın her iddiasını kontrol ettim.\n";

async function hazirla(kor: boolean): Promise<void> {
  await writeFile(join(root, "hub", "flows", "exchange3-test.yaml"), FLOW(kor));
  topology = snapshot(
    await loadFlow(join(root, "hub", "flows", "exchange3-test.yaml"), { root, providers: knownProviderSet() }),
    root,
  );
}

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
  for (const r of ["planner", "architect", "analyst", "coder", "reviewer"]) {
    await writeFile(join(root, "roles", `${r}.prompt`), `# ${r}\n`);
  }

  queue = new CardQueue(join(root, ".skein"));
  await queue.init();
  dosyalar = new Map();
  birlesmeler = [];
  options = {
    root,
    queue,
    adapters: new Map<string, Adapter>([["claude", new FakeAdapter()]]),
    headCommit: async () => "abc1234",
    dirtyPaths: async () => [],
    isTracked: async () => false,
    // Birleştirme GERÇEKTEN kopyalıyor: körlemenin sınanabilmesinin koşulu.
    mergeForward: async ({ fromDir, toDir }) => {
      const from = coz(`${fromDir}/x`);
      const to = coz(`${toDir}/x`);
      if (from === null || to === null) return { kind: "merged" as const };
      birlesmeler.push(`${from.ws}→${to.ws}`);
      for (const [anahtar, metin] of [...dosyalar]) {
        const [ws, ...kalan] = anahtar.split(":");
        if (ws !== from.ws) continue;
        dosyalar.set(`${to.ws}:${kalan.join(":")}`, metin);
      }
      return { kind: "merged" as const };
    },
    log: new EventLog(logPath, "r1"),
    readPlan: async (path) => {
      const y = coz(path);
      const text = y === null ? undefined : dosyalar.get(`${y.ws}:${y.rel}`);
      if (text === undefined) throw new Error("ENOENT");
      return text;
    },
    pathExists: async (path) => {
      const y = coz(path);
      return y !== null && var_(y.ws, y.rel);
    },
  };
  await hazirla(true);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const put = async (): Promise<Card> =>
  queue.add(newCard({ title: "iş", task: "undo ekle", topology }));

const rol = async (id: string): Promise<string | undefined> => (await queue.get(id))?.role;

/** Plan yazma turunu koşar; kart ilk itirazcıya geçer. */
async function planYaz(card: Card): Promise<void> {
  yaz("main", PLAN(card.id), "# Plan\nBirinci sürüm.\n");
  yaz("main", "src/var.ts", "export const x = 1;\n");
  await tick("planner", options);
}

const turlar = async (): Promise<{ role: string; round: number; blind: boolean; newObjections: number }[]> => {
  const { events } = await readEvents(logPath);
  return events.filter((e) => e.type === "plan.round").map((e) => ({
    role: e.role, round: e.round, blind: e.blind, newObjections: e.newObjections,
  }));
};

describe("6e — körlü tur: taşıma dallanıyor ve toplanıyor", () => {
  // 6e'nin bitiş testi, birinci yarısı: ikinci itirazcının ağacında
  // birincinin dosyası YOK.
  it("ikinci itirazcı, birincinin itiraz dosyasını GÖRMEZ", async () => {
    const card = await put();
    await planYaz(card);
    yaz("architect", ITIRAZ(card.id, "architect"), itirazDosyasi("architect", { no: 1, durum: "açık" }));
    await tick("architect", options);

    expect(await rol(card.id)).toBe("analyst");
    // Kart analyst'e geçti; onun ağacı YAZARIN ağacından beslendi.
    expect(var_("analyst", PLAN(card.id))).toBe(true);
    expect(var_("analyst", ITIRAZ(card.id, "architect"))).toBe(false);
    // Taşıma zincirden değil yazardan dallandı.
    expect(birlesmeler).toEqual(["main→architect", "main→analyst"]);
  });

  // İkinci yarısı: turun sonunda yazarın ağacında İKİSİ de var.
  it("turun sonunda bütün itirazlar yazarın ağacında toplanır", async () => {
    const card = await put();
    await planYaz(card);
    yaz("architect", ITIRAZ(card.id, "architect"), itirazDosyasi("architect", { no: 1, durum: "açık" }));
    await tick("architect", options);
    yaz("analyst", ITIRAZ(card.id, "analyst"), itirazDosyasi("analyst", { no: 1, durum: "açık" }));
    await tick("analyst", options);

    expect(await rol(card.id)).toBe("planner");
    expect(var_("main", ITIRAZ(card.id, "architect"))).toBe(true);
    expect(var_("main", ITIRAZ(card.id, "analyst"))).toBe(true);
    // Fan-in: iki itirazcının ağacı da yazara katıldı.
    expect(birlesmeler.slice(-2)).toEqual(["architect→main", "analyst→main"]);
  });

  // Körlü turda son itirazcı sonlanma kararı VEREMEZ: kendi dosyasından
  // başkasını görmüyor. Karar verse, öteki itirazcının itirazını sessizce
  // çöpe atardı — körlemenin en pahalı kusuru bu olurdu.
  it("hiç itiraz yazmayan son itirazcı, turu kapatmaz", async () => {
    const card = await put();
    await planYaz(card);
    yaz("architect", ITIRAZ(card.id, "architect"), itirazDosyasi("architect", { no: 1, durum: "açık" }));
    await tick("architect", options);
    yaz("analyst", ITIRAZ(card.id, "analyst"), YOK);
    await tick("analyst", options);

    // Kart `coder`a DEĞİL yazara gitti; architect'in itirazı hayatta.
    expect(await rol(card.id)).toBe("planner");
  });

  it("yazar birleşmeden sonra itirazların TOPLAMINI görür", async () => {
    const card = await put();
    await planYaz(card);
    yaz("architect", ITIRAZ(card.id, "architect"), itirazDosyasi("architect", { no: 1, durum: "açık" }));
    await tick("architect", options);
    yaz("analyst", ITIRAZ(card.id, "analyst"), itirazDosyasi("analyst", { no: 1, durum: "açık" }));
    await tick("analyst", options);
    await tick("planner", options);

    const kayitlar = await turlar();
    // İtirazcılar kendi dosyalarından başkasını görmüyor: ikisi de "1".
    // Turun gerçek toplamı ilk kez YAZARIN turunda biliniyor: "2".
    expect(kayitlar.map((k) => [k.role, k.newObjections])).toEqual([
      ["architect", 1], ["analyst", 1], ["planner", 2],
    ]);
    // Numaralar dosyalar arasında çakışıyor (ikisi de "İtiraz 1") ve bu
    // sorun değil: kimlik (sahip, no) çifti.
    expect(kayitlar.every((k) => k.blind)).toBe(true);
  });

  it("körlü turda hiç itiraz çıkmazsa yazarın turu alışverişi kapatır", async () => {
    const card = await put();
    await planYaz(card);
    yaz("architect", ITIRAZ(card.id, "architect"), YOK);
    await tick("architect", options);
    yaz("analyst", ITIRAZ(card.id, "analyst"), YOK);
    await tick("analyst", options);
    expect(await rol(card.id)).toBe("planner");

    await tick("planner", options);
    expect(await rol(card.id)).toBe("coder");
    const { events } = await readEvents(logPath);
    expect(events.filter((e) => e.type === "plan.settled")[0]).toMatchObject({
      outcome: "anlasma", role: "planner", rounds: 1, objections: 0,
    });
  });

  // Kural parser'da duruyor diye tick'te duruyor sayılmaz: adaptör
  // haritasını elle kuran sınamalar gerçek bağlantıyı hiç sınamamıştı.
  // Burada kanıt yolu GERÇEKTEN depoda (plan belgesi fan-out ile
  // itirazcının ağacına kopyalanıyor), yani itirazı eleyen tek şey
  // "kendi belgesi" koşulu.
  it("plan belgesini kanıt gösteren itirazı tick de geçersiz sayar", async () => {
    const card = await put();
    await planYaz(card);
    yaz("architect", ITIRAZ(card.id, "architect"),
      itirazDosyasi("architect", { no: 1, durum: "açık", kanit: PLAN(card.id) }));
    await tick("architect", options);
    yaz("analyst", ITIRAZ(card.id, "analyst"), YOK);
    await tick("analyst", options);
    expect(await rol(card.id)).toBe("planner");

    await tick("planner", options);
    const { events } = await readEvents(logPath);
    expect(events.filter((e) => e.type === "plan.settled")[0]).toMatchObject({
      outcome: "anlasma", rounds: 1, objections: 0, invalid: 1,
    });
  });

  // Kanıt varlık haritası SATIR SATIR kuruluyordu ve her satırdan yalnızca
  // İLK yolu alıyordu. Ayrıştırıcı ise bütün yollara bakıyor. İkisi ayrı
  // düşünce, aynı satırda plan belgesini ve kodu gösteren bir itirazın KOD
  // yolu haritaya hiç girmiyor, "depoda yok" sayılıyor, ve itiraz "yolların
  // hepsi kendi belgesi" diye eleniyordu — kapatmaya çalıştığım yanlış
  // elemenin ta kendisi, bir katman aşağıda.
  it("aynı satırda plan belgesi VE kod gösteren itiraz ayakta kalır", async () => {
    const card = await put();
    await planYaz(card);
    yaz("architect", ITIRAZ(card.id, "architect"),
      `# İtirazlar — architect\n\n## İtiraz 1 — architect\n` +
      `**Ne:** Plan sürüm sayacına güveniyor.\n` +
      `**Neden:** Tüketici önbelleği sürüme bakıyor.\n` +
      `**Neyi yanlışlar:** \`${PLAN(card.id)}:44\` yüzeysel, \`src/var.ts:3\` kırılıyor.\n` +
      `**Durum:** açık\n`);
    await tick("architect", options);
    yaz("analyst", ITIRAZ(card.id, "analyst"), YOK);
    await tick("analyst", options);

    const { events } = await readEvents(logPath);
    expect(events.filter((e) => e.type === "plan.round")[0]).toMatchObject({
      role: "architect", newObjections: 1, openObjections: 1, invalid: 0,
    });
  });

  // Karşı uç: aynı kurgu, kanıt plan yerine KODA işaret ediyor. Ayrımı
  // yapan şeyin yol olduğunu bu çift gösteriyor.
  it("koda işaret eden itiraz geçerli sayılmayı sürdürür", async () => {
    const card = await put();
    await planYaz(card);
    yaz("architect", ITIRAZ(card.id, "architect"),
      itirazDosyasi("architect", { no: 1, durum: "açık", kanit: "src/var.ts" }));
    await tick("architect", options);
    yaz("analyst", ITIRAZ(card.id, "analyst"), YOK);
    await tick("analyst", options);
    const { events } = await readEvents(logPath);
    expect(events.filter((e) => e.type === "plan.round")[0]).toMatchObject({
      role: "architect", newObjections: 1, openObjections: 1, invalid: 0,
    });
  });

  // Taşıma bozulursa itiraz KAYBOLUR. Sessizce "itiraz yok" saymak,
  // körlemenin en pahalı kusuru olurdu; o yüzden eksik dosya hata.
  it("bir itirazcının dosyası yazara ulaşmazsa tur kabul edilmez", async () => {
    const card = await put();
    await planYaz(card);
    yaz("architect", ITIRAZ(card.id, "architect"), itirazDosyasi("architect", { no: 1, durum: "açık" }));
    await tick("architect", options);
    yaz("analyst", ITIRAZ(card.id, "analyst"), itirazDosyasi("analyst", { no: 1, durum: "açık" }));
    await tick("analyst", options);
    // Fan-in'in taşıdığı dosyayı kaybet.
    dosyalar.delete(`main:${ITIRAZ(card.id, "analyst")}`);

    const result = await tick("planner", options);
    expect(result.status).toBe("escalated");
    expect(result.status === "escalated" && result.reason).toMatch(/analyst.*ulaşmadı/s);
  });

  it("iş metni turun kör olduğunu söyler", async () => {
    const card = await put();
    await planYaz(card);
    const kart = (await queue.get(card.id)) as Card;
    const metin = buildTaskText(kart, roleOf(topology, "architect") as never);
    expect(metin).toMatch(/Bu tur KÖR/);
    expect(metin).toContain(ITIRAZ(card.id, "architect"));
    // Kendi dosyası verilir, ötekinin yolu hiç geçmez.
    expect(metin).not.toContain(ITIRAZ(card.id, "analyst"));
  });

  // Devir teslimin iki kapısı iş metninin BAŞINDA olmak zorunda. Ölçüm
  // kampanyasında `claude-haiku-4-5` kolların yarısını tam bu iki adımda
  // düşürdü: biri commit'i atladı, öteki `.skein-verdict.json`'ı `git add -A`
  // ile ürünün geçmişine soktu. İkisinin talimatı rol promptunun ortasında
  // duruyordu ve tutmuyordu — projenin iki kez öğrendiği dersin üçüncüsü.
  it("iş metni devir teslimin iki kapısını da BAŞTA söyler", async () => {
    const card = await put();
    await planYaz(card);
    const kart = (await queue.get(card.id)) as Card;
    for (const rolAdi of ["architect", "coder"]) {
      const metin = buildTaskText(kart, roleOf(topology, rolAdi) as never);
      const bas = metin.slice(0, metin.indexOf("## İş"));
      expect(bas).toMatch(/git commit/);
      expect(bas).toMatch(/commit'lemE/);
      expect(bas).toMatch(/git add -A/);
    }
  });

  it("cevap turunun iş metni bütün itiraz dosyalarını sayar", async () => {
    const card = await put();
    await planYaz(card);
    yaz("architect", ITIRAZ(card.id, "architect"), itirazDosyasi("architect", { no: 1, durum: "açık" }));
    await tick("architect", options);
    yaz("analyst", ITIRAZ(card.id, "analyst"), itirazDosyasi("analyst", { no: 1, durum: "açık" }));
    await tick("analyst", options);

    const kart = (await queue.get(card.id)) as Card;
    const metin = buildTaskText(kart, roleOf(topology, "planner") as never);
    expect(metin).toContain(ITIRAZ(card.id, "architect"));
    expect(metin).toContain(ITIRAZ(card.id, "analyst"));
    expect(metin).toMatch(/HEPSİNİ yanıtla/);
  });
});

describe("6c — açık turda sıra, sayaç ve kilit", () => {
  beforeEach(async () => {
    await hazirla(false);
  });

  it("açık turda ikinci itirazcı birincinin itirazını GÖRÜR", async () => {
    const card = await put();
    await planYaz(card);
    yaz("architect", ITIRAZ(card.id, "architect"), itirazDosyasi("architect", { no: 1, durum: "açık" }));
    await tick("architect", options);

    expect(await rol(card.id)).toBe("analyst");
    expect(var_("analyst", ITIRAZ(card.id, "architect"))).toBe(true);
    // Taşıma zincir boyunca ileri: dallanma yok.
    expect(birlesmeler).toEqual(["main→architect", "architect→analyst"]);
    expect((await turlar()).every((k) => !k.blind)).toBe(true);
  });

  it("turun ortasındaki sessizlik turu bitirmez", async () => {
    const card = await put();
    await planYaz(card);
    yaz("architect", ITIRAZ(card.id, "architect"), YOK);
    await tick("architect", options);
    expect(await rol(card.id)).toBe("analyst");

    yaz("analyst", ITIRAZ(card.id, "analyst"), itirazDosyasi("analyst", { no: 1, durum: "açık" }));
    await tick("analyst", options);
    expect(await rol(card.id)).toBe("planner");
  });

  /** Tur 1: iki itiraz, yazar ikisini de kabul edip planı düzeltir. */
  async function tur1(card: Card): Promise<void> {
    await planYaz(card);
    yaz("architect", ITIRAZ(card.id, "architect"), itirazDosyasi("architect", { no: 1, durum: "açık" }));
    await tick("architect", options);
    yaz("analyst", ITIRAZ(card.id, "analyst"), itirazDosyasi("analyst", { no: 1, durum: "açık" }));
    await tick("analyst", options);
    yaz("main", ITIRAZ(card.id, "architect"), itirazDosyasi("architect", { no: 1, durum: "kabul" }));
    yaz("main", ITIRAZ(card.id, "analyst"), itirazDosyasi("analyst", { no: 1, durum: "kabul" }));
    yaz("main", PLAN(card.id), "# Plan\nİkinci sürüm — itirazlar karşılandı.\n");
    await tick("planner", options);
  }

  it("tavan dolmadıysa ikinci tur açılır", async () => {
    const card = await put();
    await tur1(card);
    expect(await rol(card.id)).toBe("architect");
  });

  it("yeni itiraz eklemeyen tur alışverişi bitirir — yazarın turu koşmaz", async () => {
    const card = await put();
    await tur1(card);
    await tick("architect", options);
    expect(await rol(card.id)).toBe("analyst");
    await tick("analyst", options);

    expect(await rol(card.id)).toBe("coder");
    const { events } = await readEvents(logPath);
    const settled = events.filter((e) => e.type === "plan.settled");
    expect(settled).toHaveLength(1);
    expect(settled[0]).toMatchObject({ outcome: "anlasma", rounds: 2, role: "analyst", accepted: 2 });
  });

  it("bu turda eklenen itiraz sayısı günlüğe AYRI düşer", async () => {
    const card = await put();
    await tur1(card);
    yaz("architect", ITIRAZ(card.id, "architect"), itirazDosyasi("architect",
      { no: 1, durum: "kabul" }, { no: 2, durum: "açık" }));
    await tick("architect", options);

    const kayitlar = await turlar();
    const son = kayitlar[kayitlar.length - 1];
    // Görünen toplam üç itiraz ama bu turun katkısı BİR.
    expect(son).toMatchObject({ round: 2, newObjections: 1 });
  });

  async function turBir(card: Card): Promise<void> {
    await planYaz(card);
    yaz("architect", ITIRAZ(card.id, "architect"), itirazDosyasi("architect", { no: 1, durum: "açık" }));
    await tick("architect", options);
    yaz("analyst", ITIRAZ(card.id, "analyst"), YOK);
    await tick("analyst", options);
  }

  it("tur yeni itiraz eklemedi ama açık itiraz kaldıysa kart KİLİT kapısına çıkar", async () => {
    const card = await put();
    await turBir(card);
    // Yazar itirazı cevapsız bıraktı → tavan dolmadı, tur 2 açıldı.
    await tick("planner", options);
    expect(await rol(card.id)).toBe("architect");

    await tick("architect", options);
    const result = await tick("analyst", options);

    expect(result.status).toBe("escalated");
    expect(gateKind((await queue.get(card.id)) as Card)).toBe("deadlock");
    expect(result.status === "escalated" && result.reason).toMatch(/yeni itiraz eklemedi/);
  });

  // İtirazcının turunda doğan kilit de PLANLAMA kilidi: "ileri bırak"
  // kartı alışverişten SONRAKİ role göndermeli, zincirdeki ardıla değil.
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

    // Tur 2: yeni itiraz eklendi, yazar yine cevapsız bıraktı. Tavan doldu.
    yaz("architect", ITIRAZ(card.id, "architect"), itirazDosyasi("architect",
      { no: 1, durum: "açık" }, { no: 2, durum: "açık" }));
    await tick("architect", options);
    await tick("analyst", options);
    expect(await rol(card.id)).toBe("planner");

    const result = await tick("planner", options);
    expect(result.status).toBe("escalated");
    expect(result.status === "escalated" && result.reason).toMatch(/tavanı doldu \(2 tur\)/);
  });

  it("retry aynı rolü AYNI tura geri koyar — insan planı yeniden açar", async () => {
    const card = await put();
    await turBir(card);
    await tick("planner", options);
    yaz("architect", ITIRAZ(card.id, "architect"), itirazDosyasi("architect",
      { no: 1, durum: "açık" }, { no: 2, durum: "açık" }));
    await tick("architect", options);
    await tick("analyst", options);
    await tick("planner", options);

    const released = await queue.release(card.id, { decision: "retry" });
    expect(released.role).toBe("planner");

    yaz("main", ITIRAZ(card.id, "architect"), itirazDosyasi("architect",
      { no: 1, durum: "ret: ölçüm bunu göstermiyor" }, { no: 2, durum: "ret: aynı sebep" }));
    const sonuc = await tick("planner", options);
    expect(sonuc.status).toBe("accepted");
    expect(await rol(card.id)).toBe("coder");
  });

  it("ikinci turda itirazcıya 'düzeltme karşıladı mı' sorusu gider", async () => {
    const card = await put();
    await tur1(card);
    const kart = (await queue.get(card.id)) as Card;
    const metin = buildTaskText(kart, roleOf(topology, "architect") as never);
    expect(metin).toContain("## Plana itiraz et (tur 2)");
    expect(metin).toMatch(/düzeltmenin gerçekten karşılayıp/);
    // Tur 2 açık: körleme uyarısı geçmez.
    expect(metin).not.toMatch(/Bu tur KÖR/);
  });

  it("cevap turunda tavanın nerede olduğu yazılı", async () => {
    const card = await put();
    await planYaz(card);
    yaz("architect", ITIRAZ(card.id, "architect"), itirazDosyasi("architect", { no: 1, durum: "açık" }));
    await tick("architect", options);
    yaz("analyst", ITIRAZ(card.id, "analyst"), YOK);
    await tick("analyst", options);

    const kart = (await queue.get(card.id)) as Card;
    const metin = buildTaskText(kart, roleOf(topology, "planner") as never);
    expect(metin).toMatch(/Tavan 2 tur; bu tur 1/);
    expect(metin).not.toMatch(/son tur/);
  });
});
