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
  it("daily: ~5 temel, 2 ret limitiyle ~13", async () => {
    const cost = estimateCost(await load("daily"));
    expect(cost.base).toBe(5);
    expect(cost.worst).toBe(13);
    expect(cost.rejectEdges).toEqual([{ from: "reviewer", to: "coder", segment: 4 }]);
  });

  it("spec: ~11 temel, ÜÇ ret kenarıyla ~39", async () => {
    const cost = estimateCost(await load("spec"));
    expect(cost.base).toBe(11);
    expect(cost.worst).toBe(39);
    // coder'ın analyst'e dönüşü akışta YAZILI DEĞİL — varsayılan hedef
    // gönderen olduğu için zincirin başı dışındaki her rol bir ret kenarıdır.
    // Yalnızca açıkça yazılmış kenarları saymak maliyeti olduğundan küçük
    // gösteriyordu.
    expect(cost.rejectEdges).toEqual([
      { from: "coder", to: "analyst", segment: 4 },
      { from: "reviewer", to: "coder", segment: 4 },
      { from: "guard", to: "coder", segment: 6 },
    ]);
  });

  it("audit kapalıysa rol başına tek aktivasyon sayılır", async () => {
    const flow = await load("daily");
    const cost = estimateCost({ ...flow, audit: { ...flow.audit, enabled: false } });
    expect(cost.perRole).toBe(1);
    expect(cost.base).toBe(3);
  });

  it("ret limiti büyüdükçe en kötü durum büyür, temel sabit kalır", async () => {
    const flow = await load("daily");
    const cheap = estimateCost({ ...flow, reject: { ...flow.reject, limit: 1 } });
    const dear = estimateCost({ ...flow, reject: { ...flow.reject, limit: 4 } });
    expect(cheap.base).toBe(dear.base);
    expect(cheap.worst).toBe(9);
    expect(dear.worst).toBe(21);
  });
});
