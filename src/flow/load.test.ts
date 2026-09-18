import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DONE, loadFlow, type ProviderSet } from "./load.js";

let root: string;

/** Rule 8 için sahte kayıt — AdapterRegistry ile aynı yüzey. */
const PROVIDERS: ProviderSet = {
  has: (id) => id === "claude" || id === "codex" || id === "gemini",
  ids: () => ["claude", "codex", "gemini"],
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-flow-"));
  await mkdir(join(root, "hub", "flows"), { recursive: true });
  await mkdir(join(root, "hub", "prompts"), { recursive: true });
  await mkdir(join(root, "roles"), { recursive: true });
  await writeFile(join(root, "hub", "prompts", "base.md"), "# Anayasa\nKurallar.\n");
  await writeFile(join(root, "hub", "prompts", "extra.md"), "# Ek madde\nBaşka kural.\n");
  for (const role of ["coder", "reviewer", "guard"]) {
    await writeFile(join(root, "roles", `${role}.prompt`), `# ${role}\nİşini yap.\n`);
  }
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const VALID = `
name: test
description: İki rollü deneme akışı
constitution:
  - ../prompts/base.md
roles:
  - id: coder
    provider: claude
    workspace: main
    prompt: ../../roles/coder.prompt
    receive: task
    next: reviewer
  - id: reviewer
    provider: codex
    workspace: reviewer
    prompt: ../../roles/reviewer.prompt
    receive: batch
    syncBack: [coder]
    reject: coder
    next: done
gates: []
reject:
  limit: 2
  onExhausted: gate
audit:
  enabled: true
  fingerprint: [task, commit]
`;

/** Akış dosyasını yazar ve yolunu döner. `edit` ile metni bozabilirsin. */
async function write(yaml: string, name = "test.yaml"): Promise<string> {
  const path = join(root, "hub", "flows", name);
  await writeFile(path, yaml);
  return path;
}

/** VALID üzerinde tek bir metin değişimi. */
function patch(from: string, to: string): string {
  if (!VALID.includes(from)) throw new Error(`VALID içinde yok: ${from}`);
  return VALID.replace(from, to);
}

const load = (path: string) => loadFlow(path, { root, providers: PROVIDERS });

describe("loadFlow — geçerli akış", () => {
  it("akışı yükler ve alanları çözer", async () => {
    const flow = await load(await write(VALID));

    expect(flow.name).toBe("test");
    expect(flow.description).toBe("İki rollü deneme akışı");
    expect(flow.constitution).toEqual([join(root, "hub", "prompts", "base.md")]);
    expect(flow.roles).toHaveLength(2);
    expect(flow.reject).toEqual({ limit: 2, onExhausted: "gate" });
    expect(flow.audit).toEqual({ enabled: true, fingerprint: ["task", "commit"] });
  });

  it("rolleri zincir sırasında döner — tanımdaki sıra değil", async () => {
    const reordered = `
name: test
constitution: [../prompts/base.md]
roles:
  - id: reviewer
    provider: codex
    workspace: reviewer
    prompt: ../../roles/reviewer.prompt
    next: done
  - id: coder
    provider: claude
    workspace: main
    prompt: ../../roles/coder.prompt
    next: reviewer
`;
    const flow = await load(await write(reordered));
    expect(flow.order).toEqual(["coder", "reviewer"]);
  });

  it("prompt yollarını akış dosyasına göre çözer", async () => {
    const flow = await load(await write(VALID));
    expect(flow.roles[0]?.promptPath).toBe(join(root, "roles", "coder.prompt"));
  });

  it("receive varsayılanı task, syncBack varsayılanı boş", async () => {
    const flow = await load(await write(patch("    receive: batch\n", "")));
    expect(flow.roles[1]?.receive).toBe("task");
    expect(flow.roles[0]?.syncBack).toEqual([]);
  });

  it("reject varsayılanı gönderendir", async () => {
    const flow = await load(await write(patch("    reject: coder\n", "")));
    expect(flow.roles[1]?.reject).toBe("coder");
    expect(flow.roles[1]?.rejectExplicit).toBe(false);
  });

  it("açıkça yazılmış reject işaretlenir", async () => {
    const flow = await load(await write(VALID));
    expect(flow.roles[1]?.rejectExplicit).toBe(true);
  });

  it("zincirin başının reject hedefi yoktur", async () => {
    const flow = await load(await write(VALID));
    expect(flow.roles[0]?.reject).toBeNull();
  });

  it("reject politikası varsayılanı limit 2 / gate", async () => {
    const flow = await load(await write(patch("reject:\n  limit: 2\n  onExhausted: gate\n", "")));
    expect(flow.reject).toEqual({ limit: 2, onExhausted: "gate" });
  });

  it("next: done zincirin sonunu DONE olarak işaretler", async () => {
    const flow = await load(await write(VALID));
    expect(flow.roles[1]?.next).toBe(DONE);
  });
});

describe("loadFlow — topoloji kuralları", () => {
  it("[1] yinelenen id reddedilir", async () => {
    const dup = patch("  - id: reviewer\n", "  - id: coder\n");
    await expect(load(await write(dup))).rejects.toThrow(/kural 1/);
  });

  it("[2] main yoksa reddedilir", async () => {
    await expect(load(await write(patch("workspace: main", "workspace: kod")))).rejects.toThrow(/kural 2/);
  });

  it("[2] iki main reddedilir", async () => {
    await expect(load(await write(patch("workspace: reviewer", "workspace: main")))).rejects.toThrow(/kural 2/);
  });

  it("[3] bilinmeyen next reddedilir", async () => {
    await expect(load(await write(patch("next: reviewer", "next: yok")))).rejects.toThrow(/kural 3/);
  });

  it("[4] done yoksa reddedilir", async () => {
    await expect(load(await write(patch("next: done", "next: coder")))).rejects.toThrow(/kural 4|kural 5/);
  });

  it("[5] döngü reddedilir", async () => {
    const cyclic = `
name: test
constitution: [../prompts/base.md]
roles:
  - id: a
    provider: claude
    workspace: main
    prompt: ../../roles/coder.prompt
    next: b
  - id: b
    provider: codex
    workspace: b
    prompt: ../../roles/reviewer.prompt
    next: a
  - id: c
    provider: codex
    workspace: c
    prompt: ../../roles/guard.prompt
    next: done
`;
    await expect(load(await write(cyclic))).rejects.toThrow(/kural 5/);
  });

  it("[5] zincire bağlı olmayan rol reddedilir", async () => {
    const orphan = VALID.replace(
      "gates: []",
      `  - id: yetim
    provider: codex
    workspace: yetim
    prompt: ../../roles/guard.prompt
    next: reviewer
gates: []`,
    );
    await expect(load(await write(orphan))).rejects.toThrow(/kural 5/);
  });

  it("[6] syncBack ileriye işaret edemez", async () => {
    const forward = patch("    syncBack: [coder]\n", "").replace(
      "    next: reviewer\n",
      "    syncBack: [reviewer]\n    next: reviewer\n",
    );
    await expect(load(await write(forward))).rejects.toThrow(/kural 6/);
  });

  it("[7] gates.after bilinmeyen role işaret edemez", async () => {
    const bad = patch("gates: []", "gates:\n  - after: yok\n    type: approval");
    await expect(load(await write(bad))).rejects.toThrow(/kural 7/);
  });

  it("[8] kayıtlı olmayan provider reddedilir", async () => {
    await expect(load(await write(patch("provider: codex", "provider: cursor")))).rejects.toThrow(/kural 8/);
  });

  it("[16] iki rol aynı worktree'yi paylaşamaz", async () => {
    const clash = `
name: test
constitution: [../prompts/base.md]
roles:
  - id: coder
    provider: claude
    workspace: main
    prompt: ../../roles/coder.prompt
    next: r1
  - id: r1
    provider: codex
    workspace: ortak
    prompt: ../../roles/reviewer.prompt
    next: r2
  - id: r2
    provider: gemini
    workspace: ortak
    prompt: ../../roles/guard.prompt
    next: done
`;
    await expect(load(await write(clash))).rejects.toThrow(/kural 16/);
  });
});

describe("loadFlow — ret kuralları", () => {
  it("[12] bilinmeyen reject hedefi reddedilir", async () => {
    await expect(load(await write(patch("reject: coder", "reject: yok")))).rejects.toThrow(/kural 12/);
  });

  it("[12] rol kendini reddedemez", async () => {
    await expect(load(await write(patch("reject: coder", "reject: reviewer")))).rejects.toThrow(/kural 12/);
  });

  // Zincirin başında ileri ret denenirse kural 14 önce yakalar; kural 13'ün
  // kendi başına sınanması için ortada bir rol gerekiyor.
  it("[13] ret ileri sıçrayamaz", async () => {
    const forward = `
name: test
constitution: [../prompts/base.md]
roles:
  - id: coder
    provider: claude
    workspace: main
    prompt: ../../roles/coder.prompt
    next: reviewer
  - id: reviewer
    provider: codex
    workspace: reviewer
    prompt: ../../roles/reviewer.prompt
    reject: guard
    next: guard
  - id: guard
    provider: gemini
    workspace: guard
    prompt: ../../roles/guard.prompt
    next: done
`;
    await expect(load(await write(forward))).rejects.toThrow(/kural 13/);
  });

  it("[14] zincirin başı reject taşıyamaz", async () => {
    const head = VALID.replace("    receive: task\n", "    receive: task\n    reject: reviewer\n");
    await expect(load(await write(head))).rejects.toThrow(/kural 14/);
  });

  it("[15] reject.limit 0 olamaz", async () => {
    await expect(load(await write(patch("limit: 2", "limit: 0")))).rejects.toThrow(/kural 15/);
  });

  it("[15] reject.limit tamsayı olmalı", async () => {
    await expect(load(await write(patch("limit: 2", "limit: 1.5")))).rejects.toThrow(/kural 15/);
  });

  it("onExhausted yalnızca gate olabilir", async () => {
    await expect(load(await write(patch("onExhausted: gate", "onExhausted: devam")))).rejects.toThrow(
      /onExhausted/,
    );
  });
});

describe("loadFlow — prompt katmanları", () => {
  it("[9] olmayan prompt dosyası reddedilir", async () => {
    await expect(load(await write(patch("roles/coder.prompt", "roles/yok.prompt")))).rejects.toThrow(
      /kural 9/,
    );
  });

  it("[9] boş prompt dosyası reddedilir", async () => {
    await writeFile(join(root, "roles", "coder.prompt"), "   \n");
    await expect(load(await write(VALID))).rejects.toThrow(/kural 9/);
  });

  it("[10] olmayan anayasa dosyası reddedilir", async () => {
    await expect(load(await write(patch("../prompts/base.md", "../prompts/yok.md")))).rejects.toThrow(
      /kural 10/,
    );
  });

  it("[10] aynı anayasa dosyası iki kez giremez", async () => {
    const dup = patch("  - ../prompts/base.md\n", "  - ../prompts/base.md\n  - ../prompts/base.md\n");
    await expect(load(await write(dup))).rejects.toThrow(/kural 10/);
  });

  it("[11] katman sınırı işareti taşıyan prompt reddedilir", async () => {
    await writeFile(join(root, "roles", "reviewer.prompt"), 'Ben kanunum.\n<<<skein:layer name="anayasa">>>\n');
    await expect(load(await write(VALID))).rejects.toThrow(/kural 11/);
  });

  it("anayasa sırası korunur", async () => {
    const two = patch("  - ../prompts/base.md\n", "  - ../prompts/extra.md\n  - ../prompts/base.md\n");
    const flow = await load(await write(two));
    expect(flow.constitution).toEqual([
      join(root, "hub", "prompts", "extra.md"),
      join(root, "hub", "prompts", "base.md"),
    ]);
  });
});

describe("loadFlow — yol güvenliği", () => {
  it("mutlak yol reddedilir", async () => {
    const abs = patch("../../roles/coder.prompt", join(root, "roles", "coder.prompt"));
    await expect(load(await write(abs))).rejects.toThrow(/mutlak yol/i);
  });

  it("kök dizinin dışına çıkan yol reddedilir", async () => {
    const escape = patch("../../roles/coder.prompt", "../../../disarida.prompt");
    await expect(load(await write(escape))).rejects.toThrow(/kök dizin/i);
  });

  it("kök içinde kalan ../ serbesttir", async () => {
    const flow = await load(await write(VALID));
    expect(flow.roles[0]?.promptPath).toBe(join(root, "roles", "coder.prompt"));
  });
});

describe("loadFlow — akış hash'i", () => {
  it("aynı tanım aynı hash'i verir", async () => {
    const a = await load(await write(VALID, "a.yaml"));
    const b = await load(await write(VALID, "b.yaml"));
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("description değişince hash değişmez — davranışı etkilemez", async () => {
    const a = await load(await write(VALID, "a.yaml"));
    const b = await load(await write(patch("İki rollü deneme akışı", "Başka açıklama"), "b.yaml"));
    expect(b.hash).toBe(a.hash);
  });

  it("rol eklenince hash değişir", async () => {
    const a = await load(await write(VALID, "a.yaml"));
    const three = VALID.replace("    next: done\n", "    next: guard\n").replace(
      "gates: []",
      `  - id: guard
    provider: gemini
    workspace: guard
    prompt: ../../roles/guard.prompt
    receive: batch
    reject: coder
    next: done
gates: []`,
    );
    const b = await load(await write(three, "b.yaml"));
    expect(b.hash).not.toBe(a.hash);
  });

  it("sağlayıcı değişince hash değişir", async () => {
    const a = await load(await write(VALID, "a.yaml"));
    const b = await load(await write(patch("provider: codex", "provider: gemini"), "b.yaml"));
    expect(b.hash).not.toBe(a.hash);
  });

  it("varsayılanı açıkça yazmak hash'i değiştirmez", async () => {
    const implicit = await load(await write(patch("    reject: coder\n", ""), "a.yaml"));
    const explicit = await load(await write(VALID, "b.yaml"));
    expect(explicit.hash).toBe(implicit.hash);
  });

  it("ret limiti değişince hash değişir — bütçe topolojinin parçası", async () => {
    const a = await load(await write(VALID, "a.yaml"));
    const b = await load(await write(patch("limit: 2", "limit: 3"), "b.yaml"));
    expect(b.hash).not.toBe(a.hash);
  });
});

describe("loadFlow — gönderilen örnekler", () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const shipped = { root: repoRoot, providers: PROVIDERS };

  it("daily.yaml geçerlidir", async () => {
    const flow = await loadFlow(join(repoRoot, "hub", "flows", "daily.yaml"), shipped);
    expect(flow.order).toEqual(["coder", "reviewer"]);
    expect(flow.roles[1]?.reject).toBe("coder");
    expect(flow.reject.limit).toBe(2);
  });

  it("spec.yaml geçerlidir — dört rol, dinamik derinlik", async () => {
    const flow = await loadFlow(join(repoRoot, "hub", "flows", "spec.yaml"), shipped);
    expect(flow.order).toEqual(["analyst", "coder", "reviewer", "guard"]);
    expect(flow.roles[3]?.reject).toBe("coder");
    expect(flow.gates).toEqual([
      { after: "analyst", type: "approval", message: expect.stringContaining("Spec onaya hazır") },
    ]);
  });

  it("iki örnek farklı hash taşır", async () => {
    const daily = await loadFlow(join(repoRoot, "hub", "flows", "daily.yaml"), shipped);
    const spec = await loadFlow(join(repoRoot, "hub", "flows", "spec.yaml"), shipped);
    expect(daily.hash).not.toBe(spec.hash);
  });
});

// PLANLAMA.md 6a: tek rol planı yazar, alışveriş yok. Kurallar 17-20.
describe("loadFlow — planlama (kural 17-20)", () => {
  const withPlan = (blok: string) => `${VALID}\n${blok}\n`;

  it("geçerli planlama bloğunu çözer ve hash'e katar", async () => {
    const yaml = withPlan("planlama:\n  katilimcilar: [coder]\n  plan: docs/plan/{kart}.md");
    const flow = await load(await write(yaml));
    expect(flow.plan).toEqual({
      katilimcilar: ["coder"],
      plan: "docs/plan/{kart}.md",
      // İtiraz dosyası plan yolundan türetiliyor: tek alan, tek hata yüzeyi.
      itiraz: "docs/plan/{kart}.itiraz.md",
      tur: 1,
    });

    // Plan politikası topolojinin parçası: değişirse yoldaki kart eskisiyle yaşar.
    const plansiz = await load(await write(VALID, "plansiz.yaml"));
    expect(flow.hash).not.toBe(plansiz.hash);
  });

  it("planlama yoksa alan da yok", async () => {
    const flow = await load(await write(VALID));
    expect(flow.plan).toBeUndefined();
  });

  // Yazılmamış bir alanı sessizce yok saymak, çalıştığı sanılan bir alan
  // bırakır. `audit.enabled` bir dönem tam bunu yaptı.
  it("iki katılımcıyı ve tek turu kabul eder — 6b", async () => {
    const yaml = withPlan("planlama:\n  katilimcilar: [coder, reviewer]\n  tur: 1\n  plan: docs/plan/{kart}.md");
    const flow = await load(await write(yaml));
    expect(flow.plan?.katilimcilar).toEqual(["coder", "reviewer"]);
    expect(flow.plan?.tur).toBe(1);
  });

  it("birden çok turu açıkça reddeder — sayaç ve kilit kapısı 6c", async () => {
    const yaml = withPlan("planlama:\n  katilimcilar: [coder]\n  tur: 2\n  plan: docs/plan/{kart}.md");
    await expect(load(await write(yaml))).rejects.toThrow(/kural 18.*yalnızca 1/s);
  });

  it("üç katılımcıyı reddeder — körleme ve sayaç 6c'nin konusu", async () => {
    const yaml = withPlan(
      "planlama:\n  katilimcilar: [coder, reviewer, guard]\n  plan: docs/plan/{kart}.md");
    await expect(load(await write(yaml))).rejects.toThrow(/kural 17.*en fazla iki/s);
  });

  // Varsayılan körleme atıl (itiraz eden tek rol var); kapatılmış SANILAN
  // bir körleme diye bir şey olmasın diye açık kapatma reddediliyor.
  it("körlemeyi açıkça kapatmayı reddeder", async () => {
    const yaml = withPlan(
      "planlama:\n  katilimcilar: [coder]\n  ilk-tur-kor: false\n  plan: docs/plan/{kart}.md");
    await expect(load(await write(yaml))).rejects.toThrow(/kural 18.*körlemenin etkisi yok/s);
  });

  it("var olmayan role işaret eden katılımcıyı reddeder", async () => {
    const yaml = withPlan("planlama:\n  katilimcilar: [yok]\n  plan: docs/plan/{kart}.md");
    await expect(load(await write(yaml))).rejects.toThrow(/kural 17/);
  });

  // Kural 19: plan, iş yapıldıktan sonra tartışılmaz.
  it("zincirin başında olmayan katılımcıyı reddeder", async () => {
    const yaml = withPlan("planlama:\n  katilimcilar: [reviewer]\n  plan: docs/plan/{kart}.md");
    await expect(load(await write(yaml))).rejects.toThrow(/kural 19/);
  });

  it("`src/` altındaki plan yolunu reddeder", async () => {
    const yaml = withPlan("planlama:\n  katilimcilar: [coder]\n  plan: src/plan/{kart}.md");
    await expect(load(await write(yaml))).rejects.toThrow(/kural 20.*src/s);
  });

  // `{kart}` olmadan iki kart aynı dosyayı ezer ve ikincisi birincisinin
  // planını okur.
  it("`{kart}` içermeyen plan yolunu reddeder", async () => {
    const yaml = withPlan("planlama:\n  katilimcilar: [coder]\n  plan: docs/plan.md");
    await expect(load(await write(yaml))).rejects.toThrow(/kural 20.*\{kart\}/s);
  });

  // Alışveriş sırasında kart `planTurn` ile dolaşıyor ve o yol kapı
  // kontrolünden geçmiyor: katılımcıya konmuş kapı hiç ateşlenmez.
  // Akışta duran ama işlemeyen bir insan kapısı, en kötü sessiz arıza.
  it("planlama katılımcısına konmuş kapıyı reddeder", async () => {
    const yaml = patch("gates: []", "gates:\n  - after: coder\n    type: approval") +
      "\nplanlama:\n  katilimcilar: [coder]\n  plan: docs/plan/{kart}.md\n";
    await expect(load(await write(yaml))).rejects.toThrow(/kural 21/);
  });

  it("planlamadan sonraki role konmuş kapıya dokunmaz", async () => {
    const yaml = patch("gates: []", "gates:\n  - after: reviewer\n    type: approval") +
      "\nplanlama:\n  katilimcilar: [coder]\n  plan: docs/plan/{kart}.md\n";
    const flow = await load(await write(yaml));
    expect(flow.gates).toHaveLength(1);
  });

  it("depo dışına çıkan plan yolunu reddeder", async () => {
    const yaml = withPlan("planlama:\n  katilimcilar: [coder]\n  plan: ../disari/{kart}.md");
    await expect(load(await write(yaml))).rejects.toThrow(/kural 20/);
  });
});
