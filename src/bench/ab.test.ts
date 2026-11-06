import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Adapter, InvokeRequest, InvokeResult } from "../adapters/contract.js";
import { readEvents } from "../events/log.js";
import { VERDICT_FILE } from "../watch/verdict.js";
import {
  ArmError, armAdapters, armMetrics, preCheck, prepareSandbox, requireAdapters, runArm,
  type Arm, type ArmResult,
} from "./ab.js";

// Bu dosyanın sınamaları BÜTÜNLEŞME sınaması: her biri geçici bir git deposu
// kuruyor, worktree açıyor, kartı rol zinciri boyunca yürütüyor ve gizli
// süiti üretilen koda karşı koşturuyor. Varsayılan 5 saniye birim sınaması
// ölçüsü; buradaki en ağır ikisi POSIX'te 4.6s ve 3.7s sürüyordu, yani
// sınıra yapışıktı — platformdan bağımsız, gizli bir kırılganlık. Windows'ta
// (git daha yavaş, dosyalar taranıyor) ikisi de sınırı aştı ve sınama
// zaman aşımından kırmızı yandı; ürün kodu doğruydu.
//
// Sınır performans hakkında bir şey İDDİA ETMİYOR: ne kadar sürdüğü
// ölçülmüyor, yalnızca takılmanın sonsuza kilitlenmemesi isteniyor.
vi.setConfig({ testTimeout: 60_000 });

const REPO = resolve(import.meta.dirname, "../..");

/** Testin geçici kökü; `sandbox` beforeEach içinde atanıyor. */
const sandbox2 = (): string => sandbox;

/**
 * Rolüne göre davranan sahte ajan.
 *
 * Gerçek ajan çağırmadan koşum takımının kendisini sınıyor: kum havuzu
 * kuruluyor mu, akış bitiyor mu, gizli süit üretilen koda karşı koşuyor mu.
 * Para harcanmadan cevaplanabilecek sorular bunlar.
 */
class RoleAdapter implements Adapter {
  readonly id = "claude";
  readonly model = "sahte-1";
  readonly seen: string[] = [];
  /** Kodu yazan rol bunu `src/<entry>` olarak yazar. */
  resolution = "export function topla(n: number[]): number {\n  return n.reduce((a, b) => a + b, 0);\n}\n";

  async invoke(req: InvokeRequest): Promise<InvokeResult> {
    // Katman işareti rolün KİMLİĞİNİ taşıyor (`rol:architect`), prompt
    // dosyasının adını değil — ilk hâli dosya adına bakıyordu ve itiraz
    // eden rolü hiç tanımıyordu.
    const text = await readFile(req.promptFile, "utf8");
    const theRole = /rol:([a-z-]+)/.exec(text)?.[1] ?? "?";
    this.seen.push(theRole);

    if (theRole === "planner") {
      const theCard = /Kart: `([^`]+)`/.exec(req.taskText ?? "")?.[1] ?? "x";
      await mkdir(join(req.workdir, "docs/plan"), { recursive: true });
      await writeFile(join(req.workdir, `docs/plan/${theCard}.md`), "# Plan\nsrc/toplam.ts yazılacak.\n");
    } else if (theRole === "architect") {
      const theCard = /Kart: `([^`]+)`/.exec(req.taskText ?? "")?.[1] ?? "x";
      await mkdir(join(req.workdir, "docs/plan"), { recursive: true });
      await writeFile(join(req.workdir, `docs/plan/${theCard}.itiraz.architect.md`),
        "# İtirazlar\n\nİtirazım yok.\n");
    } else if (theRole === "coder") {
      await mkdir(join(req.workdir, "src"), { recursive: true });
      await writeFile(join(req.workdir, "src/toplam.ts"), this.resolution);
    }

    // Gerçek koşuda commit'i ajan atar; burada taklit ediyoruz.
    await commit(req.workdir);
    await writeFile(join(req.workdir, VERDICT_FILE), JSON.stringify({
      decision: "accept", summary: `${theRole} tamam`,
    }));
    return { exitCode: 0, stdout: "", stderr: "", durationMs: 3, usage: { costUsd: 0.01 } };
  }
}

async function commit(cwd: string): Promise<void> {
  const { spawnPortable } = await import("../proc/process.js");
  for (const args of [["add", "-A"], ["commit", "--quiet", "--allow-empty", "-m", "skein: sahte tur"]]) {
    const child = spawnPortable("git", args, { cwd });
    await new Promise((r) => child.on("close", r));
  }
}

let sandbox: string;
let logPath: string;

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), "skein-ab-"));
  logPath = join(sandbox, "olaylar.jsonl");
});
afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

/**
 * Fikstür görev: iki kancalı, küçük ve bu dosyaya ait.
 *
 * Gerçek görev setine eklenmiyor — `selftest` ve kampanyalar onu görmemeli.
 * `repo` yine gerçek depo, çünkü gizli süit vitest'i oradan koşuyor.
 */
async function fikstur(): Promise<string> {
  const dir = join(sandbox, "toplam");
  await mkdir(join(dir, "hidden"), { recursive: true });
  await writeFile(join(dir, "task.yaml"),
    'id: toplam\ntitle: Toplama\nlanguage: ts\nspec: spec.md\nentry: src/toplam.ts\n' +
    'hidden:\n  command: ["npx", "vitest", "run", "--reporter=json"]\n');
  await writeFile(join(dir, "spec.md"),
    "# Görev: topla\n\n`topla(sayilar)` dizinin toplamını döndürsün; boş dizide 0.\n");
  await writeFile(join(dir, "hidden", "toplam.test.ts"),
    'import { describe, expect, it } from "vitest";\n' +
    'import { topla } from "../artifact/src/toplam.js";\n\n' +
    'describe("topla", () => {\n' +
    '  it("dizinin toplamını döndürür", () => {\n    expect(topla([1, 2, 3])).toBe(6);\n  });\n' +
    '  it("boş dizide sıfır döndürür", () => {\n    expect(topla([])).toBe(0);\n  });\n' +
    '});\n');
  return dir;
}

const kos = async (arm: Arm, adapter: Adapter) =>
  runArm({
    repo: REPO,
    taskId: "toplam",
    taskDir: await fikstur(),
    arm,
    sandbox: join(sandbox, arm),
    adapters: new Map([["claude", adapter]]),
    logPath,
    runId: `t-${arm}`,
    timeoutMs: 20_000,
  });

describe("6d koşum takımı", () => {
  it("kontrol kolu: kart biter, gizli süit üretilen koda karşı koşar", async () => {
    const adapter = new RoleAdapter();
    const result = await kos("plansiz", adapter);

    expect(result.cardState).toBe("done");
    expect(adapter.seen).toEqual(["coder", "reviewer"]);
    // Gizli süit GERÇEKTEN koştu: bu, "kusur yok" demenin ön koşulu.
    expect(result.ran).toBe(true);
    expect(result.total).toBeGreaterThan(0);
    expect(result.red).toEqual([]);
    expect(result.activations).toBe(2);
    expect(result.planning).toBeUndefined();
  });

  it("deney kolu: planlama turu koşar ve sayıları kayda geçer", async () => {
    const adapter = new RoleAdapter();
    const result = await kos("planli", adapter);
    expect(result.cardState).toBe("done");
    expect(adapter.seen).toEqual(["planner", "architect", "coder", "reviewer"]);
    expect(result.ran).toBe(true);
    expect(result.planning).toEqual({ rounds: 1, objections: 0, accepted: 0, invalid: 0 });
    // Planlama iki aktivasyon ekliyor: ölçümün bedeli bu.
    expect(result.activations).toBe(4);
  });

  // Kusurlu çözüm kırmızı kanca üretmeli; yoksa ölçümün ölçüm gücü yok.
  it("kusurlu çözümde kırmızı kanca çıkar", async () => {
    const adapter = new RoleAdapter();
    adapter.resolution = "export function topla(n: number[]): number {\n  return n.length;\n}\n";
    const result = await kos("plansiz", adapter);

    expect(result.ran).toBe(true);
    expect(result.red.length).toBeGreaterThan(0);
  });

  // Kapıda kalan kolun sebebi sonuca taşınmak zorunda: kampanyada
  // "gate" yazısı tek başına modelin commit'i atlamasıyla ret limitinin
  // dolmasını ayırt etmiyor.
  it("kapıda kalan kolda kaçış sebebi sonuca taşınır", async () => {
    const adapter = new RoleAdapter();
    // Kod yazan rol commit atmazsa devir olmaz: canlı koşuda haiku tam
    // bunu yaptı.
    const commitsiz: Adapter = {
      id: "claude",
      model: "sahte-1",
      async invoke(req) {
        const text = await readFile(req.promptFile, "utf8");
        if (/rol:coder/.test(text)) {
          await mkdir(join(req.workdir, "src"), { recursive: true });
          await writeFile(join(req.workdir, "src/toplam.ts"), adapter.resolution);
          await writeFile(join(req.workdir, VERDICT_FILE), JSON.stringify({
            decision: "accept", summary: "commit atmadım",
          }));
          return { exitCode: 0, stdout: "", stderr: "", durationMs: 3 };
        }
        return adapter.invoke(req);
      },
    };
    const result = await kos("plansiz", commitsiz);
    expect(result.cardState).not.toBe("done");
    expect(result.escalation).toMatch(/işlenmemiş/);
  });

  it("kol kimliği günlüğe açıkça yazılır", async () => {
    await kos("planli", new RoleAdapter());
    const { events } = await readEvents(logPath);
    expect(events.find((e) => e.type === "ab.arm")).toMatchObject({
      taskId: "toplam", arm: "planli", flow: "ab-planli",
    });
  });

  it("gizli testler üretim sırasında kum havuzunda YOKTUR", async () => {
    const adapter = new RoleAdapter();
    let didSee = true;
    const casus: Adapter = {
      id: "claude",
      model: "sahte-1",
      async invoke(req) {
        const { access } = await import("node:fs/promises");
        didSee = await access(join(sandbox, "plansiz", "hidden")).then(() => true, () => false);
        return adapter.invoke(req);
      },
    };
    await kos("plansiz", casus);
    expect(didSee).toBe(false);
  });
});

describe("armMetrics", () => {
  it("aktivasyon, maliyet ve retleri günlükten sayar", () => {
    const ev = (e: Record<string, unknown>) =>
      ({ v: 1, at: "2026-01-01T00:00:00.000Z", runId: "r1", ...e }) as never;
    const m = armMetrics([
      ev({ type: "agent.finished", cell: "a", exitCode: 0, durationMs: 1, usage: { costUsd: 0.5 } }),
      ev({ type: "agent.finished", cell: "b", exitCode: 0, durationMs: 1 }),
      ev({ type: "card.settled", cell: "b", card: "c1", role: "reviewer", outcome: "rejected", state: "queued" }),
      ev({ type: "card.settled", cell: "b", card: "c1", role: "reviewer", outcome: "accepted", state: "done" }),
    ]);
    expect(m).toEqual({ activations: 2, costUsd: 0.5, rejects: 1 });
  });
});

// Canlı doğrulama koşusunda yazım hatası ÖLÇÜM gibi göründü: `--k 1`
// biçimi model adını yuttu, adaptör `1` diye kaydedildi ve iki kol da
// "ÖLÇÜLEMEDİ" döndü. Para harcanmadı ama sonuç yanıltıcıydı.
describe("sağlayıcı denetimi", () => {
  it("eksik adaptörde koşu hiç başlamaz", () => {
    expect(() => requireAdapters(["claude"], new Map())).toThrow(ArmError);
    expect(() => requireAdapters(["claude"], new Map())).toThrow(/adaptör yok: claude/);
  });

  it("adaptör varsa sessizce geçer", () => {
    const stubbed = { id: "claude", model: "m", invoke: async () => ({ exitCode: 0, stdout: "", stderr: "", durationMs: 1 }) };
    expect(() => requireAdapters(["claude", "claude"], new Map([["claude", stubbed]]))).not.toThrow();
  });

  it("kol koşusu eksik adaptörle ÖLÇÜLEMEDİ döndürmez, hata atar", async () => {
    await expect(runArm({
      repo: REPO,
      taskId: "toplam",
      taskDir: await fikstur(),
      arm: "plansiz",
      sandbox: join(sandbox, "bos"),
      adapters: new Map(),
      logPath,
      runId: "t-bos",
      timeoutMs: 5_000,
    })).rejects.toThrow(/adaptör yok/);
  });
});

// Canlı doğrulamanın İKİNCİ yazım hatası buradaydı: harita `adapter.id`
// ile kurulmuştu (`claude:claude-haiku-4-5`), akış rolleri ise
// `provider: claude` diyor. `requireAdapters` yakaladı ve koşu hiç
// başlamadı — ama testler haritayı elle kurduğu için kusuru görmemişti.
describe("armAdapters", () => {
  it("haritayı SAĞLAYICI adıyla anahtarlar, adaptör kimliğiyle değil", () => {
    const m = armAdapters("claude:claude-haiku-4-5-20251001");
    expect([...m.keys()]).toEqual(["claude"]);
    expect(m.get("claude")?.model).toBe("claude-haiku-4-5-20251001");
    // Kimlik model tanımının tamamı kalmalı: 2x2 hücreleri buna dayanıyor.
    expect(m.get("claude")?.id).toBe("claude:claude-haiku-4-5-20251001");
  });

  it("ürettiği harita akışın sağlayıcı denetiminden geçer", () => {
    expect(() => requireAdapters(["claude"], armAdapters("claude:claude-sonnet-5"))).not.toThrow();
  });

  it("sağlayıcı yazılmazsa claude varsayılır", () => {
    expect([...armAdapters("claude-opus-5").keys()]).toEqual(["claude"]);
  });
});

// Koşum ortamı tek komutu 10 dakikada kesiyor ve itiraz turu olan planlı
// kollar bunu aşıyor. Kolu baştan koşmak, biten aktivasyonların parasını
// ikinci kez ödemek olurdu; sürdürme orkestratörün kendi `recover()`
// mekanizmasını kullanıyor.
describe("kol sürdürme", () => {
  it("yarıda kesilmiş kolu kaldığı yerden bitirir", async () => {
    const dir = await fikstur();
    const sandbox = join(sandbox2(), "surdur");
    const adapter = new RoleAdapter();
    // İlk geçiş: yalnızca bir süpürme — kart `coder`dan sonra yarıda kalır.
    const halfDone = await runArm({
      repo: REPO, taskId: "toplam", taskDir: dir, arm: "plansiz",
      sandbox, adapters: new Map([["claude", adapter]]),
      logPath, runId: "t-surdur", timeoutMs: 20_000, maxSweeps: 1,
    });
    expect(halfDone.cardState).not.toBe("done");
    expect(adapter.seen).toEqual(["coder"]);

    // İkinci geçiş: AYNI kum havuzu, aynı runId, kurulum yok.
    const tam = await runArm({
      repo: REPO, taskId: "toplam", taskDir: dir, arm: "plansiz",
      sandbox, adapters: new Map([["claude", adapter]]),
      logPath, runId: "t-surdur", timeoutMs: 20_000, resume: true,
    });
    expect(tam.cardState).toBe("done");
    expect(adapter.seen).toEqual(["coder", "reviewer"]);
    expect(tam.ran).toBe(true);
    // Aktivasyonlar AYNI koşuya toplanıyor: iki geçiş tek kol.
    expect(tam.activations).toBe(2);
  });

  // Kum havuzu KURULU ama kart hiç eklenmemiş: sürdürülecek bir şey yok.
  // (Kum havuzu hiç yoksa hata daha önce, akış dosyasında geliyor.)
  it("kart hiç eklenmemişse açıkça hata verir", async () => {
    const dir = await fikstur();
    const kum = join(sandbox2(), "kartsiz");
    const { loadTask } = await import("./task.js");
    await prepareSandbox(REPO, kum, await loadTask(dir));

    await expect(runArm({
      repo: REPO, taskId: "toplam", taskDir: dir, arm: "plansiz",
      sandbox: kum, adapters: new Map([["claude", new RoleAdapter()]]),
      logPath, runId: "t-kartsiz", timeoutMs: 5_000, resume: true,
    })).rejects.toThrow(/sürdürülecek kart yok/);
  });
});

/**
 * Ön kontrol ÜRETİMİN SAĞLIĞINI güç kontrolünden ÖNCE sormalı.
 *
 * `kalibre` komutu yalnızca "süit koştu mu" ve "kırmızı kanca var mı"
 * sorularına bakıyordu. `cardState` ve `escalation` elinin altındaydı ve
 * hiç sorulmuyordu, yani kartı kapıda kalmış bir kolda bile "ÖLÇER —
 * sıradaki: planab --k=3" yazabiliyordu. O satır para harcama kararı
 * veriyor.
 *
 * `matrixSkip` bu dersi zaten öğrenmişti ve aynı sırayla söylüyor: üretim
 * sağlıksızsa kırmızı kancalar kusur değil, artefaktın yokluğu olabilir —
 * ve aynı mantıkla yeşiller de "kusur yok" demek değildir.
 */
describe("onKontrol", () => {
  const armName = (over: Partial<Pick<ArmResult, "ran" | "cardState" | "red" | "escalation">> = {}) => ({
    ran: true,
    cardState: "done",
    red: ["hooks/gizli.test.ts"],
    ...over,
  });

  it("süit koşmadıysa hiçbir okuma geçerli değil", () => {
    const verdict = preCheck(armName({ ran: false, red: [] }));
    expect(verdict.kind).toBe("olculemedi");
    // "Kusur yok" diye okunmaması gerektiği SÖYLENİYOR: bildirilmemiş
    // sıfır değildir.
    expect(verdict.kind === "olculemedi" && verdict.reason).toMatch(/kusur yok/i);
  });

  it("kart done değilse ŞÜPHELİ — ÖLÇER demiyor", () => {
    const verdict = preCheck(armName({ cardState: "gate", escalation: "işlenmemiş değişiklik var" }));
    expect(verdict.kind).toBe("kuskulu");
    if (verdict.kind !== "kuskulu") throw new Error("kuskulu beklendi");
    // Sebep satırı insana GİDİYOR: iki zıt durumu yalnızca o ayırt ediyor.
    expect(verdict.reason).toContain("gate");
    expect(verdict.reason).toContain("işlenmemiş değişiklik var");
    // Kancalar atılmıyor: insan onlara bakarak karar verecek.
    expect(verdict.red).toEqual(["hooks/gizli.test.ts"]);
  });

  /**
   * SIRA önemli ve bu sınama onu pinliyor.
   *
   * Güç kontrolü önce gelse, yarıda kalmış bir koşu "ÖLÇEMEZ" diye
   * damgalanır ve sebebi hiç görünmezdi — oysa kancaların yeşil olması
   * işin hiç yapılmamış olmasından kaynaklanıyor olabilir.
   */
  it("kart done değil ve kanca yoksa da ŞÜPHELİ, ÖLÇEMEZ değil", () => {
    const verdict = preCheck(armName({ cardState: "gate", red: [], escalation: "ret limiti doldu" }));
    expect(verdict.kind).toBe("kuskulu");
  });

  it("iş bitti ve kanca yoksa ÖLÇEMEZ", () => {
    const verdict = preCheck(armName({ red: [] }));
    expect(verdict.kind).toBe("olcemez");
    expect(verdict.kind === "olcemez" && verdict.reason).toMatch(/azalma olmaz/);
  });

  it("iş bitti ve kanıtlanmış kusur varsa ÖLÇER", () => {
    const verdict = preCheck(armName({ red: ["a", "b"] }));
    expect(verdict).toEqual({ kind: "olcer", red: ["a", "b"] });
  });

  // `escalation` yoksa da sebep satırı kartın durumunu söylemek zorunda:
  // "ŞÜPHELİ" tek başına operatöre hiçbir şey anlatmaz.
  it("escalation yoksa bile durum adı sebepte", () => {
    const verdict = preCheck(armName({ cardState: "active" }));
    expect(verdict.kind === "kuskulu" && verdict.reason).toContain("active");
  });
});

