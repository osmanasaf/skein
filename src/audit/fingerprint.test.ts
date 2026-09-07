import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fingerprintDir } from "./fingerprint.js";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "skein-fp-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

const put = async (rel: string, body: string) => {
  const p = join(root, rel);
  await mkdir(join(p, ".."), { recursive: true });
  await writeFile(p, body);
};

describe("fingerprintDir", () => {
  it("aynı içerik aynı parmak izini verir", async () => {
    await put("src/a.ts", "X");
    const one = await fingerprintDir(root);
    expect(await fingerprintDir(root)).toBe(one);
    expect(one).toMatch(/^[0-9a-f]{64}$/);
  });

  // Denetim sırasında yapılan düzeltme yeni tur açmalı; mekanizması bu.
  it("dosya içeriği değişince parmak izi değişir", async () => {
    await put("src/a.ts", "X");
    const before = await fingerprintDir(root);
    await put("src/a.ts", "Y");
    expect(await fingerprintDir(root)).not.toBe(before);
  });

  it("yeni dosya eklenince değişir", async () => {
    await put("src/a.ts", "X");
    const before = await fingerprintDir(root);
    await put("src/b.ts", "X");
    expect(await fingerprintDir(root)).not.toBe(before);
  });

  it("dosya silinince değişir", async () => {
    await put("src/a.ts", "X");
    await put("src/b.ts", "Y");
    const before = await fingerprintDir(root);
    await rm(join(root, "src/b.ts"));
    expect(await fingerprintDir(root)).not.toBe(before);
  });

  // Dosya adı da karışımın parçası: aynı gövdeyi başka isme taşımak değişikliktir.
  it("dosya adı değişince değişir", async () => {
    await put("src/a.ts", "X");
    const before = await fingerprintDir(root);
    await rm(join(root, "src/a.ts"));
    await put("src/b.ts", "X");
    expect(await fingerprintDir(root)).not.toBe(before);
  });

  // Ayraç olmasaydı ("a","bc") ile ("ab","c") aynı karışımı verirdi.
  it("ad/içerik sınırı kaymasını ayırt eder", async () => {
    await put("ab", "c");
    const one = await fingerprintDir(root);
    await rm(join(root, "ab"));
    await put("a", "bc");
    expect(await fingerprintDir(root)).not.toBe(one);
  });

  it("dizin okuma sırasından bağımsızdır", async () => {
    await put("z.ts", "1"); await put("a.ts", "2"); await put("m/x.ts", "3");
    const one = await fingerprintDir(root);
    await rm(join(root, "z.ts")); await put("z.ts", "1");
    expect(await fingerprintDir(root)).toBe(one);
  });

  it("boş dizin de bir parmak izi verir", async () => {
    expect(await fingerprintDir(root)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("olmayan dizinde anlamlı hata verir", async () => {
    await expect(fingerprintDir(join(root, "yok"))).rejects.toThrow(/yok/);
  });
});
