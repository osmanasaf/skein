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
    const result = await checkDraft(path, taslak(), opts);

    expect(result.ok).toBe(true);
    expect(result.ok && result.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.ok && result.cost.base).toBe(2);
  });

  // Kural numaraları kullanıcıya AYNEN gitmeli; ekrana ayrı bir kural
  // kopyası yazmak iki kümenin ayrışmasıyla biterdi.
  it("kural ihlalini numarasıyla bildirir", async () => {
    const corrupt = taslak();
    corrupt.roles[1]!.next = "coder"; // döngü: kimse `done`'a gitmiyor

    const result = await checkDraft(path, corrupt, opts);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain("kural 4");
  });

  // Rol kopyalayıp `workspace` satırını değiştirmeyi unutmak, topolojiyi
  // büyütürken yapılacak en kolay hata (kural 16). İki `main` ise daha önce
  // kural 2'ye takılıyor, o yüzden çakışma main DIŞINDA kuruluyor.
  it("aynı workspace'i paylaşan iki rol reddedilir", async () => {
    const corrupt = taslak();
    corrupt.roles.push({
      id: "guard", provider: "claude", workspace: "reviewer",
      prompt: "../../roles/reviewer.prompt", receive: "batch", next: "done",
    });
    corrupt.roles[1]!.next = "guard";

    const result = await checkDraft(path, corrupt, opts);

    expect(!result.ok && result.message).toContain("kural 16");
  });

  it("iki rol `main` isterse kural 2 reddeder", async () => {
    const corrupt = taslak();
    corrupt.roles[1]!.workspace = "main";
    expect(!(await checkDraft(path, corrupt, opts)).ok).toBe(true);
  });

  it("olmayan prompt dosyası reddedilir", async () => {
    const corrupt = taslak();
    corrupt.roles[0]!.prompt = "../../roles/yok.prompt";
    expect((await checkDraft(path, corrupt, opts)).ok).toBe(false);
  });

  // DOSYAYA YAZMADAN doğrulanmalı: ekranda denenen her taslak diske
  // düşseydi, gözcü yarım taslakları okurdu.
  it("doğrulama dosyaya dokunmaz", async () => {
    const once = await readFile(path, "utf8");
    const corrupt = taslak();
    corrupt.roles[1]!.next = "coder";

    await checkDraft(path, corrupt, opts);

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

    const result = await checkDraft(path, dortRol, opts);

    expect(result.ok && result.cost.base).toBe(4);
    expect(result.ok && result.cost.rejectEdges).toHaveLength(3);
  });
});

describe("fromFlow — gidiş dönüş", () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const gercek = { root: repoRoot, providers: knownProviderSet() };

  // En sert sınav: deponun KENDİ akış dosyaları taslağa çevrilip geri
  // yazıldığında topoloji hash'i DEĞİŞMEMELİ. Değişirse ekrandan yapılan ilk
  // kaydetme akışı sessizce başka bir şeye dönüştürmüş olur.
  // `plan4` planlama bloğunu (`denetci` dahil) taşıyan tek örnek — bloğun
  // artık MODELLİ olması (kart c-20261105-725320) hash'i bozmamalı.
  for (const ad of ["daily", "spec", "plan4"]) {
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

    const isOpen = flow.roles.filter((r) => r.rejectExplicit).map((r) => r.id);
    const taslakta = draft.roles.filter((r) => r.reject !== undefined).map((r) => r.id);

    expect(taslakta).toEqual(isOpen);
  });
});

// EKRANDAN VERİ KAYBI (tarihî). `toYaml` belgeyi sıfırdan kuruyordu ve HİÇ
// modellenmeyen blokları (eskiden `planlama`, `denetci` dahil) sessizce
// siliyordu. Blok isteğe bağlı olduğu için akış hâlâ geçerli doğruluyordu,
// yani kayıp hiçbir yere yazılmıyordu. Çare `parseDocument` ile yerinde
// düzenlemeydi — bu describe o genel mekanizmayı, HÂLÂ modellenmeyen bir
// anahtarla sınıyor (`planlama`'nın kendisi kart c-20261105-725320'den beri
// modelli, bkz. alttaki describe).
describe("ekranın modellemediği bloklar korunuyor", () => {
  it("bilinmeyen üst düzey anahtar düzenlemeden sonra dosyada DURUYOR", async () => {
    await writeFile(path, `${toYaml(taslak())}\ndeneysel:\n  ileride: eklenecek\n`);

    const fresh = taslak();
    fresh.description = "ekrandan düzenlendi";
    const result = await writeDraft(path, fresh, opts);

    expect(result.ok).toBe(true);
    const yazilan = await readFile(path, "utf8");
    expect(yazilan).toContain("deneysel:");
    expect(yazilan).toContain("ileride: eklenecek");
    expect(yazilan).toContain("ekrandan düzenlendi");
  });

  // YORUMLAR da korunuyor. Ölçüldü: plan4.yaml için 96 satır / 34 yorum
  // satırı → 55 satır / 0 yorum. Gerekçeler bu projede kodun yarısı.
  it("belge başlığındaki yorumlar düzenlemeden sonra DURUYOR", async () => {
    await writeFile(path, `# Üst başlık yorumu
# İkinci satır

${toYaml(taslak())}`);

    const fresh = taslak();
    fresh.description = "ekrandan düzenlendi";
    expect((await writeDraft(path, fresh, opts)).ok).toBe(true);

    const yazilan = await readFile(path, "utf8");
    expect(yazilan).toContain("# Üst başlık yorumu");
    expect(yazilan).toContain("# İkinci satır");
    expect(yazilan).toContain("ekrandan düzenlendi");
  });

  // Silinen isteğe bağlı alan dosyadan da düşmeli: belgeyi yerinde
  // düzenlemek, kaldırılan bir alanın yerinde kalması riskini getiriyor.
  it("taslaktan silinen açıklama dosyadan da düşüyor", async () => {
    await writeFile(path, toYaml({ ...taslak(), description: "eski" }));
    const fresh = taslak();
    delete fresh.description;
    expect((await writeDraft(path, fresh, opts)).ok).toBe(true);
    expect(await readFile(path, "utf8")).not.toContain("eski");
  });
});

// `planlama` kart c-20261105-725320'den beri MODELLİ — `FlowDraft.planlama`
// yorumunun anlattığı gibi artık `gates`/`reject`/`audit` kategorisinde:
// taşınmıyor, draft'ta NE VARSA dosyaya O yazılıyor. "Rolleri düzenle"
// paneli rol adını değiştirirken `katilimcilar`/`denetci`'yi KENDİSİ
// güncellemek zorunda — burada o taşımanın YAPILMAMASININ hâlâ hata
// verdiği, modellemenin kendisinin round-trip ve silme/ekleme yollarının
// doğru çalıştığı sınanıyor.
describe("planlama bloğu — taşıma ve round-trip", () => {
  const planBlok = (): NonNullable<FlowDraft["planlama"]> => ({
    katilimcilar: ["coder"],
    plan: "docs/plan/{kart}.md",
    tur: 1,
    ilkTurKor: true,
    denetci: "reviewer",
  });

  it("açıkça taşınan planlama bloğu dosyaya YAZILIR", async () => {
    await writeFile(path, toYaml(taslak()));

    const fresh = taslak();
    fresh.planlama = planBlok();
    const result = await writeDraft(path, fresh, opts);

    expect(result.ok).toBe(true);
    const yazilan = await readFile(path, "utf8");
    expect(yazilan).toContain("planlama:");
    expect(yazilan).toContain("denetci: reviewer");
    const flow = await loadFlow(path, opts);
    expect(flow.plan?.denetci).toBe("reviewer");
    expect(flow.plan?.katilimcilar).toEqual(["coder"]);
  });

  // Yan fayda: blok artık her zaman draft'tan geldiği için kurallar
  // KONUŞUYOR. Eskiden (blok hiç modellenmeden, dosyada aynen kalarak)
  // da konuşuyordu; farkı: artık draft'ın KENDİSİ tutarsız olduğunda da
  // konuşuyor, dosyada neyin kaldığına bakılmaksızın.
  it("rolü yeniden adlandırıp planlama alanını GÜNCELLEMEMEK hata verir", async () => {
    await writeFile(path, toYaml(taslak()));

    const fresh = taslak();
    fresh.planlama = planBlok(); // "coder"a işaret ediyor
    (fresh.roles[0] as { id: string }).id = "yazar"; // ama rol "yazar" oldu
    (fresh.roles[1] as { reject?: string }).reject = "yazar";
    (fresh.roles[1] as { syncBack?: string[] }).syncBack = ["yazar"];
    const result = await checkDraft(path, fresh, opts);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/kural 17/);
  });

  // `.planlama` taşımamak — dosyada önceden var olsa bile — bloğu SİLER.
  // `gates`/`audit` ile aynı sözleşme: modellenen bir alanı atlamak artık
  // "dokunma" değil "kaldır" anlamına geliyor.
  it("planlama taşınmazsa dosyadan DÜŞER", async () => {
    await writeFile(path, `${toYaml(taslak())}\nplanlama:\n  katilimcilar: [coder]\n  plan: docs/plan/{kart}.md\n`);

    const result = await writeDraft(path, taslak(), opts);

    expect(result.ok).toBe(true);
    expect(await readFile(path, "utf8")).not.toContain("planlama");
  });

  it("planlama bloğu olmayan akışta hiçbir şey eklenmiyor", async () => {
    await writeFile(path, toYaml(taslak()));
    const result = await writeDraft(path, taslak(), opts);
    expect(result.ok).toBe(true);
    expect(await readFile(path, "utf8")).not.toContain("planlama");
  });

  it("fromFlow planlama bloğunu taşlağa taşır (denetci dahil)", async () => {
    await writeFile(path, `${toYaml(taslak())}\nplanlama:\n  katilimcilar: [coder]\n  plan: docs/plan/{kart}.md\n  denetci: reviewer\n`);
    const flow = await loadFlow(path, opts);

    const draft = fromFlow(flow);

    expect(draft.planlama).toEqual({
      katilimcilar: ["coder"], plan: "docs/plan/{kart}.md", tur: 1, ilkTurKor: true, denetci: "reviewer",
    });
  });
});

describe("writeDraft", () => {
  it("geçerli taslağı yazar", async () => {
    const fresh = taslak();
    fresh.description = "yazıldı";

    const result = await writeDraft(path, fresh, opts);

    expect(result.ok).toBe(true);
    expect(await readFile(path, "utf8")).toContain("description: yazıldı");
  });

  // Ekranın ürettiği dosyayı gözcü de okuyor; bozuk YAML yazmak çalışan bir
  // sistemi ekrandan bozmak olurdu.
  it("geçersiz taslağı YAZMAZ", async () => {
    const once = await readFile(path, "utf8");
    const corrupt = taslak();
    corrupt.roles[1]!.workspace = "main";

    const result = await writeDraft(path, corrupt, opts);

    expect(result.ok).toBe(false);
    expect(await readFile(path, "utf8")).toBe(once);
  });

  // Gözcü her geçişte bu dosyayı okuyor; yarı yazılmış bir hâli görmemeli.
  it("yazma sonrası yan dosya bırakmaz", async () => {
    await writeDraft(path, taslak(), opts);
    const dosyalar = await readdir(join(root, "hub", "flows"));
    expect(dosyalar).toEqual(["test.yaml"]);
  });

  it("yazılan dosya yeniden yüklenebilir", async () => {
    const fresh = taslak();
    fresh.roles.push({
      id: "guard", provider: "claude", workspace: "guard",
      prompt: "../../roles/reviewer.prompt", receive: "batch", next: "done",
    });
    fresh.roles[1]!.next = "guard";

    await writeDraft(path, fresh, opts);

    const flow = await loadFlow(path, opts);
    expect(flow.roles.map((r) => r.id)).toEqual(["coder", "reviewer", "guard"]);
  });
});
