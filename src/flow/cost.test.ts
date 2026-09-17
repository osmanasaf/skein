import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { knownProviderSet } from "../adapters/factory.js";
import { loadFlow } from "./load.js";
import { estimateCost } from "./cost.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const opts = { root: repoRoot, providers: knownProviderSet() };

const load = (name: string) => loadFlow(join(repoRoot, "hub", "flows", `${name}.yaml`), opts);

describe("estimateCost", () => {
  // Bu sayılar SCHEMA.md'nin maliyet tablosunda ve akış dosyalarının
  // yorumlarında yazılı. Test, belgeyle kodun ayrışmasını engelliyor.
  it("daily: ~2 temel, 2 ret limitiyle ~6", async () => {
    const cost = estimateCost(await load("daily"));
    expect(cost.base).toBe(2);
    expect(cost.worst).toBe(6);
    expect(cost.rejectEdges).toEqual([{ from: "reviewer", to: "coder", segment: 2 }]);
  });

  // Bu sayı canlı koşuyla doğrulandı: 4 rollü `spec`, `audit.enabled: true`
  // ve 3 syncBack alıcısıyla koştu ve TAM 4 ajan çağırdı. Eski model 11
  // diyordu — uygulanmayan audit turlarını ve git kopyalarını sayıyordu.
  it("spec: ~4 temel, ÜÇ ret kenarıyla ~18", async () => {
    const cost = estimateCost(await load("spec"));
    expect(cost.base).toBe(4);
    expect(cost.worst).toBe(18);
    // coder'ın analyst'e dönüşü akışta YAZILI DEĞİL — varsayılan hedef
    // gönderen olduğu için zincirin başı dışındaki her rol bir ret kenarıdır.
    // Yalnızca açıkça yazılmış kenarları saymak maliyeti olduğundan küçük
    // gösteriyordu.
    expect(cost.rejectEdges).toEqual([
      { from: "coder", to: "analyst", segment: 2 },
      { from: "reviewer", to: "coder", segment: 2 },
      { from: "guard", to: "coder", segment: 3 },
    ]);
  });

  // Audit kapısı gözcüde uygulanmadığı sürece `audit.enabled` maliyeti
  // değiştirmemeli: tahmin, tasarımın niyetini değil kodun yaptığını anlatır.
  it("audit bayrağı bugün maliyeti değiştirmez", async () => {
    const flow = await load("daily");
    const acik = estimateCost({ ...flow, audit: { ...flow.audit, enabled: true } });
    const kapali = estimateCost({ ...flow, audit: { ...flow.audit, enabled: false } });
    expect(acik.perRole).toBe(1);
    expect(acik.base).toBe(kapali.base);
  });

  // syncBack bir git birleştirmesi; ajan çağrısı değil. `daily`'nin bir
  // alıcısı var ve temel yine rol sayısına eşit.
  it("syncBack alıcısı maliyete girmez", async () => {
    const cost = estimateCost(await load("daily"));
    expect(cost.syncBacks).toBe(1);
    expect(cost.base).toBe(2);
  });

  it("ret limiti büyüdükçe en kötü durum büyür, temel sabit kalır", async () => {
    const flow = await load("daily");
    const cheap = estimateCost({ ...flow, reject: { ...flow.reject, limit: 1 } });
    const dear = estimateCost({ ...flow, reject: { ...flow.reject, limit: 4 } });
    expect(cheap.base).toBe(dear.base);
    expect(cheap.worst).toBe(4);
    expect(dear.worst).toBe(10);
  });
});
