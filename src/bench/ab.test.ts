import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Adapter, InvokeRequest, InvokeResult } from "../adapters/contract.js";
import { readEvents } from "../events/log.js";
import { VERDICT_FILE } from "../watch/verdict.js";
import {
  ArmError, armAdapters, armMetrics, prepareSandbox, requireAdapters, runArm, type Arm,
} from "./ab.js";

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
  readonly gorulen: string[] = [];
  /** Kodu yazan rol bunu `src/<entry>` olarak yazar. */
  cozum = "export function topla(n: number[]): number {\n  return n.reduce((a, b) => a + b, 0);\n}\n";

  async invoke(req: InvokeRequest): Promise<InvokeResult> {
    // Katman işareti rolün KİMLİĞİNİ taşıyor (`rol:architect`), prompt
    // dosyasının adını değil — ilk hâli dosya adına bakıyordu ve itiraz
    // eden rolü hiç tanımıyordu.
    const metin = await readFile(req.promptFile, "utf8");
    const rol = /rol:([a-z-]+)/.exec(metin)?.[1] ?? "?";
    this.gorulen.push(rol);

    if (rol === "planner") {
      const kart = /Kart: `([^`]+)`/.exec(req.taskText ?? "")?.[1] ?? "x";
      await mkdir(join(req.workdir, "docs/plan"), { recursive: true });
      await writeFile(join(req.workdir, `docs/plan/${kart}.md`), "# Plan\nsrc/toplam.ts yazılacak.\n");
    } else if (rol === "architect") {
      const kart = /Kart: `([^`]+)`/.exec(req.taskText ?? "")?.[1] ?? "x";
      await mkdir(join(req.workdir, "docs/plan"), { recursive: true });
      await writeFile(join(req.workdir, `docs/plan/${kart}.itiraz.architect.md`),
        "# İtirazlar\n\nİtirazım yok.\n");
    } else if (rol === "coder") {
      await mkdir(join(req.workdir, "src"), { recursive: true });
      await writeFile(join(req.workdir, "src/toplam.ts"), this.cozum);
    }

    // Gerçek koşuda commit'i ajan atar; burada taklit ediyoruz.
    await commit(req.workdir);
    await writeFile(join(req.workdir, VERDICT_FILE), JSON.stringify({
      decision: "accept", summary: `${rol} tamam`,
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
    const sonuc = await kos("plansiz", adapter);

    expect(sonuc.cardState).toBe("done");
    expect(adapter.gorulen).toEqual(["coder", "reviewer"]);
    // Gizli süit GERÇEKTEN koştu: bu, "kusur yok" demenin ön koşulu.
    expect(sonuc.ran).toBe(true);
    expect(sonuc.total).toBeGreaterThan(0);
    expect(sonuc.red).toEqual([]);
    expect(sonuc.activations).toBe(2);
    expect(sonuc.planning).toBeUndefined();
  });

  it("deney kolu: planlama turu koşar ve sayıları kayda geçer", async () => {
    const adapter = new RoleAdapter();
    const sonuc = await kos("planli", adapter);
    expect(sonuc.cardState).toBe("done");
    expect(adapter.gorulen).toEqual(["planner", "architect", "coder", "reviewer"]);
    expect(sonuc.ran).toBe(true);
    expect(sonuc.planning).toEqual({ rounds: 1, objections: 0, accepted: 0, invalid: 0 });
    // Planlama iki aktivasyon ekliyor: ölçümün bedeli bu.
    expect(sonuc.activations).toBe(4);
  });

  // Kusurlu çözüm kırmızı kanca üretmeli; yoksa ölçümün ölçüm gücü yok.
  it("kusurlu çözümde kırmızı kanca çıkar", async () => {
    const adapter = new RoleAdapter();
    adapter.cozum = "export function topla(n: number[]): number {\n  return n.length;\n}\n";
    const sonuc = await kos("plansiz", adapter);

    expect(sonuc.ran).toBe(true);
    expect(sonuc.red.length).toBeGreaterThan(0);
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
        const metin = await readFile(req.promptFile, "utf8");
        if (/rol:coder/.test(metin)) {
          await mkdir(join(req.workdir, "src"), { recursive: true });
          await writeFile(join(req.workdir, "src/toplam.ts"), adapter.cozum);
          await writeFile(join(req.workdir, VERDICT_FILE), JSON.stringify({
            decision: "accept", summary: "commit atmadım",
          }));
          return { exitCode: 0, stdout: "", stderr: "", durationMs: 3 };
        }
        return adapter.invoke(req);
      },
    };
    const sonuc = await kos("plansiz", commitsiz);
    expect(sonuc.cardState).not.toBe("done");
    expect(sonuc.escalation).toMatch(/işlenmemiş/);
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
    let gorduMu = true;
    const casus: Adapter = {
      id: "claude",
      model: "sahte-1",
      async invoke(req) {
        const { access } = await import("node:fs/promises");
        gorduMu = await access(join(sandbox, "plansiz", "hidden")).then(() => true, () => false);
        return adapter.invoke(req);
      },
    };
    await kos("plansiz", casus);
    expect(gorduMu).toBe(false);
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
    const sahte = { id: "claude", model: "m", invoke: async () => ({ exitCode: 0, stdout: "", stderr: "", durationMs: 1 }) };
    expect(() => requireAdapters(["claude", "claude"], new Map([["claude", sahte]]))).not.toThrow();
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
    const yarim = await runArm({
      repo: REPO, taskId: "toplam", taskDir: dir, arm: "plansiz",
      sandbox, adapters: new Map([["claude", adapter]]),
      logPath, runId: "t-surdur", timeoutMs: 20_000, maxSweeps: 1,
    });
    expect(yarim.cardState).not.toBe("done");
    expect(adapter.gorulen).toEqual(["coder"]);

    // İkinci geçiş: AYNI kum havuzu, aynı runId, kurulum yok.
    const tam = await runArm({
      repo: REPO, taskId: "toplam", taskDir: dir, arm: "plansiz",
      sandbox, adapters: new Map([["claude", adapter]]),
      logPath, runId: "t-surdur", timeoutMs: 20_000, resume: true,
    });
    expect(tam.cardState).toBe("done");
    expect(adapter.gorulen).toEqual(["coder", "reviewer"]);
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
