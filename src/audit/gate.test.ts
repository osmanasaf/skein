import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditGate } from "./gate.js";

let root: string;
let statePath: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-gate-"));
  statePath = join(root, "state", "audit.json");
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

const gate = () => new AuditGate(statePath);
const FP = "a".repeat(64);
const FP2 = "b".repeat(64);

describe("AuditGate", () => {
  // Projenin en özgün fikri: "bitti" demek sürtünmeli.
  it("ilk deneme her zaman reddedilir", async () => {
    const d = await gate().attempt(FP);
    expect(d).toEqual({ accepted: false, round: 1, reason: "ilk-deneme" });
  });

  it("değişmemiş ikinci deneme geçer", async () => {
    const g = gate();
    await g.attempt(FP);
    expect(await g.attempt(FP)).toEqual({ accepted: true, round: 2, reason: "degismedi" });
  });

  // Denetim sırasında düzeltme yapılırsa yeni tur açılır.
  it("denetim turunda iş değişirse yeniden reddedilir", async () => {
    const g = gate();
    await g.attempt(FP);
    expect(await g.attempt(FP2)).toEqual({ accepted: false, round: 2, reason: "degisti" });
  });

  it("değişiklikten sonra sabit kalan tur geçer", async () => {
    const g = gate();
    await g.attempt(FP);
    await g.attempt(FP2);
    expect(await g.attempt(FP2)).toEqual({ accepted: true, round: 3, reason: "degismedi" });
  });

  it("tur sayacı görev boyunca birikir", async () => {
    const g = gate();
    await g.attempt(FP); await g.attempt(FP2); await g.attempt(FP);
    expect((await g.attempt(FP)).round).toBe(4);
  });

  it("durum ayrı bir örnekten de okunur — süreç yeniden başlasa da tur kaybolmaz", async () => {
    await gate().attempt(FP);
    expect(await new AuditGate(statePath).attempt(FP)).toMatchObject({ accepted: true, round: 2 });
  });

  // İki ajan aynı anda denerse ikisi de "ilk deneme" görüp tur kaybetmemeli.
  it("eşzamanlı denemelerde turlar kaybolmaz", async () => {
    const g = gate();
    const [a, b] = await Promise.all([g.attempt(FP), g.attempt(FP)]);
    expect([a.round, b.round].sort()).toEqual([1, 2]);
    expect([a.accepted, b.accepted].filter(Boolean)).toHaveLength(1);
  });

  it("bozuk durum dosyası kapıyı kilitlemez, ilk denemeden başlar", async () => {
    await new AuditGate(statePath).attempt(FP);
    await writeFile(statePath, "{bozuk");
    expect(await gate().attempt(FP)).toMatchObject({ reason: "ilk-deneme", accepted: false });
  });

  it("durum dosyası her zaman geçerli JSON — atomik yazma", async () => {
    const g = gate();
    await g.attempt(FP);
    expect(JSON.parse(await readFile(statePath, "utf8"))).toMatchObject({ rounds: 1 });
  });

  // Sahibi ölmüş bir kilit kapıyı sonsuza kadar kapalı tutmamalı.
  it("bayat kilidi devralır", async () => {
    await new AuditGate(statePath).attempt(FP);
    await writeFile(`${statePath}.lock`, "");
    const g = new AuditGate(statePath, { staleLockMs: 0, lockTimeoutMs: 200 });
    expect(await g.attempt(FP)).toMatchObject({ accepted: true });
  });

  it("taze kilit süresi dolunca anlamlı hata verir", async () => {
    await new AuditGate(statePath).attempt(FP);
    await writeFile(`${statePath}.lock`, "");
    const g = new AuditGate(statePath, { staleLockMs: 60_000, lockTimeoutMs: 100 });
    await expect(g.attempt(FP)).rejects.toThrow(/kilidi alınamadı/);
  });
});
