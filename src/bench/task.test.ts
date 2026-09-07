import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTask } from "./task.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-task-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Geçerli bir görev dizini kurar; `patch` ile alanları bozabilirsin. */
async function makeTask(id: string, yaml: string): Promise<string> {
  const dir = join(root, id);
  await mkdir(join(dir, "hidden"), { recursive: true });
  await writeFile(join(dir, "task.yaml"), yaml);
  await writeFile(join(dir, "spec.md"), "# Spec\nBir şey yap.\n");
  await writeFile(join(dir, "hidden", "a.test.ts"), "// gizli\n");
  return dir;
}

const VALID = `
id: retry
title: Yeniden deneme mantığı
language: ts
spec: spec.md
entry: src/retry.ts
hidden:
  command: ["npx", "vitest", "run", "--reporter=json"]
`;

describe("loadTask", () => {
  it("geçerli bir görevi yükler", async () => {
    const dir = await makeTask("retry", VALID);
    const task = await loadTask(dir);

    expect(task.id).toBe("retry");
    expect(task.title).toBe("Yeniden deneme mantığı");
    expect(task.language).toBe("ts");
    expect(task.entry).toBe("src/retry.ts");
    expect(task.hidden.command).toEqual(["npx", "vitest", "run", "--reporter=json"]);
    expect(task.specPath).toBe(join(dir, "spec.md"));
    expect(task.hiddenDir).toBe(join(dir, "hidden"));
  });

  // Aynı task.yaml her platformda aynı talimatı üretmeli.
  it("entry POSIX ayracıyla normalleşir — Windows'ta da \"/\"", async () => {
    const dir = await makeTask("retry", VALID.replace("entry: src/retry.ts", "entry: src/deep/retry.ts"));
    expect((await loadTask(dir)).entry).toBe("src/deep/retry.ts");
  });

  it("id dizin adıyla uyuşmazsa reddeder", async () => {
    const dir = await makeTask("retry", VALID.replace("id: retry", "id: baska"));
    await expect(loadTask(dir)).rejects.toThrow(/dizin ad[ıi]/i);
  });

  it("spec dosyası yoksa reddeder", async () => {
    const dir = await makeTask("retry", VALID.replace("spec: spec.md", "spec: yok.md"));
    await expect(loadTask(dir)).rejects.toThrow(/spec/i);
  });

  it("zorunlu alan eksikse alanı adıyla söyler", async () => {
    const dir = await makeTask("retry", VALID.replace("title: Yeniden deneme mantığı\n", ""));
    await expect(loadTask(dir)).rejects.toThrow(/title/);
  });

  it("gizli test komutu boşsa reddeder", async () => {
    const dir = await makeTask("retry", VALID.replace(/command: \[.*\]/, "command: []"));
    await expect(loadTask(dir)).rejects.toThrow(/command/i);
  });

  it("gizli komut --dir içeriyorsa reddeder", async () => {
    const dir = await makeTask("retry", VALID.replace(
      /command: \[.*\]/, 'command: ["npx", "vitest", "--dir", "."]'));
    await expect(loadTask(dir)).rejects.toThrow(/--dir/);
  });

  it("gizli komut --outputFile içeriyorsa reddeder", async () => {
    const dir = await makeTask("retry", VALID.replace(
      /command: \[.*\]/, 'command: ["npx", "vitest", "--outputFile", "x.json"]'));
    await expect(loadTask(dir)).rejects.toThrow(/--outputFile/);
  });

  it("hidden/ dizini yoksa reddeder", async () => {
    const dir = join(root, "retry");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "task.yaml"), VALID);
    await writeFile(join(dir, "spec.md"), "# Spec\n");
    await expect(loadTask(dir)).rejects.toThrow(/hidden/i);
  });

  // Deneyin bütünlüğü buna bağlı: üretici gizli testi görürse yer gerçeği çöker.
  it("spec gizli teste işaret ediyorsa reddeder", async () => {
    const dir = await makeTask("retry", VALID.replace("spec: spec.md", "spec: hidden/a.test.ts"));
    await expect(loadTask(dir)).rejects.toThrow(/gizli/i);
  });

  it("entry gizli dizine yazmaya çalışıyorsa reddeder", async () => {
    const dir = await makeTask("retry", VALID.replace("entry: src/retry.ts", "entry: hidden/x.ts"));
    await expect(loadTask(dir)).rejects.toThrow(/gizli/i);
  });

  it("entry görev dizininin dışına çıkıyorsa reddeder", async () => {
    const dir = await makeTask("retry", VALID.replace("entry: src/retry.ts", "entry: ../kacak.ts"));
    await expect(loadTask(dir)).rejects.toThrow(/d[ıi]ş[ıi]na/i);
  });

  it("entry mutlak yol ise reddeder", async () => {
    const dir = await makeTask("retry", VALID.replace("entry: src/retry.ts", "entry: /etc/passwd"));
    await expect(loadTask(dir)).rejects.toThrow(/mutlak/i);
  });

  it("hata mesajı hangi görevden geldiğini söyler", async () => {
    const dir = await makeTask("retry", VALID.replace("title: Yeniden deneme mantığı\n", ""));
    await expect(loadTask(dir)).rejects.toThrow(/task\.yaml/);
  });
});
