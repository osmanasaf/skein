import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { knownProviderSet } from "../adapters/factory.js";
import { LiveFlow } from "./live.js";

const IKI_ROL = `
name: test
constitution:
  - ../prompts/base.md
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
    receive: batch
    reject: coder
    next: done
`;

const UC_ROL = IKI_ROL.replace(
  `    reject: coder
    next: done`,
  `    reject: coder
    next: guard
  - id: guard
    provider: claude
    workspace: guard
    prompt: ../../roles/reviewer.prompt
    receive: batch
    reject: coder
    next: done`,
);

let root: string;
let path: string;
let opts: { root: string; providers: ReturnType<typeof knownProviderSet> };

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-live-"));
  await mkdir(join(root, "hub", "flows"), { recursive: true });
  await mkdir(join(root, "hub", "prompts"), { recursive: true });
  await mkdir(join(root, "roles"), { recursive: true });
  await writeFile(join(root, "hub", "prompts", "base.md"), "# Anayasa\n");
  await writeFile(join(root, "roles", "coder.prompt"), "# coder\n");
  await writeFile(join(root, "roles", "reviewer.prompt"), "# reviewer\n");
  path = join(root, "hub", "flows", "test.yaml");
  await writeFile(path, IKI_ROL);
  opts = { root, providers: knownProviderSet() };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("LiveFlow", () => {
  it("ilk yüklemede topolojiyi verir", async () => {
    const live = await LiveFlow.open(path, opts);
    expect(live.topology.roles.map((r) => r.id)).toEqual(["coder", "reviewer"]);
    expect(live.error).toBeNull();
  });

  // Bayat başlamaktan iyisi hiç başlamamak.
  it("ilk yükleme geçersizse açılmaz", async () => {
    await writeFile(path, "name: bozuk\nroles: []\n");
    await expect(LiveFlow.open(path, opts)).rejects.toThrow();
  });

  it("dosya değişmediyse yeniden yüklemez", async () => {
    const live = await LiveFlow.open(path, opts);
    expect(await live.refresh()).toEqual({ kind: "unchanged" });
  });

  it("rol eklenince yeni topolojiyi alır", async () => {
    const live = await LiveFlow.open(path, opts);
    const onceki = live.flow.hash;
    await writeFile(path, UC_ROL);

    const sonuc = await live.refresh();

    expect(sonuc.kind).toBe("reloaded");
    expect(sonuc.kind === "reloaded" && sonuc.from).toBe(onceki);
    expect(live.topology.roles.map((r) => r.id)).toEqual(["coder", "reviewer", "guard"]);
  });

  // Editör yarım kaydetmiş olabilir; yarım bir YAML gözcüyü düşürmemeli.
  it("geçersiz içerikte ELDEKİ topoloji aynen durur", async () => {
    const live = await LiveFlow.open(path, opts);
    const saglam = live.flow.hash;
    await writeFile(path, "name: test\nroles:\n  - id: coder\n    provider: yok-boyle\n");

    const sonuc = await live.refresh();

    expect(sonuc.kind).toBe("failed");
    expect(live.flow.hash).toBe(saglam);
    expect(live.topology.roles.map((r) => r.id)).toEqual(["coder", "reviewer"]);
    expect(live.error).not.toBeNull();
  });

  // Kullanıcı bozuk hâli düzeltip kaydedince yeniden denenmeli.
  it("bozuk dosya düzeltilince yükler ve hatayı temizler", async () => {
    const live = await LiveFlow.open(path, opts);
    await writeFile(path, "yarım: {");
    expect((await live.refresh()).kind).toBe("failed");
    expect(live.error).not.toBeNull();

    await writeFile(path, UC_ROL);
    const sonuc = await live.refresh();

    expect(sonuc.kind).toBe("reloaded");
    expect(live.error).toBeNull();
    expect(live.topology.roles).toHaveLength(3);
  });

  it("aynı bozuk hâl iki kez denendiğinde de eldekini korur", async () => {
    const live = await LiveFlow.open(path, opts);
    await writeFile(path, "yarım: {");
    expect((await live.refresh()).kind).toBe("failed");
    expect((await live.refresh()).kind).toBe("failed");
    expect(live.topology.roles).toHaveLength(2);
  });

  // Topoloji hash'i açıklamaları kapsamıyor: yorum değişikliği yeniden
  // yükleme sayılmamalı, yoksa her kaydetmede "akış değişti" denirdi.
  it("yalnızca yorum değişirse `unchanged` döner", async () => {
    const live = await LiveFlow.open(path, opts);
    await writeFile(path, `# yeni bir yorum\n${IKI_ROL}`);

    expect(await live.refresh()).toEqual({ kind: "unchanged" });
  });

  // Bozuk metin hiç kaydedilmiyor; dosya eski hâline dönünce içerik son
  // başarılı hâlle eşleşiyor. Hata izi orada temizlenmezse ekran, geçerli
  // bir dosya için sonsuza kadar hata gösterirdi.
  it("dosya eski geçerli hâline dönünce hata temizlenir", async () => {
    const live = await LiveFlow.open(path, opts);
    await writeFile(path, "yarım: {");
    expect((await live.refresh()).kind).toBe("failed");
    expect(live.error).not.toBeNull();

    await writeFile(path, IKI_ROL);
    const sonuc = await live.refresh();

    expect(sonuc).toEqual({ kind: "unchanged" });
    expect(live.error).toBeNull();
  });

  it("dosya silinirse eldeki topoloji korunur ve hata bildirilir", async () => {
    const live = await LiveFlow.open(path, opts);
    await rm(path);

    const sonuc = await live.refresh();

    expect(sonuc.kind).toBe("failed");
    expect(live.topology.roles).toHaveLength(2);
  });

  it("yeniden yükleme atomik: başarısızlık yarım durum bırakmaz", async () => {
    const live = await LiveFlow.open(path, opts);
    const once = { hash: live.flow.hash, roller: live.topology.roles.length, hata: live.error };

    await writeFile(path, "roles: 5\n");
    await live.refresh();

    expect(live.flow.hash).toBe(once.hash);
    expect(live.topology.roles).toHaveLength(once.roller);
    // Dosyanın metni de kaydedilmemeli; düzeltilmiş hâli yeniden denenecek.
    await writeFile(path, await readFile(join(root, "hub", "flows", "test.yaml"), "utf8"));
  });
});
