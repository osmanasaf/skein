import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { knownProviderSet } from "../adapters/factory.js";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDraft, fromFlow, toYaml, writeDraft, type FlowDraft } from "./draft.js";
import { loadFlow } from "./load.js";

let root: string;
let path: string;
let opts: { root: string; providers: ReturnType<typeof knownProviderSet> };

const taslak = (): FlowDraft => ({
  name: "test",
  constitution: ["../prompts/base.md"],
  roles: [
    { id: "coder", provider: "claude", workspace: "main", prompt: "../../roles/coder.prompt", next: "reviewer" },
    {
      id: "reviewer", provider: "codex", workspace: "reviewer",
      prompt: "../../roles/reviewer.prompt", receive: "batch",
      syncBack: ["coder"], reject: "coder", next: "done",
    },
  ],
  reject: { limit: 2, onExhausted: "gate" },
});

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-draft-"));
  await mkdir(join(root, "hub", "flows"), { recursive: true });
  await mkdir(join(root, "hub", "prompts"), { recursive: true });
  await mkdir(join(root, "roles"), { recursive: true });
  await writeFile(join(root, "hub", "prompts", "base.md"), "# Anayasa\n");
  await writeFile(join(root, "roles", "coder.prompt"), "# coder\n");
  await writeFile(join(root, "roles", "reviewer.prompt"), "# reviewer\n");
  path = join(root, "hub", "flows", "test.yaml");
  await writeFile(path, toYaml(taslak()));
  opts = { root, providers: knownProviderSet() };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("toYaml", () => {
  it("ürettiği YAML gerçek yükleyiciden geçer", async () => {
    await writeFile(path, toYaml(taslak()));
    const flow = await loadFlow(path, opts);
    expect(flow.roles.map((r) => r.id)).toEqual(["coder", "reviewer"]);
  });

  // Varsayılanı olan alanı açıkça yazmak `reject: coder` gibi satırların
  // "bu kasıtlı" anlamını sulandırırdı.
  it("boş alanları yazmaz", () => {
    const yaml = toYaml({ ...taslak(), description: "   " });
    expect(yaml).not.toContain("description");
    expect(yaml).not.toContain("syncBack: []");
    expect(yaml).not.toContain("gates");
  });

  it("verilen alanları yazar", () => {
    const yaml = toYaml({ ...taslak(), description: "kısa akış", gates: [{ after: "coder", type: "approval" }] });
    expect(yaml).toContain("description: kısa akış");
    expect(yaml).toContain("after: coder");
  });
});

describe("checkDraft", () => {
  it("geçerli taslakta hash ve maliyet döner", async () => {
    const sonuc = await checkDraft(path, taslak(), opts);

    expect(sonuc.ok).toBe(true);
    expect(sonuc.ok && sonuc.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(sonuc.ok && sonuc.cost.base).toBe(2);
  });

  // Kural numaraları kullanıcıya AYNEN gitmeli; ekrana ayrı bir kural
  // kopyası yazmak iki kümenin ayrışmasıyla biterdi.
  it("kural ihlalini numarasıyla bildirir", async () => {
    const bozuk = taslak();
    bozuk.roles[1]!.next = "coder"; // döngü: kimse `done`'a gitmiyor

    const sonuc = await checkDraft(path, bozuk, opts);

    expect(sonuc.ok).toBe(false);
    expect(!sonuc.ok && sonuc.message).toContain("kural 4");
  });

  // Rol kopyalayıp `workspace` satırını değiştirmeyi unutmak, topolojiyi
  // büyütürken yapılacak en kolay hata (kural 16). İki `main` ise daha önce
  // kural 2'ye takılıyor, o yüzden çakışma main DIŞINDA kuruluyor.
  it("aynı workspace'i paylaşan iki rol reddedilir", async () => {
    const bozuk = taslak();
    bozuk.roles.push({
      id: "guard", provider: "claude", workspace: "reviewer",
      prompt: "../../roles/reviewer.prompt", receive: "batch", next: "done",
    });
    bozuk.roles[1]!.next = "guard";

    const sonuc = await checkDraft(path, bozuk, opts);

    expect(!sonuc.ok && sonuc.message).toContain("kural 16");
  });

  it("iki rol `main` isterse kural 2 reddeder", async () => {
    const bozuk = taslak();
    bozuk.roles[1]!.workspace = "main";
    expect(!(await checkDraft(path, bozuk, opts)).ok).toBe(true);
  });

  it("olmayan prompt dosyası reddedilir", async () => {
    const bozuk = taslak();
    bozuk.roles[0]!.prompt = "../../roles/yok.prompt";
    expect((await checkDraft(path, bozuk, opts)).ok).toBe(false);
  });

  // DOSYAYA YAZMADAN doğrulanmalı: ekranda denenen her taslak diske
  // düşseydi, gözcü yarım taslakları okurdu.
  it("doğrulama dosyaya dokunmaz", async () => {
    const once = await readFile(path, "utf8");
    const bozuk = taslak();
    bozuk.roles[1]!.next = "coder";

    await checkDraft(path, bozuk, opts);

    expect(await readFile(path, "utf8")).toBe(once);
  });

  it("maliyet rol sayısıyla büyür", async () => {
    const dortRol = taslak();
    dortRol.roles = [
      { id: "analyst", provider: "claude", workspace: "main", prompt: "../../roles/coder.prompt", next: "coder" },
      { id: "coder", provider: "codex", workspace: "coder", prompt: "../../roles/coder.prompt", next: "reviewer" },
      { id: "reviewer", provider: "claude", workspace: "reviewer", prompt: "../../roles/reviewer.prompt", receive: "batch", next: "guard" },
      { id: "guard", provider: "codex", workspace: "guard", prompt: "../../roles/reviewer.prompt", receive: "batch", next: "done" },
    ];

    const sonuc = await checkDraft(path, dortRol, opts);

    expect(sonuc.ok && sonuc.cost.base).toBe(4);
    expect(sonuc.ok && sonuc.cost.rejectEdges).toHaveLength(3);
  });
});

describe("fromFlow — gidiş dönüş", () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const gercek = { root: repoRoot, providers: knownProviderSet() };

  // En sert sınav: deponun KENDİ akış dosyaları taslağa çevrilip geri
  // yazıldığında topoloji hash'i DEĞİŞMEMELİ. Değişirse ekrandan yapılan ilk
  // kaydetme akışı sessizce başka bir şeye dönüştürmüş olur.
  for (const ad of ["daily", "spec"]) {
    it(`${ad}: taslağa çevrilip geri yazılınca hash aynı kalır`, async () => {
      const yol = join(repoRoot, "hub", "flows", `${ad}.yaml`);
      const once = await loadFlow(yol, gercek);

      const draft = fromFlow(once);
      const sonra = await loadFlow(yol, { ...gercek, text: toYaml(draft) });

      expect(sonra.hash).toBe(once.hash);
      expect(sonra.roles.map((r) => r.id)).toEqual(once.roles.map((r) => r.id));
    });
  }

  // Kapı mesajı hash'e girmiyor; hash testi onu yakalayamaz. Ayrıca bakılıyor
  // çünkü sessizce silinmesi en kolay alan.
  it("spec: kapı mesajı korunur", async () => {
    const yol = join(repoRoot, "hub", "flows", "spec.yaml");
    const flow = await loadFlow(yol, gercek);
    expect(flow.gates[0]?.message).toBeDefined();

    const yeniden = await loadFlow(yol, { ...gercek, text: toYaml(fromFlow(flow)) });

    expect(yeniden.gates[0]?.message).toBe(flow.gates[0]?.message);
  });

  it("spec: açıklama korunur", async () => {
    const yol = join(repoRoot, "hub", "flows", "spec.yaml");
    const flow = await loadFlow(yol, gercek);
    const yeniden = await loadFlow(yol, { ...gercek, text: toYaml(fromFlow(flow)) });
    expect(yeniden.description).toBe(flow.description);
  });

  // Varsayılan ret hedefini dosyaya yazmak, `reject: coder` satırlarının
  // "bu kasıtlı" anlamını sulandırırdı.
  it("yazılmamış ret hedefi taslağa da yazılmaz", async () => {
    const yol = join(repoRoot, "hub", "flows", "daily.yaml");
    const flow = await loadFlow(yol, gercek);
    const draft = fromFlow(flow);

    const acik = flow.roles.filter((r) => r.rejectExplicit).map((r) => r.id);
    const taslakta = draft.roles.filter((r) => r.reject !== undefined).map((r) => r.id);

    expect(taslakta).toEqual(acik);
  });
});

describe("writeDraft", () => {
  it("geçerli taslağı yazar", async () => {
    const yeni = taslak();
    yeni.description = "yazıldı";

    const sonuc = await writeDraft(path, yeni, opts);

    expect(sonuc.ok).toBe(true);
    expect(await readFile(path, "utf8")).toContain("description: yazıldı");
  });

  // Ekranın ürettiği dosyayı gözcü de okuyor; bozuk YAML yazmak çalışan bir
  // sistemi ekrandan bozmak olurdu.
  it("geçersiz taslağı YAZMAZ", async () => {
    const once = await readFile(path, "utf8");
    const bozuk = taslak();
    bozuk.roles[1]!.workspace = "main";

    const sonuc = await writeDraft(path, bozuk, opts);

    expect(sonuc.ok).toBe(false);
    expect(await readFile(path, "utf8")).toBe(once);
  });

  // Gözcü her geçişte bu dosyayı okuyor; yarı yazılmış bir hâli görmemeli.
  it("yazma sonrası yan dosya bırakmaz", async () => {
    await writeDraft(path, taslak(), opts);
    const dosyalar = await readdir(join(root, "hub", "flows"));
    expect(dosyalar).toEqual(["test.yaml"]);
  });

  it("yazılan dosya yeniden yüklenebilir", async () => {
    const yeni = taslak();
    yeni.roles.push({
      id: "guard", provider: "claude", workspace: "guard",
      prompt: "../../roles/reviewer.prompt", receive: "batch", next: "done",
    });
    yeni.roles[1]!.next = "guard";

    await writeDraft(path, yeni, opts);

    const flow = await loadFlow(path, opts);
    expect(flow.roles.map((r) => r.id)).toEqual(["coder", "reviewer", "guard"]);
  });
});
