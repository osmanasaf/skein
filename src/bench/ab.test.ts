import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Adapter, InvokeRequest, InvokeResult } from "../adapters/contract.js";
import { readEvents } from "../events/log.js";
import { VERDICT_FILE } from "../watch/verdict.js";
import { armMetrics, runArm, type Arm } from "./ab.js";

const REPO = resolve(import.meta.dirname, "../..");

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
      await writeFile(join(req.workdir, `docs/plan/${kart}.itiraz.md`),
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
