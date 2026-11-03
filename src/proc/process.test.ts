import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tsxCliYolu } from "./process.js";

/**
 * `tsxCliYolu` köke doğru GERÇEK `tsx` kurulumuna bakmadan da sınanabilir:
 * sahte bir `node_modules/tsx` paketi kurup Node'un modül çözümlemesinin
 * gerçekten ÜST dizine doğru aradığını doğruluyoruz — reddedilen turda
 * `cli.test.ts`in ELLE `join(cwd, "node_modules", ...)` yapması tam bu
 * senaryoda (çağıran dizinin KENDİ `node_modules`'ü yok) patlamıştı.
 */
let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-tsxyolu-"));
  await mkdir(join(root, "node_modules", "tsx", "dist"), { recursive: true });
  await writeFile(
    join(root, "node_modules", "tsx", "package.json"),
    JSON.stringify({ name: "tsx", version: "0.0.0" }),
  );
  await writeFile(join(root, "node_modules", "tsx", "dist", "cli.mjs"), "// sahte\n");
  // `git worktree add` ile açılmış bir çalışma ağacını taklit ediyor: KENDİ
  // `node_modules`'ü yok, paket ancak ÜST dizinde (`root`) var.
  await mkdir(join(root, "calisma-agaci", "alt"), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("tsxCliYolu", () => {
  it("çağıranın KENDİ node_modules'ü olmasa da ÜST dizindeki tsx'i bulur", () => {
    const beklenen = join(root, "node_modules", "tsx", "dist", "cli.mjs");
    expect(tsxCliYolu(join(root, "calisma-agaci", "alt"))).toBe(beklenen);
  });

  it("node_modules doğrudan kökte olduğunda da aynı sonucu verir", () => {
    const beklenen = join(root, "node_modules", "tsx", "dist", "cli.mjs");
    expect(tsxCliYolu(root)).toBe(beklenen);
  });
});
