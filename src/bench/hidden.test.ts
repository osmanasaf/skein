import { describe, expect, it } from "vitest";
import { parseHooks } from "./hidden.js";

const report = (tests: [string, string][]) =>
  JSON.stringify({ testResults: [{ assertionResults: tests.map(([title, status]) => ({ title, status })) }] });

describe("parseHooks", () => {
  it("yeşil ve kırmızı kancaları ayırır", () => {
    const hooks = parseHooks(report([["a", "passed"], ["b", "failed"]]));
    expect(hooks).toEqual([{ title: "a", passed: true }, { title: "b", passed: false }]);
  });

  it("JSON öncesi gürültüyü atlar", () => {
    expect(parseHooks(`RUN v2\n${report([["a", "passed"]])}`)).toHaveLength(1);
  });

  it("passed olmayan her durumu kırmızı sayar", () => {
    expect(parseHooks(report([["a", "skipped"]]))[0]?.passed).toBe(false);
  });

  it("bozuk çıktıda boş liste döner, atmaz", () => {
    expect(parseHooks("çöp")).toEqual([]);
    expect(parseHooks("")).toEqual([]);
    expect(parseHooks("{bozuk")).toEqual([]);
  });

  // Artefakt derlenmiyorsa vitest süiti çökertir ve sıfır kanca bildirir.
  // Bunu "sıfır kırmızı" saymak, kusursuz bir çözümle karıştırmak olurdu.
  it("süit çöktüğünde sıfır kanca döner — ran=false'un dayanağı", () => {
    expect(parseHooks(JSON.stringify({ testResults: [{ assertionResults: [] }] }))).toEqual([]);
  });
});
